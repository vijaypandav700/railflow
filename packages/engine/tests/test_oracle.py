"""Oracle: brute force every assignment (<= 6 trains) and compare objective with CP-SAT."""

import random
from itertools import product
from typing import Any

from railflow.solver import CLASS_WEIGHT, W_MOVED, W_UNSCHED, assign

GAP = 5


def build(seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    platforms = ["P1", "P2"]
    trains: list[dict[str, Any]] = []
    for i in range(rng.randint(3, 6)):
        arr = rng.randint(600, 640)
        trains.append(
            {
                "id": f"T{i + 1}",
                "arr": arr,
                "dep": arr + rng.randint(5, 15),
                "class": rng.choice(["local", "express", "premium"]),
                "platform": rng.choice(platforms),
            }
        )
    return {
        "station": {"gap": GAP, "platforms": platforms, "dwell_min": 2, "max_hold": 120},
        "trains": trains,
        "closures": [],
        "delays": [],
        "now": 0,
    }


def cost(data: dict[str, Any], choice: tuple[str | None, ...]) -> int | None:
    platforms: list[str] = data["station"]["platforms"]
    trains = sorted(data["trains"], key=lambda t: t["id"])
    total = 0
    for i, (t, p) in enumerate(zip(trains, choice, strict=True)):
        if p is None:
            total += W_UNSCHED * CLASS_WEIGHT[t["class"]]
            continue
        total += (W_MOVED if p != t["platform"] else 0) + platforms.index(p)
        for u, q in zip(trains[:i], choice[:i], strict=True):
            if q == p and t["arr"] < u["dep"] + GAP and u["arr"] < t["dep"] + GAP:
                return None
    return total


def best(data: dict[str, Any]) -> int:
    options: list[str | None] = [*data["station"]["platforms"], None]
    costs = [cost(data, c) for c in product(options, repeat=len(data["trains"]))]
    return min(c for c in costs if c is not None)


def solver_cost(data: dict[str, Any]) -> int:
    out = assign(data)
    where = {r["train_id"]: r["platform"] for r in out["plan"]}
    trains = sorted(data["trains"], key=lambda t: t["id"])
    choice = tuple(where.get(t["id"]) for t in trains)
    value = cost(data, choice)
    assert value is not None
    return value


def test_solver_matches_brute_force() -> None:
    for seed in range(40):
        data = build(seed)
        assert solver_cost(data) == best(data), f"seed {seed}"
