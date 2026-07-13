// GH-62 integration test: idempotent sync with Confluence normalization simulation.
// Validates that after Create/Update + fetch-back, a second unchanged sync produces
// all NoOp (0 writes, 0 blocks) even when Confluence normalizes the XHTML body.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import { computePlan, applyPlan } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { ensureCacheLayout } from "#app/cache";
import { rawHash } from "#domain/state/hashes";
import { Result as Res } from "#domain/result";

const config: ProjectConfig = {
	version: 1,
	root: ".",
	select: ["**/*.md"],
	exclude: [],
	hierarchy: "flat",
	targets: {
		default: { type: "confluence", spaceKey: "TEST", parentPageId: "ROOT" },
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
	output: { format: "storage", color: "auto" },
	provenance: { visiblePanel: true },
};

const emptyLock: LockFile = {
	version: 1,
	targets: { default: { documents: {} } },
};

/** Simulate Confluence Storage XHTML normalization. */
function confluenceNormalize(body: string): string {
	return body.replace(/<hr\/>/g, "<hr />").replace(/—/g, "&mdash;");
}

describe("GH-62: idempotent sync with Confluence normalization", () => {
	test("TC-IDEM-001: Create → fetch-back → second sync = 0 writes, 0 blocks", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh62-idem-"));
		try {
			const repo = new FakeRepository();
			const target = new FakeTarget();
			target.bodyNormalizer = confluenceNormalize;
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			const uuid = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
			repo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${uuid}
---
# Doc

Content with — em dash and <hr/> rule.`,
			);

			ensureCacheLayout(cacheDir);

			// First sync: Create
			const plan1 = await computePlan(config, lock, repo, target);
			expect(plan1.ok).toBe(true);
			if (!plan1.ok) return;
			expect(plan1.value.entries).toHaveLength(1);
			expect(plan1.value.entries[0].action.kind).toBe("Create");

			const apply1 = await applyPlan(plan1.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});
			expect(apply1.ok).toBe(true);
			if (!apply1.ok) return;
			expect(apply1.value.writes).toBe(1);
			expect(apply1.value.blocks).toBe(0);

			// Verify lock has remoteBodyHash = rawHash(normalized body), NOT canonicalHash
			const binding = lock.targets.default.documents[uuid];
			expect(binding).toBeDefined();
			// remoteBodyHash should be a raw hash (sha256:...), not "fixture-hash"
			expect(binding.remoteBodyHash).not.toBe("fixture-hash");
			expect(binding.remoteBodyHash.startsWith("sha256:")).toBe(true);

			// Second sync: should be all NoOp (0 writes, 0 blocks)
			target.resetWriteCounter();
			target.getPageCalls.length = 0;

			const plan2 = await computePlan(config, lock, repo, target);
			expect(plan2.ok).toBe(true);
			if (!plan2.ok) return;
			expect(plan2.value.entries).toHaveLength(1);
			expect(plan2.value.entries[0].action.kind).toBe("NoOp");

			const apply2 = await applyPlan(plan2.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});
			expect(apply2.ok).toBe(true);
			if (!apply2.ok) return;

			expect(apply2.value.writes).toBe(0);
			expect(apply2.value.blocks).toBe(0);
			expect(apply2.value.skips).toBe(1);
			expect(target.getWriteCount()).toBe(0);
		} finally {
			rmSync(cacheDir, { recursive: true, force: true });
		}
	});

	test("TC-IDEM-002: Update → fetch-back → second sync = 0 writes, 0 blocks", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh62-idem-update-"));
		try {
			const repo = new FakeRepository();
			const target = new FakeTarget();
			target.bodyNormalizer = confluenceNormalize;

			const uuid = "019f56e4-18f5-7024-bfdf-5438918bb3bd";
			const pageId = "page-existing-001";
			repo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${uuid}
---
# Doc

Updated content with — em dash.`,
			);

			// Pre-bind the page with STALE hashes (local has changed)
			// FakeTarget.renderBody always returns hash "fixture-hash"
			// So local.canonicalHash = "fixture-hash"
			// Set binding.renderedBodyHash to something DIFFERENT → localChanged = true → LOCAL_AHEAD → Update
			// Set binding.remoteBodyHash to match the remote body → remoteChanged = false
			const remoteBody = "<h1>Old</h1>";
			const lock: LockFile = {
				version: 1,
				targets: {
					default: {
						documents: {
							[uuid]: {
								uuid,
								sourcePath: "doc.md",
								pageId,
								parentPageId: "ROOT",
								pageVersion: 1,
								sourceCommit: "old-sha",
								sourceContentHash: "old-raw",
								renderedBodyHash: "stale-rendered-hash", // ≠ local canonical → local changed
								remoteBodyHash: rawHash(remoteBody), // = remote body → remote unchanged
								attachmentHashes: {},
								operationId: "op-old",
								synchronizedAt: "2025-01-01T00:00:00Z",
								toolVersion: "1.0.0",
							},
						},
					},
				},
			};

			// Add the existing page to FakeTarget
			target.addFixture({
				id: pageId,
				title: "Doc",
				version: 1,
				body: remoteBody,
				spaceId: "TEST",
			});

			ensureCacheLayout(cacheDir);

			// First sync: Update (local changed, remote unchanged)
			const plan1 = await computePlan(config, lock, repo, target);
			expect(plan1.ok).toBe(true);
			if (!plan1.ok) return;
			expect(plan1.value.entries[0].action.kind).toBe("Update");

			const apply1 = await applyPlan(plan1.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});
			expect(apply1.ok).toBe(true);
			if (!apply1.ok) return;
			expect(apply1.value.writes).toBe(1); // Update occurred
			expect(apply1.value.blocks).toBe(0);

			// Verify remoteBodyHash was refreshed via fetch-back
			const binding = lock.targets.default.documents[uuid];
			expect(binding.remoteBodyHash).not.toBe(rawHash(remoteBody)); // Changed from old
			expect(binding.remoteBodyHash.startsWith("sha256:")).toBe(true);

			// Second sync: NoOp
			target.resetWriteCounter();
			const plan2 = await computePlan(config, lock, repo, target);
			expect(plan2.ok).toBe(true);
			if (!plan2.ok) return;
			expect(plan2.value.entries[0].action.kind).toBe("NoOp");

			const apply2 = await applyPlan(plan2.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});
			expect(apply2.ok).toBe(true);
			if (!apply2.ok) return;
			expect(apply2.value.writes).toBe(0);
			expect(apply2.value.blocks).toBe(0);
			expect(apply2.value.skips).toBe(1);
		} finally {
			rmSync(cacheDir, { recursive: true, force: true });
		}
	});

	test("TC-REMOTE-001: remote edit after sync → REMOTE_AHEAD → Block", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh62-remote-"));
		try {
			const repo = new FakeRepository();
			const target = new FakeTarget();
			target.bodyNormalizer = confluenceNormalize;
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			const uuid = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
			repo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${uuid}
---
# Doc

Original content.`,
			);

			ensureCacheLayout(cacheDir);

			// First sync: Create
			const plan1 = await computePlan(config, lock, repo, target);
			if (!plan1.ok) return;
			await applyPlan(plan1.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});

			const binding = lock.targets.default.documents[uuid];
			expect(binding).toBeDefined();

			// Simulate remote edit: modify the stored page body
			const pageId = binding.pageId;
			// Access the internal page via getPage to get current state, then use addFixture to overwrite
			const pageResult = await target.getPage(pageId);
			if (!pageResult.ok) return;
			target.addFixture({
				...pageResult.value,
				body: "<p>Remote edited content</p>",
				version: pageResult.value.version + 1,
			});

			// Second sync: should detect REMOTE_AHEAD → Block
			const plan2 = await computePlan(config, lock, repo, target);
			if (!plan2.ok) return;
			expect(plan2.value.entries).toHaveLength(1);
			expect(plan2.value.entries[0].action.kind).toBe("Block");
		} finally {
			rmSync(cacheDir, { recursive: true, force: true });
		}
	});

	test("TC-FETCH-003: fetch-back failure → fallback hash + warning, operation succeeds", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh62-fetch-"));
		try {
			const repo = new FakeRepository();
			const target = new FakeTarget();
			const lock = JSON.parse(JSON.stringify(emptyLock)) as LockFile;

			const uuid = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
			repo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${uuid}
---
# Doc

Content.`,
			);

			ensureCacheLayout(cacheDir);

			// First sync: Create — getPage will fail for the new page (not in fixture map)
			// Actually FakeTarget.createPage stores the page, so getPage will succeed.
			// To simulate fetch-back failure, we need getPage to fail AFTER create.
			// Override getPage to fail on the second call (fetch-back):
			const originalGetPage = target.getPage.bind(target);
			let getPageCallCount = 0;
			target.getPage = (id: string) => {
				getPageCallCount++;
				// computePlan calls getPage during classify (1st call for bound docs only)
				// For Create path: fetch-back is the first getPage call after create
				// For a new doc (Create), computePlan doesn't call getPage (no binding)
				// So the first getPage call IS the fetch-back
				if (getPageCallCount === 1) {
					return Promise.resolve(
						Res.err({
							kind: "RemoteUnreachable",
							humanMessage: "Simulated fetch-back failure",
						}),
					);
				}
				return originalGetPage(id);
			};

			const plan1 = await computePlan(config, lock, repo, target);
			if (!plan1.ok) return;
			const apply1 = await applyPlan(plan1.value, target, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
			});

			expect(apply1.ok).toBe(true);
			if (!apply1.ok) return;
			expect(apply1.value.writes).toBe(1); // Create succeeded despite fetch-back failure
			expect(apply1.value.blocks).toBe(0);

			// remoteBodyHash should be rawHash(renderedBody) (the fallback)
			const binding = lock.targets.default.documents[uuid];
			expect(binding).toBeDefined();
			expect(binding.remoteBodyHash.startsWith("sha256:")).toBe(true);
			// Should NOT be the canonical hash ("fixture-hash")
			expect(binding.remoteBodyHash).not.toBe("fixture-hash");

			// Warning should be emitted
			expect(apply1.value.warnings.length).toBeGreaterThan(0);
			expect(apply1.value.warnings.some((w) => w.includes("Fetch-back"))).toBe(
				true,
			);
		} finally {
			rmSync(cacheDir, { recursive: true, force: true });
		}
	});
});
