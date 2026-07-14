// Integration tests for per-document isolation (TC-ISO-001, TC-ISO-002).

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { applyPlan, type Plan } from "#app/push-flow";
import type { LockFile } from "#domain/config/lock-types";
import { generateUuidV7 } from "#domain/identity/uuid";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { ensureCacheLayout } from "#app/cache";

describe("concurrency isolation", () => {
	let tmpCacheDir: string;

	beforeAll(() => {
		tmpCacheDir = mkdtempSync(join(tmpdir(), "gh24-conc-iso-"));
		ensureCacheLayout(tmpCacheDir);
	});

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
	});
	describe("TC-ISO-001: StalePlan on doc A, doc B applies", () => {
		it("doc A blocks, doc B still applies, run does not abort", async () => {
			// Setup: Create a plan with two documents: doc A and doc B
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
							canonicalHash: "hash-a",
							rawHash: "raw-a",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Runner</h1>",
					},
					{
						uuid: "doc-b",
						sourcePath: "/doc-b.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-b",
							rawHash: "raw-b",
							title: "Doc B",
						},
						renderedBody: "<h1>Doc B Runner</h1>",
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

			// Setup: Create a FakeTarget instance
			const target = new FakeTarget();
			target.addFixture({
				id: "page-a",
				title: "Doc A",
				version: 1,
				body: "<h1>Doc A Remote</h1>",
			});
			target.addFixture({
				id: "page-b",
				title: "Doc B",
				version: 1,
				body: "<h1>Doc B Remote</h1>",
			});

			// Setup: Configure remote state so doc A has a newer operation-id (will be stale), doc B is fresh
			// Create a newer operationId for doc A's remote
			await new Promise((resolve) => setTimeout(resolve, 10));
			const newerOpId = `op_${generateUuidV7()}`;
			target.setMetadataProperty(
				"page-a",
				JSON.stringify({
					schemaVersion: 1,
					projectId: "default",
					targetId: "default",
					documentId: "doc-a",
					sourcePath: "/doc-a.md",
					sourceCommit: "remote-commit",
					sourceContentHash: "remote-hash",
					renderedBodyHash: "remote-hash",
					operationId: newerOpId, // Newer than plan's operationId
					synchronizedAt: new Date().toISOString(),
					toolVersion: "0.4.0",
				}),
			);

			// Doc B has the same operationId as the plan (fresh)
			target.setMetadataProperty(
				"page-b",
				JSON.stringify({
					schemaVersion: 1,
					projectId: "default",
					targetId: "default",
					documentId: "doc-b",
					sourcePath: "/doc-b.md",
					sourceCommit: "initial",
					sourceContentHash: "initial",
					renderedBodyHash: "initial",
					operationId: plan.operationId, // Same as plan, fresh
					synchronizedAt: new Date().toISOString(),
					toolVersion: "0.4.0",
				}),
			);

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
								pageId: "page-a",
								parentPageId: "parent-123",
								pageVersion: 1,
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: "initial",
								remoteBodyHash: "initial",
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
							"doc-b": {
								uuid: "doc-b",
								sourcePath: "/doc-b.md",
								pageId: "page-b",
								parentPageId: "parent-123",
								pageVersion: 1,
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

			// Execute: applyPlan processes both documents
			const result = await applyPlan(plan, target, lock, opts);

			// Assert: Doc A returns blocked with StalePlan
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const docAResult = result.value.results.find((r) => r.uuid === "doc-a");
			expect(docAResult).toBeDefined();
			expect(docAResult?.outcome).toBe("blocked");
			expect(docAResult?.error?.kind).toBe("StalePlan");

			// Assert: Doc B returns updated (success)
			const docBResult = result.value.results.find((r) => r.uuid === "doc-b");
			expect(docBResult).toBeDefined();
			expect(docBResult?.outcome).toBe("updated");

			// Assert: The ApplyReport contains both entries with correct outcomes
			expect(result.value.results.length).toBe(2);
			expect(result.value.writes).toBe(1);
			expect(result.value.blocks).toBe(1);

			// Assert: The run did NOT abort — both docs processed (one blocked,
			// one updated), regardless of entry order. Per-document isolation means
			// doc-a's StalePlan did not prevent doc-b's update.
			const outcomes = result.value.results.map((r) => r.outcome).sort();
			expect(outcomes).toEqual(["blocked", "updated"]);

			// Assert: FakeTarget state reflects only doc B's successful write
			const pageA = await target.getPage("page-a");
			expect(pageA.ok).toBe(true);
			if (!pageA.ok) return;

			expect(pageA.value.body).toBe("<h1>Doc A Remote</h1>"); // Unchanged

			const pageB = await target.getPage("page-b");
			expect(pageB.ok).toBe(true);
			if (!pageB.ok) return;

			expect(pageB.value.body).toBe("<h1>Doc B Runner</h1>"); // Updated
		});
	});

	describe("TC-ISO-002: StalePlan on doc C, docs A/B apply", () => {
		it("doc C blocks, docs A and B still apply, run does not abort", async () => {
			// Setup: Create a plan with three documents: doc A, doc B, doc C
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
							canonicalHash: "hash-a",
							rawHash: "raw-a",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Runner</h1>",
					},
					{
						uuid: "doc-b",
						sourcePath: "/doc-b.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-b",
							rawHash: "raw-b",
							title: "Doc B",
						},
						renderedBody: "<h1>Doc B Runner</h1>",
					},
					{
						uuid: "doc-c",
						sourcePath: "/doc-c.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-c",
							rawHash: "raw-c",
							title: "Doc C",
						},
						renderedBody: "<h1>Doc C Runner</h1>",
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

			// Setup: Create a FakeTarget instance
			const target = new FakeTarget();
			target.addFixture({
				id: "page-a",
				title: "Doc A",
				version: 1,
				body: "<h1>Doc A Remote</h1>",
			});
			target.addFixture({
				id: "page-b",
				title: "Doc B",
				version: 1,
				body: "<h1>Doc B Remote</h1>",
			});
			target.addFixture({
				id: "page-c",
				title: "Doc C",
				version: 1,
				body: "<h1>Doc C Remote</h1>",
			});

			// Setup: Configure remote state so doc C has a newer operation-id (will be stale), docs A/B are fresh
			// Create a newer operationId for doc C's remote
			await new Promise((resolve) => setTimeout(resolve, 10));
			const newerOpId = `op_${generateUuidV7()}`;
			target.setMetadataProperty(
				"page-c",
				JSON.stringify({
					schemaVersion: 1,
					projectId: "default",
					targetId: "default",
					documentId: "doc-c",
					sourcePath: "/doc-c.md",
					sourceCommit: "remote-commit",
					sourceContentHash: "remote-hash",
					renderedBodyHash: "remote-hash",
					operationId: newerOpId, // Newer than plan's operationId
					synchronizedAt: new Date().toISOString(),
					toolVersion: "0.4.0",
				}),
			);

			// Docs A and B have the same operationId as the plan (fresh)
			target.setMetadataProperty(
				"page-a",
				JSON.stringify({
					schemaVersion: 1,
					projectId: "default",
					targetId: "default",
					documentId: "doc-a",
					sourcePath: "/doc-a.md",
					sourceCommit: "initial",
					sourceContentHash: "initial",
					renderedBodyHash: "initial",
					operationId: plan.operationId, // Same as plan, fresh
					synchronizedAt: new Date().toISOString(),
					toolVersion: "0.4.0",
				}),
			);

			target.setMetadataProperty(
				"page-b",
				JSON.stringify({
					schemaVersion: 1,
					projectId: "default",
					targetId: "default",
					documentId: "doc-b",
					sourcePath: "/doc-b.md",
					sourceCommit: "initial",
					sourceContentHash: "initial",
					renderedBodyHash: "initial",
					operationId: plan.operationId, // Same as plan, fresh
					synchronizedAt: new Date().toISOString(),
					toolVersion: "0.4.0",
				}),
			);

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
								pageId: "page-a",
								parentPageId: "parent-123",
								pageVersion: 1,
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: "initial",
								remoteBodyHash: "initial",
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
							"doc-b": {
								uuid: "doc-b",
								sourcePath: "/doc-b.md",
								pageId: "page-b",
								parentPageId: "parent-123",
								pageVersion: 1,
								sourceCommit: "initial",
								sourceContentHash: "initial",
								renderedBodyHash: "initial",
								remoteBodyHash: "initial",
								attachmentHashes: {},
								operationId: "initial-op",
								synchronizedAt: new Date().toISOString(),
								toolVersion: "0.4.0",
							},
							"doc-c": {
								uuid: "doc-c",
								sourcePath: "/doc-c.md",
								pageId: "page-c",
								parentPageId: "parent-123",
								pageVersion: 1,
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

			// Execute: applyPlan processes all three documents
			const result = await applyPlan(plan, target, lock, opts);

			// Assert: Doc C returns blocked with StalePlan
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const docCResult = result.value.results.find((r) => r.uuid === "doc-c");
			expect(docCResult).toBeDefined();
			expect(docCResult?.outcome).toBe("blocked");
			expect(docCResult?.error?.kind).toBe("StalePlan");

			// Assert: Docs A and B return updated (success)
			const docAResult = result.value.results.find((r) => r.uuid === "doc-a");
			expect(docAResult).toBeDefined();
			expect(docAResult?.outcome).toBe("updated");

			const docBResult = result.value.results.find((r) => r.uuid === "doc-b");
			expect(docBResult).toBeDefined();
			expect(docBResult?.outcome).toBe("updated");

			// Assert: The ApplyReport contains all three entries
			expect(result.value.results.length).toBe(3);
			expect(result.value.writes).toBe(2);
			expect(result.value.blocks).toBe(1);

			// Assert: The run did NOT abort
			expect(
				result.value.results.filter((r) => r.outcome === "blocked").length,
			).toBe(1);
			expect(
				result.value.results.filter((r) => r.outcome === "updated").length,
			).toBe(2);

			// Assert: FakeTarget state reflects only docs A/B's successful writes
			const pageA = await target.getPage("page-a");
			expect(pageA.ok).toBe(true);
			if (!pageA.ok) return;

			expect(pageA.value.body).toBe("<h1>Doc A Runner</h1>"); // Updated

			const pageB = await target.getPage("page-b");
			expect(pageB.ok).toBe(true);
			if (!pageB.ok) return;

			expect(pageB.value.body).toBe("<h1>Doc B Runner</h1>"); // Updated

			const pageC = await target.getPage("page-c");
			expect(pageC.ok).toBe(true);
			if (!pageC.ok) return;

			expect(pageC.value.body).toBe("<h1>Doc C Remote</h1>"); // Unchanged
		});
	});
});
