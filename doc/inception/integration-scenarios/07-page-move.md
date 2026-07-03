# 07 — Move / reparent page

## Purpose
When a Markdown file moves between folders, its Confluence page must be reparented (a `MOVE` operation) rather than delete-plus-create, preserving identity and history. Required by hierarchy mirroring and rename/move support.

## Status: CURRENT (v2) — no dedicated move endpoint

## Mechanism
Reparent is performed with the **standard update endpoint**, supplying a new `parentId`:
```http
PUT /wiki/api/v2/pages/{id}
```
The body must include the **required** fields (`id`, `status`, `title`, `body`, `version`) **plus** the new `parentId`. Child pages move with the parent automatically (relative hierarchy preserved).

## Verbatim — reparent (Child B from Root → Child A)
Evidence: `P4-03-move.json` (+ `P4-04-after.json`)

```http
GET /wiki/api/v2/pages/40435747 HTTP/1.1      # read current version first
```
```http
PUT /wiki/api/v2/pages/40435747 HTTP/1.1
Authorization: Basic <redacted>
Content-Type: application/json
```
```json
{
  "id": "40435747",
  "status": "current",
  "title": "Coverage Child B",
  "body": { "representation": "storage", "value": "<p>moved</p>" },
  "version": { "number": 2, "message": "reparent" },
  "parentId": "40697857"
}
```
```http
HTTP/1.1 200 OK
```
```json
{
  "id": "40435747", "status": "current", "title": "Coverage Child B",
  "parentId": "40697857",
  "version": { "number": 2, "message": "reparent", "createdAt": "…" },
  "body": { "storage": { "representation": "storage", "value": "<p>moved</p>" } },
  "_links": { "webui": "…" }
}
```

## Verbatim — verify via ancestors
Evidence: `P4-04-after.json` — after the move, `Child B`'s ancestors include the new parent chain:
```json
{ "results": [ { "id": "39223464" }, { "id": "40108040" }, { "id": "40697857" } ] }
```
(Homepage → Root → Child A.) Note the old parent remains a **transitive** ancestor while the new parent is its direct parent — i.e. reparenting nested a subtree; verify the **direct** `parentId`, not just ancestry membership.

## ⚠️ Concurrency note
The move is an update: `version.number` must be `current+1`. A concurrent remote edit → `409 CONFLICT` (see [13](./13-version-conflict-drift.md)). Always GET the current version before the move PUT.

## Error cases
- `404` unknown target parent; `403` no write permission on the target space/parent; `409` version conflict.
- Moving across **spaces** is not supported by a single parentId change — keep documents within one space per target.

## Implementation / mock contract
- `MovePage(id, newParentId)` = `UpdatePage({id, status, title, body, version: current+1, parentId: newParentId})`.
- Planner emits `MOVE` when the desired parent differs from the remote `parentId`; the push engine executes parent-first.
- Mock fixture: `P4-03` (200, new parentId) + `P4-04` (ancestors after).

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-put
