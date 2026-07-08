// src/cli/commands/result-adapter.ts
//
// `resultErrorFromAppResult<T>` — the presentation-tier adapter that wraps a
// domain `Result<T, MarkSyncError>` into a `CommandResult<T>` (GH-16 Phase 6 /
// Phase-5 deferral). It is the bridge between the application-tier error mapper
// and the presentation `CommandResult` envelope.
//
// ## Tier placement (justified deviation from the task's parenthetical)
//
// The task suggested placing this in `src/app/` (alongside
// `cli-error-map.ts`). It is placed HERE in the presentation tier instead
// because it PRODUCES a `CommandResult<T>` — a presentation type defined in
// `src/cli/output/command-result.ts` — and uses the presentation helpers
// `ok` / `err` (which compute `exitCode` via `codeToExitCode`). Placing it in
// `src/app/` would require the application tier to import the presentation
// tier, violating the architecture matrix ("Application may NOT import:
// presentation") and creating a circular dependency
// (cli → app for the mapper; app → cli for CommandResult). The presentation
// tier is the correct home for anything that constructs a `CommandResult`.
//
// ## DEC-1 compliance — never names `MarkSyncError`
//
// The input type is `AppResult<T>` (= `Result<T, MarkSyncError>`), an alias
// re-exported from `#app/cli-error-map`. This module's import statement targets
// `#app/cli-error-map` (presentation → application ✓), NEVER `#domain/errors`.
// The `MarkSyncError` type is referenced only inside the alias, defined in the
// app tier — so `src/cli/` never names a domain type and `check:boundaries`
// stays green (the GH-15 structural-type precedent extended to the full
// pipeline).

import type { AppResult } from "#app/cli-error-map";
import { mapMarkSyncErrorToCommandError } from "#app/cli-error-map";
import type { CommandResult } from "#cli/output";
import { err, ok } from "#cli/output";

/**
 * Wrap an application {@link AppResult} (a `Result<T, MarkSyncError>`) into a
 * {@link CommandResult}.
 *
 * - **ok** → `ok(value)` (exit 0; `data` present).
 * - **err** → `err(code, message, retryable)` via
 *   {@link mapMarkSyncErrorToCommandError}; the `exitCode` is computed by the
 *   `err` factory via `codeToExitCode(code)` (DEC-2).
 *
 * This is the single ergonomics path a command handler uses to turn a
 * domain/use-case `Result` into the presentation `CommandResult` the
 * `OutputService.emit` chokepoint consumes. The handler never names a domain
 * type — it passes the `Result` it received (its error type inferred via
 * structural typing) and gets back a `CommandResult`.
 *
 * @example
 * // init handler (rewired — GH-15 → GH-16):
 * const result = writeStarterConfig(dir); // Result<void, ConfigError>
 * return resultErrorFromAppResult(result); // CommandResult<void>
 */
export function resultErrorFromAppResult<T>(
	result: AppResult<T>,
): CommandResult<T> {
	if (result.ok) {
		return ok(result.value);
	}
	const e = mapMarkSyncErrorToCommandError(result.error);
	return err(e.code, e.message, e.retryable);
}
