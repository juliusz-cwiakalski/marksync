---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-62-test-plan
status: Proposed
created: 2026-07-13
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, p0, ms-0002, mvp, sync, drift-detection, idempotency]
version_impact: patch
summary: "Fix remote body hash mismatch that breaks idempotent sync by aligning hash domains and adding fetch-back for Confluence-normalized bodies."
links:
  change_spec: ./chg-GH-62-spec.md
  implementation_plan: ./chg-GH-62-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Remote body hash mismatch — Confluence XHTML normalization breaks idempotent sync

## 1. Scope and Objectives

This test plan validates the fix for the P0 bug where every sync after the first incorrectly classifies all pages as "remote changed" due to hash-domain mismatch. The fix ensures semantic idempotency (second unchanged sync writes 0 pages) by (1) fetching back the Confluence-normalized body after each Create/Update, (2) storing the raw hash in `SharedBase.remoteBodyHash`, and (3) fixing the classifier to compare raw-to-raw for remote drift detection. The plan protects against regressions in drift detection accuracy and ensures fetch-back failures are handled gracefully without blocking operations.

### 1.1 In Scope

- Classifier unit tests updated for raw-to-raw comparison (`remote.bodyHash !== base.remoteBodyHash`)
- Fetch-back behavior after Create and Update operations
- SharedBase construction with `remoteBodyHash` field
- Idempotent sync integration (second unchanged sync = 0 writes, 0 blocks)
- Remote edit detection (correctly blocks when remote changes)
- Fetch-back failure handling (fallback + warning, operation continues)
- 409 reapply path (fetch-back after reapply)

### 1.2 Out of Scope & Known Gaps

- Changes to canonical hash algorithm (NG-1 from spec)
- Confluence normalization prediction or reverse-engineering (NG-2 from spec)
- Semantic AST comparison for drift detection (NG-3 from spec)
- Batch fetch-back optimization (deferred to MS-0003+)
- Fetch-back retry policy with exponential backoff (deferred to MS-0003+)
- PageBinding schema changes (field already exists, GH-19)
- Lock file schema changes (field already exists, GH-19)

## 2. References

- Change specification: `chg-GH-62-spec.md`
- Implementation plan: `chg-GH-62-plan.md` (if exists)
- Testing strategy: `.ai/rules/testing-strategy.md` (6-tier testing strategy)
- ADR-0006: Shared base state model (state model, lifecycle invariants)
- Existing classifier tests: `tests/unit/domain/state/classifier.test.ts`
- Existing integration test patterns: Search for push-flow tests

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Second sync NO_OP after create | TC-IDEM-001 | Covered |
| AC-F1-2 | Second sync NO_OP after update | TC-IDEM-002 | Covered |
| AC-F2-1 | Fetch-back after Create | TC-FETCH-001 | Covered |
| AC-F2-2 | Fetch-back after Update | TC-FETCH-002 | Covered |
| AC-F3-1 | SharedBase.remoteBodyHash from binding | TC-SHARED-001 | Covered |
| AC-F4-1 | Classifier remote comparison raw-to-raw | TC-CLSF-001, TC-CLSF-002, TC-CLSF-003, TC-CLSF-004, TC-CLSF-005 | Covered |
| AC-F4-2 | Classifier local comparison canonical-to-canonical | TC-CLSF-001 (existing test pattern) | Covered |
| AC-F5-1 | PageBinding.remoteBodyHash after Create | TC-FETCH-001 | Covered |
| AC-F5-2 | PageBinding.remoteBodyHash after Update | TC-FETCH-002 | Covered |
| AC-T1-1 | Classifier unit tests updated | TC-CLSF-001 through TC-CLSF-005 | Covered |
| AC-T2-1 | Integration test for normalization simulation | TC-IDEM-001, TC-IDEM-002 | Covered |
| AC-F5-3 | Fetch-back failure handling | TC-FETCH-003 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| ID | Element | TC ID(s) | Status |
|----|---------|----------|--------|
| DM-1 | SharedBase.remoteBodyHash field | TC-SHARED-001 | Covered |
| DM-2 | SyncState.remoteChanged logic | TC-CLSF-001 through TC-CLSF-005 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Fetch-back latency impact | TC-IDEM-001, TC-IDEM-002 (indirect) | Covered |
| NFR-2 | Fetch-back failure rate | TC-FETCH-003 | Covered |
| NFR-3 | Idempotency guarantee (100% NO_OP) | TC-IDEM-001, TC-IDEM-002 | Covered |
| NFR-4 | False positive rate (0%) | TC-IDEM-001, TC-IDEM-002 | Covered |
| NFR-5 | Concurrency safety (409 re-fetch) | TC-REAPPLY-001 | Covered |

