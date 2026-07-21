import pytest
from fastapi.testclient import TestClient

from main import app
from schemas import MLResponse

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_version():
    res = client.get("/version")
    assert res.status_code == 200
    body = res.json()
    assert body["service"] == "locatium-ml"
    assert "git_sha" in body


def test_ready():
    res = client.get("/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["registry"] == "ok"


def test_score_dummy_contract():
    res = client.post(
        "/score/dummy",
        json={"lat": 28.45, "lng": 76.9, "sector": "industrial"},
    )
    assert res.status_code == 200
    body = res.json()
    parsed = MLResponse.model_validate(body)
    assert parsed.method == "heuristic"
    assert parsed.confidence == 1.0
    assert parsed.model_version == "stub-v0"
    assert parsed.result["lat"] == 28.45


def test_ml_response_serialization():
    response = MLResponse(
        method="ml",
        confidence=0.87,
        model_version="investment-v1",
        result={"overallScore": 72},
    )
    data = response.model_dump()
    assert data["method"] == "ml"
    assert data["confidence"] == 0.87
    assert data["model_version"] == "investment-v1"
    assert data["result"]["overallScore"] == 72

    heuristic = MLResponse(method="heuristic", confidence=1.0, model_version="heuristic-v1")
    assert heuristic.model_dump()["method"] == "heuristic"
