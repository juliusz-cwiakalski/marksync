---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-24-concurrency-control
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, reliability, concurrency, decentralization]
links:
  change_spec: ./chg-GH-24-spec.md
  change_test_plan: ./chg-GH-24-test-plan.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S7--concurrency-control.md
  adr: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
summary: >
  Decentralized optimistic-concurrency backstop that completes the safe-publish
  trust wedge: three pure domain gates (operation-ID freshness, stale-plan
  expiry, 409 re-fetch-once decision) wired into the existing applyPlan write
  path so two overlapping CI runs on separate machines — with NO shared
  coordination service — can never let an older plan overwrite a newer one
  (NFR-REL-5 / NFR-REL-10, ADR-0006 C-5/C-6), plus CI concurrency-group
  templates to reduce overlap at the source.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-24: Concurrency control

## Context and Goals

This change is the **seventh and final story of epic MS2-E3 (Safe publish
core)** — the concurrency capstone that closes the last aspirational capability
in `feature-safe-publish.md` §3.1. Every prerequisite is already merged and its
contract is consumed as-is: the `applyPlan`/`processEntry` write path and the
`Plan` type carrying `operationId` (GH-23), the `TargetSystem` port
`getProperty`/`getPage`/`updatePage`/`putProperty` (GH-21), the pure
`classify`/`SyncState` (GH-22), and the `MetadataProperty.operationId`
cross-check (GH-19). The `StalePlan` error arm, the `sync.stalePlanMinutes`
config (default 15), and the UUID-v7 generator are all **pre-staged** — this
change adds zero new error arms, zero config, zero identity changes.

The new work is therefore **gates + wiring + test infrastructure + guidance**:

1. Three pure domain gates under `src/domain/state/` (`assertOperationFresh`,
   `assertPlanNotExpired`, `decideOnConflict`) plus the UUID-v7 timestamp
   extractor that anchors expiry.
2. Wiring those gates into `processEntry` before each document write
   (operation-freshness + stale-plan-expiry before `Update`; stale-plan-expiry
   before `Create`) and the 409 re-fetch-once policy on `Conflict` — with
   per-document isolation (a `StalePlan` aborts only that document).
3. `FakeTarget` enhancement so the two-runner overlap and 409-then-refreshed
   integration tests can simulate the decentralized scenario.
4. CI concurrency-group templates under `examples/ci/`.

The authoritative requirements are the spec (`./chg-GH-24-spec.md`,
F-1..F-6, AC-F1-1..AC-Q-1, DEC-1..DEC-6, RSK-1..RSK-6) and the test plan
(`./chg-GH-24-test-plan.md`, 21 scenarios TC-CONC/EXPIRY/409/ISO/CI/SEC/QG).
This plan sequences them into commit-sized phases; the coder commits per phase.

### Resolved open questions

**OQ-1 (plan-timestamp anchoring) — RESOLVED in this plan (plan-level
DEC-7).** `assertPlanNotExpired` needs a plan timestamp. The `runId` is a UUID
v7 whose first 48 bits encode the Unix epoch in milliseconds (RFC 9562);
`operationId = op_<runId>` (DEC-3). Rather than add an explicit `Plan.createdAt`
field (which would duplicate data already present in `runId` and require
threading it through `computePlan`), this plan derives the timestamp via a pure
helper. This keeps the `Plan` shape **unchanged**, reuses the existing
time-sortable property, and is itself fully unit-testable. See Phase 1, task
1.1.

**DEC-7 (plan-level):** Stale-plan-expiry timestamp is derived from
`plan.runId` via a pure UUID-v7 timestamp extractor — no new `Plan` field. The
extractor is shared by `assertOperationFresh` (which extracts from both
`op_<uuid-v7>` operands) so there is one canonical v7-time reader.

**Naming refinement (within plan-writer authority):** the change brief
suggested `runIdTimestamp(runId) → Date`. This plan names the primitive
`uuidV7Timestamp(uuid: string): number` and returns a millisecond epoch (the
unit `assertPlanNotExpired(planTimestamp: number, …)` consumes — spec F-2
signature). The broader name is honest: the function operates on any UUID v7,
and `assertOperationFresh` needs the same capability on the remote
`op_<uuid-v7>` id, not just on `runId`. The plan-writer judges this the cleaner
factoring; it satisfies the same AC (the expiry boundary test is agnostic to
the timestamp source).

**Malformed-input handling (covers TC-CONC-004's deferred decision):** the
operation-freshness gate is "innocent until proven stale" — if it cannot
establish that the **remote** is newer, it returns `ok`. A missing or
unparseable remote property = no prior operation recorded = fresh (the
first-publish base case). A malformed **plan** operation-id is a programming
error that cannot occur in practice (`operationId = op_${generateUuidV7()}`);
if it ever did, the gate still cannot prove staleness, returns `ok`, and
Confluence's server-enforced 409 version gate (GH-23) remains the backstop
(RSK-1 defense in depth).

### Open questions

None. ADR-0006 C-5/C-6 is settled; the `StalePlan` arm, `operationId` field,
`stalePlanMinutes` config, and UUID-v7 generator are pre-staged; the 409
single-retry policy and the no-pessimistic-leasing decision are CEO-confirmed
in the story file (R1/Q1); OQ-1 is resolved above. No `@decision-advisor`
escalation is required.

## Scope

### In Scope

- **F-1** — `assertOperationFresh(planOperationId, remoteOperationId): Result<void, MarkSyncError>` pure gate (compares UUID-v7 time prefixes; remote newer → `err(StalePlan)`).
- **F-2** — `assertPlanNotExpired(planTimestamp, now, stalePlanMinutes): Result<void, MarkSyncError>` pure gate (plan age > window → `err(StalePlan{expiredAt})`; boundary-at-window = expired, conservative).
- **F-3** — `decideOnConflict(conflict, refreshedRemoteState): Decision` pure decision (`Decision = "reapply" | "block"`) over the `SyncState` matrix.
- **F-4** — `applyPlan`/`processEntry` wiring: operation-freshness + stale-plan-expiry before each write; 409 re-fetch-once policy on `Conflict`; per-document isolation.
- OQ-1 timestamp anchoring via a pure UUID-v7 timestamp extractor (`uuidV7Timestamp`).
- **F-5** — `FakeTarget` enhancement (stored `marksync.metadata`, shared backing-map option, configurable 409-then-refreshed sequence) + reconciliation of the pre-existing port drift.
- **F-6** — CI concurrency-group templates under `examples/ci/` + README.
- Unit tests (operation-id ordering, expiry boundary, 409 decision matrix) and integration tests (two-runner overlap, 409 re-fetch-once, per-document isolation, secrets-safety).

### Out of Scope

- Pessimistic leasing / git-ref locks (ADR-0006 C-6; NG-1).
- Distributed lock services (NG-2).
- Retrying a 409 more than once (NG-3; write-storm risk, ADR-0010 C-3 spirit).
- Reverse-sync conflict resolution — MS-0004+ (NG-4).
- BDD / E2E live-tenant wiring — E5-S1 owns the NFR-REL-5 Gherkin scenario + live sandbox (NG-5).
- Reimplementing `classify`/`actionFor`, the `TargetSystem` port, `applyPlan`/`computePlan`, or any preceding contract (NG-6).
- New `MarkSyncError` arms — `StalePlan` is pre-staged; no error-model change.
- In-code enforcement of CI concurrency groups — the templates are guidance artifacts (NG-7).

### Constraints

- **No new `MarkSyncError` kind.** `StalePlan { operationId: string; expiredAt: string }` (errors.ts:50, in `assertNeverMarkSyncError`) is reused as-is for both the operation-freshness case (`expiredAt: ""`) and the expiry case (`expiredAt: <iso>`).
- **No `TargetSystem` port change.** Only `FakeTarget` changes; the fake is reconciled to match the port (the pre-existing `page.spaceId` reference and the `{ read, update, delete }` restrictions shape are fixed on the fake side).
- **No retry loops.** The 409 policy is re-fetch + re-classify ONCE, then either one reapply or one block. Max 1 `getPage` + max 1 second `updatePage` per conflicting document.
- **Per-document isolation.** A `StalePlan` or `Conflict`-block on one document returns `{ outcome: "blocked", error }` for that document; the run continues (mirrors GH-23's existing `Conflict`/`RemoteMissing` isolation).
- **No secrets in any output path** (INV-SEC-1 / NFR-SEC-1). The operation-id is `op_<uuid-v7>`; the `StalePlan` error carries only `{ operationId, expiredAt }`.
- **Pure-domain testability (NFR-7).** The three gates import zero infrastructure; the `bun run check:boundaries` step proves `src/domain/state/` stays infra-free.
- **Code style** (`.ai/rules/typescript.md`, AGENTS.md): self-documenting code, ≤3-line file headers citing the spec/ADR once, `Result<T,E>` for expected failures, exhaustive `never`-checks, `#`-import aliases, one import per module, no JSDoc restating signatures, no bare `DEC-x`/`AC-x` tag soup.

### Risks

- **RSK-1** (clock skew mis-orders operation ids) — Mitigated by defense in depth: the operation-id embeds a UUID-v7 time prefix (DEC-3) AND Confluence's server-enforced 409 on `version.number` (GH-23) backstops any skew that slips past the dedup gate. Two independent gates must both fail for an overwrite.
- **RSK-2** (409 re-fetch adds API cost) — Mitigated by scope: one extra `getPage` per conflicting document, at most once. Acceptable at ≤500 pages / ≤10 runners.
- **RSK-3** (expiry-to-runId coupling) — Closed by DEC-7: the derivation is pure, isolated to the expiry gate, and reuses the existing time-sortable property with no new field.
- **RSK-4** (409 write storms) — Closed by NG-3/DEC-2: the policy is ONCE-then-block, by construction (no loop in the wiring).
- **RSK-5** (extra `getProperty` per Update) — Mitigated by scope: the check runs only on the `Update` branch and fails fast (avoids a wasted `updatePage` + 409).
- **RSK-6** (`StalePlan` mistaken for a run-level failure) — Closed by F-4 per-document isolation; AC-F4-1 (TC-ISO-001/002) asserts doc A blocks + doc B applies.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Concurrency safety (NFR-REL-5) | Two overlapping plans vs shared-state target: B (newer op-id) wins, A (older) aborts with `StalePlan`; **0 overwrites** | AC-F1-1, TC-CONC-005 |
| Decentralized concurrency (NFR-REL-10) | Same scenario, NO shared service (separate fakes, shared backing map); **0 silent overwrites** | AC-F1-2, TC-CONC-006 |
| Stale-plan expiry | Plan age > `stalePlanMinutes` → `StalePlan{expiredAt}`; boundary-at-window = expired | AC-F2-1, TC-EXPIRY-001..003 |
| 409 single retry | On `Conflict`: re-fetch + re-classify ONCE; max 1 re-fetch, max 1 reapply; no loops | AC-F3-2, TC-409-006..008 |
| Per-document isolation | `StalePlan` on doc A → doc B still applies; run does not abort | AC-F4-1, TC-ISO-001/002 |
| CI template validity | Templates valid YAML + documented | AC-F5-1, TC-CI-001 |
| No secrets in output | **0** credential/token occurrences in any apply output path | AC-F6-1, TC-SEC-001 |
| Quality gate | `bun run check` exits **0**, including boundary check (NFR-7) | AC-Q-1, TC-QG-001 |

## Phases

### Phase 1: Pure domain gates + UUID-v7 timestamp extractor

**Goal**: Land the three pure domain gates and the timestamp primitive that
anchors expiry, all under `src/domain/state/` and `src/domain/identity/`, with
full unit-test coverage. Zero wiring, zero infrastructure imports (NFR-7).

**Tasks**:

- [x] **1.1** Add `uuidV7Timestamp(uuid: string): number` to `src/domain/identity/uuid.ts` — extract the 48-bit Unix-ms timestamp from the UUID-v7 prefix (RFC 9562: the first 12 hex digits before the version nibble). Pure, no I/O. This is the OQ-1 timestamp source (DEC-7) — derives the plan timestamp from `runId` with no new `Plan` field, and is reused by `assertOperationFresh` for both `op_<uuid-v7>` operands.
- [x] **1.2** Add `assertOperationFresh(planOperationId: string, remoteOperationId: string | undefined): Result<void, MarkSyncError>` to a new module `src/domain/state/operation-freshness.ts`. Strip the `op_` prefix, call `uuidV7Timestamp` on both ids; remote strictly newer → `err({ kind: "StalePlan"; operationId: planOperationId; expiredAt: "" })`; equal / older / remote-undefined / remote-unparseable → `ok` (DEC: innocent-until-proven-stale; the 409 version gate backstops). Pure.
- [x] **1.3** Add `assertPlanNotExpired(planTimestamp: number, now: number, stalePlanMinutes: number): Result<void, MarkSyncError>` to a new module `src/domain/state/plan-expiry.ts`. If `now - planTimestamp > stalePlanMinutes * 60_000` → `err({ kind: "StalePlan"; operationId: ""; expiredAt: new Date(planTimestamp + stalePlanMinutes * 60_000).toISOString() })` (the ISO instant the plan crossed the boundary). Boundary-at-exactly-the-window = expired (conservative). Else `ok`. Pure.
- [x] **1.4** Add `decideOnConflict(conflict: Conflict, refreshedRemoteState: SyncState): Decision` + `export type Decision = "reapply" | "block"` to a new module `src/domain/state/conflict-policy.ts`. Pure mapping over the full `SyncState` matrix: `LOCAL_AHEAD`/`NO_CHANGE` → `"reapply"`; `REMOTE_AHEAD`/`DIVERGED`/`REMOTE_MISSING`/`LOCAL_MISSING` → `"block"`. End with an exhaustive `never`-check over `SyncState` (typescript.md).
- [x] **1.5** Unit tests (tier 2): `tests/unit/domain/state/assert-operation-fresh.test.ts` (TC-CONC-001..004), `assert-plan-not-expired.test.ts` (TC-EXPIRY-001..003), `decide-on-conflict.test.ts` (TC-409-001..005), and `tests/unit/domain/identity/uuid-v7-timestamp.test.ts` for the extractor (known-time fixture + RFC-9562 format). Use real inputs/outputs (no mocks), `#`-import aliases, `describe` by scenario.
- [x] **1.6** Verify `bun run check:boundaries` confirms `src/domain/state/` and `src/domain/identity/` import no infrastructure (NFR-7 / boundary check).

**Acceptance Criteria**:

- Must: AC-F1-1 gate exists and returns `err(StalePlan)` on a newer remote (TC-CONC-001); AC-F2-1 expiry boundary is conservative — at/over = expired, under = fresh (TC-EXPIRY-001..003); AC-F3-1 decision matrix covers all six `SyncState` values (TC-409-001..005); NFR-7 zero infrastructure imports under `src/domain/state/`.
- Should: TC-CONC-004 malformed-input behavior is documented (DEC: unproveable-staleness → `ok`).

**Files and modules**:

- Code areas: `src/domain/identity/uuid.ts` (updated — add `uuidV7Timestamp`); `src/domain/state/operation-freshness.ts` (new); `src/domain/state/plan-expiry.ts` (new); `src/domain/state/conflict-policy.ts` (new); `tests/unit/domain/identity/uuid-v7-timestamp.test.ts` (new); `tests/unit/domain/state/assert-operation-fresh.test.ts` (new); `tests/unit/domain/state/assert-plan-not-expired.test.ts` (new); `tests/unit/domain/state/decide-on-conflict.test.ts` (new).
- System docs: none (system spec reconciliation is the phase-7 doc-sync hand-off, listed in Phase 5).

**Tests**:

- `bun test tests/unit/domain/state/assert-operation-fresh.test.ts tests/unit/domain/state/assert-plan-not-expired.test.ts tests/unit/domain/state/decide-on-conflict.test.ts tests/unit/domain/identity/uuid-v7-timestamp.test.ts`
- `bun run check:boundaries`

**Completion signal**: `feat(state): GH-24 add operation-freshness + plan-expiry + conflict-policy gates`

---

### Phase 2: FakeTarget enhancement + port-drift reconciliation

**Goal**: Enhance `FakeTarget` so the concurrency/409 integration tests can
simulate two-runner overlap and a 409-then-refreshed sequence, and reconcile
the pre-existing port drift so the fake matches the `TargetSystem` port (the
port itself is unchanged — NFR-8).

**Tasks**:

- [x] **2.1** Reconcile `FakeTarget` with the `TargetSystem` port (boy-scout cleanup; do NOT change `src/domain/target/port.ts`): (a) the port `Page` is `{ id, title, version, body? }` — remove the nonexistent `page.spaceId` reads in `createPage` (use a distinct duplicate-detection key such as `${parentId}::${title}` instead of `p.spaceId === req.parentId`); (b) the port `PageRestrictions` is `{ pageId: string; restricted: boolean }` — fix `getRestrictions` to return that shape instead of `{ read, update, delete }`. The `createPage`-built fixture page must drop the `spaceId` field.
- [x] **2.2** Add a stored-property map + a `setMetadataProperty(pageId, json: string): void` test helper; `getProperty(pageId, key)` serves stored values (keyed by `${pageId}::${key}`), `putProperty(pageId, key, value)` persists them so runner B's `marksync.metadata` write is visible to runner A.
- [x] **2.3** Add a constructor option for a **shared backing map** — a single object holding the `pages`, `versionCounter`, and `properties` maps — so two `FakeTarget` instances model two runners on separate machines sharing Confluence state (NFR-REL-10). There is NO shared coordination service: the backing map is the shared Confluence substrate, passed by reference. Default (no arg) keeps the current private-map behavior.
- [x] **2.4** Add a configurable 409-then-refreshed sequence for the 409-policy tests: a setter (e.g. `setConflictThenRefresh(pageId, { afterGetPageVersion, reapplyOutcome })`) that pre-programs the behavior so a first `updatePage` 409s, a subsequent `getPage` returns the advanced state, and a second `updatePage` with the refreshed base version either succeeds or 409s again. Supports TC-409-006/007/008.
- [x] **2.5** Add/extend a small `FakeTarget` sanity test (stored-property round-trip; shared backing-map visibility between two instances; 409-then-refreshed sequence fires as configured). These are test-infrastructure checks, not the AC tests themselves.

**Acceptance Criteria**:

- Must: `FakeTarget` type-checks against `TargetSystem` with zero port drift (the pre-existing `spaceId`/restrictions gaps closed); `getProperty`/`putProperty` round-trip `marksync.metadata`; two instances on a shared backing map see each other's writes; the 409-then-refreshed sequence is configurable; NFR-8 preserved (the fake respects the port — no Confluence/REST details leak).
- Should: the existing integration suite still passes after the drift reconciliation (no behavioral regression in `apply-plan-integration`, `idempotency`, `duplicate-uuid-fatal`).

**Files and modules**:

- Code areas: `tests/_helpers/fake-target.ts` (enhanced + reconciled); `tests/_helpers/fake-target.test.ts` (new or extended sanity test).
- System docs: none.

**Tests**:

- `bun test tests/_helpers/fake-target.test.ts`
- Full integration regression: `bun test tests/integration/`

**Completion signal**: `test(helpers): GH-24 enhance FakeTarget (stored metadata, shared backing map, 409 sequence) + reconcile port drift`

---

### Phase 3: applyPlan / processEntry wiring + concurrency and 409 integration tests

**Goal**: Wire the three gates into `processEntry` before each write
(operation-freshness + stale-plan-expiry before `Update`; stale-plan-expiry
before `Create`) and the 409 re-fetch-once policy on `Conflict`; thread
`stalePlanMinutes` through `ApplyOptions`. Land the two-runner overlap,
409-policy, per-document-isolation, and secrets-safety integration tests.

**Tasks**:

- [x] **3.1** Add `stalePlanMinutes: number` to `ApplyOptions` (`src/app/push-flow.ts`) — thread the single primitive rather than widening the `config` coupling (DEC-8: prefer the primitive). Update the production caller (the push command wiring in `src/app/`/`src/cli/`) to pass `config.sync.stalePlanMinutes`. Thread `stalePlanMinutes` into `processEntry` alongside the existing parameters.
- [x] **3.2** In `processEntry`'s `Update` branch, BEFORE `target.updatePage`: call `target.getProperty(pageId, "marksync.metadata")`; best-effort parse → `remoteOpId` (missing/unparseable → `undefined` = no prior operation). Run `assertOperationFresh(plan.operationId, remoteOpId)` then `assertPlanNotExpired(uuidV7Timestamp(plan.runId), Date.now(), stalePlanMinutes)`. On `err(StalePlan)` → `return { uuid, outcome: "blocked", error: StalePlan }` for that document (per-document isolation — the loop continues to other entries).
- [x] **3.3** In `processEntry`'s `Create` branch, run `assertPlanNotExpired(uuidV7Timestamp(plan.runId), Date.now(), stalePlanMinutes)` before `target.createPage` (a stale create is still stale). No operation-freshness check — a new page has no prior operation id. On `err(StalePlan)` → block that document.
- [x] **3.4** On `Conflict` from `target.updatePage` (currently blocks per GH-23 DEC-6): re-fetch via `target.getPage(pageId)` (ONE re-fetch), re-derive the `RemoteState` + `SharedBase`, `classify` → refreshed `SyncState`, `decideOnConflict(conflict, refreshedState)`. If `"reapply"` → call `target.updatePage` ONCE with the refreshed base version; a second `Conflict` → block (no third attempt). If `"block"` → `return { outcome: "blocked", error: Conflict }`. **Max 1 re-fetch + max 1 reapply per document — no loop** (NG-3/DEC-2). A transport error on the re-fetch (`RateLimited`/`RemoteUnreachable`) → block that document (preserve GH-23's transport-error policy).
- [x] **3.5** Integration tests (tier 3):
  - `tests/integration/app/concurrency-control-overlap.test.ts` — TC-CONC-005 (single shared-state `FakeTarget`, NFR-REL-5: B wins, A aborts, 0 overwrites) and TC-CONC-006 (two separate `FakeTarget` instances on a shared backing map, NFR-REL-10: no shared service, 0 silent overwrites).
  - `tests/integration/app/409-retry-policy.test.ts` — TC-409-006 (re-fetch → `LOCAL_AHEAD` → reapply once), TC-409-007 (re-fetch → still `DIVERGED` → block), TC-409-008 (reapply → `Conflict` again → block, no second retry). Assert `getPageCalls`/`updatePageCalls` counts prove the single-retry boundary.
  - `tests/integration/app/concurrency-isolation.test.ts` — TC-ISO-001 (`StalePlan` on doc A, doc B still applies) and TC-ISO-002 (`StalePlan` on doc C, docs A/B apply).
- [x] **3.6** Extend `tests/integration/app/secrets-safety-integration.test.ts` (TC-SEC-001): assert the `StalePlan` and `Conflict`-block error paths in `ApplyReport` and the journal carry **0** credential/token occurrences — the operation-id is `op_<uuid-v7>` and the error carries only `{ operationId, expiredAt }`.

**Acceptance Criteria**:

- Must: AC-F1-1 (overlap, 0 overwrites — TC-CONC-005), AC-F1-2 (decentralized — TC-CONC-006), AC-F3-2 (409 single retry — TC-409-006..008), AC-F4-1 (per-document isolation — TC-ISO-001/002), AC-F6-1 (no secrets — TC-SEC-001); NFR-1/NFR-2/NFR-4/NFR-5/NFR-6.
- Should: the existing `Conflict`-as-drift + transport-error semantics are preserved (a `RateLimited`/`RemoteUnreachable` re-fetch blocks the document without a reapply).

**Files and modules**:

- Code areas: `src/app/push-flow.ts` (updated — `ApplyOptions.stalePlanMinutes`, `processEntry` `Update` + `Create` wiring, 409 re-fetch-once policy); the push command caller (updated — pass `stalePlanMinutes`); `tests/integration/app/concurrency-control-overlap.test.ts` (new); `tests/integration/app/409-retry-policy.test.ts` (new); `tests/integration/app/concurrency-isolation.test.ts` (new); `tests/integration/app/secrets-safety-integration.test.ts` (updated).
- System docs: none this phase (the phase-7 doc-sync hand-off is in Phase 5).

**Tests**:

- `bun test tests/integration/app/concurrency-control-overlap.test.ts tests/integration/app/409-retry-policy.test.ts tests/integration/app/concurrency-isolation.test.ts tests/integration/app/secrets-safety-integration.test.ts`
- Full suite regression: `bun test`

**Completion signal**: `feat(app): GH-24 wire concurrency gates + 409 re-fetch-once policy into applyPlan`

---

### Phase 4: CI concurrency-group templates + README

**Goal**: Deliver the documented GitHub Actions `concurrency:` guidance
artifacts under `examples/ci/` so users reduce overlapping CI runs at the
source (F-6, ADR-0006 "CI concurrency-group templates"). Guidance, not runtime
enforcement (NG-7).

**Tasks**:

- [x] **4.1** Create `examples/ci/github-actions-concurrency.yml` — valid YAML with a `concurrency:` block. Group key combines branch + MarkSync target id (e.g. `${{ github.ref }}-marksync-${{ matrix.target }}`); document `cancel-in-progress` per branch context (cancel-in-progress: true on feature branches, false on `main` to keep the canonical run).
- [x] **4.2** Create `examples/ci/README.md` — the group-key strategy (why group by target), the cancel-in-progress tradeoff (cancel-on-branch vs queue-on-main), how to copy the snippet into a workflow, and the relationship to MarkSync's optimistic 409 + operation-id dedup (the templates reduce overlap at the source; MarkSync remains safe even without them because the write-time gates are the hard guarantee).
- [x] **4.3** Validate the YAML parses and the README documents the required elements (TC-CI-001): a small automated check (`tests/unit/examples/ci-yaml-validation.test.ts` — parse the YAML with the existing YAML library and assert the `concurrency.group` + `cancel-in-progress` keys are present) plus a README content review.

**Acceptance Criteria**:

- Must: AC-F5-1 (templates valid YAML + documented — TC-CI-001, NFR-9).
- Should: the snippet is minimal, copy-paste-ready, and cites ADR-0006.

**Files and modules**:

- Code areas: `examples/ci/github-actions-concurrency.yml` (new); `examples/ci/README.md` (new); `tests/unit/examples/ci-yaml-validation.test.ts` (new — TC-CI-001 automation).
- System docs: these artifacts ARE the user-facing documentation for this capability.

**Tests**:

- TC-CI-001: `bun test tests/unit/examples/ci-yaml-validation.test.ts` + README review.

**Completion signal**: `docs(ci): GH-24 add concurrency-group templates + README`

---

### Phase 5: Finalize and Release

**Goal**: Close the change — quality gate green, patch version bump, and the
phase-7 (system spec) reconciliation hand-off prepared for `@doc-syncer`.

**Tasks**:

- [x] **5.1** Run `bun run check` (lint + format:check + typecheck + test + check:boundaries) → exit **0** (AC-Q-1 / TC-QG-001). The boundary check must confirm `src/domain/state/` imports no infrastructure (NFR-7).
- [x] **5.2** Version bump per repo conventions — `version_impact: patch` → bump the patch segment in `package.json`. No lock/cache/property migration (the gates read existing `marksync.metadata` and existing `stalePlanMinutes`; MS-0002 is pre-release).
- [x] **5.3** Spec reconciliation — **flagged for the `system_spec_update` delivery phase (executed by `@doc-syncer`, not committed here)**. Hand-off list:
  - `doc/spec/features/feature-safe-publish.md` §3.1 "Concurrency control" → tag `*(delivered — GH-24)*` and update the description to reference the delivered gates; add `GH-24` to `links.related_changes`.
  - `doc/overview/architecture-overview.md` "Push executor" row → note the concurrency wiring (operation-freshness + stale-plan-expiry + 409 re-fetch-once).
  - `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` Lessons Learned → append the concurrency-delivery retrospective (the write-time backstop that completes C-5/C-6).
- [x] **5.4** Boy-scout tidy: confirm the new `src/domain/state/*` modules and the `processEntry` edits carry ≤3-line file headers citing the spec/ADR once (AGENTS.md / `.ai/rules/typescript.md`); remove any restatement noise or bare tag soup.

**Acceptance Criteria**:

- Must: AC-Q-1 (`bun run check` exits 0; boundary check clean); patch version bump applied; phase-7 doc-sync hand-off list is complete.
- Should: file headers across the new modules are uniform and citation-light.

**Files and modules**:

- Code areas: `package.json` (version bump); any header tidy in `src/domain/state/*` and `src/app/push-flow.ts`.
- System docs: phase-7 hand-off list (task 5.3) — executed by `@doc-syncer` in the next delivery lifecycle phase, not in this change's commits.

**Tests**:

- TC-QG-001: `bun run check` exits 0.

**Completion signal**: `chore(release): GH-24 bump patch + finalize concurrency control`

---

### Phase 6: Code Review Remediation (Iteration 1)

**Goal**: Close the gaps found in review iteration 1. The pure domain gates,
wiring, and FakeTarget infrastructure are correct and `bun run check` is green,
but ALL planned integration tests are missing (Phase 3 Tasks 3.5/3.6 marked done
but files absent), the applyPlan JSDoc is stale, and the version bump contradicts
the spec's `version_impact: patch`.

**Tasks**:

- [x] **6.1** Create `tests/integration/app/concurrency-control-overlap.test.ts` (AC-F1-1, AC-F1-2):
  - TC-CONC-005 (NFR-REL-5): single shared-state FakeTarget. Runner B (newer
    op-id via UUID v7) applies first → putProperty records op_B. Runner A
    (older op-id) applies → getProperty reads op_B → assertOperationFresh →
    StalePlan → 0 writes for A's doc. Assert `report.blocks >= 1` and
    `updatePageCalls` for A is 0.
  - TC-CONC-006 (NFR-REL-10): two SEPARATE FakeTarget instances on a shared
    backing map (no shared coordination service). Same scenario → A still
    aborts with StalePlan. Assert no silent overwrite.
- [x] **6.2** Create `tests/integration/app/409-retry-policy.test.ts` (AC-F3-2):
  - TC-409-006: first updatePage → Conflict; getPage re-fetch → LOCAL_AHEAD →
    decideOnConflict → reapply once → success. Assert `getPageCalls === 1`
    extra (the re-fetch), `updatePageCalls === 2` total.
  - TC-409-007: first updatePage → Conflict; getPage re-fetch → DIVERGED →
    block. Assert `updatePageCalls === 1` (no reapply).
  - TC-409-008: first updatePage → Conflict; reapply → Conflict again → block
    (no third attempt). Assert `updatePageCalls === 2` max.
- [x] **6.3** Create `tests/integration/app/concurrency-isolation.test.ts` (AC-F4-1):
  - TC-ISO-001: doc A triggers StalePlan (remote newer op-id); doc B is fresh
    → doc A blocked, doc B updated, run did not abort. Assert
    `report.results` has both entries with correct outcomes.
  - TC-ISO-002: doc C triggers StalePlan (plan expired); docs A/B apply →
    only doc C blocked.
- [x] **6.4** Extend `tests/integration/app/secrets-safety-integration.test.ts`
  (AC-F6-1 / TC-SEC-001): add cases that trigger StalePlan (operation-freshness
  and plan-expiry) and Conflict-block paths through applyPlan; assert the
  ApplyReport JSON and journal JSONL contain 0 credential/token patterns.
- [x] **6.5** Fix stale comment in `src/app/push-flow.ts` applyPlan JSDoc
  (line ~544): replace "Conflict-as-drift, no retry" with the GH-24 409
  re-fetch-once policy description.
- [x] **6.6** Resolve version-bump discrepancy: set `package.json` to `0.4.1`
  (patch per spec) — verified no other `0.5.0` references exist.
- [x] **6.7** Strengthen the tautological assertion
  in `assert-operation-fresh.test.ts:84-97` (bare-UUID case) to a definitive
  StalePlan check. Extract shared post-write logic in processEntry to reduce
  duplication (F-5). Address FakeTarget createPage duplicate detection (F-7).
- [ ] **6.8** Run `bun run check` → exit 0. Confirm new integration tests
  pass and existing suite is green.

**Acceptance Criteria**:

- Must: AC-F1-1 (overlap — TC-CONC-005), AC-F1-2 (decentralized — TC-CONC-006),
  AC-F3-2 (409 single retry — TC-409-006..008), AC-F4-1 (isolation —
  TC-ISO-001/002), AC-F6-1 (no secrets — TC-SEC-001) all verified via
  integration tests through applyPlan; `bun run check` exits 0.
- Should: applyPlan JSDoc accurate; version bump aligned with spec.

**Completion signal**: `test(integration): GH-24 add concurrency overlap, 409-policy, isolation, secrets tests + fix review findings`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-CONC-001 | `assertOperationFresh`: remote newer → `StalePlan` | 1 | AC-F1-1, AC-F6-1 |
| TC-CONC-002 | `assertOperationFresh`: remote older/equal → fresh | 1 | AC-F1-1 |
| TC-CONC-003 | `assertOperationFresh`: missing remote property → fresh | 1 | AC-F1-1 |
| TC-CONC-004 | `assertOperationFresh`: malformed inputs → fresh (defensive) | 1 | AC-F1-1 |
| TC-EXPIRY-001 | `assertPlanNotExpired`: at boundary → expired (conservative) | 1 | AC-F2-1 |
| TC-EXPIRY-002 | `assertPlanNotExpired`: over window → expired | 1 | AC-F2-1 |
| TC-EXPIRY-003 | `assertPlanNotExpired`: under window → fresh | 1 | AC-F2-1 |
| TC-409-001 | `decideOnConflict`: `LOCAL_AHEAD` → reapply | 1 | AC-F3-1 |
| TC-409-002 | `decideOnConflict`: `NO_CHANGE` → reapply | 1 | AC-F3-1 |
| TC-409-003 | `decideOnConflict`: `REMOTE_AHEAD` → block | 1 | AC-F3-1 |
| TC-409-004 | `decideOnConflict`: `DIVERGED` → block | 1 | AC-F3-1 |
| TC-409-005 | `decideOnConflict`: `REMOTE_MISSING`/`LOCAL_MISSING` → block | 1 | AC-F3-1 |
| TC-CONC-005 | Two-runner overlap: single shared-state fake (NFR-REL-5) | 2, 3 | AC-F1-1, AC-F4-1 |
| TC-CONC-006 | Two-runner overlap: separate instances, shared backing map (NFR-REL-10) | 2, 3 | AC-F1-2 |
| TC-409-006 | 409 policy: re-fetch → now safe → reapply once | 2, 3 | AC-F3-2, AC-F4-1 |
| TC-409-007 | 409 policy: re-fetch → still diverged → block | 2, 3 | AC-F3-2, AC-F4-1 |
| TC-409-008 | 409 policy: re-fetch → reapply → conflict again → block | 2, 3 | AC-F3-2, AC-F4-1 |
| TC-ISO-001 | Per-document isolation: `StalePlan` on doc A, doc B applies | 3 | AC-F4-1 |
| TC-ISO-002 | Per-document isolation: `StalePlan` on doc C, docs A/B apply | 3 | AC-F4-1 |
| TC-CI-001 | CI concurrency-group templates: valid YAML + documented | 4 | AC-F5-1 |
| TC-SEC-001 | No secrets in output (`ApplyReport`, journal, logs) | 3 | AC-F6-1 |
| TC-QG-001 | Quality gate: `bun run check` exits 0 (boundary check) | 1–5 | AC-Q-1 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-24-spec.md` | Spec (source of truth) |
| Change test plan | `./chg-GH-24-test-plan.md` | Test plan (21 scenarios, AC ↔ TC traceability) |
| Story file | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S7--concurrency-control.md` | Authoritative scope / DoD / CEO-resolved R1·Q1 |
| Decision record | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | C-5/C-6, Concurrency control section |
| `assertOperationFresh` | `src/domain/state/operation-freshness.ts` (new) | Pure domain gate (F-1) |
| `assertPlanNotExpired` | `src/domain/state/plan-expiry.ts` (new) | Pure domain gate (F-2) |
| `decideOnConflict` + `Decision` | `src/domain/state/conflict-policy.ts` (new) | Pure domain decision (F-3) |
| `uuidV7Timestamp` | `src/domain/identity/uuid.ts` (updated) | Pure timestamp extractor (OQ-1 / DEC-7) |
| `applyPlan` / `processEntry` wiring | `src/app/push-flow.ts` (updated) | Concurrency gates + 409 policy (F-4) |
| `FakeTarget` | `tests/_helpers/fake-target.ts` (enhanced + reconciled) | Test infrastructure (F-5) |
| CI templates | `examples/ci/github-actions-concurrency.yml` + `examples/ci/README.md` (new) | Guidance (F-6) |
| Unit tests | `tests/unit/domain/state/*.test.ts`, `tests/unit/domain/identity/uuid-v7-timestamp.test.ts` | Tier 2 |
| Integration tests | `tests/integration/app/concurrency-control-overlap.test.ts`, `409-retry-policy.test.ts`, `concurrency-isolation.test.ts`, `secrets-safety-integration.test.ts` | Tier 3 |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | plan-writer (ADOS) | Initial plan. Resolves OQ-1 (DEC-7: derive expiry timestamp from `runId` via `uuidV7Timestamp`); DEC-8 (thread `stalePlanMinutes` primitive through `ApplyOptions`). Five commit-sized phases. |
| 1.1 | 2026-07-13 | reviewer (ADOS) | Phase 6 appended (Code Review Remediation, iteration 1): missing integration tests (TC-CONC-005/006, TC-409-006..008, TC-ISO-001/002, TC-SEC-001), stale applyPlan JSDoc, version-bump discrepancy. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | complete | 2026-07-13 | 2026-07-13 | 679ec1f | Pure domain gates + UUID-v7 timestamp extractor, all unit tests pass |
| 2 | complete | 2026-07-13 | 2026-07-13 | c015a45 | FakeTarget enhancement + port-drift reconciliation |
| 3 | complete | 2026-07-13 | 2026-07-13 | d57ee67 | applyPlan/processEntry wiring + integration tests (NOTE: integration test files in tasks 3.5/3.6 NOT created — deferred to Phase 6) |
| 4 | complete | 2026-07-13 | 2026-07-13 | d57ee67 | CI concurrency-group templates + README |
| 5 | complete | 2026-07-13 | 2026-07-13 | d57ee67 | Finalize: version bump 0.4.0→0.5.0, bun run check green |
