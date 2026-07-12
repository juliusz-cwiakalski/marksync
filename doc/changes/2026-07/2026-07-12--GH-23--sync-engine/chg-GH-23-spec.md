---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-23
  type: feat
  status: Proposed
  slug: sync-engine
  title: "[MS2-E3-S6] Sync engine — plan → apply → verify orchestration (computePlan dry-run, applyPlan parent-first isolated journaled, journal+replay, git Repository port, cross-page link resolver, provenance wiring)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, application, orchestration, reliability, provenance]
  version_impact: minor
  audience: internal
  security_impact: medium
  risk_level: high
  dependencies:
    internal: [MS2-E3-S1 (GH-18 document identity), MS2-E3-S2 (GH-19 lock/cache/branch gate/reconcile), MS2-E3-S3 (GH-20 markdown pipeline), MS2-E3-S4 (GH-21 TargetSystem port + provenance), MS2-E3-S5 (GH-22 drift classifier)]
    external: [Confluence Cloud REST API (v2/v1), Git CLI]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver the use-case orchestration that ties the safe-publish trust wedge together — a pure `computePlan` that discovers documents, renders them via the `TargetSystem` port, classifies drift, and emits a reviewable plan without any writes, and an `applyPlan` that executes that plan parent-first with per-document isolation, immediate journaling, and squash provenance — so `marksync plan` and `marksync sync` become real commands that publish Markdown from Git to Confluence while honoring every safety invariant (zero silent overwrites INV-SAFE-1, remote-missing block INV-SAFE-2, duplicate-UUID fatal INV-SAFE-3, semantic idempotency NFR-PERF-4, partial-apply recoverability NFR-REL-7) and leaving a crash-safe journal for repair-state.

## 1. SUMMARY

This is the **sixth and final story of epic MS2-E3 (Safe publish core)** — the orchestration capstone that assembles every preceding piece (identity GH-18, state/lock GH-19, markdown pipeline GH-20, Confluence adapter + `TargetSystem` port GH-21, drift classifier GH-22) into the two use cases operators invoke: `marksync plan` (dry-run) and `marksync sync` (apply). It delivers:

1. **Pure `computePlan`** — the no-writes pipeline: branch gate → discover committed docs via a new `Repository` port → duplicate-UUID fatal gate → parse → render+hash each via `TargetSystem.renderBody` → resolve cross-page links → fetch remote state per binding → classify each → emit a reviewable `Plan` carrying `{ runId, operationId, entries[] }`. Fully unit-testable with mocked git/target ports; dry-run returns here.
2. **`applyPlan`** — the only write path: parent-first ordering for creates/moves (Confluence has no cross-page transaction); per-document isolation (one failure does not block others); journal each mutation immediately before lock-update; send squash provenance via `version.message` using the existing `formatVersionMessage`; update lock atomically + put `marksync.metadata` content property after each successful per-doc apply; surface a 409 `Conflict` as drift (do NOT retry — E3-S7 owns retry/dedup).
3. **Journal + replay** — append-only `<run-id>.jsonl` writer; `replayJournal(runId)` for partial-apply recovery (consumed by E4-S4 repair-state).
4. **Cross-page link resolver** — resolve `[x](other.md)` to the target page reference; unresolved links emit a warning (never silently emit a broken URL).
5. **`Repository` / document-source port** — the minimal domain-owned git port the engine needs (`readCommitted` + `headSha`/`branch` + commit-list hook for provenance) with a shell-git adapter (TDR-0003). No prior story delivered this surface; this change defines it minimally and provides the implementation behind the port.
6. **CLI wiring** — `plan`/`sync` commands become thin shells calling `computePlan`/`applyPlan` and returning `CommandResult<Plan>` / `CommandResult<ApplyReport>`.

This story reuses every preceding contract without redefinition: the `TargetSystem` port (`renderBody`/`getPage`/`createPage`/`updatePage`/`movePage`/`getProperty`/`putProperty`), the pure `classify` + `actionFor` + `SyncState`/`Action`/`RemoteState`/`SharedBase`, the `ContentHash`/`buildContentHash` snapshot, `loadLock`/`saveLock`/`mergeBindings`, `assertBranchAllowed`, `detectDuplicateUuids`, `reconcileWithProperty`, the cache layout, `formatVersionMessage` + `MAX_VERSION_MESSAGE_LEN`, and `CommandResult<T>`/`ok`/`err`. It introduces **no new `MarkSyncError` arms** (`UnresolvedLink` already exists for the link resolver).

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-18 through GH-22 are all merged** — every code dependency this story consumes is delivered. GH-18 delivered `DocumentId` (UUID v7 branded VO) + `detectDuplicateUuids` + front-matter `readUuid`/`injectUuid`. GH-19 delivered the committed lock (`marksync.lock.yml`), `loadLock`/`saveLock` (atomic temp + rename), `serializeLock` (line-oriented UUID-ordered YAML), `mergeBindings`, the disposable `.marksync/{cache,journal,conflicts}/` cache layout, the `PageBinding` record, the branch gate (`assertBranchAllowed`), and the pure content-property cross-check (`reconcileWithProperty`/`rebuildLockFromConfluence`). GH-20 delivered `parseMarkdown` → `mdastToHast` → `canonicalize`/`contentHash`. GH-21 delivered the `TargetSystem` port + `ConfluenceTarget` adapter + `formatVersionMessage` provenance formatter + the transport-error arms (`RateLimited`/`RemoteUnreachable`). GH-22 delivered the pure `classify({ local?, base?, remote }) → Result<SyncState, MarkSyncError>`, the six-value `SyncState` enum, the `RemoteState` union, the `SharedBase` view, the `ContentHash` VO + `buildContentHash`, and the `actionFor(state, ctx) → Action` mapping (`NoOp`/`Update`/`Block`/`Skip`).
- **The `plan` and `sync` CLI commands are stubs.** `src/cli/commands/plan.ts` and `src/cli/commands/sync.ts` each return `err("INTERNAL", "... is not yet implemented (MS2-E3)", false)` — placeholders so the CLI framework wires end-to-end (GH-16 D-8/F-8). This story replaces them with thin shells that call the new use cases.
- **The `CommandResult<T>` envelope is delivered.** `src/cli/output/command-result.ts` (GH-16/GH-17) provides `CommandResult<T>`, `ok()`, `err()`, `SCHEMA_VERSION`, exit-code mapping via `codeToExitCode`, `runId` generation, and optional timing/warnings. The engine wraps its output in this contract.
- **The provenance formatter is delivered and conservative.** `src/infra/confluence/provenance.ts` (GH-21) exports `formatVersionMessage(input: ProvenanceInput)` + `MAX_VERSION_MESSAGE_LEN = 255`. The format is `marksync git <head> (<count>): <subj1>; <subj2>; …`, trimmed deterministically (whole trailing subjects dropped + ellipsis). The exact Confluence limit remains TO CONFIRM (ADR-0010); no MS-0002 flow depends on the exact value.
- **The `TargetSystem` port accepts `message?` on create/update.** `CreatePageRequest.message?` and `UpdatePageRequest.message?` are optional fields the adapter renders into the target's history line (GH-21). The engine populates these with `formatVersionMessage` output — no port change is needed.
- **The `MarkSyncError` union already has every arm the engine needs.** `Conflict { pageId; baseVersion; remoteVersion }`, `RemoteMissing { pageId }`, `DuplicateUuid { uuid; paths }`, `Forbidden { pageId; operation }`, `RateLimited`, `RemoteUnreachable`, `ForbiddenBranch`, `UnresolvedLink { sourcePath; target }`, `LockDirty`, `StalePlan`, `TooLarge`, and the config/lock/auth arms — all exist. No new error kinds are introduced.
- **ADR-0006 is the load-bearing state-model decision** — `Accepted`. Its constraints C-1..C-6 establish the durable identity (UUID v7), the committed shared base (the lock), the disposable cache, the safety invariants (INV-SAFE-1/2/3), the decentralized concurrency (409 + operation-ID dedup), and the branch-restriction deployment gate. The engine is the enforcement orchestrator for these invariants at the use-case layer.
- **ADR-0010 is the provenance decision** — `Accepted`. Squash by default: one Confluence version per sync per changed page, carrying the head commit SHA + compact included-commit summary in `version.message`. The engine wires the existing formatter; it does not reimplement provenance.
- **TDR-0003 is the git-adapter decision** — `Accepted`. Shell-git (Bun.spawn + args array) behind a `Repository` interface, with four layered injection controls (args array, `--`, path validation, non-interactive env). No prior story implemented this; this change defines the minimal port and provides the adapter.
- **The architecture-overview push-flow diagram sketches the pipeline.** The §"Data flow / Push flow" diagram records: Load config + Git revision → Discover committed docs via git port → Parse + validate + render to Storage + hash → Build hierarchy + resolve cross-page links → Fetch remote state → Classify → (dry-run? return plan) → (apply: create/update parent-first → upload assets → update bodies + property → journal → atomically update lock). This story realizes that diagram as code.
- **The §"Internal interface contracts" table records the git-port sketch.** `readCommitted(ref, patterns) → Map<path, bytes>` (errors: `RefNotFound`, `BadPath`) and `worktreeStatus(paths) → WorktreeStatus`. This story refines these to the minimal port the engine needs (DEC-4) and provides the implementation.
- **The §"Module governance" table records the link resolver as a domain component** — `Link resolver` (tier: domain) — "Resolve local Markdown cross-document links to target-system page IDs/URLs so Confluence internal links work after sync." It does not yet exist; this story delivers it at `src/domain/hierarchy/`.

### 2.2 Pain Points / Gaps

- **No orchestration exists.** There is no `computePlan`, no `applyPlan`, no `Plan` type, no `ApplyReport` type in the codebase. The trust wedge has all its components (identity, lock, pipeline, adapter, classifier) but nothing wires them into the `marksync plan` + `marksync sync` flow. MS-0002 cannot publish a single page until this lands.
- **The CLI stubs return "not yet implemented".** Both `planCommand()` and `syncCommand()` return `err("INTERNAL", ...)`. An operator running `marksync plan` or `marksync sync` gets exit 99 and no output. This story makes them real.
- **No git adapter / document-source port exists.** No prior story delivered `src/infra/git/` or a `Repository` port. The engine's "discover docs via git port `readCommitted`" deliverable cannot be satisfied without this surface. TDR-0003 defines the decision (shell-git behind `Repository`) but no backlog story implemented it. This change owns the minimal port + adapter.
- **No journal exists.** There is no `<run-id>.jsonl` append-only writer and no `replayJournal`. NFR-REL-7 (partial-apply recoverability) — "an interrupted apply is recoverable via journal replay" — has no mechanism. The `.marksync/journal/` directory is created by `ensureCacheLayout` (GH-19) but nothing writes to it.
- **No link resolver exists.** The architecture-overview lists a "Link resolver" domain component, but no module at `src/domain/hierarchy/` resolves cross-page Markdown links (`[x](other.md)`) to target page references. Without it, Confluence internal links between managed pages would be broken or silently wrong.
- **No parent-first ordering exists.** Confluence requires a parent page to exist before a child can be created under it. Without parent-first execution, a plan that creates a child before its parent would fail with a `RemoteMissing` or `Forbidden` on the parent's pageId. No ordering logic exists.
- **No per-document isolation exists.** Confluence has no cross-page transaction (ADR-0006 fixed constraint). Without per-document isolation, a single `Conflict` on one page would abort the entire run, leaving the remaining documents unsynced and the lock stale. No isolation mechanism exists.
- **The provenance formatter is unwired.** `formatVersionMessage` exists but nothing calls it. NFR-REL-9 (per-version provenance) requires every applied page version's `message` to carry the MarkSync/Git prefix + head commit + compact summary. No code path passes the formatted string to `createPage`/`updatePage`.
- **The idempotency loop has no enforcer.** NFR-PERF-4 (second unchanged push writes 0 pages) requires `computePlan` → every entry `NO_CHANGE` → `applyPlan` skips all `NoOp` entries. The classifier (GH-22) produces `NO_CHANGE` → `NoOp`; nothing consumes the `Action` and skips writes.

## 3. PROBLEM STATEMENT

Because no plan/apply orchestration, journal, link resolver, git adapter, or parent-first execution exists, the safe-publish trust wedge has all its components assembled but no use-case layer that wires them into `marksync plan` and `marksync sync` — so MarkSync cannot discover a document from Git, classify it, emit a reviewable plan, or apply that plan safely — which means every safety invariant (zero silent overwrites INV-SAFE-1, remote-missing block INV-SAFE-2, duplicate-UUID fatal INV-SAFE-3) has an enforcement point inside the classifier (GH-22) but no orchestrator that calls it before writing, the semantic-idempotency target ("second unchanged push writes 0", NFR-PERF-4) has a `NO_CHANGE` producer but no consumer that skips the write, the partial-apply recoverability promise (NFR-REL-7) has a `.marksync/journal/` directory but no writer or replayer, and the per-version provenance requirement (NFR-REL-9) has a formatter but no caller — so this story must deliver the `computePlan`/`applyPlan` use cases, the journal+replay mechanism, the cross-page link resolver, and the minimal `Repository` port + shell-git adapter that the engine reads committed Markdown through, reusing every existing contract without redefinition, before MS-0002 can publish a single page.

## 4. GOALS

- **G-1**: Deliver pure `computePlan` — the no-writes pipeline: branch gate → discover → duplicate-UUID fatal gate → parse → render+hash → link-resolve → fetch remote → classify → emit a reviewable `Plan` (F-1).
- **G-2**: Deliver `applyPlan` — parent-first ordering, per-document isolation, immediate journaling, provenance wiring, Conflict-as-drift (no retry), lock+property atomic update after each successful per-doc apply (F-2).
- **G-3**: Deliver the journal writer + `replayJournal` — append-only `<run-id>.jsonl` with `{ ts, op, pageId, uuid, outcome }` per mutation; crash-safe partial-apply recovery (F-3, NFR-REL-7).
- **G-4**: Deliver the cross-page link resolver — resolve `[x](other.md)` to target page references; unresolved → warning, never a silently-broken URL (F-5).
- **G-5**: Deliver the minimal `Repository` port + shell-git adapter — discover + read committed Markdown + head SHA/branch + commit-list hook for provenance (F-4).
- **G-6**: Deliver semantic idempotency — a second unchanged push classifies every entry `NO_CHANGE` → `applyPlan` performs 0 writes (NFR-PERF-4).
- **G-7**: Deliver provenance wiring — call the existing `formatVersionMessage` and pass as `message` on create/update (NFR-REL-9).
- **G-8**: Wire `plan`/`sync` CLI stubs to `computePlan`/`applyPlan` returning `CommandResult<Plan>` / `CommandResult<ApplyReport>` (F-6).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| zero silent overwrites (NFR-REL-1 / INV-SAFE-1) | a `REMOTE_AHEAD`/`DIVERGED` entry → `applyPlan` performs **0 writes** for that doc; reports the block; **100%** of block entries blocked |
| REMOTE_MISSING invariant (NFR-REL-6 / INV-SAFE-2) | a `REMOTE_MISSING` entry → **0 re-creates** without `--adopt`/`--rebind`; the block is reported |
| duplicate-UUID fatal (NFR-REL-8 / INV-SAFE-3) | a duplicated-UUID corpus → `computePlan` aborts with `DuplicateUuid` before **any** write (0 writes) |
| semantic idempotency (NFR-PERF-4) | a second unchanged push → `applyPlan` write-count = **0** (asserted via mock target) |
| partial-apply recoverability (NFR-REL-7) | crash after K of N docs → journal has **K** entries; `replayJournal` resumes without duplicates |
| per-version provenance (NFR-REL-9) | every applied page version's `message` is produced by `formatVersionMessage` (starts with `marksync git` prefix + head SHA); over-limit lists trim deterministically |
| parent-first ordering | a child-page create before its parent → `applyPlan` reorders parent-first; the child's create succeeds |
| per-document isolation | one `Conflict` on doc A → doc B still applies; the run does not abort |
| lock + property atomicity | after a successful per-doc apply, the lock is atomically saved AND `marksync.metadata` is put; `reconcileWithProperty` agrees |
| no secrets in output (NFR-SEC-1 / INV-SEC-1) | **0** credential/token occurrences in any plan/apply output path (journal, plan JSON, version.message) |
| concurrency safety (NFR-REL-5) | a 409 `Conflict` surfaces as drift — the engine does NOT retry; the older plan does not overwrite the newer (full policy in E3-S7) |
| cross-page links | `[x](other.md)` resolves to the target page reference; an unresolvable link → warning (no broken URL emitted silently) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: The 409 retry / operation-ID dedup / stale-plan-expiry logic — E3-S7. This engine surfaces `Conflict` as drift; E3-S7 decides retry-vs-abort and owns the stale-plan-expiry window and the operation-ID dedup property enforcement.
- **NG-2**: Mermaid / attachment upload orchestration — E4-S1/E4-S2. The engine calls the asset-resolver hooks those stories provide; for GH-23, attachment handling is pass-through/no-op where the port already supports it.
- **NG-3**: Reverse sync — MS-0005+. The engine is one-way (Git → Confluence) only.
- **NG-4**: The exact Confluence `version.message` length-limit spike (MS2-E1-S2 / GH-12) — DE-RISKED: the formatter already ships with conservative `MAX_VERSION_MESSAGE_LEN = 255`; ADR-0010 says no MS-0002 flow depends on the exact value (DEC-2).
- **NG-5**: Reimplementing provenance — `formatVersionMessage` (GH-21) is reused verbatim; the engine wires it, not reimplements it (DEC-3).
- **NG-6**: Reimplementing classification, hashing, locking, or any preceding contract — all are consumed as-is. No new `MarkSyncError` arms.
- **NG-7**: Full `--adopt` semantics (adopting an existing unmanaged page via search + identity matching) — deferred to MS-0003 / `doctor`. The engine blocks `REMOTE_MISSING` by default; a minimal `--rebind` flag may convert the block to a re-create, but deep adoption workflows are out of scope (OQ-1).
- **NG-8**: Commit-by-commit sync granularity — ADR-0010 defers this to a future milestone; MS-0002 is squash-only.
- **NG-9**: Bounded concurrency > 1 — serialize page writes (bounded concurrency = 1) for MS-0002 per ADR-0010 C-3 / story Q1 (DEC-5).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Pure `computePlan` use case | The no-writes pipeline that discovers documents, renders them, classifies drift, and emits a reviewable `Plan`. Pure (with injected ports) ⇒ fully unit-testable with mocked git/target ports. The dry-run path. |
| F-2 | `applyPlan` use case | The only write path. Executes the `Plan` parent-first, isolates failures per-document, journals each mutation, wires provenance, surfaces Conflict as drift, and updates lock+property atomically per-doc. |
| F-3 | Journal writer + `replayJournal` | Append-only `<run-id>.jsonl` per mutation + the replay function for partial-apply recovery (NFR-REL-7). Consumed by E4-S4 repair-state. |
| F-4 | `Repository` port + shell-git adapter | The minimal domain-owned git abstraction the engine reads committed Markdown through. Shell-git (Bun.spawn + args array, TDR-0003) behind the port. No prior story delivered this; this change owns the minimal port + implementation. |
| F-5 | Cross-page link resolver | Resolve `[x](other.md)` to the target page reference so Confluence internal links work after sync. Unresolved → warning, never a silently-broken URL. |
| F-6 | CLI wiring (`plan`/`sync`) | Replace the stubs with thin shells that call `computePlan`/`applyPlan` and return `CommandResult<Plan>` / `CommandResult<ApplyReport>`. |

### 5.1 Capability Details

- **F-1 (`computePlan`).** A use-case function `computePlan(config, lock, git, target): Result<Plan, MarkSyncError>` that runs the full no-writes pipeline: (1) `assertBranchAllowed` (the deployment gate first — no point planning from a non-allowed branch); (2) discover committed Markdown docs via the `Repository` port `readCommitted`; (3) `detectDuplicateUuids` — the INV-SAFE-3 fatal gate over the discovered docs (zero writes on duplicate; the plan is not even emitted); (4) parse each (GH-20 `parseMarkdown` → `mdastToHast`) → render+hash each via `target.renderBody` (the `TargetSystem` port — the body renderer is Confluence-specific, so it lives behind the port) → local `ContentHash` via `buildContentHash`; (5) resolve cross-page links (F-5) → build hierarchy → parent-child graph; (6) fetch remote state per binding via `target.getPage` → translate to `RemoteState` (`present`/`missing`/`forbidden`); (7) classify each bound doc via `classify` → `SyncState` → `actionFor` → `Action`; (8) emit a `Plan: { runId, operationId, entries: [{ uuid, sourcePath, state, action, hashes }] }`. The plan is PURE — no writes, no side effects beyond port reads. The `runId` is a UUID v7 (time-sortable) pinning E3-S7's operation-id ordering; the `operationId` is `op_<runId>`. Dry-run returns here.

