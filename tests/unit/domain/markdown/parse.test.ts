// tests/unit/domain/markdown/parse.test.ts
//
// `parseMarkdown` — the canonical pipeline entry (GH-20 F-1). Real remark +
// remark-gfm (no mock). TC-PARSE-001..004. PD-8 / PM-DEC-2: parseMarkdown is
// effectively total over MS-0002 inputs (a genuine throw is an invariant
// violation, never an UnsupportedConstruct).

import type { Root } from "mdast";
import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "#domain/markdown/parse";

/** Collect every MDAST node `type` appearing anywhere in the tree. */
function nodeTypes(root: Root): string[] {
	const out: string[] = [];
	const walk = (node: unknown): void => {
		if (node && typeof node === "object") {
			const n = node as { type?: unknown; children?: unknown };
			if (typeof n.type === "string") out.push(n.type);
			if (Array.isArray(n.children)) for (const c of n.children) walk(c);
		}
	};
	walk(root);
	return out;
}

describe("TC-PARSE-001 — canonical GFM source → ok(MdastRoot)", () => {
	const result = parseMarkdown("# Title\n\nparagraph **bold**\n");

	test("returns ok", () => {
		expect(result.ok).toBe(true);
	});

	test("first child is a depth-1 heading", () => {
		if (!result.ok) throw new Error("expected ok");
		const first = result.value.children[0];
		expect(first?.type).toBe("heading");
		expect((first as { depth?: number }).depth).toBe(1);
	});

	test("recognizes the GFM inline subset (strong)", () => {
		if (!result.ok) throw new Error("expected ok");
		expect(nodeTypes(result.value)).toContain("strong");
	});
});

describe("TC-PARSE-002 — GFM table + task-list produce table and checked list nodes", () => {
	const src = "| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n";
	const result = parseMarkdown(src);

	test("returns ok", () => {
		expect(result.ok).toBe(true);
	});

	test("remark-gfm is wired (table + list with checked items)", () => {
		if (!result.ok) throw new Error("expected ok");
		const types = nodeTypes(result.value);
		expect(types).toContain("table");
		expect(types).toContain("list");
		// Task-list items carry a `checked` boolean (remark-gfm).
		let sawChecked = false;
		const walk = (node: unknown): void => {
			if (node && typeof node === "object") {
				const n = node as {
					type?: unknown;
					checked?: unknown;
					children?: unknown;
				};
				if (n.type === "listItem" && typeof n.checked === "boolean")
					sawChecked = true;
				if (Array.isArray(n.children)) for (const c of n.children) walk(c);
			}
		};
		walk(result.value);
		expect(sawChecked).toBe(true);
	});
});

describe("TC-PARSE-003 — opts.sourcePath is accepted (provenance API)", () => {
	test("parseMarkdown accepts { sourcePath } without altering the tree", () => {
		const result = parseMarkdown("hello", { sourcePath: "docs/page.md" });
		expect(result.ok).toBe(true);
		// Provenance is asserted at the classifier site (Phase 4); the tree itself
		// carries no path so the content hash stays path-independent.
		if (!result.ok) throw new Error("expected ok");
		expect(result.value.type).toBe("root");
	});
});

describe("TC-PARSE-004 (PD-8) — parseMarkdown is effectively total; never UnsupportedConstruct", () => {
	// remark-gfm tolerates virtually any input (a genuine throw would be an
	// invariant violation). Across this pathological corpus every parse must
	// return ok; none must surface an UnsupportedConstruct (that arm is for
	// *unrecognized constructs*, not parse failures — DEC-2 / PD-8).
	const corpus = [
		"",
		"#",
		"\x00\x01\x02 binary-ish bytes",
		"```\n```",
		"```mermaid\ngraph TD; A-->B",
		"- [",
		"| a |\n| - |",
		"[".repeat(2000),
		"\udcff\udfff lone surrogates",
		"<".repeat(10000),
		"> ".repeat(2000),
		"<div>raw html</div>",
		"not [a](url at all",
		"\n\n\n",
		"\t\t\t",
	];

	test("every pathological input returns ok", () => {
		for (const input of corpus) {
			const result = parseMarkdown(input);
			expect(result.ok, `input=${JSON.stringify(input.slice(0, 30))}`).toBe(
				true,
			);
		}
	});

	test("parseMarkdown never returns err (total over MS-0002 inputs)", () => {
		for (const input of corpus) {
			expect(parseMarkdown(input).ok).toBe(true);
		}
	});

	test("Uint8Array bytes decode and parse identically to the string form", () => {
		const text = "# Title\n\nbody";
		const fromString = parseMarkdown(text);
		const fromBytes = parseMarkdown(new TextEncoder().encode(text));
		expect(fromString.ok).toBe(true);
		expect(fromBytes.ok).toBe(true);
		if (fromString.ok && fromBytes.ok) {
			expect(JSON.stringify(fromBytes.value)).toBe(
				JSON.stringify(fromString.value),
			);
		}
	});
});
