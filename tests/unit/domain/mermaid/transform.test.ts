// Unit tests for the mermaid HAST transform (TC-MERM-004, TC-MERM-007,
// TC-MERM-009, TC-MERM-012). Real HAST trees + a stubbed Renderer boundary
// (testing-strategy §"over-mocking guardrail").

import { describe, expect, test } from "bun:test";
import type { Element, Root } from "hast";
import type { Renderer } from "#domain/mermaid/port";
import { transform } from "#domain/mermaid/transform";
import type { MermaidRenderConfig } from "#domain/config/types";
import type { Artifact, MarkSyncError } from "#domain/target/port";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";

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

const RENDER_CONFIG: MermaidRenderConfig = {
	policy: "render",
	securityLevel: "strict",
	htmlLabels: false,
	deterministicIds: true,
};

/** Stub renderer returning fixed SVG bytes for every source (deterministic). */
class StubRenderer implements Renderer {
	calls: string[] = [];
	constructor(private readonly svg: Uint8Array = SVG) {}
	async render(
		source: string,
		_config: MermaidRenderConfig,
	): Promise<Result<Artifact, MarkSyncError>> {
		this.calls.push(source);
		const hash = await sha256Hex(this.svg);
		return Res.ok({
			bytes: this.svg,
			mime: "image/svg+xml",
			hash,
			kind: "mermaid",
		});
	}
}

/** Stub renderer that errors on empty/whitespace source, succeeds otherwise. */
class EmptyErrorRenderer implements Renderer {
	calls: string[] = [];
	async render(
		source: string,
		_config: MermaidRenderConfig,
	): Promise<Result<Artifact, MarkSyncError>> {
		this.calls.push(source);
		if (source.trim() === "") {
			return Res.err({
				kind: "RemoteUnreachable",
				cause: "Empty diagram source",
			});
		}
		const hash = await sha256Hex(SVG);
		return Res.ok({ bytes: SVG, mime: "image/svg+xml", hash, kind: "mermaid" });
	}
}

/** Stub renderer that always errors (network-failure simulation). */
class AlwaysErrorRenderer implements Renderer {
	async render(
		_source: string,
		_config: MermaidRenderConfig,
	): Promise<Result<Artifact, MarkSyncError>> {
		return Res.err({
			kind: "RemoteUnreachable",
			status: 503,
			cause: "Service Unavailable",
		});
	}
}

function mermaidFence(source: string): Element {
	return {
		type: "element",
		tagName: "pre",
		properties: {},
		children: [
			{
				type: "element",
				tagName: "code",
				properties: { className: ["language-mermaid"] },
				children: [{ type: "text", value: source }],
			},
		],
	};
}

function root(...children: Element[]): Root {
	return { type: "root", children };
}

/** Walk a root and return the first `img` element found (null if none). */
function firstImg(node: Root): Element | null {
	for (const child of node.children) {
		if (child.type === "element") {
			if (child.tagName === "img") return child;
			const nested = firstImgEl(child);
			if (nested) return nested;
		}
	}
	return null;
}

function firstImgEl(el: Element): Element | null {
	for (const child of el.children) {
		if (child.type === "element") {
			if (child.tagName === "img") return child;
			const nested = firstImgEl(child);
			if (nested) return nested;
		}
	}
	return null;
}

