---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-19-test-plan
status: Proposed
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish-core, critical]
version_impact: minor (additive)
summary: "Test plan for the state-manager story (MS2-E3-S2 / GH-19): the committed, versioned, atomic `marksync.lock.yml` (loadLock/saveLock/mergeBindings) + lock JSON Schema v1 + atomic store with crash hook; the disposable `.marksync/cache/` layout (MARKSYNC_CACHE_DIR) where deletion changes no plan (ADR-0006 C-3 / NFR-COMP-6); the pure content-property cross-check (reconcileWithProperty → LockDirty; rebuildLockFromConfluence); the branch gate (assertBranchAllowed → ForbiddenBranch, MARKSYNC_ALLOW_BRANCHES override); and the new `CorruptLock` MarkSyncError kind wired through every exhaustive site. Exercised at Unit + Integration tiers; no Golden fixture, no E2E (no Confluence network in this story — the property fetch is E3-S4). Domain logic tested with REAL inputs/outputs, no mocked dependencies (over-mocking guardrail)."
links:
  change_spec: "./chg-GH-19-spec.md"
  implementation_plan: "./chg-GH-19-plan.md"
  story_authoritative: doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S2--state-manager.md
  feature_spec: doc/spec/features/feature-safe-publish.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_rules: .ai/rules/typescript.md
  decision: doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  nonfunctional_spec: doc/spec/nonfunctional.md
---

# Test Plan - [MS2-E3-S2] State manager (committed lock + disposable cache + property cross-check)

## 1. Scope and Objectives

This plan verifies the **shared-base half** of ADR-0006 introduced by GH-19: the
committed lock loader/saver (`loadLock`/`saveLock`/`mergeBindings`, `src/app/lock.ts`),
the lock JSON Schema v1 (`src/domain/config/lock-schema.json`), the atomic store with
crash hook (`src/infra/lock/store.ts`), the disposable cache layout
(`resolveCacheDir`/`ensureCacheLayout`, `src/app/cache.ts`), the pure content-property
cross-check (`reconcileWithProperty`/`rebuildLockFromConfluence`), the branch gate
(`assertBranchAllowed`), and the new `CorruptLock` `MarkSyncError` kind wired through
every exhaustive site. Drift classification (E3-S5), the sync-engine lock orchestration
(E3-S6), the Confluence property fetch (E3-S4), and apply-journal replay (E3-S6) are
**out of scope**.

The core integrity risks this plan guards against are: (a) **the cache becoming
load-bearing for correctness** (ADR-0006 C-3) — deleting `.marksync/` must change no
plan; (b) **a partial lock surviving an interrupted write** — atomic write must leave
the prior file intact; (c) **an invalid lock being silently accepted** — bad
version/missing-field/unparseable must surface `CorruptLock`; (d) **a tampered property
going undetected** — `sourceCommit` mismatch must yield `LockDirty`; (e) **the branch
gate being bypassable**; and (f) **a dependency-cruiser tier violation** — the schema
imports nothing; `src/app/lock.ts`/`src/app/cache.ts` import domain (+ infra via ports),
never cli.

Per `.ai/rules/testing-strategy.md` and the story's Test matrix, this story is
exercised at **Unit + Integration** tiers. There is **no Golden fixture** (no renderer)
and **no E2E** (no Confluence network — the property is a caller-supplied record). The
release-blocking invariants INV-SAFE-1/2/3 are owned by E3-S6/E5-S1; GH-19 contributes
the *base* those invariants reason over, plus INV-SEC-1 (no secrets in the committed
lock).

### 1.1 In Scope

- **Lock load (`loadLock`)** — valid lock → `ok(LockFile)`; **missing** lock file →
  `ok(empty LockFile)` (initial state, not an error — DEC-5); **present-but-invalid**
  (bad `version`, missing required field, unparseable YAML) → `err(CorruptLock)` with an
  AI-readable `humanMessage`.
- **Lock save (`saveLock`)** — atomic write via the store (temp + `fs.rename`);
  serialized as line-oriented, UUID-ordered, mergeable YAML.
- **Atomic store + crash hook** — injecting a crash between temp-write and rename leaves
  the destination **unchanged** and the temp abandoned (no partial lock).
- **Lock schema v1** — ajv validates every load; the `LockFile` type aligns with
  `lock-schema.json` and the `PageBinding` shape (GH-18).
- **`mergeBindings`** — union by UUID, deterministic last-write-wins tiebreak (the
  primitive E3-S6 wires into serialized apply).
- **Cache layout (`resolveCacheDir`/`ensureCacheLayout`)** — `.marksync/{cache,journal,conflicts}/`;
  `MARKSYNC_CACHE_DIR` override; **disposable**: deleting `.marksync/` changes no plan
  (the cache holds no base/correctness data — only reconstructable artifacts).
