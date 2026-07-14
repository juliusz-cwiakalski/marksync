---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-27-test-plan
status: Proposed
created: 2026-07-14
last_updated: 2026-07-14
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, provenance, metadata, accessibility]
version_impact: minor
summary: "Provenance infrastructure: visible panel/footer on managed pages with complete marksync.metadata property enrichment and direct-edit classification, enforcing privacy via ADR-0010 and preventing false drift through timestamp canonicalization."
links:
  change_spec: ./chg-GH-27-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4-S3] Provenance - Visible Panel and Machine Metadata

## 1. Scope and Objectives

This test plan validates provenance infrastructure for the safe publish pipeline: ensuring every managed Confluence page carries visible provenance (source path, Git revision, branch, last-sync timestamp) readable by non-technical stakeholders, complete machine-readable `marksync.metadata` property enrichment, and programmatic direct-edit classification. The plan enforces the privacy constraint from ADR-0010 (commit subjects stored only locally, never in Confluence) and prevents false drift through timestamp canonicalization. Key risks covered: privacy violations if commit subjects leak to Confluence, false-positive drift from timestamp-only updates, incorrect classification of direct edits, and incomplete metadata populating the property.

### 1.1 In Scope

- Visible provenance panel builder (`buildProvenancePanel`) generating Storage XHTML `{info}` macro
- Panel injection into Storage body gated by `provenance.visiblePanel` configuration
- Content-hash canonicalization excluding timestamp/marker block to prevent false drift
- Full enrichment of `marksync.metadata` content property with all required fields
- Direct-edit classification predicate (`classifyVersion`) based on `version.message` prefix
- Privacy enforcement: commit subjects in local output only, not in Confluence
- Idempotent sync behavior: identical content at different times returns `NO_CHANGE`
- Footer placement of panel (end of body) by default

### 1.2 Out of Scope & Known Gaps

- **E2E / Live-sandbox tests**: Deferred to E5-S1 (MS2-E5-S1), out of scope for this story
- **Commit-by-commit history in Confluence**: Explicitly deferred per ADR-0010 C-5
- **Reverse-sync provenance**: Deferred to MS-0005+
- **GUI/editor for provenance**: Out of scope
- **Panel customization beyond minimal `{info}` macro**: Out of scope
- **Panel placement other than footer (end of body)**: Out of scope
- **Performance benchmarks**: Deferred to MS-0003+

## 2. References

