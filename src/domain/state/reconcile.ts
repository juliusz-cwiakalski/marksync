// Pure content-property cross-check (ADR-0006 Cross-check). reconcileWithProperty
// flags a tampered/stale property as LockDirty; rebuildLockFromConfluence
// reconstructs a PageBinding from the remote property + page + hashes. No I/O —
// the property fetch is E3-S4 (DEC-3).

import type { PageBinding } from "#domain/binding/page-binding";
import type { DocumentId } from "#domain/identity/document-id";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

/**
 * The remote `marksync.metadata` content property (system spec §9.3, plus
 * `operationId` — ADR-0006 records the last-applied operation id in the
 * property for operation-ID dedup). Caller-supplied input to the pure
 * cross-check; fetched by E3-S4.
 */
export interface MetadataProperty {
	schemaVersion: 1;
	projectId: string;
	targetId: string;
	documentId: DocumentId;
	sourcePath: string;
	sourceCommit: string;
	sourceContentHash: string;
	renderedBodyHash: string;
	toolVersion: string;
	synchronizedAt: string;
	operationId: string;
}

/**
 * Compare a lock binding against the remote property. A `sourceCommit` mismatch
 * (the decisive tamper/staleness signal for MS-0002) -> `err(LockDirty)`; a
 * matching record -> `ok`. Expanding the compared field set is deferred
 * (AC-F5-1 / NFR-6/7).
 */
export function reconcileWithProperty(
	binding: PageBinding,
	property: MetadataProperty,
): Result<void, MarkSyncError> {
	if (binding.sourceCommit !== property.sourceCommit) {
		return Result.err({ kind: "LockDirty", path: binding.sourcePath });
	}
	return Result.ok(undefined);
}

/** Input to {@link rebuildLockFromConfluence}: remote property + page facts +
 * freshly-derived content hashes + attachment hashes. */
export interface RebuildInput {
	property: MetadataProperty;
	pageVersion: number;
	pageId: string;
	parentPageId: string;
	hashes: {
		sourceContentHash: string;
		renderedBodyHash: string;
		remoteBodyHash: string;
	};
	attachmentHashes: Record<string, string>;
}

/**
 * Reconstruct a `PageBinding` from the remote property + page + hashes when the
 * lock is lost/corrupted (ADR-0006: "a lost lock can be rebuilt from Confluence
 * + Git"). The identity/commit/version/operation/timestamp fields come from the
 * stored property; the content hashes come from a fresh Git/re-render/remote
 * derivation; `pageId`/`parentPageId`/`attachmentHashes` are the remote page
 * facts. The result is field-equal to what a normal sync would have recorded.
 * Pure — no I/O (E3-S4 supplies the inputs).
 */
export function rebuildLockFromConfluence(
	input: RebuildInput,
): Result<PageBinding, MarkSyncError> {
	const {
		property,
		pageVersion,
		pageId,
		parentPageId,
		hashes,
		attachmentHashes,
	} = input;
	return Result.ok({
		uuid: property.documentId,
		sourcePath: property.sourcePath,
		pageId,
		parentPageId,
		pageVersion,
		sourceCommit: property.sourceCommit,
		sourceContentHash: hashes.sourceContentHash,
		renderedBodyHash: hashes.renderedBodyHash,
		remoteBodyHash: hashes.remoteBodyHash,
		attachmentHashes,
		operationId: property.operationId,
		synchronizedAt: property.synchronizedAt,
		toolVersion: property.toolVersion,
	});
}
