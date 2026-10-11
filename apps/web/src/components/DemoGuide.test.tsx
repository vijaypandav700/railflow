import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_STEPS, DemoGuide } from "./DemoGuide";

afterEach(cleanup);

describe("DemoGuide", () => {
	it("starts at step 1 with previous disabled", () => {
		render(<DemoGuide />);
		expect(screen.getByTestId("demo-title").textContent).toContain(
			"The problem",
		);
		expect(screen.getByRole("button", { name: "Previous" })).toHaveProperty(
			"disabled",
			true,
		);
	});

	it("walks every step and stops at the end", () => {
		render(<DemoGuide />);
		const next = screen.getByRole("button", { name: "Next step" });
		for (let n = 1; n < DEMO_STEPS.length; n++) fireEvent.click(next);
		expect(screen.getByTestId("demo-title").textContent).toContain(
			"Limits and audit",
		);
		expect(next).toHaveProperty("disabled", true);
		fireEvent.click(screen.getByRole("button", { name: "Restart" }));
		expect(screen.getByTestId("demo-title").textContent).toContain(
			"The problem",
		);
	});

	it("shows the Hinglish phrase and copies it", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		render(<DemoGuide />);
		const next = screen.getByRole("button", { name: "Next step" });
		fireEvent.click(next);
		fireEvent.click(next);
		expect(screen.getByTestId("demo-phrase").textContent).toBe(
			"T101 25 min late, P2 band 10 se 10:30 tak",
		);
		fireEvent.click(screen.getByRole("button", { name: "Copy phrase" }));
		expect(await screen.findByText("Copied")).toBeTruthy();
		expect(writeText).toHaveBeenCalledWith(
			"T101 25 min late, P2 band 10 se 10:30 tak",
		);
	});

	it("every phrase step has a copy target and the script fits 3 minutes", () => {
		const last = DEMO_STEPS[DEMO_STEPS.length - 1];
		expect(last?.at).toBe("2:50");
		expect(DEMO_STEPS.filter((s) => s.phrase).length).toBe(2);
	});
});
