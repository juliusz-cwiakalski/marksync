// MDAST→HAST bridge via remark-rehype (ADR-0005; GH-20 F-2).

import type { Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import remark2rehype from "remark-rehype";
import { unified } from "unified";

// `allowDangerousHtml` keeps raw HTML as HAST `raw` nodes so the renderer can
// escape it (DEC-4) and the classifier can flag block-level raw (F-5); without
// it remark-rehype silently drops the raw bytes (a node-loss path).
const bridge = unified().use(remark2rehype, { allowDangerousHtml: true });

/** Convert a parsed MDAST root into the adapter-agnostic HAST the renderer walks. */
export function mdastToHast(mdast: MdastRoot): HastRoot {
	return bridge.runSync(mdast) as HastRoot;
}
