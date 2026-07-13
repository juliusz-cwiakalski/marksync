// Integration tests for mermaid rendering through computePlan (TC-MERM-001,
// TC-MERM-003, TC-MERM-006, TC-MERM-008, TC-MERM-011). Uses a mock target with
// a REAL renderStorage body renderer + a stubbed Renderer boundary (no real
// Kroki network calls — testing-strategy §"over-mocking guardrail").

import { describe, expect, test } from "bun:test";
import type { Root } from "hast";
import type {
	Artifact,
	AttachmentRef,
	CreatePageRequest,
	MovePageRequest,
	Page,
	PageRef,
	PageRestrictions,
	RenderBodyOptions,
	RenderedBody,
	TargetSystem,
	UpdatePageRequest,
} from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import { computePlan, uploadAssets } from "#app/push-flow";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { renderStorage } from "#infra/confluence/render/storage";
import { attachmentFilename } from "#infra/confluence/attachments";
import type { Renderer } from "#domain/mermaid/port";

const SVG = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const d = await crypto.subtle.digest(
		"SHA-256",
		bytes as unknown as ArrayBuffer,
	);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Stub renderer returning deterministic fixed SVG for every source. */
class StubRenderer implements Renderer {
	async render(_source: string): Promise<Result<Artifact, MarkSyncError>> {
		const hash = await sha256Hex(SVG);
		return Res.ok({ bytes: SVG, mime: "image/svg+xml", hash, kind: "mermaid" });
	}
}

/** Stub renderer that fails for sources containing "FAIL". */
class SelectiveRenderer implements Renderer {
	async render(source: string): Promise<Result<Artifact, MarkSyncError>> {
		if (source.includes("FAIL")) {
			return Res.err({
				kind: "RemoteUnreachable",
				status: 503,
				cause: "Service Unavailable",
			});
		}
		const hash = await sha256Hex(SVG);
		return Res.ok({ bytes: SVG, mime: "image/svg+xml", hash, kind: "mermaid" });
	}
}

function baseConfig(
	policy: "render" | "code" | "skip" = "render",
): ProjectConfig {
	return {
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
				policy,
				securityLevel: "strict",
				htmlLabels: false,
				deterministicIds: true,
			},
		},
		output: { format: "storage", color: "auto" },
		provenance: { visiblePanel: true },
	};
}

const emptyLock: LockFile = {
	version: 1,
	targets: { default: { documents: {} } },
};

const DOC_UUID = "019f56e4-18f5-7024-bfdf-5438918bb3bc";

function mermaidDoc(source: string): string {
	return `---
marksync:
  uuid: ${DOC_UUID}
---
# Mermaid Doc

\`\`\`mermaid
${source}
\`\`\`
`;
}

/** Mock target: REAL renderStorage for renderBody, recorded upload/exists. */
function makeTarget(): TargetSystem & {
	_uploadCalls: Array<{ pageId: string; artifact: Artifact }>;
	_existsCalls: Array<{ pageId: string; hash: string }>;
	_uploadedHashes: Set<string>;
} {
	const uploadCalls: Array<{ pageId: string; artifact: Artifact }> = [];
	const existsCalls: Array<{ pageId: string; hash: string }> = [];
	const uploadedHashes = new Set<string>();

	const target: TargetSystem & {
		_uploadCalls: typeof uploadCalls;
		_existsCalls: typeof existsCalls;
		_uploadedHashes: typeof uploadedHashes;
	} = {
		renderBody(
			hast: Root,
			opts: RenderBodyOptions,
		): Result<RenderedBody, MarkSyncError> {
			return renderStorage(hast, opts);
		},
		async getPage(id: string): Promise<Result<Page, MarkSyncError>> {
			return Res.ok({ id, title: "Mermaid Doc", version: 1 });
		},
		async createPage(
			req: CreatePageRequest,
		): Promise<Result<Page, MarkSyncError>> {
			return Res.ok({
				id: `page-${Math.random().toString(36).slice(2)}`,
				title: req.title,
				version: 1,
			});
		},
		async updatePage(
			req: UpdatePageRequest,
		): Promise<Result<Page, MarkSyncError>> {
			return Res.ok({ id: req.pageId, title: req.title, version: 2 });
		},
		async movePage(
			_req: MovePageRequest,
		): Promise<Result<Page, MarkSyncError>> {
			return Res.err({ kind: "Forbidden", pageId: "", operation: "move" });
		},
		async getProperty(
			_pageId: string,
			_key: string,
		): Promise<Result<string | undefined, MarkSyncError>> {
			return Res.ok(undefined);
		},
		async putProperty(
			_pageId: string,
			_key: string,
			_value: string,
		): Promise<Result<void, MarkSyncError>> {
			return Res.ok(undefined);
		},
		async uploadAttachment(
			pageId: string,
			artifact: Artifact,
		): Promise<Result<AttachmentRef, MarkSyncError>> {
			uploadCalls.push({ pageId, artifact });
			uploadedHashes.add(artifact.hash);
			return Res.ok({
				id: "att-1",
				pageId,
				filename: attachmentFilename(artifact),
				hash: artifact.hash,
				version: 1,
			});
		},
		async attachmentExists(
			pageId: string,
			hash: string,
		): Promise<Result<boolean, MarkSyncError>> {
			existsCalls.push({ pageId, hash });
			return Res.ok(uploadedHashes.has(hash));
		},
		async listAttachments(
			_pageId: string,
		): Promise<Result<AttachmentRef[], MarkSyncError>> {
			return Res.ok([]);
		},
		async searchPages(_cql: string): Promise<Result<PageRef[], MarkSyncError>> {
			return Res.ok([]);
		},
		async getRestrictions(
			pageId: string,
		): Promise<Result<PageRestrictions, MarkSyncError>> {
			return Res.ok({ pageId, restricted: false });
		},
		_uploadCalls: uploadCalls,
		_existsCalls: existsCalls,
		_uploadedHashes: uploadedHashes,
	};
	return target;
}

