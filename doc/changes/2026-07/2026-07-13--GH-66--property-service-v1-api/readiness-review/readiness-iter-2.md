# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-66
Date: 2026-07-13
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

## Iter-1 Resolution Verification

| Iter-1 Finding | Status | Notes |
|----------------|--------|-------|
| 1 (property-PUT-409→Conflict) | **PARTIALLY RESOLVED → new blocking sub-finding A** | Spec fully re-resolved (RSK-4/OQ-2/DEC-6/Appendix B → RemoteUnreachable). Plan detailed tasks 2.2/2.3 + Phase 2 AC updated. **BUT plan Constraints (L61) and Risks RSK-4 (L68) were NOT updated** — still say "Conflict". See finding A. |
| 2 (TC-PROP-V1-ERR-002 GET 413) | **RESOLVED (test plan) → new minor sub-finding B** | Test plan rewritten to `put()` POST 413 → TooLarge (correct code path; verified properties.ts L82-88). **BUT plan scenario table (L342) still says "v1 GET 413"** — stale. See finding B. |
| 3 (version-extraction mechanism) | **RESOLVED** | Plan task 2.2 now specifies: raw v1 GET → `PropertyV1Response.safeParse` → extract `version.number` → pass to `updateByKey(pageId, key, value, currentVersion)`. Fallback-GET non-200 handling fully specified (404→RemoteUnreachable, 403→Forbidden, other→RemoteUnreachable). Check-listable. |
| 4 (§5 L154-155 doc-update) | **RESOLVED** | Plan Phase 5 task 5.2 + spec §22 now include §5 L154-155. Verified the checked AC at feature-confluence-adapter.md L154-155 will become FALSE. |
| 5 (phantom TC-PROP-V1-IDEM-001) | **RESOLVED** | Test plan §3.1 AC-F3-1 row now has structural justification ("Covered by the absence of property writes on NoOp"). No phantom TC reference. |
| 6 (schema `when` optional) | **RESOLVED (spec)** | Spec F-4 + DM-1 now state `version.when` optional, `version.number` required. Plan task 1.1 shape notation does not mark optionality (see nit E). |
| 7 (pm-notes decisions empty) | **RESOLVED** | pm-notes.yaml now records PM-DEC-1 in `decisions` with full rationale. |

## Blocking Findings

### A. [major] cross_artifact_consistency — plan Constraints (L61) + Risks RSK-4 (L68) vs Phase 2 tasks/ACs (L138, L144, L153) vs spec DEC-6/RSK-4

**Persistent from iter-1 finding 1 (inverted):** The revision updated the plan's
detailed Phase 2 tasks and acceptance criteria to match DEC-6 (RemoteUnreachable),
but left the high-level Constraints and Risks sections stale. The plan now
contradicts **itself** and the **spec** on the central technical risk.

Concrete contradictions:

- **Plan Constraints (L61):** "409 after GET is rare (racy window) — acceptable
  to **surface as Conflict** to caller (OQ-2 resolved)"
- **Plan Risks RSK-4 (L68):** "Mitigated by: **Surface 409 as Conflict to caller
  (same as page 409)**. Acceptable for MS-0002 MVP (OQ-2 resolved)."

vs.

- **Plan Phase 2 task 2.2 note (L138):** "A 409 on the property PUT ... maps to
  `RemoteUnreachable` (the catch-all), **NOT `Conflict`**, for MS-0002 MVP
  (PM-DEC-1 / spec DEC-6)."
- **Plan Phase 2 task 2.3 note (L144):** identical.
- **Plan Phase 2 AC (L153):** "Must: Property-PUT 409 ... maps to
  **RemoteUnreachable, NOT Conflict**, per PM-DEC-1/DEC-6."
- **Spec RSK-4 (L232), OQ-2 (L256), DEC-6 (L267), Appendix B (L347):** all say
  RemoteUnreachable.

So plan RSK-4 says "Conflict", spec RSK-4 says "RemoteUnreachable" — same risk
ID, opposite mitigation. The plan's own risk register contradicts its acceptance
criteria. A coder reading top-down encounters "surface as Conflict" (L61/L68)
before reaching the Phase 2 tasks that say "NOT Conflict" (L138/L144/L153). The
RSK-4 "mitigation" as written does not match what will be implemented.

PM-DEC-1 rationale verified against source: push-flow.ts L687-694 (update arm)
and L1196-1203 (create arm) both block on ANY `putProperty` error without
special-casing `Conflict` — the deferral is sound. The problem is purely that
the revision propagated the decision to the detailed tasks but not the summary
sections.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Update plan Constraints (L61) to "acceptable to surface as
RemoteUnreachable (catch-all)" and plan RSK-4 (L68) mitigation to "Surface 409
as RemoteUnreachable (catch-all), NOT Conflict, per PM-DEC-1/DEC-6. Acceptable
for MS-0002 MVP." Two-line fix — but material to delivery correctness.

---

## Non-Blocking Findings

### B. [minor] cross_artifact_consistency — plan scenario table (L342) stale vs test plan

**Gap:** Plan Test Scenarios table (L342):
`| TC-PROP-V1-ERR-002 | v1 GET 413 → TooLarge | 3, 4 | AC-F1-1, G-3 |`

Test plan (L120, L574):
`TC-PROP-V1-ERR-002 | put POST 413 → TooLarge`

