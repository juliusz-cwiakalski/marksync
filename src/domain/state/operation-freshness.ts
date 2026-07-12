// Operation-ID freshness gate (ADR-0006 C-5).

import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { uuidV7Timestamp } from "#domain/identity/uuid";

/**
 * Assert the plan's operation-id is fresh (not older than the remote).
 * Compares UUID v7 time prefixes; remote strictly newer → StalePlan.
 * Missing/unparseable remote → fresh (first-publish base case, spec TC-CONC-003/004).
 */
export function assertOperationFresh(
	planOperationId: string,
	remoteOperationId: string | undefined,
): Result<void, MarkSyncError> {
	if (remoteOperationId === undefined) {
		// No prior operation recorded — fresh (TC-CONC-003)
		return Res.ok(undefined);
	}

	const planTs = uuidV7Timestamp(planOperationId);
	const remoteTs = uuidV7Timestamp(remoteOperationId);

	// Malformed UUIDs → cannot prove staleness, assume fresh (TC-CONC-004)
	if (planTs === undefined || remoteTs === undefined) {
		return Res.ok(undefined);
	}

	// Remote strictly newer → stale (TC-CONC-001)
	if (remoteTs > planTs) {
		return Res.err({
			kind: "StalePlan",
			operationId: planOperationId,
			expiredAt: "", // Not an expiry case; empty string
		});
	}

	// Remote older or equal → fresh (TC-CONC-002)
	return Res.ok(undefined);
}