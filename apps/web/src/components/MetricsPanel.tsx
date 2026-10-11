import { useState } from "react";
import type { createApi } from "../api/client";
import type { Scenario } from "./types";

type M = {
	total_delay: number;
	weighted_delay: number;
	moved: number;
	delayed: number;
	max_delay: number;
	unscheduled: number;
};
type Compare = {
	baselines: Record<string, { metrics: M; valid: boolean }>;
	ours: Record<string, { status: string; time_ms: number; metrics: M }>;
	ours_beats_or_ties: boolean;
};

type Props = { api: ReturnType<typeof createApi>; scenario: Scenario };

export function MetricsPanel({ api, scenario }: Props) {
	const [data, setData] = useState<Compare | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function run() {
		setBusy(true);
		setError("");
		try {
			const { data: d, error: err } = await api.POST("/api/baseline/compare", {
				body: scenario as never,
			});
			if (err || !d) setError(JSON.stringify(err ?? "empty response"));
			else setData(d as unknown as Compare);
		} catch (e: unknown) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}

	const rows: { name: string; kind: string; m: M; note: string }[] = data
		? [
				...Object.entries(data.baselines).map(([name, v]) => ({
					name,
					kind: "baseline",
					m: v.metrics,
					note: v.valid ? "valid" : "INVALID",
				})),
				...Object.entries(data.ours).map(([name, v]) => ({
					name,
					kind: "solver",
					m: v.metrics,
					note: `${v.status} ${v.time_ms} ms`,
				})),
			]
		: [];

	return (
		<section aria-label="Metrics">
			<h3>Solver vs baseline</h3>
			<button type="button" disabled={busy} onClick={() => void run()}>
				{busy ? "Comparing..." : "Compare with baselines"}
			</button>
			{error ? <p role="alert">{error}</p> : null}
			{data ? (
				<>
					<p data-testid="verdict">
						{data.ours_beats_or_ties
							? "Solver beats or ties the best baseline."
							: "A baseline beat the solver on this input."}
					</p>
					<table data-testid="metrics">
						<thead>
							<tr>
								<th>Planner</th>
								<th>Type</th>
								<th>Weighted delay</th>
								<th>Total delay</th>
								<th>Moved</th>
								<th>Max delay</th>
								<th>Unscheduled</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td>{r.name}</td>
									<td>{r.kind}</td>
									<td>{r.m.weighted_delay}</td>
									<td>{r.m.total_delay}</td>
									<td>{r.m.moved}</td>
									<td>{r.m.max_delay}</td>
									<td>{r.m.unscheduled}</td>
									<td>{r.note}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			) : null}
		</section>
	);
}
