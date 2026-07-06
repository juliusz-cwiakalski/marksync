---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0005
decision_type: adr
status: Accepted
created: 2026-07-03
decision_date: null
last_updated: 2026-07-03
summary: "Generate Confluence Storage Format (XHTML + ac:/ri: macros) as MarkSync's write target, not ADF. Storage is accepted by the v2 page API, round-trips losslessly for all GFM constructs, is far simpler to emit from Markdown, and matches unanimous ecosystem precedent."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: medium
review_date: null
business_impact: "Determines the Markdown→Confluence renderer's output format; affects converter complexity, fidelity, and maintainability."
customer_impact: "None visible beyond correct rendering of their Markdown; insulates users from Atlassian's internal representation churn."
classification:
  domains: [architecture]
  archetype: selection
  environment: simple
  rigor: R2
  reversibility: medium
  stakes: high
  urgency: high
  uncertainty: low
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "Atlassian removes or disables Storage Format as a write representation on the v2 page API (forces a move to ADF)."
  - "A Markdown construct MarkSync must support is found to have no lossless Storage representation (would force an ADF/macro hybrid)."
  - "The new editor stops converting storage↔ADF losslessly for a construct MarkSync relies on."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001, TDR-0001]
  experiments: ["../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md"]
  metrics: []
  roadmap_items: []
---

# ADR-0005: Page body representation — write Storage Format, not ADF

## Context

> **Migration note:** This record was authored pre-inception in `doc/inception/decisions/` and migrated to the canonical ADOS home `doc/decisions/` during Phase 3 inception (2026-07-04). It remains `status: Proposed` pending human confirmation. Records were originally numbered in one sequence regardless of `decision_type`; on 2026-07-05 they were reclassified so each type (ADR, PDR, TDR) has its own sequence per the ADOS decision-making guide.

MarkSync's job is to render Markdown to a Confluence page body. Confluence Cloud's v2 page API accepts two body representations on create/update:

- **Storage Format** — an XHTML document with a small set of `ac:`/`ri:` namespaced elements for Confluence-specific constructs (code blocks, images, task lists, macros). HTML-like; what every Markdown↔Confluence tool in the ecosystem emits.
- **Atlassian Document Format (ADF)** — a ProseMirror-style nested JSON document model (`{type, attrs, content}`); the new editor's internal representation.

The spec flagged "page body representation" as an assumption needing validation (§2.4, §2.5), and TDR-0001's spike was tasked to settle it. The spike has now run (2026-07-03) and produced evidence (see `../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md`).

FACT: both representations are accepted by `POST/PATCH /wiki/api/v2/pages` — Storage (scenario C1/C3) and ADF (scenario D1) both return 200. FACT: a Storage body round-trips **losslessly** through the API — a kitchen-sink page containing all 27 GFM constructs was read back (storage→ADF→storage) with 27/27 surviving (scenario K1). FACT: the only normalisation Confluence performs is auto-filling `ac:schema-version` + `ac:macro-id` on macros and trivial self-closing whitespace. FACT: every reference converter cloned for this spike (`md2conf`, `kovetskiy/mark`, `text2confl`, `md2cf`, `markdown-confluence`) writes Storage; **none** writes ADF on the write path. FACT: under ADR-0001 the implementation language is TypeScript, which has mature Markdown→HTML pipelines (`remark`/`rehype`); the last mile from HTML to Storage is small (entity-escape, wrap code in the code macro, images in `ac:image`, task lists in `ac:task-list`).

## Problem Framing (Clarified)

This is not "which format does Confluence prefer" — both are accepted and the editor stores ADF internally regardless. The real question is: **which representation should MarkSync generate from Markdown**, optimising for converter simplicity, fidelity, and maintainability, given that Storage round-trips losslessly?

## Constraints (Hard Requirements)

### C-1: Lossless Markdown fidelity

- **Statement:** Every supported Markdown (GFM) construct must render to Confluence and survive read-back without loss of meaning.
- **Source:** Spec (Markdown is the source of truth); motivation brain dump (faithful rendering is a differentiator).
- **Verification:** The kitchen-sink round-trip (spike scenario K1) demonstrates 27/27 GFM constructs survive Storage→ADF→Storage.
- **Negotiable:** no.

### C-2: Accepted by the v2 page create/update API

- **Statement:** The chosen representation must be accepted by `POST/PATCH /wiki/api/v2/pages` with a `representation` field.
- **Source:** Spec §9.7 (Confluence adapter contract).
- **Verification:** Spike scenarios C1/C3 (Storage) and D1 (ADF) all return 200.
- **Negotiable:** no.

### C-3: Well-formed output (no API rejection)

- **Statement:** The emitted body must not be rejected by Confluence's parser. Storage is parsed as XML, so it must be well-formed XHTML (balanced tags, escaped entities); malformed input returns HTTP 400.
- **Source:** Spike finding (CSF is XML-parsed); AGENTS.md converter requirements.
- **Verification:** Converter unit/golden tests assert well-formed XML output for every Markdown fixture.
- **Negotiable:** no.

## Decision Drivers

**Simplicity / maintainability:**
- Storage is HTML-like and maps 1:1 to Markdown constructs (`<strong>`, `<em>`, `<ul>`, `<table>`, …) plus a handful of macros. Generating it from a Markdown HTML stream is a thin transform.
- ADF is a nested JSON node tree with per-node `attrs`; generating it requires a full ProseMirror-style builder and is materially more machinery for zero fidelity gain.

**Ecosystem consensus:**
- 5/5 reference converters write Storage; 0/5 write ADF. Following the consensus minimises novelty risk and eases debugging against known-good output.

**Fidelity proof:**
- K1 proves Storage does not lose constructs even though the editor stores ADF internally — the storage↔ADF conversion is bidirectional and lossless for all of GFM.

**Toolchain fit (ADR-0001):**
- TypeScript + `remark`/`rehype` yields an HTML AST; HTML→CSF is a small visitor. No such "Markdown→ADF" shortcut exists; one would build the ADF tree by hand.

## Mental Models & Techniques Used

- **Evidence weighting:** the spike converted this from an assumption into a measured fact (27/27 lossless round-trip).
- **Ockham's razor:** pick the representation that is simplest to generate correctly, given both are accepted and Storage is fidelity-proven.
- **Inversion:** "how could choosing ADF hurt?" — far more code, novel mapping, no ecosystem reference, harder to debug; "how could choosing Storage hurt?" — only if it failed to round-trip, which the spike disproves.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes with accepted cost.

|          | C-1 (lossless fidelity) | C-2 (API-accepted) | C-3 (well-formed output) |
|----------|--------------------------|--------------------|-----------------|
| Alt 1    | ✅ (K1: 27/27) | ✅ (C1/C3) | ✅ (XHTML, validator-friendly) |
| Alt 2    | ⚠️ (feasible but unproven for full GFM) | ✅ (D1) | ✅ (JSON, schema-checkable) |
| Alt 3    | ✅ | ✅ | ✅ (two code paths to maintain) |

### Alternative 1 — Write Storage Format (RECOMMENDED)

- **Summary:** Convert Markdown → XHTML, then emit Confluence Storage Format (`<ac:structured-macro ac:name="code">`, `<ac:image><ri:url/>`, `<ac:task-list>`, etc.). Submit with `representation:"storage"`.
- **Pros:** Simplest to generate; HTML-like 1:1 mapping with Markdown; unanimous ecosystem precedent; proven lossless (K1); leverages mature TS Markdown→HTML tooling.
- **Cons:** Output must be well-formed XML (escaped entities, balanced tags) or Confluence returns 400; raw inline HTML from Markdown is sanitised away (acceptable — escape/drop it).
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why chosen:** Satisfies all constraints with the least machinery and the strongest evidence.

### Alternative 2 — Write ADF

- **Summary:** Build an Atlassian Document Format JSON tree and submit with `representation:"atlas_doc_format"`.
- **Pros:** It is the editor's internal representation, so no storage↔ADF conversion occurs on write; JSON is easy to serialise.
- **Cons:** Far more code to map Markdown→ADF (nested `{type,attrs,content}` nodes; code blocks, images, and task lists become `extension`/`media` nodes with non-trivial attrs); zero ecosystem precedent among Markdown→Confluence tools; no fidelity advantage since Storage already round-trips losslessly; harder to author/debug by hand.
- **Constraint compliance:** C-1 ⚠️ (accepted by API per D1, but full-GFM lossless mapping is unproven and would need its own validation); C-2 ✅; C-3 ✅.
- **Why rejected:** All cost, no benefit over Storage.

### Alternative 3 — Hybrid (write Storage, read ADF)

- **Summary:** Write Storage, but read pages back as ADF for diffing/drift detection.
- **Cons:** Maintains two representations in the codebase; the Storage read-back (C2/K1) is already lossless, so reading ADF buys nothing and adds a parser. Introduces avoidable complexity.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why rejected:** Unnecessary dual-path complexity; Storage read-back already meets the drift-detection need.

## Decision

**Recommendation: Alternative 1 — MarkSync's Confluence adapter generates and submits Confluence Storage Format (`representation:"storage"`).**

Both representations are API-accepted, but Storage is fidelity-proven (spike K1: 27/27 GFM constructs survive a storage→ADF→storage round-trip losslessly), materially simpler to generate from Markdown, and matches the unanimous practice of every reference converter. ADF is the editor's internal format, but because Storage converts to/from ADF losslessly, writing Storage costs nothing in fidelity while saving substantial converter complexity.

> **AI-assistance disclosure:** This analysis is AI-assisted and is **evidence-backed** by the 2026-07-03 spike. The human decider (Juliusz Ćwiąkalski) has **not yet** confirmed. `status: Proposed` until human confirmation during inception.

### Constraint Compliance Attestation

- **C-1 — ✅ Full compliance:** Spike K1 demonstrates all 27 GFM constructs survive Storage round-trip.
- **C-2 — ✅ Full compliance:** Spike C1/C3 confirm `representation:"storage"` is accepted by the v2 page create/update API (HTTP 200).
- **C-3 — ✅ Full compliance (with a converter obligation):** Storage is XML-parsed; the converter must emit well-formed XHTML. This is an implementation requirement, not a representation limitation.

## Trade-offs & Consequences

### Positive Outcomes

- Thin, HTML-like converter; maximal reuse of Markdown→HTML tooling (`remark`/`rehype` under ADR-0001).
- Fidelity de-risked by measurement, not assumption.
- Easy to debug against 5 reference implementations' output.

### Negative Outcomes

- The converter must guarantee well-formed XML (a validator/golden-test obligation).
- Raw inline HTML in source Markdown is stripped by Confluence's sanitizer — document this as a known limitation (escape or drop).

### Unresolved Questions

- [ ] Exact Markdown parser/renderer library pick (`remark` vs `marked` vs other) — small follow-on under ADR-0001.
- [ ] Handling of non-GFM extensions MarkSync may later support (footnotes, math, definition lists) — defer; Storage/macro fallback where possible.

## Implementation Plan

1. **Renderer interface** — keep the spec's `Renderer` boundary; add a `MarkdownToStorageRenderer` implementation.
2. **Pipeline** — Markdown → MDAST/HAST (via the chosen parser) → Storage XHTML, applying the macro wrappers: code blocks → `<ac:structured-macro ac:name="code">` + CDATA; images → `<ac:image><ri:url|ri:attachment/>`; task lists → `<ac:task-list>`; everything else maps to native HTML tags.
3. **Golden tests** — pin the `examples/pages/storage-kitchensink.xml` fixture (and per-construct cases) as golden output; assert well-formedness (XML parse) and API acceptance.
4. **Documentation** — record the "raw HTML is sanitised" and "task lists can't mix with list items" limitations in user-facing docs.

**Risk mitigation:** if a future Markdown construct lacks a lossless Storage representation, fall back to a macro or revisit this ADR via its revisit triggers — do not silently degrade.

## Verification Criteria

- **Metric: GFM round-trip fidelity** — Target: a kitchen-sink Markdown doc renders to Storage, posts to Confluence, and reads back with every construct intact (≥ the 27/27 demonstrated in K1) — Window: renderer implementation.
- **Metric: Well-formedness** — Target: 100% of rendered bodies parse as valid XML (no HTTP 400 from Confluence) — Window: every golden test.
- **Metric: API acceptance** — Target: create + update with `representation:"storage"` return 2xx against the sandbox — Window: integration tests.

## Confidence Rating

**High.** This is an evidence-backed decision: the spike directly tested the load-bearing claim (lossless Storage round-trip for all GFM constructs) and confirmed it. Residual uncertainty is limited to Markdown extensions beyond GFM, which are explicitly deferred.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- Spike findings: `../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` (H3, H3b, H6).
- Spike evidence: `../inception/tmp/confluence-api-validation-spike/evidence/raw/` — `C1-01`, `C2-01`, `C3-01`, `D1-01`, `K1-02`, `K1-03`, `K1-04`; fixture `examples/pages/storage-kitchensink.xml`.
- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.4 (assumptions needing validation), §2.5 (open question: body representation), §9.7 (Confluence adapter).
- Related decisions: ADR-0001 (TS runtime + Markdown tooling), TDR-0001 (the spike that produced this evidence).
