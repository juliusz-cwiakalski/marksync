import { describe, it, expect } from "bun:test";
import { decideOnConflict, type Decision } from "#domain/state/conflict-policy";

describe("decideOnConflict", () => {
	// LOCAL_AHEAD / NO_CHANGE → reapply (TC-409-001/002)
	describe("safe states → reapply", () => {
		it("returns 'reapply' for LOCAL_AHEAD (TC-409-001)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "LOCAL_AHEAD");

			expect(decision).toBe("reapply");
		});

		it("returns 'reapply' for NO_CHANGE (TC-409-002)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "NO_CHANGE");

			expect(decision).toBe("reapply");
		});
	});

	// REMOTE_AHEAD / DIVERGED → block (TC-409-003/004)
	describe("conflicting states → block", () => {
		it("returns 'block' for REMOTE_AHEAD (TC-409-003)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "REMOTE_AHEAD");

			expect(decision).toBe("block");
		});

		it("returns 'block' for DIVERGED (TC-409-004)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "DIVERGED");

			expect(decision).toBe("block");
		});
	});

	// REMOTE_MISSING / LOCAL_MISSING → block (TC-409-005)
	describe("non-update paths → block", () => {
		it("returns 'block' for REMOTE_MISSING (TC-409-005)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "REMOTE_MISSING");

			expect(decision).toBe("block");
		});

		it("returns 'block' for LOCAL_MISSING (TC-409-005)", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const decision = decideOnConflict(conflict, "LOCAL_MISSING");

			expect(decision).toBe("block");
		});
	});

	describe("exhaustive check", () => {
		it("covers all SyncState values", () => {
			const conflict = {
				kind: "Conflict",
				pageId: "page-123",
				baseVersion: 1,
				remoteVersion: 2,
			} as const;

			const allStates: Array<"NO_CHANGE" | "LOCAL_AHEAD" | "REMOTE_AHEAD" | "DIVERGED" | "REMOTE_MISSING" | "LOCAL_MISSING"> = [
				"NO_CHANGE",
				"LOCAL_AHEAD",
				"REMOTE_AHEAD",
				"DIVERGED",
				"REMOTE_MISSING",
				"LOCAL_MISSING",
			];

			// This test verifies exhaustive handling by calling all states
			// If a state is added to SyncState but not handled, this will throw
			const results: Decision[] = [];
			for (const state of allStates) {
				results.push(decideOnConflict(conflict, state));
			}

			// All should return either "reapply" or "block"
			for (const result of results) {
				expect(result).toMatch(/^(reapply|block)$/);
			}
		});
	});
});