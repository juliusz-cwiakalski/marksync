---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-63-frontmatter-strip
status: Proposed
created: 2026-07-13T00:00:00.000Z
last_updated: 2026-07-13T00:00:00.000Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high]
links:
  change_spec: ./chg-GH-63-spec.md
summary: >
  Fix P0 bug where YAML front-matter (marksync.uuid identity block) leaks into rendered Confluence Storage XHTML.
  Install remark-frontmatter plugin and wire it into the markdown processor to strip document-leading front-matter
  from the MDAST tree before rendering, while preserving mid-document thematic breaks.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-63: [MS2-E4] YAML front-matter leaks into rendered Confluence content (P0)

## Context and Goals

This plan delivers a P0 bug fix for YAML front-matter leaking into rendered Confluence pages. The current markdown parser (`src/domain/markdown/parse.ts`) does not recognize document-leading YAML front-matter blocks, so remark interprets the `---` delimiters as thematic breaks and the YAML body as headings/paragraphs. This produces `<hr/>` + YAML-as-heading nodes at the top of every managed page, polluting the Confluence page body and exposing internal UUID metadata.

The fix installs the `remark-frontmatter` plugin and wires it into the remark processor before `remark-gfm`. This causes remark to recognize and exclude document-leading YAML front-matter from the MDAST tree before rendering, while preserving mid-document `---` fences as thematic breaks (validated via the `hr.md` golden fixture).

All requirements are derived from `chg-GH-63-spec.md` and `chg-GH-63-test-plan.md`. No open questions remain.

## Scope

### In Scope

- Install `remark-frontmatter` npm package and add to `package.json` / `bun.lock` (F-1)
- Update `src/domain/markdown/parse.ts` to wire `remark-frontmatter` into the remark processor (F-1, F-2)
- Add unit test TC-FM-002 to `tests/unit/domain/markdown/parse.test.ts` validating MDAST tree excludes front-matter nodes (AC-F1-2, DM-1)
- Create golden fixture `tests/golden/fixtures/markdown/frontmatter.md` + `frontmatter.storage.xhtml` for TC-FM-001 (AC-F1-1)
- Update `tests/golden/markdown/storage-renderer.test.ts` fixture count assertion 26 → 27 for TC-FM-005 (AC-F2-2)
- Add regression test TC-FM-003 to `tests/unit/domain/identity/frontmatter.test.ts` confirming `readUuid()` behavior unchanged (F-3, AC-F2-1)
- Verify `hr.md` golden fixture still renders `<hr/>` after fix, proving mid-document `---` fences preserved (TC-FM-004, F-2, AC-F2-2)

### Out of Scope

- No changes to `src/domain/identity/frontmatter.ts` (`readUuid`/`injectUuid`) — they use an independent parser (NG-1, NG-4)
- No changes to the HAST bridge, storage renderer, or canonicalizer (NG-2)
- No support for TOML or other front-matter formats (NG-3)
- No changes to the identity/init flow (NG-4)

### Constraints

- Must preserve remark 15 / remark-gfm 4 compatibility (verified via dependency compatibility matrix in spec Appendix B)
- Must not break `readUuid()` — identity reads use independent parser and must remain unchanged (F-3, AC-F2-1)
- Must preserve mid-document thematic breaks — only document-leading `---` fences are front-matter (F-2, AC-F2-2)
- Code style per `.ai/rules/typescript.md` — self-documenting, minimal comments, no spec restatements
- Tests per `.ai/rules/testing-strategy.md` — no mocks for domain logic or golden fixtures (TDR-0004 guardrail)

### Risks

