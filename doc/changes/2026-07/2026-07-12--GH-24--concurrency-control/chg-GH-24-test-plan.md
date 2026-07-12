---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-24-test-plan
status: Proposed
created: 2026-07-12
last_updated: 2026-07-12
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, reliability, concurrency, decentralization]
version_impact: patch
summary: "Decentralized optimistic concurrency control for safe publish: operation-ID dedup, stale-plan expiry, and 409 re-fetch-once policy to prevent older plans from overwriting newer ones without shared coordination services."
links:
  change_spec: ./chg-GH-24-spec.md
  implementation_plan: ./chg-GH-24-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E3-S7] Concurrency control — decentralized optimistic concurrency

## 1. Scope and Objectives

This test plan validates the write-time concurrency backstop that completes the safe-publish trust wedge: three pure domain gates (operation-ID freshness, stale-plan expiry, 409 re-fetch-once decision) wired into the existing `applyPlan` write path. The core behavior to protect is **NFR-REL-5**: two overlapping CI plans on separate machines must never let an older plan overwrite a newer one — a data integrity risk that would violate the brand promise of no silent overwrites. This plan also validates the decentralized variant (NFR-REL-10): the same safety without any shared coordination service.

The regression motivation stems from the convergence of GH-23 (sync engine交付) and GH-21 (Confluence adapter交付): both delivered the pre-staged infrastructure (`operationId`, `StalePlan` error arm, `stalePlanMinutes` config) but not the enforcement logic. Two overlapping CI runs can still race in the version-alignment window and let the older overwrite. This change closes that gap.

### 1.1 In Scope

- Unit tests for three pure domain gates: `assertOperationFresh`, `assertPlanNotExpired`, `decideOnConflict`
- Integration tests for two-runner overlap against enhanced `FakeTarget` (NFR-REL-5/NFR-REL-10)
- Integration test for 409 re-fetch-once policy path
- Test infrastructure enhancement for `FakeTarget` (stored properties, shared backing map, 409-then-refreshed sequence)
- Validation of CI concurrency-group templates (valid YAML, documented)
- Quality gate validation: `bun run check` green

### 1.2 Out of Scope & Known Gaps

- **BDD/E2E live-tenant wiring**: The NFR-REL-5 Gherkin scenario and live-sandbox E2E are owned by E5-S1 (deferred per NG-5 in spec). This plan validates ACs via integration tests against the enhanced fake target.
- **Pessimistic leasing / git-ref locks**: Explicitly rejected per ADR-0006 C-6 and spec NG-1.
- **Retry > 1 on 409**: Explicitly rejected per DEC-2; the policy is re-fetch+reclassify ONCE then block.
- **Reverse-sync conflict resolution**: Deferred to MS-0004+ (NG-4).
- **In-code enforcement of CI concurrency groups**: Templates are guidance artifacts only (NG-7).

## 2. References

- **Change specification**: `chg-GH-24-spec.md` — authoritative source for F-#, AC-#, NFR-#, decisions, and context
- **Story file**: `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S7--concurrency-control.md` — test matrix, CEO-resolved R1/Q1, invariant-naming note
- **Feature specification**: `doc/spec/features/feature-safe-publish.md` — cross-cutting AC NFR-REL-5, §3.1 "Concurrency control" capability
- **Decision record**: `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` — C-5/C-6, "Concurrency control (C-5)" section, Verification Criteria for concurrency
- **Testing strategy**: `.ai/rules/testing-strategy.md` — test tiers, coverage rules, guardrails against over-mocking
- **Predecessor test patterns**:
  - `tests/integration/app/duplicate-uuid-fatal.test.ts` — integration test structure, `FakeTarget` usage
  - `tests/integration/app/idempotency.test.ts` — GH-23 sync engine patterns
  - `tests/integration/app/apply-plan-integration.test.ts` — `FakeTarget` call-site patterns

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Two overlapping plans with operation-id ordering (B wins, A aborts, 0 overwrites — NFR-REL-5) | TC-CONC-001, TC-CONC-002, TC-CONC-003, TC-CONC-004 | ✅ Planned |
| AC-F1-2 | Decentralized concurrency (separate instances, shared backing map — NFR-REL-10) | TC-CONC-005, TC-CONC-006 | ✅ Planned |
| AC-F2-1 | Stale-plan expiry boundary (at/over/under window, conservative edge) | TC-EXPIRY-001, TC-EXPIRY-002, TC-EXPIRY-003 | ✅ Planned |
| AC-F3-1 | 409 decision matrix (unit: reapply vs block over SyncState values) | TC-409-001, TC-409-002, TC-409-003, TC-409-004, TC-409-005 | ✅ Planned |
| AC-F3-2 | 409 re-fetch-once policy (integration: re-fetch, re-classify, reapply/block) | TC-409-006, TC-409-007, TC-409-008 | ✅ Planned |
| AC-F4-1 | Per-document isolation (StalePlan on doc A, doc B still applies) | TC-ISO-001, TC-ISO-002 | ✅ Planned |
| AC-F5-1 | CI concurrency-group templates (valid YAML, documented) | TC-CI-001 | ✅ Planned |
| AC-F6-1 | No secrets in output (operation-id carries no secret material) | TC-SEC-001 | ✅ Planned |
| AC-Q-1 | `bun run check` green (lint, format, typecheck, test, check:boundaries) | TC-QG-001 | ✅ Planned |