## 4. Test Types and Layers

- **Unit tests:** `bun:test`, `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`. Pure fixtures, no mocks. Tests classifier logic with raw-to-raw comparison.

- **Integration tests:** `bun:test` + `Bun.serve()` mock, `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts` (if exists, otherwise create). Tests fetch-back behavior, SharedBase construction, idempotent sync, and remote edit detection. Mock Confluence target with normalization simulation.

- **Golden fixture tests:** Not applicable for this change (no rendering changes).

- **E2E tests:** Not in scope for initial delivery (MS-0002 MVP). Future validation against real Confluence test space via `tests/e2e/sandbox-publish.test.ts`.

- **Non-functional:** Performance validation through integration test timing (NFR-1). No separate performance test suite.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-CLSF-001 | Classifier: NO_CHANGE with raw-to-raw match | Happy Path | Important | High | AC-F4-1, AC-F4-2, AC-T1-1 |
| TC-CLSF-002 | Classifier: REMOTE_AHEAD with remote body change | Negative | Critical | High | AC-F4-1, AC-T1-1 |
| TC-CLSF-003 | Classifier: LOCAL_AHEAD with local canonical change | Happy Path | Important | High | AC-F4-2, AC-T1-1 |
| TC-CLSF-004 | Classifier: DIVERGED with both changes | Corner Case | Important | Medium | AC-F4-1, AC-F4-2, AC-T1-1 |
| TC-CLSF-005 | Classifier: SharedBase requires remoteBodyHash | Regression | Important | High | AC-F3-1, AC-T1-1 |
| TC-FETCH-001 | Fetch-back after Create success | Happy Path | Critical | High | AC-F2-1, AC-F5-1 |
| TC-FETCH-002 | Fetch-back after Update success | Happy Path | Critical | High | AC-F2-2, AC-F5-2 |
| TC-FETCH-003 | Fetch-back failure handling (network error) | Negative | Important | High | AC-F5-3 |
| TC-SHARED-001 | SharedBase construction with remoteBodyHash | Happy Path | Important | Medium | AC-F3-1 |
| TC-IDEM-001 | Idempotent sync after Create (normalization simulation) | Happy Path | Critical | High | AC-F1-1, AC-T2-1 |
| TC-IDEM-002 | Idempotent sync after Update (normalization simulation) | Happy Path | Critical | High | AC-F1-2, AC-T2-1 |
| TC-REMOTE-001 | Remote edit detection (blocks correctly) | Negative | Critical | High | NFR-4 |
| TC-REAPPLY-001 | Fetch-back after 409 reapply | Edge Case | Important | Medium | NFR-5 |

### 5.2 Scenario Details

#### TC-CLSF-001 - Classifier: NO_CHANGE with raw-to-raw match

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, AC-F4-2, AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend

**Preconditions**:

- Classifier module imported
- Mock fixtures: local, base (with `remoteBodyHash`), remote (present)

**Steps**:

1. Create input with `local.canonicalHash === base.renderedBodyHash` (both canonical)
2. Create input with `remote.bodyHash === base.remoteBodyHash` (both raw)
3. Call `classify(input)`
4. Verify result is `NO_CHANGE`

**Expected Outcome**:

- Result.ok = true
- Result.value = "NO_CHANGE"
- No false positive remote change detection

**Notes / Clarifications**:

- This test replaces existing TC-STATE-001 with `remoteBodyHash` field in base
- Demonstrates raw-to-raw comparison for remote, canonical-to-canonical for local

---

#### TC-CLSF-002 - Classifier: REMOTE_AHEAD with remote body change

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F4-1, AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend

**Preconditions**:

- Classifier module imported
- Mock fixtures: local, base (with `remoteBodyHash`), remote (present)

**Steps**:

1. Create input with `local.canonicalHash === base.renderedBodyHash` (local unchanged)
2. Create input with `remote.bodyHash !== base.remoteBodyHash` (remote raw hash differs)
3. Call `classify(input)`
4. Verify result is `REMOTE_AHEAD`

**Expected Outcome**:

- Result.ok = true
- Result.value = "REMOTE_AHEAD"
- Correct detection of remote body edit

**Notes / Clarifications**:

- This test updates existing TC-STATE-003 pattern
- Critical for INV-SAFE-1 (no silent overwrite)

