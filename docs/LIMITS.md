# Limits

What RailFlow does not do. Stated here so nobody has to discover it.

## Scope

- One station. No network, no corridors.
- No track-level routing, signalling or interlocking. A platform is a resource with a time slot.
- No crew or rolling-stock planning.
- No passenger-transfer effects.
- Platform length versus train length is ignored.
- Delays are inputs. RailFlow does not predict them.
- Fictional data only. No live railway data.

## Model

- Times are integer minutes. Horizon 48 hours. No time zones.
- Departure is never earlier than scheduled. Operators cannot set departure delays.
- A late train can be held outside for at most `max_hold` (default 120 min). After that it is reported as unscheduled, never dropped silently.
- If a closure starts under a train already at the platform, the closure takes effect after that train leaves, and the plan carries `CLOSURE_DEFERRED`.
- Input limits: 200 trains, 12 platforms, 20 disruptions per request, 1 MB body.

## Solver

- OPTIMAL means proven best for the chosen profile. FEASIBLE means the time limit hit and the best valid plan found is returned. The UI shows the label.
- Alternatives are only as different as the objective profiles make them. If two profiles give the same plan, they are merged and the response says so.

## Performance

- The large scenario (S12, 60 trains, 6 platforms) hits the 5 second solver limit and returns a FEASIBLE plan, not a proven OPTIMAL one. It is still validated and still ties the best baseline. The 2 second target is not met on that scenario in the measured run.
- Benchmarks cover the 10 scenarios that can be replanned. S02 (injected conflicts) and S07 (required-platform clash) are detector and infeasible-input cases.

## AI

- AI reads text and words explanations. It cannot assign platforms, change times or apply anything without confirmation.
- Rules mode works offline and is the default. Local LLM mode is optional and falls back to rules after a 5 second timeout.
- Unknown trains and platforms are rejected. Unclear input gets a question, not a guess.
- Cloud LLM is not enabled.

## Audit log

- Tamper-evident, not tamper-proof. Editing or deleting an entry in the middle breaks the chain and is reported at the exact entry.
- Deleting the newest entries leaves a valid chain. A copy of the latest hash kept elsewhere would close this gap.

## Novelty

Platform rescheduling is a well-studied area with commercial tools. RailFlow does not claim a new algorithm. It is a free, explainable, verifiable sandbox with plain-language input and an independent proof of correctness.
