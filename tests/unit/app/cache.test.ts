// Cache layout tests (GH-19 F-4; TC-CACHE-001/004; ADR-0006 C-3).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveCacheDir } from "#app/cache";

// tests/unit/app/ → repo root is 3 levels up (../.. → tests/, ../../.. → repo root).
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

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

	test("a non-empty MARKSYNC_CACHE_DIR always wins (nested path override)", () => {
		process.env.MARKSYNC_CACHE_DIR = "/custom/cache";
		expect(resolveCacheDir("/repo")).toBe("/custom/cache");
	});

	test("an empty MARKSYNC_CACHE_DIR falls back to the default", () => {
		process.env.MARKSYNC_CACHE_DIR = "";
		expect(resolveCacheDir("/repo")).toBe("/repo/.marksync");
	});

	test("a whitespace-only MARKSYNC_CACHE_DIR falls back to the default", () => {
		process.env.MARKSYNC_CACHE_DIR = "   ";
		expect(resolveCacheDir("/repo")).toBe("/repo/.marksync");
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
