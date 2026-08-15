---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-REVERSE-CONVERSION
status: Current
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: ["GH-92", "GH-93"]
  decisions: [PDR-0002, ADR-0005, TDR-0012, TDR-0013, TDR-0014]
  contracts: []
---

# Feature Specification: Reverse Conversion (Storage Format → Markdown)

> The deterministic mirror of the forward converter: Confluence Storage Format
> (XHTML + `ac:`/`ri:` macros) → canonical Markdown for the same GFM subset
> (ADR-0005), with 100% golden round-trip fidelity and never-silently-dropped
> diagnostics (PDR-0002 C-4) — every non-canonical macro, layout, element,
> attribute, and misplaced child is detected with a granular stable code and
> page + element locations. Delivered as a library-only foundation (GH-92 +
> GH-93, MS-0003 E1) — no CLI surface; the `resolve` (E2) and `import` (E3)
> flows are its consumers.

## 1. Overview

The reverse converter turns a Confluence Storage Format page body back into
Markdown in a precisely defined **canonical emission form**. It is the exact
mirror of the forward construct mapping (GH-20): every canonical GFM construct
that `renderStorage` emits is recognized and converted back; everything else —
foreign macro, complex layout, unknown element, non-canonical attribute,
misplaced task-list child — produces a blocking diagnostic with a granular
stable code and page + Storage locations — never a silent drop (PDR-0002 C-4).
Marksync-generated structures are handled on read-back: the provenance panel
is stripped, the mermaid code-macro wrapper unwraps to a ```mermaid fence, and
render-policy synthetic images are reported as informational diagnostics.
Conversion is deterministic — the same Storage input always produces
byte-identical Markdown.

The contract is library-level: `reverseStorage` (fast-fail) and
`reverseStorageCollectAll` (enumeration) in `src/infra/confluence/parse/reverse.ts`.
Both accept an optional caller-supplied page context (`{pageId?, title?,
sourcePath?}`) echoed verbatim into every diagnostic. The contract performs
zero I/O (no network, no filesystem), adds no CLI surface, and is not yet
wired into the `TargetSystem` port — the MS-0003 `resolve` (E2) and `import`
(E3) flows bind to it in their own changes.

Verification is a golden-tier round-trip harness: for every canonical fixture,
`reverse(forward(md))` must byte-equal `normalize(md)` (the NFR-REL-4
reverse-direction guardrail).

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** The MS-0003 `resolve` (remote-side diff) and `import` (corpus
  adoption) flows need Confluence page bodies back as Markdown. Ad-hoc reverse
  conversion would be comparison-ambiguous (no canonical output form), polluted
  by marksync-generated structures (provenance panel, mermaid artifacts),
  fragile against Confluence read-back normalization (K1 attributes), and
  silently lossy on non-canonical constructs.
- **Affected Users:** Future `resolve`/`import` consumers (MS-0003 E2/E3); the
  pilot team adopting an existing Confluence corpus.
- **Business Impact:** Unblocks the MS-0003 critical path (E2/E3 depend on E1);
  makes construct loss explicit and located instead of silent.

### 2.2 Goals & Success Metrics

- **Primary Goal:** Deterministic Storage→Markdown conversion for the canonical
  GFM subset with 100% golden round-trip fidelity.
- **KPIs:**
  - Round-trip fidelity on canonical fixtures (corpus A): **100%** —
    `reverse(forward(md)) === normalize(md)` byte-wise, 0 mismatches.
  - Determinism: identical Storage → byte-identical Markdown in-process and
    across runs (committed snapshot layer).
  - Detection completeness: **100%** of non-canonical construct instances
    (elements **and** attributes) over the GH-31-aligned storage-side
    adversarial corpus produce a stable-code diagnostic; **0** silent drops;
    **0** unclassified instances.
  - GH-31 categories with storage-side pinned counterparts: **12/12**.
  - New diagnostics over canonical inputs (corpus A 26 + forward golden 33 +
    K1 variants): **0**.
  - Forward golden fixtures modified: **0**; new CLI commands/flags: **0**.

## 3. Functionality

### 3.1 Capabilities

- **Reverse conversion engine (library):** `reverseStorage(body, opts?)` parses
  Storage XHTML into HAST, classifies each node (canonical / unsupported /
  synthetic artifact), inspects attributes on canonical elements, maps
  recognized constructs to content HAST, and serializes to canonical Markdown.
  Returns `Result<ReverseSuccess, ReverseError>` where `ReverseSuccess` is
  `{ markdown, diagnostics: InformationalDiagnostic[] }`. Fast-fail semantics:
  the first blocking diagnostic aborts conversion — partial output is never
  returned (mirroring the forward `findUnsupported` precedent).
- **Collect-all enumeration:** `reverseStorageCollectAll(body, opts?)` lists
  every diagnostic instance with per-instance verdicts identical to the
  fast-fail path (`all.diagnostics[0]` deep-equals the fast-fail error) —
  mirroring the forward `findUnsupported`/`findAllUnsupported` parity
  (GH-20 DEC-1).
- **Marksync-structure handling on read-back:**
  - **Provenance panel strip** — any `ac:structured-macro ac:name="info"` whose
    body contains the `<!-- marksync:provenance-panel -->` marker comment
    (`PROVENANCE_PANEL_MARKER`, `src/infra/confluence/provenance.ts`) is
    dropped entirely before conversion, with **no diagnostic** — it is marksync
    metadata, never Markdown content. Git metadata (SHA, branch, timestamp)
    never flows into reverse-converted Markdown. An info macro *without* the
    marker is not stripped — it classifies as a blocking unsupported construct.
  - **Mermaid `code` policy** — a `language=mermaid` code macro unwraps to a
    ```mermaid fenced block whose source bytes are identical to the CDATA
    content; the macro wrapper is never emitted.
  - **Mermaid `render` policy artifact** — an `ac:image` whose attachment
    filename starts with `marksync-mermaid-` is recognized as a synthetic
    render artifact: it is **not emitted as content** and produces an
    informational `marksync-synthetic-artifact` diagnostic (the diagram source
    is not recoverable from the page; the loss is explicit, located, and
    non-blocking).
  - **K1 attribute tolerance (ADR-0005 spike K1)** — Confluence-assigned
    `ac:schema-version` and `ac:macro-id` attributes on
    `ac:structured-macro` are dropped silently (no diagnostic, never in
    output); output is byte-identical to the attribute-free variant. The
    carve-out is confined to macros: those attribute names on any other
    element are non-canonical attributes and diagnose as
    `reverse/unsupported-attribute`. Structural (pretty-print) whitespace is
    dropped.
