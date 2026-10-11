from pathlib import Path
from typing import Any

import pytest
from railflow.baselines import run_baseline
from railflow.benchmark import compare
from railflow.planfile import load_plan_file

ROOT = Path(__file__).resolve().parents[3] / "scenarios"
PREFIXES = ["S03", "S04", "S05", "S06", "S09", "S11"]


def load(prefix: str) -> dict[str, Any]:
    return load_plan_file(next(p for p in ROOT.glob("S*.json") if p.stem.startswith(prefix)))


@pytest.mark.parametrize("prefix", PREFIXES)
@pytest.mark.parametrize("name", ["push_later", "first_fit"])
def test_baseline_plan_is_valid(prefix: str, name: str) -> None:
    out = run_baseline(load(prefix), name)
    assert out["validation"]["valid"], out["validation"]


@pytest.mark.parametrize("prefix", PREFIXES)
def test_solver_beats_or_ties_baseline(prefix: str) -> None:
    assert compare(load(prefix))["ours_beats_or_ties"]


def test_unknown_baseline() -> None:
    with pytest.raises(ValueError):
        run_baseline(load("S03"), "nope")