**Coverage status**: All 9 ACs have planned test coverage. No gaps identified.

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface Element | TC Coverage | Notes |
|-------------------|-------------|-------|
| DM-1 `assertOperationFresh` (NEW) | TC-CONC-001, TC-CONC-002, TC-CONC-003, TC-CONC-004, TC-SEC-001 | Pure domain function, unit-tested |
| DM-2 `assertPlanNotExpired` (NEW) | TC-EXPIRY-001, TC-EXPIRY-002, TC-EXPIRY-003 | Pure domain function, unit-tested |
| DM-3 `decideOnConflict` + `Decision` (NEW) | TC-409-001, TC-409-002, TC-409-003, TC-409-004, TC-409-005 | Pure domain function, unit-tested over full matrix |
| DM-4 Plan-timestamp anchoring (OQ-1) | TC-EXPIRY-001, TC-EXPIRY-002, TC-EXPIRY-003 | Tested via `assertPlanNotExpired` |
| DM-5 `FakeTarget` enhancement (tests) | TC-CONC-005, TC-CONC-006, TC-409-006, TC-409-007, TC-409-008 | Test infrastructure, validated by integration tests |
| DM-6 CI concurrency-group templates (NEW) | TC-CI-001 | Guidance artifacts, validated via YAML parsing |
| DM-7 Error model (no change) | TC-CONC-001, TC-CONC-002, TC-EXPIRY-001 | `StalePlan` pre-staged, verified in error paths |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC Coverage | Notes |
|--------|-------------|-------------|-------|
| NFR-1 (NFR-REL-5) | Concurrency safety: B wins, A aborts, 0 overwrites | TC-CONC-001, TC-CONC-002, TC-CONC-003, TC-CONC-004, TC-CONC-005, TC-CONC-006 | Covered by two-runner overlap tests |
| NFR-2 (NFR-REL-10) | Decentralized: separate instances, shared backing map, still safe | TC-CONC-005, TC-CONC-006 | Covered by decentralized integration test |
| NFR-3 | Stale-plan expiry window: at/over/under, conservative boundary | TC-EXPIRY-001, TC-EXPIRY-002, TC-EXPIRY-003 | Covered by expiry unit tests |
| NFR-4 | 409 single retry: max 1 re-fetch, max 1 reapply, no loops | TC-409-006, TC-409-007, TC-409-008 | Covered by 409 integration tests |
| NFR-5 | Per-document isolation: StalePlan on doc A doesn't block doc B | TC-ISO-001, TC-ISO-002 | Covered by isolation unit/integration tests |
| NFR-6 | No secrets in output: 0 credential/token occurrences | TC-SEC-001 | Covered by secrets-safety test |
| NFR-7 | Pure-domain testability: zero infrastructure imports under `src/domain/state/` | TC-CONC-001, TC-EXPIRY-001, TC-409-001 | Covered by boundary check in TC-QG-001 |
| NFR-8 | Adapter isolation: Confluence REST details behind `TargetSystem` port | TC-CONC-005, TC-CONC-006, TC-409-006 | Covered by `FakeTarget` isolation |
| NFR-9 | CI template validity: valid YAML and documented | TC-CI-001 | Covered by template validation test |
| NFR-10 | Quality gate: `bun run check` exits 0 | TC-QG-001 | Covered by quality gate test |

## 4. Test Types and Layers

This change follows the testing strategy's 6-tier model, with focus on **Unit (tier 2)** and **Integration (tier 3)**. BDD/E2E tiers are out of scope for this story (owned by E5-S1).

### Unit Tests (Tier 2)

**Framework**: `bun:test`
**Root directory**: `tests/unit/`
**Pattern**: `*.test.ts`

Coverage:
- `assertOperationFresh`: `tests/unit/domain/state/assert-operation-fresh.test.ts`
- `assertPlanNotExpired`: `tests/unit/domain/state/assert-plan-not-expired.test.ts`
- `decideOnConflict`: `tests/unit/domain/state/decide-on-conflict.test.ts`

Conventions (per testing strategy):
- Test descriptions use pattern `it("does X when Y")` — describe behaviour, not implementation
- Use `describe` blocks to group by scenario, not by function name
- Use `#` import aliases for domain modules (e.g., `#domain/state`)
- Pure domain functions tested with real inputs and real outputs — no mocks
- `Result` assertions with `.ok` / `.error.kind` pattern

### Integration Tests (Tier 3)

**Framework**: `bun:test` + enhanced `FakeTarget`
**Root directory**: `tests/integration/`
**Pattern**: `*.test.ts`

Coverage:
- Two-runner overlap: `tests/integration/app/concurrency-control-overlap.test.ts`
- 409 re-fetch-once policy: `tests/integration/app/409-retry-policy.test.ts`
- Per-document isolation: `tests/integration/app/concurrency-isolation.test.ts`

Conventions:
- Mirror the GH-23 sync engine integration test patterns (e.g., `duplicate-uuid-fatal.test.ts`)
- Use `FakeTarget` for `TargetSystem` port simulation
- Avoid mocking domain logic (classifier, actions) — use real implementations
- Track call counts for assertions (e.g., `fakeTarget.updatePageCalls`)

### Golden Fixture Tests (Tier 3)

**Not applicable** for this change — no Markdown→Storage renderer changes.

### Mermaid-DOM Tests (Tier 4)

**Not applicable** for this change — no Mermaid rendering changes.

### Gherkin / BDD Tests (Tier 5)

**Out of scope** for this story (NG-5 in spec). The NFR-REL-5 Gherkin scenario is owned by E5-S1.

### E2E (Live-Sandbox) Tests (Tier 6)

**Out of scope** for this story (NG-5 in spec). Live-tenant validation is owned by E5-S1.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-CONC-001 | assertOperationFresh: remote newer → StalePlan | Negative | Unit | High | AC-F1-1, AC-F6-1 |
| TC-CONC-002 | assertOperationFresh: remote older/equal → fresh | Happy Path | Unit | High | AC-F1-1 |
| TC-CONC-003 | assertOperationFresh: missing remote property → fresh | Edge Case | Unit | High | AC-F1-1 |
| TC-CONC-004 | assertOperationFresh: operation-id format validation (op_<uuid-v7>) | Edge Case | Unit | Medium | AC-F1-1 |
| TC-CONC-005 | Two-runner overlap: single shared-state fake target (NFR-REL-5) | Happy Path | Integration | High | AC-F1-1, AC-F4-1 |
| TC-CONC-006 | Two-runner overlap: separate instances, shared backing map (NFR-REL-10) | Happy Path | Integration | High | AC-F1-2 |
| TC-EXPIRY-001 | assertPlanNotExpired: at boundary → expired | Edge Case | Unit | High | AC-F2-1 |
| TC-EXPIRY-002 | assertPlanNotExpired: over window → expired | Negative | Unit | High | AC-F2-1 |
| TC-EXPIRY-003 | assertPlanNotExpired: under window → fresh | Happy Path | Unit | High | AC-F2-1 |
| TC-409-001 | decideOnConflict: LOCAL_AHEAD → reapply | Happy Path | Unit | High | AC-F3-1 |
| TC-409-002 | decideOnConflict: NO_CHANGE → reapply | Happy Path | Unit | High | AC-F3-1 |
| TC-409-003 | decideOnConflict: REMOTE_AHEAD → block | Negative | Unit | High | AC-F3-1 |
| TC-409-004 | decideOnConflict: DIVERGED → block | Negative | Unit | High | AC-F3-1 |
| TC-409-005 | decideOnConflict: REMOTE_MISSING/LOCAL_MISSING → block | Edge Case | Unit | Medium | AC-F3-1 |
| TC-409-006 | 409 policy: re-fetch → now safe → reapply once | Happy Path | Integration | High | AC-F3-2, AC-F4-1 |
| TC-409-007 | 409 policy: re-fetch → still diverged → block | Negative | Integration | High | AC-F3-2, AC-F4-1 |
| TC-409-008 | 409 policy: re-fetch → reapply → conflict again → block | Edge Case | Integration | Medium | AC-F3-2, AC-F4-1 |
| TC-ISO-001 | Per-document isolation: StalePlan on doc A, doc B applies | Happy Path | Integration | High | AC-F4-1 |
| TC-ISO-002 | Per-document isolation: StalePlan on doc C, docs A/B apply | Happy Path | Integration | High | AC-F4-1 |
| TC-CI-001 | CI concurrency-group templates: valid YAML and documented | Manual | Manual | Medium | AC-F5-1 |
| TC-SEC-001 | No secrets in output: ApplyReport, journal, logs contain 0 tokens | Regression | Integration | High | AC-F6-1 |
| TC-QG-001 | Quality gate: bun run check exits 0 (boundary check) | Regression | Manual | High | AC-Q-1 |