---

#### TC-CLSF-003 - Classifier: LOCAL_AHEAD with local canonical change

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-2, AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend

**Preconditions**:

- Classifier module imported
- Mock fixtures: local, base (with `remoteBodyHash`), remote (present)

**Steps**:

1. Create input with `local.canonicalHash !== base.renderedBodyHash` (local canonical hash differs)
2. Create input with `remote.bodyHash === base.remoteBodyHash` (remote unchanged)
3. Call `classify(input)`
4. Verify result is `LOCAL_AHEAD`

**Expected Outcome**:

- Result.ok = true
- Result.value = "LOCAL_AHEAD"
- Correct detection of local content change

**Notes / Clarifications**:

- This test updates existing TC-STATE-002 pattern
- Canonical hash comparison remains unchanged

---

#### TC-CLSF-004 - Classifier: DIVERGED with both changes

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-F4-1, AC-F4-2, AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend

**Preconditions**:

- Classifier module imported
- Mock fixtures: local, base (with `remoteBodyHash`), remote (present)

**Steps**:

1. Create input with `local.canonicalHash !== base.renderedBodyHash` (local changed)
2. Create input with `remote.bodyHash !== base.remoteBodyHash` (remote changed)
3. Call `classify(input)`
4. Verify result is `DIVERGED`

**Expected Outcome**:

- Result.ok = true
- Result.value = "DIVERGED"
- Correct detection of concurrent local and remote changes

**Notes / Clarifications**:

- This test updates existing TC-STATE-004 pattern
- DIVERGED triggers Block action (correct behavior)

---

#### TC-CLSF-005 - Classifier: SharedBase requires remoteBodyHash

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-1, AC-T1-1, F-2, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/domain/state/classifier.ts` → `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend

**Preconditions**:

- Classifier module imported
- TypeScript type checking enabled

**Steps**:

1. Attempt to construct `SharedBase` without `remoteBodyHash` field
2. Verify TypeScript compilation fails (type error)
3. Construct `SharedBase` with `remoteBodyHash` field
4. Verify TypeScript compilation succeeds

**Expected Outcome**:

- Type error when `remoteBodyHash` is missing from `SharedBase`
- Successful compilation when `remoteBodyHash` is present

**Notes / Clarifications**:

- Ensures the field is required in the interface
- Prevents missing field in classifier input

---

#### TC-FETCH-001 - Fetch-back after Create success

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-F5-1, F-1, F-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Mock `target.createPage()` returns success
- Mock `target.getPage()` returns normalized body (different from sent body)
- Mock `target.putProperty()` succeeds

**Steps**:

1. Call `applyPlan` with a Create entry
2. Mock `target.createPage()` to return page with ID "123"
3. Mock `target.getPage(123)` to return body with Confluence normalization (e.g., `<hr />\n\n<p>&mdash;</p>` vs sent `<hr/><p>—</p>`)
4. Verify `target.getPage(123)` was called after `createPage()`
5. Verify `PageBinding.remoteBodyHash` in lock equals `rawHash(fetchedBody)`
6. Verify lock saved and property put

**Expected Outcome**:

- `target.getPage(pageId)` called exactly once after successful create
- `remoteBodyHash` in binding equals `rawHash(fetchedBody)` (not canonical hash)
- Lock saved with updated binding
- Property put succeeded

**Notes / Clarifications**:

- This is the key test that would have caught the original bug
- Mock simulates Confluence normalization by returning different body than sent

---

#### TC-FETCH-002 - Fetch-back after Update success

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, AC-F5-2, F-1, F-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Existing PageBinding with stale `remoteBodyHash`
- Mock `target.updatePage()` returns success
- Mock `target.getPage()` returns normalized body

**Steps**:

1. Call `applyPlan` with an Update entry
2. Mock `target.updatePage()` to return success
3. Mock `target.getPage(pageId)` to return normalized body (different from sent body)
4. Verify `target.getPage(pageId)` was called after `updatePage()`
5. Verify `PageBinding.remoteBodyHash` in lock is refreshed to `rawHash(fetchedBody)`
6. Verify lock saved and property put

**Expected Outcome**:

- `target.getPage(pageId)` called exactly once after successful update
- `remoteBodyHash` in binding refreshed to `rawHash(fetchedBody)` (replaces stale value)
- Lock saved with updated binding
- Property put succeeded

**Notes / Clarifications**:

- Tests refresh path for updates
- Stale `remoteBodyHash` is replaced (not canonical hash)

---

