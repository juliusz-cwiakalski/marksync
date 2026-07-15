---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-28
  type: feat
  status: Proposed
  slug: repair-state
  title: "[MS2-E4-S4] Minimal repair (repair-state)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, repair-state, reliability, diagnostics]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [state-manager, sync-engine, cli-framework, confluence-adapter]
    external: [Confluence Cloud API]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver a working `marksync repair-state` command that recovers from stale/dirty locks and interrupted applies by orchestrating already-delivered state-manager and journal primitives — without data loss, without duplicate writes, and never silently overwriting remote work (the premortem §14 beachhead requirement, R-USA-3 / NFR-REL-7).

## 1. SUMMARY

This change replaces the `repair-state` **stub** with a real implementation that recovers a MarkSync-managed target from two failure modes: (a) a stale or dirty committed lock whose bindings no longer agree with the remote `marksync.metadata` property, and (b) an interrupted apply (a crash mid-run) where the append-only journal records operations as successful that the lock does not yet reflect. The command is **read + reconcile by construction** — it rebuilds the lock from authoritative sources (Git + Confluence) and replays the journal idempotently, and it MUST NOT silently create pages or overwrite a remote edit (INV-SAFE-1 preserved). It is **dry-run by default** (`--dry-run`); `--apply` executes the planned repairs and emits an AI-readable `RepairReport` with stable diagnostic codes.

This story is **orchestration + UX + diagnostics only**. Every domain primitive it depends on — `reconcileWithProperty`, `rebuildLockFromConfluence` (GH-19), and `replayJournal` / `openJournal` (GH-23) — already exists and is reused as-is.

## 2. CONTEXT

### 2.1 Current State Snapshot

The safe-publish pipeline (MS-0002) writes each document through a `computePlan` (pure dry-run) → `applyPlan` (parent-first, per-document-isolated, journaled) path. The committed `marksync.lock.yml` is the shared base; the remote `marksync.metadata` content property is a cross-check that survives a lost or corrupted lock (ADR-0006). The append-only journal (`.marksync/journal/<run-id>.jsonl`) records each mutation as it completes, and `replayJournal` reads it back (delivered — GH-23).

The `repair-state` subcommand is already registered in the CLI router, but its handler is a **stub** that returns a placeholder `INTERNAL` error ("repair-state is not yet implemented"). No recovery command exists today. The state-manager reconcile/rebuild primitives (`reconcileWithProperty` → `LockDirty`; `rebuildLockFromConfluence`) and the journal reader are available but unwired to any command.

**Critical crash-window fact:** in the apply path, the per-document ordering is `journal.append(...)` **then** `saveLock(...)` **then** `putProperty(...)` (inside `finalizeSuccessfulUpdate`). So if a crash occurs after the journal append but before the lock save, the journal records an operation as `"success"` that the committed lock does NOT yet reflect. Symmetrically, `saveLock` precedes `putProperty`, so a crash between them leaves the lock ahead of the property (a dirty-lock signal on the next reconcile). These are the windows `repair-state` closes.

**Two interruption scenarios — and what `crashAfter` actually reproduces.** The existing `crashAfter` test hook throws AFTER `processEntry` fully returns — i.e. AFTER `finalizeSuccessfulUpdate` has completed the full per-doc sequence (`journal.append` → fetch-back → `saveLock` → `putProperty`) for the Kth document. So `crashAfter: K` reproduces **scenario 1 — a post-transaction interruption**: docs 1..K are fully committed (lock and property consistent) and docs K+1..N were never started. This is the common case. The rarer **scenario 2 — a mid-transaction crash window** (crash inside `finalizeSuccessfulUpdate`, after `journal.append` but before `saveLock`, leaving the journal ahead of the lock) is NOT reproducible via `crashAfter` and requires a manually-constructed journal-ahead-of-lock fixture in tests. Both scenarios are in scope for `repair-state` (F-2).

### 2.2 Pain Points / Gaps

- A single stale or dirty lock, or a single interrupted apply, can leave the committed lock out of sync with Confluence with **no recovery path** — the operator is blocked with no way forward beyond manual editing of the lock or re-running a sync that may duplicate writes.
- A mid-transaction crash window (scenario 2) that is naïvely re-run risks **duplicate writes**: a document already written to Confluence would be written again because the lock never recorded its completion. The operator has no guided way to distinguish this from the safer post-transaction interruption (scenario 1, where a re-run is already idempotent), so the risk is treated as real until diagnosed.
- Today there is no machine-readable diagnosis of *what* diverged and *what* needs human action versus what can be safely auto-repaired, forcing manual inspection of the lock and the journal.
- The premortem (§14 / R-USA-3) identifies "safety mechanisms become permanent blockers" as a top usability risk: one stale lock must never block a whole subtree.

