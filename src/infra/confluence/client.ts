// Confluence Cloud transport — the single place v1/v2 URLs, authHeader
// injection, redacted logging, and the retry policy live. Native fetch only
// (DEC-6); auth path per spike H1. Implements no domain port itself — services
// compose it.

import type { ConfluenceCredentials } from "#domain/credentials";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";
import pkg from "../../../package.json" with { type: "json" };

/** Bounded retry budget (PD-8): 429 and 5xx each retry at most this many times. */
export const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const RETRY_AFTER_CAP_MS = 30_000;
const USER_AGENT = `marksync/${pkg.version}`;
const JSON_CONTENT_TYPE = "application/json";

/** A request body parameter — JSON-serializable value or multipart form. */
export interface RequestOptions {
	json?: unknown;
	multipart?: FormData;
	headers?: Record<string, string>;
}

/** The transport-level response surfaced to services (status + parsed body). */
export interface RawResponse {
	status: number;
	headers: Headers;
	/** Parsed JSON body when the response is JSON-shaped; otherwise absent. */
	json?: unknown;
	/** Raw text body. */
	text?: string;
}

/** Seam so tests capture redacted log lines / skip real delays (testing-strategy §"fault injection"). */
export interface ConfluenceClientOptions {
	fetch?: typeof fetch;
	log?: (message: string) => void;
	/** Override the sleep between retries; defaults to setTimeout-based delay. */
	delay?: (ms: number) => Promise<void>;
}

/**
 * The Confluence Cloud transport. Inject the `fetch`/`log`/`delay` seams for
 * tests (default to the globals). `request` returns a `Result`: transport
 * exhaustion yields `RateLimited` (429) / `RemoteUnreachable` (5xx, network);
 * every other status (incl. 401/403/404/409/400) is surfaced as `ok` for the
 * service to interpret — 401/403 are NEVER retried.
 */
export class ConfluenceClient {
	private readonly authHeader: string;
	private readonly baseUrl: string;
	private readonly doFetch: typeof fetch;
	private readonly log: (message: string) => void;
	private readonly delay: (ms: number) => Promise<void>;

	constructor(
		credentials: ConfluenceCredentials,
		options?: ConfluenceClientOptions,
	) {
		this.baseUrl = credentials.baseUrl.replace(/\/$/, "");
		this.authHeader = credentials.authHeader;
		this.doFetch = options?.fetch ?? globalThis.fetch;
		this.log = options?.log ?? (() => {});
		this.delay = options?.delay ?? defaultDelay;
	}

	/** v1 REST endpoint: `${baseUrl}/wiki/rest/api${path}`. */
	v1(path: string): string {
		return `${this.baseUrl}/wiki/rest/api${path}`;
	}

	/** v2 REST endpoint: `${baseUrl}/wiki/api/v2${path}`. */
	v2(path: string): string {
		return `${this.baseUrl}/wiki/api/v2${path}`;
	}

	async request(
		method: string,
		url: string,
		options?: RequestOptions,
	): Promise<Result<RawResponse, MarkSyncError>> {
		let attempt = 0;
		for (;;) {
			const response = await this.sendOnce(method, url, options);
			if (!response.ok) return response; // network failure → RemoteUnreachable

			const { status } = response.value;

			if (status === 429) {
				if (attempt >= MAX_RETRIES) {
					const retryAfterMs = parseRetryAfterMs(
						response.value.headers.get("Retry-After"),
					);
					return Result.err({
						kind: "RateLimited",
						...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
					});
				}
				await this.wait(attempt, response.value.headers.get("Retry-After"));
				attempt += 1;
				continue;
			}

			if (status >= 500 && status < 600) {
				if (attempt >= MAX_RETRIES) {
					return Result.err({
						kind: "RemoteUnreachable",
						status,
						cause: `server returned HTTP ${status} after ${MAX_RETRIES} retries`,
					});
				}
				await this.wait(attempt, null);
				attempt += 1;
				continue;
			}

			// 401/403/404/409/400/2xx — surface to the caller; never retried.
			return response;
		}
	}

	private async sendOnce(
		method: string,
		url: string,
		options: RequestOptions | undefined,
	): Promise<Result<RawResponse, MarkSyncError>> {
		const headers = this.buildHeaders(options);
		const init: RequestInit = { method, headers };
		if (options?.multipart) {
			init.body = options.multipart;
		} else if (options?.json !== undefined) {
			init.body = JSON.stringify(options.json);
		}

		let response: Response;
		try {
			response = await this.doFetch(url, init);
		} catch (e) {
			const cause = e instanceof Error ? e.message : String(e);
			this.log(redactLog(`fetch ${method} ${safeUrl(url)} failed: ${cause}`));
			return Result.err({ kind: "RemoteUnreachable", cause });
		}

		const text = await response.text();
		const json = parseJsonIfPossible(text, response.headers);
		const raw: RawResponse = {
			status: response.status,
			headers: response.headers,
			text,
			...(json !== undefined ? { json } : {}),
		};
		this.log(
			redactLog(
				`${method} ${safeUrl(url)} → ${response.status} ${truncate(text)}`,
			),
		);
		return Result.ok(raw);
	}

	private buildHeaders(options: RequestOptions | undefined): Headers {
		const headers = new Headers({
			Authorization: this.authHeader,
			"User-Agent": USER_AGENT,
		});
		if (!options?.multipart) {
			headers.set("Content-Type", JSON_CONTENT_TYPE);
		}
		if (options?.multipart) {
			headers.set("X-Atlassian-Token", "no-check");
		}
		if (options?.headers) {
			for (const [key, value] of Object.entries(options.headers)) {
				headers.set(key, value);
			}
		}
		return headers;
	}

	private async wait(
		attempt: number,
		retryAfterHeader: string | null,
	): Promise<void> {
		const ms = retryDelayMs(attempt, retryAfterHeader);
		await this.delay(ms);
	}
}

function defaultDelay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The `cause` for a `RemoteUnreachable` when a service has no status-specific
 * mapping. A 401 gets a distinctive auth-shaped message (expired token?) so an
 * authentication rejection isn't reported as a generic server/network failure;
 * every other status stays operation-specific.
 */
export function unreachableCause(status: number, operation: string): string {
	return status === 401
		? "HTTP 401 Unauthorized (token expired?)"
		: `unexpected ${operation} status ${status}`;
}

/** Exponential backoff `1000 * 2**attempt` + jitter; `Retry-After` honored + capped. */
function retryDelayMs(
	attempt: number,
	retryAfterHeader: string | null,
): number {
	const retryAfter = parseRetryAfterMs(retryAfterHeader);
	if (retryAfter !== undefined) {
		return Math.min(retryAfter, RETRY_AFTER_CAP_MS);
	}
	const jitter = Math.floor(Math.random() * 200);
	return BACKOFF_BASE_MS * 2 ** attempt + jitter;
}

function parseRetryAfterMs(value: string | null): number | undefined {
	// Confluence sends integer seconds; HTTP-date format falls back to
	// exponential backoff (returns undefined here, retried via retryDelayMs).
	if (value === null) return undefined;
	const seconds = Number.parseInt(value, 10);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function parseJsonIfPossible(text: string, headers: Headers): unknown {
	const contentType = headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json") || text === "")
		return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function truncate(text: string): string {
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** Strip the query/search before logging so secrets in params don't reach logs. */
function safeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url;
	}
}

// Minimal credential scrubbing for log lines — the infra tier may not import the
// presentation redactor (ADR-0011 tier matrix), so the load-bearing patterns are
// mirrored here. The opaque authHeader design means the raw token never reaches
// a request body; this redacts any Authorization/Basic/token/email in log text.
function redactLog(input: string): string {
	return input
		.replace(
			/Authorization:\s*[A-Za-z]+\s+[A-Za-z0-9._+/=-]+/g,
			"[REDACTED:auth]",
		)
		.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._+/=-]+/g, "[REDACTED:auth]")
		.replace(/\bAT(?:ATT|STS)[A-Za-z0-9_-]{8,}/g, "[REDACTED:token]")
		.replace(/\bgh[opsur]_[A-Za-z0-9]{16,}/g, "[REDACTED:token]")
		.replace(
			/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
			"[REDACTED:email]",
		);
}