#### TC-FETCH-003 - Fetch-back failure handling (network error)

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F5-3, F-5, RSK-2, NFR-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Mock `target.createPage()` or `target.updatePage()` returns success
- Mock `target.getPage()` returns error (network error, rate limit, or permission loss)

**Steps**:

1. Call `applyPlan` with a Create or Update entry
2. Mock `target.createPage()` or `target.updatePage()` to return success
3. Mock `target.getPage(pageId)` to return error (e.g., `RateLimited` or `RemoteUnreachable`)
4. Verify operation continues (does not block or abort)
5. Verify `remoteBodyHash` in binding equals `rawHash(renderedBody)` (fallback per OQ-1)
6. Verify warning emitted in apply report
7. Verify lock saved and property put

**Expected Outcome**:

- Operation succeeds (does not block)
- `remoteBodyHash` set to `rawHash(renderedBody)` (fallback)
- Warning included in apply report warnings array
- Lock saved and property put succeeded

**Notes / Clarifications**:

- Implements PM decision OQ-1 (fallback to raw hash of rendered body)
- Next sync will re-fetch and recover
- Accepts one false-positive block if Confluence normalized (rare edge case)

---

#### TC-SHARED-001 - SharedBase construction with remoteBodyHash

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-F3-1, F-2, DM-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Existing PageBinding with `remoteBodyHash` field populated

**Steps**:

1. Call `computePlan` with a bound document
2. Verify `SharedBase` constructed from `PageBinding`
3. Verify `SharedBase.remoteBodyHash` equals `binding.remoteBodyHash`
4. Verify all other `SharedBase` fields populated correctly

**Expected Outcome**:

- `SharedBase.remoteBodyHash` equals `binding.remoteBodyHash`
- All other fields (uuid, pageId, parentPageId, pageVersion, renderedBodyHash, attachmentHashes) correctly populated
- No TypeScript errors

**Notes / Clarifications**:

- Tests all construction paths: computePlan, 409 re-fetch
- Ensures classifier has access to last-known-remote raw hash

---

#### TC-IDEM-001 - Idempotent sync after Create (normalization simulation)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, AC-T2-1, F-1, F-3, NFR-3, NFR-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api, @perf

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Mock `target.createPage()` returns success
- Mock `target.getPage()` returns normalized body (simulating Confluence normalization)

**Steps**:

1. First sync: call `applyPlan` with Create entry
2. Mock `target.createPage()` to return page ID "123"
3. Mock `target.getPage(123)` to return normalized body (different from sent body)
4. Verify first sync writes 1, blocks 0
5. Verify lock saved with `remoteBodyHash = rawHash(normalizedBody)`
6. Second sync: call `applyPlan` with same content (no changes)
7. Mock `target.getPage(123)` to return same normalized body
8. Verify second sync writes 0, blocks 0 (all NoOp)

**Expected Outcome**:

- First sync: writes = 1, blocks = 0
- Second sync: writes = 0, blocks = 0 (100% NoOp)
- No false positive remote change detection

**Notes / Clarifications**:

- THE KEY TEST for this bug fix
- Would have caught the original hash-domain mismatch bug
- Simulates Confluence normalization by mocking `target.getPage()` to return different body

---

#### TC-IDEM-002 - Idempotent sync after Update (normalization simulation)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-2, AC-T2-1, F-1, F-3, NFR-3, NFR-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api, @perf

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Existing PageBinding with `remoteBodyHash`
- Mock `target.updatePage()` returns success
- Mock `target.getPage()` returns normalized body

**Steps**:

1. First sync: call `applyPlan` with Update entry
2. Mock `target.updatePage()` to return success
3. Mock `target.getPage(pageId)` to return normalized body (different from sent body)
4. Verify first sync writes 1, blocks 0
5. Verify lock saved with refreshed `remoteBodyHash = rawHash(normalizedBody)`
6. Second sync: call `applyPlan` with same content (no changes)
7. Mock `target.getPage(pageId)` to return same normalized body
8. Verify second sync writes 0, blocks 0 (all NoOp)

**Expected Outcome**:

- First sync: writes = 1, blocks = 0
- Second sync: writes = 0, blocks = 0 (100% NoOp)
- No false positive remote change detection

**Notes / Clarifications**:

- Tests idempotency after update (not just create)
- Ensures refresh path works correctly

---

#### TC-REMOTE-001 - Remote edit detection (blocks correctly)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: NFR-4, F-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Existing PageBinding with `remoteBodyHash`
- No local changes

**Steps**:

