from pathlib import Path

import pytest
from railflow.benchmark import SKIP, compare
from railflow.planfile import load_plan_file

ROOT = Path(__file__).resolve().parents[3] / "scenarios"
FILES = [p for p in sorted(ROOT.glob("S*.json")) if not p.stem.startswith(SKIP)]


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_solver_beats_or_ties_baseline(path: Path) -> None:
    result = compare(load_plan_file(path))
    assert result["ours_beats_or_ties"], path.stem
