// tests/golden/markdown/storage-renderer.test.ts
//
// Golden fidelity — every remark-gfm-reachable GFM construct byte-matches its
// committed `.storage.xhtml` snapshot (GH-20 F-4/F-6, AC-F4-1/NFR-REL-4;
// `<sub>`/`<sup>` excluded per PM-DEC-1 — covered by the defensive unit test).
// TC-GOLDEN-<construct> (×25) + TC-CODE-MACRO-001. Real parser/bridge/renderer
// — no mocks (TDR-0004 over-mocking guardrail). Two pinning layers per the
// cli-output.snapshot.test.ts precedent: the committed `.storage.xhtml` file
// (byte-exact) + a Bun `toMatchSnapshot` regression layer.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import { renderStorage } from "#infra/confluence/render/storage";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "fixtures", "markdown");

interface Fixture {
	name: string;
	markdown: string;
	expected: string;
	isErrorFixture?: boolean;
	errorConstruct?: string;
}

/** Load every committed `.md` + `.storage.xhtml` pair as a golden fixture. */
function loadFixtures(): Fixture[] {
	const mds = readdirSync(fixturesDir).filter((f) => f.endsWith(".md"));
	return mds.map((md) => {
		const name = md.replace(/\.md$/, "");
		const errorPath = join(fixturesDir, `${name}.unsupported.txt`);
		let expected = "";
		let isErrorFixture = false;
		let errorConstruct = "";

		try {
			// Try to read the error sidecar
			errorConstruct = readFileSync(errorPath, "utf8").trim();
			isErrorFixture = true;
		} catch {
			// No error sidecar: read the expected storage XHTML
			expected = readFileSync(
				join(fixturesDir, `${name}.storage.xhtml`),
				"utf8",
			);
		}

		const markdown = readFileSync(join(fixturesDir, md), "utf8");
		return { name, markdown, expected, isErrorFixture, errorConstruct };
	});
}

const fixtures = loadFixtures();

describe("TC-GOLDEN (AC-F4-1 / NFR-REL-4) — remark-gfm-reachable fixtures byte-match goldens", () => {
	test("the golden set is the re-baselined 33 (PM-DEC-1; sub/sup excluded; GH-25 +1 mermaid-code-policy; GH-63 +1 frontmatter; GH-77 +6 comment/regression fixtures)", () => {
		// Locks the fidelity bar: exactly the 33 remark-gfm-reachable pairs.
		expect(fixtures.length).toBe(33);
		expect(fixtures.map((f) => f.name).sort()).toContain("kitchensink");
	});

	for (const fixture of fixtures) {
		test(`byte-exact + snapshot — ${fixture.name}`, () => {
			const hast = mdastToHast(
				parseMarkdown(fixture.markdown, { sourcePath: `${fixture.name}.md` })
					.value as never,
			);
			const result = renderStorage(hast, { sourcePath: `${fixture.name}.md` });

			if (fixture.isErrorFixture) {
				// Error fixture: assert the expected UnsupportedConstruct error
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error.kind).toBe("UnsupportedConstruct");
					expect(result.error.construct).toBe(fixture.errorConstruct);
				}
			} else {
				// Success fixture: assert byte-exact match + snapshot
				expect(result.ok).toBe(true);
				if (!result.ok) throw new Error(`render failed for ${fixture.name}`);
				expect(result.value.body).toBe(fixture.expected);
				expect(result.value.body).toMatchSnapshot(`${fixture.name}.storage`);
			}
		});
	}
});

describe("TC-CODE-MACRO-001 (AC-F4-2) — CDATA code bodies; 0× schema-version/macro-id", () => {
	const codeFixtures = fixtures.filter(
		(f) =>
			f.expected.includes("ac:structured-macro") &&
			f.name.startsWith("code-block"),
	);

	test("every fenced-code fixture emits a code macro with a CDATA plain-text-body", () => {
		expect(codeFixtures.length).toBeGreaterThanOrEqual(1);
		for (const f of codeFixtures) {
			expect(f.expected).toContain('<ac:structured-macro ac:name="code">');
			expect(f.expected).toMatch(
				/<ac:plain-text-body><!\[CDATA\[[\s\S]*\]\]><\/ac:plain-text-body>/,
			);
		}
	});

	test("across ALL rendered bodies, ac:schema-version and ac:macro-id appear 0 times", () => {
		for (const f of fixtures) {
			expect(f.expected, `${f.name}`).not.toContain("ac:schema-version");
			expect(f.expected, `${f.name}`).not.toContain("ac:macro-id");
		}
	});

	test("the mermaid fence is emitted as a code macro (detection-only — NG-2)", () => {
		const mermaid = fixtures.find((f) => f.name === "code-block-mermaid");
		expect(mermaid?.expected).toContain(
			'<ac:parameter ac:name="language">mermaid</ac:parameter>',
		);
	});
});

describe("TC-MERM-001/002 (GH-25 AC-F2-1/AC-F2-2 / NFR-2) — mermaid fence preservation + byte-stability", () => {
	test("TC-MERM-001: mermaid fence emits code macro with language=mermaid + CDATA body", () => {
		const mermaid = fixtures.find((f) => f.name === "mermaid-code-policy");
		expect(mermaid).toBeDefined();
		expect(mermaid?.expected).toContain('<ac:structured-macro ac:name="code">');
		expect(mermaid?.expected).toContain(
			'<ac:parameter ac:name="language">mermaid</ac:parameter>',
		);
		expect(mermaid?.expected).toContain("<ac:plain-text-body><![CDATA[");
		expect(mermaid?.expected).toContain("]]></ac:plain-text-body>");
	});

	test("TC-MERM-002: same mermaid input N=3 renders → byte-identical (0 bytes diff)", () => {
		const mermaid = fixtures.find((f) => f.name === "mermaid-code-policy");
		expect(mermaid).toBeDefined();

		const outputs: string[] = [];
		for (let i = 0; i < 3; i++) {
			const hast = mdastToHast(
				parseMarkdown(mermaid!.markdown, {
					sourcePath: "mermaid-code-policy.md",
				}).value as never,
			);
			const result = renderStorage(hast, {
				sourcePath: "mermaid-code-policy.md",
			});
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("render failed");
			outputs.push(result.value.body);
		}

		expect(outputs[0]).toBe(outputs[1]);
		expect(outputs[1]).toBe(outputs[2]);
	});
});
