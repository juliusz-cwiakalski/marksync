---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-19-state-manager-lock-cache
status: Proposed
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, state, lock, cache, safety, foundation]
links:
  change_spec: ./chg-GH-19-spec.md
  test_plan: ./chg-GH-19-test-plan.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S2--state-manager.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  system_spec_9_3: ../../../inception/system-specification-draft-from-ai-brainstorm.md
  typescript_rules: ../../../.ai/rules/typescript.md
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  config_loader_precedent: ../../../../src/app/config.ts
  gh18_plan_precedent: ../2026-07-09--GH-18--document-identity-uuid-v7/chg-GH-18-plan.md
  env_example: ../../../../.env.example
summary: >
  Deliver MS-0002 state manager (MS2-E3 — Safe Publish Core, second story): the
  shared-base half of ADR-0006. A committed, versioned, **atomic** lock file
  (`marksync.lock.yml`) mapping `DocumentId → PageBinding` per Confluence target
  (loadLock/saveLock/mergeBindings via ajv against a JSON Schema v1), a **disposable**
  `.marksync/cache/` layout where deletion changes no plan (ADR-0006 C-3), a **pure**
  content-property cross-check (reconcileWithProperty → LockDirty; rebuildLockFromConfluence),
  and a **branch gate** (assertBranchAllowed → ForbiddenBranch, MARKSYNC_ALLOW_BRANCHES).
  Adds one new `MarkSyncError` kind — `CorruptLock` — wired through every exhaustive
  site (assertNeverMarkSyncError + mapper + CODE_TO_EXIT). The lock loader mirrors the
  GH-15 config-loader pattern (ajv + yaml + Result); the atomic store lives in
  `src/infra/lock/store.ts`; cache layout in `src/app/cache.ts`; pure cross-check logic
  in `src/domain/state/`. No new runtime dependency (ajv/yaml/uuid reused). Out of scope:
  drift classification (E3-S5), sync-engine orchestration (E3-S6), Confluence property
  fetch (E3-S4), apply-journal replay (E3-S6).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-19: [MS2-E3-S2] State manager (committed lock + disposable cache + property cross-check)

## Context and Goals

This plan delivers the **shared base** for MS-0002 (epic MS2-E3 — Safe Publish Core,
second story). It is the foundation drift classification (E3-S5), the sync engine
(E3-S6), repair (E4-S4), and the cache consumers (E3-S3/E4-S1) build on. Concretely it
establishes:

- the **committed, versioned, atomic lock** (`marksync.lock.yml`) — `loadLock` /
  `saveLock` / `mergeBindings`, validated by ajv against a JSON Schema v1, written
  atomically (temp + `fs.rename`), laid out as line-oriented UUID-ordered mergeable YAML
  (ADR-0006 C-2; DEC-1);
- the **disposable cache layout** — `.marksync/{cache,journal,conflicts}/` with
  `MARKSYNC_CACHE_DIR` override; deleting `.marksync/` changes no plan (ADR-0006 C-3);
- the **pure content-property cross-check** — `reconcileWithProperty` (flags a
  `sourceCommit` mismatch as `LockDirty`) and `rebuildLockFromConfluence` (reconstructs a
  `PageBinding` from the remote property + version + hashes) (ADR-0006 Cross-check);
- the **branch gate** — `assertBranchAllowed` → `ForbiddenBranch` unless the branch ∈
  `sync.allowBranches` or overridden by `MARKSYNC_ALLOW_BRANCHES` (ADR-0006 deployment
  gate);
- the **`CorruptLock` `MarkSyncError` kind** for invalid locks, wired through every
  exhaustive site (DEC-2 / typescript.md "add a kind").

The plan is derived entirely from the authoritative story `MS2-E3-S2--state-manager.md`
(7 deliverables, 8 testable ACs), ADR-0006 (C-2, C-3, Cross-check, Branch restriction),
and system spec §9.3 (lock + property + cache schema). It invents no requirements. The
change spec `chg-GH-19-spec.md` (same folder) is the contract authority; this plan
operationalizes it.

### Binding decisions

> Resolved at intake (`chg-GH-19-pm-notes.yaml`). Committed here; delivery must not
> re-litigate them.

