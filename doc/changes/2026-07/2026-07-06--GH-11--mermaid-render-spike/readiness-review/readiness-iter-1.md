---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: readiness-GH-11-iter-1
change_ref: GH-11
iteration: 1
verdict: READY
date: 2026-07-06
reviewer: readiness-reviewer
pause_required: false
confidence: medium-high
---

# Readiness Review Iteration 1

Verdict: **READY**
Work Item: GH-11 — [MS2-E1-S1] Mermaid headless-render spike
Date: 2026-07-06
Pause Required: no
Confidence: medium-high

## Facet Summary

| Facet | Result | Notes |
|-------|--------|-------|
| spec_completeness | PASS | All 7 story ACs + 5 hypotheses (H1–H5) covered; story deliverables routed correctly (ADR update deferred to phase 7 per lifecycle, not a gap). |
| ac_quality | PASS | AC1–AC7 in Given/When/Then, each tied to ≥1 F-/NFR-ID and one H; non-overlapping; evidence-pointer requirement explicit. |
| plan_coverage | PASS | 10 phases (0–9), each one commit; every AC mapped to ≥1 phase + probe (Phase→AC→Probe table); checklistable tasks. |
| test_traceability | PASS (minor) | Full AC→probe→fixture→evidence matrix; all 7 ACs traced. Security scan set narrower than full ADR-0002 Security Requirements (Finding 2). |
| cross_artifact_consistency | PASS | Ticket → story → spec → test-plan → plan align on same-OS gate, DEC-3, fixtures, normalization rules. OQ-1/2/3 resolved in plan. |
| decision_capture | PASS | DEC-1…DEC-4 in spec (change-scoped, referencing upstream story/ADRs); R1/Q1 CEO-resolved; no deferred human-input decisions. |
| system_spec_consistency | PASS (major note) | Feature spec + TDR-0004 + ADR-0001 consistent. ONE documented, story-authoritative narrowing vs ADR-0002 literal wording (Finding 1); pre-existing frontmatter/body status mismatches in ADR-0002 + TDR-0004 (Finding 4). |
| plan_doc_update_coverage | PASS (major note) | Doc-update table lists 6 system docs (ADR-0002, TDR-0004, ADR-0001, feature spec, story status, downstream E4-S1, conditional fallback DR). "Part B wording" entry too vague for the load-bearing stop-criterion-#1 rewording (Finding 1). |
| plan_code_area_coverage | PASS (minor) | Per-phase file inventory all under `spikes/mermaid-render/`; `src/` explicitly excluded; `bun pm ls` transitive flag not pinned (Finding 3). |
| dod_defined | PASS | Spec §17.1 spike DoD: evidence pointers, golden-pair-on-PASS, normalization-recorded, no-`src/`-touched gate; plan DoD mirrors with per-AC evidence. |
| spike_specific_adequacy | PASS (minor) | Real `mermaid.render()` + real happy-dom (no over-mocking, HARD guardrail); adversarial fixtures are the story-minimum; Chromium-absence probe degrades gracefully rather than trivially passing; honest-failure recording explicit. |

## Findings

### 1. [major] system_spec_consistency / plan_doc_update_coverage — ADR-0002 Part B stop criterion #1 + C-1 vs spike's same-OS gate

**Artifact/location**: `chg-GH-11-spec.md` §12 (DEC-3), §4.2 (NG-4); `chg-GH-11-plan.md` "Doc-update coverage" table (ADR-0002 row, "Part B wording"); vs `doc/decisions/ADR-0002-...md` Part B stop criterion #1 (line 217: "Byte-stable SVG output for unchanged input across Linux, macOS, and Windows") and C-1 (lines 85–90: "same image bytes… cross-platform").

**Gap**: ADR-0002 Part B's literal stop criterion #1 and constraint C-1 require **cross-OS byte-stable SVG**. The spike (correctly, per the authoritative story line 30/64 and CEO-resolved Q1) gates on **same-OS** byte stability and accepts a cross-OS delta via a **per-OS cache key in the hash input** (DEC-3). This per-OS-key makes the *attachment hash* deterministic across OS but does **not** make the *rendered SVG bytes* cross-OS byte-stable. Therefore a same-OS-only spike PASS does **not** literally satisfy ADR-0002 stop criterion #1 / C-1 as written. The drift is **documented and story-authoritative** (not silent), so the facet passes — but the phase-7 handoff must explicitly **reword** stop criterion #1 and clarify C-1 (hash-stable, not byte-stable), not merely flip the `status` field. The plan's Doc-update table reduces this load-bearing rewording to "Part B wording," which is too vague for a spike on which ADR-0001's language choice hinges.

**Suggested remediation target phase**: delivery_planning
**Suggested fix**: In the plan's "Doc-update coverage" table, expand the ADR-0002 row to explicitly enumerate: "(a) reword Part B stop criterion #1 from 'cross-OS byte-stable' to 'same-OS byte-stable; cross-OS hash-stable via per-OS cache key (DEC-3)'; (b) clarify C-1's 'cross-platform same bytes' is satisfied via the hash formula (logical render input), not raw byte equality; (c) record the actual cross-OS result from the findings doc." This is a table-cell enrichment; it does not block spike execution (phases 0–9) and can be applied before phase 7.

### 2. [minor] test_plan_traceability / spike_specific_adequacy — Security scan set narrower than ADR-0002 Security Requirements

