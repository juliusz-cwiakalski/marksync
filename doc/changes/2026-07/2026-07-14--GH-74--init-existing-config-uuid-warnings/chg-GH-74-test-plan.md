---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-74-test-plan
status: Proposed
created: 2026-07-14
last_updated: 2026-07-14
owners: ["Juliusz Ćwiąkalski"]
service: marksync-cli
labels: [bug, cli, identity, sync]
version_impact: patch
summary: "Ensure initialization preserves an existing configuration while assigning document identities, and make committed documents without identity visible to sync operators."
links:
  change_spec: ./chg-GH-74-spec.md
  implementation_plan: ./chg-GH-74-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Fix init with existing config and UUID-less file warnings

## 1. Scope and Objectives

This test plan validates two focused bug fixes: (1) `marksync init` must preserve an existing configuration while assigning UUIDs to identity-less documents, and (2) planning must emit one exact warning per committed discovered UUID-less document while excluding such documents from plan entries. The plan protects the source-side immutable identity model (ADR-0006), ensures backward compatibility for first-time initialization, and preserves the duplicate-UUID fatal safeguard.

### 1.1 In Scope

- Initialization behavior when `marksync.yml` already exists (preserve config, assign UUIDs)
- Initialization behavior when `marksync.yml` is absent (create starter config, assign UUIDs)
- Planning emission of one exact warning per committed discovered UUID-less document
- Planning exclusion of UUID-less documents from plan entries
- Preservation of duplicate-UUID fatal error before render or write activity
- Regression coverage of existing initialization and planning tests

### 1.2 Out of Scope & Known Gaps

- Automatic UUID assignment during planning or synchronization (NG-1)
- Changes to configuration schema or content when config exists (NG-2)
- Changes to duplicate-UUID handling beyond preservation of fatality (NG-3)
- Performance testing of initialization or planning latency
- Configuration lock state or remote synchronization behavior changes

## 2. References

- [Change Specification](./chg-GH-74-spec.md) — complete requirements and AC definitions
- [Implementation Plan](./chg-GH-74-plan.md) — phased delivery approach
- [Testing Strategy](.ai/rules/testing-strategy.md) — test tiers, coverage rules, CI wiring
- [CLI Feature Specification](doc/spec/features/feature-cli.md) — initialization behavior and configuration handling
- [Safe-Publish Feature Specification](doc/spec/features/feature-safe-publish.md) — planning, Plan warnings, duplicate-UUID safety
- [ADR-0006](doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md) — immutable source-side UUID identity model
- Existing tests: `tests/unit/cli/commands/init.test.ts`, `tests/unit/app/compute-plan.test.ts`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F-1-1 | Existing config init: config preserved, UUID-less doc gets UUID | TC-INIT-001, TC-INIT-002, TC-INIT-003 | Covered |
| AC-F-2-1 | No config init: starter config created, UUID-less doc gets UUID | TC-INIT-004 | Covered |
| AC-F-3-1 | UUID-less docs: one warning per doc, exact text, no plan entry | TC-PLAN-001, TC-PLAN-002, TC-PLAN-003, TC-PLAN-004 | Covered |
| AC-F-4-1 | Duplicate UUIDs: planning fails before render or write | TC-PLAN-005 | Covered |
| AC-F-1-2 | All existing tests pass and new coverage demonstrates fixes | TC-REG-001 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Description | TC ID(s) |
|--------------|-------------|----------|
| EVT-1 | UUID-less document plan warning exact text | TC-PLAN-001, TC-PLAN-002, TC-PLAN-003, TC-PLAN-004 |
| DM-1 | `marksync:uuid` document identity (no schema change) | TC-INIT-001, TC-INIT-002, TC-INIT-003, TC-INIT-004, TC-PLAN-005 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | Threshold | TC ID(s) | Status |
|--------|-------------|-----------|----------|--------|
| NFR-1 | Existing configuration preservation | 100% of runs | TC-INIT-001, TC-INIT-002, TC-INIT-003 | Covered |
| NFR-2 | Warning completeness and uniqueness | 100% of docs produce exactly one warning | TC-PLAN-001, TC-PLAN-002, TC-PLAN-003, TC-PLAN-004 | Covered |
| NFR-3 | Warning text stability | 100% match specified text exactly | TC-PLAN-001, TC-PLAN-002, TC-PLAN-003, TC-PLAN-004 | Covered |

## 4. Test Types and Layers

### Unit Tests

