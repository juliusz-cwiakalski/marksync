// Canonical HAST + raw sha256 content hash (ADR-0005; GH-20 F-3 / Content Hash VO).

import { createHash } from "node:crypto";
import type {
	Element,
	ElementContent,
	Properties,
	Root,
	RootContent,
} from "hast";

/** A HAST root reduced to a deterministic form (no positions, sorted properties). */
export type CanonicalHast = Root;

/**
 * A `raw` HAST node produced by remark-rehype (`allowDangerousHtml`). hast 3's
 * type model omits `raw`, so it is modelled locally; canonicalize converts these
 * to `text` so the renderer's text-escaping discharges DEC-4 uniformly.
 */
interface RawContent {
	type: "raw";
	value: string;
}

/** Everything that can appear as a child at runtime: hast content plus raw. */
type InputContent = RootContent | RawContent;

/**
 * Produce a canonical, position-free, property-sorted clone of `hast` so two
 * semantically-identical trees hash identically (attribute order and source
 * positions never perturb the digest). Structural whitespace text nodes
 * inserted by remark-rehype between block siblings are dropped; raw HTML nodes
 * become text so escape-at-render handles them uniformly.
 */
export function canonicalize(hast: Root): CanonicalHast {
	return { type: "root", children: cloneChildren(hast.children) };
}

/**
 * Raw lowercase-hex sha256 over the canonical form. The wire-format prefix is
 * the consumer's concern (E3-S5) — this owns the deterministic digest only.
 */
export function contentHash(canonical: CanonicalHast): string {
	return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

function cloneElement(el: Element): Element {
	return {
		type: "element",
		tagName: el.tagName,
		properties: sortProperties(el.properties),
		children: cloneChildren(el.children),
	};
}

function cloneChildren(children: InputContent[]): ElementContent[] {
	const out: ElementContent[] = [];
	for (const child of children) {
		if (child.type === "element") {
			out.push(cloneElement(child));
		} else if (child.type === "text") {
			if (isStructuralWhitespace(child.value)) continue;
			out.push({ type: "text", value: child.value });
		} else if (child.type === "raw") {
			// Raw HTML is escaped at render (DEC-4); represent it as text so the
			// renderer's text-escaping path handles it uniformly.
			out.push({ type: "text", value: child.value });
		} else if (child.type === "comment") {
			out.push(child);
		}
		// `doctype` never occurs from remark-rehype — dropped if ever seen.
	}
	return out;
}

/** Structural whitespace = whitespace-only AND contains a newline (pretty-print artifact). */
function isStructuralWhitespace(value: string): boolean {
	return value.trim() === "" && value.includes("\n");
}

/** Stable sort of an element's properties (attribute order must not affect the hash). */
function sortProperties(properties: Properties | undefined): Properties {
	if (!properties) return {};
	const sorted: Properties = {};
	for (const key of Object.keys(properties).sort())
		sorted[key] = properties[key];
	return sorted;
}

/** Deterministic JSON: object keys sorted at every depth, no insignificant whitespace. */
function stableStringify(value: unknown): string {
	return serialize(value);
}

function serialize(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`)
			.join(",")}}`;
	}
	return "null";
}
