// tests/unit/domain/state/actions.test.ts
//
// Unit tests for SyncState → Action mapping (GH-22 F-5/DM-5; TC-ACTION-001..006).
// Pure fixtures — no mocks.

import { describe, expect, test } from "bun:test";
import { actionFor, type ActionContext } from "#domain/state/actions";
import type { SharedBase, RemoteState } from "#domain/state/sync-state";

const UUID = "0192b3d4-5e6f-7000-8000-00000000000a" as const;

/** Test fixtures. */
function mockSharedBase(overrides?: Partial<SharedBase>): SharedBase {
	return {
		uuid: UUID,
		pageId: "12345",
		parentPageId: "98765",
		pageVersion: 5,
		renderedBodyHash: "sha256:basebody",
		attachmentHashes: { "img.png": "sha256:img" },
		...overrides,
	};
}

function mockRemotePresent(overrides?: Partial<RemoteState>): RemoteState {
	return {
		kind: "present",
		bodyHash: "sha256:basebody",
		version: 7,
		title: "Test Title",
		parentPageId: "98765",
		...overrides,
	};
}

function mockContext(overrides?: Partial<ActionContext>): ActionContext {
	return {
		base: mockSharedBase(),
		remote: mockRemotePresent(),
		...overrides,
	};
}

describe("TC-ACTION-001 through TC-ACTION-006", () => {
	test("TC-ACTION-001: NO_CHANGE → NoOp", () => {
		const ctx = mockContext();
		const action = actionFor("NO_CHANGE", ctx);
		expect(action.kind).toBe("NoOp");
		expect("uuid" in action && action.uuid).toBe(UUID);
	});

	test("TC-ACTION-002: LOCAL_AHEAD → Update", () => {
		const ctx = mockContext();
		const action = actionFor("LOCAL_AHEAD", ctx);
		expect(action.kind).toBe("Update");
		expect("uuid" in action && action.uuid).toBe(UUID);
	});

	test("TC-ACTION-003: REMOTE_AHEAD → Block(Conflict) with correct fields", () => {
		const ctx = mockContext({ remote: mockRemotePresent({ version: 7 }) });
		const action = actionFor("REMOTE_AHEAD", ctx);
		expect(action.kind).toBe("Block");
		if (action.kind === "Block") {
			expect(action.uuid).toBe(UUID);
			expect(action.error.kind).toBe("Conflict");
			expect(action.error.pageId).toBe("12345");
			expect(action.error.baseVersion).toBe(5);
			expect(action.error.remoteVersion).toBe(7);
		}
	});

	test("TC-ACTION-004: DIVERGED → Block(Conflict) with correct fields", () => {
		const ctx = mockContext({ remote: mockRemotePresent({ version: 8 }) });
		const action = actionFor("DIVERGED", ctx);
		expect(action.kind).toBe("Block");
		if (action.kind === "Block") {
			expect(action.uuid).toBe(UUID);
			expect(action.error.kind).toBe("Conflict");
			expect(action.error.pageId).toBe("12345");
			expect(action.error.baseVersion).toBe(5);
			expect(action.error.remoteVersion).toBe(8);
		}
	});

	test("TC-ACTION-005: REMOTE_MISSING → Block(RemoteMissing) with correct pageId", () => {
		const ctx = mockContext({ remote: { kind: "missing" } });
		const action = actionFor("REMOTE_MISSING", ctx);
		expect(action.kind).toBe("Block");
		if (action.kind === "Block") {
			expect(action.uuid).toBe(UUID);
			expect(action.error.kind).toBe("RemoteMissing");
			expect(action.error.pageId).toBe("12345");
			// Assert the action carries NO write operation (engine honors the block)
			expect(action).not.toHaveProperty("write");
		}
	});

	test("TC-ACTION-006: LOCAL_MISSING → Skip", () => {
		const ctx = mockContext();
		const action = actionFor("LOCAL_MISSING", ctx);
		expect(action.kind).toBe("Skip");
		if (action.kind === "Skip") {
			expect(action.uuid).toBe(UUID);
			expect(action.reason).toBe("LOCAL_MISSING");
		}
	});
});

/** DEC-3 spot-check: all Block.error kinds are Conflict/RemoteMissing only. */
describe("DEC-3: no new MarkSyncError kinds", () => {
	test("all Block actions use only Conflict or RemoteMissing error arms", () => {
		const ctx = mockContext();

		// Test all block-producing states
		const remoteAheadAction = actionFor("REMOTE_AHEAD", ctx);
		if (remoteAheadAction.kind === "Block") {
			expect(["Conflict", "RemoteMissing"]).toContain(
				remoteAheadAction.error.kind,
			);
		}

		const divergedAction = actionFor("DIVERGED", ctx);
		if (divergedAction.kind === "Block") {
			expect(["Conflict", "RemoteMissing"]).toContain(
				divergedAction.error.kind,
			);
		}

		const remoteMissingAction = actionFor("REMOTE_MISSING", {
			...ctx,
			remote: { kind: "missing" },
		});
		if (remoteMissingAction.kind === "Block") {
			expect(["Conflict", "RemoteMissing"]).toContain(
				remoteMissingAction.error.kind,
			);
		}
	});
});