- **Content-property cross-check (pure)** — `reconcileWithProperty` (match → `ok`;
  `sourceCommit` mismatch → `err(LockDirty)`); `rebuildLockFromConfluence` (reconstructs
  a field-equal `PageBinding`).
- **Branch gate (`assertBranchAllowed`)** — `main` → `ok`; `feature/x` →
  `err(ForbiddenBranch)`; `MARKSYNC_ALLOW_BRANCHES=feature/x` → `ok`.
- **`CorruptLock` error kind** — new `MarkSyncError` arm flowing through every
  exhaustive site (mapper → `CODE_TO_EXIT` / DEC-2 table).
- **No secrets in the lock** (INV-SEC-1) — the committed lock carries no credential.

### 1.2 Out of Scope & Known Gaps

- **Drift classification** (E3-S5), **sync-engine lock orchestration** (E3-S6),
  **Confluence property fetch** (E3-S4), **apply-journal replay** (E3-S6) — this story
  provides the primitives; the orchestration that calls them is downstream.
- **The full "rerun plan → byte-identical" end-to-end** — the plan machinery is
  E3-S5/E3-S6. GH-19 proves C-3 at the cache-layout level: the cache holds **no**
  base/correctness data (only reconstructable artifacts), the committed lock is the
  sole base and is **not** in the cache, and deleting the cache is fully recoverable.
  The full plan-recomputation invariance is asserted by E3-S5/E3-S6 once the plan exists.
- **Real `git merge` of two lock files** — the mergeability test simulates a
  line-oriented merge (two lock files each adding a different-UUID doc merge without
  manual conflict). A live `git merge-file` is used if feasible in the test env;
  otherwise the YAML line-structure is asserted to be conflict-free by construction.
- **Storage renderer / Mermaid-DOM / E2E** tiers — not applicable (no renderer, no
  Confluence network).
- **BDD step definitions** — INV-SAFE-1/2/3 Gherkin lives in E5-S1; GH-19 contributes no
  scenario (it provides the base, not the overwrite-prevention behavior).
- **Lock schema migration (v2)** — v1 only (NG-6).

## 2. References

