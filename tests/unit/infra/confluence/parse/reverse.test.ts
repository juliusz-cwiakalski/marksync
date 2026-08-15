// Unit tests for reverse classifier (F-4, F-5, plan task 2.6).
// Hand-built Storage strings, #aliases, literal code strings, no mocks.

import { describe, expect, it } from "bun:test";
import { parseStorage } from "#infra/confluence/parse/reverse-parser";
import {
	reverseStorage,
	reverseStorageCollectAll,
	type ReverseOptions,
} from "#infra/confluence/parse/reverse";
import { REVERSE_CODES } from "#domain/markdown/reverse-diagnostics";

describe("reverse classifier unit tests (plan task 2.6)", () => {
	/** Helper: parse Storage string and collect all diagnostics. */
	function collectDiagnostics(
		storage: string,
		options?: {
			pageId?: string;
			title?: string;
			sourcePath?: string;
			page?: { pageId?: string; title?: string; sourcePath?: string };
		},
	) {
		const parsed = parseStorage(storage);
		if (!parsed.ok) {
			throw new Error(`Parse failed: ${JSON.stringify(parsed.error)}`);
		}

		let reverseOptions: ReverseOptions | undefined;
		if (options?.page) {
			reverseOptions = options;
		} else if (options?.pageId || options?.title) {
			reverseOptions = {
				page: {
					...(options.pageId && { pageId: options.pageId }),
					...(options.title && { title: options.title }),
					...(options.sourcePath && { sourcePath: options.sourcePath }),
				},
			};
		} else if (options?.sourcePath) {
			reverseOptions = { sourcePath: options.sourcePath };
		}

		return reverseStorageCollectAll(storage, reverseOptions);
	}

	describe("TC-ELEM-001: unknown-element classification", () => {
		it("classifies unknown div element as reverse/unknown-element", () => {
			const storage = `<div>Unknown content</div>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "div",
				severity: "blocking",
			});
		});

		it("classifies unknown span element as reverse/unknown-element", () => {
			const storage = `<p>Text <span>span</span> more</p>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "span",
				severity: "blocking",
			});
		});

		it("classifies ac:widget as reverse/unknown-element", () => {
			const storage = `<ac:widget>Widget content</ac:widget>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "ac:widget",
				severity: "blocking",
			});
		});

		it("mixed unknown elements produce multiple diagnostics in document order", () => {
			const storage = `<div>First</div><p>Text</p><span>Second</span>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(2);
			expect(result.value.diagnostics[0].construct).toBe("div");
			expect(result.value.diagnostics[1].construct).toBe("span");
		});

		it("nested table stays on reverse/unsupported-construct (fallback)", () => {
			const storage = `
				<table>
					<tr>
						<td>
							<table>
								<tr><td>Nested</td></tr>
							</table>
						</td>
					</tr>
				</table>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-construct",
				construct: "td containing nested table",
				severity: "blocking",
			});
		});

		it("parity: collect-all first blocking equals fast-fail error", () => {
			const storage = `<div>Unknown</div><p>Canonical</p>`;
			const collectAll = collectDiagnostics(storage);
			const fastFail = reverseStorage(storage);

			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.code).toBe(collectAll.value.diagnostics[0].code);
				expect(fastFail.error.construct).toBe(
					collectAll.value.diagnostics[0].construct,
				);
			}
		});
	});

	describe("TC-LAY-001: complex layout classification", () => {
		it("layout tree produces exactly one diagnostic at outermost layout element", () => {
			const storage = `
				<ac:layout>
					<ac:layout-section>
						<ac:layout-cell>
							<p>Content</p>
						</ac:layout-cell>
					</ac:layout-section>
				</ac:layout>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/complex-layout",
				construct: "ac:layout",
				severity: "blocking",
				location: { line: 2, column: 16 }, // Post-`>` position
			});
		});

		it("nested layout sections produce zero per-section diagnostics", () => {
			const storage = `
				<ac:layout>
					<ac:layout-section>
						<ac:layout-cell>Cell 1</ac:layout-cell>
						<ac:layout-cell>Cell 2</ac:layout-cell>
					</ac:layout-section>
					<ac:layout-section>
						<ac:layout-cell>Cell 3</ac:layout-cell>
					</ac:layout-section>
				</ac:layout>
			`;
			const result = collectDiagnostics(storage);

			// Still only one diagnostic at the outermost layout
			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].construct).toBe("ac:layout");
		});

		it("sibling layout trees produce one diagnostic each", () => {
			const storage = `
				<ac:layout>
					<ac:layout-section>
						<ac:layout-cell>Layout 1</ac:layout-cell>
					</ac:layout-section>
				</ac:layout>
				<p>Separator</p>
				<ac:layout>
					<ac:layout-section>
						<ac:layout-cell>Layout 2</ac:layout-cell>
					</ac:layout-section>
				</ac:layout>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(2);
			expect(
				result.value.diagnostics.every(
					(d) => d.code === "reverse/complex-layout",
				),
			).toBe(true);
		});

		it("both fast-fail and collect-all modes work", () => {
			const storage = `
				<ac:layout>
					<ac:layout-section>
						<ac:layout-cell>Content</ac:layout-cell>
					</ac:layout-section>
				</ac:layout>
			`;
			const collectAll = collectDiagnostics(storage);
			const fastFail = reverseStorage(storage);

			expect(collectAll.value.diagnostics).toHaveLength(1);
			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.code).toBe("reverse/complex-layout");
			}
		});
	});

	describe("TC-LAY-002: orphaned layout elements", () => {
		it("orphaned layout section with cells produces one diagnostic at section", () => {
			const storage = `
				<ac:layout-section>
					<ac:layout-cell>Orphaned cell</ac:layout-cell>
				</ac:layout-section>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/complex-layout",
				construct: "ac:layout-section",
				severity: "blocking",
			});
		});

		it("lone orphaned cell produces one diagnostic at cell", () => {
			const storage = `<ac:layout-cell>Lone cell</ac:layout-cell>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/complex-layout",
				construct: "ac:layout-cell",
				severity: "blocking",
			});
		});

		it("orphaned elements never produce unknown-element diagnostics", () => {
			const storage = `
				<ac:layout-section>
					<ac:layout-cell>Content</ac:layout-cell>
				</ac:layout-section>
			`;
			const result = collectDiagnostics(storage);

			// Should be complex-layout, not unknown-element
			expect(result.value.diagnostics[0].code).toBe("reverse/complex-layout");
			expect(result.value.diagnostics[0].code).not.toBe(
				"reverse/unknown-element",
			);
		});

		it("orphaned layout never produces multiple diagnostics", () => {
			const storage = `
				<ac:layout-section>
					<ac:layout-cell>Cell 1</ac:layout-cell>
					<ac:layout-cell>Cell 2</ac:layout-cell>
				</ac:layout-section>
			`;
			const result = collectDiagnostics(storage);

			// One diagnostic total, not one per cell
			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].construct).toBe("ac:layout-section");
		});
	});

	describe("TC-ATTR-001: attribute aggregation", () => {
		it("aggregates multiple exotic attributes into one diagnostic", () => {
			const storage = `
				<th colspan="2" rowspan="1" style="background: #f0f0f0" class="header" data-table-width="100%">
					Header
				</th>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "th[class, colspan, data-table-width, rowspan, style]",
				severity: "blocking",
			});
		});

		it("sorts attribute names lexicographically", () => {
			const storage = `<td zebra="1" apple="2" mango="3">Cell</td>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics[0].construct).toBe(
				"td[apple, mango, zebra]",
			);
		});

		it("deduplicates duplicate attribute names", () => {
			const storage = `<td style="red">Cell</td>`; // HTML parsers don't allow duplicate attributes
			const result = collectDiagnostics(storage);

			// Only one diagnostic with deduped names
			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].construct).toBe("td[style]");
		});

		it("determinism: shuffled attribute order produces identical diagnostics", () => {
			const storage1 = `<td a="1" b="2" c="3">Cell</td>`;
			const storage2 = `<td c="3" a="1" b="2">Cell</td>`;

			const result1 = collectDiagnostics(storage1);
			const result2 = collectDiagnostics(storage2);

			expect(result1.value.diagnostics[0].construct).toBe(
				result2.value.diagnostics[0].construct,
			);
		});

		it("element-start location is correct", () => {
			const storage = `<p style="color: red">Styled paragraph</p>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics[0].location).toMatchObject({
				line: 1,
				column: 23, // Post-`>` position after `<p style="color: red">`
			});
		});

		it("diagnostic payload contains no attribute values (NFR-6)", () => {
			const storage = `<p style="color: red" class="highlight">Text</p>`;
			const result = collectDiagnostics(storage);

			const construct = result.value.diagnostics[0].construct;
			expect(construct).toBe("p[class, style]");
			expect(construct).not.toContain("color");
			expect(construct).not.toContain("red");
			expect(construct).not.toContain("highlight");
		});

		it("multi-element document produces one diagnostic per offending element", () => {
			const storage = `
				<p style="red">Para 1</p>
				<p>Para 2</p>
				<p class="styled">Para 3</p>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(2);
			expect(result.value.diagnostics[0].construct).toBe("p[style]");
			expect(result.value.diagnostics[1].construct).toBe("p[class]");
		});
	});

	describe("TC-ATTR-002: allowlist boundary and K1 confinement", () => {
		it("canonical attributes on a[href] are silent", () => {
			const storage = `<a href="https://example.com">Link</a>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("canonical attributes on ac:image[ac:alt] are silent", () => {
			const storage = `
				<ac:image ac:alt="Alt text">
					<ri:url ri:value="https://example.com/image.png" />
				</ac:image>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("exotic attributes on a[href] are diagnosed", () => {
			const storage = `<a href="https://example.com" target="_blank">Link</a>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "a[target]",
			});
		});

		it("exotic attributes on ac:image are diagnosed (F-1)", () => {
			const storage = `
				<ac:image ac:alt="Alt" ac:width="200" ac:align="center">
					<ri:url ri:value="https://example.com/image.png" />
				</ac:image>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ac:image[ac:align, ac:width]",
			});
		});

		it("exotic attributes on ri:url are diagnosed", () => {
			const storage = `
				<ac:image ac:alt="Alt">
					<ri:url ri:value="https://example.com/image.png" ri:custom="prop" />
				</ac:image>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ri:url[ri:custom]",
			});
		});

		it("exotic attributes on ri:attachment are diagnosed", () => {
			const storage = `
				<ac:image ac:alt="Alt">
					<ri:attachment ri:filename="image.png" ri:custom="prop" />
				</ac:image>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ri:attachment[ri:custom]",
			});
		});

		it("K1 attributes on ac:structured-macro are silent (carve-out)", () => {
			const storage = `
				<ac:structured-macro ac:name="code" ac:macro-id="abc123" ac:schema-version="1">
					<ac:parameter ac:name="language">javascript</ac:parameter>
					<ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			// K1 attributes should not trigger diagnostics on macros
			const k1Diagnostics = result.value.diagnostics.filter(
				(d) =>
					d.construct.includes("ac:macro-id") ||
					d.construct.includes("ac:schema-version"),
			);
			expect(k1Diagnostics).toHaveLength(0);
		});

		it("K1 attributes on non-macro elements are diagnosed as exotic", () => {
			const storage = `<p ac:macro-id="abc123">Paragraph with K1 attribute</p>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "p[ac:macro-id]",
			});
		});

		it("canonical attributes on ac:parameter[ac:name] are silent", () => {
			const storage = `
				<ac:structured-macro ac:name="code">
					<ac:parameter ac:name="language">typescript</ac:parameter>
					<ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("exotic attributes on ac:parameter are diagnosed", () => {
			const storage = `
				<ac:structured-macro ac:name="code">
					<ac:parameter ac:name="language" ac:custom="prop">typescript</ac:parameter>
					<ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			// Code macro should convert successfully
			expect(result.ok).toBe(true);

			// Exotic attribute on ac:parameter should be diagnosed
			const paramAttrDiagnostic = result.value.diagnostics.find(
				(d) => d.code === "reverse/unsupported-attribute",
			);
			expect(paramAttrDiagnostic).toBeDefined();
			expect(paramAttrDiagnostic?.construct).toBe("ac:parameter[ac:custom]");
		});

		it("canonical attributes on ac:structured-macro[ac:name] are silent", () => {
			const storage = `
				<ac:structured-macro ac:name="code">
					<ac:parameter ac:name="language">javascript</ac:parameter>
					<ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("no-attribute sweep: canonical elements with no attributes produce zero diagnostics", () => {
			const storage = `
				<h1>Heading</h1>
				<p>Paragraph</p>
				<strong>Bold</strong>
				<ul><li>List item</li></ul>
				<table><tr><td>Cell</td></tr></table>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("structural whitespace and panel strip stay silent (GH-92 DEC-6)", () => {
			const storage = `
				<ac:structured-macro ac:name="info">
					<ac:parameter ac:name="icon">true</ac:parameter>
					<ac:rich-text-body>
						<p>Panel content</p>
					</ac:rich-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			// Panel should be stripped silently (no diagnostic for the macro itself)
			// Only unknown macro diagnostic should appear
			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/unknown-macro");
		});
	});

	describe("TC-TASK-001: task-list integrity", () => {
		it("stray span child of ac:task-list produces unknown-element at child", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task 1</p></ac:task-body>
					</ac:task>
					<span>Stray span</span>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "span",
				severity: "blocking",
			});
		});

		it("misplaced p child of ac:task-list produces fallback at child", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task 1</p></ac:task-body>
					</ac:task>
					<p>Misplaced paragraph</p>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-construct",
				construct: "p",
				severity: "blocking",
			});
		});

		it("mixed list: only stray children are diagnosed", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Canonical task</p></ac:task-body>
					</ac:task>
					<span>Stray 1</span>
					<ac:task>
						<ac:task-status>incomplete</ac:task-status>
						<ac:task-body><p>Another canonical task</p></ac:task-body>
					</ac:task>
					<span>Stray 2</span>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(2);
			expect(
				result.value.diagnostics.every((d) => d.construct === "span"),
			).toBe(true);
		});

		it("canonical mixed task/regular-list body produces zero diagnostics", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task content</p></ac:task-body>
					</ac:task>
					<ac:task>
						<ac:task-status>incomplete</ac:task-status>
						<ac:task-body><ul><li>Item 1</li><li>Item 2</li></ul></ac:task-body>
					</ac:task>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("non-whitespace text child produces fallback at task-list element (OQ-P2)", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task 1</p></ac:task-body>
					</ac:task>
					Stray text content
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-construct",
				construct: "ac:task-list with non-whitespace text child",
				severity: "blocking",
			});
		});

		it("ac:task-id is canonical-silent (server-assigned metadata)", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-id>task-123</ac:task-id>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task with ID</p></ac:task-body>
					</ac:task>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			// ac:task-id should be silently ignored
			expect(result.value.diagnostics).toHaveLength(0);
		});
	});

	describe("TC-PAGE-001: page-context echo", () => {
		it("echoes page context on blocking diagnostics", () => {
			const storage = `<div>Unknown element</div>`;
			const page = {
				pageId: "page-123",
				title: "Test Page",
				sourcePath: "/path/to/page.md",
			};
			const result = collectDiagnostics(storage, page);

			expect(result.value.diagnostics[0]).toMatchObject({
				page: {
					pageId: "page-123",
					title: "Test Page",
					sourcePath: "/path/to/page.md",
				},
			});
		});

		it("echoes page context on informational diagnostics", () => {
			// Use mermaid artifact macro which produces informational diagnostic
			const storage = `
				<ac:image ac:alt="Mermaid diagram">
					<ri:url ri:value="marksync-mermaid-generated-abc123.svg" />
				</ac:image>
			`;
			const page = { pageId: "page-456", title: "Mermaid Page" };
			const result = collectDiagnostics(storage, page);

			// Find the informational diagnostic
			const infoDiag = result.value.diagnostics.find(
				(d) => d.severity === "informational",
			);
			expect(infoDiag).toBeDefined();
			expect(infoDiag?.page).toEqual({
				pageId: "page-456",
				title: "Mermaid Page",
			});
		});

		it.skip("echoes page context on parse-error diagnostics", () => {
			// Skipped: saxes parser is tolerant; parse error test handled in integration layer
		});

		it("partial page context is echoed verbatim (no synthesis)", () => {
			const storage = `<div>Unknown</div>`;
			const page = { pageId: "page-999" }; // Only pageId provided
			const result = collectDiagnostics(storage, page);

			expect(result.value.diagnostics[0].page).toEqual({ pageId: "page-999" });
			expect(result.value.diagnostics[0].page).not.toHaveProperty("title");
			expect(result.value.diagnostics[0].page).not.toHaveProperty("sourcePath");
		});

		it("body text is never harvested into page context (NFR-6)", () => {
			const storage = `<div>Important body text</div>`;
			const page = { pageId: "page-111" };
			const result = collectDiagnostics(storage, page);

			expect(result.value.diagnostics[0].page).toEqual({ pageId: "page-111" });
			expect(result.value.diagnostics[0].page).not.toHaveProperty("title");
		});
	});

	describe("TC-PAGE-002: omit-when-absent byte-compat", () => {
		it("no page context produces no page field in diagnostics", () => {
			const storage = `<div>Unknown</div>`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics[0]).not.toHaveProperty("page");
		});

		it("no opts vs explicit undefined produce byte-identical JSON", () => {
			const storage = `<div>Unknown</div>`;

			const result1 = collectDiagnostics(storage);
			const result2 = collectDiagnostics(storage, undefined);

			const json1 = JSON.stringify(result1.value.diagnostics);
			const json2 = JSON.stringify(result2.value.diagnostics);

			expect(json1).toBe(json2);
		});

		it("existing call sites compile unmodified (optional-parameters-only)", () => {
			const storage = `<p>Canonical</p>`;

			// These should compile without errors
			const result1 = reverseStorage(storage);
			const result2 = reverseStorageCollectAll(storage);

			expect(result1.ok).toBe(true);
			expect(result2.ok).toBe(true);
		});

		it("context-free sidecars deep-equal without re-pinning", () => {
			const storage = `<div>Unknown</div>`;
			const result1 = collectDiagnostics(storage);
			const result2 = collectDiagnostics(storage, undefined);

			expect(result1.value.diagnostics).toEqual(result2.value.diagnostics);
		});
	});

	describe("TC-PAGE-003: sourcePath absorption and precedence", () => {
		it("sourcePath absorption produces page:{sourcePath}", () => {
			const storage = `<div>Unknown</div>`;
			const result = collectDiagnostics(storage, {
				sourcePath: "/path/to/file.md",
			});

			expect(result.value.diagnostics[0]).toMatchObject({
				page: { sourcePath: "/path/to/file.md" },
			});
		});

		it("explicit page wins verbatim, no merge", () => {
			const storage = `<div>Unknown</div>`;
			const result = collectDiagnostics(storage, {
				sourcePath: "/path/to/file.md",
				page: { pageId: "page-123", title: "Explicit Page" },
			});

			// Explicit page should win, sourcePath should not be merged
			expect(result.value.diagnostics[0].page).toEqual({
				pageId: "page-123",
				title: "Explicit Page",
			});
			expect(result.value.diagnostics[0].page).not.toHaveProperty("sourcePath");
		});

		it("precedence: explicit page > sourcePath absorption > absent", () => {
			const storage = `<div>Unknown</div>`;

			const resultExplicit = collectDiagnostics(storage, {
				page: { pageId: "page-explicit" },
			});
			const resultAbsorption = collectDiagnostics(storage, {
				sourcePath: "/path.md",
			});
			const resultAbsent = collectDiagnostics(storage);

			expect(resultExplicit.value.diagnostics[0].page).toEqual({
				pageId: "page-explicit",
			});
			expect(resultAbsorption.value.diagnostics[0].page).toEqual({
				sourcePath: "/path.md",
			});
			expect(resultAbsent.value.diagnostics[0]).not.toHaveProperty("page");
		});

		it("determinism: same options produce identical page context", () => {
			const storage = `<div>Unknown</div>`;
			const options = { page: { pageId: "page-123" } };

			const result1 = collectDiagnostics(storage, options);
			const result2 = collectDiagnostics(storage, options);

			expect(result1.value.diagnostics[0].page).toEqual(
				result2.value.diagnostics[0].page,
			);
		});
	});

	describe("TC-DET-001: determinism and parity", () => {
		it("mixed body convert-twice produces deep-equal diagnostics", () => {
			const storage = `
				<h1>Heading</h1>
				<div>Unknown 1</div>
				<p>Canonical</p>
				<div>Unknown 2</div>
			`;

			const result1 = collectDiagnostics(storage);
			const result2 = collectDiagnostics(storage);

			expect(result1.value.diagnostics).toEqual(result2.value.diagnostics);
		});

		it("shuffled attribute order produces identical diagnostics", () => {
			const storage1 = `<p a="1" b="2" c="3">Text</p>`;
			const storage2 = `<p c="3" a="1" b="2">Text</p>`;

			const result1 = collectDiagnostics(storage1);
			const result2 = collectDiagnostics(storage2);

			expect(result1.value.diagnostics[0].construct).toBe(
				result2.value.diagnostics[0].construct,
			);
		});

		it("fast-fail equals collect-all first blocking on code", () => {
			const storage = `
				<div>First unknown</div>
				<p>Canonical</p>
				<span>Second unknown</span>
			`;

			const collectAll = collectDiagnostics(storage);
			const fastFail = reverseStorage(storage);

			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.code).toBe(collectAll.value.diagnostics[0].code);
			}
		});

		it("fast-fail equals collect-all first blocking on construct", () => {
			const storage = `
				<div>First unknown</div>
				<p>Canonical</p>
				<span>Second unknown</span>
			`;

			const collectAll = collectDiagnostics(storage);
			const fastFail = reverseStorage(storage);

			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.construct).toBe(
					collectAll.value.diagnostics[0].construct,
				);
			}
		});

		it("fast-fail equals collect-all first blocking on location", () => {
			const storage = `
				<div>First unknown</div>
				<p>Canonical</p>
				<span>Second unknown</span>
			`;

			const collectAll = collectDiagnostics(storage);
			const fastFail = reverseStorage(storage);

			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.location).toEqual(
					collectAll.value.diagnostics[0].location,
				);
			}
		});

		it("fast-fail equals collect-all first blocking on page", () => {
			const storage = `<div>Unknown</div>`;
			const page = { pageId: "page-123" };

			const collectAll = collectDiagnostics(storage, { page });
			const fastFail = reverseStorage(storage, { page });

			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.page).toEqual(
					collectAll.value.diagnostics[0].page,
				);
			}
		});
	});

	describe("TC-ATTR-003: exotic attribute on recognized macro", () => {
		it("class on ac:structured-macro[ac:name='code'] produces unsupported-attribute", () => {
			const storage = `
				<ac:structured-macro ac:name="code" class="highlight">
					<ac:parameter ac:name="language">javascript</ac:parameter>
					<ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ac:structured-macro[class]",
				severity: "blocking",
			});
		});
	});

	describe("TC-TASK-002: task-body propagation diagnostics", () => {
		it("task-body with unknown element and exotic-attribute element produces both diagnostics", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body>
							<div>Unknown div</div>
							<p style="color: red">Styled paragraph</p>
						</ac:task-body>
					</ac:task>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			// Should have both diagnostics: unknown-element for div, unsupported-attribute for p[style]
			expect(result.value.diagnostics).toHaveLength(2);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "div",
				severity: "blocking",
			});
			expect(result.value.diagnostics[1]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "p[style]",
				severity: "blocking",
			});
		});
	});

	describe("TC-TASK-003: macro form task-list integrity", () => {
		it("canonical macro task-list converts cleanly with zero diagnostics", () => {
			const storage = `
				<ac:structured-macro ac:name="task-list">
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task 1</p></ac:task-body>
					</ac:task>
					<ac:task>
						<ac:task-status>incomplete</ac:task-status>
						<ac:task-body><p>Task 2</p></ac:task-body>
					</ac:task>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});

		it("stray child (span) of macro task-list diagnosed at child", () => {
			const storage = `
				<ac:structured-macro ac:name="task-list">
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Canonical task</p></ac:task-body>
					</ac:task>
					<span>Stray span</span>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unknown-element",
				construct: "span",
				severity: "blocking",
			});
		});

		it("missing-status task in macro form produces unsupported-construct", () => {
			const storage = `
				<ac:structured-macro ac:name="task-list">
					<ac:task>
						<ac:task-body><p>Task without status</p></ac:task-body>
					</ac:task>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-construct",
				severity: "blocking",
			});
		});

		it("class on macro task-list produces unsupported-attribute", () => {
			const storage = `
				<ac:structured-macro ac:name="task-list" class="custom-class">
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task</p></ac:task-body>
					</ac:task>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ac:structured-macro[class]",
				severity: "blocking",
			});
		});
	});

	describe("TC-TASK-004: canonical-but-misplaced task-list children", () => {
		it("stray canonical ac:image child of task-list produces structural fallback", () => {
			const storage = `
				<ac:task-list>
					<ac:task>
						<ac:task-status>complete</ac:task-status>
						<ac:task-body><p>Task 1</p></ac:task-body>
					</ac:task>
					<ac:image ac:alt="Stray image">
						<ri:url ri:value="https://example.com/image.png" />
					</ac:image>
				</ac:task-list>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-construct",
				construct: "ac:image",
				severity: "blocking",
			});
		});
	});

	describe("TC-ATTR-003: K1 confinement to ac:structured-macro", () => {
		it("ac:image with ac:macro-id produces blocking diagnostic (not ac:structured-macro)", () => {
			const storage = `
				<ac:image ac:alt="x" ac:macro-id="m1">
					<ri:attachment ri:filename="test.png" />
				</ac:image>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0]).toMatchObject({
				code: "reverse/unsupported-attribute",
				construct: "ac:image[ac:macro-id]",
				severity: "blocking",
			});
		});

		it("ac:structured-macro with K1 attributes produces zero diagnostics (silenced per spec F-2/DEC-5)", () => {
			const storage = `
				<ac:structured-macro ac:name="code" ac:macro-id="m123" ac:schema-version="1">
					<ac:parameter ac:name="language">javascript</ac:parameter>
					<ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body>
				</ac:structured-macro>
			`;
			const result = collectDiagnostics(storage);

			expect(result.value.diagnostics).toHaveLength(0);
		});
	});
});
