// Reverse classifier + content mapping (mirror of renderStorage visitor, spec Appendix A).
// Recognized constructs map to content HAST; everything else → diagnostic.

import { Result } from "#domain/result";
import {
	type BlockingDiagnostic,
	type InformationalDiagnostic,
	REVERSE_CODES,
	type ReverseDiagnostic,
	type ReverseError,
	type ReverseSuccess,
	type UnsupportedConstructError,
} from "#domain/markdown/reverse-diagnostics";
import { hastToMarkdown } from "#domain/markdown/hast-to-markdown";
import { parseStorage } from "#infra/confluence/parse/reverse-parser";
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { StorageParseError } from "#domain/markdown/reverse-diagnostics";

/** Reverse contract entry point (spec DM-1). */
// Import from domain to avoid duplication (typescript.md structural-duplication rule)
export type { ReverseSuccess } from "#domain/markdown/reverse-diagnostics";

/** Reverse conversion contract with provenance context (reserved for future use). */
export interface ReverseOptions {
	/** Reserved for future diagnostic provenance context. */
	sourcePath?: string;
}

/**
 * Reverse convert Storage XHTML to canonical Markdown with fast-fail semantics.
 *
 * Pipeline: parseStorage → classifier → content mapping → hastToMarkdown
 *
 * Returns the first blocking diagnostic encountered (fast-fail) on unsupported
 * constructs, never a partial output (spec DEC-2, NFR-4).
 *
 * @param body - Storage XHTML string.
 * @param opts - Reverse options.
 * @returns Markdown + informational diagnostics on success, or blocking error.
 */
export function reverseStorage(
	body: string,
	opts?: ReverseOptions,
): Result<ReverseSuccess, ReverseError> {
	const parsed = parseStorage(body, opts);
	if (!parsed.ok) {
		return Result.err(parsed.error);
	}

	// Classify and map to content HAST
	const classified = classifyStorage(parsed.value);

	if (classified.diagnostics.some((d) => d.severity === "blocking")) {
		// Fast-fail: return the first blocking diagnostic
		const blocking = classified.diagnostics.find(
			(d) => d.severity === "blocking",
		) as BlockingDiagnostic;
		const error: UnsupportedConstructError = {
			kind: "UnsupportedConstruct",
			code: blocking.code,
			construct: blocking.construct,
			location: blocking.location,
		};
		return Result.err(error);
	}

	// Serialize the content HAST to Markdown
	const markdown = hastToMarkdown(classified.content);

	// Filter out blocking diagnostics (already handled) and return only informational
	const informationals = classified.diagnostics.filter(
		(d) => d.severity === "informational",
	) as InformationalDiagnostic[];

	return Result.ok({ markdown, diagnostics: informationals });
}

/**
 * Reverse convert Storage XHTML with collect-all semantics.
 *
 * Enumerates all unsupported constructs without partial conversion (spec DEC-2).
 * Per test-plan §4.4: the first blocking diagnostic in the array deep-equals
 * the fast-fail error when one exists.
 *
 * @param body - Storage XHTML string.
 * @returns All diagnostics (preserving severity/class) on success or parse error.
 */
export function reverseStorageCollectAll(
	body: string,
): Result<{ diagnostics: ReverseDiagnostic[] }, StorageParseError> {
	const parsed = parseStorage(body);
	if (!parsed.ok) {
		return Result.err(parsed.error);
	}

	// Classify and collect all diagnostics
	const classified = classifyStorage(parsed.value);

	// Return all diagnostics preserving severity/class (F-1 fix)
	// The contract now correctly separates blocking from informational
	return Result.ok({ diagnostics: classified.diagnostics });
}

/** Classification result: content HAST + diagnostics. */
interface ClassificationResult {
	content: Root;
	diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic>;
}

/**
 * Classify Storage-HAST into content HAST + diagnostics.
 *
 * Mirrors the `renderStorage` visitor (spec Appendix A) but in reverse:
 * - Recognized constructs → content HAST
 * - Mermaid render artifact → informational diagnostic + dropped
 * - Everything else → blocking diagnostic
 */
function classifyStorage(hast: Root): ClassificationResult {
	const content: Root = { type: "root", children: [] };
	const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];

	for (const child of hast.children) {
		const result = classifyNode(child);
		if (result.content) {
			content.children.push(result.content);
		}
		diagnostics.push(...result.diagnostics);
	}

	return { content, diagnostics };
}

/** Node classification result. */
interface NodeClassificationResult {
	content: RootContent | null;
	diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic>;
}

