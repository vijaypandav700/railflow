from typing import Any

from fastapi.testclient import TestClient
from railflow_api.main import app, audit

client = TestClient(app)


def replan_body() -> dict[str, Any]:
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


def test_event_then_list_and_verify() -> None:
    res = client.post("/api/audit/event", json={"type": "CONFIRM", "payload": {"ids": ["d1"]}})
    assert res.status_code == 200
    out: dict[str, Any] = client.get("/api/audit").json()
    assert out["entries"][0]["type"] == "CONFIRM"
    assert client.get("/api/audit/verify").json()["ok"] is True


def test_replan_is_logged() -> None:
    client.post("/api/replan", json=replan_body())
    assert client.get("/api/audit").json()["entries"][0]["type"] == "REPLAN"


def test_client_cannot_forge_replan() -> None:
    res = client.post("/api/audit/event", json={"type": "REPLAN", "payload": {}})
    assert res.status_code == 422


def test_oversize_payload_rejected() -> None:
    big = {"type": "PARSE", "payload": {"text": "x" * 20_000}}
    assert client.post("/api/audit/event", json=big).status_code == 422


def test_tamper_detected_through_api() -> None:
    client.post("/api/audit/event", json={"type": "PARSE", "payload": {"text": "a"}})
    db = audit.raw()
    db.execute("UPDATE audit SET payload = '{}' WHERE seq = (SELECT MAX(seq) FROM audit)")
    db.commit()
    out: dict[str, Any] = client.get("/api/audit/verify").json()
    assert out["ok"] is False and out["first_broken"] is not None
