from pathlib import Path
from typing import Any

import pytest
from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff
from railflow.validator import validate

ROOT = Path(__file__).resolve().parents[3] / "scenarios"
PREFIXES = ("S01", "S03", "S04", "S05", "S06", "S09", "S10", "S11")
FILES = [p for p in sorted(ROOT.glob("S*.json")) if p.stem.startswith(PREFIXES)]


def scenario(prefix: str) -> dict[str, Any]:
    path = next(p for p in ROOT.glob("S*.json") if p.stem.startswith(prefix))
    return load_plan_file(path)


def item(out: dict[str, Any], tid: str) -> dict[str, Any]:
    return next(d for d in out["diff"] if d["train_id"] == tid)


def codes(it: dict[str, Any]) -> list[str]:
    return [r["code"] for r in it["reasons"]]


def gate(data: dict[str, Any], out: dict[str, Any]) -> None:
    result = validate(
        {
            **data,
            "plan": out["plan"],
            "unscheduled": out["unscheduled"],
            "previous_plan": out["previous_plan"],
            "diff": out["diff"],
        }
    )
    assert result["valid"], result


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_every_changed_train_has_a_reason(path: Path) -> None:
    data = load_plan_file(path)
    out = replan_with_diff(data)
    for it in out["diff"]:
        if it["class"] != "KEPT":
            assert it["reasons"], it
    gate(data, out)


def test_s03_cascade_reasons() -> None:
    data = scenario("S03")
    out = replan_with_diff(data)
    t101 = item(out, "T101")
    assert t101["class"] == "DELAYED"
    assert {"code": "ARRIVAL_DELAYED", "minutes": 25} in t101["reasons"]
    t105 = item(out, "T105")
    assert {"code": "PLATFORM_OCCUPIED_BY", "ref": "T101", "minutes": 2} in t105["reasons"]


def test_frozen_train_is_kept_with_reason() -> None:
    out = replan_with_diff(scenario("S09"))
    t901 = item(out, "T901")
    assert t901["class"] == "KEPT"
    assert codes(t901) == ["FROZEN_AT_NOW"]


def test_closure_under_train() -> None:
    out = replan_with_diff(scenario("S11"))
    assert codes(item(out, "T111")) == ["FROZEN_AT_NOW", "CLOSURE_DEFERRED"]
    t112 = item(out, "T112")
    assert t112["class"] == "MOVED"
    assert {"code": "PLATFORM_CLOSED", "ref": "C1"} in t112["reasons"]


def test_required_platform_held_for_closure() -> None:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": 120},
        "trains": [
            {"id": "T1", "arr": 600, "dep": 610, "platform": "P1", "required_platform": "P1"}
        ],
        "closures": [{"id": "C1", "platform": "P1", "start": 600, "end": 700}],
        "delays": [],
        "now": 0,
    }
    out = replan_with_diff(data)
    it = item(out, "T1")
    assert it["class"] == "DELAYED"
    assert codes(it) == ["HELD_FOR_SLOT", "PLATFORM_CLOSED", "REQUIRED_PLATFORM_FIXED"]
    assert it["reasons"][0]["minutes"] == 100
    gate(data, out)


def test_unscheduled_reason() -> None:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": ["P1"], "dwell_min": 2, "max_hold": 10},
        "trains": [
            {"id": "T1", "arr": 600, "dep": 610, "platform": "P1", "required_platform": "P1"}
        ],
        "closures": [{"id": "C1", "platform": "P1", "start": 600, "end": 700}],
        "delays": [],
        "now": 0,
    }
    out = replan_with_diff(data)
    assert item(out, "T1")["class"] == "UNSCHEDULED"
    assert codes(item(out, "T1")) == ["NO_FEASIBLE_SLOT"]
    gate(data, out)
