// AttachmentService — the v1-only attachment surface (spike H4). Hash-named
// multipart uploads dedup on the filename; a 400 "same file name" is the
// idempotency signal (NOT an error). `X-Atlassian-Token: no-check` is required
// for multipart writes. In-place `/data` update is intentionally NOT exposed:
// all attachments are hash-named (`marksync-mermaid-<hash>.svg` / `marksync-asset-`),
// so changed bytes always produce a new hash → a new filename → a fresh create,
// never a same-name dup — the `/data` version-bump path is unreachable by design.

import {
	type ConfluenceClient,
	unreachableCause,
} from "#infra/confluence/client";
import {
	AttachmentCreateResponse,
	AttachmentListResponse,
} from "#infra/confluence/schemas/attachment";
import type { Artifact, AttachmentRef } from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export class AttachmentService {
	constructor(private readonly client: ConfluenceClient) {}

	async upload(
		pageId: string,
		artifact: Artifact,
	): Promise<Result<AttachmentRef, MarkSyncError>> {
		const filename = attachmentFilename(artifact);
		const response = await this.client.request(
			"POST",
			this.client.v1(`/content/${pageId}/child/attachment`),
			{ multipart: this.buildForm(filename, artifact) },
		);
		if (!response.ok) return response;
		if (response.value.status >= 200 && response.value.status < 300) {
			return mapCreate(pageId, response.value.json);
		}
		if (
			response.value.status === 400 &&
			isDuplicateFilename(response.value.text)
		) {
			// 400 "Cannot add a new attachment with same file name" — the file is
			// already present; resolve it so the result is idempotent (0 writes).
			return this.resolveExisting(pageId, artifact);
		}
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "uploadAttachment",
			});
		}
		if (response.value.status === 413) {
			return Result.err({
				kind: "TooLarge",
				pageId,
				what: `attachment '${filename}' exceeds the size limit`,
			});
		}
		return Result.err({
			kind: "RemoteUnreachable",
			status: response.value.status,
			cause: unreachableCause(response.value.status, "attachment upload"),
		});
	}

	async exists(
		pageId: string,
		hash: string,
	): Promise<Result<boolean, MarkSyncError>> {
		const list = await this.list(pageId);
		if (!list.ok) return list;
		return Result.ok(list.value.some((a) => a.hash === hash));
	}

	async list(pageId: string): Promise<Result<AttachmentRef[], MarkSyncError>> {
		const response = await this.client.request(
			"GET",
			this.client.v1(`/content/${pageId}/child/attachment`),
		);
		if (!response.ok) return response;
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "listAttachments",
			});
		}
		if (response.value.status < 200 || response.value.status >= 300) {
			return Result.err({
				kind: "RemoteUnreachable",
				status: response.value.status,
				cause: unreachableCause(response.value.status, "attachment list"),
			});
		}
		const parsed = AttachmentListResponse.safeParse(response.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: AttachmentListResponse",
			});
		}
		return Result.ok(parsed.data.results.map((r) => toRef(pageId, r)));
	}

	private buildForm(filename: string, artifact: Artifact): FormData {
		const blob = new Blob([artifact.bytes], { type: artifact.mime });
		const form = new FormData();
		form.append("file", blob, filename);
		form.append("minorEdit", "true");
		return form;
	}

	private async resolveExisting(
		pageId: string,
		artifact: Artifact,
	): Promise<Result<AttachmentRef, MarkSyncError>> {
		const list = await this.list(pageId);
		if (!list.ok) return list;
		const match = list.value.find((a) => a.hash === artifact.hash);
		if (match) return Result.ok(match);
		// Unreachable by design: hash-naming means a 400 "same file name" names a
		// file that MUST appear in the attachment list view. A 400 with no listable
		// match is a Confluence state inconsistency — an invariant violation, not a
		// recoverable failure — so we throw rather than fabricate an id/version the
		// caller could never act on (GH-21 review iter-2).
		throw new Error(
			`duplicate-filename 400 for '${attachmentFilename(
				artifact,
			)}' on page ${pageId} but no listable attachment matched hash '${artifact.hash}'`,
		);
	}
}

/**
 * The hash-derived filename — the dedup key. Mermaid SVGs use the
 * `marksync-mermaid-` prefix (ADR-0002); other assets use `marksync-asset-`.
 */
export function attachmentFilename(artifact: Artifact): string {
	const ext = extFromMime(artifact.mime);
	const prefix =
		artifact.mime === "image/svg+xml" ? "marksync-mermaid-" : "marksync-asset-";
	return `${prefix}${artifact.hash}.${ext}`;
}

function extFromMime(mime: string): string {
	switch (mime) {
		case "image/svg+xml":
			return "svg";
		case "image/png":
			return "png";
		case "image/jpeg":
			return "jpg";
		case "image/gif":
			return "gif";
		case "image/webp":
			return "webp";
		default:
			return "bin";
	}
}

/** Extract the hash from a hash-derived filename (the dedup key). */
function hashFromFilename(filename: string): string {
	const base = filename.replace(/^marksync-(?:mermaid|asset)-/, "");
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(0, dot) : base;
}

function toRef(
	pageId: string,
	r: { id: string; title: string; version?: { number: number } | undefined },
): AttachmentRef {
	return {
		id: r.id,
		pageId,
		filename: r.title,
		hash: hashFromFilename(r.title),
		version: r.version?.number ?? 1,
	};
}

function mapCreate(
	pageId: string,
	body: unknown,
): Result<AttachmentRef, MarkSyncError> {
	const parsed = AttachmentCreateResponse.safeParse(body);
	if (!parsed.success) {
		return Result.err({
			kind: "RemoteUnreachable",
			cause: "schema validation failed: AttachmentCreateResponse",
		});
	}
	return Result.ok(toRef(pageId, parsed.data));
}

function isDuplicateFilename(text: string | undefined): boolean {
	return (
		!!text && /Cannot add a new attachment with same file name/i.test(text)
	);
}
