# Solver vs baselines

Lower is better. Cells are unscheduled / weighted delay / moved trains.
Result compares the best of our two profiles with the best baseline (unscheduled, then weighted delay).
S02 and S07 are skipped (injected conflicts, infeasible input).

| Scenario | push_later (unsched / wdelay / moved) | first_fit (unsched / wdelay / moved) | min_change | min_delay | Result |
| --- | --- | --- | --- | --- | --- |
| S01-clean-day | 0 / 0 / 0 | 0 / 0 / 10 | 0 / 0 / 0 | 0 / 0 / 0 | beats or ties |
| S03-single-delay | 0 / 127 / 0 | 0 / 75 / 10 | 0 / 87 / 0 | 0 / 75 / 1 | beats or ties |
| S04-midday-closure | 0 / 272 / 0 | 0 / 0 / 8 | 0 / 40 / 1 | 0 / 0 / 3 | beats or ties |
| S05-delay-plus-closure | 0 / 352 / 0 | 0 / 75 / 8 | 0 / 87 / 1 | 0 / 75 / 2 | beats or ties |
| S06-rush-hour | 0 / 47 / 0 | 0 / 45 / 3 | 0 / 47 / 0 | 0 / 45 / 2 | beats or ties |
| S08-capacity-exceeded | 0 / 480 / 0 | 0 / 140 / 5 | 0 / 140 / 5 | 0 / 140 / 5 | beats or ties |
| S09-replan-midday | 0 / 20 / 0 | 0 / 15 / 2 | 0 / 20 / 0 | 0 / 15 / 1 | beats or ties |
| S10-past-midnight | 0 / 0 / 0 | 0 / 0 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | beats or ties |
| S11-closure-under-train | 0 / 60 / 0 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | beats or ties |
| S12-large-day | 0 / 361 / 0 | 0 / 5 / 49 | 0 / 318 / 0 | 0 / 5 / 14 | beats or ties |
