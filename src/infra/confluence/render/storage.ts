// HAST → Confluence Storage XHTML string-builder visitor (ADR-0005 C-1/C-3; spike H6).
// Spike-H6 mapping: well-formed XML (escape outside CDATA), code bodies in CDATA
// without `ac:schema-version`/`ac:macro-id`, and `<ac:task-list>` as its own block.

import type { MarkSyncError } from "#domain/errors";
import {
	type CanonicalHast,
	canonicalize,
	contentHash,
} from "#domain/render/canonicalize";
import { findUnsupported } from "#domain/markdown/unsupported";
import { Result } from "#domain/result";
import type { Element, ElementContent, Root, Text } from "hast";

/** Options for {@link renderStorage}. */
export interface RenderStorageOptions {
	/** Provenance threaded onto any `UnsupportedConstruct` error. */
	sourcePath: string;
}

/** Success payload of {@link renderStorage}: the Storage body + content hash + warnings. */
export interface RenderedBody {
	body: string;
	hash: string;
	warnings: string[];
}

/** Raw HTML nodes produced by remark-rehype (`allowDangerousHtml`); hast 3 omits them. */
interface RawNode {
	type: "raw";
	value: string;
}

/**
 * Render a HAST tree to Confluence Storage XHTML. Runs the F-5 classifier first
 * (no silent drop), then canonicalizes (so render + hash share one form) and
 * walks the canonical tree with the construct visitors below.
 */
export function renderStorage(
	hast: Root,
	opts: RenderStorageOptions,
): Result<RenderedBody, MarkSyncError> {
	const unsupported = findUnsupported(hast, opts.sourcePath);
	if (unsupported) return Result.err(unsupported);

	const canonical = canonicalize(hast);
	const warnings: string[] = [];
	const body = renderRoot(canonical, warnings);
	return Result.ok({ body, hash: contentHash(canonical), warnings });
}

function renderRoot(root: CanonicalHast, warnings: string[]): string {
	const blocks: string[] = [];
	for (const child of root.children) {
		if (child.type === "element") blocks.push(visitElement(child, warnings));
	}
	return blocks.join("\n\n");
}

/** Render the children of an inline/flow container as a concatenated string. */
function renderInline(children: ElementContent[], warnings: string[]): string {
	let out = "";
	for (const child of children) out += visitChild(child, warnings);
	return out;
}

function visitChild(
	node: ElementContent | RawNode,
	warnings: string[],
): string {
	if (node.type === "text") return escapeText((node as Text).value);
	if (node.type === "element") return visitElement(node as Element, warnings);
	if (node.type === "raw") return escapeText((node as RawNode).value);
	return ""; // comment / doctype — dropped (never produced by remark-gfm)
}

function visitElement(el: Element, warnings: string[]): string {
	switch (el.tagName) {
		case "p":
			return `<p>${renderInline(el.children, warnings)}</p>`;
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6":
			return `<${el.tagName}>${renderInline(el.children, warnings)}</${el.tagName}>`;
		case "strong":
			return `<strong>${renderInline(el.children, warnings)}</strong>`;
		case "em":
			return `<em>${renderInline(el.children, warnings)}</em>`;
		case "del":
			return `<del>${renderInline(el.children, warnings)}</del>`;
		case "s": // defensive — remark-gfm emits <del>, never <s>
			return `<s>${renderInline(el.children, warnings)}</s>`;
		case "sub": // defensive — remark-gfm cannot produce sub/sup (PM-DEC-1)
			return `<sub>${renderInline(el.children, warnings)}</sub>`;
		case "sup":
			return `<sup>${renderInline(el.children, warnings)}</sup>`;
		case "code":
			return `<code>${renderInline(el.children, warnings)}</code>`;
		case "a":
			return `<a href="${escapeAttr(String(el.properties?.href ?? ""))}">${renderInline(el.children, warnings)}</a>`;
		case "img":
			return imageMacro(el);
		case "hr":
			return `<hr/>`;
		case "blockquote":
			return `<blockquote>${renderInline(el.children, warnings)}</blockquote>`;
		case "ul":
			return isTaskList(el)
				? renderTaskList(el, warnings)
				: `<ul>${renderListItems(el.children, warnings)}</ul>`;
		case "ol":
			return `<ol>${renderListItems(el.children, warnings)}</ol>`;
		case "table":
			return `<table>${renderInline(el.children, warnings)}</table>`;
		case "thead":
		case "tbody":
			return `<${el.tagName}>${renderInline(el.children, warnings)}</${el.tagName}>`;
		case "tr":
			return `<tr>${renderInline(el.children, warnings)}</tr>`;
		case "th":
		case "td":
			return `<${el.tagName}>${renderInline(el.children, warnings)}</${el.tagName}>`;
		case "pre":
			return codeMacro(el);
		case "input":
			// Consumed by the task-list renderer; a stray input emits nothing.
			return "";
		default:
			// Post-classifier the tree is clean; reaching here is unreachable.
			return "";
	}
}

