# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-23
Date: 2026-07-12
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

## Prior-Finding Resolution Status

1. [iter-1 #1, MAJOR, cross_artifact_consistency] TC-INTEGRATION-009 throw-vs-err — **RESOLVED.**
   Evidence verified:
   - `chg-GH-23-test-plan.md` line 762 title now "rejected with **throw**, 0 shell-execution surfaces"; line 779 `expect(() => shellGit.readCommitted("HEAD", [maliciousPattern])).toThrow()`; line 783 `expect(() => shellGit.headSha(maliciousRef)).toThrow()`; lines 788/790/795 "Every malicious path/ref fixture is rejected with a throw (invariant violation)" + "The guard throws (invariant violation) because the error model has no `BadPath`/`BadRef` arms (DM-8/NG-6 forbid adding them)."
   - Plan Phase 6.7 (line 1020–1024) and Acceptance Criteria (line 1068–1070) and Test Scenarios row (line 1305) all prescribe the **throw**, explicitly "throw, NOT `Result.err` — DM-8 forbids new `BadPath`/`BadRef` arms, per PD-3." Aligned with test plan.
   - `src/domain/errors.ts` re-verified: no `BadPath`/`BadRef`/`RefNotFound` arms exist in the `MarkSyncError` union. AC-F12-1 (spec line 408) is neutral ("rejected with 0 shell-execution surfaces") — no `Result.err` assertion at the AC level. No artifact now asserts `err({kind:"BadPath"|"BadRef"})`.

2. [iter-1 #2, MAJOR, spec_completeness] §5.1 F-1 pipeline ordering — **RESOLVED.**
   Evidence verified: `chg-GH-23-spec.md` line 126 now reads "(1) `assertBranchAllowed` …; (2) discover committed Markdown docs via the `Repository` port `readCommitted`; (3) `detectDuplicateUuids` — the INV-SAFE-3 fatal gate **over the discovered docs**." This matches §6 Flow 1 (lines 143–145: assertBranchAllowed → readCommitted → detectDuplicateUuids) and §24 Appendix (lines 479–481: same order). All three spec locations now agree (branch gate → discover → detect). `move` out-of-scope also marked: §7.2 line 224 "[OUT] Page move (`movePage` invocation) for MS-0002 … the engine does NOT invoke it … journal `op` enum is `create | update` for MS-0002 (DM-4); `move` is reserved" + DM-4 line 251 (`op: "create" | "update"`).

3. [iter-1 #3, MAJOR, test_traceability] INV-SAFE-3 + INV-SEC-1 integration-tier coverage — **RESOLVED.**
   Evidence verified:
   - TC-INTEGRATION-010 (test plan lines 801–834): integration-tier, `tests/integration/app/duplicate-uuid-fatal.test.ts`, REAL `detectDuplicateUuids` (not mocked), in-memory `Repository` + stub `TargetSystem` (both allowed mocks per test plan line 1056), asserts `computePlan` → `err(DuplicateUuid)` with 0 writes + no Plan at the orchestration boundary. INV-SAFE-3 enforcing logic is pure/adapter-independent, so faking the git port does not reduce confidence.
   - TC-INTEGRATION-011 (test plan lines 838–879): integration-tier, `tests/integration/app/secrets-safety-integration.test.ts`, REAL `classify`/`actionFor`/`formatVersionMessage`, `Bun.serve()` mock `TargetSystem` (real HTTP boundary), full `computePlan` → `applyPlan` flow asserting 0 fake-token occurrences across Plan JSON, journal JSONL, ApplyReport JSON, and every `version.message`. Genuinely integration-tier by the strategy's own characterization (line 31: "Confluence adapter (HTTP mock)").
   - Both appear in BOTH artifacts: test plan (traceability matrix lines 1040 + 1049; scenario table lines 206–207; §3.1 rows lines 81/90) AND plan (Phase 6.9/6.10 lines 1034/1045; Acceptance Criteria lines 1071–1076; Test Scenarios rows lines 1306–1307). Over-mocking guardrail (testing-strategy.md lines 111–113) satisfied: enforcing logic real, only I/O ports faked.

4. [iter-1 #4, MAJOR, plan_doc_update_coverage] Phase-7 doc-sync tier reclassification + readCommitted error column — **RESOLVED.**
   Evidence verified: plan Phase 8.5 (lines 1230–1250) now explicitly lists reclassifying `architecture-overview.md` §"Components / Core components" "Push executor" (line ~99) and "Lock/journal store" (line ~101) from `infrastructure` → `application` (realized by `src/app/push-flow.ts` + `src/app/journal.ts`), while keeping "Git adapter" (`src/infra/git/`) + `writeAtomic` (`src/infra/lock/store.ts`) as infrastructure. Lines 1221–1229 add explicit reconciliation of the `readCommitted` interface-contract error column (`RefNotFound`/`BadPath` → throw per PD-3; no `Result` error arms per DM-8). Premise verified against `architecture-overview.md`: the two rows ARE currently `infrastructure` and the `readCommitted` row DOES currently list `RefNotFound, BadPath`. Revision log entry 1.1 (line 1348) documents the surgical remediation.

## New Blocking Findings
None.

## Non-blocking Observations (advisory)

1. [MINOR] cross_artifact_consistency — `chg-GH-23-test-plan.md` TC-UNIT-001 "Notes / Clarifications" (line 240).
   Stale prose: "The duplicate-UUID gate runs after `assertBranchAllowed` but **before document discovery**." This contradicts the corrected spec ordering (branch gate → **discover** → detect) at §5.1 F-1, §6 Flow 1, and §24 Appendix, and is self-inconsistent with TC-UNIT-001's own steps (the fake `Repository` returning the two docs IS the discovery step). The test's actual steps/assertions are correct and will pass; only this one clarifying sentence is wrong. Suggested fix (one line): "The duplicate-UUID gate runs after `assertBranchAllowed` and **after document discovery** (it operates on the discovered docs), before any write." Remediation target: test_planning (cosmetic; not delivery-blocking).

2. [MINOR] cross_artifact_consistency — `chg-GH-23-test-plan.md` §1.1 (line 48), §4 integration-scope (line 157), and fixtures appendix (line 929).
   These still list "`move`" among the `applyPlan` integration scenarios/fixtures ("create/update/no-op/**move**/conflict/forbidden"), inconsistent with spec §7.1 (line 210 — `move` was correctly trimmed there), §7.2 line 224 (move OUT of scope for MS-0002), DM-4 line 251 (journal `op: "create" | "update"` only), and the absence of any move TC. No move test will be written (no TC, no AC, no requirement), so this is cosmetic; the spec side was fixed in this iteration but the test-plan side was missed. Suggested fix: drop `move` from the three test-plan scope/fixture enumerations. Remediation target: test_planning (cosmetic; not delivery-blocking).

3. [NIT] test_traceability — `chg-GH-23-test-plan.md` "Over-Mocking Guardrail Compliance" prose (line 1058).
   The compliance statement does not explicitly cite TC-INTEGRATION-010 / TC-INTEGRATION-011 as the integration-tier evidence for INV-SAFE-3 / INV-SEC-1 (the gap iter-1 #3 flagged). The evidence IS present in the traceability matrix (lines 1040 + 1049 show "Unit + Integration" for both ACs), so compliance is demonstrable; the prose just doesn't spell it out. Optional: add one sentence naming the two new integration TCs as the guardrail satisfaction. Remediation target: test_planning (cosmetic).

4. [NIT] test_traceability — TC-INTEGRATION-010 uses an in-memory `Repository` (allowed mock) rather than a real temp git repo.
   Compliant (INV-SAFE-3's enforcing logic `detectDuplicateUuids` is pure and adapter-independent; in-memory `Repository` is an explicitly allowed mock per line 1056), but it is functionally close to TC-UNIT-001. The temp-git-repo harness already exists for TC-INTEGRATION-009 (`createShellGit(tmp)`). Optional strengthening: drive TC-INTEGRATION-010 through the real shell-git adapter against a temp repo to match the testing-strategy integration-tier characterization ("Git adapter (temp repo)") and iter-1 #3's suggested fix A. Not required for guardrail compliance.

## Strengths (carried forward + new)

- All four iter-1 blockers were fixed surgically at the correct facet/phase with no scope creep; the revision log (plan entry 1.1) accurately describes the remediation.
- Cross-artifact alignment on the security-relevant throw contract is now airtight: spec DM-8 (no new arms) ↔ test plan TC-INTEGRATION-009 (toThrow) ↔ plan PD-3/Phase 6.7 (throw) ↔ source `errors.ts` (arms unchanged).
- The pipeline ordering is now consistent across all three spec locations (§5.1, §6, §24) and the plan (Phase 4).
- The two new integration TCs are traceable end-to-end (test-plan §3.1, scenario table, scenario details, traceability matrix, AND plan Phase 6 task list + acceptance criteria + test-scenarios table). No orphan TC, no uncovered AC.
- Phase-7 doc-sync list is now comprehensive: tier reclassification + error-column reconciliation + interface-contract additions + diagram tag + UL bindings + ADR retrospective, all with accurate line citations verified against the live `architecture-overview.md`.
- DoD (spec §17 AC table) intact; AC-F12-1 neutral to throw-vs-err so the TC-level throw fix needs no AC edit.
