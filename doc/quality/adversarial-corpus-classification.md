# Adversarial Corpus Classification

This document explains how MarkSync classifies and handles non-canonical GFM content—constructs outside the supported Markdown subset—during the one-way Markdown→Storage conversion pipeline.

## Handling Categories

MarkSync classifies unsupported nodes into three categories based on how they are processed:

| Handling Category | Examples | MarkSync Behavior | Authorable in MS-0002? |
|-------------------|----------|-------------------|------------------------|
| **Escaped** | Inline raw HTML (`<b>`, `<em>`, `<span>`); namespaced macro tags (`<ac:structured-macro>`, gliffy/app content) authored in Markdown as inline raw HTML | Escaped at render (e.g., `&lt;b&gt;`, `&lt;ac:structured-macro&gt;`), not flagged as unsupported | **Yes** — write inline HTML in Markdown (macros appear as escaped literal text) |
| **`UnsupportedConstruct`** | Block-level raw HTML (`<div>`, `<table>` at block scope); non-allow-listed element tags (`<dl>`, `<math>`, `<section>`) | Render fast-fails on the first such node with `UnsupportedConstruct: <tag>` error | **No** — will block conversion |
| **Requires manual macro / future MS-0003+ support** | Confluence macros (`{toc}`, `{info}`, `{code}`, `{expand}`, Jira), app/gliffy content, nested tables | When authored as raw-HTML blocks in Markdown (e.g., `<div>...</div>`), fast-fails as `raw-html-block`. When authored as inline macro tags in Markdown, silently escaped (render succeeds, macro appears as escaped literal text) — a known degradation vector tracked for MS-0003+. Hand-constructed HAST macro nodes in tests ARE correctly classified as `UnsupportedConstruct: <tag>` (different path). | **No** — requires manual Confluence editing or future MS-0003+ support |

## MS-0002 Pipeline Limitations

The MS-0002 pipeline is strictly **one-way Markdown→Storage** (ADR-0005). This constrains what can be authored from Markdown source files:

### What Cannot Be Authored

- **Confluence macros** (`{toc}`, `{info}`, `{code}`, `{expand}`, Jira, etc.) — These require Confluence's structured macro syntax, which has no Markdown representation.
- **App/gliffy content** — Third-party app content is not authorable via Markdown.
- **Nested tables** — GFM tables are flat (single level); nested structures require raw HTML blocks.

### What Requires Manual Workarounds

To include the above content in Confluence via MS-0002, you must:

1. **Edit the page in Confluence** after publishing to add macros manually.
2. **Use raw HTML blocks** in Markdown (e.g., `<div>...</div>`), which will be flagged as `UnsupportedConstruct: raw-html-block` and block conversion.
3. **Known limitation**: Namespaced macro tags (e.g., `<ac:structured-macro>`) authored directly in Markdown as inline raw HTML are silently escaped at render — the macro appears as escaped literal text (`&lt;ac:structured-macro&gt;…`) rather than being functional. This is a degradation vector tracked for MS-0003+ (ADR-0005). Hand-constructed HAST macro nodes in tests are correctly classified as `UnsupportedConstruct` (a different code path).

### What Is Supported (Canonical GFM Subset)

The canonical GFM subset (locked by 33 golden fixtures) includes:

- Headings (`h1`–`h6`)
- Paragraphs (`p`)
- Lists (`ul`, `ol`, `li`)
- Task lists (`- [ ]`, `- [x]`)
- Blockquotes
- Code blocks and inline code
- Links and images
- Tables (flat, single-level)
- Horizontal rules (`hr`)
- Inline formatting (`strong`, `em`, `del`, `sub`, `sup`)
- Raw inline HTML (escaped at render, not flagged)

## Decision References

- **DEC-2**: Macros/app-content representation — Cannot be authored from Markdown in MS-0002; represented as raw-HTML blocks in `.md` and hand-constructed HAST in tests.
- **DEC-4**: Synthetic corpus — Fixtures are synthetic by construction (no real PII); PII self-audit ensures no accidental inclusion.
- **ADR-0005**: "Do not silently degrade" — Every unsupported node is classified; none are silently dropped.

## Corpus and Regression Protection

The **adversarial corpus** (`tests/adversarial/`) regression-locks this behavior:

- **Classification runner** (`tests/golden/adversarial/classification-runner.test.ts`) proves:
  - Fidelity: Supported constructs convert correctly (NFR-REL-4).
  - No silent drop: Every unsupported node is enumerated (ADR-0005).
  - Drift stability: Classification is deterministic.
  - Macro fixtures demonstrate the silent-escape path: macro tags authored as inline raw HTML in Markdown render successfully with escaped literal text (`[]` classification sidecars), not fast-fail.
- **Inventory test** (`tests/golden/adversarial/corpus-inventory.test.ts`) ensures all 6 real-world categories are covered.
- **PII self-audit** (`tests/golden/adversarial/pii-audit.test.ts`) verifies fixtures contain no PII.

See the [change specification](doc/changes/2026-07/2026-07-26--GH-31--adversarial-corpus/chg-GH-31-spec.md) and [implementation plan](doc/changes/2026-07/2026-07-26--GH-31--adversarial-corpus/chg-GH-31-plan.md) for full details.

## Future Work (MS-0003+)

Findings from this corpus may drive per-construct expansion decisions in future milestones, such as:

- Emoji passthrough support
- Nested-table handling
- Confluence macro authoring syntax
- Enhanced raw HTML support

Each expansion will be a separate story with its own spec and impact analysis.

## Known Limitations

- **Macro silent-escape**: Namespaced macro tags (e.g., `<ac:structured-macro>`) authored as inline raw HTML in Markdown are silently escaped at render, appearing as escaped literal text rather than functional macros. This is a degradation vector tracked for MS-0003+ (ADR-0005). The adversarial corpus macro fixtures demonstrate this path with `[]` classification sidecars. Hand-constructed HAST macro nodes in tests (TC-ADVERSARIAL-010) correctly verify that macros-as-HAST-elements ARE classified as `UnsupportedConstruct` (a different code path).