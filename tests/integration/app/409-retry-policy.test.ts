// Integration tests for 409 re-fetch-once policy (TC-409-006, TC-409-007, TC-409-008).

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { applyPlan, type Plan } from "#app/push-flow";
import type { LockFile } from "#domain/config/lock-types";
import { generateUuidV7 } from "#domain/identity/uuid";
import { rawHash } from "#domain/state/hashes";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { ensureCacheLayout } from "#app/cache";

describe("409 retry policy", () => {
	let tmpCacheDir: string;

	beforeAll(() => {
		tmpCacheDir = mkdtempSync(join(tmpdir(), "gh24-409-retry-"));
		ensureCacheLayout(tmpCacheDir);
	});

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
	});
	describe("TC-409-006: re-fetch → now safe → reapply once", () => {
		it("re-fetches, re-classifies LOCAL_AHEAD, re-applies once with success", async () => {
			// Setup: Create a plan targeting a page with stale baseVersion
			const runId = generateUuidV7();
			const plan: Plan = {
				runId,
				operationId: `op_${runId}`,
				entries: [
					{
						uuid: "doc-a",
						sourcePath: "/doc-a.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-new",
							rawHash: "raw-new",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Updated</h1>",
					},
				],
				provenance: {
					headCommit: "commit-new",
					commitCount: 1,
					subjects: ["Update"],
				},
				warnings: [],
				visiblePanel: false,
			};

			// Setup: FakeTarget with initial page at version 1
			const target = new FakeTarget();
			const fixtureBody = "<h1>Doc A Initial</h1>";
			// base.renderedBodyHash must equal rawHash(remote body) so the re-fetch
			// classifies as LOCAL_AHEAD (remote unchanged) → decideOnConflict reapplies.
			const fixtureHash = rawHash(fixtureBody);
			target.addFixture({
				id: "page-123",
				title: "Doc A",
				version: 1,
				body: fixtureBody,
			});

			// Setup: Configure 409-then-refreshed sequence
			// First updatePage conflicts (remote at version 2, baseVersion 1)
			// After getPage, remote advances to version 2 with empty body (LOCAL_AHEAD)
			// Second updatePage (reapply) succeeds
			target.setConflictThenRefreshed("page-123", {
				afterGetPageVersion: 2,
				reapplyOutcome: "success",
			});

			// Advance version to trigger first conflict
			target.advanceVersion("page-123");

			const lock: LockFile = {
				version: 1,
				targets: {
					default: {
						targetId: "default",
						parentPageId: "parent-123",
						documents: {
							"doc-a": {
								uuid: "doc-a",
								sourcePath: "/doc-a.md",
								pageId: "page-123",
								parentPageId: "parent-123",
								pageVersion: 1, // Stale baseVersion
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: fixtureHash,
								remoteBodyHash: fixtureHash,
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
						},
					},
				},
			};

			const opts = {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
				stalePlanMinutes: 15,
			};

			// Execute: processEntry attempts updatePage
			const result = await applyPlan(plan, target, lock, opts);

			// Assert: Second updatePage succeeds (no 409 on the reapply)
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.writes).toBe(1);
			expect(result.value.blocks).toBe(0);

			// Assert: 1 re-fetch (409 Conflict) + 1 fetch-back (GH-62 post-reapply)
			expect(target.getPageCalls.length).toBe(2);

			// Assert: Max 1 reapply occurred (count updatePageCalls)
			// First call conflicts, second call (reapply) succeeds
			expect(target.updatePageCalls.length).toBe(2);
			expect(target.getUpdatePageAttempts("page-123")).toBe(2);

			// Assert: Per-document isolation: other documents in plan still apply
			// (Single doc plan, but pattern holds for multi-doc plans)
			expect(result.value.results.length).toBe(1);
			expect(result.value.results[0].outcome).toBe("updated");

			// Assert: Content was updated successfully
			const page = await target.getPage("page-123");
			expect(page.ok).toBe(true);
			if (!page.ok) return;

			expect(page.value.body).toBe("<h1>Doc A Updated</h1>");
		});
	});

	describe("TC-409-007: re-fetch → still diverged → block", () => {
		it("re-fetches, re-classifies DIVERGED, blocks without reapply", async () => {
			// Setup: Create a plan targeting a page with stale baseVersion
			const runId = generateUuidV7();
			const plan: Plan = {
				runId,
				operationId: `op_${runId}`,
				entries: [
					{
						uuid: "doc-a",
						sourcePath: "/doc-a.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-new",
							rawHash: "raw-new",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Updated</h1>",
					},
				],
				provenance: {
					headCommit: "commit-new",
					commitCount: 1,
					subjects: ["Update"],
				},
				warnings: [],
				visiblePanel: false,
			};

			// Setup: FakeTarget with initial page at version 1
			const target = new FakeTarget();
			target.addFixture({
				id: "page-123",
				title: "Doc A",
				version: 1,
				body: "<h1>Doc A Initial</h1>",
			});

			// Setup: Manually simulate DIVERGED state by updating the remote body
			// after the first getPage call
			// First updatePage conflicts (remote at version 2, baseVersion 1)
			// After getPage, remote is at version 2 with different body (DIVERGED)
			// No second updatePage call (block decision)
			target.setConflictThenRefreshed("page-123", {
				afterGetPageVersion: 2,
				reapplyOutcome: "conflict", // Will be blocked before this is used
			});

			// Advance version to trigger first conflict
			target.advanceVersion("page-123");

			const lock: LockFile = {
				version: 1,
				targets: {
					default: {
						targetId: "default",
						parentPageId: "parent-123",
						documents: {
							"doc-a": {
								uuid: "doc-a",
								sourcePath: "/doc-a.md",
								pageId: "page-123",
								parentPageId: "parent-123",
								pageVersion: 1, // Stale baseVersion
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: "initial",
								remoteBodyHash: "initial",
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
						},
					},
				},
			};

			const opts = {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
				stalePlanMinutes: 15,
			};

			// Execute: processEntry attempts updatePage
			const result = await applyPlan(plan, target, lock, opts);

			// Assert: processEntry returns blocked for that document
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.writes).toBe(0);
			expect(result.value.blocks).toBe(1);

			const blockedResult = result.value.results[0];
			expect(blockedResult.outcome).toBe("blocked");
			expect(blockedResult.error?.kind).toBe("Conflict");

			// Assert: 0 reapply occurred after the block (count updatePageCalls = 1)
			expect(target.updatePageCalls.length).toBe(1);
			expect(target.getUpdatePageAttempts("page-123")).toBe(1);

			// Assert: Max 1 re-fetch occurred (count getPageCalls)
			expect(target.getPageCalls.length).toBe(1);

			// Assert: Per-document isolation: other documents in plan still apply
			// (Single doc plan, but pattern holds for multi-doc plans)
			expect(result.value.results.length).toBe(1);

			// Assert: FakeTarget state is unchanged (no overwrite occurred)
			const page = await target.getPage("page-123");
			expect(page.ok).toBe(true);
			if (!page.ok) return;

			expect(page.value.body).toBe("<h1>Doc A Initial</h1>");
		});
	});

	describe("TC-409-008: re-fetch → reapply → conflict again → block", () => {
		it("re-fetches, re-applies, conflicts again, blocks without second retry", async () => {
			// Setup: Create a plan targeting a page with stale baseVersion
			const runId = generateUuidV7();
			const plan: Plan = {
				runId,
				operationId: `op_${runId}`,
				entries: [
					{
						uuid: "doc-a",
						sourcePath: "/doc-a.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-new",
							rawHash: "raw-new",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Updated</h1>",
					},
				],
				provenance: {
					headCommit: "commit-new",
					commitCount: 1,
					subjects: ["Update"],
				},
				warnings: [],
				visiblePanel: false,
			};

			// Setup: FakeTarget with initial page at version 1
			const target = new FakeTarget();
			const fixtureBody = "<h1>Doc A Initial</h1>";
			// base.renderedBodyHash must equal rawHash(remote body) so the re-fetch
			// classifies as LOCAL_AHEAD → decideOnConflict reapplies (then conflicts).
			const fixtureHash = rawHash(fixtureBody);
			target.addFixture({
				id: "page-123",
				title: "Doc A",
				version: 1,
				body: fixtureBody,
			});

			// Setup: Configure 409-then-refreshed sequence
			// First updatePage conflicts (remote at version 2, baseVersion 1)
			// After getPage, remote advances to version 2 with empty body (LOCAL_AHEAD)
			// Second updatePage (reapply) conflicts AGAIN (race condition)
			target.setConflictThenRefreshed("page-123", {
				afterGetPageVersion: 2,
				reapplyOutcome: "conflict",
			});

			// Advance version to trigger first conflict
			target.advanceVersion("page-123");

			// Advance version again to make the reapply also conflict
			target.advanceVersion("page-123");

			const lock: LockFile = {
				version: 1,
				targets: {
					default: {
						targetId: "default",
						parentPageId: "parent-123",
						documents: {
							"doc-a": {
								uuid: "doc-a",
								sourcePath: "/doc-a.md",
								pageId: "page-123",
								parentPageId: "parent-123",
								pageVersion: 1, // Stale baseVersion
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: fixtureHash,
								remoteBodyHash: fixtureHash,
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
						},
					},
				},
			};

			const opts = {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
				stalePlanMinutes: 15,
			};

			// Execute: processEntry attempts updatePage
			const result = await applyPlan(plan, target, lock, opts);

			// Assert: processEntry returns blocked for that document
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.writes).toBe(0);
			expect(result.value.blocks).toBe(1);

			const blockedResult = result.value.results[0];
			expect(blockedResult.outcome).toBe("blocked");
			expect(blockedResult.error?.kind).toBe("Conflict");

			// Assert: No second retry occurred
			// getPageCalls = 1 (single re-fetch)
			// updatePageCalls = 2 (first attempt + reapply, both conflict)
			expect(target.getPageCalls.length).toBe(1);
			expect(target.updatePageCalls.length).toBe(2);
			expect(target.getUpdatePageAttempts("page-123")).toBe(2);

			// Assert: FakeTarget state is unchanged (no overwrite occurred)
			const page = await target.getPage("page-123");
			expect(page.ok).toBe(true);
			if (!page.ok) return;

			expect(page.value.body).toBe("<h1>Doc A Initial</h1>");
		});
	});
});
