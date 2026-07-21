"""XGBoost investment score predictor."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np

from services.heuristic_scoring import clamp_score, feature_vector
from services.registry import MODELS_DIR, get_model_entry, is_model_deployed

_model_cache: Any | None = None


def _model_path() -> Path:
    entry = get_model_entry("investment-scoring") or {}
    filename = entry.get("artifact") or "investment-v1.joblib"
    return MODELS_DIR / filename


def load_model():
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    path = _model_path()
    if not path.is_file():
        return None
    _model_cache = joblib.load(path)
    return _model_cache


def predict_investment_score(features: dict[str, Any]) -> tuple[int, float]:
    model = load_model()
    if model is None:
        raise RuntimeError("investment model artifact not found")

    vector = np.array([feature_vector(features)], dtype=np.float32)
    raw = float(model.predict(vector)[0])
    entry = get_model_entry("investment-scoring") or {}
    confidence = float(entry.get("confidence") or 0.85)
    return clamp_score(raw), confidence


def can_use_ml(row_count: int) -> bool:
    if not is_model_deployed():
        return False
    if row_count < min_rows_threshold():
        return False
    return load_model() is not None
