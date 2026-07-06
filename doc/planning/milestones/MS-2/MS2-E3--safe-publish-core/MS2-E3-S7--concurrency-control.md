---
id: MS2-E3-S7
title: "concurrency-control"
status: todo
type: story
priority: high
epic: MS2-E3
milestone: MS-0002
estimate: 2d
gh_issue: GH-24
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [], blocked_by: [MS2-E3-S4, MS2-E3-S6] }
cross_cutting: [NFR-REL-5, NFR-REL-10, R-FEA-7]
---

# MS2-E3-S7 — Concurrency control (decentralized optimistic)

## Goal
Decentralized optimistic concurrency so two overlapping CI runs (on separate machines, NO shared service) can never let the older plan overwrite the newer (NFR-REL-5 / NFR-REL-10, ADR-0006 C-5/C-6). Mechanism: Confluence 409 on stale `version.number` + **operation-ID dedup** + **stale-plan expiry** + CI concurrency-group templates.

> **Invariant naming note:** concurrency safety is `NFR-REL-5`/`NFR-REL-10` (NOT `INV-SAFE-*`). The `INV-SAFE-*` IDs are: 1=no silent overwrite, 2=no silent re-create of REMOTE_MISSING, 3=duplicate-UUID fatal (per `id-prefix-catalog.md`).

## Background
ADR-0006 C-6: no shared coordination service — all exchange lives in Git (lock) + Confluence (409). This is the **write-time** backstop that complements the pre-write classifier (E3-S5). At ≤500 pages / ≤10 runners, 409-retry is manageable; pessimistic leasing adds crash-recovery complexity for no extra safety.

## Detailed scope (deliverables)
1. **Operation-ID dedup** — each plan carries `operationId = op_<runId>` (from E3-S6). Before applying a doc, compare the plan's `operationId` against the **remote `marksync.metadata.operationId`** (fetched via E3-S4). If the remote already records a NEWER operation (by run timestamp embedded in the op id / UUID v7 time-sortable), the current plan is **stale** → abort that doc with `StalePlan`, do NOT write. (This catches the case where plan B computed after plan A, but B's apply races ahead.)
2. **Stale-plan expiry** — a plan older than `sync.stalePlanMinutes` (default 15, blueprint §9 Q7) at apply time → `StalePlan{expiredAt}`; must be regenerated. Prevents a long-parked plan from overwriting newer state.
3. **409 handling policy (E3-S6 surfaces; this story owns the policy)** — on `Conflict` from a page update: do NOT blind-retry. Options: (a) re-fetch remote, re-classify, and either re-apply if still safe or block; (b) surface as drift. MS-0002 policy: **re-fetch + re-classify ONCE; if still conflicting, block with drift** (no retry loops). Document this.
4. **CI concurrency-group templates** — provide documented GitHub Actions `concurrency:` snippets (group by target) under `docs/guides/` or `examples/ci/` so users reduce overlap at the source. Not enforced in-code; guidance.
5. **`StalePlan` error** added to `MarkSyncError`; the sync engine (E3-S6) calls these checks before each write.

## Technical approach
- The operation-id comparison uses the UUID v7 / run-id time prefix for ordering (no separate clock).
- Dedup check is a single `getProperty` (cheap) before the write — fails fast on a stale plan.
- 409 policy is a pure function `(conflict, refreshedRemote) => Decision{reapply|block}` — unit-testable.
- CI templates are markdown/yaml artifacts, not runtime code.

## Interface contracts (what other stories consume)
- `assertOperationFresh(plan, remoteProperty)` + `assertPlanNotExpired(plan, now)` consumed by E3-S6 before each write.
- `decideOnConflict(conflict, refreshed)` consumed by E3-S6 on 409.
- CI concurrency templates consumed by users (docs).

## Acceptance criteria (testable)
- [ ] **NFR-REL-5:** a concurrency integration test — two overlapping plans against a mock target where plan A (older op-id) and plan B (newer op-id) both attempt the same page: B succeeds; A's apply sees B's newer operation-id in the property → A aborts with `StalePlan`, no overwrite. (BDD in E5-S1.)
- [ ] **NFR-REL-10 (decentralized):** the same scenario with NO shared service between the two runners (separate mock target instances sharing state via the mock) → still safe (409 + dedup).
- [ ] Stale-plan: a plan timestamped > 15 min ago → `StalePlan{expiredAt}` on apply.
- [ ] 409 policy: a `Conflict` → re-fetch+reclassify once; if still `REMOTE_AHEAD`/`DIVERGED` → block (drift); if now safe → reapply.
- [ ] CI concurrency templates documented and valid YAML.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | operation-id ordering (older vs newer), stale-plan expiry boundary, 409 decision function (reapply vs block) |
| Integration | two-runner overlap against a shared-state mock target (B wins, A aborts); 409 re-fetch+reclassify path |
| BDD | NFR-REL-5 (overlapping plans) wired by E5-S1 |

## Definition of Done
Operation-ID dedup + stale-plan expiry + 409-once policy + CI templates; two overlapping plans never let older overwrite newer; decentralized (no shared service). AC list is the DoD.

## Out of scope
- Pessimistic leasing / git-ref locks (rejected by ADR-0006 C-6 for MS-0002).
- Distributed lock services.
- Reverse-sync conflict resolution (MS-0004+).

## Risks / open questions (CEO-resolved)
- **R1:** Clock skew between runners mis-orders operation ids. → Operation id embeds a UUID v7 (time-based) + run counter; the remote property is the source of truth; a truly-skewed older write is still 409-rejected by Confluence's version check. Defense in depth. CEO-recorded.
- **Q1:** Should the 409 policy retry more than once? → No — MS-0002 re-fetch+reclassify ONCE then block; repeated retry risks write storms (ADR-0010 C-3). Confirmed.
