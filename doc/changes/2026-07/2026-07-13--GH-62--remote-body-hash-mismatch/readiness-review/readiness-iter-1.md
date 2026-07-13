# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-62
Date: 2026-07-13
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Verification Performed (source-code confirmed)

The PM's deeper root-cause analysis was independently verified against source:

1. **Hash-domain mismatch CONFIRMED.** `classifier.ts:52` computes
   `remoteChanged = remote.bodyHash !== base.renderedBodyHash`. `remote.bodyHash`
   is `rawHash(page.body)` — sha256 of the Storage XHTML *string* (set at
   `push-flow.ts:289` and `:893`). `base.renderedBodyHash` is
   `binding.renderedBodyHash`, which is `entry.hashes.canonicalHash` — sha256 of
   `stableStringify(canonicalize(hast))`, the JSON-canonicalized HAST *tree*
   (set at `push-flow.ts:1112`; `canonicalize.ts:43-44`). Different inputs →
   these hashes can NEVER match regardless of Confluence normalization.

2. **SharedBase lacks remoteBodyHash CONFIRMED.** `sync-state.ts:30-37` defines
   `SharedBase` without a `remoteBodyHash` field. The classifier cannot access
   the last-known-remote raw hash.

3. **PageBinding.remoteBodyHash EXISTS CONFIRMED.** `page-binding.ts:16` has
   `remoteBodyHash: string` (required). Always populated at create
   (`push-flow.ts:1113`) but with the wrong value (`canonicalHash`).

4. **Update path stale remoteBodyHash CONFIRMED.** `finalizeSuccessfulUpdate`
   (`push-flow.ts:634`) spreads `...binding`, carrying the stale
   `remoteBodyHash` from create time. Never refreshed.

5. **Three-part fix is SOUND.** Fetch-back + SharedBase.remoteBodyHash +
   raw-to-raw classifier comparison correctly separates local drift
   (canonical-to-canonical) from remote drift (raw-to-raw).

6. **System spec contradiction CONFIRMED.** `feature-safe-publish.md:71-72`
   states drift detection runs "over canonical semantic hashes" and
   "`rawHash` is informational only." This change makes rawHash load-bearing
   for remote drift — a direct contradiction requiring doc reconciliation.

7. **OQ-1 (fallback to rawHash(renderedBody)) is SOUND.** Same hash domain
   (raw); only risk is a one-time false-positive block if Confluence
   normalized and fetch-back failed simultaneously (≤0.1% × normalization rate).

8. **OQ-2 (fetch-back after asset upload) is SOUND.** The rendered body
   already contains `<ri:attachment>` references; upload doesn't change the
   body string. After-upload ordering is cleaner.

## Findings

1. [major] ac_quality / cross_artifact_consistency — chg-GH-62-spec.md §17 (AC table)
   Gap: The AC ID `AC-F5-1` is assigned to TWO distinct criteria — line 279
   ("fetch-back succeeds → remoteBodyHash equals rawHash(fetchedBody)") and
   line 283 ("fetch-back fails → fallback hash + warning"). AC IDs must be
   unique and non-overlapping. The test plan propagates the collision as
   "AC-F5-1 (duplicate)" (test-plan lines 73, 117, 161, 279), and the plan
   references "AC-F5-1 duplicate" (plan line 48, 161, 279). This creates
   genuine traceability ambiguity: TC-FETCH-003 cannot unambiguously trace to
   a single AC.
   Suggested remediation target phase: specification
   Suggested fix: Rename the failure-handling AC (line 283) to `AC-F5-3` and
   update all references in test-plan and plan.

2. [major] plan_doc_update_coverage — chg-GH-62-plan.md Phase 5.2
   Gap: Plan lists feature-safe-publish.md §3.1 doc reconciliation as
   conditional ("Reconcile … if needed"), but PM notes (line 78-84)
   definitively establish that §3.1 says "`rawHash` is informational only"
   while this change makes rawHash load-bearing for remote drift detection.
   The contradiction is confirmed (feature-safe-publish.md:71-72). The plan
   should make this a MUST, not a conditional. Additionally, the authoritative
   doc reconciliation belongs in lifecycle phase 7 (system_spec_update,
   @doc-syncer) — the plan should explicitly flag it for that phase rather
   than burying it in delivery Phase 5.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Change Phase 5.2 from "if needed" to a definite task; add
   an explicit note that feature-safe-publish.md §3.1 drift-detection
   description MUST be updated in lifecycle phase 7 (system_spec_update) to
   reflect raw-to-raw remote comparison.

3. [minor] plan_coverage / plan_code_area_coverage — chg-GH-62-plan.md Phase 2, task 2.4
   Gap: Task 2.4 mentions only "computePlan (~lines 300-307)" for
   SharedBase.remoteBodyHash construction. There is a SECOND SharedBase
   construction site in the 409 reapply path (push-flow.ts:881-888) that also
   needs the `remoteBodyHash` field added. Task 2.3 covers fetch-back in the
   409 path but does not explicitly mention the SharedBase field. The
   TypeScript compiler will catch the omission (required field), but the plan
   should list it explicitly for blast-radius clarity.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Extend task 2.4 to explicitly list both SharedBase
   construction sites: computePlan (~line 300) and 409 reapply (~line 881).

4. [minor] system_spec_consistency — chg-GH-62-spec.md §8.5 vs §19
   Gap: §8.5 states "treat missing remoteBodyHash as empty string" as a
   backward-compat migration strategy, but §19 states "no data migration
   required" and the code always populates remoteBodyHash at create
   (push-flow.ts:1113). The "empty string" fallback is dead guidance — the
   field is never actually missing from any binding created by the current
   code. The two sections are internally inconsistent.
   Suggested remediation target phase: specification
   Suggested fix: Align §8.5 with §19: remove the "empty string" fallback or
   restate it accurately (existing bindings have remoteBodyHash set to
   canonicalHash; first sync after fix overwrites with correct raw hash via
   fetch-back).
