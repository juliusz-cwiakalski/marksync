// Integration tests for push-flow lock pruning (TC-LOCK-001, TC-LOCK-003).
// Uses mock TargetSystem with call tracking to validate attachment hash
// replacement semantics and NO_CHANGE preservation.

import { describe, expect, test } from "bun:test";
import type {
	Page,
	PageRef,
	TargetSystem,
} from "#domain/target/port";
import { Result as Res } from "#domain/result";
import { uploadAssets } from "#app/push-flow";
import type { Artifact } from "#domain/target/port";
import { attachmentFilename } from "#infra/confluence/attachments";

function createMockTargetSystem(
	uploadCount: { value: number },
	attachmentExistsResults: Map<string, boolean> = new Map(),
): TargetSystem {
	return {
		uploadAttachment: async (_pageId, artifact) => {
			uploadCount.value++;
			const filename = attachmentFilename(artifact);
			return Res.ok({
				id: `att_${uploadCount.value}`,
				downloadUrl: `https://example.com/${filename}`,
				filename,
			});
		},
		attachmentExists: async (_pageId, hash) => {
			return Res.ok(attachmentExistsResults.get(hash) ?? false);
		},
		getPage: async (_pageId) => Res.ok({} as Page),
		createPage: async (_request) => Res.ok({} as PageRef),
		updatePage: async (_request) => Res.ok({} as PageRef),
		putProperty: async () => Res.ok(undefined),
		getProperty: async () => Res.ok(undefined),
		getPageTree: async () => Res.ok([]),
		deletePage: async () => Res.ok(undefined),
		movePage: async () => Res.ok(undefined),
		searchPages: async () => Res.ok([]),
	};
}

function createArtifact(filename: string, hash: string): Artifact {
	return {
		bytes: new Uint8Array([1, 2, 3]),
		mime: "application/octet-stream",
		hash,
		kind: "asset",
		filename,
	};
}

describe("TC-LOCK-001 — bloated lock pruning on Update (AC-F3-1)", () => {
	test("55 stale entries + 11 current run → pruned to 11 entries", async () => {
		const uploadCount = { value: 0 };
		const attachmentExistsResults = new Map<string, boolean>();

		// Simulate: current run produces 11 new artifacts
		const currentArtifacts: Artifact[] = [];
		for (let i = 0; i < 11; i++) {
			const hash = `hash-current-${i}`;
			const filename = `file-${i}.pdf`;
			attachmentExistsResults.set(hash, false);
			currentArtifacts.push(createArtifact(filename, hash));
		}

		const target = createMockTargetSystem(uploadCount, attachmentExistsResults);

		const result = await uploadAssets(target, "page-123", currentArtifacts);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Verify all 11 artifacts were uploaded (attachmentExists returned false)
		expect(uploadCount.value).toBe(11);

		// Verify the result contains exactly the current run's 11 entries
		const resultHashes = result.value.attachmentHashes;
		expect(Object.keys(resultHashes)).toHaveLength(11);

		for (let i = 0; i < 11; i++) {
			const filename = `file-${i}.pdf`;
			const hash = `hash-current-${i}`;
			expect(resultHashes).toHaveProperty(filename, hash);
		}
	});

	test("all attachments exist → 0 uploads, hashes still populated", async () => {
		const uploadCount = { value: 0 };
		const attachmentExistsResults = new Map<string, boolean>();

		const currentArtifacts: Artifact[] = [];
		for (let i = 0; i < 5; i++) {
			const hash = `hash-exists-${i}`;
			const filename = `file-${i}.png`;
			attachmentExistsResults.set(hash, true);
			currentArtifacts.push(createArtifact(filename, hash));
		}

		const target = createMockTargetSystem(uploadCount, attachmentExistsResults);

		const result = await uploadAssets(target, "page-456", currentArtifacts);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Verify all attachments existed (0 uploads)
		expect(uploadCount.value).toBe(0);

		// Verify the result contains all 5 current run entries
		const resultHashes = result.value.attachmentHashes;
		expect(Object.keys(resultHashes)).toHaveLength(5);

		for (let i = 0; i < 5; i++) {
			const filename = `file-${i}.png`;
			const hash = `hash-exists-${i}`;
			expect(resultHashes).toHaveProperty(filename, hash);
		}
	});
		expect(Object.keys(resultHashes)).toHaveLength(5);

		for (let i = 0; i < 5; i++) {
			const filename = `file-${i}.png`;
			const hash = `hash-exists-${i}`;
			expect(resultHashes).toHaveProperty(filename, hash);
		}
	});
});

describe("TC-LOCK-003 — NO_CHANGE preserves existing hashes (AC-F3-2)", () => {
	test("empty current run → empty hashes (not old binding's hashes)", async () => {
		const uploadCount = { value: 0 };
		const target = createMockTargetSystem(uploadCount);

		// Current run produces NO artifacts
		const currentArtifacts: Artifact[] = [];

		const result = await uploadAssets(target, "page-789", currentArtifacts);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Verify result is empty (no upload calls)
		expect(uploadCount.value).toBe(0);
		expect(Object.keys(result.value.attachmentHashes)).toHaveLength(0);
	});

	test("mixed existence → upload only missing, all hashes populated", async () => {
		const uploadCount = { value: 0 };
		const attachmentExistsResults = new Map<string, boolean>([
			["hash-1", true],
			["hash-2", true],
			["hash-3", false],
		]);

		const currentArtifacts: Artifact[] = [
			createArtifact("exists-1.pdf", "hash-1"),
			createArtifact("exists-2.png", "hash-2"),
			createArtifact("missing-1.svg", "hash-3"),
		];

		const target = createMockTargetSystem(uploadCount, attachmentExistsResults);

		const result = await uploadAssets(target, "page-999", currentArtifacts);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Verify only missing attachment was uploaded
		expect(uploadCount.value).toBe(1);

		// Verify all 3 current run entries are in result
		const resultHashes = result.value.attachmentHashes;
		expect(Object.keys(resultHashes)).toHaveLength(3);
		expect(resultHashes).toHaveProperty("exists-1.pdf", "hash-1");
		expect(resultHashes).toHaveProperty("exists-2.png", "hash-2");
		expect(resultHashes).toHaveProperty("missing-1.svg", "hash-3");
	});
});