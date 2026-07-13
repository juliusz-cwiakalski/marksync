# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-63
Date: 2026-07-13
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: FAIL
- dod_defined: PASS

## Findings

### 1. [critical] test_traceability / cross_artifact_consistency — test-plan §5.1 Scenario Index + existing `tests/unit/domain/identity/frontmatter.test.ts`

Gap: The test plan introduces TC-FM-001 through TC-FM-005 for front-matter
*stripping* behavior. However, TC-FM-001 through TC-FM-009 **already exist** in
`tests/unit/domain/identity/frontmatter.test.ts` (delivered under GH-18) for
front-matter read/inject *identity* behavior:

| Existing ID | Existing purpose (frontmatter.test.ts) | Proposed ID | Proposed purpose |
|---|---|---|---|
| TC-FM-001 | readUuid returns DocumentId when present | TC-FM-001 | Front-matter stripped from Storage XHTML |
| TC-FM-002 | readUuid tolerant of malformed value/fences | TC-FM-002 | MDAST tree excludes front-matter nodes |
| TC-FM-003 | injectUuid fresh block | TC-FM-003 | readUuid() returns UUID unchanged |
| TC-FM-004 | injectUuid idempotent | TC-FM-004 | hr.md mid-document break preserved |
| TC-FM-005 | injectUuid under existing marksync map | TC-FM-005 | Golden fixture count updated to 27 |

Five IDs collide. Traceability is destroyed: a search for "TC-FM-003" yields two
unrelated test cases. This makes AC-to-TC mapping ambiguous for the reviewer and
DoD checker.

Suggested remediation target phase: test_planning
Suggested fix: Rename the five new test cases to a distinct prefix (e.g.,
TC-FMS-001..005 or TC-FMSTRIP-001..005). Update the test-plan scenario index,
coverage tables, automation plan table, and the plan's Test Scenarios table to
match.

---

### 2. [critical] plan_coverage / plan_code_area_coverage — plan Phase 5 Task 5.1 + test-plan §7 Automation Plan

Gap: Both the plan (Phase 5 Task 5.1: "Create
`tests/unit/domain/identity/frontmatter.test.ts`") and the test-plan (§7:
"NEW: `tests/unit/domain/identity/frontmatter.test.ts`") instruct the coder to
**create** a file that **already exists** with 167 lines and 9 existing test
cases (TC-FM-001..009 + TC-INJECT-008, delivered under GH-18). Literally
following the "Create" instruction would overwrite and destroy the existing
identity test suite. The Phase 5 "Affected code areas" also mislabels the file
as "(new: regression test file)".

Suggested remediation target phase: delivery_planning
Suggested fix: Change Phase 5 Task 5.1 from "Create" to "Add a regression test
block to the EXISTING `tests/unit/domain/identity/frontmatter.test.ts`". Update
the Phase 5 affected-code-area label from "(new: …)" to "(updated: add …)".
Update test-plan §7 automation table accordingly.

---

### 3. [major] test_traceability — test-plan TC-FM-003 + spec AC-F2-1 vs existing coverage

Gap: The proposed regression tests for `readUuid()` (returns UUID from
front-matter source; returns undefined for no front-matter; returns undefined for
malformed front-matter) are **already covered** by existing TC-FM-001 (lines
18–24) and TC-FM-002 (lines 26–40) in `frontmatter.test.ts`. Since the spec's
NG-1 explicitly states `readUuid`/`frontmatter.ts` is NOT being changed, the
existing tests already constitute a complete regression guard for AC-F2-1. The
proposed new test block is redundant. (Note: `readUuid` uses its own
`findFrontMatter` parser — confirmed in `src/domain/identity/frontmatter.ts`
line 92 — fully independent of `parseMarkdown`.)

Suggested remediation target phase: test_planning
Suggested fix: Either (a) drop TC-FM-003 (renamed per Finding 1) entirely and
map AC-F2-1 to existing TC-FM-001/TC-FM-002 in `frontmatter.test.ts` (document
the existing-coverage linkage in the coverage table), or (b) reduce it to a
single lightweight assertion confirming the spec's example UUID
(`019f5a2c-…`) round-trips, added as a new `test(...)` inside the existing
`describe("readUuid", …)` block — not a new describe, not a new file.

---

### 4. [major] cross_artifact_consistency — spec §5.1 (F-2) + §17 (AC-F2-2) vs plan Phase 2.4 + pm-notes

Gap: The spec describes `hr.md` as a "mid-document thematic rule" (F-2: "e.g.,
used for thematic breaks in the `hr.md` golden fixture"; AC-F2-2: "which uses
`---` as a mid-document thematic rule") and asserts it "must continue to render
its `<hr/>` unchanged." This is **factually wrong**: `hr.md` contains exactly a
single document-LEADING `---` with NO closing fence (verified by file read — 1
line, content `---`). It is NOT mid-document. The plan (Phase 2.4) and pm-notes
correctly identify this as a document-leading lone fence requiring empirical
verification. The spec's assertion that it "must render unchanged" does not
acknowledge the risk that `remark-frontmatter` could consume it.

Suggested remediation target phase: specification
Suggested fix: Correct F-2 and AC-F2-2 to accurately describe `hr.md` as a
document-leading lone `---` (no closing fence). Soften "must continue to render
unchanged" to acknowledge empirical verification (the plan already handles this;
the spec should align). If `remark-frontmatter` consumes the lone `---`, AC-F2-2
permits golden updates ("golden snapshots/fixture counts updated to reflect the
fix"), so the contingency path is available — the spec just needs to say so.

---

### 5. [minor] plan_doc_update_coverage — plan Phase 1–7 "System docs to update: None"

Gap: Every phase marks "System docs to update: None." However,
`doc/spec/features/feature-safe-publish.md` line 142 documents the pipeline as
"remark + remark-gfm" and "25 golden `.md`/`.storage.xhtml` fixture pairs." After
this change the pipeline is "remark + remark-frontmatter + remark-gfm" and the
count is 27 (it is already stale at 26). The pm-notes explicitly flagged this
("doc-syncer should note `remark-frontmatter` addition"), but the plan does not
reference it. While the `system_spec_update` lifecycle phase (run by `@doc-syncer`
post-delivery) handles reconciliation, the plan should flag the known impact.

Suggested remediation target phase: delivery_planning
Suggested fix: Add `doc/spec/features/feature-safe-publish.md` (line ~142:
update pipeline description to include `remark-frontmatter`; update fixture count
25 → 27) to Phase 7's "System docs to update" list, or add a note that the
doc-syncer phase must address it.

---

### 6. [nit] system_spec_consistency — `doc/spec/features/feature-safe-publish.md` line 142

Gap: Pre-existing drift — system spec says "25 golden fixture pairs" but the
actual count is 26 (test asserts 26 since GH-25 mermaid addition). This change
makes it 27. Not introduced by GH-63 but should be corrected during
`system_spec_update`.

Suggested remediation target phase: delivery_planning
Suggested fix: Note for `@doc-syncer`: correct fixture count from stale "25" to
"27" when reconciling system spec post-delivery.
