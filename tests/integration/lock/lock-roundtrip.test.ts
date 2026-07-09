// tests/integration/lock/lock-roundtrip.test.ts
//
// Integration tests for saveLock + serializeLock + mergeBindings (GH-19 F-1,
// TC-LOCK-006 / TC-MERGE-001 / TC-NOSECRET-001). Real temp-dir I/O — no mocks.
//   - TC-LOCK-006: saveLock -> loadLock is a lossless round-trip; the on-disk
//     file is UUID-ordered (DEC-1).
//   - TC-MERGE-001: two branches adding different-UUID docs merge cleanly;
//     mergeBindings yields the union, and (when git is available) a real
//     `git merge-file` produces no conflict markers.
//   - TC-NOSECRET-001: a serialized full lock carries no secret-bearing field.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadLock, mergeBindings, saveLock, serializeLock } from "#app/lock";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { DocumentId } from "#domain/identity/document-id";

const UUID_EARLY = "0192b3d4-5e6f-7000-8000-000000000001" as DocumentId;
const UUID_MID = "0192b3d4-5e6f-7000-8000-00000000000a" as DocumentId;
const UUID_LATE = "0192b3d4-5e6f-7000-8000-0000000000ff" as DocumentId;
// sorted order: EARLY < MID < LATE

function makeBinding(uuid: DocumentId, tag: string): PageBinding {
	return {
		uuid,
		sourcePath: `docs/${tag}.md`,
		pageId: `page-${tag}`,
		parentPageId: `parent-${tag}`,
		pageVersion: tag.length + 1,
		sourceCommit: `sha-${tag}00000000000000000000000000000000000`,
		sourceContentHash: `sha256:src-${tag}`,
		renderedBodyHash: `sha256:rend-${tag}`,
		remoteBodyHash: `sha256:rem-${tag}`,
		attachmentHashes: { [`assets/${tag}.png`]: `sha256:att-${tag}` },
		operationId: `op-${tag}`,
		synchronizedAt: "2026-07-09T00:00:00Z",
		toolVersion: "0.4.0",
	};
}

