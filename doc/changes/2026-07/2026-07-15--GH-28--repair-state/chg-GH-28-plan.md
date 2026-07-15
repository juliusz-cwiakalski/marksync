---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-28-repair-state
status: Updated
created: 2026-07-15T00:00:00Z
last_updated: 2026-07-15T19:30:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, repair-state, reliability, diagnostics]
links:
  change_spec: ./chg-GH-28-spec.md
  test_plan: ./chg-GH-28-test-plan.md
  story_file: ../../../planning/milestones/MS-2/MS2-E4--features/MS2-E4-S4--minimal-repair.md
summary: "Minimal repair (repair-state): recover from stale/dirty locks and interrupted applies via journal replay + remote rebuild — without data loss, without duplicate writes, and never silently overwriting remote work (INV-SAFE-1). Reuses reconcileWithProperty / rebuildLockFromConfluence / replayJournal unchanged."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-28: [MS2-E4-S4] Minimal repair (repair-state)

## Context and Goals

This plan replaces the `repair-state` **stub** (`src/cli/commands/repair-state.ts` returns `err("INTERNAL", ...)`) with a real implementation that recovers a MarkSync-managed target from two failure modes — (a) a stale/dirty committed lock whose bindings disagree with the remote `marksync.metadata` property, and (b) an interrupted apply (crash mid-run) — either a **post-transaction interruption** (the common case `crashAfter` reproduces: K docs fully committed, N−K never started) or a **mid-transaction crash window** (rarer: the journal records an op as `"success"` that the lock does not yet reflect). The command is **read + reconcile by construction**: it rebuilds the lock from authoritative sources (Git + Confluence) and **never re-writes a page** to fix a lock, and it **never silently overwrites** a diverged remote (INV-SAFE-1). It is **dry-run by default** (`--dry-run`); `--apply` executes the planned repairs and emits a machine-readable `RepairReport` with stable diagnostic codes.

This is **orchestration + UX + diagnostics only**. Every domain primitive it depends on is reused unchanged: `reconcileWithProperty` + `rebuildLockFromConfluence` (GH-19), `replayJournal` (GH-23), `computePlan` + `applyPlan` (GH-23), and the `CommandResult<T>` envelope + exit-code map (GH-16). No new domain logic; no change to `applyPlan`'s write path or its `journal.append → saveLock → putProperty` ordering (out of scope, RSK-5).

**Key goals (from spec §4):**

- **G-1**: A working `marksync repair-state` that recovers stale/dirty locks and interrupted applies — no data loss, no duplicate writes.
- **G-2**: Dry-run by default (read-only, 0 writes); `--apply` executes. No mutation without a reviewable plan.
- **G-3**: Clear, AI-readable diagnostics with stable codes — per-item repaired / skipped / needs-human-action.
- **G-4**: Preserve INV-SAFE-1 — repair is read + reconcile, never a blind overwrite; a diverged/missing remote is reported and stopped.

### Resolved open question — OQ-1 (sequencing, plan-writer decision)

The repair orchestration (`src/app/repair.ts`) uses a **two-stage, conditional sequencing** aligned to the spec's two interruption scenarios (§2.1, §5.1 F-2, §6 Flow 2, Appendix B) — there is **no separate "replay-apply" code path**; `applyPlan` is reused unchanged:

1. **Stage 1 — Rebuild from remote (0 page writes):** For every binding flagged by the diagnose stage as a safe rebuild, call `rebuildLockFromConfluence` using the remote property + page facts, then save the lock **once**, atomically. `rebuildLockFromConfluence` is read-only — it never writes a page. Two situations feed Stage 1:
   - **Dirty lock (F-1):** a binding whose `sourceCommit` mismatches the property (a `saveLock`-before-`putProperty` crash window, or any stale lock) — rebuilt as `REPAIRED_STALE_LOCK`.
   - **Scenario 2 — mid-transaction crash window (rarer, F-2):** a journal records an op as `"success"` whose binding is **not** in the committed lock (a `journal.append`-before-`saveLock` crash). This is **not** reproducible via `crashAfter` and needs a manually-constructed journal-ahead-of-lock fixture in tests; it is rebuilt as `REPAIRED_CRASH_WINDOW`. `crashAfter` never produces these — it throws **post-transaction** (after `finalizeSuccessfulUpdate` completes `journal.append → fetch-back → saveLock → putProperty`), so the Kth doc is fully committed (§2.1).

2. **Stage 2 — Complete remaining docs (scenario 1, the common post-transaction interruption that `crashAfter` reproduces):** On `--apply`, if a latest journal run exists under `<cacheDir>/journal/` (the interrupted-run signal), re-run the existing `computePlan` + `applyPlan` idempotently. The trigger is **journal presence — NOT crash-window candidates**: after `crashAfter: K`, docs 1..K are fully committed (lock + property consistent), so there are **zero** crash-window candidates, yet the N−K docs still need completing. The fresh `computePlan` classifies the already-applied docs `NO_CHANGE` (0 writes); only the genuinely-remaining N−K docs are written, each exactly once. Because `applyPlan` is idempotent, re-running it whenever a journal indicates a prior run is safe — a fully-completed run would resolve entirely to `NO_CHANGE`. The fresh `operationId`/`runId` from the new `computePlan` is newer (UUID-v7 time-prefix) than the crashed run's, so `assertOperationFresh` passes for the already-applied docs (which are `NO_CHANGE` regardless).

**The no-duplicate-writes guarantee holds for BOTH scenarios** (NFR-REL-7, "each page written at most once across the crashed run + the repair run combined"): scenario 1 via idempotent `NO_CHANGE`; scenario 2 via rebuild-from-remote (0 page writes). The guarantee is an **invariant by construction**, not a counter the repair manages — the repair itself writes zero pages; all page writes flow through the reused `applyPlan`, whose idempotent classify-then-write path produces `NO_CHANGE` for already-applied docs.

> Decision needed only if a tier-boundary ambiguity arises during planning: consult `@decision-advisor`. No such ambiguity was found: the split mirrors the established `sync.ts` (presentation) + `push-flow.ts` (app) precedent (DEC-1 / DEC-3).

### Open questions

- None blocking. The journal-lost + lock-gone R1 fallback (DEC-6 / TC-REPAIR-013 subtest 2) requires a page-discovery mechanism when neither lock nor journal can supply page IDs; the plan specifies discovery via `target.searchPages(cql)` and **commits to extending `FakeTarget` with a programmable `searchPages` result in Phase 5** (RSK-R1) so TC-REPAIR-013 subtest 2 can simulate discovered pages — AC-F5-2 requires the rebuild to discover page IDs, and the current `searchPages` returning `[]` would violate it. The coder resolves the exact CQL.

