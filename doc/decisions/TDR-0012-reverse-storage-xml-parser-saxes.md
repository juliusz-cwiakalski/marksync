---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0012
decision_type: tdr
status: Proposed
created: 2026-08-15
decision_date: null
last_updated: 2026-08-15
summary: "Use saxes (strict, streaming SAX XML parser) for GH-92 Storage→HAST reverse parsing, building HAST directly from SAX events in the infra tier (line/column positions double as F-4 diagnostic locations). parse5/hast-util-from-html is rejected: the WHATWG HTML grammar has no CDATA-in-content and no XML well-formedness error arm (NFR-4 C-2/C-3), and parse5 is not a locked dependency. @xmldom/xmldom is the eligible runner-up fallback."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: parsing
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Unblocks the MS-0003 critical path (GH-92 → MS3-E2-S1/S3, MS3-E3-S1); the parser sits behind the infra-tier port so a swap is plan-level, not architecture-level."
customer_impact: "Indirect: correct CDATA/entity handling is what makes reverse-converted code blocks byte-faithful and malformed pages fail loudly instead of mangling content — the no-silent-loss brand promise applied to the read direction."
classification:
  domains: [architecture, security]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: medium
  uncertainty: medium
  blast_radius: local
  recurrence: one-off
governance:
  driver: decision-advisor (AI)
  decider: Juliusz Ćwiąkalski
  contributors: [GH-92 spec-writer (chg-GH-92-spec.md context)]
  reviewers: [Juliusz Ćwiąkalski]
  performers: [GH-92 coder]
  informed: [pm]
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "Real read-back corpora (E3 import, partner corpora beyond K1 evidence) surface HTML-named entities (&nbsp;, &mdash;, …) or DTD-dependent constructs that a strict XML parser rejects as undefined entities — add a bounded, table-driven entity normalization pre-pass or reopen parser selection."
  - "saxes maintenance stalls, a security advisory lands, or a Bun/bun-build-compile incompatibility appears — swap to the runner-up (@xmldom/xmldom DOM→HAST mapping); the parser is port-isolated by DEC-4, so the swap is plan-level."
  - "Golden round-trip corpus exposes a saxes well-formedness or CDATA-reassembly divergence from forward output — parser-level defect escalates to re-selection rather than a compensating hack."
links:
  related_changes: [GH-92]
  supersedes: []
  superseded_by: []
  spec: [doc/changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/chg-GH-92-spec.md]
  contracts: []
  diagrams: []
  decisions: [ADR-0001, ADR-0005]
  experiments: []
  metrics: []
  roadmap_items: [MS-0003]
---

# TDR-0012: Reverse-converter Storage parser — saxes (strict SAX → HAST)

## Context

This record resolves **OQ-1** of the GH-92 change specification (chg-GH-92-spec.md §14) and the "XML/XHTML parser dependency" integration row (§8.4), ahead of delivery-plan lock (RSK-3 mitigation). It selects the parser for the MS-0003 E1 reverse converter: Confluence Storage Format → HAST, the first stage of the Storage→Markdown pipeline.

Situational facts establishing the decision space:

- FACT: Storage Format is **XHTML plus `ac:`/`ri:` namespaced elements** — well-formed XML by construction, because Confluence's own XML parser gates what is accepted on write (ADR-0005 C-3; spec §12).
- FACT: The forward renderer emits code-macro bodies as **CDATA sections and splits any literal `]]>`** into `]]]]><![CDATA[>` to stay well-formed (`cdata()` in `src/infra/confluence/render/storage.ts`). The reverse parser must transparently reassemble those split sections — the split form is *designed* to occur (NFR-4 names it explicitly).
- FACT: The forward renderer's escaping emits **only the five XML predefined entities** (`&amp; &lt; &gt;`, plus `&quot;` in attributes — `escapeText`/`escapeAttr`). Golden round-trip fixtures (corpus A = forward output) therefore never contain HTML-named entities.
- FACT: The repo's Markdown stack is remark/rehype/unified (ADR-0001/ADR-0005); the domain tier consumes **HAST** (`@types/hast` devDependency; `src/domain/markdown/mdast-to-hast.ts`).
- FACT: **No XML/XHTML parser is a declared dependency.** `parse5@7.3.0`, `hast-util-from-html@2.0.3`, `hast-util-from-parse5@8.0.3`, and `rehype-parse@9.0.1` are present in `node_modules` but **absent from `bun.lock`** — stale install artifacts with no locked dependent; a clean CI install does not guarantee them. The spec's "appears incidentally" observation (§2.1) is true of the working tree, not of the dependency graph.
- FACT: Supply chain: vuln + license scans run on every push, SBOM on release (NFR-SEC-4, implemented per GH-32); native modules conflict with `bun build --compile` single-binary and are spike-gated out (tech-stack; keytar precedent).
- FACT: Numbering: TDR-0011 is reserved for the GH-90 historical-version API spike verdict (in-flight GH-90 delivery requires a TDR-0011 index row); this record is TDR-0012.

