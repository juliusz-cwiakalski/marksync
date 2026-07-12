// Integration test for idempotency (TC-INTEGRATION-005: second unchanged push writes 0).

import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Result } from "#domain/result";
import { computePlan, applyPlan } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { ensureCacheLayout } from "#app/cache";
import { mkdtempSync, rmSync } from "node:fs";

describe("idempotency integration test", () => {
	const baseConfig: ProjectConfig = {
		version: 1,
		root: ".",
		select: ["**/*.md"],
		exclude: [],
		hierarchy: "flat",
		targets: {
			default: {
				spaceId: "TEST-SPACE",
				parentPageId: "ROOT",
				url: "https://test.atlassian.net",
				email: "test@test.com",
				secretName: "TEST_SECRET",
			},
		},
		sync: {
			allowBranches: ["main"],
			granularity: "squash",
			stalePlanMinutes: 15,
		},
		render: {
			mermaid: {
				policy: "render",
				securityLevel: "strict",
				htmlLabels: false,
				deterministicIds: true,
			},
		},
		output: {
			format: "storage",
			color: "auto",
		},
		provenance: {
			visiblePanel: true,
		},
	};

	const baseLock: LockFile = {
		version: 1,
		targets: {
			default: {
				documents: {},
			},
		},
	};

	// TC-INTEGRATION-005: Second unchanged push → every entry NO_CHANGE → 0 writes (NFR-PERF-4)
	test("TC-INTEGRATION-005: Second unchanged push → every entry NO_CHANGE → 0 writes", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-idempotency-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;

			// Create 3 documents with UUIDs
			const docUuidA = "doc-019f56e4-18f5-7022-bfdf-5438918bb3bc";
			const docUuidB = "019f56e4-18f5-701b-bfdf-5438918bb3bc";
			const docUuidC = "019f56e4-18f5-701c-bfdf-5438918bb3bc";
			const pageIdA = "page-111";
			const pageIdB = "page-222";
			const pageIdC = "page-333";

			fakeRepo.setFile(
				"doc-a.md",
				`---
uuid: ${docUuidA}
---
# Doc A

This is doc A content.`,
			);

			fakeRepo.setFile(
				"doc-b.md",
				`---
uuid: ${docUuidB}
---
# Doc B

This is doc B content.`,
			);

			fakeRepo.setFile(
				"doc-c.md",
				`---
uuid: ${docUuidC}
---
# Doc C

This is doc C content.`,
			);

			// Setup bindings for 3 docs
			const bindingA: PageBinding = {
				uuid: docUuidA,
				sourcePath: "doc-a.md",
				pageId: pageIdA,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash-a",
				renderedBodyHash: "rendered-hash-a",
				remoteBodyHash: "rendered-hash-a", // Remote matches base
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			const bindingB: PageBinding = {
				uuid: docUuidB,
				sourcePath: "doc-b.md",
				pageId: pageIdB,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash-b",
				renderedBodyHash: "rendered-hash-b",
				remoteBodyHash: "rendered-hash-b", // Remote matches base
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			const bindingC: PageBinding = {
				uuid: docUuidC,
				sourcePath: "doc-c.md",
				pageId: pageIdC,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash-c",
				renderedBodyHash: "rendered-hash-c",
				remoteBodyHash: "rendered-hash-c", // Remote matches base
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuidA] = bindingA;
			lock.targets.default.documents[docUuidB] = bindingB;
			lock.targets.default.documents[docUuidC] = bindingC;

			// Add fixture pages at version 1 (all match bindings)
			fakeTarget.addFixture({
				id: pageIdA,
				title: "Doc A",
				version: 1,
				body: "<h1>Doc A</h1>",
				spaceId: "TEST-SPACE",
			});

			fakeTarget.addFixture({
				id: pageIdB,
				title: "Doc B",
				version: 1,
				body: "<h1>Doc B</h1>",
				spaceId: "TEST-SPACE",
			});

			fakeTarget.addFixture({
				id: pageIdC,
				title: "Doc C",
				version: 1,
				body: "<h1>Doc C</h1>",
				spaceId: "TEST-SPACE",
			});

			// First push: computePlan + applyPlan
			ensureCacheLayout(tmpCacheDir);
			const firstPlanResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(firstPlanResult.ok).toBe(true);
			const firstPlan = firstPlanResult.value!;

			// First plan should have all NO_CHANGE entries (unchanged from base)
			expect(firstPlan.entries).toHaveLength(3);
			for (const entry of firstPlan.entries) {
				expect(entry.action.kind).toBe("NoOp");
			}

			const firstApplyResult = await applyPlan(firstPlan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(firstApplyResult.ok).toBe(true);
			const firstReport = firstApplyResult.value!;
			expect(firstReport.writes).toBe(0); // First push: 0 writes (unchanged)
			expect(firstReport.skips).toBe(3); // 3 skips (noop)

			// Reset the mock target's write counter to 0
			fakeTarget.resetWriteCounter();

			// Second push: computePlan (no changes to local docs or remote)
			const secondPlanResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(secondPlanResult.ok).toBe(true);
			const secondPlan = secondPlanResult.value!;

			// Assert the second Plan has 3 entries, all with state: NO_CHANGE and action: NoOp
			expect(secondPlan.entries).toHaveLength(3);
			for (const entry of secondPlan.entries) {
				expect(entry.action.kind).toBe("NoOp");
			}

			// Apply plan (second push)
			const secondApplyResult = await applyPlan(secondPlan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(secondApplyResult.ok).toBe(true);
			const secondReport = secondApplyResult.value!;

			// Assert the write counter remains 0 (NO calls to createPage or updatePage)
			expect(fakeTarget.getWriteCount()).toBe(0);
			expect(fakeTarget.createPageCalls).toHaveLength(0);
			expect(fakeTarget.updatePageCalls).toHaveLength(0);

			// Assert the ApplyReport has 3 skips (noop) and 0 writes
			expect(secondReport.writes).toBe(0);
			expect(secondReport.skips).toBe(3);
			expect(secondReport.blocks).toBe(0);

			// Assert all results are noop
			for (const resultEntry of secondReport.results) {
				expect(resultEntry.outcome).toBe("noop");
			}
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});
});