describe("saveLock + loadLock — TC-LOCK-006: lossless round-trip, UUID-ordered", () => {
	test("save -> reload yields a deep-equal LockFile; on-disk file is UUID-ordered", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-rt-"));
		try {
			// Insert keys in NON-sorted order to prove serialization sorts them.
			const lock: LockFile = {
				version: 1,
				targets: {
					zeta: { documents: {} },
					alpha: {
						documents: {
							[UUID_LATE]: makeBinding(UUID_LATE, "late"),
							[UUID_EARLY]: makeBinding(UUID_EARLY, "early"),
						},
					},
				},
			};

			expect(saveLock(dir, lock).ok).toBe(true);

			const reloaded = loadLock(dir);
			expect(reloaded.ok).toBe(true);
			if (!reloaded.ok) return;
			// Lossless round-trip (deep-equal ignores key insertion order).
			expect(reloaded.value).toEqual(lock);

			// On-disk file is deterministically ordered: target ids sorted, and
			// within a target the document keys appear in sorted UUID order.
			const file = readFileSync(join(dir, "marksync.lock.yml"), "utf-8");
			const alphaIdx = file.indexOf("alpha:");
			const zetaIdx = file.indexOf("zeta:");
			expect(alphaIdx).toBeGreaterThan(-1);
			expect(zetaIdx).toBeGreaterThan(-1);
			expect(alphaIdx).toBeLessThan(zetaIdx);
			const earlyIdx = file.indexOf(UUID_EARLY);
			const lateIdx = file.indexOf(UUID_LATE);
			expect(earlyIdx).toBeGreaterThan(alphaIdx);
			expect(earlyIdx).toBeLessThan(lateIdx);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("mergeBindings + git line-merge — TC-MERGE-001: clean two-branch merge", () => {
	const base: LockFile = {
		version: 1,
		targets: { T: { documents: { [UUID_MID]: makeBinding(UUID_MID, "mid") } } },
	};
	// branch-A adds a doc that sorts BEFORE the base doc (distinct line region).
	const branchA: LockFile = {
		version: 1,
		targets: {
			T: {
				documents: {
					[UUID_MID]: makeBinding(UUID_MID, "mid"),
					[UUID_EARLY]: makeBinding(UUID_EARLY, "early"),
				},
			},
		},
	};
	// branch-B adds a doc that sorts AFTER the base doc (distinct line region).
	const branchB: LockFile = {
		version: 1,
		targets: {
			T: {
				documents: {
					[UUID_MID]: makeBinding(UUID_MID, "mid"),
					[UUID_LATE]: makeBinding(UUID_LATE, "late"),
				},
			},
		},
	};

	test("mergeBindings yields the union of both branches with no loss (DEC-4)", () => {
		const merged = mergeBindings(branchA, branchB);
		const docs = merged.targets.T.documents;
		expect(Object.keys(docs).sort()).toEqual(
			[UUID_EARLY, UUID_MID, UUID_LATE].sort(),
		);
		expect(docs[UUID_EARLY]?.sourcePath).toBe("docs/early.md");
		expect(docs[UUID_LATE]?.sourcePath).toBe("docs/late.md");
	});

	test("last-write-wins: a UUID present in both keeps b's binding", () => {
		const aOverride: LockFile = {
			version: 1,
			targets: {
				T: { documents: { [UUID_MID]: makeBinding(UUID_MID, "from-a") } },
			},
		};
		const bOverride: LockFile = {
			version: 1,
			targets: {
				T: { documents: { [UUID_MID]: makeBinding(UUID_MID, "from-b") } },
			},
		};
		const merged = mergeBindings(aOverride, bOverride);
		expect(merged.targets.T.documents[UUID_MID]?.pageId).toBe("page-from-b");
	});

	test("a real `git merge-file` of the two branch locks is conflict-free (when git is available)", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-merge-"));
		try {
			const baseFile = join(dir, "base.lock");
			const aFile = join(dir, "a.lock");
			const bFile = join(dir, "b.lock");
			writeFileSync(baseFile, serializeLock(base), "utf-8");
			writeFileSync(aFile, serializeLock(branchA), "utf-8");
			writeFileSync(bFile, serializeLock(branchB), "utf-8");

			// `git merge-file -p A base B` prints the 3-way merge to stdout.
			// status 0 = clean; >0 = number of conflicts; null = git unavailable.
			const r = spawnSync("git", ["merge-file", "-p", aFile, baseFile, bFile], {
				encoding: "utf-8",
			});
			if (r.error || r.status === null) {
				// git not available in this environment — the mergeBindings union
				// + structural assertions above already prove mergeability.
				return;
			}
			expect(r.status).toBe(0); // clean merge, no conflicts
			expect(r.stdout).not.toContain("<<<<<<<");
			expect(r.stdout).not.toContain(">>>>>>>");
			expect(r.stdout).toContain(UUID_EARLY);
			expect(r.stdout).toContain(UUID_MID);
			expect(r.stdout).toContain(UUID_LATE);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("serializeLock — TC-NOSECRET-001: no secret-bearing field (INV-SEC-1)", () => {
	test("a full serialized lock carries no credential/token/secret field or value", () => {
		const lock: LockFile = {
			version: 1,
			targets: {
				corp: {
					documents: { [UUID_MID]: makeBinding(UUID_MID, "mid") },
				},
			},
		};
		const serialized = serializeLock(lock);
		// The committed lock is reviewable: it must carry the PageBinding field
		// set (paths, ids, hashes, commits) and NO credential of any kind.
		for (const secret of [
			"token",
			"password",
			"credential",
			"apikey",
			"authorization",
			"bearer",
			"ghp_",
			"atatt",
			"secret",
			"@",
		]) {
			expect(serialized.toLowerCase()).not.toContain(secret);
		}
		// Sanity: the expected fields ARE present.
		expect(serialized).toContain("sourcePath:");
		expect(serialized).toContain("pageVersion:");
		expect(serialized).toContain("attachmentHashes:");
	});
});