## Problem Framing (Clarified)

The surface question — "which parser library?" — is secondary. The real question is: **which document grammar do we parse Storage under — XML or HTML?** Every hard requirement (NFR-4) is a grammar property before it is a library property:

1. **CDATA is an XML-only construct in content.** The WHATWG HTML tokenizer supports CDATA sections only inside foreign (SVG/MathML) content; in HTML content `<![CDATA[…]]>` becomes a *bogus comment*. An HTML parser therefore cannot extract code-macro bodies, let alone reassemble split `]]>` sequences, without out-of-band hacks that would themselves be construct extraction (prohibited, NFR-4).
2. **Well-formedness erroring is an XML-only arm.** HTML parsing is error-*recovery* by specification: malformed XML typically parses "successfully" into a mangled tree. parse5's `onParseError` reports HTML-spec tokenization errors, which are neither necessary nor sufficient for XML well-formedness (e.g. mismatched nesting is silently corrected). NFR-4's "malformed Storage → stable parse error" requires the XML grammar's strictness.
3. **Namespaced tag identity must survive verbatim.** The reverse classifier keys on element identity (`ac:structured-macro`, `ri:attachment`, …) and Confluence-assigned attributes (`ac:schema-version`, `ac:macro-id`). XML parsers are case-sensitive colon-permissive (prefix stays part of the name); HTML parsers lowercase names — benign for today's all-lowercase Storage, but the identity guarantee should be structural, not coincidental.

Once the XML grammar is fixed, the remaining choice is parser *shape*: streaming SAX (build HAST directly on events) vs DOM (map a second tree to HAST) vs tolerant object-tree parsers (disqualified by the WF arm). HAST output is produced by a mapping layer under DEC-4's tiering contract either way — the spec deliberately keeps candidates swappable behind the infra-tier port (§8.4).

## Constraints (Hard Requirements)

### C-1: Standards-based parser; no regex/string extraction of constructs

- **Statement:** Storage is parsed by a real XML/XHTML parser; zero regex-based construct extraction (NFR-4).
- **Source:** chg-GH-92-spec.md NFR-4, §21.
- **Verification:** Code review of the parsing module (no construct-extraction regexes); golden corpus parsed by the library, not by string surgery.
- **Negotiable:** no.

### C-2: CDATA + entity correctness, including split `]]>` reassembly

- **Statement:** CDATA body extraction is byte-correct on all corpus fixtures — including bodies where the forward renderer split `]]>` sequences — and XML entities are unescaped correctly (NFR-4; AC-F3-2 asserts CDATA bytes identical to the emitted fence).
- **Source:** chg-GH-92-spec.md NFR-4, Appendix A (fenced-code row); `cdata()` in the forward renderer (split-by-construction).
- **Verification:** Golden round-trip harness — corpus-A fixtures containing `]]>` (e.g. code with array closes) plus a dedicated split-CDATA fixture.
- **Negotiable:** no.

### C-3: Malformed Storage → stable parse error, never a crash

- **Statement:** Input that is not well-formed XML produces a stable parse-error arm (distinct from per-construct diagnostics, F-4); no exception escapes as a crash.
- **Source:** chg-GH-92-spec.md NFR-4, F-4.
- **Verification:** Storage-side adversarial set — truncated, mismatched, and stray-`]]>` inputs each yield the typed parse-error arm (unit + adversarial fixtures).
- **Negotiable:** no.

### C-4: Namespaced `ac:`/`ri:` identity preserved case-intact

- **Statement:** Element and attribute names (`ac:structured-macro`, `ac:schema-version`, `ri:filename`, …) survive parsing with exact spelling and case — the classifier and K1-tolerance logic key on them (F-1/F-3d).
- **Source:** chg-GH-92-spec.md F-1, F-3d, Appendix A.
- **Verification:** Golden fixtures assert exact tag/attribute identity post-parse (unit-level tree assertions + corpus).
- **Negotiable:** no.

### C-5: HAST-shaped output or trivially mappable

- **Statement:** The parser's output maps to HAST without semantic transformation — a mechanical mapping layer at most (spec §8.4 wording).
- **Source:** chg-GH-92-spec.md §8.4, F-1, DEC-4.
- **Verification:** The domain-tier serializer consumes the produced tree via `@types/hast` types; mapping layer is mechanical (review).
- **Negotiable:** no.

