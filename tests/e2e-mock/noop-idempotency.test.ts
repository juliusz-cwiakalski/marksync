// TC-E2EMOCK-003: No-Op Idempotency — Second Run Zero Writes.
// Tests that a second applyPlan on unchanged source performs 0 writes,
// satisfying NFR-PERF-4.

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

describe("TC-E2EMOCK-003 — no-op idempotency (AC-F2-2, NFR-PERF-4)", () => {
	const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh81-noop-003-"));
	let mock: ReturnType<typeof createMockServer>;

	afterAll(() => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
		mock?.stop();
	});

	test("second applyPlan on unchanged source performs 0 writes", async () => {
		mock = createMockServer();
		const target = targetFor(mock.origin);

		// Load corpus with 3 pages
		const corpus = await loadCorpus("create-flow");
		expect(corpus.size).toBe(3);

		// Create fake repository with corpus files
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

		// First sync: create pages
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
		expect(firstReport.writes).toBe(3); // 3 pages created

		// Capture state after first run
		const lockAfterFirstRun = firstApplyResult.value.lock;
		const capturedAfterFirstRun = [...mock.captured];
		const firstRunPageIds = new Set(
			capturedAfterFirstRun
				.filter((r) => r.method === "POST" && r.path === "/wiki/api/v2/pages")
				.map((r) => JSON.parse(r.text).id),
		);

		// Clear captured requests (but keep mock state)
		mock.clearCaptured();

		// Second sync: unchanged source (same commit SHA, same corpus)
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

		// Assert ApplyReport.writes == 0 (no writes on unchanged source)
		expect(secondReport.writes).toBe(0);
		expect(secondReport.skips).toBeGreaterThan(0);

		// Assert NO write operations in captured requests
		const postPages = mock.captured.filter((r) => r.method === "POST" && r.path === "/wiki/api/v2/pages");
		expect(postPages.length).toBe(0);

		const putPages = mock.captured.filter((r) => r.method === "PUT" && r.path.match(/^\/wiki\/api\/v2\/pages\/\d+$/));
		expect(putPages.length).toBe(0);

		const postProperties = mock.captured.filter(
			(r) => r.method === "POST" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/property$/),
		);
		expect(postProperties.length).toBe(0);

		const putProperties = mock.captured.filter(
			(r) => r.method === "PUT" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/property\/[^/]+$/),
		);
		expect(putProperties.length).toBe(0);

		const postAttachments = mock.captured.filter(
			(r) => r.method === "POST" && r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/child\/attachment$/),
		);
		expect(postAttachments.length).toBe(0);

		// Verify server-side state is unchanged (pages still exist, same IDs)
		for (const pageId of firstRunPageIds) {
			const getPage = mock.captured.find(
				(r) => r.method === "GET" && r.path === `/wiki/api/v2/pages/${pageId}?body-format=storage`,
			);
			// At least one GET for freshness check is expected
			expect(getPage).toBeDefined();
		}

		// Assert lock file is unchanged
		const lockAfterSecondRun = secondApplyResult.value.lock;
		expect(lockAfterSecondRun).toEqual(lockAfterFirstRun);
	});
});