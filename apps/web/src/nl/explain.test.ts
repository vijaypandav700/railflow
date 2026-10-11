import { describe, expect, it } from "vitest";
import { compareFacts, explainAlt, type Facts, factGuard } from "./explain";

const a: Facts = {
	profile: "min_change",
	metrics: {
		total_delay: 45,
		weighted_delay: 90,
		moved: 0,
		delayed: 2,
		max_delay: 25,
		unscheduled: 0,
	},
	changed: [
		{ train_id: "T101", class: "DELAYED" },
		{ train_id: "T105", class: "DELAYED" },
	],
};
const b: Facts = {
	...a,
	profile: "min_delay",
	metrics: { ...a.metrics, total_delay: 30, moved: 2 },
};

describe("explain", () => {
	it("template uses only facts", () => {
		const text = explainAlt(a);
		expect(text).toContain("45 min");
		expect(factGuard(text, a)).toBe(true);
	});
	it("compare lists both profiles", () => {
		const text = compareFacts([a, b]);
		expect(text).toContain("min_change");
		expect(text).toContain("min_delay");
		expect(compareFacts([a])).toBeNull();
	});
	it("guard rejects an invented number or train", () => {
		expect(factGuard("T101 delayed 99 min", a)).toBe(false);
		expect(factGuard("T777 delayed 25 min", a)).toBe(false);
		expect(factGuard("T101 delayed 25 min", a)).toBe(true);
	});
});
