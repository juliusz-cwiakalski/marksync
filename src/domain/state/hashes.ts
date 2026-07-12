// ContentHash value object + hash helpers (delegates to GH-20 canonicalize).

import { createHash } from "node:crypto";
import { canonicalize, contentHash } from "#domain/render/canonicalize";
import type { Root } from "hast";

export const HASH_WIRE_PREFIX = "sha256:" as const;

export function rawHash(source: string | Uint8Array): string {
	return HASH_WIRE_PREFIX + createHash("sha256").update(source).digest("hex");
}

export function canonicalHash(hast: Root): string {
	return HASH_WIRE_PREFIX + contentHash(canonicalize(hast));
}

export function attachmentHash(
	attachmentHashes: Record<string, string>,
): string {
	const sortedKeys = Object.keys(attachmentHashes).sort();
	const lines = sortedKeys.map((key) => `${key}\0${attachmentHashes[key]}`);
	const combined = lines.join("\n");
	return HASH_WIRE_PREFIX + createHash("sha256").update(combined).digest("hex");
}

export interface ContentHash {
	rawHash: string;
	canonicalHash: string;
	attachmentHash: string;
	title: string;
	parentPageId: string;
}

export function buildContentHash(input: {
	source: string | Uint8Array;
	hast: Root;
	attachmentHashes: Record<string, string>;
	title: string;
	parentPageId: string;
}): ContentHash {
	return {
		rawHash: rawHash(input.source),
		canonicalHash: canonicalHash(input.hast),
		attachmentHash: attachmentHash(input.attachmentHashes),
		title: input.title,
		parentPageId: input.parentPageId,
	};
}
