import { fmt } from "./time";

export const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * UI-side highlight only. The backend validator is the authority on validity.
 * Returns [{ kind: "OVERLAP" | "CLOSURE_HIT", a, b, platform }]
 */
export function findConflicts(plan, gap, closures) {
  const out = [];
  const es = plan.entries;
  for (let i = 0; i < es.length; i++) {
    const x = es[i];
    for (let j = i + 1; j < es.length; j++) {
      const y = es[j];
      if (x.platform === y.platform && overlaps(x.arr, x.dep + gap, y.arr, y.dep + gap)) {
        out.push({ kind: "OVERLAP", a: x.trainId, b: y.trainId, platform: x.platform });
      }
    }
    for (const c of closures) {
      if (x.platform === c.platform && overlaps(x.arr, x.dep + gap, c.start, c.end)) {
        out.push({ kind: "CLOSURE_HIT", a: x.trainId, b: c.id, platform: x.platform });
      }
    }
  }
  return out;
}

/** R7: a train that has arrived at `now` keeps its platform and arrival. */
export const isFrozen = (entry, now) => entry.arr <= now;

export function trainState(train, entry, clock, delay) {
  if (!entry) return "UNSCHEDULED";
  if (clock >= entry.dep) return "DEPARTED";
  if (clock >= entry.arr) return "AT_PLATFORM";
  if (clock >= train.arr + delay && entry.arr > train.arr + delay) return "HELD";
  if (entry.arr - clock <= 10) return "APPROACHING";
  return "SCHEDULED";
}

/** "Break it": push one open train onto another platform's slot so the checker turns red. */
export function breakPlan(plan, now) {
  const open = plan.entries.filter((e) => !isFrozen(e, now));
  for (const a of open) {
    for (const b of open) {
      if (a.platform !== b.platform) {
        return {
          ...plan,
          entries: plan.entries.map((e) =>
            e.trainId === b.trainId
              ? { ...e, platform: a.platform, arr: a.arr + 1, dep: Math.max(a.arr + 2, a.dep) }
              : e,
          ),
        };
      }
    }
  }
  return null;
}

export function describeEvent(e) {
  if (e.kind === "delay") return `${e.trainId} +${e.minutes} min`;
  return `${e.platform} closed ${fmt(e.start)}–${fmt(e.end)}`;
}