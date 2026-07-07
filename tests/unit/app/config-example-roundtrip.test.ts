// tests/unit/app/config-example-roundtrip.test.ts
//
// Authoritative round-trip test for the committed `marksync.yml.example`
// (GH-15 Phase 9.6 / F-8 / TS-13 / TC-INIT-002 / AC-F8-1).
//
// The on-ramp example committed at the repo root must be a VALID v1 config:
// copying it to a temp `marksync.yml` and loading via the REAL `loadConfig`
// (yaml parse + ajv validate + applyDefaults — no mock, per the
// over-mocking guardrail) must yield `Result.ok(ProjectConfig)`. This guards
// the on-ramp artifact against schema/template drift across future changes.
//
// ## Origin note
//
// Phase 8 (config-template) shipped this coverage as a forward-GUARDED test
// inside `config-template.test.ts` (skipped until the example landed). Phase 9
// commits the example, so TC-INIT-002 is promoted here to a dedicated,
// non-skipped file with richer assertions on the example's authored values.
// (The Phase 8 guard also mis-computed REPO_ROOT one level too high, which was
// masked by the skip — fixed here by using the correct repo-root depth.)
//
// Tier: app (imports `#app/config` + the committed example file only).

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadConfig } from "#app/config";

// `import.meta.dir` = <repo>/tests/unit/app → three `..` lands at the repo root.
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const EXAMPLE_PATH = join(REPO_ROOT, "marksync.yml.example");

describe("TC-INIT-002: committed marksync.yml.example round-trips (F-8 / AC-F8-1)", () => {
	test("the example loads as Result.ok(ProjectConfig)", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-example-"));
		try {
			// Real file read: copy the committed example verbatim as `marksync.yml`.
			copyFileSync(EXAMPLE_PATH, join(dir, "marksync.yml"));

			const result = loadConfig(dir);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const cfg = result.value;

			// Authored required fields survive the round-trip.
			expect(cfg.version).toBe(1);
			expect(cfg.root).toBe("docs/");
			expect(cfg.targets.default).toEqual({
				type: "confluence",
				spaceKey: "ENG",
				parentPageId: "1234567890",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("the example's authored optional values survive (defaults not masking them)", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-example-"));
		try {
			copyFileSync(EXAMPLE_PATH, join(dir, "marksync.yml"));
			const result = loadConfig(dir);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const cfg = result.value;

			// The example demonstrates a broad set of v1 fields; confirm each
			// authored value is preserved (not silently defaulted over).
			expect(cfg.select).toEqual(["docs/**/*.md"]);
			expect(cfg.exclude).toEqual(["docs/draft/**", "docs/internal/**/*.md"]);
			expect(cfg.hierarchy).toBe("mirror");
			expect(cfg.sync.allowBranches).toEqual(["main"]);
			expect(cfg.sync.granularity).toBe("squash");
			expect(cfg.sync.stalePlanMinutes).toBe(15);
			expect(cfg.render.mermaid.policy).toBe("render");
			expect(cfg.render.mermaid.securityLevel).toBe("strict");
			expect(cfg.render.mermaid.htmlLabels).toBe(false);
			expect(cfg.render.mermaid.deterministicIds).toBe(true);
			expect(cfg.output.format).toBe("storage");
			expect(cfg.output.color).toBe("auto");
			expect(cfg.provenance.visiblePanel).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
