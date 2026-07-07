// tests/unit/app/config-template.test.ts
//
// Unit tests for the `marksync init` starter config (GH-15 F-5 / AC-F5-1 /
// TC-INIT-001..003). Tests the config-writing helper DIRECTLY (not through the
// CLI — testing-strategy anti-pattern). Asserts:
//   - AC-F5-1: the starter config round-trips through `loadConfig` (Result.ok).
//   - OQ-TP-1: `writeStarterConfig` refuses to overwrite an existing
//     `marksync.yml` (MS-0002 safety default).
//
// The committed `marksync.yml.example` round-trip (TC-INIT-002 / F-8) lives in
// its own dedicated file: `tests/unit/app/config-example-roundtrip.test.ts`
// (promoted there in Phase 9 once the example was committed).

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { STARTER_CONFIG, writeStarterConfig } from "#app/config-template";
import { loadConfig } from "#app/config";

describe("writeStarterConfig — TC-INIT-001: round-trip (AC-F5-1)", () => {
	test("writes a marksync.yml that loadConfig accepts", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-init-"));
		try {
			const result = writeStarterConfig(dir);
			expect(result.ok).toBe(true);
			expect(existsSync(join(dir, "marksync.yml"))).toBe(true);

			const loaded = loadConfig(dir);
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) return;
			// Authored values survive the round-trip.
			expect(loaded.value.version).toBe(1);
			expect(loaded.value.root).toBe("docs/");
			expect(loaded.value.hierarchy).toBe("mirror");
			expect(loaded.value.sync.granularity).toBe("squash");
			expect(loaded.value.targets.default?.type).toBe("confluence");
			// Defaults are applied over the starter too.
			expect(loaded.value.sync.stalePlanMinutes).toBe(15);
			expect(loaded.value.render.mermaid.deterministicIds).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("the STARTER_CONFIG constant is itself valid YAML the loader accepts", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-init-"));
		try {
			writeFileSync(join(dir, "marksync.yml"), STARTER_CONFIG);
			const loaded = loadConfig(dir);
			expect(loaded.ok).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("writeStarterConfig — TC-INIT-003: overwrite guard (OQ-TP-1)", () => {
	test("refuses to overwrite an existing marksync.yml", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-init-"));
		try {
			// Seed an existing config.
			writeFileSync(join(dir, "marksync.yml"), "version: 1\nroot: docs/\n");
			const before = readFileSync(join(dir, "marksync.yml"), "utf-8");

			const result = writeStarterConfig(dir);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("InvalidConfig");
			expect(result.error.humanMessage).toMatch(/already exists/i);
			expect(result.error.humanMessage).toMatch(/refuses to overwrite/i);

			// The existing file is left untouched.
			expect(readFileSync(join(dir, "marksync.yml"), "utf-8")).toBe(before);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("overwrites nothing and returns ok on a fresh directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-init-"));
		try {
			expect(existsSync(join(dir, "marksync.yml"))).toBe(false);
			expect(writeStarterConfig(dir).ok).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
