import os
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from railflow import __version__
from railflow.benchmark import compare
from railflow.detector import detect
from railflow.insights import build_cascade, build_facts, compute_metrics
from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff
from railflow.validator import validate

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json", title="RailFlow API")


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


MAX_TRAINS = 200
MAX_PLATFORMS = 12
MAX_DISRUPTIONS = 20


@app.post("/api/replan")
def api_replan(body: dict[str, Any]) -> dict[str, Any]:
    try:
        if (
            len(body["trains"]) > MAX_TRAINS
            or len(body["station"]["platforms"]) > MAX_PLATFORMS
            or len(body.get("delays", [])) + len(body.get("closures", [])) > MAX_DISRUPTIONS
        ):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "LIMIT_EXCEEDED",
                    "message": "200 trains, 12 platforms, 20 disruptions max",
                },
            )
        names: list[str] = list(body.get("profiles") or ["min_change", "min_delay"])
        solved: list[tuple[str, dict[str, Any], int]] = []
        for name in names:
            start = time.perf_counter()
            result = replan_with_diff(body, profile=name)
            elapsed = int((time.perf_counter() - start) * 1000)
            if result["status"] in ("OPTIMAL", "FEASIBLE"):
                solved.append((name, result, elapsed))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail={"code": "INPUT_MALFORMED", "message": str(exc)}
        ) from exc
    if not solved:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INPUT_INFEASIBLE",
                "message": "No valid plan exists for these disruptions",
            },
        )
    good: list[dict[str, Any]] = []
    bad: list[dict[str, Any]] = []
    seen: set[str] = set()
    for name, out, elapsed in solved:
        signature = repr(
            (
                sorted((r["train_id"], r["platform"], r["arr"], r["dep"]) for r in out["plan"]),
                sorted(u["train_id"] for u in out["unscheduled"]),
            )
        )
        if signature in seen:
            continue
        seen.add(signature)
        validation = validate(
            {
                **body,
                "plan": out["plan"],
                "unscheduled": out["unscheduled"],
                "previous_plan": out["previous_plan"],
                "diff": out["diff"],
            }
        )
        metrics = compute_metrics(body, out)
        alt: dict[str, Any] = {
            "profile": name,
            "solver": {"status": out["status"], "time_ms": elapsed},
            "plan": out["plan"],
            "unscheduled": out["unscheduled"],
            "warnings": out["warnings"],
            "diff": out["diff"],
            "metrics": metrics,
            "cascade": build_cascade(out["diff"]),
            "facts": build_facts(name, out["diff"], metrics),
            "validation": validation,
        }
        (good if validation["valid"] else bad).append(alt)
    return {"alternatives": good, "rejected_plans": bad}


@app.post("/api/baseline/compare")
def api_baseline_compare(body: dict[str, Any]) -> dict[str, Any]:
    try:
        if len(body["trains"]) > MAX_TRAINS or len(body["station"]["platforms"]) > MAX_PLATFORMS:
            raise HTTPException(
                status_code=422,
                detail={"code": "LIMIT_EXCEEDED", "message": "200 trains, 12 platforms max"},
            )
        return compare(body)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail={"code": "INPUT_MALFORMED", "message": str(exc)}
        ) from exc


def _scenario_files() -> dict[str, Path]:
    env = os.environ.get("RAILFLOW_SCENARIOS")
    root = Path(env) if env else Path(__file__).resolve().parents[4] / "scenarios"
    return {p.stem: p for p in sorted(root.glob("S*.json"))}


@app.get("/api/scenarios")
def api_scenarios() -> list[dict[str, str]]:
    return [{"id": sid} for sid in _scenario_files()]


@app.get("/api/scenarios/{scenario_id}")
def api_scenario(scenario_id: str) -> dict[str, Any]:
    path = _scenario_files().get(scenario_id)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "SCENARIO_UNKNOWN", "message": scenario_id},
        )
    data = load_plan_file(path)
    return {k: data[k] for k in ("station", "trains", "closures", "delays", "now")}
