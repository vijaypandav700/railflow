"""Render docs/benchmark.json to docs/benchmark.md. Run: uv run python docs/render_benchmark.py"""

import json
from pathlib import Path
from typing import Any

DOCS = Path(__file__).resolve().parent
SRC = DOCS / "benchmark.json"
OUT = DOCS / "benchmark.md"


def cell(entry: dict[str, Any] | None) -> str:
    if not entry:
        return "n/a"
    m = entry.get("metrics", {})
    return f"{m.get('weighted_delay', '?')} / {m.get('unscheduled', '?')}"


def main() -> None:
    data: dict[str, Any] = json.loads(SRC.read_text())
    lines = [
        "# Benchmark: solver vs greedy baselines",
        "",
        "Generated from `docs/benchmark.json` by `docs/render_benchmark.py`. Do not edit by hand.",
        "",
        "Each cell is `weighted delay / unscheduled trains`. Lower is better.",
        "",
        (
            "| Scenario | push_later | first_fit | ours min_change | ours min_delay "
            "| Ours <= baseline | Solver status | Max solve ms |"
        ),
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    wins = 0
    for name in sorted(data):
        row: dict[str, Any] = data[name]
        base: dict[str, Any] = row.get("baselines", {})
        ours: dict[str, Any] = row.get("ours", {})
        ok = bool(row.get("ours_beats_or_ties"))
        wins += ok
        statuses = sorted({str(v.get("status", "?")) for v in ours.values()})
        times = [int(v.get("time_ms", 0)) for v in ours.values()]
        lines.append(
            f"| {name} | {cell(base.get('push_later'))} | {cell(base.get('first_fit'))} "
            f"| {cell(ours.get('min_change'))} | {cell(ours.get('min_delay'))} "
            f"| {'yes' if ok else 'NO'} | {', '.join(statuses)} | {max(times, default=0)} |"
        )
    lines += [
        "",
        (
            f"Ours beats or ties the baselines in {wins} of {len(data)} scenarios, "
            "as computed by the benchmark script."
        ),
        "",
        "Solve times are from a single run on one laptop, not a p95 measurement.",
        "",
        (
            "OPTIMAL means proven best for the profile. FEASIBLE means the solver time "
            "limit was hit and the best valid plan found is returned."
        ),
        "",
    ]
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT}: {wins}/{len(data)} scenarios ours <= baseline")


main()
