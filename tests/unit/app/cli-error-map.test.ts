// tests/unit/app/cli-error-map.test.ts
//
// Unit tests for the DEC-1 MarkSyncError → presentation-error bridge
// (GH-16 Phase 5 / DEC-2 table / AC-6 / NFR-3 / NFR-OBS-1).
//
// Asserts (mapped to the test matrix — TS-10):
//   - the DEC-2 table end to end: every MarkSyncError.kind → stable code +
//     retryable, exhaustive over all 14 kinds (NFR-3);
//   - the AC-6 load-bearing mapping Conflict → { code: "CONFLICT",
//     retryable: true } so the cli tier's codeToExitCode yields 30;
//   - DEC-3 (NFR-SEC-1/2): no message leaks a Bearer/gho_/ghp_/ATATT token
//     substring even when the error's raw-exception/path/body fields carry one.
//
// No mock: constructs real MarkSyncError shapes and exercises the mapper.

import { describe, expect, test } from "bun:test";
import { mapMarkSyncErrorToCommandError } from "#app/cli-error-map";
import type { ConfigAjvError, MarkSyncError } from "#domain/errors";

/** Minimal valid ConfigAjvError entry (count is the only structural signal used). */
function ajvError(message = "must be 1"): ConfigAjvError {
	return {
		instancePath: "/version",
		schemaPath: "#/properties/version",
		keyword: "const",
		message,
		params: {},
	};
}

describe("mapMarkSyncErrorToCommandError — DEC-2 table (exhaustive, NFR-3)", () => {
	// One representative error per kind; code + retryable per the DEC-2 table.
	// Keeping all 14 here is itself the exhaustiveness assertion (TS-10).
	const cases: ReadonlyArray<{
		name: MarkSyncError["kind"];
		err: MarkSyncError;
		code: string;
		retryable: boolean;
	}> = [
		{
			name: "Conflict",
			err: {
				kind: "Conflict",
				pageId: "123",
				baseVersion: 1,
				remoteVersion: 3,
			},
			code: "CONFLICT",
			retryable: true,
		},
		{
			name: "RemoteMissing",
			err: { kind: "RemoteMissing", pageId: "123" },
			code: "REMOTE_MISSING",
			retryable: true,
		},
		{
			name: "DuplicateUuid",
			err: {
				kind: "DuplicateUuid",
				uuid: "01964a...",
				paths: ["a.md", "b.md"],
			},
			code: "DUPLICATE_UUID",
			retryable: false,
		},
		{
			name: "UnsupportedConstruct",
			err: {
				kind: "UnsupportedConstruct",
				construct: "math",
				sourcePath: "x.md",
			},
			code: "UNSUPPORTED_CONSTRUCT",
			retryable: false,
		},
		{
			name: "Forbidden",
			err: { kind: "Forbidden", pageId: "123", operation: "update" },
			code: "FORBIDDEN",
			retryable: false,
		},
		{
			name: "LockDirty",
			err: { kind: "LockDirty", path: ".marksync/lock.json" },
			code: "LOCK_DIRTY",
			retryable: true,
		},
		{
			name: "ConcurrentWrite",
			err: { kind: "ConcurrentWrite", lockPath: ".marksync/lock.json" },
			code: "CONCURRENT_WRITE",
			retryable: true,
		},
		{
			name: "RenderUnavailable",
			err: { kind: "RenderUnavailable", renderer: "mermaid", cause: "boom" },
			code: "RENDER_UNAVAILABLE",
			retryable: false,
		},
		{
			name: "StalePlan",
			err: {
				kind: "StalePlan",
				operationId: "plan-01964a",
				expiredAt: "2026-01-01T00:00:00Z",
			},
			code: "STALE_PLAN",
			retryable: true,
		},
		{
			name: "ForbiddenBranch",
			err: { kind: "ForbiddenBranch", branch: "feat/x", allowed: ["main"] },
			code: "FORBIDDEN_BRANCH",
			retryable: false,
		},
		{
			name: "TooLarge",
			err: { kind: "TooLarge", pageId: "123", what: "page body" },
			code: "TOO_LARGE",
			retryable: false,
		},
		{
			name: "UnresolvedLink",
			err: { kind: "UnresolvedLink", sourcePath: "x.md", target: "./y.md" },
			code: "UNRESOLVED_LINK",
			retryable: false,
		},
		{
			name: "InvalidConfig",
			err: {
				kind: "InvalidConfig",
				path: "marksync.yml",
				ajvErrors: [ajvError()],
				humanMessage: "bad config",
			},
			code: "INVALID_CONFIG",
			retryable: false,
		},
		{
			// GH-17 — the Auth arm is ONE top-level kind (union 13→14). Its four
			// sub-cases are enumerated in the dedicated "Auth arm" suite below;
			// one representative keeps this table's per-kind coverage complete.
			name: "Auth",
			err: {
				kind: "Auth",
				authKind: "MissingCredentials",
				missing: ["MARKSYNC_API_TOKEN"],
			},
			code: "AUTH_MISSING_CREDENTIALS",
			retryable: false,
		},
	];

	for (const c of cases) {
		test(`${c.name} → code ${c.code}, retryable ${c.retryable}, with a stable message`, () => {
			const out = mapMarkSyncErrorToCommandError(c.err);
			expect(out.code).toBe(c.code);
			expect(out.retryable).toBe(c.retryable);
			expect(typeof out.message).toBe("string");
			expect(out.message.length).toBeGreaterThan(0);
		});
	}

	test("covers exactly the 14 kinds — exhaustiveness (TS-10)", () => {
		expect(cases).toHaveLength(14);
		const kinds = new Set(cases.map((c) => c.name));
		expect(kinds.size).toBe(14);
	});
});

