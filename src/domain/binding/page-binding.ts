// PageBinding — the durable mapping between a DocumentId and a target page
// (ADR-0006 Shared-base schema). `uuid` is the durable source identity (C-1);
// `pageId` is the mutable remote identity (persisted in the lock — E3-S2).

import type { DocumentId } from "#domain/identity/document-id";

export interface PageBinding {
	uuid: DocumentId;
	sourcePath: string;
	pageId: string;
	parentPageId: string;
	pageVersion: number;
	sourceCommit: string;
	sourceContentHash: string;
	renderedBodyHash: string;
	remoteBodyHash: string;
	attachmentHashes: Record<string, string>;
	operationId: string;
	synchronizedAt: string;
	toolVersion: string;
}

const PAGE_BINDING_STRING_KEYS = [
	"uuid",
	"sourcePath",
	"pageId",
	"parentPageId",
	"sourceCommit",
	"sourceContentHash",
	"renderedBodyHash",
	"remoteBodyHash",
	"operationId",
	"synchronizedAt",
	"toolVersion",
] as const;

export function isPageBinding(value: unknown): value is PageBinding {
	if (value === null || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	const hashes = v.attachmentHashes;
	return (
		PAGE_BINDING_STRING_KEYS.every((k) => typeof v[k] === "string") &&
		typeof v.pageVersion === "number" &&
		hashes !== null &&
		typeof hashes === "object" &&
		!Array.isArray(hashes)
	);
}
