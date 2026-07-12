---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-23-test-plan
status: Proposed
created: "2026-07-12"
last_updated: "2026-07-12"
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, application, orchestration, reliability, provenance]
version_impact: minor
summary: "Comprehensive test plan for the sync engine (computePlan, applyPlan, journal, link resolver, Repository port), ensuring zero silent overwrites (INV-SAFE-1), no silent re-creation of REMOTE_MISSING pages (INV-SAFE-2), duplicate-UUID fatal before writes (INV-SAFE-3), 409 Conflict surfaces as drift, semantic idempotency (second push writes 0), partial-apply recovery via journal replay, parent-first ordering, per-document isolation, and no secrets in output."
links:
  change_spec: ./chg-GH-23-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E3-S6] Sync engine — plan → apply → verify orchestration (computePlan dry-run, applyPlan parent-first isolated journaled, journal+replay, git Repository port, cross-page link resolver, provenance wiring)

## 1. Scope and Objectives

The sync engine is the orchestration capstone of the safe-publish trust wedge — it wires together document identity (GH-18), state/lock (GH-19), markdown pipeline (GH-20), Confluence adapter (GH-21), and drift classifier (GH-22) into the two use cases operators invoke: `marksync plan` (dry-run) and `marksync sync` (apply). This test plan ensures:

1. **Zero silent overwrites** — any plan entry classified `REMOTE_AHEAD`/`DIVERGED` → `applyPlan` performs 0 writes for that doc (INV-SAFE-1 / NFR-REL-1).
2. **No silent re-creation** — any plan entry classified `REMOTE_MISSING` → `applyPlan` performs 0 re-creates without `--adopt`/`--rebind` (INV-SAFE-2 / NFR-REL-6).
3. **Duplicate-UUID fatal before any write** — `computePlan` aborts with `DuplicateUuid` before emitting a plan (INV-SAFE-3 / NFR-REL-8).
4. **409 Conflict surfaces as drift** — a stale `baseVersion` producing 409 from the target is reported as drift, not retried (NFR-REL-5).
5. **Semantic idempotency** — a second unchanged push classifies every entry `NO_CHANGE` → `applyPlan` writes 0 pages (NFR-PERF-4).
6. **Partial-apply recoverability** — a crash after K of N docs leaves a journal with K entries; `replayJournal` resumes without duplicates (NFR-REL-7).
7. **Provenance wiring** — every applied page version's `message` is produced by the existing `formatVersionMessage` (NFR-REL-9).
8. **Parent-first ordering** — child-page create before its parent is reordered; the child's create succeeds.
9. **Per-document isolation** — one `Conflict` on doc A does not abort the run; doc B still applies.
10. **Lock + property atomicity** — after a successful per-doc apply, the lock is atomically saved AND the property is put.
11. **No secrets in output** — 0 credential/token occurrences in any output path (INV-SEC-1).
12. **Shell-injection safety** — malicious path/ref fuzz is rejected with 0 shell-execution surfaces (TDR-0003 C-4).

### 1.1 In Scope

- Pure `computePlan` use case (`src/app/push-flow.ts`) — branch gate → duplicate-UUID gate → discover → parse → render+hash → link-resolve → fetch remote → classify → emit `Plan`.
- `applyPlan` use case (`src/app/push-flow.ts`) — parent-first ordering, per-document isolation, journaling, provenance wiring, Conflict-as-drift, lock+property atomic update.
- The `Plan` / `PlanEntry` / `ApplyReport` types.
- Journal writer + `replayJournal` at `src/app/journal.ts`.
- Cross-page link resolver at `src/domain/hierarchy/link-resolver.ts`.
- Minimal `Repository` port + shell-git adapter at `src/infra/git/`.
- Provenance wiring: call `formatVersionMessage` and pass as `message` on `createPage`/`updatePage`.
- CLI wiring: `planCommand`/`syncCommand` become thin shells returning `CommandResult<Plan>`/`CommandResult<ApplyReport>`.
- Unit tests: `computePlan` fixtures, journal append/replay, link resolver, provenance wiring, parent-first ordering, duplicate-UUID gate, branch gate, shell-git path validation.
- Integration tests: `applyPlan` against `Bun.serve()` mock target (create/update/no-op/conflict/forbidden; move is out of scope for MS-0002), crash→replay, lock+property update, idempotency, per-document isolation.

### 1.2 Out of Scope & Known Gaps

- **The 409 retry/dedup/stale-plan-expiry logic** — E3-S7 (NG-1). This engine surfaces `Conflict`; E3-S7 decides retry-vs-abort.
- **Mermaid/attachment upload orchestration** — E4-S1/E4-S2 (NG-2). The engine calls asset-resolver hooks those stories provide.
- **Reverse sync** — MS-0005+ (NG-3).
- **The exact `version.message` length-limit spike** — DE-RISKED (NG-4, DEC-2). The formatter trims conservatively to 255.
- **Reimplementing provenance** — `formatVersionMessage` (GH-21) reused verbatim (NG-5, DEC-3).
- **Full `--adopt` workflows** — MS-0003 / `doctor` (NG-7, OQ-1). A minimal `--rebind` converting the block to a re-create is in scope.
- **BDD/Gherkin scenarios** — E5-S1 (INV-SAFE-1/2/3, INV-SEC-1). The engine exposes the hooks (test-injectable crash point, mock target) but does not deliver BDD tests.

## 2. References

