"""Metrics, cascade edges and facts JSON for explanations (FR-16, FR-37). No solver, no AI."""

from __future__ import annotations

from typing import Any

from railflow.solver import CLASS_WEIGHT

Json = dict[str, Any]

CAUSAL = {"PLATFORM_OCCUPIED_BY", "GAP_REQUIRED", "YIELD_TO_PRIORITY"}


def compute_metrics(data: Json, out: Json) -> Json:
    trains: dict[str, Json] = {t["id"]: t for t in data["trains"]}
    total = weighted = longest = late = 0
    for row in out["plan"]:
        t = trains[row["train_id"]]
        d = max(0, int(row["arr"]) - int(t["arr"]))
        total += d
        weighted += d * CLASS_WEIGHT.get(str(t.get("class", "local")), 1)
        longest = max(longest, d)
        late += 1 if d > 0 else 0
    moved = sum(1 for i in out["diff"] if i["class"] in ("MOVED", "MOVED_AND_DELAYED"))
    return {
        "total_delay": total,
        "weighted_delay": weighted,
        "moved": moved,
        "delayed": late,
        "max_delay": longest,
        "unscheduled": len(out["unscheduled"]),
    }


def build_cascade(diff: list[Json]) -> list[Json]:
    """Edge cause -> effect for each causal reason whose referenced train also changed."""
    changed = {i["train_id"] for i in diff if i["class"] != "KEPT"}
    edges: list[Json] = []
    seen: set[tuple[str, str]] = set()
    for item in diff:
        for r in item["reasons"]:
            ref = r.get("ref")
            if r["code"] in CAUSAL and ref in changed and ref != item["train_id"]:
                key = (str(ref), item["train_id"])
                if key not in seen:
                    seen.add(key)
                    edges.append({"cause": key[0], "effect": key[1]})
    return sorted(edges, key=lambda e: (e["cause"], e["effect"]))


def build_facts(profile: str, diff: list[Json], metrics: Json) -> Json:
    """Facts only. The explainer may use nothing outside this JSON."""
    changed = [
        {
            "train_id": i["train_id"],
            "class": i["class"],
            "from": i.get("from"),
            "to": i.get("to"),
            "reasons": i["reasons"],
        }
        for i in diff
        if i["class"] != "KEPT"
    ]
    return {"profile": profile, "metrics": metrics, "changed": changed}
