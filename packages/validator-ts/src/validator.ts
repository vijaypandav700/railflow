/**
 * Independent TypeScript validator twin (PRD sections 4 and 13).
 * Written from the V1-V10 table. Shares no code with the Python validator.
 * Times are integer minutes. Brute-force pairwise checks on purpose.
 */

export type Row = {
	train_id: string;
	platform: string;
	arr: number;
	dep: number;
};
export type Train = {
	id: string;
	arr: number;
	dep: number;
	required_platform?: string | null;
	dwell_min?: number;
};
export type Station = {
	gap: number;
	platforms: string[];
	dwell_min: number;
	max_hold: number;
	closure_buffer?: number | null;
};
export type Delay = { train_id: string; minutes: number };
export type Closure = {
	id: string;
	platform: string;
	start: number;
	end: number;
};
export type Unscheduled = { train_id: string; reason?: string };
export type DiffItem = { train_id: string; class: string; reasons?: unknown[] };
export type Input = {
	station: Station;
	trains: Train[];
	delays: Delay[];
	closures: Closure[];
	now: number;
	plan: Row[];
	unscheduled: Unscheduled[];
	previous_plan?: Row[] | null;
	diff?: DiffItem[] | null;
};

export type ValidationError = {
	check: string;
	message: string;
	trains: string[];
	[key: string]: unknown;
};
export type CheckResult = {
	id: string;
	ok: boolean;
	errors: ValidationError[];
};
export type Warning = { code: string; closure: string; trains: string[] };
export type Result = {
	valid: boolean;
	checks: CheckResult[];
	warnings: Warning[];
};

export const KNOWN_REASONS: ReadonlySet<string> = new Set([
	"PLATFORM_OCCUPIED_BY",
	"PLATFORM_CLOSED",
	"GAP_REQUIRED",
	"YIELD_TO_PRIORITY",
	"ARRIVAL_DELAYED",
	"HELD_FOR_SLOT",
	"REQUIRED_PLATFORM_FIXED",
	"FROZEN_AT_NOW",
	"NO_FEASIBLE_SLOT",
	"CLOSURE_DEFERRED",
]);

function fail(
	check: string,
	message: string,
	trains: string[],
	extra: Record<string, unknown> = {},
): ValidationError {
	return { check, message, trains, ...extra };
}

function* pairs(plan: Row[]): Generator<[Row, Row]> {
	for (const [i, a] of plan.entries()) {
		for (const b of plan.slice(i + 1)) {
			if (a.platform === b.platform) yield [a, b];
		}
	}
}

function overlaps(a: Row, b: Row): boolean {
	return a.arr < b.dep && b.arr < a.dep;
}

function closureBuffer(d: Input): number {
	return d.station.closure_buffer ?? d.station.gap;
}

/** R7: trains whose arrival in the previous plan is at or before now. */
function frozenIds(d: Input): Set<string> {
	const previous = d.previous_plan;
	if (!previous || previous.length === 0) return new Set();
	return new Set(previous.filter((r) => r.arr <= d.now).map((r) => r.train_id));
}

/** R9: frozen trains still on the closed platform when the closure starts. */
function deferredRows(d: Input, closure: Closure): Row[] {
	const frozen = frozenIds(d);
	const buffer = closureBuffer(d);
	return d.plan.filter(
		(r) =>
			r.platform === closure.platform &&
			frozen.has(r.train_id) &&
			r.arr < closure.start &&
			r.dep + buffer > closure.start,
	);
}

export function checkV1(d: Input): ValidationError[] {
	const errors: ValidationError[] = [];
	const inputIds = d.trains.map((t) => t.id);
	const known = new Set(inputIds);
	const duplicated = [
		...new Set(
			inputIds.filter((id) => inputIds.filter((x) => x === id).length > 1),
		),
	].sort();
	for (const id of duplicated) {
		errors.push(fail("V1", `input train id ${id} is duplicated`, [id]));
	}
	const counts = new Map<string, number>();
	for (const row of [...d.plan, ...d.unscheduled]) {
		counts.set(row.train_id, (counts.get(row.train_id) ?? 0) + 1);
	}
	for (const [id, count] of [...counts.entries()].sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		if (!known.has(id)) {
			errors.push(fail("V1", `unknown train ${id} in plan`, [id]));
		} else if (count > 1) {
			errors.push(fail("V1", `train ${id} appears ${count} times`, [id]));
		}
	}
	for (const id of [...known].filter((x) => !counts.has(x)).sort()) {
		errors.push(fail("V1", `train ${id} is missing from plan`, [id]));
	}
	return errors;
}