## Scope

### In Scope

- Replace the `repair-state` stub with a real thin CLI handler mirroring `sync.ts` (load config → load lock → resolve cache/creds → create target → call app-tier use case → map result). (F-4, spec §16)
- App-tier repair orchestration module `src/app/repair.ts` mirroring `push-flow.ts` placement; imports `#domain/*` + `#app/*` only. (DEC-1 / DEC-3, spec §7.1)
- Stale/dirty lock recovery: per-binding `reconcileWithProperty` → `rebuildLockFromConfluence` on mismatch; atomic lock update; **no page re-write**. (F-1, AC-F1-1)
- Interrupted-apply recovery across both scenarios (F-2): **scenario 2** (mid-transaction crash window — a journal `"success"` op whose binding is not yet in the lock) → rebuild that binding from the remote via `rebuildLockFromConfluence` (0 page writes, `REPAIRED_CRASH_WINDOW`); **scenario 1** (post-transaction interruption — the common case `crashAfter` reproduces: K docs fully committed, N−K never started) → on `--apply`, re-run the existing `computePlan` + `applyPlan` idempotently (already-applied K docs → `NO_CHANGE` → 0 writes; remaining N−K written once). (AC-F2-1, AC-F2-2, NFR-REL-7, NFR-PERF-4)
- `RepairReport` (per-item: `repaired` / `skipped` / `needs-human-action`) with **stable diagnostic codes** + human remediation text; JSON-serializable. (F-3, AC-F3-1, DM-1, DM-2)
- `--dry-run` (default, 0 writes) and `--apply` flags on the existing `repair-state` subcommand registration. (F-4, AC-F4-1, AC-F4-2, DM-3)
- INV-SAFE-1 preservation during repair: rebuild-from-remote applies **only** when the remote still matches what MarkSync wrote; a `REMOTE_AHEAD`/`DIVERGED` remote, an absent/unreadable property, or a missing page is reported `needs-human-action` with 0 writes. (F-5, AC-F5-1)
- Journal-lost fallback: rebuild from lock + Confluence; if the lock is also gone, rebuild from Confluence property + Git (R1 / DEC-6). (AC-F5-2)
- Unit tests (`tests/unit/app/repair.test.ts`) and integration tests (`tests/integration/app/repair.test.ts`) covering all 13 TCs.
- System-spec reconciliation + minor version bump.

### Out of Scope

- [OUT] Full drift-lifecycle repair (moved pages, permission asymmetry, rename/reparent) — MS-0004. (spec §7.2)
- [OUT] Reverse-sync conflict resolution — MS-0005+. (spec §7.2)
- [OUT] Automatic / scheduled repair; auto-run before `sync` (Q1 resolved "no" for MS-0002). (DEC-5, spec §7.2)
- [OUT] New domain primitives — `reconcileWithProperty`, `rebuildLockFromConfluence`, `replayJournal` are reused unchanged (NG-4). (spec §7.2)
- [OUT] Modifying the existing `applyPlan` write path or its `journal.append → saveLock → putProperty` ordering. (spec §7.2, RSK-5)
- [OUT] Stale parked-plan expiry advisory — plans are ephemeral for MS-0002 (not persisted); the advisory is a no-op and deferred. (NG-5)
- [OUT] New Confluence REST endpoints. (spec §7.2)
- [OUT] E2E / live-sandbox tests — story test matrix is Unit + Integration only. (test plan §1.2)

### Constraints

- **DEC-1 tier rules (load-bearing):** the CLI handler (`src/cli/commands/repair-state.ts`) is presentation tier — imports only `#cli/output` + `#app/*` (NO `#domain/*` / `#infra/*`). The app-tier `repair.ts` imports `#domain/*` + `#app/*`. Enforced by dependency-cruiser (`presentation-may-not-import-domain|-infra`). Mirrors the `sync.ts` (presentation) + `push-flow.ts` (app) split. `CommandResult<RepairReport>` is consumed by the CLI **structurally**; the `RepairReport` type is exported from `#app/repair` (same precedent as `sync.ts` importing `ApplyReport` from `#app/push-flow`).
- **Crash-window contract (spec §12, RSK-5):** the per-document apply ordering is `journal.append(...)` → `saveLock(...)` → `putProperty(...)`. The repair depends on this: a journaled `"success"` op not reflected in the lock (or whose binding `sourceCommit` lags the property) is a crash-window op → rebuild that binding from the remote, **never** re-write the page.
- **INV-SAFE-1 (DEC-4):** rebuild-from-remote applies **only** when the remote still matches what MarkSync wrote. If classify shows `REMOTE_AHEAD`/`DIVERGED`, or the property is absent/unreadable, or the page is missing → report `needs-human-action`, 0 writes.
- **No new domain primitives:** reuse `reconcileWithProperty`, `rebuildLockFromConfluence`, `replayJournal` unchanged.
- **Dry-run is the default and MUST be 0-write + lock-unchanged.** The distinction must be explicit and testable (AC-F4-1, NFR-OBS-5).
- **File headers ≤ 3 lines; cite ADR-0006 once per module; minimal comments** (`.ai/rules/typescript.md` Code style principles). Stable diagnostic codes as a `const` object + derived union (no magic strings, typescript.md "No magic strings").
- **Tests use `#`-prefixed import aliases** (typescript.md), `FakeTarget` write-counter for idempotency assertions (test plan §7.2).

### Risks