**Artifact/location**: `chg-GH-11-spec.md` §17 AC5 / NFR-SEC-1; `chg-GH-11-test-plan.md` TC-MRSPIKE-003; `chg-GH-11-plan.md` Phase 5; vs `doc/decisions/ADR-0002-...md` "Security Requirements" (lines 108–114).

**Gap**: AC5's scan set is `<script>`, `onerror`/`onload`, `javascript:` URIs. ADR-0002 Security Requirements additionally require "no external resource loading" (`<use href=…>` to external origins, remote fonts/images). The two adversarial fixtures (XSS `<img onerror>`, `<script>` injection) will very likely be **trivially neutralized** by `securityLevel:"strict"` (Mermaid encodes HTML by default), so an H5 PASS risks being over-interpreted as "ADR-0002 Security Requirements hold" when only the default-config XSS/script subset was exercised. The spec is correctly scoped to "safe Mermaid defaults" (H5), but the findings-doc author must not over-claim — full SVG sanitization / external-resource blocking is MS2-E4-S1 (the `SVGSanitizer` component in the feature spec).

**Suggested remediation target phase**: delivery_planning (findings-doc template wording) — or test_planning if the author wants to add a third adversarial fixture (external-resource reference) to harden H5.
**Suggested fix**: In Phase 8.3's findings-doc template, add an explicit scope note under H5: "H5 validates Mermaid **default-config** safety against XSS/script injection only; full SVG sanitization (external resources, `<use href>`, remote fonts) is deferred to MS2-E4-S1 (`SVGSanitizer`)." Optionally add a third adversarial fixture probing `<use href="http://…">` to make H5 less trivial.

### 3. [minor] plan_code_area_coverage / spike_specific_adequacy — Chromium-absence transitive dependency flag not pinned

**Artifact/location**: `chg-GH-11-plan.md` Phase 4.1 (NFR-DEP-1); `chg-GH-11-test-plan.md` TC-MRSPIKE-002 step 1.

**Gap**: The probe asserts "the **resolved dependency tree** contains zero occurrences of `puppeteer`/`playwright`/`chromium`," but `bun pm ls` may list only **direct** dependencies by default. A transitive (deep/recursive) listing is required for the probe to be meaningful (a hidden Chromium dep would almost certainly be transitive via mermaid's sub-deps, not direct). The exact Bun flag/command for the transitive tree is not pinned, risking a trivially-passing probe that inspects only direct deps.

**Suggested remediation target phase**: delivery_planning
**Suggested fix**: Pin the transitive listing command in Phase 4.1 (e.g., `bun pm ls --all` or whatever the current Bun equivalent is for the full resolved tree) and have the probe fail loudly if it cannot obtain a transitive listing (rather than silently falling back to direct-only).

### 4. [minor] system_spec_consistency — Pre-existing frontmatter/body status mismatch in ADR-0002 + TDR-0004

**Artifact/location**: `doc/decisions/ADR-0002-...md` (frontmatter `status: Accepted` line 6 vs body "remains `Proposed`" lines 202, 349); `doc/decisions/TDR-0004-...md` (frontmatter `status: Accepted` line 6 vs body "remains `Proposed`" lines 254, 367).

**Gap**: Both decisions carry a pre-existing internal inconsistency: frontmatter says `Accepted`, body says `Proposed`. This is **not introduced by GH-11**, but the spike's phase-7 reconciliation touches both, and the spec/plan assume a "Proposed → spike-validated" transition that is only coherent if the current status is actually `Proposed`. If phase-7 reads the frontmatter (`Accepted`), the "spike-validated" label's meaning is ambiguous.

**Suggested remediation target phase**: delivery_planning (note for phase-7 handoff)
**Suggested fix**: Add a one-line note to the plan's Doc-update coverage requiring @doc-syncer to first reconcile the ADR-0002/TDR-0004 frontmatter-vs-body status mismatch before applying the spike-validated transition. (Pre-existing tech debt; not GH-11's job to fix in the spike workspace, but the handoff should not inherit the ambiguity.)

## Surfaced decisions needing human input

**None.** R1 (non-deterministic IDs → normalization) and Q1 (cross-OS delta → per-OS cache key) are CEO-resolved and recorded in the story frontmatter and spec DEC-2/DEC-3. All genuinely-open factual questions (H1–H5) are resolved by spike execution itself. No `needs_human_input` decision is deferred. The catastrophic-failure escalation (RSK-3) routes to the CEO at execution time, not at the gate.

## Override / triviality

Not applicable. This is a **load-bearing spike** (explicitly not trivial); the hard gate applies in full and is met on the facet reading above.

## Notes

- The `change.type: spike` / conventional-commits wrinkle is acknowledged and handled by the plan (`chore(spike):` / `docs(spike):`); per the PM it is **not** a DoR blocker and is not counted as a finding here.
- The spike's *execution path* (phases 0–9) is fully sound: real `mermaid.render()` + real happy-dom (HARD anti-over-mocking guardrail, C-SPIKE-3), honest-failure recording explicit (Phase 3 "H1 FAIL is recorded honestly"), Chromium-absence probe degrades gracefully on OS-specific tooling (Phase 4.1), escalation path on catastrophic failure documented (RSK-3, Flow 2, findings "Forced ADR updates"). No finding above blocks spike execution; Finding 1 is a phase-7 handoff specificity issue.
- The one MAJOR finding (Finding 1) lives *within* a passing facet (the drift is documented and story-authoritative, hence not "silent"), so the verdict is READY. It is recorded prominently so phase-7 (@doc-syncer) does not over-claim a same-OS-only PASS as cross-OS-byte-stable validation.
