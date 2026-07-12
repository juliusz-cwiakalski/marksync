# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-21
Date: 2026-07-10
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iteration-1 Finding Resolution

| # | Iter-1 Finding | Status | Notes |
|---|----------------|--------|-------|
| 1 | [MAJOR] zod "already installed" false claim (spec §8.4/§13/§21) | **CONFIRMED-FIXED** | Spec corrected in all 4 locations (§8.4, §12, §13, §21) to "installed in Phase 0". `rg "zod.*already" chg-GH-21-spec.md` = 0 matches. (Residual NIT: plan + test plan prose still *references* the spec's old claim as if it persists — see Finding 3.) |
| 2 | [MAJOR] TC-BND-001 boundary negative-test mechanism (test plan) | **PARTIALLY FIXED → NEW MAJOR** | Test plan fully updated to the ephemeral `src/domain/` probe (10 locations, production ruleset, `afterEach` cleanup). **However, the implementation plan was NOT updated** — PD-4 + Phase 2 tasks 2.2/2.3 + Artifacts table + Open questions still describe the non-viable `tests/_fixtures/boundary/` fixture + the "(or a copy)" proxy-rule hedge that iter-1 explicitly rejected. The two artifacts now directly contradict each other. See Finding 1. |
| 3 | [MAJOR] DEC-5 ID collision | **CONFIRMED-FIXED** | DEC-9 added to spec §15 (no-secret-in-message rule, justified by NFR-SEC-1/RSK-3). All citations verified: every remaining DEC-5 reference (3 plan, 5 test-plan, 1 spec) correctly refers to renderBody delegation; every DEC-9 reference (5 plan, 5 test-plan, 1 spec) correctly refers to the no-interpolation rule. Zero remaining collisions. |
| 4 | [MINOR] Error-arm count internal inconsistency | **PARTIALLY FIXED → PERSISTENT MINOR** | PURPOSE, G-9, F-9 table, Glossary updated to "two". But NG-9 (line 113) still says "`RateLimited` is the **only** addition" — explicitly called out for fix in iter-1 and missed. Two additional stale locations discovered: §8.5 (line 274 "one additive... change") and §18 (line 400 "one additive arm"). See Finding 2. |

## Findings

### 1. [MAJOR] cross_artifact_consistency / plan_coverage — plan `PD-4` / Phase 2 tasks 2.2–2.3 / Artifacts table / Open questions / Revision log

**Gap:** The iter-1 fix for TC-BND-001 was applied **exclusively to the test plan** (9+ locations
updated to the ephemeral `src/domain/` probe approach). The **implementation plan was not touched**
and still describes — in 8 locations — the exact mechanism iter-1 rejected as non-viable:

- **PD-4** (line 148): "Boundary negative test = a **tests-tier fixture** + a dep-cruiser invocation
  over it (src/ stays clean)".
- **PD-4** (line 153): "`tests/_fixtures/boundary/domain-imports-infra.ts` violating file".
- **Task 2.2** (line 552): "Create `tests/_fixtures/boundary/domain-imports-infra.ts` (new,
  tests-tier — **not** under `src/`)".
- **Task 2.3** (lines 560–561): "over the `tests/_fixtures/boundary/` fixture using the repo's
  `.dependency-cruiser.cjs` ruleset **(or a copy naming the same `domain-may-not-import-infra` rule)**".
- **Phase 2 AC** (line 572): "the negative test proves `domain-may-not-import-infra` fires **on the
  fixture** breach".
- **Open questions** (line 215): "over the **tests-tier fixture**".
- **Artifacts table** (line 1097): "`tests/_fixtures/boundary/domain-imports-infra.ts`".
- **Revision log** (line 1109): "PD-4 tests-tier fixture".

The plan and test plan now **directly contradict** each other on the boundary test mechanism. This is
not a cosmetic drift: `@coder` **executes the plan**, so they would create the committed
`tests/_fixtures/boundary/` fixture and cruise it — the exact approach iter-1 established **cannot
fire the production `domain-may-not-import-infra` rule**. Verified against the live config:
`.dependency-cruiser.cjs:18` declares `from: { path: "src/domain/" }` and `package.json:33` declares
`"check:boundaries": "depcruise src"` — a `tests/`-located fixture has `from.path = tests/…`, so the
production rule never matches it. The "(or a copy)" hedge remains unexplained (a copy would need a
different `from`, making it a proxy rule, not the production invariant — the same defect iter-1
flagged). The test plan's §4 file-layout, §5.2 TC-BND-001 detail, §6.2, §7 automation table, §8.1
risk-mitigation, and OQ-TP-1 all describe the ephemeral probe, so the plan is the sole outlier.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Update plan PD-4 + Phase 2 tasks 2.2–2.3 + Phase 2 AC + Open questions + Artifacts
table + Revision log to match the test plan's ephemeral `src/domain/` probe mechanism: create the
probe at runtime under `src/domain/` (e.g. `src/domain/__boundary_probe__.ts`), cruise `src/` with the
**production** `.dependency-cruiser.cjs` ruleset (no "(or a copy)" hedge), assert the production
`domain-may-not-import-infra` rule fires, delete the probe in `afterEach`/`finally` (cleanup is
release-blocking-critical). Remove the `tests/_fixtures/boundary/domain-imports-infra.ts` fixture from
the Artifacts table and Phase 2 task 2.2. (Iter-1 declined to reopen delivery_planning because both
artifacts agreed at that time; they no longer do.)

