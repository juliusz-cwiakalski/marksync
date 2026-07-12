// Unit tests for PageService (F-3, F-7): the v2 page surface, the 409-conflict
// parse (AC-F3-1 — version numbers extracted from the title), the 403→Forbidden
// warn+skip (AC-F7-1 — 0 delete/recreate), 404→RemoteMissing, 200 mapping, and
// schema-validation-failure → RemoteUnreachable (PD-5). Backed by an injected
// stub fetch (testing-strategy §"fault injection").

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";
import { PageService, parseConflict } from "#infra/confluence/pages";

const BASE_URL = "https://example.atlassian.net";
const AUTH = "Basic dGVzdDp0b2tlbg==";
const SPACE_ID = "123";

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

function pageBody(id: string, title: string, version: number, value?: string) {
	return {
		id,
		title,
		status: "current",
		version: { number: version, message: "prev" },
		body: value ? { storage: { value } } : {},
	};
}

/** A scripted stub fetch: returns responses in sequence, recording every call. */
function scriptFetch(responses: (req: Request) => Response): {
	fetch: typeof fetch;
	calls: Request[];
} {
	const calls: Request[] = [];
	const fn = (url: string, init: RequestInit) => {
		const req = new Request(url, init);
		calls.push(req);
		return responses(req);
	};
	return { fetch: fn as unknown as typeof fetch, calls };
}

function makeService(fetchImpl: typeof fetch): {
	service: PageService;
	calls: Request[];
} {
	const stub = scriptFetch(fetchImpl);
	const client = new ConfluenceClient(creds(), { fetch: stub.fetch });
	const service = new PageService(client, SPACE_ID);
	return { service, calls: stub.calls };
}

describe("TC-409-001 — 409 CONFLICT → Conflict with correct version numbers (AC-F3-1)", () => {
	test("Current Version: [7], Provided version: [5] → baseVersion 5, remoteVersion 7", async () => {
		const { service, calls } = makeService(() =>
			jsonRes(409, {
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
		const result = await service.update({
			pageId: "999",
			title: "T",
			body: "<p>x</p>",
			baseVersion: 5,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Conflict");
		expect(result.error).toMatchObject({
			pageId: "999",
			baseVersion: 5,
			remoteVersion: 7,
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("PUT");
	});
});

describe("TC-409-002 — multiple version pairs parsed correctly (NFR-2)", () => {
	const cases: [string, number, number][] = [
		["Current Version: [10]. Provided version: [3]", 3, 10],
		["Current Version: [100]. Provided version: [99]", 99, 100],
		["Current Version: [2]. Provided version: [1]", 1, 2],
	];
	for (const [title, expectedBase, expectedRemote] of cases) {
		test(`${title} → base ${expectedBase}, remote ${expectedRemote}`, () => {
			const result = parseConflict("p", {
				errors: [{ code: "CONFLICT", title }],
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("Conflict");
			expect(result.error.baseVersion).toBe(expectedBase);
			expect(result.error.remoteVersion).toBe(expectedRemote);
		});
	}
});

describe("TC-403-001 — 403 on getPage → Forbidden; 0 delete/recreate (AC-F7-1)", () => {
	test("403 → Forbidden with operation getPage, no DELETE/POST issued", async () => {
		const { service, calls } = makeService(
			() => new Response(null, { status: 403 }),
		);
		const result = await service.get("42");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
		expect(result.error).toMatchObject({ pageId: "42", operation: "getPage" });
		expect(calls).toHaveLength(1);
		for (const c of calls) {
			expect(c.method).toBe("GET"); // 0 delete/recreate
		}
	});
});

describe("TC-404-001 — 404 → RemoteMissing", () => {
	test("404 on getPage → RemoteMissing", async () => {
		const { service } = makeService(() => new Response(null, { status: 404 }));
		const result = await service.get("42");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteMissing");
		expect(result.error.pageId).toBe("42");
	});
});

describe("TC-200-001 — 200 page → validated + mapped to port Page", () => {
	test("200 with storage body → ok(Page) carrying body", async () => {
		const { service } = makeService(() =>
			jsonRes(200, pageBody("7", "Hello", 3, "<p>hi</p>")),
		);
		const result = await service.get("7");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			id: "7",
			title: "Hello",
			version: 3,
			body: "<p>hi</p>",
		});
	});

	test("update 200 → ok(Page)", async () => {
		const { service } = makeService(() =>
			jsonRes(200, pageBody("7", "Hello", 4)),
		);
		const result = await service.update({
			pageId: "7",
			title: "Hello",
			body: "<p>x</p>",
			baseVersion: 3,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.version).toBe(4);
	});
});

describe("TC-SCHEMA-001 — malformed body → RemoteUnreachable (PD-5)", () => {
	test("200 body failing zod → RemoteUnreachable", async () => {
		const { service } = makeService(() => jsonRes(200, { not: "a page" }));
		const result = await service.get("7");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
	});

	test("409 with non-CONFLICT code → RemoteUnreachable", async () => {
		const { service } = makeService(() =>
			jsonRes(409, { errors: [{ code: "OTHER", title: "x" }] }),
		);
		const result = await service.update({
			pageId: "7",
			title: "T",
			body: "<p>x</p>",
			baseVersion: 1,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
	});

	test("409 envelope failing zod → RemoteUnreachable", async () => {
		const { service } = makeService(() => jsonRes(409, { wrong: true }));
		const result = await service.update({
			pageId: "7",
			title: "T",
			body: "<p>x</p>",
			baseVersion: 1,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("RemoteUnreachable");
	});
});