- **PD-1 — Single `marksync.lock.yml` with a `targets:` map (resolves ADR-0006 unresolved
  Q1).** "Per-target" = per-target **organization** inside one committed file: a top-level
  `version: 1` + `targets: { <targetId>: { documents: { <uuid>: PageBinding } } }`. UUID
  v7 keys are time-sortable, so the documents map serializes in sorted UUID order — line-
  oriented, one block per document — making two branches adding different-UUID docs merge
  cleanly (AC-MERGE-1). Matches system spec §9.3 verbatim. Filename `.yml` (config
  convention; spec wrote `.yaml`). Reversible (a migration can split per-target later).
- **PD-2 — Add `CorruptLock` as a new `MarkSyncError` kind** (`{ kind: "CorruptLock";
  path: string; ajvErrors?: ConfigAjvError[]; humanMessage: string }`); update every
  exhaustive site (`assertNeverMarkSyncError`, `src/app/cli-error-map.ts`,
  `src/cli/output/exit-codes.ts` `CODE_TO_EXIT`, DEC-2 exit-code table) in **Phase 0**,
  before any code produces it. `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch` already
  exist and are first-consumed here.
- **PD-3 — The cross-check functions are PURE** over caller-supplied records and live in
  `src/domain/state/` (domain imports nothing). `reconcileWithProperty` /
  `rebuildLockFromConfluence` perform no I/O; the property fetch is E3-S4.
- **PD-4 — `mergeBindings` is last-write-wins with a deterministic tiebreak** (the
  primitive E3-S6 wires into serialized apply). Conflict-policy complexity belongs to
  concurrency control (E3-S7), not the state-manager primitive.
- **PD-5 — A missing lock file is `ok(empty LockFile)`, not an error.** A fresh corpus has
  no base yet. Only a present-but-invalid lock is `err(CorruptLock)`.
- **PD-6 — The atomic store mirrors Bun `fs.rename` (POSIX atomic; replace-over-existing
  handled cross-OS).** A module-level crash hook (`__marksync_test_crash_after_temp_write`,
  off by default, set only by tests) throws between temp-write and rename so the atomic
  guarantee is provable.
- **PD-7 — No new runtime dependency.** `ajv` (^8.20.0), `yaml` (^2.9.0), `uuid` (^14) are
  installed (GH-15/GH-18). There is no Phase-0 dependency install.

### Open questions

- **`CorruptLock` exit class.** The existing invariant/data classes are the model; the
  application-tier mapper assigns a stable `code` (`CORRUPT_LOCK`) and a non-zero exit
  consistent with the other data/config classes. Resolved at delivery by following the
  existing `CODE_TO_EXIT` pattern (DEC-2); no escalation needed.

### Out of scope

- **Drift classification** (E3-S5) — consumes the lock; does not classify here.
- **Sync-engine lock orchestration** (E3-S6) — reads + atomically updates the lock, calls
  `reconcileWithProperty` + `assertBranchAllowed` + `mergeBindings`. The call sites are
  E3-S6.
- **Confluence property fetch** (E3-S4) — `reconcileWithProperty` /
  `rebuildLockFromConfluence` take the property as an argument.
- **Apply-journal write/replay** (E3-S6) — this story creates the `journal/` directory
  only.
- **Lock schema migration (v2)** — v1 only.
- **Full system-spec reconciliation** — lifecycle phase 7 (`@doc-syncer`).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, dep-cruiser-enforced):
  - `src/domain/config/lock-schema.json` — a JSON asset, imports nothing.
  - `src/domain/state/reconcile.ts` — domain; imports only `#domain/*` (`PageBinding`,
    `MarkSyncError`, `Result`). No app/cli/infra.
  - `src/app/lock.ts`, `src/app/cache.ts`, `src/app/branch.ts` — application; import
    `#domain/*` (+ `#infra/lock/store` via the port pattern), `node:fs`/`node:path`,
    `ajv`, `yaml`. Never `#cli/*`.
  - `src/infra/lock/store.ts` — infrastructure; imports `#domain/*` only (+ `node:fs`).
    Never app/cli.
  - `src/app/cli-error-map.ts`, `src/cli/output/exit-codes.ts` — extended for `CorruptLock`
    (the error-arm update touches app + cli as the existing arms do).
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`): one import statement per module (inline `type` modifier);
  `array[i]` is `T | undefined`; the optional `ajvErrors?` on `CorruptLock` is
  absent-not-undefined.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`, `#app/*`,
  `#infra/*`). Tests use `#`-aliases, not deep relative paths.
