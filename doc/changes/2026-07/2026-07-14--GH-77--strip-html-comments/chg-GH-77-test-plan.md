---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-77-test-plan
status: Proposed
created: 2026-07-14
last_updated: 2026-07-14
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high]
version_impact: patch
summary: "Treat sync-to-Confluence as a render step by stripping non-rendering HTML and link-reference comments before Storage Format is produced, so a trivial, standard Markdown construct stops aborting sync and leaking as visible text."
links:
  change_spec: ./chg-GH-77-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - HTML comments (<!-- -->) break sync and leak as literal text

## 1. Scope and Objectives

This test plan validates that HTML comments (`<!-- … -->`) and link-reference-style comments (`[//]: # (…)`) are stripped during the parse stage (before MDAST→HAST conversion) so they no longer break sync or leak as literal text. The fix preserves the DEC-4 / F-5 invariant for non-comment raw HTML: block-level raw HTML remains `UnsupportedConstruct`, and inline raw HTML remains escaped. The test plan ensures no regression to existing 27 golden fixtures and locks the new behavior with byte-stable fixtures.

### 1.1 In Scope

- Comment-only raw HTML stripping at the parse stage (MDAST)
- Both block-level and inline HTML comments
- Link-reference-style comment variants (`[//]: #`, `[//]: # "…"`, `[//]: <>`)
- Regression guards for non-comment raw HTML (block and inline)
- Over-stripping prevention (mixed HTML+comment nodes)
- Golden fixture coverage and count assertion updates
- Determinism and idempotency for comment-bearing pages

### 1.2 Out of Scope & Known Gaps

- Live Confluence verification of comment passthrough (deferred per spec §7.3)
- Reverse conversion (Confluence Storage → Markdown)
- Stripping comments from fenced code blocks or inline code (out of scope by construction — remark represents them as code/text, never raw)
- Any change to non-comment raw HTML behavior (DEC-4 / F-5 invariant is load-bearing)

## 2. References

- **Change Specification**: `chg-GH-77-spec.md`
- **Testing Strategy**: `.ai/rules/testing-strategy.md` (6-tier strategy, golden fixture tier)
- **Decision Records**:
  - DEC-1: Strip comments (default, not passthrough)
  - DEC-2: Strip at parse stage (MDAST), not HAST
  - DEC-3: No new runtime dependency
- **Related Specs**:
  - `doc/spec/features/feature-safe-publish.md` (F-5 "no silent drop" carve-out)
  - `doc/spec/nonfunctional.md` (NFR-REL-4, NFR-PERF-4, NFR-PERF-5, NFR-SEC-5)
- **GitHub Issue**: GH-77
- **Precedent**: GH-63 (frontmatter stripping), mermaid §3.3 rule-1 comment-stripping

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Block-level `<!-- comment -->` → sync succeeds, no comment text | TC-COMM-001, TC-COMM-005 | Covered |
| AC-F1-2 | Inline `text <!-- comment --> more` → no comment text in output | TC-COMM-002, TC-COMM-006 | Covered |
| AC-F2-1 | `[//]: # (comment)` variants → no comment text in output | TC-COMM-003, TC-COMM-007 | Covered |
| AC-F3-1 | Non-comment block-level raw HTML → `UnsupportedConstruct` | TC-COMM-004, TC-COMM-008, TC-UNSUP-004 | Covered |
| AC-F3-2 | Non-comment inline raw HTML → escaped (`&lt;…&gt;`) | TC-COMM-009, TC-UNSUP-004 | Covered |
| AC-F3-3 | Mixed HTML+comment node → NOT stripped (over-strip guard) | TC-COMM-010 | Covered |
| AC-F4-1 | Full golden suite passes; existing 27 fixtures byte-exact | TC-COMM-011 | Covered |
| AC-F4-2 | Golden count assertion updated to new total | TC-COMM-011 | Covered |
| AC-F5-1 | Documentation/decision coverage (strip-vs-passthrough rationale) | N/A | Satisfied by spec DEC-1 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Description | TC Coverage | Notes |
|--------------|-------------|-------------|-------|
| DM-1 | MDAST output from parse stage (comment-only nodes removed) | TC-COMM-001, TC-COMM-002, TC-COMM-003, TC-COMM-010 | Unit tests verify MDAST shape |
| DM-2 | Canonical content hash changes for comment-bearing pages | TC-COMM-012 | Idempotency guard |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC Coverage | Notes |
|--------|-------------|-------------|-------|
| NFR-REL-4 | Conversion fidelity (100% of GFM fixtures survive round-trip) | TC-COMM-011 | Existing 27 fixtures byte-exact |
| NFR-PERF-4 | Idempotent rerun (second unchanged push = 0 writes) | TC-COMM-012 | Same input → same hash across runs |
| NFR-PERF-5 | Conversion latency ≤ 200 ms (p95) | N/A | Negligible impact (single linear tree pass) |
| NFR-SEC-5 | Converter injection safety (no new injection vector) | TC-COMM-004, TC-COMM-008, TC-COMM-010 | Real raw HTML still escaped/flagged |

