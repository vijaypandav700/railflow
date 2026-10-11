import time
from pathlib import Path

import pytest
from railflow.detector import detect
from railflow.planfile import load_plan_file
from railflow.solver import assign
from railflow.validator import validate

FILES = sorted((Path(__file__).resolve().parents[3] / "scenarios").glob("S*.json"))


def test_twelve_scenarios_present() -> None:
    assert len(FILES) == 12


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_scenario_solves_valid(path: Path) -> None:
    data = load_plan_file(path)
    out = assign(data)
    if path.stem.startswith("S07"):
        assert out["status"] == "INFEASIBLE_INPUT"
        assert out["conflicts"][0]["trains"] == ["T701", "T702"]
        return
    assert out["status"] in ("OPTIMAL", "FEASIBLE")
    result = validate({**data, "plan": out["plan"], "unscheduled": out["unscheduled"]})
    assert result["valid"], result
    if path.stem.startswith("S08"):
        assert len(out["unscheduled"]) >= 1


def test_s07_detector_names_both_trains() -> None:
    path = next(p for p in FILES if p.stem.startswith("S07"))
    data = load_plan_file(path)
    found = [c for c in detect({**data, "plan": []}) if c["type"] == "INFEASIBLE_INPUT"]
    assert found[0]["trains"] == ["T701", "T702"]


def test_s12_solves_under_five_seconds() -> None:
    path = next(p for p in FILES if p.stem.startswith("S12"))
    data = load_plan_file(path)
    start = time.perf_counter()
    assign(data)
    assert time.perf_counter() - start < 5.0
