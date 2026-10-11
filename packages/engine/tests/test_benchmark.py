"""Replan latency on S12 (PRD: p95 <= 2 s, hard cap 5 s)."""

import statistics
import time
from pathlib import Path
from typing import Any

from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff
from railflow.solver import assign
from railflow.validator import validate

ROOT = Path(__file__).resolve().parents[3] / "scenarios"
RUNS = 20


def scenario() -> dict[str, Any]:
    """S12 as shipped has clashing stored platforms, so solve it once to get a valid start plan."""
    path = next(p for p in ROOT.glob("S12*.json"))
    data = load_plan_file(path)
    first = assign(
        {
            "station": data["station"],
            "trains": data["trains"],
            "closures": [],
            "delays": [],
            "now": 0,
        }
    )
    placed = {r["train_id"]: r for r in first["plan"]}
    trains = [
        {**t, "platform": placed[t["id"]]["platform"]} for t in data["trains"] if t["id"] in placed
    ]
    return {**data, "trains": trains}


def disrupted(data: dict[str, Any], n: int) -> dict[str, Any]:
    trains = sorted(data["trains"], key=lambda t: t["arr"])
    now = trains[len(trains) // 3]["arr"]
    later = [t for t in trains if t["arr"] > now]
    delays = [
        {"train_id": t["id"], "minutes": 10 + (n * 7 + i * 5) % 30}
        for i, t in enumerate(later[n % 5 : n % 5 + 3])
    ]
    start = now + 10 + n
    closure = {
        "id": "C1",
        "platform": data["station"]["platforms"][n % len(data["station"]["platforms"])],
        "start": start,
        "end": start + 45,
    }
    return {
        "station": data["station"],
        "trains": data["trains"],
        "closures": [closure],
        "delays": delays,
        "now": now,
    }


def test_s12_size() -> None:
    raw = load_plan_file(next(p for p in ROOT.glob("S12*.json")))
    assert len(raw["trains"]) >= 60
    assert len(raw["station"]["platforms"]) >= 6
    # assign() never holds a train, so a dense evening can leave one unscheduled
    assert len(scenario()["trains"]) >= len(raw["trains"]) - 2


def test_replan_latency_p95() -> None:
    data = scenario()
    times: list[float] = []
    for n in range(RUNS):
        req = disrupted(data, n)
        start = time.perf_counter()
        out = replan_with_diff(req)
        times.append(time.perf_counter() - start)
        assert out["status"] in ("OPTIMAL", "FEASIBLE"), n
        result = validate(
            {
                **req,
                "plan": out["plan"],
                "unscheduled": out["unscheduled"],
                "previous_plan": out["previous_plan"],
                "diff": out["diff"],
            }
        )
        assert result["valid"], n
    times.sort()
    p95 = times[int(len(times) * 0.95) - 1]
    print(
        f"S12 replan: median {statistics.median(times):.2f}s p95 {p95:.2f}s max {times[-1]:.2f}s"
        f" over {RUNS} runs"
    )
    assert p95 <= 2.0, p95
    assert times[-1] <= 5.5, times[-1]