- **Change specification**: `chg-GH-23-spec.md` — authoritative source for AC, decisions, edge cases, and NFRs.
- **Story file**: `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S6--sync-engine.md` — test matrix and AC list.
- **Testing strategy**: `.ai/rules/testing-strategy.md` — 6-tier strategy, coverage rules, and over-mocking guardrail.
- **Code style**: `.ai/rules/typescript.md` — module structure, naming, error handling, purity conventions.
- **Dependency decisions**: `ADR-0006` — state model, INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, decentralized 409 concurrency, no cross-page transaction.
- **Provenance decision**: `ADR-0010` — squash by default, bounded writes, `version.message` format.
- **Git adapter decision**: `TDR-0003` — shell-git behind `Repository` interface, C-4 injection controls.
- **Ubiquitous Language**: `doc/overview/ubiquitous-language.md` — UL terms for `computePlan`, `applyPlan`, `Plan`, `ApplyReport`, journal, parent-first, per-document isolation.
- **Existing test sibling**: `doc/changes/2026-07/2026-07-12--GH-22--drift-classifier/chg-GH-22-test-plan.md` — proven pattern for pure domain module tests.
- **Existing test helpers**: `tests/_helpers/` — repository of test utilities to reuse (mock factories, assertion helpers).

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | `REMOTE_AHEAD`/`DIVERGED` entry → `applyPlan` performs 0 writes for that doc; reports block (INV-SAFE-1) | TC-INTEGRATION-001, TC-INTEGRATION-002 | To Implement |
| AC-F1-2 | `REMOTE_MISSING` entry → `applyPlan` performs 0 re-creates; reports block (INV-SAFE-2) | TC-INTEGRATION-003 | To Implement |
| AC-F2-1 | Duplicate-UUID corpus → `computePlan` returns `err(DuplicateUuid)` before any write (INV-SAFE-3) | TC-UNIT-001, TC-INTEGRATION-010 | To Implement |
| AC-F3-1 | Stale `baseVersion` produces 409 `Conflict` → surfaces as drift, does NOT retry (NFR-REL-5) | TC-INTEGRATION-004 | To Implement |
| AC-F3-2 | Second unchanged push → every entry `NO_CHANGE` → `applyPlan` writes 0 pages (NFR-PERF-4) | TC-INTEGRATION-005 | To Implement |
| AC-F4-1 | Crash after K of N docs → journal has K entries; `replayJournal` resumes without duplicates (NFR-REL-7) | TC-INTEGRATION-006 | To Implement |
| AC-F5-1 | `version.message` produced by `formatVersionMessage`; over-limit trim deterministic (NFR-REL-9) | TC-UNIT-002 | To Implement |
| AC-F6-1 | Child-page create before parent → reordered parent-first; child's create succeeds | TC-UNIT-003 | To Implement |
| AC-F7-1 | Cross-page link resolves to target reference; unresolved → warning (no broken URL) | TC-UNIT-004 | To Implement |
| AC-F8-1 | One `Conflict` on doc A → doc A blocked, doc B still applies; run does NOT abort | TC-INTEGRATION-007 | To Implement |
| AC-F9-1 | Successful per-doc apply → lock atomically saved + property put; `reconcileWithProperty` agrees | TC-INTEGRATION-008 | To Implement |
| AC-F10-1 | No credential/token in any output path (journal, plan, version.message, apply report) | TC-UNIT-005, TC-UNIT-006, TC-INTEGRATION-011 | To Implement |
| AC-F11-1 | Non-allowed branch → `computePlan` returns `err(ForbiddenBranch)` before discovery | TC-UNIT-007 | To Implement |
| AC-F12-1 | Malicious path/ref fuzz → rejected with 0 shell-execution surfaces (TDR-0003 C-4) | TC-INTEGRATION-009 | To Implement |
| AC-Q-1 | `bun run check` exits 0 (lint+format+typecheck+test+boundaries) | TC-GATE-001 | To Implement |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| DM ID | Element | Coverage via TC ID(s) |
|-------|---------|----------------------|
| DM-1 | `Plan` type (`{ runId, operationId, entries[] }`) | All `computePlan` TCs (TC-UNIT-001, TC-UNIT-003, TC-UNIT-007) |
| DM-2 | `PlanEntry` type (`{ uuid, sourcePath, state, action, hashes }`) | All `computePlan` TCs |
| DM-3 | `ApplyReport` type (`{ runId, results[], writes, skips, blocks }`) | All `applyPlan` integration TCs |
| DM-4 | Journal entry (`{ ts, op, pageId, uuid, outcome }`) | TC-INTEGRATION-006 (crash→replay) |
| DM-5 | `Repository` port (`readCommitted`, `headSha`, `currentBranch`, commit-list hook) | TC-UNIT-007 (branch gate), TC-INTEGRATION-009 (shell-git safety) |
| DM-6 | Shell-git adapter (`Bun.spawn` with C-4 controls) | TC-INTEGRATION-009 |
| DM-7 | Link resolver (`resolveLink(sourcePath, targetPath, bindings)`) | TC-UNIT-004 |
| DM-8 | Error-model (no change) | All TCs reuse existing `MarkSyncError` arms (no new arms); malicious path/ref guards THROW (invariant violation), not `Result.err`. |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | Coverage via TC ID(s) |
|--------|-------------|----------------------|
| NFR-1 (NFR-REL-1) | Zero silent overwrites: `REMOTE_AHEAD`/`DIVERGED` → 0 writes | TC-INTEGRATION-001, TC-INTEGRATION-002 |
| NFR-2 (NFR-REL-6) | REMOTE_MISSING invariant: 0 re-creates without `--adopt`/`--rebind` | TC-INTEGRATION-003 |
| NFR-3 (NFR-REL-8) | Duplicate-UUID fatal before any write | TC-UNIT-001, TC-INTEGRATION-010 |
| NFR-4 (NFR-PERF-4) | Semantic idempotency: second unchanged push → 0 writes | TC-INTEGRATION-005 |
| NFR-5 (NFR-REL-7) | Partial-apply recoverability: crash→K entries→resume without duplicates | TC-INTEGRATION-006 |
| NFR-6 (NFR-REL-9) | Per-version provenance: `message` from `formatVersionMessage` | TC-UNIT-002 |
| NFR-7 (NFR-REL-5) | Concurrency safety: 409 surfaces as drift; engine does NOT retry | TC-INTEGRATION-004 |
| NFR-8 (NFR-SEC-1) | No secrets in output: 0 credential/token in any output path | TC-UNIT-005, TC-UNIT-006, TC-INTEGRATION-011 |
| NFR-9 | Parent-first ordering: child-before-parent reordered | TC-UNIT-003 |
| NFR-10 | Per-document isolation: one Conflict does NOT abort the run | TC-INTEGRATION-007 |
| NFR-11 | Lock + property atomicity: atomic saveLock + putProperty after apply | TC-INTEGRATION-008 |
| NFR-12 | Cross-page link resolution: `[x](other.md)` resolves or warns | TC-UNIT-004 |
| NFR-13 | Bounded writes: serialized (concurrency = 1 for MS-0002) | Implicit in all `applyPlan` integration TCs |
| NFR-14 | Branch restriction: `assertBranchAllowed` gates `computePlan` | TC-UNIT-007 |
| NFR-15 | Plan/diff before write: `computePlan` emits reviewable Plan, 0 writes | All `computePlan` TCs (pure, no writes) |
| NFR-16 | Adapter isolation: all Confluence REST v2/v1 behind `TargetSystem` port | All integration TCs use mock target, not direct REST |
| NFR-17 (TDR-0003 C-4) | Shell-injection safety: malicious fuzz rejected, 0 shell execution | TC-INTEGRATION-009 |
| NFR-18 | Quality gate: `bun run check` exits 0 | TC-GATE-001 |

## 4. Test Types and Layers

### 4.1 Tier 1 — Unit Tests (PRIMARY)

- **Framework**: `bun:test` (per TDR-0004).
- **Root directory**: `tests/unit/app/` (for `computePlan`, `applyPlan` partials), `tests/unit/domain/hierarchy/` (link resolver), `tests/unit/infra/git/` (shell-git path validation).
- **Coverage pattern**:
  - `compute-plan.test.ts` — `computePlan` pure pipeline fixtures (branch gate, duplicate-UUID gate, each SyncState → Action, parent-first ordering).
  - `journal.test.ts` — journal append/replay (filesystem in temp dir).
  - `link-resolver.test.ts` — `resolveLink` (resolved link, unresolved warning).
  - `provenance.test.ts` — `formatVersionMessage` wiring (assert called + result passed as `message`).
  - `shell-git.test.ts` — path validation (malicious inputs rejected without execution).
  - `branch-gate.test.ts` — `assertBranchAllowed` (forbidden branch → `err(ForbiddenBranch)`).
  - `secrets-safety.test.ts` — assert no credentials/tokens in output paths (plan JSON, journal, `version.message`).
- **Mocking**:
  - `Repository` port: fake/in-memory implementation (not the real shell-git adapter).
  - `TargetSystem` port: stub that returns fixture pages and renders bodies (not the real Confluence adapter).
  - **DO NOT MOCK**: `classify`, `actionFor`, `SyncState`, `Action`, `ContentHash`, `buildContentHash`, `loadLock`, `saveLock`, `assertBranchAllowed`, `detectDuplicateUuids`, `formatVersionMessage` (the engine calls these verbatim).
- **Execution**: `bun test tests/unit/` (part of `bun run test`).

### 4.2 Tier 2 — Integration Tests (PRIMARY)