- **Error discipline**: domain/application functions return `Result<T, E>` (never `throw`
  for expected failures). The `CorruptLock` arm is added in Phase 0 so the union is
  exhaustive from the first producer.
- **ajv-for-user-schema boundary** (typescript.md §IO boundaries): the lock — like config
  — is a user-authored-schema artifact → ajv (not zod). Schema compiled once (module
  singleton), `allErrors` + `verbose`.
- **Comments discipline**: ≤ 3-line file headers; self-documenting code; cite the
  authority once at the load-bearing point (ADR-0006 C-2/C-3, INV-SEC-1); no bare tags.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-Q-1). Conventional Commits (commitlint + husky); each
  phase = one logical commit; `check:boundaries` green at every commit.

### Risks

- **RSK-1 — Cache becomes load-bearing for correctness** (C-3 violated). Mitigated by
  PD-1 (the committed lock is the sole base, NOT in the cache) + TC-CACHE-003/004 (delete
  the cache → base unchanged; lock is outside the cache; `.gitignore` ignores the cache).
- **RSK-2 — Atomic write not atomic (partial lock on crash / Windows rename).** Mitigated
  by PD-6 (temp + `fs.rename`) + TC-ATOMIC-001 (crash hook → dest unchanged, temp
  abandoned) + TC-ATOMIC-002 (replace-over-existing).
- **RSK-3 — `CorruptLock` misses an exhaustive site.** Mitigated by Phase 0 doing the full
  "add a kind" procedure + the `assertNeverMarkSyncError` never-check (typecheck fails if
  any site is missed) + TC-CORRUPT-001.
- **RSK-4 — Lock merge conflicts on concurrent branch publishes.** Mitigated by PD-1
  (line-oriented, UUID-ordered) + TC-MERGE-001; residual handled by E3-S7/E4-S4.
- **RSK-5 — A lost lock is unrecoverable.** Mitigated by `rebuildLockFromConfluence`
  (TC-REBUILD-001).
- **RSK-6 — `humanMessage` leaks a secret.** The lock carries no secrets (INV-SEC-1,
  TC-NOSECRET-001); `humanMessage` reports field path + expected vs actual only.

### Success Metrics

- A valid lock loads; an invalid lock → `CorruptLock` (AC-F1-1).
- Atomic write: crash leaves the prior lock intact (AC-F3-1).
- Deleting `.marksync/` changes no base (AC-F4-1 / C-3).
- `reconcileWithProperty` flags a `sourceCommit` mismatch as `LockDirty` (AC-F5-1).
- `rebuildLockFromConfluence` reconstructs a field-equal binding (AC-F5-2).
- `assertBranchAllowed`: `main` ok; `feature/x` → `ForbiddenBranch`; override ok (AC-F6-1).
- Two branches adding different-UUID docs merge cleanly (AC-MERGE-1).
- `bun run check` exits 0 (AC-Q-1).

---

## Execution Strategy

Seven phases, one logical commit each. Phase 0 (error model) lands first so the union is
exhaustive before any producer; then the schema+loader, atomic store, saver+merge, cache,
cross-check, branch gate. `bun run check:boundaries` runs in every phase. Suggested commit
scopes: `feat(state)`, `feat(lock)`, `feat(cache)`.

---

### Phase 0: Add the `CorruptLock` error kind + wire every exhaustive site

**Goal**: Complete the "add a kind" procedure (DEC-2 / PD-2) BEFORE any code produces a
`CorruptLock`, so the `MarkSyncError` union stays exhaustive from the first producer. The
existing `LockDirty` / `ConcurrentWrite` / `ForbiddenBranch` arms are already mapped; this
phase adds only `CorruptLock` and its mapping.

**Tasks**:

- [x] **0.1** Edit `src/domain/errors.ts`:
      - Add the union arm `{ kind: "CorruptLock"; path: string; ajvErrors?: ConfigAjvError[]; humanMessage: string }` (reuse the existing `ConfigAjvError` interface — same plain-data shape `InvalidConfig` uses).
      - Add `case "CorruptLock":` to `assertNeverMarkSyncError` (the never-check forces
        this; `tsc` fails otherwise).
      - Add `export type LockError = Extract<MarkSyncError, { kind: "CorruptLock" | "LockDirty" | "ConcurrentWrite" }>;` (the narrowed channel `loadLock`/`saveLock` declare — mirrors `ConfigError`/`AuthError`).
      - ≤ 3-line header unchanged; cite ADR-0006 + this change once where the arm is
        declared. *(done — arm + LockError added; assertNeverMarkSyncError case added; typecheck green)*
