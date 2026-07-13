---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-63-test-plan
status: Proposed
created: 2026-07-13T00:00:00.000Z
last_updated: 2026-07-13T00:00:00.000Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high]
version_impact: patch
summary: "Test plan for YAML front-matter stripping bug fix (GH-63) — ensures front-matter is excluded from rendered Confluence pages while preserving UUID read functionality and mid-document thematic breaks."
links:
  change_spec: ./chg-GH-63-spec.md
  implementation_plan: ./chg-GH-63-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4] YAML front-matter leaks into rendered Confluence content (P0)

## 1. Scope and Objectives

This test plan validates the P0 bug fix for YAML front-matter leaking into rendered Confluence Storage XHTML. The markdown parser currently does not recognize and strip document-leading YAML front-matter blocks, causing remark to interpret `---` fences as thematic breaks and YAML content as headings/paragraphs. This results in polluted page bodies with visible `<hr/>` elements and internal UUID metadata.

The fix wires `remark-frontmatter` into the remark processor, which must:

1. **Strip document-leading front-matter** from the MDAST tree before rendering, ensuring no front-matter content appears in Storage XHTML
2. **Preserve mid-document thematic breaks** (e.g., `hr.md` fixture), proving `remark-frontmatter` only consumes document-leading fences
3. **Maintain UUID read continuity** through `readUuid()`, which uses an independent parser and must not regress
4. **Pass all existing golden tests** after adding a new `frontmatter.md` fixture and updating the fixture count assertion

### 1.1 In Scope

- Unit tests for `parseMarkdown` front-matter stripping behavior (MDAST tree validation)
- Golden fixture test for front-matter → Storage XHTML rendering (byte-exact match)
- Regression test for `readUuid()` function behavior (before/after fix equivalence)
- Verification that mid-document `---` fences still render as `<hr/>` (via existing `hr.md` fixture)
- Golden fixture count update from 26 to 27 in `storage-renderer.test.ts`

### 1.2 Out of Scope & Known Gaps

- No changes to `src/domain/identity/frontmatter.ts` (`readUuid`/`injectUuid`) — these use their own parser
- No changes to the HAST bridge, storage renderer, or canonicalizer
- No support for TOML or other front-matter formats (only YAML with `---` delimiters)
- No E2E tests (this is a correctness fix validated through unit + golden tiers per testing strategy)

## 2. References

| Document | Path | Relevance |
|----------|------|-----------|
| Change Specification | `./chg-GH-63-spec.md` | Primary source of requirements (F-1, F-2, F-3; AC-F1-1, AC-F1-2, AC-F2-1, AC-F2-2) |
| Implementation Plan | `./chg-GH-63-plan.md` | Phased delivery and implementation approach |
| Testing Strategy | `.ai/rules/testing-strategy.md` | 6-tier testing strategy; golden fixture rules |
| NFR-REL-4 | `doc/spec/nonfunctional.md` | Conversion fidelity requirement (canonical GFM round-trip) |
| ADR-0005 | `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md` | Storage Format as write target (golden fixture target) |
| ADR-0006 | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | Document identity model and `marksync.uuid` contract |
| Existing Parse Tests | `tests/unit/domain/markdown/parse.test.ts` | Template for new unit tests (TC-PARSE-001..004) |
| Existing Golden Tests | `tests/golden/markdown/storage-renderer.test.ts` | Template for golden fixture and count assertion |
| Front-Matter Module | `src/domain/identity/frontmatter.ts` | `readUuid()` function (independent parser) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Front-matter source → Storage XHTML with no front-matter leak; only post-front-matter body renders | TC-FM-001 | Proposed |
| AC-F1-2 | Front-matter source → MDAST tree excludes the front-matter block (no YAML/thematic-break nodes for the fences) | TC-FM-002 | Proposed |
| AC-F2-1 | `readUuid()` returns the same UUID before/after fix (regression guard) | TC-FM-003 | Proposed |
| AC-F2-2 | Full test suite passes; golden fixture count updated to 27; `hr.md` still renders `<hr/>` | TC-FM-004, TC-FM-005 | Proposed |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| DM ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| DM-1 | MDAST output from parseMarkdown no longer includes front-matter nodes | TC-FM-002 | Proposed |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-REL-4 | Conversion fidelity — canonical GFM fixtures survive round-trip (this fix IMPROVES fidelity) | TC-FM-004, TC-FM-005 | Proposed |
| NFR-PERF-5 | Conversion latency — no measurable impact (one plugin addition is negligible) | N/A | Covered by existing benchmark gate; no new test needed |

