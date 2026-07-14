---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-81-test-plan
status: Proposed
created: 2026-07-15T00:00:00Z
last_updated: 2026-07-15T00:00:00Z
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["test", "MS-0002", "priority:high", "ci"]
version_impact: none
summary: "Add a reusable, stateful mock Confluence HTTP server and full-pipeline e2e scenario suite wired as a mandatory, secrets-free CI job to catch HTTP adapter regressions (GH-71 attachment-unwrap, GH-66 property-API class)."
links:
  change_spec: ./chg-GH-81-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Mock Confluence HTTP Server for CI E2E Regression Tests

## 1. Scope and Objectives

This test plan defines a new secrets-free e2e mock tier (`tests/e2e-mock/`) that exercises the full MarkSync sync pipeline against a stateful in-process mock Confluence server. The primary objective is to catch HTTP adapter regressions (particularly the GH-71 `{ results: [...] }` unwrap bug class and the GH-66 property-API endpoint/shape bug class) in the mandatory CI loop without requiring live Confluence secrets. The suite validates that the mock implements the corrected endpoint list from spec §8.1, that scenarios cover the critical pipeline paths (create, no-op idempotency, update, attachment dedup, provenance panel), and that the CI job is mandatory and secrets-free.

### 1.1 In Scope

- Stateful mock Confluence HTTP server implementing the corrected endpoint list (v2 pages, v1 properties, v1 attachments, user/by-me, search, restrictions)
- Full-pipeline e2e scenario suite running `computePlan` + `applyPlan` against the mock via `ConfluenceTarget.fromCredentials` (DEC-1)
- Mock-409 conflict envelope self-check ensuring the mock's response round-trips through `parseConflict` (AC-F1-2)
- Mandatory CI job `e2e-mock` in `.github/workflows/ci.yml` requiring 0 secrets (AC-3, NFR-CI-2)
- Regression-injection assertions proving GH-71 and GH-66 bug classes are caught by the suite (AC-4)
- Deterministic state reset per scenario (fresh `Bun.serve` or explicit reset) to prevent flakiness (RSK-3)

### 1.2 Out of Scope & Known Gaps

- CLI-binary invocation / spawning the compiled `marksync` binary (Option A deferred per DEC-1)
- Coverage of `resolveCredentials` / CLI argument shell (stays covered by unit/integration tests)
- Changes to `run-e2e.yml` or the live-sandbox tier (`tests/e2e/`)
- Stretch scenarios (conflict recovery per ADR-0006 C-5/C-6, Mermaid determinism, HTML-comment strip per GH-77, UUID-less warning per GH-74) — deferred per AC-F2-6
- Production bug fixing — if the e2e reveals a genuine adapter bug, it is escalated as a separate change (§7.2)

## 2. References

