// Unit tests for the duplicate-UUID detector (GH-18 F-4 / F-7 / INV-SAFE-3 /
// ADR-0006 C-4). The release-blocking invariant is proven HERE at the detector
// level: a duplicated fixture yields the fatal DuplicateUuid (TC-DUP-001 /
// TC-DUP-007). No mocks — real fixtures.

import { describe, expect, test } from "bun:test";
import { detectDuplicateUuids } from "#domain/identity/duplicate-detector";
import type { DocWithUuid } from "#domain/identity/duplicate-detector";
import type { DocumentId } from "#domain/identity/document-id";
import { assertNeverMarkSyncError, type MarkSyncError } from "#domain/errors";
import { generateUuidV7 } from "#domain/identity/uuid";

const UUID_A = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d" as DocumentId;
const UUID_B = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6e" as DocumentId;
const UUID_C = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6f" as DocumentId;

/** Order-tolerant comparison of the colliding paths list. */
function pathsEq(actual: string[], expected: string[]): boolean {
	return (
		actual.length === expected.length &&
		expected.every((p) => actual.includes(p))
	);
}

describe("detectDuplicateUuids", () => {
	test("TC-DUP-001 (INV-SAFE-3): two docs sharing a uuid → err(DuplicateUuid) listing BOTH paths", () => {
		const docs: DocWithUuid[] = [
			{ path: "docs/a.md", uuid: UUID_A },
			{ path: "docs/b.md", uuid: UUID_A },
		];
		const result = detectDuplicateUuids(docs);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("DuplicateUuid");
		if (result.error.kind !== "DuplicateUuid") return;
		expect(result.error.uuid).toBe(UUID_A);
		expect(pathsEq(result.error.paths, ["docs/a.md", "docs/b.md"])).toBe(true);
	});

	test("TC-DUP-002: all docs distinct uuids → ok", () => {
		const result = detectDuplicateUuids([
			{ path: "a.md", uuid: UUID_A },
			{ path: "b.md", uuid: UUID_B },
			{ path: "c.md", uuid: UUID_C },
		]);
		expect(result.ok).toBe(true);
	});

	test("TC-DUP-003: docs MISSING a uuid are NOT duplicates → ok", () => {
		const result = detectDuplicateUuids([
			{ path: "a.md" },
			{ path: "b.md" },
			{ path: "c.md" },
		]);
		expect(result.ok).toBe(true);
	});

	test("TC-DUP-004: mixed — one missing + two sharing names ONLY the sharing pair", () => {
		const result = detectDuplicateUuids([
			{ path: "missing.md" },
			{ path: "a.md", uuid: UUID_A },
			{ path: "b.md", uuid: UUID_A },
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.error.kind !== "DuplicateUuid") {
			expect.unreachable("expected DuplicateUuid");
			return;
		}
		expect(result.error.uuid).toBe(UUID_A);
		expect(result.error.paths).toHaveLength(2);
		expect(result.error.paths).not.toContain("missing.md");
	});

	test("TC-DUP-005: 3-way dup lists all 3 paths; first-collision-only", () => {
		// X shared by a/b/c (first occurrence before Y); Y shared by d/e.
		const result = detectDuplicateUuids([
			{ path: "a.md", uuid: UUID_A },
			{ path: "b.md", uuid: UUID_A },
			{ path: "c.md", uuid: UUID_A },
			{ path: "d.md", uuid: UUID_B },
			{ path: "e.md", uuid: UUID_B },
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.error.kind !== "DuplicateUuid") {
			expect.unreachable("expected DuplicateUuid");
			return;
		}
		// the FIRST collision (UUID_A) is reported with all three of its paths
		expect(result.error.uuid).toBe(UUID_A);
		expect(result.error.paths).toHaveLength(3);
		expect(pathsEq(result.error.paths, ["a.md", "b.md", "c.md"])).toBe(true);
		// the second collision (UUID_B) is NOT surfaced in this result
		expect(result.error.uuid).not.toBe(UUID_B);
	});

	test("TC-DUP-006: DuplicateUuid is the existing MarkSyncError arm (no new arm) — regression", () => {
		const result = detectDuplicateUuids([
			{ path: "a.md", uuid: UUID_A },
			{ path: "b.md", uuid: UUID_A },
		]);
		if (result.ok) {
			expect.unreachable("expected err");
			return;
		}
		const asUnion: MarkSyncError = result.error;
		expect(asUnion.kind).toBe("DuplicateUuid");
		// An exhaustive handler — would not type-check if a new arm had been added.
		const handled = (e: MarkSyncError): "dup" | "other" => {
			if (e.kind === "DuplicateUuid") return "dup";
			assertNeverMarkSyncError(e);
			return "other";
		};
		expect(handled(result.error)).toBe("dup");
	});

	test("TC-DUP-007 (halt signal): the detector RETURNS the fatal err — never throws", () => {
		// The returned err IS the halt signal a write flow gates on (DEC-1).
		expect(() =>
			detectDuplicateUuids([
				{ path: "a.md", uuid: UUID_A },
				{ path: "b.md", uuid: UUID_A },
			]),
		).not.toThrow();
		const result = detectDuplicateUuids([
			{ path: "a.md", uuid: UUID_A },
			{ path: "b.md", uuid: UUID_A },
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("DuplicateUuid");
	});

	test("TC-SCALE-001: 500-doc corpus with one duplicate pair completes without error", () => {
		const docs: DocWithUuid[] = [];
		for (let i = 0; i < 498; i++) {
			docs.push({ path: `doc-${i}.md`, uuid: generateUuidV7() });
		}
		// the duplicate pair
		docs.push({ path: "dup-1.md", uuid: UUID_C });
		docs.push({ path: "dup-2.md", uuid: UUID_C });
		const result = detectDuplicateUuids(docs);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.error.kind !== "DuplicateUuid") {
			expect.unreachable("expected DuplicateUuid");
			return;
		}
		expect(result.error.uuid).toBe(UUID_C);
		expect(pathsEq(result.error.paths, ["dup-1.md", "dup-2.md"])).toBe(true);
	});

	test("empty input → ok", () => {
		expect(detectDuplicateUuids([]).ok).toBe(true);
	});
});
