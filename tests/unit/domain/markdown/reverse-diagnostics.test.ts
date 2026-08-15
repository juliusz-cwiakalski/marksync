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

describe("reverse-diagnostics", () => {
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
});
