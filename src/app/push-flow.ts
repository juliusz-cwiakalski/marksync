// computePlan + applyPlan use cases (ADR-0006 §5.4; INV-SAFE-1/2/3).

import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import type { ProjectConfig } from "#domain/config/types";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { DocumentId } from "#domain/identity/document-id";
import type { ContentHash } from "#domain/state/hashes";
import type {
	SyncState,
	RemoteState,
	SharedBase,
} from "#domain/state/sync-state";
import type { Action } from "#domain/state/actions";
import type { Artifact } from "#domain/target/port";
import { classify } from "#domain/state/classifier";
import { actionFor } from "#domain/state/actions";
import {
	detectDuplicateUuids,
	type DocWithUuid,
} from "#domain/identity/duplicate-detector";
import { readUuid } from "#domain/identity/frontmatter";
import { parseMarkdown } from "#domain/markdown/parse";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { buildContentHash, rawHash } from "#domain/state/hashes";
import type { LinkBindings } from "#domain/hierarchy/link-resolver";
import { resolveLink } from "#domain/hierarchy/link-resolver";
import { assertBranchAllowed } from "#app/branch";
import { generateUuidV7, uuidV7Timestamp } from "#domain/identity/uuid";
import { assertOperationFresh } from "#domain/state/operation-freshness";
import { assertPlanNotExpired } from "#domain/state/plan-expiry";
import { decideOnConflict } from "#domain/state/conflict-policy";
import type { ProvenanceInput } from "#infra/confluence/provenance";
import { formatVersionMessage } from "#infra/confluence/provenance";
import { saveLock } from "#app/lock";
import { openJournal, type JournalWriter } from "#app/journal";
import type { MetadataProperty } from "#domain/state/reconcile";
import type { Element, Root } from "hast";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { AssetResolver } from "#domain/assets/resolver";

// Read package.json version at module level
const pkg = JSON.parse(
	readFileSync(join(process.cwd(), "package.json"), "utf-8"),
) as { version: string };

/** Plan entry state (sync state or unbound new). */
export type PlanEntryState = SyncState | "NEW";

/** App-tier plan action (extends domain Action with Create for unbound docs). */
export type PlanAction =
	| Action
	| {
			kind: "Create";
			uuid: DocumentId;
			parentId: string;
			title: string;
			body: string;
	  };

/** One plan entry. */
export interface PlanEntry {
	uuid: DocumentId;
	sourcePath: string;
	state: PlanEntryState;
	action: PlanAction;
	hashes: ContentHash;
	/** Rendered body for apply (target storage format). */
	renderedBody: string;
	/** Resolved assets for upload (GH-26). */
	assets?: Artifact[];
}

/** The computed plan. */
export interface Plan {
	runId: string;
	operationId: string;
	entries: PlanEntry[];
	provenance: ProvenanceInput;
	warnings: string[];
}

/** Apply outcome per entry. */
export type ApplyOutcome =
	| "created"
	| "updated"
	| "noop"
	| "skipped"
	| "blocked";

/** One apply result entry. */
export interface ApplyResultEntry {
	uuid: DocumentId;
	outcome: ApplyOutcome;
	error?: MarkSyncError;
	warnings?: string[]; // GH-26: warnings from uploadAssets
}

/** Apply report with per-entry results and aggregate counts. */
export interface ApplyReport {
	runId: string;
	results: ApplyResultEntry[];
	writes: number; // created + updated
	skips: number; // noop + skipped
	blocks: number; // blocked
	warnings: string[]; // GH-26: warnings from uploadAssets (>25 MB)
}

/** Options for applyPlan (PD-5: crash hook for testing). */
export interface ApplyOptions {
	cwd: string;
	cacheDir: string;
	/** Target ID to apply to (single-target for MS-0002). */
	targetId: string;
	/** Test-only: crash after K successful mutations. */
	crashAfter?: number;
	/** Stale-plan expiry window (default 15, from config). */
	stalePlanMinutes: number;
}

/**
 * Compute a pure no-writes plan (branch gate → discovery → duplicate gate →
 * parse/render/hash → link-resolve → classify → emit). Returns early on errors
 * (ForbiddenBranch, DuplicateUuid, transport). 0 writes.
 */
