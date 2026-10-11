import { useEffect, useState } from "react";
import { trainState } from "../sim/engine";
import { fmt, parseTime } from "../sim/time";
import { useSimulation } from "../sim/useSimulation";
import { Gantt, Legend } from "./Gantt";

export function SimulationPlayer({ scenario, client }) {
  const sim = useSimulation(client, scenario);
  const { station, trains } = scenario;

  const [theme, setTheme] = useState(() => localStorage.getItem("railflow-theme") ?? "auto");
    useEffect(() => {
        const root = document.documentElement;
        if (theme === "auto") root.removeAttribute("data-theme");
        else root.setAttribute("data-theme", theme);
        try { localStorage.setItem("railflow-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const [kind, setKind] = useState("delay");
  const [trainId, setTrainId] = useState(trains[0].id);
  const [minutes, setMinutes] = useState("25");
  const [platform, setPlatform] = useState(station.platforms[1] ?? station.platforms[0]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:30");
  const [at, setAt] = useState("");
  const [formError, setFormError] = useState(null);
  const [tab, setTab] = useState(0);

  function submit() {
    try {
      const when = at.trim() ? parseTime(at) : sim.clock;
      if (when < sim.clock) throw new Error("Event time is already in the past");
      let ev;
      if (kind === "delay") {
        const m = Number(minutes);
        if (!Number.isInteger(m) || m < 1 || m > 600) {
          throw new Error("Delay must be a whole number of minutes (1–600)");
        }
        ev = { kind: "delay", trainId, minutes: m };
      } else {
        const s = parseTime(start);
        const e = parseTime(end);
        if (e <= s) throw new Error("Closure end must be after start");
        ev = { kind: "closure", platform, start: s, end: e };
      }
      sim.schedule(ev, when);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  }

  const alts = sim.pending?.response.alternatives ?? [];
  const altIndex = Math.min(tab, Math.max(alts.length - 1, 0));
  const alt = alts[altIndex];

  return (
    <main className="sim">
        <header className="topbar">
            <div className="brand">
                <h1>RailFlow</h1>
                    <span className="tagline">{station.name} · platform plan repair and proof</span>
            </div>
            <span className="clock" aria-label="Simulation clock">{fmt(sim.clock)}</span>
            <span className={sim.conflicts.length ? "badge bad" : "badge ok"}>
            {sim.conflicts.length ? "INVALID (UI check)" : "valid (UI check)"}
            </span>
            <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label="Toggle dark theme"
            >
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
            </button>
      </header>

      <section className="controls" aria-label="Simulation controls">
        <button onClick={sim.playing ? sim.pause : sim.play} disabled={sim.busy || !!sim.pending}>
          {sim.playing ? "Pause" : "Play"}
        </button>
        {[1, 5, 15].map((s) => (
          <button key={s} className={sim.speed === s ? "active" : ""} onClick={() => sim.setSpeed(s)}>
            {s}×
          </button>
        ))}
        <input
          type="range"
          aria-label="Scrub clock"
          min={scenario.startClock}
          max={scenario.endClock}
          value={sim.clock}
          onChange={(e) => sim.scrub(Number(e.target.value))}
        />
        <button onClick={sim.broken ? sim.restore : sim.breakIt}>
          {sim.broken ? "Restore plan" : "Break it"}
        </button>
      </section>

      <Gantt
        title="Current plan"
        plan={sim.plan}
        trains={trains}
        station={station}
        closures={sim.closures}
        delays={sim.delays}
        clock={sim.clock}
      />

      <section className="panel">
        <h2>Inject disruption</h2>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="delay">Train delay</option>
            <option value="closure">Platform closure</option>
          </select>
          {kind === "delay" ? (
            <>
              <select value={trainId} onChange={(e) => setTrainId(e.target.value)}>
                {trains.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.name}
                  </option>
                ))}
              </select>
              <input
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                size={4}
                aria-label="Delay minutes"
              />
              <span>min</span>
            </>
          ) : (
            <>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {station.platforms.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <input value={start} onChange={(e) => setStart(e.target.value)} size={6} aria-label="Closure start" />
              <span>to</span>
              <input value={end} onChange={(e) => setEnd(e.target.value)} size={6} aria-label="Closure end" />
            </>
          )}
          <input
            value={at}
            onChange={(e) => setAt(e.target.value)}
            size={7}
            placeholder="at (now)"
            aria-label="Fire at clock time"
          />
          <button onClick={submit} disabled={sim.busy || !!sim.pending}>
            Inject
          </button>
        </div>
        {formError && (
          <p className="err" role="alert">
            {formError}
          </p>
        )}
        {sim.error && (
          <p className="err" role="alert">
            Backend: {sim.error}
          </p>
        )}
        {sim.busy && <p>Replanning…</p>}
        {sim.queue.length > 0 && (
          <p className="small">Queued: {sim.queue.map((e) => `${fmt(e.at)} ${e.kind}`).join(", ")}</p>
        )}
      </section>

      {sim.pending && (
        <section className="panel">
          <h2>Review revision (nothing applies until you accept)</h2>
          <div className="row">
            {alts.map((a, i) => (
              <button key={a.profile} className={i === altIndex ? "active" : ""} onClick={() => setTab(i)}>
                {a.profile}
              </button>
            ))}
            {alts.length === 0 && <strong>No valid alternative returned.</strong>}
          </div>

          {alt && (
            <>
              <p>
                <span className={alt.validation.valid ? "badge ok" : "badge bad"}>
                  {alt.validation.valid ? "VALID" : "INVALID"}
                </span>{" "}
                solver {alt.solver.status} · {alt.solver.timeMs} ms ·{" "}
                {alt.validation.checks.map((c) => `${c.id}${c.ok ? "✓" : "✗"}`).join(" ")}
              </p>
              <p>
                {alt.explanation.text} <em className="small">({alt.explanation.source})</em>
              </p>
              <p className="small">
                delay {alt.metrics.totalDelay} min (weighted {alt.metrics.weightedDelay}) · moved{" "}
                {alt.metrics.moved} · delayed {alt.metrics.delayed} · unscheduled {alt.metrics.unscheduled}
              </p>

              <Gantt
                title={`Revised: ${alt.profile}`}
                plan={alt.plan}
                trains={trains}
                station={station}
                closures={sim.pending.closures}
                delays={sim.pending.delays}
                clock={sim.clock}
              />
              <Legend />

              <table>
                <thead>
                  <tr>
                    <th>Train</th>
                    <th>Result</th>
                    <th>Platform</th>
                    <th>Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {alt.diff
                    .filter((d) => d.cls !== "KEPT")
                    .map((d) => (
                      <tr key={d.trainId}>
                        <td>{d.trainId}</td>
                        <td>{d.cls}</td>
                        <td>
                          {d.from ?? "–"} → {d.to ?? "–"}
                        </td>
                        <td>
                          {d.reasons
                            .map((r) => `${r.code}${r.ref ? `(${r.ref})` : ""}${r.minutes ? ` ${r.minutes}m` : ""}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="small">{alt.diff.filter((d) => d.cls === "KEPT").length} train(s) kept unchanged.</p>
            </>
          )}

          {sim.pending.response.rejected.length > 0 && (
            <p className="err">
              {sim.pending.response.rejected.length} candidate plan(s) failed validation and are not offered.
            </p>
          )}
          <div className="row">
            <button onClick={() => sim.accept(altIndex)} disabled={!alt || !alt.validation.valid}>
              Accept this revision
            </button>
            <button onClick={sim.reject}>Reject</button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Trains</h2>
        <table>
          <thead>
            <tr>
              <th>Train</th>
              <th>Class</th>
              <th>State</th>
              <th>Platform</th>
              <th>Arr → Dep</th>
              <th>Delay</th>
            </tr>
          </thead>
          <tbody>
            {trains.map((t) => {
              const e = sim.plan.entries.find((x) => x.trainId === t.id);
              const d = sim.delays[t.id] ?? 0;
              return (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.cls}</td>
                  <td>{trainState(t, e, sim.clock, d)}</td>
                  <td>{e?.platform ?? "–"}</td>
                  <td>{e ? `${fmt(e.arr)} → ${fmt(e.dep)}` : "–"}</td>
                  <td>{d ? `+${d}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Event log</h2>
        <ul className="log">
          {sim.log.map((l, i) => (
            <li key={i} className={l.tone}>
              <b>{fmt(l.clock)}</b> {l.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}