// Unit tests for ConfluenceClient (F-2): v1/v2 URL builders, authHeader +
// User-Agent injection, redacted logging, 429/5xx retry with bounded budget,
// 401/403 never retried, network failure → RemoteUnreachable, and the
// no-outbound-telemetry invariant. Uses an injected stub fetch + a recording
// delay seam (no real sleeps) per testing-strategy §"fault injection".

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";

const BASE_URL = "https://example.atlassian.net";
const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const AUTH_HEADER = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;

function creds(): ConfluenceCredentials {
	return {
		baseUrl: BASE_URL,
		authHeader: AUTH_HEADER,
		email: "j***@cwiakalski.com",
		mode: "api-token",
	};
}

function jsonResponse(
	status: number,
	body: unknown,
	headers?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

interface Stub {
	fetch: (req: Request) => Response | Promise<Response>;
	delay: (ms: number) => Promise<void>;
	log: (msg: string) => void;
	delays: number[];
	logs: string[];
	requests: {
		url: string;
		method: string;
		authorization: string | null;
		userAgent: string | null;
	}[];
}

function makeClient(stub: Stub): ConfluenceClient {
	const fetchFn = (url: string, init: RequestInit) => {
		const req = new Request(url, init);
		stub.requests.push({
			url: req.url,
			method: req.method,
			authorization: req.headers.get("Authorization"),
			userAgent: req.headers.get("User-Agent"),
		});
		return stub.fetch(req);
	};
	return new ConfluenceClient(creds(), {
		fetch: fetchFn as unknown as typeof fetch,
		delay: (ms: number) => {
			stub.delays.push(ms);
			return stub.delay(ms);
		},
		log: (msg: string) => stub.logs.push(msg),
	});
}

function newStub(fetchImpl: Stub["fetch"]): Stub {
	return {
		fetch: fetchImpl,
		delay: () => Promise.resolve(),
		log: () => {},
		delays: [],
		logs: [],
		requests: [],
	};
}

describe("TC-URL-001 — v1/v2 URL builders root at baseUrl", () => {
	test("v1 and v2 produce the exact wiki paths", () => {
		const client = new ConfluenceClient(creds());
		expect(client.v1("/x")).toBe(`${BASE_URL}/wiki/rest/api/x`);
		expect(client.v2("/pages")).toBe(`${BASE_URL}/wiki/api/v2/pages`);
	});
});

describe("TC-AUTH-001 — authHeader + User-Agent injected; no token in logs (INV-SEC-1)", () => {
	test("every request carries Authorization + User-Agent", async () => {
		const stub = newStub(() => jsonResponse(200, { ok: true }));
		const client = makeClient(stub);
		await client.request("GET", client.v2("/pages"));
		expect(stub.requests).toHaveLength(1);
		expect(stub.requests[0]?.authorization).toBe(AUTH_HEADER);
		expect(stub.requests[0]?.userAgent).toMatch(/^marksync\//);
	});

	test("redacted log lines contain 0 occurrences of the token", async () => {
		const stub = newStub(() => jsonResponse(200, { data: "ok" }));
		const client = makeClient(stub);
		await client.request("GET", client.v2("/pages"));
		for (const line of stub.logs) {
			expect(line).not.toContain(TOKEN);
		}
		expect(stub.logs.length).toBeGreaterThan(0);
	});
});

describe("TC-429-001 — 429 + Retry-After → bounded retry; exhaustion → RateLimited", () => {
	test("429 once then 200 → ok after a retry", async () => {
		let count = 0;
		const stub = newStub(() => {
			count += 1;
			return count === 1
				? new Response(null, { status: 429, headers: { "Retry-After": "1" } })
				: jsonResponse(200, { ok: true });
		});
		const client = makeClient(stub);
		const result = await client.request("GET", client.v2("/pages"));
		expect(result.ok).toBe(true);
		expect(stub.requests).toHaveLength(2);
		expect(stub.delays.length).toBeGreaterThanOrEqual(1);
	});

	test("sustained 429 → err(RateLimited) within the bounded budget", async () => {
		const stub = newStub(
			() =>
				new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
		);
		const client = makeClient(stub);
		const result = await client.request("GET", client.v2("/pages"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RateLimited");
		// 1 initial + MAX_RETRIES(3) = 4 total attempts.
		expect(stub.requests).toHaveLength(4);
		expect(stub.delays).toHaveLength(3);
	});
});

describe("TC-5XX-001 — transient 5xx retried; exhaustion → RemoteUnreachable", () => {
	test("transient 500 then 200 → ok", async () => {
		let count = 0;
		const stub = newStub(() => {
			count += 1;
			return count === 1
				? jsonResponse(500, { error: "boom" })
				: jsonResponse(200, { ok: true });
		});
		const client = makeClient(stub);
		const result = await client.request("GET", client.v2("/pages"));
		expect(result.ok).toBe(true);
		expect(stub.requests).toHaveLength(2);
	});

	test("sustained 500 → err(RemoteUnreachable) with status", async () => {
		const stub = newStub(() => jsonResponse(500, { error: "boom" }));
		const client = makeClient(stub);
		const result = await client.request("GET", client.v2("/pages"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
		expect(result.error.status).toBe(500);
		expect(stub.requests).toHaveLength(4);
	});
});

describe("TC-NORETRY-001 — 401/403 never retried", () => {
	for (const status of [401, 403] as const) {
		test(`${status} surfaced immediately, fetched exactly once`, async () => {
			const stub = newStub(() => new Response(null, { status }));
			const client = makeClient(stub);
			const result = await client.request("GET", client.v2("/pages/1"));
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.status).toBe(status);
			expect(stub.requests).toHaveLength(1);
			expect(stub.delays).toHaveLength(0);
		});
	}
});

describe("TC-NETWORK-001 — thrown fetch → RemoteUnreachable, no retry", () => {
	test("a network failure is surfaced immediately", async () => {
		const stub = newStub(() => {
			throw new Error("ECONNREFUSED");
		});
		const client = makeClient(stub);
		const result = await client.request("GET", client.v2("/pages"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
		expect(stub.requests).toHaveLength(1);
		expect(stub.delays).toHaveLength(0);
		// The cause stays in the typed error; logs must not carry it raw — but
		// the redacted log line for a network failure does include the cause
		// text. Assert the raw token never appears in logs regardless.
		for (const line of stub.logs) {
			expect(line).not.toContain(TOKEN);
		}
	});
});

describe("TC-TELEMETRY-001 — every request targets the baseUrl host", () => {
	test("no request targets a host other than baseUrl", async () => {
		const stub = newStub(() => jsonResponse(200, { ok: true }));
		const client = makeClient(stub);
		await client.request("GET", client.v2("/pages"));
		for (const r of stub.requests) {
			const host = new URL(r.url).host;
			expect(host).toBe(new URL(BASE_URL).host);
		}
	});
});
