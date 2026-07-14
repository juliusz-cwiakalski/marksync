# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-76
Date: 2026-07-14
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

1. [major] cross_artifact_consistency — chg-GH-76-test-plan.md §8.3 (OQ-1) +
   chg-GH-76-plan.md "Open questions" (line 57) + Phase 2 OQ-1 note (line 217)
   — **PERSISTENT from iter-1 finding 3**
   Gap: OQ-1 (full §3.3 rule set vs simplified subset) is now "Resolved
   (PM-decided)" in the spec §14 with DEC-5 recorded in the decision log, and
   the PM notes capture the rationale. However, the resolution was NOT mirrored
   to the other two artifacts:
   - Test plan §8.3 (line 811) still says OQ-1 is "Open (deferred to
     @decision-advisor)" — directly contradicting the spec's "Resolved
     (PM-decided)".
   - Plan "Open questions" section (line 57) still lists OQ-1 as open and says
     "Decision needed: consult `@decision-advisor` if simplification is
     warranted after Phase 2 validation" — this defers a decision INTO
     delivery (Phase 2), which is the exact gap flagged in iter-1.
   - Plan Phase 2 OQ-1 note (line 217) still frames it as potentially open
     ("If tests reveal rules that are unnecessary ... consult @decision-advisor
     before simplifying").
   The spec-level fix is correct; the downstream mirroring was not done. This
   is the same cross-artifact inconsistency on OQ-1's status as iter-1, now
   with the contradiction reversed (spec says resolved, test plan/plan say
   open).
   Suggested remediation target phase: test_planning + delivery_planning
   Suggested fix: (a) Update test plan §8.3 OQ-1 status to "Resolved
   (PM-decided): full §3.3 rule set — see spec DEC-5" (or remove OQ-1 from the
   open-questions table since it is no longer open). (b) Update the plan:
   remove OQ-1 from the "Open questions" section (or mark resolved with DEC-5
   reference); reframe the Phase 2 note to state the decision IS made (full
   rule set per DEC-5) and that any future simplification would be a NEW,
   separate decision — not a continuation of OQ-1 deferred into delivery.

2. [major] cross_artifact_consistency — chg-GH-76-spec.md §9 NFR-6 (line 215) +
   chg-GH-76-test-plan.md §3.3 (line 82) + TC-MERM-NORM-003 (line 368) +
   chg-GH-76-plan.md task 2.5 (line 260) + Phase 2 AC (line 276) + RSK-1
   (line 110) — **PERSISTENT from iter-1 finding 5**
   Gap: AC-F2-2 was correctly reworded from "0 visual differences" to "0
   structural differences in visual elements" with the note that pixel-level
   visual comparison is not available (happy-dom has no SVG layout engine per
   GH-11). However, the rewording was NOT mirrored to the 6 downstream locations
   that still assert "0 visual differences":
   - Spec NFR-6 (§9, line 215): "Normalized SVG renders identically to raw SVG
     (**0** visual differences; ...)" — AC-F2-2 traces to NFR-6; they now
     contradict (AC says structural, NFR says visual).
   - Test plan §3.3 NFR-6 coverage row (line 82): "Normalization safety (0
     visual differences)".
   - Test plan TC-MERM-NORM-003 Expected Outcome (line 368): "0 visual
     differences (identical layout, colors, text)" — claims visual identity
     (layout, colors) that happy-dom cannot verify.
   - Plan RSK-1 mitigation (line 110): "validates 0 visual differences".
   - Plan task 2.5 (line 260): "0 visual differences; differences only in
     internal IDs/metadata".
   - Plan Phase 2 acceptance criteria (line 276): "NFR-6 — normalization
     safety (0 visual differences)".
   The AC was tightened to be honest about what is testable, but every
   downstream artifact (NFR, test plan, plan) still makes the untestable "0
   visual differences" claim. This is the same AC/test misalignment as iter-1,
   now with the contradiction reversed (AC says structural, NFR/test/plan say
   visual).
   Suggested remediation target phase: specification + test_planning +
   delivery_planning
   Suggested fix: Replace "0 visual differences" with "0 structural differences
   in visual elements" (or equivalent structural-proxy wording matching
   AC-F2-2) in all 6 locations: spec NFR-6, test plan §3.3 NFR-6 row, test plan
   TC-MERM-NORM-003 Expected Outcome, plan RSK-1, plan task 2.5, plan Phase 2
   AC. For TC-MERM-NORM-003, also update the Steps to say "structural XML diff"
   instead of "Compare the two renders visually (via screenshot or DOM
   inspection)" since screenshot comparison is infeasible in happy-dom.

3. [minor] cross_artifact_consistency — chg-GH-76-plan.md line 47 +
   chg-GH-76-spec.md §25 line 408 — **NEW (introduced by the DEC-5 fix)**
   Gap: The spec decision log now contains DEC-5 (OQ-1 resolution), but two
   references to the decision count were not updated:
   - Plan "Resolved decisions" header (line 47): "from spec DEC-1 through
     DEC-4" — should be "DEC-1 through DEC-5" and DEC-5 should be listed.
   - Spec §25 Authoring Guidelines (line 408): "Design decisions (DEC-1
     through DEC-4) resolve the key questions" — should be "DEC-1 through
     DEC-5" and should mention the OQ-1 resolution (full §3.3 rule set).
   Suggested remediation target phase: delivery_planning + specification
   Suggested fix: Update both references from "DEC-1 through DEC-4" to "DEC-1
   through DEC-5"; add DEC-5 to the plan's resolved-decisions list.

4. [minor] plan_code_area_coverage — chg-GH-76-plan.md Phase 1 "Files and
   modules" code-area list (lines 192-198) — **PERSISTENT from iter-1 finding 1
   (partial fix)**
   Gap: Iter-1 finding 1 asked to add `tests/integration/app/mermaid/
   mermaid-render.test.ts` to BOTH task 1.4 AND the Phase 1 "Files and modules"
   code-area list. Task 1.4 was correctly updated (now lists `StubRenderer` +
   `SelectiveRenderer` at lines 46/54). However, the Phase 1 code-area summary
   list (lines 192-198) still omits the file, creating an internal plan
   inconsistency: the task says to modify a file that the code-area list doesn't
   acknowledge. Verified against source: `StubRenderer implements Renderer`
   (line 46) and `SelectiveRenderer implements Renderer` (line 54) both have
   `render(_source: string)` — they will fail to compile when the port signature
   changes to `render(source, config)`.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add `tests/integration/app/mermaid/mermaid-render.test.ts
   (updated — StubRenderer + SelectiveRenderer signatures)` to the Phase 1
   "Files and modules" code-area list.

5. [nit] decision_capture — chg-GH-76-pm-notes.yaml `decisions` field (line 17)
   — **NEW**
   Gap: The PM notes `decisions: []` structured field is empty, despite OQ-1
   being PM-decided. The decision rationale IS captured as a free-text note
   with `type: decision` (lines 43-52) and in the spec decision log (DEC-5),
   so the decision is not lost — but the structured `decisions` field that
   iter-1's suggested fix explicitly called out ("Record the default in
   `chg-GH-76-pm-notes.yaml` `decisions`") was not populated.
   Suggested remediation target phase: specification
   Suggested fix: Populate the `decisions` field with the OQ-1/DEC-5 decision
   (ref, rationale, date) or confirm the `type: decision` note is the
   canonical PM-notes decision format.

## Iter-1 Resolution Summary

| Iter-1 Finding | Severity | Status | Notes |
|---|---|---|---|
| 1. plan_code_area_coverage (missed blast-radius file) | major | RESOLVED (task 1.4) | Task 1.4 updated; code-area list still has a minor omission (finding 4) |
| 2. cross_artifact_consistency (push-flow.test.ts "New file") | major | RESOLVED | Test plan §7 now says "Existing file (added in GH-27, 188 lines)" — verified against on-disk file (188 lines) |
| 3. decision_capture (OQ-1 deferred) | major | PARTIALLY RESOLVED — PERSISTENT | Spec + PM notes updated; test plan §8.3 + plan NOT mirrored (finding 1) |
| 4. plan_code_area_coverage (overlapping tests) | minor | RESOLVED | Test plan §7 now acknowledges overlapping tests in mermaid-render.test.ts + idempotency.test.ts |
| 5. ac_quality (AC-F2-2 "visual") | minor | PARTIALLY RESOLVED — PERSISTENT | AC-F2-2 reworded; NFR-6 + test plan + plan NOT mirrored (finding 2) |
| 6. cross_artifact_consistency (E2E file ambiguity) | minor | RESOLVED | Both artifacts now explicitly state `tests/e2e/sandbox-publish.test.ts` is a new file to create |

## Notes

- Iter-1 had 3 [major] + 3 [minor] findings. Iter-2 has 2 [major] (both
  persistent, partially fixed) + 1 [minor] (new) + 1 [minor] (persistent) + 1
  [nit] (new). Progress was made — findings 2, 4, 6 from iter-1 are fully
  resolved. The two persistent [major] findings share the same root cause: the
  spec was updated but the changes were not mirrored downstream to the test
  plan and plan.
- Code-area verification reconfirmed: `Renderer` port
  (`src/domain/mermaid/port.ts:14`) has `render(source: string)` — signature
  change is real; `StubRenderer` + `SelectiveRenderer` in
  `tests/integration/app/mermaid/mermaid-render.test.ts` (lines 46, 54) both
  implement the old signature and will break compilation.
- `tests/unit/app/push-flow.test.ts` confirmed to exist (188 lines, GH-27
  provenance tests) — test plan §7 correction is accurate.
- This is iteration 2 of ~3. Both blocking findings are straightforward
  mirroring fixes (propagate spec changes to test plan + plan). No human input
  is needed; Pause Required is `no`. If the same two gaps persist after
  iteration 3, escalate to the human per the stalemate rule.
- Override path not applicable: this change alters behavior and touches
  contracts (`Renderer` port, lock semantics, Kroki hash input) — not trivial.