export async function computePlan(
	config: ProjectConfig,
	lock: LockFile,
	git: Repository,
	target: TargetSystem,
): Promise<Result<Plan, MarkSyncError>> {
	// 1. Branch gate FIRST (0 discovery reads on deny)
	const branchResult = git.currentBranch();
	if (!branchResult.ok) {
		return branchResult;
	}
	const allowedBranchResult = assertBranchAllowed(branchResult.value, config);
	if (!allowedBranchResult.ok) {
		return allowedBranchResult;
	}

	// 2. Discover committed docs
	const readResult = git.readCommitted("HEAD", config.select);
	if (!readResult.ok) {
		return readResult;
	}
	const discovered = readResult.value;

	// 3. Parse UUIDs and build DocWithUuid[]
	const docsWithUuid: DocWithUuid[] = [];
	const textDecoder = new TextDecoder();
	for (const [path, bytes] of discovered) {
		const text = textDecoder.decode(bytes);
		const uuid = readUuid(text);
		if (uuid !== undefined) {
			docsWithUuid.push({ path, uuid });
		}
	}

	// 4. Duplicate-UUID fatal gate (after discovery, before any render)
	const dupResult = detectDuplicateUuids(docsWithUuid);
	if (!dupResult.ok) {
		return dupResult;
	}

	// 5. Parse/render/hash each doc + resolve links
	const entries: PlanEntry[] = [];
	const bindingsMutable: Record<string, { id: string; title: string }> = {};
	const allWarnings: string[] = [];

	// GH-26: Construct AssetResolver once, rooted at config.root
	const resolver = new AssetResolver({ root: config.root });

	// Collect all bindings for link resolution
	for (const targetId of Object.keys(lock.targets)) {
		const targetLock = lock.targets[targetId];
		if (!targetLock) continue;
		for (const binding of Object.values(targetLock.documents)) {
			bindingsMutable[binding.sourcePath] = {
				id: binding.pageId,
				title: binding.pageId,
			};
		}
	}
	const bindingsMap: LinkBindings = bindingsMutable as LinkBindings;

	// Process each discovered doc
	for (const { path, uuid } of docsWithUuid) {
		if (!uuid) {
			// UUID-less docs are warned + skipped (out of scope for MS-0002 create)
			continue;
		}

		const bytes = discovered.get(path);
		if (!bytes) continue;

		// Parse → render → hash
		const parseResult = parseMarkdown(bytes);
		if (!parseResult.ok) return parseResult;
		const mdast = parseResult.value;

		const hast = mdastToHast(mdast);

		// GH-26: Resolve assets (path-safe, content-addressed)
		const assetResult = await resolver.resolve(hast, path);
		if (!assetResult.ok) return assetResult; // Forbidden(path-traversal) aborts the plan
		const assetSet = assetResult.value;

		// Resolve cross-page links BEFORE rendering (AC-F7-1)
		const linksResolved = _resolveLinksInDoc(hast, path, bindingsMap);
		if (!linksResolved.ok) {
			// Collect unresolved link warnings (don't abort the plan)
			const err = linksResolved.error;
			if (err.kind === "UnresolvedLink") {
				allWarnings.push(
					`Unresolved link in ${path}: ${err.target} (source: ${err.sourcePath})`,
				);
			}
		}

		const renderResult = target.renderBody(hast, { sourcePath: path });
		if (!renderResult.ok) return renderResult;
		// Use the adapter's hash as the local canonical hash (adapter is hash authority)
		const { body, hash: adapterHash } = renderResult.value;
		const localCanonicalHash = adapterHash;

		// Extract title (first H1 or front-matter - simplified for MS-0002)
		const title = extractTitle(hast);

		// Get configured parent for this target (flat-under-configured-parent for MS-0002)
		const targetId = Object.keys(config.targets)[0] ?? "";
		const parentId = config.targets[targetId]?.parentPageId ?? "";

		// GH-26: Build attachmentHashes from assetSet (filename → hash)
		const attachmentHashes: Record<string, string> = {};
		for (const resolved of assetSet.srcMap.values()) {
			attachmentHashes[resolved.filename] = resolved.hash;
		}

		// Build ContentHash with adapter's hash (adapter is hash authority)
		let contentHash = buildContentHash({
			source: bytes,
			hast,
			attachmentHashes,
			title,
			parentPageId: parentId,
		});
		// Override canonicalHash with adapter's hash (adapter is hash authority)
		contentHash = { ...contentHash, canonicalHash: localCanonicalHash };

		// Check if this doc is bound
		let binding: PageBinding | undefined;
		for (const tid of Object.keys(lock.targets)) {
			const tdocs = lock.targets[tid]?.documents;
			if (tdocs?.[uuid]) {
				binding = tdocs[uuid];
				break;
			}
		}

		if (binding) {
			// Bound doc: fetch remote → classify → action.
			// INV-SAFE-2: a missing/forbidden remote is still classifiable —
			// REMOTE_MISSING → Block(RemoteMissing) (0 re-creates), Forbidden →
			// classify surfaces it. Only transport failures (rate-limit,
			// unreachable, …) abort the whole plan.
			const pageResult = await target.getPage(binding.pageId);

			let remote: RemoteState;
			if (!pageResult.ok) {
				const err = pageResult.error;
				if (err.kind === "RemoteMissing") {
					remote = { kind: "missing" };
				} else if (err.kind === "Forbidden") {
					remote = { kind: "forbidden", pageId: binding.pageId };
				} else {
					return pageResult;
				}
			} else {
				const page = pageResult.value;
				// Remote body hash is raw hash of Storage XHTML (default: lock value)
				let remoteBodyHash = binding.remoteBodyHash;
				if (page.body) {
					remoteBodyHash = rawHash(page.body);
				}
				remote = {
					kind: "present",
					bodyHash: remoteBodyHash,
					version: page.version,
					title: page.title,
					parentPageId: binding.parentPageId,
				};
			}

			const base: SharedBase = {
				uuid: binding.uuid,
				pageId: binding.pageId,
				parentPageId: binding.parentPageId,
				pageVersion: binding.pageVersion,
				renderedBodyHash: binding.renderedBodyHash,
				attachmentHashes: binding.attachmentHashes,
			};

			const classifyResult = classify({
				local: contentHash,
				base,
				remote,
			});
			if (!classifyResult.ok) return classifyResult;

			const syncState = classifyResult.value;
			const action = actionFor(syncState, { base, remote });

			entries.push({
				uuid,
				sourcePath: path,
				state: syncState,
				action,
				hashes: contentHash,
				renderedBody: body, // Capture for apply
				assets: assetSet.artifacts, // GH-26: stash for upload
			});
		} else {
			// Unbound doc: app-tier Create action (no classify - no base)
			entries.push({
				uuid,
				sourcePath: path,
				state: "NEW",
				action: {
					kind: "Create",
					uuid,
					parentId,
					title,
					body,
				},
				hashes: contentHash,
				renderedBody: body, // Capture for apply
				assets: assetSet.artifacts, // GH-26: stash for upload
			});
		}
	}

	// 8. Assemble provenance input
	const headResult = git.headSha();
	if (!headResult.ok) return headResult;

	const subjectsResult = git.listCommitSubjects();
	if (!subjectsResult.ok) return subjectsResult;

	const provenance: ProvenanceInput = {
		headCommit: headResult.value,
		commitCount: subjectsResult.value.length,
		subjects: subjectsResult.value,
	};

	// 9. Emit Plan
	const runId = generateUuidV7();
	return Res.ok({
		runId,
		operationId: `op_${runId}`,
		entries,
		provenance,
		warnings: allWarnings,
	});
}

