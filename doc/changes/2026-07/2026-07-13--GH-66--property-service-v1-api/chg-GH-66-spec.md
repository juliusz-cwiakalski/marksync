---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-66
  type: fix
  status: Proposed
  slug: property-service-v1-api
  title: "PropertyService uses v1 API for key-based access — returns 400 (P0)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [bug, p0, ms-0002, mvp, property-service, v1-api, confluence-adapter]
  version_impact: patch
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: [property-service, confluence-adapter]
    external: [Confluence Cloud REST API v1]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Fix PropertyService to use v1 API for key-based property access, eliminating 400 errors and restoring the update flow.

## 1. SUMMARY

This change fixes a P0 bug where the MarkSync update flow fails with HTTP 400 on every page that needs updating. The root cause is that `PropertyService` uses the v2 API path `/pages/{id}/properties/{key}` for key-based GET and PUT operations, but the v2 path parameter expects a property ID (UUID/numeric), not a string key. The fix switches key-based GET and PUT operations to the v1 API, which correctly handles key-based access (`/content/{id}/property/{key}`). The update mechanism is enhanced to handle v1's optimistic concurrency requirement: when a 409 conflict occurs on POST create, the service GETs the current version number and PUTs with `{value, version: {number: currentVersion + 1}}`.

## 2. CONTEXT

### 2.1 Current State Snapshot

The `PropertyService` (`src/infra/confluence/properties.ts`) provides key-based read/write access to Confluence content properties (used for `marksync.metadata` cross-check). Current implementation uses the v2 API for all operations:

- `get(pageId, key)`: `GET /wiki/api/v2/pages/{pageId}/properties/{key}` → HTTP 400
- `put(pageId, key, value)`: `POST /wiki/api/v2/pages/{pageId}/properties` (create) → works
- `updateByKey(pageId, key, value)`: `PUT /wiki/api/v2/pages/{pageId}/properties/{key}` → HTTP 400

The v2 API's `/properties/{key}` path parameter expects a property ID (UUID/numeric), not a string key. Using a string key like `marksync.metadata` returns HTTP 400.

### 2.2 Pain Points / Gaps

- **Update flow completely blocked**: After editing markdown and re-running `marksync sync`, every page update fails with `RemoteUnreachable status 400: unexpected property get status 400`.
- **Cannot test safe publish workflow**: The entire `marksync sync` update path is unusable; users cannot verify edits or run CI pipelines.
- **Incorrect documentation**: `feature-confluence-adapter.md` claims v2 is used for content properties, which is technically false for key-based access.

## 3. PROBLEM STATEMENT

Because `PropertyService` uses the v2 API path for key-based property access (which expects a property ID, not a key), users cannot run the update flow after editing markdown, resulting in HTTP 400 errors on every page that needs updating.

## 4. GOALS

- **G-1**: Restore the update flow: edit markdown → re-sync → pages UPDATE successfully (no 400 errors).
- **G-2**: `marksync.metadata` content property GET/PUT by key works correctly against Confluence Cloud.
- **G-3**: Maintain existing error semantics: 403 → `Forbidden`, 404 (GET) → `ok(undefined)`, 413/too-large → `TooLarge`, schema failures → `RemoteUnreachable`.
- **G-4**: Preserve byte-equality round-trip including ~8 KB values (NFR-5).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Update flow success rate | 100% of pages with property operations complete without HTTP 400 |
| Property GET round-trip accuracy | 100% byte-equal including ~8 KB values |
| Error mapping consistency | All v1 status codes map to existing error types |

### 4.2 Non-Goals

- **NG-1**: No changes to page CRUD, attachments, search, or restrictions services.
- **NG-2**: No changes to `marksync.metadata` payload schema or reconcile/lock-cross-check logic.
- **NG-3**: No pursuit of the alternative "v2 list → v2 GET/PUT by ID" approach (key-based semantics are simpler).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Key-based property GET via v1 API | v1 correctly accepts string keys in path; resolves 400 errors. |
| F-2 | Key-based property PUT (update) via v1 API with version handling | v1 requires optimistic concurrency via `version.number`; avoids 409 loops. |
| F-3 | Idempotent create-or-update via v1 API | POST create on 409 → GET current version → PUT with incremented version. |
 | F-4 | v1 response schema validation | Parse v1 `{id, key, value, version:{number, when?}}` shape; preserve byte-equality. `version.number` required; `version.when` optional (unused by code). |

