from fastapi import APIRouter

from schemas import MLResponse, ScoreLocationRequest

router = APIRouter(prefix="/score", tags=["score"])


@router.post("/dummy", response_model=MLResponse)
def score_dummy(payload: ScoreLocationRequest):
    """Stub scorer — validates the ML contract before real models ship."""
    return MLResponse(
        method="heuristic",
        confidence=1.0,
        model_version="stub-v0",
        result={
            "lat": payload.lat,
            "lng": payload.lng,
            "sector": payload.sector,
            "note": "stub scorer — production scores computed by Node fallback until Week 14",
        },
    )