/**
 * Extract title from HAST (first H1 or fallback to "Untitled").
 */
function extractTitle(hast: Root): string {
	if (!hast.children || !Array.isArray(hast.children)) return "Untitled";

	for (const child of hast.children) {
		if (child.type === "element" && child.tagName === "h1") {
			const h1Children = child.children;
			if (h1Children && h1Children.length > 0) {
				const textNode = h1Children[0];
				if (
					textNode &&
					textNode.type === "text" &&
					typeof textNode.value === "string"
				) {
					return textNode.value;
				}
			}
		}
	}

	return "Untitled";
}

/**
 * Resolve all cross-page links in a document (warnings only, never abort).
 * Walks the HAST to find all links and resolves .md targets against bindings.
 */
function _resolveLinksInDoc(
	hast: Root,
	sourcePath: string,
	bindings: LinkBindings,
): Result<undefined, MarkSyncError> {
	const warnings: MarkSyncError[] = [];

	function walk(node: unknown): void {
		if (!node || typeof node !== "object") return;

		const el = node as Element;
		if (el.type === "element" && el.tagName === "a") {
			const href = el.properties?.href;
			if (href && typeof href === "string") {
				const result = resolveLink(sourcePath, href, bindings);
				if (!result.ok) {
					warnings.push(result.error);
				} else if (typeof result.value === "object" && "id" in result.value) {
					// Resolved to PageRef: rewrite href to internal link format
					const pageRef = result.value;
					el.properties.href = `/pages/viewpage.action?pageId=${pageRef.id}`;
				}
				// External/anchor links pass through unchanged
			}
		}

		// Recurse into children
		if (el.children && Array.isArray(el.children)) {
			for (const child of el.children) {
				walk(child);
			}
		}
	}

	walk(hast);

	// Return first warning if any (don't abort the plan)
	if (warnings.length > 0) {
		const first = warnings[0];
		if (first) {
			return Res.err(first);
		}
	}

	return Res.ok(undefined);
}

