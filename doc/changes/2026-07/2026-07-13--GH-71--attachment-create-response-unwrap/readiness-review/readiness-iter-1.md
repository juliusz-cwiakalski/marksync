# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-71
Date: 2026-07-13
Pause Required: no

## Facet Summary
- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Blocking Findings

### 1. [major] spec_completeness / cross_artifact_consistency — `chg-GH-71-spec.md` Section 17 (AC-2) vs ticket AC #2

**Gap:** The ticket defines three acceptance criteria. Ticket AC #2 reads: *"Mermaid SVG rendering works end-to-end (diagram appears as image on Confluence)."* The spec's AC-2 silently narrows this to: *"the schema-validation error no longer fires and the upload succeeds."* The "diagram appears as image on Confluence" verification is dropped entirely. While NG-5 defers E2E live-sandbox testing and NG-4 states the GH-69 pipeline is correct, neither AC-2 nor any traceability note explicitly bridges the gap: "ticket AC #2 E2E rendering is satisfied transitively — AC-1/AC-2 prove the upload unblock, NG-4 confirms the pipeline is correct, therefore end-to-end rendering is restored." A reviewer reading the spec in isolation cannot confirm that ticket AC #2 is addressed. This is a silent narrowing of a ticket acceptance criterion, which is the highest-priority class of DoR gap.

**Suggested remediation target phase:** specification

**Suggested fix:** Add an explicit traceability note (in Section 17 or Section 12 Assumptions) stating that ticket AC #2 (E2E rendering) is satisfied transitively via AC-1 (upload success) + the already-merged GH-69 pipeline, and that live-sandbox E2E verification is deferred per NG-5. Alternatively, add a lightweight manual smoke-verification step as a new AC: "manual post-merge smoke confirms a Mermaid diagram renders as an image on a sandbox Confluence page."

---

### 2. [major] test_traceability / ac_quality — `chg-GH-71-test-plan.md` Section 5 (Scenario Index)

**Gap:** The plan's own constraints (`chg-GH-71-plan.md` Phase 1, line 47) acknowledge that `results[0]` is `unknown | undefined` under `noUncheckedIndexedAccess` and that schema validation fails → `RemoteUnreachable` for the undefined case. However, the test plan has no test case that exercises this path. An empty `results` array (`{ results: [] }`) is truthy, so the defensive check enters the unwrap branch, `results[0]` is `undefined`, and `safeParse(undefined)` fails. This is the one "trap path" through the unwrap logic — the case most likely to produce a silent type-narrowing bug under strict mode — and it is the only branch of the fix with zero test coverage. The five existing TCs cover: wrapped-valid (001), flat-valid (002), mermaid-variant (003), existing-regression (004), wrapped-invalid-fields (005). Missing: empty-results-array. The entire rationale for this change includes "add regression test coverage that would have caught the bug" (G-2, retro note in pm-notes); leaving the `noUncheckedIndexedAccess` trap path untested undercuts that goal.

**Suggested remediation target phase:** test_planning

**Suggested fix:** Add a TC-ATTACH-006: "Empty results array `{ results: [] }` → `RemoteUnreachable` (unwrap branch, results[0] is undefined under noUncheckedIndexedAccess)." Assert `result.ok === false` and `result.error.kind === "RemoteUnreachable"`. This closes the one untested path through the unwrap logic.

## Non-Blocking Findings

### 3. [minor] ac_quality — `chg-GH-71-spec.md` Section 9 (NFR-1) + `chg-GH-71-test-plan.md` TC-ATTACH-001 step 6

**Gap:** NFR-1 ("Response parsing performance ≤ 1ms") is not a meaningful requirement for a single object-property access + zod `safeParse`. The test plan's own RSK-T-2 acknowledges the timing assertion "may be flaky on CI due to resource contention." This NFR adds CI flakiness risk without meaningful safety value — there is no performance driver behind it (no latency budget, no user-facing impact).

**Suggested remediation target phase:** specification

**Suggested fix:** Either remove NFR-1 and the TC-ATTACH-001 timing assertion, or reframe NFR-1 as a non-gating observation ("no measurable overhead added") without a hard CI assertion.

### 4. [minor] dod_defined — `chg-GH-71-spec.md` (no explicit DoD section)

