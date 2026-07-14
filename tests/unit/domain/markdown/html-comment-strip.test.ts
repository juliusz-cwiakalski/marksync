// Comment-strip transformer — predicate + tree visitor (GH-77 TC-COMM-001..003, TC-COMM-010).

import { describe, expect, test } from "bun:test";
import { remark } from "remark";
import type { Root } from "mdast";
import { isCommentOnlyHtml, stripCommentNodes } from "#domain/markdown/strip-comments";

describe("TC-COMM-001..002 — comment-only predicate", () => {
	const trueCases = [
		"<!-- x -->",
		"  <!-- x -->  ",
		"<!--\nmulti\nline\n-->",
		"<!---->",
		"<!-->",
		"<!--->",
	];

	const falseCases = [
		"<div>real HTML</div>",
		"<b>",
		"<div data-x=\"1\"><!-- note --></div>",
		"",
		"plain text",
		"<!-- comment --> <div>mixed</div>",
		"<div><!-- comment --></div> text",
	];

	for (const value of trueCases) {
		test(`accepts: ${JSON.stringify(value)}`, () => {
			expect(isCommentOnlyHtml(value)).toBe(true);
		});
	}

	for (const value of falseCases) {
		test(`rejects: ${JSON.stringify(value)}`, () => {
			expect(isCommentOnlyHtml(value)).toBe(false);
		});
	}
});

describe("TC-COMM-001..003, TC-COMM-010 — stripCommentNodes transformer", () => {
	function parse(text: string): Root {
		return remark().parse(text);
	}

	function countHtmlNodes(root: Root): number {
		let count = 0;
		const walk = (node: unknown): void => {
			if (node && typeof node === "object") {
				const n = node as { type?: string; value?: string; children?: unknown };
				if (n.type === "html") count++;
				if (Array.isArray(n.children)) for (const c of n.children) walk(c);
			}
		};
		walk(root);
		return count;
	}

	test("removes block-level comment at root", () => {
		const root = parse("<!-- c -->\n\n# H\n\nBody.");
		const after = stripCommentNodes(root);
		expect(countHtmlNodes(after)).toBe(0);
		expect(after.children[0]?.type).toBe("heading");
	});

	test("removes inline comment inside a paragraph, preserving surrounding text", () => {
		const root = parse("Before <!-- c --> after.");
		const after = stripCommentNodes(root);
		expect(countHtmlNodes(after)).toBe(0);
		const para = after.children[0] as { type?: string; children?: unknown[] };
		expect(para?.type).toBe("paragraph");
		expect(para?.children?.length).toBe(2); // "Before " and " after."
	});

	test("does NOT remove mixed HTML+comment node (AC-F3-3)", () => {
		const root = parse("<div data-x=\"1\"><!-- note --></div>");
		const after = stripCommentNodes(root);
		expect(countHtmlNodes(after)).toBe(1);
		const html = after.children[0] as { type?: string; value?: string };
		expect(html?.type).toBe("html");
		expect(html?.value).toBe("<div data-x=\"1\"><!-- note --></div>");
	});

	test("code/text/other node kinds untouched", () => {
		const root = parse("```\n<!-- x -->\n```\n\nparagraph");
		const after = stripCommentNodes(root);
		const code = after.children[0] as { type?: string; value?: string };
		expect(code?.type).toBe("code");
		expect(code?.value).toBe("<!-- x -->");
	});

	test("[//]: # (…) link-reference comment yields no html node (remark definition node)", () => {
		const root = parse("[//]: # (hidden)\n\n# H");
		const after = stripCommentNodes(root);
		expect(countHtmlNodes(after)).toBe(0);
		// The definition node is not html; the tree is unchanged.
		expect(after.children[0]?.type).toBe("definition");
	});

	test("multiple comments all removed", () => {
		const root = parse("<!-- a -->\n\n<!-- b -->\n\n<!-- c -->");
		const after = stripCommentNodes(root);
		expect(countHtmlNodes(after)).toBe(0);
	});

	test("nested comment inside blockquote removed", () => {
		const root = parse("> <!-- comment -->\n> text");
		const after = stripCommentNodes(root);
		const blockquote = after.children[0] as { type?: string; children?: unknown[] };
		expect(blockquote?.type).toBe("blockquote");
		const para = blockquote?.children?.[0] as { type?: string; children?: unknown[] };
		expect(para?.type).toBe("paragraph");
		// Only "text" node remains
		expect(para?.children?.length).toBe(1);
	});
});