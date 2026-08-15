---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-92
  type: feat
  status: Proposed
  slug: reverse-converter-storage-to-markdown
  title: "feat: reverse converter — Confluence Storage Format → Markdown (canonical GFM subset, deterministic)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0003, feature, priority:critical, reverse-conversion, E1]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [markdown pipeline (forward converter — consumed as-is, unchanged), golden fixture corpus (tests/golden/fixtures/markdown/), MarkSyncError diagnostics model, golden/adversarial test tiers (.ai/rules/testing-strategy.md)]
    external: [Confluence Cloud Storage Format (read-back normalizations per ADR-0005 spike K1), XML/XHTML parser dependency (selection open — OQ-1)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Build the deterministic mirror of the forward converter — Confluence Storage Format → Markdown for the canonical GFM subset (ADR-0005) — with 100% golden-fixture round-trip fidelity and C-4-compliant unsupported-construct diagnostics, as the MS-0003 E1 foundation that both `resolve` (E2) and `import` (E3) consume.

## 1. SUMMARY

MarkSync today converts only Markdown→Storage (GH-20 forward pipeline). This change adds the reverse direction — Confluence Storage Format (XHTML + `ac:`/`ri:` macros) → Markdown — for the same canonical GFM subset, emitting a precisely defined canonical Markdown form deterministically. It strips marksync-generated structures on read-back (provenance panel; mermaid macro wrappers), tolerates Confluence-assigned attributes (`ac:schema-version`/`ac:macro-id`, spike K1), and produces stable diagnostics with locations for Storage constructs outside the canonical subset (PDR-0002 C-4 — never silently dropped; PM-DEC-1). Verification is a golden-fixture round-trip harness: `reverse(forward(md))` must byte-equal the normalized fixture for every canonical fixture. Library/foundation only — no CLI surface (PM-DEC-2); `resolve` and `import` are later consumers. Version 0.8.2 → 0.9.0.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **Forward pipeline (delivered, GH-20 + GH-63/GH-77):** `parseMarkdown` (remark + remark-frontmatter + remark-gfm; comment-only annotation stripping) → MDAST→HAST bridge → unsupported-node classifier (`findUnsupported` fast-fail + `findAllUnsupported` collect-all, `src/domain/markdown/unsupported.ts`) → canonicalizer + content hash → HAST→Storage visitor `renderStorage` (`src/infra/confluence/render/storage.ts`) returning `{ body, hash, warnings }`.
- **Golden corpus (NFR-REL-4 authority):** 33 `.md`/`.storage.xhtml` fixture pairs in `tests/golden/fixtures/markdown/` covering every canonical construct family plus a kitchensink; 2 fixtures carry `.unsupported.txt` classification sidecars (raw-HTML block, mixed comment/HTML); 2 Storage-only fixtures exist (`mermaid-render-policy.storage.xhtml` — synthetic attachment image; `provenance-panel.storage.xhtml` — panel form). The corpus is near-canonical but not uniformly so — the round-trip comparison needs a normalization definition (watch item 1).
- **Provenance panel (GH-27):** `ac:structured-macro ac:name="info"` whose `ac:rich-text-body` contains the marker comment `<!-- marksync:provenance-panel -->` (`PROVENANCE_PANEL_MARKER`, `src/infra/confluence/provenance.ts`); appended post-render to the final Storage string — it exists only in Storage, never in HAST (which is how NFR-PERF-4 keeps the panel out of the drift hash).
- **Mermaid policies:** default `code` policy emits the source as `ac:structured-macro ac:name="code"` with `ac:parameter ac:name="language">mermaid` + CDATA body; opt-in `render` policy replaces the fence with a synthetic `<ac:image ac:alt="Mermaid diagram"><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>` (`src/domain/mermaid/transform.ts`, GH-25/GH-69) — the diagram source is not recoverable from the page under `render`.
- **Read-back normalization (ADR-0005 spike K1):** the only normalization Confluence performs on Storage round-trip is auto-filling `ac:schema-version` + `ac:macro-id` on macros and trivial self-closing whitespace; `renderStorage` deliberately omits both attributes on write.
- **Diagnostics precedent:** the forward classifier emits the pre-existing `UnsupportedConstruct` error arm (`{ kind, construct, sourcePath }` — construct identity + source path, no in-document location). Reverse diagnostics require locations (C-4) — a contract extension, not a reuse as-is.
- **Parser substrate:** the repo's Markdown stack is remark/rehype/unified (ADR-0001/ADR-0005); no XML/XHTML parser is a declared dependency today (`parse5` appears in `node_modules` only incidentally, not in `package.json`/`bun.lock`).
- **No reverse path exists:** nothing in `src/` converts Storage→Markdown; `resolve`/`import` (roadmap E2/E3) are undefined and depend on this change. Intake base: `main @ 80065a4`.

### 2.2 Pain Points / Gaps

- **Milestone critical path blocked:** without Storage→Markdown conversion, neither `resolve` (E2 remote-side diff) nor `import` (E3 corpus adoption) can be built — GH-92 blocks MS3-E2-S1, MS3-E2-S3, MS3-E3-S1.
- **No canonical Markdown emission form is defined anywhere.** "Round-trip equals the fixture" is not a usable AC while fixtures mix emphasis marker styles, heading styles, and list forms; the comparison basis must be normalized, and the normalizer and the reverse serializer must share one definition or the AC is self-defeating.
- **Marksync-generated structures would corrupt reverse output.** Every published page carries the provenance panel; `render`-policy pages carry synthetic mermaid images. A naive reverse converter would emit panel prose and attachment junk as document content.
- **C-4 gap on the reverse direction:** unknown/non-canonical Storage constructs (gliffy/layout macros, nested tables, app macros — the GH-31 category taxonomy) have no reverse classification; silently dropping them would violate PDR-0002 C-4.
- **Read-back reality differs from write output:** pages fetched from the API carry `ac:schema-version`/`ac:macro-id` that the forward renderer never emits; the reverse parser must tolerate them or every real read-back fails.
- **NFR-REL-4 covers only the forward direction.** The roadmap guardrail ("reverse round-trip fidelity 100%, re-run on subset expansion") has no enforcing harness yet.

## 3. PROBLEM STATEMENT

Because the codebase can only convert Markdown→Storage, the MS-0003 `resolve` (E2) and `import` (E3) flows cannot turn Confluence page bodies back into Markdown — blocking the milestone critical path — and any ad-hoc reverse conversion would be comparison-ambiguous (no canonical emission form), polluted by marksync-generated structures (provenance panel, mermaid artifacts), fragile against Confluence read-back normalization, and silently lossy on non-canonical constructs in violation of PDR-0002 C-4.

## 4. GOALS

- **G-1**: Deterministic Storage→Markdown conversion for the canonical GFM subset (ADR-0005) — the exact mirror of the forward construct mapping.
- **G-2**: 100% golden-fixture round-trip fidelity on canonical fixtures — `reverse(forward(md))` byte-equals `normalize(md)` — enforced by a golden-tier harness that re-runs on every subset expansion (roadmap guardrail).
- **G-3**: Marksync-generated structures are handled on read-back: provenance panel stripped, mermaid code-macro wrapper unwrapped to a ```mermaid fence, render-policy synthetic images classified as stable informational diagnostics — never emitted as content, never silently dropped.
- **G-4**: Unsupported-construct diagnostics: stable codes + Storage locations for every construct outside the canonical subset (PDR-0002 C-4; PM-DEC-1), mirroring the forward classifier's fast-fail/collect-all parity.
- **G-5**: A shared, normative definition of the canonical Markdown emission form, used by both the reverse serializer and the round-trip normalizer.
- **G-6**: Library-only delivery with no CLI surface (PM-DEC-2); forward pipeline byte-unchanged; version bump 0.8.2 → 0.9.0.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Round-trip fidelity on canonical fixtures (corpus A, §17) | 100% — 0 byte mismatches |
| Determinism: repeated conversion of identical Storage | byte-identical output, 0 nondeterminism sources |
| Unsupported-construct classes with stable code + location (Storage-side adversarial set) | 100% |
| Forward golden fixtures modified | 0 (33 pairs stay green unmodified) |
| New CLI commands/flags | 0 |
| Package version | 0.9.0 (minor bump, DEC-5) |

### 4.2 Non-Goals

- **NG-1**: No CLI surface — no command, flag, or output format is added or changed (PM-DEC-2).
- **NG-2**: No `resolve`/`import` flows — no diffing, patch generation, lock/state writes, or Git interaction (E2/E3 scope).
- **NG-3**: No change to the forward converter or its output — the forward golden set is the regression tripwire (byte-stable).
- **NG-4**: No adopt-verbatim escape hatch or resolution-path UX — PDR-0002 unresolved question owned by E2/E3 planning; E1 delivers the diagnostics those flows surface.
- **NG-5**: No network/API integration — the converter's input is a Storage string; it performs zero I/O.
- **NG-6**: No canonical-subset expansion — the subset is exactly ADR-0005's (future expansions are separate changes that must re-run the round-trip guardrail).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Deterministic Storage→Markdown conversion engine (canonical GFM subset) | The mirror of the forward construct mapping — the milestone critical-path deliverable every consumer (E2/E3) is blocked on. |
| F-2 | Golden-fixture round-trip verification harness | The ticket's primary AC (100% round-trip) needs an executable, corpus-driven harness wired into the golden tier, re-run on every subset expansion (roadmap guardrail). |
| F-3 | Marksync-structure handling on read-back | Every real page body carries marksync-generated structures (provenance panel) and/or policy artifacts (mermaid); they must be stripped/classified before conversion or they leak into content. |
| F-4 | Unsupported-construct diagnostics (stable codes + locations) | PDR-0002 C-4 / roadmap E1 / PM-DEC-1: non-canonical Storage constructs must never be silently dropped; this is the reverse mirror of the forward classifier. |
| F-5 | Canonical Markdown normalizer | The round-trip comparison basis `normalize(md)` — one shared canonical-form definition (with the serializer) makes the 100% AC meaningful and non-self-referential. |
| F-6 | Library-only delivery boundary | PM-DEC-2: ships as an embeddable library contract with no CLI binding; E2/E3 are the consumers. |

### 5.1 Capability Details

**F-1 — Conversion engine.** Parses Storage XHTML (namespaced `ac:`/`ri:` elements, CDATA sections, XML entities) into a HAST-shaped tree via a standards-based XML/XHTML parser (NFR-4 — regex-based extraction is prohibited), then serializes canonical constructs to Markdown in the canonical emission form (DEC-3, Appendix B). Construct coverage is the exact mirror of the forward visitor: headings h1–h6, paragraphs, strong/em/del, inline code, fenced code blocks (incl. language parameter), links, images (remote URL + attachment), unordered/ordered lists incl. nesting, task lists, tables, blockquotes, thematic breaks. Same Storage input → byte-identical Markdown (no timestamps, no map-iteration-order effects). Tiering contract per DEC-4: Storage→HAST parsing is Confluence-specific (infra tier); HAST→Markdown serialization is adapter-agnostic (domain tier) — mirroring the forward split.

**F-2 — Round-trip harness.** A golden-tier harness over the existing corpus, partitioned per DEC-7: (A) canonical-construct fixtures (incl. kitchensink, mermaid code-policy) assert `reverse(forward(md)) === normalize(md)` byte-wise; (B) annotation/defensive fixtures (front-matter, HTML/link-reference comments, raw-HTML inline, classification sidecars) assert explicit reverse expectations instead of raw equality; plus new Storage-only fixtures (panel strip, render-policy artifact, K1 read-back attribute variants of canonical fixtures). The harness enforces the roadmap guardrail mechanically: adding any fixture or subset expansion without 100% pass fails CI.

**F-3 — Marksync structures on read-back.** (a) Provenance panel: any `ac:structured-macro ac:name="info"` whose body contains the `marksync:provenance-panel` marker comment is dropped entirely before conversion — no diagnostic (DEC-6; it is marksync metadata, never Markdown content). (b) Mermaid `code` macro: `ac:name="code"` with `language=mermaid` unwraps naturally to a ```mermaid fence (content round-trip; wrapper never emitted). (c) Mermaid `render` artifact: `ac:image` with `ri:filename="marksync-mermaid-<hash>.svg"` (alt "Mermaid diagram") → informational `marksync-synthetic-artifact` diagnostic (DEC-1) — the source is not recoverable from the page; not emitted as content; does not block conversion. (d) Confluence-assigned attributes `ac:schema-version`/`ac:macro-id` (and trivial self-closing whitespace, K1) are ignored — no diagnostic, never emitted.

**F-4 — Diagnostics.** Two classes (DEC-1): **blocking `unsupported-construct`** — any Storage element/macro outside the canonical subset produces a stable per-class diagnostic code + the construct identity + a Storage-source location sufficient to locate the element; conversion fails fast, with a collect-all enumeration available listing every instance with identical per-instance verdicts (parity with the forward `findUnsupported`/`findAllUnsupported` contract). **informational `marksync-synthetic-artifact`** — recognized marksync-generated structures reported alongside successful conversion (F-3c). Malformed Storage (not well-formed XML) is a distinct parse error arm — conversion cannot proceed; a stable error, not a per-construct diagnostic. Diagnostic payloads carry construct identity + location, not free-form content echoes (INV-SEC-1/NFR-SEC-1 posture).

**F-5 — Normalizer.** `normalize(md)` = parse with the forward parse stage (including its documented non-rendering-annotation stripping: YAML front-matter, comment-only HTML, link-reference comments) then serialize in the canonical emission form (DEC-3). Required properties: deterministic; idempotent (`N(N(md)) === N(md)`); and the reverse converter's canonical output is a fixed point (`N(reverse(storage)) === reverse(storage)` for canonical Storage).

**F-6 — Library-only boundary.** The capability ships as an internal library contract (DM-1) — no CLI command, flag, output envelope, or exit-code change; existing CLI tests remain green unmodified. E2 (`resolve`) and E3 (`import`) bind to this contract in their own changes.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Round-trip verification (golden tier, this change's primary gate)
  fixture.md → parseMarkdown → HAST → renderStorage → Storage string
  Storage string → [strip panel] → [parse → HAST] → serialize → Markdown
  assert: Markdown === normalize(fixture.md), byte-wise, for every corpus-A fixture

Flow 2 — Read-back conversion (the shape E2/E3 will drive)
  Confluence API page body (Storage): content + panel + K1 attrs (ac:schema-version/macro-id)
  → drop panel (marker-identified info macro) → ignore K1 attrs
  → parse to HAST → classify: canonical | unsupported (blocking) | synthetic artifact (info)
  → canonical: serialize to canonical Markdown; unsupported: stable diagnostic code + location
  → Result: Markdown on success; error arms on unsupported/malformed

Flow 3 — Unsupported construct (C-4)
  Storage contains a non-canonical macro (e.g. gliffy/layout/nested table — GH-31 taxonomy)
  → conversion fails fast with diagnostic {stable code, construct, Storage location}
  → collect-all enumeration lists every instance (consumer UX belongs to E2/E3)

Flow 4 — Render-policy mermaid artifact
  Storage contains ac:image → ri:attachment marksync-mermaid-<hash>.svg (alt "Mermaid diagram")
  → conversion succeeds; image NOT emitted as content; informational
    marksync-synthetic-artifact diagnostic reported (diagram source not on the page)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Storage→Markdown conversion engine for the canonical GFM subset (F-1), placed per the tiering contract (DEC-4).
- Canonical Markdown emission form — normative definition + normalizer (F-5, DEC-3, Appendix B).
- Provenance-panel strip; mermaid wrapper handling (both policies); K1 attribute tolerance (F-3).
- Unsupported-construct diagnostics: two-class taxonomy, stable codes, locations, fast-fail + collect-all parity (F-4, PM-DEC-1).
- Golden round-trip harness + corpus partition + new Storage-side fixtures, incl. a Storage-side adversarial set for diagnostics regression-locking that extends the GH-31 category taxonomy (F-2, DEC-7).
- Diagnostics model extension of the existing error model (additive; reuse-vs-new-arm latitude to the plan).
- Version bump 0.8.2 → 0.9.0 (DEC-5).
- Doc impact (discharged in phase 7 by @doc-syncer): a reverse-conversion feature spec under `doc/spec/features/` and a reverse-direction note on NFR-REL-4 in `doc/spec/nonfunctional.md` (the roadmap guardrail already names this deliverable).

### 7.2 Out of Scope

- [OUT] Any CLI command/flag/output (PM-DEC-2; NG-1).
- [OUT] `resolve`/`import` flows, Markdown diffing, patch generation, lock/state writes, Git operations (E2/E3; NG-2).
- [OUT] Changes to the forward converter, its fixtures, or its byte output (NG-3).
- [OUT] Adopt-verbatim escape hatch / resolution-path UX (PDR-0002 unresolved question; E2/E3; NG-4).
- [OUT] Network/API integration — no fetch, no credentials, no egress (NG-5).
- [OUT] Canonical-subset expansion (ADR-0005 subset fixed; expansions re-run the guardrail; NG-6).
- [OUT] Synthesizing front-matter, UUIDs, or lock entries on reverse (that is E3 `import`'s job; reverse never invents metadata).

### 7.3 Deferred / Maybe-Later

- Partial/suppressed-construct conversion mode (convert the supported remainder despite blocking diagnostics) if E2/E3 diffing needs it — OQ-2, DEC-2.
- Diagnostic-code registry publication beyond the codebase (user-facing error catalog) when E2/E3 surface diagnostics in UX.
- ADF read path (permanently rejected by ADR-0005 Alt 3 — listed only to foreclose re-litigation).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no HTTP surface; no CLI surface (PM-DEC-2). The library-level contract is specified in §8.3/DM-1.

### 8.2 Events / Messages

N/A — no events or messages produced or consumed.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | Reverse conversion contract (library-level) | **New (additive)** — input: a Storage XHTML string (+ provenance context for diagnostics); output: canonical Markdown on success, with informational diagnostics reported alongside; blocking diagnostics (unsupported constructs) and malformed-input parse errors as error arms. Fast-fail + collect-all parity guaranteed (DEC-2). Tier placement per DEC-4. |
| DM-2 | Reverse diagnostic model | **New (additive)** — two severity classes (`unsupported-construct` blocking; `marksync-synthetic-artifact` informational), each carrying a stable per-class code, construct identity, and a Storage-source location. Extends the existing error model; exact arm shape is plan latitude within this contract. |
| DM-3 | Canonical Markdown emission form | **New (normative)** — the shared definition binding the reverse serializer and the round-trip normalizer (DEC-3, Appendix B). |
| DM-4 | Round-trip corpus partition | **New** — corpus A (canonical round-trip fixtures), corpus B (annotation/defensive fixtures with explicit expectations), Storage-only reverse fixtures, Storage-side adversarial set (DEC-7). |

No persisted data (lock, cache, config schemas) is touched.

### 8.4 External Integrations

| Integration | Change | Contract |
|-------------|--------|----------|
| Confluence Storage Format (input format) | None (read-side only) | Input conforms to ADR-0005 Storage + K1 read-back normalizations (`ac:schema-version`, `ac:macro-id`, trivial self-closing whitespace); the converter makes zero API calls. |
| XML/XHTML parser dependency | Likely new (OQ-1) | A standards-based parser producing a HAST-shaped tree (or trivially mappable); selection via @decision-advisor; subject to NFR-SEC-4 supply-chain scanning and the pinned-toolchain rules. |

### 8.5 Backward Compatibility

Fully backward compatible:

- Purely additive library capability; the forward pipeline and its 33 golden pairs are untouched and must remain green unmodified (regression tripwire).
- No CLI, config, lock, or state-format change of any kind.
- Version impact: **minor** — 0.8.2 → 0.9.0 (DEC-5): a new library-level capability, no breaking API change, nothing user-facing removed.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Round-trip fidelity (reverse direction; extends NFR-REL-4) | 100% of corpus-A fixtures: `reverse(forward(md)) === normalize(md)` byte-wise; 0 mismatches; harness re-runs on every subset expansion |
| NFR-2 | Determinism | Same Storage input → byte-identical Markdown across repeated conversions in-process and across separate runs; 0 timestamps/UUIDs/random-iteration-order effects |
| NFR-3 | Conversion performance (reverse direction; mirrors NFR-PERF-5) | ≤ 200 ms p95 per page Storage→Markdown on the reference corpus (informational) |
| NFR-4 | Parsing robustness | 100% of golden-corpus Storage parsed by a standards-based XML/XHTML parser; 0 regex-based construct extraction; XML entity unescaping + CDATA body extraction (incl. split `]]>` sequences) correct on all corpus fixtures; malformed Storage → stable parse error, never a crash |
| NFR-5 | Converter safety (reverse direction; NFR-SEC-5 posture) | Parsed content is never executed; 0 network calls; 0 new egress; diagnostic payloads carry codes/locations, not free-form content echoes |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new metrics, traces, or alerts (library-only, no runtime surface). Observability is the golden-tier harness itself: the round-trip guardrail and the Storage-side adversarial classification run in CI on every push, so fidelity/diagnostic regressions surface at review time. Diagnostic objects are structured (code + construct + location) so later consumers (E2/E3) can render them deterministically.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Normalizer and serializer disagree on the canonical form → round-trip AC fails spuriously or (worse) is "fixed" by weakening the normalizer | H | M | One normative definition (DEC-3) binds both; fixed-point properties (F-5) make divergence mechanically detectable; fixtures are near-canonical already | L |
| RSK-2 | Real-corpus Storage varies beyond K1 evidence (editor normalization drift, entity forms, whitespace) → round-trip fails outside fixtures | H | M | K1-variant fixtures (attrs injected) are in corpus; PDR-0002 revisit trigger already defined (hold `resolve`, expand diagnostics); partner-corpus evidence lands with E3 | M |
| RSK-3 | Parser dependency is new to the tree — supply-chain/bun-compatibility risk | M | M | OQ-1 routed to @decision-advisor; NFR-SEC-4 scanning + pinned version; the contract requires a HAST-shaped (or trivially mappable) output, keeping candidates swappable | L |
| RSK-4 | Diagnostic contract mismatches E2/E3 consumer needs (e.g., they need partial conversion) | M | M | Collect-all parity mirrors the forward precedent; partial mode pre-analyzed as deferred (DEC-2/OQ-2); consumer specs bind to DM-1/DM-2 and will surface gaps early | M |
| RSK-5 | Render-policy pages lose mermaid diagrams on reverse (source not on the page) → import/resolve of render-policy corpora is lossy | M | M | Informational diagnostic makes the loss explicit and located (never silent); E2/E3 own the UX (e.g., re-publish under `code` policy); documented limitation | M |
| RSK-6 | Mirror-maintenance burden: forward and reverse drift apart as the subset evolves | M | M | Roadmap mandates re-running the 100% guardrail on every subset expansion; the harness makes the two directions fail together, not silently diverge | L–M |

## 12. ASSUMPTIONS

- ADR-0005 spike K1 remains authoritative: Confluence's only Storage read-back normalization is auto-filling `ac:schema-version`/`ac:macro-id` plus trivial self-closing whitespace.
- The 33-pair golden corpus (NFR-REL-4) is the canonical-fixture authority; its fixtures are near-canonical, and the repo's existing remark-based stringification defaults already satisfy the canonical emission form (DEC-3) — the normalizer pins, not invents, the form.
- Parsed Storage arrives well-formed (it was accepted by Confluence's XML parser on write, ADR-0005 C-3); malformed input is an error path, not a fixture-normal case.
- PM-DEC-1 (diagnostics in scope) and PM-DEC-2 (no CLI) are binding; scope authority is PDR-0002 + the issue body (no story file exists yet).
- E2/E3 are the sole consumers of this contract in the near term; nothing in-tree calls the reverse path today.
- The provenance panel and other marksync structures are marksync metadata, never Markdown content (they are absent from HAST by construction, NFR-PERF-4) — stripping them loses nothing.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Forward markdown pipeline (parse, MDAST→HAST, classifier, canonicalizer, `renderStorage`) | Consumed as-is for the round-trip harness and the normalizer's parse stage; must remain byte-stable |
| Depends on | Golden corpus + adversarial taxonomy (GH-31) | Extended (Storage-side), not replaced |
| Depends on | PDR-0002 E1 scope + C-4; ADR-0005 canonical subset + K1 | Authority documents; no re-decision |
| Depends on | XML/XHTML parser selection (OQ-1) | Likely a new dependency; decision-advisor gate before plan locks |
| Blocks | MS3-E2-S1, MS3-E2-S3 (resolve flow), MS3-E3-S1 (import) | Milestone critical path — E1 feeds both |

## 14. OPEN QUESTIONS

- **OQ-1**: Which XML/XHTML parser? The unified ecosystem default (parse5-based HTML-to-HAST utility) produces HAST directly and parse5 already sits incidentally in `node_modules` — but it is **not** a declared dependency today, and an XML-parser alternative may handle namespaced `ac:`/`ri:` elements more strictly. Decision needed: consult `@decision-advisor`.
- **OQ-2**: Do E2 (`resolve`) / E3 (`import`) additionally need a partial-conversion mode (supported remainder converted despite blocking diagnostics)? DEC-2 defers it; E2/E3 planning owns the answer — the DM-1 contract is designed so such a mode is additive.
- **OQ-3**: Diagnostic location granularity (line:column vs element path vs both) — F-4 fixes the minimum contract ("sufficient to locate the element in the Storage source"); the final shape should be confirmed against E2/E3 presentation needs. Not blocking; plan latitude.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Two-class diagnostic taxonomy: blocking `unsupported-construct` (stable code + construct + Storage location; conversion fails) vs informational `marksync-synthetic-artifact` (reported; conversion proceeds). | C-4 requires non-canonical constructs to block with diagnostics — but the provenance panel and render-policy mermaid images exist on *every* marksync page of their kind; classifying them as blocking would make virtually all real read-backs unconvertible. Informational classification keeps the loss explicit (never silent, never content) without bricking the common path. | 2026-08-15 |
| DEC-2 | Result contract mirrors the forward classifier: fast-fail on the first blocking diagnostic, with a collect-all enumeration guaranteed to produce identical per-instance verdicts. Partial conversion is deferred (§7.3). | Direct precedent: `findUnsupported`/`findAllUnsupported` parity (GH-20 DEC-1). C-4's resolution path ("edit in Confluence to remove, or adopt-verbatim") presupposes the user resolves diagnostics before content is used — matching fail-fast, not partial output. | 2026-08-15 |
| DEC-3 | The canonical Markdown emission form is defined normatively in this spec (Appendix B) and shared by the reverse serializer and the round-trip normalizer; it is byte-compatible with the repo's remark-based stringification defaults. | Without a single definition the 100% round-trip AC is self-referential (each side could "fix" mismatches unilaterally). Anchoring to the existing remark defaults keeps the form ecosystem-standard rather than invented, and the near-canonical fixtures already conform. | 2026-08-15 |
| DEC-4 | Tiering contract (mirror of forward): Storage→HAST parsing lives in the infra tier (Confluence-specific format knowledge); HAST→Markdown serialization lives in the domain tier (adapter-agnostic). Exact module naming is plan latitude. | Ports-and-adapters symmetry with the forward pipeline (`src/domain/markdown/*` + `src/infra/confluence/render/storage.ts`); keeps Confluence knowledge out of the domain and lets a future adapter reuse the serializer. | 2026-08-15 |
| DEC-5 | Version 0.8.2 → 0.9.0 (minor). | New library-level capability, additive, no breaking change, no CLI — confirms the PM's suggested bump. A patch would under-signal a new capability; a major would over-signal (nothing removed). | 2026-08-15 |
| DEC-6 | Non-content structures are stripped without diagnostics: provenance panel (marker-identified info macro), mirroring the forward carve-out for non-rendering annotations (front-matter, comment-only HTML). Reverse never *synthesizes* annotations. | The panel and annotations were never Markdown content — stripping them is lossless by definition (they are absent from HAST by construction). A diagnostic would be noise on every conversion. Mermaid render artifacts differ: the source *was* Markdown content, hence DEC-1's informational class. | 2026-08-15 |
| DEC-7 | Corpus partition (DM-4): canonical-construct fixtures assert round-trip equality (corpus A — the ticket's "every canonical fixture"); annotation/defensive fixtures assert explicit reverse expectations (corpus B); Storage-only fixtures cover panel/render-policy/K1 variants. | The ticket AC says "canonical fixture" — fixtures exercising non-canonical behavior (raw-HTML, unsupported classification, annotations) cannot honestly assert raw equality and already have sidecar-based expectations in the forward set; forcing them into corpus A would mandate a weakened normalizer. | 2026-08-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Storage→HAST parse (new, infra tier) | New — Confluence-specific parsing, panel strip, K1 tolerance, entity/CDATA handling |
| HAST→Markdown serializer + canonical normalizer (new, domain tier) | New — canonical emission form (DEC-3), deterministic |
| Diagnostics model | Extended (additive) — reverse diagnostic classes with codes + locations (DM-2) |
| Golden corpus + round-trip harness (golden tier) | Extended — corpus partition, Storage-only fixtures, Storage-side adversarial set (DM-4) |
| Forward pipeline | Unchanged — regression tripwire (33 pairs byte-stable) |
| CLI | Unchanged — zero surface delta (PM-DEC-2) |
| Docs (`doc/spec/features/`, `doc/spec/nonfunctional.md`) | Updated in phase 7 — reverse-conversion feature spec + NFR-REL-4 reverse-direction note |
| Package version | 0.8.2 → 0.9.0 (DEC-5) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Tier | Linked |
|----|-----------|------|--------|
| AC-F1-1 | **Given** every corpus-A fixture (one per canonical construct family: h1–h6, paragraph, strong/em/nested emphasis, strikethrough, inline code, fenced code with language, plain/query-amp links, remote/attachment images, unordered/ordered/nested lists, task lists, tables, blockquote, hr, plus kitchensink and mermaid code-policy), **when** `reverse(forward(md))` is compared byte-wise to `normalize(md)`, **then** 100% of fixtures are equal — 0 mismatches. | Golden | F-1, F-2, F-5, NFR-1 |
| AC-F1-2 | **Given** the same Storage input converted twice within a run and across separate runs, **when** outputs are compared, **then** they are byte-identical (0 nondeterminism sources — no timestamps, no iteration-order effects). | Golden + unit | F-1, NFR-2 |
| AC-F2-1 | **Given** the completed harness, **when** any fixture is added or the canonical subset expands, **then** the round-trip guardrail automatically includes it (a failing/unincluded expansion fails CI) — mechanically enforcing the roadmap's "re-run on subset expansion" rule. | Golden | F-2, NFR-1, DM-4 |
| AC-F3-1 | **Given** Storage containing the provenance panel (any `ac:name="info"` macro whose body contains the `marksync:provenance-panel` marker — incl. the existing `provenance-panel.storage.xhtml` fixture form), **when** converted, **then** the output contains 0 panel content, 0 wrapper elements, 0 marker traces, and no blocking diagnostic. | Golden | F-3, DEC-6 |
| AC-F3-2 | **Given** a `language=mermaid` code macro with CDATA body, **when** converted, **then** the output is a ```mermaid fenced block whose source bytes are identical to the CDATA content, with 0 macro-wrapper artifacts in the output. | Golden | F-1, F-3 |
| AC-F3-3 | **Given** canonical Storage variants carrying Confluence-assigned `ac:schema-version` and `ac:macro-id` on macros (K1 read-back form), **when** converted, **then** conversion succeeds with output identical to the attribute-free variant; the attributes produce no diagnostic and never appear in output. | Golden | F-3, NFR-4 |
| AC-F4-1 | **Given** the Storage-side adversarial set (GH-31 category taxonomy mirrored to Storage: unknown macros, nested tables, app/gliffy-class constructs, …), **when** converted, **then** each fixture produces a blocking `unsupported-construct` diagnostic with a stable code, the construct identity, and a Storage location sufficient to locate the element; the construct is never silently dropped and never emitted as content; the collect-all enumeration lists every instance with identical per-instance verdicts. | Golden adversarial + unit | F-4, DM-2, DEC-1, DEC-2 |
| AC-F4-2 | **Given** an `ac:image` with `ri:filename="marksync-mermaid-<hash>.svg"` (alt "Mermaid diagram"), **when** converted, **then** an informational `marksync-synthetic-artifact` diagnostic is reported, the image is not emitted as content, and conversion is not blocked. | Golden + unit | F-3, F-4, DM-2, DEC-1 |
| AC-F5-1 | **Given** any corpus-A fixture, **when** normalized, **then** `normalize(md)` is deterministic and idempotent (`N(N(md)) === N(md)`); and **given** canonical Storage, **when** reverse-converted then normalized, `N(reverse(storage)) === reverse(storage)` (canonical output is a fixed point). | Unit + golden | F-5, DM-3, DEC-3 |
| AC-F6-1 | **Given** the completed change, **when** the CLI surface and existing suites are inspected, **then** 0 new commands/flags/output changes exist, all existing tiers (unit/integration/golden/e2e-mock/BDD) are green, and the 33 forward golden pairs pass unmodified. | All existing tiers | F-6, DM-1, NG-1 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single feature PR to `main`; no feature flag, no migration, no config change — library-only, no user-facing surface until E2/E3 consume it.
- Version bumped 0.8.2 → 0.9.0 at merge (DEC-5); next tag-triggered binary release picks it up (no release-process change).
- Downstream coordination: E2 (resolve) and E3 (import) specs bind to DM-1/DM-2; OQ-2/OQ-3 answers are requested inputs to their planning, not blockers here.
- Communication: feature-line note "feat(reverse): Storage Format → Markdown converter (canonical subset, 100% golden round-trip, C-4 diagnostics) — MS-0003 E1 foundation".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted state touched (lock/cache/config unchanged). Deliberate negative constraint: the reverse converter never synthesizes front-matter, UUIDs, or lock entries — metadata assignment on adoption is E3 `import`'s explicit, user-initiated step (PDR-0002 ownership model).

## 20. PRIVACY / COMPLIANCE REVIEW

- Net privacy improvement on the path to E2/E3: the provenance panel (which carries commit SHA, branch, sync timestamp) is stripped before conversion, so Git metadata never flows into reverse-converted Markdown or future diffs.
- No personal-data handling changes; no new data leaves the machine (zero network I/O, NFR-5).
- Diagnostic payloads carry codes/construct identity/locations, not content echoes — keeping the INV-SEC-1/NFR-SEC-1 redaction posture trivially intact.

## 21. SECURITY REVIEW HIGHLIGHTS

- Input is semi-trusted Storage (returned by the Confluence API; was sanitizer-checked on write). Parsed in-process with a standards-based parser; parsed content is never executed; zero egress (NFR-5).
- Regex-based Storage parsing is prohibited (NFR-4) — eliminating the class of parser-confusion/injection bugs regex extraction invites on namespaced XML with CDATA and entity edge cases.
- New parser dependency (if added, OQ-1) passes the NFR-SEC-4 supply-chain baseline (SBOM + vuln/license scans on release; push scans in CI).
- No secrets surface: the converter handles no credentials and emits no logs.

## 22. MAINTENANCE & OPERATIONS IMPACT

- Permanent: the canonical-subset mirror now has two sides that must evolve together. The round-trip harness makes divergence loud: any forward or reverse change that breaks `reverse(forward(md)) === normalize(md)` fails CI — the roadmap-mandated re-run on subset expansion is mechanical (AC-F2-1), not procedural.
- The Storage-side adversarial set grows with each newly discovered real-corpus construct class (pilot conflict-class taxonomy feeds it via E2/E3); each entry pins a diagnostic code.
- Diagnostic-code registry is a stable public-ish surface (E2/E3 render codes to users) — codes, once shipped, must not be renamed; additions only.
- No operational surface (no CLI, no network, no state) — zero runbook impact.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Storage Format | Confluence's XHTML-based page-body representation with `ac:`/`ri:` namespaced elements; MarkSync's write target (ADR-0005). |
| Reverse converter | Storage Format → Markdown conversion — the mirror of the forward (Markdown→Storage) pipeline; this change's deliverable. |
| Canonical GFM subset | The remark-gfm-reachable construct set the forward converter supports (ADR-0005); exactly mirrored here — no expansion in this change. |
| Canonical Markdown emission form | The normative output form of the reverse serializer and the shared normalizer (DEC-3, Appendix B) — ATX headings, `-` bullets, `1.` ordered, `*`/`**` emphasis, backtick fences, inline link/image form, blank-line block separation. |
| Round-trip fidelity | `reverse(forward(md))` byte-equals `normalize(md)` for canonical fixtures — the roadmap's 100% guardrail. |
| Normalizer (`normalize` / N) | Fixture `.md` → forward parse stage (incl. annotation stripping) → canonical-form serialization; the round-trip comparison basis. |
| Provenance panel | Visible `{info}` macro appended post-render to every published page; identified by the `marksync:provenance-panel` marker comment; stripped on reverse (DEC-6). |
| Mermaid policies | `code` (default): source stored as a `language=mermaid` code macro — round-trips to a fence. `render` (opt-in): fence replaced by a synthetic `marksync-mermaid-<hash>.svg` attachment image — source not recoverable; informational diagnostic (DEC-1). |
| K1 attributes | `ac:schema-version` / `ac:macro-id` — auto-filled by Confluence on read-back (ADR-0005 spike K1); ignored on reverse. |
| Blocking / informational diagnostics | The two reverse diagnostic classes (DEC-1): `unsupported-construct` fails conversion (C-4); `marksync-synthetic-artifact` is reported alongside success. |
| Corpus A / Corpus B | Round-trip-equality fixtures vs annotation/defensive fixtures with explicit expectations (DEC-7). |
| GH-31 adversarial corpus | Category taxonomy + fixtures regression-locking the forward no-silent-drop guarantee; extended here with Storage-side inputs for reverse diagnostics. |

## 24. APPENDICES

### Appendix A — Construct mapping mirror (authoritative forward reference: `renderStorage` visitor)

| Canonical construct | Forward Storage form (existing output) | Reverse behavior |
|---|---|---|
| Headings h1–h6 | `<h1>`…`<h6>` | `#`…`######` (ATX) |
| Paragraph | `<p>` | plain block, blank-line separated |
| Strong / emphasis / strikethrough | `<strong>` / `<em>` / `<del>` | `**` / `*` / `~~` |
| Inline code | `<code>` | backticks |
| Fenced code | `ac:structured-macro ac:name="code"` + `ac:parameter ac:name="language"` + `<ac:plain-text-body>` CDATA | backtick fence with language; CDATA (incl. split `]]>`) unescaped to literal bytes |
| Link | `<a href="…">text</a>` | `[text](url)` |
| Image (remote / attachment) | `<ac:image ac:alt>` + `<ri:url>` / `<ri:attachment ri:filename>` | `![alt](url)` / `![alt](filename)` |
| Lists (ul/ol, nested) | `<ul>`/`<ol>`/`<li>` | `-` / `1.`, nested indentation per canonical form |
| Task list | `<ac:task-list>`/`<ac:task>`/`<ac:task-status>`/`<ac:task-body>` | `- [ ]` / `- [x]` |
| Table | `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` | GFM pipe table |
| Blockquote | `<blockquote>` (block children) | `>` prefixed lines |
| Thematic break | `<hr/>` | `---` |
| Mermaid fence (`code` policy) | code macro, `language=mermaid` | ```mermaid fence (content round-trip) |
| Mermaid (`render` policy) | `ac:image` + `ri:attachment marksync-mermaid-<hash>.svg` (alt "Mermaid diagram") | informational diagnostic; not content (DEC-1) |
| Provenance panel | `ac:name="info"` macro containing `<!-- marksync:provenance-panel -->` | dropped entirely, no diagnostic (DEC-6) |
| K1 attributes | `ac:schema-version` / `ac:macro-id` (read-back only) | ignored (F-3d) |
| Anything else | non-canonical Storage element/macro | blocking diagnostic: stable code + construct + location (DEC-1/DEC-2) |

### Appendix B — Canonical Markdown emission form (DEC-3, normative)

- Headings: ATX (`#`…`######`); never setext.
- Unordered lists: `-` marker. Ordered lists: `1.` (single-digit dot form).
- Emphasis `*`; strong `**`; strikethrough `~~`.
- Inline code: backticks (extended runs where content contains backticks).
- Fenced code: backtick fences, language identifier when present; never tilde fences.
- Links `[text](url)`; images `![alt](src)` — never reference-style.
- Task items: `- [ ]` / `- [x]`.
- Thematic break: `---`.
- Blocks separated by exactly one blank line.
- Nested list indentation aligned to the parent item's content start (2 spaces under `-`, 3 under `1.`).
- Literal characters that would re-parse as structure are escaped per the standard remark-gfm stringifier rules; the form as a whole is byte-compatible with the repo's existing remark-based stringification defaults.
- The normalizer applies this form to fixture `.md` **after** the forward parse stage's non-rendering-annotation stripping (front-matter, comment-only HTML, link-reference comments — the documented GH-63/GH-77 carve-out), so corpus-B fixtures compare on content only.

### Appendix C — Evidence artifacts

- Ticket GH-92 (scope authority with PDR-0002); PM notes `chg-GH-92-pm-notes.yaml` (PM-DEC-1, PM-DEC-2, watch items).
- PDR-0002 (E1, C-4, guardrails); ADR-0005 (canonical subset, K1, PM-DEC-1 fidelity-bar precedent); roadmap MS-0003 §E1 + success metrics.
- Forward implementation read at intake: `src/infra/confluence/render/storage.ts`, `src/infra/confluence/provenance.ts`, `src/domain/markdown/unsupported.ts`, `src/domain/markdown/parse.ts`, `src/domain/mermaid/transform.ts`; corpus `tests/golden/fixtures/markdown/` (33 pairs, 2 classification sidecars, 2 Storage-only fixtures); `.ai/rules/testing-strategy.md` (tiers, over-mocking guardrail); `package.json` (remark stack; no declared XML parser).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-08-15 | spec-writer (GH-92) | Initial draft — reverse converter spec: canonical emission form (DEC-3), diagnostic taxonomy (DEC-1/DEC-2), corpus partition (DEC-7), tiering contract (DEC-4), version 0.9.0 (DEC-5). Pending DoR review. |

---

## AUTHORING GUIDELINES

- Authored from the GH-92 planning-session context (PM clarify_scope summary + `chg-GH-92-pm-notes.yaml`); scope authority = PDR-0002 + issue body (no story file exists yet — the ticket says one may be added under `doc/planning/milestones/MS-3/` later; if it lands with deltas, re-open this spec).
- All seven PM watch items resolved in-spec: normalization (DEC-3 + Appendix B), panel stripping (DEC-6), mermaid both policies (F-3, DEC-1), K1 attributes (F-3d, AC-F3-3), tier placement (DEC-4 — contract only, naming to plan), XML parsing (NFR-4, OQ-1), determinism (NFR-2).
- PM-DEC-1 (diagnostics in scope) is discharged as F-4 + DM-2 + AC-F4-1/AC-F4-2; PM-DEC-2 (no CLI) as F-6 + AC-F6-1.
- Grounded in the tree at `main @ 80065a4`: forward visitor, provenance panel builder + marker, mermaid transform, forward classifier, golden corpus (incl. the Storage-only and sidecar fixtures), package deps (no declared XML parser — hence OQ-1) all read at intake.
- The ticket's three ACs map to AC-F1-1 (round-trip 100%), AC-F1-2 (determinism), AC-F3-1/AC-F3-2 (panel + wrapper stripping); PM-DEC-1 adds AC-F4-1/AC-F4-2; watch items add AC-F3-3, AC-F5-1, AC-F2-1, AC-F6-1.
- AC tiers follow `.ai/rules/testing-strategy.md`: golden fixture (round-trip, determinism, stripping, adversarial classification), unit (diagnostic model, normalizer properties); no integration/e2e tier applies (no adapter/network surface).

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-92)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1–25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-6, DM-1..DM-4, NFR-1..NFR-5, RSK-1..RSK-6, DEC-1..DEC-7, OQ-1..OQ-3, AC-F1-1..AC-F6-1)
- [x] Acceptance criteria reference at least one F-/DM-/NFR-/DEC- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (tier-level placement contract only; no new-file paths, no step-by-step tasks; existing paths cited as grounding/authority, per repo precedent)
- [x] No content duplicated from linked docs (PDR/ADR/watch items synthesized, not restated)
- [x] Front matter validates per front-matter_rules
