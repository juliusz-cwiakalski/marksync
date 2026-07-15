// Integration tests for repair orchestration (GH-28 Phase 5).
// Covers TC-REPAIR-006..013.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	rmSync,
	writeFileSync,
	mkdirSync,
	readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { PageBinding } from "#domain/binding/page-binding";
import { runRepair } from "#app/repair";
import { loadLock } from "#app/lock";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import type { MetadataProperty } from "#domain/state/reconcile";
import type { DocumentId } from "#domain/identity/document-id";
import { computePlan, applyPlan } from "#app/push-flow";
import type { JournalEntry } from "#app/journal";

describe("TC-REPAIR-006: Stale lock rebuild from Confluence with --apply", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-006-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Stale lock rebuild with --apply, 0 page re-writes", async () => {
		const uuid = "0192b3d4-5e6f-7000-8000-000000000006" as DocumentId;
		const pageId = "page-111";

		// Setup: stale lock binding
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123", // Stale
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-006",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		// Property has newer commit
		const property: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuid,
			sourcePath: "doc.md",
			sourceCommit: "def456", // Current state
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-006",
		};

		fakeTarget.addFixture({
			id: pageId,
			title: "Doc A",
			version: 2,
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty(pageId, JSON.stringify(property));

		lock.targets.default.documents[uuid] = binding;

		fakeTarget.resetWriteCounter();

		const result = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false, // --apply
			stalePlanMinutes: 15,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = result.value;

		// Assert 0 page writes (rebuild is read-only)
		expect(fakeTarget.getWriteCount()).toBe(0);
		expect(fakeTarget.updatePageCalls).toHaveLength(0);
		expect(fakeTarget.putPropertyCalls).toHaveLength(0);

		// Assert repair reported
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("repaired");
		expect(report.items[0].diagnosticCode).toBe("REPAIRED_STALE_LOCK");
	});
});

