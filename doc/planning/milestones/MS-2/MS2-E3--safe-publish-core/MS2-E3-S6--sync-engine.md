---
id: MS2-E3-S6
title: "sync-engine"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 4d
gh_issue: GH-23
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006, ADR-0010, ADR-0011]
dependencies: { blocks: [], blocked_by: [MS2-E1-S2, MS2-E3-S1, MS2-E3-S2, MS2-E3-S3, MS2-E3-S4, MS2-E3-S5] }
cross_cutting: [INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, NFR-REL-5, NFR-PERF-4, NFR-REL-7, NFR-REL-9]
---

# MS2-E3-S6 — Sync engine (plan → apply → verify)

## Goal
The use-case orchestration that ties the trust wedge together: discover → parse → render → hash → fetch remote → classify → **plan** (dry-run, reviewable) → **apply** (create/update/no-op/move per document, parent-first, per-document isolation, journaled) → update lock + property. Honors all invariants: no silent overwrite (INV-SAFE-1), remote-missing block (INV-SAFE-2), duplicate-UUID fatal (INV-SAFE-3), overlapping plans (NFR-REL-5), semantic idempotency (NFR-PERF-4), partial-apply recovery (NFR-REL-7), per-version provenance (NFR-REL-9).

## Background
This is the `marksync plan` + `marksync sync` core (blueprint §1 `app/push-flow.ts`, architecture push-flow diagram). It depends on ALL of E3-S1..S5 + spike E1-S2 (version.message limit). It produces a `CommandResult` (E2-S3) consumable by the CLI and CI.

## Detailed scope (deliverables)
1. **`src/app/push-flow.ts`** — `computePlan(config, lock, git, target): Result<Plan, MarkSyncError>`:
   - `assertBranchAllowed` (E3-S2) — deployment gate first.
   - `detectDuplicateUuids` (E3-S1) — INV-SAFE-3 fatal gate; zero writes on duplicate.
   - discover docs (via git port `readCommitted` — E3-S3/TDR-0003) → select (E2-S2).
   - parse Markdown (E3-S3) → **render + hash each doc via `target.renderBody(mdast)` (the `TargetSystem` port — E3-S4)** → local `ContentHash`. The body renderer is Confluence-specific, so it lives behind the port (architecture-overview §"Internal interface contracts" `renderBody`).
   - **resolve cross-page links** (`[x](other.md)` → target page ID/URL) via the Link Resolver (owned here — `src/domain/hierarchy/link-resolver.ts`); unresolved links → warn (never silently emit a broken URL). Drives parent-first ordering.
   - fetch remote state per binding (E3-S4 port) → `RemoteState`.
   - classify each (E3-S5) → `SyncState` → `Action`.
   - emit a `Plan`: `{runId, operationId, entries:[{uuid, sourcePath, state, action, hashes}]}`. **Dry-run returns here; no writes.**
2. **`applyPlan(plan, target, lock): Result<ApplyReport, MarkSyncError>`**:
   - **Parent-first ordering** for creates/moves (hierarchy).
   - **Per-document isolation**: a failure on one doc (e.g. `Conflict`) does NOT block others; collect results per doc.
   - **Journal each mutation immediately** (`src/app/journal.ts` → `.marksync/journal/<run-id>.jsonl`) before updating the lock — NFR-REL-7 partial-apply recovery.
   - On `update`: send `version:{number:base.version+1, message: formatVersionMessage(...)}` (E3-S4 provenance, blueprint §5).
   - On `Conflict` (409): do NOT retry blindly — surface as drift (the plan is now stale); E3-S7 handles operation-ID dedup + stale-plan expiry.
   - After successful apply per doc: update the binding in memory, then **atomically save the lock** (E3-S2) and **put the `marksync.metadata` property** (E3-S4) — cross-check agrees after success.
3. **`src/app/journal.ts`** — `<run-id>.jsonl` writer: append one `{ts, op, pageId, uuid, outcome}` per mutation. `replayJournal(runId)` for partial-apply recovery (used by E4-S4 repair).
4. **Idempotency (NFR-PERF-4)** — a second unchanged push: every entry classifies `NO_CHANGE` → `applyPlan` writes **0** pages. Proven by test.
5. **Provenance wiring (NFR-REL-9)** — `formatVersionMessage(headSha, branch, path, includedCommits, limit)` per blueprint §5 + spike E1-S2 limit. Compact trim with `+M more` marker; full list ONLY in local output.
6. **Plan/apply CommandResults** — wire to E2-S3 `CommandResult<Plan>` and `CommandResult<ApplyReport>`; the `plan`/`sync` commands are thin shells calling these.
7. **BDD/invariant hooks** — the engine is what the E5-S1 Gherkin scenarios drive (INV-SAFE-1/2/3, INV-SEC-1).

## Technical approach
- The plan is PURE (no writes) — fully unit-testable with mocked git/target ports.
- Apply is the only write path; it journals before lock-update (crash safety: a crashed apply leaves a journal that `repair-state` replays).
- **`runId` = UUID v7** (time-sortable) — pins E3-S7's operation-id ordering. Operation ID: `op_<runId>`; stored in `marksync.metadata.operationId` and the lock; a replayed plan with a stale operation ID is rejected (E3-S7).
- Bounded writes (ADR-0010 C-3): serialize page writes (or small bounded concurrency) to stay rate-limit-friendly.

## Interface contracts (what other stories consume)
- `computePlan` / `applyPlan` consumed by `plan`/`sync` commands (E2-S3 shells).
- `Plan` + `ApplyReport` types → `CommandResult` → JSON output (CI/agents).
- Journal consumed by E4-S4 (repair-state replay).
- Operation-ID + version.message consumed by E3-S7 (concurrency dedup) and E4-S3 (provenance panel).

## Acceptance criteria (testable)
- [ ] **INV-SAFE-1:** a `REMOTE_AHEAD`/`DIVERGED` entry → `applyPlan` performs NO write for that doc; reports the block. (BDD in E5-S1.)
- [ ] **INV-SAFE-2:** `REMOTE_MISSING` → NO re-create without `--adopt`/`--rebind`. (BDD.)
- [ ] **NFR-REL-5:** two overlapping plans (E3-S7 provides the policy) — the older does not overwrite the newer (the 409 surfaces as drift). (BDD in E5-S1.)
- [ ] **NFR-PERF-4:** second unchanged push → 0 writes (assert write-count via a mock target).
- [ ] **NFR-REL-7:** crash the apply after K of N docs (test hook) → the journal has K entries; `replayJournal` resumes without duplicates (idempotent re-apply of journaled ops).
- [ ] **NFR-REL-9:** each applied page version's `version.message` starts with `marksync:squash` + head SHA + path; over-limit included-commit lists trim deterministically with `+M more`.
- [ ] Parent-first: a child page create before its parent fails gracefully (test fixture) — apply reorders parent-first.
- [ ] **Cross-page links:** `[x](other.md)` resolves to the target page reference; an unresolvable link → warning (no broken URL emitted silently).
- [ ] Per-document isolation: one `Conflict` does not abort the whole run; other docs still apply.
- [ ] Lock + property updated atomically after a successful per-doc apply; reconcileWithProperty agrees.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | computePlan with fixtures (each state → action), idempotency (0 writes on 2nd push), parent-first ordering, journal append/replay, version.message formatting + trim |
| Integration | applyPlan against `Bun.serve` mock target: create/update/no-op/move/conflict/forbidden; crash→replay; lock+property update |
| BDD | INV-SAFE-1/2/3, INV-SEC-1 (no token in plan/apply output), NFR-PERF-4 (wired by E5-S1) |
| E2E | (E5-S1) real sandbox plan+apply+verify |

## Definition of Done
plan + apply orchestration; all invariants honored; idempotent; journaled; provenance wired; lock+property atomically updated; recoverable from partial apply. AC list is the DoD.

## Out of scope
- The 409 retry/dedup/stale-plan-expiry logic (E3-S7) — this engine surfaces `Conflict`; E3-S7 decides retry-vs-abort.
- Mermaid/attachment upload orchestration (E4-S1/E4-S2) — the engine calls the asset resolver hooks those stories provide.
- Reverse sync (MS-0005+).

## Risks / open questions (CEO-resolved)
- **R1:** Cross-page transaction (Confluence has none). → Global plan validation, parent-first execution, per-doc journaling + isolation; no atomic multi-page guarantee. ADR-0006 fixed constraint. CEO-recorded.
- **Q1:** Concurrency of writes. → Serialize page writes by default (bounded concurrency = 1 for MS-0002; revisit if perf needs it). ADR-0010 C-3. Confirmed.
