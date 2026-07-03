# 03 — Create page (Storage + ADF)

## Purpose
Publish a Markdown document as a Confluence page, as a child of a parent (homepage or another doc). This is the primary write operation of Git→Confluence publishing.

## Status: CURRENT (v2)

## Endpoint
```http
POST /wiki/api/v2/pages
Content-Type: application/json
```

**Scope:** `write:page:confluence` / `write:confluence-content`. **Query params (optional):** `embedded`, `private`, `root-level`.

## Request body
```json
{
  "spaceId": "39223300",
  "status": "current",
  "title": "MarkSync Spike — Storage",
  "parentId": "39223464",
  "body": {
    "representation": "storage",
    "value": "<h1>Spike Minimal</h1>\n<p>…<strong>strong</strong> <em>emphasis</em> <code>inline code</code>.</p>"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `spaceId` | yes | string |
| `status` | no | `"current"` (published, default) or `"draft"` |
| `title` | yes (if `status="current"`) | |
| `parentId` | no | omit + `root-level=true` for a space-root page |
| `body.representation` | — | `"storage"` (recommended, see [09](./09-markdown-to-storage.md)) or `"atlas_doc_format"` |
| `body.value` | — | string. For Storage: well-formed XHTML. For ADF: the ADF JSON string. |

## Verbatim — create a Storage page
Evidence: `C1-01-create.json`

```http
POST /wiki/api/v2/pages HTTP/1.1
Authorization: Basic <redacted>
Content-Type: application/json
```
```json
{ "spaceId": "39223300", "status": "current", "title": "MarkSync Spike — Storage",
  "parentId": "39223464",
  "body": { "representation": "storage", "value": "<h1>Spike Minimal</h1>\n<p>…</p>" } }
```

```http
HTTP/1.1 200 OK
```
```json
{
  "parentType": "page",
  "parentId": "39223464",
  "ownerId": "557058:593d9e9f-9a80-46c5-839e-ec2cf675b021",
  "createdAt": "2026-07-03T13:48:15.974Z",
  "authorId": "557058:593d9e9f-9a80-46c5-839e-ec2cf675b021",
  "position": 1980,
  "version": { "number": 1, "message": "", "minorEdit": false },
  "id": "39813121",
  "spaceId": "39223300",
  "status": "current",
  "body": { "storage": { "representation": "storage", "value": "<h1>Spike Minimal</h1>\n<p>…</p>" } },
  "title": "MarkSync Spike — Storage",
  "_links": { "webui": "/spaces/marksyncte/pages/39813121/MarkSync+Spike+Storage",
              "editui": "/pages/resumedraft.action?draftId=39813121",
              "tinyui": "/x/AYBfAg" }
}
```

**Key fields to persist:** `id` (→ lock `pageId`), `version.number` (→ `pageVersion`, used for the next update), `parentId`, `_links.webui`.

## ADF variant (also accepted)
Same endpoint with `representation: "atlas_doc_format"` and `value` = an ADF JSON string (proven in spike `D1-01`, HTTP 200). MarkSync writes Storage per [ADR-0005]; ADF is documented for completeness.

## Error cases
- `400` — malformed body (e.g. Storage XML not well-formed; ADF not valid).
- `413` — body too large.
- `403` — no create permission in the space.

## Implementation / mock contract
- `CreatePage({spaceId, title, parentId, body, status})` → `Page` with `id`, `version.number`.
- Create **parent-first** (hierarchy mirroring): the parent's returned `id` feeds the children's `parentId`.
- Mock fixture: the `C1` response above; a `400` fixture with a malformed-Storage body for the validation test.

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-post