| Artifact | Path |
|----------|------|
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S2--state-manager.md` |
| Change specification | [`./chg-GH-19-spec.md`](./chg-GH-19-spec.md) (contract authority — `F-1..7`, `AC-*`, `DM-1..7`, `DEC-1..5`, `NFR-1..16`) |
| Implementation plan | [`./chg-GH-19-plan.md`](./chg-GH-19-plan.md) |
| PM notes | [`./chg-GH-19-pm-notes.yaml`](./chg-GH-19-pm-notes.yaml) |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) (tiers + over-mocking guardrail) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) ("add a kind", ajv-for-user-schema, atomic write, tier rules) |
| Decision (load-bearing) | [ADR-0006](../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) (C-2, C-3, Cross-check, Branch restriction) |
| System spec §9.3 | `doc/inception/system-specification-draft-from-ai-brainstorm.md` (lock + property + cache schema) |
| Feature spec | [`doc/spec/features/feature-safe-publish.md`](../../../spec/features/feature-safe-publish.md) |
| Non-functional spec | [`doc/spec/nonfunctional.md`](../../../spec/nonfunctional.md) (NFR-COMP-6 cache disposable) |
| Config loader (pattern to mirror) | `src/app/config.ts`; `src/domain/config/schema.json` |
| `MarkSyncError` union + lock arms | `src/domain/errors.ts` (`LockDirty`/`ConcurrentWrite`/`ForbiddenBranch` exist; `CorruptLock` added) |
| Error-kind → code/exit map | `src/app/cli-error-map.ts`, `src/cli/output/exit-codes.ts` (updated for `CorruptLock`) |
| `PageBinding` (reused) | `src/domain/binding/page-binding.ts` (GH-18) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

> Acceptance criteria are the spec's canonical IDs from `chg-GH-19-spec.md` §17
> (reproduced from the story's acceptance criteria). Every `AC-*` MUST appear.

| Spec AC | Description | F-# / NFR-# / DM-# | TC ID(s) | Status |
|---------|-------------|--------------------|----------|--------|
| AC-F4-1 (C-3) | Delete `.marksync/`, recompute plan → byte-identical (cache holds no correctness data). | F-4, NFR-1 | TC-CACHE-003, TC-CACHE-004 | Covered (layout-level) |
| AC-F1-1 | Valid lock → `ok(LockFile)`; invalid (bad version / missing field / unparseable) → `err(CorruptLock)` with AI-readable `humanMessage`. | F-1, F-2, F-7, NFR-2, NFR-3 | TC-LOCK-001, TC-LOCK-003, TC-LOCK-004, TC-LOCK-005 | Covered |
| AC-F3-1 | Crash (test hook) between temp-write and rename → destination unchanged, temp abandoned. | F-3, NFR-4, NFR-5 | TC-ATOMIC-001 | Covered |
| AC-F5-1 | `sourceCommit` mismatch → `err(LockDirty)`; matching property → `ok`. | F-5, NFR-6, NFR-7 | TC-RECONCILE-001, TC-RECONCILE-002 | Covered |
| AC-F5-2 | `rebuildLockFromConfluence({property, pageVersion, hashes})` → field-equal `PageBinding`. | F-5, NFR-8 | TC-REBUILD-001 | Covered |
| AC-F6-1 | `main` → `ok`; `feature/x` → `err(ForbiddenBranch)`; `MARKSYNC_ALLOW_BRANCHES=feature/x` + `feature/x` → `ok`. | F-6, NFR-9, NFR-10 | TC-BRANCH-001, TC-BRANCH-002, TC-BRANCH-003 | Covered |
| AC-MERGE-1 | Two branches add different-UUID docs → lock merges cleanly (no manual conflict). | F-1, NFR-11 | TC-MERGE-001 | Covered |
| AC-Q-1 | `bun run check` exits 0. | NFR-14, NFR-16 | TC-GATE-001, TC-BND-001 | Covered (gate) |

**Capability (F-#) rollup:**

| F-# | Capability | TC ID(s) |
|-----|------------|----------|
| F-1 | Lock loader/saver/merger (`loadLock`/`saveLock`/`mergeBindings`) | TC-LOCK-001..006, TC-ATOMIC-002, TC-MERGE-001 |
| F-2 | Lock JSON Schema v1 (`lock-schema.json`) | TC-LOCK-001, TC-LOCK-003, TC-LOCK-004 |
| F-3 | Atomic store + crash hook (`src/infra/lock/store.ts`) | TC-ATOMIC-001 |
| F-4 | Disposable cache layout (`src/app/cache.ts`) | TC-CACHE-001..004 |
| F-5 | Content-property cross-check (pure) | TC-RECONCILE-001..002, TC-REBUILD-001 |
| F-6 | Branch-restriction gate (`assertBranchAllowed`) | TC-BRANCH-001..003 |
| F-7 | `CorruptLock` error kind (every exhaustive site) | TC-CORRUPT-001, TC-LOCK-003..005 |

### 3.2 Interface Coverage (API-#, DM-#)

No REST/HTTP endpoints owned by this story (the property fetch is E3-S4). Data-model
coverage (spec §8.3):

| DM-# | Element | TC ID(s) |
|------|---------|----------|
| DM-1 | `LockFile` (`{ version:1, targets: { <id>: { documents: { <uuid>: PageBinding } } } }`) | TC-LOCK-001, TC-LOCK-006, TC-MERGE-001 |
| DM-2 | `marksync.lock.yml` (committed, single, line-oriented) | TC-ATOMIC-002, TC-MERGE-001, TC-NOSECRET-001 |
| DM-3 | `PageBinding` (reused, first-persisted) | TC-ATOMIC-002, TC-REBUILD-001 |
| DM-4 | `MetadataProperty` (caller-supplied input to pure cross-check) | TC-RECONCILE-001..002, TC-REBUILD-001 |
| DM-5 | `CorruptLock` error arm (new) + first-consumed `LockDirty`/`ForbiddenBranch` | TC-LOCK-003..005, TC-CORRUPT-001, TC-RECONCILE-002, TC-BRANCH-002 |
| DM-6 | Cache layout (`.marksync/{cache,journal,conflicts}/` + `MARKSYNC_CACHE_DIR`) | TC-CACHE-001..004 |
| DM-7 | `LockError` (narrowed `Result` channel) | TC-LOCK-001..005 |

**Public interface contracts consumed downstream** (verified as side-effects):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `loadLock`/`saveLock`/`mergeBindings` | drift (E3-S5), sync (E3-S6) | TC-LOCK-*, TC-ATOMIC-002, TC-MERGE-001 |
| `reconcileWithProperty` / `rebuildLockFromConfluence` | sync (E3-S6), repair (E4-S4) | TC-RECONCILE-*, TC-REBUILD-001 |
| `assertBranchAllowed` | sync (E3-S6, pre-write) | TC-BRANCH-* |
| Cache layout | markdown pipeline (E3-S3), journal (E3-S6), mermaid cache (E4-S1) | TC-CACHE-* |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# / INV-# | Requirement | Threshold | TC ID(s) | Status |
|---------------|-------------|-----------|----------|--------|
| NFR-COMP-6 / C-3 | Cache disposable | delete `.marksync/` → no correctness change (cache holds no base) | TC-CACHE-003, TC-CACHE-004 | Covered (layout-level) |
| NFR-4/5 | Atomic write cross-OS | crash leaves dest intact; `fs.rename` replace-over-existing works | TC-ATOMIC-001 | Covered |
| NFR-12 | Missing lock ≠ error | absent `marksync.lock.yml` → `ok(empty LockFile)` | TC-LOCK-002 | Covered |
| NFR-13 / INV-SEC-1 | No secrets in lock | committed lock carries no credential | TC-NOSECRET-001 | Covered |
| NFR-14 | Tier isolation | schema imports nothing; app modules import domain (+infra via ports), never cli | TC-BND-001 | Covered (boundary gate) |
| NFR-15 | No new dependency | `ajv`/`yaml`/`uuid` reused; 0 new runtime deps | TC-GATE-001 (side-check: `package.json` diff) | Covered |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md` and the story's Test matrix, this story is
exercised at **Unit** and **Integration** tiers. No Golden fixture (no renderer), no
Mermaid-DOM, no E2E (no Confluence network — the property is a caller-supplied record).

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes (primary — schema validation, atomic write crash hook, reconcile match/mismatch, rebuild, branch-allow, error-arm mapping) | `bun:test` | `tests/` mirroring `src/` | `*.test.ts` |
| **Integration** | Yes (lock save+reload round-trip in a temp repo; cache-delete invariance; two-branch lock merge) | `bun:test` | `tests/integration/` | `*.test.ts` |
| Golden fixture | No | — | — | — |
| Mermaid-DOM | No | — | — | — |
| BDD (Gherkin) | No (invariants owned by E3-S6/E5-S1) | — | — | — |
| E2E (live-sandbox) | No | — | — | no Confluence network |
| Type-level (compile safety) | Yes — `CorruptLock` exhaustiveness | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per testing-strategy.md §"File naming"):**

