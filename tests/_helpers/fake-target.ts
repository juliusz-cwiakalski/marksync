// Fake/stub TargetSystem for integration tests.

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
import { Result as Res } from "#domain/result";

/**
 * A stub TargetSystem that tracks calls for assertions.
 * Returns fixture data by default; can be configured with spies.
 */
export class FakeTarget implements TargetSystem {
	public createPageCalls: CreatePageRequest[] = [];
	public updatePageCalls: UpdatePageRequest[] = [];
	public getPageCalls: string[] = [];
	public putPropertyCalls: Array<{
		pageId: string;
		key: string;
		value: string;
	}> = [];

	// Fixture pages (pageId -> Page)
	private pages: Map<string, Page>;
	// Version counter for simulate advancement
	private versionCounter: Map<string, number>;
	// Optional write counter for idempotency tests
	private writeCounter: number = 0;
	// Stored properties (pageId::key -> value)
	private properties: Map<string, string>;
	// Configurable 409-then-refreshed sequence (pageId -> config)
	private conflictSequences: Map<
		string,
		{ afterGetPageVersion: number; reapplyOutcome: "success" | "conflict" }
	>;
	// Call tracker for reapply attempts
	private updatePageAttemptCounts: Map<string, number>;
	// GH-62: optional body normalizer (simulates Confluence XHTML normalization)
	bodyNormalizer: ((body: string) => string) | null = null;

	constructor(sharedState?: {
		pages: Map<string, Page>;
		versionCounter: Map<string, number>;
		properties: Map<string, string>;
	}) {
		// Use shared backing map if provided (NFR-REL-10)
		this.pages = sharedState?.pages ?? new Map();
		this.versionCounter = sharedState?.versionCounter ?? new Map();
		this.properties = sharedState?.properties ?? new Map();
		this.conflictSequences = new Map();
		this.updatePageAttemptCounts = new Map();
	}

	/**
	 * Add a fixture page.
	 */
	addFixture(page: Page): void {
		this.pages.set(page.id, page);
		this.versionCounter.set(page.id, page.version);
	}

	/**
	 * Get the write counter (number of createPage + updatePage calls).
	 */
	getWriteCount(): number {
		return this.writeCounter;
	}

	/**
	 * Reset the write counter to 0.
	 */
	resetWriteCounter(): void {
		this.writeCounter = 0;
	}

	/**
	 * Simulate remote advancement (increase version of a page).
	 */
	advanceVersion(pageId: string): void {
		const current = this.versionCounter.get(pageId) ?? 1;
		const newVersion = current + 1;
		this.versionCounter.set(pageId, newVersion);
		const page = this.pages.get(pageId);
		if (page) {
			page.version = newVersion;
		}
	}

	/**
	 * Test helper: set a stored property value directly.
	 */
	setMetadataProperty(pageId: string, json: string): void {
		const key = `${pageId}::marksync.metadata`;
		this.properties.set(key, json);
	}

	/**
	 * Configure a 409-then-refreshed sequence for a page.
	 *
	 * @param pageId - The page to configure
	 * @param afterGetPageVersion - The version to return after getPage (refreshed state)
	 * @param reapplyOutcome - Whether the second updatePage succeeds or conflicts again
	 */
	setConflictThenRefreshed(
		pageId: string,
		config: {
			afterGetPageVersion: number;
			reapplyOutcome: "success" | "conflict";
		},
	): void {
		this.conflictSequences.set(pageId, config);
	}

	/**
	 * Get the number of updatePage attempts for a page.
	 */
	getUpdatePageAttempts(pageId: string): number {
		return this.updatePageAttemptCounts.get(pageId) ?? 0;
	}

	renderBody(
		_hast: unknown,
		_opts: RenderBodyOptions,
	): Result<RenderedBody, MarkSyncError> {
		// Return a simple fixture render result
		return Res.ok({
			body: "<h1>Test</h1>",
			hash: "fixture-hash",
			warnings: [],
		});
	}

	getPage(id: string): Promise<Result<Page, MarkSyncError>> {
		this.getPageCalls.push(id);
		const page = this.pages.get(id);

		// Check if this is a re-fetch after conflict
		const conflictConfig = this.conflictSequences.get(id);
		if (page && conflictConfig) {
			// Return the refreshed version for 409 policy test
			const refreshedPage: Page = {
				...page,
				version: conflictConfig.afterGetPageVersion,
			};
			return Promise.resolve(Res.ok(refreshedPage));
		}

		if (!page) {
			return Promise.resolve(
				Res.err({
					kind: "RemoteMissing",
					pageId: id,
				}),
			);
		}
		return Promise.resolve(Res.ok({ ...page })); // Clone to prevent mutation
	}

