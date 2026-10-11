from pathlib import Path
from typing import Any

import pytest
from railflow.planfile import load_plan_file
from railflow.replan import replan
from railflow.validator import validate

PREFIXES = ("S01", "S03", "S04", "S05", "S06", "S09", "S10", "S11")
FILES = [
    p
    for p in sorted((Path(__file__).resolve().parents[3] / "scenarios").glob("S*.json"))
    if p.stem.startswith(PREFIXES)
]


def T(i: str, arr: int, dep: int, plat: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "arr": arr, "dep": dep, "platform": plat, **kw}


def base(
    trains: list[dict[str, Any]], now: int = 0, max_hold: int = 120, **over: Any
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": max_hold},
        "trains": trains,
        "closures": [],
        "delays": [],
        "now": now,
    }
    data.update(over)
    return data


def check(data: dict[str, Any], out: dict[str, Any]) -> None:
    result = validate(
        {
            **data,
            "plan": out["plan"],
            "unscheduled": out["unscheduled"],
            "previous_plan": out["previous_plan"],
        }
    )
    assert result["valid"], result


def rows(out: dict[str, Any]) -> set[tuple[str, str, int, int]]:
    return {(r["train_id"], r["platform"], r["arr"], r["dep"]) for r in out["plan"]}


def test_no_disruption_returns_original() -> None:
    data = base([T("T1", 600, 610, "P1"), T("T2", 620, 630, "P1"), T("T3", 605, 615, "P2")])
    out = replan(data)
    assert rows(out) == {("T1", "P1", 600, 610), ("T2", "P1", 620, 630), ("T3", "P2", 605, 615)}
    check(data, out)


def test_delay_cascade_is_valid() -> None:
    trains = [T("T1", 600, 610, "P1"), T("T2", 615, 625, "P1"), T("T3", 640, 650, "P1")]
    data = base(trains, delays=[{"train_id": "T1", "minutes": 25}])
    out = replan(data)
    assert out["status"] == "OPTIMAL"
    assert rows(out) != {(t["id"], "P1", t["arr"], t["dep"]) for t in trains}
    check(data, out)


def test_closure_deferred_under_frozen_train() -> None:
    trains = [T("T1", 600, 610, "P1"), T("T2", 620, 630, "P1")]
    closures = [{"id": "C1", "platform": "P1", "start": 605, "end": 700}]
    data = base(trains, now=605, closures=closures)
    out = replan(data)
    by = {r["train_id"]: r for r in out["plan"]}
    assert (by["T1"]["platform"], by["T1"]["arr"], by["T1"]["dep"]) == ("P1", 600, 610)
    assert by["T2"]["platform"] == "P2"
    assert out["warnings"][0]["code"] == "CLOSURE_DEFERRED"
    check(data, out)


def test_required_platform_is_held_not_moved() -> None:
    trains = [T("T1", 600, 610, "P1", required_platform="P1")]
    closures = [{"id": "C1", "platform": "P1", "start": 600, "end": 700}]
    data = base(trains, closures=closures)
    out = replan(data)
    assert out["plan"][0]["platform"] == "P1"
    assert out["plan"][0]["arr"] == 700
    check(data, out)


def test_no_slot_within_max_hold_is_unscheduled() -> None:
    trains = [T("T1", 600, 610, "P1", required_platform="P1")]
    closures = [{"id": "C1", "platform": "P1", "start": 600, "end": 700}]
    data = base(trains, max_hold=10, closures=closures)
    out = replan(data)
    assert out["plan"] == []
    assert out["unscheduled"][0]["reason"] == "NO_FEASIBLE_SLOT"
    check(data, out)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_scenario_replan_valid(path: Path) -> None:
    data = load_plan_file(path)
    out = replan(data)
    assert out["status"] in ("OPTIMAL", "FEASIBLE")
    check(data, out)