```
src/app/lock.ts                → tests/app/lock.test.ts                  (Unit — TC-LOCK-*, TC-CORRUPT-*)
src/app/cache.ts               → tests/app/cache.test.ts                 (Unit — TC-CACHE-001, TC-CACHE-002)
src/app/branch.ts (or lock.ts) → tests/app/branch.test.ts                (Unit — TC-BRANCH-*)
src/domain/state/reconcile.ts  → tests/domain/state/reconcile.test.ts    (Unit — TC-RECONCILE-*, TC-REBUILD-*) [pure logic residence]
src/infra/lock/store.ts        → tests/integration/lock/store.test.ts    (Integration — TC-ATOMIC-*; real temp-dir I/O)
lock save+reload round-trip    → tests/integration/lock/lock-roundtrip.test.ts (Integration — TC-LOCK-006, TC-MERGE-001)
cache-delete invariance        → tests/integration/cache/cache-disposable.test.ts (Integration — TC-CACHE-003, TC-CACHE-004)
```

> Tests use the `#domain/*`/`#app/*`/`#infra/*` import aliases (package.json
> `"imports"`), NOT deep relative paths (typescript.md §"Tests use import aliases").
> Pure cross-check logic may reside in `src/domain/state/` (domain imports nothing);
> `reconcileWithProperty`/`rebuildLockFromConfluence` are pure over caller-supplied
> records (DEC-3).

**Over-mocking guardrail compliance (TDR-0004 §"Test-design guardrail").** Every
function under test is exercised with **real inputs/outputs**: real lock YAML fixtures,
real ajv validation, real `fs` temp-dir I/O for atomic/round-trip tests, real
`MetadataProperty` records for the cross-check. The only "fault injection" is the
documented crash hook (TC-ATOMIC-001) — explicitly allowed by the guardrail (fault
injection). No lifecycle invariant is validated through mocks alone; INV-SEC-1 (no
secrets) is asserted on a real serialized lock.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-LOCK-001 | Valid lock → `ok(LockFile)` (ajv schema accepts) | Happy Path | Critical | High | AC-F1-1 |
| TC-LOCK-002 | Missing `marksync.lock.yml` → `ok(empty LockFile)` (DEC-5) | Corner Case | Critical | High | (NFR-12) |
| TC-LOCK-003 | Bad `version` (≠1) → `err(CorruptLock)` with AI-readable message | Negative | Critical | High | AC-F1-1 |
| TC-LOCK-004 | Missing required field → `err(CorruptLock)` | Negative | Critical | High | AC-F1-1 |
| TC-LOCK-005 | Unparseable YAML → `err(CorruptLock)` | Negative | Important | High | AC-F1-1 |
| TC-LOCK-006 | Lock save → reload round-trip yields an equal `LockFile` | Happy Path | Critical | High | AC-F1-1 |
| TC-ATOMIC-001 | Crash between temp-write and rename → dest unchanged, temp abandoned | Negative | Critical | High | AC-F3-1 |
| TC-ATOMIC-002 | `saveLock` overwrites an existing lock atomically (replace-over-existing) | Corner Case | Important | Medium | AC-F3-1 |
| TC-MERGE-001 | Two branches add different-UUID docs → lock merges cleanly (no manual conflict) | Corner Case | Critical | High | AC-MERGE-1 |
| TC-CACHE-001 | `resolveCacheDir` defaults to `<cwd>/.marksync`; `MARKSYNC_CACHE_DIR` overrides | Happy Path | Important | Medium | F-4 |
| TC-CACHE-002 | `ensureCacheLayout` creates `cache/`, `journal/`, `conflicts/` (idempotent) | Happy Path | Important | Medium | F-4 |
| TC-CACHE-003 | Deleting `.marksync/` is fully recoverable (cache holds no base) | Corner Case | Critical | High | AC-F4-1 |
| TC-CACHE-004 | The committed lock is NOT inside `.marksync/` (base ≠ cache) | Corner Case | Critical | High | AC-F4-1 |
| TC-RECONCILE-001 | `reconcileWithProperty` matching records → `ok` | Happy Path | Critical | High | AC-F5-1 |
| TC-RECONCILE-002 | `reconcileWithProperty` `sourceCommit` mismatch → `err(LockDirty)` | Negative | Critical | High | AC-F5-1 |
| TC-REBUILD-001 | `rebuildLockFromConfluence` reconstructs a field-equal `PageBinding` | Happy Path | Critical | High | AC-F5-2 |
| TC-BRANCH-001 | `assertBranchAllowed("main", config)` → `ok` | Happy Path | Critical | High | AC-F6-1 |
| TC-BRANCH-002 | `assertBranchAllowed("feature/x", config)` → `err(ForbiddenBranch)` | Negative | Critical | High | AC-F6-1 |
| TC-BRANCH-003 | `MARKSYNC_ALLOW_BRANCHES=feature/x` + `feature/x` → `ok` | Corner Case | Important | Medium | AC-F6-1 |
| TC-CORRUPT-001 | `CorruptLock` flows through mapper → `CORRUPT_LOCK` code/exit (new arm regression) | Regression | Critical | High | AC-F1-1, AC-Q-1 |
| TC-NOSECRET-001 | Serialized lock contains no secret-bearing field (INV-SEC-1) | Regression | Critical | High | (NFR-13) |
| TC-GATE-001 | `bun run check` exits 0 | Regression | Critical | High | AC-Q-1 |
| TC-BND-001 | dep-cruiser — schema imports nothing; app modules import domain(+infra via ports), never cli | Regression | Critical | High | AC-Q-1 |

