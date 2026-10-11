import { validate } from "@railflow/validator";
import { useEffect, useMemo, useState } from "react";
import type { createApi } from "../api/client";
import { Gantt } from "./Gantt";

type Scenario = {
	station: {
		gap: number;
		platforms: string[];
		dwell_min: number;
		max_hold: number;
		closure_buffer?: number | null;
	};
	trains: {
		id: string;
		arr: number;
		dep: number;
		platform?: string | null;
		required_platform?: string | null;
	}[];
	closures: { id: string; platform: string; start: number; end: number }[];
	delays: { train_id: string; minutes: number }[];
	now: number;
};

type Props = { api: ReturnType<typeof createApi> };

export function PlanScreen({ api }: Props) {
	const [ids, setIds] = useState<string[]>([]);
	const [selected, setSelected] = useState("");
	const [scenario, setScenario] = useState<Scenario | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		api
			.GET("/api/scenarios")
			.then(({ data }) => {
				const list = ((data ?? []) as { id: string }[]).map((s) => s.id);
				setIds(list);
				if (list[0]) setSelected(list[0]);
			})
			.catch((e: unknown) => setError(String(e)));
	}, [api]);

	useEffect(() => {
		if (!selected) return;
		api
			.GET("/api/scenarios/{scenario_id}", {
				params: { path: { scenario_id: selected } },
			})
			.then(({ data }) =>
				setScenario((data ?? null) as unknown as Scenario | null),
			)
			.catch((e: unknown) => setError(String(e)));
	}, [api, selected]);

	const view = useMemo(() => {
		if (!scenario) return null;
		const rows = scenario.trains
			.filter((t) => t.platform)
			.map((t) => ({
				train_id: t.id,
				platform: t.platform as string,
				arr: t.arr,
				dep: t.dep,
			}));
		const result = validate({
			station: scenario.station,
			trains: scenario.trains,
			delays: [],
			closures: scenario.closures,
			now: scenario.now,
			plan: rows,
			unscheduled: [],
			previous_plan: null,
			diff: null,
		});
		const errors = result.checks.flatMap((c) => c.errors);
		return {
			rows,
			errors,
			valid: result.valid,
			conflicts: [...new Set(errors.flatMap((e) => e.trains))],
		};
	}, [scenario]);

	return (
		<section>
			<label>
				Scenario{" "}
				<select
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
					data-testid="picker"
				>
					{ids.map((id) => (
						<option key={id} value={id}>
							{id}
						</option>
					))}
				</select>
			</label>
			{error ? <p role="alert">{error}</p> : null}
			{scenario && view ? (
				<>
					<p data-testid="status">
						{view.valid
							? "VALID: no conflicts"
							: `INVALID: ${view.errors.length} problem(s)`}
					</p>
					<Gantt
						platforms={scenario.station.platforms}
						rows={view.rows}
						closures={scenario.closures}
						gap={scenario.station.gap}
						conflicts={view.conflicts}
					/>
					<ul data-testid="conflicts">
						{view.errors.map((e) => (
							<li key={`${e.check}-${e.trains.join("-")}-${e.message}`}>
								{e.check}: {e.message}
							</li>
						))}
					</ul>
				</>
			) : null}
		</section>
	);
}
