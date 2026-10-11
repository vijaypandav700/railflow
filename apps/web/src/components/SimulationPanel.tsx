import { useMemo, useState } from "react";
import type { createApi } from "../api/client";
import type { NewEvent, Reason } from "../sim/logic";
import { useSimulation } from "../sim/useSimulation";
import { Gantt } from "./Gantt";
import { NlBox } from "./NlBox";
import { fmt, parseTime } from "./time";
import type { Scenario } from "./types";
import { ValidatorPanel } from "./ValidatorPanel";

type Props = { api: ReturnType<typeof createApi>; scenario: Scenario };

function why(r: Reason): string {
	const num = r.minutes ?? r.shortfall;
	return `${r.code}${r.ref ? `(${r.ref})` : ""}${num !== undefined ? ` ${num}m` : ""}`;
}

export function SimulationPanel({ api, scenario }: Props) {
	const sim = useSimulation(api, scenario);
	const [kind, setKind] = useState<"delay" | "closure">("delay");
	const [trainId, setTrainId] = useState(scenario.trains[0]?.id ?? "");
	const [minutes, setMinutes] = useState("25");
	const [platform, setPlatform] = useState(scenario.station.platforms[0] ?? "");
	const [start, setStart] = useState("10:00");
	const [end, setEnd] = useState("10:30");
	const [at, setAt] = useState("");
	const [formError, setFormError] = useState("");

	const classes = useMemo(
		() =>
			Object.fromEntries(
				scenario.trains.map((t) => [t.id, t.class ?? "local"]),
			),
		[scenario],
	);
	const conflicts = [
		...new Set(
			sim.live.checks.flatMap((c) => c.errors.flatMap((e) => e.trains)),
		),
	];
	const alt = sim.pending
		? (sim.pending.replan.alternatives[0] ??
			sim.pending.replan.rejected_plans[0])
		: undefined;
	const offered = (sim.pending?.replan.alternatives.length ?? 0) > 0;

	function submit() {
		const when = at.trim() ? parseTime(at) : sim.clock;
		if (when === null) return setFormError("Fire time must look like 09:30");
		if (when < sim.clock)
			return setFormError("Event time is already in the past");
		let ev: NewEvent;
		if (kind === "delay") {
			const m = Number(minutes);
			if (!trainId || !Number.isInteger(m) || m < 1 || m > 600) {
				return setFormError("Delay needs a train and whole minutes (1-600)");
			}
			ev = { kind: "delay", train_id: trainId, minutes: m };
		} else {
			const s = parseTime(start);
			const e = parseTime(end);
			if (!platform || s === null || e === null || e <= s) {
				return setFormError(
					"Closure needs a platform and HH:MM times, end after start",
				);
			}
			ev = { kind: "closure", platform, start: s, end: e };
		}
		setFormError("");
		sim.schedule(ev, when);
	}

	return (
		<section aria-label="Simulation">
			<h2>Simulation</h2>
			<p>
				Clock <b data-testid="clock">{fmt(sim.clock)}</b> · Plan{" "}
				<b data-testid="live">{sim.live.valid ? "VALID" : "INVALID"}</b>
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={sim.busy || !!sim.pending}
					onClick={sim.playing ? sim.pause : sim.play}
				>
					{sim.playing ? "Pause" : "Play"}
				</button>
				{[1, 5, 15].map((s) => (
					<button
						key={s}
						type="button"
						aria-pressed={sim.speed === s}
						onClick={() => sim.setSpeed(s)}
					>
						{s}x
					</button>
				))}
				<input
					type="range"
					aria-label="Scrub clock"
					min={sim.start}
					max={sim.end}
					value={sim.clock}
					onChange={(e) => sim.scrub(Number(e.target.value))}
				/>
				<button type="button" onClick={sim.broken ? sim.restore : sim.breakIt}>
					{sim.broken ? "Restore plan" : "Break it"}
				</button>
			</div>

			<Gantt
				idPrefix="sim-"
				platforms={scenario.station.platforms}
				rows={sim.plan}
				closures={sim.closures}
				gap={scenario.station.gap}
				conflicts={conflicts}
				classes={classes}
				frozen={sim.frozen}
				now={sim.clock}
			/>
			{sim.unscheduled.length > 0 ? (
				<p>
					Unscheduled:{" "}
					{sim.unscheduled.map((u) => `${u.train_id} (${u.reason})`).join(", ")}
				</p>
			) : null}

			<ValidatorPanel result={sim.live} />

			<NlBox
				ctx={{ trains: scenario.trains, platforms: scenario.station.platforms }}
				disabled={sim.busy || !!sim.pending}
				onConfirm={(events) => {
					for (const ev of events) sim.schedule(ev, sim.clock);
				}}
			/>
			<h3>Inject disruption</h3>
			<div className="flex flex-wrap items-center gap-2">
				<label>
					Type{" "}
					<select
						value={kind}
						onChange={(e) => setKind(e.target.value as "delay" | "closure")}
					>
						<option value="delay">delay</option>
						<option value="closure">closure</option>
					</select>
				</label>
				{kind === "delay" ? (
					<>
						<label>
							Train{" "}
							<select
								value={trainId}
								onChange={(e) => setTrainId(e.target.value)}
							>
								{scenario.trains.map((t) => (
									<option key={t.id} value={t.id}>
										{t.id}
									</option>
								))}
							</select>
						</label>
						<label>
							Delay min{" "}
							<input
								value={minutes}
								onChange={(e) => setMinutes(e.target.value)}
								size={4}
							/>
						</label>
					</>
				) : (
					<>
						<label>
							Platform{" "}
							<select
								value={platform}
								onChange={(e) => setPlatform(e.target.value)}
							>
								{scenario.station.platforms.map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</select>
						</label>
						<label>
							From{" "}
							<input
								value={start}
								onChange={(e) => setStart(e.target.value)}
								size={6}
							/>
						</label>
						<label>
							To{" "}
							<input
								value={end}
								onChange={(e) => setEnd(e.target.value)}
								size={6}
							/>
						</label>
					</>
				)}
				<label>
					At{" "}
					<input
						value={at}
						onChange={(e) => setAt(e.target.value)}
						size={6}
						placeholder="now"
					/>
				</label>
				<button
					type="button"
					disabled={sim.busy || !!sim.pending}
					onClick={submit}
				>
					Inject
				</button>
			</div>
			{formError ? <p role="alert">{formError}</p> : null}
			{sim.error ? <p role="alert">Backend: {sim.error}</p> : null}
			{sim.busy ? <p>Replanning...</p> : null}
			{sim.queue.length > 0 ? (
				<p>
					Queued: {sim.queue.map((e) => `${fmt(e.at)} ${e.kind}`).join(", ")}
				</p>
			) : null}

			{sim.pending && alt ? (
				<div data-testid="review">
					<h3>Review revision (nothing applies until you accept)</h3>
					<p>
						{offered ? "VALID" : "INVALID (rejected)"} · {alt.solver.status} ·{" "}
						{alt.solver.time_ms} ms
					</p>
					<Gantt
						idPrefix="rev-"
						platforms={scenario.station.platforms}
						rows={alt.plan}
						closures={sim.pending.closures}
						gap={scenario.station.gap}
						classes={classes}
						now={sim.clock}
					/>
					<table data-testid="diff">
						<thead>
							<tr>
								<th>Train</th>
								<th>Change</th>
								<th>Reasons</th>
							</tr>
						</thead>
						<tbody>
							{alt.diff
								.filter((d) => d.class !== "KEPT")
								.map((d) => (
									<tr key={d.train_id}>
										<td>{d.train_id}</td>
										<td>{d.class}</td>
										<td>{d.reasons.map(why).join(", ")}</td>
									</tr>
								))}
						</tbody>
					</table>
					<div className="flex gap-2">
						<button type="button" disabled={!offered} onClick={sim.accept}>
							Accept this revision
						</button>
						<button type="button" onClick={sim.reject}>
							Reject
						</button>
					</div>
				</div>
			) : null}

			<h3>Event log</h3>
			<ul data-testid="log">
				{sim.log.map((l) => (
					<li key={l.id}>
						<b>{fmt(l.clock)}</b> {l.text}
					</li>
				))}
			</ul>
		</section>
	);
}
