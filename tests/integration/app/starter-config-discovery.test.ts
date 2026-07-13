// Integration test: starter config discovery with recursive glob (GH-64, TC-GLOB-012).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createShellGit } from "#infra/git/shell-git";

describe("starter config discovery (GH-64, TC-GLOB-012)", () => {
	let tmpRepo: string;

	beforeEach(() => {
		tmpRepo = mkdtempSync(join(tmpdir(), "marksync-starter-"));
	});

	afterEach(() => {
		rmSync(tmpRepo, { recursive: true, force: true });
	});

	const git = (args: string[]) => {
		const result = Bun.spawnSync({
			cmd: ["git", ...args],
			cwd: tmpRepo,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_ASKPASS: "echo",
				HUSKY: "0",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		if (!result.success || result.exitCode !== 0) {
			throw new Error(`git ${args[0]} failed: ${result.stderr?.toString()}`);
		}
		return result.stdout?.toString() || "";
	};

	// TC-GLOB-012: starter config `docs/**/*.md` discovers nested markdown at
	// typical MS-0002 corpus scale (~500 files) — AC-G2-1, NFR-PERF-5.
	test("TC-GLOB-012: starter config docs/**/*.md discovers nested markdown", () => {
		git(["init"]);
		git(["config", "user.name", "Test User"]);
		git(["config", "user.email", "test@example.com"]);

		// Nested ~500-file docs corpus (10 sections × 5 subs × 10 pages).
		for (let s = 0; s < 10; s++) {
			for (let sub = 0; sub < 5; sub++) {
				const dir = join(tmpRepo, "docs", `section-${s}`, `sub-${sub}`);
				mkdirSync(dir, { recursive: true });
				for (let n = 0; n < 10; n++) {
					writeFileSync(join(dir, `page-${n}.md`), `# Page ${s}.${sub}.${n}\n`);
				}
			}
		}
		// Distractors: non-markdown under docs, markdown outside docs.
		writeFileSync(join(tmpRepo, "docs", "image.png"), "PNG");
		writeFileSync(join(tmpRepo, "README.md"), "# README\n");

		git(["add", "."]);
		git(["commit", "-m", "init"]);

		const repo = createShellGit(tmpRepo);

		const start = performance.now();
		const result = repo.readCommitted("HEAD", ["docs/**/*.md"]);
		const elapsed = performance.now() - start;

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const paths = Array.from(result.value.keys());
		expect(paths.length).toBe(500);
		for (const p of paths) {
			expect(p.startsWith("docs/")).toBe(true);
			expect(p.endsWith(".md")).toBe(true);
		}
		// Distractors excluded.
		expect(result.value.has("docs/image.png")).toBe(false);
		expect(result.value.has("README.md")).toBe(false);
		// Performance sanity (informational — NFR-PERF-5 is not a hard gate).
		expect(elapsed).toBeLessThan(2000);
	});
});
