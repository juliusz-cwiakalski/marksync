// Disposable cache layout (ADR-0006 C-3).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

/**
 * The cache subtrees: `cache/` is CI-cacheable (reconstructable artifacts);
 * `journal/` + `conflicts/` are run-specific, never cached. The whole tree is
 * gitignored (the `.gitignore` entry from GH-14 covers `.marksync/`).
 */
export const CACHE_SUBDIRS = ["cache", "journal", "conflicts"] as const;

/**
 * The cache root. `MARKSYNC_CACHE_DIR` overrides; an empty/whitespace-only value
 * is treated as unset (friendlier than resolving to "") and falls back to
 * `<cwd>/.marksync` (ADR-0006 C-3).
 */
export function resolveCacheDir(cwd: string): string {
	const override = process.env.MARKSYNC_CACHE_DIR?.trim();
	return override || join(cwd, ".marksync");
}

/**
 * Create the cache subtrees lazily and idempotently (`recursive: true` makes a
 * re-run a no-op). The committed lock lives at the repo root (`marksync.lock.yml`),
 * NEVER inside this tree — the cache holds only reconstructable artifacts
 * (ADR-0006 C-3). fs failures propagate as throws (an environment invariant: the
 * cache is disposable, so a failure to create it is a "should never happen" host
 * problem, not a typed business error).
 */
export function ensureCacheLayout(dir: string): Result<void, MarkSyncError> {
	for (const sub of CACHE_SUBDIRS) {
		mkdirSync(join(dir, sub), { recursive: true });
	}
	return Result.ok(undefined);
}
