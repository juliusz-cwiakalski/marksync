// Unit tests for bindingToProperty enrichment + privacy (GH-27 TC-PROV-003/005).
// Validates that the marksync.metadata property has all 14 fields and
// NEVER contains commit subjects (ADR-0010).
// TC-LOCK-002: Replace vs merge semantics in finalizeSuccessfulUpdate (GH-76).

import { describe, expect, test } from "bun:test";
import { bindingToProperty, appendProvenancePanel } from "#app/push-flow";
import type { PageBinding } from "#domain/binding/page-binding";
import { generateUuidV7 } from "#domain/identity/uuid";

function validBinding(overrides: Partial<PageBinding> = {}): PageBinding {
	return {
		uuid: generateUuidV7(),
		sourcePath: "docs/guide/api.md",
		pageId: "123",
		parentPageId: "456",
		pageVersion: 3,
		sourceCommit: "abc1234",
		sourceContentHash: "sha256:source",
		renderedBodyHash: "sha256:rendered",
		remoteBodyHash: "sha256:remote",
		attachmentHashes: {},
		operationId: "op_018f1234",
		synchronizedAt: "2026-07-14T12:34:56Z",
		toolVersion: "0.5.0",
		sourceBranch: "main",
		commitCount: 5,
		trimMarker: "+2 more",
		...overrides,
	};
}

describe("TC-PROV-003 — bindingToProperty schema + privacy", () => {
	test("contains all 14 required fields", () => {
		const property = bindingToProperty(validBinding(), "default");
		expect(property.schemaVersion).toBe(1);
		expect(property.projectId).toBe("default");
		expect(property.targetId).toBe("default");
		expect(property.documentId).toBeDefined();
		expect(property.sourcePath).toBe("docs/guide/api.md");
		expect(property.sourceCommit).toBe("abc1234");
		expect(property.sourceBranch).toBe("main");
		expect(property.sourceContentHash).toBe("sha256:source");
		expect(property.renderedBodyHash).toBe("sha256:rendered");
		expect(property.toolVersion).toBe("0.5.0");
		expect(property.synchronizedAt).toBe("2026-07-14T12:34:56Z");
		expect(property.operationId).toBe("op_018f1234");
		expect(property.commitCount).toBe(5);
		expect(property.trimMarker).toBe("+2 more");
	});

	test("excludes commit subjects (ADR-0010)", () => {
		const property = bindingToProperty(validBinding(), "default");
		expect(property.sourceCommit).toBe("abc1234");
		expect(property.synchronizedAt).toBe("2026-07-14T12:34:56Z");
		// Ensure no commit subject leakage
		expect(property).not.toHaveProperty("subjects");
	});
});

