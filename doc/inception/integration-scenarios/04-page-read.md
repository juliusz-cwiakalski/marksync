# 04 — Read page (body formats; by version)

## Purpose
Fetch a page's current body for diff/idempotency (Git→Confluence) and for reverse conversion (Confluence→Git). The `body-format` selects the representation; `version` fetches a historical body for three-way merge.

## Status: CURRENT (v2)

## Endpoint
```http
GET /wiki/api/v2/pages/{id}
```

**Scope:** `read:page:confluence` / `read:confluence-content.all`.

| Param | Values | Notes |
|---|---|---|
| `body-format` | `storage` \| `atlas_doc_format` \| `view` | `view` = rendered HTML for display |
| `version` | int | fetch a specific version's body |
| `get-draft` | bool | read the draft instead of current |
| `status[]` | string | filter by status |
| `include-labels`, `include-properties`, `include-versions`, `include-version` | bool | expand inline collections |

> `export_view` / `anonymous_export_view` are v1-only representations, not in v2.

## Verbatim — read Storage body (round-trip)
Evidence: `C2-01-readback.json`

```http
GET /wiki/api/v2/pages/39813121?body-format=storage HTTP/1.1
Authorization: Basic <redacted>
Accept: application/json
```
```http
HTTP/1.1 200 OK
```
```json
{
  "id": "39813121", "status": "current", "title": "MarkSync Spike — Storage",
  "spaceId": "39223300", "parentId": "39223464",
  "version": { "number": 1, "message": "", "minorEdit": false, "createdAt": "…" },
  "body": { "storage": { "representation": "storage", "value": "<h1>Spike Minimal</h1>\n<p>…</p>" } },
  "_links": { "webui": "/spaces/marksyncte/pages/39813121/MarkSync+Spike+Storage" }
}
```

A full GFM kitchen-sink page (27 constructs) read back **byte-identical** to what was sent — see `K1-03-readback-storage.json` and [09](./09-markdown-to-storage.md).

## Verbatim — read ADF body (editor-native JSON)
Evidence: `R0-02-read-adf.json` (hand-made page `40140822`)

```http
GET /wiki/api/v2/pages/40140822?body-format=atlas_doc_format HTTP/1.1
```
```json
{
  "body": { "atlas_doc_format": { "representation": "atlas_doc_format",
    "value": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"localId\":\"cce4356f92bc\"},\"content\":[{\"text\":\"This is just an example hello world page\",\"type\":\"text\"}]}],\"version\":1}" } }
}
```

> The editor injects a `localId`/`local-id` attribute on nodes — a reverse converter must strip these.

## Verbatim — read a specific historical version's body
Evidence: `P5-06-v1-body.json`

```http
GET /wiki/api/v2/pages/{id}?version=1&body-format=storage HTTP/1.1
```
Returns the page body as it was at version 1 (e.g. `"<p>coverage fixture</p>"`), with the current metadata. Used by reverse sync to recover the three-way merge **base** (see [08](./08-page-versions.md), [15](./15-reverse-sync.md)).

## Error cases
- `404` unknown page id; `403` no read access.

## Implementation / mock contract
- `GetPage(id, {representation, version})` → `Page` with `body.{representation}.value`, `version.number`, `_links.webui`.
- For idempotency/diff: read `storage`, normalize (see [09](./09-markdown-to-storage.md) §normalization), compare `renderedBodyHash`.
- For reverse: read `storage` (primary) or `atlas_doc_format`.
- Mock fixtures: `C2` (storage), `R0-02`/`K1-04` (ADF), `P5-06` (versioned body).

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get