- **Granular diagnostics taxonomy (TDR-0014):** the `REVERSE_CODES` registry
  (`src/domain/markdown/reverse-diagnostics.ts`) is additions-only and stable
  across releases — 7 codes: `reverse/unsupported-construct`,
  `reverse/unknown-macro`, `reverse/complex-layout`,
  `reverse/unsupported-attribute`, `reverse/unknown-element`,
  `marksync/synthetic-artifact`, `reverse/parse-error`. Severity classes are
  exactly two — blocking (fails conversion) and informational — plus the
  distinct parse-error arm; granularity lives in the code, not in new
  severities. The code-assignment map:
  - **Blocking `reverse/unknown-macro`** — any `ac:structured-macro` outside
    the recognized set (`code`, `task-list`, panel-marker info macro):
    jira, toc, expand, non-panel info, app/gliffy-class macros. One construct
    per macro — the macro's own children are not separately diagnosed.
  - **Blocking `reverse/complex-layout`** — the
    `ac:layout`/`ac:layout-section`/`ac:layout-cell` family, classified as
    exactly **one** diagnostic per layout tree at the outermost layout element
    present (orphaned sections/cells classify the same way at the outermost
    family element); cells and sections are part of the construct, never
    separate violations.
  - **Blocking `reverse/unsupported-attribute`** — one **aggregated**
    diagnostic per canonical element carrying attributes beyond the mirror
    allowlist (see below): offending attribute names enumerated in the
    construct identity, **sorted and deduplicated**; element-start
    `line:column` location; attribute **names only, never values**
    (NFR-SEC-1 posture — values can carry user content).
  - **Blocking `reverse/unknown-element`** — non-canonical elements (`div`,
    inline `span`, unknown `ac:*` elements) wherever they appear, including
    as children of `ac:task-list`.
  - **Blocking `reverse/unsupported-construct` (structural fallback)** —
    canonical elements in non-canonical positions or compositions the subset
    cannot represent: a table nested inside `td`/`th`, individually-canonical
    children misplaced in an `ac:task-list`, and unclassifiable constructs.
  - **Informational `marksync/synthetic-artifact`** — recognized marksync
    artifacts (the mermaid render-policy image) reported alongside successful
    conversion; same payload shape (code + construct + location).
  - **Malformed Storage** — input that is not well-formed XML is a distinct
    parse-error arm (`StorageParseError` with code + location + detail);
    conversion cannot proceed; a stable typed error, never a crash.
  - Diagnostic payloads carry code + construct identity + location + page
    context only — no free-form content echoes (NFR-SEC-1 posture).
  Consumers (E2/E3) route on `code` strings — never on `construct` text
  (TDR-0014 consumer-binding pin).
