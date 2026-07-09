// Unit tests for PropertyService (F-4 / AC-F4-1): the v2 content-property
// surface — string round-trip (byte-equal incl. ~8 KB), missing key →
// ok(undefined), and 409 key-conflict handled via update-by-key.

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";
import { PropertyService } from "#infra/confluence/properties";

const BASE_URL = "https://example.atlassian.net";
const AUTH = "Basic dGVzdDp0b2tlbg==";
const PAGE = "777";
const KEY = "marksync.metadata";

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

/** Scripted responses keyed by method+path; records every request body. */
function script(
	handler: (method: string, path: string, body: unknown) => Response,
): {
	service: PropertyService;
	bodies: { method: string; path: string; body: unknown }[];
} {
	const bodies: { method: string; path: string; body: unknown }[] = [];
	const fn = (url: string, init: RequestInit) => {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/^\/wiki\/api\/v2/, "");
		let body: unknown = undefined;
		if (init.body && typeof init.body === "string") {
			try {
				body = JSON.parse(init.body);
			} catch {
				body = init.body;
			}
		}
		bodies.push({ method: init.method ?? "GET", path, body });
		return handler(init.method ?? "GET", path, body);
	};
	const client = new ConfluenceClient(creds(), {
		fetch: fn as unknown as typeof fetch,
	});
	return { service: new PropertyService(client), bodies };
}

describe("TC-PROP-RT-001 — put string → get byte-equal, incl. ~8 KB (AC-F4-1 / NFR-5)", () => {
	test("round-trips a small string", async () => {
		const value = "hello-world";
		const { service } = script((method, p) => {
			if (method === "POST") return jsonRes(200, { key: KEY, value });
			if (method === "GET") return jsonRes(200, { key: KEY, value });
			return jsonRes(500, {});
		});
		const put = await service.put(PAGE, KEY, value);
		expect(put.ok).toBe(true);
		const get = await service.get(PAGE, KEY);
		expect(get.ok).toBe(true);
		if (!get.ok) return;
		expect(get.value).toBe(value);
	});

	test("round-trips an ~8 KB string (spike H2 ~8.4 KB)", async () => {
		const value = "x".repeat(8 * 1024);
		const { service } = script((method) => {
			if (method === "POST") return jsonRes(200, { key: KEY, value });
			if (method === "GET") return jsonRes(200, { key: KEY, value });
			return jsonRes(500, {});
		});
		await service.put(PAGE, KEY, value);
		const get = await service.get(PAGE, KEY);
		expect(get.ok).toBe(true);
		if (!get.ok) return;
		expect(get.value).toBe(value);
		expect(get.value.length).toBe(8 * 1024);
	});
});

describe("TC-PROP-MISS-001 — missing key → ok(undefined)", () => {
	test("404 on get → ok(undefined)", async () => {
		const { service } = script(() => new Response(null, { status: 404 }));
		const result = await service.get(PAGE, KEY);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBeUndefined();
	});
});

describe("TC-PROP-CONFLICT-001 — 409 key-conflict → update-by-key", () => {
	test("POST 409 then PUT 200 → ok", async () => {
		const { service, bodies } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "PUT") return jsonRes(200, { key: KEY, value: "v" });
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "v");
		expect(result.ok).toBe(true);
		const methods = bodies.map((b) => b.method);
		expect(methods).toContain("POST");
		expect(methods).toContain("PUT");
	});
});
