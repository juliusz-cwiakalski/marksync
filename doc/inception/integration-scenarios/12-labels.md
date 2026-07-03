# 12 — Labels

## Purpose
Apply Confluence labels to managed pages (e.g. `marksync-managed`) for discovery, filtering, and governance. Optional in MVP; supported because front-matter/config may specify labels.

## Status: **mixed** — v2 for read (CURRENT); **V1-ONLY** for add/delete (no v2 mutation endpoints).

## Endpoints

| Operation | Method & path | Status | Body / params |
|---|---|---|---|
| List (v2) | `GET /wiki/api/v2/pages/{id}/labels` | CURRENT | `prefix`,`sort`,`cursor`,`limit` |
| Add (v1) | `POST /wiki/rest/api/content/{id}/label` | **V1-ONLY** | `[{"prefix":"global","name":"…"}]` |
| List (v1) | `GET /wiki/rest/api/content/{id}/label` | **V1-ONLY** | `start`,`limit` (offset) |
| Delete (v1) | `DELETE /wiki/rest/api/content/{id}/label?name={name}` | **V1-ONLY** | |

**Scopes:** v2 `read:label:confluence`; v1 `write:label:confluence` (add/delete). Allowed prefixes for regular users: `global` (and `my`/`team` where applicable). Custom prefixes are rejected.

## Verbatim — add labels (v1)
Evidence: `H1-01-add.json`
```http
POST /wiki/rest/api/content/39485441/label HTTP/1.1
Content-Type: application/json
```
```json
[ { "prefix": "global", "name": "marksync-managed" },
  { "prefix": "global", "name": "spike" } ]
```
```http
HTTP/1.1 200 OK
```
> ⚠️ Each label object **must include `name`**; a body with only `{"prefix":…}` returns `400 "Could not parse Labels"` (hit during the spike).

## Verbatim — list labels (v2, CURRENT)
Evidence: `P8-02-list-v2.json`
```http
GET /wiki/api/v2/pages/{id}/labels HTTP/1.1
```
```json
{ "results": [ { "prefix": "global", "name": "cov-label", "id": "39583751" } ],
  "_links": { "base": "…" } }
```

## Error cases
- `400` "Could not parse Labels" — missing `name`, or an unsupported `prefix`.
- `403` — no edit permission (add/delete).

## Implementation / mock contract
- `ListLabels(pageId)` (v2), `AddLabels(pageId, [{prefix,name}])` (v1), `DeleteLabel(pageId, name)` (v1).
- Reconcile desired vs. remote label sets in the planner; only add/remove the delta.
- Mock fixtures: `H1-01` (add 200), `P8-02` (v2 list), and a `400` parse fixture.

## Reference
- v2: https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-label/
- v1: https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content-labels/
