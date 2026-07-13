---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-25-readiness-iter-1
status: ready
created: 2026-07-13T04:30:00Z
owners: ["Juliusz Ćwiąkalski"]
workItemRef: GH-25
iteration: 1
verdict: READY
pause_required: false
---

# Readiness Review Iteration 1

Verdict: **READY**
Work Item: GH-25 — [MS2-E4-S1] Mermaid rendering (re-scoped: code policy default)
Date: 2026-07-13
Pause Required: no

## Facet Summary

- spec_completeness: **PASS**
- ac_quality: **PASS**
- plan_coverage: **PASS**
- test_traceability: **PASS**
- cross_artifact_consistency: **PASS** (2 minor findings, both non-blocking and resolved by the plan)
- decision_capture: **PASS**
- system_spec_consistency: **PASS**
- plan_doc_update_coverage: **PASS**
- plan_code_area_coverage: **PASS**
- dod_defined: **PASS**

> Verdict is READY: all facets pass at the coverage / consistency level, no pause
> flag, and the two minor findings are wording imprecisions in the test plan that
> the implementation plan already resolves correctly and transparently. They are
> recorded for the test-plan-writer's optional tidying and do **not** block
> delivery.

## Re-scope legitimacy (probed adversarially)

CEO-DEC-1 is a **real, well-cited decision — not invented**:

- `chg-GH-25-questions.md` OPEN-Q1 carries a filled-in **Answer** block
  ("RESOLVED 2026-07-13 — CEO-DEC-1 (Option 3)") with six-point rationale and
  stated decision authority.
- `chg-GH-25-pm-notes.yaml` records it under `decisions[]` (date 2026-07-13)
  and resolves the intake `blockers[]` entry.
- **Independent corroboration**: `ADR-0002` §"Spike outcome (GH-11, 2026-07-06)"
  already states "MS-0002 descends the fallback ladder to **rung 7 — the `code`
  policy**" and "this **does not block MS-0002**" — *before* this spec was
  authored. The feature spec `feature-mermaid-rendering.md` §1 already reads
  "MS-0002 ships the ADR-0002 fallback `code` policy as the default." So the
  re-scope is grounded in pre-existing ADR/feature-spec state, not fabricated
  for GH-25.

The story file's "Do not start delivery against the current scope" banner is
**resolved** by CEO-DEC-1 (spec §1 / Appendix A). Deferral of full rendering to
MS-0003+ is **explicit** (DEC-2, NG-1/NG-4, §7.3) and **non-blocking** (spec §13
"Blocks: None"; ADR-0002 confirms no MS-0002 blockage). ADR-0001 is correctly
**not revisited** (DEC-3, NG-5); its revisit trigger is resolved, not
re-litigated.

The residual scope is a reasonable reading of the ticket's intent given the
spike outcome: mermaid content is handled deterministically + safely, the
config surface is honest, and `"render"` is preserved as a forward-compatible
placeholder so the MS-0003+ renderer activates without config migration.

## Findings

### 1. [minor] cross_artifact_consistency — test-plan §6/§7 "Fixture files to create" vs plan Phase 3 inline-string resolution

**Artifact / location:** `chg-GH-25-test-plan.md` §6 ("Fixture files to
create") and §7 implementation-mapping table; `chg-GH-25-plan.md` Phase 3
"Infrastructure decision" block + "Test Scenarios / Implementation
reconciliation".

**Gap:** The test plan lists `mermaid-adversarial.md` + `.storage.xhtml` as
fixture files to create and maps TC-MERM-003..006 to a fixture-file model. The
plan supersedes this: the existing `injection-safety.test.ts` suite is
inline-string-only (verified — uses `render(src)` + `countOutsideCdata`), so
the adversarial cases are implemented as **inline-string** tests, not fixture
files. The plan documents and justifies this deviation (avoids needlessly
pulling adversarial input into the Phase-2 golden-fidelity glob + a redundant
count bump). AC↔TC coverage is **unchanged** (TC-MERM-003..006 → AC-F3-1).

**Why non-blocking:** This is a documented, well-reasoned reconciliation by the
plan-writer — exactly what delivery_planning is for. The test plan is the
declared "source of truth for TCs," so it is now mildly stale relative to the
plan's resolution, but no AC coverage is lost and no contradiction survives
(the plan's reconciliation note is explicit).

**Suggested remediation target phase:** test_planning (optional) — update test
plan §6/§7 to state TC-MERM-003..006 are inline-string cases extending
`injection-safety.test.ts`, OR accept the plan's documented reconciliation as
binding. Either is fine; not a gate blocker.

**Suggested fix:** Replace the `mermaid-adversarial.{md,storage.xhtml}` entries
in §6 with an inline-string note; align §7's TC-MERM-003..006 rows to
`injection-safety.test.ts (inline, reuses render/count/countOutsideCdata)`.

### 2. [minor] test_traceability — TC-MERM-003 step wording imprecise (inside-CDATA vs outside-CDATA; wrong escape expectation)

**Artifact / location:** `chg-GH-25-test-plan.md` §5.2 TC-MERM-003, Steps 3–5.

**Gap:** TC-MERM-003 Step 3 says "Count occurrences of `<script` in the output
body" and asserts 0, and Step 5 expects `&lt;script&gt;` in the output. Both
are incorrect for CDATA-wrapped content: the `<script>` payload sits **literally
inside** `<![CDATA[…]]>` (CDATA content is raw, not XML-escaped), so a naive
`count(body,"<script")` would be 1, not 0, and the body contains literal
`<script>` — not `&lt;script&gt;`. The test plan's own Notes/Clarifications
correctly flag "use `countOutsideCdata`," and TC-MERM-004/005/006 already use
the explicit "OUTSIDE CDATA" qualifier in their steps. The plan (Phase 3.1)
implements the correct assertion: `countOutsideCdata(body,"<script") === 0`.

**Why non-blocking:** The AC (AC-F3-1) is correctly specified; the helper
(`countOutsideCdata`) is the right tool and is named in the test plan's Notes;
and the plan implements the case correctly. A literal verbatim implementation
of TC-MERM-003's Steps 3–5 would fail, but the plan-writer caught and fixed the
mechanism. This is a TC-wording imprecision, not an AC or coverage defect.

**Suggested remediation target phase:** test_planning (optional) — bring
TC-MERM-003's step wording in line with TC-MERM-004/005/006: qualify counts as
"OUTSIDE CDATA" and drop the `&lt;script&gt;` expectation (CDATA content is
literal).

**Suggested fix:** Reword Step 3 → "Count occurrences of `<script` in the
output body **OUTSIDE CDATA** via `countOutsideCdata`"; drop Step 5's
`&lt;script&gt;` expectation (replace with "the payload appears as inert
literal text inside the CDATA code body").

---

## Probes performed (evidence, all PASS)

- **AC completeness + testability (8 ACs, §17):** all Given/When/Then,
  measurable; each traced to ≥1 TC in test-plan §3.1 (all "Covered"). No AC
  weakly or un-covered.
- **Cross-artifact policy-model consistency:** spec (DM-1/DM-2/DM-3, §5.1),
  test plan (TC-CONF-001..003), and plan (Phase 1.1–1.4) all agree on
  `"code" | "render" | "skip"`, default `"code"`, all three produce the code
  macro in MS-0002 (NG-6). No contradiction.
- **Scope creep / miss:** no work outside the spec; no spec'd work un-planned.
  NG-6 (no policy-driven branching) honored — the field stays unconsumed
  (verified: no `switch`/consumer of `mermaid.policy` exists in `src/`).
- **Security (NFR-SEC-5):** "safe by construction" claim is sound — source is
  CDATA-wrapped via `cdata()` which splits `]]>`
  (`storage.ts:269`, `replaceAll("]]>", "]]]]><![CDATA[>")`); the `language`
  param is XML-escaped via `escapeText` (`storage.ts:193`); CDATA content is
  literal/inert. Adversarial fixtures (script/onerror/javascript:/]]>) are
  meaningful defense-in-depth, not the primary control.
- **Infra feasibility (verified against current tree):**
  - `MermaidPolicy` `types.ts:31` ✓; `applyDefaults` default `config.ts:147` ✓;
    `STARTER_CONFIG` `config-template.ts:75` ✓; schema enum `schema.json:94-98`
    ✓ — all line refs accurate.
  - golden count `toBe(25)` at `storage-renderer.test.ts:46` ✓ (25→26 bump is
    correct; new pair auto-globbed by `loadFixtures`).
  - `injection-safety.test.ts` is inline-string-only with `render`/`count`/
    `countOutsideCdata` ✓ (justifies plan's inline resolution).
  - `codeMacro` `storage.ts:185` + `cdata` `storage.ts:269` unchanged ✓.
  - "Deliberately NOT changed" lock-step list (Phase 1) verified: authored
    `render` sites at `marksync.yml.example:62` and
    `config-example-roundtrip.test.ts:76` stay and prove AC-F1-2 acceptance.
- **Decision routing:** CEO-DEC-1 (change-scoped re-scope) correctly in change
  docs; ADR-0001/ADR-0002 open-question amendments correctly routed to
  lifecycle phase 7 (`@doc-syncer`, spec NG-7) — not performed by this plan.
- **DoD:** §17 ACs + AC-CHECK (`bun run check` green) constitute a clear,
  testable Definition of Done; consistent with the story file's "AC list is the
  DoD" convention.
- **system_spec_consistency:** aligns (indeed **fixes**) the config↔ADR-0002
  vocabulary drift; consistent with the existing feature spec and ADR-0002
  §Spike outcome.

## Verdict rationale

This is a small, low-risk story whose behavioral path **already exists** (the
code-macro emission is the de-facto pipeline behavior); the change makes it
explicit, correctly-defaulted, and proven. The re-scope is decision-backed and
corroborated by pre-existing ADR/feature-spec state. All three artifacts agree
on the policy model; every AC is covered by check-listable plan tasks tracing to
TCs. The two minor findings are test-plan wording imprecisions that the plan
already resolves transparently — they cause no delivery rework and no coverage
loss. Proportionate to the risk, the bar is met.

**Handoff:** PM may proceed to `delivery` (phase 6) and delegate to `@coder`
with `/run-plan GH-25`. The minor findings need not delay the handoff; the
test-plan-writer may tidy them in parallel or leave them to the plan's
documented resolution.
