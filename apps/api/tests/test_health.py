from fastapi.testclient import TestClient
from railflow_api.main import app

client = TestClient(app)


def test_health() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": "0.0.0"}
