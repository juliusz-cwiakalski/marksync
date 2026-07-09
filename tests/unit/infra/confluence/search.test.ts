// Unit tests for SearchService (F-6) + RestrictionsService (F-6): minimal v1
// CQL search + restrictions read.

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";
import { SearchService } from "#infra/confluence/search";
import { RestrictionsService } from "#infra/confluence/restrictions";

const BASE_URL = "https://example.atlassian.net";
const AUTH = "Basic dGVzdDp0b2tlbg==";

function creds(): ConfluenceCredentials {
	return {
		baseUrl: BASE_URL,
		authHeader: AUTH,
		email: "j***@x.com",
		mode: "api-token",
	};
}

function jsonRes(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function withClient(fn: typeof fetch) {
	const client = new ConfluenceClient(creds(), {
		fetch: fn as unknown as typeof fetch,
	});
	return client;
}

describe("TC-SEARCH-001 — CQL result validated + mapped", () => {
	test("200 → ok(PageRef[])", async () => {
		const client = withClient(() =>
			jsonRes(200, {
				results: [
					{ id: "1", title: "A" },
					{ id: "2", title: "B" },
				],
			}),
		);
		const result = await new SearchService(client).search("space = 'x'");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual([
			{ id: "1", title: "A" },
			{ id: "2", title: "B" },
		]);
	});

	test("malformed body → RemoteUnreachable", async () => {
		const client = withClient(() => jsonRes(200, { wrong: true }));
		const result = await new SearchService(client).search("x");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
	});
});

describe("TC-RESTR-001 — restrictions read mapped; 403 → Forbidden", () => {
	test("restricted page (has entries) → restricted true", async () => {
		const client = withClient(() =>
			jsonRes(200, {
				results: [{ operation: "read", restrictions: { user: [{}] } }],
			}),
		);
		const result = await new RestrictionsService(client).get("9");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ pageId: "9", restricted: true });
	});

	test("open page (no entries) → restricted false", async () => {
		const client = withClient(() => jsonRes(200, { results: [] }));
		const result = await new RestrictionsService(client).get("9");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.restricted).toBe(false);
	});

	test("403 → Forbidden", async () => {
		const client = withClient(() => new Response(null, { status: 403 }));
		const result = await new RestrictionsService(client).get("9");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
	});
});
