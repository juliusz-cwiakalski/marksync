# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-71
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

## Iter-1 Blocking Findings — Resolution Verification

### 1. [major, RESOLVED] spec_completeness / cross_artifact_consistency — Spec AC-2 traceability bridge

**Iter-1 gap:** Spec AC-2 silently narrowed ticket AC #2 ("diagram appears as image on Confluence") to "upload succeeds" with no bridge.

**Resolution:** Spec Section 17, AC-2 (line 196) now contains an explicit **"Traceability bridge to ticket AC #2"** that: (a) identifies the full GH-69 pipeline chain (`transform.ts` → Kroki SVG → `marksync-mermaid-<hash>.svg` → `uploadAttachment` → `<ac:image><ri:attachment>`), (b) states this change fixes the ONLY broken link (upload response parsing), (c) argues that once `upload()` returns `ok(ref)`, the attachment stores and `<ac:image>` resolves → E2E rendering restored, and (d) mentions a manual post-merge smoke test as confirmation. E2E deferral is grounded in NG-5. The silent narrowing is eliminated — a reviewer reading the spec in isolation can now trace ticket AC #2 to satisfaction. **Marked resolved.**

### 2. [major, RESOLVED] test_traceability / ac_quality — TC-ATTACH-006 empty results array

**Iter-1 gap:** The `{ results: [] }` → `RemoteUnreachable` trap path (truthy wrapper, `results[0]` undefined under `noUncheckedIndexedAccess`) had zero test coverage.

**Resolution:** TC-ATTACH-006 added to the test plan with full scenario detail (lines 355-393): creates `{ results: [] }`, asserts `result.ok === false`, `result.error.kind === "RemoteUnreachable"`, and explicitly documents the `noUncheckedIndexedAccess` trap path. The TC is traced across: scenario index (line 119), automation plan (line 425), and the plan's Phase 2 task 2.1 (line 113), Phase 3 task 3.3 (line 148), and Test Scenarios table (line 185). **Marked resolved.**

## Non-Blocking Findings

### 3. [minor] plan_coverage — `chg-GH-71-plan.md` Phase 3, line 155

**Gap:** Phase 3's acceptance-criteria line reads "Must: All new tests pass (TC-ATTACH-001/002/003/005)" — it omits TC-ATTACH-006, which was added during remediation. Task 3.3 (line 148) correctly lists all five new TCs including TC-ATTACH-006, so the discrepancy is a copy-paste oversight in the AC summary line only. An implementer reading line 155 in isolation might skip verifying TC-ATTACH-006.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Update line 155 to "Must: All new tests pass (TC-ATTACH-001/002/003/005/006)".

### 4. [minor] test_traceability — `chg-GH-71-test-plan.md` Section 3.1 (line 57) and Section 3.3 (line 74)

**Gap:** TC-ATTACH-006 claims AC-1 + NFR-2 coverage in the scenario index (Section 5.1, line 119), but it is absent from both the AC-1 coverage row (Section 3.1, line 57: lists TC-ATTACH-001/002) and the NFR-2 coverage row (Section 3.3, line 74: lists TC-ATTACH-005). The coverage tables are stale relative to the scenario index — introduced when TC-ATTACH-006 was added to Section 5 but not backfilled into Sections 3.1/3.3.

**Suggested remediation target phase:** test_planning

**Suggested fix:** Add TC-ATTACH-006 to the TC ID(s) cells in both the AC-1 row (Section 3.1) and the NFR-2 row (Section 3.3) for internal consistency.

### 5. [nit] ac_quality — `chg-GH-71-test-plan.md` TC-ATTACH-006 (line 119) AC-1 mapping

**Gap:** TC-ATTACH-006 is a **negative** test (`{ results: [] }` → `RemoteUnreachable`). AC-1 is a **happy-path** assertion (wrapped response → `ok(AttachmentRef)`). Mapping TC-ATTACH-006 to AC-1 is a stretch — it tests the complementary edge case, not AC-1's success assertion. At most it validates the "NOT RemoteUnreachable" contrast clause of AC-1. If the intent is "AC-1's error-handling boundary," consider mapping to a dedicated edge-case ID or to NFR-2 alone.

**Suggested remediation target phase:** test_planning

**Suggested fix:** Either drop the AC-1 mapping for TC-ATTACH-006 (leave NFR-2 only), or add a parenthetical "(error-boundary complement)" to clarify the relationship.

### 6. [minor, persistent] ac_quality — `chg-GH-71-spec.md` Section 9 (NFR-1)

**Gap:** NFR-1 ("Response parsing performance ≤ 1ms") remains a hard threshold for a single property-access + zod `safeParse`. The test plan's own RSK-T-2 acknowledges CI flakiness risk. Carried forward from iter-1 finding #3; not addressed. Non-blocking because the timing assertion is unlikely to gate delivery in practice (a simple object unwrap is sub-microsecond).

**Suggested remediation target phase:** specification

**Suggested fix:** Reframe NFR-1 as "no measurable overhead added" (observation, not hard CI gate) or drop the timing assertion from TC-ATTACH-001 step 6.

### 7. [nit, persistent] ac_quality — `chg-GH-71-spec.md` Section 17 (AC-1) "title" vs "filename"

**Gap:** AC-1 says "returns `ok(AttachmentRef)` with the correct id/title/hash/version" but `AttachmentRef` has `filename`, not `title` (confirmed: `toRef()` at `attachments.ts:178` maps `r.title → filename`). TC-ATTACH-001 correctly asserts `result.value.filename`. Carried forward from iter-1 finding #5; not addressed.

**Suggested remediation target phase:** specification

**Suggested fix:** Change "id/title/hash/version" to "id/filename/hash/version" in AC-1.

### 8. [nit, persistent] cross_artifact_consistency — `chg-GH-71-test-plan.md` TC-ATTACH-003 title

**Gap:** TC-ATTACH-003 title says "Mermaid SVG artifact upload through upload pipeline" but only exercises unit-level `AttachmentService.upload()` with `kind: "mermaid"` — functionally a variant of TC-ATTACH-001 with a different filename prefix. The integration test (`mermaid-render.test.ts`) uses a stubbed `TargetSystem` that bypasses the mapper (acknowledged at line 266). Carried forward from iter-1 finding #6; not addressed.

**Suggested remediation target phase:** test_planning

**Suggested fix:** Rename to "Mermaid-kind artifact upload succeeds" to avoid the misleading "pipeline" claim.

## What Passes Well

- **Iter-1 blockers fully resolved.** Both major findings have surgical, correct fixes. The AC-2 traceability bridge is thorough (full pipeline chain, explicit transitive argument, smoke-test mention). TC-ATTACH-006 is well-specified with clear trap-path documentation.
- **Fix approach consistent across all artifacts.** Unwrap `results[0]` with defensive fallback (DEC-1/DEC-2) is identical in ticket → spec (Section 5.1) → plan (Phase 1, task 1.1). No drift.
- **Source code confirmed.** `mapCreate` (`attachments.ts:184-196`) passes `body` directly to `AttachmentCreateResponse.safeParse(body)` — the bug is exactly as described. The schema (`attachment.ts:24-26`) correctly models a single result, confirming DEC-1 (unwrap in mapper, not schema).
- **Test helpers confirmed.** `script()`, `jsonRes()`, `svgArtifact()` all exist in `attachments.test.ts` (lines 50, 37, 28). The plan's reliance on these helpers is feasible.
- **noUncheckedIndexedAccess confirmed.** `tsconfig.json:14` has `"noUncheckedIndexedAccess": true`. The plan's constraint analysis (Phase 1, line 47) and TC-ATTACH-006's trap-path rationale are grounded.
- **System spec consistent.** `feature-confluence-adapter.md:135` describes AttachmentService at a high level (multipart upload, 400-dup idempotency) with no response-shape internals — no spec update needed, consistent with plan stating "none."
- **Decision capture appropriate.** DEC-1/DEC-2 are change-level decisions in the spec decision log. No system-level or precedent-setting decisions requiring an ADR.
- **Plan code-area coverage explicit.** Phase-specific file/function targets: `attachments.ts` mapCreate (Phase 1), `attachments.test.ts` new tests (Phase 2). Blast radius is clear.
- **All 6 TCs traced in plan.** Test Scenarios table (plan lines 178-185) includes all TCs with phase and AC-coverage mapping.

## Gate Result

**READY** — all 10 facets PASS. Both iter-1 blocking findings resolved. Remaining findings are minor/nit and non-blocking; none introduce cross-artifact contradictions or coverage gaps that would risk delivery. Delivery may proceed.

## Next Steps

1. **Delivery** (`@coder`): Execute the 3-phase plan. Findings #3–#8 are advisory and can be fixed opportunistically during delivery or noted in the review phase — they do not block.
2. **Opportunistic fixes during delivery**: Correct the Phase 3 line 155 TC list (finding #3), the coverage table entries (finding #4), and the AC-1 "title→filename" wording (finding #7) if touching those files.
