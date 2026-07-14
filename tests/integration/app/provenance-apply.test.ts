// GH-27 integration tests for provenance panel and property (TC-PROV-004, TC-PROV-007).

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import { computePlan, applyPlan, type Plan } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { ensureCacheLayout } from "#app/cache";
import { mkdtempSync, rmSync } from "node:fs";
import { generateUuidV7 } from "#domain/identity/uuid";

describe("GH-27 provenance integration tests", () => {
	const baseConfig: ProjectConfig = {
		version: 1,
		root: ".",
		select: ["**/*.md"],
		exclude: [],
		hierarchy: "flat",
		targets: {
			default: {
				type: "confluence",
				spaceKey: "TEST",
				parentPageId: "ROOT",
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

	const emptyLock: LockFile = {
		version: 1,
		targets: { default: { documents: {} } },
	};

	let tmpCacheDir: string;

	beforeAll(() => {
		tmpCacheDir = mkdtempSync(join(tmpdir(), "gh27-provenance-"));
	});

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
	});

	describe("TC-PROV-007 — false-drift NO_CHANGE (hard AC)", () => {
		it("identical content at different times → NO_CHANGE (panel excluded from HAST hash)", async () => {
			ensureCacheLayout(tmpCacheDir);
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			// Create a document with UUID
			const docUuid = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
			fakeRepo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Test Document

This is test content.`,
			);

			// First sync: Create the page
			const plan1Result = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(plan1Result.ok).toBe(true);
			const plan1 = plan1Result.value!;

			const apply1Result = await applyPlan(plan1, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});
			expect(apply1Result.ok).toBe(true);
			const report1 = apply1Result.value!;
			expect(report1.writes).toBe(1); // Created

			// Get the binding after first sync
			const binding1 = lock.targets.default.documents[docUuid];
			expect(binding1).toBeDefined();
			const pageId1 = binding1!.pageId;

			// Assert the written body contains the provenance panel
			const page1Result = await fakeTarget.getPage(pageId1);
			expect(page1Result.ok).toBe(true);
			const body1 = page1Result.value!.body;
			expect(body1).toContain("<!-- marksync:provenance-panel -->");
			expect(body1).toContain('<ac:structured-macro ac:name="info">');
			expect(body1).toContain("doc.md");
			expect(body1).toContain("(main)");

			// Assert the property was written
			const property1Result = await fakeTarget.getProperty(
				pageId1,
				"marksync.metadata",
			);
			expect(property1Result.ok).toBe(true);
			expect(property1Result.value).toBeDefined();

			// Capture the canonical hash after first sync
			const canonicalHash1 = binding1!.renderedBodyHash;
			expect(canonicalHash1).toBeDefined();

			// Reset target write counters to measure second sync
			fakeTarget.resetWriteCounter();
			fakeTarget.createPageCalls = [];
			fakeTarget.updatePageCalls = [];
			fakeTarget.putPropertyCalls = [];

			// Simulate time passage (wait a bit to ensure different timestamp)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Second sync: identical content, different time
			// This should classify as NO_CHANGE because:
			// - local.canonicalHash (from HAST) == binding.renderedBodyHash
			// - remote.bodyHash == binding.remoteBodyHash
			// - Panel is appended post-render, so it's NOT in the HAST hash
			const plan2Result = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(plan2Result.ok).toBe(true);
			const plan2 = plan2Result.value!;

			// The plan should classify as NO_CHANGE
			expect(plan2.entries).toHaveLength(1);
			expect(plan2.entries[0].action.kind).toBe("NoOp");

			const apply2Result = await applyPlan(plan2, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});
			expect(apply2Result.ok).toBe(true);
			const report2 = apply2Result.value!;

			// KEY ASSERTION: NO_CHANGE → 0 writes
			expect(report2.writes).toBe(0);
			expect(report2.skips).toBe(1);
			expect(report2.blocks).toBe(0);

			// KEY ASSERTION: 0 calls to createPage/updatePage/putProperty
			expect(fakeTarget.getWriteCount()).toBe(0);
			expect(fakeTarget.createPageCalls).toHaveLength(0);
			expect(fakeTarget.updatePageCalls).toHaveLength(0);
			expect(fakeTarget.putPropertyCalls).toHaveLength(0);

			// Assert the outcome is noop
			expect(report2.results[0].outcome).toBe("noop");

			// KEY ASSERTION: canonical hash is identical between syncs
			// This proves the panel was excluded from the hash by construction
			const binding2 = lock.targets.default.documents[docUuid];
			expect(binding2).toBeDefined();
			const canonicalHash2 = binding2!.renderedBodyHash;
			expect(canonicalHash2).toBe(canonicalHash1);
		});
	});

	describe("TC-PROV-004 — property readable after apply", () => {
		it("property contains all 14 fields with correct types and no subjects (privacy)", async () => {
			ensureCacheLayout(tmpCacheDir);
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			// Create a document with UUID
			const docUuid = generateUuidV7();
			fakeRepo.setFile(
				"docs/guide/api.md",
				`---
marksync:
  uuid: ${docUuid}
---
# API Guide

This is the API documentation.`,
			);

			// Sync the document
			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});
			expect(applyResult.ok).toBe(true);
			const report = applyResult.value!;
			expect(report.writes).toBe(1);

			// Get the binding to find the page ID
			const binding = lock.targets.default.documents[docUuid];
			expect(binding).toBeDefined();
			const pageId = binding!.pageId;

			// Read the marksync.metadata property
			const propertyResult = await fakeTarget.getProperty(
				pageId,
				"marksync.metadata",
			);
			expect(propertyResult.ok).toBe(true);
			const propertyJson = propertyResult.value;
			expect(propertyJson).toBeDefined();

			// Parse the property JSON
			let property: Record<string, unknown>;
			expect(() => {
				property = JSON.parse(propertyJson!);
			}).not.toThrow();

			// Assert all 14 required fields are present with correct types
			expect(property!.schemaVersion).toBe(1);
			expect(typeof property!.schemaVersion).toBe("number");

			expect(property!.projectId).toBe("default");
			expect(typeof property!.projectId).toBe("string");

			expect(property!.targetId).toBe("default");
			expect(typeof property!.targetId).toBe("string");

			expect(property!.documentId).toBe(docUuid);
			expect(typeof property!.documentId).toBe("string");

			expect(property!.sourcePath).toBe("docs/guide/api.md");
			expect(typeof property!.sourcePath).toBe("string");

			expect(property!.sourceCommit).toBeDefined();
			expect(typeof property!.sourceCommit).toBe("string");

			expect(property!.sourceBranch).toBe("main");
			expect(typeof property!.sourceBranch).toBe("string");

			expect(property!.sourceContentHash).toBeDefined();
			expect(typeof property!.sourceContentHash).toBe("string");

			expect(property!.renderedBodyHash).toBeDefined();
			expect(typeof property!.renderedBodyHash).toBe("string");

			expect(property!.operationId).toBeDefined();
			expect(typeof property!.operationId).toBe("string");

			expect(property!.synchronizedAt).toBeDefined();
			expect(typeof property!.synchronizedAt).toBe("string");

			expect(property!.toolVersion).toBeDefined();
			expect(typeof property!.toolVersion).toBe("string");

			expect(property!.commitCount).toBeDefined();
			expect(typeof property!.commitCount).toBe("number");

			expect(property!.trimMarker).toBeDefined();
			expect(typeof property!.trimMarker).toBe("string");

			// KEY ASSERTION: NO subjects field (ADR-0010 privacy)
			expect(property!.subjects).toBeUndefined();

			// KEY ASSERTION: No commit subject strings in the property
			const jsonStr = JSON.stringify(property);
			expect(jsonStr).not.toContain('"subjects"');
			// Check that no conventional commit prefixes leak
			expect(jsonStr).not.toContain("feat:");
			expect(jsonStr).not.toContain("fix:");
			expect(jsonStr).not.toContain("docs:");
			expect(jsonStr).not.toContain("chore:");

			// Assert trimMarker is a string (may be empty if no truncation)
			expect(property!.trimMarker).toEqual(expect.any(String));

			// Sanity check: property is valid JSON (re-parse)
			expect(() => JSON.parse(jsonStr)).not.toThrow();
		});

		it("property fields are populated correctly from provenance input", async () => {
			ensureCacheLayout(tmpCacheDir);
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			// Set up fake repo with branch and commits
			const docUuid = generateUuidV7();
			fakeRepo.setFile(
				"test.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Test

Content.`,
			);

			const planResult = await computePlan(
				baseConfig,
				lock,
				fakeRepo,
				fakeTarget,
			);
			expect(planResult.ok).toBe(true);
			const plan = planResult.value!;

			// Verify plan has provenance data
			expect(plan.provenance).toBeDefined();
			expect(plan.provenance.sourceBranch).toBe("main");
			expect(plan.provenance.headCommit).toBeDefined();
			expect(plan.provenance.commitCount).toBeGreaterThanOrEqual(0);

			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});
			expect(applyResult.ok).toBe(true);

			const binding = lock.targets.default.documents[docUuid];
			expect(binding).toBeDefined();

			// Read and parse property
			const propertyResult = await fakeTarget.getProperty(
				binding!.pageId,
				"marksync.metadata",
			);
			expect(propertyResult.ok).toBe(true);
			const property = JSON.parse(propertyResult.value!);

			// Assert provenance fields match plan
			expect(property.sourceBranch).toBe(plan.provenance.sourceBranch);
			expect(property.sourceCommit).toBe(plan.provenance.headCommit);
			expect(property.commitCount).toBe(plan.provenance.commitCount);
			expect(property.operationId).toBe(plan.operationId);
		});
	});
});