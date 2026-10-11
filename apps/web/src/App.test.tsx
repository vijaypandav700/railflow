import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("shows title", () => {
	render(<App />);
	expect(screen.getByText("RailFlow")).toBeInTheDocument();
});