- **Attribute-level detection (mirror allowlist):** an attribute is canonical
  on an element **iff the forward converter emits it for that element** —
  `a[href]`, `ac:image[ac:alt]`, `ri:attachment[ri:filename]`,
  `ri:url[ri:value]`, `ac:structured-macro[ac:name]` (+ K1 carve-out),
  `ac:parameter[ac:name]`; every other canonical element allows none.
  Anything beyond the allowlist (e.g. `colspan`, `rowspan`, `style`, `class`,
  `data-table-width` on table cells; user-set `ac:image` properties) is a
  blocking `reverse/unsupported-attribute` diagnostic — never a silent drop.
  The allowlist evolves only with the forward emission vocabulary; the
  zero-diagnostic sweeps keep the two in lockstep.
- **Task-list integrity:** every child of `ac:task-list` that is not an
  `ac:task` produces a blocking diagnostic located at the child —
  non-canonical child element types as `reverse/unknown-element`,
  individually-canonical misplaced children under the structural fallback —
  never a silent drop. Canonical mixed task/regular lists convert with zero
  diagnostics.
- **Page context on every diagnostic:** the options accept an optional,
  caller-supplied page context (`page: {pageId?, title?, sourcePath?}` — all
  optional; the library never extracts identity from the body). When present,
  it is echoed **verbatim** into every diagnostic arm — blocking,
  informational, and parse-error alike — alongside the element `line:column`.
  When absent, the field is omitted entirely and diagnostic output is shape-
  and byte-identical to the context-free form. The legacy reserved
  `sourcePath` option is absorbed as a convenience populating
  `page.sourcePath` when no explicit page context is given; an explicit page
  context always wins verbatim (no merge). Signatures are
  optional-parameters only — no breaking change to any existing call.
- **Canonical Markdown normalizer:** `normalizeMarkdown(md)`
  (`src/domain/markdown/normalize.ts`) — the round-trip comparison basis:
  forward parse stage (including its documented annotation stripping:
  front-matter, comment-only HTML, link-reference comments) → MDAST→HAST → the
  shared canonical serializer. Deterministic, idempotent
  (`N(N(md)) === N(md)`); reverse output is a fixed point
  (`N(reverse(storage)) === reverse(storage)` for canonical Storage).
- **Library-only boundary:** no CLI command, flag, output envelope, or
  exit-code change; `ReverseError` is a standalone union, **not** a
  `MarkSyncError` kind — the 10-class exit-code map is untouched.

### 3.2 Construct coverage (mirror of the forward visitor)

