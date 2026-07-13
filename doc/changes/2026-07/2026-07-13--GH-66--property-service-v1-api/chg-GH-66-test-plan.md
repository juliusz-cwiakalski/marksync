---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-66-test-plan
status: Proposed
created: 2026-07-13
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, p0, ms-0002, mvp, property-service, v1-api, confluence-adapter]
version_impact: patch
summary: "Fix PropertyService to use v1 API for key-based property access, eliminating 400 errors and restoring the update flow."
links:
  change_spec: ./chg-GH-66-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - PropertyService uses v1 API for key-based access — returns 400 (P0)

## 1. Scope and Objectives

This test plan validates the P0 fix for PropertyService to use Confluence Cloud REST API v1 for key-based property access. The fix switches GET and PUT operations from the broken v2 path (which expects property IDs, not keys) to v1 paths that correctly handle string keys. The plan ensures: (1) the update flow works without HTTP 400 errors, (2) the v1 optimistic concurrency mechanism works correctly (POST 409 → GET version → PUT with incremented version), (3) byte-equality round-trip for ~8 KB values is preserved, (4) error semantics (403, 404, 413, schema failures) remain consistent, and (5) no regression in create-or-update behavior.

### 1.1 In Scope

- PropertyService unit tests updated to assert v1 paths (`GET /wiki/rest/api/content/{pageId}/property/{key}`, `POST /wiki/rest/api/content/{pageId}/property`, `PUT /wiki/rest/api/content/{pageId}/property/{key}`)
- v1 GET with existing key returns byte-equal value (AC-F1-1)
- v1 GET with missing key returns `ok(undefined)` (AC-F1-2)
- v1 POST create for new key succeeds (AC-F2-1)
- v1 POST 409 → GET version → PUT with incremented version succeeds (AC-F2-2, critical path)
- v1 response schema validation (`{id, key, value, version: {number, when}}`)
- Error semantics: 403 → `Forbidden`, 413 → `TooLarge`, schema failure → `RemoteUnreachable`
- Byte-equality round-trip for ~8 KB values (AC-F4-1, NFR-1)
- Integration tests verify v1 paths and no 400 errors (AC-T2-1)

### 1.2 Out of Scope & Known Gaps

- PageService, AttachmentService, SearchService, RestrictionsService tests (no changes to these modules, NG-1)
- `marksync.metadata` payload schema or reconcile logic (no changes, NG-2)
- v2 list → v2 GET/PUT by ID approach (rejected in DEC-4)
- E2E live-sandbox tests (credentials not available; handled separately)
- Batch property operations (deferred to MS-0003+)

## 2. References