- **Framework**: `bun:test` + `Bun.serve()` mock for the `TargetSystem` port.
- **Root directory**: `tests/integration/app/` (for end-to-end `computePlan` + `applyPlan`).
- **Purpose**: Validate `applyPlan` executes against a mock Confluence target with REAL `classify`/`actionFor` (no classifier mocking), validates 409 drift detection, crash→replay, lock+property atomic update, idempotency, per-document isolation.
- **Coverage pattern**:
  - `apply-plan-integration.test.ts` — `applyPlan` against `Bun.serve()` mock target (create/update/no-op/conflict/forbidden; move out of scope for MS-0002).
  - `crash-replay.test.ts` — test-injectable crash hook → journal has K entries → `replayJournal` resumes without duplicates.
  - `idempotency.test.ts` — second unchanged push → 0 writes (asserted via mock-target write counter).
  - `per-doc-isolation.test.ts` — one `Conflict` on doc A, doc B still applies.
  - `lock-property-atomicity.test.ts` — successful apply → `saveLock` + `putProperty` → `reconcileWithProperty` agrees.
  - `shell-git-safety-fuzz.test.ts` — malicious path/ref fuzz → throws (invariant violation) with 0 shell-execution surfaces.
  - `duplicate-uuid-fatal.test.ts` — corpus with duplicate UUIDs → `computePlan` returns `err(DuplicateUuid)` before any write (orchestration boundary validation).
  - `secrets-safety-integration.test.ts` — full `computePlan` + `applyPlan` flow → 0 fake token occurrences across Plan, journal, version.message, ApplyReport.