### 5.2 Scenario Details

#### TC-CONC-001 - assertOperationFresh: remote newer → StalePlan

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1, AC-F6-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-operation-fresh.test.ts`
**Tags**: @backend, @domain, @concurrency

**Preconditions**:
- `assertOperationFresh` function is implemented in `src/domain/state/`
- Operation-id format is `op_<uuid-v7>` where UUID v7 carries time-sortable prefix

**Steps**:
1. Create a plan operation-id for timestamp T1: `planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc"` (older)
2. Create a remote operation-id for timestamp T2 > T1: `remoteOpId = "op_019f56e5-18f5-759b-bfdf-5438918bb3bc"` (newer)
3. Call `assertOperationFresh(planOpId, remoteOpId)`
4. Verify the result is `err(StalePlan)`
5. Verify the error contains `operationId: planOpId` and `expiredAt: ""`

**Expected Outcome**:
- `assertOperationFresh` returns `err(StalePlan)` because the remote operation-id (T2) is newer than the plan's (T1)
- The error carries the plan's operation-id for diagnostics

**Postconditions**: None

**Notes / Clarifications**:
- The UUID-v7 time prefix comparison is the ordering mechanism — no separate clock
- This is the core dedup gate that prevents older plans from overwriting newer ones

---

#### TC-CONC-002 - assertOperationFresh: remote older/equal → fresh

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-operation-fresh.test.ts`
**Tags**: @backend, @domain, @concurrency

**Preconditions**:
- `assertOperationFresh` function is implemented in `src/domain/state/`

**Steps**:
1. Test case A: Create plan operation-id for T2 (newer), remote for T1 (older)
2. Call `assertOperationFresh(planOpId, remoteOpId)`
3. Verify the result is `ok` — plan is fresh
4. Test case B: Create plan and remote with identical operation-id (equal timestamps)
5. Call `assertOperationFresh(planOpId, remoteOpId)`
6. Verify the result is `ok` — plan is fresh (not stale)

**Expected Outcome**:
- When the plan's operation-id is newer than the remote's, the function returns `ok` (fresh)
- When the plan's operation-id equals the remote's, the function returns `ok` (fresh, not stale)

**Postconditions**: None

**Notes / Clarifications**:
- Equal operation-ids indicate the same plan being reapplied (idempotency case)

---

#### TC-CONC-003 - assertOperationFresh: missing remote property → fresh

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, AC-F1-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-operation-fresh.test.ts`
**Tags**: @backend, @domain, @concurrency

**Preconditions**:
- `assertOperationFresh` function is implemented in `src/domain/state/`

**Steps**:
1. Create a plan operation-id: `planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc"`
2. Call `assertOperationFresh(planOpId, undefined)` — remote property is missing
3. Verify the result is `ok` — plan is fresh (no prior operation recorded)

**Expected Outcome**:
- When the remote `marksync.metadata.operationId` is missing (no prior apply), the function returns `ok` (fresh)
- This handles the first-publish case where no remote operation-id exists yet

**Postconditions**: None

**Notes / Clarifications**:
- The missing property case is "not stale" — it's the base case for first publish

---

#### TC-CONC-004 - assertOperationFresh: operation-id format validation (op_<uuid-v7>)

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-1, AC-F1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-operation-fresh.test.ts`
**Tags**: @backend, @domain, @concurrency

**Preconditions**:
- `assertOperationFresh` function is implemented in `src/domain/state/`

**Steps**:
1. Test case A: Malformed plan operation-id (missing `op_` prefix) → expect ok or err? (decision deferred)
2. Test case B: Malformed remote operation-id (invalid UUID) → expect ok or err? (decision deferred)
3. Test case C: Both valid UUID v7 format → expect normal ordering behavior

**Expected Outcome**:
- The function must handle malformed inputs gracefully (either return ok to proceed, or err to block)
- Actual error-handling strategy is a minor implementation detail — both approaches satisfy the AC

**Postconditions**: None

**Notes / Clarifications**:
- This is a defensive test for format validation; the primary ACs cover the happy/negative paths
- The spec does not prescribe the exact error-handling strategy for malformed ids

---

#### TC-CONC-005 - Two-runner overlap: single shared-state fake target (NFR-REL-5)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-4, F-5, AC-F1-1, AC-F4-1, NFR-1, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/concurrency-control-overlap.test.ts`
**Tags**: @backend, @integration, @concurrency

**Preconditions**:
- Enhanced `FakeTarget` supports stored `marksync.metadata` properties
- `applyPlan`/`processEntry` are wired with the three concurrency gates
- Two runner instances (simulated as sequential `applyPlan` calls) share the same `FakeTarget` instance

**Steps**:
1. Setup: Create a `FakeTarget` instance with a fixture page `page-123`
2. Setup: Create a plan A with runId-A (UUID v7 @ T1, older) → `operationId-A = "op_<runId-A>"`
3. Setup: Create a plan B with runId-B (UUID v7 @ T2 > T1, newer) → `operationId-B = "op_<runId-B>"`
4. Execute: Runner B applies plan B first → `updatePage` succeeds → `putProperty` records `operationId-B`
5. Execute: Runner A applies plan A second → `getProperty` reads `operationId-B` from the shared fake
6. Assert: `assertOperationFresh(operationId-A, operationId-B)` returns `err(StalePlan)`
7. Assert: Runner A's `processEntry` returns `{ outcome: "blocked", error: StalePlan }` for that document
8. Assert: Runner A makes **0 writes** for that document (`updatePageCalls` length unchanged from step 4)
9. Assert: Runner B's content survives in the fake target (no overwrite occurred)

**Expected Outcome**:
- Runner B (newer op-id) succeeds; Runner A (older op-id) aborts with `StalePlan` for that document
- **0 overwrites** — the older plan cannot overwrite the newer plan's result
- Per-document isolation: Runner A's stale document does not block other documents in the same run

**Postconditions**:
- `FakeTarget` state reflects only Runner B's successful write

**Notes / Clarifications**:
- This is the NFR-REL-5 acceptance test: "two overlapping plans, older does not overwrite newer"
- The `FakeTarget` enhancement (F-5) must serve stored `marksync.metadata` values for this test to work
- Branch name format from spec: `feat/GH-24/concurrency-control`

