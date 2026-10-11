from pathlib import Path
from typing import Any

import pytest
from railflow.domain import Scenario
from railflow.validator import validate

SCENARIO_DIR = Path(__file__).parents[3] / "scenarios"
FILES = sorted(SCENARIO_DIR.glob("S0[1-6]-*.json"))
CLEAN = [
    "S01-clean-day",
    "S03-single-delay",
    "S04-midday-closure",
    "S05-delay-plus-closure",
    "S06-rush-hour",
]


def load(stem: str) -> Scenario:
    return Scenario.model_validate_json((SCENARIO_DIR / f"{stem}.json").read_text(encoding="utf-8"))


def validator_input(scenario: Scenario, *, disrupted: bool) -> dict[str, Any]:
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
        "delays": [{"train_id": d.train_id, "minutes": d.minutes} for d in scenario.delays]
        if disrupted
        else [],
        "closures": [
            {"id": c.id, "platform": c.platform, "start": c.start, "end": c.end}
            for c in scenario.closures
        ]
        if disrupted
        else [],
        "now": scenario.now,
        "previous_plan": None,
        "diff": None,
        "plan": [
            {"train_id": t.id, "platform": t.platform, "arr": t.arr, "dep": t.dep}
            for t in scenario.trains
            if t.platform is not None
        ],
        "unscheduled": [],
    }


def errors(scenario: Scenario, check_id: str, *, disrupted: bool = False) -> list[dict[str, Any]]:
    result = validate(validator_input(scenario, disrupted=disrupted))
    return next(c for c in result["checks"] if c["id"] == check_id)["errors"]


def test_six_files_exist() -> None:
    assert [f.stem for f in FILES] == [
        "S01-clean-day",
        "S02-injected-conflicts",
        "S03-single-delay",
        "S04-midday-closure",
        "S05-delay-plus-closure",
        "S06-rush-hour",
    ]


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_file_loads_and_roundtrips(path: Path) -> None:
    scenario = load(path.stem)
    assert scenario.id == path.stem
    dumped = scenario.model_dump(mode="json", by_alias=True)
    assert Scenario.model_validate(dumped) == scenario


def test_shapes() -> None:
    s01, s02, s03 = load("S01-clean-day"), load("S02-injected-conflicts"), load("S03-single-delay")
    s04, s05, s06 = (
        load("S04-midday-closure"),
        load("S05-delay-plus-closure"),
        load("S06-rush-hour"),
    )
    assert (len(s01.trains), len(s01.station.platforms), s01.delays, s01.closures) == (
        12,
        4,
        [],
        [],
    )
    assert (len(s02.trains), len(s02.station.platforms)) == (8, 3)
    assert (len(s03.delays), len(s03.closures)) == (1, 0)
    assert (len(s04.delays), len(s04.closures)) == (0, 1)
    assert (len(s05.delays), len(s05.closures)) == (1, 1)
    assert (len(s06.trains), len(s06.station.platforms)) == (6, 3)


@pytest.mark.parametrize("stem", CLEAN)
def test_plan_valid_before_disruption(stem: str) -> None:
    result = validate(validator_input(load(stem), disrupted=False))
    assert result["valid"] is True, result


def test_s01_clean_even_with_no_disruption_flag() -> None:
    result = validate(validator_input(load("S01-clean-day"), disrupted=True))
    assert result["valid"] is True


def test_s02_conflicts_exact() -> None:
    scenario = load("S02-injected-conflicts")
    v4 = errors(scenario, "V4")
    assert [(e["trains"], e["platform"], e["minutes"]) for e in v4] == [(["T401", "T402"], "P1", 5)]
    v5 = errors(scenario, "V5")
    assert sorted((e["trains"], e["shortfall"]) for e in v5) == [
        (["T402", "T403"], 3),
        (["T404", "T405"], 2),
    ]
    result = validate(validator_input(scenario, disrupted=False))
    assert [c["id"] for c in result["checks"] if not c["ok"]] == ["V4", "V5"]


def test_s03_delay_breaks_old_plan() -> None:
    found = errors(load("S03-single-delay"), "V7", disrupted=True)
    assert [(e["trains"], e["kind"]) for e in found] == [(["T101"], "EARLY_ARRIVAL")]


def test_s04_closure_breaks_old_plan() -> None:
    found = errors(load("S04-midday-closure"), "V6", disrupted=True)
    assert [e["trains"] for e in found] == [["T206"], ["T210"]]  # T202 exactly at boundary: ok


def test_s05_has_both_problems() -> None:
    scenario = load("S05-delay-plus-closure")
    assert [e["trains"] for e in errors(scenario, "V6", disrupted=True)] == [["T110"]]
    assert [e["trains"] for e in errors(scenario, "V7", disrupted=True)] == [["T101"]]


def test_s06_delay_breaks_old_plan() -> None:
    found = errors(load("S06-rush-hour"), "V7", disrupted=True)
    assert [e["trains"] for e in found] == [["T301"]]
