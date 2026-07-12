// Stale-plan expiry gate (ADR-0006 C-5).

import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";

/**
 * Assert the plan is not expired (stale).
 * If `now - planTimestamp > stalePlanMinutes * 60_000` → StalePlan.
 * Boundary semantics: at exactly the window is expired (conservative, TC-EXPIRY-001).
 */
export function assertPlanNotExpired(
	planTimestamp: number,
	now: number,
	stalePlanMinutes: number,
): Result<void, MarkSyncError> {
	const staleAt = planTimestamp + stalePlanMinutes * 60_000;
	if (now >= staleAt) {
		// At or over boundary → expired (TC-EXPIRY-001/002)
		return Res.err({
			kind: "StalePlan",
			operationId: "", // No operation-id for expiry-only case
			expiredAt: new Date(staleAt).toISOString(),
		});
	}

	// Under window → fresh (TC-EXPIRY-003)
	return Res.ok(undefined);
}