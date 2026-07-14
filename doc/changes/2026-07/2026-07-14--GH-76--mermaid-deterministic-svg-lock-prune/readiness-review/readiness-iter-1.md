# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-76
Date: 2026-07-14
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: FAIL
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: FAIL
- dod_defined: PASS

## Findings

1. [major] plan_code_area_coverage — chg-GH-76-plan.md / Phase 1, task 1.4 + "Files and modules"
   Gap: Phase 1 changes the `Renderer` port signature from `render(source: string)` to
   `render(source, config)`. The plan lists updating stubs in
   `tests/unit/domain/mermaid/transform.test.ts` (StubRenderer, EmptyErrorRenderer,
   AlwaysErrorRenderer) and `tests/golden/markdown/mermaid-render-golden.test.ts`
   (StubRenderer), but MISSES `tests/integration/app/mermaid/mermaid-render.test.ts`, which
   contains two classes that `implements Renderer` with the old `render(source: string)`
   signature: `StubRenderer` (line 46) and `SelectiveRenderer` (line 54). Under TypeScript
   strict mode these will fail to compile after the port change, directly breaking the
   Phase 1 acceptance criterion "All existing tests pass after the signature update (no
   regressions)". The blast radius is therefore incomplete. Verified: `computePlan`
   (`src/app/push-flow.ts:146`) accepts a `mermaidRenderer?: Renderer` and these stubs are
   injected there across ~10 call sites in that file.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add `tests/integration/app/mermaid/mermaid-render.test.ts` to Phase 1
   task 1.4 (update `StubRenderer` + `SelectiveRenderer` signatures to accept
   `MermaidRenderConfig`) and to the Phase 1 "Files and modules" code-area list.

