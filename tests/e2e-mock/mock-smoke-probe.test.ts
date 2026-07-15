// Phase-1 mock smoke probe: direct-request shape check for off-critical-path endpoints.
// These endpoints are implemented for AC-F1-1 completeness but are NOT driven by
// any pipeline scenario per DEC-1 (validateCredentials is never called by computePlan/applyPlan).
// Satisfies API-F1-9/10/11 coverage via direct requests.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMockServer } from "./mock-confluence-server";

describe("TC-E2EMOCK-SMOKE-001 — Phase-1 mock smoke probe", () => {
	let server: ReturnType<typeof createMockServer>;

	beforeAll(() => {
		server = createMockServer();
	});

	afterAll(() => {
		server.stop();
	});

	test("GET /wiki/api/v2/user/by-me → 200 { accountId, displayName }", async () => {
		const response = await fetch(`${server.origin}/wiki/api/v2/user/by-me`, {
			headers: { Authorization: "Bearer fake-token" },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			accountId: expect.any(String),
			displayName: expect.any(String),
		});
	});

	test("GET /wiki/rest/api/search?cql=... → 200 { results:[] }", async () => {
		const response = await fetch(
			`${server.origin}/wiki/rest/api/search?cql=type=page`,
			{
				headers: { Authorization: "Bearer fake-token" },
			},
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ results: [] });
	});

	test("GET /wiki/rest/api/content/{pageId}/restriction → 200 default (empty results → not restricted)", async () => {
		const response = await fetch(
			`${server.origin}/wiki/rest/api/content/123/restriction`,
			{
				headers: { Authorization: "Bearer fake-token" },
			},
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ results: [] });
	});

	test("Obsolete /api/jsongraphs/property-service/property endpoint → 404 (NOT implemented per DEC-3)", async () => {
		const response = await fetch(
			`${server.origin}/api/jsongraphs/property-service/property`,
			{
				headers: { Authorization: "Bearer fake-token" },
			},
		);

		expect(response.status).toBe(404);
	});
});
