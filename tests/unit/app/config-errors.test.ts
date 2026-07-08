// tests/unit/app/config-errors.test.ts
//
// Unit tests for the ajv error formatter (GH-15 F-7 / Phase 4.6 / RSK-1
// closure). Asserts the formatter output for each ajv `keyword` directly:
//   - required → field path + missing property + suggested fix
//   - type     → expected vs actual + suggested fix
//   - enum     → allowed values + actual; commit-by-commit gets the deferred note
//   - additionalProperties → unknown property named + suggested fix
//   - aggregation → allErrors lines combined
//
// No mock: constructs real ajv `ErrorObject` shapes and exercises the formatter.

import type { ErrorObject } from "ajv";
import { describe, expect, test } from "bun:test";
import { formatConfigErrors, mapAjvErrors } from "#app/config-errors";

function err(
	keyword: string,
	instancePath: string,
	params: Record<string, unknown>,
	data: unknown,
	message?: string,
): ErrorObject {
	return {
		keyword,
		instancePath,
		schemaPath: `#/properties/${instancePath.split("/").filter(Boolean).join("/")}`,
		params,
		message,
		data,
	} as ErrorObject;
}

describe("mapAjvErrors", () => {
	test("maps each ErrorObject to the serializable ConfigAjvError shape", () => {
		const input: ErrorObject[] = [
			err("enum", "/sync/granularity", { allowedValues: ["squash"] }, "batch"),
		];
		const mapped = mapAjvErrors(input);
		expect(mapped).toHaveLength(1);
		expect(mapped[0]).toBeDefined();
		const first = mapped[0];
		if (!first) return;
		expect(first.keyword).toBe("enum");
		expect(first.instancePath).toBe("/sync/granularity");
		expect(first.params).toEqual({ allowedValues: ["squash"] });
		expect(() => JSON.stringify(first)).not.toThrow();
	});
});

describe("formatConfigErrors — per keyword (NFR-2)", () => {
	test("required: names the missing field + suggested fix", () => {
		const msg = formatConfigErrors([
			err("required", "", { missingProperty: "root" }, undefined),
		]);
		expect(msg).toMatch(/\(root\)/);
		expect(msg).toMatch(/missing required field 'root'/);
		expect(msg).toMatch(/suggested fix/i);
	});

	test("type: expected vs actual + suggested fix", () => {
		const msg = formatConfigErrors([
			err("type", "/select", { type: "array" }, "docs/**/*.md"),
		]);
		expect(msg).toMatch(/select/);
		expect(msg).toMatch(/expected array/i);
		expect(msg).toMatch(/got string/i);
		expect(msg).toMatch(/suggested fix/i);
	});

	test("enum: allowed values + actual value", () => {
		const msg = formatConfigErrors([
			err("enum", "/sync/granularity", { allowedValues: ["squash"] }, "batch"),
		]);
		expect(msg).toMatch(/sync\.granularity/);
		expect(msg).toMatch(/must be one of \["squash"\]/);
		expect(msg).toMatch(/got string "batch"/);
	});

	test("enum + commit-by-commit value: appends the deferred note (DEC-2 / NFR-5)", () => {
		const msg = formatConfigErrors([
			err(
				"enum",
				"/sync/granularity",
				{ allowedValues: ["squash"] },
				"commit-by-commit",
			),
		]);
		expect(msg).toMatch(/commit-by-commit/i);
		expect(msg).toMatch(/deferred/i);
		expect(msg).toMatch(/ADR-0010/);
		expect(msg).toMatch(/squash/);
	});

	test("additionalProperties: names the unknown property", () => {
		const msg = formatConfigErrors([
			err(
				"additionalProperties",
				"",
				{ additionalProperty: "bogus" },
				undefined,
			),
		]);
		expect(msg).toMatch(/unknown property 'bogus'/);
		expect(msg).toMatch(/suggested fix/i);
	});

	test("const: names the required const value", () => {
		const msg = formatConfigErrors([
			err("const", "/version", { allowedValue: 1 }, 2),
		]);
		expect(msg).toMatch(/version/);
		expect(msg).toMatch(/1/);
	});

	test("generic keywords fall back to a readable message", () => {
		const msg = formatConfigErrors([
			err(
				"minLength",
				"/root",
				{},
				"",
				"must NOT have fewer than 1 characters",
			),
		]);
		expect(msg).toMatch(/root/);
		expect(msg).toMatch(/must not be empty/i);
	});

	test("empty errors list produces a sane fallback", () => {
		expect(formatConfigErrors([])).toMatch(/invalid marksync\.yml/i);
	});
});

describe("formatConfigErrors — aggregation", () => {
	test("multiple errors are listed one per line with a count header", () => {
		const msg = formatConfigErrors([
			err("required", "", { missingProperty: "root" }, undefined),
			err("type", "/select", { type: "array" }, "x"),
			err("enum", "/sync/granularity", { allowedValues: ["squash"] }, "batch"),
		]);
		expect(msg).toMatch(/3 validation errors in marksync\.yml/);
		// one bullet line per error
		const lines = msg.split("\n").filter((l) => l.startsWith("  - "));
		expect(lines).toHaveLength(3);
		// singular noun for a single error
		expect(
			formatConfigErrors([
				err("required", "", { missingProperty: "root" }, undefined),
			]),
		).toMatch(/1 validation error in marksync\.yml/);
	});
});
