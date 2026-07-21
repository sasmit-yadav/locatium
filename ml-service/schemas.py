from typing import Any, Literal

from pydantic import BaseModel, Field


class ScoreLocationRequest(BaseModel):
    lat: float
    lng: float
    sector: str = "industrial"


class MLResponse(BaseModel):
    method: Literal["ml", "heuristic"]
    confidence: float = Field(ge=0.0, le=1.0)
    model_version: str
    result: dict[str, Any] = Field(default_factory=dict)
