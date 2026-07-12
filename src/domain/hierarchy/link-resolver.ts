import type { PageRef } from "#domain/target/port";
import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";
import { dirname, posix } from "node:path";

/**
 * Cross-page link resolver (pure domain).
 * Resolves Markdown cross-document links to target page references.
 * See architecture-overview §"Module governance" (Link resolver).
 */

export interface LinkBindings {
	readonly [path: string]: PageRef;
}

/**
 * Resolve a Markdown link target to a PageRef or pass through non-markdown links.
 * @param sourcePath - Repo-relative path of the source document
 * @param target - Link target (e.g., "other.md", "../doc.md", "https://example.com")
 * @param bindings - Map from repo-relative path to PageRef
 * @returns PageRef for resolved .md links, original target for external/anchor links, or error
 */
export function resolveLink(
	sourcePath: string,
	target: string,
	bindings: LinkBindings,
): Result<PageRef | string, MarkSyncError> {
	// External links pass through untouched
	if (
		target.startsWith("http://") ||
		target.startsWith("https://") ||
		target.startsWith("mailto:")
	) {
		return Res.ok(target);
	}

	// Anchor-only links pass through untouched
	if (target.startsWith("#")) {
		return Res.ok(target);
	}

	// Non-.md links pass through untouched
	if (!target.endsWith(".md")) {
		return Res.ok(target);
	}

	// Normalize target path relative to source directory
	const sourceDir = dirname(sourcePath);
	const normalizedPath = posix.normalize(posix.join(sourceDir, target));

	// Look up in bindings
	const pageRef = bindings[normalizedPath];
	if (!pageRef) {
		return Res.err({
			kind: "UnresolvedLink",
			sourcePath,
			target: normalizedPath,
		});
	}

	return Res.ok(pageRef);
}
