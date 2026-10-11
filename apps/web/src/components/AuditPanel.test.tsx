import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuditPanel, normalizeEntries, normalizeVerify } from "./AuditPanel";

afterEach(cleanup);

function reply(body: unknown, status = 200): typeof fetch {
	return (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

describe("normalize", () => {
	it("accepts array or wrapped entries, drops junk", () => {
		const row = { seq: 1, type: "REPLAN", hash: "abc", ts: "t" };
		expect(normalizeEntries([row, { nope: 1 }, null])).toHaveLength(1);
		expect(normalizeEntries({ entries: [row] })).toHaveLength(1);
		expect(normalizeEntries("x")).toEqual([]);
	});

	it("reads verify results and never assumes ok", () => {
		expect(normalizeVerify({ ok: true }).ok).toBe(true);
		expect(normalizeVerify({ valid: false, first_broken: 3 })).toMatchObject({
			ok: false,
			brokenSeq: 3,
		});
		expect(normalizeVerify({ ok: true, broken_seq: 2 }).ok).toBe(false);
		expect(normalizeVerify({}).ok).toBe(false);
	});
});

describe("AuditPanel", () => {
	it("does not fetch on mount, lists entries on refresh", async () => {
		const rows = [
			{ seq: 1, type: "PARSE", hash: "aaaaaaaaaaaaaaaa", ts: "t1" },
			{ seq: 2, type: "REPLAN", hash: "bbbbbbbbbbbbbbbb", ts: "t2" },
		];
		render(<AuditPanel fetchImpl={reply(rows)} />);
		expect(screen.queryByTestId("audit-table")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Refresh log" }));
		expect(await screen.findByTestId("audit-table")).toBeTruthy();
		expect(screen.getByText("REPLAN")).toBeTruthy();
	});

	it("shows empty state", async () => {
		render(<AuditPanel fetchImpl={reply([])} />);
		fireEvent.click(screen.getByRole("button", { name: "Refresh log" }));
		expect(await screen.findByText("No audit entries yet.")).toBeTruthy();
	});

	it("shows broken chain with entry number", async () => {
		render(<AuditPanel fetchImpl={reply({ ok: false, first_broken: 4 })} />);
		fireEvent.click(screen.getByRole("button", { name: "Verify chain" }));
		const chain = await screen.findByTestId("chain");
		expect(chain.textContent).toContain("CHAIN BROKEN");
		expect(chain.textContent).toContain("#4");
	});

	it("shows error on HTTP failure", async () => {
		render(<AuditPanel fetchImpl={reply({}, 500)} />);
		fireEvent.click(screen.getByRole("button", { name: "Refresh log" }));
		expect((await screen.findByRole("alert")).textContent).toContain(
			"HTTP 500",
		);
	});
});