describe("mapMarkSyncErrorToCommandError — AC-6 load-bearing mapping", () => {
	test("Conflict → { code: 'CONFLICT', retryable: true } (so codeToExitCode yields 30)", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "Conflict",
			pageId: "987654",
			baseVersion: 2,
			remoteVersion: 5,
		});
		expect(out).toEqual({
			code: "CONFLICT",
			message: expect.any(String),
			retryable: true,
		});
		// built from structural fields: the page id + both versions
		expect(out.message).toContain("987654");
		expect(out.message).toContain("5");
		expect(out.message).toContain("2");
	});

	test("InvalidConfig → INVALID_CONFIG", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "InvalidConfig",
			path: "marksync.yml",
			ajvErrors: [ajvError(), ajvError(), ajvError()],
			humanMessage: "details elided by the mapper",
		});
		expect(out.code).toBe("INVALID_CONFIG");
		expect(out.retryable).toBe(false);
		// structural count + pluralization only (never the humanMessage body)
		expect(out.message).toMatch(/3 validation errors/);
		expect(out.message).not.toContain("details elided by the mapper");
	});

	test("RemoteMissing → REMOTE_MISSING (built from the page id)", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "RemoteMissing",
			pageId: "4242",
		});
		expect(out.code).toBe("REMOTE_MISSING");
		expect(out.message).toContain("4242");
	});

	test("RenderUnavailable → RENDER_UNAVAILABLE (built from renderer, never cause)", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "RenderUnavailable",
			renderer: "mermaid",
			cause: "boom",
		});
		expect(out.code).toBe("RENDER_UNAVAILABLE");
		expect(out.message).toContain("mermaid");
		expect(out.message).not.toContain("boom"); // raw exception never surfaces
	});
});

describe("mapMarkSyncErrorToCommandError — DEC-3 redaction at the source", () => {
	// A token carried by an error's raw-exception/path/body field must NEVER
	// surface in the message (NFR-SEC-1/2). The mapper omits those fields
	// entirely, so this is an adversarial check that the omission holds.
	const TOKENS = [
		"Bearer ghp_AbCdEfGh1234567890",
		"gho_leakedTokenValue1234567",
		"ATATTsecretAccessTokenAB123",
	];

	const leaky: ReadonlyArray<MarkSyncError> = [
		// cause = raw exception text
		{
			kind: "RenderUnavailable",
			renderer: "mermaid",
			cause: `renderer crashed: ${TOKENS.join(" | ")}`,
		},
		// humanMessage + ajvError.message = echoed data body
		{
			kind: "InvalidConfig",
			path: "marksync.yml",
			humanMessage: TOKENS.join(" | "),
			ajvErrors: [ajvError(TOKENS.join(" | "))],
		},
		// paths = file paths
		{
			kind: "DuplicateUuid",
			uuid: "u-1",
			paths: [`Bearer ${"x".repeat(30)}`, `gho_${"y".repeat(30)}`],
		},
		// sourcePath + target = file/link paths
		{
			kind: "UnresolvedLink",
			sourcePath: `Bearer ${"x".repeat(30)}`,
			target: `ATATT${"z".repeat(30)}`,
		},
		// path = file path
		{ kind: "LockDirty", path: `Bearer ${"x".repeat(30)}` },
		// lockPath = file path
		{ kind: "ConcurrentWrite", lockPath: `gho_${"y".repeat(30)}` },
		// sourcePath = file path
		{
			kind: "UnsupportedConstruct",
			construct: "math",
			sourcePath: `ATATT${"z".repeat(30)}`,
		},
	];

	for (const err of leaky) {
		test(`${err.kind}: message leaks no token substring`, () => {
			const out = mapMarkSyncErrorToCommandError(err);
			expect(out.message.length).toBeGreaterThan(0);
			for (const token of TOKENS) {
				expect(out.message).not.toContain(token);
			}
			// discriminating prefixes never appear, regardless of field placement
			expect(out.message).not.toMatch(/Bearer/);
			expect(out.message).not.toMatch(/gho_/);
			expect(out.message).not.toMatch(/ghp_/);
			expect(out.message).not.toMatch(/ATATT/);
		});
	}
});