- [x] **0.2** Edit `src/app/cli-error-map.ts`: add the `CorruptLock` case → a stable
      `code` (`CORRUPT_LOCK`), an AI-readable `message` (from `humanMessage`), and
      `retryable: false`. Follow the existing `InvalidConfig` mapping exactly. *(done — mirrors InvalidConfig: structural ajvError count + a parse-failure branch; DEC-5-safe — never surfaces path/humanMessage body)*
- [x] **0.3** Edit `src/cli/output/exit-codes.ts`: add `CORRUPT_LOCK` to `CODE_TO_EXIT`
      (a non-zero exit consistent with the other data/config classes) and to the
      `ERROR_CODES` const object (no magic strings — typescript.md "No magic strings"). *(done — `CORRUPT_LOCK: EXIT_CONFIG` (10, config class). NOTE: no `ERROR_CODES` const exists in the codebase today; followed the established `CODE_TO_EXIT` keyed-string pattern used by all 17 prior codes — deviation recorded in execution log)*
- [x] **0.4** Update the DEC-2 exit-code table doc (the `error.code → exit` reference,
      wherever `CODE_TO_EXIT` is documented) to include `CORRUPT_LOCK`. *(done — both DEC-2 comment tables updated: cli-error-map.ts + exit-codes.ts)*
- [x] **0.5** Add/extend tests:
      - `tests/unit/domain/errors.test.ts` — assert `CorruptLock` is a valid
        `MarkSyncError` member and `assertNeverMarkSyncError` does not flag it.
      - `tests/unit/app/cli-error-map.test.ts` — assert `CorruptLock` maps to
        `{ code: "CORRUPT_LOCK", retryable: false }`.
      - `tests/unit/cli/output/exit-codes.test.ts` — assert `CORRUPT_LOCK` resolves to a
        non-zero exit (TC-CORRUPT-001 side-checks). *(done — all three extended; + adversarial redaction entry for CorruptLock)*

**Acceptance Criteria**:

- Must: `bun run typecheck` exits 0 (the never-check passes — `CorruptLock` is handled
  everywhere).
- Must: `bun run check:boundaries` exits 0.
- Must: the mapper + `CODE_TO_EXIT` tests pass for `CorruptLock`.
- Must: NO production code produces `CorruptLock` yet (Phase 1 is the first producer).

**Files and modules**: `src/domain/errors.ts`, `src/app/cli-error-map.ts`,
`src/cli/output/exit-codes.ts`, the DEC-2 doc, the three test files.

**Tests**: TC-CORRUPT-001 (regression side-checks across errors/mapper/exit-codes).

**Completion signal**: `feat(state): add CorruptLock error kind + wire exhaustive sites (GH-19)`

---

### Phase 1: Lock JSON Schema v1 + LockFile types + loadLock

**Goal**: Deliver F-2 (schema) and the read half of F-1 (`loadLock`). Mirror the GH-15
config-loader pattern: schema is the source of truth, ajv validates, `loadLock` returns
`Result<LockFile, LockError>`. A missing file → `ok(empty)` (PD-5); an invalid file →
`err(CorruptLock)`.

**Tasks**:

- [x] **1.1** Create `src/domain/config/lock-schema.json` (JSON Schema draft-07, same
      draft as `schema.json`):
      - `type: object`, `required: ["version", "targets"]`, `additionalProperties: false`.
      - `version`: const `1`.
      - `targets`: `additionalProperties` → a target object with `documents`
        (`additionalProperties` → a `PageBinding`-shaped object whose required fields are
        `sourcePath, pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash,
        renderedBodyHash, remoteBodyHash, attachmentHashes, operationId, synchronizedAt,
        toolVersion`). `pageVersion` is `type: number`; `attachmentHashes` is
        `object`; the rest are `type: string`. *(done — uuid is the documents key, not a duplicated field; entry = PageBinding minus uuid via `$defs/pageBinding`)*
- [x] **1.2** Create the `LockFile` + lock types in `src/domain/config/lock-types.ts`
      (new) — `LockFile`, `LockTarget`, aligned with the schema and the existing
      `PageBinding` (reuse `#domain/binding/page-binding`). Export `LockError` re-export
      from `#domain/errors` (or import the type). Keep types dependency-free (domain). *(done — LockFile/LockTarget; re-exports LockError)*
- [x] **1.3** Create `src/app/lock.ts` (new) with `loadLock`:
      - Import `ajv`, `yaml`, `node:fs`, `#domain/config/lock-types`, `#domain/errors`,
        `#domain/result`, the schema via a relative path (JSON cannot go through the
        `#domain/*` alias — same justified deviation as `config.ts`).
      - Compile the schema once (module singleton, `allErrors` + `verbose`).
      - `loadLock(cwd): Result<LockFile, LockError>`:
        - read `marksync.lock.yml`; ENOENT → `ok({ version: 1, targets: {} })` (PD-5).
        - YAML parse failure → `err({ kind: "CorruptLock"; path; humanMessage })`.
        - ajv failure → `err({ kind: "CorruptLock"; path; ajvErrors: mapAjvErrors(...);
          humanMessage: formatLockErrors(...) })`.
        - valid → `ok(parsed as LockFile)`.
      - Reuse/extend the `mapAjvErrors` + `formatConfigErrors` helpers from
        `#app/config-errors` (or add `#app/lock-errors` mirroring them). Keep
        `humanMessage` AI-readable (field path + expected vs actual + suggested fix).
      - ≤ 3-line header citing ADR-0006 C-2 once. *(done — generalized config-errors to `formatAjvErrors(errors, label)` + thin `formatConfigErrors` wrapper (DRY, config tests unaffected); loadLock injects uuid from key; missing→ok(empty), invalid→err(CorruptLock))*
- [x] **1.4** Create `tests/app/lock.test.ts` (new) — **Unit**; real fixtures (no mocks):
      - **TC-LOCK-001:** valid lock → `ok(LockFile)` with expected structure.
      - **TC-LOCK-002:** missing file → `ok({ version:1, targets:{} })` (PD-5).
      - **TC-LOCK-003:** `version: 2` → `err(CorruptLock)` with field-path `humanMessage`.
      - **TC-LOCK-004:** missing required field → `err(CorruptLock)` with JSON pointer.
      - **TC-LOCK-005:** unparseable YAML → `err(CorruptLock)`.
      - **TC-CORRUPT-001 (producer):** the `CorruptLock` from TC-LOCK-003 flows through the
        mapper → `CORRUPT_LOCK` code/exit (first producer of the Phase-0 arm). *(done — all 5 + producer PASS)*

**Acceptance Criteria**:

- Must: valid + missing + invalid (3 variants) lock cases pass (AC-F1-1, NFR-2, NFR-3,
  NFR-12).
- Must: `bun run check` exits 0; `check:boundaries` clean (lock-schema imports nothing;
  `lock.ts` imports domain + ajv/yaml/fs, not cli).

**Files and modules**: `src/domain/config/lock-schema.json`, `src/domain/config/lock-types.ts`,
`src/app/lock.ts`, `src/app/lock-errors.ts` (if added), `tests/app/lock.test.ts`.

**Tests**: TC-LOCK-001..005, TC-CORRUPT-001 (producer).

**Completion signal**: `feat(lock): loadLock + lock JSON schema v1 (GH-19)`

---

### Phase 2: Atomic store + crash hook

**Goal**: Deliver F-3 — the atomic write primitive (`src/infra/lock/store.ts`) with the
crash-injection hook that proves no partial lock survives a mid-write failure. The store
owns the `LockJournal` integration point (the journal write/replay is E3-S6).

**Tasks**:

- [x] **2.1** Create `src/infra/lock/store.ts` (new):
      - `writeAtomic(dest: string, data: string): Result<void, LockError>` — write to
        `${dest}.${tmpSuffix}` then `fs.rename(tmp, dest)` (POSIX atomic; Bun handles
        replace-over-existing on Windows).
      - A module-level crash hook: `let __marksync_test_crash_after_temp_write = false;`
        (exported for tests); when `true`, throw between the temp write and the rename.
      - `tmpSuffix`: a stable, unique suffix (e.g. `.marksync-tmp`); the temp file is
        abandoned on crash (never the dest).
      - Imports: `node:fs`/`node:path`, `#domain/errors`, `#domain/result`. No app/cli.
      - ≤ 3-line header citing ADR-0006 (atomic write) once. *(done — writeAtomic + `armCrashAfterTempWrite` setter (ESM live-binding-safe); `.marksync-tmp` suffix; crash throws (a real process death does not return); fs failures → err(ConcurrentWrite))*
