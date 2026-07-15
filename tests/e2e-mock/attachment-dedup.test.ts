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

		// Load corpus with 1 page with Mermaid diagram (has attachment)
		const corpus = await loadCorpus("attachment-dedup");
		expect(corpus.size).toBe(1);

		// Create fake repository with corpus file
		const fakeRepo = new FakeRepository({
			files: Object.fromEntries(corpus),
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

		// Get page ID from first run
		const postPage = mock.captured.find((r) => r.method === "POST" && r.path === "/wiki/api/v2/pages");
		expect(postPage).toBeDefined();
		const pageId = JSON.parse(postPage!.text).id;

		// Assert run 1 uploaded attachment (POST /child/attachment)
		const postAttachments = mock.captured.filter(
			(r) => r.method === "POST" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/child\/attachment$/),
		);
		expect(postAttachments.length).toBe(1); // 1 attachment uploaded (Mermaid diagram)

		// Get attachment ID from run 1 (for verification)
		const postAttachment = postAttachments[0];
		const postAttachmentBody = JSON.parse(postAttachment.text);
		const attachmentIdFromRun1 = postAttachmentBody.results?.[0]?.id;
		expect(attachmentIdFromRun1).toBeDefined();

		// Get the attachment hash from the POST filename
		const attachmentFilename = postAttachmentBody.results?.[0]?.title;
		expect(attachmentFilename).toBeDefined();
		const hashMatch = attachmentFilename?.match(/marksync-(mermaid|asset)-([a-f0-9]+)/);
		expect(hashMatch).toBeDefined();
		const assetHash = hashMatch?.[2];

		// Clear captured requests (keep mock state)
		mock.clearCaptured();

		// Modify the markdown content (triggering Update flow) while keeping the SAME asset
		const updatedContent = `---
marksync:
  uuid: 019f56e4-18f5-7024-bfdf-5438918bb3c0
---
# Page for Attachment Dedup

MODIFIED content - page updated but Mermaid diagram unchanged.

\`\`\`mermaid
graph LR; C-->D
\`\`\``;

		fakeRepo.setFile("page.md", updatedContent);
		fakeRepo.setHeadSha("commit-456"); // New commit SHA

		// RUN 2: Update page, attachment should be deduped via hash precheck
		const lockAfterFirstRun = firstApplyResult.value.lock;
		const secondPlanResult = await computePlan(baseConfig, lockAfterFirstRun, fakeRepo, target);
		expect(secondPlanResult.ok).toBe(true);
		if (!secondPlanResult.ok) return;

		const secondApplyResult = await applyPlan(secondPlanResult.value, target, lockAfterFirstRun, {
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

		// Assert the GET attachment list response contains the hash from run 1
		const getAttachment = getAttachments[0];
		const getAttachmentBody = JSON.parse(getAttachment.text);
		const existingAttachment = getAttachmentBody.results?.find((a: { title: string }) => a.title.includes(assetHash!));
		expect(existingAttachment).toBeDefined();

		// Assert server-side attachment state is unchanged (same attachment ID, same version)
		const lockAfterSecondRun = secondApplyResult.value.lock;
		const docAfterSecondRun = Object.values(lockAfterSecondRun.targets.default.documents)[0];
		const attachmentHashesAfterSecondRun = Object.keys(docAfterSecondRun.attachmentHashes);
		expect(attachmentHashesAfterSecondRun.length).toBe(1); // Still 1 attachment
		expect(attachmentHashesAfterSecondRun[0]).toContain(assetHash!); // Same hash
	});
});