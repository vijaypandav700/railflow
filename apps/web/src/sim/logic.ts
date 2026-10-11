import { fmt } from "../components/time";
import type { Scenario } from "../components/types";
import type { Facts } from "../nl/explain";

export type Row = {
	train_id: string;
	platform: string;
	arr: number;
	dep: number;
};
export type Closure = {
	id: string;
	platform: string;
	start: number;
	end: number;
};
export type Delay = { train_id: string; minutes: number };
export type NewEvent =
	| { kind: "delay"; train_id: string; minutes: number }
	| { kind: "closure"; platform: string; start: number; end: number };
export type SimEvent = NewEvent & { id: string; at: number };

export type Reason = {
	code: string;
	ref?: string;
	minutes?: number;
	shortfall?: number;
};
export type DiffItem = { train_id: string; class: string; reasons: Reason[] };
export type Alt = {
	profile?: string;
	metrics?: Facts["metrics"];
	cascade?: { cause: string; effect: string }[];
	facts?: Facts;
	solver: { status: string; time_ms: number };
	plan: Row[];
	unscheduled: { train_id: string; reason: string }[];
	diff: DiffItem[];
	validation: { valid: boolean };
};
export type Replan = { alternatives: Alt[]; rejected_plans: Alt[] };

export function initialPlan(s: Scenario): Row[] {
	return s.trains.flatMap((t) =>
		t.platform
			? [{ train_id: t.id, platform: t.platform, arr: t.arr, dep: t.dep }]
			: [],
	);
}

export function describeEvent(e: NewEvent): string {
	return e.kind === "delay"
		? `${e.train_id} +${e.minutes} min`
		: `${e.platform} closed ${fmt(e.start)}-${fmt(e.end)}`;
}

/** Delays and closures accumulate across accepted replans. */
export function applyEvents(
	delays: Delay[],
	closures: Closure[],
	events: SimEvent[],
): { delays: Delay[]; closures: Closure[] } {
	const nextDelays = [...delays];
	const nextClosures = [...closures];
	for (const e of events) {
		if (e.kind === "delay")
			nextDelays.push({ train_id: e.train_id, minutes: e.minutes });
		else
			nextClosures.push({
				id: e.id,
				platform: e.platform,
				start: e.start,
				end: e.end,
			});
	}
	return { delays: nextDelays, closures: nextClosures };
}

/** The accepted plan goes in as previous_plan, so trains at a platform at `now` stay frozen. */
export function replanBody(
	s: Scenario,
	plan: Row[],
	delays: Delay[],
	closures: Closure[],
	now: number,
) {
	return {
		station: s.station,
		trains: s.trains,
		closures,
		delays,
		now,
		previous_plan: plan,
	};
}

/** "Break it": push one open train onto another platform's slot. Frozen trains never move. */
export function breakPlan(plan: Row[], now: number): Row[] | null {
	const open = plan.filter((r) => r.arr > now);
	for (const a of open) {
		for (const b of open) {
			if (a.platform !== b.platform) {
				return plan.map((r) =>
					r.train_id === b.train_id
						? {
								...r,
								platform: a.platform,
								arr: a.arr + 1,
								dep: Math.max(a.arr + 2, a.dep),
							}
						: r,
				);
			}
		}
	}
	return null;
}
