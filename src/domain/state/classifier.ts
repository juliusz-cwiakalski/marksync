// classify() three-way drift classifier (ADR-0006 §5.4; INV-SAFE-1/2; GH-22 F-1/F-6).

import { attachmentHash } from "./hashes";
import type { ContentHash } from "./hashes";
import type { RemoteState, SharedBase, SyncState } from "./sync-state";
import { SyncStateSchema, SyncStateValue } from "./sync-state";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

/** Input to the classify function. */
export interface ClassifyInput {
	local?: ContentHash;
	base?: SharedBase;
	remote: RemoteState;
}

/**
 * Pure three-way classifier over canonical hash + title + parent + attachment
 * facets (R1, PD-1/PD-3). Returns `Result<SyncState, MarkSyncError>` (DEC-4).
 * Invoked only for bound documents (DEC-5 — `base` present as precondition).
 */
export function classify(input: ClassifyInput): Result<SyncState, MarkSyncError> {
	const { local, base, remote } = input;

	// Q1: forbidden is an access condition, not a state
	if (remote.kind === "forbidden") {
		return Result.err({ kind: "Forbidden", pageId: remote.pageId, operation: "read" });
	}

	// DEC-1: local optional — absent ⇒ LOCAL_MISSING
	if (local === undefined) {
		return Result.ok(SyncStateValue.LOCAL_MISSING);
	}

	// remote.kind === "missing" with binding present ⇒ REMOTE_MISSING
	if (remote.kind === "missing") {
		return Result.ok(SyncStateValue.REMOTE_MISSING);
	}

	// DEC-5 precondition: base present for bound documents (classifier contract)
	if (base === undefined) {
		// This is a violation of the contract; surface as an error
		return Result.err({ kind: "Forbidden", pageId: "", operation: "read" });
	}

	// Now: local present, remote.kind === "present", base present (DEC-5 precondition)
	// Compute change booleans against base
	const baseAttachmentHash = attachmentHash(base.attachmentHashes);

	const localChanged =
		local.canonicalHash !== base.renderedBodyHash ||
		local.parentPageId !== base.parentPageId ||
		local.attachmentHash !== baseAttachmentHash ||
		local.title !== remote.title; // PD-3: title facet attributed to local

	const remoteChanged =
		remote.bodyHash !== base.renderedBodyHash ||
		(remote.parentPageId !== undefined && remote.parentPageId !== base.parentPageId);

	// Truth table for classification
	let state: SyncState;
	if (!localChanged && !remoteChanged) {
		state = SyncStateValue.NO_CHANGE;
	} else if (localChanged && !remoteChanged) {
		state = SyncStateValue.LOCAL_AHEAD;
	} else if (!localChanged && remoteChanged) {
		state = SyncStateValue.REMOTE_AHEAD;
	} else {
		state = SyncStateValue.DIVERGED;
	}

	// Validate through zod schema (UL binding rule 3 — no ad-hoc state string escapes)
	const parsed = SyncStateSchema.safeParse(state);
	if (!parsed.success) {
		// Invariant violation — should never happen
		throw new Error(`Invalid sync state: ${state}`);
	}

	return Result.ok(state);
}