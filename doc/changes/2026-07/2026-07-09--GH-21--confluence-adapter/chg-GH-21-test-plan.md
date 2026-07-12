---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-21-test-plan
status: Proposed
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, security, infrastructure, adapter]
version_impact: minor
summary: "Test plan for the Confluence adapter story (MS2-E3-S4 / GH-21): the sole TargetSystem port implementor for Atlassian Confluence Cloud. Covers the domain-owned TargetSystem port interface (no Confluence types), the ConfluenceClient (native fetch, v1/v2 URL builders, authHeader injection, redacted logging, 429/5xx retry — no HTTP library), the v2 PageService with the brand-defining 409-conflict parse (version numbers extracted from the title), the v2 PropertyService (marksync.metadata string cross-check, ~8 KB round-trip), the v1-only AttachmentService (400-duplicate idempotency signal, /data update), the minimal v1 Search/Restrictions services, the version.message provenance formatter, and zod boundary validation on every Confluence response. Two additive MarkSyncError arms land first — RateLimited (exhausted-429, OQ-2) and RemoteUnreachable (exhausted-5xx/network, OQ-1; also the zod-schema-drift failure target per PD-5) — keeping assertNeverMarkSyncError exhaustive. Exercised at Unit + Integration tiers against a Bun.serve mock (200/409/403/400/429/5xx + property round-trip + attachment upload/update/dup); no E2E (wired by E5-S1). Critical-safety paths are proven through the integration tier (not mocks alone): 409 parse correctness, 403 warn+skip (0 delete/recreate), no-token-leak (grep captured artifacts), no-outbound-telemetry (every request host === baseUrl), and the dep-cruiser boundary negative test. Backoff timing uses fake timers / an injected delay seam — no real sleeps in the suite."
links:
  change_spec: "./chg-GH-21-spec.md"
  implementation_plan: "./chg-GH-21-plan.md"
  story_authoritative: doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S4--confluence-adapter.md
  feature_spec: doc/spec/features/feature-confluence-adapter.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_rules: .ai/rules/typescript.md
  decision_state_model: doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  decision_storage: doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md
  decision_provenance: doc/decisions/ADR-0010-page-history-provenance-and-sync-granularity.md
  spike_findings: doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md
  nonfunctional_spec: doc/spec/nonfunctional.md
  result_contract: src/domain/result.ts
  errors_contract: src/domain/errors.ts
  credentials_contract: src/domain/credentials.ts
  redaction_layer: src/cli/output/redact.ts
  bun_serve_mock_precedent: tests/integration/credentials.test.ts
  house_style_precedent: ../2026-07-09--GH-20--markdown-pipeline/chg-GH-20-test-plan.md
---

# Test Plan - [MS2-E3-S4] Confluence adapter — TargetSystem port implementation

## 1. Scope and Objectives

This plan verifies the **transport half** of the safe-publish pipeline delivered by
GH-21: the domain-owned `TargetSystem` port interface
(`src/domain/target/port.ts`), the `ConfluenceClient` HTTP transport
(`src/infra/confluence/client.ts`), the v2 `PageService` + the brand-defining
409-conflict parse (`pages.ts`), the v2 `PropertyService` (`properties.ts`), the
v1-only `AttachmentService` with the 400-duplicate idempotency signal
(`attachments.ts`), the minimal v1 `SearchService` + `RestrictionsService`
(`search.ts` / `restrictions.ts`), the `version.message` provenance formatter
(`provenance.ts`), the assembled `ConfluenceTarget` adapter (`target.ts`), the
zod boundary schemas (`schemas/*.ts`), and the two additive `MarkSyncError` arms
(`RateLimited` + `RemoteUnreachable` in `src/domain/errors.ts` + the three
handler sites per PD-3). The plan/apply orchestration (E3-S6), drift
classification (E3-S5), concurrency (E3-S7), live-tenant E2E (E5-S1), reverse
conversion (MS-0005+), Data Center (MS-0009), OAuth, and labels add/delete are
**out of scope**.

The brand-defining risks this plan guards against are: (a) **the 409 is misparsed
— wrong version numbers, or missed entirely — and a stale write silently
overwrites a remote edit** (RSK-1, ADR-0006 C-5/C-6, NFR-REL-1/REL-5/REL-10);
(b) **a 403 is misclassified as "missing" and the page is silently recreated**
(RSK-2, INV-SAFE-1, R-FEA-10); (c) **the `authHeader` / token leaks into a log,
plan, or diagnostic** (RSK-3, NFR-SEC-1/INV-SEC-1); (d) **outbound telemetry —
a request targets a host other than the configured `baseUrl`** (RSK-4,
NFR-SEC-3); (e) **a boundary violation sneaks in — domain or cli imports the
Confluence adapter** (RSK-5, NFR-MAINT-1); (f) **adding the two error arms
silently breaks exhaustiveness** (RSK-6); and (g) **a Confluence API shape drift
is silently misparsed instead of surfaced as a typed failure** (RSK-7, mitigated
by zod boundary validation per DEC-7 / PD-5).

