---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-28-test-plan
status: Proposed
created: 2026-07-15
last_updated: 2026-07-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, repair-state, reliability, diagnostics]
version_impact: minor
summary: "Minimal repair (repair-state): recover from stale/dirty locks and interrupted applies via journal replay without data loss, without duplicate writes, and never silently overwriting remote work (INV-SAFE-1)."
links:
  change_spec: ./chg-GH-28-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4-S4] Minimal repair (repair-state)

## 1. Scope and Objectives

This test plan validates the `repair-state` command that recovers a MarkSync-managed target from two failure modes: (a) stale or dirty committed locks whose bindings no longer agree with the remote `marksync.metadata` property, and (b) interrupted applies (crashes mid-run) where the append-only journal records operations as successful that the lock does not yet reflect. The command is dry-run by default (`--dry-run` shows the plan) and executes repairs with `--apply`. It must preserve INV-SAFE-1: repair is read + reconcile, never a blind overwrite; diverged or missing remotes are reported and stopped, not written. The plan validates that recovery produces zero duplicate writes, zero page re-writes on stale-lock rebuilds, zero writes to diverged/missing remotes, and that all repair items carry stable diagnostic codes.

### 1.1 In Scope

- Stale/dirty lock recovery: per-binding `reconcileWithProperty` → `rebuildLockFromConfluence` on mismatch; atomic lock update; no page re-write
- Interrupted-apply recovery: `replayJournal` of the latest run; rebuild journaled-but-not-locked bindings from the remote; complete remaining docs via the existing `computePlan` + `applyPlan` path; idempotent (already-applied → 0 writes)
- Dry-run by default (shows planned repairs, 0 writes) and `--apply` flag executes repairs
- `RepairReport` with stable diagnostic codes (repaired / skipped / needs-human-action)
- Journal-lost fallback (rebuild from lock + Confluence; else from Confluence + Git)
- PRESERVATION of INV-SAFE-1: read + reconcile, never a blind overwrite; divergence/missing reported and stopped

### 1.2 Out of Scope & Known Gaps

- **Full drift-lifecycle repair** (moved pages, permission asymmetry, rename/reparent) — MS-0004, out of scope for this story
- **Reverse-sync conflict resolution** — MS-0005+, out of scope
- **Automatic/scheduled repair** — manual invocation only for MS-0002 (Q1 resolved)
- **New domain primitives** — `reconcileWithProperty`, `rebuildLockFromConfluence`, and `replayJournal` are reused unchanged (GH-19, GH-23)
- **Stale parked-plan expiry advisory** — plans are ephemeral for MS-0002 (not persisted), so there is no parked plan to expire; the advisory is a no-op and deferred
- **E2E / Live-sandbox tests** — the story matrix lists only Unit + Integration; BDD lifecycle-invariant coverage is optional (INV-SAFE-1 is preserved by construction via the test strategy)

## 2. References

- Change Specification: `./chg-GH-28-spec.md`
- Story File: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S4--minimal-repair.md` (§Test matrix)
- Testing Strategy: `.ai/rules/testing-strategy.md`
- ADR-0006: `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (repair surface; crash window; disposable cache)
- Existing primitives (reused): `reconcileWithProperty` / `rebuildLockFromConfluence` (GH-19, `tests/unit/domain/state/reconcile.test.ts`); `replayJournal` / `openJournal` (GH-23, `tests/integration/app/crash-replay.test.ts`)
- Code Style: `AGENTS.md` (principles: self-documenting code, no JSDoc restatements)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Stale/dirty lock (sourceCommit mismatch) → `--apply` rebuilds binding from Confluence, atomic lock update, binding matches property, 0 page re-writes | TC-REPAIR-005, TC-REPAIR-006 | Covered |
| AC-F2-1 | Interrupted apply (crash after K of N) → `repair-state --apply` completes remaining N−K docs, each page written at most once across both runs | TC-REPAIR-007, TC-REPAIR-008 | Covered |
| AC-F2-2 | Already-applied (journaled success, remote reflects it) → 0 writes (rebuilt from remote, not re-written) | TC-REPAIR-009 | Covered |
| AC-F4-1 | No flags / `--dry-run` → shows planned repairs, 0 writes | TC-REPAIR-003, TC-REPAIR-010, TC-REPAIR-011 | Covered |
| AC-F4-2 | `--apply` → executes repairs, lock updated | TC-REPAIR-006, TC-REPAIR-008, TC-REPAIR-012 | Covered |
| AC-F3-1 | `RepairReport`: every item has stable diagnostic code + human note, JSON-readable | TC-REPAIR-002, TC-REPAIR-004, TC-REPAIR-011 | Covered |
| AC-F5-1 | Diverged remote (REMOTE_AHEAD/DIVERGED)/absent property/missing page → reported needs-human-action, 0 writes | TC-REPAIR-011, TC-REPAIR-012 | Covered |
| AC-F5-2 | Journal lost (`.marksync/` deleted) → rebuild from lock+Confluence (else Confluence+Git), 0 duplicate writes | TC-REPAIR-013 | Covered |
| AC-CI-1 | `bun run check` green | All TCs | Covered |

