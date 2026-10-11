import { parseTime } from "./time";
import type { Scenario } from "./types";

export type Field = "arr" | "dep" | "platform" | "required_platform" | "class";

/** Returns an updated scenario, or an error message. Never mutates the input. */
export function editTrain(
	s: Scenario,
	id: string,
	field: Field,
	value: string,
): { scenario: Scenario } | { error: string } {
	const idx = s.trains.findIndex((t) => t.id === id);
	if (idx < 0) return { error: `Unknown train ${id}` };
	const old = s.trains[idx];
	if (!old) return { error: `Unknown train ${id}` };
	let next = { ...old };
	if (field === "arr" || field === "dep") {
		const m = parseTime(value);
		if (m === null) return { error: `${id}: ${field} must look like 09:30` };
		next = { ...next, [field]: m };
		if (next.dep < next.arr)
			return { error: `${id}: departure before arrival` };
	} else if (field === "class") {
		if (!["local", "express", "premium"].includes(value))
			return { error: `${id}: unknown class` };
		next = { ...next, class: value };
	} else {
		const v = value.trim();
		if (v && !s.station.platforms.includes(v))
			return { error: `${id}: unknown platform ${v}` };
		next = { ...next, [field]: v || null };
	}
	const trains = s.trains.map((t, i) => (i === idx ? next : t));
	return { scenario: { ...s, trains } };
}
