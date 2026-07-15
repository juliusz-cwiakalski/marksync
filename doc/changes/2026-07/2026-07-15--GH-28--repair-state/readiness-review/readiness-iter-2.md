# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-28
Date: 2026-07-15
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iteration 1 Finding Resolution (all RESOLVED)

### Finding 1 [critical / BLOCKER] — RESOLVED

**Claim:** Plan's Stage-2 trigger (crash-window candidate count) was FALSE for the real
`crashAfter` post-crash state → remaining N−K docs never written → AC-F2-1 fails.

**Verified fixes:**
- **Code re-verified:** `src/app/push-flow.ts` 729-791 (`finalizeSuccessfulUpdate`:
  `journal.append` → fetch-back → binding update → `saveLock` → `putProperty`) + 870-873
  (`crashAfter` throws AFTER `processEntry` returns). So `crashAfter: K` leaves docs 1..K
  fully committed (lock + property consistent). The premise holds.
- **Plan §"Resolved OQ-1" Stage 2 + Phase 2 tasks 2.3/2.5:** trigger redefined to
  **journal presence** ("set `interruptedRunDetected = true` whenever a latest journal run
  is present — NOT crash-window candidate count"). Stage 2 re-runs `computePlan` +
  `applyPlan` idempotently. After `crashAfter: K`, a journal exists → Stage 2 runs →
  already-applied docs classify `NO_CHANGE` (0 writes); remaining N−K written once.
  AC-F2-1 is now achievable.
- **Spec §2.1 + AC-F2-1 + §5.1 F-2 + §6 Flow 2 + Appendix B:** now distinguish
  scenario 1 (post-transaction interruption, `crashAfter`-reproducible, idempotent re-run)
  from scenario 2 (mid-transaction crash window, manual fixture, rebuild-from-remote).
- **Robustness check (edge):** a fully-completed (non-interrupted) sync also leaves a
  journal → Stage 2 would run → all `NO_CHANGE` → 0 writes. Plan explicitly addresses
  this ("re-running it whenever a journal indicates a prior run is safe — a fully-completed
  run would resolve entirely to NO_CHANGE"). No AC-F1-1 regression: a pure dirty-lock with
  a leftover journal still yields 0 page writes (Stage 1 rebuilds the binding in-memory;
  Stage 2's `computePlan` sees the rebuilt binding → `NO_CHANGE`).

**Status: RESOLVED.** cross_artifact_consistency + plan_coverage restored.

### Finding 2 [major / MAJOR] — RESOLVED

**Claim:** `REPAIRED_CRASH_WINDOW` + the Stage-1 rebuild-from-remote path were untestable
(`crashAfter` cannot reproduce the mid-transaction window).

**Verified fixes:**
- **Test plan TC-REPAIR-009:** now constructs a **manual journal-ahead-of-lock fixture**
  (writes `<cacheDir>/journal/<run-id>.jsonl` directly with one `outcome:"success"` entry
  whose binding is NOT in the committed lock), remote reflects the journaled op, asserts
  `getWriteCount() === 0` + `diagnosticCode: "REPAIRED_CRASH_WINDOW"`. This reproduces
  scenario 2 and exercises the RSK-1 safety branch.
- **Plan Phase 1.1 + Phase 2 task 2.3/2.4:** Stage 1 carries both dirty-lock rebuilds
  (`REPAIRED_STALE_LOCK`) and scenario-2 crash-window rebuilds (`REPAIRED_CRASH_WINDOW`),
  with explicit note that `crashAfter` never produces the latter.

**Status: RESOLVED.** test_traceability restored; the load-bearing safety branch (RSK-1)
is now exercised.

### Finding 3 [major / MAJOR] — RESOLVED

**Claim:** AC-F5-2 (lock+journal both gone) needs `FakeTarget.searchPages` to return
results; the plan's "graceful degradation" hedge directly violated AC-F5-2.

**Verified fixes:**
- **Code re-verified:** `tests/_helpers/fake-target.ts` 332-334 — `searchPages` returns
  `Res.ok([])`. Confirmed extension is required.
- **Plan RSK-R1 + §"Open questions" + Phase 5 task 5.8:** **firm commitment** to extend
  `FakeTarget` with a programmable `searchPages` result (`setSearchResults(results)` setter
  or constructor option). The "0 rebuildable items / violates no AC" hedge is **removed**;
  plan now states returning `[]` "would directly violate AC-F5-2." TC-REPAIR-013 subtest 2
  references `fakeTarget.setSearchResults([...])`.

**Status: RESOLVED.** plan_coverage + test_traceability restored; no remaining hedge.

### Finding 4 [minor / MINOR] — RESOLVED

**Claim:** TC-REPAIR-011 divergence used version-only; `remoteChanged` uses bodyHash, not
version → a vacuously-passing test.

**Verified fixes:**
- **Code re-verified:** `src/domain/state/classifier.ts` 51-54 —
  `remoteChanged = remote.bodyHash !== base.remoteBodyHash || parentPageId mismatch`.
  `version` is NOT consulted. Premise holds.
- **Test plan TC-REPAIR-011 step 4:** now changes the remote **body** (`body: "<h1>Modified
  by user</h1>"` so `bodyHash` differs), explicitly annotated "the divergence trigger;
  `remoteChanged` uses bodyHash, not version alone." Version advance is optional.
- **Plan Phase 5 task 5.6:** mirrors the body-change requirement ("advanceVersion + body
  change, or a version-ahead fixture").

**Status: RESOLVED.** test_traceability restored.

### Finding 5 [minor / MINOR] — RESOLVED

**Claim:** NG-5 (stale parked-plan advisory) deferral lacked explicit owner sign-off.

**Verified fix:** `chg-GH-28-pm-notes.yaml` `notes` array carries an explicit
`type: decision` entry (dated 2026-07-15): "PM sign-off (Finding 5): stale parked-plan
expiry advisory deferred as NG-5 — confirmed correct for MS-0002 (computePlan is pure/
ephemeral, not persisted to disk; no parked plan to expire). Owner-approved."

**Status: RESOLVED.** decision_capture satisfied.

### Finding 6 [minor / MINOR] — RESOLVED

**Claim:** Stage-2 operationId freshness assumption unstated.

**Verified fixes:**
- **Plan §"Resolved OQ-1" Stage 2 + Phase 2 task 2.5:** "the fresh `operationId`/`runId`
  from this `computePlan` is newer (UUID-v7 time-prefix) than the crashed run's, so
  `assertOperationFresh` passes for the already-applied docs (which are `NO_CHANGE`
  regardless)."
- **Code re-verified (no change needed):** newer-plan-vs-older-remote passes the freshness
  gate (`operation-freshness.ts`, per iter-1 review). Assumption now documented.

**Status: RESOLVED.** plan_coverage restored.

## New Findings Introduced by the Corrections (all nit — non-blocking)

### N1. [nit] test_traceability — test-plan TC-REPAIR-009 step 4 (manual fixture JSONL shape)

**Gap:** The fixture entry `{"op","pageId","uuid","outcome","version","timestamp"}` uses
field names that do not match the real `JournalEntry` interface
(`src/app/journal.ts` 14-20 = `{ ts, op, pageId, uuid, outcome }`). The fixture uses
`timestamp` instead of `ts` and adds a non-existent `version` field. `replayJournal` is
shape-agnostic (`JSON.parse` + cast, skipping malformed lines), so the fixture will parse
and the repair will read the fields it needs (`outcome`/`pageId`/`uuid` are present) — the
test is achievable as designed. The mismatch is cosmetic but could mislead the coder.
**Suggested remediation target phase:** delivery (coder aligns the fixture to the real
`JournalEntry` shape when writing TC-REPAIR-009; no artifact revision required for DoR).
**Not blocking** — the fixture is illustrative and functionally valid.

### N2. [nit] test_traceability — test-plan TC-REPAIR-011 step 4 (`fakeTarget.setPage`)

**Gap:** TC-REPAIR-011 step 4 references `fakeTarget.setPage(pageId, {...})`, but
`FakeTarget` (`tests/_helpers/fake-target.ts`) has no `setPage` method (available body/page
mutators: `addFixture`, `advanceVersion`). The divergence intent (change the body so
`bodyHash` differs) is clear and correct; the plan's Phase 5 already extends `FakeTarget`
(for `setSearchResults`), so adding a body-mutation helper is in-scope and trivial.
**Suggested remediation target phase:** delivery (coder adds the helper or reuses
`addFixture` to overwrite the page body; no artifact revision required for DoR).
**Not blocking.**

### N3. [nit] cross_artifact_consistency — test-plan TC-REPAIR-007 step 9 (scenario label)

**Gap:** Step 9 parenthetical calls the completed doc-3 item "completed the crash window
doc" — scenario-2 terminology applied to a scenario-1 (`crashAfter`) test. Per the plan
(Phase 5 task 5.2), doc 3 is completed via the idempotent Stage-2 `applyPlan` re-run, NOT a
crash-window rebuild. The asserted diagnostic classes (2 `skipped` + 1 `repaired`) and write
counts are correct; only the label conflates the two scenarios.
**Suggested remediation target phase:** test_planning (cosmetic; re-label to "remaining doc"
or "completed via idempotent re-run"). **Not blocking.**

### N4. [nit] decision_capture — test-plan §9 (missing v1.1 revision-log entry)

**Gap:** The spec (§25) and plan (Plan Revision Log) both carry a v1.1 entry documenting the
DoR correction. The test plan §9 shows only v1.0 despite being corrected (TC-REPAIR-009
manual fixture, TC-REPAIR-011 body change). Provenance gap only.
**Suggested remediation target phase:** test_planning (append a v1.1 row). **Not blocking.**

## Ticket Coverage Check (GH-28 issue + story MS2-E4-S4)

Story ACs (the DoD) all traced:
- NFR-REL-7 / R-USA-3 (interrupted apply, no duplicates) → AC-F2-1/F2-2, TC-007/008/009. ✓
- Stale lock recovery → AC-F1-1, TC-005/006. ✓
- No silent overwrite (INV-SAFE-1) → AC-F5-1, TC-011/012. ✓
- Diagnostics + dry-run → AC-F3-1/F4-1, TC-001..004/010. ✓
- `bun run check` green → AC-CI-1, Phase 7. ✓
- Story deliverable "stale plan advisory" deferred as NG-5 with PM sign-off (Finding 5). ✓
- CEO-resolved R1 (journal-lost fallback) → AC-F5-2 / DEC-6, TC-013. ✓
- CEO-resolved Q1 (no auto-run) → DEC-5 / NG-3. ✓

## Gate Result

**READY.** All 6 iteration-1 findings are RESOLVED, verified against source
(`push-flow.ts` crashAfter/finalizeSuccessfulUpdate ordering; `classifier.ts` bodyHash-based
`remoteChanged`; `reconcile.ts` RebuildInput shape; `fake-target.ts` searchPages=[];
`journal.ts` JournalEntry shape). The headline BLOCKER (AC-F2-1 / NFR-REL-7 / R-USA-3
unachievable) is fixed: Stage-2 now triggers on journal presence, so the remaining N−K docs
complete via an idempotent `computePlan`+`applyPlan` re-run. The two-scenario framing is
consistent across spec §2.1/§5.1/§6/Appendix B, the plan OQ-1 resolution + Phase 2 tasks,
and the test plan TC-007/008 (scenario 1) vs TC-009 (scenario 2).

Four nit-level NEW observations (N1-N4) were introduced/left over by the corrections. None
breach any DoR facet: each is a cosmetic or implementation-time detail the coder resolves
naturally while writing tests against the real `JournalEntry`/`FakeTarget` types. No pause
flag. No human escalation needed.

**Reopen:** none. Delivery (phase 6) may proceed.
