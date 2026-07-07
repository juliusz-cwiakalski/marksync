// tests/unit/domain/config/schema.test.ts
//
// Unit tests for the marksync.yml v1 JSON Schema (GH-15 F-1 / RSK-3 mitigation
// part 1). Compiles the schema with the REAL ajv validator (no mock — over-
// mocking guardrail) and asserts:
//   (a) a representative valid fixture passes;
//   (b) each documented invalid class fails — missing required field, wrong
//       type, unknown granularity (incl. the deferred `commit-by-commit`), and
//       a bad target shape; additionalProperties is enforced.
//
// Schema validity is exercised here INDEPENDENTLY of the loader (the loader
// test lives in tests/unit/app/config.test.ts — Phase 4).

import Ajv from "ajv";
import { describe, expect, test } from "bun:test";
import schema from "../../../../src/domain/config/schema.json" with {
	type: "json",
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const validFull = {
	version: 1,
	root: "docs/",
	select: ["docs/**/*.md"],
	exclude: ["docs/draft/**"],
	hierarchy: "mirror",
	targets: {
		default: {
			type: "confluence",
			spaceKey: "ENG",
			parentPageId: "123456",
		},
	},
	sync: {
		allowBranches: ["main"],
		granularity: "squash",
		stalePlanMinutes: 15,
	},
	render: {
		mermaid: {
			policy: "render",
			securityLevel: "strict",
			htmlLabels: false,
			deterministicIds: true,
		},
	},
	output: { format: "storage", color: "auto" },
	provenance: { visiblePanel: true },
};

const validMinimal = {
	version: 1,
	root: "docs/",
	targets: {
		default: { type: "confluence", spaceKey: "ENG", parentPageId: "123456" },
	},
};

describe("marksync.yml v1 schema — valid fixtures", () => {
	test("full config (every blueprint §4 field) is valid", () => {
		expect(validate(validFull)).toBe(true);
	});

	test("minimal config (version + root + targets) is valid", () => {
		expect(validate(validMinimal)).toBe(true);
	});

	test("granularity squash is accepted", () => {
		expect(validate({ ...validMinimal, sync: { granularity: "squash" } })).toBe(
			true,
		);
	});
});

describe("marksync.yml v1 schema — invalid fixtures", () => {
	test("missing required field (root) is rejected", () => {
		const { root, ...noRoot } = validFull;
		void root;
		expect(validate(noRoot)).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "required")).toBe(true);
	});

	test("missing required field (targets) is rejected", () => {
		const { targets, ...noTargets } = validFull;
		void targets;
		expect(validate(noTargets)).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "required")).toBe(true);
	});

	test("wrong type for select (string instead of array) is rejected", () => {
		expect(validate({ ...validMinimal, select: "docs/**/*.md" })).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "type")).toBe(true);
	});

	test("wrong type for stalePlanMinutes (string instead of integer) is rejected", () => {
		validate({ ...validMinimal, sync: { stalePlanMinutes: "15" } });
		expect(validate.errors?.some((e) => e.keyword === "type")).toBe(true);
	});

	test("targets as array (instead of object map) is rejected", () => {
		expect(validate({ version: 1, root: "docs/", targets: [] })).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "type")).toBe(true);
	});

	test("unknown granularity is rejected (NFR-5)", () => {
		expect(
			validate({
				...validMinimal,
				sync: { granularity: "batch" },
			}),
		).toBe(false);
		const enumError = validate.errors?.find((e) => e.keyword === "enum");
		expect(enumError).toBeDefined();
		expect(enumError?.instancePath).toBe("/sync/granularity");
	});

	test("granularity commit-by-commit is rejected (DEC-2 / ADR-0010 C-5)", () => {
		expect(
			validate({
				...validMinimal,
				sync: { granularity: "commit-by-commit" },
			}),
		).toBe(false);
		const enumError = validate.errors?.find((e) => e.keyword === "enum");
		expect(enumError).toBeDefined();
		expect(enumError?.instancePath).toBe("/sync/granularity");
	});

	test("unknown hierarchy mode is rejected", () => {
		expect(validate({ ...validMinimal, hierarchy: "tree" })).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "enum")).toBe(true);
	});

	test("target missing spaceKey is rejected", () => {
		expect(
			validate({
				version: 1,
				root: "docs/",
				targets: { default: { type: "confluence", parentPageId: "1" } },
			}),
		).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "required")).toBe(true);
	});

	test("target with unsupported type is rejected", () => {
		expect(
			validate({
				version: 1,
				root: "docs/",
				targets: {
					default: {
						type: "notion",
						spaceKey: "ENG",
						parentPageId: "1",
					},
				},
			}),
		).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "enum")).toBe(true);
	});

	test("additionalProperties at root is rejected", () => {
		expect(validate({ ...validMinimal, bogus: true })).toBe(false);
		expect(
			validate.errors?.some((e) => e.keyword === "additionalProperties"),
		).toBe(true);
	});

	test("version other than 1 is rejected", () => {
		expect(validate({ ...validMinimal, version: 2 })).toBe(false);
		expect(validate.errors?.some((e) => e.keyword === "const")).toBe(true);
	});
});

describe("marksync.yml v1 schema — allErrors aggregation", () => {
	test("multiple simultaneous violations are all collected", () => {
		// missing root AND wrong-typed select AND unknown granularity.
		expect(
			validate({
				version: 1,
				select: "not-an-array",
				targets: {
					default: { type: "confluence", spaceKey: "x", parentPageId: "1" },
				},
				sync: { granularity: "batch" },
			}),
		).toBe(false);
		const keywords = validate.errors?.map((e) => e.keyword) ?? [];
		expect(keywords).toContain("required");
		expect(keywords).toContain("type");
		expect(keywords).toContain("enum");
	});
});
