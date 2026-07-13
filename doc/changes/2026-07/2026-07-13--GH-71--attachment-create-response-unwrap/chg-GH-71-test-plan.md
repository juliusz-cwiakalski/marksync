---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/test-plan-template.md
ados_distribution: redistributable
id: chg-GH-71-test-plan
status: Proposed
created: 2026-07-13
last_updated: 2026-07-13
owners: ["@cwiakalski"]
service: confluence-adapter
labels: ["bug", "MS-0002", "priority:high"]
version_impact: patch
summary: "Fix the attachment upload response parsing to handle the Confluence v1 API's { results: [...] } wrapper, unblocking Mermaid SVG rendering and all attachment uploads."
links:
  change_spec: ./chg-GH-71-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Attachment upload schema mismatch — v1 API returns { results: [...] } not flat object

## 1. Scope and Objectives

This test plan validates the fix for a P0 bug where the `mapCreate` function in `src/infra/confluence/attachments.ts` incorrectly parses the v1 API attachment create response as a flat object, but Confluence returns `{ results: [...] }` even for single attachment creates. The fix unwraps the response before validation and adds regression test coverage for the happy path.

### 1.1 In Scope

- Unit test for the happy-path attachment create using the verbatim spike-evidence response shape
- Verification that the Mermaid render pipeline can upload SVG attachments without schema validation errors
- Regression confirmation that all existing attachment tests pass unchanged
- Edge case test for defensive fallback if API ever returns flat response

### 1.2 Out of Scope & Known Gaps

- E2E live-sandbox testing (CI integration-tier coverage is sufficient for a response-parsing fix)
- Changes to the `AttachmentCreateResponse` schema itself (it correctly models a single result)
- Changes to `AttachmentListResponse` or the `list()` path (already correct)
- Changes to the 400-duplicate / `resolveExisting` path (already correct)
- Changes to the Kroki/mermaid rendering pipeline (GH-69 is merged and correct; it was blocked by this upload bug)

## 2. References

- **Change Specification**: `doc/changes/2026-07/2026-07-13--GH-71--attachment-create-response-unwrap/chg-GH-71-spec.md`
- **Testing Strategy**: `.ai/rules/testing-strategy.md`
- **Spike Evidence**: `doc/inception/integration-scenarios/11-attachments.md:37` (response shape from `F-01-upload.json`)
- **Related Changes**: GH-69 (Mermaid render, blocked by this bug), GH-26 (Attachment pipeline, blocked by this bug)
- **Testing Strategy**: `.ai/rules/testing-strategy.md`
- **Existing Unit Tests**: `tests/unit/infra/confluence/attachments.test.ts`
- **Existing Integration Tests**: `tests/integration/assets/asset-upload.test.ts`, `tests/integration/app/mermaid/mermaid-render.test.ts`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-1 | POST create returning `{ "results": [{ "id": "att123", "title": "...", "version": { "number": 1 } }] }` → `upload()` returns `ok(AttachmentRef)` with correct id/title/hash/version | TC-ATTACH-001, TC-ATTACH-002 | To Implement |
| AC-2 | Mermaid render pipeline can upload SVG attachments (schema error no longer fires) | TC-ATTACH-003 | To Implement |
| AC-3 | All existing attachment tests pass unchanged (TC-DUP-001/002, TC-EXISTS-001, TC-LIST-001) | TC-ATTACH-004 | Existing – No Change |
| AC-4 | New regression test for happy-path create using verbatim spike-evidence response shape | TC-ATTACH-001 | To Implement |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Element | TC ID(s) | Status |
|--------------|---------|----------|--------|
| DM-1 | Attachment create response parsing (extracts from `results[0]` before validation) | TC-ATTACH-001, TC-ATTACH-002 | To Implement |
| — | `POST /wiki/rest/api/content/{id}/child/attachment` response parsing | TC-ATTACH-001, TC-ATTACH-002, TC-ATTACH-003 | To Implement |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Response parsing performance ≤ 1ms for unwrapping and validation | TC-ATTACH-001 | To Implement (timing assertion) |
| NFR-2 | Error handling clarity (maintain specific error messages for validation failures) | TC-ATTACH-005 | To Implement |

## 4. Test Types and Layers

### 4.1 Unit Tests

**Framework**: `bun:test`
**Root Directory**: `tests/unit/infra/confluence/attachments.test.ts`
**Pattern**: Use existing `script()` helper that creates an `AttachmentService` backed by a fake `fetch`. The helper returns `{ service, calls }` where `calls` records every `{ method, path }` the service made.

