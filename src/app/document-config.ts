// src/app/document-config.ts
//
// Document-level front-matter overrides (GH-15 F-4). Parses the YAML block
// between leading `---` fences (gray-matter style) using the SAME `yaml`
// dependency as marksync.yml (DEC-1) and merges per-document `marksync.*`
// overrides over the derived/base document config via `resolveDocumentConfig`.
//
// Tolerance (RSK-5): absent front-matter, malformed fences, unrelated keys, and
// CRLF line endings are all handled gracefully — the parser returns `{}` and
// `resolveDocumentConfig` returns `base` unchanged, NEVER throwing.
//
// Application tier: imports `yaml` (allowed) only; no `cli`/`infra`/Git access.

import { parse as parseYaml } from "yaml";

/**
 * Per-document resolved config. The `base` is derived downstream (title from
 * filename, intendedParent from the hierarchy step, uuid from identity E3-S1);
 * front-matter overrides apply on top.
 *
 * `exactOptionalPropertyTypes`-safe: `uuid` is "absent" (not present-as-
 * undefined) when no identity has been assigned yet.
 */
export interface DocumentConfig {
	/** Repo-relative source path of the markdown document. */
	sourcePath: string;
	/** Document title (derived from filename, or overridden by marksync.title). */
	title: string;
	/** Intended Confluence parent path (derived from hierarchy, or overridden). */
	intendedParent: string;
	/** Source-side identity hook (consumed by E3-S1). Absent until assigned. */
	uuid?: string;
	/** When true, the document is dropped from the selected set (marksync.exclude). */
	exclude: boolean;
}

/**
 * Parse the YAML front-matter block from the head of a Markdown document
 * (gray-matter style). Returns `{}` when:
 *   - there is no leading `---` fence;
 *   - there is no closing `---`/`...` fence (malformed);
 *   - the fenced content is not a YAML mapping;
 *   - the YAML is syntactically invalid.
 *
 * Never throws (RSK-5). CRLF line endings are normalized to LF before fence
 * detection so `\r\n` documents parse correctly.
 */
export function parseFrontMatter(markdown: string): Record<string, unknown> {
	// Normalize CRLF → LF (RSK-5).
	const text = markdown.replace(/\r\n/g, "\n");
	const lines = text.split("\n");
	const opener = lines[0]?.trim();
	if (opener !== "---") return {};

	// Find the closing fence (`---` or `...`) on its own line.
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		const trimmed = lines[i]?.trim();
		if (trimmed === "---" || trimmed === "...") {
			end = i;
			break;
		}
	}
	if (end === -1) return {}; // missing closing fence — tolerate (RSK-5)

	const yamlBlock = lines.slice(1, end).join("\n");
	if (yamlBlock.trim() === "") return {}; // empty front-matter — tolerate

	try {
		const parsed = parseYaml(yamlBlock);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * Merge per-document `marksync.*` front-matter overrides over the derived
 * `base` document config (AC-F4-1 / AC-F4-2).
 *
 * Honoured keys (under the top-level `marksync` map):
 *   - `marksync.title`   (string) — overrides the derived title.
 *   - `marksync.parent`  (string) — overrides the intended parent path.
 *   - `marksync.uuid`    (string) — carries the source-side identity (E3-S1).
 *   - `marksync.exclude` (boolean)— when true, flags the document for removal.
 *
 * Non-`marksync` keys (e.g. `title:`, `tags:`, `draft:`) and wrong-typed
 * `marksync.*` values are ignored. Returns `base` unchanged when no overrides
 * apply (identity merge — TC-DOC-009). Never throws (RSK-5).
 */
export function resolveDocumentConfig(
	base: DocumentConfig,
	frontmatter: Record<string, unknown>,
): DocumentConfig {
	const ms = frontmatter.marksync;
	if (!ms || typeof ms !== "object" || Array.isArray(ms)) {
		return base;
	}
	const m = ms as Record<string, unknown>;

	const result: DocumentConfig = { ...base };
	if (typeof m.title === "string") result.title = m.title;
	if (typeof m.parent === "string") result.intendedParent = m.parent;
	if (typeof m.uuid === "string") result.uuid = m.uuid;
	if (typeof m.exclude === "boolean") result.exclude = m.exclude;
	return result;
}

/**
 * Convenience: parse a Markdown document's front-matter and resolve its
 * overrides in one step. Tolerant of absent/malformed front-matter (RSK-5).
 */
export function resolveDocumentFromMarkdown(
	base: DocumentConfig,
	markdown: string,
): DocumentConfig {
	return resolveDocumentConfig(base, parseFrontMatter(markdown));
}