2. [major] cross_artifact_consistency — chg-GH-76-test-plan.md §7 ("Test File Updates
   Required") vs chg-GH-76-plan.md task 3.3
   Gap: The test plan §7 states `tests/unit/app/push-flow.test.ts` is a "New file: Create
   this file for unit tests of `finalizeSuccessfulUpdate`". The plan task 3.3 correctly
   states the file "already exists with TC-PROV tests — add a new `describe` block". The
   file DOES exist (188 lines, containing TC-PROV-002/003/005 for `bindingToProperty` /
   `appendProvenancePanel`). The test plan is factually wrong and contradicts the plan.
   Suggested remediation target phase: test_planning
   Suggested fix: Correct the test plan §7 entry to "Existing file — add new `describe`
   block for TC-LOCK-002", matching the plan and the on-disk reality.

3. [major] decision_capture + cross_artifact_consistency — chg-GH-76-spec.md §14 (OQ-1),
   chg-GH-76-test-plan.md §8.3 (OQ-1), chg-GH-76-plan.md Phase 2 (OQ-1 note)
   Gap: OQ-1 (reuse the full §3.3 normalization rule set vs a simplified subset for Kroki
   output) is marked "Decision needed: consult @decision-advisor" in the spec and "Open
   (deferred to @decision-advisor)" in the test plan. The plan has effectively resolved it
   by defaulting to the full rule set ("start with the full §3.3 rule set — proven from the
   GH-11 spike — consult @decision-advisor if simplification is warranted after Phase 2
   validation"). The three artifacts are misaligned on OQ-1's status, and the
   @decision-advisor consultation is deferred INTO delivery (Phase 2). DoR remediation
   targets must never be `delivery`; an open decision that gates a design choice cannot be
   pushed into the phase it decides.
   Suggested remediation target phase: specification
   Suggested fix: Update OQ-1 status in the spec (and mirror in the test plan) to
   "Resolved (default): full §3.3 rule set — proven from the GH-11 spike
   (`spikes/mermaid-render/normalize.ts`) and renderer-agnostic; simplification deferred to
   a separate follow-up decision only if Phase 2 tests demonstrate unnecessary rules."
   Record the default in `chg-GH-76-pm-notes.yaml` `decisions`.

4. [minor] plan_code_area_coverage — chg-GH-76-plan.md Phase 3/4 + chg-GH-76-test-plan.md
   §5.2
   Gap: The plan/test-plan propose creating a NEW file
   `tests/integration/confluence/push-flow.test.ts` for TC-LOCK-001, TC-LOCK-003,
   TC-E2E-002/003/004, but neither acknowledges existing, highly-relevant integration
   tests: `tests/integration/app/mermaid/mermaid-render.test.ts` (whose "TC-MERM-003
   attachment reuse" test at line 283 — "first uploadAssets → 1 upload; second with
   exists=true → 0 uploads" — overlaps TC-E2E-002; whose `SelectiveRenderer` per-doc
   isolation overlaps TC-E2E-004) and `tests/integration/app/idempotency.test.ts` (whose
   "TC-INTEGRATION-005: Second unchanged push → every entry NO_CHANGE → 0 writes" overlaps
   TC-E2E-003). This creates duplication risk and an incomplete blast-radius picture (these
   files are touched by the Phase 1 signature change regardless, per finding 1).
   Suggested remediation target phase: test_planning
   Suggested fix: Acknowledge the existing tests in the test plan; prefer extending them
   over creating a parallel `confluence/push-flow.test.ts` (or justify the new location);
   add `tests/integration/app/mermaid/mermaid-render.test.ts` to the plan's affected-files
   list.

5. [minor] ac_quality — chg-GH-76-spec.md §17 AC-F2-2, chg-GH-76-test-plan.md
   TC-MERM-NORM-003
   Gap: AC-F2-2 asserts "0 visual differences" between normalized and raw SVG.
   TC-MERM-NORM-003 implements this via "DOM-structural comparison ... if feasible;
   otherwise validate structural-element equivalence". The GH-11 spike established that
   happy-dom (the chosen preload) has NO SVG layout engine (`getBBox` returns zeros), so
   true visual comparison is infeasible there; the test plan's own risk register (§8.1)
   flags "happy-dom cannot render Mermaid SVG reliably" with an escalation path to
   Vitest/Playwright. The AC is aspirational; the test can only proxy it structurally, so
   AC and test are misaligned on what "visual" means.
   Suggested remediation target phase: specification
   Suggested fix: Tighten AC-F2-2 to assert "0 structural/semantic differences (elements,
   attributes affecting rendering, text, paths)" — matching what the test can verify — or
   explicitly document the structural proxy in the AC wording.

6. [minor] cross_artifact_consistency — chg-GH-76-plan.md task 4.4 +
   chg-GH-76-test-plan.md §7
   Gap: Plan task 4.4 says "Add E2E sandbox scenario TC-E2E-001 in
   `tests/e2e/sandbox-publish.test.ts`" (the "Add ... in" phrasing implies the file
   exists). The test plan §7 hedges "Existing tests: May exist from MS-0002". The file
   does NOT exist (`tests/e2e/` contains only `.gitkeep`). Both artifacts are ambiguous
   about whether the file must be created.
   Suggested remediation target phase: delivery_planning
   Suggested fix: State explicitly that `tests/e2e/sandbox-publish.test.ts` is a NEW file
   to be created (not appended to), and note `tests/e2e/` currently has no tests.

## Notes

- No prior readiness records existed; this is iteration 1.
- Code-area verification performed against the working tree: all source files cited by the
  plan exist; `finalizeSuccessfulUpdate` is at `src/app/push-flow.ts:710` with the additive
  merge at lines 766-768 (`{...binding.attachmentHashes, ...assetUploadHashes}`); the
  409-reapply path calls it at line 1116, the normal update path at line 1181, and the
  create path (line 1313) already uses replacement — all consistent with the plan.
- `spikes/mermaid-render/normalize.ts` exists and implements the full §3.3 rule set; the
  plan's "lift verbatim" approach is feasible.
- `MermaidRenderConfig` (`src/domain/config/types.ts:57`) already defines `policy`,
  `securityLevel`, `htmlLabels`, `deterministicIds` — no type change needed; only the
  forwarding gap is closed (consistent with spec DM-1 / plan constraints).
- `package.json` version is `0.5.0`; the plan's `0.5.0 → 0.5.1` patch bump is consistent.
- No `needs_human_input` decisions surfaced; Pause Required is `no`. The blocking fixes are
  artifact-author tasks for `@plan-writer`, `@test-plan-writer`, and `@spec-writer`.
- Override path not applicable: this change alters behavior and touches contracts
  (`Renderer` port, lock semantics, Kroki hash input) — it is not a trivial change.
