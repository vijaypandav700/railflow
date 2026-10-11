from fastapi.testclient import TestClient
from railflow_api.main import app

client = TestClient(app)


def test_list_has_twelve_or_more_named_scenarios() -> None:
    ids = [s["id"] for s in client.get("/api/scenarios").json()]
    assert any(i.startswith("S03") for i in ids)
    assert len(ids) >= 6


def test_fetch_scenario_is_replan_ready() -> None:
    ids = [s["id"] for s in client.get("/api/scenarios").json()]
    sid = next(i for i in ids if i.startswith("S03"))
    res = client.post("/api/replan", json=client.get(f"/api/scenarios/{sid}").json())
    assert res.status_code == 200
    assert res.json()["alternatives"][0]["validation"]["valid"] is True


def test_unknown_scenario_is_404() -> None:
    res = client.get("/api/scenarios/S99-nope")
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "SCENARIO_UNKNOWN"
