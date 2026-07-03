# 02 — Spaces (resolve, list, paginate)

## Purpose
MarkSync resolves a configured Confluence target (`baseUrl` + space key) into a `spaceId`, validates access, and lists spaces for target selection. Required by config validation, `init`, and `auth status`.

## Status: CURRENT (v2)

## Endpoints

| Operation | Method & path | Params |
|---|---|---|
| List spaces | `GET /wiki/api/v2/spaces` | `ids[]`, `keys[]`, `type`, `status`, `labels[]`, `sort`, `cursor`, `limit` |
| Get by id | `GET /wiki/api/v2/spaces/{id}` | `include-icon`, `include-labels`, `include-permissions`… |
| Get by key | `GET /wiki/api/v2/spaces?keys={KEY}` → `results[0]` | (no dedicated by-key endpoint) |

**Scope:** `read:space:confluence` (granular) / `read:confluence-space.summary` (classic). **Pagination:** cursor (`cursor`,`limit`, follow `_links.next`).

## Verbatim — resolve space by key
Evidence: `B1-01-space.json`

```http
GET /wiki/api/v2/spaces?keys=marksyncte&limit=5 HTTP/1.1
Authorization: Basic <redacted>
Accept: application/json
```

```http
HTTP/1.1 200 OK
```
```json
{
  "results": [
    {
      "id": "39223300",
      "key": "marksyncte",
      "name": "marksync-tests",
      "type": "knowledge_base",
      "status": "current",
      "authorId": "557058:...",
      "homepageId": "39223464"
    }
  ],
  "_links": { "base": "https://cwiakalski.atlassian.net/wiki" }
}
```

> ⚠️ The v2 list uses **`keys`/`ids`** (array) query params — NOT the v1 `spaceKey`. `homepageId` is returned directly.

## Verbatim — list with cursor pagination
Evidence: `P1-01-page1.json`

```http
GET /wiki/api/v2/spaces?limit=1 HTTP/1.1
```
```json
{ "results": [ { "id": "...", "key": "...", "name": "..." } ], "_links": { "base": "..." } }
```
When more results exist, the response includes `_links.next` (a relative URL with a `cursor` token). Follow it to fetch the next page:
```http
GET {baseUrl}/wiki/api/v2/spaces?cursor=<token>&limit=1
```
(On this single-space tenant no `next` link was produced; the cursor mechanism is exercised on the page-list endpoints in [06](./06-page-hierarchy.md).)

## Error cases
- `404` for `GET /spaces/{id}` with an unknown/inaccessible id.
- `403` if the user has no access to the space.

## Implementation / mock contract
- `ResolveSpace(keyOrId)` → `{id, key, name, type, homepageId}`; cache the `homepageId` (used as the default parent for created pages).
- `ListSpaces()` must follow `_links.next` until exhausted (cursor paginator).
- Mock fixture: the `B1` response above; a multi-page fixture with a `_links.next` containing a cursor token.

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-space/
