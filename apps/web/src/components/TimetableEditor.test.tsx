import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TimetableEditor } from "./TimetableEditor";
import type { Scenario } from "./types";

afterEach(cleanup);

const s: Scenario = {
	station: { gap: 5, platforms: ["P1", "P2"], dwell_min: 2, max_hold: 120 },
	trains: [{ id: "T1", arr: 600, dep: 610, platform: "P1" }],
	closures: [],
	delays: [],
	now: 0,
};

test("valid edit calls onChange on blur", () => {
	let got: Scenario | null = null;
	render(<TimetableEditor scenario={s} onChange={(n) => (got = n)} />);
	const input = screen.getByLabelText("T1 arr");
	fireEvent.change(input, { target: { value: "10:05" } });
	fireEvent.blur(input);
	expect((got as Scenario | null)?.trains[0]?.arr).toBe(605);
});

test("invalid edit shows an error and does not call onChange", () => {
	let called = false;
	render(<TimetableEditor scenario={s} onChange={() => (called = true)} />);
	const input = screen.getByLabelText("T1 platform");
	fireEvent.change(input, { target: { value: "P9" } });
	fireEvent.blur(input);
	expect(screen.getByRole("alert").textContent).toContain(
		"unknown platform P9",
	);
	expect(called).toBe(false);
});
