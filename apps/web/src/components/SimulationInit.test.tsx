import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createApi } from "../api/client";
import { SimulationPanel } from "./SimulationPanel";
import type { Scenario } from "./types";

afterEach(cleanup);

const station = {
	gap: 5,
	platforms: ["P1", "P2"],
	dwell_min: 2,
	max_hold: 120,
};
const trains = [
	{ id: "T1", arr: 600, dep: 610, platform: "P1" },
	{ id: "T2", arr: 615, dep: 625, platform: "P2" },
];

it("starts VALID even when the scenario file carries a delay", () => {
	const s: Scenario = {
		station,
		trains,
		closures: [],
		delays: [{ train_id: "T1", minutes: 25 }],
		now: 0,
	};
	render(<SimulationPanel api={createApi("http://test")} scenario={s} />);
	expect(screen.getByTestId("live").textContent).toBe("VALID");
});

it("starts VALID even when the scenario file carries a closure", () => {
	const s: Scenario = {
		station,
		trains,
		closures: [{ id: "C1", platform: "P1", start: 595, end: 700 }],
		delays: [],
		now: 0,
	};
	render(<SimulationPanel api={createApi("http://test")} scenario={s} />);
	expect(screen.getByTestId("live").textContent).toBe("VALID");
});