### C-6: Bun-compatible, pure JS, single-binary safe

- **Statement:** Runs under the pinned Bun runtime and survives `bun build --compile` — no native modules (ADR-0001; tech-stack keytar precedent).
- **Source:** ADR-0001; `doc/overview/tech-stack.md`.
- **Verification:** CI (Bun) green; binary build pipeline unbroken.
- **Negotiable:** no.

### C-7: Supply-chain clean; maintained; license recorded

- **Statement:** The dependency passes NFR-SEC-4 scanning (push CI vuln/license scans; release SBOM), is actively maintained, and its license string is recorded — compatibility acceptance is the human decider's (RSK-3).
- **Source:** chg-GH-92-spec.md RSK-3, §8.4; `doc/spec/nonfunctional.md` NFR-SEC-4.
- **Verification:** CI scans on the branch that declares the dependency; license string recorded below as FACT.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Unblock the MS-0003 critical path (GH-92 gates MS3-E2-S1, MS3-E2-S3, MS3-E3-S1) with the least schedule risk.
- Protect the no-silent-loss brand promise in the read direction: loud, located failures over mangled content.

**Technical drivers (ranked):**
1. Determinism (NFR-2) — the parse must be a pure function of input; tree shape under our control, no map-iteration effects.
2. Grammar fit — CDATA and well-formedness are load-bearing (they *are* C-2/C-3); parser shape (SAX vs DOM) follows.
3. Diagnostic locations — F-4 requires a Storage-source location "sufficient to locate the element" (OQ-3 leaves the form open); line:column per element is the strongest form.
4. Minimal new surface — one small, zero-dependency addition; the HAST mapping is ours and auditable.
5. Unified-toolchain affinity — the tree *consumer* stays HAST/rehypesque; only the parser front-end differs.

**Operational drivers:**
- Reversibility: parser isolated behind the infra-tier port (DEC-4); a swap is plan-level (RSK-3 mitigation by design).
- Performance headroom: NFR-3 (≤ 200 ms p95, informational) favors a single streaming pass.
- Solo-maintainer auditability: small dep, small mapping layer, corpus-lockable behavior.

## Decision Rights (DACI)

- **Driver:** decision-advisor (AI) — coordinates this record.
- **Decider / Approver:** Juliusz Ćwiąkalski — approves via GH-92 PR review (record flips to Accepted at merge per repo convention).
- **Contributors:** GH-92 spec-writer (spec context, OQ-1 framing); GH-92 delivery planning.
- **Required reviewers:** Juliusz Ćwiąkalski (also confirms license acceptance, per C-7).
- **Performers:** GH-92 coder (declare dep, implement infra-tier Storage→HAST module).
- **Informed:** pm (links record from spec/plan).

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| Forward renderer splits `]]>` in CDATA by construction | FACT | `src/infra/confluence/render/storage.ts` `cdata()` (read 2026-08-15) | C-2 premise collapses | High |
| Forward escaping emits only the 5 XML predefined entities | FACT | `escapeText`/`escapeAttr` (read 2026-08-15) | Strict-XML entity scope too narrow for corpus A | High |
| parse5 & hast-util-from-html are stale, not locked deps | FACT | `bun.lock` (no entries); `node_modules` inspection 2026-08-15 | "Already in the tree" argument would gain weight — still fails C-2/C-3 | High |
| WHATWG HTML tokenizer makes CDATA-in-content a bogus comment; HTML parsing is error-recovering | FACT | WHATWG HTML Standard §13.2.5 (tokenizer), §13.2.6 (tree construction) — long-standing spec text | parse5 family becomes eligible | High |
| saxes: strict spec-faithful streaming SAX XML parser, zero deps, MIT, maintained, reports WF errors, offers line/col positions, delivers CDATA content via its text/cdata event surface | ASSUMPTION (research-directional, re-verify before lock) | github.com/isaacs/saxes (canonical; not re-verified 2026-08-15) | Wrong parser shape → swap to runner-up (port-isolated) | Medium |
| @xmldom/xmldom: maintained fork, MIT, throws/reports on malformed XML with severity levels (0.9+ `onError`) | ASSUMPTION (research-directional, re-verify before lock) | github.com/xmldom/xmldom (canonical; not re-verified 2026-08-15) | Runner-up fitness wrong → re-open before lock | Medium |
| fast-xml-parser is error-tolerant by design; validator is opt-in and shallower than a spec-faithful WF pass | ASSUMPTION (research-directional, re-verify before lock) | github.com/NaturalIntelligence/fast-xml-parser | Would become eligible; still weaker locations | Medium |
| Read-back Storage beyond K1 (editor entity forms like `&nbsp;`) does not appear in marksync-authored pages | ASSUMPTION | ADR-0005 spike K1 + forward-escape FACT | Strict parser rejects undefined entities on E3 corpora → revisit trigger (entity pre-pass) | Medium |
| Exact saxes event surface for CDATA (text vs dedicated event) and position option semantics | TO-CONFIRM | saxes README/source at lock time | Mapping-layer detail only; spike task below closes it | High (closeable) |

