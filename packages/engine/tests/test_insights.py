from pathlib import Path
from typing import Any

from railflow.insights import build_cascade, build_facts, compute_metrics
from railflow.planfile import load_plan_file
from railflow.reasons import replan_with_diff

ROOT = Path(__file__).resolve().parents[3] / "scenarios"


def s03() -> dict[str, Any]:
    return load_plan_file(next(ROOT.glob("S03*.json")))


def test_cascade_s03_t101_causes_t105() -> None:
    out = replan_with_diff(s03())
    assert {"cause": "T101", "effect": "T105"} in build_cascade(out["diff"])


def test_cascade_ignores_unchanged_cause() -> None:
    diff: list[dict[str, Any]] = [
        {"train_id": "A", "class": "KEPT", "reasons": []},
        {
            "train_id": "B",
            "class": "DELAYED",
            "reasons": [{"code": "PLATFORM_OCCUPIED_BY", "ref": "A"}],
        },
    ]
    assert build_cascade(diff) == []


def test_metrics_s03() -> None:
    data = s03()
    out = replan_with_diff(data)
    m = compute_metrics(data, out)
    assert m["delayed"] >= 2
    assert m["total_delay"] >= 25
    assert m["unscheduled"] == 0


def test_metrics_no_disruption_is_zero() -> None:
    data: dict[str, Any] = {**s03(), "delays": [], "closures": []}
    out = replan_with_diff(data)
    m = compute_metrics(data, out)
    assert m["total_delay"] == 0 and m["moved"] == 0


def test_facts_only_changed() -> None:
    data = s03()
    out = replan_with_diff(data)
    facts = build_facts("default", out["diff"], compute_metrics(data, out))
    assert facts["changed"]
    assert all(c["class"] != "KEPT" for c in facts["changed"])
