# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-29
Date: 2026-07-15
Pause Required: no
Reviewer: @readiness-reviewer (adversarial DoR gate)
Artifacts reviewed: spec v1.1, test-plan v1.1, plan v1.1 (all on `feat/GH-29/quality-gate-wiring`)

> Independent, read-only re-review after iter-1 NOT_READY. Stance: adversarial.
> Verified the five iter-1 findings landed correctly, probed for new gaps introduced
> by the v1.1 edits, and re-ran the carry-over consistency checks. Read source only to
> verify plan_code_area_coverage and the INV-SEC-1 data-flow feasibility question.

---

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

All ten facets PASS. The iter-1 blocker (F1) is resolved; F2–F5 are resolved at the
load-bearing level. Two non-blocking findings remain (N1: 2 residual RSK-4 wording
cells; N2: a persistent, pre-existing INV-SEC-1 assertion-semantics observation
inherited from TC-INTEGRATION-011). Neither blocks delivery.

---

## iter-1 Finding Resolution Status

### F1 [blocker → RESOLVED] — INV-SEC-1 injection point corrected to document content

**Evidence (verified against the real reference test):**
- Read `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011
  (lines 92–202): the pattern is real and exactly as cited — `fakeRepo.setFile("doc-a.md",
  "---...---\n# Doc A\n\nThis is doc A content. Don't leak this: ${fakeToken}")` plants the
  sentinel in the **document body (Markdown source)**, then asserts the token is absent
  from the Plan JSON, the apply journal, the ApplyReport, and `version.message`. The
  journal is asserted to carry only 5 non-content fields (`ts/op/pageId/uuid/outcome`).
- **Ran the test:** `bun test tests/integration/app/secrets-safety-integration.test.ts`
  → **4 pass, 0 fail**. The reference shape is green on `main`.
- **Spec v1.1:** AC-F2-4 (L280) and §5.1 F-2 "INV-SEC-1 injection mechanism" (L109) now
  both pin injection to "the document **content** (Markdown source), not in
  config/provenance" and explicitly state credentials never enter
  `computePlan`/`applyPlan` (they live in the mocked `ConfluenceTarget`/`ConfluenceClient`
  adapter). The phrase "config/provenance path that flows to outputs" is gone from every
  load-bearing location.
- **Test-plan v1.1:** TC-BDD-006 preconditions (L349), step 1 (L352), step 10 (L361), and
  the Notes "Injection pattern (proven)" + "Reference shape" block (L368–371) faithfully
  mirror TC-INTEGRATION-011 (`FakeRepository.setFile` → content; sentinel absence checked
  on plan/journal/lock/diagnostics/`version.message`/cache).
- **Plan v1.1:** OQ-P2 is **CLOSED** and moved from "Open questions" to a **"Resolved
  decisions"** block (L60–62): "*Decision: inject the known sentinel secret string into
  the document CONTENT … mirroring TC-INTEGRATION-011.*" Tasks 3.3 (L212) and 3.6 (L215)
  and the Phase 3 INV-SEC-1 AC (L223) all carry the corrected injection point and preserve
  the RSK-5 escalation ("If the sentinel leaks … genuine src/ redaction bug → STOP +
  escalate; do NOT weaken the assertion").

**Feasibility confirmed:** the BDD scenario is realizable exactly as written by mirroring
the green TC-INTEGRATION-011 shape; no `src/` change is implied (DEC-3 holds). The
scenario is no longer at risk of being unimplementable.

### F2 [minor → RESOLVED (load-bearing) + 1 residual nit → N1] — DEC-4 adapter-port wording

**Resolved at the authoritative level:**
- Spec DEC-4 (L258), AC-F2-5 (L281), NFR-MAINT-1 (L203), G-3 (L68), §5.1 F-2 hard
  constraint (L109), Glossary `TargetSystem` port (L322), RSK-4 (L219), and Success
  Metrics (L78: "2 (`TargetSystem` + `Repository`)") — all broadened to "only the adapter
  ports (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository`); domain logic
  real".
