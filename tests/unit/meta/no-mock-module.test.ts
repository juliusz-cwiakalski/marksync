// Regression guard: ensures no mock.module call syntax exists under tests/.
// The needle is built by concatenation so the guard never self-matches (R-TST-1/D-TST-1).
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Needle built by concatenation to avoid self-match hazard. */
const NEEDLE = ["mock", "module("].join(".");

/**
 * Find all line numbers (1-based) where the needle appears in the given text.
 * Exported so TC-GUARD-002 can test the matcher directly without real usage.
 */
export function findNeedleLines(text: string): number[] {
	const lines = text.split("\n");
	const hits: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(NEEDLE)) {
			hits.push(i + 1); // Convert to 1-based line number
		}
	}

	return hits;
}

describe("TC-GUARD-001: Scan tests/ tree for mock.module call syntax", () => {
	test("should find 0 occurrences under tests/", async () => {
		const repoRoot = join(import.meta.dir, "../../..");
		const testDir = join(repoRoot, "tests");
		const hits: { file: string; line: number }[] = [];

		async function walk(dir: string): Promise<void> {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					await walk(fullPath);
				} else if (entry.isFile() && entry.name.endsWith(".ts")) {
					// Only .ts files execute under bun test
					const text = await Bun.file(fullPath).text();
					const lines = findNeedleLines(text);

					for (const line of lines) {
						hits.push({
							file: fullPath.replace(repoRoot + "/", ""),
							line,
						});
					}
				}
			}
		}

		await walk(testDir);

		if (hits.length > 0) {
			const message = hits.map((h) => `  ${h.file}:${h.line}`).join("\n");
			throw new Error(
				`Found ${hits.length} occurrence(s) of forbidden mock.module API under tests/:\n${message}`,
			);
		}

		expect(hits.length).toBe(0);
	});
});

describe("TC-GUARD-002: Guard matcher self-tests (fixtures via concatenation)", () => {
	test("should detect a reintroduced call-site fixture", () => {
		// Build the call-site via concatenation so the guard's own file stays clean
		const fixtureWithCallSite =
			["mock", "module("].join(".") + '"#app/doctor", () => ({ ... }))';
		const hits = findNeedleLines(fixtureWithCallSite);
		expect(hits.length).toBeGreaterThanOrEqual(1);
	});

	test("should ignore prose-only mention (no false positive)", () => {
		// Prose mentions the API name but not the call syntax
		const proseFixture =
			"// never use mock.module here (process-wide, unscoped)";
		const hits = findNeedleLines(proseFixture);
		expect(hits.length).toBe(0);
	});

	test("should return empty for clean/empty fixture", () => {
		const cleanFixture = "";
		const hits = findNeedleLines(cleanFixture);
		expect(hits.length).toBe(0);
	});
});
