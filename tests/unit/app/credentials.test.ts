// tests/unit/app/credentials.test.ts
//
// Unit tests for the Confluence credential provider (GH-17 F-1/F-2/F-5).
// Covers resolveCredentials (env -> credentials), maskEmail, header
// construction, and validateCredentials via an injected stub fetch (no network,
// no Bun.serve — DEC-1 app-tier purity). TC-AUTH-001..012 (AC-1..AC-5).
//
// process.env is saved/restored around every test so fixtures never bleed.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	maskEmail,
	resolveCredentials,
	validateCredentials,
} from "#app/credentials";
import type { ConfluenceCredentials } from "#domain/credentials";
import type { AuthError } from "#domain/errors";

const BASE_URL = "https://example.atlassian.net";
const EMAIL = "juliusz@cwiakalski.com";
const MASKED_EMAIL = "j***@cwiakalski.com";
// Authoritative fake token (matches the atlassian-token redactor pattern so the
// Phase-5 defense-in-depth assertion is meaningful). Never a real token.
const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";

const ENV_BASE_URL = "MARKSYNC_CONFLUENCE_BASE_URL";
const ENV_EMAIL = "MARKSYNC_USER_EMAIL";
const ENV_API_TOKEN = "MARKSYNC_API_TOKEN";
const ENV_KEYS = [ENV_BASE_URL, ENV_EMAIL, ENV_API_TOKEN] as const;

let snapshot: Record<string, string | undefined>;
beforeEach(() => {
	snapshot = {};
	for (const k of ENV_KEYS) snapshot[k] = process.env[k];
	for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
	for (const k of ENV_KEYS) {
		if (snapshot[k] === undefined) delete process.env[k];
		else process.env[k] = snapshot[k];
	}
});

function setValidEnv(): void {
	process.env[ENV_BASE_URL] = BASE_URL;
	process.env[ENV_EMAIL] = EMAIL;
	process.env[ENV_API_TOKEN] = TOKEN;
}

/** A ConfluenceCredentials built directly (bypassing env) for validate tests. */
function credsFor(baseUrl = BASE_URL): ConfluenceCredentials {
	const authHeader = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
	return { baseUrl, authHeader, email: MASKED_EMAIL, mode: "api-token" };
}

/** Build a stub fetch with per-call status sequencing. */
function stubFetch(
	responses: ReadonlyArray<{
		status: number;
		body?: unknown;
		headers?: Record<string, string>;
	}>,
): { fetch: typeof fetch; calls: { url: string; auth: string | null }[] } {
	const calls: { url: string; auth: string | null }[] = [];
	let i = 0;
	const stub = mock(
		(input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const url = typeof input === "string" ? input : input.toString();
			calls.push({
				url,
				auth: init?.headers
					? ((init.headers as Record<string, string>).Authorization ?? null)
					: null,
			});
			const next = responses[i] ?? responses[responses.length - 1];
			i += 1;
			const body = next.body === undefined ? null : JSON.stringify(next.body);
			return Promise.resolve(
				new Response(body, {
					status: next.status,
					headers: next.headers,
				}),
			);
		},
	) as unknown as typeof fetch;
	return { fetch: stub, calls };
}

describe("resolveCredentials — TC-AUTH-001 happy path (AC-1)", () => {
	test("all three env vars present + valid https → ok with a Basic header that decodes to email:token", () => {
		setValidEnv();
		const result = resolveCredentials();
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.baseUrl).toBe(BASE_URL);
		expect(result.value.mode).toBe("api-token");
		expect(result.value.email).toBe(MASKED_EMAIL);
		expect(result.value.authHeader.startsWith("Basic ")).toBe(true);

		const decoded = Buffer.from(
			result.value.authHeader.slice("Basic ".length),
			"base64",
		).toString();
		expect(decoded).toBe(`${EMAIL}:${TOKEN}`);
	});
});