describe("transform — policy activation (TC-MERM-004)", () => {
	test('policy "render" → pre replaced with img', async () => {
		const renderer = new StubRenderer();
		const hast = root(mermaidFence("graph TD\nA-->B"));

		const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(1);
		expect(firstImg(result.value.transformedHast)).not.toBeNull();
	});

	test('policy "code" → pre unchanged, 0 artifacts', async () => {
		const renderer = new StubRenderer();
		const hast = root(mermaidFence("graph TD\nA-->B"));

		const result = await transform(
			hast,
			{ ...RENDER_CONFIG, policy: "code" },
			renderer,
			"doc.md",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(0);
		expect(firstImg(result.value.transformedHast)).toBeNull();
		expect(renderer.calls).toHaveLength(0);
	});

	test('policy "skip" → pre unchanged, 0 artifacts', async () => {
		const renderer = new StubRenderer();
		const hast = root(mermaidFence("graph TD\nA-->B"));

		const result = await transform(
			hast,
			{ ...RENDER_CONFIG, policy: "skip" },
			renderer,
			"doc.md",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(0);
		expect(firstImg(result.value.transformedHast)).toBeNull();
		expect(renderer.calls).toHaveLength(0);
	});
});

describe("transform — determinism (TC-MERM-007 / DM-5)", () => {
	test("same source 3× → identical 64-char hash + identical filename", async () => {
		const expectedHash = await sha256Hex(SVG);
		const expectedFilename = `marksync-mermaid-${expectedHash}.svg`;

		const hashes: string[] = [];
		const filenames: string[] = [];

		for (let i = 0; i < 3; i++) {
			const renderer = new StubRenderer();
			const hast = root(mermaidFence("graph TD\nA-->B"));
			const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const artifact = result.value.artifacts[0]!;
			const img = firstImg(result.value.transformedHast)!;
			hashes.push(artifact.hash);
			filenames.push(String(img.properties!.src));
		}

		// All three hashes identical
		expect(hashes[0]).toBe(hashes[1]);
		expect(hashes[1]).toBe(hashes[2]);
		// All three filenames identical
		expect(filenames[0]).toBe(filenames[1]);
		expect(filenames[1]).toBe(filenames[2]);
		// Full sha256 = 64 hex chars (NOT truncated to 24)
		expect(hashes[0]).toHaveLength(64);
		expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
		expect(filenames[0]).toBe(expectedFilename);
	});
});

describe("transform — in-doc dedup (TC-MERM-009)", () => {
	test("two identical fences → one Artifact, renderer called once, same src", async () => {
		const renderer = new StubRenderer();
		const hast = root(
			mermaidFence("graph TD\nA-->B"),
			mermaidFence("graph TD\nA-->B"),
		);

		const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(1);
		// Dedup: renderer called only once for identical source
		expect(renderer.calls).toHaveLength(1);

		const imgs: Element[] = [];
		for (const child of result.value.transformedHast.children) {
			if (child.type === "element" && child.tagName === "img") imgs.push(child);
		}
		expect(imgs).toHaveLength(2);
		const src0 = String(imgs[0]!.properties!.src);
		const src1 = String(imgs[1]!.properties!.src);
		expect(src0).toBe(src1);
		expect(src0).toMatch(/^marksync-mermaid-[a-f0-9]{64}\.svg$/);
	});
});

describe("transform — empty source fallback (TC-MERM-012)", () => {
	test("renderer error on empty source → pre kept, warning emitted, 0 artifacts", async () => {
		const renderer = new EmptyErrorRenderer();
		const hast = root(mermaidFence("\n"));

		const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(0);
		// pre kept (no img injected)
		expect(firstImg(result.value.transformedHast)).toBeNull();
		// warning emitted
		expect(result.value.warnings).toHaveLength(1);
		expect(result.value.warnings[0]).toContain("doc.md");
		expect(result.value.warnings[0]).toContain("falling back to code block");
	});
});

describe("transform — network fallback (TC-MERM-005 unit)", () => {
	test("renderer always errors → pre kept, warning emitted", async () => {
		const renderer = new AlwaysErrorRenderer();
		const hast = root(mermaidFence("graph TD\nA-->B"));

		const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(0);
		expect(firstImg(result.value.transformedHast)).toBeNull();
		expect(result.value.warnings).toHaveLength(1);
		expect(result.value.warnings[0]).toContain("falling back to code block");
	});
});

describe("transform — recursive walk", () => {
	test("mermaid fence inside a blockquote is found and replaced", async () => {
		const renderer = new StubRenderer();
		const blockquote: Element = {
			type: "element",
			tagName: "blockquote",
			properties: {},
			children: [mermaidFence("graph TD\nA-->B")],
		};
		const hast = root(blockquote);

		const result = await transform(hast, RENDER_CONFIG, renderer, "doc.md");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifacts).toHaveLength(1);
		expect(firstImg(result.value.transformedHast)).not.toBeNull();
	});
});
