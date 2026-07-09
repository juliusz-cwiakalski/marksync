---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-19
  type: feat
  status: Proposed
  slug: state-manager-lock-cache
  title: "[MS2-E3-S2] State manager — committed lock + disposable cache + content-property cross-check (the shared-base half of ADR-0006)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, security]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: high
  dependencies:
    internal: [MS2-E3-S1 (GH-18), MS2-E2-S2 (GH-15), MS2-E2-S3 (GH-16), MS2-E3-S5 (blocked), MS2-E3-S6 (blocked), MS2-E4-S1 (blocked)]
    external: [ajv (^8.20.0), yaml (^2.9.0)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Establish MarkSync's **shared base** — a committed, versioned, per-target lock file (`marksync.lock.yml`) mapping `DocumentId → PageBinding`, a **disposable** `.marksync/cache/` that is never needed for correctness (ADR-0006 C-3, proven), and a content-property cross-check that survives a lost/corrupted lock — so two clones/CI runs agree on "what was last published" and drift detection, concurrency control, and the zero-silent-overwrite brand promise have a base to stand on.

## 1. SUMMARY

This is the **second story of epic MS2-E3 (Safe publish core)** and the **shared-base half** of ADR-0006. It delivers the three things the premortem (§5.1) insists on separating from identity (landed in GH-18):

1. **A committed, versioned lock file** (`marksync.lock.yml`) recording `DocumentId → PageBinding` per Confluence target — the shared base available offline/CI without a network call (ADR-0006 C-2). Loaded/saved via ajv against a JSON Schema v1, written **atomically** (temp file + `fs.rename`), and laid out as **line-oriented, UUID-ordered, mergeable YAML** so two branches adding different docs merge cleanly (ADR-0006 unresolved Q1 — resolved here, DEC-1).
2. **A disposable cache** (`.marksync/cache/` for CI-cacheable, reconstructable artifacts; `.marksync/journal/<run-id>.jsonl` and `.marksync/conflicts/` for run-specific, never-cached state) — **deleting `.marksync/` changes no plan**, proven by a test (ADR-0006 C-3 / NFR-COMP-6).
3. **A content-property cross-check** — pure functions `reconcileWithProperty` (flags a tampered/stale property as `LockDirty`) and `rebuildLockFromConfluence` (reconstructs a binding from the remote `marksync.metadata` property + page version + hashes) so a lost/corrupted lock can be rebuilt from Confluence + Git (defense in depth, ADR-0006 Cross-check).

It also delivers a **branch-restriction gate** (`assertBranchAllowed` → `ForbiddenBranch` unless the branch is in `sync.allowBranches` or overridden by `MARKSYNC_ALLOW_BRANCHES`) — the ADR-0006 deployment gate that confines sync to configured branches. A new `MarkSyncError` kind, **`CorruptLock`** (invalid version / missing field / unparseable lock), is added per the documented "add a kind" procedure, alongside the already-existing `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch` arms.

The lock, cache, cross-check, and branch gate are the foundation the rest of MS2-E3 consumes: drift classification (E3-S5) reads the lock for the base; the sync engine (E3-S6) reads + atomically updates the lock, calls `reconcileWithProperty` after apply, and calls `assertBranchAllowed` before any write; the Confluence adapter (E3-S4) supplies the property the cross-check compares against; repair (E4-S4) consumes `rebuildLockFromConfluence`.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-18 (MS2-E3-S1) is merged** (PR #50, `c4b6648`) — this story's `blocked_by` dependency, satisfied. The identity half of ADR-0006 is in place: `DocumentId` (branded UUID v7), `generateUuidV7`/`readUuid`/`injectUuid`, `detectDuplicateUuids` (INV-SAFE-3), and — critically for this story — the **`PageBinding` record type** (`src/domain/binding/page-binding.ts`) already carrying the full ADR-0006 shared-base field set: `{ uuid: DocumentId; sourcePath; pageId; parentPageId; pageVersion; sourceCommit; sourceContentHash; renderedBodyHash; remoteBodyHash; attachmentHashes: Record<string,string>; operationId; synchronizedAt; toolVersion }`. This story **persists** that type into the committed lock; it does not redefine it.
- **The `MarkSyncError` union already carries the lock-related arms** (`src/domain/errors.ts`): `{ kind: "LockDirty"; path }`, `{ kind: "ConcurrentWrite"; lockPath }`, `{ kind: "ForbiddenBranch"; branch; allowed }` — landed speculatively and already handled in every exhaustive site (`assertNeverMarkSyncError`, the application-tier mapper `src/app/cli-error-map.ts`, `CODE_TO_EXIT`). This story is the **first consumer** of those arms and adds exactly one new kind, `CorruptLock`, following the "add a kind" procedure (DEC-2).
- **The config loader is the ajv+yaml+Result template to mirror.** `src/app/config.ts` (`loadConfig`) and `src/domain/config/schema.json` establish the exact pattern this story replicates for the lock: read file → YAML parse → ajv `allErrors` validation → typed `Result<LockFile, LockError>`; structured ajv errors are carried via a `ConfigAjvError`-style plain-data record (already domain-owned and serializable). `applyDefaults` lives in the application tier, not the schema.
- **The dependencies are already installed** — `ajv` (^8.20.0, from GH-15), `yaml` (^2.9.0, from GH-15), `uuid` (^14, from GH-18). **No new runtime dependency is introduced.** No `zod` (it is not yet installed; the lock, like config, is a user-authored-schema boundary that uses ajv per typescript.md §IO boundaries).
- **`sync.allowBranches` already exists** in the config schema (`src/domain/config/schema.json`, default `["main"]`) and is populated by `applyDefaults` (`src/app/config.ts`). The branch gate reads this field; no config-schema change is required for the gate. `sync.stalePlanMinutes` (default 15) also already exists.
- **`bun run check`** = `lint && format:check && typecheck && test && check:boundaries` (dep-cruiser). Tier rules are enforced at severity `error`. `src/app/` may import domain + infra (via ports); `src/domain/` imports nothing; `src/infra/` imports domain only.
- **ADR-0006 is the load-bearing decision.** Its Shared-base section mandates a committed, versioned, **atomic** lock; its Cache section mandates a single disposable root split into CI-cacheable vs run-specific subtrees (C-3); its Cross-check section mandates the property mirrors key lock fields so a lost lock is rebuildable; its Branch-restriction section mandates `sync.allowBranches` + `MARKSYNC_ALLOW_BRANCHES`.

### 2.2 Pain Points / Gaps

- **No shared base.** Without a committed lock, two clones/CI runs have no agreed "last published" state. Drift (E3-S5) cannot be classified, and concurrency (E3-S6/E3-S7) cannot reason about staleness. This is the premortem's central "wrong state model" risk (§5.1) — identity alone is not enough; the base must be shared and version-controlled.
- **No proven cache disposability.** ADR-0006 C-3 requires that deleting `.marksync/` changes no plan. There is currently no cache layout and no test proving disposability. Without it, a cache could silently become load-bearing for correctness — the exact failure the premortem warns against.
- **No defense-in-depth cross-check.** A lost or corrupted lock must be rebuildable from Confluence + Git (ADR-0006 Cross-check). No `reconcileWithProperty` / `rebuildLockFromConfluence` exists yet, so a single corrupt lock file would be an unrecoverable correctness hole.
- **No branch deployment gate.** ADR-0006 treats Markdown sync as a documentation "deployment" confined to configured branches. The `ForbiddenBranch` arm exists but no `assertBranchAllowed` enforcer produces it, so sync could run from any branch today.
- **No `CorruptLock` error.** An invalid lock (bad version, missing field, unparseable YAML) must surface as a typed, AI-readable error. No `CorruptLock` kind exists yet; the lock loader needs it (the existing `LockDirty` is for property-tamper, not parse/validation failure — different recovery action, so a distinct kind per the error-handling rules).
- **No atomic-write guarantee.** An interrupted lock write must leave the prior file intact (system spec §9.3: "interrupted lock write preserves old file"). No atomic write (temp + `fs.rename`) with a crash-injection test hook exists yet.

## 3. PROBLEM STATEMENT

Because there is no committed shared-base lock, no proven-disposable cache, no content-property cross-check, and no branch gate, MarkSync cannot yet let two clones/CI runs agree on "what was last published," cannot prove cache deletion changes no plan, cannot recover a lost lock from Confluence, and cannot confine sync to configured branches — so drift detection (E3-S5), the sync engine (E3-S6), and the zero-silent-overwrite brand promise have no shared base to reason over — so this story must build the shared-base half of ADR-0006 (C-2, C-3, Cross-check, Branch restriction) once, before drift classification, the sync engine, or repair can be delivered.

## 4. GOALS

- **G-1**: Deliver the lock loader/saver — `loadLock(cwd): Result<LockFile, LockError>` (ajv against `lock-schema.json` v1) and `saveLock(lock): Result<void, LockError>` with **atomic** write (temp + `fs.rename`) (F-1, F-2).
- **G-2**: Deliver the lock JSON Schema v1 (`lock-schema.json`) mirroring the config-schema pattern; ajv validates every load (F-2).
- **G-3**: Deliver the atomic lock store primitive (`src/infra/lock/store.ts`) with a crash-injection test hook proving no partial lock survives a mid-write failure (F-3).
- **G-4**: Deliver the disposable cache layout (`src/app/cache.ts`): `.marksync/cache/` (CI-cacheable), `.marksync/journal/<run-id>.jsonl` (run-specific), `.marksync/conflicts/` (run-specific), with `MARKSYNC_CACHE_DIR` override — **deleting `.marksync/` changes no plan**, proven by a test (F-4, ADR-0006 C-3).
- **G-5**: Deliver the content-property cross-check as **pure** functions — `reconcileWithProperty` (flags sourceCommit mismatch as `LockDirty`) and `rebuildLockFromConfluence` (reconstructs a binding from {property, pageVersion, hashes}) (F-5).
- **G-6**: Deliver the branch-restriction gate — `assertBranchAllowed(branch, config): Result<void, MarkSyncError>` → `ForbiddenBranch` unless the branch ∈ `sync.allowBranches` or overridden by `MARKSYNC_ALLOW_BRANCHES` (F-6).
- **G-7**: Add the `CorruptLock` `MarkSyncError` kind for invalid locks, following the "add a kind" procedure across every exhaustive site (F-7, DEC-2).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| cache disposability (ADR-0006 C-3 / NFR-COMP-6) | delete `.marksync/`, rerun plan → **byte-identical** output (0 bytes diff) |
| lock validation | a valid lock loads to `ok(LockFile)`; a lock with a bad `version`, a missing required field, or unparseable YAML → `err(CorruptLock)` with an AI-readable message (field path + expected vs actual + suggested fix) |
| atomic write | injecting a crash (test hook) between temp-write and rename leaves the **destination unchanged** and the temp file abandoned — no partial lock on disk |
| property cross-check (mismatch) | a `marksync.metadata` property whose `sourceCommit` ≠ the lock → `err(LockDirty)` |
| property cross-check (match) | a property matching the lock → `ok` |
| lock rebuild | `rebuildLockFromConfluence({property, pageVersion, hashes})` reconstructs a `PageBinding` field-equal to the original |
| branch gate (default) | branch `main` → `ok`; branch `feature/x` → `err(ForbiddenBranch)` |
| branch gate (override) | `MARKSYNC_ALLOW_BRANCHES=feature/x` + branch `feature/x` → `ok` |
| lock mergeability | two branches each adding a doc (different UUIDs) → the lock merges cleanly with **no manual conflict** |
| tier purity | `src/app/cache.ts` + `src/app/lock.ts` import domain (+ infra via ports); `src/domain/config/lock-schema.json` imports nothing; dep-cruiser passes |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: The apply-journal **semantics** (write/replay of `<run-id>.jsonl`) — E3-S6. This story owns only the cache **layout** (it creates the `journal/` directory; it does not write or replay journal entries).
- **NG-2**: Drift classification (`NO_CHANGE` / `LOCAL_AHEAD` / …) — E3-S5. This story provides the base the classifier reads; it does not classify.
- **NG-3**: The actual Confluence content-property **fetch** (HTTP) — E3-S4. `reconcileWithProperty` / `rebuildLockFromConfluence` are **pure** functions over caller-supplied records; they perform no I/O.
- **NG-4**: The sync engine read→update→write orchestration of the lock — E3-S6. This story provides `loadLock`/`saveLock`/`mergeBindings`; the orchestration that calls them after a successful apply is E3-S6.
- **NG-5**: Reverse-sync conflict workspaces (`MS-0005+`). This story creates the `conflicts/` directory layout only.
- **NG-6**: Migrating lock schema across versions. Schema **v1** is delivered; a migration/co-existence path for a future v2 is deferred until a breaking change is needed (the `version` field makes it detectable).
- **NG-7**: Reconsidering committed-lock vs remote-only base — ADR-0006 Alt-1 is settled and being **implemented**, not reopened (DEC-1).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Lock loader + saver (`loadLock` / `saveLock`) | The shared base: a committed, versioned lock that two clones share without a network call (ADR-0006 C-2). ajv-validated on every load; atomic on every save. |
| F-2 | Lock JSON Schema v1 (`lock-schema.json`) | The schema is the source of truth for the committed lock (user-edited artifact), validated with ajv — mirroring the config pattern (typescript.md §IO boundaries). |
| F-3 | Atomic lock store + crash hook (`src/infra/lock/store.ts`) | An interrupted write must leave the prior lock intact (system spec §9.3). Atomic via temp + `fs.rename`; a test hook injects a crash to prove no partial file. |
| F-4 | Disposable cache layout (`src/app/cache.ts`) | ADR-0006 C-3: deleting `.marksync/` changes no plan. Split CI-cacheable (`cache/`) from run-specific (`journal/`, `conflicts/`) so CI can cache only the reconstructable subtree. |
| F-5 | Content-property cross-check (pure) | `reconcileWithProperty` + `rebuildLockFromConfluence` — defense in depth so a lost/corrupted lock is rebuildable from Confluence + Git (ADR-0006 Cross-check). Pure over caller-supplied records. |
| F-6 | Branch-restriction gate (`assertBranchAllowed`) | ADR-0006 deployment gate: sync is confined to `sync.allowBranches` unless overridden by `MARKSYNC_ALLOW_BRANCHES`. Produces `ForbiddenBranch`. |
| F-7 | `CorruptLock` error kind | An invalid lock (bad version / missing field / unparseable) has a distinct recovery action (regenerate/rebuild) from property-tamper (`LockDirty`) — so a distinct `MarkSyncError` kind, added per the "add a kind" procedure. |

### 5.1 Capability Details

- **F-1 (Lock loader + saver).** `loadLock(cwd): Result<LockFile, LockError>` reads `marksync.lock.yml` from `cwd`, parses with `yaml`, validates with the compiled ajv schema (F-2, `allErrors` + `verbose` like config), applies defaults, and returns `ok(LockFile)` or `err(LockError)`. A **missing** lock file is **not an error** — it is the initial (empty) state `ok({ version: 1, targets: {} })` (a fresh corpus has no base yet). A **present-but-invalid** lock (bad version, missing required field, unparseable YAML) → `err({ kind: "CorruptLock"; path; ajvErrors?; humanMessage })` (DEC-2). `saveLock(lock): Result<void, LockError>` serializes the lock as **line-oriented, UUID-ordered, mergeable YAML** and writes it **atomically** via the store (F-3). `mergeBindings(a, b): LockFile` merges two lock files (used by E3-S6; union by `uuid`, last-write-wins on conflict with a deterministic tiebreak) — provided here as the primitive E3-S6 wires into serialized apply. The lock carries no secrets (ADR-0006: "contains no secrets, committed to the repo").

- **F-2 (Lock JSON Schema v1).** `src/domain/config/lock-schema.json` is a JSON Schema draft-07 (same draft as `schema.json`) describing `LockFile`: top-level `version` (const `1`), `targets` (map of `targetId → { documents: map<uuid, DocumentEntry> }`), where `DocumentEntry` mirrors `PageBinding` per system spec §9.3 (`sourcePath`, `pageId`, `parentPageId`, `pageVersion`, `sourceCommit`, `sourceContentHash`, `renderedBodyHash`, `remoteBodyHash`, `attachmentHashes`, `operationId`, `synchronizedAt`, `toolVersion`). The schema is the validation source of truth; the TS `LockFile` type is derived/aligned with it (mirroring the config `types.ts` ↔ `schema.json` relationship). ajv is compiled once (module singleton). This is a **user-authored-schema boundary** → ajv (not zod), per typescript.md §IO boundaries.

- **F-3 (Atomic store + crash hook).** `src/infra/lock/store.ts` implements `writeAtomic(dest, serialize(lock)): Result<void, LockError>`: write to `<dest>.<tmp-suffix>` then `fs.rename(tmp, dest)`. `fs.rename` is POSIX-atomic; on Windows, Bun's `fs.rename` handles replace-over-existing. A **crash-injection hook** (`__marksync_test_crash_after_temp_write`, off by default, set only by tests) throws between the temp write and the rename so a test can assert the destination is **unchanged** and the temp file is abandoned (not a half-written lock). The store owns the `LockJournal` **integration point** (the journal write/replay is E3-S6; this story exposes the hook E3-S6 wires, it does not implement replay).

- **F-4 (Disposable cache layout).** `src/app/cache.ts` exposes `resolveCacheDir(cwd): string` (default `<cwd>/.marksync`, overridable by `MARKSYNC_CACHE_DIR`) and `ensureCacheLayout(dir): Result<void, MarkSyncError>` creating the subtrees:
  - `.marksync/cache/` — **CI-cacheable**: rendered bodies, asset metadata, discovered remote graph. Every entry is reconstructable from Git + Confluence. Safe for GitHub Actions `actions/cache`.
  - `.marksync/journal/<run-id>.jsonl` — **run-specific**, never cached (apply journal; written by E3-S6).
  - `.marksync/conflicts/<target>/<uuid>/` — **run-specific**, never cached (reverse-sync workspaces; MS-0005+).
  The whole `.marksync/` tree is gitignored (the `.gitignore` from GH-14 already ignores it; this story verifies the entry exists). The cache is created **lazily**. **Deleting `.marksync/` changes no plan** (C-3) — proven by a test that deletes the cache and asserts a subsequent plan is byte-identical (the plan machinery is E3-S5/E3-S6; this story proves the invariant at the cache-layout level by asserting the cache holds no base/correctness data — only reconstructable artifacts).

- **F-5 (Content-property cross-check — pure).** Two pure functions over caller-supplied records (no I/O, no network — the property fetch is E3-S4):
  - `reconcileWithProperty(binding: PageBinding, property: MetadataProperty): Result<void, MarkSyncError>` — compares the lock's key fields against the `marksync.metadata` property. A **mismatch** on `sourceCommit` (tamper/staleness) → `err({ kind: "LockDirty"; path })`. Matching records → `ok`. (A successful sync leaves lock and property in agreement; a mismatch signals drift/tamper.)
  - `rebuildLockFromConfluence({ property, pageVersion, hashes }): Result<PageBinding, MarkSyncError>` — reconstructs a `PageBinding` from the remote property + page version + hashes when the lock is lost/corrupted (ADR-0006 "a lost lock can be rebuilt from Confluence + Git"). The reconstructed binding is field-equal to what a normal sync would have recorded.
  The `MetadataProperty` shape mirrors system spec §9.3 (`schemaVersion`, `projectId`, `targetId`, `documentId`, `sourcePath`, `sourceCommit`, `sourceContentHash`, `renderedBodyHash`, `toolVersion`, `synchronizedAt`).

- **F-6 (Branch-restriction gate).** `assertBranchAllowed(branch: string, config: ProjectConfig): Result<void, MarkSyncError>` returns `ok` if `branch ∈ config.sync.allowBranches` (default `["main"]`), else `err({ kind: "ForbiddenBranch"; branch; allowed })`. The `MARKSYNC_ALLOW_BRANCHES` env var (comma-separated) **augments** the allowed set for the process (feature-branch previews), per ADR-0006 Branch restriction. CI detached-HEAD resolution (branch detection) is a caller concern (the caller passes the resolved branch); this function is a pure decision over a supplied branch + config + env. E3-S6 calls this **before any write**.

- **F-7 (`CorruptLock` error kind).** `{ kind: "CorruptLock"; path: string; ajvErrors?: ConfigAjvError[]; humanMessage: string }` is added to `MarkSyncError` for an invalid lock (bad `version`, missing required field, unparseable YAML). It is distinct from `LockDirty` (property-tamper → reconcile/repair) because the **recovery action differs** (a corrupt lock must be regenerated or rebuilt via `rebuildLockFromConfluence`; a dirty lock must be reconciled). Adding the kind follows the documented procedure: update `assertNeverMarkSyncError`, the application-tier mapper (`cli-error-map.ts`), `CODE_TO_EXIT` (DEC-2 / typescript.md "add a kind"), and the DEC-2 exit-code table — all in this change. `humanMessage` is the AI-readable diagnostic (field path + expected vs actual + suggested fix), mirroring `InvalidConfig.humanMessage`.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Lock load at plan/sync time (E3-S5/E3-S6 consume):
  loadLock(cwd)
    → file absent → ok({ version:1, targets:{} }) (fresh corpus, no base yet)
    → file present + valid → ok(LockFile)
    → file present + invalid (bad version / missing field / unparseable)
        → err(CorruptLock { path, humanMessage }) → caller surfaces + halts.

Flow 2 — Atomic lock save after a successful apply (E3-S6 wires):
  sync succeeds for target T, doc D (uuid U)
    → build updated LockFile (mergeBindings(base, { T: { U: binding } }))
    → saveLock(lock)
        → write .marksync.lock.yml.<tmp> → fs.rename(tmp, marksync.lock.yml)
        → (crash injected between write+rename) → dest UNCHANGED, temp abandoned.

Flow 3 — Cache disposable invariant (ADR-0006 C-3):
  plan computes P with .marksync/ present
    → delete .marksync/ entirely
    → recompute plan P'
    → assert P === P' byte-identical (cache held no correctness data).

Flow 4 — Property cross-check after apply (E3-S6 wires):
  apply succeeded → E3-S4 fetched the marksync.metadata property
    → reconcileWithProperty(binding, property)
        → sourceCommit matches → ok (lock & property agree)
        → sourceCommit mismatches → err(LockDirty) → repair path.

Flow 5 — Rebuild a lost/corrupted lock (E4-S4 repair / manual recovery):
  lock lost/corrupt → operator runs repair-state
    → E3-S4 fetches property + pageVersion for each managed page
    → rebuildLockFromConfluence({ property, pageVersion, hashes })
        → ok(reconstructed PageBinding) → saveLock(regenerated lock).

Flow 6 — Branch deployment gate (E3-S6 wires, pre-write):
  sync invoked on branch B
    → assertBranchAllowed(B, config)
        → B ∈ allowBranches (default ["main"]) → ok → proceed
        → B ∉ allowBranches → err(ForbiddenBranch { branch:B, allowed })
        → MARKSYNC_ALLOW_BRANCHES=B set → ok (feature-branch preview).

Flow 7 — Two branches add different docs → lock merges cleanly (mergeability):
  branch-A adds doc(uuidA); branch-B adds doc(uuidB)
    → both append a UUID-keyed entry to targets.T.documents
    → UUID-ordered, line-oriented YAML → git auto-merges with no manual conflict.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `loadLock` / `saveLock` / `mergeBindings` (`src/app/lock.ts`) (F-1).
- Lock JSON Schema v1 (`src/domain/config/lock-schema.json`) + the `LockFile`/`LockError` types (F-2).
- Atomic store + crash-injection hook (`src/infra/lock/store.ts`) (F-3).
- Disposable cache layout + `MARKSYNC_CACHE_DIR` (`src/app/cache.ts`) (F-4).
- `reconcileWithProperty` + `rebuildLockFromConfluence` (pure) (F-5).
- `assertBranchAllowed` + `MARKSYNC_ALLOW_BRANCHES` (F-6).
- `CorruptLock` `MarkSyncError` kind + every exhaustive-site update (F-7, DEC-2).
- The `LockFile` save/load round-trip + two-branch merge test (mergeability) (AC-MERGE-1).

### 7.2 Out of Scope

- [OUT] Apply-journal write/replay semantics (`<run-id>.jsonl`) — E3-S6 (NG-1). This story creates the `journal/` directory only.
- [OUT] Drift classification — E3-S5 (NG-2).
- [OUT] The Confluence content-property HTTP fetch — E3-S4 (NG-3).
- [OUT] Sync-engine lock read→update→write orchestration — E3-S6 (NG-4).
- [OUT] Reverse-sync conflict workspaces — MS-0005+ (NG-5).
- [OUT] Lock schema migration across versions — v1 only (NG-6).
- [OUT] Reconsidering committed-lock vs remote-only — ADR-0006 settled (NG-7, DEC-1).

### 7.3 Deferred / Maybe-Later

- **Lock schema migration (v2)** — deferred until a breaking field change is needed; the `version` const makes a future mismatch detectable.
- **`mergeBindings` conflict policy beyond last-write-wins** — E3-S7 (serialized apply + `repair-state`) handles residual conflicts; the primitive here is deterministic.
- **Cache eviction / size policy** — out of scope; the cache is reconstructable, so size is a CI-cache concern, not a correctness one.
- **`reconcileWithProperty` field set beyond `sourceCommit`** — `sourceCommit` is the decisive tamper signal for MS-0002; expanding the compared field set is deferred.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story performs no HTTP. `reconcileWithProperty` / `rebuildLockFromConfluence` are pure functions; the property they consume is fetched by E3-S4.

### 8.2 Events / Messages

No events. The Ubiquitous-Language "Lock Dirty" / "Concurrent Write" conceptual signals are realized as `err(LockDirty)` / `err(ConcurrentWrite)` `Result` values consumed by E3-S6 — no event bus in MS-0002.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `LockFile` | `{ version: 1; targets: Record<targetId, { documents: Record<DocumentId, PageBinding> }> }`. Top-level versioned, per-target, UUID-keyed. UL-bound. Persisted as line-oriented mergeable YAML. |
| DM-2 | `marksync.lock.yml` | The single committed lock file at repo root. `.yml` extension (config convention). No secrets. |
| DM-3 | `PageBinding` (reused, first-persisted) | The GH-18 record shape, unchanged — now **persisted** as the lock entry value. |
| DM-4 | `MetadataProperty` | The remote `marksync.metadata` content-property shape (system spec §9.3): `{ schemaVersion; projectId; targetId; documentId; sourcePath; sourceCommit; sourceContentHash; renderedBodyHash; toolVersion; synchronizedAt }`. Input to the pure cross-check (fetched by E3-S4). |
| DM-5 | `CorruptLock` error arm (new) | `{ kind: "CorruptLock"; path: string; ajvErrors?: ConfigAjvError[]; humanMessage: string }` — new `MarkSyncError` kind. The existing `LockDirty`{path} / `ConcurrentWrite`{lockPath} / `ForbiddenBranch`{branch,allowed} are first-consumed here. |
| DM-6 | Cache layout | `.marksync/{cache, journal, conflicts}/` + `MARKSYNC_CACHE_DIR` override. Gitignored; disposable. |
| DM-7 | `LockError` (narrowed channel) | `Extract<MarkSyncError, { kind: "CorruptLock" | "LockDirty" | "ConcurrentWrite" }>` — the narrowed `Result` error `loadLock`/`saveLock` declare (mirrors `ConfigError` / `AuthError` narrowed channels). |

> The lock-related arms `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch` already exist in `MarkSyncError` (GH-14) and are already mapped in every exhaustive site. This story is their **first producer** and adds exactly **one** new kind (`CorruptLock`, DM-5) — every exhaustive site is updated for it in this change (DEC-2).

### 8.4 External Integrations

No external services are contacted (the property fetch is E3-S4). No new runtime dependency — `ajv`, `yaml`, `uuid` are already installed. `MARKSYNC_CACHE_DIR` and `MARKSYNC_ALLOW_BRANCHES` are the two env vars introduced/used (both per ADR-0006; consistent with `.env.example` conventions — the PR verifies/updates `.env.example`).

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story adds the lock file (net-new committed artifact), the cache layout (net-new gitignored tree), two pure functions, a branch gate, and one `MarkSyncError` kind. Adding `CorruptLock` is a backward-compatible union extension (existing handlers get a new case to handle; the `assertNeverMarkSyncError` never-check forces every handler to be updated in this PR). No existing public API signature changes.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | cache disposability (ADR-0006 C-3 / NFR-COMP-6) | delete `.marksync/`, rerun plan → **byte-identical** output (0 bytes diff) |
| NFR-2 | lock validation (valid) | a valid lock loads to `ok(LockFile)` |
| NFR-3 | lock validation (invalid) | bad `version` / missing required field / unparseable YAML → `err(CorruptLock)` with an AI-readable `humanMessage` |
| NFR-4 | atomic write | crash (test hook) between temp-write and rename → destination **unchanged**, temp abandoned (no partial lock) |
| NFR-5 | cross-platform atomic rename | `fs.rename` replace-over-existing works on POSIX + Windows (Bun); verified by the atomic-write test |
| NFR-6 | property reconcile (mismatch) | `sourceCommit` mismatch → `err(LockDirty)` |
| NFR-7 | property reconcile (match) | matching records → `ok` |
| NFR-8 | lock rebuild | `rebuildLockFromConfluence` reconstructs a `PageBinding` field-equal to the original |
| NFR-9 | branch gate (default) | `main` → `ok`; `feature/x` → `err(ForbiddenBranch)` |
| NFR-10 | branch gate (override) | `MARKSYNC_ALLOW_BRANCHES=feature/x` + branch `feature/x` → `ok` |
| NFR-11 | lock mergeability | two branches adding different-UUID docs → git auto-merge with **no manual conflict** |
| NFR-12 | missing lock ≠ error | an absent `marksync.lock.yml` → `ok(empty LockFile)` (initial state) |
| NFR-13 | no secrets in lock | the committed lock contains **no** credential/token (INV-SEC-1); verified by a test asserting no secret-bearing fields |
| NFR-14 | tier purity | `src/app/cache.ts` + `src/app/lock.ts` import domain (+ infra via ports); `lock-schema.json` imports nothing; dep-cruiser passes |
| NFR-15 | no new dependency | `ajv`/`yaml`/`uuid` reused; **0** new runtime deps |
| NFR-16 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry. Lock/cache/branch failures surface (at the E3-S6 boundary) through the established GH-16 `CommandResult` contract as stable `error.code`s: `CORRUPT_LOCK`, `LOCK_DIRTY`, `CONCURRENT_WRITE`, `FORBIDDEN_BRANCH` — each mapped to its exit class. Per typescript.md logging conventions, no raw lock content is serialized to logs — only structural identifiers (`{ kind }`); `humanMessage` / `ajvErrors` travel via the structured `error` channel (redaction-layer-governed), not free-form logging.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining: cache becomes load-bearing for correctness (C-3 violated) → drift/concurrency reason over stale local state | H | M | Split cache (CI-cacheable vs run-specific); prove C-3 by a delete-then-plan test (NFR-1); the lock (committed) is the sole base, never the cache. | L |
| RSK-2 | Atomic write not atomic on Windows (rename-over-existing) → partial lock on crash | H | L | Use Bun `fs.rename` (handles replace-over-existing cross-OS); inject a crash in tests to prove the destination is intact (NFR-4, NFR-5). | L |
| RSK-3 | Lock merge conflicts on concurrent branch publishes | M | M | Line-oriented, UUID-ordered, UUID-keyed entries minimize conflicts (NFR-11); serialized apply (E3-S7) + `repair-state` (E4-S4) handle the residual. | L |
| RSK-4 | A lost lock is unrecoverable (no rebuild path) → correctness hole | H | L | `rebuildLockFromConfluence` reconstructs from the remote property (NFR-8); property mirrors key lock fields (ADR-0006 Cross-check). | L |
| RSK-5 | Adding `CorruptLock` misses an exhaustive site → `assertNeverMarkSyncError` / mapper / `CODE_TO_EXIT` gap | M | L | The "add a kind" procedure is a checklist item; `bun run check` (typecheck + boundaries) + the unit test over every kind force completeness. | L |
| RSK-6 | `MARKSYNC_ALLOW_BRANCHES` override is silently too permissive (security) | M | L | Override **augments** (not replaces) `allowBranches`; documented as a feature-branch-preview escape hatch; E3-S6 logs the active branch. | L |
| RSK-7 | `humanMessage` leaks a secret (e.g. echoes lock content) | M | L | The lock contains no secrets (NFR-13); `humanMessage` reports field path + expected vs actual, never raw secret-bearing values; redaction-layer-governed. | L |

## 12. ASSUMPTIONS

- GH-18 (MS2-E3-S1) is merged and provides `PageBinding`, `DocumentId`, and the identity primitives. The lock **persists** `PageBinding`; it does not redefine it.
- The `MarkSyncError` union already has `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch`, all mapped in every exhaustive site (GH-14/GH-16). This story is their first producer and adds one kind.
- The config loader (`src/app/config.ts`) + `src/domain/config/schema.json` are the ajv+yaml+Result pattern to mirror for the lock; the `ConfigAjvError` plain-data record is reused for `CorruptLock.ajvErrors`.
- `ajv` (^8.20.0), `yaml` (^2.9.0), `uuid` (^14) are installed; no new dependency is needed.
- `sync.allowBranches` (default `["main"]`) and `sync.stalePlanMinutes` (default 15) already exist in the config schema (GH-15); the branch gate reads `allowBranches` unchanged.
- ADR-0006 (C-2 committed base, C-3 cache disposable, Cross-check, Branch restriction) is settled and being **implemented**, not reconsidered (DEC-1).
- The `.gitignore` from GH-14 already ignores `.marksync/`; this story verifies the entry (and does not rely on cache for correctness regardless).
- `reconcileWithProperty` / `rebuildLockFromConfluence` are pure over caller-supplied records; the Confluence property fetch is E3-S4.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S1 (GH-18) | Provides `PageBinding`, `DocumentId`. Merged (PR #50). |
| Depends on | MS2-E2-S2 (GH-15) | Provides the ajv+yaml+Result config pattern, `ConfigAjvError`, `sync.allowBranches`. Merged. |
| Depends on | MS2-E2-S3 (GH-16) | Provides `CommandResult<T>` / mapper / `CODE_TO_EXIT` updated for `CorruptLock`. Merged. |
| Depends on | ADR-0006 | Load-bearing: C-2 (committed base), C-3 (cache disposable), Cross-check, Branch restriction, the lock schema. |
| Depends on | typescript.md | Tier rules, "add a kind" procedure, ajv-for-user-schema boundary, atomic-write guidance. |
| Depends on | system spec §9.3 | The verbatim lock + property + cache schema. |
| Blocks | MS2-E3-S5 (drift) | Reads the lock for the base. |
| Blocks | MS2-E3-S6 (sync engine) | Reads + atomically updates the lock; calls `reconcileWithProperty`, `assertBranchAllowed`, `mergeBindings`. |
| Blocks | MS2-E4-S1 (mermaid cache) / E4-S4 (repair) | Consumes the cache layout / `rebuildLockFromConfluence`. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Single repo-wide lock vs per-target lock files? | ADR-0006 unresolved Q1 (owner JC, default per-target). | Resolved → DEC-1: a **single** `marksync.lock.yml` with a `targets:` map (per-target organization), line-oriented/UUID-ordered. Matches system spec §9.3 verbatim; reversible. |
| OQ-2 | Filename `.yml` vs `.yaml`? | Spec §9.3 wrote `marksync.lock.yaml`; the story wrote `.yml`. | Resolved → `.yml` (matches the `marksync.yml` config convention). |

> No question requires `@decision-advisor` escalation: ADR-0006 is settled, and OQ-1/OQ-2 are specification details resolved by alignment with the system spec + config convention.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Single committed `marksync.lock.yml`** at repo root with a `targets:` map; each target's `documents:` keyed by UUID v7, line-oriented + UUID-ordered for mergeability. Resolves ADR-0006 unresolved Q1. | Matches system spec §9.3 lock schema verbatim; "per-target" = per-target **organization** inside one committed file (UUID-keyed entries still merge cleanly across branches — AC-MERGE-1); fewer files to commit/review for MS-0002's small target counts; reversible (a migration can split later). Lowest-surprise choice (aligns inception spec + `PageBinding` + ADR-0006 default-assumption). | 2026-07-09 |
| DEC-2 | **Add `CorruptLock` as a new `MarkSyncError` kind** (`{ path; ajvErrors?; humanMessage }`) for invalid locks, and update every exhaustive site (`assertNeverMarkSyncError`, `cli-error-map.ts`, `CODE_TO_EXIT`, DEC-2 table) in this change. | A corrupt lock (bad version / missing field / unparseable) has a **distinct recovery action** (regenerate / `rebuildLockFromConfluence`) from `LockDirty` (property-tamper → reconcile) — so a distinct kind per the error-handling rules. `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch` already exist and are first-consumed here. | 2026-07-09 |
| DEC-3 | **`reconcileWithProperty` / `rebuildLockFromConfluence` are pure** over caller-supplied records (no I/O). | Keeps this story dependency-free of network code and testable with real fixtures; the property fetch is E3-S4. The cross-check is "a pure function over two records" (story Technical approach). | 2026-07-09 |
| DEC-4 | **`mergeBindings` uses last-write-wins with a deterministic tiebreak** as the primitive; serialized apply (E3-S7) + `repair-state` handle residual conflicts. | Provides a deterministic, testable merge primitive now; the conflict-policy complexity belongs to concurrency control (E3-S7), not the state-manager primitive. | 2026-07-09 |
| DEC-5 | **A missing lock file is `ok(empty LockFile)`, not an error.** | A fresh corpus has no base yet; treating absence as the initial state lets plan/sync proceed (E3-S5/S6) without special-casing. Only a **present-but-invalid** lock is `err(CorruptLock)`. | 2026-07-09 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Lock module (`src/app/lock.ts`) | New — `loadLock` / `saveLock` / `mergeBindings` |
| Lock schema (`src/domain/config/lock-schema.json`) | New — JSON Schema v1 |
| Atomic store (`src/infra/lock/store.ts`) | New — atomic write + crash hook |
| Cache layout (`src/app/cache.ts`) | New — `resolveCacheDir` / `ensureCacheLayout` |
| Cross-check (pure) (`src/app/lock.ts` or `src/domain/state/`) | New — `reconcileWithProperty` / `rebuildLockFromConfluence` (residence per tier rules: pure logic may live in domain) |
| Branch gate (`src/app/lock.ts` or `src/app/branch.ts`) | New — `assertBranchAllowed` |
| `MarkSyncError` union + exhaustive sites | Extended — new `CorruptLock` kind; `assertNeverMarkSyncError`, `cli-error-map.ts`, `CODE_TO_EXIT` updated |
| `.env.example` | Updated — `MARKSYNC_CACHE_DIR`, `MARKSYNC_ALLOW_BRANCHES` documented |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria, which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F4-1 (C-3) | **Given** `.marksync/` exists, **when** it is deleted and a plan is recomputed, **then** the output is **byte-identical** (0 bytes diff) — cache held no correctness data. | F-4, NFR-1 | C-3 (NFR-COMP-6) |
| AC-F1-1 | **Given** a valid `marksync.lock.yml`, **when** `loadLock` runs, **then** it returns `ok(LockFile)`; and **given** a lock with a bad `version` or missing required field or unparseable YAML, **then** it returns `err(CorruptLock)` with an AI-readable `humanMessage`. | F-1, F-2, F-7, NFR-2, NFR-3 | lock loads/validates |
| AC-F3-1 | **Given** a crash is injected (test hook) between the temp write and the rename, **when** `saveLock` runs, **then** the destination is **unchanged** and the temp file is abandoned (no partial lock). | F-3, NFR-4, NFR-5 | saveLock atomic |
| AC-F5-1 | **Given** a `marksync.metadata` property whose `sourceCommit` ≠ the lock, **when** `reconcileWithProperty` runs, **then** it returns `err(LockDirty)`; and **given** a matching property, **then** it returns `ok`. | F-5, NFR-6, NFR-7 | reconcileWithProperty |
| AC-F5-2 | **Given** `{ property, pageVersion, hashes }` from a remote page, **when** `rebuildLockFromConfluence` runs, **then** it reconstructs a `PageBinding` field-equal to the original. | F-5, NFR-8 | rebuildLockFromConfluence |
| AC-F6-1 | **Given** branch `main` (default), **when** `assertBranchAllowed` runs, **then** `ok`; **given** branch `feature/x`, **then** `err(ForbiddenBranch)`; **given** `MARKSYNC_ALLOW_BRANCHES=feature/x` + branch `feature/x`, **then** `ok`. | F-6, NFR-9, NFR-10 | assertBranchAllowed |
| AC-MERGE-1 | **Given** two branches each add a doc with a different UUID to `targets.T.documents`, **when** the lock files are merged by git, **then** they merge cleanly with **no manual conflict**. | F-1, NFR-11 | per-target mergeable |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + typecheck + test + boundaries) runs, **then** it exits **0**. | NFR-14, NFR-16 | `bun run check` green |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** Depends on GH-18 (merged); reuses GH-15/GH-16 unchanged except the `CorruptLock` exhaustive-site updates. Blocks E3-S5, E3-S6, E4-S1/E4-S4.
- **Merge strategy:** Conventional Commits (TDR-0008); scope `feat(state)` or `feat(lock)` is appropriate.
- **Ordering within the story:** (1) add `CorruptLock` + update every exhaustive site (DEC-2) first so the error model is complete; (2) land the pure lock schema + `LockFile`/`LockError` types + `loadLock` (valid + invalid cases); (3) land the atomic store + crash hook; (4) land `saveLock` + the mergeability test; (5) land the cache layout + the disposability test; (6) land the pure cross-check functions; (7) land the branch gate. Each step is independently testable.
- **After merge:** E3-S5 reads the lock; E3-S6 reads/updates it atomically, calls `reconcileWithProperty` + `assertBranchAllowed` + `mergeBindings`; E3-S4 supplies the property; E4-S4 consumes `rebuildLockFromConfluence`. The lock/cache/branch arms become *produced* errors, not speculatively-landed ones.
- **Phase 7 doc-sync (`@doc-syncer`):** update `ubiquitous-language.md` (Lock, Cache, PageBinding → live constructs); `feature-safe-publish.md` §3.1/§4.2 (State manager → current-truth); ADR-0006 (Implementation-Plan item 2 lock delivered; unresolved Q1 resolved → DEC-1); `id-prefix-catalog.md` (INV-SEC-1 lock-no-secrets); `.env.example` (`MARKSYNC_CACHE_DIR`, `MARKSYNC_ALLOW_BRANCHES`).

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield; no prior lock exists (NG-6). The first `saveLock` after the first successful sync (E3-S6) creates `marksync.lock.yml`. A lost lock is rebuilt via `rebuildLockFromConfluence` (F-5), not migrated.

## 20. PRIVACY / COMPLIANCE REVIEW

The lock is committed and contains **no** credentials/tokens (ADR-0006, NFR-13, INV-SEC-1). The cache holds rendered bodies/asset metadata (no secrets). The branch gate and cache-dir env vars carry no PII. A test asserts no secret-bearing field is written to the lock.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No secrets in the committed lock** (INV-SEC-1) — by construction (the `PageBinding` field set has no credential) and asserted by a test.
- **`MARKSYNC_ALLOW_BRANCHES` is an intentional, documented escape hatch** (feature-branch previews), not a bypass — it augments the allowed set and is logged (RSK-6).
- **`humanMessage` reports field path + expected vs actual**, never raw secret-bearing values; governed by the redaction layer (RSK-7).
- **No shell invocation** in the store (pure `fs` APIs); the cache dir path is resolved from `cwd` + env, not user-exec input.

## 22. MAINTENANCE & OPERATIONS IMPACT

- The lock is a committed, reviewed artifact — merge conflicts are mitigated by the line-oriented UUID-ordered format (E3-S7 + `repair-state` handle the residual).
- The cache is disposable; CI may cache `.marksync/cache/` only (the reconstructable subtree).
- Adding a future lock field requires a schema bump (`version`) and, if breaking, a migration path (deferred, NG-6).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Shared base | The agreed "last published" state shared across clones/CI — the committed lock (ADR-0006 C-2). |
| Lock file | `marksync.lock.yml` — committed, versioned, `DocumentId → PageBinding` per target. |
| Disposable cache | `.marksync/` — gitignored; deleting it changes no plan (C-3). |
| Content-property cross-check | `marksync.metadata` mirrors key lock fields; `reconcileWithProperty` / `rebuildLockFromConfluence` use it. |
| Branch gate | `assertBranchAllowed` — confines sync to `sync.allowBranches` (+ `MARKSYNC_ALLOW_BRANCHES`). |

## 24. APPENDICES

- **Lock schema sketch** (aligns `lock-schema.json` with system spec §9.3): `version: 1` (const); `targets: { <targetId>: { documents: { <uuid>: PageBinding } } }`.
- **Property sketch** (system spec §9.3): `{ schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceContentHash, renderedBodyHash, toolVersion, synchronizedAt }`.
- **Cache sketch** (system spec §9.3 / ADR-0006): `.marksync/{cache, journal, conflicts}/`.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | PM (ADOS) | Initial specification |

---

## AUTHORING GUIDELINES

Authored by the PM directly (not via `@spec-writer`) because repeated subagent delegations were externally interrupted in this session — per the GH-13 precedent ("PM executes directly when subagents stall in this environment"). This is a specification **document**, not source code, so it does not violate the PM no-source-code constraint. Sources: the story file (authoritative scope), ADR-0006, system spec §9.3, feature-safe-publish.md, typescript.md, testing-strategy.md, and the GH-18 foundation (`PageBinding`, `MarkSyncError`). The GH-18 spec was used as the structural/quality reference.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-19`
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-, NG-, G-)
- [x] Acceptance criteria reference F-/NFR- IDs and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details beyond module residence (no step-by-step code)
- [x] No content duplicated from linked docs (cited, not copied)
- [x] Front matter validates per the template