- Change specification: `chg-GH-66-spec.md`
- Testing strategy: `.ai/rules/testing-strategy.md` (6-tier model)
- DEC-1: Switch key-based GET/PUT to v1 API
- DEC-2: Use v1 throughout for property read/write
- DEC-3: Update mechanism: POST create → 409 → GET version → PUT with incremented version
- DEC-4: Rejected: v2 list → v2 GET/PUT by ID approach
- DEC-5: Rejected: Versionless PUT on v1
- Confluence Cloud REST API v1 documentation (implicit via spec Appendix A)
- Existing tests: `tests/unit/infra/confluence/properties.test.ts`, `tests/integration/confluence/confluence-target.test.ts`, `tests/_helpers/fake-target.ts`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | v1 GET returns byte-equal stored value | TC-PROP-V1-GET-001, TC-PROP-V1-GET-002 | Covered |
| AC-F1-2 | v1 GET missing key → ok(undefined) | TC-PROP-V1-GET-003 | Covered |
| AC-F2-1 | v1 POST create for new key → 2xx | TC-PROP-V1-POST-001 | Covered |
| AC-F2-2 | v1 POST 409 → GET version → PUT with incremented version → 2xx | TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002 | Covered |
| AC-F3-1 | Idempotent sync produces NoOp (no 400 errors) | Covered by the absence of property writes on NoOp (put/get are only invoked by the Update/Create arms, which a NoOp never reaches) | Covered (structural) |
| AC-F4-1 | Byte-equality round-trip for ~8 KB values | TC-PROP-V1-BYTE-001 | Covered |
| AC-T1-1 | Unit tests updated to assert v1 paths | TC-PROP-V1-PATH-001 through TC-PROP-V1-PATH-003 | Covered |
| AC-T2-1 | Integration tests verify v1 paths and no 400 errors | TC-INT-PROP-V1-001, TC-INT-PROP-V1-002 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| ID | Element | TC ID(s) | Status |
|----|---------|----------|--------|
| DM-1 | PropertyV1Response schema ({id, key, value, version: {number, when}}) | TC-PROP-V1-SCHEMA-001 | Covered |
| API-1 | v1 GET: GET /wiki/rest/api/content/{pageId}/property/{key} | TC-PROP-V1-GET-001, TC-PROP-V1-GET-002, TC-PROP-V1-GET-003, TC-PROP-V1-PATH-001 | Covered |
| API-2 | v1 POST create: POST /wiki/rest/api/content/{pageId}/property | TC-PROP-V1-POST-001, TC-PROP-V1-PATH-002, TC-PROP-V1-VERSION-001 | Covered |
| API-3 | v1 PUT update: PUT /wiki/rest/api/content/{pageId}/property/{key} | TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002, TC-PROP-V1-PATH-003 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Byte-equality round-trip (100% for values up to 8 KB) | TC-PROP-V1-BYTE-001 | Covered |
| NFR-2 | Update flow success rate (100% no HTTP 400) | TC-PROP-V1-GET-001, TC-PROP-V1-GET-002, TC-PROP-V1-POST-001, TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002 | Covered |
| NFR-3 | Version conflict handling (no 409 loops) | TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002 | Covered |
| NFR-4 | v1 API availability (Confluence v1 stable) | Not directly testable; assumption from spec §23 | N/A |

## 4. Test Types and Layers

- **Unit tests (Tier 2):** `bun:test`, `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`. Scripted fetch mock via `script()` helper, asserts exact request methods, paths, and bodies. Primary coverage for v1 path assertions, version-number flow, byte-equality, error semantics.

- **Integration tests (Tier 3):** `bun:test` + `Bun.serve()` mock, `src/infra/confluence/target.ts` → `tests/integration/confluence/confluence-target.test.ts`. Real HTTP mock server, validates v1 paths over actual HTTP transport, proves no 400 errors in update flow. Updates existing `TC-INT-PROP-RT` block to assert v1 paths.

- **Golden fixture tests:** Not applicable for this change (no rendering changes).

- **E2E tests:** Not in scope for this change (credentials not available; live-sandbox runs separately via `.github/workflows/run-e2e.yml`).

