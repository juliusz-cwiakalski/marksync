# 17 — Pagination, error envelopes, rate limiting

## Purpose
Cross-cutting behavior every adapter operation must handle: paginated collection traversal, the two error-envelope shapes, and rate limiting/retry.

## Status: CURRENT

## Pagination

**Rule of thumb:** all **v2** list endpoints use **cursor** pagination; all **v1** list endpoints use **offset** pagination.

| Family | API | Type | Params | Next |
|---|---|---|---|---|
| Pages (list), pages-in-space, spaces, attachments (v2), labels (v2), content properties (v2), versions, direct-children, descendants | v2 | **cursor** | `cursor`,`limit` | `Link: rel="next"` + body `_links.next` |
| Ancestors | v2 | limited | `limit` only (no cursor) | re-call with first ancestor id |
| Attachments (v1 list), labels (v1 list), content properties (v1), search, restrictions | v1 | **offset** | `start`,`limit` | body `_links.next` |

**Cursor mechanics (v2):** send `limit`; if more exist, the response body contains `_links.next` (a relative URL with a `cursor=…` token). Fetch `{baseUrl}/wiki{next}` (note the `/wiki` prefix) until `_links.next` is absent.

```json
{ "results": [ … ],
  "_links": { "next": "/wiki/api/v2/spaces/39223300/pages?cursor=eyJ…&limit=100", "base": "https://…" } }
```

**Unified paginator:** implement one helper that accepts a "fetch page" callback and yields all results, handling both cursor and offset transparently.

## Error envelopes

**v2 (JSON:API):**
```json
{ "errors": [ { "status": "409", "code": "CONFLICT", "title": "…", "detail": "…", "source": { "pointer": "…" } } ] }
```
**v1:**
```json
{ "statusCode": 403, "message": "…", "data": { "authorized": false, "valid": false, "errors": [ { "message": { "translation": "…", "args": [] } } ], "successful": false } }
```
Always capture the Atlassian request id (`atl-request-id` / `atl-traceid` headers) in typed errors for support.

## Retry & rate limiting
- **Rate limits:** points-based quotas enforce from **2026-03-02** (global pool 65 k pts/hr; per-tenant 65 k–500 k/hr). **API-token (Basic-auth) traffic is NOT on points quotas** — still under burst limits. `429` + `Retry-After` when exceeded.
- **Headers:** `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `RateLimit-Reason` (`confluence-quota-global-based` / `-tenant-based`), `X-RateLimit-NearLimit`.
- **Retry policy (§9.7):** retry network pre-response failures, `429` (honor `Retry-After`), and `502`/`503`/`504` — with bounded exponential backoff + jitter (`maxAttempts:5`, `initialBackoff:500ms`, `maxBackoff:15s`).
- **Do NOT retry:** `400`,`401`,`403`,`404`,`409`, or unknown-outcome attachment uploads.
- A `409` is the **drift signal** ([13](./13-version-conflict-drift.md)) — classify, never blind-retry.

## Verbatim — a v2 error (409 CONFLICT)
Evidence: `G1-03-stale.json` (trimmed):
```http
HTTP/1.1 409 Conflict
atl-request-id: 03910186-10d4-4153-a0cd-e544e3ebcaa1
Content-Type: application/json
```
```json
{ "errors": [ { "status": "409", "code": "CONFLICT",
  "title": "Version must be incremented when updating a page. Current Version: [3]. Provided version: [3]",
  "detail": null } ] }
```

## Verbatim — a v1 error (400 duplicate attachment)
Evidence: `F-03-reupload-create.json` (trimmed):
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```
```json
{ "statusCode": 400, "data": { "authorized": true, "valid": true, "successful": true },
  "message": "…BadRequestException: Cannot add a new attachment with same file name as an existing attachment: spike-diagram.png" }
```

## Implementation / mock contract
- A `paginate(fetchPage)` helper (cursor + offset aware).
- Typed errors carrying `{status, code, title, detail, requestId}`; adapter maps 401/403/404/409 to MarkSync error kinds.
- A retry middleware honoring `Retry-After` and the no-retry status set.

## Reference
- v2 intro/pagination: https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
- Rate limiting: https://developer.atlassian.com/cloud/confluence/rate-limiting/