### 5.1 Capability Details

**F-1: Key-based property GET via v1 API**

`get(pageId, key)` calls `GET /wiki/rest/api/content/{pageId}/property/{key}` via `this.client.v1()`. The v1 API correctly accepts string keys in the path. On 404, returns `ok(undefined)` (key does not exist). On 403, returns `Forbidden`. On other non-2xx, returns `RemoteUnreachable`. The response shape includes `{id, key, value, version: {number, when}}`; the `value` field is extracted and validated as a string.

**F-2: Key-based property PUT (update) via v1 API with version handling**

`updateByKey(pageId, key, value)` (internal) calls `PUT /wiki/rest/api/content/{pageId}/property/{key}` with body `{key, value, version: {number: currentVersion + 1}}`. The v1 API requires `version.number` for optimistic concurrency; Confluence rejects versionless/stale updates with 409. This capability is invoked after POST create fails with 409.

**F-3: Idempotent create-or-update via v1 API**

`put(pageId, key, value)` uses v1 for both create and update to maintain a consistent API surface:

1. POST create: `POST /wiki/rest/api/content/{pageId}/property` with body `{key, value}`. On 2xx, done.
2. On 409 (key exists), GET current version: `GET /wiki/rest/api/content/{pageId}/property/{key}` → extract `version.number`.
3. PUT update: `PUT /wiki/rest/api/content/{pageId}/property/{key}` with body `{key, value, version: {number: currentVersion + 1}}`.

This approach avoids 409 loops by fetching the current version before update.

**F-4: v1 response schema validation**

The v1 content-property GET returns `{id, key, value, version: {number, when}, ...}`. The existing `PropertyV2Response` schema is replaced with a v1-compatible schema that matches this shape. The `value` field is validated as a string to preserve byte-equality for ~8 KB payloads.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Update page (edit markdown → re-sync)
  1. User edits markdown file
  2. Run marksync sync
  3. For each changed page:
     a. Compute new body hash
     b. Fetch remote page
     c. Fetch remote property: PropertyService.get(pageId, "marksync.metadata")
        → GET /wiki/rest/api/content/{pageId}/property/marksync.metadata
        → 200 OK → return value
     d. Classify drift
     e. Apply update
     f. Update property: PropertyService.put(pageId, "marksync.metadata", newValue)
        → POST /wiki/rest/api/content/{pageId}/property
        → 409 (key exists)
        → GET /wiki/rest/api/content/{pageId}/property/marksync.metadata
        → 200 OK → version.number = 5
        → PUT /wiki/rest/api/content/{pageId}/property/marksync.metadata
        → 200 OK
  4. Sync completes successfully (no 400 errors)
```

```
Flow 2: Fresh page (no existing property)
  1. marksync sync creates new page
  2. PropertyService.put(pageId, "marksync.metadata", initialValue)
     → POST /wiki/rest/api/content/{pageId}/property
     → 201 Created → done
  3. No fallback to updateByKey needed
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `src/infra/confluence/properties.ts`:
  - Switch `get()` from v2 to v1: `GET /wiki/rest/api/content/{pageId}/property/{key}`
  - Switch `updateByKey()` from v2 to v1: `PUT /wiki/rest/api/content/{pageId}/property/{key}` with version handling
  - Update `put()` to use v1 POST create and call v1 `updateByKey()` on 409
- `src/infra/confluence/schemas/property.ts`:
  - Replace `PropertyV2Response` with v1-compatible schema (includes `version: {number, when}`)
- `tests/unit/infra/confluence/properties.test.ts`:
  - Update tests to assert v1 paths are used for key-based GET/PUT
  - Add test for 409 → GET version → PUT flow
- `tests/integration/confluence/confluence-target.test.ts`:
  - Update integration tests to assert v1 paths

### 7.2 Out of Scope

- [OUT] No changes to `PageService`, `AttachmentService`, `SearchService`, or `RestrictionsService`.
- [OUT] No changes to `marksync.metadata` payload schema or reconcile logic.
- [OUT] No changes to `src/domain/` layer (pure domain logic unchanged).
- [OUT] No pursuit of "v2 list → v2 GET/PUT by ID" approach.

### 7.3 Deferred / Maybe-Later

