// tests/unit/app/document-config.test.ts
//
// Unit tests for front-matter parsing + document overrides (GH-15 F-4 /
// TC-DOC-001..009). Exercises the REAL yaml parser on fenced blocks (no mock).
// Covers title/parent/uuid/exclude overrides and every RSK-5 edge case (absent,
// unrelated keys, malformed fences, CRLF, empty fences, no overrides).

import { describe, expect, test } from "bun:test";
import {
	parseFrontMatter,
	resolveDocumentConfig,
	resolveDocumentFromMarkdown,
} from "#app/document-config";
import type { DocumentConfig } from "#app/document-config";

function base(overrides: Partial<DocumentConfig> = {}): DocumentConfig {
	return {
		sourcePath: "docs/guide/intro.md",
		title: "Intro",
		intendedParent: "docs/guide/",
		exclude: false,
		...overrides,
	};
}

describe("parseFrontMatter", () => {
	test("extracts a YAML mapping between leading fences", () => {
		const md = "---\nmarksync:\n  title: Hello\n---\n# body\n";
		expect(parseFrontMatter(md)).toEqual({
			marksync: { title: "Hello" },
		});
	});

	test("returns {} when there is no front-matter", () => {
		expect(parseFrontMatter("# just a title\nbody")).toEqual({});
	});

	test("returns {} when the opener is not at the very start", () => {
		// A leading blank line before the fence means it is not front-matter.
		expect(parseFrontMatter("\n---\nkey: val\n---\n")).toEqual({});
	});

	test("tolerates a missing closing fence (malformed)", () => {
		expect(parseFrontMatter("---\nmarksync:\n  title: X\n")).toEqual({});
	});

	test("tolerates unrelated (non-marksync) keys", () => {
		const md = "---\ntitle: Ignored\ntags: [a, b]\ndraft: true\n---\nbody\n";
		expect(parseFrontMatter(md)).toEqual({
			title: "Ignored",
			tags: ["a", "b"],
			draft: true,
		});
	});

	test("tolerates empty front-matter fences", () => {
		expect(parseFrontMatter("---\n---\nbody")).toEqual({});
	});

	test("handles CRLF line endings (RSK-5)", () => {
		const md = "---\r\nmarksync:\r\n  title: Hi\r\n---\r\n# body\r\n";
		expect(parseFrontMatter(md)).toEqual({ marksync: { title: "Hi" } });
	});

	test("tolerates invalid YAML inside the fences (returns {})", () => {
		const md = "---\n: : : broken\n---\nbody\n";
		expect(parseFrontMatter(md)).toEqual({});
	});

	test("accepts the `...` terminator", () => {
		const md = "---\nmarksync:\n  exclude: true\n...\nbody\n";
		expect(parseFrontMatter(md)).toEqual({ marksync: { exclude: true } });
	});
});

describe("resolveDocumentConfig — overrides", () => {
	test("TC-DOC-001: marksync.title overrides the derived title (AC-F4-1)", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { title: "X" },
		});
		expect(result.title).toBe("X");
	});

	test("TC-DOC-002: marksync.exclude: true flags the document for removal (AC-F4-2)", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { exclude: true },
		});
		expect(result.exclude).toBe(true);
	});

	test("TC-DOC-003: marksync.parent overrides the intended parent", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { parent: "docs/other/" },
		});
		expect(result.intendedParent).toBe("docs/other/");
	});

	test("TC-DOC-004: marksync.uuid is carried through (identity hook)", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { uuid: "0190a3b4-uuid-v7" },
		});
		expect(result.uuid).toBe("0190a3b4-uuid-v7");
	});

	test("TC-DOC-005: absent front-matter is tolerated (returns base)", () => {
		expect(resolveDocumentConfig(base(), {})).toEqual(base());
	});

	test("TC-DOC-006: unrelated (non-marksync) front-matter keys are ignored", () => {
		const result = resolveDocumentConfig(base(), {
			title: "Ignored",
			tags: ["a"],
			draft: true,
		});
		expect(result).toEqual(base());
	});

	test("TC-DOC-007: malformed marksync (not a mapping) is tolerated", () => {
		const result = resolveDocumentConfig(base(), { marksync: "oops" });
		expect(result).toEqual(base());
	});

	test("TC-DOC-008: wrong-typed marksync.* values are ignored", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { title: 123, exclude: "yes" },
		});
		expect(result).toEqual(base());
	});

	test("TC-DOC-009: no overrides → returns base unchanged (identity merge)", () => {
		const result = resolveDocumentConfig(base(), { marksync: {} });
		expect(result).toEqual(base());
	});

	test("multiple overrides applied together", () => {
		const result = resolveDocumentConfig(base(), {
			marksync: { title: "New", parent: "docs/x/", uuid: "u1", exclude: true },
		});
		expect(result).toEqual({
			sourcePath: "docs/guide/intro.md",
			title: "New",
			intendedParent: "docs/x/",
			uuid: "u1",
			exclude: true,
		});
	});

	test("uuid present in base is preserved when front-matter omits it", () => {
		const withUuid = base({ uuid: "base-uuid" });
		const result = resolveDocumentConfig(withUuid, {
			marksync: { title: "T" },
		});
		expect(result.uuid).toBe("base-uuid");
		expect(result.title).toBe("T");
	});
});

describe("resolveDocumentFromMarkdown — end-to-end", () => {
	test("parses a full markdown doc and applies overrides", () => {
		const md = [
			"---",
			"marksync:",
			"  title: Overridden",
			"  exclude: true",
			"---",
			"# Body",
			"",
			"content",
		].join("\n");
		const result = resolveDocumentFromMarkdown(base(), md);
		expect(result.title).toBe("Overridden");
		expect(result.exclude).toBe(true);
	});

	test("a document with no front-matter returns base", () => {
		expect(resolveDocumentFromMarkdown(base(), "# No fm\nbody")).toEqual(
			base(),
		);
	});
});
