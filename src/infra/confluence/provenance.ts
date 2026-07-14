// Confluence provenance: version.message formatter + visible panel builder +
// direct-edit classifier (ADR-0006 / ADR-0010). Privacy: the marksync.metadata
// property stores only commitCount + trimMarker — never commit subjects
// (ADR-0010 C-2 puts subjects in version.message only).

/** Conservative default; tighten after empirical confirmation (PD-6 / ADR-0010). */
export const MAX_VERSION_MESSAGE_LEN = 255;

const PROVENANCE_PREFIX = "marksync git";
const ELLIPSIS = "…";
const PANEL_MARKER = "marksync:provenance-panel";

/** Adapter-agnostic provenance input: the head commit + a summary of included commits. */
export interface ProvenanceInput {
	/** The head Git commit SHA the publish is sourced from. */
	headCommit: string;
	/** The source branch name (e.g. "main"). */
	sourceBranch?: string;
	/** The number of commits included in this publish (optional). */
	commitCount?: number;
	/** The commit subjects (first lines) included in this publish, in order. */
	subjects?: readonly string[];
}

/** Formatted version message + truncation metadata for the content property. */
export interface VersionMessageMeta {
	message: string;
	/** "" when no subjects were dropped; "+N more" otherwise. */
	trimMarker: string;
}

/** Metadata needed to build the visible provenance panel (NFR-A11Y-3). */
export interface ProvenancePanelMeta {
	/** Repo-relative source file path. */
	sourcePath: string;
	/** Source branch name (e.g. "main"). */
	sourceBranch: string;
	/** Head Git commit SHA. */
	headCommit: string;
	/** ISO-8601 timestamp of this sync. */
	synchronizedAt: string;
}

/**
 * Format a deterministic `version.message` provenance string:
 * `marksync git <head> (<count>): <subj1>; <subj2>; …`, trimmed to
 * {@link MAX_VERSION_MESSAGE_LEN}. Trimming drops whole trailing subjects
 * (never mid-token) and appends an ellipsis so the truncation is visible.
 */
export function formatVersionMessage(input: ProvenanceInput): string {
	return formatVersionMessageWithMeta(input).message;
}

/**
 * Like {@link formatVersionMessage} but also returns a `trimMarker` indicating
 * how many subjects were dropped by length truncation. The marker goes into the
 * `marksync.metadata` content property (ADR-0010 privacy: count + marker only).
 */
export function formatVersionMessageWithMeta(input: ProvenanceInput): VersionMessageMeta {
	const head = input.headCommit;
	const count = input.commitCount ?? input.subjects?.length ?? 0;
	const subjects = (input.subjects ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const summary = subjects.join("; ");

	const header =
		count > 0
			? `${PROVENANCE_PREFIX} ${head} (${count})`
			: `${PROVENANCE_PREFIX} ${head}`;
	const full = summary.length > 0 ? `${header}: ${summary}` : header;

	if (full.length <= MAX_VERSION_MESSAGE_LEN) {
		return { message: full, trimMarker: "" };
	}

	const { message, keptCount } = trimToLimit(header, subjects, MAX_VERSION_MESSAGE_LEN);
	const dropped = subjects.length - keptCount;
	return {
		message,
		trimMarker: dropped > 0 ? `+${dropped} more` : "",
	};
}

function trimToLimit(
	header: string,
	subjects: readonly string[],
	limit: number,
): { message: string; keptCount: number } {
	let kept = "";
	let keptCount = 0;
	for (const subject of subjects) {
		const candidate = kept.length === 0 ? subject : `${kept}; ${subject}`;
		const proposed = subjects.length > 0 ? `${header}: ${candidate}` : header;
		if (proposed.length + ELLIPSIS.length <= limit) {
			kept = candidate;
			keptCount++;
		} else {
			break;
		}
	}
	const body =
		kept.length > 0 ? `${header}: ${kept}${ELLIPSIS}` : `${header}${ELLIPSIS}`;
	return {
		message:
			body.length > limit
				? `${body.slice(0, Math.max(0, limit - ELLIPSIS.length))}${ELLIPSIS}`
				: body,
		keptCount,
	};
}

/**
 * Build a visible provenance panel as Storage XHTML (`{info}` macro), appended
 * at the page footer. The panel is excluded from drift-detection hash by
 * construction (appended post-render as a Storage string; the classifier
 * compares HAST hashes which never include the panel).
 */
export function buildProvenancePanel(meta: ProvenancePanelMeta): string {
	const source = escapeXml(meta.sourcePath);
	const revision = escapeXml(meta.headCommit);
	const branch = escapeXml(meta.sourceBranch);
	const timestamp = escapeXml(meta.synchronizedAt);
	return (
		`<ac:structured-macro ac:name="info"><ac:rich-text-body>` +
		`<!-- ${PANEL_MARKER} -->` +
		`<p><strong>Source:</strong> ${source}</p>` +
		`<p><strong>Git revision:</strong> ${revision} (${branch})</p>` +
		`<p><strong>Last sync:</strong> ${timestamp}</p>` +
		`</ac:rich-text-body></ac:structured-macro>`
	);
}

/** Stable HTML-comment marker embedded in the panel for identification. */
export const PROVENANCE_PANEL_MARKER = PANEL_MARKER;

/**
 * Classify a Confluence page version as MarkSync-authored or a direct edit
 * (NFR-REL-9). Returns `"marksync"` if `version.message` starts with the
 * `marksync git` prefix, otherwise `"direct"`.
 */
export function classifyVersion(version: {
	message?: string;
}): "marksync" | "direct" {
	if (typeof version.message !== "string") return "direct";
	return version.message.startsWith(PROVENANCE_PREFIX) ? "marksync" : "direct";
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
