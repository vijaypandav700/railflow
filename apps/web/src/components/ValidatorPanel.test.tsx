import { validate } from "@railflow/validator";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ValidatorPanel } from "./ValidatorPanel";

afterEach(cleanup);

const base = {
	station: { gap: 5, platforms: ["P1"], dwell_min: 2, max_hold: 120 },
	trains: [
		{ id: "T1", arr: 600, dep: 610 },
		{ id: "T2", arr: 620, dep: 630 },
	],
	delays: [],
	closures: [],
	now: 0,
	unscheduled: [],
	previous_plan: null,
	diff: null,
};

test("all ten checks pass on a clean plan", () => {
	const plan = [
		{ train_id: "T1", platform: "P1", arr: 600, dep: 610 },
		{ train_id: "T2", platform: "P1", arr: 620, dep: 630 },
	];
	render(<ValidatorPanel result={validate({ ...base, plan })} />);
	expect(screen.getByTestId("validator-verdict").textContent).toBe("ALL PASS");
	for (let i = 1; i <= 10; i++) {
		expect(screen.getByTestId(`check-V${i}`).getAttribute("data-ok")).toBe(
			"true",
		);
	}
});

test("overlap turns V4 red and lists the error", () => {
	const plan = [
		{ train_id: "T1", platform: "P1", arr: 600, dep: 610 },
		{ train_id: "T2", platform: "P1", arr: 605, dep: 615 },
	];
	render(<ValidatorPanel result={validate({ ...base, plan })} />);
	expect(screen.getByTestId("validator-verdict").textContent).toBe("FAILED");
	expect(screen.getByTestId("check-V4").getAttribute("data-ok")).toBe("false");
	expect(screen.getByTestId("check-V4").textContent).toContain("overlap");
});
