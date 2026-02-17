import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from './entities/route.entity';
import { PlannedVisit } from '../visits/entities/planned-visit.entity';
import { RoutesService } from './routes.service';
import { VisitsService } from '../visits/visits.service';
import { CustomerCacheService } from '../customers/customer-cache.service';
import { ReorderVisitsDto } from './dto/route-optimizer.dto';

// ── OSRM response types ──────────────────────────────────────
interface OsrmTableResponse {
  code: string;
  durations: number[][];  // seconds
  distances: number[][];  // meters
}

interface OsrmRouteResponse {
  code: string;
  routes: Array<{
    geometry: string;
    distance: number;
    duration: number;
  }>;
}

// ── OR-Tools request/response types ──────────────────────────
interface OrToolsTimeWindow {
  earliest: number;
  latest: number;
}

interface OrToolsOptimizeRequest {
  distance_matrix: number[][];
  time_matrix: number[][];
  time_windows: (OrToolsTimeWindow | null)[];
  service_times: number[];
  depot: number;
  num_vehicles: number;
  max_route_duration: number | null;
  solver_time_limit_seconds: number;
}

interface OrToolsOptimizeResponse {
  visit_order: number[];
  total_distance_meters: number;
  total_duration_seconds: number;
  estimated_arrivals: number[];
  feasible: boolean;
  dropped_visits: number[];
  solver_status: string;
}

// ── Optimization result returned to the controller ───────────
export interface OptimizationResult {
  routeId: string;
  visitOrder: Array<{
    visitId: string;
    sequenceNumber: number;
    customerId: number;
    estimatedArrivalSeconds: number;
    estimatedTravelSeconds: number;
    estimatedDistanceMeters: number;
  }>;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  feasible: boolean;
  droppedVisits: string[];  // visit IDs
  solverStatus: string;
  optimizationMethod: string;
}

