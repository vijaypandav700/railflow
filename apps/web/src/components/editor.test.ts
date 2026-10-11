import { describe, expect, it } from "vitest";
import { editTrain } from "./editor";
import type { Scenario } from "./types";

const s: Scenario = {
	station: { gap: 5, platforms: ["P1", "P2"], dwell_min: 2, max_hold: 120 },
	trains: [{ id: "T1", arr: 600, dep: 610, platform: "P1" }],
	closures: [],
	delays: [],
	now: 0,
};

describe("editTrain", () => {
	it("changes arrival without mutating the input", () => {
		const r = editTrain(s, "T1", "arr", "10:05");
		expect("scenario" in r && r.scenario.trains[0]?.arr).toBe(605);
		expect(s.trains[0]?.arr).toBe(600);
	});
	it("rejects departure before arrival", () => {
		expect(editTrain(s, "T1", "dep", "09:00")).toEqual({
			error: "T1: departure before arrival",
		});
	});
	it("rejects unknown platform", () => {
		expect(editTrain(s, "T1", "platform", "P9")).toEqual({
			error: "T1: unknown platform P9",
		});
	});
	it("empty platform clears it", () => {
		const r = editTrain(s, "T1", "platform", "");
		expect("scenario" in r && r.scenario.trains[0]?.platform).toBeNull();
	});
	it("rejects bad time", () => {
		expect("error" in editTrain(s, "T1", "arr", "xx")).toBe(true);
	});
});
