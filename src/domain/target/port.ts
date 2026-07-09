// The domain-owned TargetSystem port — the adapter-agnostic contract every
// target adapter implements (no Confluence types in its surface). See
// architecture-overview §"Internal interface contracts" for the operation set.

import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";
import type { Root } from "hast";

/** A rendered target body: the bytes, the deterministic content hash, and any non-fatal warnings. */
export interface RenderedBody {
	body: string;
	hash: string;
	warnings: string[];
}

/** Options threaded onto any {@link TargetSystem.renderBody} failure (e.g. provenance). */
export interface RenderBodyOptions {
	sourcePath: string;
}

/** A target page as seen through the port: identity + version + optional body. */
export interface Page {
	id: string;
	title: string;
	version: number;
	body?: string;
}

/** Request to create a page under a parent. */
export interface CreatePageRequest {
	parentId: string;
	title: string;
	body: string;
	/** The base content hash the create is derived from (for provenance/lock wiring). */
	baseHash?: string;
	/** The commit/author message the adapter renders into the target's history line. */
	message?: string;
}

/** Request to update a page. A 409 returns `Conflict` (not a throw). */
export interface UpdatePageRequest {
	pageId: string;
	/** The current title (carried unchanged — the v2 update requires it). */
	title: string;
	body: string;
	/** The version the caller believes is current; the target rejects a stale value. */
	baseVersion: number;
	message?: string;
}

/** Request to move a page under a new parent. */
export interface MovePageRequest {
	pageId: string;
	parentId: string;
}

/** A reference to a stored attachment — keyed by the hash-derived filename. */
export interface AttachmentRef {
	id: string;
	pageId: string;
	filename: string;
	hash: string;
	version: number;
}

/** A binary artifact to upload (mermaid SVG, resolved asset). Hash is the dedup key. */
export interface Artifact {
	bytes: Uint8Array;
	mime: string;
	hash: string;
}

/** A discovered page via CQL search (id + title only — minimal). */
export interface PageRef {
	id: string;
	title: string;
}

/** Read of a page's view/edit restrictions (minimal — supports the permission-awareness story). */
export interface PageRestrictions {
	pageId: string;
	/** `true` when the page is restricted (view/edit limits exist); `false` when open. */
	restricted: boolean;
}

/**
 * The adapter-agnostic target-system contract. Every adapter (Confluence, future
 * Notion/…) implements it; domain/application call ONLY through it. Every
 * operation returns {@link Result} — expected failures (conflict, forbidden,
 * missing, rate-limit, unreachable, schema-drift) are typed errors, never throws.
 */
export interface TargetSystem {
	renderBody(
		hast: Root,
		opts: RenderBodyOptions,
	): Result<RenderedBody, MarkSyncError>;
	getPage(id: string): Promise<Result<Page, MarkSyncError>>;
	createPage(req: CreatePageRequest): Promise<Result<Page, MarkSyncError>>;
	updatePage(req: UpdatePageRequest): Promise<Result<Page, MarkSyncError>>;
	movePage(req: MovePageRequest): Promise<Result<Page, MarkSyncError>>;
	getProperty(
		pageId: string,
		key: string,
	): Promise<Result<string | undefined, MarkSyncError>>;
	putProperty(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>>;
	uploadAttachment(
		pageId: string,
		artifact: Artifact,
	): Promise<Result<AttachmentRef, MarkSyncError>>;
	attachmentExists(
		pageId: string,
		hash: string,
	): Promise<Result<boolean, MarkSyncError>>;
	listAttachments(
		pageId: string,
	): Promise<Result<AttachmentRef[], MarkSyncError>>;
	searchPages(cql: string): Promise<Result<PageRef[], MarkSyncError>>;
	getRestrictions(
		pageId: string,
	): Promise<Result<PageRestrictions, MarkSyncError>>;
}
