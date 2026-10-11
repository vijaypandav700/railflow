import { useState } from "react";
import type { createApi } from "../api/client";
import { Gantt } from "./Gantt";
import { fmt, parseTime } from "./time";
import type { Scenario } from "./types";

type Proposal =
	| { id: string; kind: "delay"; train_id: string; minutes: number }
	| {
			id: string;
			kind: "closure";
			platform: string;
			start: number;
			end: number;
	  };

type Reason = {
	code: string;
	ref?: string;
	minutes?: number;
	shortfall?: number;
};
type DiffItem = { train_id: string; class: string; reasons: Reason[] };
type Alt = {
	solver: { status: string; time_ms: number };
	plan: { train_id: string; platform: string; arr: number; dep: number }[];
	unscheduled: { train_id: string; reason: string }[];
	diff: DiffItem[];
	validation: { valid: boolean };
};
type Replan = { alternatives: Alt[]; rejected_plans: Alt[] };

type Props = { api: ReturnType<typeof createApi>; scenario: Scenario };

function why(r: Reason): string {
	const extra = r.ref ? `(${r.ref})` : "";
	const num = r.minutes ?? r.shortfall;
	return `${r.code}${extra}${num !== undefined ? ` ${num}m` : ""}`;
}

export function DisruptPanel({ api, scenario }: Props) {
	const [kind, setKind] = useState<"delay" | "closure">("delay");
	const [train, setTrain] = useState("");
	const [minutes, setMinutes] = useState("");
	const [platform, setPlatform] = useState("");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [proposals, setProposals] = useState<Proposal[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<Replan | null>(null);

	function add() {
		setError("");
		const id = `d${proposals.length + 1}`;
		if (kind === "delay") {
			const t = train || scenario.trains[0]?.id || "";
			const m = Number(minutes);
			if (!t || !Number.isInteger(m) || m <= 0) {
				setError("Delay needs a train and whole minutes above 0");
				return;
			}
			setProposals([...proposals, { id, kind, train_id: t, minutes: m }]);
			setMinutes("");
			return;
		}
		const p = platform || scenario.station.platforms[0] || "";
		const s = parseTime(start);
		const e = parseTime(end);
		if (!p || s === null || e === null || e <= s) {
			setError("Closure needs a platform and times HH:MM with end after start");
			return;
		}
		setProposals([...proposals, { id, kind, platform: p, start: s, end: e }]);
		setStart("");
		setEnd("");
	}

	async function confirm() {
		setBusy(true);
		setError("");
		const closures = [
			...scenario.closures,
			...proposals.flatMap((p) =>
				p.kind === "closure"
					? [
							{
								id: `U${p.id}`,
								platform: p.platform,
								start: p.start,
								end: p.end,
							},
						]
					: [],
			),
		];
		const delays = [
			...scenario.delays,
			...proposals.flatMap((p) =>
				p.kind === "delay"
					? [{ train_id: p.train_id, minutes: p.minutes }]
					: [],
			),
		];
		try {
			const { data, error: err } = await api.POST("/api/replan", {
				body: {
					station: scenario.station,
					trains: scenario.trains,
					closures,
					delays,
					now: scenario.now,
				},
			});
			if (err) setError(JSON.stringify(err));
			else setResult(data as unknown as Replan);
		} catch (e: unknown) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}

	const alt = result?.alternatives[0] ?? result?.rejected_plans[0] ?? null;
	const valid = (result?.alternatives.length ?? 0) > 0;
	const shownClosures = [
		...scenario.closures,
		...proposals.flatMap((p) =>
			p.kind === "closure"
				? [{ id: `U${p.id}`, platform: p.platform, start: p.start, end: p.end }]
				: [],
		),
	];

	return (
		<section aria-label="Disruptions">
			<h2>Disruption</h2>
			<label>
				Type{" "}
				<select
					value={kind}
					onChange={(e) => setKind(e.target.value as "delay" | "closure")}
				>
					<option value="delay">delay</option>
					<option value="closure">closure</option>
				</select>
			</label>{" "}
			{kind === "delay" ? (
				<>
					<label>
						Train{" "}
						<select
							value={train || scenario.trains[0]?.id || ""}
							onChange={(e) => setTrain(e.target.value)}
						>
							{scenario.trains.map((t) => (
								<option key={t.id} value={t.id}>
									{t.id}
								</option>
							))}
						</select>
					</label>{" "}
					<label>
						Minutes{" "}
						<input
							value={minutes}
							onChange={(e) => setMinutes(e.target.value)}
							inputMode="numeric"
						/>
					</label>
				</>
			) : (
				<>
					<label>
						Platform{" "}
						<select
							value={platform || scenario.station.platforms[0] || ""}
							onChange={(e) => setPlatform(e.target.value)}
						>
							{scenario.station.platforms.map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>
					</label>{" "}
					<label>
						Start{" "}
						<input
							value={start}
							onChange={(e) => setStart(e.target.value)}
							placeholder="10:00"
						/>
					</label>{" "}
					<label>
						End{" "}
						<input
							value={end}
							onChange={(e) => setEnd(e.target.value)}
							placeholder="11:30"
						/>
					</label>
				</>
			)}{" "}
			<button type="button" onClick={add}>
				Add disruption
			</button>
			{error ? <p role="alert">{error}</p> : null}
			<ul data-testid="proposals">
				{proposals.map((p) => (
					<li key={p.id}>
						{p.kind === "delay"
							? `delay ${p.train_id} +${p.minutes} min`
							: `closure ${p.platform} ${fmt(p.start)}-${fmt(p.end)}`}{" "}
						<button
							type="button"
							onClick={() =>
								setProposals(proposals.filter((x) => x.id !== p.id))
							}
						>
							Remove
						</button>
					</li>
				))}
			</ul>
			<button
				type="button"
				disabled={busy || proposals.length === 0}
				onClick={confirm}
			>
				Confirm and replan
			</button>
			{alt ? (
				<div>
					<p data-testid="result-status">
						{valid ? "VALID" : "INVALID (rejected)"} · {alt.solver.status} ·{" "}
						{alt.solver.time_ms} ms
					</p>
					<Gantt
						platforms={scenario.station.platforms}
						rows={alt.plan}
						closures={shownClosures}
						gap={scenario.station.gap}
					/>
					{alt.unscheduled.length > 0 ? (
						<p data-testid="unscheduled">
							Unscheduled:{" "}
							{alt.unscheduled
								.map((u) => `${u.train_id} (${u.reason})`)
								.join(", ")}
						</p>
					) : null}
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
				</div>
			) : null}
		</section>
	);
}
