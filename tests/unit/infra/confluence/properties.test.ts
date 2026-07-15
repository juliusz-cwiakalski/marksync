// Unit tests for PropertyService (GH-66): the v1 content-property surface —
// string round-trip (byte-equal incl. ~8 KB), missing key → ok(undefined),
// POST 409 → GET version → PUT with incremented version, and error semantics.

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";
import { PropertyService } from "#infra/confluence/properties";

const BASE_URL = "https://example.atlassian.net";
const AUTH = "Basic dGVzdDp0b2tlbg==";
const PAGE = "777";
const KEY = "marksync.metadata";
const GET_PATH = `/content/${PAGE}/property/${KEY}`;
const POST_PATH = `/content/${PAGE}/property`;

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

/** v1 content-property response body: {id, key, value, version:{number, when}}. */
function prop(value: string, number = 1): unknown {
	return {
		id: "123",
		key: KEY,
		value,
		version: { number, when: "2026-07-13T00:00:00.000Z" },
	};
}

/**
 * Scripted responses keyed by method+path; records every request body. Strips
 * both the v2 (`/wiki/api/v2`) and v1 (`/wiki/rest/api`) URL prefixes so path
 * assertions read as `/content/{pageId}/property[/{key}]`.
 */
function script(
	handler: (method: string, path: string, body: unknown) => Response,
): {
	service: PropertyService;
	bodies: { method: string; path: string; body: unknown }[];
} {
	const bodies: { method: string; path: string; body: unknown }[] = [];
	const fn = (url: string, init: RequestInit) => {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/^\/wiki\/(api\/v2|rest\/api)/, "");
		let body: unknown;
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

describe("TC-PROP-V1-GET-001 / PATH-001 — get returns stored value over v1 path (AC-F1-1)", () => {
	test("get small string → value + v1 GET path", async () => {
		const value = "hello-world";
		const { service, bodies } = script((method) => {
			if (method === "GET") return jsonRes(200, prop(value));
			return jsonRes(500, {});
		});
		const result = await service.get(PAGE, KEY);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe(value);
		expect(bodies[0]?.method).toBe("GET");
		expect(bodies[0]?.path).toBe(GET_PATH);
	});
});

describe("TC-PROP-V1-GET-002 / BYTE-001 / PATH-002 — put→get ~8 KB byte-equal over v1 paths (AC-F4-1 / NFR-1)", () => {
	test("put ~8 KB then get byte-equal; POST + GET use v1 paths", async () => {
		const value = "x".repeat(8 * 1024);
		const { service, bodies } = script((method) => {
			if (method === "POST") return jsonRes(200, prop(value));
			if (method === "GET") return jsonRes(200, prop(value));
			return jsonRes(500, {});
		});
		const put = await service.put(PAGE, KEY, value);
		expect(put.ok).toBe(true);
		const get = await service.get(PAGE, KEY);
		expect(get.ok).toBe(true);
		if (!get.ok) return;
		expect(get.value).toBe(value);
		expect(get.value.length).toBe(8 * 1024);
		const paths = bodies.map((b) => `${b.method} ${b.path}`);
		expect(paths).toContain(`POST ${POST_PATH}`);
		expect(paths).toContain(`GET ${GET_PATH}`);
	});
});

describe("TC-PROP-V1-GET-003 — missing key → ok(undefined) (AC-F1-2)", () => {
	test("get 404 → ok(undefined)", async () => {
		const { service } = script(() => new Response(null, { status: 404 }));
		const result = await service.get(PAGE, KEY);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBeUndefined();
	});
});

describe("TC-PROP-V1-POST-001 — put POST create for a new key → 2xx (AC-F2-1)", () => {
	test("POST {key, value} → 2xx → ok; body has no version", async () => {
		const { service, bodies } = script((method) => {
			if (method === "POST") return jsonRes(200, prop("new-value"));
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "new-value");
		expect(result.ok).toBe(true);
		expect(bodies).toHaveLength(1);
		expect(bodies[0]?.method).toBe("POST");
		expect(bodies[0]?.path).toBe(POST_PATH);
		expect(bodies[0]?.body).toEqual({ key: KEY, value: "new-value" });
	});
});

describe("TC-PROP-V1-VERSION-001 / PATH-003 — POST 409 → GET version → PUT incremented (AC-F2-2 / DEC-3 / NFR-3)", () => {
	test("POST 409, GET version.number 5, PUT version.number 6 → ok", async () => {
		const value = "updated-value";
		const { service, bodies } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return jsonRes(200, prop("old-value", 5));
			if (method === "PUT") return jsonRes(200, prop(value, 6));
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, value);
		expect(result.ok).toBe(true);

		expect(bodies).toHaveLength(3);
		expect(bodies[0]?.method).toBe("POST");
		expect(bodies[0]?.path).toBe(POST_PATH);
		expect(bodies[0]?.body).toEqual({ key: KEY, value });
		expect(bodies[1]?.method).toBe("GET");
		expect(bodies[1]?.path).toBe(GET_PATH);
		expect(bodies[2]?.method).toBe("PUT");
		expect(bodies[2]?.path).toBe(GET_PATH);
		expect(bodies[2]?.body).toEqual({
			key: KEY,
			value,
			version: { number: 6 },
		});
	});
});

describe("TC-PROP-V1-VERSION-002 — version flow carries an ~8 KB value byte-equal (AC-F2-2 / AC-F4-1)", () => {
	test("POST 409 → GET → PUT with 8 KB value; version incremented", async () => {
		const value = "x".repeat(8 * 1024);
		const { service, bodies } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return jsonRes(200, prop("old", 5));
			if (method === "PUT") return jsonRes(200, prop(value, 6));
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, value);
		expect(result.ok).toBe(true);
		expect(bodies[2]?.method).toBe("PUT");
		expect(bodies[2]?.body).toEqual({
			key: KEY,
			value,
			version: { number: 6 },
		});
	});
});

