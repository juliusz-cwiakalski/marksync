---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-29-test-plan
status: Updated
created: 2026-07-15T14:00:00Z
last_updated: 2026-07-15T16:30:00Z
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["test", "MS-0002", "MS2-E5", "priority:high", "ci", "bdd", "e2e"]
version_impact: none
summary: "Wire the BDD Gherkin tier and live-sandbox E2E harness — the two gaps in the 7-tier testing strategy. BDD drives real computePlan/applyPlan against mocked TargetSystem for the four lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1). E2E provides a guarded smoke test that skips without secrets and cleans up when present."
links:
  change_spec: ./chg-GH-29-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Quality Gate Wiring (All 6 Test Tiers)

## 1. Scope and Objectives

This test plan validates the wiring of two unwired test tiers in the 7-tier testing strategy: the Gherkin/BDD tier for lifecycle invariants and the live-sandbox E2E harness. The primary objective is to close the gaps where release-blocking safety invariants (INV-SAFE-1/2/3, INV-SEC-1) are not enforced through integration-level BDD paths, and the live-sandbox E2E gate is vacuously green. The BDD tier validates invariants by driving the real `computePlan`/`applyPlan` against a mocked `TargetSystem` port (honoring the over-mocking guardrail), while the E2E tier provides a real Confluence sandbox smoke test with guarded execution (skip without secrets) and run-scoped cleanup.

### 1.1 In Scope

- BDD feature files for the four lifecycle invariants (INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1)
- BDD step definitions driving the real sync engine against a mocked `TargetSystem` port
- `@cucumber/cucumber` devDependency and binding `bun run test:bdd` script
- Live-sandbox E2E harness with guarded smoke test (skip without secrets)
- Run-scoped cleanup for E2E-created pages
- Verification of the five already-wired tiers (unit, integration, golden, mermaid-DOM, e2e-mock)
- CI fast-loop and coverage gate verification

### 1.2 Out of Scope & Known Gaps

