"""Time parsing and formatting. Rule R1: integer minutes since 00:00, horizon 2880."""

import re

DAY = 1440
HORIZON = 2880  # 48 h

_PATTERN = re.compile(r"([0-9]{2}):([0-9]{2})(\+1d)?")


class TimeParseError(ValueError):
    """Raised when a time string or minute value is invalid."""


def parse_time(text: str) -> int:
    """Convert "HH:MM" or "HH:MM+1d" to minutes since 00:00 of the service day."""
    match = _PATTERN.fullmatch(text)
    if match is None:
        raise TimeParseError(f"invalid time {text!r}, expected HH:MM or HH:MM+1d")
    hours, minutes = int(match.group(1)), int(match.group(2))
    if hours > 23 or minutes > 59:
        raise TimeParseError(f"time out of range: {text!r}")
    return hours * 60 + minutes + (DAY if match.group(3) else 0)


def format_time(minutes: int) -> str:
    """Convert minutes to "HH:MM", with "+1d" after midnight."""
    if not 0 <= minutes < HORIZON:
        raise TimeParseError(f"minutes out of range 0..{HORIZON - 1}: {minutes}")
    day, rest = divmod(minutes, DAY)
    suffix = "+1d" if day else ""
    return f"{rest // 60:02d}:{rest % 60:02d}{suffix}"