### 5.2 Scenario Details

#### TC-LOCK-001 - Valid lock → `ok(LockFile)` (ajv schema accepts)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, DM-1, AC-F1-1, NFR-2, DEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend

**Preconditions**:
- A fixture `marksync.lock.yml` matching system spec §9.3 (version 1; one target with
  one UUID-keyed document carrying the full `PageBinding` field set).

**Steps**:
1. Write the fixture into a temp cwd; call `loadLock(cwd)`.
2. Assert `result.ok === true`.
3. Assert the returned `LockFile` has `version === 1`, one target, one document whose
   fields equal the fixture.

**Expected Outcome**:
- A well-formed committed lock loads to a typed `LockFile`; ajv accepts it. This is the
  shared base the drift classifier (E3-S5) and sync engine (E3-S6) read.

---

#### TC-LOCK-002 - Missing `marksync.lock.yml` → `ok(empty LockFile)` (DEC-5)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, AC-F1-1, NFR-12, DEC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend

**Preconditions**:
- A temp cwd with NO `marksync.lock.yml` (a fresh corpus).

**Steps**:
1. Call `loadLock(cwd)`.
2. Assert `result.ok === true` and the value equals `{ version: 1, targets: {} }`.

**Expected Outcome**:
- Absence is the initial state, not an error — so plan/sync can proceed on a fresh repo
  without special-casing (DEC-5). Only a present-but-invalid lock is an error.

---

#### TC-LOCK-003 - Bad `version` (≠1) → `err(CorruptLock)` with AI-readable message

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-7, DM-5, AC-F1-1, NFR-3, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend

**Preconditions**:
- A fixture with `version: 2` (or `version: "1"` wrong type).

**Steps**:
1. Call `loadLock(cwd)` on the fixture.
2. Assert `result.ok === false` and `error.kind === "CorruptLock"`.
3. Assert `error.path` names the lock file and `error.humanMessage` is AI-readable
   (references the `version` field, expected vs actual, suggested fix).

**Expected Outcome**:
- A wrong-schema lock is rejected at load with a typed, diagnosable error — never
  smuggled into the domain.

---

#### TC-LOCK-004 - Missing required field → `err(CorruptLock)`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-7, DM-5, AC-F1-1, NFR-3, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend

**Preconditions**:
- A fixture document entry missing a required field (e.g. no `pageId`).

**Steps**:
1. Call `loadLock(cwd)`.
2. Assert `err(CorruptLock)` with `humanMessage` naming the missing field + JSON pointer.

**Expected Outcome**:
- A structurally incomplete lock is rejected with a field-path diagnostic.

---

#### TC-LOCK-005 - Unparseable YAML → `err(CorruptLock)`

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, F-7, DM-5, AC-F1-1, NFR-3, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend

**Preconditions**:
- A fixture with malformed YAML (bad indentation / unbalanced quotes).

