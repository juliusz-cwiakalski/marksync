// src/cli/commands/repair-state.ts
//
// `marksync repair-state` command handler — STUB (GH-16 D-8 / F-8). Real
// repair-state logic is out of scope (NG-1 — it lands in a later story). This
// stub returns a placeholder `CommandResult` so the framework wires end-to-end
// (AC-2).
//
// Tier rule: presentation. Imports only `#cli/output` (same tier) — no
// `#domain/*` / `#infra/*` (DEC-1 / dep-cruiser). The handler NEVER calls
// `process.exit` directly — the entrypoint does.

import type { CommandResult } from "#cli/output";
import { err } from "#cli/output";

/**
 * Run `marksync repair-state`. **Stub** — returns a placeholder error result
 * until the real repair-state logic lands. The `INTERNAL` code → exit 99 via
 * `codeToExitCode` (set by the `err` factory — DEC-2).
 */
export function repairStateCommand(): CommandResult<never> {
	return err("INTERNAL", "repair-state is not yet implemented (MS2-E3)", false);
}
