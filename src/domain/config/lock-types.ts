// LockFile — the committed shared base (ADR-0006 C-2). Mirrors lock-schema.json;
// the entry value reuses PageBinding (GH-18), keyed by its `uuid` (DocumentId).

import type { PageBinding } from "#domain/binding/page-binding";
import type { DocumentId } from "#domain/identity/document-id";

/** One target's bindings within a LockFile (DM-1). */
export interface LockTarget {
	documents: Record<DocumentId, PageBinding>;
}

/**
 * The committed lock: `version: 1` + per-target `DocumentId -> PageBinding`
 * (DM-1). Persisted as line-oriented, UUID-ordered YAML for mergeability.
 */
export interface LockFile {
	version: 1;
	targets: Record<string, LockTarget>;
}

/**
 * The lock-failure arms of `MarkSyncError` — the narrowed `Result` error
 * `loadLock`/`saveLock` declare (DM-7). Re-exported here so lock consumers can
 * import the lock types + channel from one module.
 */
export type { LockError } from "#domain/errors";