/** Classify a single HAST node. */
function classifyNode(node: RootContent): NodeClassificationResult {
	if (node.type === "text") {
		return { content: node, diagnostics: [] };
	}

	if (node.type === "comment") {
		// Comments are stripped (panel marker already handled by parser)
		return { content: null, diagnostics: [] };
	}

	if (node.type === "element") {
		return classifyElement(node);
	}

	// Unknown node types (doctype, etc.) — ignored (not reachable from page-body Storage)
	return { content: null, diagnostics: [] };
}

/** Classify a HAST element. */
function classifyElement(el: Element): NodeClassificationResult {
	const tagName = el.tagName;
	const props = el.properties || {};

	// Handle ac:image elements (regular images, not mermaid artifacts)
	if (tagName === "ac:image") {
		const altText = props["ac:alt"]?.toString() || "";
		let src = "";

		// Look for ri:attachment children (with ri:filename property) or ri:url children
		for (const child of el.children) {
			if (child.type === "element") {
				if (child.tagName === "ri:attachment") {
					const filename = child.properties["ri:filename"]?.toString();
					if (filename) {
						src = filename;
						break;
					}
				} else if (child.tagName === "ri:url") {
					const urlValue = child.properties["ri:value"]?.toString();
					if (urlValue) {
						src = urlValue;
						break;
					}
				}
			}
		}

		// Check for mermaid render policy artifact (DEC-1, AC-F4-2)
		if (src.startsWith("marksync-mermaid-")) {
			const location = getLocation(el);
			return {
				content: null,
				diagnostics: [
					{
						severity: "informational",
						class: "marksync-synthetic-artifact",
						code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
						construct: "ac:image (mermaid render policy)",
						location,
					},
				],
			};
		}

		if (src) {
			// Map to markdown image: ![alt](src)
			const imgElement: Element = {
				type: "element",
				tagName: "img",
				properties: {
					src,
					alt: altText,
				},
				children: [],
			};
			return { content: imgElement, diagnostics: [] };
		}
	}

	// Handle Confluence macros
	if (tagName === "ac:structured-macro") {
		return classifyMacro(el);
	}

	// Handle ac:task-list (Confluence-specific element)
	if (tagName === "ac:task-list") {
		return classifyTaskListElement(el);
	}

	// Handle recognized canonical elements (pass through)
	const canonicalElements = [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"p",
		"strong",
		"em",
		"del",
		"code",
		"a",
		"img",
		"ul",
		"ol",
		"li",
		"table",
		"thead",
		"tbody",
		"tr",
		"td",
		"th",
		"blockquote",
		"hr",
		"pre",
	];

	if (canonicalElements.includes(tagName)) {
		// Check for nested tables (table ANYWHERE inside td/th)
		if (tagName === "td" || tagName === "th") {
			if (hasDescendantTable(el)) {
				const location = getLocation(el);
				return {
					content: null,
					diagnostics: [
						{
							severity: "blocking",
							class: "unsupported-construct",
							code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
							construct: `${tagName} containing nested table`,
							location,
						},
					],
				};
			}
		}

		// Recursively classify children
		const classifiedChildren: ElementContent[] = [];
		const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];

		for (const child of el.children) {
			const result = classifyNode(child);
			if (result.content) {
				classifiedChildren.push(result.content as ElementContent);
			}
			diagnostics.push(...result.diagnostics);
		}

		return {
			content: { ...el, children: classifiedChildren },
			diagnostics,
		};
	}

	// Unknown element → blocking diagnostic
	const location = getLocation(el);
	return {
		content: null,
		diagnostics: [
			{
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: tagName,
				location,
			},
		],
	};
}

/** Classify a Confluence macro. */
function classifyMacro(el: Element): NodeClassificationResult {
	const macroName = el.properties["ac:name"]?.toString();

	if (macroName === "code") {
		return classifyCodeMacro(el);
	}

	if (macroName === "task-list") {
		return classifyTaskListMacro(el);
	}

	// Info macros are NOT classified here — panel strip already handled by parser
	// However, if the parser didn't strip it (no marker), we treat it as unknown
	// to preserve the blocking diagnostic behavior
	const location = getLocation(el);
	return {
		content: null,
		diagnostics: [
			{
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: `ac:structured-macro[ac:name="${macroName}"]`,
				location,
			},
		],
	};
}

