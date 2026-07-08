---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-17-test-plan
status: Proposed
created: 2026-07-08T23:30:00Z
last_updated: 2026-07-08T23:30:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical, security]
version_impact: minor (additive)
summary: "Test plan for the env-token auth provider (MS2-E2-S4): resolveCredentials from the canonical env vars with a Basic authHeader, the validateCredentials probe (200/401/403/429/network), email masking, the 4-kind AuthError union extension (MissingCredentials/InvalidBaseUrl/InvalidCredentials/AuthUnreachable) with exhaustive switches + exit codes, and the release-blocking INV-SEC-1 guarantee that the raw token never appears in any captured output — validated at integration level per the over-mocking guardrail."
links:
  change_spec: "./chg-GH-17-spec.md (pending — specification phase not yet complete; story file is authoritative per chg-GH-17-pm-notes.yaml)"
  implementation_plan: "./chg-GH-17-plan.md (pending — delivery_planning phase not yet complete)"
  story_authoritative: doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md
  testing_strategy: .ai/rules/testing-strategy.md
  security_baseline: doc/guides/security-baseline.md
---

# Test Plan - [MS2-E2-S4] Auth provider (API-token from env)

## 1. Scope and Objectives

This plan verifies the Confluence env-token credential provider introduced by
GH-17: `resolveCredentials()` reading the canonical env vars
(`MARKSYNC_CONFLUENCE_BASE_URL` / `MARKSYNC_USER_EMAIL` / `MARKSYNC_API_TOKEN`)
into an opaque `Basic …` authHeader, `validateCredentials()` probing
`GET /wiki/api/v2/user/by-me` via an **injected `fetch`** (DI for app-tier purity
+ testability), the `maskEmail` helper, and the 4-kind `AuthError`
(`MissingCredentials` / `InvalidBaseUrl` / `InvalidCredentials` /
`AuthUnreachable`) added to the exhaustive `MarkSyncError` union.

The core integrity risks this plan guards against are: (a) the raw API token
surfacing in any output path — the release-blocking INV-SEC-1 / NFR-SEC-1
guarantee; (b) the `Basic ` header being constructed from the wrong base64
material (wrong separator, wrong prefix) and silently authenticating with bad
credentials; (c) the validation probe retrying on 401/403 (the spike rule
forbids blind retry) or mishandling 429 backoff; (d) the exhaustive `never`
switches (`assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`,
`CODE_TO_EXIT`) breaking silently when the 4 new kinds land; and (e) email
being surfaced unmasked where only `j***@domain` is safe.

Per `.ai/rules/testing-strategy.md`, this story is exercised at **Unit + Integration
tiers only**. INV-SEC-1 is validated at the **Integration** level (captured
serialized output across happy + error paths), NOT mock-only — per the
AI-agent over-mocking guardrail (§"Test-design guardrail"). E2E (live-sandbox)
is explicitly **out of scope**: a real env-token E2E against a live tenant is the
Confluence adapter's concern (E3-S4); here the validation probe runs against a
`Bun.serve()` mock.

### 1.1 In Scope

- `resolveCredentials()` — happy path (all 3 vars present + valid https
  Confluence host → `Result.ok(ConfluenceCredentials)` with a `Basic …`
  header); each-var-missing and all-missing → `MissingCredentials` naming the
  missing var(s) + a fix suggestion; malformed `baseUrl` (not https / not a
  valid host) → `InvalidBaseUrl`.
- Header construction — `authHeader === "Basic " + base64("email:token")`
  (correct material, correct `Basic ` prefix, exactly once).
- `maskEmail(e)` — `e[0] + "***" + e.slice(e.indexOf("@"))` plus single-char
  local-part edge.
- `validateCredentials(creds, fetch?)` against a real `Bun.serve()` mock:
  200 → `{accountId, displayName}`; 401 → `InvalidCredentials`; 403 →
  `InvalidCredentials`; 429 → backoff + retry honoured; connection-refused /
  fetch-reject → `AuthUnreachable`. **No retry on 401/403** (assert call count
  == 1).
- The DI seam: `validateCredentials` accepts an injected `fetch` and uses it
  (app-tier purity; no global-`fetch` coupling).
- `AuthError` union extension — the 4 new kinds are valid `MarkSyncError` arms;
  `mapMarkSyncErrorToCommandError` maps each to a stable `error.code` +
  `retryable`; `codeToExitCode` resolves those codes to documented exits;
  exhaustiveness compile-check (adding a kind without extending the switches is
  a compile error; `bun run typecheck` exits 0 once extended).
- **INV-SEC-1 (release-blocking, integration-level):** across the happy path
  AND every error path of the provider, capture every `CommandResult` JSON
  string AND every error message string and assert a distinctive fake token
  substring never appears. The redactor (`redactString`) is verified as
  defense-in-depth, but the PRIMARY assertion is that the provider never emits
  the token.

### 1.2 Out of Scope & Known Gaps

- **`keytar` OS keyring** — deferred (OPEN-Q8 per story); env-token is the
  guaranteed `MS-0002` path. No keyring resolution is exercised.
- **OAuth 2.0 / 3LO, scoped tokens, Data Center PAT** — post-`MS-0002` / later
  milestones. The `*_SCOPED` / `*_CLOUD_ID` vars are NOT read.
- **E2E (live-sandbox) against a real Confluence tenant** — out of scope for
  this story; a live env-token E2E is the adapter's concern (E3-S4). The
  validation probe here runs only against a `Bun.serve()` mock.
- **`doctor` UI** (E5-S2) — this story exposes `validateCredentials` as a
  capability; wiring the `doctor` UX is a separate story.
- **Golden fixture / Mermaid-DOM / BDD tiers** — not applicable (no renderer,
  no Storage XHTML; INV-SEC-1 is covered integration-level here, and the
  repo-wide Gherkin INV-SEC-1 harness lives with the output service in GH-16).
- **Exact `error.code` strings / numeric exits for the 4 new kinds** — these
  are stable-string delivery decisions (DEC-6 / DEC-2 lineage). This plan pins
  the *contract* (each kind → one stable code + one documented exit + a
  `retryable` flag) and flags the exact assignments as OQ-TP-1/OQ-TP-2.
- **F-# capability codes** — there is no `chg-GH-17-spec.md` yet (specification
  phase pending). The `F-AUTH-*` codes below are derived from the story's
  deliverables and are **provisional** pending the spec (see OQ-TP-3).

## 2. References

