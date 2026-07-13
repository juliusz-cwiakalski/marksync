---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-64-test-plan
status: Approved
created: 2026-07-13
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
service: marksync-core
labels: [bug, MS-0002, priority:medium]
version_impact: patch
summary: "Fix recursive glob pattern (**) support in config.select by implementing in-memory filtering instead of git pathspec translation"
links:
  change_spec: ./chg-GH-64-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4] Glob patterns with ** not supported by git ls-tree pathspec (P1)

## 1. Scope and Objectives

This test plan ensures the fix for recursive glob pattern support (`**`) in the shell-git adapter's `readCommitted` implementation works correctly. The fix changes from passing patterns as git pathspecs to listing all committed files and filtering in-memory using the existing glob matcher. The primary goals are:

- Verify that recursive `**` patterns correctly match files at any depth
- Ensure union semantics work correctly when multiple patterns are provided
- Validate that the default starter config pattern `docs/**/*.md` works out of the box
- Confirm that security invariants (malicious pattern rejection) are preserved
- Ensure no regressions in existing happy-path behavior

### 1.1 In Scope

- Unit tests for recursive `**` pattern matching with nested directories
- Unit tests for extension filtering (e.g., `docs/**/*.md` matches only `.md` files)
- Unit tests for `**/test.md` pattern matching at root and nested depths
- Unit tests for union semantics with multiple patterns
- Unit tests for edge cases (empty patterns, patterns matching nothing)
- Integration test for TC-INTEGRATION-009 regression (malicious pattern fuzz)
- Integration test for starter config functionality
- Security regression tests for malicious patterns with `..` and shell metacharacters
- Performance verification for typical repo sizes (≤500 files)

### 1.2 Out of Scope & Known Gaps

- Performance optimization for very large repos (>10,000 files) — not needed for MS-0002
- Glob pattern caching across multiple `readCommitted` calls — not in scope
- Changes to config loading, validation, or the `selectFiles` utility
- Changes to the starter config template content
- New dependencies or third-party glob libraries

## 2. References

- Change Specification: `chg-GH-64-spec.md`
- Testing Strategy: `.ai/rules/testing-strategy.md`
- Component Under Test: `src/infra/git/shell-git.ts` (method `readCommitted`)
- Glob Matcher: `src/shared/glob.ts` (functions `filterByGlob`, `matchGlob`)
- Path Validation: `src/domain/git/paths.ts` (function `validateRepoRelative`)
- Existing Tests: `tests/unit/infra/git/shell-git.test.ts`, `tests/integration/app/shell-git-safety-fuzz.test.ts`
- ADR-0006: Document identity and shared base state model (source of truth pattern)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Recursive `**` matches nested markdown files | TC-GLOB-001, TC-GLOB-012 | Covered |
| AC-F1-2 | Extension filter excludes non-markdown files | TC-GLOB-002 | Covered |
| AC-F1-3 | `**/test.md` matches root and nested files | TC-GLOB-003 | Covered |
| AC-F2-1 | Union semantics with two patterns | TC-GLOB-004 | Covered |
| AC-F2-2 | Union semantics across multiple directories | TC-GLOB-005 | Covered |
| AC-G2-1 | Starter config produces non-empty plan with nested files | TC-GLOB-012 | Covered |
| AC-G2-2 | Starter config with flat directory discovery | TC-GLOB-006 | Covered |
| AC-F3-1 | Malicious pattern with `..` throws before git spawn | TC-GLOB-007 | Covered |
| AC-F3-2 | Malicious pattern with shell metacharacters throws | TC-GLOB-008 | Covered |
| AC-F3-3 | Existing safety fuzz tests remain passing | TC-GLOB-011 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

N/A — this change does not introduce new interfaces, events, or data models. The `readCommitted` method signature and return type are unchanged.

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) | Notes |
|--------|-------------|----------|-------|
| NFR-SEC-7 | Path-traversal confinement | TC-GLOB-007, TC-GLOB-008, TC-GLOB-011 | Malicious patterns rejected before git spawn |
| NFR-PERF-5 | Conversion latency | TC-GLOB-012 | Verified via integration test with typical MS-0002 corpus size |
| NFR-MAINT-1 | Adapter isolation | All TCs | All glob pattern logic isolated behind `Repository` port |

