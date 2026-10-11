"""Generate S07-S12 from the S04 template. Run: uv run python tools/gen_scenarios.py"""

import copy
import json
import random
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "scenarios"
tpl: dict[str, Any] = json.loads((ROOT / "S04-midday-closure.json").read_text())


def hm(m: int) -> str:
    return f"{(m // 60) % 24:02d}:{m % 60:02d}" + ("+1d" if m >= 1440 else "")


def train(
    i: str, arr: int, dep: int, cls: str = "local", req: str | None = None, plat: str = "P1"
) -> dict[str, Any]:
    return {
        "id": i,
        "class": cls,
        "arr": hm(arr),
        "dep": hm(dep),
        "required_platform": req,
        "platform": plat,
    }


def closure(cid: str, platform: str, start: int, end: int) -> dict[str, Any]:
    base = copy.deepcopy(tpl["closures"][0])
    for key in ("id", "platform", "start", "end"):
        assert key in base, f"S04 closure has no key {key}"
    base.update({"id": cid, "platform": platform, "start": hm(start), "end": hm(end)})
    return base


def build(
    sid: str,
    trains: list[dict[str, Any]],
    closures: list[dict[str, Any]],
    now: int,
    delays: list[dict[str, Any]] | None = None,
    platforms: list[str] | None = None,
) -> None:
    s = copy.deepcopy(tpl)
    s["id"] = sid
    s["trains"] = trains
    s["closures"] = closures
    s["delays"] = delays or []
    s["now"] = hm(now)
    if platforms:
        s["station"]["platforms"] = platforms
    (ROOT / f"{sid}.json").write_text(json.dumps(s, indent=2) + "\n")


build(
    "S07-required-platform-clash",
    [
        train("T701", 600, 615, req="P1"),
        train("T702", 608, 620, req="P1"),
        train("T703", 610, 625, plat="P2"),
    ],
    [],
    590,
)

build(
    "S08-capacity-exceeded",
    [train(f"T80{i}", 600 + 2 * i, 615 + 2 * i, plat=f"P{i % 4 + 1}") for i in range(1, 7)],
    [closure("C1", "P2", 570, 700), closure("C2", "P3", 570, 700), closure("C3", "P4", 570, 700)],
    590,
)

build(
    "S09-replan-midday",
    [
        train("T901", 605, 625, plat="P1"),
        train("T902", 610, 630, plat="P2"),
        train("T903", 620, 640, plat="P1"),
        train("T904", 630, 650, plat="P2"),
    ],
    [closure("C1", "P3", 640, 700)],
    615,
    [{"train_id": "T903", "minutes": 15}],
)

build(
    "S10-past-midnight",
    [
        train("T101A", 1420, 1435, plat="P1"),
        train("T102A", 1430, 1450, plat="P2"),
        train("T103A", 1445, 1460, plat="P1"),
        train("T104A", 1500, 1515, plat="P2"),
    ],
    [],
    1410,
)

build(
    "S11-closure-under-train",
    [
        train("T111", 600, 630, plat="P1"),
        train("T112", 640, 655, plat="P1"),
        train("T113", 610, 625, plat="P2"),
    ],
    [closure("C1", "P1", 620, 700)],
    610,
)

rng = random.Random(12)
big = []
for n in range(60):
    arr = rng.randint(540, 1080)
    big.append(
        train(
            f"T{1200 + n}",
            arr,
            arr + rng.randint(8, 15),
            rng.choice(["local", "local", "express", "premium"]),
            None,
            f"P{rng.randint(1, 6)}",
        )
    )
build("S12-large-day", big, [], 535, platforms=[f"P{i}" for i in range(1, 7)])
print("written")
