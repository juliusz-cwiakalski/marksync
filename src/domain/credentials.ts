// src/domain/credentials.ts
//
// Credential value types — the opaque auth header + masked email surface; the raw
// token is never a field (GH-17 DEC-2/INV-SEC-1).

/**
 * The resolved Confluence credential consumers receive (GH-17 DM-1).
 *
 * INV-SEC-1: the raw API token is NOT a field on this object — only the opaque
 * `authHeader` (`"Basic " + base64(email:token)`) survives `resolveCredentials`,
 * and `email` is the masked form (`j***@host`), never the raw address. The
 * adapter injects `authHeader` into every request and never sees the raw token.
 */
export interface ConfluenceCredentials {
	baseUrl: string;
	/** Opaque `"Basic …"` string — never serialized to any output path. */
	authHeader: string;
	/** Masked (`j***@host`) — never the raw email. */
	email: string;
	mode: "api-token";
}

/**
 * The success payload of `validateCredentials` — the current-user identity
 * parsed from Confluence's `GET /wiki/api/v2/user/by-me` (GH-17 DM-3).
 */
export interface AccountIdentity {
	accountId: string;
	displayName: string;
}

/**
 * The injected-`fetch` seam (GH-17 DEC-1). `validateCredentials` — the only
 * provider function doing network I/O — accepts this so the application module
 * stays free of infrastructure imports and unit-testable with a stub.
 * `resolveCredentials` is pure env logic and takes no `fetch`.
 */
export interface AuthProviderOptions {
	fetch?: typeof fetch;
}