| Storage construct | Reverse output |
|---|---|
| `<h1>`…`<h6>` | ATX headings `#`…`######` |
| `<p>` | paragraph block |
| `<strong>` / `<em>` / `<del>` | `**` / `*` / `~~` |
| `<code>` (inline) | backticks |
| `ac:structured-macro ac:name="code"` + `ac:parameter ac:name="language"` + `<ac:plain-text-body>` CDATA | fenced code block with language (CDATA content byte-preserved) |
| `<a href>` | `[text](url)` |
| `<ac:image>` + `<ri:attachment ri:filename>` / `<ri:url ri:value>` | `![alt](src)` |
| `<ul>` / `<ol>` / `<li>` (nested) | `-` / `1.` with canonical indentation |
| task list (`ac:name="task-list"` macro or `ac:task-list` element; `ac:task`/`ac:task-status`/`ac:task-body`) | `- [ ]` / `- [x]` (GFM task list) |
| `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` | GFM pipe table (a table nested inside `td`/`th` is blocking — outside the subset) |
| `<blockquote>` | `>` prefixed lines |
| `<hr/>` | `---` |
| code macro with `language=mermaid` (code policy) | ```mermaid fence |
| `ac:image` + `ri:filename="marksync-mermaid-…"` (render policy) | dropped; informational `marksync-synthetic-artifact` |
| info macro containing the panel marker | dropped entirely, no diagnostic |
| `ac:schema-version` / `ac:macro-id` on `ac:structured-macro` (K1 read-back) | ignored, no diagnostic |
| `ac:layout` / `ac:layout-section` / `ac:layout-cell` (any depth, incl. orphaned) | one blocking `reverse/complex-layout` per layout tree |
| non-canonical attribute on a canonical element (`colspan`, `style`, …) | one blocking `reverse/unsupported-attribute` per element (sorted attribute names) |
| unknown `ac:structured-macro` (jira, toc, expand, gliffy, non-panel info) | blocking `reverse/unknown-macro` |
| non-canonical element (`div`, inline `span`, unknown `ac:*`) | blocking `reverse/unknown-element` |
| non-`ac:task` child of `ac:task-list` | blocking diagnostic at the child (`reverse/unknown-element` or structural fallback) |
| canonical element in non-canonical position (table inside `td`/`th`, …) | blocking `reverse/unsupported-construct` (structural fallback) |

### 3.3 Canonical emission form

One normative form is shared by the reverse serializer and the round-trip
normalizer (defined once to prevent self-referential round-trip assertions):

- Headings: ATX (`#`…`######`); never setext.
- Unordered lists: `-`; ordered lists: `1.`; task items `- [ ]` / `- [x]`.
- Emphasis `*`; strong `**`; strikethrough `~~`; inline code: backticks.
- Fenced code: backtick fences with language identifier; never tilde fences.
- Links `[text](url)`; images `![alt](src)` — never reference-style.
- Thematic break: `---`.
- Blocks separated by exactly one blank line; nested list indentation aligned
  to the parent item's content start.
- Escaping per the standard remark-gfm stringifier rules; the form is
  byte-compatible with the repo's remark-based stringification defaults,
  pinned by the serializer options layer `{ bullet: "-", rule: "-" }`
  (TDR-0013).

The normalizer applies this form **after** the forward parse stage's
non-rendering-annotation stripping, so annotation-carrying fixtures compare on
content only. Reverse never synthesizes front-matter, UUIDs, or lock entries —
metadata assignment on adoption is E3 `import`'s explicit step.

### 3.4 Edge cases & error handling

- **Malformed Storage (not well-formed XML):** stable `StorageParseError`
  (`reverse/parse-error`, location, detail) — never a crash, never partial
  output; both contract modes agree; carries the page context verbatim when
  one is supplied.
- **Code macro missing its `ac:plain-text-body`:** blocking
  `unsupported-construct` (construct `ac:structured-macro[ac:name='code']`
  (missing body)).
- **Nested tables:** a `<table>` inside `td`/`th` is outside the canonical
  subset → blocking diagnostic (construct `td containing nested table`).
- **Exotic attributes:** a canonical element carrying attributes beyond the
  mirror allowlist (e.g. `th[class, colspan, data-table-width, rowspan,
  style]`) yields exactly one aggregated blocking
  `reverse/unsupported-attribute` with sorted, deduplicated attribute names;
  multiple offending elements each produce their own diagnostic.
- **Complex layouts:** an `ac:layout` tree yields exactly one blocking
  `reverse/complex-layout` at the outermost layout element — inner content is
  never separately diagnosed; orphaned sections/cells classify at the
  outermost family element present.
- **Task-list stray children:** a non-`ac:task` child of `ac:task-list` is
  diagnosed at the child and never dropped.
- **Comments in Storage:** dropped during classification (the panel marker was
  already consumed by the parser); never emitted.
- **Render-policy pages:** mermaid diagrams are lost on reverse (the source is
  not on the page) — the informational diagnostic makes the loss explicit; the
  resolution UX (e.g., re-publish under `code` policy) belongs to E2/E3.

## 4. Technical Architecture

### 4.1 Design

Tier split mirrors the forward pipeline (ports-and-adapters symmetry):
Storage→HAST parsing is Confluence-specific (**infra** tier,
`src/infra/confluence/parse/`); HAST→Markdown serialization and the
normalizer are adapter-agnostic (**domain** tier, `src/domain/markdown/`).
The parser is saxes (TDR-0012) — strict XML, namespace-aware (`ac:`, `ri:`),
fragment mode (page bodies are multi-root), position-tracking; regex-based
Storage extraction is prohibited. The serializer rides the unified stack:
`canonicalize()` → `hast-util-to-mdast` → remark-gfm stringify (TDR-0013),
with the canonical-form options layer defined once at the serializer.

### 4.2 Core components

| Component | Responsibility | Status |
|---|---|---|
| `parseStorage` (`src/infra/confluence/parse/reverse-parser.ts`) | Storage XHTML → HAST via saxes (xmlns/fragment/position/strictEntities); CDATA + text coalescing; line/column positions (unist `Point`); read-back normalization (panel strip by marker, K1 attribute drop, structural-whitespace drop); parse errors → `StorageParseError` (never throws) | Implemented (GH-92) |
| `reverseStorage` / `reverseStorageCollectAll` (`src/infra/confluence/parse/reverse.ts`) | Reverse contract entry points: parse → classify (canonical / unsupported / synthetic artifact; granular per-class codes, attribute pass over the mirror allowlist, task-list child integrity) → content-HAST mapping → serialize; fast-fail + collect-all parity; optional page-context resolution (explicit page verbatim; `sourcePath` absorption; omitted when absent) | Implemented (GH-92, extended GH-93) |
| `hastToMarkdown` (`src/domain/markdown/hast-to-markdown.ts`) | Canonical serializer: `canonicalize()` → `hast-util-to-mdast` → remark-gfm stringify with `{bullet:"-", rule:"-"}` (TDR-0013) | Implemented (GH-92) |
| `normalizeMarkdown` (`src/domain/markdown/normalize.ts`) | Canonical normalizer: forward parse (annotation stripping) → MDAST→HAST → shared serializer; idempotent; reverse output is a fixed point | Implemented (GH-92) |
| Reverse diagnostics (`src/domain/markdown/reverse-diagnostics.ts`) | Granular taxonomy, stable additions-only `REVERSE_CODES` (7 codes: 5 blocking-path + informational + parse-error), optional `page` context on every diagnostic arm, `StorageParseError` + `ReverseError` standalone union (not a `MarkSyncError` kind) — frozen pre-E2/E3 by TDR-0014 | Implemented (GH-92, extended GH-93) |
| Round-trip harness (`tests/golden/markdown/reverse-round-trip.test.ts`, `reverse-readback.test.ts`) | Golden-tier verification: corpus-A byte equality, determinism, partition-manifest guardrail, read-back fixtures, zero-diagnostic sweeps over canonical corpora (false-positive guard) | Implemented (GH-92, extended GH-93) |
| Storage-side adversarial set (`tests/adversarial-storage/` + `tests/golden/adversarial/reverse-classification-runner.test.ts`) | GH-31-aligned regression lock (21 fixtures, 12/12 categories + new classes): sidecar deep-equality incl. `page?`, zero-diagnostic success branch, category inventory, fast-fail/collect-all parity and determinism, parse-error arm, PII scoping | Implemented (GH-92, extended GH-93) |
| `resolve` / `import` flows (E2/E3) | Consumers of the library contract — diffing, patch generation, adoption UX; route on `code` strings (TDR-0014) | Future (MS-0003 E2/E3) |

