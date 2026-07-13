---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-62-remote-body-hash-mismatch
status: Proposed
created: 2026-07-13T08:15:00Z
last_updated: 2026-07-13T09:20:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, p0, ms-0002, mvp, sync, drift-detection, idempotency]
links:
  change_spec: ./chg-GH-62-spec.md
summary: >
  Fix remote body hash mismatch that breaks idempotent sync by aligning hash domains and adding fetch-back for Confluence-normalized bodies. The root cause is a hash-domain mismatch: the classifier compares Confluence's raw Storage XHTML hash (`remote.bodyHash`) against the canonical HAST hash (`base.renderedBodyHash`). The fix has three coordinated parts: (1) fetch-back the normalized body after each Create/Update, (2) add `remoteBodyHash` to `SharedBase`, and (3) fix the classifier's comparison to compare raw-to-raw.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-62: Remote body hash mismatch — Confluence XHTML normalization breaks idempotent sync

## Context and Goals

This plan fixes a P0 bug where every sync after the first classifies all pages as "remote changed" and blocks them, even when no local edits were made. The root cause is a hash-domain mismatch: the drift classifier compares Confluence's raw Storage XHTML hash (`remote.bodyHash`) against the canonical HAST hash (`base.renderedBodyHash`) — these can never match regardless of Confluence normalization.

The fix has three coordinated parts:

1. **Fetch-back after Create/Update**: After `target.createPage()`/`target.updatePage()` succeeds AND after asset upload, call `target.getPage(pageId)` to fetch the Confluence-normalized body. Compute `rawHash(fetchedBody)` and store as `remoteBodyHash` in the binding.
2. **Add `remoteBodyHash` to SharedBase**: Extend `SharedBase` in `sync-state.ts` with `remoteBodyHash: string` field, populated from `PageBinding`.
3. **Fix the classifier**: Change `remoteChanged` comparison from `remote.bodyHash !== base.renderedBodyHash` to `remote.bodyHash !== base.remoteBodyHash` (raw-to-raw instead of raw-to-canonical).

**Open questions**: None (resolved in PM notes: OQ-1 = fallback to `rawHash(renderedBody)` + warning; OQ-2 = fetch-back after asset upload).

## Scope

### In Scope

- `src/domain/state/sync-state.ts`: Add `remoteBodyHash: string` to `SharedBase` interface (F-2, AC-F3-1)
- `src/domain/state/classifier.ts`: Fix `remoteChanged` comparison to use `base.remoteBodyHash` (F-3, AC-F4-1)
- `src/app/push-flow.ts`:
  - Create path: Replace `remoteBodyHash: entry.hashes.canonicalHash` with fetch-back raw hash (F-1, F-4, AC-F2-1, AC-F5-1)
  - Update path: Replace stale `remoteBodyHash` with fetch-back raw hash (F-1, F-4, AC-F2-2, AC-F5-2)
  - 409 reapply path: Add fetch-back after reapply (F-1, NFR-5, TC-REAPPLY-001)
  - Construct `SharedBase` with `remoteBodyHash` in all paths (computePlan, 409 re-fetch) (AC-F3-1)
- Test updates:
  - Update classifier unit tests to use `remoteBodyHash` in comparison (TC-CLSF-001 through TC-CLSF-005, AC-T1-1)
  - Add integration tests for idempotent sync with Confluence normalization simulation (TC-IDEM-001, TC-IDEM-002, AC-T2-1)
  - Add fetch-back failure handling test (TC-FETCH-003, AC-F5-1 duplicate)

### Out of Scope

- Changes to canonical hash algorithm or `contentHash()` in `canonicalize.ts` (NG-1 from spec)
- Confluence normalization prediction or reverse-engineering (NG-2 from spec)
- Semantic AST comparison for drift detection (NG-3 from spec)
- Changes to `PageBinding` schema (field already exists, GH-19)
- Changes to lock file schema (field already exists, GH-19)
- Batch fetch-back optimization (deferred to MS-0003+)

### Constraints

- Performance: +1 GET per Create/Update (acceptable for MS-0002 scale ≤500 pages)
- Backward compatibility: Existing lock files without `remoteBodyHash` will populate on first sync
- Concurrency: No regression in 409 re-fetch-once policy (NFR-5)

