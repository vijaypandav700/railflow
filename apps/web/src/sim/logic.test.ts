import { validate } from "@railflow/validator";
import { describe, expect, it } from "vitest";
import type { Scenario } from "../components/types";
import {
	applyEvents,
	breakPlan,
	initialPlan,
	replanBody,
	type SimEvent,
} from "./logic";

const scenario: Scenario = {
	station: { gap: 5, platforms: ["P1", "P2"], dwell_min: 2, max_hold: 120 },
	trains: [
		{ id: "T1", arr: 600, dep: 610, platform: "P1" },
		{ id: "T2", arr: 615, dep: 625, platform: "P2" },
	],
	closures: [],
	delays: [],
	now: 0,
};

describe("sim logic", () => {
	it("builds the initial plan from train platforms", () => {
		expect(initialPlan(scenario)).toEqual([
			{ train_id: "T1", platform: "P1", arr: 600, dep: 610 },
			{ train_id: "T2", platform: "P2", arr: 615, dep: 625 },
		]);
	});

	it("accumulates delays and closures", () => {
		const events: SimEvent[] = [
			{ id: "E1", at: 0, kind: "delay", train_id: "T1", minutes: 10 },
			{
				id: "E2",
				at: 0,
				kind: "closure",
				platform: "P2",
				start: 600,
				end: 700,
			},
		];
		const first = applyEvents([], [], events);
		const second = applyEvents(first.delays, first.closures, [
			{ id: "E3", at: 0, kind: "delay", train_id: "T1", minutes: 5 },
		]);
		expect(second.delays).toEqual([
			{ train_id: "T1", minutes: 10 },
			{ train_id: "T1", minutes: 5 },
		]);
		expect(second.closures).toEqual([
			{ id: "E2", platform: "P2", start: 600, end: 700 },
		]);
	});

	it("sends the current plan as previous_plan", () => {
		const body = replanBody(scenario, initialPlan(scenario), [], [], 30);
		expect(body.previous_plan).toHaveLength(2);
		expect(body.now).toBe(30);
	});

	it("break it makes the validator reject the plan", () => {
		const plan = initialPlan(scenario);
		const broken = breakPlan(plan, 0);
		expect(broken).not.toBeNull();
		const input = {
			...scenario,
			plan: broken,
			unscheduled: [],
			previous_plan: null,
			diff: null,
		};
		expect(validate({ ...input, plan }).valid).toBe(true);
		expect(validate(input).valid).toBe(false);
	});

	it("break it never moves frozen trains", () => {
		expect(breakPlan(initialPlan(scenario), 700)).toBeNull();
	});
});
