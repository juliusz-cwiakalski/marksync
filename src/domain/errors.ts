// src/domain/errors.ts
//
// The typed domain errors — a discriminated union over every failure kind
// MarkSync surfaces. Copied VERBATIM from blueprint §2 (DEC-1 — the 12-kind
// superset; the 8-kind excerpt in typescript.md is a partial illustration).
// Domain functions return these via Result<T, MarkSyncError> (never `throw` for
// expected failures); only invariant violations throw (typescript.md
// §"Error handling").
//
// Each error carries the context its handler needs (pageId, sourcePath, cause,
// …); the redaction layer strips any secret material before output.

export type MarkSyncError =
	| {
			kind: "Conflict";
			pageId: string;
			baseVersion: number;
			remoteVersion: number;
	  }
	| { kind: "RemoteMissing"; pageId: string }
	| { kind: "DuplicateUuid"; uuid: string; paths: string[] }
	| { kind: "UnsupportedConstruct"; construct: string; sourcePath: string }
	| { kind: "Forbidden"; pageId: string; operation: string }
	| { kind: "LockDirty"; path: string }
	| { kind: "ConcurrentWrite"; lockPath: string }
	| { kind: "RenderUnavailable"; renderer: string; cause: string }
	| { kind: "StalePlan"; operationId: string; expiredAt: string }
	| { kind: "ForbiddenBranch"; branch: string; allowed: string[] }
	| { kind: "TooLarge"; pageId: string; what: string }
	| { kind: "UnresolvedLink"; sourcePath: string; target: string };

/**
 * Exhaustiveness proof for {@link MarkSyncError}. Switching over every `kind`
 * makes the union exhaustive at the type level: if a future kind is added to
 * {@link MarkSyncError} without extending this switch, the `default` arm's
 * `error` is no longer `never` and THIS FILE fails to compile — surfacing the
 * gap at the definition site, before any handler is written (DEC-1 / AC-F6-2).
 *
 * The same guarantee is inherited by any handler that calls this from its
 * `default` arm (typescript.md §"Exhaustive checking"): once `error` is narrowed
 * to `never`, passing it here type-checks; an unhandled kind leaves it non-`never`
 * and the call site errors.
 */
export function assertNeverMarkSyncError(error: MarkSyncError): never {
	switch (error.kind) {
		case "Conflict":
		case "RemoteMissing":
		case "DuplicateUuid":
		case "UnsupportedConstruct":
		case "Forbidden":
		case "LockDirty":
		case "ConcurrentWrite":
		case "RenderUnavailable":
		case "StalePlan":
		case "ForbiddenBranch":
		case "TooLarge":
		case "UnresolvedLink":
			// Every kind is named above. If a new kind is added, the `default`
			// arm's `error` stops being `never` and this file won't compile.
			throw new Error(`unhandled MarkSyncError kind: ${error.kind}`);
		default: {
			// At this point `error` is `never` only when every kind is named above.
			const _exhaustive: never = error;
			throw new Error(
				`unhandled MarkSyncError: ${JSON.stringify(_exhaustive)}`,
			);
		}
	}
}
