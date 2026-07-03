# 16 — Restrictions (read; detect do-not-touch)

## Purpose
Detect page view/edit restrictions so MarkSync can avoid silently operating on content it should not (e.g. a page locked to a specific group). MVP treats restrictions as **informational** — MarkSync does not sync or change restrictions, but must not silently overwrite restricted content.

## Status: **V1-ONLY** (no v2 restrictions API exists).

## Endpoint
```http
GET /wiki/rest/api/content/{id}/restriction
```
**Scope:** `read:content.restriction:confluence` (granular) / `read:confluence-content.permission` (classic). **Pagination:** offset (`start`,`limit`). Also per-operation: `GET …/restriction/byOperation/{read|update}`.

## Verbatim — restrictions on a fresh page
Evidence: `P10-01-restrictions.json`
```http
GET /wiki/rest/api/content/39583759/restriction HTTP/1.1
```
```http
HTTP/1.1 200 OK
```
```json
{ "results": [
    { "operation": "read",
      "restrictions": { "user": { "results": [], "size": 0 }, "group": { "results": [], "size": 0 } } },
    { "operation": "update",
      "restrictions": { "user": { "results": [], "size": 0 }, "group": { "results": [], "size": 0 } } } ],
  "size": 2, "restrictionsHash": "" }
```
A freshly created page returns two entries (`read`, `update`) each with **empty** user/group result sets — meaning "no restrictions" (inherited/public). Non-empty `results` indicate an explicit restriction.

## How MarkSync uses it
- Before operating on an **adopted** page, read its restrictions. If `read`/`update` have non-empty user/group results, treat the page as restricted → warn and require explicit confirmation (do not silently overwrite).
- Restrictions are **not** modified or mirrored by MarkSync (non-goal).

## Error cases
- `403` — no permission to read restrictions; `404` unknown page.

## Implementation / mock contract
- `GetRestrictions(pageId)` → `{read:{users[],groups[]}, update:{users[],groups[]}}` (v1, offset).
- Optional preflight in adoption; otherwise informational in `status`/`doctor`.
- Mock fixture: `P10-01` (empty restrictions); add a fixture with a populated group restriction.

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content-restrictions/