- [x] **2.2** Create `tests/integration/lock/store.test.ts` (new) — **Integration**;
      real temp-dir I/O (`fs.mkdtemp`):
      - **TC-ATOMIC-001:** arm the crash hook; call `writeAtomic`; assert it throws/errs;
        assert `dest` is byte-identical to the pre-existing content; assert the temp file
        exists but is NOT the lock (abandoned).
      - **TC-ATOMIC-002:** without the hook, overwrite an existing file via `writeAtomic`
        (replace-over-existing); assert the new content is present. *(done — TC-ATOMIC-001 dest-unchanged+temp-abandoned, TC-ATOMIC-002 replace-over-existing + fresh-dest, + a real fs-fault test covering the err(ConcurrentWrite) path; all PASS)*

**Acceptance Criteria**:

- Must: crash leaves dest unchanged + temp abandoned (AC-F3-1, NFR-4).
- Must: replace-over-existing works (NFR-5).
- Must: `bun run check` exits 0; `check:boundaries` clean (`infra/lock/store.ts` imports
  domain only).

**Files and modules**: `src/infra/lock/store.ts`, `tests/integration/lock/store.test.ts`.

**Tests**: TC-ATOMIC-001, TC-ATOMIC-002.

**Completion signal**: `feat(lock): atomic write store + crash hook (GH-19)`

---

### Phase 3: saveLock + mergeBindings + round-trip + mergeability

**Goal**: Deliver the write half of F-1 (`saveLock`) + `mergeBindings`, proving the
round-trip (save→load → equal) and the two-branch mergeability invariant (AC-MERGE-1).

**Tasks**:

- [ ] **3.1** Extend `src/app/lock.ts` with `saveLock` + `mergeBindings` + serialization:
      - `serializeLock(lock: LockFile): string` — emit line-oriented YAML: top-level
        `version` + `targets`, each target's `documents` serialized in **sorted UUID
        order** (deterministic, mergeable — PD-1). Use `yaml.stringify` with block style
        and stable key ordering; assert the output is one document-block per UUID.
      - `saveLock(lock): Result<void, LockError>` — `serializeLock` → `writeAtomic(<cwd>/
        marksync.lock.yml, serialized)` (Phase 2 store).
      - `mergeBindings(a: LockFile, b: LockFile): LockFile` — union targets; within a
        target, union `documents` by UUID; on a UUID present in both, last-write-wins with
        a deterministic tiebreak (PD-4). Pure.
      - ≤ 3-line header.
- [ ] **3.2** Create `tests/integration/lock/lock-roundtrip.test.ts` (new) —
      **Integration**; temp cwd:
      - **TC-LOCK-006:** `saveLock` then `loadLock` → deep-equal `LockFile`; assert the
        on-disk file is UUID-ordered (entries appear sorted).
      - **TC-MERGE-001:** base lock (uuidA) + branch-A (adds uuidB) + branch-B (adds
        uuidC); simulate a line merge (`git merge-file` if available, else assert the
        line-structured YAML has no overlapping changed regions) → clean merge containing
        all three. Also assert `mergeBindings(loadA, loadB)` is the union without loss.
      - **TC-NOSECRET-001:** serialize a full lock; assert the file contains no
        credential/token/email field (INV-SEC-1).

**Acceptance Criteria**:

- Must: round-trip is lossless (AC-F1-1); on-disk format is UUID-ordered.
- Must: two-branch different-UUID merge is clean (AC-MERGE-1, NFR-11).
- Must: lock has no secret field (NFR-13 / INV-SEC-1).
- Must: `bun run check` exits 0.

**Files and modules**: `src/app/lock.ts` (extended), `tests/integration/lock/lock-roundtrip.test.ts`.

**Tests**: TC-LOCK-006, TC-MERGE-001, TC-NOSECRET-001.

**Completion signal**: `feat(lock): saveLock + mergeBindings + mergeable lock format (GH-19)`

---

### Phase 4: Disposable cache layout

**Goal**: Deliver F-4 — `resolveCacheDir` / `ensureCacheLayout` (`src/app/cache.ts`) with
the `MARKSYNC_CACHE_DIR` override, and prove the cache holds no base/correctness data
(ADR-0006 C-3).

