"""Generate contracts/golden_vectors.json. Run: python3 scripts/gen_golden_vectors.py"""

import copy
import json
from pathlib import Path
from typing import Any

Json = dict[str, Any]
ALL = [f"V{i}" for i in range(1, 11)]


def row(train_id: str, platform: str, arr: int, dep: int) -> Json:
    return {"train_id": train_id, "platform": platform, "arr": arr, "dep": dep}


def train(train_id: str, arr: int, dep: int, platform: str, required: str | None = None) -> Json:
    return {
        "id": train_id,
        "class": "local",
        "arr": arr,
        "dep": dep,
        "required_platform": required,
        "platform": platform,
    }


def station(**over: Any) -> Json:
    data: Json = {
        "gap": 5,
        "platforms": ["P1", "P2"],
        "dwell_min": 2,
        "max_hold": 120,
        "closure_buffer": 5,
    }
    data.update(over)
    return data


def closure(closure_id: str, platform: str, start: int, end: int) -> Json:
    return {"id": closure_id, "platform": platform, "start": start, "end": end}


def unsched(train_id: str, reason: str | None = "NO_FEASIBLE_SLOT") -> Json:
    item: Json = {"train_id": train_id}
    if reason is not None:
        item["reason"] = reason
    return item


T1P = row("T1", "P1", 540, 555)
T2P = row("T2", "P1", 560, 570)
T3P = row("T3", "P2", 545, 560)
BASE_PLAN = [T1P, T2P, T3P]
MOVED_PLAN = [T1P, row("T2", "P2", 565, 570), T3P]
BASE_TRAINS = [train("T1", 540, 555, "P1"), train("T2", 550, 570, "P1"), train("T3", 545, 560, "P2")]

base: Json = {
    "station": station(),
    "trains": BASE_TRAINS,
    "delays": [],
    "closures": [],
    "now": 0,
    "previous_plan": None,
    "diff": None,
    "plan": BASE_PLAN,
    "unscheduled": [],
}

vectors: list[Json] = []


def add(name: str, failing: list[str], warnings: list[str] | None = None, **changes: Any) -> None:
    data = copy.deepcopy(base)
    data.update(copy.deepcopy(changes))
    vector: Json = {
        "name": name,
        "valid": not failing,
        "expect": {c: c not in failing for c in ALL},
        "input": data,
    }
    if warnings:
        vector["warnings"] = warnings
    vectors.append(vector)


# valid baselines
add("valid_gap_exactly_g", [])
add("valid_train_unscheduled", [], plan=[T1P, T2P], unscheduled=[unsched("T3")])

# V1-V5
add("v1_missing_train", ["V1"], plan=[T1P, T2P])
add("v1_train_twice", ["V1"], unscheduled=[unsched("T3")])
add("v1_unknown_train", ["V1"], plan=BASE_PLAN + [row("T9", "P2", 600, 610)])
add("v2_unknown_platform", ["V2"], plan=[T1P, T2P, row("T3", "P9", 545, 560)])
add(
    "v3_required_platform",
    ["V3"],
    trains=[train("T1", 540, 555, "P1"), train("T2", 550, 570, "P1"),
            train("T3", 545, 560, "P2", required="P1")],
)
add("v4_overlap", ["V4"], plan=[T1P, row("T2", "P1", 550, 570), T3P])
add("v5_gap_short", ["V5"], plan=[T1P, row("T2", "P1", 558, 570), T3P])

# V6 closures
add("v6_closure_hit", ["V6"], closures=[closure("C1", "P1", 565, 600)])
add("valid_closure_boundary", [], closures=[closure("C1", "P1", 575, 600)])
add("v6_buffer_violated", ["V6"], closures=[closure("C1", "P1", 574, 600)])
add("valid_arrival_at_closure_end", [], closures=[closure("C1", "P2", 500, 545)])
add("valid_closure_buffer_zero", [], station=station(closure_buffer=0),
    closures=[closure("C1", "P1", 572, 600)])
add("valid_closure_deferred", [], warnings=["CLOSURE_DEFERRED"], now=550,
    previous_plan=BASE_PLAN, closures=[closure("C1", "P1", 545, 560)])
add("v6_deferred_closure_blocks_later_train", ["V6"], warnings=["CLOSURE_DEFERRED"], now=550,
    previous_plan=BASE_PLAN, closures=[closure("C1", "P1", 545, 600)])

# V7 timing
add("v7_early_arrival", ["V7"], delays=[{"train_id": "T2", "minutes": 15}])
add("valid_delay_with_hold", [], delays=[{"train_id": "T2", "minutes": 15}],
    plan=[T1P, row("T2", "P1", 565, 570), T3P])
add("v7_hold_too_long", ["V7"], station=station(max_hold=5))
add("v7_early_departure", ["V7"], plan=[T1P, row("T2", "P1", 560, 569), T3P])
add("v7_short_dwell", ["V7"],
    trains=[train("T1", 540, 555, "P1"), train("T2", 550, 570, "P1"), train("T3", 545, 546, "P2")],
    plan=[T1P, T2P, row("T3", "P2", 545, 546)])

# V8 frozen
add("valid_frozen_unchanged", [], now=550, previous_plan=BASE_PLAN)
add("valid_nonfrozen_moved", [], now=550, previous_plan=BASE_PLAN, plan=MOVED_PLAN)
add("v8_frozen_moved", ["V8"], now=550, previous_plan=BASE_PLAN,
    plan=[row("T1", "P1", 541, 555), T2P, T3P])
add("v8_frozen_unscheduled", ["V8"], now=550, previous_plan=BASE_PLAN,
    plan=[T1P, T2P], unscheduled=[unsched("T3")])
add("v8_departed_dep_changed", ["V8"], now=560, previous_plan=BASE_PLAN,
    plan=[T1P, T2P, row("T3", "P2", 545, 561)])

# V9 reasons
add("v9_unknown_reason", ["V9"], plan=[T1P, T2P], unscheduled=[unsched("T3", "BECAUSE")])
add("v9_missing_reason", ["V9"], plan=[T1P, T2P], unscheduled=[unsched("T3", None)])

# V10 diff
moved_ok = {"train_id": "T2", "class": "MOVED",
            "reasons": [{"code": "PLATFORM_OCCUPIED_BY", "ref": "T1", "minutes": 10}]}
add("valid_diff_with_reason", [], now=550, previous_plan=BASE_PLAN, plan=MOVED_PLAN,
    diff=[moved_ok, {"train_id": "T1", "class": "KEPT", "reasons": []}])
add("v10_changed_without_reason", ["V10"], now=550, previous_plan=BASE_PLAN, plan=MOVED_PLAN,
    diff=[{"train_id": "T2", "class": "MOVED", "reasons": []}])
add("v10_missing_reasons_key", ["V10"], now=550, previous_plan=BASE_PLAN, plan=MOVED_PLAN,
    diff=[{"train_id": "T2", "class": "MOVED"}])

out = Path(__file__).parents[1] / "contracts" / "golden_vectors.json"
with out.open("w", encoding="utf-8", newline="\n") as f:
    json.dump(vectors, f, indent=2)
    f.write("\n")
print(len(vectors), "vectors")
