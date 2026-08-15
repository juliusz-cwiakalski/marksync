// Storage→HAST parser via saxes (TDR-0012) — strict fragment mode, CDATA reassembly,
// line/column positions, panel strip, K1 tolerance (spec F-3, DEC-4, DEC-6, ADR-0005).

import saxes from "saxes";
import { Result } from "#domain/result";
import { PROVENANCE_PANEL_MARKER } from "#infra/confluence/provenance";
import type {
	Comment,
	Element,
	ElementContent,
	Properties,
	Root,
	RootContent,
	Text,
} from "hast";
import type { StorageParseError } from "#domain/markdown/reverse-diagnostics";
import { REVERSE_CODES } from "#domain/markdown/reverse-diagnostics";

/** Parser options — not currently used (reserved for future provenance context). */
export interface ParseOptions {
	/** Reserved for future diagnostic provenance context. */
	sourcePath?: string;
}

/**
 * Parse Confluence Storage XHTML into a normalized HAST tree.
 *
 * - Strict XML with saxes (TDR-0012)
 * - Fragment mode (page bodies are multi-root, no XML declaration)
 * - Line/column positions attached to elements (F-4)
 * - CDATA byte-identical reassembly (TDR-0012 C-2)
 * - Namespaced attributes carried verbatim (`ac:`, `ri:` — TDR-0012 C-4)
 * - Panel strip: info macros with marker removed (DEC-6)
 * - K1 tolerance: schema-version/macro-id dropped, whitespace normalized (ADR-0005)
 *
 * @throws Never — all errors wrapped in `StorageParseError` (NFR-4)
 */
export function parseStorage(
	body: string,
	_opts?: ParseOptions,
): Result<Root, StorageParseError> {
	try {
		const parser = new saxes.SaxesParser({
			xmlns: true, // Confluence Storage uses namespaces
			fragment: true, // Page bodies are multi-root fragments
			position: true, // Track line/column for diagnostics
			strictEntities: true, // Fail on undefined entities (RSK-P5)
			additionalNamespaces: {
				ac: "http://atlassian.com/content",
				ri: "http://atlassian.com/resource/identifier",
			},
		});

		const builder = new HastBuilder();

		// Use saxes event emitter API (on() method, not on<event> properties)
		parser.on("error", (err) => {
			// Capture position from parser at error time (saxes Error has no position property)
			const loc = { line: parser.line, column: parser.column };
			builder.addError({
				kind: "StorageParseError",
				code: REVERSE_CODES.STORAGE_PARSE_ERROR,
				location: { line: loc.line, column: loc.column },
				detail: err.message,
			});
		});

		parser.on("text", (text) => builder.addText(text));
		parser.on("cdata", (cdata) => builder.addCdata(cdata));
		parser.on("comment", (comment) => builder.addComment(comment));
		parser.on("opentag", (tag) =>
			builder.openTag(tag, { line: parser.line, column: parser.column }),
		);
		parser.on("closetag", () => builder.closeTag());
		parser.on("end", () => builder.finish());

		parser.write(body).close();

		const result = builder.getResult();
		if (result.error) {
			return Result.err(result.error);
		}

		// Apply read-back normalization (panel strip + K1 tolerance)
		const normalized = normalizeReadback(result.root);
		return Result.ok(normalized);
	} catch (e) {
		// Fallback for any unexpected exceptions (should not happen with saxes)
		return Result.err({
			kind: "StorageParseError",
			code: REVERSE_CODES.STORAGE_PARSE_ERROR,
			location: { line: 1, column: 1 },
			detail: e instanceof Error ? e.message : "Unknown parsing error",
		});
	}
}

/** HAST builder state machine — SAX event stream → HAST tree. */
class HastBuilder {
	root: Root | null = null;
	stack: Element[] = [];
	pendingTextChunks: string[] = [];
	error: StorageParseError | null = null;

	/** Coalesce adjacent text + CDATA chunks into single text nodes (TDR-0012 C-2). */
	flushText(): void {
		if (this.pendingTextChunks.length === 0) return;

		const combined = this.pendingTextChunks.join("");
		// Preserve all text for now — context-aware whitespace handling happens
		// in normalizeReadback() where we know parent element type
		const textNode: Text = {
			type: "text",
			value: combined,
		};
		this.addChild(textNode);
		this.pendingTextChunks = [];
	}

	/** Add character data from text event. */
	addText(text: string): void {
		this.pendingTextChunks.push(text);
	}

	/** Add CDATA content (delivered via dedicated cdata event, not text). */
	addCdata(cdata: string): void {
		this.pendingTextChunks.push(cdata);
	}

	/** Add a comment node (panel marker lives here). */
	addComment(comment: string): void {
		this.flushText();
		const commentNode: Comment = {
			type: "comment",
			value: comment,
		};
		this.addChild(commentNode);
	}

	/** Open tag — push new element onto stack with position. */
	openTag(
		tag: saxes.SaxesTag,
		position: { line: number; column: number },
	): void {
		this.flushText();

		const properties = buildProperties(tag.attributes);
		const element: Element = {
			type: "element",
			tagName: tag.name,
			properties,
			children: [],
			// Position tracking for F-4 diagnostics — saxes provides line/column at tag open
			// saxes: line is 1-indexed, column is 0-indexed
			// unist Point: both line and column are 1-indexed, so add 1 to column
			position: {
				start: {
					line: position.line,
					column: position.column + 1,
					offset: undefined,
				},
				end: {
					line: position.line,
					column: position.column + 1,
					offset: undefined,
				},
			},
		};

		if (this.root === null) {
			// First element becomes the root's first child
			this.root = { type: "root", children: [element] };
		} else if (this.stack.length === 0) {
			// Fragment mode: multiple root-level elements
			this.root?.children.push(element);
		} else {
			// Nested element — stack is non-empty here
			const parent = this.stack[this.stack.length - 1];
			if (parent) {
				parent.children.push(element);
			}
		}

		this.stack.push(element);
	}