---

#### TC-CONC-006 - Two-runner overlap: separate instances, shared backing map (NFR-REL-10)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-4, F-5, AC-F1-2, AC-F4-1, NFR-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/concurrency-control-overlap.test.ts`
**Tags**: @backend, @integration, @concurrency, @decentralized

**Preconditions**:
- Enhanced `FakeTarget` supports a "shared backing map" constructor option
- Two separate `FakeTarget` instances can model two runners on separate machines
- The shared backing map simulates the shared Confluence state (no shared service between runners)

**Steps**:
1. Setup: Create a shared backing map `Map<string, Page>` (simulates Confluence storage)
2. Setup: Create Runner A's `FakeTarget` instance with the shared backing map
3. Setup: Create Runner B's `FakeTarget` instance with the same shared backing map
4. Setup: Create plan A (older op-id) and plan B (newer op-id), both targeting the same page
5. Execute: Runner B applies plan B → `updatePage` succeeds → `putProperty` writes to shared map
6. Execute: Runner A applies plan A → `getProperty` reads from shared map (sees B's op-id)
7. Assert: Runner A's `assertOperationFresh` returns `err(StalePlan)`
8. Assert: Runner A blocks with **0 writes** for that document
9. Assert: **0 silent overwrites** occur despite NO shared service between the runners

**Expected Outcome**:
- The decentralized scenario (NFR-REL-10) is safe: separate runners, no shared service, still cannot silently overwrite
- Runner B's write survives in the shared backing map; Runner A aborts
- Coordination lives only in the shared Confluence state (simulated by the backing map)

**Postconditions**:
- Shared backing map contains only Runner B's page state

**Notes / Clarifications**:
- This is the NFR-REL-10 acceptance test: "decentralized concurrency — no shared service"
- The spec emphasizes: "NO shared service between the runners (separate fake instances, shared backing map)"
- ADR-0006 C-6: all exchange lives in Git + Confluence; no coordination service

---

#### TC-EXPIRY-001 - assertPlanNotExpired: at boundary → expired

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-plan-not-expired.test.ts`
**Tags**: @backend, @domain, @expiry

**Preconditions**:
- `assertPlanNotExpired` function is implemented in `src/domain/state/`
- The plan timestamp is derived from the `runId` UUID-v7 prefix (OQ-1 resolution)

**Steps**:
1. Create a plan timestamp `planTimestamp = now - (stalePlanMinutes * 60_000)` (exactly at the window)
2. Set `stalePlanMinutes = 15` (default)
3. Call `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes)`
4. Verify the result is `err(StalePlan{expiredAt})`
5. Verify `expiredAt` is the ISO timestamp when the plan crossed the boundary

**Expected Outcome**:
- A plan exactly at the window boundary is **expired** (conservative semantics)
- The error carries `expiredAt` for diagnostics

**Postconditions**: None

**Notes / Clarifications**:
- The spec states: "Boundary semantics: a plan exactly at the window is expired (conservative)."
- OQ-1 (plan-timestamp anchoring) is resolved by extracting from the `runId` UUID-v7 prefix

---

#### TC-EXPIRY-002 - assertPlanNotExpired: over window → expired

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-plan-not-expired.test.ts`
**Tags**: @backend, @domain, @expiry

**Preconditions**:
- `assertPlanNotExpired` function is implemented in `src/domain/state/`

**Steps**:
1. Create a plan timestamp `planTimestamp = now - (20 * 60_000)` (20 minutes ago, over the 15-min window)
2. Set `stalePlanMinutes = 15` (default)
3. Call `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes)`
4. Verify the result is `err(StalePlan{expiredAt})`

**Expected Outcome**:
- A plan older than the configured window is expired → `err(StalePlan)`

**Postconditions**: None

**Notes / Clarifications**:
- This prevents long-parked plans from overwriting newer state

---

#### TC-EXPIRY-003 - assertPlanNotExpired: under window → fresh

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/assert-plan-not-expired.test.ts`
**Tags**: @backend, @domain, @expiry

**Preconditions**:
- `assertPlanNotExpired` function is implemented in `src/domain/state/`

**Steps**:
1. Create a plan timestamp `planTimestamp = now - (10 * 60_000)` (10 minutes ago, under the 15-min window)
2. Set `stalePlanMinutes = 15` (default)
3. Call `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes)`
4. Verify the result is `ok` — plan is fresh

**Expected Outcome**:
- A plan within the configured window is fresh → proceeds to write

**Postconditions**: None

**Notes / Clarifications**:
- This validates the normal case where the plan is within the expiry window

---

#### TC-409-001 - decideOnConflict: LOCAL_AHEAD → reapply

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-4, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/decide-on-conflict.test.ts`
**Tags**: @backend, @domain, @409

**Preconditions**:
- `decideOnConflict` function is implemented in `src/domain/state/`
- `SyncState` enum and `classify` function are available (GH-22)

**Steps**:
1. Create a `Conflict` object with `pageId`, `baseVersion`, `remoteVersion`
2. Create a refreshed `SyncState = LOCAL_AHEAD` (local changes still ahead after re-fetch)
3. Call `decideOnConflict(conflict, LOCAL_AHEAD)`
4. Verify the decision is `"reapply"`