- BDD scenarios for `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) — already covered in integration tier per DEC-1
- Performance benchmark suite — deferred to MS-0003+
- Multi-space E2E testing — single dedicated sandbox space only
- Any changes to production source code under `src/` — pure test/CI infrastructure (DEC-3)
- Modifications to `run-e2e.yml`, `ci.yml` beyond making `test:bdd` binding — already correct
- Golden fixture changes — snapshot rules apply but no changes expected

## 2. References

- **Change Specification**: [chg-GH-29-spec.md](./chg-GH-29-spec.md) — authoritative requirements, ACs, decisions (DEC-1 through DEC-4)
- **PM Notes**: [chg-GH-29-pm-notes.yaml](./chg-GH-29-pm-notes.yaml) — tier-by-tier intake assessment and BDD-scope decision
- **Testing Strategy**: [.ai/rules/testing-strategy.md](.ai/rules/testing-strategy.md) — 7-tier model, over-mocking guardrail, CI wiring patterns
- **TDR-0004**: [doc/decisions/TDR-0004-testing-runner.md](../../decisions/TDR-0004-testing-runner.md) — runner decision, test-design guardrail
- **TDR-0007**: [doc/decisions/TDR-0007-gherkin-bdd-runner.md](../../decisions/TDR-0007-gherkin-bdd-runner.md) — cucumber choice, strict mode, standalone CLI
- **ADR-0006**: [doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) — invariant definitions (INV-SAFE-1/2/3)
- **Test Helpers**: `tests/_helpers/fake-target.ts` (FakeTarget implements TargetSystem), `tests/_helpers/fake-repository.ts`
- **Existing BDD Feature**: `tests/bdd/features/duplicate-uuid-fatal.feature` (INV-SAFE-3 — feature exists, step defs are new)
- **Reference Test Plan**: [chg-GH-81-test-plan.md](../2026-07-15--GH-81--mock-confluence-e2e/chg-GH-81-test-plan.md) — mock-e2e test plan format

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | BDD runner executes 4 invariant features and all pass at integration level | TC-BDD-001, TC-BDD-005 | Covered |
| AC-F2-1 | INV-SAFE-1: no silent overwrite of REMOTE_AHEAD/DIVERGED docs | TC-BDD-001, TC-BDD-002 | Covered |
| AC-F2-2 | INV-SAFE-2: no silent re-create of REMOTE_MISSING docs | TC-BDD-003, TC-BDD-004 | Covered |
| AC-F2-3 | INV-SAFE-3: duplicate-UUID fatal before any write (existing feature + new steps) | TC-BDD-005 | Covered |
| AC-F2-4 | INV-SEC-1: no secrets in any output path | TC-BDD-006 | Covered |
 | AC-F2-5 | Over-mocking guardrail: only adapter ports mocked (`TargetSystem` + `Repository`) | TC-BDD-001–006 (all BDD steps) | Covered |
| AC-1 | `test:bdd` step in CI is binding (non-zero exit on invariant regression) | TC-BDD-007 | Covered |
| AC-F3-1 | Live-sandbox E2E skips cleanly when MARKSYNC_E2E_* secrets absent | TC-E2E-001 | Covered |
| AC-F3-2 | Live-sandbox E2E runs create+read+delete round-trip and cleans up all pages | TC-E2E-002 | Covered |
| AC-F3-3 | run-e2e.yml workflow triggers correctly (schedule/label/dispatch) | TC-E2E-003 | Covered |
| AC-F4-1 | Five already-wired tiers verified green on a clean PR | TC-TIER-001–005 | Covered |
| AC-2 | `bun run check` is green (lint + format + typecheck + test + boundaries) | TC-CHECK-001 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Element | TC ID(s) | Coverage Notes |
|--------------|---------|----------|----------------|
| API-1 | `computePlan` function (real module) | TC-BDD-001–006 | Called by all BDD steps (real, not mocked) |
| API-2 | `applyPlan` function (real module) | TC-BDD-001–006 | Called by all BDD steps (real, not mocked) |
 | API-3 | `TargetSystem` port (mocked) | TC-BDD-001–006 | FakeTarget implements port (adapter port mock) |
| API-4 | `Repository` port (mocked) | TC-BDD-001–006 | FakeRepository provides deterministic Git fixtures (adapter port mock) |
| DM-1 | BDD Git fixtures | TC-BDD-001–006 | Deterministic fixtures via FakeRepository |
| DM-2 | E2E sandbox pages | TC-E2E-002 | Created and deleted per run |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Coverage Notes |
|--------|-------------|----------|----------------|
| NFR-CI-1 | BDD tier binding in fast loop (fails PR on invariant regression) | TC-BDD-007 | CI step validation |
| NFR-CI-2 | BDD tier runtime budget (≤ 30 s) | TC-BDD-001–006 | Suite timing verified |
| NFR-CI-3 | Live-sandbox skip-without-secrets (exit 0) | TC-E2E-001 | Guard logic tested |
| NFR-CI-4 | Live-sandbox run-with-secrets + cleanup | TC-E2E-002 | Round-trip + deletion tested |
| NFR-MAINT-1 | Over-mocking guardrail honored (0 mocked domain modules) | TC-BDD-001–006 | Step def review + structure |
| NFR-MAINT-2 | No production source changes | TC-CHECK-001 | Verified via AC-2 |
| NFR-MAINT-3 | Test-only dependency (@cucumber/cucumber) | TC-BDD-007 | Binary size unchanged |
| NFR-MAINT-4 | E2E sandbox hygiene (single space, concurrency-group 1) | TC-E2E-003 | Workflow validation |

## 4. Test Types and Layers

| Test Type / Layer | Framework | Root Directory | Pattern | Notes |
|-------------------|-----------|----------------|---------|-------|
| **Unit** | `bun:test` | `tests/unit/` | `*.test.ts` | NOT in scope for this change (existing) |
| **Integration** | `bun:test` + `Bun.serve` | `tests/integration/` | `*.test.ts` | NOT in scope (existing, verified via AC-F4-1) |
| **Golden fixture** | `bun:test` | `tests/golden/` | `*.test.ts` | NOT in scope (existing, verified via AC-F4-1) |
| **Mermaid-DOM** | `bun:test` + `happy-dom` | `tests/golden/mermaid` | `*.test.ts` | NOT in scope (existing, verified via AC-F4-1) |
| **E2E-Mock** | `bun:test` + `Bun.serve` | `tests/e2e-mock/` | `*.test.ts` | NOT in scope (existing from GH-81, verified via AC-F4-1) |
| **BDD/Gherkin** (NEW) | `@cucumber/cucumber` via `bun run test:bdd` | `tests/bdd/` | `*.feature`, steps in `tests/bdd/steps/*.ts` | Four invariant features; real engine + mock port only |
| **E2E-Live** (NEW) | Thin runner script | `tests/e2e/` | `*.test.ts` | Guarded smoke test; real adapter vs sandbox |

 **BDD tier characteristics (TC-BDD-001–007):**
- Uses `@cucumber/cucumber` standalone CLI invoked via `bun run test:bdd` (TDR-0007 C-2)
- Steps call real `computePlan` + `applyPlan` from `src/app/push-flow.ts` (no mocking of domain logic)
- Only adapter ports are mocked — `TargetSystem` via `FakeTarget` and `Repository` via `FakeRepository` (honoring the over-mocking guardrail)
- Deterministic Git fixtures via `FakeRepository` (tests/_helpers/fake-repository.ts)
- Strict mode and undefined-step failure enabled (release-blocking)
- CI fast-loop binding via `ci.yml` `test:bdd` step

**Live-sandbox E2E characteristics (TC-E2E-001–003):**
- Thin runner constructs real Confluence adapter against sandbox base URL
- Guarded execution: skips (exit 0) when any `MARKSYNC_E2E_*` secret is absent
- With secrets present: runs create+read+delete round-trip and deletes every created page
- Run-scoped cleanup (delete all created pages) with nightly sweep backstop
- Single dedicated space, concurrency-group 1, credentials in GitHub Actions secrets only

**Tier verification (TC-TIER-001–005, TC-CHECK-001):**
- Verification scenarios, not new tests — confirm existing tiers run green
- Coverage gate validation: lines ≥ 0.70, functions ≥ 0.80

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-BDD-001 | INV-SAFE-1: No Silent Overwrite - REMOTE_AHEAD Blocks | Happy Path | Critical | High | AC-F2-1, AC-F2-5 |
| TC-BDD-002 | INV-SAFE-1: No Silent Overwrite - DIVERGED Blocks | Happy Path | Critical | High | AC-F2-1, AC-F2-5 |
| TC-BDD-003 | INV-SAFE-2: No Silent Re-create - REMOTE_MISSING Blocks | Happy Path | Critical | High | AC-F2-2, AC-F2-5 |
| TC-BDD-004 | INV-SAFE-2: Zero CreatePage Calls for REMOTE_MISSING | Edge Case | Important | High | AC-F2-2, AC-F2-5 |
| TC-BDD-005 | INV-SAFE-3: Duplicate UUID Fatal Before Any Write | Negative | Critical | High | AC-F2-3, AC-F2-5 |
| TC-BDD-006 | INV-SEC-1: No Secrets in Output Paths | Negative | Critical | High | AC-F2-4, AC-F2-5 |
| TC-BDD-007 | BDD CI Binding - test:bdd Step Fails on Regression | Regression | Critical | High | AC-1, NFR-CI-1 |
| TC-E2E-001 | Live-Sandbox Guard - Skip Without Secrets | Edge Case | Important | High | AC-F3-1, NFR-CI-3 |
| TC-E2E-002 | Live-Sandbox Smoke - Create+Read+Delete Round-Trip | Happy Path | Critical | High | AC-F3-2, NFR-CI-4 |
| TC-E2E-003 | run-e2e.yml Workflow - Triggers and Secrets Wired | Regression | Important | High | AC-F3-3, NFR-MAINT-4 |
| TC-TIER-001 | Unit Tier Verification | Regression | Important | High | AC-F4-1 |
| TC-TIER-002 | Integration Tier Verification | Regression | Important | High | AC-F4-1 |
| TC-TIER-003 | Golden Fixture Tier Verification | Regression | Important | High | AC-F4-1 |
| TC-TIER-004 | Mermaid-DOM Tier Verification | Regression | Important | High | AC-F4-1 |
| TC-TIER-005 | E2E-Mock Tier Verification | Regression | Important | High | AC-F4-1 |
| TC-CHECK-001 | bun run check Green | Regression | Critical | High | AC-2 |

### 5.2 Scenario Details

#### TC-BDD-001 - INV-SAFE-1: No Silent Overwrite - REMOTE_AHEAD Blocks

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-F2-5, F-2, INV-SAFE-1, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/no-silent-overwrite.feature`, `tests/bdd/steps/no-silent-overwrite.steps.ts`
**Tags**: @bdd, @invariant, @safety

 **Preconditions**:
- FakeTarget implements `TargetSystem` port (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: one managed doc with remote state set to `REMOTE_AHEAD`

**Steps**:
1. Given a corpus with a document whose remote is in `REMOTE_AHEAD` state (FakeTarget configured to return page with higher version)
2. When `computePlan` runs (real module) without `--adopt`/`--rebind`
3. When `applyPlan` runs (real module) against FakeTarget
4. Then the plan result contains a Blocked entry for the drifted document
5. And FakeTarget received 0 `updatePage` calls (zero overwrite)
6. And FakeTarget received 0 `createPage` calls

**Expected Outcome**:
- The `REMOTE_AHEAD` document is classified as Blocked and never auto-overwritten
- Zero write operations reach the target
- Step definitions use only real domain modules + FakeTarget (over-mocking guardrail honored)

**Notes / Clarifications**:
- This is the primary INV-SAFE-1 scenario (no-silent-overwrite invariant)
- Remote-ahead state is simulated via FakeTarget returning a page with version > local base version
- The scenario uses deterministic fixtures (fixed UUID-v7) to avoid flakiness (RSK-3)

---

#### TC-BDD-002 - INV-SAFE-1: No Silent Overwrite - DIVERGED Blocks

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-F2-5, F-2, INV-SAFE-1, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/no-silent-overwrite.feature`, `tests/bdd/steps/no-silent-overwrite.steps.ts`
**Tags**: @bdd, @invariant, @safety

 **Preconditions**:
- FakeTarget implements `TargetSystem` port (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: one managed doc with remote body hash diverging from local (DIVERGED state)

**Steps**:
1. Given a corpus with a document whose remote body hash differs from local base (FakeTarget configured with divergent body)
2. When `computePlan` runs (real module) without `--adopt`/`--rebind`
3. When `applyPlan` runs (real module) against FakeTarget
4. Then the plan result contains a Blocked entry for the diverged document
5. And FakeTarget received 0 `updatePage` calls (zero overwrite)
6. And FakeTarget received 0 `createPage` calls

**Expected Outcome**:
- The `DIVERGED` document is classified as Blocked and never auto-overwritten
- Zero write operations reach the target
- Step definitions honor over-mocking guardrail (real state classifier, not mocked)

**Notes / Clarifications**:
- This is the secondary INV-SAFE-1 scenario (divergence variant)
- Divergence is detected by comparing local rendered body hash vs remote body hash
- Body hash comparison is done by the real state classifier (not mocked)

---

#### TC-BDD-003 - INV-SAFE-2: No Silent Re-create - REMOTE_MISSING Blocks

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, AC-F2-5, F-2, INV-SAFE-2, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/no-silent-recreate-remote-missing.feature`, `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts`
**Tags**: @bdd, @invariant, @safety

 **Preconditions**:
- FakeTarget implements `TargetSystem` port (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: one managed doc whose remote was deleted (FakeTarget returns RemoteMissing)

**Steps**:
1. Given a corpus with a managed page whose remote was deleted (FakeTarget.getPage returns err(RemoteMissing))
2. When `computePlan` runs (real module) without `--adopt`/`--rebind`
3. When `applyPlan` runs (real module) against FakeTarget
4. Then the plan result contains a Blocked entry for the `REMOTE_MISSING` document
5. And FakeTarget received 0 `createPage` calls (no silent re-create)

**Expected Outcome**:
- The `REMOTE_MISSING` document is Blocked and never silently re-created
- Zero `createPage` calls reach the target
- Step definitions drive real sync engine, only mock is FakeTarget

**Notes / Clarifications**:
- This is the primary INV-SAFE-2 scenario (no-silent-re-create invariant)
- Remote deletion is simulated via FakeTarget.getPage returning err(RemoteMissing)
- The invariant is enforced by the real state classifier + push flow (not mocked)

---

#### TC-BDD-004 - INV-SAFE-2: Zero CreatePage Calls for REMOTE_MISSING

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-2, AC-F2-5, F-2, INV-SAFE-2, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/no-silent-recreate-remote-missing.feature`, `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts`
**Tags**: @bdd, @invariant, @safety

 **Preconditions**:
- FakeTarget implements `TargetSystem` port with call tracking (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: multiple docs, at least one in `REMOTE_MISSING` state

**Steps**:
1. Given a corpus with 3 managed documents, one of which is `REMOTE_MISSING`
2. When `computePlan` runs (real module) without `--adopt`/`--rebind`
3. When `applyPlan` runs (real module) against FakeTarget
4. Then FakeTarget.createPageCalls.length is strictly less than total documents
5. And the `REMOTE_MISSING` document is not in the created pages list

**Expected Outcome**:
- The `REMOTE_MISSING` document is excluded from create operations
- Create call count reflects actual creates (not includes the blocked doc)
- This validates the zero-write assertion in a multi-document context

**Notes / Clarifications**:
- This is a quantitative assertion variant of INV-SAFE-2
- Validates that the blocked doc is not silently counted toward creates
- Uses FakeTarget's call tracking arrays for assertions

---

#### TC-BDD-005 - INV-SAFE-3: Duplicate UUID Fatal Before Any Write

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-3, AC-F2-5, F-2, INV-SAFE-3, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/duplicate-uuid-fatal.feature` (existing), `tests/bdd/steps/duplicate-uuid-fatal.steps.ts` (new)
**Tags**: @bdd, @invariant, @safety

 **Preconditions**:
- FakeTarget implements `TargetSystem` port with call tracking (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: two documents sharing the same `marksync.uuid`

**Steps**:
1. Given a corpus with two documents sharing the same `marksync.uuid` (fixture with duplicate UUID)
2. When `computePlan` runs (real module) — it aborts at the duplicate-UUID gate before any apply
3. Then the plan aborts with `DuplicateUuid` error (naming both source paths)
4. And `applyPlan` is never called (zero write operations)
5. And FakeTarget received 0 `createPage` calls
6. And FakeTarget received 0 `updatePage` calls

 **Expected Outcome**:
- Duplicate UUID detection halts the plan at `computePlan` time before any mutation
- `applyPlan` is never invoked (zero write operations reach the target)
- Error message is actionable (identifies both conflicting source paths)

 **Notes / Clarifications**:
- The feature file already exists from GH-18; this change wires the step definitions
- Step definitions drive real `computePlan` (which aborts on duplicate UUID); `applyPlan` is never reached
- This is a fatal invariant — no recovery path exists before fixing the source

---

#### TC-BDD-006 - INV-SEC-1: No Secrets in Output Paths

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-4, AC-F2-5, F-2, INV-SEC-1, NFR-MAINT-1
**Test Type(s)**: BDD/Gherkin
**Automation Level**: Automated
**Target Layer / Location**: `tests/bdd/features/no-secret-in-output.feature`, `tests/bdd/steps/no-secret-in-output.steps.ts`
**Tags**: @bdd, @invariant, @security

 **Preconditions**:
- FakeTarget implements `TargetSystem` port (adapter port mock)
- FakeRepository provides deterministic Git fixtures (adapter port mock)
- Corpus fixture: one managed doc with a secret sentinel planted in its Markdown content (e.g., `Don't leak this: SECRET_SENTINEL_xyz123`)

**Steps**:
1. Given a corpus with one managed document containing a secret sentinel in its body content (via `FakeRepository.setFile()`, mirroring TC-INTEGRATION-011 pattern)
2. When `computePlan` runs (real module)
3. When `applyPlan` runs (real module) against FakeTarget
4. Then the plan JSON contains no credential strings
5. Then the apply journal contains no credential strings
6. Then the lock file contains no credential strings
7. Then diagnostic messages contain no credential strings
8. Then `version.message` contains no credential strings
9. Then the cache contains no credential strings
10. And the real adapter (`ConfluenceTarget`/`ConfluenceClient`) is the mocked port, so credentials never enter `computePlan`/`applyPlan` — the invariant is validated through the content→render→plan→output path

 **Expected Outcome**:
- The secret sentinel planted in document content is absent from all output paths (plan, journal, lock, diagnostics, version message, cache)
- Redaction is applied before serialization for non-content output paths
- INV-SEC-1 is enforced at the integration level through the real render→plan→apply flow

**Notes / Clarifications**:
- This is the INV-SEC-1 invariant (no-secrets-in-output)
- **Injection pattern (proven):** the sentinel is planted in document content (Markdown source), not in config/provenance — credentials never enter `computePlan`/`applyPlan` (they live in the mocked `ConfluenceTarget`/`ConfluenceClient` adapter behind the `TargetSystem` port). The invariant is validated through the real content→render→plan→lock/journal/diagnostics/`version.message` path.
- **Reference shape:** mirrors `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011 (lines 92-202) — which plants a fake token in document body via `fakeRepo.setFile()` and asserts absence from Plan JSON, journal, ApplyReport, and `version.message`.
- Step definitions drive real sync engine; redaction is tested end-to-end

---

#### TC-BDD-007 - BDD CI Binding - test:bdd Step Fails on Regression

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-1, F-1, G-2, NFR-CI-1
**Test Type(s)**: Manual / CI-Config
**Automation Level**: Semi-automated (CI config validation)
**Target Layer / Location**: `.github/workflows/ci.yml`, `package.json`
**Tags**: @ci, @regression

**Preconditions**:
- CI workflow file is present at `.github/workflows/ci.yml`
- `package.json` has a `test:bdd` script
- Four invariant features exist under `tests/bdd/features/`

**Steps**:
1. Read `.github/workflows/ci.yml`
2. Assert a step named `test:bdd` exists in the fast-loop job
3. Assert the `test:bdd` step invokes `bun run test:bdd`
4. Read `package.json` and assert `test:bdd` script invokes cucumber-js (e.g., `bunx cucumber-js tests/bdd/features`)
5. Assert strict mode and undefined-step failure are enabled in the invocation (cucumber options)
6. Intentionally break one invariant scenario (e.g., invert an assertion in a step def)
7. Run `bun run test:bdd` locally
8. Assert the command exits non-zero (fails)

**Expected Outcome**:
- The `test:bdd` step is present in the CI fast loop
- The invocation is binding (fails on invariant regression)
- Strict mode and undefined-step failure are enabled
- A broken invariant causes non-zero exit

**Notes / Clarifications**:
- This is a CI configuration validation scenario
- The exact cucumber invocation form is validated at delivery (OQ-1 / DEC-2)
- The stub `test:bdd` is replaced by a real binding runner

---

#### TC-E2E-001 - Live-Sandbox Guard - Skip Without Secrets

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-1, F-3, G-4, NFR-CI-3
**Test Type(s)**: E2E-Live
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e/sandbox-guard.test.ts`
**Tags**: @e2e, @sandbox, @guard

**Preconditions**:
- Live-sandbox test harness exists under `tests/e2e/`
- No `MARKSYNC_E2E_*` environment variables are set

**Steps**:
1. Ensure all `MARKSYNC_E2E_*` env vars are unset (or at least one required var is missing)
2. Run `bun test tests/e2e/` (the guarded smoke test)
3. Assert the command exits 0 (skip, not fail)
4. Assert output contains a "secrets not configured, skipping" message

**Expected Outcome**:
- The guarded smoke test skips cleanly when secrets are absent
- Exit code is 0 (green in CI)
- Clear skip message is logged

**Notes / Clarifications**:
- This is the guard logic validation (AC-F3-1, NFR-CI-3)
- The guard treats the secret set as all-or-nothing (RSK-6)
- Allows `bun test tests/e2e/` to be green locally without secrets

---

#### TC-E2E-002 - Live-Sandbox Smoke - Create+Read+Delete Round-Trip

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-2, F-3, G-4, NFR-CI-4, NFR-MAINT-4
**Test Type(s)**: E2E-Live
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e/sandbox-smoke.test.ts`
**Tags**: @e2e, @sandbox, @smoke

**Preconditions**:
- All `MARKSYNC_E2E_*` environment variables are set (secrets present)
- Dedicated sandbox space is available
- `run-e2e.yml` workflow is configured (schedule/label/dispatch)

**Steps**:
1. Construct real Confluence adapter against sandbox base URL using `MARKSYNC_E2E_*` credentials
2. Create a test page in the dedicated space (capture the page ID)
3. Read the page back via the adapter
4. Assert the read page matches the created page (title, body)
5. Delete the page via the adapter
6. Attempt to read the deleted page and assert it's not found
7. Assert every page created during this run is deleted by the end of the run
8. Log created page IDs for orphan-detection backstop

**Expected Outcome**:
- Create+read+delete round-trip succeeds
- Every page created in the run is deleted by run-scoped cleanup
- 0 pages outlive the run (barring API failure, which is logged)
- Credentials are used correctly (auth succeeds)

**Notes / Clarifications**:
- This is the primary live-sandbox smoke test (AC-F3-2, NFR-CI-4)
- Cleanup is run-scoped (delete every created page at end of run)
- A nightly sweep is the backstop for orphaned pages (R2)
- Single dedicated space, concurrency-group 1 (NFR-MAINT-4)

---

#### TC-E2E-003 - run-e2e.yml Workflow - Triggers and Secrets Wired

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-3, F-3, G-4, NFR-MAINT-4
**Test Type(s)**: Manual / CI-Config
**Automation Level**: Semi-automated (CI config validation)
**Target Layer / Location**: `.github/workflows/run-e2e.yml`
**Tags**: @ci, @regression, @e2e

**Preconditions**:
- CI workflow file is present at `.github/workflows/run-e2e.yml`

**Steps**:
1. Read `.github/workflows/run-e2e.yml`
2. Assert the workflow has a schedule trigger (e.g., cron)
3. Assert the workflow has a `run-e2e` label trigger (`if: contains(github.event.pull_request.labels.*.name, 'run-e2e')`)
4. Assert the workflow has a `workflow_dispatch` trigger
5. Assert a concurrency group named `e2e-sandbox` exists with `cancel-in-progress: false`
6. Assert all required `MARKSYNC_E2E_*` secrets are referenced in env
7. Assert the workflow runs `bun test tests/e2e/`

**Expected Outcome**:
- The workflow triggers on schedule, label, and manual dispatch
- Concurrency group is configured correctly (no mid-write cancellation)
- All required secrets are wired
- The E2E tier is correctly integrated

**Notes / Clarifications**:
- This is a CI configuration validation scenario
- The workflow is NOT rewritten (per spec NG-6) — only verified correct
- Secrets stay out of the repo (GitHub Actions secrets only)

---

#### TC-TIER-001 - Unit Tier Verification

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/`
**Tags**: @tier, @verification, @unit

**Preconditions**:
- Unit tests exist under `tests/unit/`

**Steps**:
1. Run `bun test tests/unit/`
2. Assert exit code is 0
3. Assert coverage report is generated
4. Assert coverage meets thresholds (lines ≥ 0.70, functions ≥ 0.80)

**Expected Outcome**:
- Unit tier is green on a clean PR
- Coverage gate is satisfied

**Notes / Clarifications**:
- This is verification, not re-implementation (spec §F-4)
- If a defect is found, it is surfaced to PM, not fixed inline (DEC-3)

---

#### TC-TIER-002 - Integration Tier Verification

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/`
**Tags**: @tier, @verification, @integration

**Preconditions**:
- Integration tests exist under `tests/integration/`

**Steps**:
1. Run `bun test tests/integration/`
2. Assert exit code is 0
3. Assert Bun.serve mock tests pass

**Expected Outcome**:
- Integration tier is green on a clean PR

**Notes / Clarifications**:
- Verification only; defects surfaced to PM (DEC-3)

---

#### TC-TIER-003 - Golden Fixture Tier Verification

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/`
**Tags**: @tier, @verification, @golden

**Preconditions**:
- Golden fixture tests exist under `tests/golden/`

**Steps**:
1. Run `bun test tests/golden/` (without `--update-snapshots`)
2. Assert exit code is 0
3. Assert no snapshots require update

**Expected Outcome**:
- Golden fixture tier is green on a clean PR
- Snapshot updates are explicit (never in CI)

**Notes / Clarifications**:
- Snapshot rules apply: `--update-snapshots` is explicit, never in CI

---

#### TC-TIER-004 - Mermaid-DOM Tier Verification

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/mermaid`
**Tags**: @tier, @verification, @mermaid

**Preconditions**:
- Mermaid-DOM tests exist under `tests/golden/mermaid`
- `tests/mermaid.preload.ts` is registered in `bunfig.toml [test].preload`

**Steps**:
1. Run `bun test tests/golden/mermaid`
2. Assert exit code is 0
3. Verify `happy-dom` is registered via preload

**Expected Outcome**:
- Mermaid-DOM tier is green on a clean PR
- Preload registration is correct

**Notes / Clarifications**:
- Tier is already wired by GH-25; this is verification only

---

#### TC-TIER-005 - E2E-Mock Tier Verification

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/`, `.github/workflows/ci.yml`
**Tags**: @tier, @verification, @e2e-mock

**Preconditions**:
- E2E-mock tests exist under `tests/e2e-mock/` (from GH-81)
- CI workflow has an `e2e-mock` job

**Steps**:
1. Run `bun test tests/e2e-mock/`
2. Assert exit code is 0
3. Verify the `e2e-mock` job exists in `ci.yml`
4. Assert the job is secrets-free

**Expected Outcome**:
- E2E-mock tier is green on a clean PR
- CI job is correctly configured

**Notes / Clarifications**:
- Tier is already wired by GH-81; this is verification only
- The 7th tier was added after the story title was written

---

#### TC-CHECK-001 - bun run check Green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-2, G-5
**Test Type(s)**: Verification
**Automation Level**: Automated
**Target Layer / Location**: Root repo
**Tags**: @ci, @verification, @check

**Preconditions**:
- All test tiers are wired and runnable

 **Steps**:
1. Run `bun run lint` (assert exit 0)
2. Run `bun run format:check` (assert exit 0)
3. Run `bun run typecheck` (assert exit 0)
4. Run `bun run test` (unit+integration+golden+mermaid via `bun test`; assert exit 0)
5. Run `bun run check:boundaries` (assert exit 0)
6. Run `bun run check` — this chains the above steps (lint, format:check, typecheck, test, check:boundaries) and should exit 0
7. Note: `bun run check` does NOT run `test:bdd` — BDD binding is verified separately via TC-BDD-007 (the `test:bdd` CI step, AC-1)

**Expected Outcome**:
- All quality gates covered by `bun run check` are green on a clean PR (lint, format, typecheck, test unit+integration+golden+mermaid, boundaries)
- `bun run check` exits 0
- BDD tier is exercised separately (not via `check`)

**Notes / Clarifications**:
- This is the AC-2 validation (bun run check green)
- Confirms no production source changes (NFR-MAINT-2)
- The `bun run test` step covers unit, integration, golden, and mermaid-DOM tiers (via `bun test`), but NOT the BDD tier — BDD runs via the separate `test:bdd` command per TC-BDD-007

---

## 6. Environments and Test Data

### 6.1 Required Environments

| Environment | Purpose | Setup |
|-------------|---------|-------|
| **Local development** | BDD scenario development and debugging | Bun runtime, no external dependencies |
| **CI (GitHub Actions)** | Fast-loop regression gate (all tiers except live-sandbox) | Fast-loop `ci.yml` job, 0 secrets required for most tiers |
| **CI (GitHub Actions - live-sandbox)** | Separate gate for live-sandbox E2E | `run-e2e.yml` job, secrets required (MARKSYNC_E2E_*) |

### 6.2 Test Data Generation and Cleanup

**BDD Tier (TC-BDD-001–007):**
- **Markdown corpus fixtures**: Committed under `tests/bdd/fixtures/corpus/` with `marksync:uuid` front-matter
- **Mock remote state**: Configured via FakeTarget (page version, body hash, RemoteMissing responses)
- **Deterministic fixtures**: Fixed UUID-v7 values, no randomness (RSK-3)
- **Call tracking**: FakeTarget.createPageCalls, updatePageCalls arrays for assertions
- **Cleanup**: Each scenario instantiates a fresh FakeTarget to prevent state leakage

**Live-Sandbox E2E Tier (TC-E2E-001–003):**
- **Sandbox pages**: Ephemeral test pages created and deleted per run
- **Guard logic**: Skip if any `MARKSYNC_E2E_*` secret is absent (all-or-nothing)
- **Run-scoped cleanup**: Delete every page created in the run at the end of the run
- **Backstop**: Nightly sweep of the dedicated test space (story R2)
- **Concurrency**: Concurrency-group 1 to avoid inter-run version noise

**Tier Verification (TC-TIER-001–005, TC-CHECK-001):**
- **Existing fixtures**: Reuse existing test fixtures from each tier
- **No new data**: Verification only, no new test data required

### 6.3 Determinism Guarantees

- **No sleeps**: BDD scenarios are synchronous and deterministic (no network, no sleeps)
- **No randomness**: All IDs and versions are deterministic (fixed UUID-v7 fixtures)
- **State reset**: Each BDD scenario instantiates a fresh FakeTarget to prevent cross-test contamination
- **Wall-clock avoidance**: BDD steps assert on counts/states, never on wall-clock time (RSK-3)

## 7. Automation Plan and Implementation Mapping

 | TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-BDD-001 | `tests/bdd/features/no-silent-overwrite.feature` | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository (`Repository` port mock for Git fixtures) | To Implement |
| TC-BDD-002 | `tests/bdd/features/no-silent-overwrite.feature` | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository | To Implement |
| TC-BDD-003 | `tests/bdd/features/no-silent-recreate-remote-missing.feature` | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository | To Implement |
| TC-BDD-004 | `tests/bdd/features/no-silent-recreate-remote-missing.feature` | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository | To Implement |
| TC-BDD-005 | `tests/bdd/features/duplicate-uuid-fatal.feature` (existing) | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository | To Implement (step defs) |
| TC-BDD-006 | `tests/bdd/features/no-secret-in-output.feature` | `bun run test:bdd` | FakeTarget (`TargetSystem` port mock), FakeRepository | To Implement |
| TC-BDD-007 | `.github/workflows/ci.yml` (validation) | Manual review + CI job run | No mocks; validates CI configuration | To Implement |
| TC-E2E-001 | `tests/e2e/sandbox-guard.test.ts` | `bun test tests/e2e/` (no secrets) | No mocks; guard logic only | To Implement |
| TC-E2E-002 | `tests/e2e/sandbox-smoke.test.ts` | `bun test tests/e2e/` (with secrets) | Real Confluence adapter; no mocks | To Implement |
| TC-E2E-003 | `.github/workflows/run-e2e.yml` (validation) | Manual review + CI job run | No mocks; validates workflow configuration | To Implement |
| TC-TIER-001 | `tests/unit/` (existing) | `bun test tests/unit/` | Existing | Existing – No Change |
| TC-TIER-002 | `tests/integration/` (existing) | `bun test tests/integration/` | Existing | Existing – No Change |
| TC-TIER-003 | `tests/golden/` (existing) | `bun test tests/golden/` | Existing | Existing – No Change |
| TC-TIER-004 | `tests/golden/mermaid` (existing) | `bun test tests/golden/mermaid` | Existing (happy-dom) | Existing – No Change |
| TC-TIER-005 | `tests/e2e-mock/` (existing from GH-81) | `bun test tests/e2e-mock/` | Existing (Bun.serve) | Existing – No Change |
| TC-CHECK-001 | Root repo (verification) | `bun run check` | Existing | Existing – No Change |

**Shared test infrastructure** (to be implemented for BDD tier):
- `tests/bdd/features/` — four feature files (INV-SAFE-1/2/3, INV-SEC-1)
- `tests/bdd/steps/` — step definitions driving real `computePlan`/`applyPlan`
- `tests/bdd/fixtures/corpus/` — deterministic Markdown fixtures with `marksync:uuid` front-matter
- Reuse existing helpers: `tests/_helpers/fake-target.ts`, `tests/_helpers/fake-repository.ts`

**Shared test infrastructure** (to be implemented for E2E tier):
- `tests/e2e/sandbox-guard.test.ts` — guard logic (skip without secrets)
- `tests/e2e/sandbox-smoke.test.ts` — create+read+delete round-trip + cleanup
- `tests/e2e/helpers.ts` — adapter construction, cleanup helper

**CI integration** (to be verified/implemented):
- `.github/workflows/ci.yml` — verify `test:bdd` step is binding
- `.github/workflows/run-e2e.yml` — verify triggers, secrets, concurrency group (no rewrite per NG-6)
- `package.json` — add `@cucumber/cucumber` devDependency, update `test:bdd` script
- `bunfig.toml` — verify coverage thresholds (lines ≥ 0.70, functions ≥ 0.80)

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **RSK-1 (from spec): Cucumber + Bun interop friction** — `cucumber-js` is flaky or fails under the pinned Bun 1.2.23 | H | M | Validate the working invocation at delivery (OQ-1 / DEC-2); existing stub targets `bunx cucumber-js tests/bdd/features`; fall back to bun-native entry only if CLI is unworkable |
| **RSK-2 (from spec): E2E sandbox leaves orphaned pages** — a run crashes mid-write or cleanup fails | M | M | Run-scoped cleanup (delete every page created in the run) + nightly sweep backstop; log created page IDs on failure; concurrency-group 1 prevents inter-run version noise |
| **RSK-3 (from spec): BDD step defs need deterministic Git fixtures** — non-deterministic UUIDs/timestamps make scenarios flaky | M | M | Reuse FakeRepository (deterministic, already used by integration tier); use fixed UUID-v7 fixtures; assert on counts/states, never wall-clock |
| **RSK-4 (from spec): Over-mocking drift** — a step definition mocks the classifier/engine "to make the scenario easy," silently neutering the invariant | H | L | Call out the guardrail as a hard constraint (NFR-MAINT-1, spec DEC-4); code-review each step against the "mock only TargetSystem port" rule; sibling integration tests are the reference shape |
| **RSK-5 (from spec): A step definition reveals a genuine src/ bug mid-delivery** | H | L | DEC-3: do not fix src/ inline; STOP and surface to the PM as a separate change; the BDD scenario is recorded as failing-on-real-bug, not papered over |
| **RSK-6 (from spec): E2E skip logic leaks secrets or runs with partial credentials** | M | L | Treat the secret set as all-or-nothing: if any required MARKSYNC_E2E_* var is missing, skip entirely; never construct credentials from partial input |

### 8.2 Assumptions

- The existing `test:bdd` stub invocation (`bunx cucumber-js tests/bdd/features`) is the correct cucumber-js-under-Bun shape, validated at delivery (OQ-1 / DEC-2)
- `FakeTarget` and `FakeRepository` are sufficient to stand up mock remote state + deterministic Git fixtures for the four invariant scenarios (R3)
- The five already-wired tiers + CI fast loop + coverage gate are green on `main` and need only verification, not repair
- `run-e2e.yml`'s secret names and triggers are the single source of truth for the E2E env-var set
- The four `INV-*` invariants are the correct and complete BDD scope per TDR-0007 §70-73 and testing-strategy.md (DEC-1)
- BDD tier runtime budget ≤ 30 s (NFR-CI-2) is achievable with in-process mocked port (no network, no sleeps)

### 8.3 Open Questions

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 (from spec) | What is the exact, working `cucumber-js` invocation under the pinned Bun? | The existing stub targets `bunx cucumber-js tests/bdd/features`. If that CLI form is flaky under Bun 1.2.23, a bun-native entry is the fallback. | Resolvable at delivery (DEC-2); no decision-advisor input expected — empirical validate-or-adjust step |

 ## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Test Plan Writer | Initial test plan — 16 test cases covering all mandatory ACs, BDD invariant scenarios (TC-BDD-001–006), E2E guard+smoke+workflow (TC-E2E-001–003), tier verification (TC-TIER-001–005), and bun run check (TC-CHECK-001). |
| 1.1 | 2026-07-15 | Test Plan Writer | DoR iter-1 fixes: (F1) TC-BDD-006 INV-SEC-1 injection point corrected to document content (mirrors TC-INTEGRATION-011), removed config/provenance phrasing; (F2) adapter-port wording updated throughout to reflect both `TargetSystem` + `Repository` as mocked adapter ports; (F3) TC-CHECK-001 corrected to clarify `bun run check` does NOT chain `test:bdd` (covers lint/format/typecheck/test/boundaries only); (F4) TC-BDD-005 corrected to reflect that `applyPlan` is never reached (`computePlan` aborts at duplicate-UUID gate). |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| — | — | — | Not yet executed — this is the initial test plan |

---