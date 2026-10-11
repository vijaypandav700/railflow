import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate } from "./validator";

type Vector = {
	name: string;
	valid: boolean;
	expect: Record<string, boolean>;
	warnings: string[];
	errors: Record<string, string[]>;
	input: unknown;
};

const file = fileURLToPath(
	new URL("../../../contracts/differential_vectors.json", import.meta.url),
);
const ready = existsSync(file);
const vectors: Vector[] = ready
	? (JSON.parse(readFileSync(file, "utf-8")) as Vector[])
	: [];

function digest(input: unknown) {
	const r = validate(input);
	return {
		valid: r.valid,
		expect: Object.fromEntries(r.checks.map((c) => [c.id, c.ok])),
		warnings: r.warnings.map((w) => w.code),
		errors: Object.fromEntries(
			r.checks.map((c) => [
				c.id,
				c.errors.map((e) => JSON.stringify([...e.trains].sort())).sort(),
			]),
		),
	};
}

describe.skipIf(!ready)("differential: python vs typescript validator", () => {
	it("has at least 2000 vectors", () => {
		expect(vectors.length).toBeGreaterThanOrEqual(2000);
	});

	it("agrees on every vector", () => {
		const bad: string[] = [];
		for (const v of vectors) {
			const got = digest(v.input);
			const want = {
				valid: v.valid,
				expect: v.expect,
				warnings: v.warnings,
				errors: v.errors,
			};
			if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(v.name);
		}
		expect(bad.slice(0, 10), `${bad.length} disagreements`).toEqual([]);
	});

	it("covers a pass and a fail for every check", () => {
		for (let n = 1; n <= 10; n++) {
			const id = `V${n}`;
			expect(
				vectors.some((v) => v.expect[id] === true),
				`${id} pass`,
			).toBe(true);
			expect(
				vectors.some((v) => v.expect[id] === false),
				`${id} fail`,
			).toBe(true);
		}
	});
});
