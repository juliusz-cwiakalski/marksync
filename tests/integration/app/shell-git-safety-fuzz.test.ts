// Integration test for shell-git safety fuzz (TC-INTEGRATION-009: malicious path/ref fuzz).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { createShellGit } from "#infra/git/shell-git";

describe("shell-git safety fuzz integration test", () => {
	let tmpRepo: string;

	beforeEach(() => {
		// Create temp repo
		tmpRepo = mkdtempSync(join(tmpdir(), "gh23-shell-git-"));

		// Initialize git repo
		Bun.spawnSync({
			cmd: ["git", "init"],
			cwd: tmpRepo,
			env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
			stdout: "pipe",
			stderr: "pipe",
		});

		Bun.spawnSync({
			cmd: ["git", "config", "user.name", "Test User"],
			cwd: tmpRepo,
			env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
			stdout: "pipe",
			stderr: "pipe",
		});

		Bun.spawnSync({
			cmd: ["git", "config", "user.email", "test@test.com"],
			cwd: tmpRepo,
			env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
			stdout: "pipe",
			stderr: "pipe",
		});

		// Create a test file and commit
		const testFile = join(tmpRepo, "test.md");
		Bun.write(testFile, "# Test");
		Bun.spawnSync({
			cmd: ["git", "add", "test.md"],
			cwd: tmpRepo,
			env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
			stdout: "pipe",
			stderr: "pipe",
		});
		Bun.spawnSync({
			cmd: ["git", "commit", "-m", "init"],
			cwd: tmpRepo,
			env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
			stdout: "pipe",
			stderr: "pipe",
		});
	});

	afterEach(() => {
		// Cleanup temp repo
		rmSync(tmpRepo, { recursive: true, force: true });
	});

	// TC-INTEGRATION-009: Malicious path fuzz → rejected with throw, 0 shell-execution surfaces
	test("TC-INTEGRATION-009: Malicious path fuzz → throws, 0 shell-execution surfaces", () => {
		const shellGit = createShellGit(tmpRepo);

		// Malicious path fixtures
		const maliciousPaths = [
			"../escape",
			"..",
			"/abs/path",
			"C:\\win",
			"a;rm -rf /",
			"$(id)",
			"`whoami`",
			"a\nb",
			"a\0b",
			"a|cat",
			"a&evil",
			"a>file",
			"a<file",
			"a`evil`",
			"a$(evil)",
		];

		for (const maliciousPath of maliciousPaths) {
			// Assert that readCommitted with malicious path THROWS (invariant violation)
			expect(() => {
				shellGit.readCommitted("HEAD", [maliciousPath]);
			}).toThrow();
		}

		// Valid paths should work (no throw)
		expect(() => {
			shellGit.readCommitted("HEAD", ["test.md"]);
		}).not.toThrow();
	});

	// TC-INTEGRATION-009 (ref variant): Malicious ref fuzz → rejected with throw
	test("TC-INTEGRATION-009: Malicious ref fuzz → throws, 0 shell-execution surfaces", () => {
		const shellGit = createShellGit(tmpRepo);

		// Malicious ref fixtures
		const maliciousRefs = [
			"HEAD; rm -rf /",
			"HEAD$(id)",
			"HEAD`whoami`",
			"HEAD\n",
			"HEAD\0",
			"HEAD|cat",
			"main; evil",
			"..",
			"refs/heads/`evil`",
			"refs/heads/$(evil)",
		];

		for (const maliciousRef of maliciousRefs) {
			// Test listCommitSubjects with malicious ref
			expect(() => {
				shellGit.listCommitSubjects(maliciousRef);
			}).toThrow();
		}

		// Valid refs should work (no throw)
		expect(() => {
			shellGit.headSha();
			shellGit.currentBranch();
			shellGit.listCommitSubjects("HEAD");
		}).not.toThrow();
	});
});
