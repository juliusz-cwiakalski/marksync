---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-81-mock-confluence-e2e
status: Proposed
created: 2026-07-15T00:00:00Z
last_updated: 2026-07-15T00:00:00Z
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["test", "MS-0002", "priority:high", "ci"]
links:
  change_spec: ./chg-GH-81-spec.md
  test_plan: ./chg-GH-81-test-plan.md
  pm_notes: ./chg-GH-81-pm-notes.yaml
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  ci_workflow: ../../../.github/workflows/ci.yml
summary: >
  Add a reusable, stateful mock Confluence HTTP server (Bun.serve on an ephemeral
  port) plus a full-pipeline e2e scenario suite that runs computePlan + applyPlan
  against the mock, wired as a mandatory, secrets-free `e2e-mock` job in the fast
  CI loop. Catches HTTP adapter regressions (GH-71 attachment-unwrap, GH-66
  property-API class) on every PR without a live Confluence instance. Zero
  production source changes (DEC-1); new tier tests/e2e-mock/ (DEC-2); mock built
  from the corrected endpoint list (DEC-3).
version_impact: none
---

# IMPLEMENTATION PLAN — GH-81: Mock Confluence HTTP Server for CI E2E Regression Tests

## Context and Goals

This plan delivers a **new, additive test tier** (`tests/e2e-mock/`) and a **mandatory, secrets-free CI gate** that together make HTTP-adapter regressions — specifically the **GH-71** `{ results: [...] }` attachment-unwrap class and the **GH-66** v1 property-API class — structurally un-mergeable. Today the mandatory fast loop has no full-pipeline e2e coverage against a Confluence-shaped server; the live-sandbox tier (`tests/e2e/` via `run-e2e.yml`) is opt-in (label/secrets) and cannot be the PR gate.

Per **DEC-1 (Option B)**, scenarios exercise the full pipeline **programmatically** — they construct `ConfluenceTarget.fromCredentials` directly against the loopback mock (mirroring `tests/integration/confluence/confluence-target.test.ts`) and invoke `computePlan` + `applyPlan`. **No CLI binary is spawned.** Per **DEC-2**, the suite lives in `tests/e2e-mock/` (not `tests/e2e/`), keeping the live-sandbox tier clean. Per **DEC-3**, the mock implements the **corrected** endpoint list (spec §8.1, verified against `src/infra/confluence/*`); the obsolete jsongraphs endpoint is NOT implemented anywhere.

> **Production-source guardrail (DEC-1, load-bearing).** `src/**` is **UNTOUCHED** by this change — no edit to `src/app/credentials.ts` (the `https:`-only gate stays intact) or to any adapter. This plan touches only `tests/e2e-mock/**` and `.github/workflows/ci.yml`.
>
> **Adapter-bug escalation rule (RSK-5).** If, while writing scenarios, the coder discovers a *genuine* adapter bug (not a test/mock defect), **STOP and escalate to the PM as a separate change** — do NOT fix `src/**` inline. Record the finding in the Execution Log and surface it for triage.

**Open questions**:

- **OQ-P1 (helper module naming, minor).** Test-plan §7 "Shared test infrastructure" lists `tests/e2e-mock/mock-server.ts` + `helpers.ts`; the delivery instruction specifies the more descriptive `tests/e2e-mock/mock-confluence-server.ts`. The test plan only authoritatively names the `.test.ts` files (§5.2 "Target Layer / Location"); the helper module name is not contract. **Decision: use `mock-confluence-server.ts`** (more descriptive, avoids `mock-server` ambiguity with the live tier). No spec/test-plan contract conflict — reconciliation recorded here.
- **OQ-P2 (test-helper import alias).** Helpers under `tests/e2e-mock/` are imported via **relative paths** (mirroring how the integration tests reference each other), so `package.json` stays unchanged. Adding a `#tests/e2e-mock/*` alias to `package.json#imports` is **optional and out of scope** unless the coder finds it necessary; if so, it is a non-`src/` change and still permitted by DEC-1. **Decision needed**: none — relative imports are the default.
- All spec open questions (OQ-1 stretch scenarios, OQ-2 Option A) are **resolved in the spec** (deferred) and do not block delivery.

## Scope

### In Scope

