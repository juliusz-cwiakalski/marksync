// Repair orchestration (ADR-0006 repair surface; crash-window recovery).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";
import { uuidV7Timestamp } from "#domain/identity/uuid";
import type { PageBinding } from "#domain/binding/page-binding";
import type { LockFile } from "#domain/config/lock-types";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { ProjectConfig } from "#domain/config/types";
import type { MetadataProperty } from "#domain/state/reconcile";
import {
	reconcileWithProperty,
	rebuildLockFromConfluence,
} from "#domain/state/reconcile";
import { classify } from "#domain/state/classifier";
import { rawHash } from "#domain/state/hashes";
import type { SharedBase, RemoteState } from "#domain/state/sync-state";
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
 * Implements the two-stage, conditional sequencing (spec §5.1 / plan Finding 1).
 */
export async function runRepair(
	lock: LockFile,
	_git: Repository,
	target: TargetSystem,
	config: ProjectConfig,
	opts: RepairOptions,
): Promise<Result<RepairReport, MarkSyncError>> {
	const items: RepairItem[] = [];
	let interruptedRunDetected = false;
	let writes = 0;

	// Clone the lock for mutation; only save on apply (dry-run guard)
	const workingLock = JSON.parse(JSON.stringify(lock)) as LockFile;

	// Find the latest journal for interrupted-apply detection
	const latestJournalRunId = findLatestJournalRunId(opts.cacheDir);
	interruptedRunDetected = latestJournalRunId !== undefined;

	const targetDocuments = workingLock.targets[opts.targetId]?.documents ?? {};

	// Track bindings to rebuild (Stage 1: rebuild + atomic save)
	const rebuilds: Array<{
		binding: PageBinding;
		property: MetadataProperty;
		pageVersion: number;
		diagnosticCode: RepairDiagnosticCode;
	}> = [];

	// Track crash-window candidates (scenario 2: journal ahead of lock)
	const crashWindowCandidates: Set<string> = new Set();

	// If journal exists, replay it to identify crash-window candidates
	if (latestJournalRunId) {
		const journal = replayJournal(opts.cacheDir, latestJournalRunId);
		for (const entry of journal) {
			if (entry.outcome === "success") {
				const existingBinding = Object.values(targetDocuments).find(
					(b) => b.uuid === entry.uuid,
				);
				// If journaled success not in lock, it's a crash-window candidate
				if (!existingBinding) {
					crashWindowCandidates.add(entry.uuid);
				}
			}
		}
	}

	// Stage 1: Diagnose every binding
	for (const [uuid, binding] of Object.entries(targetDocuments)) {
		const propertyResult = await target.getProperty(
			binding.pageId,
			"marksync.metadata",
		);

		if (!propertyResult.ok) {
			items.push({
				uuid,
				sourcePath: binding.sourcePath,
				diagnosticClass: "needs-human-action",
				diagnosticCode:
					propertyResult.error.kind === "RemoteUnreachable" ||
					propertyResult.error.kind === "RateLimited"
						? "NEEDS_HUMAN_ACTION_DIVERGED"
						: "NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
				humanNote: `Failed to read marksync.metadata property: ${propertyResult.error.kind}`,
			});
			continue;
		}

		const propertyText = propertyResult.value;
		if (!propertyText) {
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
			property = JSON.parse(propertyText) as MetadataProperty;
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

		// Check if this is a crash-window candidate (journal ahead of lock)
		const isCrashWindowCandidate = crashWindowCandidates.has(uuid);

		// Reconcile with property
		const reconcileResult = reconcileWithProperty(binding, property);

		if (reconcileResult.ok) {
			// Already consistent
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
			continue;
		}

		// Dirty lock or crash-window candidate — classify before rebuilding (INV-SAFE-1)
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
			} else {
				// Transport error — propagate as top-level error
				return pageResult;
			}
			continue;
		}

		const page = pageResult.value;

		// Build SharedBase and RemoteState for classification
		const sharedBase: SharedBase = {
			uuid: binding.uuid,
			pageId: binding.pageId,
			parentPageId: binding.parentPageId,
			pageVersion: binding.pageVersion,
			renderedBodyHash: binding.renderedBodyHash,
			remoteBodyHash: binding.remoteBodyHash,
			attachmentHashes: binding.attachmentHashes,
		};

		const remoteBodyHash = rawHash(page.body ?? "");
		const remoteState: RemoteState = {
			kind: "present",
			bodyHash: remoteBodyHash,
			version: page.version,
			title: page.title,
		};

		// Classify to check for divergence (INV-SAFE-1 gate)
		const classifyResult = classify({
			base: sharedBase,
			remote: remoteState,
		});

		if (!classifyResult.ok) {
			return classifyResult; // Transport error
		}

		const syncState = classifyResult.value;

		// Check if remote diverged or ahead — stop, don't rebuild
		if (syncState === "REMOTE_AHEAD" || syncState === "DIVERGED") {
			items.push({
				uuid,
				sourcePath: binding.sourcePath,
				diagnosticClass: "needs-human-action",
				diagnosticCode: "NEEDS_HUMAN_ACTION_DIVERGED",
				humanNote: `Remote page has ${syncState === "REMOTE_AHEAD" ? "remote changes" : "diverged"} — manual resolution required`,
			});
			continue;
		}

		// Safe to rebuild (NO_CHANGE or LOCAL_AHEAD)
		const diagnosticCode: RepairDiagnosticCode = isCrashWindowCandidate
			? "REPAIRED_CRASH_WINDOW"
			: "REPAIRED_STALE_LOCK";

		rebuilds.push({
			binding,
			property,
			pageVersion: page.version,
			diagnosticCode,
		});

	// Handle journal-lost fallback: rebuild from lock + Confluence
	if (
		interruptedRunDetected === false &&
		Object.keys(targetDocuments).length === 0
	) {
		const targetConfig = config.targets[opts.targetId];
		if (!targetConfig) {
			return Res.err({
				kind: "RemoteUnreachable",
				cause: `Target ${opts.targetId} not found in config`,
			});
		}

		// Lock is empty — discover pages via search (R1, DEC-6)
		const searchResult = await target.searchPages(
			`type=page and space=${targetConfig.spaceKey}`,
		);

		if (!searchResult.ok) {
			return searchResult; // Transport error
		}

		for (const pageRef of searchResult.value) {
			const propertyResult = await target.getProperty(
				pageRef.id,
				"marksync.metadata",
			);

			if (!propertyResult.ok || !propertyResult.value) {
				continue; // Skip pages without property
			}

			try {
				const property = JSON.parse(
					propertyResult.value,
				) as MetadataProperty;

				const pageResult = await target.getPage(pageRef.id);
				if (!pageResult.ok) {
					continue; // Skip missing pages
				}

				const page = pageResult.value;
				items.push({
					uuid: property.documentId,
					sourcePath: property.sourcePath,
					diagnosticClass: "repaired",
					diagnosticCode: "REPAIRED_REBUILD_FROM_REMOTE",
					humanNote: "Rebuilt from Confluence property + Git (journal-lost + lock-gone fallback)",
				});

				// Add to rebuilds
				rebuilds.push({
					binding: null as unknown as PageBinding, // Will be created
					property,
					pageVersion: page.version,
					diagnosticCode: "REPAIRED_REBUILD_FROM_REMOTE",
				});
			} catch {
				continue; // Skip parse errors
			}
		}
	}

	// Dry-run guard (NFR-OBS-5)
	if (!opts.dryRun) {
		// Stage 1: Apply rebuilds + atomic lock save
		for (const rebuild of rebuilds) {
			const { binding, property, pageVersion } = rebuild;

			// For crash-window or stale-lock rebuilds, use existing binding
			if (binding) {
				const pageResult2 = await target.getPage(binding.pageId);
				if (!pageResult2.ok) {
					return pageResult2;
				}
				const page2 = pageResult2.value;

				const rebuildResult = rebuildLockFromConfluence({
					property,
					pageVersion,
					pageId: binding.pageId,
					parentPageId: binding.parentPageId,
					hashes: {
						sourceContentHash: property.sourceContentHash,
						renderedBodyHash: property.renderedBodyHash,
						remoteBodyHash: rawHash(page2.body ?? ""),
					},
					attachmentHashes: binding.attachmentHashes,
				});

				if (!rebuildResult.ok) {
					return rebuildResult;
				}

				// Update the working lock
				const targetObj = workingLock.targets[opts.targetId];
				if (targetObj) {
					targetObj.documents[binding.uuid] = rebuildResult.value;
				}
			}
		}

		// Atomic lock save after all rebuilds
		const saveResult = saveLock(opts.cwd, workingLock);
		if (!saveResult.ok) {
			return saveResult;
		}

		// Stage 2: Complete remaining docs (scenario 1, post-transaction interruption)
		if (interruptedRunDetected && latestJournalRunId) {
			const planResult = await computePlan(
				config,
				workingLock,
				_git,
				target,
			);

			if (!planResult.ok) {
				return planResult;
			}

			const applyResult = await applyPlan(
				planResult.value,
				target,
				workingLock,
				{
					cwd: opts.cwd,
					cacheDir: opts.cacheDir,
					targetId: opts.targetId,
					stalePlanMinutes: opts.stalePlanMinutes,
				},
			);

			if (!applyResult.ok) {
				return applyResult;
			}

			writes = applyResult.value.writes;

			// Append RepairItems per applyPlan result
			for (const entry of applyResult.value.results) {
				let diagnosticClass: RepairDiagnosticClass;
				let diagnosticCode: RepairDiagnosticCode;

				if (entry.outcome === "created" || entry.outcome === "updated") {
					diagnosticClass = "repaired";
					diagnosticCode = "REPAIRED_REBUILD_FROM_REMOTE";
				} else if (
					entry.outcome === "noop" ||
					entry.outcome === "skipped"
				) {
					diagnosticClass = "skipped";
					diagnosticCode = "SKIPPED_ALREADY_APPLIED";
				} else {
					// blocked
					diagnosticClass = "needs-human-action";
					diagnosticCode = "NEEDS_HUMAN_ACTION_DIVERGED";
				}

				items.push({
					uuid: entry.uuid,
					sourcePath: targetDocuments[entry.uuid]?.sourcePath ?? "unknown",
					diagnosticClass,
					diagnosticCode,
					humanNote: `Completed via applyPlan (${entry.outcome})`,
				});
			}
		}
		}
	}

	// Assemble the final report
	const report: RepairReport = {
		runId: crypto.randomUUID(),
		dryRun: opts.dryRun,
		items,
		interruptedRunDetected,
		writes,
	};

	return Res.ok(report);
}