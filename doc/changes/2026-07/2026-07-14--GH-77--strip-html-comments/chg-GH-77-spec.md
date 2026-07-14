---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-77
  type: fix
  status: Proposed
  slug: strip-html-comments
  title: "HTML comments (<!-- -->) break sync and leak as literal text"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [bug, MS-0002, priority:high]
  version_impact: patch
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: [markdown-pipeline, storage-renderer]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Treat sync-to-Confluence as a render step by stripping non-rendering HTML and link-reference comments before Storage Format is produced, so a trivial, standard Markdown construct stops aborting sync and leaking as visible text.

## 1. SUMMARY

A standard Markdown construct — the HTML comment (`<!-- … -->`) — breaks the MarkSync publish pipeline in two ways: a **block-level** comment on its own line makes the unsupported-node classifier emit `UnsupportedConstruct: raw-html-block` and aborts sync for the page, while an **inline** comment inside a paragraph is escaped at render and leaks as literal visible text (`&lt;!-- … --&gt;`) on the published Confluence page. This change fixes both by stripping **comment-only** raw HTML during the parse stage (before MDAST→HAST conversion), the same render-time elision a Markdown renderer applies and the same approach already used to strip YAML front-matter (GH-63). Non-comment raw HTML keeps its current behavior unchanged (DEC-4 / F-5): block-level stays `UnsupportedConstruct`, inline stays escaped.

## 2. CONTEXT

### 2.1 Current State Snapshot

The Markdown pipeline keeps raw HTML as HAST `raw` nodes (`allowDangerousHtml: true` in the MDAST→HAST bridge, per DEC-4 / F-5). An HTML comment is raw HTML, so it flows through as a `raw` node and hits two consumers downstream:

- **Block comment** (`<!-- … -->` on its own line) → a `raw` node that is a direct child of the root. The unsupported-node classifier (`findUnsupported` → the `raw + parent.type === "root"` branch) returns `UnsupportedConstruct: raw-html-block`, which makes `renderStorage()` return `Result.err` and **aborts the sync for that page**.
- **Inline comment** (`text <!-- … --> more`) → a `raw` node nested inside a `<p>`, which the classifier does not flag. At canonicalization the `raw` node is converted to a `text` node; the renderer's text visitor then `escapeText`s it, so the comment is emitted as **literal visible text** (`&lt;!-- … --&gt;`) in the published Confluence body.

### 2.2 Pain Points / Gaps

- **Core publish flow is broken by a trivial, common Markdown construct.** HTML comments are standard (GFM/CommonMark). Discovered during a live demo.
- **Inline comments leak literal `<!-- -->` text** into Confluence pages — visible content the author never intended to publish.
- The pipeline currently has **no notion of "non-rendering annotation."** Front-matter (GH-63) and structural-whitespace text nodes (`canonicalize.ts`) are already stripped as non-rendering, but HTML comments are treated as ordinary raw HTML and flow into the classifier/escape paths.
- This violates NFR-REL-4 (conversion fidelity) — the rendered output should match the author's intent (a comment renders nothing), not include a literal annotation.

## 3. PROBLEM STATEMENT

Because the pipeline treats HTML comments as ordinary raw HTML, a Markdown page containing `<!-- … -->` either aborts the sync outright (block comment → `UnsupportedConstruct`) or publishes the comment as escaped literal text (inline comment), so authors cannot use a standard non-rendering annotation in their source without breaking the publish flow or polluting the published page.

## 4. GOALS

- **G-1**: A page with a block-level HTML comment syncs successfully (no `UnsupportedConstruct` error).
- **G-2**: A page with an inline HTML comment syncs successfully and the comment does NOT appear as literal text in the Confluence body.
- **G-3**: Markdown link-reference-style comments (`[//]: # (…)`) and common variants sync successfully with no comment text in output.
- **G-4**: Non-comment raw HTML keeps its current behavior — block-level stays `UnsupportedConstruct` (DEC-4 / F-5 unchanged), inline stays escaped (DEC-4 unchanged).
- **G-5**: Golden fixtures lock all of the above; existing markdown golden fixtures still pass byte-exact.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Block-comment pages that sync successfully | 100% (was 0%) |
| Inline-comment literal-text leaks in output | 0 occurrences |
| Non-comment block-level raw HTML still flagged as `UnsupportedConstruct` | 100% (unchanged) |
| Non-comment inline raw HTML still escaped | 100% (unchanged) |
| Existing golden fixture set passes byte-exact | 27/27 (unchanged) |
| Idempotent rerun of a comment-bearing page | 0 writes on second push (NFR-PERF-4) |

### 4.2 Non-Goals

- **NG-1**: No change to the behavior of **non-comment** raw HTML — block-level stays `UnsupportedConstruct`, inline stays escaped (the DEC-4 / F-5 invariant is load-bearing).
- **NG-2**: No live Confluence verification of comment **passthrough** (the AC#7 alternative) — strip is the default deliverable; passthrough is deferred (see §7.3).
- **NG-3**: No reverse conversion (Confluence Storage → Markdown).
- **NG-4**: No new runtime dependency (the strip is a domain-owned transformer, unlike GH-63 which added `remark-frontmatter`).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Strip comment-only HTML before rendering | A comment is a non-rendering annotation; a render step (sync-to-Confluence) must elide it, the same way a Markdown renderer ignores it |
| F-2 | Confirm + lock link-reference comment handling | `[//]: # (…)` and variants must not leak; their remark parse behavior must be verified and pinned with a golden fixture |
| F-3 | Preserve non-comment raw HTML behavior | DEC-4 / F-5 invariant: the carve-out is for comments only; real raw HTML must be untouched |
| F-4 | Golden fixture coverage + regression lock | Lock every case (strip + preserve) so the carve-out boundary cannot regress silently |

### 5.1 Capability Details

**F-1: Strip comment-only HTML before rendering**
The Markdown pipeline strips **comment-only** raw HTML — an opening `<!--` … closing `-->` with nothing outside the comment — for both block-level (own line) and inline (within a paragraph) positions. The strip happens **during the parse stage, before MDAST→HAST conversion**, so no downstream stage (the unsupported-node classifier, the canonicalizer, or the Storage renderer) ever sees a comment-only raw node. This single upstream removal prevents both failure modes at once: the classifier can no longer misclassify a block comment, and the renderer can no longer escape-leak an inline comment. This is directly analogous to front-matter stripping (GH-63) and to dropping structural-whitespace text nodes in canonicalization — eliding content that never renders.

**F-2: Confirm + lock link-reference comment handling**
The Markdown idiom `[//]: # (comment)` (and common variants such as `[//]: # "comment"`, `[//]: <>`) is parsed by remark as a `definition` / link-reference node that produces **no** HAST output, so it is expected to already be a no-op. This expected behavior must be **verified** during delivery and **locked** with a golden fixture proving no comment text reaches the Storage body. If any variant is found to leak, it is added to the strip path.

**F-3: Preserve non-comment raw HTML behavior**
The comment carve-out is **narrow**: only raw nodes whose entire value is a comment are removed. A raw node that mixes real HTML with a comment (e.g. `<div data-x="1"><!-- note --></div>`), or that is purely real HTML (e.g. `<div>…</div>`, `<span>x</span>`), keeps its current behavior exactly. Block-level real raw HTML still yields `UnsupportedConstruct: raw-html-block`; inline real raw HTML is still escaped at render. The load-bearing design point is the predicate that distinguishes "comment-only" from "real raw HTML" — it must match precisely and never over-strip.

**F-4: Golden fixture coverage + regression lock**
Golden `.md`/`.storage.xhtml` fixture pairs cover every case: block comment, inline comment, and `[//]: #` comment (each asserting the Storage body contains no comment text and the sync succeeds), plus block-level real raw HTML (asserting `UnsupportedConstruct`) and inline real raw HTML (asserting escaped output). The existing 27-fixture golden set continues to pass byte-exact. The golden count is updated to reflect the new fixtures; any change is intentional and reviewed (no silent snapshot regeneration).

## 6. USER & SYSTEM FLOWS

```
Flow 1: Page with block comment → Confluence (the bug)
  Before: parse → MDAST→HAST → findUnsupported flags raw-at-root → Result.err → sync ABORTS for the page
  After:  parse (comment-only raw stripped) → MDAST→HAST (no comment node) → findUnsupported (clean) → render → Confluence body (no comment, sync SUCCEEDS)

Flow 2: Page with inline comment → Confluence (the bug)
  Before: parse → MDAST→HAST (raw inside <p>) → canonicalize (raw→text) → render escapeText → "&lt;!-- … --&gt;" LEAKS
  After:  parse (comment-only raw stripped) → MDAST→HAST (no comment node) → render → Confluence body (no comment text)

Flow 3: Page with [//]: # (…) → Confluence (expected no-op, now locked)
  parse → remark yields definition node (no HAST output) → render → Confluence body (no comment text)

Flow 4: Page with real block-level raw HTML (e.g. <div>…</div>) → regression guard
  parse → MDAST→HAST (raw at root, NOT a comment) → findUnsupported → UnsupportedConstruct: raw-html-block (UNCHANGED)

Flow 5: Page with real inline raw HTML (e.g. a < b → text) → regression guard
  parse → MDAST→HAST (raw inside <p>, NOT a comment) → canonicalize (raw→text) → render escapeText (UNCHANGED, escaped)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- A domain-owned transformer in the Markdown tier (`src/domain/markdown/`) that removes **comment-only** raw HTML — both block-level and inline — during the parse stage (before MDAST→HAST conversion).
- The precise predicate that distinguishes comment-only raw nodes from real raw HTML, so DEC-4 / F-5 behavior for non-comment raw HTML is unchanged.
- Verify `[//]: # (…)` and common variants: confirm remark's handling and add a golden fixture to lock the behavior; if any variant leaks, extend the strip.
- Golden fixtures: page with block comment, inline comment, and `[//]: #` comment → assert the produced Storage Format contains no comment text and sync succeeds.
- Regression-guard fixtures: real block-level raw HTML → `UnsupportedConstruct`; real inline raw HTML → escaped.
- A documented carve-out for the F-5 "no silent drop" rule: comments (and link-reference comments) are non-rendering annotations, stripped at render time — the same precedent as front-matter (GH-63) and structural-whitespace nodes.

### 7.2 Out of Scope

- [OUT] Live Confluence verification of comment passthrough (the AC#7 alternative) — strip is the deliverable; passthrough is deferred (§7.3).
- [OUT] Any change to the behavior of non-comment raw HTML (DEC-4 / F-5 invariant).
- [OUT] Reverse conversion (Confluence Storage → Markdown).
- [OUT] Stripping comments from fenced code blocks or inline code — inside `` ` ``/``` ``` ```, a `<!-- … -->` is literal code content and must be preserved (it is not raw HTML; remark represents it as code/text, never `raw`).

### 7.3 Deferred / Maybe-Later

- **Comment passthrough to Confluence.** If Confluence Storage Format is verified to preserve `<!-- … -->` comments usefully, comments MAY be passed through instead of stripped (ticket AC#7). Strip is the safe fallback and the path that delivers now (no confirmed sandbox readily available). A future change may revisit this with a live-sandbox verification (ADR/decision record) and switch to passthrough.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no Confluence API changes. The Confluence adapter's write surface is unaffected; the fix only changes the rendered body produced upstream.

### 8.2 Events / Messages

N/A — no new events or message formats.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | MDAST output from the parse stage | Comment-only `html` nodes are removed before MDAST→HAST conversion; they never reach HAST `raw`, the canonicalizer, or the renderer |
| DM-2 | Canonical content hash | Changes for pages that previously carried comments — correct and expected (the comment was never rendering content). Idempotent rerun preserved: the same input yields the same hash after the fix (NFR-PERF-4) |

### 8.4 External Integrations

N/A — no new runtime dependency. The strip is a domain-owned transformer (unlike GH-63, which introduced `remark-frontmatter`).

### 8.5 Backward Compatibility

- **Output:** Storage XHTML changes for documents that previously contained comments (the fix improves correctness). Documents without comments are unaffected.
- **Sync of comment-bearing pages:** pages with a block comment that previously **failed** sync now succeed — a strict improvement (there is no prior successful hash to break). Pages with an inline comment that previously **leaked** literal text now strip the comment; their content hash changes, which is correct.
- **Idempotency:** preserved — after the fix, a second unchanged push of a comment-bearing page performs 0 writes (NFR-PERF-4).
- **DEC-4 / F-5 invariant:** unchanged for non-comment raw HTML.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-REL-4 | Conversion fidelity | 100% of canonical GFM fixtures survive Markdown→Storage round-trip (this fix IMPROVES fidelity — a comment renders nothing, matching author intent) |
| NFR-PERF-4 | Idempotent rerun | A second unchanged push of a comment-bearing page performs 0 writes; the strip is deterministic so the canonical hash is stable across reruns |
| NFR-PERF-5 | Conversion latency | Per-page render ≤ 200 ms (p95) at ≤500 pages — the strip is a single linear tree pass, negligible impact |
| NFR-SEC-5 | Converter injection safety | Unchanged — the strip removes comment-only raw nodes; real raw HTML is still escaped/flagged as before, so no new injection vector is introduced |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no new telemetry. This is a correctness fix; the only observable change is the rendered output.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | **Over-stripping**: the comment predicate matches a raw node that contains real HTML mixed with a comment, silently dropping authored content | H | L | The predicate matches **comment-only** nodes (the entire value is one comment); mixed real-HTML+comment nodes are left untouched. Pinned by a golden regression fixture (`<div>…<!-- note --></div>` → unchanged behavior). | L |
| RSK-2 | **Under-stripping**: a comment form is not recognized and still leaks/aborts | M | L | Cover block + inline `<!-- … -->` with golden fixtures; verify `[//]: #` variants and lock with a fixture. If a variant leaks, extend the strip. | L |
| RSK-3 | **Content-hash churn** for pages that previously carried inline comments (leaked text contributed to the old hash) | L | M | Expected and correct — the comment was never rendering content. Idempotent rerun is preserved (NFR-PERF-4). One-time hash migration on the next sync. | L |
| RSK-4 | **DEC-4 / F-5 regression**: the carve-out accidentally relaxes real raw-HTML handling | H | L | Real raw HTML (block + inline) is covered by dedicated regression-guard fixtures asserting unchanged behavior; the F-5 classifier is untouched. | L |

## 12. ASSUMPTIONS

- A raw HTML node whose entire value is a single HTML comment (`<!-- … -->`) is a non-rendering annotation that a Markdown renderer ignores — treating sync-to-Confluence as a render step means stripping it.
- remark parses `[//]: # (…)` (and the `# "…"`, `<>` variants) as a `definition`/link-reference node producing no HAST output, so it is expected to already be a no-op — to be **verified** and **locked** during delivery.
- Comments inside fenced/inline code are not raw HTML (remark represents them as `code`/`text`, never `raw`) and are therefore out of scope by construction (NG-4).
- No new runtime dependency is required: the strip is a domain-owned transformer operating on the parsed tree.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Markdown pipeline (parse → MDAST→HAST → classifier → canonicalize → render) | The strip is inserted at the parse stage; all downstream stages are unaffected by construction |
| Depends on | DEC-4 (inline raw escape) / F-5 (no silent drop) | The carve-out is defined relative to these invariants — non-comment raw HTML is untouched |
| Blocks | None | Standalone bug fix |

## 14. OPEN QUESTIONS

None blocking. The strip-vs-passthrough decision is resolved: **strip is the deliverable** (DEC-1). Passthrough is deferred (§7.3, AC-F5-1) pending a future live-sandbox Confluence verification — no confirmed sandbox is readily available now, and strip is the safe fallback that delivers.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Strip comments** (default), do not pass through to Confluence | Stripping matches what a Markdown renderer does and is the safe, dependency-free path. No confirmed sandbox is available to verify Confluence comment preservation; strip delivers now. Passthrough remains a deferred alternative (ticket AC#7). | 2026-07-14 |
| DEC-2 | **Strip at the parse stage (MDAST), before MDAST→HAST conversion** — not as a HAST filter | A single upstream removal prevents both failure modes (block misclassification in the classifier, inline escape-leak in the renderer) at once, so no downstream consumer ever sees a comment-only node. It is the direct precedent of front-matter stripping (GH-63). A HAST filter would be a less natural seam: the unsupported-node classifier runs *before* canonicalization, so a HAST-level strip would have to be wired between the bridge and the classifier, and it would duplicate the "comment-only" predicate on `raw` nodes that canonicalize already converts to `text`. Keeping the logic in the domain Markdown tier is consistent with the ports-and-adapters boundary. | 2026-07-14 |
| DEC-3 | No new runtime dependency | Unlike GH-63 (which added `remark-frontmatter`), the comment strip is a small domain-owned tree transformer; no package addition is warranted. | 2026-07-14 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Markdown pipeline (parse stage, `src/domain/markdown/`) | Updated — comment-only raw stripping inserted at the parse stage (a domain-owned transformer) |
| Golden fixture suite (`tests/golden/fixtures/markdown/`, `tests/golden/markdown/storage-renderer.test.ts`) | Updated — new fixtures (block comment, inline comment, `[//]: #` comment, real block raw HTML, real inline raw HTML); golden count updated |
| Feature spec `doc/spec/features/feature-safe-publish.md` | Updated (post-implementation, phase 7) — document the F-5 "no silent drop" carve-out for non-rendering annotations |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a Markdown page containing a block-level `<!-- comment -->` on its own line, **when** parsed, rendered to Storage XHTML, and synced, **then** sync succeeds (the result is `Result.ok`, no `UnsupportedConstruct: raw-html-block`) and the rendered body contains no `<!--` / `-->` sequence and no escaped comment text (`&lt;!--`). | F-1, G-1 |
| AC-F1-2 | **Given** a Markdown page containing an inline comment (`text <!-- comment --> more` inside a paragraph), **when** parsed and rendered to Storage XHTML, **then** sync succeeds and the rendered `<p>` body contains the surrounding text but NOT the comment — neither `<!-- comment -->` nor `&lt;!-- comment --&gt;` appears. | F-1, G-2 |
| AC-F2-1 | **Given** a Markdown page containing `[//]: # (comment)` and common variants (`[//]: # "comment"`, `[//]: <>`), **when** parsed and rendered to Storage XHTML, **then** sync succeeds and the rendered body contains no comment text. (If any variant is found to leak during verification, it is added to the strip and this AC covers it.) | F-2, G-3 |
| AC-F3-1 | **Given** a Markdown page containing non-comment block-level raw HTML (e.g. `<div>…</div>` on its own line), **when** parsed and rendered, **then** the result is `Result.err` with `UnsupportedConstruct: raw-html-block` — unchanged from before this change (DEC-4 / F-5 regression guard). | F-3, G-4 |
| AC-F3-2 | **Given** a Markdown page containing non-comment inline raw HTML, **when** parsed and rendered, **then** the raw HTML is emitted as escaped literal text (`&lt;…&gt;`) — unchanged from before this change (DEC-4 regression guard). | F-3, G-4 |
| AC-F3-3 | **Given** a raw node that mixes real HTML with a comment (e.g. `<div data-x="1"><!-- note --></div>`), **when** parsed and rendered, **then** it is NOT stripped — it keeps its non-comment behavior (block-level → `UnsupportedConstruct`), proving the predicate does not over-strip. | F-3, G-4 |
| AC-F4-1 | **Given** the full golden fixture suite, **when** run, **then** new fixtures cover AC-F1-1, AC-F1-2, AC-F2-1, AC-F3-1, AC-F3-2, AC-F3-3 (each asserting the exact outcome above), and the existing 27-fixture golden set still passes byte-exact. | F-4, G-5 |
| AC-F4-2 | **Given** the golden fixture count assertion, **when** the new comment fixtures are added, **then** the count is updated to the new total and any snapshot/fixture change is intentional and reviewed (no silent regeneration). | F-4, G-5 |
| AC-F5-1 | **Given** the strip-vs-passthrough decision (ticket AC#7), **when** strip is chosen as the deliverable, **then** the rationale is documented in this spec (DEC-1) and the deferred passthrough alternative is recorded (§7.3), satisfying the "document the decision" clause. | F-1 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** implement the comment-only strip in the Markdown tier → add golden fixtures (strip cases + regression guards) → verify `[//]: #` variants → run the full golden + unit suite → update the feature spec's F-5 carve-out (phase 7).
- **Merge strategy:** single PR squashed to `main`; branch `fix/GH-77/strip-html-comments`.
- **Communication:** no user-facing communication required — this fixes a demo-blocking bug for a standard Markdown construct.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration. The fix affects rendering only. Pages that previously carried inline comments will get a one-time content-hash update on their next sync (correct and expected — DM-2); pages that previously failed on a block comment will now sync for the first time.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no privacy or compliance impact. Stripping comments is a minor improvement: authored annotations that were never meant to publish no longer reach Confluence.

## 21. SECURITY REVIEW HIGHLIGHTS

- The strip **removes** comment-only raw nodes; it does not introduce a path to inject unescaped HTML. Real raw HTML keeps its escape/flag behavior (NFR-SEC-5 unchanged — AC-F3-1 / AC-F3-2).
- The "comment-only" predicate is the security-relevant boundary: it must not match a node that smuggles real HTML. AC-F3-3 guards against over-stripping a mixed node.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Maintenance surface:** one small domain transformer + its golden fixtures. No new dependency to track.
- **Golden suite:** the fixture count grows by the new comment/regression cases; the count assertion in the golden harness is updated accordingly (AC-F4-2).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| HTML comment | A non-rendering annotation `<!-- … -->`. Markdown renderers ignore it; raw HTML in Markdown is preserved verbatim by remark-rehype as a `raw`/`html` node. |
| Link-reference comment | The Markdown idiom `[//]: # (…)` (and variants), conventionally used as a comment via an unused link-reference definition. |
| Raw node (HAST) / `html` node (MDAST) | The node kind remark-rehype produces for raw HTML under `allowDangerousHtml` (DEC-4 / F-5). The unsupported-node classifier flags a `raw` node at the root as a raw-HTML block. |
| Non-rendering annotation | Authored content that produces no visible output: YAML front-matter (GH-63), structural whitespace (canonicalize), and HTML/link-reference comments. These are stripped at render time without violating F-5's "no silent drop of *rendering* constructs." |

## 24. APPENDICES

### Appendix A: Root cause (code-confirmed)

Two consumers mishandle a comment-only raw node:

- The unsupported-node classifier: a `raw` node that is a direct child of `root` returns `UnsupportedConstruct: raw-html-block` → `renderStorage()` returns `Result.err` → the page's sync aborts.
- The Storage renderer: a `raw` node nested in a `<p>` is converted to `text` at canonicalization, then `escapeText`d at render → the comment leaks as `&lt;!-- … --&gt;`.

The root cause is the same in both cases: the pipeline has no carve-out for non-rendering annotations, so a comment is treated as ordinary raw HTML.

### Appendix B: Placement justification (DEC-2)

The strip is placed at the **parse stage (MDAST), before MDAST→HAST conversion**:

1. A single upstream removal prevents **both** failure modes — the classifier never sees a block comment (no false `UnsupportedConstruct`), and the renderer never escapes an inline comment (no leak).
2. It is the direct precedent of front-matter stripping (GH-63) and of dropping structural-whitespace text nodes in canonicalization — eliding non-rendering content at the earliest possible stage.
3. A HAST-level filter would be a less natural seam: `findUnsupported` runs *before* `canonicalize` inside `renderStorage`, so a HAST strip would have to be wired between the bridge and the classifier, and would duplicate the comment-only predicate on `raw` nodes that canonicalize already converts to `text`.
4. It keeps the logic in the domain Markdown tier (`src/domain/markdown/`), consistent with the ports-and-adapters boundary (domain tier imports no infra/app/cli).

### Appendix C: Precedent — comments are non-rendering

Mermaid SVG normalization (feature-mermaid-rendering.md §3.3, rule 1) already strips `<!-- … -->` comments as a non-rendering artifact for digest stability. This change applies the same principle to the Markdown→Storage render path.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored from the GH-77 ticket body (the authoritative scope source — GH-77 has no `[MS2-Exx-Sxx]` story file), the code-confirmed root cause in `src/domain/markdown/unsupported.ts` (the `raw + parent.type === "root"` branch) and `src/infra/confluence/render/storage.ts` (the `visitChild` raw→`escapeText` branch), and the change planning summary. It follows the template at `doc/templates/change-spec-template.md`. Conventions mirror the GH-63 front-matter-strip spec (the closest analog: a render-time strip of non-rendering source content). The strip-vs-passthrough question is resolved as **strip** (DEC-1), with passthrough deferred (§7.3 / AC-F5-1). Placement is **parse-stage MDAST stripping** (DEC-2), justified in Appendix B. Relevant authorities: ADR-0005 (Storage Format target), DEC-4 (inline raw escape), F-5 (no silent drop), NFR-REL-4 / NFR-PERF-4 / NFR-PERF-5, and the mermaid §3.3 rule-1 comment-stripping precedent.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-77)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules
