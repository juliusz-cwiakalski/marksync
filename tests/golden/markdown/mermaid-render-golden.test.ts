// TC-MERM-002 — golden fixture for the mermaid render policy (AC-1 / F-2).
// A mocked Renderer returns fixed SVG bytes so the hash is deterministic in CI.
// The golden captures the XHTML STRUCTURE (`<ac:image><ri:attachment>`), not the
// SVG bytes (Kroki output is non-deterministic across environments — testing-strategy §"golden").

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mdastToHast } from "#domain/markdown/mdast-to-hast";
import { parseMarkdown } from "#domain/markdown/parse";
import { transform } from "#domain/mermaid/transform";
import { renderStorage } from "#infra/confluence/render/storage";
import { normalizeSvg } from "#domain/mermaid/normalize";
import type { Renderer } from "#domain/mermaid/port";
import type { Artifact, MarkSyncError } from "#domain/target/port";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { MermaidRenderConfig } from "#domain/config/types";

const here = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(here, "..", "fixtures", "markdown");

const SVG = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const d = await crypto.subtle.digest(
		"SHA-256",
		bytes as unknown as ArrayBuffer,
	);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

class StubRenderer implements Renderer {
	async render(
		_source: string,
		_config: MermaidRenderConfig,
	): Promise<Result<Artifact, MarkSyncError>> {
		const hash = await sha256Hex(SVG);
		return Res.ok({ bytes: SVG, mime: "image/svg+xml", hash, kind: "mermaid" });
	}
}

const RENDER_CONFIG: MermaidRenderConfig = {
	policy: "render",
	securityLevel: "strict",
	htmlLabels: false,
	deterministicIds: true,
};

const MARKDOWN = `# Mermaid Render Policy

\`\`\`mermaid
graph TD
A-->B
\`\`\`
`;

describe("TC-MERM-002 golden fixture — mermaid render policy (AC-1 / F-2)", () => {
	test("rendered Storage XHTML byte-matches the committed golden fixture", async () => {
		const mdast = parseMarkdown(MARKDOWN, {
			sourcePath: "mermaid-render-policy.md",
		}).value as never;
		const hast = mdastToHast(mdast);

		const transformResult = await transform(
			hast,
			RENDER_CONFIG,
			new StubRenderer(),
			"mermaid-render-policy.md",
		);
		expect(transformResult.ok).toBe(true);

		const renderResult = renderStorage(
			transformResult.ok ? transformResult.value.transformedHast : hast,
			{ sourcePath: "mermaid-render-policy.md" },
		);
		expect(renderResult.ok).toBe(true);
		if (!renderResult.ok) throw new Error("render failed");

		const golden = readFileSync(
			join(fixturesDir, "mermaid-render-policy.storage.xhtml"),
			"utf8",
		);

		expect(renderResult.value.body).toBe(golden);
		expect(renderResult.value.body).toContain(
			'<ac:image ac:alt="Mermaid diagram"><ri:attachment ri:filename="marksync-mermaid-',
		);
		expect(renderResult.value.body).toMatch(
			/marksync-mermaid-[a-f0-9]{64}\.svg/,
		);
	});

	test("snapshot layer — byte-stable across 3 identical runs", async () => {
		const outputs: string[] = [];
		for (let i = 0; i < 3; i++) {
			const mdast = parseMarkdown(MARKDOWN, {
				sourcePath: "mermaid-render-policy.md",
			}).value as never;
			const hast = mdastToHast(mdast);
			const t = await transform(
				hast,
				RENDER_CONFIG,
				new StubRenderer(),
				"mermaid-render-policy.md",
			);
			const r = renderStorage(t.ok ? t.value.transformedHast : hast, {
				sourcePath: "mermaid-render-policy.md",
			});
			if (!r.ok) throw new Error("render failed");
			outputs.push(r.value.body);
		}
		expect(outputs[0]).toBe(outputs[1]);
		expect(outputs[1]).toBe(outputs[2]);
	});
});

describe("TC-MERM-NORM-003 normalized SVG has 0 structural differences (AC-F2-2 / NFR-6)", () => {
	test("normalization preserves semantic structure (paths, text, shapes)", () => {
		const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
			<!-- comment -->
			<rect id="random-123" x="0" y="0" width="100" height="100" fill="blue"/>
			<text x="50" y="50">Hello</text>
			<path d="M0 0 L100 100"/>
		</svg>`;

		const normalized = normalizeSvg(rawSvg);

		// Semantic elements preserved
		expect(normalized).toContain("<rect");
		expect(normalized).toContain("<text");
		expect(normalized).toContain("<path");
		expect(normalized).toContain("Hello");
		expect(normalized).toContain('fill="blue"');

		// Non-deterministic elements stripped
		expect(normalized).not.toContain("<!--");
		expect(normalized).not.toContain("random-123");
		expect(normalized).not.toContain("comment");

		// Whitespace normalized
		expect(normalized).not.toMatch(/\n\s*/);
	});

	test("attribute order normalized but values preserved", () => {
		const rawSvg = `<svg><rect id="abc" x="0" y="10" width="100" height="50"/></svg>`;
		const normalized = normalizeSvg(rawSvg);

		// All attribute values preserved
		expect(normalized).toContain('height="50"');
		expect(normalized).toContain('width="100"');
		expect(normalized).toContain('x="0"');
		expect(normalized).toContain('y="10"');

		// Attributes sorted alphabetically
		expect(normalized).toMatch(
			/<rect height="50" id="eid\d+" width="100" x="0" y="10"\/>/,
		);
	});

	test("ID references updated correctly", () => {
		const rawSvg = `<svg>
			<defs>
				<linearGradient id="grad-abc">
					<stop offset="0%" stop-color="red"/>
				</linearGradient>
			</defs>
			<rect fill="url(#grad-abc)" x="0" y="0" width="100" height="100"/>
		</svg>`;

		const normalized = normalizeSvg(rawSvg);

		// Original ID replaced
		expect(normalized).not.toContain("grad-abc");
		expect(normalized).toContain('id="eid0"');

		// Reference updated
		expect(normalized).toContain('fill="url(#eid0)"');
	});
});