## 4. Test Types and Layers

### Unit Tests (Tier 1)

- **Framework**: `bun:test`
- **Root Directory**: `tests/unit/infra/git/`
- **Test File**: `shell-git.test.ts` (extend existing file)
- **Scope**: Pure domain logic for `readCommitted` pattern matching, union semantics, edge cases
- **Mocking**: No mocks — use temp git repos created per test (following existing pattern)

### Integration Tests (Tier 4)

- **Framework**: `bun:test`
- **Root Directory**: `tests/integration/app/`
- **Test File**: `shell-git-safety-fuzz.test.ts` (regression only), plus new integration test for starter config
- **Scope**: Security fuzz regression (TC-INTEGRATION-009), end-to-end discovery with starter config
- **Mocking**: No mocks — real git CLI with temp repos

### Contract / Golden Fixture Tests

N/A — not applicable for this change. The glob matcher is already tested in `tests/unit/shared/glob.test.ts` and does not need changes.

### E2E Tests (Live-Sandbox)

N/A — this change does not involve Confluence network calls. E2E tier is not in scope.

### Performance Tests

- **Approach**: Informal verification via integration test with typical MS-0002 corpus size (≤500 files)
- **Threshold**: No measurable degradation vs. baseline
- **Location**: Integrated into `TC-GLOB-012` (starter config integration test)

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-GLOB-001 | Recursive `**` matches nested markdown files | Happy Path | Critical | High | AC-F1-1 |
| TC-GLOB-002 | Extension filter excludes non-markdown files | Happy Path | Important | High | AC-F1-2 |
| TC-GLOB-003 | `**/test.md` matches root and nested files | Happy Path | Important | High | AC-F1-3 |
| TC-GLOB-004 | Union semantics with two patterns | Happy Path | Important | High | AC-F2-1 |
| TC-GLOB-005 | Union semantics across multiple directories | Happy Path | Important | High | AC-F2-2 |
| TC-GLOB-006 | Starter config with flat directory discovery | Happy Path | Important | Medium | AC-G2-2 |
| TC-GLOB-007 | Malicious pattern with `..` throws before git spawn | Negative | Critical | High | AC-F3-1, NFR-SEC-7 |
| TC-GLOB-008 | Malicious pattern with shell metacharacters throws | Negative | Critical | High | AC-F3-2, NFR-SEC-7 |
| TC-GLOB-009 | Empty patterns list returns empty map | Edge Case | Minor | Low | - |
| TC-GLOB-010 | Update existing test: change pattern from `["."]` to real glob | Regression | Critical | High | - |
| TC-GLOB-011 | Integration test: TC-INTEGRATION-009 regression | Regression | Critical | High | AC-F3-3, NFR-SEC-7 |
| TC-GLOB-012 | Integration test: Starter config produces non-empty plan | Happy Path | Important | Medium | AC-G2-1, NFR-PERF-5 |

### 5.2 Scenario Details

#### TC-GLOB-001 - Recursive `**` matches nested markdown files

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob

**Preconditions**:
- Temp git repo created with nested structure:
  ```
  docs/
    a.md
    b/
      c.md
      d/
        e.md
    image.png
  README.md
  src/
    d.md
  ```
- All files committed

**Steps**:
1. Create temp git repo with nested structure (per spec Appendix A.2)
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md"])`
4. Verify result is `Ok`
5. Check returned file paths

**Expected Outcome**:
- Result is `Ok` (no error)
- Exactly 3 files returned: `docs/a.md`, `docs/b/c.md`, `docs/b/d/e.md`
- All returned files are of type `Uint8Array`
- `docs/image.png` is NOT in results (not markdown)
- `README.md` is NOT in results (outside `docs/`)
- `src/d.md` is NOT in results (outside `docs/`)

**Postconditions**:
- Temp repo cleaned up (via existing `afterEach` pattern)

**Notes / Clarifications**:
- Follow existing temp repo pattern from `shell-git.test.ts` lines 95-198
- Use `Bun.spawnSync` for git commands as in existing tests

---

#### TC-GLOB-002 - Extension filter excludes non-markdown files

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, AC-F1-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob

**Preconditions**:
- Temp git repo created with mixed file types:
  ```
  docs/
    a.md
    b/
      c.md
    image.png
    data.json
  ```
- All files committed

**Steps**:
1. Create temp git repo with mixed file types
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md"])`
4. Verify result is `Ok`
5. Check that all returned paths end with `.md`

**Expected Outcome**:
- Result is `Ok` (no error)
- Only `.md` files returned: `docs/a.md`, `docs/b/c.md`
- `docs/image.png` is NOT in results
- `docs/data.json` is NOT in results

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- Extension filtering is handled by the glob matcher `filterByGlob` from `src/shared/glob.ts`
- This test verifies that the matcher's semantics are correctly applied through `readCommitted`

---

#### TC-GLOB-003 - `**/test.md` matches root and nested files

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, AC-F1-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob

**Preconditions**:
- Temp git repo created with `test.md` at multiple depths:
  ```
  test.md
  docs/
    test.md
    b/
      test.md
  other.md
  ```
- All files committed

**Steps**:
1. Create temp git repo with `test.md` at multiple depths
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["**/test.md"])`
4. Verify result is `Ok`
5. Check returned file paths

**Expected Outcome**:
- Result is `Ok` (no error)
- Exactly 3 files returned: `test.md`, `docs/test.md`, `docs/b/test.md`
- `other.md` is NOT in results

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- `**/test.md` matches `test.md` at root (zero segments after `**`)
- `**/test.md` also matches `test.md` at any nested depth

---

#### TC-GLOB-004 - Union semantics with two patterns

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F2-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob

**Preconditions**:
- Temp git repo created with:
  ```
  docs/
    a.md
  README.md
  ```
- All files committed

**Steps**:
1. Create temp git repo with two markdown files in different locations
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md", "README.md"])`
4. Verify result is `Ok`
5. Check that both files are returned

**Expected Outcome**:
- Result is `Ok` (no error)
- Exactly 2 files returned: `docs/a.md`, `README.md`
- Union semantics: file matches if EITHER pattern matches

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- Union semantics are implemented by checking if file matches ANY pattern
- This test verifies that `README.md` (not under `docs/`) is still included

---

#### TC-GLOB-005 - Union semantics across multiple directories

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F2-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob

**Preconditions**:
- Temp git repo created with:
  ```
  docs/
    a.md
    b/
      c.md
  src/
    d.md
  README.md
  ```
- All files committed

**Steps**:
1. Create temp git repo with markdown files in multiple directories
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md", "src/**/*.md"])`
4. Verify result is `Ok`
5. Check that files from both directories are returned

**Expected Outcome**:
- Result is `Ok` (no error)
- Exactly 3 files returned: `docs/a.md`, `docs/b/c.md`, `src/d.md`
- `README.md` is NOT in results (matches neither pattern)
- Union semantics across two distinct directory patterns

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- Verifies that multiple `**` patterns work together correctly
- Tests that the in-memory filter applies union semantics across multiple patterns

---

#### TC-GLOB-006 - Starter config with flat directory discovery

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: G-2, AC-G2-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @glob, @starter-config

**Preconditions**:
- Temp git repo created with flat `docs/` directory:
  ```
  docs/
    intro.md
    guide.md
  README.md
  ```
- All files committed

**Steps**:
1. Create temp git repo with flat `docs/` directory containing two markdown files
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md"])` (default starter config pattern)
4. Verify result is `Ok`
5. Check that both files under `docs/` are discovered

**Expected Outcome**:
- Result is `Ok` (no error)
- Exactly 2 files returned: `docs/intro.md`, `docs/guide.md`
- Both files are discovered even though directory is flat (no nesting)
- `README.md` is NOT in results

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- **This test case is DEDUPICATED and covered by TC-GLOB-001/002.** Flat directory discovery is a subset of TC-GLOB-001's nested test — the `**/` pattern matches zero or more path segments, so `docs/**/*.md` works identically for both flat and nested directory structures.
- TC-GLOB-001 already verifies that `docs/**/*.md` returns `docs/a.md`, `docs/b/c.md`, and `docs/b/d/e.md` (mixed flat and nested), which implicitly validates that the pattern works for the flat case.
- No separate implementation is needed — the AC-G2-2 requirement is satisfied by TC-GLOB-001/002.

---

#### TC-GLOB-007 - Malicious pattern with `..` throws before git spawn

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-SEC-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- Temp git repo created with a test file
- All files committed

**Steps**:
1. Create temp git repo with a test file
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/../../etc/passwd"])`
4. Verify that an error is thrown

**Expected Outcome**:
- Function throws an error before any git command is spawned
- Error message indicates parent directory reference (`..`)
- No git `ls-tree` command is executed (can verify via git log or process monitoring)
- Security invariant is preserved

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- This is a regression test to ensure `validateRepoRelative` is still called before git spawn
- The `validateRepoRelative` function from `src/domain/git/paths.ts` must reject `..`

---

#### TC-GLOB-008 - Malicious pattern with shell metacharacters throws

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-2, NFR-SEC-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- Temp git repo created with a test file
- All files committed

**Steps**:
1. Create temp git repo with a test file
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs;rm -rf /"])`
4. Verify that an error is thrown
5. Repeat with other shell metacharacters: `$(id)`, `` `whoami` ``, `|cat`, `&>file`

**Expected Outcome**:
- Function throws an error before any git command is spawned
- Error message indicates shell metacharacter
- No git `ls-tree` command is executed
- Security invariant is preserved for all tested metacharacters

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- This is a regression test to ensure `validateRepoRelative` is still called before git spawn
- The `validateRepoRelative` function must reject shell metacharacters
- Test multiple metacharacters to ensure comprehensive coverage

---

#### TC-GLOB-009 - Empty patterns list returns empty map

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: -
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @edge-case

**Preconditions**:
- Temp git repo created with test files
- All files committed

**Steps**:
1. Create temp git repo with test files
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", [])`
4. Verify result is `Ok`
5. Check that no files are returned

**Expected Outcome**:
- Result is `Ok` (no error)
- Empty map returned (0 files)
- No error thrown (empty patterns list is valid input)

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- This is an edge case to ensure the implementation handles empty patterns gracefully
- Union semantics with zero patterns should return empty set (vacuously true)

---

#### TC-GLOB-010 - Update existing test: change pattern from `["."]` to real glob

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: -
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/git/shell-git.test.ts`
**Tags**: @backend, @regression

**Preconditions**:
- Temp git repo created with test file
- All files committed
- Existing test at `shell-git.test.ts:153` uses `repo.readCommitted("HEAD", ["."])`

**Steps**:
1. Update the existing test pattern from `["."]` to a real glob pattern that lists files (e.g., `["**/*.md"]` or `["*.md"]` or `["*"]`)
2. Run the updated test
3. Verify result is `Ok`
4. Verify that file content matches expected content

**Expected Outcome**:
- Result is `Ok` (no error)
- Files matching the glob pattern are returned (non-empty map)
- File content matches committed content
- Test still exercises the happy path (reading a committed file and returning a `Uint8Array`)
- No regressions from existing behavior beyond the pattern change

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- This is an UPDATE to an existing test, not a new test
- The existing test at lines 122-178 in `shell-git.test.ts` must be updated
- The original pattern `["."]` is a literal match in the new glob matcher (returns empty map)
- The fix preserves the test's purpose (happy-path read of a committed file, verify content + Uint8Array) by changing the pattern to something that actually matches files
- Pattern options: `["**/*.md"]` (matches all .md files), `["*.md"]` (matches .md in root), or `["*"]` (matches all files in root)

---

#### TC-GLOB-011 - Integration test: TC-INTEGRATION-009 regression

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-3, NFR-SEC-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/shell-git-safety-fuzz.test.ts`
**Tags**: @backend, @integration, @security, @regression