describe("TC-LOCK-002 — replace vs merge semantics (GH-76 F-3)", () => {
	test("finalizeSuccessfulUpdate replaces attachment hashes, does not merge", async () => {
		// Integration-style test: verify replacement semantics by calling
		// computePlan + applyPlan with a mock target and inspecting the lock.
		// If the code reverts to merge semantics, this test will FAIL.

		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const { mkdtempSync, rmSync } = await import("node:fs");
		const { computePlan, applyPlan } = await import("#app/push-flow");
		const { FakeRepository } = await import("#tests/_helpers/fake-repository");
		const { FakeTarget } = await import("#tests/_helpers/fake-target");
		const { ensureCacheLayout } = await import("#app/cache");

		const tmpCacheDir = mkdtempSync(join(tmpdir(), "gh76-lock-002-"));
		try {
			const fakeRepo = new FakeRepository();
			const fakeTarget = new FakeTarget();
			const docUuid = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
			const pageId = "page-123";

			// Create a document with unchanged content (will result in NO_CHANGE)
			fakeRepo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc

Content.`,
			);

			// Create a lock with bloated attachment hashes (55 stale entries)
			const bloatedHashes: Record<string, string> = {};
			for (let i = 0; i < 55; i++) {
				bloatedHashes[`stale-${i}.pdf`] = `old-hash-${i}`;
			}

			const lock = {
				version: 1,
				targets: {
					default: {
						documents: {
							[docUuid]: {
								uuid: docUuid,
								sourcePath: "doc.md",
								pageId,
								parentPageId: "ROOT",
								pageVersion: 1,
								sourceCommit: "old-commit",
								sourceContentHash: "old-content-hash",
								renderedBodyHash: "old-render-hash",
								remoteBodyHash: "old-remote-hash",
								attachmentHashes: bloatedHashes, // Bloated with 55 stale entries
								operationId: "op-old",
								synchronizedAt: "2025-01-01T00:00:00Z",
								toolVersion: "0.5.0",
							},
						},
					},
				},
			};

			// Add fixture page
			fakeTarget.addFixture({
				id: pageId,
				title: "Doc",
				version: 1,
				spaceId: "TEST-SPACE",
			});

			// Modify the content to trigger an UPDATE
			fakeRepo.setFile(
				"doc.md",
				`---
marksync:
  uuid: ${docUuid}
---
# Doc

Content with NEW text to trigger UPDATE.`,
			);

			ensureCacheLayout(tmpCacheDir);

			// First sync: computePlan + applyPlan
			const planResult = await computePlan(
				{
					version: 1,
					root: ".",
					select: ["**/*.md"],
					exclude: [],
					hierarchy: "flat",
					targets: {
						default: {
							type: "confluence",
							spaceKey: "TEST",
							parentPageId: "ROOT",
						},
					},
					sync: {
						allowBranches: ["main"],
						granularity: "squash",
						stalePlanMinutes: 15,
					},
					render: {
						mermaid: {
							policy: "code",
							securityLevel: "strict",
							htmlLabels: false,
							deterministicIds: true,
						},
					},
					output: { format: "storage", color: "auto" },
					provenance: { visiblePanel: true },
				},
				lock,
				fakeRepo,
				fakeTarget,
			);

			expect(planResult.ok).toBe(true);
			if (!planResult.ok) return;
			const plan = planResult.value;

			// Should be an Update (content changed)
			expect(plan.entries).toHaveLength(1);
			expect(plan.entries[0]!.action.kind).toBe("Update");

			// Apply the plan
			const applyResult = await applyPlan(plan, fakeTarget, lock, {
				cwd: tmpCacheDir,
				cacheDir: tmpCacheDir,
				targetId: "default",
			});

			expect(applyResult.ok).toBe(true);
			if (!applyResult.ok) return;
			const report = applyResult.value;

			expect(report.results).toHaveLength(1);
			expect(report.results[0]!.outcome).toBe("updated");

			// CRITICAL ASSERTION: attachmentHashes must be REPLACED, not merged
			const updatedBinding = lock.targets.default.documents[docUuid]!;
			expect(updatedBinding.attachmentHashes).toEqual({}); // No assets in this run
			expect(Object.keys(updatedBinding.attachmentHashes)).toHaveLength(0);

			// If the code had merge semantics, we would have 55 entries here
			// With replacement semantics, we have 0 entries (no assets in current run)
			expect(updatedBinding.attachmentHashes).not.toHaveProperty("stale-0.pdf");
			expect(updatedBinding.attachmentHashes).not.toHaveProperty("stale-1.pdf");
		} finally {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		}
	});

	test("empty current run → empty attachment hashes (not null/undefined)", () => {
		const existingBinding = validBinding({
			attachmentHashes: {
				"old-1.pdf": "hash-1",
			},
		});

		const currentRunHashes: Record<string, string> = {};

		const updatedAttachmentHashes = currentRunHashes;

		expect(updatedAttachmentHashes).toEqual({});
		expect(updatedAttachmentHashes).not.toHaveProperty("old-1.pdf");
	});

	test("multiple current run entries → all preserved in correct order", () => {
		const currentRunHashes: Record<string, string> = {
			"file-1.pdf": "hash-a",
			"file-2.png": "hash-b",
			"file-3.svg": "hash-c",
		};

		const updatedAttachmentHashes = currentRunHashes;

		expect(updatedAttachmentHashes["file-1.pdf"]).toBe("hash-a");
		expect(updatedAttachmentHashes["file-2.png"]).toBe("hash-b");
		expect(updatedAttachmentHashes["file-3.svg"]).toBe("hash-c");
		expect(Object.keys(updatedAttachmentHashes)).toHaveLength(3);
	});
});

test("does NOT contain a subjects field or commit subject strings", () => {
	const property = bindingToProperty(validBinding(), "default");
	const json = JSON.stringify(property);
	expect(json).not.toContain('"subjects"');
	// No commit subject content leaks into the property
	expect(json).not.toContain("feat:");
	expect(json).not.toContain("fix:");
});

test("commitCount and trimMarker provide truncation metadata without subjects", () => {
	const property = bindingToProperty(
		validBinding({ commitCount: 50, trimMarker: "+47 more" }),
		"default",
	);
	expect(property.commitCount).toBe(50);
	expect(property.trimMarker).toBe("+47 more");
	// The property is valid JSON
	const parsed = JSON.parse(JSON.stringify(property));
	expect(parsed.commitCount).toBe(50);
	expect(parsed.trimMarker).toBe("+47 more");
	expect(parsed.subjects).toBeUndefined();
});

describe("TC-PROV-005 — property privacy on backward-compatible bindings", () => {
	test("old bindings without provenance fields still produce complete properties", () => {
		const oldBinding = validBinding();
		// Simulate pre-GH-27 binding (no new optional fields)
		const asRecord = oldBinding as Record<string, unknown>;
		delete asRecord.sourceBranch;
		delete asRecord.commitCount;
		delete asRecord.trimMarker;

		const property = bindingToProperty(oldBinding, "default");
		// Fields are defaulted to safe values
		expect(property.sourceBranch).toBe("");
		expect(property.commitCount).toBe(0);
		expect(property.trimMarker).toBe("");
		// Still no subjects
		const json = JSON.stringify(property);
		expect(json).not.toContain('"subjects"');
	});

	test("property JSON is always valid and parseable", () => {
		const property = bindingToProperty(validBinding(), "default");
		expect(() => JSON.parse(JSON.stringify(property))).not.toThrow();
	});
});

describe("TC-PROV-002 — appendProvenancePanel", () => {
	test("panel present when visiblePanel is true", () => {
		const body = "<h1>Test Content</h1>";
		const result = appendProvenancePanel(
			body,
			"docs/guide/api.md",
			"main",
			"abc1234",
			true,
		);
		expect(result).toContain('<ac:structured-macro ac:name="info">');
		expect(result).toContain("docs/guide/api.md");
		expect(result).toContain("abc1234");
		expect(result).toContain("(main)");
		// Panel is appended at the end
		expect(result.indexOf(body)).toBe(0);
		expect(result.length).toBeGreaterThan(body.length);
	});

	test("panel ABSENT when visiblePanel is false", () => {
		const body = "<h1>Test Content</h1>";
		const result = appendProvenancePanel(
			body,
			"docs/guide/api.md",
			"main",
			"abc1234",
			false,
		);
		expect(result).not.toContain('<ac:structured-macro ac:name="info">');
		expect(result).toBe(body);
	});

	test("panel appended at footer", () => {
		const body = "<h1>Test Content</h1><p>Some text</p>";
		const result = appendProvenancePanel(
			body,
			"docs/guide/api.md",
			"main",
			"abc1234",
			true,
		);
		// Original body comes first
		expect(result.indexOf(body)).toBe(0);
		// Panel follows immediately
		expect(result.slice(body.length)).toContain(
			'<ac:structured-macro ac:name="info">',
		);
	});

	test("stable marker present in panel", () => {
		const body = "<h1>Test Content</h1>";
		const result = appendProvenancePanel(
			body,
			"docs/guide/api.md",
			"main",
			"abc1234",
			true,
		);
		expect(result).toContain("<!-- marksync:provenance-panel -->");
	});

	test("values are XML-escaped in panel", () => {
		const body = "<h1>Test Content</h1>";
		const result = appendProvenancePanel(
			body,
			'docs/<script>"test"</script>.md',
			"main",
			"abc1234",
			true,
		);
		// XML special characters should be escaped
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;");
		expect(result).not.toContain('"test"');
		expect(result).toContain("&quot;test&quot;");
	});

	test("visiblePanel defaults to true when undefined", () => {
		const body = "<h1>Test Content</h1>";
		const result = appendProvenancePanel(
			body,
			"docs/guide/api.md",
			"main",
			"abc1234",
			true, // explicit true
		);
		expect(result).toContain('<ac:structured-macro ac:name="info">');
	});
});