## 4. Test Types and Layers

| Test Type | Framework | Root Directory | Target Layer | Relevance to GH-63 |
|-----------|-----------|----------------|--------------|-------------------|
| **Unit** | `bun:test` | `tests/unit/domain/markdown/` | Domain logic: `parseMarkdown` function | TC-FM-002 (MDAST tree validation) |
| **Golden fixture** | `bun:test` + `toMatchSnapshot` | `tests/golden/markdown/` + `tests/golden/fixtures/markdown/` | End-to-end rendering: `parseMarkdown` → `mdastToHast` → `renderStorage` | TC-FM-001, TC-FM-004, TC-FM-005 (Storage XHTML output) |
| **Unit** | `bun:test` | `tests/unit/domain/identity/` (or `tests/unit/domain/markdown/`) | Domain logic: `readUuid` function | TC-FM-003 (regression guard) |

**Per testing strategy:**
- **Unit tests** validate domain logic in isolation (no mocks for `parseMarkdown`; real remark processor)
- **Golden fixture tests** validate byte-stable, deterministic Storage XHTML output (no silent snapshot regeneration)
- **No mocks** allowed for domain logic or golden fixtures (TDR-0004 over-mocking guardrail)

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-FM-001 | Front-matter stripped from Storage XHTML | Happy Path | Critical | High | AC-F1-1 |
| TC-FM-002 | MDAST tree excludes front-matter nodes | Happy Path | Critical | High | AC-F1-2, DM-1 |
| TC-FM-003 | readUuid() returns UUID unchanged | Regression | Important | High | AC-F2-1 |
| TC-FM-004 | hr.md mid-document break preserved | Regression | Important | High | AC-F2-2 |
| TC-FM-005 | Golden fixture count updated to 27 | Regression | Minor | Medium | AC-F2-2 |

### 5.2 Scenario Details

#### TC-FM-001 - Front-matter stripped from Storage XHTML

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1, NFR-REL-4
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts`, `tests/golden/fixtures/markdown/frontmatter.md` + `frontmatter.storage.xhtml`
**Tags**: @backend, @golden

**Preconditions**:
- `remark-frontmatter` is installed and wired into the remark processor in `src/domain/markdown/parse.ts`
- Golden fixture test harness exists (`storage-renderer.test.ts`)

**Steps**:

1. Create `tests/golden/fixtures/markdown/frontmatter.md` with content:
   ```markdown
   ---
   marksync:
     uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e
   ---
   # Hello World

   This is the page body after front-matter.
   ```
2. Create `tests/golden/fixtures/markdown/frontmatter.storage.xhtml` with expected Storage XHTML (NO `<hr/>`, no YAML-as-heading text):
   ```xml
   <h1>Hello World</h1>
   <p>This is the page body after front-matter.</p>
   ```
3. Run `bun test tests/golden/markdown/storage-renderer.test.ts`
4. Verify the `frontmatter` fixture is loaded and tested by the fixture iteration loop

**Expected Outcome**:
- The golden test passes: rendered Storage XHTML byte-exactly matches `frontmatter.storage.xhtml`
- NO `<hr/>` elements appear in the output (no thematic breaks from `---` fences)
- NO YAML content appears as headings or paragraphs in the output
- Only the post-front-matter body content (`# Hello World` + paragraph) renders

**Postconditions**:
- Golden fixture pair `frontmatter.md` + `frontmatter.storage.xhtml` is committed to the repo

**Notes / Clarifications**:
- This is a NEW golden fixture; the expected output reflects the corrected behavior
- Snapshot will be created via `toMatchSnapshot()` in addition to file-based byte-exact comparison (per testing strategy)

---

