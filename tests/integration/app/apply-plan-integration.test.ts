// Integration tests for applyPlan safety invariants (TC-INTEGRATION-001..004, 007, 008).

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

describe("applyPlan integration tests", () => {
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

	// TC-INTEGRATION-001: REMOTE_AHEAD entry → 0 writes, block reported (INV-SAFE-1)
	test("TC-INTEGRATION-001: REMOTE_AHEAD → 0 writes, block reported", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuid = "019f56e4-18f5-701a-bfdf-5438918bb3bc";
			const pageId = "page-123";

			// Add a document with UUID
			fakeRepo.setFile(
				"doc-a.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc A

This is doc A content.`,
			);

			// Setup binding with base version
			const binding: PageBinding = {
				uuid: docUuid,
				sourcePath: "doc-a.md",
				pageId,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "old-local-hash",
				renderedBodyHash: "old-rendered-hash",
				remoteBodyHash: "old-remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuid] = binding;

			// Add fixture page with version 2 (ahead of base's version 1)
			fakeTarget.addFixture({
				id: pageId,
				title: "Doc A",
				version: 2, // Ahead of base's version 1
				body: "<h1>Doc A</h1>",
				spaceId: "TEST-SPACE",
			});

			// Compute plan
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has one REMOTE_AHEAD entry with Block action
			expect(plan.entries).toHaveLength(1);
			const entry = plan.entries[0];
			expect(entry.uuid).toBe(docUuid);
			expect(entry.action.kind).toBe("Block");

			// Apply plan
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(0); // 0 writes
			expect(report.blocks).toBe(1); // 1 block

			// Assert NO updatePage call (0 writes for blocked doc)
			expect(fakeTarget.updatePageCalls).toHaveLength(0);
			expect(fakeTarget.createPageCalls).toHaveLength(0);

			// Assert the block carries the correct error
			const resultEntry = report.results[0];
			expect(resultEntry.outcome).toBe("blocked");
			expect(resultEntry.error?.kind).toBe("Conflict");
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	// TC-INTEGRATION-002: DIVERGED entry → 0 writes, block reported (INV-SAFE-1)
	test("TC-INTEGRATION-002: DIVERGED → 0 writes, block reported", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuid = "019f56e4-18f5-701b-bfdf-5438918bb3bc";
			const pageId = "page-456";

			// Add a document with UUID (different content than base)
			fakeRepo.setFile(
				"doc-b.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc B

This is NEW local content.`,
			);

			// Setup binding with base version
			const binding: PageBinding = {
				uuid: docUuid,
				sourcePath: "doc-b.md",
				pageId,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "new-local-hash", // Local changed
				renderedBodyHash: "old-rendered-hash",
				remoteBodyHash: "old-remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuid] = binding;

			// Add fixture page with different content (version 2, also changed)
			fakeTarget.addFixture({
				id: pageId,
				title: "Doc B",
				version: 2, // Remote also advanced
				body: "<h1>Doc B</h1><p>This is REMOTE content.</p>", // Different content
				spaceId: "TEST-SPACE",
			});

			// Compute plan
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has one DIVERGED entry with Block action
			expect(plan.entries).toHaveLength(1);
			const entry = plan.entries[0];
			expect(entry.uuid).toBe(docUuid);
			expect(entry.action.kind).toBe("Block");

			// Apply plan
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(0); // 0 writes
			expect(report.blocks).toBe(1); // 1 block

			// Assert NO updatePage call (0 writes for blocked doc)
			expect(fakeTarget.updatePageCalls).toHaveLength(0);
			expect(fakeTarget.createPageCalls).toHaveLength(0);

			// Assert the block carries the correct error
			const resultEntry = report.results[0];
			expect(resultEntry.outcome).toBe("blocked");
			expect(resultEntry.error?.kind).toBe("Conflict");
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	// TC-INTEGRATION-003: REMOTE_MISSING entry → 0 re-creates, block reported (INV-SAFE-2)
	test("TC-INTEGRATION-003: REMOTE_MISSING → 0 re-creates, block reported", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuid = "019f56e4-18f5-701c-bfdf-5438918bb3bc";
			const pageId = "page-789";

			// Add a document with UUID
			fakeRepo.setFile(
				"doc-c.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc C

This is doc C content.`,
			);

			// Setup binding with base version
			const binding: PageBinding = {
				uuid: docUuid,
				sourcePath: "doc-c.md",
				pageId,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash",
				renderedBodyHash: "rendered-hash",
				remoteBodyHash: "remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuid] = binding;

			// DO NOT add fixture page - simulate remote missing (404)

			// Compute plan
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has one REMOTE_MISSING entry with Block action
			expect(plan.entries).toHaveLength(1);
			const entry = plan.entries[0];
			expect(entry.uuid).toBe(docUuid);
			expect(entry.action.kind).toBe("Block");

			// Apply plan (without --rebind)
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(0); // 0 writes
			expect(report.blocks).toBe(1); // 1 block

			// Assert NO createPage call (0 re-creates for blocked doc)
			expect(fakeTarget.createPageCalls).toHaveLength(0);
			expect(fakeTarget.updatePageCalls).toHaveLength(0);

			// Assert the block carries the correct error
			const resultEntry = report.results[0];
			expect(resultEntry.outcome).toBe("blocked");
			expect(resultEntry.error?.kind).toBe("RemoteMissing");
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	// TC-INTEGRATION-004: Stale baseVersion → 409 Conflict surfaces as drift, no retry (NFR-REL-5)
	test("TC-INTEGRATION-004: Stale baseVersion → 409 surfaces as drift, no retry", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuid = "019f56e4-18f5-701d-bfdf-5438918bb3bc";
			const pageId = "page-abc";

			// Add a document with UUID
			fakeRepo.setFile(
				"doc-d.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc D

This is doc D content.`,
			);

			// Setup binding with base version 1
			const binding: PageBinding = {
				uuid: docUuid,
				sourcePath: "doc-d.md",
				pageId,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash",
				renderedBodyHash: "rendered-hash",
				remoteBodyHash: "remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuid] = binding;

			// Add fixture page at version 1 (matches binding)
			fakeTarget.addFixture({
				id: pageId,
				title: "Doc D",
				version: 1,
				body: "<h1>Doc D</h1>",
				spaceId: "TEST-SPACE",
			});

			// Compute plan (at plan-time, remote is version 1 → LOCAL_AHEAD)
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has one LOCAL_AHEAD entry with Update action
			expect(plan.entries).toHaveLength(1);
			const entry = plan.entries[0];
			expect(entry.uuid).toBe(docUuid);
			expect(entry.action.kind).toBe("Update");

			// Simulate remote advancement between plan-time and apply-time
			fakeTarget.advanceVersion(pageId); // Now at version 2

			// Apply plan
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.blocks).toBe(1); // 1 block

			// Assert updatePage was called ONCE with stale baseVersion
			expect(fakeTarget.updatePageCalls).toHaveLength(1);
			const updateCall = fakeTarget.updatePageCalls[0];
			expect(updateCall.baseVersion).toBe(1); // Stale baseVersion

			// Assert applyPlan does NOT retry (only 1 call)
			expect(fakeTarget.updatePageCalls).toHaveLength(1);

			// Assert the block carries the correct error
			const resultEntry = report.results[0];
			expect(resultEntry.outcome).toBe("blocked");
			expect(resultEntry.error?.kind).toBe("Conflict");
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	// TC-INTEGRATION-007: Per-document isolation — one Conflict doesn't abort the run
	test("TC-INTEGRATION-007: Per-document isolation — Conflict on doc A, doc B still applies", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuidA = "doc-uuid-e";
			const docUuidB = "019f56e4-18f5-701f-bfdf-5438918bb3bc";
			const pageIdA = "page-111";
			const pageIdB = "page-222";

			// Add two documents
			fakeRepo.setFile(
				"doc-e.md",
				`---
marksync:
  uuid: ${docUuidA}
---
# Doc E

This is doc E content.`,
			);

			fakeRepo.setFile(
				"doc-f.md",
				`---
marksync:
  uuid: ${docUuidB}
---
# Doc F

This is doc F content.`,
			);

			// Setup bindings
			const bindingA: PageBinding = {
				uuid: docUuidA,
				sourcePath: "doc-e.md",
				pageId: pageIdA,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "local-hash",
				renderedBodyHash: "old-rendered-hash",
				remoteBodyHash: "old-remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			const bindingB: PageBinding = {
				uuid: docUuidB,
				sourcePath: "doc-f.md",
				pageId: pageIdB,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "new-local-hash", // Local ahead
				renderedBodyHash: "old-rendered-hash",
				remoteBodyHash: "old-remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuidA] = bindingA;
			lock.targets.default.documents[docUuidB] = bindingB;

			// Add fixture pages: doc A at version 2 (ahead), doc B at version 1
			fakeTarget.addFixture({
				id: pageIdA,
				title: "Doc E",
				version: 2, // Ahead - will be REMOTE_AHEAD
				body: "<h1>Doc E</h1>",
				spaceId: "TEST-SPACE",
			});

			fakeTarget.addFixture({
				id: pageIdB,
				title: "Doc F",
				version: 1, // Matches base - will be LOCAL_AHEAD
				body: "<h1>Doc F</h1>",
				spaceId: "TEST-SPACE",
			});

			// Compute plan
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has 2 entries: A → Block, B → Update
			expect(plan.entries).toHaveLength(2);
			const entryA = plan.entries.find((e) => e.uuid === docUuidA);
			const entryB = plan.entries.find((e) => e.uuid === docUuidB);
			expect(entryA?.action.kind).toBe("Block"); // REMOTE_AHEAD
			expect(entryB?.action.kind).toBe("Update"); // LOCAL_AHEAD

			// Apply plan
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(1); // 1 write (doc B only)
			expect(report.blocks).toBe(1); // 1 block (doc A)

			// Assert updatePage was called ONCE (for doc B only, not for doc A)
			expect(fakeTarget.updatePageCalls).toHaveLength(1);
			expect(fakeTarget.updatePageCalls[0].pageId).toBe(pageIdB);

			// Assert the function returns success (does NOT throw or abort)
			expect(applyResult.ok).toBe(true);
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	// TC-INTEGRATION-008: Lock + property atomicity — after successful apply, saveLock + putProperty
	test("TC-INTEGRATION-008: Lock + property atomicity — saveLock + putProperty after apply", async () => {
		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-apply-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(baseLock)) as LockFile;
			const docUuid = "019f56e4-18f5-7020-bfdf-5438918bb3bc";
			const pageId = "page-333";

			// Add a document with UUID
			fakeRepo.setFile(
				"doc-g.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc G

This is doc G content.`,
			);

			// Setup binding with base version
			const binding: PageBinding = {
				uuid: docUuid,
				sourcePath: "doc-g.md",
				pageId,
				parentPageId: "ROOT",
				pageVersion: 1,
				sourceCommit: "base-sha",
				sourceContentHash: "new-local-hash", // Local ahead
				renderedBodyHash: "old-rendered-hash",
				remoteBodyHash: "old-remote-hash",
				attachmentHashes: {},
				operationId: "op-old",
				synchronizedAt: "2025-01-01T00:00:00Z",
				toolVersion: "1.0.0",
			};

			lock.targets.default.documents[docUuid] = binding;

			// Add fixture page at version 1 (matches binding)
			fakeTarget.addFixture({
				id: pageId,
				title: "Doc G",
				version: 1,
				body: "<h1>Doc G</h1>",
				spaceId: "TEST-SPACE",
			});

			// Compute plan
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Assert plan has one LOCAL_AHEAD entry with Update action
			expect(plan.entries).toHaveLength(1);
			const entry = plan.entries[0];
			expect(entry.uuid).toBe(docUuid);
			expect(entry.action.kind).toBe("Update");

			// Apply plan
			ensureCacheLayout(tmpCacheDir);
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(1); // 1 write

			// Assert updatePage was called once
			expect(fakeTarget.updatePageCalls).toHaveLength(1);
			expect(fakeTarget.updatePageCalls[0].pageId).toBe(pageId);

			// Assert putProperty was called with the correct metadata
			expect(fakeTarget.putPropertyCalls).toHaveLength(1);
			const putCall = fakeTarget.putPropertyCalls[0];
			expect(putCall.pageId).toBe(pageId);
			expect(putCall.key).toBe("marksync.metadata");
			expect(putCall.value).toContain(docUuid);

			// Assert the lock file was updated (sourceCommit should be updated)
			const updatedBinding = lock.targets.default.documents[docUuid];
			expect(updatedBinding.sourceCommit).toBe(fakeRepo.headSha().value);
			expect(updatedBinding.operationId).toBe(plan.operationId);
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});
});
