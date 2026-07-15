# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-28
Date: 2026-07-15
Pause Required: no

## Facet Summary

- spec_completeness: PASS (one minor deferred-deliverable note, Finding 5)
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

### 1. [critical / BLOCKER] plan_coverage + cross_artifact_consistency + plan_feasibility — plan §"Resolved OQ-1" + Phase 2 tasks 2.3/2.5; spec §2.1 + AC-F2-1; test-plan TC-REPAIR-007/008

**Gap:** The headline AC (AC-F2-1 / NFR-REL-7 / R-USA-3 — the premortem §14 beachhead, a release blocker) is not achievable as designed. Verified against `src/app/push-flow.ts`: the `crashAfter` hook (lines 870-873) throws AFTER `processEntry` returns — i.e. AFTER `finalizeSuccessfulUpdate` has fully completed `journal.append` → fetch-back → binding update → `saveLock` → `putProperty` for the Kth document. So after a `crashAfter: 2` crash, the **on-disk committed lock already reflects docs A & B** (binding.sourceCommit === property.sourceCommit for both). The plan's Stage-2 gate (`interruptedRunDetected = true` only when ≥1 "crash-window candidate" exists, where a candidate requires `binding.sourceCommit !== property.sourceCommit`) is therefore **FALSE** for the real post-crash state → Stage 2 (`computePlan` + `applyPlan`) is **skipped** → the remaining N−K documents are **never written** → AC-F2-1 ("remaining N−K documents are completed") fails. The existing `tests/integration/app/crash-replay.test.ts` (lines 241-254) confirms this: it explicitly stops at asserting the journal has K entries and never completes recovery ("In a real recovery, we'd skip the journaled ops. For this test, we just assert that replayJournal returns the completed ops").

The three artifacts are inconsistent: test-plan TC-REPAIR-007 step 7 expects `getWriteCount() === 1` (doc C written) and TC-REPAIR-008 expects cumulative `=== 3`, but the plan's Stage-2 gating yields 0 writes for this scenario. The plan's own rationale ("the repair itself writes zero pages; all page writes flow through the reused applyPlan") is only true if Stage 2 actually runs.

**Suggested remediation target phase:** delivery_planning (primary) + specification (secondary)
**Suggested fix:**
- delivery_planning: redefine the Stage-2 trigger so the remaining docs are completed. Cleanest: on `--apply`, run `computePlan` + `applyPlan` whenever the latest journal exists with success ops OR `computePlan` still yields LOCAL_AHEAD/Update entries (rely on idempotency — already-applied docs classify `NO_CHANGE` → 0 writes; this preserves the "pure dirty-lock → 0 writes" goal because rebuilt-then-NO_CHANGE docs write nothing). Drop the gating on "crash-window candidates."
- specification: correct §2.1 and AC-F2-1 to state that `crashAfter` reproduces a **post-transaction** interrupted apply (K docs fully committed, N−K remaining), and that the recovery mechanism is an **idempotent `computePlan`+`applyPlan` re-run**, not a crash-window rebuild for this scenario.

### 2. [major / MAJOR] test_traceability + plan_feasibility — test-plan TC-REPAIR-004/§3.2 + plan Phase 1.1 (REPAIR_DIAGNOSTIC_CODES) + Phase 2 task 2.3/2.4

**Gap:** The `REPAIRED_CRASH_WINDOW` diagnostic code and the entire Stage-1 "rebuild journaled-but-not-locked binding from remote" path target a crash window **between** `journal.append` and `saveLock` that **no test reproduces**. `crashAfter` throws post-transaction (see Finding 1), and the plan declares `applyPlan` modifications out of scope (§7.2 / RSK-5), so no finer hook is provided. Result: a load-bearing safety branch (RSK-1: "misclassifying a crash-window op as a safe rebuild when the remote actually diverged → silent overwrite") and its diagnostic code are **untestable as specified**. TC-REPAIR-004 lists `REPAIRED_CRASH_WINDOW` as an expected stable code, but no TC emits it.

**Suggested remediation target phase:** test_planning + delivery_planning
**Suggested fix:** Either (a) add a test-only finer crash hook analogous to the existing `crashAfter` (e.g. `crashAfterJournal` / `crashAfterLock`) — this is a test hook, NOT a write-path/ordering change, so it does not violate the §7.2 exclusion — together with a TC that lands in the genuine journal-ahead-of-lock window and emits `REPAIRED_CRASH_WINDOW`; or (b) specify a manually-constructed journal-ahead-of-lock fixture (journal records success, lock reverted to pre-op state) and a TC that exercises the Stage-1 rebuild + the divergence-stop branch for that window (RSK-1).

### 3. [major / MAJOR] plan_coverage + test_traceability — plan Phase 5 task 5.8 / RSK-R1 vs AC-F5-2 / TC-REPAIR-013 subtest 2

**Gap:** AC-F5-2 requires that when BOTH lock and journal are gone, bindings are "rebuilt from the Confluence property + Git." The only page-discovery mechanism the plan names is `target.searchPages(cql)`, and `FakeTarget.searchPages` (tests/_helpers/fake-target.ts line 332-334) returns `[]`. The plan hedges ("if … cannot be configured … extend the mock minimally") and claims "graceful degradation to 0 rebuildable items" violates no AC — but degrading to 0 rebuildable items **directly violates AC-F5-2** (no rebuild from Confluence+Git occurs; no new lock is created). TC-REPAIR-013 subtest 2 unconditionally asserts a successful rebuild (3 `repaired` / `REPAIRED_REBUILD_FROM_REMOTE`, new lock created).

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Commit to extending `FakeTarget.searchPages` (seed from fixture pages / a configurable CQL result) so TC-REPAIR-013 subtest 2 can pass; remove the "graceful degradation violates no AC" claim, or explicitly narrow AC-F5-2 in the spec to "rebuild from Confluence+Git **for pages discoverable via searchPages**."

### 4. [minor / MINOR] test_traceability — test-plan TC-REPAIR-011 step 4

**Gap:** "Simulate divergence: remote body changed **or** remote version advanced beyond lock." Verified in `src/domain/state/classifier.ts`: `remoteChanged` is computed solely from `remote.bodyHash !== base.remoteBodyHash` or a `parentPageId` mismatch — `version` is **not** consulted. So `fakeTarget.advanceVersion(pageId)` alone (body unchanged) yields `NO_CHANGE`, not `REMOTE_AHEAD`/`DIVERGED`. The test must also change the remote body. Plan task 5.6 partly captures this ("advanceVersion + body change") but the test-plan step's "or" is misleading and could produce a vacuously-passing or confusingly-failing test.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Require a remote **body** change (and optionally a version bump) in TC-REPAIR-011; drop the "version advanced alone" phrasing.

### 5. [minor / MINOR] spec_completeness — spec NG-5 / §7.3 vs story deliverable #1 bullet 3

**Gap:** The story lists "Stale plan: if a parked plan is expired (E3-S7), advise regeneration" as a deliverable. The spec defers it (NG-5) with a sound rationale — verified: `computePlan` returns an in-memory `Plan` that is never persisted to disk, so no parked plan exists for MS-0002. The deferral is well-documented but is a story deliverable marked deferred without an explicit owner sign-off.

**Suggested remediation target phase:** specification
**Suggested fix:** Add an explicit owner/PM sign-off line for the NG-5 deferral in `chg-GH-28-pm-notes.yaml` (decisions), or confirm acceptance inline.

### 6. [minor / MINOR] plan_feasibility — plan Phase 2 task 2.5 (Stage 2 re-run, unstated freshness assumption)

**Gap:** Stage 2's `computePlan` generates a NEW `operationId` (UUID v7, newer than the crashed run's). `applyPlan` runs `assertOperationFresh(planOpId, remoteOpId)` per Update. Verified in `src/domain/state/operation-freshness.ts`: newer-plan-vs-older-remote → fresh (passes), so Stage 2 is not blocked — but this is an unstated assumption, and a future change to the freshness comparator could silently break repair.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Add a one-line note that Stage 2's fresh `operationId` is newer than the interrupted run's, so the operation-freshness gate passes (and `assertPlanNotExpired` passes since the repair runs immediately).

---

## Gate Result

**NOT_READY.** Finding 1 is a critical blocker: the plan's OQ-1 resolution (Stage-2 gated on crash-window candidates) does not achieve AC-F2-1 / NFR-REL-7 given the actual `crashAfter` semantics (throws post-transaction). The headline release-blocking recovery scenario would not complete the remaining documents.

**Reopen:** `delivery_planning` (Findings 1, 3, 6) and `test_planning` (Findings 2, 4), with a secondary `specification` touch for Finding 1's framing and Finding 5's sign-off. No `delivery` reopen. No pause required — no human input needed, just artifact revision.

**Verified TRUE code assumptions (no action):** `crashAfter` hook exists (`push-flow.ts` 870-873); `journal.append` precedes `saveLock` precedes `putProperty` in `finalizeSuccessfulUpdate` (729-791); `reconcileWithProperty` / `rebuildLockFromConfluence` / `MetadataProperty` / `RebuildInput` exist (`reconcile.ts`); `replayJournal` / `openJournal` / `JournalEntry` exist (`journal.ts`); `repair-state` is a registered stub (`router.ts` 198-208, `repair-state.ts`); `sync.ts` is the thin-handler pattern; `FakeTarget.getWriteCount`/`resetWriteCounter`/`setMetadataProperty`/`advanceVersion` exist (fake-target.ts); `uuidV7Timestamp` exists (uuid.ts); `classify` returns the six `SyncState` values (classifier.ts); `FakeTarget.searchPages` returns `[]` (fake-target.ts 332-334).
