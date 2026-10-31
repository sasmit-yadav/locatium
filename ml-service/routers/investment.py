from fastapi import APIRouter, HTTPException

from schemas import MLResponse, ScoreLocationRequest
from services.investment_scoring import score_investment

router = APIRouter(prefix="/score", tags=["score"])


@router.post("/investment", response_model=MLResponse)
async def score_investment_endpoint(payload: ScoreLocationRequest):
    try:
        response = await score_investment(payload.lat, payload.lng, payload.sector)
        return MLResponse(**response)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