describe("resolveCredentials — TC-AUTH-002..005 missing vars (AC-2)", () => {
	test("each single var missing → MissingCredentials naming exactly that var", () => {
		for (const missing of ENV_KEYS) {
			for (const k of ENV_KEYS) delete process.env[k];
			for (const k of ENV_KEYS) {
				if (k !== missing) {
					process.env[k] =
						k === ENV_BASE_URL ? BASE_URL : k === ENV_EMAIL ? EMAIL : TOKEN;
				}
			}
			const result = resolveCredentials();
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("Auth");
			expect(result.error.authKind).toBe("MissingCredentials");
			expect(result.error.missing).toEqual([missing]);
		}
	});

	test("all three missing → missing[] lists all three (order-tolerant)", () => {
		for (const k of ENV_KEYS) delete process.env[k];
		const result = resolveCredentials();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("MissingCredentials");
		expect(result.error.missing.sort()).toEqual([...ENV_KEYS].sort());
	});

	test("empty-string var is treated as missing", () => {
		process.env[ENV_BASE_URL] = BASE_URL;
		process.env[ENV_EMAIL] = "";
		process.env[ENV_API_TOKEN] = TOKEN;
		const result = resolveCredentials();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("MissingCredentials");
		expect(result.error.missing).toEqual([ENV_EMAIL]);
	});
});

describe("resolveCredentials — TC-AUTH-006 malformed baseUrl (AC-2 boundary / RSK-5)", () => {
	// RSK-5 contract: must be `https:` with a non-empty host; no domain
	// allowlist. Each entry below is genuinely rejected by that check (the
	// WHATWG parser throws on most malformed inputs rather than yielding an
	// empty host — the host-length guard is defense-in-depth on top).
	const malformed = [
		"http://example.atlassian.net", // wrong scheme
		"ftp://example.atlassian.net", // non-https scheme
		"javascript:alert(1)", // non-https scheme + empty host
		"not-a-url", // not a URL
		"https://", // throws (no host)
		"atlassian.net", // bare host, no scheme
	];
	for (const baseUrl of malformed) {
		test(`rejects ${JSON.stringify(baseUrl)} as InvalidBaseUrl`, () => {
			process.env[ENV_BASE_URL] = baseUrl;
			process.env[ENV_EMAIL] = EMAIL;
			process.env[ENV_API_TOKEN] = TOKEN;
			const result = resolveCredentials();
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("Auth");
			expect(result.error.authKind).toBe("InvalidBaseUrl");
		});
	}

	test("a valid https atlassian URL is accepted", () => {
		process.env[ENV_BASE_URL] = "https://acme.atlassian.net";
		process.env[ENV_EMAIL] = EMAIL;
		process.env[ENV_API_TOKEN] = TOKEN;
		expect(resolveCredentials().ok).toBe(true);
	});
});

describe("maskEmail — TC-AUTH-007 (AC-5)", () => {
	test("normal address → first char + *** + @domain", () => {
		expect(maskEmail("juliusz@cwiakalski.com")).toBe("j***@cwiakalski.com");
	});

	test("single-char local part → keeps that char", () => {
		expect(maskEmail("a@x.io")).toBe("a***@x.io");
	});

	test("missing @ → masks the whole address", () => {
		expect(maskEmail("no-at-sign")).toBe("***");
	});

	test("empty local part (@ at index 0) → masks local part", () => {
		expect(maskEmail("@x.io")).toBe("***@x.io");
	});
});

describe("validateCredentials — TC-AUTH-008 200 → identity (AC-3)", () => {
	test("stub 200 {accountId, displayName} → Result.ok(identity)", async () => {
		const { fetch } = stubFetch([
			{
				status: 200,
				body: { accountId: "abc-123", displayName: "Jane Operator" },
			},
		]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.accountId).toBe("abc-123");
		expect(result.value.displayName).toBe("Jane Operator");
	});

	test("the probe targets /wiki/api/v2/user/by-me with the opaque authHeader", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 200, body: { accountId: "1", displayName: "n" } },
		]);
		await validateCredentials(credsFor(), { fetch });
		expect(calls[0]?.url).toBe(`${BASE_URL}/wiki/api/v2/user/by-me`);
		expect(calls[0]?.auth).toBe(credsFor().authHeader);
	});
});

