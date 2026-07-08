// src/domain/errors.ts
//
// The typed domain errors — a discriminated union over every failure kind
// MarkSync surfaces. Copied VERBATIM from blueprint §2 (DEC-1 — the 12-kind
// superset; the 8-kind excerpt in typescript.md is a partial illustration),
// extended with the `InvalidConfig` config-failure kind (GH-15 DEC-3 / DM-3).
// Domain functions return these via Result<T, MarkSyncError> (never `throw` for
// expected failures); only invariant violations throw (typescript.md
// §"Error handling").
//
// Each error carries the context its handler needs (pageId, sourcePath, cause,
// …); the redaction layer strips any secret material before output.

/**
 * Plain-data entry for one ajv validation error, carried by `InvalidConfig`.
 *
 * Deliberately a domain-owned serializable shape (NOT a re-export of ajv's
 * `ErrorObject`): the domain tier imports no validator (typescript.md tier
 * rules / GH-15 NFR-3). The application-tier formatter (`src/app/config-errors.ts`)
 * maps ajv `ErrorObject[]` into this shape so config failures stay
 * serializable and dependency-free at the domain boundary.
 */
export interface ConfigAjvError {
	/** JSON pointer to the offending instance (e.g. `/sync/granularity`). */
	instancePath: string;
	/** JSON pointer to the failing schema keyword (e.g. `#/properties/sync/properties/granularity/enum`). */
	schemaPath: string;
	/** The ajv keyword that failed (`required`, `type`, `enum`, `additionalProperties`, …). */
	keyword: string;
	/** ajv's human-oriented message for this error. */
	message: string;
	/** ajv's `params` object, serialized to a plain record (`allowedValues`, `additionalProperty`, …). */
	params: Record<string, unknown>;
}

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
	| { kind: "UnresolvedLink"; sourcePath: string; target: string }
	// GH-15 DEC-3 / DM-3 — the config-failure arm. `loadConfig` narrows its
	// Result error to `ConfigError` (= `Extract<MarkSyncError, { kind:
	// "InvalidConfig" }>`). `humanMessage` is the AI-readable diagnostic
	// (field path + expected vs actual + suggested fix — NFR-2); `ajvErrors`
	// carries the structured validator output; `path` is the config file path.
	| {
			kind: "InvalidConfig";
			path: string;
			ajvErrors: ConfigAjvError[];
			humanMessage: string;
	  }
	// GH-17 DEC-2 / DM-2 — the auth-failure arm. FLAT: `authKind` and its
	// per-kind payload are siblings of `kind` (mirroring `InvalidConfig`).
	// INV-SEC-1: no sub-variant carries the raw token or raw email — only the
	// missing env-var names, the malformed `baseUrl`, the HTTP `status`, or a
	// network `cause` (internal logging only — the mapper never surfaces `cause`).
	| {
			kind: "Auth";
			authKind: "MissingCredentials";
			missing: readonly string[];
	  }
	| { kind: "Auth"; authKind: "InvalidBaseUrl"; baseUrl: string }
	| { kind: "Auth"; authKind: "InvalidCredentials"; status: number }
	| { kind: "Auth"; authKind: "AuthUnreachable"; cause: string };

/**
 * The config-failure arm of {@link MarkSyncError}. `loadConfig` declares
 * `Result<ProjectConfig, ConfigError>` (GH-15 DEC-3) — the narrowed channel
 * preserves precision at the loader boundary while the full union remains
 * available downstream.
 */
export type ConfigError = Extract<MarkSyncError, { kind: "InvalidConfig" }>;

/**
 * The auth-failure arm of {@link MarkSyncError}. The credential provider
 * declares `Result<_, AuthError>` (GH-17 DEC-2) — the narrowed channel keeps
 * the provider's failure type precise. Discriminate further on `authKind`.
 */
export type AuthError = Extract<MarkSyncError, { kind: "Auth" }>;

/**
 * Exhaustiveness proof for {@link MarkSyncError}. Switching over every `kind`
 * makes the union exhaustive at the type level: if a future kind is added to
 * {@link MarkSyncError} without extending this switch, the `default` arm's
 * `error` is no longer `never` and THIS FILE fails to compile — surfacing the
 * gap at the definition site, before any handler is written (DEC-1 / AC-F6-2;
 * the `InvalidConfig` case was added alongside the union arm in GH-15 so the
 * never-check stayed intact — NFR-3 / RSK-2).
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
		case "InvalidConfig":
		case "Auth":
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
