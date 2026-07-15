// Unit tests for repair orchestration (GH-28 Phase 4).
// Covers TC-REPAIR-001..005 + latest-journal selector unit test.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { Result } from "#domain/result";
import {
	runRepair,
	findLatestJournalRunId,
	REPAIR_DIAGNOSTIC_CODES,
} from "#app/repair";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import type { MetadataProperty } from "#domain/state/reconcile";
import type { DocumentId } from "#domain/identity/document-id";

describe("TC-REPAIR-001: RepairReport shape is valid", () => {
	test("RepairReport has items array with required fields", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-001-"));
		const fakeRepo = new FakeRepository();
		const fakeTarget = new FakeTarget();

		// Setup: one consistent binding
		const uuid = "0192b3d4-5e6f-7000-8000-000000000001" as DocumentId;
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId: "page-111",
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-001",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

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
			operationId: "op-001",
		};

		fakeTarget.addFixture({
			id: "page-111",
			title: "Doc",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty("page-111", JSON.stringify(property));

		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: { [uuid]: binding },
				},
			},
		};

		const config: ProjectConfig = {
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

		const result = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = result.value;

		// Assert report structure
		expect(report).toHaveProperty("runId");
		expect(report).toHaveProperty("dryRun");
		expect(report).toHaveProperty("items");
		expect(report).toHaveProperty("interruptedRunDetected");
		expect(report).toHaveProperty("writes");

		// Assert items is an array
		expect(Array.isArray(report.items)).toBe(true);
		expect(report.items).toHaveLength(1);

		// Assert each item has required fields
		const item = report.items[0];
		expect(item).toHaveProperty("uuid");
		expect(typeof item.uuid).toBe("string");
		expect(item).toHaveProperty("sourcePath");
		expect(typeof item.sourcePath).toBe("string");
		expect(item).toHaveProperty("diagnosticClass");
		expect(["repaired", "skipped", "needs-human-action"]).toContain(
			item.diagnosticClass,
		);
		expect(item).toHaveProperty("diagnosticCode");
		expect(typeof item.diagnosticCode).toBe("string");
		expect(item).toHaveProperty("humanNote");
		expect(typeof item.humanNote).toBe("string");

		// Assert JSON-serializable (no circular references)
		expect(() => JSON.stringify(report)).not.toThrow();

		rmSync(cacheDir, { recursive: true, force: true });
	});
});

describe("TC-REPAIR-002: RepairReport contains no secrets", () => {
	test("Report JSON contains no secret patterns", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-002-"));
		const fakeRepo = new FakeRepository();
		const fakeTarget = new FakeTarget();

		const uuid = "0192b3d4-5e6f-7000-8000-000000000002" as DocumentId;
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId: "page-222",
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-002",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

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
			operationId: "op-002",
		};

		fakeTarget.addFixture({
			id: "page-222",
			title: "Doc",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty("page-222", JSON.stringify(property));

		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: { [uuid]: binding },
				},
			},
		};

		const config: ProjectConfig = {
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

		const result = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = result.value;
		const json = JSON.stringify(report);

		// Assert no secret patterns
		expect(json).not.toMatch(/Bearer /i);
		expect(json).not.toMatch(/sk_/i);
		expect(json).not.toMatch(/pat_/i);
		expect(json).not.toMatch(/password/i);
		expect(json).not.toMatch(/passwd/i);
		expect(json).not.toMatch(/secret/i);
		expect(json).not.toMatch(/apiKey/i);

		// Assert only non-sensitive data appears
		expect(json).toContain(uuid);
		expect(json).toContain("doc.md");

		rmSync(cacheDir, { recursive: true, force: true });
	});
});