- Change Specification: `./chg-GH-27-spec.md`
- Story File: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S3--provenance.md`
- Testing Strategy: `.ai/rules/testing-strategy.md`
- ADR-0010: `doc/decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md` (privacy constraint)
- Feature Spec: `doc/spec/features/feature-safe-publish.md`
- NFRs: `doc/spec/nonfunctional.md` (NFR-REL-9, NFR-A11Y-3, NFR-PERF-4, NFR-PRIV-1)
- Code Style: `AGENTS.md`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Panel displays with source path, Git revision, branch, last-sync timestamp | TC-PROV-001, TC-PROV-004 | Covered |
| AC-F1-2 | Panel not displayed when `provenance.visiblePanel: false` | TC-PROV-002 | Covered |
| AC-F3-1 | Idempotent sync (identical content, different time) returns NO_CHANGE | TC-PROV-006, TC-PROV-007 | Covered |
| AC-F4-1 | `marksync.metadata` contains all required fields | TC-PROV-003, TC-PROV-005 | Covered |
| AC-F4-2 | `marksync.metadata` contains NO commit subjects (privacy) | TC-PROV-003, TC-PROV-005 | Covered |
| AC-F5-1 | `classifyVersion` returns "marksync" for `marksync:` prefix | TC-PROV-008 | Covered |
| AC-F5-2 | `classifyVersion` returns "direct" for no prefix | TC-PROV-009 | Covered |
| AC-INT-1 | 100% managed pages have valid panel + complete property | TC-PROV-004, TC-PROV-005 | Covered |
| AC-CI-1 | `bun run check` passes (unit + integration + golden) | All TCs | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Description | TC ID(s) |
|--------------|-------------|----------|
| DM-1 | `marksync.metadata` property schema (JSON string) | TC-PROV-003, TC-PROV-005 |
| DM-2 | `ProvenanceInput` extended with `sourceBranch` | TC-PROV-001 |
| DM-3 | `PageBinding` fields for `sourceBranch`, `commitCount`, `trimMarker` | TC-PROV-005 |
| DM-4 | Confluence `{info}` macro format (Storage XHTML) | TC-PROV-001 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) |
|--------|-------------|----------|
| NFR-REL-9 | Per-version provenance: MarkSync versions have `marksync:` prefix, direct edits do not | TC-PROV-008, TC-PROV-009 |
| NFR-A11Y-3 | Visible provenance accessibility: readable panel with plain text | TC-PROV-001 |
| NFR-PERF-4 | Idempotent rerun: no false drift from timestamp updates | TC-PROV-006, TC-PROV-007 |
| NFR-PRIV-1 | Local-first provenance: commit subjects only in local output, not in Confluence | TC-PROV-003, TC-PROV-005 |

## 4. Test Types and Layers

This story focuses on **Unit** and **Integration** test tiers per the testing strategy and story test matrix. E2E/live-sandbox tests are deferred to E5-S1 (MS2-E5-S1).

| Test Tier | Framework | Root Directory | Pattern | Purpose |
|-----------|-----------|----------------|---------|---------|
| **Unit** | `bun:test` | `tests/unit/` | `*.test.ts` | Validate domain logic in isolation: panel builder output, property schema validation, `classifyVersion` predicate, timestamp canonicalization |
| **Integration** | `bun:test` + `Bun.serve()` mock | `tests/integration/` | `*.test.ts` | Validate pipeline behavior: full apply with panel injection, second sync idempotency, property population, direct-edit classification in context |
| **Golden Fixture** | `bun:test` `toMatchSnapshot` | `tests/golden/markdown/` | `*.test.ts` | Validate byte-stable Storage XHTML panel output using golden `.storage.xhtml` fixtures |

**Excluded Tiers:**
- **E2E (live-sandbox)**: Deferred to E5-S1 (MS2-E5-S1), out of scope for this story
- **Gherkin/BDD**: Not required—lifecycle invariants are covered elsewhere; no new invariants introduced by this story
- **Mermaid-DOM**: Not applicable—provenance panel is Storage XHTML, not Mermaid rendering

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-PROV-001 | Panel builder generates valid Storage XHTML with all fields | Happy Path | Important | High | AC-F1-1, F-1, NFR-A11Y-3 |
| TC-PROV-002 | Panel not injected when `provenance.visiblePanel: false` | Negative | Important | High | AC-F1-2, F-2 |
| TC-PROV-003 | Property schema validates all required fields, excludes commit subjects | Happy Path | Critical | High | AC-F4-1, AC-F4-2, F-4, NFR-PRIV-1 |
| TC-PROV-004 | Integration: full apply populates panel and property | Happy Path | Critical | High | AC-F1-1, AC-F4-1, AC-INT-1 |
| TC-PROV-005 | Integration: second sync preserves privacy (no subjects in property) | Happy Path | Critical | High | AC-F4-2, AC-INT-1, NFR-PRIV-1 |
| TC-PROV-006 | Canonicalizer strips timestamp from body before hash | Edge Case | Important | High | AC-F3-1, F-3, NFR-PERF-4 |
| TC-PROV-007 | Integration: idempotent sync returns NO_CHANGE (same content, different time) | Happy Path | Critical | High | AC-F3-1, NFR-PERF-4 |
| TC-PROV-008 | `classifyVersion` returns "marksync" for `marksync:` prefix | Happy Path | Important | High | AC-F5-1, F-5, NFR-REL-9 |
| TC-PROV-009 | `classifyVersion` returns "direct" for no prefix (edge cases) | Edge Case | Important | High | AC-F5-2, F-5, NFR-REL-9 |
| TC-PROV-010 | Panel builder handles edge cases (empty message, case sensitivity) | Corner Case | Minor | Medium | F-1, robustness |

### 5.2 Scenario Details

#### TC-PROV-001 - Panel builder generates valid Storage XHTML with all fields

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, AC-F1-1, NFR-A11Y-3, DM-4
**Test Type(s)**: Unit, Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/provenance.ts` → `tests/unit/confluence/provenance.test.ts`, golden fixtures in `tests/golden/fixtures/markdown/`
**Tags**: @backend, @golden

