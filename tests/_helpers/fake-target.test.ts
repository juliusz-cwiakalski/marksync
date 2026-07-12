import { describe, it, expect, beforeEach } from "bun:test";
import { FakeTarget } from "./fake-target";
import type { Page } from "#domain/target/port";

describe("FakeTarget", () => {
	let target: FakeTarget;

	beforeEach(() => {
		target = new FakeTarget();
	});

	describe("property round-trip", () => {
		it("stores and retrieves properties", async () => {
			const pageId = "page-123";
			const json = '{"operationId":"op_test"}';

			// Put property
			await target.putProperty(pageId, "marksync.metadata", json);

			// Get property back
			const result = await target.getProperty(pageId, "marksync.metadata");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(json);
			}
		});

		it("returns undefined for missing properties", async () => {
			const result = await target.getProperty("page-123", "marksync.metadata");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}
		});

		it("handles setMetadataProperty test helper", async () => {
			const pageId = "page-123";
			const json = '{"operationId":"op_test"}';

			target.setMetadataProperty(pageId, json);

			const result = await target.getProperty(pageId, "marksync.metadata");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(json);
			}
		});
	});

	describe("shared backing map", () => {
		it("two instances share state via backing map", async () => {
			const sharedState = {
				pages: new Map<string, Page>(),
				versionCounter: new Map<string, number>(),
				properties: new Map<string, string>(),
			};

			const runnerA = new FakeTarget(sharedState);
			const runnerB = new FakeTarget(sharedState);

			// Runner B writes a property
			await runnerB.putProperty("page-123", "marksync.metadata", '{"operationId":"op_runner_b"}');

			// Runner A reads the property
			const result = await runnerA.getProperty("page-123", "marksync.metadata");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe('{"operationId":"op_runner_b"}');
			}
		});

		it("two instances without shared map have independent state", async () => {
			const runnerA = new FakeTarget();
			const runnerB = new FakeTarget();

			// Runner B writes a property
			await runnerB.putProperty("page-123", "marksync.metadata", '{"operationId":"op_runner_b"}');

			// Runner A does not see it
			const result = await runnerA.getProperty("page-123", "marksync.metadata");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}
		});
	});

	describe("409-then-refreshed sequence", () => {
		it("configures and applies 409-then-refreshed sequence", async () => {
			const pageId = "page-123";
			const fixture: Page = {
				id: pageId,
				title: "Test Page",
				version: 1,
				body: "Old content",
			};
			target.addFixture(fixture);

			// Configure: after getPage, version is 2, reapply succeeds
			target.setConflictThenRefreshed(pageId, {
				afterGetPageVersion: 2,
				reapplyOutcome: "success",
			});

			// First updatePage with stale baseVersion (0) → Conflict
			const updateResult1 = await target.updatePage({
				pageId,
				title: "Test Page",
				body: "New content",
				baseVersion: 0,
			});

			expect(updateResult1.ok).toBe(false);
			if (!updateResult1.ok) {
				expect(updateResult1.error.kind).toBe("Conflict");
			}
			expect(target.getUpdatePageAttempts(pageId)).toBe(1);

			// Re-fetch (getPage) to see refreshed state
			const pageResult = await target.getPage(pageId);
			expect(pageResult.ok).toBe(true);
			if (pageResult.ok) {
				expect(pageResult.value.version).toBe(2); // Refreshed version
			}

			// Second updatePage with refreshed baseVersion (2) → Success
			const updateResult2 = await target.updatePage({
				pageId,
				title: "Test Page",
				body: "New content",
				baseVersion: 2,
			});

			expect(updateResult2.ok).toBe(true);
			expect(target.getUpdatePageAttempts(pageId)).toBe(2);
		});

		it("configures reapply to conflict again", async () => {
			const pageId = "page-123";
			const fixture: Page = {
				id: pageId,
				title: "Test Page",
				version: 1,
				body: "Old content",
			};
			target.addFixture(fixture);

			// Configure: after getPage, version is 3, reapply conflicts
			target.setConflictThenRefreshed(pageId, {
				afterGetPageVersion: 3,
				reapplyOutcome: "conflict",
			});

			// First updatePage with stale baseVersion (0) → Conflict
			const updateResult1 = await target.updatePage({
				pageId,
				title: "Test Page",
				body: "New content",
				baseVersion: 0,
			});

			expect(updateResult1.ok).toBe(false);
			if (!updateResult1.ok) {
				expect(updateResult1.error.kind).toBe("Conflict");
			}
			expect(target.getUpdatePageAttempts(pageId)).toBe(1);

			// Second updatePage still conflicts
			const updateResult2 = await target.updatePage({
				pageId,
				title: "Test Page",
				body: "New content",
				baseVersion: 2, // Refreshed version, but should still conflict
			});

			expect(updateResult2.ok).toBe(false);
			if (!updateResult2.ok) {
				expect(updateResult2.error.kind).toBe("Conflict");
			}
			expect(target.getUpdatePageAttempts(pageId)).toBe(2);
		});
	});

	describe("port drift reconciliation", () => {
		it("getRestrictions returns correct PageRestrictions shape", async () => {
			const result = await target.getRestrictions("page-123");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual({
					pageId: "page-123",
					restricted: false,
				});
			}
		});

		it("createPage does not reference page.spaceId", async () => {
			const createResult = await target.createPage({
				parentId: "parent-123",
				title: "New Page",
				body: "<p>Content</p>",
			});

			expect(createResult.ok).toBe(true);
			if (createResult.ok) {
				const page = createResult.value;
				// Page should not have spaceId field (per port.ts)
				expect(page).not.toHaveProperty("spaceId");
			}
		});
	});
});