// Unit tests for SVG normalization (TC-MERM-NORM-002, TC-MERM-NORM-001).

import { describe, expect, test } from "bun:test";
import { normalizeSvg } from "#domain/mermaid/normalize";

describe("TC-MERM-NORM-002 normalization rules (AC-F2-1 / NFR-6)", () => {
	test("Rule 1: strip XML comments", () => {
		const raw = "<svg><!-- comment --><rect/></svg>";
		const norm = normalizeSvg(raw);
		expect(norm).not.toContain("<!--");
		expect(norm).not.toContain("-->");
		expect(norm).toBe("<svg><rect/></svg>");
	});

	test("Rule 2: sort attributes per element", () => {
		const raw = '<rect z="1" y="10" width="100" x="0"/>';
		const norm = normalizeSvg(raw);
		expect(norm).toBe('<rect width="100" x="0" y="10" z="1"/>');
	});

	test("Rule 3: rewrite ephemeral IDs to stable sequence", () => {
		const raw = '<rect id="flowchart-abc-123"/><rect id="flowchart-def-456"/>';
		const norm = normalizeSvg(raw);
		expect(norm).toContain('id="eid0"');
		expect(norm).toContain('id="eid1"');
		expect(norm).not.toContain("flowchart-abc-123");
		expect(norm).not.toContain("flowchart-def-456");
	});

	test("Rule 3: update url(#...) references", () => {
		const raw =
			'<defs><clipPath id="flowchart-abc-123"/></defs><rect clip-path="url(#flowchart-abc-123)"/>';
		const norm = normalizeSvg(raw);
		expect(norm).toContain('id="eid0"');
		expect(norm).toContain('clip-path="url(#eid0)"');
		expect(norm).not.toContain("flowchart-abc-123");
	});

	test("Rule 4: canonicalize whitespace", () => {
		const raw = "<svg>  \n\n  <rect>  </rect>  </svg>";
		const norm = normalizeSvg(raw);
		expect(norm).toBe("<svg><rect></rect></svg>");
	});

	test("Rule 5: normalize font-family metadata", () => {
		const raw =
			'<style>font-family: Arial, sans-serif;</style><rect font-family="monospace"/>';
		const norm = normalizeSvg(raw);
		expect(norm).toContain("font-family:NORM");
		expect(norm).toContain('font-family="NORM"');
		expect(norm).not.toContain("Arial");
		expect(norm).not.toContain("monospace");
	});

	test("Rule 5: strip data-mermaid-version", () => {
		const raw = '<svg data-mermaid-version="10.0.0"><rect/></svg>';
		const norm = normalizeSvg(raw);
		expect(norm).not.toContain("data-mermaid-version");
		expect(norm).not.toContain("10.0.0");
	});

	test("Rule 5: strip ISO timestamps", () => {
		const raw = '<svg timestamp="2026-07-14T12:34:56.789Z"><rect/></svg>';
		const norm = normalizeSvg(raw);
		expect(norm).toContain("TS");
		expect(norm).not.toContain("2026-07-14T12:34:56.789Z");
	});

	test("Rule 5: strip gantt today-line markers", () => {
		const raw = '<g class="today"><line x1="10"/></g><rect/>';
		const norm = normalizeSvg(raw);
		expect(norm).not.toContain("today");
		expect(norm).not.toContain("g class");
	});

	test("Rule 5: strip standalone today-class elements", () => {
		const raw = '<line class="today" x1="10"/>';
		const norm = normalizeSvg(raw);
		expect(norm).not.toContain("today");
	});
});

describe("TC-MERM-NORM-001 stability for non-deterministic differences (AC-F2-1 / NFR-1)", () => {
	test("same SVG with different IDs → identical normalized forms", () => {
		const svgA = '<svg><rect id="random-123"/></svg>';
		const svgB = '<svg><rect id="random-456"/></svg>';
		const normA = normalizeSvg(svgA);
		const normB = normalizeSvg(svgB);
		expect(normA).toBe(normB);
	});

	test("same SVG with different attribute order → identical normalized forms", () => {
		const svgA = '<svg><rect x="0" y="10" width="100"/></svg>';
		const svgB = '<svg><rect y="10" width="100" x="0"/></svg>';
		const normA = normalizeSvg(svgA);
		const normB = normalizeSvg(svgB);
		expect(normA).toBe(normB);
	});

	test("same SVG with different whitespace → identical normalized forms", () => {
		const svgA = "<svg><rect/></svg>";
		const svgB = "<svg><rect/></svg>";
		const normA = normalizeSvg(svgA);
		const normB = normalizeSvg(svgB);
		expect(normA).toBe(normB);
	});

	test("same SVG with different comments → identical normalized forms", () => {
		const svgA = "<svg><!-- comment A --><rect/></svg>";
		const svgB = "<svg><!-- comment B --><rect/></svg>";
		const normA = normalizeSvg(svgA);
		const normB = normalizeSvg(svgB);
		expect(normA).toBe(normB);
	});
});