**Preconditions**:
- `ProvenanceInput` object with `sourcePath`, `headCommit`, `sourceBranch`, `synchronizedAt` is provided

**Steps**:
1. Call `buildProvenancePanel(input)` with sample provenance data (e.g., `sourcePath: "docs/guide/api.md"`, `headCommit: "a1b2c3d"`, `sourceBranch: "main"`, `synchronizedAt: "2026-07-14T12:34:56Z"`)
2. Capture the returned Storage XHTML string
3. Assert the output matches golden snapshot file `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml`
4. Verify the output contains:
   - `<ac:structured-macro ac:name="info">` wrapper
   - Source path text: `<p><strong>Source:</strong> docs/guide/api.md</p>`
   - Git revision text: `<p><strong>Git revision:</strong> a1b2c3d (main)</p>`
   - Last sync timestamp: `<p><strong>Last sync:</strong> 2026-07-14T12:34:56Z</p>`
5. Verify the output does NOT contain `schema-version` or `macro-id` attributes (per spike rules)

**Expected Outcome**:
- Panel returns valid Storage XHTML `{info}` macro with all four fields present and correctly formatted
- Golden snapshot matches byte-stable output across Bun versions
- No commit subjects appear in the panel (only summary fields)

**Postconditions**:
- Golden fixture file `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` exists and is reviewed in PR

---

#### TC-PROV-002 - Panel not injected when `provenance.visiblePanel: false`

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F1-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/unit/push-flow.test.ts`
**Tags**: @backend, @config

**Preconditions**:
- Configuration has `provenance.visiblePanel: false`
- Markdown content has been rendered to Storage body

**Steps**:
1. Set up test config with `provenance.visiblePanel: false`
2. Render sample Markdown to Storage body
3. Execute pipeline step that injects panel
4. Capture the final body after pipeline processing
5. Assert the body does NOT contain `<ac:structured-macro ac:name="info">`
6. Assert the body matches original rendered Storage body (no changes)

**Expected Outcome**:
- Panel is NOT appended to the Storage body when config is false
- Body content remains unchanged from original rendering
- No timestamp or provenance markers appear in the output

---

#### TC-PROV-003 - Property schema validates all required fields, excludes commit subjects

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, AC-F4-2, DM-1, NFR-PRIV-1, ADR-0010
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/provenance.ts` → `tests/unit/confluence/provenance.test.ts`
**Tags**: @backend, @privacy, @schema

**Preconditions**:
- Complete provenance metadata object available after sync

**Steps**:
1. Create a sample `marksync.metadata` property value JSON string with all required fields: `{schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker}`
2. Parse the JSON string
3. Assert all required fields are present and have correct types:
   - `schemaVersion`: number
   - `projectId`, `targetId`: string
   - `documentId`: string (UUID v7)
   - `sourcePath`, `sourceCommit`, `sourceBranch`: string
   - `sourceContentHash`, `renderedBodyHash`: string (hash format)
   - `operationId`: string (UUID v7)
   - `synchronizedAt`: string (ISO8601 timestamp)
   - `toolVersion`: string
   - `commitCount`: number
   - `trimMarker`: boolean
4. **Privacy assertion**: Assert the JSON does NOT contain a `subjects` field or any commit subject strings
5. Assert `commitCount` is a number (e.g., 5) and `trimMarker` is a boolean (e.g., false)
6. Verify the JSON string is valid JSON (parseable without errors)

**Expected Outcome**:
- All 13 required fields are present with correct types
- NO `subjects` field or commit subject strings exist in the property (ADR-0010 privacy constraint)
- JSON is valid and parseable
- `commitCount` and `trimMarker` provide truncation metadata without exposing subject content

---

#### TC-PROV-004 - Integration: full apply populates panel and property

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-4, AC-F1-1, AC-F4-1, AC-INT-1, DM-1, DM-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/push-flow.test.ts` (using `Bun.serve()` mock for Confluence API)
**Tags**: @backend, @integration, @mocked-api

**Preconditions**:
- Mock Confluence server set up via `Bun.serve()`
- Markdown document exists in test repo
- Configuration has `provenance.visiblePanel: true` (default)

**Steps**:
1. Set up mock Confluence server with endpoints: page update, content property read/write, page version history
2. Initialize test Markdown document with sample content
3. Execute full `marksync push` flow against mock server
4. Inspect the page body written to Confluence (capture from mock request)
5. Assert the page body contains the provenance panel (`<ac:structured-macro ac:name="info">`)
6. Verify panel fields: source path, Git revision, branch, last-sync timestamp
7. Read the `marksync.metadata` content property from mock server
8. Parse the property JSON and assert all 13 required fields are present
9. Verify `sourceBranch`, `commitCount`, `trimMarker` fields are populated correctly
10. Assert the page version created has `version.message` starting with `marksync:` prefix

**Expected Outcome**:
- Page body written to Confluence contains the visible provenance panel
- `marksync.metadata` property is fully populated with all required fields
- Panel and property values match the provenance data from the sync
- Page version carries `marksync:` prefix for classification
- No errors or warnings in the sync execution

---

#### TC-PROV-005 - Integration: second sync preserves privacy (no subjects in property)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-2, AC-INT-1, NFR-PRIV-1, ADR-0010
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/push-flow.test.ts`
**Tags**: @backend, @integration, @privacy, @mocked-api

**Preconditions**:
- Mock Confluence server set up via `Bun.serve()`
- First sync has completed successfully
- Local plan/apply output contains full commit subjects

**Steps**:
1. Set up mock Confluence server with endpoints for page update and content property read/write
2. Execute first sync with sample Markdown document
3. Capture local plan/apply output (should contain full commit subjects)
4. Read the `marksync.metadata` property written by first sync
5. **Privacy assertion**: Assert the property JSON does NOT contain `subjects` field or any commit subject strings
6. Make a second sync call with identical content but different timestamp
7. Read the updated `marksync.metadata` property after second sync
8. **Privacy assertion**: Assert the property still does NOT contain `subjects` field or commit subject strings
9. Assert `commitCount` and `trimMarker` are updated correctly
10. Verify that only local terminal/JSON output contains commit subjects, never the Confluence property

**Expected Outcome**:
- First sync property contains `commitCount` and `trimMarker` but NO `subjects` or commit subject strings
- Second sync property maintains privacy (still no subjects)
- Local plan/apply output contains full commit subjects for human audit
- Confluence `marksync.metadata` property never exposes sensitive commit subjects (ADR-0010)

---

#### TC-PROV-006 - Canonicalizer strips timestamp from body before hash

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-PERF-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/render/canonicalize.ts` → `tests/unit/render/canonicalize.test.ts`
**Tags**: @backend, @hashing, @normalization

**Preconditions**:
- Storage body containing provenance panel with timestamp is available

**Steps**:
1. Create two Storage body strings with identical content but different timestamps:
   - Body A: `<body><p>Content</p><ac:structured-macro ac:name="info"><ac:rich-text-body><p><strong>Last sync:</strong> 2026-07-14T12:34:56Z</p></ac:rich-text-body></ac:structured-macro></body>`
   - Body B: `<body><p>Content</p><ac:structured-macro ac:name="info"><ac:rich-text-body><p><strong>Last sync:</strong> 2026-07-14T13:45:67Z</p></ac:rich-text-body></ac:structured-macro></body>`
2. Apply canonicalizer function to Body A, capturing the normalized output
3. Apply canonicalizer function to Body B, capturing the normalized output
4. Assert the timestamp/marker block is stripped from both normalized outputs
5. Compute content hash of normalized Body A
6. Compute content hash of normalized Body B
7. Assert both hashes are identical (NO_CHANGE classification)

**Expected Outcome**:
- Canonicalizer removes the timestamp/marker block from the body
- Normalized outputs are identical (timestamps stripped)
- Hash computation on normalized outputs produces identical results
- This enables idempotent sync behavior (TC-PROV-007)

---

#### TC-PROV-007 - Integration: idempotent sync returns NO_CHANGE (same content, different time)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-PERF-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/push-flow.test.ts`
**Tags**: @backend, @integration, @idempotency, @mocked-api

