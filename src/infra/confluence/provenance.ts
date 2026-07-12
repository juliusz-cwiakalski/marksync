// The Confluence `version.message` provenance formatter (ADR-0006 / ADR-0010).
// Produces a deterministic MarkSync/Git prefix + head commit + a compact
// included-commit summary, trimmed to MAX_VERSION_MESSAGE_LEN. The exact usable
// limit is TO CONFIRM against the live tenant (ADR-0010 §"Open questions" / E5-S1).

/** Conservative default; tighten after empirical confirmation (PD-6 / ADR-0010). */
export const MAX_VERSION_MESSAGE_LEN = 255;

const PROVENANCE_PREFIX = "marksync git";
const ELLIPSIS = "…";

/** Adapter-agnostic provenance input: the head commit + a summary of included commits. */
export interface ProvenanceInput {
	/** The head Git commit SHA the publish is sourced from. */
	headCommit: string;
	/** The number of commits included in this publish (optional). */
	commitCount?: number;
	/** The commit subjects (first lines) included in this publish, in order. */
	subjects?: readonly string[];
}

/**
 * Format a deterministic `version.message` provenance string:
 * `marksync git <head> (<count>): <subj1>; <subj2>; …`, trimmed to
 * {@link MAX_VERSION_MESSAGE_LEN}. Trimming drops whole trailing subjects
 * (never mid-token) and appends an ellipsis so the truncation is visible.
 */
export function formatVersionMessage(input: ProvenanceInput): string {
	const head = input.headCommit;
	const count = input.commitCount ?? input.subjects?.length ?? 0;
	const summary = (input.subjects ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.join("; ");

	const header =
		count > 0
			? `${PROVENANCE_PREFIX} ${head} (${count})`
			: `${PROVENANCE_PREFIX} ${head}`;
	const full = summary.length > 0 ? `${header}: ${summary}` : header;

	if (full.length <= MAX_VERSION_MESSAGE_LEN) return full;
	return trimToLimit(header, summary, MAX_VERSION_MESSAGE_LEN);
}

function trimToLimit(header: string, summary: string, limit: number): string {
	// Reserve room for the ellipsis; try to keep whole subjects.
	const subjects = summary.split("; ").filter((s) => s.length > 0);
	let kept = "";
	for (const subject of subjects) {
		const candidate = kept.length === 0 ? subject : `${kept}; ${subject}`;
		const proposed = summary.length > 0 ? `${header}: ${candidate}` : header;
		if (proposed.length + ELLIPSIS.length <= limit) {
			kept = candidate;
		} else {
			break;
		}
	}
	const body =
		kept.length > 0 ? `${header}: ${kept}${ELLIPSIS}` : `${header}${ELLIPSIS}`;
	// Hard cap in case even the header overflows the limit.
	return body.length > limit
		? `${body.slice(0, Math.max(0, limit - ELLIPSIS.length))}${ELLIPSIS}`
		: body;
}