function renderListItems(
	children: ElementContent[],
	warnings: string[],
): string {
	detectTaskMix(children, warnings);
	let out = "";
	for (const child of children) {
		if (child.type === "element" && child.tagName === "li") {
			// A stray task-list-item in a regular list is rendered as its text body
			// (checkbox dropped); the mixing case is surfaced via the warning above.
			out += `<li>${renderInline(withoutCheckbox(child.children), warnings)}</li>`;
		}
	}
	return out;
}

function renderTaskList(ul: Element, warnings: string[]): string {
	detectTaskMix(ul.children, warnings);
	let out = "<ac:task-list>";
	for (const child of ul.children) {
		if (child.type !== "element" || child.tagName !== "li") continue;
		const checkbox = findCheckbox(child);
		const status = checkbox?.checked ? "complete" : "incomplete";
		// The checkbox is followed by a separator space; strip it so the body starts
		// at the item text (matches the spike kitchensink `<ac:task-body>todo</…>`).
		const body = renderInline(
			withoutCheckbox(child.children),
			warnings,
		).trimStart();
		out += `<ac:task><ac:task-status>${status}</ac:task-status><ac:task-body>${body}</ac:task-body></ac:task>`;
	}
	return `${out}</ac:task-list>`;
}

/** Spike rule #3: a list mixing task items with regular items is unrepresentable — surface it. */
function detectTaskMix(siblings: ElementContent[], warnings: string[]): void {
	const hasTask = siblings.some(
		(c) => c.type === "element" && isTaskListItem(c),
	);
	const hasRegular = siblings.some(
		(c) => c.type === "element" && c.tagName === "li" && !isTaskListItem(c),
	);
	if (hasTask && hasRegular) {
		const msg = "task-list mixed with regular list items — unrepresentable";
		if (!warnings.includes(msg)) warnings.push(msg);
	}
}

function codeMacro(pre: Element): string {
	const code = pre.children.find(
		(c): c is Element => c.type === "element" && c.tagName === "code",
	);
	const lang = code ? extractLanguage(code) : undefined;
	const body = code ? textContent(code) : "";
	const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
	const langParam = lang
		? `<ac:parameter ac:name="language">${escapeText(lang)}</ac:parameter>`
		: "";
	return `<ac:structured-macro ac:name="code">${langParam}<ac:plain-text-body>${cdata(trimmed)}</ac:plain-text-body></ac:structured-macro>`;
}

function imageMacro(img: Element): string {
	const src = String(img.properties?.src ?? "");
	const alt = String(img.properties?.alt ?? "");
	const altAttr = alt ? ` ac:alt="${escapeAttr(alt)}"` : "";
	if (src.startsWith("http://") || src.startsWith("https://")) {
		return `<ac:image${altAttr}><ri:url ri:value="${escapeAttr(src)}"/></ac:image>`;
	}
	const filename = (src.split("/").pop() ?? src) || src;
	return `<ac:image${altAttr}><ri:attachment ri:filename="${escapeAttr(filename)}"/></ac:image>`;
}

function isTaskList(el: Element): boolean {
	return el.tagName === "ul" && classNames(el).includes("contains-task-list");
}

function isTaskListItem(el: Element): boolean {
	return el.tagName === "li" && classNames(el).includes("task-list-item");
}

function classNames(el: Element): string[] {
	const cn = el.properties?.className;
	if (Array.isArray(cn))
		return cn.filter((v): v is string => typeof v === "string");
	if (typeof cn === "string") return [cn];
	return [];
}

function findCheckbox(li: Element): { checked: boolean } | undefined {
	for (const child of li.children) {
		if (child.type === "element" && child.tagName === "input") {
			return { checked: Boolean(child.properties?.checked) };
		}
	}
	return undefined;
}

function withoutCheckbox(children: ElementContent[]): ElementContent[] {
	return children.filter(
		(c) => !(c.type === "element" && c.tagName === "input"),
	);
}

function extractLanguage(code: Element): string | undefined {
	for (const cn of classNames(code)) {
		if (cn.startsWith("language-")) return cn.slice("language-".length);
	}
	return undefined;
}

function textContent(el: Element): string {
	let out = "";
	for (const child of el.children) {
		if (child.type === "text") out += child.value;
	}
	return out;
}

/** Escape text content: `&`, `<`, `>` (the injection-safety control — RSK-2). */
function escapeText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Escape an attribute value: `&`, `<`, `>`, `"`. */
function escapeAttr(value: string): string {
	return escapeText(value).replace(/"/g, "&quot;");
}

/** Wrap a code body in CDATA, splitting any literal `]]>` so the section stays well-formed. */
function cdata(body: string): string {
	return `<![CDATA[${body.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}
