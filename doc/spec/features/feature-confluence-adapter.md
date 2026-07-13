---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-CONFLUENCE-ADAPTER
status: Current
created: 2026-07-06
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: [GH-21, GH-26, GH-66]
  decisions: [ADR-0005, ADR-0006, ADR-0010]
  contracts: []
---

# Feature Specification: Confluence Cloud Adapter

> The `TargetSystem` port implementation for Atlassian Confluence Cloud.

## 1. Overview

The Confluence adapter is the sole implementation of the `TargetSystem` port. It
isolates all Confluence Cloud API specifics behind a clean boundary so domain
logic has zero Confluence imports. Future wiki adapters implement the same port.
The port interface (`src/domain/target/port.ts`) is domain-owned and carries no
Confluence type; the adapter (`src/infra/confluence/`) implements it. The
transport surface — client, per-surface services, and the provenance formatter
— is delivered (GH-21).

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Confluence Cloud has a split API surface (v2 primary, v1 for
  legacy operations) with undocumented behaviors, rate limits, and permission
  asymmetries. Leaking these into domain logic makes the system untestable and
  non-portable.
- **Affected Users:** All MarkSync users (the adapter is the only Confluence
  integration path).
- **Business Impact:** Adapter isolation enables mock-based testing (the dominant
  test layer) and makes future adapters possible.

## 3. Functionality

### 3.1 Capabilities

- **Page CRUD:** create, read, update, move via the v2 REST API. `updatePage`
  carries the current `title` (the v2 PUT requires it) and sends
  `version.number = baseVersion + 1`.
- **Body rendering:** `renderBody(hast, opts)` delegates to the GH-20 Storage
  renderer (`renderStorage`) and returns `{ body, hash, warnings }`. The input is
  canonical HAST (not MDAST) — the app layer runs `parseMarkdown` → `mdastToHast`
  → `target.renderBody(hast, opts)`.
- **Content properties:** read/write the `marksync.metadata` content property
  via the v1 REST API (key-based GET/POST/PUT) for machine-readable state. The
  v2 path parameter expects a property ID, not a key, so key-based access uses
  v1. `getProperty` returns `string | undefined` (a missing key is not an
  error). `putProperty` is create-or-update: POST create, and on a 409 (key
  exists) it GETs the current `version.number` then PUTs with
  `version.number = current + 1` (v1 optimistic concurrency). A property-PUT
  409 (a rare concurrent race after the version GET) maps to
  `RemoteUnreachable`, not `Conflict` — the `Conflict` kind is page-shaped
  (DEC-6 / GH-66).
- **Attachments:** upload, existence check, list (v1-only). Hash-named
  files dedup on the filename; a duplicate-filename 400 is the idempotency
  signal (mapped to an "already exists" result, not an error). Changed bytes
  always produce a new hash-named file (fresh create) — there is no in-place
  `/data` update by design. The upload/existence surface is exercised by the
  safe-publish asset upload step (GH-26).
- **Search:** CQL search for page discovery (v1-only).
- **Restrictions:** read page restrictions (v1-only).
- **Labels:** add, delete, list (v1-only) — **deferred to post-MS-0002** (no
  MS-0002 flow uses labels; DEC-8 / NFR-MAINT-2).
- **Provenance:** the `version.message` formatter produces the per-version
  provenance string (ADR-0010).
- **Optimistic concurrency:** 409 on stale `version.number` is parsed into a
  typed `Conflict` with the version numbers extracted from the response title.

### 3.2 API surface split

| Operation | API | Notes |
|---|---|---|
| Page create/read/update/move | v2 | Primary surface |
| Content properties | v1 | `marksync.metadata` key-based GET/POST/PUT; the v2 path expects a property ID, not a key |
| Attachments upload/update/list | v1-only | Not in v2 |
| Search (CQL) | v1-only | Not in v2 |
| Restrictions read | v1-only | Not in v2 |
| Labels add/delete | v1-only | **Deferred** — post-MS-0002 (DEC-8) |

> **Spike-validated (MS-0001):** every operation above was confirmed working
> against a live Confluence Cloud tenant.

### 3.3 Edge cases & error handling

Every port operation returns `Result<T, MarkSyncError>` — expected failures are
typed errors, never throws.

- **409 version conflict:** parsed into `Conflict { pageId; baseVersion;
  remoteVersion }` (version numbers extracted from the response title) and
  returned to the sync engine for drift reclassification.
- **403 permission asymmetry:** mapped to `Forbidden` → warn + skip; the page is
  never deleted + recreated (INV-SAFE-1). A 403 is treated as inaccessible, not
  missing.
- **404 not found:** mapped to `RemoteMissing`.
- **Rate limiting (429):** exponential backoff with jitter (1s/2s/4s),
  `Retry-After` honored, max 3 retries; on exhaustion → `RateLimited`.
- **Server/network failure (5xx / network throw):** retried max 3; on exhaustion
  → `RemoteUnreachable`.
- **Schema drift:** every Confluence response is zod-validated at the boundary;
  a response that fails its schema maps to `RemoteUnreachable` (never a silent
  misparse).
- **API drift (deprecation):** nightly live-tenant smoke + weekly deprecation
  feed check (wired by E5-S1).

## 4. Technical Architecture

### 4.1 Design

Implements the `TargetSystem` port interface (`src/domain/target/port.ts`). All
Confluence-specific types (Storage Format, v2 response envelopes, the 409 body)
stay within adapter modules and are validated by zod schemas at the boundary
before crossing into typed port returns. The port defines its own
adapter-agnostic value types (`Page`, `CreatePageRequest`, `UpdatePageRequest`
[includes `title`], `MovePageRequest`, `AttachmentRef`, `Artifact`, `PageRef`,
`PageRestrictions`, `RenderedBody`).

### 4.2 Core components

| Component | Module | Responsibility |
|---|---|---|
| ConfluenceClient | `src/infra/confluence/client.ts` | Native-`fetch` HTTP transport; `v1`/`v2` URL builders rooted at `baseUrl`; `authHeader` injection; redacted logging; 429 backoff → `RateLimited`; 5xx retry → `RemoteUnreachable`; 401/403 never retried |
| PageService | `src/infra/confluence/pages.ts` | Page create/read/update/move via v2; the 409-conflict parse → typed `Conflict`; 403 → `Forbidden`; 404 → `RemoteMissing` |
| PropertyService | `src/infra/confluence/properties.ts` | `marksync.metadata` string content-property read/write via v1 (key-based GET/POST/PUT with `version.number` handling; lock cross-check) |
| AttachmentService | `src/infra/confluence/attachments.ts` | Multipart upload (v1); 400-duplicate-filename idempotency signal → "already exists"; existence + list. `/data` update removed (hash-naming makes it unnecessary: changed bytes → new filename → fresh create) |
| SearchService | `src/infra/confluence/search.ts` | CQL page discovery via v1 (minimal) |
| RestrictionsService | `src/infra/confluence/restrictions.ts` | Page restrictions read via v1 (minimal) |
| Provenance formatter | `src/infra/confluence/provenance.ts` | `version.message` formatter (ADR-0010); deterministic trim to `MAX_VERSION_MESSAGE_LEN` |
| ConfluenceTarget | `src/infra/confluence/target.ts` | The `TargetSystem` port implementor; composes the client + all services; `renderBody` delegates to `renderStorage` |
| Boundary schemas | `src/infra/confluence/schemas/*.ts` | zod schemas validating every Confluence response before it crosses into a typed return |

> **Not delivered in MS-0002:** `LabelService` (labels add/delete via v1) is
> deferred to post-MS-0002 (DEC-8 / NFR-MAINT-2). No MS-0002 flow uses labels.

### 4.3 Key decisions

- **ADR-0005:** Write Storage Format (not ADF).
- **ADR-0006:** Confluence page ID = remote identity; content properties carry
  MarkSync state; 409 is the decentralized optimistic-concurrency gate; 403 →
  warn+skip (INV-SAFE-1).
- **ADR-0010:** `version.message` provenance — squash by default; one Confluence
  version per sync with a compact provenance summary.
- **TDR-0003:** Shell-Git behind Repository interface (for any Git operations
  the adapter triggers).

## 5. Acceptance criteria

- [x] No Confluence-specific types leak into domain or CLI layers (enforced by
      dependency-cruiser — `domain-may-not-import-infra` /
      `presentation-may-not-import-infra`).
- [x] v2 used for page CRUD/hierarchy; v1 used for content properties
      (key-based access), attachments, search, and restrictions.
- [x] 409 optimistic concurrency correctly parsed and surfaced as `Conflict`.
- [x] 403 on locked page: warn + skip (not delete + recreate).
- [x] Rate-limit retry: exponential backoff with documented policy; exhausted →
      `RateLimited`.
- [x] Every Confluence response zod-validated at the boundary.

## 6. References

- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
- [ADR-0010](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md)
- [Architecture overview](../../overview/architecture-overview.md)
- [Test spec](../../quality/test-specs/test-spec-confluence-adapter.md)
- [Integration scenarios (MS-0001 spike)](../../inception/integration-scenarios/)
- [NFRs](../nonfunctional.md)