#### TC-FM-002 - MDAST tree excludes front-matter nodes

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/parse.test.ts` (new test file or addition)
**Tags**: @backend, @unit

**Preconditions**:
- `remark-frontmatter` is installed and wired into the remark processor

**Steps**:

1. Create a unit test in `tests/unit/domain/markdown/parse.test.ts`:
   ```typescript
   describe("TC-FM-002 — front-matter is excluded from MDAST", () => {
     const src = `---
   marksync:
     uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e
   ---
   # Hello World`;
     const result = parseMarkdown(src);

     test("returns ok", () => {
       expect(result.ok).toBe(true);
     });

     test("MDAST contains no thematic-break or yaml nodes", () => {
       if (!result.ok) throw new Error("expected ok");
       const types = nodeTypes(result.value);
       expect(types).not.toContain("thematicBreak");
       expect(types).not.toContain("yaml");
     });

     test("first child is heading (not thematic break)", () => {
       if (!result.ok) throw new Error("expected ok");
       const first = result.value.children[0];
       expect(first?.type).toBe("heading");
     });
   });
   ```
2. Run `bun test tests/unit/domain/markdown/parse.test.ts`

**Expected Outcome**:
- `parseMarkdown` returns `ok: true`
- The MDAST tree contains NO `thematicBreak` nodes (from `---` fences)
- The MDAST tree contains NO `yaml` nodes (front-matter content)
- The first child of the root is the `heading` node for `# Hello World` (not a `thematicBreak`)

**Postconditions**:
- Unit test passes, validating that `remark-frontmatter` correctly excludes front-matter from the MDAST

**Notes / Clarifications**:
- This test directly validates AC-F1-2 at the MDAST level (before HAST bridge or Storage renderer)
- Uses the existing `nodeTypes()` helper from `parse.test.ts` to collect all node types

---

#### TC-FM-003 - readUuid() returns UUID unchanged

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-F2-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts` (new file) OR `tests/unit/domain/markdown/parse.test.ts` (if colocated)
**Tags**: @backend, @unit

**Preconditions**:
- `readUuid()` function exists in `src/domain/identity/frontmatter.ts` (uses independent parser)

**Steps**:

1. Create a unit test in `tests/unit/domain/identity/frontmatter.test.ts`:
   ```typescript
   import { describe, expect, test } from "bun:test";
   import { readUuid } from "#domain/identity/frontmatter";

   describe("TC-FM-003 — readUuid() returns UUID unchanged by front-matter stripping fix", () => {
     const src = `---
   marksync:
     uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e
   ---
   # Hello World`;

     test("extracts UUID from front-matter source", () => {
       const uuid = readUuid(src);
       expect(uuid).toBe("019f5a2c-4a59-77aa-96ad-70f3719c2d1e");
     });

     test("returns undefined for source without front-matter", () => {
       const noFm = "# Hello World";
       const uuid = readUuid(noFm);
       expect(uuid).toBeUndefined();
     });

     test("returns undefined for malformed front-matter", () => {
       const malformed = `---
   marksync: bad: yaml
   ---`;
       const uuid = readUuid(malformed);
       expect(uuid).toBeUndefined();
     });
   });
   ```
2. Run `bun test tests/unit/domain/identity/frontmatter.test.ts`

**Expected Outcome**:
- `readUuid(src)` returns `"019f5a2c-4a59-77aa-96ad-70f3719c2d1e"` for the front-matter source
- `readUuid()` returns `undefined` for sources without valid front-matter
- All tests pass, confirming `readUuid()` behavior is unchanged (regression guard)

**Postconditions**:
- Unit test passes, validating that the independent parser in `frontmatter.ts` is unaffected by changes to `parseMarkdown`

**Notes / Clarifications**:
- This is a regression guard to ensure the fix (which changes `parseMarkdown`) does not break `readUuid()`
- `readUuid()` uses its own `findFrontMatter()` parser (line 92 of `frontmatter.ts`) and is independent of remark

---

#### TC-FM-004 - hr.md mid-document break preserved

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F2-2
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts`, `tests/golden/fixtures/markdown/hr.md` + `hr.storage.xhtml` (existing)
**Tags**: @backend, @golden

**Preconditions**:
- `remark-frontmatter` is installed and wired into the remark processor
- Existing `hr.md` fixture exists with content `---` (thematic break mid-document)

**Steps**:

1. Verify `tests/golden/fixtures/markdown/hr.md` contains:
   ```markdown
   ---
   ```
2. Verify `tests/golden/fixtures/markdown/hr.storage.xhtml` contains:
   ```xml
   <hr/>
   ```
3. Run `bun test tests/golden/markdown/storage-renderer.test.ts`
4. Verify the `hr` fixture test passes (byte-exact match to `<hr/>`)

**Expected Outcome**:
- The `hr` golden test passes without modification to `hr.storage.xhtml`
- The mid-document `---` is rendered as `<hr/>` (unchanged from before)
- This proves `remark-frontmatter` only consumes document-leading fences, not mid-document fences

**Postconditions**:
- Existing golden fixture passes without changes, confirming no regression in thematic break handling

**Notes / Clarifications**:
- This is an EXISTING golden fixture; we verify it still passes after the fix
- The `hr.md` fixture contains ONLY `---` (no front-matter), so it should render as a thematic break
- This validates AC-F2-2 (part of "Full test suite passes")

---

#### TC-FM-005 - Golden fixture count updated to 27

**Scenario Type**: Regression
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: AC-F2-2
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts` (line 46)
**Tags**: @backend, @golden

**Preconditions**:
- `frontmatter.md` + `frontmatter.storage.xhtml` golden fixture is added (26 → 27 fixtures)

**Steps**:

1. Update `tests/golden/markdown/storage-renderer.test.ts` line 46:
   ```typescript
   // Before:
   expect(fixtures.length).toBe(26);
   // After:
   expect(fixtures.length).toBe(27);
   ```
2. Run `bun test tests/golden/markdown/storage-renderer.test.ts`

**Expected Outcome**:
- The fixture count test passes with assertion `expect(fixtures.length).toBe(27)`
- All 27 golden fixture tests pass (26 existing + 1 new `frontmatter` fixture)

**Postconditions**:
- Fixture count assertion is updated to 27, locking in the new golden set size

**Notes / Clarifications**:
- This is a simple assertion update to reflect the addition of the `frontmatter` golden fixture
- The test message should also be updated: "the golden set is the re-baselined 27 (...)"
- This validates AC-F2-2 (part of "Full test suite passes; golden fixture count updated to 27")

---

## 6. Environments and Test Data

### 6.1 Environments

- **Local development**: Primary environment for test execution (`bun test`)
- **CI fast loop**: `.github/workflows/ci.yml` runs `bun test tests/unit/ tests/integration/ tests/golden/` on every push
- **E2E**: Not applicable (this change does not require live Confluence testing)

### 6.2 Test Data

- **Golden fixtures**: Located in `tests/golden/fixtures/markdown/`
  - NEW: `frontmatter.md` + `frontmatter.storage.xhtml` (source and expected Storage XHTML)
  - EXISTING: `hr.md` + `hr.storage.xhtml` (regression guard for mid-document `---`)
- **Unit test data**: Inline markdown strings in test files (no external fixture dependencies)

### 6.3 Isolation Strategy

- Unit tests: No external dependencies; pure function calls
- Golden tests: Byte-exact file comparison; no network or database calls
- No test-specific cleanup required (fixtures are committed source files)

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File to Create/Update | Execution Command | Mocking Requirements | Implementation Status |
|-------|---------------------------|-------------------|---------------------|----------------------|
| TC-FM-001 | NEW: `tests/golden/fixtures/markdown/frontmatter.md` + `frontmatter.storage.xhtml` | `bun test tests/golden/markdown/storage-renderer.test.ts` | None (real parser/renderer) | To Implement |
| TC-FM-002 | NEW: Test block in `tests/unit/domain/markdown/parse.test.ts` (or new file) | `bun test tests/unit/domain/markdown/parse.test.ts` | None (real remark processor) | To Implement |
| TC-FM-003 | NEW: `tests/unit/domain/identity/frontmatter.test.ts` | `bun test tests/unit/domain/identity/frontmatter.test.ts` | None (pure function) | To Implement |
| TC-FM-004 | EXISTING – No Change: `tests/golden/markdown/storage-renderer.test.ts`, `hr.md` + `hr.storage.xhtml` | `bun test tests/golden/markdown/storage-renderer.test.ts` | None | Existing – No Change |
| TC-FM-005 | UPDATE: `tests/golden/markdown/storage-renderer.test.ts` (line 46) | `bun test tests/golden/markdown/storage-renderer.test.ts` | None | Existing – Update |

**Test Implementation Notes**:

- **TC-FM-002**: Reuse existing `nodeTypes()` helper from `parse.test.ts` for MDAST node type collection
- **TC-FM-003**: Create dedicated test file `tests/unit/domain/identity/frontmatter.test.ts` for `readUuid()` coverage
- **TC-FM-001**: Golden fixture snapshot will be auto-generated on first run via `toMatchSnapshot()`, but file-based comparison (`expect(result.value.body).toBe(fixture.expected)`) is the primary assertion (per testing strategy)
- **All tests**: No mocking allowed (TDR-0004 over-mocking guardrail); use real remark processor and storage renderer

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| `remark-frontmatter` incorrectly consumes mid-document `---` fences (RSK-1 from spec) | High | Low | TC-FM-004 validates `hr.md` fixture still renders `<hr/>`; unit test TC-FM-002 validates MDAST structure | Low |
| Dependency compatibility issue with remark 15 (RSK-2 from spec) | High | Low | Verified via compatibility matrix: `remark-frontmatter` v5 targets unified 11 / remark 15 | Low |
| Regression in `readUuid()` behavior (RSK-3 from spec) | Medium | Low | TC-FM-003 regression test ensures UUID read returns same value before/after fix | Low |
| Golden fixture snapshot drift (silent regeneration) | Medium | Low | Per testing strategy: snapshot updates are explicit (`bun test --update-snapshots` must be reviewed); CI runs without update flag | Low |

### 8.2 Assumptions

- `remark-frontmatter` v5 is compatible with remark ^15.0.1 and remark-gfm ^4.0.1 (confirmed by compatibility matrix in spec Appendix B)
- The `hr.md` golden fixture uses `---` as a mid-document thematic rule, which is the regression guard case (verified via file read)
- `readUuid()` uses its own parser (`findFrontMatter`) and is unaffected by changes to the markdown processor (verified via code read)
- Golden fixture file naming convention (`<name>.md` + `<name>.storage.xhtml`) is consistent across the repo (verified via directory listing)

### 8.3 Open Questions

None — all questions resolved through spec analysis and code inspection. The test plan is complete and ready for implementation.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Test Plan Writer (via agent) | Initial test plan for GH-63 front-matter stripping bug fix |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-FM-001 | TBD | TBD | Pending implementation |
| TC-FM-002 | TBD | TBD | Pending implementation |
| TC-FM-003 | TBD | TBD | Pending implementation |
| TC-FM-004 | TBD | TBD | Pending implementation |
| TC-FM-005 | TBD | TBD | Pending implementation |

---

## AUTHORING GUIDELINES

This test plan was authored following the template at `doc/templates/test-plan-template.md` and the change lifecycle in `doc/guides/change-lifecycle.md`. Requirements are derived from `chg-GH-63-spec.md` and the GitHub Issue GH-63. The plan references the 6-tier testing strategy in `.ai/rules/testing-strategy.md` and aligns with the over-mocking guardrail in TDR-0004.

## VALIDATION CHECKLIST

- [x] `id` follows pattern `chg-<workItemRef>-test-plan` (chg-GH-63-test-plan)
- [x] `status` is "Proposed"
- [x] `created` and `last_updated` are ISO8601 UTC timestamps
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] All sections present in order (1-10 + guidelines + checklist)
- [x] TC IDs follow pattern `TC-<FEATURE>-<NNN>` (TC-FM-001 through TC-FM-005)
- [x] All AC-# from spec are covered in Coverage Overview (AC-F1-1, AC-F1-2, AC-F2-1, AC-F2-2)
- [x] Each scenario has test type, automation level, target layer, and related IDs
- [x] No placeholders remain (`<...>` replaced with actual values)
- [x] Front matter validates per front_matter_rules
- [x] Test types align with 6-tier testing strategy (unit + golden only for this change)
- [x] No over-mocking (all tests use real parser/renderer; TDR-0004 guardrail respected)
- [x] Golden fixture count update explicitly called out (26 → 27)