---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-20
  type: feat
  status: Proposed
  slug: markdown-pipeline
  title: "[MS2-E3-S3] Markdown pipeline — remark/HAST → Confluence Storage Format (the body-representation half of ADR-0005)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, security, fidelity]
  version_impact: minor
  audience: internal
  security_impact: medium
  risk_level: high
  dependencies:
    internal: [MS2-E2-S1 (GH-14), MS2-E3-S5 (blocked), MS2-E3-S6 (blocked), MS2-E4-S1 (blocked), MS2-E4-S2 (blocked), MS2-E5-S3 (blocked)]
    external: [remark, remark-gfm, rehype, remark-rehype]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver MarkSync's deterministic Markdown → Confluence Storage Format conversion — the body-representation layer of the safe-publish pipeline — proving, on a golden fixture set spanning every canonical GFM construct that `remark-gfm` actually produces, that each survives a byte-stable Storage round-trip, that no unsupported node is ever silently dropped, and that malicious Markdown cannot inject server-side macros — so the sync engine (E3-S6) and drift detection (E3-S5) downstream have a renderer + a Content Hash to reason over.

## 1. SUMMARY

This is the **third story of epic MS2-E3 (Safe publish core)** and the **body-representation half** of ADR-0005. It delivers the Markdown pipeline the safe-publish flow renders every page body through:

1. **A parser** (`parseMarkdown`) — bytes → MDAST via `remark` + `remark-gfm`, validating the canonical GFM subset.
2. **An MDAST→HAST bridge** (via `remark-rehype`) producing the adapter-agnostic HTML AST the renderer walks.
3. **A canonicalizer + content-hash function** — deterministic HAST normalization (attribute order, whitespace) → `sha256`, realizing the **Content Hash** value object that E3-S5 drift detection and E4 mermaid/attachment dedup consume.
4. **The HAST→Storage XHTML renderer** (`renderStorage`) — the visitor implementing the spike-H6-proven construct → Storage mapping (headings, strong/em, del, inline code, links, images, lists+nesting, task-lists, blockquote, fenced code → `<ac:structured-macro name="code">` with CDATA, hr, GFM tables) for every construct `remark-gfm` produces, emitting well-formed XML with `ac:schema-version`/`ac:macro-id` omitted. `<sub>`/`<sup>` are handled **defensively** in the visitor but excluded from the golden fixture set — `remark-gfm` does not parse `~text~`/`^text^` (DEC-7).
5. **An unsupported-node classifier** — nodes outside the canonical subset (raw HTML aside, footnotes, definition lists, math, app content) → the pre-existing `UnsupportedConstruct` error arm; **never silently dropped**.
6. **Golden fixtures** — one `*.md` + one `*.storage.xhtml` pair per canonical GFM construct that `remark-gfm` produces (`tests/golden/fixtures/`), byte-stable Storage snapshots with the spike's `storage-kitchensink.xml` as a reference shape.
7. **Injection-safety property tests** (NFR-SEC-5) — malicious Markdown (macro-injection, `<script>`) → inert escaped output.

The pipeline is **adapter-agnostic up to the last hop**: parsing, the bridge, and canonicalization live in the domain tier (`src/domain/markdown/`, `src/domain/render/`); only the HAST→Storage visitor lives in the Confluence adapter (`src/infra/confluence/render/`) because it emits Storage-specific macros — the body-representation logic this story keeps testable in isolation (story file Background). It emits the **pre-existing** `UnsupportedConstruct { construct; sourcePath }` arm already in `MarkSyncError` (`src/domain/errors.ts:45`) and already handled in every exhaustive site — it does **not** redefine that arm or add a new error kind.