- **Change Specification**: [chg-GH-81-spec.md](./chg-GH-81-spec.md) — authoritative endpoint list (§8.1), ACs, risks, and DEC-1/2/3
- **PM Notes**: [chg-GH-81-pm-notes.yaml](./chg-GH-81-pm-notes.yaml) — DEC-1 (Option B), DEC-2 (separate tier), DEC-3 (corrected endpoints)
- **Testing Strategy**: [.ai/rules/testing-strategy.md](.ai/rules/testing-strategy.md) — test tiers, over-mocking guardrail (adapter boundaries allowed), CI wiring patterns
- **ADR-0006**: [doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) — 409 conflict recovery (C-5/C-6) anchoring stretch scenarios
- **Integration Test Pattern**: [tests/integration/confluence/confluence-target.test.ts](../../../tests/integration/confluence/confluence-target.test.ts) — established `Bun.serve` + `ConfluenceTarget.fromCredentials` pattern to mirror
- **Nonfunctional Requirements**: [doc/spec/nonfunctional.md](../../spec/nonfunctional.md) — NFR-PERF-4 (idempotent rerun), NFR-CI-1/2 (deterministic CI runtime, secrets-free)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Mock implements corrected endpoints with proper response envelopes (v2 pages, v1 properties, v1 attachments, user/by-me, search, restrictions) | TC-E2EMOCK-002, TC-E2EMOCK-003, TC-E2EMOCK-004, TC-E2EMOCK-005, TC-E2EMOCK-006, TC-E2EMOCK-008 | Covered |
| AC-F1-2 | Mock's 409 conflict body round-trips through `parseConflict` (RSK-1 self-check) | TC-E2EMOCK-001 | Covered |
| AC-F2-1 | Create flow: pages created, `marksync.metadata` property set, attachments uploaded | TC-E2EMOCK-002, TC-E2EMOCK-008 | Covered |
| AC-F2-2 | No-op idempotency: second `applyPlan` performs 0 writes (NFR-PERF-4) | TC-E2EMOCK-003 | Covered |
| AC-F2-3 | Update flow: `PUT /wiki/api/v2/pages/{id}` with version bump, server version advances | TC-E2EMOCK-004 | Covered |
| AC-F2-4 | Attachment dedup: duplicate resolved idempotently, not re-uploaded | TC-E2EMOCK-005 | Covered |
| AC-F2-5 | Provenance panel visible in body sent to mock | TC-E2EMOCK-006 | Covered |
| AC-F2-6 | Stretch scenarios (conflict recovery, Mermaid determinism, HTML-comment strip, UUID-less warning) | Deferred | Deferred per spec §7.3 |
| AC-3 | CI job `e2e-mock` exists, is mandatory, and requires no secrets | TC-E2EMOCK-007 | Covered |
| AC-4 | GH-71 attachment-unwrap regression caught; GH-66 property-API regression caught | TC-E2EMOCK-002 (GH-71), TC-E2EMOCK-005 (GH-71), TC-E2EMOCK-006 (GH-66), TC-E2EMOCK-008 (GH-66) | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Element | TC ID(s) | Coverage Notes |
|--------------|---------|----------|----------------|
| API-F1-1 | `POST /wiki/api/v2/pages` — create | TC-E2EMOCK-002 | Captured in create flow |
| API-F1-2 | `GET /wiki/api/v2/pages/{id}?body-format=storage` — get | TC-E2EMOCK-002, TC-E2EMOCK-004 | Captured in create/update flows |
| API-F1-3 | `PUT /wiki/api/v2/pages/{id}` — update with 409 conflict envelope | TC-E2EMOCK-004, TC-E2EMOCK-001 | 409 envelope validated in self-check |
| API-F1-4 | `GET /wiki/rest/api/content/{pageId}/property/{key}` — get property | TC-E2EMOCK-002, TC-E2EMOCK-006, TC-E2EMOCK-008 | Captured in property flows |
| API-F1-5 | `POST /wiki/rest/api/content/{pageId}/property` — create property (409 on duplicate) | TC-E2EMOCK-002, TC-E2EMOCK-008 | 409→GET→PUT flow exercised |
| API-F1-6 | `PUT /wiki/rest/api/content/{pageId}/property/{key}` — update property | TC-E2EMOCK-008 | Version bump asserted |
| API-F1-7 | `POST /wiki/rest/api/content/{pageId}/child/attachment` — multipart upload (GH-71 `{ results: [...] }` shape) | TC-E2EMOCK-002, TC-E2EMOCK-005 | GH-71 unwrap class asserted |
| API-F1-8 | `GET /wiki/rest/api/content/{pageId}/child/attachment` — list attachments | TC-E2EMOCK-002, TC-E2EMOCK-005 | Captured in dedup flow |
| API-F1-9 | `GET /wiki/api/v2/user/by-me` — credential validation | TC-E2EMOCK-002 | Captured (not on e2e critical path) |
| API-F1-10 | `GET /wiki/rest/api/search?cql=...` — search (stub) | TC-E2EMOCK-002 | Stubbed (returns empty) |
| API-F1-11 | `GET /wiki/rest/api/content/{pageId}/restriction` — restrictions (stub) | TC-E2EMOCK-002 | Stubbed (default permitted) |
| DM-1 | In-memory mock state model (pages, properties, attachments) | All scenarios | State reset per scenario asserted |
| DM-2 | Captured-request log (method, path, Authorization, body) | All scenarios | Used for assertions |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Coverage Notes |
|--------|-------------|----------|----------------|
| NFR-PERF-4 | Idempotent rerun (0 writes on second unchanged `applyPlan`) | TC-E2EMOCK-003 | Directly asserted |
| NFR-MAINT-1 | Adapter isolation preserved (mock targets only `ConfluenceClient` URL surface) | All scenarios | No production code changed |
| NFR-MAINT-2 | No over-build vs. existing integration tier (no adapter-call-level duplication) | TC-E2EMOCK-001–008 | Full-pipeline focus, not per-call |
| NFR-CI-1 | Deterministic CI runtime (≤ 60 s) | TC-E2EMOCK-007 | Suite timing verified |
| NFR-CI-2 | Mandatory + secrets-free | TC-E2EMOCK-007 | CI job configuration validated |

## 4. Test Types and Layers

This change introduces a **new test tier** to the testing strategy model: **E2E-Mock** (distinct from the existing Integration and E2E-Live tiers).

| Test Type / Layer | Framework | Root Directory | Pattern | Notes |
|-------------------|-----------|----------------|---------|-------|
| **Unit** | `bun:test` | `tests/unit/` | `*.test.ts` | NOT in scope for this change (existing) |
| **Integration** | `bun:test` + `Bun.serve` | `tests/integration/` | `*.test.ts` | NOT in scope (existing adapter-call-level coverage) |
| **Golden fixture** | `bun:test` | `tests/golden/` | `*.test.ts` | NOT in scope (existing) |
| **BDD/Gherkin** | `@cucumber/cucumber` | `tests/bdd/` | `*.feature` | NOT in scope (existing lifecycle invariants) |
| **E2E-Mock** (NEW) | `bun:test` + `Bun.serve` | `tests/e2e-mock/` | `*.test.ts` | Stateful reusable mock; full-pipeline scenarios; CI-gated |
| **E2E-Live** | Thin runner script | `tests/e2e/` | `*.test.ts` | Live-sandbox tier; NOT changed |

**E2E-Mock tier characteristics:**
- Uses `Bun.serve({ port: 0 })` for ephemeral in-process HTTP mocking
- Scenarios call `computePlan` + `applyPlan` against `ConfluenceTarget.fromCredentials` constructed directly (DEC-1)
- Mock tracks server-side state (pages, properties, attachments) and captured requests across the full sync
- State reset per scenario (fresh server or explicit reset) for determinism (RSK-3)
- CI job runs `bun test tests/e2e-mock/` with 0 secrets (NFR-CI-2)

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-E2EMOCK-001 | Mock-409 Parse Self-Check | Regression | Critical | High | AC-F1-2 |
| TC-E2EMOCK-002 | Create Flow - Pages with Properties and Attachments | Happy Path | Critical | High | AC-F2-1, AC-F1-1, AC-4 (GH-71) |
| TC-E2EMOCK-003 | No-Op Idempotency - Second Run Zero Writes | Edge Case | Important | High | AC-F2-2, NFR-PERF-4 |
| TC-E2EMOCK-004 | Update Flow - Version Bump and Server State Advance | Happy Path | Important | High | AC-F2-3 |
| TC-E2EMOCK-005 | Attachment Deduplication - No Re-upload on Duplicate | Edge Case | Important | High | AC-F2-4, AC-4 (GH-71) |
| TC-E2EMOCK-006 | Provenance Panel - Visible in Body | Happy Path | Important | High | AC-F2-5, AC-4 (GH-66) |
| TC-E2EMOCK-007 | CI Job Verification - e2e-mock Job Present and Secrets-Free | Regression | Critical | High | AC-3, NFR-CI-1/2 |
| TC-E2EMOCK-008 | Property API Flow - GH-66 Regression Check | Regression | Critical | High | AC-F2-1, AC-4 (GH-66) |

**Deferred stretch scenarios** (per AC-F2-6):
- Conflict recovery per ADR-0006 C-5/C-6 (409→re-fetch→retry)
- Mermaid determinism (ADR-0002 C-1)
- HTML-comment strip (GH-77)
- UUID-less warning (GH-74)

### 5.2 Scenario Details

#### TC-E2EMOCK-001 - Mock-409 Parse Self-Check

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-2, F-1, F-4, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/mock-server-409-parse.test.ts`
**Tags**: @backend, @mock, @regression

**Preconditions**:
- Mock server is instantiated
- Mock generates a 409 conflict response for a stale page version

**Steps**:
1. Construct a mock 409 conflict response body with the exact envelope: `{ errors: [{ code: "CONFLICT", title: "...Current Version: [2]...Provided version: [1]..." }] }`
2. Invoke `parseConflict` with the mock's 409 response body
3. Assert the returned `Conflict` object has `baseVersion: 1` and `remoteVersion: 2`
4. Repeat with swapped version numbers (caller sends 3, server has 2) and assert `baseVersion: 3`, `remoteVersion: 2`

**Expected Outcome**:
- `parseConflict` successfully extracts version numbers from the mock's 409 body
- The mock's conflict envelope is proven to match the real Confluence shape (RSK-1 mitigation)

**Notes / Clarifications**:
- This is a unit-level self-check guarding the highest-drift risk (RSK-1)
- The mock must reproduce the verbatim title form already proven in the integration tier: `VERSION_RE = /Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/`

---

#### TC-E2EMOCK-002 - Create Flow - Pages with Properties and Attachments

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-F1-1, AC-4 (GH-71), F-2, F-4
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/create-flow.test.ts`
**Tags**: @backend, @e2e-mock, @happy-path, @regression

**Preconditions**:
- Fresh mock server instance (state reset)
- Committed Markdown corpus with 3 pages containing `marksync:uuid` front-matter
- 2 pages have attachments (one Mermaid diagram, one image)
- 1 page has no attachments

**Steps**:
1. Construct `ConfluenceTarget.fromCredentials` with mock's loopback origin
2. Invoke `computePlan` over the corpus
3. Invoke `applyPlan` with the computed plan
4. Assert `ApplyReport.writes == 3` (3 pages created)
5. Assert captured requests include:
   - 3× `POST /wiki/api/v2/pages` (one per page)
   - 3× `POST /wiki/rest/api/content/{pageId}/property` with `key: "marksync.metadata"`
   - 2× `POST /wiki/rest/api/content/{pageId}/child/attachment` (multipart uploads)
   - 1× `GET /wiki/api/v2/user/by-me` (credential validation)
6. Assert the attachment create responses are consumed through the `{ results: [...] }` unwrap path (GH-71 class) — verify the attachment IDs are extracted from `results[0].id`
7. Assert mock's server-side state: 3 pages stored, 3 properties set, 2 attachments tracked

**Expected Outcome**:
- All pages, properties, and attachments are successfully created
- Attachment create responses correctly unwrap the `{ results: [...] }` envelope (catching GH-71 bug class if reintroduced)
- Captured request log matches the expected sequence and counts

**Notes / Clarifications**:
- This scenario directly tests the GH-71 regression class (attachment unwrap bug)
- The corpus fixtures are committed under `tests/e2e-mock/fixtures/corpus/create-flow/`

---

#### TC-E2EMOCK-003 - No-Op Idempotency - Second Run Zero Writes

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-2, NFR-PERF-4, F-2
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/noop-idempotency.test.ts`
**Tags**: @backend, @e2e-mock, @edge-case, @performance

**Preconditions**:
- Mock server state populated by a first `applyPlan` (same corpus as TC-E2EMOCK-002)
- Source Markdown is unchanged

**Steps**:
1. Invoke `computePlan` over the unchanged corpus
2. Invoke `applyPlan` with the computed plan
3. Assert `ApplyReport.writes == 0`
4. Assert `ApplyReport.skips > 0` (entries classified as NoOp)
5. Assert captured requests contain NO write operations:
   - 0× `POST /wiki/api/v2/pages`
   - 0× `PUT /wiki/api/v2/pages/{id}`
   - 0× `POST /wiki/rest/api/content/{pageId}/property`
   - 0× `PUT /wiki/rest/api/content/{pageId}/property/{key}`
   - 0× `POST /wiki/rest/api/content/{pageId}/child/attachment`
6. Assert mock's server-side state is unchanged (page versions, property values, attachment versions match post-first-run state)

**Expected Outcome**:
- Second unchanged `applyPlan` performs 0 writes (satisfies NFR-PERF-4)
- All entries are correctly classified as NoOp
- No unnecessary API calls are made to the mock

**Notes / Clarifications**:
- This scenario validates the core idempotency guarantee of the sync pipeline
- Timing is tracked to ensure the suite stays under NFR-CI-1 (≤ 60 s)

---

#### TC-E2EMOCK-004 - Update Flow - Version Bump and Server State Advance

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-3, AC-F1-1, F-2
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/update-flow.test.ts`
**Tags**: @backend, @e2e-mock, @happy-path

**Preconditions**:
- Mock server state populated by a first `applyPlan` (1 page with version 1)
- Source Markdown is modified (title or body change)