### Risks

- **RSK-1**: Fetch-back GET exceeds Confluence rate limits. Mitigated by: NFR-PERF tolerance accepts +1 GET per page; MS-0002 scale is well within limits. Residual: Low.
- **RSK-2**: Fetch-back GET fails after successful write. Mitigated by: Handle gracefully with fallback hash + warning (OQ-1 resolved). Residual: Low.
- **RSK-3**: Existing test suite assumes old comparison. Mitigated by: Update all classifier tests to use `remoteBodyHash`. Residual: Low.
- **RSK-4**: Fallback remoteBodyHash causes false positives. Mitigated by: Fallback to `rawHash(renderedBody)` (same domain) means only one false-positive block if Confluence normalized. Residual: Low.

### Success Metrics

- Second-sync idempotency: 100% NoOp (0 writes, 0 blocks) on unchanged corpus (NFR-3, AC-F1-1, AC-F1-2)
- Remote-change detection accuracy: 0% false positives, 0% false negatives (NFR-4)
- Fetch-back success rate: ≥99.9% of Create/Update operations (transient failures only, NFR-2)

## Phases

### Phase 1: Domain layer — SharedBase.remoteBodyHash and classifier fix

**Goal**: Extend SharedBase with remoteBodyHash field and fix classifier comparison to use raw-to-raw comparison for remote drift detection.

**Tasks**:

- [ ] **1.1** Add `remoteBodyHash: string` to `SharedBase` interface in `src/domain/state/sync-state.ts` (F-2, AC-F3-1)
- [ ] **1.2** Change `remoteChanged` comparison in `src/domain/state/classifier.ts` line 52 from `remote.bodyHash !== base.renderedBodyHash` to `remote.bodyHash !== base.remoteBodyHash` (F-3, AC-F4-1)
- [ ] **1.3** Update classifier unit tests to use `remoteBodyHash` in comparison (TC-CLSF-001 through TC-CLSF-005, AC-T1-1)

**Acceptance Criteria**:

- Must: `SharedBase` interface includes `remoteBodyHash: string` field
- Must: Classifier `remoteChanged` comparison uses `base.remoteBodyHash` instead of `base.renderedBodyHash`
- Must: All classifier unit tests updated to include `remoteBodyHash` in base fixtures
- Should: No TypeScript compilation errors

**Affected code areas**:

- `src/domain/state/sync-state.ts` (updated — SharedBase interface)
- `src/domain/state/classifier.ts` (updated — remoteChanged comparison line 52)
- `tests/unit/domain/state/classifier.test.ts` (updated — all test fixtures)

**System docs to update**:

- None (domain layer changes, no system docs affected)

**Tests**:

- Run classifier unit tests: `bun test tests/unit/domain/state/classifier.test.ts`
- Typecheck: `bun run typecheck`

**Completion signal**: `fix(GH-62): add remoteBodyHash to SharedBase and fix classifier comparison`

---

### Phase 2: Application layer — Fetch-back wiring in push-flow

**Goal**: Wire fetch-back after Create/Update operations in push-flow, populate remoteBodyHash in bindings, and construct SharedBase with remoteBodyHash in all paths.

**Tasks**:

- [ ] **2.1** Update `finalizeSuccessfulUpdate` in `src/app/push-flow.ts` to add fetch-back after successful update (after asset upload per OQ-2), refresh `remoteBodyHash` in binding (F-1, F-4, AC-F2-2, AC-F5-2)
- [ ] **2.2** Update Create path in `processEntry` in `src/app/push-flow.ts` to replace `remoteBodyHash: entry.hashes.canonicalHash` with fetch-back raw hash (F-1, F-4, AC-F2-1, AC-F5-1)
- [ ] **2.3** Update 409 reapply path in `src/app/push-flow.ts` to add fetch-back after reapply (F-1, NFR-5, TC-REAPPLY-001)
- [ ] **2.4** Update `computePlan` in `src/app/push-flow.ts` (~lines 300-307) to construct `SharedBase` with `remoteBodyHash` from binding (AC-F3-1)
- [ ] **2.5** Add fetch-back failure handling: on `target.getPage()` failure, store `remoteBodyHash = rawHash(renderedBody)` + emit warning (F-5, OQ-1 resolved, AC-F5-1 duplicate)

