# 10 — Content properties v2 (`marksync.metadata`)

## Purpose
Store per-page machine state — document identity, source path, commit SHA, content hashes — as a content property keyed `marksync.metadata`. This is the **durable remote state** that survives lock-file loss and enables ownership checks, drift detection, and adoption. **Load-bearing** for the whole sync model.

## Status: CURRENT (v2) — the v1 API is **DEPRECATED** (removal date passed) and must NOT be used.

## Endpoints (all under `/wiki/api/v2/pages/{pageId}/properties`)

| Operation | Method & path | Params / body |
|---|---|---|
| List | `GET /wiki/api/v2/pages/{pageId}/properties` | `key`, `sort`, `cursor`, `limit` |
| Create | `POST /wiki/api/v2/pages/{pageId}/properties` | `{ "key": "...", "value": <any> }` |
| Get by id | `GET /wiki/api/v2/pages/{pageId}/properties/{propId}` | |
| Update | `PUT /wiki/api/v2/pages/{pageId}/properties/{propId}` | `{ "key","value","version":{"number":cur+1} }` |
| Delete | `DELETE /wiki/api/v2/pages/{pageId}/properties/{propId}` | → 204 |

**Scope:** `read:content.property:confluence` / `write:content.property:confluence` (granular); `read:confluence-props` / `write:confluence-props` (classic). **Pagination:** cursor.

> The OpenAPI spec types `value` as `any`; the spike proved **string** values work. MarkSync stores `value` as a **JSON string** (its own serialization). v1 and v2 properties **share one namespace** (a v1-created property conflicts on v2 create with 409) — since v1 is deprecated, always use v2.

## The `marksync.metadata` value (JSON string)
```json
{
  "schemaVersion": 1,
  "projectId": "marksync-for-confluence",
  "targetId": "corporate",
  "documentId": "2b1f9fc1-6f53-4f1e-9d35-c51f67b6250f",
  "repositoryUrl": "https://github.com/.../marksync-for-confluence",
  "sourcePath": "architecture/01-context.md",
  "sourceCommit": "a1b2c3d4e5f67890123456789abcdef01234567",
  "sourceContentHash": "sha256:…",
  "renderedBodyHash": "sha256:…",
  "toolVersion": "0.1.0",
  "synchronizedAt": "2026-07-03T13:43:05Z"
}
```
The `propId` is **not stable** across delete+recreate; resolve by `key` via the list endpoint (`GET …/properties?key=marksync.metadata`). Persist the `propId` in the lock for fast updates.

## Verbatim — create
Evidence: `E2-01-create-str.json`
```http
POST /wiki/api/v2/pages/39485441/properties HTTP/1.1
Content-Type: application/json
```
```json
{ "key": "marksync.metadata", "value": "{\"schemaVersion\":1,…\"synchronizedAt\":\"2026-07-03T09:00:00Z\"}" }
```
```http
HTTP/1.1 200 OK
```
```json
{ "id": "39911425", "key": "marksync.metadata",
  "version": { "number": 1, "when": "…", "message": "" } }
```

> **Note:** the spike originally used the key `marksync.metadata.v2`, but the
> canonical key is **`marksync.metadata`** (the key name does not need to encode
> the API version — v2 is an endpoint concern, not a key concern).

## Verbatim — update (PUT, version-bumped)
Evidence: `P7-02-update.json`
```http
PUT /wiki/api/v2/pages/{pageId}/properties/39518220 HTTP/1.1
```
```json
{ "key": "marksync.covprop", "value": "{\"v\":2}", "version": { "number": 2, "message": "cov update" } }
```
```http
HTTP/1.1 200 OK
```
```json
{ "id": "39518220", "key": "marksync.covprop",
  "value": "{\"v\":2}",
  "version": { "number": 2, "message": "cov update" } }
```
Same optimistic-concurrency rule as pages: `version.number = current+1`, else `409`.

## Verbatim — list (note: pages also carry editor-generated properties)
Evidence: `E2-03-list.json` — the list returns MarkSync properties **and** Confluence's own (`page-title-property-*`):
```json
{ "results": [
  { "key": "page-title-property-draft", "value": "{…}", "id": "39485458", "version": {…} },
  { "key": "page-title-property-published", "value": "{…}", "id": "39485460", "version": {…} },
  { "key": "marksync.metadata", "value": {…}, "id": "39485462", "version": {…} }
] }
```
Always filter by `key=marksync.metadata`; do not assume only your properties exist.

## Size limits
Not explicitly documented in v2; the spike proved an **~8.4 KB** string value is accepted (`E3-02-v2-large.json`, HTTP 200). MarkSync's metadata is ~1 KB — comfortably within limits.

## Error cases
- `409 CONFLICT` "Property with key […] already exists" — create with an existing key. Resolve existing first, then update.
- `409` on PUT — property version not incremented.
- `403` — no write permission.

## Implementation / mock contract
- `GetContentProperty(pageId, key)` (resolve via list by key), `PutContentProperty(pageId, key, value)` (create-or-update with version bump), `DeleteContentProperty(pageId, propId)`.
- Write the property **only after the body succeeds** (§9.3); on success the lock and the remote property agree.
- Adoption check: if `GetContentProperty` returns a property with a **different** `projectId` → refuse unless `--force` (FR-DOC-011).
- Mock fixtures: `E2-01` (create), `P7-02` (update), `E2-03` (list with foreign props).

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-content-properties/
