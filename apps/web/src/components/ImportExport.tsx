import { useState } from "react";
import { exportCsv, exportJson, parseCsv, parseJson } from "./io";
import type { Scenario } from "./types";

type Props = { scenario: Scenario; onImport: (s: Scenario) => void };

function download(name: string, text: string, type: string) {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

export function ImportExport({ scenario, onImport }: Props) {
	const [msg, setMsg] = useState("");
	const [bad, setBad] = useState(false);

	async function onFile(file: File | undefined) {
		if (!file) return;
		try {
			const text = await file.text();
			const next = file.name.toLowerCase().endsWith(".csv")
				? parseCsv(text, scenario)
				: parseJson(text);
			onImport(next);
			setBad(false);
			setMsg(`Imported ${next.trains.length} trains from ${file.name}`);
		} catch (e: unknown) {
			setBad(true);
			setMsg(e instanceof Error ? e.message : String(e));
		}
	}

	return (
		<div
			className="flex flex-wrap items-center gap-2"
			data-testid="import-export"
		>
			<label>
				Import CSV or JSON{" "}
				<input
					type="file"
					accept=".csv,.json"
					onChange={(e) => {
						void onFile(e.target.files?.[0]);
						e.target.value = "";
					}}
				/>
			</label>
			<button
				type="button"
				onClick={() =>
					download("timetable.csv", exportCsv(scenario), "text/csv")
				}
			>
				Export CSV
			</button>
			<button
				type="button"
				onClick={() =>
					download("scenario.json", exportJson(scenario), "application/json")
				}
			>
				Export JSON
			</button>
			{msg ? <p role={bad ? "alert" : "status"}>{msg}</p> : null}
		</div>
	);
}
