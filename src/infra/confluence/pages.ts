// PageService — the v2 page surface (create/read/update/move) over the
// ConfluenceClient, including the 409-conflict parse (ADR-0006 C-5/C-6 / spike
// H5) and the 403→Forbidden warn+skip (INV-SAFE-1: never delete+recreate).

import type { ConfluenceClient } from "#infra/confluence/client";
import {
	Conflict409Envelope,
	PageV2Response,
} from "#infra/confluence/schemas/page";
import type {
	CreatePageRequest,
	MovePageRequest,
	Page,
	UpdatePageRequest,
} from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

/** A parse result for the 409-conflict title (spike H5 exact shape). */
interface ParsedVersions {
	remoteVersion: number;
	providedVersion: number;
}

export class PageService {
	constructor(
		private readonly client: ConfluenceClient,
		private readonly spaceId: string,
	) {}

	async create(req: CreatePageRequest): Promise<Result<Page, MarkSyncError>> {
		const response = await this.client.request(
			"POST",
			this.client.v2("/pages"),
			{
				json: {
					spaceId: this.spaceId,
					status: "current",
					title: req.title,
					parentId: req.parentId,
					body: { representation: "storage", value: req.body },
					...(req.message ? { version: { message: req.message } } : {}),
				},
			},
		);
		if (!response.ok) return response;
		return mapPage(response.value.status, response.value.json);
	}

	async get(id: string): Promise<Result<Page, MarkSyncError>> {
		const response = await this.client.request(
			"GET",
			this.client.v2(`/pages/${id}?body-format=storage`),
		);
		if (!response.ok) return response;
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId: id,
				operation: "getPage",
			});
		}
		if (response.value.status === 404) {
			return Result.err({ kind: "RemoteMissing", pageId: id });
		}
		return mapPage(response.value.status, response.value.json);
	}

	async update(req: UpdatePageRequest): Promise<Result<Page, MarkSyncError>> {
		const response = await this.client.request(
			"PUT",
			this.client.v2(`/pages/${req.pageId}`),
			{
				json: {
					id: req.pageId,
					status: "current",
					title: req.title,
					body: { representation: "storage", value: req.body },
					version: {
						number: req.baseVersion + 1,
						...(req.message ? { message: req.message } : {}),
					},
				},
			},
		);
		if (!response.ok) return response;
		if (response.value.status === 409) {
			return parseConflict(req.pageId, response.value.json);
		}
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId: req.pageId,
				operation: "updatePage",
			});
		}
		return mapPage(response.value.status, response.value.json);
	}

	async move(req: MovePageRequest): Promise<Result<Page, MarkSyncError>> {
		const current = await this.get(req.pageId);
		if (!current.ok) return current;
		const response = await this.client.request(
			"PUT",
			this.client.v2(`/pages/${req.pageId}`),
			{
				json: {
					id: req.pageId,
					status: "current",
					title: current.value.title,
					parentId: req.parentId,
					version: { number: current.value.version + 1 },
				},
			},
		);
		if (!response.ok) return response;
		if (response.value.status === 409) {
			return parseConflict(req.pageId, response.value.json);
		}
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId: req.pageId,
				operation: "movePage",
			});
		}
		return mapPage(response.value.status, response.value.json);
	}
}

/**
 * Validate a v2 response with zod and map to the port `Page`. A non-2xx that
 * isn't a mapped error kind, or a schema-validation failure, surfaces as
 * `RemoteUnreachable` (PD-5) — never a silent misparse.
 */
function mapPage(status: number, body: unknown): Result<Page, MarkSyncError> {
	if (status < 200 || status >= 300) {
		return Result.err({
			kind: "RemoteUnreachable",
			status,
			cause: `unexpected page response status ${status}`,
		});
	}
	const parsed = PageV2Response.safeParse(body);
	if (!parsed.success) {
		return Result.err({
			kind: "RemoteUnreachable",
			cause: "schema validation failed: PageV2Response",
		});
	}
	const storage = parsed.data.body?.storage?.value;
	return Result.ok({
		id: parsed.data.id,
		title: parsed.data.title,
		version: parsed.data.version.number,
		...(storage !== undefined ? { body: storage } : {}),
	});
}

/**
 * Parse a 409-conflict envelope (ADR-0006 C-5/C-6 / spike H5). Validates the
 * envelope, asserts `errors[0].code === "CONFLICT"`, and extracts the version
 * numbers from the title. `Current Version: [N]` is the remote (server) version;
 * `Provided version: [M]` is what the caller sent. A schema/code mismatch or a
 * title that doesn't carry both numbers surfaces as `RemoteUnreachable` (PD-5).
 */
export function parseConflict(
	pageId: string,
	body: unknown,
): Result<Page, MarkSyncError> {
	const parsed = Conflict409Envelope.safeParse(body);
	if (!parsed.success) {
		return Result.err({
			kind: "RemoteUnreachable",
			cause: "schema validation failed: Conflict409Envelope",
		});
	}
	const first = parsed.data.errors[0];
	if (!first || first.code !== "CONFLICT") {
		return Result.err({
			kind: "RemoteUnreachable",
			cause: `unexpected 409 error code: ${first?.code ?? "(none)"}`,
		});
	}
	const versions = extractVersions(first.title);
	if (!versions) {
		return Result.err({
			kind: "RemoteUnreachable",
			cause: "409 CONFLICT title did not contain version numbers",
		});
	}
	return Result.err({
		kind: "Conflict",
		pageId,
		baseVersion: versions.providedVersion,
		remoteVersion: versions.remoteVersion,
	});
}

const VERSION_RE =
	/Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/;

function extractVersions(title: string): ParsedVersions | undefined {
	const match = VERSION_RE.exec(title);
	if (!match) return undefined;
	const remoteVersion = Number.parseInt(match[1] ?? "", 10);
	const providedVersion = Number.parseInt(match[2] ?? "", 10);
	if (!Number.isFinite(remoteVersion) || !Number.isFinite(providedVersion)) {
		return undefined;
	}
	return { remoteVersion, providedVersion };
}