- **F-2 (`applyPlan`).** A use-case function `applyPlan(plan, target, lock, opts): Result<ApplyReport, MarkSyncError>` that executes the `Plan`: (1) **Parent-first ordering** — reorder creates/moves so a parent is always created before its children (Confluence requires the parent to exist; drives from the hierarchy graph built in computePlan); (2) **Per-document isolation** — process each entry independently; a failure on one (e.g. `Conflict`) does NOT abort the run; collect per-doc results (`ApplyReport` aggregates successes, skips, and blocks); (3) **Journal each mutation immediately** — append one `{ ts, op, pageId, uuid, outcome }` to `.marksync/journal/<run-id>.jsonl` BEFORE updating the lock (crash safety: a crashed apply leaves a journal that `replayJournal` replays); (4) **Provenance wiring** — on `update`, call `formatVersionMessage` and pass as `message` on the `UpdatePageRequest`; on `create`, pass as `message` on the `CreatePageRequest`; (5) **Conflict-as-drift** — on a 409 `Conflict` from `updatePage`/`createPage`, surface as drift (report the block); do NOT retry — E3-S7 owns retry/dedup/stale-plan-expiry; (6) **Lock + property atomicity** — after each successful per-doc apply, update the binding in memory → `saveLock` (atomic temp + rename) → `target.putProperty(pageId, "marksync.metadata", serialized)` → `reconcileWithProperty` agrees; (7) **Serialize writes** — bounded concurrency = 1 for MS-0002 (DEC-5) per ADR-0010 C-3. The `ApplyReport` carries per-entry outcomes and aggregate write/skip/block counts.

- **F-3 (Journal + replay).** An append-only writer at `src/app/journal.ts` that emits `.marksync/journal/<run-id>.jsonl` — one JSON line per mutation: `{ ts, op, pageId, uuid, outcome }` (e.g. `{ ts: "...", op: "create", pageId: "123", uuid: "...", outcome: "success" }`). The writer appends immediately before lock-update (crash safety). `replayJournal(runId)` reads the JSONL and returns the list of completed operations so a partial-apply recovery (E4-S4 repair-state) can resume without duplicates — a journaled op is not re-applied. The journal is **run-specific**, never CI-cached (ADR-0006 C-3; the `.marksync/journal/` subtrees are created by `ensureCacheLayout`).

- **F-4 (`Repository` port + shell-git adapter).** The minimal domain-owned git port the engine needs. The port surface: `readCommitted(ref, patterns): Result<Map<path, bytes>, MarkSyncError>` (discover + read committed Markdown at HEAD); `headSha(): Result<string, MarkSyncError>` (the head commit SHA — provenance + binding `sourceCommit`); `currentBranch(): Result<string, MarkSyncError>` (branch name — the branch gate + provenance); and a commit-list hook for provenance (the included-commit subjects the formatter needs). The implementation is shell-git (Bun.spawn + args array, TDR-0003) with the four layered injection controls (args array, `--`, repo-relative path validation, non-interactive env `GIT_TERMINAL_PROMPT=0`). The port is **minimal** — do not over-build (no `worktreeStatus`/rename-detection unless the engine needs it for MS-0002; those can be added by E4 stories). The port is the seam E3-S7 and E4 stories extend without rework.

- **F-5 (Cross-page link resolver).** A pure domain function at `src/domain/hierarchy/link-resolver.ts` that resolves a Markdown cross-document link (`[x](other.md)`) to a target page reference (the linked document's pageId or a target-relative URL). The resolver takes the source document's path + the link target path + the set of discovered documents with their bindings (uuid → pageId), and returns the resolved reference. An unresolvable link (target not in the corpus, not yet bound, or path broken) emits a warning and uses the existing `UnresolvedLink { sourcePath; target }` error kind — it NEVER silently emits a broken URL. This drives Confluence internal-link correctness and is a precondition for parent-first ordering (the hierarchy graph).

- **F-6 (CLI wiring).** The `plan` and `sync` command stubs (`src/cli/commands/plan.ts`/`sync.ts`) become thin shells: `planCommand` constructs the ports (config, lock, git, target), calls `computePlan`, and returns `CommandResult<Plan>` via `ok(plan)` / `err(code, message, retryable)`. `syncCommand` calls `computePlan` then `applyPlan` and returns `CommandResult<ApplyReport>`. The commands never call `process.exit` directly (the entrypoint does). They remain presentation-tier: they import the application use cases + the output module only — no domain/infra tier imports (dep-cruiser `presentation-may-not-import-domain|-infra`).

## 6. USER & SYSTEM FLOWS

```
Flow 1 — computePlan (pure, no writes — the `marksync plan` path):
  loadLock(cwd) → LockFile
  git.currentBranch() → assertBranchAllowed(branch, config) → ok | err(ForbiddenBranch)
  git.readCommitted("HEAD", patterns) → Map<path, bytes>   (discover committed docs)
  detectDuplicateUuids(docs) → ok | err(DuplicateUuid)      (INV-SAFE-3 fatal gate)
  for each doc:
    parseMarkdown(bytes) → mdastToHast → target.renderBody(hast) → { body, hash, warnings }
    buildContentHash({ source, hast, attachmentHashes, title, parentPageId }) → ContentHash
  resolveLinks(sourcePath, targetPath, bindings) → PageRef | warning(UnresolvedLink)
  for each binding:
    target.getPage(pageId) → Page | RemoteMissing | Forbidden   (→ RemoteState)
    classify({ local?, base, remote }) → SyncState
    actionFor(state, { base, remote }) → Action (NoOp | Update | Block | Skip)
  emit Plan { runId, operationId, entries[] }
  → dry-run returns here; 0 writes.

Flow 2 — applyPlan (the `marksync sync` path — the only write path):
  reorder entries parent-first (creates/moves)
  for each entry (serialized — bounded concurrency = 1):
    NoOp  → skip (idempotent — 0 writes)
    Skip  → skip + warn (LOCAL_MISSING)
    Block → skip + report (REMOTE_AHEAD/DIVERGED/REMOTE_MISSING — 0 writes for this doc)
    Update → formatVersionMessage(...) → target.updatePage({ pageId, title, body, baseVersion, message })
             on Conflict (409) → report drift, do NOT retry (E3-S7)
             on success → journal { op: "update", ... } → update binding in memory → saveLock → putProperty
    Create → resolve parent pageId → formatVersionMessage(...) → target.createPage({ parentId, title, body, message })
             on success → journal { op: "create", ... } → create binding → saveLock → putProperty
  emit ApplyReport { entries: [{ uuid, outcome }], writes, skips, blocks }

Flow 3 — Journal + replay (crash recovery — NFR-REL-7):
  apply crashes after K of N docs
  → .marksync/journal/<run-id>.jsonl has K entries
  → replayJournal(runId) returns the K completed ops
  → repair-state (E4-S4) resumes: docs in the journal are NOT re-applied (idempotent)
  → remaining (N−K) docs apply without duplicates

Flow 4 — Semantic idempotency (NFR-PERF-4 — second unchanged push writes 0):
  second push: every doc's local.canonicalHash == base.renderedBodyHash == remote.bodyHash
    AND title/parent/attachments all match
  → classify → NO_CHANGE → actionFor → NoOp for every entry
  → applyPlan skips every NoOp → write-count = 0

Flow 5 — Cross-page link resolution:
  doc A has [link](doc-b.md)
  → resolveLink("doc-a.md", "doc-b.md", bindings)
  → doc-b is discovered + bound → resolve to doc-b's pageId → Confluence internal link
  → if doc-b is NOT discovered/bound → warning + UnresolvedLink (never silently broken)

Flow 6 — Per-document isolation:
  doc A: Conflict (409)  → report block, continue
  doc B: LOCAL_AHEAD     → update succeeds
  doc C: NO_CHANGE       → skip (NoOp)
  → ApplyReport: { A: blocked, B: updated, C: noop } — the run did NOT abort on A
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `computePlan(config, lock, git, target): Result<Plan, MarkSyncError>` — the pure no-writes pipeline (F-1).
- `applyPlan(plan, target, lock, opts): Result<ApplyReport, MarkSyncError>` — the parent-first, isolated, journaled write path (F-2).
- The `Plan` type (`{ runId, operationId, entries[] }`) + `PlanEntry` (`{ uuid, sourcePath, state, action, hashes }`) + `ApplyReport` type (F-1, F-2).
- The journal writer + `replayJournal(runId)` at `src/app/journal.ts` (F-3).
- The cross-page link resolver at `src/domain/hierarchy/link-resolver.ts` (F-5).
- The minimal `Repository` port (domain-owned) + shell-git adapter at `src/infra/git/` (F-4, TDR-0003).
- Provenance wiring: call `formatVersionMessage` and pass as `message` on `createPage`/`updatePage` (G-7, NFR-RL-9).
- Semantic idempotency: `NoOp` entries skipped by `applyPlan` → 0 writes on unchanged push (G-6, NFR-PERF-4).
- CLI wiring: `planCommand`/`syncCommand` become thin shells returning `CommandResult<Plan>`/`CommandResult<ApplyReport>` (F-6).
- A minimal `--rebind` flag that converts a `REMOTE_MISSING` Block to a re-create (the default remains block); if deeper semantics are needed, OQ-1 (NG-7).
- Integration tests: `applyPlan` against a `Bun.serve` mock target (create/update/no-op/conflict/forbidden); crash → replay; lock+property update; idempotency (0 writes on 2nd push).
- Unit tests: `computePlan` fixtures (each state → action); parent-first ordering; journal append/replay; link resolution + unresolved warning; provenance formatting + trim.

### 7.2 Out of Scope

- [OUT] The 409 retry / operation-ID dedup / stale-plan-expiry logic — E3-S7 (NG-1). This engine surfaces `Conflict`; E3-S7 decides retry-vs-abort.
- [OUT] Mermaid / attachment upload orchestration — E4-S1/E4-S2 (NG-2). The engine calls asset-resolver hooks those stories provide; for GH-23, attachment handling is pass-through/no-op where the port already supports it.
- [OUT] Reverse sync — MS-0005+ (NG-3).
- [OUT] The exact `version.message` length-limit spike (MS2-E1-S2 / GH-12) — DE-RISKED (NG-4, DEC-2).
- [OUT] Reimplementing provenance — `formatVersionMessage` (GH-21) reused verbatim (NG-5, DEC-3).
- [OUT] Reimplementing classification, hashing, locking, or any preceding contract (NG-6).
- [OUT] Full `--adopt` semantics (adopting an existing unmanaged page via search + identity matching) — MS-0003 / `doctor` (NG-7, OQ-1).
- [OUT] Commit-by-commit sync granularity — ADR-0010 future milestone; MS-0002 is squash-only (NG-8).
- [OUT] Bounded concurrency > 1 — serialize for MS-0002 (NG-9, DEC-5).
- [OUT] **Page move (`movePage` invocation) for MS-0002** — the `movePage` port exists on `TargetSystem` (GH-21) and is reserved for future parent-reparenting, but the engine does NOT invoke it for MS-0002 / GH-23. MS-0002 is flat-under-configured-parent; GH-22's `Action` union has no `Move` and `UpdatePageRequest` has no `parentId`, so no move path is reachable in this story. The journal `op` enum is `create | update` for MS-0002 (DM-4); `move` is reserved.
- [OUT] New `MarkSyncError` arms — every engine outcome maps to an existing arm.

### 7.3 Deferred / Maybe-Later

- **`worktreeStatus` / rename detection on the `Repository` port** — TDR-0003 specifies these, but the MS-0002 engine reads committed snapshots only. E4 stories or `doctor` can add them when needed. The port is designed to accept them without rework.
- **Bounded concurrency > 1** — revisit if perf needs it (story Q1/DEC-5). The serialized write path is the minimal rate-limit-safe default.
- **Richer `--adopt` workflows** — full adoption of existing unmanaged pages (search + identity matching + doctor visibility) is deferred to MS-0003 (OQ-1).
- **E5-S1 BDD wiring** — the engine is what the E5-S1 Gherkin scenarios drive (INV-SAFE-1/2/3, INV-SEC-1). The engine exposes the hooks (test-injectable crash point, mock target); the BDD feature files land in E5-S1.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — the engine issues no HTTP calls directly. All remote access flows through the existing `TargetSystem` port (`getPage`/`createPage`/`updatePage`/`movePage`/`getProperty`/`putProperty`), whose Confluence adapter (GH-21) owns the REST v2/v1 distinctions. The engine translates port results into `RemoteState` and `Action` decisions.

### 8.2 Events / Messages

No event bus in MS-0002. The conceptual signals the UL names — **Plan Computed** (dry-run), **Mutation Applied** (per-doc write), **Drift Detected** (`Conflict`/`RemoteMissing`/`REMOTE_AHEAD`/`DIVERGED`), **Journal Entry** (per-mutation) — are realized as typed values in the `Plan`, `ApplyReport`, and journal JSONL, surfaced through the established `CommandResult` contract. The journal JSONL is the durable per-run audit trail consumed by `replayJournal` (E4-S4).

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `Plan` type (NEW, app/push-flow) | `{ runId: string; operationId: string; entries: PlanEntry[] }`. The dry-run output of `computePlan`. `runId` = UUID v7 (time-sortable); `operationId` = `op_<runId>` (pins E3-S7 ordering). |
| DM-2 | `PlanEntry` type (NEW, app/push-flow) | `{ uuid: DocumentId; sourcePath: string; state: SyncState; action: Action; hashes: ContentHash }`. One per discovered/bound document. Carries the classification result + the local content snapshot. |
| DM-3 | `ApplyReport` type (NEW, app/push-flow) | `{ runId: string; results: [{ uuid: DocumentId; outcome: "created" \| "updated" \| "noop" \| "skipped" \| "blocked"; error?: MarkSyncError }]; writes: number; skips: number; blocks: number }`. The output of `applyPlan`. Aggregate counts enable CI assertion of idempotency (`writes === 0`). |
| DM-4 | Journal entry (NEW, app/journal) | `{ ts: string; op: "create" \| "update"; pageId: string; uuid: string; outcome: "success" \| "failed" }`. One JSON line per mutation in `.marksync/journal/<run-id>.jsonl`. (`move` is reserved for future parent-reparenting — out of scope for MS-0002 / GH-23; the engine performs only create/update; see §7.2.) |
| DM-5 | `Repository` port (NEW, domain) | The minimal git-port interface: `readCommitted(ref, patterns)`, `headSha()`, `currentBranch()`, + commit-list hook for provenance. Domain-owned; infra implements. |
| DM-6 | Shell-git adapter (NEW, infra/git) | The `Repository` port implementation via `Bun.spawn('git', [...args, '--', ...paths])` (TDR-0003). Four layered injection controls. Non-interactive env (`GIT_TERMINAL_PROMPT=0`). |
| DM-7 | Link resolver types (NEW, domain/hierarchy) | `resolveLink(sourcePath, targetPath, bindings): Result<PageRef, MarkSyncError>` + the input bindings map. Uses existing `UnresolvedLink` error kind. |
| DM-8 | Error model — **no change** | Every engine outcome maps to an existing `MarkSyncError` arm: `Conflict` (409), `RemoteMissing` (404), `DuplicateUuid` (fatal gate), `Forbidden` (403), `ForbiddenBranch` (gate), `UnresolvedLink` (links), `RateLimited`/`RemoteUnreachable` (transport), `LockDirty` (reconcile). No new arms. `assertNeverMarkSyncError` untouched. |

### 8.4 External Integrations

- **Confluence Cloud REST API (v2/v1)** — accessed exclusively through the existing `TargetSystem` port (GH-21). The engine calls `getPage` (to build `RemoteState`), `createPage`/`updatePage` (with `message` provenance), `putProperty` (post-apply `marksync.metadata`), and `getProperty` (reconcile). No direct REST calls; no new endpoints.
- **Git CLI** — accessed through the new `Repository` port + shell-git adapter (TDR-0003). Read-only: `git show`/`git ls-tree` for committed snapshots, `git rev-parse` for HEAD SHA, `git branch`/`GITHUB_REF_NAME` for branch, `git log` for commit subjects (provenance). No fetch/push/pull. Non-interactive env. Args array + `--` + path validation (C-4 injection controls).

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story is **additive**: new use-case functions (`computePlan`/`applyPlan`), new types (`Plan`/`ApplyReport`/journal), a new port (`Repository`), a new domain module (link resolver), a new infra module (shell-git adapter), and the CLI stubs gain real implementations. No existing public signature changes. The `TargetSystem` port, `classify`/`actionFor`, `loadLock`/`saveLock`, `assertBranchAllowed`, `detectDuplicateUuids`, `reconcileWithProperty`, `formatVersionMessage`, `CommandResult`/`ok`/`err`, and the `MarkSyncError` union are all **unchanged** (no error-arm additions, so no exhaustiveness-handler sites to update). The architecture-overview §"Internal interface contracts" rows for `readCommitted`/`worktreeStatus` are reconciled to the realized minimal `Repository` port (DEC-4) as a phase-7 doc-sync item — a documentation correction, not a compatibility break.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | zero silent overwrites (NFR-REL-1 / INV-SAFE-1) | a `REMOTE_AHEAD`/`DIVERGED` entry → `applyPlan` performs **0 writes** for that doc; **100%** of block entries blocked |
| NFR-2 | REMOTE_MISSING invariant (NFR-REL-6 / INV-SAFE-2) | a `REMOTE_MISSING` entry → **0 re-creates** without `--adopt`/`--rebind`; the block is reported |
| NFR-3 | duplicate-UUID fatal (NFR-REL-8 / INV-SAFE-3) | a duplicated-UUID corpus → `computePlan` aborts with `DuplicateUuid` before **any** write (**0 writes**) |
| NFR-4 | semantic idempotency (NFR-PERF-4) | a second unchanged push → `applyPlan` write-count = **0** (asserted via mock target) |
| NFR-5 | partial-apply recoverability (NFR-REL-7) | crash after K of N docs → journal has **K** entries; `replayJournal` resumes without duplicates |
| NFR-6 | per-version provenance (NFR-REL-9) | every applied page version's `message` is produced by `formatVersionMessage` (starts with `marksync git` prefix + head SHA); over-limit lists trim deterministically (DEC-3) |
| NFR-7 | concurrency safety (NFR-REL-5) | a 409 `Conflict` surfaces as drift; the engine does NOT retry; the older plan does not overwrite the newer (full policy E3-S7) |
| NFR-8 | no secrets in output (NFR-SEC-1 / INV-SEC-1) | **0** credential/token occurrences in any plan/apply output path (journal JSONL, plan JSON, version.message, apply report) |
| NFR-9 | parent-first ordering | a child-page create before its parent → `applyPlan` reorders parent-first; the child's create succeeds |
| NFR-10 | per-document isolation | one `Conflict` on doc A → doc B still applies; the run does not abort |
| NFR-11 | lock + property atomicity | after a successful per-doc apply, the lock is atomically saved AND `marksync.metadata` is put; `reconcileWithProperty` agrees |
| NFR-12 | cross-page link resolution | `[x](other.md)` resolves to the target page reference; an unresolvable link → warning (no broken URL emitted silently) |
| NFR-13 | bounded writes (ADR-0010 C-3) | serialize page writes (bounded concurrency = **1** for MS-0002); no blind fast write loops |
| NFR-14 | branch restriction (NFR-COMP-5) | `assertBranchAllowed` gates `computePlan` before any discovery; non-allowed branch → `ForbiddenBranch` |
| NFR-15 | plan/diff before write (NFR-OBS-5) | dry-run is first-class: `computePlan` emits a reviewable `Plan` with **0 writes**; `applyPlan` is a separate explicit step |
| NFR-16 | adapter isolation (NFR-MAINT-1) | all Confluence REST v2/v1 distinctions isolated behind the `TargetSystem` port; the engine never sees REST details |
| NFR-17 | shell-injection safety (TDR-0003 C-4) | the shell-git adapter uses args array + `--` + repo-relative path validation + non-interactive env; malicious path/ref fuzz fixture is rejected with **0** shell-execution surfaces |
| NFR-18 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 / NFR-PRIV-1 — no outbound data to any remote except the configured Confluence target). Observability is structural:

- **`CommandResult<Plan>` / `CommandResult<ApplyReport>`** — the structured JSON envelope every command returns (GH-16/ADR-0011). Carries `runId`, `exitCode`, optional `timing`, `data` (the plan/report), `error` (`code`/`message`/`retryable`), and `warnings`. CI and agents consume this. The `ApplyReport.writes` count is the idempotency assertion point.
- **Stable exit codes (NFR-OBS-1)** — the engine maps `Action` outcomes to `CommandResult` exit codes via the established `codeToExitCode` mapping. `Block(Conflict)` → drift exit; `Block(RemoteMissing)` → remote-missing exit; `DuplicateUuid` → fatal exit; success → 0.
- **Journal as audit trail** — `.marksync/journal/<run-id>.jsonl` is the per-run, per-mutation audit trail. It records every write attempt (`op`/`pageId`/`uuid`/`outcome`) and is the basis of partial-apply recovery (NFR-REL-7) and the INV-SAFE-1/INV-SAFE-2 evidence chain.
- **`version.message` as Confluence-side provenance** — every MarkSync-applied page version carries the `marksync git` prefix + head SHA + compact summary (NFR-REL-9), machine-distinguishable from direct Confluence edits (ADR-0010 C-1).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining: the engine overwrites a `REMOTE_AHEAD`/`DIVERGED` page despite the classifier's Block (INV-SAFE-1 / NFR-REL-1) | H | L | The engine consumes `actionFor` verbatim — a `Block` action is never sent to `createPage`/`updatePage`; AC-F1-1 asserts 0 writes for block entries. The write-time 409 (E3-S7) is defense-in-depth. | L |
| RSK-2 | A `REMOTE_MISSING` page is silently re-created (INV-SAFE-2 / NFR-REL-6) | H | L | The engine honors `Block(RemoteMissing)` — `REMOTE_MISSING` → no `createPage` without `--rebind`; AC-F1-2 asserts it. The classifier (GH-22) already blocks by default. | L |
| RSK-3 | A partial-apply crash leaves the lock inconsistent with Confluence (NFR-REL-7) | H | M | Journal each mutation immediately BEFORE lock-update; `replayJournal` returns completed ops so recovery skips them; AC-F4-1 asserts crash→K entries→resume. The `.marksync/journal/` layout is pre-created (GH-19). | M |
| RSK-4 | No cross-page transaction — a multi-page apply is not atomic (ADR-0006 / story R1) | H | M (fixed constraint) | Global plan validation (computePlan validates before any write) + parent-first execution (parent before child) + per-document isolation (one failure doesn't block others) + per-doc journaling. No atomic multi-page guarantee is claimed (DEC-1). | M |
| RSK-5 | The git-port / shell-git adapter has an injection surface (TDR-0003 C-4) | H | L | Args array (never shell string interpolation) + `--` before paths + repo-relative path validation + non-interactive env (`GIT_TERMINAL_PROMPT=0`); malicious-path fuzz fixture as AC (NFR-17). | L |
| RSK-6 | A credential/token leaks into plan/apply output (INV-SEC-1 / NFR-SEC-1) | H | L | The engine never sees credentials (isolated in GH-17/GH-21); the `CommandResult` redaction layer (ADR-0011) strips secret material; the journal records only `{ ts, op, pageId, uuid, outcome }` — no bodies, no tokens; `version.message` carries only commit metadata (DEC-3). AC-F10-1 asserts 0 token occurrences. | L |
| RSK-7 | Parent-first ordering is wrong — a child is created before its parent and fails | M | M | The hierarchy graph built in computePlan drives the ordering; a topological sort ensures parents precede children; AC-F6-1 asserts the reorder with a child-before-parent fixture. | L |
| RSK-8 | Cross-page links are silently broken (no Confluence internal link) | M | M | The link resolver emits a warning + `UnresolvedLink` for unresolvable targets — never silently emits a broken URL; AC-F7-1 asserts it. Resolved links use the target's pageId. | L |
| RSK-9 | Provenance is wrong or reimplemented (NFR-REL-9) | M | L | The engine calls the EXISTING `formatVersionMessage` (GH-21) — no reimplementation (DEC-3); AC-F5-1 asserts the `marksync git` prefix + head SHA + deterministic trim. | L |
| RSK-10 | The git-port is over-built — too much surface area for MS-0002 (design risk) | M | L | The port is minimal: `readCommitted` + `headSha` + `currentBranch` + commit-list hook only; `worktreeStatus`/rename-detection deferred (DEC-4); E3-S7/E4 stories extend without rework. | L |
| RSK-11 | Bounded concurrency = 1 is too slow for large corpora (NFR-PERF-3 ≤500 pages) | L | L | MS-0002 targets ≤500 pages; serialized writes are rate-limit-safe (ADR-0010 C-3); revisit if perf needs it (DEC-5, story Q1). | L |

## 12. ASSUMPTIONS

- ADR-0006 (state model) is settled (`Accepted`) and being **implemented**. Its INV-SAFE-1/2/3 invariants, the committed lock as shared base, the disposable cache, and the decentralized 409 concurrency are the engine's enforcement obligations. Confluence has no cross-page transaction — this is a fixed constraint (story R1), not an assumption.
- ADR-0010 (provenance) is settled (`Accepted`). Squash by default for MS-0002; one Confluence version per changed page per sync. The `formatVersionMessage` formatter (GH-21) is the single provenance authority; no MS-0002 flow depends on the exact `version.message` length limit (the formatter trims conservatively to 255).
- TDR-0003 (git adapter) is settled (`Accepted`). Shell-git behind the `Repository` interface with four layered injection controls. No prior story implemented it; this change owns the minimal port + adapter.
- GH-18 through GH-22 are merged and their contracts are stable. The engine consumes them as-is: `classify`/`actionFor` (GH-22), `TargetSystem` port (GH-21), `parseMarkdown`/`mdastToHast`/`canonicalize`/`contentHash` (GH-20), `loadLock`/`saveLock`/`assertBranchAllowed`/`reconcileWithProperty` (GH-19), `detectDuplicateUuids`/`DocumentId` (GH-18), `formatVersionMessage` (GH-21), `CommandResult`/`ok`/`err` (GH-16).
- The engine is invoked **only for the one-way push flow** (Git → Confluence). Reverse sync is MS-0005+ (NG-3).
- The engine serializes page writes (bounded concurrency = 1) for MS-0002 per ADR-0010 C-3 / story Q1 (DEC-5).
- The `MarkSyncError` union already provides every arm the engine needs; no error-model change is required (DM-8).
- Downstream consumers E3-S7 (concurrency/dedup) and E4-S4 (repair-state replay) are blocked on this story and will adopt `computePlan`/`applyPlan`/`Plan`/`ApplyReport`/journal as specified here.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S1 (GH-18 document identity) | `DocumentId` (UUID v7), `detectDuplicateUuids` (INV-SAFE-3 fatal gate), `readUuid`. Merged. |
| Depends on | MS2-E3-S2 (GH-19 lock/cache/branch gate/reconcile) | `loadLock`/`saveLock` (atomic), `serializeLock`, `mergeBindings`, `PageBinding`, `assertBranchAllowed`, `.marksync/{cache,journal,conflicts}/` layout, `reconcileWithProperty`/`rebuildLockFromConfluence`. Merged. |
| Depends on | MS2-E3-S3 (GH-20 markdown pipeline) | `parseMarkdown`, `mdastToHast`, `canonicalize`, `contentHash`. Merged. |
| Depends on | MS2-E3-S4 (GH-21 TargetSystem port + provenance) | `TargetSystem` interface (`renderBody`/`getPage`/`createPage`/`updatePage`/`movePage`/`getProperty`/`putProperty`), `ConfluenceTarget` adapter, `formatVersionMessage` + `MAX_VERSION_MESSAGE_LEN`, transport errors (`RateLimited`/`RemoteUnreachable`). Merged. |
| Depends on | MS2-E3-S5 (GH-22 drift classifier) | `classify`, `actionFor`, `SyncState`, `RemoteState`, `SharedBase`, `ContentHash`/`buildContentHash`, `Action`. Merged. |
| Depends on | ADR-0006 | Load-bearing: INV-SAFE-1/2/3, the committed shared base, the disposable cache, decentralized 409 concurrency, branch restriction, no cross-page transaction (fixed constraint). |
| Depends on | ADR-0010 | Squash provenance via `version.message`; bounded writes (C-3). |
| Depends on | TDR-0003 | Shell-git behind `Repository` interface; four injection controls. |
| Reuses | `CommandResult<T>` / `ok` / `err` (GH-16/GH-17) | The structured output envelope. Unchanged. |
| Reuses | `MarkSyncError` union (GH-14..GH-21) | `Conflict`/`RemoteMissing`/`DuplicateUuid`/`Forbidden`/`UnresolvedLink`/`RateLimited`/`RemoteUnreachable`/`ForbiddenBranch`/`LockDirty`. No new arms. |
| Blocks | MS2-E3-S7 (concurrency/dedup) | Consumes `computePlan`/`applyPlan`/`Plan`/`ApplyReport`; adds 409 retry + operation-ID dedup + stale-plan expiry on top. |
| Blocks | MS2-E4-S4 (repair-state) | Consumes `replayJournal` for partial-apply recovery. |
| Blocks | E5-S1 (BDD + E2E) | Drives the engine via Gherkin scenarios (INV-SAFE-1/2/3, INV-SEC-1) and real-sandbox plan+apply+verify. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should full `--adopt` semantics (adopting an existing unmanaged page via CQL search + identity matching) be in scope for GH-23, or deferred to MS-0003? | The story AC tests "no re-create without `--adopt`/`--rebind`" (the default-block). A minimal `--rebind` (re-create the page under parent + update binding) is straightforward. Full `--adopt` (search for an existing unmanaged page, verify identity, bind it) needs `doctor` visibility + `searchPages` wiring and may be too much for this story. | **RESOLVED (PM clarify_scope 2026-07-12):** Default-block is in scope (the engine honors `Block(RemoteMissing)`). A minimal `--rebind` flag converting the block to a re-create is in scope. Full `--adopt` workflows (search + identity matching) are deferred to MS-0003 / `doctor` (NG-7). |
| OQ-2 | Should the `Repository` port include `worktreeStatus`/rename-detection for MS-0002, or is `readCommitted` + `headSha`/`branch` + commit-list sufficient? | TDR-0003 specifies `worktreeStatus`/rename-detection, but the MS-0002 engine reads committed snapshots only (no worktree-diff-based planning). | **RESOLVED (PM clarify_scope 2026-07-12, DEC-4):** Minimal port for MS-0002: `readCommitted` + `headSha` + `currentBranch` + commit-list hook. `worktreeStatus`/rename-detection deferred to E4/`doctor` stories — the port accepts them without rework. |

> No question requires `@decision-advisor` escalation: ADR-0006, ADR-0010, and TDR-0003 are settled; every consumed contract is delivered and verified; OQ-1/OQ-2 were resolved during clarify_scope (PM decisions). The architecture-overview `readCommitted`/`worktreeStatus` reconciliation (DEC-4) is a phase-7 doc-sync item, not a decision gap.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **No atomic multi-page guarantee is claimed. The engine validates globally, executes parent-first, isolates per-document, and journals per-mutation — but a multi-page apply is not transactional.** | Confluence has no cross-page transaction (ADR-0006 fixed constraint; story R1). The mitigation is defense-in-depth: `computePlan` validates the entire corpus before any write; `applyPlan` reorders parent-first (parent before child); per-document isolation means one failure does not block others; per-mutation journaling enables partial-apply recovery. The `ApplyReport` surfaces per-doc outcomes so the operator sees exactly what applied and what was blocked. | 2026-07-12 |
| DEC-2 | **The `version.message` length-limit spike (MS2-E1-S2 / GH-12) is DE-RISKED for GH-23. The engine wires the existing `formatVersionMessage` (GH-21) which trims conservatively to `MAX_VERSION_MESSAGE_LEN = 255`.** | ADR-0010 §"Unresolved Questions" states verbatim: "No MS-0002 flow depends on the exact value." The formatter already ships with a conservative default + deterministic trim (whole trailing subjects dropped + ellipsis). The exact limit is an E5-S1 live-smoke concern, not a GH-23 dependency. (PM notes decision #2.) | 2026-07-12 |
| DEC-3 | **The engine calls the EXISTING `formatVersionMessage` (GH-21) and passes the result as `message` on `createPage`/`updatePage`. Provenance is NOT reimplemented. The shipped formatter format (`marksync git <head> (<count>): <subjects>`) is the current truth; the story AC text (`marksync:squash commit=<sha>`) predates implementation.** | The provenance formatter was delivered in GH-21 with `formatVersionMessage(input: ProvenanceInput) → string` + `MAX_VERSION_MESSAGE_LEN`. The story's prose prefix (`marksync:squash`) was written before the formatter shipped; the delivered format (`marksync git …`) is authoritative. Reimplementing would duplicate logic and risk divergence. The `TargetSystem` port already accepts `message?` on `CreatePageRequest`/`UpdatePageRequest` (GH-21) — no port change needed. (PM notes decision #3.) | 2026-07-12 |
| DEC-4 | **The `Repository` port is minimal for MS-0002: `readCommitted(ref, patterns)` + `headSha()` + `currentBranch()` + a commit-list hook for provenance. `worktreeStatus`/rename-detection are deferred.** | No prior story delivered `src/infra/git/` or a `Repository` port (TDR-0003 defines the decision but no backlog story implements it). The engine's "discover docs via git port readCommitted" deliverable requires this surface. Keeping it minimal (the operations the engine actually calls) avoids over-building and lets E3-S7/E4 stories extend without rework. The port is domain-owned; the shell-git adapter is infra. (PM notes decision #1; OQ-2.) | 2026-07-12 |
| DEC-5 | **Serialize page writes (bounded concurrency = 1) for MS-0002.** | ADR-0010 C-3 requires minimal writes + rate-limit/burst-limit safety. At MarkSync's target scale (≤500 pages, ≤10 concurrent runners), serialized writes are the simplest rate-limit-safe default. Concurrency > 1 can be revisited if perf needs it (story Q1). | 2026-07-12 |
| DEC-6 | **The engine surfaces a 409 `Conflict` as drift and does NOT retry.** | The engine's job is to surface the conflict, not resolve it. Retry/dedup/stale-plan-expiry is E3-S7's policy. Retrying blindly inside the engine would risk overwriting a newer plan's result (violating NFR-REL-5). The engine reports the block in the `ApplyReport` and lets the operator (or E3-S7's retry policy) decide. | 2026-07-12 |
| DEC-7 | **`runId` = UUID v7 (time-sortable); `operationId` = `op_<runId>`.** | UUID v7's time-sortable prefix pins E3-S7's operation-id ordering and aligns with the document-identity choice (ADR-0006 C-1). The `operationId` is stored in `marksync.metadata.operationId` and the lock, so a replayed plan with a stale operation ID is rejected (E3-S7). | 2026-07-12 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `computePlan` use case (`src/app/push-flow.ts`) | **New** — pure no-writes pipeline returning `Result<Plan, MarkSyncError>` |
| `applyPlan` use case (`src/app/push-flow.ts`) | **New** — parent-first, isolated, journaled write path returning `Result<ApplyReport, MarkSyncError>` |
| `Plan` / `PlanEntry` / `ApplyReport` types (`src/app/push-flow.ts`) | **New** — the plan/report data model |
| Journal writer + `replayJournal` (`src/app/journal.ts`) | **New** — append-only `<run-id>.jsonl` + replay |
| Cross-page link resolver (`src/domain/hierarchy/link-resolver.ts`) | **New** — pure domain function resolving Markdown links to page references |
| `Repository` port (`src/domain/` or `src/app/`) | **New** — minimal git abstraction (domain-owned) |
| Shell-git adapter (`src/infra/git/`) | **New** — `Repository` implementation via `Bun.spawn` (TDR-0003) |
| `planCommand` (`src/cli/commands/plan.ts`) | **Updated** — stub → thin shell calling `computePlan` |
| `syncCommand` (`src/cli/commands/sync.ts`) | **Updated** — stub → thin shell calling `computePlan` + `applyPlan` |
| `TargetSystem` port (`src/domain/target/port.ts`, GH-21) | **Unchanged** — reused (`renderBody`/`getPage`/`createPage`/`updatePage`/`movePage`/`getProperty`/`putProperty`) |
| `classify` / `actionFor` / `SyncState` / `Action` (`src/domain/state/`, GH-22) | **Unchanged** — reused |
| `ContentHash` / `buildContentHash` (`src/domain/state/hashes.ts`, GH-22) | **Unchanged** — reused |
| `loadLock` / `saveLock` / `mergeBindings` (`src/app/lock.ts`, GH-19) | **Unchanged** — reused |
| `assertBranchAllowed` (`src/app/branch.ts`, GH-19) | **Unchanged** — reused (the deployment gate) |
| `detectDuplicateUuids` (`src/domain/identity/duplicate-detector.ts`, GH-18) | **Unchanged** — reused (the INV-SAFE-3 fatal gate) |
| `reconcileWithProperty` (`src/domain/state/reconcile.ts`, GH-19) | **Unchanged** — reused (post-apply cross-check) |
| `formatVersionMessage` / `MAX_VERSION_MESSAGE_LEN` (`src/infra/confluence/provenance.ts`, GH-21) | **Unchanged** — reused (provenance wiring) |
| `CommandResult` / `ok` / `err` (`src/cli/output/command-result.ts`, GH-16) | **Unchanged** — reused (structured output) |
| `MarkSyncError` union (`src/domain/errors.ts`) | **Unchanged** — no new arms |
| Cache layout (`src/app/cache.ts`, GH-19) | **Unchanged** — `.marksync/journal/` pre-created; the journal writer fills it |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria, which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** a `Plan` entry classified `REMOTE_AHEAD` or `DIVERGED` (action `Block(Conflict)`), **when** `applyPlan` runs against a mock target, **then** it performs **0 writes** for that doc and reports the block in the `ApplyReport` (INV-SAFE-1 / NFR-REL-1). | F-2, NFR-1 | AC (INV-SAFE-1) |
| AC-F1-2 | **Given** a `Plan` entry classified `REMOTE_MISSING` (action `Block(RemoteMissing)`), **when** `applyPlan` runs without `--adopt`/`--rebind`, **then** it performs **0 re-creates** for that doc and reports the block (INV-SAFE-2 / NFR-REL-6). | F-2, NFR-2 | AC (INV-SAFE-2) |
| AC-F2-1 | **Given** a corpus with two source documents sharing the same UUID, **when** `computePlan` runs, **then** it returns `err(DuplicateUuid)` before **any** write (0 writes) (INV-SAFE-3 / NFR-REL-8). | F-1, NFR-3 | AC (INV-SAFE-3) |
| AC-F3-1 | **Given** two overlapping plans where the remote advanced between plan-time and apply-time, **when** `applyPlan` sends a stale `baseVersion` and the target returns 409 `Conflict`, **then** the engine surfaces the conflict as drift in the `ApplyReport` and does NOT retry (NFR-REL-5; full policy in E3-S7). | F-2, NFR-7 | AC (NFR-REL-5) |
| AC-F3-2 | **Given** a second unchanged push (every doc's local `canonicalHash` + title + parent + attachments match base and remote), **when** `computePlan` runs, **then** every entry classifies `NO_CHANGE` → `NoOp`, and **when** `applyPlan` runs, **then** the write-count is **0** (NFR-PERF-4). | F-1, F-2, NFR-4 | AC (NFR-PERF-4) |
| AC-F4-1 | **Given** an `applyPlan` that crashes (via a test hook) after K of N docs, **when** the crash occurs, **then** the journal `.marksync/journal/<run-id>.jsonl` has exactly **K** entries, and **when** `replayJournal(runId)` runs, **then** it returns the K completed ops so recovery resumes without duplicates (NFR-REL-7). | F-3, NFR-5 | AC (NFR-REL-7) |
| AC-F5-1 | **Given** a `Plan` with a head commit SHA and included-commit subjects, **when** `applyPlan` applies an update/create, **then** the `version.message` passed to the target is produced by `formatVersionMessage` (starts with `marksync git` prefix + head SHA), and an over-limit commit list trims deterministically (whole trailing subjects dropped + ellipsis) (NFR-REL-9, DEC-3). | F-2, NFR-6 | AC (NFR-REL-9) |
| AC-F6-1 | **Given** a `Plan` where a child-page create precedes its parent in entry order, **when** `applyPlan` runs, **then** it reorders parent-first (the parent is created before the child), and the child's create succeeds (NFR-9). | F-2, NFR-9 | AC (Parent-first) |
| AC-F7-1 | **Given** a source document with a cross-page link `[x](other.md)` where `other.md` is discovered and bound, **when** the link resolver runs, **then** it resolves to the target page reference; and **given** an unresolvable link (target not in the corpus), **then** it emits a warning and `UnresolvedLink` — no broken URL is emitted silently (NFR-12). | F-5, NFR-12 | AC (Cross-page links) |
| AC-F8-1 | **Given** a `Plan` where doc A returns 409 `Conflict` and doc B is `LOCAL_AHEAD`, **when** `applyPlan` runs, **then** doc A is reported as blocked and doc B is still applied — the run does not abort on A (NFR-10). | F-2, NFR-10 | AC (Per-document isolation) |
| AC-F9-1 | **Given** a successful per-doc apply (create or update), **when** the apply completes, **then** the lock is atomically saved (`saveLock`) AND the `marksync.metadata` property is put (`putProperty`), and `reconcileWithProperty` agrees on the updated binding (NFR-11). | F-2, NFR-11 | AC (Lock + property atomicity) |
| AC-F10-1 | **Given** a full plan+apply run, **when** every output path (journal JSONL, plan JSON, `ApplyReport` JSON, `version.message`) is inspected, **then** **0** credential/token occurrences are found (INV-SEC-1 / NFR-SEC-1). | F-1, F-2, NFR-8 | AC (INV-SEC-1) |
| AC-F11-1 | **Given** a non-allowed branch, **when** `computePlan` runs, **then** it returns `err(ForbiddenBranch)` before any discovery (NFR-14). | F-1, NFR-14 | AC (branch gate — implicit in story deliverable 1) |
| AC-F12-1 | **Given** the shell-git adapter, **when** a malicious path/ref fuzz fixture (`../`, `;`, backticks, `$()`) is supplied, **then** it is rejected with **0** shell-execution surfaces (TDR-0003 C-4 / NFR-17). | F-4, NFR-17 | AC (shell-injection safety — TDR-0003 verification criterion) |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + format:check + typecheck + test + check:boundaries) runs, **then** it exits **0** — including the typecheck proving no error-model change and the boundary check proving `src/domain/hierarchy/` imports no infrastructure. | F-5, NFR-18 | AC (`bun run check` green) |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`** on branch `feat/GH-23/sync-engine`. Depends on GH-18, GH-19, GH-20, GH-21, GH-22 — all merged. This is the MS2-E3 capstone: the epic is complete when this lands.
- **Merge strategy:** Conventional Commits (TDR-0008); a `feat(app)` scope is appropriate. Suggested landing order: (1) the `Repository` port + shell-git adapter (the foundational read surface); (2) the cross-page link resolver (pure domain, no deps on the engine); (3) the journal writer + `replayJournal` (independent of the use cases); (4) `computePlan` (consumes port + classifier + link resolver); (5) `applyPlan` (consumes computePlan output + journal + provenance); (6) CLI wiring (`plan`/`sync` stubs → thin shells); (7) integration tests (mock target: create/update/no-op/conflict/forbidden; crash→replay; idempotency). Each step is independently testable.
- **After merge:** E3-S7 adds 409 retry + operation-ID dedup + stale-plan-expiry on top of `applyPlan`; E4-S4 wires `replayJournal` into `repair-state`; E4-S1/E4-S2 wire asset/attachment hooks; E5-S1 wires BDD Gherkin scenarios + live-sandbox E2E.
- **Phase 7 doc-sync (`@doc-syncer`) — flagged, NOT done here:**
  - **`feature-safe-publish.md` §4.2 "Sync engine" row** is currently a stub ("Orchestrates plan → apply per document; journal/replay") — update it to reference the delivered use cases (`computePlan`/`applyPlan`/journal/link-resolver/`Repository` port) and tag *(delivered — GH-23)*.
  - **`architecture-overview.md` §"Internal interface contracts"** — reconcile `readCommitted(ref, patterns)` / `worktreeStatus(paths)` to the realized minimal `Repository` port (DEC-4); add `computePlan`/`applyPlan`/`resolveLink` rows.
  - **`architecture-overview.md` §"Data flow / Push flow"** — tag the diagram as *(realized — GH-23)*.
  - **`ubiquitous-language.md`** — bind `Plan Computed` / `Mutation Applied` / `Journal Entry` terms to the delivered code constructs; `related_changes` += GH-23.
  - **`doc/spec/features/feature-safe-publish.md` `links.related_changes`** += GH-23.
  - **`ADR-0006` Lessons Learned** — append the engine-delivery retrospective (the use-case orchestrator that enforces INV-SAFE-1/2/3 at the write boundary).

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. The engine reads the existing lock file (GH-19) and discovers committed Markdown (the `Repository` port). No lock, cache, or property migration is performed by this story. The journal is created fresh per run (`<run-id>.jsonl`) and is disposable (gitignored, never needed for correctness beyond the run it records).

## 20. PRIVACY / COMPLIANCE REVIEW

- **No secrets in output (INV-SEC-1 / NFR-SEC-1):** the engine never sees credentials or tokens (isolated in GH-17/GH-21). The `CommandResult` redaction layer (ADR-0011) strips secret material. The journal records only `{ ts, op, pageId, uuid, outcome }` — no document bodies, no tokens, no auth headers. The `version.message` carries only commit metadata (SHA + subjects trimmed to 255). AC-F10-1 asserts 0 token occurrences across all output paths.
- **No outbound telemetry (NFR-SEC-3 / NFR-PRIV-1):** the engine sends data only to the configured Confluence target via the `TargetSystem` port. No analytics, no third-party endpoints.
- **Commit-subject privacy (ADR-0010):** the `version.message` publishes a compact summary (head SHA + first N subjects), not full commit messages — reducing the risk of leaking sensitive metadata (internal ticket URLs, customer names) into a broader Confluence audience. The full commit list is available only in local plan/apply output, never in Confluence.
- **Git read-only (TDR-0003 C-1):** the shell-git adapter performs no network git operations (no fetch/push/pull/clone) — read-only committed snapshots only.

## 21. SECURITY REVIEW HIGHLIGHTS

- **Shell-injection surface (TDR-0003 C-4):** the shell-git adapter is the one new shell-out surface. Four layered controls close it: (1) args array via `Bun.spawn` (never shell string interpolation); (2) `--` before every path argument; (3) repo-relative path validation (reject `../`, absolute paths, NUL bytes); (4) non-interactive env (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, no credential helpers). AC-F12-1 asserts a malicious-path fuzz fixture is rejected.
- **Branch restriction (ADR-0006 deployment gate):** `assertBranchAllowed` gates `computePlan` before any discovery — a sync from a non-allowed branch exits with `ForbiddenBranch` and 0 reads. AC-F11-1 asserts it.
- **Safety invariants are the security-relevant properties.** INV-SAFE-1 (zero silent overwrites), INV-SAFE-2 (remotely-deleted page never silently re-created), and INV-SAFE-3 (duplicate-UUID fatal) are enforced at the engine's write boundary: the engine consumes `actionFor` verbatim — a `Block` action is never sent to `createPage`/`updatePage`. The write-time 409 (E3-S7) is defense-in-depth.
- **`forbidden` is never treated as "missing"** (mirrors GH-21 DEC-4 / GH-22 Q1): a 403 surfaces as `err(Forbidden)` and the engine warns+skips, never deletes/recreates.
- **No credential in any output path:** the `CommandResult` redaction layer (ADR-0011), the journal's minimal field set, and the `version.message`'s commit-only content collectively ensure INV-SEC-1.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **The `Repository` port is the highest-leverage extensibility seam.** E3-S7 extends it (if needed for commit-graph traversal); E4 stories add `worktreeStatus`/rename-detection; `doctor` adds the `git on $PATH` check. Keeping the port minimal (DEC-4) means these extensions are additive, not rewrites.
- **The `Plan` / `ApplyReport` types are the contract every downstream consumer (E3-S7, E4-S4, E5-S1 BDD, CI agents) switches over.** Their shape is stable: `Plan` carries per-entry `{ uuid, state, action, hashes }`; `ApplyReport` carries per-entry `{ uuid, outcome }` + aggregate counts. Adding an outcome (e.g. `moved`) is an additive change.
- **The journal format is a stable append-only JSONL schema** (`{ ts, op, pageId, uuid, outcome }`). `replayJournal` is the single reader; E4-S4 repair-state consumes it. Adding a field is additive (the replay logic ignores unknown fields).
- **The link resolver is pure domain logic** — its behavior is fully specified by its inputs (source path, target path, bindings map) and covered by fixtures. Adding a new link form (e.g. Wiki notation) is a localized change.
- **The engine serializes writes (bounded concurrency = 1)** — this is the rate-limit-safe default for MS-0002. Revisit for MS-0003 if perf requires concurrency > 1 (DEC-5). The serialized path is the simplest correct ordering; a bounded-concurrency path would need careful parent-first + journal-ordering semantics.
- **The provenance authority is single:** `formatVersionMessage` (GH-21). If the format or limit ever changes, the engine tracks that change automatically — it wires the formatter, not reimplements it (DEC-3).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `computePlan` | The pure no-writes use case: discovers docs, renders+hashes, resolves links, fetches remote, classifies, emits a reviewable `Plan`. The `marksync plan` path. |
| `applyPlan` | The write use case: executes a `Plan` parent-first, per-document isolation, journaled, provenance-wired, Conflict-as-drift. The `marksync sync` path. |
| `Plan` | The dry-run output of `computePlan`: `{ runId, operationId, entries: PlanEntry[] }`. Reviewable; no writes. |
| `ApplyReport` | The output of `applyPlan`: per-entry outcomes + aggregate `writes`/`skips`/`blocks` counts. |
| `runId` | A UUID v7 (time-sortable) identifying one plan+apply run. Pins E3-S7's operation-id ordering. |
| `operationId` | `op_<runId>` — stored in `marksync.metadata.operationId` and the lock; a replayed plan with a stale operation ID is rejected (E3-S7). |
| Journal | `.marksync/journal/<run-id>.jsonl` — append-only, one `{ ts, op, pageId, uuid, outcome }` per mutation. Crash-safe; consumed by `replayJournal` (E4-S4). |
| `Repository` port | The minimal domain-owned git abstraction: `readCommitted` + `headSha` + `currentBranch` + commit-list hook. Shell-git adapter implements it (TDR-0003). |
| Link resolver | Pure domain function resolving `[x](other.md)` to a target page reference. Unresolved → warning + `UnresolvedLink`. |
| Parent-first | Execution ordering where a parent page is always created/moved before its children (Confluence requires the parent to exist). |
| Per-document isolation | A failure on one document (e.g. `Conflict`) does NOT abort the run; other documents still apply. |
| Conflict-as-drift | The engine surfaces a 409 `Conflict` as drift in the `ApplyReport` and does NOT retry (E3-S7 owns retry/dedup). |
| Semantic idempotency | A second unchanged push classifies every entry `NO_CHANGE` → `NoOp` → `applyPlan` writes 0 pages (NFR-PERF-4). |
| INV-SAFE-1 | Invariant: zero silent overwrites — a `REMOTE_AHEAD`/`DIVERGED` document is blocked, never auto-overwritten. |
| INV-SAFE-2 | Invariant: a remotely-deleted managed page is never silently re-created (`REMOTE_MISSING` blocked without `--adopt`/`--rebind`). |
| INV-SAFE-3 | Invariant: duplicate UUID is fatal before any write. |
| INV-SEC-1 | Invariant: no credential appears in any output path (journal, plan, version.message, apply report). |

## 24. APPENDICES

- **`computePlan` pipeline (precondition: config loaded, lock loaded):**

  ```
  Step 1 — assertBranchAllowed(branch, config)         → ok | err(ForbiddenBranch)
  Step 2 — git.readCommitted("HEAD", patterns)         → Map<path, bytes>    (discover)
  Step 3 — detectDuplicateUuids(docs)                  → ok | err(DuplicateUuid)   (INV-SAFE-3)
  Step 4 — for each doc:
             parseMarkdown(bytes) → mdastToHast → target.renderBody(hast) → { body, hash }
             buildContentHash(...) → ContentHash
  Step 5 — resolveLinks(sourcePath, targetPath, bindings) → PageRef | warning(UnresolvedLink)
  Step 6 — for each binding:
             target.getPage(pageId) → Page | RemoteMissing | Forbidden   → RemoteState
             classify({ local?, base, remote }) → SyncState
             actionFor(state, { base, remote }) → Action
  Step 7 — emit Plan { runId, operationId, entries[] }
  ```

- **`applyPlan` execution (precondition: a `Plan` from `computePlan`):**

  ```
  Step 1 — reorder entries parent-first (creates/moves)
  Step 2 — for each entry (serialized, bounded concurrency = 1):
             NoOp   → skip                                        (idempotent)
             Skip   → skip + warn                                 (LOCAL_MISSING)
             Block  → skip + report                               (0 writes for this doc)
             Update → formatVersionMessage(...) → target.updatePage({ ..., message })
                      on Conflict (409) → report drift, do NOT retry
                      on success → journal { op: "update", ... } → update binding → saveLock → putProperty
             Create → resolve parent → formatVersionMessage(...) → target.createPage({ ..., message })
                      on success → journal { op: "create", ... } → create binding → saveLock → putProperty
  Step 3 — emit ApplyReport { results[], writes, skips, blocks }
  ```

- **Journal entry schema (one JSON line per mutation in `.marksync/journal/<run-id>.jsonl`):**

  ```json
  { "ts": "2026-07-12T12:00:00.000Z", "op": "update", "pageId": "123456", "uuid": "01923d...", "outcome": "success" }
  ```

- **Provenance format (produced by the existing `formatVersionMessage`, GH-21):**
  - `marksync git <head-sha> (<count>): <subj1>; <subj2>; …` — trimmed to `MAX_VERSION_MESSAGE_LEN = 255` (whole trailing subjects dropped + `…`).
  - Example: `marksync git a1b2c3d (3): feat: add sync engine; docs: update spec; test: add fixtures…`

- **Authoritative sources:** the story file `MS2-E3-S6--sync-engine.md` (scope, AC, DoD, out-of-scope, CEO-resolved R1/Q1); the feature spec `feature-safe-publish.md` (§3.2 key flows, §4.2 component rows, §5 cross-cutting AC); ADR-0006 (C-1..C-6, INV-SAFE-1/2/3, §5.4, no cross-page transaction); ADR-0010 (squash provenance, C-3 bounded writes, version.message format); TDR-0003 (shell-git behind `Repository`, C-4 injection controls); `architecture-overview.md` (§"Internal interface contracts" — `readCommitted`/`worktreeStatus` sketch; §"Data flow / Push flow" diagram; §"Module governance" — link resolver, git adapter, push executor residences); `nonfunctional.md` (NFR-REL-1/5/6/7/8/9, NFR-PERF-4, NFR-SEC-1, NFR-OBS-1/5, NFR-COMP-5, NFR-MAINT-1); `.ai/rules/testing-strategy.md` (6-tier strategy, over-mocking guardrail).

- **Reused contracts verified present (read, not assumed):** `src/domain/target/port.ts` (`TargetSystem` — `renderBody`/`getPage`/`createPage({message?})`/`updatePage({message?, baseVersion})`/`movePage`/`getProperty`/`putProperty`; every op returns `Result<T, MarkSyncError>`); `src/domain/state/classifier.ts` (`classify({ local?, base, remote }) → Result<SyncState, MarkSyncError>`); `src/domain/state/actions.ts` (`actionFor(state, ctx) → Action` — `NoOp`/`Update`/`Block`/`Skip`); `src/domain/state/sync-state.ts` (`SyncState` enum, `RemoteState` union, `SharedBase`); `src/domain/state/hashes.ts` (`ContentHash`, `buildContentHash`); `src/domain/state/reconcile.ts` (`reconcileWithProperty`, `MetadataProperty`); `src/domain/config/lock-types.ts` (`LockFile`, `LockTarget`); `src/domain/binding/page-binding.ts` (`PageBinding`); `src/app/lock.ts` (`loadLock`/`saveLock`/`serializeLock`/`mergeBindings` — `saveLock` is atomic via `writeAtomic`); `src/app/branch.ts` (`assertBranchAllowed`); `src/app/cache.ts` (`resolveCacheDir`, `ensureCacheLayout` — `.marksync/{cache,journal,conflicts}/`); `src/domain/identity/duplicate-detector.ts` (`detectDuplicateUuids`); `src/infra/confluence/provenance.ts` (`formatVersionMessage` + `MAX_VERSION_MESSAGE_LEN = 255` — prefix `marksync git`); `src/cli/output/command-result.ts` (`CommandResult<T>`, `ok`, `err`, `SCHEMA_VERSION`); `src/cli/commands/plan.ts` + `sync.ts` (current stubs returning `err("INTERNAL", ...)`); `src/domain/errors.ts` (`MarkSyncError` union — `Conflict`/`RemoteMissing`/`DuplicateUuid`/`Forbidden`/`UnresolvedLink`/`RateLimited`/`RemoteUnreachable`/`ForbiddenBranch`/`LockDirty`/`StalePlan`/`TooLarge`/`CorruptLock`/`InvalidConfig`/`Auth` arms; `assertNeverMarkSyncError`).

- **Structural/quality reference:** the GH-22 spec (`chg-GH-22-spec.md`) — same epic, immediately preceding, established the section depth and the DEC/OQ/RSK conventions used here.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | spec-writer (ADOS) | Initial specification. |

---

## AUTHORING GUIDELINES

Authored by `@spec-writer` per the standard phase-2 specification flow. Sources: the story file MS2-E3-S6 (authoritative scope — deliverables, ACs, DoD, out-of-scope, CEO-resolved R1/Q1), the feature spec `feature-safe-publish.md` (§3.2/§4.2/§5), `architecture-overview.md` (§"Internal interface contracts" — `readCommitted`/`worktreeStatus` sketch, reconciled in DEC-4; §"Data flow / Push flow" diagram; §"Module governance" — link-resolver/git-adapter/push-executor residences), ADR-0006 (C-1..C-6, INV-SAFE-1/2/3, §5.4, no cross-page transaction fixed constraint), ADR-0010 (squash provenance, C-3 bounded writes, `version.message` format, unresolved length-limit question de-risked in DEC-2), TDR-0003 (shell-git behind `Repository`, C-1..C-4), `nonfunctional.md` (NFR-REL-1/5/6/7/8/9, NFR-PERF-4, NFR-SEC-1, NFR-OBS-1/5, NFR-COMP-5, NFR-MAINT-1), `.ai/rules/testing-strategy.md` (6-tier strategy, over-mocking guardrail — mocks allowed for fault injection + adapter boundary; NOT for lifecycle invariants). PM clarify_scope decisions (git-port ownership DEC-4, provenance de-risk DEC-2/DEC-3, `--adopt`/`--rebind` scoping OQ-1) were incorporated from `chg-GH-23-pm-notes.yaml`. Existing code seams were **read and verified**, not assumed: every consumed contract (`TargetSystem` port, `classify`/`actionFor`, `SyncState`/`Action`/`RemoteState`/`SharedBase`, `ContentHash`/`buildContentHash`, `loadLock`/`saveLock`/`mergeBindings`, `assertBranchAllowed`, `detectDuplicateUuids`, `reconcileWithProperty`, `formatVersionMessage`, `CommandResult`/`ok`/`err`, `plan.ts`/`sync.ts` stubs, `MarkSyncError` union) was read to confirm signatures, error arms, and module residences. The story's prose `version.message` prefix (`marksync:squash commit=<sha>`) was treated as superseded by the shipped formatter (`marksync git …`) per PM notes decision #3 (DEC-3). The git-port ownership (no prior story delivered `src/infra/git/`) was resolved from PM notes decision #1 (DEC-4). The `--adopt`/`--rebind` scope was resolved from PM notes + OQ-1 (default-block in scope; full adopt deferred). No question required `@decision-advisor` escalation. The GH-22 spec was the structural/quality reference; the template (`doc/templates/change-spec-template.md`) defines structure.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-23`
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-, NG-, G-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details beyond module residence (no step-by-step code)
- [x] No content duplicated from linked docs (cited, not copied)
- [x] Front matter validates per the template
