// Unit tests for AttachmentService (F-5 / AC-F5-1): the v1 attachment surface —
// 400-duplicate-filename idempotency signal (NOT an error), /data update bumps
// version on changed bytes, exists-by-hash, and list enumeration.

import { describe, expect, test } from "bun:test";
import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceClient } from "#infra/confluence/client";
import {
	AttachmentService,
	attachmentFilename,
} from "#infra/confluence/attachments";
import type { Artifact } from "#domain/target/port";

const BASE_URL = "https://example.atlassian.net";
const AUTH = "Basic dGVzdDp0b2tlbg==";
const PAGE = "555";

function creds(): ConfluenceCredentials {
	return {
		baseUrl: BASE_URL,
		authHeader: AUTH,
		email: "j***@x.com",
		mode: "api-token",
	};
}

function svgArtifact(hash: string): Artifact {
	return {
		bytes: new TextEncoder().encode(`<svg>${hash}</svg>`),
		mime: "image/svg+xml",
		hash,
	};
}

function jsonRes(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

interface Call {
	method: string;
	path: string;
}

/** Scripted handler keyed by the v1 attachment path + method. */
function script(handler: (method: string, path: string) => Response): {
	service: AttachmentService;
	calls: Call[];
} {
	const calls: Call[] = [];
	const fn = (url: string, init: RequestInit) => {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/^\/wiki\/rest\/api/, "");
		calls.push({ method: init.method ?? "GET", path });
		return handler(init.method ?? "GET", path);
	};
	const client = new ConfluenceClient(creds(), {
		fetch: fn as unknown as typeof fetch,
	});
	return { service: new AttachmentService(client), calls };
}

const DUP_400_BODY = JSON.stringify({
	message: "Cannot add a new attachment with same file name",
});

describe("attachmentFilename — hash-derived, mime-aware prefix/ext", () => {
	test("mermaid SVG → marksync-mermaid-<hash>.svg", () => {
		expect(attachmentFilename(svgArtifact("abc123"))).toBe(
			"marksync-mermaid-abc123.svg",
		);
	});
	test("png asset → marksync-asset-<hash>.png", () => {
		const a: Artifact = {
			bytes: new Uint8Array([1]),
			mime: "image/png",
			hash: "h7",
		};
		expect(attachmentFilename(a)).toBe("marksync-asset-h7.png");
	});
});

describe("TC-DUP-001 — duplicate filename 400 → 'already exists', 0 writes (AC-F5-1)", () => {
	test("upload then 400 'same file name' → ok(ref), no new create write", async () => {
		const artifact = svgArtifact("hash1");
		const filename = attachmentFilename(artifact);
		const listBody = {
			results: [{ id: "att1", title: filename, version: { number: 1 } }],
		};
		const { service, calls } = script((method, path) => {
			if (method === "POST" && path === `/content/${PAGE}/child/attachment`) {
				return new Response(DUP_400_BODY, { status: 400 });
			}
			if (method === "GET") return jsonRes(200, listBody);
			return jsonRes(500, {});
		});
		const result = await service.upload(PAGE, artifact);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.hash).toBe("hash1");
		expect(result.value.id).toBe("att1");
		// Exactly one POST create attempt (rejected) + one GET list to resolve.
		const posts = calls.filter((c) => c.method === "POST");
		expect(posts).toHaveLength(1);
	});
});

describe("TC-UPD-001 — /data update bumps version on changed bytes", () => {
	test("POST .../data 200 → ok(ref) with bumped version", async () => {
		const artifact = svgArtifact("hash2");
		const { service, calls } = script((method, path) => {
			if (method === "POST" && path.includes("/data")) {
				return jsonRes(200, {
					id: "att9",
					title: attachmentFilename(artifact),
					version: { number: 2 },
				});
			}
			return jsonRes(500, {});
		});
		const result = await service.update(PAGE, "att9", artifact);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.version).toBe(2);
		expect(calls[0]?.path).toBe(`/content/${PAGE}/child/attachment/att9/data`);
	});
});

describe("TC-EXISTS-001 — exists resolves by hash; 403 → Forbidden", () => {
	test("exists true when a hash-matching attachment is present", async () => {
		const filename = attachmentFilename(svgArtifact("hexists"));
		const { service } = script(() =>
			jsonRes(200, {
				results: [{ id: "attX", title: filename, version: { number: 1 } }],
			}),
		);
		const result = await service.exists(PAGE, "hexists");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe(true);
	});

	test("exists false when no matching hash", async () => {
		const { service } = script(() => jsonRes(200, { results: [] }));
		const result = await service.exists(PAGE, "absent");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe(false);
	});

	test("403 → Forbidden", async () => {
		const { service } = script(() => new Response(null, { status: 403 }));
		const result = await service.exists(PAGE, "h");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("Forbidden");
	});
});

describe("TC-LIST-001 — list enumerates hash-named attachments", () => {
	test("list maps results to AttachmentRef[]", async () => {
		const fn1 = attachmentFilename(svgArtifact("aa"));
		const { service } = script(() =>
			jsonRes(200, {
				results: [
					{ id: "1", title: fn1, version: { number: 1 } },
					{ id: "2", title: "unrelated.png", version: { number: 3 } },
				],
			}),
		);
		const result = await service.list(PAGE);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toHaveLength(2);
		expect(result.value[0]?.hash).toBe("aa");
	});
});
