import json
from pathlib import Path
from typing import Any

import pytest
from railflow.cli import main

SCENARIOS = Path(__file__).parents[3] / "scenarios"


def run(path: Path, *flags: str) -> int:
    return main(["validate", str(path), *flags])


def s01_with_plan(tmp_path: Path, mutate: Any = None) -> Path:
    data: dict[str, Any] = json.loads((SCENARIOS / "S01-clean-day.json").read_text("utf-8"))
    data["plan"] = [
        {"train_id": t["id"], "platform": t["platform"], "arr": t["arr"], "dep": t["dep"]}
        for t in data["trains"]
    ]
    data["unscheduled"] = []
    if mutate is not None:
        mutate(data)
    target = tmp_path / "plan.json"
    target.write_text(json.dumps(data), encoding="utf-8")
    return target


def test_clean_scenario_is_valid(capsys: pytest.CaptureFixture[str]) -> None:
    assert run(SCENARIOS / "S01-clean-day.json") == 0
    out = capsys.readouterr().out
    assert out.strip().endswith("VALID")
    assert "FAIL" not in out
    assert "V10  PASS" in out


def test_conflicts_exit_1(capsys: pytest.CaptureFixture[str]) -> None:
    assert run(SCENARIOS / "S02-injected-conflicts.json") == 1
    out = capsys.readouterr().out
    assert "V4   FAIL" in out
    assert "T401 and T402 overlap on P1" in out
    assert out.strip().endswith("INVALID")


def test_delay_breaks_old_plan(capsys: pytest.CaptureFixture[str]) -> None:
    assert run(SCENARIOS / "S03-single-delay.json") == 1
    assert "V7   FAIL" in capsys.readouterr().out


def test_explicit_plan_valid(tmp_path: Path) -> None:
    assert run(s01_with_plan(tmp_path)) == 0


def test_explicit_plan_overlap_invalid(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    def clash(data: dict[str, Any]) -> None:
        data["plan"][1]["platform"] = data["plan"][0]["platform"]
        data["plan"][1]["arr"] = data["plan"][0]["arr"]

    assert run(s01_with_plan(tmp_path, clash)) == 1
    assert "FAIL" in capsys.readouterr().out


def test_unscheduled_with_reason_is_valid(tmp_path: Path) -> None:
    def drop_last(data: dict[str, Any]) -> None:
        gone = data["plan"].pop()
        data["unscheduled"] = [{"train_id": gone["train_id"], "reason": "NO_FEASIBLE_SLOT"}]

    assert run(s01_with_plan(tmp_path, drop_last)) == 0


def test_bad_plan_time_exit_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    def bad(data: dict[str, Any]) -> None:
        data["plan"][0]["arr"] = "25:00"

    assert run(s01_with_plan(tmp_path, bad)) == 2
    assert "plan[0].arr" in capsys.readouterr().err


def test_missing_file_exit_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert run(tmp_path / "nope.json") == 2
    assert "cannot read" in capsys.readouterr().err


def test_invalid_json_exit_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    target = tmp_path / "bad.json"
    target.write_text("{not json", encoding="utf-8")
    assert run(target) == 2
    assert "invalid JSON" in capsys.readouterr().err


def test_invalid_scenario_exit_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    target = tmp_path / "bad.json"
    target.write_text(json.dumps({"id": "x"}), encoding="utf-8")
    assert run(target) == 2
    assert "invalid scenario" in capsys.readouterr().err


def test_json_output(capsys: pytest.CaptureFixture[str]) -> None:
    assert run(SCENARIOS / "S01-clean-day.json", "--json") == 0
    result = json.loads(capsys.readouterr().out)
    assert result["valid"] is True
    assert len(result["checks"]) == 10


def test_version_flag() -> None:
    with pytest.raises(SystemExit) as info:
        main(["--version"])
    assert info.value.code == 0
