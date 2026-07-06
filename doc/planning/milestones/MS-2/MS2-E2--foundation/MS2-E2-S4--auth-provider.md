---
id: MS2-E2-S4
title: "auth-provider"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: 1d
gh_issue: GH-17
feature_spec: doc/spec/features/feature-cli.md
decisions: []
dependencies: { blocks: [MS2-E3-S4], blocked_by: [MS2-E2-S1] }
cross_cutting: [R-SEC-1, NFR-SEC-6]
---

# MS2-E2-S4 — Auth provider (API-token from env)

## Goal
A credential provider that resolves Confluence API-token auth (email + token + base URL) from environment variables, validates it against Confluence, and NEVER leaks the token in any output path. `keytar` OS keyring is **deferred** (OPEN-Q8); env-token is the guaranteed MS-0002 path.

## Background
Auth is consumed by the Confluence adapter (E3-S4) and `doctor` (E5-S2). The MS-0001 spike validated classic API-token Basic auth over the direct site URL (H1 PASS). The provider must isolate credential resolution so the adapter just receives a ready auth header. R-SEC-1/NFR-SEC-6 require tokens to live only in env (or future keyring), never in project files.

## Detailed scope (deliverables)
1. **`src/app/credentials.ts`** — `CredentialProvider`:
   - `resolveCredentials(): Result<ConfluenceCredentials, AuthError>` reads `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_CONFLUENCE_EMAIL`, `MARKSYNC_CONFLUENCE_TOKEN` (and optional `MARKSYNC_CONFLUENCE_API_TOKEN_SCOPED` + `MARKSYNC_CONFLUENCE_CLOUD_ID` for the scoped/gateway path — informational; classic path is primary for MS-0002).
   - Returns `{ baseUrl, authHeader }` where `authHeader = "Basic " + base64(email:token)`.
   - Missing/empty required vars → `AuthError{kind:"MissingCredentials"; missing[]}` with AI-readable message listing which vars and how to set them.
   - Malformed `baseUrl` (not https, not a Confluence host) → `AuthError{kind:"InvalidBaseUrl"}`.
2. **Validation probe** — `validateCredentials(creds): Result<{accountId, displayName}, AuthError>` issues `GET /wiki/api/v2/user/by-me` (or v1 `user/current`) and returns the account identity on 200; maps 401/403 → `AuthError{kind:"InvalidCredentials"}`, network errors → `AuthError{kind:"AuthUnreachable"}`. **No retry on 401/403** (spike rule: don't retry blindly).
3. **Scoped-token awareness** — read the gateway path env vars; if classic token is absent but scoped+cloudId present, build the gateway base URL. Document that scoped-token scope-validation is deferred (spike deviation); classic path is primary.
4. **`AuthError`** added to `MarkSyncError` (exhaustive union update).
5. **Redaction integration** — the token is NEVER placed in any `CommandResult`, log, or thrown error. The provider returns an opaque `authHeader`; only `baseUrl`/`email` (masked: `j***@cwiakalski.com`) are safe to surface. Verify via the E2-S3 redactor tests.
6. **`doctor` integration point** — expose `validateCredentials` so `doctor` (E5-S2) can call it; this story implements the capability, doctor wires the UI.

## Technical approach
- Use `fetch` (native; no HTTP lib per typescript.md). `Authorization` header built once, cached on the credentials object.
- base64 via `Buffer.from(...).toString("base64")` (Bun supports) or `btoa`.
- The validation probe is the ONLY network call here; keep it minimal. Honor 429 with backoff (spike rule).
- Email masking: `maskEmail(e) = e[0] + "***" + e.slice(e.indexOf("@"))`.

## Interface contracts (what other stories consume)
- `resolveCredentials()` / `validateCredentials()` consumed by E3-S4 (adapter) and E5-S2 (doctor).
- `ConfluenceCredentials` type: `{ baseUrl; authHeader; email(masked); mode }`.
- The adapter receives `ConfluenceCredentials` and injects `authHeader` into every request — the adapter never sees the raw token.

## Acceptance criteria (testable)
- [ ] All three required env vars present + valid → `resolveCredentials` returns a credentials object with a `Basic ...` header.
- [ ] Any required var missing → `AuthError{kind:"MissingCredentials"}` naming the missing var(s) with a fix suggestion.
- [ ] `validateCredentials` against a mock 200 (`Bun.serve`) → returns account identity; against 401 → `InvalidCredentials`; against network error → `AuthUnreachable`.
- [ ] **INV-SEC-1:** no test path produces output containing the raw token — assert by capturing every `CommandResult`/thrown error string from the provider and grepping for the token substring.
- [ ] Email is masked in any surfaced message; token is never surfaced.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | resolve (present/missing/malformed-url), masking, header construction |
| Integration | validateCredentials against `Bun.serve` mock (200/401/403/429/network-error); assert no token in any captured output |

## Definition of Done
Credentials resolve from env; validate against Confluence (mocked); errors are AI-readable; no token ever leaks. AC list is the DoD.

## Out of scope
- `keytar` OS keyring (OPEN-Q8; deferred — env-token is the MS-0002 path).
- OAuth 2.0 / 3LO (post-MS-0002).
- Data Center PAT (MS-0009).
- Scoped-token scope-mismatch debugging (spike deviation; deferred until a correctly-scoped token exists).

## Risks / open questions (CEO-resolved)
- **R1:** A user sets the token in a way the shell doesn't export. → Error message links to `.env.example` and the CREDENTIALS doc; `doctor` (E5-S2) surfaces this clearly. CEO-recorded.
- **Q1:** Should the provider support a `--token-file` flag? → No for MS-0002 (env-only keeps the surface minimal); recorded for future.
