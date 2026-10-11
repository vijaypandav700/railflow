from typing import Any

from fastapi import FastAPI, HTTPException
from railflow import __version__
from railflow.detector import detect

app = FastAPI(title="RailFlow API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/api/plan/detect")
def plan_detect(body: dict[str, Any]) -> dict[str, Any]:
    try:
        conflicts = detect(body)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail={"code": "INPUT_MALFORMED", "message": str(exc)}
        ) from exc
    return {"conflicts": conflicts, "count": len(conflicts)}