**Expected Outcome**:
- When the refreshed state is `LOCAL_AHEAD`, the decision is `"reapply"` (it's safe to update)
- This is the happy path where a transient conflict resolved

**Postconditions**: None

**Notes / Clarifications**:
- Unit test over the full decision matrix (5 SyncState values → 2 decisions)
- Per the spec's decision matrix: LOCAL_AHEAD / NO_CHANGE → "reapply"

---

#### TC-409-002 - decideOnConflict: NO_CHANGE → reapply

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-4, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/decide-on-conflict.test.ts`
**Tags**: @backend, @domain, @409

**Preconditions**:
- `decideOnConflict` function is implemented in `src/domain/state/`

**Steps**:
1. Create a `Conflict` object
2. Create a refreshed `SyncState = NO_CHANGE` (remote caught up to local)
3. Call `decideOnConflict(conflict, NO_CHANGE)`
4. Verify the decision is `"reapply"`

**Expected Outcome**:
- When the refreshed state is `NO_CHANGE`, the decision is `"reapply"` (safe to reapply)

**Postconditions**: None

**Notes / Clarifications**:
- This handles the case where the remote advanced and then came back to local state

---

#### TC-409-003 - decideOnConflict: REMOTE_AHEAD → block

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-4, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/decide-on-conflict.test.ts`
**Tags**: @backend, @domain, @409

**Preconditions**:
- `decideOnConflict` function is implemented in `src/domain/state/`

**Steps**:
1. Create a `Conflict` object
2. Create a refreshed `SyncState = REMOTE_AHEAD` (remote advanced beyond local)
3. Call `decideOnConflict(conflict, REMOTE_AHEAD)`
4. Verify the decision is `"block"`

**Expected Outcome**:
- When the refreshed state is `REMOTE_AHEAD`, the decision is `"block"` (drift)
- This prevents overwriting newer remote work

**Postconditions**: None

**Notes / Clarifications**:
- This is the drift-blocking path: remote has work the plan doesn't know about

---

#### TC-409-004 - decideOnConflict: DIVERGED → block

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-4, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/decide-on-conflict.test.ts`
**Tags**: @backend, @domain, @409

**Preconditions**:
- `decideOnConflict` function is implemented in `src/domain/state/`

**Steps**:
1. Create a `Conflict` object
2. Create a refreshed `SyncState = DIVERGED` (both local and remote advanced)
3. Call `decideOnConflict(conflict, DIVERGED)`
4. Verify the decision is `"block"`

**Expected Outcome**:
- When the refreshed state is `DIVERGED`, the decision is `"block"` (drift)
- This requires manual resolution (cannot auto-merge)

**Postconditions**: None

**Notes / Clarifications**:
- DIVERGED means both sides have conflicting changes — auto-merge is unsafe

---

#### TC-409-005 - decideOnConflict: REMOTE_MISSING/LOCAL_MISSING → block

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-1, NFR-4, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/decide-on-conflict.test.ts`
**Tags**: @backend, @domain, @409

**Preconditions**:
- `decideOnConflict` function is implemented in `src/domain/state/`

**Steps**:
1. Test case A: Create a refreshed `SyncState = REMOTE_MISSING` (remote deleted)
2. Call `decideOnConflict(conflict, REMOTE_MISSING)`
3. Verify the decision is `"block"` (not an update path)
4. Test case B: Create a refreshed `SyncState = LOCAL_MISSING` (local deleted)
5. Call `decideOnConflict(conflict, LOCAL_MISSING)`
6. Verify the decision is `"block"` (not an update path)

**Expected Outcome**:
- When the refreshed state is `REMOTE_MISSING` or `LOCAL_MISSING`, the decision is `"block"`
- These are not update paths — the 409 policy only applies to `Update` operations

**Postconditions**: None

**Notes / Clarifications**:
- Per the spec's decision matrix: REMOTE_MISSING / LOCAL_MISSING → "block" (not an update path)
- The 409 policy is wired into the `Update` branch of `processEntry`

---

#### TC-409-006 - 409 policy: re-fetch → now safe → reapply once

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, AC-F3-2, AC-F4-1, NFR-4, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/409-retry-policy.test.ts`
**Tags**: @backend, @integration, @409

**Preconditions**:
- `FakeTarget` supports a configurable 409-then-refreshed sequence
- `processEntry` is wired with the 409 re-fetch-once policy
- `classify` and `decideOnConflict` are available

**Steps**:
1. Setup: Configure `FakeTarget` so first `updatePage` returns `Conflict`, then after `getPage` the remote advances to a state where re-classify returns `LOCAL_AHEAD`
2. Setup: Create a plan targeting a page with stale `baseVersion`
3. Execute: `processEntry` attempts `updatePage` → receives `Conflict`
4. Execute: `processEntry` calls `target.getPage` (ONE re-fetch)
5. Execute: `processEntry` re-classifies with the refreshed remote state → `LOCAL_AHEAD`
6. Execute: `processEntry` calls `decideOnConflict` → returns `"reapply"`
7. Execute: `processEntry` calls `updatePage` ONCE with the refreshed `baseVersion`
8. Assert: The second `updatePage` succeeds (no 409 on the reapply)
9. Assert: **Max 1 re-fetch** occurred (count `getPageCalls`)
10. Assert: **Max 1 reapply** occurred (count `updatePageCalls`)
11. Assert: Per-document isolation: other documents in the plan still apply

**Expected Outcome**:
- On a transient 409 conflict where the remote becomes safe after re-fetch, the engine reapplies once
- **No retry loop**: max 1 re-fetch, max 1 reapply per document
- The reapply uses the refreshed base version to avoid a second 409

**Postconditions**:
- `FakeTarget` state reflects the successful reapply

**Notes / Clarifications**:
- This is AC-F3-2: "re-fetch + re-classify ONCE; if now safe → reapply"
- The 409-then-refreshed sequence requires `FakeTarget` enhancement (F-5)

---

#### TC-409-007 - 409 policy: re-fetch → still diverged → block

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, AC-F3-2, AC-F4-1, NFR-4, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/409-retry-policy.test.ts`
**Tags**: @backend, @integration, @409

**Preconditions**:
- `FakeTarget` supports a configurable 409-then-refreshed sequence
- `processEntry` is wired with the 409 re-fetch-once policy

**Steps**:
1. Setup: Configure `FakeTarget` so first `updatePage` returns `Conflict`, then after `getPage` the remote advanced further where re-classify returns `DIVERGED`
2. Setup: Create a plan targeting a page with stale `baseVersion`
3. Execute: `processEntry` attempts `updatePage` → receives `Conflict`
4. Execute: `processEntry` calls `target.getPage` (ONE re-fetch)
5. Execute: `processEntry` re-classifies with the refreshed remote state → `DIVERGED`
6. Execute: `processEntry` calls `decideOnConflict` → returns `"block"`
7. Assert: `processEntry` returns `{ outcome: "blocked", error: Conflict }` for that document
8. Assert: **0 reapply** occurred after the block (count `updatePageCalls` = 1)
9. Assert: Per-document isolation: other documents in the plan still apply

**Expected Outcome**:
- On a 409 conflict where the remote is still conflicting after re-fetch, the engine blocks
- **No retry loop**: the policy is re-fetch+reclassify ONCE, then block
- The document is reported as blocked with drift (no overwrite)

**Postconditions**:
- `FakeTarget` state is unchanged (no overwrite occurred)

**Notes / Clarifications**:
- This is AC-F3-2: "if still conflicting (REMOTE_AHEAD/DIVERGED) → block"

---

#### TC-409-008 - 409 policy: re-fetch → reapply → conflict again → block

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, F-4, AC-F3-2, AC-F4-1, NFR-4, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/409-retry-policy.test.ts`
**Tags**: @backend, @integration, @409

**Preconditions**:
- `FakeTarget` supports a configurable 409-then-refreshed sequence
- `processEntry` is wired with the 409 re-fetch-once policy

**Steps**:
1. Setup: Configure `FakeTarget` so first `updatePage` returns `Conflict`, then after `getPage` the remote advanced to `LOCAL_AHEAD`, BUT the second `updatePage` (the reapply) returns `Conflict` again (race condition)
2. Setup: Create a plan targeting a page with stale `baseVersion`
3. Execute: `processEntry` attempts `updatePage` → receives `Conflict`
4. Execute: `processEntry` calls `target.getPage` (ONE re-fetch)
5. Execute: `processEntry` re-classifies → `LOCAL_AHEAD`
6. Execute: `processEntry` calls `decideOnConflict` → returns `"reapply"`
7. Execute: `processEntry` calls `updatePage` (the reapply) → receives `Conflict` AGAIN
8. Assert: `processEntry` returns `{ outcome: "blocked", error: Conflict }` for that document
9. Assert: **No second retry** occurs (count `getPageCalls` = 1, `updatePageCalls` = 2)

**Expected Outcome**:
- If the reapply itself hits a 409 (race condition), the engine blocks without a second retry
- This enforces the "max 1 re-fetch, max 1 reapply" boundary

**Postconditions**:
- `FakeTarget` state is unchanged (no overwrite occurred)

**Notes / Clarifications**:
- This is an edge case: the reapply itself conflicts (remote advanced again)
- The policy is clear: ONCE then block, even if the reapply fails

---

#### TC-ISO-001 - Per-document isolation: StalePlan on doc A, doc B applies

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/concurrency-isolation.test.ts`
**Tags**: @backend, @integration, @concurrency

**Preconditions**:
- `applyPlan`/`processEntry` are wired with the three concurrency gates
- Enhanced `FakeTarget` supports stored `marksync.metadata` properties

**Steps**:
1. Setup: Create a plan with two documents: doc A and doc B
2. Setup: Configure remote state so doc A has a newer operation-id (will be stale), doc B is fresh
3. Execute: `applyPlan` processes both documents
4. Assert: Doc A returns `{ outcome: "blocked", error: StalePlan }` for that document
5. Assert: Doc B returns `{ outcome: "updated" }` (success)
6. Assert: The `ApplyReport` contains both entries with correct outcomes
7. Assert: The run does NOT abort — both outcomes are present in the report

**Expected Outcome**:
- A `StalePlan` on doc A does not block doc B from applying
- Per-document isolation: the run continues to process other documents
- The `ApplyReport` correctly reflects mixed outcomes

**Postconditions**:
- `FakeTarget` state reflects only doc B's successful write

**Notes / Clarifications**:
- This is AC-F4-1: "per-document isolation — a StalePlan on doc A → doc B still applies"
- Mirrors the existing `Conflict` isolation pattern from GH-23

---

#### TC-ISO-002 - Per-document isolation: StalePlan on doc C, docs A/B apply

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-4, AC-F4-1, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/concurrency-isolation.test.ts`
**Tags**: @backend, @integration, @concurrency

**Preconditions**:
- `applyPlan`/`processEntry` are wired with the three concurrency gates

**Steps**:
1. Setup: Create a plan with three documents: doc A, doc B, doc C
2. Setup: Configure remote state so doc C has a newer operation-id (will be stale), docs A/B are fresh
3. Execute: `applyPlan` processes all three documents
4. Assert: Doc C returns `{ outcome: "blocked", error: StalePlan }`
5. Assert: Docs A and B return `{ outcome: "updated" }`
6. Assert: The `ApplyReport` contains all three entries
7. Assert: The run did NOT abort

**Expected Outcome**:
- Multiple `StalePlan` errors do not cause the run to abort
- Other documents continue to apply normally

**Postconditions**:
- `FakeTarget` state reflects only docs A/B's successful writes

**Notes / Clarifications**:
- Validates isolation with a larger document set

---

#### TC-CI-001 - CI concurrency-group templates: valid YAML and documented

**Scenario Type**: Manual
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-6, AC-F5-1, NFR-9
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `examples/ci/` (validation during implementation)
**Tags**: @ci, @documentation

**Preconditions**:
- CI concurrency-group templates exist under `examples/ci/`
- A README documents the group-key strategy and cancel-in-progress tradeoff

**Steps**:
1. Locate template files under `examples/ci/` (e.g., `concurrency-group-template.yml`)
2. Parse each YAML file to verify it is valid (no syntax errors)
3. Verify the README documents:
   - Group-key strategy (how to group by target)
   - Cancel-in-progress tradeoff (why this setting)
   - How to copy the snippet into a GitHub Actions workflow
4. Verify the template includes the `concurrency:` key with `group:` and `cancel-in-progress:`
5. (Optional) Paste the snippet into a test workflow and verify it runs

**Expected Outcome**:
- Templates are valid YAML and parse without errors
- README provides clear guidance for users to adopt the templates
- Templates follow the guidance in ADR-0006 and the spec's "CI concurrency-group templates" section

**Postconditions**: None

**Notes / Clarifications**:
- This is AC-F5-1: "CI concurrency-group templates under `examples/ci/`, valid YAML, documented"
- Templates are guidance artifacts, not runtime code (NG-7)
- The spec allows `docs/guides/` or `examples/ci/` — `examples/ci/` is chosen

---

#### TC-SEC-001 - No secrets in output: ApplyReport, journal, logs contain 0 tokens

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F6-1, NFR-6, NFR-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/secrets-safety-integration.test.ts` (extend existing)
**Tags**: @backend, @integration, @security

**Preconditions**:
- `applyPlan`/`processEntry` are wired with the concurrency gates
- `CommandResult<ApplyReport>` structured output is available (ADR-0011)

**Steps**:
1. Setup: Configure credentials/tokens in the environment
2. Setup: Create a plan that triggers concurrency gates (e.g., a stale plan that aborts with `StalePlan`)
3. Execute: Run a full apply with concurrency gates active
4. Capture: The `ApplyReport` JSON output
5. Capture: The journal JSONL output (`.marksync/journal/<run-id>.jsonl`)
6. Capture: Any log output (stdout/stderr)
7. Inspect: Search for credential/token patterns in all captured outputs
8. Assert: **0 occurrences** of tokens/credentials in any output path

**Expected Outcome**:
- The operation-id (`op_<uuid-v7>`) carries no secret material
- `StalePlan` errors carry only `{ operationId, expiredAt }` — no tokens
- No credentials appear in `ApplyReport`, journal, or logs

**Postconditions**: None

**Notes / Clarifications**:
- This is AC-F6-1: "0 credential/token occurrences in any apply output path"
- The spec confirms: "the operation-id carries no secret material"
- Reuses the existing secrets-safety integration test infrastructure

---

#### TC-QG-001 - Quality gate: bun run check exits 0 (boundary check)

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-Q-1, NFR-7, NFR-10
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `src/domain/state/` (boundary check validation)
**Tags**: @quality-gate, @lint, @typecheck

**Preconditions**:
- All three pure domain gates are implemented under `src/domain/state/`
- `bun run check` script exists (lint + format:check + typecheck + test + check:boundaries)

**Steps**:
1. Execute: `bun run lint` — verify it exits 0
2. Execute: `bun run format:check` — verify it exits 0
3. Execute: `bun run typecheck` — verify it exits 0
4. Execute: `bun test tests/unit/domain/state/*.test.ts` — verify unit tests pass
5. Execute: `bun test tests/integration/app/concurrency-*.test.ts tests/integration/app/409-retry-policy.test.ts` — verify integration tests pass
6. Execute: `bun run check:boundaries` — verify it exits 0
7. Inspect: The boundary check output confirms `src/domain/state/` imports no infrastructure

**Expected Outcome**:
- `bun run check` exits 0 (all quality gates pass)
- The boundary check proves `src/domain/state/` (the new pure gates) imports no infrastructure
- All concurrency-related tests pass

**Postconditions**: None

**Notes / Clarifications**:
- This is AC-Q-1: "bun run check exits 0, including boundary check"
- NFR-7: "pure-domain testability — zero infrastructure imports under `src/domain/state/`"
- The spec emphasizes: the three pure gates "import no infrastructure (NFR-7 / boundary check)"

## 6. Environments and Test Data

### Required Environments

- **Local-dev**: All unit and integration tests run locally via `bun test`
- **Test**: CI workflow (`.github/workflows/ci.yml`) runs the fast loop (lint, typecheck, test)
- **Staging / Production**: Not applicable for this change (no E2E live-tenant wiring — NG-5)

### Test Data Generation and Cleanup

- **Unit tests**: Use synthetic operation-id fixtures in the form `op_019f56e4-18f5-759b-bfdf-5438918bb3bc` (valid UUID v7)
- **Integration tests**: Use enhanced `FakeTarget` with in-memory backing maps (no filesystem cleanup needed)
- **Per-test isolation**: Each test case creates a new `FakeTarget` instance (no state leakage)
- **No external data**: All test data is synthetic; no Confluence API calls for unit/integration tests

### Isolation Strategy

- **Unit tests**: Pure functions with no external dependencies — naturally isolated
- **Integration tests**: `FakeTarget` instances are isolated per test case; shared backing maps are explicitly scoped to the test
- **No parallel conflicts**: Tests are serial; no concurrent runs against the same fake target
- **Test cleanup**: `FakeTarget` instances are garbage-collected after each test (no explicit cleanup needed)

## 7. Automation Plan and Implementation Mapping

| TC ID | Test file to create or update | Execution command | Mocking requirements | Implementation status |
|-------|-------------------------------|-------------------|----------------------|----------------------|
| TC-CONC-001 | `tests/unit/domain/state/assert-operation-fresh.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-operation-fresh.test.ts` | None (pure function) | To Implement |
| TC-CONC-002 | `tests/unit/domain/state/assert-operation-fresh.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-operation-fresh.test.ts` | None (pure function) | To Implement |
| TC-CONC-003 | `tests/unit/domain/state/assert-operation-fresh.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-operation-fresh.test.ts` | None (pure function) | To Implement |
| TC-CONC-004 | `tests/unit/domain/state/assert-operation-fresh.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-operation-fresh.test.ts` | None (pure function) | To Implement |
| TC-CONC-005 | `tests/integration/app/concurrency-control-overlap.test.ts` (NEW) | `bun test tests/integration/app/concurrency-control-overlap.test.ts` | `FakeTarget` (enhanced) | To Implement |
| TC-CONC-006 | `tests/integration/app/concurrency-control-overlap.test.ts` (NEW) | `bun test tests/integration/app/concurrency-control-overlap.test.ts` | `FakeTarget` (enhanced, shared backing map) | To Implement |
| TC-EXPIRY-001 | `tests/unit/domain/state/assert-plan-not-expired.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-plan-not-expired.test.ts` | None (pure function) | To Implement |
| TC-EXPIRY-002 | `tests/unit/domain/state/assert-plan-not-expired.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-plan-not-expired.test.ts` | None (pure function) | To Implement |
| TC-EXPIRY-003 | `tests/unit/domain/state/assert-plan-not-expired.test.ts` (NEW) | `bun test tests/unit/domain/state/assert-plan-not-expired.test.ts` | None (pure function) | To Implement |
| TC-409-001 | `tests/unit/domain/state/decide-on-conflict.test.ts` (NEW) | `bun test tests/unit/domain/state/decide-on-conflict.test.ts` | None (pure function) | To Implement |
| TC-409-002 | `tests/unit/domain/state/decide-on-conflict.test.ts` (NEW) | `bun test tests/unit/domain/state/decide-on-conflict.test.ts` | None (pure function) | To Implement |
| TC-409-003 | `tests/unit/domain/state/decide-on-conflict.test.ts` (NEW) | `bun test tests/unit/domain/state/decide-on-conflict.test.ts` | None (pure function) | To Implement |
| TC-409-004 | `tests/unit/domain/state/decide-on-conflict.test.ts` (NEW) | `bun test tests/unit/domain/state/decide-on-conflict.test.ts` | None (pure function) | To Implement |
| TC-409-005 | `tests/unit/domain/state/decide-on-conflict.test.ts` (NEW) | `bun test tests/unit/domain/state/decide-on-conflict.test.ts` | None (pure function) | To Implement |
| TC-409-006 | `tests/integration/app/409-retry-policy.test.ts` (NEW) | `bun test tests/integration/app/409-retry-policy.test.ts` | `FakeTarget` (enhanced, 409-then-refreshed sequence) | To Implement |
| TC-409-007 | `tests/integration/app/409-retry-policy.test.ts` (NEW) | `bun test tests/integration/app/409-retry-policy.test.ts` | `FakeTarget` (enhanced, 409-then-refreshed sequence) | To Implement |
| TC-409-008 | `tests/integration/app/409-retry-policy.test.ts` (NEW) | `bun test tests/integration/app/409-retry-policy.test.ts` | `FakeTarget` (enhanced, 409-then-refreshed sequence) | To Implement |
| TC-ISO-001 | `tests/integration/app/concurrency-isolation.test.ts` (NEW) | `bun test tests/integration/app/concurrency-isolation.test.ts` | `FakeTarget` (enhanced) | To Implement |
| TC-ISO-002 | `tests/integration/app/concurrency-isolation.test.ts` (NEW) | `bun test tests/integration/app/concurrency-isolation.test.ts` | `FakeTarget` (enhanced) | To Implement |
| TC-CI-001 | `examples/ci/*.yml` + `examples/ci/README.md` (NEW) | Manual validation (YAML parsing, README review) | None | To Implement |
| TC-SEC-001 | `tests/integration/app/secrets-safety-integration.test.ts` (UPDATE) | `bun test tests/integration/app/secrets-safety-integration.test.ts` | `FakeTarget` (enhanced) | Existing — Update |
| TC-QG-001 | Quality gate execution (manual check) | `bun run check` | None | Manual — Verify |

**Test infrastructure enhancements (F-5)**:

| Enhancement | Location | Purpose | Implementation status |
|-------------|----------|---------|----------------------|
| `FakeTarget.getProperty` serves stored `marksync.metadata` | `tests/_helpers/fake-target.ts` | Enable operation-id comparison in integration tests | To Implement |
| `FakeTarget.putProperty` persists `marksync.metadata` | `tests/_helpers/fake-target.ts` | Enable runner B's write to be visible to runner A | To Implement |
| `FakeTarget` shared backing map constructor option | `tests/_helpers/fake-target.ts` | Model two runners on separate machines (NFR-REL-10) | To Implement |
| `FakeTarget` configurable 409-then-refreshed sequence | `tests/_helpers/fake-target.ts` | Enable 409 policy integration tests | To Implement |
| Reconcile `FakeTarget` with `TargetSystem` port drift | `tests/_helpers/fake-target.ts` | Fix pre-existing drift (spaceId, PageRestrictions mismatch) | To Implement |

**Notes on `FakeTarget` drift**:
- Current `FakeTarget` references `page.spaceId` and `PageRestrictions` shape that do NOT match the `TargetSystem` port (`Page` has no `spaceId`; `PageRestrictions` is `{ pageId, restricted }`)
- This pre-existing drift may surface as compile errors when the harness is enhanced
- The coder should reconcile the fake to the port (do not change the port)
- This is noted in the spec as a known pre-existing issue

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **R1**: `FakeTarget` enhancement complexity — shared backing map and 409-then-refreshed sequence may be tricky to implement | Medium | Low | Spec provides clear requirements; integration tests (TC-CONC-006, TC-409-006/007/008) validate the behavior. Start with single shared-state (TC-CONC-005) before moving to separate instances (TC-CONC-006). |
| **R2**: Pre-existing `FakeTarget` drift (spaceId, PageRestrictions) causes compile errors when enhanced | Low | High | Spec flags this explicitly; the coder should reconcile the fake to the port, not change the port. This is test-only code with no production impact. |
| **R3**: OQ-1 (plan-timestamp anchoring) resolution affects expiry test implementation | Low | Low | Both options (extract from runId vs. explicit createdAt) are additive; the expiry tests are agnostic to the source. The plan-writer resolves this before implementation. |
| **R4**: CI concurrency-group templates may need iteration for validity/clarity | Low | Low | AC-F5-1 validates YAML validity; the README can be refined based on human review. This is guidance, not runtime enforcement. |

### 8.2 Assumptions

- **A1**: The `StalePlan` error arm, `operationId` field, `stalePlanMinutes` config, and `generateUuidV7` are all pre-staged and verified present (spec §2.1 confirms these were read, not assumed).
- **A2**: GH-23 (sync engine) and GH-21 (Confluence adapter) are merged and their contracts are stable. This story consumes them as-is.
- **A3**: The `runId` is a UUID v7 (time-sortable) and `operationId` = `op_<runId>`. The embedded timestamp is the ordering basis.
- **A4**: The NFR-REL-5 BDD/E2E wiring is E5-S1's responsibility. This story's ACs are verified via integration tests against the enhanced fake target (NG-5 in spec).
- **A5**: `bun run check` includes a boundary check that validates `src/domain/state/` imports no infrastructure (NFR-7).

### 8.3 Open Questions

| ID | Question | Context | Status | Owner |
|----|----------|---------|--------|-------|
| OQ-1 | Should the stale-plan-expiry timestamp be extracted from the `runId` (UUID v7 time prefix) or added as an explicit `createdAt: string` (ISO) field on `Plan`? | Spec §17, §14 | **Minor design decision — defer to plan-writer** | Plan-writer (not blocking) |
| OQ-2 | How should `assertOperationFresh` handle malformed operation-id inputs (missing `op_` prefix, invalid UUID)? | TC-CONC-004 (defensive test) | Minor implementation detail; both "return ok" and "return err" satisfy the AC. | Coder (not blocking) |

**No blocking open questions**: OQ-1 is a minor design choice deferred to the plan-writer; OQ-2 is an implementation detail that doesn't affect the ACs.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | test-plan-writer (ADOS) | Initial test plan — all 9 ACs covered, 21 test scenarios planned. |

## 10. Test Execution Log

Populated during execution after implementation.

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |

---

## AUTHORING GUIDELINES

Authored by `@test-plan-writer` per the standard phase-3 test planning flow. Sources: the change specification `chg-GH-24-spec.md` (authoritative for F-#, AC-#, NFR-#, decisions, context), the story file `MS2-E3-S7--concurrency-control.md` (test matrix, CEO-resolved R1/Q1, invariant-naming note), the feature specification `doc/spec/features/feature-safe-publish.md` (cross-cutting AC NFR-REL-5, §3.1 "Concurrency control"), ADR-0006 (C-5/C-6, Verification Criteria for concurrency), the testing strategy `.ai/rules/testing-strategy.md` (tiers, coverage rules, guardrails), and existing test patterns (GH-23 sync engine tests, `FakeTarget` patterns). All requirements are derived from the spec — none invented. Every AC-# appears in the Coverage Overview with planned test coverage. TC-IDs follow the `TC-<FEATURE>-<NNN>` pattern with unique IDs: `CONC` (001-006), `EXPIRY` (001-003), `409` (001-008), `ISO` (001-002), `CI` (001), `SEC` (001), `QG` (001). No placeholders remain; all open questions are flagged in Section 8.

---

## VALIDATION CHECKLIST

- [x] `id` matches `chg-GH-24-test-plan`
- [x] `status` is "Proposed"
- [x] `created` and `last_updated` are ISO8601 UTC
- [x] `owners`, `service`, `labels`, `version_impact` match the spec
- [x] `links` include change_spec, testing_strategy
- [x] All sections present in order (1-10 + guidelines + checklist)
- [x] Coverage Overview includes all AC-# with TC mapping
- [x] Every TC-ID follows the pattern `TC-<FEATURE>-<NNN>`
- [x] Every TC-ID appears in: Scenario Index, Scenario Details, Automation Plan
- [x] Test types align with testing strategy (Unit + Integration, no BDD/E2E)
- [x] `FakeTarget` enhancements are explicitly planned
- [x] Pre-existing `FakeTarget` drift is flagged in Section 7
- [x] No implementation steps in the test plan (this is for testing, not coding)
- [x] All test scenarios use business language (not implementation detail)
- [x] NFR-REL-5/NFR-REL-10 are cited (not INV-SAFE-3)
- [x] OQ-1 and OQ-2 are documented in Section 8
- [x] No gaps identified: all 9 ACs have planned test coverage