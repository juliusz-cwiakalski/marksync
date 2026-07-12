// SyncState → Action mapping (F-5/DM-5; PD-5 context for Block error fields).

import type { RemoteState, SharedBase, SyncState } from "./sync-state";
import { SyncStateValue } from "./sync-state";
import type { DocumentId } from "#domain/identity/document-id";
import type { MarkSyncError } from "#domain/errors";

/** Action discriminated union — the decision the engine acts on (F-5). */
export type Action =
	| { kind: "NoOp"; uuid: DocumentId }
	| { kind: "Update"; uuid: DocumentId }
	| { kind: "Block"; uuid: DocumentId; error: MarkSyncError }
	| { kind: "Skip"; uuid: DocumentId; reason: "LOCAL_MISSING" };

/** ActionContext carries base + remote so Block can populate required fields (PD-5). */
export interface ActionContext {
	base: SharedBase;
	remote: RemoteState;
}

/**
 * Map a SyncState to its corresponding Action (F-5, DM-5). Called only on
 * `ok` states — the forbidden path returns `err` from `classify` and never
 * reaches here.
 */
export function actionFor(state: SyncState, ctx: ActionContext): Action {
	const { base, remote } = ctx;

	switch (state) {
		case SyncStateValue.NO_CHANGE:
			return { kind: "NoOp", uuid: base.uuid };
		case SyncStateValue.LOCAL_AHEAD:
			return { kind: "Update", uuid: base.uuid };
		case SyncStateValue.REMOTE_AHEAD:
		case SyncStateValue.DIVERGED: {
			const remoteVersion =
				remote.kind === "present" ? remote.version : base.pageVersion;
			return {
				kind: "Block",
				uuid: base.uuid,
				error: {
					kind: "Conflict",
					pageId: base.pageId,
					baseVersion: base.pageVersion,
					remoteVersion,
				},
			};
		}
		case SyncStateValue.REMOTE_MISSING:
			return {
				kind: "Block",
				uuid: base.uuid,
				error: { kind: "RemoteMissing", pageId: base.pageId },
			};
		case SyncStateValue.LOCAL_MISSING:
			return { kind: "Skip", uuid: base.uuid, reason: "LOCAL_MISSING" };
		default: {
			const _exhaustive: never = state;
			throw new Error(`Unknown SyncState: ${_exhaustive}`);
		}
	}
}
