import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateRepoRelative, validateRef } from "#domain/git/paths";

describe("shell-git path validation (via test stubs)", () => {
	test("rejects paths with ..", () => {
		expect(() => validateRepoRelative("../escape")).toThrow(
			/parent directory reference/,
		);
		expect(() => validateRepoRelative("docs/../../etc")).toThrow(
			/parent directory reference/,
		);
	});

	test("rejects absolute paths", () => {
		expect(() => validateRepoRelative("/etc/passwd")).toThrow(/is absolute/);
		expect(() => validateRepoRelative("\\windows\\system32")).toThrow(
			/is absolute/,
		);
	});

	test("rejects paths with shell metacharacters", () => {
		expect(() => validateRepoRelative("file;rm -rf /")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file`whoami`")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file$(id)")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file<name")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file|cat")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file&>file")).toThrow(
			/shell metacharacter/,
		);
		expect(() => validateRepoRelative("file with space")).toThrow(
			/shell metacharacter/,
		);
	});

	test("rejects paths with control bytes", () => {
		expect(() => validateRepoRelative("file\0null")).toThrow(/control byte/);
		expect(() => validateRepoRelative("file\nname")).toThrow(/control byte/);
		expect(() => validateRepoRelative("file\rname")).toThrow(/control byte/);
	});

	test("accepts valid repo-relative paths", () => {
		expect(() => validateRepoRelative("docs/intro.md")).not.toThrow();
		expect(() => validateRepoRelative("a/b/c.md")).not.toThrow();
		expect(() => validateRepoRelative("file-with-dash.md")).not.toThrow();
		expect(() => validateRepoRelative("file_with_underscore.md")).not.toThrow();
	});
});

describe("validateRef (via test stub)", () => {
	test("rejects refs with shell metacharacters", () => {
		expect(() => validateRef("HEAD;rm")).toThrow(/shell metacharacter/);
		expect(() => validateRef("main$(x)")).toThrow(/shell metacharacter/);
		expect(() => validateRef("HEAD`whoami`")).toThrow(/shell metacharacter/);
		expect(() => validateRef("HEAD|x")).toThrow(/shell metacharacter/);
		expect(() => validateRef("HEAD<x")).toThrow(/shell metacharacter/);
	});

	test("rejects refs with spaces", () => {
		expect(() => validateRef("main branch")).toThrow(/whitespace/);
	});

	test("rejects refs with ..", () => {
		expect(() => validateRef("main..bad")).toThrow(
			/parent directory reference/,
		);
	});

	test("rejects refs with control bytes", () => {
		expect(() => validateRef("ref\0null")).toThrow(/control byte/);
		expect(() => validateRef("ref\nname")).toThrow(/control byte/);
		expect(() => validateRef("ref\rname")).toThrow(/control byte/);
	});

	test("accepts valid refs", () => {
		expect(() => validateRef("HEAD")).not.toThrow();
		expect(() => validateRef("refs/heads/main")).not.toThrow();
		expect(() => validateRef("abc123")).not.toThrow();
		expect(() => validateRef("v1.0.0")).not.toThrow();
	});
});

describe("shell-git happy path", () => {
	let tmp: string;

	beforeEach(() => {
		// Use /tmp directly to avoid any .gitignore conflicts
		tmp = mkdtempSync("/tmp/marksync-test-");
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	const git = (args: string[]) => {
		const result = Bun.spawnSync({
			cmd: ["git", ...args],
			cwd: tmp,
			env: {
				...process.env,
				HUSKY: "0", // Disable husky hooks for test repos
			},
		});
		if (!result.success || result.exitCode !== 0) {
			throw new Error(`git ${args[0]} failed: ${result.stderr?.toString()}`);
		}
		return result.stdout?.toString() || "";
	};

	test("reads committed files from a temp repo", async () => {
		const { createShellGit } = await import("#infra/git/shell-git");

		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);

		const testPath = join(tmp, "test.md");
		writeFileSync(testPath, "# Test\n\nContent\n");
		git(["add", "test.md"]);
		git(["commit", "-m", "test: initial commit"]);

		const repo = createShellGit(tmp);

		const headResult = repo.headSha();
		expect(headResult.ok).toBe(true);
		if (!headResult.ok) return;

		const headSha = headResult.value;
		expect(headSha).toMatch(/^[a-f0-9]{40}$/);

		const branchResult = repo.currentBranch();
		expect(branchResult.ok).toBe(true);
		if (!branchResult.ok) return;

		const branch = branchResult.value;
		// After committing on a fresh repo, we should have a branch
		expect(branch === "HEAD" || branch === "main" || branch === "master").toBe(
			true,
		);

		const readResult = repo.readCommitted("HEAD", ["**/*.md"]);
		expect(readResult.ok).toBe(true);
		if (!readResult.ok) return;

		const files = readResult.value;
		// The file path will be relative to repo root, may include directory prefix
		expect(files.size).toBeGreaterThanOrEqual(1);
		// Find the test.md file (it might be at a nested path)
		const testFile = Array.from(files.keys()).find((k) =>
			k.endsWith("test.md"),
		);
		expect(testFile).toBeDefined();
		if (!testFile) return;

		expect(files.get(testFile)).toBeInstanceOf(Uint8Array);

		const content = new TextDecoder().decode(files.get(testFile)!);
		expect(content).toBe("# Test\n\nContent\n");

		const subjectsResult = repo.listCommitSubjects();
		expect(subjectsResult.ok).toBe(true);
		if (!subjectsResult.ok) return;

		const subjects = subjectsResult.value;
		expect(subjects).toEqual(["test: initial commit"]);
	});

	test("returns empty map when no files match patterns", async () => {
		const { createShellGit } = await import("#infra/git/shell-git");

		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);

		writeFileSync(join(tmp, "test.md"), "# Test\n");
		git(["add", "test.md"]);
		git(["commit", "-m", "init"]);

		const repo = createShellGit(tmp);
		const result = repo.readCommitted("HEAD", ["nonexistent/**"]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.size).toBe(0);
	});

	test("detached HEAD returns GITHUB_REF_NAME when set", async () => {
		const { createShellGit } = await import("#infra/git/shell-git");

		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);

		writeFileSync(join(tmp, "test.md"), "# Test\n");
		git(["add", "test.md"]);
		git(["commit", "-m", "init"]);

		git(["checkout", "--detach"]);

		const originalEnv = process.env.GITHUB_REF_NAME;
		process.env.GITHUB_REF_NAME = "refs/heads/feature-branch";

		try {
			const repo = createShellGit(tmp);
			const result = repo.currentBranch();

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value).toBe("refs/heads/feature-branch");
		} finally {
			process.env.GITHUB_REF_NAME = originalEnv;
		}
	});

	test("detached HEAD returns 'HEAD' when GITHUB_REF_NAME not set", async () => {
		const { createShellGit } = await import("#infra/git/shell-git");

		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);

		writeFileSync(join(tmp, "test.md"), "# Test\n");
		git(["add", "test.md"]);
		git(["commit", "-m", "init"]);

		git(["checkout", "--detach"]);

		const originalEnv = process.env.GITHUB_REF_NAME;
		delete process.env.GITHUB_REF_NAME;

		try {
			const repo = createShellGit(tmp);
			const result = repo.currentBranch();

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value).toBe("HEAD");
		} finally {
			process.env.GITHUB_REF_NAME = originalEnv;
		}
	});
});

