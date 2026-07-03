# 06 — Page hierarchy (ancestors / children / descendants / list / title filter)

## Purpose
Mirror a source folder tree into a Confluence page tree, validate parent-child relationships, detect duplicate sibling titles, and resolve identity by title. Required by hierarchy mirroring, planning, and adoption.

## Status: CURRENT (v2) — note one deprecated endpoint

## Endpoints

| Operation | Method & path | Status | Params |
|---|---|---|---|
| List pages in space | `GET /wiki/api/v2/spaces/{spaceId}/pages` | CURRENT | `depth`, `sort`, `status[]`, **`title`**, `body-format`, `cursor`, `limit` |
| Site-wide by space | `GET /wiki/api/v2/pages?space-id={id}&title={t}` | CURRENT | (alternative title lookup) |
| Ancestors (breadcrumb) | `GET /wiki/api/v2/pages/{id}/ancestors` | CURRENT | `limit` only (no cursor — re-call with first ancestor id for more) |
| Direct children (all content types) | `GET /wiki/api/v2/pages/{id}/direct-children` | CURRENT | `cursor`, `limit`, `sort` |
| Descendants (whole subtree) | `GET /wiki/api/v2/pages/{id}/descendants` | CURRENT | `depth` (int), `cursor`, `limit` |
| ~~Child pages (pages only)~~ | ~~`GET /wiki/api/v2/pages/{id}/children`~~ | **DEPRECATED** | use `direct-children` |

**Scope:** `read:page:confluence` (list/ancestors); `read:hierarchical-content:confluence` (children/descendants). **Pagination:** cursor.

## Verbatim — ancestors (top→bottom)
Evidence: `P3-01-ancestors.json` (grandchild `40697857`'s ancestors)

```http
GET /wiki/api/v2/pages/40697857/ancestors HTTP/1.1
```
```json
{ "results": [
    { "id": "39223464", "type": "page" },
    { "id": "40108040", "type": "page" },
    { "id": "40697857", "type": "page" }
  ],
  "_links": { "base": "https://cwiakalski.atlassian.net/wiki" } }
```
Order is root-first. Use this to compute a page's path/breadcrumb and to verify a reparent (see [07](./07-page-move.md)).

## Verbatim — direct-children (all content types)
Evidence: `P3-02-direct-children.json`

```http
GET /wiki/api/v2/pages/40108040/direct-children HTTP/1.1
```
```json
{ "results": [
    { "id": "40697857", "status": "current", "title": "Coverage Child A", "childPosition": 920, "type": "page" },
    { "id": "40435747", "status": "current", "title": "Coverage Child B", "childPosition": 1126, "type": "page" }
  ], "_links": { "base": "…" } }
```
> Returns **all content types** (Page, Database, Embed, Folder, Whiteboard). Filter `type === "page"` for MarkSync. This **replaces the deprecated `/children`** endpoint.

## Verbatim — descendants (subtree, with depth)
Evidence: `P3-03-descendants.json`

```http
GET /wiki/api/v2/pages/40108040/descendants?limit=50 HTTP/1.1
```
```json
{ "results": [
    { "id": "40697857", "title": "Coverage Child A", "parentId": "40108040", "depth": 1, "type": "page", "lastModified": "…" },
    { "id": "39780356", "title": "Coverage Grandchild", "parentId": "40697857", "depth": 2, "type": "page", "lastModified": "…" },
    { "id": "40435747", "title": "Coverage Child B", "parentId": "40108040", "depth": 1, "type": "page", "lastModified": "…" }
  ], "_links": { "base": "…" } }
```
Use `descendants` to fetch a whole managed subtree in one paginated call (efficient for stale-reporting / orphan detection).

## Verbatim — list pages in space + title filter (real-time identity resolution)
Evidence: `P2-02-by-title.json`

```http
GET /wiki/api/v2/spaces/39223300/pages?title=MarkSync+Coverage+%E2%80%94+Root&limit=5 HTTP/1.1
```
```json
{ "results": [ {
    "id": "40108040", "status": "current", "title": "MarkSync Coverage — Root",
    "parentId": "39223464", "version": { "number": 1 },
    "_links": { "webui": "/spaces/marksyncte/pages/40108040/MarkSync+Coverage+Root" } } ],
  "_links": { "base": "…" } }
```

> ⚠️ **Use this v2 `title` filter (a real-time DB query) for identity resolution and duplicate-sibling-title detection — NOT CQL search**, which is index-latent (see [14](./14-search-cql.md)). The `title` param is a substring match; for an exact check, compare `results[].title` equality client-side.

## Error cases
- `404` unknown page id; `403` no access.

## Implementation / mock contract
- `ListPagesInSpace(spaceId, {title, cursor, limit})`, `Ancestors(id)`, `DirectChildren(id)`, `Descendants(id, {depth})` — all follow `_links.next`.
- Planning uses `descendants` to snapshot the existing tree, then computes CREATE/UPDATE/MOVE/NOOP.
- Mock fixtures: `P3-01/02/03`, `P2-02`.

## Reference
- Ancestors: …/rest/v2/api-group-ancestors/ · Children: …/api-group-children/ · Descendants: …/api-group-descendants/ · Pages-in-space: …/api-group-page/#api-spaces-id-pages-get
