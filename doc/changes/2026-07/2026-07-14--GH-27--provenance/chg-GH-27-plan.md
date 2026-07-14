---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-27-provenance
status: Proposed
created: 2026-07-14T00:00:00Z
last_updated: 2026-07-14T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, provenance, metadata, accessibility]
links:
  change_spec: ./chg-GH-27-spec.md
summary: "Provenance infrastructure: visible panel/footer on managed pages with complete marksync.metadata property enrichment and direct-edit classification, enforcing privacy via ADR-0010 and preventing false drift through timestamp canonicalization."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-27: [MS2-E4-S3] Provenance

## Context and Goals

This plan delivers provenance infrastructure for the safe publish pipeline (MS-0002). Every managed Confluence page will carry a visible provenance panel showing source path, Git revision, branch, and last-sync timestamp (readable by non-technical stakeholders per NFR-A11Y-3). The `marksync.metadata` content property will be fully populated with all required fields, and a programmatic predicate will classify Confluence page versions as MarkSync-authored or directly edited (NFR-REL-9). The visible panel is gated by `config.provenance.visiblePanel` and excluded from content-hash comparison, so timestamp updates do not trigger false drift (NFR-PERF-4). Privacy is enforced by storing only commit count and truncation marker in Confluence, never full commit subjects (ADR-0010, NFR-PRIV-1).

**Key goals:**
- G-1: Every managed page renders a visible provenance panel with source path, Git revision, branch, and last-sync timestamp (NFR-A11Y-3).
- G-2: The `marksync.metadata` content property is fully populated with all required fields, including `sourceBranch`, `commitCount`, and `trimMarker`.
- G-3: A programmatic predicate classifies Confluence page versions as MarkSync-authored or direct edit based on `version.message` prefix (NFR-REL-9).
- G-4: Updating the last-sync timestamp does not trigger false drift—content-hash canonicalization normalizes the timestamp marker.
- G-5: Privacy is enforced—commit subjects are stored only in local plan/apply output, never in Confluence (ADR-0010).

## Scope

### In Scope

- Visible provenance panel builder (`buildProvenancePanel`) returning Storage XHTML `{info}` macro (F-1).
- Pipeline injection of panel into rendered Storage body, gated by `provenance.visiblePanel` configuration (F-2).
- Content-hash canonicalization to exclude timestamp/marker block from hash computation (F-3).
- Full enrichment of `marksync.metadata` content property with all required fields including `sourceBranch`, `commitCount`, `trimMarker` (F-4).
- Direct-edit classification predicate (`classifyVersion`) based on `version.message` prefix (F-5).
- Privacy enforcement: commit subjects stored only in local output, not in Confluence (ADR-0010).
- Footer placement of panel (end of body) by default.
- Configurable disable of visible panel via `provenance.visiblePanel: false`.
- Unit, integration, and golden fixture tests covering all acceptance criteria.

### Out of Scope

- [OUT] Commit-by-commit history in Confluence (deferred per ADR-0010 C-5).
- [OUT] Reverse-sync provenance (MS-0005+).
- [OUT] GUI or editor for provenance.
- [OUT] Modifying ADR-0006 drift-detection safety or no-silent-overwrite behavior.
- [OUT] Storing commit subjects in Confluence (`version.message` or `marksync.metadata` property).
- [OUT] Provenance panel customization beyond minimal `{info}` macro.
- [OUT] Panel placement other than footer (end of body).
- [OUT] E2E/live-sandbox tests (deferred to E5-S1 per MS2-E5-S1).

### Constraints

- **Privacy (hard constraint from ADR-0010):** Commit subjects are NEVER stored in Confluence (`version.message` or `marksync.metadata` property). Only `commitCount` and `trimMarker` are stored remotely. Full list appears only in local plan/apply output.
- **No schema-version/macro-id:** Panel format omits `schema-version` and `macro-id` attributes per spike rules.
- **Backward compatibility:** New property fields must be optional to avoid breaking existing `PageBinding` objects in locks.
- **Test tier limits:** E2E tests are deferred to E5-S1; this story uses unit, integration, and golden fixture tests only.

### Risks

- **RSK-1:** Panel bloats small pages. Mitigated by minimal `{info}` macro; configurable disable via `provenance.visiblePanel: false`. Residual: LOW.
- **RSK-2:** Panel placement disrupts content. Mitigated by footer placement (end of body). Residual: LOW.
- **RSK-3:** Timestamp normalization misses edge cases. Mitigated by golden fixture tests covering panel with timestamps; canonicalizer strips known marker block before hashing. Residual: LOW.
- **RSK-4:** Privacy violation if commit subjects leak to Confluence. Mitigated by explicit test assertions (TC-PROV-003, TC-PROV-005) enforcing no `subjects` field; ADR-0010 hard constraint. Residual: LOW.
- **RSK-5:** Lock schema migration for existing `PageBinding` objects missing new optional fields. Mitigated by making new fields optional in JSON Schema and TypeScript types. Residual: LOW.

### Success Metrics

| Metric | Target |
|--------|--------|
| Managed pages with valid visible provenance panel | 100% |
| Managed pages with complete `marksync.metadata` property | 100% |
| Direct-edit classification accuracy | 100% |
| False drift from timestamp-only updates | 0% |
| Commit subjects in Confluence (`version.message` or property) | 0% |
| Test coverage (unit + integration + golden) | All ACs covered |

## Phases

### Phase 1: Extend provenance.ts with panel builder and classifier

**Goal**: Implement `buildProvenancePanel` and `classifyVersion` functions with unit tests.

**Tasks**:

- [ ] **1.1** Extend `ProvenanceInput` interface in `src/infra/confluence/provenance.ts` to include `sourceBranch` field (currently has `headCommit`, `commitCount`, `subjects`).
- [ ] **1.2** Implement `buildProvenancePanel(input: ProvenanceInput): string` function that returns Storage XHTML `{info}` macro showing source path, Git revision (head commit), branch, and last-sync timestamp. Format: `<ac:structured-macro ac:name="info"><ac:rich-text-body>…</ac:rich-text-body></ac:structured-macro>`. Omit `schema-version` and `macro-id` per spike rules. Place stable marker class/comment for canonicalizer to locate.
- [ ] **1.3** Implement `classifyVersion(version: { message?: string }): "marksync" | "direct"` predicate. Returns `"marksync"` if `version.message` starts with `PROVENANCE_PREFIX` ("marksync git"), otherwise `"direct"`. Handle edge cases: empty/undefined message, case sensitivity.
- [ ] **1.4** Create `tests/unit/confluence/provenance.test.ts` (already exists; extend it) with unit tests for:
  - `buildProvenancePanel`: valid Storage XHTML output, all fields present, no schema-version/macro-id, golden snapshot.
  - `classifyVersion`: returns "marksync" for prefix, "direct" for no prefix, edge cases (empty message, case sensitivity, whitespace).
  - Property schema validation: all required fields present, NO `subjects` field (privacy).
- [ ] **1.5** Create golden fixture file `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` and test file `tests/golden/markdown/provenance-panel.test.ts` using `bun:test` `toMatchSnapshot` for byte-stable panel output.

**Acceptance Criteria**:

- Must: `buildProvenancePanel` returns valid Storage XHTML `{info}` macro with all four fields (source path, Git revision, branch, timestamp).
- Must: Panel omits `schema-version` and `macro-id` attributes.
- Must: Panel includes stable marker class/comment for canonicalizer to locate.
- Must: `classifyVersion` correctly identifies MarkSync-authored versions vs direct edits.
- Must: All unit tests pass (TC-PROV-001, TC-PROV-003, TC-PROV-008, TC-PROV-009, TC-PROV-010).
- Must: Golden snapshot matches byte-stable output across Bun versions.

**Affected code areas**:

- `src/infra/confluence/provenance.ts` (extended: new `buildProvenancePanel`, `classifyVersion`, extended `ProvenanceInput`)
- `tests/unit/confluence/provenance.test.ts` (new tests for panel builder and classifier)
- `tests/golden/markdown/provenance-panel.test.ts` (new golden fixture test)
- `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` (new golden fixture file)

**System docs to update**:

- none (no system spec changes in this phase)

**Tests**:

- Unit tests for `buildProvenancePanel` output format (TC-PROV-001)
- Unit tests for `classifyVersion` predicate (TC-PROV-008, TC-PROV-009)
- Unit tests for property schema validation and privacy (TC-PROV-003)
- Unit tests for edge cases (TC-PROV-010)
- Golden fixture test for panel XHTML output (TC-PROV-001)

**Completion signal**: `feat(provenance): add buildProvenancePanel and classifyVersion functions`

---

### Phase 2: Extend types and lock schema for new provenance fields

**Goal**: Extend TypeScript types and JSON schema to support new optional provenance fields.

**Tasks**:

- [ ] **2.1** Extend `MetadataProperty` interface in `src/domain/state/reconcile.ts` to add optional `sourceBranch?: string`, `commitCount?: number`, `trimMarker?: boolean` fields. Keep existing fields required.
- [ ] **2.2** Extend `PageBinding` interface in `src/domain/binding/page-binding.ts` to add optional `sourceBranch?: string`, `commitCount?: number`, `trimMarker?: boolean` fields. Update `isPageBinding` type guard to handle these as optional (not required for old bindings).
- [ ] **2.3** Update `src/domain/config/lock-schema.json` to add optional `sourceBranch`, `commitCount`, `trimMarker` fields to the `pageBinding` definition (same names as TypeScript types). Keep them optional to maintain backward compatibility with existing lock files.
- [ ] **2.4** Add unit tests to `tests/unit/domain/binding/page-binding.test.ts` to verify that `isPageBinding` accepts both old bindings (without new fields) and new bindings (with new fields).

**Acceptance Criteria**:

- Must: `MetadataProperty` has all 13 required fields plus 3 optional new fields (`sourceBranch`, `commitCount`, `trimMarker`).
- Must: `PageBinding` has all existing fields plus 3 optional new fields.
- Must: Lock schema JSON accepts both old and new binding shapes (backward compatible).
- Must: `isPageBinding` type guard accepts both old and new bindings.
- Must: All type-checking and schema validation tests pass.

**Affected code areas**:

- `src/domain/state/reconcile.ts` (extended `MetadataProperty`)
- `src/domain/binding/page-binding.ts` (extended `PageBinding`, updated `isPageBinding`)
- `src/domain/config/lock-schema.json` (added optional fields)

**System docs to update**:

- none (lock schema is code, not user-facing documentation)

**Tests**:

- Unit tests for `isPageBinding` with old and new binding shapes
- Schema validation tests for backward compatibility

**Completion signal**: `feat(provenance): extend types and lock schema for new provenance fields`

---

### Phase 3: Enrich marksync.metadata property with complete provenance

**Goal**: Populate `marksync.metadata` content property with all required fields including `sourceBranch`, `commitCount`, `trimMarker`, enforcing privacy (no commit subjects).

**Tasks**:

- [ ] **3.1** Locate the `bindingToProperty` function in `src/app/push-flow.ts` (around line 545). Extend it to include `sourceBranch`, `commitCount`, and `trimMarker` in the returned `MetadataProperty` object.
- [ ] **3.2** Ensure `plan.provenance` object carries `sourceBranch` field. The `git.currentBranch()` port is already called for the branch gate (around line 144); reuse that result in the provenance assembly (around line 400).
- [ ] **3.3** Ensure `plan.provenance` carries `commitCount` and `trimMarker` (already in `ProvenanceInput` from the plan). Map these to the property fields.
- [ ] **3.4** Add privacy assertion in `bindingToProperty`: verify that the property JSON does NOT contain a `subjects` field or any commit subject strings (ADR-0010 enforcement). This can be a runtime check in tests or a comment assertion.
- [ ] **3.5** Update `reconcileWithProperty` in `src/domain/state/reconcile.ts` to handle the new optional fields gracefully (currently only checks `sourceCommit` mismatch; no change needed for new fields since they are metadata, not cross-check criteria per AC-F5-1).
- [ ] **3.6** Add unit tests to `tests/unit/app/push-flow.test.ts` (or create if not exists) for `bindingToProperty`:
  - Property contains all 13 required fields.
  - Property contains `sourceBranch`, `commitCount`, `trimMarker` when provided.
  - Property does NOT contain `subjects` field or commit subject strings (privacy).

**Acceptance Criteria**:

- Must: `marksync.metadata` property contains all required fields: `schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker`.
- Must: Property does NOT contain `subjects` field or any commit subject strings (AC-F4-2, NFR-PRIV-1, ADR-0010).
- Must: `sourceBranch` is populated from `git.currentBranch()` result.
- Must: `commitCount` and `trimMarker` are populated from `plan.provenance`.
- Must: All privacy unit tests pass (TC-PROV-003, TC-PROV-005).

**Affected code areas**:

- `src/app/push-flow.ts` (updated `bindingToProperty`, provenance assembly)
- `src/domain/state/reconcile.ts` (updated `reconcileWithProperty` documentation)
- `tests/unit/app/push-flow.test.ts` (new tests for property enrichment and privacy)

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Unit tests for property schema validation (TC-PROV-003)
- Privacy unit tests ensuring no `subjects` field (TC-PROV-003, TC-PROV-005)

**Completion signal**: `feat(provenance): enrich marksync.metadata property with complete provenance`

---

### Phase 4: Canonicalizer timestamp normalization for false-drift prevention

**Goal**: Extend canonicalizer to strip provenance panel timestamp marker before computing content hash, preventing false drift from timestamp-only updates.

**Tasks**:

- [ ] **4.1** Implement timestamp normalization in `src/domain/render/canonicalize.ts`. Add a new exported function `canonicalizeForHashComparison(hast: Root): CanonicalHast` that:
  - Calls existing `canonicalize` to get position-free, property-sorted clone.
  - Strips the timestamp/marker block from the provenance panel before returning.
  - The stable marker class/comment from Phase 1.2 is used to locate the timestamp block.
  - Ensures two bodies with identical content but different timestamps produce the same canonical hash.
- [ ] **4.2** Update `contentHash` function or create a new function `contentHashForComparison(hast: Root): string` that uses `canonicalizeForHashComparison` instead of `canonicalize` for drift detection purposes.
- [ ] **4.3** Add unit tests to `tests/unit/render/canonicalize.test.ts` (already exists; extend it) for:
  - Timestamp normalization: two bodies with identical content but different timestamps produce the same hash.
  - Panel body itself is still written (canonicalize returns it), but hash comparison normalizes it out.
  - Edge cases: panel at different positions, missing panel, malformed panel.

**Acceptance Criteria**:

- Must: Two Storage bodies with identical content but different timestamps produce the same canonical hash (AC-F3-1, NFR-PERF-4).
- Must: Timestamp normalization does NOT affect the actual body written to Confluence (only the hash comparison).
- Must: Canonicalizer correctly identifies and strips the timestamp marker block using the stable marker from Phase 1.2.
- Must: All timestamp normalization unit tests pass (TC-PROV-006).

**Affected code areas**:

- `src/domain/render/canonicalize.ts` (added `canonicalizeForHashComparison`, `contentHashForComparison`)
- `tests/unit/render/canonicalize.test.ts` (extended with timestamp normalization tests)

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Unit tests for timestamp normalization (TC-PROV-006)
- Integration tests for idempotent sync (deferred to Phase 5)

**Completion signal**: `feat(provenance): add timestamp normalization to prevent false drift`

---

### Phase 5: Pipeline injection and integration tests

**Goal**: Wire the provenance panel into the markdown→Storage pipeline, gated by `config.provenance.visiblePanel`, and validate with integration tests.

**Tasks**:

- [ ] **5.1** Locate the markdown→Storage pipeline assembly point in `src/app/push-flow.ts` where the rendered Storage body is prepared for write (after rendering, before Confluence API call).
- [ ] **5.2** Add conditional panel injection: if `config.provenance.visiblePanel` is `true` (default), call `buildProvenancePanel(plan.provenance)` and append the returned Storage XHTML to the end of the rendered body. Panel becomes part of the written body.
- [ ] **5.3** Ensure the content hash computation for drift detection uses the timestamp-normalized version from Phase 4.2 (`contentHashForComparison`), not the raw body with timestamp.
- [ ] **5.4** Update the property write step to use the enriched `MetadataProperty` from Phase 3 (all 13 fields + 3 optional fields).
- [ ] **5.5** Add unit tests to `tests/unit/push-flow.test.ts` (create if not exists) for:
  - Panel injection when `provenance.visiblePanel: true` (TC-PROV-002).
  - Panel NOT injected when `provenance.visiblePanel: false` (TC-PROV-002).
  - Body matches original when panel disabled.
- [ ] **5.6** Create integration tests in `tests/integration/push-flow.test.ts` using `Bun.serve()` mock for Confluence API:
  - Full apply populates panel and property (TC-PROV-004).
  - Second sync preserves privacy (no subjects in property) (TC-PROV-005).
  - Idempotent sync: identical content at different times returns `NO_CHANGE` (TC-PROV-007).
  - Zero writes to Confluence on idempotent sync.
  - Page version carries `marksync:` prefix for classification.
- [ ] **5.7** Update golden fixtures if the panel output changes (review in PR).

**Acceptance Criteria**:

- Must: Panel is appended to rendered Storage body when `provenance.visiblePanel: true` (AC-F1-1).
- Must: Panel is NOT appended when `provenance.visiblePanel: false` (AC-F1-2).
- Must: Content hash comparison uses timestamp-normalized version (no false drift from timestamp updates).
- Must: `marksync.metadata` property is fully populated with all required fields (AC-F4-1).
- Must: Property contains NO commit subjects (AC-F4-2, NFR-PRIV-1, ADR-0010).
- Must: Idempotent sync with identical content returns `NO_CHANGE` (AC-F3-1, NFR-PERF-4).
- Must: All integration tests pass (TC-PROV-004, TC-PROV-005, TC-PROV-007).
- Must: `bun run check` passes all tests (unit + integration + golden).

**Affected code areas**:

- `src/app/push-flow.ts` (panel injection, timestamp-normalized hash usage, property write)
- `tests/unit/push-flow.test.ts` (new tests for panel injection gate)
- `tests/integration/push-flow.test.ts` (new integration tests for full apply, privacy, idempotency)
- `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` (may update)

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Unit tests for panel injection gate (TC-PROV-002)
- Integration tests for full apply (TC-PROV-004)
- Integration tests for privacy preservation (TC-PROV-005)
- Integration tests for idempotent sync (TC-PROV-007)
- Golden fixture tests for panel output (TC-PROV-001)

**Completion signal**: `feat(provenance): wire panel injection and integration tests`

---

### Phase 6: Code Review (Analysis)

**Goal**: Review the implementation against spec, test plan, coding rules, and NFRs.

**Tasks**:

- [ ] **6.1** Review `src/infra/confluence/provenance.ts` for self-documenting code, minimal comments (≤3 line header), no spec restatements, ADR references at load-bearing points only.
- [ ] **6.2** Review all test files for coverage of all ACs and TCs, proper mocking strategy (no over-mocking), and clear test descriptions.
- [ ] **6.3** Review privacy enforcement: verify no code paths write commit subjects to Confluence (`version.message` or `marksync.metadata` property).
- [ ] **6.4** Review timestamp canonicalization logic for correctness and edge-case handling.
- [ ] **6.5** Review type safety: all exported functions have annotated return types and parameter types, no `any` in production code.
- [ ] **6.6** Review backward compatibility: new property fields are optional, lock schema accepts old and new bindings.
- [ ] **6.7** Run `bun run check` (lint, format check, typecheck, test) and ensure all checks pass.
- [ ] **6.8** Review commit history for Conventional Commits format and meaningful messages.

