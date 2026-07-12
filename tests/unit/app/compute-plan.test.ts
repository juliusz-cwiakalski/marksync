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
				Promise.resolve(
					Res.ok(
						new Map([
							["doc-a.md", new TextEncoder().encode(docAContent)],
							["doc-b.md", new TextEncoder().encode(docBContent)],
						]),
					),
				),
			headSha: () => Promise.resolve(Res.ok("abc123")),
			currentBranch: () => Promise.resolve(Res.ok("main")),
			listCommitSubjects: () => Promise.resolve(Res.ok(["init"])),
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
				Promise.resolve(
					Res.ok(new Map([["doc.md", new TextEncoder().encode("# Test")]])),
				),
			headSha: () => Promise.resolve(Res.ok("abc123")),
			currentBranch: () => Promise.resolve(Res.ok("feature/x")),
			listCommitSubjects: () => Promise.resolve(Res.ok(["init"])),
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
				Promise.resolve(
					Res.ok(
						new Map([["new-doc.md", new TextEncoder().encode(docContent)]]),
					),
				),
			headSha: () => Promise.resolve(Res.ok("abc123")),
			currentBranch: () => Promise.resolve(Res.ok("main")),
			listCommitSubjects: () => Promise.resolve(Res.ok(["init"])),
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
				Promise.resolve(
					Res.ok(new Map([["doc.md", new TextEncoder().encode(docContent)]])),
				),
			headSha: () => Promise.resolve(Res.ok("abc123")),
			currentBranch: () => Promise.resolve(Res.ok("main")),
			listCommitSubjects: () => Promise.resolve(Res.ok(["init"])),
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
});
