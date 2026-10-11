from typing import Any

from railflow.detector import detect


def base(**over: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": 120},
        "trains": [
            {"id": "T1", "arr": 600, "dep": 610},
            {"id": "T2", "arr": 620, "dep": 630},
        ],
        "closures": [],
        "plan": [
            {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
            {"train_id": "T2", "platform": "P1", "arr": 620, "dep": 630},
        ],
    }
    data.update(over)
    return data


def test_clean_plan_has_no_conflicts() -> None:
    assert detect(base()) == []


def test_overlap() -> None:
    plan = [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P1", "arr": 605, "dep": 615},
    ]
    result = detect(base(plan=plan))
    assert len(result) == 1
    assert result[0]["type"] == "OVERLAP"
    assert result[0]["trains"] == ["T1", "T2"]
    assert result[0]["platform"] == "P1"
    assert result[0]["minutes"] == 5


def test_gap_violation_shortfall() -> None:
    plan = [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P1", "arr": 613, "dep": 620},
    ]
    result = detect(base(plan=plan))
    assert [c["type"] for c in result] == ["GAP_VIOLATION"]
    assert result[0]["minutes"] == 2


def test_gap_exact_is_allowed() -> None:
    plan = [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P1", "arr": 615, "dep": 620},
    ]
    assert detect(base(plan=plan)) == []


def test_different_platforms_never_conflict() -> None:
    plan = [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P2", "arr": 600, "dep": 610},
    ]
    assert detect(base(plan=plan)) == []


def test_closure_hit() -> None:
    closures = [{"id": "C1", "platform": "P1", "start": 605, "end": 700}]
    result = detect(base(closures=closures))
    hits = [c for c in result if c["type"] == "CLOSURE_HIT"]
    assert [h["trains"] for h in hits] == [["T1"], ["T2"]]
    assert hits[0]["closure"] == "C1"
    assert hits[0]["minutes"] == 10  # occupancy 600..615 vs closure from 605


def test_closure_touching_is_allowed() -> None:
    closures = [{"id": "C1", "platform": "P1", "start": 615, "end": 620}]
    assert detect(base(closures=closures)) == []


def test_required_platform_violation() -> None:
    trains = [
        {"id": "T1", "arr": 600, "dep": 610, "required_platform": "P2"},
        {"id": "T2", "arr": 620, "dep": 630},
    ]
    result = detect(base(trains=trains))
    assert [c["type"] for c in result] == ["REQUIRED_PLATFORM"]
    assert result[0]["trains"] == ["T1"]


def test_infeasible_input_names_both_trains() -> None:
    trains = [
        {"id": "T1", "arr": 600, "dep": 610, "required_platform": "P1"},
        {"id": "T2", "arr": 605, "dep": 615, "required_platform": "P1"},
    ]
    result = detect(base(trains=trains, plan=[]))
    assert len(result) == 1
    assert result[0]["type"] == "INFEASIBLE_INPUT"
    assert result[0]["trains"] == ["T1", "T2"]
    assert result[0]["platform"] == "P1"


def test_deterministic_order() -> None:
    plan = [
        {"train_id": "T2", "platform": "P1", "arr": 605, "dep": 615},
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
    ]
    assert detect(base(plan=plan)) == detect(base(plan=list(reversed(plan))))