- **RSK-1**: `remark-frontmatter` incorrectly consumes mid-document `---` fences (Impact: H, Probability: L). Mitigated by TC-FM-004 verifying `hr.md` fixture still renders `<hr/>` unchanged.
- **RSK-2**: Dependency compatibility issue with remark 15 (Impact: H, Probability: L). Mitigated by verifying `remark-frontmatter` v5 targets unified 11 / remark 15 per compatibility matrix.
- **RSK-3**: Regression in `readUuid()` behavior (Impact: M, Probability: L). Mitigated by TC-FM-003 regression test confirming UUID read returns same value.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Front-matter visibility in rendered Storage XHTML | 0 occurrences (fully stripped) | G-1, AC-F1-1 |
| UUID read accuracy | 100% (same as before) | G-2, AC-F2-1 |
| Test suite pass rate | 100% (golden fixtures updated) | G-3, AC-F2-2 |

## Phases

### Phase 1: Dependency Installation

**Goal**: Install `remark-frontmatter` npm package and verify compatibility with remark 15 / remark-gfm 4.

**Tasks**:

- [ ] **1.1** Create or checkout branch `fix/GH-63/frontmatter-strip`
- [ ] **1.2** Run `bun add remark-frontmatter` to install the package
- [ ] **1.3** Verify in `package.json` that `remark-frontmatter` is added to dependencies with version ^5.x
- [ ] **1.4** Verify in `bun.lock` that the package resolves correctly with no conflicts

**Acceptance Criteria**:

- Must: `remark-frontmatter` ^5.x is listed in `package.json` dependencies
- Must: `bun.lock` shows successful resolution with no conflicts
- Should: Version matches remark 15 compatibility per spec Appendix B

**Affected code areas**:

- `package.json` (updated: add `remark-frontmatter` to dependencies)
- `bun.lock` (updated: lockfile resolution)

**System docs to update**:

- None (no system doc changes for dependency addition)

**Tests**:

- Run `bun run lint` to ensure package.json is valid
- Run `bun run install --frozen-lockfile` to verify lockfile is frozen-lockfile-compatible

**Completion signal**: `fix(GH-63): install remark-frontmatter dependency`

---

### Phase 2: Wire remark-frontmatter Plugin

**Goal**: Update the markdown processor to use `remark-frontmatter` before `remark-gfm`, and empirically verify mid-document thematic breaks are preserved via the `hr.md` fixture.

**Tasks**:

- [ ] **2.1** Update `src/domain/markdown/parse.ts` to import `remarkFrontmatter` from `remark-frontmatter`
- [ ] **2.2** Update the processor chain from `remark().use(remarkGfm)` to `remark().use(remarkFrontmatter).use(remarkGfm)`
- [ ] **2.3** Add a brief comment documenting the plugin order rationale:
  - `remark-frontmatter` first: registers YAML front-matter syntax (document-leading `---` fences only)
  - `remark-gfm` second: adds GFM extensions (tables, strikethrough, etc.)
- [ ] **2.4** Run `bun test tests/golden/markdown/storage-renderer.test.ts` to empirically determine `hr.md` behavior:
  - If `hr.md` test passes (renders `<hr/>`): document that `remark-frontmatter` correctly treats unterminated `---` as thematic break (desired)
  - If `hr.md` test fails (renders empty body): either update `hr.storage.xhtml` OR modify `hr.md` to use mid-document `---` (e.g., `text\n\n---\n`) and update expected output
- [ ] **2.5** Document the chosen resolution for the `hr.md` edge case in the plan revision log (see "Plan Revision Log" section below)

**Acceptance Criteria**:

- Must: `src/domain/markdown/parse.ts` imports and uses `remarkFrontmatter` before `remarkGfm`
- Must: Plugin order is documented with rationale
- Must: `hr.md` golden test passes (either with unchanged fixture or with explicit fixture/modification decision per AC-F2-2)
- Should: Comment is minimal (≤ 1 line) per code style rules

**Affected code areas**:

- `src/domain/markdown/parse.ts` (updated: add import, wire plugin, document order)
- `tests/golden/fixtures/markdown/hr.storage.xhtml` (updated: if empirical test requires fixture update, per AC-F2-2)
- `tests/golden/fixtures/markdown/hr.md` (updated: if empirical test requires source modification, per AC-F2-2)

