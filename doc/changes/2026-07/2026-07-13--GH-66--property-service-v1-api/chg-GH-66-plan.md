---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-66-property-service-v1-api
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, p0, ms-0002, mvp, property-service, v1-api, confluence-adapter]
links:
  change_spec: ./chg-GH-66-spec.md
summary: >
  Fix PropertyService to use v1 API for key-based property access, eliminating 400 errors and restoring the update flow. The root cause is that PropertyService uses the v2 API path `/pages/{id}/properties/{key}` for key-based GET and PUT operations, but the v2 path parameter expects a property ID (UUID/numeric), not a string key. The fix switches key-based GET and PUT operations to the v1 API, which correctly handles key-based access (`/content/{id}/property/{key}`). The update mechanism is enhanced to handle v1's optimistic concurrency requirement: when a 409 conflict occurs on POST create, the service GETs the current version number and PUTs with `{value, version: {number: currentVersion + 1}}`.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-66: PropertyService uses v1 API for key-based access — returns 400 (P0)

## Context and Goals

This plan fixes a P0 bug where the MarkSync update flow fails with HTTP 400 on every page that needs updating. The root cause is that `PropertyService` uses the v2 API path `/pages/{id}/properties/{key}` for key-based GET and PUT operations, but the v2 path parameter expects a property ID (UUID/numeric), not a string key. The fix switches key-based GET and PUT operations to the v1 API, which correctly handles key-based access (`/content/{id}/property/{key}`). The update mechanism is enhanced to handle v1's optimistic concurrency requirement: when a 409 conflict occurs on POST create, the service GETs the current version number and PUTs with `{value, version: {number: currentVersion + 1}}`.

**Open questions**: None (all resolved in spec §14 — OQ-1: Use v1 throughout; OQ-2: Surface 409 as Conflict to caller).

## Scope

### In Scope

- `src/infra/confluence/schemas/property.ts`: Replace `PropertyV2Response` with `PropertyV1Response` schema matching v1 shape `{id, key, value, version: {number, when}}` (F-4, DM-1, AC-F4-1)
- `src/infra/confluence/properties.ts`:
  - Switch `get()` from v2 to v1: `GET /wiki/rest/api/content/{pageId}/property/{key}` (F-1, AC-F1-1, AC-F1-2)
  - Switch `updateByKey()` from v2 to v1: `PUT /wiki/rest/api/content/{pageId}/property/{key}` with version handling (F-2, AC-F2-2)
  - Update `put()` to use v1 POST create and call v1 `updateByKey()` on 409 (F-3, AC-F2-1, AC-F2-2)
  - Preserve error semantics: 403→Forbidden, 404(GET)→ok(undefined), 413→TooLarge, schema-fail→RemoteUnreachable (G-3)
- `tests/unit/infra/confluence/properties.test.ts`:
  - Generalize `script()` helper to strip `/wiki/rest/api` prefix (not just `/wiki/api/v2`) (TC-PROP-V1-PATH-001/002/003)
  - Update all path assertions to use v1 paths (TC-PROP-V1-PATH-001/002/003, AC-T1-1)
  - Add test for 409 → GET version → PUT flow (TC-PROP-V1-VERSION-001, AC-F2-2)
  - Add test for large value version-number flow (TC-PROP-V1-VERSION-002, AC-F4-1)
  - Ensure byte-equality tests pass with v1 paths (TC-PROP-V1-GET-002, TC-PROP-V1-BYTE-001, AC-F4-1, NFR-1)
  - Add missing-key test with v1 path (TC-PROP-V1-GET-003, AC-F1-2)
  - Add error tests: 403→Forbidden, 413→TooLarge, schema-fail→RemoteUnreachable (TC-PROP-V1-ERR-001/002, TC-PROP-V1-SCHEMA-001, G-3)
