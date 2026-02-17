"""Google OR-Tools VRP solver for single-vehicle route optimization with time windows."""

import logging
from ortools.constraint_solver import routing_enums_pb2, pywrapcp

from .models import OptimizeRequest, OptimizeResponse

logger = logging.getLogger(__name__)

# Default service time per visit (10 minutes) if not provided
DEFAULT_SERVICE_TIME = 600

# Large penalty for dropping a visit – the solver will avoid it unless infeasible
DROP_PENALTY = 100_000_000


def _build_data_model(request: OptimizeRequest) -> dict:
    """Convert the API request into an OR-Tools data model dict."""
    num_nodes = len(request.distance_matrix)

    # Fill service times with defaults if not provided or incomplete
    service_times = list(request.service_times) if request.service_times else []
    while len(service_times) < num_nodes:
        # Depot (index 0) gets 0, visits get DEFAULT_SERVICE_TIME
        service_times.append(0 if len(service_times) == 0 else DEFAULT_SERVICE_TIME)

    # Fill time windows — None means unconstrained
    time_windows = list(request.time_windows) if request.time_windows else []
    while len(time_windows) < num_nodes:
        time_windows.append(None)

    # Compute a safe upper-bound horizon for unconstrained windows
    max_travel = max(max(row) for row in request.time_matrix) if request.time_matrix else 0
    total_travel = sum(max(row) for row in request.time_matrix)
    total_service = sum(service_times)
    travel_horizon = total_travel + total_service + max_travel

    # Include the latest time window endpoint so the horizon covers them
    max_tw = 0
    for tw in time_windows:
        if tw is not None:
            max_tw = max(max_tw, tw.earliest, tw.latest)
    # Add generous buffer after the latest time window
    tw_horizon = max_tw + total_travel + total_service + 3600 if max_tw else 0

    horizon = (
        request.max_route_duration
        if request.max_route_duration
        else max(travel_horizon, tw_horizon, max_tw + 3600)
    )

    return {
        "distance_matrix": request.distance_matrix,
        "time_matrix": request.time_matrix,
        "time_windows": time_windows,
        "service_times": service_times,
        "num_vehicles": request.num_vehicles,
        "depot": request.depot,
        "horizon": horizon,
    }


