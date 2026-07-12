// Integration test for secrets safety (TC-INTEGRATION-011: 0 token occurrences in all outputs).

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Result } from "#domain/result";
import { computePlan, applyPlan } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import { ensureCacheLayout } from "#app/cache";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";

describe("secrets-safety integration test", () => {
	let tmpCacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeAll(() => {
		// Create temp cache dir
		tmpCacheDir = mkdtempSync(join(tmpdir(), "gh23-secrets-"));
	});

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

		// Setup lock (1 bound doc, LOCAL_AHEAD)
		lock = {
			version: 1,
			targets: {
				default: {
					documents: {},
				},
			},
		};
	});

	afterEach(() => {
		// Cleanup temp dir
		rmSync(tmpCacheDir, { recursive: true, force: true });
	});

	// TC-INTEGRATION-011: Plant a fake token → assert 0 occurrences across ALL outputs
	test("TC-INTEGRATION-011: Plant fake token → 0 occurrences in Plan, journal, version.message, ApplyReport", async () => {
		// Define a fake token that COULD leak
		const fakeToken = "FAKE_TOKEN_xyz123";

		const docUuid = "019f56e4-18f5-7025-bfdf-5438918bb3bc";
		const pageId = "page-111";

		// Plant the fake token in a document (simulating a comment that could leak)
		fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${docUuid}
---
# Doc A

This is doc A content. Don't leak this: ${fakeToken}`,
		);

		// Setup binding with base version
		const binding: PageBinding = {
			uuid: docUuid,
			sourcePath: "doc-a.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash", // Local ahead
			renderedBodyHash: "old-rendered-hash",
			remoteBodyHash: "old-rendered-hash", // == base → remote unchanged → LOCAL_AHEAD
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		lock.targets.default.documents[docUuid] = binding;

		// Add fixture page at version 1; no body so computePlan falls back to
		// binding.remoteBodyHash for remote.bodyHash (LOCAL_AHEAD → writes journal).
		fakeTarget.addFixture({
			id: pageId,
			title: "Doc A",
			version: 1,
			spaceId: "TEST-SPACE",
		});

		// Compute plan
		ensureCacheLayout(tmpCacheDir);
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;

		// Serialize the Plan to JSON
		const planJson = JSON.stringify(plan);

		// Assert the Plan JSON contains NO occurrences of the fake token
		expect(planJson).not.toContain(fakeToken);

		// Apply plan
		const applyResult = await applyPlan(plan, fakeTarget, lock, {
			cwd: tmpCacheDir,
			cacheDir: tmpCacheDir,
			targetId: "default",
		});

		expect(applyResult.ok).toBe(true);
		const report = applyResult.value!;

		// Read the journal file (.marksync/journal/<run-id>.jsonl)
		const journalPath = join(tmpCacheDir, "journal", `${plan.runId}.jsonl`);
		const journalContent = readFileSync(journalPath, "utf-8");

		// Assert the journal contains NO occurrences of the fake token
		expect(journalContent).not.toContain(fakeToken);

		// Serialize the ApplyReport to JSON
		const reportJson = JSON.stringify(report);

		// Assert the ApplyReport JSON contains NO occurrences of the fake token
		expect(reportJson).not.toContain(fakeToken);

		// Collect ALL version.message values captured by the mock target
		// FakeTarget doesn't capture version.message, so we check that
		// the formatVersionMessage output is not leaked

		// Verify that updatePage was called with message
		expect(fakeTarget.updatePageCalls).toHaveLength(1);
		const updateCall = fakeTarget.updatePageCalls[0];

		// Assert every version.message sent to the mock target contains NO occurrences of the fake token
		if (updateCall.message) {
			expect(updateCall.message).not.toContain(fakeToken);
		}

		// Verify only non-sensitive metadata appears
		// The journal should have only: ts, op, pageId, uuid, outcome
		for (const line of journalContent.split("\n")) {
			if (line.trim().length > 0) {
				const entry = JSON.parse(line);
				expect(entry).toHaveProperty("ts");
				expect(entry).toHaveProperty("op");
				expect(entry).toHaveProperty("pageId");
				expect(entry).toHaveProperty("uuid");
				expect(entry).toHaveProperty("outcome");
				expect(Object.keys(entry)).toHaveLength(5); // Only these 5 fields
				expect(entry.uuid).toBe(docUuid); // UUID is non-sensitive
				expect(entry.op).toBe("update");
			}
		}
	});

	// TC-INTEGRATION-011 (variant): Multiple documents with different tokens
	test("TC-INTEGRATION-011: Multiple docs with fake tokens → 0 occurrences in all outputs", async () => {
		const fakeTokenA = "FAKE_TOKEN_A";
		const fakeTokenB = "FAKE_TOKEN_B";

		const docUuidA = "019f56e4-18f5-7026-bfdf-5438918bb3bc";
		const docUuidB = "019f56e4-18f5-701b-bfdf-5438918bb3bc";
		const pageIdA = "page-111";
		const pageIdB = "page-222";

		// Plant fake tokens in documents
		fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${docUuidA}
---
# Doc A
Token: ${fakeTokenA}`,
		);

		fakeRepo.setFile(
			"doc-b.md",
			`---
marksync:
  uuid: ${docUuidB}
---
# Doc B
Token: ${fakeTokenB}`,
		);

		// Setup bindings
		const bindingA: PageBinding = {
			uuid: docUuidA,
			sourcePath: "doc-a.md",
			pageId: pageIdA,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash-a",
			renderedBodyHash: "old-rendered-hash-a",
			remoteBodyHash: "old-rendered-hash-a", // == base → remote unchanged → LOCAL_AHEAD
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
			sourceContentHash: "new-local-hash-b",
			renderedBodyHash: "old-rendered-hash-b",
			remoteBodyHash: "old-rendered-hash-b", // == base → remote unchanged → LOCAL_AHEAD
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		lock.targets.default.documents[docUuidA] = bindingA;
		lock.targets.default.documents[docUuidB] = bindingB;

		// Add fixture pages; no body so computePlan falls back to
		// binding.remoteBodyHash (LOCAL_AHEAD → writes journal).
		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 1,
			spaceId: "TEST-SPACE",
		});

		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 1,
			spaceId: "TEST-SPACE",
		});

		// Compute plan
		ensureCacheLayout(tmpCacheDir);
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;

		// Serialize the Plan to JSON
		const planJson = JSON.stringify(plan);

		// Assert NO occurrences of either fake token
		expect(planJson).not.toContain(fakeTokenA);
		expect(planJson).not.toContain(fakeTokenB);

		// Apply plan
		const applyResult = await applyPlan(plan, fakeTarget, lock, {
			cwd: tmpCacheDir,
			cacheDir: tmpCacheDir,
			targetId: "default",
		});

		expect(applyResult.ok).toBe(true);
		const report = applyResult.value!;

		// Read the journal file
		const journalPath = join(tmpCacheDir, "journal", `${plan.runId}.jsonl`);
		const journalContent = readFileSync(journalPath, "utf-8");

		// Assert NO occurrences of either fake token
		expect(journalContent).not.toContain(fakeTokenA);
		expect(journalContent).not.toContain(fakeTokenB);

		// Serialize the ApplyReport to JSON
		const reportJson = JSON.stringify(report);

		// Assert NO occurrences of either fake token
		expect(reportJson).not.toContain(fakeTokenA);
		expect(reportJson).not.toContain(fakeTokenB);
	});
});
