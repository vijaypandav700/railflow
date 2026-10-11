"""Diff classification and reason codes by blocker analysis (FR-08, FR-10)."""

from __future__ import annotations

from typing import Any

from railflow.replan import replan
from railflow.solver import CLASS_WEIGHT

Json = dict[str, Any]


def _weight(train: Json) -> int:
    return CLASS_WEIGHT.get(str(train.get("class", "local")), 1)


def _clash(arr0: int, dep0: int, other: Json, gap: int) -> tuple[str, str, int] | None:
    """Return (code, key, amount) if the status quo slot collides with `other`."""
    if arr0 < other["dep"] and other["arr"] < dep0:
        return "PLATFORM_OCCUPIED_BY", "minutes", min(dep0, other["dep"]) - max(arr0, other["arr"])
    clearance = arr0 - other["dep"] if arr0 >= other["dep"] else other["arr"] - dep0
    if clearance < gap:
        return "GAP_REQUIRED", "shortfall", gap - clearance
    return None


def build_diff(data: Json, out: Json) -> list[Json]:
    station: Json = data["station"]
    gap = int(station["gap"])
    raw = station.get("closure_buffer")
    buffer = gap if raw is None else int(raw)
    now = int(data["now"])
    trains: dict[str, Json] = {t["id"]: t for t in data["trains"]}
    prev: dict[str, Json] = {r["train_id"]: r for r in out["previous_plan"]}
    final: dict[str, Json] = {r["train_id"]: r for r in out["plan"]}
    skipped: dict[str, Json] = {u["train_id"]: u for u in out["unscheduled"]}
    deferred = {tid for w in out["warnings"] for tid in w["trains"]}
    delay: dict[str, int] = {}
    for d in data.get("delays", []):
        delay[d["train_id"]] = delay.get(d["train_id"], 0) + int(d["minutes"])

    diff: list[Json] = []
    for tid in sorted(trains):
        t = trains[tid]
        old = prev.get(tid)
        was_platform = old["platform"] if old else None
        was_arr = int(old["arr"]) if old else int(t["arr"])
        was_dep = int(old["dep"]) if old else int(t["dep"])
        reasons: list[Json] = []
        item: Json = {
            "train_id": tid,
            "class": "KEPT",
            "from": was_platform,
            "to": None,
            "was": [was_arr, was_dep],
            "now": None,
            "reasons": reasons,
        }
        diff.append(item)

        if tid in skipped:
            item["class"] = "UNSCHEDULED"
            reasons.append({"code": skipped[tid]["reason"]})
            continue
        row = final[tid]
        item["to"] = row["platform"]
        item["now"] = [row["arr"], row["dep"]]

        if old is not None and int(old["arr"]) <= now:
            reasons.append({"code": "FROZEN_AT_NOW"})
            if tid in deferred:
                reasons.append({"code": "CLOSURE_DEFERRED"})
            continue

        moved = was_platform is not None and row["platform"] != was_platform
        late = row["arr"] > was_arr or row["dep"] > was_dep
        if moved and late:
            item["class"] = "MOVED_AND_DELAYED"
        elif moved:
            item["class"] = "MOVED"
        elif late:
            item["class"] = "DELAYED"
        else:
            continue

        own = delay.get(tid, 0)
        if own:
            reasons.append({"code": "ARRIVAL_DELAYED", "minutes": own})
        hold = row["arr"] - (int(t["arr"]) + own)
        if hold > 0:
            reasons.append({"code": "HELD_FOR_SLOT", "minutes": hold})
        if was_platform is not None:
            arr0 = int(t["arr"]) + own
            dwell = int(t.get("dwell_min", station["dwell_min"]))
            dep0 = max(int(t["dep"]), arr0 + dwell)
            for other in sorted(out["plan"], key=lambda r: r["train_id"]):
                if other["train_id"] == tid or other["platform"] != was_platform:
                    continue
                hit = _clash(arr0, dep0, other, gap)
                if hit is None:
                    continue
                code, key, amount = hit
                reasons.append({"code": code, "ref": other["train_id"], key: amount})
                if (
                    moved
                    and code == "PLATFORM_OCCUPIED_BY"
                    and _weight(trains[other["train_id"]]) > _weight(t)
                ):
                    reasons.append({"code": "YIELD_TO_PRIORITY", "ref": other["train_id"]})
            for c in data.get("closures", []):
                if c["platform"] == was_platform and arr0 < c["end"] and dep0 + buffer > c["start"]:
                    reasons.append({"code": "PLATFORM_CLOSED", "ref": c["id"]})
        if t.get("required_platform"):
            reasons.append({"code": "REQUIRED_PLATFORM_FIXED"})
    return diff


def replan_with_diff(data: Json, time_limit: float = 5.0) -> Json:
    out = replan(data, time_limit)
    ok = out["status"] in ("OPTIMAL", "FEASIBLE")
    out["diff"] = build_diff(data, out) if ok else []
    return out
