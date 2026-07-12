// tests/unit/domain/state/classifier.test.ts
//
// Unit tests for classify() three-way drift classifier (GH-22 F-1/F-6).
// Pure fixtures — no mocks.

import { describe, expect, test } from "bun:test";
import { classify, type ClassifyInput } from "#domain/state/classifier";
import type { ContentHash } from "#domain/state/hashes";
import type { SharedBase } from "#domain/state/sync-state";
import type { RemoteState } from "#domain/state/sync-state";
import { SyncStateValue } from "#domain/state/sync-state";
import type { Root } from "hast";

const UUID = "0192b3d4-5e6f-7000-8000-00000000000a" as const;

// Real hash constants for fixtures (computed by rawHash/attachmentHash)
const BASE_BODY_HASH = "sha256:c729601120e7a64b970416eed41dd06fdb45d5eaf3d3b057bbe511dd4e018b69";
const REMOTE_CHANGED_HASH = "sha256:4e9f485c4db602adc1f3b10fea9321fd6a58f595594af424d8083e287d29891e";
const LOCAL_CHANGED_HASH = "sha256:93fd3b07c7a3dd01f968c94845647661c7e4d728781da1f1645553ee8c365b24";
const BASE_ATTACHMENT_HASH = "sha256:e25a5c8de807a45bb4b2f48d451cb97887709837ebcec20e38a6de2f37d017de";
const TEXT_CHANGED_HASH = "sha256:cea68bbf0813e0595bce10a7576d378448614374af49fd295ed88f83f33902ed";
const HEADING_CHANGED_HASH = "sha256:445acb1967ea24852694ae1f30a2effece4db78d77c7a4347d6e34cb66296c30";
const LINK_CHANGED_HASH = "sha256:d34ee8063f74f5de7437015f9174b9ae6718baea65a43e1a604562c7d7a9bbbd";
const CELL_CHANGED_HASH = "sha256:a3a31d46bf777a3dca56f12631331c65df1677abb64153f1ada442a50987fa44";
const CODELANG_CHANGED_HASH = "sha256:4ffa2eedbaea4003208a4e13a70b0690d753c1a949f7fc66b7e68ff89c6dabb1";

/** Test fixtures. */
function mockSharedBase(overrides?: Partial<SharedBase>): SharedBase {
	return {
		uuid: UUID,
		pageId: "12345",
		parentPageId: "98765",
		pageVersion: 5,
		renderedBodyHash: BASE_BODY_HASH,
		attachmentHashes: { "img.png": "sha256:img" },
		...overrides,
	};
}

function mockRemote(overrides?: Partial<RemoteState>): RemoteState {
	return {
		kind: "present",
		bodyHash: BASE_BODY_HASH,
		version: 5,
		title: "Test Title",
		parentPageId: "98765",
		...overrides,
	};
}

function mockContentHash(overrides?: Partial<ContentHash>): ContentHash {
	return {
		rawHash: BASE_BODY_HASH,
		canonicalHash: BASE_BODY_HASH,
		attachmentHash: BASE_ATTACHMENT_HASH,
		title: "Test Title",
		parentPageId: "98765",
		...overrides,
	};
}

/** STATE fixtures. */
describe("TC-STATE-001 through TC-STATE-006", () => {
	test("TC-STATE-001: all three agree on canonical hash + title + parent + attachments → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});

	test("TC-STATE-002: local changed, remote == base → LOCAL_AHEAD", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: LOCAL_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
	});

	test("TC-STATE-003: local == base, remote changed → REMOTE_AHEAD (INV-SAFE-1)", () => {
		const input: ClassifyInput = {
			local: mockContentHash(),
			base: mockSharedBase(),
			remote: mockRemote({ bodyHash: REMOTE_CHANGED_HASH }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.REMOTE_AHEAD);
	});

	test("TC-STATE-004: both local and remote changed vs base → DIVERGED (INV-SAFE-1)", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: LOCAL_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote({ bodyHash: REMOTE_CHANGED_HASH }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.DIVERGED);
	});

	test("TC-STATE-005: binding present, remote.kind == 'missing' → REMOTE_MISSING (INV-SAFE-2)", () => {
		const input: ClassifyInput = {
			local: mockContentHash(),
			base: mockSharedBase(),
			remote: { kind: "missing" },
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.REMOTE_MISSING);
	});

	test("TC-STATE-006: binding present, local absent → LOCAL_MISSING (DEC-1)", () => {
		const input: ClassifyInput = {
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.LOCAL_MISSING);
	});
});

