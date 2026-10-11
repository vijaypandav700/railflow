import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { loadSettings, Settings } from "./Settings";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("defaults to rules mode", () => {
	expect(loadSettings().mode).toBe("rules");
});

it("changing mode saves and reports the new value", () => {
	let got = loadSettings();
	render(<Settings value={got} onChange={(s) => (got = s)} />);
	fireEvent.change(screen.getByLabelText("AI mode"), {
		target: { value: "ollama" },
	});
	expect(got.mode).toBe("ollama");
	expect(loadSettings().mode).toBe("ollama");
});

it("falls back to defaults on corrupt storage", () => {
	localStorage.setItem("railflow-ai", "{not json");
	expect(loadSettings().mode).toBe("rules");
});
