// tests/unit/app/select-files.test.ts
//
// Unit tests for `selectFiles` (GH-15 F-3 / AC-F3-2). Pure set-difference over
// a caller-supplied path list — no Git/working-tree I/O (NFR-4 / DEC-4).
// Exercises include (`select`), exclude (`exclude`), `**` recursion, anchoring
// (OQ-2), empty inputs, and determinism (de-dup + sort). Uses the zero-dep
// matcher from `#shared/glob` (DEC-5) — no mocking.

import { describe, expect, test } from "bun:test";
import { selectFiles } from "#app/config";
import type { ProjectConfig } from "#domain/config/types";

function config(select: string[], exclude: string[] = []): ProjectConfig {
	return {
		version: 1,
		root: "docs/",
		select,
		exclude,
		hierarchy: "mirror",
		targets: {
			default: { type: "confluence", spaceKey: "ENG", parentPageId: "1" },
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
		output: { format: "storage", color: "auto" },
		provenance: { visiblePanel: true },
	};
}

const CORPUS = [
	"docs/index.md",
	"docs/guide/intro.md",
	"docs/guide/advanced/tips.md",
	"docs/draft/wip.md",
	"docs/draft/old.md",
	"README.md",
	"package.json",
	"src/index.ts",
];

describe("selectFiles — TC-SELECT-001/002/003: include / exclude / set difference", () => {
	test("includes exactly the paths matching `select` globs", () => {
		const result = selectFiles(config(["docs/**/*.md"]), CORPUS);
		expect(result).toEqual([
			"docs/draft/old.md",
			"docs/draft/wip.md",
			"docs/guide/advanced/tips.md",
			"docs/guide/intro.md",
			"docs/index.md",
		]);
	});

	test("excludes paths matching `exclude` globs", () => {
		const result = selectFiles(
			config(["docs/**/*.md"], ["docs/draft/**"]),
			CORPUS,
		);
		expect(result).toEqual([
			"docs/guide/advanced/tips.md",
			"docs/guide/intro.md",
			"docs/index.md",
		]);
		// Every exclude-matching path is removed.
		expect(result.some((p) => p.startsWith("docs/draft/"))).toBe(false);
	});

	test("select minus exclude on a mixed fixture list (zero misclassifications)", () => {
		const result = selectFiles(
			config(["docs/**/*.md", "README.md"], ["**/draft/**"]),
			CORPUS,
		);
		expect(result).toEqual([
			"README.md",
			"docs/guide/advanced/tips.md",
			"docs/guide/intro.md",
			"docs/index.md",
		]);
	});
});

describe("selectFiles — TC-SELECT-004: `**` recursion", () => {
	test("`**` matches files at every depth", () => {
		const paths = [
			"docs/a.md",
			"docs/a/b.md",
			"docs/a/b/c.md",
			"docs/a/b/c/d.md",
		];
		expect(selectFiles(config(["docs/**/*.md"]), paths)).toEqual([
			"docs/a.md",
			"docs/a/b.md",
			"docs/a/b/c.md",
			"docs/a/b/c/d.md",
		]);
	});
});

describe("selectFiles — TC-SELECT-005: anchoring relative to root (OQ-2)", () => {
	test("patterns match the supplied path entries verbatim (no root prefix stripping)", () => {
		// Documented OQ-2 resolution: globs match repo-relative paths directly;
		// `root` is consumed by hierarchy, not selection. So `docs/**/*.md` with
		// `root: docs/` still matches full `docs/...` entries.
		const result = selectFiles(config(["docs/**/*.md"]), [
			"docs/a.md",
			"other/b.md",
		]);
		expect(result).toEqual(["docs/a.md"]);
	});

	test("exclude can target a subtree independent of root", () => {
		const result = selectFiles(config(["docs/**/*.md"], ["docs/private/**"]), [
			"docs/a.md",
			"docs/private/secret.md",
		]);
		expect(result).toEqual(["docs/a.md"]);
	});
});

describe("selectFiles — TC-SELECT-006/007: empty inputs", () => {
	test("empty path list → empty result (no throw)", () => {
		expect(selectFiles(config(["docs/**/*.md"]), [])).toEqual([]);
	});

	test("empty `select` → empty result", () => {
		expect(selectFiles(config([]), CORPUS)).toEqual([]);
	});

	test("empty `exclude` → all select-matches retained", () => {
		const withEmptyExclude = config(["docs/**/*.md"], []);
		const withNoExclude = config(["docs/**/*.md"]);
		expect(selectFiles(withEmptyExclude, CORPUS)).toEqual(
			selectFiles(withNoExclude, CORPUS),
		);
	});
});

describe("selectFiles — TC-SELECT-008: purity (NFR-4 / DEC-4)", () => {
	test("accepts a plain string[] and returns a string[] with no Git/FS dependency", () => {
		// Purity proof (no mock needed — over-mocking guardrail): the paths
		// below do NOT exist on disk. If selectFiles touched the filesystem or
		// Git, these would error or be filtered. They are matched purely by
		// glob text-matching, proving zero tree I/O (NFR-4).
		const nonExistent = [
			"docs/does-not-exist.md",
			"docs/nested/also-fake.md",
			"README.md",
		];
		const result = selectFiles(config(["docs/**/*.md"]), nonExistent);
		expect(result).toEqual([
			"docs/does-not-exist.md",
			"docs/nested/also-fake.md",
		]);
		// Signature is pure data -> data; no Repository/Git parameter exists.
		expect(Array.isArray(result)).toBe(true);
	});
});

describe("selectFiles — determinism (de-dup + sort)", () => {
	test("de-duplicates the output", () => {
		const result = selectFiles(config(["docs/**/*.md", "docs/**/*.md"]), [
			"docs/a.md",
			"docs/a.md",
			"docs/b.md",
		]);
		expect(result).toEqual(["docs/a.md", "docs/b.md"]);
	});

	test("output is sorted (stable across runs / input orders)", () => {
		const unsorted = ["docs/zeta.md", "docs/alpha.md", "docs/mike.md"];
		const result = selectFiles(config(["docs/**/*.md"]), unsorted);
		expect(result).toEqual(["docs/alpha.md", "docs/mike.md", "docs/zeta.md"]);
	});

	test("a path matching two select globs appears once", () => {
		const result = selectFiles(config(["docs/guide/**", "docs/**/*.md"]), [
			"docs/guide/intro.md",
		]);
		expect(result).toEqual(["docs/guide/intro.md"]);
	});
});
