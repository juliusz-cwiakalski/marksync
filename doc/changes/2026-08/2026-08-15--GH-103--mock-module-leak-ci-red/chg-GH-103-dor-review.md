# Readiness Review Iteration 1 (DoR Gate — GH-103)

Verdict: READY
Work Item: GH-103
Date: 2026-08-15
Pause Required: no

Reviewer: `@readiness-reviewer` (adversarial DoR gate, lifecycle phase 5)
Inputs: ticket GH-103 (`gh issue view 103`, authoritative), `chg-GH-103-spec.md`, `chg-GH-103-test-plan.md`, `chg-GH-103-plan.md`, `chg-GH-103-pm-notes.yaml`, handoff patch `tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch`, tree @ `fix/GH-103/mock-module-leak-ci-red` (HEAD `ad93d8d`, artifacts: `2d3a528`/`f4a0168`/`ad93d8d`; base `main @ 1ebc664`).

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

Blocking findings: 0 critical, 0 major. Non-blocking: 1 minor, 3 nits (advisory; none require artifact revision before delivery).

## Ticket → Spec AC Traceability (facet: spec_completeness)

| Ticket AC | Spec AC | Verdict |
|---|---|---|
| 1. Ordered run (unit CLI before integration) + full suite green | AC-F1-1, AC-F1-2 | Covered — order-explicit by design, stronger than ticket wording |
| 2. No `mock.module` remains in tests/ | AC-F4-1 (+ DM-2, NFR-2) | Covered — includes "demonstrably fails on reintroduction" |
| 3. CI green on this PR | AC-F1-3 | Covered — correctly modeled as observed-at-PR (phase 11) |
| 4. `.ai/rules/testing-strategy.md` ban + seam pattern | AC-F4-2 | Covered |

Ticket fix direction fully carried: DI seams (F-2/F-3), both test rewrites (§7.1), audit (re-verified at intake — exactly 2 call sites, confirmed on tree), regression guard (F-4). Added ACs F2-1/F3-1 (default-deps behavior identical) are a legitimate refinement of the ticket's implicit no-behavior-change constraint, not invention. No contradiction with `doc/spec/**` (no spec-doc changes claimed; source is additive-only) or `.ai/rules/**` (patch's seam comments and test style comply with `typescript.md`; commit conventions match `commitlint.config.js` header-max 72, verified).

## Grounding Verification (facets: test_traceability, plan_code_area_coverage)

Verified against the tree, not taken on faith:

- `mock.module` call sites: exactly `tests/unit/cli/commands/doctor.test.ts:28` and `repair-command.test.ts:52` (2 more hits are prose comments — matches spec/file-level claim). ✓
- Handoff patch: exists, 316 lines, 4 file diffs; `git apply --check` **clean**; plan's patch layout table (1–30 doctor.ts, 31–67 repair-state.ts, 68–209 doctor.test.ts, 210–316 repair-command.test.ts) exact. ✓
- Known drift confirmed: patch line 78 header comment says "PR #105" — plan task 2.3 corrects to PR #102. ✓
- Src context claims: `doctor.ts` `runDoctor` import @ line 12; `repair-state.ts` imports @ 10–12, `runRepair` call @ line 70. ✓
- Patch contents match plan tasks 1.2/1.3/2.1/2.2 verbatim (`DoctorCommandDeps`/`RepairStateCommandDeps`, `deps.X ?? X`, `FAKE_REPORT: RepairReport` dropping `as const`, `stubRunRepair` opts capture, tests 5–6 second-arg injection, tests 1–4 bodies untouched). ✓
- Test IDs real: TC-DOCTOR-011.1–.5 (unit); TC-DOCTOR-013..020 + 022.1, no 021 (integration — exactly 9, validating A-2); TC-REPAIR-001..005 (unit app) + 006..013 incl. 011a (integration app). ✓
- `tests/unit/meta/` absent (new-dir claim); `tests/unit/shared/` exists (A-6 fallback valid). ✓
- CI refs: `Lint + Typecheck + Test` fast loop `bun test --coverage tests/unit/ tests/integration/ tests/golden/` @ ci.yml:72; `test:bdd` @ 81; `e2e-mock` @ 106; Bun 1.2.23 pinned. ✓
- `package.json`: version 0.8.2; all scripts cited by the plan (`check`, `typecheck`, `lint`, `format:check`, `test:bdd`) exist with the described composition. ✓
- `.ai/rules/testing-strategy.md`: no existing ban (AC-4 gap real); "AI-agent over-mocking guardrail" (line 100), "Anti-patterns (rejected)" (line 279), `last_updated`/`related_changes` front matter all exist — Phase 4 tasks 4.1–4.3 target real anchors. ✓
- e2e-mock directory contains no doctor/repair scenarios (A-3 confirmed). ✓
- `MarkSyncError` `RemoteUnreachable { cause: string }` (errors.ts:97) and `Result<T,E>` (result.ts:10) support the plan's precise-typing constraint. ✓
- Guard root resolution `join(import.meta.dir, "../../..")` from `tests/unit/meta/` → repo root. ✓