**Steps**:
1. Invoke `computePlan` over the modified corpus
2. Invoke `applyPlan` with the computed plan
3. Assert `ApplyReport.writes == 1` (1 page updated)
4. Assert captured requests include:
   - 1× `PUT /wiki/api/v2/pages/{id}` with body carrying `version.number: 2`
   - 1× `GET /wiki/api/v2/pages/{id}?body-format=storage` (for comparison)
5. Assert the mock's server-side page version advanced from 1 to 2
6. Assert the page body in the mock's state matches the new Markdown content

**Expected Outcome**:
- Page is updated with correct version bump
- Server-side state advances as expected
- The PUT request carries the correct `version.number = baseVersion + 1`

**Notes / Clarifications**:
- This scenario does NOT test 409 conflict recovery (deferred stretch scenario)
- Focus is on the happy-path update flow with version bump

---

#### TC-E2EMOCK-005 - Attachment Deduplication - No Re-upload on Duplicate

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-4, AC-4 (GH-71), F-2, F-4
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/attachment-dedup.test.ts`
**Tags**: @backend, @e2e-mock, @edge-case, @regression

**Preconditions**:
- Mock server state populated by a first `applyPlan` (1 page with 1 attachment uploaded)
- Source Markdown is unchanged (same attachment hash)

**Steps**:
1. Invoke `computePlan` over the unchanged corpus
2. Invoke `applyPlan` with the computed plan
3. Assert `ApplyReport.writes == 0` (no new attachment upload)
4. Assert captured requests on second run contain NO attachment upload:
   - 0× `POST /wiki/rest/api/content/{pageId}/child/attachment`
5. Assert mock's server-side attachment state is unchanged (same attachment ID, version unchanged)
6. (Optional) Verify the mock's dedup path: if attachment upload attempted, mock returns 400 "same file name" or adapter pre-checks hash

**Expected Outcome**:
- Duplicate attachment is resolved idempotently
- No re-upload occurs (catching GH-71 unwrap class if dedup path mishandles `{ results: [...] }`)
- Attachment remains at the correct server-side version

**Notes / Clarifications**:
- This scenario validates attachment deduplication, which depends on the GH-71 unwrap class working correctly
- The dedup signal is either a mock 400 "same file name" or a hash precheck in the adapter

---

#### TC-E2EMOCK-006 - Provenance Panel - Visible in Body

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-5, AC-4 (GH-66), F-2, F-4
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/provenance-panel.test.ts`
**Tags**: @backend, @e2e-mock, @happy-path, @regression

**Preconditions**:
- Fresh mock server instance (state reset)
- Committed Markdown corpus with 1 page configured for visible provenance panel

**Steps**:
1. Invoke `computePlan` over the corpus
2. Invoke `applyPlan` with the computed plan
3. Assert captured `POST /wiki/api/v2/pages` request body contains the visible provenance panel:
   - Storage body includes `{info}` macro with provenance metadata
   - OR `marksync.metadata` content is reflected in the visible panel format
4. Assert the mock's server-side page body includes the provenance panel content

**Expected Outcome**:
- Provenance panel is present in the body sent to the mock
- The property `marksync.metadata` is correctly rendered as a visible panel (catching GH-66 property-API class if wrong endpoint/shape)

**Notes / Clarifications**:
- This scenario tests the GH-66 regression class (property-API endpoint/shape)
- The exact visible format depends on the provenance panel implementation (deferred to implementation)

---

#### TC-E2EMOCK-007 - CI Job Verification - e2e-mock Job Present and Secrets-Free

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-3, NFR-CI-1/2, F-3, G-3
**Test Type(s)**: Manual / CI-Config
**Automation Level**: Semi-automated (CI config validation)
**Target Layer / Location**: `.github/workflows/ci.yml`
**Tags**: @ci, @regression

**Preconditions**:
- CI workflow file is present at `.github/workflows/ci.yml`

**Steps**:
1. Read `.github/workflows/ci.yml`
2. Assert a job named `e2e-mock` exists
3. Assert the `e2e-mock` job runs `bun test tests/e2e-mock/`
4. Assert the `e2e-mock` job has NO dependency on secrets (no `secrets.*` references in env or steps)
5. Assert the `e2e-mock` job uses the same pinned Bun version as the fast loop
6. Assert the `e2e-mock` job runs alongside (not inside) the existing `Test` step
7. (Optional) Time the suite execution locally and assert it completes ≤ 60 s (NFR-CI-1)

**Expected Outcome**:
- The `e2e-mock` job is present in the fast CI loop
- The job requires 0 secrets (satisfies NFR-CI-2)
- The job runs the mock tier independently

**Notes / Clarifications**:
- This is a CI configuration validation scenario
- The job must NOT be added to `run-e2e.yml` (separate tier per DEC-2)

---

#### TC-E2EMOCK-008 - Property API Flow - GH-66 Regression Check

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-4 (GH-66), F-2, F-4
**Test Type(s)**: E2E-Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/property-api-flow.test.ts`
**Tags**: @backend, @e2e-mock, @regression

**Preconditions**:
- Fresh mock server instance (state reset)
- Committed Markdown corpus with 1 page

**Steps**:
1. Invoke `computePlan` over the corpus
2. Invoke `applyPlan` with the computed plan
3. Assert captured requests include the correct v1 content-property REST flow:
   - First `POST /wiki/rest/api/content/{pageId}/property` (attempt create)
   - Mock returns 409 (property already exists)
   - Adapter re-fetches with `GET /wiki/rest/api/content/{pageId}/property/{key}` to get current version
   - Adapter retries with `PUT /wiki/rest/api/content/{pageId}/property/{key}` carrying incremented version
4. Assert the `/api/jsongraphs/property-service/property` endpoint is NOT called (GH-66 removed this endpoint)
5. Assert the property is successfully set in the mock's server-side state

**Expected Outcome**:
- The v1 content-property REST flow is correctly exercised (POST-409→GET→PUT)
- The obsolete jsongraphs endpoint is NOT called (catching GH-66 bug class if reintroduced)
- Property is successfully set

**Notes / Clarifications**:
- This scenario directly tests the GH-66 regression class (wrong property-API endpoint/shape)
- The mock must NOT implement the jsongraphs endpoint (per DEC-3)

---

## 6. Environments and Test Data

### 6.1 Required Environments

| Environment | Purpose | Setup |
|-------------|---------|-------|
| **Local development** | Scenario development and debugging | Bun runtime, no external dependencies |
| **CI (GitHub Actions)** | Mandatory regression gate on every PR | Fast loop job `e2e-mock` in `ci.yml`, 0 secrets required |

### 6.2 Test Data Generation and Cleanup

- **Markdown corpus fixtures**: Committed under `tests/e2e-mock/fixtures/corpus/` with `marksync:uuid` front-matter
- **Mock server state**: In-memory `Map<pageId, PageState>` with property and attachment maps; reset per scenario (fresh `Bun.serve` or explicit reset)
- **Captured requests**: Append-only `CapturedRequest[]` (method, path, Authorization present, body); cleared per scenario
- **Isolation strategy**: Each scenario instantiates a fresh mock server on an ephemeral port (`Bun.serve({ port: 0 })`) to prevent state leakage (RSK-3 mitigation)

### 6.3 Determinism Guarantees

- **No sleeps**: Use the instant `delay` seam (mock returns immediately) to keep CI fast (NFR-CI-1)
- **No randomness**: All IDs and versions are deterministic (server-assigned IDs increment, version numbers follow the `baseVersion + 1` rule)
- **State reset**: Per-scenario reset ensures no cross-test contamination

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-E2EMOCK-001 | `tests/e2e-mock/mock-server-409-parse.test.ts` | `bun test tests/e2e-mock/mock-server-409-parse.test.ts` | Mock server instantiated, 409 response body constructed | To Implement |
| TC-E2EMOCK-002 | `tests/e2e-mock/create-flow.test.ts` | `bun test tests/e2e-mock/create-flow.test.ts` | Full mock server with page/property/attachment state; corpus fixtures | To Implement |
| TC-E2EMOCK-003 | `tests/e2e-mock/noop-idempotency.test.ts` | `bun test tests/e2e-mock/noop-idempotency.test.ts` | Mock server state from first run persisted for second run | To Implement |
| TC-E2EMOCK-004 | `tests/e2e-mock/update-flow.test.ts` | `bun test tests/e2e-mock/update-flow.test.ts` | Mock server with page version tracking; 409 NOT exercised (happy path) | To Implement |
| TC-E2EMOCK-005 | `tests/e2e-mock/attachment-dedup.test.ts` | `bun test tests/e2e-mock/attachment-dedup.test.ts` | Mock server with attachment dedup (400 "same file name" or hash precheck) | To Implement |
| TC-E2EMOCK-006 | `tests/e2e-mock/provenance-panel.test.ts` | `bun test tests/e2e-mock/provenance-panel.test.ts` | Mock server with property storage; provenance panel fixture | To Implement |
| TC-E2EMOCK-007 | `.github/workflows/ci.yml` (validation) | Manual review + CI job run | No mocks; validates CI configuration | To Implement |
| TC-E2EMOCK-008 | `tests/e2e-mock/property-api-flow.test.ts` | `bun test tests/e2e-mock/property-api-flow.test.ts` | Mock server with v1 content-property REST endpoints (POST-409→GET→PUT) | To Implement |

**Shared test infrastructure** (to be implemented):
- `tests/e2e-mock/mock-server.ts` — reusable `Bun.serve` mock with in-memory state and captured-request recorder
- `tests/e2e-mock/helpers.ts` — target builder (`ConfluenceTarget.fromCredentials` for mock origin), corpus loader
- `tests/e2e-mock/fixtures/corpus/` — committed Markdown fixtures with `marksync:uuid` front-matter

**CI integration** (to be implemented):
- Add `e2e-mock` job to `.github/workflows/ci.yml` running `bun test tests/e2e-mock/`
- Ensure job requires 0 secrets (uses mock origin only)

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **RSK-1: Mock-vs-real response-shape drift** (esp. the 409 conflict envelope) makes conflict-recovery assertions wrong | H | M | TC-E2EMOCK-001 (mock-409 parse self-check) ensures the mock's envelope round-trips through `parseConflict`; verbatim title form reused from integration tier |
| **RSK-2: Duplication / over-build vs. existing integration tests** | M | M | Scope the mock to full-pipeline + stateful + CI-gated value (NG-6); do not re-assert per-call response parsing already in `tests/integration/confluence/` |
| **RSK-3: State leakage between scenarios** makes tests flaky | M | M | Reset mock state per scenario (fresh `Bun.serve` or explicit reset); NFR-CI-1 keeps the suite fast |
| **RSK-4: The mock's `Content-Type`/JSON handling diverges from `ConfluenceClient.parseJsonIfPossible`** | M | L | Mock responds with `application/json` bodies exactly as the real client parses them; covered via create scenario (TC-E2EMOCK-002) which round-trips a full page |
| **RSK-5: The e2e surfaces a genuine adapter bug mid-delivery** | M | L | DEC-1: do not fix production code inline; escalate to the PM as a separate change (§7.2) |

### 8.2 Assumptions

- Constructing `ConfluenceTarget.fromCredentials` directly against a loopback origin (the established integration-test pattern) is sufficient to exercise the full adapter contract through `computePlan` + `applyPlan` (DEC-1 / Option B)
- A small committed Markdown corpus with `marksync:uuid` front-matter is enough to drive the mandatory scenarios; no live Confluence fixtures are needed
- The 409 conflict envelope shape (`{ errors:[{ code:"CONFLICT", title:"...Current Version: [N]...Provided version: [M]..." }] }`) is stable and already proven by the integration tier — the mock reproduces it verbatim
- The fast CI loop can host an additive `e2e-mock` job with no secret plumbing
- Bun's `Bun.serve` HTTP mock is stable and suitable for in-process CI use

### 8.3 Open Questions

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the stretch scenarios (conflict recovery, Mermaid determinism, HTML-comment strip, UUID-less warning) be implemented now or deferred? | The ticket lists 9 scenarios; 5 are well-defined and mandatory. The stretch four need additional design assessment. | **Resolved per spec §7.3 / AC-F2-6**: deferred unless the human requests them. |
| OQ-2 | Should Option A (CLI binary + loopback-http relaxation) be delivered as a follow-up? | DEC-1 defers Option A; the PR description will surface it for human review. | **Decision deferred to human review post-PR**; not blocking for this change. |
| OQ-3 | What is the exact visible format of the provenance panel in the Storage body? | TC-E2EMOCK-006 needs to assert the panel is present, but the exact format depends on implementation. | **Deferred to implementation**: the scenario asserts the panel is present in the body; exact format validated by implementation. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Test Plan Writer | Initial test plan — 8 test cases covering all mandatory ACs, regression checks for GH-71/GH-66, CI job verification, and state reset strategy |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| — | — | — | Not yet executed — this is the initial test plan |

---