@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);
  private readonly osrmUrl: string;
  private readonly orToolsUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly routesService: RoutesService,
    @Inject(forwardRef(() => VisitsService))
    private readonly visitsService: VisitsService,
    private readonly customerCache: CustomerCacheService,
    @InjectRepository(PlannedVisit, 'cacheDb')
    private readonly visitRepo: Repository<PlannedVisit>,
    @InjectRepository(Route, 'cacheDb')
    private readonly routeRepo: Repository<Route>,
  ) {
    this.osrmUrl = this.configService.get<string>('optimization.osrmUrl', 'http://localhost:5000');
    this.orToolsUrl = this.configService.get<string>('optimization.orToolsUrl', 'http://localhost:5002');
  }

  /**
   * Full route optimization pipeline:
   * 1. Fetch route + visits + customer locations
   * 2. Get driver's current position (depot)
   * 3. Call OSRM for distance/time matrices
   * 4. Call OR-Tools solver for optimal sequence
   * 5. Update visit sequence_numbers and ETAs in DB
   */
  async optimizeRoute(routeId: string): Promise<OptimizationResult> {
    this.logger.log(`Starting optimization for route ${routeId}`);

    // ── 1. Fetch route and its visits ────────────────────
    const route = await this.routesService.findById(routeId);
    const visits = await this.visitsService.findByRoute(routeId);

    if (visits.length === 0) {
      throw new BadRequestException('Route has no visits to optimize');
    }

    // Only optimize pending/en_route visits
    const optimizableVisits = visits.filter(
      (v) => v.status === 'pending' || v.status === 'en_route',
    );

    if (optimizableVisits.length === 0) {
      throw new BadRequestException('No pending visits to optimize');
    }

    // ── 2. Fetch customer locations ─────────────────────
    const customerLocations = await this.getCustomerLocations(optimizableVisits);

    // ── 3. Get driver start position (depot) ────────────
    const depot = await this.getDriverPosition(route.driverId);

    // ── 4. Build coordinate array: [depot, ...visits] ───
    const coordinates: Array<{ lat: number; lon: number }> = [
      depot,
      ...optimizableVisits.map((v) => {
        const loc = customerLocations.get(v.customerId);
        return { lat: loc!.lat, lon: loc!.lon };
      }),
    ];

    // ── 5. Get OSRM distance/time matrices ──────────────
    const { distanceMatrix, timeMatrix } = await this.getOsrmMatrices(coordinates);

    // ── 6. Build time windows ───────────────────────────
    const timeWindows = this.buildTimeWindows(optimizableVisits, route.scheduledDate);

    // ── 7. Build service times ──────────────────────────
    const serviceTimes = [0, ...optimizableVisits.map(() => 600)]; // 10 min per stop

    // ── 8. Call OR-Tools solver ──────────────────────────
    const solverResult = await this.callOrToolsSolver({
      distance_matrix: distanceMatrix,
      time_matrix: timeMatrix,
      time_windows: timeWindows,
      service_times: serviceTimes,
      depot: 0,
      num_vehicles: 1,
      max_route_duration: null,  // no limit for now
      solver_time_limit_seconds: 5,
    });

    // ── 9. Map results back to visits and persist ───────
    const result = await this.applyOptimizationResult(
      route,
      optimizableVisits,
      solverResult,
      timeMatrix,
      distanceMatrix,
    );

    this.logger.log(
      `Route ${routeId} optimized: ${result.visitOrder.length} visits, ` +
      `${result.totalDistanceMeters}m, ${result.totalDurationSeconds}s, ` +
      `status=${result.solverStatus}`,
    );

    return result;
  }

  /**
   * Manual reorder: accepts a new sequence from drag-and-drop UI
   * and recalculates ETAs using OSRM.
   */
  async reorderVisits(
    routeId: string,
    dto: ReorderVisitsDto,
  ): Promise<OptimizationResult> {
    this.logger.log(`Manual reorder for route ${routeId}: ${dto.visits.length} visits`);

    const route = await this.routesService.findById(routeId);

    // Validate all visit IDs belong to this route
    const routeVisits = await this.visitsService.findByRoute(routeId);
    const routeVisitIds = new Set(routeVisits.map((v) => v.id));

    for (const item of dto.visits) {
      if (!routeVisitIds.has(item.visitId)) {
        throw new BadRequestException(
          `Visit ${item.visitId} does not belong to route ${routeId}`,
        );
      }
    }

    // Update sequence numbers
    for (const item of dto.visits) {
      await this.visitRepo.update(item.visitId, {
        sequenceNumber: item.sequenceNumber,
      });
    }

    // Recalculate ETAs with the new order
    const reorderedVisits = await this.visitsService.findByRoute(routeId);
    const pendingVisits = reorderedVisits.filter(
      (v) => v.status === 'pending' || v.status === 'en_route',
    );

    if (pendingVisits.length === 0) {
      return {
        routeId,
        visitOrder: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        feasible: true,
        droppedVisits: [],
        solverStatus: 'MANUAL',
        optimizationMethod: 'manual',
      };
    }

    // Get locations and compute ETAs
    const customerLocations = await this.getCustomerLocations(pendingVisits);
    const depot = await this.getDriverPosition(route.driverId);

    const coordinates: Array<{ lat: number; lon: number }> = [
      depot,
      ...pendingVisits.map((v) => {
        const loc = customerLocations.get(v.customerId);
        return { lat: loc!.lat, lon: loc!.lon };
      }),
    ];

    const { distanceMatrix, timeMatrix } = await this.getOsrmMatrices(coordinates);

    // Calculate sequential ETAs for the manual order
    let cumulativeTime = 0;
    let totalDistance = 0;
    const visitOrder: OptimizationResult['visitOrder'] = [];

    for (let i = 0; i < pendingVisits.length; i++) {
      const fromIdx = i; // 0 = depot, then sequential
      const toIdx = i + 1;
      const travelTime = timeMatrix[fromIdx][toIdx];
      const travelDist = distanceMatrix[fromIdx][toIdx];
      cumulativeTime += travelTime;
      totalDistance += travelDist;

      visitOrder.push({
        visitId: pendingVisits[i].id,
        sequenceNumber: i + 1,
        customerId: pendingVisits[i].customerId,
        estimatedArrivalSeconds: cumulativeTime,
        estimatedTravelSeconds: travelTime,
        estimatedDistanceMeters: travelDist,
      });

      // Add service time
      cumulativeTime += 600;

      // Update visit with ETA data
      const scheduledDate = new Date(route.scheduledDate);
      const arrivalTime = new Date(scheduledDate.getTime() + cumulativeTime * 1000);

      await this.visitRepo.update(pendingVisits[i].id, {
        estimatedArrivalTime: arrivalTime,
        estimatedTravelSeconds: travelTime,
        estimatedDistanceMeters: travelDist,
      });
    }

    // Update route metadata
    await this.routeRepo.update(routeId, {
      totalDistanceMeters: totalDistance,
      totalEstimatedSeconds: cumulativeTime,
      optimizedAt: new Date(),
      optimizationMethod: 'manual',
    });

    return {
      routeId,
      visitOrder,
      totalDistanceMeters: totalDistance,
      totalDurationSeconds: cumulativeTime,
      feasible: true,
      droppedVisits: [],
      solverStatus: 'MANUAL',
      optimizationMethod: 'manual',
    };
  }

  // ══════════════════════════════════════════════════════════
  //  Private helpers
  // ══════════════════════════════════════════════════════════

  /**
   * Fetch customer lat/lon for each visit's customer_id
   */
  private async getCustomerLocations(
    visits: PlannedVisit[],
  ): Promise<Map<number, { lat: number; lon: number }>> {
    const locations = new Map<number, { lat: number; lon: number }>();

    for (const visit of visits) {
      if (locations.has(visit.customerId)) continue;
      const customer = await this.customerCache.getById(visit.customerId);
      if (!customer || customer.latitude == null || customer.longitude == null) {
        throw new BadRequestException(
          `Customer ${visit.customerId} not found or has no coordinates`,
        );
      }
      locations.set(visit.customerId, {
        lat: customer.latitude,
        lon: customer.longitude,
      });
    }

    return locations;
  }

  /**
   * Get the driver's current position from cache-db.
   * Falls back to the first customer's location if position is unknown.
   */
  private async getDriverPosition(
    driverId: string,
  ): Promise<{ lat: number; lon: number }> {
    const result = await this.routeRepo.query(
      `SELECT latitude, longitude FROM driver_positions WHERE driver_id = $1`,
      [driverId],
    );

    if (result.length > 0 && result[0].latitude && result[0].longitude) {
      return {
        lat: parseFloat(result[0].latitude),
        lon: parseFloat(result[0].longitude),
      };
    }

    // Fallback: La Paz city center
    this.logger.warn(
      `No position found for driver ${driverId}, using La Paz center as depot`,
    );
    return { lat: -16.5, lon: -68.15 };
  }

  /**
   * Call OSRM /table endpoint to get NxN distance and duration matrices
   */
  private async getOsrmMatrices(
    coordinates: Array<{ lat: number; lon: number }>,
  ): Promise<{ distanceMatrix: number[][]; timeMatrix: number[][] }> {
    const coordStr = coordinates.map((c) => `${c.lon},${c.lat}`).join(';');
    const url = `${this.osrmUrl}/table/v1/driving/${coordStr}?annotations=distance,duration`;

    this.logger.debug(`Calling OSRM: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OSRM returned ${response.status}: ${await response.text()}`);
      }

      const data: OsrmTableResponse = await response.json();

      if (data.code !== 'Ok') {
        throw new Error(`OSRM error: ${data.code}`);
      }

      // Round to integers (meters and seconds)
      const distanceMatrix = data.distances.map((row) =>
        row.map((d) => Math.round(d)),
      );
      const timeMatrix = data.durations.map((row) =>
        row.map((d) => Math.round(d)),
      );

      return { distanceMatrix, timeMatrix };
    } catch (error) {
      this.logger.error('OSRM request failed', error);
      throw new InternalServerErrorException(
        'Failed to get routing data from OSRM. Is the OSRM service running?',
      );
    }
  }

  /**
   * Convert visit time windows (TIME strings like "09:00:00") to
   * seconds-from-midnight for the solver.
   */
  private buildTimeWindows(
    visits: PlannedVisit[],
    scheduledDate: string,
  ): (OrToolsTimeWindow | null)[] {
    // Depot: no constraint
    const windows: (OrToolsTimeWindow | null)[] = [null];

    for (const visit of visits) {
      if (visit.timeWindowStart && visit.timeWindowEnd) {
        const earliest = this.timeStringToSeconds(visit.timeWindowStart);
        let latest = this.timeStringToSeconds(visit.timeWindowEnd);

        // Handle overnight wrap (e.g., start=23:49, end=12:50)
        if (latest < earliest) {
          // Treat as unconstrained — the window definition is invalid
          this.logger.warn(
            `Visit ${visit.id} has invalid time window (end before start): ` +
            `${visit.timeWindowStart}–${visit.timeWindowEnd}, treating as unconstrained`,
          );
          windows.push(null);
        } else {
          windows.push({ earliest, latest });
        }
      } else {
        windows.push(null); // unconstrained
      }
    }

    return windows;
  }

  /**
   * Convert "HH:MM:SS" to seconds from midnight.
   */
  private timeStringToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }

  /**
   * Call the OR-Tools solver sidecar
   */
  private async callOrToolsSolver(
    request: OrToolsOptimizeRequest,
  ): Promise<OrToolsOptimizeResponse> {
    const url = `${this.orToolsUrl}/optimize`;

    this.logger.debug(
      `Calling OR-Tools: ${request.distance_matrix.length} nodes`,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OR-Tools returned ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('OR-Tools solver request failed', error);
      throw new InternalServerErrorException(
        'Failed to optimize route. Is the OR-Tools solver service running?',
      );
    }
  }

  /**
   * Get the OSRM driving geometry for the route (depot → visits in order).
   * Returns an encoded polyline (Google format) and the depot position.
   */
  async getRouteGeometry(routeId: string): Promise<{
    geometry: string;
    depot: { lat: number; lon: number };
    totalDistanceMeters: number;
    totalDurationSeconds: number;
  }> {
    const route = await this.routesService.findById(routeId);
    const visits = await this.visitsService.findByRoute(routeId);

    const pendingVisits = visits
      .filter((v) => v.status !== 'cancelled')
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (pendingVisits.length === 0) {
      throw new BadRequestException('Route has no visits');
    }

    const customerLocations = await this.getCustomerLocations(pendingVisits);
    const depot = await this.getDriverPosition(route.driverId);

    // Build waypoints: depot → visit1 → visit2 → ...
    const coordinates: Array<{ lat: number; lon: number }> = [
      depot,
      ...pendingVisits.map((v) => {
        const loc = customerLocations.get(v.customerId);
        return { lat: loc!.lat, lon: loc!.lon };
      }),
    ];

    const coordStr = coordinates.map((c) => `${c.lon},${c.lat}`).join(';');
    const url = `${this.osrmUrl}/route/v1/driving/${coordStr}?overview=full&geometries=polyline`;

    this.logger.debug(`Calling OSRM route: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OSRM returned ${response.status}: ${await response.text()}`);
      }

      const data: OsrmRouteResponse = await response.json();

      if (data.code !== 'Ok' || !data.routes.length) {
        throw new Error(`OSRM route error: ${data.code}`);
      }

      const osrmRoute = data.routes[0];

      return {
        geometry: osrmRoute.geometry,
        depot,
        totalDistanceMeters: Math.round(osrmRoute.distance),
        totalDurationSeconds: Math.round(osrmRoute.duration),
      };
    } catch (error) {
      this.logger.error('OSRM route request failed', error);
      throw new InternalServerErrorException(
        'Failed to get route geometry from OSRM.',
      );
    }
  }

  /**
   * Apply solver results: update sequence_numbers and ETAs in the database
   */
  private async applyOptimizationResult(
    route: Route,
    visits: PlannedVisit[],
    solverResult: OrToolsOptimizeResponse,
    timeMatrix: number[][],
    distanceMatrix: number[][],
  ): Promise<OptimizationResult> {
    const scheduledDate = new Date(route.scheduledDate);
    const visitOrder: OptimizationResult['visitOrder'] = [];
    const droppedVisitIds: string[] = [];

    // Map solver node indices back to visits
    // visit_order contains node indices (1-based in the matrix, mapping to visits[idx-1])
    for (let seq = 0; seq < solverResult.visit_order.length; seq++) {
      const nodeIndex = solverResult.visit_order[seq];
      const visitIndex = nodeIndex - 1; // offset by depot
      const visit = visits[visitIndex];

      if (!visit) {
        this.logger.warn(`Solver returned invalid node index: ${nodeIndex}`);
        continue;
      }

      const arrivalSeconds = solverResult.estimated_arrivals[seq] || 0;
      const arrivalTime = new Date(scheduledDate.getTime() + arrivalSeconds * 1000);

      // Calculate per-leg travel time and distance
      const prevNodeIndex = seq === 0 ? 0 : solverResult.visit_order[seq - 1];
      const travelSeconds = timeMatrix[prevNodeIndex][nodeIndex];
      const travelDistance = distanceMatrix[prevNodeIndex][nodeIndex];

      const newSequence = seq + 1;

      // Update visit in DB
      await this.visitRepo.update(visit.id, {
        sequenceNumber: newSequence,
        estimatedArrivalTime: arrivalTime,
        estimatedTravelSeconds: travelSeconds,
        estimatedDistanceMeters: travelDistance,
      });

      visitOrder.push({
        visitId: visit.id,
        sequenceNumber: newSequence,
        customerId: visit.customerId,
        estimatedArrivalSeconds: arrivalSeconds,
        estimatedTravelSeconds: travelSeconds,
        estimatedDistanceMeters: travelDistance,
      });
    }

    // Identify dropped visits
    const optimizedVisitIndices = new Set(
      solverResult.visit_order.map((n) => n - 1),
    );
    for (let i = 0; i < visits.length; i++) {
      if (!optimizedVisitIndices.has(i)) {
        droppedVisitIds.push(visits[i].id);
      }
    }

    // Update route metadata
    await this.routeRepo.update(route.id, {
      totalDistanceMeters: solverResult.total_distance_meters,
      totalEstimatedSeconds: solverResult.total_duration_seconds,
      optimizedAt: new Date(),
      optimizationMethod: 'or_tools_vrp',
    });

    return {
      routeId: route.id,
      visitOrder,
      totalDistanceMeters: solverResult.total_distance_meters,
      totalDurationSeconds: solverResult.total_duration_seconds,
      feasible: solverResult.feasible,
      droppedVisits: droppedVisitIds,
      solverStatus: solverResult.solver_status,
      optimizationMethod: 'or_tools_vrp',
    };
  }
}
