---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-69-test-plan
status: Proposed
created: "2026-07-13"
last_updated: "2026-07-13"
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, mermaid, kroki, remote-rendering, attachments]
version_impact: minor
summary: "Test plan for GH-69 mermaid kroki render — Kroki HTTP adapter, mermaid HAST transform, computePlan wiring, content hashing (full sha256), attachment reuse (0 re-uploads), privacy warning (NFR-PRIV-2), network fallback, and determinism with mocked renderer for CI."
links:
  change_spec: ./chg-GH-69-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4-S4] Mermaid SVG rendering via Kroki API (GH-69)

## 1. Scope and Objectives

GH-69 enables Mermaid diagram rendering via the public Kroki API, converting code blocks into SVG image attachments on Confluence pages — the "wow" feature for the MS-0002 demo, with privacy-preserving opt-in behavior and deterministic content hashing for attachment reuse. This test plan ensures:

1. **Render activation (release-blocking)** — `render.mermaid.policy: render` → diagrams render as `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullhash>.svg"/>` + attachment exists after apply.
2. **Attachment reuse / idempotency (NFR-PERF-4)** — unchanged diagram → `attachmentExists` true → **0** `uploadAttachment` calls.
3. **Policy activation** — `render.mermaid.policy: render` activates rendering; `code`/`skip` preserve raw code as code macro.
4. **Network fallback** — Kroki HTTP errors → code block emitted + warning; never silent drop.
5. **Determinism** — same source → same SVG bytes → same hash (full sha256) → same filename (full hash in filename, not truncated) across runs.
6. **Privacy warning (NFR-PRIV-2)** — `render.mermaid.policy: render` → one-time warning emitted; `code`/`skip` → no warning.
7. **Quality gate** — `bun run check` exits 0.

### 1.1 In Scope

- Kroki HTTP adapter (`src/infra/mermaid/kroki.ts`) — `POST https://kroki.io/mermaid/svg`, timeout handling, error mapping to `RemoteUnreachable`.
- Mermaid HAST transform (`src/domain/mermaid/transform.ts`) — fence discovery, render via adapter, img replacement, fallback on error, in-doc dedup.
- `Renderer` port (`src/domain/mermaid/port.ts`) — generic render contract.
- `computePlan` wiring (`src/app/push-flow.ts`) — run transform when policy === `"render"`, populate `ContentHash.attachmentHashes`, merge mermaid artifacts into `PlanEntry.assets`.
- Content hashing and naming — sha256 of SVG bytes (full hash stored in `Artifact.hash`), filename `marksync-mermaid-<fullsha256>.svg` (NOT truncated to 24 chars).
- Privacy warning emission — one-time warning when `render` policy active.
- Network fallback handling — code block emission on `RemoteUnreachable` + warning.
- Integration with GH-26 asset pipeline — `uploadAssets` handles mermaid artifacts; dedup via `attachmentExists`.
- Unit tests: Kroki adapter (mock fetch), mermaid transform (fence→img, fallback), content hashing, privacy warning emission.
- Integration tests: transform + mock Kroki adapter + mock target upload/reuse; network failure fallback; policy gating; privacy warning in plan output.
- Golden fixture: Storage XHTML structure with mocked renderer for mermaid fence under `render` policy (not SVG bytes themselves).

### 1.2 Out of Scope & Known Gaps

- **mmdc CLI implementation** (NG-1) — design `Renderer` port to be swappable, but do not wire mmdc in this change.
- **Self-hosted Kroki configuration** — uses public `https://kroki.io` only.
- **SVG sanitization** — Kroki trusted for MS-0002 (NG-3).
- **Mermaid-DOM tier tests** — not applicable (no in-process mermaid library; Kroki is HTTP).
- **BDD lifecycle invariants** — mermaid feature does not touch INV-SAFE-1/2/3 or INV-SEC-1; existing BDD coverage unchanged.
- **E2E live-sandbox** — E5-S1 scenario, separate gate.
- **Real Kroki determinism in CI** — non-deterministic across environments; validated manually; CI uses mocked renderer returning fixed SVG bytes.

