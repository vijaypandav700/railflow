# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false, reportMissingTypeStubs=false
"""Replan from now (FR-05..07, R6-R9). Frozen trains keep platform and times."""

from __future__ import annotations

from typing import Any

from ortools.sat.python import cp_model

from railflow.solver import CLASS_WEIGHT, W_UNSCHED

Json = dict[str, Any]

W_DELAY = 10
W_MOVE = 1_000

# profile -> (delay weight, move weight)
PROFILES: dict[str, tuple[int, int]] = {
    "min_change": (W_DELAY, W_MOVE),
    "min_delay": (100, 50),
}


def _previous(data: Json) -> dict[str, Json]:
    rows = data.get("previous_plan")
    if not rows:
        rows = [
            {"train_id": t["id"], "platform": t["platform"], "arr": t["arr"], "dep": t["dep"]}
            for t in data["trains"]
            if t.get("platform")
        ]
    return {
        r["train_id"]: {
            "train_id": r["train_id"],
            "platform": r["platform"],
            "arr": int(r["arr"]),
            "dep": int(r["dep"]),
        }
        for r in rows
    }


def replan(data: Json, time_limit: float = 5.0, profile: str = "min_change") -> Json:
    """Return status, plan (frozen + replanned), unscheduled, warnings, previous_plan."""
    station: Json = data["station"]
    gap = int(station["gap"])
    raw_buffer = station.get("closure_buffer")
    buffer = gap if raw_buffer is None else int(raw_buffer)
    max_hold = int(station["max_hold"])
    now = int(data["now"])
    if profile not in PROFILES:
        raise ValueError(f"unknown profile {profile}")
    w_delay, w_move = PROFILES[profile]
    platforms: list[str] = list(station["platforms"])
    trains: list[Json] = sorted(data["trains"], key=lambda t: t["id"])
    known = {t["id"] for t in trains}
    prev = {k: v for k, v in _previous(data).items() if k in known}
    frozen = {k: v for k, v in prev.items() if v["arr"] <= now}
    delay: dict[str, int] = {}
    for item in data.get("delays", []):
        delay[item["train_id"]] = delay.get(item["train_id"], 0) + int(item["minutes"])

    model = cp_model.CpModel()
    intervals: dict[str, list[Any]] = {p: [] for p in platforms}
    warnings: list[Json] = []

    for r in frozen.values():
        if r["platform"] in intervals:
            intervals[r["platform"]].append(
                model.new_fixed_size_interval_var(
                    r["arr"], r["dep"] + gap - r["arr"], f"f_{r['train_id']}"
                )
            )

    for c in data.get("closures", []):
        p = c["platform"]
        if p not in intervals:
            continue
        deferred = [
            r
            for r in frozen.values()
            if r["platform"] == p and r["arr"] < c["end"] and r["dep"] + buffer > c["start"]
        ]
        effective = max([c["start"], *[r["dep"] + gap for r in deferred]])
        start = effective + gap - buffer
        if deferred:
            start = max(start, effective)
            warnings.append(
                {
                    "code": "CLOSURE_DEFERRED",
                    "closure": c["id"],
                    "trains": sorted(r["train_id"] for r in deferred),
                }
            )
        if c["end"] - start > 0:
            intervals[p].append(
                model.new_fixed_size_interval_var(start, c["end"] - start, f"c_{c['id']}")
            )

    lits: dict[str, list[tuple[str, Any]]] = {}
    arrs: dict[str, Any] = {}
    deps: dict[str, Any] = {}
    terms: list[Any] = []

    for t in trains:
        tid: str = t["id"]
        if tid in frozen:
            continue
        sched_arr = int(t["arr"])
        sched_dep = int(t["dep"])
        earliest = sched_arr + delay.get(tid, 0)
        dwell = int(t.get("dwell_min", station["dwell_min"]))
        arr = model.new_int_var(earliest, earliest + max_hold, f"a_{tid}")
        dep = model.new_int_var(sched_dep, max(sched_dep, earliest + max_hold + dwell), f"d_{tid}")
        model.add_max_equality(dep, [sched_dep, arr + dwell])
        dep_hi = max(sched_dep, earliest + max_hold + dwell)
        size = model.new_int_var(dwell + gap, dep_hi + gap - earliest, f"s_{tid}")
        model.add(size == dep + gap - arr)
        arrs[tid], deps[tid] = arr, dep
        weight = CLASS_WEIGHT.get(str(t.get("class", "local")), 1)
        want = t.get("required_platform")
        home = prev.get(tid, {}).get("platform", t.get("platform"))
        lits[tid] = []
        for index, p in enumerate(platforms):
            if want and p != want:
                continue
            lit = model.new_bool_var(f"x_{tid}_{p}")
            intervals[p].append(
                model.new_optional_interval_var(arr, size, dep + gap, lit, f"i_{tid}_{p}")
            )
            lits[tid].append((p, lit))
            moved = 1 if home is not None and p != home else 0
            terms.append(lit * (w_move * moved + index))
        skip = model.new_bool_var(f"u_{tid}")
        model.add_exactly_one([lit for _, lit in lits[tid]] + [skip])
        terms.append(skip * (W_UNSCHED * weight))
        terms.append(w_delay * weight * (arr + dep - sched_arr - sched_dep))

    for p in platforms:
        model.add_no_overlap(intervals[p])
    model.minimize(sum(terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    previous = sorted(prev.values(), key=lambda r: r["train_id"])
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "ERROR",
            "plan": [],
            "unscheduled": [],
            "warnings": warnings,
            "previous_plan": previous,
        }

    plan: list[Json] = [dict(r) for r in frozen.values()]
    skipped: list[Json] = []
    for t in trains:
        tid = t["id"]
        if tid in frozen:
            continue
        chosen = next((p for p, lit in lits[tid] if solver.Value(lit)), None)
        if chosen is None:
            skipped.append({"train_id": tid, "reason": "NO_FEASIBLE_SLOT"})
        else:
            plan.append(
                {
                    "train_id": tid,
                    "platform": chosen,
                    "arr": solver.Value(arrs[tid]),
                    "dep": solver.Value(deps[tid]),
                }
            )
    plan.sort(key=lambda r: (r["arr"], r["train_id"]))
    label = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    return {
        "status": label,
        "plan": plan,
        "unscheduled": skipped,
        "warnings": warnings,
        "previous_plan": previous,
    }