The test plan was corrected in iter-1 (POST 413, not GET 413) but the plan's
summary table was not. A coder cross-referencing the plan table would see "GET
413" and could write the wrong test. Detailed task 3.8 (L203) is generic
("413 → TooLarge") so it does not actively mislead, but the summary contradicts
the authoritative test plan.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Change L342 to `| TC-PROP-V1-ERR-002 | put POST 413 → TooLarge | 3, 4 | G-3 |`.

---

### C. [minor] plan_coverage — plan Phase 2 AC (L153) untested: PUT 409 → RemoteUnreachable

**Gap:** Plan Phase 2 has an explicit Must AC: "Property-PUT 409 (rare
concurrent-write race) maps to RemoteUnreachable, NOT Conflict, per
PM-DEC-1/DEC-6." No test case in the test plan asserts PUT→409→RemoteUnreachable.
TC-PROP-V1-VERSION-001/002 exercise PUT→200 (happy path only). The PUT-409
behavior is the default catch-all fallthrough (no new code branch needed), so
the risk of incorrect implementation is low — but the plan's own Must AC has no
test trace, meaning Phase 4 task 4.7 ("verify all ACs") cannot verify it by
test, only by code review.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Either add a unit test asserting PUT→409→RemoteUnreachable
(or note that the catch-all is implicitly covered by TC-PROP-V1-SCHEMA-001
which exercises the same RemoteUnreachable branch), or downgrade the Phase 2 AC
from "Must" to a design note. Minimal: add one assertion to
TC-PROP-V1-VERSION-001 varying the PUT response to 409 and asserting
`RemoteUnreachable`.

---

### D. [nit] test_traceability — test plan TC-PROP-V1-ERR-002 (L120, L579) AC link stale

**Gap:** TC-PROP-V1-ERR-002 was rewritten from GET 413 to POST 413, but its AC
link remains `AC-F1-1` (a GET acceptance criterion: "v1 GET returns byte-equal
stored value"). The test now exercises `put()` POST-create, so the relevant
trace is `AC-F2-1` (POST create) or `G-3` (error semantics) only. The wrong AC
link is misleading for coverage auditing.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Change ERR-002 related IDs from `AC-F1-1, G-3` to `AC-F2-1, G-3`
(or `G-3` only).

---

### E. [nit] plan_coverage — plan Phase 1 task 1.1 (L87) + AC (L96) schema shape omits `when` optionality

**Gap:** Spec F-4 (L82) and DM-1 (L196) explicitly state `version.when` is
optional ("unused by code"). Plan task 1.1 shape notation
(`{id, key, value, version: {number, when}}`) and the Phase 1 AC (L96) list
`when` without `.optional()`. A literal coder following only the plan's shape
notation could make `when` required, causing spurious `RemoteUnreachable` if
Confluence v1 omits the timestamp. The spec is authoritative and referenced by
ID, so the risk is low, but the plan shape should mirror the spec's optionality.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Update plan task 1.1 shape to
`{id, key, value, version: {number, when?}}` (or note "when optional per DM-1").

---

## What Passes

- **Spec DEC-6 / OQ-2 / RSK-4 / Appendix B** are fully and consistently
  re-resolved to RemoteUnreachable (not Conflict). The decision rationale is
  verified against source: both `putProperty` call sites in push-flow.ts
  (L687-694 update, L1196-1203 create) block on ANY error without Conflict
  special-casing — the re-fetch-once dance is updatePage-only.
- **Version-extraction mechanism** (plan task 2.2) is now fully check-listable:
  raw v1 GET → PropertyV1Response.safeParse → extract version.number →
  updateByKey with currentVersion. Fallback-GET error handling (404/403/other)
  explicitly specified — this was the single non-trivial implementation detail.
- **Happy-path version flow** (POST create → 409 → GET version → PUT with
  incremented version) is consistent spec→plan→test with exact request-sequence
  and body assertions (TC-PROP-V1-VERSION-001/002).
- **Error semantics for common case** (403→Forbidden, 404→ok(undefined),
  413→TooLarge via put POST, schema-fail→RemoteUnreachable) are consistent
  across all three artifacts.
- **Schema migration** (Phase 1) cleanly separated from core fix (Phase 2) and
  tests (Phase 3); build-red-between-phases acknowledged.
- **Doc-update coverage** now includes §5 L154-155 (the checked system-spec AC
  that becomes FALSE). feature-confluence-adapter.md L154-155 confirmed.
- **PM-DEC-1** is captured in both pm-notes.yaml (decisions) and spec (DEC-6).
- **Code-area coverage** explicit per phase; blast radius scoped to
  properties.ts, schemas/property.ts, two test files.
- **All 8 spec ACs (§17)** traced to test cases in the test plan.

## Recommended Reopen Targets

Reopen **delivery_planning** (blocking finding A; non-blocking B, E) and
**test_planning** (non-blocking C, D). Finding A is a two-line fix in the plan's
Constraints and Risks sections — the single remaining blocker. After that fix,
re-run this gate (expected: READY).

## Source Ticket Access Note

GitHub Issue GH-66 could not be loaded via `gh` (repo `juliusz_cwiakalski/marksync`
unresolvable from this environment). Ticket context was validated via PM notes
(root-cause analysis, L44-80) which reference the ticket evidence and confirm
consistency with source code. No ticket-level gap identified.
