import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../api/client";
import { DisruptPanel } from "./DisruptPanel";
import { parseTime } from "./time";
import type { Scenario } from "./types";

afterEach(cleanup);

const scenario: Scenario = {
	station: { gap: 5, platforms: ["P1", "P2"], dwell_min: 2, max_hold: 120 },
	trains: [
		{ id: "T1", arr: 600, dep: 610, platform: "P1" },
		{ id: "T2", arr: 615, dep: 625, platform: "P1" },
	],
	closures: [],
	delays: [],
	now: 0,
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

describe("parseTime", () => {
	it("parses", () => {
		expect(parseTime("10:30")).toBe(630);
		expect(parseTime("00:05+1d")).toBe(1445);
		expect(parseTime("25:00")).toBeNull();
		expect(parseTime("abc")).toBeNull();
	});
});

describe("DisruptPanel", () => {
	it("does nothing until Confirm, then shows plan and reasons", async () => {
		let calls = 0;
		let sent = "";
		const fake = (async (req: Request) => {
			calls += 1;
			sent = await req.clone().text();
			return new Response(JSON.stringify(reply), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;
		render(
			<DisruptPanel api={createApi("http://test", fake)} scenario={scenario} />,
		);

		fireEvent.change(screen.getByLabelText("Minutes"), {
			target: { value: "25" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add disruption" }));
		expect(screen.getByTestId("proposals").textContent).toContain(
			"delay T1 +25 min",
		);
		expect(calls).toBe(0);

		fireEvent.click(screen.getByRole("button", { name: "Confirm and replan" }));
		const status = await screen.findByTestId("result-status");
		expect(status.textContent).toContain("VALID");
		expect(calls).toBe(1);
		expect(JSON.parse(sent).delays).toEqual([{ train_id: "T1", minutes: 25 }]);
		expect(screen.getByTestId("diff").textContent).toContain("ARRIVAL_DELAYED");
		expect(screen.getByTestId("diff").textContent).toContain(
			"PLATFORM_OCCUPIED_BY(T1)",
		);
	});

	it("rejects a bad closure without calling the API", () => {
		render(<DisruptPanel api={createApi("http://test")} scenario={scenario} />);
		fireEvent.change(screen.getByLabelText("Type"), {
			target: { value: "closure" },
		});
		fireEvent.change(screen.getByLabelText("Start"), {
			target: { value: "11:00" },
		});
		fireEvent.change(screen.getByLabelText("End"), {
			target: { value: "10:00" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add disruption" }));
		expect(screen.getByRole("alert").textContent).toContain("end after start");
		expect(screen.getByTestId("proposals").children.length).toBe(0);
	});
});
