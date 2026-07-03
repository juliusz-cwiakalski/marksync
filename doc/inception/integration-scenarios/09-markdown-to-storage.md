# 09 — Markdown → Confluence Storage Format rendering

## Purpose
Convert source Markdown to the Confluence Storage Format (CSF) body submitted in [03](./03-page-create.md)/[05](./05-page-update-delete.md). This is the rendering pipeline; this doc records the **proven construct mapping** and the lossless round-trip.

## Status: CURRENT (v2) — representation `"storage"` (per ADR-0005)

## Pipeline
```
Markdown bytes → front-matter extraction → GFM parser (MDAST/HAST)
  → canonical AST → semantic validation → link/asset resolution
  → provenance decoration → Storage Format renderer → normalization → rendered hash
```
Under ADR-0001 (TypeScript), use `remark`/`rehype`; the last mile (HTML → CSF) applies the macro wrappers below.

## Proven Markdown → CSF construct mapping (all 27 survive round-trip)

A page containing every GFM construct was POSTed as Storage and read back (storage→ADF→storage): **27/27 survived lossless**. Evidence: `K1-02-create.json`, `K1-03-readback-storage.json`; fixture `examples/pages/storage-kitchensink.xml`.

| Markdown | CSF to emit | Notes |
|---|---|---|
| `#`–`######` | `<h1>`–`<h6>` | |
| `**bold**` | `<strong>` | |
| `*italic*` / `_x_` | `<em>` | |
| `~~strike~~` | `<s>` **or** `<del>` | both accepted |
| `` `code` `` | `<code>` | |
| `~sub~` / `^sup^` | `<sub>` / `<sup>` | (if supported) |
| `[t](url)` | `<a href="url">t</a>` | keep `&amp;` for query strings |
| `![alt](url)` | `<ac:image ac:alt="alt"><ri:url ri:value="url"/></ac:image>` | remote image |
| local image | `<ac:image><ri:attachment ri:filename="…"/></ac:image>` | hash-named attachment, see [11](./11-attachments.md) |
| `-` / `1.` | `<ul>`/`<ol>`, `<li>` | nesting = nested lists in `<li>` |
| `- [ ]` / `- [x]` | `<ac:task-list><ac:task><ac:task-status>incomplete\|complete</ac:task-status><ac:task-body>…</ac:task-body></ac:task></ac:task-list>` | **cannot mix** with regular `<li>` |
| `> quote` | `<blockquote><p>…</p></blockquote>` | |
| ` ```lang ` | `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">lang</ac:parameter><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>` | body **must** be CDATA |
| `---` | `<hr/>` | |
| GFM table | `<table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table>` | formatted cell content allowed |

## Verbatim — kitchen-sink read-back (excerpt; full body in evidence)
Evidence: `K1-03-readback-storage.json` (sent 1991 B → read back 2059 B, identical except auto-filled macro metadata):
```xml
<ac:structured-macro ac:name="code" ac:schema-version="1" ac:macro-id="30aab65a-…">
  <ac:parameter ac:name="language">python</ac:parameter>
  <ac:plain-text-body><![CDATA[def hello(name):
    print(f"hello, {name}")
hello("world")]]></ac:plain-text-body>
</ac:structured-macro>
```
Confluence **auto-fills** `ac:schema-version` + `ac:macro-id` on macros and normalizes self-closing whitespace (`<hr/>`→`<hr />`); the converter may **omit** both attributes.

## Converter requirements (hard rules)
1. **Code bodies must use `<![CDATA[…]]>`** (literal `<`/`&`). Omit `ac:schema-version`/`ac:macro-id` — Confluence assigns them.
2. **The body must be well-formed XML** (CSF is XML-parsed; malformed → HTTP 400). Escape entities, balance tags.
3. **Task lists cannot mix with regular list items** — an `<ac:task-list>` is its own block.
4. **Raw inline HTML** (`<div>`, `<span>`, …) is stripped by the CSF sanitizer — escape or drop it (FR-MD-004).
5. Non-GFM extensions (footnotes, definition lists, math) have no native representation — fall back to a macro or block/error (FR-MD-005).

## Normalization before comparison (idempotency / drift)
Normalize CSF before hashing/comparing: line endings; insignificant generated XML whitespace; MarkSync-generated attribute ordering; **ignore Confluence-generated editor IDs** (e.g. `ac:macro-id`); **ignore editor `local-id`/`localId`** attributes (injected by the editor, see [04](./04-page-read.md)); preserve semantic text and macro parameters. Hash the **normalized** body separately from publication metadata (FR-MD-009).

## Visible provenance (configurable)
```
Managed by MarkSync.
Source: architecture/01-context.md
Revision: a1b2c3d
Edit the source in Git. Direct Confluence edits may require reconciliation.
```

## Error cases
- `400` from create/update = malformed XML. Validate well-formedness before submit (golden tests).

## Implementation / mock contract
- `Render(markdown, {frontMatter, assets}) → {title, storageBody, sourceContentHash, renderedBodyHash}`.
- Golden fixtures: `examples/pages/storage-kitchensink.xml` + per-construct cases; assert well-formed XML + API-accepted.
- ADF is documented in [04](./04-page-read.md) but **not** the write target (ADR-0005).

## Reference
- Confluence Storage Format: https://developer.atlassian.com/cloud/confluence/confluence-storage-format/
- Page create: https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-post
