// Canonical Markdown entry — bytes → MDAST via remark + remark-frontmatter + remark-gfm (ADR-0005, GH-20 F-1, GH-63).

import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";
import type { Root as MdastRoot } from "mdast";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

// front-matter first so it claims document-leading `---` blocks before GFM;
// a lone `---` with no closing fence still parses as a thematic break (GH-63).
const processor = remark().use(remarkFrontmatter).use(remarkGfm);

export interface ParseOptions {
	/**
	 * Provenance for downstream `UnsupportedConstruct` errors. Threaded through
	 * the caller into `renderStorage({ sourcePath })`; deliberately NOT embedded
	 * in the returned tree so the content hash stays path-independent.
	 */
	sourcePath?: string;
}

/**
 * Parse Markdown bytes into an MDAST root. The `Result` signature is kept for
 * port-contract alignment, but remark-gfm is effectively total over MS-0002
 * inputs: a genuine parse failure is an invariant violation that `throw`s
 * (PD-8 / PM-DEC-2), never an `UnsupportedConstruct`.
 */
export function parseMarkdown(
	bytes: Uint8Array | string,
	_opts?: ParseOptions,
): Result<MdastRoot, MarkSyncError> {
	const text =
		typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
	const root = processor.parse(text);
	return Result.ok(root);
}
