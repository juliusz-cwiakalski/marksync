---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-17
  type: feat
  status: Proposed
  slug: auth-provider
  title: "[MS2-E2-S4] Auth provider — Confluence API-token credentials from env, validated against Confluence, never leaked"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E2, foundation, critical, security]
  version_impact: minor
  audience: internal
  security_impact: high
  risk_level: medium
  dependencies:
    internal: [MS2-E2-S1 (GH-14), MS2-E2-S3 (GH-16), MS2-E3-S4 (blocked), MS2-E5-S2 (blocked)]
    external: [Atlassian Confluence Cloud REST API (v2 user/by-me)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Build the credential provider that resolves Confluence API-token auth (base URL + email + token) from the canonical environment variables, validates it against Confluence, and returns a ready-to-use opaque auth header — isolating credential resolution so the Confluence adapter (MS2-E3-S4) and `doctor` (MS2-E5-S2) consume a resolved credential and never touch the raw token, while the token is structurally incapable of reaching any output path (INV-SEC-1 / NFR-SEC-1/2/6).

## 1. SUMMARY

This is the **fourth and final story of epic MS2-E2 (Foundation)**. It delivers the application-tier credential provider that the rest of MS-0002 depends on for identity: `resolveCredentials()` reads the three canonical env vars declared in `.env.example`, builds an opaque `Basic <base64(email:token)>` header, and returns it alongside the base URL; `validateCredentials()` probes Confluence's "current user" endpoint and returns the account identity or a typed `AuthError`.

The provider is the security-critical chokepoint for credential lifecycle in MS-0002: the **raw token is never stored on any returned object, never placed in any `CommandResult`/log/error, and never the only thing standing between a leak and output** — only the base URL and a masked email (`j***@cwiakalski.com`) are surfaceable. This story also adds the `AuthError` arm to the `MarkSyncError` discriminated union (an exhaustive update of `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT`), and resolves two technical decisions the story delegates to delivery: (a) an **injected `fetch` seam** keeps the application-tier provider pure and unit-testable without `Bun.serve` (DEC-1); (b) a **single `Auth` arm with a discriminated `authKind`** keeps the union scannable while preserving per-case agent operability (DEC-2).

The classic API-token + direct-site-URL path is the **guaranteed** MS-0002 auth mechanism (validated PASS in the MS-0001 spike, H1). OS keyring (`keytar`), OAuth 2.0 / 3LO, scoped tokens, Data Center PAT, and `--token-file` are explicitly deferred.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-14 (MS2-E2-S1), GH-15 (MS2-E2-S2), and GH-16 (MS2-E2-S3) are merged.** The codebase has the strict TS+Bun toolchain with binding dep-cruiser tier enforcement, the `Result<T, E>` primitive (`src/domain/result.ts`), the **13-kind** `MarkSyncError` discriminated union + `assertNeverMarkSyncError` `never`-check (`src/domain/errors.ts`), the application-tier `mapMarkSyncErrorToCommandError` exhaustive switch (`src/app/cli-error-map.ts`), the presentation-tier `CODE_TO_EXIT` map + `codeToExitCode` (`src/cli/output/exit-codes.ts`), the `CommandResult<T>` envelope, the centralized `Redactor` (`src/cli/output/redact.ts`), and the `OutputService` chokepoint.
- **No credential provider exists.** `src/app/` holds config plumbing only (`config.ts`, `config-errors.ts`, `config-template.ts`, `document-config.ts`, `cli-error-map.ts`) — there is no `credentials.ts`, no env-var resolution for auth, and no validation probe. The Confluence adapter (MS2-E3-S4) and `doctor` (MS2-E5-S2) both depend on this provider landing first.
- **The auth-class exit code already exists.** `EXIT_AUTH = 20` is defined and `FORBIDDEN` already maps to it (a per-page authorization denial). The auth *credential* failures introduced here are a distinct semantic cluster (identity/credential resolution vs. per-page operation denial) but share the auth exit class.
- **`.env.example` is the single source of truth for env-var names.** The three required auth vars — `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` — are already declared there (classic/direct auth, the guaranteed MS-0002 path). No `*_SCOPED` / `*_CLOUD_ID` / OAuth / PAT vars are read in MS-0002.
- **The redaction layer (GH-16) is the defense-in-depth backstop.** Its patterns already scrub `Basic <token>` / `Authorization:` / `ATATT…` / `MARKSYNC_*_TOKEN` values >20 chars / auth-context emails. The provider must never rely on it as the *primary* defense — the token must never reach the output path in the first place (security-baseline.md).
- **The MS-0001 spike established the binding probe rules.** Classic API-token Basic auth over the direct site URL works (H1 PASS); a scoped token authenticated but lacked scopes (the spike deviation — deferred); **do not retry 401/403**; **honor 429 with backoff**.
- **CEO-resolved items are binding.** Q1 (`--token-file`): **No** for MS-0002 — env-only keeps the surface minimal. OPEN-Q8 (`keytar`): **deferred** — env-token is the guaranteed MS-0002 path. R1 (non-exported token): the `MissingCredentials` message links `.env.example` and the CREDENTIALS doc; `doctor` (MS2-E5-S2) surfaces this clearly.

### 2.2 Pain Points / Gaps

- **No credential isolation.** Without a provider, every consumer (adapter, `doctor`) would read env vars and assemble auth headers ad hoc — duplicating the masking, base64, and "never log the token" discipline in N places, with inevitable drift and a leak the moment one consumer forgets.
- **No validation before first real write.** `doctor` (MS2-E5-S2) and the operator need to know "are my credentials valid and is Confluence reachable?" *before* a sync attempts a real mutation. Without `validateCredentials`, the first sign of a bad token is a cryptic failure mid-sync.
- **No typed `AuthError` in the error model.** Credential failure has no place in the `MarkSyncError` union, so it cannot flow through the established `kind → error.code → exitCode` pipeline that GH-16 made the contract for every command. Adding it is an exhaustive update (three sites), not a localized patch.
- **An app-tier network-I/O tension.** The story places the provider at `src/app/credentials.ts` (application tier), but `validateCredentials` issues a network request. A hard dependency on a concrete infra HTTP client (or a `Bun.serve`-bound test) would violate the ports-and-adapters discipline and the testing-strategy over-mocking guardrail. This must be resolved by design (DEC-1) before delivery.
- **A union-shape choice.** The four auth failure cases (missing creds / bad URL / bad creds / unreachable) have distinct recovery actions and distinct `retryable` semantics. They could be four top-level `MarkSyncError` kinds or one arm with a sub-discriminator. The choice ripples through `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT`; it must be made once, consistently (DEC-2).

## 3. PROBLEM STATEMENT

Because there is no isolated credential provider, no validation probe, and no typed auth error in the error model, the Confluence adapter and `doctor` cannot obtain a ready-to-use, never-leaked auth header from the canonical env vars — and any consumer that hand-rolls env resolution risks leaking the raw token into output — so this story must build the application-tier credential provider once, with an injected network seam and a secret-isolation contract, before any real Confluence I/O (MS2-E3-S4) or health check (MS2-E5-S2) can be delivered.

## 4. GOALS

- **G-1**: Deliver `resolveCredentials()` — reads the three canonical env vars, returns `Result<ConfluenceCredentials, AuthError>` carrying `{ baseUrl, authHeader (opaque), email (masked), mode }`; missing/empty vars → `MissingCredentials` naming the offenders; malformed base URL → `InvalidBaseUrl`.
- **G-2**: Deliver `validateCredentials(creds)` — probes Confluence's "current user" endpoint via an injected `fetch` and returns `Result<ConfluenceIdentity, AuthError>`; 200 → `{ accountId, displayName }`; 401/403 → `InvalidCredentials` (no retry); network error → `AuthUnreachable`; 429 → backoff per the spike rule.
- **G-3**: Add the `AuthError` arm to `MarkSyncError` and exhaustively extend `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT` so the union's `never`-check integrity holds (DEC-2).
- **G-4**: Guarantee secret isolation by construction — the raw token is never stored on any returned object, never placed in any `CommandResult`/log/error; only `baseUrl` and a masked email are surfaceable (DEC-3).
- **G-5**: Provide the injected `fetch` seam so the provider stays in the application tier, is unit-testable without `Bun.serve`, and depends on no infrastructure module (DEC-1).
- **G-6**: Expose `validateCredentials` as the capability `doctor` (MS2-E5-S2) will call — this story delivers the capability; doctor wires the UI in its own story.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Resolution success | all three env vars present + valid → `resolveCredentials` returns a credentials object whose `authHeader` starts with `Basic ` |
| Missing-var precision | any required var missing → `AuthError.authKind === "MissingCredentials"` and the message names **every** missing var and links `.env.example` |
| Validation mapping | mock 200 → identity `{ accountId, displayName }`; mock 401 → `InvalidCredentials`; mock network error → `AuthUnreachable`; mock 403 → `InvalidCredentials` (no retry attempted) |
| Token-leak invariant (INV-SEC-1) | a synthetic token captured across **every** `CommandResult`/thrown-error string the provider can produce yields **0** substring matches for the raw token |
| Email masking | every surfaced message containing the email uses the masked form (`e[0] + "***" + @domain`); the raw email appears in **0** surfaced strings |
| Union integrity | `bun run check` (incl. dep-cruiser) exits 0 with the new arm present in all three exhaustive sites |
| App-tier purity | `validateCredentials` is unit-testable with an injected mock `fetch` — **0** `Bun.serve` calls in the unit tier |
| No-retry-on-auth | a mock 401/403 is fetched **exactly once** (no retry); a mock 429 triggers backoff |

### 4.2 Non-Goals

- **NG-1**: OS keyring via `keytar` (OPEN-Q8) — deferred; env-token is the guaranteed MS-0002 path. The provider's seam (DEC-1) is shaped so a future keyring source can be added, but no keyring code is written.
- **NG-2**: OAuth 2.0 / 3LO — post-MS-0002.
- **NG-3**: Data Center PAT — MS-0009.
- **NG-4**: Scoped-token scope-mismatch debugging (the MS-0001 spike deviation) — deferred until a correctly-scoped token exists. No `*_SCOPED` / `*_CLOUD_ID` vars are read in MS-0002.
- **NG-5**: A `--token-file` flag — CEO-resolved **No** for MS-0002 (Q1); env-only keeps the surface minimal.
- **NG-6**: The `doctor` UI/wiring — this story exposes `validateCredentials` as a capability; MS2-E5-S2 builds the command, formatter, and user-facing diagnostics around it.
- **NG-7**: The full Confluence REST adapter (CRUD, pages, attachments) — MS2-E3-S4. This story builds the credential the adapter *consumes*, plus a single minimal probe endpoint; it is not the adapter.
- **NG-8**: The v1 `user/current` fallback — **deferred** (PM decision, DoR iter-1). v2 `user/by-me` is the sole MS-0002 validation endpoint; one network call = fewer failure modes and v2 is the current documented endpoint. The v1 fallback is added only if a tenant/credential lacks v2 access (DEC-5, RSK-6).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | `resolveCredentials()` — env → credentials | Reads the canonical env vars and returns an opaque, ready-to-use credential. Centralizes base64 + masking + "never surface the token" so no consumer re-implements it. |
| F-2 | `validateCredentials()` — probe Confluence | Confirms the credential works *before* a real mutation. Returns account identity or a typed auth error; honors the spike's no-retry-on-401/403 and 429-backoff rules. |
| F-3 | `AuthError` domain-error arm (exhaustive) | Gives credential failure a place in the `MarkSyncError` pipeline so it flows through the established `kind → code → exitCode` contract (DEC-2). |
| F-4 | Secret isolation by construction | The raw token never lives on a returned object and never reaches any output path; only `baseUrl` + masked email are surfaceable. The redaction layer is defense-in-depth, not the primary defense. |
| F-5 | Injected `fetch` seam (port) | Keeps the provider in the application tier, pure, and unit-testable without `Bun.serve`; depends on no infrastructure module (DEC-1). |
| F-6 | `doctor` integration point | Exposes `validateCredentials` as the capability `doctor` (MS2-E5-S2) will call — capability now, UI later. |

### 5.1 Capability Details

- **F-1 (`resolveCredentials`).** Reads `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` (the canonical names in `.env.example` — the single source of truth). A var that is unset *or* empty-after-trim counts as missing. Returns `{ baseUrl, authHeader, email (masked), mode: "api-token" }`:
  - `authHeader` = `"Basic " + base64("<email>:<token>")` — an **opaque secret string**, never serialized to any output.
  - `email` is stored **masked** (`e[0] + "***" + e.slice(e.indexOf("@"))`); the raw email is used transiently to build the header and then only the masked form is retainable from the object.
  - `baseUrl` is normalized and surfaceable.
  - The **raw token is not a field on the object.**
  - Missing/empty vars → `AuthError { authKind: "MissingCredentials", missing: [<var names>] }`; the surfaced message lists every missing var and links `.env.example`.
  - Malformed `baseUrl` (not `https://`, or not a Confluence host shape) → `AuthError { authKind: "InvalidBaseUrl" }`.

- **F-2 (`validateCredentials`).** Issues `GET /wiki/api/v2/user/by-me` — the **sole** MS-0002 validation endpoint (no v1 fallback) — via the **injected `fetch`** (DEC-1, DEC-5). On HTTP 200 it returns `{ accountId, displayName }` parsed from the response. On 401/403 it returns `AuthError { authKind: "InvalidCredentials" }` and **does not retry** (spike rule — don't retry a bad token). On a network/transport error it returns `AuthError { authKind: "AuthUnreachable" }`. On 429 it honors the spike's backoff rule (bounded, single retry-with-backoff, not an open-ended loop). The probe is the **only** network call in this story; the response body beyond the identity fields is not retained.

- **F-3 (`AuthError` arm — DEC-2).** A single new top-level arm is added to `MarkSyncError`: `{ kind: "Auth"; authKind: "MissingCredentials" | "InvalidBaseUrl" | "InvalidCredentials" | "AuthUnreachable"; …payload }`. `AuthError` is exposed as a narrowed channel alias `Extract<MarkSyncError, { kind: "Auth" }>` (mirroring `ConfigError`), so the provider declares `Result<ConfluenceCredentials, AuthError>` / `Result<ConfluenceIdentity, AuthError>` with full precision. The three exhaustive sites — `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, `CODE_TO_EXIT` — are extended consistently so the `never`-check stays intact.

- **F-4 (Secret isolation).** The contract is structural, not conventional: (1) no field on `ConfluenceCredentials` holds the raw token — only the opaque `authHeader`; (2) `resolveCredentials`/`validateCredentials` never place the token (or the raw email) into any `CommandResult`, warning, log, or thrown error string; (3) only `baseUrl` and the masked email are safe to surface; (4) the redaction layer (GH-16) is the backstop that scrubs a `Basic <token>` should one ever reach a serialized string — but by construction none should. The token-leak invariant (INV-SEC-1) is verified by capturing every output path the provider can produce and asserting **0** substring matches for the raw token.

- **F-5 (Injected `fetch` seam — DEC-1).** `resolveCredentials`/`validateCredentials` accept an injectable `fetch`-shaped function (defaulting to the global `fetch`) as their network seam. The provider imports only `#domain/*` (Result, errors) — never `#infra/*`. The Confluence adapter (MS2-E3-S4, infra) is a *consumer* of the resolved credential, so there is no app→infra dependency to introduce. Unit tests pass a deterministic mock `fetch`; the `Bun.serve` HTTP mock is used only at the integration tier, exactly as the testing-strategy table prescribes for the credential provider.

- **F-6 (`doctor` integration point).** `validateCredentials` is an exported capability with a stable signature returning `Result<ConfluenceIdentity, AuthError>`. MS2-E5-S2 wraps it in the `doctor` command, formats the result (success → identity; failure → remediation hint), and surfaces R1 (non-exported token) clearly. No `doctor` UI is built in this story.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Resolve credentials (happy path):
  Operator/CI sets MARKSYNC_CONFLUENCE_BASE_URL / MARKSYNC_USER_EMAIL / MARKSYNC_API_TOKEN
    → resolveCredentials() reads the three vars
    → validates baseUrl is https:// + Confluence-host-shaped
    → builds authHeader = "Basic " + base64(email:token); masks email
    → returns Ok(ConfluenceCredentials{ baseUrl, authHeader, email(masked), mode:"api-token" })
  The raw token is consumed inside base64 and never stored on the returned object.

Flow 2 — Resolve credentials (missing var):
  CI forgot to export MARKSYNC_API_TOKEN
    → resolveCredentials() detects the empty/missing var(s)
    → returns Err(AuthError{ authKind:"MissingCredentials", missing:["MARKSYNC_API_TOKEN"] })
    → surfaced message names the var(s) and links .env.example (R1).
  No token ever existed to leak.

Flow 3 — Validate credentials (happy / 401 / network):
  Adapter or doctor calls validateCredentials(creds, { fetch })
    → injected fetch GETs /wiki/api/v2/user/by-me with the opaque authHeader
    → 200  → Ok({ accountId, displayName })
    → 401  → Err(AuthError{ authKind:"InvalidCredentials" }) — fetched exactly once, no retry
    → net  → Err(AuthError{ authKind:"AuthUnreachable" })
    → 429  → bounded backoff, then one retry (spike rule)
  The response body beyond {accountId, displayName} is not retained.

Flow 4 — Error flows through the GH-16 output contract:
  provider returns Result.err(AuthError)
    → application tier maps kind:"Auth" + authKind → { code, message(redacted), retryable }
    → CODE_TO_EXIT[code] === EXIT_AUTH (20)
    → OutputService redacts + renders → process.exit(20). No token in any output.

Flow 5 — doctor (later, MS2-E5-S2) consumes the capability:
  doctor handler calls validateCredentials(creds)
    → on Ok: renders account identity; on Err: maps authKind to a remediation hint.
  This story only provides the capability; the handler lands in MS2-E5-S2.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `resolveCredentials()` returning `Result<ConfluenceCredentials, AuthError>` from the canonical env vars (F-1).
- `validateCredentials(creds)` returning `Result<ConfluenceIdentity, AuthError>` with the 200/401/403/network/429 mapping and the no-retry-on-auth + 429-backoff spike rules (F-2).
- The `AuthError` arm on `MarkSyncError` + the `AuthError` narrowed alias, and the exhaustive extension of `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT` (F-3, DEC-2).
- Secret-isolation-by-construction: opaque `authHeader`, masked-only email, raw token never on the object / never in output (F-4, DEC-3).
- The injected `fetch` seam and the app-tier purity guarantee (F-5, DEC-1).
- `validateCredentials` exposed as the `doctor` capability (F-6).

### 7.2 Out of Scope

- [OUT] `keytar` OS keyring (OPEN-Q8 — deferred; env-token is the guaranteed MS-0002 path) (NG-1).
- [OUT] OAuth 2.0 / 3LO (post-MS-0002) (NG-2).
- [OUT] Data Center PAT (MS-0009) (NG-3).
- [OUT] Scoped-token scope-mismatch debugging + reading `*_SCOPED` / `*_CLOUD_ID` vars (NG-4).
- [OUT] A `--token-file` flag (CEO-resolved **No** for MS-0002, Q1) (NG-5).
- [OUT] The `doctor` command, formatter, and user-facing diagnostics (MS2-E5-S2) (NG-6).
- [OUT] The full Confluence REST adapter / CRUD surface (MS2-E3-S4) (NG-7).
- [OUT] v1 `user/current` fallback (deferred — v2 `user/by-me` is the sole MS-0002 validation endpoint; add v1 only if a tenant/credential lacks v2) (NG-8).

### 7.3 Deferred / Maybe-Later

- **Keyring source behind the same seam** — the injected-source shape (DEC-1 generalized) lets a future keyring provider slot in without changing consumers; revisit when OPEN-Q8 is addressed.
- **Token refresh / expiry handling** — relevant once OAuth lands (post-MS-0002).
- **Configurable probe endpoint / timeout** — v2 `user/by-me` is the sole fixed probe for MS-0002; make it configurable only if a target variant needs it.
- **v1 `user/current` fallback** — deferred (NG-8); v2 `user/by-me` is the sole MS-0002 validation endpoint (PM decision, DoR iter-1). Add the v1 fallback only if a tenant/credential lacks v2 access (DEC-5, RSK-6).
- **`--token-file`** — recorded for future (Q1); env-only for MS-0002.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

Consumed (read-only probe) — no endpoints are *exposed* by this story:

| Method | Path | Purpose | On success | On failure |
|--------|------|---------|-----------|-----------|
| `GET` | `/wiki/api/v2/user/by-me` | Validate the credential + return current-user identity (the **sole** MS-0002 validation endpoint — no v1 fallback, DEC-5) | 200 → `{ accountId, displayName }` | 401/403 → `InvalidCredentials` (no retry); 429 → backoff; other → mapped |

The probe is issued through the injected `fetch` (DEC-1) with the opaque `Authorization: <authHeader>` header. Only the identity fields are retained from the response.

### 8.2 Events / Messages

N/A — no events or messages are introduced. Auth is a synchronous request/response probe.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `ConfluenceCredentials` | `{ baseUrl: string; authHeader: string; email: string (masked); mode: "api-token" }`. `authHeader` is an **opaque secret** — never serialized to output. `email` is the masked form only; the raw email is not retained. The raw token is **not** a field. |
| DM-2 | `AuthError` arm + `authKind` discriminator | New top-level arm `{ kind: "Auth"; authKind: "MissingCredentials" \| "InvalidBaseUrl" \| "InvalidCredentials" \| "AuthUnreachable"; …payload }` on `MarkSyncError`. `MissingCredentials` carries `missing: string[]`; the others carry only surfaceable context. `AuthError = Extract<MarkSyncError, { kind: "Auth" }>` is the narrowed channel alias (mirrors `ConfigError`). (DEC-2) |
| DM-3 | `AccountIdentity` | `{ accountId: string; displayName: string }` — the success payload of `validateCredentials`, parsed from the probe response. Implemented as `AccountIdentity` in `src/domain/credentials.ts` (the canonical name — Confluence's "current user" endpoint returns account fields; the story/plan referred to this type as `ConfluenceIdentity`). |
| DM-4 | New `error.code` strings + exit-code mapping | Four stable presentation-layer codes emitted by the mapper's `Auth` case, each → `EXIT_AUTH` (20): `AUTH_MISSING_CREDENTIALS` (retryable false), `AUTH_INVALID_BASE_URL` (false), `AUTH_INVALID_CREDENTIALS` (false — no retry on 401/403), `AUTH_UNREACHABLE` (true). Added to `CODE_TO_EXIT`. (DEC-2 / DEC-6 of GH-16) |

> Note: `Result<T, E>` and `MarkSyncError` (GH-14/GH-15) are reused; this story adds **one** domain error arm and the presentation-layer mapping for it. It does not alter the existing 13 kinds.

### 8.4 External Integrations

**Atlassian Confluence Cloud REST API** — the only external system contacted, via the read-only "current user" probe (v2 `/wiki/api/v2/user/by-me` — the sole MS-0002 validation endpoint; the v1 `user/current` fallback is deferred, NG-8). Classic API-token Basic auth over the direct site URL (the MS-0001 spike PASS path). No new runtime dependencies are introduced: native `fetch` is used (typescript.md — no HTTP library). No OAuth, no PAT, no scoped-token paths are exercised in MS-0002.

### 8.5 Backward Compatibility

N/A for released artifacts — MS-0002 is pre-release (v0.0.0). Extending `MarkSyncError` is an **additive** change: the new `Auth` arm is appended; the existing 13 kinds and their mappings are unchanged. The new `error.code` strings are net-new keys in `CODE_TO_EXIT` (all → the already-existing `EXIT_AUTH` 20); unknown codes already fall back to `EXIT_INTERNAL` via `codeToExitCode`, so a consumer built before this story degrades safely. The `ConfluenceCredentials` / `ConfluenceIdentity` / `AuthError` types are new — no existing consumer breaks.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Resolution completeness | all three env vars present + a valid `https://` Confluence-host `baseUrl` → `resolveCredentials` returns `Ok` with `authHeader` starting `"Basic "` |
| NFR-2 | Missing-var precision | any required var unset/empty → `authKind === "MissingCredentials"`; the message names **every** missing var and contains a reference to `.env.example` |
| NFR-3 | Base-URL validation | a non-`https://` or non-Confluence-host `baseUrl` → `authKind === "InvalidBaseUrl"` |
| NFR-4 | Validation mapping | mock 200 → `{ accountId, displayName }`; mock 401 → `InvalidCredentials`; mock 403 → `InvalidCredentials`; mock network error → `AuthUnreachable` |
| NFR-5 | Token-leak invariant (INV-SEC-1) | a synthetic token, captured across **every** `CommandResult`/thrown-error string the provider can produce, yields **0** substring matches for the raw token |
| NFR-6 | Email masking | every surfaced message containing the email uses `e[0] + "***" + @domain`; the raw email appears in **0** surfaced strings |
| NFR-7 | No-retry-on-auth | a mock 401/403 is fetched **exactly once** (0 retries); a mock 429 triggers bounded backoff (≥1 backoff-and-retry, no open-ended loop) |
| NFR-8 | App-tier purity | `validateCredentials` is unit-testable with an injected mock `fetch` — **0** `Bun.serve` calls in the unit tier; the provider imports **no** `#infra/*` module |
| NFR-9 | Union integrity | `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT` are all extended for the new arm; dep-cruiser (`check:boundaries`) exits 0 |
| NFR-10 | Provider processing latency | `resolveCredentials` (env read + base64 + masking) completes in **≤ 10 ms (p95)** on reference hardware (network-free) |
| NFR-11 | Quality gate | `bun run check` (lint + typecheck + test + boundaries) exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 — no outbound telemetry; the only remote call is the configured Confluence target). Observability for auth flows through the established GH-16 contract: every auth failure surfaces as `CommandResult.error: { code, message, retryable }` with a **stable** `code` (DM-4 — agents key on `code` per NFR-OBS-3), a **redacted** `message`, and a `retryable` flag the caller/agent can act on (only `AUTH_UNREACHABLE` is retryable). Per typescript.md logging conventions, no raw `AuthError` object is serialized to logs — only structural identifiers (`{ kind: "Auth", authKind }`); the masked email and `baseUrl` are the only credential-adjacent values safe to log, and the raw token is never logged under any circumstance.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | App-tier network-I/O tension: `validateCredentials` does network I/O but lives in `src/app/`, risking a concrete infra coupling or a `Bun.serve`-bound unit test | H | M | Inject the `fetch` seam (DEC-1): the provider depends on a `fetch`-shaped port defaulting to global `fetch`, imports only `#domain/*`, and the Confluence adapter (infra) is a *consumer* of the credential — so no app→infra dependency exists. Unit tests inject a mock; `Bun.serve` stays in the integration tier (NFR-8). | L |
| RSK-2 | Union-shape choice ripples inconsistently: adding auth errors could break the `never`-check or leave `CODE_TO_EXIT`/the mapper out of sync | H | M | Adopt ONE arm with a discriminated `authKind` (DEC-2) and extend all three exhaustive sites (`assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, `CODE_TO_EXIT`) in the same change; `bun run check` (incl. typecheck) gates it (NFR-9). | L |
| RSK-3 | Token leak via the opaque `authHeader` reaching a `CommandResult`, warning, log, or error string | H | M | Secret isolation by construction (F-4/DEC-3): the raw token is not a field on the object; `resolveCredentials`/`validateCredentials` never place it in any output path; only `baseUrl` + masked email are surfaceable. The redaction layer (GH-16) is the backstop. Verified by capturing every output path and asserting 0 token matches (NFR-5). | L |
| RSK-4 | Operator sets the token in a way the shell doesn't export (R1) | M | M | `MissingCredentials` message names the missing var(s) and links `.env.example` + the CREDENTIALS doc; `doctor` (MS2-E5-S2) surfaces this clearly. CEO-recorded. | L |
| RSK-5 | Scoped-token/gateway confusion (the MS-0001 spike deviation) bleeds into MS-0002 | M | L | Explicitly out of scope (NG-4): no `*_SCOPED` / `*_CLOUD_ID` vars are read; classic API-token is the only supported path. A `403` from a scoped token surfaces as `InvalidCredentials` with a stable code, not a debugging path. | L |
| RSK-6 | A tenant/credential lacks access to v2 `/user/by-me`, masking a valid token as `InvalidCredentials` | M | L | v2 `user/by-me` is the **sole** MS-0002 validation endpoint (PM decision, DoR iter-1); if a tenant/credential lacks v2, that is a post-MS-0002 follow-up — the v1 `user/current` fallback is deferred (NG-8), not built here. The single v2 path is exercised against the `Bun.serve` mock in integration. | L |
| RSK-7 | 429 storm / retry loop against Confluence | M | L | Bounded single backoff-and-retry on 429 per the spike rule (NFR-7); no retry on 401/403; no open-ended loop. | L |
| RSK-8 | A new auth sub-case is added later but a handler forgets its `authKind` branch | M | L | The `authKind` union is itself exhaustively checked at the message/code-construction site (nested `never`-check), so adding a sub-case is a compile error until handled (mirrors the top-level discipline). | L |

## 12. ASSUMPTIONS

- GH-14 (MS2-E2-S1), GH-15 (MS2-E2-S2), and GH-16 (MS2-E2-S3) are merged and provide `Result<T, E>`, the 13-kind `MarkSyncError` union + `assertNeverMarkSyncError`, the `mapMarkSyncErrorToCommandError` exhaustive switch, the `CODE_TO_EXIT` map + `codeToExitCode`, the `CommandResult<T>` envelope, the `Redactor`, and the `OutputService` — all reusable unchanged except the additive `Auth` arm.
- `.env.example` is the single source of truth for env-var names; the three auth vars are already declared there.
- The MS-0001 spike rules are binding: classic API-token Basic auth over the direct site URL works; **do not retry 401/403**; **honor 429 with backoff**; scoped tokens are a deferred deviation.
- The CEO-resolved items are binding: `--token-file` is **No** for MS-0002 (Q1); `keytar` is deferred (OPEN-Q8); R1 (non-exported token) is handled via the `MissingCredentials` message + `doctor`.
- Native `fetch` is used (typescript.md — no HTTP library); base64 via `Buffer.from(...).toString("base64")` / `btoa` (Bun-supported).
- The presentation tier (`src/cli/`) is not touched by this story except indirectly through the additive `CODE_TO_EXIT` keys; auth errors flow to it only via the stable `error.code` string (DEC-6 of GH-16).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) | Provides `Result<T,E>`, `MarkSyncError`/`assertNeverMarkSyncError`, the TS+Bun toolchain, dep-cruiser enforcement, binding CI. Merged. |
| Depends on | MS2-E2-S3 (GH-16) | Provides the `mapMarkSyncErrorToCommandError` exhaustive switch, `CODE_TO_EXIT`/`codeToExitCode`/`EXIT_AUTH`, the `CommandResult<T>` envelope, the `Redactor` (defense-in-depth backstop), and the `OutputService` chokepoint. Merged. |
| Depends on | security-baseline.md | Credential-storage rules (NFR-SEC-6), redaction-layer architecture, "credentials never reach the output path by construction". |
| Depends on | nonfunctional.md | NFR-SEC-1/SEC-2/SEC-6, INV-SEC-1, NFR-OBS-1/OBS-3. |
| Depends on | typescript.md | Tier rules, `Result<T,E>`, native-`fetch` rule, "a dependency mocked in >1 unrelated test → consider an interface boundary (port)". |
| Depends on | Atlassian Confluence Cloud REST API | The read-only probe target (v2 `user/by-me` — sole MS-0002 validation endpoint). |
| Blocks | MS2-E3-S4 (Confluence adapter) | Consumes the resolved `ConfluenceCredentials` (the adapter injects `authHeader` into every request and never sees the raw token). |
| Blocks | MS2-E5-S2 (`doctor`) | Calls `validateCredentials` to report auth health. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the provider support OS keyring (`keytar`) now? | OPEN-Q8; spike-gated because `keytar` is a native module that may conflict with `bun build --compile`. | Resolved for MS-0002: **deferred** — env-token is the guaranteed path. The injected-source seam (DEC-1 generalized) is shaped so a future keyring source can slot in without changing consumers. |
| OQ-2 | Should the provider support a `--token-file` flag? | Some CI toolchains prefer a file path over an env var. | Resolved for MS-0002: **No** (CEO Q1) — env-only keeps the surface minimal. Recorded for future. |

> Both open questions are CEO-resolved and binding for MS-0002; neither requires `@decision-advisor` escalation. They are recorded here for traceability and to scope-defer the corresponding capabilities.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Injected `fetch` seam (resolves the app-tier network-I/O tension).** `resolveCredentials`/`validateCredentials` accept an injectable `fetch`-shaped function (defaulting to the global `fetch`) as their network seam. The provider imports only `#domain/*` (Result, errors) — never `#infra/*`. | The story places the provider at `src/app/credentials.ts` (application tier) but `validateCredentials` issues a network request. The ports-and-adapters matrix permits *app → infra via ports only*; the Confluence adapter (MS2-E3-S4, infra) is a *consumer* of the credential, so no app→infra dependency is needed. Injecting `fetch` keeps the provider pure, unit-testable without `Bun.serve` (the testing-strategy over-mocking guardrail + the "mocked in >1 test → make it a port" heuristic), and decouples the probe from the not-yet-built adapter. The `Bun.serve` HTTP mock is used only at the integration tier, exactly as the testing-strategy table prescribes for the credential provider. | 2026-07-08 |
| DEC-2 | **Single `Auth` arm with a discriminated `authKind` (resolves the union-shape choice).** One new top-level arm `{ kind: "Auth"; authKind: "MissingCredentials" \| "InvalidBaseUrl" \| "InvalidCredentials" \| "AuthUnreachable"; …payload }` is added to `MarkSyncError`, rather than four separate top-level kinds. `AuthError = Extract<MarkSyncError, { kind: "Auth" }>` is the narrowed channel alias. The mapper's `Auth` case narrows on `authKind` to emit four stable per-case `error.code`s (`AUTH_MISSING_CREDENTIALS`, `AUTH_INVALID_BASE_URL`, `AUTH_INVALID_CREDENTIALS`, `AUTH_UNREACHABLE`), each → `EXIT_AUTH` (20); `retryable` is per-case (only `AUTH_UNREACHABLE` is true). | Four new top-level kinds would balloon the union 13→17 and force four cases in each of the three exhaustive sites for one cohesive "credential failed" cluster. The GH-15 `InvalidConfig` precedent — one kind carrying structured `ajvErrors[]` + `humanMessage` rather than one kind per ajv keyword — is the governing pattern: one `Auth` kind carrying a structured `authKind` payload. The top-level `kind` governs exit-class routing (all auth → 20); `authKind` governs the specific remediation/code/retryable. The `authKind` union is itself exhaustively checked at the code/message-construction site, so adding a sub-case stays a compile error until handled (RSK-8). The story's `AuthError{kind:"MissingCredentials"}` notation maps to `{ kind:"Auth", authKind:"MissingCredentials", missing:[] }`. | 2026-07-08 |
| DEC-3 | **Secret isolation by construction: opaque `authHeader` + masked-only email.** The raw token is never a field on `ConfluenceCredentials`; `resolveCredentials`/`validateCredentials` never place the token (or raw email) into any `CommandResult`, warning, log, or thrown error; only `baseUrl` and the masked email are surfaceable. | INV-SEC-1 / NFR-SEC-1/2 require that no secret appear in any output path. security-baseline.md makes the redaction layer defense-in-depth, **not** the primary defense. Carrying only the opaque header (never the raw token) and the masked email means there is structurally nothing to leak from the provider; the redactor is the backstop that scrubs a stray `Basic <token>`. | 2026-07-08 |
| DEC-4 | **Classic API-token only for MS-0002.** Only `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` are read; no `*_SCOPED` / `*_CLOUD_ID` / OAuth / PAT paths. | The MS-0001 spike validated classic Basic auth over the direct site URL (PASS) and exposed the scoped-token deviation (a scoped token authenticated but lacked scopes). Classic API-token is the guaranteed MS-0002 path; the rest is deferred (NG-1..NG-4). | 2026-07-08 |
| DEC-5 | **Probe strategy: v2 `user/by-me` is the sole MS-0002 validation endpoint (no v1 fallback); no retry on 401/403; bounded 429 backoff.** | MS-0002 MVP minimal surface: v2 is the current documented "current user" endpoint, the story's "(or v1 user/current)" reads as an acceptable alternative rather than a mandatory dual-path fallback, and one network call = fewer failure modes. The v1 `user/current` fallback is explicitly deferred (NG-8) — add it only if a tenant/credential lacks v2 (PM decision, DoR iter-1). The MS-0001 spike rules are otherwise binding: retrying a 401/403 is pointless (a bad token stays bad) and was explicitly ruled out; 429 must be honored with bounded backoff to avoid storming Confluence. | 2026-07-08 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Credential provider (`src/app/credentials.ts`) | New — `resolveCredentials` / `validateCredentials` / `ConfluenceCredentials` / `ConfluenceIdentity` |
| `MarkSyncError` union + `assertNeverMarkSyncError` (`src/domain/errors.ts`) | Extended — one new `Auth` arm + `authKind` discriminator + its `assertNever` case + the `AuthError` narrowed alias (DEC-2) |
| `mapMarkSyncErrorToCommandError` (`src/app/cli-error-map.ts`) | Extended — `Auth` case narrowing on `authKind` → four `{ code, message, retryable }` (DEC-2) |
| `CODE_TO_EXIT` (`src/cli/output/exit-codes.ts`) | Extended — four new keys all → `EXIT_AUTH` (20) (DEC-2) |
| Redaction layer (`src/cli/output/redact.ts`) | Unchanged (reused as defense-in-depth backstop) |
| `doctor` integration point | New capability exposed (UI lands in MS2-E5-S2) |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story's numbered acceptance criteria (AC-1..AC-6), which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** the three canonical env vars are present and `baseUrl` is a valid `https://` Confluence host, **when** `resolveCredentials()` runs, **then** it returns `Ok` with a `ConfluenceCredentials` whose `authHeader` starts with `"Basic "`. | F-1, DM-1, NFR-1 | AC-1 |
| AC-F1-2 | **Given** any required env var is unset or empty, **when** `resolveCredentials()` runs, **then** it returns `Err(AuthError{ authKind:"MissingCredentials" })` whose message names **every** missing var and references `.env.example`. | F-1, DM-2, NFR-2 | AC-2 |
| AC-F1-3 | **Given** `baseUrl` is not `https://` or not a Confluence-host shape, **when** `resolveCredentials()` runs, **then** it returns `Err(AuthError{ authKind:"InvalidBaseUrl" })`. | F-1, DM-2, NFR-3 | AC-2 (scope) |
| AC-F2-1 | **Given** an injected mock `fetch`, **when** `validateCredentials()` is called: against a mock **200** it returns `Ok({ accountId, displayName })`; against a mock **401** (or **403**) it returns `Err(InvalidCredentials)` and the mock is fetched **exactly once**; against a mock **network error** it returns `Err(AuthUnreachable)`; against a mock **429** it applies bounded backoff before retrying. | F-2, F-5, DM-3, NFR-4, NFR-7 | AC-3 |
| AC-F4-1 | **Given** a synthetic raw token is fed through the provider, **when** every `CommandResult` and thrown-error string the provider can produce is captured, **then** grepping that captured output for the raw-token substring yields **0** matches (INV-SEC-1). | F-4, DM-1, NFR-5 | AC-4 |
| AC-F4-2 | **Given** a real email is resolved, **when** any message is surfaced, **then** the email appears only in masked form (`e[0] + "***" + @domain`); the raw email and the raw token each appear in **0** surfaced strings. | F-4, DM-1, NFR-6 | AC-5 |
| AC-F3-1 | **Given** the `Auth` arm is added to `MarkSyncError`, **when** `bun run check` (lint + typecheck + test + boundaries) runs, **then** it exits **0** — the `never`-check, the mapper switch, and `CODE_TO_EXIT` are all extended consistently, and dep-cruiser passes. | F-3, F-5, NFR-8, NFR-9 | AC-6 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** Depends on GH-14 + GH-16 (both merged); blocks MS2-E3-S4 and MS2-E5-S2.
- **Merge strategy:** Conventional Commits (TDR-0008); commit type `feat` with an `auth` (or `app/auth`) scope is appropriate.
- **Ordering within the story:** the `AuthError` arm + the three exhaustive-site extensions (F-3) should land **together** in one commit so the union's `never`-check never goes red on `main`. The secret-isolation contract (F-4) and the injected-fetch seam (F-5) should land with the provider functions (F-1/F-2) so the security posture and the testability guarantee are consistent from the first commit — do not merge a provider that holds the raw token or that hard-wires global `fetch`.
- **After merge:** MS2-E3-S4 consumes `ConfluenceCredentials` (injects `authHeader`, never sees the raw token); MS2-E5-S2 wraps `validateCredentials` in `doctor`. The four new `error.code`s become part of the stable agent-facing contract.
- **Communication:** the PR description should note the single-arm `AuthError` shape (DEC-2), the four new stable codes, the injected-fetch seam (DEC-1), and the secret-isolation contract (DEC-3) so downstream stories align.
- **Phase 7 doc-sync (`@doc-syncer`):** update `feature-cli.md` (§3.3 Authentication — provider now exists), `security-baseline.md` (credential-lifecycle section — provider is the resolution step), and the `mapMarkSyncErrorToCommandError`/`CODE_TO_EXIT` DEC-2 tables to include the `Auth` arm and the four codes.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. There are no existing credentials to migrate: env vars are read at runtime, and no credential material is ever persisted to disk by this story (NFR-SEC-6 — tokens live in env or future keyring, never in project files). The `.env.example` entries for the three auth vars already exist and are the seeding artifact.

## 20. PRIVACY / COMPLIANCE REVIEW

The provider handles authentication material (API token + user email) — the most privacy-sensitive data in MS-0002. The governing property is **INV-SEC-1 / NFR-SEC-1/SEC-2/SEC-6**: the raw token is never persisted, never placed in any output path, and never the only defense against a leak (DEC-3). Only the base URL and a masked email are surfaceable; the masked email (`j***@cwiakalski.com`) minimizes PII exposure in diagnostics while remaining useful for "which account?" identification. No outbound telemetry (NFR-SEC-3); the only remote call is the configured Confluence target. No personal data beyond the operator's own email/accountId is processed.

## 21. SECURITY REVIEW HIGHLIGHTS

- **INV-SEC-1 is enforced by construction (DEC-3).** The raw token is not a field on `ConfluenceCredentials`; the provider never places it in any `CommandResult`, warning, log, or error string. Only `baseUrl` + masked email are surfaceable. The redaction layer (GH-16) is the defense-in-depth backstop, not the primary defense — but its `Basic <token>` / `Authorization:` / `MARKSYNC_*_TOKEN` patterns would scrub a stray header if one ever reached a serialized string.
- **Credential storage (NFR-SEC-6).** Tokens live in env (the guaranteed MS-0002 path) or a future keyring (OPEN-Q8, deferred); never in config, lock, cache, or log. This story writes no credential material to disk.
- **Exhaustive error integrity (RSK-2/RSK-8).** Adding the `Auth` arm extends all three exhaustive sites in one change; the `authKind` sub-discriminator carries its own `never`-check, so a future auth sub-case cannot silently fall through.
- **No new dependencies / no new attack surface.** Native `fetch` only (typescript.md — no HTTP library). The probe is a read-only `GET` to the configured Confluence target; no outbound calls to any other endpoint.
- **No-retry-on-auth (spike rule).** A 401/403 is fetched exactly once — no retry storm that could trip Confluence rate limits or look like a credential brute-force.

## 22. MAINTAINABILITY & OPERATIONS IMPACT

- **The credential contract is a hard shared contract.** MS2-E3-S4 and MS2-E5-S2 both consume `ConfluenceCredentials` / `validateCredentials`; signature changes ripple to both. The injected-fetch seam (DEC-1) is the stable extension point.
- **Adding an auth source is cheap.** A future keyring source slots behind the same resolution seam without touching consumers (OQ-1) — the consumer-facing contract is `Result<ConfluenceCredentials, AuthError>`, independent of *how* the env/keyring was resolved.
- **Adding an auth sub-case is localized.** A new `authKind` extends the `authKind` union + its one nested handler + one `CODE_TO_EXIT` key; the top-level union and the other 13 kinds are untouched (DEC-2).
- **The error-code contract grows by four keys.** `AUTH_MISSING_CREDENTIALS` / `AUTH_INVALID_BASE_URL` / `AUTH_INVALID_CREDENTIALS` / `AUTH_UNREACHABLE` are now part of the stable agent-facing contract (NFR-OBS-3); documented in `--help`-adjacent material at phase 7.
- **Tier discipline is exercised here.** DEC-1 is the credential-provider case of routing network I/O through an injected port so the application tier stays pure — a precedent for any future app-tier module that needs to reach the outside world.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Credential provider | The application-tier module that resolves Confluence credentials from env (and, later, keyring) and validates them. |
| `ConfluenceCredentials` | `{ baseUrl, authHeader (opaque), email (masked), mode:"api-token" }` — the ready-to-use credential consumers receive. The raw token is not a field. |
| `authHeader` | `"Basic " + base64(email:token)` — an opaque secret string injected into requests; never serialized to output. |
| Masked email | `e[0] + "***" + e.slice(e.indexOf("@"))` (e.g. `j***@cwiakalski.com`) — the only email form surfaceable. |
| `AuthError` | The new `MarkSyncError` arm for credential failure, narrowed to `{ kind:"Auth", authKind, …payload }`. Also the `Extract` alias the provider declares on its `Result` error channel. |
| `authKind` | The sub-discriminator on the `Auth` arm: `MissingCredentials` \| `InvalidBaseUrl` \| `InvalidCredentials` \| `AuthUnreachable`. |
| `validateCredentials` | The probe that calls Confluence's "current user" endpoint and returns the account identity or an `AuthError`. |
| Injected `fetch` seam | The port (DEC-1) through which `validateCredentials` reaches the network — a `fetch`-shaped function defaulting to global `fetch`, injectable for tests. |
| Classic API-token | The MS-0002 auth path: email + API token via Basic auth over the direct site URL (the MS-0001 spike PASS path). |
| Spike rules (auth) | Binding MS-0001 findings: classic Basic auth works; do not retry 401/403; honor 429 with backoff; scoped tokens are a deferred deviation. |

## 24. APPENDICES

### Appendix A — Story AC → Spec AC traceability

| Story AC | Spec AC(s) | Capability / NFR |
|---|---|---|
| AC-1 (3 env vars + valid → `Basic …` header) | AC-F1-1 | F-1, DM-1, NFR-1 |
| AC-2 (missing var → `MissingCredentials` naming + fix suggestion) | AC-F1-2, AC-F1-3 | F-1, DM-2, NFR-2, NFR-3 |
| AC-3 (validate 200→identity; 401→InvalidCredentials; network→AuthUnreachable) | AC-F2-1 | F-2, F-5, DM-3, NFR-4, NFR-7 |
| AC-4 (INV-SEC-1: no raw token in any captured output) | AC-F4-1 | F-4, DM-1, NFR-5 |
| AC-5 (email masked; token never surfaced) | AC-F4-2 | F-4, DM-1, NFR-6 |
| AC-6 (`bun run check` green) | AC-F3-1 | F-3, F-5, NFR-8, NFR-9 |

### Appendix B — `AuthError` shape and code/exit mapping (DEC-2)

| `authKind` | `error.code` | exit | retryable | Trigger |
|---|---|---|---|---|
| `MissingCredentials` | `AUTH_MISSING_CREDENTIALS` | 20 | false | a required env var is unset/empty |
| `InvalidBaseUrl` | `AUTH_INVALID_BASE_URL` | 20 | false | `baseUrl` not `https://` or not a Confluence host |
| `InvalidCredentials` | `AUTH_INVALID_CREDENTIALS` | 20 | false | probe returns 401/403 (no retry) |
| `AuthUnreachable` | `AUTH_UNREACHABLE` | 20 | true | probe network/transport error (or post-429-backoff failure) |

All four share the top-level `kind: "Auth"` and the auth exit class (`EXIT_AUTH` 20). The union grows 13 → 14 (one arm), not 13 → 17.

### Appendix C — Authoritative sources

- **Story scope (authoritative):** `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md` — Goal, Detailed scope (6 deliverables), Interface contracts, Acceptance criteria (6), Test matrix, CEO-resolved R1/Q1 + OPEN-Q8.
- **Feature spec:** `doc/spec/features/feature-cli.md` — §3.3 Authentication (API token default; env vars canonical; keyring deferred).
- **Epic:** `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2--epic.md` — Foundation epic scope + cross-cutting INV-SEC-1.
- **Security:** `doc/guides/security-baseline.md` — Credential storage (NFR-SEC-6), redaction layer (defense-in-depth, not primary defense).
- **NFRs:** `doc/spec/nonfunctional.md` — NFR-SEC-1/SEC-2/SEC-6, INV-SEC-1, NFR-OBS-1/OBS-3.
- **Architecture:** `doc/overview/architecture-overview.md` — dependency-direction matrix (app → infra via ports); credential provider residence (`src/app/`).
- **Coding conventions:** `.ai/rules/typescript.md` — tier rules, `Result<T,E>`, native-`fetch` rule, exhaustive checking, "Adding a `MarkSyncError` kind" rules, port heuristic.
- **Testing:** `.ai/rules/testing-strategy.md` — credential provider tested at unit (mock fetch) + integration (`Bun.serve`) tiers; INV-SEC-1 must be validated through real paths.
- **Existing primitives:** `src/domain/result.ts` (`Result<T,E>`), `src/domain/errors.ts` (13-kind `MarkSyncError` + `assertNeverMarkSyncError` + `ConfigError` narrowed-alias precedent), `src/app/cli-error-map.ts` (`mapMarkSyncErrorToCommandError` + DEC-6 stable-code contract), `src/cli/output/exit-codes.ts` (`CODE_TO_EXIT` + `EXIT_AUTH`), `src/cli/output/redact.ts` (defense-in-depth), `src/cli/output/command-result.ts` (`CommandResult<T>`), `.env.example` (canonical env-var names), `.dependency-cruiser.cjs` (tier rules).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | spec-writer (GH-17) | Initial specification — formalized from the authoritative story file MS2-E2-S4, feature-cli.md §3.3, security-baseline.md (NFR-SEC-6), the existing `Result<T,E>`/`MarkSyncError`/`cli-error-map`/`exit-codes`/`redact` primitives (GH-14/GH-15/GH-16), and the MS-0001 spike rules. Encodes DEC-1 (injected-fetch seam) and DEC-2 (single `Auth` arm + `authKind`) resolving the two technical decisions the story delegates to delivery. |
| 1.1 | 2026-07-08 | spec-writer (GH-17) | DoR iter-1 remediation (PM decision): dropped the v1 `user/current` fallback — v2 `user/by-me` is the sole MS-0002 validation endpoint. Updated F-2, DEC-5, §8.1/§8.4 interfaces, RSK-6, dependencies, front matter; added NG-8 + §7.2 [OUT] + §7.3 deferred entry for the v1 fallback. ACs (AC-1..AC-6), DEC-1, and DEC-2 union shape unchanged. |

---

## AUTHORING GUIDELINES

- **Seed:** The authoritative scope is the story file `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md` (DoR-ready). This spec formalizes that story; it does not invent new requirements or expand scope. The story's Goal / Detailed scope (6 deliverables) / Interface contracts / Acceptance criteria (6) / Out-of-scope map directly to the Goals (G-1..G-6), Capabilities (F-1..F-6), Acceptance Criteria (AC-*), and Non-Goals (NG-1..NG-7) here.
- **Sources cited:** story MS2-E2-S4, epic MS2-E2, feature-cli.md §3.3, security-baseline.md, nonfunctional.md, architecture-overview.md, typescript.md, testing-strategy.md, the existing `result.ts`/`errors.ts`/`cli-error-map.ts`/`exit-codes.ts`/`redact.ts`/`command-result.ts` primitives, `.env.example`, `.dependency-cruiser.cjs`.
- **Two delegated technical decisions resolved (not left open):**
  - **DEC-1 (injected `fetch` seam):** the story places the provider at `src/app/credentials.ts` but `validateCredentials` does network I/O. Injecting a `fetch`-shaped port keeps the application tier pure and unit-testable without `Bun.serve`, aligns with the ports-and-adapters matrix (app → infra via ports) and the testing-strategy over-mocking guardrail, and avoids coupling to the not-yet-built Confluence adapter. Note: the live `.dependency-cruiser.cjs` does not currently encode an explicit `app→infra` ban, but the architecture matrix + the "mocked in >1 test → make it a port" heuristic + unit-tier purity mandate the seam regardless.
  - **DEC-2 (single `Auth` arm + `authKind`):** one new top-level arm with a discriminated `authKind` (mirroring the GH-15 `InvalidConfig` precedent) over four separate top-level kinds — keeps the union 13→14 (not 17), groups one cohesive "credential failed" cluster under one exit class, and preserves per-case agent operability via four stable `error.code`s. The story's `AuthError{kind:"MissingCredentials"}` notation maps to `{ kind:"Auth", authKind:"MissingCredentials", missing:[] }`.
- **No implementation detail:** module paths appear as **architectural residence** (where a capability lives per the residence rules), consistent with the GH-15/GH-16 specs and `architecture-overview.md` — not as step-by-step file-creation tasks. Exact file contents, the precise base64 mechanism, and the exact 429-backoff constants are delivery decisions for the plan-writer/coder.
- **CEO-resolved items** carried forward: Q1 (`--token-file`) → No for MS-0002 (NG-5); OPEN-Q8 (`keytar`) → deferred (NG-1); R1 (non-exported token) → `MissingCredentials` message links `.env.example` + CREDENTIALS doc (AC-F1-2, RSK-4). None requires `@decision-advisor` escalation.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-17)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR-/DM- ID and use Given/When/Then
- [x] NFRs include measurable values (Basic header; missing var named; 0 token matches; 0 raw-email surfaces; exactly-once fetch on 401/403; 0 `Bun.serve` in unit tier; 0 `#infra/*` imports; ≤10ms p95; `bun run check` exit 0)
- [x] Risks include Impact & Probability
- [x] No implementation details (module paths are architectural residence, not task steps; no code-level instructions)
- [x] No content duplicated from linked docs (story / security-baseline / typescript.md / existing primitives referenced, not reproduced)
- [x] Front matter validates per front_matter_rules
