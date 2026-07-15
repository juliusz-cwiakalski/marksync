// Repair orchestration (ADR-0006 repair surface; crash-window recovery).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";
import { uuidV7Timestamp } from "#domain/identity/uuid";
import type { LockFile } from "#domain/config/lock-types";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { ProjectConfig } from "#domain/config/types";
import type { MetadataProperty } from "#domain/state/reconcile";
import type { DocumentId } from "#domain/identity/document-id";
import {
	reconcileWithProperty,
	rebuildLockFromConfluence,
} from "#domain/state/reconcile";
import { rawHash } from "#domain/state/hashes";
import { replayJournal } from "#app/journal";
import { saveLock } from "#app/lock";
import { computePlan, applyPlan } from "#app/push-flow";

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
export function findLatestJournalRunId(cacheDir: string): string | undefined {
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
 * Two-stage, conditional sequencing (spec §5.1 / plan Finding 1). The committed
 * `lock` is mutated only on `--apply` (0 writes + untouched on dry-run, NFR-OBS-5).
 */
export async function runRepair(
	lock: LockFile,
	git: Repository,
	target: TargetSystem,
	config: ProjectConfig,
	opts: RepairOptions,
): Promise<Result<RepairReport, MarkSyncError>> {
	const items: RepairItem[] = [];
	let writes = 0;

	const latestJournalRunId = findLatestJournalRunId(opts.cacheDir);
	const interruptedRunDetected = latestJournalRunId !== undefined;
	const targetDocuments = lock.targets[opts.targetId]?.documents ?? {};

	// Scenario 2: journaled "success" ops not yet reflected in the committed lock.
	const crashWindowCandidates = new Map<string, string>(); // uuid -> pageId
	if (latestJournalRunId) {
		for (const entry of replayJournal(opts.cacheDir, latestJournalRunId)) {
			if (
				entry.outcome === "success" &&
				!targetDocuments[entry.uuid as DocumentId]
			) {
				crashWindowCandidates.set(entry.uuid, entry.pageId);
			}
		}
	}

	const rebuilds: Array<{
		uuid: string;
		property: MetadataProperty;
		pageVersion: number;
		pageId: string;
		parentPageId: string;
		attachmentHashes: Record<string, string>;
		remoteBodyHash: string;
	}> = [];

	if (!latestJournalRunId && Object.keys(targetDocuments).length === 0) {
		// Journal-lost + lock-gone: rebuild from Confluence + Git via search (DEC-6 / R1).
		// Note: Divergence check NOT added here because we lack a reliable signal:
		// property.renderedBodyHash is pre-normalization (what we sent), page.body is
		// post-normalization (what Confluence stored). Confluence normalization can
		// cause false positives. This is a last-resort fallback; next sync will catch
		// genuine drift. (See ADR-0005, push-flow fetch-back pattern.)
		const targetConfig = config.targets[opts.targetId];
		if (!targetConfig) {
			return Res.err({
				kind: "RemoteUnreachable",
				cause: `Target ${opts.targetId} not found in config`,
			});
		}

		const searchResult = await target.searchPages(
			`type=page and space=${targetConfig.spaceKey}`,
		);
		if (!searchResult.ok) {
			return searchResult;
		}

		for (const pageRef of searchResult.value) {
			const propertyResult = await target.getProperty(
				pageRef.id,
				"marksync.metadata",
			);
			if (!propertyResult.ok) {
				return propertyResult;
			}
			if (!propertyResult.value) {
				continue; // Skip pages without the marksync property
			}
			let property: MetadataProperty;
			try {
				property = JSON.parse(propertyResult.value) as MetadataProperty;
			} catch {
				continue;
			}

			const pageResult = await target.getPage(pageRef.id);
			if (!pageResult.ok) {
				if (pageResult.error.kind === "RemoteMissing") {
					continue;
				}
				return pageResult;
			}
			const page = pageResult.value;

			items.push({
				uuid: property.documentId,
				sourcePath: property.sourcePath,
				diagnosticClass: "repaired",
				diagnosticCode: "REPAIRED_REBUILD_FROM_REMOTE",
				humanNote:
					"Rebuilt from Confluence property + Git (journal-lost + lock-gone fallback)",
			});
			rebuilds.push({
				uuid: property.documentId,
				property,
				pageVersion: page.version,
				pageId: pageRef.id,
				parentPageId: targetConfig.parentPageId,
				attachmentHashes: {},
				remoteBodyHash: rawHash(page.body ?? ""),
			});
		}
	} else {
		// Stage 1: diagnose every committed binding (F-1, INV-SAFE-1/2).
		for (const [uuid, binding] of Object.entries(targetDocuments)) {
			// Page first — a missing page is the decisive signal (INV-SAFE-2).
			const pageResult = await target.getPage(binding.pageId);
			if (!pageResult.ok) {
				if (pageResult.error.kind === "RemoteMissing") {
					items.push({
						uuid,
						sourcePath: binding.sourcePath,
						diagnosticClass: "needs-human-action",
						diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PAGE",
						humanNote: "Remote page is missing — repair cannot proceed",
					});
					continue;
				}
				return pageResult;
			}
			const page = pageResult.value;

			const propertyResult = await target.getProperty(
				binding.pageId,
				"marksync.metadata",
			);
			if (!propertyResult.ok) {
				return propertyResult;
			}
			if (!propertyResult.value) {
				items.push({
					uuid,
					sourcePath: binding.sourcePath,
					diagnosticClass: "needs-human-action",
					diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
					humanNote: "marksync.metadata property is absent",
				});
				continue;
			}

			let property: MetadataProperty;
			try {
				property = JSON.parse(propertyResult.value) as MetadataProperty;
			} catch {
				items.push({
					uuid,
					sourcePath: binding.sourcePath,
					diagnosticClass: "needs-human-action",
					diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
					humanNote: "Failed to parse marksync.metadata property as JSON",
				});
				continue;
			}

			const isCrashWindowCandidate = crashWindowCandidates.has(uuid);

			const reconcileResult = reconcileWithProperty(binding, property);
			if (reconcileResult.ok) {
				// Binding agrees with the property — verify the remote body hasn't
				// diverged since the last sync (INV-SAFE-1, F-5 / DEC-4).
				const remoteBodyHash = page.body
					? rawHash(page.body)
					: binding.remoteBodyHash;
				if (remoteBodyHash !== binding.remoteBodyHash) {
					items.push({
						uuid,
						sourcePath: binding.sourcePath,
						diagnosticClass: "needs-human-action",
						diagnosticCode: "NEEDS_HUMAN_ACTION_DIVERGED",
						humanNote: "Remote page has diverged — manual resolution required",
					});
				} else {
					items.push({
						uuid,
						sourcePath: binding.sourcePath,
						diagnosticClass: "skipped",
						diagnosticCode: isCrashWindowCandidate
							? "SKIPPED_ALREADY_APPLIED"
							: "SKIPPED_ALREADY_CONSISTENT",
						humanNote: isCrashWindowCandidate
							? "Journaled success already reflected in lock (idempotent)"
							: "Binding already consistent with remote property",
					});
				}
				continue;
			}

			// Dirty lock → verify remote hasn't diverged before rebuilding (INV-SAFE-1).
			const remoteBodyHash = page.body
				? rawHash(page.body)
				: binding.remoteBodyHash;
			if (remoteBodyHash !== binding.remoteBodyHash) {
				// Remote diverged → needs-human-action, do NOT rebuild
				items.push({
					uuid,
					sourcePath: binding.sourcePath,
					diagnosticClass: "needs-human-action",
					diagnosticCode: "NEEDS_HUMAN_ACTION_DIVERGED",
					humanNote: isCrashWindowCandidate
						? "Remote page has diverged since journaled success — manual resolution required"
						: "Remote page has diverged since last sync — manual resolution required",
				});
			} else {
				const diagnosticCode: RepairDiagnosticCode = isCrashWindowCandidate
					? "REPAIRED_CRASH_WINDOW"
					: "REPAIRED_STALE_LOCK";
				items.push({
					uuid,
					sourcePath: binding.sourcePath,
					diagnosticClass: "repaired",
					diagnosticCode,
					humanNote: isCrashWindowCandidate
						? "Rebuilt from remote (crash window closed)"
						: "Rebuilt from Confluence property",
				});
				rebuilds.push({
					uuid,
					property,
					pageVersion: page.version,
					pageId: binding.pageId,
					parentPageId: binding.parentPageId,
					attachmentHashes: binding.attachmentHashes,
					remoteBodyHash,
				});
			}
		}

		// Scenario 2: crash-window candidates whose binding is NOT in the committed
		// lock (a journal.append-before-saveLock crash). Rebuild from remote.
		if (latestJournalRunId && crashWindowCandidates.size > 0) {
			const parentPageId = config.targets[opts.targetId]?.parentPageId ?? "";
			for (const entry of replayJournal(opts.cacheDir, latestJournalRunId)) {
				if (entry.outcome !== "success") {
					continue;
				}
				const pageId = crashWindowCandidates.get(entry.uuid);
				if (pageId === undefined) {
					continue;
				}

				const propertyResult = await target.getProperty(
					pageId,
					"marksync.metadata",
				);
				if (!propertyResult.ok) {
					return propertyResult;
				}
				if (!propertyResult.value) {
					items.push({
						uuid: entry.uuid,
						sourcePath: "unknown",
						diagnosticClass: "needs-human-action",
						diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
						humanNote: "Crash window candidate: property missing or unreadable",
					});
					continue;
				}

				let property: MetadataProperty;
				try {
					property = JSON.parse(propertyResult.value) as MetadataProperty;
				} catch {
					items.push({
						uuid: entry.uuid,
						sourcePath: "unknown",
						diagnosticClass: "needs-human-action",
						diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
						humanNote: "Crash window candidate: failed to parse property",
					});
					continue;
				}

				const pageResult = await target.getPage(pageId);
				if (!pageResult.ok) {
					if (pageResult.error.kind === "RemoteMissing") {
						items.push({
							uuid: entry.uuid,
							sourcePath: property.sourcePath,
							diagnosticClass: "needs-human-action",
							diagnosticCode: "NEEDS_HUMAN_ACTION_MISSING_PAGE",
							humanNote: "Crash window candidate: remote page missing",
						});
						continue;
					}
					return pageResult;
				}
				const page = pageResult.value;

				// Verify remote hasn't diverged before rebuilding (INV-SAFE-1).
				const remoteBodyHash = rawHash(page.body ?? "");
				if (remoteBodyHash !== property.renderedBodyHash) {
					items.push({
						uuid: entry.uuid,
						sourcePath: property.sourcePath,
						diagnosticClass: "needs-human-action",
						diagnosticCode: "NEEDS_HUMAN_ACTION_DIVERGED",
						humanNote:
							"Remote page has diverged since journaled success — manual resolution required",
					});
					continue;
				}

				items.push({
					uuid: entry.uuid,
					sourcePath: property.sourcePath,
					diagnosticClass: "repaired",
					diagnosticCode: "REPAIRED_CRASH_WINDOW",
					humanNote: "Rebuilt from remote (crash window closed)",
				});
				rebuilds.push({
					uuid: entry.uuid,
					property,
					pageVersion: page.version,
					pageId,
					parentPageId,
					attachmentHashes: {},
					remoteBodyHash,
				});
			}
		}
	}

	// Apply (--apply only; dry-run leaves the lock untouched, NFR-OBS-5).
	if (!opts.dryRun) {
		// Stage 1: rebuild from remote + atomic lock save (0 page writes).
		if (rebuilds.length > 0) {
			const targetObj = lock.targets[opts.targetId] ?? { documents: {} };
			lock.targets[opts.targetId] = targetObj;
			for (const rebuild of rebuilds) {
				const rebuildResult = rebuildLockFromConfluence({
					property: rebuild.property,
					pageVersion: rebuild.pageVersion,
					pageId: rebuild.pageId,
					parentPageId: rebuild.parentPageId,
					hashes: {
						sourceContentHash: rebuild.property.sourceContentHash,
						renderedBodyHash: rebuild.property.renderedBodyHash,
						remoteBodyHash: rebuild.remoteBodyHash,
					},
					attachmentHashes: rebuild.attachmentHashes,
				});
				if (!rebuildResult.ok) {
					return rebuildResult;
				}
				targetObj.documents[rebuild.uuid as DocumentId] = rebuildResult.value;
			}
			const saveResult = saveLock(opts.cwd, lock);
			if (!saveResult.ok) {
				return saveResult;
			}
		}

		// Stage 2: complete remaining docs (scenario 1, post-transaction
		// interruption). Triggered by journal presence, not crash-window count.
		if (interruptedRunDetected && latestJournalRunId) {
			const planResult = await computePlan(config, lock, git, target);
			if (!planResult.ok) {
				return planResult;
			}

			const applyResult = await applyPlan(planResult.value, target, lock, {
				cwd: opts.cwd,
				cacheDir: opts.cacheDir,
				targetId: opts.targetId,
				stalePlanMinutes: opts.stalePlanMinutes,
			});
			if (!applyResult.ok) {
				return applyResult;
			}

			writes = applyResult.value.writes;

			for (const entry of applyResult.value.results) {
				const docs = lock.targets[opts.targetId]?.documents ?? {};
				const outcome = entry.outcome;
				const diagnosticClass: RepairDiagnosticClass =
					outcome === "created" || outcome === "updated"
						? "repaired"
						: outcome === "noop" || outcome === "skipped"
							? "skipped"
							: "needs-human-action";
				const diagnosticCode: RepairDiagnosticCode =
					outcome === "created" || outcome === "updated"
						? "REPAIRED_REBUILD_FROM_REMOTE"
						: outcome === "noop" || outcome === "skipped"
							? "SKIPPED_ALREADY_APPLIED"
							: "NEEDS_HUMAN_ACTION_DIVERGED";
				items.push({
					uuid: entry.uuid,
					sourcePath: docs[entry.uuid]?.sourcePath ?? "unknown",
					diagnosticClass,
					diagnosticCode,
					humanNote: `Completed via applyPlan (${outcome})`,
				});
			}
		}
	} else if (interruptedRunDetected && latestJournalRunId) {
		// Dry-run Stage 2: show the planned completion. computePlan is pure
		// (0 writes, no lock mutation) — it reflects what --apply would do.
		const planResult = await computePlan(config, lock, git, target);
		if (!planResult.ok) {
			return planResult;
		}
		for (const entry of planResult.value.entries) {
			const docs = lock.targets[opts.targetId]?.documents ?? {};
			const kind = entry.action.kind;
			const diagnosticClass: RepairDiagnosticClass =
				kind === "Update" || kind === "Create"
					? "repaired"
					: kind === "NoOp" || kind === "Skip"
						? "skipped"
						: "needs-human-action";
			const diagnosticCode: RepairDiagnosticCode =
				kind === "Update" || kind === "Create"
					? "REPAIRED_REBUILD_FROM_REMOTE"
					: kind === "NoOp" || kind === "Skip"
						? "SKIPPED_ALREADY_APPLIED"
						: "NEEDS_HUMAN_ACTION_DIVERGED";
			items.push({
				uuid: entry.uuid,
				sourcePath: docs[entry.uuid]?.sourcePath ?? entry.sourcePath,
				diagnosticClass,
				diagnosticCode,
				humanNote: `Planned completion via applyPlan (${kind})`,
			});
		}
	}

	return Res.ok({
		runId: crypto.randomUUID(),
		dryRun: opts.dryRun,
		items: dedupeItemsByUuid(items),
		interruptedRunDetected,
		writes,
	});
}

/**
 * Deduplicate repair items by UUID — later items override earlier ones.
 * Stage-2 applyPlan items supersede diagnose-stage items for the same UUID.
 */
function dedupeItemsByUuid(items: RepairItem[]): RepairItem[] {
	const itemMap = new Map<string, RepairItem>();
	for (const item of items) {
		itemMap.set(item.uuid, item);
	}
	return Array.from(itemMap.values());
}
