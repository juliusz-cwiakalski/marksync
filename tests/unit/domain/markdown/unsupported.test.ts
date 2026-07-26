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
	findAllUnsupported,
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
	properties: Record<string, unknown> = {},
): Root["children"][number] {
	return { type: "element", tagName, properties, children };
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
		const src = '<div class="x">Real block</div>\n';
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
		const src = '<div data-x="1"><!-- note --></div>\n';
		const hast = mdastToHast(parseMarkdown(src).value as never);
		const hit = findUnsupported(hast, SRC);
		expect(hit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath: SRC,
		});
	});
});

describe("TC-ADVERSARIAL-002 (AC-F2-1) — findAllUnsupported parity vs findUnsupported", () => {
	test("findAllUnsupported(tree)[0] deep-equals findUnsupported(tree) on multi-node tree", () => {
		// Build a tree with multiple unsupported nodes at different depths
		const tree = root([
			el("math", [el("dl")]), // Nested unsupported nodes
			el("section"), // Top-level unsupported node
		]);

		const firstHit = findUnsupported(tree, SRC);
		const allHits = findAllUnsupported(tree, SRC);

		// First hit from findAllUnsupported must equal findUnsupported
		expect(allHits.length).toBeGreaterThanOrEqual(1);
		expect(allHits[0]).toEqual(firstHit);
		expect(firstHit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "math",
			sourcePath: SRC,
		});

		// All nodes collected (none truncated)
		expect(allHits.length).toBe(3);
		expect(allHits.map((h) => h.construct)).toEqual(["math", "dl", "section"]);
	});

	test("clean tree returns empty array from findAllUnsupported and null from findUnsupported", () => {
		// Tree with only allowed tags
		const tree = root([
			el("p", [el("strong", ["text"])]),
			el("ul", [el("li", ["item"])]),
		]);

		expect(findAllUnsupported(tree, SRC)).toEqual([]);
		expect(findUnsupported(tree, SRC)).toBeNull();
	});

	test("classifyUnsupported behavior unchanged (DEC-1 parity guard)", () => {
		// Verify classifyUnsupported still works as before
		const mathNode = el("math");
		const dlNode = el("dl");

		expect(classifyUnsupported(mathNode, SRC)).toEqual({
			kind: "UnsupportedConstruct",
			construct: "math",
			sourcePath: SRC,
		});

		expect(classifyUnsupported(dlNode, SRC)).toEqual({
			kind: "UnsupportedConstruct",
			construct: "dl",
			sourcePath: SRC,
		});

		// Allowed tag returns null
		expect(classifyUnsupported(el("p"), SRC)).toBeNull();
	});

	test("raw-html-block path parity: findAllUnsupported(tree)[0] deep-equals findUnsupported(tree)", () => {
		// Build a HAST tree containing a raw node as a direct child of root (raw-html-block)
		const rawNode: { type: "raw"; value: string } = {
			type: "raw",
			value: "<div>block</div>",
		};
		const tree = root([rawNode] as Root["children"]);

		const firstHit = findUnsupported(tree, SRC);
		const allHits = findAllUnsupported(tree, SRC);

		// First hit from findAllUnsupported must equal findUnsupported
		expect(allHits.length).toBe(1);
		expect(allHits[0]).toEqual(firstHit);
		expect(firstHit).toEqual({
			kind: "UnsupportedConstruct",
			construct: "raw-html-block",
			sourcePath: SRC,
		});
	});
});

describe("TC-ADVERSARIAL-003 (AC-F2-1) — multi-node depth-first collection", () => {
	test("collects all 3-5 unsupported nodes across branches and depths", () => {
		// Build a complex tree with unsupported nodes at varying depths
		const tree = root([
			el("blockquote", [
				el("p", [el("math")]), // Deep in first branch
			]),
			el("section", [
				// Second branch
				el("dl", [
					// Nested
					el("dt", ["term"]),
				]),
			]),
			el("details"), // Third top-level node
		]);

		const allHits = findAllUnsupported(tree, SRC);

		// All nodes collected (none truncated)
		expect(allHits.length).toBe(5);

		// Order is depth-first pre-order
		expect(allHits[0].construct).toBe("math"); // Deep in first branch
		expect(allHits[1].construct).toBe("section"); // Second branch root
		expect(allHits[2].construct).toBe("dl"); // Nested in second branch
	});

	test("every entry has correct kind, construct, and sourcePath", () => {
		const tree = root([el("math"), el("dl"), el("section")]);

		const allHits = findAllUnsupported(tree, SRC);

		expect(allHits.length).toBe(3);

		for (const hit of allHits) {
			expect(hit.kind).toBe("UnsupportedConstruct");
			expect(hit.sourcePath).toBe(SRC);
			expect(["math", "dl", "section"]).toContain(hit.construct);
		}
	});

	test("depth-first traversal order is consistent across runs", () => {
		// Determinism: same tree, same order every time
		const tree = root([
			el("ul", [el("li", [el("math")]), el("li", [el("dl")])]),
			el("section"),
		]);

		const firstRun = findAllUnsupported(tree, SRC);
		const secondRun = findAllUnsupported(tree, SRC);

		expect(firstRun.length).toBe(3);
		expect(secondRun.length).toBe(3);

		for (let i = 0; i < firstRun.length; i++) {
			expect(firstRun[i]).toEqual(secondRun[i]);
		}
	});
});

describe("TC-ADVERSARIAL-010 (AC-F3-2 / DEC-2) — hand-built macro HAST classification", () => {
	test("toc macro is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "toc",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("info macro is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "info",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("code macro is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "code",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("expand macro is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "expand",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("jira macro is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "jira",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("gliffy app tag is classified as UnsupportedConstruct", () => {
		const tree = root([
			el("ac:structured-macro", [], {
				"ac:name": "gliffy",
			}),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(1);
		expect(hits[0]).toEqual({
			kind: "UnsupportedConstruct",
			construct: "ac:structured-macro",
			sourcePath: SRC,
		});
	});

	test("no silent drop for all macros — every node appears in classification", () => {
		const tree = root([
			el("ac:structured-macro", [], { "ac:name": "toc" }),
			el("ac:structured-macro", [], { "ac:name": "info" }),
			el("ac:structured-macro", [], { "ac:name": "code" }),
			el("ac:structured-macro", [], { "ac:name": "expand" }),
			el("ac:structured-macro", [], { "ac:name": "jira" }),
		]);
		const hits = findAllUnsupported(tree, SRC);
		expect(hits.length).toBe(5);
		for (const hit of hits) {
			expect(hit.kind).toBe("UnsupportedConstruct");
			expect(hit.construct).toBe("ac:structured-macro");
		}
	});
});
