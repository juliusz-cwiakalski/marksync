---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-81
  type: test
  status: Proposed
  slug: mock-confluence-e2e
  title: "Mock Confluence HTTP server for CI e2e regression tests"
  owners: ["@cwiakalski"]
  service: marksync-cli
  labels: ["test", "MS-0002", "priority:high", "ci"]
  version_impact: none
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: [confluence-adapter, push-flow, ci]
    external: ["Confluence v2 Pages API", "Confluence v1 content-property API", "Confluence v1 attachment API"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Add a reusable, stateful mock Confluence HTTP server and a full-pipeline e2e scenario suite wired as a mandatory, secrets-free CI job, so HTTP adapter regressions (GH-71 attachment-unwrap, GH-66 property-API class) are caught on every PR without a live Confluence instance.

## 1. SUMMARY

This change delivers a reusable, stateful mock Confluence HTTP server (`Bun.serve()` on an ephemeral port) that implements the REST endpoints MarkSync actually calls, plus a full-pipeline end-to-end scenario suite that runs `computePlan` + `applyPlan` against the mock. The suite is wired into the fast CI loop (`.github/workflows/ci.yml`) as a mandatory `e2e-mock` job that requires **no secrets**. A regression in any HTTP adapter response-parsing path is now caught deterministically in CI.

The mock lives under a dedicated tier `tests/e2e-mock/` (separate from `tests/e2e/`, which is the live-sandbox tier run by `run-e2e.yml`). Per **DEC-1**, scenarios exercise the full publish pipeline programmatically — constructing `ConfluenceTarget.fromCredentials` directly against the loopback mock — so **no production source changes** are required (the `https:`-only gate in `resolveCredentials` is untouched).

## 2. CONTEXT

### 2.1 Current State Snapshot

- The fast CI loop (`.github/workflows/ci.yml`) runs `bun test tests/unit/ tests/integration/ tests/golden/` plus BDD invariants, boundary checks, license + vulnerability audits. None of it exercises the **whole** sync flow against a Confluence-shaped server.
- The **live-sandbox** tier (`run-e2e.yml`) runs `bun test tests/e2e/` against a real Confluence space, but it is **skipped** unless secrets are present (nightly schedule, `workflow_dispatch`, or the `run-e2e` PR label). PRs cannot rely on it.
- Unit tests that touch the adapter use in-process fakes; integration tests (`tests/integration/confluence/*.test.ts`) use per-test disposable `Bun.serve` mocks at **adapter-call granularity** (one request shape per test). There is no reusable, **stateful**, full-pipeline mock that exercises `computePlan` + `applyPlan` end-to-end and tracks server-side version/property/attachment state across the whole sync.

### 2.2 Pain Points / Gaps

- **HTTP-adapter regressions are not caught in the mandatory CI path.** GH-71 (attachment create response `{ results: [...] }` unwrap) and GH-66 (PropertyService moved from the jsongraphs endpoint to the v1 content-property REST endpoint) shipped bugs that a full-pipeline e2e against a Confluence-shaped server would have caught.
- **No reusable stateful mock exists.** Each integration test hand-rolls a one-shot responder with no cross-request state, so version-conflict recovery, attachment dedup, and the create→property→attachment sequence cannot be asserted as one coherent flow.
- **The live-sandbox tier is not a PR gate.** It is opt-in (label/secrets), so it cannot be the regression net for adapter changes.
- The ticket's endpoint table is **inaccurate** (verified against source — see §8.1); the mock must be built from the corrected list.

## 3. PROBLEM STATEMENT

Because the mandatory CI loop has no full-pipeline e2e coverage against a Confluence-shaped server, a regression in an HTTP adapter's response parsing (e.g. the GH-71 `{ results: [...] }` unwrap, or the GH-66 v1 property API shape) can merge and only surface in the opt-in live-sandbox tier or in production, so contributors cannot rely on CI to prove the adapter contract end-to-end on every PR.

## 4. GOALS

- **G-1**: A reusable, stateful mock Confluence HTTP server implements every endpoint MarkSync's adapter calls (the corrected list in §8.1), with realistic response envelopes and the parser-specific 409 conflict shape.
- **G-2**: A full-pipeline e2e suite runs `computePlan` + `applyPlan` against the mock, asserting outcomes against captured requests and the mock's server-side state.
- **G-3**: A mandatory, secrets-free `e2e-mock` CI job runs the suite on every PR in `.github/workflows/ci.yml` (not `run-e2e.yml`).
- **G-4**: The suite catches HTTP-adapter regressions by construction — the GH-71 and GH-66 bug classes would each fail a scenario if reintroduced.
- **G-5**: Zero production source changes (DEC-1); the `https:`-only gate in `resolveCredentials` is untouched.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| `e2e-mock` CI job present on every PR | 1 mandatory job (0 secrets) |
| E2E scenarios covering the critical pipeline paths | ≥ 5 mandatory (create, no-op, update, attachment dedup, provenance) |
| Adapter regression classes covered by a scenario | 2 (GH-71 unwrap class, GH-66 property-API class) |
| Production source files changed | 0 (DEC-1) |
| New secrets required by CI | 0 |
| Mock state leakage between scenarios | 0 (state reset per scenario) |

### 4.2 Non-Goals

- **NG-1**: No CLI-binary invocation. The tests exercise `computePlan` + `applyPlan` programmatically (DEC-1 / Option B), not by spawning the compiled `marksync` binary. CLI-shell coverage is a deferred follow-up (Option A).
- **NG-2**: No change to `resolveCredentials` or `isHttpsUrl` — the `https:`-only gate stays intact; scenarios construct `ConfluenceTarget.fromCredentials` directly.
- **NG-3**: No change to `run-e2e.yml` or the live-sandbox tier. The two tiers stay cleanly separated.
- **NG-4**: No performance benchmarking, no live Confluence testing, and no BDD/Gherkin features.
- **NG-5**: No production bug fixing is in scope. If the e2e reveals a genuine adapter bug, it is escalated to the PM as a separate change (§7.2).
- **NG-6**: No duplication of the adapter-call-level coverage already present in `tests/integration/confluence/` — GH-81's value-add is full-pipeline + stateful + CI-gated, not finer-grained adapter unit coverage.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Stateful mock Confluence HTTP server | A reusable, in-memory server that tracks pages/properties/attachments and reproduces Confluence's response envelopes (incl. the parser-specific 409 conflict body) lets full-pipeline scenarios assert outcomes against server state rather than canned echoes |
| F-2 | Full-pipeline e2e scenario suite | Running `computePlan` + `applyPlan` against the mock exercises every adapter call in sequence, catching end-to-end regressions that per-call integration tests cannot |
| F-3 | Mandatory secrets-free CI gate | A fast-loop CI job that runs the suite on every PR makes the mock e2e the PR-time regression net, independent of the opt-in live-sandbox tier |
| F-4 | Adapter-regression lock | Concrete scenarios that fail if the GH-71 attachment-unwrap or GH-66 property-API response shapes are mishandled, so the bug classes are structurally prevented |

### 5.1 Capability Details

**F-1: Stateful mock Confluence HTTP server**
A `Bun.serve({ port: 0 })` process on an ephemeral port holding in-memory state keyed by page id: pages (id, title, version, body storage, parentId), content properties (`pageId::key → { id, value, version }` — `id` is the property id returned in the response envelope and is **required** by `PropertyV1Response`), and attachments (`pageId → [{ id, filename, version }]`). It enforces optimistic concurrency: a page PUT or property PUT with a stale version yields a **409** whose body matches the exact envelope MarkSync's `parseConflict` expects; a duplicate attachment filename yields the **400** "same file name" idempotency signal. State resets per scenario (fresh server or explicit reset) so tests are deterministic. The mock accepts any `Authorization` header (it is a mock). It records captured requests (method, path, Authorization present, body) for assertions, mirroring the established `CapturedRequest[]` pattern in the integration tier.

**F-2: Full-pipeline e2e scenario suite**
Scenarios construct `ConfluenceTarget.fromCredentials` directly against the mock's loopback origin (DEC-1) and invoke `computePlan` + `applyPlan` over a small committed Markdown corpus (pages with `marksync:uuid` front-matter). Assertions combine the returned `ApplyReport` (writes/skips/blocks counts) with the mock's captured requests and server-side state. At least five mandatory scenarios cover the critical pipeline paths (create, no-op idempotency, update with version bump, attachment dedup, provenance panel).

**F-3: Mandatory secrets-free CI gate**
A new `e2e-mock` job in `.github/workflows/ci.yml` runs `bun test tests/e2e-mock/` on every push/PR to `main`. It requires no secrets (the mock is in-process). It is gated by the same pinned-Bun matrix discipline as the existing fast loop and runs alongside (not inside) the existing `Test` step, so a mock-tier failure fails the PR.

**F-4: Adapter-regression lock**
Two concrete assertions anchor regression prevention: (a) an attachment-upload scenario asserts the create response is consumed through the `{ results: [...] }` unwrap path (GH-71 class); (b) a property-set scenario asserts the v1 content-property create/409→GET→PUT flow resolves to `ok` (GH-66 class). A dedicated mock-409-parse self-check (unit-level) asserts the mock's conflict envelope round-trips through `parseConflict`, so the mock itself cannot drift from the real shape.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Contributor opens a PR touching the Confluence adapter
  PR → ci.yml runs fast-loop (unit/integration/golden/bdd) + NEW e2e-mock job
    → e2e-mock starts Bun.serve mock (ephemeral port) → runs scenarios (computePlan+applyPlan vs mock)
    → scenario asserts against captured requests + mock state → job passes/fails the PR
  (no secrets, no live Confluence; runs every PR)

Flow 2: Full create flow scenario
  corpus of UUID'd Markdown → computePlan → applyPlan against mock
    → mock receives POST /pages (create) + POST /property (marksync.metadata) + POST attachment
    → assert: ApplyReport.writes == N, captured POST /pages present, property set, attachment uploaded

Flow 3: No-op idempotency scenario (NFR-PERF-4)
  applyPlan (run 1) → creates pages → second applyPlan on same mock state
    → all entries classify NoOp → ApplyReport.writes == 0 (no POST/PUT/attachment POST)

Flow 4: Update + conflict-recovery (stretch) scenario
  modify Markdown → applyPlan → PUT /pages/{id} with version bump
    (stretch) mock returns 409 once → adapter re-fetches page → retries PUT with bumped version → success

Flow 5: Attachment dedup scenario
  applyPlan (run 1) uploads attachment → applyPlan (run 2) same asset
    → second upload hits 400 "same file name" → resolved from list → 0 re-uploads
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The reusable, stateful mock Confluence HTTP server and its captured-request recorder, living under `tests/e2e-mock/`.
- The full-pipeline e2e scenario suite (`tests/e2e-mock/*.test.ts`) and any small shared test helpers (corpus fixtures, target builder).
- The mandatory `e2e-mock` CI job in `.github/workflows/ci.yml` running `bun test tests/e2e-mock/` with **no secrets**.
- The mock-409-parse self-check that asserts the mock's conflict envelope round-trips through `parseConflict`.
- Documentation references tying the mock tier to the testing-strategy tier model.

### 7.2 Out of Scope

- [OUT] Any change to `src/app/credentials.ts` or any production source under `src/` (DEC-1). If the e2e surfaces a genuine adapter bug, escalate to the PM as a separate change rather than fixing inline.
- [OUT] CLI-binary invocation / spawning the compiled `marksync` (Option A — deferred; surfaced in the PR description for human review).
- [OUT] Changes to `run-e2e.yml` or the `tests/e2e/` live-sandbox tier.
- [OUT] Live Confluence testing and performance benchmarking.
- [OUT] BDD/Gherkin features.

### 7.3 Deferred / Maybe-Later

- **Option A — CLI binary + loopback-http relaxation.** If the human wants CLI-shell and `resolveCredentials` coverage, a follow-up change may spawn the real `marksync` CLI against the mock via a loopback base URL (which requires a narrow, reviewed relaxation of the `https:`-only gate in `credentials.ts`). DEC-1 defers this; it is noted in the PR description for review.
- **Stretch e2e scenarios** (conflict recovery, Mermaid determinism, HTML-comment strip, UUID-less warning) are candidate future scenarios once the mandatory five are stable (see §17 AC-F2-6).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

The mock must implement the endpoints MarkSync actually calls. This is the **corrected** list (the ticket's endpoint table is inaccurate — verified against `src/infra/confluence/*`). All paths are under `${baseUrl}` where `baseUrl = http://localhost:${port}`; v2 routes use `/wiki/api/v2`, v1 routes use `/wiki/rest/api` (per `ConfluenceClient.v1`/`v2`).

**Credential validation** (`src/app/credentials.ts`) — implemented for realism, NOT on the e2e critical path (DEC-1 bypasses `resolveCredentials`):
- `GET /wiki/api/v2/user/by-me` → 200 `{ accountId, displayName }` (fixed identity; accepts any Authorization header).

**Pages** (`src/infra/confluence/pages.ts`, v2):
- `POST /wiki/api/v2/pages` — create. Request `{ spaceId, status:"current", title, parentId?, body:{representation:"storage",value}, version?:{message} }`. Response 2xx `PageV2Response` `{ id, title, status:"current", version:{number,message}, body:{storage:{value}} }`; mock assigns a new server id + version 1.
- `GET /wiki/api/v2/pages/{id}?body-format=storage` — get. 200 with body; 404 → `RemoteMissing`; 403 → `Forbidden`.
- `PUT /wiki/api/v2/pages/{id}` — update AND move. Request body carries `version.number = baseVersion+1`. On a stale version the mock returns **409** with the **exact** conflict envelope `parseConflict` expects: `{ errors:[{ code:"CONFLICT", title:"...Current Version: [N]...Provided version: [M]..." }] }` where `N` = current server version and `M` = the version the caller sent. The title must match `VERSION_RE = /Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/`.

**Properties** (`src/infra/confluence/properties.ts`, v1 content-property REST — **not** jsongraphs):
- `GET /wiki/rest/api/content/{pageId}/property/{key}` → 200 `{ id, key, value, version:{number} }` (`id` is the property id the mock assigns — a string or number, and is **required** by `PropertyV1Response`; a response omitting `id` fails `safeParse` → `RemoteUnreachable`, breaking the property flow; `value` is a string); 404 → property absent (`ok(undefined)`).
- `POST /wiki/rest/api/content/{pageId}/property` body `{ key, value }` → create; if the key exists → **409** (triggers the GET-version → PUT-incremented flow).
- `PUT /wiki/rest/api/content/{pageId}/property/{key}` body `{ key, value, version:{number: currentVersion+1} }` → update; 409 on stale version.

**Attachments** (`src/infra/confluence/attachments.ts`, v1):
- `POST /wiki/rest/api/content/{pageId}/child/attachment` — multipart upload (`file` + `minorEdit=true`, `X-Atlassian-Token: no-check`). Response 2xx is `{ results:[{ id, title, version:{number} }] }` (v1 wraps even single creates in `results[]` — the GH-71 shape). Dedup: if a file with the same hash-derived name (`marksync-mermaid-<hash>.svg` / `marksync-asset-<hash>.<ext>`) already exists → **400** with a body matching `/Cannot add a new attachment with same file name/i` (the idempotency signal).
- `GET /wiki/rest/api/content/{pageId}/child/attachment` → 200 `{ results:[{ id, title, version:{number} }] }`.

**Port-exposed but NOT on the sync critical path** (minimal stubs for AC-F1 completeness — search returns empty results; restrictions returns a default view-permitted shape):
- `GET /wiki/rest/api/search?cql=...` → 200 `{ results:[] }`.
- `GET /wiki/rest/api/content/{pageId}/restriction` → 200 default (empty `results` → not restricted).

> Explicitly **excluded**: the `/api/jsongraphs/property-service/property` endpoint is NOT implemented by the mock — it is unused since GH-66 and must not appear anywhere in this change.

### 8.2 Events / Messages

N/A — no new events or message formats.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | In-memory mock state model | Test-only: `Map<pageId, PageState>` plus property and attachment maps; not part of any production data model. Reset per scenario for determinism. |
| DM-2 | Captured-request log | Test-only: an append-only `CapturedRequest[]` (method, path, Authorization header present, body) exposed for scenario assertions, mirroring the integration-tier pattern. |

### 8.4 External Integrations

- The mock simulates the **Confluence Cloud REST surface** (v2 pages, v1 content-properties, v1 attachments). No real Confluence, no network egress — the `ConfluenceClient` talks to `http://localhost:${port}`.

### 8.5 Backward Compatibility

- No production interfaces change. The mock is additive test infrastructure. Existing tests (unit, integration, golden, BDD) and both CI workflows continue to pass unchanged; the new job is additive.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-PERF-4 | Idempotent rerun (asserted by the no-op scenario) | A second unchanged `applyPlan` against the same mock state performs 0 writes (0 POST/PUT/attachment POST) |
| NFR-MAINT-1 | Adapter isolation preserved | The mock targets only the `ConfluenceClient` URL surface (`v1`/`v2`); no production adapter change |
| NFR-MAINT-2 | No over-build vs. existing integration tier | The mock covers full-pipeline + stateful + CI-gated paths; it does NOT re-cover adapter-call-level cases already in `tests/integration/confluence/` |
| NFR-CI-1 | Deterministic CI runtime | The full `tests/e2e-mock/` suite completes in ≤ 60 s on the CI runner (in-process mock, no network, no sleeps — uses the instant `delay` seam) |
| NFR-CI-2 | Mandatory + secrets-free | The `e2e-mock` job runs on every PR and requires 0 secrets |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no new production telemetry. Scenario failures must surface a clear diff (expected vs. actual captured requests / `ApplyReport` counts / mock state) to aid diagnosis.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Mock-vs-real response-shape drift (esp. the 409 conflict envelope) makes conflict-recovery assertions wrong | H | M | Pin the exact `parseConflict`/`VERSION_RE` shape in the spec (§8.1); add a unit-level self-check that asserts the mock's 409 round-trips through `parseConflict`; reuse the verbatim title form already proven in the integration tier | L |
| RSK-2 | Duplication / over-build vs. the existing adapter-call integration tests | M | M | Scope the mock to full-pipeline + stateful + CI-gated value (NG-6); do not re-assert per-call response parsing already covered in `tests/integration/confluence/` | L |
| RSK-3 | State leakage between scenarios makes tests flaky | M | M | Reset mock state per scenario (fresh `Bun.serve` or explicit reset); NFR-CI-1 keeps the suite fast | L |
| RSK-4 | The mock's `Content-Type`/JSON handling diverges from `ConfluenceClient.parseJsonIfPossible`, causing false negatives | M | L | Have the mock respond with `application/json` bodies exactly as the real client parses them; cover via the create scenario which round-trips a full page | L |
| RSK-5 | The e2e surfaces a genuine adapter bug mid-delivery | M | L | DEC-1: do not fix production code inline; escalate to the PM as a separate change (§7.2) | L |

## 12. ASSUMPTIONS

- Constructing `ConfluenceTarget.fromCredentials` directly against a loopback origin (the established integration-test pattern) is sufficient to exercise the full adapter contract through `computePlan` + `applyPlan` — DEC-1 / Option B.
- A small committed Markdown corpus with `marksync:uuid` front-matter is enough to drive the mandatory scenarios; no live Confluence fixtures are needed.
- The 409 conflict envelope shape (`{ errors:[{ code:"CONFLICT", title:"...Current Version: [N]...Provided version: [M]..." }] }`) is stable and already proven by the integration tier — the mock reproduces it verbatim.
- The fast CI loop can host an additive `e2e-mock` job with no secret plumbing.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Confluence adapter (`src/infra/confluence/*`) | The mock must mirror the adapter's actual endpoints and response shapes (§8.1) |
| Depends on | push-flow (`computePlan` + `applyPlan`, `src/app/push-flow.ts`) | The programmatic entry points the scenarios call (DEC-1) |
| Depends on | `.github/workflows/ci.yml` | Hosts the new mandatory `e2e-mock` job |
| Depends on | `parseConflict` / `VERSION_RE` (pages.ts) | Defines the exact 409 shape the mock must reproduce (RSK-1) |
| Depends on | ADR-0006 C-5/C-6 (conflict recovery) | Anchors the stretch conflict-recovery scenario |
| Blocks | None | Additive test infrastructure |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the stretch scenarios (conflict recovery, Mermaid determinism, HTML-comment strip, UUID-less warning) ship now or be deferred? | The ticket lists 9 scenarios; 5 are well-defined and mandatory. The stretch four need additional design assessment (e.g. Mermaid determinism under the `render` policy may be limited; UUID-less warning may belong in plan tests). | Resolved for this change: ship the 5 mandatory scenarios (AC-F2-1..AC-F2-5); stretch scenarios are deferred to §7.3 / AC-F2-6 unless the human requests them. |
| OQ-2 | Should Option A (CLI binary + loopback-http relaxation) be delivered as a follow-up? | DEC-1 defers Option A. The PR description will surface it for human review. | Decision deferred to human review post-PR; not blocking. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Execution level: programmatic full-pipeline e2e (Option B).** Scenarios call `computePlan` + `applyPlan` against the `Bun.serve()` mock via `ConfluenceTarget.fromCredentials` constructed directly (bypassing `resolveCredentials`), following the established `tests/integration/confluence/confluence-target.test.ts` pattern. No change to `src/app/credentials.ts` (`isHttpsUrl` stays `https:`-only). | (1) Satisfies all four ACs literally (endpoints, scenarios, CI job, adapter-regression coverage). (2) Least-privilege / paved-road: zero production/security change, fully reversible. (3) The ticket's stated motivation is HTTP-adapter regressions (GH-71/GH-66), which Option B catches exactly since the adapter is exercised through the full pipeline. (4) The "CLI flow" language lives in the ticket's Proposed Design (suggestion), not the ACs (contract). Option A (CLI binary + loopback-http relaxation) is deferred as a follow-up; surfaced in the PR description. Accepted trade-off: the e2e does not exercise the CLI argument shell or the `https:`-gate in `resolveCredentials` (those stay covered by unit/integration tests). | 2026-07-15 |
| DEC-2 | **Separate tier `tests/e2e-mock/`, not `tests/e2e/`.** | `testing-strategy.md` defines `tests/e2e/` as the live-sandbox tier (run-e2e.yml runs `bun test tests/e2e/` with secrets). Placing mock tests there would make the live tier run them too. A separate folder keeps tiers clean and lets `ci.yml` target the mock tier independently with no secrets. | 2026-07-15 |
| DEC-3 | **Mock the corrected endpoint list, not the ticket's table.** | The ticket's endpoint table is inaccurate (wrong attachment base, wrong property path, and lists the unused jsongraphs endpoint removed by GH-66). The list in §8.1 is verified against `src/infra/confluence/*` and is authoritative for the mock. | 2026-07-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Mock Confluence server + helpers (`tests/e2e-mock/`) | New — reusable stateful `Bun.serve` mock, captured-request recorder, corpus fixtures, target builder |
| E2E scenario suite (`tests/e2e-mock/*.test.ts`) | New — ≥ 5 mandatory full-pipeline scenarios |
| CI fast loop (`.github/workflows/ci.yml`) | Updated — new mandatory `e2e-mock` job (secrets-free) |
| Testing-strategy tier model (`.ai/rules/testing-strategy.md`) | Referenced — the mock tier sits between integration and live-sandbox (no spec edit required for delivery; a note may be added in phase 7) |
| Production source (`src/**`) | Unchanged (DEC-1) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the mock Confluence server, **when** it receives each of the corrected endpoints (§8.1 — v2 pages create/get/put, v1 property get/post/put, v1 attachment post/get, user/by-me, search, restrictions), **then** it returns a response whose status and JSON envelope satisfy the adapter's zod schemas (`PageV2Response`, `PropertyV1Response`, `AttachmentCreateResponse`/`AttachmentListResponse`) and, for the page PUT stale-version case, the exact `parseConflict` 409 envelope. The unused jsongraphs endpoint is NOT implemented. | F-1, G-1 |
| AC-F1-2 | **Given** the mock's 409 conflict body, **when** it is parsed by `parseConflict`, **then** it yields `Conflict { baseVersion: M, remoteVersion: N }` with the correct numbers — proving the mock cannot drift from the real shape (RSK-1 self-check). | F-1, F-4 |
| AC-F2-1 | **Given** a corpus of UUID'd Markdown pages, **when** `computePlan` + `applyPlan` run against a fresh mock, **then** the pages are created (`POST /wiki/api/v2/pages` captured), the `marksync.metadata` property is set, and any attachments are uploaded — `ApplyReport.writes` equals the number of pages written. | F-2, G-2, F-4 |
| AC-F2-2 | **Given** a mock state already populated by a first `applyPlan`, **when** a second `applyPlan` runs over unchanged source, **then** every entry is NoOp and `ApplyReport.writes == 0` (no POST/PUT/attachment POST captured) — NFR-PERF-4. | F-2, NFR-PERF-4 |
| AC-F2-3 | **Given** a Markdown page modified after a first sync, **when** `applyPlan` runs, **then** a `PUT /wiki/api/v2/pages/{id}` is captured carrying `version.number = baseVersion+1` and the mock's server-side page version advances. | F-2 |
| AC-F2-4 | **Given** an attachment uploaded on the first sync, **when** `applyPlan` runs a second time over the same asset, **then** the duplicate is resolved idempotently (the mock's 400 "same file name" path or a hash precheck) and the attachment is NOT re-uploaded (`POST …/child/attachment` for that asset not captured on run 2) — proving the GH-71 unwrap + dedup class holds. | F-2, F-4 |
| AC-F2-5 | **Given** a page synced with the visible provenance panel, **when** the captured create/update page body is inspected, **then** the visible provenance panel (`{info}` macro / `marksync.metadata` content) is present in the body sent to the mock. | F-2 |
| AC-F2-6 | **Given** the stretch scenarios (conflict recovery per ADR-0006 C-5/C-6, Mermaid determinism, HTML-comment strip per GH-77, UUID-less warning per GH-74), **when** assessed for delivery, **then** they are either implemented OR explicitly deferred (§7.3) with a recorded rationale — they are not required to satisfy AC-2. | F-2, OQ-1 |
| AC-3 | **Given** a pull request to `main`, **when** CI runs, **then** a mandatory `e2e-mock` job in `.github/workflows/ci.yml` executes `bun test tests/e2e-mock/` and requires **no secrets** (the job is not added to `run-e2e.yml`). | F-3, G-3, NFR-CI-2 |
| AC-4 | **Given** the GH-71 attachment-unwrap regression (`mapCreate` treating a `{ results: [...] }` body as flat) reintroduced, **then** AC-F2-1/F-2-4 fails; and **given** the GH-66 property-API regression (wrong endpoint/shape for the content-property flow) reintroduced, **then** AC-F2-1 / TC-E2EMOCK-008 fails (the `marksync.metadata` property set on create errors/blocks) — **not** AC-F2-5: the provenance panel lives in the page body via `createPage`, independent of `putProperty`, so it does not catch this class — so both adapter-regression classes are caught by the suite (documented coverage in §5.1 F-4). | F-4, G-4 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** build the mock server + recorder → add the mandatory five scenarios + the mock-409 self-check → wire the `e2e-mock` job into `ci.yml` → run the suite green locally and in CI.
- **Merge strategy:** single PR squashed to `main` on branch `feat/GH-81/mock-confluence-e2e`.
- **Communication:** none user-facing — additive test infrastructure. The PR description notes the DEC-1 trade-off (programmatic e2e vs. CLI binary) and surfaces Option A as a deferred follow-up for human review.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — test-only in-memory state, reset per scenario. No production data migration.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no PII or compliance-sensitive data. The mock accepts an opaque `Authorization` header for realism only; no real credentials or secrets are involved, and no secrets are added to CI.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No production/security change (DEC-1):** the `https:`-only gate in `resolveCredentials` / `isHttpsUrl` is untouched. Scenarios construct `ConfluenceTarget.fromCredentials` directly, mirroring the integration tier, so there is no new code path that relaxes credential validation.
- **No secrets in CI:** the `e2e-mock` job requires zero secrets (NFR-CI-2).
- **No network egress:** the `ConfluenceClient` talks only to the in-process loopback mock.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Maintenance surface:** one reusable mock module + its scenario suite + one CI job. The mock must be kept in sync with the adapter's endpoint list and response shapes; the mock-409 self-check (AC-F1-2) guards the highest-drift risk. If the adapter's endpoints change, §8.1 is the single source of truth to update.
- **CI cost:** one additional fast-loop job running an in-process suite (NFR-CI-1: ≤ 60 s).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Mock e2e tier (`tests/e2e-mock/`) | A new secrets-free test tier: full-pipeline scenarios against an in-process `Bun.serve` mock. Distinct from the live-sandbox tier (`tests/e2e/`). |
| Stateful mock | An HTTP mock that tracks pages/properties/attachments in memory across requests, enforcing version conflicts and attachment dedup like real Confluence. |
| `parseConflict` / `VERSION_RE` | The page-update 409-conflict parser and its title regex (`Current Version: [N] … Provided version: [M]`); the exact shape the mock must reproduce (§8.1). |
| GH-71 unwrap class | Adapter regressions where a v1 `{ results: [...] }` response is parsed as a flat object. |
| GH-66 property-API class | Adapter regressions where the content-property endpoint/shape is mishandled (e.g. the obsolete jsongraphs path). |
| DEC-1 / Option B | The decision to run scenarios programmatically (`computePlan` + `applyPlan`) against the mock, bypassing `resolveCredentials`, with no production change. |

## 24. APPENDICES

### Appendix A: Why a separate tier (DEC-2)

`testing-strategy.md` pins `tests/e2e/` as the **live-sandbox** tier: `run-e2e.yml` runs `bun test tests/e2e/` with real Confluence secrets, gated by schedule/label/`workflow_dispatch`. Placing the mock suite there would make the live tier execute mock tests against the sandbox. A dedicated `tests/e2e-mock/` folder keeps the tiers cleanly separated and lets `ci.yml` target the mock tier independently with no secrets (NFR-CI-2).

### Appendix B: Reuse vs. existing integration tests

The adapter-call-level integration tests (`tests/integration/confluence/confluence-target.test.ts`, `push-flow.test.ts`) already use `Bun.serve` + `ConfluenceTarget.fromCredentials` built directly, with one-shot responders per status path. GH-81's value-add is **not** finer-grained adapter coverage (NG-6); it is a **richer, stateful, reusable** mock (in-memory maps, version conflicts, attachment dedup) plus a **multi-page full-pipeline** scenario suite plus a **mandatory CI gate**. The scenario suite asserts outcomes against server state and captured traffic across the whole sync, which the per-call tests structurally cannot.

### Appendix C: Relevant authorities

- `.ai/rules/testing-strategy.md` — test tiers, over-mocking guardrail (mocks allowed for adapter boundaries + fault injection), CI wiring.
- `doc/decisions/TDR-0004-testing-runner.md` — `bun:test` as primary runner; test-design guardrail.
- `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` — 409 conflict recovery (C-5/C-6); the re-fetch-once policy anchoring the stretch conflict-recovery scenario.
- `src/infra/confluence/{client,pages,properties,attachments,search,restrictions,target}.ts` — the actual endpoints and response shapes (§8.1 is verified against these).
- `src/infra/confluence/schemas/{page,property,attachment}.ts` — zod schemas = response contracts the mock must satisfy.
- `tests/integration/confluence/confluence-target.test.ts` — the established `Bun.serve` mock + `ConfluenceTarget.fromCredentials` pattern to follow (DEC-1).
- `doc/spec/nonfunctional.md` — NFR-PERF-4 (idempotent rerun), NFR-MAINT-1/2 (adapter isolation / narrow matrix).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Change Spec Writer | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored from the GH-81 ticket body and the PM `clarify_scope` outputs (`chg-GH-81-pm-notes.yaml`, `chg-GH-81-questions.md`), with every endpoint and response shape verified against `src/infra/confluence/{client,pages,properties,attachments,search,restrictions}.ts` and the zod schemas in `src/infra/confluence/schemas/`. The corrected endpoint list (§8.1, DEC-3) supersedes the ticket's inaccurate table — it is the authoritative reference for the mock. The execution-level fork (CLI binary vs. programmatic) is resolved as **Option B / DEC-1**, the PM-decided least-privilege path that satisfies all four ticket ACs with zero production change; Option A is recorded as a deferred follow-up (§7.3, OQ-2). The mock tier placement (`tests/e2e-mock/`, DEC-2) follows the testing-strategy tier model so the live-sandbox tier stays clean. Conventions mirror the closest analogs: the GH-71 adapter spec (response-shape contracts) and the `tests/integration/confluence/confluence-target.test.ts` `Bun.serve` + `ConfluenceTarget.fromCredentials` pattern. The 409 conflict envelope is pinned verbatim (§8.1, AC-F1-2) because it is the highest-drift risk (RSK-1). No gaps remained that could not be resolved from the codebase.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-81)
- [x] `owners` has at least one entry (["@cwiakalski"])
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..4, AC-F1-1/2, AC-F2-1..6, AC-3, AC-4, NFR-PERF-4/NFR-MAINT-1/2/NFR-CI-1/2, RSK-1..5, DEC-1..3, DM-1/2, OQ-1/2, G-1..5, NG-1..6)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (0 writes, ≤ 60 s, 0 secrets, 0 production files)
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths beyond component/module names; no step-by-step tasks)
- [x] No content duplicated from linked docs (summaries + corrections only, references cited)
- [x] Front matter validates per front_matter_rules