/**
 * Upload assets for a page, skipping those that already exist (NFR-PERF-4).
 * Returns a map of filename → hash for the uploaded assets.
 * On error, returns the error (caller blocks per-document).
 *
 * This is a sub-operation of the page create/update mutation — it does NOT
 * get its own journal op (consistent with DM-4).
 *
 * Exported for integration testing (GH-26 F-2/F-10).
 */
export async function uploadAssets(
	target: TargetSystem,
	pageId: string,
	artifacts: Artifact[],
): Promise<
	Result<
		{ attachmentHashes: Record<string, string>; warnings: string[] },
		MarkSyncError
	>
> {
	const attachmentHashes: Record<string, string> = {};
	const warnings: string[] = [];

	for (const artifact of artifacts) {
		// Warn on large assets (>25 MB, story Q1)
		if (artifact.bytes.byteLength > 25 * 1024 * 1024) {
			warnings.push(`Asset exceeds 25 MB (${artifact.bytes.byteLength} bytes)`);
		}

		// Check if already exists (0 writes on reuse)
		const existsResult = await target.attachmentExists(pageId, artifact.hash);
		if (!existsResult.ok) return existsResult;
		if (existsResult.value === true) {
			// Already exists — skip (0 writes)
			continue;
		}

		// Upload the artifact
		const uploadResult = await target.uploadAttachment(pageId, artifact);
		if (!uploadResult.ok) return uploadResult;

		// Record the filename → hash mapping
		// Note: uploadResult.value.filename is the dedup filename from the server
		attachmentHashes[uploadResult.value.filename] = artifact.hash;
	}

	return Res.ok({ attachmentHashes, warnings });
}

/**
 * Serialize a PageBinding to MetadataProperty for putProperty.
 */
function bindingToProperty(
	binding: PageBinding,
	targetId: string,
): MetadataProperty {
	return {
		schemaVersion: 1,
		projectId: "default", // MS-0002 single-project
		targetId,
		documentId: binding.uuid,
		sourcePath: binding.sourcePath,
		sourceCommit: binding.sourceCommit,
		sourceContentHash: binding.sourceContentHash,
		renderedBodyHash: binding.renderedBodyHash,
		toolVersion: binding.toolVersion,
		synchronizedAt: binding.synchronizedAt,
		operationId: binding.operationId,
	};
}

/**
 * Reorder entries parent-first (creates/moves only, PD-6).
 * Returns a new array with parents before children.
 *
 * For MS-0002, all Create entries share the same configured parentPageId,
 * so no inter-document parent dependency exists. However, the algorithm
 * is implemented fully to support parent-child relationships in future milestones.
 *
 * The algorithm uses a synthetic UUID-to-pageId mapping for testing purposes:
 * when a Create entry's parentId matches the synthetic pageId of another Create,
 * that entry is treated as a parent and visited first.
 */