Dependencies added: `saxes@6.0.0` (XML parser, TDR-0012),
`hast-util-to-mdast@^10.1.2` (HAST→MDAST bridge, TDR-0013). Package version
0.10.0.

### 4.3 Key decisions

- **PDR-0002:** E1 scope — the reverse-converter foundation pulled forward
  into MS-0003; C-4 requires unsupported constructs to block with diagnostics,
  never silently drop.
- **ADR-0005:** Storage Format is the body representation (ADF read path
  permanently rejected); the canonical GFM subset is exactly the forward
  converter's; spike K1 defines the read-back normalizations to tolerate.
- **TDR-0012 (Accepted):** saxes as the Storage XML parser — strict,
  namespace-aware, CDATA-correct, position-tracking; no regex extraction.
- **TDR-0013 (Accepted):** unified-stack serializer (`hast-util-to-mdast` +
  remark-gfm) over hand-rolled emission; options layer `{bullet:"-", rule:"-"
  }` pins the canonical form.
- **TDR-0014:** granular reverse-diagnostics code taxonomy — 4 per-class codes
  + structural fallback, frozen as the pre-E2/E3 contract; consumers bind to
  `code` strings; the registry is additions-only (re-assignment window closed
  at the freeze).

## 5. Acceptance criteria (delivered — GH-92 + GH-93)

- [x] **Round-trip fidelity:** 100% of corpus-A fixtures (26 — one per
      canonical construct family + kitchensink + mermaid code-policy) satisfy
      `reverse(forward(md)) === normalize(md)` byte-wise; 0 `<ac:`/`<ri:`
      leakage. *(TC-RT-001, golden harness.)*
- [x] **Determinism:** identical Storage converted twice in-process →
      byte-identical Markdown + diagnostics; committed snapshot layer locks
      across-run output. *(TC-RT-003/004.)*
- [x] **Guardrail automation:** the harness is directory-driven from
      `round-trip-partition.json` — a fixture added without a manifest entry
      (or a subset expansion that fails) breaks CI; buckets are pairwise
      disjoint and complete over the discovered corpus. *(TC-RT-005.)*
- [x] **Panel strip:** Storage containing the provenance panel converts with
      0 panel content, 0 wrapper elements, 0 marker traces, and no blocking
      diagnostic; a realistic read-back (canonical body + K1 attrs + panel)
      byte-equals `normalize(kitchensink.md)`. *(TC-RT-006.)*