	/** Close tag — pop from stack. */
	closeTag(): void {
		this.flushText();
		if (this.stack.length > 0) {
			this.stack.pop();
		}
	}

	/** Flush any remaining text and finalize. */
	finish(): void {
		this.flushText();
	}

	/** Add a child to the current element or root. */
	private addChild(child: RootContent): void {
		if (this.root === null) {
			// Text before any root element — edge case, add to pending root
			this.root = { type: "root", children: [] };
		}

		if (this.stack.length === 0) {
			this.root?.children.push(child);
		} else {
			const parent = this.stack[this.stack.length - 1];
			if (parent) {
				parent.children.push(child as ElementContent);
			}
		}
	}

	/** Record a parsing error. */
	addError(error: StorageParseError): void {
		this.error = error;
	}

	/** Get the final result. */
	getResult(): { root: Root; error: StorageParseError | null } {
		return {
			root: this.root ?? { type: "root", children: [] },
			error: this.error,
		};
	}
}

/** Build HAST properties from saxes attributes (namespaced names preserved). */
function buildProperties(
	attrs:
		| Record<string, string | boolean>
		| Record<string, saxes.SaxesAttributeNS>,
): Properties {
	const result: Properties = {};
	for (const [key, value] of Object.entries(attrs)) {
		if (value === true) continue; // Boolean attributes (rare in Storage)

		// saxes with xmlns: true returns objects for namespaced attributes
		// We preserve the simple string values for use by the classifier
		if (typeof value === "object" && value !== null && "value" in value) {
			// Namespace-aware attribute: store the simple string value
			result[key] = (value as saxes.SaxesAttributeNS).value;
		} else {
			// Simple attribute
			result[key] = value as string | boolean;
		}
	}
	return result;
}

/** Structural whitespace = whitespace-only AND contains a newline (pretty-print artifact). */
function isStructuralWhitespace(value: string): boolean {
	return value.trim() === "" && value.includes("\n");
}

/**
 * Apply read-back normalization to the parsed HAST:
 * - Strip provenance panels (info macros with marker)
 * - Drop K1 attributes (schema-version, macro-id)
 * - Normalize whitespace (context-aware: drop structural between blocks, collapse to space in phrasing)
 *
 * This is the reverse-side counterpart to ADR-0005's K1 tolerance.
 */
function normalizeReadback(root: Root): Root {
	return {
		type: "root",
		children: normalizeChildren(root.children, false), // root is block-level context
	};
}

// Phrasing content elements (inline context where whitespace should collapse to space)
const PHRASING_ELEMENTS = new Set([
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"em",
	"strong",
	"a",
	"code",
	"td",
	"th",
	"li",
]);

function normalizeChildren(
	children: RootContent[],
	parentIsPhrasing: boolean,
): RootContent[] {
	const result: RootContent[] = [];
	for (const child of children) {
		if (child.type === "text") {
			if (!isStructuralWhitespace(child.value)) {
				result.push(child);
			} else if (parentIsPhrasing) {
				// In phrasing context, collapse structural whitespace to a single space (F-3 fix)
				// This preserves rendered spaces between inline elements
				result.push({ type: "text", value: " " });
			}
			// In block context, drop structural whitespace entirely
		} else if (child.type === "element") {
			const normalized = normalizeElement(child);
			if (normalized !== null) {
				result.push(normalized);
			}
		} else {
			// Comments, doctype, etc. — pass through (doctype doesn't occur in Storage)
			result.push(child);
		}
	}
	return result as RootContent[];
}

function normalizeElement(el: Element): Element | null {
	// Panel strip: drop info macros containing the marker
	if (isProvenancePanel(el)) {
		return null; // Strip entirely
	}

	// K1 tolerance: drop schema-version and macro-id attributes
	const properties = dropK1Attributes(el.properties);

	// Recursively normalize children with phrasing context
	const isPhrasing = PHRASING_ELEMENTS.has(el.tagName);
	const children = normalizeChildren(
		el.children as ElementContent[],
		isPhrasing,
	) as ElementContent[];

	return {
		...el,
		properties,
		children,
	};
}

/** Check if an element is a provenance panel (info macro with marker). */
function isProvenancePanel(el: Element): boolean {
	if (el.tagName !== "ac:structured-macro") return false;
	const macroName = el.properties["ac:name"];
	if (macroName !== "info") return false;

	// Check if any descendant comment contains the marker (with whitespace trimming)
	return hasMarkerComment(el);
}

/** Recursively check if an element or its descendants contain the marker comment. */
function hasMarkerComment(el: Element): boolean {
	for (const child of el.children) {
		if (child.type === "comment") {
			const trimmed = child.value.trim();
			if (trimmed === PROVENANCE_PANEL_MARKER) {
				return true;
			}
		} else if (child.type === "element") {
			if (hasMarkerComment(child)) {
				return true;
			}
		}
	}

	return false;
}

/** Drop K1 tolerance attributes (schema-version, macro-id). */
function dropK1Attributes(props: Properties): Properties {
	const result: Properties = {};
	for (const [key, value] of Object.entries(props)) {
		if (key === "ac:schema-version" || key === "ac:macro-id") {
			continue; // Skip K1 attributes
		}
		result[key] = value;
	}
	return result;
}