**Steps**:
1. Call `loadLock(cwd)`.
2. Assert `err(CorruptLock)`; `humanMessage` conveys the YAML parse failure.

**Expected Outcome**:
- Unparseable lock content surfaces as `CorruptLock`, not a thrown/leaked parse error.

---

#### TC-LOCK-006 - Lock save → reload round-trip yields an equal `LockFile`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, DM-1, DM-3, AC-F1-1, DEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/lock/lock-roundtrip.test.ts`
**Tags**: @backend

**Preconditions**:
- A temp cwd; a `LockFile` with two targets, multiple UUID-keyed docs each.

**Steps**:
1. `saveLock(lock)` then `loadLock(cwd)`.
2. Assert the reloaded `LockFile` is deep-equal to the original (field-by-field).
3. Assert the serialized file is line-oriented and UUID-ordered (entries appear in
   sorted UUID order, one block per line).

**Expected Outcome**:
- The lock survives a save→load round-trip losslessly; the on-disk format is the
  mergeable, deterministic shape (DEC-1).

---

#### TC-ATOMIC-001 - Crash between temp-write and rename → dest unchanged, temp abandoned

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-2, AC-F3-1, NFR-4, NFR-5
**Test Type(s)**: Integration (fault injection)
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/lock/store.test.ts`
**Tags**: @backend

**Preconditions**:
- A temp cwd with an existing valid `marksync.lock.yml` (content `ORIG`).
- The crash hook `__marksync_test_crash_after_temp_write` enabled (throw between temp
  write and rename).

**Steps**:
1. Call `saveLock(newLock)` with the crash hook armed.
2. Assert the call returns `err`/throws (the injected crash).
3. Assert `marksync.lock.yml` is **byte-identical** to `ORIG` (the destination was never
   partially written).
4. Assert the temp file `<dest>.<tmp>` exists but is **not** the lock (abandoned); no
   half-written lock is present.

**Expected Outcome**:
- An interrupted write leaves the prior lock intact and abandons the temp — the atomic
  guarantee (system spec §9.3: "interrupted lock write preserves old file").

---

#### TC-ATOMIC-002 - `saveLock` overwrites an existing lock atomically (replace-over-existing)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-1, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/lock/store.test.ts`
**Tags**: @backend

**Steps**:
1. With an existing lock, `saveLock(updated)` (no crash).
2. Assert the destination now equals the updated content (replace-over-existing worked).

**Expected Outcome**:
- `fs.rename` replace-over-existing works (POSIX + Windows via Bun), so a normal update
  replaces the prior file atomically.

---

#### TC-MERGE-001 - Two branches add different-UUID docs → lock merges cleanly (no manual conflict)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, AC-MERGE-1, NFR-11, DEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/lock/lock-roundtrip.test.ts`
**Tags**: @backend

**Preconditions**:
- A base lock with target `T` and one doc (`uuidA`). Two derived lock files: branch-A
  adds `uuidB`; branch-B adds `uuidC` (both different UUIDs, UUID-ordered line blocks).

**Steps**:
1. Simulate a git merge of branch-A and branch-B lock files (use `git merge-file` with a
   base if feasible; otherwise assert the line-structured YAML has no overlapping changed
   regions).
2. Assert the merge is **clean** (no conflict markers), and the result contains all three
   docs (`uuidA`, `uuidB`, `uuidC`).
3. Alternatively, assert `mergeBindings(loadA, loadB)` produces the union without loss.

**Expected Outcome**:
- The line-oriented, UUID-ordered, UUID-keyed format lets two branches adding different
  docs merge without manual conflict (ADR-0006 R1 mitigation; DEC-1).

---

#### TC-CACHE-001 - `resolveCacheDir` defaults to `<cwd>/.marksync`; `MARKSYNC_CACHE_DIR` overrides

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, DM-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/cache.test.ts`
**Tags**: @backend

**Steps**:
1. `resolveCacheDir(cwd)` → `<cwd>/.marksync`.
2. With `MARKSYNC_CACHE_DIR=/tmp/x`, `resolveCacheDir(cwd)` → `/tmp/x`.

**Expected Outcome**:
- The cache root is overridable for CI/test isolation (ADR-0006 Cache section).

---

#### TC-CACHE-002 - `ensureCacheLayout` creates `cache/`, `journal/`, `conflicts/` (idempotent)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, DM-6
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cache/cache-disposable.test.ts`
**Tags**: @backend

**Steps**:
1. `ensureCacheLayout(dir)` on a clean temp dir.
2. Assert `cache/`, `journal/`, `conflicts/` exist.
3. Call again; assert no error (idempotent).

**Expected Outcome**:
- The cache subtrees are created lazily and idempotently; the layout matches ADR-0006.

---

#### TC-CACHE-003 - Deleting `.marksync/` is fully recoverable (cache holds no base)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-6, AC-F4-1, NFR-1, ADR-0006 C-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cache/cache-disposable.test.ts`
**Tags**: @backend