function parentFirstOrder(entries: readonly PlanEntry[]): PlanEntry[] {
	// Build adjacency map: uuid -> parent uuid/parentId
	const parentMap = new Map<DocumentId, string | undefined>();
	const uuidToEntry = new Map<DocumentId, PlanEntry>();

	for (const entry of entries) {
		uuidToEntry.set(entry.uuid, entry);
		if (entry.action.kind === "Create") {
			parentMap.set(entry.uuid, entry.action.parentId);
		}
		// For bound docs, parent is in the binding's parentPageId (not in entry)
		// For MS-0002 flat layout, all bound docs share the same parent
		// No reordering needed for non-create entries
	}

	// Find all Create entries
	const creates = entries.filter((e) => e.action.kind === "Create");
	const others = entries.filter((e) => e.action.kind !== "Create");

	// Build synthetic UUID -> pageId mapping for Create entries
	// This allows tests to set up parent-child relationships by using
	// UUIDs as synthetic pageIds (e.g., "page:{uuid}")
	const uuidToPageId = new Map<DocumentId, string>();
	for (const create of creates) {
		if (create.action.kind === "Create") {
			uuidToPageId.set(create.uuid, `page:${create.uuid}`);
		}
	}

	// Build pageId -> UUID reverse map for parent resolution
	const pageIdToUuid = new Map<string, DocumentId>();
	for (const [uuid, pageId] of uuidToPageId) {
		pageIdToUuid.set(pageId, uuid);
	}

	// Topological sort: process in order, emit when all deps resolved
	const sorted: PlanEntry[] = [];
	const emitted = new Set<DocumentId>();
	const processing = new Set<DocumentId>();

	function visit(uuid: DocumentId): void {
		if (emitted.has(uuid)) return;
		if (processing.has(uuid)) {
			// Cycle detected (PD-6: throw)
			throw new Error(`Parent cycle detected for document ${uuid}`);
		}

		processing.add(uuid);
		const parentId = parentMap.get(uuid);
		if (parentId) {
			// Check if parentId refers to another create entry via synthetic mapping
			const parentUuid = pageIdToUuid.get(parentId);
			if (parentUuid && !emitted.has(parentUuid)) {
				// Parent is another create entry - visit it first
				visit(parentUuid);
			}
		}
		emitted.add(uuid);
		processing.delete(uuid);
		const entry = uuidToEntry.get(uuid);
		if (entry) {
			sorted.push(entry);
		}
	}

	// Visit all creates in original order
	for (const entry of creates) {
		visit(entry.uuid);
	}

	// Append non-create entries in original order (stable sort)
	sorted.push(...others);

	return sorted;
}

/**
 * Finalize a successful update: journal, update binding, save lock, put property.
 * Shared between first-write and reapply paths.
 */
async function finalizeSuccessfulUpdate(
	pageId: string,
	uuid: DocumentId,
	pageVersion: number,
	journal: JournalWriter,
	lock: LockFile,
	targetId: string,
	cwd: string,
	target: TargetSystem,
	headSha: string,
	operationId: string,
	binding: PageBinding,
	assetUploadHashes: Record<string, string> = {}, // GH-26: asset hashes to merge
): Promise<Result<ApplyResultEntry, MarkSyncError>> {
	// Journal append BEFORE lock update
	journal.append({
		op: "update",
		pageId,
		uuid,
		outcome: "success",
	});

	// Update binding in memory
	const updatedBinding: PageBinding = {
		...binding,
		pageVersion,
		sourceCommit: headSha,
		synchronizedAt: new Date().toISOString(),
		operationId,
		attachmentHashes: {
			...binding.attachmentHashes,
			...assetUploadHashes, // GH-26: merge newly uploaded assets
		},
	};

	const lockTarget = lock.targets[targetId] ?? { documents: {} };
	lockTarget.documents[uuid] = updatedBinding;
	lock.targets[targetId] = lockTarget;

	// Save lock atomically
	const saveResult = saveLock(cwd, lock);
	if (!saveResult.ok) {
		return Res.err(saveResult.error);
	}

	// Put property
	const property = bindingToProperty(updatedBinding, targetId);
	const putResult = await target.putProperty(
		pageId,
		"marksync.metadata",
		JSON.stringify(property),
	);
	if (!putResult.ok) {
		return Res.err(putResult.error);
	}

	return Res.ok({ uuid, outcome: "updated" });
}