## 2. References

- **Change specification**: `chg-GH-69-spec.md` — authoritative AC, decisions, NFRs, functional capabilities.
- **Story file**: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S1--mermaid-rendering.md` — test matrix + AC.
- **Testing strategy**: `.ai/rules/testing-strategy.md` — 6-tier strategy, over-mocking guardrail (domain logic must use real inputs/outputs, not mocks; mocks allowed for the `Renderer` adapter boundary + fault injection).
- **Code style**: `.ai/rules/typescript.md`.
- **ADRs**: ADR-0002 (fallback ladder rung 6 = public Kroki, opt-in with privacy warning, hash formula), ADR-0005 (Storage Format), ADR-0006 (state model / attachmentHashes facet).
- **Existing infra under test (reused, not re-tested)**: `src/infra/confluence/attachments.ts` (`AttachmentService`), `src/infra/confluence/render/storage.ts` (`imageMacro`), `src/domain/assets/resolver.ts` (asset pipeline from GH-26).
- **Existing test helpers**: `tests/_helpers/` (mock target factories, if present), `tests/golden/markdown/storage-renderer.test.ts` (golden fixture pattern).
- **PM decision override**: Full sha256 hash in filename (not truncated to 24 chars); existing `attachmentFilename()` already produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"`.

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Tier | Status |
|-------|-------------|----------|------|--------|
| AC-1 | Render activation — mermaid fence → `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullhash>.svg"/>`; attachment exists after apply | TC-MERM-001, TC-MERM-002 | Integration + Golden | To Implement |
| AC-2 | Attachment reuse — unchanged → `attachmentExists` true → **0** `uploadAttachment` calls | TC-MERM-003 | Integration | To Implement |
| AC-3 | Policy activation — `render` activates; `code`/`skip` preserve as code macro | TC-MERM-004 | Unit | To Implement |
| AC-4 | Network fallback — Kroki HTTP error → code block + warning; no `ac:image`, no upload | TC-MERM-005, TC-MERM-006 | Unit + Integration | To Implement |
| AC-5 | Determinism — same source → same SVG → same hash → same filename (full sha256) across runs | TC-MERM-007 | Unit | To Implement |
| AC-6 | Privacy warning — `render` → one-time warning; `code`/`skip` → no warning | TC-MERM-008 | Integration | To Implement |
| AC-7 | `bun run check` exits 0 | (quality gate) | All | To Implement |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| DM ID | Description | TC ID(s) |
|-------|-------------|----------|
| DM-1 | `Artifact.kind` marker — `"mermaid"` produces `marksync-mermaid-` prefix | TC-MERM-001 |
| DM-2 | `ContentHash.attachmentHashes` populated from mermaid artifacts | TC-MERM-002 |
| DM-3 | `PageBinding.attachmentHashes` persisted via `uploadAssets` merge | TC-MERM-003 |
| DM-4 | `PlanEntry.assets` populated with mermaid artifacts | TC-MERM-002 |
| DM-5 | Mermaid naming — full sha256 hash in filename (not truncated) | TC-MERM-007 |
| DM-6 | `Renderer` port — `render(source: string): Promise<Result<Artifact, MarkSyncError>>` | TC-MERM-005 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR | TC ID(s) |
|-----|----------|
| NFR-1 mermaid render activation | TC-MERM-001, TC-MERM-004 |
| NFR-2 attachment reuse (NFR-PERF-4) | TC-MERM-003 |
| NFR-3 determinism | TC-MERM-007 |
| NFR-4 privacy warning (NFR-PRIV-2) | TC-MERM-008 |
| NFR-5 network fallback | TC-MERM-005, TC-MERM-006 |
| NFR-6 per-document isolation | TC-MERM-006 |
| NFR-7 timeout safety | TC-MERM-005 |
| NFR-8 no secrets in output (INV-SEC-1) | TC-MERM-001 (asserted via filename pattern) |
| NFR-9 quality gate | All tests + `bun run check` |