## 3. PROBLEM STATEMENT

Because the safe-publish pipeline lacks a recovery command, an operator who hits a stale/dirty lock or an interrupted apply cannot recover the target without risking duplicate writes or manual lock surgery, resulting in blocked subtrees, potential data inconsistency, and loss of the determinism and audit-trail guarantees that are the tool's brand promise (R-USA-3, NFR-REL-7).

## 4. GOALS

- **G-1**: A working `marksync repair-state` command that recovers from stale/dirty locks and interrupted applies — without data loss and without duplicate writes.
- **G-2**: Dry-run by default (safe, read-only); `--apply` executes repairs. No mutation without a reviewable plan.
- **G-3**: Clear, AI-readable diagnostics with stable diagnostic codes — per-item reporting of what was repaired, what was skipped, and what needs human action.
- **G-4**: Preserve INV-SAFE-1 — repair is read + reconcile, never a blind overwrite; a diverged or missing remote is reported and stopped, not silently "fixed".

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Interrupted-apply runs recoverable without duplicate writes | 100% (each page written at most once across both runs combined) |
| Stale/dirty locks recoverable without data loss | 100% (binding matches the remote property after `--apply`) |
| Silent overwrites of a diverged remote during repair | 0 (INV-SAFE-1) |
| Duplicate writes on an already-applied document | 0 (idempotent rebuild-from-remote) |
| Repair items carrying a stable diagnostic code | 100% |

### 4.2 Non-Goals

- **NG-1**: Full drift-lifecycle repair (moved pages, permission asymmetry, rename/reparent reconciliation) — MS-0004.
- **NG-2**: Reverse-sync conflict resolution — MS-0005+.
- **NG-3**: Automatic or scheduled repair. Manual invocation only for MS-0002 (Q1 resolved: no auto-run before `sync`; MS-0003 may auto-suggest).
- **NG-4**: New domain primitives. `reconcileWithProperty`, `rebuildLockFromConfluence`, and `replayJournal` are already delivered (GH-19, GH-23) and are reused unchanged.
- **NG-5**: Stale parked-plan expiry advisory. For MS-0002 plans are ephemeral (`computePlan` is pure and not persisted to disk), so there is no parked plan to expire. The advisory is a no-op and deferred.

## 5. FUNCTIONAL CAPABILITIES

 | ID | Capability | Rationale |
 |----|------------|-----------|
 | F-1 | Detect and recover stale/dirty lock bindings | A single stale lock must not block a subtree (R-USA-3); the ADR-0006 content-property cross-check enables a no-data-loss rebuild from Confluence. |
 | F-2 | Recover an interrupted apply without duplicate writes | An interrupted apply must be recoverable without duplicates (NFR-REL-7). The common post-transaction interruption (K docs fully committed, N−K never started) is recovered by an idempotent re-run of `computePlan` + `applyPlan` (already-applied → NO_CHANGE → 0 writes); the rarer mid-transaction crash window (journal-append before lock-save) is closed by rebuilding the journaled-but-not-locked binding from the remote rather than re-writing the page. |
 | F-3 | Emit a structured `RepairReport` with stable diagnostic codes | Operators and CI/agents need machine-readable diagnosis of what was repaired, skipped, or needs human action (NFR-OBS-3, informational for MS-0002; ADR-0011 structured output). |
 | F-4 | Dry-run by default, explicit apply | No mutation without a reviewable plan (NFR-OBS-5); safe-by-default with `--apply` as the explicit execute gate. |
 | F-5 | Preserve the no-silent-overwrite invariant during repair | Repair is read + reconcile, never a blind overwrite; a diverged or missing remote is reported and stopped (INV-SAFE-1). |

### 5.1 Capability Details

**F-1: Detect and recover stale/dirty lock bindings** — For each binding in the committed lock, the command fetches the remote `marksync.metadata` content property and runs the existing `reconcileWithProperty(binding, property)` cross-check. On a mismatch (`LockDirty` — a `sourceCommit` disagreement), it reconstructs the binding via `rebuildLockFromConfluence` from the property + page facts (version, page ID, parent) + freshly-derived content hashes, and updates the lock atomically. After repair the binding agrees with the property; no page body is re-written. If the property is absent or the page is missing, the item is reported for human action rather than silently re-created (INV-SAFE-1 / INV-SAFE-2).

**F-2: Recover an interrupted apply** — Two interruption scenarios must be distinguished, with distinct recovery paths:

1. **Post-transaction interruption (the common case, reproduced by `crashAfter`).** The Kth document's full per-doc sequence (`finalizeSuccessfulUpdate`: `journal.append` → fetch-back → `saveLock` → `putProperty`) completed before the interruption, so docs 1..K are fully committed (lock and property consistent) and docs K+1..N were never started. Recovery is the primary path: an idempotent re-run of the existing `computePlan` + `applyPlan`. The already-applied docs resolve to NO_CHANGE (0 writes); the remaining N−K docs are written once each. No journal replay is required — the lock is already consistent for docs 1..K.

2. **Mid-transaction crash window (rarer).** A crash inside `finalizeSuccessfulUpdate` left `journal.append` recorded a doc as `"success"` but `saveLock` did not complete — so the journal is ahead of the lock for that one binding. This is NOT reproducible via `crashAfter` and requires a manually-constructed journal-ahead-of-lock fixture in tests. The command locates the latest journal file(s) and calls `replayJournal(runId)`; for any op journaled as `"success"` whose binding is NOT yet in the committed lock, it rebuilds that binding from the remote via `rebuildLockFromConfluence` instead of re-writing the page (0 page writes), then completes the remaining docs via the idempotent `computePlan` + `applyPlan` path. Symmetrically, `saveLock` precedes `putProperty`, so a crash between them leaves the lock ahead of the property — surfaced as a dirty-lock signal on the next reconcile (covered by F-1).

Both paths preserve the no-duplicate-writes guarantee: scenario 1 via idempotent re-run (already-applied → NO_CHANGE → 0 writes); scenario 2 via rebuild-from-remote (0 page writes). If the journal is absent (the disposable `.marksync/` cache was deleted — ADR-0006 C-3), recovery falls back to rebuilding purely from the lock + Confluence, and if both are gone, from the Confluence property + Git (R1, CEO-resolved).

**F-3: Emit a structured `RepairReport` with stable diagnostic codes** — The command returns a `CommandResult<RepairReport>` carrying a per-item list. Each item names the document (UUID + source path), the diagnostic class — *repaired* / *skipped (no action needed)* / *needs human action* — and a **stable diagnostic code** (e.g. a code for a rebuilt stale lock, a code for a journaled-but-not-locked op rebuilt from remote, a code for a diverged remote that was left untouched). The report is machine-readable as JSON for CI/agents and includes human remediation text per code (NFR-OBS-3).

**F-4: Dry-run by default, explicit apply** — With no flag (or `--dry-run`), the command computes and displays the planned repairs and performs **zero** writes. With `--apply`, it executes the planned repairs, updates the lock atomically, and returns the resulting `RepairReport`. The two flags are added to the existing `repair-state` subcommand registration in the CLI router.

**F-5: Preserve the no-silent-overwrite invariant during repair** — The rebuild-from-remote path applies ONLY when the remote still matches what MarkSync wrote. If the remote diverged (`REMOTE_AHEAD` / `DIVERGED`), or the `marksync.metadata` property is absent/unreadable, or the page is missing, the command reports the item as needing human action and stops — it does not write, re-create, or overwrite (INV-SAFE-1; INV-SAFE-2 for missing pages). The distinction between "journaled success, remote still matches" (safe to rebuild) and "remote diverged" (stop) is the load-bearing safety check.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Stale / dirty lock recovery
  Operator runs `marksync repair-state` → for each binding, fetch remote property → reconcileWithProperty →
  on LockDirty (dry-run): report "would rebuild from Confluence" (0 writes) →
  operator runs `marksync repair-state --apply` → rebuildLockFromConfluence → atomic lock update →
  binding matches property, no page re-written → RepairReport emitted

Flow 2: Interrupted-apply recovery — post-transaction interruption (the common case, reproduced by `crashAfter`)
  A sync interrupted after the Kth doc's full per-doc sequence (finalizeSuccessfulUpdate) →
  docs 1..K fully committed (lock + property consistent), docs K+1..N never started →
  operator runs `marksync repair-state --apply` → re-run computePlan + applyPlan →
  already-applied docs 1..K → NO_CHANGE → 0 writes; remaining N-K docs written once →
  each page written at most once across both runs → RepairReport emitted

  (Mid-transaction crash window — rarer: a crash inside finalizeSuccessfulUpdate left the
  journal ahead of the lock for one binding. NOT reproducible via `crashAfter`; requires a
  manual journal-ahead-of-lock fixture in tests. Recovery: replayJournal(latest runId) →
  rebuild the journaled-but-not-locked binding from the remote (0 page writes) → complete
  remaining docs via computePlan + applyPlan.)

Flow 3: Diverged remote (safety stop)
  A document was edited directly in Confluence → operator runs `marksync repair-state` →
  reconcile / classify detects REMOTE_AHEAD or DIVERGED → report item as "needs human action" → 0 writes (INV-SAFE-1)

