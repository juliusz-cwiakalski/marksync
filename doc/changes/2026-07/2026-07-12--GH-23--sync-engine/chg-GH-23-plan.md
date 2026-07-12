---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-23-sync-engine
status: Updated
created: 2026-07-12T00:00:00Z
last_updated: 2026-07-12T12:29:48Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, application, orchestration, reliability, provenance]
links:
  change_spec: ./chg-GH-23-spec.md
  test_plan: ./chg-GH-23-test-plan.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S6--sync-engine.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  adr_0010: ../../../decisions/ADR-0010-page-history-provenance.md
  tdr_0003: ../../../decisions/TDR-0003-git-adapter.md
  architecture_overview: ../../../overview/architecture-overview.md
  ubiquitous_language: ../../../overview/ubiquitous-language.md
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  target_port_contract: ../../../../src/domain/target/port.ts
  classifier_contract: ../../../../src/domain/state/classifier.ts
  actions_contract: ../../../../src/domain/state/actions.ts
  sync_state_contract: ../../../../src/domain/state/sync-state.ts
  hashes_contract: ../../../../src/domain/state/hashes.ts
  reconcile_contract: ../../../../src/domain/state/reconcile.ts
  lock_contract: ../../../../src/app/lock.ts
  branch_contract: ../../../../src/app/branch.ts
  cache_contract: ../../../../src/app/cache.ts
  provenance_contract: ../../../../src/infra/confluence/provenance.ts
  command_result_contract: ../../../../src/cli/output/command-result.ts
  errors_contract: ../../../../src/domain/errors.ts
  gh22_plan_precedent: ../2026-07-12--GH-22--drift-classifier/chg-GH-22-plan.md
  gh21_plan_precedent: ../2026-07-09--GH-21--confluence-adapter/chg-GH-21-plan.md
summary: >
  Deliver MS2-E3-S6 (epic MS2-E3 — Safe Publish Core, sixth and capstone
  story): the use-case orchestration that wires every preceding piece (identity
  GH-18, state/lock GH-19, markdown pipeline GH-20, Confluence adapter +
  TargetSystem port GH-21, drift classifier GH-22) into the two use cases
  operators invoke. A pure `computePlan(config, lock, git, target) →
  Result<Plan, MarkSyncError>` runs the no-writes pipeline (branch gate →
  discover committed docs via a new minimal `Repository` port → duplicate-UUID
  fatal gate → parse → render+hash via the TargetSystem port → resolve
  cross-page links → fetch remote → classify → emit a reviewable `Plan`), and
  `applyPlan(plan, target, lock, opts) → Result<ApplyReport, MarkSyncError>`
  executes it parent-first with per-document isolation, immediate per-mutation
  journaling (append-only `.marksync/journal/<run-id>.jsonl`), squash
  provenance wired through the EXISTING `formatVersionMessage` (DEC-3), 409
  Conflict surfaced as drift with no retry (DEC-6), and atomic lock +
  `marksync.metadata` property update per doc. Six new modules: the
  domain-owned `Repository` port (`src/domain/git/port.ts`) + its shell-git
  adapter (`src/infra/git/shell-git.ts`, TDR-0003 four-layer injection
  controls), the pure cross-page link resolver
  (`src/domain/hierarchy/link-resolver.ts`), the journal writer + `replayJournal`
  (`src/app/journal.ts`), and `computePlan`/`applyPlan` + `Plan`/`PlanEntry`/
  `ApplyReport` (`src/app/push-flow.ts`). The `plan`/`sync` CLI stubs become
  thin shells returning `CommandResult<Plan>` / `CommandResult<ApplyReport>`.
  No new `MarkSyncError` arms (DM-8); the GH-22 `Action`/`SyncState` are
  consumed untouched (the engine adds an app-tier `Create` arm + `NEW` state
  for unbound documents). Blocks MS2-E3-S7 (concurrency/dedup) and MS2-E4-S4
  (repair-state replay).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-23: [MS2-E3-S6] Sync engine — plan → apply → verify orchestration (computePlan dry-run, applyPlan parent-first isolated journaled, journal+replay, git Repository port, cross-page link resolver, provenance wiring)

## Context and Goals

This plan delivers the **orchestration capstone** of MS-0002's safe-publish trust
wedge (epic MS2-E3, sixth and final story). GH-18 through GH-22 assembled every
component — document identity, the committed lock + branch gate + reconcile, the
Markdown→Storage pipeline, the `TargetSystem` port + Confluence adapter +
provenance formatter, and the pure three-way drift classifier + `Action` mapping.
Until this story lands, nothing wires those components into the two use cases an
operator invokes: `marksync plan` (dry-run) and `marksync sync` (apply). Both CLI
commands are stubs returning `err("INTERNAL", "… is not yet implemented")` (exit
99). MS-0002 cannot publish a single page until the orchestration exists.

Concretely this plan establishes six additive modules and updates two stubs:

- **`src/domain/git/port.ts`** — the minimal domain-owned `Repository` port
  (DEC-4): `readCommitted(ref, patterns) → Result<Map<path, Uint8Array>,
  MarkSyncError>` + `headSha()` + `currentBranch()` + a commit-list hook
  (`listCommitSubjects`) for provenance. Domain-owned, infra-implemented — mirrors
  the `TargetSystem` port precedent (F-4, DM-5).
- **`src/infra/git/shell-git.ts`** — the `Repository` port implementation via
  `Bun.spawnSync('git', […args, '--', …validatedPaths])` (TDR-0003) with the four
  layered injection controls: args array, `--`, repo-relative path validation,
  non-interactive env `GIT_TERMINAL_PROMPT=0` (F-4, DM-6, NFR-17).
- **`src/domain/hierarchy/link-resolver.ts`** — the pure domain cross-page link
  resolver: `resolveLink(sourcePath, target, bindings) → Result<PageRef,
  MarkSyncError>`; unresolved → `err(UnresolvedLink)` (existing arm); never emits a
  broken URL silently (F-5, DM-7).
- **`src/app/journal.ts`** — the append-only `.marksync/journal/<run-id>.jsonl`
  writer (one `{ ts, op, pageId, uuid, outcome }` per mutation, appended BEFORE
  lock-update for crash safety) + `replayJournal(runId, cacheDir)` returning the
  completed ops so partial-apply recovery resumes without duplicates (F-3, DM-4,
  NFR-REL-7).
- **`src/app/push-flow.ts`** — the two use cases + their data model:
  `computePlan(config, lock, git, target) → Result<Plan, MarkSyncError>` (pure,
  no writes — F-1) and `applyPlan(plan, target, lock, opts) → Result<ApplyReport,
  MarkSyncError>` (the only write path — F-2); plus the `Plan` / `PlanEntry` /
  `ApplyReport` types (DM-1/2/3). Parent-first topological ordering,
  per-document isolation, Conflict-as-drift (no retry), serialized writes
  (bounded concurrency = 1, DEC-5), provenance via the existing
  `formatVersionMessage` (DEC-3), and atomic lock + property update per doc.
- **`src/cli/commands/plan.ts`** + **`sync.ts`** — the stubs become thin shells
  calling `computePlan` / `computePlan`+`applyPlan` and returning
  `CommandResult<Plan>` / `CommandResult<ApplyReport>` (F-6).

The plan is derived entirely from the authoritative spec `chg-GH-23-spec.md` (6
capabilities F-1..F-6, 7 decisions DEC-1..DEC-7, 14 acceptance criteria AC-F1-1
..AC-Q-1, 18 NFRs, 11 risks, OQ-1/OQ-2 both resolved during clarify_scope), the
test plan `chg-GH-23-test-plan.md` (TC-UNIT-001..007, TC-INTEGRATION-001..011,
TC-GATE-001 with the over-mocking guardrail), the story file `MS2-E3-S6--sync-
engine.md` (scope, AC, DoD, CEO-resolved R1/Q1), ADR-0006 (C-1..C-6, INV-SAFE-1/2/3,
§5.4, no cross-page transaction fixed constraint), ADR-0010 (squash provenance, C-3
bounded writes), TDR-0003 (shell-git behind `Repository`, C-4 injection controls),
the architecture-overview (§"Internal interface contracts", §"Data flow / Push
flow", §"Module governance"), and the **existing code seams read and verified**. It
invents no requirements. The change spec is the contract authority; this plan
operationalizes it.

### Verified reused contracts (DO NOT re-implement)

> The coder MUST reuse these verbatim. Re-implementing any of them is a defect.
> Every signature below was read from source, not assumed.

- **`src/domain/target/port.ts` (GH-21)** — `TargetSystem` interface: `renderBody(
  hast, { sourcePath }) → Result<RenderedBody, MarkSyncError>`; `getPage(id)`;
  `createPage(req)`; `updatePage(req)`; `movePage(req)`; `getProperty(pageId, key)`;
  `putProperty(pageId, key, value)`. **Field names verified:** `CreatePageRequest =
  { parentId; title; body; baseHash?; message? }` (NOTE: `parentId`, NOT
  `parentPageId`); `UpdatePageRequest = { pageId; title; body; baseVersion;
  message? }`; `Page = { id; title; version; body? }`; `RenderedBody = { body; hash;
  warnings }`. Both requests already carry the optional `message?` — provenance
  wiring needs **no port change** (DEC-3). A 409 surfaces as `err(Conflict)`, a 404
  as `RemoteMissing`, a 403 as `Forbidden`.
- **`src/domain/state/classifier.ts` (GH-22)** — `classify({ local?: ContentHash;
  base: SharedBase; remote: RemoteState }) → Result<SyncState, MarkSyncError>`.
  `base` is **required** (DEC-5: bound-documents-only). The engine must NOT call
  `classify` for unbound create candidates (PD-4).
- **`src/domain/state/actions.ts` (GH-22)** — `Action = NoOp | Update | Block | Skip`
  + `actionFor(state, { base, remote })`. **Untouched** — the engine adds the
  `Create` arm at the app tier (PD-4), not here.
- **`src/domain/state/sync-state.ts` (GH-22)** — `SyncState` (six values),
  `RemoteState` (`present` / `missing` / `forbidden`), `SharedBase`. **Untouched.**
- **`src/domain/state/hashes.ts` (GH-22)** — `ContentHash` (`rawHash`,
  `canonicalHash`, `attachmentHash`, `title`, `parentPageId`) + `buildContentHash(…)`.
- **`src/domain/state/reconcile.ts` (GH-19)** — `reconcileWithProperty(binding,
  property)` + `MetadataProperty` (the `marksync.metadata` property schema, 11
  fields incl. `operationId`/`synchronizedAt`). The engine serializes a binding
  into this shape for `putProperty` and cross-checks it after apply (NFR-11).
- **`src/domain/config/lock-types.ts` + `src/domain/binding/page-binding.ts`
  (GH-18/GH-19)** — `LockFile`, `LockTarget`, `PageBinding` (13 fields). **Unchanged.**
- **`src/app/lock.ts` (GH-19)** — `loadLock(cwd)` (absent → `ok({version:1,
  targets:{}})`); `saveLock(cwd, lock)` (atomic via `writeAtomic`); `serializeLock`;
  `mergeBindings(a, b)`.
- **`src/app/branch.ts` (GH-19)** — `assertBranchAllowed(branch, config) → Result<void,
  MarkSyncError>` (returns `err(ForbiddenBranch)` on deny). The engine calls this
  FIRST, before any discovery (NFR-14 / AC-F11-1).
- **`src/app/cache.ts` (GH-19)** — `resolveCacheDir(cwd)`, `ensureCacheLayout(dir)`
  (creates `.marksync/{cache,journal,conflicts}/`), `CACHE_SUBDIRS`.
- **`src/domain/identity/duplicate-detector.ts` (GH-18)** — `detectDuplicateUuids(
  docs: readonly DocWithUuid[])` where `DocWithUuid = { path; uuid? }`. UUID-less
  docs are NOT duplicates. INV-SAFE-3 / AC-F2-1.
- **`src/domain/identity/frontmatter.ts` (GH-18)** — `readUuid(source) → DocumentId |
  undefined`. The engine maps discovered bytes → `DocWithUuid` for the duplicate gate.
- **`src/domain/markdown/parse.ts` + `mdast-to-hast.ts` (GH-20)** —
  `parseMarkdown(bytes)`, `mdastToHast(mdast)`. Pipeline: `readCommitted` → decode →
  `parseMarkdown` → `mdastToHast` → `target.renderBody(hast)` → `buildContentHash`.
- **`src/infra/confluence/provenance.ts` (GH-21)** — `formatVersionMessage(input:
  ProvenanceInput) → string` where `ProvenanceInput = { headCommit; commitCount?;
  subjects? }`; output `marksync git <head> (<count>): <subj1>; …` trimmed to
  `MAX_VERSION_MESSAGE_LEN = 255`. **REUSE — do NOT reimplement (DEC-3 / NG-5).**
  Imported from `#infra/confluence/provenance` (app→infra permitted — PD-9).
- **`src/cli/output/command-result.ts` (GH-16)** — `CommandResult<T>`, `ok(data,
  meta?)`, `err(code, message, retryable, meta?)`, `SCHEMA_VERSION`.
- **`src/domain/errors.ts`** — the full union. Every arm the engine needs exists:
  `Conflict`, `RemoteMissing`, `DuplicateUuid`, `Forbidden`, `UnresolvedLink`,
  `RateLimited`, `RemoteUnreachable`, `ForbiddenBranch`, `LockDirty`, `StalePlan`,
  `TooLarge`, `CorruptLock`, `ConcurrentWrite`, `InvalidConfig`, `Auth`. **No new
  arms (DM-8 / NG-6).** `assertNeverMarkSyncError` untouched — the typecheck staying
  green is the proof.
- **`src/domain/result.ts`** — `Result<T,E>` + `Result.ok` / `Result.err`.
- **`src/infra/lock/store.ts` (GH-19)** — `writeAtomic` + the test-only
  `armCrashAfterTempWrite(enabled)` crash-hook precedent (⇒ PD-5).
- **`src/cli/commands/plan.ts` + `sync.ts` (GH-16 stubs)** — currently return
  `err("INTERNAL", "… not yet implemented (MS2-E3)", false)`. This story replaces
  them.
- **`src/domain/git/.gitkeep`** — pre-staged port location (verified ⇒ PD-1).

### Binding decisions (plan-level)

> Plan-level decisions (PD-*) operationalize the spec. The spec's DEC-1..DEC-7 and
> the story's CEO-resolved R1/Q1 are committed and not re-litigated here; PD-* fill
> the implementation-level choices the spec leaves open.

- **PD-1 — Port residence.** The `Repository` port lives at
  `src/domain/git/port.ts`; the shell-git adapter at `src/infra/git/shell-git.ts`.
  Architecture-overview §"Module governance" records "new Git operation →
  `src/infra/git/` behind `Repository` interface"; the glossary + UL classify
  `Repository` as a port; `src/domain/git/.gitkeep` is already staged. This mirrors
  `TargetSystem` (port at `src/domain/target/port.ts`, adapter at
  `src/infra/confluence/target.ts`). The port imports ONLY `#domain/*`; dep-cruiser's
  `domain-may-not-import-infra` keeps it pure.

- **PD-2 — `readCommitted` returns bytes.** `readCommitted(ref, patterns) →
  Result<Map<string, Uint8Array>, MarkSyncError>`. Returning bytes (not decoded
  strings) keeps the port content-agnostic; the engine decodes via `TextDecoder` +
  `readUuid`. Files absent from the ref yield an empty map (not an error) — a corpus
  with no matching patterns is a valid empty plan.

- **PD-3 — Shell-git invocation + injection controls (TDR-0003 C-4).** Every spawn
  is `Bun.spawnSync("git", […subcmdArgs, "--", …validatedPaths], { cwd: repo, env:
  { …process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" }, encoding: "utf-8"
  })`. Repo-relative path validation is a pure domain guard at
  `src/domain/git/paths.ts` (`validateRepoRelative`/`validateRef`): rejects `..`
  segments, absolute paths, NUL/control bytes, shell metacharacters (` ` ` `$()`
  `;` `|` `&` `<>` `\n\r`), leading `/` or `\`. **On a malicious path/ref the guard
  throws** (invariant violation — "the caller must never pass an unvalidated path to
  git"; a hostile input is caught at the boundary BEFORE any spawn) — the
  typescript.md-sanctioned `throw`-for-invariants pattern and keeps DM-8 (no new
  `BadPath`/`BadRef` arm). A genuine git runtime failure (non-zero exit on
  pre-validated input) also throws (host invariant). TC-INTEGRATION-009 asserts the
  throw with **0 shell-execution surfaces** (AC-F12-1).

- **PD-4 — App-tier `Create` arm + `NEW` state; GH-22 untouched.** The GH-22
  classifier is bound-documents-only (DEC-5): a discovered doc with a UUID but no
  binding is a create candidate handled directly (no `classify` — there is no
  `base`). To avoid editing GH-22's delivered `Action`/`SyncState`, `push-flow.ts`
  defines `PlanAction = Action | { kind: "Create"; uuid: DocumentId; parentId:
  string; title: string; body: string }` and `PlanEntry.state: SyncState | "NEW"`.
  `applyPlan` switches on `PlanAction.kind`; the GH-22 arms map as before. A doc
  with **no UUID** is out of scope for create (corpus convention requires injected
  UUIDs per ADR-0006 C-1 / GH-18 `injectUuid`); the engine warns + skips it.

- **PD-5 — Test-only `applyPlan` crash hook.** `ApplyOptions` carries `cacheDir`,
  `cwd`, `provenance` (`ProvenanceInput`), optional `rebind?: boolean`, and optional
  `crashAfter?: number` (TEST-ONLY — when set, `applyPlan` throws after the K-th
  successful mutation, AFTER the journal append). Mirrors
  `armCrashAfterTempWrite`. Production never sets `crashAfter`. The
  TC-INTEGRATION-006 seam.

- **PD-6 — Parent-first topological sort (creates + moves only).** `applyPlan`
  topologically sorts creates/moves so a parent is always emitted before its
  children (parent identity = the resolved parent pageId for creates, or
  `binding.parentPageId` for moves); updates/no-ops/blocks/skips stay in stable
  original order. A cycle → `throw` (never silently mis-orders). TC-UNIT-003
  (AC-F6-1).

- **PD-7 — `ApplyReport` outcome set + aggregate counts.** `ApplyReport = { runId;
  results: Array<{ uuid; outcome: "created" | "updated" | "noop" | "skipped" |
  "blocked"; error? }>; writes; skips; blocks }` where `writes = created + updated`,
  `skips = noop + skipped`, `blocks = blocked`. Aggregate `writes` is the idempotency
  point (NFR-PERF-4: `writes === 0`); `blocks` is the INV-SAFE-1/2 point. A `blocked`
  result carries the typed `MarkSyncError`.

- **PD-8 — Conflict-as-drift, no retry (DEC-6).** A `Conflict` from
  `updatePage`/`createPage` → `blocked` outcome with the typed error; the engine
  does NOT retry. Per-document isolation (DEC-1 / NFR-10): one `Conflict` does not
  abort the run. TC-INTEGRATION-004 asserts exactly one `updatePage` call + a
  `blocked` result (AC-F3-1). Retry/dedup/stale-plan-expiry is E3-S7 (NG-1).

- **PD-9 — Provenance wiring (DEC-3).** `applyPlan` calls the REAL
  `formatVersionMessage(opts.provenance)` ONCE and passes the result as `message` on
  every create/update. `ProvenanceInput` is assembled by `computePlan` from the
  `Repository` port (`headSha()` + `listCommitSubjects()`) and carried on the `Plan`.
  Import is `import { formatVersionMessage } from "#infra/confluence/provenance"` —
  **app→infra is permitted** by the architecture matrix ("application →
  infrastructure ✓ via ports") and is NOT among the four live dep-cruiser rules.
  Per the over-mocking guardrail, TC-UNIT-002 uses the REAL `formatVersionMessage`
  (NEVER mocked) and asserts the `message` captured on the stub `TargetSystem`
  equals `formatVersionMessage(…)` for the same input.

- **PD-10 — Minimal `--rebind` (OQ-1).** `ApplyOptions.rebind?: boolean` (default
  `false`). When set, a `REMOTE_MISSING` entry is treated as a create (drop the
  stale `pageId`, create fresh under the configured parent, new binding). Default
  honors `Block(RemoteMissing)` → 0 re-creates (INV-SAFE-2 / AC-F1-2). Full `--adopt`
  (CQL search + identity matching) deferred to MS-0003 (NG-7).

- **PD-11 — Boundary purity proof (Phase 8).** Two dep-cruiser negative probes
  (`src/domain/git/__boundary_probe__.ts` + `src/domain/hierarchy/
  __boundary_probe__.ts`) each import a real `#infra/*` symbol; `bunx depcruise src`
  must fire `domain-may-not-import-infra` on each; with the probes removed the
  production tree is clean (AC-Q-1). Both paths added to `.gitignore`; cleanup is
  load-bearing in `beforeAll`/`afterEach`/`afterAll` (mirrors GH-22 Phase 4).

### Open questions

> Surfaced, not decided. None blocks delivery; each has a safe default the coder
> adopts and lifecycle phase 7 (`@doc-syncer`) reconciles.

- **`readCommitted`/`worktreeStatus` doc reconciliation (DEC-4).** The
  architecture-overview §"Internal interface contracts" sketches `worktreeStatus`
  (deferred — DEC-4). Reconciling that row (drop `worktreeStatus`, add `headSha`/
  `currentBranch`/`listCommitSubjects`, add `computePlan`/`applyPlan`/`resolveLink`
  rows) and tagging the push-flow diagram *(realized — GH-23)* is a **phase-7
  doc-sync item, NOT a coder task**.
- **System-spec / UL bindings (lifecycle phase 7).** Tagging `feature-safe-publish.md`
  §4.2 "Sync engine", binding `Plan Computed` / `Mutation Applied` / `Journal Entry`
  in the UL, and `related_changes += GH-23` are `@doc-syncer` tasks.
- **`MarkSyncError` arm for git `BadPath`/`BadRef` (PD-3).** DM-8 forbids new arms;
  validation throws (invariant). If a future story needs a typed Result channel for
  it (e.g. `doctor`), that is an additive error-arm change owned by that story. No
  decision needed here.

### Out of scope

- **409 retry / operation-ID dedup / stale-plan-expiry** — E3-S7 (NG-1).
- **Mermaid / attachment upload orchestration** — E4-S1/E4-S2 (NG-2); pass-through.
- **Reverse sync** — MS-0005+ (NG-3).
- **The exact `version.message` length-limit spike** — DE-RISKED (NG-4 / DEC-2).
- **Reimplementing provenance / classification / hashing / locking / reconcile** —
  consumed as-is (NG-5/NG-6). No new `MarkSyncError` arms; GH-22 `Action`/`SyncState`
  untouched (PD-4).
- **Full `--adopt` workflows** — MS-0003 / `doctor` (NG-7 / OQ-1); minimal `--rebind`
  in scope (PD-10).
- **Commit-by-commit granularity** — future milestone; MS-0002 is squash-only (NG-8).
- **Bounded concurrency > 1** — serialize for MS-0002 (NG-9 / DEC-5).
- **UUID injection on discovery** — the engine reads committed bytes only; UUID-less
  docs are warned + skipped (PD-4).
- **BDD/Gherkin scenarios** — E5-S1 (engine exposes the hooks; this plan delivers
  Tier-1 unit + Tier-2 integration fixtures only).
- **System-spec / architecture-doc / UL reconciliation** — lifecycle phase 7. **The
  coder does NOT touch `doc/spec/**` or `doc/overview/**`.**
- **Version bump** — repo bumps at release boundaries, not per change (GH-19..GH-22
  precedent; `version_impact: minor` is advisory).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, dep-cruiser-enforced). The **four LIVE
  rules** (verified in `.dependency-cruiser.cjs`): `domain-may-not-import-infra`,
  `domain-may-not-import-app`, `presentation-may-not-import-domain`,
  `presentation-may-not-import-infra`. Therefore: `src/domain/git/{port,paths}.ts` +
  `src/domain/hierarchy/link-resolver.ts` import only `#domain/*`; `src/infra/git/
  shell-git.ts` imports `#domain/git/port` + `#domain/git/paths` + `#domain/errors` +
  `#domain/result` + `Bun`/`node:*` (infra→domain is matrix-allowed);
  `src/app/push-flow.ts` + `src/app/journal.ts` import `#domain/*` + `#infra/*` +
  `#app/*`; `src/cli/commands/{plan,sync}.ts` import `#app/*` + `#cli/output` only
  — **no `#domain/*` or `#infra/*`** (the live `presentation-may-not-import-*` rules
  forbid it; the shells pass opaque values + return `CommandResult`). NOTE: the
  aspirational 9-rule snippet in typescript.md is NOT live — `app-may-not-import-
  infra`/`app-may-not-import-cli` are not enforced; the matrix permits app→infra
  (PD-9 provenance import relies on this).
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`): one import statement
  per module with inline `type` modifier; `PlanAction`/`ApplyOutcome` are plain
  unions (NOT `const enum`); the `PlanAction` switch is exhaustive with a terminal
  `never` guard; optional `message?`/`crashAfter?`/`rebind?` use conditional spread
  under `exactOptionalPropertyTypes`.
- **ESM-only**; aliases via `package.json` `"imports"`. Tests use `#`-aliases, never
  deep relative paths. `bunfig.toml` `root = "tests"` applies.
- **Error discipline**: `computePlan`/`applyPlan` return `Result<T, MarkSyncError>`
  for expected failures (ForbiddenBranch, DuplicateUuid, transport); `throw` is for
  invariant violations (malicious git path PD-3, parent-cycle PD-6, impossible
  parse). No `throw new Error(…)` for expected business conditions.
- **Comment discipline**: ≤ 3-line headers; self-documenting code; cite ADR-0006
  (INV-SAFE-1/2/3) + ADR-0010 + TDR-0003 once each at the load-bearing point; no
  bare `(DEC-x)`/`(NFR-x)` tags, no spec restatements, no JSDoc restating
  signatures.
- **No new dependencies.** `uuid` (`^14.0.1`) already installed for `uuid.v7()`
  (GH-18). `Bun.spawnSync` native (no `execa`/`simple-git`). `node:crypto` /
  `node:fs` / `node:path` native only.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-Q-1). Conventional Commits (commitlint + husky,
  72-char header); each phase = one logical commit; `check:boundaries` green at
  every commit.

### Risks

- **RSK-1 — Silent overwrite of a `REMOTE_AHEAD`/`DIVERGED` page (INV-SAFE-1 /
  NFR-REL-1).** Mitigated by Phase 5: `applyPlan` consumes `actionFor` verbatim — a
  `Block` is never sent to `createPage`/`updatePage`; TC-INTEGRATION-001/002 assert 0
  writes. The write-time 409 (E3-S7) is defense-in-depth.
- **RSK-2 — Silent re-create of a `REMOTE_MISSING` page (INV-SAFE-2 / NFR-REL-6).**
  Mitigated by Phase 5 (PD-10 default block); TC-INTEGRATION-003 asserts 0
  re-creates without `--rebind`.
- **RSK-3 — Partial-apply crash leaves the lock inconsistent (NFR-REL-7).** Mitigated
  by Phase 3 + Phase 5: journal append BEFORE lock-update; TC-INTEGRATION-006 asserts
  crash→K entries→`replayJournal` resumes without duplicates.
- **RSK-4 — No cross-page transaction (ADR-0006 fixed constraint / story R1).**
  Mitigated by Phase 4 + Phase 5: global validation in `computePlan`, parent-first
  ordering (PD-6), per-document isolation (PD-8), per-mutation journaling. No atomic
  multi-page guarantee claimed (DEC-1).
- **RSK-5 — Shell-git injection surface (TDR-0003 C-4).** Mitigated by Phase 1
  (PD-3); TC-INTEGRATION-009 asserts malicious fuzz rejected with 0 shell-execution
  surfaces (AC-F12-1).
- **RSK-6 — Credential/token leak (INV-SEC-1 / NFR-SEC-1).** Mitigated by Phase 4 +
  Phase 5: the engine never sees credentials; the journal records only `{ts, op,
  pageId, uuid, outcome}`; `version.message` carries only commit metadata;
  TC-UNIT-005/006 assert 0 token occurrences (AC-F10-1).
- **RSK-7 — Wrong parent-first ordering.** Mitigated by Phase 5 (PD-6) +
  TC-UNIT-003.
- **RSK-8 — Cross-page links silently broken.** Mitigated by Phase 2
  (`err(UnresolvedLink)` never a broken URL); TC-UNIT-004 (AC-F7-1).
- **RSK-9 — Provenance wrong or reimplemented (NFR-REL-9).** Mitigated by Phase 5
  (PD-9 — REAL `formatVersionMessage`); TC-UNIT-002.
- **RSK-10 — Git port over-built.** Mitigated by Phase 1 (DEC-4 minimal port).
- **RSK-11 — Bounded concurrency = 1 too slow.** Low impact at MS-0002's ≤500-page
  target; serialized writes are rate-limit-safe (DEC-5).

### Success Metrics

- **zero silent overwrites (NFR-1 / AC-F1-1)** — `REMOTE_AHEAD`/`DIVERGED` → 0
  writes; 100% of block entries blocked.
- **REMOTE_MISSING invariant (NFR-2 / AC-F1-2)** — 0 re-creates without `--rebind`.
- **duplicate-UUID fatal (NFR-3 / AC-F2-1)** — duplicated corpus →
  `err(DuplicateUuid)` before any write (0 writes).
- **semantic idempotency (NFR-4 / AC-F3-2)** — second unchanged push → `writes === 0`.
- **partial-apply recoverability (NFR-5 / AC-F4-1)** — crash after K of N → journal
  has K entries; `replayJournal` resumes without duplicates.
- **per-version provenance (NFR-6 / AC-F5-1)** — `message` from
  `formatVersionMessage` (`marksync git` prefix + head SHA); deterministic trim.
- **concurrency safety (NFR-7 / AC-F3-1)** — 409 surfaces as drift; NO retry.
- **no secrets in output (NFR-8 / AC-F10-1)** — 0 token occurrences across all
  output paths.
- **parent-first ordering (NFR-9 / AC-F6-1)** — child-before-parent reordered.
- **per-document isolation (NFR-10 / AC-F8-1)** — one Conflict does not abort the run.
- **lock + property atomicity (NFR-11 / AC-F9-1)** — `saveLock` + `putProperty`;
  `reconcileWithProperty` agrees.
- **cross-page link resolution (NFR-12 / AC-F7-1)** — `[x](other.md)` resolves;
  unresolvable → warning.
- **shell-injection safety (NFR-17 / AC-F12-1)** — malicious fuzz rejected, 0 shell
  execution.
- **boundary purity (NFR-18 / AC-Q-1)** — `src/domain/git/` + `src/domain/hierarchy/`
  import no `#infra/*`/`#app/*`/`#cli/*`; Phase 8 probes prove the rule fires.
- **error-model stability (DM-8)** — no new `MarkSyncError` arms;
  `assertNeverMarkSyncError` untouched; `bun run typecheck` green.
- **quality gate (NFR-18 / AC-Q-1)** — `bun run check` exits 0.

---

## Execution Strategy

Nine phases (Phase 0 is branch setup + baseline; Phases 1–8 are the eight delivery
phases from spec §18's landing order), one logical commit each (Phase 0 is
setup-only). The ordering follows the dependency lattice: **Phase 1 lands the
foundational read surface** (`Repository` port + shell-git adapter + path guard);
**Phase 2 lands the pure link resolver** (leaf domain module); **Phase 3 lands the
journal** (filesystem writer + reader, independent of the use cases); **Phase 4
lands `computePlan`** (the dry-run path); **Phase 5 lands `applyPlan`** (the only
write path, enforcing every invariant); **Phase 6 lands the integration suite**
(`Bun.serve()` mock target exercising every apply branch + crash→replay +
idempotency + isolation + atomicity + shell-git fuzz); **Phase 7 wires the CLI**
(stubs → thin shells); **Phase 8 runs the full gate** (quality + boundary purity
proof + doc handoff). `bun run check:boundaries` runs in every phase. Suggested
commit scopes: `feat(git)`, `feat(hierarchy)`, `feat(app)`, `test(app)`,
`feat(cli)`, `chore(app)`. The coder executes via `/run-plan GH-23 execute all
remaining phases no review`.

---

### Phase 0: Branch + baseline gate

**Goal**: Confirm the feature branch and re-baseline the gate so every subsequent
phase starts green. Confirm the reused contracts (every consumed seam from GH-18
through GH-22) are present and unchanged — they are the wiring targets and must not
be re-implemented.

**Tasks**:

- [ ] **0.1** Confirm `feat/GH-23/sync-engine` is checked out (it is — branched
      from `main` at `c43f8ae`, GH-22 merged). Verify `git branch --show-current`
      → `feat/GH-23/sync-engine`.
- [ ] **0.2** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); confirm it exits 0 on the untouched tree (the baseline).
      Record the baseline pass count for the Phase 8 delta.
- [ ] **0.3** Re-verify the reused contracts the coder MUST wire to (read, do not
      edit): `src/domain/target/port.ts` (`TargetSystem` + `message?` seam ⇒ PD-9);
      `src/domain/state/{classifier,actions,sync-state,hashes}.ts` (⇒ PD-4 — engine
      adds `Create`/`NEW` at app tier); `src/domain/state/reconcile.ts`
      (`reconcileWithProperty` + `MetadataProperty`); `src/app/{lock,branch,cache}.ts`;
      `src/domain/identity/{duplicate-detector,frontmatter,document-id}.ts`;
      `src/infra/confluence/provenance.ts` (`formatVersionMessage` ⇒ PD-9 REUSE);
      `src/cli/output/command-result.ts`; `src/domain/errors.ts` (⇒ DM-8 no new
      arms); `src/cli/commands/{plan,sync}.ts` (the stubs ⇒ Phase 7);
      `src/infra/lock/store.ts` (`armCrashAfterTempWrite` precedent ⇒ PD-5);
      `src/domain/git/.gitkeep` (⇒ PD-1).

**Acceptance Criteria**:

- Must: on branch `feat/GH-23/sync-engine`; `bun run check` exits 0 (baseline
  green).
- Must: every reused contract above is present and unmodified.

**Files and modules**:

- Code areas: none (setup only).
- System docs: none.

**Tests**:

- Manual: `git branch --show-current` → `feat/GH-23/sync-engine`; `bun run check`
  exits 0.

**Completion signal**: _(setup phase — no code commit; baseline gate recorded)_

---

### Phase 1: Repository port + shell-git adapter + path guard (F-4, DM-5/DM-6, NFR-17; TC-INTEGRATION-009 prep)

**Goal**: Deliver F-4 — the minimal domain-owned `Repository` port + the shell-git
adapter that implements it (TDR-0003) + the pure repo-relative path guard. This is
the foundational read surface: every downstream phase that discovers documents or
needs the head SHA/branch/commit-subjects depends on it. Minimal per DEC-4:
`readCommitted` + `headSha` + `currentBranch` + `listCommitSubjects`.

> **Decision context (inline):** DEC-4 / PD-1 / PD-2 (port + bytes return); TDR-0003
> C-4 / PD-3 (four injection controls; malicious path/ref throws — DM-8 no new arm);
> read-only (no fetch/push/pull/clone).

**Tasks**:

- [ ] **1.1** Create `src/domain/git/port.ts` (new) — `Repository` interface:
       `headSha(): Result<string, MarkSyncError>`; `currentBranch(): Result<string,
       MarkSyncError>`; `readCommitted(ref: string, patterns: readonly string[]):
       Result<Map<string, Uint8Array>, MarkSyncError>`; `listCommitSubjects(range?:
       string): Result<readonly string[], MarkSyncError>`. Imports: type-only
       `#domain/errors`, `#domain/result`. **No** `#infra/*`/`#app/*`/`#cli/*`. ≤
       3-line header citing TDR-0003 + architecture-overview §"Internal interface
       contracts" once.
- [ ] **1.2** Create `src/domain/git/paths.ts` (new) — pure guards:
       `validateRepoRelative(path: string): void` (throws on `..`, absolute, NUL/
       control bytes, shell metacharacters `` ` `` `$()` `;` `|` `&` `<>` `\n\r`,
       leading `/` or `\`); `validateRef(ref: string): void` (throws on spaces, NUL,
       metacharacters, `..`). Pure domain; `node:path` POSIX only. ≤ 3-line header
       citing TDR-0003 C-4 once.
- [ ] **1.3** Create `src/infra/git/shell-git.ts` (new) — `createShellGit(repo:
       string): Repository`. Each method validates inputs then `Bun.spawnSync("git",
       […args, "--", …paths], { cwd: repo, env: { …process.env,
       GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" }, encoding: "utf-8" })`.
       `headSha()` → `git rev-parse HEAD` (trim); `currentBranch()` →
       `git rev-parse --abbrev-ref HEAD` (fall back to `GITHUB_REF_NAME` if
       detached); `readCommitted(ref, patterns)` → `git ls-tree -r --name-only
       <ref> -- <patterns>` then `git show <ref>:<path>` per file (or a single
       `git archive` pipe — coder's choice; the suite validates bytes);
       `listCommitSubjects(range?)` → `git log --format=%s <range>` (default
       `<base>..HEAD`; the engine supplies the range from the lock's
       `sourceCommit`). Non-zero git exit → `throw` (host invariant); empty result
       → `Result.ok([])` / `Result.ok(new Map())`. Imports: `#domain/git/port`,
       `#domain/git/paths`, `#domain/errors`, `#domain/result`. ≤ 3-line header
       citing TDR-0003 once.
- [ ] **1.4** Create `tests/unit/infra/git/shell-git.test.ts` (new) — **Unit**:
       - **Path-validation (PD-3):** table of malicious paths (`../escape`, `..`,
         `/abs/path`, `a;rm -rf /`, `` `whoami` ``, `$(id)`, `a\nb`, `a\0b`,
         `C:\win`, `|cat`) → each `validateRepoRelative(…)` THROWS; valid
         (`docs/intro.md`, `a/b/c.md`) → no throw.
       - **Ref-validation:** malicious refs (`HEAD; rm`, `main$(x)`, `..`) →
         `validateRef(…)` THROWS; valid (`HEAD`, `refs/heads/main`, `abc123`) → no
         throw.
       - **Temp-repo happy path:** temp dir, `git init`, commit one file,
         `createShellGit(tmp).readCommitted("HEAD", ["."])` → `ok(Map { "file.md" →
         bytes })`; `headSha()` → `ok(<40-char sha>)`; `currentBranch()` →
         `ok("main"|"master")`; `listCommitSubjects` → `ok(["init"])`. `afterEach`
         cleanup.

**Acceptance Criteria**:

- Must: `Repository` has exactly the four methods (DEC-4); imports only `#domain/*`
  (`check:boundaries` green).
- Must: `shell-git.ts` uses `Bun.spawnSync` with an args array + `--` + the
  non-interactive env (no shell-string interpolation).
- Must: every malicious path/ref fixture throws in `validateRepoRelative`/
  `validateRef` BEFORE any spawn (0 shell-execution surfaces for rejected inputs).
- Must: the temp-repo happy path reads committed bytes + head SHA + branch +
  subjects.
- Must: `src/domain/errors.ts` unchanged; `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/domain/git/port.ts` (new), `src/domain/git/paths.ts` (new),
  `src/infra/git/shell-git.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/infra/git/shell-git.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(git): Repository port + shell-git adapter + repo-relative path guard (GH-23)`

---

### Phase 2: Cross-page link resolver (F-5, DM-7, NFR-12; TC-UNIT-004)

**Goal**: Deliver F-5 — the pure domain cross-page link resolver at
`src/domain/hierarchy/link-resolver.ts`. Resolves a Markdown cross-document link
(`[x](other.md)`) to a target page reference; unresolved → `err(UnresolvedLink)` —
never a silently-broken URL. Leaf domain module (no engine dependency); lands early
so `computePlan` (Phase 4) can consume it.

> **Decision context (inline):** DM-7 / NFR-12 / AC-F7-1 (`resolveLink(sourcePath,
> target, bindings) → Result<PageRef, MarkSyncError>`; `PageRef = { id; title }`
> reused from the port); DM-8 (`UnresolvedLink` exists, reused). External/anchor
> links pass through untouched (out of scope, not errors).

**Tasks**:

- [ ] **2.1** Create `src/domain/hierarchy/link-resolver.ts` (new):
       - `LinkBindings` — input shape: a map/record from repo-relative source path
         → `{ pageId: string; title: string }` (a projection of discovered
         documents' bindings; the engine builds it in Phase 4).
       - `resolveLink(sourcePath: string, target: string, bindings: LinkBindings):
         Result<PageRef, MarkSyncError>` — `PageRef` imported type-only from
         `#domain/target/port`. Algorithm: normalize the target path relative to
         `sourcePath`'s directory (POSIX); for non-`.md`/external (`http://`,
         `mailto:`, anchor-only `#x`) targets → `ok` with the original target
         untouched (NOT rewritten, NOT an error); for a `.md` target, look up the
         normalized path in `bindings` → `ok(PageRef)` or `err({ kind:
         "UnresolvedLink"; sourcePath; target })`.
       - Imports: type-only `#domain/target/port` (`PageRef`), `#domain/errors`,
         `#domain/result`, `node:path` (POSIX). **No** `#infra/*`/`#app/*`/`#cli/*`.
         ≤ 3-line header citing architecture-overview §"Module governance" (Link
         resolver) once.
- [ ] **2.2** Create `tests/unit/domain/hierarchy/link-resolver.test.ts` (new) —
       **Unit**, pure fixtures:
       - **TC-UNIT-004 / AC-F7-1 resolved:** `bindings = { "doc-b.md": { pageId:
         "123", title: "Doc B" } }`; `resolveLink("docs/doc-a.md", "doc-b.md",
         bindings)` → `ok({ id: "123", title: "Doc B" })`. Cover a sub-directory
         relative target.
       - **TC-UNIT-004 / AC-F7-1 unresolved:** `resolveLink("doc-a.md",
         "missing-doc.md", bindings)` → `err({ kind: "UnresolvedLink"; sourcePath:
         "doc-a.md"; target: "missing-doc.md" })`.
       - **Out-of-scope pass-through:** `https://example.com` → `ok` (original
         URL); `#anchor` → `ok` (untouched).
       - **Path normalization:** `resolveLink("docs/sub/x.md", "../doc-b.md", {
         "docs/doc-b.md": {…} })` → resolves to `docs/doc-b.md` → `ok(PageRef)`.

**Acceptance Criteria**:

- Must: a resolved `.md` link returns the target `PageRef` (AC-F7-1 / NFR-12).
- Must: an unresolvable `.md` link returns `err(UnresolvedLink)` — NO broken URL
  emitted silently.
- Must: external/anchor links pass through untouched.
- Must: `resolveLink` imports no `#infra/*`/`#app/*`/`#cli/*` (domain purity);
  `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/domain/hierarchy/link-resolver.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/hierarchy/link-resolver.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(hierarchy): cross-page link resolver — resolveLink + unresolved warning (GH-23)`

---

### Phase 3: Journal writer + `replayJournal` (F-3, DM-4, NFR-REL-7; TC-INTEGRATION-006 prep)

**Goal**: Deliver F-3 — the append-only journal writer + replay reader at
`src/app/journal.ts`. One `{ ts, op, pageId, uuid, outcome }` JSON line per
mutation, appended to `.marksync/journal/<run-id>.jsonl` BEFORE the lock update
(crash safety). `replayJournal(runId, cacheDir)` returns the completed ops so
partial-apply recovery (E4-S4) resumes without duplicates. Independent of the use
cases.

> **Decision context (inline):** DM-4 / F-3 (entry shape); NFR-REL-7 / RSK-3
> (append BEFORE lock-update); the `journal/` subtree is pre-created by
> `ensureCacheLayout` (idempotent); INV-SEC-1 / RSK-6 (entry carries ONLY `{ts, op,
> pageId, uuid, outcome}` — no bodies/tokens; TC-UNIT-005 prep).

**Tasks**:

- [ ] **3.1** Create `src/app/journal.ts` (new):
       - `JournalEntry = { ts: string; op: "create" | "update" | "move"; pageId:
         string; uuid: string; outcome: "success" | "failed" }` (DM-4).
       - `openJournal(cacheDir: string, runId: string): JournalWriter` — resolves
         `<cacheDir>/journal/<run-id>.jsonl`, ensures the `journal/` dir
         (`ensureCacheLayout` is idempotent), exposes `append(entry): Result<void,
         MarkSyncError>` (`appendFileSync` with trailing `\n`; the append is the
         crash-safety seam — completes before the caller updates the lock). `ts`
         defaults to `new Date().toISOString()`.
       - `replayJournal(cacheDir: string, runId: string): Result<JournalEntry[],
         MarkSyncError>` — reads the JSONL, parses each non-empty line, skips
         malformed lines (defensive — a half-written last line from a crash is
         tolerated), returns the entries.
       - Imports: `node:fs` (`appendFileSync`, `readFileSync`, `existsSync`),
         `node:path` (`join`), `#app/cache` (`ensureCacheLayout`), `#domain/errors`,
         `#domain/result`. ≤ 3-line header citing ADR-0006 C-3 (disposable journal)
         once.
- [ ] **3.2** Create `tests/unit/app/journal.test.ts` (new) — **Unit** (filesystem
       in a temp dir):
       - **Append + read:** `openJournal(tmp, "run-1").append({ op: "create",
         pageId: "1", uuid: "u1", outcome: "success" })`; read → exactly one JSON
         line + ISO8601 `ts`. Append a second → two lines.
       - **Replay:** `replayJournal(tmp, "run-1")` → `ok([entry1, entry2])`.
       - **Missing file:** `replayJournal(tmp, "never-run")` → `ok([])` (no crash).
       - **Crash-tolerance:** valid line + partial (no trailing newline / truncated
         JSON) → `replayJournal` returns the valid entries, skips the partial.
       - **Secrets guardrail:** the entry carries only `{ts, op, pageId, uuid,
         outcome}`; assert the file has 0 occurrences of a fake token present only
         in the caller's scope (TC-UNIT-005 prep).

**Acceptance Criteria**:

- Must: `append` writes exactly one JSON line per call with an ISO8601 `ts` (DM-4).
- Must: `replayJournal` returns entries in append order; missing file → `ok([])`;
  half-written trailing line tolerated (NFR-REL-7 robustness).
- Must: the entry carries ONLY `{ts, op, pageId, uuid, outcome}` — 0 token
  occurrences (INV-SEC-1).
- Must: `journal.ts` imports no `#cli/*` (app tier); `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/app/journal.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/journal.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(app): append-only journal writer + replayJournal (GH-23)`

---

### Phase 4: `computePlan` use case (F-1, DM-1/DM-2, NFR-3/NFR-14/NFR-15; TC-UNIT-001, TC-UNIT-007)

**Goal**: Deliver F-1 — the pure no-writes pipeline `computePlan(config, lock, git,
target) → Result<Plan, MarkSyncError>` and the `Plan`/`PlanEntry`/`PlanAction` types
at `src/app/push-flow.ts`. Runs: branch gate → discover committed docs via the
`Repository` port → duplicate-UUID fatal gate → parse → render+hash via
`target.renderBody` → resolve cross-page links → fetch remote state per binding →
classify → emit a reviewable `Plan`. Fully unit-testable with fake ports. **Dry-run
returns here; 0 writes.**

> **Decision context (inline):** DEC-7 / DM-1 (`Plan = { runId (UUID v7);
> operationId ("op_<runId>"); entries }`); DM-2 / PD-4 (`PlanEntry = { uuid;
> sourcePath; state: SyncState | "NEW"; action: PlanAction; hashes }`;
> `PlanAction = Action | { kind:"Create"; uuid; parentId; title; body }`); NFR-14 /
> AC-F11-1 (branch gate FIRST — 0 discovery reads on deny); NFR-3 / AC-F2-1 /
> INV-SAFE-3 (duplicate gate AFTER discovery — the spec §24 / Flow 1 ordering, NOT
> §5.1's logically-impossible prose); NFR-15 (0 writes — only port reads);
> provenance input assembled here (PD-9: `headSha()` + `listCommitSubjects()`).

**Tasks**:

- [ ] **4.1** Create `src/app/push-flow.ts` (new) — Phase 4 lands `computePlan` +
       the types; Phase 5 adds `applyPlan`:
       - `Plan`, `PlanEntry`, `PlanAction` types (DM-1/2, PD-4). `PlanAction`
         extends GH-22's `Action` (imported type-only) with the `Create` arm.
       - `computePlan(config, lock, git, target): Promise<Result<Plan,
         MarkSyncError>>`:
         1. `git.currentBranch()` → `assertBranchAllowed(branch, config)` → on
            `err`, return it (0 discovery reads — NFR-14).
         2. `git.readCommitted("HEAD", config.select)` → `Map<path, bytes>`
            (discovery). `config.select` are repo-relative patterns; the path guard
            (Phase 1) validates them.
         3. For each discovered file: `TextDecoder` → `readUuid(source)` → build
            `DocWithUuid[]`. UUID-less docs → collect as a warning, skip from plan
            (PD-4).
         4. `detectDuplicateUuids(docs)` → on `err(DuplicateUuid)`, return it
            (INV-SAFE-3 / AC-F2-1, 0 writes).
         5. For each doc: `parseMarkdown` → `mdastToHast` → `target.renderBody(hast,
            { sourcePath })` → `buildContentHash({ source, hast, attachmentHashes:
            {}, title, parentPageId })`. Title = first H1 (or front-matter — kept
            simple for MS-0002); intended parent = `config.targets[<targetId>].
            parentPageId` (flat-under-configured-parent minimal for MS-0002).
         6. Resolve cross-page links: for each doc, walk its links, `resolveLink(
            sourcePath, target, bindings)` → collect `UnresolvedLink` warnings
            (do NOT abort the plan).
         7. For each bound doc (UUID in `lock.targets[<id>].documents`):
            `target.getPage(binding.pageId)` → translate to `RemoteState`
            (`present`/`missing`/`forbidden`); `classify({ local, base, remote })`
            → `SyncState`; `actionFor(state, { base, remote })` → `Action`. For
            each unbound doc (UUID present, no binding): `PlanEntry` with `state:
            "NEW"`, `action: { kind: "Create"; … }`.
         8. `headSha()` + `listCommitSubjects(...)` → assemble `ProvenanceInput`
            (carried on the `Plan` for `applyPlan`).
         9. Emit `Plan { runId: uuid.v7(), operationId: "op_<runId>", entries,
            provenance }`.
       - Imports: `#domain/*` (config types, lock-types, page-binding, identity,
         markdown, state/*, hierarchy/link-resolver, target/port, errors, result),
         `#app/lock`/`branch`, `uuid` (`v7`), `node:crypto`/`node:path` as needed.
         ≤ 3-line header citing ADR-0006 §5.4 + INV-SAFE-1/2/3 once.
- [ ] **4.2** Create `tests/unit/app/compute-plan.test.ts` (new) — **Unit** with
       FAKE ports (a fake `Repository` + a stub `TargetSystem` — adapter-boundary
       mocks, allowed):
       - **TC-UNIT-001 / AC-F2-1 (INV-SAFE-3):** fake `Repository` returning two
         docs with the same UUID → `computePlan(…)` → `err({ kind: "DuplicateUuid";
         uuid; paths: [a, b] })`; assert the stub target's write spies untouched;
         assert no `Plan` emitted.
       - **TC-UNIT-007 / AC-F11-1 (branch gate):** `config.sync.allowBranches =
         ["main"]`; fake `Repository.currentBranch()` → `"feature/x"`;
         `computePlan(…)` → `err({ kind: "ForbiddenBranch"; branch: "feature/x";
         allowed: ["main"] })`; assert 0 calls to `fakeRepo.readCommitted`.
       - **Per-state fixtures:** for each `SyncState` (`NO_CHANGE`/`LOCAL_AHEAD`/
         `REMOTE_AHEAD`/`DIVERGED`/`REMOTE_MISSING`/`LOCAL_MISSING`) construct a
         one-doc fake-repo + stub-target fixture and assert the emitted
         `PlanEntry.state` + `PlanEntry.action.kind` (NoOp/Update/Block/Block/Block/
         Skip). Use REAL `classify`/`actionFor` (over-mocking guardrail — never mock
         the classifier).
       - **`"NEW"` create candidate:** a doc with a UUID but no binding →
         `PlanEntry.state === "NEW"`, `PlanEntry.action.kind === "Create"`.
       - **Secrets guardrail (TC-UNIT-005 prep):** inject a fake token via a fake
         credential provider; serialize the `Plan` to JSON; assert 0 occurrences of
         the token.

**Acceptance Criteria**:

- Must: a forbidden branch → `err(ForbiddenBranch)` with 0 `readCommitted` calls
  (AC-F11-1 / NFR-14).
- Must: a duplicate-UUID corpus → `err(DuplicateUuid)` before any classification
  (AC-F2-1 / INV-SAFE-3).
- Must: each `SyncState` fixture produces the correct `PlanEntry` (via REAL
  `classify`/`actionFor`); an unbound doc → `"NEW"` + `Create`.
- Must: `computePlan` performs 0 writes (only port reads) — the stub target's
  `createPage`/`updatePage` spies untouched (NFR-15).
- Must: `Plan.runId` is a UUID v7; `operationId === "op_<runId>"` (DEC-7).
- Must: `src/domain/errors.ts` + GH-22 modules unchanged; `push-flow.ts` imports no
  `#cli/*`; `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/app/push-flow.ts` (new — Phase 4 portion).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/compute-plan.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(app): computePlan pure no-writes pipeline + Plan/PlanEntry types (GH-23)`

---

### Phase 5: `applyPlan` use case (F-2, DM-3, NFR-1/2/4/5/6/7/9/10/11; TC-UNIT-002, TC-UNIT-003)

**Goal**: Deliver F-2 — the only write path `applyPlan(plan, target, lock, opts) →
Promise<Result<ApplyReport, MarkSyncError>>` in `src/app/push-flow.ts` (added to
the Phase 4 module). Executes the `Plan`: parent-first topological ordering (PD-6),
per-document isolation (PD-8), immediate per-mutation journaling (Phase 3),
provenance wiring via the existing `formatVersionMessage` (PD-9), Conflict-as-drift
with no retry (PD-8/DEC-6), serialized writes (bounded concurrency = 1, DEC-5), and
atomic lock + `marksync.metadata` property update per doc (NFR-11).

> **Decision context (inline):** DM-3 / PD-7 (`ApplyReport` outcomes + aggregate
> counts); PD-5 (`ApplyOptions` + test-only `crashAfter`); PD-6 (topological sort,
> cycle → throw); PD-8 / DEC-6 / NFR-7 (Conflict → blocked, no retry; isolation);
> PD-9 / DEC-3 (REAL `formatVersionMessage` once, passed as `message`); NFR-11 /
> AC-F9-1 (per-doc success → `saveLock` atomic + `putProperty`; `reconcileWithProperty`
> agrees); NFR-REL-7 / RSK-3 (journal append BEFORE lock update); NFR-4 / AC-F3-2
> (`NoOp` → skip, 0 writes).

**Tasks**:

- [ ] **5.1** Extend `src/app/push-flow.ts` with `applyPlan`:
       - `ApplyReport`, `ApplyOutcome`, `ApplyOptions` types (DM-3, PD-5/PD-7).
       - `applyPlan(plan, target, lock, opts): Promise<Result<ApplyReport,
         MarkSyncError>>`:
         1. `message = formatVersionMessage(opts.provenance)` (PD-9 — called once;
            REAL formatter).
         2. Partition + topologically sort entries parent-first (PD-6): creates/
            moves ordered by the parent graph; updates/no-ops/blocks/skips in stable
            original order.
         3. Serialize the loop (bounded concurrency = 1 — DEC-5). For each entry
            (in order), switch on `PlanAction.kind`:
            - `NoOp` → record `noop` (skip, 0 writes).
            - `Skip` → record `skipped` (LOCAL_MISSING warning).
            - `Block` → record `blocked` with the typed `error` (0 writes —
              INV-SAFE-1/2). Special case: `Block(RemoteMissing)` + `opts.rebind` →
              convert to a create (PD-10).
            - `Update` → `target.updatePage({ pageId, title, body, baseVersion,
              message })`; on `err(Conflict)` → record `blocked` (PD-8, no retry);
              on other `err` → record `blocked`; on `ok(page)` → `journal.append({
              op:"update", pageId, uuid, outcome:"success" })` → update binding in
              memory (`pageVersion = page.version`, `sourceCommit = headSha`,
              `renderedBodyHash`, etc.) → `saveLock(opts.cwd, lock)` (atomic) →
              `target.putProperty(pageId, "marksync.metadata", serialize(binding))`
              → record `updated`.
            - `Create` → resolve parent (from the entry's `parentId`);
              `target.createPage({ parentId, title, body, message })`; on
              `err(Conflict)` → `blocked` (no retry); on `ok(page)` →
              `journal.append({ op:"create", pageId: page.id, uuid,
              outcome:"success" })` → create binding → `saveLock` → `putProperty`
              → record `created`.
            - `crashAfter` hook (PD-5): if `opts.crashAfter !== undefined` and the
              count of successful mutations reaches it, `throw` AFTER the journal
              append.
         4. Emit `ApplyReport { runId: plan.runId, results, writes, skips, blocks }`.
       - The `marksync.metadata` property value = `JSON.stringify(MetadataProperty)`
         (the GH-19 `MetadataProperty` shape). A small binding→property helper lives
         in `push-flow.ts`.
       - Imports: add `#app/journal`, `#app/lock`, `#infra/confluence/provenance`
         (`formatVersionMessage`), `#domain/state/reconcile` (type
         `MetadataProperty`). ≤ 3-line header (unchanged from Phase 4).
- [ ] **5.2** Create `tests/unit/app/provenance.test.ts` (new) — **Unit**:
       - **TC-UNIT-002 / AC-F5-1 / NFR-REL-9 (DEC-3):** a `Plan` with one `Update`
         entry + `opts.provenance = { headCommit: "abc123", commitCount: 2,
         subjects: ["feat: x", "docs: y"] }`. STUB `TargetSystem` (adapter-boundary
         mock — allowed) capturing `updatePage`'s `message` arg. Call `applyPlan(…)`.
         Assert `stubTarget.updatePage` was called with `message` EXACTLY equal to
         `formatVersionMessage(opts.provenance)` (the REAL formatter — over-mocking
         guardrail: do NOT mock `formatVersionMessage`). Assert the message starts
         with `marksync git abc123`.
       - **Over-limit trim:** `subjects` long enough to exceed
         `MAX_VERSION_MESSAGE_LEN` → the `message` is ≤ 255 chars and ends with the
         ellipsis (deterministic trim).
       - Repeat for a `Create` entry: assert `createPage` carries the same
         `message`.
- [ ] **5.3** Create `tests/unit/app/parent-first.test.ts` (new) — **Unit**:
       - **TC-UNIT-003 / AC-F6-1 / NFR-9:** a `Plan` with two `Create` entries in
         WRONG order — child A (parent = B) before parent B (parent = ROOT). Call
         `applyPlan(…)` against a stub target recording call order. Assert
         `createPage` was called for B (parent) BEFORE A (child); both `ok`; the
         `ApplyReport` has 2 `created`.
       - **Cycle guard:** two creates that mutually parent each other → `applyPlan`
         `throw`s (invariant) — assert it throws rather than mis-ordering.

**Acceptance Criteria**:

- Must: a `Block(Conflict)`/`Block(RemoteMissing)` entry → 0 writes for that doc;
  the `ApplyReport` records `blocked` with the typed error (INV-SAFE-1/2).
- Must: a 409 `Conflict` from `updatePage` → `blocked`, NO retry (exactly one
  `updatePage` call) (NFR-7 / DEC-6).
- Must: a `NoOp` entry → skipped, 0 writes; the report's `writes` count is the
  idempotency point (NFR-4 prep — full assertion in Phase 6).
- Must: per-doc isolation — one `Conflict` on doc A → doc B still applies; the run
  does NOT abort (NFR-10 prep — full assertion in Phase 6).
- Must: `formatVersionMessage` is called (REAL) and its output passed as `message`;
  the message starts with `marksync git` + head SHA and trims ≤ 255 (AC-F5-1 /
  DEC-3).
- Must: parent-first reorder — child-before-parent fixture → parent created first
  (AC-F6-1).
- Must: after a successful per-doc apply, `saveLock` ran (atomic) AND `putProperty`
  ran (NFR-11 prep — full `reconcileWithProperty` assertion in Phase 6).
- Must: the journal append runs BEFORE `saveLock` (NFR-REL-7 — full crash→replay
  assertion in Phase 6).
- Must: `src/domain/errors.ts` + GH-22 modules unchanged; `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/app/push-flow.ts` (extended — Phase 5 portion).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/provenance.test.ts tests/unit/app/parent-first.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(app): applyPlan parent-first isolated journaled write path + ApplyReport (GH-23)`

---

### Phase 6: Integration suite — `Bun.serve()` mock target (F-1/F-2/F-3 end-to-end, NFR-1/2/4/5/7/10/11/17; TC-INTEGRATION-001..011)

**Goal**: Deliver the Tier-2 integration suite proving the engine against a
`Bun.serve()` mock target with REAL `classify`/`actionFor`/`loadLock`/`saveLock`/
`assertBranchAllowed`/`detectDuplicateUuids`/`formatVersionMessage`/
`reconcileWithProperty` (over-mocking guardrail — only the `TargetSystem` port +
`Repository` port are mocked/faked). This phase discharges every INV-SAFE-1/2/3 +
idempotency + recoverability + isolation + atomicity + injection-safety assertion
at the integration level.

> **Decision context (inline):** over-mocking guardrail (mocks ALLOWED for the
> `TargetSystem` port — `Bun.serve()` HTTP mock with fault injection for 409/404/
> 403/5xx — + the `Repository` port — fake/in-memory or temp git repo — + the crash
> hook PD-5; NOT allowed for `classify`/`actionFor`/`loadLock`/`saveLock`/
> `assertBranchAllowed`/`detectDuplicateUuids`/`formatVersionMessage`/
> `reconcileWithProperty`); DM-8 (existing arms only); unique temp dir per test.

**Tasks**:

- [ ] **6.1** Create a shared mock-target helper at `tests/_helpers/mock-target.ts`
       (new) — a `Bun.serve()` factory returning `{ url, calls, setVersion(id,
       version), setMissing(id), setForbidden(id), close() }`. `calls` records
       `createPage`/`updatePage`/`putProperty` invocations (the write counter). Fault
       injection: per-page `version` (for 409 baseVersion mismatch), 404
       (RemoteMissing), 403 (Forbidden). Adapter-boundary mock (allowed).
- [ ] **6.2** Create `tests/integration/app/apply-plan-integration.test.ts` (new):
       - **TC-INTEGRATION-001 / AC-F1-1 (REMOTE_AHEAD, INV-SAFE-1):** lock binding
         at version 1; mock returns version 2; `computePlan` → `REMOTE_AHEAD`/
         `Block(Conflict)`; `applyPlan` → 0 `updatePage` calls; report 1 `blocked`,
         `writes === 0`. (REAL `classify`/`actionFor`.)
       - **TC-INTEGRATION-002 / AC-F1-1 (DIVERGED, INV-SAFE-1):** local + remote
         changed; → `DIVERGED`/`Block(Conflict)`; 0 writes; `blocked`.
       - **TC-INTEGRATION-003 / AC-F1-2 (REMOTE_MISSING, INV-SAFE-2):** mock
         returns 404; → `REMOTE_MISSING`/`Block(RemoteMissing)`; 0 `createPage`
         calls; `blocked`. (`opts.rebind` not set.)
       - **TC-INTEGRATION-004 / AC-F3-1 (409 Conflict-as-drift, NFR-REL-5):** at
         plan-time mock version = 1 (`LOCAL_AHEAD`/`Update`); bump mock to version 2
         before apply; `applyPlan` sends `baseVersion: 1` → mock returns 409; assert
         exactly ONE `updatePage` call (NO retry); report 1 `blocked` carrying
         `Conflict`.
- [ ] **6.3** Create `tests/integration/app/idempotency.test.ts` (new):
       - **TC-INTEGRATION-005 / AC-F3-2 (NFR-PERF-4):** 3 docs; first push
         `computePlan`+`applyPlan` (all create/update); reset the mock write
         counter; second push `computePlan` (no changes) → all `NO_CHANGE`/`NoOp`;
         `applyPlan` → write counter stays 0; report `writes === 0`, 3 `noop`.
- [ ] **6.4** Create `tests/integration/app/crash-replay.test.ts` (new):
       - **TC-INTEGRATION-006 / AC-F4-1 (NFR-REL-7):** 3 docs; `applyPlan(…,
         { crashAfter: 2 })` → throws after 2 successful mutations; read
         `.marksync/journal/<run-id>.jsonl` → exactly 2 entries; `replayJournal(tmp,
         runId)` → `ok([2 entries])`; recompute + apply with a "skip
         already-journaled" filter (simulate E4-S4) → only the 3rd doc writes (no
         duplicates); assert the mock write counter shows doc-3 written exactly
         once across both runs.
- [ ] **6.5** Create `tests/integration/app/per-doc-isolation.test.ts` (new):
       - **TC-INTEGRATION-007 / AC-F8-1 (NFR-10):** 2 docs — doc A (REMOTE_AHEAD →
         Block), doc B (LOCAL_AHEAD → Update); `applyPlan` → exactly ONE
         `updatePage` call (doc B only); report 1 `blocked` (A) + 1 `updated` (B);
         the function returns `ok(ApplyReport)` (does NOT throw/abort).
- [ ] **6.6** Create `tests/integration/app/lock-property-atomicity.test.ts` (new):
       - **TC-INTEGRATION-008 / AC-F9-1 (NFR-11):** one binding (LOCAL_AHEAD →
         Update); `applyPlan` → `updatePage` called once; `putProperty` called with
         `pageId`, `"marksync.metadata"`, and the updated binding; read the lock
         from disk → `sourceCommit` updated; `reconcileWithProperty(updatedBinding,
         parsedProperty)` → `ok()` (REAL `reconcileWithProperty` — agrees).
- [ ] **6.7** Create `tests/integration/app/shell-git-safety-fuzz.test.ts` (new):
       - **TC-INTEGRATION-009 / AC-F12-1 (NFR-17, TDR-0003 C-4):** temp git repo via
         `createShellGit(tmp)`; a fuzz table of malicious paths (`../`, `;`,
         backticks, `$()`, `\n`, `\0`, absolute) + malicious refs → for each,
         `expect(() => readCommitted("HEAD", [malicious])).toThrow()` /
         `headSha()` / `currentBranch()` THROWS (invariant violation — the path/ref
         guard fires BEFORE any spawn; **throw, NOT `Result.err`** — DM-8 forbids new
         `BadPath`/`BadRef` arms, per PD-3); assert 0 files outside the repo are
         accessed (the spawn never runs). (REAL shell-git adapter — not mocked.)
- [ ] **6.8** Add the secrets-safety unit suite if not already covered:
       `tests/unit/app/secrets-safety.test.ts` (new) — **TC-UNIT-005 / TC-UNIT-006 /
       AC-F10-1 / INV-SEC-1**: a full plan+apply run with a fake token injected via
       a fake credential provider; serialize the `Plan` JSON, read the journal
       JSONL, serialize the `ApplyReport` JSON, and inspect every `version.message`
       passed to the stub target; assert 0 occurrences of the token string across
       ALL output paths. (If Phase 4 already seeded the Plan-side assertion, this
       completes the journal/report/message coverage.)
- [ ] **6.9** Create `tests/integration/app/duplicate-uuid-fatal.test.ts` (new):
       - **TC-INTEGRATION-010 / AC-F2-1 / INV-SAFE-3 (NFR-3):** in-memory `Repository`
         returning two docs sharing the SAME UUID (`{ "doc-a.md": <bytes with uuid X>,
         "doc-b.md": <bytes with uuid X> }`); stub `TargetSystem` with
         `createPage`/`updatePage` spies. `computePlan(config, lock, inMemoryRepo,
         stubTarget)` → `err({ kind: "DuplicateUuid"; uuid: "X"; paths: ["doc-a.md",
         "doc-b.md"] })`; assert 0 calls to `stubTarget.createPage`/`updatePage`; assert
         NO `Plan` emitted (the fatal gate fires AFTER discovery, BEFORE any
         classification/apply). REAL `detectDuplicateUuids` (NOT mocked — over-mocking
         guardrail); only the `Repository` + `TargetSystem` ports are faked. Complements
         TC-UNIT-001 at the `computePlan` orchestration boundary.
- [ ] **6.10** Create `tests/integration/app/secrets-safety-integration.test.ts` (new):
       - **TC-INTEGRATION-011 / AC-F10-1 / INV-SEC-1 (NFR-8):** plant a fake token
         (e.g. `"FAKE_TOKEN_xyz123"`) in a discovered document; `Bun.serve()` mock
         `TargetSystem` capturing every `version.message`; run the full
         `computePlan` → `applyPlan` flow. Assert 0 occurrences of the token string
         across ALL output paths: the serialized `Plan` JSON, the journal JSONL
         (`.marksync/journal/<run-id>.jsonl`), the serialized `ApplyReport` JSON, and
         every `version.message` captured by the mock target. REAL
         `classify`/`actionFor`/`formatVersionMessage` (NOT mocked — over-mocking
         guardrail). Complements TC-UNIT-005/006 across the full apply flow.

**Acceptance Criteria**:

- Must: TC-INTEGRATION-001/002 — `REMOTE_AHEAD`/`DIVERGED` → 0 writes, `blocked`
  (INV-SAFE-1).
- Must: TC-INTEGRATION-003 — `REMOTE_MISSING` → 0 re-creates, `blocked` (INV-SAFE-2).
- Must: TC-INTEGRATION-004 — 409 → `blocked`, NO retry (exactly one `updatePage`)
  (NFR-REL-5).
- Must: TC-INTEGRATION-005 — second unchanged push → `writes === 0` (NFR-PERF-4).
- Must: TC-INTEGRATION-006 — crash after K of N → journal has K entries;
  `replayJournal` resumes without duplicates (NFR-REL-7).
- Must: TC-INTEGRATION-007 — one Conflict does not abort the run (NFR-10).
- Must: TC-INTEGRATION-008 — `saveLock` + `putProperty`; `reconcileWithProperty`
  agrees (NFR-11).
- Must: TC-INTEGRATION-009 — malicious fuzz rejected with a **throw** (invariant),
  0 shell-execution surfaces (NFR-17 / AC-F12-1 / PD-3 — throw, not `Result.err`;
  DM-8 forbids `BadPath`/`BadRef` arms).
- Must: TC-INTEGRATION-010 — duplicate-UUID corpus → `computePlan` returns
  `err(DuplicateUuid)` at the orchestration boundary with 0 writes + no `Plan`
  (INV-SAFE-3 / AC-F2-1).
- Must: TC-INTEGRATION-011 — 0 fake-token occurrences across ALL output paths
  (Plan JSON, journal JSONL, `ApplyReport` JSON, every `version.message`)
  (INV-SEC-1 / AC-F10-1).
- Must: TC-UNIT-005/006 — 0 token occurrences across all output paths (INV-SEC-1).
- Must: all integration tests use REAL `classify`/`actionFor`/`reconcileWithProperty`
  (over-mocking guardrail); `bun run check` exits 0.

**Files and modules**:

- Code areas: `tests/_helpers/mock-target.ts` (new, test-only).
- Test files: `tests/integration/app/{apply-plan-integration,idempotency,crash-replay,
  per-doc-isolation,lock-property-atomicity,shell-git-safety-fuzz,duplicate-uuid-fatal,
  secrets-safety-integration}.test.ts` + `tests/unit/app/secrets-safety.test.ts`.
- System docs: none.

**Tests**:

- `bun test tests/integration/app/ tests/unit/app/secrets-safety.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `test(app): integration suite — mock target, crash-replay, idempotency, isolation, atomicity, shell-git fuzz, duplicate-uuid fatal, secrets safety (GH-23)`

---

### Phase 7: CLI wiring — `plan`/`sync` stubs → thin shells (F-6; TC-GATE-001 prep)

**Goal**: Deliver F-6 — replace the `planCommand`/`syncCommand` stubs with thin
shells that call the use cases and return `CommandResult<Plan>` /
`CommandResult<ApplyReport>`. The commands remain presentation-tier: they import
`#app/*` + `#cli/output` only — no `#domain/*` or `#infra/*` (the live
`presentation-may-not-import-domain|-infra` rules forbid it). They never call
`process.exit` (the entrypoint does).

> **Decision context (inline):** F-6 / spec §5.1 F-6 (thin shells; opaque values;
> `CommandResult` via `ok`/`err`); tier rules (presentation imports app + output
> only — PD-1 Constraints); the shells construct the ports (config, lock, git,
> target) OR receive them — the minimal MS-0002 wiring constructs a `ShellGit` +
> resolves the target adapter from config. The shells do NOT reimplement
> orchestration — they delegate to `computePlan`/`applyPlan`.

**Tasks**:

- [ ] **7.1** Update `src/cli/commands/plan.ts` (replace stub):
       - `planCommand(): Promise<CommandResult<Plan>>` — load config + lock
         (`loadConfig`/`loadLock`, GH-15/GH-19), construct the `Repository`
         (`createShellGit(config.root)`) + the `TargetSystem` (the Confluence
         adapter, GH-21), call `computePlan(config, lock, git, target)`. On `ok` →
         `ok(plan)`; on `err(e)` → map the `MarkSyncError` to a stable
         `error.code` + redacted message via the existing app-tier mapper
         (`src/app/cli-error-map.ts`, GH-16/GH-17) → `err(code, message,
         retryable)`. Imports: `#app/*` (push-flow, lock, config/credentials as
         needed, cli-error-map), `#cli/output`. ≤ 3-line header.
       - NOTE: the port-construction helpers (building `ShellGit` + the target
         adapter from config) may warrant a small `src/app/ports.ts` factory so the
         shells stay thin and the `#infra/*` construction lives behind an app seam
         (the shells must not import `#infra/*` directly). The coder decides: a
         `createPorts(config)` factory in `src/app/ports.ts` returning `{ git,
         target }` is the clean option.
- [ ] **7.2** Update `src/cli/commands/sync.ts` (replace stub):
       - `syncCommand(): Promise<CommandResult<ApplyReport>>` — like `planCommand`
         but also calls `applyPlan(plan, target, lock, opts)` after `computePlan`
         (opts assembled: `cacheDir = resolveCacheDir(config.root)`, `cwd =
         config.root`, `provenance` from the plan). On `ok(report)` → `ok(report)`;
         on `err` → mapped `err`. Same import discipline.
- [ ] **7.3** Verify the presentation tier imports: `rg '#domain/|#infra/'
       src/cli/commands/plan.ts src/cli/commands/sync.ts` → empty (the shells go
       through `#app/*` only; if a `src/app/ports.ts` factory is added, it imports
       `#infra/*` — allowed for the app tier). `bun run check:boundaries` green.

**Acceptance Criteria**:

- Must: `planCommand` returns `CommandResult<Plan>` (not the `INTERNAL` stub); on
  the happy path `exitCode === 0` + `data: Plan`.
- Must: `syncCommand` returns `CommandResult<ApplyReport>`; on the happy path
  `exitCode === 0` + `data: ApplyReport`.
- Must: neither shell imports `#domain/*` or `#infra/*` (the live
  `presentation-may-not-import-*` rules hold; `check:boundaries` green).
- Must: neither shell calls `process.exit` (the entrypoint owns exit).
- Must: a `ForbiddenBranch`/`DuplicateUuid`/transport error maps to a stable
  `error.code` via the existing app-tier mapper (not a raw `MarkSyncError`).
- Must: `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/cli/commands/plan.ts` (updated), `src/cli/commands/sync.ts`
  (updated), optionally `src/app/ports.ts` (new — port factory).
- System docs: none.

**Tests**:

- `bun run typecheck` + `bun run check:boundaries` (the presentation import probe).
- (CLI output-shape assertions are E2E-tier per testing-strategy.md — the unit/
  integration suites already cover `computePlan`/`applyPlan` directly.)

**Completion signal**: `feat(cli): wire plan/sync commands to computePlan/applyPlan (GH-23)`

---

### Phase 8: Final quality gate + boundary purity proof + doc handoff (AC-Q-1, NFR-18; TC-GATE-001)

**Goal**: Run the full `bun run check` gate green; prove the new domain modules
(`src/domain/git/` + `src/domain/hierarchy/`) are purity-clean via dep-cruiser
negative probes (PD-11); confirm no error-model change (DM-8); and hand the
doc-reconciliation risks to lifecycle phase 7 (`@doc-syncer`). No new behavior. This
is the AC-Q-1 discharge + the spec-reconciliation handoff (the final release phase
per the plan template).

**Tasks**:

- [ ] **8.1** Run `bun run check` (lint + format:check + typecheck + test +
       check:boundaries); fix any issue (biome format/lint nits, unused imports,
       `exactOptionalPropertyTypes` adjustments, the exhaustive `PlanAction` switch
       never-guard). Confirm all ACs green (TC-GATE-001). Report the pass count and
       the delta vs the Phase 0 baseline.
- [ ] **8.2** Boundary negative tests (PD-11) — create two ephemeral probes:
       - Add `src/domain/git/__boundary_probe__.ts` + `src/domain/hierarchy/
         __boundary_probe__.ts` to `.gitignore` (alongside the GH-22 entries).
       - Create `tests/unit/domain/git/boundary-negative.test.ts` +
         `tests/unit/domain/hierarchy/boundary-negative.test.ts` mirroring the GH-22
         Phase 4 pattern (`tests/unit/domain/state/boundary-negative.test.ts`):
         each writes a probe importing a real `#infra/*` symbol (e.g.
         `#infra/confluence/client`), runs `bunx depcruise src` (parsed JSON), asserts
         a `domain-may-not-import-infra` violation with `from` = the probe path +
         `to` matching `^src/infra/` (negative); then removes the probe and asserts
         0 violations under `src/domain/git/` / `src/domain/hierarchy/` (positive).
         Load-bearing cleanup in `beforeAll`/`afterEach`/`afterAll` (a leaked probe
         permanently breaks `depcruise src`).
- [ ] **8.3** Confirm the boundary direction explicitly (AC-Q-1): `bun run
       check:boundaries` passes with 0 violations; `rg '#infra/|#app/|#cli/'
       src/domain/git/ src/domain/hierarchy/` returns nothing — the new domain
       modules import only `#domain/*` (+ `node:*`, `zod`, `hast`/`mdast` types as
       applicable).
- [ ] **8.4** Confirm **no error-model change** (DM-8 / NFR-9): `git diff
       src/domain/errors.ts` is empty; `assertNeverMarkSyncError` untouched;
       `bun run typecheck` green is the proof. Also confirm GH-22 modules are
       untouched: `git diff src/domain/state/{classifier,actions,sync-state,hashes}.
       ts` empty (PD-4 added `Create`/`NEW` at the app tier, not here).
- [ ] **8.5** Hand off the doc risks to lifecycle phase 7 (`@doc-syncer`) — **no
       code/doc change here** (out of the coder's delivery scope):
       - Tag `feature-safe-publish.md` §4.2 "Sync engine" (currently a stub) →
         reference `computePlan`/`applyPlan`/journal/link-resolver/`Repository`
         port; mark *(delivered — GH-23)*.
       - Reconcile `architecture-overview.md` §"Internal interface contracts"
         (~line 221): drop `worktreeStatus` (DEC-4); refine `readCommitted` to
         the realized minimal `Repository` port; add `headSha`/`currentBranch`/
         `listCommitSubjects`; add `computePlan`/`applyPlan`/`resolveLink` rows
         (interface-contracts additions — confirmed carried over from v1.0).
       - **Reconcile the `readCommitted` interface-contract error column** (the row
         at ~line 221 currently lists `RefNotFound`, `BadPath`). Per PD-3, the
         delivered `Repository` port makes malicious path/ref inputs **throw**
         (invariant violation caught at the boundary BEFORE any spawn); the port's
         `Result` error surface does NOT include `BadPath`/`RefNotFound` arms
         (DM-8). Replace the `RefNotFound, BadPath` error cell with the realized
         contract — e.g. `throws on malformed path/ref (invariant); Result<…>
         carries transport/runtime errors only` — and document the actual throw
         behavior.
       - **Reclassify the two tier-misclassified rows in `architecture-overview.md`
         §"Components / Core components"** (DoR iter-1 finding 4):
         - "Push executor" (line ~99, currently `infrastructure`) — the delivered
           `applyPlan` write loop lives in **`src/app/push-flow.ts` = application
           tier** (use-case orchestration). Reclassify the tier to `application`;
           fix the Container + responsibility text to match (ordered safe writes
           via `TargetSystem` port; parent-first; per-doc isolation; journaling).
          - "Lock/journal store" (line ~101, currently `infrastructure`) — the
            delivered journal writer/`replayJournal` lives in
            **`src/app/journal.ts` = application tier** (app-tier state
            orchestration, not a port implementation). Reclassify the tier to
            `application`.
          - **What STAYS `infrastructure`** (do NOT move these): the
            `Repository`-port-implementing shell-git adapter (`src/infra/git/`,
            the "Git adapter" row at line ~102) and the lock atomic-write
            primitive `writeAtomic` (`src/infra/lock/store.ts`). The primitives
            are infra; the orchestration that calls them is application. Update
            the tier column + Container + responsibility text accordingly, OR
            split each row to distinguish the app-tier orchestration from the
            infra-tier primitive it delegates to. Be precise about what stays
            infra vs what is app.
       - Tag `architecture-overview.md` §"Data flow / Push flow" diagram *(realized
         — GH-23)* (confirmed carried over from v1.0).
       - Bind `Plan Computed` / `Mutation Applied` / `Journal Entry` in
         `ubiquitous-language.md`; `related_changes += GH-23` in
         `feature-safe-publish.md`.
       - Append the engine-delivery retrospective to `ADR-0006` Lessons Learned.
- [ ] **8.6** Version impact: `version_impact: minor` is advisory only — repo bumps
       at release boundaries, not per change (GH-19..GH-22 precedent). No
       `package.json` version bump in this PR.

**Acceptance Criteria**:

- Must: `bun run check` exits 0 (AC-Q-1 / NFR-18); report the pass count + delta.
- Must: both dep-cruiser negative probes fire `domain-may-not-import-infra` on the
  `src/domain/git/` + `src/domain/hierarchy/` probes; with the probes removed, 0
  violations (the new domain modules are pure).
- Must: `src/domain/errors.ts` unchanged (DM-8); GH-22 state modules unchanged
  (PD-4); the typecheck staying green is the proof.
- Must: no probe file is leaked (cleanup verified); `check:boundaries` green.

**Files and modules**:

- Code areas: none (gate + test-only phase; opportunistic boy-scout header/format
  trims allowed if biome flags them).
- System docs: none in this phase (doc reconciliation is lifecycle phase 7).

**Tests**:

- `bun run check` (full gate).
- `bun test tests/unit/domain/git/boundary-negative.test.ts tests/unit/domain/hierarchy/boundary-negative.test.ts`

**Completion signal**: `chore(app): final quality gate + boundary purity proof + doc handoff for E3-S6 sync engine (GH-23)`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-UNIT-001 | Duplicate-UUID corpus → `computePlan` returns `err(DuplicateUuid)` before any write (INV-SAFE-3) | 4 | AC-F2-1 / NFR-3 |
| TC-UNIT-002 | Provenance wiring: REAL `formatVersionMessage` output passed as `message` on create/update; over-limit trim deterministic | 5 | AC-F5-1 / NFR-6 |
| TC-UNIT-003 | Child-page create before parent → reordered parent-first; child's create succeeds | 5 | AC-F6-1 / NFR-9 |
| TC-UNIT-004 | Cross-page link resolver: resolved → `PageRef`; unresolved → `err(UnresolvedLink)` (no broken URL) | 2 | AC-F7-1 / NFR-12 |
| TC-UNIT-005 | No secrets in output: 0 token occurrences in plan JSON, journal, `version.message` | 4, 6 | AC-F10-1 / NFR-8 |
| TC-UNIT-006 | No secrets in output: 0 token occurrences in `ApplyReport` JSON | 6 | AC-F10-1 / NFR-8 |
| TC-UNIT-007 | Branch gate: non-allowed branch → `computePlan` returns `err(ForbiddenBranch)` before discovery (0 reads) | 4 | AC-F11-1 / NFR-14 |
| TC-INTEGRATION-001 | `REMOTE_AHEAD` entry → `applyPlan` 0 writes; reports block (INV-SAFE-1) | 6 | AC-F1-1 / NFR-1 |
| TC-INTEGRATION-002 | `DIVERGED` entry → `applyPlan` 0 writes; reports block (INV-SAFE-1) | 6 | AC-F1-1 / NFR-1 |
| TC-INTEGRATION-003 | `REMOTE_MISSING` entry → 0 re-creates; reports block (INV-SAFE-2) | 6 | AC-F1-2 / NFR-2 |
| TC-INTEGRATION-004 | Stale `baseVersion` → 409 Conflict surfaces as drift; NO retry | 6 | AC-F3-1 / NFR-7 |
| TC-INTEGRATION-005 | Second unchanged push → every entry `NO_CHANGE` → `applyPlan` writes 0 | 6 | AC-F3-2 / NFR-4 |
| TC-INTEGRATION-006 | Crash after K of N docs → journal has K entries; `replayJournal` resumes without duplicates | 3, 5, 6 | AC-F4-1 / NFR-5 |
| TC-INTEGRATION-007 | One Conflict on doc A → doc A blocked, doc B still applies; run does NOT abort | 6 | AC-F8-1 / NFR-10 |
| TC-INTEGRATION-008 | Successful per-doc apply → lock atomically saved + property put; `reconcileWithProperty` agrees | 6 | AC-F9-1 / NFR-11 |
| TC-INTEGRATION-009 | Malicious path/ref fuzz → rejected with a **throw** (invariant), 0 shell-execution surfaces (TDR-0003 C-4 / PD-3 — throw, not `Result.err`; DM-8) | 1, 6 | AC-F12-1 / NFR-17 |
| TC-INTEGRATION-010 | Duplicate-UUID corpus → `computePlan` returns `err(DuplicateUuid)` at the orchestration boundary before any write (INV-SAFE-3) | 4, 6 | AC-F2-1 / NFR-3 |
| TC-INTEGRATION-011 | No secrets in output: 0 fake-token occurrences across Plan JSON, journal JSONL, `ApplyReport` JSON, every `version.message` (INV-SEC-1) | 6 | AC-F10-1 / NFR-8 |
| TC-GATE-001 | `bun run check` exits 0 (lint + format:check + typecheck + test + check:boundaries) | 8 | AC-Q-1 / NFR-18 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-23-spec.md | Spec |
| Test plan | ./chg-GH-23-test-plan.md | Test plan |
| Story file | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S6--sync-engine.md` | Story |
| `Repository` port (minimal git abstraction) | `src/domain/git/port.ts` | Code (new) |
| Repo-relative path/ref guard | `src/domain/git/paths.ts` | Code (new) |
| Shell-git adapter (TDR-0003) | `src/infra/git/shell-git.ts` | Code (new) |
| Cross-page link resolver | `src/domain/hierarchy/link-resolver.ts` | Code (new) |
| Journal writer + `replayJournal` | `src/app/journal.ts` | Code (new) |
| `computePlan` + `applyPlan` + `Plan`/`PlanEntry`/`ApplyReport` | `src/app/push-flow.ts` | Code (new) |
| `plan`/`sync` CLI shells | `src/cli/commands/plan.ts`, `src/cli/commands/sync.ts` | Code (updated) |
| Port factory (optional) | `src/app/ports.ts` | Code (new, optional) |
| Shell-git unit tests (path validation) | `tests/unit/infra/git/shell-git.test.ts` | Test (new) |
| Link-resolver unit tests (TC-UNIT-004) | `tests/unit/domain/hierarchy/link-resolver.test.ts` | Test (new) |
| Journal unit tests | `tests/unit/app/journal.test.ts` | Test (new) |
| `computePlan` unit tests (TC-UNIT-001/007) | `tests/unit/app/compute-plan.test.ts` | Test (new) |
| Provenance unit tests (TC-UNIT-002) | `tests/unit/app/provenance.test.ts` | Test (new) |
| Parent-first unit tests (TC-UNIT-003) | `tests/unit/app/parent-first.test.ts` | Test (new) |
| Secrets-safety unit tests (TC-UNIT-005/006) | `tests/unit/app/secrets-safety.test.ts` | Test (new) |
| Boundary negative tests (git + hierarchy) | `tests/unit/domain/git/boundary-negative.test.ts`, `tests/unit/domain/hierarchy/boundary-negative.test.ts` | Test (new) |
| Integration suite (TC-INTEGRATION-001..011) | `tests/integration/app/{apply-plan-integration,idempotency,crash-replay,per-doc-isolation,lock-property-atomicity,shell-git-safety-fuzz,duplicate-uuid-fatal,secrets-safety-integration}.test.ts` | Test (new) |
| Mock-target helper | `tests/_helpers/mock-target.ts` | Test (new) |
| ADR-0006 (state model — INV-SAFE-1/2/3, no cross-page transaction) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | Decision |
| ADR-0010 (squash provenance, bounded writes C-3) | `doc/decisions/ADR-0010-page-history-provenance.md` | Decision |
| TDR-0003 (shell-git behind `Repository`, C-4 injection controls) | `doc/decisions/TDR-0003-git-adapter.md` | Decision |
| Reused seams (DO NOT re-implement) | `src/domain/target/port.ts` (GH-21), `src/domain/state/{classifier,actions,sync-state,hashes,reconcile}.ts` (GH-22/GH-19), `src/app/{lock,branch,cache}.ts` (GH-19), `src/domain/identity/{duplicate-detector,frontmatter,document-id}.ts` (GH-18), `src/domain/markdown/{parse,mdast-to-hast}.ts` (GH-20), `src/infra/confluence/provenance.ts` (GH-21), `src/cli/output/command-result.ts` (GH-16) | Reused |
| Boundary-test pattern | `tests/unit/domain/state/boundary-negative.test.ts` (GH-22) | Reused |
| Crash-hook precedent | `src/infra/lock/store.ts` `armCrashAfterTempWrite` (GH-19) | Reused |
| House-style precedent | `chg-GH-22-plan.md`, `chg-GH-21-plan.md` | Plan precedent |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | plan-writer | Initial plan. Nine phases per the dependency lattice (spec §18 landing order): Phase 0 branch + baseline gate; Phase 1 `Repository` port + shell-git adapter + path guard (TDR-0003 C-4); Phase 2 cross-page link resolver (pure domain); Phase 3 journal writer + `replayJournal`; Phase 4 `computePlan` pure no-writes pipeline; Phase 5 `applyPlan` parent-first isolated journaled write path; Phase 6 integration suite (`Bun.serve()` mock target — INV-SAFE-1/2/3, 409-as-drift, idempotency, crash→replay, isolation, atomicity, shell-git fuzz); Phase 7 CLI wiring (`plan`/`sync` stubs → thin shells); Phase 8 final gate + boundary purity proof + doc handoff. Surfaced PD-1..PD-11: port residence (`src/domain/git/port.ts`); `readCommitted` returns bytes; shell-git injection controls + malicious-path throws (DM-8-compliant); app-tier `Create`/`NEW` (GH-22 untouched); test-only crash hook; parent-first topological sort; `ApplyReport` outcomes + aggregate counts; Conflict-as-drift no retry; REAL `formatVersionMessage` provenance wiring; minimal `--rebind`; Phase 8 dep-cruiser negative probes. Doc reconciliation (DEC-4 `worktreeStatus` drop, UL bindings, feature-spec tag, push-flow diagram) handed to lifecycle phase 7 — coder touches only `src/`, `tests/`, `.gitignore`. |
| 1.1 | 2026-07-12 | plan-writer | DoR iter-1 remediation (readiness-reviewer NOT_READY, finding 4). Surgical edits only — no phase/decision rewrite. (1) Phase 8.5 doc-handoff list: add the tier-reclassification of the `architecture-overview.md` §"Components / Core components" "Push executor" (line ~99) + "Lock/journal store" (line ~101) rows — the delivered `applyPlan` loop (`src/app/push-flow.ts`) + journal (`src/app/journal.ts`) are **application** tier (orchestration), while the shell-git adapter (`src/infra/git/`) + the lock atomic-write primitive (`src/infra/lock/store.ts`) STAY infrastructure. (2) Phase 8.5: add explicit reconciliation of the `readCommitted` interface-contract error column (`RefNotFound`/`BadPath` → throw per PD-3; no `Result` error arms per DM-8). (3) Confirm the carried-over `computePlan`/`applyPlan`/`resolveLink` interface-contract rows + the push-flow diagram *(realized — GH-23)* tag. (4) Phase 6: add TC-INTEGRATION-010 (`tests/integration/app/duplicate-uuid-fatal.test.ts` — INV-SAFE-3 at the `computePlan` boundary) + TC-INTEGRATION-011 (`tests/integration/app/secrets-safety-integration.test.ts` — INV-SEC-1 across Plan/journal/ApplyReport/`version.message`); strengthen TC-INTEGRATION-009 to assert a **throw** (not `Result.err`) matching PD-3. (5) Sync TC ranges (Context, Phase 6 title, Acceptance Criteria, Test Scenarios table, Artifacts, Execution Log) to TC-INTEGRATION-001..011. |

## Execution Log

> Populated during execution by `@coder`; the PM records the completion signal
> (commit) and the `bun run check` result per phase.

| Phase | Status | Started | Completed | Commit | `bun run check` | Notes |
|-------|--------|---------|-----------|--------|------------------|-------|
| 0 — branch + baseline gate | ⏳ | | | | | Setup only; verify reused contracts. |
| 1 — Repository port + shell-git adapter + path guard | ⏳ | | | | | F-4/DM-5/DM-6; path-validation unit tests; TDR-0003 C-4. |
| 2 — cross-page link resolver | ⏳ | | | | | F-5/DM-7; TC-UNIT-004; pure domain. |
| 3 — journal writer + replayJournal | ⏳ | | | | | F-3/DM-4; TC-INTEGRATION-006 prep. |
| 4 — computePlan use case | ⏳ | | | | | F-1/DM-1/DM-2; TC-UNIT-001/007; pure, 0 writes. |
| 5 — applyPlan use case | ⏳ | | | | | F-2/DM-3; TC-UNIT-002/003; parent-first + isolation + journal + provenance. |
| 6 — integration suite | ⏳ | | | | | TC-INTEGRATION-001..011; REAL classifier/reconcile; mock target. |
| 7 — CLI wiring | ⏳ | | | | | F-6; plan/sync stubs → thin shells; presentation-tier import discipline. |
| 8 — final gate + boundary proof + doc handoff | ⏳ | | | | | AC-Q-1; dep-cruiser negative probes (git + hierarchy); errors.ts unchanged; doc handoff to phase 7. |
