// Branch-restriction gate (ADR-0006 deployment gate). assertBranchAllowed
// confines sync to sync.allowBranches; MARKSYNC_ALLOW_BRANCHES augments the set
// for the process (feature-branch previews). Produces ForbiddenBranch.

import type { ProjectConfig } from "#domain/config/types";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

/** Parse MARKSYNC_ALLOW_BRANCHES (comma-separated; unset/empty -> none). */
function overrideBranches(): string[] {
	const raw = process.env.MARKSYNC_ALLOW_BRANCHES;
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((b) => b.length > 0);
}

/**
 * Allow `branch` if it is in `config.sync.allowBranches` OR in the
 * `MARKSYNC_ALLOW_BRANCHES` override (which augments, never replaces, the
 * configured set). On deny, the error reports the CONFIGURED allow list (not the
 * env-augmented one). E3-S6 calls this before any write.
 */
export function assertBranchAllowed(
	branch: string,
	config: ProjectConfig,
): Result<void, MarkSyncError> {
	const allowed = new Set([
		...config.sync.allowBranches,
		...overrideBranches(),
	]);
	if (allowed.has(branch)) {
		return Result.ok(undefined);
	}
	return Result.err({
		kind: "ForbiddenBranch",
		branch,
		allowed: [...config.sync.allowBranches],
	});
}