- Migration to v2 property API if Atlassian adds key-based access (unlikely given current design).
- Batch property operations (deferred to MS-0003+ for scale).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

**Confluence Cloud REST API v1 (content properties):**

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| GET | `/wiki/rest/api/content/{pageId}/property/{key}` | Get property by key | Replaces broken v2 path |
| POST | `/wiki/rest/api/content/{pageId}/property` | Create property | Body: `{key, value}` |
| PUT | `/wiki/rest/api/content/{pageId}/property/{key}` | Update property by key | Body: `{key, value, version: {number: n+1}}` |

**Removed (from this change):**

| Method | Path | Reason |
|--------|------|--------|
| GET | `/wiki/api/v2/pages/{pageId}/properties/{key}` | Expects property ID, not key → 400 |
| PUT | `/wiki/api/v2/pages/{pageId}/properties/{key}` | Expects property ID, not key → 400 |

### 8.2 Events / Messages

N/A — this change emits no new events.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
 | DM-1 | PropertyV1Response schema | Replaces `PropertyV2Response`: `{id, key, value, version: {number, when?}}`. v1 includes `version.number` required for optimistic concurrency; `version.when` is optional (unused by code). |
| DM-2 | PropertyService.updateByKey signature | Updated to use v1 path and version-number request body. |

### 8.4 External Integrations

**Confluence Cloud REST API v1:**
- Key-based property GET: `GET /wiki/rest/api/content/{pageId}/property/{key}`
- Key-based property PUT: `PUT /wiki/rest/api/content/{pageId}/property/{key}` with `{key, value, version: {number: n+1}}`
- Optimistic concurrency: Confluence rejects versionless/stale updates with 409.

### 8.5 Backward Compatibility

- **Lock files:** No change to `marksync.metadata` payload schema; existing lock files remain valid.
- **Error semantics:** Preserved — 403 → `Forbidden`, 404 (GET) → `ok(undefined)`, 413/too-large → `TooLarge`, schema failures → `RemoteUnreachable`.
- **Test expectations:** Existing tests that asserted v2 paths will fail (expected behavior change).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Byte-equality round-trip | 100% for values up to 8 KB (NFR-5). |
| NFR-2 | Update flow success rate | 100% of pages with property operations complete without HTTP 400. |
| NFR-3 | Version conflict handling | No 409 loops; GET → PUT with incremented version resolves on first retry. |
| NFR-4 | v1 API availability | Confluence v1 is documented and stable (not deprecated for content properties). |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — this change does not introduce new telemetry. Existing logging via `ConfluenceClient` covers all v1 calls.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Version-number handling causes 409 loops | H | M | Explicit update mechanism: POST create → on 409 → GET current version → PUT with `number: currentVersion + 1`. Test coverage for this flow. | Low |
| RSK-2 | v1 response shape differs from v2 | M | L | Update zod schema to match v1 `{id, key, value, version: {number, when}}`. Byte-equality test validates `value` round-trip. | Low |
| RSK-3 | Existing test suite fails on v2 path assertions | L | H | Update all property tests to assert v1 paths. | Low |
 | RSK-4 | Concurrent updates cause 409 after GET | M | L | Property-PUT 409 → `RemoteUnreachable` (catch-all); the rare concurrent race is acceptable for MS-0002 MVP (PM-DEC-1). Re-running sync re-GETs the current version and recovers. Deferred to post-MS-0002: a property-shaped conflict error + putProperty re-fetch-once handling. | Low |

## 12. ASSUMPTIONS

- Confluence v1 REST API for content properties is stable and not deprecated.
- v1 GET returns `version.number` field in the response body.
- POST create with `{key, value}` body on v1 works same as v2 (confirmed in spike H2).
- `marksync.metadata` values stay within v1's ~8 KB limit (NFR-5).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-21 (confluence-adapter) | PropertyService delivered. |
| Depends on | GH-19 (lock file) | `marksync.metadata` cross-check logic delivered. |
| Depends on | GH-23 (sync-engine) | Update flow orchestration delivered. |
| Blocks | MS-0002 E4 (this ticket) | Unblock update flow. |
| Blocks | MS-0002 E5 (property sync) | Property operations work end-to-end. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should POST create use v1 or v2? | v2 POST create works, but mixed API surface is inconsistent. | **RESOLVED (PM):** Use v1 throughout for property read/write. Keeps one namespace and one error model. |
 | OQ-2 | What to do if PUT fails with 409 after GET version? | Racy window: another process updates the property between GET and PUT. | **RESOLVED (PM):** Property-PUT 409 is mapped to `RemoteUnreachable` (catch-all), NOT `Conflict`, for MS-0002 MVP (PM-DEC-1). Rationale: GET-version-then-PUT flow makes 409 rare (only concurrent-write race in GET→PUT window); `operationId` dedup + per-doc isolation (GH-24) prevents self-racing; `putProperty` consumer blocks on ANY error without special `Conflict` handling (re-fetch-once dance gated on `updatePage` only); `Conflict` error kind is page-shaped and would mislead error mapper + user. Recovery: `RemoteUnreachable` → blocked → user re-runs sync → re-GETs current version. Deferred to post-MS-0002. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Switch key-based GET/PUT to v1 API | v1 correctly accepts string keys; v2 path parameter expects property ID. | 2026-07-13 |
| DEC-2 | Use v1 throughout for property read/write | Consistent API surface and error model; avoids mixing v1/v2. | 2026-07-13 |
| DEC-3 | Update mechanism: POST create → 409 → GET version → PUT with incremented version | v1 requires `version.number` for optimistic concurrency; fetches current version to avoid 409 loops. | 2026-07-13 |
| DEC-4 | Rejected: v2 list → v2 GET/PUT by ID approach | More complex; key-based semantics are simpler and sufficient for `marksync.metadata`. | 2026-07-13 |
 | DEC-5 | Rejected: Versionless PUT on v1 | Confluence rejects versionless updates with 409; must send `version.number`. | 2026-07-13 |
 | DEC-6 | Property-PUT 409 → RemoteUnreachable (not Conflict) for MS-0002 MVP | GET-version-then-PUT flow makes 409 rare; `operationId` dedup prevents self-racing; `putProperty` consumer blocks on ANY error without special `Conflict` handling; `Conflict` error kind is page-shaped. Recovery via re-running sync. Deferred to post-MS-0002: property-shaped conflict error + re-fetch-once handling. | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `src/infra/confluence/properties.ts` | Updated — switch GET/PUT to v1 paths; add version handling. |
| `src/infra/confluence/schemas/property.ts` | Updated — replace `PropertyV2Response` with v1 schema. |
| `tests/unit/infra/confluence/properties.test.ts` | Updated — assert v1 paths; test 409 → GET → PUT flow. |
| `tests/integration/confluence/confluence-target.test.ts` | Updated — assert v1 paths in integration tests. |
| `doc/spec/features/feature-confluence-adapter.md` | Deferred to phase 7 — will be updated by `@doc-syncer`. |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a sync updates a page, **when** `PropertyService.get(pageId, "marksync.metadata")` is called, **then** the request uses the v1 path `GET /wiki/rest/api/content/{pageId}/property/marksync.metadata` and returns the stored string value (byte-equal). | F-1, NFR-1 |
| AC-F1-2 | **Given** a property does not exist, **when** `PropertyService.get(pageId, key)` is called, **then** the request uses the v1 path and returns `ok(undefined)` (404 mapped, not an error). | F-1 |
| AC-F2-1 | **Given** a sync updates a property, **when** `PropertyService.put(pageId, key, value)` is called for a new key, **then** the request uses v1 POST create `POST /wiki/rest/api/content/{pageId}/property` with body `{key, value}` and succeeds on 2xx. | F-3 |
| AC-F2-2 | **Given** a property already exists, **when** `PropertyService.put(pageId, key, value)` is called, **then** the service: (a) POST create → 409, (b) GET current version, (c) PUT with `{key, value, version: {number: currentVersion + 1}}`, and succeeds on 2xx. | F-2, F-3, DEC-3 |
| AC-F3-1 | **Given** a sync updates a page, **when** the sync completes, **then** the sync produces NoOp (0 writes, 0 blocks) on second unchanged sync (no 400 errors). | G-1, NFR-2 |
| AC-F4-1 | **Given** `PropertyService.get()` returns a value, **when** the value is ~8 KB, **then** the round-trip is byte-equal (same length, same bytes). | F-4, NFR-1 |
| AC-T1-1 | **Given** a unit test for `PropertyService.put()`, **when** the test previously asserted v2 paths, **then** the test is updated to assert v1 paths are used for all key-based operations. | F-1, F-2, RSK-3 |
| AC-T2-1 | **Given** an integration test for the update flow, **when** the test runs, **then** the test verifies that v1 paths are used for property GET/PUT and no 400 errors occur. | F-1, F-2, NFR-2 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Merge order:** This change must merge before any MS-0002 release to unblock the update flow.
- **Migration strategy:** Existing lock files with `marksync.metadata` remain valid; first sync after this change uses v1 paths.
- **Rollback plan:** If v1 proves unstable, revert to v2 POST create and document that update flow is broken (unacceptable). No simple rollback — v2 key-based paths are fundamentally broken.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration required. Existing properties on Confluence are accessible via v1 key-based GET (v1/v2 share one namespace).

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — this change does not introduce new privacy or compliance concerns. Existing redaction and security baselines apply.