describe("TC-MERM-001 render activation (AC-1 / F-1 / F-2 / F-3)", () => {
	test("mermaid fence → <ac:image><ri:attachment> with full-hash filename + 1 artifact", async () => {
		const git = new FakeRepository({
			files: { "doc.md": mermaidDoc("graph TD\nA-->B") },
		});
		const target = makeTarget();
		const renderer = new StubRenderer();

		const planResult = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			renderer,
		);

		expect(planResult.ok).toBe(true);
		if (!planResult.ok) return;
		const entry = planResult.value.entries[0]!;
		const expectedHash = await sha256Hex(SVG);

		// Body contains the attachment image macro with full sha256 filename
		expect(entry.renderedBody).toContain(
			`<ac:image ac:alt="Mermaid diagram"><ri:attachment ri:filename="marksync-mermaid-${expectedHash}.svg"/></ac:image>`,
		);
		// Does NOT contain a code macro for the mermaid fence
		expect(entry.renderedBody).not.toContain('language">mermaid<');

		// Assets include the mermaid artifact
		expect(entry.assets).toHaveLength(1);
		expect(entry.assets![0]!.kind).toBe("mermaid");
		expect(entry.assets![0]!.hash).toBe(expectedHash);
		expect(entry.assets![0]!.hash).toHaveLength(64);
	});

	test("uploadAssets uploads the mermaid artifact exactly once (exists=false)", async () => {
		const target = makeTarget();
		const renderer = new StubRenderer();
		const git = new FakeRepository({
			files: { "doc.md": mermaidDoc("graph TD\nA-->B") },
		});

		const planResult = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			renderer,
		);
		if (!planResult.ok) return;
		const artifacts = planResult.value.entries[0]!.assets!;

		const uploadResult = await uploadAssets(target, "page-1", artifacts);

		expect(uploadResult.ok).toBe(true);
		expect(target._uploadCalls).toHaveLength(1);
		expect(target._uploadCalls[0]!.artifact.kind).toBe("mermaid");
	});
});

describe("TC-MERM-003 attachment reuse (AC-2 / F-4 / NFR-PERF-4)", () => {
	test("first uploadAssets → 1 upload; second with exists=true → 0 uploads", async () => {
		const target = makeTarget();
		const renderer = new StubRenderer();
		const git = new FakeRepository({
			files: { "doc.md": mermaidDoc("graph TD\nA-->B") },
		});

		const planResult = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			renderer,
		);
		if (!planResult.ok) return;
		const artifacts = planResult.value.entries[0]!.assets!;

		// First upload: exists=false → 1 upload
		const first = await uploadAssets(target, "page-1", artifacts);
		expect(first.ok).toBe(true);
		expect(target._uploadCalls).toHaveLength(1);

		// Second upload: exists=true (hash tracked) → 0 uploads
		target._uploadCalls.length = 0;
		target._existsCalls.length = 0;
		const second = await uploadAssets(target, "page-1", artifacts);
		expect(second.ok).toBe(true);
		expect(target._existsCalls).toHaveLength(1);
		expect(target._uploadCalls).toHaveLength(0);
	});

	test("deterministic hash: same source across two computePlan calls → same filename", async () => {
		const git = new FakeRepository({
			files: { "doc.md": mermaidDoc("graph TD\nA-->B") },
		});
		const renderer = new StubRenderer();

		const r1 = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			makeTarget(),
			renderer,
		);
		const r2 = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			makeTarget(),
			renderer,
		);
		if (!r1.ok || !r2.ok) return;

		const f1 = r1.value.entries[0]!.assets![0]!.hash;
		const f2 = r2.value.entries[0]!.assets![0]!.hash;
		expect(f1).toBe(f2);
		expect(f1).toHaveLength(64);
	});
});

