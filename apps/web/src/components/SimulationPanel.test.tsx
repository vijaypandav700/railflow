import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
const same: Scenario = {
	station,
	trains: [
		{ id: "T1", arr: 600, dep: 610, platform: "P1" },
		{ id: "T2", arr: 615, dep: 625, platform: "P1" },
	],
	closures: [],
	delays: [],
	now: 0,
};
const apart: Scenario = {
	...same,
	trains: [
		{ id: "T1", arr: 600, dep: 610, platform: "P1" },
		{ id: "T2", arr: 615, dep: 625, platform: "P2" },
	],
};

const reply = {
	alternatives: [
		{
			solver: { status: "OPTIMAL", time_ms: 5 },
			plan: [
				{ train_id: "T1", platform: "P1", arr: 625, dep: 635 },
				{ train_id: "T2", platform: "P1", arr: 640, dep: 650 },
			],
			unscheduled: [],
			warnings: [],
			diff: [
				{
					train_id: "T1",
					class: "DELAYED",
					reasons: [{ code: "ARRIVAL_DELAYED", minutes: 25 }],
				},
				{
					train_id: "T2",
					class: "DELAYED",
					reasons: [{ code: "PLATFORM_OCCUPIED_BY", ref: "T1", minutes: 2 }],
				},
			],
			validation: { valid: true },
		},
	],
	rejected_plans: [],
};

describe("SimulationPanel", () => {
	it("inject, review, accept", async () => {
		let sent = "";
		const fake = (async (req: Request) => {
			sent = await req.clone().text();
			return new Response(JSON.stringify(reply), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;
		render(
			<SimulationPanel api={createApi("http://test", fake)} scenario={same} />,
		);
		expect(screen.getByTestId("live").textContent).toBe("VALID");

		fireEvent.click(screen.getByRole("button", { name: "Inject" }));
		const accept = await screen.findByRole("button", {
			name: "Accept this revision",
		});
		const body = JSON.parse(sent);
		expect(body.previous_plan).toHaveLength(2);
		expect(body.delays).toEqual([{ train_id: "T1", minutes: 25 }]);
		expect(screen.getByTestId("diff").textContent).toContain("ARRIVAL_DELAYED");

		fireEvent.click(accept);
		expect(await screen.findByText(/Accepted revision/)).toBeTruthy();
		expect(screen.queryByTestId("review")).toBeNull();
		expect(screen.getByTestId("live").textContent).toBe("VALID");
	});

	it("break it turns the plan invalid, restore fixes it", () => {
		render(<SimulationPanel api={createApi("http://test")} scenario={apart} />);
		expect(screen.getByTestId("live").textContent).toBe("VALID");
		fireEvent.click(screen.getByRole("button", { name: "Break it" }));
		expect(screen.getByTestId("live").textContent).toBe("INVALID");
		fireEvent.click(screen.getByRole("button", { name: "Restore plan" }));
		expect(screen.getByTestId("live").textContent).toBe("VALID");
	});
});
