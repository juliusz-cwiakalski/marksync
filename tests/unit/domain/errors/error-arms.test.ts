// Unit tests for the GH-21 transport-failure error arms: `RateLimited` and
// `RemoteUnreachable` round-trip through the three-site error model (the union +
// `assertNeverMarkSyncError` + the CLI error/exit maps), and DEC-9 forbids
// interpolating `cause`/`retryAfterMs` into user-facing messages.

import { describe, expect, test } from "bun:test";
import { type MarkSyncError, assertNeverMarkSyncError } from "#domain/errors";
import { mapMarkSyncErrorToCommandError } from "#app/cli-error-map";
import { CODE_TO_EXIT, codeToExitCode } from "#cli/output/exit-codes";

describe("RateLimited arm", () => {
	const rateLimited: MarkSyncError = { kind: "RateLimited" };

	test("maps to RATE_LIMITED, retryable", () => {
		const mapped = mapMarkSyncErrorToCommandError(rateLimited);
		expect(mapped.code).toBe("RATE_LIMITED");
		expect(mapped.retryable).toBe(true);
	});

	test("message carries no secret/transport material (DEC-9)", () => {
		const withRetry: MarkSyncError = {
			kind: "RateLimited",
			retryAfterMs: 4242,
		};
		const mapped = mapMarkSyncErrorToCommandError(withRetry);
		expect(mapped.message).not.toContain("4242");
		expect(mapped.message).not.toMatch(/retryAfter/i);
	});

	test("resolves to an exit code", () => {
		expect(CODE_TO_EXIT.RATE_LIMITED).toBeDefined();
		expect(codeToExitCode("RATE_LIMITED")).toBeGreaterThan(0);
	});

	test("assertNeverMarkSyncError throws at runtime", () => {
		expect(() => assertNeverMarkSyncError(rateLimited)).toThrow();
	});
});

describe("RemoteUnreachable arm", () => {
	const remoteUnreachable: MarkSyncError = {
		kind: "RemoteUnreachable",
		cause: "fetch failed: ECONNREFUSED",
	};

	test("maps to REMOTE_UNREACHABLE, retryable", () => {
		const mapped = mapMarkSyncErrorToCommandError(remoteUnreachable);
		expect(mapped.code).toBe("REMOTE_UNREACHABLE");
		expect(mapped.retryable).toBe(true);
	});

	test("message carries no `cause` / status (DEC-9)", () => {
		const withStatus: MarkSyncError = {
			kind: "RemoteUnreachable",
			status: 503,
			cause: "upstream proxy crashed; secret=ATATT3x",
		};
		const mapped = mapMarkSyncErrorToCommandError(withStatus);
		expect(mapped.message).not.toContain("503");
		expect(mapped.message).not.toContain("ECONNREFUSED");
		expect(mapped.message).not.toContain("secret");
		expect(mapped.message).not.toContain("ATATT3x");
	});

	test("resolves to an exit code", () => {
		expect(CODE_TO_EXIT.REMOTE_UNREACHABLE).toBeDefined();
		expect(codeToExitCode("REMOTE_UNREACHABLE")).toBeGreaterThan(0);
	});

	test("assertNeverMarkSyncError throws at runtime", () => {
		expect(() => assertNeverMarkSyncError(remoteUnreachable)).toThrow();
	});
});

describe("existing arms remain intact (no regression)", () => {
	test("Conflict still maps to CONFLICT", () => {
		const conflict: MarkSyncError = {
			kind: "Conflict",
			pageId: "123",
			baseVersion: 5,
			remoteVersion: 7,
		};
		expect(mapMarkSyncErrorToCommandError(conflict).code).toBe("CONFLICT");
	});
});
