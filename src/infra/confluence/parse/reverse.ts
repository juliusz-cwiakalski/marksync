// Reverse classifier + content mapping (mirror of renderStorage visitor, spec Appendix A).
// Recognized constructs map to content HAST; everything else → diagnostic.

import { Result } from "#domain/result";
import {
	type BlockingDiagnostic,
	type InformationalDiagnostic,
	REVERSE_CODES,
	type ReverseDiagnostic,
	type ReverseError,
	type ReversePageContext,
	type ReverseSuccess,
	type UnsupportedConstructError,
	type StorageParseError,
} from "#domain/markdown/reverse-diagnostics";
import { hastToMarkdown } from "#domain/markdown/hast-to-markdown";
import { parseStorage } from "#infra/confluence/parse/reverse-parser";
import type { Element, ElementContent, Root, RootContent } from "hast";

/** Reverse contract entry point (spec DM-1). */
export type { ReverseSuccess } from "#domain/markdown/reverse-diagnostics";

/** Reverse conversion contract with provenance context (reserved for future use). */
export interface ReverseOptions {
	/** Reserved for future diagnostic provenance context. */
	sourcePath?: string;
	/** Caller-supplied page context — echoed verbatim into all diagnostics (PD-2). */
	page?: ReversePageContext;
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
	// Resolve page context: explicit page verbatim; else sourcePath absorption; else absent
	const page = resolvePageContext(opts);

	const parsed = parseStorage(
		body,
		opts?.sourcePath ? { sourcePath: opts.sourcePath } : undefined,
	);
	if (!parsed.ok) {
		// Attach page context to parse error (PD-2)
		return Result.err({
			...parsed.error,
			...(page !== undefined && { page }),
		});
	}

	// Classify and map to content HAST
	const classified = classifyStorage(parsed.value, page);

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
			...(blocking.page !== undefined && { page: blocking.page }), // Parity with collect-all (TC-DET-001)
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
 * @param opts - Reverse options.
 * @returns All diagnostics (preserving severity/class) on success or parse error.
 */
export function reverseStorageCollectAll(
	body: string,
	opts?: ReverseOptions,
): Result<{ diagnostics: ReverseDiagnostic[] }, StorageParseError> {
	// Resolve page context: explicit page verbatim; else sourcePath absorption; else absent
	const page = resolvePageContext(opts);

	const parsed = parseStorage(
		body,
		opts?.sourcePath ? { sourcePath: opts.sourcePath } : undefined,
	);
	if (!parsed.ok) {
		// Attach page context to parse error (PD-2)
		return Result.err({
			...parsed.error,
			...(page !== undefined && { page }),
		});
	}

	// Classify and collect all diagnostics
	const classified = classifyStorage(parsed.value, page);

	// Return all diagnostics preserving severity/class (F-1 fix)
	// The contract now correctly separates blocking from informational
	return Result.ok({ diagnostics: classified.diagnostics });
}

/** Classification result: content HAST + diagnostics. */
interface ClassificationResult {
	content: Root;
	diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic>;
}

/** Resolve page context from options (PD-2). */
function resolvePageContext(
	opts?: ReverseOptions,
): ReversePageContext | undefined {
	// Explicit page wins verbatim, no merge
	if (opts?.page) {
		return opts.page;
	}
	// Absorption: sourcePath only
	if (opts?.sourcePath) {
		return { sourcePath: opts.sourcePath };
	}
	// Absent → omitted (never null, byte-identical to GH-92)
	return undefined;
}

/**
 * Canonical attribute allowlist — mirror principle (spec F-2, DEC-5, Appendix C):
 * an attribute is canonical on an element iff the forward converter emits it there.
 *
 * Derived from emission sites in src/infra/confluence/render/storage.ts:
 * - a[href] at :103
 * - ac:parameter[ac:name] at :193
 * - ac:structured-macro[ac:name] at :195 (K1 attributes are canonical-silent per DEC-5)
 * - ac:image[ac:alt] at :201 (conditional)
 * - ri:url[ri:value] at :203
 * - ri:attachment[ri:filename] at :206
 * - All other canonical elements emit no attributes
 *
 * K1 carve-out: ac:macro-id, ac:schema-version are silently ignored ONLY on
 * ac:structured-macro (per DEC-5/F-2/Appendix C). The ac:task-list row below is
 * the recorded exception (DEC-8-adjacent, per spec Appendix C).
 */
const CANONICAL_ATTRIBUTE_ALLOWLIST: Record<string, string[]> = {
	a: ["href"],
	"ac:image": ["ac:alt"],
	"ri:attachment": ["ri:filename"],
	"ri:url": ["ri:value"],
	"ac:structured-macro": ["ac:name"],
	"ac:parameter": ["ac:name"],
	// K1 carve-out: ac:task-list row is the recorded DEC-8-adjacent exception
	"ac:task-list": ["ac:macro-id", "ac:schema-version"],
	// All other elements → no allowlist → any attribute is exotic
};

/**
 * Canonical elements set — used for both classification pass-through and
 * attribute-pass scope. Plain-HTML only; ac:* canonical elements are checked
 * separately in isCanonicalAcElement (F-7, F-9).
 */
const CANONICAL_ELEMENTS = [
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
] as const;

/**
 * ac:* canonical elements (Appendix C). Used for stray-child classification
 * (F-7) — these are canonical when in correct position but should trigger
 * the structural fallback when misplaced (not unknown-element).
 */
const CANONICAL_AC_ELEMENTS = [
	"ac:image",
	"ac:task-list",
	"ac:task",
	"ac:task-status",
	"ac:task-body",
	"ac:plain-text-body",
	"ac:parameter",
	"ri:attachment",
	"ri:url",
	"ac:structured-macro",
] as const;

/**
 * Classify Storage-HAST into content HAST + diagnostics.
 *
 * Mirrors the `renderStorage` visitor (spec Appendix A) but in reverse:
 * - Recognized constructs → content HAST
 * - Mermaid render artifact → informational diagnostic + dropped
 * - Everything else → blocking diagnostic
 */
function classifyStorage(
	hast: Root,
	page?: ReversePageContext,
): ClassificationResult {
	const content: Root = { type: "root", children: [] };
	const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];