/** FORBIDDEN path. */
describe("TC-FORBIDDEN-001", () => {
	test("remote.kind == 'forbidden' → err(Forbidden), not a SyncState (Q1)", () => {
		const input: ClassifyInput = {
			local: mockContentHash(),
			base: mockSharedBase(),
			remote: { kind: "forbidden", pageId: "12345" },
		};
		const result = classify(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe("Forbidden");
			expect(result.error.pageId).toBe("12345");
			expect(result.error.operation).toBe("read");
		}
	});
});

/** FALSE-POSITIVE suite — semantically-unchanged-but-superficially-different docs. */
describe("TC-FALSEPOS-001 through TC-FALSEPOS-005", () => {
	// All these fixtures use the same canonical hash (GH-20 normalizes to identical output)
	test("TC-FALSEPOS-001: structural-whitespace text node count change → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(), // GH-20 drops structural ws
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});

	test("TC-FALSEPOS-002: multiple newline-containing ws nodes collapsed → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});

	test("TC-FALSEPOS-003: HTML attribute order diff → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(), // GH-20 sorts properties
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});

	test("TC-FALSEPOS-004: raw-HTML node vs text node for same literal → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(), // GH-20 converts raw→text
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});

	test("TC-FALSEPOS-005: empty line count change → NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash(), // GH-20 drops structural ws
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.NO_CHANGE);
	});
});

/** REAL-CHANGE suite — genuine content edits. */
describe("TC-REALCHG-001 through TC-REALCHG-005", () => {
	test("TC-REALCHG-001: text content change → NOT NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: TEXT_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe(SyncStateValue.NO_CHANGE);
			expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
		}
	});

	test("TC-REALCHG-002: heading addition/removal → NOT NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: HEADING_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe(SyncStateValue.NO_CHANGE);
			expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
		}
	});

	test("TC-REALCHG-003: link URL change → NOT NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: LINK_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe(SyncStateValue.NO_CHANGE);
			expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
		}
	});

	test("TC-REALCHG-004: table cell content change → NOT NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: CELL_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe(SyncStateValue.NO_CHANGE);
			expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
		}
	});

	test("TC-REALCHG-005: code block language change → NOT NO_CHANGE", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ canonicalHash: CODELANG_CHANGED_HASH }),
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe(SyncStateValue.NO_CHANGE);
			expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
		}
	});
});

/** METADATA drift tests (R1/PD-3). */
describe("TC-METADATA-001, TC-METADATA-002", () => {
	test("TC-METADATA-001: title change only (body identical) → LOCAL_AHEAD (R1)", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ title: "New Title" }),
			base: mockSharedBase(),
			remote: mockRemote({ title: "Test Title" }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
	});

	test("TC-METADATA-002: parent page id change only (body identical) → LOCAL_AHEAD (R1)", () => {
		const input: ClassifyInput = {
			local: mockContentHash({ parentPageId: "99999" }),
			base: mockSharedBase(),
			remote: mockRemote({ parentPageId: "98765" }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.LOCAL_AHEAD);
	});
});

/** EDGE case: both missing. */
describe("TC-EDGE-001", () => {
	test("TC-EDGE-001: local absent + remote.kind == 'missing' + binding → LOCAL_MISSING (DEC-6)", () => {
		const input: ClassifyInput = {
			base: mockSharedBase(),
			remote: { kind: "missing" },
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(SyncStateValue.LOCAL_MISSING);
	});
});

/** BOUNDARY test: zod schema rejects ad-hoc state strings. */
describe("TC-BOUNDARY-001", () => {
	test("TC-BOUNDARY-001: SyncStateSchema rejects ad-hoc state string (UL rule 3)", () => {
		const { SyncStateSchema } = require("#domain/state/sync-state");
		expect(() => SyncStateSchema.parse("SOMETHING_ELSE")).toThrow();
		expect(() => SyncStateSchema.parse("NO_CHANGE")).not.toThrow();
		expect(() => SyncStateSchema.parse("LOCAL_AHEAD")).not.toThrow();
		expect(() => SyncStateSchema.parse("REMOTE_AHEAD")).not.toThrow();
		expect(() => SyncStateSchema.parse("DIVERGED")).not.toThrow();
		expect(() => SyncStateSchema.parse("REMOTE_MISSING")).not.toThrow();
		expect(() => SyncStateSchema.parse("LOCAL_MISSING")).not.toThrow();
	});
});