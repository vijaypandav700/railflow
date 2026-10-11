import json
from pathlib import Path
from typing import Any

import pytest
from railflow.validator import validate

VECTORS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[3] / "contracts" / "golden_vectors.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["name"])
def test_golden_vector(vector: dict[str, Any]) -> None:
    result = validate(vector["input"])
    got = {c["id"]: c["ok"] for c in result["checks"]}
    assert got == vector["expect"]
    assert result["valid"] is vector["valid"]


def test_malformed_input_is_invalid() -> None:
    result = validate({})
    assert result["valid"] is False
    assert result["checks"][0]["id"] == "INPUT"


def test_error_names_trains_and_platform() -> None:
    vector = next(v for v in VECTORS if v["name"] == "v4_overlap")
    errors = next(c for c in validate(vector["input"])["checks"] if c["id"] == "V4")["errors"]
    assert errors[0]["trains"] == ["T1", "T2"]
    assert errors[0]["platform"] == "P1"
    assert errors[0]["minutes"] == 5


def test_gap_shortfall_amount() -> None:
    vector = next(v for v in VECTORS if v["name"] == "v5_gap_short")
    errors = next(c for c in validate(vector["input"])["checks"] if c["id"] == "V5")["errors"]
    assert errors[0]["shortfall"] == 2
