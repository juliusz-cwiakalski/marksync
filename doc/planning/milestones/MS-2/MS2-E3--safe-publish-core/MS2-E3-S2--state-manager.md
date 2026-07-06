---
id: MS2-E3-S2
title: "state-manager (lock + cache)"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 2d
gh_issue: GH-19
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E3-S1] }
cross_cutting: [R-FEA-3, NFR-COMP-6]
---

# MS2-E3-S2 — State manager (committed lock + disposable cache + property cross-check)

## Goal
The **shared base** half of ADR-0006: a committed, versioned, per-target **lock file** (`marksync.lock.yml`) recording `UUID → PageBinding`; a **disposable** `.marksync/cache/` that is never needed for correctness; and a cross-check against the remote `marksync.metadata` content property.

## Background
ADR-0006 C-2 (committed base), C-3 (cache disposable), C-6 (decentralized). The lock is how two clones/CI runs agree on "last published." Cache deletion must change NO plan (C-3). The content property mirrors key lock fields so a lost/corrupted lock can be rebuilt from Confluence (defense in depth). Blueprint §3 is the lock schema.

## Detailed scope (deliverables)
1. **`src/app/lock.ts`** — `loadLock(cwd): Result<LockFile, LockError>` (ajv against the lock JSON Schema), `saveLock(lock): Result<void, LockError>` (**atomic** write: temp file + `fs.rename`), `mergeBindings(...)`. Per-target file (`marksync.lock.yml`); line-oriented/mergeable YAML to minimize merge conflicts (blueprint §9 Q6).
2. **`src/domain/config/lock-schema.json`** — JSON Schema v1 for the lock (blueprint §3 fields). ajv validates on every load.
3. **`src/infra/lock/store.ts`** — the atomic store impl + `LockJournal` integration (the apply journal lives in `app/journal.ts` — E3-S6 wires it; this story provides the lock store primitive).
4. **`src/app/cache.ts`** — cache layout manager: `.marksync/cache/` (CI-cacheable: rendered bodies, asset metadata, discovered remote graph), `.marksync/journal/<run-id>.jsonl` (run-specific, never cached), `.marksync/conflicts/` (run-specific). `MARKSYNC_CACHE_DIR` override. **Deleting `.marksync/` changes no plan** — proven by a test that deletes it and reruns plan.
5. **Content-property cross-check** — `reconcileWithProperty(binding, property): Result<void, MarkSyncError>`: compare lock fields against the `marksync.metadata` property fetched by E3-S4. Mismatch after a successful sync → `LockDirty` (repairable). `rebuildLockFromConfluence(...)` — reconstruct a binding from the remote property + Git when the lock is lost.
6. **`LockError`** (`{kind:"LockDirty"|"ConcurrentWrite"|"CorruptLock"; ...}`) added to `MarkSyncError`.
7. **Branch-restriction hook** — `assertBranchAllowed(branch, config): Result<void, MarkSyncError>` → `err({kind:"ForbiddenBranch"; branch; allowed[]})` if `branch ∉ sync.allowBranches` unless overridden by `MARKSYNC_ALLOW_BRANCHES` (ADR-0006 deployment gate). Used by E3-S6 before any write.

## Technical approach
- Atomic write via `fs.writeFile(tmp)` + `fs.rename(tmp, dest)` (POSIX atomic; on Windows rename-over-existing needs `FSCTL_REPLACE_FILE` — Bun's `fs.rename` handles it). Verify cross-OS in tests.
- Lock is YAML, one `documents:` list entry per line-block; ordering by UUID (stable) to reduce diff noise.
- The cross-check is a pure function over two records; the actual property fetch is E3-S4.
- Cache dir is created lazily; never committed (`.gitignore` from E2-S1).

## Interface contracts (what other stories consume)
- `loadLock`/`saveLock` consumed by E3-S5 (drift needs the base), E3-S6 (sync reads+updates lock), E4-S4 (repair).
- `reconcileWithProperty` consumed by E3-S6 after apply.
- `assertBranchAllowed` consumed by E3-S6 pre-write.
- Cache layout consumed by E3-S3 (rendered bodies), E3-S6 (journal), E4-S1 (mermaid cache).

## Acceptance criteria (testable)
- [ ] **C-3:** delete `.marksync/`, rerun `plan` → identical output (NFR-COMP-6; proven by test).
- [ ] Lock loads/validates; invalid lock (bad version, missing required field) → `LockError` with AI-readable message.
- [ ] `saveLock` is atomic: simulate a crash mid-write (test hook) → no partial lock on disk (the temp file is abandoned, the dest is unchanged).
- [ ] `reconcileWithProperty` flags a tampered property (sourceCommit mismatch) as `LockDirty`; matching records reconcile ok.
- [ ] `rebuildLockFromConfluence` reconstructs a binding from `{property, pageVersion, hashes}` matching the original.
- [ ] `assertBranchAllowed`: branch `main` ok (default); branch `feature/x` → `ForbiddenBranch`; `MARKSYNC_ALLOW_BRANCHES=feature/x` → ok.
- [ ] Per-target file reduces conflicts: a merge test where two branches each add a doc → the lock merges cleanly (no manual conflict) when UUIDs differ.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | schema validation (valid + invalid cases), atomic write (crash hook), reconcile match/mismatch, rebuild, branch-allow |
| Integration | lock save+reload round-trip in a temp repo; cache-delete-then-plan invariance; two-branch merge of lock entries |

## Definition of Done
Lock loads/saves atomically and validates; cache disposable (proven); property cross-check + rebuild work; branch gate enforced; per-target mergeable format. AC list is the DoD.

## Out of scope
- The apply journal semantics (E3-S6 owns `<run-id>.jsonl` write/replay; this story owns the cache layout).
- Drift classification (E3-S5).
- Reverse-sync conflict workspaces (MS-0005+).

## Risks / open questions (CEO-resolved)
- **R1:** Lock merge conflicts on concurrent branch publishes. → Per-target file + UUID-ordered entries + line-oriented YAML minimizes this; serialized apply (E3-S7) + `repair-state` (E4-S4) handle the residual. CEO-recorded.
- **Q1:** Stale-plan window default. → 15 min (blueprint §9 Q7). Configurable via `sync.stalePlanMinutes`. Confirmed.