- `tests/integration/confluence/confluence-target.test.ts`:
  - Update `TC-INT-PROP-RT` block to assert v1 paths (TC-INT-PROP-V1-001, AC-T2-1)
  - Add integration test for version-number flow (TC-INT-PROP-V1-002, AC-T2-1, NFR-2)

### Out of Scope

- Changes to `PageService`, `AttachmentService`, `SearchService`, or `RestrictionsService` (NG-1 from spec)
- Changes to `marksync.metadata` payload schema or reconcile logic (NG-2 from spec)
- Changes to `src/domain/` layer (pure domain logic unchanged, NG-2 from spec)
- Pursuit of "v2 list → v2 GET/PUT by ID" approach (rejected in DEC-4 from spec)

### Constraints

- Backward compatibility: Existing properties on Confluence are accessible via v1 key-based GET (v1/v2 share one namespace)
- Performance: POST create → 409 → GET → PUT is acceptable for MS-0002 scale (one extra GET on update)
- Concurrency: 409 after GET is rare (racy window) — acceptable to surface as Conflict to caller (OQ-2 resolved)

### Risks

- **RSK-1**: Version-number handling causes 409 loops. Mitigated by: Explicit update mechanism (POST create → on 409 → GET current version → PUT with `number: currentVersion + 1`). Test coverage for this flow (TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002). Residual: Low.
- **RSK-2**: v1 response shape differs from v2. Mitigated by: Update zod schema to match v1 `{id, key, value, version: {number, when}}`. Byte-equality test validates `value` round-trip (TC-PROP-V1-BYTE-001). Residual: Low.
- **RSK-3**: Existing test suite fails on v2 path assertions. Mitigated by: Update all property tests to assert v1 paths (TC-PROP-V1-PATH-001/002/003, TC-INT-PROP-V1-001/002). Residual: Low.
- **RSK-4**: Concurrent updates cause 409 after GET. Mitigated by: Surface 409 as Conflict to caller (same as page 409). Acceptable for MS-0002 MVP (OQ-2 resolved). Residual: Low.
- **RSK-5**: `script()` helper only strips `/wiki/api/v2` prefix. Mitigated by: Update helper to strip both `/wiki/api/v2` and `/wiki/rest/api` prefixes. Residual: Low.

### Success Metrics

- Update flow success rate: 100% of pages with property operations complete without HTTP 400 (NFR-2, AC-F3-1, G-1)
- Property GET round-trip accuracy: 100% byte-equal including ~8 KB values (NFR-1, AC-F4-1)
- Version conflict handling: No 409 loops; GET → PUT with incremented version resolves on first retry (NFR-3, TC-PROP-V1-VERSION-001/002)
- Error mapping consistency: All v1 status codes map to existing error types (G-3, TC-PROP-V1-ERR-001/002, TC-PROP-V1-SCHEMA-001)

## Phases

### Phase 1: Schema — Replace PropertyV2Response with v1-compatible schema

**Goal**: Replace the v2 schema with a v1-compatible schema that matches the `{id, key, value, version: {number, when}}` shape required for optimistic concurrency.

**Tasks**:

- [ ] **1.1** Replace `PropertyV2Response` with `PropertyV1Response` in `src/infra/confluence/schemas/property.ts`:
  - Schema shape: `{id, key, value, version: {number, when}}`
  - Update comment from "v2 content-property API" to "v1 content-property API"
  - Export `PropertyV1Response` type (F-4, DM-1, AC-F4-1)
- [ ] **1.2** Update import in `src/infra/confluence/properties.ts` line 9 from `PropertyV2Response` to `PropertyV1Response`
- [ ] **1.3** Update line 40 in `properties.ts` to use `PropertyV1Response.safeParse(response.value.json)` and line 44 error message to "schema validation failed: PropertyV1Response"
- [ ] **1.4** Update file comment in `properties.ts` lines 1-3 from "v2 content-property surface" to "v1 content-property surface"

**Acceptance Criteria**:

- Must: `PropertyV1Response` schema exists in `src/infra/confluence/schemas/property.ts` with correct shape `{id, key, value, version: {number, when}}`
- Must: `properties.ts` imports and uses `PropertyV1Response`
- Must: Schema validation error message updated to reference `PropertyV1Response`
- Should: No TypeScript compilation errors

**Affected code areas**:

- `src/infra/confluence/schemas/property.ts` (updated — schema renamed/reshaped)
- `src/infra/confluence/properties.ts` (updated — import and usage updated)

**System docs to update**:

- None (schema change only, no system docs affected)

**Tests**:

- Typecheck: `bun run typecheck`
- (Note: Full test suite will pass after Phase 3, this phase only ensures schema compiles)

**Completion signal**: `refactor(confluence): GH-66 v1 property response schema`

---

### Phase 2: Core fix — Switch PropertyService to v1 key-based API with version handling

**Goal**: Rewrite `properties.ts` to use v1 paths for GET and PUT operations, implement the POST create → 409 → GET version → PUT with incremented version flow, and preserve existing error semantics.

**Tasks**:

- [ ] **2.1** Rewrite `get()` in `properties.ts` (lines 16-54):
  - Change line 22 from `this.client.v2(\`/pages/${pageId}/properties/${encodeURIComponent(key)}\`)` to `this.client.v1(\`/content/${pageId}/property/${encodeURIComponent(key)}\`)`
  - Preserve existing error mappings (404→ok(undefined), 403→Forbidden, other non-2xx→RemoteUnreachable)
  - Update `unreachableCause` messages to reference v1 (line 37: "property get") (F-1, AC-F1-1, AC-F1-2)
- [ ] **2.2** Rewrite `put()` in `properties.ts` (lines 56-94):
  - Change line 65 from `this.client.v2(\`/pages/${pageId}/properties\`)` to `this.client.v1(\`/content/${pageId}/property\`)` (F-3, AC-F2-1)
  - Change line 63 comment from "POST creates; a 409 (key exists, v1+v2 share one namespace) falls back to PUT-by-key" to "POST creates; a 409 (key exists) falls back to GET version → PUT with incremented version"
  - Change line 73 `return this.updateByKey(pageId, key, value);` to: GET current version via v1, then PUT with `{key, value, version: {number: currentVersion + 1}}` (F-2, F-3, AC-F2-2, DEC-3)
  - Preserve error mappings (403→Forbidden, 413→TooLarge, schema-fail→RemoteUnreachable) (G-3)
- [ ] **2.3** Rewrite `updateByKey()` in `properties.ts` (lines 96-122):
  - Change line 103 from `this.client.v2(\`/pages/${pageId}/properties/${encodeURIComponent(key)}\`)` to `this.client.v1(\`/content/${pageId}/property/${encodeURIComponent(key)}\`)`
  - Change line 104 body from `{json: {key, value}}` to `{json: {key, value, version: {number: currentVersion + 1}}}` (version number passed in from put())
  - Change signature to accept `currentVersion: number` parameter (extracted from GET response in put())
  - Update `unreachableCause` messages to reference v1 (line 120: "property update") (F-2, AC-F2-2)

**Acceptance Criteria**:

- Must: `get()` uses v1 path `GET /wiki/rest/api/content/{pageId}/property/{key}`
- Must: `put()` uses v1 POST create path `POST /wiki/rest/api/content/{pageId}/property`
- Must: `put()` on 409 GETs current version and PUTs with incremented version number
- Must: `updateByKey()` uses v1 path `PUT /wiki/rest/api/content/{pageId}/property/{key}` with `{key, value, version: {number: n+1}}`
- Must: Error semantics preserved: 403→Forbidden, 404(GET)→ok(undefined), 413→TooLarge, schema-fail→RemoteUnreachable
- Should: No TypeScript compilation errors

**Affected code areas**:

- `src/infra/confluence/properties.ts` (updated — all three methods: get(), put(), updateByKey())