## 4. Test Types and Layers

| Test Type | Framework | Root Directory | Pattern | Purpose |
|-----------|-----------|----------------|---------|---------|
| **Unit** | `bun:test` | `tests/unit/domain/markdown/` | `*.test.ts` | Comment-strip transformer predicate and behavior |
| **Golden fixture** | `bun:test` + `toMatchSnapshot` | `tests/golden/markdown/` | `storage-renderer.test.ts` | Byte-stable Storage XHTML output |
| **Integration** | `bun:test` | `tests/integration/` | `*.test.ts` | Idempotency and hash stability (NFR-PERF-4) |

**Specific test files**:
- `tests/unit/domain/markdown/html-comment-strip.test.ts` (NEW) — comment-strip transformer unit tests
- `tests/unit/domain/markdown/unsupported.test.ts` (UPDATE) — add regression guard tests for real raw HTML
- `tests/golden/markdown/storage-renderer.test.ts` (UPDATE) — golden count assertion + new fixtures

**Golden fixture files** (to add):
- `tests/golden/fixtures/markdown/html-comment-block.md` + `.storage.xhtml`
- `tests/golden/fixtures/markdown/html-comment-inline.md` + `.storage.xhtml`
- `tests/golden/fixtures/markdown/link-ref-comment.md` + `.storage.xhtml`
- `tests/golden/fixtures/markdown/raw-html-block-real.md` + `.storage.xhtml`
- `tests/golden/fixtures/markdown/raw-html-inline-real.md` + `.storage.xhtml`
- `tests/golden/fixtures/markdown/mixed-html-comment.md` + `.storage.xhtml`

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-COMM-001 | Strip comment-only block-level HTML | Happy Path | Critical | High | AC-F1-1 |
| TC-COMM-002 | Strip comment-only inline HTML | Happy Path | Critical | High | AC-F1-2 |
| TC-COMM-003 | Link-reference comment variants produce no output | Happy Path | Important | High | AC-F2-1 |
| TC-COMM-004 | Real block-level raw HTML still flagged | Regression | Critical | High | AC-F3-1 |
| TC-COMM-005 | Block comment golden fixture | Golden | Critical | High | AC-F1-1 |
| TC-COMM-006 | Inline comment golden fixture | Golden | Critical | High | AC-F1-2 |
| TC-COMM-007 | Link-ref comment golden fixture | Golden | Important | High | AC-F2-1 |
| TC-COMM-008 | Real block raw HTML golden fixture | Golden | Critical | High | AC-F3-1 |
| TC-COMM-009 | Real inline raw HTML golden fixture | Golden | Important | High | AC-F3-2 |
| TC-COMM-010 | Mixed HTML+comment node NOT stripped | Corner Case | Critical | High | AC-F3-3 |
| TC-COMM-011 | Full golden suite passes byte-exact | Regression | Critical | High | AC-F4-1, AC-F4-2 |
| TC-COMM-012 | Idempotent rerun of comment-bearing page | Performance | Important | Medium | NFR-PERF-4 |
| TC-UNSUP-004 | Raw HTML classification (existing, update guard) | Regression | Critical | High | AC-F3-1, AC-F3-2 |

### 5.2 Scenario Details

#### TC-COMM-001 - Strip comment-only block-level HTML

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/html-comment-strip.test.ts`
**Tags**: @backend

**Preconditions**:
- Comment-strip transformer is implemented in `src/domain/markdown/parse.ts`

**Steps**:
1. Parse markdown containing a block-level comment: `<!-- this is a comment -->\n\nParagraph after.`
2. Inspect the MDAST output for any `html` node with comment-only content
3. Convert MDAST to HAST
4. Verify HAST contains no `raw` node for the comment

**Expected Outcome**:
- MDAST has zero `html` nodes with comment-only content
- HAST has zero `raw` nodes for the comment
- The paragraph node is still present
- The tree structure is otherwise identical to a version without the comment

#### TC-COMM-002 - Strip comment-only inline HTML

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/html-comment-strip.test.ts`
**Tags**: @backend

**Preconditions**:
- Comment-strip transformer is implemented

