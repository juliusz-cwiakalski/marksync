// Fake Repository for integration tests.

import type { Repository } from "#domain/git/port";
import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";

/**
 * A fake in-memory Repository for testing.
 * Returns configured data without touching a real git repo.
 */
export class FakeRepository implements Repository {
	// Fixture data - use unique private names to avoid method/property conflicts
	private _files: Map<string, Uint8Array> = new Map();
	private _headSha: string;
	private _branchName: string;
	private _commitSubjects: string[];

	constructor({
		files = {},
		headSha = "abc123",
		branch = "main",
		subjects = [],
	}: {
		files?: Record<string, string>;
		headSha?: string;
		branch?: string;
		subjects?: string[];
	} = {}) {
		this._headSha = headSha;
		this._branchName = branch;
		this._commitSubjects = subjects;

		// Convert string content to Uint8Array
		for (const [path, content] of Object.entries(files)) {
			this._files.set(path, new TextEncoder().encode(content));
		}
	}

	/**
	 * Set file content (string → Uint8Array).
	 */
	setFile(path: string, content: string): void {
		this._files.set(path, new TextEncoder().encode(content));
	}

	/**
	 * Get file content as Uint8Array.
	 */
	getFile(path: string): Uint8Array | undefined {
		return this._files.get(path);
	}

	/**
	 * Set head SHA.
	 */
	setHeadSha(sha: string): void {
		this._headSha = sha;
	}

	/**
	 * Set branch name.
	 */
	setBranch(name: string): void {
		this._branchName = name;
	}

	/**
	 * Set commit subjects.
	 */
	setSubjects(subjects: string[]): void {
		this._commitSubjects = subjects;
	}

	readCommitted(
		_ref: string,
		patterns: readonly string[],
	): Result<Map<string, Uint8Array>, MarkSyncError> {
		// Filter files by patterns (simple glob matching)
		const result = new Map<string, Uint8Array>();
		for (const [path, bytes] of this._files) {
			for (const pattern of patterns) {
				if (matchesPattern(path, pattern)) {
					result.set(path, bytes);
					break;
				}
			}
		}
		return Res.ok(result);
	}

	headSha(): Result<string, MarkSyncError> {
		return Res.ok(this._headSha);
	}

	currentBranch(): Result<string, MarkSyncError> {
		return Res.ok(this._branchName);
	}

	listCommitSubjects(
		_range?: string,
	): Result<readonly string[], MarkSyncError> {
		return Res.ok(this._commitSubjects);
	}
}

/**
 * Simple glob pattern matching (supports * and **).
 */
export function matchesPattern(path: string, pattern: string): boolean {
	// Convert glob pattern to regex
	// Order matters: ** must be processed before *
	const regexPattern = pattern
		.replace(/\./g, "\\.")
		.replace(/\*\*/g, "DOUBLESTAR")
		.replace(/\*/g, "[^/]*")
		.replace(/DOUBLESTAR/g, ".*")
		.replace(/\//, "/?"); // Make first / optional after ** expansion

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(path);
}
