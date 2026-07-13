// tests/golden/markdown/injection-safety.test.ts
//
// Injection-safety property tests — NFR-SEC-5 / AC-F4-4. Proves malicious
// Markdown cannot inject server-side <ac:structured-macro> from source text or
// emit executable content, that raw inline HTML is escaped (DEC-4 / NFR-8), and
// that task-list + regular-list mixing surfaces a warning (DEC-5 / NFR-9). Real
// parser/bridge/renderer — no mocks (TDR-0004 over-mocking guardrail).

import { describe, expect, test } from "bun:test";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import { renderStorage } from "#infra/confluence/render/storage";
import { assertWellFormedXml } from "../../_helpers/assert-well-formed-xml.ts";

/** Run the full parse → bridge → render pipeline; throws if it does not return ok. */
function render(src: string): {
	body: string;
	hash: string;
	warnings: string[];
} {
	const hast = mdastToHast(parseMarkdown(src).value as never);
	const result = renderStorage(hast, { sourcePath: "inject.md" });
	if (!result.ok)
		throw new Error(
			`unexpected UnsupportedConstruct: ${JSON.stringify(result.error)}`,
		);
	return result.value;
}

/** Count non-overlapping occurrences of a needle in a haystack. */
function count(haystack: string, needle: string): number {
	let n = 0;
	let i = 0;
	for (;;) {
		const at = haystack.indexOf(needle, i);
		if (at === -1) break;
		n++;
		i = at + needle.length;
	}
	return n;
}

/** Count occurrences OUTSIDE CDATA sections (i.e. real XML elements, not inert text). */
function countOutsideCdata(haystack: string, needle: string): number {
	const stripped = haystack.replaceAll(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
	return count(stripped, needle);
}

describe("TC-INJECT-001 (AC-F4-4) — macro XML in source text is escaped, never injected", () => {
	const src =
		'Look at this macro: <ac:structured-macro ac:name="code"><ac:parameter ac:name="language">x</ac:parameter><ac:plain-text-body>evil</ac:plain-text-body></ac:structured-macro> end.\n';
	const body = render(src).body;

	test("0 source-derived <ac:structured-macro> elements survive in output", () => {
		// The text macro XML must be escaped to inert text — no injected server macro.
		expect(count(body, "<ac:structured-macro")).toBe(0);
		expect(body).toContain("&lt;ac:structured-macro");
	});

	test("0 source-derived ac:parameter / ac:plain-text-body tags survive", () => {
		expect(count(body, "<ac:parameter")).toBe(0);
		expect(count(body, "<ac:plain-text-body")).toBe(0);
	});
});

describe("TC-INJECT-002 (AC-F4-4) — <script> in source text yields 0 executable content", () => {
	const body = render("Run this: <script>alert(1)</script> please.\n").body;

	test("no <script> tag survives (escaped to inert text)", () => {
		expect(count(body, "<script")).toBe(0);
		expect(body).toContain("&lt;script&gt;");
	});
});

describe("TC-INJECT-003 — a code fence whose body IS the macro XML is wrapped in the converter's own CDATA", () => {
	// A fenced ``` block whose body literally contains the macro XML is the converter
	// emitting, not injecting: the body sits inside the converter's exactly-one
	// ac:structured-macro code macro, wrapped in CDATA.
	const fence =
		'```\n<ac:structured-macro ac:name="code">evil</ac:structured-macro>\n```\n';
	const body = render(fence).body;

	test("exactly one ac:structured-macro — the converter's own code macro", () => {
		// Count real elements (outside CDATA): only the converter's code macro.
		// The macro-shaped source text is inside CDATA (inert), counted separately.
		expect(countOutsideCdata(body, "<ac:structured-macro")).toBe(1);
	});

	test("the malicious XML is inside CDATA, not parsed as a tag", () => {
		expect(body).toContain("<ac:plain-text-body><![CDATA[");
		// The macro-shaped text inside CDATA is preserved verbatim (literal < / >),
		// not escaped — CDATA keeps it inert as code content.
		expect(body).toContain('<ac:structured-macro ac:name="code">evil');
	});
});

describe("TC-RAWHTML-001 (DEC-4 / NFR-8) — raw inline HTML is escaped, 0 bytes passthrough", () => {
	const body = render("This is <b>raw</b> inline HTML.\n").body;

	test("the <b>/</b> tags are escaped to inert entities", () => {
		expect(body).toContain("&lt;b&gt;raw&lt;/b&gt;");
	});

	test("0 raw <b> tags pass through", () => {
		expect(count(body, "<b>")).toBe(0);
		expect(count(body, "</b>")).toBe(0);
	});
});

describe("TC-TASKMIX-001 (DEC-5 / NFR-9) — task-list + regular-list mixing emits a warning", () => {
	// A single list mixing a task item with a regular item is unrepresentable
	// (spike rule #3) — the converter surfaces it rather than emitting wrong output.
	const { warnings } = render("- [ ] todo\n- regular\n");

	test("a deterministic mixing warning is present", () => {
		expect(warnings).toContain(
			"task-list mixed with regular list items — unrepresentable",
		);
	});

	test("a clean task-list emits no warning (no false positive)", () => {
		const clean = render("- [ ] a\n- [x] b\n");
		expect(clean.warnings).toEqual([]);
	});
});

describe("TC-MERM-INJECT (GH-25 AC-F3-1 / NFR-SEC-5) — adversarial mermaid payloads are inert in code macro", () => {
	test("TC-MERM-003: script payload — 0 <script> tags outside CDATA", () => {
		const src = "```mermaid\ngraph TD; A[<script>alert(1)</script>];\n```\n";
		const body = render(src).body;
		expect(countOutsideCdata(body, "<script")).toBe(0);
		expect(body).toContain("<script>alert(1)</script>");
	});

	test("TC-MERM-004: onerror payload — 0 live on* handlers outside CDATA", () => {
		const src = "```mermaid\ngraph TD; A[<img src=x onerror=alert(1)>];\n```\n";
		const body = render(src).body;
		// Count onerror, onclick, onload — all must be 0 outside CDATA.
		expect(countOutsideCdata(body, "onerror=")).toBe(0);
		expect(countOutsideCdata(body, "onclick=")).toBe(0);
		expect(countOutsideCdata(body, "onload=")).toBe(0);
		expect(body).toContain("onerror=alert(1)");
	});

	test("TC-MERM-005: javascript: URI payload — 0 javascript: URIs outside CDATA", () => {
		const src =
			'```mermaid\ngraph TD; A["<a href=javascript:alert(1)>click</a>"];\n```\n';
		const body = render(src).body;
		expect(countOutsideCdata(body, "javascript:")).toBe(0);
		expect(body).toContain("javascript:alert(1)");
	});

	test("TC-MERM-006: CDATA breakout sequence ]]> is split, no actual termination", () => {
		const src = '```mermaid\ngraph TD; A["Hello]]>World"];\n```\n';
		const body = render(src).body;

		// The ]]> sequence is split by the cdata() helper into ]] ]]>.
		// This prevents actual CDATA termination and keeps the output well-formed.
		expect(body).toContain("Hello]]]]><![CDATA[>World");

		// Verify the original text appears somewhere (the sequence is split but preserved).
		expect(body).toContain("Hello");
		expect(body).toContain("World");

		// Verify the output is well-formed XML (test-plan §5.2 / Phase-3 AC-F3-1).
		expect(() => assertWellFormedXml(body)).not.toThrow();
	});
});
