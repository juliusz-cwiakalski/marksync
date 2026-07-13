// PropertyService — the v1 content-property surface (`marksync.metadata`
// string cross-check, ~8 KB per spike H2). A missing key is `ok(undefined)`,
// not an error.

import {
	type ConfluenceClient,
	unreachableCause,
} from "#infra/confluence/client";
import { PropertyV1Response } from "#infra/confluence/schemas/property";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export class PropertyService {
	constructor(private readonly client: ConfluenceClient) {}

	async get(
		pageId: string,
		key: string,
	): Promise<Result<string | undefined, MarkSyncError>> {
		const response = await this.client.request(
			"GET",
			this.client.v1(`/content/${pageId}/property/${encodeURIComponent(key)}`),
		);
		if (!response.ok) return response;
		if (response.value.status === 404) return Result.ok(undefined);
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "getProperty",
			});
		}
		if (response.value.status < 200 || response.value.status >= 300) {
			return Result.err({
				kind: "RemoteUnreachable",
				status: response.value.status,
				cause: unreachableCause(response.value.status, "property get"),
			});
		}
		const parsed = PropertyV1Response.safeParse(response.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: PropertyV1Response",
			});
		}
		if (typeof parsed.data.value !== "string") {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "property value was not a string",
			});
		}
		return Result.ok(parsed.data.value);
	}

	// POST creates; a 409 (key exists) falls back to GET version → PUT with the
	// incremented version number (v1 requires optimistic concurrency).
	async put(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>> {
		const create = await this.client.request(
			"POST",
			this.client.v1(`/content/${pageId}/property`),
			{ json: { key, value } },
		);
		if (!create.ok) return create;
		if (create.value.status >= 200 && create.value.status < 300) {
			return Result.ok(undefined);
		}
		if (create.value.status === 409) {
			const version = await this.fetchCurrentVersion(pageId, key);
			if (!version.ok) return version;
			return this.updateByKey(pageId, key, value, version.value);
		}
		if (create.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "putProperty",
			});
		}
		if (create.value.status === 413 || isTooLargeBody(create.value.text)) {
			return Result.err({
				kind: "TooLarge",
				pageId,
				what: `property '${key}' exceeds the value-size limit`,
			});
		}
		return Result.err({
			kind: "RemoteUnreachable",
			status: create.value.status,
			cause: unreachableCause(create.value.status, "property create"),
		});
	}

	/** Fetch the current property version number after a POST-create 409. */
	private async fetchCurrentVersion(
		pageId: string,
		key: string,
	): Promise<Result<number, MarkSyncError>> {
		const fetched = await this.client.request(
			"GET",
			this.client.v1(`/content/${pageId}/property/${encodeURIComponent(key)}`),
		);
		if (!fetched.ok) return fetched;
		// 404 here means the key vanished between the POST-409 and this GET.
		if (fetched.value.status === 404) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "property vanished between create-conflict and version fetch",
			});
		}
		if (fetched.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "putProperty",
			});
		}
		if (fetched.value.status < 200 || fetched.value.status >= 300) {
			return Result.err({
				kind: "RemoteUnreachable",
				status: fetched.value.status,
				cause: unreachableCause(fetched.value.status, "property get"),
			});
		}
		const parsed = PropertyV1Response.safeParse(fetched.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: PropertyV1Response",
			});
		}
		return Result.ok(parsed.data.version.number);
	}

	private async updateByKey(
		pageId: string,
		key: string,
		value: string,
		currentVersion: number,
	): Promise<Result<void, MarkSyncError>> {
		const update = await this.client.request(
			"PUT",
			this.client.v1(`/content/${pageId}/property/${encodeURIComponent(key)}`),
			{ json: { key, value, version: { number: currentVersion + 1 } } },
		);
		if (!update.ok) return update;
		if (update.value.status >= 200 && update.value.status < 300) {
			return Result.ok(undefined);
		}
		if (update.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "putProperty",
			});
		}
		// A 409 here is a rare concurrent-write race in the GET→PUT window. It maps
		// to RemoteUnreachable (catch-all), NOT Conflict: the Conflict error kind is
		// page-shaped and putProperty blocks on any error. Recovery is re-running
		// sync, which re-GETs the current version (GH-66 DEC-6).
		return Result.err({
			kind: "RemoteUnreachable",
			status: update.value.status,
			cause: unreachableCause(update.value.status, "property update"),
		});
	}
}

function isTooLargeBody(text: string | undefined): boolean {
	return !!text && /too large|exceeds.*(size|limit)|maximum.*size/i.test(text);
}
