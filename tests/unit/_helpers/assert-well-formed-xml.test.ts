// tests/unit/_helpers/assert-well-formed-xml.test.ts
//
// Negative-test suite for the PD-4 XML checker — proves its independence from
// the converter (it must reject every known-malformed shape BEFORE it ever
// validates converter output) and that it does NOT false-positive on real
// converter output. AC-F4-3 mitigation per PD-4.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { assertWellFormedXml } from "../../_helpers/assert-well-formed-xml.ts";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "..", "golden", "fixtures", "markdown");

/** Assert that a body throws (i.e. is rejected as malformed). */
function expectMalformed(body: string): void {
	expect(() => assertWellFormedXml(body)).toThrow();
}

/** Assert that a body is accepted (well-formed). */
function expectWellFormed(body: string): void {
	expect(() => assertWellFormedXml(body)).not.toThrow();
}

describe("PD-4 negative suite — the checker rejects every known-malformed shape", () => {
	test("rejects an unbalanced/unclosed tag", () => {
		expectMalformed("<p>text");
		expectMalformed("<div><p>ok</p>");
	});

	test("rejects a mismatched close tag", () => {
		expectMalformed("<p></div>");
		expectMalformed("<ul><li>a</li></ol>");
	});

	test("rejects a raw `<` outside CDATA/contexts", () => {
		expectMalformed("a < b");
		expectMalformed("text<5 more");
	});

	test("rejects a raw `&` not part of a valid entity", () => {
		expectMalformed("a & b");
		expectMalformed("x &y z");
	});

	test("rejects an unterminated entity", () => {
		expectMalformed("text &amp more");
	});

	test("rejects an unterminated CDATA section", () => {
		expectMalformed(
			"<ac:plain-text-body><![CDATA[never closed</ac:plain-text-body>",
		);
	});

	test("rejects an unterminated comment", () => {
		expectMalformed("<!-- never ends");
	});

	test("rejects a malformed start tag", () => {
		expectMalformed("<5bad>");
		expectMalformed("< =oops>");
	});

	test("accepts well-formed namespaced + self-closing XML", () => {
		expectWellFormed(
			'<ac:image><ri:url ri:value="https://e.com/x?a=1&amp;b=2"/></ac:image>',
		);
		expectWellFormed(
			"<ac:task-list><ac:task><ac:task-status>complete</ac:task-status></ac:task></ac:task-list>",
		);
	});
});

describe("PD-4 positive suite — the checker accepts real converter output (no false positives)", () => {
	const goldens = readdirSync(fixturesDir)
		.filter((f) => f.endsWith(".storage.xhtml"))
		.map((f) => join(fixturesDir, f));

	test("there are committed golden bodies to validate", () => {
		expect(goldens.length).toBeGreaterThanOrEqual(25);
	});

	test("every committed golden body is well-formed XML", () => {
		for (const path of goldens) {
			const body = readFileSync(path, "utf8");
			expect(() => assertWellFormedXml(body), path).not.toThrow();
		}
	});
});