	createPage(req: CreatePageRequest): Promise<Result<Page, MarkSyncError>> {
		this.createPageCalls.push(req);
		this.writeCounter++;

		// Track parent IDs for duplicate detection
		const parentMap = new Map<string, string[]>();
		for (const page of this.pages.values()) {
			const existingParents = parentMap.get(req.parentId) ?? [];
			existingParents.push(page.id);
			parentMap.set(req.parentId, existingParents);
		}

		// Check for duplicate by parent ID and title (no spaceId per port)
		const existingPage = Array.from(this.pages.values()).find(
			(p) =>
				parentMap.get(req.parentId)?.includes(p.id) && p.title === req.title,
		);

		if (existingPage) {
			return Promise.resolve(
				Res.err({
					kind: "Conflict",
					pageId: existingPage.id,
					baseVersion: 0,
					remoteVersion: existingPage.version,
				}),
			);
		}

		const newPage: Page = {
			id: `page-${Math.random().toString(36).substring(7)}`,
			title: req.title,
			version: 1,
			body: this.bodyNormalizer ? this.bodyNormalizer(req.body) : req.body,
		};
		this.pages.set(newPage.id, newPage);
		this.versionCounter.set(newPage.id, 1);
		return Promise.resolve(Res.ok(newPage));
	}

	updatePage(req: UpdatePageRequest): Promise<Result<Page, MarkSyncError>> {
		this.updatePageCalls.push(req);
		this.writeCounter++;

		// Track attempt count for testing
		const attempts = (this.updatePageAttemptCounts.get(req.pageId) ?? 0) + 1;
		this.updatePageAttemptCounts.set(req.pageId, attempts);

		const page = this.pages.get(req.pageId);
		if (!page) {
			return Promise.resolve(
				Res.err({
					kind: "RemoteMissing",
					pageId: req.pageId,
				}),
			);
		}

		// Simulate 409 Conflict if version is stale
		if (req.baseVersion !== page.version) {
			const conflictConfig = this.conflictSequences.get(req.pageId);
			// If this is a configured conflict sequence and it's the second attempt
			if (conflictConfig && attempts > 1) {
				if (conflictConfig.reapplyOutcome === "success") {
					// Reapply succeeds after re-fetch
					page.title = req.title;
					page.body = req.body;
					page.version = page.version + 1;
					this.versionCounter.set(req.pageId, page.version);
					return Promise.resolve(Res.ok({ ...page }));
				}
				// Reapply conflicts again
				return Promise.resolve(
					Res.err({
						kind: "Conflict",
						pageId: req.pageId,
						baseVersion: req.baseVersion,
						remoteVersion: page.version,
					}),
				);
			}
			// First conflict
			return Promise.resolve(
				Res.err({
					kind: "Conflict",
					pageId: req.pageId,
					baseVersion: req.baseVersion,
					remoteVersion: page.version,
				}),
			);
		}

		// Update the page
		page.title = req.title;
		page.body = this.bodyNormalizer ? this.bodyNormalizer(req.body) : req.body;
		page.version = page.version + 1;
		this.versionCounter.set(req.pageId, page.version);
		return Promise.resolve(Res.ok({ ...page })); // Clone
	}

	movePage(_req: MovePageRequest): Promise<Result<Page, MarkSyncError>> {
		// Not implemented for MS-0002
		return Promise.resolve(
			Res.err({
				kind: "Forbidden",
				pageId: "not-implemented",
				operation: "movePage",
			}),
		);
	}

	getProperty(
		pageId: string,
		key: string,
	): Promise<Result<string | undefined, MarkSyncError>> {
		// Serve stored properties (keyed by `${pageId}::${key}`)
		const storedKey = `${pageId}::${key}`;
		const value = this.properties.get(storedKey);
		return Promise.resolve(Res.ok(value));
	}

	putProperty(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>> {
		this.putPropertyCalls.push({ pageId, key, value });
		// Persist the property (keyed by `${pageId}::${key}`)
		const storedKey = `${pageId}::${key}`;
		this.properties.set(storedKey, value);
		return Promise.resolve(Res.ok(undefined));
	}

	uploadAttachment(
		_pageId: string,
		_artifact: Artifact,
	): Promise<Result<AttachmentRef, MarkSyncError>> {
		// Not implemented for MS-0002
		return Promise.resolve(
			Res.err({
				kind: "Forbidden",
				pageId: "not-implemented",
				operation: "uploadAttachment",
			}),
		);
	}

	attachmentExists(
		_pageId: string,
		_hash: string,
	): Promise<Result<boolean, MarkSyncError>> {
		return Promise.resolve(Res.ok(false));
	}

	listAttachments(
		_pageId: string,
	): Promise<Result<AttachmentRef[], MarkSyncError>> {
		return Promise.resolve(Res.ok([]));
	}

	searchPages(_cql: string): Promise<Result<PageRef[], MarkSyncError>> {
		return Promise.resolve(Res.ok([]));
	}

	getRestrictions(
		_pageId: string,
	): Promise<Result<PageRestrictions, MarkSyncError>> {
		// Port drift reconciliation: return correct PageRestrictions shape
		// ({ pageId: string; restricted: boolean }) per port.ts line 88-93
		return Promise.resolve(
			Res.ok({
				pageId: _pageId,
				restricted: false,
			}),
		);
	}
}
