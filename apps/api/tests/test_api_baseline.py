from typing import Any

from fastapi.testclient import TestClient
from railflow_api.main import app

client = TestClient(app)


def body() -> dict[str, Any]:
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


def test_compare_returns_baselines_and_ours() -> None:
    res = client.post("/api/baseline/compare", json=body())
    assert res.status_code == 200
    out: dict[str, Any] = res.json()
    assert set(out["baselines"]) == {"push_later", "first_fit"}
    assert set(out["ours"]) == {"min_change", "min_delay"}
    assert out["ours_beats_or_ties"] is True


def test_compare_malformed_is_422() -> None:
    assert client.post("/api/baseline/compare", json={}).status_code == 422
