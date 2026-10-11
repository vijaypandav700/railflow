"""Turns docs/benchmark.json into docs/results.md. Run: uv run python docs/make_results.py"""

import json
from pathlib import Path

root = Path(__file__).resolve().parent
data = json.loads((root / "benchmark.json").read_text())


def cell(m: dict, k: str) -> str:
    v = m.get(k)
    return "-" if v is None else str(v)


lines = [
    "# Solver vs baselines",
    "",
    "Lower is better. Cells are unscheduled / weighted delay / moved trains.\nResult compares the best of our two profiles with the best baseline (unscheduled, then weighted delay).",
    "S02 and S07 are skipped (injected conflicts, infeasible input).",
    "",
    "| Scenario | push_later (unsched / wdelay / moved) | first_fit (unsched / wdelay / moved) | min_change | min_delay | Result |",
    "| --- | --- | --- | --- | --- | --- |",
]
for name, r in data.items():
    b = r["baselines"]
    o = r["ours"]

    def pair(m: dict) -> str:
        return f"{cell(m, 'unscheduled')} / {cell(m, 'weighted_delay')} / {cell(m, 'moved')}"

    lines.append(
        f"| {name} | {pair(b['push_later']['metrics'])} | {pair(b['first_fit']['metrics'])} "
        f"| {pair(o['min_change']['metrics'])} | {pair(o['min_delay']['metrics'])} "
        f"| {'beats or ties' if r['ours_beats_or_ties'] else 'WORSE'} |"
    )
(root / "results.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
