// computePlan + applyPlan use cases (ADR-0006 §5.4; INV-SAFE-1/2/3).

import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";
import type { ProjectConfig } from "#domain/config/types";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { DocumentId } from "#domain/identity/document-id";
import type { ContentHash } from "#domain/state/hashes";
import type { SyncState, RemoteState, SharedBase } from "#domain/state/sync-state";
import type { Action } from "#domain/state/actions";
import { classify } from "#domain/state/classifier";
import { actionFor } from "#domain/state/actions";
import { detectDuplicateUuids, type DocWithUuid } from "#domain/identity/duplicate-detector";
import { readUuid } from "#domain/identity/frontmatter";
import { parseMarkdown } from "#domain/markdown/parse";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { canonicalHash, buildContentHash, rawHash } from "#domain/state/hashes";
import type { LinkBindings } from "#domain/hierarchy/link-resolver";
import { assertBranchAllowed } from "#app/branch";
import { generateUuidV7 } from "#domain/identity/uuid";
import type { ProvenanceInput } from "#infra/confluence/provenance";

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
}

/** The computed plan. */
export interface Plan {
	runId: string;
	operationId: string;
	entries: PlanEntry[];
	provenance: ProvenanceInput;
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
	const branchResult = await git.currentBranch();
	if (!branchResult.ok) {
		return branchResult;
	}
	const allowedBranchResult = assertBranchAllowed(branchResult.value, config);
	if (!allowedBranchResult.ok) {
		return allowedBranchResult;
	}

	// 2. Discover committed docs
	const readResult = await git.readCommitted("HEAD", config.select);
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

		// Build ContentHash with adapter's hash (adapter is hash authority)
		let contentHash = buildContentHash({
			source: bytes,
			hast,
			attachmentHashes: {},
			title,
			parentPageId: parentId,
		});
		// Override canonicalHash with adapter's hash (PD-9)
		contentHash = { ...contentHash, canonicalHash: localCanonicalHash };

		// Check if this doc is bound
		let binding: PageBinding | undefined;
		for (const tid of Object.keys(lock.targets)) {
			const tdocs = lock.targets[tid]?.documents;
			if (tdocs && tdocs[uuid]) {
				binding = tdocs[uuid];
				break;
			}
		}

		// Resolve cross-page links (warnings only, never abort)
		// No-op for MS-0002
		void bindingsMap;
		void _resolveLinksInDoc;

		if (binding) {
			// Bound doc: fetch remote → classify → action
			const pageResult = await target.getPage(binding.pageId);
			if (!pageResult.ok) {
				return pageResult;
			}
			const page = pageResult.value;

			// Build RemoteState: remote body hash is raw hash of Storage XHTML
			let remoteBodyHash = binding.remoteBodyHash; // default to lock value
			if (page.body) {
				// Compute raw hash of the remote Storage XHTML body
				// This makes local vs remote comparable when unchanged
				remoteBodyHash = rawHash(page.body);
			}

			const remote: RemoteState = {
				kind: "present",
				bodyHash: remoteBodyHash,
				version: page.version,
				title: page.title,
				parentPageId: binding.parentPageId,
			};

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
			});
		}
	}

	// 8. Assemble provenance input
	const headResult = await git.headSha();
	if (!headResult.ok) return headResult;

	const subjectsResult = await git.listCommitSubjects();
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
	});
}

/**
 * Extract title from HAST (first H1 or fallback to "Untitled").
 */
function extractTitle(hast: unknown): string {
	if (typeof hast !== "object" || hast === null) return "Untitled";
	const root = hast as Record<string, unknown>;
	const children = root.children as Array<Record<string, unknown>> | undefined;

	if (!children || !Array.isArray(children)) return "Untitled";

	for (const child of children) {
		if (child.type === "element" && child.tagName === "h1") {
			const h1Children = child.children as Array<Record<string, unknown>>;
			if (h1Children && h1Children.length > 0) {
				const textNode = h1Children[0];
				if (textNode && textNode.type === "text" && typeof textNode.value === "string") {
					return textNode.value;
				}
			}
		}
	}

	return "Untitled";
}

/**
 * Resolve all cross-page links in a document (warnings only, never abort).
 */
function _resolveLinksInDoc(
	_hast: unknown,
	_sourcePath: string,
	_bindings: LinkBindings,
	_target: TargetSystem,
): void {
	// Simplified: no-op for MS-0002
	// A real implementation would walk the HAST to find all links and resolve them
	// Unresolved links would be collected as warnings
}