// Reverse diagnostic model — two-class taxonomy (DEC-1).

import type { Result } from "#domain/result";

// Stable per-class codes — additions-only per spec §22.
export const REVERSE_CODES = {
	UNSUPPORTED_CONSTRUCT: "reverse/unsupported-construct",
	SYNTHETIC_ARTIFACT: "marksync/synthetic-artifact",
	STORAGE_PARSE_ERROR: "reverse/parse-error",
} as const;

export type ReverseCode = (typeof REVERSE_CODES)[keyof typeof REVERSE_CODES];

// Two severity classes: blocking (fails conversion) vs informational
export interface BlockingDiagnostic {
	readonly severity: "blocking";
	readonly class: "unsupported-construct";
	readonly code: ReverseCode;
	readonly construct: string;
	readonly location: { line: number; column: number };
}

export interface InformationalDiagnostic {
	readonly severity: "informational";
	readonly class: "marksync-synthetic-artifact";
	readonly code: ReverseCode;
	readonly construct: string;
	readonly location: { line: number; column: number };
}

export type ReverseDiagnostic = BlockingDiagnostic | InformationalDiagnostic;

// ReverseError channel — NOT a MarkSyncError kind (PD-2, PM-DEC-3).
// Standalone union to avoid violating PM-DEC-2/AC-F6-1 (0 CLI delta).
export interface StorageParseError {
	readonly kind: "StorageParseError";
	readonly code: ReverseCode;
	readonly location: { line: number; column: number };
	readonly detail: string;
}

export interface ReverseSuccess {
	readonly markdown: string;
	readonly diagnostics: InformationalDiagnostic[];
}

export type ReverseError = StorageParseError | BlockingDiagnostic;

export type ReverseResult = Result<ReverseSuccess, ReverseError>;

// Normalizer result — same type, different entry point (DM-3)
export type NormalizeResult = Result<string, never>;
