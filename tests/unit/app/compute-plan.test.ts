import { describe, test, expect } from "bun:test";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { ProjectConfig } from "#domain/config/types";
import type { LockFile } from "#domain/config/lock-types";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { PlanEntry, PlanAction } from "#app/push-flow";
import { computePlan } from "#app/push-flow";
import type { Page } from "#domain/target/port";
import { rawHash } from "#domain/state/hashes";

// Pre-computed hash of the Storage XHTML body for NO_CHANGE fixture
const NO_CHANGE_BODY = "<h1>Doc</h1>";
const NO_CHANGE_HASH = rawHash(NO_CHANGE_BODY);

describe("computePlan", () => {
	const baseConfig: ProjectConfig = {
		version: 1,
		root: "/repo",
		select: ["*.md"],
		exclude: [],
		hierarchy: "flat",
		targets: {
			confluence: {
				type: "confluence",
				spaceKey: "TEST",
				parentPageId: "123",
			},
		},
		sync: {
			allowBranches: ["main"],
			granularity: "squash",
			stalePlanMinutes: 60,
		},
		render: {
			mermaid: {
				policy: "skip",
				securityLevel: "strict",
				htmlLabels: false,
				deterministicIds: false,
			},
		},
		output: {
			format: "storage",
			color: "auto",
		},
		provenance: {
			visiblePanel: false,
		},
	};

	const baseLock: LockFile = {
		version: 1,
		targets: {
			confluence: {
				documents: {},
			},
		},
	};

	test("TC-UNIT-001: duplicate-UUID corpus → err(DuplicateUuid) before any render", async () => {
		const docAContent = `---
marksync:
  uuid: 01234567-89ab-7def-8123-456789abcdef
---
# Doc A
`;
		const docBContent = `---
marksync:
  uuid: 01234567-89ab-7def-8123-456789abcdef
---
# Doc B
`;

		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(
					new Map([
						["doc-a.md", new TextEncoder().encode(docAContent)],
						["doc-b.md", new TextEncoder().encode(docBContent)],
					]),
				),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Test</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Test",
						version: 1,
						body: "<h1>Test</h1>",
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		let renderBodyCallCount = 0;
		const renderBodySpy = mockTarget.renderBody.bind(mockTarget);
		mockTarget.renderBody = (...args) => {
			renderBodyCallCount++;
			return renderBodySpy(...args);
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe("DuplicateUuid");
			expect(result.error.uuid).toBe("01234567-89ab-7def-8123-456789abcdef");
			expect(result.error.paths).toEqual(["doc-a.md", "doc-b.md"]);
		}

		// Assert 0 calls to renderBody (fatal gate BEFORE any render)
		expect(renderBodyCallCount).toBe(0);
	});

	test("TC-UNIT-007: non-allowed branch → err(ForbiddenBranch) before discovery", async () => {
		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(new Map([["doc.md", new TextEncoder().encode("# Test")]])),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("feature/x"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Test</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Test",
						version: 1,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		let readCommittedCallCount = 0;
		const readCommittedSpy = mockRepo.readCommitted.bind(mockRepo);
		mockRepo.readCommitted = (...args) => {
			readCommittedCallCount++;
			return readCommittedSpy(...args);
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe("ForbiddenBranch");
			expect(result.error.branch).toBe("feature/x");
			expect(result.error.allowed).toEqual(["main"]);
		}

		// Assert 0 calls to readCommitted (gate BEFORE discovery)
		expect(readCommittedCallCount).toBe(0);
	});

	test("unbound doc with UUID → NEW + Create action", async () => {
		const docContent = `---
marksync:
  uuid: 01234567-89ab-7def-8123-456789abcdef
---
# New Doc
`;

		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(new Map([["new-doc.md", new TextEncoder().encode(docContent)]])),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>New Doc</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Test",
						version: 1,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.entries).toHaveLength(1);
			const entry = result.value.entries[0]!;
			expect(entry.state).toBe("NEW");
			expect(entry.action.kind).toBe("Create");
			expect((entry.action as PlanAction & { kind: "Create" }).uuid).toBe(
				"01234567-89ab-7def-8123-456789abcdef",
			);
			expect((entry.action as PlanAction & { kind: "Create" }).parentId).toBe(
				"123",
			);
		}
	});

	test("bound doc NO_CHANGE → NoOp action", async () => {
		const docContent = `---
marksync:
  uuid: 01234567-89ab-7def-8123-456789abcdef
---
# Doc
`;

		const lockWithBinding: LockFile = {
			version: 1,
			targets: {
				confluence: {
					documents: {
						"01234567-89ab-7def-8123-456789abcdef": {
							uuid: "01234567-89ab-7def-8123-456789abcdef" as const,
							sourcePath: "doc.md",
							pageId: "456",
							parentPageId: "123",
							pageVersion: 1,
							sourceCommit: "abc123",
							sourceContentHash: "sha256:local",
							renderedBodyHash: NO_CHANGE_HASH, // Use adapter's hash
							remoteBodyHash: NO_CHANGE_HASH, // Raw hash of Storage XHTML
							attachmentHashes: {},
							operationId: "op_old",
							synchronizedAt: "2024-01-01T00:00:00Z",
							toolVersion: "1.0.0",
						},
					},
				},
			},
		};

		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(new Map([["doc.md", new TextEncoder().encode(docContent)]])),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		let capturedHast: unknown | undefined;
		const mockTarget: TargetSystem = {
			renderBody: (hast) => {
				capturedHast = hast;
				return Res.ok({
					body: NO_CHANGE_BODY,
					hash: NO_CHANGE_HASH, // Adapter's canonical hash (same for unchanged)
					warnings: [],
				});
			},
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "456",
						title: "Doc",
						version: 1,
						body: NO_CHANGE_BODY, // Same Storage XHTML
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		// Spy on renderBody to capture hast
		const renderBodySpy = mockTarget.renderBody.bind(mockTarget);
		mockTarget.renderBody = renderBodySpy;

		const result = await computePlan(
			baseConfig,
			lockWithBinding,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.entries).toHaveLength(1);
			const entry = result.value.entries[0]!;
			expect(entry.state).toBe("NO_CHANGE");
			expect(entry.action.kind).toBe("NoOp");
		}
	});

	// GH-74 F-3: TC-PLAN-001 — Single UUID-less doc → one warning, no entry
	test("TC-PLAN-001: single UUID-less doc → one exact warning, no entry", async () => {
		const docContent = "# Doc without UUID\n";
		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(
					new Map([["doc-no-uuid.md", new TextEncoder().encode(docContent)]]),
				),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Doc without UUID</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Doc without UUID",
						version: 1,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Doc without UUID",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Doc without UUID",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Doc without UUID",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () =>
				Res.ok([{ id: "123", title: "Doc without UUID" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Assert one warning with exact text
			expect(result.value.warnings).toHaveLength(1);
			expect(result.value.warnings[0]).toBe(
				"doc-no-uuid.md: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync",
			);

			// Assert no entries for UUID-less doc
			expect(result.value.entries).toHaveLength(0);
		}
	});

	// GH-74 F-3: TC-PLAN-002 — Multiple UUID-less docs → one warning per doc, no entries
	test("TC-PLAN-002: multiple UUID-less docs → one warning per doc, no entries", async () => {
		const doc1Content = "# Doc 1\n";
		const doc2Content = "# Doc 2\n";
		const doc3Content = "# Doc 3\n";
		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(
					new Map([
						["doc1.md", new TextEncoder().encode(doc1Content)],
						["doc2.md", new TextEncoder().encode(doc2Content)],
						["doc3.md", new TextEncoder().encode(doc3Content)],
					]),
				),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Test</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Test",
						version: 1,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Assert one warning per doc (3 warnings total)
			expect(result.value.warnings).toHaveLength(3);

			// Assert each warning has exact text with correct path substitution
			const warningPaths = result.value.warnings.map((w) => w.split(":")[0]);
			expect(warningPaths).toContain("doc1.md");
			expect(warningPaths).toContain("doc2.md");
			expect(warningPaths).toContain("doc3.md");

			// Assert exact text format for each warning
			for (const warning of result.value.warnings) {
				expect(warning).toMatch(
					/^[^:]+: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync$/,
				);
			}

			// Assert no entries for UUID-less docs
			expect(result.value.entries).toHaveLength(0);
		}
	});

	// GH-74 F-3: TC-PLAN-003 — Mixed UUID-less + UUID-bearing → warnings only for UUID-less, entries only for UUID-bearing
	test("TC-PLAN-003: mixed UUID-less + UUID-bearing → warnings only for UUID-less, entries only for UUID-bearing", async () => {
		const docWithUuid = `---
marksync:
  uuid: 01234567-89ab-7def-8123-456789abcdef
---
# Doc with UUID
`;
		const docWithoutUuid = "# Doc without UUID\n";
		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(
					new Map([
						["with-uuid.md", new TextEncoder().encode(docWithUuid)],
						["without-uuid.md", new TextEncoder().encode(docWithoutUuid)],
					]),
				),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Doc with UUID</h1>",
					hash: NO_CHANGE_HASH,
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Doc with UUID",
						version: 1,
						body: NO_CHANGE_BODY,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Doc with UUID",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Doc with UUID",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Doc with UUID",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Doc with UUID" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Assert one warning for the UUID-less doc only
			expect(result.value.warnings).toHaveLength(1);
			expect(result.value.warnings[0]).toBe(
				"without-uuid.md: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync",
			);

			// Assert one entry for the UUID-bearing doc only
			expect(result.value.entries).toHaveLength(1);
			expect(result.value.entries[0].uuid).toBe(
				"01234567-89ab-7def-8123-456789abcdef",
			);
			expect(result.value.entries[0].sourcePath).toBe("with-uuid.md");

			// Assert no overlap
			const entryPaths = result.value.entries.map((e) => e.sourcePath);
			const warningPaths = result.value.warnings.map((w) => w.split(":")[0]);
			const overlap = entryPaths.filter((p) => warningPaths.includes(p));
			expect(overlap).toHaveLength(0);
		}
	});

	// GH-74 F-3: TC-PLAN-004 — All UUID-less docs → empty entries, one warning per doc
	test("TC-PLAN-004: all UUID-less docs → empty entries, one warning per doc", async () => {
		const doc1Content = "# Doc 1\n";
		const doc2Content = "# Doc 2\n";
		const mockRepo: Repository = {
			readCommitted: () =>
				Res.ok(
					new Map([
						["doc1.md", new TextEncoder().encode(doc1Content)],
						["doc2.md", new TextEncoder().encode(doc2Content)],
					]),
				),
			headSha: () => Res.ok("abc123"),
			currentBranch: () => Res.ok("main"),
			listCommitSubjects: () => Res.ok(["init"]),
		};

		const mockTarget: TargetSystem = {
			renderBody: () =>
				Res.ok({
					body: "<h1>Test</h1>",
					hash: "sha256:abc",
					warnings: [],
				}),
			getPage: () =>
				Promise.resolve(
					Res.ok({
						id: "123",
						title: "Test",
						version: 1,
					}),
				),
			createPage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			updatePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				}),
			movePage: async () =>
				Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				}),
			getProperty: async () => Res.ok(undefined),
			putProperty: async () => Res.ok(undefined),
			uploadAttachment: async () =>
				Res.ok({
					id: "att-1",
					pageId: "123",
					filename: "test.svg",
					hash: "sha256:xyz",
					version: 1,
				}),
			attachmentExists: async () => Res.ok(false),
			listAttachments: async () => Res.ok([]),
			searchPages: async () => Res.ok([{ id: "123", title: "Test" }]),
			getRestrictions: async () =>
				Res.ok({
					pageId: "123",
					restricted: false,
				}),
		};

		const result = await computePlan(
			baseConfig,
			baseLock,
			mockRepo,
			mockTarget,
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Assert one warning per doc (2 warnings)
			expect(result.value.warnings).toHaveLength(2);

			// Assert empty entries array
			expect(result.value.entries).toHaveLength(0);

			// Assert both docs are warned
			const warningPaths = result.value.warnings.map((w) => w.split(":")[0]);
			expect(warningPaths).toContain("doc1.md");
			expect(warningPaths).toContain("doc2.md");
		}
	});
});
