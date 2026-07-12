// tests/unit/cli/commands/stubs.test.ts
//
// Unit tests for the stub command handlers (GH-16 D-8 / F-8 / AC-2). Each stub
// (plan/sync/doctor/repair-state) returns a placeholder `CommandResult` with
// `error.code: "INTERNAL"` so the framework wires end-to-end: under `--json`
// every stub produces valid, parseable JSON matching the contract (AC-2). Real
// logic is out of scope (NG-1 — later stories).

import { describe, expect, test } from "bun:test";
import { doctorCommand } from "#cli/commands/doctor";
import { repairStateCommand } from "#cli/commands/repair-state";
import { codeToExitCode, renderJson } from "#cli/output";
import type { CommandResult } from "#cli/output";

/** The stub handlers under test. plan/sync are now wired (Phase 7), so only doctor/repair-state are stubs. */
const stubs: ReadonlyArray<{
	name: string;
	handler: () => CommandResult<never>;
	story: string;
}> = [
	{ name: "doctor", handler: doctorCommand, story: "MS2-E5-S2" },
	{ name: "repair-state", handler: repairStateCommand, story: "MS2-E3" },
];

describe("stub command handlers — placeholder CommandResult shape (D-8)", () => {
	for (const { name, handler, story } of stubs) {
		describe(`${name}Command`, () => {
			const result = handler();

			test("returns schemaVersion 1", () => {
				expect(result.schemaVersion).toBe(1);
			});

			test("has a runId", () => {
				expect(typeof result.runId).toBe("string");
				expect(result.runId.length).toBeGreaterThan(0);
			});

			test("error.code is INTERNAL (DEC-2)", () => {
				expect(result.error?.code).toBe("INTERNAL");
			});

			test("error.retryable is false", () => {
				expect(result.error?.retryable).toBe(false);
			});

			test(`error.message mentions "${story}"`, () => {
				expect(result.error?.message).toContain(story);
				expect(result.error?.message).toContain("not yet implemented");
			});

			test("exitCode is codeToExitCode(INTERNAL) = 99", () => {
				expect(result.exitCode).toBe(codeToExitCode("INTERNAL"));
				expect(result.exitCode).toBe(99);
			});

			test("never carries data (error path — CommandResult<never>)", () => {
				expect(result.data).toBeUndefined();
			});
		});
	}
});

describe("stub handlers — valid JSON under --json (AC-2)", () => {
	for (const { name, handler } of stubs) {
		test(`${name}: renderJson produces parseable snake_case JSON`, () => {
			const rendered = renderJson(handler());
			const parsed = JSON.parse(rendered) as Record<string, unknown>;
			// Top-level contract keys (snake_case — DEC-2/DEC-4).
			expect(parsed.schema_version).toBe(1);
			expect(typeof parsed.run_id).toBe("string");
			expect(parsed.exit_code).toBe(99);
			// Error shape (DEC-5).
			const error = parsed.error as Record<string, unknown>;
			expect(error.code).toBe("INTERNAL");
			expect(typeof error.message).toBe("string");
			expect(error.retryable).toBe(false);
		});
	}
});
