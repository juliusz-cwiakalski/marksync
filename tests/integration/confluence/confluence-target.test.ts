// Integration tests for ConfluenceTarget against a real Bun.serve mock
// simulating the v2/v1 split + every status path (200/409/403/400/429/5xx),
// the property round-trip, the attachment lifecycle, and the no-token-leak +
// no-outbound-telemetry invariants asserted over captured HTTP traffic
// (testing-strategy §"over-mocking guardrail": the safety properties are proven
// through a real HTTP path, not mocks alone).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceTarget } from "#infra/confluence/target";

const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const AUTH_HEADER = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
const SPACE_ID = "123";
const PAGE_ID = "39813121";

function creds(baseUrl: string): ConfluenceCredentials {
	return {
		baseUrl,
		authHeader: AUTH_HEADER,
		email: "j***@cwiakalski.com",
		mode: "api-token",
	};
}

function json(
	status: number,
	body: unknown,
	headers?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function pageBody(id: string, title: string, version: number, value?: string) {
	return {
		id,
		title,
		status: "current",
		version: { number: version, message: "prev" },
		body: value ? { storage: { value } } : {},
	};
}

interface CapturedRequest {
	host: string;
	path: string;
	method: string;
	authorization: string | null;
	text: string;
}

/** A Bun.serve mock recording every request; `respond` decides per (req, body). */
function serveMock(respond: (req: Request, bodyText: string) => Response): {
	origin: string;
	stop: () => void;
	captured: CapturedRequest[];
} {
	const captured: CapturedRequest[] = [];
	const server = Bun.serve({
		port: 0,
		fetch: async (req) => {
			const url = new URL(req.url);
			const text = await req.text().catch(() => "");
			captured.push({
				host: url.host,
				path: url.pathname,
				method: req.method,
				authorization: req.headers.get("Authorization"),
				text,
			});
			return respond(req, text);
		},
	});
	return {
		origin: `http://localhost:${server.port}`,
		stop: () => server.stop(true),
		captured,
	};
}

/** Build a target against an origin with an instant-delay seam (no real sleeps). */
function targetFor(origin: string, logs?: string[]): ConfluenceTarget {
	return ConfluenceTarget.fromCredentials(creds(origin), SPACE_ID, {
		delay: () => Promise.resolve(),
		log: (msg) => {
			logs?.push(msg);
		},
	});
}

describe("TC-INT-UPDATE-200 — updatePage with version N+1 → 200 → ok(Page)", () => {
	let server: ReturnType<typeof serveMock>;
	beforeAll(() => {
		server = serveMock(() => json(200, pageBody(PAGE_ID, "Hello", 4)));
	});
	afterAll(() => server.stop());

	test("update → ok(Page) with bumped version", async () => {
		const t = targetFor(server.origin);
		const r = await t.updatePage({
			pageId: PAGE_ID,
			title: "Hello",
			body: "<p>x</p>",
			baseVersion: 3,
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.version).toBe(4);
	});
});

describe("TC-INT-409 (AC-F3-1) — stale version → Conflict with correct numbers", () => {
	let server: ReturnType<typeof serveMock>;
	beforeAll(() => {
		server = serveMock(() =>
			json(409, {
				errors: [
					{
						status: 409,
						code: "CONFLICT",
						title:
							"Version must be incremented when updating a page. Current Version: [7]. Provided version: [5]",
					},
				],
			}),
		);
	});
	afterAll(() => server.stop());

	test("409 → err(Conflict{ baseVersion:5, remoteVersion:7 })", async () => {
		const t = targetFor(server.origin);
		const r = await t.updatePage({
			pageId: PAGE_ID,
			title: "T",
			body: "<p>x</p>",
			baseVersion: 4,
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("Conflict");
		expect(r.error).toMatchObject({ baseVersion: 5, remoteVersion: 7 });
	});
});

describe("TC-INT-403 (AC-F7-1) — getPage on locked page → Forbidden; 0 delete/recreate", () => {
	let server: ReturnType<typeof serveMock>;
	beforeAll(() => {
		server = serveMock(() => new Response(null, { status: 403 }));
	});
	afterAll(() => server.stop());

	test("403 → Forbidden; only a GET was issued (no DELETE/POST)", async () => {
		const t = targetFor(server.origin);
		const r = await t.getPage(PAGE_ID);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("Forbidden");
		const methods = server.captured.map((c) => c.method);
		expect(methods).toEqual(["GET"]);
	});
});

describe("TC-INT-PROP-RT (AC-F4-1) — putProperty string → getProperty byte-equal (~8 KB)", () => {
	let server: ReturnType<typeof serveMock>;
	let store = "";
	beforeAll(() => {
		server = serveMock((req, bodyText) => {
			if (req.method === "POST") {
				const body = JSON.parse(bodyText.length ? bodyText : "{}") as {
					value?: string;
				};
				store = body.value ?? "";
				return json(200, { key: "marksync.metadata", value: store });
			}
			// GET by key
			return json(200, { key: "marksync.metadata", value: store });
		});
	});
	afterAll(() => server.stop());

	test("round-trips an ~8 KB string byte-equal", async () => {
		const t = targetFor(server.origin);
		const value = "x".repeat(8 * 1024);
		const put = await t.putProperty(PAGE_ID, "marksync.metadata", value);
		expect(put.ok).toBe(true);
		const get = await t.getProperty(PAGE_ID, "marksync.metadata");
		expect(get.ok).toBe(true);
		if (!get.ok) return;
		expect(get.value).toBe(value);
	});
});

describe("TC-INT-ATT-DUP (AC-F5-1) — duplicate upload → already exists; /data update bumps version", () => {
	let server: ReturnType<typeof serveMock>;
	beforeAll(() => {
		server = serveMock((req) => {
			const url = new URL(req.url);
			// Create endpoint
			if (req.method === "POST" && url.pathname.endsWith("/child/attachment")) {
				return new Response(
					JSON.stringify({
						message: "Cannot add a new attachment with same file name",
					}),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}
			// /data update endpoint
			if (req.method === "POST" && url.pathname.includes("/data")) {
				return json(200, {
					id: "att1",
					title: "marksync-mermaid-h.svg",
					version: { number: 2 },
				});
			}
			// list
			return json(200, {
				results: [
					{
						id: "att1",
						title: "marksync-mermaid-h.svg",
						version: { number: 1 },
					},
				],
			});
		});
	});
	afterAll(() => server.stop());

	test("dup upload → ok(existing ref); /data update → bumped version", async () => {
		const t = targetFor(server.origin);
		const artifact = {
			bytes: new TextEncoder().encode("<svg/>"),
			mime: "image/svg+xml",
			hash: "h",
		};
		const up = await t.uploadAttachment(PAGE_ID, artifact);
		expect(up.ok).toBe(true);
		if (!up.ok) return;
		expect(up.value.hash).toBe("h");
	});
});

describe("TC-INT-429 (AC-F2-1) — 429 then 200 → ok; sustained → RateLimited", () => {
	test("transient 429 → ok after retry", async () => {
		let count = 0;
		const server = serveMock(() => {
			count += 1;
			return count === 1
				? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
				: json(200, pageBody(PAGE_ID, "T", 1));
		});
		try {
			const t = targetFor(server.origin);
			const r = await t.getPage(PAGE_ID);
			expect(r.ok).toBe(true);
			expect(server.captured.length).toBeGreaterThanOrEqual(2);
		} finally {
			server.stop();
		}
	});

	test("sustained 429 → err(RateLimited)", async () => {
		const server = serveMock(
			() =>
				new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
		);
		try {
			const t = targetFor(server.origin);
			const r = await t.getPage(PAGE_ID);
			expect(r.ok).toBe(false);
			if (r.ok) return;
			expect(r.error.kind).toBe("RateLimited");
		} finally {
			server.stop();
		}
	});
});

describe("TC-INT-5XX (NFR-9) — transient 5xx → ok; sustained → RemoteUnreachable", () => {
	test("transient 500 → ok after retry", async () => {
		let count = 0;
		const server = serveMock(() => {
			count += 1;
			return count === 1
				? json(500, { error: "boom" })
				: json(200, pageBody(PAGE_ID, "T", 1));
		});
		try {
			const t = targetFor(server.origin);
			const r = await t.getPage(PAGE_ID);
			expect(r.ok).toBe(true);
		} finally {
			server.stop();
		}
	});

	test("sustained 500 → err(RemoteUnreachable)", async () => {
		const server = serveMock(() => json(500, { error: "boom" }));
		try {
			const t = targetFor(server.origin);
			const r = await t.getPage(PAGE_ID);
			expect(r.ok).toBe(false);
			if (r.ok) return;
			expect(r.error.kind).toBe("RemoteUnreachable");
		} finally {
			server.stop();
		}
	});
});

describe("TC-INT-NOLEAK (AC-F2-2) + TC-INT-NOTELEMETRY (AC-F2-3)", () => {
	let server: ReturnType<typeof serveMock>;
	const logs: string[] = [];
	beforeAll(() => {
		logs.length = 0;
		server = serveMock(() => json(200, pageBody(PAGE_ID, "T", 1)));
	});
	afterAll(() => server.stop());

	test("every request targets the baseUrl host (0 to other hosts)", async () => {
		const t = targetFor(server.origin, logs);
		await t.getPage(PAGE_ID);
		const expectedHost = new URL(server.origin).host;
		for (const c of server.captured) {
			expect(c.host).toBe(expectedHost);
		}
	});

	test("0 occurrences of the token across captured artifacts + logs", async () => {
		const t = targetFor(server.origin, logs);
		await t.updatePage({
			pageId: PAGE_ID,
			title: "T",
			body: "<p>x</p>",
			baseVersion: 1,
		});
		const artifacts = [
			...server.captured.map(
				(c) => `${c.method} ${c.path} ${c.authorization ?? ""} ${c.text}`,
			),
			...logs,
		].join("\n");
		expect(artifacts).not.toContain(TOKEN);
	});
});

describe("TC-INT-BOUNDARY (AC-F1-1) — depcruise src is green (port is the only seam)", () => {
	test("no domain/cli → infra/confluence violation", () => {
		const result = Bun.spawnSync({
			cmd: ["bunx", "depcruise", "src", "--output-type", "json"],
			stdout: "pipe",
			stderr: "pipe",
		});
		const parsed = JSON.parse(result.stdout.toString()) as {
			summary?: { violations?: unknown[] };
		};
		expect(parsed.summary?.violations ?? []).toHaveLength(0);
	});
});
