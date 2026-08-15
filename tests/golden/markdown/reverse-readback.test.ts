// Read-back fixture tests — TC-RT-006..009.
// Panel strip, mermaid unwrap, K1 tolerance, render-policy artifact.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { reverseStorage } from "#infra/confluence/parse/reverse";
import { normalizeMarkdown } from "#domain/markdown/normalize";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "fixtures", "markdown");
const reverseDir = join(fixturesDir, "reverse");

describe("TC-RT-006: provenance-panel strip", () => {
	it("provenance-panel alone → empty Markdown, 0 diagnostics", () => {
		const storage = readFileSync(
			join(fixturesDir, "provenance-panel.storage.xhtml"),
			"utf-8",
		);

		const result = reverseStorage(storage);
		expect(result.ok).toBe(true);
		expect(result.value.markdown).toBe("");
		expect(result.value.diagnostics).toEqual([]);
	});

	it("readback-realistic → byte-equals normalizeMarkdown(kitchensink.md), 0 marker traces", () => {
		const storage = readFileSync(
			join(fixturesDir, "readback-realistic.storage.xhtml"),
			"utf-8",
		);
		const kitchensinkMd = readFileSync(
			join(fixturesDir, "kitchensink.md"),
			"utf-8",
		);

		const result = reverseStorage(storage);
		expect(result.ok).toBe(true);

		const expected = normalizeMarkdown(kitchensinkMd);
		expect(result.value.markdown).toBe(expected);

		// No traces of the marker or panel elements
		expect(result.value.markdown).not.toMatch(/marksync:provenance-panel/);
		expect(result.value.markdown).not.toMatch(/ac:structured-macro/);
		expect(result.value.markdown).not.toMatch(/ac:rich-text-body/);
		expect(result.value.markdown).not.toMatch(/Source:/);
		expect(result.value.markdown).not.toMatch(/Git revision:/);
		expect(result.value.markdown).not.toMatch(/Last sync:/);
	});
});

describe("TC-RT-007: mermaid code-macro unwrap", () => {
	const mermaidFixtures = [
		"code-block-mermaid",
		"mermaid-code-policy",
		// mermaid-code-policy-k1 is in storageOnly, has no .md twin
	];

	for (const name of mermaidFixtures) {
		describe(name, () => {
			it("fence bytes ≡ CDATA content, 0 wrapper artifacts", () => {
				const md = readFileSync(join(fixturesDir, `${name}.md`), "utf-8");
				const storage = readFileSync(
					join(fixturesDir, `${name}.storage.xhtml`),
					"utf-8",
				);

				const result = reverseStorage(storage);
				expect(result.ok).toBe(true);

				// Extract CDATA content from Storage
				const cdataMatch = storage.match(
					/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/,
				);
				expect(cdataMatch).toBeTruthy();
				const cdataContent = cdataMatch![1];

				// Extract fence content from Markdown
				const fenceMatch = result.value.markdown.match(/```(?:mermaid)?\n([\s\S]*?)\n```/);
				expect(fenceMatch).toBeTruthy();
				const fenceContent = fenceMatch![1];

				// Byte-identical (except normalized newlines)
				expect(fenceContent.replace(/\r\n/g, "\n")).toBe(
					cdataContent.replace(/\r\n/g, "\n"),
				);

				// No macro wrapper artifacts
				expect(result.value.markdown).not.toMatch(/ac:structured-macro/);
				expect(result.value.markdown).not.toMatch(/ac:plain-text-body/);
			});
		});
	}
});

describe("TC-RT-008: K1 attribute tolerance", () => {
	const k1Fixtures = ["code-block-python-k1", "mermaid-code-policy-k1"];

	for (const name of k1Fixtures) {
		describe(name, () => {
			const storage = readFileSync(
				join(fixturesDir, `${name}.storage.xhtml`),
				"utf-8",
			);

			// Generate the K1-free variant by removing K1 attributes
			const k1FreeStorage = storage
				.replace(/ ac:schema-version="[^"]*"/g, "")
				.replace(/ ac:macro-id="[^"]*"/g, "");

			it("output ≡ attr-free variant, 0 diagnostics", () => {
				const resultK1 = reverseStorage(storage);
				const resultK1Free = reverseStorage(k1FreeStorage);

				expect(resultK1.ok).toBe(true);
				expect(resultK1Free.ok).toBe(true);

				expect(resultK1.value.markdown).toBe(resultK1Free.value.markdown);
				expect(resultK1.value.diagnostics).toEqual([]);
			});

			it("ac:schema-version and ac:macro-id never in output", () => {
				const result = reverseStorage(storage);
				expect(result.ok).toBe(true);

				expect(result.value.markdown).not.toMatch(/ac:schema-version/);
				expect(result.value.markdown).not.toMatch(/ac:macro-id/);
			});
		});
	}
});

describe("TC-RT-009: render-policy synthetic image", () => {
	it("success, exactly one informational diagnostic, heading present", () => {
		const storage = readFileSync(
			join(fixturesDir, "mermaid-render-policy.storage.xhtml"),
			"utf-8",
		);

		const result = reverseStorage(storage);
		expect(result.ok).toBe(true);

		// Exactly one informational diagnostic
		expect(result.value.diagnostics).toHaveLength(1);
		expect(result.value.diagnostics[0].severity).toBe("informational");
		expect(result.value.diagnostics[0].class).toBe("marksync-synthetic-artifact");
		expect(result.value.diagnostics[0].code).toBe("marksync/synthetic-artifact");
		expect(result.value.diagnostics[0].construct).toBe(
			"ac:image (mermaid render policy)",
		);
		expect(result.value.diagnostics[0].location).toBeDefined();

		// Heading present (the image was dropped)
		expect(result.value.markdown).toMatch(/^# Mermaid Render Policy\s*$/);
	});

	it("no image elements or mermaid traces in output", () => {
		const storage = readFileSync(
			join(fixturesDir, "mermaid-render-policy.storage.xhtml"),
			"utf-8",
		);

		const result = reverseStorage(storage);
		expect(result.ok).toBe(true);

		// No image elements in output
		expect(result.value.markdown).not.toMatch(/!\[/);
		expect(result.value.markdown).not.toMatch(/marksync-mermaid-/);
		expect(result.value.markdown).not.toMatch(/ac:image/);
		expect(result.value.markdown).not.toMatch(/ri:attachment/);
	});

	it("sidecar deep-compare", () => {
		const storage = readFileSync(
			join(fixturesDir, "mermaid-render-policy.storage.xhtml"),
			"utf-8",
		);
		const expectedDiagnostics = JSON.parse(
			readFileSync(join(reverseDir, "mermaid-render-policy.json"), "utf-8"),
		);

		const result = reverseStorage(storage);
		expect(result.ok).toBe(true);

		expect(result.value.diagnostics).toEqual(expectedDiagnostics);
	});
});