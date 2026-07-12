// 409 conflict decision policy (ADR-0006 C-5, GH-24 F-3).

import type { MarkSyncError } from "#domain/errors";
import type { SyncState } from "#domain/state/sync-state";

/** Decision for a 409 conflict after re-fetch. */
export type Decision = "reapply" | "block";

/**
 * Decide whether to reapply or block after a 409 conflict.
 * Pure mapping over the SyncState matrix (TC-409-001..005).
 *
 * @param conflict - The conflict that triggered re-fetch.
 * @param refreshedRemoteState - The SyncState after re-fetching the remote.
 * @returns "reapply" if safe to update, "block" if still conflicting.
 */
export function decideOnConflict(
	conflict: { kind: "Conflict"; pageId: string; baseVersion: number; remoteVersion: number },
	refreshedRemoteState: SyncState,
): Decision {
	// LOCAL_AHEAD or NO_CHANGE → reapply (now safe)
	if (
		refreshedRemoteState === "LOCAL_AHEAD" ||
		refreshedRemoteState === "NO_CHANGE"
	) {
		return "reapply";
	}

	// REMOTE_AHEAD or DIVERGED → block (drift)
	if (
		refreshedRemoteState === "REMOTE_AHEAD" ||
		refreshedRemoteState === "DIVERGED"
	) {
		return "block";
	}

	// REMOTE_MISSING or LOCAL_MISSING → block (not an update path)
	if (
		refreshedRemoteState === "REMOTE_MISSING" ||
		refreshedRemoteState === "LOCAL_MISSING"
	) {
		return "block";
	}

	// Exhaustive check — all SyncState values handled above
	const _exhaustive: never = refreshedRemoteState;
	throw new Error(`unhandled SyncState: ${_exhaustive}`);
}