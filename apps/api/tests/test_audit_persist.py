import importlib
from pathlib import Path

import pytest
import railflow_api.main as api_main
from fastapi.testclient import TestClient

BODY = {
    "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": 120},
    "trains": [
        {"id": "T1", "arr": 600, "dep": 610, "platform": "P1"},
        {"id": "T2", "arr": 615, "dep": 625, "platform": "P1"},
    ],
    "closures": [],
    "delays": [{"train_id": "T1", "minutes": 25}],
    "now": 0,
}


def test_audit_log_survives_restart(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILFLOW_AUDIT_DB", str(tmp_path / "audit.db"))
    try:
        importlib.reload(api_main)
        first = TestClient(api_main.app)
        assert first.post("/api/replan", json=BODY).status_code == 200
        written = first.get("/api/audit/verify").json()
        assert written["ok"] is True
        assert written["entries"] >= 1

        importlib.reload(api_main)  # simulates an API restart
        again = TestClient(api_main.app).get("/api/audit/verify").json()
        assert again["ok"] is True
        assert again["entries"] == written["entries"]
    finally:
        monkeypatch.delenv("RAILFLOW_AUDIT_DB", raising=False)
        importlib.reload(api_main)
