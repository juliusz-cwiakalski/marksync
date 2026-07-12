// Integration test for duplicate-UUID fatal (TC-INTEGRATION-010).

import { beforeEach, describe, expect, test } from "bun:test";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Result } from "#domain/result";
import { computePlan } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";

describe("duplicate-uuid-fatal integration test", () => {
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		// Reset helpers
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

		// Setup config (single target, main branch allowed)
		config = {
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

		// Setup empty lock
		lock = {
			version: 1,
			targets: {
				default: {
					documents: {},
				},
			},
		};
	});

	// TC-INTEGRATION-010: Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write
	test("TC-INTEGRATION-010: Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write", async () => {
		const duplicateUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";

		// Create 2 documents with the SAME UUID
		fakeRepo.setFile(
			"doc-a.md",
			`---
uuid: ${duplicateUuid}
---
# Doc A

This is doc A content.`,
		);

		fakeRepo.setFile(
			"doc-b.md",
			`---
uuid: ${duplicateUuid}
---
# Doc B

This is doc B content.`,
		);

		// Call computePlan
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);

		// Assert the result is err(DuplicateUuid)
		expect(planResult.ok).toBe(false);
		if (!planResult.ok) {
			expect(planResult.error.kind).toBe("DuplicateUuid");
			expect(planResult.error.uuid).toBe(duplicateUuid);
			expect(planResult.error.paths).toEqual(["doc-a.md", "doc-b.md"]);
		}

		// Assert NO call was made to stubTarget.createPage or stubTarget.updatePage (0 writes)
		expect(fakeTarget.createPageCalls).toHaveLength(0);
		expect(fakeTarget.updatePageCalls).toHaveLength(0);

		// Assert NO Plan was emitted (the function returns early after the duplicate-UUID gate)
		expect(planResult.ok).toBe(false);
	});

	// TC-INTEGRATION-010 (variant): Duplicate UUID in bound docs + unbound doc
	test("TC-INTEGRATION-010: Duplicate UUID with bound + unbound docs → err(DuplicateUuid)", async () => {
		const duplicateUuid = "duplicate-019f56e4-18f5-7022-bfdf-5438918bb3bcbc";
		const pageId = "page-123";

		// Create 3 documents: 2 with the same UUID (1 bound, 1 unbound)
		fakeRepo.setFile(
			"doc-a.md",
			`---
uuid: ${duplicateUuid}
---
# Doc A (bound)`,
		);

		fakeRepo.setFile(
			"doc-b.md",
			`---
uuid: ${duplicateUuid}
---
# Doc B (unbound)`,
		);

		// Add binding for doc-a
		const binding: PageBinding = {
			uuid: duplicateUuid,
			sourcePath: "doc-a.md",
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

		lock.targets.default.documents[duplicateUuid] = binding;

		// Add fixture page
		fakeTarget.addFixture({
			id: pageId,
			title: "Doc A",
			version: 1,
			body: "<h1>Doc A</h1>",
			spaceId: "TEST-SPACE",
		});

		// Call computePlan
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);

		// Assert the result is err(DuplicateUuid)
		expect(planResult.ok).toBe(false);
		if (!planResult.ok) {
			expect(planResult.error.kind).toBe("DuplicateUuid");
			expect(planResult.error.uuid).toBe(duplicateUuid);
			expect(planResult.error.paths).toContain("doc-a.md");
			expect(planResult.error.paths).toContain("doc-b.md");
		}

		// Assert NO calls to the target (0 writes)
		expect(fakeTarget.createPageCalls).toHaveLength(0);
		expect(fakeTarget.updatePageCalls).toHaveLength(0);
	});

	// TC-INTEGRATION-010 (variant): No duplicate UUID → computePlan succeeds
	test("TC-INTEGRATION-010: No duplicate UUID → computePlan succeeds", async () => {
		// Create 2 documents with DIFFERENT UUIDs
		fakeRepo.setFile(
			"doc-a.md",
			`---
uuid: 019f56e4-18f5-7022-bfdf-5438918bb3bc
---
# Doc A`,
		);

		fakeRepo.setFile(
			"doc-b.md",
			`---
uuid: 019f56e4-18f5-7023-bfdf-5438918bb3bc
---
# Doc B`,
		);

		// Call computePlan
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);

		// Assert the result is ok (Plan emitted)
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;
		expect(plan.entries).toHaveLength(2);
	});
});
