import { describe, test, expect } from "bun:test";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { TargetSystem } from "#domain/target/port";
import type { Plan, PlanEntry } from "#app/push-flow";
import { applyPlan } from "#app/push-flow";
import type { DocumentId } from "#domain/identity/document-id";
import { formatVersionMessage } from "#infra/confluence/provenance";

describe("applyPlan provenance wiring (TC-UNIT-002)", () => {
	const baseLock: LockFile = {
		version: 1,
		targets: {
			confluence: {
				documents: {
					"00000000-0000-0000-0000-000000000001": {
						uuid: "00000000-0000-0000-0000-000000000001" as DocumentId,
						sourcePath: "doc.md",
						pageId: "page-123",
						parentPageId: "ROOT",
						pageVersion: 1,
						sourceCommit: "old-sha",
						sourceContentHash: "sha256:old",
						renderedBodyHash: "sha256:old",
						remoteBodyHash: "sha256:old",
						attachmentHashes: {},
						operationId: "op_old",
						synchronizedAt: "2024-01-01T00:00:00Z",
						toolVersion: "1.0.0",
					},
				},
			},
		},
	};

	let capturedUpdateMessage: string | undefined;
	let capturedCreateMessage: string | undefined;

	const mockTarget: TargetSystem = {
		renderBody: () =>
			Res.ok({
				body: "<h1>Test</h1>",
				hash: "sha256:new",
				warnings: [],
			}),
		getPage: async () =>
			Res.ok({
				id: "page-123",
				title: "Test",
				version: 1,
				body: "<h1>Old</h1>",
			}),
		createPage: async (req) => {
			capturedCreateMessage = req.message;
			return Res.ok({
				id: "page-456",
				title: req.title,
				version: 1,
			});
		},
		updatePage: async (req) => {
			capturedUpdateMessage = req.message;
			return Res.ok({
				id: req.pageId,
				title: req.title,
				version: 2,
			});
		},
		movePage: async () =>
			Res.ok({
				id: "page-123",
				title: "Test",
				version: 1,
			}),
		getProperty: async () => Res.ok(undefined),
		putProperty: async () => Res.ok(undefined),
		uploadAttachment: async () =>
			Res.ok({
				id: "att-1",
				pageId: "page-123",
				filename: "test.svg",
				hash: "sha256:xyz",
				version: 1,
			}),
		attachmentExists: async () => Res.ok(false),
		listAttachments: async () => Res.ok([]),
		searchPages: async () => Res.ok([{ id: "page-123", title: "Test" }]),
		getRestrictions: async () =>
			Res.ok({
				pageId: "page-123",
				restricted: false,
			}),
	};

	test("provenance message passed on update", async () => {
		capturedUpdateMessage = undefined;

		const plan: Plan = {
			runId: "test-run-1",
			operationId: "op_test-run-1",
			provenance: {
				headCommit: "abc123def456",
				commitCount: 2,
				subjects: ["feat: add feature", "fix: bug"],
			},
			entries: [
				{
					uuid: "00000000-0000-0000-0000-000000000001" as DocumentId,
					sourcePath: "doc.md",
					state: "LOCAL_AHEAD",
					action: {
						kind: "Update",
						uuid: "00000000-0000-0000-0000-000000000001" as DocumentId,
					},
					hashes: {
						rawHash: "sha256:new-raw",
						canonicalHash: "sha256:new",
						attachmentHash: "",
						title: "Test",
						parentPageId: "ROOT",
					},
					renderedBody: "<h1>New</h1>",
				},
			],
		};

		const result = await applyPlan(plan, mockTarget, baseLock, {
			cwd: "/tmp/test",
			cacheDir: "/tmp/test/.marksync",
			targetId: "confluence",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.results[0]?.outcome).toBe("updated");
			expect(result.value.writes).toBe(1);
		}

		// Verify the message was passed to updatePage
		expect(capturedUpdateMessage).toBeDefined();
		const expectedMessage = formatVersionMessage(plan.provenance);
		expect(capturedUpdateMessage).toBe(expectedMessage);
		expect(capturedUpdateMessage).toContain("marksync git abc123def456");
		expect(capturedUpdateMessage).toContain("(2)");
	});

	test("provenance message passed on create", async () => {
		capturedCreateMessage = undefined;

		const newUuid = "00000000-0000-0000-0000-000000000002" as DocumentId;
		const plan: Plan = {
			runId: "test-run-2",
			operationId: "op_test-run-2",
			provenance: {
				headCommit: "sha789xyz",
				commitCount: 1,
				subjects: ["init"],
			},
			entries: [
				{
					uuid: newUuid,
					sourcePath: "new.md",
					state: "NEW",
					action: {
						kind: "Create",
						uuid: newUuid,
						parentId: "ROOT",
						title: "New Doc",
						body: "<h1>New</h1>",
					},
					hashes: {
						rawHash: "sha256:new-raw",
						canonicalHash: "sha256:new",
						attachmentHash: "",
						title: "New Doc",
						parentPageId: "ROOT",
					},
					renderedBody: "<h1>New</h1>",
				},
			],
		};

		const result = await applyPlan(plan, mockTarget, baseLock, {
			cwd: "/tmp/test",
			cacheDir: "/tmp/test/.marksync",
			targetId: "confluence",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.results[0]?.outcome).toBe("created");
			expect(result.value.writes).toBe(1);
		}

		// Verify the message was passed to createPage
		expect(capturedCreateMessage).toBeDefined();
		const expectedMessage = formatVersionMessage(plan.provenance);
		expect(capturedCreateMessage).toBe(expectedMessage);
		expect(capturedCreateMessage).toContain("marksync git sha789xyz");
		expect(capturedCreateMessage).toContain("(1)");
	});
});
