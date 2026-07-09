// tests/unit/cli/commands/init.test.ts
//
// Unit tests for the REWIRED `initCommand` (GH-16 Phase 6 / Task 6.3 /
// TS-11 / DEC-2). The handler was rewired from the GH-15 `{exitCode, message}`
// placeholder to the `CommandResult<void>` contract via
// `resultErrorFromAppResult`:
//   - success → ok(undefined) (exit 0);
//   - ConfigError (overwrite-refusal / write-failure) → mapped code
//     INVALID_CONFIG + exit 10, with a redacted structural message (DEC-5).
//
// Uses real temp directories + the real `writeStarterConfig` — no mock — so the
// end-to-end presentation → application → domain Result flow is exercised.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initCommand } from "#cli/commands/init";
import type { CommandResult } from "#cli/output";

/** Create a fresh temp directory per test. */
function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "marksync-init-test-"));
}

describe("initCommand (rewired) — CommandResult contract", () => {
	let dir: string;

	beforeEach(() => {
		dir = tempDir();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns a CommandResult (not the old {exitCode, message} shape)", async () => {
		const result = await initCommand({ cwd: dir });
		expect(result).toBeDefined();
		expect(result.schemaVersion).toBe(1);
		expect(typeof result.runId).toBe("string");
		// The old shape had `exitCode` + `message` at the top level; the new
		// shape has `exitCode` + optional `error`/`data` (CommandResult<T>).
		expect(result).not.toHaveProperty("message");
	});

	test("success → exitCode 0, no error, data undefined (void)", async () => {
		const result: CommandResult<void> = await initCommand({ cwd: dir });
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();
		expect(result.data).toBeUndefined();
	});

	test("overwrite-refusal (OQ-TP-1) → error.code INVALID_CONFIG, exit 10", async () => {
		// Pre-create marksync.yml so writeStarterConfig refuses (OQ-TP-1).
		writeFileSync(join(dir, "marksync.yml"), "existing: true\n", "utf-8");

		const result = await initCommand({ cwd: dir });
		expect(result.exitCode).toBe(10);
		expect(result.error?.code).toBe("INVALID_CONFIG");
		expect(result.error?.retryable).toBe(false);
		expect(result.data).toBeUndefined();
	});

	test("DEC-5: the error message is redacted (no file PATH, no raw humanMessage)", async () => {
		writeFileSync(join(dir, "marksync.yml"), "existing: true\n", "utf-8");

		const result = await initCommand({ cwd: dir });
		// DEC-5: the message must NOT echo the config file's DIRECTORY PATH or
		// the raw `humanMessage` (which could carry secrets). The generic noun
		// "marksync.yml" (a constant config-file name in the structural message)
		// is acceptable — what DEC-5 forbids is the actual path + echoed data.
		expect(result.error?.message).not.toContain(dir);
		expect(result.error?.message).not.toContain(tmpdir());
		expect(typeof result.error?.message).toBe("string");
		expect(result.error?.message.length).toBeGreaterThan(0);
	});

	test("defaults cwd to process.cwd() when not provided", async () => {
		// Override process.cwd() to a temp dir so the test does NOT write a
		// real marksync.yml into the repo root (side-effect pollution).
		const realCwd = process.cwd;
		try {
			process.cwd = () => dir;
			const result = await initCommand();
			expect(result.schemaVersion).toBe(1);
			expect(typeof result.exitCode).toBe("number");
		} finally {
			process.cwd = realCwd;
		}
	});
});
