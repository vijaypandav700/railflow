import { fmt, parseTime } from "./time";
import type { Scenario } from "./types";

const CLASSES = ["local", "express", "premium"];
const MAX_TRAINS = 200;
const MAX_PLATFORMS = 12;

/** Field-level validation (FR-01, FR-02). Throws Error with a readable message. */
export function checkScenario(s: Scenario): Scenario {
	if (!s || typeof s !== "object" || !s.station || !Array.isArray(s.trains)) {
		throw new Error("Missing station or trains");
	}
	if (s.trains.length === 0) throw new Error("No trains");
	if (s.trains.length > MAX_TRAINS)
		throw new Error(`Too many trains (max ${MAX_TRAINS})`);
	if (!Array.isArray(s.station.platforms) || s.station.platforms.length === 0) {
		throw new Error("Station has no platforms");
	}
	if (s.station.platforms.length > MAX_PLATFORMS) {
		throw new Error(`Too many platforms (max ${MAX_PLATFORMS})`);
	}
	const seen = new Set<string>();
	for (const t of s.trains) {
		if (!t.id) throw new Error("A train has no id");
		if (seen.has(t.id)) throw new Error(`Duplicate train id ${t.id}`);
		seen.add(t.id);
		if (!Number.isInteger(t.arr) || !Number.isInteger(t.dep)) {
			throw new Error(`${t.id}: times must be whole minutes`);
		}
		if (t.arr < 0 || t.dep > 2880)
			throw new Error(`${t.id}: time out of range`);
		if (t.dep < t.arr) throw new Error(`${t.id}: departure before arrival`);
		for (const p of [t.platform, t.required_platform]) {
			if (p && !s.station.platforms.includes(p))
				throw new Error(`${t.id}: unknown platform ${p}`);
		}
		if (t.class && !CLASSES.includes(t.class))
			throw new Error(`${t.id}: unknown class ${t.class}`);
	}
	return s;
}

export function parseJson(text: string): Scenario {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("Not valid JSON");
	}
	const s = raw as Scenario;
	return checkScenario({
		station: s.station,
		trains: s.trains,
		closures: s.closures ?? [],
		delays: s.delays ?? [],
		now: s.now ?? 0,
	});
}

function cells(line: string): string[] {
	return line.split(",").map((c) => c.trim());
}

/** CSV columns: id,class,arr,dep,platform,required_platform. Station settings come from `base`. */
export function parseCsv(text: string, base: Scenario): Scenario {
	const lines = text
		.replace(/\r/g, "")
		.split("\n")
		.filter((l) => l.trim() !== "");
	if (lines.length < 2)
		throw new Error("CSV needs a header and at least one train");
	const header = cells(lines[0] ?? "").map((h) => h.toLowerCase());
	for (const need of ["id", "arr", "dep"]) {
		if (!header.includes(need))
			throw new Error(`CSV header is missing "${need}"`);
	}
	const trains = lines.slice(1).map((line, n) => {
		const c = cells(line);
		const get = (name: string) => c[header.indexOf(name)] ?? "";
		const arr = parseTime(get("arr"));
		const dep = parseTime(get("dep"));
		if (arr === null)
			throw new Error(`line ${n + 2}: bad arr time "${get("arr")}"`);
		if (dep === null)
			throw new Error(`line ${n + 2}: bad dep time "${get("dep")}"`);
		return {
			id: get("id"),
			class: get("class") || "local",
			arr,
			dep,
			platform: get("platform") || null,
			required_platform: get("required_platform") || null,
		};
	});
	return checkScenario({ ...base, trains, delays: [] });
}

export function exportCsv(s: Scenario): string {
	const rows = s.trains.map((t) =>
		[
			t.id,
			t.class ?? "local",
			fmt(t.arr),
			fmt(t.dep),
			t.platform ?? "",
			t.required_platform ?? "",
		].join(","),
	);
	return `${["id,class,arr,dep,platform,required_platform", ...rows].join("\n")}\n`;
}

export function exportJson(s: Scenario): string {
	return JSON.stringify(s, null, 2);
}
