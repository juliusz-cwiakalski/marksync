// DocumentId — the branded value object for source-side UUID v7 identity
// (ADR-0006 C-1). A bare `string` cannot stand where a DocumentId is required.

import { isUuidV7 } from "#domain/identity/uuid";
import { Result } from "#domain/result";

export type DocumentId = string & { readonly __brand: "DocumentId" };

/** Narrow domain-local error for an untrusted id candidate — NOT a MarkSyncError arm. */
export type DocumentIdError = { kind: "InvalidDocumentId"; value: string };

export function parseDocumentId(
	s: string,
): Result<DocumentId, DocumentIdError> {
	return isUuidV7(s)
		? Result.ok(s as DocumentId)
		: Result.err({ kind: "InvalidDocumentId", value: s });
}
