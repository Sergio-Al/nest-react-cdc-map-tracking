"""OR-Tools VRP Solver — FastAPI application."""

import logging
from fastapi import FastAPI, HTTPException
from .models import OptimizeRequest, OptimizeResponse
from .solver import solve

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OR-Tools VRP Solver",
    description="Single-vehicle route optimization with time windows using Google OR-Tools",
    version="1.0.0",
)


@app.get("/health")
async def health():
    """Health check endpoint for Docker."""
    return {"status": "ok"}


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(request: OptimizeRequest):
    """Optimize a single-vehicle route given distance/time matrices and constraints.

    The matrices are NxN where:
    - Index 0 = depot (driver start position)
    - Indices 1..N-1 = visits to optimize

    Returns the optimal visit order, ETAs, and feasibility status.
    """
    # Validate matrix dimensions
    n = len(request.distance_matrix)
    if n == 0:
        raise HTTPException(status_code=400, detail="distance_matrix cannot be empty")

    if len(request.time_matrix) != n:
        raise HTTPException(
            status_code=400,
            detail=f"time_matrix size ({len(request.time_matrix)}) must match distance_matrix size ({n})",
        )

    for i, row in enumerate(request.distance_matrix):
        if len(row) != n:
            raise HTTPException(
                status_code=400,
                detail=f"distance_matrix row {i} has {len(row)} columns, expected {n}",
            )

    for i, row in enumerate(request.time_matrix):
        if len(row) != n:
            raise HTTPException(
                status_code=400,
                detail=f"time_matrix row {i} has {len(row)} columns, expected {n}",
            )

    if request.time_windows and len(request.time_windows) > n:
        raise HTTPException(
            status_code=400,
            detail=f"time_windows length ({len(request.time_windows)}) exceeds matrix size ({n})",
        )

    if request.service_times and len(request.service_times) > n:
        raise HTTPException(
            status_code=400,
            detail=f"service_times length ({len(request.service_times)}) exceeds matrix size ({n})",
        )

    logger.info(f"Optimizing route: {n} nodes ({n - 1} visits)")

    try:
        result = solve(request)
    except Exception as e:
        logger.exception("Solver failed")
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")

    return result