### Technical-Selection Evidence Pack (archetype: selection)

Researched via `@external-researcher`: **no** — local evidence only (network delegation unavailable in this session); external signals below are research-directional and **must be re-verified against canonical sources before the dependency is locked** (`citations_verified: false`). Data minimization: only public package identifiers are named here.

**Candidate: saxes** — *primary*

| Signal | Label | Canonical source | As-of | Confidence |
|--------|-------|------------------|-------|------------|
| License string | FACT (MIT) — recorded; acceptance is the human decider's | github.com/isaacs/saxes | 2026-08-15 (unverified) | Medium |
| Maturity / role | sax's maintained successor (isaacs) | github.com/isaacs/saxes | 2026-08-15 | Medium |
| Release cadence / activity | ASSUMPTION: active | repo commits | TO-CONFIRM | Low |
| Dependencies | ASSUMPTION: zero runtime deps | package.json in repo | TO-CONFIRM | Medium |
| Security advisories | TO-CONFIRM | osv.dev (runs in CI on declare) | on branch | — |
| WF error reporting + line/col positions | ASSUMPTION | README | TO-CONFIRM | Medium |
| Integration fit | FACT (by grammar): strict XML, streaming, pure JS | — | 2026-08-15 | High |
| Lock-in / migration cost | Low — port-isolated (DEC-4); swap = mapping layer | — | 2026-08-15 | High |

**Candidate: @xmldom/xmldom** — *runner-up*

| Signal | Label | Canonical source | As-of | Confidence |
|--------|-------|------------------|-------|------------|
| License string | FACT (MIT) — recorded; acceptance is the human decider's | github.com/xmldom/xmldom | 2026-08-15 (unverified) | Medium |
| Maturity / role | community fork maintaining xmldom; DOM output | github.com/xmldom/xmldom | 2026-08-15 | Medium |
| WF error behavior | ASSUMPTION: severity levels, `onError` (0.9+) | docs | TO-CONFIRM | Medium |
| Node source positions | FACT (by DOM design): not retained | DOM spec | 2026-08-15 | High |
| Integration fit | strict XML, pure JS, DOM→HAST walk | — | 2026-08-15 | High |
| Lock-in / migration cost | Low-moderate — DOM is an intermediate tree | — | 2026-08-15 | High |

**Candidate: parse5 (+ hast-util-from-html)** — *disqualified on grammar*

| Signal | Label | Canonical source | As-of | Confidence |
|--------|-------|------------------|-------|------------|
| License string | FACT: MIT, parse5@7.3.0, hast-util-from-html@2.0.3 (local stale install) | node_modules + github.com/inikulin/parse5 | 2026-08-15 | High |
| Locked in this repo | FACT: **no** — absent from `bun.lock` | bun.lock | 2026-08-15 | High |
| WHATWG conformance class | FACT: HTML grammar — no CDATA-in-content, error-recovery parsing | WHATWG HTML Standard | 2026-08-15 | High |
| Integration fit | Produces HAST directly (real advantage, moot given C-2/C-3 failures) | — | 2026-08-15 | High |

## Mental Models & Techniques Used

- **First Principles:** Strip the library branding — CDATA, well-formedness, and name-case are *grammar* properties. Storage is XML; parse it with an XML grammar. The parser question collapses to shape (SAX vs DOM) after the grammar question is answered.
- **Inversion:** "How does each option silently lose content?" parse5: CDATA→bogus-comment (code bodies corrupted) + malformed input "succeeds" (mangled tree). fast-xml-parser: tolerance by design. DOM: no positions → weaker diagnostics. saxes: strictness rejects undefined entities on foreign corpora (accepted, loud, revisit-triggered — the *right* failure mode: audible, not silent).
- **Second-Order Thinking:** The forward renderer's split-`]]>` convention guarantees adversarial CDATA appears in every corpus with `]]>` in code; any parser whose CDATA handling is "usually fine" fails deterministically on our own fixtures. Also: relying on unlocked `node_modules` artifacts would pass locally and break in clean CI — a supply-chain trap, not a convenience.
- **Opportunity Cost:** parse5's HAST-direct output would save a mapping layer (~150 lines) but cost two non-negotiable constraints; saxes costs the mapping layer and buys grammar correctness plus line:column locations (which otherwise need a separate mechanism).
- **KISS / single grammar:** one parser, one pass, one grammar for gate and tree — versus the hybrid's two parses under two grammars with CDATA bridging between them.
- **Evidence weighting:** the decision rests on grammar facts (WHATWG spec, local renderer/lockfile FACTs), not on directional maintenance figures; those are re-verified pre-lock and do not change the ranking.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). All constraints here are `Negotiable: no`.

|          | C-1 (standards-based) | C-2 (CDATA + entities) | C-3 (WF error arm) | C-4 (ns identity) | C-5 (HAST/map) | C-6 (Bun, pure JS) | C-7 (supply chain) |
|----------|------------------------|-------------------------|---------------------|--------------------|-----------------|----------------------|---------------------|
| Alt 0 — defer / string surgery | ❌ | ❌ | ❌ | ❌ | — | ✅ | ✅ |
| Alt 1 — parse5 via hast-util-from-html | ✅ | ❌ | ❌ | ⚠️→❌ (lowercases; benign today, not structural) | ✅ | ✅ | ⚠️ (not locked; new dep all the same) |
| Alt 2 — saxes, SAX→HAST builder (RECOMMENDED) | ✅ | ✅ | ✅ | ✅ | ✅ (mechanical builder) | ✅ | ✅ (pending scans + human license acceptance) |
| Alt 3 — @xmldom/xmldom, DOM→HAST mapping | ✅ | ✅ | ✅ (TO-CONFIRM error semantics at pin) | ✅ | ✅ (mechanical walk) | ✅ | ✅ (pending scans + human license acceptance) |
| Alt 4 — fast-xml-parser | ✅ | ⚠️ | ❌ | ✅ | ⚠️ (object tree, mixed-content config) | ✅ | ✅ |
| Alt 5 — hybrid: strict XML gate + parse5 tree | ✅ | ❌ (HTML pass still mangles CDATA) | ✅ (via gate) | ⚠️ | ✅ | ✅ | ⚠️ (two deps) |
| Alt 6 — hand-rolled tokenizer/regex | ❌ (prohibited) | ❌ | ❌ | ❌ | — | ✅ | ✅ |

### Alternative 0 — Do Nothing / string surgery

- **Eligibility:** Not eligible (fails C-1/C-2/C-3/C-4).
- **Summary:** Ship no parser; extract constructs with regex/string ops, or defer the reverse path.
- **Constraint compliance:** C-1 ❌ (regex extraction is exactly what NFR-4 prohibits); C-2 ❌; C-3 ❌; C-4 ❌.
- **Driver fit:** None — also blocks the MS-0003 critical path (GH-92 gates E2/E3).
- **Why rejected:** Prohibited by spec; milestone-blocking. Baseline documented for completeness.

### Alternative 1 — parse5 via hast-util-from-html (or rehype-parse)

- **Eligibility:** Not eligible (fails C-2 and C-3 — both non-negotiable).
- **Summary:** The unified-ecosystem default: parse5 (WHATWG reference HTML parser) producing HAST directly; already familiar from the rehype toolchain.
- **Constraint compliance:** C-2 ❌ — in HTML *content* the tokenizer turns `<![CDATA[…]]>` into a bogus comment (foreign-content CDATA does not apply to `ac:`/`ri:` elements), so code-macro bodies cannot round-trip and the forward renderer's split-`]]>` construct is doubly out of grammar. C-3 ❌ — HTML parsing error-*recovers* by specification; `onParseError` fires HTML-spec tokenization errors, which neither catch malformed XML reliably nor fail on mangled-but-tokenizable input, so the required stable parse-error arm cannot be built on it. C-4 ⚠️ — names are lowercased (Storage is lowercase today; identity is coincidental, not structural) — immaterial given the eliminations. C-7 ⚠️ — the "already in node_modules" premise is false at the lockfile level (FACT: absent from `bun.lock`); adopting it means a new declared dependency with no offsetting saving.
- **Driver fit:** Best toolchain affinity and zero mapping layer — real advantages, but moot after C-2/C-3.
- **Why rejected:** Grammar mismatch on the two constraints the spec wrote *specifically about this input* (NFR-4's CDATA and well-formedness clauses exist to disqualify this path). Evaluated here to document the disqualification, per OQ-1.

### Alternative 2 — saxes: strict streaming SAX, build HAST on events (RECOMMENDED)

- **Eligibility:** Eligible (passes all constraints; C-7 completed by CI scans + human license acceptance at PR).
- **Summary:** saxes (maintained SAX successor, pure JS, zero deps) parses in strict XML mode; a small infra-tier builder (~150 lines) constructs HAST directly from open-tag/text/close events with a node stack — no intermediate tree. WF violations surface through the parser's error path → wrapped into the typed parse-error arm (C-3). CDATA content arrives as character data with split sections reassembled per XML semantics (C-2). Line/column positions per event power F-4's location diagnostics (resolves OQ-3 toward line:column, strongest form).
- **Constraint compliance:** C-1 ✅; C-2 ✅ (spec-native CDATA; verified by corpus incl. split-`]]>`` fixtures); C-3 ✅ (strict mode); C-4 ✅ (case-sensitive, colon-in-name); C-5 ✅ (our builder emits `@types/hast` nodes — mapping is *authorship*, fully under control); C-6 ✅ (pure JS, zero deps); C-7 ✅ pending scans/acceptance.
- **Driver fit:** Best — determinism is by construction (single pass, our tree); grammar fit is exact; locations are native; the surface added is one small dep + one auditable module; NFR-3 headroom (streaming, no second tree).
- **Cons:** We own the tree-building code (stack management, text-node merging policy); event-surface details (CDATA event shape, position option semantics) are TO-CONFIRM at pin; strictness rejects undefined entities (see revisit trigger — the failure is loud, which is the spec's preferred failure mode).
- **Why chosen:** Only alternative that passes every constraint *and* ranks first on the top drivers (determinism, grammar fit, locations). See Decision.

### Alternative 3 — @xmldom/xmldom: DOM parse + walk-to-HAST mapping (RUNNER-UP)

- **Eligibility:** Eligible (C-3 error semantics TO-CONFIRM at pin — 0.9+ severity/`onError` behavior must be verified when the version is chosen).
- **Summary:** The maintained xmldom fork builds a full XML DOM (CDATA sections and namespaces represented), then a walk maps DOM→HAST.
- **Constraint compliance:** C-1 ✅; C-2 ✅ (DOM CDATA nodes; reassembly per XML semantics); C-3 ✅-pending-verification; C-4 ✅; C-5 ✅ (mechanical walk); C-6 ✅; C-7 ✅ pending scans/acceptance.
- **Driver fit:** Good, ranked below saxes on three drivers: (a) **no per-node source positions** — DOM discards them, so F-4 locations degrade to element-path form (minimum-contract compliant, weaker than line:column); (b) intermediate DOM = second tree (allocation + mapping walk between parse and HAST); (c) larger dependency surface for the same grammar guarantee.
- **Why not chosen:** Dominated by Alt 2 on the ranked drivers while matching its constraint eligibility. **Retained as the swap target** if saxes hits a revisit trigger — the port isolation (DEC-4) makes the exchange plan-level.

### Alternative 4 — fast-xml-parser

- **Eligibility:** Not eligible (fails C-3).
- **Summary:** Popular object-tree XML parser; fast, configurable.
- **Constraint compliance:** C-3 ❌ — error-tolerant by design; its validator is opt-in and historically shallower than a spec-faithful WF pass, so the "malformed → stable error" arm cannot be guaranteed. C-5 ⚠️ — object trees need careful configuration for mixed content and attribute/text collisions.
- **Driver fit:** Speed is real (NFR-3 is informational, not binding).
- **Why rejected:** Tolerance is the opposite of the required WF gate; mapping is lossier than DOM/SAX for mixed content.

### Alternative 5 — Hybrid: strict-XML well-formedness gate + parse5 for the HAST tree

- **Eligibility:** Not eligible (fails C-2 as composed).
- **Summary:** A strict XML parser validates well-formedness; parse5 then builds the HAST tree.
- **Constraint compliance:** C-3 ✅ (via the gate); C-2 ❌ — the HTML pass still renders CDATA as bogus comments, so the hybrid additionally needs a CDATA→escaped-text pre-conversion *before* parse5, i.e. a byte-level rewriting pass between the two grammars — complexity with no remaining benefit. C-7 ⚠️ — two dependencies.
- **Why rejected:** Two grammars over one document invite divergence (a doc can pass the XML gate yet tree-build differently under HTML recovery rules); the CDATA bridging hack reintroduces exactly the hand-rolled handling NFR-4 prohibits. Strictly dominated by Alt 2/3.

### Alternative 6 — Hand-rolled tokenizer / regex extraction

- **Eligibility:** Not eligible (fails C-1 — prohibited outright).
- **Summary:** Write a bespoke Storage tokenizer.
- **Why rejected (documented per OQ-1):** NFR-4 explicitly prohibits regex-based extraction; a correct XML tokenizer (entities, CDATA, nesting, WF errors) is a parser — rebuilding one is pure unpriced risk against the repo's "battle-tested over clever" principle. Listed only to foreclose re-litigation.

## Decision

- **Decision:** **Alternative 2 — adopt saxes as the Storage→HAST parsing engine**, behind the infra-tier port (DEC-4): strict XML mode, a repo-owned SAX→HAST builder, parser errors wrapped into the typed parse-error arm, line/column positions threaded into F-4 diagnostics. @xmldom/xmldom (Alt 3) is the designated fallback.
- **Rationale (tied to drivers):** The grammar analysis is decisive: CDATA and well-formedness are XML-grammar properties that the HTML-grammar candidates cannot offer at any version (C-2/C-3 eliminations are structural, not maturity judgments). Among XML-grammar survivors, saxes ranks first on the top drivers — determinism by construction (single pass, our tree), exact grammar fit, native line:column locations for F-4 (resolving OQ-3 to the strongest form), and the smallest added surface (zero-dep parser + one auditable builder module). The residual uncertainty (event-surface details, maintenance signals) is cheap to close pre-lock and does not change the ranking, because it sits on the correct side of every hard gate.
- **Decider:** Juliusz Ćwiąkalski (pending — record is `Proposed`; flips to Accepted at GH-92 PR merge per repo convention, jointly with confirming license acceptance per C-7).
- **Conditions for revisit:** see `revisit_triggers` in the front matter (foreign-corpus entities; saxes stall/advisory/Bun incompatibility; corpus-exposed parser divergence).

### Constraint Compliance Attestation

The chosen alternative (Alt 2 — saxes) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** a standards-track strict XML parser does all parsing; the repo-owned builder performs tree construction, not construct extraction (code review + corpus).
- **C-2 — ✅ Full compliance:** CDATA is spec-native; split `]]>` reassembly follows XML character-data semantics; enforced byte-wise by the golden round-trip harness (AC-F3-2) incl. a dedicated split-CDATA fixture.
- **C-3 — ✅ Full compliance:** strict mode reports WF violations; the adapter wraps them into the stable parse-error arm — verified by the malformed-input adversarial fixtures.
- **C-4 — ✅ Full compliance:** XML parsing is case-sensitive with no name rewriting; asserted by unit tree-identity checks.
- **C-5 — ✅ Full compliance:** the builder emits `@types/hast` nodes; mapping is mechanical and repo-owned.
- **C-6 — ✅ Full compliance:** pure JS, zero runtime dependencies; runs under pinned Bun and `bun build --compile`.
- **C-7 — ✅ compliance pending routine completion:** NFR-SEC-4 scans execute automatically once the dependency is declared on the GH-92 branch; MIT license string recorded as FACT above — **compatibility acceptance is expressly reserved to the human decider**.

No accepted-risk exceptions are required.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in local FACTs (forward renderer source, `bun.lock`, `node_modules`, spec) and WHATWG grammar properties. Maintenance/activity signals for saxes/@xmldom/xmldom/fast-xml-parser are **research-directional and not re-verified** against canonical sources in this session (`citations_verified: false`); the GH-92 plan must include a pre-lock verification step (below). License strings are recorded as FACT; compatibility is a human determination. `status: Proposed` until human sign-off at merge.

## Trade-offs & Consequences

### Positive Outcomes

- Every NFR-4 clause is satisfied by grammar construction, not configuration: CDATA (incl. split sequences) round-trips byte-identically; malformed input fails loudly with a typed error.
- Line/column positions come free with the streaming shape — F-4 diagnostics get the strongest location form (OQ-3), no second mechanism needed.
- Determinism (NFR-2) is by construction: single pass, ordered node stack, no intermediate tree, no map-iteration surface.
- Minimal supply-chain delta: one zero-dependency pure-JS package; scans and SBOM pick it up automatically (NFR-SEC-4).
- Swappability is real, not aspirational: the parser hides behind the infra-tier port; the runner-up exchange is plan-level (RSK-3 mitigated).

### Negative Outcomes

- A ~150-line repo-owned SAX→HAST builder (stack management, text-node coalescing policy) — code we maintain that parse5 would have provided; contained, corpus-locked, and tier-isolated.
- Strict XML rejects undefined entities: foreign corpora containing HTML-named entities (`&nbsp;` etc.) will hard-fail until a bounded entity pre-pass exists (revisit trigger). This is the spec-preferred failure mode (loud, located) and does not affect corpus A (forward output uses only predefined entities — FACT).
- Directional maintenance signals not yet re-verified; the pre-lock spike task closes this before the dependency is pinned.
- Toolchain affinity loss is cosmetic but real: the parse front-end leaves the unified family; the tree (HAST) and all downstream consumers stay unified.

### Unresolved Questions

- [ ] Pre-lock verification (owner: GH-92 coder; gate: dependency pin): confirm saxes current version, license, zero-dep status, WF-error surface, CDATA event shape, and position-option semantics against canonical sources + a 30-minute Bun smoke test (parse all 35 corpus Storage fixtures).
- [ ] Entity policy for foreign corpora (owner: Juliusz Ćwiąkalski; window: E3 import planning): accept hard-fail vs bounded entity table — revisit trigger is already armed.
- [ ] Location shape confirmation (OQ-3): this decision supplies line:column; E2/E3 presentation may add element-path — additive, non-blocking.

## Implementation Plan

1. **Declare** `saxes` in `dependencies` (pinned exact version) on the GH-92 branch; push CI runs NFR-SEC-4 scans on it; record the human license acceptance on the PR.
2. **Pre-lock spike** (Unresolved Questions #1) before the pin is final — swap to @xmldom/xmldom only if a gate-level failure appears (not expected: gates are grammar-level).
3. **Implement** the infra-tier Storage→HAST module per DEC-4: saxes strict mode + node-stack builder emitting HAST; parser errors wrapped into the existing MarkSyncError model's parse-error arm (additive, DM-2 posture).
4. **Housekeeping:** the stale unlocked `node_modules` artifacts (parse5 family) disappear on the next clean install once `bun.lock` governs; no action beyond not relying on them.
5. **Lock behavior with fixtures:** add the split-`]]>`` CDATA fixture and the malformed-Storage adversarial set to the golden/adversarial tiers (AC-F3-2, NFR-4 verification) so any future parser divergence fails CI.
6. **Risk mitigation during implementation:** if saxes event semantics differ from the mapping assumptions (CDATA delivery, positions), adjust the builder — do not weaken C-2/C-3 verification to fit the library; if a gate cannot be met, execute the runner-up swap rather than adding compensating logic.

## Verification Criteria

- **Metric: golden round-trip fidelity (corpus A)** — Target: 100% incl. all CDATA bodies and split-`]]>`` fixtures byte-identical — Window: GH-92 (AC-F1-1/NFR-1).
- **Metric: malformed-Storage adversarial set** — Target: 100% of malformed fixtures yield the typed parse-error arm, 0 crashes — Window: GH-92 (NFR-4).
- **Metric: determinism** — Target: byte-identical output across repeated in-process and cross-run conversions — Window: GH-92 (AC-F1-2/NFR-2).
- **Metric: supply chain** — Target: CI vuln/license scans clean with saxes declared; release SBOM includes it — Window: GH-92 branch onward (NFR-SEC-4).
- **Metric: reverse performance** — Target: ≤ 200 ms p95 per page on the reference corpus (informational) — Window: GH-92 (NFR-3).

## Confidence Rating

**Medium-high.** The eliminations (parse5 family, fast-xml-parser, hybrid, hand-rolled) rest on grammar facts and local FACTs — effectively certain and version-independent. The positive choice (saxes over @xmldom/xmldom) rests on driver ranking (locations, determinism, surface size) with directional, un-re-verified maintenance signals; the pre-lock spike closes exactly that gap, and the port-isolated runner-up makes the worst case a plan-level swap. No part of the ranking depends on a directional figure.

## References

- chg-GH-92-spec.md §8.4 (OQ-1 integration row), §9 NFR-4, §11 RSK-3, §14 OQ-1, §15 DEC-4 — `doc/changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/`
- ADR-0005 — Storage Format authority, C-3 well-formedness, spike K1 — `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md`
- ADR-0001 — Bun + single-binary runtime constraint — `doc/decisions/ADR-0001-implementation-language-and-runtime.md`
- Forward renderer grounding — `src/infra/confluence/render/storage.ts` (`cdata()` split-`]]>``, `escapeText`/`escapeAttr` entity scope)
- Dependency-graph grounding — `package.json` (no XML parser declared), `bun.lock` (no parse5 entries; stale `node_modules` inspection 2026-08-15)
- `doc/spec/nonfunctional.md` NFR-SEC-4; `doc/overview/tech-stack.md` (native-module/single-binary policy)
- External (research-directional, re-verify before lock): github.com/isaacs/saxes, github.com/xmldom/xmldom, github.com/NaturalIntelligence/fast-xml-parser, whatwg.org HTML Standard (tokenizer/tree-construction), github.com/inikulin/parse5