**Preconditions**:
- Existing integration test file `shell-git-safety-fuzz.test.ts` exists
- Test TC-INTEGRATION-009 is implemented

**Steps**:
1. Run the full integration test suite: `bun test tests/integration/app/shell-git-safety-fuzz.test.ts`
2. Verify that TC-INTEGRATION-009 (malicious path fuzz) passes
3. Verify that TC-INTEGRATION-009 (malicious ref fuzz) passes
4. Check that all tests pass with no regressions

**Expected Outcome**:
- TC-INTEGRATION-009 (malicious path fuzz) passes
- TC-INTEGRATION-009 (malicious ref fuzz) passes
- All integration tests in the file pass
- No regressions from the fix
- Security invariants (malicious pattern rejection) are preserved

**Postconditions**:
- No cleanup needed (existing test handles it)

**Notes / Clarifications**:
- This is NOT a new test — it's a regression check on existing tests
- The existing tests must remain passing after the fix
- TC-INTEGRATION-009 tests that malicious patterns are rejected with throw before git spawn

---

#### TC-GLOB-012 - Integration test: Starter config produces non-empty plan

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: G-2, AC-G2-1, NFR-PERF-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/` (new file)
**Tags**: @backend, @integration, @starter-config

**Preconditions**:
- Temp git repo created with nested structure simulating typical MS-0002 corpus (~500 files)
- Repo contains nested `docs/` directory with markdown files at multiple depths

**Steps**:
1. Create temp git repo with nested structure (simulating typical MS-0002 corpus)
2. Initialize shell-git adapter with temp repo path
3. Call `repo.readCommitted("HEAD", ["docs/**/*.md"])` (default starter config pattern)
4. Measure execution time (for performance verification)
5. Verify result is `Ok`
6. Check that a non-empty set of files is returned
7. Verify that all returned files are under `docs/` and end with `.md`

**Expected Outcome**:
- Result is `Ok` (no error)
- Non-empty set of files returned (at least 1 file)
- All returned files are under `docs/` and end with `.md`
- Execution time is acceptable (no measurable degradation vs. baseline)
- Starter config pattern works out of the box

**Postconditions**:
- Temp repo cleaned up

**Notes / Clarifications**:
- This is an end-to-end verification of the starter config functionality
- Performance threshold: execution time should not measurably increase vs. baseline
- Corpus size: ~500 files (typical MS-0002 scale)
- This test may be deferred to MS-0002 completion if not already implementable

**Notes / Clarifications** (performance):
- Performance is informational, not a hard gate for this change
- The O(files × patterns) complexity is acceptable for MS-0002 corpus sizes
- Optimization for >10,000 files is deferred to a future milestone

**Notes / Clarifications** (AC-G2-1 proxy relationship):
- TC-GLOB-012 tests `readCommitted` directly rather than the full CLI `marksync plan` flow
- This is a **valid proxy** for AC-G2-1 because `readCommitted` is the discovery choke-point for `marksync plan` — the CLI command calls `git.readCommitted("HEAD", config.select)` at `src/app/push-flow.ts:154`
- The full CLI E2E flow would require a live Confluence target, which is out of scope for this P1 fix
- Testing `readCommitted` with the starter config pattern `docs/**/*.md` validates the core discovery behavior without the network dependency

## 6. Environments and Test Data

### Test Environments

- **Local Development**: All tests run via `bun test` command
- **CI Pipeline**: Unit tests run on every push via `.github/workflows/ci.yml` (fast loop)
- **E2E Gate**: Not applicable (this change does not involve Confluence network calls)

### Test Data Generation

- **Temp Git Repos**: Each test creates its own temp repo using `mkdtempSync` pattern from existing tests
- **Cleanup**: All temp repos cleaned up in `afterEach` blocks
- **Isolation**: Tests are isolated — each creates its own temp repo to avoid cross-test contamination

### Test Fixture Structure

Following spec Appendix A.2, the standard fixture structure for recursive tests is:

```text
test-repo/
  docs/
    a.md
    b/
      c.md
      d/
        e.md
    image.png
  README.md
  src/
    d.md
