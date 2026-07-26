---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-31-test-plan
status: Proposed
created: 2026-07-26
last_updated: 2026-07-26
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["feature", "MS-0002", "MS2-E5", "priority:medium", "test", "corpus", "docs"]
version_impact: patch
summary: "Adversarial corpus + classification runner that regression-locks unsupported-node handling and conversion fidelity against real-world content"
links:
  change_spec: ./chg-GH-31-spec.md
  implementation_plan: ./chg-GH-31-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E5-S3] Adversarial public corpus + unsupported-node classification

## 1. Scope and Objectives

This test plan validates the adversarial corpus and classification runner that regression-locks MarkSync's unsupported-node handling (ADR-0005 "do not silently degrade") and conversion fidelity (NFR-REL-4) against real-world content categories that the canonical GFM subset excludes. The core behaviors to protect are: (1) no unsupported node is silently dropped, (2) supported constructs convert correctly, and (3) classification is deterministic. Data integrity risks include PII leakage into committed synthetic corpus artifacts, which is mitigated by construction plus an automated grep self-audit. Regressions motivating this plan include the risk that future converter or classifier changes could silently break handling of macros, nested tables, emoji, raw HTML, and scale without any test catching it.

### 1.1 In Scope

- Synthetic adversarial corpus fixtures under `tests/adversarial/*.md` with committed `*.classification.json` sidecars
- Collect-all classifier variant `findAllUnsupported` in `src/domain/markdown/unsupported.ts`
- Golden-tier classification runner asserting fidelity, no-silent-drop, and drift determinism
- Automated PII self-audit grep across all committed corpus artifacts
- Published user-facing classification doc at `doc/quality/adversarial-corpus-classification.md`
- All existing golden fixtures and their byte-stability (no regression)

### 1.2 Out of Scope & Known Gaps

- Expanding the canonical GFM subset to support more constructs (NG-1)
- Changing existing `findUnsupported` / `classifyUnsupported` behavior (NG-2 / DEC-1)
- Changing the sync-state three-way `classify()` in `src/domain/state/classifier.ts` (NG-3 / DEC-3)
- Real design-partner corpus ingestion or design-partner recruitment (NG-4 / DEC-4)
- Reverse conversion (Confluence Storage → Markdown) (NG-5)
- Performance regression testing beyond NFR-PERF-5 informational targets (deferred to MS-0003+)

## 2. References

- Change Specification: `chg-GH-31-spec.md`
- Implementation Plan: `chg-GH-31-plan.md`
- Story File: `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S3--adversarial-corpus.md`
- Testing Strategy: `.ai/rules/testing-strategy.md`
- ADR-0005: Page Body Representation (Storage not ADF) — "do not silently degrade" guarantee
- ADR-0002: Mermaid Rendering Strategy — determinism (C-1)
- TDR-0004: Testing Runner — over-mocking guardrail, golden-tier rules
- Existing Classifier: `src/domain/markdown/unsupported.ts`
- Existing Classifier Unit Tests: `tests/unit/domain/markdown/unsupported.test.ts`
- Golden Runner Pattern: `tests/golden/markdown/storage-renderer.test.ts`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Corpus covers: nested tables; ≥3 macro/app-content categories; emoji; ≥1 long page; mixed task/regular lists; raw HTML | TC-ADVERSARIAL-001 | TODO |
| AC-F2-1 | Collect-all classifier returns ALL unsupported nodes depth-first; parity with `findUnsupported` / `classifyUnsupported` unchanged | TC-ADVERSARIAL-002, TC-ADVERSARIAL-003 | TODO |
| AC-F3-1 | Supported constructs convert correctly; golden byte-match where committed | TC-ADVERSARIAL-004 | TODO |
| AC-F3-2 | No silent drop — classification equals sidecar exactly | TC-ADVERSARIAL-005, TC-ADVERSARIAL-010 | TODO |
| AC-F3-3 | Drift stability — same corpus classified twice → byte-identical | TC-ADVERSARIAL-006 | TODO |
| AC-F4-1 | Classification doc published with handling-category table | TC-ADVERSARIAL-007 | TODO |
| AC-F5-1 | PII self-audit returns clean (0 email/ID/internal-ticket-URL matches) | TC-ADVERSARIAL-008 | TODO |
| AC-F6-1 | `bun run check` green (lint + typecheck + all test tiers) | TC-ADVERSARIAL-009 | TODO |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| ID | Description | TC ID(s) |
|----|-------------|----------|
| DM-1 | `*.classification.json` sidecar contract — expected classification per corpus fixture | TC-ADVERSARIAL-005, TC-ADVERSARIAL-006, TC-ADVERSARIAL-010 |
| DM-2 | `findAllUnsupported` return shape — `MarkSyncError[]` (collect-all variant) | TC-ADVERSARIAL-002, TC-ADVERSARIAL-003, TC-ADVERSARIAL-010 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) | Notes |
|--------|-------------|----------|-------|
| NFR-REL-4 | Conversion fidelity — supported constructs convert correctly, 0 mis-conversions | TC-ADVERSARIAL-004 | Extended to adversarial content; existing golden fixtures still pass |
| NFR-SEC-1 / INV-SEC-1 | No secrets/PII in any output — 0 matches across committed corpus artifacts | TC-ADVERSARIAL-008 | Automated grep self-audit |
| NFR-PERF-5 | Conversion latency — per-page render ≤ 200 ms (p95) — informational | TC-ADVERSARIAL-004 | Corpus runner processes ~20–40 fixtures; must stay within CI fast-loop budget |

## 4. Test Types and Layers

### 4.1 Unit Tests

- **Framework**: `bun:test` (per TDR-0004)
- **Root Directory**: `tests/unit/`
- **Pattern**: `*.test.ts`
- **Scope**:
  - Parity test proving `findAllUnsupported(tree)[0]` deep-equals `findUnsupported(tree)` on the same tree (DEC-1 / RSK-3 mitigation)
  - Multi-node test proving ALL unsupported nodes are collected depth-first (none truncated)
- **Locations**:
  - `tests/unit/domain/markdown/unsupported.test.ts` — extend existing file with parity and multi-node collection tests

### 4.2 Golden Tests (Classification Runner)

- **Framework**: `bun:test` with real parser/bridge/renderer (no mocks, per TDR-0004 over-mocking guardrail)
- **Root Directory**: `tests/golden/adversarial/`
- **Pattern**: `*.test.ts`
- **Scope**:
  - Corpus category coverage inventory: synthetic Markdown fixtures, committed classification sidecars
  - Fidelity assertions: supported constructs convert correctly; for fixtures with committed `.storage.xhtml`, byte-match
  - No-silent-drop assertions: emitted classification deep-equals committed sidecar
  - Drift stability assertions: classify same fixture twice → byte-identical output
  - Hand-built-macro HAST classification: real Confluence macro tag shapes fed to `findAllUnsupported` (DEC-2)
  - PII self-audit: automated grep scan across committed corpus artifacts
- **Fixture Pattern**:
  - `tests/adversarial/*.md` — synthetic Markdown sources
  - `tests/adversarial/*.classification.json` — committed expected classification sidecars
  - `tests/adversarial/*.storage.xhtml` — optional golden storage output for fixtures with supported constructs
- **Mirrors**: Existing golden runner pattern at `tests/golden/markdown/storage-renderer.test.ts`

### 4.3 Automation / CI Tests

- **Framework**: `bun:test`
- **Root Directory**: `tests/golden/adversarial/`
- **Pattern**: `*.test.ts` (runners discovered via CI glob `tests/golden/`)
- **Scope**:
  - Golden-tier tests as defined in §4.2 are automatically discovered by CI
  - All tests run as part of `bun test tests/golden/` (included in `bun run check`)

### 4.4 Manual / Documentation Tests

- **Framework**: Manual verification (doc existence and content)
- **Location**: `doc/quality/adversarial-corpus-classification.md`
- **Scope**:
  - Verify classification doc exists and contains required handling-category table
  - Verify doc states plainly what MS-0002 pipeline can and cannot author

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage | Test Type |
|-------|-------|------|-------|----------|-------------|-----------|
| TC-ADVERSARIAL-001 | Corpus category coverage inventory | Happy Path | Important | High | AC-F1-1 | Golden |
| TC-ADVERSARIAL-002 | Parity test: findAllUnsupported vs findUnsupported | Regression | Critical | High | AC-F2-1 | Unit |
| TC-ADVERSARIAL-003 | Multi-node collection depth-first | Happy Path | Critical | High | AC-F2-1 | Unit |
| TC-ADVERSARIAL-004 | Fidelity: supported constructs convert correctly | Happy Path | Critical | High | AC-F3-1, NFR-REL-4 | Golden |
| TC-ADVERSARIAL-005 | No-silent-drop: classification equals sidecar | Happy Path | Critical | High | AC-F3-2, F-2, F-3 | Golden |
| TC-ADVERSARIAL-006 | Drift stability: deterministic classification output | Corner Case | Important | High | AC-F3-3, F-3 | Golden |
| TC-ADVERSARIAL-007 | Classification doc published with handling table | Happy Path | Minor | Medium | AC-F4-1 | Manual |
| TC-ADVERSARIAL-008 | PII self-audit clean across corpus artifacts | Happy Path | Critical | High | AC-F5-1, NFR-SEC-1, INV-SEC-1 | Golden |
| TC-ADVERSARIAL-009 | Quality gate: bun run check green | Happy Path | Critical | High | AC-F6-1 | Manual (CI) |
| TC-ADVERSARIAL-010 | Hand-built-macro HAST classification (DEC-2) | Happy Path | Important | High | AC-F3-2, DEC-2 | Unit |