### 3.2 Interface Coverage (DM-#)

| Interface ID | Description | TC ID(s) |
|--------------|-------------|----------|
| DM-1 | `RepairReport` schema (per-item list with diagnostic class, stable code, human remediation) | TC-REPAIR-002, TC-REPAIR-011 |
| DM-2 | Stable diagnostic codes (strings: REPAIRED_STALE_LOCK, REPAIRED_CRASH_WINDOW, SKIPPED_ALREADY_APPLIED, NEEDS_HUMAN_ACTION_DIVERGED, etc.) | TC-REPAIR-002, TC-REPAIR-004, TC-REPAIR-011 |
| DM-3 | `repair-state` flags (`--dry-run` default, `--apply`) | TC-REPAIR-003, TC-REPAIR-006, TC-REPAIR-010 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) |
|--------|-------------|----------|
| NFR-REL-7 | Partial-apply recoverability: interrupted apply recoverable without duplicates (each page written at most once) | TC-REPAIR-007, TC-REPAIR-008 |
| NFR-OBS-3 | Diagnostic codes: every repair item carries stable, machine-readable code with human remediation text | TC-REPAIR-002, TC-REPAIR-004, TC-REPAIR-011 |
| NFR-OBS-5 | Plan/diff before write: `--dry-run` performs 0 writes and shows planned repairs | TC-REPAIR-003, TC-REPAIR-010, TC-REPAIR-011 |
| NFR-SEC-1 | No secrets in output: `RepairReport` contains 0 secrets/tokens | TC-REPAIR-002 |
| NFR-PERF-4 | Idempotent rerun: already-applied document produces 0 writes | TC-REPAIR-009 |
| INV-SAFE-1 | No silent overwrite of diverged/missing remote during repair | TC-REPAIR-011, TC-REPAIR-012 |

## 4. Test Types and Layers

