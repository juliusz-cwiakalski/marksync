# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-31
Date: 2026-07-26
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

## Iter-2 Residuals Status (the 4 fixes this iteration verified)

| # | Iter-2 residual | Status | Verification |
|---|-----------------|--------|--------------|
| 1 | TC-009 should NOT reference `bun test tests/adversarial/` (DEC-5) | **RESOLVED** | TC-009 step 2 (`chg-GH-31-test-plan.md` lines 542–548) now enumerates `bun run lint` / `bun run typecheck` / `bun test tests/unit/` / `bun test tests/integration/` / `bun test tests/golden/` (with "including classification runner and adversarial corpus tests") / `bun run test:bdd`. The stale `- bun test tests/adversarial/ (corpus inventory, PII audit)` line is GONE. Repo-wide grep for `bun test tests/adversarial` and `tests/adversarial/...\.test\.ts` returns zero hits in spec/plan/test-plan (only in historical review records). |
| 2 | TC-001 long-page ≥50 KB or ≥1000 lines (absolute), not "2× largest golden" | **RESOLVED** | TC-001 step 3 (line 177): "At least one long page (≥50 KB or ≥1000 lines — absolute floor per AC-F1-1)"; Notes (line 191): "absolute floor of ≥50 KB or ≥1000 lines per AC-F1-1 (no relative sizing to existing fixtures)". No occurrence of "2×", "2x", "largest golden", or "largest existing" anywhere in the test plan. Matches spec §17 AC-F1-1 (line 249), §5.1 (line 94), Appendix A (line 311) and plan Phase 2.1 (lines 237–238) / Phase 4.1 (line 386) verbatim. |
| 3 | TC-008 bare-ID regex false-positive note (`PROJ-###` doesn't match) | **RESOLVED** | TC-008 Notes (line 472): "The bare-ID regex `(?:MS\|GH\|INT\|TICKET\|JIRA)[-_]\d{3,}` matches internal MarkSync issue-refs only; Confluence/Jira macro fixtures use the `PROJ-###` project-key shape (e.g. `ABC-123`), which does NOT match this regex, so the `macro-jira.md` fixture will not false-positive." Contract is now explicit. |
| 4 | §10 execution log should include TC-ADVERSARIAL-010 | **RESOLVED** | §10 Test Execution Log (lines 664–674) now lists all 10 rows TC-ADVERSARIAL-001 … TC-ADVERSARIAL-010. One-TC-one-row invariant restored. |

**Tally:** 4/4 RESOLVED. Test-plan revision log v1.2 (line 659) records all four fixes as "iter-3: propagate DEC-5 path + ≥50KB floor to TC-001/TC-009; TC-008 regex note; add TC-010 to execution log (DoR iter-2 fixes)."

## Iter-1 / Iter-2 Findings (cumulative, non-residual)

All 14 iter-1 findings and both iter-2 NEW MAJORs + 2 NITs are now closed. The two iter-1 BLOCKERs (CI visibility, sync-drift dependency) and all iter-1/iter-2 MAJORs (long-page proxy, tier mislabel, TC-004 error branch, `{expand}` drop, testing-strategy doc update) remain substantively addressed at the spec/plan/PM layer and are now fully propagated to the test plan.

## Cross-Artifact Consistency Sweep (this iteration)

- **Runner/fixture split (DEC-5)** — every runner reference in all three artifacts points at `tests/golden/adversarial/*.test.ts`; every `tests/adversarial/` reference refers strictly to fixture data (`*.md`, `*.classification.json`, optional `*.storage.xhtml`). No artifact places a `*.test.ts` runner under `tests/adversarial/`. Consistent with ci.yml's `bun test ... tests/golden/` glob (no ci.yml edit needed).
- **Long-page floor** — "≥50 KB or ≥1000 lines (absolute)" identical across spec §5.1/§17/Appendix A, plan Phase 2.1/4.1, test plan TC-001.
- **TC-ADVERSARIAL-010 traceability** — Unit tier, `tests/unit/domain/markdown/unsupported.test.ts` (extend), real `ac:structured-macro` shapes. Traced consistently in test plan §3.1/§3.2/§5.1/§5.2/§7/§10 and plan Phase 3.5 + Test Scenarios table. No tier/path drift.
- **PII regex contract** — email + internal-ticket-URL + bare-ID regexes identical between test plan TC-008 (steps 3–5) and plan Phase 4.2; PROJ-### non-match note now present in TC-008.
- **AC ↔ TC coverage** — all 8 ACs (AC-F1-1…AC-F6-1) map to ≥1 TC; all 10 TCs map to ≥1 AC; DM-1/DM-2/NFR-REL-4/NFR-SEC-1/NFR-PERF-5 all traced. No orphan AC or TC.

## Findings

None blocking.

1. [nit] ac_quality — `chg-GH-31-test-plan.md` §5.2 TC-009 step 2 (lines 542–548)
   Gap: The step-2 enumeration of `bun run check` lists separate `bun test tests/<path>` sub-invocations (unit/integration/golden) plus a `bun run test:bdd` line, whereas `bun run check` actually expands to `lint && format:check && typecheck && test && check:boundaries` (single `bun test`, no per-path args, plus `format:check` and `check:boundaries` which are absent from the enumeration). This is a doc imprecision, not a behavioral gap — the load-bearing concern (the stale `tests/adversarial/` line) is gone and the enumeration still conveys "all tiers run." Iter-2 explicitly classified this alignment as optional/non-load-bearing.
   Suggested remediation target phase: test_planning
   Suggested fix: Optional — collapse the enumeration to the real `bun run check` expansion (`lint && format:check && typecheck && test && check:boundaries`) and note the adversarial runners are discovered via the `tests/golden/` subtree. Not blocking; may be cleaned up opportunistically during delivery.

## Gate Result

**READY.** This is iteration 3 (the cap). All four iter-2 residuals are RESOLVED; no new MAJOR or BLOCKER findings; no stalemate. The spec, test plan, and plan are now mutually consistent and unambiguous enough for a coder to execute `/run-plan GH-31` without resolving contradictions mid-flight:

- DEC-5 runner/fixture split is propagated to all three artifacts (no stale `tests/adversarial/*.test.ts` paths remain).
- The AC-F1-1 long-page floor is an absolute ≥50 KB / ≥1000 lines in all three artifacts (no fragile 2×-golden proxy remains).
- TC-008's PII regex contract is explicit (PROJ-### non-match documented).
- TC-ADVERSARIAL-010 is fully traced (coverage tables, detail, execution log, plan phase, scenarios table).
- TC-004's three fidelity branches, TC-006's exactly-twice determinism run, the `{expand}` macro coverage, the `.ai/rules/testing-strategy.md` one-line doc-sync note, and Phase 6.2's CI-glob visibility verification all remain in place from iter-2.

Override path was NOT needed — the change cleared the gate on its own merits.

## Confidence

**High.** Every residual was verified by direct line read of the current test plan state plus repo-wide grep across all three artifacts (and historical review records) for the rejected strings (`bun test tests/adversarial`, `2×`, `largest golden`). The one residual nit was already flagged as optional in iter-2 and does not block delivery.

## Recommendation

**Proceed to delivery.** Open phase 6 (`delivery`) — `@coder` may execute `/run-plan GH-31 execute all remaining phases no review`. The plan is sequenced into 6 committable phases (collect-all classifier → corpus fixtures → classification runner → inventory + PII audit → classification doc → final quality gate), each independently green on its `bun test` subset. No human escalation needed; no stalemate.