Flow 4: Journal lost (.marksync/ deleted)
  Operator deleted the disposable cache → `marksync repair-state --apply` →
  no journal found → rebuild bindings from lock + Confluence property →
  if lock also gone: rebuild from Confluence property + Git → RepairReport emitted (R1)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Replacing the `repair-state` stub with a real implementation.
- Stale/dirty lock recovery: per-binding `reconcileWithProperty` → `rebuildLockFromConfluence` on mismatch; atomic lock update; no page re-write.
- Interrupted-apply recovery: post-transaction interruption (the common case) is recovered by an idempotent re-run of `computePlan` + `applyPlan` (already-applied docs → NO_CHANGE → 0 writes; remaining docs written once); the rarer mid-transaction crash window is recovered by `replayJournal` of the latest run + rebuilding journaled-but-not-locked bindings from the remote.
- A `RepairReport` (per-item: repaired / skipped / needs-human-action) with stable diagnostic codes.
- `--dry-run` (default) and `--apply` flags on the `repair-state` subcommand.
- App-tier repair orchestration (mirroring the existing `push-flow` + thin-CLI-handler split), respecting the DEC-1 tier rules: the presentation handler imports only `#cli/output` + `#app/*`; the app module imports `#domain/*`.
- Journal-lost fallback (rebuild from lock + Confluence; or from Confluence + Git) — R1, CEO-resolved.
- PRESERVATION of INV-SAFE-1: read + reconcile, never a blind overwrite; divergence/missing reported and stopped.

### 7.2 Out of Scope

- [OUT] Full drift-lifecycle repair (moved pages, permission asymmetry, rename/reparent) — MS-0004.
- [OUT] Reverse-sync conflict resolution — MS-0005+.
- [OUT] Automatic / scheduled repair (manual invocation only for MS-0002; Q1 resolved).
- [OUT] New domain primitives — reconcile/rebuild/replay are reused unchanged (GH-19, GH-23).
- [OUT] Stale parked-plan expiry advisory — plans are ephemeral for MS-0002 (not persisted), so there is no parked plan to expire; the advisory is a no-op and deferred.
- [OUT] Modifying the existing `applyPlan` write path or its journal-before-lock ordering.
- [OUT] New Confluence REST endpoints.

### 7.3 Deferred / Maybe-Later

- Auto-suggesting / auto-running `repair-state` before `sync` (MS-0003 candidate; Q1 resolved as "no" for MS-0002).
- Full drift-lifecycle repair (MS-0004).
- Richer `doctor`-style health summarization that consumes the same diagnostic codes.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change adds no new endpoints. It consumes the existing `TargetSystem` port methods already implemented by the Confluence adapter: `getProperty(pageId, "marksync.metadata")`, `getPage(pageId)`, and `putProperty(...)`.

### 8.2 Events / Messages

N/A — no new events or message types.

### 8.3 Data Model Impact

 | ID | Element | Description |
 |----|---------|-------------|
 | DM-1 | `RepairReport` | The success payload of `repair-state`: a per-item list where each item carries the document identity (UUID + source path), a diagnostic class (repaired / skipped / needs-human-action), and a stable diagnostic code with human remediation text. Serialized via the existing `CommandResult<T>` envelope. |
 | DM-2 | Repair diagnostic codes | Stable, machine-readable codes distinguishing: stale-lock rebuilt; journaled-but-not-locked op rebuilt from remote; no-action-needed (already consistent); diverged-remote-needs-human-action; missing-property/missing-page-needs-human-action. Codes are stable strings (NFR-OBS-3). |
 | DM-3 | `repair-state` flags | `--dry-run` (default; read-only, 0 writes) and `--apply` (execute repairs). Added to the existing `repair-state` subcommand registration. |

### 8.4 External Integrations

**Confluence Cloud API** — existing integration, no contract change. Uses the content-property read (`marksync.metadata`), page read, and (only on `--apply`, for completing remaining docs) the existing write path via `applyPlan`.

### 8.5 Backward Compatibility

