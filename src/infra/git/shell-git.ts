// Shell-git adapter implementing Repository port (TDR-0003).

import type { MarkSyncError } from "#domain/errors";
import { validateRef, validateRepoRelative } from "#domain/git/paths";
import type { Repository } from "#domain/git/port";
import { Result } from "#domain/result";
import { globToRegExp } from "#shared/glob";

/**
 * Create a Repository implementation backed by the shell git CLI.
 * @param repoPath - The absolute path to the git repository root
 */
export function createShellGit(repoPath: string): Repository {
	return {
		readCommitted(ref: string, patterns: readonly string[]) {
			validateRef(ref);

			for (const pattern of patterns) {
				validateRepoRelative(pattern);
			}

			// Empty select → empty result (DEC-4, GH-64).
			if (patterns.length === 0) {
				return Result.ok(new Map());
			}

			// Patterns are globs, not git pathspecs — git pathspec does not
			// support `**`, so list every committed file and filter in-memory
			// with the shared matcher (GH-64).
			const listResult = spawnGit(repoPath, [
				"ls-tree",
				"-r",
				"--name-only",
				ref,
			]);

			if (!listResult.ok) {
				return listResult;
			}

			// Union semantics: a file is included if ANY pattern matches.
			const matchers = patterns.map(globToRegExp);
			const fileNames = listResult.value
				.trim()
				.split("\n")
				.filter((s) => s.length > 0)
				.filter((name) => matchers.some((re) => re.test(name)));

			if (fileNames.length === 0) {
				return Result.ok(new Map());
			}

			// Read each file - use git show with the ref:path format
			const files = new Map<string, Uint8Array>();
			for (const fileName of fileNames) {
				validateRepoRelative(fileName);

				// git show expects the path relative to the repo root
				const showArgs = ["show", `${ref}:${fileName}`];
				const showResult = spawnGit(repoPath, showArgs);

				if (!showResult.ok) {
					return showResult;
				}

				// The output from git show is the raw file content
				// We need to convert it to Uint8Array
				const content = showResult.value;
				files.set(fileName, new TextEncoder().encode(content));
			}

			return Result.ok(files);
		},

		headSha() {
			const args = ["rev-parse", "HEAD"];
			const result = spawnGit(repoPath, args);

			if (!result.ok) {
				return result;
			}

			return Result.ok(result.value.trim());
		},

		currentBranch() {
			// Try rev-parse --abbrev-ref HEAD first
			const args = ["rev-parse", "--abbrev-ref", "HEAD"];
			const result = spawnGit(repoPath, args);

			if (!result.ok) {
				return result;
			}

			const branch = result.value.trim();

			// If detached, rev-parse returns "HEAD"
			if (branch === "HEAD") {
				// Fall back to GITHUB_REF_NAME environment variable
				const envRef = process.env.GITHUB_REF_NAME;
				if (envRef) {
					return Result.ok(envRef);
				}
				return Result.ok("HEAD");
			}

			return Result.ok(branch);
		},

		listCommitSubjects(range?: string) {
			if (range !== undefined) {
				validateRef(range);
			}
			const args = range
				? ["log", "--format=%s", range]
				: ["log", "--format=%s"];
			const result = spawnGit(repoPath, args);

			if (!result.ok) {
				return result;
			}

			const subjects = result.value
				.trim()
				.split("\n")
				.filter((s) => s.length > 0);

			return Result.ok(subjects);
		},
	};
}

/**
 * Spawn a git command with injection controls.
 * Returns Result<string> with stdout content.
 * Throws on non-zero exit (host invariant) or spawn failure.
 */
function spawnGit(cwd: string, args: string[]): Result<string, MarkSyncError> {
	try {
		const result = Bun.spawnSync({
			cmd: ["git", ...args],
			cwd,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_ASKPASS: "echo",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		if (!result.success) {
			throw new Error(
				`git ${args[0]} spawn failed: ${result.stderr?.toString() || "unknown error"}`,
			);
		}

		if (result.exitCode !== 0) {
			const stderr = result.stderr?.toString() || "";
			throw new Error(
				`git ${args[0]} exited with ${result.exitCode}: ${stderr}`,
			);
		}

		const stdout = result.stdout?.toString() || "";
		return Result.ok(stdout);
	} catch (e) {
		// Re-throw if already an Error (host invariant)
		if (e instanceof Error) {
			throw e;
		}
		// Wrap unknown errors
		throw new Error(`git ${args[0]} failed: ${String(e)}`);
	}
}