describe("TC-MERM-006 per-document isolation (AC-4 / NFR-6)", () => {
	test("doc A renders, doc B fails → both in plan, run continues, B falls back to code", async () => {
		const uuidA = "019f56e4-18f5-7024-bfdf-5438918bb3bc";
		const uuidB = "019f56e4-18f5-7025-bfdf-5438918bb3bd";
		const git = new FakeRepository({
			files: {
				"doc-a.md": `---\nmarksync:\n  uuid: ${uuidA}\n---\n# A\n\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`,
				"doc-b.md": `---\nmarksync:\n  uuid: ${uuidB}\n---\n# B\n\n\`\`\`mermaid\ngraph TD\nFAIL\n\`\`\`\n`,
			},
		});
		const target = makeTarget();
		const renderer = new SelectiveRenderer();

		const planResult = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			renderer,
		);

		expect(planResult.ok).toBe(true);
		if (!planResult.ok) return;

		// Run did not abort: both entries present
		expect(planResult.value.entries).toHaveLength(2);

		const byPath = new Map(
			planResult.value.entries.map((e) => [e.sourcePath, e]),
		);
		const docA = byPath.get("doc-a.md")!;
		const docB = byPath.get("doc-b.md")!;

		// Doc A rendered as image
		expect(docA.renderedBody).toContain("<ac:image");
		expect(docA.renderedBody).toContain("ri:attachment");
		// Doc B fell back to code block (no image)
		expect(docB.renderedBody).not.toContain("<ac:image");
		expect(docB.renderedBody).toContain('language">mermaid<');

		// Warning for doc B's failure
		expect(planResult.value.warnings.some((w) => w.includes("doc-b.md"))).toBe(
			true,
		);
		expect(
			planResult.value.warnings.some((w) =>
				w.includes("falling back to code block"),
			),
		).toBe(true);
	});
});

describe("TC-MERM-008 privacy warning (AC-6 / F-5 / NFR-PRIV-2)", () => {
	test('policy "render" → one-time privacy warning present', async () => {
		const git = new FakeRepository({
			files: {
				"a.md": `---\nmarksync:\n  uuid: 019f56e4-18f5-7024-bfdf-5438918bb3bc\n---\n# A\n\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`,
				"b.md": `---\nmarksync:\n  uuid: 019f56e4-18f5-7026-bfdf-5438918bb3bf\n---\n# B\n\n\`\`\`mermaid\ngraph TD\nC-->D\n\`\`\`\n`,
			},
		});
		const target = makeTarget();

		const result = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			new StubRenderer(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const privacyWarnings = result.value.warnings.filter((w) =>
			w.includes("sends diagram content to Kroki"),
		);
		// Exactly one privacy warning regardless of doc count
		expect(privacyWarnings).toHaveLength(1);
	});

	test('policy "code" → no privacy warning', async () => {
		const git = new FakeRepository({
			files: { "a.md": mermaidDoc("graph TD\nA-->B") },
		});
		const target = makeTarget();

		const result = await computePlan(
			baseConfig("code"),
			emptyLock,
			git,
			target,
			new StubRenderer(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.value.warnings.filter((w) => w.includes("Kroki")),
		).toHaveLength(0);
	});

	test('policy "skip" → no privacy warning', async () => {
		const git = new FakeRepository({
			files: { "a.md": mermaidDoc("graph TD\nA-->B") },
		});
		const target = makeTarget();

		const result = await computePlan(
			baseConfig("skip"),
			emptyLock,
			git,
			target,
			new StubRenderer(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.value.warnings.filter((w) => w.includes("Kroki")),
		).toHaveLength(0);
	});
});

describe("TC-MERM-011 no secrets in output (NFR-8 / INV-SEC-1)", () => {
	test("source with fake token → filename is hash, 0 token occurrences in output", async () => {
		const fakeToken = "AKIAIOSFODNN7EXAMPLE";
		const git = new FakeRepository({
			files: { "doc.md": mermaidDoc(`graph TD\nA[${fakeToken}]-->B`) },
		});
		const target = makeTarget();

		const result = await computePlan(
			baseConfig("render"),
			emptyLock,
			git,
			target,
			new StubRenderer(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const entry = result.value.entries[0]!;
		const expectedHash = await sha256Hex(SVG);

		// Filename contains the hash, NOT the token
		expect(entry.renderedBody).toContain(
			`marksync-mermaid-${expectedHash}.svg`,
		);
		// The token appears 0 times in the rendered body
		expect(entry.renderedBody).not.toContain(fakeToken);
		// The plan JSON (warnings etc.) does not contain the token
		expect(JSON.stringify(result.value)).not.toContain(fakeToken);
	});
});