1. First sync: create or update page, store `remoteBodyHash`
2. Second sync: simulate remote edit by mocking `target.getPage()` to return different body
3. Call `computePlan` and verify classification = REMOTE_AHEAD
4. Call `applyPlan` and verify outcome = blocked
5. Verify writes = 0, blocks = 1

**Expected Outcome**:

- Classification = REMOTE_AHEAD
- Apply outcome = blocked
- Writes = 0, blocks = 1
- No silent overwrite

**Notes / Clarifications**:

- Negative test: ensures remote changes are detected
- Critical for INV-SAFE-1 (no silent overwrite)
- Demonstrates no false negatives in remote change detection

---

#### TC-REAPPLY-001 - Fetch-back after 409 reapply

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-5, F-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/push-flow.ts` → `tests/integration/app/push-flow.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Mock Confluence target with `Bun.serve()`
- Existing PageBinding with `remoteBodyHash`
- Mock `target.updatePage()` returns 409 Conflict on first attempt

**Steps**:

1. Call `applyPlan` with Update entry
2. Mock `target.updatePage()` to return 409 Conflict
3. Mock `target.getPage(pageId)` to return refreshed remote (with new version)
4. Mock second `target.updatePage()` (reapply) to return success
5. Mock `target.getPage(pageId)` after reapply to return normalized body
6. Verify fetch-back called after reapply
7. Verify `remoteBodyHash` refreshed to `rawHash(fetchedBody)`

**Expected Outcome**:

- Re-fetch-once policy executes correctly
- Fetch-back called after reapply
- `remoteBodyHash` refreshed in lock
- No regression in 409 handling

**Notes / Clarifications**:

- Tests fetch-back in the reapply path (push-flow.ts ~880-987)
- Ensures NFR-5 (no regression in 409 re-fetch-once policy)

## 6. Environments and Test Data

- **Required environments**: Local development (unit + integration). No staging or test environment required (mocked `Bun.serve()` target).

- **Test data generation**: Synthetic fixtures generated in-memory using helper functions (e.g., `mockSharedBase`, `mockRemote`, `buildContentHash`). No external test data files required.

- **Isolation strategy**: Pure fixtures in unit tests (no mocks). `Bun.serve()` mock HTTP server in integration tests (no external dependencies). Each test independent, no shared state between tests. Temp directories for lock file operations, cleaned up after each test.

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-CLSF-001 through TC-CLSF-005 | `tests/unit/domain/state/classifier.test.ts` | `bun test tests/unit/domain/state/classifier.test.ts` | None (pure fixtures) | Existing – Update |
| TC-FETCH-001, TC-FETCH-002, TC-FETCH-003, TC-SHARED-001, TC-IDEM-001, TC-IDEM-002, TC-REMOTE-001, TC-REAPPLY-001 | `tests/integration/app/push-flow.test.ts` (create if not exists) | `bun test tests/integration/app/push-flow.test.ts` | `Bun.serve()` mock Confluence target | To Implement |

**Mocking requirements for integration tests:**

- `Bun.serve()` mock HTTP server returning Confluence REST API responses
- Mock `target.createPage()` / `target.updatePage()` / `target.getPage()` / `target.putProperty()`
- Simulate Confluence normalization: `target.getPage()` returns different body than sent
- Simulate fetch-back failure: `target.getPage()` returns error after successful write
- Simulate remote edit: `target.getPage()` returns different body on second call

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

- **RSK-3 (from spec):** Existing classifier tests assume old comparison and will fail. Mitigation: Update all classifier tests to use `remoteBodyHash` in comparison (TC-CLSF-001 through TC-CLSF-005). Residual risk: Low.

- **Integration test refactoring:** Existing integration tests may not exist for push-flow. Mitigation: Create new integration test file following existing patterns from classifier tests. Residual risk: Low.

- **Mock complexity:** `Bun.serve()` mock for Confluence target may be complex. Mitigation: Keep mock simple; focus on fetch-back and normalization simulation. Residual risk: Low.

### 8.2 Assumptions

- Confluence Storage XHTML normalization is stable over time (from spec §22).
- `PageBinding.remoteBodyHash` field already exists in lock schema (delivered in GH-19).
- `bun:test` framework and `Bun.serve()` mock are stable and well-understood.
- Existing classifier test patterns (fixtures, helpers) can be reused.

### 8.3 Open Questions

None. All open questions resolved in PM notes (OQ-1, OQ-2).

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Test Plan Writer | Initial test plan for GH-62 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |