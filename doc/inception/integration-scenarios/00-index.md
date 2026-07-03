# MarkSync ↔ Confluence Cloud — Integration Scenarios

> Authoritative, evidence-backed reference for every Confluence Cloud REST API operation MarkSync must perform.
> Each scenario document contains the **current (non-deprecated) endpoint**, a **verbatim request**, a **verbatim captured response** (from the 2026-07-03 live spike against tenant `cwiakalski.atlassian.net`, space `marksyncte`), error cases, and an implementation/mock contract.
> Use these for exact implementation and for mocking integration tests.

## Provenance

- **Live evidence:** `doc/inception/tmp/confluence-api-validation-spike/evidence/raw/` (redacted request/response captures; `A1`–`K1` from `run.mjs`, `P1`–`P10` from `coverage.mjs`, `R0` reverse read). Scenario docs cite these by file name.
- **API reference (current vs deprecated):** `doc/inception/tmp/confluence-api-validation-spike/doc/research/atlassian-confluence-api-reference.md`.
- **Spike findings:** `…/findings/atlassian-api-spike-findings.md` and `…/findings/coverage-findings.md`.
- **Tenant constants used in examples:** site `https://cwiakalski.atlassian.net`; space key `marksyncte`, spaceId `39223300`, homepageId `39223464`. Account IDs in captures are the owner's sandbox account and are not secrets.

## Base URLs

- **Direct** (classic API token, Basic auth): `https://{site}.atlassian.net/wiki/...` — used for all live-proven scenarios.
- **Gateway** (scoped tokens / OAuth 3LO): `https://api.atlassian.com/ex/confluence/{cloudId}/wiki/...` — same paths; required for scoped tokens and OAuth.

## Version-status legend

| Tag | Meaning |
|---|---|
| **CURRENT (v2)** | The v2 endpoint is the supported one; prefer it. |
| **V1-ONLY** | No v2 endpoint exists; the v1 endpoint is the current, supported one. |
| **DEPRECATED** | Do not use in new code; a current replacement exists. |

## Scenario index

| # | Scenario | Doc | API status |
|---|---|---|---|
| 01 | Authentication (API token, scoped/gateway, cloudId, scopes) | [01-authentication.md](./01-authentication.md) | CURRENT |
| 02 | Spaces — resolve (by key/id), list, pagination | [02-spaces.md](./02-spaces.md) | CURRENT (v2) |
| 03 | Create page (Storage + ADF; parent/child) | [03-page-create.md](./03-page-create.md) | CURRENT (v2) |
| 04 | Read page (body formats storage/ADF/view; by version) | [04-page-read.md](./04-page-read.md) | CURRENT (v2) |
| 05 | Update + delete page (version+1, title-only, soft/purge) | [05-page-update-delete.md](./05-page-update-delete.md) | CURRENT (v2) |
| 06 | Page hierarchy — ancestors / direct-children / descendants / list-in-space / title filter | [06-page-hierarchy.md](./06-page-hierarchy.md) | CURRENT (v2) |
| 07 | Move/reparent page (PUT parentId) | [07-page-move.md](./07-page-move.md) | CURRENT (v2) |
| 08 | Page versions & history (list with body; specific version) | [08-page-versions.md](./08-page-versions.md) | CURRENT (v2) |
| 09 | Markdown → Storage rendering (construct map; kitchensink round-trip) | [09-markdown-to-storage.md](./09-markdown-to-storage.md) | CURRENT (v2) |
| 10 | Content properties v2 CRUD (`marksync.metadata`, size, update) | [10-content-properties.md](./10-content-properties.md) | CURRENT (v2) |
| 11 | Attachments (v2 read; v1 upload/update; binary download; hash naming) | [11-attachments.md](./11-attachments.md) | mixed: v2 read, **V1-ONLY** upload/update/download |
| 12 | Labels (v2 read; v1 add/delete) | [12-labels.md](./12-labels.md) | mixed: v2 read, **V1-ONLY** add/delete |
| 13 | Version conflict / drift detection (409 CONFLICT) | [13-version-conflict-drift.md](./13-version-conflict-drift.md) | CURRENT (v2) |
| 14 | Search / CQL (find by space/title/label; index-latency caveat) | [14-search-cql.md](./14-search-cql.md) | **V1-ONLY** |
| 15 | Reverse sync — read Confluence → Markdown (Storage/ADF) | [15-reverse-sync.md](./15-reverse-sync.md) | CURRENT (v2) |
| 16 | Restrictions (read; detect do-not-touch) | [16-restrictions.md](./16-restrictions.md) | **V1-ONLY** |
| 17 | Pagination, error envelopes, rate limiting | [17-pagination-errors-ratelimits.md](./17-pagination-errors-ratelimits.md) | cross-cutting |
| 18 | OAuth 2.0 (3LO) browser login (later phase) | [18-oauth-3lo.md](./18-oauth-3lo.md) | CURRENT (documented; not live-proven) |

## Cross-cutting conventions

- **Auth header (all requests):** `Authorization: Basic base64("{email}:{api-token}")` (API token) or `Authorization: Bearer {access-token}` (OAuth). `Accept: application/json`; `Content-Type: application/json` for JSON bodies.
- **v2 error envelope:** `{"errors":[{"status":"409","code":"CONFLICT","title":"…","detail":"…"}]}`. **v1 error envelope:** `{"statusCode":403,"message":"…","data":{…}}`.
- **Pagination:** v2 lists are **cursor** (`cursor`,`limit`, follow `_links.next`); v1 lists are **offset** (`start`,`limit`).
- **Optimistic concurrency:** every page/property update must send `version.number = current + 1`; sending `current` → `409 CONFLICT`.
- **No long-task polling** is required for MarkSync's operations (page CRUD and attachment upload are synchronous).

## What MarkSync does NOT need (non-goals, per inception)

Sync of comments, whiteboards, databases, blog posts, or arbitrary custom content; real-time co-editing; auto-deletion (MVP); Confluence Data Center (MVP). These are intentionally out of scope and have no scenario docs.
