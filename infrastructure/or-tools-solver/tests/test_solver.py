"""Tests for the OR-Tools VRP solver."""

import pytest
from app.models import OptimizeRequest, TimeWindow
from app.solver import solve


def test_empty_route():
    """A single-node (depot only) matrix should return empty order."""
    request = OptimizeRequest(
        distance_matrix=[[0]],
        time_matrix=[[0]],
    )
    result = solve(request)
    assert result.visit_order == []
    assert result.total_distance_meters == 0
    assert result.feasible is True
    assert result.solver_status == "OPTIMAL"


def test_single_visit():
    """Depot + 1 visit should return that visit."""
    request = OptimizeRequest(
        distance_matrix=[
            [0, 1000],
            [1000, 0],
        ],
        time_matrix=[
            [0, 300],
            [300, 0],
        ],
    )
    result = solve(request)
    assert result.visit_order == [1]
    assert result.total_distance_meters == 2000  # out + back
    assert result.feasible is True


def test_three_visits_optimal_order():
    """3 visits in a line: depot → A → B → C should be optimal
    when distances form a clear sequential path.

    Layout:
      Depot --100m-- A --100m-- B --100m-- C

    Direct distances are shorter sequentially.
    """
    # Distances: depot=0, A=1, B=2, C=3
    # Sequential: 0→1→2→3 = 100+100+100 = 300m
    # Other orders would be longer since we add cross-distances
    request = OptimizeRequest(
        distance_matrix=[
            #  D     A     B     C
            [  0,  100,  200,  300],  # D
            [100,    0,  100,  200],  # A
            [200,  100,    0,  100],  # B
            [300,  200,  100,    0],  # C
        ],
        time_matrix=[
            #  D     A     B     C
            [  0,   60,  120,  180],  # D
            [ 60,    0,   60,  120],  # A
            [120,   60,    0,   60],  # B
            [180,  120,   60,    0],  # C
        ],
        service_times=[0, 300, 300, 300],  # 5 min per stop
    )
    result = solve(request)

    assert len(result.visit_order) == 3
    assert result.feasible is True
    assert result.solver_status in ("OPTIMAL", "FEASIBLE")

    # The optimal order for a linear path should be 1→2→3 or 3→2→1
    # Both have the same total distance (300 forward + 300 back = 600)
    assert result.visit_order == [1, 2, 3] or result.visit_order == [3, 2, 1]


def test_time_windows_respected():
    """Visits with non-overlapping time windows should be sequenced
    to respect those windows."""
    # Visit A: must arrive between 0-3600s (first hour)
    # Visit B: must arrive between 3600-7200s (second hour)
    # Visit C: must arrive between 7200-10800s (third hour)
    request = OptimizeRequest(
        distance_matrix=[
            [0, 1000, 1000, 1000],
            [1000, 0, 500, 1500],
            [1000, 500, 0, 500],
            [1000, 1500, 500, 0],
        ],
        time_matrix=[
            [0, 600, 600, 600],
            [600, 0, 300, 900],
            [600, 300, 0, 300],
            [600, 900, 300, 0],
        ],
        time_windows=[
            None,  # depot: no constraint
            TimeWindow(earliest=0, latest=3600),
            TimeWindow(earliest=3600, latest=7200),
            TimeWindow(earliest=7200, latest=10800),
        ],
        service_times=[0, 600, 600, 600],  # 10 min per stop
    )
    result = solve(request)

    assert result.feasible is True
    assert len(result.visit_order) == 3
    # A must come first (window 0-3600), B second, C third
    assert result.visit_order == [1, 2, 3]


def test_infeasible_time_windows_drops_visits():
    """When time windows are impossible to satisfy, the solver
    should drop visits and report them."""
    # Two visits both requiring arrival at time 0 but 10 min apart
    request = OptimizeRequest(
        distance_matrix=[
            [0, 5000, 5000],
            [5000, 0, 10000],
            [5000, 10000, 0],
        ],
        time_matrix=[
            [0, 3600, 3600],  # 1 hour to each from depot
            [3600, 0, 7200],
            [3600, 7200, 0],
        ],
        time_windows=[
            None,
            TimeWindow(earliest=0, latest=100),    # must arrive within 100s
            TimeWindow(earliest=0, latest=100),    # must arrive within 100s
        ],
        service_times=[0, 600, 600],
    )
    result = solve(request)

    # At least one visit should be dropped since both can't be reached in 100s
    assert len(result.dropped_visits) >= 1
    assert result.feasible is False


def test_five_stops_returns_all():
    """A 5-stop route with no time windows should visit all stops."""
    n = 6  # depot + 5 visits
    # Simple symmetric distance matrix
    distance_matrix = [[abs(i - j) * 100 for j in range(n)] for i in range(n)]
    time_matrix = [[abs(i - j) * 60 for j in range(n)] for i in range(n)]

    request = OptimizeRequest(
        distance_matrix=distance_matrix,
        time_matrix=time_matrix,
        service_times=[0] + [300] * 5,
    )
    result = solve(request)

    assert len(result.visit_order) == 5
    assert set(result.visit_order) == {1, 2, 3, 4, 5}
    assert result.feasible is True
    assert result.total_distance_meters > 0
    assert result.total_duration_seconds > 0
    assert len(result.estimated_arrivals) == 5


def test_solver_status_values():
    """Solver status should be one of the expected values."""
    request = OptimizeRequest(
        distance_matrix=[[0, 100], [100, 0]],
        time_matrix=[[0, 60], [60, 0]],
    )
    result = solve(request)
    assert result.solver_status in ("OPTIMAL", "FEASIBLE", "NO_SOLUTION", "TIMEOUT", "MANUAL")
