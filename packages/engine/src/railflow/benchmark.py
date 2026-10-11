"""Run baselines and solver profiles on every scenario. Writes docs/benchmark.json."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from railflow.baselines import run_baseline
from railflow.insights import compute_metrics
from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff

Json = dict[str, Any]
ROOT = Path(__file__).resolve().parents[4]
SKIP = ("S02", "S07")  # injected conflicts and infeasible input: no replan to compare


def key(m: Json) -> tuple[int, int]:
    return (int(m["unscheduled"]), int(m["weighted_delay"]))


def compare(data: Json) -> Json:
    base = {n: run_baseline(data, n) for n in ("push_later", "first_fit")}
    ours: dict[str, Json] = {}
    for profile in ("min_change", "min_delay"):
        start = time.perf_counter()
        out = replan_with_diff(data, profile=profile)
        ms = int((time.perf_counter() - start) * 1000)
        ours[profile] = {
            "status": out["status"],
            "time_ms": ms,
            "metrics": compute_metrics(data, out),
        }
    best_ours = min(key(v["metrics"]) for v in ours.values())
    best_base = min(key(v["metrics"]) for v in base.values() if v["validation"]["valid"])
    return {
        "baselines": {
            n: {"metrics": v["metrics"], "valid": v["validation"]["valid"]} for n, v in base.items()
        },
        "ours": ours,
        "ours_beats_or_ties": best_ours <= best_base,
    }


def main() -> None:
    results: Json = {}
    for path in sorted((ROOT / "scenarios").glob("S*.json")):
        if path.stem.startswith(SKIP):
            continue
        results[path.stem] = compare(load_plan_file(path))
    target = ROOT / "docs" / "benchmark.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
    for name, r in results.items():
        print(name, "OK" if r["ours_beats_or_ties"] else "WORSE")


if __name__ == "__main__":
    main()