describe("TC-REPAIR-007: Interrupted apply (crash after K of N)", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-007-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Interrupted apply (crash after K=2 of N=3) completes remaining 1", async () => {
		const docUuidA = "019f56e4-18f5-701a-bfdf-5438918bb3bc" as DocumentId;
		const docUuidB = "019f56e4-18f5-701b-bfdf-5438918bb3bc" as DocumentId;
		const docUuidC = "019f56e4-18f5-701c-bfdf-5438918bb3bc" as DocumentId;
		const pageIdA = "page-111";
		const pageIdB = "page-222";
		const pageIdC = "page-333";

		// Setup files
		fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${docUuidA}
---
# Doc A
`,
		);
		fakeRepo.setFile(
			"doc-b.md",
			`---
marksync:
  uuid: ${docUuidB}
---
# Doc B
`,
		);
		fakeRepo.setFile(
			"doc-c.md",
			`---
marksync:
  uuid: ${docUuidC}
---
# Doc C
`,
		);

		// Setup bindings (all LOCAL_AHEAD)
		const bindingA: PageBinding = {
			uuid: docUuidA,
			sourcePath: "doc-a.md",
			pageId: pageIdA,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash-a",
			renderedBodyHash: "old-rendered-hash-a",
			remoteBodyHash: "old-rendered-hash-a",
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
			remoteBodyHash: "old-rendered-hash-b",
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
			sourceContentHash: "new-local-hash-c",
			renderedBodyHash: "old-rendered-hash-c",
			remoteBodyHash: "old-rendered-hash-c",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		lock.targets.default.documents[docUuidA] = bindingA;
		lock.targets.default.documents[docUuidB] = bindingB;
		lock.targets.default.documents[docUuidC] = bindingC;

		// Add fixture pages
		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdC,
			title: "Doc C",
			version: 1,
			spaceId: "TEST",
		});

		// Compute plan
		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;

		// Apply with crash after 2
		await expect(
			applyPlan(plan, fakeTarget, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
				crashAfter: 2,
			}),
		).rejects.toThrow("CRASH_AFTER_2");

		// Assert 2 writes in crash run
		expect(fakeTarget.getWriteCount()).toBe(2);

		// Reset write counter for repair
		fakeTarget.resetWriteCounter();

		// Run repair
		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert only 1 write (the remaining doc)
		expect(fakeTarget.getWriteCount()).toBe(1);

		// Assert report shows 2 skipped (already-applied) + 1 repaired
		expect(report.items.length).toBeGreaterThanOrEqual(1);
		const skippedItems = report.items.filter(
			(i) => i.diagnosticClass === "skipped",
		);
		const repairedItems = report.items.filter(
			(i) => i.diagnosticClass === "repaired",
		);
		expect(skippedItems.length).toBeGreaterThanOrEqual(2); // At least 2 skipped
		expect(repairedItems.length).toBeGreaterThanOrEqual(1); // At least 1 repaired

		// Assert final lock has all 3 bindings
		expect(Object.keys(lock.targets.default.documents).length).toBe(3);
	});
});

describe("TC-REPAIR-008: Each page written at most once (write-counter)", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-008-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Cumulative write count = N (3), no duplicates", async () => {
		const docUuidA = "019f56e4-18f5-701a-bfdf-5438918bb3bd" as DocumentId;
		const docUuidB = "019f56e4-18f5-701b-bfdf-5438918bb3bd" as DocumentId;
		const docUuidC = "019f56e4-18f5-701c-bfdf-5438918bb3bd" as DocumentId;
		const pageIdA = "page-111";
		const pageIdB = "page-222";
		const pageIdC = "page-333";

		fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${docUuidA}
---
# Doc A
`,
		);
		fakeRepo.setFile(
			"doc-b.md",
			`---
marksync:
  uuid: ${docUuidB}
---
# Doc B
`,
		);
		fakeRepo.setFile(
			"doc-c.md",
			`---
marksync:
  uuid: ${docUuidC}
---
# Doc C
`,
		);

		const bindingA: PageBinding = {
			uuid: docUuidA,
			sourcePath: "doc-a.md",
			pageId: pageIdA,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash-a",
			renderedBodyHash: "old-rendered-hash-a",
			remoteBodyHash: "old-rendered-hash-a",
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
			remoteBodyHash: "old-rendered-hash-b",
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
			sourceContentHash: "new-local-hash-c",
			renderedBodyHash: "old-rendered-hash-c",
			remoteBodyHash: "old-rendered-hash-c",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		lock.targets.default.documents[docUuidA] = bindingA;
		lock.targets.default.documents[docUuidB] = bindingB;
		lock.targets.default.documents[docUuidC] = bindingC;

		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdC,
			title: "Doc C",
			version: 1,
			spaceId: "TEST",
		});

		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;

		// Apply with crash after 2
		await expect(
			applyPlan(plan, fakeTarget, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
				crashAfter: 2,
			}),
		).rejects.toThrow("CRASH_AFTER_2");

		// Assert 2 writes in crash run
		const writesAfterCrash = fakeTarget.getWriteCount();
		expect(writesAfterCrash).toBe(2);

		// DO NOT reset write counter (keep cumulative)
		const updateCallsBeforeRepair = [...fakeTarget.updatePageCalls];

		// Run repair
		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);

		// Assert cumulative count = 3 (exactly N)
		const writesAfterRepair = fakeTarget.getWriteCount();
		expect(writesAfterRepair).toBe(3);

		// Verify no duplicate calls
		const allUpdateCalls = [...fakeTarget.updatePageCalls];
		const pageIds = allUpdateCalls.map((c) => c.pageId);
		const uniquePageIds = new Set(pageIds);
		expect(uniquePageIds.size).toBe(3); // 3 unique pages
		expect(pageIds).toHaveLength(3); // 3 total calls (no duplicates)

		// Assert each page ID appears at most once
		const pageIdCounts = pageIds.reduce(
			(acc, id) => {
				acc[id] = (acc[id] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);
		for (const count of Object.values(pageIdCounts)) {
			expect(count).toBe(1); // Each page written at most once
		}
	});
});

