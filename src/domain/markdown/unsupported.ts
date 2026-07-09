// Unsupported-node classifier — emits the pre-existing UnsupportedConstruct arm
// so no node is ever silently dropped (ADR-0005 "do not silently degrade"; GH-20 F-5).

import type { MarkSyncError } from "#domain/errors";
import type { Element, Node, Root } from "hast";

/** HAST tag names the Storage renderer handles (the canonical subset + defensive sub/sup). */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"ul",
	"ol",
	"li",
	"blockquote",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"pre",
	"code",
	"a",
	"strong",
	"em",
	"del",
	"s",
	"sub",
	"sup",
	"img",
	"hr",
	"input",
]);

/** A `raw` HAST node (remark-rehype `allowDangerousHtml`); hast 3 omits it from its type model. */
interface RawNode {
	type: "raw";
	value: string;
}

/** A node as seen at runtime: any hast node plus the untyped `raw` kind. */
type AnyNode = Node | RawNode;

/**
 * Classify a single node. Returns the pre-existing `UnsupportedConstruct` arm for
 * an element whose tag is outside the canonical subset; `null` otherwise. Raw
 * nodes are not flagged here — block-level raw detection needs parent context
 * (see {@link findUnsupported}); inline raw is escaped at render (DEC-4).
 */
export function classifyUnsupported(
	node: AnyNode,
	sourcePath: string,
): MarkSyncError | null {
	if (node.type === "element") {
		const el = node as Element;
		if (!ALLOWED_TAGS.has(el.tagName)) {
			return {
				kind: "UnsupportedConstruct",
				construct: el.tagName,
				sourcePath,
			};
		}
	}
	return null;
}

/**
 * Walk `root` depth-first and return the first unsupported node's error, or
 * `null` if the tree is clean. A `raw` node that is a direct child of the root
 * is a raw HTML *block* (unsupported); a `raw` node nested inside an element is
 * inline raw (escaped at render — DEC-4 — and not flagged).
 */
export function findUnsupported(
	root: Root,
	sourcePath: string,
): MarkSyncError | null {
	return walk(root, root, sourcePath);
}

function walk(
	node: AnyNode,
	parent: AnyNode,
	sourcePath: string,
): MarkSyncError | null {
	if (node.type === "raw" && parent.type === "root") {
		return {
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath,
		};
	}
	const hit = classifyUnsupported(node, sourcePath);
	if (hit) return hit;
	if (node.type === "element") {
		for (const child of (node as Element).children) {
			const found = walk(child as AnyNode, node, sourcePath);
			if (found) return found;
		}
	} else if (node.type === "root") {
		for (const child of (node as Root).children) {
			const found = walk(child as AnyNode, node, sourcePath);
			if (found) return found;
		}
	}
	return null;
}
