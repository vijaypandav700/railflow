import json
from pathlib import Path
from typing import Any

import pytest
from railflow.validator import validate

CHECK_IDS = [f"V{i}" for i in range(1, 11)]
VECTORS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[3] / "contracts" / "golden_vectors.json").read_text(encoding="utf-8")
)


def vector(name: str) -> dict[str, Any]:
    return next(v for v in VECTORS if v["name"] == name)


def failing(name: str, check_id: str) -> list[dict[str, Any]]:
    result = validate(vector(name)["input"])
    return next(c for c in result["checks"] if c["id"] == check_id)["errors"]


@pytest.mark.parametrize("item", VECTORS, ids=lambda v: v["name"])
def test_golden_vector(item: dict[str, Any]) -> None:
    result = validate(item["input"])
    got = {c["id"]: c["ok"] for c in result["checks"]}
    assert got == item["expect"]
    assert result["valid"] is item["valid"]
    assert [w["code"] for w in result["warnings"]] == item.get("warnings", [])


@pytest.mark.parametrize("check_id", CHECK_IDS)
def test_every_check_has_pass_and_fail_vector(check_id: str) -> None:
    assert any(v["expect"][check_id] for v in VECTORS)
    assert any(not v["expect"][check_id] for v in VECTORS)


def test_malformed_input_is_invalid() -> None:
    result = validate({})
    assert result["valid"] is False
    assert result["checks"][0]["id"] == "INPUT"
    assert result["warnings"] == []


def test_overlap_error_details() -> None:
    error = failing("v4_overlap", "V4")[0]
    assert error["trains"] == ["T1", "T2"]
    assert error["platform"] == "P1"
    assert error["minutes"] == 5


def test_gap_shortfall_amount() -> None:
    assert failing("v5_gap_short", "V5")[0]["shortfall"] == 2


def test_closure_error_names_closure() -> None:
    error = failing("v6_closure_hit", "V6")[0]
    assert error["trains"] == ["T2"]
    assert error["closure"] == "C1"


def test_timing_error_kinds() -> None:
    assert failing("v7_early_arrival", "V7")[0]["kind"] == "EARLY_ARRIVAL"
    assert failing("v7_hold_too_long", "V7")[0]["kind"] == "HOLD_TOO_LONG"
    assert failing("v7_early_departure", "V7")[0]["kind"] == "EARLY_DEPARTURE"
    assert failing("v7_short_dwell", "V7")[0]["kind"] == "SHORT_DWELL"


def test_deferred_warning_names_closure_and_train() -> None:
    warning = validate(vector("valid_closure_deferred")["input"])["warnings"][0]
    assert warning["closure"] == "C1"
    assert warning["trains"] == ["T1"]