- **Framework**: `bun:test`
- **Root directories**: `tests/unit/cli/commands/`, `tests/unit/app/`
- **Pattern**: `<module>.test.ts`
- **Scope**: Pure domain logic and component isolation:
  - CLI initialization command behavior with/without existing config
  - Planning `computePlan` function for UUID-less document detection and warning emission
  - UUID assignment utilities and duplicate detection

### Integration Tests

- **Framework**: `bun:test` with minimal mocking
- **Root directory**: `tests/integration/`
- **Scope**: Adapter boundary correctness:
  - Git adapter for committed discovered document detection
  - Configuration file read/write operations with preservation verification
  - Plan aggregation and warning collection across multiple documents

### Golden Fixture Tests

- **Framework**: `bun:test` `toMatchSnapshot` / `toMatchInlineSnapshot`
- **Root directory**: `tests/golden/`
- **Scope**: Not applicable for this change (no rendering output changes)

### Gherkin / BDD Tests

- **Framework**: `@cucumber/cucumber` via `bun run test:bdd`
- **Root directory**: `tests/bdd/`
- **Scope**: Not applicable for this change (no lifecycle invariant changes)

### E2E (Live-Sandbox) Tests

- **Framework**: Thin runner script
- **Root directory**: `tests/e2e/`
- **Scope**: Not applicable for this change (CLI and planning fixes covered by unit/integration)

### Non-Functional Tests

- **Types**: Regression (existing test suite), warning text accuracy, configuration preservation
- **Tools**: `bun:test`, file hash verification for config preservation

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-INIT-001 | Init with existing config preserves file and assigns UUID | Happy Path | Critical | High | AC-F-1-1 |
| TC-INIT-002 | Init with existing config assigns UUID to multiple identity-less docs | Happy Path | Critical | High | AC-F-1-1 |
| TC-INIT-003 | Init with existing config and mixed UUID-bearing and UUID-less docs | Happy Path | Important | High | AC-F-1-1 |
| TC-INIT-004 | Init with no config creates starter config and assigns UUID | Happy Path | Critical | High | AC-F-2-1 |
| TC-PLAN-001 | Planning emits one exact warning per single UUID-less committed doc | Happy Path | Critical | High | AC-F-3-1 |
| TC-PLAN-002 | Planning emits one exact warning per UUID-less doc among multiple docs | Happy Path | Critical | High | AC-F-3-1 |
| TC-PLAN-003 | Planning warns on UUID-less docs while including UUID-bearing docs in entries | Happy Path | Critical | High | AC-F-3-1 |
| TC-PLAN-004 | Planning excludes UUID-less docs from plan entries | Happy Path | Critical | High | AC-F-3-1 |
| TC-PLAN-005 | Planning fails before render or write when duplicate UUIDs detected | Negative | Critical | High | AC-F-4-1 |
| TC-REG-001 | All existing tests pass with fixes applied | Regression | Important | High | AC-F-1-2 |

### 5.2 Scenario Details

#### TC-INIT-001 - Init with existing config preserves file and assigns UUID

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F-1-1, NFR-1
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/commands/init.test.ts`, `src/cli/commands/init.ts`
**Tags**: @backend, @cli, @identity

**Preconditions**:

- Test directory exists with an existing `marksync.yml` file containing valid configuration
- One or more eligible discovered documents without `marksync:uuid` frontmatter exist
- Configuration file content is known (hash or snapshot captured for verification)

**Steps**:

1. Run `marksync init` command in test directory
2. Verify configuration file exists at original path
3. Compute hash of configuration file content
4. Compare hash to pre-run expected hash
5. Check discovered documents now contain `marksync:uuid` frontmatter
6. Verify UUIDs are valid v7 format
7. Verify initialization command exits with success code

**Expected Outcome**:

- Configuration file remains unchanged (hash matches, content identical)
- All identity-less discovered documents receive a valid UUID v7
- UUID-bearing documents remain unchanged
- Command exits with success code (0)
- No errors or warnings related to configuration overwrite

**Notes / Clarifications**:

- This scenario replaces the existing "overwrite-refusal" test behavior; that test expects INVALID_CONFIG error but the new behavior preserves config and proceeds
- Use file hash or snapshot comparison to prove preservation beyond just existence
- Temp directory cleanup required after test

---

#### TC-INIT-002 - Init with existing config assigns UUID to multiple identity-less docs

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F-1-1, NFR-1
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/commands/init.test.ts`, `src/cli/commands/init.ts`
**Tags**: @backend, @cli, @identity

**Preconditions**:

- Test directory exists with an existing `marksync.yml` file
- Multiple (≥3) eligible discovered documents without `marksync:uuid` exist

**Steps**:

1. Run `marksync init` command in test directory
2. Verify configuration file content is unchanged
3. Check that all identity-less documents now contain `marksync:uuid` frontmatter
4. Verify all UUIDs are unique across documents
5. Verify all UUIDs are valid v7 format

**Expected Outcome**:

- Configuration file remains unchanged
- All identity-less documents receive unique, valid UUID v7 values
- Document count equals UUID assignment count
- No duplicate UUIDs introduced

**Notes / Clarifications**:

- Use a set data structure to verify uniqueness of assigned UUIDs
- Test with mixed document types (nested paths, different extensions) to ensure coverage

---

#### TC-INIT-003 - Init with existing config and mixed UUID-bearing and UUID-less docs

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, AC-F-1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/commands/init.test.ts`, `src/cli/commands/init.ts`
**Tags**: @backend, @cli, @identity

**Preconditions**:

- Test directory exists with an existing `marksync.yml` file
- Some discovered documents have existing `marksync:uuid` frontmatter
- Some discovered documents lack `marksync:uuid` frontmatter

**Steps**:

1. Run `marksync init` command in test directory
2. Verify configuration file content is unchanged
3. Check that UUID-less documents now contain `marksync:uuid` frontmatter
4. Check that UUID-bearing documents retain their original UUID values unchanged
5. Verify all UUIDs (existing and new) are unique across documents

**Expected Outcome**:

- Configuration file remains unchanged
- Only identity-less documents receive new UUID assignments
- Existing UUID-bearing documents are not modified
- No UUID collisions between existing and newly assigned UUIDs

**Notes / Clarifications**:

- Capture original UUID values before initialization to verify immutability
- Tests that the fix does not inadvertently re-assign existing identities

---

#### TC-INIT-004 - Init with no config creates starter config and assigns UUID

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F-2-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/commands/init.test.ts`, `src/cli/commands/init.ts`
**Tags**: @backend, @cli, @identity

**Preconditions**:

- Test directory exists without `marksync.yml` file
- One or more eligible discovered documents without `marksync:uuid` frontmatter exist

**Steps**:

1. Run `marksync init` command in test directory
2. Verify `marksync.yml` file is created
3. Verify `marksync.yml` contains valid starter configuration
4. Check discovered documents now contain `marksync:uuid` frontmatter
5. Verify UUIDs are valid v7 format

**Expected Outcome**:

- Starter configuration file is created with valid content
- All identity-less discovered documents receive valid UUID v7 values
- Command exits with success code (0)

**Notes / Clarifications**:

- This scenario preserves existing first-time initialization behavior
- Verify starter config matches expected template (may use snapshot comparison)
- This is the regression case: ensures the fix does not break first-time init

---

