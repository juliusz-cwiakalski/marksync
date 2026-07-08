// src/cli/commands/sync.ts
//
// `marksync sync` command handler — STUB (GH-16 D-8 / F-8). Real sync logic is
// out of scope (NG-1 — it lands in a later story). This stub returns a
// placeholder `CommandResult` so the framework wires end-to-end (AC-2).
//
// Tier rule: presentation. Imports only `#cli/output` (same tier) — no
// `#domain/*` / `#infra/*` (DEC-1 / dep-cruiser). The handler NEVER calls
// `process.exit` directly — the entrypoint does.

import type { CommandResult } from "#cli/output";
import { err } from "#cli/output";

/**
 * Run `marksync sync`. **Stub** — returns a placeholder error result until the
 * real sync logic lands. The `INTERNAL` code → exit 99 via `codeToExitCode`
 * (set by the `err` factory — DEC-2).
 */
export function syncCommand(): CommandResult<never> {
	return err("INTERNAL", "sync is not yet implemented (MS2-E3)", false);
}