describe("TC-REPAIR-003: Dry-run mode returns planned repairs with 0 writes", () => {
	test("Dry-run shows planned repairs with 0 writes and no lock mutation", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-003-"));
		const fakeRepo = new FakeRepository();
		const fakeTarget = new FakeTarget();

		const uuid = "0192b3d4-5e6f-7000-8000-000000000003" as DocumentId;
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId: "page-333",
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123", // Stale - mismatched with property
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-003",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		const property: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuid,
			sourcePath: "doc.md",
			sourceCommit: "def456", // Current - mismatched with binding (dirty lock)
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-003",
		};

		fakeTarget.addFixture({
			id: "page-333",
			title: "Doc",
			version: 1,
			body: "<h1>Doc</h1>",
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty("page-333", JSON.stringify(property));

		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: { [uuid]: binding },
				},
			},
		};

		const config: ProjectConfig = {
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

		// Reset write counter
		fakeTarget.resetWriteCounter();

		const result = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = result.value;

		// Assert 0 writes
		expect(report.writes).toBe(0);
		expect(fakeTarget.getWriteCount()).toBe(0);

		// Assert report shows planned repair
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("repaired");
		expect(report.items[0].diagnosticCode).toBe("REPAIRED_STALE_LOCK");

		// Assert no TargetSystem methods were called for writes
		expect(fakeTarget.updatePageCalls).toHaveLength(0);
		expect(fakeTarget.putPropertyCalls).toHaveLength(0);

		rmSync(cacheDir, { recursive: true, force: true });
	});
});

describe("TC-REPAIR-004: Diagnostic codes are stable strings", () => {
	test("All diagnostic codes are stable strings from REPAIR_DIAGNOSTIC_CODES", async () => {
		// Assert REPAIR_DIAGNOSTIC_CODES is a const object with string values
		expect(typeof REPAIR_DIAGNOSTIC_CODES).toBe("object");

		for (const code of Object.values(REPAIR_DIAGNOSTIC_CODES)) {
			expect(typeof code).toBe("string");
			// Assert no random elements (no UUIDs, no timestamps)
			expect(code).not.toMatch(
				/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
			);
			expect(code).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		}

		// Assert expected codes exist
		expect(REPAIR_DIAGNOSTIC_CODES.REPAIRED_STALE_LOCK).toBe(
			"REPAIRED_STALE_LOCK",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.REPAIRED_CRASH_WINDOW).toBe(
			"REPAIRED_CRASH_WINDOW",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.REPAIRED_REBUILD_FROM_REMOTE).toBe(
			"REPAIRED_REBUILD_FROM_REMOTE",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.SKIPPED_ALREADY_CONSISTENT).toBe(
			"SKIPPED_ALREADY_CONSISTENT",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.SKIPPED_ALREADY_APPLIED).toBe(
			"SKIPPED_ALREADY_APPLIED",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.NEEDS_HUMAN_ACTION_DIVERGED).toBe(
			"NEEDS_HUMAN_ACTION_DIVERGED",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.NEEDS_HUMAN_ACTION_MISSING_PROPERTY).toBe(
			"NEEDS_HUMAN_ACTION_MISSING_PROPERTY",
		);
		expect(REPAIR_DIAGNOSTIC_CODES.NEEDS_HUMAN_ACTION_MISSING_PAGE).toBe(
			"NEEDS_HUMAN_ACTION_MISSING_PAGE",
		);

		// Test that same input produces same code (stability)
		const cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-004-"));
		const fakeRepo = new FakeRepository();
		const fakeTarget = new FakeTarget();

		const uuid = "0192b3d4-5e6f-7000-8000-000000000004" as DocumentId;
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId: "page-444",
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123",
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-004",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

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
			operationId: "op-004",
		};

		fakeTarget.addFixture({
			id: "page-444",
			title: "Doc",
			version: 1,
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty("page-444", JSON.stringify(property));

		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: { [uuid]: binding },
				},
			},
		};

		const config: ProjectConfig = {
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

		// Run twice, assert same codes
		const result1 = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		const result2 = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(result1.ok).toBe(true);
		expect(result2.ok).toBe(true);
		if (!result1.ok || !result2.ok) return;

		const codes1 = result1.value.items.map((i) => i.diagnosticCode);
		const codes2 = result2.value.items.map((i) => i.diagnosticCode);

		expect(codes1).toEqual(codes2);

		rmSync(cacheDir, { recursive: true, force: true });
	});
});

