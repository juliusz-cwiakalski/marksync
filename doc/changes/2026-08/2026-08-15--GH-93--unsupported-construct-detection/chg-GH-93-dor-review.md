# Readiness Review Iteration 1 (DoR Gate — dor_check)

Verdict: READY
Work Item: GH-93
Date: 2026-08-15
Pause Required: no
Reviewer: @readiness-reviewer (adversarial pass; TDR-0014 required-reviewer role for OQ-1 discharged here)

Artifact set reviewed: `chg-GH-93-spec.md` (13 ACs; normative Appendices A/B/C) ·
`chg-GH-93-test-plan.md` (18 TCs) · `chg-GH-93-plan.md` (5 phases + 1 conditional, 34 tasks) ·
`chg-GH-93-pm-notes.yaml` · ticket GH-93 (viewed via `gh issue view 93`) ·
TDR-0014 · PDR-0002 (C-4) · ADR-0005 (subset discipline, K1) ·
`doc/spec/features/feature-reverse-conversion.md` · `.ai/rules/testing-strategy.md` · `.ai/rules/typescript.md`.
Source verification: `src/domain/markdown/reverse-diagnostics.ts`, `src/infra/confluence/parse/reverse.ts`,
`src/infra/confluence/parse/reverse-parser.ts`, `src/infra/confluence/render/storage.ts`,
`tests/adversarial-storage/` (9 pairs), `tests/adversarial/` (12), `package.json` (0.9.0).

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

## Traceability verification (ticket → spec → test-plan → plan)

- Ticket AC-1 (every non-canonical element detected, stable code) → AC-F1-1..3, AC-F5-1, AC-F6-1 → TC-TAXO-001/002, TC-ELEM-001, TC-LAY-001/002, TC-CORP-001..003, TC-RPIN-001, TC-DET-001 → plan tasks 2.2/2.3/2.7/2.8, 3.4–3.9. Verified.
- Ticket AC-2 (zero silent drops) → AC-F2-1, AC-F3-1, AC-F6-1 → TC-ATTR-001/002, TC-TASK-001, TC-CORP-003 → plan tasks 2.2/2.4, 3.9. Verified.
- Ticket AC-3 (page + element location) → AC-F4-1/2 → TC-PAGE-001/002/003, TC-DET-001 → plan tasks 1.2, 2.5, 3.7. Verified.
- Ticket scope classes (foreign/unknown macros, complex layouts, exotic table attributes, unknown elements) map 1:1 to the four new codes (Appendix A ↔ TDR-0014 C-2). Verified.
- Ticket "GH-31 corpus classification as detection test bed" → normative Appendix B alignment map (DEC-3) + runner inventory extension (plan 3.4). Verified. 13/13 spec ACs covered by 18 TCs; all 18 TCs wired to plan phases with first-green locations; all 13 ACs reconciled at plan task 5.5.
- Source claims spot-verified: `REVERSE_CODES` at exactly 3 codes; `ReverseOptions.sourcePath` reserved-unused (`reverse.ts:24-27`); `dropK1Attributes` is element-agnostic today (`reverse-parser.ts:372`) confirming PD-4 is a real, necessary parser change; `img` in the canonical allowlist (`reverse.ts:243`); storage.ts emission sites match plan citations (`a[href]` :103, code-macro family :193–195, `ac:image[ac:alt]` :201, `ri:url` :203, `ri:attachment` :206); 9 storage-side + 12 Markdown-side fixtures; version 0.9.0.
- TDR-0014 pin carriage (both artifacts): pin 1 (orphaned layout) → test-plan TC-LAY-002 + `storage-orphaned-layout` fixture (§6.2, TC-CORP-002) and plan task 2.3(b) + 3.4/3.6; pin 2 (route on `code`) → test-plan §4.1 routing-pin rule + D-TST-1 and plan Constraints + PD-1. Both carried verbatim. Verified.
- OQ-1 closure: spec OQ-1 marked Resolved 2026-08-15 referencing TDR-0014 with both pins — consistent with the TDR text. TDR-0014 `status: Proposed` is per-repo precedent (TDR-0012/0013; human confirms at PR, flips Accepted at merge — recorded in pm-notes and TDR-0014 DACI). Not a blocker.

## Known flags adjudicated (downstream latitudes — confirmed, not rubber-stamped)

1. **OQ-P1 — spec Appendix C omits bare `img`: CONFIRMED (zero-churn reading stands).**
   Verified: spec §2.1 lists `img` in the canonical-element allowlist; `reverse.ts:243` passes `img` through as canonical; the forward converter emits `ac:image`, never bare `img`, so the mirror principle (which governs *attribute* canonicality, not element canonicality) is not violated by keeping `img` canonical with a none-allowlist. The plan's pin is behavior-preserving, unambiguous, and explicitly flagged; no corpus fixture exercises bare `img`. Residual inconsistency recorded as Finding 1 (minor, non-blocking).
2. **OQ-T1 — construct display format: CONFIRMED.** TDR-0014 pin 2 makes `construct` display-only; "sidecars pin whatever ships; sorted + deduplicated + deterministic are the assertions" is exactly the right test posture and cannot accidentally freeze display text as contract.
3. **OQ-T2 — explicit-page-wins-verbatim over `sourcePath` absorption: CONFIRMED.** Spec DEC-2 wording ("absorbed … when no explicit page context is given") admits only the no-merge reading; TC-PAGE-003 step 2 and plan PD-2 codify identical semantics. No divergence.
4. **OQ-T4 / A-4 — layout cells emit zero additional diagnostics: CONFIRMED.** Follows necessarily from DEC-4's one-construct-per-tree rule and the macro-children precedent named in DEC-4's own rationale; it suppresses diagnostics only *inside an already-blocking construct*, so it cannot create a silent drop (the tree itself is diagnosed). Pinned in TC-LAY-001 step 3 + the `storage-complex-layout` sidecar (exactly 1).
5. **A-5 — Appendix B 12-row granularity vs GH-31's 6-way grouping: CONFIRMED.** The 12 rows cover every GH-31 fixture/category (a refinement, not a redefinition); Appendix B is normative and all four artifacts use it as the single denominator for "12/12". The KPI is well-defined.
6. **Version 0.9.0 → 0.10.0 minor: CONFIRMED.** PM-confirmed (pm-notes, 2026-08-15). Semantically sound: emitted-code re-assignment on a verified-consumerless surface (TDR-0014 FACT) is more than a patch, less than a major; registry stays additions-only. Nit on spec text recorded as Finding 2.

## Findings (none blocking)

1. [minor] spec_completeness / cross_artifact_consistency — `chg-GH-93-spec.md` Appendix C ("all other canonical elements" bucket)
   Gap: the normative attribute-allowlist appendix omits bare `img`, while spec §2.1 and the classifier (`reverse.ts:243`) treat `img` as canonical — the appendix a test implements "exactly per Appendix C" (TC-ATTR-002) leaves `img`'s allowlist status formally undefined.
   Suggested remediation target phase: specification
   Suggested fix: add `img` to the Appendix C none-allowlist bucket (one-word edit), codifying the OQ-P1 zero-churn reading this review confirmed. May land as a pre-delivery spec touch-up or with phase 7 doc-sync; the plan's pinned reading is authoritative for delivery in the interim, so this does not block.
2. [nit] decision_capture — `chg-GH-93-spec.md` §14 OQ-3 row
   Gap: status still reads "Provisional: minor … PM confirms at DoR" although the PM confirmation is recorded (`chg-GH-93-pm-notes.yaml`, 2026-08-15); OQ-1/OQ-2 rows were updated in place, OQ-3 was not.
   Suggested remediation target phase: specification
   Suggested fix: flip the OQ-3 status cell to "Resolved 2026-08-15 — minor (PM-confirmed)".
3. [nit] delivery_planning — `chg-GH-93-plan.md` Plan Revision Log
   Gap: revision log says "33 concrete tasks" while the plan contains 34 checkboxes (the delta is the conditional task 6.1; pm-notes and the invoking record say 34).
   Suggested remediation target phase: delivery_planning
   Suggested fix: correct the count or annotate "(33 execution + 1 conditional)". Cosmetic; no re-plan required.

## Gate decision

All ten facets pass; no pause flag; no critical or major findings; every flagged latitude was adjudicated and holds. Blocking-question check: none — OQ-1 resolved via TDR-0014 (Proposed status per repo precedent, human sign-off armed at PR per DACI), OQ-2/OQ-4 spec-resolved, OQ-3 PM-confirmed, OQ-T1..T4 and OQ-P1..P3 all carry pinned non-blocking resolutions consistent across artifacts.

**Verdict: READY — delivery (phase 6) may proceed.** Reopen triggers remain armed per spec §12: if the MS-3 story file lands with deltas against PDR-0002 C-4 + issue #93 scope, the specification phase reopens.
