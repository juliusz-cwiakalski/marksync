---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-17-auth-provider
status: Proposed
created: 2026-07-08T23:30:00Z
last_updated: 2026-07-08T23:30:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical, security, auth]
links:
  change_spec: ./chg-GH-17-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md
  typescript_rules: ../../../.ai/rules/typescript.md
  architecture: ../../../overview/architecture-overview.md
  nonfunctional: ../../../spec/nonfunctional.md
  feature_cli: ../../../spec/features/feature-cli.md
  env_example: ../../../../.env.example
  gh16_plan_precedent: ../2026-07-08--GH-16--cli-framework/chg-GH-16-plan.md
  gh15_plan_precedent: ../2026-07-07--GH-15--config-system/chg-GH-15-plan.md
summary: >
  Deliver the MS-0002 credential provider: a pure, application-tier
  `CredentialProvider` that resolves Confluence classic API-token auth
  (email + token + base URL) from the canonical env vars declared in
  `.env.example`, validates it against Confluence (`GET /wiki/api/v2/user/by-me`),
  and NEVER leaks the token in any output path. Adds an `AuthError` (one `Auth`
  arm with a nested `authKind` discriminator of 4 sub-kinds) to the exhaustive
  `MarkSyncError` union and threads it through all exhaustiveness sites
  (`src/domain/errors.ts`, `src/app/cli-error-map.ts`, `src/cli/output/exit-codes.ts`)
  as the `Result<_, AuthError>` channel. Network I/O is injected (`fetch`-like DI
  param defaulting to global `fetch`) so `src/app/credentials.ts` stays pure,
  unit-testable, and `check:boundaries`-clean. Email is masked; the token is
  consumed once to build the opaque `authHeader` and never retained.
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-17: [MS2-E2-S4] Auth provider (API-token from env)

## Context and Goals

This plan delivers the **credential provider** for MS-0002 (epic MS2-E2 —
Foundation, fourth story). It is the auth capability the Confluence adapter
(MS2-E3-S4) and `doctor` (MS2-E5-S2) will consume: resolve → validate → hand
back an opaque, ready-to-use auth header, with the raw token never surviving the
resolve call. Concretely it establishes:

- the **`AuthError` failure kind** — added to the exhaustive `MarkSyncError`
  union as ONE arm `{ kind: "Auth"; auth: AuthErrorDetail }` with a nested
  `authKind` discriminator of four sub-kinds (`MissingCredentials`,
  `InvalidBaseUrl`, `InvalidCredentials`, `AuthUnreachable`), plus a narrowed
  `AuthError` alias so the provider declares `Result<_, AuthError>` (mirrors the
  GH-15 `ConfigError` / `InvalidConfig` precedent — DEC-2);
- a **domain-owned credential value type** `ConfluenceCredentials`
  (`{ baseUrl; authHeader; email(masked); mode }`) at `src/domain/credentials.ts`
  so the future infra adapter can import it without importing the application
  tier (the architecture matrix forbids `infra → app`);
- the **`CredentialProvider`** at `src/app/credentials.ts` —
  `resolveCredentials()` → `Result<ConfluenceCredentials, AuthError>` reading
  `MARKSYNC_CONFLUENCE_BASE_URL` / `MARKSYNC_USER_EMAIL` / `MARKSYNC_API_TOKEN`,
  and `validateCredentials(creds)` → `Result<ConfluenceIdentity, AuthError>`
  issuing the user-by-me probe and mapping HTTP/network outcomes;
- **injected network I/O** (DEC-1) — both provider functions accept a `fetch`-
  like param (`typeof fetch`) defaulting to global `fetch`, so the application
  module imports **no** `#infra/*` and is unit-testable with a stub + integration-
  testable against a `Bun.serve` mock;
- the **email-masking + token-never-surfaced** guarantee (INV-SEC-1 / R-SEC-1 /
  NFR-SEC-6): the raw email is consumed once to build the opaque
  `authHeader = "Basic " + base64(email:token)`; the credentials object carries
  only the **masked** email (`j***@cwiakalski.com`); the raw token is never
  retained, logged, placed in any `CommandResult`/thrown error, or returned.

The plan is derived entirely from the authoritative story
`MS2-E2-S4--auth-provider.md` (6 deliverables, 6 testable ACs) and the two
governing decisions resolved at intake (DEC-1 injected fetch, DEC-2 `AuthError`
union shape). It invents no requirements.

> **Scope-source note.** The change spec `chg-GH-17-spec.md` (same folder) is the
> **contract authority**; at plan-authoring time it is not yet created
> (`specification` lifecycle phase pending — see `chg-GH-17-pm-notes.yaml`). This
> plan operationalizes the authoritative story file plus the intake
> `change_planning_summary`; where the spec later diverges, the spec wins on
> contract matters (AC wording, DEC table) and this plan is reconciled in a
> revision-log entry. The two binding decisions below are encoded as committed.

### Binding decisions

> The two decisions were resolved at intake (`chg-GH-17-pm-notes.yaml` — both are
> in-scope technical decisions, not human blockers). They are committed here;
> delivery must not re-litigate them.

