// RestrictionsService — minimal v1 restrictions read (supports the 403 /
// permission-awareness story). A page with any restriction entry is "restricted".

import type { ConfluenceClient } from "#infra/confluence/client";
import { RestrictionsResponse } from "#infra/confluence/schemas/restrictions";
import type { PageRestrictions } from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export class RestrictionsService {
	constructor(private readonly client: ConfluenceClient) {}

	async get(pageId: string): Promise<Result<PageRestrictions, MarkSyncError>> {
		const response = await this.client.request(
			"GET",
			this.client.v1(`/content/${pageId}/restriction`),
		);
		if (!response.ok) return response;
		if (response.value.status === 403) {
			return Result.err({
				kind: "Forbidden",
				pageId,
				operation: "getRestrictions",
			});
		}
		if (response.value.status < 200 || response.value.status >= 300) {
			return Result.err({
				kind: "RemoteUnreachable",
				status: response.value.status,
				cause: `unexpected restrictions status ${response.value.status}`,
			});
		}
		const parsed = RestrictionsResponse.safeParse(response.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: RestrictionsResponse",
			});
		}
		return Result.ok({
			pageId,
			restricted: parsed.data.results.length > 0,
		});
	}
}