describe("TC-REPAIR-009: Mid-transaction crash window", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-009-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Journal ahead of lock, remote matches → rebuild from remote, 0 writes", async () => {
		const uuid = "0192b3d4-5e6f-7000-8000-000000000009" as DocumentId;
		const pageId = "page-111";
		const runId = "01901234567890000000000000";

		// Setup: page at version 2 (reflects the journaled operation)
		fakeTarget.addFixture({
			id: pageId,
			title: "Doc A",
			version: 2,
			body: "<h1>Doc A</h1>",
			spaceId: "TEST",
		});

		// Property matches remote
		const property: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuid,
			sourcePath: "doc.md",
			sourceCommit: "def456",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-009",
		};

		fakeTarget.setMetadataProperty(pageId, JSON.stringify(property));

		// Lock is empty (simulating crash before saveLock completed)
		// No binding for this UUID

		// Manually construct crash-window journal fixture
		const journalDir = join(cacheDir, "journal");
		mkdirSync(journalDir, { recursive: true });

		// Write journal entry with REAL JournalEntry shape { ts, op, pageId, uuid, outcome }
		const journalEntry: JournalEntry = {
			ts: "2026-07-15T10:30:00.000Z",
			op: "update",
			pageId,
			uuid,
			outcome: "success",
		};

		const journalLine = `${JSON.stringify(journalEntry)}\n`;
		writeFileSync(join(journalDir, `${runId}.jsonl`), journalLine);

		fakeTarget.resetWriteCounter();

		// Run repair
		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert 0 page writes (rebuilt from remote, not re-written)
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert repair reported with crash window code
		const crashWindowItem = report.items.find(
			(i) => i.diagnosticCode === "REPAIRED_CRASH_WINDOW",
		);
		expect(crashWindowItem).toBeDefined();
		expect(crashWindowItem?.diagnosticClass).toBe("repaired");

		// Assert lock updated
		expect(lock.targets.default.documents[uuid]).toBeDefined();
		expect(lock.targets.default.documents[uuid].sourceCommit).toBe("def456");
	});
});

