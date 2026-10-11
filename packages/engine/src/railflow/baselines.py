"""Baseline planners for comparison (FR-12). Greedy, no solver, no optimisation."""

from __future__ import annotations

from typing import Any

from railflow.solver import CLASS_WEIGHT
from railflow.validator import validate

Json = dict[str, Any]


def _prev(data: Json) -> dict[str, Json]:
    rows: list[Json] = data.get("previous_plan") or [
        {"train_id": t["id"], "platform": t["platform"], "arr": t["arr"], "dep": t["dep"]}
        for t in data["trains"]
        if t.get("platform")
    ]
    known = {t["id"] for t in data["trains"]}
    return {r["train_id"]: r for r in rows if r["train_id"] in known}


def _plan(data: Json, strategy: str) -> tuple[list[Json], list[Json], list[Json]]:
    st: Json = data["station"]
    gap = int(st["gap"])
    raw = st.get("closure_buffer")
    buffer = gap if raw is None else int(raw)
    max_hold = int(st["max_hold"])
    now = int(data["now"])
    platforms: list[str] = list(st["platforms"])
    closures: list[Json] = list(data.get("closures", []))
    delay: dict[str, int] = {}
    for d in data.get("delays", []):
        delay[d["train_id"]] = delay.get(d["train_id"], 0) + int(d["minutes"])

    prev = _prev(data)
    frozen = {k: v for k, v in prev.items() if int(v["arr"]) <= now}
    busy: dict[str, list[tuple[int, int]]] = {p: [] for p in platforms}
    out: list[Json] = []
    for r in frozen.values():
        row = {k: r[k] for k in ("train_id", "platform", "arr", "dep")}
        out.append(row)
        if row["platform"] in busy:
            busy[row["platform"]].append((int(row["arr"]), int(row["dep"]) + gap))

    def fits(p: str, a: int, dep: int) -> bool:
        if any(a < e and dep + gap > s for s, e in busy[p]):
            return False
        return not any(
            c["platform"] == p and a < c["end"] and dep + buffer > c["start"] for c in closures
        )

    def earliest(p: str, t: Json, eff: int) -> tuple[int, int] | None:
        dwell = int(t.get("dwell_min", st["dwell_min"]))
        for hold in range(max_hold + 1):
            a = eff + hold
            dep = max(int(t["dep"]), a + dwell)
            if fits(p, a, dep):
                return a, dep
        return None

    skipped: list[Json] = []
    todo = [t for t in data["trains"] if t["id"] not in frozen]
    todo.sort(key=lambda t: (int(t["arr"]) + delay.get(t["id"], 0), t["id"]))
    for t in todo:
        eff = int(t["arr"]) + delay.get(t["id"], 0)
        home = (
            t.get("required_platform")
            or (prev.get(t["id"]) or {}).get("platform")
            or t.get("platform")
        )
        if strategy == "push_later":
            options = [home if home in busy else platforms[0]]
        elif t.get("required_platform"):
            options = [t["required_platform"]]
        else:
            options = platforms
        found: tuple[str, int, int] | None = None
        for p in options:
            slot = earliest(p, t, eff)
            if slot is None:
                continue
            if strategy == "first_fit" and slot[0] == eff:
                found = (p, slot[0], slot[1])
                break
            if found is None or slot[0] < found[1]:
                found = (p, slot[0], slot[1])
        if found is None:
            skipped.append({"train_id": t["id"], "reason": "NO_FEASIBLE_SLOT"})
            continue
        p, a, dep = found
        busy[p].append((a, dep + gap))
        out.append({"train_id": t["id"], "platform": p, "arr": a, "dep": dep})
    out.sort(key=lambda r: r["train_id"])
    return out, skipped, list(prev.values())


def metrics_of(data: Json, plan: list[Json], skipped: list[Json], prev: list[Json]) -> Json:
    trains: dict[str, Json] = {t["id"]: t for t in data["trains"]}
    home = {r["train_id"]: r["platform"] for r in prev}
    total = weighted = longest = late = moved = 0
    for r in plan:
        t = trains[r["train_id"]]
        d = max(0, int(r["arr"]) - int(t["arr"]))
        total += d
        weighted += d * CLASS_WEIGHT.get(str(t.get("class", "local")), 1)
        longest = max(longest, d)
        late += 1 if d > 0 else 0
        moved += 1 if r["train_id"] in home and home[r["train_id"]] != r["platform"] else 0
    return {
        "total_delay": total,
        "weighted_delay": weighted,
        "moved": moved,
        "delayed": late,
        "max_delay": longest,
        "unscheduled": len(skipped),
    }


def run_baseline(data: Json, name: str) -> Json:
    if name not in ("push_later", "first_fit"):
        raise ValueError(f"unknown baseline {name}")
    plan, skipped, prev = _plan(data, name)
    validation = validate(
        {**data, "plan": plan, "unscheduled": skipped, "previous_plan": prev, "diff": None}
    )
    return {
        "name": name,
        "plan": plan,
        "unscheduled": skipped,
        "metrics": metrics_of(data, plan, skipped, prev),
        "validation": validation,
    }
