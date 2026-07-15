// TC-E2EMOCK-005: Attachment Deduplication — Hash Precheck Skips Re-upload.
// Tests that attachment deduplication works via the hash precheck path:
// run 1 uploads attachment, run 2 (with modified markdown but same asset)
// issues 1× PUT page + 1× GET attachment list + 0× POST attachment (skipped).

import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { computePlan, applyPlan } from "#app/push-flow";
import { ensureCacheLayout } from "#app/cache";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { createMockServer } from "./mock-confluence-server";
import { loadCorpus, targetFor } from "./helpers";

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
		},
	},
	sync: {
		allowBranches: ["main"],
		granularity: "squash",
		stalePlanMinutes: 15,
	},
	render: {
		mermaid: {
			policy: "code",
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
		visiblePanel: false,
	},
};

describe("TC-E2EMOCK-005 — attachment dedup via hash precheck (AC-F2-4)", () => {
	const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh81-dedup-005-"));
	let mock: ReturnType<typeof createMockServer>;

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
		mock?.stop();
	});

	test("run 1 uploads attachment; run 2 (same asset, modified page) skips re-upload via hash precheck", async () => {
		mock = createMockServer();
		const target = targetFor(mock.origin);

		// Load corpus with 1 page referencing a local image (image.png lives
		// next to the markdown in the fixture dir). Key the doc by its
		// fixture-relative path so the AssetResolver resolves image.png relative
		// to the fixture directory (config.root stays "." — the fixture dir is
		// under the repo root, so the path-safe confinement check passes).
		const corpus = await loadCorpus("attachment-dedup");
		expect(corpus.size).toBe(1);
		const fixtureDir = "tests/e2e-mock/fixtures/corpus/attachment-dedup";
		const files: Record<string, string> = {};
		for (const [filename, content] of corpus) {
			files[`${fixtureDir}/${filename}`] = content;
		}

		// Create fake repository with corpus file
		const fakeRepo = new FakeRepository({
			files,
			headSha: "commit-123",
			branch: "main",
		});

		// Create empty lock file (first sync)
		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: {},
				},
			},
		};

		// Set up cache
		await ensureCacheLayout(tmpCacheDir);

		// RUN 1: Create page and upload attachment
		const firstPlanResult = await computePlan(baseConfig, lock, fakeRepo, target);
		expect(firstPlanResult.ok).toBe(true);
		if (!firstPlanResult.ok) return;

		const firstApplyResult = await applyPlan(firstPlanResult.value, target, lock, {
			cwd: tmpCacheDir,
			cacheDir: tmpCacheDir,
			targetId: "default",
			stalePlanMinutes: 15,
		});
		expect(firstApplyResult.ok).toBe(true);
		if (!firstApplyResult.ok) return;

		const firstReport = firstApplyResult.value;
		expect(firstReport.writes).toBe(1); // 1 page created

		// Get page ID from first run (server-assigned id lives in the lock
		// binding; the create request body has no id field).
		const postPage = mock.captured.find((r) => r.method === "POST" && r.path === "/wiki/api/v2/pages");
		expect(postPage).toBeDefined();
		const pageId = Object.values(lock.targets.default.documents)[0]!.pageId;

		// Assert run 1 uploaded attachment (POST /child/attachment)
		const postAttachments = mock.captured.filter(
			(r) => r.method === "POST" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/child\/attachment$/),
		);
		expect(postAttachments.length).toBe(1); // 1 attachment uploaded (local image)

		// The attachment hash lives in the lock binding (attachmentHashes maps
		// marksync-asset-<hash>.<ext> → hash). The POST request body is multipart
		// (not JSON) and carries no results envelope — that's the response shape,
		// which the recorder does not capture.
		const docAfterFirstRun = Object.values(lock.targets.default.documents)[0]!;
		const attachmentKeys = Object.keys(docAfterFirstRun.attachmentHashes);
		expect(attachmentKeys.length).toBe(1);
		const hashMatch = attachmentKeys[0]!.match(/marksync-(mermaid|asset)-([a-f0-9]+)/);
		expect(hashMatch).toBeDefined();
		const assetHash = hashMatch?.[2];

		// Clear captured requests (keep mock state)
		mock.clearCaptured();

		// Modify the markdown content (triggering Update flow) while keeping the
		// SAME image (same bytes → same hash → dedup skips re-upload).
		const updatedContent = `---
marksync:
  uuid: 019f56e4-18f5-7024-bfdf-5438918bb3c0
---
# Page for Attachment Dedup

MODIFIED content - page updated but image unchanged.

![Diagram](image.png)`;

		fakeRepo.setFile(`${fixtureDir}/page.md`, updatedContent);
		fakeRepo.setHeadSha("commit-456"); // New commit SHA

		// RUN 2: Update page, attachment should be deduped via hash precheck.
		// applyPlan mutated `lock` in place (ApplyReport has no lock field); reuse it.
		const secondPlanResult = await computePlan(baseConfig, lock, fakeRepo, target);
		expect(secondPlanResult.ok).toBe(true);
		if (!secondPlanResult.ok) return;

		const secondApplyResult = await applyPlan(secondPlanResult.value, target, lock, {
			cwd: tmpCacheDir,
			cacheDir: tmpCacheDir,
			targetId: "default",
			stalePlanMinutes: 15,
		});
		expect(secondApplyResult.ok).toBe(true);
		if (!secondApplyResult.ok) return;

		const secondReport = secondApplyResult.value;

		// Assert ApplyReport.writes == 1 (1 page updated, no attachment writes)
		expect(secondReport.writes).toBe(1);

		// Assert captured run-2 sequence:
		// - 1× PUT /wiki/api/v2/pages/{id} (page update)
		const putPages = mock.captured.filter(
			(r) => r.method === "PUT" && r.path === `/wiki/api/v2/pages/${pageId}`,
		);
		expect(putPages.length).toBeGreaterThanOrEqual(1);

		// - 1× GET .../child/attachment (the attachmentExists precheck list)
		const getAttachments = mock.captured.filter(
			(r) => r.method === "GET" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/child\/attachment$/),
		);
		expect(getAttachments.length).toBeGreaterThanOrEqual(1);

		// - 0× POST .../child/attachment (upload skipped, hash found via precheck)
		const postAttachmentsRun2 = mock.captured.filter(
			(r) => r.method === "POST" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/child\/attachment$/),
		);
		expect(postAttachmentsRun2.length).toBe(0);

		// Assert mock's server-side attachment state is unchanged from run 1
		// (same attachment ID, same version — no re-upload occurred). The mock
		// records requests only (not responses), so inspect its internal
		// attachment state directly (test plan step 5).
		const serverAttachments = mock.getServerAttachments(pageId);
		expect(serverAttachments.length).toBe(1);
		expect(serverAttachments[0]!.hash).toBe(assetHash);
		expect(serverAttachments[0]!.version).toBe(1);
	});
});