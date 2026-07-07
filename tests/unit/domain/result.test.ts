// tests/unit/domain/result.test.ts
//
// Smoke test for the shared primitives — proves the toolchain compiles and
// executes the `Result<T,E>` + 13-kind `MarkSyncError` contract under strict
// mode, and that the union is exhaustive (the `never`-check compiles only when
// every kind is handled — AC-F6-2). Type-and-shape only: no domain behavior
// under test (NG-1). Mirrors `src/domain/{result,errors}.ts` (TC-PRIMITIVES-001).

import { describe, expect, test } from "bun:test";
import { assertNeverMarkSyncError } from "#domain/errors";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

describe("Result<T, E>", () => {
	test("ok() carries the success arm", () => {
		const r = Result.ok(42);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe(42);
	});

	test("err() carries the error arm", () => {
		const r = Result.err("boom");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("boom");
	});
});

describe("MarkSyncError exhaustiveness", () => {
	// One sample per kind — proves every kind is constructible with its
	// blueprint §2 / GH-15 field shape and feeds the exhaustive switch below.
	const samples: MarkSyncError[] = [
		{ kind: "Conflict", pageId: "1", baseVersion: 1, remoteVersion: 2 },
		{ kind: "RemoteMissing", pageId: "1" },
		{ kind: "DuplicateUuid", uuid: "u", paths: ["a.md", "b.md"] },
		{ kind: "UnsupportedConstruct", construct: "math", sourcePath: "a.md" },
		{ kind: "Forbidden", pageId: "1", operation: "write" },
		{ kind: "LockDirty", path: "marksync.lock.yml" },
		{ kind: "ConcurrentWrite", lockPath: "marksync.lock.yml" },
		{
			kind: "RenderUnavailable",
			renderer: "mermaid",
			cause: "happy-dom not initialized",
		},
		{
			kind: "StalePlan",
			operationId: "op_0190a3b4",
			expiredAt: "2026-07-07T00:00:00Z",
		},
		{ kind: "ForbiddenBranch", branch: "feature/x", allowed: ["main"] },
		{ kind: "TooLarge", pageId: "1", what: "storage body" },
		{ kind: "UnresolvedLink", sourcePath: "a.md", target: "missing.md" },
		{
			kind: "InvalidConfig",
			path: "marksync.yml",
			ajvErrors: [],
			humanMessage: "missing required field: root",
		},
	];

	test("every kind maps to a label via an exhaustive switch", () => {
		const label = (error: MarkSyncError): string => {
			switch (error.kind) {
				case "Conflict":
					return "conflict";
				case "RemoteMissing":
					return "remote-missing";
				case "DuplicateUuid":
					return "duplicate-uuid";
				case "UnsupportedConstruct":
					return "unsupported-construct";
				case "Forbidden":
					return "forbidden";
				case "LockDirty":
					return "lock-dirty";
				case "ConcurrentWrite":
					return "concurrent-write";
				case "RenderUnavailable":
					return "render-unavailable";
				case "StalePlan":
					return "stale-plan";
				case "ForbiddenBranch":
					return "forbidden-branch";
				case "TooLarge":
					return "too-large";
				case "UnresolvedLink":
					return "unresolved-link";
				case "InvalidConfig":
					return "invalid-config";
				default:
					// Exhaustiveness: if a new `kind` is added to MarkSyncError,
					// `error` here is no longer `never` and this line fails to
					// compile (AC-F6-2). assertNeverMarkSyncError inherits the
					// same guarantee at the definition site.
					return assertNeverMarkSyncError(error);
			}
		};
		for (const sample of samples) {
			expect(label(sample)).toBeTypeOf("string");
		}
	});

	test("assertNeverMarkSyncError throws for every known kind", () => {
		for (const sample of samples) {
			expect(() => assertNeverMarkSyncError(sample)).toThrow(
				/unhandled MarkSyncError kind/,
			);
		}
	});
});
