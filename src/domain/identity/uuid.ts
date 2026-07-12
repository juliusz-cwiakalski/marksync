// UUID v7 identity — generated at first-publish, stored in the `marksync.uuid`
// front-matter (ADR-0006 C-1: identity survives clones/branches/renames).

import { v7 } from "uuid";
import type { DocumentId } from "#domain/identity/document-id";

export const UUID_V7_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mint a fresh UUID v7 (RFC 9562) and brand it as a {@link DocumentId}. */
export function generateUuidV7(): DocumentId {
	return v7() as DocumentId;
}

export function isUuidV7(s: string): boolean {
	return UUID_V7_REGEX.test(s);
}

/**
 * Extract the Unix millisecond timestamp from a UUID v7 (RFC 9562).
 * The first 48 bits (12 hex digits) encode the timestamp.
 *
 * @param uuid - A UUID v7 string (with or without `op_` prefix).
 * @returns The Unix millisecond timestamp, or `undefined` if the UUID is invalid.
 */
export function uuidV7Timestamp(uuid: string): number | undefined {
	// Strip `op_` prefix if present (operation-id format: `op_<uuid-v7>`)
	const cleanUuid = uuid.startsWith("op_") ? uuid.slice(3) : uuid;
	if (!UUID_V7_REGEX.test(cleanUuid)) {
		return undefined;
	}

	// Extract the first 12 hex characters (48 bits)
	const hexTs = cleanUuid.slice(0, 12);
	return Number.parseInt(hexTs, 16);
}

/**
 * Narrow `s` to {@link DocumentId} or throw — the invariant-violation guard for
 * internal/trusted boundaries. Untrusted input uses
 * {@link parseDocumentId} (the `Result` channel).
 */
export function assertUuidV7(s: string): asserts s is DocumentId {
	if (!UUID_V7_REGEX.test(s)) {
		throw new Error(`not a UUID v7: ${s}`);
	}
}