Per `.ai/rules/testing-strategy.md` (§"Test tiers", §"What MUST be tested
release-blocking", §"AI-agent over-mocking guardrail") and the story's Test
matrix, this story is exercised at **Unit** and **Integration** tiers. The
release-blocking lifecycle invariants INV-SAFE-1/2/3 are owned by E3-S6/E5-S1;
GH-21 contributes the transport layer + the **409 drift gate** and the
**no-token-leak (INV-SEC-1)** and **no-outbound-telemetry (NFR-SEC-3)** safety
properties, proven through the integration tier (not mocks alone). There is
**no Golden-fixture** (no renderer output — that was GH-20), **no Mermaid-DOM**
(no mermaid render — E4-S1), **no BDD** (invariants owned by E5-S1), and **no
E2E** (no live Confluence network — the live-tenant smoke is E5-S1, NG-8).

### 1.1 In Scope

- **`TargetSystem` port interface + adapter-agnostic value types** (F-1) — the
  domain-owned contract every adapter implements; **no** Confluence type in its
  surface; every op returns `Result<T, MarkSyncError>`; `renderBody` delegates
  to the GH-20 `renderStorage` (DEC-5 / PD-1). The `ConfluenceTarget` class
  `implements TargetSystem`, composing the client + all services.
- **`ConfluenceClient` transport** (F-2) — native `fetch` (no HTTP library);
  `v1`/`v2` URL builders rooted at `baseUrl`; `authHeader` + `User-Agent`
  injection; redacted logging; **429** exponential backoff (1s/2s/4s + jitter,
  `Retry-After` honored, max 3 → `RateLimited`); **5xx** retry (max 3 →
  `RemoteUnreachable`); **401/403 never retried**.
- **`PageService` (v2) + the 409-conflict parse** (F-3) — create/read/update/move
  via v2; `errors[0].code==="CONFLICT"` + the version-laden title → typed
  `Conflict{ baseVersion; remoteVersion }` (correctly parsed, never swapped).
- **403 → `Forbidden` warn+skip** (F-7) — never delete+recreate (INV-SAFE-1).
- **`PropertyService` (v2)** (F-4) — `marksync.metadata` string cross-check;
  `putProperty` → `getProperty` byte-equal; ~8 KB round-trips (spike H2).
- **`AttachmentService` (v1-only)** (F-5) — multipart upload; the 400-duplicate
  idempotency signal (DEC-3 — "already exists", **not** an error); `/data`
  update on changed bytes; `attachmentExists` / `listAttachments`.
- **`SearchService` + `RestrictionsService` (v1, minimal)** (F-6) + the
  **`version.message` provenance formatter** (F-8, ADR-0010 / PD-6).
- **`RateLimited` + `RemoteUnreachable` error arms** (F-9) — the two additive
  `MarkSyncError` kinds + the three handler sites (PD-3); `RateLimited` shape
  `{ retryAfterMs?: number }` (OQ-2); `RemoteUnreachable` shape `{ status?;
  cause: string }` (OQ-1).
- **zod boundary validation** (F-9 / DEC-7 / PD-5) — every Confluence response
  validated before crossing into a typed return; a schema-validation failure →
  `RemoteUnreachable` (never a silent misparse).
- **Critical-safety paths (integration-tier):** 409 parse correctness; 403
  warn+skip (0 delete/recreate); no-token-leak (grep captured artifacts); no-
  outbound-telemetry (every request host === `baseUrl`); boundary negative test
  (dep-cruiser fires on a scratch-file breach).
- **Quality gate + tier purity** (AC-Q-1) — `bun run check` exits 0;
  `check:boundaries` green; dep-cruiser confirms no `src/domain/**` or
  `src/cli/**` imports `#infra/confluence/*`.

### 1.2 Out of Scope & Known Gaps

- **Plan/apply orchestration** (E3-S6), **drift classification** (E3-S5),
  **concurrency** (E3-S7) — the adapter exposes port operations and produces
  `Conflict`/`Forbidden`/`RateLimited`/"already-exists"; it does not call them
  in a plan or reclassify drift (spec NG-1/NG-2).
- **Live-tenant E2E** — wired by E5-S1 (NG-8). This story's tests are unit +
  integration against a local `Bun.serve` mock.
- **The `sha256:`-prefixed `marksync.metadata` payload format** — the adapter
  stores/returns the cross-check string byte-for-byte; serialization of the lock
  fields into that string is E3-S6's concern (spec F-4).
- **`labels.ts` add/delete** — deferred to post-MS-0002 (DEC-8 / NG-3); no
  MS-0002 flow uses labels.
- **Reverse conversion (Storage/ADF → Markdown)** — MS-0005+ (NG-4).
- **`version.message` exact length limit** — ADR-0010 §"Open questions" lists it
  as TO CONFIRM; the formatter trims deterministically to a named
  `MAX_VERSION_MESSAGE_LEN` constant (PD-6), confirmed empirically in E5-S1.
- **BDD (Gherkin) lifecycle-invariant scenarios** — INV-SAFE-1/2/3 are owned by
  E5-S1; GH-21 contributes the transport + the 409 gate those invariants reason
  over.
- **NFR-PERF-* conversion/binary-size** — deferred to MS-0003+ (no hard perf
  assertion in this plan; the repo-local benchmark gate is deferred to MS-0002
  end).

## 2. References

| Artifact | Path |
|----------|------|
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S4--confluence-adapter.md` |
| Change specification | [`./chg-GH-21-spec.md`](./chg-GH-21-spec.md) (contract authority — `F-1..9`, `AC-F1-1..AC-Q-1`, `DM-1..5`, `DEC-1..8`, `NFR-1..14`, `RSK-1..8`, `OQ-1/OQ-2` resolved) |
| Implementation plan | [`./chg-GH-21-plan.md`](./chg-GH-21-plan.md) (phases 0–8; PD-1..PD-8; draft Test Scenarios table — reconciled here) |
| PM notes | `./chg-GH-21-pm-notes.yaml` |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) (tiers, over-mocking guardrail, Bun.serve allowance) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) (tier matrix, error handling, zod-first, import aliases) |
| ADR-0005 (Storage target) | `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md` |
| ADR-0006 (state model — 409 gate / property cross-check / 403 warn+skip / INV-SAFE-1) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` |
| ADR-0010 (provenance `version.message`) | `doc/decisions/ADR-0010-page-history-provenance-and-sync-granularity.md` |
| Spike findings (H1–H5 — endpoint shapes, 409 body, 400-dup, ~8.4 KB property, auth path) | `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` |
| Feature spec | [`doc/spec/features/feature-confluence-adapter.md`](../../../spec/features/feature-confluence-adapter.md) |
| Non-functional spec | [`doc/spec/nonfunctional.md`](../../../spec/nonfunctional.md) (NFR-MAINT-1, NFR-SEC-1, NFR-SEC-3, NFR-REL-1, NFR-PERF-4) |
| Reused `Result<T,E>` | `src/domain/result.ts` (`Result.ok` / `Result.err`) |
| Reused error arms + `assertNeverMarkSyncError` | `src/domain/errors.ts` (`Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing` reused; `RateLimited` + `RemoteUnreachable` added) |
| Reused `ConfluenceCredentials` (GH-17) | `src/domain/credentials.ts` (opaque `authHeader`, masked `email`) |
| Reused `renderStorage` (GH-20) | `src/infra/confluence/render/storage.ts` (the `renderBody` delegate) |
| Reused redaction layer (GH-16) | `src/cli/output/redact.ts` (`redactString`) |
| Bun.serve mock precedent (GH-17) | `tests/integration/credentials.test.ts` (`serveMock` / `credsFor` / `jsonResponse` / `Retry-After: 0` pattern) |
| Prior test plan (house style) | [`../2026-07-09--GH-20--markdown-pipeline/chg-GH-20-test-plan.md`](../2026-07-09--GH-20--markdown-pipeline/chg-GH-20-test-plan.md) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

> Acceptance criteria are the spec's canonical IDs from `chg-GH-21-spec.md` §17
> (reproduced from the story's acceptance criteria — the Definition of Done).
> Every `AC-*` MUST appear.

| Spec AC | Description | F-# / NFR-# / DM-# | TC ID(s) | Status |
|---------|-------------|--------------------|----------|--------|
| AC-F1-1 | Boundary: dep-cruiser (`check:boundaries`) **fails** on a scratch file under `src/domain/` (or `src/cli/`) importing `#infra/confluence/*`; and **0** production files under `src/domain/` or `src/cli/` import from `src/infra/confluence/` — the port is the only seam. | F-1, NFR-1, DM-1 | TC-BND-001, TC-BND-002, TC-URL-001 | Covered |
| AC-F3-1 | A mocked 409 with `errors[0].code:"CONFLICT"` + a version-laden title → `updatePage` returns `err(Conflict{ pageId; baseVersion; remoteVersion })` with the version numbers **correctly parsed** from the title. | F-3, NFR-2, DM-4 | TC-CONFLICT-001, TC-CONFLICT-002, TC-CONFLICT-003 | Covered |
| AC-F7-1 | A mocked 403 on `getPage` → `Forbidden`; and the path performs **0** delete/recreate operations (warn+skip — INV-SAFE-1). | F-7, NFR-3 | TC-FORBIDDEN-001, TC-FORBIDDEN-002 | Covered |
| AC-F5-1 | A duplicate-filename upload → the create endpoint's 400 `"Cannot add a new attachment with the same file name"` → an **"already exists"** result (not an error); and changed bytes → update-via-`/data` bumps the attachment version. | F-5, NFR-4 | TC-ATTACH-001, TC-ATTACH-002, TC-ATTACH-005 | Covered |
| AC-F4-1 | `putProperty` stores a string value and `getProperty` reads it back **byte-equal**; an **~8 KB** value round-trips. | F-4, NFR-5, DM-5 | TC-PROP-001, TC-PROP-002, TC-PROP-005 | Covered |
| AC-F2-1 | A mocked 429 + `Retry-After: 1` → the client waits then retries (**max 3**); on exhaustion it returns `err({ kind:"RateLimited" })` (the new arm). | F-2, F-9, NFR-6, DM-3 | TC-RATE-001, TC-RATE-002 | Covered |
| AC-F2-2 | Captured redacted request/response logs from the mock test run, grepped for the token → **0** artifacts contain the token. | F-2, NFR-7, INV-SEC-1 | TC-NOLEAK-001, TC-AUTH-001 | Covered |
| AC-F2-3 | The adapter's `fetch` calls target **only** the configured `baseUrl` — **0** requests target any other host (NFR-SEC-3). | F-2, NFR-8 | TC-TELEMETRY-001, TC-URL-001 | Covered |
| AC-Q-1 | `bun run check` (lint + format:check + typecheck + test + check:boundaries) exits **0** — including the typecheck that proves the two new arms keep `assertNeverMarkSyncError` exhaustive. | F-9, NFR-1, NFR-10, NFR-13, NFR-14 | TC-GATE-001, TC-ERR-001..003, TC-DEP-001 | Covered |

**Capability (F-#) rollup:**

| F-# | Capability | TC ID(s) |
|-----|------------|----------|
| F-1 | `TargetSystem` port interface (domain-owned) + value types + `ConfluenceTarget` implementor | TC-PORT-001..003, TC-BND-001..002 |
| F-2 | `ConfluenceClient` HTTP transport (URLs, auth, redaction, retry) | TC-URL-001, TC-AUTH-001, TC-NOLEAK-001, TC-RATE-001..002, TC-UNREACH-001..003, TC-NORETRY-001, TC-TELEMETRY-001 |
| F-3 | `PageService` (v2) + the 409-conflict parse | TC-PAGE-001..003, TC-CONFLICT-001..003, TC-SCHEMA-001..002 |
| F-4 | `PropertyService` (v2) — `marksync.metadata` string cross-check | TC-PROP-001..005 |
| F-5 | `AttachmentService` (v1-only) — 400-dup idempotency, `/data` update | TC-ATTACH-001..005 |
| F-6 | `SearchService` + `RestrictionsService` (v1, minimal) | TC-SEARCH-001, TC-RESTR-001 |
| F-7 | 403 → `Forbidden` warn+skip | TC-FORBIDDEN-001..002, TC-RESTR-001 |
| F-8 | `version.message` provenance formatter | TC-PROV-001..002 |
| F-9 | `RateLimited` + `RemoteUnreachable` arms + zod boundary validation | TC-ERR-001..003, TC-RATE-002, TC-UNREACH-002..003, TC-SCHEMA-001..002, TC-GATE-001 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

The adapter is a **client** of the Atlassian Confluence Cloud REST API (spec §8.1
— it consumes, does not define, these endpoints). No events (spec §8.2 — the
conceptual signals are `Result<T, MarkSyncError>` values). The interface
coverage therefore maps the consumed endpoints + the data-model elements to the
TCs that exercise them, and asserts the v2/v1 split is respected (NFR-MAINT-1).

**Consumed Confluence endpoints (spike-validated):**

| Endpoint (surface) | v1/v2 | TC ID(s) |
|--------------------|-------|----------|
| `POST /wiki/api/v2/pages` (create) | v2 | TC-PAGE-001, TC-PORT-003 |
| `GET /wiki/api/v2/pages/{id}?body-format=storage` (read) | v2 | TC-PAGE-001, TC-FORBIDDEN-001..002, TC-PAGE-002 |
| `PUT /wiki/api/v2/pages/{id}` (update) | v2 | TC-PAGE-003, TC-CONFLICT-001..003 |
| Page move (parent change) | v2 | TC-PORT-003 (wiring) |
| `GET /wiki/api/v2/pages/{id}/property/{key}` + `GET …/properties` | v2 | TC-PROP-001..004 |
| `POST /wiki/api/v2/pages/{id}/properties` (create) | v2 | TC-PROP-001..002, TC-PROP-005 |
| `POST /wiki/rest/api/content/{id}/child/attachment` (multipart) | **v1-only** | TC-ATTACH-001, TC-ATTACH-003..005 |
| `POST /wiki/rest/api/content/{id}/child/attachment/{attId}/data` (update) | **v1-only** | TC-ATTACH-002, TC-ATTACH-005 |
| `GET /wiki/rest/api/content/{id}/child/attachment` (list) | **v1-only** | TC-ATTACH-003, TC-ATTACH-004 |
| CQL search | **v1-only** | TC-SEARCH-001 |
| `GET …/content/{id}/restriction` | **v1-only** | TC-RESTR-001 |

> **v1/v2-split assertion:** the URL-builder test (TC-URL-001) pins the exact
> `${baseUrl}/wiki/rest/api…` (v1) vs `${baseUrl}/wiki/api/v2…` (v2) prefixes;
> the integration suite routes each service to the correct prefix. Attachments /
> search / restrictions are v1-only; pages / properties are v2-only (NFR-MAINT-1).

**Data-model coverage (spec §8.3):**

| DM-# | Element | TC ID(s) |
|------|---------|----------|
| DM-1 | `TargetSystem` port interface (NEW, domain — no Confluence types) | TC-PORT-001, TC-PORT-003, TC-BND-001..002 |
| DM-2 | Port value types (page, create/update/move requests, attachment ref, artifact) | TC-PORT-001, TC-PAGE-001, TC-ATTACH-001 |
| DM-3 | `RateLimited` + `RemoteUnreachable` error arms (NEW — the only error-model changes) | TC-ERR-001..003, TC-RATE-002, TC-UNREACH-002..003, TC-SCHEMA-001..002 |
| DM-4 | Confluence 409 conflict envelope (adapter-internal — `{ errors:[{ code:"CONFLICT"; title }] }`) | TC-CONFLICT-001..003, TC-SCHEMA-002 |
| DM-5 | `marksync.metadata` content property value (string; ~8 KB; spike H2) | TC-PROP-001..005 |

**Public interface contracts consumed downstream** (verified as side-effects —
the consumers are blocked on this story):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `TargetSystem` port + value types | drift (E3-S5), sync engine (E3-S6), attachments (E4-S1/E4-S2) | TC-PORT-001..003 |
| `Conflict{ baseVersion; remoteVersion }` (409 → drift) | sync engine (E3-S6), concurrency (E3-S7) | TC-CONFLICT-001..003 |
| `Forbidden` (warn+skip) | sync engine (E3-S6) | TC-FORBIDDEN-001..002 |
| `RateLimited` (exhausted-429) | sync engine (E3-S6) | TC-RATE-002, TC-ERR-001 |
| `RemoteUnreachable` (exhausted-5xx/network/schema-drift) | sync engine (E3-S6) | TC-UNREACH-002..003, TC-SCHEMA-001..002, TC-ERR-002 |
| "attachment already exists" (400-dup idempotency) | attachments (E4-S1/E4-S2) | TC-ATTACH-001 |
| `formatVersionMessage` (provenance) | sync engine (E3-S6), attachments (E4-S3) | TC-PROV-001..002 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# / INV-# | Requirement | Threshold | TC ID(s) | Status |
|---------------|-------------|-----------|----------|--------|
| NFR-1 / NFR-MAINT-1 | Boundary isolation | 0 files under `src/domain/` or `src/cli/` import `#infra/confluence/*`; dep-cruiser fails on a breach | TC-BND-001..002, TC-URL-001 | Covered |
| NFR-2 | 409 parse correctness | correctly parsed version numbers — 100% of 409 fixtures | TC-CONFLICT-001..003 | Covered |
| NFR-3 / NFR-REL-1 / INV-SAFE-1 | 403 warn+skip | `Forbidden`; 0 delete/recreate operations | TC-FORBIDDEN-001..002 | Covered |
| NFR-4 / NFR-PERF-4 | Attachment 400-dup idempotency | duplicate filename → "already exists" (not an error); idempotent rerun = 0 writes; `/data` update bumps version | TC-ATTACH-001..005 | Covered |
| NFR-5 | Property round-trip (H2) | `putProperty` → `getProperty` byte-equal; ~8 KB round-trips | TC-PROP-001..005 | Covered |
| NFR-6 | 429 backoff | mocked 429 + `Retry-After` → wait then retry (max 3); exhausted → `RateLimited` | TC-RATE-001..002 | Covered |
| NFR-7 / NFR-SEC-1 / INV-SEC-1 | No token leak | 0 captured redacted log/request/response artifacts contain the token | TC-NOLEAK-001, TC-AUTH-001 | Covered |
| NFR-8 / NFR-SEC-3 | No outbound telemetry | every `fetch` targets the configured `baseUrl`; 0 requests to any other host | TC-TELEMETRY-001, TC-URL-001 | Covered |
| NFR-9 | 5xx retry | mocked transient 5xx retried (max 3); exhausted/network → typed failure | TC-UNREACH-001..003 | Covered |
| NFR-10 | Response validation | 100% of Confluence responses zod-validated before a typed return | TC-SCHEMA-001..002 (+ every read path) | Covered |
| NFR-11 | Native fetch only | no HTTP/crypto library; `zod` added (PD-2); `fetch`/`URL`/`FormData`/`Blob`/`crypto` built-ins only | TC-DEP-001 | Covered |
| NFR-12 | Retry-policy correctness | 401/403 never retried; 429 honors `Retry-After`; backoff = 1s/2s/4s + jitter | TC-NORETRY-001, TC-RATE-001 | Covered |
| NFR-13 | Error-model safety | adding both arms keeps `assertNeverMarkSyncError` exhaustive; typecheck green | TC-ERR-001..003, TC-GATE-001 | Covered |
| NFR-14 | Quality gate | `bun run check` exits 0 | TC-GATE-001 | Covered |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md` (§"Test tiers", §"What MUST be tested",
§"AI-agent over-mocking guardrail") and the story's Test matrix, this story is
exercised at **Unit** and **Integration** tiers. No Golden-fixture (no renderer
output — GH-20), no Mermaid-DOM (E4-S1), no BDD (invariants owned by E5-S1),
no E2E (live-tenant smoke is E5-S1 — NG-8).

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes — error-arm round-trips, URL builders, retry/backoff (fake timers), 409 parse, 403/404 mapping, schema-drift mapping, property round-trip, attachment 400-dup + `/data` update, search/restrictions, provenance formatter, port interface + `ConfluenceTarget` wiring, boundary negative test | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| **Integration** | Yes (primary for the safety properties) — full `ConfluenceTarget` against a `Bun.serve` mock simulating v2/v1 and 200/409/403/400/429/5xx; property round-trip; attachment upload/update/dup; **no-token-leak** (grep captured artifacts); **no-outbound-telemetry** (every request host === `baseUrl`); **0 delete/recreate on 403** | `bun:test` + `Bun.serve()` | `tests/integration/` | `*.test.ts` |
| Golden-fixture | No | — | — | renderer output was GH-20 |
| Mermaid-DOM | No | — | — | mermaid render is E4-S1 |
| BDD (Gherkin) | No | — | — | lifecycle invariants owned by E5-S1 |
| E2E (live-sandbox) | No | — | — | wired by E5-S1 (NG-8) |
| Type-level (compile safety) | Yes — `RateLimited` + `RemoteUnreachable` added; `assertNeverMarkSyncError` stays exhaustive | `bun run typecheck` | — | `tsc --noEmit` gate (TC-GATE-001) |

**Test-file layout (mirrors `src/` per testing-strategy.md §"File naming"):**

```
src/domain/errors.ts (+ cli-error-map.ts + exit-codes.ts) → tests/unit/domain/errors/error-arms.test.ts        (Unit — TC-ERR-*)
src/domain/target/port.ts                                 → tests/unit/domain/target/port.test.ts             (Unit/contract — TC-PORT-*)
                                                           tests/unit/domain/target/boundary-negative.test.ts  (Unit/contract — TC-BND-001; ephemeral src/domain/ probe, deleted in afterEach)
src/infra/confluence/client.ts                            → tests/unit/infra/confluence/client.test.ts         (Unit — TC-URL/AUTH/RATE/UNREACH/NORETRY-*)
src/infra/confluence/pages.ts                             → tests/unit/infra/confluence/pages.test.ts          (Unit — TC-CONFLICT/PAGE/SCHEMA/FORBIDDEN-*)
src/infra/confluence/properties.ts                        → tests/unit/infra/confluence/properties.test.ts     (Unit — TC-PROP-*)
src/infra/confluence/attachments.ts                       → tests/unit/infra/confluence/attachments.test.ts    (Unit — TC-ATTACH-*)
src/infra/confluence/search.ts / restrictions.ts          → tests/unit/infra/confluence/search.test.ts         (Unit — TC-SEARCH-001)
                                                           tests/unit/infra/confluence/restrictions.test.ts    (Unit — TC-RESTR-001)
src/infra/confluence/provenance.ts                        → tests/unit/infra/confluence/provenance.test.ts     (Unit — TC-PROV-*)
src/infra/confluence/target.ts                            → tests/unit/infra/confluence/target.test.ts         (Unit — TC-PORT-003)
                                                           tests/integration/confluence/confluence-target.test.ts (Integration — TC-CONFLICT-003 / TC-FORBIDDEN-002 / TC-PAGE-003 / TC-PROP-005 / TC-ATTACH-005 / TC-NOLEAK-001 / TC-TELEMETRY-001)
repo root (gate)                                          → bun run check / check:boundaries / package.json    (Gate — TC-GATE-001 / TC-BND-002 / TC-DEP-001)
```

> `bunfig.toml` sets `[test] root = "tests"` and the mermaid preload
> (`./tests/mermaid.preload.ts`); the preload is **harmless for non-mermaid
> tests** (GH-20 confirmed) and requires no per-file opt-out.

> Tests use the `#domain/*` / `#infra/*` import aliases (package.json
> `"imports"`), NOT deep relative paths (typescript.md §"Tests use import
> aliases"). The client/service constructors accept an **injected `fetch` seam**
> (default `globalThis.fetch` — the GH-17 `AuthProviderOptions.fetch` precedent)
> so unit tests stub `fetch` and integration tests point the client at a
> `Bun.serve` origin.

**Over-mocking guardrail compliance (TDR-0004 §"Test-design guardrail").** Because
MarkSync is AI-agent-operable, this is a hard guardrail. The adapter's
correctness is proven through the **real** `ConfluenceTarget` over a **real**
`Bun.serve` mock at the integration tier (the testing-strategy explicitly allows
"Bun.serve HTTP mock for the Confluence adapter" and "fault injection"). The
critical-safety properties (409 parse, 403 warn+skip, no-token-leak,
no-outbound-telemetry) are asserted **over captured real HTTP traffic**, never
through a "fetch was called" mock alone:

- The **409 parse** is exercised at unit (TC-CONFLICT-001/002) **and** through
  the real adapter over the mock (TC-CONFLICT-003) — same regex, real round-trip.
- The **no-token-leak** assertion (TC-NOLEAK-001) greps the **actual captured
  request + response bytes** the mock recorded — it does not mock the redactor.
- The **no-outbound-telemetry** assertion (TC-TELEMETRY-001) checks the **host
  of every captured request URL** — it does not mock `URL`.
- The **boundary negative test** (TC-BND-001) runs the **production**
  dependency-cruiser rule over a real `src/domain/ → src/infra/confluence/`
  breach — an ephemeral probe created under `src/domain/` at runtime (then
  deleted in `afterEach`). It does not assert "the rule exists", nor does it
  test a proxy/adapted ruleset.

## 5. Test Scenarios

### 5.1 Scenario Index

> TC IDs follow `TC-<FEATURE>-<NNN>` with alphabetic feature slugs. They
> **reconcile** the plan's draft Test Scenarios table (which used numeric slugs
> like `TC-429-001`); the mapping is noted in §7. A concern that is tested at
> both tiers gets distinct numbers within one family (e.g. TC-CONFLICT-001 unit
> vs TC-CONFLICT-003 integration).

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-PORT-001 | `TargetSystem` port declares the full op set; every op returns `Result<T, MarkSyncError>`; no Confluence type in surface | Happy Path | Critical | High | F-1, AC-F1-1 |
| TC-PORT-002 | `renderBody(hast, opts)` delegates to the GH-20 `renderStorage` (DEC-5 / PD-1) | Happy Path | Critical | High | F-1, DEC-5 |
| TC-PORT-003 | `ConfluenceTarget implements TargetSystem`; composes client + all services (TS structural check) | Happy Path | Critical | High | F-1, PD-7 |
| TC-BND-001 | Negative: dep-cruiser fires `domain-may-not-import-infra` on an ephemeral `src/domain/` probe (AC-F1-1) | Negative | Critical | High | AC-F1-1, NFR-1, RSK-5 |
| TC-BND-002 | Positive: `check:boundaries` green on `src/` — 0 `domain`/`cli` → `infra/confluence` imports | Regression | Critical | High | AC-F1-1, NFR-1 |
| TC-ERR-001 | `RateLimited` round-trips `mapMarkSyncErrorToCommandError` → `RATE_LIMITED` retryable; `assertNeverMarkSyncError` throws | Happy Path | Critical | High | AC-Q-1, NFR-13, DM-3, OQ-2 |
| TC-ERR-002 | `RemoteUnreachable` round-trips → `REMOTE_UNREACHABLE` retryable; `assertNeverMarkSyncError` throws | Happy Path | Critical | High | AC-Q-1, NFR-13, DM-3, OQ-1 |
| TC-ERR-003 | DEC-9: mapped messages contain **no** interpolated `cause` / `retryAfterMs` (structural identifiers only) | Corner Case | Important | High | F-9, DEC-9, NFR-SEC-1 |
| TC-URL-001 | `v1(path)` / `v2(path)` build the exact `${baseUrl}/wiki/rest/api…` / `${baseUrl}/wiki/api/v2…` URLs rooted at `baseUrl` | Happy Path | Critical | High | AC-F1-1, AC-F2-3, NFR-1 |
| TC-AUTH-001 | Every request carries `Authorization: <authHeader>` + `User-Agent: marksync/<ver>` (unit, stub fetch) | Happy Path | Critical | High | AC-F2-2, NFR-7 |
| TC-NOLEAK-001 | Grep captured request + response artifacts (real HTTP) for the token → **0** occurrences | Negative | Critical | High | AC-F2-2, NFR-7, INV-SEC-1, RSK-3 |
| TC-RATE-001 | Mocked 429 + `Retry-After` → bounded backoff, **max 3** attempts, `Retry-After` honored; eventual 200 → ok | Happy Path | Critical | High | AC-F2-1, NFR-6, NFR-12 |
| TC-RATE-002 | Sustained 429 → exhaustion → `err({ kind:"RateLimited"; retryAfterMs? })` (OQ-2 shape) | Negative | Critical | High | AC-F2-1, NFR-6, DM-3, OQ-2 |
| TC-UNREACH-001 | Mocked transient 5xx → retried (**max 3**); eventual 200 → ok | Happy Path | Important | High | NFR-9, OQ-1 |
| TC-UNREACH-002 | Sustained 5xx → exhaustion → `err({ kind:"RemoteUnreachable"; status?; cause })` (OQ-1) | Negative | Critical | High | NFR-9, DM-3, OQ-1 |
| TC-UNREACH-003 | Thrown `fetch` (network failure) → `err({ kind:"RemoteUnreachable"; cause })`, no retry | Negative | Critical | High | NFR-9, OQ-1 |
| TC-NORETRY-001 | Mocked 401/403 → **0** retries (surfaced immediately) — spike rule | Corner Case | Critical | High | NFR-12, RSK-1 |
| TC-TELEMETRY-001 | Every captured request URL host === `baseUrl` host; **0** requests to any other host (real HTTP) | Negative | Critical | High | AC-F2-3, NFR-8, NFR-SEC-3, RSK-4 |
| TC-CONFLICT-001 | Mocked 409 `CONFLICT` + title `…Current Version: [7]. Provided version: [5]` → `err(Conflict{ baseVersion:5; remoteVersion:7 })` (not swapped) | Negative | Critical | High | AC-F3-1, NFR-2, RSK-1 |
| TC-CONFLICT-002 | Multiple 409 fixtures (multi-digit versions, varied pairs) → 100% correct extraction (property) | Negative | Critical | High | AC-F3-1, NFR-2 |
| TC-CONFLICT-003 | Integration: full adapter vs `Bun.serve` stale update → `err(Conflict)` with correct numbers | Negative | Critical | High | AC-F3-1, NFR-2 |
| TC-FORBIDDEN-001 | Mocked 403 on `getPage` → `err({ kind:"Forbidden"; pageId; operation:"getPage" })` | Negative | Critical | High | AC-F7-1, NFR-3 |
| TC-FORBIDDEN-002 | Integration: assert **0** delete/recreate operations issued on a 403 (warn+skip — INV-SAFE-1) | Negative | Critical | High | AC-F7-1, NFR-3, INV-SAFE-1, RSK-2 |
| TC-SCHEMA-001 | Malformed 200 page body (fails zod) → `RemoteUnreachable` (no silent misparse) — PD-5 | Negative | Critical | High | F-9, NFR-10, RSK-7, DM-3 |
| TC-SCHEMA-002 | Malformed 409 envelope (fails zod) → `RemoteUnreachable` (not a misparsed Conflict) — PD-5 | Negative | Critical | High | F-9, NFR-10, RSK-1, RSK-7 |
| TC-PAGE-001 | Mocked 200 v2 page response → zod-validated + mapped to the port `Page` | Happy Path | Important | Medium | F-3 |
| TC-PAGE-002 | 404 on `getPage` → `err({ kind:"RemoteMissing"; pageId })` | Negative | Important | Medium | F-3 |
| TC-PAGE-003 | Integration: `updatePage` with `version.number = N+1` → 200 → `ok(Page)` | Happy Path | Important | Medium | F-3, AC-F3-1 (input) |
| TC-PROP-001 | `put` a string value; `get` reads it back **byte-equal** | Happy Path | Critical | High | AC-F4-1, NFR-5 |
| TC-PROP-002 | An **~8 KB** value round-trips (spike H2 ~8.4 KB) | Corner Case | Critical | High | AC-F4-1, NFR-5 |
| TC-PROP-003 | A missing key → `ok(undefined)` (not an error) | Corner Case | Important | Medium | F-4 |
| TC-PROP-004 | A 409 key-conflict (v1+v2 share one namespace) → handled (not a crash) | Corner Case | Important | Medium | F-4 |
| TC-PROP-005 | Integration: full adapter `putProperty` → `getProperty` byte-equal, incl. ~8 KB | Happy Path | Critical | High | AC-F4-1, NFR-5 |
| TC-ATTACH-001 | Duplicate filename → create 400 `"same file name"` → **"already exists"** result (not an error) | Negative | Critical | High | AC-F5-1, NFR-4, DEC-3 |
| TC-ATTACH-002 | Changed bytes → `/child/attachment/{attId}/data` update bumps the attachment version | Happy Path | Critical | High | AC-F5-1 |
| TC-ATTACH-003 | `attachmentExists(pageId, hash)` resolves existence by the hash-derived filename; 403 → `Forbidden` | Corner Case | Important | Medium | F-5, F-7 |
| TC-ATTACH-004 | `listAttachments(pageId)` enumerates the hash-named attachments | Happy Path | Important | Medium | F-5 |
| TC-ATTACH-005 | Integration: upload → duplicate 400 → already-exists; changed bytes → `/data` version bump | Happy Path | Critical | High | AC-F5-1, NFR-4 |
| TC-SEARCH-001 | Mocked CQL result → zod-validated + mapped to `PageRef[]` (v1) | Happy Path | Important | Medium | F-6 |
| TC-RESTR-001 | Mocked restrictions read → mapped; 403 → `Forbidden` (v1) | Happy Path | Important | Medium | F-6, F-7 |
| TC-PROV-001 | `formatVersionMessage` produces the MarkSync/Git prefix + head commit + compact summary; deterministic | Happy Path | Important | Medium | F-8 |
| TC-PROV-002 | Payload exceeding `MAX_VERSION_MESSAGE_LEN` is trimmed deterministically (not mid-token where avoidable) | Corner Case | Important | Medium | F-8, PD-6 |
| TC-GATE-001 | `bun run check` (lint + format:check + typecheck + test + check:boundaries) exits 0 | Regression | Critical | High | AC-Q-1, NFR-13, NFR-14 |
| TC-DEP-001 | `zod` present in dependencies; **no** HTTP/crypto library added (native built-ins only) | Regression | Important | Medium | NFR-11, PD-2 |

### 5.2 Scenario Details

#### TC-PORT-001 - `TargetSystem` port declares the full op set; no Confluence type in surface

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, DM-2, AC-F1-1, NFR-1, DEC-1
**Test Type(s)**: Unit (contract / type-level)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/target/port.test.ts`
**Tags**: @backend, @boundary

**Preconditions**:
- `src/domain/target/port.ts` exists (plan Phase 2).

**Steps**:
1. Import `TargetSystem` and the port value types (`Page`, `CreatePageRequest`,
   `UpdatePageRequest`, `MovePageRequest`, `AttachmentRef`, `Artifact`,
   `PageRestrictions`).
2. Assert the interface declares every operation from architecture-overview
   §"Internal interface contracts": `renderBody`, `getPage`, `createPage`,
   `updatePage`, `movePage`, `getProperty`, `putProperty`, `uploadAttachment`,
   `attachmentExists`, `listAttachments`, `searchPages`, `getRestrictions`.
3. Assert (type-level) every op's return type is `Result<T, MarkSyncError>`.
4. Grep the module source: assert **no** Confluence-specific identifier
   (`/wiki/`, `rest/api`, `api/v2`, `storage`, `CONFLICT`, `errors[0]`) appears
   in the port surface.

**Expected Outcome**:
- The port is the adapter-agnostic seam: the contract E3-S5/E3-S6/E4 call, and
  the seam a future non-Confluence adapter plugs into (NFR-MAINT-3). No
  Confluence type crosses it (DEC-1).

---

#### TC-PORT-002 - `renderBody(hast, opts)` delegates to the GH-20 `renderStorage`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-8 (GH-20), DEC-5, PD-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/target.test.ts`
**Tags**: @backend

**Steps**:
1. Build a tiny canonical HAST (`# H1` → a single `h1` element).
2. Call `target.renderBody(hast, opts)`.
3. Assert `result.ok === true`, `result.value.body` matches the GH-20
   `renderStorage` output for that HAST, and `result.value.hash` is present.

**Expected Outcome**:
- The app layer (E3-S6) calls `target.renderBody(…)` and never imports the
  Confluence renderer directly (story Background; DEC-5; PD-1 HAST input).

---

#### TC-PORT-003 - `ConfluenceTarget implements TargetSystem`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, PD-7, AC-Q-1
**Test Type(s)**: Unit (type-level structural check)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/target.test.ts`
**Tags**: @backend

**Steps**:
1. Construct a `ConfluenceTarget` from a `ConfluenceClient` + the services.
2. Assert (type-level) the instance satisfies `TargetSystem` — every port method
   is wired to its service (a smoke call per op routes to the expected client
   path).

**Expected Outcome**:
- The sole `TargetSystem` implementor composes the client + all services; the
  single seam downstream consumers call (PD-7).

---

#### TC-BND-001 - Negative: dep-cruiser fires `domain-may-not-import-infra` on an ephemeral `src/domain/` probe

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, AC-F1-1, NFR-1, RSK-5, PD-4
**Test Type(s)**: Unit (boundary / fault injection)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/target/boundary-negative.test.ts`
**Tags**: @backend, @boundary

**Preconditions**:
- `src/domain/` is clean (no `#infra/confluence/*` import) so the test starts
  from a green baseline. The **production** `domain-may-not-import-infra` rule
  in `.dependency-cruiser.cjs` filters `from: { path: "src/domain/" }`, so the
  probe MUST live under `src/domain/` for the production rule to match it — a
  `tests/`-located fixture would never fire it (`check:boundaries` runs
  `depcruise src`, which excludes `tests/`).

**Steps**:
1. **Create an ephemeral probe at runtime** — write a file under `src/domain/`
   (e.g. `src/domain/__boundary_probe__.ts`) that imports a `#infra/confluence/*`
   symbol (e.g. `import { ConfluenceClient } from "#infra/confluence/client"`).
   The probe is created by the test and never committed.
2. **Cruise `src/` with the production ruleset** — invoke dependency-cruiser
   (programmatic `cruise(...)` API loading the repo's `.dependency-cruiser.cjs`,
   or a `bunx depcruise src` subprocess — resolved at delivery, OQ-TP-1). The
   production rule now sees the probe (`from.path` under `src/domain/`).
3. **Assert** the cruise reports a `domain-may-not-import-infra` violation with
   the expected `from` (the `src/domain/` probe) and `to` (`src/infra/` — the
   `#infra/confluence/*` import, resolved by dep-cruiser's `imports`-field
   alias resolver).
4. **Delete the probe in `afterEach` / `finally` (cleanup is critical)** — a
   leaked probe under `src/domain/` would permanently break `depcruise src` /
   `check:boundaries` for every subsequent run. Cleanup runs regardless of
   pass/fail; assert the probe is absent post-cleanup (a `git status` /
   "no `__boundary_probe__` under `src/domain/`" guard is belt-and-suspenders).

**Expected Outcome**:
- The **production** dep-cruiser rule catches a
  `src/domain/ → src/infra/confluence/` breach — the port is the only permitted
  seam (AC-F1-1 negative side; RSK-5). The rule is **proven**, not added (it
  already exists at severity `error`). No proxy/adapted ruleset is used: the
  test exercises the real `domain-may-not-import-infra` rule.

**Notes / Clarifications**:
- Why a `src/domain/` probe and not a `tests/` fixture: the production rule's
  `from` filter is `src/domain/`, and `check:boundaries` runs `depcruise src`.
  A `tests/`-located fixture has `from.path = tests/…`, so the production rule
  never matches it — the only way to fire the production rule is a probe under
  `src/domain/`.
- The invocation mechanism (programmatic API vs subprocess) is a delivery
  detail (OQ-TP-1); both cruise `src/` with the production config. The
  programmatic `cruise(...)` API is preferred (in-process, no subprocess,
  deterministic config load). The assertion is on the production rule firing
  with the right `from`/`to`, not on the mechanism.
- **Cleanup invariant:** `src/` is byte-identical before and after the test
  (the probe is created at runtime and deleted in `afterEach`). A leaked probe
  is a release-blocking defect.

---

#### TC-BND-002 - Positive: `check:boundaries` green on `src/`

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1, NFR-1
**Test Type(s)**: Boundary gate
**Automation Level**: Automated
**Target Layer / Location**: repo root (`bun run check:boundaries`)
**Tags**: @backend, @boundary

**Steps**:
1. Run `bun run check:boundaries` (`depcruise src`).
2. Assert exit 0 — no `domain-may-not-import-infra` /
   `presentation-may-not-import-infra` violation; the one-way
   `infra/confluence/** → #domain/*` (+ the GH-20 renderer) edge is the only
   direction added.

**Expected Outcome**:
- 0 production files under `src/domain/` or `src/cli/` import
  `#infra/confluence/*` (AC-F1-1 positive side). Scope note (GH-20 Finding 6
  precedent): dep-cruiser enforces the load-bearing directions; the broader
  matrix has gaps (no `infra → app`/`infra → cli` rule) — hardening is a future
  item, out of scope here.

---

#### TC-ERR-001 - `RateLimited` round-trips to `RATE_LIMITED`; never-check throws

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-9, DM-3, AC-Q-1, NFR-13, OQ-2, PD-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/errors/error-arms.test.ts`
**Tags**: @backend

**Preconditions**:
- Phase 1 has added `RateLimited { retryAfterMs?: number }` (OQ-2) to
  `MarkSyncError` + `assertNeverMarkSyncError` + `mapMarkSyncErrorToCommandError`
  + `CODE_TO_EXIT` (PD-3 three-site update).

**Steps**:
1. Build `err = { kind: "RateLimited"; retryAfterMs: 1000 }`.
2. `mapMarkSyncErrorToCommandError(err)` → assert `code === "RATE_LIMITED"` and
   `retryable === true`.
3. `expect(() => assertNeverMarkSyncError(err)).toThrow()` (the runtime side of
   the never-check).

**Expected Outcome**:
- The story-mandated `RateLimited` arm is wired across all three handler sites;
  the exhaustive `never`-check stays sound (RSK-6). Field shape per OQ-2.

---

#### TC-ERR-002 - `RemoteUnreachable` round-trips to `REMOTE_UNREACHABLE`; never-check throws

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-9, DM-3, AC-Q-1, NFR-13, OQ-1, PD-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/errors/error-arms.test.ts`
**Tags**: @backend

**Preconditions**:
- Phase 1 has added `RemoteUnreachable { status?: number; cause: string }`
  (OQ-1).

**Steps**:
1. Build `err = { kind: "RemoteUnreachable"; status: 503; cause: "gateway timeout" }`.
2. `mapMarkSyncErrorToCommandError(err)` → assert `code === "REMOTE_UNREACHABLE"`
   and `retryable === true`.
3. `expect(() => assertNeverMarkSyncError(err)).toThrow()`.

**Expected Outcome**:
- The PM-decided `RemoteUnreachable` arm (OQ-1) is wired across all three sites;
  field shape `{ status?; cause }`. `cause` carries a non-secret transport
  description (DEC-9).

---

#### TC-ERR-003 - Mapped messages contain no interpolated `cause` / `retryAfterMs`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-9, DEC-9, NFR-SEC-1, RSK-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/errors/error-arms.test.ts`
**Tags**: @backend, @security

**Steps**:
1. Map `RemoteUnreachable { cause: "<secret-ish transport text>" }` and
   `RateLimited { retryAfterMs: 12345 }`.
2. Assert neither mapped `message` contains the `cause` substring nor the
   numeric `retryAfterMs` (messages use structural identifiers only — DEC-9;
   `cause` stays in the typed error for redacted logging only).

**Expected Outcome**:
- The CLI-facing message never surfaces raw transport text or retry values —
  the redaction contract holds at the mapping boundary (DEC-9 / NFR-SEC-1).

---

#### TC-URL-001 - `v1`/`v2` URL builders root at `baseUrl` (v1/v2 split isolated)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, DM-1, AC-F1-1, AC-F2-3, NFR-1, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Steps**:
1. Construct `ConfluenceClient` with `baseUrl = "https://example.atlassian.net"`.
2. Assert `client.v1("/x") === "https://example.atlassian.net/wiki/rest/api/x"`.
3. Assert `client.v2("/y") === "https://example.atlassian.net/wiki/api/v2/y"`.
4. Assert both URLs' host equals the configured `baseUrl` host (no other host).

**Expected Outcome**:
- The **only** place the v1/v2 distinction is encoded (NFR-MAINT-1); the
  builders root at `baseUrl`, which is also the foundation for the
  no-outbound-telemetry property (TC-TELEMETRY-001).

---

#### TC-AUTH-001 - Every request carries `Authorization` + `User-Agent`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-2, NFR-7, INV-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A stub `fetch` that records the incoming `Request` headers.

**Steps**:
1. Issue a request through the client (e.g. `client.request("GET", client.v2("/pages/123"))`).
2. Assert the recorded request carries `Authorization: <authHeader>` (the opaque
   `ConfluenceCredentials.authHeader`) and `User-Agent: marksync/<ver>`.

**Expected Outcome**:
- Auth injection + UA are centralized in the client; the adapter never sees the
  raw token (INV-SEC-1). The no-leak property over real traffic is TC-NOLEAK-001.

---

#### TC-NOLEAK-001 - Grep captured request + response artifacts for the token → 0 occurrences

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-2, NFR-7, INV-SEC-1, RSK-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- The `Bun.serve` mock records every incoming request's URL, method, headers,
  and body (see §6 mock setup). The credentials carry a known token string
  (`TOKEN`) used as the grep needle.

**Steps**:
1. Drive the adapter through several ops (update, property round-trip,
   attachment upload) against the recording mock.
2. Grep the captured request headers + bodies (and any redacted log lines the
   client emitted into a captured log sink) for `TOKEN`.
3. Assert **0** occurrences.

**Expected Outcome**:
- No token reaches any output path: the opaque-`authHeader` design + the GH-16
  redaction layer keep `Authorization`/`Basic`/token/email out of logs and
  payloads (AC-F2-2 / INV-SEC-1). Proven over **real** captured traffic, not a
  mock that asserts "redact was called" (over-mocking guardrail).

---

#### TC-RATE-001 - Mocked 429 + `Retry-After` → bounded backoff (max 3); eventual 200 → ok

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-9, AC-F2-1, NFR-6, NFR-12, PD-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- The retry loop uses a delay seam driven by `bun:test` fake timers
  (`mock.timer({ now })` + `.tick(ms)` / `.runAll()`) OR an injected no-op delay
  — **no real sleeps** (testing-strategy §"fault injection"; PD-8). Because
  jitter is intentionally non-deterministic, assertions are on the **bounded
  attempt count** and `Retry-After` ordering, not exact ms.

**Steps**:
1. Stub `fetch` to return `429` with `Retry-After: 1` once, then `200`.
2. Drive one request; advance fake time past the backoff ladder.
3. Assert `result.ok === true` and the stub was called exactly **twice** (1
   initial + 1 retry); the retry happened **after** honoring `Retry-After`.

**Expected Outcome**:
- 429 triggers bounded exponential backoff honoring `Retry-After`; a transient
  429 recovers (AC-F2-1 first clause; NFR-6; NFR-12).

---

#### TC-RATE-002 - Sustained 429 → exhaustion → `err(RateLimited)` (OQ-2 shape)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-9, DM-3, AC-F2-1, NFR-6, OQ-2, PD-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- Fake timers / injected delay (as TC-RATE-001).

**Steps**:
1. Stub `fetch` to always return `429` with `Retry-After: 1`.
2. Drive one request; advance fake time repeatedly.
3. Assert `result.ok === false`, `result.error.kind === "RateLimited"`, and the
   stub was called **≤ 4** times (1 initial + max 3 retries). If the last 429
   carried `Retry-After`, `error.retryAfterMs` may carry it (OQ-2).

**Expected Outcome**:
- Exhausted-429 produces the story-mandated `RateLimited` arm with the OQ-2
  field shape (AC-F2-1 second clause; DM-3).

---

#### TC-UNREACH-001 - Mocked transient 5xx → retried (max 3); eventual 200 → ok

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, NFR-9, PD-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- Fake timers / injected delay (as TC-RATE-001).

**Steps**:
1. Stub `fetch` to return `503` once, then `200`.
2. Drive one request; advance fake time.
3. Assert `result.ok === true` and the stub was called exactly twice.

**Expected Outcome**:
- A transient 5xx is retried and recovers (NFR-9).

---

#### TC-UNREACH-002 - Sustained 5xx → exhaustion → `err(RemoteUnreachable)` (OQ-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-9, DM-3, NFR-9, OQ-1, PD-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- Fake timers / injected delay.

**Steps**:
1. Stub `fetch` to always return `503`.
2. Drive one request; advance fake time repeatedly.
3. Assert `result.ok === false`, `result.error.kind === "RemoteUnreachable"`,
   `result.error.status === 503`, `result.error.cause` is a non-empty
   non-secret string, and the stub was called **≤ 4** times.

**Expected Outcome**:
- Exhausted-5xx produces the PM-decided `RemoteUnreachable` arm (OQ-1) — a
  distinct kind because the recovery action differs from `RateLimited`
  (server-down/alert-operator vs wait-and-retry).

---

#### TC-UNREACH-003 - Thrown `fetch` (network failure) → `err(RemoteUnreachable)`, no retry

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-9, DM-3, NFR-9, OQ-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Steps**:
1. Stub `fetch` to throw a `TypeError("fetch failed")` (network).
2. Drive one request.
3. Assert `result.ok === false`, `result.error.kind === "RemoteUnreachable"`,
   `result.error.status` is absent, `result.error.cause` is non-secret, and the
   stub was called **once** (network failure is not retried).

**Expected Outcome**:
- A network failure maps to `RemoteUnreachable` (OQ-1) without retry — distinct
  from a retryable HTTP 5xx.

---

#### TC-NORETRY-001 - Mocked 401/403 → 0 retries (surfaced immediately)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-7, NFR-12, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/client.test.ts`
**Tags**: @backend, @api

**Steps**:
1. For each of `401` and `403`: stub `fetch` to return that status.
2. Drive one request.
3. Assert the stub was called **exactly once** (0 retries) — the spike rule
   that a permission/auth signal is never masked as transient.

**Expected Outcome**:
- 401/403 are never retried (NFR-12) — the precondition for the 403→`Forbidden`
  warn+skip path (a permission gap cannot mask a conflict; RSK-1).

---

#### TC-TELEMETRY-001 - Every captured request host === `baseUrl` host; 0 to other hosts

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-3, NFR-8, NFR-SEC-3, RSK-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- The `Bun.serve` mock records every incoming request URL (§6). The adapter is
  configured with `baseUrl` pointing at the mock origin.

**Steps**:
1. Drive the adapter through every op family (page update, property, attachment,
   search, restrictions).
2. For each captured request URL, assert `new URL(url).host === baseUrl.host`.
3. Assert **0** captured requests target any other host.

**Expected Outcome**:
- The adapter issues `fetch` **only** to the configured `baseUrl` — no analytics,
  no remote rendering, no third-party calls (AC-F2-3 / NFR-SEC-3). Proven over
  **real** captured traffic (TC-URL-001 is the unit-level builder foundation).

---

#### TC-CONFLICT-001 - Mocked 409 CONFLICT → `err(Conflict)` with correctly parsed versions

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-4, AC-F3-1, NFR-2, RSK-1, DEC-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Preconditions**:
- A stub client returning `409` with body
  `{ errors:[{ code:"CONFLICT", title:"Version must be incremented when updating a page. Current Version: [7]. Provided version: [5]" }] }`
  (spike H5 exact title shape). The request sent `baseVersion: 5`.

**Steps**:
1. Call `pageService.update({ pageId, body, baseVersion: 5, message })`.
2. Assert `result.ok === false`, `result.error.kind === "Conflict"`,
   `result.error.pageId === <id>`, `result.error.baseVersion === 5`, and
   `result.error.remoteVersion === 7` — **not swapped** (current=7, provided=5).

**Expected Outcome**:
- The brand-defining 409 parse: `errors[0].code==="CONFLICT"` + the
  version-laden title → typed `Conflict` with correctly extracted numbers
  (AC-F3-1; ADR-0006 C-5/C-6; RSK-1). A misparse here would let a stale write
  silently overwrite a remote edit.

---

#### TC-CONFLICT-002 - Multiple 409 fixtures → 100% correct extraction (property)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-4, AC-F3-1, NFR-2
**Test Type(s)**: Unit (property)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Preconditions**:
- A small table of 409 title fixtures varying the version pair, including
  multi-digit numbers (e.g. `[42]`/`[41]`, `[1003]`/`[9]`).

**Steps**:
1. For each fixture, drive `update` and assert `Conflict{ baseVersion; remoteVersion }`
   matches the pair parsed from the title — 100% correct, no off-by-one, no swap.

**Expected Outcome**:
- The version-extraction regex is robust across multi-digit pairs (NFR-2:
  100% of 409 fixtures).

---

#### TC-CONFLICT-003 - Integration: full adapter vs `Bun.serve` stale update → `err(Conflict)`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-4, AC-F3-1, NFR-2, RSK-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend

**Preconditions**:
- The `Bun.serve` mock returns `409` with the CONFLICT body for
  `PUT /wiki/api/v2/pages/{id}` (§6).

**Steps**:
1. Call `target.updatePage({ pageId, body, baseVersion, message })` against the
   mock.
2. Assert `err(Conflict{ baseVersion; remoteVersion })` with the numbers parsed
   from the mock's 409 title.

**Expected Outcome**:
- The 409 parse is proven through the **real** adapter over the mock (same regex
  as TC-CONFLICT-001) — defense-in-depth against a unit/integration divergence.

---

#### TC-FORBIDDEN-001 - Mocked 403 on `getPage` → `err(Forbidden)`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, AC-F7-1, NFR-3, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Preconditions**:
- A stub client returning `403` for `GET v2("/pages/{id}?body-format=storage")`.

**Steps**:
1. Call `pageService.get(pageId)`.
2. Assert `result.ok === false`, `result.error.kind === "Forbidden"`,
   `result.error.pageId === <id>`, `result.error.operation === "getPage"`.

**Expected Outcome**:
- A locked/inaccessible page → `Forbidden` (warn+skip), never treated as missing
  (DEC-4; assumes operator has space-owner read access — CEO-resolved R2).

---

#### TC-FORBIDDEN-002 - Integration: 0 delete/recreate operations on a 403 (INV-SAFE-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, AC-F7-1, NFR-3, INV-SAFE-1, RSK-2, DEC-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- The `Bun.serve` mock returns `403` for the page read (§6) and records every
   request.

**Steps**:
1. Call `target.getPage(pageId)` → assert `err(Forbidden)`.
2. Grep the captured requests for any `DELETE` method or any `POST …/pages`
   (recreate) — assert **0** such requests.

**Expected Outcome**:
- The 403 path performs **0** delete/recreate operations — the zero-silent-
  overwrite promise holds for the permission-asymmetry case (AC-F7-1 /
  INV-SAFE-1; RSK-2). Proven over captured traffic, not a mock assertion.

---

#### TC-SCHEMA-001 - Malformed 200 page body (fails zod) → `RemoteUnreachable`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-9, DM-3, NFR-10, RSK-7, DEC-7, PD-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Preconditions**:
- A stub client returning `200` with a body that violates the
  `PageV2Response` zod schema (e.g. missing `version.number`, wrong type).

**Steps**:
1. Call `pageService.get(pageId)`.
2. Assert `result.ok === false`, `result.error.kind === "RemoteUnreachable"`,
   `result.error.cause` names the failing schema (no secret material).

**Expected Outcome**:
- A remote shape drift surfaces as a typed failure, never a silent misparse
  (DEC-7 / PD-5; RSK-7). Schema-drift maps to `RemoteUnreachable` (recovery =
  alert-operator; same as an exhausted-transport failure).

---

#### TC-SCHEMA-002 - Malformed 409 envelope (fails zod) → `RemoteUnreachable` (not a misparsed Conflict)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-9, DM-3, DM-4, NFR-10, RSK-1, RSK-7, DEC-7, PD-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Preconditions**:
- A stub client returning a `409` whose body is **not** the CONFLICT envelope
  (e.g. `errors` missing, or `code !== "CONFLICT"`, or the title has no
  parseable version numbers).

**Steps**:
1. Call `pageService.update(…)`.
2. Assert `result.error.kind === "RemoteUnreachable"` — **not** `Conflict` with
   garbage numbers, and not a silent pass-through.

**Expected Outcome**:
- The critical guardrail: a malformed/unexpected 409 can never produce a
  misparsed `Conflict` (which would corrupt the drift gate). It surfaces as a
  typed failure (PD-5; RSK-1 + RSK-7).

---

#### TC-PAGE-001 - Mocked 200 v2 page response → validated + mapped to port `Page`

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, DM-2, NFR-10
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Steps**:
1. Stub a `200` with a well-formed `PageV2Response` (`id`, `title`,
   `version{ number }`, `body.storage.value`).
2. Call `pageService.get(id)`.
3. Assert `ok(Page)` with the fields mapped to the port value type.

**Expected Outcome**:
- A valid v2 page read is zod-validated and mapped to the adapter-agnostic
  `Page` (F-3; DM-2).

---

#### TC-PAGE-002 - 404 on `getPage` → `err(RemoteMissing)`

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/pages.test.ts`
**Tags**: @backend

**Steps**:
1. Stub a `404` for the page read.
2. Assert `err({ kind:"RemoteMissing"; pageId })`.

**Expected Outcome**:
- A genuinely absent page → `RemoteMissing` (the pre-existing arm, reused).

---

#### TC-PAGE-003 - Integration: `updatePage` with `version.number = N+1` → 200 → `ok(Page)`

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-1 (input side)
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend

**Preconditions**:
- The mock accepts `PUT /wiki/api/v2/pages/{id}` and returns `200` (§6).

**Steps**:
1. Call `target.updatePage({ pageId, body, baseVersion: 5, message })`.
2. Assert `ok(Page)`; assert the captured request body sent
   `version.number === 6` (= baseVersion + 1, spike H5) and carried the
   `message`.

**Expected Outcome**:
- A well-formed update sends `version.number = N+1` and succeeds (spike H3/H5;
  the input side of the 409 contract).

---

#### TC-PROP-001 - `put` a string value; `get` reads it back byte-equal

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-5, AC-F4-1, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Steps**:
1. `propertyService.put(pageId, "marksync.metadata", "lock-fields-string")`.
2. Stub the subsequent `GET …/property/{key}` to return the stored value.
3. `propertyService.get(pageId, "marksync.metadata")` → assert byte-equal to the
   input string.

**Expected Outcome**:
- The cross-check string is stored/returned byte-for-byte (spike H2; AC-F4-1).
  Serialization of lock fields into the string is E3-S6's concern.

---

#### TC-PROP-002 - An ~8 KB value round-trips (spike H2 ~8.4 KB)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-5, AC-F4-1, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:
- An ~8 KB string payload (within the spike-H2 ~8.4 KB accepted ceiling).

**Steps**:
1. `put` the ~8 KB value; `get` it back.
2. Assert byte-equality (length + content).

**Expected Outcome**:
- The `marksync.metadata` cross-check accepts the realistic lock-payload size
  (AC-F4-1 second clause; NFR-5; spike H2).

---

#### TC-PROP-003 - A missing key → `ok(undefined)`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Steps**:
1. Stub `GET …/property/{key}` to return `404`.
2. `propertyService.get(pageId, "marksync.metadata")` → assert `ok(undefined)`.

**Expected Outcome**:
- A missing cross-check is **not** an error (a page not yet MarkSync-managed has
  no property) — E3-S6 treats `undefined` as "no cross-check yet".

---

#### TC-PROP-004 - A 409 key-conflict → handled (not a crash)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Steps**:
1. Stub `POST …/properties` to return `409` (v1+v2 share one namespace — spike H2).
2. Assert the service handles it (update-by-key or surfaces `Conflict`) without
   throwing.

**Expected Outcome**:
- The v1/v2 namespace collision is handled deterministically (F-4).

---

#### TC-PROP-005 - Integration: full adapter `putProperty` → `getProperty` byte-equal (~8 KB)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-5, AC-F4-1, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend

**Preconditions**:
- The mock serves `POST /wiki/api/v2/pages/{id}/properties` (store) and
  `GET /wiki/api/v2/pages/{id}/property/{key}` (recall), echoing the stored
  value (§6).

**Steps**:
1. `target.putProperty(pageId, "marksync.metadata", ~8KB-string)`.
2. `target.getProperty(pageId, "marksync.metadata")` → assert byte-equal.

**Expected Outcome**:
- The cross-check round-trips through the real adapter over the mock, including
  the ~8 KB payload (AC-F4-1; NFR-5).

---

#### TC-ATTACH-001 - Duplicate filename → 400 "same file name" → "already exists" (not an error)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-F5-1, NFR-4, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend

**Preconditions**:
- A stub client returning `400` with body containing `"Cannot add a new
  attachment with the same file name"` (spike H4 exact text) for the multipart
  create.

**Steps**:
1. `attachmentService.upload(pageId, artifact)` where the hash-derived filename
   already exists.
2. Assert the result is an **"already exists"** success-shaped result (not
   `err`); idempotent rerun performs **0** writes.

**Expected Outcome**:
- The 400-duplicate is the skip-if-exists idempotency signal, not an error
  (DEC-3 / spike H4) — idempotent rerun performs 0 writes (NFR-PERF-4).

---

#### TC-ATTACH-002 - Changed bytes → `/child/attachment/{attId}/data` update bumps version

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-F5-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend

**Steps**:
1. `attachmentService.update(attId, artifact)` with changed bytes.
2. Assert the stub was hit at `/child/attachment/{attId}/data` (v1) and the mock
   recorded a version bump (1 → 2).

**Expected Outcome**:
- Genuinely-changed bytes go via `/data` and bump the version (spike H4;
  AC-F5-1 second clause).

---

#### TC-ATTACH-003 - `attachmentExists(pageId, hash)` resolves by hash-filename; 403 → `Forbidden`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-5, F-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend

**Steps**:
1. Stub the v1 attachment list to include the hash-derived filename
   (`marksync-asset-<hash>.<ext>`); assert `exists(pageId, hash)` → `ok(true)`.
2. Stub a `403`; assert `err({ kind:"Forbidden"; operation })`.

**Expected Outcome**:
- Existence dedup keys on the hash-derived filename; the 403 path is consistent
  with the page 403 semantics (F-7).

---

#### TC-ATTACH-004 - `listAttachments(pageId)` enumerates hash-named attachments

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend

**Steps**:
1. Stub the v1 list response with several hash-named entries.
2. Assert `list(pageId)` returns the mapped `AttachmentRef[]`.

**Expected Outcome**:
- The list op enumerates attachments for the dedup/existence flow (F-5).

---

#### TC-ATTACH-005 - Integration: upload → duplicate 400 → already-exists; changed bytes → `/data` bump

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-F5-1, NFR-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend

**Preconditions**:
- The mock serves the v1 attachment create + `/data` update paths, returning the
  400-duplicate text on a second identical upload (§6).

**Steps**:
1. `target.uploadAttachment(pageId, artifact)` → `ok(AttachmentRef)`.
2. Re-upload the same artifact → assert the **"already exists"** result (not an
   error); 0 additional writes.
3. Upload changed bytes → assert the mock received a `/data` update and the
   version bumped.

**Expected Outcome**:
- The idempotent-upload lifecycle (upload → dup-skip → changed-update) holds
  through the real adapter over the mock (AC-F5-1 / NFR-4).

---

#### TC-SEARCH-001 - Mocked CQL result → validated + mapped to `PageRef[]` (v1)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, NFR-10
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/search.test.ts`
**Tags**: @backend

**Steps**:
1. Stub a v1 CQL result with a few page hits.
2. `searchService.search(cql)` → assert `ok(PageRef[])`, zod-validated.

**Expected Outcome**:
- CQL search (page discovery for `doctor`/discovery) works via v1, kept minimal
  (F-6; NFR-MAINT-2).

---

#### TC-RESTR-001 - Mocked restrictions read → mapped; 403 → `Forbidden` (v1)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, F-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/restrictions.test.ts`
**Tags**: @backend

**Steps**:
1. Stub a v1 `GET …/content/{id}/restriction` response → assert mapped to
   `PageRestrictions`.
2. Stub a `403` → assert `err({ kind:"Forbidden"; pageId; operation })`.

**Expected Outcome**:
- Restrictions read supports the 403/permission-awareness story (R-FEA-10);
  minimal surface (F-6).

---

#### TC-PROV-001 - `formatVersionMessage` produces the MarkSync/Git prefix + summary; deterministic

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-8, ADR-0010, NFR-REL-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/provenance.test.ts`
**Tags**: @backend

**Steps**:
1. Call `formatVersionMessage({ head: "<sha>", subjects: ["fix: a", "feat: b"] })`.
2. Assert the result has a clear MarkSync/Git prefix, the head commit id, and a
   compact included-commit summary.
3. Assert deterministic: same input → identical string across N calls.

**Expected Outcome**:
- The Confluence-specific `version.message` formatter produces the provenance
  string E3-S6/E4-S3 consume (ADR-0006/ADR-0010; F-8).

---

#### TC-PROV-002 - Payload exceeding `MAX_VERSION_MESSAGE_LEN` is trimmed deterministically

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-8, PD-6, ADR-0010
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/provenance.test.ts`
**Tags**: @backend

**Preconditions**:
- `MAX_VERSION_MESSAGE_LEN` is a named constant (PD-6; conservative default —
  ADR-0010 §"Open questions" lists the exact limit as TO CONFIRM, empirically
  confirmed in E5-S1).

**Steps**:
1. Build an input whose natural summary exceeds `MAX_VERSION_MESSAGE_LEN`.
2. Assert the output length ≤ the constant; the trim is deterministic and avoids
   mid-token truncation where avoidable.

**Expected Outcome**:
- The formatter stays within Confluence's usable length bound deterministically;
  the constant is the single knob to tighten after E5-S1 confirmation (PD-6).

---

#### TC-GATE-001 - `bun run check` exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-13, NFR-14, F-9
**Test Type(s)**: Gate
**Automation Level**: Automated
**Target Layer / Location**: repo root
**Tags**: @backend

**Steps**:
1. `bun run check` (lint + format:check + typecheck + test + check:boundaries).
2. Assert exit 0.

**Expected Outcome**:
- All quality gates pass. The **typecheck** leg is the exhaustiveness proof:
  adding `RateLimited` + `RemoteUnreachable` without their `case`s in
  `assertNeverMarkSyncError` (and the two handler sites) makes the `default`
  arm's `error` non-`never` and fails compilation (RSK-6 / NFR-13). This single
  gate is the load-bearing safety net for the error-model change.

---

#### TC-DEP-001 - `zod` present; no HTTP/crypto library added

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-11, PD-2, DEC-6
**Test Type(s)**: Gate (side-check on `package.json` + lock)
**Automation Level**: Automated
**Target Layer / Location**: repo root
**Tags**: @backend

**Steps**:
1. Assert `package.json` lists `zod` as a (runtime) dependency (PD-2 — this story
   is the first consumer; the spec's "already installed" claim is a factual
   error, corrected by the plan).
2. Assert `package.json` does **NOT** list any HTTP library (`axios`,
   `node-fetch`, …) or crypto library — native `fetch`/`URL`/`FormData`/`Blob`/
   `crypto` only (DEC-6 / NFR-11).

**Expected Outcome**:
- The dependency scope is exactly `zod` added; no transport/crypto dependency
  (NFR-11).

---

## 6. Environments and Test Data

### 6.1 The `Bun.serve` mock (integration tier)

All integration cases (TC-CONFLICT-003, TC-FORBIDDEN-002, TC-PAGE-003,
TC-PROP-005, TC-ATTACH-005, TC-NOLEAK-001, TC-TELEMETRY-001) share one mock
harness, adapted from the GH-17 precedent
(`tests/integration/credentials.test.ts` — `serveMock` / `credsFor` /
`jsonResponse` / `Retry-After: 0`).

**Setup:**

1. **Origin** — `Bun.serve({ port: 0, fetch(req) })` claims an ephemeral port;
   the adapter's `baseUrl` is set to `http://localhost:${server.port}`. The
   client uses the **global** `fetch` (no stub) so the safety assertions run over
   genuine HTTP — the over-mocking guardrail mandates this for INV-SEC-1.
2. **Router** — the handler routes by URL path prefix, mirroring the v2/v1 split:
   - `/wiki/api/v2/pages…` → v2 `PageService` behaviors (200 read, 200/409
     update, 403, 404, property get/post).
   - `/wiki/rest/api/content/{id}/child/attachment…` → v1 `AttachmentService`
     behaviors (200 create, 400 "same file name" on a duplicate filename,
     `/data` update, list).
   - `/wiki/rest/api/search` / `…/restriction` → v1 search/restrictions.
   The handler decides the status/body per **request count** (e.g. 429 once then
   200) and/or per path, exactly as the GH-17 `respond(count, req)` pattern.
3. **Recorder** — every incoming request is pushed into an array as
   `{ url, method, headers, body }`. This array is the single source for:
   - **TC-NOLEAK-001** — grep `headers` + `body` for the token (0 expected).
   - **TC-TELEMETRY-001** — assert `new URL(url).host === baseUrl.host` for
     every entry (no other host).
   - **TC-FORBIDDEN-002** — assert 0 `DELETE` methods / 0 `POST …/pages`
     (recreate) entries.
   - **TC-PAGE-003 / TC-ATTACH-005** — assert the request body sent
     `version.number = N+1` / hit `/data`.
4. **Credentials** — a `ConfluenceCredentials` built exactly like the GH-17
   `credsFor(baseUrl)`: `authHeader = "Basic " + base64(email:TOKEN)`, masked
   `email`, `mode: "api-token"`. The known `TOKEN` string is the no-leak grep
   needle; it is **not** a real secret (synthetic, local mock).
5. **Teardown** — `server.stop(true)` in a `finally` block (the GH-17 pattern).

> The mock simulates Confluence's v2/v1 surface and status codes; it does **not**
> mock the adapter, the redactor, the URL builder, or dependency-cruiser. The
> critical-safety properties are asserted on the **real** captured traffic.

### 6.2 Boundary negative-test probe

- **Ephemeral `src/domain/` probe** — TC-BND-001 creates the violating file at
  runtime under `src/domain/` (e.g. `src/domain/__boundary_probe__.ts` importing
  `#infra/confluence/client`), because the production
  `domain-may-not-import-infra` rule filters `from: { path: "src/domain/" }` and
  `check:boundaries` runs `depcruise src` — a `tests/`-located fixture would
  never fire it (`from.path = tests/…`). The probe is created by the test (never
  committed) and **deleted in `afterEach` / `finally`**; a leaked probe under
  `src/domain/` would permanently break `check:boundaries`, so cleanup is
  release-blocking-critical (assert the probe is absent post-cleanup; a
  `git status` guard is belt-and-suspenders). The test cruises `src/` with the
  **production** `.dependency-cruiser.cjs` ruleset (programmatic `cruise(...)`
  API or `bunx depcruise src` subprocess — OQ-TP-1) and asserts the
  `domain-may-not-import-infra` violation fires with the right `from`/`to`.

### 6.3 Backoff-timing test data (fake timers)

- The retry loop's delay is driven by `bun:test` fake timers
  (`mock.timer({ now })` + `.tick(ms)` / `.runAll()`) or an injected delay seam
  (no real sleeps — testing-strategy §"fault injection"; PD-8).
- Jitter is intentionally non-deterministic, so the backoff assertions
  (TC-RATE-001/002, TC-UNREACH-001..003) check the **bounded attempt count**
  (1 initial + max 3 retries) and the `Retry-After` ordering, **not** exact ms.

### 6.4 409-fixture and attachment-dup test data

- **409 titles** (TC-CONFLICT-001/002) use the spike-H5 exact shape:
  `"Version must be incremented when updating a page. Current Version: [N]. Provided version: [M]"`,
  with a small table of `(N, M)` pairs including multi-digit numbers.
- **Attachment duplicate** (TC-ATTACH-001/005) uses the spike-H4 exact 400 text:
  `"Cannot add a new attachment with the same file name"`.
- **Property ~8 KB** (TC-PROP-002/005) uses a generated string within the
  spike-H2 ~8.4 KB accepted ceiling.

### 6.5 Environment

- Bun (pinned per release); `bun:test`; `bunfig.toml` `[test] root = "tests"` +
  the mermaid preload (harmless for non-mermaid tests — GH-20 confirmed).
- No live network (the live-tenant smoke is E5-S1, NG-8). The only HTTP is to
  the local `Bun.serve` mock.
- `zod` installed by Phase 0 (PD-2); no HTTP/crypto library.

## 7. Automation Plan and Implementation Mapping

| TC ID(s) | Test file | Tier | Status | Notes |
|----------|-----------|------|--------|-------|
| TC-PORT-001 | `tests/unit/domain/target/port.test.ts` | Unit/contract | To Implement | Type-level op-set + Result-return + no-Confluence-type grep |
| TC-PORT-002, TC-PORT-003 | `tests/unit/infra/confluence/target.test.ts` | Unit | To Implement | `renderBody` delegate; `ConfluenceTarget implements TargetSystem` |
| TC-BND-001 | `tests/unit/domain/target/boundary-negative.test.ts` | Unit/boundary | To Implement | Ephemeral `src/domain/` probe cruised with the production ruleset (PD-4); probe deleted in `afterEach`; mechanism resolved at delivery (OQ-TP-1) |
| TC-BND-002 | repo root (`bun run check:boundaries`) | Boundary gate | Existing (gate) | Exits 0 once the port lands |
| TC-ERR-001..003 | `tests/unit/domain/errors/error-arms.test.ts` | Unit | To Implement | The two new arms across all three sites (PD-3); DEC-9 message check |
| TC-URL-001, TC-AUTH-001, TC-RATE-001..002, TC-UNREACH-001..003, TC-NORETRY-001 | `tests/unit/infra/confluence/client.test.ts` | Unit | To Implement | Stub `fetch` + fake timers; backoff asserts on attempt count, not ms |
| TC-TELEMETRY-001, TC-NOLEAK-001 | `tests/integration/confluence/confluence-target.test.ts` | Integration | To Implement | Real `Bun.serve`; grep captured traffic for token + host |
| TC-CONFLICT-001..002, TC-FORBIDDEN-001, TC-SCHEMA-001..002, TC-PAGE-001..002 | `tests/unit/infra/confluence/pages.test.ts` | Unit | To Implement | 409 regex correctness; zod-drift → `RemoteUnreachable` (PD-5) |
| TC-CONFLICT-003, TC-FORBIDDEN-002, TC-PAGE-003 | `tests/integration/confluence/confluence-target.test.ts` | Integration | To Implement | Real adapter vs mock; 0 delete/recreate on 403 |
| TC-PROP-001..004 | `tests/unit/infra/confluence/properties.test.ts` | Unit | To Implement | String round-trip; ~8 KB; missing key; 409 key-conflict |
| TC-PROP-005 | `tests/integration/confluence/confluence-target.test.ts` | Integration | To Implement | Full-adapter round-trip incl. ~8 KB |
| TC-ATTACH-001..004 | `tests/unit/infra/confluence/attachments.test.ts` | Unit | To Implement | 400-dup idempotency; `/data` update; exists; list |
| TC-ATTACH-005 | `tests/integration/confluence/confluence-target.test.ts` | Integration | To Implement | upload → dup-skip → changed-update lifecycle |
| TC-SEARCH-001 | `tests/unit/infra/confluence/search.test.ts` | Unit | To Implement | v1 CQL, minimal |
| TC-RESTR-001 | `tests/unit/infra/confluence/restrictions.test.ts` | Unit | To Implement | v1 restrictions; 403 → `Forbidden` |
| TC-PROV-001..002 | `tests/unit/infra/confluence/provenance.test.ts` | Unit | To Implement | Deterministic formatter; `MAX_VERSION_MESSAGE_LEN` trim (PD-6) |
| TC-GATE-001 | repo root (`bun run check`) | Gate | Existing (gate) | Exits 0; the typecheck leg is the exhaustiveness proof |
| TC-DEP-001 | repo root (`package.json` + lock side-check) | Gate | To Implement | `zod` present; no HTTP/crypto lib |

**Execution:** `bun test tests/unit/ tests/integration/` (the CI fast-loop set
per testing-strategy §"CI wiring"; no E2E / no BDD in this story). Snapshot
updates N/A (no golden fixtures in this story).

**Plan ID reconciliation.** These TC IDs supersede the plan's draft Test
Scenarios table (which used numeric slugs). Mapping: plan `TC-429-001/002` →
**TC-RATE-001/002**; plan `TC-5XX-001` → **TC-UNREACH-001**; plan `TC-NETWORK-001`
→ **TC-UNREACH-003**; plan `TC-409-001/002` → **TC-CONFLICT-001/002**; plan
`TC-403-001` → **TC-FORBIDDEN-001**; plan `TC-404-001` → **TC-PAGE-002**; plan
`TC-200-001` → **TC-PAGE-001**; plan `TC-PROP-RT-001` → **TC-PROP-001/002**;
plan `TC-PROP-MISS-001` → **TC-PROP-003**; plan `TC-PROP-CONFLICT-001` →
**TC-PROP-004**; plan `TC-DUP-001` → **TC-ATTACH-001**; plan `TC-UPD-001` →
**TC-ATTACH-002**; plan `TC-EXISTS-001` → **TC-ATTACH-003**; plan `TC-LIST-001`
→ **TC-ATTACH-004**; plan `TC-INT-*` → the integration cases
**TC-CONFLICT-003 / TC-FORBIDDEN-002 / TC-PAGE-003 / TC-PROP-005 / TC-ATTACH-005 /
TC-NOLEAK-001 / TC-TELEMETRY-001**. The plan's `TC-TARGET-001` → **TC-PORT-002 /
TC-PORT-003**; `TC-AUTH-001` (unit) is kept as **TC-AUTH-001** while the plan's
integration no-leak (`TC-INT-NOLEAK`) → **TC-NOLEAK-001**.

**Mocking requirements:** stub `fetch` for the client unit tests (fault
injection + URL/header capture); real `Bun.serve` for the integration suite
(over-mocking guardrail); the production dependency-cruiser rule over an
ephemeral `src/domain/` probe for the boundary negative test (the probe is
created and deleted by the test — never committed). No domain logic is mocked.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Mitigation |
|------|------------|
| The 409 parse is tested by the same agent that implements it → a regex blind spot (e.g. multi-digit versions, swapped current/provided) survives both. | **Mitigated:** TC-CONFLICT-002 parameterizes over a fixture table (multi-digit, varied pairs) asserting 100% correct, non-swapped extraction; TC-CONFLICT-003 re-runs the same parse through the **real** adapter over the mock (defense-in-depth). The version-laden title shape is spike-H5-authoritative, not reverse-engineered. |
| The no-token-leak assertion depends on capturing every output path — a path the test does not capture could still leak. | **Mitigated:** TC-NOLEAK-001 greps the **actual captured request/response bytes** the mock recorded + a captured redacted-log sink; the opaque-`authHeader` design (the adapter never sees the raw token — GH-17) is the primary control, with the redaction layer defense-in-depth. The known `TOKEN` needle is synthetic. |
| Fake-timer / injected-delay jitter makes backoff assertions timing-flaky. | **Mitigated:** backoff tests assert on the **bounded attempt count** (1 initial + max 3 retries) and `Retry-After` ordering, **not** exact ms (PD-8). Jitter is intentionally non-deterministic; the suite never asserts an exact sleep duration. |
| The boundary negative test's invocation mechanism (programmatic `cruise(...)` vs `bunx depcruise` subprocess) is unresolved at planning time; and a leaked `src/domain/` probe would permanently break `check:boundaries`. | **Mitigated (PD-4):** the probe is created at runtime under `src/domain/` and **deleted in `afterEach` / `finally`** (asserted absent post-cleanup; `git status` guard) — the only way to fire the production rule (`from: { path: "src/domain/" }`), since `check:boundaries` runs `depcruise src`. The @coder picks the more robust invocation mechanism (programmatic API preferred — in-process, deterministic config load); the assertion is on the production `domain-may-not-import-infra` rule firing with the right `from`/`to`, independent of the mechanism. |
| Confluence API shape drift invalidates a zod schema post-merge (RSK-7). | **Mitigated:** TC-SCHEMA-001/002 prove a drift surfaces as `RemoteUnreachable` (never a silent misparse). The nightly live-smoke (E5-S1) + weekly deprecation-feed are the early-warning surfaces — out of scope here. |
| The `bun:test` fake-timer API (`mock.timer(...)`) behavior across Bun versions could change. | Pin the Bun version per release; the injected-delay seam is the robust fallback (the client takes a delay function; tests substitute a recording no-op). Re-baseline as an explicit reviewed action if Bun changes affect it (GH-20 snapshot-rules precedent). |

### 8.2 Assumptions

- ADR-0006 (state model — 409 gate, content-property cross-check, 403→warn+skip,
  INV-SAFE-1) and ADR-0005 (Storage target) are settled and being **implemented**,
  not reconsidered (NG-7).
- The spike (MS-0001) H1–H5 findings are authoritative for: the auth path (H1),
  the v2-string content property (~8.4 KB; v1 deprecated; H2), the v2 Storage
  write (H3), the v1 attachment 400-duplicate idempotency signal + `/data`
  update (H4), and the exact 409 body (`errors[0].code:"CONFLICT"` + the
  version-laden title — H5). Cited, not re-derived.
- The GH-17 `ConfluenceCredentials { baseUrl; authHeader; email; mode }` is the
  injected auth seam; the adapter receives the opaque `authHeader` and never the
  raw token (INV-SEC-1). The GH-17 `AuthProviderOptions.fetch` precedent gives
  the injected-`fetch` seam the client reuses.
- The GH-20 `renderStorage(hast, opts) → { body; hash; warnings }` is the body
  renderer the port's `renderBody` delegates to (DEC-5 / PD-1 — HAST input).
- The GH-16 redaction layer (`redactString`) is available to route
  request/response logging through (NFR-SEC-1).
- `Result<T,E>` + the reused arms (`Conflict`/`Forbidden`/`TooLarge`/
  `RemoteMissing`) are stable; `RateLimited` + `RemoteUnreachable` are the
  **only** error-model additions (DEC-2 / NG-9).
- dependency-cruiser already enforces the boundary; the negative test **proves**,
  not adds, the rule. The broader dep-cruiser matrix has gaps (no
  `infra → app`/`infra → cli` rule) — hardening is a future item (GH-20 Finding 6
  precedent), out of scope here.
- The operator has space-owner read access, so a 403 is treated as inaccessible
  (not missing) — CEO-resolved R2 (architecture UNCERT-4).
- `zod` is installed in Phase 0 (PD-2); the spec's "zod already installed" claim
  is a factual error corrected by the plan.

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | Which dep-cruiser invocation mechanism does TC-BND-001 use — the programmatic `cruise(...)` API or a `bunx depcruise` subprocess? | No | `@coder` | Both cruise `src/` (with the ephemeral `src/domain/` probe present) using the production ruleset (PD-4); the programmatic API is preferred (in-process, deterministic config load). The probe is created at runtime and deleted in `afterEach` either way. The assertion (the production `domain-may-not-import-infra` rule fires with the right `from`/`to`) is mechanism-independent. |
| OQ-TP-2 | Does the client expose an injected delay seam, or do the backoff tests rely solely on `bun:test`'s `mock.timer(...)`? | No | `@coder` | PD-8 mandates "fake timers / injected delays — no real sleeps". Either is acceptable; the injected seam is the robust cross-Bun-version fallback. Tests assert on attempt count + ordering, not exact ms. |
| OQ-TP-3 | Exact `MAX_VERSION_MESSAGE_LEN` value (TC-PROV-002). | No | `@doc-syncer` / E5-S1 | ADR-0010 §"Open questions" lists the usable limit as TO CONFIRM. PD-6 default is a conservative named constant; confirmed empirically in E5-S1 and tightened. No MS-0002 flow depends on the exact value. |
| OQ-TP-4 | `renderBody` input — HAST or MDAST? | No (resolved in plan) | `@doc-syncer` | PD-1 resolves this in favour of **HAST** (architecture-overview §"Internal interface contracts" is the port-contract authority). The story file's `renderBody(mdast, …)` wording is a doc-sync item for lifecycle phase 7 — TC-PORT-002 asserts the implemented HAST signature. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | test-plan-writer (ADOS) | Initial test plan — Unit + Integration tiers; 44 TCs across 17 feature families (PORT/BND/ERR/URL/AUTH/NOLEAK/RATE/UNREACH/NORETRY/TELEMETRY/CONFLICT/FORBIDDEN/SCHEMA/PAGE/PROP/ATTACH/SEARCH/RESTR/PROV/GATE/DEP); AC-F1-1..AC-Q-1 all covered; both resolved OQs (RateLimited OQ-2, RemoteUnreachable OQ-1) covered; plan draft Test Scenarios table reconciled (numeric → alphabetic slugs). Critical-safety paths (409 parse, 403 warn+skip, no-leak, no-telemetry, boundary negative) proven at the integration tier over a `Bun.serve` mock per the over-mocking guardrail. Open questions OQ-TP-1..004 surfaced (none blocking). |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(populated during execution)_ | | | |
