import { findConflicts, overlaps } from "../engine";
import { CLASS_WEIGHT } from "../constants";

/**
 * Stand-in for POST /replan. A sequential greedy placer, NOT the CP-SAT solver.
 * It honours: frozen trains at `now`, required platforms, gap, closures, max_hold.
 */
export function mockReplan(req) {
  const profiles = req.profiles.length ? req.profiles : ["min_change", "min_delay"];
  const seen = new Set();
  const alternatives = [];
  const rejected = [];
  for (const p of profiles) {
    const alt = build(req, p);
    const sig = JSON.stringify(
      [...alt.plan.entries].sort((a, b) => a.trainId.localeCompare(b.trainId)),
    );
    if (seen.has(sig)) continue; // merge identical alternatives
    seen.add(sig);
    (alt.validation.valid ? alternatives : rejected).push(alt);
  }
  return { alternatives, rejected };
}

function earliestSlot(platform, eff, train, placed, closures, st) {
  const blocks = [
    ...placed.filter((e) => e.platform === platform).map((e) => [e.arr, e.dep + st.gap]),
    ...closures.filter((c) => c.platform === platform).map((c) => [c.start, c.end]),
  ];
  let a = eff;
  for (;;) {
    if (a - eff > st.maxHold) return null;
    const d = Math.max(train.dep, a + st.dwellMin);
    const hit = blocks.find(([s, e]) => overlaps(a, d + st.gap, s, e));
    if (!hit) return a;
    a = Math.max(a + 1, hit[1]);
  }
}

function build(req, profile) {
  const t0 = performance.now();
  const { station: st, trains, currentPlan, closures, delays, now } = req;

  const frozen = currentPlan.entries.filter((e) => e.arr <= now);
  const frozenIds = new Set(frozen.map((e) => e.trainId));
  const out = [...frozen];
  const unsched = [];

  const todo = trains
    .filter((t) => !frozenIds.has(t.id))
    .map((t) => ({ t, eff: t.arr + (delays[t.id] ?? 0) }))
    .sort((a, b) => a.eff - b.eff || a.t.id.localeCompare(b.t.id));

  for (const { t, eff } of todo) {
    const old = currentPlan.entries.find((e) => e.trainId === t.id);
    const candidates = t.requiredPlatform ? [t.requiredPlatform] : st.platforms;
    const score = (c) =>
      profile === "min_change"
        ? (c.platform === old?.platform ? 0 : 1000) + (c.arr - eff) * 10
        : (c.arr - eff) * 100 + (c.platform === old?.platform ? 0 : 1);
    let best = null;
    for (const p of candidates) {
      const a = earliestSlot(p, eff, t, out, closures, st);
      if (a === null) continue;
      const cand = { trainId: t.id, platform: p, arr: a, dep: Math.max(t.dep, a + st.dwellMin) };
      if (!best || score(cand) < score(best)) best = cand;
    }
    if (best) out.push(best);
    else unsched.push({ trainId: t.id, reason: "NO_FEASIBLE_SLOT" });
  }

  const plan = { entries: out, unscheduled: unsched };
  const diff = buildDiff(req, plan.entries, unsched, frozenIds);
  const byId = new Map(trains.map((t) => [t.id, t]));

  let totalDelay = 0;
  let weightedDelay = 0;
  let maxDelay = 0;
  let delayed = 0;
  for (const e of out) {
    const t = byId.get(e.trainId);
    if (!t) continue;
    const d = Math.max(0, e.arr - t.arr);
    totalDelay += d;
    weightedDelay += d * CLASS_WEIGHT[t.cls];
    maxDelay = Math.max(maxDelay, d);
    if (d > 0) delayed++;
  }
  const moved = diff.filter((r) => r.cls === "MOVED" || r.cls === "MOVED_AND_DELAYED").length;
  const metrics = { totalDelay, weightedDelay, moved, delayed, maxDelay, unscheduled: unsched.length };

  const conflicts = findConflicts(plan, st.gap, closures);
  const requiredOk = out.every((e) => {
    const t = byId.get(e.trainId);
    return !t?.requiredPlatform || t.requiredPlatform === e.platform;
  });
  const validation = {
    valid: conflicts.length === 0 && requiredOk && out.length + unsched.length === trains.length,
    checks: [
      { id: "V1", ok: out.length + unsched.length === trains.length },
      { id: "V3", ok: requiredOk },
      { id: "V4/V5", ok: !conflicts.some((c) => c.kind === "OVERLAP") },
      { id: "V6", ok: !conflicts.some((c) => c.kind === "CLOSURE_HIT") },
    ],
  };

  return {
    profile,
    solver: { status: "MOCK_GREEDY", timeMs: Math.round(performance.now() - t0) },
    plan,
    diff,
    metrics,
    validation,
    explanation: {
      source: "template",
      text: `${profile}: ${moved} train(s) moved, ${delayed} delayed (${totalDelay} min total, max ${maxDelay} min), ${unsched.length} unscheduled.`,
    },
  };
}

function buildDiff(req, entries, unsched, frozenIds) {
  const { station: st, trains, currentPlan, closures, delays } = req;
  const rows = [];
  for (const t of trains) {
    const old = currentPlan.entries.find((e) => e.trainId === t.id);
    const nw = entries.find((e) => e.trainId === t.id);
    if (!nw) {
      const why = unsched.find((u) => u.trainId === t.id)?.reason ?? "NO_FEASIBLE_SLOT";
      rows.push({ trainId: t.id, cls: "UNSCHEDULED", from: old?.platform, reasons: [{ code: why }] });
      continue;
    }
    const moved = !!old && old.platform !== nw.platform;
    const delayed = !!old && nw.arr > old.arr;
    const cls = moved && delayed ? "MOVED_AND_DELAYED" : moved ? "MOVED" : delayed ? "DELAYED" : "KEPT";
    const reasons = [];
    const eff = t.arr + (delays[t.id] ?? 0);

    if (frozenIds.has(t.id)) {
      reasons.push({ code: "FROZEN_AT_NOW" });
    } else {
      if ((delays[t.id] ?? 0) > 0) reasons.push({ code: "ARRIVAL_DELAYED", minutes: delays[t.id] });
      if ((moved || delayed) && old) {
        const end = Math.max(t.dep, eff + st.dwellMin) + st.gap;
        const blocker = entries.find(
          (e) => e.trainId !== t.id && e.platform === old.platform && overlaps(eff, end, e.arr, e.dep + st.gap),
        );
        if (blocker) reasons.push({ code: "PLATFORM_OCCUPIED_BY", ref: blocker.trainId });
        const closure = closures.find((c) => c.platform === old.platform && overlaps(eff, end, c.start, c.end));
        if (closure) reasons.push({ code: "PLATFORM_CLOSED", ref: closure.id });
        if (nw.arr - eff > 0) reasons.push({ code: "HELD_FOR_SLOT", minutes: nw.arr - eff });
      }
      if (t.requiredPlatform && cls !== "KEPT") reasons.push({ code: "REQUIRED_PLATFORM_FIXED" });
    }
    rows.push({ trainId: t.id, cls, from: old?.platform, to: nw.platform, reasons });
  }
  return rows;
}