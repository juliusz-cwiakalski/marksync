import type { Root, Element } from "hast";
import * as path from "node:path";
import * as fs from "node:fs";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res, type Result } from "#domain/result";
import { assetFilename } from "#domain/assets/naming";
import type { Artifact } from "#domain/target/port";

export interface ResolvedAsset {
	filename: string;
	hash: string;
	mime: string;
	canonicalPath: string;
}

export interface AssetSet {
	artifacts: Artifact[];
	srcMap: Map<string, ResolvedAsset>;
}

export interface AssetResolverOptions {
	root: string;
	/** Injectable for tests (confinement-read tracking). Default: realpath + readFileSync. */
	readBytes?: (canonicalPath: string) => Uint8Array;
}

export class AssetResolver {
	private readonly rootReal: string;
	private readonly readBytes: (canonicalPath: string) => Uint8Array;

	constructor(opts: AssetResolverOptions) {
		// Canonicalize root if it exists (for confinement). If it doesn't exist
		// (test mocks), use it as-is.
		try {
			this.rootReal = fs.realpathSync(opts.root);
		} catch {
			// Root doesn't exist - use as-is (test scenario)
			this.rootReal = opts.root;
		}
		this.readBytes = opts.readBytes ?? this.defaultReadBytes;
	}

	/**
	 * Walk the HAST for local images, confine to root, hash, and rewrite nodes.
	 * Returns a Result with AssetSet on success, or Forbidden(path-traversal) on confinement failure.
	 */
	async resolve(
		hast: Root,
		docPath: string,
	): Promise<Result<AssetSet, MarkSyncError>> {
		const artifacts: Artifact[] = [];
		const srcMap = new Map<string, ResolvedAsset>();

		// Track visited canonical paths for dedup within a doc
		const visitedPaths = new Set<string>();

		for (const child of this.walkElements(hast)) {
			if (child.tagName === "img") {
				const src = child.properties?.src;
				if (typeof src !== "string") continue;

				// Skip remote images (http/https)
				if (src.startsWith("http://") || src.startsWith("https://")) {
					continue;
				}

				// Resolve relative to document directory
				const resolved = path.resolve(path.dirname(docPath), src);

				// Canonicalize both root and target (symlink defense - story R1)
				const targetReal = await this.safeRealpath(resolved);
				if (!targetReal.ok) {
					// realpath failed (broken symlink / non-existent) → Forbidden
					return Res.err({
						kind: "Forbidden",
						pageId: "",
						operation: "path-traversal",
					});
				}

				// Confinement check: must be within root (exact match or root + path.sep prefix)
				const withinRoot =
					targetReal.value === this.rootReal ||
					targetReal.value.startsWith(this.rootReal + path.sep);
				if (!withinRoot) {
					return Res.err({
						kind: "Forbidden",
						pageId: "",
						operation: "path-traversal",
					});
				}

				// Dedup within the document
				if (visitedPaths.has(targetReal.value)) {
					// Already processed this file - just rewrite the node
					const existing = srcMap.get(src);
					if (existing) {
						child.properties.src = existing.filename;
					}
					continue;
				}
				visitedPaths.add(targetReal.value);

				// Read bytes (safe: confinement passed)
				const bytes = this.readBytes(targetReal.value);

				// Derive MIME from extension
				const mime = this.mimeFromPath(targetReal.value);

				// Compute sha256 hash
				const hash = await sha256Hex(bytes);

				// Build Artifact
				const artifact: Artifact = { bytes, mime, hash };

				// Compute filename
				const filename = assetFilename({ hash, mime });

				// Record
				const resolvedAsset: ResolvedAsset = {
					filename,
					hash,
					mime,
					canonicalPath: targetReal.value,
				};

				artifacts.push(artifact);
				srcMap.set(src, resolvedAsset);

				// Rewrite the HAST node
				child.properties.src = filename;
			}
		}

		return Res.ok({ artifacts, srcMap });
	}

	/**
	 * Safely realpath with error handling. Returns an error result on failure.
	 */
	private async safeRealpath(
		target: string,
	): Promise<Result<string, MarkSyncError>> {
		try {
			const resolved = fs.realpathSync(target);
			return Res.ok(resolved);
		} catch {
			// Broken symlink or non-existent path → Forbidden
			return Res.err({
				kind: "Forbidden",
				pageId: "",
				operation: "path-traversal",
			});
		}
	}

	/**
	 * Default readBytes implementation.
	 */
	private defaultReadBytes(canonicalPath: string): Uint8Array {
		const buffer = fs.readFileSync(canonicalPath);
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}

	/**
	 * Walk all element nodes in the HAST tree.
	 */
	private *walkElements(node: Root | Element): Generator<Element> {
		if (node.type === "root") {
			for (const child of node.children) {
				if (child.type === "element") {
					yield* this.walkElements(child);
				}
			}
		} else if (node.type === "element") {
			yield node;
			if (node.children) {
				for (const child of node.children) {
					if (child.type === "element") {
						yield* this.walkElements(child);
					}
				}
			}
		}
	}

	/**
	 * Derive MIME type from file extension.
	 */
	private mimeFromPath(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		switch (ext) {
			case ".png":
				return "image/png";
			case ".jpg":
			case ".jpeg":
				return "image/jpeg";
			case ".gif":
				return "image/gif";
			case ".svg":
				return "image/svg+xml";
			case ".webp":
				return "image/webp";
			default:
				return "application/octet-stream";
		}
	}
}

/**
 * Compute sha256 hex from bytes using crypto.subtle.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const d = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