- **Mocking**:
  - `TargetSystem` port: `Bun.serve()` HTTP mock (fault injection for 409, 404, 403, 5xx).
  - `Repository` port: temp git repo (real shell-git adapter) for realistic behavior.
  - **DO NOT MOCK**: `classify`, `actionFor` (the engine's value is in handling REAL sync states), `loadLock`, `saveLock`, `assertBranchAllowed`, `detectDuplicateUuids`, `formatVersionMessage`, `reconcileWithProperty`.
- **Execution**: `bun test tests/integration/` (part of `bun run test`).

### 4.3 Tier 5 — BDD/Gherkin (DEFERRED)

- **Framework**: `@cucumber/cucumber` via `bun run test:bdd` (per TDR-0007).
- **Feature files**: `tests/bdd/features/` — deferred to E5-S1.
- **Purpose**: INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1 Gherkin scenarios driven by the engine's exposed hooks (test-injectable crash point, mock target seam).
- **Status**: Future-wired — this test plan notes the engine exposes the hooks for E5-S1 to drive BDD scenarios, but does not deliver BDD tests.

### 4.4 Quality Gate (BUN RUN CHECK)

- **Command**: `bun run check` (runs lint + format:check + typecheck + test + check:boundaries).
- **Execution**: Every CI push (`bun run check` green required).
- **Coverage**: AC-Q-1 ensures all quality checks pass.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-UNIT-001 | Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write | Negative | Critical | High | AC-F2-1 |
| TC-UNIT-002 | Provenance wiring: formatVersionMessage called and result passed as message on create/update | Happy Path | Important | High | AC-F5-1 |
| TC-UNIT-003 | Child-page create before parent → reordered parent-first; child's create succeeds | Edge Case | Important | High | AC-F6-1 |
| TC-UNIT-004 | Cross-page link resolver: resolved link returns page reference; unresolved → warning | Happy Path | Important | High | AC-F7-1 |
| TC-UNIT-005 | No secrets in output: 0 credential/token occurrences in plan JSON, journal, version.message | Negative | Critical | High | AC-F10-1 |
| TC-UNIT-006 | No secrets in output: 0 credential/token occurrences in ApplyReport JSON | Negative | Critical | High | AC-F10-1 |
| TC-UNIT-007 | Branch gate: non-allowed branch → computePlan returns err(ForbiddenBranch) before discovery | Negative | Critical | High | AC-F11-1 |
| TC-INTEGRATION-001 | REMOTE_AHEAD entry → applyPlan performs 0 writes; reports block (INV-SAFE-1) | Happy Path | Critical | High | AC-F1-1 |
| TC-INTEGRATION-002 | DIVERGED entry → applyPlan performs 0 writes; reports block (INV-SAFE-1) | Happy Path | Critical | High | AC-F1-1 |
| TC-INTEGRATION-003 | REMOTE_MISSING entry → applyPlan performs 0 re-creates; reports block (INV-SAFE-2) | Happy Path | Critical | High | AC-F1-2 |
| TC-INTEGRATION-004 | Stale baseVersion produces 409 Conflict → surfaces as drift, does NOT retry | Happy Path | Critical | High | AC-F3-1 |
| TC-INTEGRATION-005 | Second unchanged push → every entry NO_CHANGE → applyPlan writes 0 pages | Happy Path | Critical | High | AC-F3-2 |
| TC-INTEGRATION-006 | Crash after K of N docs → journal has K entries; replayJournal resumes without duplicates | Edge Case | Critical | High | AC-F4-1 |
| TC-INTEGRATION-007 | One Conflict on doc A → doc A blocked, doc B still applies; run does NOT abort | Edge Case | Critical | High | AC-F8-1 |
| TC-INTEGRATION-008 | Successful per-doc apply → lock atomically saved + property put; reconcileWithProperty agrees | Happy Path | Critical | High | AC-F9-1 |
| TC-INTEGRATION-009 | Malicious path/ref fuzz → rejected with throw, 0 shell-execution surfaces | Negative | Critical | High | AC-F12-1 |
| TC-INTEGRATION-010 | Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write (integration) | Negative | Critical | High | AC-F2-1 |
| TC-INTEGRATION-011 | No secrets in output: 0 credential/token occurrences across all outputs (integration) | Negative | Critical | High | AC-F10-1 |
| TC-GATE-001 | bun run check exits 0 (all quality checks pass) | Regression | Critical | High | AC-Q-1 |

### 5.2 Scenario Details

#### TC-UNIT-001 - Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F2-1, NFR-3, INV-SAFE-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/compute-plan.test.ts`
**Tags**: @backend, @negative, @invariant

**Preconditions**:
- Fake `Repository` port returning two documents with the same UUID but different paths.

**Steps**:
1. Construct fake `Repository` returning `{"doc-a.md": bytes-with-uuid-X, "doc-b.md": bytes-with-uuid-X}`.
2. Call `computePlan(config, lock, fakeRepo, stubTarget)`.
3. Assert the result is `err({ kind: "DuplicateUuid", uuid: "X", paths: ["doc-a.md", "doc-b.md"] })`.
4. Assert NO call was made to `stubTarget.createPage` or `stubTarget.updatePage` (0 writes).
5. Assert NO Plan was emitted (the function returns early after the duplicate-UUID gate).

**Expected Outcome**:
- `computePlan()` returns `{ ok: false, error: { kind: "DuplicateUuid", uuid, paths } }`.
- 0 writes to the target (the engine aborts before any classification or apply).
- No `Plan` is emitted (the duplicate-UUID gate is the first fatal gate after the branch gate).

**Notes / Clarifications**:
- INV-SAFE-3: duplicate UUID is fatal before any write.
- The duplicate-UUID gate runs after `assertBranchAllowed` and after document discovery (discovery via `Repository.readCommitted` must precede duplicate detection).
- The test uses a fake `Repository` (not the real shell-git adapter) to inject the duplicate condition.
- This test validates the fatal gate at the `computePlan` level; integration tests validate the same invariant at the `applyPlan` level.

---

#### TC-UNIT-002 - Provenance wiring: formatVersionMessage called and result passed as message on create/update

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F5-1, NFR-6, NFR-REL-9, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/provenance.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Stub `TargetSystem` port with `createPage` and `updatePage` spies.
- Stub `formatVersionMessage` returning a known string.

**Steps**:
1. Spy on `formatVersionMessage` to capture calls.
2. Construct a `Plan` with one `Update` entry (LOCAL_AHEAD).
3. Call `applyPlan(plan, stubTarget, lock, opts)`.
4. Assert `formatVersionMessage` was called with the correct input (head SHA, branch, path, included commits).
5. Assert `stubTarget.updatePage` was called with `message: formatVersionMessage(...)`.
6. Repeat for a `Create` entry (new page).
7. Assert `stubTarget.createPage` was called with `message: formatVersionMessage(...)`.

**Expected Outcome**:
- `formatVersionMessage` is called once per applied page (create/update).
- The formatted string is passed as `message` on `createPage`/`updatePage` requests.
- The formatted string starts with `marksync git` prefix + head SHA (per GH-21).

**Notes / Clarifications**:
- NFR-REL-9: per-version provenance.
- DEC-3: the engine calls the EXISTING `formatVersionMessage` (GH-21) — no reimplementation.
- The stub `TargetSystem` port is NOT the real Confluence adapter (unit test isolation).
- This test validates the wiring; the format itself is validated by GH-21's tests.

---

#### TC-UNIT-003 - Child-page create before parent → reordered parent-first; child's create succeeds

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F6-1, NFR-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/parent-first.test.ts`
**Tags**: @backend, @edge-case

**Preconditions**:
- `Plan` with two `Create` entries: child page A (parent = B), parent page B (parent = root), in wrong order (A before B).

**Steps**:
1. Construct a `Plan` with entries: `[{ uuid: "A", parentPageId: "B", action: "Create" }, { uuid: "B", parentPageId: "ROOT", action: "Create" }]`.
2. Call `applyPlan(plan, stubTarget, lock, opts)`.
3. Assert `stubTarget.createPage` was called for B (parent) before A (child).
4. Assert both creates succeeded (no 409 or 404 errors).

**Expected Outcome**:
- Parent page B is created before child page A.
- Both creates succeed (Confluence requires the parent to exist before creating a child).
- The `ApplyReport` contains 2 successful creates.

**Notes / Clarifications**:
- NFR-9: parent-first ordering.
- The engine builds a hierarchy graph in `computePlan` and reorders creates/moves in `applyPlan`.
- The stub `TargetSystem` port validates the ordering (parent called before child).
- This test is unit-level (stub target); integration tests validate ordering against a `Bun.serve()` mock.

---

#### TC-UNIT-004 - Cross-page link resolver: resolved link returns page reference; unresolved → warning

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-5, AC-F7-1, NFR-12
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/hierarchy/link-resolver.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Bindings map with `{"doc-b": "page-id-123"}`.
- Source document is `doc-a.md`.

**Steps**:
1. **Resolved case**: Call `resolveLink("doc-a.md", "doc-b.md", bindings)`.
2. Assert the result is `ok({ type: "resolved", pageId: "page-id-123" })`.
3. **Unresolved case**: Call `resolveLink("doc-a.md", "missing-doc.md", bindings)`.
4. Assert the result is `err({ kind: "UnresolvedLink", sourcePath: "doc-a.md", target: "missing-doc.md" })`.
5. Assert the warning is emitted (via a spy or callback).

**Expected Outcome**:
- Resolved link returns a page reference (`{ type: "resolved", pageId }`).
- Unresolved link returns `err(UnresolvedLink)` and emits a warning.
- No silently-broken URL is emitted (the engine never passes an unresolved link to the target).

**Notes / Clarifications**:
- NFR-12: cross-page link resolution.
- The link resolver is pure domain logic — no mocks needed.
- Unresolved links are warnings, not errors (the document still applies).
- The engine uses the resolved page reference to render Confluence internal links.

---

#### TC-UNIT-005 - No secrets in output: 0 credential/token occurrences in plan JSON, journal, version.message

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-F10-1, NFR-8, INV-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/secrets-safety.test.ts`
**Tags**: @backend, @negative, @security

**Preconditions**:
- Config with a token (injected via a fake credential provider, not in the plan output).
- `computePlan` returns a `Plan`.
- `applyPlan` writes a journal.

**Steps**:
1. Call `computePlan` with config containing a token.
2. Serialize the `Plan` to JSON.
3. Assert the JSON contains NO occurrences of the token string.
4. Call `applyPlan` with the plan.
5. Read the journal file (`.marksync/journal/<run-id>.jsonl`).
6. Assert the journal contains NO occurrences of the token string.
7. Assert each `version.message` passed to the target contains NO occurrences of the token string.

**Expected Outcome**:
- The `Plan` JSON contains 0 credential/token occurrences.
- The journal JSONL contains 0 credential/token occurrences.
- Every `version.message` contains 0 credential/token occurrences.
- Only non-sensitive metadata (pageId, uuid, operation) appears in outputs.

**Notes / Clarifications**:
- INV-SEC-1: no secrets in any output path.
- The engine never sees credentials (isolated in GH-17/GH-21); this test validates the isolation.
- The `CommandResult` redaction layer (ADR-0011) strips secret material before output.
- The journal records only `{ ts, op, pageId, uuid, outcome }` — no bodies, no tokens.

---

#### TC-UNIT-006 - No secrets in output: 0 credential/token occurrences in ApplyReport JSON

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F10-1, NFR-8, INV-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/secrets-safety.test.ts`
**Tags**: @backend, @negative, @security

**Preconditions**:
- Config with a token.
- `applyPlan` returns an `ApplyReport`.

**Steps**:
1. Call `applyPlan` with config containing a token.
2. Serialize the `ApplyReport` to JSON.
3. Assert the JSON contains NO occurrences of the token string.

**Expected Outcome**:
- The `ApplyReport` JSON contains 0 credential/token occurrences.
- Only non-sensitive metadata (runId, results with outcomes, aggregate counts) appears.

**Notes / Clarifications**:
- INV-SEC-1: no secrets in any output path.
- Complements TC-UNIT-005 (covers Plan, journal, version.message; this covers ApplyReport).
- The `ApplyReport` is the CLI-visible output; it must be redaction-safe.

---

#### TC-UNIT-007 - Branch gate: non-allowed branch → computePlan returns err(ForbiddenBranch) before discovery

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F11-1, NFR-14
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/branch-gate.test.ts`
**Tags**: @backend, @negative, @gate

**Preconditions**:
- Config with `allowedBranches: ["main", "release/**"]`.
- Fake `Repository` port returning `currentBranch() = "feature/test"`.

**Steps**:
1. Call `computePlan(config, lock, fakeRepo, stubTarget)`.
2. Assert the result is `err({ kind: "ForbiddenBranch", branch: "feature/test", allowed: ["main", "release/**"] })`.
3. Assert NO call was made to `fakeRepo.readCommitted` (0 discovery reads).

**Expected Outcome**:
- `computePlan()` returns `{ ok: false, error: { kind: "ForbiddenBranch", branch, allowed } }`.
- 0 reads from the `Repository` port (the branch gate is the first check).
- No `Plan` is emitted (the engine aborts before discovery).

**Notes / Clarifications**:
- NFR-14: branch restriction.
- The branch gate is the first step in `computePlan` (before any discovery or classification).
- This test validates the gate using a fake `Repository` (not the real shell-git adapter).
- Integration tests validate the same behavior with the real shell-git adapter.

---

#### TC-INTEGRATION-001 - REMOTE_AHEAD entry → applyPlan performs 0 writes; reports block (INV-SAFE-1)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, AC-F1-1, NFR-1, INV-SAFE-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/apply-plan-integration.test.ts`
**Tags**: @backend, @integration, @invariant

**Preconditions**:
- Lock with one binding: `{ uuid: "doc-a", pageId: "123", sourceCommit: "base-sha" }`.
- Mock `TargetSystem` port (`Bun.serve()`) returning a page with `version = 2` (ahead of base's `version = 1`).
- Real `classify`/`actionFor` (NOT mocked).

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Assert the `Plan` has one entry with `state: REMOTE_AHEAD` and `action: Block(Conflict)`.
3. Call `applyPlan(plan, mockTarget, lock, opts)`.
4. Assert NO call was made to `mockTarget.updatePage` (0 writes for the blocked doc).
5. Assert the `ApplyReport` contains 1 block and 0 writes.
6. Assert the block carries the correct error (`{ kind: "Conflict", pageId, baseVersion, remoteVersion }`).

**Expected Outcome**:
- `computePlan()` classifies the doc as `REMOTE_AHEAD` → `Block(Conflict)`.
- `applyPlan()` skips the blocked doc (0 writes).
- The `ApplyReport` reports the block.
- INV-SAFE-1: zero silent overwrites.

**Notes / Clarifications**:
- Integration test uses the REAL `classify`/`actionFor` (not mocked) — the engine's value is in handling real sync states.
- The mock `TargetSystem` port is `Bun.serve()` (not a stub) — validates the adapter boundary.
- This is one of the two INV-SAFE-1 paths (see TC-INTEGRATION-002 for DIVERGED).

---

#### TC-INTEGRATION-002 - DIVERGED entry → applyPlan performs 0 writes; reports block (INV-SAFE-1)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, AC-F1-1, NFR-1, INV-SAFE-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/apply-plan-integration.test.ts`
**Tags**: @backend, @integration, @invariant

**Preconditions**:
- Lock with one binding: `{ uuid: "doc-a", pageId: "123", sourceCommit: "base-sha" }`.
- Local document with new content (changed vs base).
- Mock `TargetSystem` port returning a page with different content (also changed vs base, `version = 2`).
- Real `classify`/`actionFor` (NOT mocked).

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Assert the `Plan` has one entry with `state: DIVERGED` and `action: Block(Conflict)`.
3. Call `applyPlan(plan, mockTarget, lock, opts)`.
4. Assert NO call was made to `mockTarget.updatePage` (0 writes for the blocked doc).
5. Assert the `ApplyReport` contains 1 block and 0 writes.
6. Assert the block carries the correct error (`{ kind: "Conflict", pageId, baseVersion, remoteVersion }`).

**Expected Outcome**:
- `computePlan()` classifies the doc as `DIVERGED` → `Block(Conflict)`.
- `applyPlan()` skips the blocked doc (0 writes).
- The `ApplyReport` reports the block.
- INV-SAFE-1: zero silent overwrites.

**Notes / Clarifications**:
- Integration test uses the REAL `classify`/`actionFor` (not mocked).
- The mock `TargetSystem` port is `Bun.serve()` — validates the adapter boundary.
- This is the second INV-SAFE-1 path (see TC-INTEGRATION-001 for REMOTE_AHEAD).

---

#### TC-INTEGRATION-003 - REMOTE_MISSING entry → applyPlan performs 0 re-creates; reports block (INV-SAFE-2)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, AC-F1-2, NFR-2, INV-SAFE-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/apply-plan-integration.test.ts`
**Tags**: @backend, @integration, @invariant

**Preconditions**:
- Lock with one binding: `{ uuid: "doc-a", pageId: "123", sourceCommit: "base-sha" }`.
- Mock `TargetSystem` port returning 404 (remote missing).
- Real `classify`/`actionFor` (NOT mocked).

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Assert the `Plan` has one entry with `state: REMOTE_MISSING` and `action: Block(RemoteMissing)`.
3. Call `applyPlan(plan, mockTarget, lock, opts)` (without `--adopt`/`--rebind`).
4. Assert NO call was made to `mockTarget.createPage` (0 re-creates for the blocked doc).
5. Assert the `ApplyReport` contains 1 block and 0 writes.
6. Assert the block carries the correct error (`{ kind: "RemoteMissing", pageId }`).

**Expected Outcome**:
- `computePlan()` classifies the doc as `REMOTE_MISSING` → `Block(RemoteMissing)`.
- `applyPlan()` skips the blocked doc (0 re-creates).
- The `ApplyReport` reports the block.
- INV-SAFE-2: no silent re-creation of remotely-deleted managed pages.

**Notes / Clarifications**:
- Integration test uses the REAL `classify`/`actionFor` (not mocked).
- The mock `TargetSystem` port returns 404 (simulating remote deletion).
- A minimal `--rebind` flag converting the block to a re-create is in scope (tested separately).

---

#### TC-INTEGRATION-004 - Stale baseVersion produces 409 Conflict → surfaces as drift, does NOT retry

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F3-1, NFR-7, NFR-REL-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/apply-plan-integration.test.ts`
**Tags**: @backend, @integration, @concurrency

**Preconditions**:
- Lock with one binding: `{ uuid: "doc-a", pageId: "123", pageVersion: 1, sourceCommit: "base-sha" }`.
- Local document with new content.
- Mock `TargetSystem` port returning a page with `version = 2` (advanced between plan-time and apply-time).
- Real `classify`/`actionFor` (NOT mocked).

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Assert the `Plan` has one entry with `state: LOCAL_AHEAD` and `action: Update` (at plan-time, remote is `version = 1`).
3. Modify the mock target to return `version = 2` (simulate remote advancement).
4. Call `applyPlan(plan, mockTarget, lock, opts)`.
5. Assert `mockTarget.updatePage` was called with `baseVersion: 1` (stale).
6. Assert the mock target returns 409 Conflict.
7. Assert `applyPlan` surfaces the conflict as drift (adds a block to the `ApplyReport`).
8. Assert `applyPlan` does NOT retry the update (only 1 call to `updatePage`).

**Expected Outcome**:
- `applyPlan()` detects the 409 `Conflict` and surfaces it as drift in the `ApplyReport`.
- `applyPlan()` does NOT retry (the retry policy is E3-S7's concern).
- NFR-REL-5: concurrency safety — the older plan does not overwrite the newer.

**Notes / Clarifications**:
- Integration test uses fault injection (409 from mock target) — allowed per testing-strategy.md.
- The engine's job is to surface the conflict, not resolve it (DEC-6).
- This test validates the engine respects the 409 and reports drift; E3-S7 validates retry/dedup.

---

#### TC-INTEGRATION-005 - Second unchanged push → every entry NO_CHANGE → applyPlan writes 0 pages

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, AC-F3-2, NFR-4, NFR-PERF-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/idempotency.test.ts`
**Tags**: @backend, @integration, @idempotency

**Preconditions**:
- Lock with N bindings (e.g., 3 docs).
- First push succeeds (all docs created/updated).
- Mock `TargetSystem` port with a write counter.

**Steps**:
1. First push: call `computePlan` + `applyPlan`.
2. Reset the mock target's write counter to 0.
3. Second push: call `computePlan` (no changes to local docs or remote).
4. Assert the `Plan` has N entries, all with `state: NO_CHANGE` and `action: NoOp`.
5. Call `applyPlan(plan, mockTarget, lock, opts)`.
6. Assert the write counter remains 0 (NO calls to `createPage` or `updatePage`).
7. Assert the `ApplyReport` has N skips (noop) and 0 writes.

**Expected Outcome**:
- Second unchanged push classifies every entry `NO_CHANGE` → `NoOp`.
- `applyPlan` skips every `NoOp` entry (0 writes).
- NFR-PERF-4: semantic idempotency — second push writes 0 pages.

**Notes / Clarifications**:
- Integration test uses the REAL `classify`/`actionFor` (not mocked) — validates end-to-end idempotency.
- The mock target's write counter asserts 0 writes (not just no errors).
- This test is the primary validation of NFR-PERF-4.

---

#### TC-INTEGRATION-006 - Crash after K of N docs → journal has K entries; replayJournal resumes without duplicates

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-3, AC-F4-1, NFR-5, NFR-REL-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/crash-replay.test.ts`
**Tags**: @backend, @integration, @crash-safety

**Preconditions**:
- Lock with N bindings (e.g., 3 docs).
- Test-injectable crash hook (e.g., `opts.crashAfter = 2`).
- Mock `TargetSystem` port.
- Temp dir for the journal (`.marksync/journal/<run-id>.jsonl`).

**Steps**:
1. Call `applyPlan(plan, mockTarget, lock, { crashAfter: 2 })`.
2. Assert the function crashes (throws) after processing 2 docs.
3. Read the journal file (`.marksync/journal/<run-id>.jsonl`).
4. Assert the journal has exactly 2 entries (the 2 successfully-applied docs).
5. Call `replayJournal(runId)`.
6. Assert `replayJournal` returns the 2 completed ops (as a set of pageIds or UUIDs).
7. Simulate recovery: recompute the plan and skip the journaled ops.
8. Assert the re-run applies only the remaining (N−K) docs (no duplicates).

**Expected Outcome**:
- Crash after K of N docs leaves a journal with K entries.
- `replayJournal` returns the K completed ops.
- Recovery resumes without duplicates (journaled ops are not re-applied).
- NFR-REL-7: partial-apply recoverability.

**Notes / Clarifications**:
- The crash hook is test-injectable (not in production code).
- Journal appends immediately BEFORE lock-update (crash safety).
- `replayJournal` is consumed by E4-S4 repair-state (out of scope for this test, but the function exists).
- This test validates the engine exposes the hook for E5-S1 BDD scenarios.

---

#### TC-INTEGRATION-007 - One Conflict on doc A → doc A blocked, doc B still applies; run does NOT abort

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F8-1, NFR-10
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/per-doc-isolation.test.ts`
**Tags**: @backend, @integration, @isolation

**Preconditions**:
- Lock with 2 bindings: doc A (`REMOTE_AHEAD`), doc B (`LOCAL_AHEAD`).
- Mock `TargetSystem` port returning doc A at `version = 2` (ahead), doc B at `version = 1`.
- Real `classify`/`actionFor` (NOT mocked).

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Assert the `Plan` has 2 entries: A → `Block(Conflict)`, B → `Update`.
3. Call `applyPlan(plan, mockTarget, lock, opts)`.
4. Assert `mockTarget.updatePage` was called ONCE (for doc B only, not for doc A).
5. Assert the `ApplyReport` contains 1 block (doc A) and 1 write (doc B).
6. Assert the function returns success (does NOT throw or abort).

**Expected Outcome**:
- Doc A (blocked) is skipped (0 writes).
- Doc B (update) is applied (1 write).
- The run does NOT abort on doc A's failure.
- NFR-10: per-document isolation.

**Notes / Clarifications**:
- Integration test uses the REAL `classify`/`actionFor` (not mocked).
- Per-document isolation is critical because Confluence has no cross-page transaction (ADR-0006 fixed constraint).
- The `ApplyReport` aggregates per-doc outcomes so the operator sees what applied and what was blocked.

---

#### TC-INTEGRATION-008 - Successful per-doc apply → lock atomically saved + property put; reconcileWithProperty agrees

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F9-1, NFR-11
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/lock-property-atomicity.test.ts`
**Tags**: @backend, @integration, @atomicity

**Preconditions**:
- Lock with one binding: `{ uuid: "doc-a", pageId: "123", sourceCommit: "base-sha" }`.
- Local document with new content.
- Mock `TargetSystem` port returning doc A at `version = 1`.
- Real `classify`/`actionFor`/`reconcileWithProperty` (NOT mocked).
- Temp dir for the lock file.

**Steps**:
1. Call `computePlan(config, lock, repo, mockTarget)`.
2. Call `applyPlan(plan, mockTarget, lock, opts)`.
3. Assert `mockTarget.updatePage` was called once.
4. Assert `mockTarget.putProperty` was called with `pageId: "123"`, `key: "marksync.metadata"`, and the updated binding.
5. Read the lock file from disk.
6. Assert the lock file was updated with the new binding (`sourceCommit` updated).
7. Call `reconcileWithProperty` with the updated lock and the property value.
8. Assert `reconcileWithProperty` returns `ok()` (agrees).

**Expected Outcome**:
- After a successful per-doc apply, the lock is atomically saved (`saveLock`).
- The `marksync.metadata` property is put (`putProperty`).
- `reconcileWithProperty` agrees on the updated binding (no cross-check error).
- NFR-11: lock + property atomicity.

**Notes / Clarifications**:
- Integration test uses the REAL `reconcileWithProperty` (not mocked).
- `saveLock` is atomic via temp file + rename (GH-19).
- `putProperty` is called after `saveLock` (property is the cross-check, not the authoritative source).
- This test validates the per-doc consistency invariant.

---

#### TC-INTEGRATION-009 - Malicious path/ref fuzz → rejected with throw, 0 shell-execution surfaces

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F12-1, NFR-17, TDR-0003 C-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/shell-git-safety-fuzz.test.ts`
**Tags**: @backend, @integration, @security

**Preconditions**:
- Real shell-git adapter (`src/infra/git/shell-git.ts`) configured for a temp git repo.
- Fuzz fixtures: malicious paths/refs containing `../`, `;`, backticks, `$()`, `\n`, `\0`, absolute paths.

**Steps**:
1. For each malicious path fuzz fixture:
    2. Assert `expect(() => shellGit.readCommitted("HEAD", [maliciousPattern])).toThrow()` (invariant violation).
    3. Assert NO shell execution occurs (e.g., no files outside the repo are accessed).
    4. Assert NO `Bun.spawn` call is made (the guard throws before reaching the spawn).
5. For each malicious ref fuzz fixture:
    6. Assert `expect(() => shellGit.headSha(maliciousRef)).toThrow()` or `expect(() => shellGit.currentBranch()).toThrow()`.
    7. Assert NO shell execution occurs.
    8. Assert NO `Bun.spawn` call is made.

**Expected Outcome**:
- Every malicious path/ref fixture is rejected with a throw (invariant violation).
- NO shell execution surfaces occur (no file system access outside the repo, no command injection).
- The guard throws BEFORE any `Bun.spawn` call — zero shell-execution surfaces.
- NFR-17 / TDR-0003 C-4: shell-injection safety.

**Notes / Clarifications**:
- Integration test uses the REAL shell-git adapter (not mocked) — validates the actual injection controls.
- The guard throws (invariant violation) because the error model has no `BadPath`/`BadRef` arms (DM-8/NG-6 forbid adding them).
- The four layered controls are: (1) args array via `Bun.spawn`, (2) `--` before paths, (3) repo-relative path validation, (4) non-interactive env (`GIT_TERMINAL_PROMPT=0`).
- This test validates TDR-0003's verification criterion for shell-injection safety — the safety property (malicious input is rejected without shell execution) is unchanged; only the mechanism changes (throw, not Result.err).

---

#### TC-INTEGRATION-010 - Duplicate-UUID corpus → computePlan returns err(DuplicateUuid) before any write (integration)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F2-1, NFR-3, INV-SAFE-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/duplicate-uuid-fatal.test.ts`
**Tags**: @backend, @integration, @invariant

**Preconditions**:
- In-memory `Repository` with two documents sharing the same UUID.
- Stub `TargetSystem` port with a `createPage`/`updatePage` spy to track calls.
- Real `detectDuplicateUuids` (NOT mocked).

**Steps**:
1. Construct in-memory `Repository` returning `{"doc-a.md": bytes-with-uuid-X, "doc-b.md": bytes-with-uuid-X}`.
2. Call `computePlan(config, lock, inMemoryRepo, stubTarget)`.
3. Assert the result is `err({ kind: "DuplicateUuid", uuid: "X", paths: ["doc-a.md", "doc-b.md"] })`.
4. Assert NO call was made to `stubTarget.createPage` or `stubTarget.updatePage` (0 writes).
5. Assert NO Plan was emitted (the function returns early after the duplicate-UUID gate).

**Expected Outcome**:
- `computePlan()` returns `{ ok: false, error: { kind: "DuplicateUuid", uuid, paths } }`.
- 0 writes to the target (the engine aborts before any classification or apply).
- No `Plan` is emitted (the duplicate-UUID gate is the first fatal gate after the branch gate).

**Notes / Clarifications**:
- INV-SAFE-3: duplicate UUID is fatal before any write.
- Integration-level confirmation that the fatal gate fires at the orchestration boundary.
- Uses REAL `detectDuplicateUuids` (not mocked) per over-mocking guardrail.
- Only the `TargetSystem` and `Repository` ports are faked (allowed per testing-strategy.md).
- Complements TC-UNIT-001 (unit-level validation) by testing at the `computePlan` orchestration boundary.

---

#### TC-INTEGRATION-011 - No secrets in output: 0 credential/token occurrences across all outputs (integration)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, AC-F10-1, NFR-8, INV-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/app/secrets-safety-integration.test.ts`
**Tags**: @backend, @integration, @security

**Preconditions**:
- Config with a known fake token string (e.g., `"FAKE_TOKEN_xyz123"`).
- `Bun.serve()` mock `TargetSystem` port that captures all `version.message` values.
- Real `classify`/`actionFor`/`formatVersionMessage` (NOT mocked).

**Steps**:
1. Plant the fake token in a document (e.g., a comment that could leak).
2. Call `computePlan(config, lock, repo, mockTarget)`.
3. Serialize the `Plan` to JSON.
4. Assert the Plan JSON contains NO occurrences of the fake token string.
5. Call `applyPlan(plan, mockTarget, lock, opts)`.
6. Read the journal file (`.marksync/journal/<run-id>.jsonl`).
7. Assert the journal contains NO occurrences of the fake token string.
8. Serialize the `ApplyReport` to JSON.
9. Assert the ApplyReport JSON contains NO occurrences of the fake token string.
10. Collect ALL `version.message` values captured by the mock target.
11. Assert every `version.message` contains NO occurrences of the fake token string.

**Expected Outcome**:
- The `Plan` JSON contains 0 fake token occurrences.
- The journal JSONL contains 0 fake token occurrences.
- The `ApplyReport` JSON contains 0 fake token occurrences.
- Every `version.message` sent to the mock target contains 0 fake token occurrences.
- Only non-sensitive metadata (pageId, uuid, operation) appears in outputs.

**Notes / Clarifications**:
- INV-SEC-1: no secrets in any output path.
- Integration-level validation across ALL output paths (Plan, journal, version.message, ApplyReport).
- Uses REAL `formatVersionMessage` (not mocked) per over-mocking guardrail.
- Only the `TargetSystem` and `Repository` ports are faked (allowed per testing-strategy.md).
- Complements TC-UNIT-005 and TC-UNIT-006 (unit-level validation) by testing at the full `computePlan` + `applyPlan` flow.

---

#### TC-GATE-001 - bun run check exits 0 (all quality checks pass)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-18
**Test Type(s)**: Integration (meta)
**Automation Level**: Automated
**Target Layer / Location**: CI workflow (`bun run check`)
**Tags**: @ci, @gate

**Preconditions**:
- All test files implemented.
- All production code implemented.

**Steps**:
1. Run `bun run check` (which runs lint, format:check, typecheck, test, check:boundaries).
2. Assert the command exits with code 0.

**Expected Outcome**:
- `bun run lint` passes (Biome).
- `bun run format:check` passes (Biome).
- `bun run typecheck` passes (TypeScript, proving no error-model change).
- `bun test` passes (all unit/integration tests).
- `bun run check:boundaries` passes (dep-cruiser, proving domain purity).

**Notes / Clarifications**:
- AC-Q-1: `bun run check` green is the quality gate.
- Typecheck proves no new `MarkSyncError` arms (would fail exhaustive checks).
- Run on every CI push; failure blocks merge.
- NFR-18: quality gate.

---

## 6. Environments and Test Data

### 6.1 Environments

- **Local development**: No special environment required — unit/integration tests run with `bun test`.
- **CI**: GitHub Actions runs `bun run check` on every push (fast loop).
- **E2E sandbox**: Not in scope for this story — E5-S1 owns E2E.

### 6.2 Test Data Generation

- **Fixtures**: Hardcoded fixture objects in test files (no external data files).
  - `computePlan` fixtures: branch gate fixtures, duplicate-UUID fixtures, per-SyncState fixtures, parent-first ordering fixtures.
  - `applyPlan` fixtures: mock target responses (create/update/no-op/conflict/forbidden; move out of scope for MS-0002), lock fixtures, config fixtures.
  - Link resolver fixtures: bindings map, resolved/unresolved link targets.
  - Shell-git fuzz fixtures: malicious paths/refs (`../`, `;`, backticks, `$()`, `\n`, `\0`, absolute paths).
- **Mock target**: `Bun.serve()` HTTP server for integration tests (returns Confluence page JSON).
- **Temp git repo**: Integration tests create a temp git repo for the `Repository` port.

### 6.3 Isolation Strategy

- Unit tests are isolated — pure functions with no shared state.
- Integration tests use temp directories for journals, locks, and git repos.
- Each test constructs its own fixtures and mock targets.
- No shared test state across test suites.
- Mock targets and fake repositories are scoped to each test case.

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Implementation Status |
|-------|-----------|----------------------|
| TC-UNIT-001 | `tests/unit/app/compute-plan.test.ts` | To Implement |
| TC-UNIT-002 | `tests/unit/app/provenance.test.ts` | To Implement |
| TC-UNIT-003 | `tests/unit/app/parent-first.test.ts` | To Implement |
| TC-UNIT-004 | `tests/unit/domain/hierarchy/link-resolver.test.ts` | To Implement |
| TC-UNIT-005 | `tests/unit/app/secrets-safety.test.ts` | To Implement |
| TC-UNIT-006 | `tests/unit/app/secrets-safety.test.ts` | To Implement |
| TC-UNIT-007 | `tests/unit/app/branch-gate.test.ts` | To Implement |
| TC-INTEGRATION-001 | `tests/integration/app/apply-plan-integration.test.ts` | To Implement |
| TC-INTEGRATION-002 | `tests/integration/app/apply-plan-integration.test.ts` | To Implement |
| TC-INTEGRATION-003 | `tests/integration/app/apply-plan-integration.test.ts` | To Implement |
| TC-INTEGRATION-004 | `tests/integration/app/apply-plan-integration.test.ts` | To Implement |
| TC-INTEGRATION-005 | `tests/integration/app/idempotency.test.ts` | To Implement |
| TC-INTEGRATION-006 | `tests/integration/app/crash-replay.test.ts` | To Implement |
| TC-INTEGRATION-007 | `tests/integration/app/per-doc-isolation.test.ts` | To Implement |
| TC-INTEGRATION-008 | `tests/integration/app/lock-property-atomicity.test.ts` | To Implement |
| TC-INTEGRATION-009 | `tests/integration/app/shell-git-safety-fuzz.test.ts` | To Implement |
| TC-INTEGRATION-010 | `tests/integration/app/duplicate-uuid-fatal.test.ts` | To Implement |
| TC-INTEGRATION-011 | `tests/integration/app/secrets-safety-integration.test.ts` | To Implement |
| TC-GATE-001 | CI workflow (`.github/workflows/ci.yml`) | To Verify (runs automatically) |

### Execution Commands

- **Unit tests**: `bun test tests/unit/`
- **Integration tests**: `bun test tests/integration/`
- **All tests**: `bun test tests/` (excludes E2E)
- **Quality gate**: `bun run check`

### Mocking Requirements (CRITICAL — OVER-MOCKING GUARDRAIL)

| Component | Mock Strategy | Rationale |
|-----------|---------------|-----------|
| `TargetSystem` port | `Bun.serve()` HTTP mock (integration) or stub (unit) | Allowed per testing-strategy.md — adapter boundary test. |
| `Repository` port | Fake/in-memory (unit) or temp git repo (integration) | Allowed per testing-strategy.md — adapter boundary test. |
| `classify` / `actionFor` | NEVER mocked — use real implementation from GH-22 | **NOT allowed** per over-mocking guardrail — the engine's value is in handling REAL sync states. |
| `loadLock` / `saveLock` | NEVER mocked — use real implementation from GH-19 | **NOT allowed** — validates lock+property atomicity. |
| `assertBranchAllowed` | NEVER mocked — use real implementation from GH-19 | **NOT allowed** — validates branch gate. |
| `detectDuplicateUuids` | NEVER mocked — use real implementation from GH-18 | **NOT allowed** — validates duplicate-UUID fatal gate. |
| `formatVersionMessage` | NEVER mocked — use real implementation from GH-21 | **NOT allowed** — validates provenance wiring (DEC-3). |
| `reconcileWithProperty` | NEVER mocked — use real implementation from GH-19 | **NOT allowed** — validates lock+property atomicity. |
| Crash hook | Test-injectable (not in production) | Allowed per spec — enables crash→replay testing. |

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual |
|------|--------|-------------|------------|----------|
| Classifier misclassifies `REMOTE_AHEAD`/`DIVERGED` as `LOCAL_AHEAD` → silent overwrite | H | L | Integration tests use REAL `classify`/`actionFor`; 409 backstop in E3-S7 | L |
| `REMOTE_MISSING` misclassified as safe update → page silently re-created | H | L | Integration tests use REAL `classify`/`actionFor`; AC-F1-2 asserts block | L |
| Over-mocking classifier in unit tests → false confidence | H | M | Explicit over-mocking guardrail in test plan; integration tests use real classifier | L |
| Shell-injection surface in git adapter → RCE | H | L | TDR-0003 C-4 controls; malicious-path fuzz fixture (TC-INTEGRATION-009) | L |
| Credential/token leaks into output → security breach | H | L | INV-SEC-1 asserts 0 token occurrences; `CommandResult` redaction layer (ADR-0011) | L |
| Parent-first ordering wrong → child create fails | M | M | Topological sort fixture (TC-UNIT-003); integration test validates against mock target | L |
| Per-document isolation broken → one failure aborts run | M | L | Per-doc isolation fixture (TC-INTEGRATION-007); engine designed to continue on failure | L |
| Journal corruption → partial-apply recovery fails | M | L | Journal format is simple JSONL; `replayJournal` validates each line; test covers crash→replay | L |

### 8.2 Assumptions

- **ADR-0006 is settled** — state model, INV-SAFE-1, INV-SAFE-2, INV-SAFE-3 are authoritative.
- **ADR-0010 is settled** — squash provenance, bounded writes, `version.message` format.
- **TDR-0003 is settled** — shell-git behind `Repository` interface, C-4 injection controls.
- **GH-18 through GH-22 are merged and their contracts are stable** — the engine consumes them as-is.
- **The `MarkSyncError` union already provides every arm the engine needs** — no error-model change required (DM-8).
- **Bun.serve() is sufficient for Confluence adapter mock** — provides HTTP interface for fault injection.
- **Temp directories are safe** — each test uses a unique temp directory; cleanup happens after each test.

### 8.3 Open Questions

| ID | Question | Context | Status | Owner |
|----|----------|---------|--------|-------|
| OQ-1 | Should `worktreeStatus`/rename-detection be in the `Repository` port for MS-0002? | TDR-0003 specifies them, but the MS-0002 engine reads committed snapshots only. | **RESOLVED (DEC-4):** Minimal port for MS-0002: `readCommitted` + `headSha` + `currentBranch` + commit-list hook. `worktreeStatus`/rename-detection deferred to E4/`doctor` stories. | N/A |
| OQ-2 | When does the BDD/Gherkin layer land? | Tier-5 BDD is deferred to E5-S1 (INV-SAFE-1/INV-SAFE-2/INV-SEC-1 scenarios). | **DEFERRED:** E5-S1 owns BDD delivery; this test plan notes the engine exposes the hooks (test-injectable crash point, mock target seam) for E5-S1 to drive. | N/A |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | Juliusz Ćwiąkalski | Initial test plan created. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution — see phase 6 delivery and phase 9 quality gates) | | | |

## Traceability Matrix Summary

This section summarizes the complete AC → TC mapping from §3.1:

| AC ID | TC ID(s) | Test Tier |
|-------|----------|-----------|
| AC-F1-1 (INV-SAFE-1: 0 writes for REMOTE_AHEAD/DIVERGED) | TC-INTEGRATION-001, TC-INTEGRATION-002 | Integration |
| AC-F1-2 (INV-SAFE-2: 0 re-creates for REMOTE_MISSING) | TC-INTEGRATION-003 | Integration |
| AC-F2-1 (INV-SAFE-3: duplicate-UUID fatal before any write) | TC-UNIT-001, TC-INTEGRATION-010 | Unit + Integration |
| AC-F3-1 (NFR-REL-5: 409 Conflict surfaces as drift, no retry) | TC-INTEGRATION-004 | Integration |
| AC-F3-2 (NFR-PERF-4: idempotency, 2nd push 0 writes) | TC-INTEGRATION-005 | Integration |
| AC-F4-1 (NFR-REL-7: crash→journal→replay, K entries) | TC-INTEGRATION-006 | Integration |
| AC-F5-1 (NFR-REL-9: provenance via formatVersionMessage) | TC-UNIT-002 | Unit |
| AC-F6-1 (parent-first ordering) | TC-UNIT-003 | Unit |
| AC-F7-1 (cross-page link resolution + unresolved warning) | TC-UNIT-004 | Unit |
| AC-F8-1 (per-document isolation, one Conflict doesn't abort) | TC-INTEGRATION-007 | Integration |
| AC-F9-1 (lock + property atomicity, reconcileWithProperty agrees) | TC-INTEGRATION-008 | Integration |
| AC-F10-1 (INV-SEC-1: no secrets in output paths) | TC-UNIT-005, TC-UNIT-006, TC-INTEGRATION-011 | Unit + Integration |
| AC-F11-1 (branch gate ForbiddenBranch) | TC-UNIT-007 | Unit |
| AC-F12-1 (shell-injection safety, malicious path fuzz rejected) | TC-INTEGRATION-009 | Integration |
| AC-Q-1 (quality gate: bun run check green) | TC-GATE-001 | Quality Gate |

**Over-Mocking Guardrail Compliance**:

- **Allowed mocks**: `TargetSystem` port (`Bun.serve()` stub/mock), `Repository` port (fake/in-memory or temp git repo), crash hook (test-injectable).
- **NOT allowed mocks**: `classify`, `actionFor`, `SyncState`, `Action`, `ContentHash`, `buildContentHash`, `loadLock`, `saveLock`, `assertBranchAllowed`, `detectDuplicateUuids`, `formatVersionMessage`, `reconcileWithProperty`.
- **Compliance**: All integration tests (TC-INTEGRATION-*) use the REAL `classify`/`actionFor`; all unit tests that validate classifier behavior (TC-UNIT-001) call the real `detectDuplicateUuids`; all unit tests that validate provenance wiring (TC-UNIT-002) call the real `formatVersionMessage`.
- **BDD/Gherkin**: Deferred to E5-S1; the engine exposes the hooks (test-injectable crash point, mock target seam) so E5-S1 can drive the BDD scenarios.