**Gap:** The spec has ACs (Section 17) but no explicit "Definition of Done" statement. The ACs collectively serve as a DoD, and the four ACs are testable and traceable. However, per the facet definition, delivery should not start without an explicit DoD. This is borderline PASS but flagged for strictness.

**Suggested remediation target phase:** specification

**Suggested fix:** Add a one-line DoD statement to Section 17 or Section 18: "Definition of Done = all ACs (AC-1 through AC-4) met + all plan phases complete + full attachment test suite green + typecheck + lint clean."

### 5. [nit] ac_quality — `chg-GH-71-spec.md` Section 17 (AC-1)

**Gap:** AC-1 says "returns `ok(AttachmentRef)` with the correct id/title/hash/version" but the `AttachmentRef` type has `filename`, not `title` (confirmed in `src/infra/confluence/attachments.ts` `toRef()`, lines 171-182). The test plan (TC-ATTACH-001) correctly asserts `result.value.filename`, so the mismatch is purely in the spec wording. Could confuse an implementer reading the spec in isolation.

**Suggested remediation target phase:** specification

**Suggested fix:** Change "id/title/hash/version" to "id/filename/hash/version" in AC-1.

### 6. [nit] cross_artifact_consistency — `chg-GH-71-test-plan.md` TC-ATTACH-003 vs spec AC-2

**Gap:** TC-ATTACH-003 claims to validate AC-2 ("Mermaid render pipeline can upload SVG attachments") but only exercises the unit-level `AttachmentService.upload()` with a `kind: "mermaid"` artifact. It does not exercise the render pipeline — the test is functionally identical to TC-ATTACH-001 with a different filename prefix. The existing integration test (`mermaid-render.test.ts`) uses a stubbed `TargetSystem` that bypasses the actual mapper (test plan line 265 acknowledges this). This compounds finding #1: the "pipeline" in AC-2 is validated at neither the unit-pipeline level nor the integration level. Consistent with the narrowed AC-2, but worth noting.

**Suggested remediation target phase:** test_planning

**Suggested fix:** If AC-2 is retained as "upload succeeds" (per finding #1 resolution), update TC-ATTACH-003's title to "Mermaid-kind artifact upload succeeds" to avoid the misleading "pipeline" claim. If AC-2 is broadened to include a manual smoke, add the smoke step reference here.

## What Passes Well

- **Fix approach matches ticket**: The unwrap-`results[0]`-with-defensive-fallback approach is consistent across ticket → spec (Section 5.1, DEC-1/DEC-2) → plan (Phase 1, Task 1.1). No drift.
- **Spike evidence verified**: The response shape in the spec appendix matches `doc/inception/integration-scenarios/11-attachments.md:37` verbatim. TC-ATTACH-001 uses the same shape.
- **noUncheckedIndexedAccess confirmed**: `tsconfig.json` line 14 has `"noUncheckedIndexedAccess": true`. The plan correctly identifies this constraint (Phase 1, line 47).
- **Source code verified**: `mapCreate` at lines 184-196 confirmed to pass `body` directly to `AttachmentCreateResponse.safeParse(body)` with no unwrap — the bug is exactly as described.
- **Existing tests confirmed**: `tests/unit/infra/confluence/attachments.test.ts` has no happy-path create test (only 400-dup, exists, list). The "test gap allowed a P0 to ship" retro in pm-notes is accurate.
- **Schema confirmed unchanged**: `AttachmentCreateResponse` in `schemas/attachment.ts` models a single result; NG-1 (no schema change) is correct.
- **Plan code-area coverage**: Phase-specific file/function targets are explicit (`attachments.ts` mapCreate, `attachments.test.ts` new tests). Blast radius is clear.
- **Plan doc-update coverage**: Plan explicitly states "none" for system docs per phase — correct for a bug fix; system spec (`feature-confluence-adapter.md`) describes AttachmentService at a high level without response-shape internals.
- **Decision capture**: DEC-1 (unwrap in mapper not schema) and DEC-2 (defensive fallback) are change-level decisions captured in the spec decision log. No system-level/precedent-setting decisions requiring an ADR.

## Next Steps

1. **Specification** (finding #1, #3, #4, #5): Add traceability note for ticket AC #2; resolve NFR-1; add explicit DoD; fix title→filename in AC-1.
2. **Test planning** (finding #2, #6): Add TC-ATTACH-006 for empty-results-array edge case; clarify TC-ATTACH-003 scope.
3. Re-run `/check-readiness GH-71` after revisions.
