# Benchmark: solver vs greedy baselines

Generated from `docs/benchmark.json` by `docs/render_benchmark.py`. Do not edit by hand.

Each cell is `weighted delay / unscheduled trains`. Lower is better.

| Scenario | push_later | first_fit | ours min_change | ours min_delay | Ours <= baseline | Solver status | Max solve ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01-clean-day | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | yes | OPTIMAL | 11 |
| S03-single-delay | 127 / 0 | 75 / 0 | 87 / 0 | 75 / 0 | yes | OPTIMAL | 16 |
| S04-midday-closure | 272 / 0 | 0 / 0 | 40 / 0 | 0 / 0 | yes | OPTIMAL | 11 |
| S05-delay-plus-closure | 352 / 0 | 75 / 0 | 87 / 0 | 75 / 0 | yes | OPTIMAL | 11 |
| S06-rush-hour | 47 / 0 | 45 / 0 | 47 / 0 | 45 / 0 | yes | OPTIMAL | 4 |
| S08-capacity-exceeded | 480 / 0 | 140 / 0 | 140 / 0 | 140 / 0 | yes | OPTIMAL | 228 |
| S09-replan-midday | 20 / 0 | 15 / 0 | 20 / 0 | 15 / 0 | yes | OPTIMAL | 3 |
| S10-past-midnight | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | yes | OPTIMAL | 4 |
| S11-closure-under-train | 60 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | yes | OPTIMAL | 2 |
| S12-large-day | 361 / 0 | 5 / 0 | 318 / 0 | 5 / 0 | yes | FEASIBLE | 5012 |

Ours beats or ties the baselines in 10 of 10 scenarios, as computed by the benchmark script.

Solve times are from a single run on one laptop, not a p95 measurement.

OPTIMAL means proven best for the profile. FEASIBLE means the solver time limit was hit and the best valid plan found is returned.