- **Non-functional:** Byte-equality validated through unit test (TC-PROP-V1-BYTE-001). No separate performance test suite (deferred to MS-0003+).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-PROP-V1-GET-001 | v1 GET returns stored value (small string) | Happy Path | Critical | High | AC-F1-1, AC-T1-1 |
| TC-PROP-V1-GET-002 | v1 GET returns stored value (~8 KB) | Happy Path | Critical | High | AC-F1-1, AC-F4-1 |
| TC-PROP-V1-GET-003 | v1 GET missing key → ok(undefined) | Negative | Critical | High | AC-F1-2, AC-T1-1 |
| TC-PROP-V1-POST-001 | v1 POST create for new key → 2xx | Happy Path | Critical | High | AC-F2-1, AC-T1-1 |
| TC-PROP-V1-VERSION-001 | v1 POST 409 → GET version → PUT with incremented version (happy path) | Happy Path | Critical | High | AC-F2-2, AC-T1-1 |
| TC-PROP-V1-VERSION-002 | v1 POST 409 → GET version → PUT with incremented version (large value) | Happy Path | Important | High | AC-F2-2, AC-F4-1 |
| TC-PROP-V1-BYTE-001 | Byte-equality round-trip for ~8 KB value | Happy Path | Critical | High | AC-F4-1 |
| TC-PROP-V1-PATH-001 | Unit test asserts v1 GET path | Regression | Critical | High | AC-T1-1 |
| TC-PROP-V1-PATH-002 | Unit test asserts v1 POST create path | Regression | Critical | High | AC-T1-1 |
| TC-PROP-V1-PATH-003 | Unit test asserts v1 PUT update path | Regression | Critical | High | AC-T1-1 |
| TC-PROP-V1-ERR-001 | v1 GET 403 → Forbidden | Negative | Important | High | AC-F1-1 |
| TC-PROP-V1-ERR-002 | put POST 413 → TooLarge | Negative | Important | High | AC-F1-1 |
| TC-PROP-V1-SCHEMA-001 | v1 response schema validation failure → RemoteUnreachable | Negative | Important | High | F-4, DM-1 |
| TC-INT-PROP-V1-001 | Integration test verifies v1 GET/POST/PUT paths | Happy Path | Critical | High | AC-T2-1 |
| TC-INT-PROP-V1-002 | Integration test verifies no 400 errors in update flow | Happy Path | Critical | High | AC-T2-1, AC-F2-2 |

### 5.2 Scenario Details

#### TC-PROP-V1-GET-001 - v1 GET returns stored value (small string)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, AC-T1-1, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns 200 with `{id, key, value, version: {number, when}}`

**Steps**:

1. Call `service.get(PAGE, KEY)` with a small value (e.g., "hello-world")
2. Scripted fetch mock returns 200 with v1 response: `{id: "123", key: "marksync.metadata", value: "hello-world", version: {number: 1, when: "2026-07-13T00:00:00.000Z"}}`
3. Verify result.ok = true
4. Verify result.value = "hello-world" (extracted from v1 response)

**Expected Outcome**:

- Result.ok = true
- Result.value = "hello-world"
- Request path asserted as `/wiki/rest/api/content/777/property/marksync.metadata` (v1 path)

**Notes / Clarifications**:

- Updates existing TC-PROP-RT-001 pattern to use v1 path assertion
- The `script()` helper must be updated to strip `/wiki/rest/api` prefix (not just `/wiki/api/v2`)

---

#### TC-PROP-V1-GET-002 - v1 GET returns stored value (~8 KB)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, AC-F4-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns 200 with ~8 KB value

**Steps**:

1. Create a test value of length 8 * 1024 bytes (8 KB, matching spike H2)
2. Call `service.get(PAGE, KEY)` after putting the value
3. Scripted fetch mock returns 200 with v1 response: `{id: "123", key: "marksync.metadata", value: <8KB string>, version: {number: 1, when: "2026-07-13T00:00:00.000Z"}}`
4. Verify result.ok = true
5. Verify result.value = original value (byte-equal)
6. Verify result.value.length = 8 * 1024

**Expected Outcome**:

- Result.ok = true
- Result.value byte-equal to original 8 KB string
- No data loss or truncation
- Request path asserted as v1 path

**Notes / Clarifications**:

- Updates existing TC-PROP-RT-001 large value test to use v1 path assertion
- Validates NFR-1 (100% byte-equality for values up to 8 KB)

---

#### TC-PROP-V1-GET-003 - v1 GET missing key → ok(undefined)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-2, AC-T1-1, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns 404 (key does not exist)

**Steps**:

1. Call `service.get(PAGE, KEY)` for a non-existent property
2. Scripted fetch mock returns 404 (null body)
3. Verify result.ok = true
4. Verify result.value = undefined

**Expected Outcome**:

- Result.ok = true (not an error)
- Result.value = undefined
- Request path asserted as v1 path
- No `RemoteUnreachable` error (404 is mapped to ok(undefined))

**Notes / Clarifications**:

- Updates existing TC-PROP-MISS-001 to use v1 path assertion
- Maintains existing error semantics (404 → ok(undefined))

---

#### TC-PROP-V1-POST-001 - v1 POST create for new key → 2xx

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 POST endpoint returns 2xx (create succeeds)
- Property key does not exist yet

**Steps**:

1. Call `service.put(PAGE, KEY, "new-value")` for a new key
2. Scripted fetch mock for POST returns 200 with v1 response: `{id: "123", key: "marksync.metadata", value: "new-value", version: {number: 1, when: "2026-07-13T00:00:00.000Z"}}`
3. Verify result.ok = true
4. Verify request method = POST
5. Verify request path = `/wiki/rest/api/content/777/property` (v1 POST create path)
6. Verify request body = `{key: "marksync.metadata", value: "new-value"}`

**Expected Outcome**:

- Result.ok = true
- POST request sent to v1 create path
- No fallback to PUT (create succeeds)
- Request body matches expected shape

**Notes / Clarifications**:

- Regression test: ensures POST create for new key still works
- No changes to this path except v1 endpoint

---

#### TC-PROP-V1-VERSION-001 - v1 POST 409 → GET version → PUT with incremented version (happy path)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, AC-T1-1, F-2, F-3, DEC-3, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- Property key already exists
- v1 POST create returns 409 (conflict)
- v1 GET returns current version
- v1 PUT returns 2xx (update succeeds)

**Steps**:

1. Call `service.put(PAGE, KEY, "updated-value")` for an existing key
2. Scripted fetch mock sequence:
   a. First request (POST): return 409 with `{errors: [{code: "CONFLICT"}]}`
   b. Second request (GET): return 200 with `{id: "123", key: "marksync.metadata", value: "old-value", version: {number: 5, when: "2026-07-13T00:00:00.000Z"}}`
   c. Third request (PUT): return 200 with `{id: "123", key: "marksync.metadata", value: "updated-value", version: {number: 6, when: "2026-07-13T00:00:01.000Z"}}`
3. Capture all requests in `bodies` array
4. Verify result.ok = true
5. Verify exact request sequence:
   - Request 1: method = POST, path = `/wiki/rest/api/content/777/property`, body = `{key: "marksync.metadata", value: "updated-value"}`
   - Request 2: method = GET, path = `/wiki/rest/api/content/777/property/marksync.metadata`
   - Request 3: method = PUT, path = `/wiki/rest/api/content/777/property/marksync.metadata`, body = `{key: "marksync.metadata", value: "updated-value", version: {number: 6}}`
6. Verify PUT body version number = 6 (current version 5 + 1)

**Expected Outcome**:

- Result.ok = true
- Exact 3-request sequence: POST → 409, GET → current version, PUT → 2xx
- All paths are v1 paths
- PUT body contains `version: {number: 6}` (incremented from 5)
- No 409 loop (update succeeds on first retry)

**Notes / Clarifications**:

- **THE CRITICAL PATH TEST** for this bug fix
- Replaces existing TC-PROP-CONFLICT-001 with detailed v1 version-number flow
- Tests DEC-3 (POST create → 409 → GET version → PUT with incremented version)
- Validates NFR-3 (no 409 loops)
- The `script()` helper must return different responses based on request method/path

---

#### TC-PROP-V1-VERSION-002 - v1 POST 409 → GET version → PUT with incremented version (large value)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F2-2, AC-F4-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- Property key already exists with ~8 KB value
- v1 POST create returns 409
- v1 GET returns current version with large value
- v1 PUT returns 2xx with large value

**Steps**:

1. Create a test value of length 8 * 1024 bytes
2. Call `service.put(PAGE, KEY, largeValue)` for an existing key
3. Scripted fetch mock sequence:
   a. First request (POST): return 409 with `{errors: [{code: "CONFLICT"}]}`
   b. Second request (GET): return 200 with `{id: "123", key: "marksync.metadata", value: largeValue, version: {number: 5, when: "2026-07-13T00:00:00.000Z"}}`
   c. Third request (PUT): return 200 with `{id: "123", key: "marksync.metadata", value: largeValue, version: {number: 6, when: "2026-07-13T00:00:01.000Z"}}`
4. Capture all requests in `bodies` array
5. Verify result.ok = true
6. Verify exact request sequence (POST → GET → PUT)
7. Verify PUT body contains the full large value
8. Verify PUT body version number = 6 (incremented from 5)

**Expected Outcome**:

- Result.ok = true
- Exact 3-request sequence with large value
- PUT body contains byte-equal large value (no truncation)
- Version number incremented correctly
- No data loss for ~8 KB values

**Notes / Clarifications**:

- Combines AC-F2-2 (version-number flow) with AC-F4-1 (byte-equality)
- Validates that the update flow works for large metadata values
- Ensures no regression in large-value handling

---

#### TC-PROP-V1-BYTE-001 - Byte-equality round-trip for ~8 KB value

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F4-1, NFR-1, F-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET/PUT endpoints support ~8 KB values

**Steps**:

1. Create a test value of length 8 * 1024 bytes (8 KB, matching spike H2)
2. Call `service.put(PAGE, KEY, value)` to store the value
3. Scripted fetch mock returns 200 for POST or PUT
4. Call `service.get(PAGE, KEY)` to retrieve the value
5. Scripted fetch mock returns 200 with the same value in v1 response
6. Verify result.ok = true
7. Verify result.value = original value (strict byte-equality)
8. Verify result.value.length = 8 * 1024

**Expected Outcome**:

- Result.ok = true
- Result.value byte-equal to original 8 KB string
- Length preserved exactly (8 * 1024 bytes)
- No encoding or truncation issues

**Notes / Clarifications**:

- Maintains existing TC-PROP-RT-001 large value test pattern
- Validates NFR-1 (100% byte-equality for values up to 8 KB)
- Uses v1 paths for both PUT and GET

---

#### TC-PROP-V1-PATH-001 - Unit test asserts v1 GET path

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-T1-1, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns 200

**Steps**:

1. Call `service.get(PAGE, KEY)`
2. Scripted fetch mock returns 200 with v1 response
3. Capture request path from `bodies` array
4. Verify request path = `/wiki/rest/api/content/777/property/marksync.metadata`
5. Verify request path does NOT contain `/wiki/api/v2` (old v2 prefix)

**Expected Outcome**:

- Request path is v1 path (`/wiki/rest/api/content/{pageId}/property/{key}`)
- No v2 paths in any request
- The `script()` helper correctly strips the `/wiki/rest/api` prefix

**Notes / Clarifications**:

- Regression test: ensures old v2 path assertions are updated
- The `script()` helper (line 41) must be updated to strip both `/wiki/api/v2` and `/wiki/rest/api`
- All GET tests must assert v1 path

---

#### TC-PROP-V1-PATH-002 - Unit test asserts v1 POST create path

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-T1-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 POST endpoint returns 200
- Property key does not exist

**Steps**:

1. Call `service.put(PAGE, KEY, "value")` for a new key
2. Scripted fetch mock returns 200 for POST
3. Capture request path from `bodies` array
4. Verify request path = `/wiki/rest/api/content/777/property` (no key in path for POST create)
5. Verify request method = POST

**Expected Outcome**:

- Request path is v1 POST create path (`/wiki/rest/api/content/{pageId}/property`)
- Request method is POST
- No v2 paths in any request

**Notes / Clarifications**:

- Regression test: ensures POST create uses v1 path
- POST create path is different from GET/PUT (no key in path)

---

#### TC-PROP-V1-PATH-003 - Unit test asserts v1 PUT update path

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-T1-1, F-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- Property key already exists
- v1 POST create returns 409
- v1 GET returns current version
- v1 PUT returns 200

**Steps**:

1. Call `service.put(PAGE, KEY, "updated-value")` for an existing key
2. Scripted fetch mock sequence: POST → 409, GET → current version, PUT → 200
3. Capture PUT request path from `bodies` array
4. Verify PUT request path = `/wiki/rest/api/content/777/property/marksync.metadata`
5. Verify PUT request method = PUT

**Expected Outcome**:

- PUT request path is v1 path (`/wiki/rest/api/content/{pageId}/property/{key}`)
- PUT request method is PUT
- No v2 paths in any request

**Notes / Clarifications**:

- Regression test: ensures PUT update uses v1 path
- Part of the version-number flow (TC-PROP-V1-VERSION-001)

---

#### TC-PROP-V1-ERR-001 - v1 GET 403 → Forbidden

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F1-1, G-3, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns 403 (forbidden)

**Steps**:

1. Call `service.get(PAGE, KEY)`
2. Scripted fetch mock returns 403
3. Verify result.ok = false
4. Verify result.error.kind = "Forbidden"

**Expected Outcome**:

- Result.ok = false
- Result.error.kind = "Forbidden"
- Error semantics preserved (403 → Forbidden)

**Notes / Clarifications**:

- Validates G-3 (maintain existing error semantics)
- No changes to error handling, just v1 path

---

#### TC-PROP-V1-ERR-002 - put POST 413 → TooLarge

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F1-1, G-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 POST create endpoint returns 413 (payload too large)

**Steps**:

1. Call `service.put(PAGE, KEY, value)` for a new key with a large value (simulated 413 response)
2. Scripted fetch mock for POST returns 413 with body matching `isTooLargeBody` regex (e.g., `{message: "Request body too large, exceeds maximum size"}`)
3. Verify result.ok = false
4. Verify result.error.kind = "TooLarge"
5. Verify result.error.what matches regex `/property .* exceeds/` (extracted from 413 body)

**Expected Outcome**:

- Result.ok = false
- Result.error.kind = "TooLarge"
- Result.error.what contains reference to property size limit
- Error mapping correctly applied via `isTooLargeBody` check in put()

**Notes / Clarifications**:

- Validates G-3 (maintain existing error semantics) for the real code path: `put()` POST-create 413 → TooLarge
- The `413→TooLarge` mapping exists ONLY in `put()` via `isTooLargeBody` regex check
- GET 413 (if it ever occurred) falls through to `RemoteUnreachable` (the catch-all in get()), but this is not the primary assertion

---

