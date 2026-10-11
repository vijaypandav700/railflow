import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createApi } from "../api/client";
import { MetricsPanel } from "./MetricsPanel";
import type { Scenario } from "./types";

afterEach(cleanup);

const m = {
	total_delay: 5,
	weighted_delay: 5,
	moved: 0,
	delayed: 1,
	max_delay: 5,
	unscheduled: 0,
};
const scenario: Scenario = {
	station: { gap: 5, platforms: ["P1"], dwell_min: 2, max_hold: 120 },
	trains: [{ id: "T1", arr: 600, dep: 610, platform: "P1" }],
	closures: [],
	delays: [],
	now: 0,
};

it("shows baselines and solver rows", async () => {
	const fake = (async () =>
		new Response(
			JSON.stringify({
				baselines: {
					push_later: { metrics: { ...m, weighted_delay: 9 }, valid: true },
					first_fit: { metrics: m, valid: true },
				},
				ours: {
					min_change: { status: "OPTIMAL", time_ms: 4, metrics: m },
					min_delay: { status: "OPTIMAL", time_ms: 5, metrics: m },
				},
				ours_beats_or_ties: true,
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		)) as unknown as typeof fetch;
	render(
		<MetricsPanel api={createApi("http://test", fake)} scenario={scenario} />,
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Compare with baselines" }),
	);
	expect(await screen.findByTestId("metrics")).toBeTruthy();
	expect(screen.getByTestId("verdict").textContent).toContain("beats or ties");
	expect(screen.getAllByRole("row")).toHaveLength(5);
});
