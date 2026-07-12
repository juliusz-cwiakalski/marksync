// classify() three-way drift classifier (ADR-0006 §5.4).

import { attachmentHash } from "./hashes";
import type { ContentHash } from "./hashes";
import type { RemoteState, SharedBase, SyncState } from "./sync-state";
import { SyncStateSchema } from "./sync-state";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export interface ClassifyInput {
	local?: ContentHash;
	base: SharedBase;
	remote: RemoteState;
}

export function classify(
	input: ClassifyInput,
): Result<SyncState, MarkSyncError> {
	const { local, base, remote } = input;

	if (remote.kind === "forbidden") {
		return Result.err({
			kind: "Forbidden",
			pageId: remote.pageId,
			operation: "read",
		});
	}

	if (local === undefined) {
		return Result.ok("LOCAL_MISSING");
	}

	if (remote.kind === "missing") {
		return Result.ok("REMOTE_MISSING");
	}

	const baseAttachmentHash = attachmentHash(base.attachmentHashes);

	const localChanged =
		local.canonicalHash !== base.renderedBodyHash ||
		local.parentPageId !== base.parentPageId ||
		local.attachmentHash !== baseAttachmentHash ||
		local.title !== remote.title;

	const remoteChanged =
		remote.bodyHash !== base.renderedBodyHash ||
		(remote.parentPageId !== undefined &&
			remote.parentPageId !== base.parentPageId);

	let state: SyncState;
	if (!localChanged && !remoteChanged) {
		state = "NO_CHANGE";
	} else if (localChanged && !remoteChanged) {
		state = "LOCAL_AHEAD";
	} else if (!localChanged && remoteChanged) {
		state = "REMOTE_AHEAD";
	} else {
		state = "DIVERGED";
	}

	const parsed = SyncStateSchema.safeParse(state);
	if (!parsed.success) {
		throw new Error(`Invalid sync state: ${state}`);
	}

	return Result.ok(state);
}
