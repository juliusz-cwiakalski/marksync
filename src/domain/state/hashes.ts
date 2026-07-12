// ContentHash value object + hash helpers (GH-20 delegate; DEC-2/PD-2 wire prefix).

import { createHash } from "node:crypto";
import { canonicalize, contentHash } from "#domain/render/canonicalize";
import type { Root } from "hast";

/** Wire-format prefix for all hash outputs (PD-2; matches lock convention). */
export const HASH_WIRE_PREFIX = "sha256:" as const;

/**
 * Raw sha256 over source bytes (informational only — NOT the comparison basis,
 * NFR-8).
 */
export function rawHash(source: string | Uint8Array): string {
	return HASH_WIRE_PREFIX + createHash("sha256").update(source).digest("hex");
}

/**
 * Canonical semantic hash (delegates verbatim to GH-20's `contentHash(canonicalize(hast))`,
 * DEC-2). This is the comparison basis (F-6).
 */
export function canonicalHash(hast: Root): string {
	return HASH_WIRE_PREFIX + contentHash(canonicalize(hast));
}

/**
 * Deterministic digest over the sorted attachment set so attachment add/remove/order
 * never perturb it.
 */
export function attachmentHash(attachmentHashes: Record<string, string>): string {
	const sortedKeys = Object.keys(attachmentHashes).sort();
	const lines = sortedKeys.map((key) => `${key}\0${attachmentHashes[key]}`);
	const combined = lines.join("\n");
	return HASH_WIRE_PREFIX + createHash("sha256").update(combined).digest("hex");
}

/**
 * ContentHash — local-document snapshot VO (PD-1: three hash facets + R1 metadata facets).
 */
export interface ContentHash {
	rawHash: string;
	canonicalHash: string;
	attachmentHash: string;
	title: string;
	parentPageId: string;
}

/**
 * Convenience builder calling the three helpers and bundling metadata.
 */
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