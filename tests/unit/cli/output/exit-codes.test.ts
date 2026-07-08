// tests/unit/cli/output/exit-codes.test.ts
//
// Unit tests for the exit-code constants + the stable `error.code` → exit-code
// map (GH-16 D-5 / DEC-1 / DEC-2 / TS-9 / AC-6). The single AC-load-bearing
// assertion is `codeToExitCode("CONFLICT") === 30` (AC-6 / NFR-OBS-1); the rest
// pin every DEC-2 row so the mapping is stable, plus the unknown-code fallback.
//
// This test asserts the PRESENTATION-TIER string → number map only — it does
// NOT name `MarkSyncError` (DEC-1). The `kind → code` translation is tested in
// `tests/unit/app/cli-error-map.test.ts` (Phase 5).

import { describe, expect, test } from "bun:test";
import {
	CODE_TO_EXIT,
	codeToExitCode,
	EXIT_AUTH,
	EXIT_CONFIG,
	EXIT_CONFLICT,
	EXIT_INTERNAL,
	EXIT_INVARIANT,
	EXIT_OK,
	EXIT_REMOTE_MISSING,
	EXIT_RENDER_UNAVAILABLE,
	EXIT_USAGE,
} from "../../../../src/cli/output/exit-codes.ts";

// The full DEC-2 table: stable `error.code` string → expected numeric exit.
// Keep this in lock-step with `CODE_TO_EXIT` in src/cli/output/exit-codes.ts.
const EXPECTED: Record<string, number> = {
	CONFLICT: 30,
	REMOTE_MISSING: 40,
	DUPLICATE_UUID: 50,
	UNSUPPORTED_CONSTRUCT: 99,
	FORBIDDEN: 20,
	LOCK_DIRTY: 30,
	CONCURRENT_WRITE: 30,
	RENDER_UNAVAILABLE: 70,
	STALE_PLAN: 30,
	FORBIDDEN_BRANCH: 2,
	TOO_LARGE: 99,
	UNRESOLVED_LINK: 99,
	INVALID_CONFIG: 10,
	USAGE: 2,
	INTERNAL: 99,
};

describe("exit-code constants (9 classes — spec F-5 / NFR-OBS-1)", () => {
	test("each constant has its documented numeric value", () => {
		expect(EXIT_OK).toBe(0);
		expect(EXIT_USAGE).toBe(2);
		expect(EXIT_CONFIG).toBe(10);
		expect(EXIT_AUTH).toBe(20);
		expect(EXIT_CONFLICT).toBe(30);
		expect(EXIT_REMOTE_MISSING).toBe(40);
		expect(EXIT_INVARIANT).toBe(50);
		expect(EXIT_RENDER_UNAVAILABLE).toBe(70);
		expect(EXIT_INTERNAL).toBe(99);
	});
});

describe("CODE_TO_EXIT — every DEC-2 row (stable code → exit)", () => {
	test("the map matches the DEC-2 commitment exactly (TS-9)", () => {
		expect(CODE_TO_EXIT).toEqual(EXPECTED);
	});

	test("no exit code falls outside the documented 9-class set", () => {
		const allowed = new Set<number>([
			EXIT_OK,
			EXIT_USAGE,
			EXIT_CONFIG,
			EXIT_AUTH,
			EXIT_CONFLICT,
			EXIT_REMOTE_MISSING,
			EXIT_INVARIANT,
			EXIT_RENDER_UNAVAILABLE,
			EXIT_INTERNAL,
		]);
		for (const code of Object.keys(CODE_TO_EXIT)) {
			expect(allowed.has(CODE_TO_EXIT[code] ?? -1)).toBe(true);
		}
	});

	test("includes the drift-class codes mapping to exit 30 (DEC-2)", () => {
		// Spec F-5 lists these under the exit-50 "invariant" row as "typical";
		// DEC-2 resolves them to exit 30 (conflict/drift, retryable) — this
		// switch is authoritative (see exit-codes.ts leading comment).
		expect(CODE_TO_EXIT.LOCK_DIRTY).toBe(EXIT_CONFLICT);
		expect(CODE_TO_EXIT.CONCURRENT_WRITE).toBe(EXIT_CONFLICT);
		expect(CODE_TO_EXIT.STALE_PLAN).toBe(EXIT_CONFLICT);
	});

	for (const [code, expected] of Object.entries(EXPECTED)) {
		test(`CODE_TO_EXIT["${code}"] === ${expected}`, () => {
			expect(CODE_TO_EXIT[code]).toBe(expected);
		});
	}
});

describe("codeToExitCode(code) (AC-6 / NFR-OBS-1)", () => {
	test('"CONFLICT" → 30 (the AC-6 load-bearing mapping)', () => {
		expect(codeToExitCode("CONFLICT")).toBe(30);
	});

	test("resolves every DEC-2 code to its documented exit", () => {
		for (const [code, expected] of Object.entries(EXPECTED)) {
			expect(codeToExitCode(code)).toBe(expected);
		}
	});

	test("unknown codes fall back to EXIT_INTERNAL (99)", () => {
		expect(codeToExitCode("DEFINITELY_NOT_A_REAL_CODE")).toBe(EXIT_INTERNAL);
		expect(codeToExitCode("")).toBe(EXIT_INTERNAL);
		// A future code added before the map is updated still exits cleanly.
		expect(codeToExitCode("SOME_FUTURE_ERROR")).toBe(EXIT_INTERNAL);
	});
});