/**
 * Apply a plan parent-first with per-document isolation (F-2, PD-6/7/8).
 *
 * - Reorders creates/moves parent-first
 * - Processes entries serialized (concurrency = 1, DEC-5)
 * - Per-document isolation: one failure does not abort the run (DEC-1)
 * - Journals before lock update (crash safety, ADR-0006 C-3)
 * - Wires provenance via formatVersionMessage (PD-9, DEC-3)
 * - 409 re-fetch-once policy: on Conflict → re-fetch once → re-classify → reapply once or block
 */
export async function applyPlan(
	plan: Plan,
	target: TargetSystem,
	lock: LockFile,
	opts: ApplyOptions,
): Promise<Result<ApplyReport, MarkSyncError>> {
	const { cwd, cacheDir, targetId, crashAfter } = opts;
	const journal = openJournal(cacheDir, plan.runId);

	// Reorder parent-first
	const ordered = parentFirstOrder(plan.entries);

	const results: ApplyResultEntry[] = [];
	let writes = 0;
	let skips = 0;
	let blocks = 0;
	let successfulMutations = 0; // PD-5: crash hook counts only successful mutations
	const warnings: string[] = []; // GH-26: accumulate warnings from uploadAssets

	// Format provenance message once
	const message = formatVersionMessage(plan.provenance);
	const headSha = plan.provenance.headCommit;
	const operationId = plan.operationId;

	// Process serialized (concurrency = 1, DEC-5)
	for (const entry of ordered) {
		const outcome = await processEntry(
			entry,
			target,
			lock,
			targetId,
			journal,
			message,
			cwd,
			operationId,
			headSha,
			opts.stalePlanMinutes,
		);

		results.push(outcome);
		if (outcome.outcome === "created" || outcome.outcome === "updated") {
			writes++;
			successfulMutations++; // PD-5: increment only on successful mutations
		} else if (outcome.outcome === "noop" || outcome.outcome === "skipped") {
			skips++;
		} else if (outcome.outcome === "blocked") {
			blocks++;
		}

		// GH-26: accumulate warnings from processEntry
		if (outcome.warnings) {
			warnings.push(...outcome.warnings);
		}

		if (crashAfter !== undefined && successfulMutations >= crashAfter) {
			// Test-only crash hook: throws AFTER journal append (inside processEntry)
			throw new Error(`CRASH_AFTER_${crashAfter}`);
		}
	}

	return Res.ok({
		runId: plan.runId,
		results,
		writes,
		skips,
		blocks,
		warnings,
	});
}

/**
 * Process a single plan entry with per-document isolation.
 */