**System docs to update**:

- None (implementation change only, system docs reconciled in phase 7)

**Tests**:

- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- (Note: Unit tests will fail until Phase 3 updates path assertions)

**Completion signal**: `fix(confluence): GH-66 switch PropertyService to v1 key-based API`

---

### Phase 3: Tests — Update unit and integration tests for v1 paths and version-number flow

**Goal**: Update all property tests to assert v1 paths, generalize the `script()` helper to strip both v2 and v1 prefixes, add version-number flow tests, and ensure byte-equality and error tests pass.

**Tasks**:

- [ ] **3.1** Generalize `script()` helper in `tests/unit/infra/confluence/properties.test.ts` (line 41):
  - Change from `const path = parsed.pathname.replace(/^\/wiki\/api\/v2/, "");` to `const path = parsed.pathname.replace(/^\/wiki\/(api\/v2|rest\/api)/, "");` (strips both `/wiki/api/v2` and `/wiki/rest/api`) (TC-PROP-V1-PATH-001/002/003)
- [ ] **3.2** Update unit test fixtures in `properties.test.ts` to use v1 response shapes:
  - Change all `{key: KEY, value}` fixtures to `{id: "123", key: KEY, value, version: {number: 1, when: "2026-07-13T00:00:00.000Z"}}` (TC-PROP-V1-GET-001/002/003, TC-PROP-V1-POST-001)
  - Update handler responses to return v1 shapes with `version: {number, when}` (TC-PROP-V1-GET-001/002/003, TC-PROP-V1-POST-001)
- [ ] **3.3** Add version-number flow test (TC-PROP-V1-VERSION-001):
  - Test POST create → 409 → GET version → PUT with incremented version
  - Verify exact request sequence: POST → GET → PUT
  - Verify PUT body contains `version: {number: currentVersion + 1}`
  - Verify all paths are v1 paths (AC-F2-2, F-2, F-3, DEC-3, NFR-3)
- [ ] **3.4** Add large value version-number flow test (TC-PROP-V1-VERSION-002):
  - Test version-number flow with 8 KB value
  - Verify byte-equality and version increment (AC-F2-2, AC-F4-1, NFR-1)
- [ ] **3.5** Update existing byte-equality tests (TC-PROP-RT-001 → TC-PROP-V1-BYTE-001):
  - Update test names to reference v1
  - Ensure assertions pass with v1 paths (AC-F4-1, NFR-1)
- [ ] **3.6** Update missing-key test (TC-PROP-MISS-001 → TC-PROP-V1-GET-003):
  - Update test name to reference v1
  - Verify 404 → ok(undefined) with v1 path (AC-F1-2)
- [ ] **3.7** Update conflict test (TC-PROP-CONFLICT-001 → integrated into TC-PROP-V1-VERSION-001):
  - Remove or refactor existing 409 → PUT test into new version-number flow test
- [ ] **3.8** Add error tests:
  - Add TC-PROP-V1-ERR-001: 403 → Forbidden (G-3)
  - Add TC-PROP-V1-ERR-002: 413 → TooLarge (G-3)
  - Add TC-PROP-V1-SCHEMA-001: Schema validation failure → RemoteUnreachable (F-4, DM-1)
- [ ] **3.9** Update integration tests in `tests/integration/confluence/confluence-target.test.ts`:
  - Update existing `TC-INT-PROP-RT` block to assert v1 paths:
    - GET: `/wiki/rest/api/content/{pageId}/property/{key}` (TC-INT-PROP-V1-001)
    - POST: `/wiki/rest/api/content/{pageId}/property` (TC-INT-PROP-V1-001)
    - PUT: `/wiki/rest/api/content/{pageId}/property/{key}` (TC-INT-PROP-V1-001)
  - Add TC-INT-PROP-V1-002: Integration test for version-number flow with 409 → GET → PUT (AC-T2-1, NFR-2)
  - Verify no 400 status codes in captured requests (original bug fixed) (AC-T2-1, NFR-2)

