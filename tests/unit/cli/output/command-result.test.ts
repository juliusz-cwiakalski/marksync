// tests/unit/cli/output/command-result.test.ts
//
// Unit tests for the `CommandResult<T>` envelope + the `ok`/`err` factories
// (GH-16 D-1 / spec DM-1 / TS-8). Asserts the documented success/error shapes
// incl. `schemaVersion === 1`, `ok()` exit 0 + `data`, `err()` exit derived
// from `code` via `codeToExitCode`, optional `timing`/`warnings`
// (exactOptionalPropertyTypes-safe), and `runId` honoring `meta.runId` vs the
// generated default.
//
// Not a redaction test (Phase 3) — the `message` here is plain data.

import { describe, expect, test } from "bun:test";
import {
	err,
	ok,
	SCHEMA_VERSION,
	type CommandResult,
} from "../../../../src/cli/output/command-result.ts";

describe("SCHEMA_VERSION", () => {
	test("is pinned to 1 (ADR-0011 C-4 — contract stability)", () => {
		expect(SCHEMA_VERSION).toBe(1);
	});
});

describe("ok(data, meta) — success envelope", () => {
	test("produces schemaVersion=1, exitCode=0, runId, and data; no error", () => {
		const result = ok({ pageId: "123", n: 3 }, { runId: "run-1" });
		expect(result.schemaVersion).toBe(1);
		expect(result.exitCode).toBe(0);
		expect(result.runId).toBe("run-1");
		expect(result.data).toEqual({ pageId: "123", n: 3 });
		expect(result.error).toBeUndefined();
		expect(result.timing).toBeUndefined();
		expect(result.warnings).toBeUndefined();
	});

	test("runId is generated when meta.runId is absent (NFR-OBS-2)", () => {
		const result = ok("done");
		expect(typeof result.runId).toBe("string");
		expect(result.runId.length).toBeGreaterThan(0);
		// Two consecutive calls produce distinct run IDs.
		expect(ok("x").runId).not.toBe(result.runId);
	});

	test("honors meta.runId verbatim (deterministic)", () => {
		expect(ok(null, { runId: "fixed-id" }).runId).toBe("fixed-id");
	});

	test("attaches timing only when provided (exactOptionalPropertyTypes-safe)", () => {
		const timing = { startedAt: "2026-07-08T10:00:00Z", durationMs: 42 };
		const withTiming = ok("ok", { runId: "r", timing });
		expect(withTiming.timing).toEqual(timing);
		const withoutTiming = ok("ok", { runId: "r" });
		expect(withoutTiming.timing).toBeUndefined();
	});

	test("attaches warnings only when provided; warnings is Array<{code,message}>", () => {
		const warnings = [{ code: "DEPRECATED", message: "field x is deprecated" }];
		const result = ok("ok", { runId: "r", warnings });
		expect(Array.isArray(result.warnings)).toBe(true);
		expect(result.warnings).toEqual(warnings);
		expect(result.warnings?.[0]).toMatchObject({
			code: "DEPRECATED",
			message: expect.any(String),
		});
		// Omitted warnings stays absent (not `undefined` value on the object).
		expect(ok("ok", { runId: "r" }).warnings).toBeUndefined();
	});

	test("data is generic (T concretized by the caller)", () => {
		const asNumber: CommandResult<number> = ok(7, { runId: "r" });
		expect(asNumber.data).toBe(7);
		const asObject: CommandResult<{ a: string }> = ok(
			{ a: "b" },
			{
				runId: "r",
			},
		);
		expect(asObject.data?.a).toBe("b");
	});
});

describe("err(code, message, retryable, meta) — error envelope", () => {
	test("produces schemaVersion=1, error block, and no data", () => {
		const result = err("CONFLICT", "remote ahead", true, { runId: "r" });
		expect(result.schemaVersion).toBe(1);
		expect(result.runId).toBe("r");
		expect(result.data).toBeUndefined();
		expect(result.error).toEqual({
			code: "CONFLICT",
			message: "remote ahead",
			retryable: true,
		});
	});

	test("exitCode is derived from code via codeToExitCode: CONFLICT → 30 (AC-6)", () => {
		expect(err("CONFLICT", "x", true, { runId: "r" }).exitCode).toBe(30);
	});

	test("exitCode tracks the stable code for several classes", () => {
		expect(err("INVALID_CONFIG", "x", false, { runId: "r" }).exitCode).toBe(10);
		expect(err("FORBIDDEN", "x", false, { runId: "r" }).exitCode).toBe(20);
		expect(err("REMOTE_MISSING", "x", false, { runId: "r" }).exitCode).toBe(40);
		expect(err("RENDER_UNAVAILABLE", "x", false, { runId: "r" }).exitCode).toBe(
			70,
		);
		expect(err("USAGE", "x", false, { runId: "r" }).exitCode).toBe(2);
		expect(err("INTERNAL", "x", false, { runId: "r" }).exitCode).toBe(99);
	});

	test("retryable is carried through verbatim", () => {
		expect(err("CONFLICT", "x", true, { runId: "r" }).error?.retryable).toBe(
			true,
		);
		expect(
			err("INVALID_CONFIG", "x", false, { runId: "r" }).error?.retryable,
		).toBe(false);
	});

	test("runId is generated when meta.runId is absent", () => {
		const result = err("INTERNAL", "boom", false);
		expect(typeof result.runId).toBe("string");
		expect(result.runId.length).toBeGreaterThan(0);
	});

	test("err returns CommandResult<never> (no data slot — error path)", () => {
		const result: CommandResult<never> = err("CONFLICT", "x", true, {
			runId: "r",
		});
		// The error path carries error; data is not set.
		expect(result.error?.code).toBe("CONFLICT");
		expect(result.data).toBeUndefined();
	});
});

describe("envelope shape (spec DM-1)", () => {
	test("exactly one of data/error is the meaningful payload", () => {
		const success = ok("y", { runId: "r" });
		expect(success.data).not.toBeUndefined();
		expect(success.error).toBeUndefined();
		const failure = err("CONFLICT", "x", true, { runId: "r" });
		expect(failure.error).not.toBeUndefined();
		expect(failure.data).toBeUndefined();
	});

	test("required top-level fields are always present (schemaVersion, runId, exitCode)", () => {
		for (const result of [
			ok(1, { runId: "r" }),
			err("INTERNAL", "x", false, { runId: "r" }),
		]) {
			expect(typeof result.schemaVersion).toBe("number");
			expect(typeof result.runId).toBe("string");
			expect(typeof result.exitCode).toBe("number");
		}
	});
});