describe("shell-git glob pattern matching (GH-64)", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "marksync-glob-"));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	const git = (args: string[]) => {
		const result = Bun.spawnSync({
			cmd: ["git", ...args],
			cwd: tmp,
			env: { ...process.env, HUSKY: "0" },
		});
		if (!result.success || result.exitCode !== 0) {
			throw new Error(`git ${args[0]} failed: ${result.stderr?.toString()}`);
		}
		return result.stdout?.toString() || "";
	};

	// Build a committed repo from a map of relative-path → content.
	const buildRepo = async (files: Record<string, string>) => {
		const { createShellGit } = await import("#infra/git/shell-git");
		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);
		for (const [rel, content] of Object.entries(files)) {
			const abs = join(tmp, rel);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, content);
		}
		git(["add", "."]);
		git(["commit", "-m", "init"]);
		return createShellGit(tmp);
	};

	const keys = (map: Map<string, Uint8Array>) =>
		Array.from(map.keys()).sort();

	// TC-GLOB-001: Recursive `**` matches nested markdown files (AC-F1-1)
	test("TC-GLOB-001: recursive ** matches nested markdown files", async () => {
		const repo = await buildRepo({
			"docs/a.md": "# A\n",
			"docs/b/c.md": "# C\n",
			"docs/b/d/e.md": "# E\n",
			"docs/image.png": "PNG",
			"README.md": "# README\n",
			"src/d.md": "# D\n",
		});

		const result = repo.readCommitted("HEAD", ["docs/**/*.md"]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(keys(result.value)).toEqual([
			"docs/a.md",
			"docs/b/c.md",
			"docs/b/d/e.md",
		]);
	});

	// TC-GLOB-002: Extension filter excludes non-markdown files (AC-F1-2)
	test("TC-GLOB-002: extension filter excludes non-markdown files", async () => {
		const repo = await buildRepo({
			"docs/a.md": "# A\n",
			"docs/b/c.md": "# C\n",
			"docs/image.png": "PNG",
			"docs/data.json": "{}",
		});

		const result = repo.readCommitted("HEAD", ["docs/**/*.md"]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(keys(result.value)).toEqual(["docs/a.md", "docs/b/c.md"]);
	});

	// TC-GLOB-003: `**/test.md` matches root and nested files (AC-F1-3)
	test("TC-GLOB-003: **/test.md matches root and nested files", async () => {
		const repo = await buildRepo({
			"test.md": "# root\n",
			"docs/test.md": "# docs\n",
			"docs/b/test.md": "# nested\n",
			"other.md": "# other\n",
		});

		const result = repo.readCommitted("HEAD", ["**/test.md"]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(keys(result.value)).toEqual([
			"docs/b/test.md",
			"docs/test.md",
			"test.md",
		]);
	});

	// TC-GLOB-009: Empty patterns list returns empty map (DEC-4)
	test("TC-GLOB-009: empty patterns list returns empty map", async () => {
		const repo = await buildRepo({
			"docs/a.md": "# A\n",
			"README.md": "# README\n",
		});

		const result = repo.readCommitted("HEAD", []);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.size).toBe(0);
	});
});
