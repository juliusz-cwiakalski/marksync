// tests/app/branch.test.ts
//
// Unit tests for the branch-restriction gate (GH-19 F-6, TC-BRANCH-001/002/003).
//   - TC-BRANCH-001: an allowed branch -> ok.
//   - TC-BRANCH-002: a non-allowed branch -> err(ForbiddenBranch) listing the
//     configured set.
//   - TC-BRANCH-003: MARKSYNC_ALLOW_BRANCHES augments the set (override ok).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { assertBranchAllowed } from "#app/branch";
import type { ProjectConfig } from "#domain/config/types";

function makeConfig(allowBranches: string[]): ProjectConfig {
	return {
		version: 1,
		root: "docs/",
		select: ["**/*.md"],
		exclude: [],
		hierarchy: "mirror",
		targets: {},
		sync: {
			allowBranches,
			granularity: "squash",
			stalePlanMinutes: 15,
		},
		render: {
			mermaid: {
				policy: "render",
				securityLevel: "strict",
				htmlLabels: false,
				deterministicIds: true,
			},
		},
		output: { format: "storage", color: "auto" },
		provenance: { visiblePanel: true },
	};
}

describe("assertBranchAllowed — default + deny (AC-F6-1 / NFR-9)", () => {
	test("TC-BRANCH-001: 'main' with allowBranches:['main'] -> ok", () => {
		const r = assertBranchAllowed("main", makeConfig(["main"]));
		expect(r.ok).toBe(true);
	});

	test("TC-BRANCH-002: 'feature/x' (no override) -> err(ForbiddenBranch) listing the configured set", () => {
		const r = assertBranchAllowed("feature/x", makeConfig(["main"]));
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("ForbiddenBranch");
		if (r.error.kind !== "ForbiddenBranch") return;
		expect(r.error.branch).toBe("feature/x");
		// The error reports the CONFIGURED allow list (not an env-augmented one).
		expect(r.error.allowed).toEqual(["main"]);
	});

	test("a custom configured branch is allowed without any override", () => {
		const r = assertBranchAllowed("release", makeConfig(["main", "release"]));
		expect(r.ok).toBe(true);
	});
});

describe("assertBranchAllowed — MARKSYNC_ALLOW_BRANCHES override (NFR-10)", () => {
	const original = process.env.MARKSYNC_ALLOW_BRANCHES;

	beforeEach(() => {
		delete process.env.MARKSYNC_ALLOW_BRANCHES;
	});
	afterEach(() => {
		if (original === undefined) delete process.env.MARKSYNC_ALLOW_BRANCHES;
		else process.env.MARKSYNC_ALLOW_BRANCHES = original;
	});

	test("TC-BRANCH-003: MARKSYNC_ALLOW_BRANCHES='feature/x' + 'feature/x' -> ok", () => {
		process.env.MARKSYNC_ALLOW_BRANCHES = "feature/x";
		const r = assertBranchAllowed("feature/x", makeConfig(["main"]));
		expect(r.ok).toBe(true);
	});

	test("the override AUGMENTS the configured set (configured branches still allowed)", () => {
		process.env.MARKSYNC_ALLOW_BRANCHES = "feature/x";
		// 'main' (configured) still allowed alongside 'feature/x' (override).
		expect(assertBranchAllowed("main", makeConfig(["main"])).ok).toBe(true);
		expect(assertBranchAllowed("feature/x", makeConfig(["main"])).ok).toBe(
			true,
		);
		// An unrelated branch is still denied.
		const denied = assertBranchAllowed("other", makeConfig(["main"]));
		expect(denied.ok).toBe(false);
		if (!denied.ok) {
			expect(denied.error.kind).toBe("ForbiddenBranch");
		}
	});

	test("comma-separated override allows each listed branch", () => {
		process.env.MARKSYNC_ALLOW_BRANCHES = "feature/x, feature/y ,feature/z";
		expect(assertBranchAllowed("feature/x", makeConfig(["main"])).ok).toBe(
			true,
		);
		expect(assertBranchAllowed("feature/y", makeConfig(["main"])).ok).toBe(
			true,
		);
		expect(assertBranchAllowed("feature/z", makeConfig(["main"])).ok).toBe(
			true,
		);
	});

	test("an empty override is equivalent to no override", () => {
		process.env.MARKSYNC_ALLOW_BRANCHES = "";
		expect(assertBranchAllowed("main", makeConfig(["main"])).ok).toBe(true);
		expect(assertBranchAllowed("feature/x", makeConfig(["main"])).ok).toBe(
			false,
		);
	});
});