**Mock helpers**:
- `script(handler)` → returns `{ service, calls }`
- `jsonRes(status, body)` → builds a `Response` with JSON body
- `svgArtifact(hash, kind)` → builds an `Artifact`

### 4.2 Integration Tests

**Framework**: `bun:test` + `Bun.serve()` mock
**Root Directory**: `tests/integration/`
**Scope**: Confluence adapter (HTTP mock) for end-to-end attachment upload through the full push pipeline

**Existing integration tests**:
- `tests/integration/assets/asset-upload.test.ts` — Tests asset upload through `uploadAssets` function with mock target
- `tests/integration/app/mermaid/mermaid-render.test.ts` — Tests Mermaid rendering through `computePlan` with mock target

**Note**: These integration tests use a mock `TargetSystem` with stubbed `uploadAttachment` that always returns `ok({ id: "att-123", ... })`. They do NOT test the actual HTTP response parsing, so they will pass regardless of the `mapCreate` bug. The fix is validated primarily through unit tests.

### 4.3 E2E Tests

**Framework**: Thin runner script
**Root Directory**: `tests/e2e/`
**Scope**: Real Confluence test space
**Status**: Out of scope (CI integration-tier coverage is sufficient for a response-parsing fix)

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-ATTACH-001 | Happy-path create with wrapped response { results: [...] } | Happy Path | Critical | High | AC-1, AC-4 |
| TC-ATTACH-002 | Defensive fallback for flat response (no results wrapper) | Edge Case | Important | Medium | — |
| TC-ATTACH-003 | Mermaid SVG artifact upload through upload pipeline | Happy Path | Critical | High | AC-2 |
| TC-ATTACH-004 | Existing attachment tests unchanged (regression confirmation) | Regression | Important | High | AC-3 |
| TC-ATTACH-005 | Schema validation error message clarity (invalid response structure) | Negative | Minor | Low | NFR-2 |

### 5.2 Scenario Details

#### TC-ATTACH-001 - Happy-path create with wrapped response { results: [...] }

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-1, AC-4, DM-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend, @api, @attachment

**Preconditions**:
- `AttachmentService` is instantiated with a mock `ConfluenceClient` that returns a scripted response
- An SVG artifact with hash `"abc123def456"` is created using `svgArtifact(hash, "mermaid")`

**Steps**:
1. Create a mock response with the verbatim spike-evidence response shape:
   ```typescript
   const wrappedCreateResponse = {
     "results": [
       {
         "id": "att40009729",
         "title": "marksync-mermaid-abc123def456.svg",
         "version": { "number": 1 },
         "_links": { "download": "/rest/api/content/39813121/child/attachment/att40009729/download" }
       }
     ]
   };
   ```
2. Use the `script()` helper to create a service that returns `jsonRes(200, wrappedCreateResponse)` for `POST /content/${PAGE}/child/attachment`
3. Call `service.upload(PAGE, artifact)`
4. Assert the result is `ok` and contains the correct `AttachmentRef`:
   ```typescript
   expect(result.ok).toBe(true);
   if (!result.ok) return;
   expect(result.value.id).toBe("att40009729");
   expect(result.value.pageId).toBe(PAGE);
   expect(result.value.filename).toBe("marksync-mermaid-abc123def456.svg");
   expect(result.value.hash).toBe("abc123def456");
   expect(result.value.version).toBe(1);
   ```
5. Assert the `calls` array shows exactly one POST to the attachment endpoint
6. Assert the unwrapping and validation took ≤ 1ms (NFR-1) using performance timing

**Expected Outcome**:
- `upload()` returns `ok(AttachmentRef)` with correct id, title, hash, and version
- No `RemoteUnreachable` error with "schema validation failed" message
- Response parsing completes in ≤ 1ms

**Notes / Clarifications**:
- This test uses the **exact** response shape from the spike evidence (`doc/inception/integration-scenarios/11-attachments.md:37`)
- This is the **critical gap** that allowed the bug to ship — there was no test for the happy-path create
- The filename is derived using `attachmentFilename(artifact)` to match the real implementation

---

#### TC-ATTACH-002 - Defensive fallback for flat response (no results wrapper)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, DM-1, RSK-1, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend, @api, @attachment

**Preconditions**:
- `AttachmentService` is instantiated with a mock `ConfluenceClient` that returns a scripted response
- An SVG artifact with hash `"xyz789"` is created using `svgArtifact(hash, "asset")`

**Steps**:
1. Create a mock response with a **flat** response shape (defensive fallback case):
   ```typescript
   const flatCreateResponse = {
     "id": "att999",
     "title": "marksync-asset-xyz789.svg",
     "version": { "number": 1 },
     "_links": { "download": "/rest/api/content/123/child/attachment/att999/download" }
   };
   ```
2. Use the `script()` helper to create a service that returns `jsonRes(200, flatCreateResponse)` for `POST /content/${PAGE}/child/attachment`
3. Call `service.upload(PAGE, artifact)`
4. Assert the result is `ok` and contains the correct `AttachmentRef`:
   ```typescript
   expect(result.ok).toBe(true);
   if (!result.ok) return;
   expect(result.value.id).toBe("att999");
   expect(result.value.hash).toBe("xyz789");
   ```

**Expected Outcome**:
- `upload()` returns `ok(AttachmentRef)` using the defensive fallback path (body as-is)
- No `RemoteUnreachable` error
- Future-proofs against unlikely API change where flat response is returned

**Notes / Clarifications**:
- Per DEC-2: "Defensive check for flat response — future-proofs against unlikely API change; minimal overhead"
- This test ensures the defensive check in `mapCreate` works: if `body.results` is not present, use `body` as-is

---

#### TC-ATTACH-003 - Mermaid SVG artifact upload through upload pipeline

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-2, GH-69
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend, @api, @attachment, @mermaid

**Preconditions**:
- `AttachmentService` is instantiated with a mock `ConfluenceClient` that returns a scripted response
- A Mermaid SVG artifact with hash `"sha256hash123"` and `kind: "mermaid"` is created

**Steps**:
1. Create a mock response matching the Mermaid SVG upload scenario:
   ```typescript
   const mermaidUploadResponse = {
     "results": [
       {
         "id": "att555",
         "title": "marksync-mermaid-sha256hash123.svg",
         "version": { "number": 1 },
         "_links": { "download": "/rest/api/content/39813121/child/attachment/att555/download" }
       }
     ]
   };
   ```
2. Use the `script()` helper to create a service that returns `jsonRes(200, mermaidUploadResponse)` for `POST /content/${PAGE}/child/attachment`
3. Call `service.upload(PAGE, artifact)` where `artifact.kind === "mermaid"`
4. Assert the result is `ok` and contains the correct `AttachmentRef`
5. Assert the filename uses the correct prefix: `marksync-mermaid-` (not `marksync-asset-`)

**Expected Outcome**:
- Mermaid SVG upload succeeds without schema validation error
- Filename is correctly prefixed with `marksync-mermaid-` (per `attachmentFilename` implementation)
- This validates that GH-69 (Mermaid render) is unblocked

**Notes / Clarifications**:
- This test is separate from TC-ATTACH-001 to explicitly call out the Mermaid scenario (AC-2)
- The existing integration test `tests/integration/app/mermaid/mermaid-render.test.ts` uses a mock `TargetSystem` with stubbed `uploadAttachment` that always returns success, so it does NOT catch the bug. This unit test validates the actual HTTP response parsing for Mermaid artifacts.

---

#### TC-ATTACH-004 - Existing attachment tests unchanged (regression confirmation)

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-3, G-3, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend, @api, @attachment, @regression

**Preconditions**:
- All existing tests in `tests/unit/infra/confluence/attachments.test.ts` are present and unchanged

**Steps**:
1. Run the existing test suite: `bun test tests/unit/infra/confluence/attachments.test.ts`
2. Verify all existing tests pass:
   - `attachmentFilename` — hash-derived filename tests
   - `TC-DUP-001` — duplicate filename 400 → resolveExisting (0 writes)
   - `TC-DUP-002` — duplicate 400 with no listable match → throws
   - `TC-EXISTS-001` — exists by hash; 403 → Forbidden
   - `TC-LIST-001` — list enumeration
3. Verify test IDs are unchanged (no renaming or reordering)
4. Verify test assertions are unchanged (no behavior changes to these paths)

**Expected Outcome**:
- All existing tests pass without modification
- No regressions introduced by the `mapCreate` fix
- The fix only affects the create path, not duplicate resolution, existence checks, or list operations

**Notes / Clarifications**:
- This is a **regression check**, not a new test implementation
- Per NG-2/NG-3: Changes to `AttachmentListResponse` or the 400-duplicate / `resolveExisting` path are out of scope
- The fix is isolated to `mapCreate`, so these paths should be unaffected

---

#### TC-ATTACH-005 - Schema validation error message clarity (invalid response structure)