- **F-1** — Reusable, stateful mock Confluence HTTP server under `tests/e2e-mock/` implementing the corrected endpoint list (spec §8.1) with realistic envelopes, the exact `parseConflict` 409 shape, attachment dedup 400 path, in-memory state maps, a `CapturedRequest[]` recorder, and a per-scenario reset mechanism.
- **F-2** — Full-pipeline e2e scenario suite (`tests/e2e-mock/*.test.ts`) running `computePlan` + `applyPlan` against the mock via `ConfluenceTarget.fromCredentials`; ≥ 5 mandatory scenarios + the property-API regression scenario.
- **F-3** — Mandatory, secrets-free `e2e-mock` CI job in `.github/workflows/ci.yml` running `bun test tests/e2e-mock/`.
- **F-4** — Adapter-regression lock: scenarios that fail if the GH-71 unwrap or GH-66 property-API shapes regress, plus the mock-409 self-check (AC-F1-2 / RSK-1).
- Shared helpers (corpus fixtures with `marksync:uuid` front-matter, target builder, instant `delay` seam) and the mock-409 self-check test.

### Out of Scope

- **[OUT] Any edit to `src/**`** (DEC-1). Includes `src/app/credentials.ts`, `isHttpsUrl`, and every adapter under `src/infra/confluence/*`. (Spec §7.2.)
- **[OUT] CLI-binary spawning / Option A** (loopback-http relaxation of `resolveCredentials`) — deferred follow-up surfaced in the PR description (OQ-2).
- **[OUT] Changes to `run-e2e.yml` or `tests/e2e/`** (DEC-2 / NG-3).
- **[OUT] Stretch scenarios** (conflict recovery per ADR-0006 C-5/C-6, Mermaid determinism, HTML-comment strip GH-77, UUID-less warning GH-74) — deferred per AC-F2-6 / OQ-1. Not planned as tasks.
- **[OUT] Re-asserting adapter-call-level response parsing** already covered in `tests/integration/confluence/` (NG-6 / NFR-MAINT-2).
- **[OUT] Production bug fixing** — escalate to PM as a separate change if surfaced (RSK-5).
- **[OUT] Performance benchmarking**, live Confluence testing, and BDD/Gherkin features (NG-4).

### Constraints

- **Production source frozen (DEC-1).** All new code lives under `tests/e2e-mock/**`; the only non-test file touched is `.github/workflows/ci.yml`.
- **New tier only (DEC-2).** Nothing is added to `tests/e2e/` or `run-e2e.yml`.
- **Corrected endpoints only (DEC-3).** The mock implements spec §8.1 verbatim; the jsongraphs endpoint is absent everywhere.
- **Deterministic (RSK-3, NFR-CI-1).** Mock state resets per scenario (fresh `Bun.serve` or explicit reset); instant `delay` seam (`() => Promise.resolve()`); no sleeps; the full `tests/e2e-mock/` suite completes in **≤ 60 s**.
- **Secrets-free (NFR-CI-2).** The `e2e-mock` CI job references zero `secrets.*`.
- **Pinned Bun matrix.** The new CI job matches the `fast-loop` job's pinned Bun (`1.2.23`) / OS (`ubuntu-latest`) discipline (per `ci.yml` + `package.json#engines.bun`).
- **Adapter isolation (NFR-MAINT-1).** The mock targets only the `ConfluenceClient` URL surface; test code imports follow the established pattern (`#infra/confluence/target`, `#app/push-flow`, `#app/cache`, `#domain/*`, `#tests/_helpers/*`).
- **Adapter-bug escalation (RSK-5).** No inline production fixes; STOP + escalate to PM.

### Risks

- **RSK-1 (409-shape drift, H/M → L):** Mock-vs-real conflict-envelope drift makes conflict assertions wrong. **Mitigated by:** the verbatim `VERSION_RE` shape (`/Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/`) reproduced in the mock (spec §8.1), and the unit-level mock-409 self-check (Phase 2 / TC-E2EMOCK-001 / AC-F1-2) that proves the mock's 409 round-trips through `parseConflict`.
- **RSK-2 (over-build vs. integration tier, M/M → L):** Re-asserting per-call coverage already in `tests/integration/confluence/`. **Mitigated by:** scoping to full-pipeline + stateful + CI-gated value (NG-6); no per-call duplication.
- **RSK-3 (state leakage, M/M → L):** Cross-scenario contamination makes tests flaky. **Mitigated by:** fresh `Bun.serve({ port: 0 })` per scenario (or explicit reset); NFR-CI-1 keeps the suite fast.
- **RSK-4 (Content-Type/JSON divergence, M/L → L):** Mock JSON handling diverges from `ConfluenceClient.parseJsonIfPossible`. **Mitigated by:** mock responds with `application/json` bodies exactly as the client parses them; validated via the create scenario (Phase 3) which round-trips a full page.
- **RSK-5 (genuine adapter bug surfaced mid-delivery, M/L → L):** **Mitigated by:** DEC-1 — do NOT fix `src/**` inline; STOP + escalate to the PM as a separate change (spec §7.2).

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| `e2e-mock` CI job present & mandatory | 1 job, 0 secrets | AC-3, NFR-CI-2 |
| Mandatory full-pipeline scenarios | ≥ 5 (create, no-op, update, attachment dedup, provenance) | AC-F2-1..5 |
| Adapter-regression classes covered | 2 (GH-71 unwrap, GH-66 property-API) | AC-4, F-4 |
| Mock-409 self-check | passes (mock 409 round-trips `parseConflict`) | AC-F1-2 |
| Production source files changed | 0 (DEC-1) | G-5 |
| New CI secrets required | 0 | NFR-CI-2 |
| Mock state leakage between scenarios | 0 | RSK-3 |
| Suite runtime | ≤ 60 s | NFR-CI-1 |

