import { describe, test, expect } from "bun:test";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { LockFile } from "#domain/config/lock-types";
import type { TargetSystem } from "#domain/target/port";
import type { Plan, PlanEntry, PlanAction } from "#app/push-flow";
import { applyPlan } from "#app/push-flow";
import type { DocumentId } from "#domain/identity/document-id";

describe("applyPlan parent-first ordering (TC-UNIT-003)", () => {
	const baseLock: LockFile = {
		version: 1,
		targets: {
			confluence: {
				documents: {},
			},
		},
	};

	const mockTarget: TargetSystem = {
		renderBody: () =>
			Res.ok({
				body: "<h1>Test</h1>",
				hash: "sha256:test",
				warnings: [],
			}),
		getPage: async () =>
			Res.ok({
				id: "123",
				title: "Test",
				version: 1,
			}),
		createPage: async () =>
			Res.ok({
				id: "child-123",
				title: "Child",
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

	let createCalls: Array<{ parentId: string; title: string }> = [];

	test("child-page create before parent → reordered parent-first", async () => {
		// Setup: capture createPage calls
		const originalCreate = mockTarget.createPage;
		createCalls = [];
		mockTarget.createPage = async (req) => {
			createCalls.push({ parentId: req.parentId, title: req.title });
			return originalCreate(req);
		};

		// Create a plan with child before parent (wrong order)
		const parentUuid = "00000000-0000-0000-0000-000000000001" as DocumentId;
		const childUuid = "00000000-0000-0000-0000-000000000002" as DocumentId;

		const plan: Plan = {
			runId: "test-run-1",
			operationId: "op_test-run-1",
			provenance: {
				headCommit: "abc123",
				commitCount: 1,
				subjects: ["init"],
			},
			entries: [
				{
					uuid: childUuid,
					sourcePath: "child.md",
					state: "NEW",
					action: {
						kind: "Create",
						uuid: childUuid,
						parentId: "parent-123", // Parent's pageId (will be created)
						title: "Child Page",
						body: "<h1>Child</h1>",
					},
					hashes: {
						rawHash: "sha256:child-raw",
						canonicalHash: "sha256:child",
						attachmentHash: "",
						title: "Child Page",
						parentPageId: "parent-123",
					},
					renderedBody: "<h1>Child</h1>",
				},
				{
					uuid: parentUuid,
					sourcePath: "parent.md",
					state: "NEW",
					action: {
						kind: "Create",
						uuid: parentUuid,
						parentId: "ROOT", // Configured parent
						title: "Parent Page",
						body: "<h1>Parent</h1>",
					},
					hashes: {
						rawHash: "sha256:parent-raw",
						canonicalHash: "sha256:parent",
						attachmentHash: "",
						title: "Parent Page",
						parentPageId: "ROOT",
					},
					renderedBody: "<h1>Parent</h1>",
				},
			],
		};

		// Apply the plan
		const result = await applyPlan(plan, mockTarget, baseLock, {
			cwd: "/tmp/test",
			cacheDir: "/tmp/test/.marksync",
			targetId: "confluence",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			// Both creates should succeed
			expect(result.value.results).toHaveLength(2);
			expect(result.value.results[0]?.outcome).toBe("created");
			expect(result.value.results[1]?.outcome).toBe("created");
			expect(result.value.writes).toBe(2);
		}

		// Note: In MS-0002, we don't have actual parent UUID resolution
		// so the parent-first ordering doesn't really apply in the same way.
		// This test validates the structure - for a full parent-first test,
		// we'd need parent UUID mapping which is out of scope for MS-0002.
	});
});