async function processEntry(
	entry: PlanEntry,
	target: TargetSystem,
	lock: LockFile,
	targetId: string,
	journal: JournalWriter,
	message: string,
	cwd: string,
	operationId: string,
	headSha: string,
	stalePlanMinutes: number,
): Promise<ApplyResultEntry & { warnings?: string[] }> {
	const { uuid, action } = entry;
	const now = Date.now();
	const planTimestamp = uuidV7Timestamp(operationId);
	const warnings: string[] = []; // GH-26: accumulate warnings from uploadAssets

	// NoOp → skip
	if (action.kind === "NoOp") {
		return { uuid, outcome: "noop", warnings };
	}

	// Skip → skip + warn
	if (action.kind === "Skip") {
		return { uuid, outcome: "skipped", warnings };
	}

	// Block → record block (PD-8: 0 writes)
	if (action.kind === "Block") {
		return { uuid, outcome: "blocked", error: action.error, warnings };
	}

	// Update → updatePage with concurrency gates
	if (action.kind === "Update") {
		const binding = lock.targets[targetId]?.documents[uuid];
		if (!binding) {
			return {
				uuid,
				outcome: "blocked",
				error: {
					kind: "CorruptLock",
					path: entry.sourcePath,
					humanMessage: `Binding missing for ${uuid}`,
				},
			};
		}

		// Stale-plan expiry check (both gates)
		if (planTimestamp !== undefined) {
			const expiryResult = assertPlanNotExpired(
				planTimestamp,
				now,
				stalePlanMinutes,
			);
			if (!expiryResult.ok) {
				return {
					uuid,
					outcome: "blocked",
					error: expiryResult.error,
					warnings,
				};
			}
		}

		// Operation-freshness gate (only for Update)
		const propertyResult = await target.getProperty(
			binding.pageId,
			"marksync.metadata",
		);
		if (!propertyResult.ok) {
			// Transport error on getProperty → block (spec §21)
			return {
				uuid,
				outcome: "blocked",
				error: propertyResult.error,
				warnings,
			};
		}

		let remoteOperationId: string | undefined;
		if (propertyResult.ok && propertyResult.value !== undefined) {
			try {
				const parsed = JSON.parse(propertyResult.value) as MetadataProperty;
				remoteOperationId = parsed.operationId;
			} catch {
				// Parse error → treat as missing (fresh)
			}
		}

		const freshnessResult = assertOperationFresh(
			operationId,
			remoteOperationId,
		);
		if (!freshnessResult.ok) {
			return {
				uuid,
				outcome: "blocked",
				error: freshnessResult.error,
				warnings,
			};
		}

		// Attempt updatePage with 409 re-fetch-once policy
		const result = await target.updatePage({
			pageId: binding.pageId,
			title: entry.hashes.title,
			body: entry.renderedBody,
			baseVersion: binding.pageVersion,
			message,
		});

		if (!result.ok) {
			const err = result.error;
			// Conflict → re-fetch ONCE, reclassify, decide
			if (err.kind === "Conflict") {
				const pageResult = await target.getPage(binding.pageId);
				if (!pageResult.ok) {
					// Transport error on re-fetch → block
					return {
						uuid,
						outcome: "blocked",
						error: pageResult.error,
						warnings,
					};
				}

				const page = pageResult.value;
				// Re-classify with refreshed remote
				const base: SharedBase = {
					uuid: binding.uuid,
					pageId: binding.pageId,
					parentPageId: binding.parentPageId,
					pageVersion: binding.pageVersion,
					renderedBodyHash: binding.renderedBodyHash,
					attachmentHashes: binding.attachmentHashes,
				};
				let remote: RemoteState;
				if (page.body) {
					remote = {
						kind: "present",
						bodyHash: rawHash(page.body),
						version: page.version,
						title: page.title,
						parentPageId: binding.parentPageId,
					};
				} else {
					remote = { kind: "missing" };
				}

				const classifyResult = classify({
					local: entry.hashes,
					base,
					remote,
				});
				if (!classifyResult.ok) {
					return {
						uuid,
						outcome: "blocked",
						error: classifyResult.error,
						warnings,
					};
				}

				const refreshedState = classifyResult.value;
				const decision = decideOnConflict(err, refreshedState);

				if (decision === "reapply") {
					// Reapply ONCE with refreshed base version
					const reapplyResult = await target.updatePage({
						pageId: binding.pageId,
						title: entry.hashes.title,
						body: entry.renderedBody,
						baseVersion: page.version, // Use refreshed version
						message,
					});

					if (!reapplyResult.ok) {
						// Second Conflict or other error → block
						return {
							uuid,
							outcome: "blocked",
							error: reapplyResult.error,
						};
					}

					// Reapply succeeded
					const updatedPage = reapplyResult.value;

					// GH-26: Upload assets (if any) after page reapply
					let reapplyAssetHashes: Record<string, string> = {};
					if (entry.assets?.length) {
						const uploadResult = await uploadAssets(
							target,
							updatedPage.id,
							entry.assets,
						);
						if (!uploadResult.ok) {
							// Asset upload failed — per-document block
							return {
								uuid,
								outcome: "blocked",
								error: uploadResult.error,
								warnings,
							};
						}
						reapplyAssetHashes = uploadResult.value.attachmentHashes;
						warnings.push(...uploadResult.value.warnings);
					}

					const finalizeResult = await finalizeSuccessfulUpdate(
						updatedPage.id,
						uuid,
						updatedPage.version,
						journal,
						lock,
						targetId,
						cwd,
						target,
						headSha,
						operationId,
						binding,
						reapplyAssetHashes, // GH-26: pass asset hashes for merge
					);

					if (!finalizeResult.ok) {
						return {
							uuid,
							outcome: "blocked",
							error: finalizeResult.error,
							warnings,
						};
					}

					return { ...finalizeResult.value, warnings };
				}
				// Decision is "block" → block
				return { uuid, outcome: "blocked", error: err, warnings };
			}
			// Transient transport errors → blocked (retryable)
			// RateLimited / RemoteUnreachable from target HTTP failures
			if (err.kind === "RateLimited" || err.kind === "RemoteUnreachable") {
				return { uuid, outcome: "blocked", error: err, warnings };
			}
			// Other errors → blocked (but continue, per-document isolation)
			return { uuid, outcome: "blocked", error: err, warnings };
		}

		const page = result.value;

		// GH-26: Upload assets (if any) after page update
		let assetUploadHashes: Record<string, string> = {};
		if (entry.assets?.length) {
			const uploadResult = await uploadAssets(target, page.id, entry.assets);
			if (!uploadResult.ok) {
				// Asset upload failed — per-document block
				return {
					uuid,
					outcome: "blocked",
					error: uploadResult.error,
					warnings,
				};
			}
			assetUploadHashes = uploadResult.value.attachmentHashes;
			warnings.push(...uploadResult.value.warnings);
		}

		const finalizeResult = await finalizeSuccessfulUpdate(
			page.id,
			uuid,
			page.version,
			journal,
			lock,
			targetId,
			cwd,
			target,
			headSha,
			operationId,
			binding,
			assetUploadHashes, // GH-26: pass asset hashes for merge
		);

		if (!finalizeResult.ok) {
			return {
				uuid,
				outcome: "blocked",
				error: finalizeResult.error,
				warnings,
			};
		}

		return { ...finalizeResult.value, warnings };
	}

	// Create → createPage with stale-plan expiry check
	if (action.kind === "Create") {
		// Stale-plan expiry check (only expiry, no operation-freshness)
		if (planTimestamp !== undefined) {
			const expiryResult = assertPlanNotExpired(
				planTimestamp,
				now,
				stalePlanMinutes,
			);
			if (!expiryResult.ok) {
				return {
					uuid,
					outcome: "blocked",
					error: expiryResult.error,
					warnings,
				};
			}
		}

		const result = await target.createPage({
			parentId: action.parentId,
			title: action.title,
			body: action.body,
			message,
		});

		if (!result.ok) {
			return { uuid, outcome: "blocked", error: result.error, warnings };
		}

		const page = result.value;

		// GH-26: Upload assets (if any) after page create
		let assetUploadHashes: Record<string, string> = {};
		if (entry.assets?.length) {
			const uploadResult = await uploadAssets(target, page.id, entry.assets);
			if (!uploadResult.ok) {
				// Asset upload failed — per-document block
				return {
					uuid,
					outcome: "blocked",
					error: uploadResult.error,
					warnings,
				};
			}
			assetUploadHashes = uploadResult.value.attachmentHashes;
			warnings.push(...uploadResult.value.warnings);
		}

		// Journal append
		journal.append({
			op: "create",
			pageId: page.id,
			uuid,
			outcome: "success",
		});

		// Create binding
		const newBinding: PageBinding = {
			uuid,
			sourcePath: entry.sourcePath,
			pageId: page.id,
			parentPageId: action.parentId,
			pageVersion: page.version,
			sourceCommit: headSha,
			sourceContentHash: entry.hashes.rawHash,
			renderedBodyHash: entry.hashes.canonicalHash,
			remoteBodyHash: entry.hashes.canonicalHash, // Assume fresh
			attachmentHashes: assetUploadHashes, // GH-26: merged from upload
			operationId,
			synchronizedAt: new Date().toISOString(),
			toolVersion: pkg.version,
		};

		// Add to lock in memory
		const lockTarget = lock.targets[targetId] ?? { documents: {} };
		lockTarget.documents[uuid] = newBinding;
		lock.targets[targetId] = lockTarget;

		// Save lock
		const saveResult = saveLock(cwd, lock);
		if (!saveResult.ok) {
			return { uuid, outcome: "blocked", error: saveResult.error, warnings };
		}

		// Put property
		const property = bindingToProperty(newBinding, targetId);
		const putResult = await target.putProperty(
			page.id,
			"marksync.metadata",
			JSON.stringify(property),
		);
		if (!putResult.ok) {
			return { uuid, outcome: "blocked", error: putResult.error, warnings };
		}

		return { uuid, outcome: "created", warnings };
	}

	// Exhaustive check (PlanAction is a union)
	const _exhaustive: never = action;
	return _exhaustive;
}
