# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-64
Date: 2026-07-13
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

## Verdict Rationale

All six iter-1 findings are resolved, including the one CRITICAL and one MAJOR
blocker. No new critical/major contradictions were introduced by the iter-2
edits. Remaining observations below are nits (non-blocking) recorded for
delivery hygiene; they do not gate delivery.

### Iter-1 findings — resolution confirmation

1. **[critical] RESOLVED** — TC-GLOB-010 `["."]` test-update path.
   - Test plan §5.2 TC-GLOB-010 now reads "Update existing test: change pattern
     from `["."]` to real glob"; §7 table marks it "To Update".
   - Plan Phase 4 task 4.3 added, concrete and correct. Verified against actual
     source: `tests/unit/infra/git/shell-git.test.ts:153` is exactly
     `repo.readCommitted("HEAD", ["."])`; fixture writes `test.md` at repo root;
     `globToRegExp(".")` → `^\.$` (`.` is REGEX_SPECIAL in glob.ts:35), so the
     post-fix filter yields empty and `expect(files.size).toBeGreaterThanOrEqual(1)`
     (line 159) would fail. Suggested replacement `["**/*.md"]` compiles to
     `^(?:.*/)?[^/]*\.md$` and matches `test.md`. Task is actionable.

2. **[major] RESOLVED** — TC-GLOB-006 dedup consistency.
   - Test plan §7 (line 701) and plan Test Scenarios table (line 422) now both
     mark TC-GLOB-006 as "deduplicated — covered by TC-GLOB-001, TC-GLOB-002",
     mapped to Phase 2. AC-G2-2's flat-directory intent is subsumed by
     TC-GLOB-001 (which asserts `docs/a.md`, the flat case, alongside nested).
     No contradiction remains.

3. **[minor] RESOLVED** — Empty-patterns semantics (DEC-4).
   - Spec §8.5 ("Fully backward compatible with one intentional correction"),
     §15 DEC-4, §12 assumption; test plan TC-GLOB-009 (empty map expected);
     plan task 1.5 (short-circuit) — all three agree on empty → empty map.
     Behavior is inherent to in-memory union design regardless of the
     short-circuit.

4. **[minor] RESOLVED** — NFR-PERF-5 threshold.
   - Reclassified informational/non-gating in spec §4.1 and §9. No AC references
     it as a hard gate; TC-GLOB-012 carries the informational verification.

5. **[minor] RESOLVED** — AC-G2-1 proxy relationship.
   - TC-GLOB-012 now carries an explicit "AC-G2-1 proxy relationship" note:
     readCommitted is the discovery choke-point; full CLI E2E is out of scope.

6. **[minor] RESOLVED** — Plan doc-impact rationale.
   - Phase 1 "System docs to update" now reads "None (code-only phase —
     Repository port contract unchanged, glob semantics already documented ...
     formal doc reconciliation in Phase 7)". Confirmed via grep: no
     `doc/spec/**` mentions pathspec/ls-tree/readCommitted, so no system-spec
     drift to reconcile.

### Fresh scrutiny (focus areas)

- Task 4.3 actionability: CONFIRMED (see finding-1 confirmation above).
- DEC-4 consistency across spec/test-plan/plan: CONFIRMED.
- TC-GLOB-006 dedup consistency across test-plan/plan: CONFIRMED.
- No new contradictions from iter-2 edits: CONFIRMED.

## Findings (non-blocking nits)

1. [nit] plan_coverage — chg-GH-64-plan.md Phase 1 task 1.10 vs Phase 4 task 4.3
   Gap: Phase 1 task 1.10 ("run existing unit tests, check for regressions")
   executes after the code change but the TC-GLOB-010 test fix lives in Phase 4,
   leaving a transient red `["."]` test between Phase 1 and Phase 4. The task
   itself is correct and scheduled; only the ordering leaves a known-red window.
   Suggested remediation target phase: delivery_planning
   Suggested fix (optional): move the TC-GLOB-010 `["."]`→glob test update into
   Phase 1 (alongside the code change) or Phase 2 so the suite goes green
   earlier. Not required for readiness.

2. [nit] system_spec_consistency — chg-GH-64-spec.md §9 NFR-PERF-5 / NFR-MAINT-1
   vs doc/spec/nonfunctional.md
   Gap: the change spec reuses system NFR IDs with shifted semantics.
   NFR-SEC-7 is consistent (path-traversal), but system NFR-PERF-5 is "render
   latency ≤200ms p95" while the change's NFR-PERF-5 is "readCommitted file-list
   latency"; system NFR-MAINT-1 is "Confluence REST adapter isolation" while the
   change's is "Repository-port glob isolation". Pre-existing (unchanged by
   iter-2 edits); cosmetic label reuse contained to the transient change spec.
   Suggested remediation target phase: specification
   Suggested fix (optional): scope change-local NFRs with a change-prefixed ID
   (e.g. `NFR-GH64-PERF`) or cite the system NFR they extend. Not required for
   readiness.

3. [nit] spec_completeness — chg-GH-64-spec.md §16 Affected Components
   Gap: §16 describes the unit-test file as "Updated — add tests for ** pattern
   matching and union semantics" but does not mention UPDATING the existing
   `["."]` happy-path test. The update is captured downstream (TC-GLOB-010 +
   plan task 4.3), so delivery is not affected.
   Suggested remediation target phase: specification
   Suggested fix (optional): add "(incl. update of existing happy-path test)" to
   the §16 row. Not required for readiness.

4. [nit] test_traceability — chg-GH-64-test-plan.md §5.2 TC-GLOB-006 (line 410)
   Gap: typo "DEDUPICATED" → "DEDUPLICATED"; TC-GLOB-009 note says "vacuously
   true" where "empty union = empty set" is the precise framing (behavior is
   correct and matches DEC-4).
   Suggested remediation target phase: test_planning
   Suggested fix (optional): fix typo; reword to "union of zero patterns = empty
   set". Not required for readiness.

## Verified (no finding)

- **Ticket AC coverage:** both ticket ACs map to spec ACs and TCs.
  - "select: ['docs/**/*.md'] matches nested files" → AC-F1-1 → TC-GLOB-001.
  - "starter config (marksync init) works out of the box" → AC-G2-1/G2-2 →
    TC-GLOB-012 (proxy) + TC-GLOB-001/002 (dedup). NG-4 confirms template
    unchanged, so readCommitted-level verification is sufficient.
- **No other existing test breaks:** the second existing readCommitted test
  (`["nonexistent/**"]`, line 192) compiles to `^nonexistent/.*$` and still
  yields empty → passes post-fix. Detached-HEAD tests do not call readCommitted.
- **Security invariant continuity:** plan retains validateRepoRelative(pattern)
  before spawn (task 1.6) and per-file (task 1.7); glob chars `*`/`?`/`/` pass
  validation (existing test line 192 returns Ok, confirming `**` passes).
- **Tier rule:** infra → shared import allowed; `#shared/glob` alias registered.
- **DoD:** spec §17 ACs are testable Given/When/Then; plan Phase 7 enumerates the
  AC-verification checklist.

## Next Steps for @pm

Verdict READY — proceed to delivery (lifecycle phase 6). The four nit findings
are optional hygiene improvements and may be folded into delivery or deferred;
none reopen an artifact-creation phase.
