// src/app/credentials.ts
//
// Confluence API-token credential provider — env → opaque Basic header; injected
// fetch keeps it app-tier-pure (GH-17 DEC-1/DEC-3, INV-SEC-1: token never stored).

import type {
	AccountIdentity,
	AuthProviderOptions,
	ConfluenceCredentials,
} from "#domain/credentials";
import type { AuthError } from "#domain/errors";
import { Result } from "#domain/result";

const ENV_BASE_URL = "MARKSYNC_CONFLUENCE_BASE_URL";
const ENV_EMAIL = "MARKSYNC_USER_EMAIL";
const ENV_API_TOKEN = "MARKSYNC_API_TOKEN";

/** v2 "current user" — the sole MS-0002 validation endpoint (no v1 fallback). */
const USER_BY_ME_PATH = "/wiki/api/v2/user/by-me";

/** Max retries after a 429 before giving up (RSK-4 — bounded, never an open loop). */
const MAX_429_RETRIES = 2;

/**
 * Mask an email to its surfaceable form: `e[0] + "***" + @domain`
 * (e.g. `juliusz@host` → `j***@host`). Tolerant of malformed input: a missing
 * `@` (or empty local part) masks the whole address so no raw bytes leak.
 */
export function maskEmail(email: string): string {
	const at = email.indexOf("@");
	if (at <= 0) {
		return at < 0 ? "***" : `***${email.slice(at)}`;
	}
	return `${email.charAt(0)}***${email.slice(at)}`;
}

/**
 * Resolve Confluence classic API-token credentials from the canonical env vars
 * (`.env.example` is the single source of truth for the names). Pure env logic —
 * no network I/O, no injected `fetch`.
 *
 * Missing/empty var(s) → `MissingCredentials` naming every offender; a non-`https`
 * or host-less base URL → `InvalidBaseUrl`. On success the raw token is consumed
 * by `base64` and dropped — only the opaque `authHeader` and the masked email
 * survive (INV-SEC-1).
 */
export function resolveCredentials(): Result<ConfluenceCredentials, AuthError> {
	const baseUrl = process.env[ENV_BASE_URL];
	const email = process.env[ENV_EMAIL];
	const token = process.env[ENV_API_TOKEN];

	if (!baseUrl || !email || !token) {
		const missing: string[] = [];
		if (!baseUrl) missing.push(ENV_BASE_URL);
		if (!email) missing.push(ENV_EMAIL);
		if (!token) missing.push(ENV_API_TOKEN);
		return Result.err({
			kind: "Auth",
			authKind: "MissingCredentials",
			missing,
		});
	}

	if (!isHttpsUrl(baseUrl)) {
		return Result.err({ kind: "Auth", authKind: "InvalidBaseUrl", baseUrl });
	}

	// INV-SEC-1: the raw token lives only in this local, consumed by base64 —
	// it is never stored on the returned object or any error.
	const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
	const resolved: ConfluenceCredentials = {
		baseUrl,
		authHeader,
		email: maskEmail(email),
		mode: "api-token",
	};
	return Result.ok(resolved);
}

/**
 * Validate a resolved credential against Confluence's current-user endpoint via
 * the injected `fetch` (DEC-1). Returns the account identity on 200, or an
 * `AuthError`:
 *   - 401/403 → `InvalidCredentials` (NO retry — a bad token stays bad);
 *   - 429 → bounded backoff (`Retry-After` honored), then retry; budget
 *     exhausted → `AuthUnreachable`;
 *   - a thrown `fetch` (network/transport) or any other status →
 *     `AuthUnreachable` (no retry).
 */
export async function validateCredentials(
	creds: ConfluenceCredentials,
	options?: AuthProviderOptions,
): Promise<Result<AccountIdentity, AuthError>> {
	const doFetch = options?.fetch ?? fetch;
	const url = `${creds.baseUrl}${USER_BY_ME_PATH}`;

	for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
		const isLastAttempt = attempt === MAX_429_RETRIES;

		let response: Response;
		try {
			response = await doFetch(url, {
				method: "GET",
				headers: { Authorization: creds.authHeader },
			});
		} catch (e) {
			const cause = e instanceof Error ? e.message : String(e);
			return Result.err({ kind: "Auth", authKind: "AuthUnreachable", cause });
		}

		if (response.status === 401 || response.status === 403) {
			return Result.err({
				kind: "Auth",
				authKind: "InvalidCredentials",
				status: response.status,
			});
		}

		if (response.status === 429) {
			if (isLastAttempt) {
				return Result.err({
					kind: "Auth",
					authKind: "AuthUnreachable",
					cause: "rate-limited (HTTP 429) after retry budget exhausted",
				});
			}
			await backoff(response, attempt);
			continue;
		}

		if (response.status === 200) {
			return parseIdentity(response);
		}

		return Result.err({
			kind: "Auth",
			authKind: "AuthUnreachable",
			cause: `unexpected HTTP status ${response.status}`,
		});
	}

	// Unreachable in practice — the loop always returns. Defensive fallback.
	return Result.err({
		kind: "Auth",
		authKind: "AuthUnreachable",
		cause: "validation loop exited unexpectedly",
	});
}

async function parseIdentity(
	response: Response,
): Promise<Result<AccountIdentity, AuthError>> {
	let body: unknown;
	try {
		body = await response.json();
	} catch (e) {
		const cause = e instanceof Error ? e.message : String(e);
		return Result.err({ kind: "Auth", authKind: "AuthUnreachable", cause });
	}
	// Manual narrowing on the documented v2 fields (RSK-6 — `zod` lands in E3).
	if (body !== null && typeof body === "object") {
		const record = body as Record<string, unknown>;
		const accountId = record.accountId;
		const displayName = record.displayName;
		if (typeof accountId === "string" && typeof displayName === "string") {
			return Result.ok({ accountId, displayName });
		}
	}
	return Result.err({
		kind: "Auth",
		authKind: "AuthUnreachable",
		cause: "unexpected user/by-me response shape",
	});
}

/**
 * Wait before retrying a 429. Honors `Retry-After` (seconds, capped) when
 * present; otherwise a small exponential base. Kept bounded so the suite stays
 * fast and a runaway rate-limit cannot hang the probe (RSK-4).
 */
async function backoff(response: Response, attempt: number): Promise<void> {
	const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
	const baseMs = 50 * 2 ** attempt;
	const capMs = 5000;
	const delayMs =
		retryAfter !== null ? Math.min(retryAfter * 1000, capMs) : baseMs;
	if (delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
}

function parseRetryAfter(value: string | null): number | null {
	if (value === null) return null;
	const seconds = Number.parseInt(value, 10);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** `https:` protocol + non-empty host; no domain allowlist (RSK-5). */
function isHttpsUrl(value: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	return parsed.protocol === "https:" && parsed.host.length > 0;
}