	for (const child of hast.children) {
		const result = classifyNode(child, page);
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
function classifyNode(
	node: RootContent,
	page?: ReversePageContext,
): NodeClassificationResult {
	if (node.type === "text") {
		return { content: node, diagnostics: [] };
	}

	if (node.type === "comment") {
		// Comments are stripped (panel marker already handled by parser)
		return { content: null, diagnostics: [] };
	}

	if (node.type === "element") {
		return classifyElement(node, page);
	}

	// Unknown node types (doctype, etc.) — ignored (not reachable from page-body Storage)
	return { content: null, diagnostics: [] };
}

/** Classify a HAST element. */
function classifyElement(
	el: Element,
	page?: ReversePageContext,
): NodeClassificationResult {
	const tagName = el.tagName;
	const props = el.properties || {};

	// Handle ac:image elements (regular images, not mermaid artifacts)
	if (tagName === "ac:image") {
		const altText = props["ac:alt"]?.toString() || "";
		let src = "";

		// Check for exotic attributes on ac:image (F-1, Appendix C)
		const attrDiagnostic = checkAttributes(el, page);

		// Look for ri:attachment children (with ri:filename property) or ri:url children
		const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];
		if (attrDiagnostic) {
			diagnostics.push(attrDiagnostic);
		}

		for (const child of el.children) {
			if (child.type === "element") {
				if (child.tagName === "ri:attachment") {
					// Check for exotic attributes on ri:attachment (F-1, Appendix C)
					const riAttrDiagnostic = checkAttributes(child, page);
					if (riAttrDiagnostic) {
						diagnostics.push(riAttrDiagnostic);
					}

					const filename = child.properties["ri:filename"]?.toString();
					if (filename) {
						src = filename;
					}
				} else if (child.tagName === "ri:url") {
					// Check for exotic attributes on ri:url (F-1, Appendix C)
					const riAttrDiagnostic = checkAttributes(child, page);
					if (riAttrDiagnostic) {
						diagnostics.push(riAttrDiagnostic);
					}

					const urlValue = child.properties["ri:value"]?.toString();
					if (urlValue) {
						src = urlValue;
					}
				}
			}
		}

		// Check for mermaid render policy artifact (DEC-1, AC-F4-2)
		if (src.startsWith("marksync-mermaid-")) {
			const location = getLocation(el);
			const diagnostic: InformationalDiagnostic = {
				severity: "informational",
				class: "marksync-synthetic-artifact",
				code: REVERSE_CODES.SYNTHETIC_ARTIFACT,
				construct: "ac:image (mermaid render policy)",
				location,
				...(page !== undefined && { page }),
			};
			return {
				content: null,
				diagnostics: [...diagnostics, diagnostic],
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
			return {
				content: imgElement,
				diagnostics,
			};
		}

		// If no source found but we have attribute diagnostics, return them
		if (diagnostics.length > 0) {
			return { content: null, diagnostics };
		}
	}

	// Handle Confluence macros
	if (tagName === "ac:structured-macro") {
		return classifyMacro(el, page);
	}

	// Handle ac:task-list (Confluence-specific element)
	if (tagName === "ac:task-list") {
		return classifyTaskListElement(el, page);
	}

	if ((CANONICAL_ELEMENTS as readonly string[]).includes(tagName)) {
		// Check for nested tables (table ANYWHERE inside td/th)
		if (tagName === "td" || tagName === "th") {
			if (hasDescendantTable(el)) {
				const location = getLocation(el);
				const diagnostic: BlockingDiagnostic = {
					severity: "blocking",
					class: "unsupported-construct",
					code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
					construct: `${tagName} containing nested table`,
					location,
					...(page !== undefined && { page }),
				};
				return {
					content: null,
					diagnostics: [diagnostic],
				};
			}
		}

		// Attribute pass: check for exotic attributes (F-2, Appendix C)
		const attrDiagnostic = checkAttributes(el, page);

		// Recursively classify children
		const classifiedChildren: ElementContent[] = [];
		const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [
			...(attrDiagnostic ? [attrDiagnostic] : []),
		];

		for (const child of el.children) {
			const result = classifyNode(child, page);
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

	// Handle complex layout family (F-1, DEC-4)
	if (isLayoutFamily(el.tagName)) {
		const location = getLocation(el);
		const diagnostic: BlockingDiagnostic = {
			severity: "blocking",
			class: "unsupported-construct",
			code: REVERSE_CODES.COMPLEX_LAYOUT,
			construct: tagName,
			location,
			...(page !== undefined && { page }),
		};
		return {
			content: null,
			diagnostics: [diagnostic],
		};
	}

	// Unknown element → blocking diagnostic
	const location = getLocation(el);
	const diagnostic: BlockingDiagnostic = {
		severity: "blocking",
		class: "unsupported-construct",
		code: REVERSE_CODES.UNKNOWN_ELEMENT,
		construct: tagName,
		location,
		...(page !== undefined && { page }),
	};
	return {
		content: null,
		diagnostics: [diagnostic],
	};
}

/** Classify a Confluence macro. */
function classifyMacro(
	el: Element,
	page?: ReversePageContext,
): NodeClassificationResult {
	const macroName = el.properties["ac:name"]?.toString();

	if (macroName === "code") {
		return classifyCodeMacro(el, page);
	}

	if (macroName === "task-list") {
		return classifyTaskListMacro(el, page);
	}

	// Info macros are NOT classified here — panel strip already handled by parser
	// However, if the parser didn't strip it (no marker), we treat it as unknown
	// to preserve the blocking diagnostic behavior
	const location = getLocation(el);
	const diagnostic: BlockingDiagnostic = {
		severity: "blocking",
		class: "unsupported-construct",
		code: REVERSE_CODES.UNKNOWN_MACRO,
		construct: `ac:structured-macro[ac:name="${macroName}"]`,
		location,
		...(page !== undefined && { page }),
	};
	return {
		content: null,
		diagnostics: [diagnostic],
	};
}

/** Classify a code macro → fenced code block. */
function classifyCodeMacro(
	el: Element,
	page?: ReversePageContext,
): NodeClassificationResult {
	// Check for exotic attributes on ac:structured-macro (F-1, Appendix C)
	const attrDiagnostic = checkAttributes(el, page);

	// Check for exotic attributes on ac:parameter children (F-1)
	const paramDiagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> =
		[];
	for (const child of el.children) {
		if (child.type === "element" && child.tagName === "ac:parameter") {
			const paramAttrDiagnostic = checkAttributes(child, page);
			if (paramAttrDiagnostic) {
				paramDiagnostics.push(paramAttrDiagnostic);
			}
		}
	}

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

	// Check for exotic attributes on ac:plain-text-body (F-14, Appendix C none-bucket)
	if (cdataBody) {
		const bodyAttrDiagnostic = checkAttributes(cdataBody, page);
		if (bodyAttrDiagnostic) {
			paramDiagnostics.push(bodyAttrDiagnostic);
		}
	}

	if (!cdataBody) {
		const location = getLocation(el);
		const diagnostic: BlockingDiagnostic = {
			severity: "blocking",
			class: "unsupported-construct",
			code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
			construct: "ac:structured-macro[ac:name='code'] (missing body)",
			location,
			...(page !== undefined && { page }),
		};
		return {
			content: null,
			diagnostics: [
				...(attrDiagnostic ? [attrDiagnostic] : []),
				...paramDiagnostics,
				diagnostic,
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

	return {
		content: preElement,
		diagnostics: [
			...(attrDiagnostic ? [attrDiagnostic] : []),
			...paramDiagnostics,
		],
	};
}

/** Shared helper: map ac:task sequence → task-list HAST + diagnostics (F-2, RSK-P2). */
function mapTaskSequenceToGfmTaskList(
	tasks: Element[],
	page?: ReversePageContext,
): {
	content: Element;
	diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic>;
} {
	const listItems: Element[] = [];
	const allDiagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> =
		[];

	for (const task of tasks) {
		// Check for exotic attributes on ac:task (F-14, Appendix C none-bucket)
		const taskAttrDiagnostic = checkAttributes(task, page);
		if (taskAttrDiagnostic) {
			allDiagnostics.push(taskAttrDiagnostic);
		}

		// Check for unknown children of ac:task (F-3: ac:task-id and others)
		// ac:task-status and ac:task-body are canonical
		// ac:task-id is canonical-silent (server-assigned metadata, no GFM counterpart)
		const ignoredTaskChildren = new Set([
			"ac:task-status",
			"ac:task-body",
			"ac:task-id",
		]);
		for (const child of task.children) {
			if (child.type === "element") {
				if (!ignoredTaskChildren.has(child.tagName)) {
					const location = getLocation(child);
					// F-19(b): canonical-but-misplaced children take fallback, not unknown-element
					const code =
						isCanonicalElement(child.tagName) ||
						isCanonicalAcElement(child.tagName)
							? REVERSE_CODES.UNSUPPORTED_CONSTRUCT
							: REVERSE_CODES.UNKNOWN_ELEMENT;

					const diagnostic: BlockingDiagnostic = {
						severity: "blocking",
						class: "unsupported-construct",
						code,
						construct: child.tagName,
						location,
						...(page !== undefined && { page }),
					};
					allDiagnostics.push(diagnostic);
				}
			}
		}

		const statusEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-status",
		) as Element | undefined;

		// Check for exotic attributes on ac:task-status (F-14, Appendix C none-bucket)
		if (statusEl) {
			const statusAttrDiagnostic = checkAttributes(statusEl, page);
			if (statusAttrDiagnostic) {
				allDiagnostics.push(statusAttrDiagnostic);
			}
		}

		const bodyEl = task.children.find(
			(child) => child.type === "element" && child.tagName === "ac:task-body",
		) as Element | undefined;

		// Check for exotic attributes on ac:task-body (F-14, Appendix C none-bucket)
		if (bodyEl) {
			const bodyAttrDiagnostic = checkAttributes(bodyEl, page);
			if (bodyAttrDiagnostic) {
				allDiagnostics.push(bodyAttrDiagnostic);
			}
		}

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

		// Classify task body content and collect diagnostics (F-2)
		const classifiedBody: ElementContent[] = [];
		for (const child of taskContent) {
			const result = classifyNode(child, page);
			if (result.content) {
				classifiedBody.push(result.content as ElementContent);
			}
			// Propagate body classification diagnostics (F-2)
			allDiagnostics.push(...result.diagnostics);
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
	const ulElement: Element = {
		type: "element",
		tagName: "ul",
		properties: {
			className: ["contains-task-list"],
		},
		children: listItems,
	};

	return {
		content: ulElement,
		diagnostics: allDiagnostics,
	};
}

/** Classify a task-list macro → GFM task list (RSK-P2, F-4, F-6).
 * NOTE: The forward renderer emits <ac:task-list> directly, not this macro form.
 * This branch handles real Confluence task-list macros for completeness.
 */
function classifyTaskListMacro(
	el: Element,
	page?: ReversePageContext,
): NodeClassificationResult {
	const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];

	// Check for exotic attributes on task-list macro wrapper (F-14)
	const attrDiagnostic = checkAttributes(el, page);
	if (attrDiagnostic) {
		diagnostics.push(attrDiagnostic);
	}

	const tasks: Element[] = [];

	// Check for non-ac:task children (F-4, F-6, DEC-6)
	for (const child of el.children) {
		if (child.type === "element") {
			if (child.tagName === "ac:task") {
				// Check if the task has ac:task-status
				if (
					child.children.some(
						(grandchild) =>
							grandchild.type === "element" &&
							grandchild.tagName === "ac:task-status",
					)
				) {
					tasks.push(child);
				} else {
					// ac:task without ac:task-status → diagnose
					const location = getLocation(child);
					const diagnostic: BlockingDiagnostic = {
						severity: "blocking",
						class: "unsupported-construct",
						code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
						construct: "ac:task without ac:task-status",
						location,
						...(page !== undefined && { page }),
					};
					diagnostics.push(diagnostic);
				}
			} else {
				// Non-ac:task child → diagnose
				const location = getLocation(child);
				const code =
					isCanonicalElement(child.tagName) ||
					isCanonicalAcElement(child.tagName)
						? REVERSE_CODES.UNSUPPORTED_CONSTRUCT
						: REVERSE_CODES.UNKNOWN_ELEMENT;

				const diagnostic: BlockingDiagnostic = {
					severity: "blocking",
					class: "unsupported-construct",
					code,
					construct: child.tagName,
					location,
					...(page !== undefined && { page }),
				};
				diagnostics.push(diagnostic);
			}
		}
	}

	// Map tasks to GFM format and collect body diagnostics (F-2)
	const { content, diagnostics: taskBodyDiagnostics } =
		mapTaskSequenceToGfmTaskList(tasks, page);

	return {
		content,
		diagnostics: [...diagnostics, ...taskBodyDiagnostics],
	};
}

/** Classify an ac:task-list element → GFM task list (RSK-P2).
 * This is the form emitted by the forward renderer (storage.ts:155).
 */
function classifyTaskListElement(
	el: Element,
	page?: ReversePageContext,
): NodeClassificationResult {
	// ac:task-list is a direct element (not ac:structured-macro)
	// It contains ac:task elements directly as children
	const diagnostics: Array<BlockingDiagnostic | InformationalDiagnostic> = [];

	// Check for exotic attributes on ac:task-list (F-14, Appendix C none-bucket)
	const attrDiagnostic = checkAttributes(el, page);
	if (attrDiagnostic) {
		diagnostics.push(attrDiagnostic);
	}

	const tasks: Element[] = [];

	// Check for non-ac:task children (F-3, F-5, F-7, DEC-6)
	for (const child of el.children) {
		if (child.type === "element") {
			if (child.tagName === "ac:task") {
				// F-18(a): check for missing ac:task-status (align both forms)
				if (
					!child.children.some(
						(grandchild) =>
							grandchild.type === "element" &&
							grandchild.tagName === "ac:task-status",
					)
				) {
					const location = getLocation(child);
					const diagnostic: BlockingDiagnostic = {
						severity: "blocking",
						class: "unsupported-construct",
						code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
						construct: "ac:task without ac:task-status",
						location,
						...(page !== undefined && { page }),
					};
					diagnostics.push(diagnostic);
				}

				tasks.push(child);
			} else {
				// Non-canonical child → diagnose (F-7: use full canonical set)
				const location = getLocation(child);
				const code =
					isCanonicalElement(child.tagName) ||
					isCanonicalAcElement(child.tagName)
						? REVERSE_CODES.UNSUPPORTED_CONSTRUCT
						: REVERSE_CODES.UNKNOWN_ELEMENT;

				const diagnostic: BlockingDiagnostic = {
					severity: "blocking",
					class: "unsupported-construct",
					code,
					construct: child.tagName,
					location,
					...(page !== undefined && { page }),
				};
				diagnostics.push(diagnostic);
			}
		}
		// Non-whitespace text children per OQ-P2 default (fallback at the task-list element)
		else if (child.type === "text" && child.value.trim() !== "") {
			const location = getLocation(el);
			const diagnostic: BlockingDiagnostic = {
				severity: "blocking",
				class: "unsupported-construct",
				code: REVERSE_CODES.UNSUPPORTED_CONSTRUCT,
				construct: `ac:task-list with non-whitespace text child`,
				location,
				...(page !== undefined && { page }),
			};
			diagnostics.push(diagnostic);
		}
	}

	// Map tasks to GFM format and collect body diagnostics (F-2)
	const { content, diagnostics: taskBodyDiagnostics } =
		mapTaskSequenceToGfmTaskList(tasks, page);

	return {
		content,
		diagnostics: [...diagnostics, ...taskBodyDiagnostics],
	};
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

/** Check if an element is canonical (in the canonical allowlist). */
function isCanonicalElement(tagName: string): boolean {
	return (CANONICAL_ELEMENTS as readonly string[]).includes(tagName);
}

/**
 * Check if an element is an ac:* canonical element (Appendix C).
 * Used for stray-child classification (F-7).
 */
function isCanonicalAcElement(tagName: string): boolean {
	return (CANONICAL_AC_ELEMENTS as readonly string[]).includes(tagName);
}

/** Check for exotic attributes on canonical/specially-handled elements (F-1, F-2, Appendix C). */
function checkAttributes(
	el: Element,
	page?: ReversePageContext,
): BlockingDiagnostic | null {
	const tagName = el.tagName;
	const props = el.properties || {};

	// K1 silence applies to ac:structured-macro per spec F-2/DEC-5 (ADR-0005 K1);
	// ac:task-list row is the recorded DEC-8-adjacent exception
	const K1_ATTRIBUTES = new Set(["ac:macro-id", "ac:schema-version"]);
	const isStructuredMacro = tagName === "ac:structured-macro";

	// Check if this element is canonical (plain-HTML or ac:*) or has an explicit allowlist
	const isCanonical =
		(CANONICAL_ELEMENTS as readonly string[]).includes(tagName) ||
		(CANONICAL_AC_ELEMENTS as readonly string[]).includes(tagName);
	const hasExplicitAllowlist = tagName in CANONICAL_ATTRIBUTE_ALLOWLIST;

	if (!isCanonical && !hasExplicitAllowlist) {
		return null; // Unknown elements are handled elsewhere
	}

	// Get the allowed attributes (empty array for canonical elements not in table)
	const allowedAttrs = CANONICAL_ATTRIBUTE_ALLOWLIST[tagName] || [];

	// Collect exotic attributes (names only, no values, per NFR-6)
	const exoticAttrs: string[] = [];
	for (const attrName of Object.keys(props)) {
		// K1 attributes are only silently ignored on ac:structured-macro
		if (isStructuredMacro && K1_ATTRIBUTES.has(attrName)) {
			continue; // Skip K1 attributes on ac:structured-macro
		}
		if (!allowedAttrs.includes(attrName)) {
			exoticAttrs.push(attrName);
		}
	}

	if (exoticAttrs.length === 0) {
		return null; // No exotic attributes
	}

	// Sort and dedupe attribute names (determinism)
	const sortedAttrs = Array.from(new Set(exoticAttrs)).sort();

	const location = getLocation(el);
	return {
		severity: "blocking",
		class: "unsupported-construct",
		code: REVERSE_CODES.UNSUPPORTED_ATTRIBUTE,
		construct: `${tagName}[${sortedAttrs.join(", ")}]`,
		location,
		...(page !== undefined && { page }),
	};
}

/** Handle complex layout family (F-1, DEC-4) */
function isLayoutFamily(tagName: string): boolean {
	return (
		tagName === "ac:layout" ||
		tagName === "ac:layout-section" ||
		tagName === "ac:layout-cell"
	);
}