def solve(request: OptimizeRequest) -> OptimizeResponse:
    """Run the VRP solver and return the optimized route."""
    data = _build_data_model(request)
    num_nodes = len(data["distance_matrix"])

    # Edge case: 0 or 1 visits (just the depot, or depot + 1 stop)
    if num_nodes <= 1:
        return OptimizeResponse(
            visit_order=[],
            total_distance_meters=0,
            total_duration_seconds=0,
            estimated_arrivals=[],
            feasible=True,
            dropped_visits=[],
            solver_status="OPTIMAL",
        )
    if num_nodes == 2:
        return OptimizeResponse(
            visit_order=[1],
            total_distance_meters=data["distance_matrix"][0][1] + data["distance_matrix"][1][0],
            total_duration_seconds=(
                data["time_matrix"][0][1]
                + data["service_times"][1]
                + data["time_matrix"][1][0]
            ),
            estimated_arrivals=[data["time_matrix"][0][1]],
            feasible=True,
            dropped_visits=[],
            solver_status="OPTIMAL",
        )

    # ── Create routing model ─────────────────────────────
    manager = pywrapcp.RoutingIndexManager(
        num_nodes, data["num_vehicles"], data["depot"]
    )
    routing = pywrapcp.RoutingModel(manager)

    # ── Distance callback ────────────────────────────────
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data["distance_matrix"][from_node][to_node]

    distance_cb_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(distance_cb_index)

    # ── Time callback (travel time + service time at origin) ─
    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel = data["time_matrix"][from_node][to_node]
        service = data["service_times"][from_node]
        return travel + service

    time_cb_index = routing.RegisterTransitCallback(time_callback)

    # ── Time dimension ───────────────────────────────────
    horizon = data["horizon"]
    routing.AddDimension(
        time_cb_index,
        horizon,  # max waiting time (allow waiting for time windows)
        horizon,  # max cumulative time per vehicle
        False,    # don't force start cumul to zero (let solver pick departure time)
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")

    # ── Apply time windows to each node ──────────────────
    for node in range(num_nodes):
        index = manager.NodeToIndex(node)
        tw = data["time_windows"][node]
        if tw is not None:
            # Clamp to horizon so SetRange never gets out-of-bounds values
            earliest = min(tw.earliest, horizon)
            latest = min(tw.latest, horizon)
            # Safety: if earliest > latest (bad data), treat as unconstrained
            if earliest > latest:
                logger.warning(
                    f"Node {node}: earliest ({earliest}) > latest ({latest}), "
                    "treating as unconstrained"
                )
                earliest = 0
                latest = horizon
            time_dimension.CumulVar(index).SetRange(earliest, latest)
        else:
            time_dimension.CumulVar(index).SetRange(0, horizon)

    # Depot: start at time 0, end whenever
    depot_idx = routing.Start(0)
    time_dimension.CumulVar(depot_idx).SetRange(0, horizon)

    # ── Allow dropping visits with a penalty ─────────────
    # This makes the solver feasible even when time windows conflict
    for node in range(1, num_nodes):  # skip depot
        routing.AddDisjunction([manager.NodeToIndex(node)], DROP_PENALTY)

    # ── Max route duration constraint ────────────────────
    if request.max_route_duration:
        for vehicle_id in range(data["num_vehicles"]):
            start_idx = routing.Start(vehicle_id)
            end_idx = routing.End(vehicle_id)
            time_dimension.SetSpanUpperBoundForVehicle(
                request.max_route_duration, vehicle_id
            )

    # ── Solver parameters ────────────────────────────────
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.FromSeconds(request.solver_time_limit_seconds)

    # ── Solve ────────────────────────────────────────────
    logger.info(
        f"Solving VRP: {num_nodes} nodes, {data['num_vehicles']} vehicle(s), "
        f"time_limit={request.solver_time_limit_seconds}s"
    )
    solution = routing.SolveWithParameters(search_params)

    if not solution:
        status = routing.status()
        status_map = {
            1: "ROUTING_NOT_SOLVED",
            2: "ROUTING_SUCCESS",
            3: "ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED",
            4: "ROUTING_FAIL",
            5: "ROUTING_FAIL_TIMEOUT",
            6: "ROUTING_INVALID",
            7: "ROUTING_INFEASIBLE",
        }
        solver_status = status_map.get(status, f"UNKNOWN_{status}")
        logger.warning(f"No solution found. Status: {solver_status}")
        return OptimizeResponse(
            visit_order=[],
            total_distance_meters=0,
            total_duration_seconds=0,
            estimated_arrivals=[],
            feasible=False,
            dropped_visits=list(range(1, num_nodes)),
            solver_status="NO_SOLUTION",
        )

    # ── Extract solution ─────────────────────────────────
    visit_order: list[int] = []
    estimated_arrivals: list[int] = []
    dropped_visits: list[int] = []
    total_distance = 0
    total_duration = 0

    # Collect visited nodes
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        next_index = solution.Value(routing.NextVar(index))

        if node != data["depot"]:
            visit_order.append(node)
            arrival_time = solution.Value(time_dimension.CumulVar(index))
            estimated_arrivals.append(arrival_time)

        if not routing.IsEnd(next_index):
            from_node = manager.IndexToNode(index)
            to_node = manager.IndexToNode(next_index)
            total_distance += data["distance_matrix"][from_node][to_node]

        index = next_index

    # Add return-to-depot distance
    last_node = manager.IndexToNode(solution.Value(routing.NextVar(routing.Start(0))))
    # Total duration from the time dimension
    end_idx = routing.End(0)
    total_duration = solution.Value(time_dimension.CumulVar(end_idx))

    # Find dropped visits
    all_visit_nodes = set(range(1, num_nodes))
    visited_nodes = set(visit_order)
    dropped_visits = sorted(all_visit_nodes - visited_nodes)

    feasible = len(dropped_visits) == 0

    # Determine solver status
    status = routing.status()
    if status == 1:
        solver_status = "OPTIMAL"
    elif status in (2, 3):
        solver_status = "FEASIBLE"
    else:
        solver_status = "FEASIBLE"

    logger.info(
        f"Solution found: {len(visit_order)} visits, "
        f"distance={total_distance}m, duration={total_duration}s, "
        f"dropped={len(dropped_visits)}, status={solver_status}"
    )

    return OptimizeResponse(
        visit_order=visit_order,
        total_distance_meters=total_distance,
        total_duration_seconds=total_duration,
        estimated_arrivals=estimated_arrivals,
        feasible=feasible,
        dropped_visits=dropped_visits,
        solver_status=solver_status,
    )
