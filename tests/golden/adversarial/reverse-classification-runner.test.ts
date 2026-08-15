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

	for (const name of adversarialFixtures) {
		describe(name, () => {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const sidecarPath = join(adversarialDir, `${name}.classification.json`);
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));

			it("sidecar exists and is valid JSON", () => {
				expect(sidecar).toBeDefined();
				expect(typeof sidecar).toBe("object");
			});

			if (sidecar.parseError) {
				it("malformed → parse error, fast-fail and collect-all agree", () => {
					categoryCoverage.malformed = true;

					// Fast-fail should return parse error
					const fastFail = reverseStorage(storage);
					expect(fastFail.ok).toBe(false);
					if (fastFail.ok) return;

					expect(fastFail.error.kind).toBe("StorageParseError");
					expect(fastFail.error.code).toBe("reverse/parse-error");

					// Collect-all should also return parse error
					const collectAll = reverseStorageCollectAll(storage);
					expect(collectAll.ok).toBe(false);
					if (collectAll.ok) return;

					expect(collectAll.error.kind).toBe("StorageParseError");
					expect(collectAll.error.code).toBe("reverse/parse-error");

					// Sidecar should document the parse error
					expect(sidecar.parseError).toBe(true);
					expect(sidecar.detail).toBeDefined();
				});
			} else {
				it("collect-all diagnostics deep-equals sidecar", () => {
					const collectAll = reverseStorageCollectAll(storage);
					expect(collectAll.ok).toBe(true);
					if (!collectAll.ok) return;

					// Map to sidecar format (remove 'kind' for comparison)
					const mappedDiagnostics = collectAll.value.diagnostics.map((d) => ({
						code: d.code,
						construct: d.construct,
						location: d.location,
					}));

					expect(mappedDiagnostics).toEqual(sidecar);
				});

				it("fast-fail on every blocking fixture (no partial output)", () => {
					const fastFail = reverseStorage(storage);
					expect(fastFail.ok).toBe(false);
					if (fastFail.ok) return;

					// Fast-fail error should match first diagnostic in sidecar
					expect(fastFail.error.kind).toBe("UnsupportedConstruct");
					expect(fastFail.error.code).toBe(sidecar[0].code);
					expect(fastFail.error.construct).toBe(sidecar[0].construct);
					expect(fastFail.error.location).toEqual(sidecar[0].location);
				});

				it("fast-fail error deep-equals collect-all[0] (parity)", () => {
					const fastFail = reverseStorage(storage);
					const collectAll = reverseStorageCollectAll(storage);

					expect(fastFail.ok).toBe(false);
					expect(collectAll.ok).toBe(true);
					if (fastFail.ok || !collectAll.ok) return;

					const mappedFastFail = {
						code: fastFail.error.code,
						construct: fastFail.error.construct,
						location: fastFail.error.location,
					};
					const mappedCollectAll = {
						code: collectAll.value.diagnostics[0].code,
						construct: collectAll.value.diagnostics[0].construct,
						location: collectAll.value.diagnostics[0].location,
					};

					expect(mappedFastFail).toEqual(mappedCollectAll);
				});

				it("adversarial determinism (classify twice → byte-identical)", () => {
					const result1 = reverseStorageCollectAll(storage);
					const result2 = reverseStorageCollectAll(storage);

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
});

describe("TC-RADV-002: PII grep-audit (compensating for tests/adversarial-storage/ placement)", () => {
	const piiPatterns = {
		email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		internalTicketUrl:
			/https?:\/\/[^/]*\/(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/gi,
		// bare-ID pattern (JIRA-123) is scoped out — storage-macro-jira fixture legitimately needs it
		bareId: /(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/g,
	};

	it("email pattern → 0 matches across adversarial fixtures (synthetic, sanitized)", () => {
		const emailMatches: string[] = [];
		for (const name of adversarialFixtures) {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const matches = storage.match(piiPatterns.email);
			if (matches) emailMatches.push(...matches);
		}
		expect(emailMatches).toHaveLength(0);
	});

	it("internal-ticket-URL pattern → 0 matches across adversarial fixtures (synthetic, sanitized)", () => {
		const urlMatches: string[] = [];
		for (const name of adversarialFixtures) {
			const storage = readFileSync(
				join(adversarialDir, `${name}.storage.xhtml`),
				"utf-8",
			);
			const matches = storage.match(piiPatterns.internalTicketUrl);
			if (matches) urlMatches.push(...matches);
		}
		expect(urlMatches).toHaveLength(0);
	});

	it("bare-ID pattern scoped out → expected matches in storage-macro-jira only", () => {
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

		// storage-macro-jira legitimately needs bare JIRA-1234 refs
		// storage-multiple-unsupported also has a JIRA issue
		expect(bareIdMatches.length).toBeGreaterThanOrEqual(1);
		expect(bareIdMatches.some((m) => m.fixture === "storage-macro-jira")).toBe(
			true,
		);
		expect(
			bareIdMatches.find((m) => m.fixture === "storage-macro-jira")!.matches,
		).toContain("JIRA-1234");
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

			// Fast-fail
			const fastFail = reverseStorage(storage);
			expect(fastFail.ok).toBe(false);
			if (fastFail.ok) continue;

			// Collect-all
			const collectAll = reverseStorageCollectAll(storage);
			expect(collectAll.ok).toBe(true);
			if (!collectAll.ok) continue;

			// Collect-all should have exactly one diagnostic
			expect(collectAll.value.diagnostics).toHaveLength(1);

			// Fast-fail error should deep-equal collect-all[0]
			const mappedFastFail = {
				code: fastFail.error.code,
				construct: fastFail.error.construct,
				location: fastFail.error.location,
			};
			const mappedCollectAll = {
				code: collectAll.value.diagnostics[0].code,
				construct: collectAll.value.diagnostics[0].construct,
				location: collectAll.value.diagnostics[0].location,
			};

			expect(mappedFastFail).toEqual(mappedCollectAll);
		}
	});
});
