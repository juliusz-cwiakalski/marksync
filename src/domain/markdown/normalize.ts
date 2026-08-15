// Canonical Markdown normalizer (spec F-5, DEC-3, DM-3).
// Shares every stage downstream of MDAST with the serializer (RSK-1 mitigated).

import { hastToMarkdown } from "#domain/markdown/hast-to-markdown";
import { toHast } from "mdast-util-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import type { Root } from "hast";

/**
 * Normalize Markdown to its canonical form.
 *
 * Pipeline: forward parse → mdastToHast → hastToMarkdown
 *
 * The serializer and normalizer share every stage downstream of MDAST
 * (hastToMarkdown), so the canonical form is defined once (spec DEC-3).
 *
 * Annotations (front-matter, comment-only HTML, link-reference comments) are
 * stripped by the forward parse stage and never re-synthesized (DEC-6).
 *
 * @param markdown - The Markdown string to normalize.
 * @returns Canonical Markdown string (spec Appendix B / DEC-3).
 */
export function normalizeMarkdown(markdown: string): string {
	// Step 1: Forward parse (includes annotation stripping)
	const parsed = parseMarkdown(markdown);
	if (!parsed.ok) {
		// The normalizer should never fail on valid Markdown input.
		// If it does, this is a programming error or malformed input.
		throw new Error(`Markdown normalization failed: ${parsed.error.kind}`);
	}

	// Step 2: MDAST → HAST (using the existing bridge)
	const hast = toHast(parsed.value, { allowDangerousHtml: true }) as Root;

	if (!hast || !hast.children) {
		throw new Error("MDAST → HAST conversion failed");
	}

	// Step 3: HAST → Markdown via the shared canonical serializer
	// This is where the serializer and normalizer converge (RSK-1 mitigation)
	return hastToMarkdown(hast);
}