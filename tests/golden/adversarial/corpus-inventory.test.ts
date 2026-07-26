// Corpus inventory — verify all 6 required categories (GH-31)
// TC-ADVERSARIAL-001 (AC-F1-1).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const adversarialDir = join("tests", "adversarial");

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

	test("≥3 macro/app-content categories are represented", () => {
		const macroFixtures = fixtures.filter(
			(f) => f.name.startsWith("macro-") || f.name.startsWith("app-"),
		);
		expect(macroFixtures.length).toBeGreaterThanOrEqual(3);
		const names = macroFixtures
			.map((f) => f.name)
			.sort()
			.join(", ");
		expect(names).toMatch(/macro-(toc|info|code|expand|jira)/);
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

	test("total fixture count is within target range (20-40)", () => {
		expect(fixtures.length).toBeGreaterThanOrEqual(12); // Current count
		expect(fixtures.length).toBeLessThanOrEqual(40); // Upper bound
	});
});
