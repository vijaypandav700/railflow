from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from railflow import cli

DATA: dict[str, Any] = {
    "station": {"gap": 5, "platforms": ["P1"], "dwell_min": 2, "max_hold": 120},
    "trains": [{"id": "T1", "arr": 600, "dep": 610}, {"id": "T2", "arr": 605, "dep": 615}],
    "closures": [],
    "plan": [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P1", "arr": 605, "dep": 615},
    ],
}


def _loader(data: dict[str, Any]) -> Callable[[Path], dict[str, Any]]:
    def load(_path: Path) -> dict[str, Any]:
        return data

    return load


def test_detect_cli_reports_and_exits_1(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "load_plan_file", _loader(DATA))
    assert cli.main(["detect", "x.json"]) == 1
    out = capsys.readouterr().out
    assert "OVERLAP" in out
    assert "1 conflict(s)" in out


def test_detect_cli_clean_exits_0(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    clean = {**DATA, "plan": DATA["plan"][:1]}
    monkeypatch.setattr(cli, "load_plan_file", _loader(clean))
    assert cli.main(["detect", "x.json"]) == 0
    assert "0 conflict(s)" in capsys.readouterr().out
