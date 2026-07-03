# 14 — Search / CQL

## Purpose
Find pages by space/title/label for stale reporting, bulk adoption, and governance queries. **Important limitation:** CQL search is **eventually-consistent** — freshly created/modified content (and labels) may take tens of seconds to appear. Therefore MarkSync uses the **real-time v2 title filter** ([06](./06-page-hierarchy.md)) for identity resolution and reserves CQL for analytical/background queries over already-indexed content.

## Status: **V1-ONLY** (no v2 search endpoint exists).

## Endpoint
```http
GET /wiki/rest/api/search?cql={cql}&cqlcontext={json}&limit=&cursor=&excerpt=&expand=
```
**Scope:** `search:confluence`. **Pagination:** both offset (`start`,`limit`) and cursor; prefer `_links.next`.

### `cqlcontext` example
```json
{ "spaceKey": ["marksyncte"], "contentStatuses": ["current"] }
```

## CQL query examples (all proven live)

| Goal | CQL |
|---|---|
| All pages in a space | `space="marksyncte" AND type=page` |
| Page by exact title | `space="marksyncte" AND type=page AND title="Hello world page"` |
| By label | `label="cov-search-label"` |
| Modified since a date | `lastmodified >= "2024-06-01T00:00:00Z"` |

> In CQL, `title=` is an **exact** match (not substring). For substring, use `title~"…"`. Content-property predicates (`content.property["key"]`) are limited/undocumented for v2 properties — do not rely on them.

## Verbatim — exact-title search (indexed page)
Evidence: `P9-02-by-title.json`
```http
GET /wiki/rest/api/search?cql=space%3D%22marksyncte%22%20AND%20type%3Dpage%20AND%20title%3D%22Coverage%20Search%20Target%20...%22&limit=5 HTTP/1.1
```
```http
HTTP/1.1 200 OK
```
```json
{ "results": [ {
    "content": { "id": "40665091", "type": "page", "title": "Coverage Search Target …" },
    "url": "/spaces/marksyncte/pages/40665091", "excerpt": "…" } ],
  "_links": { "next": "…", "base": "…" } }
```

## ⚠️ Index-latency finding (proven)
A page created and immediately searched (`P9`, before a 20 s wait) returned **0** results; after waiting ~20 s it returned **1**. Likewise a freshly-added label was not searchable until indexed. Conversely, **deleted pages linger** in the index (a by-space query returned stale results). Therefore:

- **Do NOT** use CQL to resolve the identity of a page you just created/updated/labelled — use `GET /wiki/api/v2/spaces/{id}/pages?title=` (real-time, [06](./06-page-hierarchy.md)).
- **Do** use CQL for: stale reporting across a space, "find all `marksync-managed` pages", governance dashboards — where eventual consistency is acceptable.

## Error cases
- `400` — malformed CQL.
- Empty results may mean "no match" **or** "not yet indexed" — never treat an empty CQL result as proof of absence for fresh content.

## Implementation / mock contract
- `Search(cql, {cursor, limit})` (v1, follow `_links.next`).
- MarkSync's identity resolver uses the v2 title filter, **not** CQL.
- Mock fixtures: `P9-01` (by-space), `P9-02` (by-title 1 hit), `P9-03` (by-label). Add an "empty until indexed" fixture to model latency.

## Reference
- Search: https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/
- CQL: https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/