| Artifact | Path |
|----------|------|
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md` |
| Change specification | `./chg-GH-17-spec.md` _(pending — specification phase)_ |
| Implementation plan | `./chg-GH-17-plan.md` _(pending — delivery_planning phase)_ |
| PM notes | [`./chg-GH-17-pm-notes.yaml`](./chg-GH-17-pm-notes.yaml) |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) (tiers + over-mocking guardrail) |
| Security baseline | [`doc/guides/security-baseline.md`](../../guides/security-baseline.md) (NFR-SEC-1/2/6, INV-SEC-1) |
| Non-functional spec | [`doc/spec/nonfunctional.md`](../../spec/nonfunctional.md) (NFR-SEC-1, NFR-SEC-2, NFR-SEC-6, NFR-OBS-1) |
| Canonical env vars | [`.env.example`](../../../.env.example) (single source of truth) |
| CLI feature spec (auth §3.3) | `doc/spec/features/feature-cli.md` |
| `Result<T,E>` primitive | `src/domain/result.ts` |
| `MarkSyncError` union + exhaustive check | `src/domain/errors.ts` |
| `MarkSyncError` → `{code,message,retryable}` bridge | `src/app/cli-error-map.ts` (DEC-1/DEC-2/DEC-5) |
| Stable `code` → exit-code map | `src/cli/output/exit-codes.ts` (DEC-2) |
| Redaction layer (defense-in-depth) | `src/cli/output/redact.ts` (DEC-4 / INV-SEC-1) |
| Existing error-map test (extend) | `tests/unit/app/cli-error-map.test.ts` |
| Existing exit-code test (extend) | `tests/unit/cli/output/exit-codes.test.ts` |
| `Bun.serve` mock pattern reference | `tests/integration/cli-output.test.ts` |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

> The 6 acceptance criteria below are the story ACs (the authoritative list,
> reproduced from the story's "Acceptance criteria" + the planning brief). All
> 6 MUST appear, covered or TODO. The `F-AUTH-*` capability codes are
> **provisional**, derived from the story's "Detailed scope" deliverables
> pending `chg-GH-17-spec.md` (OQ-TP-3).

| Story AC | Description | F-# (prov.) | TC ID(s) | Status |
|----------|-------------|-------------|----------|--------|
| AC-1 | All three required env vars present + valid → `resolveCredentials` returns a credentials object with a `Basic …` header; malformed `baseUrl` (not https / not a host) is rejected | F-AUTH-1, F-AUTH-2 | TC-CRED-001, TC-CRED-006, TC-CRED-007, TC-CRED-008 | Covered |
| AC-2 | Any required var missing/empty → `AuthError{kind:"MissingCredentials"}` naming the missing var(s) with a fix suggestion | F-AUTH-1 | TC-CRED-002, TC-CRED-003, TC-CRED-004, TC-CRED-005 | Covered |
| AC-3 | `validateCredentials` against a mock 200 → identity; 401 → `InvalidCredentials`; 403 → `InvalidCredentials`; 429 → backoff/retry; network error → `AuthUnreachable`; **no retry on 401/403** | F-AUTH-3 | TC-VALIDATE-001, TC-VALIDATE-002, TC-VALIDATE-003, TC-VALIDATE-004, TC-VALIDATE-005, TC-VALIDATE-006, TC-VALIDATE-007 | Covered |
| AC-4 (INV-SEC-1) | No test path produces output containing the raw token — capture every `CommandResult`/thrown-error string and assert the token substring absent | F-AUTH-5, NFR-SEC-1 | TC-SEC-001, TC-SEC-003 | Covered (integration-level per guardrail) |
| AC-5 | Email is masked in any surfaced message; token is never surfaced | F-AUTH-5, NFR-SEC-1 | TC-CRED-009, TC-SEC-002 | Covered |
| AC-6 | `bun run check` green (the 4 new kinds land with all exhaustive switches + exit codes extended; typecheck stays exhaustive) | F-AUTH-4, NFR-OBS-1, NFR-3 | TC-ERRMAP-001, TC-ERRMAP-002, TC-ERRMAP-003 + `bun run check` gate | Covered |

**Capability (F-AUTH-#, provisional) rollup:**

| F-AUTH-# (prov.) | Capability | TC ID(s) |
|------------------|------------|----------|
| F-AUTH-1 | `resolveCredentials()` — env resolution + missing/malformed input → `AuthError` | TC-CRED-001..007 |
| F-AUTH-2 | `ConfluenceCredentials` opaque `Basic …` header construction (token never exposed beyond it) | TC-CRED-008 |
| F-AUTH-3 | `validateCredentials()` probe (200/401/403/429/network) + injected-fetch DI seam | TC-VALIDATE-001..007 |
| F-AUTH-4 | 4-kind `AuthError` union extension + exhaustive switches + stable codes/exit codes | TC-ERRMAP-001..003 |
| F-AUTH-5 | Email masking + INV-SEC-1 token non-leak (redaction-by-construction) | TC-CRED-009, TC-SEC-001..003 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No new REST/HTTP *endpoint owned* by this story (the provider is a *client* of
Confluence's `GET /wiki/api/v2/user/by-me`); no events/messages. Data-model
coverage:

| DM-# (prov.) | Element | Description | TC ID(s) |
|--------------|---------|-------------|----------|
| DM-AUTH-1 | `ConfluenceCredentials` | `{ baseUrl; authHeader; email(masked); mode }` — the opaque credential object; `authHeader = "Basic " + base64(email:token)`, token never a field | TC-CRED-001, TC-CRED-008, TC-VALIDATE-006 |
| DM-AUTH-2 | `AuthError` (4 sub-kinds) | `MissingCredentials{missing[]}`, `InvalidBaseUrl{…}`, `InvalidCredentials{…}`, `AuthUnreachable{…}` — the 4 new arms of the exhaustive `MarkSyncError` union | TC-CRED-002..007, TC-VALIDATE-002..005, TC-ERRMAP-001..003 |

**Public interface contracts consumed downstream** (verified as side-effects of
the resolution/validation tests):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `resolveCredentials(): Result<ConfluenceCredentials, AuthError>` | Confluence adapter (E3-S4), `doctor` (E5-S2) | TC-CRED-001..007 |
| `validateCredentials(creds, fetch?): Result<{accountId, displayName}, AuthError>` | adapter (E3-S4), `doctor` (E5-S2) | TC-VALIDATE-001..007 |
| `ConfluenceCredentials` (opaque `authHeader`) | adapter injects it into every request; adapter never sees the raw token | TC-CRED-008, TC-VALIDATE-006, TC-SEC-001 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# | Requirement | Threshold | TC ID(s) | Status |
|-------|-------------|-----------|----------|--------|
| NFR-SEC-1 | No secrets in any output | 0 token substrings in logs/plans/state/diagnostics/error messages | TC-SEC-001, TC-SEC-003 | Covered (integration-level) |
| NFR-SEC-2 | Secret redaction by construction | Every output path crosses a redaction layer; tested per path | TC-SEC-003 (defense-in-depth) | Covered |
| NFR-SEC-6 | Credential storage | Tokens in env (or future keyring), never in project files; `resolveCredentials` reads env only | TC-CRED-001..005 | Covered |
| NFR-OBS-1 | Stable exit codes | Documented, machine-parseable exit per error class; new auth codes resolve via `codeToExitCode` | TC-ERRMAP-002 | Covered |
| INV-SEC-1 | Lifecycle invariant — no secrets in output | Validated at integration level (NOT mock-only per guardrail) | TC-SEC-001 | Covered (guardrail-compliant) |
| (exhaustiveness) | Union + `assertNeverMarkSyncError` + `mapMarkSyncErrorToCommandError` compile with zero type errors after the 4 new kinds | `bun run typecheck` exits 0 | TC-ERRMAP-003 | Covered (typecheck gate) |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md`, this story is exercised at the **Unit** and
**Integration** tiers. There is no renderer (no Golden / Mermaid-DOM) and no
new lifecycle-invariant harness owned here (INV-SEC-1 is covered
integration-level within this plan; the repo-wide Gherkin INV-SEC-1 harness
lives with the output service from GH-16). **E2E (live-sandbox) is out of
scope** — a real env-token E2E against a live Confluence tenant is the adapter's
concern (E3-S4).

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes (primary for resolve/header/masking/error-map) | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| **Integration** | Yes (validateCredentials probe + INV-SEC-1 capture) | `bun:test` + `Bun.serve()` mock | `tests/integration/` | `*.test.ts` |
| Golden fixture | No | — | — | — |
| Mermaid-DOM | No | — | — | — |
| BDD (Gherkin) | No (repo-wide INV-SEC-1 harness is GH-16's) | — | — | — |
| **E2E (live-sandbox)** | **No — out of scope** | — | — | live env-token E2E is E3-S4's concern |
| Type-level (compile safety) | Yes — exhaustive union + switches | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per testing-strategy.md / typescript.md):**

```
src/app/credentials.ts                       → tests/unit/app/credentials.test.ts
src/domain/errors.ts (4 new AuthError arms)  → tests/unit/domain/errors.test.ts (exhaustive; typecheck gate)
src/app/cli-error-map.ts (4 new cases)       → tests/unit/app/cli-error-map.test.ts   (Existing – Update)
src/cli/output/exit-codes.ts (4 new codes)   → tests/unit/cli/output/exit-codes.test.ts (Existing – Update)
validateCredentials probe (Bun.serve mock)   → tests/integration/credentials.test.ts
INV-SEC-1 captured-output capture            → tests/integration/credentials.test.ts  (TC-SEC-001..003)
```

> The exact module split inside `src/app/` (one `credentials.ts` vs separate
> `mask-email.ts`) is a delivery decision; the story names `src/app/credentials.ts`
> explicitly. The `tests/` paths above mirror whichever modules are created.

**Over-mocking guardrail compliance (TDR-0004 §"Test-design guardrail").** This
plan is guardrail-compliant in three concrete ways:

1. **INV-SEC-1 is validated at the Integration level, not mock-only.** TC-SEC-001
   captures the genuine serialized `CommandResult` JSON + every error message
   string produced by the provider across the happy path AND every error path,
   and asserts the token substring is absent from the real captured bytes — not
   via a mock that asserts "redact was called". This is the testing-strategy
   table's INV-SEC-1 row: "Unit (per output path) + Gherkin" satisfied here at
   the integration capture level.
2. **`validateCredentials` is tested through a `Bun.serve()` adapter-boundary
   mock** (the allowed mock class — "Adapter boundary tests" — for fault
   injection: 200/401/403/429/network). The probe's HTTP behaviour is exercised
   against a real local server, not a fake of the provider's own logic.
3. **Domain logic is tested with real inputs.** `resolveCredentials`,
   `maskEmail`, and header construction are tested with real env values and real
   base64 output — no mocking of the resolution/masking/base64 logic.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-CRED-001 | All 3 env vars present + valid → `Result.ok(creds)` with a `Basic …` header | Happy Path | Critical | High | AC-1 |
| TC-CRED-002 | `MARKSYNC_USER_EMAIL` missing/empty → `MissingCredentials` naming it + fix suggestion | Negative | Critical | High | AC-2 |
| TC-CRED-003 | `MARKSYNC_API_TOKEN` missing/empty → `MissingCredentials` naming it + fix suggestion | Negative | Critical | High | AC-2 |
| TC-CRED-004 | `MARKSYNC_CONFLUENCE_BASE_URL` missing/empty → `MissingCredentials` naming it | Negative | Critical | High | AC-2 |
| TC-CRED-005 | All three vars missing → `missing[]` lists all three | Corner Case | Important | Medium | AC-2 |
| TC-CRED-006 | `baseUrl` not https (`http://…`) → `InvalidBaseUrl` | Negative | Critical | High | AC-1 |
| TC-CRED-007 | `baseUrl` not a valid/Confluence host → `InvalidBaseUrl` | Negative | Critical | High | AC-1 |
| TC-CRED-008 | `authHeader === "Basic " + base64("email:token")` (correct material + prefix) | Happy Path | Critical | High | AC-1 |
| TC-CRED-009 | `maskEmail` → `e[0]+"***"+@domain`; single-char local-part edge | Corner Case | Important | Medium | AC-5 |
| TC-VALIDATE-001 | Probe 200 → returns `{accountId, displayName}` | Happy Path | Critical | High | AC-3 |
| TC-VALIDATE-002 | Probe 401 → `InvalidCredentials`; call count == 1 (no retry) | Negative | Critical | High | AC-3 |
| TC-VALIDATE-003 | Probe 403 → `InvalidCredentials`; call count == 1 (no retry) | Negative | Critical | High | AC-3 |
| TC-VALIDATE-004 | Probe 429 → backoff honoured + retry occurs | Edge Case | Important | Medium | AC-3 |
| TC-VALIDATE-005 | Connection-refused / fetch rejects → `AuthUnreachable` | Negative | Critical | High | AC-3 |
| TC-VALIDATE-006 | Probe sends `Authorization: Basic …` header to the server | Corner Case | Important | Medium | AC-3 |
| TC-VALIDATE-007 | DI seam: `validateCredentials` accepts + uses an injected `fetch` (app-tier purity) | Corner Case | Important | Medium | AC-3 |
| TC-ERRMAP-001 | Each new auth kind → stable `error.code` + `retryable` (exhaustive over all kinds) | Regression | Critical | High | AC-6 |
| TC-ERRMAP-002 | New auth `error.code` strings resolve to documented exits via `codeToExitCode` | Regression | Critical | High | AC-6 |
| TC-ERRMAP-003 | Exhaustiveness compile-check: missing switch → compile error; `bun run typecheck` exits 0 | Regression | Critical | High | AC-6 |
| TC-SEC-001 | INV-SEC-1: raw token absent from every captured `CommandResult` JSON + error message (integration-level) | Negative | Critical | High | AC-4 / INV-SEC-1 |
| TC-SEC-002 | Email masked in surfaced messages; token never surfaced | Corner Case | Critical | High | AC-5 |
| TC-SEC-003 | Defense-in-depth: `redactString` catches the token — but the provider never emits it | Regression | Important | Medium | AC-4 |

