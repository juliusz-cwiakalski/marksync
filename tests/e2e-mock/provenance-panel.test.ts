// TC-E2EMOCK-006: Provenance Panel — Visible in Body.
// Tests that the visible provenance panel ({info} macro / marksync.metadata content)
// is present in the captured POST/PUT page body.

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
		visiblePanel: true, // Enable visible provenance panel
	},
};

describe("TC-E2EMOCK-006 — provenance panel visible in body (AC-F2-5)", () => {
	const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh81-provenance-006-"));
	let mock: ReturnType<typeof createMockServer>;

	afterAll(async () => {
		rmSync(tmpCacheDir, { recursive: true, force: true });
		await mock?.stop();
	});

	test("provenance panel ({info} macro) is present in page body", async () => {
		mock = createMockServer();
		const target = targetFor(mock.origin);

		// Load corpus with 1 page configured for visible provenance panel
		const corpus = await loadCorpus("provenance-panel");
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

		// Sync the page
		const planResult = await computePlan(baseConfig, lock, fakeRepo, target);
		expect(planResult.ok).toBe(true);
		if (!planResult.ok) return;

		const applyResult = await applyPlan(planResult.value, target, lock, {
			cwd: tmpCacheDir,
			cacheDir: tmpCacheDir,
			targetId: "default",
			stalePlanMinutes: 15,
		});
		expect(applyResult.ok).toBe(true);
		if (!applyResult.ok) return;

		// Assert captured POST /pages request body contains provenance panel
		const postPage = mock.captured.find(
			(r) => r.method === "POST" && r.path === "/wiki/api/v2/pages",
		);
		expect(postPage).toBeDefined();
		const postPageBody = JSON.parse(postPage!.text);

		// The provenance panel is in the create request body's storage value
		// (request shape: body.value; the body.storage nesting is response-only).
		const pageBody = postPageBody.body?.value;
		expect(pageBody).toBeDefined();

		// Assert the {info} macro is present (provenance panel)
		expect(pageBody).toContain("<ac:structured-macro");
		expect(pageBody).toContain('ac:name="info"');

		// Assert the provenance panel contains marksync metadata
		// The exact format depends on implementation, but should include provenance info
		expect(pageBody).toMatch(/marksync|provenance|synchronized|commit/i);

		// Assert the page was created with the expected status (request body
		// carries status; id is server-assigned and not present on the request).
		expect(postPageBody.status).toBe("current");

		// Also verify the property was set (marksync.metadata property should exist)
		const postProperty = mock.captured.find(
			(r) =>
				r.method === "POST" &&
				r.path.match(/^\/wiki\/rest\/api\/content\/\d+\/property$/),
		);
		expect(postProperty).toBeDefined();
		const postPropertyBody = JSON.parse(postProperty!.text);
		expect(postPropertyBody.key).toBe("marksync.metadata");
		expect(postPropertyBody.value).toBeDefined();

		// The property value should contain provenance information
		const propValue =
			typeof postPropertyBody.value === "string"
				? postPropertyBody.value
				: JSON.stringify(postPropertyBody.value);
		expect(propValue).toMatch(/commit|synchronized|version/i);
	});
});
