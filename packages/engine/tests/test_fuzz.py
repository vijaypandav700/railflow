"""Fuzz and mutation suites (PRD section 20). FUZZ_N=10000 for the full run."""

import os
import random
from typing import Any

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from railflow.reasons import replan_with_diff
from railflow.solver import assign
from railflow.validator import validate

N = int(os.environ.get("FUZZ_N", "60"))
SLOW = [HealthCheck.too_slow, HealthCheck.data_too_large]


def build(seed: int) -> dict[str, Any] | None:
    rng = random.Random(seed)
    platforms = [f"P{i}" for i in range(1, rng.randint(2, 4) + 1)]
    trains: list[dict[str, Any]] = []
    for i in range(rng.randint(3, 9)):
        arr = rng.randint(600, 700)
        trains.append(
            {
                "id": f"T{i + 1:02d}",
                "arr": arr,
                "dep": arr + rng.randint(5, 20),
                "class": rng.choice(["local", "express", "premium"]),
                "platform": platforms[0],
            }
        )
    station = {"gap": 5, "platforms": platforms, "dwell_min": 2, "max_hold": 120}
    first = assign({"station": station, "trains": trains, "closures": [], "delays": [], "now": 0})
    placed = {r["train_id"]: r["platform"] for r in first["plan"]}
    kept = [{**t, "platform": placed[t["id"]]} for t in trains if t["id"] in placed]
    if len(kept) < 3:
        return None
    delays = [
        {"train_id": t["id"], "minutes": rng.randint(1, 40)} for t in kept if rng.random() < 0.4
    ]
    closures: list[dict[str, Any]] = []
    if rng.random() < 0.6:
        start = rng.randint(620, 720)
        closures.append(
            {
                "id": "C1",
                "platform": rng.choice(platforms),
                "start": start,
                "end": start + rng.randint(10, 60),
            }
        )
    return {"station": station, "trains": kept, "closures": closures, "delays": delays, "now": 0}


def gate(data: dict[str, Any], plan: list[dict[str, Any]], unsched: list[dict[str, Any]]) -> bool:
    return bool(
        validate(
            {**data, "plan": plan, "unscheduled": unsched, "previous_plan": None, "diff": None}
        )["valid"]
    )


def mutate(
    plan: list[dict[str, Any]], kind: str, rng: random.Random
) -> list[dict[str, Any]] | None:
    rows = [dict(r) for r in plan]
    if len(rows) < 2:
        return None
    i = rng.randrange(len(rows))
    if kind == "drop":
        rows.pop(i)
        return rows
    if kind == "duplicate":
        rows.append(dict(rows[i]))
        return rows
    if kind == "shift_early":
        rows[i]["arr"] -= 30
        rows[i]["dep"] -= 30
        return rows
    if kind == "unknown_platform":
        rows[i]["platform"] = "P99"
        return rows
    if kind == "clash":
        j = (i + 1) % len(rows)
        rows[j] = {
            **rows[j],
            "platform": rows[i]["platform"],
            "arr": rows[i]["arr"] + 1,
            "dep": rows[i]["dep"],
        }
        return rows
    return None


@settings(max_examples=N, deadline=None, suppress_health_check=SLOW)
@given(seed=st.integers(min_value=0, max_value=1_000_000))
def test_solver_plans_always_validate(seed: int) -> None:
    data = build(seed)
    if data is None:
        return
    out = replan_with_diff(data)
    assert out["status"] in ("OPTIMAL", "FEASIBLE"), seed
    assert gate(data, out["plan"], out["unscheduled"]), seed


@settings(max_examples=N, deadline=None, suppress_health_check=SLOW)
@given(
    seed=st.integers(min_value=0, max_value=1_000_000),
    kind=st.sampled_from(["drop", "duplicate", "shift_early", "unknown_platform", "clash"]),
)
def test_mutated_plans_are_rejected(seed: int, kind: str) -> None:
    data = build(seed)
    if data is None:
        return
    out = replan_with_diff(data)
    if out["status"] not in ("OPTIMAL", "FEASIBLE") or out["unscheduled"]:
        return
    assert gate(data, out["plan"], []), seed
    bad = mutate(out["plan"], kind, random.Random(seed))
    if bad is None or bad == out["plan"]:
        return
    assert not gate(data, bad, []), (seed, kind)