#### TC-PROP-V1-SCHEMA-001 - v1 response schema validation failure → RemoteUnreachable

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-4, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/properties.ts` → `tests/unit/infra/confluence/properties.test.ts`
**Tags**: @backend

**Preconditions**:

- PropertyService instantiated with scripted fetch mock
- v1 GET endpoint returns malformed response (missing `version.number` or wrong shape)

**Steps**:

1. Call `service.get(PAGE, KEY)`
2. Scripted fetch mock returns 200 with malformed response (e.g., `{id: "123", key: "marksync.metadata", value: "test"}` missing `version` field)
3. Verify result.ok = false
4. Verify result.error.kind = "RemoteUnreachable"

**Expected Outcome**:

- Result.ok = false
- Result.error.kind = "RemoteUnreachable"
- Schema validation catches malformed v1 responses

**Notes / Clarifications**:

- Tests DM-1 (PropertyV1Response schema)
- Schema must validate `{id, key, value, version: {number, when}}` shape
- Preserves G-3 (schema failures → RemoteUnreachable)

---

#### TC-INT-PROP-V1-001 - Integration test verifies v1 GET/POST/PUT paths

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-T2-1, F-1, F-2, F-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/target.ts` → `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Bun.serve mock server started
- ConfluenceTarget instantiated with mock origin
- Mock server handles v1 GET/POST/PUT endpoints

**Steps**:

1. Start Bun.serve mock with v1 path handlers:
   a. GET `/wiki/rest/api/content/39813121/property/marksync.metadata` → return 200 with v1 response
   b. POST `/wiki/rest/api/content/39813121/property` → return 200 with v1 response
   c. PUT `/wiki/rest/api/content/39813121/property/marksync.metadata` → return 200 with v1 response
2. Call `target.getProperty(39813121, "marksync.metadata")`
3. Call `target.putProperty(39813121, "marksync.metadata", "test-value")`
4. Verify all requests captured in `server.captured` array
5. Verify all request paths are v1 paths (no v2 paths)
6. Verify request methods: GET, POST, PUT (in correct sequence)

**Expected Outcome**:

- All requests use v1 paths
- Request paths:
  - GET: `/wiki/rest/api/content/39813121/property/marksync.metadata`
  - POST: `/wiki/rest/api/content/39813121/property`
  - PUT: `/wiki/rest/api/content/39813121/property/marksync.metadata`
- No v2 paths captured
- Integration test passes over real HTTP transport (over-mocking guardrail)

**Notes / Clarifications**:

- Updates existing `TC-INT-PROP-RT` block to assert v1 paths
- Replaces v2 path assertions with v1 path assertions
- Proves v1 paths work over real HTTP (not just mocked fetch)

---

#### TC-INT-PROP-V1-002 - Integration test verifies no 400 errors in update flow

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-T2-1, AC-F2-2, NFR-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/infra/confluence/target.ts` → `tests/integration/confluence/confluence-target.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Bun.serve mock server started
- ConfluenceTarget instantiated with mock origin
- Mock server simulates update flow: POST → 409, GET → version, PUT → 200

**Steps**:

1. Start Bun.serve mock with update flow handlers:
   a. POST `/wiki/rest/api/content/39813121/property` → return 409 (conflict)
   b. GET `/wiki/rest/api/content/39813121/property/marksync.metadata` → return 200 with version 5
   c. PUT `/wiki/rest/api/content/39813121/property/marksync.metadata` → return 200 with version 6
2. Call `target.putProperty(39813121, "marksync.metadata", "updated-value")`
3. Verify all requests captured in `server.captured` array
4. Verify request sequence: POST → 409, GET → 200, PUT → 200
5. Verify no 400 status codes in captured requests
6. Verify PUT body contains `version: {number: 6}`

**Expected Outcome**:

- Request sequence matches v1 version-number flow
- No 400 status codes (original bug fixed)
- All status codes: 409, 200, 200
- PUT body contains incremented version number
- Integration test passes (update flow works over real HTTP)

**Notes / Clarifications**:

- THE KEY INTEGRATION TEST for this bug fix
- Would have caught the original 400 error bug
- Proves no 400 errors occur in update flow
- Validates NFR-2 (100% success rate, no HTTP 400)

---

## 6. Environments and Test Data

- **Required environments**: Local development (unit + integration). No staging or test environment required (mocked `Bun.serve()` server and `script()` fetch mock).

- **Test data generation**:
  - Synthetic test values generated in-memory:
    - Small string: "hello-world"
    - Large string: "x".repeat(8 * 1024) (8 KB, matching spike H2)
    - v1 response shapes: `{id, key, value, version: {number, when}}`
  - No external test data files required.

- **Isolation strategy**:
  - Unit tests: Pure scripted fetch mock via `script()` helper; no external dependencies.
  - Integration tests: `Bun.serve()` mock HTTP server; each test independent, server stopped in `afterAll`.
  - Each test independent, no shared state between tests.
  - Temp directories not required (no lock file operations in PropertyService).

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-PROP-V1-GET-001, TC-PROP-V1-GET-002, TC-PROP-V1-GET-003, TC-PROP-V1-POST-001, TC-PROP-V1-VERSION-001, TC-PROP-V1-VERSION-002, TC-PROP-V1-BYTE-001, TC-PROP-V1-PATH-001, TC-PROP-V1-PATH-002, TC-PROP-V1-PATH-003, TC-PROP-V1-ERR-001, TC-PROP-V1-ERR-002, TC-PROP-V1-SCHEMA-001 | `tests/unit/infra/confluence/properties.test.ts` | `bun test tests/unit/infra/confluence/properties.test.ts` | Scripted fetch mock via `script()` helper (responses keyed by method+path) | Existing – Update |
| TC-INT-PROP-V1-001, TC-INT-PROP-V1-002 | `tests/integration/confluence/confluence-target.test.ts` | `bun test tests/integration/confluence/confluence-target.test.ts` | `Bun.serve()` mock HTTP server returning v1 responses | Existing – Update |

**Mocking requirements for unit tests:**

- `script()` helper (line 32-57 in `properties.test.ts`) must be updated to strip both `/wiki/api/v2` and `/wiki/rest/api` prefixes (currently only strips v2).
- Scripted responses keyed by method+path+body; handler returns v1 response shapes `{id, key, value, version: {number, when}}`.
- Capture all requests in `bodies` array for path/method assertion.
- Version-number flow (TC-PROP-V1-VERSION-001) requires handler to return different responses based on request sequence (POST → 409, GET → version, PUT → 2xx).

**Mocking requirements for integration tests:**

- `Bun.serve()` mock server (existing pattern in `confluence-target.test.ts`) with v1 path handlers:
  - GET `/wiki/rest/api/content/{pageId}/property/{key}` → return 200 with v1 response
  - POST `/wiki/rest/api/content/{pageId}/property` → return 200 or 409
  - PUT `/wiki/rest/api/content/{pageId}/property/{key}` → return 200
- Capture all requests in `server.captured` array for path/method assertion.
- Update existing `TC-INT-PROP-RT` block to assert v1 paths (currently asserts v2 paths).

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

- **RSK-3 (from spec):** Existing test suite fails on v2 path assertions. Mitigation: Update all path assertions in unit and integration tests to assert v1 paths (TC-PROP-V1-PATH-001/002/003, TC-INT-PROP-V1-001/002). Residual risk: Low.

- **Script() helper update risk:** The `script()` helper only strips `/wiki/api/v2` prefix. If not updated to also strip `/wiki/rest/api`, path assertions will fail. Mitigation: Update line 41 to handle both prefixes. Residual risk: Low.

- **Version-number flow complexity:** TC-PROP-V1-VERSION-001 requires the handler to return different responses based on request sequence. If the handler does not correctly sequence responses, the test will fail. Mitigation: Use a counter or state in the handler to track request count. Residual risk: Low.

### 8.2 Assumptions

- Confluence v1 REST API for content properties is stable and not deprecated (from spec §23).
- v1 GET returns `version.number` field in the response body (from spec §237).
- POST create with `{key, value}` body on v1 works same as v2 (confirmed in spike H2, from spec §238).
- `marksync.metadata` values stay within v1's ~8 KB limit (from spec §239).
- The `script()` helper can be generalized to strip both `/wiki/api/v2` and `/wiki/rest/api` prefixes.

### 8.3 Open Questions

None. All open questions resolved in spec §14 (OQ-1, OQ-2).

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2026-07-13 | Test Plan Writer | DoR iter-1 fixes: (1) TC-PROP-V1-ERR-002 now tests put POST 413 → TooLarge (real code path), (2) Resolved phantom TC-PROP-V1-IDEM-001 with structural justification for AC-F3-1 |
| 1.0 | 2026-07-13 | Test Plan Writer | Initial test plan for GH-66 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |