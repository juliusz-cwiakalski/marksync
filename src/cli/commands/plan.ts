// src/cli/commands/plan.ts
//
// `marksync plan` command handler — STUB (GH-16 D-8 / F-8). Real plan logic is
// out of scope (NG-1 — it lands in MS2-E3). This stub returns a placeholder
// `CommandResult` so the framework wires end-to-end: every subcommand produces
// a valid `CommandResult` and therefore valid JSON under `--json` (AC-2).
//
// Tier rule: presentation. Imports only `#cli/output` (same tier) — no
// `#domain/*` / `#infra/*` (DEC-1 / dep-cruiser). The handler NEVER calls
// `process.exit` directly — the entrypoint does (story technical-approach
// §"Exit-code mapping centralized").

import type { CommandResult } from "#cli/output";
import { err } from "#cli/output";

/**
 * Run `marksync plan`. **Stub** — returns a placeholder error result until the
 * real plan logic lands (MS2-E3). The `INTERNAL` code → exit 99 via
 * `codeToExitCode("INTERNAL")` (set by the `err` factory — DEC-2).
 */
export function planCommand(): CommandResult<never> {
	return err("INTERNAL", "plan is not yet implemented (MS2-E3)", false);
}
