"""Conflict detector (FR-03). Reports conflicts for display. The validator is the gate."""

from __future__ import annotations

from itertools import combinations
from typing import Any

Conflict = dict[str, Any]

_ORDER = {
    "INFEASIBLE_INPUT": 0,
    "REQUIRED_PLATFORM": 1,
    "CLOSURE_HIT": 2,
    "OVERLAP": 3,
    "GAP_VIOLATION": 4,
}


def _conflict(kind: str, trains: list[str], platform: str, minutes: int, **extra: Any) -> Conflict:
    return {"type": kind, "trains": trains, "platform": platform, "minutes": minutes, **extra}


def _same_platform_pairs(plan: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    rows = sorted(plan, key=lambda r: (r["platform"], r["arr"], r["train_id"]))
    return [(a, b) for a, b in combinations(rows, 2) if a["platform"] == b["platform"]]


def detect(data: dict[str, Any]) -> list[Conflict]:
    """Return every conflict in data["plan"], plus input-level infeasibility."""
    station: dict[str, Any] = data["station"]
    gap = int(station["gap"])
    buffer = station.get("closure_buffer")
    buffer = gap if buffer is None else int(buffer)
    trains: dict[str, dict[str, Any]] = {t["id"]: t for t in data["trains"]}
    plan: list[dict[str, Any]] = list(data.get("plan", []))
    closures: list[dict[str, Any]] = list(data.get("closures", []))
    found: list[Conflict] = []

    # INFEASIBLE_INPUT: two trains require the same platform with overlapping occupancy
    required = sorted(
        (t for t in trains.values() if t.get("required_platform")),
        key=lambda t: t["id"],
    )
    for a, b in combinations(required, 2):
        if a["required_platform"] != b["required_platform"]:
            continue
        start = max(a["arr"], b["arr"])
        end = min(a["dep"] + gap, b["dep"] + gap)
        if start < end:
            found.append(
                _conflict(
                    "INFEASIBLE_INPUT", [a["id"], b["id"]], a["required_platform"], end - start
                )
            )

    # REQUIRED_PLATFORM: assigned off its required platform
    for row in plan:
        want = trains.get(row["train_id"], {}).get("required_platform")
        if want and row["platform"] != want:
            found.append(
                _conflict("REQUIRED_PLATFORM", [row["train_id"]], row["platform"], 0, required=want)
            )

    # CLOSURE_HIT: occupancy [arr, dep + buffer) touches closure [start, end)
    for closure in closures:
        for row in plan:
            if row["platform"] != closure["platform"]:
                continue
            occ_end = row["dep"] + buffer
            if row["arr"] < closure["end"] and occ_end > closure["start"]:
                minutes = min(occ_end, closure["end"]) - max(row["arr"], closure["start"])
                found.append(
                    _conflict(
                        "CLOSURE_HIT",
                        [row["train_id"]],
                        row["platform"],
                        minutes,
                        closure=closure["id"],
                    )
                )

    # OVERLAP and GAP_VIOLATION per platform pair
    for a, b in _same_platform_pairs(plan):
        if a["arr"] < b["dep"] and b["arr"] < a["dep"]:
            minutes = min(a["dep"], b["dep"]) - max(a["arr"], b["arr"])
            found.append(
                _conflict("OVERLAP", [a["train_id"], b["train_id"]], a["platform"], minutes)
            )
            continue
        first, second = (a, b) if a["dep"] <= b["arr"] else (b, a)
        clearance = second["arr"] - first["dep"]
        if clearance < gap:
            found.append(
                _conflict(
                    "GAP_VIOLATION",
                    [first["train_id"], second["train_id"]],
                    a["platform"],
                    gap - clearance,
                )
            )

    found.sort(key=lambda c: (_ORDER[c["type"]], c["platform"], c["trains"]))
    return found
