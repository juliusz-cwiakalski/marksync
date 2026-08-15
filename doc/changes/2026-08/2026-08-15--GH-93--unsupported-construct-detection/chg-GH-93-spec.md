---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-93
  type: feat
  status: Proposed
  slug: unsupported-construct-detection
  title: "feat: complete unsupported-construct detection — granular stable diagnostic codes + page locations (PDR-0002 C-4)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0003, feature, priority:high, reverse-conversion, E1]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [reverse converter library (GH-92 baseline — classifier, parser, diagnostics model), reverse classification runner + storage-side adversarial set (GH-92), GH-31 adversarial corpus + category inventory, golden round-trip corpus (corpus A + forward golden pairs)]
    external: [Confluence Cloud Storage Format (read-back attribute surface per ADR-0005 spike K1)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Close every detection gap in the GH-92 reverse diagnostics so that no non-canonical Storage construct — foreign macro, complex layout, exotic attribute, unknown or misplaced element — is ever silently dropped (PDR-0002 C-4), by adding granular stable diagnostic codes and page + element locations, verified over a storage-side adversarial corpus aligned with the GH-31 classification.

## 1. SUMMARY

GH-92 delivered the reverse converter (Storage Format → Markdown) with a two-class diagnostic taxonomy, but detection is incomplete against PDR-0002 C-4 and ticket GH-93: non-canonical **attributes** on otherwise-canonical elements (the ticket's "exotic table attributes": `colspan`, `rowspan`, `style`, `class`, `data-table-width`, …) and non-`ac:task` children of `ac:task-list` pass through the classifier and are **silently dropped** at serialization; the `ac:layout` family is detected only through the coarse generic arm with no dedicated classification or fixture; and diagnostics carry element `line:column` only — no page identity (AC-3), despite `ReverseOptions.sourcePath` being reserved-but-unused for exactly that purpose. This change completes detection: a granular per-class diagnostic-code set (additions-only in the `REVERSE_CODES` registry, which retains the existing codes), page + element location on every diagnostic, and a storage-side adversarial corpus aligned 12/12 with the GH-31 category classification — including zero-diagnostic canonical counterparts as the false-positive guard. Library-only: zero CLI delta; the `resolve` (E2) and `import` (E3) flows remain the consumers.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **Baseline (GH-92, merged, v0.9.0):** the reverse contract `reverseStorage` (fast-fail) / `reverseStorageCollectAll` (enumeration) in the reverse classifier (`src/infra/confluence/parse/reverse.ts`) parses Storage → HAST (saxes, TDR-0012), classifies each node (canonical / unsupported / synthetic artifact), maps recognized constructs to content HAST, and serializes via the canonical serializer (TDR-0013). Fast-fail/collect-all parity holds per instance; determinism is snapshot-locked.
- **Diagnostics model:** `REVERSE_CODES` (`src/domain/markdown/reverse-diagnostics.ts`) is an **additions-only, stable-across-releases** registry with exactly three codes today — `reverse/unsupported-construct` (blocking), `marksync/synthetic-artifact` (informational), `reverse/parse-error` (malformed input). Diagnostic payloads carry `code` + `construct` + `location: {line, column}` — element position only, no page identity. `ReverseError` is a standalone union, deliberately **not** a `MarkSyncError` kind (0 CLI delta).
- **Classifier structure:** recognized macros (`code`, `task-list`) map canonically; the provenance panel is stripped by the parser (no diagnostic); K1 attributes (`ac:schema-version` / `ac:macro-id`) are silently dropped (ADR-0005-sanctioned); the canonical-element allowlist (h1–h6, p, strong, em, del, code, a, img, ul, ol, li, table, thead, tbody, tr, td, th, blockquote, hr, pre) **passes elements through without inspecting their attributes**; everything else falls to one generic unknown-element arm emitting the single coarse `reverse/unsupported-construct` code. `ReverseOptions.sourcePath` is documented as "reserved for future diagnostic provenance context" and is unused.
- **Adversarial corpora:** the Markdown-side corpus (GH-31, `tests/adversarial/`, 12 fixtures) regression-locks the *forward* classifier with a 6-category inventory (nested tables; ≥3 distinct macro/app classes; emoji; long page; mixed task/regular lists; raw HTML block+inline). The Storage-side set (GH-92, `tests/adversarial-storage/`, 9 fixtures + sidecars) regression-locks reverse diagnostics via the classification runner (`tests/golden/adversarial/reverse-classification-runner.test.ts`): unknown macros (jira/toc/expand), non-panel info macro, app/gliffy, nested tables, raw-HTML block (`div`), multi-instance, malformed — covering **7 of the 12** GH-31 fixture categories, with no counterpart for emoji, long-page, macro-code, mixed-task-regular-lists, or raw-html-inline, and **no fixture at all** for complex layouts or exotic attributes.
- **Guardrails that must survive:** corpus-A round-trip byte-equality (26 fixtures: `reverse(forward(md)) === normalize(md)`), the 33 forward golden pairs unmodified, the partition-manifest CI tripwire, and the K1 carve-out (silently dropped, never a diagnostic).

### 2.2 Pain Points / Gaps

- **(a) Silent attribute drops (violates AC-2 / C-4):** non-canonical attributes on canonical elements — colspan/rowspan/style/class/data-table-width on table cells, user-set image properties (`ac:width`, `ac:align`, …) — are not inspected by the classifier and vanish at serialization with **zero diagnostics**. GFM cannot represent them; the loss is silent.
- **(b) Silent task-list child drops:** the task-list classification filters children to `ac:task` only; any other child element inside `ac:task-list` is discarded without a diagnostic.
- **(c) Coarse layout detection, no coverage:** `ac:layout` / `ac:layout-section` / `ac:layout-cell` fall into the generic unknown-element arm — detected, but with no dedicated construct classification, no per-class code, and **no fixture** in any corpus (an untested detection path).
- **(d) No page identity (violates AC-3):** diagnostics carry element `{line, column}` only. A library that takes a body string cannot invent a page identity — but the contract already reserves a provenance hook (`sourcePath`) and never threads it; E2/E3 will surface diagnostics across hundreds of pages and need "which page" per diagnostic.
- **(e) Coarse single code limits consumers:** one `reverse/unsupported-construct` code covers unknown macros, unknown elements, and structural violations alike; E2/E3 (and any user-facing error catalog) would have to string-match the free-form `construct` field to distinguish "remove this macro" from "simplify this table" — the construct-string format is display-oriented and not a declared stable contract.
- **(f) Corpus alignment undefined:** the ticket requires reusing "the GH-31 adversarial corpus classification as the detection test bed", but GH-31 is Markdown-side; the storage-side set covers 7/12 categories; what "aligned" means (mirror fixtures? shared categories? per-direction expectations?) is unspecified.

## 3. PROBLEM STATEMENT

Because the GH-92 reverse classifier inspects only element identity — not attributes, not task-list child composition — non-canonical attributes and misplaced children are silently dropped and complex layouts are only coarsely classified, the MS-0003 `resolve` and `import` flows cannot trust reverse diagnostics as the complete C-4 foundation: users adopting an existing corpus would lose constructs with no diagnostic to act on, cannot be told which page a diagnostic belongs to, and cannot route resolution by construct class — defeating PDR-0002 C-4's "stable diagnostic codes with locations and an explicit resolution path" for exactly the constructs (layouts, rich tables) real Confluence pages contain.

## 4. GOALS

- **G-1**: Complete detection — every non-canonical Storage construct (foreign/unknown macro, complex layout, exotic attribute, unknown element, structurally misplaced element) produces a diagnostic; zero silent drops over the aligned adversarial corpus.
- **G-2**: Granular, stable per-class diagnostic codes aligned to the ticket's four detection classes — additive to the `REVERSE_CODES` registry, stable across releases, machine-consumable by E2/E3 without parsing `construct` strings.
- **G-3**: Page + element location on every diagnostic (ticket AC-3): caller-supplied page context echoed into all diagnostic arms, without breaking existing callers.
- **G-4**: A precisely defined GH-31↔storage corpus alignment (12/12 categories) with the classification runner extended to enforce it — including zero-diagnostic canonical counterparts as the false-positive guard.
- **G-5**: Preservation guarantees: K1 carve-out intact, corpus-A round-trip byte-equality unchanged, forward golden fixtures and forward pipeline untouched, zero CLI delta.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Non-canonical construct instances in the aligned corpus detected with a stable code | 100% — 0 unclassified instances |
| Silent drops over the aligned corpus (elements or attributes) | 0 |
| GH-31 categories with storage-side counterparts (pinned expectations) | 12/12 |
| New detection classes with ≥1 fixture + sidecar (complex layout, exotic attribute, task-list child, page context) | 4/4 |
| New diagnostics emitted over canonical inputs (corpus A 26 + forward golden 33 + K1 variants) | 0 |
| Corpus-A round-trip byte-equality | 100% (unchanged from GH-92) |
| New CLI commands/flags/output changes | 0 |

### 4.2 Non-Goals

- **NG-1**: No CLI surface — no command, flag, output envelope, or exit-code change; `ReverseError` stays a standalone union, not a `MarkSyncError` kind.
- **NG-2**: No `resolve`/`import` (E2/E3) wiring — diffing, patch generation, adoption UX, and diagnostic *presentation* are their changes; GH-93 only makes the payload sufficient.
- **NG-3**: No forward-pipeline change and no forward fixture modification (regression tripwire).
- **NG-4**: No canonical-subset expansion — `ac:layout` becomes *detected*, not *supported*; ADR-0005's subset is unchanged.
- **NG-5**: No adopt-verbatim escape hatch or resolution-path UX (PDR-0002 unresolved question; owned by E2/E3).
- **NG-6**: No partial/suppressed-construct conversion mode (still deferred with E2/E3, per GH-92 DEC-2).
- **NG-7**: No parser-replacement or new third-party dependency — detection rides the existing saxes parse (attribute data is already on the HAST properties).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Granular per-class construct classification (unknown macro / complex layout / unknown element / structural fallback) | The ticket names four detection classes; C-4's resolution path is class-dependent, so the *code* must discriminate classes — not just the free-form construct string. |
| F-2 | Attribute-level detection on canonical elements (exotic attributes, incl. the ticket's "exotic table attributes") | The silent-drop gap (a): GFM cannot represent these attributes; the loss must become a diagnostic, never silent. |
| F-3 | Task-list integrity — non-`ac:task` children of `ac:task-list` are diagnosed, not dropped | The silent-drop gap (b): the current child filter discards content without a diagnostic. |
| F-4 | Page + element location context on every diagnostic | Ticket AC-3: E2/E3 surface diagnostics across corpora; each must carry the page it belongs to alongside the element `line:column`. |
| F-5 | Stable diagnostic-code registry evolution (additions-only; normative code-assignment map) | Codes are a public-ish contract (GH-92 §22: additions-only, never renamed); GH-93 is the last change before E2/E3 bind — the taxonomy must be right and frozen. |
| F-6 | GH-31-aligned storage-side adversarial corpus + runner extension | Ticket AC-1: "reuse the GH-31 adversarial corpus classification as the detection test bed" — alignment defined precisely (DEC-3), enforced mechanically by the category inventory. |
| F-7 | Preservation guarantees + library-only boundary | K1 carve-out (ADR-0005), corpus-A round-trip byte-equality, forward fixtures untouched, zero CLI delta — the GH-92 guardrails this change must not erode. |

### 5.1 Capability Details

**F-1 — Granular classification.** The classifier's outcome per non-canonical construct becomes class-specific (code-assignment map normative in Appendix A):

- **`reverse/unknown-macro`** — any `ac:structured-macro` outside the recognized set (`code`, `task-list`, panel-marker info macro), i.e. foreign/unknown macros including the non-panel info macro and app/gliffy-class macros. Construct identity keeps the macro name form; the macro's own children are not separately diagnosed (the macro is one construct — existing behavior, now under its own code).
- **`reverse/complex-layout`** — the `ac:layout` / `ac:layout-section` / `ac:layout-cell` family, classified at the **outermost** layout element as exactly **one** blocking diagnostic per layout tree (cells and sections are part of the construct, not separate violations).
- **`reverse/unknown-element`** — non-canonical elements (e.g. `div`, `span`, `ac:*` elements outside the canonical set) wherever they appear, including as children of `ac:task-list` (F-3).
- **`reverse/unsupported-construct`** — retained in the registry (additions-only — never removed) as the **structural fallback**: canonical elements in non-canonical *positions or compositions* the subset cannot represent (today: table nested inside `td`/`th`; after this change: non-`ac:task` children of `ac:task-list` that are individually canonical). Generic non-canonical constructs not matching a specific class also land here.

All four detections are **blocking** (conversion fails fast) — severity classes remain exactly the two from GH-92 DEC-1 (blocking / informational); granularity lives in the code, not in new severities. The informational `marksync/synthetic-artifact` and the parse-error arm are unchanged in semantics.

**F-2 — Attribute-level detection.** Detection gains an attribute pass over every canonical element: the canonical attribute allowlist is defined by the **mirror principle** — an attribute is canonical on an element iff the forward converter emits it for that element (Appendix C). Anything beyond the allowlist — and beyond the K1 carve-out — produces one **blocking `reverse/unsupported-attribute`** diagnostic per element, with: the element's location (element-start `line:column`; attribute names are enumerated in the construct identity — attribute-level byte positions are not required), the offending attribute names listed **sorted and deduplicated** (determinism), and the element's construct identity. Severity rationale: converting with the attribute dropped would be silent degradation (ADR-0005 "do not silently degrade"); blocking matches the GH-92 fail-fast precedent. **K1 carve-out survives verbatim**: `ac:schema-version` / `ac:macro-id` on `ac:structured-macro` remain silently dropped, never diagnostics; on any other element they are non-canonical attributes (they are sanctioned on macros only, per ADR-0005 spike K1). Structural (pretty-print) whitespace and the panel strip remain silent (GH-92 DEC-6).

**F-3 — Task-list integrity.** Every child of `ac:task-list` that is not an `ac:task` produces a blocking diagnostic: non-canonical child element types classify as `reverse/unknown-element`; individually-canonical children misplaced in the task-list classify under the structural fallback (`reverse/unsupported-construct`) — in both cases the child is located and never silently dropped. Canonical task lists (the mixed task/regular-lists category) continue to convert with zero diagnostics.

**F-4 — Page + element location.** The reverse options gain an optional, caller-supplied **page context** (`pageId?`, `title?`, `sourcePath?` — all optional, all caller-provided; the library never extracts identity from the body). When present, it is echoed **verbatim** into every diagnostic payload — blocking, informational, and parse-error arms alike — alongside the existing element `line:column`. When absent, the field is omitted entirely and diagnostic output is shape- and byte-identical to the context-free GH-92 form (existing callers and sidecars unaffected unless they opt in). The reserved `sourcePath` option is absorbed as a convenience that populates the page context's `sourcePath` when no explicit page context is given. Signature changes are **optional-parameters only** — `reverseStorage(body, opts?)` / `reverseStorageCollectAll(body, opts?)` — with no breaking change to any existing call.

**F-5 — Registry evolution.** `REVERSE_CODES` gains the four new codes; no existing code is removed or renamed (additions-only). Emitted-code *assignment* changes for two existing classes (unknown macros and unknown elements move from the coarse code to their own) — permissible now because the registry's stability promise protects consumers, and **no consumer exists yet** (E2/E3 unbuilt; nothing in-tree renders codes); after E2/E3 bind, code re-assignment becomes forbidden. The assignment map (Appendix A) is normative and unit-pinned.

**F-6 — Aligned corpus.** The storage-side adversarial set is extended to a GH-31-aligned corpus (alignment map normative in Appendix B): every GH-31 category acquires a storage-side counterpart fixture with a pinned sidecar expectation — including the **supported** categories (emoji, long-page, macro-code, mixed task/regular lists), whose counterparts pin **zero-diagnostic** conversions as the false-positive guard, and raw-html-inline, whose storage-side expectation differs by direction (documented, not assumed symmetric). New fixtures cover the ticket's added classes: complex layouts, exotic table attributes (incl. multi-attribute single elements), task-list misplaced children, and at least one fixture exercising page context (plus the parse-error fixture pinning the page echo). The runner's category-coverage inventory is extended to require all of the above; the PII grep-audit covers the new fixtures; sidecar deep-equality, fast-fail/collect-all parity, and determinism assertions apply unchanged.

**F-7 — Preservation.** Zero new diagnostics over canonical inputs (corpus A 26, forward golden 33, K1 variants); corpus-A round-trip byte-equality unchanged; the partition manifest and snapshot disciplines untouched; zero CLI delta; all pre-existing tiers green.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Attribute drop becomes diagnostic (the C-4 closure)
  Storage: canonical table with <td colspan="2" style="…"> (GFM-irrepresentable attributes)
  → attribute pass finds attributes beyond the mirror allowlist (Appendix C), not K1
  → blocking reverse/unsupported-attribute { construct names element + sorted attrs,
    location = element start, page = caller context } → conversion fails fast
  → collect-all enumerates every offending element with identical per-instance verdicts

Flow 2 — Complex layout detection
  Storage: <ac:layout><ac:layout-section><ac:layout-cell>… (any depth)
  → classified at the outermost ac:layout as ONE construct
  → blocking reverse/complex-layout { location = layout start, page } — cells/sections
    are not separately diagnosed

Flow 3 — Page-context threading (the shape E2/E3 will drive)
  Caller: reverseStorage(body, { page: { pageId: "12345", title: "Runbook" } })
  → every diagnostic (blocking, informational, parse-error) echoes the page verbatim
  → no page context given → field omitted → output identical to context-free GH-92 form

Flow 4 — Aligned-corpus verification (CI, every push)
  for each storage-side fixture: collect-all diagnostics deep-equal the sidecar
  (code, construct, location, page when provided) — supported-category counterparts
  pin zero-diagnostic conversions; inventory asserts 12/12 GH-31 categories + the
  new classes; PII audit over the extended set

Flow 5 — False-positive guard (canonical preservation)
  corpus-A + forward golden + K1-variant fixtures → reverse(forward(md))
  → 0 new diagnostics (attribute pass silent on the mirror vocabulary)
  → byte-equality with normalize(md) unchanged
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Classifier extension: granular per-class construct classification (F-1), attribute-level detection with the mirror allowlist (F-2), task-list child integrity (F-3).
- Diagnostics model extension: four new `REVERSE_CODES` entries; page-context field on all diagnostic arms; optional-parameters-only contract extension (F-4, F-5).
- Storage-side adversarial corpus extension to GH-31 alignment (12/12) + new-class fixtures + runner category-inventory extension + sidecar schema extension (F-6).
- Re-pinning of the affected existing storage-side sidecars (unknown-macro and unknown-element classes move to their own codes; multi-instance and malformed fixtures unchanged in semantics).
- Preservation harness assertions: zero-diagnostic sweeps over canonical corpora; K1 carve-out re-assertion (F-7).
- Version bump 0.9.0 → 0.10.0 (DEC-7).
- Doc impact (phase 7, @doc-syncer): reverse-conversion feature spec + test spec updated with the granular taxonomy, page context, and the alignment map.

### 7.2 Out of Scope

- [OUT] Any CLI command/flag/output/exit-code change; `ReverseError` remains a standalone union (NG-1).
- [OUT] `resolve`/`import` flows, diffing, patches, lock/state writes, Git operations, diagnostic presentation UX (NG-2).
- [OUT] Forward pipeline or forward fixture changes (NG-3).
- [OUT] Canonical-subset expansion — layouts are detected, not converted (NG-4).
- [OUT] Adopt-verbatim escape hatch / resolution-path UX (NG-5).
- [OUT] Partial/suppressed-construct conversion mode (NG-6).
- [OUT] New parser dependency or parser replacement — existing parse substrate supplies attributes and positions (NG-7).
- [OUT] Localizing/validating codes against real partner corpora (E3 evidence; the corpus here is synthetic per GH-31 precedent).

### 7.3 Deferred / Maybe-Later

- Attribute-level byte positions (vs element-start location + enumerated names) if E2/E3 presentation proves element-level insufficient.
- User-facing error-catalog publication of the code registry (with E2/E3 UX).
- Confluence-emitted attribute surface beyond K1 evidence (e.g. editor-injected attributes discovered during the pilot) — feeds the corpus via the PDR-0002 revisit trigger, not this change.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no HTTP or CLI surface. Library-level contract only (DM-1/DM-2).

### 8.2 Events / Messages

N/A — none produced or consumed.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | Reverse contract (options extension) | **Additive** — optional caller-supplied page context (`pageId?`, `title?`, `sourcePath?`); reserved `sourcePath` absorbed as convenience. Signatures gain optional parameters only; existing calls compile and behave identically. |
| DM-2 | Diagnostic payload extension | **Additive** — every diagnostic arm (blocking, informational, parse-error) may carry the echoed page context (omitted when not supplied); the blocking class discriminator widens to the granular codes; `construct` + element `location` unchanged in meaning. No content echoes (NFR-SEC-1 posture): page context is caller-supplied structured metadata. |
| DM-3 | `REVERSE_CODES` registry | **Additions-only growth** — four new codes (Appendix A); zero removals/renames; emitted-assignment change for two existing classes (DEC-1); assignment map normative and unit-pinned. |
| DM-4 | Adversarial corpus + sidecar schema | **Extended** — storage-side set grows to GH-31 alignment (12/12) + new-class fixtures; sidecar entries pin `{ code, construct, location, page? }` per instance; category inventory requires the new classes; PII audit covers the additions. |

No persisted data (lock, cache, config) is touched.

### 8.4 External Integrations

| Integration | Change | Contract |
|-------------|--------|----------|
| Confluence Storage Format (read side) | None | Attribute surface honored: canonical mirror vocabulary (Appendix C) + K1 carve-out (`ac:schema-version`/`ac:macro-id` on macros, silently dropped per ADR-0005); all other read-back attributes are legitimate diagnostic targets. Zero API calls. |

### 8.5 Backward Compatibility

- **Source-compatible, behavior-extended:** existing calls without options produce byte-identical Markdown and shape-identical diagnostics **except** the two re-assigned code classes (unknown macros, unknown elements) — an intentional, consumerless-at-delivery contract correction (DEC-1); no in-tree consumer renders codes.
- Existing test sidecars affected by the re-assignment are re-pinned **in this change** (reviewed re-baseline; not a silent snapshot regen).
- Forward pipeline, forward goldens, CLI, lock/state formats: untouched.
- Version impact: **minor** (0.9.0 → 0.10.0, DEC-7) — additive capability + contract correction on a consumerless surface; not a patch (emitted codes change), not a major (nothing removed; no consumer breaks).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Detection completeness (C-4) | 100% of non-canonical elements **and attributes** in the aligned corpus produce diagnostics; 0 silent drops; 0 unclassified non-canonical instances |
| NFR-2 | Determinism | Same Storage + same options → deep-equal diagnostics across repeated conversions in-process and across runs; attribute enumerations sorted + deduplicated; page echo verbatim (no synthesis) |
| NFR-3 | No false positives on canonical input | 0 new diagnostics over corpus A (26) + forward golden (33) + K1 variants; corpus-A round-trip byte-equality 100% (unchanged); forward fixtures byte-unmodified |
| NFR-4 | Code stability | Registry additions-only (4 new codes, 0 removed/renamed); every code value unit-pinned; assignment map (Appendix A) normative; re-assignment after E2/E3 bind forbidden |
| NFR-5 | Performance | Attribute/classification passes add no material overhead: ≤ 200 ms p95 per page Storage→Markdown on the reference corpus (informational, mirrors NFR-PERF-5); extended adversarial corpus CI runtime stays within the golden-tier budget (informational) |
| NFR-6 | Payload hygiene | Diagnostics carry codes/construct/location/page only — no element text, no attribute **values** (names only), no content echoes; page context is caller-supplied metadata, never extracted from the body |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

None (library-only, zero runtime surface). Observability remains the harness: the extended classification runner + category inventory + PII audit run in CI on every push, so detection regressions (missed constructs, false positives, code drift) surface at review time. Diagnostic objects stay structured (code + construct + location + page?) for deterministic E2/E3 rendering.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Mirror allowlist too strict for real read-backs — Confluence/users emit attributes beyond K1 evidence → canonical-looking pages block | H | M | Allowlist is exactly the forward emission vocabulary (structurally correct by the mirror principle); zero-diagnostic sweeps pin it; partner-corpus evidence lands with E3; PDR-0002 revisit trigger (hold `resolve`, expand diagnostics) already defined | M |
| RSK-2 | Code re-assignment churn invalidates in-tree expectations (sidecars, snapshots, unit pins) | M | M | Contained, reviewed re-baseline inside this change; verified at intake that no in-tree consumer renders codes; re-assignment window closes at E2/E3 bind (DEC-1) — documented as the last cheap moment | L |
| RSK-3 | Granular taxonomy wrong-grained (a class proves too coarse/fine for E2/E3 UX) | M | L | Additions-only registry absorbs future refinement; structural fallback keeps a home for the unclassifiable; OQ-1 routes confirmation through @decision-advisor before DoR | L |
| RSK-4 | Page-context field breaks sidecar deep-equality or determinism | M | L | Field omitted when absent (context-free output byte-identical); sidecars pin `page` explicitly where exercised; verbatim-echo rule excludes synthesis | L |
| RSK-5 | Diagnostic storms — attribute diagnostics per element on large rich tables flood collect-all | M | M | One aggregated diagnostic per element (sorted names); whole-element constructs (macros, layouts) emit one diagnostic per construct; corpus includes a multi-attribute single-element fixture to pin aggregation | L |
| RSK-6 | Alignment over-fit — GH-31 categories are forward-semantics; storage counterparts silently diverge in expected outcome | M | M | Alignment map (Appendix B) records each category's storage-side expectation explicitly, including direction-dependent outcomes (raw-html-inline) and zero-diagnostic canonical counterparts; inventory enforces the map mechanically | L |
| RSK-7 | Layout classification double-reports (layout + inner constructs) confusing fast-fail ordering | L | M | Outermost-layout single-diagnostic rule (F-1/DEC-4); sidecar pins exactly one diagnostic per layout tree | L |

## 12. ASSUMPTIONS

- ADR-0005 spike K1 remains authoritative: Confluence auto-fills only `ac:schema-version`/`ac:macro-id` (on macros) + trivial self-closing whitespace; every other attribute on a read-back page was user/editor-authored and is a legitimate diagnostic target.
- The forward emission vocabulary (Appendix C) is complete for the canonical subset — by construction it is the mirror allowlist; the zero-diagnostic sweeps pin it.
- No E2/E3 consumer of the codes exists at delivery time (verified in-tree at intake); therefore emitted-code re-assignment breaks no one.
- The `ac:layout` family is entirely outside the canonical subset (ADR-0005) and is treated as one construct per layout tree.
- Emoji/Unicode passthrough remains canonical (GH-31 supported category) — zero-diagnostic counterparts are valid expectations.
- Scope authority is PDR-0002 C-4 + issue #93; the story file does not exist yet — if it lands with deltas, this spec re-opens.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-92 reverse converter library (classifier, parser, diagnostics model, runner) | Baseline; extended, not replaced |
| Depends on | GH-31 adversarial corpus + category classification | Alignment source of truth (Appendix B) |
| Depends on | PDR-0002 C-4; ADR-0005 (subset discipline, K1) | Authority documents; no re-decision |
| Blocks | MS3-E2-S3, MS3-E3-S1 (per ticket) | C-4 foundation for resolve/import diagnostics |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Confirm the granular code taxonomy (4 new codes + structural fallback; two emitted-code re-assignments) as the frozen pre-E2/E3 contract. | Precedent-setting on the public-ish, additions-only `REVERSE_CODES` registry (GH-92 §22). Provisionally decided (DEC-1) with full alternatives analysis in Appendix A; independent confirmation required before DoR freeze. | Resolved 2026-08-15 — [TDR-0014](../../../decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md) confirms DEC-1 (Alt 3) as the frozen pre-E2/E3 contract, with two clarifying pins: orphaned layout-family elements classify as one `reverse/complex-layout` construct at the outermost family element present; consumers bind to `code` strings (never `construct` text or `class` labels). |
| OQ-2 | Attribute-diagnostic location granularity: element-start + enumerated names (this spec's minimum) vs attribute-level byte positions (requires parser position extension). | Element-level is sufficient for E2/E3 "go to the element" UX; attribute positions are a nicety. Plan latitude; do not block on it. | Resolved for this change (element-level); revisit with E2/E3 |
| OQ-3 | Version bump 0.9.0 → 0.10.0 (minor) vs 0.9.1 (patch). | Emitted-code re-assignment argues minor (DEC-7); PM confirms at DoR. | Resolved (DoR iter-1, PM-confirmed): minor |
| OQ-4 | Should the informational `marksync-synthetic-artifact` diagnostic also echo page context? | This spec says yes (uniform payload, DM-2) — zero extra cost, consistent E2/E3 rendering. | Provisional: yes (uniform) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Granular per-class codes: add `reverse/unknown-macro`, `reverse/complex-layout`, `reverse/unsupported-attribute`, `reverse/unknown-element`; **retain** `reverse/unsupported-construct` as the structural fallback (nested tables, misplaced canonical children, unclassifiable constructs). Two emitted-code re-assignments (unknown macros, unknown elements) happen now. | PDR-0002's metric is "100% of known **classes** emit stable diagnostic codes"; the ticket enumerates four detection classes; E2/E3 need machine-consumable class discrimination (the `construct` string is display-oriented, not a declared stable contract). The registry is additions-only — re-assignment is forbidden once consumers bind; GH-93 is the last consumerless change (verified in-tree), i.e. the last cheap moment to correct the taxonomy. Alternatives analyzed in Appendix A. **Confirmed by [TDR-0014](../../../decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md)** (OQ-1 resolved 2026-08-15), incl. the consumer-binding rule: route on `code` strings. | 2026-08-15 |
| DEC-2 | Page context = optional caller-supplied `{pageId?, title?, sourcePath?}` echoed verbatim into **all** diagnostic arms; omitted when absent; reserved `sourcePath` absorbed as convenience; optional-parameters-only signature growth. | A body-string library cannot invent page identity — the caller (E2/E3, which always knows pageId/title) supplies it; echo-verbatim keeps the library pure and deterministic (no synthesis); omit-when-absent keeps context-free output byte-identical to GH-92 (existing callers, sidecars, snapshots unaffected); uniform echo across arms gives E2/E3 one rendering path. | 2026-08-15 |
| DEC-3 | Corpus alignment (Appendix B): every GH-31 category acquires a storage-side counterpart with a pinned expectation; supported categories pin **zero-diagnostic** conversions (false-positive guard); direction-dependent outcomes are documented, not assumed symmetric; the ticket's added classes (complex layout, exotic attributes, task-list children, page context) extend the corpus and the runner inventory beyond GH-31. | "Reuse the GH-31 classification" is only testable with a precise map; supported categories are as important as unsupported ones (detection completeness includes not over-detecting); the ticket's classes have no GH-31 counterpart and must not be dropped from the inventory. | 2026-08-15 |
| DEC-4 | Layout family classifies as one construct at the outermost `ac:layout` (single `reverse/complex-layout` diagnostic per layout tree; sections/cells not separately diagnosed). | A layout is one user-perceived construct; per-cell diagnostics are noise (RSK-5/RSK-7), complicate fast-fail ordering, and add no resolution value — the user removes or flattens the whole layout. Mirrors the macro precedent (macro children not separately diagnosed). | 2026-08-15 |
| DEC-5 | Attribute detection: mirror-principle allowlist (Appendix C); one aggregated blocking `reverse/unsupported-attribute` diagnostic per element with sorted, deduplicated attribute **names** (never values); element-start location; K1 carve-out confined to `ac:schema-version`/`ac:macro-id` on `ac:structured-macro`. | The mirror principle makes "canonical attribute" decidable without a new taxonomy (it is exactly what the forward converter emits); names-not-values honors payload hygiene (NFR-6 — attribute values can carry content); per-element aggregation bounds diagnostic storms; blocking severity follows "do not silently degrade" (converting minus attributes is silent loss). | 2026-08-15 |
| DEC-6 | Task-list closure: every non-`ac:task` child of `ac:task-list` produces a blocking diagnostic (non-canonical child types → `reverse/unknown-element`; canonical-but-misplaced children → structural fallback), located at the child. | Removes the silent drop with the existing class semantics — no new code needed; child-level location matches where the user must edit. | 2026-08-15 |
| DEC-7 | Version 0.9.0 → 0.10.0 (minor). | Additive capability + emitted-code re-assignment on a consumerless contract: more than a patch (behavior of a public-ish surface changes), less than a major (nothing removed; no consumer can break). Signals the contract freeze point before E2/E3. OQ-3 confirms at DoR. | 2026-08-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Reverse classifier (infra tier — construct/attribute classification, task-list handling) | Extended — granular classes, attribute pass, task-list child integrity |
| Reverse diagnostics model (domain tier — codes registry, payload shapes) | Extended (additive) — 4 new codes, page-context field on all arms (DM-2/DM-3) |
| Reverse contract entry points (options) | Extended (additive) — optional page context; optional params only (DM-1) |
| Storage-side adversarial corpus + classification runner + category inventory | Extended — GH-31 alignment (12/12), new-class fixtures, sidecar schema, PII-audit coverage (DM-4) |
| Golden round-trip harness | Extended assertions only — zero-diagnostic sweeps over canonical corpora (no fixture modifications) |
| Storage parser | Untouched unless a defect surfaces (attributes/positions already supplied) |
| Forward pipeline + forward fixtures | Unchanged — regression tripwire |
| CLI | Unchanged — zero surface delta |
| Docs (feature spec, test spec, NFR notes) | Updated in phase 7 (@doc-syncer) |
| Package version | 0.9.0 → 0.10.0 (DEC-7) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Tier | Linked |
|----|-----------|------|--------|
| AC-F1-1 | **Given** Storage containing a foreign/unknown macro (jira, toc, expand, non-panel info, gliffy/app class), **when** converted, **then** a blocking `reverse/unknown-macro` diagnostic is emitted with the macro construct identity and element `line:column`; the macro's children are not separately diagnosed; fast-fail and collect-all agree per instance. | Golden adversarial + unit | F-1, F-5, DM-2, DM-3 |
| AC-F1-2 | **Given** Storage containing an `ac:layout` tree (sections/cells at any depth), **when** converted, **then** exactly one blocking `reverse/complex-layout` diagnostic is emitted — located at the outermost layout element — with zero per-section/per-cell diagnostics, in both contract modes. | Golden adversarial + unit | F-1, DEC-4, DM-2 |
| AC-F1-3 | **Given** Storage containing a non-canonical element (e.g. `div`, inline `span`, unknown `ac:*` element), **when** converted, **then** a blocking `reverse/unknown-element` diagnostic is emitted with the element identity and location; structural violations of canonical elements (e.g. table nested in `td`/`th`) still classify under the retained `reverse/unsupported-construct` fallback. | Golden adversarial + unit | F-1, F-5, DM-3 |
| AC-F2-1 | **Given** a canonical element carrying attributes beyond the mirror allowlist (e.g. `td` with `colspan`/`rowspan`/`style`/`class`/`data-table-width`, or `ac:image` with user-set properties), **when** converted, **then** exactly one blocking `reverse/unsupported-attribute` diagnostic per element is emitted, enumerating the offending attribute names sorted and deduplicated, located at the element start, carrying no attribute values; multiple offending elements each produce their own diagnostic; both contract modes agree. | Golden adversarial + unit | F-2, DEC-5, DM-2 |
| AC-F2-2 | **Given** canonical Storage carrying `ac:schema-version` and/or `ac:macro-id` on `ac:structured-macro` (K1 read-back form), **when** converted, **then** zero diagnostics are produced for those attributes and output is byte-identical to the attribute-free variant (carve-out preserved; re-asserted over the existing K1 fixtures). | Golden | F-2, F-7, NFR-3 |
| AC-F3-1 | **Given** an `ac:task-list` containing a non-`ac:task` child (unknown element or canonical-but-misplaced element), **when** converted, **then** a blocking diagnostic is emitted for that child (class per F-1 rules) with the child's location — never a silent drop; **and given** a canonical mixed task/regular-list storage body, **then** conversion succeeds with zero diagnostics. | Golden adversarial + unit | F-3, DEC-6, DM-2 |
| AC-F4-1 | **Given** the reverse contract invoked with a page context (`pageId`/`title`/`sourcePath`), **when** any diagnostic arm fires (blocking, informational, parse-error), **then** the diagnostic echoes the page context verbatim; **and given** no page context, **then** the field is absent and output is byte-identical to the context-free GH-92 form; existing call signatures compile unchanged (optional parameters only). | Unit + golden adversarial | F-4, DEC-2, DM-1, DM-2 |
| AC-F4-2 | **Given** identical Storage and options converted twice (in-process and across runs), **when** diagnostics are compared, **then** they are deep-equal — attribute enumerations identically ordered, page echo verbatim — and fast-fail's first blocking error deep-equals collect-all's first diagnostic (parity preserved under the new codes and fields). | Unit + golden adversarial | F-4, F-5, NFR-2 |
| AC-F5-1 | **Given** the extended storage-side corpus, **when** the alignment is evaluated, **then** all 12 GH-31 categories have storage-side counterparts with pinned sidecar expectations — supported categories (emoji, long-page, macro-code, mixed task/regular lists) pinning zero-diagnostic conversions — and each counterpart's diagnostics deep-equal its sidecar. | Golden adversarial | F-6, DEC-3, DM-4 |
| AC-F5-2 | **Given** the extended corpus and runner inventory, **when** category coverage is asserted, **then** the new classes are each represented by ≥1 fixture — complex layout, exotic table attributes (incl. a multi-attribute single element), task-list misplaced child, page-context echo (incl. parse-error with page) — and the PII grep-audit passes over the extended set. | Golden adversarial | F-6, DM-4, NFR-1 |
| AC-F6-1 | **Given** the complete aligned corpus, **when** collect-all runs over every fixture, **then** every non-canonical element and attribute instance in the corpus appears in exactly one pinned diagnostic — zero unclassified instances, zero silent drops (completeness mechanically enforced by sidecar deep-equality over the full diagnostic arrays). | Golden adversarial | F-1, F-2, F-3, F-6, NFR-1 |
| AC-F7-1 | **Given** corpus A (26 fixtures), the 33 forward golden pairs, and the K1 variants, **when** reverse-converted, **then** zero new diagnostics are emitted, corpus-A round-trip byte-equality remains 100%, and the forward fixtures are byte-unmodified (false-positive guard). | Golden | F-7, NFR-3 |
| AC-F7-2 | **Given** the completed change, **when** the CLI surface and existing suites are inspected, **then** 0 new commands/flags/output changes exist, `ReverseError` remains a standalone union (not a `MarkSyncError` kind), and all pre-existing tiers are green. | All existing tiers | F-7, DM-1, NG-1 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single feature PR to `main`; no flags, no migration, no config change (library-only).
- Sidecar re-baselines (the two re-assigned code classes) land in the same PR and are review-visible — never a CI snapshot regen.
- Version bumped 0.9.0 → 0.10.0 at merge (DEC-7); the next tag-triggered binary release picks it up unchanged.
- Downstream coordination: E2/E3 specs bind to the frozen code assignment (Appendix A) and the page-context payload (DM-2); after their merge, code re-assignment is forbidden (registry remains additions-only regardless).
- Communication: feature-line note "feat(reverse): complete unsupported-construct detection — granular stable codes + page locations (C-4; GH-31-aligned corpus)".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted state touched. The corpus extension is additive fixture seeding (committed test data, PII-audited); the sidecar schema grows an optional field with no migration of existing sidecars beyond the reviewed re-pins (§7.1).

## 20. PRIVACY / COMPLIANCE REVIEW

- No personal-data handling changes; zero network I/O.
- Payload hygiene is tightened, not loosened: diagnostics gain caller-supplied page metadata only; attribute **names** are reported, never attribute **values** (values can carry user content — NFR-6, NFR-SEC-1 posture).
- The PII grep-audit extends over every new fixture (AC-F5-2).

## 21. SECURITY REVIEW HIGHLIGHTS

- No new dependency, parser, or execution surface; detection is pure classification over already-parsed HAST (NG-7).
- No content echoes: the page-context field is caller-supplied; construct identities carry element/macro/attribute names, not text or attribute values — macro-injection payloads cannot smuggle content through diagnostics.
- Secrets posture unchanged (INV-SEC-1): the converter handles no credentials and emits no logs.

## 22. MAINTENANCE & OPERATIONS IMPACT

- Permanent: the code-assignment map (Appendix A) is part of the frozen contract — new construct classes discovered in the wild get new codes (additions-only) or land in the structural fallback; each new class grows the corpus + inventory (mechanically enforced).
- The mirror allowlist (Appendix C) evolves only with the forward emission vocabulary — the zero-diagnostic sweeps keep the two in lockstep; a forward attribute change that breaks them fails CI (same failure-together discipline as the round-trip guardrail).
- No operational surface (no CLI, no network, no state) — zero runbook impact.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Silent drop | A non-canonical construct (element, macro, attribute, misplaced child) removed from output without a diagnostic — the C-4 violation this change eliminates. |
| Exotic attribute | Any attribute on a canonical element beyond the mirror allowlist and the K1 carve-out (ticket's "exotic table attributes": colspan, rowspan, style, class, data-table-width, …). |
| Complex layout | The `ac:layout` / `ac:layout-section` / `ac:layout-cell` family — one unsupported construct per layout tree (DEC-4). |
| Structural fallback | The retained `reverse/unsupported-construct` code: canonical elements in non-canonical positions/compositions (nested tables, misplaced task-list children) and unclassifiable constructs. |
| Mirror allowlist | The canonical attribute set per element, defined as exactly what the forward converter emits for that element (Appendix C). |
| Page context | Caller-supplied `{pageId?, title?, sourcePath?}` echoed verbatim into every diagnostic (DEC-2); never extracted from the body. |
| Code-assignment map | The normative construct-class → code mapping (Appendix A), frozen at this change; the registry stays additions-only forever. |
| Alignment map | The normative GH-31 category → storage-side counterpart → expectation mapping (Appendix B). |
| GH-31 adversarial corpus | The 12-fixture Markdown-side corpus + 6-category classification locking the forward no-silent-drop guarantee; GH-93 mirrors it storage-side. |
| K1 carve-out | ADR-0005 spike K1: `ac:schema-version` / `ac:macro-id` on macros are silently dropped on read-back — sanctioned, never a diagnostic. |

## 24. APPENDICES

### Appendix A — Diagnostic code assignment map (normative; DEC-1)

| Construct class | Code (after GH-93) | 0.9.0 behavior | Trigger examples | Severity |
|---|---|---|---|---|
| Foreign/unknown macro | `reverse/unknown-macro` | `reverse/unsupported-construct` (re-assigned) | jira, toc, expand, non-panel info, gliffy/app macros | blocking |
| Complex layout (one per layout tree) | `reverse/complex-layout` | generic unknown-element arm (new class) | `ac:layout`/`-section`/`-cell` | blocking |
| Non-canonical attribute on canonical element (one per element, names sorted) | `reverse/unsupported-attribute` | not detected — **silently dropped** (new class) | `colspan`, `rowspan`, `style`, `class`, `data-table-width`, `ac:image` user properties | blocking |
| Non-canonical element | `reverse/unknown-element` | `reverse/unsupported-construct` (re-assigned) | `div`, `span`, unknown `ac:*` elements, non-`ac:task` unknown children of `ac:task-list` | blocking |
| Structural violation (canonical elements, non-canonical composition/position) | `reverse/unsupported-construct` (retained) | same code (unchanged) | table inside `td`/`th`; canonical-but-misplaced `ac:task-list` children; unclassifiable fallback | blocking |
| Marksync synthetic artifact | `marksync/synthetic-artifact` (unchanged) | same | render-policy mermaid image | informational |
| Malformed Storage | `reverse/parse-error` (unchanged) | same | not well-formed XML | error arm |

Alternatives considered for the taxonomy: **(Alt 1 — keep the single coarse code + construct discriminator):** zero churn, but E2/E3 would string-match display-oriented construct text to route resolution — an undeclared, unstable contract; PDR-0002's "known classes emit stable codes" reads per-class. **(Alt 2 — codes per construct identity, e.g. per macro name):** unbounded registry growth; per-class resolution paths don't differ per macro name. **(Alt 3 — granular codes, chosen):** four classes map 1:1 to the ticket's detection classes and to distinct resolution paths; bounded registry; fallback retains the generic home. Registry safety: additions-only is preserved (no code removed/renamed); the two re-assignments change *emitted* assignment only, on a consumerless surface (verified in-tree), in the last change before E2/E3 bind.

### Appendix B — GH-31 corpus alignment map (normative; DEC-3)

| GH-31 category (Markdown-side) | Storage-side counterpart | Expectation |
|---|---|---|
| Macro: jira | exists (GH-92) | blocking `reverse/unknown-macro` (re-pinned) |
| Macro: toc | exists (GH-92) | blocking `reverse/unknown-macro` (re-pinned) |
| Macro: expand | exists (GH-92) | blocking `reverse/unknown-macro` (re-pinned) |
| Macro: info (non-panel) | exists (GH-92) | blocking `reverse/unknown-macro` (re-pinned) |
| App/gliffy class | exists (GH-92) | blocking `reverse/unknown-macro` (re-pinned) |
| Macro: code | **new** | canonical conversion (fence), zero diagnostics (supported) |
| Nested tables | exists (GH-92) | blocking structural fallback `reverse/unsupported-construct` (code unchanged) |
| Raw HTML block | exists (GH-92, `div`) | blocking `reverse/unknown-element` (re-pinned) |
| Raw HTML inline | **new** (e.g. inline `span`) | blocking `reverse/unknown-element` — direction-dependent: forward *escapes* inline HTML (GH-31 classification `[]`), reverse *blocks* the non-canonical element; documented asymmetry |
| Emoji | **new** | canonical passthrough, zero diagnostics (false-positive guard) |
| Long page (≥50 KB / ≥1000 lines) | **new** | zero diagnostics; determinism pinned; perf informational |
| Mixed task/regular lists | **new** | canonical, zero diagnostics; **plus** a sibling fixture with a non-`ac:task` child of `ac:task-list` → blocking per DEC-6 |

Beyond GH-31 (ticket-added classes, each ≥1 fixture): complex layouts; exotic table attributes (incl. multi-attribute single element + K1-on-macro negative control); page-context echo (incl. parse-error with page). Existing multi-instance and malformed fixtures carry over (sidecars re-pinned only where codes changed). The storage-side set stays beside (not inside) the Markdown-side corpus so the existing PII-audit directory walk is unaffected (GH-92 precedent).

### Appendix C — Canonical attribute allowlist (mirror principle; DEC-5)

An attribute is canonical on an element iff the forward converter emits it there:

| Element | Canonical attributes |
|---|---|
| `a` | `href` |
| `ac:image` | `ac:alt` |
| `ri:attachment` | `ri:filename` |
| `ri:url` | `ri:value` |
| `ac:structured-macro` | `ac:name`; **plus K1 carve-out**: `ac:schema-version`, `ac:macro-id` (silently dropped, never diagnostic) |
| `ac:parameter` | `ac:name` |
| All other canonical elements (h1–h6, p, strong, em, del, code, img, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, hr, pre, ac:task-list, ac:task, ac:task-status, ac:task-body, ac:plain-text-body) | none |

Everything else on a canonical element → `reverse/unsupported-attribute`. The allowlist is pinned by the zero-diagnostic sweeps (NFR-3) and evolves only with the forward emission vocabulary (§22).

### Appendix D — Evidence artifacts

- Ticket GH-93 (scope authority with PDR-0002); PM notes `chg-GH-93-pm-notes.yaml` (intake + clarify_scope analysis; delegated decisions: code granularity, page-location semantics, corpus mapping).
- PDR-0002 (C-4 + verification note "adversarial corpus, GH-31 classification reused"); ADR-0005 (subset discipline, "do not silently degrade", K1 facts); GH-92 feature spec + test spec (baseline behavior, two-class taxonomy, additions-only registry, corpus partition).
- Implementation read at intake: the reverse classifier (canonical-element pass-through arm; task-list child filter; `ReverseOptions.sourcePath` reserved-unused), the diagnostics model (`REVERSE_CODES`, diagnostic shapes), the classification runner (category inventory, parity/determinism/PIE assertions), both adversarial corpora (12 Markdown-side fixtures + classifications; 9 storage-side fixtures + sidecars), the golden corpus partition; `package.json` (v0.9.0).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-08-15 | spec-writer (GH-93) | Initial draft — granular code taxonomy (DEC-1, Appendix A), page-context semantics (DEC-2), mirror attribute allowlist (DEC-5, Appendix C), GH-31 alignment map (DEC-3, Appendix B), layout single-construct rule (DEC-4), task-list closure (DEC-6), version 0.10.0 (DEC-7). OQ-1 flags the code taxonomy for @decision-advisor confirmation. Pending DoR review. |
| 0.2 | 2026-08-15 | decision-advisor (GH-93 OQ-1) | OQ-1 resolved — TDR-0014 independently confirms DEC-1 (granular per-class taxonomy + structural fallback + two emitted-code re-assignments) as the frozen pre-E2/E3 contract, with two clarifying pins (orphaned layout-family classification; consumers bind to `code` strings). DEC-1 rationale now references TDR-0014. |

---

## AUTHORING GUIDELINES

- Authored from the GH-93 planning-session context (PM clarify_scope summary + `chg-GH-93-pm-notes.yaml`); scope authority = PDR-0002 C-4 + issue #93 body (story file TBD — if it lands with deltas, re-open this spec).
- The PM delegated three design decisions (code granularity, page-location semantics, corpus mapping) to the spec-writer, with @decision-advisor escalation *if precedent-setting*. The code taxonomy **is** precedent-setting (public-ish, additions-only registry consumed by E2/E3): it is decided provisionally with full alternatives analysis (Appendix A) and routed to `@decision-advisor` as OQ-1 for confirmation before DoR — the task-tool delegation was unavailable to this writer, so the flag travels in-spec. Page-location semantics and corpus alignment are not precedent-setting (no external contract; consumer-unbinding additive shape) — decided and recorded (DEC-2/DEC-3).
- All PM constraints discharged: K1 carve-out (AC-F2-2, DEC-5), corpus-A preservation (AC-F7-1, NFR-3), registry additions-only (DEC-1, NFR-4), optional-params-only signatures (DEC-2, AC-F4-1), 0 CLI delta / standalone ReverseError (AC-F7-2), code style authority cited (`.ai/rules/typescript.md` — self-documenting; no comment-level mandates needed in a spec).
- Ticket AC mapping: AC-1 (every non-canonical element detected with a stable code) → AC-F1-1..3, AC-F5-1, AC-F6-1; AC-2 (zero silent drops) → AC-F2-1, AC-F3-1, AC-F6-1; AC-3 (page + element location) → AC-F4-1/2. Guardrail ACs (F-7) come from the PM hard constraints, mirroring the GH-92 precedent of encoding preservation guarantees as ACs.
- AC tiers follow `.ai/rules/testing-strategy.md`: golden adversarial + unit only (no adapter/network surface); existing tiers run unchanged as the regression net.
- Grounded in the tree at `feat/GH-93/unsupported-construct-detection` off `main @ e0211af`: classifier, diagnostics model, runner, and both corpora read at intake; corpus counts (12 Markdown-side, 9 storage-side, 26 corpus-A, 33 forward pairs) verified against the working tree.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-93)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1–25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-7, DM-1..DM-4, NFR-1..NFR-6, RSK-1..RSK-7, DEC-1..DEC-7, OQ-1..OQ-4, AC-F1-1..AC-F7-2)
- [x] Acceptance criteria reference at least one F-/DM-/NFR-/DEC- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (existing module/corpus paths cited as current-state grounding per GH-92 precedent; no new-file prescriptions, no step-by-step tasks)
- [x] No content duplicated from linked docs (PDR/ADR/GH-92 spec synthesized, not restated)
- [x] Front matter validates per front_matter_rules