This story focuses on **Unit** and **Integration** test tiers per the testing strategy and story test matrix (see `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S4--minimal-repair.md` §Test matrix). E2E/live-sandbox tests are out of scope for this story. BDD lifecycle-invariant coverage is optional (INV-SAFE-1 is preserved by construction via the test strategy's existing coverage).

| Test Tier | Framework | Root Directory | Pattern | Purpose |
|-----------|-----------|----------------|---------|---------|
| **Unit** | `bun:test` | `tests/unit/` | `*.test.ts` | Validate domain logic in isolation: dirty-lock detection via `reconcileWithProperty` result, repair-plan computation, `RepairReport` shape/code stability, dry-run vs apply decision, latest-journal selection |
| **Integration** | `bun:test` + `FakeTarget` mock | `tests/integration/` | `*.test.ts` | Validate end-to-end repair behavior: interrupted-apply → replay → completion (mock target, idempotent, write-counter via `FakeTarget.getWriteCount()`); dirty-lock → rebuild; diverged-remote → stop (0 writes); journal-lost fallback; dry-run vs apply via CLI handler or app-tier function |

**Excluded Tiers:**
- **E2E (live-sandbox)**: Out of scope for this story
- **Gherkin/BDD**: Optional — if a BDD lifecycle-invariant (INV-SAFE-1: "repair-state never overwrites a diverged remote") fits naturally, may be proposed but scope is kept tight per story
- **Golden Fixture**: Not applicable — repair output is not byte-stable snapshot material
- **Mermaid-DOM**: Not applicable — no Mermaid rendering in this story

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-REPAIR-001 | RepairReport shape is valid (per-item list, diagnostic class, code, human note) | Happy Path | Critical | High | AC-F3-1, DM-1, NFR-OBS-3 |
| TC-REPAIR-002 | RepairReport contains no secrets (NFR-SEC-1) | Happy Path | Important | High | AC-F3-1, NFR-SEC-1 |
| TC-REPAIR-003 | Dry-run mode returns planned repairs with 0 writes | Happy Path | Critical | High | AC-F4-1, NFR-OBS-5 |
| TC-REPAIR-004 | Diagnostic codes are stable strings (not numbers, not changing between runs) | Happy Path | Important | High | AC-F3-1, DM-2, NFR-OBS-3 |
| TC-REPAIR-005 | Unit: dirty lock detection via `reconcileWithProperty` result identifies mismatch | Happy Path | Important | High | AC-F1-1, F-1 |
| TC-REPAIR-006 | Integration: stale lock rebuild from Confluence with `--apply`, 0 page re-writes | Happy Path | Critical | High | AC-F1-1, AC-F4-2, F-1, NFR-REL-7 |
| TC-REPAIR-007 | Integration: interrupted apply (crash after K of N) → `repair-state --apply` completes remaining N−K | Happy Path | Critical | High | AC-F2-1, F-2, NFR-REL-7 |
| TC-REPAIR-008 | Integration: interrupted apply recovery asserts each page written at most once (write-counter) | Happy Path | Critical | High | AC-F2-1, AC-F2-2, F-2, NFR-REL-7, NFR-PERF-4 |
| TC-REPAIR-009 | Integration: mid-transaction crash window (journal ahead of lock, remote matches) → rebuild from remote, 0 writes | Edge Case | Critical | High | AC-F2-2, F-2, NFR-PERF-4, RSK-1 |
| TC-REPAIR-010 | Integration: dry-run for interrupted apply shows plan with 0 writes | Happy Path | Important | High | AC-F4-1, NFR-OBS-5 |
| TC-REPAIR-011 | Integration: diverged remote (REMOTE_AHEAD/DIVERGED) → reported needs-human-action, 0 writes | Edge Case | Critical | High | AC-F5-1, F-5, INV-SAFE-1 |
| TC-REPAIR-012 | Integration: absent property/missing page → reported needs-human-action, 0 writes | Edge Case | Important | High | AC-F5-1, F-5, INV-SAFE-1, INV-SAFE-2 |
| TC-REPAIR-013 | Integration: journal lost (`.marksync/` deleted) → rebuild from lock+Confluence, 0 duplicate writes | Corner Case | Important | High | AC-F5-2, F-2, RSK-4 |

### 5.2 Scenario Details

#### TC-REPAIR-001 - RepairReport shape is valid (per-item list, diagnostic class, code, human note)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3, DM-1, NFR-OBS-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` (or app-tier repair orchestration module) → `tests/unit/app/repair.test.ts`
**Tags**: @backend, @diagnostics

**Preconditions**:
- Repair run completed successfully
- `RepairReport` object is available

**Steps**:
1. Call the repair app-tier function with a fresh state (no issues to repair)
2. Capture the returned `RepairReport`
3. Assert the report has an `items` field that is an array
4. Assert each item in `items` has the required fields:
   - `uuid`: string (DocumentId)
   - `sourcePath`: string
   - `diagnosticClass`: one of `"repaired"` | `"skipped"` | `"needs-human-action"`
   - `diagnosticCode`: string (stable code)
   - `humanNote`: string (remediation text)
5. Assert the report is JSON-serializable (no circular references)

**Expected Outcome**:
- `RepairReport` matches the expected schema from DM-1
- All required fields are present on each item
- Report is valid JSON for CI/agent consumption

---

#### TC-REPAIR-002 - RepairReport contains no secrets (NFR-SEC-1)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-1, NFR-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/unit/app/repair.test.ts`
**Tags**: @backend, @privacy, @security

**Preconditions**:
- Repair run completed successfully

**Steps**:
1. Call the repair app-tier function with a fresh state
2. Capture the returned `RepairReport`
3. Serialize the report to JSON string
4. Assert the JSON does NOT contain common secret patterns:
   - API tokens (starts with "Bearer ", "sk_", "pat_")
   - Passwords (key names like "password", "passwd", "secret", "apiKey")
   - Email addresses (unless used as non-secret identifiers)
5. Assert the report contains only document identities (UUID, source path), diagnostic codes, and remediation text

**Expected Outcome**:
- Repair report contains zero secrets/tokens
- Only non-sensitive data appears in the output (NFR-SEC-1)

---

#### TC-REPAIR-003 - Dry-run mode returns planned repairs with 0 writes

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F4-1, F-4, NFR-OBS-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/unit/app/repair.test.ts`
**Tags**: @backend, @dry-run

**Preconditions**:
- Repair app-tier function accepts a dry-run flag (default true)

**Steps**:
1. Call the repair app-tier function with `dryRun: true` (default, no explicit flag)
2. Capture the returned `RepairReport`
3. Assert the report contains the planned repairs (e.g., if lock is dirty, report item shows `diagnosticClass: "repaired"`)
4. Assert no `TargetSystem` port methods were called (no writes to Confluence)
5. Assert the committed lock file was NOT modified (no lock write)

**Expected Outcome**:
- Dry-run shows the planned repairs in the report
- Zero writes to Confluence (0 page updates, 0 property updates)
- Committed lock unchanged
- NFR-OBS-5 satisfied (plan before write)

---

#### TC-REPAIR-004 - Diagnostic codes are stable strings (not numbers, not changing between runs)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-1, DM-2, NFR-OBS-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/unit/app/repair.test.ts`
**Tags**: @backend, @diagnostics

**Preconditions**:
- Repair run produces various diagnostic classes (repaired, skipped, needs-human-action)

**Steps**:
1. Call the repair app-tier function with state that produces multiple repair items
2. Capture the returned `RepairReport`
3. Assert each `diagnosticCode` is a string (not a number, not an enum)
4. Assert the codes are stable strings matching the expected set (illustrative from spec Appendix A):
   - `"REPAIRED_STALE_LOCK"` (or similar)
   - `"REPAIRED_CRASH_WINDOW"`
   - `"SKIPPED_ALREADY_CONSISTENT"`
   - `"SKIPPED_ALREADY_APPLIED"`
   - `"NEEDS_HUMAN_ACTION_DIVERGED"`
   - `"NEEDS_HUMAN_ACTION_MISSING_PROPERTY"`
   - `"NEEDS_HUMAN_ACTION_MISSING_PAGE"`
5. Assert codes do not contain random elements (no UUIDs, no timestamps)

**Expected Outcome**:
- Diagnostic codes are stable, human-readable strings
- Codes are machine-readable for CI/agents (NFR-OBS-3)
- No randomness in codes (same situation produces same code)

---

#### TC-REPAIR-005 - Unit: dirty lock detection via `reconcileWithProperty` result identifies mismatch

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F1-1, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/unit/app/repair.test.ts`
**Tags**: @backend, @diagnosis

**Preconditions**:
- `reconcileWithProperty` function exists and is imported (from GH-19)
- Test setup creates a `PageBinding` and a `MetadataProperty` with mismatched `sourceCommit`

**Steps**:
1. Create a `PageBinding` with `sourceCommit: "abc123"`
2. Create a `MetadataProperty` (parsed JSON) with `sourceCommit: "def456"` (mismatch)
3. Call `reconcileWithProperty(binding, property)`
4. Assert the result is `LockDirty` (the dirty-lock signal)
5. Call the repair app-tier diagnostic function with this state
6. Assert the `RepairReport` contains an item with `diagnosticClass: "repaired"` and a code like `"REPAIRED_STALE_LOCK"`

**Expected Outcome**:
- `reconcileWithProperty` correctly detects the dirty lock (sourceCommit mismatch)
- Repair diagnostic identifies this as a repairable stale lock
- Report item carries the appropriate diagnostic code

---

#### TC-REPAIR-006 - Integration: stale lock rebuild from Confluence with `--apply`, 0 page re-writes

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, AC-F4-2, F-1, NFR-REL-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @mocked-api, @dirty-lock

**Preconditions**:
- `FakeTarget` mock set up with fixture page and `marksync.metadata` property
- Committed lock has binding with stale `sourceCommit` (mismatch vs property)
- Remote page still matches what MarkSync wrote (no divergence)

**Steps**:
1. Set up `FakeTarget` with:
   - Fixture page at `pageId: "page-111"`, version 2, body `<h1>Doc A</h1>`
   - Property `marksync.metadata` with `sourceCommit: "def456"` (current state)
2. Set up committed lock with binding for the same page:
   - `pageId: "page-111"`
   - `sourceCommit: "abc123"` (stale, mismatch vs property)
3. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
4. Call repair app-tier function with `dryRun: false` (or `--apply` flag)
5. Capture the returned `RepairReport`
6. Assert `fakeTarget.getWriteCount() === 0` (no page body writes, no property writes for rebuild)
7. Assert the lock was updated (new lock binding has `sourceCommit: "def456"`, matches property)
8. Assert `RepairReport` contains an item with `diagnosticClass: "repaired"` and code like `"REPAIRED_STALE_LOCK"`
9. Assert `fakeTarget.updatePageCalls` is empty (no page body updates)
10. Assert `fakeTarget.putPropertyCalls` is empty (no property writes — property was only read)

**Expected Outcome**:
- Binding rebuilt from Confluence via `rebuildLockFromConfluence` (read-only operation)
- Lock updated atomically to match property
- Zero page re-writes (0 writes to `updatePage`)
- Zero property writes (property was only read, not written)
- `RepairReport` shows the repair

---

#### TC-REPAIR-007 - Integration: interrupted apply (crash after K of N) → `repair-state --apply` completes remaining N−K

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, NFR-REL-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`, pattern from `tests/integration/app/crash-replay.test.ts`)
**Tags**: @backend, @integration, @mocked-api, @crash-recovery

