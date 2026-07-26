// Corpus inventory — verify all 6 required categories (GH-31)
// TC-ADVERSARIAL-001 (AC-F1-1).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";

const here = dirname(new URL(import.meta.url).pathname);
const adversarialDir = join(here, "..", "..", "adversarial");

interface Fixture {
	name: string;
	classification: unknown[];
	content: string;
}

function loadFixtures(): Fixture[] {
	const mds = readdirSync(adversarialDir).filter((f) => f.endsWith(".md"));
	return mds.map((md) => {
		const name = md.replace(/\.md$/, "");
		const classificationPath = join(
			adversarialDir,
			`${name}.classification.json`,
		);
		const content = readFileSync(join(adversarialDir, md), "utf8");
		const classification = JSON.parse(readFileSync(classificationPath, "utf8"));
		return { name, content, classification };
	});
}

const fixtures = loadFixtures();

describe("TC-ADVERSARIAL-001 (AC-F1-1) — corpus category coverage inventory", () => {
	test("nested tables category is represented", () => {
		const coveringFixtures = fixtures.filter(
			(f) =>
				f.name === "nested-tables" ||
				(f.classification as Array<{ construct: string }>).some(
					(c) => c.construct === "raw-html-block",
				),
		);
		expect(coveringFixtures.length).toBeGreaterThan(0);
		const names = coveringFixtures.map((f) => f.name).join(", ");
		expect(names).toContain("nested-tables");
	});

	test("≥3 distinct macro/app-content categories are represented", () => {
		const macroFixtures = fixtures.filter(
			(f) => f.name.startsWith("macro-") || f.name.startsWith("app-"),
		);
		expect(macroFixtures.length).toBeGreaterThanOrEqual(3);

		// Extract distinct category names from fixture names
		const allowedCategories = [
			"toc",
			"info",
			"code",
			"expand",
			"jira",
			"gliffy",
		];
		const categories = new Set<string>();
		for (const fixture of macroFixtures) {
			const match = fixture.name.match(
				/macro-(toc|info|code|expand|jira)|app-(gliffy)/,
			);
			if (match) {
				const category = match[1] || match[2];
				if (category) {
					categories.add(category);
				}
			}
		}

		// Require ≥3 distinct categories (not just ≥3 fixtures)
		expect(categories.size).toBeGreaterThanOrEqual(3);
		for (const category of categories) {
			expect(allowedCategories).toContain(category);
		}
	});

	test("emoji category is represented", () => {
		const emojiFixture = fixtures.find((f) => f.name === "emoji");
		expect(emojiFixture).toBeDefined();
		// Check for common emoji characters (avoiding range issues)
		const content = emojiFixture?.content || "";
		const hasEmoji =
			content.includes("✅") ||
			content.includes("❌") ||
			content.includes("⚠️") ||
			content.includes("ℹ️") ||
			content.includes("🔥") ||
			content.includes("💡") ||
			content.includes("🎯") ||
			content.includes("🚀");
		expect(hasEmoji).toBe(true);
	});

	test("≥1 long page (≥50 KB or ≥1000 lines) is represented", () => {
		const longPageFixture = fixtures.find((f) => f.name === "long-page");
		expect(longPageFixture).toBeDefined();
		const lineCount = longPageFixture?.content.split("\n").length || 0;
		const byteSize = Buffer.byteLength(longPageFixture?.content || "", "utf8");
		expect(
			lineCount >= 1000 || byteSize >= 50 * 1024,
			`Long page has ${lineCount} lines and ${byteSize} bytes`,
		).toBe(true);
	});

	test("mixed task/regular lists category is represented", () => {
		const mixedFixture = fixtures.find(
			(f) => f.name === "mixed-task-regular-lists",
		);
		expect(mixedFixture).toBeDefined();
		const content = mixedFixture?.content || "";
		const hasTaskList = content.includes("- [ ]") || content.includes("- [x]");
		const hasRegularList = content.includes("- ") || content.includes("1. ");
		expect(hasTaskList && hasRegularList).toBe(true);
	});

	test("raw HTML (block + inline) category is represented", () => {
		const blockFixture = fixtures.find((f) => f.name === "raw-html-block");
		const inlineFixture = fixtures.find((f) => f.name === "raw-html-inline");

		expect(blockFixture).toBeDefined();
		expect(inlineFixture).toBeDefined();

		const blockClassifications = blockFixture?.classification as Array<{
			construct: string;
		}>;
		expect(
			blockClassifications.some((c) => c.construct === "raw-html-block"),
		).toBe(true);

		const inlineClassifications = inlineFixture?.classification as Array<{
			construct: string;
		}>;
		expect(inlineClassifications.length).toBe(0); // Inline HTML is escaped
	});

	test("category coverage floor met (corpus is category-complete at current size)", () => {
		// The corpus is 12 fixtures, covering all 6 required categories.
		// This is below the ~20-40 aspirational target but meets the AC-F1-1
		// requirement for category coverage, not raw fixture count.
		expect(fixtures.length).toBeGreaterThanOrEqual(12);
		expect(fixtures.length).toBeLessThanOrEqual(40);
	});
});