describe("mapMarkSyncErrorToCommandError — GH-17 Auth arm (DEC-2, nested exhaustiveness)", () => {
	// The Auth arm narrows on `err.authKind` (a direct property) via its own
	// exhaustive sub-switch (RSK-8 — its `never`-check makes a new authKind a
	// compile error). One case per authKind, asserting the pinned stable code +
	// retryable per the DEC-2 / spec DM-4 table.
	const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";

	const subCases: ReadonlyArray<{
		authKind:
			| "MissingCredentials"
			| "InvalidBaseUrl"
			| "InvalidCredentials"
			| "AuthUnreachable";
		err: Extract<MarkSyncError, { kind: "Auth" }>;
		code: string;
		retryable: boolean;
	}> = [
		{
			authKind: "MissingCredentials",
			err: {
				kind: "Auth",
				authKind: "MissingCredentials",
				missing: ["MARKSYNC_USER_EMAIL", "MARKSYNC_API_TOKEN"],
			},
			code: "AUTH_MISSING_CREDENTIALS",
			retryable: false,
		},
		{
			authKind: "InvalidBaseUrl",
			err: {
				kind: "Auth",
				authKind: "InvalidBaseUrl",
				baseUrl: "http://secret-host.example",
			},
			code: "AUTH_INVALID_BASE_URL",
			retryable: false,
		},
		{
			authKind: "InvalidCredentials",
			err: { kind: "Auth", authKind: "InvalidCredentials", status: 401 },
			code: "AUTH_INVALID_CREDENTIALS",
			retryable: false,
		},
		{
			authKind: "AuthUnreachable",
			err: { kind: "Auth", authKind: "AuthUnreachable", cause: "boom" },
			code: "AUTH_UNREACHABLE",
			retryable: true,
		},
	];

	for (const c of subCases) {
		test(`${c.authKind} → code ${c.code}, retryable ${c.retryable}`, () => {
			const out = mapMarkSyncErrorToCommandError(c.err);
			expect(out.code).toBe(c.code);
			expect(out.retryable).toBe(c.retryable);
			expect(typeof out.message).toBe("string");
			expect(out.message.length).toBeGreaterThan(0);
		});
	}

	test("only AUTH_UNREACHABLE is retryable", () => {
		const retryable = new Set(
			subCases.filter((c) => c.retryable).map((c) => c.code),
		);
		expect(retryable).toEqual(new Set(["AUTH_UNREACHABLE"]));
	});

	test("MissingCredentials message names the missing var(s) and links .env.example", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "Auth",
			authKind: "MissingCredentials",
			missing: ["MARKSYNC_USER_EMAIL", "MARKSYNC_API_TOKEN"],
		});
		expect(out.message).toContain("MARKSYNC_USER_EMAIL");
		expect(out.message).toContain("MARKSYNC_API_TOKEN");
		expect(out.message).toContain(".env.example");
	});

	test("InvalidCredentials message references the HTTP status, never the token", () => {
		const out = mapMarkSyncErrorToCommandError({
			kind: "Auth",
			authKind: "InvalidCredentials",
			status: 403,
		});
		expect(out.message).toContain("403");
		expect(out.message).not.toContain(TOKEN);
	});

	// DEC-5 / RSK-1 — adversarial: a token-shaped value in the fields the
	// mapper OMITS (baseUrl, cause) must never surface. `missing[]` and
	// `status` are structural identifiers that ARE surfaced by design (env-var
	// names + HTTP status) — they never carry token material in practice
	// (the provider only pushes canonical env-var names into `missing[]`).
	test("InvalidBaseUrl.baseUrl and AuthUnreachable.cause never surface in the message", () => {
		const outUrl = mapMarkSyncErrorToCommandError({
			kind: "Auth",
			authKind: "InvalidBaseUrl",
			baseUrl: `https://${TOKEN}.atlassian.net`,
		});
		expect(outUrl.message).not.toContain(TOKEN);
		expect(outUrl.message).not.toContain("atlassian.net");
		expect(outUrl.message).toContain(".env.example");

		const outCause = mapMarkSyncErrorToCommandError({
			kind: "Auth",
			authKind: "AuthUnreachable",
			cause: `fetch failed: ${TOKEN} Authorization: Basic ${TOKEN}`,
		});
		expect(outCause.message).not.toContain(TOKEN);
		expect(outCause.message).not.toMatch(/Bearer/);
		expect(outCause.message).not.toMatch(/ATATT/);
		expect(outCause.message).not.toContain("fetch failed");
	});
});
