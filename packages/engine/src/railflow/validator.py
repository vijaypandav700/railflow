"""Independent plan validator (PRD sections 4 and 13).

Standard library only. No imports from other railflow modules. Input is plain dicts.
Times are integer minutes. Brute-force pairwise checks on purpose: simple code is easy to trust.
"""

from collections.abc import Callable, Iterator
from typing import Any

Json = dict[str, Any]


def _error(check: str, message: str, trains: list[str], **extra: Any) -> Json:
    return {"check": check, "message": message, "trains": trains, **extra}


def _pairs(data: Json) -> Iterator[tuple[Json, Json]]:
    rows: list[Json] = data["plan"]
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if rows[i]["platform"] == rows[j]["platform"]:
                yield rows[i], rows[j]


def _overlaps(a: Json, b: Json) -> bool:
    return a["arr"] < b["dep"] and b["arr"] < a["dep"]


def check_v1(data: Json) -> list[Json]:
    """Every train is assigned or unscheduled, exactly once. No unknown trains."""
    errors: list[Json] = []
    input_ids: list[str] = [t["id"] for t in data["trains"]]
    known = set(input_ids)
    for train_id in sorted({i for i in input_ids if input_ids.count(i) > 1}):
        errors.append(_error("V1", f"input train id {train_id} is duplicated", [train_id]))
    counts: dict[str, int] = {}
    for row in [*data["plan"], *data["unscheduled"]]:
        counts[row["train_id"]] = counts.get(row["train_id"], 0) + 1
    for train_id, count in sorted(counts.items()):
        if train_id not in known:
            errors.append(_error("V1", f"unknown train {train_id} in plan", [train_id]))
        elif count > 1:
            errors.append(_error("V1", f"train {train_id} appears {count} times", [train_id]))
    for train_id in sorted(known - set(counts)):
        errors.append(_error("V1", f"train {train_id} is missing from plan", [train_id]))
    return errors


def check_v2(data: Json) -> list[Json]:
    """Every assigned platform exists."""
    platforms = set(data["station"]["platforms"])
    return [
        _error("V2", f"train {r['train_id']} on unknown platform {r['platform']}", [r["train_id"]])
        for r in data["plan"]
        if r["platform"] not in platforms
    ]


def check_v3(data: Json) -> list[Json]:
    """Required platform respected."""
    required = {t["id"]: t.get("required_platform") for t in data["trains"]}
    errors: list[Json] = []
    for row in data["plan"]:
        want = required.get(row["train_id"])
        if want is not None and row["platform"] != want:
            errors.append(
                _error(
                    "V3",
                    f"train {row['train_id']} requires {want} but is on {row['platform']}",
                    [row["train_id"]],
                )
            )
    return errors


def check_v4(data: Json) -> list[Json]:
    """No two occupancies overlap on one platform (all pairs)."""
    errors: list[Json] = []
    for a, b in _pairs(data):
        if _overlaps(a, b):
            minutes = max(0, min(a["dep"], b["dep"]) - max(a["arr"], b["arr"]))
            errors.append(
                _error(
                    "V4",
                    f"{a['train_id']} and {b['train_id']} overlap on {a['platform']}",
                    [a["train_id"], b["train_id"]],
                    platform=a["platform"],
                    minutes=minutes,
                )
            )
    return errors


def check_v5(data: Json) -> list[Json]:
    """Gap G respected between every pair on one platform (equality allowed)."""
    gap: int = data["station"]["gap"]
    errors: list[Json] = []
    for a, b in _pairs(data):
        if _overlaps(a, b):
            continue  # V4 reports it
        first, second = (a, b) if a["dep"] <= b["arr"] else (b, a)
        clearance = second["arr"] - first["dep"]
        if clearance < gap:
            errors.append(
                _error(
                    "V5",
                    f"{first['train_id']} then {second['train_id']} on {a['platform']}: "
                    f"gap {clearance} < {gap}",
                    [first["train_id"], second["train_id"]],
                    platform=a["platform"],
                    shortfall=gap - clearance,
                )
            )
    return errors


CHECKS: list[tuple[str, Callable[[Json], list[Json]]]] = [
    ("V1", check_v1),
    ("V2", check_v2),
    ("V3", check_v3),
    ("V4", check_v4),
    ("V5", check_v5),
]


def validate(data: Json) -> Json:
    """Run every check. Malformed input is INVALID, never valid."""
    try:
        checks: list[Json] = []
        for check_id, check in CHECKS:
            errors = check(data)
            checks.append({"id": check_id, "ok": not errors, "errors": errors})
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        message = f"malformed input: {exc!r}"
        return {
            "valid": False,
            "checks": [
                {"id": "INPUT", "ok": False, "errors": [_error("INPUT", message, [])]},
            ],
        }
    return {"valid": all(c["ok"] for c in checks), "checks": checks}