**Tasks**:

- [ ] **4.1** Create `src/app/cache.ts` (new):
      - `CACHE_SUBDIRS = ["cache", "journal", "conflicts"] as const` (the layout).
      - `resolveCacheDir(cwd: string): string` — `process.env.MARKSYNC_CACHE_DIR ?? join(cwd, ".marksync")`.
      - `ensureCacheLayout(dir: string): Result<void, MarkSyncError>` — lazily `mkdir -p`
        `<dir>/cache`, `<dir>/journal`, `<dir>/conflicts` (idempotent).
      - A comment noting `.marksync/` is gitignored (verify the `.gitignore` entry from
        GH-14 exists; add it if missing) and that the cache is NEVER the base (the
        committed lock is).
      - Imports: `node:fs`/`node:path`, `#domain/errors`, `#domain/result`. No cli.
      - ≤ 3-line header citing ADR-0006 C-3 once.
- [ ] **4.2** Create `tests/app/cache.test.ts` (new) — **Unit**:
      - **TC-CACHE-001:** `resolveCacheDir` default + `MARKSYNC_CACHE_DIR` override.
      - **TC-CACHE-004:** assert the lock path (`marksync.lock.yml`) is OUTSIDE the cache
        dir; assert `.gitignore` ignores `.marksync/`.
- [ ] **4.3** Create `tests/integration/cache/cache-disposable.test.ts` (new) —
      **Integration**; temp cwd:
      - **TC-CACHE-002:** `ensureCacheLayout` creates the three subtrees; idempotent on
        re-run.
      - **TC-CACHE-003:** with a committed lock + populated cache, snapshot `loadLock`;
        `rm -rf .marksync/`; re-`loadLock`; assert the base is unchanged (the cache held
        no correctness data — C-3 at the layout level).

**Acceptance Criteria**:

- Must: cache dir override + subtrees (F-4).
- Must: deleting `.marksync/` changes no base (AC-F4-1 / NFR-1).
- Must: lock is outside the cache + cache gitignored (NFR-1).
- Must: `bun run check` exits 0; `check:boundaries` clean.

**Files and modules**: `src/app/cache.ts`, `.gitignore` (verify), `tests/app/cache.test.ts`,
`tests/integration/cache/cache-disposable.test.ts`.

**Tests**: TC-CACHE-001..004.

**Completion signal**: `feat(cache): disposable .marksync cache layout + MARKSYNC_CACHE_DIR (GH-19)`

---

### Phase 5: Pure content-property cross-check

**Goal**: Deliver F-5 — `reconcileWithProperty` + `rebuildLockFromConfluence` as pure
domain functions over caller-supplied records (PD-3). No I/O, no network (the property
fetch is E3-S4).

**Tasks**:

- [ ] **5.1** Create `src/domain/state/reconcile.ts` (new):
      - `MetadataProperty` type mirroring system spec §9.3 (`schemaVersion, projectId,
        targetId, documentId, sourcePath, sourceCommit, sourceContentHash,
        renderedBodyHash, toolVersion, synchronizedAt`).
      - `reconcileWithProperty(binding: PageBinding, property: MetadataProperty):
        Result<void, MarkSyncError>` — compare `sourceCommit` (the decisive tamper signal
        for MS-0002); mismatch → `err({ kind: "LockDirty"; path: binding.sourcePath })`;
        match → `ok`.
      - `rebuildLockFromConfluence(input: { property: MetadataProperty; pageVersion:
        number; hashes: { sourceContentHash; renderedBodyHash; remoteBodyHash } }):
        Result<PageBinding, MarkSyncError>` — reconstruct a field-equal `PageBinding`.
      - Imports: `#domain/binding/page-binding`, `#domain/errors`, `#domain/result`. No
        app/cli/infra (domain-pure).
      - ≤ 3-line header citing ADR-0006 Cross-check once.
- [ ] **5.2** Create `tests/domain/state/reconcile.test.ts` (new) — **Unit**; real
      records (no mocks):
      - **TC-RECONCILE-001:** matching property → `ok`.
      - **TC-RECONCILE-002:** `sourceCommit` mismatch → `err(LockDirty)`.
      - **TC-REBUILD-001:** `rebuildLockFromConfluence` → field-equal `PageBinding`.

