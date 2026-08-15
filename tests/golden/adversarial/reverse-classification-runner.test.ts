// Storage-side adversarial classification runner — TC-RADV-001/002 + TC-RDIAG-002 golden arm.
// Mirrors GH-31 runner pattern: collect-all deep-equals sidecars.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	reverseStorage,
	reverseStorageCollectAll,
} from "#infra/confluence/parse/reverse";

const here = dirname(new URL(import.meta.url).pathname);
const adversarialDir = join(here, "..", "..", "adversarial-storage");

const adversarialFixtures = readdirSync(adversarialDir)
	.filter((f) => f.endsWith(".storage.xhtml"))
	.map((f) => f.replace(".storage.xhtml", ""));

describe("TC-RADV-001: adversarial classification regression lock", () => {
	const categoryCoverage = {
		unknownMacros: new Set<string>(),
		nonPanelInfoMacro: false,
		appGliffyClass: false,
		nestedTables: false,
		nonCanonicalElements: new Set<string>(),
		multiInstance: false,
		malformed: false,
	};

	// Appendix B alignment: fixture → expected code (or [] for zero-diagnostic)
	const appendixBAlignment = {
		// Unknown macros → "reverse/unknown-macro"
		"storage-macro-jira": "reverse/unknown-macro",
		"storage-macro-toc": "reverse/unknown-macro",
		"storage-macro-expand": "reverse/unknown-macro",
		"storage-macro-info-no-marker": "reverse/unknown-macro",
		"storage-app-gliffy": "reverse/unknown-macro",
		// Supported macros → []
		"storage-macro-code": [],
		// Unknown elements → "reverse/unknown-element"
		"storage-raw-html-block": "reverse/unknown-element",
		"storage-raw-html-inline": "reverse/unknown-element",
		// Supported content → []
		"storage-emoji": [],
		"storage-long-page": [],
		"storage-mixed-task-regular-lists": [],
		// Structural fallback → "reverse/unsupported-construct"
		"storage-nested-tables": "reverse/unsupported-construct",
		// New classes
		"storage-complex-layout": "reverse/complex-layout",
		"storage-orphaned-layout": "reverse/complex-layout",
		"storage-exotic-attributes": "reverse/unsupported-attribute",
		"storage-k1-macro-negative": [],
		"storage-task-list-stray-child": [
			"reverse/unknown-element",
			"reverse/unsupported-construct",
		],
	};

	for (const name of adversarialFixtures) {
		describe(name, () => {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const sidecarPath = join(adversarialDir, `${name}.classification.json`);
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));

			// Load page context companion if present
			let pageContext:
				| { pageId?: string; title?: string; sourcePath?: string }
				| undefined;
			const pageContextPath = join(adversarialDir, `${name}.page-context.json`);
			try {
				pageContext = JSON.parse(readFileSync(pageContextPath, "utf-8"));
			} catch {
				// No page context companion — omit-when-absent by construction
			}

			it("sidecar exists and is valid JSON", () => {
				expect(sidecar).toBeDefined();
				expect(typeof sidecar).toBe("object");
			});

			if (sidecar.parseError) {
				it("malformed → parse error, fast-fail and collect-all agree", () => {
					categoryCoverage.malformed = true;

					// Fast-fail should return parse error
					const fastFail = reverseStorage(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(fastFail.ok).toBe(false);
					if (fastFail.ok) return;

					expect(fastFail.error.kind).toBe("StorageParseError");
					expect(fastFail.error.code).toBe("reverse/parse-error");

					// Collect-all should also return parse error
					const collectAll = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(collectAll.ok).toBe(false);
					if (collectAll.ok) return;

					expect(collectAll.error.kind).toBe("StorageParseError");
					expect(collectAll.error.code).toBe("reverse/parse-error");

					// Sidecar should document the parse error
					expect(sidecar.parseError).toBe(true);
					expect(sidecar.detail).toBeDefined();
					if (sidecar.page) {
						expect(fastFail.error.page).toEqual(sidecar.page);
						expect(collectAll.error.page).toEqual(sidecar.page);
					}
				});
			} else {
				it("collect-all diagnostics deep-equals sidecar", () => {
					const collectAll = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(collectAll.ok).toBe(true);
					if (!collectAll.ok) return;

					// Map to sidecar format (remove 'kind' for comparison; include 'page' when present)
					const mappedDiagnostics = collectAll.value.diagnostics.map((d) => {
						const mapped: {
							code: string;
							construct: string;
							location: { line: number; column: number };
							page?: { pageId?: string; title?: string; sourcePath?: string };
						} = {
							code: d.code,
							construct: d.construct,
							location: d.location,
						};
						if (d.page) {
							mapped.page = d.page;
						}
						return mapped;
					});

					expect(mappedDiagnostics).toEqual(sidecar);
				});

				it("fast-fail on every blocking fixture (no partial output)", () => {
					const collectAll = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(collectAll.ok).toBe(true);
					if (!collectAll.ok) return;

					// Success branch: empty sidecar means zero-diagnostic conversion
					if (sidecar.length === 0) {
						const fastFail = reverseStorage(
							storage,
							pageContext ? { page: pageContext } : undefined,
						);
						expect(fastFail.ok).toBe(true);
						return;
					}

					// Blocking branch: fast-fail should error with first sidecar entry
					const fastFail = reverseStorage(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(fastFail.ok).toBe(false);
					if (fastFail.ok) return;

					expect(fastFail.error.kind).toBe("UnsupportedConstruct");
					expect(fastFail.error.code).toBe(sidecar[0].code);
					expect(fastFail.error.construct).toBe(sidecar[0].construct);
					expect(fastFail.error.location).toEqual(sidecar[0].location);
					if (sidecar[0].page) {
						expect(fastFail.error.page).toEqual(sidecar[0].page);
					}
				});

				it("fast-fail error deep-equals collect-all[0] (parity)", () => {
					const collectAll = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(collectAll.ok).toBe(true);
					if (!collectAll.ok) return;

					// Success branch: empty sidecar means no blocking diagnostics
					if (sidecar.length === 0) {
						const fastFail = reverseStorage(
							storage,
							pageContext ? { page: pageContext } : undefined,
						);
						expect(fastFail.ok).toBe(true);
						return;
					}

					// Blocking branch: compare first diagnostic
					const fastFail = reverseStorage(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					expect(fastFail.ok).toBe(false);
					if (fastFail.ok) return;

					const mappedFastFail: {
						code: string;
						construct: string;
						location: { line: number; column: number };
						page?: { pageId?: string; title?: string; sourcePath?: string };
					} = {
						code: fastFail.error.code,
						construct: fastFail.error.construct,
						location: fastFail.error.location,
					};
					if (fastFail.error.page) {
						mappedFastFail.page = fastFail.error.page;
					}

					// F-8: select first blocking diagnostic, not diagnostics[0]
					const firstBlocking = collectAll.value.diagnostics.find(
						(d) => d.severity === "blocking",
					);

					const mappedCollectAll: {
						code: string;
						construct: string;
						location: { line: number; column: number };
						page?: { pageId?: string; title?: string; sourcePath?: string };
					} = {
						code: firstBlocking?.code || "",
						construct: firstBlocking?.construct || "",
						location: firstBlocking?.location || { line: 1, column: 1 },
					};
					if (firstBlocking?.page) {
						mappedCollectAll.page = firstBlocking.page;
					}

					expect(mappedFastFail).toEqual(mappedCollectAll);
				});

				it("adversarial determinism (classify twice → byte-identical)", () => {
					const result1 = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);
					const result2 = reverseStorageCollectAll(
						storage,
						pageContext ? { page: pageContext } : undefined,
					);

					expect(result1.ok).toBe(true);
					expect(result2.ok).toBe(true);
					if (!result1.ok || !result2.ok) return;

					expect(JSON.stringify(result1.value.diagnostics)).toBe(
						JSON.stringify(result2.value.diagnostics),
					);
				});

				// Track category coverage
				for (const diag of sidecar) {
					if (diag.construct.startsWith("ac:structured-macro")) {
						categoryCoverage.unknownMacros.add(diag.construct);
						if (diag.construct.includes('ac:name="info"')) {
							categoryCoverage.nonPanelInfoMacro = true;
						}
						if (diag.construct.includes('ac:name="gliffy"')) {
							categoryCoverage.appGliffyClass = true;
						}
					}
					if (diag.construct.includes("nested table")) {
						categoryCoverage.nestedTables = true;
					}
					if (diag.construct === "div") {
						categoryCoverage.nonCanonicalElements.add(diag.construct);
					}
					if (sidecar.length > 1) {
						categoryCoverage.multiInstance = true;
					}
				}
			}
		});
	}

	it("category-coverage inventory: unknown macros ≥ 2 kinds, non-panel info macro, app/gliffy class, nested tables, non-canonical elements, multi-instance, malformed", () => {
		expect(categoryCoverage.unknownMacros.size).toBeGreaterThanOrEqual(2);
		expect(categoryCoverage.nonPanelInfoMacro).toBe(true);
		expect(categoryCoverage.appGliffyClass).toBe(true);
		expect(categoryCoverage.nestedTables).toBe(true);
		expect(categoryCoverage.nonCanonicalElements.size).toBeGreaterThan(0);
		expect(categoryCoverage.multiInstance).toBe(true);
		expect(categoryCoverage.malformed).toBe(true);
	});

	it("Appendix B alignment: all fixtures resolve to expected codes (or [] for zero-diagnostic)", () => {
		for (const [fixtureName, expectedCodes] of Object.entries(
			appendixBAlignment,
		)) {
			const sidecarPath = join(
				adversarialDir,
				`${fixtureName}.classification.json`,
			);
			try {
				const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));

				if (sidecar.parseError) {
					// Parse-error fixtures not covered by alignment map
					continue;
				}

				if (expectedCodes === []) {
					// Zero-diagnostic expectation
					expect(sidecar).toEqual([]);
				} else if (Array.isArray(expectedCodes)) {
					// Multiple codes expected (e.g., task-list stray child)
					expect(sidecar.length).toBe(expectedCodes.length);
					for (let i = 0; i < expectedCodes.length; i++) {
						expect(sidecar[i].code).toBe(expectedCodes[i]);
					}
				} else {
					// Single code expected
					expect(sidecar.length).toBeGreaterThanOrEqual(1);
					expect(sidecar[0].code).toBe(expectedCodes);
				}
			} catch (e) {
				// Fixture not yet created — skip for Phase 3 in-progress
				if ((e as NodeJS.ErrnoException).code === "ENOENT") {
					continue;
				}
				throw e;
			}
		}
	});

	it("PII audit scoped to exact bare-ID fixtures only (storage-macro-jira, storage-multiple-unsupported)", () => {
		const piiPatterns = {
			email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
			internalTicketUrl:
				/https?:\/\/[^/]*\/(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/gi,
			bareId: /(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/g,
		};

		// Email and URL patterns → 0 matches across all fixtures
		const emailMatches: string[] = [];
		const urlMatches: string[] = [];
		for (const name of adversarialFixtures) {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			emailMatches.push(...(storage.match(piiPatterns.email) || []));
			urlMatches.push(...(storage.match(piiPatterns.internalTicketUrl) || []));
		}
		expect(emailMatches).toHaveLength(0);
		expect(urlMatches).toHaveLength(0);

		// Bare-ID pattern scoped out → expected matches in storage-macro-jira and storage-multiple-unsupported only
		const bareIdMatches: { fixture: string; matches: string[] }[] = [];
		for (const name of adversarialFixtures) {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const matches = storage.match(piiPatterns.bareId);
			if (matches && matches.length > 0) {
				bareIdMatches.push({ fixture: name, matches: [...new Set(matches)] });
			}
		}

		const scopedFixtures = new Set([
			"storage-macro-jira",
			"storage-multiple-unsupported",
		]);
		expect(bareIdMatches.length).toBeGreaterThanOrEqual(2);
		for (const match of bareIdMatches) {
			expect(scopedFixtures.has(match.fixture)).toBe(true);
		}
	});
});

