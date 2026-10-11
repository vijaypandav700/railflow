import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate } from "./validator";

type Vector = {
	name: string;
	valid: boolean;
	expect: Record<string, boolean>;
	warnings?: string[];
	input: unknown;
};

const file = fileURLToPath(
	new URL("../../../contracts/golden_vectors.json", import.meta.url),
);
const vectors = JSON.parse(readFileSync(file, "utf-8")) as Vector[];
const CHECK_IDS = Array.from({ length: 10 }, (_, i) => `V${i + 1}`);

function find(name: string): Vector {
	const found = vectors.find((v) => v.name === name);
	if (!found) throw new Error(`vector ${name} not found`);
	return found;
}

describe("golden vectors", () => {
	it("loaded", () => {
		expect(vectors.length).toBeGreaterThanOrEqual(31);
	});

	it.each(vectors)("$name", (vector) => {
		const result = validate(vector.input);
		const got = Object.fromEntries(result.checks.map((c) => [c.id, c.ok]));
		expect(got).toEqual(vector.expect);
		expect(result.valid).toBe(vector.valid);
		expect(result.warnings.map((w) => w.code)).toEqual(vector.warnings ?? []);
	});

	it.each(CHECK_IDS)("%s has a passing and a failing vector", (id) => {
		expect(vectors.some((v) => v.expect[id] === true)).toBe(true);
		expect(vectors.some((v) => v.expect[id] === false)).toBe(true);
	});
});

describe("behaviour", () => {
	it("malformed input is invalid", () => {
		const result = validate({});
		expect(result.valid).toBe(false);
		expect(result.checks[0]?.id).toBe("INPUT");
		expect(result.warnings).toEqual([]);
	});

	it("null input is invalid", () => {
		expect(validate(null).valid).toBe(false);
	});

	it("overlap error names trains, platform, minutes", () => {
		const result = validate(find("v4_overlap").input);
		const error = result.checks.find((c) => c.id === "V4")?.errors[0];
		expect(error?.trains).toEqual(["T1", "T2"]);
		expect(error?.platform).toBe("P1");
		expect(error?.minutes).toBe(5);
	});

	it("gap shortfall amount", () => {
		const result = validate(find("v5_gap_short").input);
		expect(result.checks.find((c) => c.id === "V5")?.errors[0]?.shortfall).toBe(
			2,
		);
	});

	it("deferred warning names closure and train", () => {
		const warning = validate(find("valid_closure_deferred").input).warnings[0];
		expect(warning?.closure).toBe("C1");
		expect(warning?.trains).toEqual(["T1"]);
	});
});
