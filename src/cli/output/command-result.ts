// src/cli/output/command-result.ts
//
// CommandResult<T> — the single structured envelope every command returns
// (GH-16 D-1 / spec DM-1 / ADR-0011 Alternative 3 + C-4). The TypeScript type
// uses camelCase internally; the JSON wire format uses snake_case
// (`schema_version`, `run_id`, `exit_code`, `duration_ms`, `started_at`) per
// DEC-2 / DEC-4 — the JSON renderer (Phase 4) owns that key conversion.
//
// Tier rule: presentation output. This module imports NO domain/infra tier
// (DEC-1 / dep-cruiser `presentation-may-not-import-domain|-infra`). It MAY
// import a sibling output module (`./exit-codes.ts`) — same tier, no violation.
//
// Error payload shape (DEC-5): `error: { code, message, retryable }` where
// `code` is a stable presentation-layer string (DEC-6), `message` is a stable
// + redacted human-readable string (never raw exception text / file paths /
// request bodies — applied upstream by the Redactor + the application-tier
// mapper), and `retryable` is a boolean the caller/agent can act on. Exactly
// one of `data` / `error` is the meaningful payload (DM-1).

import { codeToExitCode, EXIT_OK } from "./exit-codes";

/**
 * Pins the `CommandResult` wire schema version. Breaking changes to the JSON
 * shape require a bump (ADR-0011 C-4 — contract stability). Currently 1.
 */
export const SCHEMA_VERSION = 1 as const;

/** Optional timing observability block (camelCase TS; `duration_ms`/`started_at` in JSON). */
export interface CommandResultTiming {
	startedAt: string;
	durationMs: number;
}

/** The failure payload (DEC-5 / DM-2). `code` is a stable presentation-layer string (DEC-6). */
export interface CommandResultError {
	code: string;
	message: string;
	retryable: boolean;
}

/** Non-fatal advisory surfaced alongside success `data`. */
export interface CommandResultWarning {
	code: string;
	message: string;
}

/**
 * The structured result every command returns (spec DM-1 — authoritative shape).
 * Carries schema version, run ID, exit code, optional timing, optional
 * command-specific `data`, optional `error`, and optional `warnings`. Exactly
 * one of `data` / `error` is the meaningful payload.
 *
 * `exitCode` is carried on the result itself (F-1); the entrypoint reads it
 * for `process.exit()` (F-9).
 */
export interface CommandResult<T> {
	schemaVersion: typeof SCHEMA_VERSION;
	runId: string;
	exitCode: number;
	timing?: CommandResultTiming;
	data?: T;
	error?: CommandResultError;
	warnings?: Array<CommandResultWarning>;
}

/** Optional metadata accepted by the `ok` / `err` factories. */
export interface CommandResultMeta {
	/** Override the generated `runId` (e.g. for deterministic test fixtures). */
	runId?: string;
	/** Attach observability timing. */
	timing?: CommandResultTiming;
	/** Non-fatal advisories (success path only — `ok`). */
	warnings?: Array<CommandResultWarning>;
}

/**
 * Build a success `CommandResult<T>`: exit code 0, `schemaVersion` pinned, and
 * `runId` taken from `meta.runId` (or generated via `crypto.randomUUID()` when
 * absent so every run is correlatable — NFR-OBS-2). `timing` and `warnings`
 * are attached only when provided (exactOptionalPropertyTypes-safe).
 */
export function ok<T>(data: T, meta?: CommandResultMeta): CommandResult<T> {
	const result: CommandResult<T> = {
		schemaVersion: SCHEMA_VERSION,
		runId: meta?.runId ?? crypto.randomUUID(),
		exitCode: EXIT_OK,
		data,
	};
	if (meta?.timing) {
		result.timing = meta.timing;
	}
	if (meta?.warnings) {
		result.warnings = meta.warnings;
	}
	return result;
}

/**
 * Build an error `CommandResult<never>`.
 *
 * Exit-code choice (documented): `exitCode` is computed HERE from `code` via
 * `codeToExitCode(code)` (DEC-2) so every error result carries the exit code
 * matching its stable `error.code` — the on-result `exitCode` contract (F-1)
 * is consistent without relying on the caller to set it, and the entrypoint's
 * `process.exit(result.exitCode)` (F-9) always reads a value aligned with
 * `error.code`. `runId` is taken from `meta.runId` or generated (NFR-OBS-2).
 * No `data` is attached (error path — `CommandResult<never>`).
 */
export function err(
	code: string,
	message: string,
	retryable: boolean,
	meta?: { runId?: string },
): CommandResult<never> {
	return {
		schemaVersion: SCHEMA_VERSION,
		runId: meta?.runId ?? crypto.randomUUID(),
		exitCode: codeToExitCode(code),
		error: { code, message, retryable },
	};
}