**Acceptance Criteria**:

- Must: `target.getPage(pageId)` called after successful Create/Update and after asset upload
- Must: `remoteBodyHash` in binding set to `rawHash(fetchedBody)` on success, `rawHash(renderedBody)` on failure + warning
- Must: All `SharedBase` construction sites include `remoteBodyHash` field from binding
- Must: Fetch-back called in 409 reapply path
- Should: No TypeScript compilation errors

**Affected code areas**:

- `src/app/push-flow.ts` (updated — finalizeSuccessfulUpdate, processEntry Create path, 409 reapply path, computePlan)

**System docs to update**:

- None (application layer changes, no system docs affected in this phase)

**Tests**:

- Typecheck: `bun run typecheck`
- Lint: `bun run lint`

**Completion signal**: `fix(GH-62): wire fetch-back after Create/Update in push-flow`

---

### Phase 3: Tests — Integration tests for idempotent sync and fetch-back

**Goal**: Add integration tests for idempotent sync with Confluence normalization simulation, fetch-back success/failure, SharedBase construction, and remote edit detection.

**Tasks**:

- [ ] **3.1** Create or update `tests/integration/app/push-flow.test.ts` with fetch-back success test after Create (TC-FETCH-001, AC-F2-1, AC-F5-1)
- [ ] **3.2** Add fetch-back success test after Update (TC-FETCH-002, AC-F2-2, AC-F5-2)
- [ ] **3.3** Add fetch-back failure handling test (network error, fallback hash + warning) (TC-FETCH-003, AC-F5-1 duplicate)
- [ ] **3.4** Add SharedBase construction with remoteBodyHash test (TC-SHARED-001, AC-F3-1)
- [ ] **3.5** Add idempotent sync after Create test with Confluence normalization simulation (TC-IDEM-001, AC-F1-1, AC-T2-1, NFR-3, NFR-4)
- [ ] **3.6** Add idempotent sync after Update test with Confluence normalization simulation (TC-IDEM-002, AC-F1-2, AC-T2-1, NFR-3, NFR-4)
- [ ] **3.7** Add remote edit detection test (blocks correctly) (TC-REMOTE-001, NFR-4)
- [ ] **3.8** Add fetch-back after 409 reapply test (TC-REAPPLY-001, NFR-5)

**Acceptance Criteria**:

- Must: All integration tests pass with correct assertions (write counts, block counts, remoteBodyHash values)
- Must: Confluence normalization simulated via mock `target.getPage()` returning different body than sent
- Must: Fetch-back failure test verifies fallback hash and warning emission
- Should: Test coverage aligns with TC-AC mappings in test plan

**Affected code areas**:

- `tests/integration/app/push-flow.test.ts` (updated — new integration tests)

**System docs to update**:

- None (test layer, no system docs affected)

**Tests**:

- Run integration tests: `bun test tests/integration/app/push-flow.test.ts`
- Run all tests: `bun test`

**Completion signal**: `test(GH-62): add integration tests for idempotent sync and fetch-back`

---

### Phase 4: Verification — Quality gates

**Goal**: Run full quality gate suite to ensure no regressions and all tests pass.

**Tasks**:

- [ ] **4.1** Run typecheck: `bun run typecheck`
- [ ] **4.2** Run lint: `bun run lint`
- [ ] **4.3** Run all tests: `bun test`
- [ ] **4.4** Verify no regressions in existing classifier tests (TC-CLSF-001 through TC-CLSF-005)
- [ ] **4.5** Verify all new integration tests pass (TC-FETCH-001, TC-FETCH-002, TC-FETCH-003, TC-SHARED-001, TC-IDEM-001, TC-IDEM-002, TC-REMOTE-001, TC-REAPPLY-001)

**Acceptance Criteria**:

- Must: Typecheck passes with no errors
- Must: Lint passes with no errors
- Must: All tests pass (unit + integration)
- Must: No regressions in existing test suites
- Should: All acceptance criteria from spec verified (AC-F1-1, AC-F1-2, AC-F2-1, AC-F2-2, AC-F3-1, AC-F4-1, AC-F4-2, AC-F5-1, AC-F5-2, AC-T1-1, AC-T2-1)

**Affected code areas**:

- None (verification phase)

