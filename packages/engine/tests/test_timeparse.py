import pytest
from railflow.timeparse import HORIZON, TimeParseError, format_time, parse_time


@pytest.mark.parametrize(
    ("text", "minutes"),
    [
        ("00:00", 0),
        ("09:10", 550),
        ("23:59", 1439),
        ("00:00+1d", 1440),
        ("01:30+1d", 1530),
        ("23:59+1d", 2879),
    ],
)
def test_parse_valid(text: str, minutes: int) -> None:
    assert parse_time(text) == minutes


@pytest.mark.parametrize(
    "text",
    ["", "9:10", "09:5", "24:00", "12:60", "12:00+2d", "12:00+1D", "12:00\n", "ab:cd", "12:00 "],
)
def test_parse_invalid(text: str) -> None:
    with pytest.raises(TimeParseError):
        parse_time(text)


def test_roundtrip_every_minute() -> None:
    for minutes in range(HORIZON):
        assert parse_time(format_time(minutes)) == minutes


@pytest.mark.parametrize("minutes", [-1, HORIZON, 99999])
def test_format_out_of_range(minutes: int) -> None:
    with pytest.raises(TimeParseError):
        format_time(minutes)


def test_format_next_day_suffix() -> None:
    assert format_time(1440) == "00:00+1d"
    assert format_time(1439) == "23:59"