**Preconditions**:
- `FakeTarget` mock set up with N = 3 fixture pages
- Initial sync runs with `crashAfter: 2` (test hook from `src/app/push-flow.ts`)
- Journal file exists with 2 journaled `"success"` entries (crashed after 2 of 3)
- Committed lock only reflects the first 2 bindings (or is stale)

**Steps**:
1. Set up `FakeTarget` with 3 fixture pages (doc-a, doc-b, doc-c) at version 1
2. Set up committed lock with 3 bindings (all LOCAL_AHEAD, sourceContentHash changed)
3. Execute `applyPlan` with `crashAfter: 2` (throws `CRASH_AFTER_2`)
4. Assert the journal file has 2 entries with `outcome: "success"`
5. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
6. Call repair app-tier function with `dryRun: false` (or `--apply` flag)
7. Capture the returned `RepairReport`
8. Assert `fakeTarget.getWriteCount() === 1` (only the remaining 1 of 3 docs written)
9. Assert `RepairReport` shows 2 items with `diagnosticClass: "skipped"` (already-applied via journal) and 1 item with `diagnosticClass: "repaired"` (completed the crash window doc)
10. Assert the final lock has all 3 bindings updated

**Expected Outcome**:
- Repair completes the remaining N−K documents (K=2, N=3, so 1 doc written)
- Journaled-but-not-locked bindings are rebuilt from remote (0 duplicate writes)
- `RepairReport` shows the correct per-item diagnostics

---

#### TC-REPAIR-008 - Integration: interrupted apply recovery asserts each page written at most once (write-counter)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-F2-2, F-2, NFR-REL-7, NFR-PERF-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @mocked-api, @crash-recovery, @idempotency

**Preconditions**:
- `FakeTarget` mock set up with N = 3 fixture pages
- Initial sync runs with `crashAfter: 2` (test hook)
- Journal file exists with 2 journaled `"success"` entries

**Steps**:
1. Set up `FakeTarget` with 3 fixture pages (doc-a, doc-b, doc-c) at version 1
2. Set up committed lock with 3 bindings (all LOCAL_AHEAD)
3. Execute `applyPlan` with `crashAfter: 2` (throws `CRASH_AFTER_2`)
4. Assert `fakeTarget.getWriteCount() === 2` (first run wrote 2 docs before crash)
5. Do NOT reset the `FakeTarget` write counter (keep the cumulative count)
6. Call repair app-tier function with `dryRun: false` (or `--apply` flag)
7. Assert `fakeTarget.getWriteCount() === 3` (cumulative: 2 from crash run + 1 from repair = 3 total, exactly N)
8. Verify that `fakeTarget.updatePageCalls` has 3 entries total:
   - First 2 from the crashed run (doc-a, doc-b)
   - Third from the repair run (doc-c)
   - No duplicate calls to any page (each page ID appears at most once)

**Expected Outcome**:
- Each page written **at most once** across the crashed run and the repair run combined
- Write counter shows exactly N writes total (3 for N=3)
- No duplicate writes to any page (NFR-REL-7 satisfied)

---

#### TC-REPAIR-009 - Integration: mid-transaction crash window (journal ahead of lock, remote matches) → rebuild from remote, 0 writes

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, F-2, NFR-PERF-4, RSK-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`, manual journal fixture)
**Tags**: @backend, @integration, @mocked-api, @crash-recovery, @idempotency

**Preconditions**:
- `FakeTarget` mock set up with fixture page that reflects the journaled operation
- Journal file contains a `{op, pageId, uuid, outcome:"success"}` entry for a doc whose binding is **not** in the committed lock (or whose binding lags) — this is the mid-transaction crash window state (journal recorded success before `saveLock` completed)
- Remote page matches what MarkSync would have written (no divergence)

**Steps**:
1. Set up `FakeTarget` with fixture page at version 2 (reflects the journaled operation)
2. Set the `marksync.metadata` property with `sourceCommit: "def456"`, version 2, etc. (matches remote state)
3. Committed lock is empty for this page (or has a stale binding with `sourceCommit: "abc123"` that lags the property) — simulate that `saveLock` did not complete after the journal append
4. **Manually construct the crash-window journal fixture**:
   - Create a temporary cache directory: `<cacheDir>/journal/`
   - Generate a run-id: `runId = "01901234567890000000000000"`
   - Write a journal file: `<cacheDir>/journal/${runId}.jsonl` with one JSONL entry:
     ```
     {"op":"update","pageId":"page-111","uuid":"doc-uuid-001","outcome":"success","version":2,"timestamp":"2026-07-15T10:30:00.000Z"}
     ```
   - This entry records "success" but the lock does not reflect it — the crash window
5. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
6. Call repair app-tier function with `dryRun: false` (or `--apply` flag)
7. Capture the returned `RepairReport`
8. Assert `fakeTarget.getWriteCount() === 0` (0 page writes — binding rebuilt from remote, not re-written)
9. Assert `RepairReport` contains an item with:
   - `diagnosticClass: "repaired"` (rebuilt from remote to close the crash window)
   - `diagnosticCode: "REPAIRED_CRASH_WINDOW"` (stable code for this scenario)
10. Assert the lock was updated to contain the binding with `sourceCommit: "def456"` (rebuilt from remote via `rebuildLockFromConfluence`)
11. Verify the binding's metadata matches the property: `sourceCommit`, `version`, `parentPageId`, etc.

**Expected Outcome**:
- Mid-transaction crash window detected: journaled success op not reflected in lock
- Binding rebuilt from the remote via `rebuildLockFromConfluence` (0 page writes)
- Already-applied document produces 0 writes (NFR-PERF-4 satisfied)
- Lock is updated to match the journaled state (recovery complete)
- `RepairReport` shows repaired with diagnostic code `REPAIRED_CRASH_WINDOW` (RSK-1 covered)
- No duplicate page writes — crash window closed safely

---

#### TC-REPAIR-010 - Integration: dry-run for interrupted apply shows plan with 0 writes

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, NFR-OBS-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @dry-run

**Preconditions**:
- `FakeTarget` mock set up with N = 3 fixture pages
- Journal file exists with 2 journaled `"success"` entries
- Committed lock is stale

**Steps**:
1. Set up `FakeTarget` with 3 fixture pages
2. Set up committed lock with 3 bindings (all stale)
3. Set up journal file with 2 entries (crashed after 2 of 3)
4. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
5. Call repair app-tier function with `dryRun: true` (or no flag, default)
6. Capture the returned `RepairReport`
7. Assert `fakeTarget.getWriteCount() === 0` (no writes in dry-run)
8. Assert `RepairReport` shows:
   - 2 items with `diagnosticClass: "skipped"` (already-applied via journal)
   - 1 item with `diagnosticClass: "repaired"` (would complete the crash window doc)
9. Assert the committed lock was NOT modified

**Expected Outcome**:
- Dry-run shows the planned repairs in the report
- Zero writes to Confluence (0 page updates, 0 property updates)
- Committed lock unchanged
- Report shows exactly what would happen on `--apply`

---

#### TC-REPAIR-011 - Integration: diverged remote (REMOTE_AHEAD/DIVERGED) → reported needs-human-action, 0 writes

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F5-1, F-5, INV-SAFE-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @mocked-api, @safety, @divergence

**Preconditions**:
- `FakeTarget` mock set up with fixture page that diverged (REMOTE_AHEAD or DIVERGED classification)
- Journal file may or may not exist (scenario applies regardless)
- Committed lock is stale

**Steps**:
1. Set up `FakeTarget` with fixture page at version 2, body `<h1>Doc A</h1>` (lock reflects this state)
2. Set up committed lock with binding for the same page at version 2 (current)
3. Set up `marksync.metadata` property matching the lock's binding (`sourceCommit: "abc123"`, etc.)
4. Simulate divergence: use `fakeTarget.setPage(pageId, { version: 3, body: "<h1>Modified by user</h1>" })` to change the remote page body so `bodyHash` differs (the divergence trigger; `remoteChanged` uses bodyHash, not version alone)
5. Optionally also advance the version (optional, body change is the load-bearing trigger)
6. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
7. Call repair app-tier function with `dryRun: false` (or `--apply` flag)
8. Capture the returned `RepairReport`
9. Assert `fakeTarget.getWriteCount() === 0` (no writes to diverged remote)
10. Assert `RepairReport` contains an item with `diagnosticClass: "needs-human-action"` and code like `"NEEDS_HUMAN_ACTION_DIVERGED"`
11. Assert the human note explains the divergence and recommends manual resolution
12. Assert the lock was NOT modified (binding left untouched)

**Expected Outcome**:
- Diverged remote is reported as needs-human-action
- Zero writes to the diverged remote (INV-SAFE-1 preserved)
- Lock remains untouched (repair stops, does not auto-fix divergence)
- `RepairReport` provides clear guidance for human action

---

#### TC-REPAIR-012 - Integration: absent property/missing page → reported needs-human-action, 0 writes

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F5-1, F-5, INV-SAFE-1, INV-SAFE-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @mocked-api, @safety, @missing

**Preconditions**:
- `FakeTarget` mock set up with fixture page (or page missing)
- `marksync.metadata` property is absent or unreadable (or page is missing)

**Steps**:
1. **Subtest 1: Absent property**
   a. Set up `FakeTarget` with fixture page at version 2
   b. Set up `marksync.metadata` property to `undefined` (absent)
   c. Call repair with `dryRun: false`
   d. Assert `fakeTarget.getWriteCount() === 0`
   e. Assert `RepairReport` contains `needs-human-action` with code like `"NEEDS_HUMAN_ACTION_MISSING_PROPERTY"`

2. **Subtest 2: Missing page**
   a. Set up `FakeTarget` with NO fixture page for the binding's pageId
   b. Call repair with `dryRun: false`
   c. Assert `fakeTarget.getWriteCount() === 0`
   d. Assert `RepairReport` contains `needs-human-action` with code like `"NEEDS_HUMAN_ACTION_MISSING_PAGE"`
   e. Assert no page creation was attempted (0 createPage calls)

**Expected Outcome**:
- Absent property or missing page is reported as needs-human-action
- Zero writes to Confluence (no page creation, no property writes)
- INV-SAFE-1 and INV-SAFE-2 preserved (no silent overwrite, no silent re-create)
- `RepairReport` distinguishes between missing property and missing page

---

#### TC-REPAIR-013 - Integration: journal lost (`.marksync/` deleted) → rebuild from lock+Confluence, 0 duplicate writes

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F5-2, F-2, RSK-4, DEC-6
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/app/repair.ts` → `tests/integration/app/repair.test.ts` (using `FakeTarget`)
**Tags**: @backend, @integration, @mocked-api, @corner-case

**Preconditions**:
- `FakeTarget` mock set up with fixture pages and properties
- Committed lock exists (or does not exist, for secondary subtest)
- `.marksync/` cache directory is deleted (journal lost)

**Steps**:
1. **Subtest 1: Journal lost, lock exists**
   a. Set up `FakeTarget` with 3 fixture pages at version 2
   b. Set up committed lock with 3 bindings at version 2 (already consistent)
   c. Delete the `.marksync/` cache directory (simulate journal lost)
   d. Reset `FakeTarget` write counter: `fakeTarget.resetWriteCounter()`
   e. Call repair app-tier function with `dryRun: false`
   f. Assert `fakeTarget.getWriteCount() === 0` (no writes — lock and Confluence already consistent)
   g. Assert `RepairReport` shows 3 items with `diagnosticClass: "skipped"` (already consistent)

2. **Subtest 2: Journal lost, lock also gone (R1 CEO-resolved)**
    a. Set up `FakeTarget` with 3 fixture pages at version 2, each with `marksync.metadata` property (page IDs: page-111, page-222, page-333)
    b. Extend `FakeTarget` with a programmable `searchPages` result (per plan Phase 5, RSK-R1): call `fakeTarget.setSearchResults([{ id: "page-111" }, { id: "page-222" }, { id: "page-333" }])` so the repair can discover page IDs without a lock or journal
    c. Delete the committed lock file (simulate both lock and journal lost)
    d. Delete the `.marksync/` cache directory
    e. Call repair app-tier function with `dryRun: false`
    f. Assert repair discovers pages via `target.searchPages()` and rebuilds bindings from Confluence property + Git (reads pages and properties)
    g. Assert `fakeTarget.getWriteCount() === 0` (no writes — rebuild is read-only)
    h. Assert new lock file is created with bindings rebuilt from property + Git
    i. Assert `RepairReport` shows 3 items with `diagnosticClass: "repaired"` and code like `"REPAIRED_REBUILD_FROM_REMOTE"`

**Expected Outcome**:
- Journal-lost recovery rebuilds from lock + Confluence (primary path)
- If lock also gone, rebuild from Confluence property + Git (fallback per DEC-6)
- Zero duplicate writes in both cases
- Recovery succeeds without data loss

---

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local development**: Primary environment for unit and integration tests
- **Mock Confluence server**: Integration tests use `FakeTarget` (from `tests/_helpers/fake-target.ts`) to mock Confluence API behavior (page read/update, property read/write, version conflict simulation)
- **No live Confluence tenant required**: E2E tests are out of scope for this story

### 6.2 Test Data Generation and Cleanup

- **Unit tests**: Use in-memory fixtures for `PageBinding`, `MetadataProperty`, `RepairReport` objects
- **Integration tests**: Use `FakeTarget` with ephemeral state per test; call `resetWriteCounter()` before each test to isolate write counts
- **Temporary directories**: Use `tmpdir()` + `mkdtempSync()` for cache/journal directories; clean up with `rmSync()` in `afterEach`
- **Fixture pages**: Add fixture pages via `fakeTarget.addFixture({ id, title, version, spaceId })`
- **Property fixtures**: Set properties via `fakeTarget.setMetadataProperty(pageId, json)` or through `putProperty` calls

### 6.3 Isolation Strategy

- **Unit tests**: No external dependencies; all inputs constructed in test
- **Integration tests**: `FakeTarget` provides isolated mock state per test; call `resetWriteCounter()` before each test
- **No shared state**: Each test is independent; no tests depend on previous test state
- **Journal isolation**: Each test uses its own temporary cache directory; journal files are not shared between tests

## 7. Automation Plan and Implementation Mapping

### 7.1 Unit Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-REPAIR-001 | `tests/unit/app/repair.test.ts` | New | None (pure function) | To Implement |
| TC-REPAIR-002 | `tests/unit/app/repair.test.ts` | New | None (output validation) | To Implement |
| TC-REPAIR-003 | `tests/unit/app/repair.test.ts` | New | None (dry-run flag) | To Implement |
| TC-REPAIR-004 | `tests/unit/app/repair.test.ts` | New | None (code stability) | To Implement |
| TC-REPAIR-005 | `tests/unit/app/repair.test.ts` | New | `reconcileWithProperty` import (from GH-19) | To Implement |

**Execution Command:**
```bash
bun test tests/unit/app/repair.test.ts
```

### 7.2 Integration Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-REPAIR-006 | `tests/integration/app/repair.test.ts` | New | `FakeTarget` (from `tests/_helpers/fake-target.ts`), temp cache dir | To Implement |
| TC-REPAIR-007 | `tests/integration/app/repair.test.ts` | New | `FakeTarget`, `crashAfter: 2` pattern from `tests/integration/app/crash-replay.test.ts` | To Implement |
| TC-REPAIR-008 | `tests/integration/app/repair.test.ts` | New | `FakeTarget`, write counter (`getWriteCount()`) | To Implement |
| TC-REPAIR-009 | `tests/integration/app/repair.test.ts` | New | `FakeTarget`, journal file setup via `openJournal` / `replayJournal` | To Implement |
| TC-REPAIR-010 | `tests/integration/app/repair.test.ts` | New | `FakeTarget`, journal file setup | To Implement |
| TC-REPAIR-011 | `tests/integration/app/repair.test.ts` | New | `FakeTarget` with diverged page state (advanced version) | To Implement |
| TC-REPAIR-012 | `tests/integration/app/repair.test.ts` | New | `FakeTarget` with absent property or missing page | To Implement |
| TC-REPAIR-013 | `tests/integration/app/repair.test.ts` | New | `FakeTarget`, deleted cache dir, deleted lock file | To Implement |

**Execution Command:**
```bash
bun test tests/integration/app/repair.test.ts
```

**Mock Target Write-Counter Pattern (for AC-F2-1 / AC-F2-2):**
```typescript
// Use FakeTarget's write counter to assert "each page written at most once"
fakeTarget.resetWriteCounter();  // Reset before first run
await applyPlan(plan, fakeTarget, lock, { ..., crashAfter: 2 });
const writesAfterCrash = fakeTarget.getWriteCount();  // Should be 2
// DO NOT reset before repair (keep cumulative count)
await repairFunction(...);
const writesAfterRepair = fakeTarget.getWriteCount();  // Should be 3 (N = 3)
expect(writesAfterRepair).toBe(3);  // Exactly N total, no duplicates
```

**Existing Primitive Reuse (from spec §12):**
- `reconcileWithProperty` / `rebuildLockFromConfluence`: Already tested in `tests/unit/domain/state/reconcile.test.ts` (GH-19)
- `replayJournal` / `openJournal`: Already tested in `tests/integration/app/crash-replay.test.ts` (GH-23)
- `crashAfter` hook: Already validated in `tests/integration/app/crash-replay.test.ts` (throws `CRASH_AFTER_${crashAfter}` after K successful mutations)

### 7.3 CI Integration

All tests run in the fast loop CI (`.github/workflows/ci.yml`):
```yaml
- run: bun test tests/unit/ tests/integration/
```

### 7.4 Test Coverage Summary

- **Unit tests**: 1 test file covering `RepairReport` shape, secrets validation, dry-run behavior, diagnostic code stability, dirty-lock detection
- **Integration tests**: 1 test file covering stale-lock rebuild, interrupted-apply recovery, idempotency, dry-run vs apply, divergence/missing handling, journal-lost fallback
- **Total test scenarios**: 13 TCs covering all ACs and NFRs

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Misclassifying a crash-window op (journaled success, remote still matches) as safe rebuild when remote actually diverged → silent overwrite | H | M | Integration tests (TC-REPAIR-011) explicitly test divergence stop; rebuild-from-remote path applies ONLY when classify shows agreement (F-5, INV-SAFE-1) | L |
| Choosing wrong/latest journal run to resume | M | L | Unit/integration tests validate latest-journal selection; idempotency makes re-application safe (already-applied → 0 writes) | L |
| Write-counting mock target (`FakeTarget.getWriteCount()`) does not accurately track duplicate writes | H | L | `FakeTarget` already has write counter (line 39, 76-85 in `tests/_helpers/fake-target.ts`); increment on every `createPage`/`updatePage` call; verify counter increments correctly | L |
| `repair-state` silently overwrites a remote edit (safety regression) | H | L | TC-REPAIR-011 and TC-REPAIR-012 assert 0 writes on divergence/missing; repair is read + reconcile by construction | L |

### 8.2 Assumptions

- `reconcileWithProperty` / `rebuildLockFromConfluence` (GH-19) exist, are correct, and are reused unchanged
- `replayJournal` / `openJournal` (GH-23) exist, are correct, and are reused unchanged
- `FakeTarget` mock exists and has write counter (`getWriteCount()` / `resetWriteCounter()`)
- `crashAfter` test hook exists in `applyPlan` (`ApplyOptions.crashAfter`) and throws `CRASH_AFTER_${crashAfter}` after K successful mutations (validated in `tests/integration/app/crash-replay.test.ts`)
- `TargetSystem` port exposes `getProperty`, `getPage`, and `putProperty`, all already implemented by Confluence adapter
- `CommandResult<T>` envelope and exit-code map are stable and reused (GH-16)
- `repair-state` subcommand is already registered in CLI router; only handler and flags are new
- App-tier repair orchestration mirrors the `push-flow` + thin-CLI-handler split (DEC-1 tier rules)

### 8.3 Open Questions

None. All open questions were CEO-resolved before this story (see spec §14: OQ-1 deferred to plan-writer for sequencing; this test plan does not prescribe internal sequencing).

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Change Test Plan Writer | Initial test plan creation for GH-28 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-REPAIR-001 | TBD | TBD | Pending implementation |
| TC-REPAIR-002 | TBD | TBD | Pending implementation |
| TC-REPAIR-003 | TBD | TBD | Pending implementation |
| TC-REPAIR-004 | TBD | TBD | Pending implementation |
| TC-REPAIR-005 | TBD | TBD | Pending implementation |
| TC-REPAIR-006 | TBD | TBD | Pending implementation |
| TC-REPAIR-007 | TBD | TBD | Pending implementation |
| TC-REPAIR-008 | TBD | TBD | Pending implementation |
| TC-REPAIR-009 | TBD | TBD | Pending implementation |
| TC-REPAIR-010 | TBD | TBD | Pending implementation |
| TC-REPAIR-011 | TBD | TBD | Pending implementation |
| TC-REPAIR-012 | TBD | TBD | Pending implementation |
| TC-REPAIR-013 | TBD | TBD | Pending implementation |