## 4. Test Types and Layers

### 4.1 Unit Tests (bun:test) — `tests/unit/infra/mermaid/`, `tests/unit/domain/mermaid/`

**Framework**: `bun:test`

**Scope**: Pure domain logic + adapter boundary with mocked `fetch` (allowed for fault injection and adapter boundary).

- **Kroki adapter**: Mock `fetch` to test success paths, HTTP 4xx/5xx, network timeout, DNS failure. Do NOT mock the hashing logic or the `Artifact` construction.
- **Mermaid transform**: Test with real HAST trees and a stubbed `Renderer` (adapter boundary, allowed to stub). Do NOT mock the HAST walk or the hashing. Test fence discovery, img replacement, fallback to code block on error, in-doc dedup (same source → one Artifact).
- **Content hashing**: Test that same SVG bytes produce same sha256 hash; test that the hash is full (64 hex chars), not truncated.
- **Privacy warning emission**: Test that warning is emitted once per run when policy === `"render"`, not per diagram; test that `code`/`skip` produce no warning.

### 4.2 Integration Tests (bun:test + mock `TargetSystem`) — `tests/integration/app/mermaid/`

**Framework**: `bun:test`

**Scope**: End-to-end mermaid render through `computePlan` + `applyPlan` with mock Kroki adapter + mock target.

- Mock Kroki adapter returns fixed SVG bytes (deterministic for CI).
- Mock `TargetSystem` records `attachmentExists` / `uploadAttachment` calls (count + args) and can be programmed to return `exists=true/false` or simulate errors.
- Real mermaid transform runs with real HAST trees.
- Test policy gating (`render` vs `code` vs `skip`).
- Test privacy warning appears in plan output.
- Test network failure fallback (mermaid transform keeps original `pre` element).
- Test per-document isolation (one doc's RemoteUnreachable does not abort the run).
- Test idempotent rerun (same source → 0 uploads on 2nd run).

### 4.3 Golden Fixture Tests (bun:test) — `tests/golden/markdown/storage-renderer.test.ts`

**Framework**: `bun:test` with `toMatchSnapshot`

**Scope**: Storage XHTML STRUCTURE for mermaid fence under `render` policy.

- **Important**: Kroki output is non-deterministic across environments / network, so the SVG bytes cannot be a stable golden.
- The golden fixture tests the XHTML STRUCTURE (`<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>`) with a mocked renderer returning fixed SVG bytes.
- This is golden-stable because the mocked renderer returns the same bytes every time, making the hash deterministic.
- Not a golden fixture for the SVG bytes themselves (those are validated via integration tests with mocked renderer).

### 4.4 Mermaid-DOM Tier

**Not applicable** — no in-process mermaid library; Kroki is HTTP.

### 4.5 BDD / E2E

- **BDD**: Mermaid feature does not touch lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1); existing BDD coverage unchanged.
- **E2E**: Live-sandbox mermaid rendering + upload is an E5-S1 scenario, separate gate. Not covered in this test plan.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-MERM-001 | Render activation — fence to `<ri:attachment>` with full hash filename | Happy Path | Critical | High | AC-1, F-1, F-2, F-3 |
| TC-MERM-002 | Golden fixture — Storage XHTML structure with mocked renderer | Happy Path | Important | High | AC-1, F-2 |
| TC-MERM-003 | Attachment reuse — unchanged → 0 uploads | Edge Case | Critical | High | AC-2, F-4, NFR-2 |
| TC-MERM-004 | Policy activation — render vs code vs skip | Happy Path | Important | High | AC-3, F-2, F-5 |
| TC-MERM-005 | Network fallback — HTTP error → code block + warning | Negative | Critical | High | AC-4, F-6, NFR-5 |
| TC-MERM-006 | Per-document isolation — one doc fails, run continues | Edge Case | Important | Medium | AC-4, NFR-6 |
| TC-MERM-007 | Determinism — same source → same hash → same filename (full sha256) | Happy Path | Critical | High | AC-5, F-4, NFR-3 |
| TC-MERM-008 | Privacy warning — one-time warning for `render` policy | Happy Path | Critical | High | AC-6, F-5, NFR-4 |
| TC-MERM-009 | In-doc dedup — same mermaid twice → one Artifact | Edge Case | Important | Medium | F-2 |
| TC-MERM-010 | Timeout safety — Kroki timeout → `RemoteUnreachable` | Negative | Important | Medium | NFR-7 |
| TC-MERM-011 | No secrets in filenames/output (INV-SEC-1) | Negative | Important | Medium | NFR-8 |