**Acceptance Criteria**:

- Must: `script()` helper strips both `/wiki/api/v2` and `/wiki/rest/api` prefixes
- Must: All unit test fixtures use v1 response shapes `{id, key, value, version: {number, when}}`
- Must: Version-number flow test (TC-PROP-V1-VERSION-001) passes with exact request sequence POST → GET → PUT
- Must: Large value version-number flow test (TC-PROP-V1-VERSION-002) passes with byte-equality
- Must: Byte-equality tests pass with v1 paths
- Must: Missing-key test passes with v1 path
- Must: Error tests pass: 403→Forbidden, 413→TooLarge, schema-fail→RemoteUnreachable
- Must: Integration tests assert v1 paths and pass
- Must: No 400 status codes in integration test captured requests
- Should: Test coverage aligns with TC-AC mappings in test plan

**Affected code areas**:

- `tests/unit/infra/confluence/properties.test.ts` (updated — script() helper, all fixtures, new tests)
- `tests/integration/confluence/confluence-target.test.ts` (updated — v1 path assertions, new test)

**System docs to update**:

- None (test updates only, system docs reconciled in phase 7)

**Tests**:

- Run unit tests: `bun test tests/unit/infra/confluence/properties.test.ts`
- Run integration tests: `bun test tests/integration/confluence/confluence-target.test.ts`
- Run all tests: `bun test`

**Completion signal**: `test(confluence): GH-66 v1 property paths + version-number flow`

---

### Phase 4: Verification — Quality gates

**Goal**: Run full quality gate suite to ensure no regressions and all tests pass.

**Tasks**:

- [ ] **4.1** Run typecheck: `bun run typecheck`
- [ ] **4.2** Run lint: `bun run lint`
- [ ] **4.3** Run all tests: `bun test`
- [ ] **4.4** Verify all new unit tests pass (TC-PROP-V1-GET-001, TC-PROP-V1-GET-002, TC-PROP-V1-GET-003, TC-PROP-V1-POST-001, TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002, TC-PROP-V1-BYTE-001, TC-PROP-V1-PATH-001, TC-PROP-V1-PATH-002, TC-PROP-V1-PATH-003, TC-PROP-V1-ERR-001, TC-PROP-V1-ERR-002, TC-PROP-V1-SCHEMA-001)
- [ ] **4.5** Verify all new integration tests pass (TC-INT-PROP-V1-001, TC-INT-PROP-V1-002)
- [ ] **4.6** Verify no regressions in existing test suites
- [ ] **4.7** Verify all acceptance criteria from spec verified (AC-F1-1, AC-F1-2, AC-F2-1, AC-F2-2, AC-F3-1, AC-F4-1, AC-T1-1, AC-T2-1)

**Acceptance Criteria**:

- Must: Typecheck passes with no errors
- Must: Lint passes with no errors
- Must: All tests pass (unit + integration)
- Must: No regressions in existing test suites
- Must: All acceptance criteria from spec verified
- Should: No 400 errors in update flow (NFR-2, AC-F3-1)

**Affected code areas**:

- None (verification phase)

**System docs to update**:

- None (verification phase)

**Tests**:

- Full test suite: `bun test`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- Boundaries check: `bun run check:boundaries`

**Completion signal**: `fix(GH-66): verification complete — all quality gates passing`

---

### Phase 5: Finalize and Release

**Goal**: Prepare change for review and merge, including spec reconciliation if needed.

**Tasks**:

- [ ] **5.1** Review implementation against spec and test plan — ensure all AC covered
- [ ] **5.2** Reconcile `doc/spec/features/feature-confluence-adapter.md` §3.1 (L55-57), §3.2 table (L78), §4.2 (L127) — these incorrectly claim v2 for content properties. Update to state that key-based property access uses v1 API (handled in lifecycle phase 7 `system_spec_update` via `@doc-syncer`, but noted here for awareness)
- [ ] **5.3** Version bump per repo conventions (patch version for bug fix)
- [ ] **5.4** Final commit with all changes staged

