import { useEffect, useMemo, useRef, useState } from "react";
import { breakPlan, describeEvent, findConflicts } from "./engine";

/**
 * Simulation state machine.
 * client: { replan(req) }, scenario: { station, trains, initialPlan, startClock, endClock }
 */
export function useSimulation(client, scenario) {
  const { station, trains, startClock, endClock } = scenario;

  const [clock, setClock] = useState(startClock);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // simulated minutes per real second
  const [plan, setPlan] = useState(scenario.initialPlan);
  const [committed, setCommitted] = useState({ delays: {}, closures: [] });
  const [queue, setQueue] = useState([]);
  const [pending, setPending] = useState(null); // { events, delays, closures, response }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [broken, setBroken] = useState(false);
  const saved = useRef(null);
  const counter = useRef(0);

  const addLog = (text, tone = "info", at = clock) =>
    setLog((l) => [{ clock: at, text, tone }, ...l].slice(0, 60));

  // Clock tick
  useEffect(() => {
    if (!playing || busy || pending) return;
    const id = setInterval(() => setClock((c) => Math.min(c + 1, endClock)), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, busy, pending, endClock]);

  useEffect(() => {
    if (clock >= endClock && playing) setPlaying(false);
  }, [clock, endClock, playing]);

  // Fire due events as one replan
  useEffect(() => {
    if (busy || pending) return;
    const due = queue.filter((e) => e.at <= clock);
    if (!due.length) return;
    setQueue((q) => q.filter((e) => e.at > clock));
    setPlaying(false);
    void runReplan(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, queue, busy, pending]);

  async function runReplan(events) {
    const delays = { ...committed.delays };
    const closures = [...committed.closures];
    for (const e of events) {
      if (e.kind === "delay") delays[e.trainId] = (delays[e.trainId] ?? 0) + e.minutes;
      else closures.push({ id: e.id, platform: e.platform, start: e.start, end: e.end });
    }
    setBusy(true);
    setError(null);
    addLog(`Replan requested: ${events.map(describeEvent).join("; ")}`);
    try {
      const response = await client.replan({
        station,
        trains,
        currentPlan: plan,
        closures,
        delays,
        now: clock,
        profiles: ["min_change", "min_delay"],
      });
      setPending({ events, delays, closures, response });
      addLog(
        `${response.alternatives.length} valid alternative(s), ${response.rejected.length} rejected as invalid`,
        response.alternatives.length ? "ok" : "warn",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`REFUSED: ${msg}`, "warn");
    } finally {
      setBusy(false);
    }
  }

  /** ev: { kind: "delay", trainId, minutes } | { kind: "closure", platform, start, end } */
  function schedule(ev, at = clock) {
    const full = { ...ev, id: `E${++counter.current}`, at };
    setQueue((q) => [...q, full]);
    addLog(at <= clock ? `Injected now: ${describeEvent(full)}` : `Queued for ${at}: ${describeEvent(full)}`);
  }

  function accept(index) {
    if (!pending) return;
    const alt = pending.response.alternatives[index];
    if (!alt) return;
    // Defensive UI check. The backend validator stays the authority.
    const local = findConflicts(alt.plan, station.gap, pending.closures);
    if (!alt.validation.valid || local.length) {
      addLog(`Refused to apply "${alt.profile}": failed validation`, "warn");
      return;
    }
    setPlan(alt.plan);
    setCommitted({ delays: pending.delays, closures: pending.closures });
    addLog(`Accepted "${alt.profile}"`, "ok");
    setPending(null);
  }

  function reject() {
    if (!pending) return;
    addLog("Revision rejected, previous plan kept", "warn");
    setPending(null);
  }

  function breakIt() {
    const next = breakPlan(plan, clock);
    if (!next) return;
    saved.current = plan;
    setPlan(next);
    setBroken(true);
    addLog("Plan deliberately broken", "warn");
  }

  function restore() {
    if (saved.current) setPlan(saved.current);
    saved.current = null;
    setBroken(false);
    addLog("Plan restored", "ok");
  }

  const conflicts = useMemo(
    () => findConflicts(plan, station.gap, committed.closures),
    [plan, station.gap, committed.closures],
  );

  return {
    clock,
    playing,
    speed,
    plan,
    queue,
    pending,
    busy,
    error,
    log,
    broken,
    conflicts,
    delays: committed.delays,
    closures: committed.closures,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    setSpeed,
    scrub: (m) => setClock(Math.max(startClock, Math.min(endClock, m))),
    schedule,
    accept,
    reject,
    breakIt,
    restore,
  };
}