/** Classify a code macro → fenced code block. */
function classifyCodeMacro(el: Element): NodeClassificationResult {
	// Extract language from ac:parameter ac:name="language" element
	const languageParam = el.children.find(
		(child) =>
			child.type === "element" &&
			child.tagName === "ac:parameter" &&
			child.properties["ac:name"] === "language",
	) as Element | undefined;

	const language =
		languageParam?.children
			.find((child) => child.type === "text")
			?.value?.toString()
			.trim() || "";

	// Extract CDATA content
	const cdataBody = el.children.find(
		(child) =>
			child.type === "element" && child.tagName === "ac:plain-text-body",
	) as Element | undefined;

	if (!cdataBody) {
		const location = getLocation(el);
		return {
			content: null,
			diagnostics: [
				{
					severity: "blocking",
					class: "unsupported-construct",
					code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
					construct: "ac:structured-macro[ac:name='code'] (missing body)",
					location,
				},
			],
		};
	}

	const codeContent = cdataBody.children.find((child) => child.type === "text");
	const value = codeContent?.type === "text" ? codeContent.value : "";

	// Map to <pre><code class="language-x">...</code></pre>
	const codeElement: Element = {
		type: "element",
		tagName: "code",
		properties: {
			className: language ? [`language-${language}`] : [],
		},
		children: [{ type: "text", value }],
	};

	const preElement: Element = {
		type: "element",
		tagName: "pre",
		properties: {},
		children: [codeElement],
	};

	return { content: preElement, diagnostics: [] };
}

/** Shared helper: map ac:task sequence → task-list HAST (RSK-P2). */
function mapTaskSequenceToGfmTaskList(tasks: Element[]): Element {
	const listItems: Element[] = [];

	for (const task of tasks) {
		const statusEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-status",
		) as Element | undefined;

		const bodyEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-body",
		) as Element | undefined;

		// Status is in the text child of ac:task-status
		const statusText = statusEl?.children.find(
			(child) => child.type === "text",
		);
		const isChecked =
			statusText?.type === "text" && statusText.value === "complete";

		const taskContent = bodyEl?.children || [];

		// Map to remark-gfm task-list HAST shape:
		// ul.contains-task-list → li.task-list-item → input[checked]
		const inputEl: Element = {
			type: "element",
			tagName: "input",
			properties: {
				type: "checkbox",
				checked: isChecked ? true : undefined,
			},
			children: [],
		};

		// Classify task body content
		const classifiedBody: ElementContent[] = [];
		for (const child of taskContent) {
			const result = classifyNode(child);
			if (result.content) {
				classifiedBody.push(result.content as ElementContent);
			}
		}

		const li: Element = {
			type: "element",
			tagName: "li",
			properties: {
				className: ["task-list-item"],
			},
			children: [inputEl, ...classifiedBody],
		};

		listItems.push(li);
	}

	// Map to ul.contains-task-list
	return {
		type: "element",
		tagName: "ul",
		properties: {
			className: ["contains-task-list"],
		},
		children: listItems,
	};
}

/** Classify a task-list macro → GFM task list (RSK-P2).
 * NOTE: The forward renderer emits <ac:task-list> directly, not this macro form.
 * This branch handles real Confluence task-list macros for completeness.
 */
function classifyTaskListMacro(el: Element): NodeClassificationResult {
	const tasks = el.children.filter(
		(child) =>
			child.type === "element" &&
			child.tagName === "ac:task" &&
			(child as Element).children.some(
				(grandchild) =>
					grandchild.type === "element" &&
					grandchild.tagName === "ac:task-status",
			),
	) as Element[];

	return { content: mapTaskSequenceToGfmTaskList(tasks), diagnostics: [] };
}

/** Classify an ac:task-list element → GFM task list (RSK-P2).
 * This is the form emitted by the forward renderer (storage.ts:155).
 */
function classifyTaskListElement(el: Element): NodeClassificationResult {
	// ac:task-list is a direct element (not ac:structured-macro)
	// It contains ac:task elements directly as children
	const tasks = el.children.filter(
		(child) => child.type === "element" && child.tagName === "ac:task",
	) as Element[];

	return { content: mapTaskSequenceToGfmTaskList(tasks), diagnostics: [] };
}

/** Check if an element contains a table descendant (F-8: deep detection). */
function hasDescendantTable(el: Element): boolean {
	for (const child of el.children) {
		if (child.type === "element") {
			if (child.tagName === "table") {
				return true;
			}
			if (hasDescendantTable(child)) {
				return true;
			}
		}
	}
	return false;
}

/** Get location from a HAST element (F-4 diagnostics). */
function getLocation(el: Element): { line: number; column: number } {
	if (el.position?.start) {
		return {
			line: el.position.start.line,
			column: el.position.start.column,
		};
	}
	// Fallback if position not available
	return { line: 1, column: 1 };
}
