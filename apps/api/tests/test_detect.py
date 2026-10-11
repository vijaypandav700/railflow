from typing import Any

from fastapi.testclient import TestClient
from railflow_api.main import app

client = TestClient(app)

DATA: dict[str, Any] = {
    "station": {"gap": 5, "platforms": ["P1"], "dwell_min": 2, "max_hold": 120},
    "trains": [{"id": "T1", "arr": 600, "dep": 610}, {"id": "T2", "arr": 605, "dep": 615}],
    "closures": [],
    "plan": [
        {"train_id": "T1", "platform": "P1", "arr": 600, "dep": 610},
        {"train_id": "T2", "platform": "P1", "arr": 605, "dep": 615},
    ],
}


def test_detect_returns_overlap() -> None:
    res = client.post("/api/plan/detect", json=DATA)
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["conflicts"][0]["type"] == "OVERLAP"


def test_detect_malformed_is_422() -> None:
    res = client.post("/api/plan/detect", json={})
    assert res.status_code == 422
