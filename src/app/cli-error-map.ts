// src/app/cli-error-map.ts
//
// The DEC-1 bridge: the ONLY module that translates a `MarkSyncError` into the
// stable presentation-layer error contract `{ code, message, retryable }`
// (GH-16 Phase 5 / DEC-1 / DEC-2 / DEC-5 / NFR-OBS-1).
//
// Architecture (DEC-1 — the load-bearing constraint): `MarkSyncError` lives in
// `src/domain/errors.ts`, and the presentation tier (`src/cli/`) may NOT import
// the domain tier (dep-cruiser `presentation-may-not-import-domain|-infra`).
// The translation therefore lives HERE in the APPLICATION tier, which is
// permitted to import domain. `src/cli/` consumes this module's output
// *structurally* (the `{ code, message, retryable }` shape) without ever naming
// `MarkSyncError` — the GH-15 `init.ts` precedent extended to the full pipeline.
//
// This module is the ONLY app→domain error bridge. It imports `#domain/errors`
// only; it does NOT compute the numeric `exitCode` — that is
// `codeToExitCode(code)` in the presentation tier
// (`src/cli/output/exit-codes.ts`), keyed by the stable `code` string produced
// here (DEC-1 keeps the exit-code data pure and presentation-side). The
// `ResultError` shape below is structurally identical to the presentation
// `CommandResultError` but defined here so this module does not import the
// presentation tier (application may not import presentation).
//
// `code` strings are STABLE (DEC-6): they are the keys the presentation tier's
// `CODE_TO_EXIT` map resolves and the values that appear in `--json` output
// (`error.code`). Do not rename without a contract-schema bump. DEC-2 table:
//
//   | MarkSyncError.kind        | error.code            | retryable |
//   |---------------------------|-----------------------|-----------|
//   | Conflict                  | CONFLICT              | true      | (AC-6)
//   | RemoteMissing             | REMOTE_MISSING        | true      |
//   | DuplicateUuid             | DUPLICATE_UUID        | false     |
//   | UnsupportedConstruct      | UNSUPPORTED_CONSTRUCT | false     |
//   | Forbidden                 | FORBIDDEN             | false     |
//   | LockDirty                 | LOCK_DIRTY            | true      |
//   | ConcurrentWrite           | CONCURRENT_WRITE      | true      |
//   | RenderUnavailable         | RENDER_UNAVAILABLE    | false     |
//   | StalePlan                 | STALE_PLAN            | true      |
//   | ForbiddenBranch           | FORBIDDEN_BRANCH      | false     |
//   | TooLarge                  | TOO_LARGE             | false     |
//   | UnresolvedLink            | UNRESOLVED_LINK       | false     |
//   | InvalidConfig             | INVALID_CONFIG        | false     |
//   | CorruptLock               | CORRUPT_LOCK          | false     |
//   | Auth/MissingCredentials   | AUTH_MISSING_CREDENTIALS  | false   |
//   | Auth/InvalidBaseUrl       | AUTH_INVALID_BASE_URL     | false   |
//   | Auth/InvalidCredentials   | AUTH_INVALID_CREDENTIALS | false   |
//   | Auth/AuthUnreachable      | AUTH_UNREACHABLE         | true    |
//   | RateLimited               | RATE_LIMITED            | true      | (GH-21)
//   | RemoteUnreachable         | REMOTE_UNREACHABLE      | true      | (GH-21)
//
// `message` (DEC-5 / NFR-SEC-1 / NFR-SEC-2): stable, AI-readable, and redacted
// AT THE SOURCE. It is built ONLY from structural identifier fields that belong
// to NONE of the forbidden categories — raw exception text, file paths, or
// request/response bodies. Concretely it interpolates domain identifiers
// (pageId, uuid, version numbers, operation, renderer, construct, branch,
// allowed branches, operationId, expiredAt, what, ajv-error count) and NEVER
// the fields `cause` (raw exception), `path`/`sourcePath`/`lockPath`/`paths`/
// `target` (file/link paths), or `humanMessage`/`ajvErrors[].message`+values
// (echoed data bodies). The output-time `Redactor` (Phase 3/4) is
// defense-in-depth on top of this — a token-shaped substring must not appear
// here even if a hostile value reached an error field.

