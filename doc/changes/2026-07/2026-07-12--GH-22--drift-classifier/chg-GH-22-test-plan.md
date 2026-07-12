---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-22-test-plan
status: Proposed
created: "2026-07-12"
last_updated: "2026-07-12"
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, domain, drift, reliability]
version_impact: minor
summary: "Comprehensive test plan for the pure three-way drift classifier, ensuring zero silent overwrites (INV-SAFE-1), no silent re-creation of REMOTE_MISSING pages (INV-SAFE-2), and <5% false-positive rate via canonical semantic hash comparison."
links:
  change_spec: ./chg-GH-22-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E3-S5] Drift classifier — three-way {local, base, remote} sync-state classification (6-state enum, no silent overwrite, REMOTE_MISSING invariant)

## 1. Scope and Objectives

The drift classifier is the core of MarkSync's trust wedge — a pure domain function that classifies each bound document into one of six `SyncState` values (`NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`) and maps each to a safe action (`NoOp`, `Update`, `Block`, `Skip`). This test plan ensures:

1. **Zero silent overwrites** — any remote edit (`REMOTE_AHEAD` or `DIVERGED`) produces a `Block(Conflict)` action that the sync engine honors by default (INV-SAFE-1 / NFR-REL-1).
2. **No silent re-creation** — a remotely-deleted managed page (`REMOTE_MISSING`) produces a `Block(RemoteMissing)` action; the page is never auto-recreated (INV-SAFE-2 / NFR-REL-6).
3. **False-positive guard** — semantically-irrelevant differences (whitespace, attribute order) do not trigger drift; the classifier compares canonical semantic hashes, not raw bytes (NFR-REL-3).
4. **Boundary purity** — the classifier and all supporting modules under `src/domain/state/` import only from domain and shared, never from infrastructure or application (NFR-MAINT-1).
5. **Complete 6-state coverage** — every `SyncState` value is correctly detected via unit fixtures, and the `forbidden` path surfaces as an error, not a state (Q1).

### 1.1 In Scope

- Pure domain module `src/domain/state/classifier.ts` — the `classify()` function.
- Value object `src/domain/state/hashes.ts` — `ContentHash` composition (`rawHash`, `canonicalHash`, `attachmentHash`).
- Enum and mapping `src/domain/state/actions.ts` — `SyncState` enum, `Action` type, `SyncState → Action` mapping.
- Union `src/domain/state/types.ts` — `RemoteState` discriminated union, `SharedBase` view.
- Unit tests with fixtures for all 6 states, the `forbidden` path, false-positive guard, real-change detection, and edge cases (title/parent drift, both-missing).
- Integration tests feeding real GH-20 canonicalization hashes against golden fixtures (optional/contributing).
- Boundary negative test proving `src/domain/state/` modules import no infrastructure.

### 1.2 Out of Scope & Known Gaps

- **The apply (create/update/move writes)** — this is E3-S6 (sync engine); the classifier only classifies.
- **The write-time 409 optimistic-concurrency backstop** — this is E3-S7.
- **Conflict resolution / reverse sync** — MS-0004 / MS-0005+.
- **The `--adopt` / `--rebind` override wiring** — this is E3-S6; the classifier blocks `REMOTE_MISSING` by default.
- **BDD/Gherkin scenarios** — deferred to E5-S1 (INV-SAFE-1, INV-SAFE-2 Gherkin scenarios driven by classifier output). This test plan documents the future-wiring but does not deliver BDD tests.
- **Classification of base-absent (new) documents** — the engine handles `create` directly; the classifier is invoked only for bound documents (DEC-5).
- **Remote body hashing / fetching** — the engine supplies `RemoteState` with a pre-computed `bodyHash`; the classifier compares, it does not fetch or hash remote content.

## 2. References