**Fully backward compatible.** The change replaces a stub with a real implementation behind the already-registered `repair-state` subcommand. The committed lock schema is unchanged; no migration is required. Existing locks, journals, and properties remain valid. The two new flags (`--dry-run` default, `--apply`) are additive and do not alter any other command.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

 | ID | Requirement | Threshold |
 |----|-------------|-----------|
 | NFR-REL-7 | Partial-apply recoverability | An interrupted apply is recoverable via `repair-state --apply` without duplicates: each page is written **at most once** across the crashed run and the repair run combined. |
 | NFR-OBS-3 | Diagnostic codes | Every repair item carries a stable, machine-readable diagnostic code with human remediation text (informational target for MS-0002). |
 | NFR-OBS-5 | Plan/diff before write | `--dry-run` (default) performs **0** writes and shows the planned repairs; no mutation without a reviewable plan. |
 | NFR-SEC-1 | No secrets in output | The `RepairReport` and all diagnostics contain **0** secrets/tokens (repair output passes the same redaction discipline as every other command path). |
 | NFR-PERF-4 | Idempotent rerun | An already-applied document (journal records success, remote already reflects it) produces **0** writes on `repair-state --apply`. |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new telemetry endpoints. Observability is delivered through the `RepairReport`'s stable diagnostic codes (NFR-OBS-3) emitted via the existing structured `CommandResult` output (JSON/NDJSON). Each repair run is correlatable via the existing `runId` on every result (NFR-OBS-2). No outbound telemetry is introduced (NFR-SEC-3).

## 11. RISKS & MITIGATIONS

 | ID | Risk | Impact | Probability | Mitigation | Residual Risk |
 |----|------|--------|-------------|------------|---------------|
 | RSK-1 | Misclassifying a mid-transaction crash-window op (scenario 2: journaled success, remote still matches) as a safe rebuild when the remote actually diverged → silent overwrite / lost divergence signal | H | M | The rebuild-from-remote path (scenario 2) applies ONLY when the remote still matches what MarkSync wrote; if classify shows `REMOTE_AHEAD`/`DIVERGED` or the property is absent, report and stop (F-5, INV-SAFE-1). Scenario 1 (post-transaction interruption) recovers via idempotent re-run and carries no remote-rebuild risk. Integration tests cover both the crash-window rebuild and the divergence-stop branches. | M |
 | RSK-2 | Choosing the wrong/latest journal run to resume, or multiple journal files present | M | L | Locate the latest journal; idempotency makes re-application safe (already-applied → 0 writes). The journal is run-specific and disposable (ADR-0006 C-3). | L |
 | RSK-3 | `repair-state` silently overwrites a remote edit (safety regression) | H | L | Repair is read + reconcile by construction, never a blind overwrite; divergence/missing reported and stopped (F-5, INV-SAFE-1/INV-SAFE-2). | L |
 | RSK-4 | Journal lost (user deleted `.marksync/`) with no recovery path | M | L | Fallback rebuild from lock + Confluence; if both gone, rebuild from Confluence property + Git (R1, CEO-resolved). The journal is only for resuming an in-flight run; the lock is the authoritative base. | L |
 | RSK-5 | Crash-window ordering changes in `applyPlan` invalidate the rebuild assumption | M | L | The spec depends on the documented `journal.append` → `saveLock` ordering; any future reordering must re-validate the repair contract. Captured as an assumption (§12). | L |

## 12. ASSUMPTIONS

- The state-manager primitives `reconcileWithProperty` and `rebuildLockFromConfluence` (GH-19) and the journal primitives `replayJournal` / `openJournal` (GH-23) exist, are correct, and are reused unchanged.
- The per-document apply ordering is `journal.append(...)` THEN `saveLock(...)` THEN `putProperty(...)` (confirmed in the current `applyPlan` write path). The crash-window recovery (F-2) depends on this ordering.
- The `TargetSystem` port exposes `getProperty`, `getPage`, and `putProperty`, all already implemented by the Confluence adapter.
- The existing `CommandResult<T>` envelope, `ok()`/`err()` factories, and the stable error-code → exit-code map (e.g. `LOCK_DIRTY` → 30, `CORRUPT_LOCK` → 10) are stable and reused.
- The `repair-state` subcommand is already registered in the CLI router; only the handler and the two flags are new.
- The `sync` command handler is the established pattern for a thin CLI handler delegating to an app-tier use case; `repair-state` mirrors that split.
- Plans are ephemeral for MS-0002 (`computePlan` is pure and not persisted), so there is no parked plan to expire.

## 13. DEPENDENCIES

 | Direction | Item | Notes |
 |-----------|------|-------|
 | Depends on | GH-19 (state manager) | `reconcileWithProperty` + `rebuildLockFromConfluence` + `MetadataProperty`. **RESOLVED** (CLOSED). |
 | Depends on | GH-23 (sync engine) | `replayJournal` / `openJournal` + the `computePlan`/`applyPlan` path. **RESOLVED** (CLOSED). |
 | Depends on | GH-16 (CLI framework) | `CommandResult<T>` envelope, exit-code map, router registration. **RESOLVED**. |
 | Depends on | GH-27 (provenance / property) | The 14-field `marksync.metadata` property that the cross-check reads. **RESOLVED**. |
 | Blocks | MS-0004 (full drift-lifecycle repair) | Establishes the repair command surface that richer repair extends. |
 | Blocks | MS-0002 release | NFR-REL-7 / R-USA-3 are premortem §14 beachhead release requirements. |

