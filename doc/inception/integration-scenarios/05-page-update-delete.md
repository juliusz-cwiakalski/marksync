# 05 — Update & delete page

## Purpose
Update a managed page's body/title (and reparent — see [07](./07-page-move.md)) using optimistic concurrency, and delete (soft/purge) for lifecycle features. Update is the second primary write of Git→Confluence publishing.

## Status: CURRENT (v2)

## Update endpoint
```http
PUT /wiki/api/v2/pages/{id}
Content-Type: application/json
```
**Scope:** `write:page:confluence` / `write:confluence-content`.

### Request body (id, status, title, body, version are all REQUIRED)
```json
{
  "id": "39813121",
  "status": "current",
  "title": "MarkSync Spike — Storage",
  "body": { "representation": "storage", "value": "<h1>Spike Rich Content</h1>\n<p>…</p>" },
  "version": { "number": 2, "message": "spike update" }
}
```

### ⚠️ Optimistic-concurrency rule (load-bearing)
`version.number` **MUST equal `currentVersion + 1`**. Sending `current` → `409 CONFLICT` (the drift signal — see [13](./13-version-conflict-drift.md)). There is **no PATCH**; you must resend `title` + full `body` every update. `parentId`/`spaceId` are optional (omit to preserve).

### Verbatim — update
Evidence: `C3-01-update.json`

```http
PUT /wiki/api/v2/pages/39813121 HTTP/1.1
Authorization: Basic <redacted>
Content-Type: application/json
```
```json
{ "id": "39813121", "status": "current", "title": "MarkSync Spike — Storage",
  "body": { "representation": "storage", "value": "<h1>Spike Rich Content</h1>…" },
  "version": { "number": 2, "message": "spike update" } }
```
```http
HTTP/1.1 200 OK
```
```json
{
  "id": "39813121", "status": "current", "title": "MarkSync Spike — Storage",
  "version": { "number": 2, "message": "spike update", "minorEdit": false, "createdAt": "…" },
  "body": { "storage": { "representation": "storage", "value": "<h1>Spike Rich Content</h1>…" } },
  "_links": { "webui": "…" }
}
```
Persist the new `version.number` (→ lock `pageVersion`).

## Title-only update (lighter)
```http
PUT /wiki/api/v2/pages/{id}/title
{ "status": "current", "title": "New Title" }
```

## Delete endpoint
```http
DELETE /wiki/api/v2/pages/{id}
```
**Scope:** `delete:page:confluence`.

| Param | Behavior |
|---|---|
| (none) | **soft-delete** → moves to trash |
| `purge=true` | hard-deletes a page that is **already in trash** |
| `draft=true` | permanently deletes a draft |

### Verbatim — delete (soft)
Evidence: `J1-01-del-39485441.json`
```http
DELETE /wiki/api/v2/pages/39485441 HTTP/1.1
```
```http
HTTP/1.1 204 No Content
```

> **MVP policy:** MarkSync does **not** auto-delete (FR-SYNC-016). A missing local doc is reported; destructive lifecycle requires explicit policy/confirmation. The spike uses delete only for test cleanup.

## Error cases
- `409 CONFLICT` on update — version not incremented / drift (see [13](./13-version-conflict-drift.md)); **do not blind-retry**.
- `400` on update — body not well-formed XML.
- `404` on delete — page id unknown / already purged.

## Implementation / mock contract
- `UpdatePage({id, status, title, body, version, parentId?})` → `Page`; always **GET current version first**, send `current+1`.
- `DeletePage(id, {purge})` → `204`.
- Mock fixtures: `C3` (200 update), `G1-03` (409 stale), `J1` (204 delete).

## Reference
- Update: https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-put
- Title: …/#api-pages-id-title-put · Delete: …/#api-pages-id-delete
