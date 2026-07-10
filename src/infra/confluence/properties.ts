// PropertyService — the v2 content-property surface (`marksync.metadata`
// string cross-check). v2 accepts string values (~8 KB, spike H2); v1 is
// deprecated. A missing key is `ok(undefined)`, not an error.

import {
	type ConfluenceClient,
	unreachableCause,
} from "#infra/confluence/client";
import { PropertyV2Response } from "#infra/confluence/schemas/property";
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
			this.client.v2(`/pages/${pageId}/properties/${encodeURIComponent(key)}`),
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
		const parsed = PropertyV2Response.safeParse(response.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: PropertyV2Response",
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

	async put(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>> {
		// POST creates; a 409 (key exists, v1+v2 share one namespace) falls back
		// to PUT-by-key so the write is idempotent.
		const create = await this.client.request(
			"POST",
			this.client.v2(`/pages/${pageId}/properties`),
			{ json: { key, value } },
		);
		if (!create.ok) return create;
		if (create.value.status >= 200 && create.value.status < 300) {
			return Result.ok(undefined);
		}
		if (create.value.status === 409) {
			return this.updateByKey(pageId, key, value);
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

	private async updateByKey(
		pageId: string,
		key: string,
		value: string,
	): Promise<Result<void, MarkSyncError>> {
		const update = await this.client.request(
			"PUT",
			this.client.v2(`/pages/${pageId}/properties/${encodeURIComponent(key)}`),
			{ json: { key, value } },
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
