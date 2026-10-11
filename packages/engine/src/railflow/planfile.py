"""Read a plan file into the plain-dict input of the validator.

File = scenario fields (station, trains, delays, closures, now) plus optional keys:
plan, unscheduled, previous_plan, diff. Times are "HH:MM" strings or integer minutes.
Without "plan", each train's own "platform" and times form the plan.
"""

import json
from pathlib import Path
from typing import Any, cast

from pydantic import ValidationError

from railflow.domain import Scenario
from railflow.timeparse import TimeParseError, parse_time

Json = dict[str, Any]
PLAN_KEYS = ("plan", "unscheduled", "previous_plan", "diff")


class PlanFileError(ValueError):
    """Plan file cannot be read or is malformed."""


def _minutes(value: object, where: str) -> int:
    if isinstance(value, bool):
        raise PlanFileError(f"{where}: time must be 'HH:MM' or integer minutes")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return parse_time(value)
        except TimeParseError as exc:
            raise PlanFileError(f"{where}: {exc}") from exc
    raise PlanFileError(f"{where}: time must be 'HH:MM' or integer minutes")


def _items(raw: object, where: str) -> list[Json]:
    if not isinstance(raw, list):
        raise PlanFileError(f"{where} must be a list")
    items: list[Json] = []
    for index, item in enumerate(cast("list[Any]", raw)):
        if not isinstance(item, dict):
            raise PlanFileError(f"{where}[{index}] must be an object")
        items.append(cast("Json", item))
    return items


def _plan_rows(raw: object, where: str) -> list[Json]:
    rows: list[Json] = []
    for index, item in enumerate(_items(raw, where)):
        label = f"{where}[{index}]"
        for key in ("train_id", "platform", "arr", "dep"):
            if key not in item:
                raise PlanFileError(f"{label}: missing {key!r}")
        rows.append(
            {
                "train_id": item["train_id"],
                "platform": item["platform"],
                "arr": _minutes(item["arr"], f"{label}.arr"),
                "dep": _minutes(item["dep"], f"{label}.dep"),
            }
        )
    return rows


def _keyed(raw: object, where: str, key: str) -> list[Json]:
    items = _items(raw, where)
    for index, item in enumerate(items):
        if key not in item:
            raise PlanFileError(f"{where}[{index}]: missing {key!r}")
    return items


def load_plan_file(path: Path) -> Json:
    try:
        raw: object = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        reason = exc.strerror if isinstance(exc, OSError) else "not UTF-8 text"
        raise PlanFileError(f"cannot read {path}: {reason}") from exc
    except json.JSONDecodeError as exc:
        raise PlanFileError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise PlanFileError("top level must be a JSON object")
    data = cast("Json", raw)
    extra: Json = {key: data.pop(key) for key in PLAN_KEYS if key in data}

    try:
        scenario = Scenario.model_validate(data)
    except ValidationError as exc:
        lines = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise PlanFileError("invalid scenario:\n  " + "\n  ".join(lines)) from exc

    if "plan" in extra:
        plan = _plan_rows(extra["plan"], "plan")
    else:
        plan = [
            {"train_id": t.id, "platform": t.platform, "arr": t.arr, "dep": t.dep}
            for t in scenario.trains
            if t.platform is not None
        ]
    station = scenario.station
    return {
        "station": {
            "gap": station.gap,
            "platforms": station.platforms,
            "dwell_min": station.defaults.dwell_min,
            "max_hold": station.defaults.max_hold,
            "closure_buffer": station.closure_buffer,
        },
        "trains": [
            {
                "id": t.id,
                "class": t.train_class,
                "arr": t.arr,
                "dep": t.dep,
                "required_platform": t.required_platform,
                "platform": t.platform,
            }
            for t in scenario.trains
        ],
        "delays": [{"train_id": d.train_id, "minutes": d.minutes} for d in scenario.delays],
        "closures": [
            {"id": c.id, "platform": c.platform, "start": c.start, "end": c.end}
            for c in scenario.closures
        ],
        "now": scenario.now,
        "plan": plan,
        "unscheduled": _keyed(extra.get("unscheduled", []), "unscheduled", "train_id"),
        "previous_plan": (
            _plan_rows(extra["previous_plan"], "previous_plan")
            if extra.get("previous_plan") is not None
            else None
        ),
        "diff": (
            _keyed(extra["diff"], "diff", "train_id") if extra.get("diff") is not None else None
        ),
    }
