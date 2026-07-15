// Repair orchestration (ADR-0006 repair surface; crash-window recovery).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";
import { uuidV7Timestamp } from "#domain/identity/uuid";

/**
 * Stable diagnostic code set — no magic strings (DM-2, NFR-OBS-3).
 */
export const REPAIR_DIAGNOSTIC_CODES = {
	REPAIRED_STALE_LOCK: "REPAIRED_STALE_LOCK",
	REPAIRED_CRASH_WINDOW: "REPAIRED_CRASH_WINDOW",
	REPAIRED_REBUILD_FROM_REMOTE: "REPAIRED_REBUILD_FROM_REMOTE",
	SKIPPED_ALREADY_CONSISTENT: "SKIPPED_ALREADY_CONSISTENT",
	SKIPPED_ALREADY_APPLIED: "SKIPPED_ALREADY_APPLIED",
	NEEDS_HUMAN_ACTION_DIVERGED: "NEEDS_HUMAN_ACTION_DIVERGED",
	NEEDS_HUMAN_ACTION_MISSING_PROPERTY: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
	NEEDS_HUMAN_ACTION_MISSING_PAGE: "NEEDS_HUMAN_ACTION_MISSING_PAGE",
} as const;

export type RepairDiagnosticCode =
	(typeof REPAIR_DIAGNOSTIC_CODES)[keyof typeof REPAIR_DIAGNOSTIC_CODES];

/**
 * Diagnostic class — three outcomes for each item (DM-1).
 */
export type RepairDiagnosticClass =
	| "repaired"
	| "skipped"
	| "needs-human-action";

/**
 * Per-item repair result (DM-1).
 */
export interface RepairItem {
	uuid: string;
	sourcePath: string;
	diagnosticClass: RepairDiagnosticClass;
	diagnosticCode: RepairDiagnosticCode;
	humanNote: string;
}

/**
 * Repair report — returned by the repair use case (DM-1).
 */
export interface RepairReport {
	runId: string;
	dryRun: boolean;
	items: RepairItem[];
	interruptedRunDetected: boolean;
	writes: number;
}

/**
 * Repair options (dry-run by default, AC-F4-1).
 */
export interface RepairOptions {
	cwd: string;
	cacheDir: string;
	targetId: string;
	dryRun: boolean;
	stalePlanMinutes: number;
}

/**
 * Find the latest journal run ID by UUID-v7 timestamp.
 * Returns the newest by UUID-v7 timestamp; undefined if the journal dir is absent.
 * Skips non-UUID-v7 / unparseable filenames.
 */
export function findLatestJournalRunId(
	cacheDir: string,
): string | undefined {
	const journalDir = join(cacheDir, "journal");

	let entries: string[];
	try {
		entries = readdirSync(journalDir);
	} catch {
		return undefined; // Journal dir absent (journal-lost path, DEC-6)
	}
	const candidates: { runId: string; timestamp: number }[] = [];

	for (const entry of entries) {
		if (!entry.endsWith(".jsonl")) {
			continue;
		}
		const runId = entry.slice(0, -6); // Strip ".jsonl" suffix
		const timestamp = uuidV7Timestamp(runId);
		if (timestamp === undefined) {
			continue; // Skip non-UUID-v7 or unparseable
		}
		candidates.push({ runId, timestamp });
	}

	if (candidates.length === 0) {
		return undefined;
	}

	// Sort by timestamp descending and return the newest
	candidates.sort((a, b) => b.timestamp - a.timestamp);
	return candidates[0]?.runId;
}

/**
 * Run the repair orchestration — diagnose → (apply: rebuild + conditional completion).
 * Fills in during Phase 2.
 */
export async function runRepair(
	_lock: unknown,
	_git: unknown,
	_target: unknown,
	_config: unknown,
	_opts: RepairOptions,
): Promise<Result<RepairReport, MarkSyncError>> {
	return Res.err({
		kind: "RemoteUnreachable",
		cause: "runRepair not yet implemented",
	});
}