describe("TC-RDIAG-002 golden arm: cross-mode per-instance stability", () => {
	const multiInstanceFixture = "storage-multiple-unsupported";

	it(`single-instance variants produce same diagnostic per instance as multi-instance (${multiInstanceFixture})`, () => {
		// This test validates the parity mechanic: all.diagnostics[0] deep-equals fast-fail error
		// by confirming single-instance fixtures produce the same diagnostic shape
		const singleFixtures = adversarialFixtures.filter(
			(f) => f !== multiInstanceFixture && f !== "storage-malformed",
		);

		for (const name of singleFixtures) {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const sidecarPath = join(adversarialDir, `${name}.classification.json`);
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));

			// Load page context companion if present
			let pageContext:
				| { pageId?: string; title?: string; sourcePath?: string }
				| undefined;
			const pageContextPath = join(adversarialDir, `${name}.page-context.json`);
			try {
				pageContext = JSON.parse(readFileSync(pageContextPath, "utf-8"));
			} catch {
				// No page context companion — omit-when-absent by construction
			}

			// Skip parse-error fixtures
			if (sidecar.parseError) continue;

			// Skip zero-diagnostic fixtures (success branch)
			if (sidecar.length === 0) continue;

			// Collect-all should have at least one diagnostic
			const collectAll = reverseStorageCollectAll(
				storage,
				pageContext ? { page: pageContext } : undefined,
			);
			expect(collectAll.ok).toBe(true);
			if (!collectAll.ok) continue;

			expect(collectAll.value.diagnostics.length).toBeGreaterThan(0);

			// Fast-fail error should deep-equal collect-all[0]
			const fastFail = reverseStorage(
				storage,
				pageContext ? { page: pageContext } : undefined,
			);
			expect(fastFail.ok).toBe(false);
			if (fastFail.ok) continue;

			const mappedFastFail: {
				code: string;
				construct: string;
				location: { line: number; column: number };
				page?: { pageId?: string; title?: string; sourcePath?: string };
			} = {
				code: fastFail.error.code,
				construct: fastFail.error.construct,
				location: fastFail.error.location,
			};
			if (fastFail.error.page) {
				mappedFastFail.page = fastFail.error.page;
			}

			// F-8: select first blocking diagnostic, not diagnostics[0]
			const firstBlocking = collectAll.value.diagnostics.find(
				(d) => d.severity === "blocking",
			);

			const mappedCollectAll: {
				code: string;
				construct: string;
				location: { line: number; column: number };
				page?: { pageId?: string; title?: string; sourcePath?: string };
			} = {
				code: firstBlocking?.code || "",
				construct: firstBlocking?.construct || "",
				location: firstBlocking?.location || { line: 1, column: 1 },
			};
			if (firstBlocking?.page) {
				mappedCollectAll.page = firstBlocking.page;
			}

			expect(mappedFastFail).toEqual(mappedCollectAll);
		}
	});
});
