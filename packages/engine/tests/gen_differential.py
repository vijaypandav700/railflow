"""Generate differential vectors for the TS twin. Run: uv run python packages/engine/tests/gen_differential.py"""

import json
import random
from pathlib import Path
from typing import Any

from railflow.reasons import replan_with_diff
from railflow.solver import assign
from railflow.validator import validate

OUT = Path(__file__).resolve().parents[3] / "contracts" / "differential_vectors.json"
TARGET = 2000
KINDS = [
    "none",
    "drop",
    "duplicate",
    "shift_early",
    "shift_late",
    "unknown_platform",
    "clash",
    "jitter",
    "edge_gap",
    "bad_reason",
    "strip_diff",
]


def build(seed: int) -> dict[str, Any] | None:
    rng = random.Random(seed)
    platforms = [f"P{i}" for i in range(1, rng.randint(2, 4) + 1)]
    trains: list[dict[str, Any]] = []
    for i in range(rng.randint(3, 9)):
        arr = rng.randint(600, 700)
        trains.append(
            {
                "id": f"T{i + 1:02d}",
                "arr": arr,
                "dep": arr + rng.randint(5, 20),
                "class": rng.choice(["local", "express", "premium"]),
                "platform": platforms[0],
            }
        )
    station = {"gap": 5, "platforms": platforms, "dwell_min": 2, "max_hold": 120}
    first = assign({"station": station, "trains": trains, "closures": [], "delays": [], "now": 0})
    placed = {r["train_id"]: r["platform"] for r in first["plan"]}
    kept = [{**t, "platform": placed[t["id"]]} for t in trains if t["id"] in placed]
    if len(kept) < 3:
        return None
    now = rng.choice([0, rng.randint(590, 690)])
    delays = [
        {"train_id": t["id"], "minutes": rng.randint(1, 40)}
        for t in kept
        if t["arr"] > now and rng.random() < 0.4
    ]
    closures: list[dict[str, Any]] = []
    if rng.random() < 0.6:
        start = rng.randint(now + 1, 720)
        closures.append(
            {
                "id": "C1",
                "platform": rng.choice(platforms),
                "start": start,
                "end": start + rng.randint(10, 60),
            }
        )
    return {"station": station, "trains": kept, "closures": closures, "delays": delays, "now": now}


def mutate(
    plan: list[dict[str, Any]], kind: str, gap: int, rng: random.Random
) -> list[dict[str, Any]] | None:
    rows = [dict(r) for r in plan]
    if len(rows) < 2:
        return None
    i = rng.randrange(len(rows))
    j = (i + 1) % len(rows)
    if kind == "drop":
        rows.pop(i)
    elif kind == "duplicate":
        rows.append(dict(rows[i]))
    elif kind == "shift_early":
        rows[i]["arr"] -= rng.randint(1, 30)
        rows[i]["dep"] -= rng.randint(1, 30)
    elif kind == "shift_late":
        rows[i]["arr"] += rng.randint(1, 15)
    elif kind == "unknown_platform":
        rows[i]["platform"] = "P99"
    elif kind == "clash":
        rows[j] = {**rows[j], "platform": rows[i]["platform"], "arr": rows[i]["arr"] + 1}
    elif kind == "jitter":
        rows[i]["arr"] += rng.randint(-3, 3)
        rows[i]["dep"] += rng.randint(-3, 3)
    elif kind == "edge_gap":
        arr = rows[i]["dep"] + gap + rng.choice([-1, 0, 1])
        rows[j] = {**rows[j], "platform": rows[i]["platform"], "arr": arr, "dep": arr + 10}
    else:
        return None
    return rows


def main() -> None:
    vectors: list[dict[str, Any]] = []
    seed = 0
    while len(vectors) < TARGET:
        seed += 1
        data = build(seed)
        if data is None:
            continue
        out = replan_with_diff(data)
        if out["status"] not in ("OPTIMAL", "FEASIBLE"):
            continue
        rng = random.Random(seed)
        for kind in KINDS:
            plan: list[dict[str, Any]] = out["plan"]
            unsched: list[dict[str, Any]] = out["unscheduled"]
            diff: list[dict[str, Any]] = out["diff"]
            if kind in ("none", "bad_reason", "strip_diff"):
                if kind == "bad_reason":
                    unsched = [{"train_id": u["train_id"], "reason": "BOGUS"} for u in unsched] or [
                        {"train_id": plan[0]["train_id"], "reason": "BOGUS"}
                    ]
                if kind == "strip_diff":
                    diff = [{**d, "reasons": []} if d["class"] != "KEPT" else d for d in diff]
            else:
                bad = mutate(plan, kind, data["station"]["gap"], rng)
                if bad is None or bad == plan:
                    continue
                plan = bad
            inp: dict[str, Any] = {
                **data,
                "plan": plan,
                "unscheduled": unsched,
                "previous_plan": out["previous_plan"],
                "diff": diff,
            }
            res = validate(inp)
            vectors.append(
                {
                    "name": f"s{seed}_{kind}",
                    "valid": bool(res["valid"]),
                    "expect": {c["id"]: bool(c["ok"]) for c in res["checks"]},
                    "warnings": [w["code"] for w in res["warnings"]],
                    "input": inp,
                }
            )
    vectors = vectors[:TARGET]
    OUT.write_text(json.dumps(vectors))
    ok = sum(1 for v in vectors if v["valid"])
    print(f"wrote {len(vectors)} vectors to {OUT}: {ok} valid, {len(vectors) - ok} invalid")
    for n in range(1, 11):
        fails = sum(1 for v in vectors if v["expect"].get(f"V{n}") is False)
        print(f"  V{n}: {fails} failing vectors")


main()
