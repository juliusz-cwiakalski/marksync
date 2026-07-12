---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-21-confluence-adapter
status: Updated
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-10T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, security, infrastructure, adapter]
links:
  change_spec: ./chg-GH-21-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S4--confluence-adapter.md
  feature_spec: ../../../spec/features/feature-confluence-adapter.md
  adr_0005: ../../../decisions/ADR-0005-page-body-representation-storage-not-adf.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  adr_0010: ../../../decisions/ADR-0010-page-history-provenance-and-sync-granularity.md
  architecture_overview: ../../../overview/architecture-overview.md
  spike_findings: ../../../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  result_contract: ../../../../src/domain/result.ts
  errors_contract: ../../../../src/domain/errors.ts
  credentials_contract: ../../../../src/domain/credentials.ts
  storage_renderer: ../../../../src/infra/confluence/render/storage.ts
  redaction_layer: ../../../../src/cli/output/redact.ts
  auth_provider_precedent: ../../../../src/app/credentials.ts
  cli_error_map: ../../../../src/app/cli-error-map.ts
  exit_codes: ../../../../src/cli/output/exit-codes.ts
  gh20_plan_precedent: ../2026-07-09--GH-20--markdown-pipeline/chg-GH-20-plan.md
summary: >
  Deliver MS2-E3-S4 (epic MS2-E3 — Safe Publish Core, fourth story): the
  transport half of the safe-publish pipeline. A domain-owned `TargetSystem`
  port (no Confluence types) and its Confluence Cloud adapter: a native-`fetch`
  `ConfluenceClient` isolating every v2/v1 URL distinction, `authHeader`
  injection, redacted logging, and 429/5xx retry (no HTTP library); per-surface
  services — `PageService` (v2, the brand-defining 409-conflict parse),
  `PropertyService` (v2, `marksync.metadata` string cross-check),
  `AttachmentService` (v1-only, 400-duplicate idempotency signal),
  `SearchService` + `RestrictionsService` (v1-only, minimal), and a
  `version.message` provenance formatter. Every operation returns
  `Result<T, MarkSyncError>`; 403 → `Forbidden` warn+skip (never delete+recreate);
  zod validates every Confluence response at the boundary. Two additive
  `MarkSyncError` arms land first — the story-mandated `RateLimited`
  (exhausted-429) and the PM-decided `RemoteUnreachable` (exhausted-5xx/network,
  OQ-1) — keeping `assertNeverMarkSyncError` exhaustive. Reuses GH-17
  `ConfluenceCredentials`, GH-20 `renderStorage` (the `renderBody` delegate),
  and the GH-16 redaction layer unchanged. Installs `zod` (the first consuming
  story per typescript.md). Downstream: E3-S5 (drift via the port), E3-S6 (apply
  via the port), E3-S7 (concurrency via 409), E4-S1/E4-S2 (attachments),
  E5-S1 (live smoke).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-21: [MS2-E3-S4] Confluence adapter — TargetSystem port implementation

## Context and Goals

This plan delivers the **transport layer** of MS-0002 (epic MS2-E3 — Safe Publish
Core, fourth story) and the **channel half** of the safe-publish pipeline. Where
GH-20 delivered the *body* the pipeline writes, this story delivers the *channel*
it writes through. Until it lands, MarkSync cannot push, fetch, or reconcile a
single page against Confluence Cloud — the domain/application tiers have no typed
target seam, and the spike-validated safety behaviors the entire brand promise
rests on (the 409 optimistic-concurrency gate, the 403 warn+skip, the 400-dup
attachment idempotency, the 429/5xx retry) have no parser, no producer, and no
enforcer. Concretely this plan establishes:

- **two additive `MarkSyncError` arms** — the story-mandated `RateLimited`
  (exhausted-429) and the PM-decided `RemoteUnreachable` (exhausted-5xx/network;
  OQ-1) — added to the union + `assertNeverMarkSyncError` + the CLI error/exit
  maps, landing **first** so the exhaustive `never`-check is the typecheck safety
  net for everything that follows (F-9);
- **the `TargetSystem` port** (`src/domain/target/port.ts`) — the
  adapter-agnostic contract (no Confluence types) every adapter implements, with
  its own request/response value types, every op returning `Result<T,
  MarkSyncError>` (F-1);
- **the `ConfluenceClient`** — native-`fetch` transport isolating all v1/v2 URL
  construction, `authHeader` injection, redacted logging, and the retry policy;
  the single place auth/retry/redaction live (F-2);
- **`PageService` (v2)** with the brand-defining 409-conflict parse
  (`errors[0].code==="CONFLICT"` + version-laden title → typed `Conflict`) and
  the 403 → `Forbidden` warn+skip (F-3, F-7);
- **`PropertyService` (v2)** — the `marksync.metadata` string cross-check (F-4);
- **`AttachmentService` (v1-only)** — multipart upload, the 400-duplicate
  **idempotency signal** (not an error), and `/data` update (F-5);
- **`SearchService` + `RestrictionsService` (v1-only, minimal)** + the
  `version.message` provenance formatter (F-6, F-8);
- **zod boundary validation** on every Confluence response (F-9 / DEC-7).

The plan is derived entirely from the authoritative spec `chg-GH-21-spec.md`
(9 capabilities F-1..F-9, 8 decisions DEC-1..DEC-8, 9 acceptance criteria
AC-F1-1..AC-Q-1, 14 NFRs, 8 risks, OQ-1/OQ-2 PM-resolved), the story file
`MS2-E3-S4--confluence-adapter.md`, ADR-0005 (Storage target), ADR-0006 (state
model — 409 gate, content-property cross-check, 403→warn+skip, INV-SAFE-1),
ADR-0010 (provenance), the spike findings (H1–H5 validated facts), and the
existing code seams verified present. It invents no requirements. The change
spec is the contract authority; this plan operationalizes it.

The phase ordering follows spec §18 "Ordering within the story" (refined):
error-model safety net first → port + boundary proof → client → pages →
properties/attachments → search/restrictions/provenance → integration tests →
final gate. Each phase is independently `bun test`-able and one logical commit,
mirroring the GH-19/GH-20 phase-per-commit house style.

### Binding decisions

> Plan-level decisions (PD-\*) that operationalize the spec. The spec's
> DEC-1..DEC-8 and the PM-resolved OQ-1/OQ-2 are committed and not re-litigated
> here; PD-\* below fill the implementation-level choices the spec leaves open.

- **PD-1 — `renderBody` input = canonical HAST (`Root`), not MDAST.** The
  architecture-overview §"Internal interface contracts" is the port-contract
  authority and lists `renderStorage(hast, opts)` as the Confluence-adapter
  *realization* of `renderBody`. The story file's `renderBody(mdast, opts)`
  wording is reconciled by that contract: the port takes the already
  adapter-agnostic canonical HAST (the `mdastToHast` bridge output) and the
  adapter delegates straight to GH-20's `renderStorage`. The app layer (E3-S6)
  runs `parseMarkdown` → `mdastToHast` → `target.renderBody(hast, opts)` and
  never imports the renderer. The story's `mdast` wording is a doc-sync item for
  lifecycle phase 7 (`@doc-syncer`), **not** a code contradiction — flagged in
  Open questions.
- **PD-2 — Install `zod` in Phase 0 (this story is the first consumer).** The
  spec §8.4/§13 asserts "zod is already a project dependency (used by GH-15
  config schemas)" — this is a **factual error**: GH-15 used `ajv` (JSON Schema)
  for config, `package.json` has no `zod`, `node_modules/zod` is absent, and
  `typescript.md` §IO boundaries explicitly states "`zod` is planned but not yet
  installed — install when the first consuming story lands (MS-0002 E3)" and
  lists `zod` under "Planned (not yet installed)". This story is that consumer
  (F-9 / DEC-7 require zod boundary validation). Phase 0 installs `zod` as a
  runtime dependency and re-baselines the gate. Flagged for the spec author /
  `@doc-syncer` (the spec's "already installed" claim is recorded as a doc
  correction).
- **PD-3 — The error-model change touches THREE files, all in Phase 1.**
  `typescript.md` §"Adding a MarkSyncError kind" mandates: when adding a kind,
  update `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`,
  `CODE_TO_EXIT`, and the DEC-2 table **in the same PR**. `src/app/cli-error-map.ts`'s
  `default` arm calls `assertNeverMarkSyncError`, so omitting the two new cases
  is a **compile error** — Phase 1 therefore edits: (a) `src/domain/errors.ts`
  (union + `assertNeverMarkSyncError`); (b) `src/app/cli-error-map.ts`
  (`mapMarkSyncErrorToCommandError` switch + DEC-2 comment table —
  `RateLimited → RATE_LIMITED` retryable, `RemoteUnreachable → REMOTE_UNREACHABLE`
  retryable, DEC-9: never surface `cause`); (c) `src/cli/output/exit-codes.ts`
  (`CODE_TO_EXIT` + DEC-2 comment table — both map to `EXIT_INTERNAL` best-fit
  pending the maintainer assigning a dedicated class, like the other `*`
  catch-alls). This keeps `bun run typecheck` green after Phase 1 (RSK-6) and
  keeps the exit-code contract complete.
- **PD-4 — Boundary negative test = an ephemeral `src/domain/` probe cruised
  with the production ruleset, then deleted (no committed fixture).** The
  production `.dependency-cruiser.cjs` rule filters `from: { path:
  "src/domain/" }` and `check:boundaries` runs `depcruise src`, so a probe must
  live under `src/domain/` at cruise time for the rule to match it — a
  `tests/`-located fixture structurally cannot fire the production rule. The
  negative test (AC-F1-1) therefore creates an **ephemeral** probe at test
  runtime (e.g. `src/domain/__boundary_probe__.ts` importing a
  `#infra/confluence/*` symbol), runs dependency-cruiser (programmatic
  `cruise(...)` API or `bunx depcruise src` subprocess) with the **production**
  `.dependency-cruiser.cjs` ruleset to prove the `domain-may-not-import-infra`
  violation fires on the probe, and **deletes the probe in
  `afterEach`/`finally`**. The cleanup is load-bearing: a leaked probe would
  permanently break `depcruise src`. The probe is never committed. This proves
  the rule catches a real `src/domain/**` breach; a companion positive check
  asserts `depcruise src` is green without the probe. Matches the
  testing-strategy "fault injection / adapter boundary" allowance.
- **PD-5 — A zod schema-validation failure maps to `RemoteUnreachable`.** The
  spec F-9 / DEC-7 requires every Confluence response be zod-validated and a
  validation failure be "a typed failure (its arm is a plan-time detail)", with
  no new arms beyond `RateLimited` + `RemoteUnreachable`. A response that fails
  its schema is a remote-shape drift (the server returned something malformed /
  not the documented envelope) — recovery is identical to an exhausted-transport
  failure (alert-operator / surface-as-failure; do not silently misparse). It
  therefore maps to `err({ kind: "RemoteUnreachable"; cause: "schema validation
  failed: <schemaName>" })` (no secret material; the schema name is a structural
  identifier). This is defense for RSK-7 (a shape drift surfaces as a typed
  failure, never a silent misparse).
