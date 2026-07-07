// tests/unit/domain/config/hierarchy.test.ts
//
// Unit tests for intended hierarchy mirroring (GH-15 F-6 / AC-F6-1 /
// TC-HIER-001..005). Pure domain rule — no I/O, no app/cli/infra import.

import { describe, expect, test } from "bun:test";
import {
	buildIntendedHierarchy,
	intendedParent,
} from "#domain/config/hierarchy";
import type { ProjectConfig } from "#domain/config/types";

function config(
	root = "docs/",
	hierarchy: ProjectConfig["hierarchy"] = "mirror",
): ProjectConfig {
	return {
		version: 1,
		root,
		select: ["**/*.md"],
		exclude: [],
		hierarchy,
		targets: {
			default: { type: "confluence", spaceKey: "ENG", parentPageId: "123" },
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

describe("intendedParent — mirror mode (AC-F6-1)", () => {
	test("TC-HIER-001: docs/a/b.md under root docs/ → parent docs/a/", () => {
		expect(intendedParent(config(), "docs/a/b.md")).toBe("docs/a/");
	});

	test("TC-HIER-002: deeper nesting docs/a/b/c.md → parent docs/a/b/", () => {
		expect(intendedParent(config(), "docs/a/b/c.md")).toBe("docs/a/b/");
	});

	test("TC-HIER-003: file directly under root → root anchor (maps to parentPageId at sync time)", () => {
		// Documented delivery-time resolution: a file directly under root has
		// no directory of its own, so it intends the root itself, which the
		// sync-time resolver (E3-S4/E3-S6) maps to the configured
		// targets.<id>.parentPageId. There is no separate page for the root.
		expect(intendedParent(config(), "docs/index.md")).toBe("docs/");
	});

	test("files at varying depths each derive their own parent dir", () => {
		expect(intendedParent(config(), "docs/a.md")).toBe("docs/");
		expect(intendedParent(config(), "docs/a/b.md")).toBe("docs/a/");
		expect(intendedParent(config(), "docs/a/b/c.md")).toBe("docs/a/b/");
	});
});

describe("intendedParent — flat mode", () => {
	test("TC-HIER-004: every file intends the single configured root anchor", () => {
		const cfg = config("docs/", "flat");
		for (const f of [
			"docs/a.md",
			"docs/a/b.md",
			"docs/a/b/c.md",
			"docs/x/y/z/w.md",
		]) {
			expect(intendedParent(cfg, f)).toBe("docs/");
		}
	});
});

describe("intendedParent — path normalization (TC-HIER-005)", () => {
	test("backslash separators are normalized to forward slashes", () => {
		expect(intendedParent(config(), "docs\\a\\b.md")).toBe("docs/a/");
	});

	test("redundant ./ segments are stripped", () => {
		expect(intendedParent(config(), "./docs/a/b.md")).toBe("docs/a/");
	});

	test("double slashes are collapsed", () => {
		expect(intendedParent(config(), "docs//a///b.md")).toBe("docs/a/");
	});

	test("root config with no trailing slash is canonicalized", () => {
		expect(intendedParent(config("docs"), "docs/a/b.md")).toBe("docs/a/");
		expect(intendedParent(config("docs"), "docs/index.md")).toBe("docs/");
	});

	test("trailing slash on the input file path is tolerated", () => {
		// A file path should not end in /, but if it does we tolerate it.
		expect(intendedParent(config(), "docs/a/b.md/")).toBe("docs/a/");
	});
});

describe("buildIntendedHierarchy", () => {
	test("maps each selected file to its intended parent (mirror)", () => {
		const hierarchy = buildIntendedHierarchy(config(), [
			"docs/index.md",
			"docs/a/b.md",
			"docs/a/b/c.md",
		]);
		expect(hierarchy.mode).toBe("mirror");
		expect(hierarchy.nodes).toEqual([
			{ filePath: "docs/index.md", intendedParent: "docs/" },
			{ filePath: "docs/a/b.md", intendedParent: "docs/a/" },
			{ filePath: "docs/a/b/c.md", intendedParent: "docs/a/b/" },
		]);
	});

	test("records the hierarchy mode", () => {
		const flat = buildIntendedHierarchy(config("docs/", "flat"), [
			"docs/a.md",
			"docs/b/c.md",
		]);
		expect(flat.mode).toBe("flat");
		expect(flat.nodes.every((n) => n.intendedParent === "docs/")).toBe(true);
	});

	test("empty selection → empty nodes", () => {
		const hierarchy = buildIntendedHierarchy(config(), []);
		expect(hierarchy.nodes).toEqual([]);
	});

	test("preserves input order", () => {
		const files = ["docs/z.md", "docs/a.md", "docs/m.md"];
		const hierarchy = buildIntendedHierarchy(config(), files);
		expect(hierarchy.nodes.map((n) => n.filePath)).toEqual(files);
	});
});