describe("TC-PROP-V1-ERR-001 — get 403 → Forbidden (G-3)", () => {
	test("get 403 → err(Forbidden)", async () => {
		const { service } = script(() => new Response(null, { status: 403 }));
		const result = await service.get(PAGE, KEY);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
	});
});

describe("TC-PROP-V1-ERR-002 — put POST 413 → TooLarge (G-3)", () => {
	test("POST 413 → err(TooLarge) with property-size what", async () => {
		const { service } = script((method) => {
			if (method === "POST")
				return jsonRes(413, {
					message: "Request body too large, exceeds maximum size",
				});
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "x".repeat(8 * 1024));
		expect(result.ok).toBe(false);
		if (result.ok || result.error.kind !== "TooLarge") return;
		expect(result.error.what).toMatch(/property .* exceeds/);
	});
});

describe("TC-PROP-V1-SCHEMA-001 — malformed v1 response → RemoteUnreachable (F-4 / DM-1)", () => {
	test("get 200 missing version → err(RemoteUnreachable)", async () => {
		const { service } = script(() =>
			jsonRes(200, { id: "123", key: KEY, value: "test" }),
		);
		const result = await service.get(PAGE, KEY);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
	});
});

// fetchCurrentVersion fallback-GET error paths (F-2). The happy POST 409 → GET
// 200 → PUT flow is covered by TC-PROP-V1-VERSION-001/002 above; these exercise
// the rare edges where the key vanishes or permission is revoked between the
// POST-409 and the version-fetch GET.

describe("TC-PROP-V1-ERR-003 — POST 409 → fallback GET 404 (key vanished) → RemoteUnreachable (F-2 / DEC-6)", () => {
	test("key vanishes between POST-409 and GET → err(RemoteUnreachable); cause mentions vanished", async () => {
		const { service } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return new Response(null, { status: 404 });
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "value");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
		expect(result.error.kind).not.toBe("Conflict");
		if (result.error.kind !== "RemoteUnreachable") return;
		expect(result.error.cause).toMatch(/vanished/);
	});
});

describe("TC-PROP-V1-ERR-004 — POST 409 → fallback GET 403 → Forbidden (F-2)", () => {
	test("permission revoked between POST and GET → err(Forbidden)", async () => {
		const { service } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return new Response(null, { status: 403 });
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "value");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
	});
});

// updateByKey PUT error paths (F-3). The deferred concurrent-race PUT-409 maps
// to RemoteUnreachable (catch-all), NOT Conflict — this is the central DEC-6 /
// PM-DEC-1 decision flagged at DoR.

describe("TC-PROP-V1-ERR-005 — POST 409 → GET version → PUT 403 → Forbidden (F-3)", () => {
	test("permission revoked before PUT → err(Forbidden)", async () => {
		const { service } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return jsonRes(200, prop("old", 5));
			if (method === "PUT") return new Response(null, { status: 403 });
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "value");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
	});
});

describe("TC-PROP-V1-ERR-006 — POST 409 → GET → PUT 409 → RemoteUnreachable, NOT Conflict (DEC-6 catch-all) (F-3)", () => {
	test("concurrent race in the GET→PUT window: PUT 409 → err(RemoteUnreachable)", async () => {
		const { service } = script((method) => {
			if (method === "POST")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			if (method === "GET") return jsonRes(200, prop("old", 5));
			if (method === "PUT")
				return jsonRes(409, { errors: [{ code: "CONFLICT" }] });
			return jsonRes(500, {});
		});
		const result = await service.put(PAGE, KEY, "value");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
		expect(result.error.kind).not.toBe("Conflict");
		if (result.error.kind !== "RemoteUnreachable") return;
		expect(result.error.status).toBe(409);
	});
});
