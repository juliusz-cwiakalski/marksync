// Unit tests for the Kroki HTTP adapter (TC-MERM-005, TC-MERM-007, TC-MERM-010).
// Fetch is injected as a stub — no real network calls (testing-strategy §"fault injection").

import { describe, expect, test } from "bun:test";
import { KrokiClient } from "#infra/mermaid/kroki";

const SVG = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const d = await crypto.subtle.digest(
		"SHA-256",
		bytes as unknown as ArrayBuffer,
	);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

describe("KrokiClient", () => {
	describe("TC-MERM success path (DM-6 / AC-5)", () => {
		test("HTTP 200 → ok(Artifact) with full sha256 hash, image/svg+xml, kind=mermaid", async () => {
			const expectedHash = await sha256Hex(SVG);
			const client = new KrokiClient({
				fetch: async () =>
					new Response(SVG, {
						status: 200,
						headers: { "Content-Type": "image/svg+xml" },
					}),
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const artifact = result.value;
			expect(artifact.kind).toBe("mermaid");
			expect(artifact.mime).toBe("image/svg+xml");
			expect(artifact.bytes).toEqual(SVG);
			expect(artifact.hash).toBe(expectedHash);
			// Full sha256 = 64 hex chars (NOT truncated)
			expect(artifact.hash).toHaveLength(64);
			expect(artifact.hash).toMatch(/^[a-f0-9]{64}$/);
		});

		test("POST body carries the diagram source; Content-Type is text/plain", async () => {
			let captured: { body?: BodyInit; contentType?: string } = {};
			const client = new KrokiClient({
				fetch: async (_url, init) => {
					captured = {
						body: init?.body,
						contentType: init?.headers
							? new Headers(init.headers).get("Content-Type")
							: undefined,
					};
					return new Response(SVG, { status: 200 });
				},
			});

			await client.render("graph TD; A-->B");

			expect(captured.body).toBe("graph TD; A-->B");
			expect(captured.contentType).toBe("text/plain");
		});
	});

	describe("TC-MERM-005 network fallback (AC-4 / NFR-5)", () => {
		test("HTTP 503 → err(RemoteUnreachable, status=503)", async () => {
			const client = new KrokiClient({
				fetch: async () => new Response("Service Unavailable", { status: 503 }),
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("RemoteUnreachable");
			expect(result.error).toMatchObject({
				kind: "RemoteUnreachable",
				status: 503,
			});
		});

		test("HTTP 404 → err(RemoteUnreachable, status=404)", async () => {
			const client = new KrokiClient({
				fetch: async () => new Response("Not Found", { status: 404 }),
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("RemoteUnreachable");
			expect(result.error.status).toBe(404);
		});
	});

	describe("TC-MERM-010 timeout safety (NFR-7 / AC-4)", () => {
		test("fetch rejects with AbortError → err(RemoteUnreachable)", async () => {
			const client = new KrokiClient({
				fetch: async () => {
					throw new DOMException("The operation was aborted", "AbortError");
				},
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("RemoteUnreachable");
			expect(result.error.cause).toContain("timed out");
		});

		test("short timeoutMs aborts a hanging request → err(RemoteUnreachable)", async () => {
			const client = new KrokiClient({
				timeoutMs: 20,
				fetch: (_url, init) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(new DOMException("aborted", "AbortError"));
						});
					}),
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("RemoteUnreachable");
			expect(result.error.cause).toContain("timed out");
		});

		test("generic network error → err(RemoteUnreachable)", async () => {
			const client = new KrokiClient({
				fetch: async () => {
					throw new TypeError("fetch failed: ENOTFOUND kroki.io");
				},
			});

			const result = await client.render("graph TD; A-->B");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe("RemoteUnreachable");
			expect(result.error.cause).toContain("fetch failed");
		});
	});
});