import { type MarkSyncError, assertNeverMarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";

/**
 * The presentation-layer error contract produced by this mapper. Structurally
 * identical to `CommandResultError` (`src/cli/output/command-result.ts`) but
 * defined HERE so this module imports no presentation tier (DEC-1: application
 * may not import presentation). The presentation tier consumes it structurally
 * — the GH-15 precedent of flowing a shape across the boundary without naming
 * the producing/consuming tier's types.
 */
export interface ResultError {
	code: string;
	message: string;
	retryable: boolean;
}

/**
 * A {@link Result} whose error arm is a {@link MarkSyncError}. Re-exported as a
 * TYPE ALIAS so the presentation tier can reference "an application Result whose
 * failure is a domain error" WITHOUT naming {@link MarkSyncError} itself (DEC-1:
 * `src/cli/` may not import `#domain/*`). The presentation-tier adapter
 * `resultErrorFromAppResult<T>` (Phase 6) imports this alias — its import
 * statement targets `#app/cli-error-map`, never `#domain/errors`, so
 * `check:boundaries` stays green.
 */
export type AppResult<T> = Result<T, MarkSyncError>;

/**
 * Translate a {@link MarkSyncError} into the stable presentation-layer error
 * contract (DEC-1 / DEC-2 / DEC-5). Exhaustive over `err.kind`: the `default`
 * arm calls {@link assertNeverMarkSyncError}, so adding a future kind to
 * {@link MarkSyncError} without a case here is a COMPILE ERROR (NFR-3 — the
 * `typescript.md` exhaustive-checking precedent from GH-15; mirrored at the
 * definition site in `assertNeverMarkSyncError`).
 *
 * Does NOT compute the numeric exit code (DEC-1): the caller resolves
 * `code → exitCode` via `codeToExitCode` in the presentation tier. The single
 * AC-load-bearing mapping is `Conflict → { code: "CONFLICT" }` so that
 * `codeToExitCode("CONFLICT")` yields `30` (AC-6 / NFR-OBS-1).
 */
export function mapMarkSyncErrorToCommandError(
	err: MarkSyncError,
): ResultError {
	switch (err.kind) {
		case "Conflict":
			return {
				code: "CONFLICT",
				retryable: true,
				message: `conflict on confluence page ${err.pageId}: remote version ${err.remoteVersion} is ahead of base version ${err.baseVersion}`,
			};
		case "RemoteMissing":
			return {
				code: "REMOTE_MISSING",
				retryable: true,
				message: `confluence page ${err.pageId} does not exist on the remote`,
			};
		case "DuplicateUuid":
			// `paths` are file paths — omitted (DEC-5: never path).
			return {
				code: "DUPLICATE_UUID",
				retryable: false,
				message: `duplicate source uuid ${err.uuid}: the same identifier is assigned to multiple documents`,
			};
		case "UnsupportedConstruct":
			// `sourcePath` is a file path — omitted (DEC-5: never path).
			return {
				code: "UNSUPPORTED_CONSTRUCT",
				retryable: false,
				message: `unsupported markdown construct '${err.construct}'`,
			};
		case "Forbidden":
			return {
				code: "FORBIDDEN",
				retryable: false,
				message: `forbidden: operation '${err.operation}' was denied on confluence page ${err.pageId}`,
			};
		case "LockDirty":
			// `path` is a file path — omitted (DEC-5: never path).
			return {
				code: "LOCK_DIRTY",
				retryable: true,
				message:
					"lock file is dirty: tracked state has uncommitted changes; run 'marksync repair-state'",
			};
		case "ConcurrentWrite":
			// `lockPath` is a file path — omitted (DEC-5: never path).
			return {
				code: "CONCURRENT_WRITE",
				retryable: true,
				message:
					"concurrent write detected: another process modified the lock; retry the operation",
			};
		case "RenderUnavailable":
			// `cause` is raw exception text — omitted (DEC-5: never raw exception).
			return {
				code: "RENDER_UNAVAILABLE",
				retryable: false,
				message: `renderer '${err.renderer}' is unavailable`,
			};
		case "StalePlan":
			return {
				code: "STALE_PLAN",
				retryable: true,
				message: `plan '${err.operationId}' expired at ${err.expiredAt}; regenerate it`,
			};
		case "ForbiddenBranch":
			return {
				code: "FORBIDDEN_BRANCH",
				retryable: false,
				message: `git branch '${err.branch}' is not allowed; permitted branches: ${err.allowed.join(", ")}`,
			};
		case "TooLarge":
			return {
				code: "TOO_LARGE",
				retryable: false,
				message: `confluence page ${err.pageId} exceeds the remote size limit (${err.what})`,
			};
		case "UnresolvedLink":
			// `sourcePath`/`target` are file/link paths — omitted (DEC-5: never path).
			return {
				code: "UNRESOLVED_LINK",
				retryable: false,
				message: "unresolved link: a source link target could not be resolved",
			};
		case "InvalidConfig": {
			// `path`/`humanMessage`/`ajvErrors` carry file path + echoed data
			// values (request/response-body-shaped) — omitted (DEC-5: never
			// path/body). Use the structural count only; the detailed diagnostic
			// stays in the typed error for logging (which has its own redaction).
			const count = err.ajvErrors.length;
			const noun = count === 1 ? "error" : "errors";
			return {
				code: "INVALID_CONFIG",
				retryable: false,
				message: `invalid marksync.yml: ${count} validation ${noun} detected; review the configuration against the schema`,
			};
		}
		case "CorruptLock": {
			// GH-19 DEC-2 — mirrors InvalidConfig (DEC-5: never surface path or
			// humanMessage, which may echo lock content). `ajvErrors` is optional
			// (absent for a YAML parse failure), so the count is 0 in that case.
			const count = err.ajvErrors?.length ?? 0;
			if (count > 0) {
				const noun = count === 1 ? "error" : "errors";
				return {
					code: "CORRUPT_LOCK",
					retryable: false,
					message: `invalid marksync.lock.yml: ${count} validation ${noun} detected; regenerate the lock or run 'marksync repair-state'`,
				};
			}
			return {
				code: "CORRUPT_LOCK",
				retryable: false,
				message:
					"marksync.lock.yml could not be parsed; regenerate the lock or run 'marksync repair-state'",
			};
		}
		case "Auth": {
			// GH-17 DEC-2 — narrow on `authKind` (a direct property of the flat
			// Auth arm). The nested sub-switch is itself exhaustive (its own
			// `never`-check), so adding a future `authKind` is a compile error.
			// DEC-5: messages use only structural identifiers (env-var names,
			// HTTP status) — never the raw `baseUrl`, `cause`, token, or email.
			const authKind = err.authKind;
			switch (authKind) {
				case "MissingCredentials":
					return {
						code: "AUTH_MISSING_CREDENTIALS",
						retryable: false,
						message: `missing required Confluence credentials: ${err.missing.join(", ")}; set them in the environment (see .env.example)`,
					};
				case "InvalidBaseUrl":
					return {
						code: "AUTH_INVALID_BASE_URL",
						retryable: false,
						message:
							"invalid Confluence base URL: must be a valid https URL; see .env.example",
					};
				case "InvalidCredentials":
					return {
						code: "AUTH_INVALID_CREDENTIALS",
						retryable: false,
						message: `Confluence rejected the credentials (HTTP ${err.status}); check the API token and user email`,
					};
				case "AuthUnreachable":
					return {
						code: "AUTH_UNREACHABLE",
						retryable: true,
						message:
							"could not reach Confluence to validate credentials (network or rate-limit); retry later",
					};
				default: {
					const _exhaustive: never = authKind;
					throw new Error(`unhandled authKind: ${_exhaustive}`);
				}
			}
		}
		case "RateLimited":
			// DEC-9: never interpolate `retryAfterMs` — it's transport detail.
			return {
				code: "RATE_LIMITED",
				retryable: true,
				message:
					"rate-limited by Confluence after retry budget exhausted; retry later",
			};
		case "RemoteUnreachable":
			// DEC-9: never interpolate `cause` (raw transport text) or `status`.
			return {
				code: "REMOTE_UNREACHABLE",
				retryable: true,
				message:
					"could not reach Confluence (network or server error); retry later",
			};
		default:
			// NFR-3 — adding a kind without a case above is a compile error
			// (err is `never` here only when every kind is handled).
			assertNeverMarkSyncError(err);
	}
}
