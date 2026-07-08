// tests/unit/cli/output/json.test.ts
//
// Unit tests for the JSON + NDJSON renderers (GH-16 D-2 / F-2 / AC-2 / DEC-2 /
// RSK-4 / ADR-0011 C-1 + C-4 / TS-7). Asserts: valid parseable JSON; snake_case
// keys (DEC-2); stable/deterministic key order (two equal results serialize
// byte-identical regardless of insertion order — RSK-4); schema_version === 1;
// success + error variants; `renderNdjson` one-object-per-line.

import { describe, expect, test } from "bun:test";
import {
	ok,
	err,
	type CommandResult,
} from "../../../../src/cli/output/command-result.ts";
import { renderJson, renderNdjson } from "../../../../src/cli/output/json.ts";

describe("renderJson — valid parseable JSON", () => {
	test("output is a JSON-parseable string", () => {
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		const rendered = renderJson(result);
		expect(typeof rendered).toBe("string");
		expect(() => JSON.parse(rendered)).not.toThrow();
	});
});

describe("renderJson — snake_case keys (DEC-2 / TC-JSON-003)", () => {
	test("envelope top-level keys are snake_case, not camelCase", () => {
		const result = ok({ ok: true }, { runId: "run-1" });
		const parsed = JSON.parse(renderJson(result)) as Record<string, unknown>;
		expect(Object.keys(parsed)).toContain("schema_version");
		expect(Object.keys(parsed)).toContain("run_id");
		expect(Object.keys(parsed)).toContain("exit_code");
		// camelCase forms MUST NOT appear.
		expect(Object.keys(parsed)).not.toContain("schemaVersion");
		expect(Object.keys(parsed)).not.toContain("runId");
		expect(Object.keys(parsed)).not.toContain("exitCode");
	});

	test("timing sub-object keys are snake_case on the wire", () => {
		const result = ok("ok", {
			runId: "r",
			timing: { startedAt: "2026-07-08T10:00:00Z", durationMs: 42 },
		});
		const parsed = JSON.parse(renderJson(result)) as {
			timing?: Record<string, unknown>;
		};
		expect(Object.keys(parsed.timing ?? {})).toEqual(
			expect.arrayContaining(["started_at", "duration_ms"]),
		);
		expect(parsed.timing).not.toHaveProperty("startedAt");
		expect(parsed.timing).not.toHaveProperty("durationMs");
	});

	test("error sub-object keys survive (already lowercase)", () => {
		const result = err("CONFLICT", "remote ahead", true, { runId: "r" });
		const parsed = JSON.parse(renderJson(result)) as {
			error?: Record<string, unknown>;
		};
		expect(Object.keys(parsed.error ?? {}).sort()).toEqual([
			"code",
			"message",
			"retryable",
		]);
	});

	test("data camelCase keys are recursively snake_cased (DEC-2 global)", () => {
		const result = ok(
			{ pageId: "123", publishedAt: "2026-07-08", authorName: "alice" },
			{ runId: "r" },
		);
		const parsed = JSON.parse(renderJson(result)) as {
			data?: Record<string, unknown>;
		};
		expect(Object.keys(parsed.data ?? {})).toEqual(
			expect.arrayContaining(["page_id", "published_at", "author_name"]),
		);
		expect(parsed.data).not.toHaveProperty("pageId");
	});
});

describe("renderJson — stable key order (RSK-4 / TC-JSON-002)", () => {
	test("two structurally equal results serialize byte-identically", () => {
		const a = ok({ n: 1, s: "x" }, { runId: "r" });
		const b = ok({ n: 1, s: "x" }, { runId: "r" });
		expect(renderJson(a)).toBe(renderJson(b));
	});

	test("insertion order does not change the serialized output", () => {
		const r1: CommandResult<{ a: number; b: number; c: number }> = {
			schemaVersion: 1,
			runId: "r",
			exitCode: 0,
			data: { a: 1, b: 2, c: 3 },
		};
		const r2: CommandResult<{ c: number; b: number; a: number }> = {
			exitCode: 0,
			runId: "r",
			schemaVersion: 1,
			data: { c: 3, b: 2, a: 1 },
		};
		// Different insertion order of top-level + nested keys → same bytes.
		expect(renderJson(r1)).toBe(renderJson(r2));
	});

	test("top-level keys render in stable (alphabetical) order", () => {
		const result = ok("ok", { runId: "r" });
		const keys = Object.keys(
			JSON.parse(renderJson(result)) as Record<string, unknown>,
		);
		const sorted = [...keys].sort();
		expect(keys).toEqual(sorted);
	});

	test("rendering twice in sequence is byte-identical (no RNG leakage)", () => {
		const result = ok({ pageId: "123" }, { runId: "fixed-run" });
		const first = renderJson(result);
		const second = renderJson(result);
		expect(first).toBe(second);
	});
});

describe("renderJson — schema version + envelope shape", () => {
	test("schema_version === 1 (ADR-0011 C-4)", () => {
		const parsed = JSON.parse(renderJson(ok("x", { runId: "r" }))) as {
			schema_version?: number;
		};
		expect(parsed.schema_version).toBe(1);
	});

	test("success variant: data present, error absent, exit_code 0", () => {
		const parsed = JSON.parse(
			renderJson(ok({ ok: true }, { runId: "r" })),
		) as Record<string, unknown>;
		expect(parsed.exit_code).toBe(0);
		expect(parsed).toHaveProperty("data");
		expect(parsed).not.toHaveProperty("error");
	});

	test("error variant: error present, data absent, exit_code non-zero (DEC-5)", () => {
		const parsed = JSON.parse(
			renderJson(err("CONFLICT", "remote ahead", true, { runId: "r" })),
		) as Record<string, unknown>;
		expect(parsed.exit_code).toBe(30);
		expect(parsed).toHaveProperty("error");
		expect(parsed).not.toHaveProperty("data");
		expect((parsed.error as Record<string, unknown>).code).toBe("CONFLICT");
	});

	test("warnings render as array of {code,message}", () => {
		const result = ok("ok", {
			runId: "r",
			warnings: [{ code: "DEPRECATED", message: "field x" }],
		});
		const parsed = JSON.parse(renderJson(result)) as {
			warnings?: Array<Record<string, unknown>>;
		};
		expect(Array.isArray(parsed.warnings)).toBe(true);
		expect(parsed.warnings?.[0]).toMatchObject({
			code: "DEPRECATED",
			message: "field x",
		});
	});
});

describe("renderNdjson — one JSON object per line", () => {
	test("a single result renders one line that is valid JSON", () => {
		const out = renderNdjson(ok("ok", { runId: "r" }));
		expect(out.split("\n")).toHaveLength(1);
		expect(() => JSON.parse(out)).not.toThrow();
	});

	test("an array renders one JSON object per line (N lines)", () => {
		const out = renderNdjson([
			ok({ i: 1 }, { runId: "r1" }),
			ok({ i: 2 }, { runId: "r2" }),
			ok({ i: 3 }, { runId: "r3" }),
		]);
		const lines = out.split("\n");
		expect(lines).toHaveLength(3);
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});

	test("each line is independently snake_case + schema_version 1", () => {
		const out = renderNdjson([ok({ pageId: "1" }, { runId: "r1" })]);
		const parsed = JSON.parse(out) as Record<string, unknown>;
		expect(parsed.schema_version).toBe(1);
		expect(parsed).toHaveProperty("run_id");
		expect(parsed).toHaveProperty("exit_code");
	});
});
