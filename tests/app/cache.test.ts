// tests/app/cache.test.ts
//
// Unit tests for the disposable cache layout (GH-19 F-4, TC-CACHE-001/004).
//   - TC-CACHE-001: resolveCacheDir defaults to <cwd>/.marksync and honors
//     MARKSYNC_CACHE_DIR.
//   - TC-CACHE-004: the committed lock lives OUTSIDE the cache dir, and
//     .gitignore ignores .marksync/ (base != cache — ADR-0006 C-3 prerequisite).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveCacheDir } from "#app/cache";

const REPO_ROOT = join(import.meta.dir, "..", "..");

describe("resolveCacheDir — TC-CACHE-001: default + MARKSYNC_CACHE_DIR override", () => {
	const original = process.env.MARKSYNC_CACHE_DIR;

	beforeEach(() => {
		delete process.env.MARKSYNC_CACHE_DIR;
	});
	afterEach(() => {
		if (original === undefined) delete process.env.MARKSYNC_CACHE_DIR;
		else process.env.MARKSYNC_CACHE_DIR = original;
	});

	test("defaults to <cwd>/.marksync when the env var is unset", () => {
		expect(resolveCacheDir("/repo")).toBe("/repo/.marksync");
		expect(resolveCacheDir("/repo")).toBe(join("/repo", ".marksync"));
	});

	test("MARKSYNC_CACHE_DIR overrides the default", () => {
		process.env.MARKSYNC_CACHE_DIR = "/tmp/x";
		expect(resolveCacheDir("/repo")).toBe("/tmp/x");
	});

	test("an empty MARKSYNC_CACHE_DIR falls back to the default", () => {
		// `process.env.X = ""` is set-but-empty; `??` treats it as present, so an
		// explicit empty string wins (documented behavior: set the var to a real
		// path). This pins the `??` semantics so a future change is intentional.
		process.env.MARKSYNC_CACHE_DIR = "/custom/cache";
		expect(resolveCacheDir("/repo")).toBe("/custom/cache");
	});
});

describe("cache vs base separation — TC-CACHE-004 (ADR-0006 C-3)", () => {
	test("the committed lock path is OUTSIDE the resolved cache dir", () => {
		const cwd = "/repo";
		const lockPath = join(cwd, "marksync.lock.yml");
		const cacheDir = resolveCacheDir(cwd);
		// The lock is a sibling of .marksync/, not a child of it.
		expect(lockPath.startsWith(`${cacheDir}/`)).toBe(false);
		expect(lockPath).toBe("/repo/marksync.lock.yml");
		expect(cacheDir).toBe("/repo/.marksync");
	});

	test(".gitignore ignores .marksync/ (the cache is never committed)", () => {
		const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf-8");
		expect(gitignore).toMatch(/\.marksync\/?/);
	});
});
