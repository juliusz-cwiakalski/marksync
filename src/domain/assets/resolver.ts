// Path-safe, content-addressed asset resolution (GH-26).
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
		try {
			this.rootReal = fs.realpathSync(opts.root);
		} catch {
			this.rootReal = opts.root;
		}
		this.readBytes = opts.readBytes ?? this.defaultReadBytes;
	}

	async resolve(
		hast: Root,
		docPath: string,
	): Promise<Result<AssetSet, MarkSyncError>> {
		const artifacts: Artifact[] = [];
		const srcMap = new Map<string, ResolvedAsset>();

		const visitedPaths = new Set<string>();

		for (const child of this.walkElements(hast)) {
			if (child.tagName === "img") {
				const src = child.properties?.src;
				if (typeof src !== "string") continue;

				if (src.startsWith("http://") || src.startsWith("https://")) {
					continue;
				}

				const resolved = path.resolve(path.dirname(docPath), src);

				const targetReal = await this.safeRealpath(resolved);
				if (!targetReal.ok) {
					return Res.err({
						kind: "Forbidden",
						pageId: "",
						operation: "path-traversal",
					});
				}

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

				if (visitedPaths.has(targetReal.value)) {
					for (const resolvedAsset of srcMap.values()) {
						if (resolvedAsset.canonicalPath === targetReal.value) {
							child.properties.src = resolvedAsset.filename;
							break;
						}
					}
					continue;
				}
				visitedPaths.add(targetReal.value);

				const bytes = this.readBytes(targetReal.value);

				const mime = this.mimeFromPath(targetReal.value);

				const hash = await sha256Hex(bytes);

				const artifact: Artifact = { bytes, mime, hash };

				const filename = assetFilename({ hash, mime });

				const resolvedAsset: ResolvedAsset = {
					filename,
					hash,
					mime,
					canonicalPath: targetReal.value,
				};

				artifacts.push(artifact);
				srcMap.set(src, resolvedAsset);

				child.properties.src = filename;
			}
		}

		return Res.ok({ artifacts, srcMap });
	}

	private async safeRealpath(
		target: string,
	): Promise<Result<string, MarkSyncError>> {
		try {
			const resolved = fs.realpathSync(target);
			return Res.ok(resolved);
		} catch {
			return Res.err({
				kind: "Forbidden",
				pageId: "",
				operation: "path-traversal",
			});
		}
	}

	private defaultReadBytes(canonicalPath: string): Uint8Array {
		const buffer = fs.readFileSync(canonicalPath);
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}

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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	// F-5: Pass the Uint8Array view (not bytes.buffer) so byteOffset/byteLength are honored
	const d = await crypto.subtle.digest("SHA-256", bytes as any);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
