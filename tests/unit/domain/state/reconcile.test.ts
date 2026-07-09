// tests/domain/state/reconcile.test.ts
//
// Unit tests for the pure content-property cross-check (GH-19 F-5,
// TC-RECONCILE-001/002, TC-REBUILD-001). Real records — no mocks (the functions
// are pure over caller-supplied inputs; the property fetch is E3-S4).
//   - TC-RECONCILE-001: matching property -> ok.
//   - TC-RECONCILE-002: sourceCommit mismatch -> err(LockDirty).
//   - TC-REBUILD-001: rebuildLockFromConfluence reconstructs a field-equal binding.

import { describe, expect, test } from "bun:test";
import type { PageBinding } from "#domain/binding/page-binding";
import {
	rebuildLockFromConfluence,
	reconcileWithProperty,
} from "#domain/state/reconcile";
import type { MetadataProperty, RebuildInput } from "#domain/state/reconcile";
import type { DocumentId } from "#domain/identity/document-id";

const UUID = "0192b3d4-5e6f-7000-8000-00000000000a" as DocumentId;

function knownBinding(): PageBinding {
	return {
		uuid: UUID,
		sourcePath: "docs/arch.md",
		pageId: "1122334455",
		parentPageId: "987654321",
		pageVersion: 7,
		sourceCommit: "abc123fullsha0000000000000000000000000000",
		sourceContentHash: "sha256:src",
		renderedBodyHash: "sha256:rend",
		remoteBodyHash: "sha256:rem",
		attachmentHashes: { "assets/diagram.png": "sha256:png" },
		operationId: "op-0192",
		synchronizedAt: "2026-07-09T00:00:00Z",
		toolVersion: "0.4.0",
	};
}

function propertyFor(b: PageBinding): MetadataProperty {
	return {
		schemaVersion: 1,
		projectId: "marksync-for-confluence",
		targetId: "corp",
		documentId: b.uuid,
		sourcePath: b.sourcePath,
		sourceCommit: b.sourceCommit,
		sourceContentHash: b.sourceContentHash,
		renderedBodyHash: b.renderedBodyHash,
		toolVersion: b.toolVersion,
		synchronizedAt: b.synchronizedAt,
		operationId: b.operationId,
	};
}

function rebuildInputFor(b: PageBinding): RebuildInput {
	return {
		property: propertyFor(b),
		pageVersion: b.pageVersion,
		pageId: b.pageId,
		parentPageId: b.parentPageId,
		hashes: {
			sourceContentHash: b.sourceContentHash,
			renderedBodyHash: b.renderedBodyHash,
			remoteBodyHash: b.remoteBodyHash,
		},
		attachmentHashes: b.attachmentHashes,
	};
}

describe("reconcileWithProperty (AC-F5-1)", () => {
	test("TC-RECONCILE-001: matching sourceCommit -> ok", () => {
		const binding = knownBinding();
		const r = reconcileWithProperty(binding, propertyFor(binding));
		expect(r.ok).toBe(true);
	});

	test("TC-RECONCILE-002: sourceCommit mismatch -> err(LockDirty) with the source path", () => {
		const binding = knownBinding();
		const tampered: MetadataProperty = {
			...propertyFor(binding),
			sourceCommit: "DIFFERENT_COMMIT_SHA",
		};
		const r = reconcileWithProperty(binding, tampered);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("LockDirty");
		if (r.error.kind !== "LockDirty") return;
		// The dirty signal carries the binding's source path for diagnosis.
		expect(r.error.path).toBe(binding.sourcePath);
	});

	test("other-field agreement does not matter — only sourceCommit is decisive for MS-0002", () => {
		// Even if renderedBodyHash differs, a matching sourceCommit still reconciles
		// ok (expanding the compared set is deferred — DEC-3 / spec §7.3).
		const binding = knownBinding();
		const property: MetadataProperty = {
			...propertyFor(binding),
			renderedBodyHash: "sha256:something-else",
		};
		expect(reconcileWithProperty(binding, property).ok).toBe(true);
	});
});

describe("rebuildLockFromConfluence (AC-F5-2)", () => {
	test("TC-REBUILD-001: reconstructs a field-equal PageBinding from property + page + hashes", () => {
		const original = knownBinding();
		const r = rebuildLockFromConfluence(rebuildInputFor(original));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// Field-equal to what a normal sync would have recorded.
		expect(r.value).toEqual(original);
		expect(r.value.uuid).toBe(UUID);
		expect(r.value.pageVersion).toBe(7);
		expect(r.value.attachmentHashes).toEqual(original.attachmentHashes);
	});

	test("rebuild + reconcile are mutually consistent (rebuilt binding reconciles ok)", () => {
		const original = knownBinding();
		const rebuilt = rebuildLockFromConfluence(rebuildInputFor(original));
		if (!rebuilt.ok) {
			expect.unreachable("expected ok");
			return;
		}
		// The rebuilt binding and the property agree on sourceCommit -> ok.
		expect(reconcileWithProperty(rebuilt.value, propertyFor(original)).ok).toBe(
			true,
		);
	});
});