- **Change specification**: `chg-GH-22-spec.md` — authoritative source for AC, decisions, edge cases, and NFRs.
- **Story file**: `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S5--drift-classifier.md` — test matrix and AC list.
- **Testing strategy**: `.ai/rules/testing-strategy.md` — 6-tier strategy, coverage rules, and over-mocking guardrail.
- **Code style**: `.ai/rules/typescript.md` — module structure, naming, error handling, purity conventions.
- **Dependency decisions**: `ADR-0006` — state model, INV-SAFE-1, INV-SAFE-2, three-way comparison.
- **Ubiquitous Language**: `doc/overview/ubiquitous-language.md` — §Sync State (6 values) and binding rule 3 (output validation).
- **Existing test sibling**: `tests/unit/domain/state/reconcile.test.ts` — proven pattern for pure state module tests.

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Boundary purity: dep-cruiser probe proves `src/domain/state/` imports no infra; production code has 0 infra imports | TC-PURITY-001, TC-PURITY-002 | To Implement |
| AC-F3-1 | Semantic idempotency: local==base==remote → NO_CHANGE | TC-STATE-001 | To Implement |
| AC-F3-2 | LOCAL_AHEAD: local changed, remote==base → Update | TC-STATE-002 | To Implement |
| AC-F3-3 | REMOTE_AHEAD: local==base, remote changed → Block(Conflict) | TC-STATE-003 | To Implement |
| AC-F3-4 | DIVERGED: both local and remote changed → Block(Conflict) | TC-STATE-004 | To Implement |
| AC-F3-5 | REMOTE_MISSING: binding exists, remote.kind=="missing" → Block(RemoteMissing) | TC-STATE-005 | To Implement |
| AC-F3-6 | LOCAL_MISSING: binding exists, local absent → Skip(warn) | TC-STATE-006 | To Implement |
| AC-F4-1 | Forbidden path: remote.kind=="forbidden" → err(Forbidden), not a SyncState | TC-FORBIDDEN-001 | To Implement |
| AC-F2-1 | False-positive guard: semantically-unchanged-but-superficially-different docs → NO_CHANGE | TC-FALSEPOS-001 through TC-FALSEPOS-005 | To Implement |
| AC-F2-2 | Real-change suite: genuine content edits → correctly NOT NO_CHANGE | TC-REALCHG-001 through TC-REALCHG-005 | To Implement |
| AC-F5-1 | Title/parent drift: body identical but title or parent changed locally → LOCAL_AHEAD | TC-METADATA-001, TC-METADATA-002 | To Implement |
| AC-F6-1 | Both-missing edge: local absent, remote.kind=="missing", binding exists → LOCAL_MISSING | TC-EDGE-001 | To Implement |
| AC-Q-1 | Quality gate: `bun run check` exits 0 (lint+format+typecheck+test+boundaries) | TC-GATE-001 | To Implement |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| DM ID | Element | Coverage via TC ID(s) |
|-------|---------|----------------------|
| DM-1 | `SyncState` enum (6 values) | TC-STATE-001 through TC-STATE-006 |
| DM-2 | `ContentHash` value object | TC-HASH-001, TC-HASH-002 |
| DM-3 | `RemoteState` discriminated union | TC-FORBIDDEN-001, TC-STATE-005 |
| DM-4 | `classify()` function + input shape | All state and edge case TCs |
| DM-5 | `Action` type + `SyncState → Action` mapping | TC-ACTION-001 through TC-ACTION-006 |
| DM-6 | `SharedBase` view | All classifier TCs (consumes as input) |
| DM-7 | Error-model (no change) | TC-FORBIDDEN-001, TC-STATE-003 through TC-STATE-005 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | Coverage via TC ID(s) |
|--------|-------------|----------------------|
| NFR-1 (NFR-MAINT-1) | Boundary purity: 0 infra imports under `src/domain/state/` | TC-PURITY-001, TC-PURITY-002 |
| NFR-2 (NFR-REL-1) | Zero silent overwrites: REMOTE_AHEAD/DIVERGED fixtures block | TC-STATE-003, TC-STATE-004 |
| NFR-3 (NFR-REL-6) | REMOTE_MISSING invariant: fixture → Block(RemoteMissing), never re-create | TC-STATE-005 |
| NFR-4 (NFR-REL-3) | False-positive rate <5%: semantic-only diff suite → NO_CHANGE | TC-FALSEPOS-001 through TC-FALSEPOS-005 |
| NFR-5 (NFR-REL-2) | Effectiveness 100%: real-change suite detected | TC-REALCHG-001 through TC-REALCHG-005 |
| NFR-6 (NFR-PERF-4) | Semantic idempotency: local==base==remote → NO_CHANGE | TC-STATE-001 |
| NFR-7 | 6-state + forbidden detection: one fixture per state + forbidden | TC-STATE-001 through TC-STATE-006, TC-FORBIDDEN-001 |
| NFR-8 | Canonical-comparison basis: classifier decides on canonicalHash, never rawHash alone | TC-FALSEPOS-001 through TC-FALSEPOS-005 |
| NFR-9 | Error-model stability: no new MarkSyncError arms | TC-FORBIDDEN-001, TC-STATE-003 through TC-STATE-005 |
| NFR-10 (UL rule 3) | Output-boundary validation: zod validates SyncState | TC-BOUNDARY-001 |
| NFR-11 | Quality gate: `bun run check` exits 0 | TC-GATE-001 |

## 4. Test Types and Layers

### 4.1 Tier 1 — Unit Tests (PRIMARY)

- **Framework**: `bun:test` (per TDR-0004).
- **Root directory**: `tests/unit/domain/state/`.
- **Coverage pattern**:
  - `classifier.test.ts` — `classify()` function, all 6 states, forbidden path, edge cases.
  - `hashes.test.ts` — `ContentHash` value object composition, canonicalHash determinism.
  - `actions.test.ts` — `SyncState → Action` mapping (6 states + error paths).
  - `boundary-negative.test.ts` — dep-cruiser probe proving infra imports fail.
- **Mocking**: No mocks required — pure functions over value objects with fixtures.
- **Execution**: `bun test tests/unit/domain/state/` (part of `bun run test`).

### 4.2 Tier 2 — Integration Tests (CONTRIBUTING)

- **Framework**: `bun:test` + real GH-20 canonicalization hashes.
- **Root directory**: `tests/integration/domain/state/`.
- **Purpose**: Classifier fed by real hashes from GH-20's `canonicalize()` against golden fixtures (validates integration seam).
- **Execution**: `bun test tests/integration/domain/state/` (part of `bun run test`).
- **Status**: Contributing — not release-blocking for MS-0002. Tier-1 fixtures provide primary coverage.

### 4.3 Tier 5 — BDD/Gherkin (DEFERRED)

- **Framework**: `@cucumber/cucumber` via `bun run test:bdd` (per TDR-0007).
- **Feature files**: `tests/bdd/features/` — deferred to E5-S1.
- **Purpose**: INV-SAFE-1 and INV-SAFE-2 Gherkin scenarios driven by classifier output (E3-S6 wires classifier to BDD steps).
- **Status**: Future-wired — this test plan documents the deferred BDD scenarios but does not deliver them. E5-S1 owns the BDD delivery.

### 4.4 Quality Gate (BUN RUN CHECK)

- **Command**: `bun run check` (runs lint + format:check + typecheck + test + check:boundaries).
- **Execution**: Every CI push (`bun run check` green required).
- **Coverage**: AC-Q-1 ensures all quality checks pass, including the boundary check from Tier-1.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-PURITY-001 | Boundary negative probe creates infra import in state module | Negative | Critical | High | AC-F1-1 |
| TC-PURITY-002 | Production code has zero infra imports under src/domain/state/ | Regression | Critical | High | AC-F1-1 |
| TC-STATE-001 | All three agree on canonical hash + title + parent + attachments → NO_CHANGE | Happy Path | Critical | High | AC-F3-1, NFR-6 |
| TC-STATE-002 | Local changed and remote == base → LOCAL_AHEAD → Update | Happy Path | Critical | High | AC-F3-2, NFR-7 |
| TC-STATE-003 | Local == base and remote changed → REMOTE_AHEAD → Block(Conflict) | Happy Path | Critical | High | AC-F3-3, NFR-2 |
| TC-STATE-004 | Both local and remote changed vs base → DIVERGED → Block(Conflict) | Happy Path | Critical | High | AC-F3-4, NFR-2 |
| TC-STATE-005 | Binding exists, remote.kind=="missing" → REMOTE_MISSING → Block(RemoteMissing) | Happy Path | Critical | High | AC-F3-5, NFR-3 |
| TC-STATE-006 | Binding exists, local absent → LOCAL_MISSING → Skip(warn) | Happy Path | Critical | High | AC-F3-6, NFR-7 |
| TC-FORBIDDEN-001 | Remote.kind=="forbidden" → err(Forbidden), not a SyncState | Negative | Critical | High | AC-F4-1, NFR-7 |
| TC-FALSEPOS-001 | Structural-whitespace text node count change between block siblings → NO_CHANGE | Edge Case | Important | High | AC-F2-1, NFR-4 |
| TC-FALSEPOS-002 | Multiple newline-containing whitespace nodes between blocks collapsed to one → NO_CHANGE | Edge Case | Important | High | AC-F2-1, NFR-4 |
| TC-FALSEPOS-003 | HTML attribute order diff → NO_CHANGE | Edge Case | Important | High | AC-F2-1, NFR-4 |
| TC-FALSEPOS-004 | Raw HTML node vs text node for same literal value → NO_CHANGE | Edge Case | Important | High | AC-F2-1, NFR-4 |
| TC-FALSEPOS-005 | Empty line count change → NO_CHANGE | Edge Case | Important | High | AC-F2-1, NFR-4 |
| TC-REALCHG-001 | Text content change → NOT NO_CHANGE | Happy Path | Important | High | AC-F2-2, NFR-5 |
| TC-REALCHG-002 | Heading addition/removal → NOT NO_CHANGE | Happy Path | Important | High | AC-F2-2, NFR-5 |
| TC-REALCHG-003 | Link URL change → NOT NO_CHANGE | Happy Path | Important | High | AC-F2-2, NFR-5 |
| TC-REALCHG-004 | Table cell content change → NOT NO_CHANGE | Happy Path | Important | High | AC-F2-2, NFR-5 |
| TC-REALCHG-005 | Code block language change → NOT NO_CHANGE | Happy Path | Important | High | AC-F2-2, NFR-5 |
| TC-METADATA-001 | Title change only (body identical) → LOCAL_AHEAD | Edge Case | Important | Medium | AC-F5-1, NFR-8 |
| TC-METADATA-002 | Parent page id change only (body identical) → LOCAL_AHEAD | Edge Case | Important | Medium | AC-F5-1, NFR-8 |
| TC-EDGE-001 | Both local absent and remote.kind=="missing" with binding → LOCAL_MISSING | Corner Case | Important | Medium | AC-F6-1 |
| TC-HASH-001 | ContentHash composition with all three facets (raw, canonical, attachment) | Happy Path | Important | Medium | F-2, DM-2 |
| TC-HASH-002 | CanonicalHash determinism: same input produces same hash across runs | Happy Path | Important | Medium | F-2, NFR-8 |
| TC-ACTION-001 | NO_CHANGE → NoOp | Happy Path | Important | High | F-5, DM-5 |
| TC-ACTION-002 | LOCAL_AHEAD → Update | Happy Path | Important | High | F-5, DM-5 |
| TC-ACTION-003 | REMOTE_AHEAD → Block(Conflict) | Happy Path | Important | High | F-5, DM-5 |
| TC-ACTION-004 | DIVERGED → Block(Conflict) | Happy Path | Important | High | F-5, DM-5 |
| TC-ACTION-005 | REMOTE_MISSING → Block(RemoteMissing) | Happy Path | Important | High | F-5, DM-5 |
| TC-ACTION-006 | LOCAL_MISSING → Skip(warn) | Happy Path | Important | High | F-5, DM-5 |
| TC-BOUNDARY-001 | Zod output-boundary validation rejects ad-hoc state string | Regression | Important | Medium | NFR-10 |
| TC-GATE-001 | bun run check exits 0 (all quality checks pass) | Regression | Critical | High | AC-Q-1, NFR-11 |

### 5.2 Scenario Details

#### TC-PURITY-001 - Boundary negative probe creates infra import in state module

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, NFR-1, AC-F1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/boundary-negative.test.ts`
**Tags**: @backend, @boundary

**Preconditions**:
- Production code under `src/domain/state/` exists and has 0 infra imports.

**Steps**:
1. Create a temporary probe file under `src/domain/state/` that imports from `src/infra/**`.
2. Run dependency-cruiser via `bun run check:boundaries`.
3. Assert the violation fires and the command fails.
4. Delete the temporary probe file.

**Expected Outcome**:
- dep-cruiser reports a `domain-may-not-import-infra` violation.
- `bun run check:boundaries` exits non-zero.
- The probe cleanup succeeds, leaving no artifacts.

**Notes / Clarifications**:
- Follows the proven pattern from `tests/unit/domain/target/boundary-negative.test.ts`.
- Validates the boundary rule at build time, ensuring no regression.

---

#### TC-PURITY-002 - Production code has zero infra imports under src/domain/state/

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, NFR-1, AC-F1-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/boundary-negative.test.ts`
**Tags**: @backend, @boundary

**Preconditions**:
- Production code under `src/domain/state/` exists.

**Steps**:
1. Run dependency-cruiser via `bun run check:boundaries`.
2. Inspect the output for `domain-may-not-import-infra` violations under `src/domain/state/`.

**Expected Outcome**:
- Zero violations reported under `src/domain/state/`.
- `bun run check:boundaries` exits 0.

**Notes / Clarifications**:
- This is the positive complement to TC-PURITY-001.
- Run on every CI push.

---

#### TC-STATE-001 - All three agree on canonical hash + title + parent + attachments → NO_CHANGE

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-6, AC-F3-1, NFR-6, NFR-PERF-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Fixture with identical `local`, `base`, and `remote` values on all comparison facets (canonicalHash, title, parentPageId, attachmentHash).

**Steps**:
1. Construct input: `{ local: ContentHash, base: SharedBase, remote: RemoteState.present }` where all three agree.
2. Call `classify(input)`.
3. Assert the result is `ok(NO_CHANGE)`.
4. Assert `mapAction(NO_CHANGE)` returns `NoOp`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.NO_CHANGE }`.
- Action is `NoOp` (no write).

**Notes / Clarifications**:
- This is the semantic idempotency precondition — drives "second push writes 0" (NFR-PERF-4).
- Validates the classifier correctly identifies the no-op case.

---

#### TC-STATE-002 - Local changed and remote == base → LOCAL_AHEAD → Update

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-5, AC-F3-2, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Fixture where `local` differs from `base` on canonicalHash/title/parent/attachments, and `remote` matches `base`.

**Steps**:
1. Construct input: `{ local: ContentHash (changed), base: SharedBase, remote: RemoteState.present (matches base) }`.
2. Call `classify(input)`.
3. Assert the result is `ok(LOCAL_AHEAD)`.
4. Assert `mapAction(LOCAL_AHEAD)` returns `Update`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.LOCAL_AHEAD }`.
- Action is `Update` (safe write).

**Notes / Clarifications**:
- This is the ONLY state that writes.
- Validates the classifier correctly identifies safe local updates.

---

#### TC-STATE-003 - Local == base and remote changed → REMOTE_AHEAD → Block(Conflict)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-5, AC-F3-3, NFR-2, INV-SAFE-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path, @invariant

**Preconditions**:
- Fixture where `local` matches `base`, and `remote` differs on canonicalHash/title/parent.

**Steps**:
1. Construct input: `{ local: ContentHash (matches base), base: SharedBase, remote: RemoteState.present (changed) }`.
2. Call `classify(input)`.
3. Assert the result is `ok(REMOTE_AHEAD)`.
4. Assert `mapAction(REMOTE_AHEAD)` returns `Block(Conflict)` with correct `pageId`, `baseVersion`, `remoteVersion`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.REMOTE_AHEAD }`.
- Action is `Block({ kind: "Conflict", pageId, baseVersion, remoteVersion })`.
- The error carries the pageId from `base.pageId`, baseVersion from `base.pageVersion`, remoteVersion from `remote.version`.

**Notes / Clarifications**:
- INV-SAFE-1: zero silent overwrites — remote edit detected and blocked by default.
- Validates the classifier correctly detects remote-only changes.

---

#### TC-STATE-004 - Both local and remote changed vs base → DIVERGED → Block(Conflict)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-5, AC-F3-4, NFR-2, INV-SAFE-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path, @invariant

**Preconditions**:
- Fixture where `local` differs from `base`, and `remote` also differs from `base`.

**Steps**:
1. Construct input: `{ local: ContentHash (changed), base: SharedBase, remote: RemoteState.present (changed differently) }`.
2. Call `classify(input)`.
3. Assert the result is `ok(DIVERGED)`.
4. Assert `mapAction(DIVERGED)` returns `Block(Conflict)` with correct `pageId`, `baseVersion`, `remoteVersion`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.DIVERGED }`.
- Action is `Block({ kind: "Conflict", pageId, baseVersion, remoteVersion })`.
- The error carries the pageId from `base.pageId`, baseVersion from `base.pageVersion`, remoteVersion from `remote.version`.

**Notes / Clarifications**:
- INV-SAFE-1: zero silent overwrites — both-sided conflict detected and blocked by default.
- Validates the classifier correctly detects divergent changes.

---

#### TC-STATE-005 - Binding exists, remote.kind=="missing" → REMOTE_MISSING → Block(RemoteMissing)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-4, F-5, AC-F3-5, NFR-3, INV-SAFE-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path, @invariant

**Preconditions**:
- Fixture where a binding exists (`base` present) and `remote.kind === "missing"`.

**Steps**:
1. Construct input: `{ local: ContentHash (any), base: SharedBase, remote: RemoteState.missing }`.
2. Call `classify(input)`.
3. Assert the result is `ok(REMOTE_MISSING)`.
4. Assert `mapAction(REMOTE_MISSING)` returns `Block(RemoteMissing)` with correct `pageId`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.REMOTE_MISSING }`.
- Action is `Block({ kind: "RemoteMissing", pageId })`.
- The error carries the pageId from `base.pageId`.
- The action does NOT carry a write operation — the engine honors the block and never re-creates.

**Notes / Clarifications**:
- INV-SAFE-2: never silently re-create a remotely-deleted managed page.
- Only an explicit `--adopt`/`--rebind` in E3-S6 can override — the classifier blocks by default.
- Validates the classifier correctly detects remote deletions.

---

#### TC-STATE-006 - Binding exists, local absent → LOCAL_MISSING → Skip(warn)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, F-5, AC-F3-6, DEC-1, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Fixture where a binding exists (`base` present) and `local` is absent (`local` field undefined in input).

**Steps**:
1. Construct input: `{ base: SharedBase, remote: RemoteState.present }` (no `local` field).
2. Call `classify(input)`.
3. Assert the result is `ok(LOCAL_MISSING)`.
4. Assert `mapAction(LOCAL_MISSING)` returns `Skip` (warn).

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.LOCAL_MISSING }`.
- Action is `Skip` (warn, no write).

**Notes / Clarifications**:
- DEC-1: `local` is optional to express `LOCAL_MISSING` (binding present, source document gone).
- For MS-0002, this is warn+skip; auto-delete/rebind is MS-0004.
- Validates the classifier correctly detects local deletions.

---

#### TC-FORBIDDEN-001 - Remote.kind=="forbidden" → err(Forbidden), not a SyncState

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, Q1, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @negative

**Preconditions**:
- Fixture where `remote.kind === "forbidden"`.

**Steps**:
1. Construct input: `{ local: ContentHash (any), base: SharedBase, remote: RemoteState.forbidden }`.
2. Call `classify(input)`.
3. Assert the result is `err({ kind: "Forbidden", pageId, operation: "read" })`.
4. Assert the result is NOT `ok(SyncState)` (forbidden is not a state).

**Expected Outcome**:
- `classify()` returns `{ ok: false, error: { kind: "Forbidden", pageId, operation: "read" } }`.
- The error carries the pageId from `remote.pageId`.
- No `SyncState` value is returned (Q1: forbidden is an access condition, not a state).

**Notes / Clarifications**:
- Q1: `forbidden` is NOT a seventh state; it surfaces as an error so E3-S6 warns+skips.
- Validates the classifier correctly distinguishes 403 (forbidden) from 404 (missing).

---

#### TC-FALSEPOS-001 through TC-FALSEPOS-005 - False-positive guard suite

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-6, AC-F2-1, NFR-4, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @edge-case, @false-positive

**Preconditions**:
- Fixture pairs: one with semantically-unchanged-but-superficially-different local, unchanged base/remote.

**Steps** (per TC):
1. **TC-FALSEPOS-001**: Structural-whitespace text node count change between block siblings (whitespace-only + newline).
2. **TC-FALSEPOS-002**: Multiple newline-containing whitespace nodes between blocks collapsed to one.
3. **TC-FALSEPOS-003**: HTML attribute order diff (same attributes, different order).
4. **TC-FALSEPOS-004**: Raw HTML node vs text node for the same literal value.
5. **TC-FALSEPOS-005**: Empty line count change (structural whitespace dropped).
6. For each, construct input where local has the superficial diff, base and remote are identical.
7. Call `classify(input)`.
8. Assert the result is `ok(NO_CHANGE)`.

**Expected Outcome**:
- All 5 fixtures produce `ok(NO_CHANGE)`.
- No false drift is triggered by semantically-irrelevant differences.

**Notes / Clarifications**:
- NFR-REL-3: false-positive rate <5% — this suite validates the canonical comparison basis.
- The classifier compares `canonicalHash`, which delegates to GH-20's `canonicalize()`. GH-20 normalizes exactly four invariants:
  1. **Structural whitespace drop**: `isStructuralWhitespace` (canonicalize.ts L77-79) drops text nodes that are whitespace-only AND contain a newline (`value.trim() === "" && value.includes("\n")`).
  2. **Attribute ordering**: `sortProperties` (canonicalize.ts L82-88) stably sorts element properties so attribute order never affects the hash.
  3. **Raw→text equivalence**: Raw HTML nodes are converted to text nodes with the same literal value (canonicalize.ts L64-67).
  4. **Position absence**: The canonical form never copies source `position` (canonicalize.ts L35-36), so source-location differences never perturb the digest.
- GH-20 does NOT normalize: internal whitespace within text nodes (e.g., `"a  b"` vs `"a b"`), leading/trailing whitespace in code blocks, or indentation unless it manifests as newline-containing structural whitespace.
- Validates the false-positive guard works as intended for diffs GH-20 provably normalizes to identical output.

---

#### TC-REALCHG-001 through TC-REALCHG-005 - Real-change suite

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-6, AC-F2-2, NFR-5, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @happy-path, @effectiveness

**Preconditions**:
- Fixture pairs: one with genuine content change in local, unchanged base/remote.

**Steps** (per TC):
1. **TC-REALCHG-001**: Text content change (word/sentence added or removed).
2. **TC-REALCHG-002**: Heading addition/removal (new `#` heading or heading level change).
3. **TC-REALCHG-003**: Link URL change (same link text, different target URL).
4. **TC-REALCHG-004**: Table cell content change (cell text modified).
5. **TC-REALCHG-005**: Code block language change (same code content, different language identifier).
6. For each, construct input where local has the real change, base and remote are identical.
7. Call `classify(input)`.
8. Assert the result is `NOT ok(NO_CHANGE)` — it should be `ok(LOCAL_AHEAD)`.

**Expected Outcome**:
- All 5 fixtures produce `ok(LOCAL_AHEAD)`, never `NO_CHANGE`.
- Real content changes are always detected.

**Notes / Clarifications**:
- NFR-REL-2: 100% effectiveness — every supported remote-edit scenario detected.
- Validates the false-positive guard is not too aggressive (real changes are detected).
- Complements TC-FALSEPOS suite — together they prove <5% false-positive rate and 100% effectiveness.

---

#### TC-METADATA-001 - Title change only (body identical) → LOCAL_AHEAD

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-6, AC-F5-1, R1, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @edge-case

**Preconditions**:
- Fixture where `local` and `base/remote` have identical canonical body hash and attachments, but `local.title` differs.

**Steps**:
1. Construct input: `{ local: ContentHash (title changed), base: SharedBase, remote: RemoteState.present (matches base title) }`.
2. Call `classify(input)`.
3. Assert the result is `ok(LOCAL_AHEAD)`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.LOCAL_AHEAD }`.
- Title drift is detected even with an identical body.

**Notes / Clarifications**:
- R1: classifier compares title and parent page id alongside canonical body hash.
- Title-only change is a valid local update that should write.

---

#### TC-METADATA-002 - Parent page id change only (body identical) → LOCAL_AHEAD

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-6, AC-F5-1, R1, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @edge-case

**Preconditions**:
- Fixture where `local` and `base/remote` have identical canonical body hash and title, but `local.parentPageId` differs.

**Steps**:
1. Construct input: `{ local: ContentHash (parentPageId changed), base: SharedBase, remote: RemoteState.present (matches base parentPageId) }`.
2. Call `classify(input)`.
3. Assert the result is `ok(LOCAL_AHEAD)`.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.LOCAL_AHEAD }`.
- Parent drift is detected even with an identical body.

**Notes / Clarifications**:
- R1: classifier compares title and parent page id alongside canonical body hash.
- Parent-only change is a valid local move that should write.

---

#### TC-EDGE-001 - Both local absent and remote.kind=="missing" with binding → LOCAL_MISSING

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-3, AC-F6-1, DEC-6, NFR-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @corner-case

**Preconditions**:
- Fixture where a binding exists (`base` present), `local` is absent, and `remote.kind === "missing"`.

**Steps**:
1. Construct input: `{ base: SharedBase, remote: RemoteState.missing }` (no `local` field).
2. Call `classify(input)`.
3. Assert the result is `ok(LOCAL_MISSING)` deterministically.

**Expected Outcome**:
- `classify()` returns `{ ok: true, value: SyncState.LOCAL_MISSING }`.
- The classifier makes a deterministic choice: `LOCAL_MISSING`, not `REMOTE_MISSING`.

**Notes / Clarifications**:
- DEC-6: both-gone edge case → `LOCAL_MISSING` (source-gone is the operator-actionable signal; re-creating would risk INV-SAFE-2).
- Validates the deterministic behavior of the ambiguous both-missing case.

---

#### TC-HASH-001 - ContentHash composition with all three facets (raw, canonical, attachment)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/hashes.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Valid HAST content, source bytes, and attachment set.

**Steps**:
1. Construct `ContentHash` with `rawHash` (sha256 of source bytes), `canonicalHash` (delegates to GH-20's `contentHash(canonicalize(hast))`), and `attachmentHash` (deterministic digest over sorted attachment set).
2. Assert all three fields are non-empty strings.
3. Assert `canonicalHash` differs from `rawHash` (proves canonicalization ran).

**Expected Outcome**:
- `ContentHash` is successfully composed with all three facets.
- `canonicalHash` is the output of GH-20's `contentHash(canonicalize())`.

**Notes / Clarifications**:
- DEC-2: `ContentHash.canonicalHash` delegates to GH-20; no sha256 re-implementation.
- Validates the false-positive guard's data structure.

---

#### TC-HASH-002 - CanonicalHash determinism: same input produces same hash across runs

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2, NFR-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/hashes.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- Valid HAST content.

**Steps**:
1. Construct `ContentHash` from a given HAST.
2. Run the construction 5 times on the same input.
3. Assert all 5 `canonicalHash` values are identical.

**Expected Outcome**:
- `canonicalHash` is deterministic — same input always produces the same hash.
- No random IDs or timestamps perturb the digest.

**Notes / Clarifications**:
- Validates the canonicalization basis is stable.
- Idempotency prerequisite for NFR-PERF-4.

---

#### TC-ACTION-001 through TC-ACTION-006 - Action mapping suite

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-5, DM-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/actions.test.ts`
**Tags**: @backend, @happy-path

**Preconditions**:
- `SyncState` enum values.

**Steps** (per TC):
1. **TC-ACTION-001**: Call `mapAction(NO_CHANGE)` → assert returns `NoOp`.
2. **TC-ACTION-002**: Call `mapAction(LOCAL_AHEAD)` → assert returns `Update`.
3. **TC-ACTION-003**: Call `mapAction(REMOTE_AHEAD)` → assert returns `Block(Conflict)` with correct error structure.
4. **TC-ACTION-004**: Call `mapAction(DIVERGED)` → assert returns `Block(Conflict)` with correct error structure.
5. **TC-ACTION-005**: Call `mapAction(REMOTE_MISSING)` → assert returns `Block(RemoteMissing)` with correct error structure.
6. **TC-ACTION-006**: Call `mapAction(LOCAL_MISSING)` → assert returns `Skip(warn)`.

**Expected Outcome**:
- Each `SyncState` maps to the correct `Action`.
- `Block` actions carry the correctly-typed `MarkSyncError` with required fields.

**Notes / Clarifications**:
- Validates the `SyncState → Action` mapping contract that E3-S6 consumes.
- DEC-3: all error arms are reused verbatim from `MarkSyncError` (no new arms).

---

#### TC-BOUNDARY-001 - Zod output-boundary validation rejects ad-hoc state string

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, NFR-10, UL rule 3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/state/classifier.test.ts`
**Tags**: @backend, @boundary

**Preconditions**:
- Zod schema for `SyncState` output validation exists.

**Steps**:
1. Attempt to validate an ad-hoc string (e.g., `"SOMETHING_ELSE"`) via the zod schema.
2. Assert validation fails.

**Expected Outcome**:
- Zod validation rejects any value not in the 6-state enum.
- Only `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING` pass.

**Notes / Clarifications**:
- UL binding rule 3: zod schema validates the classifier output at the boundary.
- No ad-hoc state string can escape the classifier.

---

#### TC-GATE-001 - bun run check exits 0 (all quality checks pass)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-1, NFR-9, NFR-10, NFR-11
**Test Type(s)**: Integration (meta)
**Automation Level**: Automated
**Target Layer / Location**: CI workflow (`bun run check`)
**Tags**: @ci, @gate

**Preconditions**:
- All test files implemented.

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
- NFR-9: typecheck proves no new `MarkSyncError` arms (would fail exhaustive checks).
- NFR-10: output-boundary validation runs at test time.
- Run on every CI push; failure blocks merge.

## 6. Environments and Test Data

### 6.1 Environments

- **Local development**: No special environment required — pure unit tests run with `bun test`.
- **CI**: GitHub Actions runs `bun run check` on every push (fast loop).
- **E2E sandbox**: Not in scope for this story — E3-S6/E5-S1 own E2E.

### 6.2 Test Data Generation

- **Fixtures**: Hardcoded fixture objects in test files (no external data files).
  - State fixtures: 6-state fixtures (one per `SyncState`) + forbidden path.
  - False-positive suite: 5 Markdown fixtures with semantically-irrelevant diffs.
  - Real-change suite: 5 Markdown fixtures with genuine content changes.
  - Edge case fixtures: title-only, parent-only, both-missing.
- **Golden fixtures**: Integration tests may use golden canonical hash outputs from GH-20 (contributing).

### 6.3 Isolation Strategy

- All tests are isolated — pure functions with no shared state.
- Each test constructs its own input fixtures.
- Boundary negative test cleans up its temporary probe file.
- No database, filesystem, or network dependencies (domain purity).

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Implementation Status |
|-------|-----------|----------------------|
| TC-PURITY-001, TC-PURITY-002 | `tests/unit/domain/state/boundary-negative.test.ts` | To Implement |
| TC-STATE-001 through TC-STATE-006 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-FORBIDDEN-001 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-FALSEPOS-001 through TC-FALSEPOS-005 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-REALCHG-001 through TC-REALCHG-005 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-METADATA-001, TC-METADATA-002 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-EDGE-001 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-HASH-001, TC-HASH-002 | `tests/unit/domain/state/hashes.test.ts` | To Implement |
| TC-ACTION-001 through TC-ACTION-006 | `tests/unit/domain/state/actions.test.ts` | To Implement |
| TC-BOUNDARY-001 | `tests/unit/domain/state/classifier.test.ts` | To Implement |
| TC-GATE-001 | CI workflow (`.github/workflows/ci.yml`) | To Verify (runs automatically) |

### Execution Commands

- **Unit tests**: `bun test tests/unit/domain/state/`
- **All tests**: `bun test tests/` (excludes E2E)
- **Quality gate**: `bun run check`

### Mocking Requirements

- **None** — pure functions tested with fixtures (no mocks needed).
- Integration tests (optional/contributing) may use real GH-20 `canonicalize()` directly.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual |
|------|--------|-------------|------------|----------|
| Classifier misclassifies `REMOTE_AHEAD`/`DIVERGED` as `LOCAL_AHEAD` → silent overwrite | H | L | Exhaustive 6-state fixture suite; false-positive/real-change suites; 409 backstop in E3-S7 | L |
| `REMOTE_MISSING` misclassified as safe update → page silently re-created | H | L | AC-F3-5 asserts `REMOTE_MISSING` → `Block`; E3-S6 honors block | L |
| False-positive guard too aggressive → real changes normalized away | H | L | GH-20 canonicalizer verified conservative; real-change suite asserts detection | L |
| False-positive guard too weak → whitespace churn triggers false drift | M | L | Canonical comparison basis; false-positive suite asserts `NO_CHANGE` | L |
| Boundary violation sneaks in (infra import in state module) | M | L | dep-cruiser enforces at build time; negative probe proves rule fires | L |
| Title/parent metadata drift missed (body-only comparison) | M | M | R1: classifier compares title and parent; AC-F5-1 asserts detection | L |

### 8.2 Assumptions

- **ADR-0006 is settled** — state model, INV-SAFE-1, INV-SAFE-2 are authoritative.
- **GH-20 `canonicalize()` is conservative** — drops only structural whitespace, sorts properties, never alters text content.
- **GH-21 `TargetSystem` port supplies `RemoteState`** — classifier consumes, does not fetch.
- **Engine supplies pre-computed hashes** — classifier compares, does not hash remote content.
- **Classifier invoked only for bound documents** — base-absent (new) documents take create-path in E3-S6 (DEC-5).
- **`MarkSyncError` has all needed arms** — `RemoteMissing`, `Forbidden`, `Conflict` exist; no new arms (DEC-3).

### 8.3 Open Questions

| ID | Question | Context | Status | Owner |
|----|----------|---------|--------|-------|
| OQ-1 | Should we add integration tests with real GH-20 hashes? | Story test matrix lists integration as "contributing". | **RESOLVED**: Optional/contributing for MS-0002; Tier-1 fixtures provide primary coverage. | N/A |
| OQ-2 | When does the BDD/Gherkin layer land? | Tier-5 BDD is deferred to E5-S1 (INV-SAFE-1/INV-SAFE-2 scenarios). | **DEFERRED**: E5-S1 owns BDD delivery; this test plan notes the future-wiring. | N/A |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | Juliusz Ćwiąkalski | Initial test plan created. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution — see phase 6 delivery and phase 9 quality gates) | | | |