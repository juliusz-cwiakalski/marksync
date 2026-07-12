// SearchService — minimal v1 CQL page search (discovery / `doctor`). Kept
// minimal per NFR-MAINT-2.

import {
	type ConfluenceClient,
	unreachableCause,
} from "#infra/confluence/client";
import { SearchResponse } from "#infra/confluence/schemas/search";
import type { PageRef } from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export class SearchService {
	constructor(private readonly client: ConfluenceClient) {}

	async search(cql: string): Promise<Result<PageRef[], MarkSyncError>> {
		const response = await this.client.request(
			"GET",
			this.client.v1(`/search?cql=${encodeURIComponent(cql)}`),
		);
		if (!response.ok) return response;
		if (response.value.status < 200 || response.value.status >= 300) {
			return Result.err({
				kind: "RemoteUnreachable",
				status: response.value.status,
				cause: unreachableCause(response.value.status, "search"),
			});
		}
		const parsed = SearchResponse.safeParse(response.value.json);
		if (!parsed.success) {
			return Result.err({
				kind: "RemoteUnreachable",
				cause: "schema validation failed: SearchResponse",
			});
		}
		return Result.ok(
			parsed.data.results.map((r) => ({ id: r.id, title: r.title })),
		);
	}
}
