// tests/unit/domain/state/hashes.test.ts
//
// Unit tests for ContentHash VO + hash helpers (GH-22 F-2/DM-2; TC-HASH-001/002).
// Pure functions over real inputs — no mocks.

import { describe, expect, test } from "bun:test";
import { attachmentHash, buildContentHash, canonicalHash, rawHash } from "#domain/state/hashes";
import type { Root } from "hast";

/** Minimal HAST for testing. */
function minHast(): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "h1",
				properties: {},
				children: [{ type: "text", value: "Hello" }],
			},
		],
	};
}

/** Hash-001: construct a ContentHash and assert all three facets are non-empty sha256: strings. */
test("TC-HASH-001: ContentHash composes raw + canonical + attachment facets; canonicalHash !== rawHash", () => {
	const source = "Hello world";
	const hast = minHast();
	const attachmentHashes = { "img.png": "sha256:abc123", "doc.pdf": "sha256:def456" };
	const title = "Test Page";
	const parentPageId = "12345";

	const contentHash = buildContentHash({
		source,
		hast,
		attachmentHashes,
		title,
		parentPageId,
	});

	// All three hash facets are non-empty sha256:-prefixed strings
	expect(contentHash.rawHash).toMatch(/^sha256:[a-f0-9]{64}$/);
	expect(contentHash.canonicalHash).toMatch(/^sha256:[a-f0-9]{64}$/);
	expect(contentHash.attachmentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
	expect(contentHash.title).toBe(title);
	expect(contentHash.parentPageId).toBe(parentPageId);

	// canonicalHash differs from rawHash (proves canonicalization ran)
	expect(contentHash.canonicalHash).not.toBe(contentHash.rawHash);
});

/** Hash-002: canonicalHash is deterministic; stable under superficial whitespace diff. */
test("TC-HASH-002: canonicalHash deterministic across runs; stable under superficial whitespace diff", () => {
	const hast = minHast();

	// Run construction 5 times on the same input — all canonicalHashes identical
	const hashes = Array.from({ length: 5 }, () => canonicalHash(hast));
	expect(hashes.every((h) => h === hashes[0])).toBe(true);

	// Same HAST with superficially different source bytes (extra whitespace)
	// yields the same canonicalHash (delegation to GH-20's conservative canonicalizer)
	const source1 = "Hello world";
	const source2 = "Hello  world  ";
	const hashes1 = buildContentHash({
		source: source1,
		hast,
		attachmentHashes: {},
		title: "Test",
		parentPageId: "123",
	});
	const hashes2 = buildContentHash({
		source: source2,
		hast,
		attachmentHashes: {},
		title: "Test",
		parentPageId: "123",
	});

	// canonicalHash is identical (same HAST)
	expect(hashes1.canonicalHash).toBe(hashes2.canonicalHash);

	// rawHash differs (different source bytes)
	expect(hashes1.rawHash).not.toBe(hashes2.rawHash);
});

describe("attachmentHash", () => {
	test("deterministic digest over sorted attachment set", () => {
		const hashes1 = { "b.txt": "hashB", "a.txt": "hashA", "c.txt": "hashC" };
		const hashes2 = { "c.txt": "hashC", "a.txt": "hashA", "b.txt": "hashB" };

		const hash1 = attachmentHash(hashes1);
		const hash2 = attachmentHash(hashes2);

		// Order-independent — same digest
		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});

describe("rawHash", () => {
	test("produces sha256:-prefixed hex digest", () => {
		const hash = rawHash("test input");
		expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});

describe("canonicalHash", () => {
	test("delegates to contentHash(canonicalize(hast))", () => {
		const hast = minHast();
		const hash = canonicalHash(hast);
		expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});