// Reverse classifier + content mapping (mirror of renderStorage visitor, spec Appendix A).
// Recognized constructs map to content HAST; everything else → diagnostic.

import { Result } from "#domain/result";
import {
	type BlockingDiagnostic,
	type InformationalDiagnostic,
	REVERSE_CODES,
	type StorageParseError,
	type ReverseError,
} from "#domain/markdown/reverse-diagnostics";
import { hastToMarkdown } from "#domain/markdown/hast-to-markdown";
import { parseStorage } from "#infra/confluence/parse/reverse-parser";
import type { Element, ElementContent, Root, RootContent } from "hast";

/** Reverse contract entry point (spec DM-1). */
export interface ReverseSuccess {
	markdown: string;
	diagnostics: InformationalDiagnostic[];
}

/** Reverse conversion contract with fast-fail/collect-all parity (spec DEC-2). */
export interface ReverseOptions {
	/** Diagnostic provenance context (spec DM-1). */
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
		return Result.err({
			kind: "UnsupportedConstruct",
			code: blocking.code,
			construct: blocking.construct,
			location: blocking.location,
		} as unknown as ReverseError);
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
 * Per test-plan §4.4: `all.diagnostics[0]` deep-equals the fast-fail error.
 *
 * @param body - Storage XHTML string.
 * @returns All diagnostics on success or parse error.
 */
export function reverseStorageCollectAll(
	body: string,
): Result<{ diagnostics: ReverseError[] }, StorageParseError> {
	const parsed = parseStorage(body);
	if (!parsed.ok) {
		return Result.err(parsed.error);
	}

	// Classify and collect all diagnostics
	const classified = classifyStorage(parsed.value);

	// Map diagnostics to error arms
	const diagnostics = classified.diagnostics.map((d) => {
		if (d.severity === "blocking") {
			return {
				kind: "UnsupportedConstruct",
				code: d.code,
				construct: d.construct,
				location: d.location,
			} as unknown as ReverseError;
		}
		// Informational diagnostics are not errors, but we include them for completeness
		return {
			kind: "UnsupportedConstruct",
			code: d.code,
			construct: d.construct,
			location: d.location,
		} as unknown as ReverseError;
	});

	return Result.ok({ diagnostics });
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

	// Unknown node type (doctype, etc.) — ignore
	return { content: null, diagnostics: [] };
}

/** Classify a HAST element. */
function classifyElement(el: Element): NodeClassificationResult {
	const tagName = el.tagName;
	const props = el.properties || {};

	// Check for mermaid render policy artifact (DEC-1, AC-F4-2)
	if (
		tagName === "ac:image" &&
		props["ri:filename"]?.toString().startsWith("marksync-mermaid-")
	) {
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
		languageParam?.children.find((child) => child.type === "text")?.value?.toString().trim() || "";

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

/** Classify a task-list macro → GFM task list (RSK-P2). */
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

	const listItems: Element[] = [];

	for (const task of tasks) {
		const statusEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-status",
		) as Element | undefined;

		const bodyEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-body",
		) as Element | undefined;

		// Status is in the text child of ac:task-status
		const statusText = statusEl?.children.find((child) => child.type === "text");
		const isChecked = statusText?.type === "text" && statusText.value === "complete";

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
	const ul: Element = {
		type: "element",
		tagName: "ul",
		properties: {
			className: ["contains-task-list"],
		},
		children: listItems,
	};

	return { content: ul, diagnostics: [] };
}

/** Classify an ac:task-list element → GFM task list (RSK-P2). */
function classifyTaskListElement(el: Element): NodeClassificationResult {
	// ac:task-list is a direct element (not ac:structured-macro)
	// It contains ac:task elements directly as children
	const tasks = el.children.filter(
		(child) =>
			child.type === "element" &&
			child.tagName === "ac:task",
	) as Element[];

	const listItems: Element[] = [];

	for (const task of tasks) {
		const statusEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-status",
		) as Element | undefined;

		const bodyEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-body",
		) as Element | undefined;

		// Status is in the text child of ac:task-status
		const statusText = statusEl?.children.find((child) => child.type === "text");
		const isChecked = statusText?.type === "text" && statusText.value === "complete";

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
	const ul: Element = {
		type: "element",
		tagName: "ul",
		properties: {
			className: ["contains-task-list"],
		},
		children: listItems,
	};

	return { content: ul, diagnostics: [] };
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
