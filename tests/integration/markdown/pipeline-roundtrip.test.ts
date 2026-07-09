// tests/integration/markdown/pipeline-roundtrip.test.ts
//
// End-to-end pipeline integration — parse → mdastToHast → canonicalize/contentHash
// → renderStorage over every golden fixture (GH-20 F-1..F-4 integration).
// TC-ROUNDTRIP-001 (full pipeline), TC-XML-WF-001 (AC-F4-3 well-formed XML),
// TC-DETERM-001 (AC-F4-5 byte-identical output), TC-DETERM-002 (AC-F3-1 hash).
// Real pipeline — no mocks (TDR-0004 over-mocking guardrail).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import { canonicalize, contentHash } from "#domain/render/canonicalize";
import { renderStorage } from "#infra/confluence/render/storage";
import { assertWellFormedXml } from "../../_helpers/assert-well-formed-xml.ts";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "..", "golden", "fixtures", "markdown");

interface Fixture {
	name: string;
	markdown: string;
}

const fixtures: Fixture[] = readdirSync(fixturesDir)
	.filter((f) => f.endsWith(".md"))
	.map((f) => ({
		name: f.replace(/\.md$/, ""),
		markdown: readFileSync(join(fixturesDir, f), "utf8"),
	}));

/** Run the full pipeline and return the success payload (throws on err). */
function pipeline(src: string, sourcePath: string) {
	const mdast = parseMarkdown(src, { sourcePath });
	if (!mdast.ok) throw new Error("parse failed");
	const hast = mdastToHast(mdast.value);
	const canonical = canonicalize(hast);
	const hash = contentHash(canonical);
	const result = renderStorage(hast, { sourcePath });
	if (!result.ok)
		throw new Error(`render failed: ${JSON.stringify(result.error)}`);
	return { body: result.value.body, hash, warnings: result.value.warnings };
}

describe("TC-ROUNDTRIP-001 — full pipeline round-trips every fixture (F-1..F-4)", () => {
	test("the fixture set covers all 25 golden constructs", () => {
		expect(fixtures.length).toBe(25);
	});

	for (const fixture of fixtures) {
		test(`round-trips ok with a non-empty body + lowercase-hex-64 hash — ${fixture.name}`, () => {
			const out = pipeline(fixture.markdown, `${fixture.name}.md`);
			expect(out.body.length).toBeGreaterThan(0);
			expect(out.hash).toMatch(/^[0-9a-f]{64}$/);
		});
	}
});

describe("TC-XML-WF-001 (AC-F4-3) — every rendered body is well-formed XML", () => {
	for (const fixture of fixtures) {
		test(`well-formed — ${fixture.name}`, () => {
			const out = pipeline(fixture.markdown, `${fixture.name}.md`);
			expect(() => assertWellFormedXml(out.body)).not.toThrow();
		});
	}
});

describe("TC-DETERM-001 (AC-F4-5) — same input → byte-identical output across runs", () => {
	for (const fixture of fixtures) {
		test(`byte-identical across 3 renders — ${fixture.name}`, () => {
			const runs = [0, 1, 2].map(
				() => pipeline(fixture.markdown, `${fixture.name}.md`).body,
			);
			expect(runs[0]).toBe(runs[1]);
			expect(runs[1]).toBe(runs[2]);
		});
	}
});

describe("TC-DETERM-002 (AC-F3-1) — two renders report the identical hash", () => {
	for (const fixture of fixtures) {
		test(`identical hash across renders — ${fixture.name}`, () => {
			const a = pipeline(fixture.markdown, `${fixture.name}.md`);
			const b = pipeline(fixture.markdown, `${fixture.name}.md`);
			expect(a.hash).toBe(b.hash);
		});
	}
});
