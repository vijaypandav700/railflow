import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import App from "./App";
import { createApi } from "./api/client";

afterEach(cleanup);

const fake = (async () =>
	new Response("[]", {
		status: 200,
		headers: { "content-type": "application/json" },
	})) as unknown as typeof fetch;

test("shows title and the plan screen", async () => {
	render(<App api={createApi("http://test", fake)} />);
	expect(screen.getByText("RailFlow")).toBeInTheDocument();
	expect(await screen.findByTestId("picker")).toBeInTheDocument();
});

test("theme toggle flips data-theme", async () => {
	render(<App api={createApi("http://test", fake)} />);
	const before = document.documentElement.getAttribute("data-theme");
	fireEvent.click(screen.getByRole("button", { name: /theme/i }));
	const after = document.documentElement.getAttribute("data-theme");
	expect(after).not.toBe(before);
	expect(["light", "dark"]).toContain(after);
	await screen.findByTestId("picker");
});
