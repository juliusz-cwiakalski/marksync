# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-64
Date: 2026-07-13
Pause Required: no

## Facet Summary

- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Verdict Rationale

One CRITICAL blocker: the existing happy-path test
`tests/unit/infra/git/shell-git.test.ts:153` calls
`repo.readCommitted("HEAD", ["."])`. After the fix, patterns are consumed by
`src/shared/glob.ts`, where `.` is a **literal** (`globToRegExp(".")` →
`^\.$`), matching only a file named `.`. Verified empirically:

- `matchGlob(".", "test.md")` → `false`
- `filterByGlob(".", ["test.md","README.md"])` → `[]`

So `readCommitted("HEAD", ["."])` returns an **empty** map post-fix, failing
the test's `expect(files.size).toBeGreaterThanOrEqual(1)`. Yet TC-GLOB-010 is
marked "Existing – No Change" and the plan (Phase 4 task 4.3) only "verifies"
it passes — neither artifact schedules the required test update. Delivery as
planned lands on a red existing test with no remediation task.

No override applies: this change alters runtime behavior and is not trivial.
No override is recorded in `chg-GH-64-pm-notes.yaml`. Hard gate stands.

## Findings

1. [critical] cross_artifact_consistency — chg-GH-64-test-plan.md §5.2 TC-GLOB-010 (lines 525-560) and §7 (line 695); chg-GH-64-plan.md Phase 4 task 4.3 (lines 236-238)
   Gap: TC-GLOB-010 claims the existing `["."]` happy-path test needs "No Change"
   and will still pass ("All files in repo returned (because `.` matches
   everything)"). This is factually wrong under glob semantics — `.` matches only
   a literal `.`, so the existing test at `shell-git.test.ts:153` will BREAK
   (returns empty map). The plan's Phase 4 task 4.3 only "verifies" it passes and
   has no task to update the existing test. Empirically confirmed via
   `matchGlob(".", "test.md") === false`.
   Suggested remediation target phase: test_planning (correct TC-GLOB-010 + add a
   task to update the existing `["."]` test to a real glob such as `["**/*.md"]`,
   `["**"]`, or `["*"]`); delivery_planning must add the corresponding update task.
   Suggested fix: Reword TC-GLOB-010 to "Existing happy-path test updated to use a
   real glob", mark it "To Update" in §7, and add an explicit plan task
   (e.g., in Phase 1 or 2) to change `["."]` → a recursive/single-segment glob in
   `tests/unit/infra/git/shell-git.test.ts:153`.

2. [major] plan_coverage / cross_artifact_consistency — chg-GH-64-test-plan.md §7 (line 691) vs chg-GH-64-plan.md Test Scenarios (line 418)
   Gap: Test plan marks TC-GLOB-006 (AC-G2-2) "To Implement"; the plan's Test
   Scenarios table marks it "Covered by TC-GLOB-001, TC-GLOB-002" with no phase
   assignment, and no phase task implements TC-GLOB-006. The two artifacts
   contradict on whether TC-GLOB-006 is implemented. (AC-G2-2's intent is
   partially exercised by TC-GLOB-001's flat-file assertion, so the AC is not
   fully uncovered — but the contradiction must be resolved and the AC's
   check-listable task made explicit.)
   Suggested remediation target phase: test_planning + delivery_planning
   Suggested fix: Either reclassify TC-GLOB-006 as explicitly subsumed by
   TC-GLOB-001/002 (with rationale recorded in the test plan) and reflect that in
   the plan, or add a phase task that implements TC-GLOB-006. Pick one consistently
   across both artifacts.

3. [minor] system_spec_consistency — chg-GH-64-spec.md §8.5 (line 157) and NG-1 (line 66) vs chg-GH-64-plan.md Phase 1 task 1.5 (line 94) and TC-GLOB-009
   Gap: Spec claims "Fully backward compatible" and "semantics remain unchanged",
   but the fix changes empty-patterns behavior: today
   `readCommitted("HEAD", [])` lists ALL files (empty git pathspec = match all);
   after the fix the union of zero patterns yields an empty map. This edge case is
   reachable if a user sets `select: []` (config.ts:136 `input.select ?? ["**/*.md"]`
   keeps an explicit `[]`). The change is inherent to the in-memory design
   regardless of task 1.5's short-circuit.
   Suggested remediation target phase: specification
   Suggested fix: Acknowledge the empty-patterns behavior change in §8.5 and/or
   add a one-line note defining empty-patterns semantics as "union of zero patterns
   = empty set" so the "backward compatible" claim is accurate.