describe("TC-REPAIR-010: Dry-run for interrupted apply", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-010-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Dry-run shows plan with 0 writes, lock unchanged", async () => {
		const docUuidA = "019f56e4-18f5-701a-bfdf-5438918bb3be" as DocumentId;
		const docUuidB = "019f56e4-18f5-701b-bfdf-5438918bb3be" as DocumentId;
		const docUuidC = "019f56e4-18f5-701c-bfdf-5438918bb3be" as DocumentId;
		const pageIdA = "page-111";
		const pageIdB = "page-222";
		const pageIdC = "page-333";

		fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${docUuidA}
---
# Doc A
`,
		);
		fakeRepo.setFile(
			"doc-b.md",
			`---
marksync:
  uuid: ${docUuidB}
---
# Doc B
`,
		);
		fakeRepo.setFile(
			"doc-c.md",
			`---
marksync:
  uuid: ${docUuidC}
---
# Doc C
`,
		);

		const bindingA: PageBinding = {
			uuid: docUuidA,
			sourcePath: "doc-a.md",
			pageId: pageIdA,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash-a",
			renderedBodyHash: "old-rendered-hash-a",
			remoteBodyHash: "old-rendered-hash-a",
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
			remoteBodyHash: "old-rendered-hash-b",
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
			sourceContentHash: "new-local-hash-c",
			renderedBodyHash: "old-rendered-hash-c",
			remoteBodyHash: "old-rendered-hash-c",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		lock.targets.default.documents[docUuidA] = bindingA;
		lock.targets.default.documents[docUuidB] = bindingB;
		lock.targets.default.documents[docUuidC] = bindingC;

		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdC,
			title: "Doc C",
			version: 1,
			spaceId: "TEST",
		});

		const planResult = await computePlan(config, lock, fakeRepo, fakeTarget);
		expect(planResult.ok).toBe(true);
		const plan = planResult.value!;

		// Apply with crash after 2
		await expect(
			applyPlan(plan, fakeTarget, lock, {
				cwd: cacheDir,
				cacheDir,
				targetId: "default",
				crashAfter: 2,
			}),
		).rejects.toThrow("CRASH_AFTER_2");

		// Read lock before repair
		const lockBefore = JSON.parse(JSON.stringify(lock));

		fakeTarget.resetWriteCounter();

		// Run repair with dryRun
		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert 0 writes
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert report shows plan
		const skippedItems = report.items.filter(
			(i) => i.diagnosticClass === "skipped",
		);
		const repairedItems = report.items.filter(
			(i) => i.diagnosticClass === "repaired",
		);
		expect(skippedItems.length).toBeGreaterThanOrEqual(2);
		expect(repairedItems.length).toBeGreaterThanOrEqual(1);

		// Assert lock unchanged
		expect(lock).toEqual(lockBefore);
	});
});

describe("TC-REPAIR-011: Diverged remote", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-011-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Diverged remote → needs-human-action, 0 writes", async () => {
		const uuid = "0192b3d4-5e6f-7000-8000-000000000011" as DocumentId;
		const pageId = "page-111";

		// Setup: diverged remote
		fakeTarget.setPage(pageId, {
			version: 2,
			body: "<h1>Doc A</h1>",
		});

		const property: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuid,
			sourcePath: "doc.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-011",
		};

		fakeTarget.setMetadataProperty(pageId, JSON.stringify(property));

		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 2,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:old-remote", // Old hash
			attachmentHashes: {},
			operationId: "op-011",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		lock.targets.default.documents[uuid] = binding;

		// Simulate divergence: change page body so bodyHash differs
		fakeTarget.setPage(pageId, {
			version: 3,
			body: "<h1>Modified by user</h1>", // Different body
		});

		fakeTarget.resetWriteCounter();

		// Run repair
		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert 0 writes to diverged remote
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert needs-human-action reported
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("needs-human-action");
		expect(report.items[0].diagnosticCode).toBe("NEEDS_HUMAN_ACTION_DIVERGED");
		expect(report.items[0].humanNote).toContain("diverged");

		// Assert lock NOT modified
		expect(lock.targets.default.documents[uuid].sourceCommit).toBe("abc123");
	});
});

describe("TC-REPAIR-012: Absent property / missing page", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-012-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Subtest 1: Absent property → needs-human-action, 0 writes", async () => {
		const uuid = "0192b3d4-5e6f-7000-8000-000000000012a" as DocumentId;
		const pageId = "page-111";

		fakeTarget.addFixture({
			id: pageId,
			title: "Doc",
			version: 1,
			spaceId: "TEST",
		});
		// Property is absent (don't set it)

		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-012a",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		lock.targets.default.documents[uuid] = binding;

		fakeTarget.resetWriteCounter();

		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		expect(fakeTarget.getWriteCount()).toBe(0);
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("needs-human-action");
		expect(report.items[0].diagnosticCode).toBe(
			"NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
		);
	});

	test("Subtest 2: Missing page → needs-human-action, 0 create attempts", async () => {
		const uuid = "0192b3d4-5e6f-7000-8000-000000000012b" as DocumentId;
		const pageId = "page-222";

		// No fixture page (missing page)

		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-012b",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		lock.targets.default.documents[uuid] = binding;

		fakeTarget.resetWriteCounter();

		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		expect(fakeTarget.getWriteCount()).toBe(0);
		expect(fakeTarget.createPageCalls).toHaveLength(0); // No create attempts
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("needs-human-action");
		expect(report.items[0].diagnosticCode).toBe(
			"NEEDS_HUMAN_ACTION_MISSING_PAGE",
		);
	});
});

describe("TC-REPAIR-013: Journal lost", () => {
	let cacheDir: string;
	let fakeRepo: FakeRepository;
	let fakeTarget: FakeTarget;
	let config: ProjectConfig;
	let lock: LockFile;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-013-"));
		fakeRepo = new FakeRepository();
		fakeTarget = new FakeTarget();

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
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Subtest 1: Journal lost, lock exists → rebuild from lock+Confluence, 0 writes", async () => {
		const uuidA = "0192b3d4-5e6f-7000-8000-000000000013a" as DocumentId;
		const uuidB = "0192b3d4-5e6f-7000-8000-000000000013b" as DocumentId;
		const uuidC = "0192b3d4-5e6f-7000-8000-000000000013c" as DocumentId;
		const pageIdA = "page-111";
		const pageIdB = "page-222";
		const pageIdC = "page-333";

		// Setup 3 fixture pages at version 2
		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 2,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 2,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdC,
			title: "Doc C",
			version: 2,
			spaceId: "TEST",
		});

		// Setup properties for all pages
		const propertyA: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidA,
			sourcePath: "doc-a.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013a",
		};

		const propertyB: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidB,
			sourcePath: "doc-b.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013b",
		};

		const propertyC: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidC,
			sourcePath: "doc-c.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013c",
		};

		fakeTarget.setMetadataProperty(pageIdA, JSON.stringify(propertyA));
		fakeTarget.setMetadataProperty(pageIdB, JSON.stringify(propertyB));
		fakeTarget.setMetadataProperty(pageIdC, JSON.stringify(propertyC));

		// Setup lock with 3 bindings at version 2 (already consistent)
		const bindingA: PageBinding = {
			uuid: uuidA,
			sourcePath: "doc-a.md",
			pageId: pageIdA,
			parentPageId: "ROOT",
			pageVersion: 2,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-013a",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		const bindingB: PageBinding = {
			uuid: uuidB,
			sourcePath: "doc-b.md",
			pageId: pageIdB,
			parentPageId: "ROOT",
			pageVersion: 2,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-013b",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		const bindingC: PageBinding = {
			uuid: uuidC,
			sourcePath: "doc-c.md",
			pageId: pageIdC,
			parentPageId: "ROOT",
			pageVersion: 2,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-013c",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		lock.targets.default.documents[uuidA] = bindingA;
		lock.targets.default.documents[uuidB] = bindingB;
		lock.targets.default.documents[uuidC] = bindingC;

		// Delete .marksync/ cache directory (simulate journal lost)
		rmSync(join(cacheDir, ".marksync"), { recursive: true, force: true });

		fakeTarget.resetWriteCounter();

		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert 0 writes (lock and Confluence already consistent)
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert 3 items with skipped (already consistent)
		const skippedItems = report.items.filter(
			(i) => i.diagnosticClass === "skipped",
		);
		expect(skippedItems.length).toBe(3);
	});

	test("Subtest 2: Journal lost, lock also gone → rebuild from Confluence+Git, 0 writes", async () => {
		const uuidA = "0192b3d4-5e6f-7000-8000-000000000013d" as DocumentId;
		const uuidB = "0192b3d4-5e6f-7000-8000-000000000013e" as DocumentId;
		const uuidC = "0192b3d4-5e6f-7000-8000-000000000013f" as DocumentId;
		const pageIdA = "page-111";
		const pageIdB = "page-222";
		const pageIdC = "page-333";

		// Setup 3 fixture pages at version 2 with properties
		fakeTarget.addFixture({
			id: pageIdA,
			title: "Doc A",
			version: 2,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdB,
			title: "Doc B",
			version: 2,
			spaceId: "TEST",
		});
		fakeTarget.addFixture({
			id: pageIdC,
			title: "Doc C",
			version: 2,
			spaceId: "TEST",
		});

		const propertyA: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidA,
			sourcePath: "doc-a.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013d",
		};

		const propertyB: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidB,
			sourcePath: "doc-b.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013e",
		};

		const propertyC: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuidC,
			sourcePath: "doc-c.md",
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-013f",
		};

		fakeTarget.setMetadataProperty(pageIdA, JSON.stringify(propertyA));
		fakeTarget.setMetadataProperty(pageIdB, JSON.stringify(propertyB));
		fakeTarget.setMetadataProperty(pageIdC, JSON.stringify(propertyC));

		// Lock is empty (simulate both lock and journal lost)
		lock.targets.default.documents = {};

		// Delete .marksync/ cache directory (journal lost)
		rmSync(join(cacheDir, ".marksync"), { recursive: true, force: true });

		// Configure search results for page discovery
		fakeTarget.setSearchResults([
			{ id: pageIdA },
			{ id: pageIdB },
			{ id: pageIdC },
		]);

		fakeTarget.resetWriteCounter();

		const repairResult = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: false,
			stalePlanMinutes: 15,
		});

		expect(repairResult.ok).toBe(true);
		if (!repairResult.ok) return;

		const report = repairResult.value;

		// Assert 0 writes (rebuild is read-only)
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert new lock created with bindings rebuilt from property
		expect(Object.keys(lock.targets.default.documents).length).toBe(3);
		expect(lock.targets.default.documents[uuidA]).toBeDefined();
		expect(lock.targets.default.documents[uuidB]).toBeDefined();
		expect(lock.targets.default.documents[uuidC]).toBeDefined();

		// Assert 3 items with repaired / REPAIRED_REBUILD_FROM_REMOTE
		const repairedItems = report.items.filter(
			(i) => i.diagnosticClass === "repaired",
		);
		expect(repairedItems.length).toBe(3);
		for (const item of repairedItems) {
			expect(item.diagnosticCode).toBe("REPAIRED_REBUILD_FROM_REMOTE");
		}
	});
});
