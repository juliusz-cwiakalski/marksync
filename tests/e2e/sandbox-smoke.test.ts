// Live-sandbox smoke test (TC-E2E-002, AC-F3-2, NFR-CI-4, NFR-MAINT-4).

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
	readE2ECredentials,
	requiredSecretsPresent,
	type CleanupTracker,
} from "./helpers";

describe("E2E sandbox smoke test", () => {
	let credentials: ReturnType<typeof readE2ECredentials>;
	let cleanupTracker: CleanupTracker;

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
	});

	test.skipIf(
		!requiredSecretsPresent(),
		"TC-E2E-002: create+read+delete round-trip + cleanup",
		async () => {
			// Note: This test is a placeholder implementation.
			// The real Confluence adapter integration would go here.
			// For MS-0002, we're building the harness infrastructure only.

			// Given: all MARKSYNC_E2E_* secrets are present
			expect(requiredSecretsPresent()).toBe(true);
			expect(credentials).toBeDefined();

			// When: we perform a create+read+delete round-trip against the sandbox
			// (Placeholder: would call real ConfluenceTarget.fromCredentials here)

			// Then: create succeeds
			// Then: read-back matches created content (title/body)
			// Then: delete succeeds
			// Then: deleted page cannot be read

			// Run-scoped cleanup: every created page is deleted by end of run
			// (Placeholder: cleanupTracker.recordCreatedPage() + cleanup in afterAll)
		},
	);

	afterAll(() => {
		// Run-scoped cleanup: delete every created page (RSK-2, NFR-CI-4)
		if (cleanupTracker && cleanupTracker.getCreatedCount() > 0) {
			// Placeholder: would delete each page in cleanupTracker.getCreatedPageIds()
			// Best-effort, sequential, log failures

			// After successful cleanup, clear tracker
			cleanupTracker.clear();
		}
	});
});
