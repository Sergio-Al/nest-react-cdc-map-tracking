"""Pydantic models for the OR-Tools VRP solver API."""

from pydantic import BaseModel, Field


class TimeWindow(BaseModel):
    """Time window constraint for a visit node."""

    earliest: int = Field(
        ..., description="Earliest arrival time in seconds from route start"
    )
    latest: int = Field(
        ..., description="Latest arrival time in seconds from route start"
    )


class OptimizeRequest(BaseModel):
    """Request payload for route optimization.

    The matrices are NxN where N = 1 (depot) + number of visits.
    Index 0 is always the depot (driver's current/start position).
    """

    distance_matrix: list[list[int]] = Field(
        ..., description="NxN distance matrix in meters (from OSRM)"
    )
    time_matrix: list[list[int]] = Field(
        ..., description="NxN duration matrix in seconds (from OSRM)"
    )
    time_windows: list[TimeWindow | None] = Field(
        default=[],
        description=(
            "Per-node time windows (seconds from route start). "
            "null entries mean no constraint. Index 0 = depot."
        ),
    )
    service_times: list[int] = Field(
        default=[],
        description=(
            "Seconds spent at each stop (e.g., loading/unloading). "
            "Index 0 = depot (usually 0). Defaults to 600s per visit."
        ),
    )
    depot: int = Field(default=0, description="Index of the depot node (always 0)")
    num_vehicles: int = Field(
        default=1, description="Number of vehicles (always 1 for single-driver routes)"
    )
    max_route_duration: int | None = Field(
        default=None,
        description="Maximum total route duration in seconds (e.g., 28800 = 8 hours)",
    )
    solver_time_limit_seconds: int = Field(
        default=5, description="Maximum time for the solver to run"
    )


class OptimizeResponse(BaseModel):
    """Response payload with the optimized route."""

    visit_order: list[int] = Field(
        ...,
        description=(
            "Node indices in optimized sequence, excluding depot. "
            "These map back to the original visit positions (1-based index in the matrix)."
        ),
    )
    total_distance_meters: int = Field(..., description="Total route distance in meters")
    total_duration_seconds: int = Field(
        ..., description="Total route duration in seconds (including service times)"
    )
    estimated_arrivals: list[int] = Field(
        ...,
        description=(
            "Cumulative seconds from route start for each stop in optimized order"
        ),
    )
    feasible: bool = Field(
        ..., description="Whether all time windows can be met"
    )
    dropped_visits: list[int] = Field(
        default=[],
        description="Indices of visits that couldn't fit within time windows",
    )
    solver_status: str = Field(
        ...,
        description="Solver status: OPTIMAL, FEASIBLE, NO_SOLUTION, or TIMEOUT",
    )