- [x] **Mermaid unwrap:** a `language=mermaid` code macro converts to a
      ```mermaid fence with source bytes identical to the CDATA content; 0
      wrapper artifacts. *(TC-RT-007.)*
- [x] **K1 tolerance:** canonical Storage carrying `ac:schema-version` /
      `ac:macro-id` converts to output byte-identical to the attribute-free
      variant, with 0 diagnostics and no attribute leakage. *(TC-RT-008.)*
- [x] **Unsupported-construct diagnostics:** every Storage-side adversarial
      fixture produces its sidecar-pinned blocking diagnostic with a granular
      stable code + construct + `line:column` location (unknown macros →
      `reverse/unknown-macro`; `div`/`span` → `reverse/unknown-element`;
      nested tables → structural fallback `reverse/unsupported-construct`);
      collect-all enumerates every instance with identical per-instance
      verdicts; malformed input hits the distinct parse-error arm.
      *(TC-RADV-001/002, TC-RDIAG-001..003, TC-TAXO-002, TC-ELEM-001,
      TC-RPIN-001.)*
- [x] **Granular code taxonomy:** the registry carries exactly 7 stable codes
      with literal-pinned values (additions-only); every construct class emits
      its mapped code; the layout family emits exactly one
      `reverse/complex-layout` per layout tree at the outermost element
      (orphaned sections/cells included — never `unknown-element`); macro and
      layout constructs emit exactly one diagnostic per construct.
      *(TC-TAXO-001/002, TC-LAY-001/002.)*
- [x] **Attribute-level detection:** a canonical element with attributes
      beyond the mirror allowlist yields exactly one aggregated blocking
      `reverse/unsupported-attribute` per element — sorted, deduplicated
      attribute names, element-start location, no attribute values; multiple
      offending elements each produce their own diagnostic; K1 attribute names
      are silent on `ac:structured-macro` only and diagnose elsewhere.
      *(TC-ATTR-001/002.)*
- [x] **Task-list integrity:** a non-`ac:task` child of `ac:task-list` yields
      a blocking diagnostic at the child (class per taxonomy) — never a silent
      drop; canonical mixed task/regular lists convert with zero diagnostics.
      *(TC-TASK-001.)*
- [x] **Page context:** a caller-supplied `{pageId?, title?, sourcePath?}` is
      echoed verbatim on blocking, informational, and parse-error arms;
      omitted-when-absent output is byte-identical to the context-free form;
      `sourcePath` absorption and explicit-page-wins precedence hold;
      signatures are optional-parameters only. *(TC-PAGE-001..003.)*
- [x] **Corpus alignment + completeness:** all 12 GH-31 categories have
      storage-side counterparts with pinned sidecar expectations — supported
      categories (emoji, long-page, macro-code, mixed task/regular lists) pin
      zero-diagnostic conversions as the false-positive guard — and every
      non-canonical element/attribute instance in the 21-fixture corpus
      appears in exactly one pinned diagnostic (sidecar deep-equality over the
      full diagnostic arrays). *(TC-CORP-001..003.)*
- [x] **False-positive guard:** zero new diagnostics over corpus A (26), the
      33 forward golden pairs, and the K1 variants; corpus-A round-trip
      byte-equality 100%; forward fixtures byte-unmodified. *(TC-FP-001.)*
- [x] **Render-policy artifact:** an `ac:image` with
      `ri:filename="marksync-mermaid-<hash>.svg"` reports exactly one
      informational `marksync-synthetic-artifact` diagnostic (deep-compared
      against the committed sidecar); the image is never emitted; conversion
      is not blocked. *(TC-RT-009, TC-RDIAG-004.)*
- [x] **Normalizer properties:** deterministic and idempotent over the corpus;
      reverse output is a fixed point of `normalizeMarkdown` for all corpus-A
      fixtures. *(TC-NORM-001/002.)*
- [x] **Library-only boundary:** 0 CLI surface delta; the 33 forward golden
      pairs pass unmodified; all pre-existing tiers green. *(TC-REG-001,
      TC-CLI-001.)*

## 6. References

- [PDR-0002](../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md)
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [TDR-0012 — Reverse Storage XML parser (saxes)](../../decisions/TDR-0012-reverse-storage-xml-parser-saxes.md)
- [TDR-0013 — Reverse Markdown serializer substrate](../../decisions/TDR-0013-reverse-markdown-serializer-substrate.md)
- [TDR-0014 — Reverse diagnostics granular code taxonomy](../../decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md)
- [Safe publish pipeline (forward converter)](./feature-safe-publish.md)
- [Mermaid rendering (policies)](./feature-mermaid-rendering.md)
- [Test spec: reverse conversion](../../quality/test-specs/test-spec-reverse-conversion.md)
- [NFR-REL-4 (conversion fidelity, both directions)](../nonfunctional.md)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
- [Change artifacts (GH-92)](../../changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/)
- [Change artifacts (GH-93)](../../changes/2026-08/2026-08-15--GH-93--unsupported-construct-detection/)