**Acceptance Criteria**:

- Must: Code follows TypeScript conventions from `.ai/rules/typescript.md`.
- Must: Tests follow testing strategy from `.ai/rules/testing-strategy.md`.
- Must: All privacy constraints from ADR-0010 are enforced.
- Must: All ACs from spec are satisfied.
- Must: All TCs from test plan are covered.
- Must: `bun run check` passes with no errors or warnings.

**Affected code areas**:

- All code written in Phases 1-5
- All test files

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Manual code review against spec and test plan
- `bun run check` (full suite)

**Completion signal**: No commit (review phase only)

---

### Phase 7: Finalize and Release

**Goal**: Version bump, spec reconciliation, and final verification.

**Tasks**:

- [ ] **7.1** Update version in `package.json` (minor version bump per `version_impact: minor` from spec).
- [ ] **7.2** Reconcile spec: verify that all deliverables in spec are implemented and all open questions are resolved (spec §14: "None. All open questions were CEO-resolved").
- [ ] **7.3** Verify all decisions in spec §15 are reflected in implementation (panel format, footer placement, timestamp exclusion, privacy enforcement, prefix-based classification).
- [ ] **7.4** Final test run: `bun run check` (full suite including unit, integration, golden fixtures).
- [ ] **7.5** Update any relevant system docs if implementation diverged from spec (none expected per spec completeness).

**Acceptance Criteria**:

- Must: Version in `package.json` bumped to next minor version.
- Must: All spec deliverables implemented.
- Must: All spec decisions reflected in code.
- Must: `bun run check` passes all tests.
- Must: No spec-reconciliation items pending.

**Affected code areas**:

- `package.json` (version bump)

**System docs to update**:

- none (spec is source of truth, implementation matches spec)

**Tests**:

- `bun run check` (full suite)

**Completion signal**: `chore(release): bump version to <next-minor> for GH-27 provenance feature`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-PROV-001 | Panel builder generates valid Storage XHTML with all fields | 1, 5 | AC-F1-1, NFR-A11Y-3 |
| TC-PROV-002 | Panel not injected when `provenance.visiblePanel: false` | 5 | AC-F1-2 |
| TC-PROV-003 | Property schema validates all required fields, excludes commit subjects | 1, 3 | AC-F4-1, AC-F4-2, NFR-PRIV-1 |
| TC-PROV-004 | Integration: full apply populates panel and property | 5 | AC-F1-1, AC-F4-1, AC-INT-1 |
| TC-PROV-005 | Integration: second sync preserves privacy (no subjects in property) | 5 | AC-F4-2, AC-INT-1, NFR-PRIV-1 |
| TC-PROV-006 | Canonicalizer strips timestamp from body before hash | 4 | AC-F3-1, NFR-PERF-4 |
| TC-PROV-007 | Integration: idempotent sync returns NO_CHANGE (same content, different time) | 5 | AC-F3-1, NFR-PERF-4 |
| TC-PROV-008 | `classifyVersion` returns "marksync" for `marksync:` prefix | 1 | AC-F5-1, NFR-REL-9 |
| TC-PROV-009 | `classifyVersion` returns "direct" for no prefix (edge cases) | 1 | AC-F5-2, NFR-REL-9 |
| TC-PROV-010 | Panel builder handles edge cases (empty message, case sensitivity) | 1 | F-1, robustness |

---

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-27-spec.md | Spec |
| Test plan | ./chg-GH-27-test-plan.md | Test Plan |
| Story file | `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S3--provenance.md` | Story |
| Privacy decision (ADR-0010) | `doc/decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md` | ADR |
| Coding rules (TypeScript) | `.ai/rules/typescript.md` | Coding Standards |
| Testing strategy | `.ai/rules/testing-strategy.md` | Test Standards |

---

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Plan Writer | Initial plan for GH-27 provenance feature |

---

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|