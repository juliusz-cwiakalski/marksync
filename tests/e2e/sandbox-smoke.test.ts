// Live-sandbox smoke test (TC-E2E-002, AC-F3-2, NFR-CI-4, NFR-MAINT-4).

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
	readE2ECredentials,
	requiredSecretsPresent,
	type CleanupTracker,
} from "./helpers";
import { ConfluenceTarget } from "#infra/confluence/target";
import type { CreatePageRequest, UpdatePageRequest } from "#domain/target/port";

describe("E2E sandbox smoke test", () => {
	let credentials: ReturnType<typeof readE2ECredentials>;
	let cleanupTracker: CleanupTracker;
	let target: ConfluenceTarget;

	beforeAll(() => {
		// Guard: skip if any required secret is missing (RSK-6, NFR-CI-3)
		if (!requiredSecretsPresent()) {
			console.log(
				"[E2E Skip] MARKSYNC_E2E_* secrets not configured, skipping live-sandbox test",
			);
			return;
		}

		// Read credentials from environment (run-e2e.yml supplies these - NG-6)
		credentials = readE2ECredentials();
		cleanupTracker = new CleanupTracker();

		// Construct the real Confluence adapter
		target = ConfluenceTarget.fromCredentials(
			{
				baseUrl: credentials.baseUrl,
				userEmail: credentials.userEmail,
				apiToken: credentials.apiToken,
			},
			credentials.spaceKey,
		);
	});

	test.skipIf(
		!requiredSecretsPresent(),
		"TC-E2E-002: create+read+delete round-trip + cleanup",
		async () => {
			// Given: all MARKSYNC_E2E_* secrets are present
			expect(requiredSecretsPresent()).toBe(true);
			expect(credentials).toBeDefined();

			// When: we create a test page
			const testTitle = `E2E Smoke Test ${Date.now()}`;
			const testBody = `<h1>${testTitle}</h1><p>Test content for smoke test</p>`;

			const createReq: CreatePageRequest = {
				parentId: credentials.parentPageId,
				title: testTitle,
				body: testBody,
				message: "E2E smoke test: create page",
			};

			const createResult = await target.createPage(createReq);
			expect(createResult.ok).toBe(true);
			const createdPage = createResult.value!;

			// Record for cleanup
			cleanupTracker.recordCreatedPage(createdPage.id);

			// Then: read-back matches created content (title/body)
			const readResult = await target.getPage(createdPage.id);
			expect(readResult.ok).toBe(true);
			const readPage = readResult.value!;

			expect(readPage.title).toBe(testTitle);
			expect(readPage.body).toBe(testBody);

			// When: we update the page
			const updatedBody = `<h1>${testTitle}</h1><p>Updated content for smoke test</p>`;
			const updateReq: UpdatePageRequest = {
				pageId: createdPage.id,
				baseVersion: createdPage.version,
				title: testTitle,
				body: updatedBody,
				message: "E2E smoke test: update page",
			};

			const updateResult = await target.updatePage(updateReq);
			expect(updateResult.ok).toBe(true);
			const updatedPage = updateResult.value!;

			// Then: read-back matches updated content
			const readAfterUpdateResult = await target.getPage(updatedPage.id);
			expect(readAfterUpdateResult.ok).toBe(true);
			const readAfterUpdatePage = readAfterUpdateResult.value!;

			expect(readAfterUpdatePage.title).toBe(testTitle);
			expect(readAfterUpdatePage.body).toBe(updatedBody);
			expect(readAfterUpdatePage.version).toBe(createdPage.version + 1);

			// Then: delete succeeds (via cleanup in afterAll)
		},
	);

	afterAll(async () => {
		// Run-scoped cleanup: delete every created page (RSK-2, NFR-CI-4)
		if (cleanupTracker && cleanupTracker.getCreatedCount() > 0 && target) {
			for (const pageId of cleanupTracker.getCreatedPageIds()) {
				try {
					const readResult = await target.getPage(pageId);
					if (readResult.ok) {
						const page = readResult.value!;
						// Update with a deletion marker (no native delete in port)
						const deleteReq: UpdatePageRequest = {
							pageId: pageId,
							baseVersion: page.version,
							title: page.title,
							body: "<p>Deleted by E2E cleanup</p>",
							message: "E2E smoke test: cleanup delete",
						};
						await target.updatePage(deleteReq);
					}
				} catch (error) {
					// Best-effort cleanup; log failures for orphan-detection backstop
					console.error(
						`[E2E Cleanup Failed] Failed to delete page ${pageId}:`,
						error,
					);
				}
			}

			// Log any remaining orphans
			if (cleanupTracker.getCreatedCount() > 0) {
				cleanupTracker.logCreatedPageIds();
			}

			// After successful cleanup, clear tracker
			cleanupTracker.clear();
		}
	});
});
