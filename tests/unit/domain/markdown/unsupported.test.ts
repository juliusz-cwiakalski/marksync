// tests/unit/domain/markdown/unsupported.test.ts
//
// Unsupported-node classifier — no silent drop (GH-20 F-5 / AC-F5-1).
// TC-UNSUP-001..004. Footnote/math/definition-list are unreachable from plain
// remark-gfm in HAST, so they are simulated by hand-constructed unsupported
// element nodes (the shape a future plugin would emit); the classifier is
// generic over every non-allow-listed tag.

import type { Root } from "hast";
import { describe, expect, test } from "bun:test";
import {
	classifyUnsupported,
	findUnsupported,
} from "#domain/markdown/unsupported";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";

const SRC = "docs/page.md";

/** Build a HAST root with the given top-level children. */
function root(children: Root["children"]): Root {
	return { type: "root", children };
}

/** Hand-construct an element node with optional children. */
function el(
	tagName: string,
	children: Root["children"] = [],
): Root["children"][number] {
	return { type: "element", tagName, properties: {}, children };
}

describe("TC-UNSUP-001 (AC-F5-1) — unsupported element → UnsupportedConstruct", () => {
	test("a definition-list <dl> node is flagged", () => {
		const tree = root([el("dl")]);
		const hit = findUnsupported(tree, SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "dl",
			sourcePath: SRC,
		});
	});

	test("a footnote-shaped <section> node is flagged", () => {
		const tree = root([el("section")]);
		expect(findUnsupported(tree, SRC)).toEqual({
			kind: "UnsupportedConstruct",
			construct: "section",
			sourcePath: SRC,
		});
	});

	test("classifyUnsupported flags a bare math element and carries sourcePath", () => {
		const hit = classifyUnsupported(el("math"), SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "math",
			sourcePath: SRC,
		});
	});
});

describe("TC-UNSUP-002 (AC-F5-1) — math / definition-list nodes are flagged", () => {
	test("a nested <math> deep in a paragraph is still found", () => {
		const tree = root([
			{ type: "element", tagName: "p", properties: {}, children: [el("math")] },
		]);
		const hit = findUnsupported(tree, SRC);
		expect(hit?.kind).toBe("UnsupportedConstruct");
		expect((hit as { construct: string }).construct).toBe("math");
	});
});

describe("TC-UNSUP-003 (AC-F5-1) — canonical subset is never flagged (no false positives)", () => {
	const kitchensink = [
		"# H1\n## H2\n",
		"**b** *i* `c` ~~s~~\n",
		"[l](https://e.com/x?q=1&r=2)\n",
		"![a](https://e.com/i.png) ![a](diagram.png)\n",
		"- a\n1. b\n",
		"- [ ] t\n",
		"> q\n",
		"```python\nprint(1)\n```\n",
		"---\n",
		"| a | b |\n| - | - |\n| 1 | 2 |\n",
	];

	test("every remark-gfm-reachable construct tree is clean", () => {
		for (const src of kitchensink) {
			const hast = mdastToHast(parseMarkdown(src).value as never);
			expect(findUnsupported(hast, SRC), `src=${src.slice(0, 20)}`).toBeNull();
		}
	});

	test("hand-constructed <sub>/<sup> nodes are NOT flagged (defensively allowed)", () => {
		// remark-gfm cannot produce sub/sup, but the visitor maps them defensively
		// (PM-DEC-1), so the classifier must not flag them either.
		const tree = root([
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [el("sub"), el("sup")],
			},
		]);
		expect(findUnsupported(tree, SRC)).toBeNull();
	});
});

describe("TC-UNSUP-004 — raw inline HTML is escaped (not flagged); raw HTML block is flagged", () => {
	test("raw INLINE HTML is NOT classified (escaped at render — DEC-4)", () => {
		// `<b>raw</b>` inline → raw nodes nested inside <p>; never flagged.
		const hast = mdastToHast(
			parseMarkdown("plain <b>raw</b> inline\n").value as never,
		);
		expect(findUnsupported(hast, SRC)).toBeNull();
	});

	test("raw HTML BLOCK (top-level raw) IS classified", () => {
		// A `<div>…</div>` at block level is a raw node that is a direct child of
		// root → unsupported (never silently passed through).
		const hast = mdastToHast(
			parseMarkdown("<div class='x'>block</div>\n").value as never,
		);
		const hit = findUnsupported(hast, SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath: SRC,
		});
	});

	test("GH-77 TC-COMM-004: real block-level raw HTML still flagged (AC-F3-1)", () => {
		// Regression guard: real block-level raw HTML still yields UnsupportedConstruct.
		const src = "<div class=\"x\">Real block</div>\n";
		const hast = mdastToHast(parseMarkdown(src).value as never);
		const hit = findUnsupported(hast, SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath: SRC,
		});
	});

	test("GH-77 TC-COMM-004: real inline raw HTML still escaped, not flagged (AC-F3-2)", () => {
		// Regression guard: real inline raw HTML is still escaped and not flagged.
		const src = "Text <b>raw</b> inline.\n";
		const hast = mdastToHast(parseMarkdown(src).value as never);
		expect(findUnsupported(hast, SRC)).toBeNull();
	});

	test("GH-77 TC-COMM-004: mixed HTML+comment node still flagged (AC-F3-3)", () => {
		// Regression guard: mixed HTML+comment node is still flagged at block level.
		const src = "<div data-x=\"1\"><!-- note --></div>\n";
		const hast = mdastToHast(parseMarkdown(src).value as never);
		const hit = findUnsupported(hast, SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath: SRC,
		});
	});
});
