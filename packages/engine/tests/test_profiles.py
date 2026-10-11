from pathlib import Path
from typing import Any

import pytest
from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff
from railflow.validator import validate

ROOT = Path(__file__).resolve().parents[3] / "scenarios"
PROFILES = ["min_change", "min_delay"]


def clash() -> dict[str, Any]:
    return {
        "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": 120},
        "trains": [
            {"id": "T1", "arr": 600, "dep": 610, "platform": "P1"},
            {"id": "T2", "arr": 615, "dep": 625, "platform": "P1"},
        ],
        "closures": [],
        "delays": [{"train_id": "T1", "minutes": 20}],
        "now": 0,
    }


def gate(data: dict[str, Any], out: dict[str, Any]) -> bool:
    result = validate(
        {
            **data,
            "plan": out["plan"],
            "unscheduled": out["unscheduled"],
            "previous_plan": out["previous_plan"],
            "diff": out["diff"],
        }
    )
    return bool(result["valid"])


def test_profiles_differ_and_both_valid() -> None:
    data = clash()
    keep = replan_with_diff(data, profile="min_change")
    fast = replan_with_diff(data, profile="min_delay")
    assert gate(data, keep) and gate(data, fast)
    assert all(r["platform"] == "P1" for r in keep["plan"])
    assert any(r["platform"] == "P2" for r in fast["plan"])


@pytest.mark.parametrize("prefix", ["S03", "S04", "S05", "S06"])
@pytest.mark.parametrize("profile", PROFILES)
def test_scenarios_valid_under_each_profile(prefix: str, profile: str) -> None:
    path = next(p for p in ROOT.glob("S*.json") if p.stem.startswith(prefix))
    data = load_plan_file(path)
    assert gate(data, replan_with_diff(data, profile=profile))


def test_unknown_profile_rejected() -> None:
    with pytest.raises(ValueError):
        replan_with_diff(clash(), profile="nope")
