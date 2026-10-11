"""Writes contracts/differential_vectors.json with Python verdicts. Run: python gen_differential.py [N]."""

import copy
import json
import random
import sys
from pathlib import Path
from typing import Any

from railflow.reasons import replan_with_diff
from railflow.solver import assign
from railflow.validator import validate

Json = dict[str, Any]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
OUT = Path(__file__).resolve().parents[3] / "contracts" / "differential_vectors.json"
KINDS = [
    "none",
    "none",
    "none",
    "drop",
    "duplicate",
    "shift_early",
    "hold_long",
    "unknown_platform",
    "clash",
    "gap_squeeze",
    "short_dwell",
    "bad_reason",
    "good_unsched",
    "strip_reason",
    "frozen_change",
    "wrong_required",
    "ok_required",
    "closure_hit",
    "unknown_train",
]
JUNK: list[Any] = [{}, None, {"station": {"gap": 5}}]


def base(rng: random.Random) -> Json | None:
    platforms = [f"P{i}" for i in range(1, rng.randint(2, 4) + 1)]
    trains: list[Json] = []
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
    closures: list[Json] = []
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
    data: Json = {
        "station": station,
        "trains": kept,
        "closures": closures,
        "delays": delays,
        "now": now,
    }
    out = replan_with_diff(data)
    if out["status"] not in ("OPTIMAL", "FEASIBLE"):
        return None
    return {
        **data,
        "plan": out["plan"],
        "unscheduled": out["unscheduled"],
        "previous_plan": out["previous_plan"],
        "diff": out["diff"],
    }


def mutate(inp: Json, kind: str, rng: random.Random) -> bool:
    rows: list[Json] = inp["plan"]
    if len(rows) < 2:
        return False
    i = rng.randrange(len(rows))
    j = (i + 1) % len(rows)
    r, s = rows[i], rows[j]
    if kind == "drop":
        rows.pop(i)
    elif kind == "duplicate":
        rows.append(dict(r))
    elif kind == "shift_early":
        r["arr"] -= 30
        r["dep"] -= 30
    elif kind == "hold_long":
        r["arr"] += 300
        r["dep"] += 300
    elif kind == "unknown_platform":
        r["platform"] = "P99"
    elif kind == "clash":
        s.update(platform=r["platform"], arr=r["arr"] + 1, dep=r["dep"])
    elif kind == "gap_squeeze":
        s.update(platform=r["platform"], arr=r["dep"] + 1, dep=r["dep"] + 11)
    elif kind == "short_dwell":
        r["dep"] = r["arr"]
    elif kind == "bad_reason":
        inp["unscheduled"].append({"train_id": rows.pop(i)["train_id"], "reason": "BOGUS"})
    elif kind == "good_unsched":
        inp["unscheduled"].append(
            {"train_id": rows.pop(i)["train_id"], "reason": "NO_FEASIBLE_SLOT"}
        )
    elif kind == "strip_reason":
        hit = next((d for d in inp["diff"] if d["class"] != "KEPT"), None)
        if hit is None:
            return False
        hit["reasons"] = []
    elif kind == "frozen_change":
        prev = inp["previous_plan"]
        frozen = {p["train_id"] for p in prev if p["arr"] <= inp["now"]}
        row = next((x for x in rows if x["train_id"] in frozen), None)
        if row is None:
            return False
        row["arr"] += 3
        row["dep"] += 3
    elif kind in ("wrong_required", "ok_required"):
        train = next(t for t in inp["trains"] if t["id"] == r["train_id"])
        other = next((p for p in inp["station"]["platforms"] if p != r["platform"]), "P1")
        train["required_platform"] = other if kind == "wrong_required" else r["platform"]
    elif kind == "closure_hit":
        inp["closures"].append(
            {"id": "CX", "platform": r["platform"], "start": r["arr"] - 2, "end": r["dep"] + 2}
        )
    elif kind == "unknown_train":
        r["train_id"] = "TX99"
    return True


def digest(result: Json) -> Json:
    errors: Json = {}
    for c in result["checks"]:
        found = [
            json.dumps(sorted(e.get("trains", [])), separators=(",", ":"))
            for e in c.get("errors", [])
        ]
        errors[c["id"]] = sorted(found)
    return {
        "valid": result["valid"],
        "expect": {c["id"]: c["ok"] for c in result["checks"]},
        "warnings": [w["code"] for w in result.get("warnings", [])],
        "errors": errors,
    }


def main() -> None:
    vectors: list[Json] = []
    for n, raw in enumerate(JUNK):
        vectors.append({"name": f"junk_{n}", "input": raw, **digest(validate(raw))})
    i = 0
    while len(vectors) < N:
        i += 1
        rng = random.Random(i)
        inp = base(rng)
        if inp is None:
            continue
        kind = rng.choice(KINDS)
        inp = copy.deepcopy(inp)
        if not mutate(inp, kind, rng):
            kind = "none"
        vectors.append({"name": f"v{i:05d}_{kind}", "input": inp, **digest(validate(inp))})
    OUT.write_text(json.dumps(vectors), encoding="utf-8")
    good = sum(1 for v in vectors if v["valid"])
    print(f"wrote {len(vectors)} vectors: {good} valid, {len(vectors) - good} invalid -> {OUT}")


main()
