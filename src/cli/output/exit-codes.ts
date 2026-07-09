// src/cli/output/exit-codes.ts
//
// Stable process exit codes + the stable `error.code` string → exit-code map
// (GH-16 D-5 / DEC-1 / DEC-2 / NFR-OBS-1). This module is PURE DATA: it
// imports NO tier — not `#domain/*`, not `#infra/*`, not even a sibling output
// module. Nothing at all.
//
// DEC-1 (the load-bearing architecture constraint): `MarkSyncError.kind` is
// translated to the stable `error.code` string by the APPLICATION tier
// (`src/app/cli-error-map.ts`, Phase 5 — the tier permitted to import domain).
// This presentation-tier module maps that STABLE STRING to the numeric process
// exit code, keyed only by the string. The presentation tier therefore never
// names `MarkSyncError` and `check:boundaries` stays green
// (`presentation-may-not-import-domain|-infra`). This is the GH-15 `init.ts`
// precedent extended to the full output pipeline: use domain results
// *structurally* (via the stable `error.code` string) without naming any
// domain type.
//
// DEC-2 — the full `kind → error.code → exitCode` table this module encodes:
//
//   | MarkSyncError.kind        | error.code            | exit | class              |
//   |---------------------------|-----------------------|------|--------------------|
//   | Conflict                  | CONFLICT              | 30   | conflict/drift (AC)|
//   | RemoteMissing             | REMOTE_MISSING        | 40   | remote-missing     |
//   | DuplicateUuid             | DUPLICATE_UUID        | 50   | invariant          |
//   | UnsupportedConstruct      | UNSUPPORTED_CONSTRUCT | 99 * | other/uncategorized|
//   | Forbidden                 | FORBIDDEN             | 20   | auth               |
//   | LockDirty                 | LOCK_DIRTY            | 30   | conflict/drift     |
//   | ConcurrentWrite           | CONCURRENT_WRITE      | 30   | conflict (retry)   |
//   | RenderUnavailable         | RENDER_UNAVAILABLE    | 70   | render-unavailable |
//   | StalePlan                 | STALE_PLAN            | 30   | conflict/drift     |
//   | ForbiddenBranch           | FORBIDDEN_BRANCH      |  2 * | usage              |
//   | TooLarge                  | TOO_LARGE             | 99 * | other/uncategorized|
//   | UnresolvedLink            | UNRESOLVED_LINK       | 99 * | other/uncategorized|
//   | InvalidConfig             | INVALID_CONFIG        | 10   | config             |
//   | CorruptLock               | CORRUPT_LOCK          | 10   | config             |
//   | Auth/MissingCredentials   | AUTH_MISSING_CREDENTIALS  | 20   | auth           |
//   | Auth/InvalidBaseUrl       | AUTH_INVALID_BASE_URL     | 20   | auth           |
//   | Auth/InvalidCredentials   | AUTH_INVALID_CREDENTIALS | 20   | auth           |
//   | Auth/AuthUnreachable      | AUTH_UNREACHABLE         | 20   | auth (retry)   |
//   | (no kind — flag/arg fail) | USAGE                 |  2   | usage              |
//   | (no kind — unexpected)    | INTERNAL              | 99   | internal           |
//
// The only AC-load-bearing mapping is `Conflict → CONFLICT → 30` (AC-6 /
// NFR-OBS-1). Entries marked `*` are best-fit (no dedicated exit code exists in
// the 9-class set) and may be reclassified by the maintainer without breaking
// any AC; they keep the application-tier `never`-switch exhaustive.
//
// NOTE on the spec F-5 "Typical" wording: the spec table (chg-GH-16-spec.md §5)
// groups codes by *typical* exit class as documentation (e.g. it lists
// LOCK_DIRTY/CONCURRENT_WRITE/STALE_PLAN under the exit-50 "invariant" row and
// UNSUPPORTED_CONSTRUCT under the exit-70 "render-unavailable" row). This
// `CODE_TO_EXIT` switch is the authoritative per-code mapping per DEC-2: the
// three drift-class codes (LOCK_DIRTY/CONCURRENT_WRITE/STALE_PLAN) resolve to
// exit 30 here (conflict/drift, retryable), and UNSUPPORTED_CONSTRUCT resolves
// to exit 99 (catch-all) as a `*` best-fit. Where F-5's "Typical" grouping
// differs from this switch, this switch wins (DEC-2 commitment).

/** Exit-code numeric constants — the 9 classes (spec F-5 / NFR-OBS-1). */
export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_CONFIG = 10;
export const EXIT_AUTH = 20;
export const EXIT_CONFLICT = 30;
export const EXIT_REMOTE_MISSING = 40;
export const EXIT_INVARIANT = 50;
export const EXIT_RENDER_UNAVAILABLE = 70;
export const EXIT_INTERNAL = 99;

/**
 * Map of the stable presentation-layer `error.code` strings (DEC-6) to their
 * numeric process exit codes. Keyed by the stable STRING only — no domain
 * type is named (DEC-1). Unknown codes fall back to `EXIT_INTERNAL` via
 * `codeToExitCode`.
 */
export const CODE_TO_EXIT: Record<string, number> = {
	// AC-6 load-bearing (NFR-OBS-1).
	CONFLICT: EXIT_CONFLICT,
	// remote-missing.
	REMOTE_MISSING: EXIT_REMOTE_MISSING,
	// invariant (INV-SAFE-3).
	DUPLICATE_UUID: EXIT_INVARIANT,
	// auth.
	FORBIDDEN: EXIT_AUTH,
	// drift-class (conflict/drift, retryable) — DEC-2.
	LOCK_DIRTY: EXIT_CONFLICT,
	CONCURRENT_WRITE: EXIT_CONFLICT,
	STALE_PLAN: EXIT_CONFLICT,
	// render-unavailable.
	RENDER_UNAVAILABLE: EXIT_RENDER_UNAVAILABLE,
	// config.
	INVALID_CONFIG: EXIT_CONFIG,
	// corrupt lock file (GH-19 DEC-2) — distinct recovery from a dirty lock, so
	// a distinct code; shares the config exit class (data-shape failure).
	CORRUPT_LOCK: EXIT_CONFIG,
	// auth (credential resolution + validation — GH-17 DEC-2). All four share
	// the auth exit class; only AUTH_UNREACHABLE is retryable.
	AUTH_MISSING_CREDENTIALS: EXIT_AUTH,
	AUTH_INVALID_BASE_URL: EXIT_AUTH,
	AUTH_INVALID_CREDENTIALS: EXIT_AUTH,
	AUTH_UNREACHABLE: EXIT_AUTH,
	// usage (branch-policy guard + flag/arg parse failure).
	FORBIDDEN_BRANCH: EXIT_USAGE,
	USAGE: EXIT_USAGE,
	// best-fit catch-all (DEC-2 `*` entries).
	UNSUPPORTED_CONSTRUCT: EXIT_INTERNAL,
	TOO_LARGE: EXIT_INTERNAL,
	UNRESOLVED_LINK: EXIT_INTERNAL,
	// internal (unexpected throw).
	INTERNAL: EXIT_INTERNAL,
};

/**
 * Resolve the numeric process exit code for a stable `error.code` string.
 * Unknown codes — including any future code added before this map is updated —
 * fall back to `EXIT_INTERNAL` (99) so the process always exits with a
 * documented, machine-parseable code (NFR-OBS-1). The single AC-load-bearing
 * case is `codeToExitCode("CONFLICT") === 30` (AC-6).
 */
export function codeToExitCode(code: string): number {
	return CODE_TO_EXIT[code] ?? EXIT_INTERNAL;
}
