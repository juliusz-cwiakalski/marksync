// tests/integration/cache/cache-disposable.test.ts
//
// Integration tests for the disposable cache layout (GH-19 F-4 / ADR-0006 C-3,
// TC-CACHE-002/003). Real temp-dir I/O — no mocks.
//   - TC-CACHE-002: ensureCacheLayout creates cache/journal/conflicts and is
//     idempotent on re-run.
//   - TC-CACHE-003: deleting .marksync/ changes no base — the committed lock is
//     the sole base and lives at the repo root, not in the cache.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { CACHE_SUBDIRS, ensureCacheLayout, resolveCacheDir } from "#app/cache";
import { loadLock, saveLock } from "#app/lock";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { DocumentId } from "#domain/identity/document-id";

const UUID = "0192b3d4-5e6f-7000-8000-00000000000a" as DocumentId;

function sampleBinding(): PageBinding {
	return {
		uuid: UUID,
		sourcePath: "docs/arch.md",
		pageId: "1122334455",
		parentPageId: "987654321",
		pageVersion: 7,
		sourceCommit: "abc123fullsha0000000000000000000000000000",
		sourceContentHash: "sha256:src",
		renderedBodyHash: "sha256:rend",
		remoteBodyHash: "sha256:rem",
		attachmentHashes: {},
		operationId: "op-1",
		synchronizedAt: "2026-07-09T00:00:00Z",
		toolVersion: "0.4.0",
	};
}

describe("ensureCacheLayout — TC-CACHE-002: creates subtrees, idempotent", () => {
	let dir: string;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	test("creates cache/, journal/, conflicts/ on a clean dir", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-cache-"));
		const r = ensureCacheLayout(dir);
		expect(r.ok).toBe(true);
		for (const sub of CACHE_SUBDIRS) {
			expect(existsSync(join(dir, sub))).toBe(true);
		}
	});

	test("is idempotent — a second run is a no-op (no error)", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-cache-"));
		expect(ensureCacheLayout(dir).ok).toBe(true);
		expect(ensureCacheLayout(dir).ok).toBe(true);
		for (const sub of CACHE_SUBDIRS) {
			expect(existsSync(join(dir, sub))).toBe(true);
		}
	});
});

describe("cache-disposable invariant — TC-CACHE-003: deleting .marksync/ changes no base", () => {
	let dir: string;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	test("rm -rf .marksync/ leaves the loadLock base byte-identical (C-3)", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-cache-"));

		// 1. The committed lock is the sole base — write it at the repo root.
		const lock: LockFile = {
			version: 1,
			targets: {
				corp: { documents: { [UUID]: sampleBinding() } },
			},
		};
		expect(saveLock(dir, lock).ok).toBe(true);

		// 2. Populate the disposable cache with a reconstructable artifact.
		const cacheDir = resolveCacheDir(dir);
		expect(ensureCacheLayout(cacheDir).ok).toBe(true);
		writeFileSync(
			join(cacheDir, "cache", "rendered-arch.html"),
			"<html>cached artifact</html>",
			"utf-8",
		);
		expect(existsSync(join(cacheDir, "cache", "rendered-arch.html"))).toBe(
			true,
		);

		// 3. Snapshot the base BEFORE deleting the cache.
		const before = loadLock(dir);
		expect(before.ok).toBe(true);

		// 4. Delete the entire .marksync/ tree (what a fresh clone / CI cleanup
		//    does). The lock file is a sibling, NOT inside .marksync/.
		rmSync(cacheDir, { recursive: true, force: true });
		expect(existsSync(cacheDir)).toBe(false);
		// The lock survives (it was never in the cache).
		expect(existsSync(join(dir, "marksync.lock.yml"))).toBe(true);

		// 5. Re-load the base — it is unchanged (the cache held no correctness
		//    data; C-3 at the layout level).
		const after = loadLock(dir);
		expect(after.ok).toBe(true);
		if (!before.ok || !after.ok) return;
		expect(after.value).toEqual(before.value);
		expect(after.value).toEqual(lock);
	});
});