**Acceptance Criteria**:

- Must: All implementation tasks complete and verified
- Must: All tests passing
- Must: Spec and docs reconciled if needed
- Should: No unresolved open questions

**Affected code areas**:

- `package.json` (version bump — patch)
- `doc/spec/features/feature-confluence-adapter.md` (if reconciliation needed per PM notes)

**System docs to update**:

- `doc/spec/features/feature-confluence-adapter.md` §3.1 (L55-57), §3.2 table (L78), §4.2 (L127) — update to state v1 for key-based property access

**Tests**:

- Final test run: `bun test`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`

**Completion signal**: `fix(GH-66): finalize and release — spec reconciled, version bumped`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC |
|-------|----------|--------|----|
| TC-PROP-V1-GET-001 | v1 GET returns stored value (small string) | 3, 4 | AC-F1-1, AC-T1-1 |
| TC-PROP-V1-GET-002 | v1 GET returns stored value (~8 KB) | 3, 4 | AC-F1-1, AC-F4-1 |
| TC-PROP-V1-GET-003 | v1 GET missing key → ok(undefined) | 3, 4 | AC-F1-2, AC-T1-1 |
| TC-PROP-V1-POST-001 | v1 POST create for new key → 2xx | 3, 4 | AC-F2-1, AC-T1-1 |
| TC-PROP-V1-VERSION-001 | v1 POST 409 → GET version → PUT with incremented version (happy path) | 3, 4 | AC-F2-2, AC-T1-1 |
| TC-PROP-V1-VERSION-002 | v1 POST 409 → GET version → PUT with incremented version (large value) | 3, 4 | AC-F2-2, AC-F4-1 |
| TC-PROP-V1-BYTE-001 | Byte-equality round-trip for ~8 KB value | 3, 4 | AC-F4-1 |
| TC-PROP-V1-PATH-001 | Unit test asserts v1 GET path | 3, 4 | AC-T1-1 |
| TC-PROP-V1-PATH-002 | Unit test asserts v1 POST create path | 3, 4 | AC-T1-1 |
| TC-PROP-V1-PATH-003 | Unit test asserts v1 PUT update path | 3, 4 | AC-T1-1 |
| TC-PROP-V1-ERR-001 | v1 GET 403 → Forbidden | 3, 4 | AC-F1-1, G-3 |
| TC-PROP-V1-ERR-002 | v1 GET 413 → TooLarge | 3, 4 | AC-F1-1, G-3 |
| TC-PROP-V1-SCHEMA-001 | v1 response schema validation failure → RemoteUnreachable | 3, 4 | F-4, DM-1, G-3 |
| TC-INT-PROP-V1-001 | Integration test verifies v1 GET/POST/PUT paths | 3, 4 | AC-T2-1 |
| TC-INT-PROP-V1-002 | Integration test verifies no 400 errors in update flow | 3, 4 | AC-T2-1, AC-F2-2, NFR-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-66-spec.md | Spec |
| Test plan | ./chg-GH-66-test-plan.md | Test Plan |
| Implementation plan | ./chg-GH-66-plan.md | Plan |
| Source: PropertyService | src/infra/confluence/properties.ts | Code (updated) |
| Source: Property schema | src/infra/confluence/schemas/property.ts | Code (updated) |
| Tests: PropertyService | tests/unit/infra/confluence/properties.test.ts | Test (updated) |
| Tests: ConfluenceTarget | tests/integration/confluence/confluence-target.test.ts | Test (updated) |
| System docs: feature-confluence-adapter.md | doc/spec/features/feature-confluence-adapter.md | Doc (updated in phase 7) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | plan-writer | Initial plan for GH-66 |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| (Populated during execution) | | | | | |