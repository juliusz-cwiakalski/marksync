// Repo-relative path and ref validation guards (TDR-0003 C-4).
// These guards throw on malicious input to enforce invariants at the boundary
// before any git spawn occurs.

/**
 * Validate that a path is safe to use as a repo-relative path argument to git.
 * Throws if the path contains malicious patterns.
 *
 * Rejected patterns:
 * - `..` segments (directory traversal)
 * - Absolute paths (leading `/` or `\`)
 * - NUL or control bytes
 * - Shell metacharacters (backtick, `$()`, `;`, `|`, `&`, `<`, `>`, whitespace)
 *
 * @throws {Error} If the path is invalid (invariant violation)
 */
export function validateRepoRelative(path: string): void {
	// Check for NUL and control bytes (except tab)
	for (let i = 0; i < path.length; i++) {
		const code = path.charCodeAt(i);
		if (code === 0 || (code >= 1 && code <= 31 && code !== 9)) {
			throw new Error(
				`Invalid repo-relative path: contains control byte at position ${i}`,
			);
		}
	}

	// Check for newline and carriage return
	if (path.includes("\n") || path.includes("\r")) {
		throw new Error(`Invalid repo-relative path: contains control byte`);
	}

	// Check for backtick, dollar-paren, semicolon, pipe, ampersand, angle brackets, and whitespace
	if (/[`$();|&<> ]/.test(path)) {
		throw new Error(`Invalid repo-relative path: contains shell metacharacter`);
	}

	// Check for absolute paths
	if (path.startsWith("/") || path.startsWith("\\")) {
		throw new Error(`Invalid repo-relative path: is absolute`);
	}

	// Check for directory traversal
	if (path.includes("..") || path.includes(".\\")) {
		throw new Error(
			`Invalid repo-relative path: contains parent directory reference`,
		);
	}
}

/**
 * Validate that a git ref is safe to use as an argument to git.
 * Throws if the ref contains malicious patterns.
 *
 * Rejected patterns:
 * - Spaces
 * - NUL or control bytes
 * - Shell metacharacters (backtick, `$()`, `;`, `|`, `&`, `<`, `>`)
 * - `..` segments
 *
 * @throws {Error} If the ref is invalid (invariant violation)
 */
export function validateRef(ref: string): void {
	// Check for NUL and control bytes (except tab)
	for (let i = 0; i < ref.length; i++) {
		const code = ref.charCodeAt(i);
		if (code === 0 || (code >= 1 && code <= 31 && code !== 9)) {
			throw new Error(
				`Invalid git ref: contains control byte at position ${i}`,
			);
		}
	}

	// Check for newline and carriage return
	if (ref.includes("\n") || ref.includes("\r")) {
		throw new Error(`Invalid git ref: contains control byte`);
	}

	// Check for shell metacharacters (backtick, dollar-paren, semicolon, pipe, ampersand, angle brackets)
	if (/[`$();|&<>]/.test(ref)) {
		throw new Error(`Invalid git ref: contains shell metacharacter`);
	}

	// Check for spaces
	if (/\s/.test(ref)) {
		throw new Error(`Invalid git ref: contains whitespace`);
	}

	// Check for directory traversal
	if (ref.includes("..")) {
		throw new Error(`Invalid git ref: contains parent directory reference`);
	}
}
