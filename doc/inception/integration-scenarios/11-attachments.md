# 11 — Attachments (images, assets, rendered diagrams)

## Purpose
Upload and manage binary assets — local images and **Mermaid/diagrams rendered to images** — attached to pages, with content-hash naming so unchanged assets are skipped (idempotency) and changed ones get a new version. Decision-driving feature per the strategy report.

## Status: **mixed** — v2 for read/delete (CURRENT); **V1-ONLY** for upload/update/download (no v2 endpoints exist).

## Endpoints

| Operation | Method & path | Status |
|---|---|---|
| List for page | `GET /wiki/api/v2/pages/{id}/attachments` | CURRENT (v2) — `sort`,`status[]`,`mediaType`,`filename`,`cursor`,`limit`; returns `downloadLink` + `_links.download` |
| Get by id | `GET /wiki/api/v2/attachments/{id}` | CURRENT (v2) |
| Delete | `DELETE /wiki/api/v2/attachments/{id}?purge=true` | CURRENT (v2) → 204 |
| **Upload** | `POST /wiki/rest/api/content/{id}/child/attachment` | **V1-ONLY** — multipart; header **`X-Atlassian-Token: no-check`** |
| **Update (new version)** | `POST /wiki/rest/api/content/{id}/child/attachment/{attId}/data` | **V1-ONLY** — multipart; same filename, bumped version |
| **Download binary** | `GET {baseUrl}/wiki{downloadLink}` | **V1-ONLY path** |

**Scopes:** v2 `read:attachment:confluence` / `delete:attachment:confluence`; v1 `write:confluence-file` (upload) / `readonly:content.attachment:confluence` (download).

## Hash-based naming (FR-AST-004/006)
Attachment filename = `marksync-<content-hash-24>.png` (sha256 of source+renderer config, truncated). Identical content → identical filename → **no re-upload needed**; changed content → different filename → new attachment. This avoids version spam and watcher emails.

## Verbatim — upload (v1 multipart)
Evidence: `F-01-upload.json`
```http
POST /wiki/rest/api/content/39813121/child/attachment HTTP/1.1
Authorization: Basic <redacted>
X-Atlassian-Token: no-check
Content-Type: multipart/form-data; boundary=…
```
(form fields: `file` = PNG blob, `minorEdit` = `true`)
```http
HTTP/1.1 200 OK
```
```json
{ "results": [ { "id": "att40009729", "title": "spike-diagram.png", "version": { "number": 1 },
  "_links": { "download": "/rest/api/content/39813121/child/attachment/att40009729/download" } } ] }
```

## Verbatim — duplicate filename is rejected (the idempotency signal)
Evidence: `F-03-reupload-create.json`
```http
POST /wiki/rest/api/content/39813121/child/attachment   (same filename again)
```
```http
HTTP/1.1 400 Bad Request
```
```json
{ "statusCode": 400,
  "message": "com.atlassian.confluence.api.service.exceptions.api.BadRequestException: Cannot add a new attachment with same file name as an existing attachment: spike-diagram.png" }
```
> **Implication:** the create endpoint never overwrites. MarkSync must (a) check existing attachments by filename/hash, (b) if hash matches → skip, (c) if hash differs → update via `/data`.

## Verbatim — update existing attachment content (v1 `/data`)
Evidence: `F-04-update-data.json`
```http
POST /wiki/rest/api/content/39813121/child/attachment/att40009729/data HTTP/1.1
X-Atlassian-Token: no-check
Content-Type: multipart/form-data; boundary=…
```
```http
HTTP/1.1 200 OK
```
Returns the attachment with `version.number` **bumped** (1 → 2):
```json
{ "id": "att40009729", "title": "spike-diagram.png",
  "version": { "number": 2, "minorEdit": true } }
```

## Verbatim — list (v2) + get (v2) + binary download + sha256 verify
Evidence: `P6-02-list-v2.json`, `P6-03-get-v2.json`, `P6-04-download.json`
```http
GET /wiki/api/v2/pages/{pageId}/attachments HTTP/1.1     # v2 list
GET /wiki/api/v2/attachments/att40763393 HTTP/1.1        # v2 get
```
The v2 metadata carries `downloadLink` (a v1 path **without** the `/wiki` prefix):
```json
{ "id": "att40763393", "title": "spike-diagram.png", "mediaType": "image/png",
  "fileSize": 79, "version": { "number": 1 },
  "downloadLink": "/rest/api/content/{pageId}/child/attachment/att40763393/download",
  "_links": { "download": "/rest/api/content/{pageId}/child/attachment/att40763393/download" } }
```
Download the binary by prefixing `/wiki`:
```http
GET /wiki/rest/api/content/{pageId}/child/attachment/att40763393/download HTTP/1.1
```
```http
HTTP/1.1 200 OK
Content-Type: image/png
<binary 79 bytes>
```
`sha256(downloaded) === sha256(uploaded)` → **verified** (P6 PASS).

## Error cases
- `400` "same file name" on duplicate upload → use `/data` to update.
- `404` unknown attachment id / page.
- Do **not** blind-retry uploads (outcome may be ambiguous) — retry only network pre-response failures.

## Implementation / mock contract
- `ListAttachments(pageId)` (v2, cursor), `UploadAttachment(pageId, filename, bytes, mime)` (v1), `UpdateAttachmentData(attId, bytes)` (v1), `DownloadAttachment(downloadLink)` → bytes.
- Planner: compute hash → compare to existing attachment of the same filename → `NOOP` (match) / `UPDATE` (diff) / `CREATE` (absent).
- MVP does **not** auto-delete orphaned attachments (FR-AST-010) — report only.
- Mock fixtures: `F-01` (upload 200), `F-03` (dup 400), `F-04` (update 200), `P6-02/03/04` (list/get/download).

## Reference
- v2: https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-attachment/
- v1: https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content---attachments/