describe("validateCredentials — TC-AUTH-009 401/403 → InvalidCredentials, no retry (AC-3)", () => {
	test("stub 401 → InvalidCredentials status 401, fetched exactly once", async () => {
		const { fetch, calls } = stubFetch([{ status: 401 }]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("InvalidCredentials");
		expect(result.error.status).toBe(401);
		expect(calls).toHaveLength(1); // spike rule: no retry on 401
	});

	test("stub 403 → InvalidCredentials status 403, fetched exactly once", async () => {
		const { fetch, calls } = stubFetch([{ status: 403 }]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("InvalidCredentials");
		expect(result.error.status).toBe(403);
		expect(calls).toHaveLength(1); // spike rule: no retry on 403
	});
});

describe("validateCredentials — TC-AUTH-010 network throw → AuthUnreachable (AC-3)", () => {
	test("stub fetch that rejects → AuthUnreachable (retryable via the mapper)", async () => {
		const failing = mock(
			(): Promise<Response> =>
				Promise.reject(new TypeError("fetch failed: connection refused")),
		) as unknown as typeof fetch;
		const result = await validateCredentials(credsFor(), { fetch: failing });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
		expect(result.error.cause).toContain("connection refused");
	});
});

describe("validateCredentials — TC-AUTH-011 429 backoff (AC-3 / RSK-4)", () => {
	test("429 once then 200 → Result.ok after the backoff (≥ 2 requests)", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 429, headers: { "Retry-After": "0" } },
			{ status: 200, body: { accountId: "x", displayName: "y" } },
		]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(true);
		expect(calls.length).toBeGreaterThanOrEqual(2);
	});

	test("429 forever → AuthUnreachable within the bounded budget (no hang)", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 429, headers: { "Retry-After": "0" } },
		]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
		// Bounded: 1 initial + MAX_429_RETRIES(2) = 3 attempts max.
		expect(calls.length).toBeLessThanOrEqual(3);
	});

	test("429 with no Retry-After then 200 → ok (exponential backoff path)", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 429 }, // no Retry-After header
			{ status: 200, body: { accountId: "x", displayName: "y" } },
		]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(true);
		expect(calls.length).toBeGreaterThanOrEqual(2);
	});
});

describe("validateCredentials — edge status/shape mapping (AC-3 / RSK-6)", () => {
	test("unexpected HTTP status (500) → AuthUnreachable, no retry", async () => {
		const { fetch, calls } = stubFetch([{ status: 500 }]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
		expect(calls).toHaveLength(1);
	});

	test("200 with a non-v2 shape (missing displayName) → AuthUnreachable", async () => {
		const { fetch } = stubFetch([
			{ status: 200, body: { accountId: "abc" } }, // no displayName
		]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
		expect(result.error.cause).toContain("shape");
	});

	test("200 with non-object body → AuthUnreachable", async () => {
		const { fetch } = stubFetch([{ status: 200, body: "a plain string" }]);
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
	});

	test("200 with a non-JSON body → AuthUnreachable (json parse failure)", async () => {
		// A real Response whose body is not parseable JSON makes .json() throw.
		const fetch = (() =>
			Promise.resolve(
				new Response("<<not json>>", { status: 200 }),
			)) as unknown as typeof fetch;
		const result = await validateCredentials(credsFor(), { fetch });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.authKind).toBe("AuthUnreachable");
	});
});

describe("TC-AUTH-012 INV-SEC-1 unit guard (AC-4)", () => {
	// Construct every authKind error the provider can yield; none of the error's
	// field values equals the raw token. Phase 5 strengthens this to a captured-
	// output grep across CommandResult + message strings.

	test("no resolve/validate-produced error object carries the raw token as a field value", async () => {
		for (const k of ENV_KEYS) delete process.env[k];
		const collected: AuthError[] = [];

		const missing = resolveCredentials();
		if (!missing.ok) collected.push(missing.error);

		process.env[ENV_BASE_URL] = "http://bad";
		process.env[ENV_EMAIL] = EMAIL;
		process.env[ENV_API_TOKEN] = TOKEN;
		const badUrl = resolveCredentials();
		if (!badUrl.ok) collected.push(badUrl.error);

		for (const status of [401, 403]) {
			const { fetch } = stubFetch([{ status }]);
			const r = await validateCredentials(credsFor(), { fetch });
			if (!r.ok) collected.push(r.error);
		}
		const network = mock(
			(): Promise<Response> => Promise.reject(new TypeError("down")),
		) as unknown as typeof fetch;
		const unreachable = await validateCredentials(credsFor(), {
			fetch: network,
		});
		if (!unreachable.ok) collected.push(unreachable.error);

		expect(collected.length).toBeGreaterThan(0);
		for (const err of collected) {
			expect(JSON.stringify(err)).not.toContain(TOKEN);
		}
	});
});
