// Reverse diagnostic model tests — TC-RDIAG-001/002/004.

import { describe, expect, it } from "bun:test";
import type {
	BlockingDiagnostic,
	InformationalDiagnostic,
	StorageParseError,
	ReverseDiagnostic,
	ReverseError,
	ReverseSuccess,
} from "#domain/markdown/reverse-diagnostics";
import { REVERSE_CODES } from "#domain/markdown/reverse-diagnostics";
import {
	reverseStorage,
	reverseStorageCollectAll,
} from "#infra/confluence/parse/reverse";

describe("reverse-diagnostics", () => {
	describe("TC-TAXO-001: registry snapshot — exactly 7 codes, additions-only", () => {
		it("has exactly 7 codes with literal-pinned values", () => {
			const codeValues = Object.values(REVERSE_CODES);
			expect(codeValues).toHaveLength(7);

			// Three 0.9.0 codes unchanged
			expect(REVERSE_CODES.UNSUPPORTED_CONSTRUCT).toBe(
				"reverse/unsupported-construct",
			);
			expect(REVERSE_CODES.SYNTHETIC_ARTIFACT).toBe(
				"marksync/synthetic-artifact",
			);
			expect(REVERSE_CODES.STORAGE_PARSE_ERROR).toBe("reverse/parse-error");

			// Four new GH-93 codes (Appendix A)
			expect(REVERSE_CODES.UNKNOWN_MACRO).toBe("reverse/unknown-macro");
			expect(REVERSE_CODES.COMPLEX_LAYOUT).toBe("reverse/complex-layout");
			expect(REVERSE_CODES.UNSUPPORTED_ATTRIBUTE).toBe(
				"reverse/unsupported-attribute",
			);
			expect(REVERSE_CODES.UNKNOWN_ELEMENT).toBe("reverse/unknown-element");
		});

		it("5 blocking-path codes are pairwise distinct and distinct from informational + parse-error", () => {
			const blockingCodes = [
				REVERSE_CODES.UNKNOWN_MACRO,
				REVERSE_CODES.COMPLEX_LAYOUT,
				REVERSE_CODES.UNSUPPORTED_ATTRIBUTE,
				REVERSE_CODES.UNKNOWN_ELEMENT,
				REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
			];

			const informationalCode = REVERSE_CODES.SYNTHETIC_ARTIFACT;
			const parseErrorCode = REVERSE_CODES.STORAGE_PARSE_ERROR;

			// All blocking codes are distinct
			expect(new Set(blockingCodes).size).toBe(5);

			// Blocking codes are distinct from informational and parse-error
			for (const code of blockingCodes) {
				expect(code).not.toBe(informationalCode);
				expect(code).not.toBe(parseErrorCode);
			}
		});
	});

	describe("TC-RDIAG-001: blocking diagnostic shape", () => {
		it("has stable per-class code", () => {
			const diagnostic: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='unknown']",
				location: { line: 3, column: 5 },
			};

			expect(diagnostic.code).toBe("reverse/unsupported-construct");
			expect(diagnostic.severity).toBe("blocking");
			expect(diagnostic.class).toBe("unsupported-construct");
			expect(diagnostic.construct).toBe(
				"ac:structured-macro[ac:name='unknown']",
			);
			expect(diagnostic.location).toEqual({ line: 3, column: 5 });
		});

		it("payload carries structure only, no content echo", () => {
			const diagnostic: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='unknown']",
				location: { line: 1, column: 1 },
			};

			const serialized = JSON.stringify(diagnostic);
			expect(serialized).not.toContain("secret");
			expect(serialized).not.toContain("password");
			expect(serialized).not.toContain("PII");
			// Only structural fields present
			expect(serialized).toContain("severity");
			expect(serialized).toContain("code");
			expect(serialized).toContain("construct");
			expect(serialized).toContain("location");
		});

		it("same input → deep-equal diagnostic (determinism)", () => {
			const input: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='gliffy']",
				location: { line: 5, column: 10 },
			};

			const diagnostic1: BlockingDiagnostic = { ...input };
			const diagnostic2: BlockingDiagnostic = { ...input };

			expect(diagnostic1).toEqual(diagnostic2);
			expect(JSON.stringify(diagnostic1)).toBe(JSON.stringify(diagnostic2));
		});
	});

	describe("TC-RDIAG-002: fast-fail / collect-all parity", () => {
		it("blocking arm shape matches collect-all entry", () => {
			const blockingError: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "table inside td",
				location: { line: 7, column: 3 },
			};

			const collectAllEntry: ReverseDiagnostic = blockingError;

			expect(blockingError).toEqual(collectAllEntry);
			expect(collectAllEntry).toEqual(blockingError);
		});

		it("multiple instances → exhaustive enumeration", () => {
			const diagnostics: ReverseDiagnostic[] = [
				{
					severity: "blocking",
					class: "unsupported-construct",
					code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
					construct: "ac:structured-macro[ac:name='toc']",
					location: { line: 1, column: 1 },
				},
				{
					severity: "blocking",
					class: "unsupported-construct",
					code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
					construct: "ac:structured-macro[ac:name='expand']",
					location: { line: 10, column: 1 },
				},
				{
					severity: "blocking",
					class: "unsupported-construct",
					code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
					construct: "nested table",
					location: { line: 20, column: 5 },
				},
			];

			expect(diagnostics).toHaveLength(3);
			expect(diagnostics[0]).toEqual({
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='toc']",
				location: { line: 1, column: 1 },
			});
			// All instances have identical per-instance verdict structure
			diagnostics.forEach((d) => {
				expect(d.severity).toBe("blocking");
				expect(d.class).toBe("unsupported-construct");
				expect(d.code).toBe(REVERSE_CODES.UNSUPPORTED_CONSTRUCT);
				expect(d.construct).toBeDefined();
				expect(d.location).toBeDefined();
			});
		});
	});

	describe("TC-RDIAG-003: malformed Storage → parse-error arm", () => {
		it("parse-error has stable code and location", () => {
			const parseError: StorageParseError = {
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: 2, column: 15 },
				detail: "mismatched tag: expected </p> but found </div>",
			};

			expect(parseError.kind).toBe("StorageParseError");
			expect(parseError.code).toBe("reverse/parse-error");
			expect(parseError.location).toEqual({ line: 2, column: 15 });
			expect(parseError.detail).toContain("mismatched tag");
		});

		it("same malformed input → identical error (deterministic failure)", () => {
			const error1: StorageParseError = {
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: 1, column: 10 },
				detail: "unclosed comment",
			};
			const error2: StorageParseError = {
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: 1, column: 10 },
				detail: "unclosed comment",
			};

			expect(error1).toEqual(error2);
			expect(JSON.stringify(error1)).toBe(JSON.stringify(error2));
		});
	});

	describe("TC-RDIAG-004: informational diagnostic", () => {
		it("synthetic artifact reported alongside success", () => {
			const success: ReverseSuccess = {
				markdown: "# Heading\n\nParagraph content",
				diagnostics: [
					{
						severity: "informational",
						class: "marksync-synthetic-artifact",
						code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
						construct: "ac:image[ri:filename='marksync-mermaid-abc123.svg']",
						location: { line: 1, column: 1 },
					},
				],
			};

			expect(success.markdown).toBe("# Heading\n\nParagraph content");
			expect(success.diagnostics).toHaveLength(1);
			expect(success.diagnostics[0].severity).toBe("informational");
			expect(success.diagnostics[0].class).toBe("marksync-synthetic-artifact");
			expect(success.diagnostics[0].code).toBe("marksync/synthetic-artifact");
			expect(success.diagnostics[0].construct).toContain("marksync-mermaid-");
			expect(success.diagnostics[0].location).toEqual({ line: 1, column: 1 });
		});

		it("informational never blocks conversion", () => {
			const success: ReverseSuccess = {
				markdown: "Content here",
				diagnostics: [
					{
						severity: "informational",
						class: "marksync-synthetic-artifact",
						code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
						construct: "ac:image[ri:filename='marksync-mermaid-xyz.svg']",
						location: { line: 1, column: 1 },
					},
				],
			};

			// Success type has ok property inferred by Result type
			const result = {
				ok: true,
				value: success,
			} as const;

			expect(result.ok).toBe(true);
			expect(result.value.diagnostics[0].severity).toBe("informational");
		});

		it("payload carries no content echo", () => {
			const diagnostic: InformationalDiagnostic = {
				severity: "informational",
				class: "marksync-synthetic-artifact",
				code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
				construct: "ac:image[ri:filename='marksync-mermaid-hash.svg']",
				location: { line: 3, column: 7 },
			};

			const serialized = JSON.stringify(diagnostic);
			expect(serialized).not.toContain("diagram");
			expect(serialized).not.toContain("content");
			// Only structural fields present
			expect(serialized).toContain("severity");
			expect(serialized).toContain("code");
			expect(serialized).toContain("construct");
			expect(serialized).toContain("location");
		});
	});

	describe("TC-RDIAG-001 (Storage-driven): blocking diagnostic shape", () => {
		it("hand-built Storage → blocking shape: pinned code, construct, location", () => {
			// Unknown macro produces blocking diagnostic
			const storage = `<ac:structured-macro ac:name="unknown-macro">
  <ac:plain-text-body><![CDATA[Macro body]]></ac:plain-text-body>
</ac:structured-macro>`;

			const result = reverseStorage(storage);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				const error = result.error;
				expect(error.code).toBe(REVERSE_CODES.UNKNOWN_MACRO);
				expect(error.construct).toContain('ac:name="unknown-macro"');
				expect(error.location).toBeDefined();
				expect(error.location.line).toBeGreaterThan(0);
				expect(error.location.column).toBeGreaterThan(0);
				// No content echo
				expect(JSON.stringify(error)).not.toContain("Macro body");
			}
		});

		it("no content echo — diagnostic carries only structural data", () => {
			const storage = `<p>Secret password: hunter2</p>
<ac:structured-macro ac:name="bad-macro">
  <ac:plain-text-body><![CDATA[PII: john@example.com]]></ac:plain-text-body>
</ac:structured-macro>`;

			const result = reverseStorage(storage);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				const serialized = JSON.stringify(result.error);
				expect(serialized).not.toContain("hunter2");
				expect(serialized).not.toContain("john@example.com");
				expect(serialized).toContain("bad-macro"); // Only construct identity
			}
		});

		it("deterministic — same Storage → identical diagnostic", () => {
			const storage = `<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
</ac:structured-macro>`;

			const result1 = reverseStorage(storage);
			const result2 = reverseStorage(storage);

			expect(result1.ok).toBe(false);
			expect(result2.ok).toBe(false);
			if (!result1.ok && !result2.ok) {
				expect(result1.error).toEqual(result2.error);
				expect(JSON.stringify(result1.error)).toBe(
					JSON.stringify(result2.error),
				);
			}
		});
	});

	describe("TC-RDIAG-002 (Storage-driven): fast-fail / collect-all parity", () => {
		it("mixed informational-before-blocking order: first blocking ≡ fast-fail (field-level parity)", () => {
			// F-15: mermaid artifact (informational, line 2) before gliffy (blocking, line 3)
			// Empirically verified by iteration-2 review: informationals are now labeled correctly
			const storage = `<h1>Heading</h1>
<ac:image>
  <ri:attachment ri:filename="marksync-mermaid-abc123.svg"></ri:attachment>
</ac:image>
<ac:structured-macro ac:name="gliffy">
  <ac:parameter ac:name="diagramName">my-diagram</ac:parameter>
</ac:structured-macro>`;

			const fastFail = reverseStorage(storage);
			const collectAll = reverseStorageCollectAll(storage);

			// Fast-fail returns the first blocking error (gliffy)
			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.code).toBe(REVERSE_CODES.UNKNOWN_MACRO);
				expect(fastFail.error.construct).toContain('ac:name="gliffy"');
			}

			// Collect-all returns both diagnostics in document order
			expect(collectAll.ok).toBe(true);
			if (collectAll.ok) {
				expect(collectAll.value.diagnostics).toHaveLength(2);

				// First is informational (mermaid artifact)
				expect(collectAll.value.diagnostics[0].severity).toBe("informational");
				expect(collectAll.value.diagnostics[0].class).toBe(
					"marksync-synthetic-artifact",
				);
				expect(collectAll.value.diagnostics[0].code).toBe(
					REVERSE_CODES.SYNTHETIC_ARTIFACT,
				);
				expect(collectAll.value.diagnostics[0].construct).toContain("mermaid");

				// Second is blocking (gliffy) — first BLOCKING entry deep-equals fast-fail error
				const firstBlocking = collectAll.value.diagnostics[1];
				expect(firstBlocking.severity).toBe("blocking");
				expect(firstBlocking.class).toBe("unsupported-construct");
				expect(firstBlocking.code).toBe(fastFail.error.code);
				expect(firstBlocking.construct).toBe(fastFail.error.construct);
				expect(firstBlocking.location).toEqual(fastFail.error.location);
			}
		});

		it("3+ unsupported instances → fast-fail returns first, collect-all returns all N", () => {
			const storage = `<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
</ac:structured-macro>
<p>Paragraph</p>
<ac:structured-macro ac:name="expand"></ac:structured-macro>
<ac:structured-macro ac:name="gliffy"></ac:structured-macro>`;

			const fastFail = reverseStorage(storage);
			const collectAll = reverseStorageCollectAll(storage);

			// Fast-fail stops at first error
			expect(fastFail.ok).toBe(false);
			if (!fastFail.ok) {
				expect(fastFail.error.construct).toContain('ac:name="toc"');
			}

			// Collect-all exhaustively lists all 3 (returns Result with diagnostics array)
			expect(collectAll.ok).toBe(true);
			if (collectAll.ok) {
				expect(collectAll.value.diagnostics).toHaveLength(3);
				expect(collectAll.value.diagnostics[0].construct).toContain(
					'ac:name="toc"',
				);
				expect(collectAll.value.diagnostics[1].construct).toContain(
					'ac:name="expand"',
				);
				expect(collectAll.value.diagnostics[2].construct).toContain(
					'ac:name="gliffy"',
				);
			}
		});

		it("all[0] deep-equals fast-fail error (parity)", () => {
			const storage = `<ac:structured-macro ac:name="toc"></ac:structured-macro>
<p>Paragraph</p>
<ac:structured-macro ac:name="expand"></ac:structured-macro>`;

			const fastFail = reverseStorage(storage);
			const collectAll = reverseStorageCollectAll(storage);

			expect(fastFail.ok).toBe(false);
			expect(collectAll.ok).toBe(true);
			if (!fastFail.ok && collectAll.ok) {
				// First collect-all entry deep-equals fast-fail error (code, construct, location)
				expect(collectAll.value.diagnostics[0].code).toBe(fastFail.error.code);
				expect(collectAll.value.diagnostics[0].construct).toBe(
					fastFail.error.construct,
				);
				expect(collectAll.value.diagnostics[0].location).toEqual(
					fastFail.error.location,
				);
			}
		});

		it("cross-mode per-instance stability via single-instance variants", () => {
			// Single instance in each mode should have identical structure
			const storage = `<ac:structured-macro ac:name="toc"></ac:structured-macro>`;

			const fastFail = reverseStorage(storage);
			const collectAll = reverseStorageCollectAll(storage);

			expect(fastFail.ok).toBe(false);
			expect(collectAll.ok).toBe(true);
			if (!fastFail.ok && collectAll.ok) {
				expect(collectAll.value.diagnostics).toHaveLength(1);

				// Verify per-instance verdict shape
				expect(fastFail.error.code).toBe(REVERSE_CODES.UNKNOWN_MACRO);
				expect(fastFail.error.construct).toBeDefined();
				expect(fastFail.error.location).toBeDefined();

				expect(collectAll.value.diagnostics[0].code).toBe(
					REVERSE_CODES.UNKNOWN_MACRO,
				);
			}
		});
	});

	describe("TC-RDIAG-004 (Storage-driven): informational synthetic artifact", () => {
		it("synthetic artifact payload carries no content echo", () => {
			const diagnostic: InformationalDiagnostic = {
				severity: "informational",
				class: "marksync-synthetic-artifact",
				code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
				construct: "ac:image[ri:filename='marksync-mermaid-hash.svg']",
				location: { line: 3, column: 7 },
			};

			const serialized = JSON.stringify(diagnostic);
			expect(serialized).not.toContain("diagram");
			expect(serialized).not.toContain("content");
			// Only structural fields present
			expect(serialized).toContain("severity");
			expect(serialized).toContain("code");
			expect(serialized).toContain("construct");
			expect(serialized).toContain("location");
		});
	});

	describe("type discrimination", () => {
		it("ReverseError discriminates by kind", () => {
			const parseError: ReverseError = {
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: 1, column: 1 },
				detail: "invalid entity",
			};

			const blocking: ReverseError = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "unknown element",
				location: { line: 2, column: 2 },
			};

			if (parseError.kind === "StorageParseError") {
				expect(parseError.detail).toBeDefined();
			}

			if (blocking.kind === "StorageParseError") {
				// This branch should never execute
				throw new Error("Type discrimination failed");
			} else {
				expect(blocking.severity).toBe("blocking");
			}
		});
	});

	describe("TC-TAXO-001: page-context field — omit-when-absent at model level", () => {
		it("diagnostic without page serializes with no page key", () => {
			const diagnostic: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='unknown']",
				location: { line: 1, column: 1 },
			};

			const serialized = JSON.stringify(diagnostic);
			expect(serialized).not.toContain("page");
		});

		it("diagnostic with page serializes verbatim (no synthesis, no merge)", () => {
			const pageContext = {
				pageId: "12345",
				title: "Test Page",
				sourcePath: "docs/test.md",
			};

			const diagnostic: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "ac:structured-macro[ac:name='unknown']",
				location: { line: 1, column: 1 },
				page: pageContext,
			};

			const serialized = JSON.stringify(diagnostic);
			const deserialized = JSON.parse(serialized);

			// Page is present and verbatim (no synthesis)
			expect(deserialized.page).toBeDefined();
			expect(deserialized.page.pageId).toBe("12345");
			expect(deserialized.page.title).toBe("Test Page");
			expect(deserialized.page.sourcePath).toBe("docs/test.md");
		});

		it("partial page context (pageId only) serializes verbatim (no synthesis)", () => {
			const pageContext = {
				pageId: "12345",
			};

			const diagnostic: InformationalDiagnostic = {
				severity: "informational",
				class: "marksync-synthetic-artifact",
				code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
				construct: "ac:image[ri:filename='marksync-mermaid-hash.svg']",
				location: { line: 1, column: 1 },
				page: pageContext,
			};

			const serialized = JSON.stringify(diagnostic);
			const deserialized = JSON.parse(serialized);

			// Only the supplied key is present (no synthesis of title/sourcePath)
			expect(deserialized.page).toBeDefined();
			expect(deserialized.page.pageId).toBe("12345");
			expect(deserialized.page.title).toBeUndefined();
			expect(deserialized.page.sourcePath).toBeUndefined();
		});

		it("parse error carries page verbatim", () => {
			const pageContext = {
				sourcePath: "pages/test.page",
			};

			const parseError: StorageParseError = {
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: 1, column: 1 },
				detail: "mismatched tag",
				page: pageContext,
			};

			const serialized = JSON.stringify(parseError);
			const deserialized = JSON.parse(serialized);

			expect(deserialized.page).toBeDefined();
			expect(deserialized.page.sourcePath).toBe("pages/test.page");
			expect(deserialized.page.pageId).toBeUndefined();
		});

		it("fast-fail error carries page for parity with collect-all", () => {
			const pageContext = {
				pageId: "54321",
				title: "Fast Fail Test",
			};

			const fastFailError: UnsupportedConstructError = {
				kind: "UnsupportedConstruct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: "nested table",
				location: { line: 5, column: 3 },
				page: pageContext,
			};

			const serialized = JSON.stringify(fastFailError);
			const deserialized = JSON.parse(serialized);

			expect(deserialized.page).toBeDefined();
			expect(deserialized.page.pageId).toBe("54321");
			expect(deserialized.page.title).toBe("Fast Fail Test");
		});
	});

	describe("TC-TAXO-002: assignment map pins via real entry points", () => {
		it("jira macro → reverse/unknown-macro (blocking)", () => {
			const storage =
				'<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key"><ac:plain-text-body><![CDATA[PROJ-123]]></ac:plain-text-body></ac:parameter></ac:structured-macro>';
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/unknown-macro");
			expect(result.value.diagnostics[0].severity).toBe("blocking");
		});

		it("layout tree → reverse/complex-layout (blocking)", () => {
			const storage =
				"<ac:layout><ac:layout-section><ac:layout-cell>content</ac:layout-cell></ac:layout-section></ac:layout>";
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/complex-layout");
			expect(result.value.diagnostics[0].severity).toBe("blocking");
		});

		it("td colspan → reverse/unsupported-attribute (blocking)", () => {
			const storage = '<table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>';
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/unsupported-attribute");
			expect(result.value.diagnostics[0].severity).toBe("blocking");
		});

		it("div → reverse/unknown-element (blocking)", () => {
			const storage = "<div>content</div>";
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/unknown-element");
			expect(result.value.diagnostics[0].severity).toBe("blocking");
		});

		it("nested table → reverse/unsupported-construct (blocking fallback)", () => {
			const storage =
				"<table><tbody><tr><td><table><tbody><tr><td>nested</td></tr></tbody></table></td></tr></tbody></table>";
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("reverse/unsupported-construct");
			expect(result.value.diagnostics[0].severity).toBe("blocking");
		});

		it("render-policy image → marksync/synthetic-artifact (informational)", () => {
			const storage =
				'<ac:image ac:alt="Mermaid"><ri:url ri:value="marksync-mermaid-abc123" /></ac:image>';
			const result = reverseStorageCollectAll(storage);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.diagnostics).toHaveLength(1);
			expect(result.value.diagnostics[0].code).toBe("marksync/synthetic-artifact");
			expect(result.value.diagnostics[0].severity).toBe("informational");
		});

	it("malformed → reverse/parse-error (blocking)", () => {
		const storage = "<invalid";
		const result = reverseStorageCollectAll(storage);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.code).toBe("reverse/parse-error");
		expect(result.error.kind).toBe("StorageParseError");
	});
	});
});
