import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
	cleanup();
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});

it("cycles auto, light, dark and sets data-theme", () => {
	render(<ThemeToggle />);
	const btn = screen.getByRole("button");
	expect(btn.textContent).toBe("Theme: auto");
	fireEvent.click(btn);
	expect(document.documentElement.getAttribute("data-theme")).toBe("light");
	fireEvent.click(btn);
	expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	expect(localStorage.getItem("railflow-theme")).toBe("dark");
	fireEvent.click(btn);
	expect(document.documentElement.getAttribute("data-theme")).toBeNull();
});