## Phases

> **Phase → letter map (for PM traceability):** Phase 1 = A (skeleton), Phase 2 = B (409 self-check), Phase 3 = C (5 mandatory scenarios), Phase 4 = D (property-API scenario), Phase 5 = E (CI job), Phase 6 = F (verification + finalize). Each phase is one commit-sized unit.

### Phase 1: Mock Server Skeleton + Shared Helpers (A)

**Goal**: Build the reusable, stateful mock Confluence HTTP server (`Bun.serve({ port: 0 })`) with in-memory state, the captured-request recorder, every corrected endpoint from spec §8.1 with realistic envelopes, the exact 409 conflict shape, the attachment dedup 400 path, and a per-scenario reset mechanism — plus shared helpers (corpus fixtures, target builder).

**Tasks**:

- [ ] **1.1** Create `tests/e2e-mock/mock-confluence-server.ts`: a `Bun.serve({ port: 0 })` factory returning `{ origin, stop, captured, reset }`, mirroring the `serveMock`/`CapturedRequest[]` pattern in `tests/integration/confluence/confluence-target.test.ts`. The recorder captures `{ host, path, method, authorization, text }` per request. Accept any `Authorization` header (mock only). (F-1, DM-1, DM-2)
- [ ] **1.2** Add the in-memory state model: `Map<pageId, PageState>` (id, title, version, body storage, parentId), `Map<"pageId::key", { value, version }>` for content properties, `Map<pageId, AttachmentState[]>` (id, filename, version). Server assigns a new monotonic id + version 1 on page create; advances version on successful PUT. (F-1, DM-1)
- [ ] **1.3** Implement the **credential-validation** endpoint (realism only, not on the e2e critical path): `GET /wiki/api/v2/user/by-me` → 200 `{ accountId, displayName }` (fixed identity). (AC-F1-1, §8.1)
- [ ] **1.4** Implement the **v2 pages** endpoints (per §8.1; adapter: `src/infra/confluence/pages.ts`):
  - `POST /wiki/api/v2/pages` — create; response 2xx `PageV2Response` `{ id, title, status:"current", version:{number:1, message}, body:{storage:{value}} }`.
  - `GET /wiki/api/v2/pages/{id}?body-format=storage` → 200 with body; 404 (→ `RemoteMissing`); 403 (→ `Forbidden`).
  - `PUT /wiki/api/v2/pages/{id}` — update/move; on stale version return **409** with the exact envelope `{ errors:[{ code:"CONFLICT", title:"...Current Version: [N]...Provided version: [M]..." }] }` where `N` = current server version and `M` = the version the caller sent. Title MUST match `VERSION_RE = /Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/`. On success, respond 200 with the bumped version.
  (AC-F1-1, AC-F1-2, F-1)
- [ ] **1.5** Implement the **v1 content-property REST** endpoints (per §8.1; adapter: `src/infra/confluence/properties.ts`; **not** jsongraphs — DEC-3):
  - `GET /wiki/rest/api/content/{pageId}/property/{key}` → 200 `{ key, value, version:{number} }` (value is a string); 404 (→ property absent).
  - `POST /wiki/rest/api/content/{pageId}/property` body `{ key, value }` — create; if the key exists → **409** (triggers the adapter's GET-version → PUT-incremented flow).
  - `PUT /wiki/rest/api/content/{pageId}/property/{key}` body `{ key, value, version:{number: currentVersion+1} }` — update; 409 on stale version.
  (AC-F1-1, F-1)
- [ ] **1.6** Implement the **v1 attachments** endpoints (per §8.1; adapter: `src/infra/confluence/attachments.ts`):
  - `POST /wiki/rest/api/content/{pageId}/child/attachment` — multipart upload (`file` + `minorEdit=true`, `X-Atlassian-Token: no-check`); response 2xx is `{ results:[{ id, title, version:{number} }] }` (the **GH-71** `results[]`-wrapped shape — even single creates). Dedup: if a file with the same hash-derived name (`marksync-mermaid-<hash>.svg` / `marksync-asset-<hash>.<ext>`) already exists → **400** with body matching `/Cannot add a new attachment with same file name/i`.
  - `GET /wiki/rest/api/content/{pageId}/child/attachment` → 200 `{ results:[{ id, title, version:{number} }] }`.
  (AC-F1-1, F-1, F-4)
- [ ] **1.7** Implement the **off-critical-path stubs** (AC-F1-1 completeness): `GET /wiki/rest/api/search?cql=...` → 200 `{ results:[] }`; `GET /wiki/rest/api/content/{pageId}/restriction` → 200 default (empty `results` → not restricted). (§8.1)
- [ ] **1.8** Confirm the obsolete `/api/jsongraphs/property-service/property` endpoint is **NOT implemented** anywhere in the mock (DEC-3); any request to it returns a 404 (so a GH-66 regression that re-targets it visibly fails the property-API scenario). (DEC-3, F-4)
- [ ] **1.9** Add the **reset mechanism** (RSK-3): either fresh `Bun.serve` per scenario or an explicit `reset()` that clears all state maps and the captured-request log. (RSK-3, NFR-CI-1)
- [ ] **1.10** Create `tests/e2e-mock/helpers.ts`: a `targetFor(origin, { logs? })` builder using `ConfluenceTarget.fromCredentials(creds(origin), spaceId, { delay: () => Promise.resolve(), log })` (the instant `delay` seam, no sleeps), plus a corpus loader. Import `ConfluenceCredentials` from `#domain/credentials` and `ConfluenceTarget` from `#infra/confluence/target`, mirroring `confluence-target.test.ts`. (F-2, NFR-CI-1)
- [ ] **1.11** Create corpus fixtures under `tests/e2e-mock/fixtures/corpus/`: small committed Markdown pages with `marksync:uuid` front-matter (3 pages for create/no-op; 1 modified page for update; 1 page with an attachment for dedup; 1 page configured for the visible provenance panel). (F-2)
- [ ] **1.12** Verify the mock's JSON responses use `Content-Type: application/json` exactly as `ConfluenceClient.parseJsonIfPossible` consumes them (RSK-4). (RSK-4)

**Acceptance Criteria**:

- Must: The mock implements every corrected endpoint in §8.1 (v2 pages create/get/put, v1 property get/post/put, v1 attachment post/get, user/by-me, search, restrictions) with status + JSON envelopes that satisfy the adapter's zod schemas (`PageV2Response`, `PropertyV1Response`, `AttachmentCreateResponse`/`AttachmentListResponse`). (AC-F1-1)
- Must: The page-PUT stale-version path returns the exact `parseConflict` 409 envelope with a title matching `VERSION_RE`. (AC-F1-1, AC-F1-2)
- Must: The duplicate-attachment path returns the 400 "same file name" signal, and create responses are `{ results: [...] }`-wrapped (GH-71 shape). (AC-F1-1, F-4)
- Must: The jsongraphs endpoint is NOT implemented. (DEC-3)
- Must: State resets per scenario; the captured-request recorder works. (RSK-3, DM-2)
- Should: The skeleton compiles and `bun run typecheck` + `bun run lint` are clean for the new files.

**Affected code areas**:

- `tests/e2e-mock/mock-confluence-server.ts` (new — stateful mock + recorder)
- `tests/e2e-mock/helpers.ts` (new — target builder + corpus loader)
- `tests/e2e-mock/fixtures/corpus/**` (new — Markdown fixtures)

**System docs to update**:

- None this phase. (A note tying the `tests/e2e-mock/` tier to `.ai/rules/testing-strategy.md` may be added in lifecycle phase 7 via `@doc-syncer`; flagged for awareness only — not required for delivery.)

**Tests**:

- `bun run typecheck`; `bun run lint` (new files only).
- Smoke: instantiate the mock, fire one request per endpoint with `fetch`, confirm status + envelope shape (ad-hoc; the real assertions land in Phases 2–4).

**Completion signal**: `test(e2e-mock): GH-81 add stateful mock Confluence server + helpers`

---

### Phase 2: Mock-409 Parse Self-Check (B)

**Goal**: Guard the highest-drift risk (RSK-1) with a unit-level self-check proving the mock's 409 conflict envelope round-trips through `parseConflict` — so the mock cannot silently drift from the real Confluence shape.

**Tasks**:

- [ ] **2.1** Create `tests/e2e-mock/mock-server-409-parse.test.ts` (TC-E2EMOCK-001). Import `parseConflict` from the pages module (same export used by the adapter) and the mock's 409-body builder. (AC-F1-2, F-1, F-4, RSK-1)
- [ ] **2.2** Case A: construct the mock 409 body with title `"...Current Version: [2]...Provided version: [1]..."`; call `parseConflict(pageId, body)`; assert the result is `err({ kind: "Conflict", baseVersion: 1, remoteVersion: 2 })` (provided version → `baseVersion`; current/server version → `remoteVersion`). (TC-E2EMOCK-001)
- [ ] **2.3** Case B: swapped numbers (caller sends 3, server has 2) → title `"...Current Version: [2]...Provided version: [3]..."` → assert `baseVersion: 3, remoteVersion: 2`. (TC-E2EMOCK-001)

**Acceptance Criteria**:

- Must: `parseConflict` extracts both version numbers from the mock's 409 body and yields `Conflict { baseVersion: M, remoteVersion: N }` with the correct mapping (provided → baseVersion, current → remoteVersion). (AC-F1-2)
- Should: The test asserts the envelope shape (`code === "CONFLICT"`) in addition to the version numbers. (RSK-1)

**Affected code areas**:

- `tests/e2e-mock/mock-server-409-parse.test.ts` (new)

**System docs to update**:

- None.

**Tests**:

- `bun test tests/e2e-mock/mock-server-409-parse.test.ts`.

**Completion signal**: `test(e2e-mock): GH-81 mock-409 parseConflict self-check`

---

### Phase 3: Mandatory Five Scenarios (C)

**Goal**: Implement the five mandatory full-pipeline scenarios (create, no-op, update, attachment dedup, provenance) that assert outcomes against `ApplyReport` counts, captured requests, and the mock's server-side state — anchoring the GH-71 unwrap regression lock.

**Tasks**:

- [ ] **3.1** Create `tests/e2e-mock/create-flow.test.ts` (TC-E2EMOCK-002, AC-F2-1, AC-F1-1, AC-4 GH-71). Fresh mock; corpus = 3 UUID'd pages (2 with attachments). Run `computePlan` then `applyPlan` (use `ensureCacheLayout` from `#app/cache` on a tmp dir, mirroring `push-flow.test.ts`). Assert `ApplyReport.writes == 3`; captured requests include 3× `POST /wiki/api/v2/pages`, 3× `POST .../property` with `key:"marksync.metadata"`, 2× `POST .../child/attachment`, 1× `GET .../user/by-me`; assert attachment ids are extracted from `results[0].id` (GH-71 unwrap class); assert mock state (3 pages, 3 properties, 2 attachments). (F-2, F-4)
- [ ] **3.2** Create `tests/e2e-mock/noop-idempotency.test.ts` (TC-E2EMOCK-003, AC-F2-2, NFR-PERF-4). Populate state with a first `applyPlan`, then run a second `applyPlan` over unchanged source. Assert `ApplyReport.writes == 0` and `skips > 0`; assert 0× of every write verb (`POST /pages`, `PUT /pages/{id}`, `POST/PUT .../property`, `POST .../child/attachment`); assert server-side state unchanged. (F-2, NFR-PERF-4)
- [ ] **3.3** Create `tests/e2e-mock/update-flow.test.ts` (TC-E2EMOCK-004, AC-F2-3). First sync creates 1 page (version 1); modify the Markdown; second `applyPlan`. Assert `ApplyReport.writes == 1`; captured `PUT /wiki/api/v2/pages/{id}` carries `version.number == 2` (= baseVersion+1); a `GET .../pages/{id}?body-format=storage` (comparison) is captured; assert the mock's server-side page version advanced 1 → 2 and the body matches the new content. (F-2)
- [ ] **3.4** Create `tests/e2e-mock/attachment-dedup.test.ts` (TC-E2EMOCK-005, AC-F2-4, AC-4 GH-71). First sync uploads an attachment; second `applyPlan` over the same asset. Assert `ApplyReport.writes == 0`; assert 0× `POST .../child/attachment` for that asset on run 2; verify the dedup path (mock 400 "same file name" or adapter hash precheck); assert the attachment's server-side id/version unchanged. (F-2, F-4)
- [ ] **3.5** Create `tests/e2e-mock/provenance-panel.test.ts` (TC-E2EMOCK-006, AC-F2-5, AC-4 GH-66). Fresh mock; 1 page configured for the visible provenance panel. Run `applyPlan`; assert the captured create/update page body contains the visible provenance panel (the `{info}` macro / `marksync.metadata` content); assert the mock's server-side page body reflects the panel. (F-2, F-4)
- [ ] **3.6** In every scenario, use the instant `delay` seam and a fresh mock (or explicit `reset()`) so no sleeps and no cross-scenario leakage occur (RSK-3, NFR-CI-1). (RSK-3, NFR-CI-1)
- [ ] **3.7** For each scenario, if a genuine adapter bug is observed (assertions fail for reasons other than a test/mock defect), **STOP and escalate to the PM** — do NOT edit `src/**` (RSK-5). Record the finding in the Execution Log. (RSK-5)

**Acceptance Criteria**:

- Must: All five scenarios pass; `ApplyReport.writes` counts match expectations; captured-request sequences match the expected pipeline order; mock server-side state advances/holds as specified. (AC-F2-1, AC-F2-2, AC-F2-3, AC-F2-4, AC-F2-5)
- Must: GH-71 unwrap is asserted (attachment ids read from `results[0].id`) and dedup holds (no re-upload on run 2). (AC-4, F-4)
- Should: Each scenario's runtime is tracked (collectively contributing to the ≤ 60 s budget, NFR-CI-1).

**Affected code areas**:

- `tests/e2e-mock/create-flow.test.ts` (new)
- `tests/e2e-mock/noop-idempotency.test.ts` (new)
- `tests/e2e-mock/update-flow.test.ts` (new)
- `tests/e2e-mock/attachment-dedup.test.ts` (new)
- `tests/e2e-mock/provenance-panel.test.ts` (new)

**System docs to update**:

- None this phase.

**Tests**:

- `bun test tests/e2e-mock/create-flow.test.ts tests/e2e-mock/noop-idempotency.test.ts tests/e2e-mock/update-flow.test.ts tests/e2e-mock/attachment-dedup.test.ts tests/e2e-mock/provenance-panel.test.ts`.

**Completion signal**: `test(e2e-mock): GH-81 mandatory five full-pipeline scenarios`

---

### Phase 4: Property-API Regression Scenario (D)

**Goal**: Add the dedicated property-API regression scenario covering the v1 content-property create → 409 → GET → PUT flow and asserting the obsolete jsongraphs endpoint is never called — anchoring the GH-66 regression lock where it is not already covered by the create scenario.

**Tasks**:

- [ ] **4.1** Create `tests/e2e-mock/property-api-flow.test.ts` (TC-E2EMOCK-008, AC-F2-1, AC-4 GH-66). Fresh mock; 1 UUID'd page. Run `computePlan` + `applyPlan`. Assert the captured request sequence exercises the v1 content-property flow: `POST /wiki/rest/api/content/{pageId}/property` (attempt create) → mock 409 → adapter `GET .../property/{key}` (fetch current version) → adapter `PUT .../property/{key}` carrying `{ value, version:{ number: currentVersion+1 } }`. (F-2, F-4)
- [ ] **4.2** Assert the `/api/jsongraphs/property-service/property` endpoint is **never** requested across the whole scenario (DEC-3) — proving a GH-66 regression that re-targets jsongraphs fails this scenario. (DEC-3, F-4)
- [ ] **4.3** Assert the property is successfully set in the mock's server-side state (`marksync.metadata` present with the expected value/version). (F-2)
- [ ] **4.4** If a genuine adapter bug is observed, **STOP and escalate to the PM** — do NOT edit `src/**` (RSK-5). (RSK-5)

**Acceptance Criteria**:

- Must: The v1 content-property POST-409 → GET → PUT flow is captured in the correct order with the PUT carrying the incremented version number. (AC-F2-1, F-2)
- Must: The jsongraphs endpoint is never called. (DEC-3, AC-4 GH-66)
- Should: The PUT body's `version.number == currentVersion + 1` is asserted. (F-2)

**Affected code areas**:

- `tests/e2e-mock/property-api-flow.test.ts` (new)

**System docs to update**:

- None this phase.

**Tests**:

- `bun test tests/e2e-mock/property-api-flow.test.ts`.

**Completion signal**: `test(e2e-mock): GH-81 v1 property-API regression scenario (GH-66)`

---

### Phase 5: Mandatory Secrets-Free CI Job (E)

**Goal**: Wire the `tests/e2e-mock/` suite into the fast CI loop as a mandatory `e2e-mock` job requiring zero secrets, so a mock-tier failure fails the PR — independent of the opt-in live-sandbox tier.

**Tasks**:

- [ ] **5.1** Add a new `e2e-mock` job to `.github/workflows/ci.yml` (alongside, NOT inside, the existing `fast-loop` job). Steps: checkout, `oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, then `bun test tests/e2e-mock/`. Match the `fast-loop` job's pinned Bun matrix (`bun-version: ["1.2.23"]`, `os: [ubuntu-latest]`) and `on: [push: main, pull_request: main]` triggers. (AC-3, NFR-CI-2, F-3, G-3)
- [ ] **5.2** Verify the `e2e-mock` job references **zero** `secrets.*` anywhere (no `env:`, no step `env:`). The mock is in-process; nothing is required. (NFR-CI-2)
- [ ] **5.3** Confirm `run-e2e.yml` is **NOT** touched (DEC-2) and the job is NOT added there. (DEC-2, NG-3)

**Acceptance Criteria**:

- Must: A job named `e2e-mock` exists in `.github/workflows/ci.yml`, runs `bun test tests/e2e-mock/`, and is mandatory on push/PR to `main`. (AC-3)
- Must: The job has no `secrets.*` references (0 secrets). (NFR-CI-2)
- Must: The pinned Bun version matches the fast loop (`1.2.23`). (Constraints)
- Must: `run-e2e.yml` and `tests/e2e/` are unchanged. (DEC-2)

**Affected code areas**:

- `.github/workflows/ci.yml` (updated — new `e2e-mock` job)

**System docs to update**:

- None this phase. (A one-line note in `.ai/rules/testing-strategy.md` describing the `tests/e2e-mock/` tier is optional and handled in lifecycle phase 7 via `@doc-syncer` if the human requests it; flagged for awareness only.)

**Tests**:

- Local: run the suite exactly as the job will: `bun test tests/e2e-mock/` with no env/secrets set.
- Manual review (TC-E2EMOCK-007): confirm the job is present, mandatory, secrets-free, and pinned to the same Bun as the fast loop.

**Completion signal**: `ci(e2e-mock): GH-81 add mandatory secrets-free e2e-mock job to fast loop`

---

### Phase 6: Local Verification, Spec Reconciliation, Finalize (F)

**Goal**: Prove the whole change is green locally, reconcile docs where needed, and finalize. (Per `version_impact: none`, there is no version bump.)

**Tasks**:

- [ ] **6.1** Run the new suite: `bun test tests/e2e-mock/` — all scenarios (TC-E2EMOCK-001..006, 008) green; confirm total runtime ≤ 60 s (NFR-CI-1). (NFR-CI-1)
- [ ] **6.2** Run the fast-loop quality gates the `e2e-mock` job must coexist with: `bun run lint`, `bun run typecheck`, `bun test tests/unit/ tests/integration/ tests/golden/`, `bun run check:boundaries` (`depcruise src` — only cruises `src/`, so it is a no-op guard for `tests/**` but must stay green). (Constraints)
- [ ] **6.3** Run `bun run check` (the full local gate) and confirm the full fast loop still passes — no regressions from the additive tier/CI change. (G-5)
- [ ] **6.4** Verify the production-source guardrail: `git diff --stat main -- src/` shows **zero** changed files under `src/**` (DEC-1). If any `src/**` file appears, **STOP and escalate to the PM** — it is out of scope. (DEC-1, G-5)
- [ ] **6.5** Spec reconciliation: confirm no system-spec reconciliation is required for delivery (`version_impact: none`; this change adds test infra + one CI job). If `@doc-syncer` (lifecycle phase 7) wishes to note the `tests/e2e-mock/` tier in `.ai/rules/testing-strategy.md`, that is optional and handled there — not blocking. (§22)
- [ ] **6.6** (No version bump — `version_impact: none`.) Confirm `package.json#version` is unchanged. (§15 version_impact)

**Acceptance Criteria**:

- Must: `bun test tests/e2e-mock/` green in ≤ 60 s; `lint`, `typecheck`, `bun run check:boundaries`, and the full fast loop all green with no regressions. (NFR-CI-1, G-5)
- Must: `git diff --stat main -- src/` is empty (zero production changes, DEC-1). (G-5, DEC-1)
- Must: All mandatory ACs satisfied (AC-F1-1, AC-F1-2, AC-F2-1..5, AC-3, AC-4). (§17)
- Must: Stretch scenarios (AC-F2-6) are explicitly deferred, not implemented. (AC-F2-6, OQ-1)
- Should: The PR description surfaces DEC-1 (programmatic e2e vs. CLI binary) and Option A as a deferred follow-up (OQ-2). (OQ-2)

**Affected code areas**:

- None (verification + finalize phase).

**System docs to update**:

- None required for delivery. Optional note in `.ai/rules/testing-strategy.md` about the `tests/e2e-mock/` tier deferred to lifecycle phase 7 (`@doc-syncer`). (§22)

**Tests**:

- `bun test tests/e2e-mock/`; `bun run lint`; `bun run typecheck`; `bun run check:boundaries`; `bun run check` (full gate).
- `git diff --stat main -- src/` → empty.

**Completion signal**: `test(e2e-mock): GH-81 verification + finalize (0 src changes, full gate green)`

---

## Test Scenarios

| TC ID | Scenario | File | Phases | AC / NFR |
|-------|----------|------|--------|----------|
| TC-E2EMOCK-001 | Mock-409 Parse Self-Check | `tests/e2e-mock/mock-server-409-parse.test.ts` | 2, 6 | AC-F1-2, RSK-1 |
| TC-E2EMOCK-002 | Create Flow — Pages with Properties and Attachments (GH-71 unwrap) | `tests/e2e-mock/create-flow.test.ts` | 3, 6 | AC-F2-1, AC-F1-1, AC-4 (GH-71) |
| TC-E2EMOCK-003 | No-Op Idempotency — Second Run Zero Writes | `tests/e2e-mock/noop-idempotency.test.ts` | 3, 6 | AC-F2-2, NFR-PERF-4 |
| TC-E2EMOCK-004 | Update Flow — Version Bump and Server State Advance | `tests/e2e-mock/update-flow.test.ts` | 3, 6 | AC-F2-3 |
| TC-E2EMOCK-005 | Attachment Deduplication — No Re-upload on Duplicate (GH-71) | `tests/e2e-mock/attachment-dedup.test.ts` | 3, 6 | AC-F2-4, AC-4 (GH-71) |
| TC-E2EMOCK-006 | Provenance Panel — Visible in Body (GH-66) | `tests/e2e-mock/provenance-panel.test.ts` | 3, 6 | AC-F2-5, AC-4 (GH-66) |
| TC-E2EMOCK-007 | CI Job Verification — `e2e-mock` Present and Secrets-Free | `.github/workflows/ci.yml` | 5, 6 | AC-3, NFR-CI-1/2 |
| TC-E2EMOCK-008 | Property API Flow — v1 create→409→GET→PUT, no jsongraphs (GH-66) | `tests/e2e-mock/property-api-flow.test.ts` | 4, 6 | AC-F2-1, AC-4 (GH-66) |
| — | Stretch scenarios (conflict recovery, Mermaid determinism, HTML-comment strip, UUID-less warning) | — | Deferred | AC-F2-6 (deferred per spec §7.3 / OQ-1) |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-81-spec.md | Spec |
| Test plan | ./chg-GH-81-test-plan.md | Test Plan |
| Implementation plan | ./chg-GH-81-plan.md | Plan |
| PM notes | ./chg-GH-81-pm-notes.yaml | Notes (DEC-1/2/3) |
| Testing strategy | .ai/rules/testing-strategy.md | Rule (tier model) |
| CI workflow (updated) | .github/workflows/ci.yml | CI (new `e2e-mock` job) |
| CI workflow (NOT touched) | .github/workflows/run-e2e.yml | CI (live-sandbox tier — unchanged, DEC-2) |
| Mock server | tests/e2e-mock/mock-confluence-server.ts | Test infra (new) |
| Test helpers | tests/e2e-mock/helpers.ts | Test infra (new) |
| Corpus fixtures | tests/e2e-mock/fixtures/corpus/ | Fixtures (new) |
| 409 self-check | tests/e2e-mock/mock-server-409-parse.test.ts | Test (new) |
| Mandatory scenarios | tests/e2e-mock/{create-flow,noop-idempotency,update-flow,attachment-dedup,provenance-panel}.test.ts | Tests (new) |
| Property-API scenario | tests/e2e-mock/property-api-flow.test.ts | Test (new) |
| Established pattern (mirror) | tests/integration/confluence/confluence-target.test.ts | Reference |
| Pipeline entrypoints (mirror) | tests/integration/confluence/push-flow.test.ts | Reference |
| 409 conflict parser | src/infra/confluence/pages.ts (`parseConflict` / `VERSION_RE`) | Reference (read-only, DEC-1) |
| Production source | src/** | **Unchanged (DEC-1)** |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | plan-writer | Initial plan for GH-81. 6 commit-sized phases (A–F): mock skeleton + helpers, mock-409 self-check, 5 mandatory scenarios, property-API regression scenario, mandatory secrets-free CI job, verification + finalize. Enforces DEC-1 (0 `src/**` changes; STOP+escalate adapter bugs to PM), DEC-2 (`tests/e2e-mock/` only), DEC-3 (corrected endpoints; no jsongraphs). Traced to TC-E2EMOCK-001..008 and AC-F1-1/2, AC-F2-1..6, AC-3, AC-4. Helper module named `mock-confluence-server.ts` (reconciled vs. test-plan §7 `mock-server.ts` — non-contract naming, see OQ-P1). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 — Mock skeleton + helpers | Not started | — | — | — | — |
| 2 — Mock-409 self-check | Not started | — | — | — | — |
| 3 — Mandatory five scenarios | Not started | — | — | — | — |
| 4 — Property-API scenario | Not started | — | — | — | — |
| 5 — CI job `e2e-mock` | Not started | — | — | — | — |
| 6 — Verification + finalize | Not started | — | — | — | — |
