from typing import Any

from railflow.solver import assign
from railflow.validator import validate


def base(trains: list[dict[str, Any]], platforms: list[str], **over: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": platforms, "dwell_min": 2, "max_hold": 120},
        "trains": trains,
        "closures": [],
        "delays": [],
        "now": 0,
    }
    data.update(over)
    return data


def check(data: dict[str, Any], out: dict[str, Any]) -> None:
    result = validate({**data, "plan": out["plan"], "unscheduled": out["unscheduled"]})
    assert result["valid"], result


def T(i: str, arr: int, dep: int, **kw: Any) -> dict[str, Any]:
    return {"id": i, "arr": arr, "dep": dep, **kw}


def test_clean_day_all_assigned_and_valid() -> None:
    data = base([T("T1", 600, 610), T("T2", 620, 630)], ["P1"])
    out = assign(data)
    assert out["status"] == "OPTIMAL"
    assert len(out["plan"]) == 2
    check(data, out)


def test_overlap_forces_two_platforms() -> None:
    data = base([T("T1", 600, 610), T("T2", 605, 615)], ["P1", "P2"])
    out = assign(data)
    assert {r["platform"] for r in out["plan"]} == {"P1", "P2"}
    check(data, out)


def test_capacity_exceeded_reports_unscheduled() -> None:
    data = base([T("T1", 600, 610), T("T2", 600, 610), T("T3", 600, 610)], ["P1", "P2"])
    out = assign(data)
    assert len(out["plan"]) == 2
    assert len(out["unscheduled"]) == 1
    assert out["unscheduled"][0]["reason"] == "NO_FEASIBLE_SLOT"
    check(data, out)


def test_priority_train_keeps_slot() -> None:
    trains = [T("T1", 600, 610), T("T2", 600, 610, **{"class": "premium"})]
    out = assign(base(trains, ["P1"]))
    assert [r["train_id"] for r in out["plan"]] == ["T2"]
    assert out["unscheduled"][0]["train_id"] == "T1"


def test_required_platform_clash_is_infeasible_input() -> None:
    trains = [
        T("T1", 600, 610, required_platform="P1"),
        T("T2", 605, 615, required_platform="P1"),
    ]
    out = assign(base(trains, ["P1", "P2"]))
    assert out["status"] == "INFEASIBLE_INPUT"
    assert out["conflicts"][0]["trains"] == ["T1", "T2"]
    assert out["plan"] == []


def test_closure_avoided() -> None:
    closures = [{"id": "C1", "platform": "P1", "start": 590, "end": 700}]
    data = base([T("T1", 600, 610)], ["P1", "P2"], closures=closures)
    out = assign(data)
    assert out["plan"][0]["platform"] == "P2"
    check(data, out)


def test_prefers_original_platform() -> None:
    data = base([T("T1", 600, 610, platform="P2")], ["P1", "P2"])
    assert assign(data)["plan"][0]["platform"] == "P2"


def test_required_platform_respected() -> None:
    data = base([T("T1", 600, 610, required_platform="P2")], ["P1", "P2"])
    out = assign(data)
    assert out["plan"][0]["platform"] == "P2"
    check(data, out)


def test_deterministic() -> None:
    trains = [T("T1", 600, 610), T("T2", 605, 615), T("T3", 612, 620)]
    data = base(trains, ["P1", "P2"])
    assert assign(data) == assign(data)


def test_declared_delay_shifts_arrival() -> None:
    data = base([T("T1", 600, 610)], ["P1"], delays=[{"train_id": "T1", "minutes": 25}])
    out = assign(data)
    assert out["plan"][0]["arr"] == 625
    assert out["plan"][0]["dep"] == 627
    check(data, out)
