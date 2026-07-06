---
id: MS2-E4-S4
title: "minimal-repair"
status: todo
type: story
priority: medium
epic: MS2-E4
milestone: MS-0002
estimate: 2d
gh_issue: GH-28
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [], blocked_by: [MS2-E3-S2, MS2-E3-S6] }
cross_cutting: [R-USA-3, NFR-REL-7]
---

# MS2-E4-S4 — Minimal repair (`repair-state`)

## Goal
A `repair-state` command that recovers from (a) **stale/dirty locks** and (b) **interrupted-apply** by replaying the journal — without data loss and without duplicates. This is the premortem §14 beachhead requirement (R-USA-3, NFR-REL-7) — a single stale lock or partial apply must never block a whole subtree with no recovery.

## Background
ADR-0006 "Repair surface (MS-0002)". The journal (`<run-id>.jsonl`, E3-S6) records each mutation; the lock is the shared base. Two failure modes: (1) lock dirty/corrupted (mismatch with `marksync.metadata` property) — rebuild from Confluence (E3-S2 `rebuildLockFromConfluence`); (2) apply crashed mid-run — replay the journal to resume idempotently.

## Detailed scope (deliverables)
1. **`marksync repair-state` command** — diagnoses and offers/ applies fixes:
   - **Stale/dirty lock:** compare lock bindings to remote `marksync.metadata` (E3-S2 `reconcileWithProperty`); on mismatch → offer `rebuildLockFromConfluence` (E3-S2) to reconstruct bindings from the property + page versions + hashes.
   - **Interrupted apply:** locate the latest `<run-id>.jsonl`; call `replayJournal(runId)` (E3-S6) to resume — re-apply only the not-yet-journaled ops; idempotent (already-applied ops are detected via the property/remote state).
   - **Stale plan:** if a parked plan is expired (E3-S7), advise regeneration.
2. **Diagnostics** — AI-readable output: what was found, what was repaired, what needs human action. Stable diagnostic codes (NFR-OBS-3 informational for MS-0002).
3. **Safety** — `repair-state` is **read + reconcile**, never a blind overwrite; it rebuilds the lock from authoritative sources (Git + Confluence), and replays the journal idempotently. It must NOT silently create pages or overwrite remote work (INV-SAFE-1 preserved).

## Technical approach
- Reuse E3-S2 `reconcileWithProperty` + `rebuildLockFromConfluence` + E3-S6 `replayJournal`. This story is the orchestration + UX.
- Dry-run by default (`repair-state --dry-run` shows the plan); `--apply` executes.
- `CommandResult<RepairReport>` (E2-S3) with a per-item list (what was repaired, what was skipped, what needs input).

## Interface contracts (what other stories consume)
- `repair-state` command consumed by users/CI when a sync reports a stale/dirty state.
- `RepairReport` → JSON for CI/agents.

## Acceptance criteria (testable)
- [ ] **NFR-REL-7 / R-USA-3:** an interrupted apply (crash after K of N docs) → `repair-state --apply` replays the journal and completes the run WITHOUT duplicate writes (assert via mock target: each page written at most once).
- [ ] **Stale lock recovery:** a lock whose binding mismatches the remote property → `repair-state` rebuilds the binding from Confluence (no data loss; binding matches the property after).
- [ ] **No silent overwrite (INV-SAFE-1 preserved):** `repair-state` never overwrites a remote edit; if the remote diverged, it reports and stops.
- [ ] **Diagnostics:** AI-readable report with stable codes; `--dry-run` shows planned repairs without applying.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | diagnosis logic (dirty-lock detection, expired-plan detection), repair-plan computation |
| Integration | interrupted-apply → replay → completion (mock target, idempotent); dirty-lock → rebuild; dry-run vs apply |

## Definition of Done
`repair-state` recovers stale locks + interrupted applies; idempotent (no duplicates); no silent overwrite; clear diagnostics. AC list is the DoD.

## Out of scope
- Full drift-lifecycle repair (moved pages, permission asymmetry, etc.) — MS-0004.
- Reverse-sync conflict resolution — MS-0005+.
- Automatic/scheduled repair (manual invocation for MS-0002).

## Risks / open questions (CEO-resolved)
- **R1:** Journal lost (user deleted `.marksync/`). → Recovery path: rebuild from lock + Confluence (the lock is the authoritative base; the journal is only for resuming an in-flight run). If both lock AND journal are gone, rebuild purely from Confluence property + Git. CEO-recorded.
- **Q1:** Should `repair-state` run automatically before `sync`? → No for MS-0002 (explicit invocation keeps it predictable); MS-0003 may auto-suggest. Confirmed.
