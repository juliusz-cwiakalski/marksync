// src/cli/commands/init.ts
//
// `marksync init` command module (GH-15 F-5 — Phase 8.2; REWIRED for GH-16
// Phase 6 into the `CommandResult<T>` contract). A thin presentation layer over
// the application-tier `writeStarterConfig` helper.
//
// ## Rewire (GH-16 Phase 6 / Task 6.3)
//
// Previously returned `{ exitCode, message }` (the GH-15 placeholder shape).
// Now returns `CommandResult<void>` via {@link resultErrorFromAppResult}: on
// success → `ok(undefined)` (exit 0); on failure (the application Result's
// `ConfigError`) → the error is routed through the app-tier mapper
// (`mapMarkSyncErrorToCommandError`, consumed inside `resultErrorFromAppResult`)
// so it gets a stable `error.code` (e.g. `INVALID_CONFIG` → exit 10) + a
// redacted `message` (DEC-5). The overwrite-refusal behavior is preserved
// (OQ-TP-1) because `writeStarterConfig` still returns `Result.err(ConfigError)`
// when a config already exists.
//
// Tier rule: presentation imports application ONLY — NOT `#domain/*` and NOT
// `#infra/*` (typescript.md `presentation-may-not-import-domain` /
// `-infra`, enforced by dependency-cruiser). The `Result` type flows in from
// `writeStarterConfig`'s return signature; the handler uses it structurally
// without naming any domain type — the GH-15 precedent extended to
// `CommandResult`. The handler NEVER calls `process.exit` directly (the
// entrypoint does).

import { writeStarterConfig } from "#app/config-template";
import type { CommandResult } from "#cli/output";
import { resultErrorFromAppResult } from "#cli/commands/result-adapter";

/** Options accepted by the init command action. */
export interface InitCommandOptions {
	/** Working directory to initialize (defaults to process.cwd() at call time). */
	cwd?: string;
}

/**
 * Run `marksync init`: write the starter `marksync.yml` into the target
 * directory. Refuses to overwrite an existing config (OQ-TP-1) — returns a
 * `CommandResult` with `error.code: "INVALID_CONFIG"` (exit 10).
 *
 * Pure presentation: the config-writing logic lives in `#app/config-template`;
 * this handler only translates the application `Result` into a `CommandResult`
 * via {@link resultErrorFromAppResult} (which routes the error through the
 * app-tier mapper for a stable `code` + redacted `message`).
 */
export function initCommand(
	options: InitCommandOptions = {},
): CommandResult<void> {
	const dir = options.cwd ?? process.cwd();
	const result = writeStarterConfig(dir);
	return resultErrorFromAppResult(result);
}
