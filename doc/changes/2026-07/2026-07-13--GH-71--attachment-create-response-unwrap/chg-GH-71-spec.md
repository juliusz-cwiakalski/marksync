---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-71
  type: fix
  status: Proposed
  slug: attachment-create-response-unwrap
  title: "Attachment upload schema mismatch — v1 API returns { results: [...] } not flat object"
  owners: ["@cwiakalski"]
  service: confluence-adapter
  labels: ["bug", "MS-0002", "priority:high"]
  version_impact: patch
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: []
    external: ["Confluence v1 API"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Fix the attachment upload response parsing to handle the Confluence v1 API's `{ results: [...] }` wrapper, unblocking Mermaid SVG rendering and all attachment uploads.

## 1. SUMMARY

The `mapCreate` function in the attachment service incorrectly parses the v1 API response as a flat object, but Confluence returns `{ results: [...] }` even for single attachment creates. This causes schema validation failures on every attachment upload, blocking the Mermaid SVG rendering feature (GH-69) and all attachment operations (GH-26). The fix unwraps the response before validation and adds regression test coverage for the happy path.

## 2. CONTEXT

### 2.1 Current State Snapshot

The `AttachmentService` provides methods for uploading, listing, and checking existence of attachments on Confluence pages. The `upload()` method uses a POST to the v1 API endpoint `/wiki/rest/api/content/{id}/child/attachment`. Upon receiving a 200-299 response, it calls `mapCreate()` to parse the response body and return an `AttachmentRef`. The `list()` method correctly handles the v1 API's wrapped response structure (`{ results: [...] }`) using the `AttachmentListResponse` schema.

### 2.2 Pain Points / Gaps

- Every attachment upload fails with the error `RemoteUnreachable { cause: "schema validation failed: AttachmentCreateResponse" }`
- The Mermaid SVG rendering feature (GH-69) is blocked because it depends on successful attachment uploads
- User-provided image attachments (GH-26) are blocked
- No unit test exists for the happy-path attachment create (the success path), so the bug went undetected through multiple feature deliveries

## 3. PROBLEM STATEMENT

Because the `mapCreate` function parses the v1 API response as a flat object using `AttachmentCreateResponse.safeParse(body)`, but the actual Confluence v1 API returns `{ results: [{ id, title, version, ... }] }` even for single attachment creates, attachment uploads fail schema validation and return `RemoteUnreachable`, resulting in the Mermaid SVG rendering feature and all attachment operations being non-functional.

## 4. GOALS

- **G-1**: Attachment upload (POST create) succeeds by correctly unwrapping the `results[0]` element from the v1 API response before zod validation
- **G-2**: Add regression test coverage for the happy-path attachment create using the verbatim spike evidence response shape
- **G-3**: Verify that existing attachment tests pass unchanged (duplicate-filename idempotency, existence, and list operations)

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Attachment upload success rate | 100% (currently 0% due to schema validation failure) |
| Unit test coverage for mapCreate success path | 1 new test (TC-ATTACH-001) |
| Existing attachment test pass rate | 100% (no regressions) |

### 4.2 Non-Goals

- **NG-1**: Changes to the `AttachmentCreateResponse` schema itself (it correctly models a single result; the unwrap happens in the mapper)
- **NG-2**: Changes to `AttachmentListResponse` or the `list()` path (already correct)
- **NG-3**: Changes to the 400-duplicate / `resolveExisting` path (already correct)
- **NG-4**: Changes to the Kroki/mermaid rendering pipeline (GH-69 is merged and correct; it was blocked by this upload bug)
- **NG-5**: E2E live-sandbox testing (CI integration-tier coverage is sufficient for a response-parsing fix)

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Parse wrapped v1 attachment create response | Enables successful attachment uploads, unblocking Mermaid rendering and user images |

### 5.1 Capability Details

**F-1**: The system must parse the v1 API's attachment create response by extracting the first element from the `results` array before schema validation. The mapper checks for the presence of `body.results` and unwraps `results[0]` if present; otherwise, it uses the body as-is for defensive compatibility. This matches the pattern already used in the `list()` method, which correctly handles `AttachmentListResponse.results`.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Attachment upload (happy path)
  User provides artifact → upload() POSTs to v1 API → API returns 200 with { results: [{ id, title, version }] }
    → mapCreate unwraps results[0] → AttachmentCreateResponse validates → returns ok(AttachmentRef)

Flow 2: Attachment upload (duplicate filename)
  User provides artifact → upload() POSTs to v1 API → API returns 400 with "same file name" message
    → resolveExisting() lists attachments → finds hash match → returns ok(AttachmentRef) (0 writes)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Fix `mapCreate` in the attachment service to unwrap `body.results[0]` before validation
- Add a unit test for the happy-path attachment create using the verbatim spike evidence response shape
- Verify the fix against the spike evidence (`F-01-upload.json` response shape from `doc/inception/integration-scenarios/11-attachments.md`)

### 7.2 Out of Scope

- [OUT] Changes to the `AttachmentCreateResponse` schema
- [OUT] Changes to `AttachmentListResponse` or the `list()` path
- [OUT] Changes to the 400-duplicate / `resolveExisting` path
- [OUT] Changes to the Kroki/mermaid rendering pipeline
- [OUT] E2E live-sandbox testing

### 7.3 Deferred / Maybe-Later

None

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

| Endpoint | Change | Impact |
|----------|--------|--------|
| `POST /wiki/rest/api/content/{id}/child/attachment` | Response parsing | Fix ensures correct parsing of existing endpoint response |

### 8.2 Events / Messages

N/A

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | Attachment create response parsing | Mapper now extracts from `results[0]` before validation; schema unchanged |

### 8.4 External Integrations

- **Confluence v1 API**: Response parsing updated to match the actual API contract (wrapped in `{ results: [...] }`)

### 8.5 Backward Compatibility

The fix is backward compatible: if the API ever returns a flat response (unlikely), the defensive check will use the body as-is. The `AttachmentCreateResponse` schema remains unchanged, preserving existing type contracts.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Response parsing performance | ≤ 1ms for unwrapping and validation (unchanged from current path) |
| NFR-2 | Error handling clarity | Maintain specific error messages for validation failures |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A (existing error handling and logging sufficient)

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Confluence API changes response shape | H | L | Defensive check uses `body.results[0]` if present, else `body` as-is | Low |
| RSK-2 | Multiple results in create response (unexpected) | M | L | Mapper takes `results[0]`; schema validates single result structure | Low |

## 12. ASSUMPTIONS

- The v1 API's response shape is confirmed by spike evidence at `doc/inception/integration-scenarios/11-attachments.md:37` (evidence file `F-01-upload.json`)
- The `list()` method's pattern of using `AttachmentListResponse.results` is the correct reference implementation
- The fix does not require changes to any consumers (GH-69, GH-26) as they depend only on the successful return of `AttachmentRef`

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Blocks | GH-69 (Mermaid render) | Feature is merged but blocked by this upload bug |
| Blocks | GH-26 (Attachment pipeline) | Feature is merged but blocked by this upload bug |
| Depends on | Confluence v1 API | Response shape confirmed via spike (MS-0001) |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | None | Fix is fully specified in ticket and spike evidence | N/A |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Unwrap `results[0]` in mapper, not schema | Keeps schema a clean single-result validator; unwrap is an API mapping concern | 2026-07-13 |
| DEC-2 | Defensive check for flat response | Future-proofs against unlikely API change; minimal overhead | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| AttachmentService (`src/infra/confluence/attachments.ts`) | Updated (mapCreate function) |
| Attachment unit tests (`tests/unit/infra/confluence/attachments.test.ts`) | Updated (new test for happy path) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-1 | **Given** a POST to `/content/{id}/child/attachment` that returns 200 with `{ "results": [{ "id": "att123", "title": "marksync-mermaid-<hash>.svg", "version": { "number": 1 } }] }`, **when** `AttachmentService.upload()` processes the response, **then** it returns `ok(AttachmentRef)` with the correct id/title/hash/version — NOT `RemoteUnreachable { cause: "schema validation failed" }` | F-1, NFR-1 |
| AC-2 | **Given** the Mermaid render pipeline (GH-69) attempts to upload an SVG attachment, **when** the upload is processed, **then** the schema-validation error no longer fires and the upload succeeds | F-1, G-1 |
| AC-3 | **Given** the existing attachment test suite, **when** tests are run, **then** all tests pass unchanged (TC-DUP-001/002 duplicate-filename idempotency, TC-EXISTS-001 existence, TC-LIST-001 list) | G-3, NFR-2 |
| AC-4 | **Given** a new unit test for the happy-path create, **when** executed with a `{ results: [{ ... }] }` response shape, **then** it asserts `ok(ref)` is returned using the verbatim spike-evidence response shape | F-1, G-2 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This is a low-risk bug fix with no API or data model changes. It can be merged immediately after test-plan generation and implementation. No feature flags or staged rollout required.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A

## 20. PRIVACY / COMPLIANCE REVIEW

N/A (no PII or compliance-sensitive data involved)

## 21. SECURITY REVIEW HIGHLIGHTS

N/A (no security impact; response parsing only)

## 22. MAINTENANCE & OPERATIONS IMPACT

None (fixes existing broken functionality; no new operational burden)

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Attachment create response | Response from `POST /wiki/rest/api/content/{id}/child/attachment`, containing attachment metadata |
| Wrapped response | Confluence v1 API response format with a top-level `{ results: [...] }` array |
| Flat response | Hypothetical response format without the `results` wrapper (not currently used) |

## 24. APPENDICES

**Spike evidence**: Response shape confirmed at `doc/inception/integration-scenarios/11-attachments.md:37` (evidence file `F-01-upload.json`):

```json
{
  "results": [
    {
      "id": "att40009729",
      "title": "spike-diagram.png",
      "version": { "number": 1 },
      "_links": {
        "download": "/rest/api/content/39813121/child/attachment/att40009729/download"
      }
    }
  ]
}
```

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Change Spec Writer | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored using the planning-session context from the GH-71 ticket and the spike evidence at `doc/inception/integration-scenarios/11-attachments.md`. The fix approach is fully specified in the ticket and does not require additional decision-making.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-71)
- [x] `owners` has at least one entry (["@cwiakalski"])
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1, AC-1/2/3/4, NFR-1/2, RSK-1/2, DEC-1/2, DM-1, G-1/2/3, NG-1/2/3/4/5, OQ-1)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (≤ 1ms, error message clarity)
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths beyond component names, no step-by-step tasks)
- [x] No content duplicated from linked docs (summaries only, no verbatim copy)
- [x] Front matter validates per front_matter_rules