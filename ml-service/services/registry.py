"""Model registry loader and deployment gates."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "models" / "registry.json"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MIN_ROWS_DEFAULT = int(os.getenv("ML_MIN_TRAINING_ROWS", "25"))


def load_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.is_file():
        return {"models": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def save_registry(data: dict[str, Any]) -> None:
    REGISTRY_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_model_entry(name: str) -> dict[str, Any] | None:
    registry = load_registry()
    for entry in registry.get("models", []):
        if entry.get("name") == name:
            return entry
    return None


def is_model_deployed(name: str = "investment-scoring") -> bool:
    entry = get_model_entry(name)
    if not entry:
        return False
    if entry.get("degraded"):
        return False
    status = entry.get("status", "")
    return status == "deployed"


def min_rows_threshold() -> int:
    entry = get_model_entry("investment-scoring")
    if entry and entry.get("min_training_rows"):
        return int(entry["min_training_rows"])
    return MIN_ROWS_DEFAULT
