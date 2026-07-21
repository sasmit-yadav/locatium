import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from routers.dummy import router as dummy_router
from routers.investment import router as investment_router

# Load backend/.env when running locally (DATABASE_URL, ML_* shared with Node)
_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / "backend" / ".env")
load_dotenv(_root / "ml-service" / ".env")

LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("locatium.ml")


def log_event(event: str, **fields):
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, default=str))


app = FastAPI(title="LOCATIUM ML Service", version="0.2.0")
app.include_router(dummy_router)
app.include_router(investment_router)


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    correlation_id = (
        request.headers.get("x-request-id")
        or request.headers.get("x-correlation-id")
        or request.headers.get("x-trace-id")
    )
    response = await call_next(request)
    if correlation_id:
        response.headers["X-Request-Id"] = correlation_id
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


def _registry_path() -> Path:
    return Path(__file__).resolve().parent / "models" / "registry.json"


def _registry_reachable() -> tuple[bool, str]:
    path = _registry_path()
    if not path.is_file():
        return False, "registry_missing"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data.get("models"), list):
            return False, "registry_invalid"
        return True, "ok"
    except (OSError, json.JSONDecodeError):
        return False, "registry_unreadable"


async def _database_reachable() -> tuple[bool, str]:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        return True, "not_configured"
    try:
        import asyncpg  # optional — only needed when DATABASE_URL is set
    except ImportError:
        return True, "driver_not_installed"
    try:
        conn = await asyncpg.connect(database_url, timeout=2.0)
        await conn.execute("SELECT 1")
        await conn.close()
        return True, "ok"
    except Exception as exc:  # noqa: BLE001 — readiness probe
        return False, str(exc)


@app.get("/ready")
async def ready():
    registry_ok, registry_detail = _registry_reachable()
    db_ok, db_detail = await _database_reachable()
    all_ok = registry_ok and db_ok
    status_code = 200 if all_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if all_ok else "not_ready",
            "registry": registry_detail,
            "database": db_detail,
        },
    )


@app.get("/version")
def version():
    return {
        "service": "locatium-ml",
        "git_sha": os.getenv("GIT_SHA", "dev"),
    }
