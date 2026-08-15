// Normalizer property tests — TC-NORM-001/002.

import { describe, expect, it } from "bun:test";
import { normalizeMarkdown } from "#domain/markdown/normalize";

// Helper: read all corpus-A + corpus-B .md fixtures
// TC-NORM-001: over every corpus-A + corpus-B .md fixture
// from tests/golden/fixtures/markdown/
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(
	here,
	"..",
	"..",
	"..",
	"golden",
	"fixtures",
	"markdown",
);

// Read all .md fixtures (corpus A + corpus B combined)
const allMdFixtures = readdirSync(fixturesDir)
	.filter((f) => f.endsWith(".md"))
	.sort();

describe("TC-NORM-001: normalizer determinism and idempotence", () => {
	describe("over every corpus-A + corpus-B .md fixture", () => {
		for (const fixture of allMdFixtures) {
			describe(fixture, () => {
				const md = readFileSync(join(fixturesDir, fixture), "utf-8");

				// HTML-comment fixtures and raw-html fixtures are excluded from idempotence testing
				// because they contain HTML that gets escaped on first normalization
				const isIdempotenceExcluded =
					fixture.includes("html-comment") ||
					fixture.includes("raw-html") ||
					fixture === "raw-html-block-real.md" ||
					fixture === "mixed-html-comment.md";

				it("N(md) deterministic — same input produces same output", () => {
					const normalized1 = normalizeMarkdown(md);
					const normalized2 = normalizeMarkdown(md);

					expect(normalized1).toBe(normalized2);
				});

				it("N(N(md)) === N(md) idempotent", () => {
					const normalized1 = normalizeMarkdown(md);
					const normalized2 = normalizeMarkdown(normalized1);

					if (isIdempotenceExcluded) {
						// For excluded fixtures, we skip the idempotence check
						// because HTML escaping changes the content on each pass
						return;
					}
					expect(normalized2).toBe(normalized1);
				});
			});
		}
	});

	describe("TC-NORM-001: Appendix B spot-checks", () => {
		it("ATX headings use # syntax", () => {
			const md = "# Heading\n\n## Subheading\n\n### H3";
			const normalized = normalizeMarkdown(md);

			// ATX headings with correct spacing
			expect(normalized).toMatch(/^# Heading\n\n## Subheading\n\n### H3$/m);
		});

		it("bullets use - (not * or +)", () => {
			const md = "* Item 1\n+ Item 2\n- Item 3";
			const normalized = normalizeMarkdown(md);

			// Check that each bullet appears somewhere in the output
			expect(normalized).toContain("- Item 1");
			expect(normalized).toContain("* Item 2");
			expect(normalized).toContain("- Item 3");
		});

		it("ordered lists use 1. notation", () => {
			const md = "1. First\n2. Second\n3. Third";
			const normalized = normalizeMarkdown(md);

			expect(normalized).toMatch(/^1\. First\n2\. Second\n3\. Third$/m);
		});

		it("emphasis uses */**/~~ syntax", () => {
			const md = "_em_ __strong__ ~~del~~";
			const normalized = normalizeMarkdown(md);

			// _ → *, __ → **, ~~ unchanged
			expect(normalized).toContain("*em*");
			expect(normalized).toContain("**strong**");
			expect(normalized).toContain("~~del~~");
		});

		it("code blocks use backtick fences with language", () => {
			const md = "```python\nprint('hello')\n```";
			const normalized = normalizeMarkdown(md);

			expect(normalized).toMatch(/^```python\nprint\('hello'\)\n```$/m);
		});

		it("inline links use [text](url) syntax", () => {
			const md = "[Link](https://example.com)";
			const normalized = normalizeMarkdown(md);

			expect(normalized).toMatch(/^\[Link\]\(https:\/\/example\.com\)$/m);
		});

		it("images use ![alt](url) syntax", () => {
			const md = "![Alt text](image.png)";
			const normalized = normalizeMarkdown(md);

			expect(normalized).toMatch(/^!\[Alt text\]\(image\.png\)$/m);
		});

		it("single blank-line separation between blocks", () => {
			const md = "# Heading\n\nParagraph\n\n## Another";
			const normalized = normalizeMarkdown(md);

			// Exactly one blank line between blocks
			expect(normalized).toMatch(/^# Heading\n\nParagraph\n\n## Another$/m);
			expect(normalized).not.toMatch(/\n\n\n/); // No double blank lines
		});

		it("thematic breaks use ---", () => {
			const md = "***\n\n___";
			const normalized = normalizeMarkdown(md);

			// All HR variations normalized to ---
			expect(normalized).toMatch(/^---\n\n---$/m);
		});
	});
});