export function checkV2(d: Input): ValidationError[] {
	const platforms = new Set(d.station.platforms);
	return d.plan
		.filter((r) => !platforms.has(r.platform))
		.map((r) =>
			fail("V2", `train ${r.train_id} on unknown platform ${r.platform}`, [
				r.train_id,
			]),
		);
}

export function checkV3(d: Input): ValidationError[] {
	const required = new Map(
		d.trains.map((t): [string, string | null] => [
			t.id,
			t.required_platform ?? null,
		]),
	);
	const errors: ValidationError[] = [];
	for (const row of d.plan) {
		const want = required.get(row.train_id) ?? null;
		if (want !== null && row.platform !== want) {
			errors.push(
				fail(
					"V3",
					`train ${row.train_id} requires ${want} but is on ${row.platform}`,
					[row.train_id],
				),
			);
		}
	}
	return errors;
}

export function checkV4(d: Input): ValidationError[] {
	const errors: ValidationError[] = [];
	for (const [a, b] of pairs(d.plan)) {
		if (overlaps(a, b)) {
			const minutes = Math.max(
				0,
				Math.min(a.dep, b.dep) - Math.max(a.arr, b.arr),
			);
			errors.push(
				fail(
					"V4",
					`${a.train_id} and ${b.train_id} overlap on ${a.platform}`,
					[a.train_id, b.train_id],
					{
						platform: a.platform,
						minutes,
					},
				),
			);
		}
	}
	return errors;
}

export function checkV5(d: Input): ValidationError[] {
	const gap = d.station.gap;
	const errors: ValidationError[] = [];
	for (const [a, b] of pairs(d.plan)) {
		if (overlaps(a, b)) continue; // V4 reports it
		const [first, second] = a.dep <= b.arr ? [a, b] : [b, a];
		const clearance = second.arr - first.dep;
		if (clearance < gap) {
			errors.push(
				fail(
					"V5",
					`${first.train_id} then ${second.train_id} on ${a.platform}: gap ${clearance} < ${gap}`,
					[first.train_id, second.train_id],
					{ platform: a.platform, shortfall: gap - clearance },
				),
			);
		}
	}
	return errors;
}

export function checkV6(d: Input): ValidationError[] {
	const gap = d.station.gap;
	const buffer = closureBuffer(d);
	const errors: ValidationError[] = [];
	for (const closure of d.closures) {
		const deferred = deferredRows(d, closure);
		const exempt = new Set(deferred.map((r) => r.train_id));
		const effective = Math.max(
			closure.start,
			...deferred.map((r) => r.dep + gap),
		);
		for (const row of d.plan) {
			if (row.platform !== closure.platform || exempt.has(row.train_id))
				continue;
			if (row.arr >= closure.end || row.dep + buffer <= effective) continue;
			errors.push(
				fail(
					"V6",
					`train ${row.train_id} hits closure ${closure.id} on ${closure.platform}`,
					[row.train_id],
					{
						closure: closure.id,
						platform: closure.platform,
					},
				),
			);
		}
	}
	return errors;
}

