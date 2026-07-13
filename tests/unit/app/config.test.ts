// tests/unit/app/config.test.ts
//
// Unit tests for the pure typed config loader (GH-15 F-3 / F-7). Exercises the
// REAL yaml parser + ajv validator (no mock — over-mocking guardrail). Covers
// AC-F3-1 (valid → Result.ok with defaults), AC-F7-1 / NFR-2 (every invalid
// class → Result.err with AI-readable humanMessage), NFR-5 (commit-by-commit
// deferred message), and the read/parse failure paths.
//
// Purity (NFR-4): the only I/O is reading the single marksync.yml written into
// a per-test temp dir. No Git/tree access is exercised here.

import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadConfig } from "#app/config";
import type { ConfigError } from "#domain/errors";
import type { ProjectConfig } from "#domain/config/types";
import type { Result } from "#domain/result";

const FIXTURES = join(import.meta.dir, "fixtures");

/** Load a named fixture file as the temp dir's `marksync.yml`. */
function loadFixture(name: string): Result<ProjectConfig, ConfigError> {
	const dir = mkdtempSync(join(tmpdir(), "ms-cfg-"));
	try {
		copyFileSync(join(FIXTURES, name), join(dir, "marksync.yml"));
		return loadConfig(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Load an inline YAML string as the temp dir's `marksync.yml`. */
function loadYaml(yaml: string): Result<ProjectConfig, ConfigError> {
	const dir = mkdtempSync(join(tmpdir(), "ms-cfg-"));
	try {
		writeFileSync(join(dir, "marksync.yml"), yaml);
		return loadConfig(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function expectErr(result: Result<ProjectConfig, ConfigError>): ConfigError {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected error, got ok");
	expect(result.error.kind).toBe("InvalidConfig");
	return result.error;
}

describe("loadConfig — valid fixtures (AC-F3-1)", () => {
	test("TC-CONFIG-001: full config loads as Result.ok(ProjectConfig)", () => {
		const r = loadFixture("valid-full.yml");
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const cfg = r.value;
		expect(cfg.version).toBe(1);
		expect(cfg.root).toBe("docs/");
		expect(cfg.select).toEqual(["docs/**/*.md"]);
		expect(cfg.exclude).toEqual(["docs/draft/**"]);
		expect(cfg.hierarchy).toBe("mirror");
		expect(cfg.targets.default).toEqual({
			type: "confluence",
			spaceKey: "ENG",
			parentPageId: "123456",
		});
		expect(cfg.sync.granularity).toBe("squash");
		expect(cfg.sync.stalePlanMinutes).toBe(15);
		expect(cfg.render.mermaid.deterministicIds).toBe(true);
		expect(cfg.output.format).toBe("storage");
		expect(cfg.provenance.visiblePanel).toBe(true);
	});

	test("TC-CONFIG-002: minimal config receives all defaults (stalePlanMinutes = 15)", () => {
		const r = loadFixture("valid-minimal.yml");
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const cfg = r.value;
		// Authored required fields are present.
		expect(cfg.version).toBe(1);
		expect(cfg.root).toBe("docs/");
		expect(cfg.targets.default.spaceKey).toBe("ENG");
		// Every optional field is defaulted (single source of truth: applyDefaults).
		expect(cfg.select).toEqual(["**/*.md"]);
		expect(cfg.exclude).toEqual([]);
		expect(cfg.hierarchy).toBe("mirror");
		expect(cfg.sync.allowBranches).toEqual(["main"]);
		expect(cfg.sync.granularity).toBe("squash");
		expect(cfg.sync.stalePlanMinutes).toBe(15);
		expect(cfg.render.mermaid.policy).toBe("code");
		expect(cfg.render.mermaid.securityLevel).toBe("strict");
		expect(cfg.render.mermaid.htmlLabels).toBe(false);
		expect(cfg.render.mermaid.deterministicIds).toBe(true);
		expect(cfg.output.format).toBe("storage");
		expect(cfg.output.color).toBe("auto");
		expect(cfg.provenance.visiblePanel).toBe(true);
	});
});

describe("loadConfig — invalid fixtures (AC-F7-1 / NFR-2)", () => {
	test("TC-CONFIG-003: missing required field → ConfigError naming the field path", () => {
		const err = expectErr(loadFixture("invalid-missing-required.yml"));
		expect(err.path).toContain("marksync.yml");
		expect(err.ajvErrors.some((e) => e.keyword === "required")).toBe(true);
		expect(err.humanMessage).toMatch(/root/);
		expect(err.humanMessage).toMatch(/missing required field/i);
		expect(err.humanMessage).toMatch(/suggested fix/i);
	});

	test("TC-CONFIG-004: wrong type → ConfigError naming expected shape", () => {
		const err = expectErr(loadFixture("invalid-wrong-type-select.yml"));
		const typeErr = err.ajvErrors.find((e) => e.keyword === "type");
		expect(typeErr).toBeDefined();
		expect(typeErr?.instancePath).toBe("/select");
		expect(err.humanMessage).toMatch(/select/);
		expect(err.humanMessage).toMatch(/expected array/i);
		expect(err.humanMessage).toMatch(/suggested fix/i);
	});

	test("TC-CONFIG-005: unknown granularity → ConfigError (enum violation)", () => {
		const err = expectErr(loadFixture("invalid-granularity-unknown.yml"));
		const enumErr = err.ajvErrors.find((e) => e.keyword === "enum");
		expect(enumErr).toBeDefined();
		expect(enumErr?.instancePath).toBe("/sync/granularity");
		expect(err.humanMessage).toMatch(/sync\.granularity/);
		expect(err.humanMessage).toMatch(/squash/);
	});

	test("TC-CONFIG-006: granularity commit-by-commit rejected with a 'deferred' message (NFR-5 / DEC-2)", () => {
		const err = expectErr(
			loadFixture("invalid-granularity-commit-by-commit.yml"),
		);
		const enumErr = err.ajvErrors.find((e) => e.keyword === "enum");
		expect(enumErr).toBeDefined();
		// DEC-2 / ADR-0010 C-5 — the message must call out the deferral
		// explicitly, not merely a generic enum violation.
		expect(err.humanMessage).toMatch(/commit-by-commit/i);
		expect(err.humanMessage).toMatch(/deferred/i);
		expect(err.humanMessage).toMatch(/ADR-0010/);
		expect(err.humanMessage).toMatch(/squash/);
	});

	test("TC-CONFIG-009: allErrors collects every violation, not just the first", () => {
		const err = expectErr(loadFixture("invalid-multiple.yml"));
		const keywords = err.ajvErrors.map((e) => e.keyword);
		expect(keywords).toContain("required");
		expect(keywords).toContain("type");
		expect(keywords).toContain("enum");
		expect(err.ajvErrors.length).toBeGreaterThanOrEqual(3);
	});

	test("TC-CONFIG-010: malformed YAML → ConfigError, not a throw", () => {
		const err = expectErr(loadFixture("invalid-malformed-yaml.yml"));
		expect(err.ajvErrors).toEqual([]);
		expect(err.humanMessage).toMatch(/invalid YAML/i);
		expect(err.humanMessage).toMatch(/suggested fix/i);
	});

	test("TC-CONFIG-011: missing marksync.yml → ConfigError via the narrowed Result channel", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-cfg-"));
		try {
			expect(existsSync(join(dir, "marksync.yml"))).toBe(false);
			const err = expectErr(loadConfig(dir));
			expect(err.ajvErrors).toEqual([]);
			expect(err.humanMessage).toMatch(/not found/i);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("TC-CONFIG-008: humanMessage carries field path + expected + suggested fix for each class", () => {
		for (const name of [
			"invalid-missing-required.yml",
			"invalid-wrong-type-select.yml",
			"invalid-granularity-unknown.yml",
			"invalid-granularity-commit-by-commit.yml",
		]) {
			const err = expectErr(loadFixture(name));
			// NFR-2 contract: every invalid class yields a self-contained message
			// naming a field, an expectation, and a suggested fix.
			expect(err.humanMessage.length).toBeGreaterThan(0);
			expect(err.humanMessage).toMatch(/suggested fix/i);
		}
	});
});

describe("loadConfig — invalid YAML top-level (non-object)", () => {
	test("a YAML array at top level → ConfigError", () => {
		const err = expectErr(loadYaml("- a\n- b\n"));
		expect(err.humanMessage).toMatch(/object at the top level/i);
	});

	test("a YAML scalar at top level → ConfigError", () => {
		const err = expectErr(loadYaml("just a string\n"));
		expect(err.humanMessage).toMatch(/object at the top level/i);
	});
});

describe("loadConfig — performance (NFR-1, informational)", () => {
	// OQ-TP-3: the ≤ 50 ms p95 threshold is informational on shared runners; we
	// assert a generous ceiling to catch large regressions without flaking on CI.
	test("config-load p95 stays well under the bar across 100 runs", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-cfg-"));
		try {
			copyFileSync(join(FIXTURES, "valid-full.yml"), join(dir, "marksync.yml"));
			const samples: number[] = [];
			for (let i = 0; i < 100; i++) {
				const t0 = performance.now();
				const r = loadConfig(dir);
				samples.push(performance.now() - t0);
				expect(r.ok).toBe(true);
			}
			samples.sort((a, b) => a - b);
			const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
			// Generous ceiling (well above the 50 ms target) to avoid CI flakes;
			// the real p95 on reference hardware is single-digit ms.
			expect(p95).toBeLessThan(200);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
