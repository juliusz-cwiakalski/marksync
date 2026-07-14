// Unit tests for the PageBinding record shape (GH-18 F-5 / TC-PB-001..003 /
// ADR-0006 Shared-base schema). Structural + branding compile guards +
// isPageBinding narrowing.

import { describe, expect, test } from "bun:test";
import { isPageBinding, type PageBinding } from "#domain/binding/page-binding";
import { generateUuidV7 } from "#domain/identity/uuid";

function validBinding(overrides: Partial<PageBinding> = {}): PageBinding {
	return {
		uuid: generateUuidV7(),
		sourcePath: "docs/a.md",
		pageId: "123",
		parentPageId: "456",
		pageVersion: 1,
		sourceCommit: "abc123",
		sourceContentHash: "sha256:source",
		renderedBodyHash: "sha256:rendered",
		remoteBodyHash: "sha256:remote",
		attachmentHashes: {},
		operationId: "op-1",
		synchronizedAt: "2026-07-09T00:00:00Z",
		toolVersion: "0.4.0",
		...overrides,
	};
}

describe("PageBinding", () => {
	test("TC-PB-001: a complete literal satisfies the interface; missing fields are compile errors", () => {
		const b: PageBinding = validBinding();
		expect(b.pageVersion).toBe(1);

		// @ts-expect-error — missing pageId
		const noPageId: PageBinding = { ...validBinding(), pageId: undefined };
		void noPageId;
		// @ts-expect-error — wrong type: pageVersion must be number
		const badVersion: PageBinding = { ...validBinding(), pageVersion: "1" };
		void badVersion;
		// @ts-expect-error — missing attachmentHashes
		const noHashes: PageBinding = {
			...(({ attachmentHashes: _ignored, ...rest }: PageBinding) => rest)(
				validBinding(),
			),
		};
		void noHashes;
	});

	test("TC-PB-002: uuid is branded — a bare string is rejected; generateUuidV7() is accepted", () => {
		const withGenerated: PageBinding = validBinding({ uuid: generateUuidV7() });
		expect(typeof withGenerated.uuid).toBe("string");

		// @ts-expect-error — uuid must be a DocumentId, not a bare string
		const bareStringUuid: PageBinding = {
			...validBinding(),
			uuid: "not-branded",
		};
		void bareStringUuid;
	});

	test("TC-PB-003: isPageBinding narrows structurally", () => {
		expect(isPageBinding(validBinding())).toBe(true);
		expect(isPageBinding(validBinding({ uuid: generateUuidV7() }))).toBe(true);

		// missing uuid
		const missingUuid = validBinding();
		delete (missingUuid as Record<string, unknown>).uuid;
		expect(isPageBinding(missingUuid)).toBe(false);

		// non-string pageId
		expect(isPageBinding({ ...validBinding(), pageId: 123 })).toBe(false);
		// non-number pageVersion
		expect(isPageBinding({ ...validBinding(), pageVersion: "1" })).toBe(false);
		// attachmentHashes not an object
		expect(isPageBinding({ ...validBinding(), attachmentHashes: "x" })).toBe(
			false,
		);

		// non-object inputs
		expect(isPageBinding(null)).toBe(false);
		expect(isPageBinding("string")).toBe(false);
		expect(isPageBinding(undefined)).toBe(false);
		expect(isPageBinding(42)).toBe(false);
	});

	test("GH-27 backward compat: old bindings without new optional fields are accepted", () => {
		const oldBinding = validBinding();
		// Ensure no new fields are present
		const asRecord = oldBinding as Record<string, unknown>;
		expect(asRecord.sourceBranch).toBeUndefined();
		expect(asRecord.commitCount).toBeUndefined();
		expect(asRecord.trimMarker).toBeUndefined();
		expect(isPageBinding(oldBinding)).toBe(true);
	});

	test("GH-27: new bindings with optional provenance fields are accepted", () => {
		const newBinding = validBinding({
			sourceBranch: "main",
			commitCount: 5,
			trimMarker: "+2 more",
		});
		expect(isPageBinding(newBinding)).toBe(true);
	});

	test("GH-27: isPageBinding rejects wrong-typed optional fields", () => {
		expect(isPageBinding({ ...validBinding(), sourceBranch: 123 })).toBe(false);
		expect(isPageBinding({ ...validBinding(), commitCount: "five" })).toBe(
			false,
		);
		expect(isPageBinding({ ...validBinding(), trimMarker: false })).toBe(false);
	});
});
