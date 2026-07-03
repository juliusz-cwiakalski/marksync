# 13 — Version conflict / drift detection (the 409 signal)

## Purpose
Refuse to blindly overwrite a page a human edited in Confluence. This is the **safety core** of MarkSync: a stale update must be classified as `REMOTE_AHEAD`/`DIVERGED` and surfaced, never silently applied. The version-conflict response is the machine-classifiable drift signal.

## Status: CURRENT (v2) — `409 CONFLICT`

## The rule
Confluence Cloud pages use **optimistic concurrency**. An update (`PUT /wiki/api/v2/pages/{id}`) MUST send `version.number = currentVersion + 1`. Sending `currentVersion` (or any non-incrementing value) is rejected:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```
```json
{ "errors": [ {
    "status": "409",
    "code": "CONFLICT",
    "title": "Version must be incremented when updating a page. Current Version: [3]. Provided version: [3]",
    "detail": null
  } ] }
```

## Verbatim — correct update succeeds; stale update conflicts
Evidence: `G1-02-correct.json` (page at v2, sent v3 → 200) and `G1-03-stale.json` (sent v3 again after page advanced → 409).

Step 1 — read current version:
```http
GET /wiki/api/v2/pages/39813121 HTTP/1.1   →  "version": { "number": 2 }
```
Step 2 — correct update (current+1):
```http
PUT /wiki/api/v2/pages/39813121 HTTP/1.1
{ …, "version": { "number": 3, "message": "conflict test correct" } }
→ HTTP/1.1 200 OK   (page is now v3)
```
Step 3 — stale update (sends v3 again, but page is now v3 so it needs v4):
```http
PUT /wiki/api/v2/pages/39813121 HTTP/1.1
{ …, "version": { "number": 3, "message": "conflict test stale" } }
→ HTTP/1.1 409 Conflict
{ "errors":[{ "status":"409", "code":"CONFLICT",
  "title":"Version must be incremented when updating a page. Current Version: [3]. Provided version: [3]" }] }
```

## Classification (FR-SYNC-002/003)
Compare local vs base vs remote (body hashes + version):

| Local vs base | Remote vs base | State | Default action |
|---|---|---|---|
| same | same | `CLEAN` | NOOP |
| changed | same | `LOCAL_AHEAD` | UPDATE (send current+1) |
| same | changed | `REMOTE_AHEAD` | conflict → suggest `pull`; **no update request** |
| changed | changed | `DIVERGED` | conflict → export base/local/remote |
| exists | missing | `REMOTE_MISSING` | explicit recreate only |
| missing | exists | `LOCAL_MISSING` | report; **no DELETE** (MVP) |

A `409` on an attempted UPDATE confirms `REMOTE_AHEAD`/`DIVERGED`. **Never blind-retry a 409.**

## Implementation / mock contract
- Always `GET` the current `version.number` immediately before `PUT`; send `current+1`.
- Treat `409` with `code:"CONFLICT"` as the drift signal; classify and stop (do not retry).
- Also persist `version.number` from the successful update response into the lock.
- Mock fixtures: `G1-02` (200 correct), `G1-03` (409 stale with the exact title string above).

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-put
