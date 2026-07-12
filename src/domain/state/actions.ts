// SyncState → Action mapping.

import type { RemoteState, SharedBase, SyncState } from "./sync-state";
import type { DocumentId } from "#domain/identity/document-id";
import type { MarkSyncError } from "#domain/errors";

export type Action =
	| { kind: "NoOp"; uuid: DocumentId }
	| { kind: "Update"; uuid: DocumentId }
	| { kind: "Block"; uuid: DocumentId; error: MarkSyncError }
	| { kind: "Skip"; uuid: DocumentId; reason: "LOCAL_MISSING" };

export interface ActionContext {
	base: SharedBase;
	remote: RemoteState;
}

export function actionFor(state: SyncState, ctx: ActionContext): Action {
	const { base, remote } = ctx;

	switch (state) {
		case "NO_CHANGE":
			return { kind: "NoOp", uuid: base.uuid };
		case "LOCAL_AHEAD":
			return { kind: "Update", uuid: base.uuid };
		case "REMOTE_AHEAD":
		case "DIVERGED": {
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
		case "REMOTE_MISSING":
			return {
				kind: "Block",
				uuid: base.uuid,
				error: { kind: "RemoteMissing", pageId: base.pageId },
			};
		case "LOCAL_MISSING":
			return { kind: "Skip", uuid: base.uuid, reason: "LOCAL_MISSING" };
		default: {
			const _exhaustive: never = state;
			throw new Error(`Unknown SyncState: ${_exhaustive}`);
		}
	}
}
