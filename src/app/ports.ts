// Application-tier factory for creating ports (Phase 7: boundary purity).

import { createShellGit } from "#infra/git/shell-git";
import { ConfluenceTarget } from "#infra/confluence/target";
import type { ConfluenceCredentials } from "#domain/credentials";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";

/**
 * Create a Repository instance for the given repository path.
 * Application-tier factory that wraps infra implementation.
 */
export function createRepository(repoPath: string): Repository {
	return createShellGit(repoPath);
}

/**
 * Create a TargetSystem instance for Confluence with given credentials and space.
 * Application-tier factory that wraps infra implementation.
 */
export function createTarget(
	credentials: ConfluenceCredentials,
	spaceId: string,
): TargetSystem {
	return ConfluenceTarget.fromCredentials(credentials, spaceId);
}
