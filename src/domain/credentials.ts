// src/domain/credentials.ts
//
// Credential + identity value types for the Confluence auth provider (GH-17
// F-1/F-2). Domain-owned so the future infra adapter (E3-S4) can import them
// without dragging the application tier — the architecture matrix forbids
// `infra → app`.

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
 * provider function doing network I/O — accepts this so `src/app/credentials.ts`
 * imports no `#infra/*` and stays unit-testable with a stub. `resolveCredentials`
 * is pure env logic and takes no `fetch`.
 */
export interface AuthProviderOptions {
	fetch?: typeof fetch;
}