## 14. OPEN QUESTIONS

 | ID | Question | Context | Status |
 |----|----------|---------|--------|
 | OQ-1 | Exact sequencing of "rebuild journaled-but-not-locked, then complete remaining" vs. a single unified `applyPlan` resume | The high-level contract is fixed (F-2): rebuild from remote for crash-window ops, then complete the rest idempotantly. The precise step ordering inside the app-tier orchestration is an implementation detail deferred to the plan-writer. | Resolved at spec level; sequencing deferred to `@plan-writer`. Decision needed: consult `@decision-advisor` only if a tier-boundary ambiguity arises during planning. |

## 15. DECISION LOG

 | ID | Decision | Rationale | Date |
 |----|----------|-----------|------|
 | DEC-1 | Dry-run by default; `--apply` to execute | Safe-by-default; no mutation without a reviewable plan (NFR-OBS-5). Matches the story's technical approach. | 2026-07-15 (from story) |
 | DEC-2 | Reuse existing primitives; add only orchestration + UX + diagnostics | reconcile/rebuild/replay already delivered and tested (GH-19, GH-23); this story is the wiring, not new domain logic. | 2026-07-15 (from story) |
 | DEC-3 | App-tier orchestration + thin CLI handler (mirror `push-flow` + `sync` split) | Respects DEC-1 tier rules; keeps the presentation handler free of domain/infra imports. | 2026-07-15 (architecture convention) |
 | DEC-4 | Rebuild-from-remote (scenario 2) applies ONLY when the remote still matches what MarkSync wrote | Preserves INV-SAFE-1; a diverged/missing remote is reported and stopped, not silently overwritten (F-5). Scenario 1 (post-transaction interruption) recovers via idempotent re-run and needs no remote-rebuild guard. | 2026-07-15 (safety invariant) |
 | DEC-5 | No auto-run before `sync` for MS-0002; manual invocation only | Keeps repair predictable; MS-0003 may auto-suggest (Q1, CEO-resolved). | 2026-07-15 (Q1 resolved) |
 | DEC-6 | Journal-lost fallback: rebuild from lock + Confluence, else from Confluence + Git | The journal is only for resuming an in-flight run; the lock is the authoritative base; the property is the cross-check (R1, CEO-resolved). | 2026-07-15 (R1 resolved) |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

 | Component | Impact |
 |-----------|--------|
 | `repair-state` CLI handler | **Replaced** — stub becomes a real thin handler (mirrors the `sync` handler pattern: load config → load lock → resolve cache/creds → create target → call app-tier use case → map result). |
 | CLI router | **Updated** — adds `--dry-run` (default) and `--apply` flags to the existing `repair-state` subcommand. |
 | App-tier repair orchestration | **New** — the repair use case (mirrors the `push-flow` app-tier placement): orchestrates reconcile/rebuild/replay + the existing `computePlan`/`applyPlan` completion path; imports `#domain/*` only. |
 | State manager (reconcile/rebuild) | **No change** — `reconcileWithProperty` + `rebuildLockFromConfluence` reused as delivered (GH-19). |
 | Journal reader/writer | **No change** — `replayJournal` / `openJournal` reused as delivered (GH-23). |
 | `RepairReport` + diagnostic codes | **New** — success payload + stable code set (DM-1, DM-2). |
 | Apply write path | **No change** — the existing `applyPlan` journal-before-lock ordering is consumed as-is. |

