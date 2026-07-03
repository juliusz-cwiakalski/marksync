# 15 — Reverse sync: read Confluence → Markdown

## Purpose
Consider Confluence-originated edits without weakening Git authority. Read a page's body (Storage or ADF), reverse-convert it to Markdown, and produce a reviewable patch / three-way conflict bundle (base/local/remote). **Never auto-commits, never silently merges** (FR-REV-001…008, Phase 2). This doc records the read path and conversion approach; it is exercised against a real editor-created page.

## Status: CURRENT (v2) for the reads; reverse conversion is MarkSync logic.

## Read path
1. **Current remote** body: `GET /wiki/api/v2/pages/{id}?body-format=storage` ([04](./04-page-read.md)).
2. **Base** body (last MarkSync-published version): `GET /wiki/api/v2/pages/{id}?version={lock.pageVersion}&body-format=storage` ([08](./08-page-versions.md)).
3. **Local** = rendered Markdown at the current commit.
4. Optionally read `atlas_doc_format` to inspect the editor-native structure.

The reverse converter targets the **Storage** body (HTML-like + `ac:`/`ri:` macros), stripping Confluence artifacts.

## Artifacts to strip/normalize on reverse conversion
- Editor-injected `local-id` / `localId` attributes on elements (proven present on every editor-created page).
- Confluence-generated `ac:macro-id`, `ac:schema-version` on macros (auto-filled on write).
- Trivial whitespace differences (`<hr/>` vs `<hr />`).
- MarkSync provenance panel/footer (remove before converting back).

## Verbatim — read an editor-created page (Storage + ADF)
Evidence: `R0-01-read-storage.json`, `R0-02-read-adf.json` (page `40140822`, "Hello world page", created directly in the Confluence editor)

```http
GET /wiki/api/v2/pages/40140822?body-format=storage HTTP/1.1
```
```http
HTTP/1.1 200 OK
```
```json
{ "id": "40140822", "status": "current", "title": "Hello world page",
  "version": { "number": 1, "createdAt": "2026-07-03T14:33:49.144Z" },
  "body": { "storage": { "representation": "storage",
    "value": "<p local-id=\"cce4356f92bc\">This is just an example hello world page</p>" } } }
```
ADF form:
```json
{ "body": { "atlas_doc_format": { "value":
  "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"localId\":\"cce4356f92bc\"},\"content\":[{\"text\":\"This is just an example hello world page\",\"type\":\"text\"}]}],\"version\":1}" } } }
```
Reverse-converted Markdown (trivial body):
```markdown
This is just an example hello world page
```

> **Enriched example (pending):** a richer editor-created page (headings, lists, table, code block, bold/italic, link, image) will be read back and reverse-converted once the owner finishes editing page `40140822`; the result will be appended here as the canonical reverse-conversion fixture.

## Reverse CSF → Markdown mapping (inverse of [09](./09-markdown-to-storage.md))
| CSF | Markdown |
|---|---|
| `<h1>`–`<h6>` | `#`–`######` |
| `<strong>` / `<em>` / `<s>`/`<del>` / `<code>` | `**` / `*`/`_` / `~~` / `` ` `` |
| `<a href>` | `[text](url)` |
| `<ac:image>…<ri:url ri:value="u"/>` | `![alt](u)` |
| `<ac:image>…<ri:attachment ri:filename="f"/>` | `![alt](f)` (local asset) |
| `<ul>`/`<ol>`/`<li>` (nested) | `-` / `1.` (nested) |
| `<ac:task-list><ac:task>…` | `- [ ]` / `- [x]` |
| `<blockquote>` | `>` |
| `<ac:structured-macro ac:name="code">` + `<![CDATA[…]]>` | ` ```lang ` |
| `<hr/>` | `---` |
| `<table>` | GFM table |

Only the **canonical GFM subset** is promised (FR-MD-010). Unsupported constructs (macros beyond `code`, smart links, inline comments, layouts, ADF extensions) **cannot disappear silently** — emit a diagnostic and block strict apply (FR-REV-006).

## Conflict workspace (§9.9)
```
.marksync/conflicts/<target>/<document-id>/
├── conflict.yaml      # version:1, target, documentId, sourcePath, pageId, baseCommit, baseHash, localHash, remoteHash
├── base.md            # reverse(base version body)
├── local.md           # current rendered Markdown
├── remote.md          # reverse(current remote body)
├── remote-storage.xml # raw remote Storage for reference
├── diagnostics.json   # unsupported-construct warnings
└── resolved.md        # optional three-way suggested resolution (never auto-applied)
```

## Rules
- `pull` defaults to dry-run; `--apply` requires a clean source file and explicit approval.
- Never creates a Git commit; the lock/base advances only after a later committed push (FR-REV-003/008).
- A three-way merge may produce a suggested `resolved.md`; conflict markers are **never** published automatically.

## Error cases
- `404` page removed remotely → `REMOTE_MISSING` (explicit recreate only).
- Unsupported macro in remote → warning + block strict apply (do not silently drop).

## Implementation / mock contract
- `ReverseConvert(storageBody) → {markdown, diagnostics[]}`.
- `Pull(target, documentId, {apply})` orchestrates base/local/remote fetch + reverse + diff.
- Mock fixtures: `R0-01`/`R0-02` (trivial editor page); a richer fixture once the enriched page is captured; per-construct reverse golden cases mirroring [09](./09-markdown-to-storage.md).

## Reference
- Read page: https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get
- Storage format: https://developer.atlassian.com/cloud/confluence/confluence-storage-format/