**Steps**:
1. Parse markdown containing an inline comment: `Before text <!-- middle --> after text.`
2. Inspect the MDAST output for any `html` node inside the paragraph
3. Convert MDAST to HAST
4. Verify the resulting `p` element contains only the two text nodes

**Expected Outcome**:
- MDAST has zero `html` nodes with comment-only content
- HAST `p` element contains exactly two text nodes: "Before text " and " after text."
- No `raw` node exists for the comment
- The two text nodes are concatenated in the rendered output with proper spacing

#### TC-COMM-003 - Link-reference comment variants produce no output

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F2-1
**Test Type(s)**: Unit + Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/html-comment-strip.test.ts` + `tests/golden/markdown/storage-renderer.test.ts`
**Tags**: @backend

**Preconditions**:
- Markdown parser (remark) is configured

**Steps**:
1. Parse markdown with `[//]: # (comment)` variant
2. Parse markdown with `[//]: # "comment"` variant
3. Parse markdown with `[//]: <>` variant
4. For each variant, inspect MDAST for any `definition` node
5. Convert each to HAST and verify no output

**Expected Outcome**:
- Each variant produces a `definition` node in MDAST (remark's behavior)
- HAST output for each variant is empty (no nodes from the comment)
- If any variant leaks, extend the strip to cover it (record in test notes)
- Golden fixture locks the verified behavior

#### TC-COMM-004 - Real block-level raw HTML still flagged

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, DEC-4
**Test Type(s)**: Unit + Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts` + `tests/golden/markdown/storage-renderer.test.ts`
**Tags**: @backend

**Preconditions**:
- Comment-strip transformer does NOT strip non-comment raw HTML
- `findUnsupported` classifier is unchanged

**Steps**:
1. Parse markdown with `<div>real block</div>` on its own line
2. Convert to HAST
3. Run `findUnsupported` classifier
4. Verify `UnsupportedConstruct: raw-html-block` is returned
5. Verify `renderStorage` returns `Result.err`

**Expected Outcome**:
- The raw HTML node is NOT stripped (comment predicate rejects it)
- Classifier returns `{ kind: "UnsupportedConstruct", construct: "raw-html-block" }`
- `renderStorage` returns `Result.err` with the unsupported error
- Behavior is unchanged from before GH-77 (DEC-4 / F-5 invariant preserved)

#### TC-COMM-005 - Block comment golden fixture

**Scenario Type**: Golden
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-4, AC-F1-1, AC-F4-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/fixtures/markdown/html-comment-block.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Golden test harness (`storage-renderer.test.ts`) loads all `.md` + `.storage.xhtml` pairs

**Steps**:
1. Create `html-comment-block.md` with: `<!-- Block comment -->\n\n# Heading\n\nSome content.`
2. Create `html-comment-block.storage.xhtml` with: `<h1>Heading</h1>\n\n<p>Some content.</p>`
3. Run golden test harness

**Expected Outcome**:
- Markdown input contains `<!-- Block comment -->` on its own line
- Storage XHTML output has no `<!--`, `-->`, or `&lt;!--` sequences
- `renderStorage` returns `Result.ok` (not `UnsupportedConstruct`)
- Output matches snapshot byte-exact
- Fixture is counted in the total golden count

#### TC-COMM-006 - Inline comment golden fixture

**Scenario Type**: Golden
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-4, AC-F1-2, AC-F4-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/fixtures/markdown/html-comment-inline.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Golden test harness is configured

**Steps**:
1. Create `html-comment-inline.md` with: `Text before <!-- inline --> text after.`
2. Create `html-comment-inline.storage.xhtml` with: `<p>Text before text after.</p>`
3. Run golden test harness

**Expected Outcome**:
- Markdown input contains inline comment
- Storage XHTML output contains `<p>Text before text after.</p>` (no comment remnants)
- No `&lt;!--` or `&gt;` sequences (comment is stripped, not escaped)
- Output matches snapshot byte-exact

#### TC-COMM-007 - Link-ref comment golden fixture

**Scenario Type**: Golden
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-4, AC-F2-1, AC-F4-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/fixtures/markdown/link-ref-comment.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Golden test harness is configured

**Steps**:
1. Create `link-ref-comment.md` with all variants:
   ```
   [//]: # (paren comment)

   [//]: # "quote comment"

   [//]: <>

   # Heading

   Content.
   ```
2. Create `link-ref-comment.storage.xhtml` with: `<h1>Heading</h1>\n\n<p>Content.</p>`
3. Run golden test harness

**Expected Outcome**:
- All three link-reference comment variants produce no output
- Storage XHTML contains only the heading and paragraph
- No comment text appears in the body
- Output matches snapshot byte-exact

#### TC-COMM-008 - Real block raw HTML golden fixture

**Scenario Type**: Golden
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, AC-F3-1, AC-F4-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/fixtures/markdown/raw-html-block-real.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Golden test harness is configured
- `renderStorage` returns `Result.err` for unsupported constructs

**Steps**:
1. Create `raw-html-block-real.md` with: `<div class="x">Real block</div>\n\n# Heading`
2. Run golden test harness (expecting error)

**Expected Outcome**:
- Markdown input contains non-comment block-level raw HTML
- `renderStorage` returns `Result.err` with `UnsupportedConstruct: raw-html-block`
- This fixture demonstrates the regression guard is intact

**Notes / Clarifications**:
- This fixture may not have a `.storage.xhtml` file (error case) or may capture the error structure in the test instead

#### TC-COMM-009 - Real inline raw HTML golden fixture

**Scenario Type**: Golden
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, F-4, AC-F3-2, AC-F4-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/fixtures/markdown/raw-html-inline-real.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Golden test harness is configured

**Steps**:
1. Create `raw-html-inline-real.md` with: `Text <b>raw</b> inline.`
2. Create `raw-html-inline-real.storage.xhtml` with: `<p>Text &lt;b&gt;raw&lt;/b&gt; inline.</p>`
3. Run golden test harness

**Expected Outcome**:
- Markdown input contains non-comment inline raw HTML
- Storage XHTML output contains escaped HTML: `&lt;b&gt;raw&lt;/b&gt;`
- Behavior is unchanged from before GH-77 (DEC-4 invariant preserved)
- Output matches snapshot byte-exact

#### TC-COMM-010 - Mixed HTML+comment node NOT stripped

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-3
**Test Type(s)**: Unit + Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/html-comment-strip.test.ts` + `tests/golden/fixtures/markdown/mixed-html-comment.md` + `.storage.xhtml`
**Tags**: @backend

**Preconditions**:
- Comment-strip predicate distinguishes comment-only from mixed content

**Steps**:
1. Parse markdown with: `<div data-x="1"><!-- note --></div>` (block level)
2. Parse markdown with: `Text <span><!-- note --></span> inline.` (inline)
3. Verify the raw nodes are NOT stripped
4. Verify block-level produces `UnsupportedConstruct`
5. Verify inline is escaped in golden output

**Expected Outcome**:
- Both mixed-content raw nodes are preserved (not stripped)
- Block-level mixed node triggers `UnsupportedConstruct` (regression guard)
- Inline mixed node is escaped in output: `&lt;span&gt;&lt;!-- note --&gt;&lt;/span&gt;`
- Proves the predicate does not over-strip

#### TC-COMM-011 - Full golden suite passes byte-exact

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, AC-F4-2
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts`
**Tags**: @backend

**Preconditions**:
- All new comment/regression fixtures are added
- Existing 27 fixtures are unchanged

**Steps**:
1. Run `bun test tests/golden/markdown/storage-renderer.test.ts`
2. Verify all existing 27 fixtures pass byte-exact
3. Verify new fixtures (6 new pairs) pass
4. Update the golden count assertion from 27 to 33

**Expected Outcome**:
- All 33 fixtures (27 existing + 6 new) pass byte-exact
- Golden count test asserts `expect(fixtures.length).toBe(33)`
- No silent snapshot regeneration occurred (review CI output)
- All AC coverage is locked in golden fixtures

#### TC-COMM-012 - Idempotent rerun of comment-bearing page

**Scenario Type**: Performance
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-PERF-4, DM-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/` (new or existing)
**Tags**: @backend, @perf

**Preconditions**:
- Full pipeline is testable (parse → render → hash)

**Steps**:
1. Create a test page with block comment, inline comment, and regular content
2. Run the full pipeline once, capture the canonical content hash
3. Run the pipeline a second time with identical input
4. Verify the second hash matches the first hash
5. Verify no writes occur on the second push (idempotent)

**Expected Outcome**:
- First run produces a stable hash
- Second run produces the exact same hash (deterministic strip)
- Second push performs 0 writes (idempotency preserved)
- Demonstrates NFR-PERF-4 is satisfied

## 6. Environments and Test Data

### Environments

- **Local development**: Primary execution environment for all tiers (unit, golden, integration)
- **CI**: Fast loop runs unit, golden, and integration tests on every push
- **E2E (live-sandbox)**: Not required for this change (no Confluence API changes)

### Test Data

- **Golden fixtures**: Committed `.md` + `.storage.xhtml` pairs in `tests/golden/fixtures/markdown/`
- **Unit test data**: Inline markdown strings in test files
- **Integration test data**: Temporary test pages with comment-bearing markdown

### Isolation Strategy

- Unit tests use isolated markdown strings (no filesystem)
- Golden tests use committed fixtures (no external state)
- Integration tests use temporary in-memory structures (no persistent state)

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File to Create/Update | Execution Command | Mocking Requirements | Implementation Status |
|-------|---------------------------|-------------------|---------------------|----------------------|
| TC-COMM-001 | `tests/unit/domain/markdown/html-comment-strip.test.ts` (NEW) | `bun test tests/unit/domain/markdown/html-comment-strip.test.ts` | None (pure function) | To Implement |
| TC-COMM-002 | `tests/unit/domain/markdown/html-comment-strip.test.ts` (NEW) | Same as above | None | To Implement |
| TC-COMM-003 | `tests/unit/domain/markdown/html-comment-strip.test.ts` (NEW) | Same as above | None | To Implement |
| TC-COMM-004 | `tests/unit/domain/markdown/unsupported.test.ts` (UPDATE) | `bun test tests/unit/domain/markdown/unsupported.test.ts` | None (HAST fixtures) | Existing – Update |
| TC-COMM-005 | `tests/golden/fixtures/markdown/html-comment-block.md` + `.storage.xhtml` (NEW) | `bun test tests/golden/markdown/storage-renderer.test.ts` | None | To Implement |
| TC-COMM-006 | `tests/golden/fixtures/markdown/html-comment-inline.md` + `.storage.xhtml` (NEW) | Same as above | None | To Implement |
| TC-COMM-007 | `tests/golden/fixtures/markdown/link-ref-comment.md` + `.storage.xhtml` (NEW) | Same as above | None | To Implement |
| TC-COMM-008 | `tests/golden/fixtures/markdown/raw-html-block-real.md` + `.storage.xhtml` (NEW) | Same as above | None | To Implement |
| TC-COMM-009 | `tests/golden/fixtures/markdown/raw-html-inline-real.md` + `.storage.xhtml` (NEW) | Same as above | None | To Implement |
| TC-COMM-010 | `tests/unit/domain/markdown/html-comment-strip.test.ts` (NEW) + `tests/golden/fixtures/markdown/mixed-html-comment.md` + `.storage.xhtml` (NEW) | `bun test tests/unit/domain/markdown/html-comment-strip.test.ts` and `bun test tests/golden/markdown/storage-renderer.test.ts` | None | To Implement |
| TC-COMM-011 | `tests/golden/markdown/storage-renderer.test.ts` (UPDATE) | `bun test tests/golden/markdown/storage-renderer.test.ts` | None | Existing – Update |
| TC-COMM-012 | `tests/integration/idempotency.test.ts` (NEW or UPDATE) | `bun test tests/integration/` | Mock Confluence API (if needed) | To Implement |
| TC-UNSUP-004 | `tests/unit/domain/markdown/unsupported.test.ts` (UPDATE) | `bun test tests/unit/domain/markdown/unsupported.test.ts` | None | Existing – Update |

**Total new files**: 6 golden fixture pairs (12 files) + 1 unit test file + optionally 1 integration test file

**Total files to update**: 2 test files (`html-comment-strip.test.ts` new, `unsupported.test.ts` update, `storage-renderer.test.ts` update)

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Over-stripping: predicate matches mixed HTML+comment nodes | H | L | TC-COMM-010 explicitly tests mixed content; predicate must match only comment-only nodes | L |
| Under-stripping: comment variant not recognized and still leaks | M | L | TC-COMM-003 covers common link-ref variants; golden fixtures lock behavior | L |
| Golden count drift: CI auto-update snapshots silently | M | L | TC-COMM-011 includes explicit count assertion; CI must require manual snapshot update | L |
| Idempotency break: strip non-deterministic across runs | M | L | TC-COMM-012 verifies hash stability; comment strip is pure function | L |

### 8.2 Assumptions

- remark parses `[//]: # (…)` variants as `definition` nodes with no HAST output (to be verified)
- Comments inside fenced/inline code are not raw HTML (remark represents them as `code`/`text`, never `raw`)
- The comment-only predicate can distinguish comment-only from mixed HTML with a simple regex
- Bun's `toMatchSnapshot` provides byte-stable comparisons for XHTML output

### 8.3 Open Questions

None blocking. All test scenarios are derivable from the spec and existing code patterns.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Change Test Plan Writer | Initial test plan creation |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| — | — | — | Not yet executed |

---