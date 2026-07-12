// Unit tests for the application-tier port factories (GH-23 Phase 7 boundary).
// Exercises REAL delegation — both constructors wire up fields only and make no
// network calls, so we assert the returned objects satisfy their port contracts.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRepository, createTarget } from "#app/ports";
import type { ConfluenceCredentials } from "#domain/credentials";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";

const REPO_METHODS = [
	"readCommitted",
	"headSha",
	"currentBranch",
	"listCommitSubjects",
] as const satisfies readonly (keyof Repository)[];

const TARGET_METHODS = [
	"renderBody",
	"getPage",
	"createPage",
	"updatePage",
	"movePage",
	"getProperty",
	"putProperty",
	"uploadAttachment",
	"attachmentExists",
	"listAttachments",
	"searchPages",
	"getRestrictions",
] as const satisfies readonly (keyof TargetSystem)[];

/** Minimal credentials — the adapter only stores fields, never authenticates. */
function makeCredentials(): ConfluenceCredentials {
	return {
		baseUrl: "https://example.atlassian.net",
		authHeader: "Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg==",
		email: "u***@example.com",
		mode: "api-token",
	};
}

describe("createRepository — delegates to createShellGit", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = mkdtempSync(join(tmpdir(), "ms-ports-"));
		Bun.spawnSync({
			cmd: ["git", "init"],
			cwd: repoDir,
			stdout: "pipe",
			stderr: "pipe",
		});
	});

	afterEach(() => {
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("returns a Repository exposing every port method", () => {
		const repo = createRepository(repoDir);
		for (const name of REPO_METHODS) {
			expect(typeof repo[name]).toBe("function");
		}
	});

	test("the returned repo is usable against the freshly-init'd git repo", () => {
		const repo = createRepository(repoDir);
		// `git init` has no commits yet → a non-zero git exit → throws
		expect(() => repo.headSha()).toThrow();
	});
});

describe("createTarget — delegates to ConfluenceTarget.fromCredentials", () => {
	test("returns a TargetSystem exposing every port method (no network at construction)", () => {
		// fromCredentials only wires up the transport + services; if it attempted
		// any I/O this construction would throw or hang.
		const target = createTarget(makeCredentials(), "ENG");
		expect(target).toBeDefined();
		for (const name of TARGET_METHODS) {
			expect(typeof target[name]).toBe("function");
		}
	});

	test("exposes the underlying transport via getClient()", () => {
		const target = createTarget(makeCredentials(), "ENG");
		// ConfluenceTarget.getClient() is the documented test seam for the transport.
		const client = (target as { getClient?: () => unknown }).getClient?.();
		expect(typeof client).toBe("object");
		expect(client).not.toBeNull();
	});
});
