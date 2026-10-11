import { useState } from "react";
import { editTrain, type Field } from "./editor";
import { fmt } from "./time";
import type { Scenario } from "./types";

type Props = { scenario: Scenario; onChange: (s: Scenario) => void };

function Cell({
	id,
	field,
	initial,
	scenario,
	onChange,
	onError,
}: {
	id: string;
	field: Field;
	initial: string;
	scenario: Scenario;
	onChange: (s: Scenario) => void;
	onError: (m: string) => void;
}) {
	const [value, setValue] = useState(initial);
	function commit() {
		if (value === initial) return;
		const r = editTrain(scenario, id, field, value);
		if ("error" in r) {
			onError(r.error);
			setValue(initial);
		} else {
			onError("");
			onChange(r.scenario);
		}
	}
	return (
		<input
			aria-label={`${id} ${field}`}
			value={value}
			size={7}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
			}}
		/>
	);
}

export function TimetableEditor({ scenario, onChange }: Props) {
	const [error, setError] = useState("");
	return (
		<section aria-label="Timetable editor">
			<h3>Timetable editor</h3>
			{error ? <p role="alert">{error}</p> : null}
			<table data-testid="editor">
				<thead>
					<tr>
						<th>Train</th>
						<th>Class</th>
						<th>Arr</th>
						<th>Dep</th>
						<th>Platform</th>
						<th>Required</th>
					</tr>
				</thead>
				<tbody>
					{scenario.trains.map((t) => (
						<tr
							key={`${t.id}-${t.arr}-${t.dep}-${t.platform}-${t.required_platform}-${t.class}`}
						>
							<td>{t.id}</td>
							<td>
								<Cell
									id={t.id}
									field="class"
									initial={t.class ?? "local"}
									scenario={scenario}
									onChange={onChange}
									onError={setError}
								/>
							</td>
							<td>
								<Cell
									id={t.id}
									field="arr"
									initial={fmt(t.arr)}
									scenario={scenario}
									onChange={onChange}
									onError={setError}
								/>
							</td>
							<td>
								<Cell
									id={t.id}
									field="dep"
									initial={fmt(t.dep)}
									scenario={scenario}
									onChange={onChange}
									onError={setError}
								/>
							</td>
							<td>
								<Cell
									id={t.id}
									field="platform"
									initial={t.platform ?? ""}
									scenario={scenario}
									onChange={onChange}
									onError={setError}
								/>
							</td>
							<td>
								<Cell
									id={t.id}
									field="required_platform"
									initial={t.required_platform ?? ""}
									scenario={scenario}
									onChange={onChange}
									onError={setError}
								/>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
