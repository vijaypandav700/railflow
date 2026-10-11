# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false, reportMissingTypeStubs=false
"""Initial assignment solver (FR-04). CP-SAT picks platforms. The validator is the gate."""

from __future__ import annotations

from typing import Any

from ortools.sat.python import cp_model

from railflow.detector import detect

Json = dict[str, Any]

CLASS_WEIGHT = {"local": 1, "express": 3, "premium": 5}
W_UNSCHED = 1_000_000
W_MOVED = 10_000


def assign(data: Json, time_limit: float = 5.0) -> Json:
    """Assign trains to platforms. Returns status, plan, unscheduled, conflicts."""
    station: Json = data["station"]
    gap = int(station["gap"])
    buffer = station.get("closure_buffer")
    buffer = gap if buffer is None else int(buffer)
    platforms: list[str] = list(station["platforms"])
    closures: list[Json] = list(data.get("closures", []))
    trains: list[Json] = sorted(data["trains"], key=lambda t: t["id"])
    original = {r["train_id"]: r["platform"] for r in data.get("plan", [])}
    delay: dict[str, int] = {}
    for item in data.get("delays", []):
        delay[item["train_id"]] = delay.get(item["train_id"], 0) + int(item["minutes"])

    clashes = [c for c in detect({**data, "plan": []}) if c["type"] == "INFEASIBLE_INPUT"]
    if clashes:
        return {"status": "INFEASIBLE_INPUT", "plan": [], "unscheduled": [], "conflicts": clashes}

    model = cp_model.CpModel()
    intervals: dict[str, list[Any]] = {p: [] for p in platforms}
    lits: dict[str, list[tuple[str, Any]]] = {}
    unsched: dict[str, Any] = {}
    times: dict[str, tuple[int, int]] = {}
    terms: list[Any] = []

    for t in trains:
        tid: str = t["id"]
        arr = int(t["arr"]) + delay.get(tid, 0)
        dwell = int(t.get("dwell_min", station["dwell_min"]))
        dep = max(int(t["dep"]), arr + dwell)
        times[tid] = (arr, dep)
        weight = CLASS_WEIGHT.get(str(t.get("class", "local")), 1)
        want = t.get("required_platform")
        home = original.get(tid, t.get("platform"))
        lits[tid] = []
        for index, p in enumerate(platforms):
            if want and p != want:
                continue
            if any(
                c["platform"] == p and arr < c["end"] and dep + buffer > c["start"]
                for c in closures
            ):
                continue
            lit = model.new_bool_var(f"x_{tid}_{p}")
            interval = model.new_optional_fixed_size_interval_var(
                arr, dep + gap - arr, lit, f"i_{tid}_{p}"
            )
            intervals[p].append(interval)
            lits[tid].append((p, lit))
            moved = 1 if home is not None and p != home else 0
            terms.append(lit * (W_MOVED * moved + index))
        unsched[tid] = model.new_bool_var(f"u_{tid}")
        model.add_exactly_one([lit for _, lit in lits[tid]] + [unsched[tid]])
        terms.append(unsched[tid] * (W_UNSCHED * weight))

    for p in platforms:
        model.add_no_overlap(intervals[p])
    model.minimize(sum(terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": "ERROR", "plan": [], "unscheduled": [], "conflicts": []}

    plan: list[Json] = []
    skipped: list[Json] = []
    for t in trains:
        tid = t["id"]
        chosen = next((p for p, lit in lits[tid] if solver.Value(lit)), None)
        if chosen is None:
            skipped.append({"train_id": tid, "reason": "NO_FEASIBLE_SLOT"})
        else:
            plan.append(
                {"train_id": tid, "platform": chosen, "arr": times[tid][0], "dep": times[tid][1]}
            )
    plan.sort(key=lambda r: (r["arr"], r["train_id"]))
    label = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    return {"status": label, "plan": plan, "unscheduled": skipped, "conflicts": []}
