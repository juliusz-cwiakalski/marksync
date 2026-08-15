// Canonical HAST→Markdown serializer on the unified stack (TDR-0013 Alt 1, spec DEC-3).
// Options layer {bullet: '-', rule: '-'} defined once at this load-bearing point.

import { toMdast } from "hast-util-to-mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { canonicalize } from "#domain/render/canonicalize";
import type { Root } from "hast";
import type { Nodes as MdastNodes } from "mdast";

/**
 * Canonical serializer: HAST → Markdown.
 *
 * Pipeline: canonicalize() → hast-util-to-mdast → remark-gfm stringify
 *
 * The options layer is defined once at this single load-bearing point:
 * - bullet: '-' (unordered list bullets are hyphens, not asterisks)
 * - rule: '-' (thematic breaks are hyphens, not asterisks)
 *
 * These knobs, combined with the canonicalize() stage (which escapes HTML,
 * drops structural whitespace, and sorts properties), produce the canonical
 * Markdown form specified in spec Appendix B.
 *
 * @param hast - The HAST tree to serialize.
 * @returns Canonical Markdown string (spec Appendix B / DEC-3).
 */
export function hastToMarkdown(hast: Root): string {
	// Step 1: Canonicalize (raw→text escapes, structural whitespace drop, property sort)
	const canonicalized = canonicalize(hast);

	// Step 2: HAST → MDAST via hast-util-to-mdast
	const mdast = toMdast(canonicalized) as MdastNodes & { type: "root" };

	// Step 3: MDAST → Markdown via remark + remark-gfm stringify
	// The options layer is defined once at this single load-bearing point
	const stringifyOptions = {
		bullet: "-",
		rule: "-",
	} as const;

	const markdown = remark()
		.use(remarkGfm)
		.use(remarkStringify, stringifyOptions)
		.stringify(mdast);

	return markdown;
}