**Preconditions**:
- Mock Confluence server set up via `Bun.serve()`
- First sync has completed successfully
- Markdown source content has NOT changed

**Steps**:
1. Set up mock Confluence server with endpoints for page update, content property read/write, page version history
2. Execute first sync with sample Markdown document at time T1
3. Capture the page version created (version number, content hash)
4. Wait or simulate time passage (different timestamp)
5. Execute second sync with identical Markdown content at time T2
6. Assert the sync result returns `NO_CHANGE` classification
7. Assert NO page update request was sent to the mock server (0 writes to Confluence)
8. Assert NO content property update request was sent (no drift)
9. Assert the page version number is unchanged (no new version created)
10. Verify the timestamp canonicalization logic was applied (canonical hash identical)

**Expected Outcome**:
- Second sync returns `NO_CHANGE` (no false drift from timestamp update)
- Zero writes to Confluence (page body and property unchanged)
- Page version number remains the same (no new version)
- Idempotent behavior ensures minimal rate-limit impact and avoids unnecessary updates

---

#### TC-PROV-008 - `classifyVersion` returns "marksync" for `marksync:` prefix

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-5, AC-F5-1, NFR-REL-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/provenance.ts` → `tests/unit/confluence/provenance.test.ts`
**Tags**: @backend, @predicate, @classification

**Preconditions**:
- Confluence page version object with `version.message` field is available

**Steps**:
1. Create a mock page version object with `version.message: "marksync:squash commit=a1b2c3d source=docs/guide/api.md"`
2. Call `classifyVersion(version)` with the mock version
3. Assert the function returns `"marksync"`
4. Test with additional valid prefix variants:
   - `"marksync:squash commit=abc123 source=test.md +2 more"`
   - `"marksync:prefix with additional metadata"`
5. Assert all return `"marksync"`

**Expected Outcome**:
- `classifyVersion` correctly identifies MarkSync-authored versions by the `marksync:` prefix
- Function returns `"marksync"` for any version message containing the prefix
- This enables `doctor` and future reverse-sync to distinguish MarkSync versions from direct edits

---

#### TC-PROV-009 - `classifyVersion` returns "direct" for no prefix (edge cases)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-5, AC-F5-2, NFR-REL-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/provenance.ts` → `tests/unit/confluence/provenance.test.ts`
**Tags**: @backend, @predicate, @classification

**Preconditions**:
- Confluence page version object with `version.message` field is available

**Steps**:
1. Create a mock page version object with `version.message: "Manual edit by user"`
2. Call `classifyVersion(version)` with the mock version
3. Assert the function returns `"direct"`
4. Test edge cases:
   - Empty message: `version.message: ""`
   - Case sensitivity: `"MarkSync:squash commit=abc"` (should return "direct"—prefix is case-sensitive)
   - Similar but not exact: `"marksync-squash commit=abc"` (should return "direct")
   - Whitespace variants: `" marksync:squash commit=abc"` (leading space, should return "direct")
5. Assert all edge cases return `"direct"`

**Expected Outcome**:
- `classifyVersion` correctly identifies direct Confluence edits (no `marksync:` prefix)
- Function returns `"direct"` for all edge cases without the exact prefix
- Prefix is case-sensitive and must appear at the start of the message (no leading whitespace)
- This ensures `doctor` and future reverse-sync can reliably flag non-MarkSync-authored versions

---

#### TC-PROV-010 - Panel builder handles edge cases (empty message, case sensitivity)

**Scenario Type**: Corner Case
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/provenance.ts` → `tests/unit/confluence/provenance.test.ts`
**Tags**: @backend, @robustness

**Preconditions**:
- `ProvenanceInput` object with various edge-case values

**Steps**:
1. Call `buildProvenancePanel` with empty `sourcePath` (edge case)
2. Assert the panel still renders with empty source field
3. Call `buildProvenancePanel` with `sourceBranch: "MAIN"` (uppercase)
4. Assert the branch name is rendered as-is (preserve case)
5. Call `buildProvenancePanel` with `synchronizedAt` in different ISO8601 formats
6. Assert the timestamp is rendered in the provided format
7. Call `buildProvenancePanel` with special characters in `sourcePath` (e.g., `docs/path/with spaces/测试.md`)
8. Assert the panel renders without XML escaping issues

**Expected Outcome**:
- Panel builder handles edge cases gracefully without throwing errors
- Empty fields render as empty strings (not null/undefined)
- Case sensitivity is preserved (branch name case not normalized)
- Special characters are properly escaped in Storage XHTML
- Robustness ensures panel never breaks the pipeline on unusual input

---

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local development**: Primary environment for unit and integration tests
- **Mock Confluence server**: Integration tests use `Bun.serve()` to mock Confluence API endpoints (page update, content property, version history)
- **No live Confluence tenant required**: E2E tests deferred to E5-S1

### 6.2 Test Data Generation and Cleanup

- **Unit tests**: Use in-memory fixtures for `ProvenanceInput`, page version objects, and property JSON
- **Integration tests**: Use `Bun.serve()` mock with ephemeral state per test (no persistent storage)
- **Golden fixtures**: Store panel output snapshots in `tests/golden/fixtures/markdown/*.storage.xhtml`
- **Markdown fixtures**: Use existing test Markdown files (e.g., `fixtures/basic.md`) or create simple fixtures for provenance tests

### 6.3 Isolation Strategy

- **Unit tests**: No external dependencies, all inputs mocked or constructed in test
- **Integration tests**: `Bun.serve()` mock provides isolated HTTP endpoints per test; mock state reset between tests
- **Golden fixtures**: Version-controlled snapshots reviewed in PR; explicit update command required (`bun test --update-snapshots`)
- **No shared state**: Each test is independent; no tests depend on previous test state

## 7. Automation Plan and Implementation Mapping

### 7.1 Unit Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-PROV-001 | `tests/unit/confluence/provenance.test.ts` | New | None (pure function) | To Implement |
| TC-PROV-002 | `tests/unit/push-flow.test.ts` | New | Config object, rendered body | To Implement |
| TC-PROV-003 | `tests/unit/confluence/provenance.test.ts` | New | None (JSON parsing) | To Implement |
| TC-PROV-006 | `tests/unit/render/canonicalize.test.ts` | New | None (string normalization) | To Implement |
| TC-PROV-008 | `tests/unit/confluence/provenance.test.ts` | New | None (pure predicate) | To Implement |
| TC-PROV-009 | `tests/unit/confluence/provenance.test.ts` | New | None (pure predicate) | To Implement |
| TC-PROV-010 | `tests/unit/confluence/provenance.test.ts` | New | None (pure function) | To Implement |

**Execution Command:**
```bash
bun test tests/unit/confluence/provenance.test.ts tests/unit/push-flow.test.ts tests/unit/render/canonicalize.test.ts
```

### 7.2 Integration Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-PROV-004 | `tests/integration/push-flow.test.ts` | New | `Bun.serve()` mock for Confluence API (page update, content property, version history) | To Implement |
| TC-PROV-005 | `tests/integration/push-flow.test.ts` | New | `Bun.serve()` mock (same as TC-PROV-004) | To Implement |
| TC-PROV-007 | `tests/integration/push-flow.test.ts` | New | `Bun.serve()` mock (same as TC-PROV-004) | To Implement |

**Execution Command:**
```bash
bun test tests/integration/push-flow.test.ts
```

**Mock Server Setup (Integration Tests):**
```typescript
// Mock Confluence server endpoints:
// - POST /wiki/api/v2/pages/{id} (page update)
// - GET /wiki/api/v2/pages/{id}/properties/{key} (read content property)
// - PUT /wiki/api/v2/pages/{id}/properties/{key} (write content property)
// - GET /wiki/api/v2/pages/{id}/versions (read version history)
```

### 7.3 Golden Fixture Implementation

| TC ID | Golden Fixture File | Test File | Status |
|-------|---------------------|-----------|--------|
| TC-PROV-001 | `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` | `tests/golden/markdown/provenance-panel.test.ts` | To Implement |

**Execution Command:**
```bash
bun test tests/golden/markdown/provenance-panel.test.ts
```

**Snapshot Update (manual, reviewed action):**
```bash
bun test tests/golden/markdown/provenance-panel.test.ts --update-snapshots
```

### 7.4 CI Integration

All tests run in the fast loop CI (`.github/workflows/ci.yml`):
```yaml
- run: bun test tests/unit/ tests/integration/ tests/golden/
```

### 7.5 Test Coverage Summary

- **Unit tests**: 7 test files covering panel builder, property schema, canonicalizer, classifier, and config gate
- **Integration tests**: 1 test file covering full apply, idempotent sync, and privacy preservation
- **Golden fixtures**: 1 snapshot file for panel XHTML output
- **Total test scenarios**: 10 TCs covering all ACs and NFRs

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Panel HTML injection or malformed Storage XHTML | M | L | Golden snapshot tests validate correct Storage format; spike confirmed `{info}` macro structure is stable | L |
| Timestamp canonicalization misses edge cases (e.g., panel placement changes) | M | L | Golden fixture tests cover panel with timestamps; canonicalizer strips known marker block before hashing | L |
| Privacy violation if commit subjects leak to Confluence property | H | L | Explicit test assertions (TC-PROV-003, TC-PROV-005) enforce no `subjects` field; ADR-0010 hard constraint | L |
| False drift from canonicalization bug (different content produces same hash) | M | L | Integration test (TC-PROV-007) ensures identical content → NO_CHANGE; golden snapshots cover panel format | L |

### 8.2 Assumptions

- The `provenance.visiblePanel` configuration knob exists in `src/app/config.ts` (default true) and is ready for consumption (from spec §12)
- The Git adapter's `currentBranch()` port is available and already called for the branch gate (MS2-E3-S6) (from spec §12)
- The `formatVersionMessage` function (MS2-E3-S4) already prefixes `version.message` with `marksync:` (from spec §12)
- The `marksync.metadata` content property accepts JSON string values (verified in spike H2 v2) (from spec §12)
- Confluence Storage XHTML `{info}` macro format is stable and does not require `schema-version` or `macro-id` (from spec §12)
- `Bun.serve()` mock adequately simulates Confluence API behavior for integration tests (no unexpected divergence)

### 8.3 Open Questions

None. All open questions were CEO-resolved before this story (see spec §14: "All open questions were CEO-resolved before this story").

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Change Test Plan Writer | Initial test plan creation for GH-27 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-PROV-001 | TBD | TBD | Pending implementation |
| TC-PROV-002 | TBD | TBD | Pending implementation |
| TC-PROV-003 | TBD | TBD | Pending implementation |
| TC-PROV-004 | TBD | TBD | Pending implementation |
| TC-PROV-005 | TBD | TBD | Pending implementation |
| TC-PROV-006 | TBD | TBD | Pending implementation |
| TC-PROV-007 | TBD | TBD | Pending implementation |
| TC-PROV-008 | TBD | TBD | Pending implementation |
| TC-PROV-009 | TBD | TBD | Pending implementation |
| TC-PROV-010 | TBD | TBD | Pending implementation |