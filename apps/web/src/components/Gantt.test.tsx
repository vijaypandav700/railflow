import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Gantt } from "./Gantt";
import { fmt } from "./time";

afterEach(cleanup);

describe("fmt", () => {
	it("formats minutes", () => {
		expect(fmt(575)).toBe("09:35");
		expect(fmt(0)).toBe("00:00");
		expect(fmt(1445)).toBe("00:05+1d");
	});
});

describe("Gantt", () => {
	const rows = [
		{ train_id: "T1", platform: "P1", arr: 600, dep: 610 },
		{ train_id: "T2", platform: "P1", arr: 615, dep: 625 },
		{ train_id: "T3", platform: "P2", arr: 600, dep: 620 },
	];

	it("draws a bar per train and a closure", () => {
		render(
			<Gantt
				platforms={["P1", "P2"]}
				rows={rows}
				gap={5}
				closures={[{ id: "C1", platform: "P2", start: 640, end: 700 }]}
			/>,
		);
		expect(screen.getByTestId("bar-T1")).toBeTruthy();
		expect(screen.getByTestId("bar-T2")).toBeTruthy();
		expect(screen.getByTestId("bar-T3")).toBeTruthy();
		expect(screen.getByTestId("closure-C1")).toBeTruthy();
	});

	it("marks conflicts with a flag and a label, not only colour", () => {
		render(
			<Gantt platforms={["P1", "P2"]} rows={rows} gap={5} conflicts={["T2"]} />,
		);
		expect(screen.getByTestId("bar-T2").getAttribute("data-conflict")).toBe(
			"true",
		);
		expect(screen.getByTestId("bar-T1").getAttribute("data-conflict")).toBe(
			"false",
		);
		expect(screen.getByTestId("bar-T2").textContent).toContain("!");
	});

	it("bars are keyboard focusable", () => {
		render(<Gantt platforms={["P1", "P2"]} rows={rows} gap={5} />);
		expect(screen.getByTestId("bar-T1").getAttribute("tabindex")).toBe("0");
	});
});