export function checkV7(d: Input): ValidationError[] {
	const trains = new Map(d.trains.map((t): [string, Train] => [t.id, t]));
	const delay = new Map<string, number>();
	for (const item of d.delays) {
		delay.set(item.train_id, (delay.get(item.train_id) ?? 0) + item.minutes);
	}
	const errors: ValidationError[] = [];
	for (const row of d.plan) {
		const train = trains.get(row.train_id);
		if (!train) continue; // V1 reports unknown trains
		const earliest = train.arr + (delay.get(row.train_id) ?? 0);
		const hold = row.arr - earliest;
		const dwellMin = train.dwell_min ?? d.station.dwell_min;
		const problems: [string, string][] = [];
		if (hold < 0) {
			problems.push([
				"EARLY_ARRIVAL",
				`arrives ${-hold} min before earliest ${earliest}`,
			]);
		}
		if (hold > d.station.max_hold) {
			problems.push([
				"HOLD_TOO_LONG",
				`hold ${hold} > max_hold ${d.station.max_hold}`,
			]);
		}
		if (row.dep < train.dep) {
			problems.push([
				"EARLY_DEPARTURE",
				`departs ${row.dep} before ${train.dep}`,
			]);
		}
		if (row.dep - row.arr < dwellMin) {
			problems.push([
				"SHORT_DWELL",
				`dwell ${row.dep - row.arr} < ${dwellMin}`,
			]);
		}
		for (const [kind, text] of problems) {
			errors.push(
				fail("V7", `train ${row.train_id}: ${text}`, [row.train_id], { kind }),
			);
		}
	}
	return errors;
}

export function checkV8(d: Input): ValidationError[] {
	const previous = d.previous_plan;
	if (!previous || previous.length === 0) return [];
	const current = new Map(d.plan.map((r): [string, Row] => [r.train_id, r]));
	const errors: ValidationError[] = [];
	for (const old of previous) {
		if (old.arr > d.now) continue;
		const next = current.get(old.train_id);
		if (!next) {
			errors.push(
				fail("V8", `frozen train ${old.train_id} is not in plan`, [
					old.train_id,
				]),
			);
		} else if (next.platform !== old.platform || next.arr !== old.arr) {
			errors.push(
				fail("V8", `frozen train ${old.train_id} was changed`, [old.train_id]),
			);
		} else if (old.dep <= d.now && next.dep !== old.dep) {
			errors.push(
				fail("V8", `departed train ${old.train_id} was changed`, [
					old.train_id,
				]),
			);
		}
	}
	return errors;
}

export function checkV9(d: Input): ValidationError[] {
	return d.unscheduled
		.filter((row) => row.reason === undefined || !KNOWN_REASONS.has(row.reason))
		.map((row) =>
			fail(
				"V9",
				`unscheduled train ${row.train_id} has unknown reason ${JSON.stringify(row.reason)}`,
				[row.train_id],
			),
		);
}

export function checkV10(d: Input): ValidationError[] {
	const diff = d.diff;
	if (!diff || diff.length === 0) return [];
	return diff
		.filter(
			(item) =>
				item.class !== "KEPT" && (!item.reasons || item.reasons.length === 0),
		)
		.map((item) =>
			fail(
				"V10",
				`changed train ${item.train_id} (${item.class}) has no reason`,
				[item.train_id],
			),
		);
}

function deferredWarnings(d: Input): Warning[] {
	const found: Warning[] = [];
	for (const closure of d.closures) {
		const deferred = deferredRows(d, closure);
		if (deferred.length > 0) {
			found.push({
				code: "CLOSURE_DEFERRED",
				closure: closure.id,
				trains: deferred.map((r) => r.train_id),
			});
		}
	}
	return found;
}

export const CHECKS: [string, (d: Input) => ValidationError[]][] = [
	["V1", checkV1],
	["V2", checkV2],
	["V3", checkV3],
	["V4", checkV4],
	["V5", checkV5],
	["V6", checkV6],
	["V7", checkV7],
	["V8", checkV8],
	["V9", checkV9],
	["V10", checkV10],
];

/** Run every check. Malformed input is INVALID, never valid. */
export function validate(data: unknown): Result {
	try {
		const input = data as Input;
		const checks = CHECKS.map(([id, check]): CheckResult => {
			const errors = check(input);
			return { id, ok: errors.length === 0, errors };
		});
		const warnings = deferredWarnings(input);
		return { valid: checks.every((c) => c.ok), checks, warnings };
	} catch (cause) {
		const message = `malformed input: ${String(cause)}`;
		return {
			valid: false,
			checks: [
				{ id: "INPUT", ok: false, errors: [fail("INPUT", message, [])] },
			],
			warnings: [],
		};
	}
}
