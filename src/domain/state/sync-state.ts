// SyncState enum + RemoteState union + SharedBase view (ADR-0006).

import type { DocumentId } from "#domain/identity/document-id";
import { z } from "zod";

export const SYNC_STATES = [
	"NO_CHANGE",
	"LOCAL_AHEAD",
	"REMOTE_AHEAD",
	"DIVERGED",
	"REMOTE_MISSING",
	"LOCAL_MISSING",
] as const;

export type SyncState = (typeof SYNC_STATES)[number];

export const SyncStateSchema = z.enum(SYNC_STATES);

export type RemoteState =
	| {
			kind: "present";
			bodyHash: string;
			version: number;
			title?: string;
			parentPageId?: string;
	  }
	| { kind: "missing" }
	| { kind: "forbidden"; pageId: string };

export interface SharedBase {
	uuid: DocumentId;
	pageId: string;
	parentPageId: string;
	pageVersion: number;
	renderedBodyHash: string;
	attachmentHashes: Record<string, string>;
}