- **PD-6 — Provenance length limit = a named constant with a conservative
  default; confirm against the live tenant in E5-S1.** ADR-0010 §"Open questions"
  lists the exact maximum usable `version.message` length as **TO CONFIRM**. The
  provenance formatter trims deterministically to a `MAX_VERSION_MESSAGE_LEN`
  constant (conservative default, the commonly-documented Confluence limit),
  flags the unconfirmed value as an Open question, and defers empirical
  confirmation to the E5-S1 live-smoke (NG-8). The constant is the single knob
  to tighten later.
- **PD-7 — The `ConfluenceTarget` adapter class (port implementor) is assembled
  in Phase 6 after all services exist; each service is built and tested
  standalone in its own phase.** `PageService`/`PropertyService`/etc. are plain
  modules over the `ConfluenceClient` + zod schemas, each independently
  committable and testable. `ConfluenceTarget` composes the client + all services
  + the `renderBody` delegate into one class `implements TargetSystem`, landing in
  Phase 6 so Phase 7's integration tests exercise the full port against a
  `Bun.serve` mock. This avoids a half-wired adapter in intermediate phases.
- **PD-8 — Retry constants are module-level named exports, centralized in the
  client.** `MAX_RETRIES` (3), the backoff ladder (`1000 * 2**attempt` → 1s/2s/4s
  + jitter), `Retry-After` honoring, and the "401/403 never retried" rule live in
  `client.ts` as named constants (no magic strings per typescript.md). Tests use
  fake timers / injected delays so the suite stays fast (testing-strategy §"fault
  injection"). The GH-17 `validateCredentials` 429-backoff precedent is the
  structural model, generalized to both 429 and 5xx.

### Open questions

> Surfaced, not decided. None blocks delivery; each has a safe default that
> Phase 7 / lifecycle phase 7 reconciles.

- **Provenance `version.message` length limit — UNCONFIRMED (ADR-0010 §"Open
  questions" / PD-6).** The exact maximum usable length is "TO CONFIRM". Default
  to a conservative named constant; confirm empirically against the live tenant
  in E5-S1 and tighten. No MS-0002 flow depends on the exact value; the
  formatter trims deterministically regardless.
- **Story-file `renderBody(mdast, …)` vs architecture-overview
  `renderStorage(hast, opts)` (PD-1).** Reconciled here in favour of HAST (the
  port-contract authority). The story wording is a doc-sync item for
  `@doc-syncer` (lifecycle phase 7): reconcile the story file + the spec with
  the implemented HAST signature so all three agree.
- **Spec "zod already installed" factual error (PD-2).** The spec §8.4/§13 claim
  zod is installed; it is not. Phase 0 installs it. The `@doc-syncer` should
  correct the spec's dependency claim + move `zod` from "Planned" to "Installed"
  in `typescript.md` (lifecycle phase 7) — out of the coder's delivery scope.
- **Boundary negative-test invocation style (delivery detail — PD-4 resolved
  the mechanism: ephemeral `src/domain/` probe).** Whether Phase 2 invokes
  dependency-cruiser via the programmatic `cruise(...)` API or a
  `bunx depcruise src` subprocess against the ephemeral `src/domain/` probe is
  a delivery detail. The @coder picks the more robust; either way the test
  creates the probe at runtime, cruises with the **production**
  `.dependency-cruiser.cjs`, asserts the `domain-may-not-import-infra` rule
  fires with the right `from`/`to`, and deletes the probe in
  `afterEach`/`finally`.

### Out of scope

- **Plan/apply orchestration** — E3-S6 (the sync engine sequences creates/
  updates/moves via the port). This story exposes port operations; it does not
  call them in a plan (spec NG-1).
- **Drift classification logic** — E3-S5. The adapter fetches remote + produces
  `Conflict`; the classifier compares local/base/remote downstream (NG-2).
- **`labels.ts` add/delete** — deferred to post-MS-0002 (NFR-MAINT-2, DEC-8); no
  MS-0002 flow uses labels.
- **Reverse conversion** (Storage/ADF → Markdown) — MS-0005+. The port's
  `reverseConvert` op is reserved but unimplemented.
- **Data Center / OAuth / scoped-token gateway** — MS-0009 / post-MS-0002.
  Classic API-token Basic over the direct site URL is the only MS-0002 path.
- **Live (real-tenant) E2E** — wired by E5-S1 (NG-8). This story tests against a
  local `Bun.serve` mock per the story test matrix.
- **New error arms beyond `RateLimited` + `RemoteUnreachable`** — every other
  failure reuses an existing arm (`Conflict`/`Forbidden`/`TooLarge`/
  `RemoteMissing`) (NG-9, DEC-2).
- **HTTP library / crypto library** — native `fetch`/`URL`/`FormData`/`Blob`/
  `crypto` only (DEC-6; typescript.md).
- **System-spec / doc reconciliation** — lifecycle phase 7 (`@doc-syncer`): tag
  the adapter component delivered in `feature-confluence-adapter.md` §4.2 +
  `architecture-overview.md` (client/attachment/property/provenance components;
  `related_changes += GH-21`); record the `RateLimited` + `RemoteUnreachable` arm
  provenance in `src/domain/errors.ts` + the DEC-2 tables; bind the
  `TargetSystem` port + adapter VOs in `ubiquitous-language.md`; reconcile the
  `getPage(id, repr)` arity + `renderBody` input doc-drift between
  architecture-overview and the implemented port; correct the spec's "zod
  installed" claim + move `zod` to "Installed" in `typescript.md`; populate
  ADR-0006 "Lessons Learned". **DoR doc-drift items (NOT fixed in code here):**
  (a) spec §8.4/§13 "zod already installed" — false (PD-2); (b) story-file
  `renderBody(mdast)` vs implemented `renderBody(hast)` (PD-1).
- **Version bump** — repo bumps at release boundaries, not per change (GH-19/
  GH-20 precedent; `version_impact: minor` is advisory).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, dep-cruiser-enforced at severity
  `error`):
  - `src/domain/target/port.ts` + the port value types — **domain**; import only
    `#domain/*` (errors, result) + type-only `hast` (for `renderBody`'s HAST
    input — PD-1). **No** `#infra/*`, `#app/*`, `#cli/*`. The port defines its
    own adapter-agnostic value types; **no** Confluence-specific shape (v2
    envelope, Storage body, the 409 body) appears in its surface (DEC-1).
  - `src/infra/confluence/client.ts`, `pages.ts`, `properties.ts`,
    `attachments.ts`, `search.ts`, `restrictions.ts`, `provenance.ts`,
    `target.ts` (the adapter class) — **infrastructure**; import `#domain/*`
    (errors, result, credentials, the port + value types) + value `zod`.
    **May** import domain (implements ports) + the GH-20 `#infra/confluence/
    render/storage` renderer; the reverse (`domain → infra`) is forbidden
    (NFR-1 / AC-F1-1). Never `#app/*`/`#cli/*`.
  - `src/app/cli-error-map.ts` — **application**; imports `#domain/errors` only
    (the error-model change in Phase 1 edits it here, not in `src/cli/`).
  - `src/cli/output/exit-codes.ts` — **presentation**, pure data (imports no
    tier); Phase 1 edits only the data table.
  - dep-cruiser enforces the load-bearing `domain → infra` and `cli → infra`
  forbidden directions at severity `error`; the negative test (PD-4 / Phase 2)
  **proves** the rule fires. The broader matrix has gaps (no `infra → app`/
  `infra → cli` rule; `infra → domain` is allowed since infra implements ports) —
  hardening is a future item, out of scope here (GH-20 Finding 6 precedent).
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`): one import statement per module with inline
  `type` modifier; `zod` + `hast` types are imported as values/types as
  appropriate; the two new error arms' optional fields (`retryAfterMs?`,
  `status?`) use optional properties under `exactOptionalPropertyTypes`.
  Conditional spread over mutation for optional properties.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`,
  `#infra/*`, …). Tests use `#`-aliases, not deep relative paths (typescript.md).
  `bunfig.toml` `root = "tests"` + the mermaid preload (a no-op stub until
  E4-S1) are harmless for these tests.
- **Error discipline** (typescript.md §"Error handling"): domain/infra functions
  return `Result<T, MarkSyncError>` (never `throw` for expected failures — 409,
  403, 429-exhausted, 400-dup, schema-validation-failure, RemoteMissing).
  `throw` is reserved for invariant violations only. No `throw new Error("…")`
  in domain/infra code. Errors carry context (`pageId`, `operation`, `status`,
  `cause`); the redaction layer strips any secret material (DEC-9: messages use
  only structural identifiers, never `cause`/paths/bodies).
- **Comment discipline** (AGENTS.md / typescript.md): ≤ 3-line file headers;
  self-documenting code; cite ADR-0006 (409 gate / INV-SAFE-1) and spike H5/H4/H2
  once at the load-bearing point (the 409 parse, the 400-dup mapping, the
  property round-trip); no bare `(DEC-x)`/`(NFR-x)` alphabet-soup tags, no spec
  restatements, no JSDoc restating signatures.
- **No token leak** (INV-SEC-1 / NFR-SEC-1): the client injects `authHeader`
  from `ConfluenceCredentials` (never the raw token) and routes every
  request/response log through the existing GH-16 redaction layer
  (`redactString`); AC-F2-2 greps captured mock logs for the token (0 expected).
- **No outbound telemetry** (NFR-SEC-3): the client's `v1`/`v2` URL builders are
  rooted at the configured `baseUrl`; `fetch` issues requests **only** to that
  host; AC-F2-3 asserts 0 requests target any other host.
- **Native `fetch` only** (DEC-6 / NFR-11): no HTTP library; `fetch`/`URL`/
  `FormData`/`Blob`/`crypto` built-ins only. The injected-`fetch` seam (GH-17
  `AuthProviderOptions.fetch` precedent) is used so the client is unit-testable
  with a stub and integration-testable against `Bun.serve`.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-Q-1). Conventional Commits (commitlint +
  husky, 72-char header); each phase = one logical commit; `check:boundaries`
  green at every commit.

### Risks

- **RSK-1 — The 409 is misparsed (wrong version numbers, or missed entirely) →
  the drift gate fails → a stale write silently overwrites a remote edit**
  (NFR-REL-1/REL-5/REL-10; ADR-0006 C-5/C-6). Mitigated by F-3/Phase 4:
  `errors[0].code==="CONFLICT"` + the version-laden title parsed via a tested
  regex; zod validates the 409 envelope at the boundary (PD-5 maps a shape
  drift to `RemoteUnreachable`, never a silent misparse); AC-F3-1 asserts
  correct version extraction across 409 fixtures; 401/403 are never retried so a
  permission gap cannot mask a conflict.
