// tests/unit/domain/markdown/mdast-to-hast.test.ts
//
// MDAST→HAST bridge — real remark + remark-rehype (no mock). TC-BRIDGE-001..003.
// F-2: the bridge preserves the canonical subset and never silently drops a node.

import type { Root as HastRoot } from "hast";
import { describe, expect, test } from "bun:test";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";

/** Collect every HAST node `type` + element `tagName` anywhere in the tree. */
function collect(node: HastRoot): { types: string[]; tags: string[] } {
	const types: string[] = [];
	const tags: string[] = [];
	const walk = (n: unknown): void => {
		if (!n || typeof n !== "object") return;
		const v = n as { type?: unknown; tagName?: unknown; children?: unknown[] };
		if (typeof v.type === "string") types.push(v.type);
		if (typeof v.tagName === "string") tags.push(v.tagName);
		if (Array.isArray(v.children)) for (const c of v.children) walk(c);
	};
	walk(node);
	return { types, tags };
}

describe("TC-BRIDGE-001 — headings + paragraph + code-block round-trip into HAST", () => {
	const hast = mdastToHast(
		parseMarkdown("# Title\n\nA paragraph.\n\n```js\nconst x = 1;\n```\n")
			.value as never,
	);
	const { types, tags } = collect(hast);

	test("contains h1, p, and pre>code", () => {
		expect(tags).toContain("h1");
		expect(tags).toContain("p");
		expect(tags).toContain("pre");
		expect(tags).toContain("code");
	});

	test("produces HAST element/text node kinds (not MDAST kinds)", () => {
		expect(types).toContain("root");
		expect(types).toContain("element");
		expect(types).toContain("text");
		// MDAST-only kinds must be gone — the bridge translated them.
		expect(types).not.toContain("heading");
		expect(types).not.toContain("paragraph");
		expect(types).not.toContain("code");
	});
});

describe("TC-BRIDGE-002 — GFM table + task-list surface as classifiable HAST", () => {
	const src = "| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n";
	const hast = mdastToHast(parseMarkdown(src).value as never);
	const { tags } = collect(hast);

	test("table becomes thead/tbody structure", () => {
		expect(tags).toContain("table");
		expect(tags).toContain("thead");
		expect(tags).toContain("tbody");
		expect(tags).toContain("th");
		expect(tags).toContain("td");
	});

	test("task-list becomes a ul.contains-task-list with checkbox inputs", () => {
		expect(tags).toContain("ul");
		expect(tags).toContain("input");
		// remark-rehype marks task-lists via className — assert the marker survives
		// so the renderer can classify it (the renderer emits <ac:task-list>).
		let sawTaskList = false;
		let sawCheckedInput = false;
		const walk = (n: unknown): void => {
			if (!n || typeof n !== "object") return;
			const v = n as {
				tagName?: string;
				properties?: { className?: unknown };
				checked?: unknown;
				type?: string;
				children?: unknown[];
			};
			if (
				v.tagName === "ul" &&
				Array.isArray(v.properties?.className) &&
				(v.properties?.className as string[]).includes("contains-task-list")
			)
				sawTaskList = true;
			if (v.tagName === "input" && v.properties?.type === "checkbox")
				sawCheckedInput = true;
			if (Array.isArray(v.children)) for (const c of v.children) walk(c);
		};
		walk(hast);
		expect(sawTaskList).toBe(true);
		expect(sawCheckedInput).toBe(true);
	});
});

describe("TC-BRIDGE-003 — raw inline HTML is preserved (not dropped) for escape at render", () => {
	const hast = mdastToHast(
		parseMarkdown("plain <b>raw</b> inline\n").value as never,
	);
	const { types } = collect(hast);

	test("the bridge surfaces raw HTML as `raw` nodes (DEC-4 escape target)", () => {
		// Without allowDangerousHtml the <b>/</b> would vanish; with it they survive
		// as HAST `raw` nodes the renderer escapes — no silent drop at the bridge.
		expect(types).toContain("raw");
	});

	test("text content surrounding the raw HTML is preserved", () => {
		let text = "";
		const walk = (n: unknown): void => {
			if (!n || typeof n !== "object") return;
			const v = n as { type?: string; value?: string; children?: unknown[] };
			if (v.type === "text" && typeof v.value === "string") text += v.value;
			if (Array.isArray(v.children)) for (const c of v.children) walk(c);
		};
		walk(hast);
		expect(text).toContain("plain");
		expect(text).toContain("raw");
		expect(text).toContain("inline");
	});
});