### 5.2 Scenario Details

#### TC-ADVERSARIAL-001 - Corpus category coverage inventory

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, G-1, AC-F1-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/corpus-inventory.test.ts`
**Tags**: @backend, @golden, @test

**Preconditions**:
- Adversarial corpus fixtures exist under `tests/adversarial/*.md`
- Each fixture has a committed `*.classification.json` sidecar

**Steps**:
1. Scan the `tests/adversarial/` directory for all `*.md` fixtures
2. For each fixture, parse its `*.classification.json` sidecar to extract unsupported node types
3. Assert the corpus contains at least one fixture representing each required category:
   - Nested tables (detected via `raw-html-block` or multi-level structure)
   - At least three macro/app-content categories (e.g., `{toc}`, `{info}`, `{code}`, Jira macro, gliffy)
   - Emoji (inline Unicode characters)
   - At least one long page notably larger than the 33-fixture golden set (by byte/line count)
   - Mixed task/regular lists (interleaved `- [ ]` and `-`/`1.` items)
   - Raw HTML (both block-level `<div>` and inline `<b>`/`<i>`)

**Expected Outcome**:
- All 6 required categories are represented in the corpus
- Inventory test passes with explicit assertion messages for each category
- Test output lists which fixture(s) cover each category

**Postconditions**:
- Corpus is verified to meet AC-F1-1 coverage requirements

**Notes / Clarifications**:
- Category detection may use sidecar node types, fixture content analysis, or fixture naming conventions
- "Notably larger" for long page means at least 2x the size of the largest existing golden fixture

---

#### TC-ADVERSARIAL-002 - Parity test: findAllUnsupported vs findUnsupported

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, G-4, AC-F2-1, DEC-1, RSK-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts` (extend existing)
**Tags**: @backend, @unit, @regression

**Preconditions**:
- `findAllUnsupported` function is exported from `src/domain/markdown/unsupported.ts`
- `findUnsupported` and `classifyUnsupported` behavior is unchanged (DEC-1)

**Steps**:
1. Build a HAST tree with multiple unsupported nodes (e.g., `math`, `dl`, `section`) at different depths
2. Call `findUnsupported(tree, sourcePath)` and capture its result
3. Call `findAllUnsupported(tree, sourcePath)` and capture its result array
4. Assert that `findAllUnsupported(tree)[0]` deep-equals `findUnsupported(tree)` (first hit matches)
5. Assert that `findAllUnsupported` returns a non-empty array (more than one node)
6. Repeat with a tree containing only supported nodes — both should return null / empty array
7. Verify `classifyUnsupported` behavior is unchanged by testing it on the same nodes

**Expected Outcome**:
- `findAllUnsupported(tree)[0]` deep-equals `findUnsupported(tree)` on all tested trees (parity proven)
- `findAllUnsupported` collects all nodes, not just the first
- `findUnsupported` and `classifyUnsupported` behavior is unchanged from before this change
- RSK-3 (collect-all diverging from fast-fail) is mitigated by parity proof

**Postconditions**:
- Parity between collect-all and fast-fail classifiers is locked by unit test

**Notes / Clarifications**:
- Mirrors existing test pattern in `tests/unit/domain/markdown/unsupported.test.ts` (hand-constructed nodes)
- Use `bun test` assertions for deep equality

---

#### TC-ADVERSARIAL-003 - Multi-node collection depth-first

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, G-4, AC-F2-1, DEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts` (extend existing)
**Tags**: @backend, @unit

**Preconditions**:
- `findAllUnsupported` function is exported from `src/domain/markdown/unsupported.ts`

**Steps**:
1. Build a complex HAST tree with unsupported nodes at varying depths and branches (e.g., `math` deep in a list, `dl` nested in a blockquote, `section` at top level)
2. Call `findAllUnsupported(tree, sourcePath)` to collect all unsupported nodes
3. Assert that the number of collected nodes equals the number of unsupported nodes in the tree (none truncated)
4. Assert that nodes are ordered depth-first (first encountered in pre-order traversal)
5. Verify each node's `kind` is `UnsupportedConstruct` and `construct` matches the expected tag
6. Verify each node's `sourcePath` matches the provided `sourcePath`

**Expected Outcome**:
- All unsupported nodes in the tree are collected (no truncation to first only)
- Collection order follows depth-first traversal
- Every node's classification matches expected tag and source path

**Postconditions**:
- Collect-all classifier exhaustiveness is proven

**Notes / Clarifications**:
- This proves AC-F2-1's "ALL unsupported nodes depth-first (none truncated)" requirement
- Test tree should include at least 3-5 unsupported nodes at different nesting levels

---

#### TC-ADVERSARIAL-004 - Fidelity: supported constructs convert correctly

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, NFR-REL-4, AC-F3-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/classification-runner.test.ts`
**Tags**: @backend, @golden, @fidelity

**Preconditions**:
- Adversarial corpus fixtures exist with supported constructs
- For some fixtures, committed `.storage.xhtml` golden files exist
- Real pipeline components are available: `parseMarkdown`, `mdastToHast`, `renderStorage`

**Steps**:
1. Load each corpus fixture `tests/adversarial/*.md`
2. Run the real Markdown pipeline: `parseMarkdown` → `mdastToHast` → `renderStorage`
3. For fixtures with committed `.storage.xhtml` golden:
    - Assert that `renderStorage` succeeds (`result.ok` is `true`)
    - Assert that the rendered body byte-matches the golden file
4. For fixtures without golden files (supported constructs only):
    - Assert that `renderStorage` succeeds (supported constructs convert correctly)
    - No byte-match assertion (golden not committed)
5. For fixtures with unsupported nodes detected in `*.classification.json` (error fixtures):
    - Assert that `renderStorage` fails (`result.ok === false`)
    - Assert that the error kind and construct match the classification
6. Report pass/fail per fixture with clear error messages

**Expected Outcome**:
- All fixtures with supported constructs render successfully
- Fixtures with committed `.storage.xhtml` byte-match their goldens exactly
- Fixtures with unsupported nodes fail fast with correct error (no silent degradation)
- 0 mis-conversions of supported constructs (NFR-REL-4 fidelity)
- Existing 33-fixture golden suite continues to pass (no regression)

**Postconditions**:
- Conversion fidelity is regression-locked for adversarial content
- Unsupported-node handling is validated (success vs fast-fail error per fixture type)

**Notes / Clarifications**:
- Mirrors existing golden runner pattern at `tests/golden/markdown/storage-renderer.test.ts` lines ~73-79 (isErrorFixture handling)
- NO mocks of pipeline (TDR-0004 over-mocking guardrail) — real parser/bridge/renderer
- Entry points: `parseMarkdown`, `mdastToHast`, `findAllUnsupported` (for classification), `renderStorage`
- Error fixtures follow existing pattern: committed `*.classification.json` with unsupported nodes → fast-fail error

---

#### TC-ADVERSARIAL-005 - No-silent-drop: classification equals sidecar

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-3, G-2, AC-F3-2, ADR-0005, F-5
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/classification-runner.test.ts`
**Tags**: @backend, @golden, @no-silent-drop

**Preconditions**:
- Each corpus fixture has a committed `*.classification.json` sidecar
- `findAllUnsupported` function is available

**Steps**:
1. Load each corpus fixture pair: `*.md` + `*.classification.json`
2. Run the real pipeline: `parseMarkdown` → `mdastToHast` → `findAllUnsupported`
3. Serialize the emitted classification (array of `MarkSyncError`) to JSON
4. Deep-compare emitted classification to committed sidecar JSON
5. Assert exact equality: every unsupported node present, none missing, none extra
6. Report per-fixture pass/fail with diff on mismatch

**Expected Outcome**:
- Emitted classification deep-equals committed sidecar for all fixtures
- 0 silent drops (every unsupported node enumerated)
- 0 false positives (no extra nodes not in sidecar)
- ADR-0005 "do not silently degrade" is proven for adversarial content

**Postconditions**:
- No-silent-drop invariant is regression-locked

**Notes / Clarifications**:
- Sidecar is the pinned contract for unsupported-node enumeration
- This is the core "no silent drop" assertion (ADR-0005 / F-5)
- Real pipeline only — no mocks (TDR-0004)

---

#### TC-ADVERSARIAL-006 - Drift stability: deterministic classification output

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, G-2, AC-F3-3, DEC-3
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/classification-runner.test.ts`
**Tags**: @backend, @golden, @determinism

**Preconditions**:
- Classification runner pipeline is available

**Steps**:
1. Load each corpus fixture `*.md`
2. Run classification pipeline: `parseMarkdown` → `mdastToHast` → `findAllUnsupported` → serialize to JSON
3. Run the exact same pipeline a second time on the same fixture
4. Deep-compare the two classification outputs
5. Assert byte-identical results (0 bytes diff)

**Expected Outcome**:
- First and second classification outputs are byte-identical for all fixtures
- Classification is deterministic (idempotent)
- DEC-3 distinction holds: this is classification determinism, not sync drift

**Postconditions**:
- Drift stability is proven — same input yields identical output

**Notes / Clarifications**:
- Mirrors TC-MERM-002 in existing golden runner (mermaid fence byte-stability)
- "Drift stability" = classification determinism (DEC-3), NOT sync three-way `classify()`
- AC-F3-3 requires "twice" — this test runs exactly twice to match the requirement

---

#### TC-ADVERSARIAL-007 - Classification doc published with handling table

**Scenario Type**: Happy Path
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-4, G-3, AC-F4-1, DEC-2
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `doc/quality/adversarial-corpus-classification.md`
**Tags**: @docs, @manual

**Preconditions**:
- Classification doc file exists

**Steps**:
1. Verify `doc/quality/adversarial-corpus-classification.md` file exists
2. Read the doc and verify it contains a table mapping unsupported node types to MarkSync handling
3. Verify the table uses the three handling categories:
   - Escaped (inline raw HTML / unknown inline)
   - `UnsupportedConstruct` (block-level raw HTML, non-allow-listed element tags)
   - Requires manual macro / future MS-0003+ support (Confluence macros, app/gliffy content, nested tables)
4. Verify the doc states plainly what the one-way MS-0002 pipeline can and cannot author
5. Verify references to DEC-2 (macros/app-content cannot be authored from Markdown)

**Expected Outcome**:
- Classification doc exists and is readable
- Doc contains required handling-category table with all three categories
- Doc plainly states MS-0002 pipeline capabilities and limitations
- Users can predict how their non-GFM content will be handled

**Postconditions**:
- AC-F4-1 is met — classification doc is published and contains required content

**Notes / Clarifications**:
- This is primarily a doc deliverable; test plan includes lightweight verification
- Manual verification sufficient; DoD review will confirm completeness
- Doc verification may be done by human reviewer in phase 10 (DoD check)

---

#### TC-ADVERSARIAL-008 - PII self-audit clean across corpus artifacts

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, G-5, AC-F5-1, NFR-SEC-1, INV-SEC-1, DEC-4
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/pii-audit.test.ts`
**Tags**: @backend, @golden, @security, @pii

**Preconditions**:
- Corpus artifacts are committed: `*.md`, `*.classification.json`, optional `*.storage.xhtml`

**Steps**:
1. Scan the `tests/adversarial/` directory for all committed artifacts
2. Read each file's content
3. Run regex grep for email patterns: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
4. Run regex grep for internal-ticket URL patterns: `https?://[^\s/]+/(?:browse|projects)/(?:[A-Z][A-Z0-9_]+-)\d+` (matches Jira-style `/browse/PROJ-123` and `/projects/...`)
5. Run regex grep for bare internal ID patterns: `(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}` (case-insensitive; matches MS-123, gh_456, INT-789, TICKET-001, jira-1234)
6. Assert total match count is 0 across all artifacts
7. Report which patterns were searched and the match count (0)

**Expected Outcome**:
- 0 email pattern matches across all committed corpus artifacts
- 0 internal-ticket URL matches across all committed corpus artifacts
- 0 bare internal ID matches across all committed corpus artifacts
- PII self-audit test passes with clean output

**Postconditions**:
- AC-F5-1 is met — automated PII self-audit returns clean
- INV-SEC-1 / NFR-SEC-1 (no secrets in any output) is enforced

**Notes / Clarifications**:
- Test runs as part of `bun run check` (CI fast loop)
- Sanitization is primarily by construction (DEC-4 — synthetic corpus); grep is defense-in-depth
- Concrete regex patterns are specified above; bare ID pattern narrowed to internal-issue-ref format only
- Bare internal ID pattern is case-insensitive to catch variations (MS-123, ms-123, MS_123, etc.)

---

---

#### TC-ADVERSARIAL-010 - Hand-built-macro HAST classification (DEC-2)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-2, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts` (extend existing)
**Tags**: @backend, @unit, @classification

**Preconditions**:
- `findAllUnsupported` function is exported from `src/domain/markdown/unsupported.ts`
- HAST node construction utilities are available

**Steps**:
1. Build HAST nodes representing real Confluence macro tag shapes:
    - `{toc}` macro → `ac:structured-macro` with `ac:name="toc"`
    - `{info}` macro → `ac:structured-macro` with `ac:name="info"`
    - `{code}` macro → `ac:structured-macro` with `ac:name="code"`
    - `{expand}` macro → `ac:structured-macro` with `ac:name="expand"`
    - Jira issue macro → `ac:structured-macro` with `ac:name="jira"` or `ri:jira*` attributes
    - Gliffy/diagram app tags → `ac:structured-macro` with app-specific names or `ri:app*` attributes
2. Call `findAllUnsupported(tree, sourcePath)` on each hand-built macro node
3. Assert that each classification has `kind: "UnsupportedConstruct"`
4. Assert that each `construct` matches the expected macro tag name
5. Verify that no macro node is silently dropped (all appear in classification output)

**Expected Outcome**:
- All hand-built macro nodes are classified as `UnsupportedConstruct`
- Each macro's `construct` field matches the expected tag name (e.g., `toc`, `info`, `code`, `expand`, `jira`)
- 0 silent drops — every macro appears in classification
- DEC-2 is validated: macros/app-content cannot be authored from Markdown; they are classified as unsupported

**Postconditions**:
- Macro classification behavior is regression-locked (DEC-2)
- Classification doc accuracy is supported by test coverage

**Notes / Clarifications**:
- This is the "hand-built-macro/app HAST classification" defined in plan Phase 3.5
- Mirrors TC-005's no-silent-drop focus but uses synthetic HAST nodes, not fixture files
- Real Confluence macro tag shapes are used to ensure classification doc is accurate
- Hand-built nodes isolate macro classification from fixture complexity

---

#### TC-ADVERSARIAL-009 - Quality gate: bun run check green

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F6-1
**Test Type(s)**: Manual (CI)
**Automation Level**: Semi-automated (CI executes)
**Target Layer / Location**: CI workflow (`ci.yml`)
**Tags**: @ci, @quality-gate

**Preconditions**:
- All test files are implemented and committed
- Classification doc exists
- Corpus fixtures and sidecars are committed

**Steps**:
1. Run `bun run check` in the repository root
2. Wait for all phases to complete:
   - `bun run lint` (ESLint)
   - `bun run typecheck` (TypeScript)
   - `bun test tests/unit/` (unit tests, including parity and multi-node collection)
   - `bun test tests/integration/` (integration tests)
   - `bun test tests/golden/` (golden tests, including classification runner)
   - `bun test tests/adversarial/` (corpus inventory, PII audit)
   - `bun run test:bdd` (Gherkin tests)
3. Verify exit code is 0 (success)
4. Verify no test failures or errors in output

**Expected Outcome**:
- `bun run check` completes successfully (exit code 0)
- All linting passes
- All typechecking passes
- All unit tests pass, including new parity and multi-node collection tests
- All golden tests pass, including classification runner fidelity/no-drop/determinism
- All adversarial tests pass, including corpus inventory and PII audit
- All BDD tests pass
- AC-F6-1 is met — umbrella quality gate is green

**Postconditions**:
- Change is ready for DoD check (phase 10) and PR creation (phase 11)

**Notes / Clarifications**:
- This is the final quality gate; all earlier TCs must pass for this to succeed
- CI fast loop includes classification runner and adversarial tests
- E2E (live-sandbox) is opt-in via label; not required for this quality-gate pass

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local Development**: Bun runtime (pinned version per CI), Node.js filesystem for fixture loading
- **CI (GitHub Actions)**: Ubuntu runner, Bun setup, secrets-free (no E2E sandbox credentials required)
- **No additional environments**: All tests run locally or in CI; no staging/test Confluence space required

### 6.2 Test Data Generation and Cleanup

- **Adversarial corpus fixtures**: Synthetic, authored by hand to represent each real-world category (DEC-4)
  - No automated generation; fixtures are curated and reviewed before commit
  - Category coverage verified by TC-ADVERSARIAL-001
- **Classification sidecars**: Hand-authored JSON files recording expected unsupported-node enumeration
  - Generated initially by running the classifier on each fixture
  - Reviewed and committed as the pinned contract for no-silent-drop assertions
- **Golden storage output**: Optional `.storage.xhtml` files for fixtures with supported constructs
  - Generated by running `renderStorage` on the fixture
  - Committed as byte-exact regression locks (mirroring existing 33-fixture golden set)
- **No cleanup required**: All test data is committed source of truth; no transient state

### 6.3 Isolation Strategy

- **Unit tests**: Pure functions, no filesystem I/O or network, isolated per test
- **Golden tests**: File-based fixtures, no shared state between tests, parallelizable
- **PII audit**: Read-only scan of committed artifacts, no mutations
- **No database/shared state**: All fixtures are immutable committed files
- **No network calls**: All tests are local; real pipeline components used without external dependencies

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-ADVERSARIAL-001 | `tests/golden/adversarial/corpus-inventory.test.ts` | `bun test tests/golden/adversarial/corpus-inventory.test.ts` | None | To Implement |
| TC-ADVERSARIAL-002 | `tests/unit/domain/markdown/unsupported.test.ts` (extend) | `bun test tests/unit/domain/markdown/unsupported.test.ts` | None | To Implement |
| TC-ADVERSARIAL-003 | `tests/unit/domain/markdown/unsupported.test.ts` (extend) | `bun test tests/unit/domain/markdown/unsupported.test.ts` | None | To Implement |
| TC-ADVERSARIAL-004 | `tests/golden/adversarial/classification-runner.test.ts` | `bun test tests/golden/adversarial/classification-runner.test.ts` | None — real parser/bridge/renderer (TDR-0004) | To Implement |
| TC-ADVERSARIAL-005 | `tests/golden/adversarial/classification-runner.test.ts` | `bun test tests/golden/adversarial/classification-runner.test.ts` | None — real pipeline | To Implement |
| TC-ADVERSARIAL-006 | `tests/golden/adversarial/classification-runner.test.ts` | `bun test tests/golden/adversarial/classification-runner.test.ts` | None — real pipeline | To Implement |
| TC-ADVERSARIAL-007 | `doc/quality/adversarial-corpus-classification.md` | Manual verification (DoD review) | N/A | To Implement |
| TC-ADVERSARIAL-008 | `tests/golden/adversarial/pii-audit.test.ts` | `bun test tests/golden/adversarial/pii-audit.test.ts` | None | To Implement |
| TC-ADVERSARIAL-009 | CI workflow (`ci.yml`) | `bun run check` (CI) | N/A | Existing — Ensure new tests pass |
| TC-ADVERSARIAL-010 | `tests/unit/domain/markdown/unsupported.test.ts` (extend) | `bun test tests/unit/domain/markdown/unsupported.test.ts` | None | To Implement |

### Implementation Notes

- **Unit tests (TC-002, TC-003, TC-010)**: Extend existing `tests/unit/domain/markdown/unsupported.test.ts` with new describe blocks for parity, multi-node collection, and hand-built-macro HAST classification. Follow existing pattern of hand-constructed HAST nodes (see TC-UNSUP-001 precedent). TC-010 constructs real Confluence macro tag shapes to validate DEC-2 classification behavior.
- **Classification runner (TC-004, TC-005, TC-006)**: Create new `tests/golden/adversarial/classification-runner.test.ts` mirroring `tests/golden/markdown/storage-renderer.test.ts` structure. Use `loadFixtures()` pattern to iterate over `*.md` + `*.classification.json` pairs. NO mocks — real `parseMarkdown`, `mdastToHast`, `findAllUnsupported`, `renderStorage` entry points. TC-004 includes third branch for error fixtures (assert `result.ok === false` per `isErrorFixture` pattern).
- **Corpus inventory (TC-001)**: Create `tests/golden/adversarial/corpus-inventory.test.ts` with parametrized tests for each category. Scan fixture directory, read sidecars, assert category representation.
- **PII audit (TC-008)**: Create `tests/golden/adversarial/pii-audit.test.ts` with concrete regex patterns for emails, internal-ticket URLs, and bare internal IDs (narrowed to `(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}` case-insensitive). Scan all files in `tests/adversarial/` and assert 0 matches.
- **Classification doc (TC-007)**: Create `doc/quality/adversarial-corpus-classification.md` with required table and DEC-2 references. Manual verification in DoD phase.

### Over-Mocking Guardrail (TDR-0004)

- **Forbidden**: Mocking the Markdown pipeline (parse, bridge, renderer) in classification runner
- **Required**: Real parser/bridge/renderer entry points (`parseMarkdown`, `mdastToHast`, `findAllUnsupported`, `renderStorage`)
- **Allowed**: Fault injection is not applicable here (no network, no Confluence API calls)
- **Rationale**: Golden-tier tests must validate real converter behavior against realistic content; over-mocking would invalidate the regression protection

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Corpus size over- or under-scoped (too few to cover categories, too many to maintain) | M | M | AC-F1-1 fixes the category-coverage list; TC-ADVERSARIAL-001 enforces it; ~20–40 fixture target (DEC-4) bounds size |
| PII leaks into committed synthetic fixtures | H | L | Synthetic by construction (DEC-4); TC-ADVERSARIAL-008 automated grep self-audit + human review checklist before commit |
| Collect-all classifier diverges from fast-fail classifier logic (different verdicts) | M | L | TC-ADVERSARIAL-002 parity test proves `findAllUnsupported(tree)[0]` equals `findUnsupported(tree)`; DEC-1 enforces same allow-list reuse |
| Hand-constructed HAST macro nodes use unrealistic tag shapes → classification doc misleads users | M | L | Fixtures reference real Confluence macro tag names per spec Appendix A; TC-ADVERSARIAL-005 classification assertion catches mismatches |
| Corpus pins fragile incidental shapes, becoming a maintenance burden / flaky | L | L | Sidecars pin at classification contract (unsupported node types), not incidental rendering details; golden-runner pattern reused; RSK-5 mitigated |

### 8.2 Assumptions

- The existing unsupported-node classifier's `ALLOWED_TAGS` and raw-block detection are the correct single source of classification truth; the collect-all variant reuses them verbatim.
- Synthetic corpus fixtures authored to represent each real-world category are sufficient to catch regressions; real design-partner pages are not required for MS-0002 (DEC-4).
- The MS-0002 pipeline is strictly one-way Markdown→Storage, so macros/app-content/nested tables cannot be authored from Markdown (DEC-2).
- "Drift stability" means classification determinism (same input twice → byte-identical output), NOT the sync three-way `classify()` (DEC-3).
- Bun version is pinned in CI; golden byte-stability across Bun versions is handled by re-baselining as an explicit action per testing-strategy.md snapshot rules.

### 8.3 Open Questions

None blocking. All resolved decisions are recorded in the spec (DEC-1 through DEC-4). CEO-resolved items (R1 sanitization approach, Q1 corpus size) are captured as decisions in the spec.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | Change Test Plan Writer | Initial test plan created from chg-GH-31-spec.md, testing-strategy.md, and existing classifier/golden test patterns |
| 1.1 | 2026-07-26 | Change Test Plan Writer | Revised per DoR gate iter-1 findings: (1) DEC-5 runner/fixture split — runners moved to `tests/golden/adversarial/`, fixtures stay at `tests/adversarial/`; (2) MAJOR-4 — TC-001, TC-004, TC-005, TC-006, TC-008 relabeled as Golden tier (filesystem I/O tests); (3) MAJOR-5 — TC-004 added third branch for unsupported-fixture error handling (assert `result.ok === false`); (4) MINOR-10 — TC-008 defined concrete regexes for email, internal-ticket URL, and bare internal ID patterns; (5) MINOR-11 — Added TC-ADVERSARIAL-010 for hand-built-macro HAST classification (DEC-2); (6) MINOR-13 — TC-006 changed from 3× to 2× classification runs to match AC-F3-3 exactly; Updated §3.1, §3.2, §4.1, §4.2, §4.3, §5.1, §5.2, §7, and execution log accordingly. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-ADVERSARIAL-001 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-002 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-003 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-004 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-005 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-006 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-007 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-008 | TBD | TBD | Pending execution |
| TC-ADVERSARIAL-009 | TBD | TBD | Pending execution |

---