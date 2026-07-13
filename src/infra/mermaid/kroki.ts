// Kroki HTTP adapter — POSTs mermaid source to the public Kroki instance and
// returns a full-sha256 Artifact with `kind: "mermaid"` (ADR-0002 rung 6).

import type { Renderer } from "#domain/mermaid/port";
import type { Artifact } from "#domain/target/port";
import type { MarkSyncError } from "#domain/errors";
import { Result as Res } from "#domain/result";

const KROKI_ENDPOINT = "https://kroki.io/mermaid/svg";
const TIMEOUT_MS = 30_000;

export interface KrokiClientOptions {
	/** Injectable fetch seam (tests inject a stub; default: global fetch). */
	fetch?: typeof fetch;
	/** Override the Kroki endpoint (tests/local instances). */
	endpoint?: string;
	/** Override the request timeout (tests use a short window). */
	timeoutMs?: number;
}

export class KrokiClient implements Renderer {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly doFetch: typeof fetch;

	constructor(opts: KrokiClientOptions = {}) {
		this.endpoint = opts.endpoint ?? KROKI_ENDPOINT;
		this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
		this.doFetch = opts.fetch ?? globalThis.fetch;
	}

	async render(source: string) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.doFetch(this.endpoint, {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: source,
				signal: controller.signal,
			});
			if (!response.ok) {
				return Res.err<MarkSyncError>({
					kind: "RemoteUnreachable",
					status: response.status,
					cause: `Kroki returned HTTP ${response.status}`,
				});
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			const hash = await sha256Hex(bytes);
			const artifact: Artifact = {
				bytes,
				mime: "image/svg+xml",
				hash,
				kind: "mermaid",
			};
			return Res.ok(artifact);
		} catch (e) {
			const aborted = e instanceof Error && e.name === "AbortError";
			return Res.err<MarkSyncError>({
				kind: "RemoteUnreachable",
				cause: aborted
					? `Kroki request timed out after ${this.timeoutMs}ms`
					: `Kroki request failed: ${
							e instanceof Error ? e.message : String(e)
						}`,
			});
		} finally {
			clearTimeout(timer);
		}
	}
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	// Uint8Array<ArrayBufferLike> isn't assignable to BufferSource under the
	// current lib types (TS 6, lib ESNext); assert to the backed-by-ArrayBuffer
	// subtype — runtime is always a real ArrayBuffer (response.arrayBuffer()).
	const d = await crypto.subtle.digest(
		"SHA-256",
		bytes as Uint8Array<ArrayBuffer>,
	);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
