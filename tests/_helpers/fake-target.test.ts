// tests/_helpers/fake-target.test.ts
//
// FakeTarget stub coverage — exercises every TargetSystem method the push-flow
// integration tests leave untouched, pinning each default return shape so the
// fake clears the per-file coverage threshold (GH-23 MS2-E3-S6).

import { describe, expect, test } from "bun:test";
import { FakeTarget } from "./fake-target";

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

	test("createPage returns Conflict when a page with the same title/space exists", async () => {
		const t = new FakeTarget();
		await t.createPage({
			parentId: "space-1",
			title: "Dup",
			body: "first",
		});
		const r = await t.createPage({
			parentId: "space-1",
			title: "Dup",
			body: "second",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe("Conflict");
			expect(r.error.remoteVersion).toBe(1);
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

	test("getRestrictions returns ok with read/update/delete arms", async () => {
		const t = new FakeTarget();
		const r = await t.getRestrictions("p1");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toMatchObject({
				read: { users: [], groups: [] },
				update: { users: [], groups: [] },
				delete: { users: [], groups: [] },
			});
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
});
