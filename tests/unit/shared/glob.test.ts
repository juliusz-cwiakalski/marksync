// tests/unit/shared/glob.test.ts
//
// Unit tests for the zero-dependency glob matcher (DEC-5 / RSK-6 / spec OQ-2).
// Exercises `**`, `*`, `?`, nested directories, and anchoring semantics. Pure
// text-matching over repo-relative paths — no FS/Git I/O (mirrors
// `src/shared/glob.ts`).

import { describe, expect, test } from "bun:test";
import { filterByGlob, globToRegExp, matchGlob } from "#shared/glob";

describe("matchGlob — single segment `*`", () => {
	test("matches any chars within one segment except the separator", () => {
		expect(matchGlob("docs/*.md", "docs/a.md")).toBe(true);
		expect(matchGlob("docs/*.md", "docs/readme.md")).toBe(true);
		expect(matchGlob("docs/*.md", "docs/a/b.md")).toBe(false);
		expect(matchGlob("docs/*.md", "docs/readme.txt")).toBe(false);
	});

	test("`*` does not cross directory boundaries", () => {
		expect(matchGlob("a/*/c", "a/b/c")).toBe(true);
		expect(matchGlob("a/*/c", "a/b/x/c")).toBe(false);
	});

	test("literal `?` matches exactly one non-separator char", () => {
		expect(matchGlob("a?c", "abc")).toBe(true);
		expect(matchGlob("a?c", "ac")).toBe(false);
		expect(matchGlob("a?c", "abbc")).toBe(false);
		expect(matchGlob("a/?/d", "a/x/d")).toBe(true);
		expect(matchGlob("a/?/d", "a/xy/d")).toBe(false);
	});
});

describe("matchGlob — recursive `**`", () => {
	test("docs/**/*.md matches at every depth (incl. directly under docs)", () => {
		const pattern = "docs/**/*.md";
		expect(matchGlob(pattern, "docs/a.md")).toBe(true);
		expect(matchGlob(pattern, "docs/a/b.md")).toBe(true);
		expect(matchGlob(pattern, "docs/a/b/c.md")).toBe(true);
		expect(matchGlob(pattern, "docs/a/b/c/d.md")).toBe(true);
	});

	test("`**/` matches zero path segments (a/**/b ≡ a/b and a/x/b)", () => {
		expect(matchGlob("a/**/b", "a/b")).toBe(true);
		expect(matchGlob("a/**/b", "a/x/b")).toBe(true);
		expect(matchGlob("a/**/b", "a/x/y/b")).toBe(true);
		expect(matchGlob("a/**/b", "a/x/y")).toBe(false);
	});

	test("trailing `**` matches any suffix across separators", () => {
		expect(matchGlob("docs/**", "docs/a.md")).toBe(true);
		expect(matchGlob("docs/**", "docs/a/b.md")).toBe(true);
		expect(matchGlob("docs/**", "docs/a/b/c.md")).toBe(true);
		// `docs/**` should not match `docs` itself (no trailing subtree).
		expect(matchGlob("docs/**", "docs")).toBe(false);
		expect(matchGlob("docs/**", "other/x.md")).toBe(false);
	});

	test("bare `**` matches everything", () => {
		expect(matchGlob("**", "a.md")).toBe(true);
		expect(matchGlob("**", "docs/a/b.md")).toBe(true);
	});

	test("`**/*.md` matches a file at any depth", () => {
		expect(matchGlob("**/*.md", "a.md")).toBe(true);
		expect(matchGlob("**/*.md", "x/a.md")).toBe(true);
		expect(matchGlob("**/*.md", "x/y/a.md")).toBe(true);
	});
});

describe("matchGlob — literals & anchoring (OQ-2)", () => {
	test("exact literal match only (anchored ^…$)", () => {
		expect(matchGlob("docs/readme.md", "docs/readme.md")).toBe(true);
		expect(matchGlob("docs/readme.md", "docs/readme.md.bak")).toBe(false);
		expect(matchGlob("docs/readme.md", "prefix/docs/readme.md")).toBe(false);
	});

	test("regex-special characters are escaped, not interpreted", () => {
		expect(matchGlob("a.b.c", "a.b.c")).toBe(true);
		expect(matchGlob("a.b.c", "axbxc")).toBe(false);
		expect(matchGlob("v1.0", "v1.0")).toBe(true);
		expect(matchGlob("[weird]", "[weird]")).toBe(true);
		expect(matchGlob("a+b", "a+b")).toBe(true);
	});

	test("anchoring: patterns are matched against the supplied path verbatim", () => {
		// Documented OQ-2 resolution: no leading-slash special-casing; patterns
		// match the repo-relative path entries directly.
		expect(matchGlob("docs/**/*.md", "docs/a.md")).toBe(true);
		expect(matchGlob("/docs/**/*.md", "docs/a.md")).toBe(false);
		expect(matchGlob("/docs/**/*.md", "/docs/a.md")).toBe(true);
	});
});

describe("globToRegExp", () => {
	test("returns an anchored RegExp", () => {
		const re = globToRegExp("*.md");
		expect(re).toBeInstanceOf(RegExp);
		expect(re.test("a.md")).toBe(true);
		expect(re.test("a.txt")).toBe(false);
	});
});

describe("filterByGlob", () => {
	const paths = [
		"docs/index.md",
		"docs/guide/intro.md",
		"docs/guide/advanced/tips.md",
		"docs/draft/wip.md",
		"README.md",
		"package.json",
	];

	test("selects exactly the matching entries", () => {
		expect(filterByGlob("docs/**/*.md", paths)).toEqual([
			"docs/index.md",
			"docs/guide/intro.md",
			"docs/guide/advanced/tips.md",
			"docs/draft/wip.md",
		]);
		expect(filterByGlob("docs/draft/**", paths)).toEqual(["docs/draft/wip.md"]);
	});

	test("returns empty array when nothing matches", () => {
		expect(filterByGlob("nonexistent/**", paths)).toEqual([]);
	});
});
