// Integration tests for concurrency control: two-runner overlap (TC-CONC-005, TC-CONC-006).

import { afterAll, beforeEach, beforeAll, describe, expect, it } from "bun:test";
import { applyPlan, type Plan } from "#app/push-flow";
import type { LockFile } from "#domain/config/lock-types";
import { generateUuidV7 } from "#domain/identity/uuid";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { ensureCacheLayout } from "#app/cache";

describe("concurrency control overlap", () => {
	let tmpCacheDir: string;

	beforeAll(() => {
		tmpCacheDir = mkdtempSync(join(tmpdir(), "gh24-conc-overlap-"));
	});

	beforeEach(() => {
		ensureCacheLayout(tmpCacheDir);
	});

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
	});

	afterEach(() => {
		ensureCacheLayout(tmpCacheDir);
	});
	describe("TC-CONC-005: single shared-state fake (NFR-REL-5)", () => {
		it("B wins, A aborts with StalePlan, 0 overwrites", async () => {
			// Setup: Create a plan A (older op-id, timestamp T1)
			const runIdA = generateUuidV7();
			const planA: Plan = {
				runId: runIdA,
				operationId: `op_${runIdA}`,
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
						renderedBody: "<h1>Doc A Runner A</h1>",
					},
				],
				provenance: {
					headCommit: "commit-a",
					commitCount: 1,
					subjects: ["A"],
				},
				warnings: [],
			};

			// Setup: Create a plan B (newer op-id, timestamp T2 > T1)
			// Use a known timestamp offset to ensure T2 > T1
			await new Promise((resolve) => setTimeout(resolve, 10));
			const runIdB = generateUuidV7();
			const planB: Plan = {
				runId: runIdB,
				operationId: `op_${runIdB}`,
				entries: [
					{
						uuid: "doc-a",
						sourcePath: "/doc-a.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-b",
							rawHash: "raw-b",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Runner B</h1>",
					},
				],
				provenance: {
					headCommit: "commit-b",
					commitCount: 1,
					subjects: ["B"],
				},
				warnings: [],
			};

			// Setup: Single shared FakeTarget instance
			const target = new FakeTarget();
			target.addFixture({
				id: "page-123",
				title: "Doc A",
				version: 1,
				body: "<h1>Initial</h1>",
			});

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

			// Execute: Runner B applies plan B first
			const resultB = await applyPlan(planB, target, lock, opts);

			// Assert: Runner B succeeded
			expect(resultB.ok).toBe(true);
			if (!resultB.ok) return;

			expect(resultB.value.writes).toBe(1);
			expect(resultB.value.blocks).toBe(0);
			expect(target.updatePageCalls.length).toBe(1);

			// Assert: Runner B's operationId is stored in the property
			const getPropertyResult = await target.getProperty(
				"page-123",
				"marksync.metadata",
			);
			expect(getPropertyResult.ok).toBe(true);
			if (!getPropertyResult.ok) return;

			const metadataB = JSON.parse(getPropertyResult.value ?? "{}");
			expect(metadataB.operationId).toBe(planB.operationId);

			// Clear call trackers before runner A applies
			target.updatePageCalls = [];

			// Execute: Runner A applies plan A second
			const resultA = await applyPlan(planA, target, lock, opts);

			// Assert: Runner A blocked with StalePlan
			expect(resultA.ok).toBe(true);
			if (!resultA.ok) return;

			expect(resultA.value.writes).toBe(0);
			expect(resultA.value.blocks).toBe(1);

			const blockedResult = resultA.value.results[0];
			expect(blockedResult.outcome).toBe("blocked");
			expect(blockedResult.error?.kind).toBe("StalePlan");
			expect(blockedResult.error?.operationId).toBe(planA.operationId);

			// Assert: Runner A made 0 writes for that document
			expect(target.updatePageCalls.length).toBe(0);

			// Assert: Runner B's content survives in the fake target
			const page = await target.getPage("page-123");
			expect(page.ok).toBe(true);
			if (!page.ok) return;

			expect(page.value.body).toBe("<h1>Doc A Runner B</h1>");
		});
	});

	describe("TC-CONC-006: separate instances, shared backing map (NFR-REL-10)", () => {
		it("B wins, A aborts with StalePlan, 0 silent overwrites", async () => {
			// Setup: Create a shared backing map (simulates Confluence storage)
			const sharedBackingMap = {
				pages: new Map<string, import("#domain/target/port").Page>(),
				versionCounter: new Map<string, number>(),
				properties: new Map<string, string>(),
			};

			// Add initial page to shared backing map
			sharedBackingMap.pages.set("page-456", {
				id: "page-456",
				title: "Doc A",
				version: 1,
				body: "<h1>Initial</h1>",
			});
			sharedBackingMap.versionCounter.set("page-456", 1);

			// Setup: Create Runner A's FakeTarget with shared backing map
			const targetA = new FakeTarget(sharedBackingMap);

			// Setup: Create Runner B's FakeTarget with same shared backing map
			const targetB = new FakeTarget(sharedBackingMap);

			// Setup: Create a plan A (older op-id, timestamp T1)
			const runIdA = generateUuidV7();
			const planA: Plan = {
				runId: runIdA,
				operationId: `op_${runIdA}`,
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
						renderedBody: "<h1>Doc A Runner A</h1>",
					},
				],
				provenance: {
					headCommit: "commit-a",
					commitCount: 1,
					subjects: ["A"],
				},
				warnings: [],
			};

			// Setup: Create a plan B (newer op-id, timestamp T2 > T1)
			await new Promise((resolve) => setTimeout(resolve, 10));
			const runIdB = generateUuidV7();
			const planB: Plan = {
				runId: runIdB,
				operationId: `op_${runIdB}`,
				entries: [
					{
						uuid: "doc-a",
						sourcePath: "/doc-a.md",
						state: { kind: "LOCAL_AHEAD" },
						action: { kind: "Update", hashes: {} },
						hashes: {
							canonicalHash: "hash-b",
							rawHash: "raw-b",
							title: "Doc A",
						},
						renderedBody: "<h1>Doc A Runner B</h1>",
					},
				],
				provenance: {
					headCommit: "commit-b",
					commitCount: 1,
					subjects: ["B"],
				},
				warnings: [],
			};

			const lock: LockFile = {
				version: 1,
				targets: {
					default: {
						targetId: "default",
						parentPageId: "parent-456",
						documents: {
							"doc-a": {
								uuid: "doc-a",
								sourcePath: "/doc-a.md",
								pageId: "page-456",
								parentPageId: "parent-456",
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

			// Execute: Runner B applies plan B first
			const resultB = await applyPlan(planB, targetB, lock, opts);

			// Assert: Runner B succeeded
			expect(resultB.ok).toBe(true);
			if (!resultB.ok) return;

			expect(resultB.value.writes).toBe(1);
			expect(resultB.value.blocks).toBe(0);
			expect(targetB.updatePageCalls.length).toBe(1);

			// Assert: Runner B's operationId is stored in the shared property map
			const getPropertyResult = await targetA.getProperty(
				"page-456",
				"marksync.metadata",
			);
			expect(getPropertyResult.ok).toBe(true);
			if (!getPropertyResult.ok) return;

			const metadataB = JSON.parse(getPropertyResult.value ?? "{}");
			expect(metadataB.operationId).toBe(planB.operationId);

			// Execute: Runner A applies plan A second (separate instance, reads shared map)
			const resultA = await applyPlan(planA, targetA, lock, opts);

			// Assert: Runner A blocked with StalePlan
			expect(resultA.ok).toBe(true);
			if (!resultA.ok) return;

			expect(resultA.value.writes).toBe(0);
			expect(resultA.value.blocks).toBe(1);

			const blockedResult = resultA.value.results[0];
			expect(blockedResult.outcome).toBe("blocked");
			expect(blockedResult.error?.kind).toBe("StalePlan");
			expect(blockedResult.error?.operationId).toBe(planA.operationId);

			// Assert: Runner A made 0 writes for that document
			expect(targetA.updatePageCalls.length).toBe(0);

			// Assert: 0 silent overwrites — Runner B's content survives
			const page = await targetA.getPage("page-456");
			expect(page.ok).toBe(true);
			if (!page.ok) return;

			expect(page.value.body).toBe("<h1>Doc A Runner B</h1>");
		});
	});
});
