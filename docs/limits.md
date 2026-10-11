# RailFlow limits and evidence

## Scope limits (say these out loud)
- One station. No track routing, signalling, crew or rolling stock.
- Delays are inputs. RailFlow does not predict them.
- Platform length is ignored. No passenger-transfer effects.
- Fictional data only (Vortexa Junction).
- The initial assignment (`assign`) does not hold trains. It uses scheduled times, so a dense
  period can leave a train unscheduled with NO_FEASIBLE_SLOT (S12 does, for T1207).
  Replan does hold late trains, up to max_hold.
- This is a decision-support sandbox. It is not the Control Office Application.
- The audit log is tamper-evident, not tamper-proof.
- Not a new algorithm. Platform rescheduling is well studied. This is a free, explainable,
  verifiable sandbox with plain-language input.

## Measured evidence
- Fuzz: 10,000 random scenarios, every solver plan passed the validator.
- Mutation: shifted, dropped, duplicated and clashing plans were all rejected.
- Differential: Python and TypeScript validators agree on 2,000 vectors (618 valid, 1,382 invalid).
- Replan latency on S12 (60 trains, 6 platforms): p95 about 0.07 s over 20 runs. Target was 2 s.
- NL parser: 60 labelled phrases (English, Hinglish, ambiguous, unknown names, attacks) all pass.
  The set is our own regression set, not an independent test, so it does not prove coverage of
  arbitrary phrasing.
- LLM mode (Ollama) is optional, built and tested with a mocked model, and not demoed live.
  Rules mode is the default and works offline.
