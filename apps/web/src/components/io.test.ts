import { describe, expect, it } from "vitest";
import { exportCsv, exportJson, parseCsv, parseJson } from "./io";
import type { Scenario } from "./types";

const base: Scenario = {
	station: { gap: 5, platforms: ["P1", "P2"], dwell_min: 2, max_hold: 120 },
	trains: [{ id: "T1", arr: 600, dep: 610, platform: "P1" }],
	closures: [],
	delays: [],
	now: 0,
};

describe("import/export", () => {
	it("round-trips CSV", () => {
		const out = parseCsv(exportCsv(base), base);
		expect(out.trains[0]).toMatchObject({
			id: "T1",
			arr: 600,
			dep: 610,
			platform: "P1",
		});
	});

	it("round-trips JSON", () => {
		expect(parseJson(exportJson(base)).trains).toHaveLength(1);
	});

	it("rejects bad JSON", () => {
		expect(() => parseJson("{nope")).toThrow("Not valid JSON");
	});

	it("rejects duplicate ids", () => {
		const csv = "id,arr,dep\nT1,10:00,10:10\nT1,11:00,11:10\n";
		expect(() => parseCsv(csv, base)).toThrow("Duplicate train id T1");
	});

	it("rejects departure before arrival with the train id", () => {
		expect(() => parseCsv("id,arr,dep\nT1,10:10,10:00\n", base)).toThrow(
			"T1: departure before arrival",
		);
	});

	it("rejects unknown platform", () => {
		const csv = "id,arr,dep,platform\nT1,10:00,10:10,P9\n";
		expect(() => parseCsv(csv, base)).toThrow("unknown platform P9");
	});

	it("reports the line of a bad time", () => {
		expect(() =>
			parseCsv("id,arr,dep\nT1,10:00,10:10\nT2,xx,11:00\n", base),
		).toThrow("line 3");
	});

	it("rejects a missing column", () => {
		expect(() => parseCsv("id,arr\nT1,10:00\n", base)).toThrow('missing "dep"');
	});
});
