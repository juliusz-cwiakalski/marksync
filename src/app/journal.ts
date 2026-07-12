import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureCacheLayout } from "#app/cache";

/**
 * Append-only journal writer + replay reader.
 * See ADR-0006 C-3 (disposable journal).
 */

export type JournalOp = "create" | "update";

export type JournalOutcome = "success" | "failed";

export interface JournalEntry {
	ts: string;
	op: JournalOp;
	pageId: string;
	uuid: string;
	outcome: JournalOutcome;
}

export interface JournalWriter {
	append(entry: Omit<JournalEntry, "ts">): void;
}

/**
 * Open a journal writer for the given run ID.
 * Ensures the journal directory exists via ensureCacheLayout.
 * Journal IO failures throw (invariant violation — the cache dir is assumed writable).
 */
export function openJournal(
	cacheDir: string,
	runId: string,
): JournalWriter {
	const journalDir = join(cacheDir, "journal");
	ensureCacheLayout(cacheDir); // Idempotent, ensures journal/ exists

	const filePath = join(journalDir, `${runId}.jsonl`);

	return {
		append(entry: Omit<JournalEntry, "ts">): void {
			const fullEntry: JournalEntry = {
				...entry,
				ts: new Date().toISOString(),
			};
			const line = JSON.stringify(fullEntry) + "\n";
			appendFileSync(filePath, line, "utf-8");
		},
	};
}

/**
 * Replay a journal file, returning completed operations.
 * Missing file returns []; malformed lines are skipped.
 * Unreadable file throws (invariant violation — the cache dir is assumed readable).
 */
export function replayJournal(
	cacheDir: string,
	runId: string,
): JournalEntry[] {
	const journalPath = join(cacheDir, "journal", `${runId}.jsonl`);

	if (!existsSync(journalPath)) {
		return [];
	}

	const content = readFileSync(journalPath, "utf-8");
	const entries: JournalEntry[] = [];

	for (const line of content.split("\n")) {
		if (!line.trim()) continue; // Skip empty lines

		try {
			const entry = JSON.parse(line) as JournalEntry;
			entries.push(entry);
		} catch {
			// Skip malformed lines (crash tolerance)
			continue;
		}
	}

	return entries;
}