**System docs to update**:

- None (verification phase)

**Tests**:

- Full test suite: `bun test`

**Completion signal**: `fix(GH-62): verification complete — all quality gates passing`

---

### Phase 5: Finalize and Release

**Goal**: Prepare change for review and merge, including spec reconciliation if needed.

**Tasks**:

- [ ] **5.1** Review implementation against spec and test plan — ensure all AC covered
- [ ] **5.2** Reconcile `doc/spec/nonfunctional.md` if needed (PM notes §4: doc risks — feature-safe-publish.md §3.1 may need update)
- [ ] **5.3** Update ADR-0006 if needed (PM notes §4: shared-base state model may need note on remoteBodyHash semantics)
- [ ] **5.4** Version bump per repo conventions (patch version for bug fix)
- [ ] **5.5** Final commit with all changes staged

**Acceptance Criteria**:

- Must: All implementation tasks complete and verified
- Must: All tests passing
- Must: Spec and docs reconciled if needed
- Should: No unresolved open questions

**Affected code areas**:

- `package.json` (version bump — patch)
- `doc/spec/**` (if reconciliation needed per PM notes §4)
- `doc/decisions/adr-0006-*.md` (if note needed per PM notes §4)

**System docs to update**:

- `doc/spec/nonfunctional.md` (if needed — feature-safe-publish.md §3.1 drift detection may need update)
- `doc/decisions/adr-0006-*.md` (if needed — shared-base state model may need note on remoteBodyHash semantics)

**Tests**:

- Final test run: `bun test`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`

**Completion signal**: `fix(GH-62): finalize and release — spec reconciled, version bumped`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC |
|-------|----------|--------|----|
| TC-CLSF-001 | Classifier: NO_CHANGE with raw-to-raw match | 1, 4 | AC-F4-1, AC-F4-2, AC-T1-1 |
| TC-CLSF-002 | Classifier: REMOTE_AHEAD with remote body change | 1, 4 | AC-F4-1, AC-T1-1 |
| TC-CLSF-003 | Classifier: LOCAL_AHEAD with local canonical change | 1, 4 | AC-F4-2, AC-T1-1 |
| TC-CLSF-004 | Classifier: DIVERGED with both changes | 1, 4 | AC-F4-1, AC-F4-2, AC-T1-1 |
| TC-CLSF-005 | Classifier: SharedBase requires remoteBodyHash | 1, 4 | AC-F3-1, AC-T1-1 |
| TC-FETCH-001 | Fetch-back after Create success | 2, 3, 4 | AC-F2-1, AC-F5-1 |
| TC-FETCH-002 | Fetch-back after Update success | 2, 3, 4 | AC-F2-2, AC-F5-2 |
| TC-FETCH-003 | Fetch-back failure handling (network error) | 2, 3, 4 | AC-F5-1 (duplicate) |
| TC-SHARED-001 | SharedBase construction with remoteBodyHash | 2, 3, 4 | AC-F3-1 |
| TC-IDEM-001 | Idempotent sync after Create (normalization simulation) | 2, 3, 4 | AC-F1-1, AC-T2-1 |
| TC-IDEM-002 | Idempotent sync after Update (normalization simulation) | 2, 3, 4 | AC-F1-2, AC-T2-1 |
| TC-REMOTE-001 | Remote edit detection (blocks correctly) | 2, 3, 4 | NFR-4 |
| TC-REAPPLY-001 | Fetch-back after 409 reapply | 2, 3, 4 | NFR-5 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-62-spec.md | Spec |
| Test plan | ./chg-GH-62-test-plan.md | Test Plan |
| PM notes | ./chg-GH-62-pm-notes.yaml | Decision Record |
| Implementation plan | ./chg-GH-62-plan.md | Plan |
| Source: SharedBase | src/domain/state/sync-state.ts | Code (updated) |
| Source: Classifier | src/domain/state/classifier.ts | Code (updated) |
| Source: Push-flow | src/app/push-flow.ts | Code (updated) |
| Tests: Classifier | tests/unit/domain/state/classifier.test.ts | Test (updated) |
| Tests: Push-flow | tests/integration/app/push-flow.test.ts | Test (updated) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | plan-writer | Initial plan for GH-62 |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| (Populated during execution) | | | | | |