# 08 — Page versions & history

## Purpose
Read the version history of a page for provenance, and fetch a **specific historical body** to recover the three-way merge **base** during reverse sync (Confluence→Git). Also used to attribute which versions are MarkSync's vs. a human's direct edits.

## Status: CURRENT (v2)

## Endpoints

| Operation | Method & path | Params |
|---|---|---|
| List versions | `GET /wiki/api/v2/pages/{id}/versions` | `body-format` (→ body INLINE per version!), `sort`, `cursor`, `limit` |
| One version (metadata) | `GET /wiki/api/v2/pages/{id}/versions/{n}` | (no body) |
| Version body | `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` | see [04](./04-page-read.md) |

**Scope:** `read:page:confluence`. **Pagination:** cursor.

## Verbatim — list versions with bodies inline
Evidence: `P5-05-versions.json` (a page bumped to v3 with distinct bodies)

```http
GET /wiki/api/v2/pages/{id}/versions?body-format=storage&limit=10 HTTP/1.1
```
```http
HTTP/1.1 200 OK
```
Each `results[]` entry carries the version number, author, message, and — because `body-format` was set — **the body at that version**:
```
v3: <p>version three</p>
v2: <p>version two</p>
v1: <p>coverage fixture</p>
```
i.e. results are newest-first; `result.page.body.storage.value` holds that version's content. Use this to walk history and find the last MarkSync-published version (match the lock's `sourceCommit`/`renderedBodyHash`).

## Verbatim — single-version metadata (no body)
```http
GET /wiki/api/v2/pages/{id}/versions/2 HTTP/1.1
```
Returns `{number, authorId, message, createdAt, minorEdit, collaborators[], prevVersion, nextVersion}` — metadata only. For the body, use the `?version=2&body-format=storage` form.

## Verbatim — fetch a specific version's body
Evidence: `P5-06-v1-body.json`
```http
GET /wiki/api/v2/pages/{id}?version=1&body-format=storage HTTP/1.1
```
Returns the page object with the **version-1 body** (e.g. `"<p>coverage fixture</p>"`) under current metadata. This is the **merge base** for three-way reverse sync.

## How MarkSync uses history (reverse sync base)
1. The lock stores `pageVersion` and `renderedBodyHash` at the last successful push.
2. On `pull`, fetch the **base** = `GET /pages/{id}?version={lock.pageVersion}&body-format=storage`.
3. Fetch **remote** = current body; **local** = rendered Markdown.
4. Diff base↔remote to detect `REMOTE_AHEAD`/`DIVERGED`; produce a patch/conflict bundle (see [15](./15-reverse-sync.md)).

## Error cases
- `404` unknown version; `403` no read.

## Implementation / mock contract
- `ListVersions(id, {bodyFormat})`, `GetVersionBody(id, n, {representation})`.
- Reverse-sync mock fixture: three version bodies (base/local/remote) + their hashes.

## Reference
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/
