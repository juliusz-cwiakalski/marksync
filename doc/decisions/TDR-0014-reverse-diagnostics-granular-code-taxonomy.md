---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0014
decision_type: tdr
status: Accepted
created: 2026-08-15
decision_date: null
last_updated: 2026-08-15
summary: "Freeze the GH-93 granular reverse-diagnostics code taxonomy as the pre-E2/E3 contract: add reverse/unknown-macro, reverse/complex-layout, reverse/unsupported-attribute, reverse/unknown-element; retain reverse/unsupported-construct as the structural fallback; re-assign the two coarse-code classes (unknown macros, unknown elements) in the last consumerless window. Registry stays additions-only forever; the assignment map (spec Appendix A) becomes normative and unit-pinned; consumers bind to code strings — never construct text or class labels."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: reverse-diagnostics
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Freezes the diagnostic-code contract that MS-0003 E2 (resolve) and E3 (import) route user resolution on (PDR-0002 C-4) — the last change before consumers bind, i.e. the last cheap moment to correct the taxonomy."
customer_impact: "Indirect until E2/E3: per-class codes are what let adoption UX say 'remove this macro' vs 'flatten this layout' vs 'simplify this table' instead of a generic unsupported-construct wall."
classification:
  domains: [architecture, product]
  archetype: design
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: medium
  uncertainty: low
  blast_radius: local
  recurrence: one-off
governance:
  driver: decision-advisor (AI)
  decider: Juliusz Ćwiąkalski
  contributors: [GH-93 spec-writer (DEC-1, Appendix A), GH-92 baseline (two-class taxonomy, additions-only registry)]
  reviewers: [Juliusz Ćwiąkalski, GH-93 readiness-reviewer (DoR gate)]
  performers: [GH-93 coder]
  informed: [pm]
ai_assistance:
  used: true
  roles: [analyst, critic, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "E2/E3 UX proves a class boundary wrong (a class too coarse or too fine for distinct resolution paths) — refine additively only: new codes for newly characterized classes; re-assignment of existing-class emission stays forbidden by this record's freeze."
  - "E3 partner corpora make the structural fallback the modal code (a heavy unclassifiable population) — introduce a dedicated class code via the additions-only path and extend the corpus/inventory (never re-assign)."
  - "The user-facing error catalog (deferred with E2/E3) needs per-code display strings or remediation text — publish a mapping layer over the codes; never rename or remove registry entries."
links:
  related_changes: [GH-93]
  supersedes: []
  superseded_by: []
  spec: [doc/changes/2026-08/2026-08-15--GH-93--unsupported-construct-detection/chg-GH-93-spec.md, doc/spec/features/feature-reverse-conversion.md]
  contracts: []
  diagrams: []
  decisions: [PDR-0002, ADR-0005, TDR-0012, TDR-0013]
  experiments: []
  metrics: []
  roadmap_items: [MS-0003]
---

# TDR-0014: GH-93 reverse-diagnostics code taxonomy — granular per-class codes with structural fallback, frozen pre-E2/E3

## Context

This record resolves **OQ-1** of the GH-93 change specification (chg-GH-93-spec.md §14) ahead of the DoR freeze, independently confirming (with two clarifying pins) the provisionally decided **DEC-1** and its normative code-assignment map (spec Appendix A). Numbering note: TDR-0011 remains reserved for the in-flight GH-90 historical-version spike verdict (TDR-0012 precedent); this record is TDR-0014.

Situational facts:

- FACT: The GH-92 baseline (merged, v0.9.0) ships `REVERSE_CODES` (`src/domain/markdown/reverse-diagnostics.ts`) with exactly three codes — `reverse/unsupported-construct` (blocking), `marksync/synthetic-artifact` (informational), `reverse/parse-error` (error arm) — under a two-class severity taxonomy, and declares the registry **additions-only, stable across releases** (feature-reverse-conversion.md §4.2; GH-92 §22).
- FACT: One coarse blocking code today covers unknown macros, unknown elements, and structural violations alike; the `construct` field that distinguishes them is display-oriented free-form text, **not a declared stable contract** (GH-93 spec gap (e)).
- FACT: GH-93 closes detection gaps (silent attribute drops, task-list child drops, coarse layout detection) and must give the ticket's four detection classes — foreign/unknown macros, complex layouts, exotic table attributes, unknown elements — distinct, machine-consumable codes (spec F-1/F-2, G-2).
- FACT (verified in-tree 2026-08-15): the code surface is **consumerless** — `REVERSE_CODES` is referenced only by the library's own producer modules (`reverse.ts`, `reverse-parser.ts`) and by test sidecars/units; no CLI or runtime code renders or routes on reverse codes; `reverseStorage` is imported nowhere outside its own module. The `UNSUPPORTED_CONSTRUCT` identifiers in `src/cli/output/exit-codes.ts` / `src/app/cli-error-map.ts` are the *forward* `MarkSyncError` kind — a name collision with a different contract, functionally unrelated (no `reverse/` prefix, no shared type).
- FACT: MS-0003 E2 (`resolve` patch flow) and E3 (`marksync import`) are the binding consumers (roadmap E1-before-E2/E3 dependency; ownership model requires "stable diagnostic codes + locations" with explicit resolution on `import`/`resolve`; success metric: known classes emitting stable codes — 100%). Once they bind, emitted-code re-assignment is forbidden by the registry contract; GH-93 is the last consumerless change (spec F-5, RSK-2).
- FACT: The GH-93 spec analyzed three taxonomy alternatives in Appendix A (coarse + discriminator; per-construct-identity; granular per-class) and provisionally chose granular per-class (DEC-1), routed here for independent confirmation precisely because the freeze is precedent-setting.

## Problem Framing (Clarified)

The surface question is "which codes?". The load-bearing question is: **what is the frozen, machine-consumable routing key that E2/E3 bind to, and what class partition does it encode — decided in the only window where getting it wrong is cheap?**

Three properties make this decision unusual:

1. **Permanence asymmetry.** The registry is additions-only forever: code strings can never be removed or renamed, and after consumers bind, the *emitted assignment* (which class emits which code) is frozen too. Omitting a needed granularity later is cheap (add a code for a newly characterized class); mis-partitioning an existing class later is impossible without breaking the stability promise. The rational move is to partition by the only durable criterion available — **resolution path** — now, while re-assignment is still free.
2. **The discriminator must be the code, not the text.** E2/E3 need to route "remove this macro" vs "flatten this layout" vs "simplify this table" vs "remove this element" mechanically. The `construct` string is display-oriented and unbounded; routing on it would be routing on an undeclared, unstable surface. Class discrimination therefore must live in enumerated `code` values.
3. **The window is closing for a structural reason, not a schedule reason.** E2/E3 are the next changes after GH-93 on the MS-0003 critical path. Deferring the taxonomy decision to E2/E3 spec time is deferring it to *after* the bind — i.e., surrendering the correction window and shipping consumers against a taxonomy already known too coarse.

A secondary question the freeze must answer: what remains the home for the unclassifiable? A structural fallback (retained `reverse/unsupported-construct`) is the pressure-release valve that keeps future additions optional rather than forced.

## Constraints (Hard Requirements)

### C-1: Registry stays additions-only — no code removed or renamed

- **Statement:** The taxonomy change adds codes to `REVERSE_CODES`; zero existing entries are deleted or renamed. Emitted-assignment changes are permitted only on a verified-consumerless surface.
- **Source:** GH-92 §22 (registry contract); chg-GH-93-spec NFR-4, F-5.
- **Verification:** Registry unit snapshot (code-value enumeration pinned); code review.
- **Negotiable:** no.

### C-2: Each ticket detection class emits a distinct stable code

- **Statement:** Foreign/unknown macros, complex layouts, exotic (non-canonical) attributes on canonical elements, and unknown elements each produce a diagnostic whose code is distinct and stable.
- **Source:** issue GH-93 (four detection classes, as captured in chg-GH-93-spec F-1); PDR-0002 C-4 ("100% of known classes emit stable diagnostic codes").
- **Verification:** Assignment-map unit pin (Appendix A normative); aligned adversarial corpus sidecars.
- **Negotiable:** no.

### C-3: Codes are machine-consumable without parsing display text

- **Statement:** A consumer can route on the diagnostic's class using only enumerated `code` values — never by string-matching `construct` or other free-form text.
- **Source:** chg-GH-93-spec G-2, gap (e); E2/E3 routing need (roadmap ownership model).
- **Verification:** Unit-pinned assignment map; E2/E3 specs cite codes verbatim.
- **Negotiable:** no.

### C-4: Severity classes remain exactly two (blocking / informational)

- **Statement:** Granularity lives in the code, not in new severity levels; the informational and parse-error arms keep their GH-92 semantics unchanged.
- **Source:** GH-92 DEC-1; chg-GH-93-spec F-1 ("severity classes remain exactly the two from GH-92 DEC-1").
- **Verification:** Diagnostics-model type review; existing sidecars for unchanged arms.
- **Negotiable:** no.

### C-5: Zero CLI delta; `ReverseError` stays a standalone union

- **Statement:** The taxonomy decision introduces no command, flag, output envelope, or exit-code change; the reverse error channel does not become a `MarkSyncError` kind.
- **Source:** chg-GH-93-spec NG-1, AC-F7-2.
- **Verification:** AC-F7-2 surface inspection; all pre-existing tiers green.
- **Negotiable:** no.

### C-6: Bounded registry — growth by class, never by construct identity

- **Statement:** The code vocabulary grows only when a genuinely new construct *class* (new resolution path) is characterized — never per macro name, element name, or instance. Codes are permanent; unbounded growth is an unaffordable contract.
- **Source:** GH-92 §22 maintenance posture; GH-93 Appendix A Alt-2 rejection; decision-instructions "maintainability" priority.
- **Verification:** Code review of any future registry addition against this rule; registry snapshot test makes accidental growth review-visible.
- **Negotiable:** no.

### C-7: Preservation guardrails survive — K1 carve-out, canonical false-positive guard, corpus-A byte-equality

- **Statement:** The re-assignment and new detection classes do not alter K1 silent-drop semantics, produce zero new diagnostics over canonical corpora, or change round-trip byte-equality.
- **Source:** chg-GH-93-spec F-7, NFR-3, AC-F2-2, AC-F7-1; ADR-0005 (K1, "do not silently degrade").
- **Verification:** Golden-tier zero-diagnostic sweeps; corpus-A round-trip harness.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**

- Give E2/E3 a frozen routing key for C-4's class-dependent resolution paths (remove macro / flatten layout / simplify table / remove element) — the metric behind MS-0003's "unsupported-construct diagnostics: 100%" target.
- Correct the taxonomy at the last consumerless moment — re-assignment cost is zero today and contractually forbidden after E2/E3 merge.

**Technical drivers (ranked):**

1. **Class discrimination in a stable enumerated surface** — the code is the only declared-stable discriminator (C-3).
2. **Long-horizon stability** — codes are permanent strings cited in consumer specs, error catalogs, and sidecars; naming must be right at freeze (no rename path exists).
3. **Bounded vocabulary** — five blocking codes + two unchanged arms is a learnable, cataloguable set; cognitive load scales with class count, and classes should track resolution paths 1:1.
4. **Fallback resilience** — an explicit structural-fallback home keeps future discoveries absorbable (new code or fallback) without forcing re-partition.
5. **Contained churn now** — sidecar/unit re-pins are cheap in-change on a consumerless surface (driver for doing it in GH-93, not later).

**Operational drivers:**

- Solo-maintainer auditability: the normative assignment map is unit-pinned, so drift fails CI instead of relying on review memory.
- Test-economy: granularity rides existing diagnostic arms (no new severities, no new payload machinery beyond what GH-93 already adds).

## Decision Rights (DACI)

- **Driver:** decision-advisor (AI) — coordinates this record.
- **Decider / Approver:** Juliusz Ćwiąkalski — confirms at GH-93 PR review; record flips to Accepted at merge per repo convention (TDR-0012/0013 precedent, follow-up #109).
- **Contributors:** GH-93 spec-writer (DEC-1, Appendix A alternatives analysis); GH-92 baseline (two-class taxonomy, additions-only registry contract).
- **Required reviewers:** Juliusz Ćwiąkalski (PR); GH-93 readiness-reviewer (OQ-1 resolution is a DoR gate item per spec RSK-3).
- **Performers:** GH-93 coder (implements the taxonomy + assignment-map pins).
- **Informed:** pm (links record from spec/plan).

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| `REVERSE_CODES` has exactly 3 codes; one coarse blocking code covers macros, elements, and structural violations | FACT | `src/domain/markdown/reverse-diagnostics.ts` (read 2026-08-15) | Premise of the whole decision | High |
| No in-tree consumer renders/routes on reverse codes; `reverseStorage` imported only by its own module — the surface is consumerless | FACT | repo grep over `src/**` + `tests/**` (2026-08-15): producers (`reverse.ts`, `reverse-parser.ts`) + test sidecars/units only; CLI untouched | Re-assignment would break a consumer → C-1's re-assignment clause void; decision would need re-scoping | High |
| Forward `MarkSyncError` kind `UNSUPPORTED_CONSTRUCT` (exit-codes, cli-error-map) is a different contract — name collision only | FACT | `src/cli/output/exit-codes.ts`, `src/app/cli-error-map.ts` (read 2026-08-15) | None functional; conflation risk in future reviews | High |
| Registry is additions-only, stable-across-releases (GH-92 contract) | FACT | feature-reverse-conversion.md §4.2; GH-92 spec §22 | Freeze semantics differ; C-1 void | High |
| `construct` strings are display-oriented and not a declared stable contract | FACT | GH-93 spec gap (e); GH-92 spec (construct format unspecified as stable) | Alt 1 becomes viable — still dominated | High |
| Ticket GH-93 names four detection classes (foreign/unknown macros, complex layouts, exotic table attributes, unknown elements) | FACT (as captured at spec intake from issue #93; story file TBD — spec §12 re-opens on deltas) | chg-GH-93-spec §1, F-1, Appendix A | Partition must be re-derived; C-2 source changes | High |
| PDR-0002 C-4 + roadmap ownership model require per-class stable codes + locations for `import`/`resolve`, with explicit resolution paths | FACT | PDR-0002 C-4; doc/overview/02-roadmap.md (ownership model, MS-0003 metrics) | Granularity under-justified; Alt 0 gains ground | High |
| E2/E3 resolution paths genuinely differ per class (macro→remove/adopt-verbatim; layout→flatten; attribute→simplify element; element→remove) | ASSUMPTION | roadmap ownership-model wording ("edit the page to remove, or adopt-verbatim escape hatch"); PDR-0002 C-4 "explicit resolution path" | If paths don't differ, granularity is harmless but under-used (bounded cost); no re-partition needed | Medium-High |
| E2/E3 are the next consumers and will bind to these codes in their specs (no earlier external consumer of the library) | ASSUMPTION | roadmap dependency chain (E1 → E2/E3); library not exposed via CLI (C-5/NG-1) | An unseen consumer would make re-assignment a break — mitigated by FACT (consumerless, verified in-tree) | High |
| Long-run granularity fit: five blocking codes remain right-grained for E2/E3 UX | TO-CONFIRM (only observable post-bind) | — | RSK-3 residual; additions-only + fallback absorb it (revisit triggers armed) | — |

No external evidence required (archetype: design — local contract; no dependency, no market data). Data minimization: nothing left the repo.

## Mental Models & Techniques Used

- **First Principles:** strip the taxonomy debate to the durable surface — what survives releases is the `code` string and the severity. Everything else (`construct` text, the TypeScript `class` union) is presentation or sugar. The decision is which partition the permanent strings encode.
- **Inversion:** how does this contract silently rot? (a) Consumers key on `construct` text — unstable, unbounded; (b) consumers key on the TS `class` labels — structural sugar, not a published promise; (c) the freeze is deferred past the E2/E3 bind — correction becomes contractually impossible. Each failure mode maps to a constraint or pin below.
- **Second-Order Thinking:** the registry's permanence makes omission cheap but mis-partition permanent — an asymmetry that argues for maximal-conviction partitioning *now* (while free) and for a fallback that keeps the partition revisable-by-addition later. Also: re-assigning only *some* classes off the coarse code (e.g. macros yes, elements no) would leave `reverse/unsupported-construct` meaning two things at once — incoherent fallback semantics.
- **Opportunity Cost:** per-identity codes (Alt 2) buy nothing consumers can use (resolution paths don't differ per macro name) and spend the one non-renewable resource — permanent registry entries. Coarse-plus-discriminator (Alt 1) saves four enum entries and spends the stability contract.
- **KISS:** five blocking codes, one fallback, two severities; one routing key for consumers; one normative map, unit-pinned.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via accepted-risk exception. All constraints here are `Negotiable: no` — no exception path exists.

|          | C-1 (additions-only) | C-2 (4 classes distinct) | C-3 (code-routable) | C-4 (2 severities) | C-5 (0 CLI delta) | C-6 (bounded) | C-7 (guardrails) |
|----------|----------------------|--------------------------|----------------------|---------------------|-------------------|----------------|-------------------|
| Alt 0 — keep single coarse code | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Alt 1 — coarse code + stable `construct` discriminator | ✅ | ❌ | ❌ (discriminator is free-form text; declaring it stable creates an unbounded contract) | ✅ | ✅ | ❌ (unbounded vocabulary) | ✅ |
| Alt 2 — per-construct-identity codes | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (growth by identity, not class) | ✅ |
| Alt 3 — granular per-class codes + structural fallback (CHOSEN) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Alternative 0 — Do nothing / keep the single coarse code

- **Eligibility:** Not eligible (fails C-2, C-3).
- **Summary:** Ship GH-93 detection completeness under the existing `reverse/unsupported-construct` for every blocking class; consumers discriminate via `construct`.
- **Constraint compliance:** C-2 ❌ — the ticket's four classes share one code; C-3 ❌ — routing requires text-matching.
- **Driver fit:** Zero churn (real) but fails the top two drivers; leaves E2/E3 to bind to a known-coarse key.
- **Why rejected:** Fails two non-negotiable gates that exist precisely because of the consumer-binding timeline. Baseline documented for completeness.

### Alternative 1 — Coarse code + declared-stable construct discriminator

- **Eligibility:** Not eligible (fails C-3, C-6).
- **Summary:** Keep one blocking code; promote the `construct` field to a declared stable discriminator vocabulary.
- **Constraint compliance:** C-3 ❌ — a stable *free-form text* vocabulary is a contradiction: unbounded,format-prone (`td containing nested table`, `ac:structured-macro[ac:name='code'] (missing body)`), and forever frozen at whatever phrasing ships now. C-6 ❌ — vocabulary grows with every construct variant, not with resolution paths.
- **Why rejected:** Dominated by Alt 3 on stability, boundedness, and consumer ergonomics; it is Alt 3 with the enumeration replaced by prose. (Matches the spec Appendix A Alt-1 analysis — independently endorsed.)

### Alternative 2 — Per-construct-identity codes

- **Eligibility:** Not eligible (fails C-6).
- **Summary:** `reverse/macro-jira`, `reverse/macro-toc`, … one code per construct identity.
- **Constraint compliance:** C-6 ❌ — permanent registry growth proportional to the Confluence macro/element population, not to resolution classes.
- **Why rejected:** Resolution paths do not differ per macro name — the granularity has no consumer, only cost. (Matches spec Alt-2 analysis.)

### Alternative 3 — Granular per-class codes + retained structural fallback (CHOSEN)

- **Eligibility:** Eligible (passes all seven).
- **Summary:** Add `reverse/unknown-macro`, `reverse/complex-layout`, `reverse/unsupported-attribute`, `reverse/unknown-element`; retain `reverse/unsupported-construct` as the structural fallback (canonical elements in non-canonical positions/compositions: nested tables, misplaced canonical task-list children, unclassifiable constructs); re-assign the two existing classes (unknown macros, unknown elements) off the coarse code now; registry additions-only forever; the assignment map (spec Appendix A) becomes normative and unit-pinned; emitted-code re-assignment is forbidden once E2/E3 bind.
- **Constraint compliance:** C-1 ✅ (4 adds, 0 removals/renames; re-assignment is emitted-assignment only, on a verified-consumerless surface); C-2 ✅ (four classes ↔ four codes, 1:1); C-3 ✅ (enumerated routing key); C-4 ✅ (all four blocking; severity unchanged); C-5 ✅ (library-internal); C-6 ✅ (five-code blocking vocabulary; growth-by-class rule recorded); C-7 ✅ (detection semantics only; guardrails re-asserted by GH-93 ACs).
- **Driver fit:** Best on every ranked driver — class discrimination (1), naming finality exercised at the right moment (2), bounded learnable vocabulary (3), explicit fallback home (4), churn contained in-change (5).
- **Naming audit (independent):** the mixed prefixes are semantically motivated, not sloppy — `unknown-*` marks *identity* unknowns (macro, element not in the canonical vocabulary); `unsupported-*` marks *known-but-unrepresentable* things (attribute beyond the mirror allowlist; structural composition); `complex-layout` matches the ticket's own vocabulary ("complex layouts"). All blocking codes keep the `reverse/` namespace; the informational `marksync/synthetic-artifact` correctly stays in the marksync-origin namespace (GH-02 design). Renaming anything would spend the freeze window on churn with no consumer value.
- **Why chosen:** The only constraint-eligible alternative, and the one whose partition criterion (resolution path) is the only durable partition criterion available. Confirmed.

### Refinements considered within Alt 3 (all rejected as boundary changes; two clarifying pins adopted)

- **Uniform `unknown-` naming (e.g. `unknown-attribute`)** — rejected: an exotic attribute is not identity-unknown; it is known and non-canonical *on that element* (mirror principle). The `unsupported-` family is the accurate semantic.
- **Splitting the structural fallback (e.g. a `misplaced-element` code)** — rejected: same resolution path ("fix the structure"); over-partitioning spends permanent codes on a distinction consumers cannot use.
- **Separate `unknown-ac-element` vs `unknown-element`** — rejected: element namespace is already carried by construct identity; class granularity tracks resolution paths, not namespaces.
- **Partial re-assignment (macros only, elements stay coarse)** — rejected: leaves the fallback meaning two things at once (structural violations *and* unknown elements) — incoherent freeze.
- **Defer the decision to E2/E3 spec time** — rejected: deferral lands *after* the bind, i.e. after re-assignment becomes forbidden; it converts a free correction into a permanent compromise.

**Two clarifying pins adopted (edge-case clarifications of Alt 3, not boundary changes — both satisfy the ticket classes and PDR-0002 C-4):**

1. **Orphaned layout-family elements:** a `ac:layout-section`/`ac:layout-cell` occurring with no `ac:layout` ancestor classifies as **one** `reverse/complex-layout` construct at the outermost layout-family element present (the "outermost layout element" rule of spec F-1/DEC-4 read to cover the orphan case) — never as `unknown-element`, and never as multiple per-cell diagnostics. Pin in the GH-93 plan/test-plan so the edge case is classified by rule, not by implementation accident.
2. **Consumer binding rule:** the stable contract is the **`code` string** (plus `severity`); the TypeScript-level `class` union is structural convenience that widens additively (spec DM-2) and is *not* a published promise; `construct` text is display-only. E2/E3 (and any error catalog) route on `code` — never on `class` labels or `construct` text. Record this in the E2/E3 spec-authoring guidance when those changes open.

## Decision

- **Decision:** **Confirm spec DEC-1 (Alternative 3) as the frozen pre-E2/E3 contract**, with the two clarifying pins above: four granular blocking codes added; `reverse/unsupported-construct` retained as structural fallback; the two emitted-code re-assignments (unknown macros, unknown elements) executed now in the verified-consumerless window; registry additions-only forever; assignment map (spec Appendix A) normative and unit-pinned; post-bind re-assignment forbidden.
- **Rationale (tied to drivers):** The class partition maps 1:1 to the ticket's four detection classes (C-2) and to distinct E2/E3 resolution paths (driver 1) — the only partition criterion that stays meaningful for the life of permanent strings (driver 2). The code is the sole declared-stable discriminator (C-3); five blocking codes keep the vocabulary learnable and cataloguable (driver 3); the fallback gives every future discovery a home without re-partition (driver 4); and doing it in GH-93 spends the last free correction window deliberately (driver 5) — after E2/E3 bind, the same correction would be a contract break. Alternatives 0/1 fail the routability gates; Alt 2 spends permanent entries on granularity with no consumer. The naming audit found the mixed `unknown-`/`unsupported-`/`complex-` prefixes semantically accurate and ticket-traceable; no refinement survived challenge as a boundary change, and the two adopted pins only remove ambiguity the freeze would otherwise lock in.
- **Decider:** Juliusz Ćwiąkalski (pending — record is `Proposed`; confirms at GH-93 PR review and flips to Accepted at merge per repo convention, TDR-0012/0013 precedent).
- **Conditions for revisit:** see `revisit_triggers` (class-boundary mis-fit → additive refinement only; fallback-dominant corpora → new class code; error-catalog metadata → mapping layer). Review date set on Acceptance per the iterative retrospective loop.

### Constraint Compliance Attestation

The chosen alternative (Alt 3, with the two clarifying pins) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** 4 additions, 0 removals/renames; the two re-assignments change *emitted* assignment only, on a surface verified consumerless in-tree (FACT, 2026-08-15); registry snapshot unit-pinned.
- **C-2 — ✅ Full compliance:** unknown-macro / complex-layout / unsupported-attribute / unknown-element ↔ the four ticket classes, asserted by the unit-pinned assignment map and aligned-corpus sidecars.
- **C-3 — ✅ Full compliance:** enumerated codes are the routing key; the consumer-binding pin (route on `code`) is recorded for E2/E3 authoring.
- **C-4 — ✅ Full compliance:** all new codes blocking; severity taxonomy unchanged; informational and parse-error arms unchanged in semantics.
- **C-5 — ✅ Full compliance:** library-internal change; zero CLI surface; `ReverseError` remains a standalone union.
- **C-6 — ✅ Full compliance:** five-code blocking vocabulary; growth-by-class rule recorded here and mechanically visible via the registry snapshot.
- **C-7 — ✅ Full compliance:** K1 carve-out, zero-diagnostic canonical sweeps, and corpus-A byte-equality are GH-93 acceptance criteria (AC-F2-2, AC-F7-1) that this decision relies on and reinforces.

No accepted-risk exceptions are required.

> **AI-assistance disclosure:** This record is AI-assisted, grounded in locally verified facts (source reads and repo-wide grep, 2026-08-15) and repo documents (GH-93 spec, GH-92 feature spec, roadmap, registry). No external research was performed or needed (`archetype: design`, no dependency). `citations_verified: false` reflects that no external citations exist to verify. `status: Proposed` until human sign-off at GH-93 PR merge.

## Trade-offs & Consequences

### Positive Outcomes

- E2/E3 get a frozen, enumerated routing key that matches their resolution-path UX 1:1 — the C-4 foundation is complete the moment GH-93 lands.
- The taxonomy is corrected at zero consumer cost; the coarse-code ambiguity (one code, three meanings) is retired before anyone depends on it.
- The assignment map is normative and unit-pinned — code drift fails CI, not users.
- The fallback keeps the contract forward-compatible: new construct classes discovered in the wild get new codes (additions-only) or the fallback home — never a re-partition.

### Negative Outcomes

- Sidecar/unit re-baseline churn inside GH-93 (contained, review-visible — accepted deliberately).
- The freeze is real: if E2/E3 later want a different partition of an *existing* class, the only remedy is additive (new codes for new classes; old classes keep their codes). This is the accepted cost of a stable contract.
- Two vocabularies on the payload (`code` vs the TS `class` union) — mitigated by the binding pin, but a standing review-time confusion risk (like the forward `UNSUPPORTED_CONSTRUCT` name collision).
- Five blocking codes + two arms is a larger catalog to document when the error-catalog UX lands (deferred with E2/E3).

### Unresolved Questions

- [ ] Long-run granularity fit is only observable post-bind (RSK-3 residual) — revisit triggers armed; first check at the E2/E3 spec reviews. (owner: E2/E3 spec-writers)
- [ ] Error-catalog display strings / remediation text per code (owner: E2/E3; mapping layer over codes — never a registry change).
- [ ] Version bump confirmation 0.9.0 → 0.10.0 minor (OQ-3, PM at DoR) — consistent with this record's re-assignment semantics; not re-decided here.

## Implementation Plan

1. GH-93 implements the taxonomy exactly per spec F-1/F-5 and Appendix A (this record confirms; no scope change). The two clarifying pins flow into the delivery plan and test plan: (a) an orphaned-layout-family fixture/classification rule; (b) a consumer-guidance note (route on `code`) carried into E2/E3 spec authoring.
2. Unit-pin the normative assignment map: registry code enumeration snapshot + construct-class→code assertions per Appendix A row (NFR-4) — the mechanical freeze enforcement.
3. Re-pin affected storage-side sidecars (unknown-macro, unknown-element classes) as a reviewed re-baseline in the same PR — never a CI snapshot regen (spec §8.5).
4. Downstream: E2/E3 specs cite the frozen codes verbatim from Appendix A; after their merge, any emitted-code re-assignment proposal fails review against this record.
5. Risk posture during implementation: if a new edge case resists classification into the five classes, it lands in the structural fallback and gets a corpus fixture — not an ad-hoc sixth code; a new *class* requires recording it here (revisit trigger) before the registry grows.

## Verification Criteria

- **Metric: assignment-map unit pin** — Target: 100% of Appendix A rows covered by construct-class→code unit assertions; registry snapshot exact (7 codes: 5 blocking-path + informational + parse-error) — Window: GH-93 delivery (NFR-4).
- **Metric: aligned-corpus detection completeness** — Target: 100% of non-canonical element/attribute instances in the extended corpus appear in exactly one pinned diagnostic; 0 silent drops; 0 unclassified instances — Window: GH-93 (AC-F6-1, NFR-1).
- **Metric: false-positive guard** — Target: 0 new diagnostics over corpus A (26) + forward golden (33) + K1 variants; round-trip byte-equality 100% unchanged — Window: GH-93 (AC-F7-1, NFR-3).
- **Metric: contract freeze observance** — Target: 0 emitted-code re-assignments in any change after E2/E3 merge; registry grows only by class (review rule) — Window: MS-0003 E2/E3 onward (enforced by review against this record + registry snapshot).
- **Metric (downstream): consumer binding** — Target: E2/E3 route on `code` values only (spec-review check) — Window: E2/E3 spec reviews.

## Confidence Rating

**High** on the decision's substance: the constraint screening eliminated three of four alternatives on local, verified facts (registry contract, consumerless surface, ticket classes, consumer timeline), and the survivor's partition criterion — resolution path — is the only durable one available to a permanent-strings contract. **Medium** on long-horizon granularity fit (E2/E3 UX unbuilt; RSK-3 residual): inherent, bounded by the additions-only escape hatch + structural fallback, and armed with revisit triggers. No part of the ranking depends on an unverified signal.

## References

- chg-GH-93-spec.md §14 OQ-1, §15 DEC-1, Appendix A (normative assignment map + alternatives), F-1/F-5, NFR-4 — `doc/changes/2026-08/2026-08-15--GH-93--unsupported-construct-detection/`
- GH-92 baseline — `doc/spec/features/feature-reverse-conversion.md` (§3.1 two-class taxonomy, §4.2 registry, additions-only contract)
- Registry + diagnostic shapes — `src/domain/markdown/reverse-diagnostics.ts`; producer arms — `src/infra/confluence/parse/reverse.ts`, `reverse-parser.ts`; consumerless-ness verification — repo grep 2026-08-15 (this session)
- PDR-0002 (C-4, MS-0003 scope); ADR-0005 (canonical subset, K1, "do not silently degrade"); TDR-0012/TDR-0013 (GH-92 chain precedents: status lifecycle, R2 record shape)
- MS-0003 roadmap — `doc/overview/02-roadmap.md` (E2 `resolve`, E3 `import`, ownership model, diagnostics success metric)
- Name-collision note — `src/cli/output/exit-codes.ts`, `src/app/cli-error-map.ts` (forward `UNSUPPORTED_CONSTRUCT` kind; distinct contract)
