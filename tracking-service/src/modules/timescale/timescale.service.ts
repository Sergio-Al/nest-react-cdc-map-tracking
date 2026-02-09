import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

export interface EnrichedPositionRow {
  time: Date;
  driverId: string;
  tenantId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number | null;
  routeId: string | null;
  visitId: string | null;
  customerName: string | null;
  distanceToNextM: number | null;
  etaToNextSec: number | null;
}

export interface VisitCompletionRow {
  time: Date;
  visitId: string;
  tenantId: string;
  driverId: string;
  customerId: number;
  routeId: string | null;
  visitType: string;
  status: string;
  arrivedAt: Date | null;
  completedAt: Date | null;
  durationSec: number | null;
  onTime: boolean;
}

@Injectable()
export class TimescaleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimescaleService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      host: this.config.get<string>('timescale.host'),
      port: this.config.get<number>('timescale.port'),
      database: this.config.get<string>('timescale.database'),
      user: this.config.get<string>('timescale.username'),
      password: this.config.get<string>('timescale.password'),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Verify connection
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log('TimescaleDB pool connected');
    } catch (error) {
      this.logger.error('Failed to connect to TimescaleDB', error);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('TimescaleDB pool closed');
  }

  // ── Write Operations ────────────────────────────────────────

  async insertEnrichedPosition(row: EnrichedPositionRow): Promise<void> {
    const sql = `
      INSERT INTO enriched_positions
        (time, driver_id, tenant_id, latitude, longitude, speed, heading, altitude,
         accuracy, route_id, visit_id, customer_name, distance_to_next_m, eta_to_next_sec)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;
    await this.pool.query(sql, [
      row.time,
      row.driverId,
      row.tenantId,
      row.latitude,
      row.longitude,
      row.speed,
      row.heading,
      row.altitude,
      row.accuracy,
      row.routeId,
      row.visitId,
      row.customerName,
      row.distanceToNextM,
      row.etaToNextSec,
    ]);
  }

  async insertEnrichedPositionBatch(rows: EnrichedPositionRow[]): Promise<void> {
    if (rows.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sql = `
        INSERT INTO enriched_positions
          (time, driver_id, tenant_id, latitude, longitude, speed, heading, altitude,
           accuracy, route_id, visit_id, customer_name, distance_to_next_m, eta_to_next_sec)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;
      for (const row of rows) {
        await client.query(sql, [
          row.time, row.driverId, row.tenantId, row.latitude, row.longitude,
          row.speed, row.heading, row.altitude, row.accuracy,
          row.routeId, row.visitId, row.customerName,
          row.distanceToNextM, row.etaToNextSec,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertVisitCompletion(row: VisitCompletionRow): Promise<void> {
    const sql = `
      INSERT INTO visit_completions
        (time, visit_id, tenant_id, driver_id, customer_id, route_id,
         visit_type, status, arrived_at, completed_at, duration_sec, on_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;
    await this.pool.query(sql, [
      row.time, row.visitId, row.tenantId, row.driverId, row.customerId,
      row.routeId, row.visitType, row.status, row.arrivedAt, row.completedAt,
      row.durationSec, row.onTime,
    ]);
  }

  // ── Read Operations (for route playback, analytics) ─────────

  async getDriverPositionHistory(
    driverId: string,
    from: Date,
    to: Date,
    limit = 5000,
  ): Promise<EnrichedPositionRow[]> {
    const sql = `
      SELECT time, driver_id AS "driverId", tenant_id AS "tenantId",
             latitude, longitude, speed, heading, altitude, accuracy,
             route_id AS "routeId", visit_id AS "visitId",
             customer_name AS "customerName",
             distance_to_next_m AS "distanceToNextM",
             eta_to_next_sec AS "etaToNextSec"
      FROM enriched_positions
      WHERE driver_id = $1 AND time >= $2 AND time <= $3
      ORDER BY time ASC
      LIMIT $4
    `;
    const result = await this.pool.query(sql, [driverId, from, to, limit]);
    return result.rows;
  }

  async getRoutePositionHistory(
    routeId: string,
    from: Date,
    to: Date,
    limit = 10000,
  ): Promise<EnrichedPositionRow[]> {
    const sql = `
      SELECT time, driver_id AS "driverId", tenant_id AS "tenantId",
             latitude, longitude, speed, heading, altitude, accuracy,
             route_id AS "routeId", visit_id AS "visitId",
             customer_name AS "customerName",
             distance_to_next_m AS "distanceToNextM",
             eta_to_next_sec AS "etaToNextSec"
      FROM enriched_positions
      WHERE route_id = $1 AND time >= $2 AND time <= $3
      ORDER BY time ASC
      LIMIT $4
    `;
    const result = await this.pool.query(sql, [routeId, from, to, limit]);
    return result.rows;
  }

  async getDriverDailyStats(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<any[]> {
    const sql = `
      SELECT bucket, driver_id AS "driverId", tenant_id AS "tenantId",
             position_count AS "positionCount",
             avg_speed AS "avgSpeed",
             max_speed AS "maxSpeed",
             moving_ratio AS "movingRatio"
      FROM driver_daily_stats
      WHERE tenant_id = $1 AND bucket >= $2 AND bucket <= $3
      ORDER BY bucket DESC, driver_id
    `;
    const result = await this.pool.query(sql, [tenantId, from, to]);
    return result.rows;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }
}