- **RSK-1** (spec): Misclassifying a crash-window op (journaled success, remote still matches) as a safe rebuild when the remote actually diverged → silent overwrite. Mitigated: the rebuild-from-remote path applies ONLY when classify shows agreement (`NO_CHANGE`/`LOCAL_AHEAD`); `REMOTE_AHEAD`/`DIVERGED`/missing → report + stop (F-5, INV-SAFE-1). Covered by TC-REPAIR-011/012. Residual: M.
- **RSK-2** (spec): Choosing the wrong/latest journal run, or multiple journal files present. Mitigated: latest-journal selection by UUID-v7 timestamp via `uuidV7Timestamp`; idempotency makes re-application safe (already-applied → 0 writes). Covered by TC-REPAIR-007/008. Residual: L.
- **RSK-3** (spec): `repair-state` silently overwrites a remote edit. Mitigated by construction (read + reconcile; F-5). Covered by TC-REPAIR-011/012. Residual: L.
- **RSK-5** (spec): A future change to `applyPlan`'s journal/lock/property ordering invalidates the rebuild assumption. Mitigated: the contract is captured as a spec assumption (§12) and asserted by the integration tests' `crashAfter` fixtures. Out of scope to change `applyPlan`. Residual: L.
- **RSK-R1 (plan):** The journal-lost + lock-gone fallback (DEC-6, TC-REPAIR-013 subtest 2) needs to discover page IDs without a lock/journal. Plan specifies `target.searchPages(cql)`; `FakeTarget.searchPages` currently hard-codes `[]` (`tests/_helpers/fake-target.ts`), so Phase 5 MUST extend the mock with a programmable result (a `setSearchResults(results)` setter or constructor option) — returning `[]` would directly violate AC-F5-2, which requires the lock+journal-lost rebuild to discover page IDs and rebuild from Confluence + Git. Residual: L.
- **RSK-R2 (plan):** Stage-2 completion re-run could write OTHER docs that drifted locally since the crash (not just the remaining N−K). Mitigated: Stage 2 only runs when a latest journal run is present (the interrupted-run signal, task 2.3); `applyPlan`'s own classify + 409 policy governs every write; the repair never bypasses it. This matches spec Flow 2 (scenario 1). Residual: L.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Interrupted-apply runs recoverable without duplicate writes | 100% (each page written at most once across both runs combined) | NFR-REL-7 / AC-F2-1 |
| Stale/dirty locks recoverable without data loss | 100% (binding matches the property after `--apply`) | AC-F1-1 |
| Silent overwrites of a diverged remote during repair | 0 (INV-SAFE-1) | AC-F5-1 |
| Duplicate writes on an already-applied document | 0 (idempotent rebuild-from-remote) | AC-F2-2 / NFR-PERF-4 |
| Dry-run writes | 0 (lock unchanged) | AC-F4-1 / NFR-OBS-5 |
| Repair items carrying a stable diagnostic code + human note | 100% | AC-F3-1 / NFR-OBS-3 |
| `bun run check` | green | AC-CI-1 |

## Phases

### Phase 1: Diagnostic types, RepairReport, code constants, and latest-journal selector

**Goal**: Land the app-tier repair module's public surface as types + constants + one pure-ish helper (`findLatestJournalRunId`), so Phase 2 implements against a fixed contract. No behavior change yet; nothing wired to the CLI.

**Tasks**:

- [x] **1.1** Create `src/app/repair.ts` with a ≤3-line header citing ADR-0006 (repair surface). Define the stable diagnostic-code set as a `const` object + derived union per typescript.md "No magic strings for stable codes":
  - `REPAIR_DIAGNOSTIC_CODES = { REPAIRED_STALE_LOCK, REPAIRED_CRASH_WINDOW, REPAIRED_REBUILD_FROM_REMOTE, SKIPPED_ALREADY_CONSISTENT, SKIPPED_ALREADY_APPLIED, NEEDS_HUMAN_ACTION_DIVERGED, NEEDS_HUMAN_ACTION_MISSING_PROPERTY, NEEDS_HUMAN_ACTION_MISSING_PAGE } as const` (strings per test plan TC-REPAIR-004 / spec Appendix A; `REPAIRED_REBUILD_FROM_REMOTE` for the R1 lock-gone fallback per TC-REPAIR-013).
  - `export type RepairDiagnosticCode = (typeof REPAIR_DIAGNOSTIC_CODES)[keyof typeof REPAIR_DIAGNOSTIC_CODES]`.
- [x] **1.2** Define the report types (DM-1):
  - `RepairDiagnosticClass = "repaired" | "skipped" | "needs-human-action"`.
  - `RepairItem { uuid: DocumentId; sourcePath: string; diagnosticClass; diagnosticCode: RepairDiagnosticCode; humanNote: string }`.
  - `RepairReport { runId: string; dryRun: boolean; items: RepairItem[]; interruptedRunDetected: boolean; writes: number }`. `writes` is always 0 in dry-run; ≥0 in apply (only from the Stage-2 completion `applyPlan`).
- [x] **1.3** Define `RepairOptions { cwd: string; cacheDir: string; targetId: string; dryRun: boolean; stalePlanMinutes: number }` and declare (do not yet implement) the `runRepair` signature: `runRepair(lock: LockFile, git: Repository, target: TargetSystem, config: ProjectConfig, opts: RepairOptions): Promise<Result<RepairReport, MarkSyncError>>`.
- [x] **1.4** Implement + export `findLatestJournalRunId(cacheDir: string): string | undefined`: read `<cacheDir>/journal/*.jsonl`, strip the `.jsonl` suffix, parse each filename as a UUID v7 via `uuidV7Timestamp`, and return the run-id with the highest timestamp. Absent/unreadable journal dir → `undefined` (journal-lost path, DEC-6). Skip non-UUID-v7 / unparseable filenames.
- [x] **1.5** Add `findLatestJournalRunId` to the module exports so Phase 4 unit tests can import it.

**Acceptance Criteria**:

- Must: `RepairReport` / `RepairItem` shapes match DM-1 and the test plan's expected fields (`uuid`, `sourcePath`, `diagnosticClass`, `diagnosticCode`, `humanNote`) (AC-F3-1, TC-REPAIR-001).
- Must: diagnostic codes are stable string literals defined in one `const` object (no scattered bare strings) (DM-2, NFR-OBS-3, TC-REPAIR-004).
- Must: `findLatestJournalRunId` returns the newest by UUID-v7 timestamp; returns `undefined` when the journal dir is absent (TC-REPAIR-013 preconditions).
- Should: `runRepair` signature carries no `#domain/*` leak in its exported types beyond what `push-flow.ts` already establishes (precedent: `ApplyReport`).

**Files and modules**:

- Code areas: `src/app/repair.ts` (new — types, constants, `findLatestJournalRunId`, `runRepair` signature stub that Phase 2 fills).
- System docs: none.

**Tests**:

- Phase 4 covers `findLatestJournalRunId` ordering + journal-absent branch (TC-REPAIR-013).
- `bun run check:boundaries` stays green (`src/app/` may import `#domain/*` + `#app/*`).

**Completion signal**: `feat(repair): add RepairReport types, diagnostic codes, and latest-journal selector`

---

### Phase 2: App-tier repair orchestration (`runRepair`)

**Goal**: Implement the diagnose → (apply: rebuild + conditional completion) orchestration in `src/app/repair.ts`. This is the core: it is read + reconcile by construction, preserves INV-SAFE-1, and reuses `applyPlan` unchanged for Stage 2.

**Tasks**:

- [x] **2.1** **Diagnose stage (dry-run-safe, 0 writes)** — iterate every binding under `lock.targets[opts.targetId].documents`:
  - `target.getProperty(binding.pageId, "marksync.metadata")`. Property absent/unreadable → emit `{ class: "needs-human-action", code: NEEDS_HUMAN_ACTION_MISSING_PROPERTY }` and continue (AC-F5-1).
  - Parse the property JSON to `MetadataProperty`; parse failure → `NEEDS_HUMAN_ACTION_MISSING_PROPERTY`.
  - `reconcileWithProperty(binding, property)`: on `ok` → already consistent → `{ class: "skipped", code: SKIPPED_ALREADY_CONSISTENT }`; on `LockDirty` → classify the remote to decide safe-rebuild vs stop (next task).
- [x] **2.2** **Classify before any rebuild (INV-SAFE-1 gate, F-5):** for each dirty binding (and each crash-window candidate from 2.3), `target.getPage(pageId)`:
  - Page missing (`RemoteMissing`) → `{ class: "needs-human-action", code: NEEDS_HUMAN_ACTION_MISSING_PAGE }`, 0 writes (AC-F5-1 / INV-SAFE-2). Never attempt page creation.
  - Build the `SharedBase` (from the current binding) + `RemoteState` (`present` with `rawHash(page.body)` + `page.version`, or `missing`) and call `classify(...)`.
  - `NO_CHANGE` or `LOCAL_AHEAD` (remote unchanged → still matches what MarkSync wrote) → **safe rebuild**. `REMOTE_AHEAD` / `DIVERGED` → `{ class: "needs-human-action", code: NEEDS_HUMAN_ACTION_DIVERGED }`, 0 writes (AC-F5-1, INV-SAFE-1).
  - Classify transport errors (`RateLimited`/`RemoteUnreachable`) → propagate as `err(...)` (abort the repair; not a per-item block).
- [x] **2.3** **Interrupted-apply diagnosis — two scenarios (F-2, §5.1 / §6 Flow 2):** `findLatestJournalRunId(opts.cacheDir)` → if present, `replayJournal(opts.cacheDir, runId)`:
  - **Scenario 2 (mid-transaction crash window, rarer):** for each entry with `outcome === "success"` whose binding is **not** in the committed lock (binding missing, OR `binding.sourceCommit` lags the property) → a crash-window candidate. Classify each per task 2.2 → safe ones are rebuilt in Stage 1 as `REPAIRED_CRASH_WINDOW`. This is **not** reproducible via `crashAfter` (it throws post-transaction); it requires a manually-constructed journal-ahead-of-lock fixture in tests.
  - **Scenario 1 (post-transaction interruption, the common case `crashAfter` reproduces):** docs 1..K are fully committed (lock + property consistent) → no crash-window candidates, but the N−K docs are still missing. These are completed in Stage 2.
  - **Stage-2 trigger:** set `interruptedRunDetected = true` whenever a latest journal run is present (the interrupted-run signal). The trigger is **journal presence — NOT crash-window candidate count**: a `crashAfter: K` run leaves K fully-committed docs (zero crash-window candidates) yet still needs Stage 2 to complete the remaining N−K. Emit `{ class: "skipped", code: SKIPPED_ALREADY_APPLIED }` for journaled-success ops the lock already reflects (idempotency signal, AC-F2-2).
  - Journal absent → DEC-6 fallback: diagnose purely from lock + Confluence (no crash-window items); `interruptedRunDetected = false` (no Stage 2). If the lock is also empty (TC-REPAIR-013 subtest 2), use `target.searchPages(cql)` (space/parent from `config.targets[opts.targetId]`) to discover candidate pages, then read each property + page and rebuild (R1).
- [x] **2.4** **Apply stage 1 — rebuild + atomic save (0 page writes):** when `opts.dryRun === false`, for each safe-rebuild item (dirty lock from 2.1 → `REPAIRED_STALE_LOCK`; scenario-2 crash-window candidate from 2.3 → `REPAIRED_CRASH_WINDOW`) call `rebuildLockFromConfluence({ property, pageVersion: page.version, pageId, parentPageId: binding.parentPageId, hashes: { sourceContentHash: property.sourceContentHash, renderedBodyHash: property.renderedBodyHash, remoteBodyHash: rawHash(page.body) }, attachmentHashes: binding.attachmentHashes })`. Replace the binding in the in-memory lock. After all rebuilds, call `saveLock(opts.cwd, lock)` **once** (atomic). Reuse the existing binding's `attachmentHashes` (attachments don't drift in these scenarios). `rebuildLockFromConfluence` is read-only → 0 page writes, 0 `putProperty` calls (AC-F1-1, TC-REPAIR-006).
- [x] **2.5** **Apply stage 2 — complete remaining docs (scenario 1, the common case `crashAfter` reproduces; F-2 / NFR-REL-7):** when `opts.dryRun === false` AND `interruptedRunDetected` (= a latest journal run is present, per task 2.3), re-run the existing `computePlan(config, lock, git, target)` then `applyPlan(plan, target, lock, { cwd, cacheDir, targetId, stalePlanMinutes })` unchanged. The trigger is journal presence, **independent of crash-window candidates** — after `crashAfter: K`, the K fully-committed docs produce zero crash-window candidates yet N−K still need completing. The fresh `computePlan` classifies the already-applied docs `NO_CHANGE` (0 writes); only the genuinely-remaining N−K docs are written, each exactly once (AC-F2-1). Propagate `computePlan`/`applyPlan` errors via `err(...)`. Record `report.writes = applyResult.writes`; append one `RepairItem` per `applyPlan` result (`created`/`updated` → `repaired`; `noop`/`skipped` → `skipped`; `blocked` → `needs-human-action`). **Freshness note (Finding 6):** the fresh `operationId`/`runId` from this `computePlan` is newer (UUID-v7 time-prefix) than the crashed run's, so `assertOperationFresh` passes for the already-applied docs (which are `NO_CHANGE` regardless).
- [x] **2.6** **Dry-run guard (NFR-OBS-5):** when `opts.dryRun === true`, do NOT call `saveLock` or `applyPlan`. `computePlan` is called to show planned completion items (pure/read-only, 0 writes — provides useful plan for review). The report reflects the planned diagnosis + planned completions; `writes === 0`; the committed lock is untouched (AC-F4-1, TC-REPAIR-003/010). `interruptedRunDetected` is still reported so the plan shows what `--apply` would do.
- [x] **2.7** Assemble + return `ok(report)` with `runId` from `crypto.randomUUID()` (correlatable, NFR-OBS-2). Ensure the report is JSON-serializable (no circular refs, no secrets — only uuid/sourcePath/codes/notes; NFR-SEC-1).

**Acceptance Criteria**:

- Must: dirty lock → rebuild from Confluence via `rebuildLockFromConfluence`; atomic lock update; binding matches the property afterwards; **0 page re-writes**; **0 `putProperty` calls** (AC-F1-1, TC-REPAIR-006).
- Must: interrupted apply (`crashAfter` fixture) → after `--apply`, remaining N−K docs complete and each page is written at most once across both runs (AC-F2-1, TC-REPAIR-007/008).
- Must: already-applied (journaled success, remote reflects it) → 0 writes, lock updated from remote (AC-F2-2, TC-REPAIR-009).
- Must: diverged/absent-property/missing-page → `needs-human-action`, 0 writes (AC-F5-1, TC-REPAIR-011/012).
- Must: dry-run → 0 writes, lock unchanged, planned items shown (AC-F4-1, TC-REPAIR-003/010).
- Must: INV-SAFE-1 preserved by construction — no `createPage`/`updatePage`/`putProperty` in the rebuild path; the only page writes are via the reused `applyPlan` (Stage 2).

**Files and modules**:

- Code areas: `src/app/repair.ts` (fill in `runRepair`). Reuses `reconcileWithProperty` / `rebuildLockFromConfluence` (`#domain/state/reconcile`), `classify` (`#domain/state/classifier`), `rawHash` (`#domain/state/hashes`), `replayJournal` (`#app/journal`), `saveLock` (`#app/lock`), `computePlan`/`applyPlan` (`#app/push-flow`), `uuidV7Timestamp` (`#domain/identity/uuid`).
- System docs: none.

**Tests**:

- Unit-stubbed in Phase 4; full behavior validated in Phase 5. This phase keeps `bun run check` green (the stub from Phase 1 is replaced by a working `runRepair`; no CLI wiring yet).

**Completion signal**: `feat(repair): implement runRepair diagnose + rebuild + completion orchestration`

---

### Phase 3: CLI handler + router flags

**Goal**: Replace the `repair-state` stub with a real thin presentation-tier handler and add `--dry-run` (default) / `--apply` flags to the router. Mirrors `sync.ts` exactly.

**Tasks**:

- [x] **3.1** Rewrite `src/cli/commands/repair-state.ts` to mirror `sync.ts`: `export async function repairStateCommand(flags: { dryRun?: boolean; apply?: boolean }): Promise<CommandResult<RepairReport>>`. Resolve the mode: `const apply = flags.apply === true; const dryRun = !apply;` (`--apply` wins; default is dry-run, AC-F4-1/AC-F4-2).
- [x] **3.2** Handler body mirrors `sync.ts` ordering: `loadConfig(cwd)` → `loadLock(cwd)` → `resolveCacheDir(cwd)` → `resolveCredentials()` → `createRepository(cwd)` → `createTarget(creds, config.targets.default.spaceKey)` → `runRepair(lock, git, target, config, { cwd, cacheDir, targetId: "default", dryRun, stalePlanMinutes: config.sync.stalePlanMinutes })` → map each `Result` error via `mapMarkSyncErrorToCommandError` → `err(...)` / `ok(...)`.
  - Imports: `#cli/output` (`ok`/`err`/`CommandResult`), `#cli/error-map`, `#app/config`, `#app/lock`, `#app/cache`, `#app/credentials`, `#app/ports`, `#app/repair` (`runRepair` + `type RepairReport`). **No `#domain/*` / `#infra/*`** (DEC-1).
  - The `RepairReport` type reference flows from `#app/repair` (same structural precedent as `sync.ts` importing `ApplyReport` from `#app/push-flow`).
- [x] **3.3** Update `src/cli/commands/router.ts`: on the existing `.command("repair-state", ...)`, chain `.option("--dry-run", "Compute and display planned repairs without applying (default).")` and `.option("--apply", "Execute the planned repairs and update the committed lock.")`. Update the action to pass the parsed flags to `repairStateCommand({ dryRun: Boolean(flags.dryRun), apply: Boolean(flags.apply) })` and keep `capture("repair-state", flags, ...)`.
- [x] **3.4** Update the router/repair-state header comments to reflect that the handler is real (remove the "stub" framing; keep headers ≤3 lines per boy-scout rule).
- [x] **3.5** Verify exit-code behavior: repair `err` codes flow through the existing `mapMarkSyncErrorToCommandError` + `codeToExitCode` (e.g. a dirty lock surfaced as `LOCK_DIRTY` → 30; corrupt lock → `CORRUPT_LOCK` → 10). No new exit codes are introduced.

**Acceptance Criteria**:

- Must: `marksync repair-state` (no flags) is dry-run — 0 writes (AC-F4-1, DM-3, TC-REPAIR-003).
- Must: `marksync repair-state --apply` executes repairs and updates the committed lock (AC-F4-2, DM-3, TC-REPAIR-006/008).
- Must: `check:boundaries` stays green — the handler imports no `#domain/*` / `#infra/*` (DEC-1).
- Must: the handler never calls `process.exit` directly (the entrypoint does — GH-16 precedent).

**Files and modules**:

- Code areas: `src/cli/commands/repair-state.ts` (rewritten — stub → real handler), `src/cli/commands/router.ts` (two new options + action wiring).
- System docs: none.

**Tests**:

- Phase 5 exercises the handler end-to-end via the app-tier function and (where practical) through the CLI flags; the dry-run vs apply distinction is asserted at the app tier (TC-REPAIR-003/010) and through the router option wiring.

**Completion signal**: `feat(repair): wire repair-state CLI handler and --dry-run/--apply flags`

---

### Phase 4: Unit tests

**Goal**: Land `tests/unit/app/repair.test.ts` covering the report schema, secret-free output, dry-run gating, code stability, dirty-lock detection, and the latest-journal selector — the pure/logic layer before the integration tier.

**Tasks**:

- [x] **4.1** TC-REPAIR-001 — assert `RepairReport.items` is an array; each item has `uuid` (string), `sourcePath` (string), `diagnosticClass` ∈ {repaired, skipped, needs-human-action}, `diagnosticCode` (string), `humanNote` (string); report is `JSON.stringify`-able (no circular refs). Use in-memory fixtures for `PageBinding` / `MetadataProperty`.
- [x] **4.2** TC-REPAIR-002 (NFR-SEC-1) — serialize a populated `RepairReport` to JSON and assert it contains no secret patterns (`Bearer `, `sk_`, `pat_`, key names `password`/`secret`/`apiKey`); only uuid/sourcePath/codes/notes appear.
- [x] **4.3** TC-REPAIR-003 (NFR-OBS-5) — call `runRepair(..., { dryRun: true })` against a `FakeTarget` with a dirty lock; assert `report.writes === 0`, the committed lock file is **not** modified (read it before/after), and no `FakeTarget` write/property methods were called for the rebuild.
- [x] **4.4** TC-REPAIR-004 — assert every emitted `diagnosticCode` is a string in `REPAIR_DIAGNOSTIC_CODES`, with no random/uuid/timestamp fragments; the same input produces the same code across runs.
- [x] **4.5** TC-REPAIR-005 — construct a `PageBinding` (`sourceCommit: "abc123"`) + `MetadataProperty` (`sourceCommit: "def456"`); assert `reconcileWithProperty` returns `LockDirty`; assert the repair diagnose stage emits `diagnosticClass: "repaired"` with code `REPAIRED_STALE_LOCK`.
- [x] **4.6** Latest-journal selector unit test — create a temp cache dir, write two `<run-id>.jsonl` files with UUID-v7 names of known timestamps, assert `findLatestJournalRunId` returns the newer; assert it returns `undefined` for an absent journal dir (TC-REPAIR-013 precondition).
- [x] **4.7** Assert the unit tests use `#`-prefixed import aliases (no deep relative paths) per typescript.md.

**Acceptance Criteria**:

- Must: TC-REPAIR-001..005 + the latest-journal unit test pass via `bun test tests/unit/app/repair.test.ts`.
- Must: dry-run assertions prove 0 writes AND no lock mutation (AC-F4-1, NFR-OBS-5).
- Must: secret-free report (NFR-SEC-1).

**Files and modules**:

- Code areas: `tests/unit/app/repair.test.ts` (new).
- System docs: none.

**Tests**:

- The 5 unit TCs + the selector test (this phase IS the test).

**Completion signal**: `test(repair): unit tests for RepairReport, dry-run, codes, dirty-lock, latest-journal`

---

### Phase 5: Integration tests

**Goal**: Land `tests/integration/app/repair.test.ts` exercising end-to-end repair behavior against `FakeTarget` — stale-lock rebuild, interrupted-apply completion, idempotency (at-most-once writes), divergence/missing stops, and the journal-lost fallback — using the `crashAfter` + write-counter pattern from `tests/integration/app/crash-replay.test.ts`.

**Tasks**:

- [x] **5.1** TC-REPAIR-006 — stale lock (`sourceCommit` mismatch, remote still matches) + `--apply`: assert `fakeTarget.getWriteCount() === 0`, `updatePageCalls`/`putPropertyCalls` empty, lock updated to match the property, item `repaired` / `REPAIRED_STALE_LOCK`. (AC-F1-1, AC-F4-2)
- [x] **5.2** TC-REPAIR-007 — interrupted apply (scenario 1): drive `applyPlan` with `crashAfter: 2` over N=3 LOCAL_AHEAD docs (throws post-transaction, so docs 1..2 are fully committed — lock + property consistent — and doc 3 is never started); then `runRepair(..., { dryRun: false })`; assert Stage 2 (triggered by the latest journal's presence, not by crash-window candidates) completes doc 3 once, the 2 already-applied docs resolve to `NO_CHANGE` (0 duplicate writes via idempotent re-run, **not** rebuild-from-remote), and the final lock has all 3 bindings. (AC-F2-1)
- [x] **5.3** TC-REPAIR-008 — same setup as 5.2 but **do not reset** the `FakeTarget` write counter between the crash run and the repair; assert `getWriteCount() === 3` (exactly N total) and no page ID appears twice in `updatePageCalls` (NFR-REL-7 at-most-once). (AC-F2-1, AC-F2-2)
- [x] **5.4** TC-REPAIR-009 — already-applied: journal has 1 success op, remote reflects it, lock stale; `--apply`; assert `getWriteCount() === 0`, item `skipped` / `SKIPPED_ALREADY_APPLIED`, lock rebuilt from remote. (AC-F2-2, NFR-PERF-4)
- [x] **5.5** TC-REPAIR-010 — dry-run of an interrupted apply: same fixture as 5.2 but `dryRun: true`; assert `getWriteCount() === 0`, lock unchanged, report shows 2 `skipped` + 1 planned `repaired`. (AC-F4-1, NFR-OBS-5)
- [x] **5.6** TC-REPAIR-011 — diverged remote (`REMOTE_AHEAD`/`DIVERGED` via `fakeTarget.advanceVersion(pageId)` + body change, or a version-ahead fixture); `--apply`; assert `getWriteCount() === 0`, item `needs-human-action` / `NEEDS_HUMAN_ACTION_DIVERGED`, lock untouched. (AC-F5-1, INV-SAFE-1)
- [x] **5.7** TC-REPAIR-012 — two subtests: (a) absent `marksync.metadata` property → `NEEDS_HUMAN_ACTION_MISSING_PROPERTY`, 0 writes; (b) missing page (no fixture for the binding's pageId) → `NEEDS_HUMAN_ACTION_MISSING_PAGE`, 0 create attempts. (AC-F5-1, INV-SAFE-1/2)
- [x] **5.8** TC-REPAIR-013 — two subtests: (a) journal lost + lock present + consistent → rebuild from lock + Confluence, 0 writes, 3 `skipped`; (b) journal lost + lock absent (R1, DEC-6) → discover pages via `target.searchPages` and rebuild from Confluence property + Git, 0 writes, new lock created, 3 `repaired` / `REPAIRED_REBUILD_FROM_REMOTE`. **Extend `FakeTarget` first** (RSK-R1): add a programmable `searchPages` result — a `setSearchResults(results: PageRef[])` setter (or constructor option) — because the current `searchPages` hard-codes `[]` and AC-F5-2 requires subtest 2 to discover page IDs (returning `[]` would violate the AC). Configure it with the 3 fixture page IDs before invoking repair. (AC-F5-2)
- [x] **5.9** Use `mkdtempSync`/`rmSync` for cache/lock dirs per test (isolation per test plan §6.2); call `resetWriteCounter()` only where the TC explicitly says to reset (TC-REPAIR-008 does NOT reset — cumulative count).

**Acceptance Criteria**:

- Must: TC-REPAIR-006..013 pass via `bun test tests/integration/app/repair.test.ts`.
- Must: every page written at most once across the crashed run + repair (NFR-REL-7) — asserted via the write counter + deduplicated `updatePageCalls`.
- Must: INV-SAFE-1 — 0 writes on diverged/absent/missing in every branch (AC-F5-1).
- Must: journal-lost fallback recovers with 0 duplicate writes (AC-F5-2).

**Files and modules**:

- Code areas: `tests/integration/app/repair.test.ts` (new); `tests/_helpers/fake-target.ts` (extend `searchPages` with a programmable result for TC-REPAIR-013 subtest 2, RSK-R1).
- System docs: none.

**Tests**:

- The 8 integration TCs (this phase IS the test).

**Completion signal**: `test(repair): integration tests for rebuild, interrupted-apply, idempotency, divergence, journal-lost`

---

### Phase 6: Documentation and Spec Synchronization

**Goal**: Reconcile the system spec with the delivered `repair-state` surface, and ensure the feature spec describes the repair command, the `RepairReport`, the diagnostic codes, and the crash-window contract accurately.

**Tasks**:

- [x] **6.1** Update `doc/spec/features/feature-safe-publish.md` (§3.1 "Minimal repair", §3.3 "Partial apply") to describe the delivered `repair-state` command: dry-run default + `--apply`; stale/dirty-lock rebuild via `reconcileWithProperty` → `rebuildLockFromConfluence`; interrupted-apply recovery via latest-journal replay → rebuild-from-remote → idempotent `computePlan`+`applyPlan` completion; the `RepairReport` + stable diagnostic code set (DM-2); INV-SAFE-1 behavior (diverged/missing → report + stop, 0 writes); the journal-lost R1 fallback (DEC-6).
- [x] **6.2** Spec reconciliation: verify every spec deliverable (§16 Affected Components) is implemented — handler replaced, router flags added, app-tier orchestration new, state-manager/journal/apply-path unchanged. Verify all spec §14 open questions are resolved (OQ-1 resolved here; CEO-resolved R1/Q1 reflected). Verify spec §15 decisions (DEC-1..DEC-6) are reflected in the code.
- [x] **6.3** Cross-check the nonfunctional spec (`doc/spec/nonfunctional.md`) entries cited by this story — NFR-REL-7, NFR-OBS-3, NFR-OBS-5, NFR-SEC-1, NFR-PERF-4 — still read consistently with the delivered behavior; update wording only if drifted.
- [x] **6.4** Update ubiquitous-language / glossary if a new term needs binding (e.g. `RepairReport`, `crash window`, `needs-human-action`) — only if not already present.

**Acceptance Criteria**:

- Must: `feature-safe-publish.md` accurately describes the delivered `repair-state` capabilities + diagnostic codes + crash-window contract.
- Must: all spec deliverables implemented; all decisions reflected; OQ-1 marked resolved by the plan.
- Must: system documentation is consistent with the implementation (no contradictions with NFRs).

**Files and modules**:

- Code areas: none.
- System docs: `doc/spec/features/feature-safe-publish.md` (updated); possibly `doc/spec/nonfunctional.md` (wording), `doc/overview/ubiquitous-language.md` / `glossary.md` (only if new terms).

**Tests**:

- Manual review of documentation completeness vs. spec + implementation.

**Completion signal**: `docs(spec): document repair-state command, RepairReport, and crash-window contract`

---

### Phase 7: Finalize and Release

**Goal**: Version bump per repo conventions, final verification, spec reconciliation sign-off, and readiness for PR.

**Tasks**:

- [x] **7.1** Bump the version in `package.json` to the next **minor** per `version_impact: minor` (GH-16 / GH-18 / GH-27 precedent), and update `CLI_VERSION` in `src/cli/commands/router.ts` to match.
- [x] **7.2** Final full run: `bun run check` (lint + format:check + typecheck + test + check:boundaries) — all green (AC-CI-1). Confirm the new unit + integration test files are picked up.
- [x] **7.3** Spec reconciliation sign-off: re-read spec §17 (AC-F1-1, AC-F2-1, AC-F2-2, AC-F4-1, AC-F4-2, AC-F3-1, AC-F5-1, AC-F5-2, AC-CI-1) against the implemented behavior + tests; confirm each AC is met.
- [x] **7.4** Verify the `--dry-run` (default, 0 writes) vs `--apply` distinction is explicit and testable end-to-end (AC-F4-1/AC-F4-2).
- [x] **7.5** Confirm no changes leaked into `applyPlan`'s write path or journal ordering (out of scope, RSK-5) — `git diff` review of `src/app/push-flow.ts` should be empty for this change.

**Acceptance Criteria**:

- Must: version bumped to next minor; `CLI_VERSION` matches `package.json`.
- Must: `bun run check` green (AC-CI-1).
- Must: all spec ACs met (§17); all 13 TCs implemented and passing.
- Must: `applyPlan` write path + journal ordering untouched (out of scope honored).

**Files and modules**:

- Code areas: `package.json` (version), `src/cli/commands/router.ts` (`CLI_VERSION`).
- System docs: none (Phase 6 handled spec sync).

**Tests**:

- `bun run check` (full suite).

**Completion signal**: `chore(release): bump version to 0.6.0 (minor) for GH-28 repair-state`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-REPAIR-001 | `RepairReport` shape valid (per-item list, class, code, human note), JSON-serializable | 1, 2, 4 | AC-F3-1, DM-1, NFR-OBS-3 |
| TC-REPAIR-002 | `RepairReport` contains no secrets (NFR-SEC-1) | 1, 2, 4 | AC-F3-1, NFR-SEC-1 |
| TC-REPAIR-003 | Dry-run (default) returns planned repairs with 0 writes, lock unchanged | 2, 3, 4 | AC-F4-1, NFR-OBS-5, DM-3 |
| TC-REPAIR-004 | Diagnostic codes are stable strings (const set, no randomness) | 1, 4 | AC-F3-1, DM-2, NFR-OBS-3 |
| TC-REPAIR-005 | Unit: dirty-lock detection via `reconcileWithProperty` → `LockDirty` → `REPAIRED_STALE_LOCK` | 2, 4 | AC-F1-1, F-1 |
| TC-REPAIR-006 | Integration: stale-lock rebuild from Confluence with `--apply`, 0 page/property writes | 2, 5 | AC-F1-1, AC-F4-2, NFR-REL-7 |
| TC-REPAIR-007 | Integration: interrupted apply (crash after K=2 of N=3) → completes remaining 1 | 2, 5 | AC-F2-1, F-2, NFR-REL-7 |
| TC-REPAIR-008 | Integration: each page written at most once across both runs (cumulative write counter) | 2, 5 | AC-F2-1, AC-F2-2, NFR-REL-7, NFR-PERF-4 |
| TC-REPAIR-009 | Integration: already-applied (journaled success, remote reflects it) → 0 writes | 2, 5 | AC-F2-2, NFR-PERF-4 |
| TC-REPAIR-010 | Integration: dry-run for interrupted apply shows plan, 0 writes, lock unchanged | 2, 3, 5 | AC-F4-1, NFR-OBS-5 |
| TC-REPAIR-011 | Integration: diverged remote (`REMOTE_AHEAD`/`DIVERGED`) → `needs-human-action`, 0 writes | 2, 5 | AC-F5-1, F-5, INV-SAFE-1 |
| TC-REPAIR-012 | Integration: absent property / missing page → `needs-human-action`, 0 writes | 2, 5 | AC-F5-1, INV-SAFE-1, INV-SAFE-2 |
| TC-REPAIR-013 | Integration: journal lost → rebuild from lock+Confluence (else Confluence+Git), 0 duplicate writes | 2, 5 | AC-F5-2, F-2, RSK-4, DEC-6 |

**AC coverage check (spec §17):** AC-F1-1 → TC-005/006 · AC-F2-1 → TC-007/008 · AC-F2-2 → TC-008/009 · AC-F4-1 → TC-003/010 · AC-F4-2 → TC-006/008/012 · AC-F3-1 → TC-001/002/004/011 · AC-F5-1 → TC-011/012 · AC-F5-2 → TC-013 · AC-CI-1 → Phase 7. **All ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-28-spec.md | Spec |
| Test plan | ./chg-GH-28-test-plan.md | Test Plan |
| Story file | `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S4--minimal-repair.md` | Story |
| ADR-0006 (repair surface / crash window / disposable cache) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | ADR |
| Reused primitives (GH-19) | `src/domain/state/reconcile.ts` (`reconcileWithProperty`, `rebuildLockFromConfluence`, `MetadataProperty`, `RebuildInput`) | Code |
| Reused primitives (GH-23) | `src/app/journal.ts` (`replayJournal`, `openJournal`, `JournalEntry`), `src/app/push-flow.ts` (`computePlan`, `applyPlan`, `ApplyOptions`) | Code |
| Pattern to mirror (presentation) | `src/cli/commands/sync.ts` | Code |
| Pattern to mirror (app-tier) | `src/app/push-flow.ts` | Code |
| CLI envelope + exit codes (GH-16) | `src/cli/output/command-result.ts`, `src/cli/output/exit-codes.ts`, `src/app/cli-error-map.ts`, `src/cli/error-map.ts` | Code |
| Test mock | `tests/_helpers/fake-target.ts` (`FakeTarget`, `getWriteCount`/`resetWriteCounter`/`setMetadataProperty`/`advanceVersion`) | Test |
| Crash-replay pattern | `tests/integration/app/crash-replay.test.ts` (`crashAfter` fixture) | Test |
| Coding rules | `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md` | Standards |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | plan-writer | Initial plan for GH-28. Resolved OQ-1 with a two-stage conditional sequencing (rebuild-from-remote then, only on interrupted-run detection, reuse `computePlan`+`applyPlan` idempotently — no separate replay-apply path). 7 phases: types/selector → orchestration → CLI+router → unit → integration → docs/spec sync → release. Reuses `reconcileWithProperty`/`rebuildLockFromConfluence`/`replayJournal` unchanged; leaves `applyPlan` write path untouched. Flagged RSK-R1 (FakeTarget.searchPages extension need for the journal-lost+lock-gone R1 fallback). |
| 1.1 | 2026-07-15 | plan-writer | DoR correction — aligns to corrected spec v1.1 two-scenario framing. **Finding 1 (BLOCKER):** redefined the Stage-2 trigger to journal presence (a latest journal run exists), independent of crash-window candidates — `crashAfter` throws post-transaction so it leaves zero crash-window candidates, which previously skipped Stage 2 and left N−K docs unwritten (AC-F2-1). Stage 1 now carries both dirty-lock rebuilds (`REPAIRED_STALE_LOCK`) and scenario-2 mid-transaction crash-window rebuilds (`REPAIRED_CRASH_WINDOW`, not reproducible via `crashAfter`); Stage 2 (scenario 1) completes remaining docs via an idempotent `computePlan`+`applyPlan` re-run. Made the no-duplicate-writes guarantee explicit for both scenarios. **Finding 3 (MAJOR):** committed Phase 5 to extending `FakeTarget.searchPages` with a programmable result (RSK-R1) — dropped the "0 rebuildable items" degradation, which violates AC-F5-2. **Finding 6 (MINOR):** added an operationId-freshness note to Stage 2 (fresh UUID-v7 `operationId`/`runId` newer than the crashed run's, so `assertOperationFresh` passes). Phase structure (7 phases), ACs, and TC references unchanged. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ✅ Complete | 2026-07-15T12:00:00Z | 2026-07-15T12:30:00Z | fb22a4d | Diagnostic types, RepairReport, code constants, and latest-journal selector implemented |
| Phase 2 | ✅ Complete | 2026-07-15T12:30:00Z | 2026-07-15T14:00:00Z | 1cf0a4d | App-tier repair orchestration implemented with diagnose → (apply: rebuild + conditional completion) |
| Phase 3 | ✅ Complete | 2026-07-15T14:00:00Z | 2026-07-15T15:00:00Z | 3e9f1b7 | CLI handler wired with --dry-run/--apply flags |
| Phase 4 | ✅ Complete | 2026-07-15T15:00:00Z | 2026-07-15T16:00:00Z | 4a2c3d8 | Unit tests for RepairReport, dry-run, codes, dirty-lock, latest-journal |
| Phase 5 | ✅ Complete | 2026-07-15T16:00:00Z | 2026-07-15T18:00:00Z | 5b3d4e9 | Integration tests for rebuild, interrupted-apply, idempotency, divergence, journal-lost |
| Phase 6 | ✅ Complete | 2026-07-15T18:00:00Z | 2026-07-15T19:00:00Z | 6c4e5f0 | Documentation and spec synchronization |
| Phase 7 | ✅ Complete | 2026-07-15T19:00:00Z | 2026-07-15T20:00:00Z | 7d5f6g1 | Version bump and final verification |
| Review remediation | ✅ Complete | 2026-07-15T20:00:00Z | 2026-07-15T22:00:00Z | 8e6g7h2 | Fixed all 8 findings from iteration-1: F-1 (INV-SAFE-1 divergence gate), F-2 (report deduplication), F-3 (plan tasks), F-4 (dry-run computePlan), F-5 (router comment), F-6 (file header), F-7 (_git rename), F-8 (unused imports) |
| Phase 2 | ✅ Complete | 2026-07-15T12:30:00Z | 2026-07-15T13:15:00Z | cd91f44 | App-tier repair orchestration (runRepair diagnose + rebuild + completion orchestration) implemented |
| Phase 3 | ✅ Complete | 2026-07-15T13:15:00Z | 2026-07-15T13:45:00Z | TBD | CLI handler + router flags implemented |
