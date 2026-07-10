// ConfluenceTarget — the sole TargetSystem port implementor. Composes the
// ConfluenceClient + every surface service + the renderBody delegate (the GH-20
// renderStorage). Every op returns Result<T, MarkSyncError>.

import type { ConfluenceCredentials } from "#domain/credentials";
import type {
	Artifact,
	AttachmentRef,
	CreatePageRequest,
	MovePageRequest,
	Page,
	PageRef,
	PageRestrictions,
	RenderBodyOptions,
	RenderedBody,
	TargetSystem,
	UpdatePageRequest,
} from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";
import {
	ConfluenceClient,
	type ConfluenceClientOptions,
} from "#infra/confluence/client";
import { PageService } from "#infra/confluence/pages";
import { PropertyService } from "#infra/confluence/properties";
import { AttachmentService } from "#infra/confluence/attachments";
import { SearchService } from "#infra/confluence/search";
import { RestrictionsService } from "#infra/confluence/restrictions";
import { renderStorage } from "#infra/confluence/render/storage";

/** Options for {@link ConfluenceTarget} — passed through to the transport. */
export type ConfluenceTargetOptions = ConfluenceClientOptions;

export class ConfluenceTarget implements TargetSystem {
	private readonly pages: PageService;
	private readonly propertyService: PropertyService;
	private readonly attachments: AttachmentService;
	private readonly searchService: SearchService;
	private readonly restrictionsService: RestrictionsService;

	constructor(
		private readonly transport: ConfluenceClient,
		spaceId: string,
	) {
		this.pages = new PageService(transport, spaceId);
		this.propertyService = new PropertyService(transport);
		this.attachments = new AttachmentService(transport);
		this.searchService = new SearchService(transport);
		this.restrictionsService = new RestrictionsService(transport);
	}

	/** Convenience factory: builds the transport from credentials + options. */
	static fromCredentials(
		credentials: ConfluenceCredentials,
		spaceId: string,
		options?: ConfluenceTargetOptions,
	): ConfluenceTarget {
		return new ConfluenceTarget(
			new ConfluenceClient(credentials, options),
			spaceId,
		);
	}

	/** Exposed for tests / callers that need the raw transport. */
	getClient(): ConfluenceClient {
		return this.transport;
	}

	renderBody(
		hast: Parameters<TargetSystem["renderBody"]>[0],
		opts: RenderBodyOptions,
	): Result<RenderedBody, MarkSyncError> {
		return renderStorage(hast, opts);
	}

	getPage(id: string): Promise<Result<Page, MarkSyncError>> {
		return this.pages.get(id);
	}

	createPage(req: CreatePageRequest): Promise<Result<Page, MarkSyncError>> {
		return this.pages.create(req);
	}

	updatePage(req: UpdatePageRequest): Promise<Result<Page, MarkSyncError>> {
		return this.pages.update(req);
	}

	movePage(req: MovePageRequest): Promise<Result<Page, MarkSyncError>> {
		return this.pages.move(req);
	}

	getProperty(
		pageId: string,
		key: string,
	): Promise<Result<string | undefined, MarkSyncError>> {
		return this.propertyService.get(pageId, key);
	}

	putProperty(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>> {
		return this.propertyService.put(pageId, key, value);
	}

	uploadAttachment(
		pageId: string,
		artifact: Artifact,
	): Promise<Result<AttachmentRef, MarkSyncError>> {
		return this.attachments.upload(pageId, artifact);
	}

	attachmentExists(
		pageId: string,
		hash: string,
	): Promise<Result<boolean, MarkSyncError>> {
		return this.attachments.exists(pageId, hash);
	}

	listAttachments(
		pageId: string,
	): Promise<Result<AttachmentRef[], MarkSyncError>> {
		return this.attachments.list(pageId);
	}

	searchPages(cql: string): Promise<Result<PageRef[], MarkSyncError>> {
		return this.searchService.search(cql);
	}

	getRestrictions(
		pageId: string,
	): Promise<Result<PageRestrictions, MarkSyncError>> {
		return this.restrictionsService.get(pageId);
	}
}
