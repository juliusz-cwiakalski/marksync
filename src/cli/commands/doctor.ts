// src/cli/commands/doctor.ts
//
// `marksync doctor` command handler — STUB (GH-16 D-8 / F-8). Real doctor logic
// is out of scope (NG-1 — it lands in MS2-E5-S2). This stub returns a
// placeholder `CommandResult` so the framework wires end-to-end (AC-2).
//
// Tier rule: presentation. Imports only `#cli/output` (same tier) — no
// `#domain/*` / `#infra/*` (DEC-1 / dep-cruiser). The handler NEVER calls
// `process.exit` directly — the entrypoint does.

import type { CommandResult } from "#cli/output";
import { err } from "#cli/output";

/**
 * Run `marksync doctor`. **Stub** — returns a placeholder error result until the
 * real doctor logic lands (MS2-E5-S2). The `INTERNAL` code → exit 99 via
 * `codeToExitCode` (set by the `err` factory — DEC-2).
 */
export function doctorCommand(): CommandResult<never> {
	return err("INTERNAL", "doctor is not yet implemented (MS2-E5-S2)", false);
}
