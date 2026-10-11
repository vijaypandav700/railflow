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


KNOWN_REASONS = frozenset(
    {
        "PLATFORM_OCCUPIED_BY",
        "PLATFORM_CLOSED",
        "GAP_REQUIRED",
        "YIELD_TO_PRIORITY",
        "ARRIVAL_DELAYED",
        "HELD_FOR_SLOT",
        "REQUIRED_PLATFORM_FIXED",
        "FROZEN_AT_NOW",
        "NO_FEASIBLE_SLOT",
        "CLOSURE_DEFERRED",
    }
)


def _closure_buffer(data: Json) -> int:
    buffer = data["station"].get("closure_buffer")
    return data["station"]["gap"] if buffer is None else buffer


def _frozen_ids(data: Json) -> set[str]:
    """R7: trains whose arrival in the previous plan is at or before now."""
    previous = data.get("previous_plan")
    if not previous:
        return set()
    return {r["train_id"] for r in previous if r["arr"] <= data["now"]}


def _deferred(data: Json, closure: Json) -> list[Json]:
    """R9: frozen trains still on the closed platform when the closure starts."""
    frozen = _frozen_ids(data)
    start = closure["start"]
    buffer = _closure_buffer(data)
    return [
        r
        for r in data["plan"]
        if r["platform"] == closure["platform"]
        and r["train_id"] in frozen
        and r["arr"] < start
        and r["dep"] + buffer > start
    ]


def check_v6(data: Json) -> list[Json]:
    """No occupancy touches a closure (with closure buffer, R4 and R9)."""
    gap: int = data["station"]["gap"]
    buffer = _closure_buffer(data)
    errors: list[Json] = []
    for closure in data["closures"]:
        deferred = _deferred(data, closure)
        exempt = {r["train_id"] for r in deferred}
        effective = max([closure["start"], *(r["dep"] + gap for r in deferred)])
        for row in data["plan"]:
            if row["platform"] != closure["platform"] or row["train_id"] in exempt:
                continue
            if row["arr"] >= closure["end"] or row["dep"] + buffer <= effective:
                continue
            errors.append(
                _error(
                    "V6",
                    f"train {row['train_id']} hits closure {closure['id']} "
                    f"on {closure['platform']}",
                    [row["train_id"]],
                    closure=closure["id"],
                    platform=closure["platform"],
                )
            )
    return errors


def check_v7(data: Json) -> list[Json]:
    """Timing: arrival, hold, departure, dwell (R6)."""
    station = data["station"]
    trains = {t["id"]: t for t in data["trains"]}
    delay: dict[str, int] = {}
    for item in data["delays"]:
        delay[item["train_id"]] = delay.get(item["train_id"], 0) + item["minutes"]
    errors: list[Json] = []
    for row in data["plan"]:
        train = trains.get(row["train_id"])
        if train is None:
            continue  # V1 reports unknown trains
        train_id: str = row["train_id"]
        earliest = train["arr"] + delay.get(train_id, 0)
        hold = row["arr"] - earliest
        dwell_min = train.get("dwell_min", station["dwell_min"])
        problems: list[tuple[str, str]] = []
        if hold < 0:
            problems.append(("EARLY_ARRIVAL", f"arrives {-hold} min before earliest {earliest}"))
        if hold > station["max_hold"]:
            problems.append(("HOLD_TOO_LONG", f"hold {hold} > max_hold {station['max_hold']}"))
        if row["dep"] < train["dep"]:
            problems.append(("EARLY_DEPARTURE", f"departs {row['dep']} before {train['dep']}"))
        if row["dep"] - row["arr"] < dwell_min:
            problems.append(("SHORT_DWELL", f"dwell {row['dep'] - row['arr']} < {dwell_min}"))
        for kind, text in problems:
            errors.append(_error("V7", f"train {train_id}: {text}", [train_id], kind=kind))
    return errors


def check_v8(data: Json) -> list[Json]:
    """Frozen trains unchanged versus the previous plan (R7)."""
    previous = data.get("previous_plan")
    if not previous:
        return []
    now: int = data["now"]
    current = {r["train_id"]: r for r in data["plan"]}
    errors: list[Json] = []
    for old in previous:
        if old["arr"] > now:
            continue
        train_id: str = old["train_id"]
        new = current.get(train_id)
        if new is None:
            errors.append(_error("V8", f"frozen train {train_id} is not in plan", [train_id]))
        elif new["platform"] != old["platform"] or new["arr"] != old["arr"]:
            errors.append(_error("V8", f"frozen train {train_id} was changed", [train_id]))
        elif old["dep"] <= now and new["dep"] != old["dep"]:
            errors.append(_error("V8", f"departed train {train_id} was changed", [train_id]))
    return errors


def check_v9(data: Json) -> list[Json]:
    """Unscheduled trains carry a known reason code."""
    errors: list[Json] = []
    for row in data["unscheduled"]:
        reason = row.get("reason")
        if reason not in KNOWN_REASONS:
            errors.append(
                _error(
                    "V9",
                    f"unscheduled train {row['train_id']} has unknown reason {reason!r}",
                    [row["train_id"]],
                )
            )
    return errors


def check_v10(data: Json) -> list[Json]:
    """Every changed train in the diff has at least one reason."""
    diff = data.get("diff")
    if not diff:
        return []
    errors: list[Json] = []
    for item in diff:
        if item["class"] != "KEPT" and not item.get("reasons"):
            errors.append(
                _error(
                    "V10",
                    f"changed train {item['train_id']} ({item['class']}) has no reason",
                    [item["train_id"]],
                )
            )
    return errors


def _warnings(data: Json) -> list[Json]:
    found: list[Json] = []
    for closure in data["closures"]:
        deferred = _deferred(data, closure)
        if deferred:
            found.append(
                {
                    "code": "CLOSURE_DEFERRED",
                    "closure": closure["id"],
                    "trains": [r["train_id"] for r in deferred],
                }
            )
    return found


CHECKS: list[tuple[str, Callable[[Json], list[Json]]]] = [
    ("V1", check_v1),
    ("V2", check_v2),
    ("V3", check_v3),
    ("V4", check_v4),
    ("V5", check_v5),
    ("V6", check_v6),
    ("V7", check_v7),
    ("V8", check_v8),
    ("V9", check_v9),
    ("V10", check_v10),
]


def validate(data: Json) -> Json:
    """Run every check. Malformed input is INVALID, never valid."""
    try:
        checks: list[Json] = []
        for check_id, check in CHECKS:
            errors = check(data)
            checks.append({"id": check_id, "ok": not errors, "errors": errors})
        warnings = _warnings(data)
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        message = f"malformed input: {exc!r}"
        return {
            "valid": False,
            "checks": [
                {"id": "INPUT", "ok": False, "errors": [_error("INPUT", message, [])]},
            ],
            "warnings": [],
        }
    return {"valid": all(c["ok"] for c in checks), "checks": checks, "warnings": warnings}