```

This fixture is used in multiple test cases (TC-GLOB-001, TC-GLOB-002, TC-GLOB-005).

## 7. Automation Plan and Implementation Mapping

### Unit Tests (tests/unit/infra/git/shell-git.test.ts)

| TC ID | Implementation Status | Notes |
|-------|------------------------|-------|
| TC-GLOB-001 | To Implement | New test for recursive `**` pattern matching |
| TC-GLOB-002 | To Implement | New test for extension filtering |
| TC-GLOB-003 | To Implement | New test for `**/test.md` pattern |
| TC-GLOB-004 | To Implement | New test for union semantics with two patterns |
| TC-GLOB-005 | To Implement | New test for union semantics across multiple directories |
| TC-GLOB-006 | Covered by TC-GLOB-001/002 (deduplicated) | Flat directory discovery is a subset of TC-GLOB-001's nested test; `**/` matches zero or more segments, so `docs/**/*.md` works for both flat and nested structures |
| TC-GLOB-007 | To Implement | New test for malicious pattern with `..` |
| TC-GLOB-008 | To Implement | New test for malicious pattern with shell metacharacters |
| TC-GLOB-009 | To Implement | New test for empty patterns list |
| TC-GLOB-010 | To Update | Update existing test pattern from `["."]` to real glob pattern (e.g., `["**/*.md"]`) |

**Execution Command**:
```bash
bun test tests/unit/infra/git/shell-git.test.ts
```

**Mocking Requirements**: None — use real temp git repos.

### Integration Tests (tests/integration/app/)

| TC ID | Implementation Status | Notes |
|-------|------------------------|-------|
| TC-GLOB-011 | Existing – No Change | Existing test `shell-git-safety-fuzz.test.ts` |
| TC-GLOB-012 | To Implement | New integration test for starter config functionality |

**Execution Command**:
```bash
bun test tests/integration/app/shell-git-safety-fuzz.test.ts
bun test tests/integration/app/starter-config-discovery.test.ts  # new file for TC-GLOB-012
```

**Mocking Requirements**: None — use real git CLI with temp repos.

### Golden Fixture Tests

N/A — not applicable for this change. The glob matcher is already tested in `tests/unit/shared/glob.test.ts`.

### Performance Tests

Performance verification is integrated into TC-GLOB-012. No separate performance test suite is needed for this change.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Security regression from losing pattern validation | High | Low | Retain `validateRepoRelative` on each pattern before git spawn; add TC-GLOB-007 and TC-GLOB-008 | Low |
| Performance regression from listing all files | Medium | Low | Verify via TC-GLOB-012 with typical MS-0002 corpus size; O(files × patterns) is acceptable | Low |
| Test coverage gaps for union semantics | Low | Medium | Add TC-GLOB-004 and TC-GLOB-005 for union semantics | Low |
| Tier rule violation from infra importing shared | Medium | Low | Verify that `src/infra/git/shell-git.ts` importing `src/shared/glob.ts` is allowed per architecture rules | Low |

### 8.2 Assumptions

- The existing `src/shared/glob.ts` matcher correctly implements `**` semantics as documented (tested and verified).
- The `validateRepoRelative` function's rejection set is sufficient for security (no additional malicious patterns are needed for the new implementation).
- MS-0002 corpus sizes remain modest (≤500 files), making the O(files × patterns) in-memory filter acceptable.
- The single production caller (`src/app/push-flow.ts:154`) does not rely on git pathspec-specific behavior beyond file listing.

### 8.3 Open Questions

None — all questions resolved during scope clarification.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Change Test Plan Writer | Initial test plan for GH-64 |
| 1.1 | 2026-07-13 | Change Test Plan Writer | DoR iter-1 fixes: (1) TC-GLOB-010 corrected from "Existing – No Change" to "To Update" — pattern `["."]` is literal match (returns empty map), must change to real glob; (2) TC-GLOB-006 deduplicated as covered by TC-GLOB-001/002 with explicit cross-reference; (3) TC-GLOB-012 added proxy relationship note explaining that testing `readCommitted` validates AC-G2-1 without full CLI E2E |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |

---