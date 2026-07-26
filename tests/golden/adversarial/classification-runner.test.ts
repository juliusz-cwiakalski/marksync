// Classification runner — fidelity, no-silent-drop, drift stability (GH-31)
// TC-ADVERSARIAL-004/005/006. Real parser/bridge/renderer — no mocks (TDR-0004).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import { findAllUnsupported } from "#domain/markdown/unsupported";
import { renderStorage } from "#infra/confluence/render/storage";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "..", "adversarial");

interface Fixture {
	name: string;
	markdown: string;
	classification: unknown[];
	hasGolden?: boolean;
}

function loadFixtures(): Fixture[] {
	const mds = readdirSync(fixturesDir).filter((f) => f.endsWith(".md"));
	return mds.map((md) => {
		const name = md.replace(/\.md$/, "");
		const classificationPath = join(fixturesDir, `${name}.classification.json`);
		const goldenPath = join(fixturesDir, `${name}.storage.xhtml`);
		const markdown = readFileSync(join(fixturesDir, md), "utf8");
		const classification = JSON.parse(
			readFileSync(classificationPath, "utf8"),
		);

		let hasGolden = false;
		try {
			readFileSync(goldenPath, "utf8");
			hasGolden = true;
		} catch {
			// No golden file
		}

		return { name, markdown, classification, hasGolden };
	});
}

const fixtures = loadFixtures();

describe("TC-ADVERSARIAL-004 (AC-F3-1 / NFR-REL-4) — fidelity", () => {
	for (const fixture of fixtures) {
		test(`fidelity — ${fixture.name}`, () => {
			const hast = mdastToHast(
				parseMarkdown(fixture.markdown, {
					sourcePath: `${fixture.name}.md`,
				}).value as never,
			);
			const result = renderStorage(hast, {
				sourcePath: `${fixture.name}.md`,
			});

			const hasUnsupported = fixture.classification.length > 0;

			if (hasUnsupported) {
				// Error fixture: assert the expected UnsupportedConstruct error
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error.kind).toBe("UnsupportedConstruct");
					const expectedConstruct = (
						fixture.classification as Array<{ construct: string }>
					)[0].construct;
					expect(result.error.construct).toBe(expectedConstruct);
				}
			} else if (fixture.hasGolden) {
				// Success fixture with golden: byte-match
				expect(result.ok).toBe(true);
				if (!result.ok) throw new Error(`render failed for ${fixture.name}`);
				const expected = readFileSync(
					join(fixturesDir, `${fixture.name}.storage.xhtml`),
					"utf8",
				);
				expect(result.value.body).toBe(expected);
			} else {
				// Success fixture without golden: assert succeeds only
				expect(result.ok).toBe(true);
			}
		});
	}
});

describe("TC-ADVERSARIAL-005 (AC-F3-2 / ADR-0005 / F-5) — no silent drop", () => {
	for (const fixture of fixtures) {
		test(`no silent drop — ${fixture.name}`, () => {
			const hast = mdastToHast(
				parseMarkdown(fixture.markdown, {
					sourcePath: `${fixture.name}.md`,
				}).value as never,
			);
			const unsupported = findAllUnsupported(hast, `${fixture.name}.md`);
			const emitted = JSON.stringify(unsupported, null, 2);
			const expected = JSON.stringify(fixture.classification, null, 2);

			expect(emitted).toBe(expected);
		});
	}
});

describe("TC-ADVERSARIAL-006 (AC-F3-3 / DEC-3) — drift stability", () => {
	for (const fixture of fixtures) {
		test(`determinism — ${fixture.name}`, () => {
			// Run classification twice and compare
			const run1 = () => {
				const hast = mdastToHast(
					parseMarkdown(fixture.markdown, {
						sourcePath: `${fixture.name}.md`,
					}).value as never,
				);
				return findAllUnsupported(hast, `${fixture.name}.md`);
			};

			const result1 = run1();
			const result2 = run1();

			const json1 = JSON.stringify(result1, null, 2);
			const json2 = JSON.stringify(result2, null, 2);

			expect(json1).toBe(json2);
			expect(result1).toEqual(result2);
		});
	}
});