## 17. ACCEPTANCE CRITERIA

 | ID | Criterion | Linked |
 |----|-----------|--------|
 | AC-F1-1 | **Given** a committed lock whose binding has a `sourceCommit` that mismatches the remote `marksync.metadata` property, **when** `marksync repair-state --apply` runs, **then** the binding is rebuilt from Confluence via `rebuildLockFromConfluence`, the lock is updated atomically, the binding matches the property afterwards, and no page body is re-written. | F-1, NFR-REL-7, ADR-0006 |
 | AC-F2-1 | **Given** a sync run interrupted after K of N documents — a post-transaction interruption where the K completed docs are fully committed (lock and property consistent) and the remaining N−K were never started (reproduced via the existing `crashAfter` test hook, which throws AFTER each per-doc sequence fully completes), **when** `marksync repair-state --apply` runs, **then** the remaining N−K documents are completed via an idempotent re-run of `computePlan` + `applyPlan` (the K already-applied docs resolve to NO_CHANGE → 0 writes) and each page is written **at most once** across the interrupted run and the repair run combined (asserted via a mock target). | F-2, NFR-REL-7, R-USA-3 |
 | AC-F2-2 | **Given** the journal records operations as `"success"` and the remote already reflects them (already-applied), **when** `marksync repair-state --apply` runs, **then** those documents produce **0** writes (rebuilt from the remote, not re-written). | F-2, NFR-PERF-4 |
 | AC-F4-1 | **Given** `marksync repair-state` is invoked with no flags (or `--dry-run`), **when** it runs, **then** it computes and displays the planned repairs and performs **0** writes. | F-4, NFR-OBS-5 |
 | AC-F4-2 | **Given** `marksync repair-state --apply` is invoked, **when** it runs, **then** the planned repairs are executed and the committed lock is updated. | F-4 |
 | AC-F3-1 | **Given** a repair run produces a `RepairReport`, **when** the report is inspected, **then** every item carries a stable diagnostic code and a human remediation note, and the report is machine-readable as JSON. | F-3, NFR-OBS-3, DM-1 |
 | AC-F5-1 | **Given** a document whose remote diverged (`REMOTE_AHEAD` / `DIVERGED`) or whose `marksync.metadata` property is absent or whose page is missing, **when** `marksync repair-state` runs, **then** the item is reported as needing human action and **0** writes are performed to that page. | F-5, INV-SAFE-1 |
 | AC-F5-2 | **Given** the disposable `.marksync/` cache has been deleted (journal lost), **when** `marksync repair-state --apply` runs, **then** bindings are rebuilt from the lock + Confluence (and, if the lock is also gone, from the Confluence property + Git) with **0** duplicate writes. | F-2, RSK-4, DEC-6 |
 | AC-CI-1 | **Given** the implementation is complete, **when** `bun run check` is executed, **then** all tests (unit + integration + golden) pass. | story requirement |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This change is additive and backward compatible:

1. Merge the feature branch into main.
2. CI (fast loop) validates unit + integration tests, including the interrupted-apply and divergence-stop coverage.
3. The `repair-state` command transitions from a stub to a working command; no user migration is required.
4. Operators invoke `repair-state` manually when a sync reports a stale/dirty state or when a run is observed to have crashed (explicit invocation for MS-0002 — no auto-run).
5. Existing locks, journals, and properties remain valid; no data migration.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration or seeding required. The committed lock schema is unchanged. Existing journals remain readable by the reused `replayJournal`.

## 20. PRIVACY / COMPLIANCE REVIEW

**Privacy impact: NONE.** This change reads and reconciles existing state (lock, journal, Confluence property) and introduces no new data stored in Confluence or locally. The `RepairReport` contains only document identities (UUID, source path), diagnostic codes, and remediation text — no commit subjects, credentials, or personal data. Repair output passes the same redaction discipline as every other command path (NFR-SEC-1).

**Compliance: MIT License** — no changes to licensing or attribution.

## 21. SECURITY REVIEW HIGHLIGHTS

**Security impact: LOW.** This change is read + reconcile by construction:

- No new credential exposure paths — it reuses the existing credential resolution and `TargetSystem` port.
- No new outbound endpoints beyond the configured Confluence target (NFR-SEC-3).
- The `--apply` path's only writes are (a) atomic lock updates and (b) the existing `applyPlan` write path used to complete remaining documents — no new write surface.
- INV-SAFE-1 is preserved: a diverged or missing remote is reported and stopped, never silently overwritten (F-5).
- No secrets appear in any repair output (NFR-SEC-1).

## 22. MAINTENANCE & OPERATIONS IMPACT

**Low maintenance impact:**

- The command is orchestration over stable primitives; it carries no new domain logic to maintain.
- Diagnostic codes are additive; future repair extensions (MS-0004) add codes without breaking existing consumers.
- The crash-window contract depends on the documented `applyPlan` ordering; any future reordering of journal/lock/property writes must re-validate this spec (RSK-5).

**Operational notes:**

- Operators run `repair-state` (dry-run first) when a sync reports `LOCK_DIRTY` or when a run is known to have crashed.
- The `RepairReport` gives CI/agents a machine-readable basis to decide whether a repair succeeded fully or needs human action.
- Journal-lost recovery (R1) is a documented fallback, not a new operational burden.

## 23. GLOSSARY

 | Term | Definition |
 |------|------------|
 | Stale / dirty lock | A committed lock binding whose `sourceCommit` (or other decisive field) no longer agrees with the remote `marksync.metadata` property; `reconcileWithProperty` returns `LockDirty`. |
 | Interrupted apply | A sync run that did not complete all N documents. Two forms: (1) **post-transaction interruption** — the Kth doc's full per-doc sequence completed before the interruption, so docs 1..K are fully committed (lock + property consistent) and K+1..N never started (the common case, reproduced by `crashAfter`); (2) **mid-transaction crash window** — a crash inside `finalizeSuccessfulUpdate` left the journal ahead of the lock for one binding (rarer, requires a manual fixture in tests). |
 | Crash window | The interval between `journal.append(...)` and `saveLock(...)` (and between `saveLock` and `putProperty`) in the per-document apply path; a crash inside it leaves journal and lock (or lock and property) inconsistent. |
 | Rebuild from remote | Reconstructing a `PageBinding` from the remote `marksync.metadata` property + page facts + freshly-derived hashes via `rebuildLockFromConfluence` — without re-writing the page. |
 | `RepairReport` | The structured success payload of `repair-state`: a per-item list with stable diagnostic codes. |
 | Needs-human-action | A repair-item class for documents that cannot be safely auto-repaired (diverged remote, missing property/page); reported and stopped, never written. |

## 24. APPENDICES

### Appendix A: Diagnostic Code Classes (illustrative)

The stable diagnostic codes distinguish (exact strings deferred to implementation, per NFR-OBS-3 informational target):

- **Repaired** — stale-lock rebuilt from Confluence; journaled-but-not-locked op rebuilt from remote.
- **Skipped** — already consistent (no action needed); already-applied (idempotent, 0 writes).
- **Needs human action** — remote diverged (`REMOTE_AHEAD` / `DIVERGED`); property absent/unreadable; page missing.

### Appendix B: Recovery Decision Summary

| Situation | Action | Writes |
|-----------|--------|--------|
| Lock dirty vs. property (sourceCommit mismatch), remote matches MarkSync | Rebuild binding from remote (`rebuildLockFromConfluence`), atomic lock update | 0 page writes |
| Post-transaction interruption: K docs fully committed, N−K never started (scenario 1, `crashAfter`) | Re-run `computePlan` + `applyPlan`; already-applied K docs → NO_CHANGE → 0 writes; remaining N−K written once | N−K (0 for the already-applied K) |
| Mid-transaction crash window: journaled success, not yet in lock (scenario 2), remote matches | Rebuild binding from remote (`rebuildLockFromConfluence`), then complete remaining via `applyPlan` | 0 for the rebuilt docs; ≥0 for the remaining |
| Remote diverged / property absent / page missing | Report needs-human-action, stop | 0 |
| Journal lost (.marksync/ deleted) | Rebuild from lock + Confluence; else from Confluence + Git | 0 duplicate writes |

## 25. DOCUMENT HISTORY

 | Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Juliusz Ćwiąkalski | Initial specification |
| 1.1 | 2026-07-15 | Juliusz Ćwiąkalski | DoR correction: distinguished post-transaction interruption (scenario 1, what `crashAfter` reproduces) from the mid-transaction crash window (scenario 2, journal-ahead-of-lock). Refined AC-F2-1, §2.1, §2.2, §5/§5.1 F-2, §6 Flow 2, §7.1, §11 RSK-1, §15 DEC-4, §23 glossary, Appendix B. |

---

## AUTHORING GUIDELINES

This spec was authored using:

- Story file (authoritative scope): `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S4--minimal-repair.md`
- GitHub issue GH-28 body (short summary; story file is authoritative)
- Feature spec: `doc/spec/features/feature-safe-publish.md` (§3.1 "Minimal repair", §3.3 "Partial apply")
- ADR-0006: `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (repair surface; C-3 disposable cache)
- NFRs: `doc/spec/nonfunctional.md` — NFR-REL-7 (partial-apply recoverability), NFR-OBS-3 (diagnostic codes, informational), NFR-OBS-5, NFR-SEC-1, NFR-PERF-4
- Risk R-USA-3: `doc/inception/analysis/risks.md` (safety mechanisms must not become permanent blockers; premortem §14 beachhead)
- Existing primitives (reused, not redefined): `reconcileWithProperty` / `rebuildLockFromConfluence` (GH-19); `replayJournal` / `openJournal` (GH-23); `CommandResult<T>` + exit-code map (GH-16)
- Coding rules: `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`

All deliverables, acceptance criteria, and risks are sourced from the story file, the system spec, and CEO-resolved open questions (R1, Q1). No implementation details (file-level code paths or step-by-step tasks) are included — only functional capabilities, interface contracts, and acceptance criteria. Existing primitives are named by their API/contract, not by implementation location.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-28)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-5, AC-F*-* + AC-CI-1, RSK-1..RSK-5, DEC-1..DEC-6, DM-1..DM-3, OQ-1, NFR-*)
- [x] Acceptance criteria reference at least one F-/NFR-/ADR-/INV- ID and use Given/When/Then
- [x] NFRs include measurable values (100%, 0, "at most once")
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (cited instead)
- [x] Front matter validates per front_matter_rules