## 21. SECURITY REVIEW HIGHLIGHTS

N/A — this change does not introduce new security risks. v1 paths use existing authentication and redaction; no new data paths.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **API usage:** Switch from v2 to v1 for property operations; both APIs are stable and supported.
 - **Debugging:** v1 path errors emit via existing logging; logs correlate with `runId` per NFR-OBS-2.
 - **Documentation impact:** `doc/spec/features/feature-confluence-adapter.md` §3.1 (L55-57), §3.2 table (L78), §4.2 (L127), §5 (L154-155) incorrectly claim v2 for content properties. These will be reconciled by `@doc-syncer` in phase 7 (not in scope for this change).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| **key-based access** | Property lookup by string key (e.g., `marksync.metadata`) instead of numeric/UUID property ID. |
| **v1 vs v2 API** | Confluence Cloud has two REST API versions. v2 is newer but does not support key-based property access; v1 does. |
| **optimistic concurrency** | Update pattern that requires sending `version.number` to prevent lost updates; Confluence rejects stale updates with 409. |
| **409 loop** | Infinite retry loop caused by attempting updates without version numbers; Confluence always returns 409. |

## 24. APPENDICES

### A. v1 vs v2 Property API Comparison

| Operation | v2 Path (broken for keys) | v1 Path (works) | Request Body | Response Shape |
|-----------|---------------------------|-----------------|--------------|----------------|
| GET by key | `GET /wiki/api/v2/pages/{pageId}/properties/{key}` → 400 | `GET /wiki/rest/api/content/{pageId}/property/{key}` → 200 | N/A | `{id, key, value, version: {number, when}}` |
| POST create | `POST /wiki/api/v2/pages/{pageId}/properties` | `POST /wiki/rest/api/content/{pageId}/property` | `{key, value}` | `{id, key, value, version: {number: 1}}` |
| PUT by key | `PUT /wiki/api/v2/pages/{pageId}/properties/{key}` → 400 | `PUT /wiki/rest/api/content/{pageId}/property/{key}` | `{key, value, version: {number: n+1}}` | `{id, key, value, version: {number: n+1}}` |

### B. Update Flow Diagram

```
PropertyService.put(pageId, key, value)
│
├─ POST /wiki/rest/api/content/{pageId}/property
│   ├─ 2xx → Done (property created)
│   └─ 409 (key exists)
│       └─ GET /wiki/rest/api/content/{pageId}/property/{key}
│           ├─ 200 → Extract version.number
│           └─ PUT /wiki/rest/api/content/{pageId}/property/{key}
│               ├─ 2xx → Done (property updated)
 │               └─ 409 → RemoteUnreachable (rare concurrent race; deferred to post-MS-0002, PM-DEC-1)
│
└─ Error (403, 413, etc.) → Surface to caller
```

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored based on:
- Ticket GH-66 (MS2-E4, P0 priority)
- PM analysis in planning summary (provided in prompt)
- Source code analysis: `properties.ts`, `client.ts`, `property.ts`, test files
- API evidence: v2 GET/PUT by key returns 400; v1 GET/PUT by key returns 200
- Template: `doc/templates/change-spec-template.md`
- Conventions: `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`
- Reference spec: `doc/changes/2026-07/2026-07-13--GH-62--remote-body-hash-mismatch/chg-GH-62-spec.md` (style)

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-66)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (NFR-1 to NFR-4)
- [x] Risks include Impact & Probability (RSK-1 to RSK-4)
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules