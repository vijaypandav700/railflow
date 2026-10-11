import { findConflicts, isFrozen, trainState } from "../sim/engine";
import { fmt } from "../sim/time";

const W = 1000;
const LEFT = 56;
const ROW = 46;
const TOP = 26;
const MARKER = 8; // left-edge class marker width

export function Legend() {
  return (
    <div className="legend" aria-label="Chart legend">
      <span><i className="sw local" /> L local</span>
      <span><i className="sw express" /> E express</span>
      <span><i className="sw premium" /> P premium</span>
      <span><i className="sw gap" /> required gap</span>
      <span><i className="sw closed" /> closure</span>
      <span><i className="sw conflict" /> conflict</span>
      <span><i className="sw held" /> held</span>
      <span><i className="sw now" /> at platform</span>
      <span>🔒 frozen</span>
    </div>
  );
}

export function Gantt({ title, plan, trains, station, closures, delays, clock }) {
  const byId = new Map(trains.map((t) => [t.id, t]));
  const conflicts = findConflicts(plan, station.gap, closures);
  const bad = new Set(conflicts.flatMap((c) => [c.a, c.b]));

  const all = [
    clock,
    ...plan.entries.flatMap((e) => [e.arr, e.dep + station.gap]),
    ...closures.flatMap((c) => [c.start, c.end]),
  ];
  const t0 = Math.floor((Math.min(...all) - 5) / 15) * 15;
  const t1 = Math.ceil((Math.max(...all) + 5) / 15) * 15;
  const x = (m) => LEFT + ((m - t0) / (t1 - t0)) * (W - LEFT - 10);
  const H = TOP + station.platforms.length * ROW + 10;

  const ticks = [];
  for (let m = t0; m <= t1; m += 15) ticks.push(m);

  return (
    <figure className="gantt">
      <figcaption>
        {title}
        <span className={conflicts.length ? "badge bad" : "badge ok"}>
          {conflicts.length ? `${conflicts.length} conflict(s)` : "no conflicts"}
        </span>
      </figcaption>

      <div className="gantt-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} platform timeline`}>
          <defs>
            <pattern id="gapHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#7b8496" strokeWidth="2" />
            </pattern>
            <pattern id="closureHatch" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 0L8 8M8 0L0 8" stroke="#6b7280" strokeWidth="1.3" />
            </pattern>
            <pattern id="badHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#d55e00" strokeWidth="3" />
            </pattern>
            {/* class markers: solid / diagonal stripes / dots */}
            <pattern id="mkLocal" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="#0072b2" />
            </pattern>
            <pattern id="mkExpress" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="#ffffff" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#0072b2" strokeWidth="3" />
            </pattern>
            <pattern id="mkPremium" width="5" height="5" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="#ffffff" />
              <circle cx="2.5" cy="2.5" r="1.6" fill="#0072b2" />
            </pattern>
          </defs>

          {station.platforms.map((p, i) =>
            i % 2 === 0 ? (
              <rect key={`band-${p}`} className="band" x={LEFT} y={TOP + i * ROW} width={W - LEFT - 10} height={ROW} />
            ) : null,
          )}

          {ticks.map((m) => (
            <g key={m}>
              <line
                x1={x(m)}
                x2={x(m)}
                y1={TOP - 4}
                y2={H - 6}
                className={m % 60 === 0 ? "grid" : "grid minor"}
              />
              {m % 60 === 0 && (
                <text x={x(m)} y={14} textAnchor="middle" className="tick">
                  {fmt(m)}
                </text>
              )}
            </g>
          ))}

          {station.platforms.map((p, i) => {
            const y = TOP + i * ROW;
            return (
              <g key={p}>
                <text x={10} y={y + ROW / 2 + 5} className="plat">
                  {p}
                </text>
                <line x1={LEFT} x2={W - 10} y1={y + ROW} y2={y + ROW} className="grid" />

                {closures
                  .filter((c) => c.platform === p)
                  .map((c) => (
                    <g key={c.id}>
                      <rect
                        x={x(c.start)}
                        y={y + 4}
                        width={Math.max(2, x(c.end) - x(c.start))}
                        height={ROW - 8}
                        rx={3}
                        fill="url(#closureHatch)"
                        className="closure"
                      />
                      <text x={x(c.start) + 6} y={y + ROW / 2 + 4} className="closure-label">
                        CLOSED
                      </text>
                    </g>
                  ))}

                {plan.entries
                  .filter((e) => e.platform === p)
                  .map((e) => {
                    const tr = byId.get(e.trainId);
                    if (!tr) return null;
                    const st = trainState(tr, e, clock, delays[e.trainId] ?? 0);
                    const frozen = isFrozen(e, clock);
                    const w = Math.max(MARKER + 4, x(e.dep) - x(e.arr));
                    const marker =
                      tr.cls === "premium" ? "url(#mkPremium)" : tr.cls === "express" ? "url(#mkExpress)" : "url(#mkLocal)";
                    const isBad = bad.has(e.trainId);
                    return (
                      <g
                        key={e.trainId}
                        tabIndex={0}
                        aria-label={`${tr.name}, ${tr.cls}, ${e.trainId} on ${p}, ${fmt(e.arr)} to ${fmt(e.dep)}, ${st}${
                          isBad ? ", in conflict" : ""
                        }${frozen ? ", frozen" : ""}`}
                      >
                        <title>{`${tr.name} (${tr.cls})\nscheduled ${fmt(tr.arr)}–${fmt(tr.dep)}\nactual ${fmt(
                          e.arr,
                        )}–${fmt(e.dep)}\nstate: ${st}`}</title>

                        {/* required gap after departure */}
                        <rect
                          x={x(e.dep)}
                          y={y + 9}
                          width={Math.max(2, x(e.dep + station.gap) - x(e.dep))}
                          height={ROW - 18}
                          fill="url(#gapHatch)"
                          opacity={0.7}
                        />

                        <rect
                          x={x(e.arr)}
                          y={y + 6}
                          width={w}
                          height={ROW - 12}
                          rx={4}
                          className={`bar ${st.toLowerCase()} ${isBad ? "conflict" : ""}`}
                        />
                        {/* class marker on the left edge */}
                        <rect
                          x={x(e.arr)}
                          y={y + 6}
                          width={MARKER}
                          height={ROW - 12}
                          rx={3}
                          fill={marker}
                          stroke="#0072b2"
                          strokeWidth="1"
                        />
                        {isBad && (
                          <rect
                            x={x(e.arr)}
                            y={y + 6}
                            width={w}
                            height={ROW - 12}
                            rx={4}
                            fill="url(#badHatch)"
                            opacity={0.5}
                            pointerEvents="none"
                          />
                        )}
                        <text
                          x={x(e.arr) + MARKER + 5}
                          y={y + ROW / 2 + 4}
                          className={`barlabel ${st === "DEPARTED" ? "dim" : ""}`}
                        >
                          {frozen ? "🔒 " : ""}
                          {isBad ? "⚠ " : ""}
                          {tr.cls[0].toUpperCase()}·{e.trainId}
                        </text>
                      </g>
                    );
                  })}
              </g>
            );
          })}

          <line x1={x(clock)} x2={x(clock)} y1={TOP - 6} y2={H - 6} className="now" />
          <text x={Math.min(x(clock) + 5, W - 70)} y={H - 10} className="nowlabel">
            now {fmt(clock)}
          </text>
        </svg>
      </div>
    </figure>
  );
}