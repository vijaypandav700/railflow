# ADR 0001: Domain rules R1 to R10

Status: accepted. Any change to these rules is a breaking change and needs a version bump.

| Rule | Decision | Why |
| --- | --- | --- |
| R1 Time | Integer minutes since 00:00, horizon 2880 | No float or time-zone bugs. Trains past midnight work. |
| R2 Occupancy | Train holds `[arrival, departure + gap)` | The gap becomes part of the interval, so one no-overlap constraint enforces both. |
| R3 No overlap | Equality allowed | Back-to-back with exactly the gap is legal. |
| R4 Closure | Blocks `[start, end)` with buffer | Same interval model as trains. |
| R5 Required platform | Can be held, never moved | Matches real constraints. |
| R6 Timing | Arrival at least scheduled plus delay. Departure derived. Never earlier than scheduled. | Keeps the model small and honest. |
| R7 Freeze | Train with arrival at or before now keeps platform and arrival | Replans cannot rewrite the past. |
| R8 Unscheduled | Reported with a reason, never dropped | The operator must see what did not fit. |
| R9 Closure under train | Closure takes effect after that train leaves, with a warning | Cannot evict a train already on the platform. |
| R10 Priority | Local 1, express 3, premium 5, used only in the objective | Priority may shape the plan, never validity. |

Validator and solver are independent: the validator uses the standard library only and pairwise brute-force checks, and a second implementation exists in TypeScript.
