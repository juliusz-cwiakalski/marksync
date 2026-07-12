// SyncState enum + RemoteState union + SharedBase view (ADR-0006 C-1..C-6; UL §Sync State).

import type { DocumentId } from "#domain/identity/document-id";
import { z } from "zod";

/** Six drift states matching Ubiquitous Language §Sync State exactly. */
export const SYNC_STATES = [
	"NO_CHANGE",
	"LOCAL_AHEAD",
	"REMOTE_AHEAD",
	"DIVERGED",
	"REMOTE_MISSING",
	"LOCAL_MISSING",
] as const;

/** Six drift states matching Ubiquitous Language §Sync State exactly. */
export type SyncState = (typeof SYNC_STATES)[number];

/** Zod schema for output-boundary validation (UL binding rule 3). */
export const SyncStateSchema = z.enum(SYNC_STATES);

/** SyncState values as namespace (for test fixtures and mapping). */
export const SyncStateValue = {
	NO_CHANGE: "NO_CHANGE",
	LOCAL_AHEAD: "LOCAL_AHEAD",
	REMOTE_AHEAD: "REMOTE_AHEAD",
	DIVERGED: "DIVERGED",
	REMOTE_MISSING: "REMOTE_MISSING",
	LOCAL_MISSING: "LOCAL_MISSING",
} as const satisfies Record<string, SyncState>;

/** Remote state discriminated union — the adapter-agnostic shape the engine builds. */
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

/** SharedBase — read projection over PageBinding the classifier consumes (F-3/F-4/DM-1/3/6). */
export interface SharedBase {
	uuid: DocumentId;
	pageId: string;
	parentPageId: string;
	pageVersion: number;
	renderedBodyHash: string;
	attachmentHashes: Record<string, string>;
}
