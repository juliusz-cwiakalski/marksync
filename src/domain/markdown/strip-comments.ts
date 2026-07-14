// Strip HTML comments from MDAST — comment-only html nodes removed at parse stage (GH-77, DEC-2).

import type { Root } from "mdast";

/**
 * Predicate: true if the value is exactly one HTML comment (optionally surrounded by whitespace).
 * Security boundary: prevents over-stripping — mixed HTML+comment nodes must be rejected.
 * Pattern matches `<!-- x -->`, `  <!-- x -->  `, multi-line, empty `<!---->`, and edge cases `<!-->` / `<!--->`.
 */
export function isCommentOnlyHtml(value: string): boolean {
	return /^\s*<!--[^>]*>\s*$/.test(value);
}

/**
 * MDAST visitor that removes every comment-only `html` node from the tree.
 * Returns the same root instance (pure, deterministic, no IO, no new dependency — DEC-3).
 * Code/text/other node kinds are untouched — a comment inside ``` ``` is a `code` node, never `html`.
 */
export function stripCommentNodes(root: Root): Root {
	return walk(root) as Root;
}

function walk(node: unknown): unknown {
	if (!node || typeof node !== "object") {
		return node;
	}

	// Filter children for container types
	const container = node as { children?: unknown[] };
	if (Array.isArray(container.children)) {
		container.children = container.children
			.map((child) => walk(child))
			.filter((child) => {
				// Remove comment-only html nodes
				if (child && typeof child === "object") {
					const html = child as { type?: string; value?: string };
					if (html.type === "html" && typeof html.value === "string") {
						return !isCommentOnlyHtml(html.value);
					}
				}
				return true;
			});
	}

	return node;
}