Downstream consumers: the sync engine (E3-S6) wires `parseMarkdown` → `renderStorage` into the push flow; drift detection (E3-S5) and mermaid/attachment dedup (E4-S1/E4-S2) consume the content hash; the adversarial corpus (E5-S3) + CI reuse the golden fixtures.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **MS2-E2-S1 (GH-14) scaffolding is merged** — this story's `blocked_by` dependency, satisfied. It landed the tier skeletons this story fills: `src/domain/markdown/.gitkeep`, `src/domain/render/.gitkeep`, `src/infra/confluence/.gitkeep` (all empty today), plus the `.gitignore`, `tsconfig.json`, `package.json` `"imports"` aliases (`#domain/*`, `#infra/*`, …), the `bun run check` = `lint && format:check && typecheck && test && check:boundaries` gate, and the dep-cruiser tier rules.
- **The `Result<T, E>` channel and the `MarkSyncError` union already carry everything this story needs** — no error-model change is required. `src/domain/result.ts` provides `Result<T, E>` + `Result.ok` / `Result.err`. `src/domain/errors.ts` already has the `{ kind: "UnsupportedConstruct"; construct: string; sourcePath: string }` arm (line 45) **and** the `RenderUnavailable` arm (the `renderBody` port's documented failure, architecture-overview §"Internal interface contracts"); both are already named in `assertNeverMarkSyncError` so the exhaustiveness proof stays intact. This story is the **first producer** of `UnsupportedConstruct` and **reuses `Result` unchanged**.
- **The Markdown dependencies are NOT yet installed.** `.ai/rules/typescript.md` "Planned (not yet installed)" lists `remark`, `remark-gfm`, `rehype`, `remark-rehype` against "MS-0002 E3" — this story is that consuming story and installs them. `mermaid` + `jsdom`/`happy-dom` are explicitly **NOT** this story (E4-S1 mermaid render).
- **ADR-0005 is the load-bearing decision** — settled, `Accepted`. It chose Storage Format (not ADF) as the write target on the strength of spike K1: every GFM construct in the spike's hand-authored kitchensink Storage XML survived a Storage→ADF→Storage round-trip **losslessly** (format equivalence), both representations are API-accepted, Storage is materially simpler to emit from Markdown, and all 5 reference converters write Storage. Its C-3 ("emitted body must be well-formed XML") and "raw inline HTML is sanitised" obligations are converter requirements this story discharges.
- **Spike H6 gave the converter blueprint (Storage-XML round-trip provenance).** `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` lines 17-41 contain the construct → Storage mapping table (~14 construct families: headings, strong/em, del→`<s>`/`<del>`, inline code, `<sub>`/`<sup>`, links, remote/attachment images, lists+nesting, task-lists, blockquote, fenced code → `code` macro, hr, GFM tables). The spike proved these constructs survive a **Storage-XML round-trip** — the kitchensink was hand-authored Storage XML, read back via storage→ADF→storage — **not** markdown→storage. The golden Markdown fixture set is therefore the **`remark-gfm`-reachable subset**: `<sub>`/`<sup>` survived the XML round-trip but are excluded from the Markdown fixtures because `remark-gfm` does not parse `~text~`/`^text^` (PM-DEC-1, DEC-7). The three converter rules forced by the evidence: (1) code bodies **must** use `<![CDATA[…]]>` and **omit** `ac:schema-version`/`ac:macro-id` (Confluence assigns them); (2) the Storage body **must be well-formed XML** (escape entities, balance tags); (3) task-lists cannot mix with regular list items (`<ac:task-list>` is its own block). It also records that raw inline HTML is stripped by the CSF sanitizer and non-GFM extensions (footnotes, definition lists, math) have no native representation.
- **The golden reference fixture exists.** `doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml` is the reference output shape — a full construct-coverage Storage body (headings, inline formatting incl. `<s>` + `<del>` + `<sub>`/`<sup>`, escaped-amp links, remote + attachment `<ac:image>`, nested `<ul>`/`<ol>`, `<ac:task-list>`, blockquote, a `python` code macro with CDATA, `<hr/>`, GFM table). It is a **reference shape only**; per-construct golden Markdown snapshots derive from the **`remark-gfm`-reachable subset** only — `<sub>`/`<sup>` are present in the kitchensink XML (Storage-XML round-trip proven) but have no Markdown fixture (DEC-7).
- **The architecture fixes module residence.** architecture-overview §"Module-residence rules": a new generic Markdown transform lives in `src/domain/render/` (MDAST/HAST-level, adapter-agnostic); a new Confluence-specific render lives in `src/infra/confluence/render/` (HAST→Storage, behind the `TargetSystem` port). The dependency-direction matrix forbids domain → infra and the reverse-direction infra → domain is allowed only "to implement ports". `bun run check:boundaries` (dep-cruiser) enforces all forbidden tier directions at severity `error`.
- **The `renderBody` port contract is already documented.** architecture-overview §"Internal interface contracts" specifies `app → target system port | renderBody | renderBody(mdast, opts) | { bodyRepr, hash } | UnsupportedConstruct` — this story's `renderStorage` realizes that contract for the Confluence adapter.

### 2.2 Pain Points / Gaps

- **No conversion code exists.** The three skeleton directories are empty (`.gitkeep` only). MS-0002 cannot render a single page body until this pipeline lands — every downstream story (E3-S5 drift, E3-S6 sync engine, E4-S1 mermaid, E4-S2 attachments) is blocked on it.
- **No Content Hash function.** The Content Hash value object (UL) — "a deterministic hash of a document or asset body … computed from canonical + normalized content" — has no implementation. Drift detection (E3-S5) cannot compare `renderedBodyHash` against the shared base, and mermaid/attachment dedup (E4) cannot key on a hash, until canonicalization + `sha256` exist.
- **No fidelity guarantee.** ADR-0005 C-1 (lossless Markdown fidelity) and NFR-REL-4 (100% of canonical GFM fixtures survive the round-trip) are unverified in code — the spike proved the *format* round-trips; the *converter* has not been built or golden-tested. Without byte-stable snapshots, a future edit could silently regress a construct.
- **No silent-drop guard.** ADR-0005's "if a future Markdown construct lacks a lossless Storage representation, fall back to a macro or revisit this ADR — **do not silently degrade**" obligation has no enforcer. Without a classifier that emits `UnsupportedConstruct`, a node the converter doesn't recognize could vanish from the published page with no signal.
- **No injection-safety proof.** NFR-SEC-5 (malicious Markdown cannot inject `<ac:structured-macro>` server-side) is a release-blocking security NFR with no property test. Confluence's own sanitizer is defense-in-depth, but MarkSync must not *emit* macro XML derived from source text — that obligation is unverified.
- **No deterministic-output guarantee.** NFR determinism (same input → byte-identical output) and the snapshot-stability rule (testing-strategy §"Snapshot rules") have nothing to lock onto without a canonicalizer and a tested visitor.

## 3. PROBLEM STATEMENT

Because no Markdown→Storage conversion code, no Content Hash function, and no golden fidelity/safety fixtures exist, MarkSync cannot render a page body, cannot give drift detection (E3-S5) or dedup (E4) a hash to reason over, cannot prove the construct-fidelity promise (NFR-REL-4) or the no-silent-drop obligation (ADR-0005), and cannot prove malicious Markdown is inert (NFR-SEC-5) — so the sync engine (E3-S6), drift detection (E3-S5), mermaid render (E4-S1), and attachment upload (E4-S2) downstream have no body-representation layer to build on — so this story must deliver the deterministic Markdown → Confluence Storage Format pipeline once, on the spike-H6 construct → Storage mapping (golden fixtures covering the `remark-gfm`-reachable subset, DEC-7), before any of those consumers can ship.

## 4. GOALS

- **G-1**: Deliver the parser — `parseMarkdown(bytes): Result<MdastRoot, MarkSyncError>` via `remark` + `remark-gfm`, producing MDAST and validating the canonical GFM subset (F-1).
- **G-2**: Deliver the MDAST→HAST bridge configured for the canonical subset, producing the adapter-agnostic HTML AST (F-2).
- **G-3**: Deliver the canonicalizer + content-hash function — deterministic HAST normalization → `sha256`, realizing the Content Hash VO consumed by E3-S5/E4 (F-3).
- **G-4**: Deliver the HAST→Storage XHTML renderer — `renderStorage(hast, opts): Result<{ body; hash }, MarkSyncError>` implementing the spike-H6 construct → Storage mapping for the `remark-gfm`-reachable subset (plus a defensive `<sub>`/`<sup>` path, DEC-7), well-formed XML, CDATA code bodies, omitted `ac:schema-version`/`ac:macro-id` (F-4).
- **G-5**: Deliver the unsupported-node classifier — nodes outside the canonical subset → the pre-existing `UnsupportedConstruct` arm; never silently dropped (F-5, AC-no-silent-drop).
- **G-6**: Deliver the golden fixtures (one `.md` + `.storage.xhtml` pair per canonical `remark-gfm`-reachable GFM construct) with the spike kitchensink as a reference shape, byte-stable (F-6, NFR-REL-4).
- **G-7**: Deliver the injection-safety property tests proving NFR-SEC-5 — malicious Markdown → inert escaped output (F-7).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| fidelity (NFR-REL-4) | **every** canonical GFM fixture that `remark-gfm` produces byte-matches its golden `.storage.xhtml` snapshot (100% of the `remark-gfm`-reachable fixture set; `<sub>`/`<sup>` excluded per DEC-7) |
| code-macro shape | **100%** of fenced code blocks emit `<ac:structured-macro ac:name="code">` with `<ac:plain-text-body><![CDATA[…]]></ac:plain-text-body>`; **0** occurrences of `ac:schema-version` or `ac:macro-id` in output |
| XML well-formedness | **100%** of rendered bodies parse as valid XML (an XML parser consumes them; 0 unbalanced tags; entities escaped) |
| no silent drop | an unsupported node (footnote, math, definition list) → `UnsupportedConstruct` returned, **never** silently omitted (100%) |
| injection safety (NFR-SEC-5) | malicious fixtures (macro-injection text, `<script>` fragments) → output contains **0** `<ac:structured-macro>` elements derived from source and **0** executable content |
| determinism | same input rendered N times → **byte-identical** output across runs (0 bytes diff) |
| hash determinism | same canonical HAST → identical `sha256` content hash; two renders of the same input → identical hash |
| raw-HTML handling | raw inline HTML in source → **escaped** in output (supported-but-escaped); **0** bytes of raw HTML pass through |
| tier purity | `src/infra/confluence/render/` may import domain markdown/render types; the reverse is forbidden; dep-cruiser (`check:boundaries`) passes |
| dependency scope | `remark`/`remark-gfm`/`rehype`/`remark-rehype` installed; `mermaid`/`jsdom`/`happy-dom` **NOT** installed (E4-S1) |
| conversion latency (NFR-PERF-5) | per-page render ≤ **200 ms p95** (informational) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: Confluence API writes — the push flow that POSTs/PATCHes the rendered body is E3-S4 (adapter client) / E3-S6 (sync engine). This story renders bytes; it performs no HTTP.
- **NG-2**: Mermaid render-to-image — the `mermaid`-language code fence is **detected** here (it is a fenced code block like any other), but the in-process SVG/PNG render + upload is E4-S1 (ADR-0002). `mermaid`/`jsdom` are not installed by this story.
- **NG-3**: Image/attachment upload — the local-image `<ri:attachment ri:filename="…"/>` reference is **emitted** here; the actual binary upload + hash-named dedup is E4-S2.
- **NG-4**: Reverse conversion (Storage/ADF → Markdown) — `MS-0005+` (architecture-overview §"Confluence adapter components").
- **NG-5**: Non-GFM extension macros — footnotes/definition-lists/math are classified as `UnsupportedConstruct` here (no macro fallback authored); a future macro-fallback strategy is deferred (ADR-0005 unresolved questions).
- **NG-6**: Reconsidering Storage vs ADF — ADR-0005 is settled and being **implemented**, not reopened.
- **NG-7**: New `MarkSyncError` kinds — this story **reuses** the pre-existing `UnsupportedConstruct` arm and `Result`; it adds no error kind (DEC-2).
- **NG-8**: A DOM-serialization library for output — the visitor is a small, tested string builder over plain HAST objects (DEC-6); no `jsdom`/`xmldom` runtime dep for emission.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Markdown parser (`parseMarkdown`) | The canonical entry to the pipeline: source bytes → MDAST via `remark` + `remark-gfm`. Validates the canonical GFM subset; produces the intermediate the bridge consumes. |
| F-2 | MDAST→HAST bridge | `remark-rehype` produces the HTML AST — the adapter-agnostic intermediate the renderer walks and the canonicalizer hashes. Configured for the canonical subset. |
| F-3 | Canonicalizer + content-hash function | Deterministic HAST normalization (attribute order, whitespace) → `sha256`. Realizes the Content Hash VO; the hash E3-S5 drift + E4 dedup key on. Determinism is the contract (AC-determinism). |
| F-4 | HAST→Storage renderer (`renderStorage`) | The XHTML visitor implementing the spike-H6 construct → Storage mapping for every `remark-gfm`-reachable construct (plus a defensive `<sub>`/`<sup>` path, DEC-7). The body-representation logic of ADR-0005: CDATA code bodies, omitted `ac:schema-version`/`ac:macro-id`, well-formed XML, `<ac:image>`/`<ac:task-list>` macros. |
| F-5 | Unsupported-node classifier | Nodes outside the canonical subset (raw HTML aside, footnotes, definition lists, math, app content) → the pre-existing `UnsupportedConstruct { construct; sourcePath }` arm. Never silently drops (ADR-0005 "do not silently degrade"). |
| F-6 | Golden fixtures (`remark-gfm`-reachable construct set) | Byte-stable `*.md` + `*.storage.xhtml` snapshots — one pair per canonical GFM construct `remark-gfm` produces (`<sub>`/`<sup>` excluded per DEC-7) — the NFR-REL-4 fidelity bar, with the spike kitchensink XML as a reference shape. Reused by E5-S3 adversarial corpus + CI. |
| F-7 | Injection-safety property tests | NFR-SEC-5: malicious Markdown (macro-injection, `<script>`) → inert escaped output. Proves the converter does not emit server-side macros derived from source. |

### 5.1 Capability Details

- **F-1 (Parser).** `parseMarkdown(bytes: Uint8Array | string, opts?): Result<MdastRoot, MarkSyncError>` runs `remark` with `remark-gfm` (tables, strikethrough, task-lists, autolink-literals). It produces an MDAST root. The `Result`-typed signature is retained for **port-contract alignment**, but in MS-0002 `parseMarkdown` is treated as **total** — `remark`/`remark-gfm` is an extremely tolerant parser that produces a best-effort MDAST for virtually any input, so a genuine parse failure is an **invariant violation** that `throw`s (per typescript.md error handling: "throw is for invariant violations"). It is **not** surfaced as `UnsupportedConstruct` — that arm is for *unrecognized constructs*, not malformed input (DEC-2, DEC-8). The parser does not invent constructs: the canonical subset is exactly what `remark-gfm` recognizes; anything beyond it is handed to F-5 for classification. `sourcePath` flows through `opts` so any downstream `UnsupportedConstruct` carries provenance.

- **F-2 (MDAST→HAST bridge).** The bridge converts MDAST → HAST (the HTML AST) via `remark-rehype`, configured for the canonical subset so that node kinds outside it are preserved enough to be classified (F-5) rather than lost. HAST is the adapter-agnostic intermediate: the canonicalizer (F-3) hashes it and the Storage visitor (F-4) walks it. Keeping this step in the domain tier (DEC-1) means a future non-Confluence adapter could consume the same HAST.

- **F-3 (Canonicalizer + content hash).** `canonicalize(hast): CanonicalHast` produces a deterministic form of the HAST — stable attribute order, normalized whitespace, no source-position metadata — so that two semantically-identical documents hash identically. `contentHash(canonicalHast): string` computes `sha256` (native `crypto.subtle`/`crypto.createHash`; no crypto library per typescript.md dependency rules) over the canonicalized HAST and returns the lowercase-hex digest. This realizes the **Content Hash** VO ("computed from canonical + normalized content", UL). The function returns the **raw digest**; the wire-format/prefix used on `renderedBodyHash` (e.g. a `sha256:` prefix) is E3-S5's concern as the binding consumer (OQ-1). The hash is computed here so the same canonical form feeds both the hash and (optionally) the render, guaranteeing they cannot drift apart.

- **F-4 (HAST→Storage renderer).** `renderStorage(hast, opts): Result<{ body: string; hash: string }, MarkSyncError>` is the XHTML visitor implementing the spike-H6 mapping table verbatim:
  - Headings `<h1>`–`<h6>`; `<strong>`/`<em>`; strikethrough → `<s>` (or `<del>`); inline `<code>`. `<sub>`/`<sup>` are **handled defensively** (render to `<sub>`/`<sup>` if a future remark extension or raw HTML ever produces such a node) but are **excluded from the golden fixture set** — `remark-gfm` does not parse `~text~`/`^text^` (DEC-7).
  - Links `<a href>` (entities preserved, e.g. `&amp;`); images → remote `<ac:image ac:alt="…"><ri:url ri:value="url"/></ac:image>` or local `<ac:image><ri:attachment ri:filename="…"/></ac:image>` (attachment resolution is E4-S2; the reference is emitted here).
  - Lists: `<ul>`/`<ol>` with nested `<li>`; task-lists → `<ac:task-list><ac:task><ac:task-status>incomplete|complete</ac:task-status><ac:task-body>…</ac:task-body></ac:task></ac:task-list>`.
  - Blockquote `<blockquote>`; thematic break `<hr/>`; GFM tables `<table><thead><tr><th>…</thead><tbody>…`.
  - Fenced code → `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">{lang}</ac:parameter><ac:plain-text-body><![CDATA[{code}]]></ac:plain-text-body></ac:structured-macro>` — code bodies **in CDATA** (literal `<`/`&` preserved), `ac:schema-version`/`ac:macro-id` **omitted** (Confluence assigns them — spike rule #1).
  The visitor guarantees well-formed XML (balanced tags, escaped entities outside CDATA — spike rule #2). It is a small, tested **string-builder** visitor over plain HAST objects (DEC-6) — no DOM-serialization library. On encountering an unsupported node, it delegates to F-5 (does not silently emit nothing). The `mermaid` language on a fenced code block is **detected** here (it is a code block) but its render-to-image is E4-S1; this story emits the code macro for it like any other fenced block (NG-2).

- **F-5 (Unsupported-node classifier).** Walks MDAST/HAST for node kinds outside the canonical subset — raw inline HTML *blocks* intended to pass through, footnotes, definition lists, math, app content — and returns `err({ kind: "UnsupportedConstruct"; construct: <node-kind>; sourcePath })` using the **pre-existing** `MarkSyncError` arm (DEC-2). The classifier **never silently drops** a node: a construct with no Storage representation is either mapped (canonical subset) or classified (everything else). Raw **inline** HTML is the documented exception (DEC-4): the spike proved the Confluence sanitizer strips it, so the converter **escapes** it (supported-but-escaped) rather than classifying it — preserving the text without injecting it. Task-list + regular-list mixing is detected and surfaced as a warning per spike rule #3 (DEC-5) because it cannot be represented.

- **F-6 (Golden fixtures).** `tests/golden/fixtures/` holds one `*.md` + one `*.storage.xhtml` pair per canonical GFM construct that `remark-gfm` produces (headings, paragraphs, strong, em, del/strikethrough, inline code, links incl. ampersand, images remote + attachment, nested lists, task-lists, blockquote, fenced code, hr, GFM tables, autolinks) — **not** padded with constructs unreachable from plain `remark-gfm` such as `<sub>`/`<sup>` (DEC-7). The spike's `examples/pages/storage-kitchensink.xml` is the **reference shape**; per-construct snapshots derive only from the `remark-gfm`-reachable subset. Snapshots are **file** snapshots (`toMatchSnapshot`) per testing-strategy §"Snapshot rules" — byte-stable and reviewable in PR diffs. Updates are explicit (`bun test --update-snapshots`), never automatic in CI. The fixtures are reused by E5-S3 (adversarial corpus) and CI.

- **F-7 (Injection-safety property tests).** Property tests over malicious inputs: a document whose text contains `<ac:structured-macro>`/`<ac:parameter>`/`<ac:plain-text-body>` fragments, `<script>` tags, or macro-injection payloads. The converter must **escape** them so the output is inert — no `<ac:structured-macro>` element is *injected from source* (a legitimately rendered code-fence code macro is the converter's own emission, not an injection), and no executable content survives. This discharges NFR-SEC-5 and the ADR-0005 raw-HTML-sanitisation obligation.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — The pipeline (parse → bridge → canonicalize/hash → render):
  source bytes
    → parseMarkdown(bytes)              → MdastRoot  (total in MS-0002; a genuine
                                         parse failure is an invariant violation
                                         that throws — DEC-8)
    → mdastToHast(mdast)                → HastRoot  (canonical subset configured)
    → canonicalize(hast)                → CanonicalHast (deterministic form)
    → contentHash(canonicalHast)        → sha256 hex digest  (Content Hash VO)
    → renderStorage(hast, opts)         → ok({ body: <Storage XHTML>, hash }) | err(UnsupportedConstruct)

Flow 2 — Unsupported node (no silent drop — ADR-0005 "do not silently degrade"):
  converter meets a footnote / definition-list / math node
    → classifier returns err({ kind: "UnsupportedConstruct"; construct; sourcePath })
    → E3-S6 surfaces it in the plan; E5-S3 covers it in the adversarial corpus.
    (Never: the node vanishes from the published body with no signal.)

Flow 3 — Malicious input → inert output (NFR-SEC-5):
  source contains `<ac:structured-macro>…</ac:structured-macro>` or `<script>` as TEXT
    → the text is entity-escaped on emission
    → output contains 0 server-side macros derived from source, 0 executable content.
    (A fenced ```code block``` whose body literally is those characters is wrapped in
     the converter's own CDATA code macro — that is the converter emitting, not injecting.)

Flow 4 — Raw inline HTML (supported-but-escaped — DEC-4):
  source Markdown contains `<b>raw</b>` inline HTML
    → the CSF sanitizer would strip it (spike H6)
    → the converter ESCAPES it (text preserved, no passthrough) → inert text in output.

Flow 5 — Mermaid fence detected, render deferred (NG-2):
  source contains a ```mermaid fenced code block
    → this story emits the code macro for it like any fenced block (detected)
    → the in-process SVG/PNG render + upload is E4-S1 (NOT installed here).

Flow 6 — Local image reference emitted, upload deferred (NG-3):
  source Markdown references a local image ![alt](./diagram.png)
    → this story emits <ac:image><ri:attachment ri:filename="diagram.png"/></ac:image>
    → the binary upload + hash-named dedup is E4-S2.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `parseMarkdown` (`src/domain/markdown/parse.ts`) — remark + remark-gfm parser (F-1).
- MDAST→HAST bridge (`src/domain/markdown/mdast-to-hast.ts`) — remark-rehype (F-2).
- Canonicalizer + content-hash function (`src/domain/render/canonicalize.ts`) — deterministic HAST → sha256 (F-3).
- HAST→Storage renderer (`src/infra/confluence/render/storage.ts`) — `renderStorage` (F-4).
- Unsupported-node classifier (`src/domain/markdown/unsupported.ts`) — emits the pre-existing `UnsupportedConstruct` arm (F-5).
- Golden fixtures — one `*.md` + `*.storage.xhtml` pair per canonical `remark-gfm`-reachable GFM construct (`tests/golden/fixtures/`) (F-6).
- Injection-safety property tests (NFR-SEC-5) (F-7).
- Dependency install: `remark`, `remark-gfm`, `rehype`, `remark-rehype`.

### 7.2 Out of Scope

- [OUT] Confluence API writes (POST/PATCH pages) — E3-S4 / E3-S6 (NG-1).
- [OUT] Mermaid render-to-image — detected here, rendered in E4-S1 (NG-2).
- [OUT] Image/attachment binary upload + dedup — `<ri:attachment>` emitted here, upload in E4-S2 (NG-3).
- [OUT] Reverse conversion (Storage/ADF → Markdown) — MS-0005+ (NG-4).
- [OUT] Macro fallbacks for footnotes/definition-lists/math — classified as `UnsupportedConstruct` here; fallback strategy deferred (NG-5).
- [OUT] Reconsidering Storage vs ADF — ADR-0005 settled (NG-6).
- [OUT] New `MarkSyncError` kinds — reuses `UnsupportedConstruct`; adds none (NG-7).
- [OUT] A DOM-serialization runtime library — string-builder visitor only (NG-8).

### 7.3 Deferred / Maybe-Later

- **Macro fallbacks for non-GFM extensions** — footnotes/definition-lists/math could later render via a Confluence macro instead of being classified; deferred until a construct is actually required (ADR-0005 unresolved questions).
- **Content-hash prefix/wire-format** — this story returns the raw sha256 digest; the `sha256:`-prefixed `renderedBodyHash` wire format is E3-S5's binding concern (OQ-1).
- **Canonicalization depth** — the normalization rules sufficient for AC-determinism + E3-S5 drift are delivered here; richer semantic normalization (e.g. whitespace-insensitive inline equivalence) can grow as drift false-positives (NFR-REL-3) demand.
- **Streaming/large-doc render** — per-page render is bounded by NFR-PERF-5 (≤200 ms p95, informational); streaming is not needed at MS-0002 page scales.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story performs no HTTP. It renders bytes; the push flow (E3-S6) + adapter client (E3-S4) carry them to the API.

### 8.2 Events / Messages

No events. The UL conceptual "Unsupported Construct" signal is realized as `err({ kind: "UnsupportedConstruct"; construct; sourcePath })` — a `Result` value consumed by E3-S6 (surfaced in the plan) and E5-S3 (adversarial corpus). No event bus in MS-0002.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `MdastRoot` | The MDAST tree from `remark`/`remark-gfm` — the canonical parse intermediate (adapter-agnostic). |
| DM-2 | `HastRoot` / `CanonicalHast` | The HTML AST from `remark-rehype`, and its deterministic canonicalized form (attribute order + whitespace normalized). The form the hash is computed over and the renderer walks. |
| DM-3 | `RenderedBody` (`{ body; hash }`) | The `renderStorage` success payload — the Storage XHTML body string + the Content Hash. Realizes the architecture-overview `renderBody → { bodyRepr, hash }` port contract. |
| DM-4 | Content Hash (UL VO, first-produced) | `sha256` over canonicalized HAST, returned as lowercase hex. First-produced here; consumed by E3-S5 (drift `renderedBodyHash`) + E4-S1/E4-S2 (dedup). The UL "Content Hash" value object. |
| DM-5 | `UnsupportedConstruct` arm (pre-existing, first-produced) | `{ kind: "UnsupportedConstruct"; construct: string; sourcePath: string }` — already in `MarkSyncError` (`src/domain/errors.ts:45`) and `assertNeverMarkSyncError`. This story is its **first producer**; it is **not redefined** and **no new kind is added** (DEC-2). |
| DM-6 | Golden fixture layout | `tests/golden/fixtures/*.md` + `*.storage.xhtml` — one pair per canonical `remark-gfm`-reachable GFM construct (`<sub>`/`<sup>` excluded, DEC-7); byte-stable file snapshots. Reused by E5-S3 + CI. |

### 8.4 External Integrations

No external services are contacted (the API write is E3-S4). New **runtime** dependencies installed by this story: `remark`, `remark-gfm`, `rehype`, `remark-rehype` (the unified ecosystem — the **only** runtime deps), pinned per typescript.md dependency rules (`^` major, exact lock). Type-only `@types/mdast` / `@types/hast` may be added as **devDependencies** (zero runtime surface; permitted beyond the 4 runtime deps — DoR iter-1 Finding 7). **Not** installed here: `mermaid`, `jsdom`/`happy-dom` (E4-S1). No HTTP/crypto library — native `fetch` is unused; hashing uses native `crypto` (typescript.md "No crypto library").

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story adds net-new modules in three empty skeleton directories, installs four Markdown-pipeline dependencies, and adds golden fixtures. It **reuses** `Result<T, E>` and the pre-existing `UnsupportedConstruct` arm unchanged — no error-model change, so `assertNeverMarkSyncError` and every exhaustive handler site are untouched. No existing public API signature changes. The PM-doc risks (pm-notes `doc_risks`) — tagging the Markdown-pipeline component delivered in feature-safe-publish/architecture-overview/UL, moving remark/rehype from "Planned" to "Installed" in typescript.md — are handled in phase 7 (`@doc-syncer`), not here.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | fidelity (NFR-REL-4) | **every** canonical GFM fixture that `remark-gfm` produces byte-matches its golden `.storage.xhtml` snapshot (100% of the `remark-gfm`-reachable fixture set; `<sub>`/`<sup>` excluded per DEC-7) |
| NFR-2 | code-macro shape | **100%** of fenced code blocks emit CDATA bodies; **0** occurrences of `ac:schema-version` / `ac:macro-id` in output |
| NFR-3 | XML well-formedness | **100%** of rendered bodies parse as valid XML (XML-parser consumption; 0 unbalanced tags; entities escaped outside CDATA) |
| NFR-4 | no silent drop | an unsupported node (footnote / math / definition list) → `UnsupportedConstruct` returned, **never** silently omitted |
| NFR-5 | injection safety (NFR-SEC-5) | malicious fixtures → output contains **0** `<ac:structured-macro>` derived from source and **0** executable content |
| NFR-6 | determinism | same input rendered N times → **byte-identical** output (0 bytes diff) |
| NFR-7 | hash determinism | same canonical HAST → identical `sha256`; two renders of the same input → identical hash |
| NFR-8 | raw-HTML handling | raw inline HTML in source → **escaped** in output (supported-but-escaped); 0 bytes passthrough |
| NFR-9 | task-list isolation | a doc mixing `<ac:task-list>` with regular list items → a warning is emitted (spike rule #3) |
| NFR-10 | tier purity | `src/infra/confluence/render/` may import domain markdown/render types; the reverse forbidden; `check:boundaries` (dep-cruiser) passes |
| NFR-11 | dependency scope | **runtime**: `remark`/`remark-gfm`/`rehype`/`remark-rehype` installed (the 4 unified packages); type-only `@types/mdast`/`@types/hast` devDependencies permitted (zero runtime surface); `mermaid`/`jsdom`/`happy-dom` **not** installed |
| NFR-12 | conversion latency (NFR-PERF-5) | per-page render ≤ **200 ms p95** (informational) |
| NFR-13 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry. `UnsupportedConstruct` surfaces (at the E3-S6 boundary) through the established GH-16 `CommandResult` contract as a stable `error.code` mapped to its exit class. Per typescript.md logging conventions, no rendered body content is serialized to logs — only structural identifiers (`{ kind: "UnsupportedConstruct", construct }`); `sourcePath` travels via the structured `error` channel (redaction-layer-governed), not free-form logging.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining: a construct is silently dropped instead of classified → the user publishes an incomplete page with no signal (violates ADR-0005 "do not silently degrade") | H | M | F-5 classifier returns `UnsupportedConstruct` for every non-canonical node; AC-F5-1 + property tests over unsupported kinds (footnote, math, definition list) assert none vanish. | L |
| RSK-2 | Malicious Markdown injects a server-side `<ac:structured-macro>` from source text (NFR-SEC-5) → macro executes on publish | H | M | Text is entity-escaped on emission; CDATA wraps only code-fence bodies; F-7 property tests assert 0 injected macros + 0 executable content. Confluence's sanitizer is defense-in-depth, not the primary control. | L |
| RSK-3 | Non-deterministic output breaks byte-stability → golden snapshots churn / drift detection false-positives | H | M | F-3 canonicalizer normalizes attribute order + whitespace before hashing; the visitor emits no random/time-based data; snapshot updates are explicit (testing-strategy). AC-F4-5 (determinism) + AC-F3-1 (hash determinism). | L |
| RSK-4 | A `remark`/`rehype` major-version upgrade changes the MDAST/HAST shape → golden drift across releases | M | L | Pin major versions in `package.json`; exact lock committed; re-baseline snapshots as an explicit reviewed action per testing-strategy §"Snapshot rules". | L |
| RSK-5 | A tier violation sneaks in (domain importing infra, or infra importing app/cli) | M | L | dep-cruiser (`check:boundaries`) enforces the matrix at severity `error`; AC-Q-1 asserts `bun run check` exits 0. | L |
| RSK-6 | The content-hash interface defined here churns when E3-S5/E4 consume it | M | L | The function returns the raw `sha256` digest; wire-format/prefix is the consumer's concern (OQ-1). E3-S5/E4 depend on this story (blocked), so the interface is reviewed before they build. | L |
| RSK-7 | Ill-formed XML reaches Confluence → HTTP 400 (ADR-0005 C-3) | H | L | AC-F4-3 asserts every rendered body parses as valid XML (balanced tags, escaped entities); NFR-3 makes well-formedness a measurable threshold. | L |

## 12. ASSUMPTIONS

- ADR-0005 (Storage Format, not ADF) is settled (`Accepted`) and being **implemented**, not reconsidered (DEC / NG-6). Its C-1 (lossless fidelity) is proven by spike K1; C-3 (well-formed XML) is a converter obligation discharged here.
- Spike H6 is authoritative for the construct mapping: the construct → Storage table (~14 families) proved a **Storage-XML round-trip** (the spike XML was hand-authored kitchensink) — it did **not** prove markdown→storage for `<sub>`/`<sup>` (`remark-gfm` cannot produce them). The golden Markdown fixtures derive from the `remark-gfm`-reachable subset (PM-DEC-1, DEC-7). The three converter rules (CDATA code bodies; omit `ac:schema-version`/`ac:macro-id`; task-list is its own block) are the blueprint (cited, not re-derived).
- The `Result<T, E>` channel (`src/domain/result.ts`) and the `MarkSyncError` union — including the `UnsupportedConstruct` arm (`src/domain/errors.ts:45`) and `assertNeverMarkSyncError` — are stable and reused unchanged. This story adds **no** error kind.
- The empty skeletons `src/domain/markdown/`, `src/domain/render/`, `src/infra/confluence/` are the intended residences per architecture-overview §"Module-residence rules" (DEC-1).
- `remark`, `remark-gfm`, `rehype`, `remark-rehype` install cleanly under Bun; `mermaid`/`jsdom`/`happy-dom` are out of scope (E4-S1).
- The golden reference `storage-kitchensink.xml` is the target output shape; per-construct snapshots derive from it and are reviewed on change.
- Downstream consumers (E3-S5, E3-S6, E4-S1, E4-S2, E5-S3) are blocked on this story and will adopt the `parseMarkdown` / `renderStorage` / content-hash / `UnsupportedConstruct` / golden-fixture interfaces as specified here.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) | Scaffolding: tier skeletons, `tsconfig.json`, `package.json` `"imports"`, dep-cruiser rules, `bun run check`. Merged. |
| Depends on | ADR-0005 | Load-bearing: Storage (not ADF); C-1 lossless; C-3 well-formed XML; raw-HTML-sanitised obligation. |
| Depends on | Spike H6 | The construct → Storage mapping table (~14 families; Storage-XML round-trip provenance) + 3 converter rules + the kitchensink reference fixture; golden Markdown fixtures cover the `remark-gfm`-reachable subset (DEC-7). |
| Depends on | `Result<T,E>` / `MarkSyncError` (GH-14/GH-15) | The error channel + the pre-existing `UnsupportedConstruct` arm. Reused, not redefined. |
| Depends on | typescript.md / testing-strategy.md | Tier rules, dependency rules, snapshot-stability rules, golden-fixture tier. |
| Installs | `remark`, `remark-gfm`, `rehype`, `remark-rehype` | The unified Markdown ecosystem (planned "MS-0002 E3"). |
| Blocks | MS2-E3-S5 (drift) | Consumes the content hash for `renderedBodyHash` comparison. |
| Blocks | MS2-E3-S6 (sync engine) | Wires `parseMarkdown` → `renderStorage` into the push flow; surfaces `UnsupportedConstruct`. |
| Blocks | MS2-E4-S1 (mermaid) | The `mermaid` fence is detected here; render + dedup consume the content hash. |
| Blocks | MS2-E4-S2 (attachments) | The `<ri:attachment>` reference is emitted here; upload + dedup consume the content hash. |
| Blocks | MS2-E5-S3 (adversarial corpus) | Reuses the golden fixtures + the injection-safety property tests. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Does `contentHash` return bare lowercase hex or a `sha256:`-prefixed string? | The UL "Content Hash" is a string VO; the lock/binding field `renderedBodyHash` (GH-19) suggests a prefixed wire format. | Resolved → the canonicalize module returns the **raw lowercase-hex sha256 digest**; any `sha256:` prefix / wire-format is applied by the E3-S5 binding consumer. This story owns the deterministic digest; the consumer owns the wire format. |

> No question requires `@decision-advisor` escalation: ADR-0005 is settled, spike H6 gave the exact mapping, and the CEO-resolved risks (R1 raw-HTML escape, Q1 task-list mixing) are recorded as DEC-4/DEC-5. OQ-1 is a specification detail resolved by separating the digest (this story) from the wire format (consumer).

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Pipeline is MDAST→HAST→Storage with adapter-agnostic intermediates; only the final HAST→Storage visitor lives in the Confluence adapter (`src/infra/confluence/render/`).** Parsing, the bridge, and canonicalization live in the domain tier (`src/domain/markdown/`, `src/domain/render/`). | Matches architecture-overview §"Module-residence rules" (generic Markdown transform = `domain/render`; Confluence-specific = `infra/confluence/render`) and the story file Background ("to keep this story testable in isolation, the HAST→Storage renderer lives here too — it's the body-representation logic; the adapter merely carries the bytes"). Keeps the body-representation logic testable in isolation and leaves the door open for a future non-Confluence adapter consuming the same HAST. | 2026-07-09 |
| DEC-2 | **Emit the pre-existing `UnsupportedConstruct { construct; sourcePath }` arm (already in `MarkSyncError` + `assertNeverMarkSyncError`); do NOT redefine it and do NOT add a new error kind.** | The arm was landed speculatively in GH-14 (DEC-1 superset) and is already handled in every exhaustive site. This story is its **first producer**. The "no silent drop" obligation (ADR-0005) is discharged by emitting it, not by adding new machinery. Adding a kind is unwarranted — the recovery action (surface + halt/skip) matches an existing kind (typescript.md "add a kind only when the recovery action differs"). | 2026-07-09 |
| DEC-3 | **Content Hash = `sha256` of canonicalized HAST, defined in `src/domain/render/canonicalize.ts`; the function returns the raw lowercase-hex digest.** | Realizes the UL "Content Hash" VO ("computed from canonical + normalized content"). Same canonical form feeds the hash and (optionally) the render, so they cannot drift. Consumer (E3-S5) owns the wire format (OQ-1). Native `crypto` — no crypto library (typescript.md). | 2026-07-09 |
| DEC-4 | **Raw inline HTML is ESCAPED (supported-but-escaped), not passed through and not classified as `UnsupportedConstruct`.** (CEO-recorded risk R1.) | Spike H6 proved the Confluence CSF sanitizer strips raw inline HTML; passing it through is pointless and risky. Escaping preserves the text content without injecting raw HTML — the lowest-surprise choice that neither drops content nor emits unsanitised markup. | 2026-07-09 |
| DEC-5 | **Task-list + regular-list mixing emits a warning; `<ac:task-list>` is its own block.** (CEO-recorded question Q1.) | Spike H6 converter rule #3: task-lists cannot mix with regular list items in Storage. The construct is unrepresentable, so the converter surfaces it rather than silently producing wrong output. | 2026-07-09 |
| DEC-6 | **HAST→Storage emission uses a small, tested string-builder visitor over plain HAST objects — no DOM-serialization library.** | Story file Technical approach: HAST nodes are plain objects; a string builder is sufficient and avoids a runtime dep. Well-formedness is enforced by golden tests + the AC-F4-3 XML-parse assertion (NFR-3), not by a serializer. | 2026-07-09 |
| DEC-7 | **`<sub>`/`<sup>` are handled defensively in the HAST→Storage visitor but excluded from the golden Markdown fixture set.** *(DoR iter-1, PM-DEC-1.)* | `remark-gfm` does not parse `~text~`/`^text^` (non-GFM), so those HAST nodes are unreachable from canonical GFM input; the spike's `<sub>`/`<sup>` ✅ came from the hand-authored kitchensink **Storage XML**, proving only Storage-XML round-trip, not markdown→storage. The visitor still renders such a node correctly if a future remark extension or raw HTML produces one (defensive), preserving the round-trip property the spike observed. Keeping the dependency scope to the 4 unified packages (no `remark-sub-super`) and not padding the fidelity bar with unreachable constructs is the honest, minimal-surface choice. | 2026-07-09 |
| DEC-8 | **`parseMarkdown` keeps the `Result<MdastRoot, MarkSyncError>` signature but is treated as *total* in MS-0002 — a genuine parse failure is an invariant violation that `throw`s; `UnsupportedConstruct` is not overloaded for parse failures.** *(DoR iter-1, PM-DEC-2.)* | `architecture-overview.md:219` documents the parse port as `→ MdastRoot \| ParseError`, but `ParseError` does not exist in `MarkSyncError` and NG-7 forbids adding error kinds. `remark`/`remark-gfm` is effectively total (extremely tolerant; always produces a best-effort MDAST), so a true parse failure is an invariant violation → `throw` (typescript.md: "throw is for invariant violations"). `UnsupportedConstruct` is for *unrecognized constructs*, not malformed input (DEC-2). The `architecture-overview.md:219` `ParseError` reference is a documented-contract drift to be reconciled in phase-7 doc-sync (`@doc-syncer`), flagged in pm-notes `doc_risks`. | 2026-07-09 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Markdown parser (`src/domain/markdown/parse.ts`) | New — `parseMarkdown` (remark + remark-gfm) |
| MDAST→HAST bridge (`src/domain/markdown/mdast-to-hast.ts`) | New — remark-rehype, canonical subset |
| Unsupported-node classifier (`src/domain/markdown/unsupported.ts`) | New — emits pre-existing `UnsupportedConstruct` |
| Canonicalizer + content hash (`src/domain/render/canonicalize.ts`) | New — deterministic HAST → `sha256` (Content Hash VO) |
| HAST→Storage renderer (`src/infra/confluence/render/storage.ts`) | New — `renderStorage` XHTML visitor (spike-H6 mapping) |
| Golden fixtures (`tests/golden/fixtures/`) | New — one `*.md` + `*.storage.xhtml` pair per canonical `remark-gfm`-reachable GFM construct |
| `package.json` dependencies | Updated — `remark`, `remark-gfm`, `rehype`, `remark-rehype` added |
| `Result<T,E>` / `MarkSyncError` | **Unchanged** — reused; `UnsupportedConstruct` arm first-produced, not redefined |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria, which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F4-1 (NFR-REL-4) | **Given** any canonical GFM fixture that `remark-gfm` produces, **when** it is parsed + bridged + rendered to Storage, **then** the output **byte-matches** its golden `.storage.xhtml` snapshot — 100% of the `remark-gfm`-reachable fixture set passes. `<sub>`/`<sup>` are out of this bar (DEC-7). | F-1, F-2, F-4, F-6, NFR-1 | AC1 (NFR-REL-4) |
| AC-F4-2 | **Given** a fenced code block, **when** it is rendered, **then** the body is wrapped in `<ac:plain-text-body><![CDATA[…]]></ac:plain-text-body>` inside `<ac:structured-macro ac:name="code">`; and **given** any rendered output, **then** it contains **0** occurrences of `ac:schema-version` or `ac:macro-id`. | F-4, NFR-2 | AC2 |
| AC-F4-3 | **Given** any rendered Storage body, **when** it is parsed by an XML parser, **then** it is well-formed (0 unbalanced tags; entities escaped outside CDATA) — 100% of fixtures pass. | F-4, NFR-3 | AC3 |
| AC-F5-1 | **Given** a document containing an unsupported node (footnote, raw-HTML *block*, math, definition list), **when** the pipeline runs, **then** it returns `err({ kind: "UnsupportedConstruct"; construct; sourcePath })` — **never** a silent omission. | F-5, NFR-4 | AC4 |
| AC-F4-4 (NFR-SEC-5) | **Given** a malicious fixture (source text containing `<ac:structured-macro>…`, `<script>`, or macro-injection payloads), **when** it is rendered, **then** the output contains **0** `<ac:structured-macro>` elements derived from source and **0** executable content (text is escaped/inert). | F-4, F-7, NFR-5 | AC5 (NFR-SEC-5) |
| AC-F4-5 | **Given** the same input rendered N times, **then** every run produces **byte-identical** output (0 bytes diff) — golden-snapshot stability. | F-3, F-4, NFR-6 | AC6 |
| AC-F3-1 | **Given** the same canonical HAST, **then** `contentHash` returns the identical `sha256` digest; and **given** two renders of the same input, **then** both report the identical hash. | F-3, NFR-7 | AC6 (determinism, hash) |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + format:check + typecheck + test + check:boundaries) runs, **then** it exits **0**; and dep-cruiser confirms `src/infra/confluence/render/` may import domain markdown/render types but **not vice versa**. | F-4, NFR-10, NFR-13 | AC7 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** Depends on GH-14 scaffolding (merged); reuses `Result`/`MarkSyncError` unchanged. Blocks E3-S5, E3-S6, E4-S1, E4-S2, E5-S3.
- **Merge strategy:** Conventional Commits (TDR-0008); scope `feat(markdown)` or `feat(render)` is appropriate.
- **Ordering within the story:** (1) install `remark`/`remark-gfm`/`rehype`/`remark-rehype` + the `parseMarkdown` parser + a smoke parse test; (2) land the MDAST→HAST bridge; (3) land the canonicalizer + `contentHash` (hash determinism test); (4) land the unsupported-node classifier emitting the pre-existing arm; (5) land the HAST→Storage renderer incrementally — one construct group at a time against its golden snapshot (headings → inline → links/images → lists/task-lists → blockquote/hr → code macro → tables); (6) land the golden fixtures (one pair per canonical `remark-gfm`-reachable GFM construct) + the kitchensink parity test; (7) land the NFR-SEC-5 injection-safety property tests. Each step is independently testable.
- **After merge:** E3-S6 wires `parseMarkdown` → `renderStorage` into the push flow; E3-S5 consumes the content hash for `renderedBodyHash`; E4-S1 detects the `mermaid` fence and consumes the hash for dedup; E4-S2 resolves `<ri:attachment>` references; E5-S3 reuses the golden fixtures + injection tests.
- **Phase 7 doc-sync (`@doc-syncer`):** tag the Markdown-pipeline component delivered in `feature-safe-publish.md` §4.2 + `architecture-overview.md` (Markdown parser + Confluence Storage renderer components; `related_changes` += GH-20); bind the Body Representation + Content Hash VOs to their code constructs in `ubiquitous-language.md` (`related_changes` += GH-20); move `remark`/`remark-gfm`/`rehype`/`remark-rehype` from "Planned" to "Installed" in `.ai/rules/typescript.md` (keep `mermaid`/`jsdom` planned — E4-S1); populate ADR-0005 "Lessons Learned (Retrospective)".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield; no prior rendered bodies exist. The first push (E3-S6) is the first time a Storage body is produced for a page; the content hash is computed on demand. Golden fixtures are committed (not migrated).

## 20. PRIVACY / COMPLIANCE REVIEW

The pipeline renders source Markdown to Storage XHTML; it processes no credentials, tokens, or PII beyond whatever document text the author committed. No outbound network calls (the API write is E3-S4). Rendered-body content is not serialized to logs (§10). NFR-SEC-5 (injection safety) is the security-relevant NFR — discharged by F-7. The committed golden fixtures contain only synthetic test content.

## 21. SECURITY REVIEW HIGHLIGHTS

- **NFR-SEC-5 is the load-bearing security property** — malicious Markdown cannot inject server-side `<ac:structured-macro>` from source. Text is entity-escaped on emission; CDATA wraps only code-fence bodies (the converter's own emission, not an injection). F-7 property tests assert inert output (RSK-2).
- **Raw inline HTML is escaped, not passed through** (DEC-4) — the spike proved Confluence strips it anyway; escaping is defense-in-depth that also prevents the converter itself from emitting unsanitised markup.
- **No `throw new Error("string")` for expected failures** — `UnsupportedConstruct` is a typed `Result` value (typescript.md error handling). The render path surfaces unsupported constructs on the `Result` channel; `parseMarkdown` is **total in MS-0002** — a genuine parse failure is an invariant violation that `throw`s (DEC-8). `throw` is reserved for invariant violations only; `UnsupportedConstruct` is **not** overloaded for parse failures (DEC-2).
- **No new dependency surface beyond the unified ecosystem** — `remark`/`remark-gfm`/`rehype`/`remark-rehype` are well-established, MIT-licensed, and auditable; license-audit runs in CI. No HTTP/crypto library (native only).
- **Hashing uses native `crypto`** — no third-party crypto; the content hash carries no secret material (it is a digest of document content).

## 22. MAINTENANCE & OPERATIONS IMPACT

- Golden snapshots are a **reviewed-on-change** artifact — a snapshot diff in a PR is the primary review surface for converter changes (testing-strategy §"Snapshot rules"). Re-baselining after a `remark`/`rehype` major bump is an explicit, reviewed action.
- The construct mapping is the single place to extend when a new GFM construct is required — add a fixture pair, extend the visitor, review the snapshot. A construct with no lossless Storage representation goes through F-5 (classified), not silently mapped (ADR-0005 revisit trigger).
- The content-hash function is a stable seam: changing canonicalization rules changes hashes and will surface as E3-S5 drift false-positives — a deliberate, reviewed change, not an accidental one.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Storage Format | Confluence's XHTML-based body representation with `ac:`/`ri:` macros — MarkSync's write target (ADR-0005). |
| Body Representation | The concrete format of a page body (Storage or ADF); MarkSync writes Storage (UL VO). |
| Content Hash | A deterministic `sha256` of canonicalized HAST — the idempotency/drift key (UL VO); first-produced here. |
| Canonical subset | The GFM constructs `remark-gfm` produces — everything mapped; anything beyond is `UnsupportedConstruct`. `<sub>`/`<sup>` are handled defensively but excluded from the golden fixtures (`remark-gfm` cannot produce them) — DEC-7. |
| CDATA code body | `<ac:plain-text-body><![CDATA[…]]></ac:plain-text-body>` — literal `<`/`&` preserved in fenced code (spike rule #1). |
| Golden fixture | A committed `*.md` + `*.storage.xhtml` byte-stable snapshot pair (testing-strategy golden-fixture tier). |
| Unsupported node | A node outside the canonical subset → `UnsupportedConstruct`; never silently dropped (ADR-0005). |

## 24. APPENDICES

- **Spike H6 mapping table** (Storage-XML round-trip provenance): see `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` lines 17-41 — the construct → Storage table (~14 families) + the three converter rules (CDATA code bodies; omit `ac:schema-version`/`ac:macro-id`; task-list is its own block). The spike proved Storage-XML round-trip (hand-authored kitchensink XML); the golden Markdown fixtures cover the `remark-gfm`-reachable subset only (PM-DEC-1, DEC-7).
- **Golden reference shape**: `doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml` — the consolidated target output (headings, inline formatting, escaped-amp links, remote + attachment `<ac:image>`, nested lists, `<ac:task-list>`, blockquote, `python` code macro with CDATA, `<hr/>`, GFM table).
- **Port contract**: architecture-overview §"Internal interface contracts" — `app → target system port | renderBody | renderBody(mdast, opts) | { bodyRepr, hash } | UnsupportedConstruct`.
- **Reused contracts**: `src/domain/result.ts` (`Result<T,E>` + `Result.ok`/`Result.err`); `src/domain/errors.ts:45` (`UnsupportedConstruct` arm) + `assertNeverMarkSyncError`.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | spec-writer (ADOS) | Initial specification |
| 1.1 | 2026-07-09 | spec-writer (ADOS) | DoR iter-1 fixes: restate fidelity bar to the `remark-gfm`-reachable construct set (PM-DEC-1); exclude `<sub>`/`<sup>` from the golden fixtures (DEC-7); treat `parseMarkdown` as total — throw on invariant violation (DEC-8, PM-DEC-2); correct spike provenance to Storage-XML round-trip (Finding 4); permit type-only `@types/mdast`/`@types/hast` devDependencies (Finding 7). |

---

## AUTHORING GUIDELINES

Authored by `@spec-writer` per the standard phase-2 specification flow. Sources: the story file MS2-E3-S3 (authoritative scope), ADR-0005 (load-bearing decision), spike H6 (the construct → Storage mapping + 3 converter rules + kitchensink reference), `feature-safe-publish.md`, `architecture-overview.md` (module residence + dependency matrix + `renderBody` port contract), `nonfunctional.md` (NFR-REL-4, NFR-SEC-5, NFR-PERF-5), `ubiquitous-language.md` (Body Representation, Content Hash VOs), `typescript.md` (tier rules, dependency rules, error handling, snapshot conventions), and `testing-strategy.md` (golden-fixture tier, snapshot stability). The pre-existing `Result<T,E>` (`src/domain/result.ts`) and `UnsupportedConstruct` arm (`src/domain/errors.ts:45`) were verified present and are **reused, not redefined**; no `MarkSyncError` kind is added. The GH-19 spec was used as the structural/quality reference; the template (`doc/templates/change-spec-template.md`) defines structure. **DoR iter-1 revisions** (PM-DEC-1 / PM-DEC-2): the fidelity bar is restated to the `remark-gfm`-reachable construct set (DEC-7 excludes `<sub>`/`<sup>`); `parseMarkdown` is treated as total (DEC-8); spike provenance is corrected to Storage-XML round-trip; type-only `@types/*` devDependencies are permitted.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-20`
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-, NG-, G-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details beyond module residence (no step-by-step code)
- [x] No content duplicated from linked docs (cited, not copied)
- [x] Front matter validates per the template
