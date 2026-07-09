// tests/unit/domain/render/canonicalize.test.ts
//
// canonicalize + contentHash — determinism + raw lowercase-hex sha256 (GH-20 F-3 /
// AC-F3-1). TC-HASH-001..004. No mocks: real bridge → real canonicalize → real hash.

import type { Root } from "hast";
import { describe, expect, test } from "bun:test";
import { canonicalize, contentHash } from "#domain/render/canonicalize";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";

function renderTo(src: string): Root {
	return canonicalize(mdastToHast(parseMarkdown(src).value as never));
}

describe("TC-HASH-001 (AC-F3-1) — same canonical HAST → identical digest", () => {
	test("calling contentHash twice on the same canonical tree is identical", () => {
		const canonical = renderTo("# Title\n\nbody **bold**\n");
		expect(contentHash(canonical)).toBe(contentHash(canonical));
	});

	test("canonicalize is idempotent (canonical of canonical === canonical)", () => {
		const canonical = renderTo("# Title\n\nbody\n");
		expect(contentHash(canonicalize(canonical))).toBe(contentHash(canonical));
	});
});

describe("TC-HASH-002 (AC-F3-1) — attribute-order / position differences hash identically", () => {
	const base = mdastToHast(
		parseMarkdown("[q](https://e.com/x?q=1&r=2)\n").value as never,
	);

	test("a re-parsed tree (fresh positions) hashes identically to the original", () => {
		// Two independent parses carry different source positions but identical
		// content; after canonicalization their digests must match.
		const a = canonicalize(
			mdastToHast(
				parseMarkdown("[q](https://e.com/x?q=1&r=2)\n").value as never,
			),
		);
		const b = canonicalize(base);
		expect(contentHash(a)).toBe(contentHash(b));
	});

	test("position metadata is stripped from the canonical form", () => {
		const canonical = canonicalize(base);
		expect(JSON.stringify(canonical)).not.toContain('"position"');
	});
});

describe("TC-HASH-003 — semantically-different fixtures hash differently", () => {
	const a = renderTo("# One\n");
	const b = renderTo("# Two\n");

	test("different content → different digest", () => {
		expect(contentHash(a)).not.toBe(contentHash(b));
	});
});

describe("TC-HASH-004 — digest is raw lowercase-hex sha256 (length 64, no prefix)", () => {
	const canonical = renderTo("# Title\n");

	test("digest is 64 lowercase hex chars with no `sha256:` prefix", () => {
		const digest = contentHash(canonical);
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
		expect(digest.startsWith("sha256:")).toBe(false);
		expect(digest).toBe(digest.toLowerCase());
	});

	test("digest matches the pinned value for this fixture (algorithm pin)", () => {
		// Pins the canonicalization + sha256 algorithm against drift. If either the
		// normalization or the hash changes, this fails and forces a reviewed update.
		expect(contentHash(canonical)).toBe(
			"d53386221be18928cee5616dc01594df25c09c5583f7e64f083ad803ca6ced6f",
		);
	});
});