describe("TC-REPAIR-005: Dirty lock detection via reconcileWithProperty", () => {
	test("Dirty lock detected and emits REPAIRED_STALE_LOCK", async () => {
		const cacheDir = mkdtempSync(join(tmpdir(), "gh28-repair-005-"));
		const fakeRepo = new FakeRepository();
		const fakeTarget = new FakeTarget();

		const uuid = "0192b3d4-5e6f-7000-8000-000000000005" as DocumentId;
		const binding: PageBinding = {
			uuid,
			sourcePath: "doc.md",
			pageId: "page-555",
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "abc123", // Stale - mismatched with property
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			remoteBodyHash: "sha256:rem",
			attachmentHashes: {},
			operationId: "op-005",
			synchronizedAt: "2026-07-15T00:00:00Z",
			toolVersion: "0.6.0",
		};

		const property: MetadataProperty = {
			schemaVersion: 1,
			projectId: "marksync-for-confluence",
			targetId: "default",
			documentId: uuid,
			sourcePath: "doc.md",
			sourceCommit: "def456", // Current - mismatched with binding (dirty lock)
			sourceContentHash: "sha256:src",
			renderedBodyHash: "sha256:rend",
			toolVersion: "0.6.0",
			synchronizedAt: "2026-07-15T00:00:00Z",
			operationId: "op-005",
		};

		fakeTarget.addFixture({
			id: "page-555",
			title: "Doc",
			version: 1,
			body: "<h1>Doc</h1>",
			spaceId: "TEST",
		});
		fakeTarget.setMetadataProperty("page-555", JSON.stringify(property));

		const lock: LockFile = {
			version: 1,
			targets: {
				default: {
					documents: { [uuid]: binding },
				},
			},
		};

		const config: ProjectConfig = {
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

		const result = await runRepair(lock, fakeRepo, fakeTarget, config, {
			cwd: cacheDir,
			cacheDir,
			targetId: "default",
			dryRun: true,
			stalePlanMinutes: 15,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = result.value;

		// Assert dirty lock detected and reported
		expect(report.items).toHaveLength(1);
		expect(report.items[0].diagnosticClass).toBe("repaired");
		expect(report.items[0].diagnosticCode).toBe("REPAIRED_STALE_LOCK");

		rmSync(cacheDir, { recursive: true, force: true });
	});
});

describe("findLatestJournalRunId: latest-journal selector", () => {
	let cacheDir: string;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "gh28-latest-journal-"));
	});

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true });
	});

	test("Returns newest by UUID-v7 timestamp", () => {
		const journalDir = join(cacheDir, "journal");
		mkdirSync(journalDir, { recursive: true });

		// Create two journal files with different UUID-v7 timestamps
		const olderRunId = "01901234567890000000000000"; // 2024-09-25
		const newerRunId = "0192b3d4-5e6f-7000-8000-000000000000"; // 2025-11-20

		writeFileSync(
			join(journalDir, `${olderRunId}.jsonl`),
			'{"test":"older"}\n',
		);
		writeFileSync(
			join(journalDir, `${newerRunId}.jsonl`),
			'{"test":"newer"}\n',
		);

		const latest = findLatestJournalRunId(cacheDir);
		expect(latest).toBe(newerRunId);
	});

	test("Returns undefined for absent journal dir", () => {
		// Don't create journal dir
		const latest = findLatestJournalRunId(cacheDir);
		expect(latest).toBeUndefined();
	});

	test("Skips non-UUID-v7 filenames", () => {
		const journalDir = join(cacheDir, "journal");
		mkdirSync(journalDir, { recursive: true });

		// Create mix of valid and invalid filenames
		const validRunId = "0192b3d4-5e6f-7000-8000-000000000000";
		writeFileSync(
			join(journalDir, `${validRunId}.jsonl`),
			'{"test":"valid"}\n',
		);
		writeFileSync(join(journalDir, "not-a-uuid.jsonl"), '{"test":"invalid"}\n');
		writeFileSync(join(journalDir, "random.txt"), "not jsonl");

		const latest = findLatestJournalRunId(cacheDir);
		expect(latest).toBe(validRunId);
	});

	test("Returns undefined for empty journal dir", () => {
		const journalDir = join(cacheDir, "journal");
		mkdirSync(journalDir, { recursive: true });

		const latest = findLatestJournalRunId(cacheDir);
		expect(latest).toBeUndefined();
	});
});