- **RSK-2 — A 403 is misclassified as "missing" and the page is silently
  recreated** (INV-SAFE-1; R-FEA-10). Mitigated by F-7/Phase 4: 403 → `Forbidden`
  warn+skip, never delete+recreate (DEC-4); AC-F7-1 asserts 0 delete/recreate
  operations on a 403; assumes operator has space-owner read access
  (CEO-resolved R2).
- **RSK-3 — The `authHeader` / token leaks into a log, plan, or diagnostic**
  (NFR-SEC-1/INV-SEC-1). Mitigated by F-2/Phase 3: all request/response logging
  routes through the existing redaction layer (`redactString`); the adapter
  consumes the opaque `authHeader` and masked email only — never the raw token
  (GH-17); AC-F2-2 greps captured mock logs for the token (0 expected).
- **RSK-4 — Outbound telemetry regression** — a request targets a host other
  than `baseUrl` (NFR-SEC-3). Mitigated by F-2/Phase 3: `v1`/`v2` URL builders
  rooted at `baseUrl`; AC-F2-3 asserts no request targets another host.
- **RSK-5 — A boundary violation sneaks in** (NFR-MAINT-1). Mitigated by
  dep-cruiser + the Phase 2 negative test (PD-4) proving the rule fires.
- **RSK-6 — Adding the two error arms silently breaks exhaustiveness**
  (an exhaustive handler site is missed). Mitigated by Phase 1: the three-site
  update (PD-3) + `assertNeverMarkSyncError`'s `never`-check — a missed `case`
  fails typecheck; AC-Q-1 is the gate.
- **RSK-7 — Confluence API drift/deprecation invalidates a spike-validated
  endpoint shape** (CEO-resolved R1). Mitigated by F-9/DEC-7: zod validates
  every response at the boundary (PD-5 → a shape drift is a typed failure, not a
  silent misparse); nightly live-smoke (E5-S1) + weekly deprecation-feed catch
  drift early. Not blocking MS-0002.
- **RSK-8 (spec RSK-8 residual) — already resolved by OQ-1.** The exhausted-5xx
  path now has a defined arm (`RemoteUnreachable`); no undefined caller behavior
  remains.

### Success Metrics

- **boundary isolation (NFR-1 / AC-F1-1)** — 0 files under `src/domain/` or
  `src/cli/` import anything from `src/infra/confluence/`; the Phase 2 negative
  test proves dep-cruiser fails on a breach; the port is the only seam.
- **409 parse correctness (NFR-2 / AC-F3-1)** — a mocked 409 with
  `errors[0].code:"CONFLICT"` → `err(Conflict{ baseVersion; remoteVersion })`
  with correctly parsed version numbers — 100% of 409 fixtures.
- **403 warn+skip (NFR-3 / AC-F7-1)** — a mocked 403 on `getPage` → `Forbidden`;
  the path performs 0 delete/recreate operations.
- **attachment 400-dup idempotency (NFR-4 / AC-F5-1)** — duplicate filename →
  "already exists" result (not an error); `/data` update bumps version on
  changed bytes.
- **property round-trip (NFR-5 / AC-F4-1)** — `putProperty` stores a string;
  `getProperty` reads it byte-equal; an ~8 KB value round-trips.
- **429 backoff (NFR-6 / AC-F2-1)** — mocked 429 + `Retry-After` → wait then
  retry (max 3); exhausted → `err({ kind:"RateLimited" })`.
- **no token leak (NFR-7 / AC-F2-2)** — 0 captured redacted log artifacts
  contain the token.
- **no outbound telemetry (NFR-8 / AC-F2-3)** — every `fetch` targets
  `baseUrl`; 0 requests target any other host.
- **5xx retry (NFR-9)** — mocked transient 5xx retried (max 3); exhausted →
  `RemoteUnreachable`.
- **response validation (NFR-10 / DEC-7)** — 100% of Confluence responses
  zod-validated before crossing into a typed return.
- **error-model safety (NFR-13)** — adding both arms keeps
  `assertNeverMarkSyncError` exhaustive; `bun run check` typecheck stays green.
- **quality gate (NFR-14 / AC-Q-1)** — `bun run check` exits 0.

---

## Execution Strategy

Nine phases, one logical commit each. Phase 0 installs `zod` (PD-2) and
re-baselines the gate; Phase 1 lands the two additive error arms across the three
required sites (PD-3) — typecheck green is the safety net for every subsequent
switch; Phase 2 lands the domain-owned port + its value types + the boundary
negative test (PD-4) that proves the port is the only seam; Phase 3 lands the
`ConfluenceClient` (URL builders, auth injection, redaction, 429/5xx retry) with
mock-`fetch` unit tests; Phase 4 lands `PageService` (v2) + the 409 parse + the
403→`Forbidden` mapping; Phase 5 lands `PropertyService` (v2) +
`AttachmentService` (v1, 400-dup idempotency); Phase 6 lands
`SearchService`/`RestrictionsService` (v1, minimal) + the provenance formatter +
the `ConfluenceTarget` adapter class (PD-7); Phase 7 lands the integration tests
against a `Bun.serve` mock covering 200/409/403/400/429/5xx + property
round-trip + attachment upload/update/dup + no-token-leak + no-outbound-telemetry;
Phase 8 runs the full gate and hands the doc risks to lifecycle phase 7. `bun run
check:boundaries` runs in every phase. Suggested commit scopes:
`feat(domain)`, `feat(adapter)`, `feat(confluence)`, `test(adapter)`.

---

### Phase 0: Install `zod` + re-baseline the gate

**Goal**: Install the single runtime dependency the spec requires for boundary
validation (F-9 / DEC-7) but that the spec incorrectly claims is already
present (PD-2). `zod` is the first consuming story per `typescript.md` §IO
boundaries ("install when the first consuming story lands (MS-0002 E3)" = this
story). No production code yet — just the dependency + a green gate.

**Tasks**:

- [x] **0.1** Add `zod` (`^<current-major>`) to `package.json` `dependencies`;
      run `bun install` (the committed `bun.lock` pins exact). Confirm no HTTP
      library / crypto library is introduced (DEC-6 / NFR-11).
      — `zod@4.4.3` installed; zero runtime deps (verified).
- [x] **0.2** `bun run check` exits 0 with the current suite (no behavior change);
      `check:boundaries` clean. Confirm `zod` resolves (`import { z } from "zod"`
      typechecks) but is **not yet imported** by any `src/` module.
      — `typecheck` + `check:boundaries` green; `grep "zod" src/` = 0 matches.

**Acceptance Criteria**:

- Must: `bun install` succeeds; `bun run typecheck` + `bun run check:boundaries`
  exit 0.
- Must: `zod` present in `dependencies`; no HTTP/crypto library added (NFR-11).

**Files and modules**:

- Code areas: `package.json` (updated), `bun.lock` (updated).
- System docs: none (moving `zod` "Planned → Installed" in `typescript.md` +
  correcting the spec's "already installed" claim is lifecycle phase 7 /
  `@doc-syncer`).

**Tests**:

- Manual: `bun install && bun run typecheck && bun run check:boundaries`; `bun pm
  ls` confirms `zod` scope.

**Completion signal**: `feat(adapter): install zod for E3-S4 boundary validation (GH-21)`

---

### Phase 1: `RateLimited` + `RemoteUnreachable` error arms — the typecheck safety net (F-9, AC-Q-1, RSK-6)

**Goal**: Land the **two** additive `MarkSyncError` arms (the story-mandated
`RateLimited` + the PM-decided `RemoteUnreachable`, OQ-1) across all three sites
`typescript.md` §"Adding a kind" requires (PD-3), so the exhaustive
`never`-check is the safety net for every subsequent exhaustive switch. This
**must** land first and keep typecheck green — `assertNeverMarkSyncError`'s
`default` arm is `never` only when every kind is named, so adding the arms
without their cases is a compile error (RSK-6). No adapter code yet; this is the
error model the adapter produces into.

**Tasks**:

- [x] **1.1** Edit `src/domain/errors.ts`:
      - Add two union arms:
        `| { kind: "RateLimited"; retryAfterMs?: number }` (OQ-2 — last observed
        `Retry-After` if present; no secret material) and
        `| { kind: "RemoteUnreachable"; status?: number; cause: string }`
        (OQ-1 — `status` for 5xx, `cause` a non-secret network/transport
        description; distinct kind because the recovery action differs from
        `RateLimited` — server-down/alert-operator vs wait-and-retry).
      - Add `case "RateLimited":` and `case "RemoteUnreachable":` to the
        `assertNeverMarkSyncError` switch (alongside the existing fall-through
        cases) so the `default` arm's `_exhaustive: never` stays sound.
      - ≤ 3-line header preserved; cite ADR-0006 once if a header touch is needed
        (boy-scout rule only).
- [x] **1.2** Edit `src/app/cli-error-map.ts` (`mapMarkSyncErrorToCommandError`):
      add two cases (the `default` calls `assertNeverMarkSyncError`, so omitting
      them is a compile error — PD-3). Codes are STABLE (DEC-6):
      `RateLimited → { code: "RATE_LIMITED"; retryable: true; message: "…rate-limited by Confluence after retry budget exhausted; retry later" }`
      and `RemoteUnreachable → { code: "REMOTE_UNREACHABLE"; retryable: true; message: "…could not reach Confluence (network/server); retry later" }`.
      DEC-9: messages use only structural identifiers — **never** interpolate
      `cause` (raw transport text) or `retryAfterMs` value; the `cause` stays in
      the typed error for (redacted) logging only. Update the DEC-2 comment table.
- [x] **1.3** Edit `src/cli/output/exit-codes.ts` (`CODE_TO_EXIT`): add
      `RATE_LIMITED: EXIT_INTERNAL` and `REMOTE_UNREACHABLE: EXIT_INTERNAL`
      (best-fit `*` catch-alls, like `UNSUPPORTED_CONSTRUCT`/`TOO_LARGE`, pending
      the maintainer assigning a dedicated exit class — the `codeToExitCode`
      fallback to `EXIT_INTERNAL` is the documented contract). Update the DEC-2
      comment table.
- [x] **1.4** Create `tests/unit/domain/errors/error-arms.test.ts` (new) —
      **Unit**: assert the two new kinds round-trip through
      `mapMarkSyncErrorToCommandError` to the expected stable codes (RATE_LIMITED
      retryable; REMOTE_UNREACHABLE retryable); assert `assertNeverMarkSyncError`
      throws for each (the runtime side of the never-check); assert messages
      contain **no** interpolated `cause` (DEC-9 spot check).

**Acceptance Criteria**:

- Must: `bun run typecheck` exits 0 — the two new `case`s keep
  `assertNeverMarkSyncError` exhaustive (AC-Q-1 / NFR-13, RSK-6).
