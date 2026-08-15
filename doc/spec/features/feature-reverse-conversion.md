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
  related_changes: ["GH-92"]
  decisions: [PDR-0002, ADR-0005, TDR-0012, TDR-0013]
  contracts: []
---

# Feature Specification: Reverse Conversion (Storage Format → Markdown)

> The deterministic mirror of the forward converter: Confluence Storage Format
> (XHTML + `ac:`/`ri:` macros) → canonical Markdown for the same GFM subset
> (ADR-0005), with 100% golden round-trip fidelity and never-silently-dropped
> diagnostics (PDR-0002 C-4). Delivered as a library-only foundation (GH-92,
> MS-0003 E1) — no CLI surface; the `resolve` (E2) and `import` (E3) flows are
> its consumers.

## 1. Overview

The reverse converter turns a Confluence Storage Format page body back into
Markdown in a precisely defined **canonical emission form**. It is the exact
mirror of the forward construct mapping (GH-20): every canonical GFM construct
that `renderStorage` emits is recognized and converted back; everything else
produces a blocking diagnostic with a stable code and a Storage location —
never a silent drop (PDR-0002 C-4). Marksync-generated structures are handled
on read-back: the provenance panel is stripped, the mermaid code-macro wrapper
unwraps to a ```mermaid fence, and render-policy synthetic images are reported
as informational diagnostics. Conversion is deterministic — the same Storage
input always produces byte-identical Markdown.

The contract is library-level: `reverseStorage` (fast-fail) and
`reverseStorageCollectAll` (enumeration) in `src/infra/confluence/parse/reverse.ts`.
It performs zero I/O (no network, no filesystem), adds no CLI surface, and is
not yet wired into the `TargetSystem` port — the MS-0003 `resolve` (E2) and
`import` (E3) flows bind to it in their own changes.

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
- **KPIs (delivered, GH-92):**
  - Round-trip fidelity on canonical fixtures (corpus A): **100%** —
    `reverse(forward(md)) === normalize(md)` byte-wise, 0 mismatches.
  - Determinism: identical Storage → byte-identical Markdown in-process and
    across runs (committed snapshot layer).
  - Unsupported-construct classes with stable code + location: **100%** of the
    Storage-side adversarial set.
  - Forward golden fixtures modified: **0**; new CLI commands/flags: **0**.

## 3. Functionality

### 3.1 Capabilities

- **Reverse conversion engine (library):** `reverseStorage(body, opts?)` parses
  Storage XHTML into HAST, classifies each node (canonical / unsupported /
  synthetic artifact), maps recognized constructs to content HAST, and
  serializes to canonical Markdown. Returns
  `Result<ReverseSuccess, ReverseError>` where `ReverseSuccess` is
  `{ markdown, diagnostics: InformationalDiagnostic[] }`. Fast-fail semantics:
  the first blocking diagnostic aborts conversion — partial output is never
  returned (mirroring the forward `findUnsupported` precedent).
- **Collect-all enumeration:** `reverseStorageCollectAll(body)` lists every
  diagnostic instance with per-instance verdicts identical to the fast-fail
  path (`all.diagnostics[0]` deep-equals the fast-fail error) — mirroring the
  forward `findUnsupported`/`findAllUnsupported` parity (GH-20 DEC-1).
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
    `ac:schema-version` and `ac:macro-id` attributes are dropped silently
    (no diagnostic, never in output); output is byte-identical to the
    attribute-free variant. Structural (pretty-print) whitespace is dropped.
- **Two-class diagnostics taxonomy:**
  - **Blocking `unsupported-construct`** — any Storage element/macro outside
    the canonical subset (unknown macros, non-panel info macros, nested tables
    inside `td`/`th`, app/gliffy-class constructs, …) fails conversion with a
    stable code, the construct identity, and a Storage `line:column` location.
    Never silently dropped, never emitted as content.
  - **Informational `marksync-synthetic-artifact`** — recognized marksync
    artifacts (the mermaid render-policy image) reported alongside successful
    conversion; same payload shape (code + construct + location).
  - **Malformed Storage** — input that is not well-formed XML is a distinct
    parse-error arm (`StorageParseError` with code + location + detail);
    conversion cannot proceed; a stable typed error, never a crash.
  - Diagnostic payloads carry construct identity + location only — no
    free-form content echoes (NFR-SEC-1 posture).
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
| `ac:schema-version` / `ac:macro-id` (K1 read-back) | ignored, no diagnostic |
| anything else | blocking `unsupported-construct`: stable code + construct + location |

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
  output; both contract modes agree.
- **Code macro missing its `ac:plain-text-body`:** blocking
  `unsupported-construct` (construct `ac:structured-macro[ac:name='code']`
  (missing body)).
- **Nested tables:** a `<table>` inside `td`/`th` is outside the canonical
  subset → blocking diagnostic (construct `td containing nested table`).
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
| `reverseStorage` / `reverseStorageCollectAll` (`src/infra/confluence/parse/reverse.ts`) | Reverse contract entry points: parse → classify (canonical / unsupported / synthetic artifact) → content-HAST mapping → serialize; fast-fail + collect-all parity | Implemented (GH-92) |
| `hastToMarkdown` (`src/domain/markdown/hast-to-markdown.ts`) | Canonical serializer: `canonicalize()` → `hast-util-to-mdast` → remark-gfm stringify with `{bullet:"-", rule:"-"}` (TDR-0013) | Implemented (GH-92) |
| `normalizeMarkdown` (`src/domain/markdown/normalize.ts`) | Canonical normalizer: forward parse (annotation stripping) → MDAST→HAST → shared serializer; idempotent; reverse output is a fixed point | Implemented (GH-92) |
| Reverse diagnostics (`src/domain/markdown/reverse-diagnostics.ts`) | Two-class taxonomy, stable `REVERSE_CODES` (`reverse/unsupported-construct`, `marksync/synthetic-artifact`, `reverse/parse-error`), `StorageParseError` + `ReverseError` standalone union (not a `MarkSyncError` kind) | Implemented (GH-92) |
| Round-trip harness (`tests/golden/markdown/reverse-round-trip.test.ts`, `reverse-readback.test.ts`) | Golden-tier verification: corpus-A byte equality, determinism, partition-manifest guardrail, read-back fixtures | Implemented (GH-92) |
| Storage-side adversarial set (`tests/adversarial-storage/` + `tests/golden/adversarial/reverse-classification-runner.test.ts`) | Regression-locks reverse diagnostics incl. fast-fail/collect-all parity and the parse-error arm | Implemented (GH-92) |
| `resolve` / `import` flows (E2/E3) | Consumers of the library contract — diffing, patch generation, adoption UX | Future (MS-0003 E2/E3) |

Dependencies added: `saxes@6.0.0` (XML parser, TDR-0012),
`hast-util-to-mdast@^10.1.2` (HAST→MDAST bridge, TDR-0013). Package version
0.9.0.

### 4.3 Key decisions

- **PDR-0002:** E1 scope — the reverse-converter foundation pulled forward
  into MS-0003; C-4 requires unsupported constructs to block with diagnostics,
  never silently drop.
- **ADR-0005:** Storage Format is the body representation (ADF read path
  permanently rejected); the canonical GFM subset is exactly the forward
  converter's; spike K1 defines the read-back normalizations to tolerate.
- **TDR-0012 (Proposed):** saxes as the Storage XML parser — strict,
  namespace-aware, CDATA-correct, position-tracking; no regex extraction.
- **TDR-0013 (Proposed):** unified-stack serializer (`hast-util-to-mdast` +
  remark-gfm) over hand-rolled emission; options layer `{bullet:"-", rule:"-"`
  }` pins the canonical form.

## 5. Acceptance criteria (delivered — GH-92)

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
      fixture (unknown macros, non-panel info macro, app/gliffy class, nested
      tables, raw-HTML block, multi-instance, malformed) produces its
      sidecar-pinned blocking diagnostic with stable code + construct +
      line:column location; collect-all enumerates every instance with
      identical per-instance verdicts; malformed input hits the distinct
      parse-error arm. *(TC-RADV-001/002, TC-RDIAG-001..003.)*
- [x] **Render-policy artifact:** an `ac:image` with
      `ri:filename="marksync-mermaid-<hash>.svg"` reports exactly one
      informational `marksync-synthetic-artifact` diagnostic (deep-compared
      against the committed sidecar); the image is never emitted; conversion
      is not blocked. *(TC-RT-009, TC-RDIAG-004.)*
- [x] **Normalizer properties:** deterministic and idempotent over the corpus;
      reverse output is a fixed point of `normalizeMarkdown` for all corpus-A
      fixtures. *(TC-NORM-001/002.)*
- [x] **Library-only boundary:** 0 CLI surface delta; the 33 forward golden
      pairs pass unmodified; all pre-existing tiers green. *(TC-REG-001.)*

## 6. References

- [PDR-0002](../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md)
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [TDR-0012 — Reverse Storage XML parser (saxes)](../../decisions/TDR-0012-reverse-storage-xml-parser-saxes.md)
- [TDR-0013 — Reverse Markdown serializer substrate](../../decisions/TDR-0013-reverse-markdown-serializer-substrate.md)
- [Safe publish pipeline (forward converter)](./feature-safe-publish.md)
- [Mermaid rendering (policies)](./feature-mermaid-rendering.md)
- [Test spec: reverse conversion](../../quality/test-specs/test-spec-reverse-conversion.md)
- [NFR-REL-4 (conversion fidelity, both directions)](../nonfunctional.md)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
- [Change artifacts (GH-92)](../../changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/)
