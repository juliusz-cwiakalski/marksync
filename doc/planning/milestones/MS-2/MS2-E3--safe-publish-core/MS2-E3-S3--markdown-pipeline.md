---
id: MS2-E3-S3
title: "markdown-pipeline"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 3d
gh_issue: GH-20
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0005]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [MS2-E2-S1] }
cross_cutting: [R-FEA-9, NFR-REL-4, NFR-SEC-5]
---

# MS2-E3-S3 — Markdown → Confluence Storage Format pipeline

## Goal
Deterministic Markdown → Confluence Storage Format (XHTML + `ac:`/`ri:`) conversion for the **canonical GFM subset**, with **100% fidelity** on the 27-construct fixture set and **no silent dropping** of unsupported nodes.

## Background
ADR-0005 (write Storage, not ADF). The MS-0001 spike H6 PROVED 27/27 GFM constructs survive Storage round-trip lossless, and gave exact converter rules (blueprint §0 H6): code bodies in `<![CDATA[…]]>`, well-formed XML, task-lists are their own block, OMIT `ac:schema-version`/`ac:macro-id`. This is a domain-level pipeline (adapter-agnostic MDAST/HAST); the final HAST→Storage visitor is infra/adapter (behind the `TargetSystem` renderer) — but to keep this story testable in isolation, the **HAST→Storage renderer** lives here too (it's the body-representation logic; the adapter merely carries the bytes).

## Detailed scope (deliverables)
1. **`src/domain/markdown/parse.ts`** — `parseMarkdown(bytes): Result<MdastRoot, MarkSyncError>` using `remark` + `remark-gfm`. Produces MDAST. Validates the canonical subset.
2. **`src/domain/markdown/mdast-to-hast.ts`** — `remark-rehype` bridge MDAST→HAST (HTML AST). Configure for the canonical subset.
3. **`src/domain/render/canonicalize.ts`** — normalize HAST for deterministic hashing (attribute order, whitespace) — feeds the Content Hash VO used by E3-S5.
4. **`src/infra/confluence/render/storage.ts`** — `renderStorage(hast, opts): Result<{body; hash}, MarkSyncError>` — the HAST→Storage XHTML visitor implementing the spike-proven mapping table (headings, strong/em, del, code, sub/sup, links, images, lists+nesting, task-lists, blockquote, fenced code → `<ac:structured-macro name="code">` with `CDATA`, hr, GFM tables). **Omit** `ac:schema-version`/`ac:macro-id` (Confluence assigns them). Code bodies in `<![CDATA[…]]>`. Ensure well-formed XML (escape entities, balance tags).
5. **`src/domain/markdown/unsupported.ts`** — classify nodes outside the canonical subset (raw HTML, footnotes, definition lists, math, app content) → `UnsupportedConstruct{construct; sourcePath}`. **Never silently drop** — emit a classified warning the plan carries (E3-S6 surfaces it).
6. **Golden fixtures** — `tests/golden/fixtures/*.md` + `*.storage.xhtml` for each of the 27 GFM constructs (the spike's `examples/pages/storage-kitchensink.xml` is the reference). Byte-stable snapshots.
7. **Security (NFR-SEC-5)** — malicious-Markdown property tests: a doc containing `<ac:structured-macro>` text, `<script>` fragments, or macro-injection payloads → the converter ESCAPES them (they cannot inject server-side macros). Assert the output is inert.

## Technical approach
- `remark`/`remark-gfm`/`rehype`/`remark-rehype` (latest). MDAST is the canonical intermediate.
- The Storage visitor walks HAST and emits XHTML strings. Use a small, tested string builder (no DOM serialization lib needed; HAST nodes are plain objects).
- Code-macro: `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">{lang}</ac:parameter><ac:plain-text-body><![CDATA[{code}]]></ac:plain-text-body></ac:structured-macro>`.
- Images: remote `<ac:image><ri:url ri:value="{url}"/></ac:image>`; local `<ac:image><ri:attachment ri:filename="{name}"/></ac:image>` (attachment resolution is E4-S2).
- Hash input: canonical HAST → `sha256` (blueprint §2 Content Hash). Stored on the binding (E3-S2).

## Interface contracts (what other stories consume)
- `parseMarkdown` + `renderStorage` consumed by E3-S6 (push flow: parse → render → hash → compare → write).
- `UnsupportedConstruct` warnings consumed by E3-S6 (surfaced in plan) and E5-S3 (adversarial corpus).
- Content hash function consumed by E3-S5 (drift) and E4-S1/E4-S2 (mermaid/attachment dedup).
- Golden fixtures reused by E5-S3 (adversarial corpus) and CI.

## Acceptance criteria (testable)
- [ ] **NFR-REL-4:** 100% of the 27 canonical GFM fixtures produce Storage that, when read back, is semantically equivalent (golden snapshot match; the spike proved round-trip lossless, so byte-match to the golden is the bar).
- [ ] Code blocks use `<![CDATA[…]]>`; `ac:schema-version`/`ac:macro-id` are OMITTED (assert absent in output).
- [ ] Output is well-formed XML (parse with an XML parser; no unbalanced tags; entities escaped).
- [ ] **No silent drop:** an unsupported node (footnote, raw HTML, math) → `UnsupportedConstruct` warning, NOT a silent omission.
- [ ] **NFR-SEC-5:** malicious fixtures (macro-injection, `<script>`) → inert escaped output (no `<ac:structured-macro>` injected from source; no executable content).
- [ ] Rendering is deterministic: same input → byte-identical output across runs (golden snapshot stability).
- [ ] `bun run check` green; dependency-cruiser: HAST→Storage renderer (`infra/confluence/render/`) may import domain markdown types but NOT vice versa.

## Test matrix
| Tier | This story |
|---|---|
| Unit | each construct → Storage (inline snapshot for short; file snapshot for blocks), unsupported-node classification, hash determinism |
| Golden | 27 GFM fixtures → `.storage.xhtml` snapshots (committed; reviewed on change) |
| Integration | parse→render→hash round-trip; XML well-formedness |

## Definition of Done
27/27 GFM fixtures convert with golden-stable Storage; unsupported nodes classified (not dropped); injection-safe; deterministic; hash function defined. AC list is the DoD.

## Out of scope
- Confluence API writes (E3-S4/E3-S6).
- Mermaid rendering (E4-S1) — the code-fence for `mermaid` lang is detected here but the render-to-image is E4-S1.
- Image/attachment upload (E4-S2) — local-image `<ri:attachment>` reference is emitted here; the actual upload is E4-S2.
- Reverse conversion Storage→Markdown (MS-0005+).

## Risks / open questions (CEO-resolved)
- **R1:** Confluence sanitizer strips raw inline HTML. → Confirmed by spike (H6 "Markdown features that will not pass through"). The converter ESCAPES raw HTML (does not pass through); recorded as supported-but-escaped. CEO-recorded.
- **Q1:** Task-list + regular-list mixing. → Spike H6 converter rule #3: an `<ac:task-list>` is its own block; emit a warning if a doc mixes them (can't be represented). CEO-recorded.