**Preconditions**:
- A temp cwd with a committed `marksync.lock.yml` (the base) and a populated
  `.marksync/cache/`.

**Steps**:
1. Snapshot the `loadLock(cwd)` result (the base).
2. `rm -rf .marksync/`.
3. Re-run `loadLock(cwd)`.
4. Assert the result is **unchanged** (the base lives in the committed lock, not the
   cache); the cache deletion changed no base/correctness state.

**Expected Outcome**:
- The cache holds no correctness data — only reconstructable artifacts. The committed
  lock is the sole base. (The full plan-recomputation invariance is asserted by E3-S5/
  E3-S6 once the plan exists; GH-19 proves the base is cache-independent.)

---

#### TC-CACHE-004 - The committed lock is NOT inside `.marksync/` (base ≠ cache)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-2, AC-F4-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/cache.test.ts`
**Tags**: @backend

**Steps**:
1. Assert the lock path (`marksync.lock.yml` at repo root) is **outside** the resolved
   cache dir.
2. Assert `.gitignore` ignores `.marksync/` (the cache is never committed).

**Expected Outcome**:
- By construction the base (committed lock) and the cache (gitignored, disposable) are
  distinct — C-3's prerequisite.

---

#### TC-RECONCILE-001 - `reconcileWithProperty` matching records → `ok`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-4, AC-F5-1, NFR-7, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/domain/state/reconcile.test.ts`
**Tags**: @backend

**Preconditions**:
- A `PageBinding` and a matching `MetadataProperty` (same `sourceCommit`, etc.).

**Steps**:
1. `reconcileWithProperty(binding, property)`.
2. Assert `result.ok === true`.

**Expected Outcome**:
- A lock and property in agreement reconcile cleanly (the post-apply steady state).

---

#### TC-RECONCILE-002 - `reconcileWithProperty` `sourceCommit` mismatch → `err(LockDirty)`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-4, DM-5, AC-F5-1, NFR-6, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/domain/state/reconcile.test.ts`
**Tags**: @backend

**Steps**:
1. `reconcileWithProperty(binding, { ...property, sourceCommit: "DIFFERENT" })`.
2. Assert `err({ kind: "LockDirty"; path })`.

**Expected Outcome**:
- A tampered/stale property (sourceCommit mismatch) is flagged `LockDirty` — the
  defense-in-depth signal E3-S6 acts on.

---

#### TC-REBUILD-001 - `rebuildLockFromConfluence` reconstructs a field-equal `PageBinding`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-3, DM-4, AC-F5-2, NFR-8, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/domain/state/reconcile.test.ts`
**Tags**: @backend

**Preconditions**:
- A `MetadataProperty`, a `pageVersion`, and `hashes` derived from a known `PageBinding`.

**Steps**:
1. `rebuildLockFromConfluence({ property, pageVersion, hashes })`.
2. Assert `ok(reconstructed)`.
3. Assert the reconstructed `PageBinding` is field-equal to the original.

**Expected Outcome**:
- A lost/corrupted lock is rebuildable from the remote property + version + hashes
  (ADR-0006 Cross-check; the recovery path E4-S4 uses).

---

#### TC-BRANCH-001 - `assertBranchAllowed("main", config)` → `ok`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, DM-5, AC-F6-1, NFR-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/branch.test.ts`
**Tags**: @backend

**Steps**:
1. `assertBranchAllowed("main", { sync: { allowBranches: ["main"] } })`.
2. Assert `ok`.

**Expected Outcome**:
- The default allowed branch passes the deployment gate.

---

#### TC-BRANCH-002 - `assertBranchAllowed("feature/x", config)` → `err(ForbiddenBranch)`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, DM-5, AC-F6-1, NFR-9
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/branch.test.ts`
**Tags**: @backend

**Steps**:
1. `assertBranchAllowed("feature/x", { sync: { allowBranches: ["main"] } })` (no override
   env).
2. Assert `err({ kind: "ForbiddenBranch"; branch: "feature/x"; allowed: ["main"] })`.

**Expected Outcome**:
- A non-allowed branch is blocked (ADR-0006 deployment gate), producing the existing
  `ForbiddenBranch` arm (first-consumed here).

---

#### TC-BRANCH-003 - `MARKSYNC_ALLOW_BRANCHES=feature/x` + `feature/x` → `ok`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, AC-F6-1, NFR-10
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/branch.test.ts`
**Tags**: @backend

**Steps**:
1. Set `process.env.MARKSYNC_ALLOW_BRANCHES = "feature/x"`.
2. `assertBranchAllowed("feature/x", { sync: { allowBranches: ["main"] } })`.
3. Assert `ok`. (Restore env after.)

**Expected Outcome**:
- The override augments the allowed set for feature-branch previews (ADR-0006).

---

#### TC-CORRUPT-001 - `CorruptLock` flows through mapper → `CORRUPT_LOCK` code/exit (new arm regression)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, DM-5, AC-F1-1, AC-Q-1, DEC-2
**Test Type(s)**: Unit + typecheck gate
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts` (+ `tests/unit/app/cli-error-map.test.ts` / `tests/unit/cli/output/exit-codes.test.ts` side-checks)
**Tags**: @backend

**Preconditions**:
- `CorruptLock` is added to `MarkSyncError`; `assertNeverMarkSyncError`, the
  application-tier mapper, and `CODE_TO_EXIT` are updated (DEC-2 "add a kind").

**Steps**:
1. Produce a `CorruptLock` error from `loadLock` (as in TC-LOCK-003).
2. Assert it is a valid `MarkSyncError` member and flows through `Result`.
3. Map it via the application-tier mapper; assert a stable `code` (e.g. `CORRUPT_LOCK`)
   and a non-zero exit code.
4. Assert `assertNeverMarkSyncError` no longer flags an unhandled kind (typecheck gate).

**Expected Outcome**:
- The new `CorruptLock` arm is wired through every exhaustive site (mapper,
  `CODE_TO_EXIT`, `assertNeverMarkSyncError`) — the "add a kind" procedure is complete.

---

#### TC-NOSECRET-001 - Serialized lock contains no secret-bearing field (INV-SEC-1)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: DM-2, NFR-13, INV-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/app/lock.test.ts`
**Tags**: @backend, @security

**Steps**:
1. `saveLock(lock)` with a full `PageBinding`.
2. Read the serialized file; assert it contains NO credential/token/email field (the
   `PageBinding` field set has none by construction).

**Expected Outcome**:
- The committed lock is secret-free (INV-SEC-1) — safe to commit/review.

---

#### TC-GATE-001 - `bun run check` exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-14, NFR-16
**Test Type(s)**: Gate
**Automation Level**: Automated
**Target Layer / Location**: repo root
**Tags**: @backend

**Steps**:
1. `bun run check` (lint + format:check + typecheck + test + check:boundaries).
2. Assert exit 0.

**Expected Outcome**:
- All quality gates pass.

---

#### TC-BND-001 - dep-cruiser — schema imports nothing; app modules import domain(+infra via ports), never cli

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-14
**Test Type(s)**: Boundary gate
**Automation Level**: Automated
**Target Layer / Location**: `bun run check:boundaries`
**Tags**: @backend

**Steps**:
1. Run dep-cruiser.
2. Assert no tier violation: `lock-schema.json` imports nothing; `src/app/lock.ts`,
   `src/app/cache.ts` import domain (+ `src/infra/lock/store.ts` via ports), never cli.

**Expected Outcome**:
- Tier rules hold (typescript.md tier matrix).

## 6. Test Data and Fixtures

- **Inline lock YAML fixtures** (valid + each invalid variant) inside the unit test —
  real strings, no committed snapshot pair.
- **Temp-dir I/O** for integration tests (lock round-trip, atomic crash, cache
  disposable) — `fs.mkdtemp`, cleaned per-test.
- **`MetadataProperty` records** (match + mismatch) inline — real shapes per system spec
  §9.3.
- **Crash hook** `__marksync_test_crash_after_temp_write` — a module-level flag the store
  checks between temp-write and rename (off by default; set only in TC-ATOMIC-001).
- **`git merge-file`** (if available) for TC-MERGE-001; otherwise the line-structure is
  asserted conflict-free by construction.

## 7. Entry / Exit Criteria

**Entry:** GH-18 merged (`PageBinding`, `DocumentId`); `ajv`/`yaml`/`uuid` installed.

**Exit (DoD = story AC):** all `AC-*` green; `bun run check` exits 0; `CorruptLock`
wired through every exhaustive site; cache-disposable invariant proven at the
layout level.

## 8. Risks and Mitigations (test-specific)

| Risk | Mitigation |
|------|------------|
| TC-ATOMIC-001 crash hook is fragile (env-specific) | The hook is a module flag set in-test only; the test asserts both dest-unchanged and temp-abandoned. |
| TC-MERGE-001 `git` may not be available in the test env | Fall back to a structural line-merge assertion (no overlapping changed regions). |
| TC-CACHE-003 can't run the full plan (E3-S5/S6 absent) | Prove the stronger precondition: the base lives in the committed lock, not the cache; full plan-invariance is E3-S5/S6. |

## 9. Test Environment

- Bun 1.2.23 (pinned); `bun:test`; temp dirs under the OS temp root.
- No network (the property is a caller-supplied record; E3-S4 owns the fetch).
- No live Confluence (E2E is a separate gate, out of scope).

## 10. Responsibilities and Sign-off

Authored by the PM (per the GH-13 precedent) as a planning document. Reviewed at the DoR
gate (`@readiness-reviewer`) and at code review (`@reviewer`). The coder implements the
test files alongside the source per the implementation plan.