---

### 2. [MINOR] cross_artifact_consistency — spec §4.2 NG-9 (line 113) / §8.5 (line 274) / §18 (line 400) — error-arm count still inconsistent (persistent from iter-1)

**Gap:** Three spec locations still describe **one/only** error-model addition, contradicting the
sections that now correctly state **two** (`RateLimited` + `RemoteUnreachable`):

- **NG-9** (line 113, **persistent** — iter-1 explicitly listed this in its suggested fix): "New
  error arms beyond `RateLimited` — ... `RateLimited` is the **only** addition (DEC-2)." This directly
  contradicts §7.2 (line 221, which was updated to "beyond `RateLimited` + `RemoteUnreachable`") and
  DEC-2 (line 357, "Add `RateLimited`... and `RemoteUnreachable`... as two new arms").
- **§8.5 Backward Compatibility** (line 274, new instance): "This story adds net-new modules and
  **one** additive, type-checked error-union change (`RateLimited`)".
- **§18 Rollout** (line 400, new instance): "Reuses `Result`/`MarkSyncError` with **one** additive arm
  (`RateLimited`)".

A reader cross-checking arm count still gets contradictory answers from the same document (most
sections say two; NG-9/§8.5/§18 say one). Not operationally dangerous — Phase 1 of the plan correctly
implements both arms, and AC-Q-1's typecheck gate catches any exhaustiveness gap — but it is an
internal spec inconsistency on a fact the rest of the artifact set treats as settled.

**Suggested remediation target phase:** specification
**Suggested fix:** Update NG-9 to "New error arms beyond `RateLimited` + `RemoteUnreachable`"; update
§8.5 to "two additive, type-checked error-union changes (`RateLimited` + `RemoteUnreachable`)"; update
§18 to "two additive arms".

---

### 3. [NIT] cross_artifact_consistency — plan PD-2 / Open questions / Phase 8.3 + test plan §8.2 / TC-DEP-001 reference the spec's "zod already installed" claim as if it still exists

**Gap:** The spec's zod claim was corrected (Finding 1 = CONFIRMED-FIXED), but the plan and test plan
still reference it in the present tense as a live defect:

- Plan PD-2 (line 124): "The spec §8.4/§13 asserts 'zod is already a project dependency'".
- Plan Open questions (line 209): "Spec 'zod already installed' factual error (PD-2). The spec §8.4/§13
  claim zod is installed; it is not."
- Plan Phase 8.3 doc-handoff (line 1025): "correct the spec §8.4/§13 'zod already installed' claim".
- Plan revision log (line 1109): "spec's 'already installed' claim is a factual error".
- Test plan §8.2 assumptions (line 1719): "the spec's 'zod already installed' claim is a factual error
  corrected by the plan".
- Test plan TC-DEP-001 (lines 1531–1533): "the spec's 'already installed' claim is a factual error,
  corrected by the plan".

These are now stale: the spec was fixed in this iteration. The plan's Phase 0 behavior (install zod)
remains correct and is not impeded — the staleness is prose-only. The `typescript.md` "Planned →
Installed" update (still needed) remains a valid lifecycle-phase-7 doc-handoff item.

**Suggested remediation target phase:** delivery_planning (plan) + test_planning (test plan)
**Suggested fix:** Reword these references to past tense ("the spec *previously* claimed... corrected
in iter-2") or remove them, keeping only the `typescript.md` Planned→Installed handoff as a live item.

---

## Positive Confirmations (no action needed)

- **DEC-9 is properly formed and routed.** It is a change-level decision (spec §15), justified by
  NFR-SEC-1/INV-SEC-1/RSK-3, with an explicit note documenting the iter-1 mislabeling history. All 11
  citations across plan + test plan correctly resolve. No TDR needed (the decision is an application of
  the existing redaction discipline to the two new arms, not a new architectural principle).
- **The ephemeral-probe test plan mechanism is viable and well-specified.** TC-BND-001 detail, §4
  layout, §6.2, §7 mapping, §8.1 risk-mitigation, and OQ-TP-1 are internally consistent and correctly
  explain why a `src/domain/` probe is the only way to fire the production rule.
- **All 9 story ACs → spec ACs → test cases** still trace cleanly (unchanged from iter-1).
- **Plan Phase ordering, phase-per-commit structure, code-area listing, and doc-update handoff** remain
  sound (unchanged from iter-1).
- **Critical-safety paths** (409 parse, 403 warn+skip, no-token-leak, no-outbound-telemetry) remain
  proven at the integration tier over a real `Bun.serve` mock (unchanged from iter-1).

## Reopen Recommendation

- **delivery_planning** — Finding 1 (update plan PD-4 + Phase 2 to the ephemeral-probe mechanism,
  matching the test plan; remove the `tests/_fixtures/` fixture + "(or a copy)" hedge). This is the
  sole blocker.
- **specification** — Finding 2 (NG-9 / §8.5 / §18 error-arm count consistency — MINOR, non-blocking
  but should be swept in the same revision pass).
- **test_planning** — Finding 3 NIT only (stale zod references) — optional; can be folded into the
  delivery_planning pass.
- **delivery** — never reopened by DoR.

No human input required (Pause Required: no). The sole blocker is a delivery_planning revision to
bring the plan's boundary-test specification in line with the already-corrected test plan. Expected
to pass on iteration 3 after a focused plan update.
