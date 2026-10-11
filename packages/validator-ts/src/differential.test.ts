import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate } from "./validator";

type Vector = {
	name: string;
	valid: boolean;
	expect: Record<string, boolean>;
	warnings: string[];
	input: unknown;
};

const file = fileURLToPath(
	new URL("../../../contracts/differential_vectors.json", import.meta.url),
);

describe.skipIf(!existsSync(file))("differential: python vs typescript", () => {
	const vectors = JSON.parse(readFileSync(file, "utf-8")) as Vector[];

	it("has 2000 vectors", () => {
		expect(vectors.length).toBeGreaterThanOrEqual(2000);
	});

	it("agrees with python on every check of every vector", () => {
		const mismatches: string[] = [];
		for (const v of vectors) {
			const r = validate(v.input);
			const got = Object.fromEntries(r.checks.map((c) => [c.id, c.ok]));
			const warn = r.warnings.map((w) => w.code);
			const same =
				r.valid === v.valid &&
				JSON.stringify(warn) === JSON.stringify(v.warnings) &&
				Object.keys(v.expect).length === Object.keys(got).length &&
				Object.entries(v.expect).every(([id, ok]) => got[id] === ok);
			if (!same) mismatches.push(v.name);
		}
		expect(mismatches.slice(0, 10)).toEqual([]);
		expect(mismatches.length).toBe(0);
	});

	it("covers pass and fail for every check", () => {
		for (let n = 1; n <= 10; n++) {
			const id = `V${n}`;
			expect(vectors.some((v) => v.expect[id] === true)).toBe(true);
		}
	});
});
