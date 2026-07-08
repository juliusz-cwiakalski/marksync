// tests/golden/cli-output.snapshot.test.ts
//
// Contract snapshot — pins the JSON wire shape of `CommandResult<T>` so any
// schema drift fails the build (GH-16 D-10 / F-10 / AC-2 / AC-8 / ADR-0011 C-4 /
// TC-CONTRACT-001 + TC-CONTRACT-002). This is the C-4 schema-stability artifact:
// `schema_version`, snake_case keys, stable (alphabetical) key order, and the
// DEC-5 `error` shape are all byte-pinned here.
//
// ## Two pinning layers (both reviewable in PR diffs)
//
// 1. **Committed fixture files** under `./fixtures/` — the exact byte content
//    `renderJson` must emit for a representative success and error result. The
//    test asserts `renderJson(result) === fixture` (byte-exact). A wire change
//    that alters a single byte breaks this.
// 2. **Bun `toMatchSnapshot`** — a second regression layer that records the
//    rendered string in `__snapshots__/`. Updating it is a deliberate
//    `--update-snapshots` action a reviewer signs off on.
//
// `runId` + `timing` are FIXED (not generated) so the snapshot is deterministic
// across runs and machines (testing-strategy §"Snapshot brittleness").
//
// Tier rule: this is a test module (under tests/, excluded from tsc + dep-cruiser).
// It imports the REAL production renderer (`renderJson`) — no mock.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { err, ok } from "../../src/cli/output/command-result.ts";
import { renderJson } from "../../src/cli/output/json.ts";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "fixtures");

/** Fixed run id so the snapshot is stable across runs/machines (no RNG). */
const FIXED_RUN_ID = "0192a3b4-c5d6-7e8f-90ab-cdef01234567";

/**
 * A representative SUCCESS `CommandResult`: data payload (camelCase keys →
 * proving recursive snake_case), timing block, and a non-fatal warning. This is
 * the TC-CONTRACT-001 fixture.
 */
const successResult = ok(
	{ pageId: "12345", title: "Hello World", wordCount: 42 },
	{
		runId: FIXED_RUN_ID,
		timing: { startedAt: "2026-07-08T12:00:00.000Z", durationMs: 137 },
		warnings: [
			{ code: "DEPRECATED_FIELD", message: "field 'x' is deprecated" },
		],
	},
);

/**
 * A representative ERROR `CommandResult`: the DEC-5 `error:{code,message,
 * retryable}` shape, with the AC-6 load-bearing `CONFLICT` code → exit 30. This
 * is the TC-CONTRACT-002 fixture.
 */
const errorResult = err("CONFLICT", "remote version is ahead of local", true, {
	runId: FIXED_RUN_ID,
});

function readFixture(name: string): string {
	return readFileSync(join(fixturesDir, name), "utf8").trimEnd();
}

describe("TC-CONTRACT-001 — success CommandResult JSON wire shape (C-4)", () => {
	const rendered = renderJson(successResult);
	const parsed = JSON.parse(rendered) as Record<string, unknown>;

	test("byte-exact match against the pinned fixture", () => {
		expect(rendered).toBe(readFixture("command-result.success.json"));
	});

	test("toMatchSnapshot (regression layer)", () => {
		expect(rendered).toMatchSnapshot("success-wire-json");
	});

	test("snake_case top-level keys (DEC-2)", () => {
		expect(Object.keys(parsed)).toEqual([
			"data",
			"exit_code",
			"run_id",
			"schema_version",
			"timing",
			"warnings",
		]);
		// camelCase forms MUST NOT appear on the wire.
		expect(parsed).not.toHaveProperty("schemaVersion");
		expect(parsed).not.toHaveProperty("runId");
		expect(parsed).not.toHaveProperty("exitCode");
	});

	test("recursive snake_case in data + timing (DEC-2 global)", () => {
		const data = parsed.data as Record<string, unknown>;
		expect(Object.keys(data)).toEqual(["page_id", "title", "word_count"]);
		const timing = parsed.timing as Record<string, unknown>;
		expect(Object.keys(timing)).toEqual(["duration_ms", "started_at"]);
	});

	test("schema_version === 1 (ADR-0011 C-4)", () => {
		expect(parsed.schema_version).toBe(1);
	});

	test("run_id present (NFR-OBS-2 correlatable)", () => {
		expect(parsed.run_id).toBe(FIXED_RUN_ID);
	});

	test("exit_code === 0 for success", () => {
		expect(parsed.exit_code).toBe(0);
	});

	test("warnings array of {code,message}", () => {
		const warnings = parsed.warnings as Array<Record<string, unknown>>;
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			code: "DEPRECATED_FIELD",
			message: "field 'x' is deprecated",
		});
	});

	test("stable (alphabetical) key order at every object level (RSK-4)", () => {
		// Recursively assert each object's keys are sorted.
		function assertSorted(value: unknown): void {
			if (Array.isArray(value)) {
				for (const el of value) {
					assertSorted(el);
				}
				return;
			}
			if (value !== null && typeof value === "object") {
				const keys = Object.keys(value as Record<string, unknown>);
				expect(keys).toEqual([...keys].sort());
				for (const v of Object.values(value as Record<string, unknown>)) {
					assertSorted(v);
				}
			}
		}
		assertSorted(parsed);
	});
});

describe("TC-CONTRACT-002 — error CommandResult JSON wire shape (DEC-5 / AC-6)", () => {
	const rendered = renderJson(errorResult);
	const parsed = JSON.parse(rendered) as Record<string, unknown>;

	test("byte-exact match against the pinned fixture", () => {
		expect(rendered).toBe(readFixture("command-result.error.json"));
	});

	test("toMatchSnapshot (regression layer)", () => {
		expect(rendered).toMatchSnapshot("error-wire-json");
	});

	test("error object shape {code,message,retryable} (DEC-5)", () => {
		const error = parsed.error as Record<string, unknown>;
		expect(Object.keys(error).sort()).toEqual(["code", "message", "retryable"]);
		expect(error.code).toBe("CONFLICT");
		expect(typeof error.message).toBe("string");
		expect(error.retryable).toBe(true);
	});

	test("error variant carries no `data` field (DM-1 — exactly one payload)", () => {
		expect(parsed).not.toHaveProperty("data");
		expect(parsed).toHaveProperty("error");
	});

	test("schema_version === 1 on the error variant too", () => {
		expect(parsed.schema_version).toBe(1);
	});

	test("CONFLICT → exit_code 30 (AC-6 load-bearing mapping)", () => {
		expect(parsed.exit_code).toBe(30);
	});

	test("snake_case top-level keys + stable order", () => {
		expect(Object.keys(parsed)).toEqual([
			"error",
			"exit_code",
			"run_id",
			"schema_version",
		]);
	});
});

describe("contract determinism — renderJson is stable across calls (RSK-4)", () => {
	test("rendering the same result twice is byte-identical", () => {
		expect(renderJson(successResult)).toBe(renderJson(successResult));
		expect(renderJson(errorResult)).toBe(renderJson(errorResult));
	});

	test("the fixture is the single byte-exact source of truth (no drift)", () => {
		// Re-render and re-compare — guards against any hidden non-determinism
		// (clocks, RNG, key enumeration order) sneaking into the renderer.
		expect(renderJson(successResult)).toBe(
			readFixture("command-result.success.json"),
		);
		expect(renderJson(errorResult)).toBe(
			readFixture("command-result.error.json"),
		);
	});
});
