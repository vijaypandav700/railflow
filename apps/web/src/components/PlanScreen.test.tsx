import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../api/client";
import { PlanScreen } from "./PlanScreen";

afterEach(cleanup);

const station = {
	gap: 5,
	platforms: ["P1", "P2"],
	dwell_min: 2,
	max_hold: 120,
};

function fakeApi(trains: unknown[]) {
	const fake = (async (req: Request) => {
		const path = new URL(req.url).pathname;
		const body =
			path === "/api/scenarios"
				? [{ id: "S00-test" }]
				: { station, trains, closures: [], delays: [], now: 0 };
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return createApi("http://test", fake);
}

describe("PlanScreen", () => {
	it("shows a valid plan", async () => {
		const api = fakeApi([
			{ id: "T1", arr: 600, dep: 610, platform: "P1" },
			{ id: "T2", arr: 620, dep: 630, platform: "P1" },
		]);
		render(<PlanScreen api={api} />);
		const status = await screen.findByTestId("status");
		expect(status.textContent).toContain("VALID");
		expect(screen.getByTestId("conflicts").children.length).toBe(0);
		expect(screen.getByTestId("bar-T1").getAttribute("data-conflict")).toBe(
			"false",
		);
	});

	it("lists conflicts and flags the bars", async () => {
		const api = fakeApi([
			{ id: "T1", arr: 600, dep: 610, platform: "P1" },
			{ id: "T2", arr: 605, dep: 615, platform: "P1" },
		]);
		render(<PlanScreen api={api} />);
		const status = await screen.findByTestId("status");
		expect(status.textContent).toContain("INVALID");
		expect(screen.getByTestId("conflicts").textContent).toContain("V4");
		expect(screen.getByTestId("bar-T2").getAttribute("data-conflict")).toBe(
			"true",
		);
	});
});
