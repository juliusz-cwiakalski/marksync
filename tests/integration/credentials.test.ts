// tests/integration/credentials.test.ts
//
// Integration tests for validateCredentials against a REAL Bun.serve mock
// (GH-17 F-2/F-5 / TC-INT-AUTH-001..006). Uses the global `fetch` (no stub) so
// the injected-fetch seam is proven against genuine HTTP status codes and
// network failures — not a mock that asserts "fetch was called" (the over-
// mocking guardrail). TC-SEC-001..003 (INV-SEC-1) live in the sibling
// credentials-security.test.ts.

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { validateCredentials } from "#app/credentials";

const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const MASKED_EMAIL = "j***@cwiakalski.com";

/** Build credentials pointing at a mock origin (validateCredentials does not
 *  re-validate the URL scheme; the mock speaks http on localhost). */
function credsFor(baseUrl: string): ConfluenceCredentials {
	const authHeader = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
	return { baseUrl, authHeader, email: MASKED_EMAIL, mode: "api-token" };
}

interface MockServer {
	origin: string;
	stop: () => void;
	requests: { url: string; authorization: string | null }[];
}

/**
 * Start a Bun.serve mock whose handler decides the response per request count.
 * `respond(count)` returns the Response for the nth request (1-indexed).
 */
function serveMock(
	respond: (count: number, req: Request) => Response,
): MockServer {
	const requests: { url: string; authorization: string | null }[] = [];
	let count = 0;
	const server = Bun.serve({
		port: 0,
		fetch(req) {
			count += 1;
			requests.push({
				url: req.url,
				authorization: req.headers.get("Authorization"),
			});
			return respond(count, req);
		},
	});
	return {
		origin: `http://localhost:${server.port}`,
		stop: () => server.stop(true),
		requests,
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

describe("validateCredentials — TC-INT-AUTH-001 probe 200 → identity (AC-3)", () => {
	test("200 {accountId, displayName} → Result.ok(identity) with the Basic authHeader on the wire", async () => {
		const server = serveMock(() =>
			jsonResponse(200, { accountId: "abc-123", displayName: "Jane Operator" }),
		);
		try {
			const result = await validateCredentials(credsFor(server.origin));
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.accountId).toBe("abc-123");
			expect(result.value.displayName).toBe("Jane Operator");
			expect(server.requests[0]?.url).toBe(
				`${server.origin}/wiki/api/v2/user/by-me`,
			);
			expect(server.requests[0]?.authorization).toBe(
				credsFor(server.origin).authHeader,
			);
		} finally {
			server.stop();
		}
	});
});

describe("validateCredentials — TC-INT-AUTH-002/003 401/403 → InvalidCredentials, no retry (AC-3)", () => {
	for (const status of [401, 403] as const) {
		test(`probe ${status} → InvalidCredentials status ${status}, fetched exactly once`, async () => {
			const server = serveMock(() => new Response(null, { status }));
			try {
				const result = await validateCredentials(credsFor(server.origin));
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error.kind).toBe("Auth");
				expect(result.error.authKind).toBe("InvalidCredentials");
				expect(result.error.status).toBe(status);
				expect(server.requests).toHaveLength(1); // spike rule: no retry
			} finally {
				server.stop();
			}
		});
	}
});

describe("validateCredentials — TC-INT-AUTH-004 429 once then 200 → backoff + retry (AC-3 / RSK-4)", () => {
	test("429 (Retry-After: 0) once then 200 → Result.ok after ≥ 2 requests", async () => {
		const server = serveMock((count) =>
			count === 1
				? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
				: jsonResponse(200, { accountId: "x", displayName: "y" }),
		);
		try {
			const result = await validateCredentials(credsFor(server.origin));
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.accountId).toBe("x");
			expect(server.requests.length).toBeGreaterThanOrEqual(2);
		} finally {
			server.stop();
		}
	});
});

describe("validateCredentials — TC-INT-AUTH-005 429 forever → bounded AuthUnreachable (AC-3 / RSK-4)", () => {
	test("persistent 429 → AuthUnreachable within the bounded budget (no hang)", async () => {
		const server = serveMock(
			() =>
				new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
		);
		try {
			const result = await validateCredentials(credsFor(server.origin));
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.authKind).toBe("AuthUnreachable");
			// Bounded: 1 initial + MAX_429_RETRIES(2) = 3 attempts max.
			expect(server.requests.length).toBeLessThanOrEqual(3);
			expect(server.requests.length).toBeGreaterThanOrEqual(1);
		} finally {
			server.stop();
		}
	});
});

describe("validateCredentials — TC-INT-AUTH-006 network error → AuthUnreachable (AC-3)", () => {
	test("connection refused (stopped server) → AuthUnreachable", async () => {
		// Start a server only to claim an ephemeral port, then stop it so the
		// real global fetch hits a closed port → connection refused.
		const tmp = Bun.serve({ port: 0, fetch: () => new Response("x") });
		const origin = `http://localhost:${tmp.port}`;
		tmp.stop(true);

		const result = await validateCredentials(credsFor(origin));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Auth");
		expect(result.error.authKind).toBe("AuthUnreachable");
		// The surfaced message (via the mapper) never carries the token; the
		// dedicated INV-SEC-1 capture lives in credentials-security.test.ts.
		expect(result.error.cause).not.toContain(TOKEN);
	});
});
