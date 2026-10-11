"""Generate scenarios/S01..S06. Run: python3 scripts/gen_scenarios.py"""

import json
from pathlib import Path
from typing import Any

Json = dict[str, Any]
Row = tuple[str, str, str, str, str]  # id, class, arr, dep, platform


def build(
    scenario_id: str,
    platforms: list[str],
    rows: list[Row],
    now: str = "09:00",
    delays: list[Json] | None = None,
    closures: list[Json] | None = None,
) -> Json:
    return {
        "id": scenario_id,
        "station": {
            "name": "Vortexa Junction",
            "gap": 5,
            "platforms": platforms,
            "defaults": {"dwell_min": 2, "max_hold": 120, "closure_buffer": 5},
        },
        "trains": [
            {
                "id": tid,
                "class": cls,
                "arr": arr,
                "dep": dep,
                "required_platform": None,
                "platform": platform,
            }
            for tid, cls, arr, dep, platform in sorted(rows)
        ],
        "now": now,
        "delays": delays or [],
        "closures": closures or [],
    }


FOUR = ["P1", "P2", "P3", "P4"]

# S01: 12 trains, 4 platforms, all gaps >= 5, no disruption.
S01: list[Row] = [
    ("T101", "express", "09:10", "09:25", "P1"),
    ("T105", "local", "09:40", "09:55", "P1"),
    ("T109", "local", "10:30", "10:45", "P1"),
    ("T102", "local", "09:00", "09:20", "P2"),
    ("T106", "express", "09:30", "09:50", "P2"),
    ("T110", "express", "10:15", "10:30", "P2"),
    ("T103", "premium", "09:15", "09:30", "P3"),
    ("T107", "local", "09:45", "10:00", "P3"),
    ("T111", "local", "10:20", "10:35", "P3"),
    ("T104", "local", "09:05", "09:15", "P4"),
    ("T108", "local", "09:25", "09:40", "P4"),
    ("T112", "local", "10:00", "10:15", "P4"),
]

# S02: overlap T401/T402 (5 min), gap too short T402/T403 (3) and T404/T405 (2).
S02: list[Row] = [
    ("T401", "local", "09:00", "09:20", "P1"),
    ("T402", "express", "09:15", "09:35", "P1"),
    ("T403", "local", "09:37", "09:50", "P1"),
    ("T404", "local", "09:10", "09:25", "P2"),
    ("T405", "local", "09:28", "09:40", "P2"),
    ("T406", "local", "09:00", "09:15", "P3"),
    ("T407", "local", "09:20", "09:35", "P3"),
    ("T408", "premium", "10:00", "10:10", "P3"),
]

# S03: P1 packed (gap exactly 5). T101 +25 pushes into T105 and T109.
S03: list[Row] = [r for r in S01 if r[0] not in ("T105", "T109")] + [
    ("T105", "local", "09:30", "09:45", "P1"),
    ("T109", "local", "09:50", "10:05", "P1"),
]
DELAY_T101 = [{"train_id": "T101", "minutes": 25}]

# S04: P2 closed 10:00-11:30. T202 leaves exactly at the closure buffer boundary.
S04: list[Row] = [
    ("T201", "local", "09:30", "09:45", "P1"),
    ("T205", "local", "10:10", "10:25", "P1"),
    ("T209", "express", "11:00", "11:15", "P1"),
    ("T202", "local", "09:40", "09:55", "P2"),
    ("T206", "express", "10:15", "10:30", "P2"),
    ("T210", "local", "10:50", "11:05", "P2"),
    ("T203", "local", "09:50", "10:05", "P3"),
    ("T207", "local", "10:40", "10:55", "P3"),
    ("T211", "premium", "11:20", "11:35", "P3"),
    ("T204", "local", "10:00", "10:15", "P4"),
    ("T208", "local", "10:45", "11:00", "P4"),
    ("T212", "local", "11:40", "11:55", "P4"),
]
CLOSURE_P2 = [{"id": "C1", "platform": "P2", "start": "10:00", "end": "11:30"}]

# S06: 6 trains in 40 min on 3 platforms. T301 +15 clashes with T304.
S06: list[Row] = [
    ("T301", "express", "09:00", "09:10", "P1"),
    ("T304", "local", "09:20", "09:30", "P1"),
    ("T302", "local", "09:05", "09:15", "P2"),
    ("T305", "premium", "09:25", "09:35", "P2"),
    ("T303", "local", "09:10", "09:20", "P3"),
    ("T306", "express", "09:30", "09:40", "P3"),
]

FILES: dict[str, Json] = {
    "S01-clean-day": build("S01-clean-day", FOUR, S01),
    "S02-injected-conflicts": build("S02-injected-conflicts", ["P1", "P2", "P3"], S02),
    "S03-single-delay": build("S03-single-delay", FOUR, S03, delays=DELAY_T101),
    "S04-midday-closure": build("S04-midday-closure", FOUR, S04, closures=CLOSURE_P2),
    "S05-delay-plus-closure": build(
        "S05-delay-plus-closure", FOUR, S03, delays=DELAY_T101, closures=CLOSURE_P2
    ),
    "S06-rush-hour": build(
        "S06-rush-hour",
        ["P1", "P2", "P3"],
        S06,
        now="08:55",
        delays=[{"train_id": "T301", "minutes": 15}],
    ),
}

out = Path(__file__).parents[1] / "scenarios"
out.mkdir(exist_ok=True)
for name, data in FILES.items():
    with (out / f"{name}.json").open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
print(len(FILES), "scenarios")