**Scenario Type**: Negative
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/attachments.test.ts`
**Tags**: @backend, @api, @attachment

**Preconditions**:
- `AttachmentService` is instantiated with a mock `ConfluenceClient` that returns a scripted response

**Steps**:
1. Create a mock response with an **invalid** response structure (missing required fields):
   ```typescript
   const invalidResponse = {
     "results": [
       {
         "id": "att999",
         // Missing "title" field — should fail schema validation
         "version": { "number": 1 }
       }
     ]
   };
   ```
2. Use the `script()` helper to create a service that returns `jsonRes(200, invalidResponse)` for `POST /content/${PAGE}/child/attachment`
3. Call `service.upload(PAGE, artifact)`
4. Assert the result is an error:
   ```typescript
   expect(result.ok).toBe(false);
   if (result.ok) return;
   expect(result.error.kind).toBe("RemoteUnreachable");
   expect(result.error.cause).toContain("schema validation failed: AttachmentCreateResponse");
   ```

**Expected Outcome**:
- Invalid response structure returns `RemoteUnreachable` error
- Error message clearly indicates "schema validation failed: AttachmentCreateResponse"
- Per NFR-2: Error handling clarity is maintained

**Notes / Clarifications**:
- This test validates that schema validation still works after the unwrap logic is added
- Ensures the unwrapping doesn't bypass schema validation for truly invalid responses

---

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local-dev**: Primary environment for unit and integration tests
- **CI**: Fast loop on every push (unit + integration tests)
- **No staging/test environment required**: This is a response-parsing fix validated with mocks

### 6.2 Test Data Generation and Cleanup

- **Unit tests**: Use mock helpers (`script()`, `jsonRes()`, `svgArtifact()`) to generate test data on-the-fly
- **Integration tests**: Use mock `TargetSystem` with stubbed methods
- **No persistent test data required**: All tests use ephemeral mocks

### 6.3 Isolation Strategy

- **Unit tests**: Isolated per test case using the `script()` helper (no shared state between tests)
- **Integration tests**: Each test creates its own mock `TargetSystem` instance
- **No database/external state**: All tests are self-contained

## 7. Automation Plan and Implementation Mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-ATTACH-001 | `tests/unit/infra/confluence/attachments.test.ts` | `bun test tests/unit/infra/confluence/attachments.test.ts` | Mock `ConfluenceClient.fetch` returning `jsonRes(200, wrappedCreateResponse)` | To Implement |
| TC-ATTACH-002 | `tests/unit/infra/confluence/attachments.test.ts` | `bun test tests/unit/infra/confluence/attachments.test.ts` | Mock `ConfluenceClient.fetch` returning `jsonRes(200, flatCreateResponse)` | To Implement |
| TC-ATTACH-003 | `tests/unit/infra/confluence/attachments.test.ts` | `bun test tests/unit/infra/confluence/attachments.test.ts` | Mock `ConfluenceClient.fetch` returning `jsonRes(200, mermaidUploadResponse)` | To Implement |
| TC-ATTACH-004 | `tests/unit/infra/confluence/attachments.test.ts` | `bun test tests/unit/infra/confluence/attachments.test.ts` | No new mocks; run existing tests as-is | Existing – No Change |
| TC-ATTACH-005 | `tests/unit/infra/confluence/attachments.test.ts` | `bun test tests/unit/infra/confluence/attachments.test.ts` | Mock `ConfluenceClient.fetch` returning `jsonRes(200, invalidResponse)` | To Implement |

**Execution in CI**:
- Fast loop: `bun test tests/unit/ tests/integration/` (every push)
- Unit tests for GH-71 are part of the `tests/unit/infra/confluence/attachments.test.ts` suite
- No separate CI configuration required

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| RSK-T-1 | Test implementation may not match the actual fix implementation (unwrap logic details) | Medium | Low | Use verbatim spike evidence response shape; specify exact mock bodies in test scenarios |
| RSK-T-2 | Timing assertion for NFR-1 may be flaky on CI due to resource contention | Low | Low | Use generous threshold (≤ 1ms is already generous for a simple object unwrap); consider removing timing assertion if flaky |

### 8.2 Assumptions

- The `script()` helper in `tests/unit/infra/confluence/attachments.test.ts` will continue to work for the new tests (it's a well-established pattern)
- The spike evidence response shape (`F-01-upload.json`) accurately represents the Confluence v1 API behavior
- The fix implementation will follow DEC-1 and DEC-2 from the spec (unwrap in mapper, defensive check for flat response)

### 8.3 Open Questions

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-T-1 | None | Test plan is fully specified; no unresolved questions | N/A |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Test Plan Writer | Initial test plan for GH-71 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| — | — | — | Tests not yet executed (plan is Proposed) |