**Acceptance Criteria**:

- Must: match → `ok`; mismatch → `LockDirty` (AC-F5-1, NFR-6/7).
- Must: rebuild → field-equal binding (AC-F5-2, NFR-8).
- Must: `bun run check` exits 0; `check:boundaries` clean (reconcile.ts imports domain only).

**Files and modules**: `src/domain/state/reconcile.ts`, `tests/domain/state/reconcile.test.ts`.

**Tests**: TC-RECONCILE-001..002, TC-REBUILD-001.

**Completion signal**: `feat(state): content-property cross-check + lock rebuild (GH-19)`

---

### Phase 6: Branch-restriction gate

**Goal**: Deliver F-6 — `assertBranchAllowed` producing `ForbiddenBranch` (first-consumed)
unless the branch ∈ `sync.allowBranches` or overridden by `MARKSYNC_ALLOW_BRANCHES`.

**Tasks**:

- [ ] **6.1** Create `src/app/branch.ts` (new) (or add to `src/app/lock.ts`):
      - `assertBranchAllowed(branch: string, config: ProjectConfig): Result<void,
        MarkSyncError>`:
        - `allowed = new Set([...config.sync.allowBranches, ...overrideFromEnv()])` where
          `overrideFromEnv()` parses `process.env.MARKSYNC_ALLOW_BRANCHES` (comma-
          separated; empty → none).
        - `allowed.has(branch)` → `ok`; else `err({ kind: "ForbiddenBranch"; branch;
          allowed: [...config.sync.allowBranches] })`.
      - Imports: `#domain/config/types` (`ProjectConfig`), `#domain/errors`,
        `#domain/result`. No cli.
      - ≤ 3-line header citing ADR-0006 Branch restriction once.
- [ ] **6.2** Create `tests/app/branch.test.ts` (new) — **Unit**:
      - **TC-BRANCH-001:** `"main"` + `allowBranches:["main"]` → `ok`.
      - **TC-BRANCH-002:** `"feature/x"` (no override) → `err(ForbiddenBranch)`.
      - **TC-BRANCH-003:** `MARKSYNC_ALLOW_BRANCHES="feature/x"` + `"feature/x"` → `ok`
        (restore env after).

**Acceptance Criteria**:

- Must: default allow/deny + override (AC-F6-1, NFR-9/10).
- Must: `bun run check` exits 0; `check:boundaries` clean.

**Files and modules**: `src/app/branch.ts`, `tests/app/branch.test.ts`.

**Tests**: TC-BRANCH-001..003.

**Completion signal**: `feat(state): assertBranchAllowed deployment gate + MARKSYNC_ALLOW_BRANCHES (GH-19)`

---

### Phase 7: `.env.example` + final quality gate

**Goal**: Document the two new env vars and run the full quality gate. No new behavior.

**Tasks**:

- [ ] **7.1** Update `.env.example` — add (commented) `MARKSYNC_CACHE_DIR` and
      `MARKSYNC_ALLOW_BRANCHES` with one-line purposes (canonical env-var list, no values).
- [ ] **7.2** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); fix any issue. Confirm all `AC-*` are green (TC-GATE-001,
      TC-BND-001).

**Acceptance Criteria**:

- Must: `.env.example` lists both vars (no values).
- Must: `bun run check` exits 0 (AC-Q-1).

**Files and modules**: `.env.example`.

**Tests**: TC-GATE-001, TC-BND-001.

**Completion signal**: `docs(env): document MARKSYNC_CACHE_DIR + MARKSYNC_ALLOW_BRANCHES (GH-19)`

---

## Execution Log

> Phases are checked off as `@coder` completes them. The PM records the completion
> signal (commit message) and the `bun run check` result per phase.

| Phase | Status | Commit | `bun run check` |
|-------|--------|--------|------------------|
| 0 — CorruptLock error kind | pending | — | — |
| 1 — Schema + loadLock | pending | — | — |
| 2 — Atomic store | pending | — | — |
| 3 — saveLock + mergeBindings | pending | — | — |
| 4 — Cache layout | pending | — | — |
| 5 — Cross-check | pending | — | — |
| 6 — Branch gate | pending | — | — |
| 7 — .env.example + gate | pending | — | — |

## Revision Log

| Date | Author | Change |
|------|--------|--------|
| 2026-07-09 | PM (ADOS) | Initial plan |
