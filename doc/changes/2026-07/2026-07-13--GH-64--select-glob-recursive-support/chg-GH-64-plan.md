---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-64-select-glob-recursive-support
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-core
labels: [bug, MS-0002, priority:medium]
links:
  change_spec: ./chg-GH-64-spec.md
summary: >
  Fix the shell-git adapter's `readCommitted` implementation to support recursive glob patterns using `**`. The current implementation passes glob patterns directly to `git ls-tree` as pathspecs, but git pathspec does not support recursive `**` (only single-segment `*`). This causes the default starter config pattern `docs/**/*.md` to match zero files, breaking `marksync init` out of the box. The fix lists all committed files without pathspec filtering and applies in-memory glob matching using the existing `src/shared/glob.ts` matcher, which correctly implements `**` semantics.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-64: [MS2-E4] Glob patterns with ** not supported by git ls-tree pathspec (P1)

## Context and Goals

This plan fixes the shell-git adapter's `readCommitted` implementation to support recursive glob patterns using `**`. The current implementation passes glob patterns directly to `git ls-tree` as pathspecs, but git pathspec does not support recursive `**` (only single-segment `*`). This causes the default starter config pattern `docs/**/*.md` to match zero files, breaking `marksync init` out of the box.

The fix lists all committed files without pathspec filtering and applies in-memory glob matching using the existing `src/shared/glob.ts` matcher, which correctly implements `**` semantics.

All requirements are derived from the change specification ([chg-GH-64-spec.md](./chg-GH-64-spec.md)). The test plan ([chg-GH-64-test-plan.md](./chg-GH-64-test-plan.md)) provides test scenarios (TC-GLOB-001 through TC-GLOB-012) mapped to acceptance criteria.

## Scope

### In Scope

- Fix `readCommitted` in `src/infra/git/shell-git.ts` to stop passing glob patterns as git pathspecs (F-1, F-2)
- List all committed files via `git ls-tree -r --name-only ref` (no pathspec argument) (F-1)
- Filter the file list in-memory using `filterByGlob` from `src/shared/glob.ts` (F-1, F-2)
- Support union semantics for multiple patterns (file included if ANY pattern matches) (F-2)
- Retain `validateRepoRelative` pattern validation before git spawn (F-3)
- Retain per-filename validation when reading individual files via `git show` (F-3)
- Add unit tests TC-GLOB-001 through TC-GLOB-009 in `tests/unit/infra/git/shell-git.test.ts`
- Add integration test TC-GLOB-012 in `tests/integration/app/starter-config-discovery.test.ts`
- Verify existing safety fuzz tests (TC-INTEGRATION-009) remain passing (F-3)

### Out of Scope

- Changes to the `Repository` port contract — signature and semantics unchanged (NG-1)
- Changes to config loading, schema, or validation (NG-2)
- Changes to the `selectFiles` utility in `src/app/config.ts` (NG-2)
- Changes to the starter config template content (NG-4)
- New dependencies or third-party glob libraries (NG-3)
- Git pathspec translation or normalization (NG-5)
- Performance optimization for very large repos (>10,000 files) — deferred (Spec §7.3)
- Glob pattern caching across multiple `readCommitted` calls — deferred (Spec §7.3)

### Constraints

- **Tier rule compliance**: `src/infra/git/shell-git.ts` must import `src/shared/glob.ts` (infra → shared is allowed per architecture rules)
- **Security invariant**: `validateRepoRelative` must remain called before any git spawn (NFR-SEC-7)
- **Backward compatibility**: Existing patterns that work today (e.g., directory prefixes like `docs/`) must continue to work
- **No breaking changes**: The `readCommitted` method signature and return type are unchanged
- **Test-driven development**: New unit tests must be written before or alongside implementation changes

### Risks

| ID | Risk | Impact | Probability | Mitigation Strategy |
|----|------|--------|-------------|---------------------|
| RSK-1 | Security regression from losing pattern validation | High | Low | Retain `validateRepoRelative` on each pattern before git spawn; add TC-GLOB-007 and TC-GLOB-008 |
| RSK-2 | Performance regression from listing all files | Medium | Low | Verify via TC-GLOB-012 with typical MS-0002 corpus size; O(files × patterns) is acceptable |
| RSK-3 | Tier rule violation from infra importing shared | Medium | Low | Verify that `src/infra/git/shell-git.ts` importing `src/shared/glob.ts` is allowed per architecture rules (shared tier imports nothing, may be imported by any tier) |
| RSK-4 | Test coverage gaps for union semantics | Low | Medium | Add TC-GLOB-004 and TC-GLOB-005 for union semantics |

### Success Metrics

- Pattern match accuracy: 100% of standard glob patterns (`**`, `*`, `?`) work as expected
- Starter config functionality: `marksync init` produces a working config that discovers files without manual edits
- Safety test pass rate: 100% of existing safety fuzz tests (TC-INTEGRATION-009) remain passing
- Performance impact: No measurable degradation in `readCommitted` latency for typical repo sizes (≤500 files)

## Phases

### Phase 1: Core Implementation — Update readCommitted to filter in-memory

**Goal**: Modify `readCommitted` in `src/infra/git/shell-git.ts` to list all files and filter in-memory using `filterByGlob`, enabling `**` support.

**Tasks**:

- [x] **1.1** Read current implementation of `readCommitted` in `src/infra/git/shell-git.ts` (lines ~14-58)
- [x] **1.2** Add import for `filterByGlob` from `src/shared/glob.ts` at top of file (verify path alias `#shared/glob` is correct) — imported `globToRegExp` from `#shared/glob`
- [x] **1.3** Modify `readCommitted` method: change `git ls-tree` command from `["ls-tree", "-r", "--name-only", ref, "--", ...patterns]` to `["ls-tree", "-r", "--name-only", ref]` (remove `--` and patterns)
- [x] **1.4** After listing all files (after line where `ls-tree` output is parsed), add in-memory filtering logic:
  - Compile patterns using `globToRegExp` from `src/shared/glob.ts` (or use `filterByGlob` directly)
  - For each file in the list, test if it matches ANY pattern (union semantics)
  - Collect matching files into a new array or Set
- [x] **1.5** Add edge case handling: if `patterns` array is empty, return empty map immediately (union semantics with zero patterns = empty set) — DEC-4 early return added
- [x] **1.6** Retain existing `validateRepoRelative(pattern)` loop before git spawn (lines 17-19) — security invariant
- [x] **1.7** Retain existing `validateRepoRelative(fileName)` per-file in the read loop (line 41) — security invariant
- [x] **1.8** Ensure the `git show ref:path` read loop continues to work for matched files only
- [x] **1.9** Build project to verify TypeScript compilation: `bun run build` — no `build` script; used `bun run typecheck` (tsc --noEmit) → PASS
- [x] **1.10** Run existing unit tests for shell-git to check for immediate regressions: `bun test tests/unit/infra/git/shell-git.test.ts` — 14 pass / 0 fail. NOTE: the expected `["."]` regression was fixed inline (TC-GLOB-010: `["."]` → `["**/*.md"]`) to keep the commit green; detailed in Phase 4 task 4.3.

**Acceptance Criteria**:

- Must: `readCommitted` no longer passes patterns as git pathspecs (AC-F1-1) — PASSED (ls-tree args have no `--`/patterns)
- Must: `readCommitted` filters files in-memory using glob matcher (AC-F1-1, AC-F1-2, AC-F1-3) — PASSED (globToRegExp + union filter)
- Must: `validateRepoRelative(pattern)` is still called before git spawn (AC-F3-1, AC-F3-2, NFR-SEC-7) — PASSED (loop retained; safety-fuzz test green)
- Must: `validateRepoRelative(fileName)` is still called per-file when reading (AC-F3-1, AC-F3-2, NFR-SEC-7) — PASSED (per-file validation retained)
- Must: Empty patterns array returns empty map (TC-GLOB-009) — PASSED (DEC-4 early return; verified Phase 2)
- Must: Code compiles without errors — PASSED (tsc --noEmit clean)
- Should: Union semantics implemented (file matches if ANY pattern matches) — PASSED (matchers.some(...))

**Affected code areas**:

- `src/infra/git/shell-git.ts` (updated) — `readCommitted` method implementation

**System docs to update**:

- None (code-only phase — Repository port contract unchanged, glob semantics already documented in `src/shared/glob.ts` and `selectFiles`; formal doc reconciliation in Phase 7)

**Tests**:

- Build verification: `bun run build`
- Existing unit test sanity check: `bun test tests/unit/infra/git/shell-git.test.ts`

**Completion signal**: `fix(GH-64): update readCommitted to filter files in-memory using glob matcher`

---

### Phase 2: Unit Test Implementation — Recursive glob pattern tests

**Goal**: Add unit tests TC-GLOB-001, TC-GLOB-002, TC-GLOB-003, TC-GLOB-009 to verify recursive `**` pattern matching, extension filtering, and empty patterns edge case.

**Tasks**:

- [x] **2.1** Read existing test file `tests/unit/infra/git/shell-git.test.ts` to understand temp repo pattern (lines 95-198)
- [x] **2.2** Implement TC-GLOB-001: "Recursive `**` matches nested markdown files" — PASS (3 files: docs/a.md, docs/b/c.md, docs/b/d/e.md)
- [x] **2.3** Implement TC-GLOB-002: "Extension filter excludes non-markdown files" — PASS (only .md files)
- [x] **2.4** Implement TC-GLOB-003: "`**/test.md` matches root and nested files" — PASS (3 files: test.md, docs/test.md, docs/b/test.md)
- [x] **2.5** Implement TC-GLOB-009: "Empty patterns list returns empty map" — PASS (size 0)
- [x] **2.6** Run all unit tests for shell-git to verify new tests pass and existing tests still pass: `bun test tests/unit/infra/git/shell-git.test.ts` — 18 pass / 0 fail

**Acceptance Criteria**:

- Must: TC-GLOB-001 passes (AC-F1-1) — PASSED
- Must: TC-GLOB-002 passes (AC-F1-2) — PASSED
- Must: TC-GLOB-003 passes (AC-F1-3) — PASSED
- Must: TC-GLOB-009 passes (edge case coverage) — PASSED
- Must: All existing unit tests in `shell-git.test.ts` still pass (no regressions) — PASSED (18/18)
- Should: Tests follow existing temp repo pattern (mkdtempSync, afterEach cleanup) — PASSED (dedicated describe block with buildRepo helper)

**Affected code areas**:

- `tests/unit/infra/git/shell-git.test.ts` (updated) — add new test cases

**System docs to update**:

- None

**Tests**:

- Unit test execution: `bun test tests/unit/infra/git/shell-git.test.ts`
- Specific test case verification (if needed): `bun test tests/unit/infra/git/shell-git.test.ts -t "TC-GLOB-001"`

**Completion signal**: `fix(GH-64): add unit tests for recursive glob pattern matching (TC-GLOB-001, TC-GLOB-002, TC-GLOB-003, TC-GLOB-009)`

---

### Phase 3: Unit Test Implementation — Union semantics tests

**Goal**: Add unit tests TC-GLOB-004, TC-GLOB-005 to verify union semantics (file included if ANY pattern matches).

**Tasks**:

- [x] **3.1** Implement TC-GLOB-004: "Union semantics with two patterns" — PASS (README.md, docs/a.md)
- [x] **3.2** Implement TC-GLOB-005: "Union semantics across multiple directories" — PASS (docs/a.md, docs/b/c.md, src/d.md)
- [x] **3.3** Run all unit tests for shell-git to verify new tests pass: `bun test tests/unit/infra/git/shell-git.test.ts` — 20 pass / 0 fail

**Acceptance Criteria**:

- Must: TC-GLOB-004 passes (AC-F2-1) — PASSED
- Must: TC-GLOB-005 passes (AC-F2-2) — PASSED
- Must: All existing unit tests still pass (no regressions) — PASSED (20/20)

**Affected code areas**:

- `tests/unit/infra/git/shell-git.test.ts` (updated) — add new test cases

**System docs to update**:

- None

**Tests**:

- Unit test execution: `bun test tests/unit/infra/git/shell-git.test.ts`

**Completion signal**: `fix(GH-64): add unit tests for union semantics (TC-GLOB-004, TC-GLOB-005)`

---

### Phase 4: Unit Test Implementation — Security regression tests

**Goal**: Add unit tests TC-GLOB-007, TC-GLOB-008, TC-GLOB-010 to verify security invariants are preserved and existing behavior is not broken.

**Tasks**:

- [x] **4.1** Implement TC-GLOB-007: "Malicious pattern with `..` throws before git spawn" — PASS (throws /parent directory reference/)
- [x] **4.2** Implement TC-GLOB-008: "Malicious pattern with shell metacharacters throws" — PASS (throws /shell metacharacter/ for `;`, `$()`, backtick, `|`, `&>`)
- [x] **4.3** Update TC-GLOB-010: "Existing happy path test updated for glob semantics" — DONE in Phase 1 (kept tree green): `["."]` → `["**/*.md"]` at line 153
- [x] **4.4** Verify TC-GLOB-010: "Existing happy path with updated pattern still works" — PASS (reads test.md, returns non-empty map)
- [x] **4.5** Run all unit tests for shell-git: `bun test tests/unit/infra/git/shell-git.test.ts` — 22 pass / 0 fail

**Acceptance Criteria**:

- Must: TC-GLOB-007 passes (AC-F3-1, NFR-SEC-7) — PASSED
- Must: TC-GLOB-008 passes (AC-F3-2, NFR-SEC-7) — PASSED
- Must: TC-GLOB-010 updated test passes (regression coverage) — PASSED
- Must: All existing unit tests still pass (no regressions) — PASSED (22/22)

**Affected code areas**:

- `tests/unit/infra/git/shell-git.test.ts` (updated) — add new test cases

**System docs to update**:

- None

**Tests**:

- Unit test execution: `bun test tests/unit/infra/git/shell-git.test.ts`

**Completion signal**: `fix(GH-64): add unit tests for security regression and update existing happy path test (TC-GLOB-007, TC-GLOB-008, TC-GLOB-010)`

---

### Phase 5: Integration Test Implementation — Starter config functionality

**Goal**: Add integration test TC-GLOB-012 to verify the default starter config pattern works with nested directories and performance is acceptable.

**Tasks**:

- [x] **5.1** Create new test file `tests/integration/app/starter-config-discovery.test.ts`
- [x] **5.2** Implement TC-GLOB-012: "Integration test: Starter config produces non-empty plan" — PASS (500 nested docs/**/*.md files discovered; distractors excluded; elapsed < 2000ms)
- [x] **5.3** Run the new integration test: `bun test tests/integration/app/starter-config-discovery.test.ts` — 1 pass / 0 fail

**Acceptance Criteria**:

- Must: TC-GLOB-012 passes (AC-G2-1, NFR-PERF-5) — PASSED
- Must: Non-empty set of files returned with starter config pattern — PASSED (500 files)
- Must: All returned files are under `docs/` and end with `.md` — PASSED
- Should: Execution time acceptable (no measurable degradation) — PASSED (< 2000ms)

**Affected code areas**:

- `tests/integration/app/starter-config-discovery.test.ts` (new file)

**System docs to update**:

- None

**Tests**:

- Integration test execution: `bun test tests/integration/app/starter-config-discovery.test.ts`

**Completion signal**: `fix(GH-64): add integration test for starter config functionality (TC-GLOB-012)`

---

### Phase 6: Verification — Run full test suite

**Goal**: Run full test suite to ensure all tests pass, including existing safety fuzz tests, and verify no regressions.

**Tasks**:

- [ ] **6.1** Run unit tests for shell-git: `bun test tests/unit/infra/git/shell-git.test.ts`
  - Verify all TC-GLOB-001 through TC-GLOB-010 pass
  - Verify no test failures
- [ ] **6.2** Run integration tests for safety fuzz: `bun test tests/integration/app/shell-git-safety-fuzz.test.ts`
  - Verify TC-INTEGRATION-009 (malicious path fuzz) passes (TC-GLOB-011)
  - Verify TC-INTEGRATION-009 (malicious ref fuzz) passes
  - Verify no regressions in security invariants
- [ ] **6.3** Run integration test for starter config: `bun test tests/integration/app/starter-config-discovery.test.ts`
  - Verify TC-GLOB-012 passes
- [ ] **6.4** Run unit tests for glob matcher (ensure no side effects): `bun test tests/unit/shared/glob.test.ts`
- [ ] **6.5** Run unit tests for select-files utility (ensure no side effects): `bun test tests/unit/app/select-files.test.ts`
- [ ] **6.6** Run full unit test suite: `bun test tests/unit/`
- [ ] **6.7** Run full integration test suite: `bun test tests/integration/`
- [ ] **6.8** Build project to ensure no compilation errors: `bun run build`

**Acceptance Criteria**:

- Must: All unit tests pass (TC-GLOB-001 through TC-GLOB-010)
- Must: All integration tests pass (TC-GLOB-011, TC-GLOB-012)
- Must: TC-INTEGRATION-009 (safety fuzz) passes with no regressions (AC-F3-3, NFR-SEC-7)
- Must: Project builds without errors
- Should: No new warnings introduced

**Affected code areas**:

- All test files (verification only, no code changes)

**System docs to update**:

- None

**Tests**:

- Full unit test suite: `bun test tests/unit/`
- Full integration test suite: `bun test tests/integration/`
- Build verification: `bun run build`

**Completion signal**: `fix(GH-64): verify full test suite passes — all TC-GLOB-* tests and existing safety fuzz tests green`

---

### Phase 7: Finalize and Release

**Goal**: Prepare for release by bumping version, reconciling spec, and ensuring all artifacts are complete.

**Tasks**:

- [ ] **7.1** Update version bump per repo conventions (check if manual update needed or if CI handles this)
- [ ] **7.2** Review change specification [chg-GH-64-spec.md](./chg-GH-64-spec.md) and mark as "Approved" if not already done
- [ ] **7.3** Review test plan [chg-GH-64-test-plan.md](./chg-GH-64-test-plan.md) and mark as "Approved" if not already done
- [ ] **7.4** Update implementation plan status to "Completed" and fill in execution log
- [ ] **7.5** Verify all acceptance criteria from spec are met:
  - AC-F1-1: Recursive `**` matches nested markdown files ✓
  - AC-F1-2: Extension filter excludes non-markdown files ✓
  - AC-F1-3: `**/test.md` matches root and nested files ✓
  - AC-F2-1: Union semantics with two patterns ✓
  - AC-F2-2: Union semantics across multiple directories ✓
  - AC-G2-1: Starter config produces non-empty plan with nested files ✓
  - AC-G2-2: Starter config with flat directory discovery ✓
  - AC-F3-1: Malicious pattern with `..` throws before git spawn ✓
  - AC-F3-2: Malicious pattern with shell metacharacters throws ✓
  - AC-F3-3: Existing safety fuzz tests remain passing ✓
- [ ] **7.6** Verify all success metrics are met:
  - Pattern match accuracy: 100% of standard glob patterns work ✓
  - Starter config functionality: works out of the box ✓
  - Safety test pass rate: 100% ✓
  - Performance impact: no measurable degradation ✓
- [ ] **7.7** Run final full test suite to ensure everything is green: `bun test` (all tests)

**Acceptance Criteria**:

- Must: All acceptance criteria from spec verified as met
- Must: All success metrics verified as met
- Must: Full test suite passes (unit + integration)
- Must: Project builds without errors
- Should: Plan status updated to "Completed"

**Affected code areas**:

- Documentation files only (spec, test plan, implementation plan)
- Version bump file if applicable

**System docs to update**:

- `chg-GH-64-spec.md` — mark as "Approved" if needed
- `chg-GH-64-test-plan.md` — mark as "Approved" if needed
- `chg-GH-64-plan.md` — this file, update status and execution log

**Tests**:

- Full test suite: `bun test`
- Build verification: `bun run build`

**Completion signal**: `fix(GH-64): finalize and release — all acceptance criteria met, full test suite green`

---

## Test Scenarios

| ID | Scenario | Phases | AC Coverage |
|----|----------|--------|-------------|
| TC-GLOB-001 | Recursive `**` matches nested markdown files | 2, 6 | AC-F1-1 |
| TC-GLOB-002 | Extension filter excludes non-markdown files | 2, 6 | AC-F1-2 |
| TC-GLOB-003 | `**/test.md` matches root and nested files | 2, 6 | AC-F1-3 |
| TC-GLOB-004 | Union semantics with two patterns | 3, 6 | AC-F2-1 |
| TC-GLOB-005 | Union semantics across multiple directories | 3, 6 | AC-F2-2 |
| TC-GLOB-006 | Starter config with flat directory discovery | 2, 6 (deduplicated — covered by TC-GLOB-001, TC-GLOB-002) | AC-G2-2 |
| TC-GLOB-007 | Malicious pattern with `..` throws before git spawn | 4, 6 | AC-F3-1, NFR-SEC-7 |
| TC-GLOB-008 | Malicious pattern with shell metacharacters throws | 4, 6 | AC-F3-2, NFR-SEC-7 |
| TC-GLOB-009 | Empty patterns list returns empty map | 2, 6 | Edge case |
| TC-GLOB-010 | Existing happy path with updated pattern still works | 4, 6 | Regression |
| TC-GLOB-011 | Integration test: TC-INTEGRATION-009 regression | 6 | AC-F3-3, NFR-SEC-7 |
| TC-GLOB-012 | Integration test: Starter config produces non-empty plan | 5, 6 | AC-G2-1, NFR-PERF-5 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-64-spec.md | Spec |
| Test plan | ./chg-GH-64-test-plan.md | Test plan |
| Implementation plan | ./chg-GH-64-plan.md | Plan (this file) |
| PM notes | ./chg-GH-64-pm-notes.yaml | Notes |
| Component under test | src/infra/git/shell-git.ts | Source code |
| Glob matcher | src/shared/glob.ts | Source code (no changes) |
| Path validation | src/domain/git/paths.ts | Source code (no changes) |
| Unit tests | tests/unit/infra/git/shell-git.test.ts | Tests (updated) |
| Integration tests (safety) | tests/integration/app/shell-git-safety-fuzz.test.ts | Tests (existing, verify pass) |
| Integration tests (starter config) | tests/integration/app/starter-config-discovery.test.ts | Tests (new) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Plan Writer | Initial implementation plan for GH-64 |
| 1.1 | 2026-07-13 | Plan Writer | Fix DoR findings: (1) added explicit task 4.3 to update existing test pattern from `["."]` to `["**/*.md"]`; (2) updated TC-GLOB-006 mapping to show it's covered by Phase 2 (deduplicated); (3) added rationale for "System docs to update: None" — Repository port contract unchanged, glob semantics already documented, formal reconciliation in Phase 7 |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| (Populated during execution) | | | | | |