4. [minor] ac_quality / test_traceability — chg-GH-64-spec.md §4.1 / §9 NFR-PERF-5 (lines 62, 164) vs chg-GH-64-test-plan.md §5.2 TC-GLOB-012 (lines 616-644)
   Gap: NFR-PERF-5 / success metric requires "no measurable degradation", but
   TC-GLOB-012 defines no baseline and no threshold; the test plan itself states
   "Performance is informational, not a hard gate". As written, the NFR cannot be
   objectively verified.
   Suggested remediation target phase: specification
   Suggested fix: Either define a concrete baseline/threshold method for
   NFR-PERF-5, or explicitly downgrade it to an informational (non-gating)
   observation in the spec so AC quality is not over-stated.

5. [minor] test_traceability — chg-GH-64-spec.md §17 AC-G2-1 (line 236) vs chg-GH-64-test-plan.md §5.2 TC-GLOB-012 (lines 612-631)
   Gap: AC-G2-1 is literally the end-to-end flow `marksync init` → `marksync plan`
   produces a non-empty plan, but TC-GLOB-012 only exercises
   `repo.readCommitted("HEAD", ["docs/**/*.md"])` directly — not the init→plan CLI
   flow. The discovery mechanism is verified, not the literal user flow. Acceptable
   as a layered proxy (config/selectFiles/init are explicitly out of scope /
   unchanged) but the proxy relationship is not stated.
   Suggested remediation target phase: test_planning
   Suggested fix: Add a note to TC-GLOB-012 stating it verifies AC-G2-1 at the
   discovery layer (the only layer this change touches), with init/selectFiles
   covered by existing unchanged tests.

6. [minor] plan_doc_update_coverage — chg-GH-64-plan.md Phases 1-6 "System docs to update: None" (e.g., lines 117, 168, 210, 253, 295, 341)
   Gap: The plan marks every phase "None" for system docs without referencing
   `doc/spec/**` or justifying why no system-spec update is needed. The PM notes
   contain the doc-impact rationale (feature-safe-publish.md is high-level, no
   pathspec/glob detail) that should be cited so the doc blast radius is explicit.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add a one-line note in the plan (e.g., Phase 6 or 7) citing the
   PM-notes doc-impact assessment and confirming no `doc/spec/**` update is
   required, deferring final confirmation to the system_spec_update phase.

## Verified (no finding)

- **Security invariant continuity (PM concern #3):** PASS. Plan retains
  `validateRepoRelative(pattern)` before git spawn (task 1.6) and
  `validateRepoRelative(fileName)` per file (task 1.7). TC-INTEGRATION-009
  (`tests/integration/app/shell-git-safety-fuzz.test.ts`) fuzzes malicious
  patterns/refs and asserts throws before spawn; confirmed it stays green because
  the validation loop runs before the `git ls-tree` spawn. TC-GLOB-007/008 add
  unit-level malicious-pattern coverage.
- **Tier rule (PM concern #5):** PASS. `src/infra/git/shell-git.ts` importing
  `#shared/glob` is valid — shared is the bottom tier (imports nothing; the
  `#shared/*` alias is registered in package.json:22). shell-git already imports
  domain, so infra→shared is within the same allowance.
- **AC traceability (PM concern #4):** Every spec AC (AC-F1-1 … AC-F3-3) maps to
  at least one TC in the test plan §3.1. (TC-GLOB-006/AC-G2-2 scheduling gap is
  finding #2, not a missing mapping.)
- **DoD (dod_defined):** PASS — spec §17 ACs are testable Given/When/Then and
  serve as the DoD; plan Phase 7 enumerates an AC-verification checklist.
- **Decision capture:** PASS — DEC-1/2/3 recorded in spec §15 and mirrored in
  pm-notes decisions; no precedent-setting system decision needs an ADR.

## Next Steps for @pm

Reopen `test_planning` and `delivery_planning` to address findings #1 (critical)
and #2 (major). Findings #3–#6 are minor consistency fixes that can be folded
into the same revision pass (specification / test_planning / delivery_planning).
Re-run this gate after revision. Do NOT start delivery (Phase 6) until verdict
is READY.
