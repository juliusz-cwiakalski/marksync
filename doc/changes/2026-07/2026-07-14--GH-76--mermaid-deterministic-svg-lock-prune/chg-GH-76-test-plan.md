---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-76-test-plan
status: Proposed
created: 2026-07-14T00:00:00Z
last_updated: 2026-07-14T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high, mermaid, kroki]
version_impact: patch
summary: "Fix non-deterministic Mermaid SVG rendering and additive lock-merge to restore idempotent syncs, stop lock file growth, and ensure no-op syncs classify as NO_CHANGE"
links:
  change_spec: ./chg-GH-76-spec.md
  implementation_plan: ./chg-GH-76-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Mermaid SVG attachments regenerated on every sync — lock file grows indefinitely

## 1. Scope and Objectives

This test plan validates the fix for non-deterministic Mermaid SVG rendering and additive lock-merge (GH-76). The core behaviors to protect are:

- **Deterministic rendering**: Same Mermaid source + same render config → identical SVG content hash across syncs
- **Lock file stability**: Per-page attachment hashes are replaced (not merged), preventing indefinite accumulation of stale entries
- **Idempotent no-op syncs**: Unchanged content (body + attachments) classifies as `NO_CHANGE`, not `LOCAL_AHEAD`, with 0 writes

Data integrity risks addressed:
- Lock file growing without bound (e.g., 11 diagrams → 55 attachment entries across 10 syncs)
- Unnecessary attachment uploads on every sync (storage bloat on Confluence)
- False-positive classification of unchanged content as `LOCAL_AHEAD`

## 2. References

- Change specification: `chg-GH-76-spec.md`
- Implementation plan: `chg-GH-76-plan.md` (if present)
- Testing strategy: `.ai/rules/testing-strategy.md` (6-tier strategy)
- Feature spec: `doc/spec/features/feature-mermaid-rendering.md` (§3.2 attachment identity, §3.3 normalization rules)
- ADR-0002: `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` (determinism, security)
- ADR-0005: `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md` (Storage renderer)
- NFR-PERF-4: `doc/spec/nonfunctional.md` (idempotent rerun invariant)
- Existing tests:
  - `tests/unit/infra/mermaid/kroki.test.ts` — Kroki adapter unit tests
  - `tests/unit/domain/mermaid/transform.test.ts` — HAST transform unit tests
  - `tests/golden/markdown/mermaid-render-golden.test.ts` — golden fixtures

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Same source + config ×2 renders → identical hash | TC-MERM-DETM-001, TC-MERM-DETM-002 | ✅ Covered |
| AC-F1-2 | Config passthrough to Kroki (deterministic-ids, html-labels) | TC-MERM-DETM-003, TC-MERM-DETM-004 | ✅ Covered |
| AC-F2-1 | SVG normalization → stable hash for non-deterministic differences | TC-MERM-NORM-001, TC-MERM-NORM-002 | ✅ Covered |
| AC-F2-2 | Normalized SVG has 0 structural differences from raw SVG | TC-MERM-NORM-003 | ✅ Covered |
| AC-F3-1 | Bloated lock → pruned on Update outcome | TC-LOCK-001, TC-LOCK-002 | ✅ Covered |
| AC-F3-2 | NO_CHANGE outcome → preserves existing attachmentHashes | TC-LOCK-003 | ✅ Covered |
| AC-F3-3 | Second sync unchanged → 0 uploadAttachment calls | TC-E2E-001, TC-E2E-002 | ✅ Covered |
| AC-F3-4 | Unchanged content → NO_CHANGE classification | TC-E2E-003 | ✅ Covered |
| AC-QG-1 | `bun run check` exits 0 | TC-QG-001 | ✅ Covered |

### 3.2 Interface Coverage (DM-#, API-#)

| Interface ID | Description | TC ID(s) | Status |
|--------------|-------------|----------|--------|
| DM-1 | `Renderer` port contract (carries MermaidRenderConfig) | TC-MERM-DETM-001, TC-MERM-DETM-003 | ✅ Covered |
| DM-2 | `PageBinding.attachmentHashes` (replace vs merge semantics) | TC-LOCK-001, TC-LOCK-002, TC-LOCK-003 | ✅ Covered |
| DM-3 | `Artifact` content (normalized SVG bytes, hash of normalized) | TC-MERM-NORM-001, TC-MERM-NORM-002 | ✅ Covered |
| HTTP | Kroki API (POST with diagram options as query params) | TC-MERM-DETM-003, TC-MERM-DETM-004 | ✅ Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | SVG determinism (100% of cases) | TC-MERM-DETM-001, TC-MERM-DETM-002 | ✅ Covered |
| NFR-2 | Attachment reuse (0 uploads on second sync) | TC-E2E-001, TC-E2E-002 | ✅ Covered |
| NFR-3 | Lock pruning (count == current) | TC-LOCK-001, TC-LOCK-002 | ✅ Covered |
| NFR-4 | No-op classification (NO_CHANGE) | TC-E2E-003 | ✅ Covered |
| NFR-5 | Config passthrough (deterministicIds, htmlLabels) | TC-MERM-DETM-003, TC-MERM-DETM-004 | ✅ Covered |
| NFR-6 | Normalization safety (0 structural differences) | TC-MERM-NORM-003 | ✅ Covered |
| NFR-7 | Per-document isolation | TC-E2E-004 | ✅ Covered |
| NFR-8 | Network fallback | TC-MERM-NORM-004 | ✅ Covered |
| NFR-9 | Quality gate (bun run check) | TC-QG-001 | ✅ Covered |

## 4. Test Types and Layers

This test plan follows the 6-tier testing strategy from `.ai/rules/testing-strategy.md`:

### Unit Tests (`tests/unit/`)
- **Framework**: `bun:test`
- **Scope**: Pure domain logic and infra adapters with mock fetch
- **Location**:
  - `tests/unit/infra/mermaid/kroki.test.ts` — KrokiClient config passthrough and normalization
  - `tests/unit/domain/mermaid/transform.test.ts` — HAST transform config forwarding
  - `tests/unit/app/push-flow.test.ts` — lock pruning in `finalizeSuccessfulUpdate`
- **Mocking**: Allowed for fault injection (HTTP errors) and adapter boundaries (Bun.serve mock for Confluence)

### Integration Tests (`tests/integration/`)
- **Framework**: `bun:test` + `Bun.serve()` mock
- **Scope**: Confluence adapter, push executor, asset pipeline with Mermaid artifacts
- **Location**: `tests/integration/confluence/client.test.ts` (attachmentExists, uploadAttachment)
- **Mocking**: Mock TargetSystem port with asset tracking

### Golden Fixture Tests (`tests/golden/`)
- **Framework**: `bun:test` `toMatchSnapshot` / `toMatchInlineSnapshot`
- **Scope**: Storage renderer output (XHTML structure) and Mermaid SVG output
- **Location**: `tests/golden/markdown/mermaid-render-golden.test.ts`
- **Stability**: Byte-stable across runs; snapshot updates require explicit `bun test --update-snapshots`

### E2E Tests (`tests/e2e/`)
- **Framework**: Thin runner script
- **Scope**: Real Confluence test space with Mermaid diagrams under `render` policy
- **Location**: `tests/e2e/sandbox-publish.test.ts` (add no-op sync scenarios)
- **Execution**: Separate CI gate (scheduled or labelled 'run-e2e')

### Contract Tests (Embedded in Integration)
- **Scope**: Kroki API contract (POST with diagram options)
- **Location**: `tests/unit/infra/mermaid/kroki.test.ts` (AC-F1-2)

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-MERM-DETM-001 | Same source + config ×2 renders → identical hash | Happy Path | Critical | High | AC-F1-1 |
| TC-MERM-DETM-002 | Different configs → different hashes | Happy Path | Important | Medium | AC-F1-1 |
| TC-MERM-DETM-003 | Config passthrough to Kroki (query params) | Happy Path | Critical | High | AC-F1-2 |
| TC-MERM-DETM-004 | securityLevel NOT passed to Kroki | Negative | Important | Medium | AC-F1-2 |
| TC-MERM-NORM-001 | SVG normalization → stable hash for non-deterministic differences | Happy Path | Critical | High | AC-F2-1 |
| TC-MERM-NORM-002 | Normalization rules (strip comments, sort attributes, rewrite IDs) | Happy Path | Important | Medium | AC-F2-1 |
| TC-MERM-NORM-003 | Normalized SVG has 0 structural differences from raw SVG | Happy Path | Critical | High | AC-F2-2 |
| TC-MERM-NORM-004 | Network fallback → code block + warning | Negative | Important | Medium | NFR-8 |
| TC-LOCK-001 | Bloated lock (55 entries) → pruned on Update | Happy Path | Critical | High | AC-F3-1 |
| TC-LOCK-002 | Replace vs merge semantics in finalizeSuccessfulUpdate | Happy Path | Critical | High | AC-F3-1 |
| TC-LOCK-003 | NO_CHANGE outcome → preserves existing attachmentHashes | Edge Case | Important | Medium | AC-F3-2 |
| TC-E2E-001 | End-to-end no-op sync with Mermaid diagrams | Happy Path | Critical | High | AC-F3-3, AC-F3-4 |
| TC-E2E-002 | Second sync unchanged → 0 uploadAttachment calls (mock target) | Happy Path | Critical | High | AC-F3-3 |
| TC-E2E-003 | Unchanged content → NO_CHANGE classification | Happy Path | Critical | High | AC-F3-4 |
| TC-E2E-004 | Per-document isolation on render failure | Edge Case | Important | Medium | NFR-7 |
| TC-QG-001 | Quality gate: bun run check exits 0 | Happy Path | Critical | High | AC-QG-1 |

### 5.2 Scenario Details

#### TC-MERM-DETM-001 - Same source + config ×2 renders → identical hash

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, AC-F1-1, NFR-1, NFR-2
**Test Type(s)**: Unit, Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @kroki

**Preconditions**:
- KrokiClient instantiated with `MermaidRenderConfig` (`deterministicIds: true`, `htmlLabels: false`)
- Fetch stub returns consistent SVG bytes (stripped of non-deterministic elements)
- Normalization function implemented (strip comments, sort attributes, rewrite IDs)

**Steps**:
1. Render a Mermaid diagram source (e.g., `graph TD; A-->B`) with config
2. Capture the artifact hash from the first render
3. Render the same source with the same config again
4. Capture the artifact hash from the second render
5. Compare the two hashes

**Expected Outcome**:
- Both hashes are identical (64-char sha256 hex)
- Artifact.bytes are byte-identical after normalization
- Artifact.kind is `mermaid`
- Artifact.mime is `image/svg+xml`

**Notes / Clarifications**:
- This validates the combined effect of config passthrough (F-1) and normalization (F-2)
- Mock Kroki response should include non-deterministic elements (random IDs) to prove normalization works

---

#### TC-MERM-DETM-002 - Different configs → different hashes

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, AC-F1-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @kroki

**Preconditions**:
- KrokiClient instantiated with different configs
- Fetch stub returns SVG that changes based on config

**Steps**:
1. Render a Mermaid source with `deterministicIds: true`, `htmlLabels: false`
2. Capture hash A
3. Render the same source with `deterministicIds: true`, `htmlLabels: true`
4. Capture hash B
5. Compare hash A and hash B

**Expected Outcome**:
- Hash A ≠ Hash B (different config → different rendered output)
- Both hashes are stable (re-rendering with same config produces same hash)

**Notes / Clarifications**:
- Validates that config changes affect the rendered output
- In real Kroki, `htmlLabels: true` produces different SVG structure

---

#### TC-MERM-DETM-003 - Config passthrough to Kroki (query params)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, NFR-5, DM-1
**Test Type(s)**: Unit, Contract
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @kroki, @api

**Preconditions**:
- KrokiClient instantiated with `MermaidRenderConfig`
- Fetch stub captures request URL and init object

**Steps**:
1. Call `client.render(source)` with `deterministicIds: true`, `htmlLabels: false`, `securityLevel: strict`
2. Inspect the fetch URL captured by the stub
3. Verify query parameters are present

**Expected Outcome**:
- URL contains `deterministic-ids=true` (kebab-case)
- URL contains `html-labels=false` (kebab-case)
- URL does NOT contain `securityLevel` (blocked by Kroki)
- POST body is the Mermaid source (unchanged from GH-69)
- Content-Type header is `text/plain` (unchanged from GH-69)

**Notes / Clarifications**:
- Validates Kroki's diagram-options API (https://docs.kroki.io/kroki/setup/diagram-options/)
- Naming convention: camelCase → kebab-case

---

#### TC-MERM-DETM-004 - securityLevel NOT passed to Kroki

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, AC-F1-2, NFR-5, DEC-1
**Test Type(s)**: Unit, Contract
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @kroki, @api

**Preconditions**:
- KrokiClient instantiated with `securityLevel: strict`

**Steps**:
1. Call `client.render(source)` with `securityLevel: strict`
2. Inspect the fetch URL captured by the stub

**Expected Outcome**:
- URL does NOT contain `securityLevel` or `security-level`
- Kroki enforces `strict` by default (verified via docs, not tested)

**Notes / Clarifications**:
- Per DEC-1, `securityLevel` is blocked by Kroki and not passed
- This is a negative test (absence of a parameter)

---

#### TC-MERM-NORM-001 - SVG normalization → stable hash for non-deterministic differences

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, NFR-1, NFR-6, DM-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @normalization

**Preconditions**:
- Two SVG byte arrays that differ only in non-deterministic elements (random IDs, marker names, comments, whitespace)

**Steps**:
1. Normalize SVG A (strip comments, sort attributes, rewrite IDs to stable sequence, canonicalize whitespace)
2. Normalize SVG B (same normalization)
3. Hash the normalized SVGs
4. Compare the hashes

**Expected Outcome**:
- Normalized SVG A and normalized SVG B are byte-identical
- Hash(normalized A) === Hash(normalized B)
- Normalization does NOT alter semantic elements (structural tags, text, paths)

**Notes / Clarifications**:
- Normalization rules follow `feature-mermaid-rendering.md` §3.3:
  - Strip XML comments
  - Sort attributes per element (alphabetical by name)
  - Rewrite non-deterministic IDs to `m-1`, `m-2`, etc. (stable sequence)
  - Canonicalize whitespace (normalize line endings, collapse sequences)
  - Strip ephemeral metadata (font declarations, timestamps)

---

#### TC-MERM-NORM-002 - Normalization rules (strip comments, sort attributes, rewrite IDs)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2, AC-F2-1, NFR-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/mermaid/kroki.test.ts`
**Tags**: @backend, @mermaid, @normalization

**Preconditions**:
- SVG with all non-deterministic elements present

**Steps**:
1. Parse SVG with a DOM parser
2. Apply normalization rules:
   - Strip `<!-- comment -->`
   - Sort attributes: `<rect id="x" y="10" width="100" />` → `<rect width="100" x="" y="10" />`
   - Rewrite random IDs: `flowchart-123-456` → `m-1`, `marker-abc` → `m-2`
   - Canonicalize whitespace
3. Serialize back to bytes

**Expected Outcome**:
- Comments removed
- Attributes sorted alphabetically
- IDs rewritten to stable `m-<n>` sequence
- Whitespace canonicalized
- Semantic SVG structure unchanged (no changes to tags, paths, text)

**Notes / Clarifications**:
- This is a white-box test of normalization internals
- Each rule can be tested in isolation

---

#### TC-MERM-NORM-003 - Normalized SVG has 0 structural differences from raw SVG

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-2, NFR-6
**Test Type(s)**: Golden Fixture, Mermaid-DOM
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/mermaid-render-golden.test.ts`
**Tags**: @backend, @mermaid, @normalization, @golden

**Preconditions**:
- Raw SVG from Kroki (with non-deterministic elements)
- Normalized SVG (stripped of non-deterministic elements)
- Headless DOM environment (happy-dom)

**Steps**:
1. Render raw SVG in a DOM container
2. Render normalized SVG in a separate DOM container
3. Compare the two renders visually (via screenshot or DOM inspection)

**Expected Outcome**:
- 0 structural differences (identical elements, attributes, text content)
- Differences only in internal IDs and metadata (not visible)

**Notes / Clarifications**:
- Golden fixture approach: commit a screenshot or DOM snapshot of the rendered SVG
- If visual diff is not feasible, validate that structural elements (paths, text, positions) are identical

---

#### TC-MERM-NORM-004 - Network fallback → code block + warning

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-8, carry-over from GH-69
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/mermaid/transform.test.ts`
**Tags**: @backend, @mermaid, @network-fallback

**Preconditions**:
- Renderer that always errors (network failure simulation)

**Steps**:
1. Transform a HAST tree with a Mermaid fence
2. Renderer returns error
3. Inspect the transformed HAST

**Expected Outcome**:
- Original `pre > code.language-mermaid` is preserved (no `img` injection)
- Warning emitted: "Mermaid render failed... falling back to code block"
- 0 artifacts in result

**Notes / Clarifications**:
- Validates NFR-8 (never silent drop)
- Per-document isolation: one doc's render failure doesn't abort the run

---

#### TC-LOCK-001 - Bloated lock (55 entries) → pruned on Update

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-3, DM-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/push-flow.test.ts`
**Tags**: @backend, @lock, @pruning, @integration

**Preconditions**:
- Mock TargetSystem with mocked `updatePage`, `uploadAssets`, `attachmentExists`
- Lock file with bloated `attachmentHashes` (55 entries from pre-fix syncs)
- Current run produces 11 Mermaid artifacts (11 diagrams)
- Mermaid artifacts use normalized hashes (stable)

**Steps**:
1. Compute a plan with 11 Mermaid diagrams under `render` policy
2. Apply the plan (Update outcome)
3. Inspect the lock file after `finalizeSuccessfulUpdate`
4. Count entries in `binding.attachmentHashes`

**Expected Outcome**:
- `attachmentHashes` contains exactly 11 entries (current run's artifacts)
- Old 55 entries are pruned
- Lock file size reduces
- All 11 entries have stable hashes (match expected normalized hashes)

**Notes / Clarifications**:
- Validates replacement semantics: `attachmentHashes = currentRunAttachmentHashes` (not merge)
- Self-healing: first sync with the fix prunes accumulated entries

---

#### TC-LOCK-002 - Replace vs merge semantics in finalizeSuccessfulUpdate

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/push-flow.test.ts`
**Tags**: @backend, @lock, @pruning

**Preconditions**:
- Existing binding with `attachmentHashes: { "old-1": "hash-1", "old-2": "hash-2" }`
- Current run produces `assetUploadHashes: { "new-1": "hash-3" }`

**Steps**:
1. Call `finalizeSuccessfulUpdate` with existing binding and new hashes
2. Inspect the updated binding's `attachmentHashes`

**Expected Outcome**:
- `attachmentHashes` is `{ "new-1": "hash-3" }` (replace, not merge)
- Old entries `"old-1"`, `"old-2"` are removed
- Validates replacement semantics: `updatedBinding.attachmentHashes = assetUploadHashes`

**Notes / Clarifications**:
- This is a unit test of `finalizeSuccessfulUpdate` logic
- Before fix: `attachmentHashes = { ...binding.attachmentHashes, ...assetUploadHashes }` (additive merge)
- After fix: `attachmentHashes = assetUploadHashes` (replacement)

---

#### TC-LOCK-003 - NO_CHANGE outcome → preserves existing attachmentHashes

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-2, NFR-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/push-flow.test.ts`
**Tags**: @backend, @lock, @noop, @integration

**Preconditions**:
- Existing binding with `attachmentHashes: { "file-1": "hash-1" }`
- Plan classifies as `NO_CHANGE` (unchanged content)
- No `finalizeSuccessfulUpdate` call for NO_CHANGE

**Steps**:
1. Compute a plan with unchanged content
2. Apply the plan (NO_CHANGE outcome)
3. Inspect the lock file

**Expected Outcome**:
- `attachmentHashes` remains `{ "file-1": "hash-1" }` (preserved unchanged)
- No lock update occurs for NO_CHANGE outcomes

**Notes / Clarifications**:
- Validates that pruning only happens on Update/Create outcomes
- NO_CHANGE outcomes skip `finalizeSuccessfulUpdate`, so existing entries are preserved

---

#### TC-E2E-001 - End-to-end no-op sync with Mermaid diagrams

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-F3-3, AC-F3-4, NFR-2, NFR-4
**Test Type(s)**: E2E, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e/sandbox-publish.test.ts` (add scenario)
**Tags**: @backend, @e2e, @mermaid, @noop, @integration

**Preconditions**:
- Real Confluence test space (sandbox)
- Test page with 3 Mermaid diagrams under `render` policy
- First sync completed successfully (pages created, attachments uploaded)
- Lock file contains stable attachment hashes (normalized)
- Unchanged Markdown source (no edits)

**Steps**:
1. Run `marksync sync` again (second sync)
2. Inspect the plan classification
3. Inspect the apply report (writes, uploads)
4. Inspect the lock file (attachmentHashes)

**Expected Outcome**:
- Classification: `NO_CHANGE` (not `LOCAL_AHEAD`)
- Apply report: 0 writes, 0 uploads
- Lock file: attachmentHashes unchanged (3 entries, not cumulative)
- 0 `uploadAttachment` calls (attachments reused)

**Notes / Clarifications**:
- This is the primary E2E validation of the bug fix
- Requires real Kroki responses (or mocked with normalization)
- Validates the full pipeline: config passthrough → normalization → stable hash → attachment reuse → NO_CHANGE

---

#### TC-E2E-002 - Second sync unchanged → 0 uploadAttachment calls (mock target)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-F3-3, NFR-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/push-flow.test.ts`
**Tags**: @backend, @mermaid, @attachment-reuse, @integration

**Preconditions**:
- Mock TargetSystem with tracking: count calls to `uploadAttachment` and `attachmentExists`
- First sync: all `attachmentExists` return false → uploads happen
- Second sync: `attachmentExists` return true (attachments exist on Confluence)

**Steps**:
1. First sync: compute and apply plan with Mermaid diagrams
2. Verify `uploadAttachment` called N times (N = number of diagrams)
3. Second sync: compute and apply plan (unchanged content)
4. Verify `uploadAttachment` called 0 times

**Expected Outcome**:
- First sync: `uploadAttachment` called N times, `attachmentExists` returns false N times
- Second sync: `uploadAttachment` called 0 times, `attachmentExists` returns true N times
- Validates NFR-PERF-4 (idempotent rerun → 0 writes)

**Notes / Clarifications**:
- This is a faster, CI-friendly alternative to TC-E2E-001 (mock vs real Confluence)
- Validates attachment reuse via hash-based dedup

---

#### TC-E2E-003 - Unchanged content → NO_CHANGE classification

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-F3-4, NFR-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/push-flow.test.ts`
**Tags**: @backend, @classification, @noop, @integration

**Preconditions**:
- Lock file with existing binding
- Remote state (page body, version, attachment hashes) matches lock base
- Local content (body, Mermaid sources, assets) unchanged from base

**Steps**:
1. Compute plan with unchanged content
2. Run `classify()` on the sync state
3. Inspect the result

**Expected Outcome**:
- `classify()` returns `NO_CHANGE` (not `LOCAL_AHEAD`)
- `localChanged = false` (body hash and attachment hash match base)
- `remoteChanged = false` (remote matches lock base)
- Validates that stable attachment hashes (from normalization) prevent false-positive classification

**Notes / Clarifications**:
- Before fix: non-deterministic attachment hashes → `localChanged = true` → `LOCAL_AHEAD`
- After fix: stable attachment hashes → `localChanged = false` → `NO_CHANGE`

---

#### TC-E2E-004 - Per-document isolation on render failure

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-7, carry-over from GH-69
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/confluence/push-flow.test.ts`
**Tags**: @backend, @mermaid, @isolation, @integration

**Preconditions**:
- Two docs in the plan:
  - Doc A: Mermaid fence that fails to render (network error)
  - Doc B: Mermaid fence that renders successfully
- Mock renderer: fails for Doc A's source, succeeds for Doc B's source

**Steps**:
1. Compute plan for both docs
2. Apply plan
3. Inspect outcomes for both docs

**Expected Outcome**:
- Doc A: `updated` or `noop` (depends on body change), but with warning (fallback to code block)
- Doc B: `updated` or `noop`, with rendered `img` node
- Run continues (does not abort on Doc A's render failure)
- Validates per-document isolation (NFR-7)

**Notes / Clarifications**:
- This is a carry-over NFR from GH-69
- Validated that the fix doesn't break per-document isolation

---

#### TC-QG-001 - Quality gate: bun run check exits 0

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-QG-1, NFR-9
**Test Type(s)**: Manual, CI Gate
**Automation Level**: Automated (CI)
**Target Layer / Location**: N/A (runs full test suite)
**Tags**: @quality-gate, @ci

**Preconditions**:
- All tests implemented and passing locally
- Implementation complete (F-1, F-2, F-3 implemented)

**Steps**:
1. Run `bun run check` (includes lint, typecheck, test)
2. Inspect exit code

**Expected Outcome**:
- Exit code 0 (success)
- All tests pass (unit, integration, golden, BDD)
- Lint passes
- Typecheck passes

**Notes / Clarifications**:
- This is the release-blocking quality gate
- CI runs this on every push (fast loop)

---

## 6. Environments and Test Data

### Local Development Environment
- **Runtime**: Bun (pinned version per `.github/workflows/ci.yml`)
- **Dependencies**: `happy-dom` for Mermaid-DOM tests (loaded via preload script)
- **Confluence**: Mocked via `Bun.serve()` for integration tests (no real Confluence needed for fast loop)
- **Kroki**: Mocked via fetch stub for unit tests (no real network calls)
- **Lock files**: In-memory for tests (no disk persistence except for lock-save tests)

### E2E Test Environment (Live Sandbox)
- **Confluence**: Dedicated test space, cleaned nightly
- **Credentials**: GitHub Actions secrets (never in repo)
- **Concurrency**: At most 1 concurrent E2E run (avoid version-conflict noise)
- **Test data**:
  - Markdown files with Mermaid diagrams under `render` policy
  - Pre-created lock files with bloated `attachmentHashes` (for TC-LOCK-001)
  - Unchanged Markdown sources (for no-op sync scenarios)

### Isolation Strategy
- **Unit tests**: In-memory, no disk I/O except lock-save tests (cleanup handled by test runner)
- **Integration tests**: Mock Confluence API via `Bun.serve()`; each test has isolated mock server
- **Golden fixtures**: Committed to repo; snapshot updates require explicit `--update-snapshots`
- **E2E tests**: Dedicated test space; per-test page cleanup or daily cleanup job

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File / Command | Execution Command | Mocking Requirements | Implementation Status |
|-------|---------------------|-------------------|---------------------|----------------------|
| TC-MERM-DETM-001 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Fetch stub returning consistent SVG bytes | To Implement |
| TC-MERM-DETM-002 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Fetch stub returning config-dependent SVG | To Implement |
| TC-MERM-DETM-003 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Fetch stub capturing URL and init | To Implement |
| TC-MERM-DETM-004 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Fetch stub capturing URL | To Implement |
| TC-MERM-NORM-001 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | Two non-deterministic SVG byte arrays | To Implement |
| TC-MERM-NORM-002 | `tests/unit/infra/mermaid/kroki.test.ts` | `bun test tests/unit/infra/mermaid/kroki.test.ts` | SVG with all non-deterministic elements | To Implement |
| TC-MERM-NORM-003 | `tests/golden/markdown/mermaid-render-golden.test.ts` | `bun test tests/golden/markdown/mermaid-render-golden.test.ts --preload ./tests/mermaid.preload.ts` | happy-dom for rendering | To Implement |
| TC-MERM-NORM-004 | `tests/unit/domain/mermaid/transform.test.ts` | `bun test tests/unit/domain/mermaid/transform.test.ts` | Stub renderer that always errors | Existing – No Change (from GH-69) |
| TC-LOCK-001 | `tests/integration/confluence/push-flow.test.ts` | `bun test tests/integration/confluence/push-flow.test.ts` | Mock TargetSystem with tracking | To Implement |
| TC-LOCK-002 | `tests/unit/app/push-flow.test.ts` | `bun test tests/unit/app/push-flow.test.ts` | In-memory lock file | To Implement |
| TC-LOCK-003 | `tests/integration/confluence/push-flow.test.ts` | `bun test tests/integration/confluence/push-flow.test.ts` | Mock TargetSystem | To Implement |
| TC-E2E-001 | `tests/e2e/sandbox-publish.test.ts` | `bun test tests/e2e/sandbox-publish.test.ts` (separate gate) | Real Confluence test space | To Implement |
| TC-E2E-002 | `tests/integration/confluence/push-flow.test.ts` | `bun test tests/integration/confluence/push-flow.test.ts` | Mock TargetSystem with call tracking | To Implement |
| TC-E2E-003 | `tests/integration/confluence/push-flow.test.ts` | `bun test tests/integration/confluence/push-flow.test.ts` | Mock TargetSystem and lock state | To Implement |
| TC-E2E-004 | `tests/integration/confluence/push-flow.test.ts` | `bun test tests/integration/confluence/push-flow.test.ts` | Mock renderer (partial failures) | To Implement |
| TC-QG-001 | N/A (full suite) | `bun run check` | N/A | To Implement (all tests must pass) |

### Test File Updates Required

#### `tests/unit/infra/mermaid/kroki.test.ts`
- **Existing tests**: TC-MERM success path, TC-MERM-005 network fallback, TC-MERM-010 timeout safety
- **New tests**:
  - TC-MERM-DETM-001: Determinism with config passthrough
  - TC-MERM-DETM-002: Different configs → different hashes
  - TC-MERM-DETM-003: Config passthrough to Kroki (query params)
  - TC-MERM-DETM-004: securityLevel NOT passed
  - TC-MERM-NORM-001: SVG normalization → stable hash
  - TC-MERM-NORM-002: Normalization rules (white-box)
- **Mocking**: Fetch stub that captures URL and returns config-dependent SVG
- **Dependencies**: May need to import normalization function (once implemented)

#### `tests/unit/domain/mermaid/transform.test.ts`
- **Existing tests**: TC-MERM-004 policy activation, TC-MERM-007 determinism, TC-MERM-009 dedup, TC-MERM-012 empty source, TC-MERM-005 network fallback, recursive walk
- **New tests**: None (TC-MERM-NORM-004 is existing)
- **Changes needed**: StubRenderer signature change to accept `MermaidRenderConfig` (once DM-1 is implemented)

#### `tests/golden/markdown/mermaid-render-golden.test.ts`
- **Existing tests**: TC-MERM-002 golden fixture, snapshot layer stability
- **New tests**:
  - TC-MERM-NORM-003: Normalized SVG has 0 structural differences from raw SVG
- **Dependencies**: happy-dom (via preload script)

#### `tests/integration/confluence/push-flow.test.ts`
- **New file**: Create this file for integration tests
- **Overlapping tests**: `tests/integration/app/mermaid/mermaid-render.test.ts` has attachment-reuse tests (TC-MERM-003) and `tests/integration/app/idempotency.test.ts` has no-op classification tests (TC-INTEGRATION-005). Extend those files for mermaid-specific/idempotency scenarios; use this new file for lock-pruning and multi-sync-sequence integration tests that need mock TargetSystem with call tracking.
- **New tests**:
  - TC-LOCK-001: Bloated lock pruning
  - TC-LOCK-003: NO_CHANGE preserves attachmentHashes
  - TC-E2E-002: Second sync → 0 uploadAttachment calls
  - TC-E2E-003: Unchanged content → NO_CHANGE classification
  - TC-E2E-004: Per-document isolation on render failure
- **Mocking**: Mock TargetSystem with call tracking (`attachmentExists`, `uploadAttachment`)

#### `tests/unit/app/push-flow.test.ts`
- **Existing file** (added in GH-27, 188 lines): Add TC-LOCK-002 to this file alongside existing provenance tests
- **New tests**:
  - TC-LOCK-002: Replace vs merge semantics
- **Mocking**: In-memory lock file, mock TargetSystem

#### `tests/e2e/sandbox-publish.test.ts`
- **Does not exist** (`tests/e2e/` has only `.gitkeep`). Create this file for TC-E2E-001, or defer to live-sandbox E2E via `run-e2e.yml` workflow.
- **New tests**:
  - TC-E2E-001: End-to-end no-op sync with Mermaid diagrams
- **Environment**: Real Confluence test space

### Execution Commands

```bash
# Unit tests
bun test tests/unit/infra/mermaid/kroki.test.ts
bun test tests/unit/domain/mermaid/transform.test.ts
bun test tests/unit/app/push-flow.test.ts

# Integration tests
bun test tests/integration/confluence/push-flow.test.ts

# Golden fixture tests (with happy-dom preload)
bun test tests/golden/markdown/mermaid-render-golden.test.ts --preload ./tests/mermaid.preload.ts

# Quality gate (full suite)
bun run check

# E2E tests (separate gate, requires secrets)
bun test tests/e2e/sandbox-publish.test.ts
```

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| SVG normalization strips semantic elements | High | Low | Normalization rules (§3.3) validated via golden fixture and structural comparison (TC-MERM-NORM-003). Rule set is conservative (only strip known non-deterministic elements). | Low |
| Kroki changes diagram-options API | Medium | Low | Kroki docs indicate stable API. If blocked, normalization alone provides defense-in-depth. | Low |
| Lock pruning drops needed entries | Medium | Low | Pruning replaces with current run's complete set (assets + Mermaid artifacts), not empty set. NO_CHANGE outcomes preserve existing entries. Self-healing on next sync. | Low |
| happy-dom cannot render Mermaid SVG reliably | Medium | Low | Escalation path: use Vitest or Playwright for TC-MERM-NORM-003 if happy-dom fails. | Low |
| E2E tests flaky due to Confluence version conflicts | Medium | Medium | Concurrency limit (1 run), dedicated test space, stale-plan expiry check. | Low |

### 8.2 Assumptions

- Kroki's diagram-options API accepts `deterministic-ids` and `html-labels` as query parameters (confirmed via docs)
- Kroki enforces `securityLevel: strict` by default (confirmed via docs)
- SVG normalization per §3.3 rules produces a stable digest without altering visual output (validated via TC-MERM-NORM-003)
- The `Renderer` port contract can be extended to carry `MermaidRenderConfig` (DM-1)
- The lock file structure (`PageBinding.attachmentHashes`) can be changed from additive merge to replacement (DM-2)
- Existing bloated lock files are self-healing (no migration script needed)

### 8.3 Open Questions

| Question | Context | Status | Owner |
|----------|---------|--------|-------|
| OQ-1 | Should the SVG normalization for the Kroki path reuse the full §3.3 rule set, or a simplified subset? | §3.3 includes gantt `today`-line stripping (Rule 5) which may not be relevant for Kroki output. A subset focusing on ID rewriting + attribute sorting + whitespace canonicalization may suffice. | Resolved (PM-decided, DEC-5): Use full §3.3 rule set | N/A |
| OQ-2 | Should orphaned attachments from pre-fix syncs be cleaned up (deleted from Confluence)? | Pre-fix syncs uploaded attachments under non-deterministic hashes. These remain on Confluence as orphans. | Open (deferred to maybe-later) | @pm |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | test-plan-writer (AI-assisted) | Initial test plan for GH-76 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |