// Domain-owned Repository port for Git operations (TDR-0003).

import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";

export interface Repository {
	/** Read committed files at a ref. Empty map if no matches. */
	readCommitted(
		ref: string,
		patterns: readonly string[],
	): Result<Map<string, Uint8Array>, MarkSyncError>;

	/** Get HEAD commit SHA. */
	headSha(): Result<string, MarkSyncError>;

	/** Get current branch name. */
	currentBranch(): Result<string, MarkSyncError>;

	/** List commit subjects for provenance (optional range). */
	listCommitSubjects(range?: string): Result<readonly string[], MarkSyncError>;
}