## Cross-Artifact Consistency (facet: cross_artifact_consistency)

- Same AC IDs (AC-F1-1..AC-F4-2) across spec §17, test-plan §3.1, plan §Test Scenarios; plan's "AC coverage check" closes the loop with no orphan AC and no orphan TC. ✓
- Same guard mechanism everywhere: scanning unit test `tests/unit/meta/no-mock-module.test.ts`, call-syntax needle `mock.module(`, concatenation-built, exported helper + self-test (spec DEC-1 → test-plan D-TST-1 → plan Phase 3). ✓
- Same pinned invocation string verbatim in test-plan TC-ORDER-001 and plan tasks 2.5/5.1. ✓
- Same scope boundary everywhere: no version bump (0.8.2, DEC-2), no CI workflow change (NG-4), src additive-only, integration/golden/BDD/e2e-mock files unmodified (asserted via `git diff main --stat` in tasks 5.5/5.6). ✓
- Handoff patch consistently framed as re-validation input with the same two known deviations (PR #105→#102; potential hunk drift) in all three artifacts. ✓

## Phase Sequencing Soundness (facets: plan_coverage, dod_defined)

Phase 1 (seams, additive) → Phase 2 (rewrites, leak dies, ordered-run proof first lands) → Phase 3 (guard) → Phase 4 (rules ban) → Phase 5 (evidence + reconciliation) is correctly ordered: the plan's key insight — Phase 1 stays green because `deps.runDoctor ?? runDoctor` falls back to the mocked module import while `mock.module` still exists — is sound, and deferring the ordered-run proof to Phase 2+ is correctly reasoned. One commit per phase, each with a green-boundary constraint and a Conventional-Commit completion signal. DoD is derivable: all §17 ACs testable, with AC-F1-3 explicitly tracked as pending-PR-observation (the only honest treatment of a CI-order AC).

## Findings

1. [minor] test_traceability — chg-GH-103-test-plan.md §5.2 TC-ORDER-001 (with §8.2 A-1)
   Gap: AC-F1-1's entire proof rests on assumption A-1 (positional file arguments pin bun test's execution order in one process), which is plausible but unproven; the negative control that would validate it (run the identical invocation on `main`, observe the phantom failures) is marked optional (step 3) and again optional in plan task 5.1. If A-1 is false, the "ordered" run is not the failing order and AC-F1-1 is proven vacuously.
   Suggested remediation target phase: test_planning
   Suggested fix: promote the negative control to a one-time mandatory step (it costs one worktree run on `main`) — or explicitly note that AC-F1-3 (real CI green) is the backstop if the control is skipped. Non-blocking because the ticket itself sanctions the positional-args approach and CI on the PR provides the authoritative order proof.

2. [nit] plan_code_area_coverage — chg-GH-103-plan.md task 3.2
   Gap: The rationale "only `.ts` executes under bun test" is imprecise — bun test also executes `.js`/`.jsx`/`.tsx` test files; the scan's `.ts`-only filter is safe today because the tree contains only TypeScript tests, not because of runner semantics. A future `.js` shim under `tests/` would evade the guard.
   Suggested remediation target phase: delivery_planning
   Suggested fix: reword the rationale (or widen the filter to the extensions bun test executes); zero coverage impact on this change.

3. [nit] cross_artifact_consistency — chg-GH-103-test-plan.md §5.2 TC-ORDER-001 "Target Layer / Location"
   Gap: Test plan cites lifecycle phases ("delivery phase 6 … phase 9 (@runner)") while the plan maps TC-ORDER-001 to its own phases 2/5 — two coexisting phase-numbering schemes; the plan's mapping table is authoritative and correct, so this is a readability hazard for the coder, not a defect.
   Suggested remediation target phase: test_planning
   Suggested fix: qualify as "lifecycle phase 6/9" vs "plan Phase 2/5" on first use.

4. [nit] decision_capture — chg-GH-103-spec.md §2.1 / chg-GH-103-plan.md "Context and Goals"
   Gap: The spec's KPI table and §2.1 speak of "grep-verified at intake" without recording the actual verified call-site count distinction (2 call sites + 2 prose mentions in the same 2 files). The plan's `rg "mock\.module\(" tests/` gate (tasks 2.5/5.4) uses call syntax so the prose mentions don't false-positive — correct — but a future reader auditing "no mock.module remains" with a bare-name grep will get 2 hits from retained warning prose and may think the AC failed.
   Suggested remediation target phase: specification
   Suggested fix: one clarifying clause in spec §17 AC-F4-1 ("call syntax, not prose mentions") — the test plan already states this precisely (TC-GUARD-001 notes); align the spec's wording when convenient.

## Override / Gate Decision

No override requested or needed — this is a full DoR pass on a normal change. Delivery (phase 6) is unblocked. Findings 1–4 are advisory: none contradict the ticket, weaken an AC, or create cross-artifact drift; the minor finding's risk is fully backstopped by AC-F1-3 (CI green on the PR itself, observed before merge per DoD).
