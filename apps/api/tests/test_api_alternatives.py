from typing import Any

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
        "delays": [{"train_id": "T1", "minutes": 20}],
        "now": 0,
    }
    data.update(over)
    return data


def test_alternatives_distinct_valid_with_insights() -> None:
    out: dict[str, Any] = client.post("/api/replan", json=body()).json()
    alts: list[dict[str, Any]] = out["alternatives"]
    assert len(alts) == 2
    assert len({repr(a["plan"]) for a in alts}) == len(alts)
    for a in alts:
        assert a["validation"]["valid"] is True
        assert "total_delay" in a["metrics"]
        assert "cascade" in a and "facts" in a
    assert {a["profile"] for a in alts} == {"min_change", "min_delay"}


def test_unknown_profile_is_422() -> None:
    res = client.post("/api/replan", json=body(profiles=["nope"]))
    assert res.status_code == 422
