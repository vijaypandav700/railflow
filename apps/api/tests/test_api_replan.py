from typing import Any

import pytest
import railflow_api.main as api_main
from fastapi.testclient import TestClient
from railflow_api.main import app

client = TestClient(app)


def body(**over: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "station": {"gap": 5, "platforms": ["P1", "P2"], "dwell_min": 2, "max_hold": 120},
        "trains": [
            {"id": "T1", "arr": 600, "dep": 610, "platform": "P1"},
            {"id": "T2", "arr": 615, "dep": 625, "platform": "P1"},
        ],
        "closures": [],
        "delays": [{"train_id": "T1", "minutes": 25}],
        "now": 0,
    }
    data.update(over)
    return data


def test_replan_returns_valid_alternative() -> None:
    res = client.post("/api/replan", json=body())
    assert res.status_code == 200
    out = res.json()
    assert len(out["alternatives"]) >= 1
    assert out["rejected_plans"] == []
    alt = out["alternatives"][0]
    assert alt["validation"]["valid"] is True
    assert alt["solver"]["status"] in ("OPTIMAL", "FEASIBLE")
    t1 = next(d for d in alt["diff"] if d["train_id"] == "T1")
    assert {"code": "ARRIVAL_DELAYED", "minutes": 25} in t1["reasons"]


def test_malformed_is_422() -> None:
    res = client.post("/api/replan", json={})
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "INPUT_MALFORMED"


def test_limit_exceeded() -> None:
    trains = [{"id": f"T{i}", "arr": 600, "dep": 610, "platform": "P1"} for i in range(201)]
    res = client.post("/api/replan", json=body(trains=trains))
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "LIMIT_EXCEEDED"


def test_invalid_plan_goes_to_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(_data: dict[str, Any], time_limit: float = 5.0, profile: str = "x") -> dict[str, Any]:
        return {
            "status": "OPTIMAL",
            "plan": [
                {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
                {"train_id": "T2", "platform": "P1", "arr": 605, "dep": 615},
            ],
            "unscheduled": [],
            "warnings": [],
            "previous_plan": [],
            "diff": [],
        }

    monkeypatch.setattr(api_main, "replan_with_diff", fake)
    out = client.post("/api/replan", json=body(delays=[])).json()
    assert out["alternatives"] == []
    assert len(out["rejected_plans"]) == 1
    assert out["rejected_plans"][0]["validation"]["valid"] is False