### 5.2 Scenario Details

#### TC-MERM-001 - Render activation — fence to `<ri:attachment>` with full hash filename

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-1, NFR-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- A mock Kroki adapter that returns fixed SVG bytes for a given diagram source.
- A mock `TargetSystem` that records `uploadAttachment` / `attachmentExists` calls.
- A Markdown doc with a single mermaid fence.

**Steps**:
1. Create a plan from the doc with `config.render.mermaid.policy = "render"`.
2. Apply the plan.
3. Inspect the rendered Storage body.
4. Inspect the mock target's attachment upload calls.

**Expected Outcome**:
- The Storage body contains `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullsha256>.svg"/></ac:image>` where `<fullsha256>` is the 64-character hex sha256 of the SVG bytes (NOT truncated to 24 chars).
- `uploadAttachment` was called exactly once with `Artifact { bytes: <SVG>, mime: "image/svg+xml", hash: <fullsha256>, kind: "mermaid" }`.
- The mock target's attachment list contains the filename.
- `PageBinding.attachmentHashes` contains the hash.

**Postconditions**:
- The uploaded attachment is reusable on the next run (TC-MERM-003).

**Notes / Clarifications**:
- The mock Kroki adapter returns the same SVG bytes for the same diagram source, making the hash deterministic in CI.
- Real Kroki determinism is validated manually (not in CI — network-dependent).

---

#### TC-MERM-002 - Golden fixture — Storage XHTML structure with mocked renderer

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-1, NFR-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts` (extend existing file)
**Tags**: @backend, @golden

**Preconditions**:
- A mocked `Renderer` that returns fixed SVG bytes for a mermaid fence.
- A Markdown doc with a single mermaid fence.
- A golden fixture file `tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml` containing the expected XHTML structure.

**Steps**:
1. Parse the Markdown doc to MDAST, then convert to HAST.
2. Run the mermaid transform with the mocked renderer and `policy = "render"`.
3. Render the transformed HAST to Storage format.
4. Assert the rendered body matches the committed golden fixture.

**Expected Outcome**:
- The rendered body contains `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullsha256>.svg"/></ac:image>` where `<fullsha256>` is the 64-character hex sha256 of the fixed SVG bytes.
- The golden fixture captures the XHTML STRUCTURE, not the SVG bytes themselves (the SVG bytes are mocked, so they're stable).
- `toMatchSnapshot` regression layer catches unintended changes.

**Postconditions**:
- Golden fixture must be updated consciously via `bun test --update-snapshots` only if the XHTML structure is intentionally changed.

**Notes / Clarifications**:
- This is a golden fixture for the XHTML structure, not for the SVG bytes (Kroki output is non-deterministic).
- The mocked renderer ensures the SVG bytes are the same on every run, making the hash stable for golden comparison.
- If the coder finds the existing `tests/golden/markdown/storage-renderer.test.ts` structure, they should add a new `describe` block for mermaid render policy.

---

#### TC-MERM-003 - Attachment reuse — unchanged → 0 uploads

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-2, NFR-2, NFR-PERF-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- A mock Kroki adapter that returns fixed SVG bytes for a given diagram source.
- A mock `TargetSystem` that records `uploadAttachment` / `attachmentExists` calls and can be programmed to return `exists=true/false`.
- A Markdown doc with a single mermaid fence.
- A first run has already uploaded the attachment.

**Steps**:
1. First run: Create a plan from the doc with `config.render.mermaid.policy = "render"`. Apply the plan. Program the mock to return `exists=false` on the first run.
2. Second run: Create a plan from the **unchanged** doc with the same policy. Apply the plan. Program the mock to return `exists=true` on the second run.
3. Inspect the mock target's call counts.

**Expected Outcome**:
- First run: `uploadAttachment` called exactly once.
- Second run: `attachmentExists` called once, `uploadAttachment` called **0** times.
- The second run reuses the existing attachment (idempotent rerun).

**Postconditions**:
- `PageBinding.attachmentHashes` contains the hash on both runs.

**Notes / Clarifications**:
- This proves NFR-PERF-4 idempotency: unchanged diagrams do not re-upload.
- The mermaid transform produces the same hash on both runs because the SVG bytes from the mocked Kroki adapter are the same.

---

#### TC-MERM-004 - Policy activation — render vs code vs skip

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-5, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/mermaid/transform.test.ts`
**Tags**: @backend

**Preconditions**:
- A stubbed `Renderer` that returns fixed SVG bytes.
- A HAST tree with a single mermaid fence.

**Steps**:
1. Call the mermaid transform with `policy = "render"`. Inspect the transformed HAST.
2. Call the mermaid transform with `policy = "code"`. Inspect the transformed HAST.
3. Call the mermaid transform with `policy = "skip"`. Inspect the transformed HAST.

**Expected Outcome**:
- `policy = "render"`: The `pre` element is replaced with an `img` node (properties.src = `marksync-mermaid-<fullsha256>.svg`).
- `policy = "code"`: The `pre` element is unchanged (passes through to `codeMacro`).
- `policy = "skip"`: The `pre` element is unchanged.
- `render` policy produces one `Artifact`; `code`/`skip` produce zero artifacts.

**Postconditions**:
- `render` policy is opt-in (default is `code` per GH-25).

**Notes / Clarifications**:
- This tests the policy gating logic in the transform itself, not the `computePlan` wiring (that's tested in integration).

---

#### TC-MERM-005 - Network fallback — HTTP error → code block + warning

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-4, NFR-5, DM-6
**Test Type(s)**: Unit + Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`, `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- A stubbed `Renderer` that returns `err({ kind: "RemoteUnreachable", status: 503, cause: "Service Unavailable" })`.
- A HAST tree with a single mermaid fence (unit) or a Markdown doc with a mermaid fence (integration).

**Steps (unit)**:
1. Call the Kroki adapter with a diagram source; program the mocked `fetch` to return HTTP 503.
2. Inspect the returned `Result`.

**Steps (integration)**:
1. Create a plan from the doc with `config.render.mermaid.policy = "render"` using the failing renderer.
2. Apply the plan.
3. Inspect the rendered Storage body and plan warnings.

**Expected Outcome (unit)**:
- The adapter returns `err({ kind: "RemoteUnreachable", status: 503, cause: "..." })`.

**Expected Outcome (integration)**:
- The Storage body contains the original mermaid fence as a code block (`<ac:structured-macro ac:name="code">` with `language=mermaid`).
- The Storage body does NOT contain `<ac:image>` or `<ri:attachment>`.
- The plan output includes a warning like "Mermaid render failed for diagram at <sourcePath>: Service Unavailable — falling back to code block".
- `uploadAttachment` was called **0** times.

**Postconditions**:
- No silent failure (ADR-0002 C-2).
- The run continues (per-document isolation).

**Notes / Clarifications**:
- This is a fault-injection scenario; mocking the renderer (or `fetch` at the adapter boundary) is allowed per the over-mocking guardrail.

---

#### TC-MERM-006 - Per-document isolation — one doc fails, run continues

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-4, NFR-6
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- A stubbed `Renderer` that returns `RemoteUnreachable` for a specific diagram source (doc B) and succeeds for another (doc A).
- Two Markdown docs: doc A with a mermaid fence that renders successfully, doc B with a mermaid fence that fails.

**Steps**:
1. Create a plan from both docs with `config.render.mermaid.policy = "render"`.
2. Apply the plan.
3. Inspect the rendered bodies for both docs.

**Expected Outcome**:
- Doc A's Storage body contains `<ac:image><ri:attachment ri:filename="..."/></ac:image>` (render succeeded).
- Doc B's Storage body contains the original mermaid fence as a code block (render failed).
- The plan output includes a warning for doc B but NOT for doc A.
- The run completes successfully (does not abort on doc B's failure).

**Postconditions**:
- Per-document isolation: one doc's RemoteUnreachable does not abort the run.

**Notes / Clarifications**:
- This proves NFR-6: per-document isolation ensures the run continues even if some docs fail to render.

---

#### TC-MERM-007 - Determinism — same source → same hash → same filename (full sha256)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-5, NFR-3, DM-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/mermaid/transform.test.ts` (hashing) or `tests/unit/infra/mermaid/kroki.test.ts` (hashing)
**Tags**: @backend

**Preconditions**:
- A stubbed `Renderer` that returns fixed SVG bytes for a given diagram source.
- A mermaid fence with a specific diagram source.

**Steps**:
1. Call the mermaid transform with the same diagram source three times.
2. Extract the `Artifact.hash` and the `img` node's `src` property (filename) from each result.

**Expected Outcome**:
- All three hashes are identical (64-character hex sha256 of the SVG bytes).
- All three filenames are identical (`marksync-mermaid-<fullsha256>.svg`).
- The hash is 64 hex characters (full sha256), NOT truncated to 24 chars.
- The filename contains the full hash (64 hex chars) followed by `.svg`.

**Postconditions**:
- Determinism enables idempotency (TC-MERM-003).

**Notes / Clarifications**:
- This tests the determinism of the hashing, not the determinism of Kroki itself (which is non-deterministic across environments and validated manually).
- The PM decision override explicitly requires the full sha256 hash in the filename (not truncated to 24 chars).
- The existing `src/infra/confluence/attachments.ts` `attachmentFilename()` already produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"`.

---

#### TC-MERM-008 - Privacy warning — one-time warning for `render` policy

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-6, NFR-4, NFR-PRIV-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @api

**Preconditions**:
- A stubbed `Renderer` that returns fixed SVG bytes.
- A Markdown doc with a single mermaid fence.

**Steps**:
1. Create a plan from the doc with `config.render.mermaid.policy = "render"`. Inspect plan warnings.
2. Create a plan from the same doc with `config.render.mermaid.policy = "code"`. Inspect plan warnings.
3. Create a plan from the same doc with `config.render.mermaid.policy = "skip"`. Inspect plan warnings.

**Expected Outcome**:
- `policy = "render"`: The plan warnings contain "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use" exactly once.
- `policy = "code"`: The plan warnings do NOT contain the privacy warning.
- `policy = "skip"`: The plan warnings do NOT contain the privacy warning.

**Postconditions**:
- Privacy warning is one-time per run (not per diagram).

**Notes / Clarifications**:
- This satisfies NFR-PRIV-2 ("Any path sending diagram content to a remote service is off by default with a warning").
- The warning is emitted once per run when the mermaid transform is active with the remote Kroki endpoint.

---

#### TC-MERM-009 - In-doc dedup — same mermaid twice → one Artifact

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/mermaid/transform.test.ts`
**Tags**: @backend

**Preconditions**:
- A stubbed `Renderer` that returns fixed SVG bytes for a given diagram source.
- A HAST tree with two identical mermaid fences (same diagram source).

**Steps**:
1. Call the mermaid transform with the HAST.
2. Inspect the transformed HAST and the returned `artifacts` array.

**Expected Outcome**:
- The `artifacts` array contains exactly one `Artifact`.
- Both `pre` elements are replaced with `img` nodes.
- Both `img` nodes have the same `src` property (`marksync-mermaid-<fullsha256>.svg`).

**Postconditions**:
- In-doc dedup reduces upload calls (one upload for N identical fences).

**Notes / Clarifications**:
- This tests the dedup logic within a single document.
- Cross-page dedup is out of scope (same as GH-26 NG-7).

---

#### TC-MERM-010 - Timeout safety — Kroki timeout → `RemoteUnreachable`

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-7, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend

**Preconditions**:
- A mocked `fetch` that simulates a timeout (e.g., `AbortError` or hangs beyond 30s).
- A diagram source.

**Steps**:
1. Call the Kroki adapter with a mocked `fetch` that times out.
2. Inspect the returned `Result`.

**Expected Outcome**:
- The adapter returns `err({ kind: "RemoteUnreachable", cause: "..." })` (status may be undefined for network error).
- The timeout does NOT hang the test.

**Postconditions**:
- Timeout safety prevents indefinite hangs (RSK-7).

**Notes / Clarifications**:
- The spec suggests a 30s timeout; the exact value can be tuned at implementation time.
- This is a fault-injection scenario; mocking `fetch` is allowed per the over-mocking guardrail.

---

#### TC-MERM-011 - No secrets in filenames/output (INV-SEC-1)

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-8, INV-SEC-1, NFR-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/mermaid/mermaid-render.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A stubbed `Renderer` that returns fixed SVG bytes for a mermaid fence.
- A Markdown doc with a mermaid fence whose diagram source happens to contain a fake token string (e.g., `AKIAIOSFODNN7EXAMPLE`).

**Steps**:
1. Create a plan from the doc with `config.render.mermaid.policy = "render"`.
2. Apply the plan.
3. Inspect the rendered Storage body, the plan JSON, and the apply report.

**Expected Outcome**:
- The filename is `marksync-mermaid-<sha256>.svg` where `<sha256>` is the hash of the SVG bytes (not the token string).
- The rendered Storage body does NOT contain the fake token.
- The plan JSON does NOT contain the fake token.
- The apply report does NOT contain the fake token.
- The token appears **0** times in all output paths.

**Postconditions**:
- INV-SEC-1 / NFR-SEC-1: no secrets in any output path.

**Notes / Clarifications**:
- Mermaid source may contain secrets (user data), but the filename is the content hash, not the source text.
- This is similar to GH-26 AC-10 (no secrets in asset filenames/output).

## 6. Environments and Test Data

### 6.1 Environments

- **Local dev**: All unit and integration tests run locally via `bun test`.
- **CI (GitHub Actions)**: Fast loop (every push) runs unit + integration + golden tests. E2E live-sandbox is a separate gate.
- **Manual validation**: Real Kroki determinism is validated manually (not in CI — network-dependent).

### 6.2 Test Data

- **Mermaid diagram fixtures**: Simple valid mermaid sources (e.g., `graph TD; A-->B`).
- **SVG byte fixtures**: Fixed SVG bytes returned by the mocked Kroki adapter (e.g., `<svg>...</svg>`). The same bytes for the same source ensure determinism in CI.
- **Token-in-source fixture**: A mermaid fence whose source contains a fake token string (e.g., `AKIAIOSFODNN7EXAMPLE`) to test no secrets in output (TC-MERM-011).
- **Error fixtures**: HTTP status codes (4xx, 5xx) for network failure testing.

### 6.3 Isolation Strategy

- **Unit tests**: No external state; each test is self-contained.
- **Integration tests**: Mock `TargetSystem` and mock Kroki adapter ensure isolation; no real network calls.
- **Golden fixtures**: Committed `.storage.xhtml` files; version-controlled and reviewed.

## 7. Automation Plan and Implementation Mapping

| TC ID | Test file to create/update | Execution command | Mocking requirements | Implementation status |
|-------|---------------------------|-------------------|----------------------|----------------------|
| TC-MERM-001 | `tests/integration/app/mermaid/mermaid-render.test.ts` (create) | `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Mock Kroki adapter, mock `TargetSystem` | To Implement |
| TC-MERM-002 | `tests/golden/markdown/storage-renderer.test.ts` (extend) | `bun test tests/golden/markdown/storage-renderer.test.ts` | Mock `Renderer` | To Implement |
| TC-MERM-003 | `tests/integration/app/mermaid/mermaid-render.test.ts` (extend) | `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Mock Kroki adapter, mock `TargetSystem` with `exists=true/false` | To Implement |
| TC-MERM-004 | `tests/unit/domain/mermaid/transform.test.ts` (create) | `bun test tests/unit/domain/mermaid/transform.test.ts` | Stub `Renderer` | To Implement |
| TC-MERM-005 | `tests/unit/infra/mermaid/kroki.test.ts` (create), `tests/integration/app/mermaid/mermaid-render.test.ts` (extend) | `bun test tests/unit/infra/mermaid/kroki.test.ts`, `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Mock `fetch` (unit), stub `Renderer` (integration) | To Implement |
| TC-MERM-006 | `tests/integration/app/mermaid/mermaid-render.test.ts` (extend) | `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Stub `Renderer` that fails for one doc | To Implement |
| TC-MERM-007 | `tests/unit/domain/mermaid/transform.test.ts` (extend) or `tests/unit/infra/mermaid/kroki.test.ts` (extend) | `bun test tests/unit/domain/mermaid/transform.test.ts` or `bun test tests/unit/infra/mermaid/kroki.test.ts` | Stub `Renderer` | To Implement |
| TC-MERM-008 | `tests/integration/app/mermaid/mermaid-render.test.ts` (extend) | `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Stub `Renderer` | To Implement |
| TC-MERM-009 | `tests/unit/domain/mermaid/transform.test.ts` (extend) | `bun test tests/unit/domain/mermaid/transform.test.ts` | Stub `Renderer` | To Implement |
| TC-MERM-010 | `tests/unit/infra/mermaid/kroki.test.ts` (extend) | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Mock `fetch` with timeout | To Implement |
| TC-MERM-011 | `tests/integration/app/mermaid/mermaid-render.test.ts` (extend) | `bun test tests/integration/app/mermaid/mermaid-render.test.ts` | Stub `Renderer` | To Implement |

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| RSK-TST-1 | Over-mocking the mermaid transform | High | Follow over-mocking guardrail: test transform with real HAST trees and stubbed `Renderer` (adapter boundary), not mocked HAST walk or hashing. |
| RSK-TST-2 | Golden fixture flakiness due to non-deterministic SVG bytes | Medium | Golden fixture tests the XHTML STRUCTURE with mocked renderer returning fixed SVG bytes; SVG bytes themselves are not golden-stable. |
| RSK-TST-3 | Test assumes full sha256 in filename (PM decision override) | Medium | Document the PM decision override explicitly in test notes; verify that `attachmentFilename()` produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"`. |
| RSK-TST-4 | Real Kroki determinism not validated in CI | Low | Document that real Kroki determinism is validated manually (network-dependent); CI uses mocked renderer for determinism. |

### 8.2 Assumptions

- The public Kroki API (`https://kroki.io/mermaid/svg`) is reachable for manual validation (not for CI tests).
- The mocked Kroki adapter returning fixed SVG bytes is sufficient to prove determinism in CI.
- The existing `attachmentFilename()` from GH-26 produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"` (verified per spec §16).
- The mermaid transform runs AFTER `mdastToHast` and BEFORE `target.renderBody` (per spec §5.1 F-3).
- The privacy warning is emitted once per run when the mermaid transform is active (per spec §5.1 F-5).

### 8.3 Open Questions

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-TST-1 | Should the golden fixture file be `mermaid-render-policy.storage.xhtml`? | TC-MERM-002 needs a committed golden fixture. | Open (resolved at implementation) |
| OQ-TST-2 | Should the privacy warning assertion be in unit or integration tests? | TC-MERM-008 is integration-level; could also have a unit test for the warning emission logic. | Open (recommendation: integration for end-to-end warning, unit for warning logic) |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | test-plan-writer (AI-assisted) | Initial test plan |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|