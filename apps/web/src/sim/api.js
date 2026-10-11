import { fmt, parseTime } from "./time";
import { mockReplan } from "./mock/mockReplan";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A client is any object with: async replan(req) -> { alternatives, rejected } */
export const mockClient = {
  async replan(req) {
    await sleep(350); // feel like a network call
    return mockReplan(req);
  },
};

// ---- HTTP client: shapes follow PRD section 11. Adjust here once the real endpoint is final. ----
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

function toWire(req) {
  const cur = new Map(req.currentPlan.entries.map((e) => [e.trainId, e]));
  return {
    station: {
      name: req.station.name,
      gap: req.station.gap,
      platforms: req.station.platforms,
      defaults: {
        dwell_min: req.station.dwellMin,
        max_hold: req.station.maxHold,
        closure_buffer: req.station.closureBuffer,
      },
    },
    trains: req.trains.map((t) => ({
      id: t.id,
      name: t.name,
      class: t.cls,
      arr: fmt(t.arr),
      dep: fmt(t.dep),
      required_platform: t.requiredPlatform,
      platform: cur.get(t.id)?.platform ?? null,
    })),
    current_plan: req.currentPlan.entries.map((e) => ({
      train_id: e.trainId,
      platform: e.platform,
      arr: fmt(e.arr),
      dep: fmt(e.dep),
    })),
    closures: req.closures.map((c) => ({
      id: c.id,
      platform: c.platform,
      start: fmt(c.start),
      end: fmt(c.end),
    })),
    delays: Object.entries(req.delays).map(([train_id, minutes]) => ({ train_id, minutes })),
    now: fmt(req.now),
    profiles: req.profiles,
  };
}

function fromWireAlt(a) {
  return {
    profile: a.profile,
    solver: { status: a.solver?.status ?? "UNKNOWN", timeMs: a.solver?.time_ms ?? 0 },
    plan: {
      entries: (a.plan ?? []).map((p) => ({
        trainId: p.train_id,
        platform: p.platform,
        arr: parseTime(p.arr),
        dep: parseTime(p.dep),
      })),
      unscheduled: (a.unscheduled ?? []).map((u) => ({ trainId: u.train_id, reason: u.reason })),
    },
    diff: (a.diff ?? []).map((d) => ({
      trainId: d.train_id,
      cls: d.class,
      from: d.from,
      to: d.to,
      reasons: d.reasons ?? [],
    })),
    metrics: {
      totalDelay: a.metrics?.total_delay ?? 0,
      weightedDelay: a.metrics?.weighted_delay ?? 0,
      moved: a.metrics?.moved ?? 0,
      delayed: a.metrics?.delayed ?? 0,
      maxDelay: a.metrics?.max_delay ?? 0,
      unscheduled: a.metrics?.unscheduled ?? 0,
    },
    validation: { valid: !!a.validation?.valid, checks: a.validation?.checks ?? [] },
    explanation: { text: a.explanation?.text ?? "", source: a.explanation?.source ?? "template" },
  };
}

export const httpClient = {
  async replan(req) {
    const res = await fetch(`${BASE}/replan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toWire(req)),
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        msg = body.detail ?? body.title ?? msg;
      } catch {
        /* keep default message */
      }
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    const data = await res.json();
    return {
      alternatives: (data.alternatives ?? []).map(fromWireAlt),
      rejected: (data.rejected_plans ?? []).map(fromWireAlt),
    };
  },
};

/** Set VITE_USE_MOCK=false in .env to talk to the real backend. */
export const getClient = () => (import.meta.env.VITE_USE_MOCK === "false" ? httpClient : mockClient);