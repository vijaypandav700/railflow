from typing import Any

import pytest
from pydantic import ValidationError
from railflow.domain import MAX_PLATFORMS, MAX_TRAINS, Scenario


def sample() -> dict[str, Any]:
    return {
        "id": "S-test",
        "station": {
            "name": "Vortexa Junction",
            "gap": 5,
            "platforms": ["P1", "P2"],
            "defaults": {"dwell_min": 2, "max_hold": 120, "closure_buffer": 5},
        },
        "trains": [
            {
                "id": "T101",
                "name": "Vortexa Express",
                "class": "express",
                "arr": "09:10",
                "dep": "09:25",
                "required_platform": None,
                "platform": "P1",
            },
            {"id": "T102", "arr": "09:40", "dep": "09:50"},
        ],
        "now": "09:00",
    }


def put(data: dict[str, Any], path: str, value: Any) -> dict[str, Any]:
    keys = path.split(".")
    node: Any = data
    for key in keys[:-1]:
        node = node[int(key)] if key.isdigit() else node[key]
    last = keys[-1]
    node[int(last) if last.isdigit() else last] = value
    return data


def expect_error(data: dict[str, Any], text: str) -> ValidationError:
    with pytest.raises(ValidationError) as info:
        Scenario.model_validate(data)
    assert text in str(info.value)
    return info.value


def test_valid_parses() -> None:
    scenario = Scenario.model_validate(sample())
    assert scenario.now == 540
    assert scenario.trains[0].arr == 550
    assert scenario.trains[0].train_class == "express"
    assert scenario.trains[1].train_class == "local"
    assert scenario.station.closure_buffer == 5


def test_roundtrip_json() -> None:
    scenario = Scenario.model_validate(sample())
    dumped = scenario.model_dump(mode="json", by_alias=True)
    assert dumped["now"] == "09:00"
    assert dumped["trains"][0]["arr"] == "09:10"
    assert dumped["trains"][0]["class"] == "express"
    assert Scenario.model_validate(dumped) == scenario


def test_closure_buffer_defaults_to_gap() -> None:
    data = put(sample(), "station.defaults.closure_buffer", None)
    assert Scenario.model_validate(data).station.closure_buffer == 5
    data = put(data, "station.gap", 8)
    assert Scenario.model_validate(data).station.closure_buffer == 8


def test_past_midnight_train() -> None:
    data = sample()
    put(data, "trains.1.arr", "23:50")
    put(data, "trains.1.dep", "00:10+1d")
    scenario = Scenario.model_validate(data)
    assert scenario.trains[1].dep == 1450


@pytest.mark.parametrize(
    ("path", "value", "text"),
    [
        ("trains.1.id", "T101", "duplicate train id"),
        ("trains.0.dep", "09:00", "departure before arrival"),
        ("trains.0.platform", "P9", "unknown platform"),
        ("trains.0.required_platform", "P9", "unknown platform"),
        ("trains.0.arr", "25:00", "time out of range"),
        ("trains.0.arr", 3000, "less than"),
        ("trains.0.class", "turbo", "Input should be"),
        ("trains.0.extra", 1, "Extra inputs"),
        ("station.platforms", [], "at least 1"),
        ("station.platforms", ["P1", "P1"], "duplicate platform"),
        ("station.gap", -1, "greater than or equal to 0"),
        ("now", "99:99", "time out of range"),
    ],
)
def test_rejects_bad_input(path: str, value: Any, text: str) -> None:
    expect_error(put(sample(), path, value), text)


def test_error_names_field() -> None:
    error = expect_error(put(sample(), "trains.0.arr", "25:00"), "time out of range")
    locs = [".".join(str(p) for p in item["loc"]) for item in error.errors()]
    assert "trains.0.arr" in locs


def test_train_limit() -> None:
    data = sample()
    data["trains"] = [{"id": f"T{i}", "arr": "09:00", "dep": "09:10"} for i in range(MAX_TRAINS)]
    assert len(Scenario.model_validate(data).trains) == MAX_TRAINS
    data["trains"].append({"id": "TX", "arr": "09:00", "dep": "09:10"})
    expect_error(data, "at most 200")


def test_platform_limit() -> None:
    data = sample()
    data["station"]["platforms"] = [f"P{i}" for i in range(MAX_PLATFORMS)]
    assert len(Scenario.model_validate(data).station.platforms) == MAX_PLATFORMS
    data["station"]["platforms"].append("PX")
    expect_error(data, "at most 12")