- Test-plan: preconditions of TC-BDD-001..006, §4 (L116), API-3/API-4 (L83–84), AC-F2-5
  coverage row (L69), §3.3 NFR-MAINT-1 (L96) — all corrected.
- Plan: Context (L45), guardrail blockquote (L51), Constraints (L85), Success Metrics
  (L108), Phase 2 Goal/Task 2.3/AC, Task 3.4, Phase 3 AC — all corrected.

**Residual (carried to N1):** 2 RSK-4 mitigation cells still carry the too-narrow
"mock only `TargetSystem` port" wording — see N1.

### F3 [minor → RESOLVED] — TC-CHECK-001 no longer implies `check` chains `test:bdd`

**Evidence (verified against `package.json`):**
- `package.json` L35: `"check": "bun run lint && bun run format:check && bun run
  typecheck && bun run test && bun run check:boundaries"` — confirmed it does **NOT**
  chain `test:bdd`.
- Test-plan TC-CHECK-001 v1.1 (L683–700): steps now enumerate the 5 things `check` runs
  (lint/format:check/typecheck/test/check:boundaries), step 7 explicitly states "*`bun run
  check` does NOT run `test:bdd`*", and points to TC-BDD-007 for the separate BDD binding
  (AC-1). Expected Outcome + Notes repeat the separation. Accurate.

### F4 [minor → RESOLVED] — TC-BDD-005 reflects `computePlan` aborts; `applyPlan` never called

**Evidence (verified against the engine):**
- `src/app/push-flow.ts` L179–183: step 4 "Duplicate-UUID fatal gate (after discovery,
  before any render)" calls `detectDuplicateUuids(docsWithUuid)` and `return dupResult`
  on failure — early-return before the render loop (step 5, L185+) and long before
  `applyPlan`. Confirmed.
- Test-plan TC-BDD-005 v1.1 (L316–326): step 2 now reads "*When `computePlan` runs (real
  module) — it aborts at the duplicate-UUID gate before any apply*", step 4 "*And
  `applyPlan` is never called (zero write operations)*". Expected Outcome + Notes align.
  Matches plan task 2.2.

### F5 [nit → RESOLVED] — PR-open timing clarified

- Plan v1.1 §"Acknowledged red intermediate state" (L53): adds an explicit "**PR-open
  timing (F5)**" note — the PR opens only at/after **Phase 6** (all four features green)
  so the red `test:bdd` window exists only on the Phase 1→2 feature-branch commits, never
  on the PR head. Phase 1 task 1.6 (L132) reinforces it.
- Note: the plan chose Phase 6 (stricter than iter-1's Phase-3 suggestion) and explicitly
  records that reordering the binding `test:bdd` into Phase 2 was considered and rejected
  to preserve Phase 1's isolated runner-validation signal. More conservative than
  required; defensible. No regression.

---

## Carry-over Consistency Check (iter-1 PASS items, re-verified post-edit)

1. **DEC-1 / DEC-3 / DEC-4 remain sound and internally consistent.**
   - DEC-1 (BDD = 4 INV scope): unchanged; literal to TDR-0007 §70-73 and
     `testing-strategy.md`; both displaced NFRs verified covered in the integration tier.
   - DEC-3 (no `src/` changes): unchanged; the INV-SEC-1 content-injection fix is realized
     via the `FakeRepository.setFile` test helper — **no `src/` change implied** (verified
     against `push-flow.ts` signatures: `computePlan(config, lock, git, target)` and
     `applyPlan(plan, target, lock, opts)` take injected ports). DEC-3 holds cleanly.
   - DEC-4 (adapter ports mocked): correctly worded at every load-bearing site (see F2).
     The 2 residual RSK-4 cells (N1) do not affect the decision's soundness.
2. **Phase → AC → TC traceability still complete.** Re-walked the plan traceability table
   (L371–388) + test-plan §3.1: all 12 ACs (AC-F1-1, AC-F2-1..5, AC-1, AC-F3-1..3,
   AC-F4-1, AC-2) map to ≥1 TC and ≥1 phase. No AC orphaned by the v1.1 edits.
3. **No new open questions block delivery.** OQ-P1 (cucumber invocation) remains a
   genuine empirical validate-or-adjust in Phase 1 (DEC-2). OQ-P2 is CLOSED. **No new OQs
   were introduced** by the v1.1 edits.
4. **The INV-SEC-1 fix did not weaken the invariant or violate DEC-3.** Moving injection
   from config/provenance → document content makes the scenario *more* realizable, not
   less; the RSK-5 escalation ("sentinel leaks → genuine src/ bug → STOP") is preserved
   verbatim in task 3.6. No `src/` edit is implied. (A separate, pre-existing semantic
   nuance is captured as N2 below — non-blocking.)

---

## New Findings

### N1. [MINOR] `cross_artifact_consistency` — 2 residual RSK-4 cells still say "mock only `TargetSystem` port"

**Location:** `chg-GH-29-test-plan.md` RSK-4 mitigation (L788);
`chg-GH-29-plan.md` RSK-4 mitigation (L98).

**Gap:** F2 asked to broaden the wording everywhere. The authoritative artifacts
(DEC-4/AC-F2-5/NFR-MAINT-1/G-3/§5.1/Glossary/Success Metrics + test-plan preconditions/§4)
are all corrected. But two RSK-4 mitigation cells were missed:
- test-plan L788: *'code-review each step against the "mock only TargetSystem port" rule'*.
- plan L98: *'code-review each step against "mock only `TargetSystem` port"'*.

Both v1.1 revision logs overclaim — plan L423 ("wording broadened **everywhere**") and
test-plan L812 ("adapter-port wording updated **throughout**") — yet these two cells retain
the too-narrow phrasing that F2 flagged as contradicting the plan's own `FakeRepository`
usage. A literal-minded reviewer reading RSK-4 in isolation could still flag a correct
`FakeRepository`-using step as a guardrail violation.

**Severity rationale:** MINOR (not blocking). The load-bearing AC/NFR/DEC are correct, the
intent is unambiguous to any reviewer who reads DEC-4 alongside RSK-4, and no delivery
task depends on the RSK-4 prose.

**Suggested remediation target phase:** delivery_planning (plan L98) + test_planning
(test-plan L788) — a two-cell wording touch. Cheap; can also be folded into the
phase-7 doc-sync pass if preferred.

**Suggested fix:** In both RSK-4 mitigation cells, replace "mock only `TargetSystem` port"
with "mock only the adapter ports (`TargetSystem` via `FakeTarget`, `Repository` via
`FakeRepository`); domain logic real" to match DEC-4.

---

### N2. [MINOR, PERSISTENT from iter-1 note] `ac_quality` — INV-SEC-1 BDD assertion inherits TC-INTEGRATION-011's potentially weak semantics (empirically confirmed)

**Location:** `chg-GH-29-test-plan.md` TC-BDD-006 steps 4–9 (L355–360), Expected Outcome
(L363–366); `chg-GH-29-spec.md` AC-F2-4 (L280); `chg-GH-29-plan.md` task 3.6 (L215).

**Gap (persistent):** iter-1 flagged as a non-blocking "note" that "*a token planted in
doc content legitimately appears in `entries[].renderedBody`, so 'assert Plan JSON does
not contain the token' is a weak/near-vacuous assertion*" and recommended: "*Either
sharpen the assertion or explicitly document the scenario's scope as an integration-level
redundant check whose primary coverage is the unit redaction layer (ADR-0011).*"

The F1 fix addressed the **injection point** (the actual blocker) but only **partially**
addressed the assertion-semantics sharpening: TC-BDD-006 Expected Outcome now says
"*Redaction is applied before serialization for non-content output paths*" (an
acknowledgment of content vs non-content paths) but does **not** (a) map each inspected
output path to content/non-content, nor (b) explicitly document the scenario as a
redundant check whose primary coverage is the CLI/unit redaction layer.

**Empirical confirmation this iteration:** I probed the data flow with the exact
TC-INTEGRATION-011 fixture shape against the real `computePlan`. Result: the planted
content sentinel does **not** surface in `entry.renderedBody` (a placeholder body was
observed), so `planJson.not.toContain(sentinel)` passes in a way that is weaker than
"the renderer redacts content secrets" — the sentinel is not reaching the inspected path
to begin with. TC-INTEGRATION-011 is green for the same reason.

**Why this is NOT a blocker:**
- It is a **pre-existing** test-design property of TC-INTEGRATION-011 (the accepted
  reference), **not** a gap GH-29 introduces. iter-1 already classified it non-blocking.
- GH-29 **cannot** strengthen it without either touching `src/` (DEC-3 violation) or
  redesigning the integration-tier reference test (out of scope).
- The four release-blocking invariants remain **enforced** through this scenario at the
  level TC-INTEGRATION-011 already enforces them; the F1 fix made the scenario
  **realizable**, which was the blocking concern.

**Suggested remediation target phase:** delivery (informational — no artifact reopen
required). The recommendation below is for the coder's awareness at Phase 3, not a gate.

**Suggested fix (delivery-time, optional):** When wiring TC-BDD-006 (plan task 3.6), the
coder should (i) confirm the BDD fixture's sentinel actually flows through the renderer
into `entry.renderedBody` (so the "plan JSON has no sentinel" assertion is exercised
against real content, not a placeholder), and (ii) if it does flow, scope the plan-level
assertion to the **non-content** output paths (journal / `version.message` / diagnostics /
non-content ApplyReport fields) and assert the sentinel **is** present in `renderedBody`
(content legitimately travels there) — turning a potentially vacuous green into a
meaningful one. If the fixture behaves like TC-INTEGRATION-011 (sentinel does not reach
`renderedBody`), add a one-line comment in the feature/step file documenting the scenario
as an integration-level redundant check whose primary coverage is the unit redaction layer
(ADR-0011 `CommandResult`). Either path keeps DEC-3 intact.

---

## Recommendation

**Verdict: READY.** Proceed to delivery.

All ten DoR facets PASS. The iter-1 blocker (F1 — INV-SEC-1 injection point) is resolved
and verified against the real, green TC-INTEGRATION-011 reference; F2–F5 are resolved at
the load-bearing level. The two remaining findings are MINOR and non-blocking:

- **N1** is a two-cell wording touch (RSK-4 in test-plan L788 + plan L98) that does not
  affect any AC, NFR, decision, or delivery task. It can be bundled into the next artifact
  touch or the phase-7 doc-sync pass; it does not require reopening a phase before
  delivery.
- **N2** is a persistent, pre-existing, explicitly-non-blocking observation about
  INV-SEC-1 assertion semantics that GH-29 mirrors (not introduces) and cannot fix under
  DEC-3. It is surfaced for delivery-time awareness (plan task 3.6), not as a reopen
  trigger.

**No phase reopen required.** `Pause Required: no` — no `needs_human_input` decisions; no
new decision record needed (DEC-1/3/4 are change-scoped, already captured in pm-notes and
the spec decision log; OQ-P2 is a closed change-scoped resolution, not precedent-setting).

**Reopen instructions (only if the team prefers to clear N1 before delivery):** reopen
`delivery_planning` + `test_planning` for a two-cell RSK-4 wording edit. Optional — not
required to start delivery.

Delivery may begin on Phase 1 (A) of `chg-GH-29-plan.md`.