**System docs to update**:

- None (no system doc changes for plugin wiring)

**Tests**:

- Run `bun test tests/golden/markdown/storage-renderer.test.ts` to verify `hr.md` behavior empirically
- Run `bun test tests/unit/domain/markdown/parse.test.ts` to ensure existing parse tests still pass
- Run `bun run typecheck` to ensure TS compilation succeeds

**Completion signal**: `fix(GH-63): wire remark-frontmatter plugin into markdown processor`

---

### Phase 3: Unit Test (TC-FM-002)

**Goal**: Add unit test validating that front-matter is excluded from the MDAST tree (no `thematicBreak` or `yaml` nodes; first child is heading).

**Tasks**:

- [ ] **3.1** Add test block to `tests/unit/domain/markdown/parse.test.ts` for TC-FM-002:
  - Use markdown source with front-matter: `---\nmarksync:\n  uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e\n---\n# Hello World`
  - Verify `parseMarkdown` returns `ok: true`
  - Verify MDAST tree contains no `thematicBreak` nodes
  - Verify MDAST tree contains no `yaml` nodes
  - Verify first child is `heading` (not `thematicBreak`)
- [ ] **3.2** Reuse existing `nodeTypes()` helper from `parse.test.ts` for type collection
- [ ] **3.3** Follow code style rules: minimal comments, self-documenting, no spec restatements

**Acceptance Criteria**:

- Must: Unit test `TC-FM-002` passes with all three assertions
- Must: MDAST tree contains no `thematicBreak` or `yaml` nodes
- Must: First child is `heading` node for `# Hello World`
- Should: Test uses existing `nodeTypes()` helper for DRY

**Affected code areas**:

- `tests/unit/domain/markdown/parse.test.ts` (updated: add TC-FM-002 test block)

**System docs to update**:

- None (no system doc changes for unit test addition)

**Tests**:

- Run `bun test tests/unit/domain/markdown/parse.test.ts` to verify TC-FM-002 passes
- Run `bun run test` to ensure full test suite passes

**Completion signal**: `test(GH-63): add TC-FM-002 unit test for front-matter MDAST exclusion`

---

### Phase 4: Golden Fixture (TC-FM-001, TC-FM-005)

**Goal**: Create golden fixture proving front-matter is stripped from Storage XHTML, and update fixture count assertion 26 → 27.

**Tasks**:

- [ ] **4.1** Create `tests/golden/fixtures/markdown/frontmatter.md` with content:
  ```markdown
  ---
  marksync:
    uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e
  ---
  # Hello World

  This is the page body after front-matter.
  ```
- [ ] **4.2** Create `tests/golden/fixtures/markdown/frontmatter.storage.xhtml` with expected output (NO `<hr/>`, no YAML):
  ```xml
  <h1>Hello World</h1>
  <p>This is the page body after front-matter.</p>
  ```
- [ ] **4.3** Update `tests/golden/markdown/storage-renderer.test.ts` line 46:
  - Change `expect(fixtures.length).toBe(26)` to `expect(fixtures.length).toBe(27)`
  - Update test message: "the golden set is the re-baselined 27 (...)"
- [ ] **4.4** Run `bun test tests/golden/markdown/storage-renderer.test.ts` to verify fixture is loaded and passes

**Acceptance Criteria**:

- Must: Golden fixture `frontmatter.md` + `frontmatter.storage.xhtml` exists and passes
- Must: Storage XHTML contains NO `<hr/>` elements from front-matter fences
- Must: Storage XHTML contains NO YAML content as headings or paragraphs
- Must: Fixture count assertion updated to 27
- Must: All 27 golden tests pass (26 existing + 1 new)

**Affected code areas**:

- `tests/golden/fixtures/markdown/frontmatter.md` (new: source fixture)
- `tests/golden/fixtures/markdown/frontmatter.storage.xhtml` (new: expected output)
- `tests/golden/markdown/storage-renderer.test.ts` (updated: fixture count 26 → 27, message update)

**System docs to update**:

- None (no system doc changes for golden fixture addition)

**Tests**:

- Run `bun test tests/golden/markdown/storage-renderer.test.ts` to verify fixture passes
- Run `bun test --update-snapshots` to regenerate snapshots if needed (reviewed action)
- Run `bun run test` to ensure full test suite passes

**Completion signal**: `test(GH-63): add TC-FM-001 golden fixture for front-matter stripping`

---

### Phase 5: readUuid Regression Guard (TC-FM-003)

**Goal**: Add regression test confirming `readUuid()` behavior is unchanged after the fix.

**Tasks**:

- [ ] **5.1** Create `tests/unit/domain/identity/frontmatter.test.ts` with test block for TC-FM-003:
  - Test that `readUuid()` returns UUID from front-matter source
  - Test that `readUuid()` returns `undefined` for source without front-matter
  - Test that `readUuid()` returns `undefined` for malformed front-matter
- [ ] **5.2** Import `readUuid` from `#domain/identity/frontmatter` and `describe`, `expect`, `test` from `bun:test`
- [ ] **5.3** Follow code style rules: minimal comments, self-documenting, no spec restatements

**Acceptance Criteria**:

- Must: Unit test `TC-FM-003` passes with all three assertions
- Must: `readUuid(src)` returns correct UUID for front-matter source
- Must: `readUuid()` returns `undefined` for sources without valid front-matter
- Should: Test file follows existing test file conventions

**Affected code areas**:

- `tests/unit/domain/identity/frontmatter.test.ts` (new: regression test file)

**System docs to update**:

- None (no system doc changes for regression test addition)

**Tests**:

- Run `bun test tests/unit/domain/identity/frontmatter.test.ts` to verify TC-FM-003 passes
- Run `bun run test` to ensure full test suite passes

**Completion signal**: `test(GH-63): add TC-FM-003 regression test for readUuid continuity`

---

### Phase 6: Verify All Tests

**Goal**: Run full test suite, typecheck, and lint to ensure all changes integrate correctly.

**Tasks**:

- [ ] **6.1** Run `bun run lint` and verify no lint errors
- [ ] **6.2** Run `bun run format:check` and verify code is formatted
- [ ] **6.3** Run `bun run typecheck` and verify no type errors
- [ ] **6.4** Run `bun run test` and verify all tests pass (unit + integration + golden)
- [ ] **6.5** Run `bun run check:boundaries` and verify no tier violations
- [ ] **6.6** Run `bun run check` (full quality gate) and verify all gates pass
- [ ] **6.7** If any golden snapshots require explicit update, run `bun test --update-snapshots` and review changes

**Acceptance Criteria**:

- Must: All lint checks pass with no errors
- Must: All formatting checks pass with no changes needed
- Must: Typecheck passes with no errors
- Must: All unit, integration, and golden tests pass
- Must: No tier violations (dependency-cruiser)
- Must: Full `bun run check` quality gate passes
- Should: No unexpected golden snapshot drift (reviewed if updates needed)

**Affected code areas**:

- None (verification phase only)

**System docs to update**:

- None (no system doc changes for verification)

**Tests**:

- Run `bun run check` (full quality gate: lint + format:check + typecheck + test + check:boundaries)

**Completion signal**: `fix(GH-63): verify all tests pass quality gates`

---

### Phase 7: Finalize (AC reconciliation)

**Goal**: Finalize the change by reconciling every acceptance criterion against the implemented tests.

**Tasks**:

 - [ ] **7.1** Reconcile spec: verify all AC from `chg-GH-63-spec.md` are met:
   - AC-F1-1: Front-matter source → Storage XHTML with no front-matter leak (TC-FM-001)
   - AC-F1-2: Front-matter source → MDAST tree excludes front-matter block (TC-FM-002)
   - AC-F2-1: `readUuid()` returns same UUID before/after fix (TC-FM-003)
   - AC-F2-2: Full test suite passes; fixture count 27; `hr.md` still renders `<hr/>` (TC-FM-004, TC-FM-005)
 - [ ] **7.2** Verify all commits follow Conventional Commits format (`type(scope): description`)
 - [ ] **7.3** Verify branch is `fix/GH-63/frontmatter-strip`
 - [ ] **7.4** Document any deviations from the plan in the plan revision log (see below)

**Acceptance Criteria**:

 - Must: All acceptance criteria from spec are met
 - Must: All commits follow Conventional Commits format
 - Must: Plan revision log documents any deviations
 - Should: No unexpected changes outside scope

**Affected code areas**:

 - None (finalization phase only)

**System docs to update**:

 - None (no system doc changes for finalization)

**Tests**:

 - Run `bun run check` to ensure final state passes all quality gates

**Completion signal**: `fix(GH-63): finalize front-matter stripping fix`

---

## Test Scenarios

| ID | Scenario | Phases | AC Coverage |
|----|----------|--------|-------------|
| TC-FM-001 | Front-matter stripped from Storage XHTML | Phase 4 | AC-F1-1 |
| TC-FM-002 | MDAST tree excludes front-matter nodes | Phase 3 | AC-F1-2, DM-1 |
| TC-FM-003 | readUuid() returns UUID unchanged | Phase 5 | AC-F2-1 |
| TC-FM-004 | hr.md mid-document break preserved | Phase 2 | AC-F2-2 |
| TC-FM-005 | Golden fixture count updated to 27 | Phase 4 | AC-F2-2 |

---

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-63-spec.md | Spec |
| Test plan | ./chg-GH-63-test-plan.md | Test plan |
| Implementation plan | ./chg-GH-63-plan.md | Plan (this file) |
| Markdown parser (modified) | src/domain/markdown/parse.ts | Code |
| Parse unit tests (modified) | tests/unit/domain/markdown/parse.test.ts | Test code |
| Identity regression tests (new) | tests/unit/domain/identity/frontmatter.test.ts | Test code |
| Golden fixture (new) | tests/golden/fixtures/markdown/frontmatter.md | Test fixture |
| Golden fixture (new) | tests/golden/fixtures/markdown/frontmatter.storage.xhtml | Test fixture |
| Golden test harness (modified) | tests/golden/markdown/storage-renderer.test.ts | Test code |
| Package manifest (modified) | package.json | Code |
| Lock file (modified) | bun.lock | Code |

---

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Implementation Plan Writer (via agent) | Initial plan for GH-63 front-matter stripping bug fix. Includes critical edge case verification for hr.md fixture (TC-FM-004) with empirical test decision step in Phase 2. |
| 1.1 | 2026-07-13 | PM (via agent) | Removed version bump from Phase 7 — recent P0 fixes (GH-66, GH-62, GH-25, GH-26) did not bump package.json version; version bumps are milestone/minor-scoped in this repo, not per-bug-fix. Phase 7 is now AC reconciliation only. |

---

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1: Dependency Installation | Pending | TBD | TBD | TBD | |
| Phase 2: Wire remark-frontmatter Plugin | Pending | TBD | TBD | TBD | |
| Phase 3: Unit Test (TC-FM-002) | Pending | TBD | TBD | TBD | |
| Phase 4: Golden Fixture (TC-FM-001, TC-FM-005) | Pending | TBD | TBD | TBD | |
| Phase 5: readUuid Regression Guard (TC-FM-003) | Pending | TBD | TBD | TBD | |
| Phase 6: Verify All Tests | Pending | TBD | TBD | TBD | |
| Phase 7: Finalize and Release | Pending | TBD | TBD | TBD | |