### 5.2 Scenario Details

#### TC-CRED-001 - All 3 env vars present + valid → `Result.ok(creds)` with a `Basic …` header

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, F-AUTH-2, DM-AUTH-1, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api, @security

**Preconditions**:

- A test-local environment with all three canonical vars set to valid values:
  `MARKSYNC_CONFLUENCE_BASE_URL=https://example.atlassian.net`,
  `MARKSYNC_USER_EMAIL=user@example.com`, `MARKSYNC_API_TOKEN=<fake token>`.
  (The provider must accept an injectable env source or the test sets/restores
  `process.env` deterministically.)

**Steps**:

1. Invoke `resolveCredentials()` with the three vars populated.
2. Assert the return is `{ ok: true, value }`.
3. Assert `value.baseUrl === "https://example.atlassian.net"`.
4. Assert `value.authHeader` starts with `"Basic "` and is non-empty.
5. Assert `value.email` is the **masked** form (`u***@example.com`), not the
   raw email.

**Expected Outcome**:

- A fully-typed `ConfluenceCredentials` is returned; the auth header is the
  opaque `Basic …` value the adapter consumes; no throw; the raw token is not a
  field on the returned object.

---

#### TC-CRED-002 - `MARKSYNC_USER_EMAIL` missing/empty → `MissingCredentials` naming it + fix suggestion

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `MARKSYNC_CONFLUENCE_BASE_URL` and `MARKSYNC_API_TOKEN` are set; the email var
  is unset (and separately, set to the empty string).

**Steps**:

1. Invoke `resolveCredentials()` with `MARKSYNC_USER_EMAIL` absent.
2. Assert `{ ok: false, error }` with `error.kind === "MissingCredentials"`.
3. Assert `error.missing` contains exactly `["MARKSYNC_USER_EMAIL"]`.
4. Assert the surfaced message names the missing var AND links `.env.example`
   as the fix.
5. Repeat with the var set to `""` (empty) — same outcome.

**Expected Outcome**:

- A typed `MissingCredentials` error names precisely which var is missing and
  points the user/agent at `.env.example`; never an opaque throw.

---

#### TC-CRED-003 - `MARKSYNC_API_TOKEN` missing/empty → `MissingCredentials` naming it + fix suggestion

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api, @security

**Preconditions**:

- `MARKSYNC_CONFLUENCE_BASE_URL` and `MARKSYNC_USER_EMAIL` set; the token var
  unset (and separately empty).

**Steps**:

1. Invoke `resolveCredentials()` with `MARKSYNC_API_TOKEN` absent.
2. Assert `{ ok: false, error }`, `error.kind === "MissingCredentials"`.
3. Assert `error.missing` contains exactly `["MARKSYNC_API_TOKEN"]`.
4. Repeat with the var set to `""` — same outcome.

**Expected Outcome**:

- The token var's absence is named explicitly. (Critical because a generic
  "auth failed" would send a user down the wrong debugging path.)

---

#### TC-CRED-004 - `MARKSYNC_CONFLUENCE_BASE_URL` missing/empty → `MissingCredentials` naming it

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `MARKSYNC_USER_EMAIL` and `MARKSYNC_API_TOKEN` set; the base-URL var unset
  (and separately empty).

**Steps**:

1. Invoke `resolveCredentials()` with `MARKSYNC_CONFLUENCE_BASE_URL` absent.
2. Assert `{ ok: false, error }`, `error.kind === "MissingCredentials"`.
3. Assert `error.missing` contains exactly `["MARKSYNC_CONFLUENCE_BASE_URL"]`.

**Expected Outcome**:

- The base-URL var's absence is named explicitly.

---

#### TC-CRED-005 - All three vars missing → `missing[]` lists all three

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- None of the three canonical vars are set.

**Steps**:

1. Invoke `resolveCredentials()` with no auth vars set.
2. Assert `{ ok: false, error }`, `error.kind === "MissingCredentials"`.
3. Assert `error.missing` contains all three canonical var names (order-tolerant
   comparison against the set).

**Expected Outcome**:

- All missing vars are collected into one `MissingCredentials` error (not just
  the first), so the user/agent can fix everything in one pass.

---

#### TC-CRED-006 - `baseUrl` not https (`http://…`) → `InvalidBaseUrl`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api, @security

**Preconditions**:

- All three vars set, but `MARKSYNC_CONFLUENCE_BASE_URL=http://example.atlassian.net`
  (plain http).

**Steps**:

1. Invoke `resolveCredentials()`.
2. Assert `{ ok: false, error }` with `error.kind === "InvalidBaseUrl"`.
3. Assert the surfaced message indicates https is required (never echoes the
   raw token).

**Expected Outcome**:

- A non-https base URL is rejected before any network call (credentials must
  never transit an unencrypted scheme).

---

#### TC-CRED-007 - `baseUrl` not a valid/Confluence host → `InvalidBaseUrl`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-1, DM-AUTH-2, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- All three vars set, but `MARKSYNC_CONFLUENCE_BASE_URL` is a malformed host
  (e.g. `"not-a-url"`, `"https://"`, `"https:///no-host"`). Parametrize across
  the malformed variants.

**Steps**:

1. For each malformed variant, invoke `resolveCredentials()`.
2. Assert `{ ok: false, error }` with `error.kind === "InvalidBaseUrl"`.

**Expected Outcome**:

- A structurally invalid base URL is rejected with the typed `InvalidBaseUrl`
  error, never an opaque throw and never passed downstream.

---

#### TC-CRED-008 - `authHeader === "Basic " + base64("email:token")` (correct material + prefix)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-2, DM-AUTH-1, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @api, @security

**Preconditions**:

- Known fixed values: email `user@example.com`, token `<fake token>`, valid
  https base URL.

**Steps**:

1. Invoke `resolveCredentials()`.
2. Compute the expected header locally: `"Basic " + Buffer.from("user@example.com:<token>").toString("base64")`.
3. Assert `value.authHeader === expected` exactly (correct `email:token`
   separator, correct `Basic ` prefix, correct base64 material).

**Expected Outcome**:

- The header is byte-exact the RFC-7617 Basic credential for `email:token` —
  proving the separator/prefix/material are all correct (a wrong separator
  would silently authenticate with bad credentials).

---

#### TC-CRED-009 - `maskEmail` → `e[0]+"***"+@domain`; single-char local-part edge

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-5, DM-AUTH-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @security

**Preconditions**:

- The `maskEmail` helper is exported (or exercised via a resolved credentials
  object's `email` field).

**Steps**:

1. Assert `maskEmail("juliusz@cwiakalski.com") === "j***@cwiakalski.com"`.
2. Assert `maskEmail("a@x.io") === "a***@x.io"` (single-char local part — first
   char preserved, rest of local part masked).
3. (If exposed via the credentials object) assert the resolved `value.email` is
   the masked form, not the raw email.

**Expected Outcome**:

- The masking shape is `e[0] + "***" + e.slice(e.indexOf("@"))` for every input;
  the raw email never leaves the provider except in this masked form.

---

#### TC-VALIDATE-001 - Probe 200 → returns `{accountId, displayName}`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-3, DM-AUTH-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (`Bun.serve()` mock)
**Tags**: @backend, @api

**Preconditions**:

- A `Bun.serve()` mock on a random localhost port responding `200` to
  `GET /wiki/api/v2/user/by-me` with a body shaped like Confluence's
  `UserByMeResponse` (carrying `accountId` + `displayName`).
- A `ConfluenceCredentials` whose `baseUrl` points at the mock origin.

**Steps**:

1. Invoke `validateCredentials(creds, mockFetch)` (injected fetch → mock).
2. Assert `{ ok: true, value }`.
3. Assert `value.accountId` and `value.displayName` equal the mock's values.
4. Assert the request path was `/wiki/api/v2/user/by-me`.

**Expected Outcome**:

- A 200 returns the account identity through the typed `Result.ok` channel.

---

#### TC-VALIDATE-002 - Probe 401 → `InvalidCredentials`; call count == 1 (no retry)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-3, DM-AUTH-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (`Bun.serve()` mock)
**Tags**: @backend, @api

**Preconditions**:

- The mock responds `401 Unauthorized` to the probe.

**Steps**:

1. Invoke `validateCredentials(creds, mockFetch)`.
2. Assert `{ ok: false, error }` with `error.kind === "InvalidCredentials"`.
3. Assert the mock received **exactly 1** probe request (the spike rule: no
   blind retry on 401).

**Expected Outcome**:

- A 401 maps to the typed `InvalidCredentials` error AND is NOT retried (call
  count == 1). Retrying 401/403 would hammer Confluence with a known-bad token.

---

#### TC-VALIDATE-003 - Probe 403 → `InvalidCredentials`; call count == 1 (no retry)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-3, DM-AUTH-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (`Bun.serve()` mock)
**Tags**: @backend, @api

**Preconditions**:

- The mock responds `403 Forbidden` to the probe.

**Steps**:

1. Invoke `validateCredentials(creds, mockFetch)`.
2. Assert `{ ok: false, error }` with `error.kind === "InvalidCredentials"`.
3. Assert the mock received **exactly 1** probe request (no retry on 403).

**Expected Outcome**:

- A 403 maps to `InvalidCredentials` and is NOT retried (call count == 1).

---

#### TC-VALIDATE-004 - Probe 429 → backoff honoured + retry occurs

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-3, DM-AUTH-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (`Bun.serve()` mock)
**Tags**: @backend, @api, @perf

**Preconditions**:

- The mock responds `429 Too Many Requests` once (or N times) then `200`.

**Steps**:

1. Invoke `validateCredentials(creds, mockFetch)`.
2. Assert the mock received **> 1** probe request (a retry occurred — 429 is the
   one status the spike rule says to honour with backoff).
3. If the mock eventually returns 200, assert the final `Result.ok` identity;
   if it keeps returning 429, assert the documented terminal outcome
   (e.g. `AuthUnreachable` or a typed rate-limit error — record the chosen
   behaviour, see OQ-TP-4).
4. Assert a backoff delay was observed between attempts (e.g. fake timers / a
   reduced backoff constant injected for test speed).

**Expected Outcome**:

- A 429 triggers backoff + at least one retry (contrast with the no-retry
  401/403 cases). The terminal behaviour for a persistently-rate-limited probe
  is the documented one.

---

#### TC-VALIDATE-005 - Connection-refused / fetch rejects → `AuthUnreachable`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-3, DM-AUTH-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- One of: (a) a `Bun.serve()` mock started then immediately stopped (port
  closed → connection refused); or (b) an injected `fetch` that rejects with a
  `TypeError`/network error. Parametrize across both shapes.

**Steps**:

1. Invoke `validateCredentials(creds, failingFetch)`.
2. Assert `{ ok: false, error }` with `error.kind === "AuthUnreachable"`.
3. Assert the surfaced message does NOT contain the raw token.

**Expected Outcome**:

- A network-level failure (connection refused / fetch rejection) maps to the
  typed `AuthUnreachable` error — distinct from `InvalidCredentials`, so
  `doctor`/the user can tell "can't reach Confluence" from "bad token".

---

#### TC-VALIDATE-006 - Probe sends `Authorization: Basic …` header to the server

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-2, F-AUTH-3, DM-AUTH-1, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (`Bun.serve()` mock)
**Tags**: @backend, @api

**Preconditions**:

- A `Bun.serve()` mock that captures the incoming request headers.

**Steps**:

1. Invoke `validateCredentials(creds, mockFetch)`.
2. Assert the captured request included an `Authorization` header whose value is
   exactly the credentials' `authHeader` (`Basic <base64>`).

**Expected Outcome**:

- The probe authenticates with the opaque `authHeader` from the credentials
  object — the one place the Basic value is used; the raw token never appears as
  a separate field on the wire.

---

#### TC-VALIDATE-007 - DI seam: `validateCredentials` accepts + uses an injected `fetch` (app-tier purity)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-3, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `validateCredentials` is typed `(creds, fetch?) => Result<…, AuthError>`.

**Steps**:

1. Inject a custom `fetch` that records calls and returns a canned 200.
2. Invoke `validateCredentials(creds, injectedFetch)`.
3. Assert the injected `fetch` was the one called (call recorded) — i.e. the
   provider does NOT hard-couple to the global `fetch`.
4. Assert the app tier stays import-clean (no infra/networking import leaked
   into `src/app/`); this is enforced structurally by `check:boundaries` and
   asserted by not requiring a global mock here.

**Expected Outcome**:

- The DI seam holds: `validateCredentials` is app-tier-pure (no global-fetch
  coupling), which is what lets every other scenario inject a `Bun.serve()`
  mock instead of monkey-patching globals.

---

#### TC-ERRMAP-001 - Each new auth kind → stable `error.code` + `retryable` (exhaustive over all kinds)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-4, DM-AUTH-2, AC-6, NFR-OBS-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/cli-error-map.test.ts` (Existing – Update)
**Tags**: @backend, @api

**Preconditions**:

- The 4 new `AuthError` kinds have cases in `mapMarkSyncErrorToCommandError`.

**Steps**:

1. Extend the existing exhaustive table test (currently 13 kinds) to include
   the 4 new auth kinds: `MissingCredentials`, `InvalidBaseUrl`,
   `InvalidCredentials`, `AuthUnreachable`.
2. For each, assert a non-empty stable `error.code` string and a `retryable`
   boolean (per DEC-2 lineage: `MissingCredentials`/`InvalidBaseUrl` → not a
   retryable remote conflict; `InvalidCredentials` → not retryable (bad token);
   `AuthUnreachable` → retryable — transient network).
3. Assert the table now covers exactly the full kind set (13 + 4 = 17) — keeping
   the "covers exactly the N kinds — exhaustiveness" assertion truthful.
4. Assert each new message is built ONLY from structural fields and never echoes
   the raw token/email-body (DEC-5 — e.g. `MissingCredentials.missing[]` lists
   var names, never values).

**Expected Outcome**:

- Every new auth kind has a stable `code` + `retryable`; the mapper stays
  exhaustive (no `default`-arm compile gap); no message leaks credential
  material.

**Notes / Clarifications**:

- The exact `error.code` strings are stable-string delivery decisions (DEC-6);
  see OQ-TP-1. The test pins whatever strings the coder chooses, but they MUST
  be stable, documented, and unique per kind.

---

#### TC-ERRMAP-002 - New auth `error.code` strings resolve to documented exits via `codeToExitCode`

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-4, AC-6, NFR-OBS-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/exit-codes.test.ts` (Existing – Update)
**Tags**: @backend, @api

**Preconditions**:

- The new auth `error.code` strings have entries in `CODE_TO_EXIT`.

**Steps**:

1. Extend the existing `EXPECTED` record (the DEC-2 pinning table) with the 4
   new auth codes.
2. Assert `CODE_TO_EXIT` deep-equals the extended `EXPECTED`.
3. Assert every new auth code resolves, via `codeToExitCode`, to a value inside
   the documented 9-class set (auth-class kinds → `EXIT_AUTH` (20) where
   sensible; `AuthUnreachable` → a documented retry/network-appropriate exit —
   record the choice, OQ-TP-2).
4. Re-assert no exit falls outside the 9-class set.

**Expected Outcome**:

- The new auth codes each exit with a documented, machine-parseable code
  (NFR-OBS-1); the map stays in lock-step with the DEC-2 table.

**Notes / Clarifications**:

- Exact exit assignments are delivery decisions (OQ-TP-2). Auth-class errors
  should land on `EXIT_AUTH` (20) where the failure is credential-shaped.

---

#### TC-ERRMAP-003 - Exhaustiveness compile-check: missing switch → compile error; `bun run typecheck` exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-4, DM-AUTH-2, AC-6
**Test Type(s)**: Manual (compile gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: `src/domain/errors.ts` (union + `assertNeverMarkSyncError`), `src/app/cli-error-map.ts`, `src/cli/output/exit-codes.ts`; gate = `bun run typecheck`
**Tags**: @backend, @api

**Preconditions**:

- The 4 new kinds have been added to the `MarkSyncError` union AND to
  `assertNeverMarkSyncError` AND to `mapMarkSyncErrorToCommandError`.

**Steps**:

1. Run `bun run typecheck` (`tsc --noEmit` under the strict config).
2. Assert it exits 0.
3. (Reasoning, not an automated step) Confirm: if any of the 4 kinds were added
   to the union without a case in `assertNeverMarkSyncError` or
   `mapMarkSyncErrorToCommandError`, the `default` arm's `error` would stop being
   `never` and the build would fail — surfacing the gap at the definition site.

**Expected Outcome**:

- Zero type errors: the union and both exhaustive switches were updated together
  (the GH-15 NFR-3 precedent applied to the auth extension). This is part of the
  AC-6 `bun run check` gate.

---

#### TC-SEC-001 - INV-SEC-1: raw token absent from every captured `CommandResult` JSON + error message (integration-level)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-5, DM-AUTH-1, AC-4, INV-SEC-1, NFR-SEC-1, NFR-SEC-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend, @security, @api

**Preconditions**:

- A distinctive fake token is used everywhere the real token would be:
  `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` (matches the `atlassian-token` redactor
  pattern `\bAT(?:ATT|STS)[A-Za-z0-9_-]{8,}` so the defense-in-depth check in
  TC-SEC-003 is meaningful).
- A capture harness that, for each path, serializes the produced `CommandResult`
  to its JSON string AND captures every thrown/error `message` string.

**Steps**:

1. Run the provider across the **happy path** (all vars valid) and **every error
   path**: each-var-missing, all-missing, malformed base URL, 200, 401, 403,
   429, connection-refused.
2. For each path, capture: (a) the `JSON.stringify` of any `CommandResult` the
   provider produces; (b) the `message` of every `AuthError` surfaced.
3. Assert the fake-token substring `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` is
   **absent** from every captured string (the PRIMARY assertion — the provider
   never puts it there).
4. (Sanity) Confirm the captured set is non-empty (the assertion is not vacuous).

**Expected Outcome**:

- Across the full happy + error surface, zero captured serialized outputs
  contain the raw token. This is the release-blocking INV-SEC-1 guarantee,
  validated on real captured bytes — NOT a mock asserting "redact was called"
  (per the over-mocking guardrail, INV-SEC-1 must not be mock-only).

**Notes / Clarifications**:

- The provider must surface only the opaque `authHeader` and the masked email;
  the raw token must never be a field on `ConfluenceCredentials`, never
  interpolated into any error message, and never echoed in any `CommandResult`.
  This test is the load-bearing proof.

---

#### TC-SEC-002 - Email masked in surfaced messages; token never surfaced

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-AUTH-5, DM-AUTH-1, AC-5, NFR-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend, @security

**Preconditions**:

- A known raw email (`juliusz@cwiakalski.com`) and the fake token from
  TC-SEC-001 are used as the env values.

**Steps**:

1. Resolve credentials and capture every surfaced string (auth header, masked
   email, any error message).
2. Assert the masked form `j***@cwiakalski.com` appears wherever the email is
   surfaced.
3. Assert the raw email `juliusz@cwiakalski.com` does NOT appear in any surfaced
   error/`CommandResult` string (it is masked by construction).
4. Assert the raw token substring is absent (overlaps TC-SEC-001, restated here
   for the AC-5 "token never surfaced" contract).

**Expected Outcome**:

- Email is masked everywhere it is surfaced; the token is never surfaced. (The
  `authHeader` carries the base64 of `email:token` — that base64 blob is opaque
  and is NOT the raw token substring, which TC-SEC-001 already proves absent.)

---

#### TC-SEC-003 - Defense-in-depth: `redactString` catches the token — but the provider never emits it

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-AUTH-5, AC-4, INV-SEC-1, NFR-SEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts` (redactor side-check) + `tests/unit/cli/output/redact.test.ts` (Existing – No Change, regression)
**Tags**: @backend, @security

**Preconditions**:

- The GH-16 redactor (`redactString`) and its `atlassian-token` pattern are in
  place.

**Steps**:

1. Call `redactString` on a string containing the fake token
   `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9`.
2. Assert the token is replaced with `[REDACTED:atlassian-token]` (the redactor
   would catch it if it ever reached the output path).
3. Re-state (cross-reference TC-SEC-001): the PRIMARY guarantee is that the
   provider never emits the token in the first place; the redactor is
   defense-in-depth on top.

**Expected Outcome**:

- The redactor catches the token (NFR-SEC-2 defense-in-depth holds), but the
  release-blocking assertion remains TC-SEC-001: the provider never puts it
  there. Both layers are verified, in the order "construction first, redaction
  second".

## 6. Environments and Test Data

- **Environment:** local-dev (`bun:test` in-process). No live Confluence tenant,
  no network egress. The validation probe talks to a `Bun.serve()` mock on a
  random localhost port (the established pattern in
  `tests/integration/cli-output.test.ts`).
- **Runner:** `bun:test` (TDR-0004). Test roots `tests/unit/` and
  `tests/integration/` per `bunfig.toml`.
- **Fake credentials (deterministic):**
  - Token: `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` — distinctive, matches the
    `atlassian-token` redactor pattern (`\bAT(?:ATT|STS)[A-Za-z0-9_-]{8,}`), so
    both the construction-layer (TC-SEC-001) and redaction-layer (TC-SEC-003)
    assertions are meaningful. Never a real token; never committed elsewhere.
  - Email: `juliusz@cwiakalski.com` → masked `j***@cwiakalski.com`.
  - Base URL: `https://example.atlassian.net` (valid); malformed variants per
    TC-CRED-006/007.
- **Env-var handling:** unit tests set/restore the three canonical vars
  deterministically (prefer an injectable env source; otherwise save/restore
  `process.env` around each test so fixtures do not bleed). No real `.env` is
  loaded.
- **Mock server lifecycle:** each integration test starts its `Bun.serve()` on
  an ephemeral port, records request count/headers/body, and stops it in
  teardown. No shared mutable state between tests.
- **Isolation:** 429-backoff tests inject a reduced backoff constant (or fake
  timers) so the suite stays fast and deterministic.
- **No new runtime dependencies:** the provider uses native `fetch` and
  `Buffer.from(...).toString("base64")`/`btoa` (no HTTP lib, per typescript.md).
  No dependency-audit gate is introduced by this story beyond the repo-wide
  GH-14 license/vuln scan.

## 7. Automation Plan and Implementation Mapping

| TC ID(s) | Test file | Status | Mocking | Command |
|----------|-----------|--------|---------|---------|
| TC-CRED-001..009 | `tests/unit/app/credentials.test.ts` | To Implement | None (real env values + real base64/masking) | `bun test tests/unit/app/credentials.test.ts` |
| TC-VALIDATE-001..007 | `tests/integration/credentials.test.ts` | To Implement | `Bun.serve()` adapter-boundary mock (allowed) + injected `fetch` | `bun test tests/integration/credentials.test.ts` |
| TC-SEC-001, TC-SEC-002 | `tests/integration/credentials.test.ts` | To Implement | `Bun.serve()` mock; capture real serialized output (NOT a redact-was-called mock) | `bun test tests/integration/credentials.test.ts` |
| TC-SEC-003 | `tests/integration/credentials.test.ts` (+ `tests/unit/cli/output/redact.test.ts`) | Existing – No Change (redact) / To Implement (side-check) | None (real `redactString`) | `bun test tests/integration/credentials.test.ts` |
| TC-ERRMAP-001 | `tests/unit/app/cli-error-map.test.ts` | Existing – Update (13 → 17 kinds) | None (real error shapes) | `bun test tests/unit/app/cli-error-map.test.ts` |
| TC-ERRMAP-002 | `tests/unit/cli/output/exit-codes.test.ts` | Existing – Update (extend `EXPECTED`) | None | `bun test tests/unit/cli/output/exit-codes.test.ts` |
| TC-ERRMAP-003 | (type-level) `src/domain/errors.ts` + `src/app/cli-error-map.ts` + `src/cli/output/exit-codes.ts` | Existing – Update | None | `bun run typecheck` |
| AC-6 (gate) | all of the above + the union/switch updates | — | — | `bun run check` (lint + typecheck + test + boundaries) |

**Execution / ordering notes:**

- All Unit + Integration tests run in the fast CI loop
  (`bun test tests/unit/ tests/integration/`).
- TC-ERRMAP-003 (exhaustive compile safety) is enforced by `bun run typecheck`,
  which is part of `bun run check` (AC-6).
- Implement the 4 new `AuthError` arms + `assertNeverMarkSyncError` +
  `mapMarkSyncErrorToCommandError` + `CODE_TO_EXIT` **together** so the typed
  error channel and the exit-code map are consistent from the first commit
  (otherwise `bun run typecheck` fails immediately — by design).
- `F-AUTH-4` (union + switches) and `F-AUTH-1/2` (resolve + header) should land
  before/with the integration probe so `validateCredentials` can return the new
  kinds through the narrowed `Result<…, AuthError>` channel.
- **Only allowed mocks:** the `Bun.serve()` adapter-boundary mock (fault
  injection: 200/401/403/429/network) and the injected `fetch` DI seam. No
  mocking of resolution/masking/base64/error-mapping logic — per the
  over-mocking guardrail. INV-SEC-1 is asserted on real captured serialized
  output, not a redact-was-called spy.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| TR-1 | The `Basic ` header is built from the wrong material (wrong separator `email-token`, missing `Basic ` prefix) and silently authenticates with bad creds | H | TC-CRED-008 asserts byte-exact `Basic <base64(email:token)>` against a locally-computed expected value. |
| TR-2 | The token leaks into an error message or `CommandResult` field | H (release-blocking) | TC-SEC-001 captures every serialized output across happy + error paths and asserts the token substring absent; TC-SEC-003 verifies the redactor as defense-in-depth. Guardrail: integration-level, not mock-only. |
| TR-3 | The probe retries on 401/403 (spike rule violation) and hammers Confluence with a known-bad token | M | TC-VALIDATE-002/003 assert call count == 1; TC-VALIDATE-004 asserts 429 DOES retry (the one honoured status). |
| TR-4 | The exhaustive `never` switches silently break when the 4 new kinds land | M | TC-ERRMAP-003 (`bun run typecheck` gate) fails to compile if any switch is missed; TC-ERRMAP-001 keeps the "covers exactly N kinds" assertion truthful. Mirrors GH-15 NFR-3/RSK-2. |
| TR-5 | `validateCredentials` hard-couples to the global `fetch`, breaking app-tier purity (`check:boundaries`) | M | TC-VALIDATE-007 proves the DI seam; the app tier must not import networking. |
| TR-6 | 429 backoff makes the integration suite slow/flaky | L | Inject a reduced backoff constant (or fake timers) so TC-VALIDATE-004 is fast and deterministic. |

### 8.2 Assumptions

- GH-14 (MS2-E2-S1) and GH-16 (CLI framework + redaction, MS2-E2-S3) are merged
  and provide: `Result<T,E>`, the `MarkSyncError` union +
  `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`,
  `codeToExitCode`/`CODE_TO_EXIT`, the `Redactor`/`redactString`, the
  `CommandResult` shape, and the strict TS+Bun toolchain — all reusable. (Both
  dependencies are resolved per `chg-GH-17-pm-notes.yaml`.)
- The canonical env vars are exactly `MARKSYNC_CONFLUENCE_BASE_URL`,
  `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` (`.env.example` is the single
  source of truth). The scoped-token/gateway vars (`*_SCOPED`/`*_CLOUD_ID`) are
  NOT read in MS-0002.
- Classic API-token Basic auth is the only supported auth path for MS-0002 (H1
  PASS from the MS-0001 spike).
- The provider uses an injected `fetch` (DI) to keep `src/app/credentials.ts`
  app-tier-pure (testability + `check:boundaries`).
- `AuthError` is a 4-kind extension of `MarkSyncError` (MissingCredentials,
  InvalidBaseUrl, InvalidCredentials, AuthUnreachable) with an `AuthError` type
  alias analogous to `ConfigError = Extract<MarkSyncError, {…}>` (delivery
  decision recorded in `chg-GH-17-pm-notes.yaml`).

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | What exact stable `error.code` string + `retryable` does each new auth kind get in `mapMarkSyncErrorToCommandError`? | No (TC-ERRMAP-001 pins whatever is chosen) | @coder (delivery) | DEC-6 lineage: codes are stable strings. Suggested: `MISSING_CREDENTIALS`, `INVALID_BASE_URL`, `AUTH_INVALID`/`INVALID_CREDENTIALS`, `AUTH_UNREACHABLE` (retryable). Document + pin in the test. |
| OQ-TP-2 | Which numeric exit code does each new auth `code` resolve to? | No (TC-ERRMAP-002 pins the choice) | @coder (delivery) | Auth-class kinds → `EXIT_AUTH` (20) where credential-shaped; `AuthUnreachable` → a documented retry/network-appropriate exit. Record the DEC-2-table additions. |
| OQ-TP-3 | Are the provisional `F-AUTH-*` / `DM-AUTH-*` codes adopted verbatim by `chg-GH-17-spec.md` (when the specification phase runs)? | No | @spec-writer | This plan derives capability codes from the story deliverables because no spec exists yet. Reconcile when the spec lands; update the coverage tables if codes change. |
| OQ-TP-4 | What is the terminal outcome when the probe stays 429 past the backoff budget? | No (TC-VALIDATE-004 documents the chosen behaviour) | @coder (delivery) | Story says "honor 429 with backoff" but does not fix the terminal error kind. Likely `AuthUnreachable`; pin and assert. |
| OQ-TP-5 | Does `MissingCredentials`/`InvalidBaseUrl` accept an injectable env source (for clean unit tests), or do tests save/restore `process.env`? | No | @coder (delivery) | Prefer an injectable env source for hermetic unit tests; otherwise document the save/restore convention. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08T23:30:00Z | test-plan-writer (GH-17) | Initial test plan — 22 scenarios (TC-CRED-001..009 unit resolve/header/masking; TC-VALIDATE-001..007 integration probe via `Bun.serve`; TC-ERRMAP-001..003 error-map/exit-code/exhaustiveness extending existing tests; TC-SEC-001..003 INV-SEC-1 integration-level + defense-in-depth) traced to AC-1..AC-6, provisional F-AUTH-1..5 / DM-AUTH-1..2, NFR-SEC-1/2/6, NFR-OBS-1, INV-SEC-1. Derived from story `MS2-E2-S4--auth-provider.md` (authoritative — spec pending), `.ai/rules/testing-strategy.md` (Unit + Integration tiers; over-mocking guardrail → INV-SEC-1 at integration level), `doc/guides/security-baseline.md`, `doc/spec/nonfunctional.md`, and the existing `Result`/`MarkSyncError`/cli-error-map/exit-codes/redact primitives. E2E explicitly out of scope (adapter E3-S4 concern). |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(populated during delivery — phase 6 / quality_gates)_ | | | |
