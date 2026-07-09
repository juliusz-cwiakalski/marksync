// The duplicate-UUID detector — the pre-write safety gate (ADR-0006 C-4 /
// INV-SAFE-3). Returns Result.err(DuplicateUuid) on the first UUID shared by
// >1 doc; docs missing a UUID are NOT duplicates (they get one at first publish).

import type { DocumentId } from "#domain/identity/document-id";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export interface DocWithUuid {
	path: string;
	uuid?: DocumentId;
}

export function detectDuplicateUuids(
	docs: readonly DocWithUuid[],
): Result<void, MarkSyncError> {
	const pathsByUuid = new Map<string, string[]>();
	for (const doc of docs) {
		if (doc.uuid === undefined) continue;
		const paths = pathsByUuid.get(doc.uuid);
		if (paths === undefined) {
			pathsByUuid.set(doc.uuid, [doc.path]);
		} else {
			paths.push(doc.path);
		}
	}
	for (const [uuid, paths] of pathsByUuid) {
		if (paths.length > 1) {
			return Result.err({ kind: "DuplicateUuid", uuid, paths });
		}
	}
	return Result.ok(undefined);
}
