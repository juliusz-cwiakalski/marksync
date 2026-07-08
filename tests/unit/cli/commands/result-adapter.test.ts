// tests/unit/cli/commands/result-adapter.test.ts
//
// Unit tests for `resultErrorFromAppResult<T>` (GH-16 Phase 6 — Phase-5
// deferral). The presentation-tier adapter wraps a domain
// `Result<T, MarkSyncError>` into a `CommandResult<T>`:
//   ok → ok(value) (exit 0); err → err(code, message, retryable) via the
//   app-tier mapper + codeToExitCode for the exit code (DEC-1/DEC-2).
//
// Tier note: this TEST file may import domain types (tests are not tier-
// constrained); the src module under test (`#cli/commands/result-adapter`)
// imports only `#app/cli-error-map` + `#cli/output` — it never names
// `MarkSyncError` (DEC-1). `rg '@cliffy' src/app src/domain src/infra` stays
// empty because Cliffy is confined to `src/cli/`.

import { describe, expect, test } from "bun:test";
import { resultErrorFromAppResult } from "#cli/commands/result-adapter";
import { codeToExitCode } from "#cli/output";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

describe("resultErrorFromAppResult — ok path", () => {
	test("wraps the value into a success CommandResult (exit 0)", () => {
		const result = resultErrorFromAppResult(Result.ok({ pageId: "123" }));
		expect(result.exitCode).toBe(0);
		expect(result.data).toEqual({ pageId: "123" });
		expect(result.error).toBeUndefined();
		expect(result.schemaVersion).toBe(1);
		expect(typeof result.runId).toBe("string");
	});

	test("preserves void success (init happy path shape)", () => {
		const result = resultErrorFromAppResult(Result.ok(undefined));
		expect(result.exitCode).toBe(0);
		expect(result.data).toBeUndefined();
		expect(result.error).toBeUndefined();
	});
});

describe("resultErrorFromAppResult — err path (DEC-2 table via the mapper)", () => {
	const cases: ReadonlyArray<{
		name: string;
		err: MarkSyncError;
		code: string;
		retryable: boolean;
	}> = [
		{
			name: "Conflict",
			err: {
				kind: "Conflict",
				pageId: "p1",
				baseVersion: 1,
				remoteVersion: 3,
			},
			code: "CONFLICT",
			retryable: true,
		},
		{
			name: "InvalidConfig",
			err: {
				kind: "InvalidConfig",
				path: "/secret/marksync.yml",
				ajvErrors: [
					{
						instancePath: "/version",
						schemaPath: "#/properties/version",
						keyword: "const",
						message: "must be 1",
						params: {},
					},
				],
				humanMessage: "Bearer gho_LEAKED_DETAILS",
			},
			code: "INVALID_CONFIG",
			retryable: false,
		},
		{
			name: "RemoteMissing",
			err: { kind: "RemoteMissing", pageId: "p2" },
			code: "REMOTE_MISSING",
			retryable: true,
		},
	];

	for (const { name, err, code, retryable } of cases) {
		test(`${name} → ${code} (exit ${codeToExitCode(code)})`, () => {
			const result = resultErrorFromAppResult(Result.err(err));
			expect(result.error?.code).toBe(code);
			expect(result.error?.retryable).toBe(retryable);
			expect(result.exitCode).toBe(codeToExitCode(code));
			expect(result.data).toBeUndefined();
		});
	}

	test("Conflict → CONFLICT → exit 30 (AC-6 load-bearing chain)", () => {
		const result = resultErrorFromAppResult(
			Result.err<MarkSyncError>({
				kind: "Conflict",
				pageId: "p",
				baseVersion: 1,
				remoteVersion: 2,
			}),
		);
		expect(result.error?.code).toBe("CONFLICT");
		expect(result.exitCode).toBe(30);
	});

	test("InvalidConfig → INVALID_CONFIG → exit 10 (TS-11 / DEC-2)", () => {
		const result = resultErrorFromAppResult(
			Result.err<MarkSyncError>({
				kind: "InvalidConfig",
				path: "/x/marksync.yml",
				ajvErrors: [],
				humanMessage: "leaked",
			}),
		);
		expect(result.error?.code).toBe("INVALID_CONFIG");
		expect(result.exitCode).toBe(10);
	});
});

describe("resultErrorFromAppResult — DEC-5 redaction (message is structural)", () => {
	test("the error message never echoes the raw humanMessage (token-bearing)", () => {
		const result = resultErrorFromAppResult(
			Result.err<MarkSyncError>({
				kind: "InvalidConfig",
				path: "/secret/path/marksync.yml",
				ajvErrors: [],
				humanMessage: "Bearer gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
			}),
		);
		expect(result.error?.message).not.toContain("gho_");
		expect(result.error?.message).not.toContain("/secret/path");
		expect(result.error?.message).not.toContain("Bearer");
		// The message IS present and structural.
		expect(typeof result.error?.message).toBe("string");
		expect(result.error?.message.length).toBeGreaterThan(0);
	});
});