- Must: `mapMarkSyncErrorToCommandError` + `CODE_TO_EXIT` handle both new kinds
  (PD-3); messages carry no secret/path/body material (DEC-9).
- Should: the existing error-arm tests stay green (no regression to the 15 prior
  arms).

**Files and modules**:

- Code areas: `src/domain/errors.ts` (updated), `src/app/cli-error-map.ts`
  (updated), `src/cli/output/exit-codes.ts` (updated).
- System docs: none (recording arm provenance in `errors.ts` + DEC-2 tables is
  lifecycle phase 7).

**Tests**:

- `bun test tests/unit/domain/errors/error-arms.test.ts`
- `bun run typecheck` (the safety net).

**Completion signal**: `feat(domain): add RateLimited + RemoteUnreachable error arms (GH-21)`

---

### Phase 2: `TargetSystem` port + adapter-agnostic value types + boundary negative test (F-1, AC-F1-1)

**Goal**: Deliver F-1 — the domain-owned, adapter-agnostic `TargetSystem` port
interface (the contract every adapter implements; no Confluence types) and its
own request/response value types, plus the boundary negative test (PD-4) that
**proves** the dep-cruiser rule fires on a breach. This is the seam E3-S5/E3-S6/
E4-S1/E4-S2 call and the seam a future non-Confluence adapter plugs into
(NFR-MAINT-3). Every operation returns `Result<T, MarkSyncError>`.

**Tasks**:

- [x] **2.1** Create `src/domain/target/port.ts` (new):
      - `interface TargetSystem` declaring the operation set from
        architecture-overview §"Internal interface contracts" + the story
        deliverable: `renderBody(hast, opts) → Result<{ body; hash; warnings },
        MarkSyncError>` (PD-1 — HAST input; delegates to the adapter's
        `renderStorage`), `getPage(id)`, `createPage(req)`, `updatePage(req)`
        (returns `Conflict` on 409), `movePage(req)`, `getProperty(pageId, key)`,
        `putProperty(pageId, key, value)`, `uploadAttachment(pageId, artifact)`,
        `attachmentExists(pageId, hash)`, `listAttachments(pageId)`,
        `searchPages(cql)`, `getRestrictions(pageId)` — **all** `Result<T,
        MarkSyncError>`.
      - Define the port's **own** adapter-agnostic value types in the module:
        `Page` (id, title, version, body?), `CreatePageRequest`,
        `UpdatePageRequest` (pageId, body, baseVersion, message),
        `MovePageRequest`, `AttachmentRef`, `Artifact` (bytes, mime, hash),
        `PageRestrictions`. **No** Confluence-specific shape (no v2 envelope,
        no Storage body wrapper, no 409 body) appears in the surface (DEC-1) —
        those stay adapter-internal. Reuse domain types where they exist
        (`Result`, `MarkSyncError`).
      - Imports: `#domain/errors`, `#domain/result` + type-only `hast` (for
        `renderBody`'s HAST input). **No** `#infra/*`, `#app/*`, `#cli/*`.
      - ≤ 3-line header; cite architecture-overview §"Internal interface
        contracts" once.
- [x] **2.2** Boundary negative-test mechanism (PD-4) — **no committed fixture
      file**; the test creates an **ephemeral** probe at runtime under
      `src/domain/` (e.g. `src/domain/__boundary_probe__.ts`) that imports a
      `#infra/confluence/*` symbol, so the production rule's
      `from: { path: "src/domain/" }` filter matches it. The probe MUST live
      under `src/domain/` at cruise time — a `tests/`-located fixture
      structurally cannot fire the production rule (which runs
      `depcruise src`, excluding `tests/`). **Cleanup is load-bearing**: the
      probe is deleted in `afterEach`/`finally` (a leaked probe would
      permanently break `depcruise src`); the probe is never committed.
- [x] **2.3** Create `tests/unit/domain/target/boundary-negative.test.ts` (new)
      — **Unit/contract** (AC-F1-1 / RSK-5): create the ephemeral
      `src/domain/__boundary_probe__.ts` at runtime, run dependency-cruiser
      (programmatic `cruise(...)` API or a `bunx depcruise src` subprocess —
      resolved at delivery) with the **production** `.dependency-cruiser.cjs`
      ruleset over `src`, and assert the `domain-may-not-import-infra` violation
      fires with the right `from` (the `src/domain/` probe) and `to`
      (`src/infra/confluence/`); then delete the probe in `afterEach`/`finally`.
      This proves the production rule catches a real `src/domain/**` breach. A
      companion positive assertion that `depcruise src` is green without the
      probe is the clean-state check.

**Acceptance Criteria**:

- Must: the port interface + value types compile under strict TS; **no**
  `#infra/*` import in `src/domain/target/port.ts` (AC-F1-1 positive side;
  `check:boundaries` green).
- Must: the negative test proves `domain-may-not-import-infra` fires on the
  ephemeral `src/domain/` probe (AC-F1-1 negative side; RSK-5).
- Must: every port op returns `Result<T, MarkSyncError>` (F-1).

**Files and modules**:

- Code areas: `src/domain/target/port.ts` (new).
- System docs: none (binding the `TargetSystem` port + VOs in
  `ubiquitous-language.md` is lifecycle phase 7).

**Tests**:

- `bun test tests/unit/domain/target/boundary-negative.test.ts`

**Completion signal**: `feat(domain): TargetSystem port + adapter-agnostic value types + boundary negative test (GH-21)`

---

### Phase 3: `ConfluenceClient` — native-fetch transport, v1/v2 URLs, auth, redaction, retry (F-2, AC-F2-1, AC-F2-2, AC-F2-3)

**Goal**: Deliver F-2 — the single place the v1/v2 split, `authHeader` injection,
redacted logging, and the retry policy live. Native `fetch` (no HTTP library);
`v1(path)`/`v2(path)` URL builders rooted at `baseUrl`; `Content-Type:
application/json`, `User-Agent: marksync/<ver>`; all request/response logging
routed through the GH-16 `redactString` redaction layer; 429 exponential backoff
(1s/2s/4s + jitter, `Retry-After` honored, max 3 → `RateLimited`); 5xx retry (max
3 → `RemoteUnreachable`); **401/403 never retried**. Modeled on the GH-17
`validateCredentials` injected-`fetch` + backoff precedent, generalized.

**Tasks**:

- [x] **3.1** Create `src/infra/confluence/client.ts` (new):
      - `class ConfluenceClient` constructed from `ConfluenceCredentials` (the
        GH-17 opaque `authHeader` — never the raw token) + an injected `fetch`
        seam (default `globalThis.fetch`) so the client is unit-testable with a
        stub and integration-testable against `Bun.serve`.
      - `v1(path): string` → `${baseUrl}/wiki/rest/api${path}`;
        `v2(path): string` → `${baseUrl}/wiki/api/v2${path}` — the **only**
        place the v1/v2 distinction is encoded (NFR-MAINT-1).
      - `request(method, url, { body?, headers?, multipart? }): Promise<Result<{status; json?; text?}, MarkSyncError>>` —
        injects `Authorization: <authHeader>`, `Content-Type: application/json`
        (except multipart), `User-Agent: marksync/<ver>`; routes every
        request/response log line through `redactString` (NFR-SEC-1) so no
        `Authorization`/`Basic`/token/email reaches any output path.
      - Retry policy (PD-8 named constants): **429** → backoff `1000 * 2**attempt`
        + jitter, honoring `Retry-After` (seconds, capped), max 3 →
        `err({ kind:"RateLimited"; retryAfterMs? })`; **5xx** → retry max 3 →
        `err({ kind:"RemoteUnreachable"; status?; cause })`; a thrown `fetch`
        (network) → `RemoteUnreachable` (no retry). **401/403 never retried** —
        surfaced to the caller (the service maps 403 → `Forbidden`).
      - Imports: `#domain/credentials`, `#domain/errors`, `#domain/result` +
        value `zod` (none yet — schemas land with the services). **May** import
        domain; never app/cli.
      - ≤ 3-line header; cite spike H1 (auth path) once at the auth-injection
        point.
- [x] **3.2** Create `tests/unit/infra/confluence/client.test.ts` (new) —
      **Unit** with an injected stub `fetch` (testing-strategy "fault injection"
      allowance) + fake timers (testing-strategy §"fault injection" — keep the
      suite fast):
      - **TC-URL-001 (NFR-MAINT-1):** `v1("/x")` and `v2("/x")` build the exact
        `${baseUrl}/wiki/rest/api/x` / `${baseUrl}/wiki/api/v2/x` URLs rooted at
        the configured `baseUrl`.
      - **TC-AUTH-001 (AC-F2-2 / INV-SEC-1):** every issued request carries
        `Authorization: <authHeader>` + `User-Agent: marksync/<ver>`; captured
        (redacted) log lines contain **0** occurrences of the token (grep the
        captured mock-log sink).
      - **TC-429-001 (AC-F2-1):** a mocked 429 + `Retry-After: 1` → the client
        waits then retries; **max 3** retries; eventual 200 → ok; exhaustion →
        `err({ kind:"RateLimited" })`.
      - **TC-5XX-001 (NFR-9):** a mocked transient 5xx → retried (max 3);
        exhaustion → `err({ kind:"RemoteUnreachable"; status })`.
      - **TC-NORETRY-001 (NFR-12):** a mocked 401/403 → **0** retries (surfaced
        immediately).
      - **TC-TELEMETRY-001 (AC-F2-3):** assert every captured request URL's host
        equals the configured `baseUrl` host — **0** requests target any other
        host.
      - **TC-NETWORK-001:** a thrown `fetch` (network failure) →
        `err({ kind:"RemoteUnreachable"; cause })`, no retry.

**Acceptance Criteria**:

- Must: `v1`/`v2` URL builders root at `baseUrl` (NFR-MAINT-1); every request
  injects `authHeader` + `User-Agent`; **0** token occurrences in redacted logs
  (AC-F2-2).
- Must: 429 → bounded backoff, max 3, `Retry-After` honored; exhaustion →
  `RateLimited` (AC-F2-1); 5xx → max 3 → `RemoteUnreachable` (NFR-9); 401/403
  never retried (NFR-12).
- Must: 0 requests target any host other than `baseUrl` (AC-F2-3).
- Must: `bun run check` exits 0; `check:boundaries` clean (`client.ts` imports
  domain + native built-ins only).

**Files and modules**:

- Code areas: `src/infra/confluence/client.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/infra/confluence/client.test.ts`

**Completion signal**: `feat(confluence): ConfluenceClient — native fetch, v1/v2 URLs, auth, redaction, 429/5xx retry (GH-21)`

---

### Phase 4: `PageService` (v2) + the 409-conflict parse + 403→Forbidden (F-3, F-7, AC-F3-1, AC-F7-1)

**Goal**: Deliver F-3 + F-7 — the v2 page surface (create `POST`, read
`GET?body-format=storage`, update `PUT` with `version.number = N+1`, move) and
the **brand-defining 409-conflict parse** (`errors[0].code==="CONFLICT"` + the
version-laden title → typed `Conflict`), plus the 403 → `Forbidden` warn+skip
(never delete+recreate). zod schemas validate every v2 page response + the 409
envelope at the boundary.

**Tasks**:

- [x] **4.1** Create `src/infra/confluence/schemas/page.ts` (new) — zod schemas
      for the v2 page response + the v2 409 conflict envelope:
      `PageV2Response`, `Conflict409Envelope` (`{ errors: [{ code; title }] }`).
      Use `z.infer<typeof …>` for the adapter-internal types (typescript.md
      zod-first). These are adapter-internal — they never cross the port.
- [x] **4.2** Create `src/infra/confluence/pages.ts` (new) — `PageService` over
      the `ConfluenceClient`:
      - `create(req) → Result<Page, MarkSyncError>` — `POST v2("/pages")` with
        `representation:"storage"` (spike H3); validate the response with
        `PageV2Response`; map to the port `Page`.
      - `get(id) → Result<Page, MarkSyncError>` — `GET v2("/pages/{id}?body-format=storage")`;
        403 → `err({ kind:"Forbidden"; pageId; operation:"getPage" })`;
        404 → `err({ kind:"RemoteMissing"; pageId })`; validate + map.
      - `update(req) → Result<Page, MarkSyncError>` — `PUT v2("/pages/{id}")`
        with `version:{ number: baseVersion+1; message }`; **409** →
        `parseConflict(pageId, body)` → `err({ kind:"Conflict"; pageId;
        baseVersion; remoteVersion })` (reusing the **pre-existing** `Conflict`
        arm); 403 → `Forbidden`.
      - `move(req)` — v2 parent change.
      - `parseConflict(pageId, body)`: validate the body with
        `Conflict409Envelope`; assert `errors[0]?.code === "CONFLICT"`; parse
        `Current Version: [N]` + `Provided version: [M]` from `errors[0].title`
        via a tested regex (spike H5 exact title shape). A schema-validation
        failure → `RemoteUnreachable` (PD-5) — never a silent misparse.
      - Imports: `#infra/confluence/client`, `#infra/confluence/schemas/page`,
        `#domain/target/port` (the `Page`/request value types), `#domain/errors`,
        `#domain/result`, value `zod`.
      - ≤ 3-line header; cite spike H5 (409 shape) once at the parse; cite
        ADR-0006 C-5/C-6 + INV-SAFE-1 once at the 403 mapping.
- [x] **4.3** Create `tests/unit/infra/confluence/pages.test.ts` (new) — **Unit**
      with the client backed by an injected stub `fetch`:
      - **TC-409-001 (AC-F3-1):** a mocked 409 with
        `errors[0].code:"CONFLICT"` + title
        `"…Current Version: [7]. Provided version: [5]"` → `updatePage` returns
        `err({ kind:"Conflict"; pageId; baseVersion:5; remoteVersion:7 })` —
        version numbers **correctly parsed** (not swapped).
      - **TC-409-002 (NFR-2):** multiple 409 fixtures (different version pairs,
        including multi-digit) → 100% correct extraction.
      - **TC-403-001 (AC-F7-1):** a mocked 403 on `getPage` →
        `err({ kind:"Forbidden"; pageId; operation:"getPage" })`; assert **0**
        delete/recreate operations are issued (warn+skip — INV-SAFE-1).
      - **TC-404-001:** 404 → `RemoteMissing`.
      - **TC-200-001:** a mocked 200 page response → validated + mapped to the
        port `Page`.
      - **TC-SCHEMA-001 (NFR-10 / PD-5):** a malformed 200/409 body (fails zod) →
        `RemoteUnreachable` (never a silent misparse).

**Acceptance Criteria**:

- Must: a mocked 409 CONFLICT → `err(Conflict{ baseVersion; remoteVersion })`
  with correctly parsed version numbers — 100% of fixtures (AC-F3-1 / NFR-2).
- Must: a mocked 403 → `Forbidden`; 0 delete/recreate ops (AC-F7-1 / NFR-3 /
  INV-SAFE-1).
- Must: the pre-existing `Conflict`/`Forbidden`/`RemoteMissing` arms are reused
  verbatim — no new kind (NG-9).
- Must: every v2 response is zod-validated before mapping (NFR-10).

**Files and modules**:

- Code areas: `src/infra/confluence/schemas/page.ts` (new),
  `src/infra/confluence/pages.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/infra/confluence/pages.test.ts`

**Completion signal**: `feat(confluence): PageService (v2) + 409-conflict parse + 403→Forbidden warn+skip (GH-21)`

---

### Phase 5: `PropertyService` (v2) + `AttachmentService` (v1, 400-dup idempotency) (F-4, F-5, AC-F4-1, AC-F5-1)

**Goal**: Deliver F-4 + F-5 — the v2 content-property surface (`marksync.metadata`
string cross-check; spike H2) and the v1-only attachment surface (multipart
upload, the 400-duplicate-filename **idempotency signal** — not an error; spike
H4 — and `/data` update). Powers the ADR-0006 lock cross-check and idempotent
rerun (NFR-PERF-4).

**Tasks**:

- [x] **5.1** Create `src/infra/confluence/schemas/property.ts` +
      `src/infra/confluence/schemas/attachment.ts` (new) — zod schemas for the
      v2 content-property response + the v1 attachment list/creation response.
      Adapter-internal.
- [x] **5.2** Create `src/infra/confluence/properties.ts` (new) —
      `PropertyService` over the client:
      - `get(pageId, key) → Result<string | undefined, MarkSyncError>` —
        `GET v2("/pages/{id}/property/{key}")`; 404 (key absent) → `ok(undefined)`
        (a missing cross-check is not an error); validate the value field.
      - `put(pageId, key, value) → Result<void, MarkSyncError>` —
        `POST v2("/pages/{id}/properties")` storing the **string** value (spike
        H2: v2 accepts string values, ~8.4 KB; v1 deprecated). A 409 on
        key-conflict (v1+v2 share one namespace) → handled (update-by-key or
        `Conflict`). A `TooLarge` (value > limit) → `err({ kind:"TooLarge"; … })`.
      - The wire value is a **string** stored/returned byte-for-byte;
        serialization of lock fields into the string is E3-S6's concern.
      - Imports: client, schemas, `#domain/target/port`, domain errors/result,
        value `zod`. ≤ 3-line header; cite spike H2 once.
- [x] **5.3** Create `src/infra/confluence/attachments.ts` (new) —
      `AttachmentService` (v1-only) over the client:
      - `upload(pageId, artifact) → Result<AttachmentRef, MarkSyncError>` —
        `POST v1("/content/{id}/child/attachment")` multipart with
        `X-Atlassian-Token: no-check` + `minorEdit:true` (spike H4); files are
        **hash-named** (`marksync-mermaid-<hash>.svg`, `marksync-asset-<hash>.<ext>`)
        so dedup keys on the filename. **400 `"Cannot add a new attachment with
        same file name"` → an "already exists" result, NOT an error** (DEC-3 /
        spike H4) — idempotent rerun performs 0 writes (NFR-PERF-4).
      - `update(attId, artifact)` — `POST v1("/content/{id}/child/attachment/{attId}/data")`
        (version bump) when bytes changed (spike H4).
      - `exists(pageId, hash) → Result<boolean, MarkSyncError>` — resolve by the
        hash-derived filename; 403 → `Forbidden`.
      - `list(pageId) → Result<AttachmentRef[], MarkSyncError>` — enumerate.
      - Imports: client, schemas, `#domain/target/port`, domain errors/result,
        value `zod`. ≤ 3-line header; cite spike H4 once at the 400-dup mapping.
- [x] **5.4** Create `tests/unit/infra/confluence/properties.test.ts` (new) —
      **Unit**:
      - **TC-PROP-RT-001 (AC-F4-1 / NFR-5):** `put` a string value; `get` reads
        it back **byte-equal**; an **~8 KB** value round-trips (spike H2 ~8.4 KB).
      - **TC-PROP-MISS-001:** a missing key → `ok(undefined)` (not an error).
      - **TC-PROP-CONFLICT-001:** a 409 key-conflict → handled.
- [x] **5.5** Create `tests/unit/infra/confluence/attachments.test.ts` (new) —
      **Unit**:
      - **TC-DUP-001 (AC-F5-1 / NFR-4):** upload a duplicate filename → the
        create endpoint's 400 "same file name" → an **"already exists"** result
        (NOT an error); idempotent rerun performs 0 writes.
      - **TC-UPD-001 (AC-F5-1):** changed bytes → `/data` update bumps the
        attachment version.
      - **TC-EXISTS-001:** `exists(pageId, hash)` resolves by the hash-derived
        filename; 403 → `Forbidden`.
      - **TC-LIST-001:** `list(pageId)` enumerates the hash-named attachments.

**Acceptance Criteria**:

- Must: `putProperty` string → `getProperty` byte-equal; ~8 KB round-trips
  (AC-F4-1 / NFR-5).
- Must: duplicate filename 400 → "already exists" (not an error); `/data` update
  bumps version on changed bytes (AC-F5-1 / NFR-4).
- Must: v2 used for properties (v1 deprecated — spike H2); v1-only for
  attachments (NFR-MAINT-1).
- Must: every response zod-validated (NFR-10).

**Files and modules**:

- Code areas: `src/infra/confluence/schemas/property.ts` (new),
  `src/infra/confluence/schemas/attachment.ts` (new),
  `src/infra/confluence/properties.ts` (new),
  `src/infra/confluence/attachments.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/infra/confluence/properties.test.ts`
- `bun test tests/unit/infra/confluence/attachments.test.ts`

**Completion signal**: `feat(confluence): PropertyService (v2) + AttachmentService (v1, 400-dup idempotency) (GH-21)`

---

### Phase 6: `SearchService` + `RestrictionsService` (v1, minimal) + provenance formatter + `ConfluenceTarget` adapter (F-6, F-8)

**Goal**: Deliver F-6 (minimal v1-only CQL search + restrictions read) + F-8 (the
Confluence-specific `version.message` provenance formatter) and assemble the
`ConfluenceTarget` adapter class (PD-7) — the `TargetSystem` port implementor
that composes the client + all services + the `renderBody` delegate. After this
phase the full port is implemented and ready for integration testing.

**Tasks**:

- [x] **6.1** Create `src/infra/confluence/schemas/search.ts` +
      `src/infra/confluence/schemas/restrictions.ts` (new) — minimal v1 zod
      schemas for the CQL search result + the restrictions read.
- [x] **6.2** Create `src/infra/confluence/search.ts` (new) — `SearchService`:
      `search(cql) → Result<PageRef[], MarkSyncError>` — `v1` CQL search (page
      discovery for `doctor`/discovery). Kept minimal (NFR-MAINT-2).
- [x] **6.3** Create `src/infra/confluence/restrictions.ts` (new) —
      `RestrictionsService`: `get(pageId) → Result<PageRestrictions, MarkSyncError>`
      — `GET v1("/content/{id}/restriction")` read (supports the 403/
      permission-awareness story, R-FEA-10). Kept minimal.
- [x] **6.4** Create `src/infra/confluence/provenance.ts` (new) —
      `formatVersionMessage(input) → string`: the `version.message` formatter
      (ADR-0006/ADR-0010 provenance; NFR-REL-9). Produces a clear MarkSync/Git
      prefix + the head commit id + a compact included-commit summary,
      deterministically trimmed to `MAX_VERSION_MESSAGE_LEN` (PD-6 — conservative
      named constant; ADR-0010 §"Open questions" lists the exact limit as TO
      CONFIRM, confirmed in E5-S1). It is **Confluence-specific** so it lives in
      the adapter; it takes adapter-agnostic input (commit id + subjects) and
      produces the string. Consumed by E3-S6/E4-S3; `PageService.update` sets it
      on `version.message`.
- [x] **6.5** Create `src/infra/confluence/target.ts` (new) —
      `class ConfluenceTarget implements TargetSystem` (PD-7): composes the
      `ConfluenceClient` + `PageService` + `PropertyService` + `AttachmentService`
      + `SearchService` + `RestrictionsService`; `renderBody(hast, opts)`
      delegates to the GH-20 `renderStorage` (`#infra/confluence/render/storage`)
      — DEC-5 / PD-1. Every method returns `Result<T, MarkSyncError>`. This is
      the sole `TargetSystem` implementor; the single seam E3-S5/E3-S6/E4 call.
- [x] **6.6** Create `tests/unit/infra/confluence/search.test.ts`,
      `tests/unit/infra/confluence/restrictions.test.ts`,
      `tests/unit/infra/confluence/provenance.test.ts` (new) — **Unit**:
      - **TC-SEARCH-001:** a mocked CQL result → validated + mapped.
      - **TC-RESTR-001:** a mocked restrictions read → mapped; 403 → `Forbidden`.
      - **TC-PROV-001 (F-8):** `formatVersionMessage` produces the MarkSync/Git
        prefix + head commit + compact summary; deterministically trimmed to
        `MAX_VERSION_MESSAGE_LEN` (a payload exceeding the limit is trimmed, not
        truncated mid-token where avoidable); deterministic (same input → same
        string across runs).
- [x] **6.7** Create `tests/unit/infra/confluence/target.test.ts` (new) —
      **Unit**: `ConfluenceTarget` wires every port op to its service; a
      smoke-assert that `renderBody` delegates to `renderStorage` (a tiny HAST →
      a body + hash); the class satisfies the `TargetSystem` interface (TS
      structural check).

**Acceptance Criteria**:

- Must: CQL search + restrictions read work via v1 (NFR-MAINT-1); both minimal.
- Must: the provenance formatter is deterministic + trimmed to the named limit
  (F-8); the limit is a single named constant (PD-6).
- Must: `ConfluenceTarget implements TargetSystem` (PD-7); `renderBody` delegates
  to `renderStorage` (DEC-5); every op returns `Result<T, MarkSyncError>`.
- Must: `bun run check` exits 0; `check:boundaries` clean (`target.ts` may import
  domain port + the renderer; domain never imports it).

**Files and modules**:

- Code areas: `src/infra/confluence/schemas/search.ts` (new),
  `src/infra/confluence/schemas/restrictions.ts` (new),
  `src/infra/confluence/search.ts` (new),
  `src/infra/confluence/restrictions.ts` (new),
  `src/infra/confluence/provenance.ts` (new),
  `src/infra/confluence/target.ts` (new).
- System docs: none (component-delivered tags + UL bindings are lifecycle phase 7).

**Tests**:

- `bun test tests/unit/infra/confluence/search.test.ts`
- `bun test tests/unit/infra/confluence/restrictions.test.ts`
- `bun test tests/unit/infra/confluence/provenance.test.ts`
- `bun test tests/unit/infra/confluence/target.test.ts`

**Completion signal**: `feat(confluence): Search/Restrictions (v1) + provenance formatter + ConfluenceTarget adapter (GH-21)`

---

### Phase 7: Integration tests against a `Bun.serve` mock (all ACs)

**Goal**: Exercise the full `ConfluenceTarget` adapter end-to-end against a
local `Bun.serve` mock simulating the v2/v1 split and every status path
(200/409/403/400/429/5xx), plus the property round-trip and the attachment
upload/update/dup lifecycle. This is where the safety properties are proven
through an integration path (not mocks alone — testing-strategy §"over-mocking
guardrail") and where AC-F2-2 (no token leak) + AC-F2-3 (no outbound telemetry)
are asserted over captured real HTTP traffic.

**Tasks**:

- [x] **7.1** Create `tests/integration/confluence/confluence-target.test.ts`
      (new) — **Integration** with `Bun.serve` mocking v2 (`/wiki/api/v2/*`) +
      v1 (`/wiki/rest/api/*`) + recording every incoming request (URL, method,
      headers, body):
      - **TC-INT-UPDATE-200:** `updatePage` with `version.number = N+1` → 200 →
        `ok(Page)`.
      - **TC-INT-409 (AC-F3-1):** a stale `version.number` → the mock returns
        409 `errors[0].code:"CONFLICT"` + the version-laden title →
        `err(Conflict{ baseVersion; remoteVersion })` with correct numbers.
      - **TC-INT-403 (AC-F7-1):** `getPage` on a locked page → 403 → `Forbidden`;
        assert **0** delete/recreate requests were issued to the mock.
      - **TC-INT-PROP-RT (AC-F4-1):** `putProperty` string → `getProperty`
        byte-equal; an ~8 KB value round-trips.
      - **TC-INT-ATT-DUP (AC-F5-1):** duplicate-filename upload → mock 400 "same
        file name" → "already exists" (not an error); changed bytes → `/data`
        update bumps version.
      - **TC-INT-429 (AC-F2-1):** mock 429 + `Retry-After: 1` (then 200) → client
        waits + retries (max 3) → ok; a sustained 429 → `RateLimited`.
      - **TC-INT-5XX (NFR-9):** a transient 5xx → retried (max 3); sustained →
        `RemoteUnreachable`.
      - **TC-INT-NOLEAK (AC-F2-2 / INV-SEC-1):** grep the captured request +
        response artifacts (headers + bodies) for the token → **0** occurrences
        (the redaction layer + the opaque-authHeader design are the controls).
      - **TC-INT-NOTELEMETRY (AC-F2-3 / NFR-SEC-3):** assert every captured
        request URL's host === the configured `baseUrl` host — **0** requests to
        any other host.
      - **TC-INT-BOUNDARY (AC-F1-1):** assert `bun run check:boundaries` is green
        on `src/` (the port is the only seam; no `src/domain/**` or `src/cli/**`
        imports `#infra/confluence/*`).

**Acceptance Criteria**:

- Must: the full adapter against the mock exercises 200/409/403/400/429/5xx with
  the typed outcomes above (AC-F3-1, AC-F7-1, AC-F4-1, AC-F5-1, AC-F2-1, NFR-9).
- Must: 0 token occurrences in captured artifacts (AC-F2-2); 0 requests to any
  non-`baseUrl` host (AC-F2-3).
- Must: `check:boundaries` green on `src/` (AC-F1-1 positive side).
- Must: `bun run check` exits 0.

**Files and modules**:

- Code areas: none (test-only phase; the adapter is complete after Phase 6).
- System docs: none.

**Tests**:

- `bun test tests/integration/confluence/confluence-target.test.ts`

**Completion signal**: `test(confluence): integration tests against Bun.serve mock — 200/409/403/400/429/5xx + no-leak + no-telemetry (GH-21)`

---

### Phase 8: Final quality gate + boundary confirmation + doc handoff (AC-Q-1)

**Goal**: Run the full `bun run check` gate, confirm the dep-cruiser boundary
direction (the port is the only seam; no `domain`/`cli` → `infra/confluence`
import), and hand the doc-reconciliation risks to lifecycle phase 7
(`@doc-syncer`). No new behavior. This is the AC-Q-1 discharge + the spec-
reconciliation handoff (the final release phase per the plan template).

**Tasks**:

- [x] **8.1** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); fix any issue. Confirm all `AC-*` are green (TC-GATE-001).
      — `bun run check` exits 0 (772 pass / 0 fail; 74 modules, 101 deps cruised).
- [x] **8.2** Confirm the boundary direction explicitly (AC-F1-1 / NFR-1):
      `depcruise src` passes with no `domain-may-not-import-infra` /
      `presentation-may-not-import-infra` violation — i.e. no `src/domain/**` or
      `src/cli/**` imports `#infra/confluence/*`; the one-way
      `infra/confluence/** → #domain/*` (+ renderer) edge is the only direction
      added. **Scope note (GH-20 Finding 6 precedent):** dep-cruiser enforces the
      load-bearing forbidden directions at severity `error`; the broader matrix
      has gaps (no `infra → app`/`infra → cli` rule) — hardening is a future
      item, out of scope here.
      — confirmed: `grep "#infra/confluence" src/domain/ src/cli/` = 0; depcruise 0 violations.
- [x] **8.3** Hand off the doc risks to lifecycle phase 7 (`@doc-syncer`): tag
      the adapter component delivered in `feature-confluence-adapter.md` §4.2 +
      `architecture-overview.md` (client/attachment/property/provenance/search/
      restrictions components; `related_changes += GH-21`); record the
      `RateLimited` + `RemoteUnreachable` arm provenance in `src/domain/errors.ts`
      + the DEC-2 tables in `cli-error-map.ts`/`exit-codes.ts`; bind the
      `TargetSystem` port + adapter VOs in `ubiquitous-language.md`
      (`related_changes += GH-21`); **reconcile doc drift**: (a) the
      `getPage(id, repr)` arity + `renderBody` HAST-vs-MDAST input between
      architecture-overview §"Internal interface contracts", the story file, and
      the implemented port (PD-1); (b) correct the spec §8.4/§13 "zod already
      installed" claim + move `zod` "Planned → Installed" in `typescript.md`
      (PD-2); (c) confirm the `version.message` length limit in ADR-0010 against
      the E5-S1 live tenant and update the `MAX_VERSION_MESSAGE_LEN` default
      (PD-6). *(No code change here — handed to lifecycle phase 7 / `@doc-syncer`,
      out of the coder's delivery scope.)*

**Acceptance Criteria**:

- Must: `bun run check` exits 0 (AC-Q-1 / NFR-14).
- Must: dep-cruiser green; the port is the only seam (AC-F1-1 / NFR-1).

**Files and modules**:

- Code areas: none (gate-only phase; opportunistic boy-scout header trims allowed).
- System docs: none in this phase (doc reconciliation is lifecycle phase 7).

**Tests**:

- `bun run check` (full gate).

**Completion signal**: `chore(confluence): final quality gate + boundary confirmation + doc handoff for E3-S4 (GH-21)`

---

### Phase 9: Code Review Remediation (Iteration 1)

> Added by `@reviewer` after iteration-1 review
> (`code-review/findings-iter-1.json` / `review-iter-1.md`). Verdict was FAIL on
> one MAJOR contract gap; the rest are MINOR/NIT. `@coder` to address.

**Goal**: Close the one MAJOR finding (AC-F5-1 second clause — `/data` attachment
update unreachable via the port) and the cheap MINOR/NIT items so the port fully
discharges every spec AC through the documented seam.

**Tasks**:

- [x] **9.1 (MAJOR — finding 1 / AC-F5-1b)** Decide + implement the
      `/data` attachment-update reachability. **Resolution: option (c)** (directed
      by user / decision authority; supersedes the tentative (b) in pm-notes).
      Removed the orphaned `AttachmentService.update()` and the `TC-UPD-001` test;
      documented in the `attachments.ts` header that hash-derived filenames
      (`marksync-mermaid-<hash>.svg` / `marksync-asset-`) make in-place `/data`
      update unnecessary for MS-0002 — changed bytes → new hash → new filename →
      fresh create, never a same-name dup. (Spec/doc-sync of AC-F5-1's second
      clause is a `system_spec_update` / `review_fix` follow-up.)
- [x] **9.2 (MINOR — finding 2)** `USER_AGENT` now derived from `package.json`
      at module load (`import pkg from "../../../package.json" with { type: "json" }`
      → `marksync/${pkg.version}`); no more hardcoded version string.
- [x] **9.3 (MINOR — finding 3)** Added `unreachableCause(status, operation)`
      helper in `client.ts` returning `"HTTP 401 Unauthorized (token expired?)"`
      for 401; wired into the generic `RemoteUnreachable` branch across
      `pages`/`properties`/`attachments`/`search`/`restrictions`.
- [x] **9.4 (MINOR — finding 4)** Added a comment in `parseRetryAfterMs`
      documenting that Confluence sends integer seconds; HTTP-date format falls
      back to exponential backoff.
- [x] **9.5 (MINOR — finding 5)** Added a structural-typing note on
      `RenderedBody` / `RenderBodyOptions` in `port.ts` + `TC-RENDER-TYPES-001`
      (mutually-assignable witness in `target.test.ts`).
- [x] **9.6 (NIT — finding 6)** Added `beforeAll(removeProbe)` + `afterAll`
      to `boundary-negative.test.ts` (entry/exit cleanup alongside `afterEach`)
      and gitignored `src/domain/__boundary_probe__.ts`.
- [x] **9.7 (NIT — finding 7)** Simplified the `target.ts` import to a single
      `import { ConfluenceClient, type ConfluenceClientOptions }` (dropped the
      `as Client` alias; `new ConfluenceClient(...)` used directly).
- [x] **9.8** `bun run check` = **772 pass / 0 fail**; `depcruise src` clean
      (no violations). AC-F5-1 now satisfied through the documented hash-naming
      invariant (no orphaned `/data` path).

**Acceptance Criteria**:

- Must: the `/data` attachment update is either reachable through the
  `TargetSystem` port OR explicitly re-scoped with a recorded decision (9.1). —
  **PASSED** (option (c): `/data` update explicitly removed + documented; the
  hash-naming invariant makes it unreachable by design).
- Must: `bun run check` exits 0; `check:boundaries` clean (AC-Q-1). — **PASSED**
  (772/0; depcruise: no violations).

**Completion signal**: `fix(confluence): address review iter-1 findings (GH-21)`

---

### Phase 10: Code Review Remediation (Iteration 2)

> Added by `@reviewer` after iteration-2 review
> (`code-review/findings-iter-2.json` / `review-iter-2.md`). Verdict was FAIL:
> iter-1 finding 1 only PARTIALLY resolved (the option-(c) spec reconciliation
> never executed → AC-F5-1 unmet as written), and the redaction-duplication MAJOR
> (finding 8) is still open. `@coder` to address.

**Goal**: Close the two open MAJORs — reconcile the spec to the hash-naming
decision so AC-F5-1 passes by design (finding 1), and collapse the duplicated /
drifted redaction to a single source of truth on the security path (finding 8) —
plus the carry-forward minors and the vestigial `/data` test scaffolding.

**Tasks**:

- [ ] **10.1 (MAJOR — finding 1 / AC-F5-1b, carried)** Reconcile the spec to the
      option-(c) decision in a single pass so the contract matches the
      implementation. Rewrite AC-F5-1's second clause (spec L391) to state that
      changed bytes produce a **fresh create** via a new hash-derived filename
      (not a `/data` version bump). Update every remaining `/data`-update
      reference: F-5 (L139), G-5 (L80), NFR-4 (L283), DEC-3 (L358), the endpoints
      table (L246), the artifacts table (L376), the Test Scenarios row TC-UPD-001
      (L1150 — now orphaned; drop or repurpose to an idempotent-rerun case), and
      `doc/spec/features/feature-confluence-adapter.md:125`. Promote the rationale
      to a durable record (PDR/ADR, or formalize the `REVIEW-1-MAJOR` pm-notes
      entry). After this, AC-F5-1 passes by design.
- [ ] **10.2 (MAJOR — finding 8, re-verified)** Eliminate the duplicated redaction
      in `client.ts`. Preferred: lift the patterns/`Redactor` to a tier both infra
      and presentation may import (e.g. `src/shared/`) so `redactLog` imports the
      single source of truth (`DEFAULT_PATTERNS`). Minimal acceptable: restore the
      missing `env-token` pattern, adopt the canonical `[REDACTED:<kind>]`
      sentinels, AND add a structural compatibility test asserting `redactLog`'s
      pattern set equals `DEFAULT_PATTERNS` (fail the gate on future drift). Do
      not leave two independently-evolving security regex sets.
- [ ] **10.3 (MINOR — finding 12, new)** Remove the vestigial `/data` scaffolding
      from `TC-INT-ATT-DUP` (`tests/integration/confluence/confluence-target.test.ts`):
      drop the `/data` mock handler (L211-218) and retitle the describe block to
      "duplicate upload → already exists" (no `/data` clause). Optional: add an
      idempotent-rerun case proving a second upload of the SAME hash performs 0
      writes (the real AC-F5-1 intent under hash-naming).
- [ ] **10.4 (MINOR — finding 10, carried)** Resolve the shared 429/5xx retry
      budget: either correct the `MAX_RETRIES` comment (client.ts:11) to describe
      the single-shared-budget design and add a mixed 429/5xx test, or split into
      independent per-status counters if "max 3 each" is the intended contract.
- [ ] **10.5 (MINOR — finding 9, carried)** `resolveExisting` fabricated id:
      extract the `"unknown"` magic string (attachments.ts:125) to a named
      constant and add a one-line note that `id`/`version` are best-effort on the
      unresolvable edge (or return a distinguishable outcome / omit the id).
- [ ] **10.6 (NIT — finding 11, carried)** `TC-INT-PROP-RT`: make the GET mock
      return a fixed fixture independent of the POST capture (or narrow the
      assertion to "a v2 POST then a v2 GET happened" and rely on the unit test
      for byte-equality).

**Acceptance criteria**:

- Must: AC-F5-1 passes by design — spec reconciled; no remaining `/data`-update
  claim in the change spec, plan Test Scenarios, or system spec.
- Must: one redaction source of truth (or a parity test gating drift); AC-F2-2
  still holds.
- Must: `bun run check` green; `depcruise src` clean; no `/data` references left
  in `TC-INT-ATT-DUP`.

**Completion signal**: _to be set by `@coder`_

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-ERR-001..002 | `RateLimited` + `RemoteUnreachable` round-trip `mapMarkSyncErrorToCommandError` → stable codes; `assertNeverMarkSyncError` throws; no `cause` in messages | 1 | AC-Q-1 / NFR-13 |
| TC-URL-001 | `v1`/`v2` URL builders root at `baseUrl` (v1/v2 split isolated) | 3 | AC-F1-1 / NFR-MAINT-1 |
| TC-AUTH-001 | every request carries `authHeader` + `User-Agent`; 0 token in redacted logs | 3, 7 | AC-F2-2 / INV-SEC-1 |
| TC-429-001 | mocked 429 + `Retry-After` → bounded retry (max 3); exhaustion → `RateLimited` | 3, 7 | AC-F2-1 / NFR-6 |
| TC-5XX-001 | mocked transient 5xx → retry (max 3); exhaustion → `RemoteUnreachable` | 3, 7 | NFR-9 |
| TC-NORETRY-001 | mocked 401/403 → 0 retries | 3 | NFR-12 |
| TC-NETWORK-001 | thrown `fetch` → `RemoteUnreachable` (no retry) | 3 | NFR-9 |
| TC-TELEMETRY-001 | every request host === `baseUrl`; 0 to other hosts | 3, 7 | AC-F2-3 / NFR-SEC-3 |
| TC-BND-001 | negative test: dep-cruiser fires `domain-may-not-import-infra` on an ephemeral `src/domain/` probe (production ruleset; probe deleted in afterEach) | 2 | AC-F1-1 |
| TC-409-001/002 | mocked 409 CONFLICT → `Conflict{baseVersion; remoteVersion}` with correct numbers (multiple fixtures) | 4, 7 | AC-F3-1 / NFR-2 |
| TC-403-001 | mocked 403 on `getPage` → `Forbidden`; 0 delete/recreate ops | 4, 7 | AC-F7-1 / NFR-3 |
| TC-404-001 | 404 → `RemoteMissing` | 4 | F-3 |
| TC-200-001 | mocked 200 page → validated + mapped to port `Page` | 4 | F-3 |
| TC-SCHEMA-001 | malformed 200/409 body (fails zod) → `RemoteUnreachable` (no silent misparse) | 4 | NFR-10 / RSK-7 |
| TC-PROP-RT-001 | `putProperty` string → `getProperty` byte-equal; ~8 KB round-trips | 5, 7 | AC-F4-1 / NFR-5 |
| TC-PROP-MISS-001 | missing key → `ok(undefined)` | 5 | F-4 |
| TC-PROP-CONFLICT-001 | 409 key-conflict handled | 5 | F-4 |
| TC-DUP-001 | duplicate filename 400 → "already exists" (not an error); 0 writes on rerun | 5, 7 | AC-F5-1 / NFR-4 |
| TC-UPD-001 | changed bytes → `/data` update bumps version | 5, 7 | AC-F5-1 |
| TC-EXISTS-001 / TC-LIST-001 | `attachmentExists` by hash-filename; `listAttachments` enumerates | 5 | F-5 |
| TC-SEARCH-001 / TC-RESTR-001 | CQL search + restrictions read (v1, minimal) | 6 | F-6 |
| TC-PROV-001 | `formatVersionMessage` deterministic + trimmed to `MAX_VERSION_MESSAGE_LEN` | 6 | F-8 |
| TC-TARGET-001 | `ConfluenceTarget implements TargetSystem`; `renderBody` delegates to `renderStorage` | 6 | F-1 / DEC-5 |
| TC-INT-* | full adapter vs `Bun.serve` mock: 200/409/403/400/429/5xx + prop RT + attach dup + no-leak + no-telemetry + boundary | 7 | AC-F1-1..AC-Q-1 |
| TC-GATE-001 | `bun run check` exits 0 | 8 | AC-Q-1 / NFR-14 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-21-spec.md | Spec |
| Story file | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S4--confluence-adapter.md` | Story |
| PM notes | ./chg-GH-21-pm-notes.yaml | PM notes |
| `TargetSystem` port + value types | `src/domain/target/port.ts` | Code (new) |
| `RateLimited` + `RemoteUnreachable` arms | `src/domain/errors.ts` (+ `cli-error-map.ts` + `exit-codes.ts`) | Code (updated) |
| `ConfluenceClient` | `src/infra/confluence/client.ts` | Code (new) |
| `PageService` | `src/infra/confluence/pages.ts` | Code (new) |
| `PropertyService` | `src/infra/confluence/properties.ts` | Code (new) |
| `AttachmentService` | `src/infra/confluence/attachments.ts` | Code (new) |
| `SearchService` / `RestrictionsService` | `src/infra/confluence/search.ts` / `restrictions.ts` | Code (new) |
| Provenance formatter | `src/infra/confluence/provenance.ts` | Code (new) |
| `ConfluenceTarget` adapter | `src/infra/confluence/target.ts` | Code (new) |
| Boundary zod schemas | `src/infra/confluence/schemas/*.ts` | Code (new) |
| Boundary negative test (ephemeral `src/domain/` probe — no committed fixture) | `tests/unit/domain/target/boundary-negative.test.ts` | Test (new) |
| ADR-0005 (Storage target) | `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md` | Decision |
| ADR-0006 (state model — 409/property/403/INV-SAFE-1) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | Decision |
| ADR-0010 (provenance `version.message`) | `doc/decisions/ADR-0010-page-history-provenance-and-sync-granularity.md` | Decision |
| Spike findings (H1–H5) | `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` | Evidence |
| Reused seams | `src/domain/credentials.ts` (GH-17), `src/infra/confluence/render/storage.ts` (GH-20), `src/cli/output/redact.ts` (GH-16), `src/domain/result.ts`, `src/domain/errors.ts` | Reused |
| House-style precedent | `doc/changes/2026-07/2026-07-09--GH-20--markdown-pipeline/chg-GH-20-plan.md` | Plan precedent |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | plan-writer | Initial plan. Nine phases per spec §18 ordering: Phase 0 installs `zod` (PD-2 — spec's "already installed" claim is a factual error); Phase 1 lands the two additive error arms (`RateLimited` + `RemoteUnreachable`, OQ-1/OQ-2) across all three sites typescript.md requires (PD-3); Phase 2 the port + boundary negative test (PD-1 HAST input, PD-4 boundary negative test); Phases 3-6 the client + services + provenance + `ConfluenceTarget`; Phase 7 integration tests; Phase 8 gate + doc handoff. Surfaced open questions: provenance length limit (PD-6 / ADR-0010 TO CONFIRM); renderBody HAST-vs-MDAST doc drift (PD-1); spec "zod installed" error (PD-2). |
| 1.1 | 2026-07-10 | plan-writer | DoR iteration-2 fix (MAJOR): align the boundary negative test (TC-BND-001 / AC-F1-1) with the test plan's iteration-1 fix. The prior static `tests/`-located fixture approach is non-viable (the production `.dependency-cruiser.cjs` rule filters `from: { path: "src/domain/" }` and runs `depcruise src`, so a fixture under `tests/` cannot fire the production rule). Rewrote PD-4, the Phase 2 mechanism open question (now resolved — only API-vs-subprocess remains a delivery detail), Phase 2 tasks 2.2/2.3, the Phase 2 acceptance criteria, TC-BND-001, and the Artifacts table to the ephemeral `src/domain/__boundary_probe__.ts` approach: probe created at runtime under `src/domain/`, cruised with the **production** ruleset (no proxy/adapted copy), then deleted in `afterEach`/`finally` (cleanup is load-bearing — a leaked probe permanently breaks `depcruise src`). No committed fixture file. |
| 1.2 | 2026-07-10 | reviewer | Review iteration-1 remediation: appended Phase 9 (Code Review Remediation, iter-1). Verdict FAIL on 1 MAJOR (AC-F5-1b — `/data` attachment update implemented on `AttachmentService` + unit-tested but unreachable via the `TargetSystem` port; E4-S1/E4-S2 blocked on it) + 4 MINOR (hardcoded `USER_AGENT` version; HTTP 401 → `RemoteUnreachable` misclassification; `Retry-After` HTTP-date unsupported; duplicated `RenderedBody` types with no compatibility test) + 2 NIT (boundary-probe leak blast radius; awkward `ConfluenceClient` import alias). 8 of 9 ACs PASS; AC-F5-1 PARTIAL. Findings in `code-review/findings-iter-1.json`. |
| 1.3 | 2026-07-10 | coder | Phase 9 executed — all 7 iter-1 findings fixed. 9.1 resolved as option **(c)** (decision authority / user-directed; supersedes tentative (b) in pm-notes): removed orphaned `AttachmentService.update()` + `TC-UPD-001`, documented the hash-naming invariant in `attachments.ts`. 9.2 `USER_AGENT` ← `package.json`; 9.3 `unreachableCause()` helper (401 → `"HTTP 401 Unauthorized (token expired?)"`) across pages/properties/attachments/search/restrictions; 9.4 `Retry-After` comment; 9.5 port `RenderedBody`/`RenderBodyOptions` note + `TC-RENDER-TYPES-001` compatibility test; 9.6 boundary-probe `beforeAll`/`afterAll` + `.gitignore`; 9.7 `target.ts` import simplified. `bun run check` = 772/0; depcruise clean. |
| 1.4 | 2026-07-10 | reviewer | Re-review iteration-2 after remediation (commit 91363a5). Verdict **FAIL**: 6 of 7 iter-1 findings fully resolved (2-7); finding 1 only PARTIALLY resolved - the option-(c) **spec reconciliation was never executed** (plan task 9.1 itself flagged it as a deferred follow-up), so AC-F5-1 as-written still requires `/data` update and is unmet; spec/impl drift across AC-F5-1 + ~12 refs + DEC-3 + NFR-4 + system spec + integration-test title. Iter-2 also re-verified the 4 findings a stale pre-remediation iter-2 draft had raised: finding 8 (MAJOR - duplicated, already-drifted redaction in `client.ts` bypassing the centralized layer, missing `env-token`; violates Review Priority #2) still open; 9 (MINOR - fabricated `id:"unknown"`), 10 (MINOR - shared 429/5xx budget), 11 (NIT - store-and-echo RT mock) still open. New finding 12 (MINOR): vestigial `/data` mock + title in `TC-INT-ATT-DUP` left by the partial removal. 8 of 9 ACs PASS; AC-F5-1 FAIL as written. Appended Phase 10. Findings in `code-review/findings-iter-2.json`. |

## Execution Log

> Populated during execution by `@coder`; the PM records the completion signal (commit)
> and the `bun run check` result per phase.

| Phase | Status | Started | Completed | Commit | `bun run check` | Notes |
|-------|--------|---------|-----------|--------|------------------|-------|
| 0 — `zod` install + gate | ✅ | 2026-07-10 | 2026-07-10 | a7a97b1 | PASS (692/0) | PD-2; first consuming story; zod@4.4.3, 0 runtime deps |
| 1 — error arms (×2) + 3 sites | ✅ | 2026-07-10 | 2026-07-10 | 072c33b | PASS (703/0) | F-9 / AC-Q-1 / RSK-6; typecheck safety net; exit-codes.test EXPECTED updated |
| 2 — port + value types + boundary test | ✅ | 2026-07-10 | 2026-07-10 | 978222e | PASS (705/0) | F-1 / AC-F1-1; subprocess `bunx depcruise` chosen over programmatic API |
| 3 — ConfluenceClient | ✅ | 2026-07-10 | 2026-07-10 | 7e7bd54 | PASS (716/0) | F-2 / AC-F2-1/2/3; injected fetch+delay seams; infra-tier redactor mirror |
| 4 — PageService + 409 + 403 | ✅ | 2026-07-10 | 2026-07-10 | 608e75f | PASS (727/0) | F-3 / F-7 / AC-F3-1 / AC-F7-1; added title to UpdatePageRequest (v2 PUT requires it) |
| 5 — Property + Attachment | ✅ | 2026-07-10 | 2026-07-10 | ae971ad | PASS (739/0) | F-4 / F-5 / AC-F4-1 / AC-F5-1; v2 properties + v1 attachments |
| 6 — Search/Restrictions + provenance + adapter | ✅ | 2026-07-10 | 2026-07-10 | a28e32d | PASS (760/0) | F-6 / F-8; added target wiring tests for per-file coverage |
| 7 — integration (Bun.serve mock) | ✅ | 2026-07-10 | 2026-07-10 | 5c5ddcd | PASS (772/0) | all ACs; 200/409/403/400/429/5xx + no-leak + no-telemetry + boundary |
| 8 — final gate + boundary + doc handoff | ✅ | 2026-07-10 | 2026-07-10 | _this phase_ | PASS (772/0) | AC-Q-1; boundary clean; doc handoff to phase 7 |
| 9 — code review remediation (iter-1) | ✅ | 2026-07-10 | 2026-07-10 | _this phase_ | PASS (772/0) | 7 findings fixed: 9.1 option (c) (removed orphaned AttachmentService.update + TC-UPD-001, documented hash-naming); 9.2 USER_AGENT ← package.json; 9.3 401 diagnostic via unreachableCause across all services; 9.4 Retry-After comment; 9.5 RenderedBody compatibility test TC-RENDER-TYPES-001; 9.6 boundary-probe beforeAll/afterAll + gitignore; 9.7 target.ts import simplified; depcruise clean |
| 10 — code review remediation (iter-2) | ⏳ | 2026-07-10 | — | — | — | PENDING. Re-review FAIL: 10.1 reconcile spec to hash-naming (AC-F5-1 unmet as written); 10.2 collapse duplicated/drifted redaction (security path); 10.3 drop vestigial `/data` test scaffolding; 10.4 shared 429/5xx budget; 10.5 fabricated attachment id; 10.6 store-and-echo RT mock. |
