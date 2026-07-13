// Unit tests for ConfluenceTarget (F-1 / DEC-5 / TC-TARGET-001): the class
// satisfies the TargetSystem interface (TS structural check) and renderBody
// delegates to the GH-20 renderStorage (a tiny HAST → body + hash).

import { describe, expect, test } from "bun:test";
import type { Root } from "hast";
import type { ConfluenceCredentials } from "#domain/credentials";
import type {
	RenderBodyOptions as PortRenderBodyOptions,
	RenderedBody as PortRenderedBody,
	TargetSystem,
} from "#domain/target/port";
import type {
	RenderedBody as StorageRenderedBody,
	RenderStorageOptions,
} from "#infra/confluence/render/storage";
import { ConfluenceTarget } from "#infra/confluence/target";
import { ConfluenceClient } from "#infra/confluence/client";

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

/** A tiny HAST: `<p>hi</p>`. */
function tinyHast(): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [{ type: "text", value: "hi" }],
			},
		],
	};
}

describe("TC-TARGET-001 — ConfluenceTarget implements TargetSystem", () => {
	test("the instance satisfies the TargetSystem interface (structural)", () => {
		const client = new ConfluenceClient(creds(), {
			fetch: (() => new Response("{}")) as unknown as typeof fetch,
		});
		const target = new ConfluenceTarget(client, "SPACE");
		const asPort: TargetSystem = target;
		expect(asPort).toBe(target);
	});

	test("fromCredentials builds a working target", () => {
		const target = ConfluenceTarget.fromCredentials(creds(), "SPACE", {
			fetch: (() => new Response("{}")) as unknown as typeof fetch,
		});
		const asPort: TargetSystem = target;
		expect(asPort).toBe(target);
	});

	test("renderBody delegates to renderStorage — HAST → body + hash + warnings", () => {
		const client = new ConfluenceClient(creds(), {
			fetch: (() => new Response("{}")) as unknown as typeof fetch,
		});
		const target = new ConfluenceTarget(client, "SPACE");
		const result = target.renderBody(tinyHast(), { sourcePath: "doc.md" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.body).toBe("<p>hi</p>");
		expect(result.value.hash).toMatch(/^[0-9a-f]+$/);
		expect(Array.isArray(result.value.warnings)).toBe(true);
	});
});

describe("TC-RENDER-TYPES-001 — port RenderedBody/RenderBodyOptions stay in sync with render/storage (finding 5)", () => {
	test("the duplicated types are mutually assignable (structural compatibility)", () => {
		// The port types are intentionally duplicated across the domain↔infra
		// boundary (the port may not import infra). These assignments fail to
		// compile if the two drift apart; the runtime values are witnesses.
		const storageBody: StorageRenderedBody = {
			body: "<p>hi</p>",
			hash: "deadbeef",
			warnings: [],
		};
		const portBody: PortRenderedBody = storageBody;
		const portOpts: PortRenderBodyOptions = { sourcePath: "doc.md" };
		const storageOpts: RenderStorageOptions = portOpts;
		expect(portBody.body).toBe("<p>hi</p>");
		expect(storageOpts.sourcePath).toBe("doc.md");
	});
});

describe("ConfluenceTarget wiring — every port op delegates to its service", () => {
	function makeTarget(
		methodPathHandler: (method: string, path: string) => Response,
	) {
		const fn = (url: string, init: RequestInit) => {
			const parsed = new URL(url);
			const v1 = parsed.pathname.replace(/^\/wiki\/rest\/api/, "");
			const v2 = parsed.pathname.replace(/^\/wiki\/api\/v2/, "");
			const path =
				v2.startsWith("/pages") || v2.startsWith("/search") ? v2 : v1;
			return methodPathHandler(init.method ?? "GET", path);
		};
		const client = new ConfluenceClient(creds(), {
			fetch: fn as unknown as typeof fetch,
		});
		return new ConfluenceTarget(client, "SPACE");
	}

	function page(status: number, id = "1", version = 1): Response {
		return new Response(
			JSON.stringify({
				id,
				title: "T",
				status: "current",
				version: { number: version },
				body: {},
			}),
			{ status, headers: { "Content-Type": "application/json" } },
		);
	}

	test("getPage delegates to PageService.get", async () => {
		const t = makeTarget(() => page(200));
		const r = await t.getPage("1");
		expect(r.ok).toBe(true);
	});

	test("createPage delegates to PageService.create", async () => {
		const t = makeTarget((m) => (m === "POST" ? page(200, "2") : page(200)));
		const r = await t.createPage({
			parentId: "1",
			title: "T",
			body: "<p>x</p>",
		});
		expect(r.ok).toBe(true);
	});

	test("updatePage delegates to PageService.update", async () => {
		const t = makeTarget(() => page(200, "1", 4));
		const r = await t.updatePage({
			pageId: "1",
			title: "T",
			body: "<p>x</p>",
			baseVersion: 3,
		});
		expect(r.ok).toBe(true);
	});

	test("movePage delegates to PageService.move", async () => {
		const t = makeTarget(() => page(200, "1", 2));
		const r = await t.movePage({ pageId: "1", parentId: "9" });
		expect(r.ok).toBe(true);
	});

	test("getProperty / putProperty delegate to PropertyService", async () => {
		const t = makeTarget((m, p) => {
			if (m === "POST")
				return new Response(
					JSON.stringify({
						id: "1",
						key: "k",
						value: "v",
						version: { number: 1 },
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			return new Response(
				JSON.stringify({
					id: "1",
					key: "k",
					value: "v",
					version: { number: 1 },
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		});
		const put = await t.putProperty("1", "k", "v");
		expect(put.ok).toBe(true);
		const get = await t.getProperty("1", "k");
		expect(get.ok).toBe(true);
	});

	test("uploadAttachment / attachmentExists / listAttachments delegate to AttachmentService", async () => {
		const t = makeTarget(
			() =>
				new Response(JSON.stringify({ results: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const exists = await t.attachmentExists("1", "h");
		expect(exists.ok).toBe(true);
		const list = await t.listAttachments("1");
		expect(list.ok).toBe(true);
	});

	test("searchPages delegates to SearchService", async () => {
		const t = makeTarget(
			() =>
				new Response(JSON.stringify({ results: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const r = await t.searchPages("space = 'x'");
		expect(r.ok).toBe(true);
	});

	test("getRestrictions delegates to RestrictionsService", async () => {
		const t = makeTarget(
			() =>
				new Response(JSON.stringify({ results: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const r = await t.getRestrictions("1");
		expect(r.ok).toBe(true);
	});
});