- **DEC-1 — Injected `fetch` keeps the provider in the application tier
  (resolves the story's "file at `src/app/credentials.ts` does network I/O"
  tension).** `resolveCredentials` and `validateCredentials` each accept an
  injectable `fetch`-like param typed `typeof fetch`, defaulting to the global
  `fetch`. Consequences:
  - `src/app/credentials.ts` imports **only** `#domain/*` (`errors`, `result`,
    `credentials`) — never `#infra/*`, never `#cli/*`. This keeps the
    application tier pure and `check:boundaries` clean (the `app-may-not-import-
    cli` rule holds trivially; the no-`#infra/*` import is the load-bearing
    testability boundary the story's dep-cruiser note calls out).
  - Unit tests inject a stub `fetch` (synchronous response shaping); integration
    tests inject a `Bun.serve`-backed fetch (real HTTP, real status codes).
  - Production callers (the adapter in E3-S4, `doctor` in E5-S2) pass the global
    `fetch` (or the adapter's own configured client) — they own the I/O policy.
  - _Alternative rejected:_ placing the provider in `src/infra/`. Rejected because
    the architecture matrix (`architecture-overview.md` L90) explicitly classifies
    the Credential Provider as **application tier**, and because `resolveCredentials`
    (env → typed result, no network) is pure application logic that should not
    drag into the infra tier.
- **DEC-2 — `AuthError` is ONE `Auth` arm with a nested `authKind` discriminator
  (the option that keeps `mapMarkSyncErrorToCommandError` and `CODE_TO_EXIT`
  cleanest and exhaustiveness provable; mirrors the GH-15 `ConfigError`
  precedent).** The four sub-kinds surface as the `Result<_, AuthError>` channel
  of the provider; the stable `error.code` strings are exactly the four the
  intake summary names. Chosen shape:

  ```typescript
  // src/domain/errors.ts — added to the MarkSyncError union
  | { kind: "Auth"; auth: AuthErrorDetail };

  // The nested discriminated detail (domain-owned, exported alongside the arm)
  export type AuthErrorDetail =
    | { authKind: "MissingCredentials"; missing: readonly string[] }
    | { authKind: "InvalidBaseUrl"; baseUrl: string }
    | { authKind: "InvalidCredentials"; status: number }
    | { authKind: "AuthUnreachable"; cause: string };

  // Narrowed channel, exactly like ConfigError (GH-15 DEC-3).
  export type AuthError = Extract<MarkSyncError, { kind: "Auth" }>;
  ```

  The full auth-class mapping (extends the GH-16 DEC-2 table):

  | `authKind` | `error.code` (stable) | exit | retryable | class |
  |---|---|---|---|---|
  | `MissingCredentials` | `MISSING_CREDENTIALS` | 20 (`EXIT_AUTH`) | false | auth |
  | `InvalidBaseUrl` | `INVALID_BASE_URL` | 20 (`EXIT_AUTH`) | false | auth |
  | `InvalidCredentials` | `INVALID_CREDENTIALS` | 20 (`EXIT_AUTH`) | false | auth |
  | `AuthUnreachable` | `AUTH_UNREACHABLE` | 20 (`EXIT_AUTH`) | **true** | auth (retryable) |

  - **Why one arm, not four:** the top-level `mapMarkSyncErrorToCommandError`
    switch grows by exactly **one** `case "Auth"` (union 13 → 14 kinds, not 17),
    and `assertNeverMarkSyncError` grows by one `case`. The four stable codes are
    produced inside that single arm via an exhaustive sub-switch over `authKind`
    (its own `default: never`), so adding a future sub-kind is still a compile
    error — the same exhaustiveness guarantee, localized. This is the closest
    analog to `ConfigError` (one arm, one narrowed channel, consumed by one
    provider) and keeps the provider's `Result<_, AuthError>` a single clean
    type rather than a four-way `Extract` union.
  - **All four → `EXIT_AUTH` (20):** they share the auth error class (spec F-5).
    `AUTH_UNREACHABLE` is the only retryable one (transient network/rate-limit);
    the other three represent a configuration or credential problem the user must
    fix before retrying.
  - **`CODE_TO_EXIT` grows by four string keys** (all → 20), keyed by the stable
    code string just like every other row; it remains pure data (DEC-1 of GH-16
    — no domain import). The unknown-code → `EXIT_INTERNAL` fallback is unchanged.

### Critical ordering constraint

Per DEC-2 and the `typescript.md` "Adding a `MarkSyncError` kind" rule, the
`Auth` arm **and** every exhaustive consumer must be updated in the **same
commit**: `src/domain/errors.ts` (union + `assertNeverMarkSyncError`),
`src/app/cli-error-map.ts` (the `case "Auth"`), and `src/cli/output/exit-codes.ts`
(`CODE_TO_EXIT`). Adding the arm to `errors.ts` alone breaks `bun run typecheck`
— the mapper's `default: assertNeverMarkSyncError(err)` stops compiling because
`err` is no longer `never` after the existing cases. This is exactly the GH-15
"Phase 2 before Phase 4" discipline: **Phase 1 (the exhaustiveness update) is one
atomic, typecheck-green commit; the provider (Phase 2) consumes the already-stable
`AuthError` type.** We never merge a provider that references a not-yet-mapped
union arm.

### Open questions

- **`version_impact` (no field in the story).** Defaulting to `minor` per the
  GH-15 / GH-16 precedent (both bumped a minor for an equivalently additive
  foundation story) and the additive nature of a new error arm + a new app
  module + tests (no breaking contract change; the new `Auth` arm is purely
  additive to a `never`-checked union). The final phase applies `0.2.0 → 0.3.0`;
  confirm with the maintainer if the 0.x minor-vs-patch convention differs.
  *(Specification detail — no `@decision-advisor` escalation unless the
  maintainer disagrees.)*
- **429 backoff bounds (story "Honor 429 with backoff").** The validation probe
  honors HTTP 429 with a bounded exponential backoff (read `Retry-After` when
  present; cap retries at a small N, e.g. 2–3; total wait bounded). Persistent
  429 after the budget is exhausted → `AuthError{ authKind:"AuthUnreachable" }`
  (retryable). The exact N/wait-cap is a delivery-time tuning detail documented
  inline; it does not affect any AC (AC-3 only asserts 429 is *handled*, not the
  retry count). *(Specification detail.)*
- **v2 vs v1 user endpoint (story "v2 user/by-me or v1 user/current").** Primary
  path is `GET {baseUrl}/wiki/api/v2/user/by-me`; the v1 `user/current` fallback
  is deferred (v2 is the guaranteed MS-0002 path per the spike). The provider
  parses `{ accountId, displayName }` from the v2 response (manual narrowing —
  `zod` is not installed until E3, per `typescript.md`). If v2 returns an
  unexpected shape, map to `AuthUnreachable` (treat as a transient/API issue, not
  a credential failure). *(Specification detail.)*

## Scope

### In Scope

- **D-1** — `src/domain/errors.ts` (updated): add the `Auth` arm to
  `MarkSyncError`; export `AuthErrorDetail` + narrowed `AuthError` alias; extend
  `assertNeverMarkSyncError` with `case "Auth"` (DEC-2).
- **D-2** — `src/domain/credentials.ts` (new): domain-owned value types
  `ConfluenceCredentials` (`{ baseUrl; authHeader; email(masked); mode:"api-token" }`)
  and `ConfluenceIdentity` (`{ accountId; displayName }`) — placed in domain so
  the future infra adapter (E3-S4) can import them (infra → domain ✓; infra → app
  ✗).
- **D-3** — `src/app/cli-error-map.ts` (updated): add `case "Auth"` with an
  exhaustive sub-switch over `auth.authKind` → the four stable codes + redacted
  messages + retryable (DEC-2 table).
- **D-4** — `src/cli/output/exit-codes.ts` (updated): add `MISSING_CREDENTIALS`,
  `INVALID_BASE_URL`, `INVALID_CREDENTIALS`, `AUTH_UNREACHABLE` → `EXIT_AUTH`
  (20) to `CODE_TO_EXIT` (pure data; no domain import).
- **D-5** — `src/app/credentials.ts` (new): `resolveCredentials({ fetch? })` →
  `Result<ConfluenceCredentials, AuthError>`; `validateCredentials(creds,
  { fetch? })` → `Result<ConfluenceIdentity, AuthError>`; `maskEmail(email)` helper
  (DEC-1 injected fetch; classic API-token path only).
- **D-6** — Unit tests: provider (`tests/unit/app/credentials.test.ts` —
  resolve present/missing/malformed-url, base64 header, masking; validate via stub
  fetch), error-map auth arm (`tests/unit/app/cli-error-map.test.ts` extended),
  exit-code auth rows (`tests/unit/cli/output/exit-codes.test.ts` extended),
  domain union exhaustiveness (`tests/unit/domain/errors.test.ts` extended).
- **D-7** — Integration tests (`tests/integration/credentials.test.ts`):
  `validateCredentials` against a `Bun.serve` mock — 200 (identity), 401
  (InvalidCredentials), 403 (InvalidCredentials), 429 (backoff then
  AuthUnreachable), network error (AuthUnreachable).
- **D-8** — INV-SEC-1 security integration test (release-blocking): capture every
  `CommandResult`/thrown-error string produced by the provider (all `authKind`
  paths) and assert the raw token substring appears in NONE of them; assert the
  email is masked wherever surfaced.

### Out of Scope

- `keytar` OS keyring (OPEN-Q8; deferred — env-token is the guaranteed MS-0002
  path).
- OAuth 2.0 / 3LO and scoped tokens (post-MS-0002).
- Data Center PAT (MS-0009).
- Scoped-token / gateway path (`*_SCOPED` / `*_CLOUD_ID` vars) — explicitly NOT
  read in MS-0002 (spike deviation deferred).
- `--token-file` flag (Q1 — env-only keeps the surface minimal; recorded for
  future).
- Wiring `validateCredentials` into the `doctor` command UI (E5-S2 implements the
  UI; this story exposes the capability).
- The Confluence adapter consuming `ConfluenceCredentials` (E3-S4 — the type
  lands here so that story can import it from domain).
- Full system-spec reconciliation (`feature-cli.md` §3.3 auth detail,
  `security-baseline.md` credential-storage, `ubiquitous-language.md`
  Credential Provider entry) — flagged for lifecycle phase 7 (`@doc-syncer`).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, `architecture-overview.md` L197–202,
  enforced by `.dependency-cruiser.cjs`, severity `error`):
  - `src/domain/` imports **nothing** tiered. `errors.ts` and the new
    `credentials.ts` add no import (pure types).
  - `src/app/` may import `domain` (+ infra via ports); **not** `cli`.
    `src/app/credentials.ts` imports `#domain/*` only — DEC-1 keeps it free of
    `#infra/*` (no HTTP client, no `#infra/confluence/*`).
  - `src/cli/` may import `app` only — **not** `domain`, **not** `infra`.
    `exit-codes.ts` remains pure data (no domain import — GH-16 DEC-1).
  - `src/shared/` stays pure utilities.
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitAny`):
  type-only imports use `import type`; `array[i]` is `T | undefined`; the nested
  `AuthErrorDetail` discriminated union narrows cleanly under `exactOptionalPropertyTypes`
  (each sub-kind carries only its own fields).
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`,
  `#app/*`, …). No new alias required (`#domain/credentials` resolves via
  `#domain/*`).
- **No new runtime dependency** (`typescript.md`): native `fetch`, native
  `Buffer.from(...).toString("base64")`. No HTTP client lib, no crypto lib. The
  NFR-7 dependency envelope (`@cliffy`, `ajv`, `picocolors`, `yaml`) is unchanged.
- **Secret handling by construction** (INV-SEC-1 / NFR-SEC-1 / NFR-SEC-6 /
  R-SEC-1): the raw token is consumed inside `resolveCredentials` to build
  `authHeader` and is never stored on the returned object, never logged, never
  placed in an error. The credentials object's `email` field is **masked at
  construction**. The output-time `Redactor` (GH-16 Phase 3) is defense-in-depth
  on top — the provider must not rely on it.
- **Canonical env var names** (`.env.example` is the single source of truth per
  `AGENTS.md`): `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`,
  `MARKSYNC_API_TOKEN` — read by exact name; no synonyms.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-6).
- **Conventional Commits** (commitlint + husky); each phase = one logical commit;
  `bun run check:boundaries` green at every commit.
- **Version:** currently `0.2.0` (GH-16); final phase applies the
  `version_impact: minor` bump → `0.3.0`.

### Risks

- **RSK-1 — Raw token leaks through a thrown error / `CommandResult`**
  (INV-SEC-1 — the highest-severity risk for this story). Mitigated by
  construction: the token is a local variable inside `resolveCredentials`,
  consumed by `base64` and never assigned to any field of the returned
  `ConfluenceCredentials` or any `AuthError`; the credentials object carries only
  the masked email + opaque `authHeader`; `AuthErrorDetail` carries **no** token
  or raw-email field (only env-var names, the malformed `baseUrl`, the HTTP
  `status`, or a redacted/omitted network `cause`). Phase 5 is a dedicated,
  release-blocking integration test that greps every captured output path for the
  token substring.
- **RSK-2 — Exhaustiveness drift** (a new union arm without a handler). Mitigated
  by DEC-2's atomic Phase 1 (union + `assertNeverMarkSyncError` + mapper
  `case "Auth"` + nested `authKind` `never`-subswitch updated together) so omission
  is a compile error (NFR-3 / `typescript.md` "Adding a kind" rule).
- **RSK-3 — dep-cruiser violation** from the provider importing infra (e.g. a
  shared HTTP client). Mitigated by DEC-1 (injected `fetch`); `check:boundaries`
  runs every phase and the load-bearing assertion is
  `rg '#infra' src/app/credentials.ts` → empty.
- **RSK-4 — 429 / rate-limit handling loops or hangs.** Mitigated by a bounded
  backoff budget (read `Retry-After`; cap retries + total wait); exhaustion →
  `AuthUnreachable` (retryable), never an infinite loop. Integration-tested
  (Phase 4) with a mock that returns 429 then 200, and 429-forever.
- **RSK-5 — base URL validation rejects legitimate Confluence hosts** (over-strict
  `https` / host-shape check). Mitigated by a narrow check: must parse as a URL
  with `https:` protocol and a non-empty host; no allowlist of domains. Error
  message points to `.env.example`. Unit-tested at the boundary (Phase 3).
- **RSK-6 — v2 user response shape drift** (Confluence changes the payload).
  Mitigated by manual narrowing on the documented `{ accountId, displayName }`
  fields with a tolerant fallback (missing fields → `AuthUnreachable`, not a
  crash); `zod` is deferred to E3 per `typescript.md`.

### Success Metrics

- All three env vars present + valid → `resolveCredentials` returns a
  `ConfluenceCredentials` whose `authHeader` starts with `"Basic "` and decodes to
  `email:token` (AC-1).
- Any required var missing/empty → `AuthError{ auth: { authKind:
  "MissingCredentials", missing:[…] } }` naming the missing var(s) with a fix
  suggestion linking `.env.example` (AC-2).
- `validateCredentials` against a mock 200 → `ConfluenceIdentity`; 401/403 →
  `InvalidCredentials`; network error → `AuthUnreachable`; 429 honored with
  backoff (AC-3).
- No test path produces output containing the raw token — asserted by capturing
  every `CommandResult`/thrown-error string from the provider and grepping for the
  token substring (AC-4 / INV-SEC-1).
- Email is masked (`j***@host`) in every surfaced message; the token is never
  surfaced (AC-5).
- `bun run check` (lint + format:check + typecheck + test + check:boundaries)
  exits 0 (AC-6).

## Phases

> Each phase is one logical Conventional Commit and is independently verifiable
> by the listed command(s). Files are listed as `path (new | updated)`. Tier
> placements respect the dependency-direction matrix (see Constraints) and DEC-1
> (no `#infra/*` in `src/app/credentials.ts`). `bun run check:boundaries` is run
> in **every** phase so the dep-cruiser invariant holds at every commit.

---

### Phase 1: Extend MarkSyncError with the Auth arm + update all exhaustiveness sites

**Goal**: Add the `AuthError` failure kind to the exhaustive `MarkSyncError`
union (DEC-2 — one `Auth` arm with a nested `authKind` discriminator) **and**
update every exhaustive consumer in the same atomic, typecheck-green commit: the
domain `assertNeverMarkSyncError`, the application-tier mapper
(`mapMarkSyncErrorToCommandError`), and the presentation-tier exit-code map. This
is the GH-15 "Phase 2 before Phase 4" discipline: the typed error channel is
consistent from the first provider commit (NFR-3 / RSK-2). Lands **before** the
provider (Phase 2).

**Tasks**:

- [ ] **1.1** In `src/domain/errors.ts` (updated), add the `Auth` arm to the
      `MarkSyncError` union: `| { kind: "Auth"; auth: AuthErrorDetail }`. Export
      the nested discriminated `AuthErrorDetail` (four sub-kinds per DEC-2) and
      the narrowed `AuthError = Extract<MarkSyncError, { kind: "Auth" }>` alias
      (mirrors the `ConfigError` precedent). Document the four sub-kinds and the
      INV-SEC-1 invariant (no token / raw-email field on any sub-kind) in a
      leading comment citing DEC-2 + INV-SEC-1.
- [ ] **1.2** Extend `assertNeverMarkSyncError` in `src/domain/errors.ts` with
      `case "Auth":` so the `default` arm's `error` stays `never` (NFR-3). Refresh
      the file's kind-count comment references (13 → 14 kinds).
- [ ] **1.3** In `src/app/cli-error-map.ts` (updated), add `case "Auth":` to
      `mapMarkSyncErrorToCommandError`. Inside it, an exhaustive sub-switch over
      `err.auth.authKind` produces the four stable codes + redacted messages +
      retryable per the DEC-2 table:
      - `MissingCredentials` → `MISSING_CREDENTIALS`, retryable false, message
        names the `missing[]` env var(s) + links `.env.example` (the var names are
        structural identifiers, safe to surface);
      - `InvalidBaseUrl` → `INVALID_BASE_URL`, retryable false, generic message
        ("the configured Confluence base URL is invalid; see .env.example") —
        **never** interpolates the raw `baseUrl` value (it could carry a host;
        DEC-5 redaction-at-source);
      - `InvalidCredentials` → `INVALID_CREDENTIALS`, retryable false, message
        references the HTTP `status` (401/403) only;
      - `AuthUnreachable` → `AUTH_UNREACHABLE`, retryable **true**, generic
        message ("could not reach Confluence to validate credentials") — **never**
        interpolates `cause` (raw network/exception text — DEC-5);
      - `default:` → `const _exhaustive: never = err.auth;` (compile error on a
        new sub-kind). Update the module's DEC-2 comment table with the four auth
        rows.
- [ ] **1.4** In `src/cli/output/exit-codes.ts` (updated), add four entries to
      `CODE_TO_EXIT`: `MISSING_CREDENTIALS`, `INVALID_BASE_URL`,
      `INVALID_CREDENTIALS`, `AUTH_UNREACHABLE` → all `EXIT_AUTH` (20). No domain
      import (pure data — GH-16 DEC-1). Refresh the leading DEC-2 table comment
      with the four auth rows.
- [ ] **1.5** Extend `tests/unit/domain/errors.test.ts` — assert the union stays
      exhaustive (a `default: assertNeverMarkSyncError(error)` over a `MarkSyncError`
      compiles) and that an `Auth` value with each `authKind` is a valid
      `MarkSyncError` / `AuthError`.
- [ ] **1.6** Extend `tests/unit/app/cli-error-map.test.ts` — add the `Auth` arm
      to the per-kind table (one representative error per `authKind`) asserting
      each `{ code, retryable }` per DEC-2; add the DEC-3 leak suite for the auth
      arm (inject token-shaped strings into `cause`; assert none surface in
      `message`).
- [ ] **1.7** Extend `tests/unit/cli/output/exit-codes.test.ts` — add the four
      auth codes to the `EXPECTED` table (all → 20) so `CODE_TO_EXIT.toEqual`
      + per-row cases cover the new rows (TS-9 precedent).

**Acceptance Criteria**:

- Must: `bun run typecheck` exits 0 — the top-level `never`-check **and** the
      nested `authKind` sub-switch `never`-check are intact (AC-6 precondition /
      NFR-3 / RSK-2).
- Must: `mapMarkSyncErrorToCommandError` on each `authKind` yields the DEC-2
      `{ code, retryable }` exactly (the four stable codes;
      `AUTH_UNREACHABLE` is the only retryable auth code).
- Must: `codeToExitCode` resolves each of the four auth codes to `EXIT_AUTH`
      (20); the `EXPECTED` table matches `CODE_TO_EXIT` exactly.
- Must: `check:boundaries` clean — `errors.ts` imports nothing tiered;
      `cli-error-map.ts` imports `#domain/*` only; `exit-codes.ts` imports
      nothing (DEC-1 / GH-16 DEC-1).
- Should: no auth `message` interpolates `baseUrl`/`cause`/token/email values
      (DEC-5 redaction-at-source; proven by the Phase-1.6 leak suite).

**Files and modules**:

- Code areas: `src/domain/errors.ts` (updated), `src/app/cli-error-map.ts`
  (updated), `src/cli/output/exit-codes.ts` (updated).
- System docs: none (the union doc in `typescript.md` §"Error handling" may be
  refreshed opportunistically in the final phase; full reconciliation is
  lifecycle phase 7).

**Tests**:

- `bun test tests/unit/domain/errors.test.ts`
- `bun test tests/unit/app/cli-error-map.test.ts`
- `bun test tests/unit/cli/output/exit-codes.test.ts`
- `bun run typecheck` (the load-bearing check — NFR-3); `bun run check:boundaries`.

**Completion signal**: `feat(errors): add Auth arm to MarkSyncError and map to auth exit codes`

---

### Phase 2: Domain credential value types + the application-tier CredentialProvider

**Goal**: Deliver D-2 and D-5 — the domain-owned credential/identity value types
(placed in domain so the future infra adapter can import them) and the
application-tier `CredentialProvider` with injected `fetch` (DEC-1). The provider
resolves classic API-token auth from the canonical env vars, builds the opaque
`Basic` header, masks the email, and validates against the user-by-me probe —
returning `Result<_, AuthError>` on every failure path (never `throw` for expected
cases).

**Tasks**:

- [ ] **2.1** Create `src/domain/credentials.ts` (new) — domain value types:
      - `ConfluenceCredentials = { baseUrl: string; authHeader: string; email:
        string; mode: "api-token" }`. The `email` field holds the **masked** email
        (constructed masked in the provider); `authHeader` is the opaque
        `"Basic …"` string. A leading comment cites the INV-SEC-1 invariant (no
        raw token / raw email on this object).
      - `ConfluenceIdentity = { accountId: string; displayName: string }` — the
        success payload of `validateCredentials`.
      - `AuthProviderOptions = { fetch?: typeof fetch }` — the injected-fetch DI
        shape (DEC-1). Defined in domain so both the provider signature and
        callers share one type without the app tier re-declaring it.
- [ ] **2.2** Create `src/app/credentials.ts` (new) — the `CredentialProvider`:
      - `resolveCredentials({ fetch }?: AuthProviderOptions): Result<
        ConfluenceCredentials, AuthError>`. Reads `MARKSYNC_CONFLUENCE_BASE_URL`,
        `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` (exact names from
        `.env.example`). Missing/empty var(s) → `Result.err({ kind:"Auth", auth:
        { authKind:"MissingCredentials", missing:[…] } })` listing the missing var
        names. Malformed `baseUrl` (not `https:`, empty host) → `Result.err({
        kind:"Auth", auth:{ authKind:"InvalidBaseUrl", baseUrl } })`. On success:
        build `authHeader = "Basic " + Buffer.from(\`${email}:${token}\`).toString
        ("base64")`, return `Result.ok({ baseUrl, authHeader, email:
        maskEmail(email), mode:"api-token" })`. The raw `token` is a local
        variable — never stored on the result, never on an error.
      - `validateCredentials(creds, { fetch }?: AuthProviderOptions): Promise<
        Result<ConfluenceIdentity, AuthError>>`. Issues
        `GET ${creds.baseUrl}/wiki/api/v2/user/by-me` with header
        `Authorization: ${creds.authHeader}` via the injected `fetch` (DEC-1).
        Map outcomes: 200 + parseable `{accountId, displayName}` →
        `Result.ok(identity)`; 401/403 → `Result.err({ authKind:
        "InvalidCredentials", status })` (no retry — spike rule); 429 → bounded
        backoff (read `Retry-After`; capped retries/wait — RSK-4) then retry;
        exhaustion or non-429 network/`fetch` throw → `Result.err({ authKind:
        "AuthUnreachable", cause: <redacted/omitted> })`; unexpected 200 shape →
        `AuthUnreachable` (RSK-6). The `cause` is captured for logging context
        but **must** be redacted/omitted at the output boundary (DEC-5 / Phase 1
        mapper never interpolates it).
      - `maskEmail(email: string): string` — `email[0] + "***" + email.slice(
        email.indexOf("@"))` (e.g. `juliusz@cwiakalski.com` → `j***@cwiakalski.com`);
        tolerant of malformed input (no `@` → mask the whole local part).
      - Imports: `#domain/errors`, `#domain/result`, `#domain/credentials` only.
        `rg '#infra' src/app/credentials.ts` → empty (DEC-1 — load-bearing).
- [ ] **2.3** Inline documentation touch-ups: a ≤ 3-line file header on
      `src/app/credentials.ts` citing the story + DEC-1 (injected fetch) +
      INV-SEC-1; no spec restatement (per `typescript.md` "Comments"). Reserve
      JSDoc for the INV-SEC-1 invariant on the credentials object (a non-obvious
      security boundary) — not for signature restatements.

**Acceptance Criteria**:

- Must: `src/app/credentials.ts` imports `#domain/*` only — `rg '#infra'
      src/app/credentials.ts` empty; `check:boundaries` clean (DEC-1 / RSK-3).
- Must: `resolveCredentials` returns a `ConfluenceCredentials` whose `authHeader`
      starts with `"Basic "` and whose `email` is masked, when all env vars are
      present + valid (AC-1 / AC-5 precondition).
- Must: missing env var → `Result.err` with `authKind:"MissingCredentials"` +
      `missing[]` naming the var(s) (AC-2); malformed base URL →
      `authKind:"InvalidBaseUrl"` (AC-2 boundary).
- Must: the raw token is a local variable in `resolveCredentials` — it is not a
      field of `ConfluenceCredentials` nor of any `AuthErrorDetail` sub-kind
      (INV-SEC-1 / RSK-1).
- Must: `bun run typecheck` exits 0 under strict + `exactOptionalPropertyTypes`.

**Files and modules**:

- Code areas: `src/domain/credentials.ts` (new), `src/app/credentials.ts` (new).
  Consumes Phase 1 (`errors` — `AuthError`/`AuthErrorDetail`; `result`).
- System docs: none.

**Tests**:

- `bun run typecheck`; `bun run check:boundaries` (DEC-1 load-bearing).
- `rg '#infra' src/app/credentials.ts` → empty.
- (Provider behavior is unit-tested in Phase 3; this phase lands the module
  compiling + boundaries-clean so Phase 3 tests have a target.)

**Completion signal**: `feat(app): add credential provider with injected fetch`

---

### Phase 3: Provider unit tests (resolve, masking, header, validate-stub)

**Goal**: Deliver the provider unit-test matrix (D-6 provider portion). Uses a
stub `fetch` for `validateCredentials` (no network) so the probe's outcome
mapping is fast and deterministic; `resolveCredentials` is pure env logic.

**Tasks**:

- [ ] **3.1** Create `tests/unit/app/credentials.test.ts` (new) — uses import
      aliases (`#app/credentials`, `#domain/errors`, `#domain/credentials`); sets
      and restores `process.env` per test.
      - **TC-AUTH-001 (AC-1):** all three env vars present + valid `https` base
        URL → `Result.ok`; `authHeader` starts with `"Basic "`; decoding the
        base64 payload yields `email:token`; `email` is masked; `mode ===
        "api-token"`.
      - **TC-AUTH-002..004 (AC-2):** each single var missing (BASE_URL / EMAIL /
        TOKEN) → `authKind:"MissingCredentials"` with `missing[]` naming exactly
        that var; multiple missing → all named; the error message references
        `.env.example`.
      - **TC-AUTH-005 (AC-2):** empty-string var treated as missing.
      - **TC-AUTH-006 (AC-2 boundary / RSK-5):** malformed base URL (`http://`,
        bare `atlassian.net`, empty, non-URL) → `authKind:"InvalidBaseUrl"`; a
        valid `https://example.atlassian.net` is accepted.
      - **TC-AUTH-007 (AC-5):** `maskEmail` produces `j***@host` for a normal
        address; degrades safely on malformed input.
      - **TC-AUTH-008 (AC-3):** `validateCredentials` with a stub `fetch`
        returning a 200 `{ accountId, displayName }` → `Result.ok(identity)`.
      - **TC-AUTH-009 (AC-3):** stub 401 → `authKind:"InvalidCredentials"`,
        `status:401`; stub 403 → same, `status:403`.
      - **TC-AUTH-010 (AC-3):** stub `fetch` that throws (network) →
        `authKind:"AuthUnreachable"` (retryable true via the Phase-1 mapper).
      - **TC-AUTH-011 (AC-3 / RSK-4):** stub that returns 429 once then 200 →
        `Result.ok` after the backoff; stub that returns 429 forever →
        `authKind:"AuthUnreachable"` (bounded — no hang).
      - **TC-AUTH-012 (AC-5 / INV-SEC-1 unit guard):** construct every `authKind`
        error via the provider; the returned `error` object contains no field
        whose value equals the raw token (defense-in-depth before the Phase-5
        capture-and-grep).
- [ ] **3.2** Confirm the stub `fetch` is injected via the `AuthProviderOptions`
      param (DEC-1) — never monkeypatches the global `fetch` (keeps tests
      hermetic and proves the DI seam works).

**Acceptance Criteria**:

- Must: TC-AUTH-001 proves the happy path (AC-1) including the `Basic` header
      decode round-trip + masked email.
- Must: TC-AUTH-002..006 prove every `resolveCredentials` failure path returns
      the correct `authKind` with the right `missing[]`/`baseUrl` (AC-2).
- Must: TC-AUTH-008..011 prove every `validateCredentials` outcome via the
      injected stub `fetch` (AC-3), including bounded 429 backoff.
- Must: TC-AUTH-012 confirms no provider-produced error object carries the raw
      token as a field value (INV-SEC-1 unit-level guard; Phase 5 strengthens to
      captured-output grep).
- Should: 100% line coverage on `src/app/credentials.ts` (the bounded-backoff
      exhaustion line is the only likely gap; cover it with TC-AUTH-011).

**Files and modules**:

- Code areas: `tests/unit/app/credentials.test.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/credentials.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `test(app): add credential provider unit tests`

---

### Phase 4: Integration tests — validateCredentials against a Bun.serve mock

**Goal**: Deliver D-7 — prove the validation probe against a **real** HTTP server
(`Bun.serve`), not a stub. This validates the injected-`fetch` seam end-to-end
against genuine status codes and network failures (the over-mocking guardrail:
AC-3 holds on real HTTP bytes, not a mock that asserts "fetch was called").

**Tasks**:

- [ ] **4.1** Create `tests/integration/credentials.test.ts` (new). Each test
      spins up a `Bun.serve` on an ephemeral port, builds a
      `ConfluenceCredentials` pointing at it, calls `validateCredentials(creds)`
      (global `fetch` resolves to the local server), and asserts the outcome;
      `server.stop()` in a cleanup. Mirror the spawn/server pattern from
      `tests/integration/cli-output.test.ts`.
      - **TC-INT-AUTH-001 (AC-3):** server returns 200
        `{ accountId:"abc", displayName:"Jane" }` → `Result.ok(identity)` with
        those exact fields; assert the request carried `Authorization: Basic …`.
      - **TC-INT-AUTH-002 (AC-3):** server returns 401 →
        `authKind:"InvalidCredentials"`, `status:401` (no retry observed — single
        request).
      - **TC-INT-AUTH-003 (AC-3):** server returns 403 →
        `authKind:"InvalidCredentials"`, `status:403`.
      - **TC-INT-AUTH-004 (AC-3 / RSK-4):** server returns 429 (with
        `Retry-After: 0`) once then 200 → `Result.ok` after the bounded backoff
        (assert ≥ 2 requests reached the server).
      - **TC-INT-AUTH-005 (AC-3 / RSK-4):** server returns 429 forever →
        `authKind:"AuthUnreachable"` within the bounded budget (assert the call
        returns, does not hang; assert a finite upper-bound on request count).
      - **TC-INT-AUTH-006 (AC-3):** network error — point `baseUrl` at a closed
        port (server stopped) → `authKind:"AuthUnreachable"` (retryable).
- [ ] **4.2** Assert no captured request log / response body leaks the token: the
      server handler records the `Authorization` header it received but the test
      never asserts on the raw token string in a way that could echo it to output;
      the INV-SEC-1 capture-and-grep is the dedicated Phase 5.

**Acceptance Criteria**:

- Must: TC-INT-AUTH-001..006 prove every `validateCredentials` HTTP/network
      outcome on a real `Bun.serve` (AC-3) — 200 identity, 401/403 →
      InvalidCredentials, 429 → bounded backoff (success or exhaustion),
      network error → AuthUnreachable.
- Must: the 429-forever case returns (bounded budget) — no hang (RSK-4).
- Must: the injected-`fetch` seam works with the global `fetch` against a real
      local server (DEC-1 proven at the integration tier).
- Must: `check:boundaries` clean (the test imports `#app/credentials` + Bun APIs
      only — no `#infra/*`).

**Files and modules**:

- Code areas: `tests/integration/credentials.test.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/integration/credentials.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `test(app): add credential provider integration tests`

---

### Phase 5: INV-SEC-1 security integration test (release-blocking)

**Goal**: Deliver D-8 — the dedicated, release-blocking security test that proves
**no captured output path emits the raw token**, and that the email is masked
wherever surfaced (AC-4 / AC-5 / INV-SEC-1 / R-SEC-1 / NFR-SEC-6). This is the
single most important test of the story; if it fails, the change does not ship.

**Tasks**:

- [ ] **5.1** Create `tests/integration/credentials-security.test.ts` (new) —
      INV-SEC-1 capture-and-grep. Use a distinct, easily-greppable synthetic token
      (e.g. `MARKSYNC_API_TOKEN=SECRET_TOKEN_DO_NOT_LEAK_0123456789abcdef`).
      For **every** provider path, capture every string the provider yields — the
      `Result` value/error object serialized (`JSON.stringify`), any message
      field, and (via the Phase-1 mapper) the `{ code, message, retryable }`
      produced from each `AuthError` — into a single `captured: string[]`. Then
      assert the raw token substring appears in **none** of them.
      - **Paths exercised (resolveCredentials):** all-present success (the
        `ConfluenceCredentials` object), each missing var (3× MissingCredentials),
        malformed base URL (InvalidBaseUrl).
      - **Paths exercised (validateCredentials):** 200 (identity), 401/403
        (InvalidCredentials), 429-exhausted + network (AuthUnreachable) — via a
        `Bun.serve` or stub `fetch`.
      - **Assertions (AC-4 / AC-5):**
        - `for (const s of captured) expect(s).not.toContain(rawToken)` — the
          release-blocking assertion;
        - every surfaced email is the masked form (`j***@…`); the raw email
          appears in **no** captured string except where explicitly required
          (nowhere, by construction);
        - the `AuthErrorDetail.cause` (AuthUnreachable) — if it captured any
          network text — does not contain the token (and the Phase-1 mapper
          message omits `cause` entirely).
- [ ] **5.2** Cross-check against the GH-16 output-time `Redactor`: route a
      `CommandResult` built from a provider `AuthError` through the real
      `OutputService.emit` (injectable streams) and assert the captured
      stdout/stderr contains no token — proving the provider's source-level
      guarantee + the output-time redactor compose (defense-in-depth per
      `typescript.md` Logging conventions). This is the same real-bytes
      capture pattern as `tests/integration/cli-output.test.ts` TC-INT-001.

**Acceptance Criteria**:

- Must: **no captured output path contains the raw token substring** — the
      release-blocking assertion (AC-4 / INV-SEC-1). If this fails, the change
      does not ship.
- Must: the email is masked (`j***@host`) in every surfaced message; the raw
      email appears nowhere in captured output (AC-5).
- Must: the `AuthError` → `CommandResult` → `OutputService.emit` chain emits no
      token on stdout **or** stderr (defense-in-depth with the GH-16 Redactor).
- Must: every `authKind` path is exercised (no path escapes the capture).

**Files and modules**:

- Code areas: `tests/integration/credentials-security.test.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/integration/credentials-security.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `test(app): add INV-SEC-1 credential no-leak integration test`

---

### Phase 6: Boundaries verification, version bump, and finalize

**Goal**: Verify the load-bearing dep-cruiser invariant (the application tier
imports no `#infra/*`; DEC-1), apply the `version_impact: minor` bump per repo
conventions, run the final full quality gate, and confirm every AC has a passing
test with no stray placeholders. Full system-spec reconciliation is lifecycle
phase 7 (`@doc-syncer`); this phase does only trivial inline touch-ups.

**Tasks**:

- [ ] **6.1** **Boundaries verification (the load-bearing DEC-1 check):** confirm
      `rg '#infra' src/app/credentials.ts` → empty; `rg '@cliffy|#infra' src/app/
      src/domain/` → empty; `bun run check:boundaries` exits 0 (the new
      `src/domain/credentials.ts` and `src/app/credentials.ts` introduce no tier
      violation). Record the module count from `depcruise src` in the execution
      log.
- [ ] **6.2** Apply the version bump per repo conventions for
      `version_impact: minor`: `package.json` `0.2.0` → `0.3.0`; update the
      `src/cli/index.ts` version string to match (lock-step with `package.json`
      until a runtime version source is wired — GH-15/GH-16 precedent). Confirm
      with the maintainer if the 0.x minor-vs-patch convention differs (Open
      questions).
- [ ] **6.3** Inline documentation touch-ups (full doc-sync is lifecycle phase 7):
      ensure `src/domain/errors.ts`, `src/app/credentials.ts`, and
      `src/domain/credentials.ts` have compliant ≤ 3-line headers citing the
      load-bearing decision (DEC-1 / DEC-2 / INV-SEC-1) at the decision point
      only — no tier-rule essays, no bare compliance tags (`typescript.md`
      "Comments"). Flag the following for `@doc-syncer` (do NOT rewrite here):
      `feature-cli.md` §3.3 auth detail; `security-baseline.md` credential-storage
      (env-token, no keyring for MS-0002); `ubiquitous-language.md` Credential
      Provider entry; `nonfunctional.md` NFR-SEC-6 traceability;
      `typescript.md` §"Error handling" 8-kind → 14-kind illustration refresh.
- [ ] **6.4** Final review sweep: confirm all phase tasks are checked, every AC
      (AC-1..AC-6) has a passing test mapped in the Test Scenarios table, and
      there are no stray `<...>` placeholders or TODOs in shipped code
      (`rg "TODO|FIXME|XXX|HACK" src/` → none).
- [ ] **6.5** Run the full quality gate: `bun run check` (lint + format:check +
      typecheck + test + check:boundaries) — must exit 0 (AC-6 / NFR-6).
      Re-confirm DEC-1 (`rg '#infra' src/app/credentials.ts` → empty) and that the
      Phase-5 INV-SEC-1 test is green.

**Acceptance Criteria**:

- Must: `rg '#infra' src/app/credentials.ts` → empty; `check:boundaries` 0
      violations (DEC-1 / RSK-3 — the load-bearing app-tier purity invariant).
- Must: version bumped per `version_impact: minor` (`0.2.0 → 0.3.0`).
- Must: `bun run check` exits 0 (AC-6 / NFR-6); the Phase-5 INV-SEC-1 test green.
- Must: every AC (AC-1..AC-6) maps to ≥ 1 passing test (Test Scenarios table);
      no stray placeholders/TODOs in shipped code.
- Should: doc-sync items flagged for `@doc-syncer` recorded in
      `chg-GH-17-pm-notes.yaml` for lifecycle phase 7.

**Files and modules**:

- Code areas: `package.json` (version bump), `src/cli/index.ts` (version string),
  ≤ 3-line header touch-ups in `src/domain/errors.ts` /
  `src/app/credentials.ts` / `src/domain/credentials.ts`.
- System docs: none rewritten here (flagged for lifecycle phase 7 /
      `@doc-syncer`).

**Tests**:

- `bun run check` (the full gate — AC-6).
- `rg '#infra' src/app/credentials.ts` → empty (DEC-1).

**Completion signal**: `feat(app): finalize auth provider and bump version`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TS-1 | All three env vars present + valid `https` base URL → `resolveCredentials` returns `ConfluenceCredentials` with a `Basic …` header that decodes to `email:token`; `email` masked; `mode:"api-token"` | 2, 3 | AC-1 |
| TS-2 | Any required env var missing/empty → `AuthError{ auth:{ authKind:"MissingCredentials", missing:[…] } }` naming the var(s) + `.env.example` fix | 2, 3 | AC-2 |
| TS-3 | Malformed base URL (`http:`, bare host, empty) → `authKind:"InvalidBaseUrl"`; valid `https://…atlassian.net` accepted | 2, 3 | AC-2 / RSK-5 |
| TS-4 | `validateCredentials` against `Bun.serve` 200 → `ConfluenceIdentity`; 401/403 → `InvalidCredentials`; network error (closed port) → `AuthUnreachable` | 2, 4 | AC-3 |
| TS-5 | `validateCredentials` against 429 (with `Retry-After`) then 200 → `Result.ok` after bounded backoff; 429-forever → `AuthUnreachable` within budget (no hang) | 2, 4 | AC-3 / RSK-4 |
| TS-6 | **INV-SEC-1:** no captured output path (`Result` value/error serialized, mapper `{code,message,retryable}`, `OutputService.emit` stdout/stderr) contains the raw token substring | 2, 5 | AC-4 / INV-SEC-1 |
| TS-7 | Email masked (`j***@host`) in every surfaced message; raw email appears nowhere in captured output | 2, 5 | AC-5 |
| TS-8 | `bun run check` (lint + format:check + typecheck + test + boundaries) exits 0 | 6 | AC-6 / NFR-6 |
| TS-9 | `mapMarkSyncErrorToCommandError` on each `authKind` → DEC-2 `{ code, retryable }`; `AUTH_UNREACHABLE` is the only retryable auth code | 1 | DEC-2 / NFR-3 |
| TS-10 | `codeToExitCode` resolves each of the four auth codes to `EXIT_AUTH` (20); `EXPECTED` table matches `CODE_TO_EXIT` | 1 | DEC-2 / NFR-OBS-1 |
| TS-11 | The `Auth` arm + nested `authKind` sub-switch are exhaustive — adding a sub-kind without a case is a compile error (`bun run typecheck` load-bearing) | 1 | NFR-3 / RSK-2 |
| TS-12 | `rg '#infra' src/app/credentials.ts` → empty; `check:boundaries` clean (DEC-1 app-tier purity) | 2, 6 | DEC-1 / RSK-3 |
| TS-13 | `resolveCredentials` injects/uses no global `fetch` (pure env logic); `validateCredentials` uses the injected `fetch` (stub in unit, global in integration) | 2, 3, 4 | DEC-1 |
| TS-14 | No `AuthErrorDetail` sub-kind carries a token or raw-email field (source-level INV-SEC-1 guard; Phase 5 strengthens to captured-output grep) | 1, 2 | AC-4 / RSK-1 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S4--auth-provider.md` | Scope |
| Change spec (contract authority — to be created) | `./chg-GH-17-spec.md` | Spec |
| PM notes | `./chg-GH-17-pm-notes.yaml` | Orchestration |
| Sibling plan (phase precedent) | `../2026-07-08--GH-16--cli-framework/chg-GH-16-plan.md` | Plan |
| Sibling plan (union-extension precedent) | `../2026-07-07--GH-15--config-system/chg-GH-15-plan.md` | Plan |
| `MarkSyncError` union + `assertNeverMarkSyncError` | `src/domain/errors.ts` | Code (updated — D-1) |
| Domain credential value types | `src/domain/credentials.ts` | Code (new — D-2) |
| `MarkSyncError` → code mapper | `src/app/cli-error-map.ts` | Code (updated — D-3) |
| Stable code → exit map | `src/cli/output/exit-codes.ts` | Code (updated — D-4) |
| `CredentialProvider` (injected fetch) | `src/app/credentials.ts` | Code (new — D-5) |
| Provider unit tests | `tests/unit/app/credentials.test.ts` | Test (new — D-6) |
| Error-map auth-arm tests | `tests/unit/app/cli-error-map.test.ts` | Test (updated — D-6) |
| Exit-code auth-row tests | `tests/unit/cli/output/exit-codes.test.ts` | Test (updated — D-6) |
| Domain union exhaustiveness tests | `tests/unit/domain/errors.test.ts` | Test (updated — D-6) |
| Integration tests (Bun.serve) | `tests/integration/credentials.test.ts` | Test (new — D-7) |
| INV-SEC-1 security test | `tests/integration/credentials-security.test.ts` | Test (new — D-8) |
| Canonical env var names | `.env.example` | Convention |
| Coding rules | `.ai/rules/typescript.md` | Convention |
| Architecture (tier matrix) | `doc/overview/architecture-overview.md` | System doc |
| NFRs | `doc/spec/nonfunctional.md` (NFR-SEC-1/2/6, NFR-3, NFR-6) | System doc |
| Feature spec (auth §3.3) | `doc/spec/features/feature-cli.md` | System doc |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | plan-writer (GH-17) | Initial plan — 6 phases derived from story `MS2-E2-S4` (6 deliverables, 6 ACs) and the two intake-resolved decisions. **DEC-1 (injected fetch):** `resolveCredentials`/`validateCredentials` accept a `fetch`-like param (`typeof fetch`) defaulting to global `fetch`, so `src/app/credentials.ts` imports `#domain/*` only (never `#infra/*`) — keeping the application tier pure, unit-testable, and `check:boundaries`-clean; the architecture matrix classifies the Credential Provider as application tier (L90). **DEC-2 (`AuthError` shape):** chosen as ONE `Auth` arm with a nested `authKind` discriminator (four sub-kinds: `MissingCredentials`/`InvalidBaseUrl`/`InvalidCredentials`/`AuthUnreachable`) — the option that grows the top-level union by +1 (13→14, mirroring the GH-15 `ConfigError` precedent), keeps `mapMarkSyncErrorToCommandError` at +1 `case "Auth"` with an exhaustive nested sub-switch, and threads the stable codes (`MISSING_CREDENTIALS`/`INVALID_BASE_URL`/`INVALID_CREDENTIALS`/`AUTH_UNREACHABLE`, all → `EXIT_AUTH`=20; `AUTH_UNREACHABLE` retryable) through `CODE_TO_EXIT`. **Critical ordering:** Phase 1 is the atomic exhaustiveness update (errors.ts + cli-error-map.ts + exit-codes.ts in one typecheck-green commit — extending the union alone breaks the existing mapper's `never`-check); Phase 2 builds the provider on the stable `AuthError`. Phase 5 is a dedicated, release-blocking INV-SEC-1 integration test (no captured output path emits the raw token). The `ConfluenceCredentials` value type is placed in `src/domain/credentials.ts` (not `src/app/`) so the future infra adapter (E3-S4) can import it (`infra → app` is forbidden). `version_impact: minor` (`0.2.0 → 0.3.0`) defaulted from the GH-15/GH-16 precedent (open question). Note: the change spec `chg-GH-17-spec.md` is not yet authored at plan time; this plan operationalizes the authoritative story + intake summary and will be reconciled if the spec diverges. |

## Execution Log

<!-- Populated during delivery (lifecycle phase 6, @coder). One row per phase. -->

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | pending | — | — | — | extend MarkSyncError with Auth arm + update all exhaustiveness sites |
| 2 | pending | — | — | — | domain credential types + app CredentialProvider (injected fetch) |
| 3 | pending | — | — | — | provider unit tests (resolve/masking/header/validate-stub) |
| 4 | pending | — | — | — | integration tests — validateCredentials vs Bun.serve (200/401/403/429/network) |
| 5 | pending | — | — | — | INV-SEC-1 security integration test (release-blocking) |
| 6 | pending | — | — | — | boundaries verification + version bump + `bun run check` green |
