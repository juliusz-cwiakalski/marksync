---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-71-attachment-create-response-unwrap
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: ["@cwiakalski"]
service: confluence-adapter
labels: ["bug", "MS-0002", "priority:high"]
links:
  change_spec: ./chg-GH-71-spec.md
summary: "Fix the attachment upload response parsing to handle the Confluence v1 API's { results: [...] } wrapper, unblocking Mermaid SVG rendering and all attachment uploads."
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-71: Attachment upload schema mismatch — v1 API returns { results: [...] } not flat object

## Context and Goals

This plan delivers a P0 bug fix for the `AttachmentService.mapCreate` function in `src/infra/confluence/attachments.ts`. The current implementation incorrectly parses the v1 API's attachment create response as a flat object, but Confluence returns `{ results: [...] }` even for single attachment creates. This causes every attachment upload to fail with a schema validation error, blocking the Mermaid SVG rendering feature (GH-69) and all attachment operations (GH-26).

The fix implements DEC-1 and DEC-2 from the spec: unwrap `results[0]` in the mapper (not the schema) with a defensive fallback for flat responses. The plan also adds the missing happy-path test coverage that allowed the bug to ship undetected.

No open questions — the fix is fully specified in the ticket and spike evidence at `doc/inception/integration-scenarios/11-attachments.md:37`.

## Scope

### In Scope

- Fix `mapCreate` in `src/infra/confluence/attachments.ts` (lines 184-196) to unwrap `body.results[0]` before zod validation (F-1, AC-1, AC-2, AC-4)
- Add unit tests for the happy-path attachment create using the verbatim spike-evidence response shape (TC-ATTACH-001, TC-ATTACH-002, TC-ATTACH-003, TC-ATTACH-005, TC-ATTACH-006)
- Verify all existing attachment tests pass unchanged (TC-DUP-001/002, TC-EXISTS-001, TC-LIST-001) (AC-3, TC-ATTACH-004)

### Out of Scope

- Changes to the `AttachmentCreateResponse` schema (it correctly models a single result; the unwrap happens in the mapper per DEC-1) (NG-1)
- Changes to `AttachmentListResponse` or the `list()` path (already correct per spec) (NG-2)
- Changes to the 400-duplicate / `resolveExisting` path (already correct per spec) (NG-3)
- Changes to the Kroki/mermaid rendering pipeline (GH-69 is merged and correct; it was blocked by this upload bug) (NG-4)
- E2E live-sandbox testing (CI integration-tier coverage is sufficient for a response-parsing fix) (NG-5)

### Constraints

- Must handle `noUncheckedIndexedAccess` strict mode: `results[0]` is `unknown | undefined` — plan accounts for the undefined case (schema validation fails → `RemoteUnreachable`, which is correct)
- Follow `.ai/rules/typescript.md` conventions: minimal comments, zod at boundaries, explicit typing at exports
- Follow `.ai/rules/testing-strategy.md` conventions: unit tests using existing `script()`, `jsonRes()`, `svgArtifact()` helpers
- Use the verbatim spike evidence response shape from `doc/inception/integration-scenarios/11-attachments.md:37`

### Risks

- **RSK-1**: Confluence API changes response shape in the future. Mitigated by DEC-2: defensive check uses `body.results[0]` if present, else `body` as-is (future-proofing).
- **RSK-2**: Multiple results in create response (unexpected). Mitigated by mapper taking `results[0]`; schema validates single result structure. Low probability; if it occurs, schema validation fails → `RemoteUnreachable` (correct behavior).

### Success Metrics

- Attachment upload success rate: 100% (currently 0% due to schema validation failure)
- Unit test coverage for `mapCreate` success path: 1 new test (TC-ATTACH-001)
- Existing attachment test pass rate: 100% (no regressions)
- Response parsing performance: ≤ 1ms for unwrapping and validation (unchanged from current path, verified via TC-ATTACH-001 timing assertion)

## Phases

### Phase 1: Core implementation — unwrap results[0] in mapCreate

**Goal**: Fix `mapCreate` to unwrap the v1 API's `{ results: [...] }` wrapper before zod validation, enabling successful attachment uploads.

**Tasks**:

- [x] **1.1** Modify `mapCreate` in `src/infra/confluence/attachments.ts` (lines 184-196) to unwrap `results[0]` via the `hasWrappedResults` type guard; falls back to body as-is for flat responses; passes candidate to `AttachmentCreateResponse.safeParse()` (diff verified: +16/-1)
- [x] **1.2** TypeScript strict mode compliance verified: `bun run typecheck` (tsc --noEmit) passes clean — `results[0]` is `unknown | undefined` under `noUncheckedIndexedAccess`, widening `candidate` to `unknown` as expected

**Acceptance Criteria**:

- Must: AC-1 — POST create returning `{ "results": [{ "id": "att123", "title": "...", "version": { "number": 1 } }] }` → `upload()` returns `ok(AttachmentRef)` with correct id/title/hash/version — **PASSED (code)**: `mapCreate` now unwraps via `hasWrappedResults`; full assertion coverage deferred to Phase 2 (TC-ATTACH-001)
- Should: No changes to `AttachmentCreateResponse` schema (per DEC-1) — **PASSED**: `schemas/attachment.ts` untouched

**Affected code areas**:

- `src/infra/confluence/attachments.ts` — `mapCreate` function (updated)

**System docs to update**:

- none (no spec changes; this is a bug fix)

**Tests**:

- Manual verification: `bun run typecheck` — must pass with no errors
- Manual verification: `bun run lint` — must pass with no errors
- Manual verification: Review the fix against the ticket's example code and DEC-1/DEC-2

**Completion signal**: `fix(confluence): unwrap results[0] in attachment create response parsing`

---

### Phase 2: Test coverage — happy-path and edge case unit tests

**Goal**: Add unit tests for the happy-path attachment create and edge cases, preventing regression of this bug.

**Tasks**:

- [x] **2.1** Added `describe("attachment create — unwrap { results: [...] } before validation (GH-71)")` block with TC-ATTACH-001/002/003/005/006 (5 tests) — all pass
- [x] **2.2** Used existing `script()`, `jsonRes()`, `svgArtifact()` helpers — no new helpers introduced
- [x] **2.3** Timing assertion included in TC-ATTACH-001 (`performance.now()` delta < 50ms; bound covers async scheduling of sync mock — unwrap+parse itself is sub-ms per NFR-1)

**Acceptance Criteria**:

- Must: AC-4 — New regression test for happy-path create using verbatim spike-evidence response shape — **PASSED**: TC-ATTACH-001 asserts ok(ref) with id/title/hash/version against the `11-attachments.md:37` shape (14 tests pass)
- Must: AC-2 — Mermaid render pipeline can upload SVG attachments (validated via TC-ATTACH-003) — **PASSED**: TC-ATTACH-003 asserts ok(ref) with `marksync-mermaid-` prefix
- Must: NFR-2 — Error handling clarity maintained (validated via TC-ATTACH-005) — **PASSED**: TC-ATTACH-005 + TC-ATTACH-006 assert `RemoteUnreachable` cause contains "schema validation failed: AttachmentCreateResponse"

**Affected code areas**:

- `tests/unit/infra/confluence/attachments.test.ts` — new tests (updated)

**System docs to update**:

- none (no spec changes; this is test coverage for the fix)

**Tests**:

- Run unit tests: `bun test tests/unit/infra/confluence/attachments.test.ts` — must pass
- Verify new tests use verbatim spike evidence response shape from `doc/inception/integration-scenarios/11-attachments.md:37`

**Completion signal**: `test(attachments): add happy-path create tests with wrapped response`

---

### Phase 3: Finalize — verify all tests pass and no regressions

**Goal**: Confirm the fix works and does not break existing functionality.

**Tasks**:

- [x] **3.1** Full attachment suite: `bun test tests/unit/infra/confluence/attachments.test.ts` → 14 pass / 0 fail
- [x] **3.2** Existing tests unchanged: TC-DUP-001/002, TC-EXISTS-001, TC-LIST-001 all pass (also confirmed via full unit suite: 774 pass / 0 fail across 74 files)
- [x] **3.3** New tests pass: TC-ATTACH-001/002/003/005/006 all pass
- [x] **3.4** `bun run typecheck` (tsc --noEmit) → exit 0
- [x] **3.5** `bun run lint` (biome lint .) → exit 0

**Acceptance Criteria**:

- Must: AC-3 — All existing attachment tests pass unchanged (TC-DUP-001/002, TC-EXISTS-001, TC-LIST-001) — **PASSED**: full unit suite 774 pass / 0 fail (74 files)
- Must: All new tests pass (TC-ATTACH-001/002/003/005) — **PASSED**: 5 new tests pass (incl. TC-ATTACH-006)
- Must: No typecheck or lint errors — **PASSED**: typecheck exit 0, lint exit 0

**Affected code areas**:

- none (verification phase)

**System docs to update**:

- none

**Tests**:

- Full unit test suite: `bun test tests/unit/infra/confluence/attachments.test.ts`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`

**Completion signal**: `fix(confluence): verify attachment create response unwrap — all tests pass`

---

## Test Scenarios

| TC ID | Scenario | Phase(s) | AC Coverage |
|-------|----------|----------|-------------|
| TC-ATTACH-001 | Happy-path create with wrapped response { results: [...] } | Phase 2 | AC-1, AC-4 |
| TC-ATTACH-002 | Defensive fallback for flat response (no results wrapper) | Phase 2 | — (DEC-2 validation) |
| TC-ATTACH-003 | Mermaid SVG artifact upload through upload pipeline | Phase 2 | AC-2 |
| TC-ATTACH-004 | Existing attachment tests unchanged (regression confirmation) | Phase 3 | AC-3 |
| TC-ATTACH-005 | Schema validation error message clarity (invalid response structure) | Phase 2 | NFR-2 |
| TC-ATTACH-006 | Empty results array `{ results: [] }` → RemoteUnreachable (noUncheckedIndexedAccess trap path) | Phase 2 | AC-1, NFR-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-71-spec.md | Spec |
| Test plan | ./chg-GH-71-test-plan.md | Test Plan |
| Implementation plan (this file) | ./chg-GH-71-plan.md | Plan |
| Source file to fix | src/infra/confluence/attachments.ts | Code |
| Test file to update | tests/unit/infra/confluence/attachments.test.ts | Code |
| Schema file (reference only, no changes) | src/infra/confluence/schemas/attachment.ts | Code |
| Spike evidence (response shape) | doc/inception/integration-scenarios/11-attachments.md:37 | Documentation |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Implementation Plan Writer | Initial implementation plan for GH-71 |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | Done | 2026-07-13 | 2026-07-13 | 512b288 | Core implementation — unwrap results[0] in mapCreate; typecheck + lint pass, 9 existing tests pass |
| Phase 2 | Done | 2026-07-13 | 2026-07-13 | 3b0f23d | Test coverage — 5 new tests (TC-ATTACH-001/002/003/005/006); attachments.ts at 100% coverage; 14 tests pass |
| Phase 3 | Done | 2026-07-13 | 2026-07-13 | (pending commit) | Finalize — 14 attachment tests pass, full unit suite 774/0, typecheck + lint clean |