---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-24
  type: feat
  status: Proposed
  slug: concurrency-control
  title: "[MS2-E3-S7] Concurrency control — decentralized optimistic concurrency (operation-ID dedup, stale-plan expiry, 409 re-fetch-once policy, CI concurrency-group templates)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, reliability, concurrency, decentralization]
  version_impact: patch
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [MS2-E3-S4 (GH-21 Confluence adapter), MS2-E3-S6 (GH-23 sync engine)]
    external: [Confluence Cloud REST API (v2/v1 — 409 version-conflict gate, content properties)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver the decentralized optimistic-concurrency backstop that completes the safe-publish trust wedge — three pure domain gates (operation-ID freshness, stale-plan expiry, 409 re-fetch-once decision) wired into the existing `applyPlan` write path so that two overlapping CI runs on separate machines, with NO shared coordination service, can never let an older plan overwrite a newer one (NFR-REL-5 / NFR-REL-10, ADR-0006 C-5/C-6) — and document CI concurrency-group templates so users reduce overlap at the source.

## 1. SUMMARY

This is the **seventh and final story of epic MS2-E3 (Safe publish core)** — the concurrency capstone that closes the last aspirational capability listed in `feature-safe-publish.md` §3.1 ("Concurrency control"). The sync engine (GH-23) computes plans and applies them, surfaces a 409 `Conflict` as drift, and carries an `operationId` on every `Plan` — but it does not yet decide retry-vs-abort, deduplicate stale operations, or expire parked plans. Two overlapping CI runs on separate machines can still let an older plan's apply overwrite a newer plan's result. This change delivers the write-time defense-in-depth that closes that gap, with **no shared coordination service** (ADR-0006 C-6):

1. **Operation-ID dedup** — a pure domain gate `assertOperationFresh(planOperationId, remoteOperationId)` that compares the UUID-v7 time prefixes embedded in the operation ids; if the remote records a NEWER operation, the current plan is stale → `err(StalePlan)` for that document, no write. This catches the race where plan B (computed later) applies ahead of plan A (computed earlier).
2. **Stale-plan expiry** — a pure domain gate `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes)` that aborts a document whose plan is older than the configured window (default 15 min) at apply time → `err(StalePlan{expiredAt})`.
3. **409 re-fetch-once policy** — a pure domain decision function `decideOnConflict(conflict, refreshedRemoteState) → "reapply" | "block"`: on a `Conflict`, the engine re-fetches the remote page, re-classifies, and decides ONCE — if now safe (`LOCAL_AHEAD`/`NO_CHANGE`) → reapply; if still conflicting (`REMOTE_AHEAD`/`DIVERGED`) → block as drift. No retry loops.
4. **applyPlan wiring** — the three gates are wired into the existing `processEntry` write path (GH-23) before each document write, with per-document isolation: a `StalePlan` on one document aborts only that document, never the whole run.
5. **Test infrastructure** — the `FakeTarget` test helper is enhanced to serve a stored `marksync.metadata` property (so a two-runner overlap integration test can simulate runner B writing a newer operation-id that runner A then sees) and to simulate a 409-then-refreshed-remote sequence.
6. **CI concurrency-group templates** — documented GitHub Actions `concurrency:` snippets (group by target) so users reduce overlap at the source.

This change reuses every preceding contract without redefinition: the `applyPlan`/`processEntry` write path and the `Plan`/`ApplyReport` types (GH-23), the `TargetSystem` port `getProperty`/`getPage`/`updatePage` (GH-21), the pure `classify`/`actionFor`/`SyncState` (GH-22), the `MetadataProperty` with its `operationId` field (GH-19), and the `StalePlan` error arm (already in `MarkSyncError`). It introduces **no new `MarkSyncError` arms** — `StalePlan` was pre-staged for this story.

> **Invariant-naming note:** the GitHub Issue #24 body mislabels the overlapping-CI-plans invariant as "INV-SAFE-3". Per `id-prefix-catalog.md` and `nonfunctional.md`, **NFR-REL-5** = "Two overlapping CI plans never let the older overwrite the newer" (this story's primary AC) and **NFR-REL-10** = "Two runners on separate machines (no shared service) cannot silently overwrite" (decentralized variant). **INV-SAFE-3** = "Duplicate UUID is fatal before any write" (delivered in GH-18; unrelated to concurrency). This spec cites NFR-REL-5 / NFR-REL-10 throughout.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-23 (sync engine) is merged (5e1a1d8)** — the orchestration capstone that delivered `computePlan` (pure no-writes dry-run) + `applyPlan` (parent-first, per-document isolation, journaled write path) at `src/app/push-flow.ts`. The `Plan` type carries `{ runId, operationId, entries, provenance, warnings }`; `runId` = `generateUuidV7()` (UUID v7, time-sortable); `operationId` = `op_<runId>`. `applyPlan` processes each entry via `processEntry`, which on the `Update` branch calls `target.updatePage({ pageId, title, body, baseVersion, message })` and on a 409 `Conflict` returns `{ outcome: "blocked", error: Conflict }` — it does NOT retry (GH-23 DEC-6 explicitly deferred retry/dedup/stale-plan-expiry to E3-S7).
- **GH-21 (Confluence adapter) is merged (d53a8ff)** — the `TargetSystem` port (`getPage`/`createPage`/`updatePage`/`movePage`/`getProperty`/`putProperty`) and the `ConfluenceTarget` implementation. The 409 version-conflict response parses to a typed `Conflict { pageId, baseVersion, remoteVersion }`; `getProperty`/`putProperty` round-trip the `marksync.metadata` content property via v2 `PropertyService`.
- **GH-22 (drift classifier) is merged** — the pure `classify({ local?, base, remote }) → Result<SyncState, MarkSyncError>` producing the six `SyncState` values (`NO_CHANGE`/`LOCAL_AHEAD`/`REMOTE_AHEAD`/`DIVERGED`/`REMOTE_MISSING`/`LOCAL_MISSING`) and `actionFor(state, ctx) → Action` (`NoOp`/`Update`/`Block`/`Skip`).
- **The `StalePlan` error arm is pre-staged.** `src/domain/errors.ts` line 50 defines `{ kind: "StalePlan"; operationId: string; expiredAt: string }`, already named in `assertNeverMarkSyncError` (line 148). No error-model change is required.
- **The `operationId` field is already on `Plan`, `PageBinding`, and `MetadataProperty`.** `Plan.operationId` is set by `computePlan` (`op_<runId>`). `PageBinding.operationId` is stamped on every create/update in `processEntry`. `MetadataProperty.operationId` (reconcile.ts) is serialized into `marksync.metadata` via `bindingToProperty` and put via `target.putProperty`. So the remote content property already records the last-applied operation id — the dedup comparison has its inputs.
- **The `sync.stalePlanMinutes` config is wired.** `SyncConfig.stalePlanMinutes: number` (types.ts) with default `15` applied in `applyDefaults` (config.ts line 143). The schema (`schema.json`) validates it. No config change is required.
- **The UUID v7 generator is delivered.** `generateUuidV7()` (uuid.ts, via the `uuid` package's `v7()`) mints time-sortable ids; `runId` already uses it. The operation-id ordering therefore reuses the embedded timestamp — no separate clock.
- **The `FakeTarget` test helper has a `getProperty` stub that always returns `undefined`.** `tests/_helpers/fake-target.ts` line 182 — it cannot yet simulate runner B writing a newer operation-id that runner A reads. The two-runner overlap integration test (NFR-REL-5/NFR-REL-10) requires this to be enhanced.
- **ADR-0006 C-5/C-6 is the load-bearing decision** — `Accepted`. C-5: two overlapping CI plans must never let the older overwrite the newer. C-6: decentralized — no shared coordination service; all exchange lives in Git (committed lock) + Confluence (409 + content properties). The decision's "Concurrency control (C-5)" section specifies the mechanism: Confluence 409 on stale `version.number` + operation-ID dedup + stale-plan expiry + CI concurrency-group templates. Its Implementation Plan item 4 is "Concurrency control implemented in the push executor."
- **`feature-safe-publish.md` §3.1 lists "Concurrency control" as the last aspirational capability** (no `*(delivered — …)*` tag, unlike every other §3.1 bullet). This change makes it delivered.

### 2.2 Pain Points / Gaps

- **No operation-ID dedup exists.** The `operationId` is carried on the `Plan`, stamped into `PageBinding` and `marksync.metadata`, and put on every write — but nothing READS the remote `marksync.metadata.operationId` to detect that a newer plan already applied. Two overlapping CI runs where plan B (later) applies before plan A (earlier): A's `updatePage` carries A's older `baseVersion`, so Confluence's 409 catches the stale version. But if A's `baseVersion` happens to still match (e.g. B created a new page A also targets, or the version window aligns), A could overwrite B's result. The operation-id comparison is the gate that closes this regardless of version alignment.
- **No stale-plan expiry exists.** A plan computed 30 minutes ago and parked (CI queue, human review) still applies as if fresh. If the remote advanced in the interim via a legitimate edit, the plan's stale `baseVersion` triggers a 409 (caught), but if the remote was reset or the plan is simply too old to trust, there is no time-based abort. The `stalePlanMinutes` config exists but nothing reads it at apply time.
- **The 409 policy is "block, no retry" — but the story owns the policy refinement.** GH-23 DEC-6 deferred retry-vs-abort to this story. The current behavior (block on `Conflict`) is safe (no overwrite) but not optimal: a transient 409 where the remote is actually now-safe-after-refresh is permanently blocked instead of reapplied once. The story delivers the defined policy: re-fetch + re-classify ONCE; reapply if now safe, block if still conflicting.
- **`FakeTarget.getProperty` cannot simulate two-runner overlap.** It always returns `undefined`, so the dedup check has no remote operation-id to compare against in tests. The NFR-REL-5/NFR-REL-10 integration tests require a fake that serves a stored `marksync.metadata` and can model two separate runner instances sharing state through a common backing map.
- **No CI concurrency-group templates exist.** Users have no documented guidance to reduce overlapping CI runs at the source (GitHub Actions `concurrency:` groups). ADR-0006 names this as a complementary control; it does not yet exist as an artifact.
- **`feature-safe-publish.md` §3.1 "Concurrency control" is aspirational.** Every other §3.1 capability bullet carries a `*(delivered — GH-NN)*` tag. This one does not — it is the last undelivered capability of the safe-publish feature.

## 3. PROBLEM STATEMENT

Because the sync engine (GH-23) computes plans and applies them but does not read the remote operation-id, does not expire stale plans, and blocks unconditionally on 409 without a re-fetch policy, two overlapping CI runs on separate machines — with no shared coordination service — can still let an older plan's apply overwrite a newer plan's result in the version-alignment race window, a parked plan can apply hours later as if fresh, and a transient 409 is permanently blocked instead of reapplied once — which means the decentralized concurrency guarantee (NFR-REL-5: older plan never overwrites newer; NFR-REL-10: no shared service, 409 + dedup) that ADR-0006 C-5/C-6 commits to and that `feature-safe-publish.md` §3.1 lists as a core capability has its mechanism pre-staged (the `StalePlan` error arm, the `operationId` field, the `stalePlanMinutes` config) but no enforcement logic, so this story must deliver the pure domain gates (operation-freshness comparison, stale-plan expiry check, 409 re-fetch-once decision), wire them into the existing `applyPlan` write path with per-document isolation, enhance the test fake to simulate two-runner overlap, and document CI concurrency-group templates, before the safe-publish feature's concurrency capability can be marked delivered.

## 4. GOALS

- **G-1**: Deliver the pure operation-freshness gate `assertOperationFresh` — compare the plan's operation id against the remote `marksync.metadata.operationId` via the embedded UUID-v7 time prefix; if the remote is newer → `err(StalePlan)` (F-1).
- **G-2**: Deliver the pure stale-plan-expiry gate `assertPlanNotExpired` — if the plan's embedded timestamp exceeds `stalePlanMinutes` at apply time → `err(StalePlan{expiredAt})` (F-2).
- **G-3**: Deliver the pure 409 decision policy `decideOnConflict` — given a `Conflict` and the refreshed remote state, decide `reapply` or `block` (F-3).
- **G-4**: Wire the three gates into `applyPlan`/`processEntry` before each document write, with per-document isolation (a `StalePlan` aborts only that document); on `Conflict`, re-fetch + re-classify ONCE and honor `decideOnConflict` (F-4).
- **G-5**: Enhance `FakeTarget` to serve a stored `marksync.metadata` property and simulate a 409-then-refreshed sequence, enabling the two-runner overlap integration tests (F-5).
- **G-6**: Deliver documented CI concurrency-group templates (valid YAML) so users reduce overlap at the source (F-6).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| concurrency safety (NFR-REL-5) | two overlapping plans against a shared-state target: B (newer op-id) succeeds; A (older op-id) sees B's operation-id in the remote property → A aborts with `StalePlan`, **0 overwrites** |
| decentralized concurrency (NFR-REL-10) | same scenario with NO shared service between runners (separate fake-target instances, shared backing map) → still safe; **0 silent overwrites** |
| stale-plan expiry | a plan whose embedded timestamp is > `stalePlanMinutes` ago at apply time → `StalePlan{expiredAt}`; boundary at exactly the window is expired |
| 409 single retry | on `Conflict` → re-fetch + re-classify ONCE; if now safe → reapply; if still `REMOTE_AHEAD`/`DIVERGED` → block; **max 1 re-fetch, max 1 reapply**, no loops |
| per-document isolation | a `StalePlan` on doc A → doc B still applies; the run does not abort |
| CI templates | concurrency-group templates exist, are documented, and are valid YAML |
| no secrets in output (NFR-SEC-1 / INV-SEC-1) | **0** credential/token occurrences in any apply output path (the operation-id carries no secret material) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: Pessimistic leasing / git-ref locks — rejected by ADR-0006 C-6 for MS-0002 (optimistic concurrency only; at ≤500 pages / ≤10 runners the 409-retry rate is manageable; pessimistic leasing adds crash-recovery complexity for no additional safety).
- **NG-2**: Distributed lock services — rejected by ADR-0006 C-6 (no shared coordination service; all exchange lives in Git + Confluence).
- **NG-3**: Retrying a 409 more than once — explicitly rejected (write-storm risk; ADR-0010 C-3 spirit). The policy is re-fetch + re-classify ONCE, then block.
- **NG-4**: Reverse-sync conflict resolution — MS-0004+. This story is one-way (Git → Confluence).
- **NG-5**: BDD / E2E live-tenant wiring — E5-S1 owns the Gherkin NFR-REL-5 scenario and the live-sandbox wiring. This story's AC are verified via integration tests against the enhanced fake target.
- **NG-6**: Reimplementing `classify`/`actionFor`, the `TargetSystem` port, `applyPlan`/`computePlan`, or any preceding contract — all consumed as-is. No new `MarkSyncError` arms.
- **NG-7**: Enforcing CI concurrency groups in-code — the templates are guidance artifacts (YAML + docs), not runtime enforcement. Users opt in by copying them into their workflows.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Operation-freshness gate (`assertOperationFresh`) | The pure domain comparison that detects a stale plan: if the remote `marksync.metadata.operationId` records a newer operation (by UUID-v7 time prefix) than the plan's, the plan is stale → `StalePlan`. Decentralized — needs no shared service, only the remote content property that Confluence already stores. |
| F-2 | Stale-plan expiry gate (`assertPlanNotExpired`) | The pure domain time check: a plan older than `stalePlanMinutes` at apply time is expired → `StalePlan{expiredAt}`. Prevents a long-parked plan from overwriting newer state. |
| F-3 | 409 conflict decision policy (`decideOnConflict`) | The pure domain decision: on `Conflict`, after re-fetching + re-classifying, decide `reapply` (now safe) or `block` (still conflicting). Unit-testable; no retry loop. |
| F-4 | `applyPlan` concurrency wiring | Wire F-1/F-2/F-3 into the existing `processEntry` write path (GH-23) before each document write, with per-document isolation. On `Conflict`, re-fetch ONCE, re-classify, honor `decideOnConflict`. |
| F-5 | Two-runner overlap test infrastructure | Enhance `FakeTarget` to serve a stored `marksync.metadata` property and simulate a 409-then-refreshed sequence, enabling the NFR-REL-5/NFR-REL-10 integration tests. |
| F-6 | CI concurrency-group templates | Documented GitHub Actions `concurrency:` snippets (group by target) so users reduce overlap at the source. Guidance, not runtime enforcement. |

### 5.1 Capability Details

- **F-1 (`assertOperationFresh`).** A pure domain function `assertOperationFresh(planOperationId: string, remoteOperationId: string | undefined): Result<void, MarkSyncError>` that compares two operation ids of the form `op_<uuid-v7>`. The ordering derives from the UUID-v7 time-sortable prefix embedded in each id (the `runId` is a UUID v7; `operationId` = `op_<runId>`). If the remote operation id is **newer** than the plan's (by embedded timestamp comparison), the plan is stale → `err({ kind: "StalePlan"; operationId: planOperationId; expiredAt: "" })`. If the remote is absent (no prior operation recorded) or older/equal, the plan is fresh → `ok`. The comparison uses the time prefix only — no separate clock, no network call (the caller supplies the remote value). This is the decentralized dedup: two runners need no shared service, only the Confluence content property that `applyPlan` already writes.

- **F-2 (`assertPlanNotExpired`).** A pure domain function `assertPlanNotExpired(planTimestamp: number, now: number, stalePlanMinutes: number): Result<void, MarkSyncError>` that checks whether the plan's age exceeds the configured window. If `now - planTimestamp > stalePlanMinutes * 60_000`, the plan is expired → `err({ kind: "StalePlan"; operationId: ""; expiredAt: <iso> })` where `expiredAt` is the ISO timestamp at which the plan crossed the boundary. Otherwise → `ok`. The `planTimestamp` is derived from the plan's identity (the `runId`'s embedded UUID-v7 timestamp, OR an explicit `createdAt` field — see OQ-1). The window default is 15 min (already configured). Boundary semantics: a plan exactly at the window is expired (conservative).

- **F-3 (`decideOnConflict`).** A pure domain function `decideOnConflict(conflict: Conflict, refreshedRemoteState: SyncState): Decision` where `Decision = "reapply" | "block"`. Policy: after the engine re-fetches the remote page (via `target.getPage`) and re-classifies it (via `classify` against the plan's local + base), the resulting `SyncState` determines the decision — `LOCAL_AHEAD` or `NO_CHANGE` → `"reapply"` (the remote is now safe to update); `REMOTE_AHEAD` or `DIVERGED` → `"block"` (the remote advanced; the write is drift). This is a pure mapping over the existing `SyncState` enum (GH-22) — fully unit-testable over the full state matrix. No retry loop: the caller re-applies at most once on `"reapply"`, blocks on `"block"`.

- **F-4 (`applyPlan` concurrency wiring).** The existing `processEntry` function (GH-23) is extended at the `Update` branch: (1) **before the write**, fetch the remote `marksync.metadata` property via `target.getProperty`, parse its `operationId`, and run `assertOperationFresh` + `assertPlanNotExpired`; on either failure, return `{ outcome: "blocked", error: StalePlan }` for that document (per-document isolation — the run continues to other documents); (2) **on `Conflict`** from `target.updatePage`, re-fetch the remote page via `target.getPage`, re-classify via `classify`, call `decideOnConflict`; if `"reapply"` → re-apply the update ONCE with the refreshed base version; if `"block"` → record as blocked with the drift error. The `Create` branch runs the stale-plan-expiry check (a stale create is still stale) but not the operation-freshness check (a new page has no prior operation id). Max one re-fetch, max one reapply per document — no loops.

- **F-5 (Two-runner overlap test infrastructure).** The `FakeTarget` class (`tests/_helpers/fake-target.ts`) is enhanced: (1) `getProperty` serves a stored `marksync.metadata` value (so the dedup check reads a real remote operation-id); `putProperty` persists it (so runner B's write is visible to runner A); (2) a shared backing-map constructor option allows two separate `FakeTarget` instances to model two runners on separate machines sharing state through Confluence (NFR-REL-10); (3) a configurable 409-then-refreshed sequence supports the `decideOnConflict` integration test (first `updatePage` → `Conflict`, then after a `getPage` re-fetch the remote has advanced, and a second `updatePage` with the correct base version succeeds). This is test infrastructure only — no production code path depends on `FakeTarget` internals.

- **F-6 (CI concurrency-group templates).** Documented GitHub Actions `concurrency:` YAML snippets that group runs by target (so two pushes to the same target cancel-or-queue rather than overlap), placed under `examples/ci/` with a short README explaining the group-key strategy and the cancel-in-progress tradeoff. These are guidance artifacts (valid YAML, human-readable docs) — not runtime code, not enforced by MarkSync. The story file permits `docs/guides/` or `examples/ci/`; `examples/ci/` is chosen to keep runnable snippets separate from prose guides.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Operation-freshness gate (before each Update write — NFR-REL-5):
  processEntry(entry, Update):
    target.getProperty(pageId, "marksync.metadata") → propertyJson | undefined
    parse propertyJson → { operationId: remoteOpId, ... } | undefined
    assertOperationFresh(plan.operationId, remoteOpId)
      → ok                                            (fresh: proceed to write)
      → err(StalePlan)                                (stale: block THIS doc, continue run)

Flow 2 — Stale-plan expiry gate (before each write — create or update):
  assertPlanNotExpired(planTimestamp, Date.now(), config.sync.stalePlanMinutes)
    → ok                                              (fresh: proceed)
    → err(StalePlan{expiredAt})                       (expired: block THIS doc, continue run)

Flow 3 — 409 re-fetch-once policy (on Conflict from updatePage — F-3/F-4):
  target.updatePage(...) → err(Conflict)
    → target.getPage(pageId) → refreshed page         (ONE re-fetch)
    → classify({ local: plan.hashes, base, remote: refreshed }) → refreshed SyncState
    → decideOnConflict(conflict, refreshedState)
        LOCAL_AHEAD / NO_CHANGE → "reapply":
            target.updatePage({ ..., baseVersion: refreshed.version }) → ONCE
              success → journal → update binding → saveLock → putProperty
              Conflict (again) → block (no second retry)
        REMOTE_AHEAD / DIVERGED → "block":
            { outcome: "blocked", error: Conflict }   (drift; no overwrite)

Flow 4 — Two-runner overlap (NFR-REL-5 / NFR-REL-10 — the integration test):
  Runner A: computePlan at T1 → operationId op_<runId-A> (UUID v7 @ T1)
  Runner B: computePlan at T2 (T2 > T1) → operationId op_<runId-B> (UUID v7 @ T2)
  Runner B applies first: updatePage succeeds → putProperty records op_<runId-B>
  Runner A applies: getProperty reads op_<runId-B>
    assertOperationFresh(op_<runId-A>, op_<runId-B>)
      remote (T2) is newer than plan (T1) → err(StalePlan)
    → A blocks THAT doc, no overwrite
  (decentralized: A and B share no service — only the Confluence content property)

Flow 5 — Per-document isolation under StalePlan:
  doc A: assertOperationFresh → err(StalePlan)  → blocked, continue
  doc B: assertOperationFresh → ok              → update succeeds
  doc C: assertPlanNotExpired → err(StalePlan)  → blocked, continue
  → ApplyReport: { A: blocked(StalePlan), B: updated, C: blocked(StalePlan) } — run did NOT abort
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `assertOperationFresh(planOperationId, remoteOperationId): Result<void, MarkSyncError>` — pure domain gate (F-1).
- `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes): Result<void, MarkSyncError>` — pure domain gate (F-2).
- `decideOnConflict(conflict, refreshedRemoteState): Decision` — pure domain decision function + `Decision` type (F-3).
- `applyPlan`/`processEntry` wiring: operation-freshness + stale-plan-expiry before each write; 409 re-fetch-once policy on `Conflict` (F-4).
- The plan-timestamp anchoring (extract from `runId` UUID-v7 prefix, or add explicit `createdAt` — OQ-1) consumed by `assertPlanNotExpired`.
- `FakeTarget` enhancement: stored `marksync.metadata` property, shared backing-map option, 409-then-refreshed sequence (F-5).
- CI concurrency-group templates under `examples/ci/` + README (F-6).
- Unit tests: operation-id ordering (older vs newer, equal, absent remote); stale-plan expiry boundary (at/over/under the window); `decideOnConflict` reapply-vs-block matrix.
- Integration tests: two-runner overlap against a shared-state fake target (B wins, A aborts with `StalePlan`, no overwrite — NFR-REL-5); same scenario with no shared service (separate instances, shared backing map — NFR-REL-10); 409 re-fetch+reclassify path (reapply when now-safe, block when still-conflicting).

### 7.2 Out of Scope

- [OUT] Pessimistic leasing / git-ref locks — rejected by ADR-0006 C-6 for MS-0002 (NG-1).
- [OUT] Distributed lock services — rejected by ADR-0006 C-6 (NG-2).
- [OUT] Retrying a 409 more than once — rejected (write-storm risk, ADR-0010 C-3 spirit) (NG-3).
- [OUT] Reverse-sync conflict resolution — MS-0004+ (NG-4).
- [OUT] BDD / E2E live-tenant wiring — E5-S1 owns the Gherkin NFR-REL-5 scenario + live-sandbox (NG-5).
- [OUT] Reimplementing `classify`/`actionFor`, the `TargetSystem` port, `applyPlan`/`computePlan`, or any preceding contract (NG-6).
- [OUT] New `MarkSyncError` arms — `StalePlan` is pre-staged; no error-model change.
- [OUT] In-code enforcement of CI concurrency groups — the templates are guidance artifacts, not runtime enforcement (NG-7).

### 7.3 Deferred / Maybe-Later

- **Pessimistic leasing** — revisit only if CI concurrency proves unachievable with optimistic 409 + dedup alone (ADR-0006 revisit trigger). Not needed at ≤500 pages / ≤10 runners.
- **Retry > 1 on 409** — revisit if the single re-fetch+reclassify policy proves too conservative for real CI overlap rates (monitor the block rate post-MS-0002).
- **Commit-by-commit operation-id granularity** — operation ids are per-run (squash) for MS-0002; commit-by-commit sync (ADR-0010 future milestone) would carry per-commit operation ids.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — the concurrency gates issue no HTTP calls directly. All remote access flows through the existing `TargetSystem` port: `getProperty` (read the remote `marksync.metadata.operationId`), `getPage` (re-fetch on 409), `updatePage` (the gated write + the one reapply), `putProperty` (already records the operation id on every successful write — unchanged from GH-23). The Confluence adapter (GH-21) owns the REST v2/v1 distinctions.

### 8.2 Events / Messages

No event bus in MS-0002. The conceptual signals — **Stale Operation Detected** (operation-freshness gate failed), **Plan Expired** (stale-plan-expiry gate failed), **Conflict Re-classified** (409 re-fetch produced a fresh `SyncState`) — are realized as typed values: the `StalePlan` error arm in the `ApplyReport.results[].error` channel, and the `Decision` value consumed internally by `processEntry`. The `ApplyReport` (GH-23) already carries per-entry `{ outcome, error? }` — the `StalePlan` errors surface there with no schema change.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `assertOperationFresh` (NEW, domain/state) | Pure function signature: `(planOperationId: string, remoteOperationId: string \| undefined) → Result<void, MarkSyncError>`. Compares UUID-v7 time prefixes embedded in `op_<uuid-v7>` ids. Returns `err(StalePlan)` if the remote is newer. |
| DM-2 | `assertPlanNotExpired` (NEW, domain/state) | Pure function signature: `(planTimestamp: number, now: number, stalePlanMinutes: number) → Result<void, MarkSyncError>`. Returns `err(StalePlan{expiredAt})` if plan age exceeds the window. |
| DM-3 | `decideOnConflict` + `Decision` (NEW, domain/state) | Pure function signature: `(conflict: Conflict, refreshedRemoteState: SyncState) → Decision` where `Decision = "reapply" \| "block"`. Maps the refreshed `SyncState` to a reapply-vs-block decision. |
| DM-4 | Plan-timestamp anchoring (OQ-1) | `assertPlanNotExpired` needs a plan timestamp. The `runId` (UUID v7) embeds one (extractable); alternatively an explicit `createdAt: string` (ISO) is added to `Plan`. Decision deferred to the plan-writer (OQ-1). Either way, the `Plan` type gains a derived/stamped timestamp the expiry check consumes — an additive field or a pure derivation, not a breaking change. |
| DM-5 | `FakeTarget` test infrastructure (ENHANCED, tests) | `getProperty` serves a stored `marksync.metadata` value; `putProperty` persists it; a shared backing-map constructor option models two runners; a configurable 409-then-refreshed sequence supports the `decideOnConflict` integration test. Test-only — no production dependency. |
| DM-6 | CI concurrency-group templates (NEW, examples/ci) | GitHub Actions `concurrency:` YAML snippets + README. Guidance artifacts, not runtime code. |
| DM-7 | Error model — **no change** | `StalePlan { operationId: string; expiredAt: string }` is pre-staged (errors.ts:50, in `assertNeverMarkSyncError`). No new arms; `assertNeverMarkSyncError` untouched. |

### 8.4 External Integrations

- **Confluence Cloud REST API (v2/v1)** — accessed exclusively through the existing `TargetSystem` port (GH-21). The concurrency gates call `getProperty` (read `marksync.metadata.operationId`), `getPage` (re-fetch on 409), and `updatePage` (the gated write + the one reapply). No direct REST calls; no new endpoints. The 409 version-conflict response (already parsed to `Conflict` by GH-21) is the hard gate; the operation-id dedup is the application-level gate that catches races the version check might miss.
- **GitHub Actions (guidance only)** — the CI concurrency-group templates target the GitHub Actions `concurrency:` key. These are documentation artifacts; MarkSync does not invoke GitHub APIs.

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story is **additive**: new pure domain functions (`assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict`), new wiring inside the existing `processEntry` (no signature change to `applyPlan`/`computePlan`), an enhanced test helper (test-only), and new guidance artifacts. The `Plan` type may gain a timestamp field/derivation (OQ-1) — additive. No existing public signature changes. The `TargetSystem` port, `classify`/`actionFor`/`SyncState`, `applyPlan`/`processEntry`, `MetadataProperty`, and the `MarkSyncError` union are all **unchanged** (the `StalePlan` arm already exists). The architecture-overview "Push executor" row is updated to note the concurrency wiring (phase-7 doc-sync).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | concurrency safety (NFR-REL-5) | two overlapping plans against a shared-state target: B (newer op-id) succeeds; A (older op-id) aborts with `StalePlan`; **0 overwrites** |
| NFR-2 | decentralized concurrency (NFR-REL-10) | same scenario with NO shared service (separate fake instances, shared backing map) → still safe; **0 silent overwrites** |
| NFR-3 | stale-plan expiry window | a plan whose embedded timestamp is > `stalePlanMinutes` (default 15) ago at apply time → `StalePlan{expiredAt}`; boundary at exactly the window is expired |
| NFR-4 | 409 single retry | on `Conflict` → re-fetch + re-classify ONCE; **max 1 re-fetch, max 1 reapply**; no retry loops |
| NFR-5 | per-document isolation | a `StalePlan` on doc A → doc B still applies; the run does not abort |
| NFR-6 | no secrets in output (NFR-SEC-1 / INV-SEC-1) | **0** credential/token occurrences in any apply output path (the operation-id is `op_<uuid-v7>` — no secret material) |
| NFR-7 | pure-domain testability | `assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict` are pure (zero infrastructure imports under `src/domain/state/`); fully unit-testable without a target |
| NFR-8 | adapter isolation (NFR-MAINT-1) | all Confluence REST distinctions stay behind the `TargetSystem` port; the domain gates never see REST details |
| NFR-9 | CI template validity | concurrency-group templates are valid YAML and documented |
| NFR-10 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 / NFR-PRIV-1 — no outbound data except the configured Confluence target). Observability is structural and reuses the GH-23 contracts:

- **`CommandResult<ApplyReport>`** — the structured JSON envelope. The `ApplyReport.results[]` entries now carry `StalePlan` errors for stale/expired documents, and `Conflict` errors for blocked drift. The aggregate `blocks` count (GH-23) is the concurrency-event assertion point. A run with overlapping CI plans produces a non-zero `blocks` count with `StalePlan` errors — the operator-visible signal.
- **Stable exit codes (NFR-OBS-1)** — `StalePlan` maps to the established exit-code mapping (a blocked-but-not-fatal outcome; the run continues). The `ApplyReport` distinguishes per-document blocks from run-level failures.
- **Journal as audit trail** — the existing `.marksync/journal/<run-id>.jsonl` (GH-23) records only successful mutations (`op`/`pageId`/`uuid`/`outcome`); a `StalePlan` block produces no journal entry (no write occurred), which is itself the evidence that no overwrite happened.
- **`version.message` provenance** — unchanged from GH-23; the operation-id is not surfaced in Confluence page history (it lives in `marksync.metadata`, the content-property cross-check).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Clock skew between runners mis-orders operation ids (a runner with a skewed clock mints an older op-id and appears stale, or a newer op-id and races ahead) | H | L | Defense in depth (story R1): the operation id embeds a UUID-v7 time prefix; the remote property is the source of truth; AND a truly-skewed older write is still 409-rejected by Confluence's `version.number` check. Two independent gates (operation-id + version) must both fail for an overwrite. AC-F1-1 asserts the operation-id gate; the version gate is GH-23 AC-F3-1. | L |
| RSK-2 | The 409 re-fetch path adds a second `getPage` call on conflict — extra Confluence API cost | L | M | Acceptable at target scale (≤500 pages / ≤10 runners; conflicts are rare). The re-fetch happens only on `Conflict` (already a blocked outcome in GH-23), and at most once per conflicting document. No retry loop. | L |
| RSK-3 | The plan-timestamp anchoring couples expiry to the `runId` format (extracting from UUID v7) or adds an explicit field (OQ-1) — a minor design coupling | L | M | Both options are additive and non-breaking. Extracting from the UUID-v7 prefix reuses the existing time-sortable property (no new field); an explicit `createdAt` is clearer but adds a field. The plan-writer resolves OQ-1; either choice is isolated to the expiry gate. | L |
| RSK-4 | Repeated 409 retries cause a write storm if multiple runners hammer the same page | H | L | Explicitly rejected (NG-3): the policy is re-fetch + re-classify ONCE, then block. Max 1 re-fetch + 1 reapply per document per run. ADR-0010 C-3 spirit (minimal writes, burst-limit safety). AC-F3-2 asserts the single-retry boundary. | L |
| RSK-5 | The operation-freshness check reads `marksync.metadata` via `getProperty` before every Update — extra API call per document | L | M | Acceptable: `getProperty` is a single content-property read (cheap, spike-validated ~8 KB round-trip). It fails fast on a stale plan (avoids a wasted `updatePage` + 409). The check runs only on the `Update` branch (not `NoOp`/`Skip`/`Block`/`Create`-without-prior-op). | L |
| RSK-6 | A `StalePlan` on one document is mistaken for a run-level failure, aborting the whole sync | M | L | Per-document isolation (F-4): `processEntry` returns `{ outcome: "blocked", error: StalePlan }` for that document and the run continues — mirroring GH-23's existing `Conflict`/`RemoteMissing` isolation. AC-F4-1 asserts doc A blocks + doc B applies. | L |

## 12. ASSUMPTIONS

- ADR-0006 C-5/C-6 is settled (`Accepted`) and being **implemented**. The decentralized optimistic-concurrency model (409 + operation-ID dedup + stale-plan expiry, no shared service) is the load-bearing decision; this story is its Implementation Plan item 4.
- GH-23 (sync engine) and GH-21 (Confluence adapter) are merged and their contracts are stable. This story consumes them as-is: `applyPlan`/`processEntry` (GH-23), `TargetSystem.getProperty`/`getPage`/`updatePage`/`putProperty` (GH-21), `classify`/`SyncState` (GH-22).
- The `StalePlan` error arm, the `operationId` field (on `Plan`/`PageBinding`/`MetadataProperty`), the `sync.stalePlanMinutes` config (default 15), and the UUID-v7 generator are all pre-staged and verified present — no new error arm, no config change, no identity change is required.
- The `runId` is a UUID v7 (time-sortable) and `operationId` = `op_<runId>`; the embedded timestamp is the ordering basis for both operation-freshness and (optionally) stale-plan expiry.
- The concurrency gates are invoked **only for the one-way push flow** (Git → Confluence) at apply time. Reverse sync is MS-0004+ (NG-4).
- The NFR-REL-5 BDD/E2E wiring is E5-S1's responsibility (NG-5); this story's AC are verified via integration tests against the enhanced fake target.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S4 (GH-21 Confluence adapter) | `TargetSystem` port (`getPage`/`updatePage` → `Conflict`/`getProperty`/`putProperty`), `ConfluenceTarget` adapter, 409 version-conflict parsing. Merged (d53a8ff). |
| Depends on | MS2-E3-S6 (GH-23 sync engine) | `computePlan`/`applyPlan`/`processEntry`, `Plan`/`ApplyReport` types (with `operationId`), the write path where the gates wire in. Merged (5e1a1d8). |
| Depends on | ADR-0006 | Load-bearing: C-5 (older never overwrites newer), C-6 (decentralized — no shared service), the "Concurrency control (C-5)" mechanism (409 + dedup + expiry + CI templates), Implementation Plan item 4. |
| Depends on | MS2-E3-S5 (GH-22 drift classifier) | `classify`/`SyncState` — re-used by `decideOnConflict` for the refreshed re-classification. Merged. |
| Depends on | MS2-E3-S2 (GH-19 state manager) | `MetadataProperty` (with `operationId`), `reconcileWithProperty`. Merged. |
| Reuses | `StalePlan` error arm (errors.ts, pre-staged) | `{ kind: "StalePlan"; operationId; expiredAt }` — already in `assertNeverMarkSyncError`. No error-model change. |
| Reuses | `sync.stalePlanMinutes` config (config.ts/types.ts, pre-staged) | Default 15. Consumed by `assertPlanNotExpired`. No config change. |
| Reuses | `generateUuidV7` (uuid.ts, GH-18/23) | `runId` is already a UUID v7; the operation-id ordering reuses its time prefix. |
| Blocks | E5-S1 (BDD + E2E) | Wires the NFR-REL-5 Gherkin scenario + live-sandbox against the delivered concurrency gates. |
| Blocks | feature-safe-publish §3.1 "Concurrency control" | Marked `*(delivered — GH-24)*` after this lands (phase-7 doc-sync). |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the stale-plan-expiry timestamp be extracted from the `runId` (UUID v7 time prefix) or added as an explicit `createdAt: string` (ISO) field on `Plan`? | `assertPlanNotExpired` needs a plan timestamp. The `runId` is a UUID v7 whose prefix encodes a millisecond timestamp — extractable via a pure function. This avoids adding a field but couples expiry to the runId format. Alternatively, an explicit `createdAt` is clearer and decoupled but adds a field to `Plan` (additive, non-breaking). Both are viable; the difference is cosmetic (clarity vs. zero-new-fields). | **Minor design decision — defer to plan-writer.** Either choice satisfies the AC (the expiry boundary test is agnostic to the source). Recommend: extract from `runId` if a clean extractor exists (zero new fields, reuses the time-sortable property); else add `createdAt`. No `@decision-advisor` escalation needed — both options are additive and within the story's settled constraints. |

> No question requires `@decision-advisor` escalation: ADR-0006 C-5/C-6 is settled; the `StalePlan` arm, `operationId` field, `stalePlanMinutes` config, and UUID-v7 generator are all pre-staged; the 409 single-retry policy and the no-pessimistic-leasing decision are CEO-confirmed in the story file (R1/Q1). OQ-1 is a minor implementation choice with no architectural impact.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Optimistic concurrency only — no pessimistic leasing / git-ref locks for MS-0002.** | ADR-0006 C-6: no shared coordination service; all exchange lives in Git (lock) + Confluence (409 + content properties). At ≤500 pages / ≤10 concurrent runners, the 409-retry rate is manageable; pessimistic leasing adds crash-recovery complexity for no additional safety. Two overlapping CI plans can never let the older overwrite the newer because (a) the operation-id dedup aborts the stale plan before writing, and (b) Confluence's 409 rejects any stale-version write that slips past. | 2026-07-12 |
| DEC-2 | **On 409 `Conflict`: re-fetch + re-classify ONCE, then block. No retry loop.** | Story Q1 (CEO-confirmed): MS-0002 policy is re-fetch+reclassify ONCE then block; repeated retry risks write storms (ADR-0010 C-3 spirit — minimal writes, burst-limit safety). A single re-fetch catches the transient case (remote advanced but is now safe after refresh); blocking on a still-conflicting re-classification preserves INV-SAFE-1 (no silent overwrite). | 2026-07-12 |
| DEC-3 | **Operation-id ordering uses the UUID-v7 time prefix embedded in the `runId` — no separate clock.** | Story R1 / technical approach: the `runId` is a UUID v7 (time-sortable); `operationId` = `op_<runId>`. Comparing the embedded timestamps gives a total order with no separate clock source and no additional Confluence API call (the remote operation-id is already in `marksync.metadata`). Defense in depth: clock skew is backstopped by Confluence's `version.number` 409 (RSK-1). | 2026-07-12 |
| DEC-4 | **Stale-plan expiry default = 15 minutes (`sync.stalePlanMinutes`, already configured).** | ADR-0006 "Concurrency control (C-5)": "a plan unapplied beyond a configurable window (default 15 min) is treated as stale." The config was pre-staged in GH-15 with default 15. This story wires the gate that reads it. The window is operator-tunable; the boundary semantics are conservative (exactly-at-window = expired). | 2026-07-12 |
| DEC-5 | **`decideOnConflict` is a pure function returning `Decision = "reapply" \| "block"`.** | Story technical approach: a pure `(conflict, refreshedRemote) => Decision` is fully unit-testable over the `SyncState` matrix. The caller (`processEntry`) performs the re-fetch and the optional single reapply; the decision itself has no side effects. This keeps the policy logic in the domain tier and the I/O in the application tier. | 2026-07-12 |
| DEC-6 | **CI concurrency-group templates are guidance artifacts under `examples/ci/`, not in-code enforcement.** | ADR-0006 names CI `concurrency:` groups as a complementary control to "reduce overlap at the source." MarkSync cannot enforce CI configuration; it can only document recommended snippets. Placing them under `examples/ci/` (chosen over `docs/guides/`) keeps runnable YAML snippets separate from prose guides. | 2026-07-12 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `assertOperationFresh` (`src/domain/state/`) | **New** — pure operation-freshness gate |
| `assertPlanNotExpired` (`src/domain/state/`) | **New** — pure stale-plan-expiry gate |
| `decideOnConflict` + `Decision` (`src/domain/state/`) | **New** — pure 409 re-fetch-once decision |
| `applyPlan` / `processEntry` (`src/app/push-flow.ts`, GH-23) | **Updated** — wire the three gates before each write; 409 re-fetch-once policy on `Conflict` |
| `Plan` type (`src/app/push-flow.ts`, GH-23) | **Updated** (additive) — timestamp anchoring for expiry (OQ-1: derived from `runId` or explicit `createdAt`) |
| `FakeTarget` (`tests/_helpers/fake-target.ts`) | **Enhanced** — stored `marksync.metadata`, shared backing-map option, 409-then-refreshed sequence |
| CI concurrency-group templates (`examples/ci/`) | **New** — guidance YAML + README |
| `TargetSystem` port (`src/domain/target/port.ts`, GH-21) | **Unchanged** — reused (`getProperty`/`getPage`/`updatePage`/`putProperty`) |
| `classify` / `actionFor` / `SyncState` (`src/domain/state/`, GH-22) | **Unchanged** — reused (the refreshed re-classification) |
| `MetadataProperty` (`src/domain/state/reconcile.ts`, GH-19) | **Unchanged** — reused (carries `operationId`) |
| `MarkSyncError` union (`src/domain/errors.ts`) | **Unchanged** — `StalePlan` pre-staged; no new arms |
| `sync.stalePlanMinutes` config (`src/app/config.ts`, `src/domain/config/types.ts`) | **Unchanged** — pre-staged default 15; consumed by `assertPlanNotExpired` |
| `generateUuidV7` (`src/domain/identity/uuid.ts`) | **Unchanged** — reused (operation-id time prefix) |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria, which constitute the Definition of Done. Concurrency safety is cited as **NFR-REL-5 / NFR-REL-10** (not INV-SAFE-3 — see the invariant-naming note in §1).

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** two overlapping plans where plan A (older op-id, UUID-v7 timestamp T1) and plan B (newer op-id, timestamp T2 > T1) both target the same page and B applies first (recording `op_<runId-B>` in `marksync.metadata`), **when** A's `processEntry` runs the operation-freshness gate against the shared-state fake target, **then** `assertOperationFresh` returns `err(StalePlan)` and A performs **0 writes** for that doc — no overwrite (NFR-REL-5). | F-1, F-4, NFR-1 | AC (NFR-REL-5) |
| AC-F1-2 | **Given** the same two-runner scenario with NO shared service between the runners (two separate `FakeTarget` instances sharing state via a shared backing map), **when** A applies after B, **then** A still aborts with `StalePlan` (the dedup reads through the shared Confluence-backed property) — **0 silent overwrites** without any shared coordination service (NFR-REL-10 / ADR-0006 C-6). | F-1, F-4, F-5, NFR-2 | AC (NFR-REL-10 decentralized) |
| AC-F2-1 | **Given** a plan whose embedded timestamp is > `stalePlanMinutes` (default 15) ago at apply time, **when** `assertPlanNotExpired` runs, **then** it returns `err(StalePlan{expiredAt})` and that doc is blocked; and **given** a plan exactly at the window boundary, **then** it is expired (conservative boundary); and **given** a plan under the window, **then** it is fresh. | F-2, NFR-3 | AC (stale-plan) |
| AC-F3-1 | **Given** the `decideOnConflict` decision matrix, **when** the refreshed `SyncState` is `LOCAL_AHEAD` or `NO_CHANGE`, **then** the decision is `"reapply"`; and **when** the refreshed state is `REMOTE_AHEAD` or `DIVERGED`, **then** the decision is `"block"` (unit test over the full matrix). | F-3, NFR-7 | AC (409 policy — unit) |
| AC-F3-2 | **Given** an `updatePage` that returns `Conflict`, **when** `processEntry` runs the 409 policy, **then** it re-fetches the remote (`getPage`) ONCE, re-classifies, calls `decideOnConflict`; if `"reapply"` → re-applies the update ONCE with the refreshed base version (and a second `Conflict` blocks with no further retry); if `"block"` → records the drift block — **max 1 re-fetch, max 1 reapply**, no loop (integration test). | F-3, F-4, NFR-4 | AC (409 policy — integration) |
| AC-F4-1 | **Given** a plan where doc A's operation-freshness gate returns `StalePlan` and doc B is fresh, **when** `applyPlan` runs, **then** doc A is reported as blocked and doc B is still applied — the run does not abort on A (per-document isolation). | F-4, NFR-5 | AC (per-document isolation) |
| AC-F5-1 | **Given** the CI concurrency-group templates under `examples/ci/`, **when** they are parsed, **then** they are valid YAML; and they are documented in the accompanying README with the group-key strategy and cancel-in-progress tradeoff. | F-6, NFR-9 | AC (CI templates) |
| AC-F6-1 | **Given** a full apply run with concurrency gates active, **when** every output path (`ApplyReport` JSON, journal JSONL) is inspected, **then** **0** credential/token occurrences are found — the operation-id is `op_<uuid-v7>` with no secret material (INV-SEC-1 / NFR-SEC-1). | F-4, NFR-6 | AC (no secrets) |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + format:check + typecheck + test + check:boundaries) runs, **then** it exits **0** — including the boundary check proving `src/domain/state/` (the new pure gates) imports no infrastructure. | F-1, F-2, F-3, NFR-7, NFR-10 | AC (`bun run check` green) |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`** on branch `feat/GH-24/concurrency-control`. Depends on GH-21 (merged) and GH-23 (merged). This is the MS2-E3 capstone: epic MS2-E3 (Safe publish core) is complete when this lands, and `feature-safe-publish.md` §3.1 "Concurrency control" becomes the last `*(delivered)*` tag.
- **Merge strategy:** Conventional Commits (TDR-0008); a `feat(app)`/`feat(domain)` scope is appropriate. Suggested landing order: (1) the three pure domain gates (`assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict`) with unit tests — pure, no deps on the engine; (2) the `applyPlan`/`processEntry` wiring consuming the gates; (3) the `FakeTarget` enhancement; (4) the two-runner overlap + 409-policy integration tests; (5) the CI concurrency-group templates. Each step is independently testable.
- **After merge:** E5-S1 wires the NFR-REL-5 Gherkin BDD scenario + live-sandbox E2E against the delivered gates; MS-0002 release follows once E5 validation passes.
- **Phase 7 doc-sync (`@doc-syncer`) — flagged, NOT done here:**
  - **`feature-safe-publish.md` §3.1 "Concurrency control"** — tag `*(delivered — GH-24)*` and update the description to reference the delivered gates.
  - **`architecture-overview.md` "Push executor" row** — note the concurrency wiring (operation-freshness + stale-plan-expiry + 409 re-fetch-once).
  - **`ADR-0006` Lessons Learned** — append the concurrency-delivery retrospective (the write-time backstop that completes C-5/C-6).
  - **`doc/spec/features/feature-safe-publish.md` `links.related_changes`** += GH-24.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. The concurrency gates read the existing `marksync.metadata` content property (already written by GH-23's `applyPlan` on every successful create/update) and the existing `sync.stalePlanMinutes` config. No lock, cache, or property migration is performed. The `StalePlan` error arm is pre-staged; no error-model migration. The `operationId` field is already on `Plan`/`PageBinding`/`MetadataProperty`; no schema migration.

## 20. PRIVACY / COMPLIANCE REVIEW

- **No secrets in output (INV-SEC-1 / NFR-SEC-1):** the operation-id is `op_<uuid-v7>` — a time-sortable identifier with no secret material. The `marksync.metadata` content property (already written by GH-23) carries the operation-id alongside the existing binding fields; no new secret-bearing field is introduced. The `StalePlan` error carries only `{ operationId, expiredAt }` — no tokens, no document bodies. AC-F6-1 asserts 0 token occurrences.
- **No outbound telemetry (NFR-SEC-3 / NFR-PRIV-1):** the gates send data only to the configured Confluence target via the `TargetSystem` port (`getProperty`/`getPage`/`updatePage`). No analytics, no third-party endpoints. The CI templates are local YAML artifacts.
- **Confluence content-property size:** the `marksync.metadata` property (~8 KB, spike-validated) already includes `operationId` (GH-23); no size change from this story.

## 21. SECURITY REVIEW HIGHLIGHTS

- **The concurrency gates are safety properties.** NFR-REL-5/NFR-REL-10 (decentralized concurrency — older never overwrites newer, no shared service) are the security-relevant guarantees this change enforces. The operation-id dedup is an application-level gate that complements Confluence's server-enforced 409 version-conflict gate (defense in depth, RSK-1).
- **No new shell-out surface.** This change adds no shell invocations, no new external integrations beyond the existing `TargetSystem` port, and no credential handling. The pure domain gates (`src/domain/state/`) import no infrastructure (NFR-7 / boundary check).
- **`forbidden`/`RateLimited`/`RemoteUnreachable` unchanged.** A `getProperty` or `getPage` that returns `Forbidden`/`RateLimited`/`RemoteUnreachable` surfaces as a per-document block (mirroring GH-23's transport-error handling) — never as an overwrite. The concurrency gates do not alter the transport-error policy.
- **No credential in any output path:** the `StalePlan` error and the `marksync.metadata` operation-id carry no secret material; the `CommandResult` redaction layer (ADR-0011) is unchanged.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **The three pure domain gates are the highest-leverage extensibility seam.** `assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict` are pure functions with no side effects — their behavior is fully specified by their inputs and covered by unit fixtures. Adjusting the 409 policy (e.g. a future "reapply with merge" for MS-0004 reverse sync) is a localized change to `decideOnConflict`; the wiring stays fixed.
- **The `stalePlanMinutes` window is operator-tunable.** The default (15 min) is conservative; teams with longer CI queues may raise it via `marksync.yml`. The gate reads the config at apply time, so a config change takes effect on the next run — no migration.
- **The 409 single-retry policy bounds Confluence API cost.** At most one extra `getPage` per conflicting document per run. At ≤500 pages / ≤10 runners with rare conflicts, this is negligible (RSK-2/RSK-5).
- **The CI templates are copy-paste guidance.** Users adopt them by copying the `concurrency:` snippet into their GitHub Actions workflow; MarkSync does not enforce or validate them at runtime. The README documents the group-key strategy and the cancel-in-progress tradeoff.
- **The `FakeTarget` enhancement benefits all downstream integration tests.** The stored-property + shared-backing-map + 409-then-refreshed capabilities are reusable by E5-S1 (BDD) and any future concurrency-related test.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Operation-ID dedup | The decentralized gate that detects a stale plan by comparing its `operationId` (`op_<runId>`) against the remote `marksync.metadata.operationId`. If the remote is newer (by UUID-v7 time prefix), the plan is stale → `StalePlan`. |
| Stale-plan expiry | The time-based gate that aborts a plan older than `sync.stalePlanMinutes` (default 15) at apply time → `StalePlan{expiredAt}`. |
| 409 re-fetch-once policy | On `Conflict`, re-fetch the remote (`getPage`), re-classify (`classify`), and decide ONCE: reapply if now safe, block if still conflicting. Max 1 re-fetch, max 1 reapply — no loop. |
| `assertOperationFresh` | Pure domain gate `(planOpId, remoteOpId) → Result<void, MarkSyncError>`. Returns `err(StalePlan)` if the remote operation is newer. |
| `assertPlanNotExpired` | Pure domain gate `(planTs, now, stalePlanMinutes) → Result<void, MarkSyncError>`. Returns `err(StalePlan{expiredAt})` if the plan age exceeds the window. |
| `decideOnConflict` | Pure domain decision `(conflict, refreshedState) → "reapply" \| "block"`. Unit-testable; no retry loop. |
| Decentralized concurrency (NFR-REL-10) | Two runners on separate machines, no shared coordination service, cannot silently overwrite — coordination lives in Git (lock) + Confluence (409 + content properties). |
| NFR-REL-5 | Two overlapping CI plans never let the older overwrite the newer. |
| NFR-REL-10 | Decentralized concurrency — two runners on separate machines (no shared service) cannot silently overwrite (409 gates stale write). |
| INV-SAFE-3 | Duplicate UUID is fatal before any write (GH-18) — NOT concurrency. (The GitHub Issue #24 body mislabels concurrency as INV-SAFE-3; the correct IDs are NFR-REL-5/NFR-REL-10.) |
| CI concurrency group | A GitHub Actions `concurrency:` key grouping runs by target so overlapping pushes cancel-or-queue rather than race. Guidance artifact, not in-code enforcement. |

## 24. APPENDICES

- **Operation-freshness gate (before each Update write):**

  ```
  target.getProperty(pageId, "marksync.metadata") → propertyJson | undefined
  remoteOpId = parse(propertyJson)?.operationId
  assertOperationFresh(plan.operationId, remoteOpId)
    → ok              : proceed to updatePage
    → err(StalePlan)  : block THIS doc (per-document isolation), continue run
  ```

- **Stale-plan-expiry gate (before each write — create or update):**

  ```
  assertPlanNotExpired(planTimestamp, Date.now(), config.sync.stalePlanMinutes)
    → ok                       : proceed
    → err(StalePlan{expiredAt}): block THIS doc, continue run
  ```

- **409 re-fetch-once policy (on Conflict from updatePage):**

  ```
  target.updatePage(...) → err(Conflict)
    refreshed = target.getPage(pageId) → re-classify → SyncState
    decideOnConflict(conflict, refreshed)
      LOCAL_AHEAD / NO_CHANGE → "reapply":
          target.updatePage({ ..., baseVersion: refreshed.version })   (ONCE)
            success → journal → binding → saveLock → putProperty
            Conflict → block (no second retry)
      REMOTE_AHEAD / DIVERGED → "block":
          { outcome: "blocked", error: Conflict }
  ```

- **`decideOnConflict` decision matrix:**

  | Refreshed `SyncState` | Decision |
  |-----------------------|----------|
  | `LOCAL_AHEAD` | `"reapply"` |
  | `NO_CHANGE` | `"reapply"` |
  | `REMOTE_AHEAD` | `"block"` |
  | `DIVERGED` | `"block"` |
  | `REMOTE_MISSING` / `LOCAL_MISSING` | `"block"` (not an update path) |

- **Two-runner overlap scenario (NFR-REL-5 / NFR-REL-10):**

  ```
  T1: Runner A computePlan → runId-A (UUID v7 @ T1) → opId-A = op_<runId-A>
  T2: Runner B computePlan → runId-B (UUID v7 @ T2 > T1) → opId-B = op_<runId-B>
  T3: Runner B applyPlan: updatePage ok → putProperty records opId-B
  T4: Runner A applyPlan: getProperty reads opId-B
      assertOperationFresh(opId-A, opId-B) → remote newer → err(StalePlan)
      A blocks that doc → 0 overwrites
  (decentralized: A & B share no service — only the Confluence content property)
  ```

- **Authoritative sources:** the story file `MS2-E3-S7--concurrency-control.md` (authoritative scope — deliverables, ACs, DoD, out-of-scope, CEO-resolved R1/Q1, invariant-naming note); the feature spec `feature-safe-publish.md` (§3.1 "Concurrency control" — the aspirational capability this delivers; §3.3 "Concurrent CI runs"; §5 cross-cutting AC NFR-REL-5); ADR-0006 (C-5/C-6, "Concurrency control (C-5)" decision section, Implementation Plan item 4, Verification Criteria "Concurrency" + "Decentralized concurrency"); `nonfunctional.md` (NFR-REL-5, NFR-REL-10); `id-prefix-catalog.md` (INV-SAFE-3 = duplicate-UUID, NOT concurrency).

- **Reused contracts verified present (read, not assumed):** `src/domain/errors.ts` (`StalePlan { operationId: string; expiredAt: string }` at line 50, in `assertNeverMarkSyncError` at line 148; `Conflict { pageId; baseVersion; remoteVersion }`); `src/app/push-flow.ts` (`Plan { runId; operationId; entries; provenance; warnings }`, `runId = generateUuidV7()`, `operationId = op_${runId}`; `processEntry` Update branch at line 635; Conflict → blocked at line 659); `src/domain/state/reconcile.ts` (`MetadataProperty` with `operationId` at line 25); `src/app/config.ts` (`stalePlanMinutes ?? 15` at line 143); `src/domain/config/types.ts` (`SyncConfig.stalePlanMinutes: number`); `src/domain/identity/uuid.ts` (`generateUuidV7` via `uuid` v7); `src/domain/state/classifier.ts` + `actions.ts` + `sync-state.ts` (`classify`/`actionFor`/`SyncState`); `tests/_helpers/fake-target.ts` (`getProperty` always returns `undefined` at line 182 — needs enhancement); `src/domain/target/port.ts` (`TargetSystem.getProperty`/`getPage`/`updatePage`).

- **Structural/quality reference:** the GH-23 spec (`chg-GH-23-spec.md`) — the immediate predecessor, established the section depth and the DEC/OQ/RSK conventions used here; its DEC-6 ("Conflict-as-drift, no retry") is the policy this story refines into the re-fetch-once decision.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | spec-writer (ADOS) | Initial specification. |

---

## AUTHORING GUIDELINES

Authored by `@spec-writer` per the standard phase-2 specification flow. Sources: the story file `MS2-E3-S7--concurrency-control.md` (authoritative scope — deliverables, ACs, DoD, out-of-scope, CEO-resolved R1/Q1, the explicit invariant-naming note distinguishing NFR-REL-5/NFR-REL-10 from INV-SAFE-3), the feature spec `feature-safe-publish.md` (§3.1 "Concurrency control" — the last aspirational capability; §3.3 "Concurrent CI runs"; §5 cross-cutting AC), ADR-0006 (C-5/C-6, the "Concurrency control (C-5)" decision section specifying 409 + operation-ID dedup + stale-plan expiry + CI templates, Implementation Plan item 4, Verification Criteria), `nonfunctional.md` (NFR-REL-5 = overlapping CI plans; NFR-REL-10 = decentralized), `id-prefix-catalog.md` (INV-SAFE-3 = duplicate-UUID fatal — confirming the GitHub Issue #24 body's "INV-SAFE-3" label for concurrency is a typo). The PM-confirmed change-planning summary provided the goals, scope, risks, dependencies, and the pre-staged-infrastructure inventory. Existing code seams were **read and verified, not assumed**: the `StalePlan` error arm (errors.ts:50), the `operationId` on `Plan`/`PageBinding`/`MetadataProperty`, the `sync.stalePlanMinutes` default 15 (config.ts:143), `generateUuidV7` (uuid.ts), the `processEntry` Update branch + Conflict-block path (push-flow.ts:635-672), and the `FakeTarget.getProperty` stub (fake-target.ts:182) were all read to confirm signatures, error arms, and module residences. The GitHub Issue #24 body's mislabeling of the concurrency invariant as "INV-SAFE-3" was corrected per the story file's explicit note and `id-prefix-catalog.md`; the correct citations (NFR-REL-5/NFR-REL-10) are used throughout, with a one-line acknowledgment in §1 so the DoR reviewer does not flag the discrepancy. OQ-1 (plan-timestamp anchoring: extract from runId vs. explicit `createdAt`) is flagged as a minor design decision deferred to the plan-writer — both options are additive and within the story's settled constraints, so no `@decision-advisor` escalation is required.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-24`
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
