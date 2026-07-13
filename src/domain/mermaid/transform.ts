// Mermaid HAST transform — renders each `pre>code.language-mermaid` fence via
// the {@linkcode Renderer} port, replacing `pre` with an `img` node (so Storage
// emits `<ac:image><ri:attachment>`); falls back to the code block on failure.

import type { Element, Root } from "hast";
import type { Renderer } from "#domain/mermaid/port";
import type { Artifact } from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import type { MermaidRenderConfig } from "#domain/config/types";
import { Result as Res, type Result } from "#domain/result";

export interface TransformResult {
	artifacts: Artifact[];
	transformedHast: Root;
	warnings: string[];
}

/**
 * Transform mermaid code fences into rendered `img` nodes. No-op unless the
 * policy is `"render"`. Mutates the tree in place (replacing `pre` elements) and
 * returns the same root reference as `transformedHast`.
 *
 * The transform runs AFTER asset resolution and BEFORE body rendering in
 * `computePlan` — the synthetic `marksync-mermaid-<hash>.svg` img nodes must
 * bypass the path-safe resolver (see plan P3.1 load-bearing ordering note).
 *
 * The error channel is currently unused (per-fence failures fall back to the
 * code block + warning) but reserved for future fatal transform failures.
 */
export async function transform(
	hast: Root,
	config: MermaidRenderConfig,
	renderer: Renderer,
	sourcePath?: string,
): Promise<Result<TransformResult, MarkSyncError>> {
	if (config.policy !== "render") {
		return Res.ok({ artifacts: [], transformedHast: hast, warnings: [] });
	}

	const ctx: RenderContext = {
		renderer,
		artifacts: [],
		warnings: [],
		bySource: new Map<string, Artifact>(),
		location: sourcePath ?? "document",
	};
	await processChildren(hast.children, ctx);
	return Res.ok({
		artifacts: ctx.artifacts,
		transformedHast: hast,
		warnings: ctx.warnings,
	});
}

interface RenderContext {
	renderer: Renderer;
	artifacts: Artifact[];
	warnings: string[];
	bySource: Map<string, Artifact>;
	location: string;
}

/** Walk a children array in place, replacing mermaid fences with `img` nodes. */
async function processChildren(
	children: Array<Root["children"][number] | Element["children"][number]>,
	ctx: RenderContext,
): Promise<void> {
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child?.type !== "element") continue;
		if (isMermaidFence(child)) {
			const replacement = await tryRenderFence(child, ctx);
			if (replacement) {
				children[i] = replacement;
			}
			// A mermaid fence's only child is <code> — no nested fences to recurse.
		} else {
			await processChildren(child.children, ctx);
		}
	}
}

function isMermaidFence(el: Element): boolean {
	if (el.tagName !== "pre") return false;
	const code = el.children.find(
		(c): c is Element => c.type === "element" && c.tagName === "code",
	);
	if (!code) return false;
	return classNames(code).includes("language-mermaid");
}

async function tryRenderFence(
	pre: Element,
	ctx: RenderContext,
): Promise<Element | null> {
	const code = pre.children.find(
		(c): c is Element => c.type === "element" && c.tagName === "code",
	);
	const source = code ? textContent(code) : "";

	const cached = ctx.bySource.get(source);
	if (cached) {
		return imgNode(cached.hash);
	}

	const result = await ctx.renderer.render(source);
	if (!result.ok) {
		const err = result.error;
		const detail = err.kind === "RemoteUnreachable" ? err.cause : err.kind;
		ctx.warnings.push(
			`Mermaid render failed for diagram at ${ctx.location}: ${detail} — falling back to code block`,
		);
		return null;
	}

	const artifact = result.value;
	ctx.bySource.set(source, artifact);
	ctx.artifacts.push(artifact);
	return imgNode(artifact.hash);
}

/**
 * Build the `img` node. The `src` mirrors the infra `attachmentFilename()` for
 * `kind: "mermaid"` (`marksync-mermaid-<fullhash>.svg`); the domain tier cannot
 * import that helper, so the prefix is reproduced here.
 */
function imgNode(hash: string): Element {
	return {
		type: "element",
		tagName: "img",
		properties: {
			src: `marksync-mermaid-${hash}.svg`,
			alt: "Mermaid diagram",
		},
		children: [],
	};
}

function classNames(el: Element): string[] {
	const cn = el.properties?.className;
	if (Array.isArray(cn))
		return cn.filter((v): v is string => typeof v === "string");
	if (typeof cn === "string") return [cn];
	return [];
}

function textContent(el: Element): string {
	let out = "";
	for (const child of el.children) {
		if (child.type === "text") out += child.value;
	}
	return out;
}
