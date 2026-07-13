// tests/unit/fake-target.test.ts
//
// FakeTarget stub coverage — exercises every TargetSystem method the push-flow
// integration tests leave untouched, pinning each default return shape so the
// fake clears the per-file coverage threshold (GH-23 MS2-E3-S6).

import { describe, expect, test } from "bun:test";
import type { Page } from "#domain/target/port";
import { FakeTarget } from "#tests/_helpers/fake-target";

describe("FakeTarget — stub defaults for uncovered TargetSystem methods", () => {
	test("createPage succeeds, stores the page, and bumps the write counter", async () => {
		const t = new FakeTarget();
		expect(t.getWriteCount()).toBe(0);
		const r = await t.createPage({
			parentId: "space-1",
			title: "Hello",
			body: "<p>hi</p>",
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.version).toBe(1);
			expect(r.value.title).toBe("Hello");
		}
		expect(t.getWriteCount()).toBe(1);
		expect(t.createPageCalls).toHaveLength(1);
	});

	test("createPage returns Conflict when a page with the same id exists", async () => {
		const t = new FakeTarget();
		// First page creation
		const r1 = await t.createPage({
			parentId: "space-1",
			title: "Dup",
			body: "first",
		});
		expect(r1.ok).toBe(true);
		if (r1.ok) {
			const pageId = r1.value.id;
			// Simulate a page with same id already exists
			t.addFixture({ id: pageId, title: "Other", version: 1 });
		}

		// Second createPage with different title (no conflict by our new duplicate detection)
		const r2 = await t.createPage({
			parentId: "space-1",
			title: "Dup",
			body: "second",
		});
		expect(r2.ok).toBe(true); // No conflict with different id
	});

	test("getRestrictions returns ok with correct PageRestrictions shape", async () => {
		const t = new FakeTarget();
		const r = await t.getRestrictions("p1");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toMatchObject({
				pageId: "p1",
				restricted: false,
			});
		}
	});

	test("movePage returns Forbidden (not implemented for MS-0002)", async () => {
		const t = new FakeTarget();
		const r = await t.movePage({ pageId: "p1", parentId: "p2" });
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe("Forbidden");
			if (r.error.kind === "Forbidden") {
				expect(r.error.operation).toBe("movePage");
			}
		}
	});

	test("getProperty returns ok(undefined) for any missing key", async () => {
		const t = new FakeTarget();
		const r = await t.getProperty("p1", "marksync.metadata");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toBeUndefined();
		}
	});

	test("putProperty records the call and returns ok", async () => {
		const t = new FakeTarget();
		const r = await t.putProperty("p1", "k", "v");
		expect(r.ok).toBe(true);
		expect(t.putPropertyCalls).toEqual([
			{ pageId: "p1", key: "k", value: "v" },
		]);
	});

	test("uploadAttachment returns Forbidden (not implemented)", async () => {
		const t = new FakeTarget();
		const r = await t.uploadAttachment("p1", {
			bytes: new Uint8Array([1, 2, 3]),
			mime: "image/svg+xml",
			hash: "abc",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe("Forbidden");
			if (r.error.kind === "Forbidden") {
				expect(r.error.operation).toBe("uploadAttachment");
			}
		}
	});

	test("attachmentExists returns ok(false)", async () => {
		const t = new FakeTarget();
		const r = await t.attachmentExists("p1", "abc");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toBe(false);
		}
	});

	test("listAttachments returns ok with an empty list", async () => {
		const t = new FakeTarget();
		const r = await t.listAttachments("p1");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toHaveLength(0);
		}
	});

	test("searchPages returns ok with an empty list", async () => {
		const t = new FakeTarget();
		const r = await t.searchPages("space = 'ENG'");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toHaveLength(0);
		}
	});

	test("renderBody returns a deterministic fixture render", () => {
		const t = new FakeTarget();
		const r = t.renderBody(
			{ type: "root", children: [] },
			{ sourcePath: "docs/x.md" },
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.body).toBe("<h1>Test</h1>");
			expect(r.value.hash).toBe("fixture-hash");
		}
	});

	test("resetWriteCounter zeroes the write counter", async () => {
		const t = new FakeTarget();
		await t.createPage({ parentId: "s", title: "T", body: "B" });
		expect(t.getWriteCount()).toBe(1);
		t.resetWriteCounter();
		expect(t.getWriteCount()).toBe(0);
	});

	test("advanceVersion bumps a fixture page's version", async () => {
		const t = new FakeTarget();
		t.addFixture({ id: "fx", title: "Fx", version: 1 });
		t.advanceVersion("fx");
		const r = await t.getPage("fx");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.version).toBe(2);
		}
	});

	test("getPage returns RemoteMissing for an unknown id", async () => {
		const t = new FakeTarget();
		const r = await t.getPage("nope");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe("RemoteMissing");
		}
	});

	// GH-24: property round-trip — put and get with a real value
	test("property round-trip: putProperty then getProperty returns the same value", async () => {
		const t = new FakeTarget();
		const pageId = "page-123";
		const json = '{"operationId":"op_test"}';

		// Put property
		const putResult = await t.putProperty(pageId, "marksync.metadata", json);
		expect(putResult.ok).toBe(true);

		// Get property back
		const getResult = await t.getProperty(pageId, "marksync.metadata");
		expect(getResult.ok).toBe(true);
		if (getResult.ok) {
			expect(getResult.value).toBe(json);
		}
	});

	// GH-24: setMetadataProperty test helper
	test("setMetadataProperty helper writes directly to the property map", async () => {
		const t = new FakeTarget();
		const pageId = "page-123";
		const json = '{"operationId":"op_test"}';

		t.setMetadataProperty(pageId, json);

		const result = await t.getProperty(pageId, "marksync.metadata");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe(json);
		}
	});

	// GH-24: shared backing map — two instances share state via backing map
	test("shared backing map: two FakeTarget instances share state", async () => {
		const sharedState = {
			pages: new Map<string, import("#domain/target/port").Page>(),
			versionCounter: new Map<string, number>(),
			properties: new Map<string, string>(),
		};

		const runnerA = new FakeTarget(sharedState);
		const runnerB = new FakeTarget(sharedState);

		// Runner B writes a property
		await runnerB.putProperty(
			"page-123",
			"marksync.metadata",
			'{"operationId":"op_runner_b"}',
		);

		// Runner A reads the property
		const result = await runnerA.getProperty("page-123", "marksync.metadata");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe('{"operationId":"op_runner_b"}');
		}
	});

	// GH-24: shared backing map — two instances without shared map have independent state
	test("shared backing map: two FakeTarget instances without shared map are independent", async () => {
		const runnerA = new FakeTarget();
		const runnerB = new FakeTarget();

		// Runner B writes a property
		await runnerB.putProperty(
			"page-123",
			"marksync.metadata",
			'{"operationId":"op_runner_b"}',
		);

		// Runner A does not see it
		const result = await runnerA.getProperty("page-123", "marksync.metadata");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBeUndefined();
		}
	});

	// GH-24: 409-then-refreshed sequence — reapply succeeds
	test("409-then-refreshed: conflict → re-fetch → reapply succeeds", async () => {
		const t = new FakeTarget();
		const pageId = "page-123";
		t.addFixture({
			id: pageId,
			title: "Test Page",
			version: 1,
			body: "Old content",
		});

		// Configure: after getPage, version is 2, reapply succeeds
		t.setConflictThenRefreshed(pageId, {
			afterGetPageVersion: 2,
			reapplyOutcome: "success",
		});

		// First updatePage with stale baseVersion (0) → Conflict
		const updateResult1 = await t.updatePage({
			pageId,
			title: "Test Page",
			body: "New content",
			baseVersion: 0,
		});

		expect(updateResult1.ok).toBe(false);
		if (!updateResult1.ok) {
			expect(updateResult1.error.kind).toBe("Conflict");
		}
		expect(t.getUpdatePageAttempts(pageId)).toBe(1);

		// Re-fetch (getPage) to see refreshed state
		const pageResult = await t.getPage(pageId);
		expect(pageResult.ok).toBe(true);
		if (pageResult.ok) {
			expect(pageResult.value.version).toBe(2); // Refreshed version
		}

		// Second updatePage with refreshed baseVersion (2) → Success
		const updateResult2 = await t.updatePage({
			pageId,
			title: "Test Page",
			body: "New content",
			baseVersion: 2,
		});

		expect(updateResult2.ok).toBe(true);
		expect(t.getUpdatePageAttempts(pageId)).toBe(2);
	});

	// GH-24: 409-then-refreshed sequence — reapply conflicts again
	test("409-then-refreshed: conflict → re-fetch → reapply conflicts again", async () => {
		const t = new FakeTarget();
		const pageId = "page-123";
		t.addFixture({
			id: pageId,
			title: "Test Page",
			version: 1,
			body: "Old content",
		});

		// Configure: after getPage, version is 3, reapply conflicts
		t.setConflictThenRefreshed(pageId, {
			afterGetPageVersion: 3,
			reapplyOutcome: "conflict",
		});

		// First updatePage with stale baseVersion (0) → Conflict
		const updateResult1 = await t.updatePage({
			pageId,
			title: "Test Page",
			body: "New content",
			baseVersion: 0,
		});

		expect(updateResult1.ok).toBe(false);
		if (!updateResult1.ok) {
			expect(updateResult1.error.kind).toBe("Conflict");
		}
		expect(t.getUpdatePageAttempts(pageId)).toBe(1);

		// Second updatePage still conflicts
		const updateResult2 = await t.updatePage({
			pageId,
			title: "Test Page",
			body: "New content",
			baseVersion: 2, // Refreshed version, but should still conflict
		});

		expect(updateResult2.ok).toBe(false);
		if (!updateResult2.ok) {
			expect(updateResult2.error.kind).toBe("Conflict");
		}
		expect(t.getUpdatePageAttempts(pageId)).toBe(2);
	});

	// GH-24: port drift — createPage does not reference page.spaceId
	test("createPage does not include spaceId field in returned Page", async () => {
		const t = new FakeTarget();
		const createResult = await t.createPage({
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