#### TC-PLAN-001 - Planning emits one exact warning per single UUID-less committed doc

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F-3-1, EVT-1, NFR-2, NFR-3
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`, `src/app/push-flow.ts`
**Tags**: @backend, @api, @identity

**Preconditions**:

- Repository has one committed discovered document without `marksync:uuid` frontmatter
- Repository may have other committed discovered documents with `marksync:uuid` frontmatter

**Steps**:

1. Compute plan via `computePlan()` or equivalent
2. Extract `warnings` array from resulting Plan object
3. Verify warnings array contains exactly one entry
4. Verify warning text matches exactly: `{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`
5. Verify `{path}` is replaced with the actual document path
6. Verify plan entries array contains no entry for the UUID-less document

**Expected Outcome**:

- Exactly one warning is produced for the UUID-less document
- Warning text matches specified format exactly (aside from path substitution)
- Plan entries do not include the UUID-less document
- Command or function returns successfully (warnings do not cause failure)

**Notes / Clarifications**:

- Use exact string matching, not substring or regex, for warning text validation
- Verify path substitution produces a valid filesystem path relative to repository root
- Test with both root-level and nested document paths

---

#### TC-PLAN-002 - Planning emits one exact warning per UUID-less doc among multiple docs

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F-3-1, EVT-1, NFR-2, NFR-3
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`, `src/app/push-flow.ts`
**Tags**: @backend, @api, @identity

**Preconditions**:

- Repository has multiple (≥3) committed discovered documents without `marksync:uuid` frontmatter
- Repository may have committed discovered documents with `marksync:uuid` frontmatter

**Steps**:

1. Compute plan via `computePlan()` or equivalent
2. Extract `warnings` array from resulting Plan object
3. Count warnings; verify count equals number of UUID-less documents
4. For each warning, verify text matches exactly the specified format
5. For each warning, verify `{path}` substitution matches a unique UUID-less document path
6. Verify plan entries array contains no entries for any UUID-less document

**Expected Outcome**:

- Exactly one warning per UUID-less document (no more, no less)
- Each warning text matches specified format exactly
- Each warning references a distinct UUID-less document path
- No UUID-less document appears in plan entries
- Total warnings count equals total UUID-less documents count

**Notes / Clarifications**:

- Use a mapping from path to warning to ensure one-to-one correspondence
- Test with varied document paths (root, nested, special characters if applicable)
- Verify no duplicate warnings for the same document

---

#### TC-PLAN-003 - Planning warns on UUID-less docs while including UUID-bearing docs in entries

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F-3-1, EVT-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`, `src/app/push-flow.ts`
**Tags**: @backend, @api, @identity

**Preconditions**:

- Repository has both UUID-less committed discovered documents and UUID-bearing committed discovered documents

**Steps**:

1. Compute plan via `computePlan()` or equivalent
2. Extract `warnings` and `entries` arrays from resulting Plan object
3. Verify warnings count equals UUID-less documents count
4. Verify warnings only reference UUID-less document paths
5. Verify entries count equals UUID-bearing documents count
6. Verify entries only reference UUID-bearing document paths
7. Verify no document appears in both warnings and entries

**Expected Outcome**:

- Warnings array contains exactly one warning per UUID-less document
- Entries array contains entries for all and only UUID-bearing documents
- No overlap between warned documents and entry documents
- Document partition is complete (all discovered committed documents are either warned or entered)

**Notes / Clarifications**:

- Create sets of paths for comparison to ensure partition correctness
- Tests the boundary condition that warning does not suppress normal processing of valid documents

---

#### TC-PLAN-004 - Planning excludes UUID-less docs from plan entries

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F-3-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`, `src/app/push-flow.ts`
**Tags**: @backend, @api, @identity

**Preconditions**:

- Repository has committed discovered documents without `marksync:uuid` frontmatter

**Steps**:

1. Compute plan via `computePlan()` or equivalent
2. Extract `entries` array from resulting Plan object
3. Iterate through entries, checking each document's path
4. Verify no entry references a UUID-less document path
5. Verify all UUID-less document paths are absent from entries array

**Expected Outcome**:

- No plan entry exists for any UUID-less committed discovered document
- All UUID-less document paths are excluded from the plan
- Entries array is empty if all discovered committed documents are UUID-less
- Entries array is non-empty only if UUID-bearing documents exist

**Notes / Clarifications**:

- This is the silent omission fix: previously UUID-less docs were silently dropped; now they are warned and still dropped (but visibly)
- Verify exclusion happens before render or write activity (implicit in plan computation)

---

#### TC-PLAN-005 - Planning fails before render or write when duplicate UUIDs detected

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F-4-1, DM-1
**Test Type(s)**: Unit, Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`, `tests/bdd/features/duplicate-uuid-fatal.feature`, `src/app/push-flow.ts`
**Tags**: @backend, @identity, @safety

**Preconditions**:

- Repository has committed discovered documents with duplicate `marksync:uuid` values
- Duplicate UUIDs exist across two or more documents

**Steps**:

1. Compute plan via `computePlan()` or equivalent
2. Verify function throws error or returns error result before render/write activity
3. Verify error message indicates duplicate UUID detection
4. Verify error lists conflicting document paths
5. Verify plan entries are not created (plan computation fails)
6. Verify no render or write activity occurs (no Confluence API calls)

**Expected Outcome**:

- Planning fails with a duplicate UUID error before any render or write activity
- Error is actionable (indicates which documents conflict)
- No plan entries are produced
- No external system writes occur (Confluence is not contacted)

**Notes / Clarifications**:

- This is a regression scenario: ensures the fix does not weaken duplicate-UUID fatal safeguard (INV-SAFE-3)
- The Gherkin variant (if exists) should also pass; verifies safety invariant at integration level
- Test with both direct duplicates (identical UUID strings) and accidental duplicates (same UUID assigned to different docs)

---

#### TC-REG-001 - All existing tests pass with fixes applied

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F-1-2, F-1, F-2, F-3
**Test Type(s)**: Unit, Integration, Regression
**Automation Level**: Automated
**Target Layer / Location**: All test suites (`tests/unit/`, `tests/integration/`, `tests/golden/`)
**Tags**: @backend, @regression

**Preconditions**:

- All code changes for GH-74 are implemented
- Test scenarios TC-INIT-001 through TC-PLAN-005 are implemented

**Steps**:

1. Run full test suite: `bun test tests/unit/ tests/integration/ tests/golden/`
2. Run BDD tests: `bun run test:bdd`
3. Verify all tests pass (exit code 0)
4. Review test results for any failures or warnings
5. Identify any tests that required modification (e.g., overwrite-refusal test in `init.test.ts`)
6. Verify modified tests reflect new behavior as specified

**Expected Outcome**:

- All existing tests pass without modification (except those explicitly changed by spec)
- THREE existing tests are deliberately modified to reflect new behavior:
  - The overwrite-refusal test in `tests/unit/cli/commands/init.test.ts` (line ~54) is updated to expect config preservation instead of INVALID_CONFIG error
  - TC-ASSIGN-005 in `tests/integration/identity/identity-assign.test.ts` (line ~124) is rewritten to assert successful UUID assignment when config already exists (exit 0, no error, config unchanged, doc receives UUID)
  - The DEC-5 redaction test in `tests/unit/cli/commands/init.test.ts` (line ~65) is reviewed and updated to reflect the new error path (config validation failure, not overwrite refusal)
- New test scenarios (TC-INIT-001 through TC-PLAN-005) all pass
- No unexpected test failures or deprecations

**Postconditions**:

- CI fast loop (`bun test tests/unit/ tests/integration/ tests/golden/`) should pass
- BDD gate (`bun run test:bdd`) should pass

**Notes / Clarifications**:

- This scenario validates that the fixes do not introduce regressions
- THREE existing tests are deliberately modified:
  1. The overwrite-refusal test in `tests/unit/cli/commands/init.test.ts` (line ~54): previously expected INVALID_CONFIG error code and exit 10; new behavior preserves config and proceeds
  2. TC-ASSIGN-005 in `tests/integration/identity/identity-assign.test.ts` (line ~124): previously asserted exit 10, INVALID_CONFIG error, and byte-unchanged doc; new behavior expects exit 0, no error, and doc receives UUID
  3. The DEC-5 redaction test in `tests/unit/cli/commands/init.test.ts` (line ~65): previously tested overwrite-refusal path; after F-1 it still errors but via config-validation failure, requiring review and update to reflect the correct error path
- If any existing tests fail unexpectedly, this is a gap requiring investigation before delivery

## 6. Environments and Test Data

### Required Environments

- **Local Development**: Primary environment for all unit and integration tests; requires Bun runtime, `bun:test` framework
- **CI Fast Loop**: GitHub Actions or equivalent; runs unit, integration, golden fixture, and BDD tests on every push
- **E2E Sandbox**: Not required for this change (no external API changes)

### Test Data Generation and Cleanup

- **Temp Directories**: Use `Bun.tempDir()` or equivalent for isolated test workspaces
- **Configuration Files**: Create mock `marksync.yml` files with valid content for TC-INIT-001 through TC-INIT-003; create fresh temp directories with no config for TC-INIT-004
- **Document Fixtures**: Create markdown files with and without `marksync:uuid` frontmatter; use a variety of paths (root-level, nested, special characters)
- **Git State**: For planning tests, use temp Git repositories with committed documents; setup includes `git init`, `git add`, `git commit`
- **Cleanup**: Delete temp directories after each test using `afterEach` hooks; ensure no orphaned Git processes or file locks

### Isolation Strategy

- **File System**: Each test uses a unique temp directory to avoid cross-test contamination
- **Git State**: Each test initializes its own Git repository; no shared state across tests
- **Process Isolation**: Tests run as separate processes within `bun:test`; no persistent state between tests
- **Mock Limits**: Per testing strategy, mocks are limited to fault injection and adapter boundaries; no mocking of domain logic (UUID assignment, duplicate detection)

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-INIT-001 | `tests/unit/cli/commands/init.test.ts` | `bun test tests/unit/cli/commands/init.test.ts` | Temp file system, Git repo mock | Existing – Replace overwrite-refusal test |
| TC-INIT-002 | `tests/unit/cli/commands/init.test.ts` | `bun test tests/unit/cli/commands/init.test.ts` | Temp file system, Git repo mock | Existing – Replace overwrite-refusal test |
| TC-INIT-003 | `tests/unit/cli/commands/init.test.ts` | `bun test tests/unit/cli/commands/init.test.ts` | Temp file system, Git repo mock | Existing – Replace overwrite-refusal test |
| TC-INIT-004 | `tests/unit/cli/commands/init.test.ts` | `bun test tests/unit/cli/commands/init.test.ts` | Temp file system, Git repo mock | Existing – Verify (no-config path) |
| TC-PLAN-001 | `tests/unit/app/compute-plan.test.ts` | `bun test tests/unit/app/compute-plan.test.ts` | Git repo mock, document discovery mock | To Implement |
| TC-PLAN-002 | `tests/unit/app/compute-plan.test.ts` | `bun test tests/unit/app/compute-plan.test.ts` | Git repo mock, document discovery mock | To Implement |
| TC-PLAN-003 | `tests/unit/app/compute-plan.test.ts` | `bun test tests/unit/app/compute-plan.test.ts` | Git repo mock, document discovery mock | To Implement |
| TC-PLAN-004 | `tests/unit/app/compute-plan.test.ts` | `bun test tests/unit/app/compute-plan.test.ts` | Git repo mock, document discovery mock | To Implement |
| TC-PLAN-005 | `tests/unit/app/compute-plan.test.ts` or `tests/bdd/features/duplicate-uuid-fatal.feature` | `bun test tests/unit/app/compute-plan.test.ts` or `bun run test:bdd` | Git repo mock, document discovery mock (unit); live Git (BDD) | Existing – No Change |
| TC-REG-001 | N/A (all test suites) | `bun test tests/unit/ tests/integration/ tests/golden/` && `bun run test:bdd` | None | To Implement (run all) |

### Implementation Notes

- **TC-INIT-001, TC-INIT-002, TC-INIT-003 Update**: These three scenarios replace the existing "overwrite-refusal (OQ-TP-1)" test in `tests/unit/cli/commands/init.test.ts` (line ~54), which previously expected an INVALID_CONFIG error and exit code 10. The replacement tests verify configuration preservation and successful UUID assignment when an existing config is present. This is a deliberate test modification driven by the spec change.
- **TC-INIT-004**: The no-config path (first-time initialization) test behavior is preserved; the existing "success → exitCode 0" test already covers this and should pass without modification. This test verifies that the fix does not break first-time init.
- **TC-REG-001**: THREE existing tests require modification: (1) the unit-level overwrite-refusal test replaced by TC-INIT-001/002/003, (2) TC-ASSIGN-005 in `tests/integration/identity/identity-assign.test.ts` (line ~124) which must be rewritten to assert successful UUID assignment, and (3) the DEC-5 redaction test in `tests/unit/cli/commands/init.test.ts` (line ~65) which requires review and update to reflect the new error path.
- **TC-PLAN-005**: The existing duplicate-UUID fatal safeguard (INV-SAFE-3) likely already has test coverage. This scenario verifies that coverage remains intact after the fixes; no new implementation may be required, only regression verification.
- **Golden Fixtures**: No changes required for this fix (no rendering or output format changes).
- **BDD Tests**: No new BDD scenarios required for this fix; existing lifecycle invariant tests (INV-SAFE-1/2/3) should continue to pass.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Test modification (overwrite-refusal) could introduce coverage gap | M | L | Review modified test against new ACs; ensure config preservation and UUID assignment are both verified | L |
| Temp directory cleanup failures could cause cross-test contamination | L | L | Use robust `afterEach` hooks; verify temp directory deletion; use unique directory names per test | L |
| Warning text matching could be fragile if whitespace or punctuation changes | M | L | Use exact string matching with normalized whitespace; document warning text format in spec | L |
| Git state mocking may not accurately reflect "committed discovered" semantics | M | L | Use real Git operations in temp repos; verify commit and discovery integration; consider live Git for planning tests | L |

### 8.2 Assumptions

- `marksync:uuid` remains the authoritative source-side document identity (ADR-0006)
- Plan warnings and their aggregation are available in the Plan object without new output contracts
- "Committed discovered" has its existing planning meaning (document is in Git and discovered by planning rules)
- Existing `tests/unit/cli/commands/init.test.ts` test structure is amenable to modification for TC-INIT-004
- `writeStarterConfig(dir)` returns an error when config exists; fix must change this behavior or bypass it

### 8.3 Open Questions

| Question | Blocking | Owner | Context |
|----------|----------|-------|---------|
| None | N/A | N/A | No open questions identified from spec and implementation context |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Test Plan Writer (@test-plan-writer) | Initial test plan for GH-74; covers F-1, F-2, F-3, F-4 and all ACs |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |