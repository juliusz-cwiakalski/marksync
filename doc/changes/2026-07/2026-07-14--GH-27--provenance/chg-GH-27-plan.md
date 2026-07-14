---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-27-provenance
status: Updated
created: 2026-07-14T00:00:00Z
last_updated: 2026-07-14T12:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, provenance, metadata, accessibility]
links:
  change_spec: ./chg-GH-27-spec.md
summary: "Provenance infrastructure: visible panel/footer on managed pages with complete marksync.metadata property enrichment and direct-edit classification, enforcing privacy via ADR-0010 and preventing false drift through panel exclusion from HAST hash comparison."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-27: [MS2-E4-S3] Provenance

## Context and Goals

This plan delivers provenance infrastructure for the safe publish pipeline (MS-0002). Every managed Confluence page will carry a visible provenance panel showing source path, Git revision, branch, and last-sync timestamp (readable by non-technical stakeholders per NFR-A11Y-3). The `marksync.metadata` content property will be fully populated with all required fields, and a programmatic predicate will classify Confluence page versions as MarkSync-authored or directly edited (NFR-REL-9). The visible panel is gated by `config.provenance.visiblePanel` (default true) and is appended post-render as a Storage string; since the drift classifier compares HAST hashes (`local.canonicalHash` vs `base.renderedBodyHash`) which never include the panel, timestamp updates do not trigger false drift (NFR-PERF-4). Privacy is enforced by storing only commit count and truncation marker in Confluence, never full commit subjects (ADR-0010).

**Key goals:**
- G-1: Every managed page renders a visible provenance panel with source path, Git revision, branch, and last-sync timestamp (NFR-A11Y-3).
- G-2: The `marksync.metadata` content property is fully populated with all required fields, including `sourceBranch`, `commitCount`, and `trimMarker`.
- G-3: A programmatic predicate classifies Confluence page versions as MarkSync-authored or direct edit based on `version.message` prefix (NFR-REL-9).
- G-4: Updating the last-sync timestamp does not trigger false drift—the panel is appended post-render as a Storage string; the drift classifier compares HAST hashes which exclude the panel by construction.
- G-5: Privacy is enforced—commit subjects are not stored in the `marksync.metadata` content property (only `commitCount` + `trimMarker` per ADR-0010).

## Scope

### In Scope

- Visible provenance panel builder (`buildProvenancePanel`) returning Storage XHTML `{info}` macro (F-1).
- Pipeline injection of panel into rendered Storage body, gated by `provenance.visiblePanel` configuration (F-2). Panel is appended post-render as a Storage string; `renderedBodyHash` is computed from HAST before panel append.
- Full enrichment of `marksync.metadata` content property with all required fields including `sourceBranch`, `commitCount`, `trimMarker` (F-4).
- Direct-edit classification predicate (`classifyVersion`) based on `version.message` prefix matching `PROVENANCE_PREFIX = "marksync git"` (F-5).
- Privacy enforcement: commit subjects stored only in local output, not in Confluence (ADR-0010).
- Footer placement of panel (end of body) by default.
- Configurable disable of visible panel via `provenance.visiblePanel: false` (default true).
- Unit, integration, and golden fixture tests covering all acceptance criteria.

### Out of Scope

- [OUT] Commit-by-commit history in Confluence (deferred per ADR-0010 C-5).
- [OUT] Reverse-sync provenance (MS-0005+).
- [OUT] GUI or editor for provenance.
- [OUT] Modifying ADR-0006 drift-detection safety or no-silent-overwrite behavior.
- [OUT] Storing commit subjects in `marksync.metadata` content property (per ADR-0010 privacy constraint).
- [OUT] Provenance panel customization beyond minimal `{info}` macro.
- [OUT] Panel placement other than footer (end of body).
- [OUT] E2E/live-sandbox tests (deferred to E5-S1 per MS2-E5-S1).

### Constraints

- **Privacy (hard constraint from ADR-0010):** Commit subjects are NEVER stored in `marksync.metadata` content property. Only `commitCount` and `trimMarker` are stored remotely. Full list appears only in local plan/apply output.
- **No schema-version/macro-id:** Panel format omits `schema-version` and `macro-id` attributes per spike rules.
- **Backward compatibility:** New property fields and lock fields must be optional to avoid breaking existing `PageBinding` objects in locks.
- **Test tier limits:** E2E tests are deferred to E5-S1; this story uses unit, integration, and golden fixture tests only.
- **Panel injection layer:** Panel is appended post-render as a Storage XHTML string (after `renderBody`/`renderStorage` produces the body string, before the body is passed to the create/update API call). `renderedBodyHash` is computed from HAST before panel append, ensuring false drift prevention by construction.

### Risks

- **RSK-1:** Panel bloats small pages. Mitigated by minimal `{info}` macro; configurable disable via `provenance.visiblePanel: false`. Residual: LOW.
- **RSK-2:** Panel placement disrupts content. Mitigated by footer placement (end of body). Residual: LOW.
- **RSK-3:** False drift from timestamp variance. Architecturally impossible: panel is appended post-render; classifier compares HAST hashes which never include panel. Residual: LOW.
- **RSK-4:** Privacy violation if commit subjects leak to Confluence. Mitigated by explicit test assertions (TC-PROV-003, TC-PROV-005) enforcing no `subjects` field; ADR-0010 hard constraint. Residual: LOW.
- **RSK-5:** Lock schema migration for existing `PageBinding` objects missing new optional fields. Mitigated by making new fields optional in JSON Schema and TypeScript types. Residual: LOW.

### Success Metrics

| Metric | Target |
|--------|--------|
| Managed pages with valid visible provenance panel | 100% |
| Managed pages with complete `marksync.metadata` property | 100% |
| Direct-edit classification accuracy | 100% |
| False drift from timestamp-only updates | 0% |
| Commit subjects in `marksync.metadata` property | 0% |
| Test coverage (unit + integration + golden) | All ACs covered |

## Phases

### Phase 1: Extend provenance.ts with panel builder and classifier

**Goal**: Implement `buildProvenancePanel` and `classifyVersion` functions with unit tests.

**Tasks**:

- [ ] **1.1** Extend `ProvenanceInput` interface in `src/infra/confluence/provenance.ts` to include `sourceBranch` field (currently has `headCommit`, `commitCount`, `subjects`).
- [ ] **1.2** Define `ProvenancePanelMeta` interface for `buildProvenancePanel` with fields: `sourcePath: string` (from PlanEntry/binding), `sourceBranch: string` (from plan.provenance), `headCommit: string` (from plan.provenance), `synchronizedAt: string` (ISO8601 timestamp generated at apply time).
- [ ] **1.3** Implement `buildProvenancePanel(meta: ProvenancePanelMeta): string` function that returns Storage XHTML `{info}` macro showing source path, Git revision (head commit), branch, and last-sync timestamp. Format: `<ac:structured-macro ac:name="info"><ac:rich-text-body>…</ac:rich-text-body></ac:structured-macro>`. Omit `schema-version` and `macro-id` per spike rules.
- [ ] **1.4** Implement `classifyVersion(version: { message?: string }): "marksync" | "direct"` predicate. Returns `"marksync"` if `version.message` starts with `PROVENANCE_PREFIX` ("marksync git"), otherwise `"direct"`. Handle edge cases: empty/undefined message, case sensitivity.
- [ ] **1.5** Create `tests/unit/confluence/provenance.test.ts` (already exists; extend it) with unit tests for:
  - `buildProvenancePanel`: valid Storage XHTML output, all fields present, no schema-version/macro-id.
  - `classifyVersion`: returns "marksync" for `marksync git` prefix, "direct" for no prefix, edge cases (empty message, case sensitivity, whitespace).
  - Property schema validation: all required fields present, NO `subjects` field (privacy).
- [ ] **1.6** Create golden fixture file `tests/golden/fixtures/markdown/provenance-panel.storage.xhtml` and test file `tests/golden/markdown/provenance-panel.test.ts` using `bun:test` `toMatchSnapshot` for byte-stable panel output.

**Acceptance Criteria**:

- Must: `buildProvenancePanel` returns valid Storage XHTML `{info}` macro with all four fields (source path, Git revision, branch, timestamp).
- Must: Panel omits `schema-version` and `macro-id` attributes.
- Must: `classifyVersion` correctly identifies MarkSync-authored versions vs direct edits using `marksync git` prefix.
- Must: All unit tests pass (TC-PROV-001, TC-PROV-003, TC-PROV-008, TC-PROV-009, TC-PROV-010).
- Must: Golden snapshot matches byte-stable output across Bun versions.

**Affected code areas**:

- `src/infra/confluence/provenance.ts` (extended: new `buildProvenancePanel`, `classifyVersion`, extended `ProvenanceInput`, new `ProvenancePanelMeta`)
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

- [ ] **2.1** Extend `MetadataProperty` interface in `src/domain/state/reconcile.ts` to add optional `sourceBranch?: string`, `commitCount?: number`, `trimMarker?: string` fields. Keep existing fields required. Note: Fields are optional in the type for backward-compatible reading of pre-GH-27 properties; Phase 3 always writes all 14 fields on new syncs per AC-F4-1.
- [ ] **2.2** Extend `PageBinding` interface in `src/domain/binding/page-binding.ts` to add optional `sourceBranch?: string`, `commitCount?: number`, `trimMarker?: string` fields. Update `PAGE_BINDING_STRING_KEYS` array to include these new field names (for backward-compatible reading).
- [ ] **2.3** Update `src/domain/config/lock-schema.json` to add optional `sourceBranch`, `commitCount`, `trimMarker` fields to the `pageBinding` definition (same names as TypeScript types). Keep them optional (not in `required` array) to maintain backward compatibility with existing lock files. The schema has `additionalProperties: false`, so these must be explicitly listed.
- [ ] **2.4** Add unit tests to `tests/unit/domain/binding/page-binding.test.ts` to verify that `isPageBinding` accepts both old bindings (without new fields) and new bindings (with new fields).

**Acceptance Criteria**:

- Must: `MetadataProperty` has all 14 fields (11 required + 3 optional: `sourceBranch`, `commitCount`, `trimMarker`).
- Must: `PageBinding` has all existing fields plus 3 optional new fields.
- Must: Lock schema JSON accepts both old and new binding shapes (backward compatible).
- Must: `isPageBinding` type guard accepts both old and new bindings.
- Must: All type-checking and schema validation tests pass.

**Affected code areas**:

- `src/domain/state/reconcile.ts` (extended `MetadataProperty`)
- `src/domain/binding/page-binding.ts` (extended `PageBinding`, updated `PAGE_BINDING_STRING_KEYS`, updated `isPageBinding`)
- `src/domain/config/lock-schema.json` (added optional fields to `pageBinding`)
- `tests/unit/domain/binding/page-binding.test.ts` (new tests for backward compatibility)

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

- [ ] **3.1** Locate the `bindingToProperty` function in `src/app/push-flow.ts` (around line 545). Extend it to include `sourceBranch`, `commitCount`, and `trimMarker` in the returned `MetadataProperty` object. All 14 fields are written on every managed page after this change.
- [ ] **3.2** Ensure `plan.provenance` object carries `sourceBranch` field. The `git.currentBranch()` port is already called for the branch gate in `computePlan` (around line 144); reuse that result in the provenance assembly (around line 400).
- [ ] **3.3** Ensure `plan.provenance` carries `commitCount` and `trimMarker` (already in `ProvenanceInput` from the plan). Map these to the property fields.
- [ ] **3.4** Add privacy assertion in `bindingToProperty`: verify that the property JSON does NOT contain a `subjects` field or any commit subject strings (ADR-0010 enforcement). This can be a runtime check in tests or a comment assertion.
- [ ] **3.5** Add unit tests to `tests/unit/app/push-flow.test.ts` (or create if not exists) for `bindingToProperty`:
  - Property contains all 14 required fields.
  - Property contains `sourceBranch`, `commitCount`, `trimMarker` when provided.
  - Property does NOT contain `subjects` field or commit subject strings (privacy).
  - Property fields are all written on every sync (not optional on write).

**Acceptance Criteria**:

- Must: `marksync.metadata` property contains all 14 fields: `schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker`.
- Must: All 14 fields are written on every managed page after this change (`trimMarker` is present only when truncation occurred, otherwise empty string or indicator value).
- Must: Property does NOT contain `subjects` field or any commit subject strings (AC-F4-2, ADR-0010).
- Must: `sourceBranch` is populated from `git.currentBranch()` result.
- Must: `commitCount` and `trimMarker` are populated from `plan.provenance`.
- Must: All privacy unit tests pass (TC-PROV-003, TC-PROV-005).

**Affected code areas**:

- `src/app/push-flow.ts` (updated `bindingToProperty`, provenance assembly in `computePlan`)
- `tests/unit/app/push-flow.test.ts` (new tests for property enrichment and privacy)

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Unit tests for property schema validation (TC-PROV-003)
- Privacy unit tests ensuring no `subjects` field (TC-PROV-003, TC-PROV-005)

**Completion signal**: `feat(provenance): enrich marksync.metadata property with complete provenance`

---

### Phase 4: Pipeline injection and integration tests

**Goal**: Wire the provenance panel into the markdown→Storage pipeline, gated by `config.provenance.visiblePanel`, and validate with integration tests.

**Tasks**:

- [ ] **4.1** In `computePlan` (around line 400), extend the `Plan` interface to include `visiblePanel: boolean` field. Store `config.provenance.visiblePanel` (default true if absent) on the plan object. This makes the flag available to `applyPlan` without threading the full config object.
- [ ] **4.2** Locate the markdown→Storage pipeline assembly point in `src/app/push-flow.ts` where the rendered Storage body is prepared for write (after rendering, before Confluence API call). This is in `processEntry` where `entry.renderedBody` is used.
- [ ] **4.3** Add conditional panel injection: if `plan.visiblePanel` is `true` (default), construct `ProvenancePanelMeta` with:
  - `sourcePath`: from `entry.sourcePath`
  - `sourceBranch`: from `plan.provenance.sourceBranch`
  - `headCommit`: from `plan.provenance.headCommit`
  - `synchronizedAt`: generated at apply time as `new Date().toISOString()` (per document, just before write)
  Call `buildProvenancePanel(meta)` and append the returned Storage XHTML to the end of the rendered body. Panel becomes part of the written body but is NOT in the HAST, so `renderedBodyHash` is unaffected.
- [ ] **4.4** Ensure the `renderedBodyHash` computation occurs BEFORE panel append (in the compute phase when `entry.renderedBody` is set). The hash is computed from HAST via `canonicalHash(hast)` and stored in `entry.hashes.renderedBodyHash`. Since the panel is appended post-render as a Storage string, the hash never includes the panel—false drift is architecturally impossible.
- [ ] **4.5** Update the property write step to use the enriched `MetadataProperty` from Phase 3 (all 14 fields).
- [ ] **4.6** Add unit tests to `tests/unit/push-flow.test.ts` (create if not exists) for:
  - Panel NOT injected when `plan.visiblePanel: false` (TC-PROV-002).
  - Body matches original when panel disabled.
  - Panel IS injected when `plan.visiblePanel: true` (integration test covers positive path).
- [ ] **4.7** Create integration tests in `tests/integration/push-flow.test.ts` using `Bun.serve()` mock for Confluence API:
  - Full apply populates panel and property (TC-PROV-004).
  - Second sync preserves privacy (no subjects in property) (TC-PROV-005).
  - Idempotent sync: identical content at different times returns `NO_CHANGE` (TC-PROV-007). Verify that `renderedBodyHash` is identical between syncs (panel excluded by construction).
  - Zero writes to Confluence on idempotent sync.
  - Page version carries `marksync git` prefix for classification.
- [ ] **4.8** Update golden fixtures if the panel output changes (review in PR).

**Acceptance Criteria**:

- Must: Panel is appended to rendered Storage body when `plan.visiblePanel: true` (AC-F1-1).
- Must: Panel is NOT appended when `plan.visiblePanel: false` (AC-F1-2).
- Must: `renderedBodyHash` is computed from HAST before panel append; panel never enters the hash.
- Must: Idempotent sync with identical content returns `NO_CHANGE` (AC-F3-1, NFR-PERF-4). False drift prevention is by construction (panel excluded from HAST hash).
- Must: `marksync.metadata` property is fully populated with all 14 fields (AC-F4-1).
- Must: Property contains NO commit subjects (AC-F4-2, ADR-0010).
- Must: All integration tests pass (TC-PROV-004, TC-PROV-005, TC-PROV-007).
- Must: `bun run check` passes all tests (unit + integration + golden).

**Affected code areas**:

- `src/app/push-flow.ts` (panel injection in `processEntry`, `Plan` interface extension with `visiblePanel`, provenance assembly in `computePlan` with `sourceBranch`)
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

### Phase 5: Code Review (Analysis)

**Goal**: Review the implementation against spec, test plan, coding rules, and NFRs.

**Tasks**:

- [ ] **5.1** Review `src/infra/confluence/provenance.ts` for self-documenting code, minimal comments (≤3 line header), no spec restatements, ADR references at load-bearing points only.
- [ ] **5.2** Review all test files for coverage of all ACs and TCs, proper mocking strategy (no over-mocking), and clear test descriptions.
- [ ] **5.3** Review privacy enforcement: verify no code paths write commit subjects to `marksync.metadata` property. Verify that `trimMarker` correctly indicates truncation state without exposing subjects.
- [ ] **5.4** Review panel injection architecture: verify that panel is appended post-render as a Storage string, that `renderedBodyHash` is computed from HAST before append, and that false drift prevention is by construction.
- [ ] **5.5** Review type safety: all exported functions have annotated return types and parameter types, no `any` in production code.
- [ ] **5.6** Review backward compatibility: new property fields and lock fields are optional, lock schema accepts old and new bindings.
- [ ] **5.7** Review `classifyVersion` implementation: verify it matches `PROVENANCE_PREFIX = "marksync git"` (not `marksync:`).
- [ ] **5.8** Run `bun run check` (lint, format check, typecheck, test) and ensure all checks pass.
- [ ] **5.9** Review commit history for Conventional Commits format and meaningful messages.

**Acceptance Criteria**:

- Must: Code follows TypeScript conventions from `.ai/rules/typescript.md`.
- Must: Tests follow testing strategy from `.ai/rules/testing-strategy.md`.
- Must: All privacy constraints from ADR-0010 are enforced.
- Must: All ACs from spec are satisfied.
- Must: All TCs from test plan are covered.
- Must: `bun run check` passes with no errors or warnings.
- Must: `classifyVersion` uses correct prefix `marksync git`.

**Affected code areas**:

- All code written in Phases 1-4
- All test files

**System docs to update**:

- none (implementation matches spec)

**Tests**:

- Manual code review against spec and test plan
- `bun run check` (full suite)

**Completion signal**: No commit (review phase only)

---

### Phase 6: Documentation and Spec Synchronization

**Goal**: Update system documentation to reflect the delivered provenance capabilities, and reconcile spec with implementation.

**Tasks**:

- [ ] **6.1** Update `doc/spec/features/feature-safe-publish.md` to expand the "Provenance" capability bullet (currently says only "visible panel/footer + machine content-property metadata"):
  - Describe the delivered panel format (Storage XHTML `{info}` macro, fields: source path, Git revision, branch, last-sync timestamp).
  - Document the full `marksync.metadata` schema (all 14 fields, with note that `trimMarker` is present only when truncation occurred).
  - Document the `classifyVersion` predicate (`marksync git` prefix matching).
  - Document the false-drift prevention mechanism (panel excluded from HAST hash by construction).
- [ ] **6.2** Reconcile spec: verify that all deliverables in spec are implemented and all open questions are resolved (spec §14: "None. All open questions were CEO-resolved").
- [ ] **6.3** Verify all decisions in spec §15 are reflected in implementation (panel format, footer placement, timestamp exclusion from hash by construction, privacy enforcement, prefix-based classification).
- [ ] **6.4** Review and update any ubiquitous-language or architecture-overview entries for new domain concepts if needed.

**Acceptance Criteria**:

- Must: `feature-safe-publish.md` accurately describes the delivered provenance capabilities.
- Must: All spec deliverables implemented.
- Must: All spec decisions reflected in code.
- Must: System documentation is consistent with implementation.

**Affected code areas**:

- `doc/spec/features/feature-safe-publish.md` (expanded Provenance section)
- Any other `doc/spec/**` sections affected by provenance changes

**System docs to update**:

- `doc/spec/features/feature-safe-publish.md`

**Tests**:

- Manual review of documentation completeness

**Completion signal**: `docs(spec): update feature-safe-publish.md with provenance capabilities`

---

### Phase 7: Finalize and Release

**Goal**: Version bump, final verification, and readiness for delivery.

**Tasks**:

- [ ] **7.1** Update version in `package.json` (minor version bump per `version_impact: minor` from spec).
- [ ] **7.2** Final test run: `bun run check` (full suite including unit, integration, golden fixtures).
- [ ] **7.3** Verify all findings from DoR iter-1 are addressed:
  - P2: Canonicalizer phase removed, panel excluded from HAST hash by construction ✓
  - P3: Config wired via `Plan.visiblePanel` ✓
  - P4: Panel input fields defined with `ProvenancePanelMeta`, lifecycle specified ✓
  - P6: Lock schema extended with OPTIONAL fields ✓
  - P7: System docs updated (feature-safe-publish.md) ✓
  - P11: Required vs optional fields articulated ✓
  - Prefix: `marksync git` used throughout ✓

**Acceptance Criteria**:

- Must: Version in `package.json` bumped to next minor version.
- Must: `bun run check` passes all tests (unit + integration + golden).
- Must: All DoR iter-1 findings addressed.
- Must: Implementation is ready for PR creation.

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
| TC-PROV-001 | Panel builder generates valid Storage XHTML with all fields | 1, 4 | AC-F1-1, NFR-A11Y-3 |
| TC-PROV-002 | Panel not injected when `plan.visiblePanel: false` | 4 | AC-F1-2 |
| TC-PROV-003 | Property schema validates all required fields, excludes commit subjects | 1, 3 | AC-F4-1, AC-F4-2, ADR-0010 |
| TC-PROV-004 | Integration: full apply populates panel and property | 4 | AC-F1-1, AC-F4-1, AC-INT-1 |
| TC-PROV-005 | Integration: second sync preserves privacy (no subjects in property) | 4 | AC-F4-2, AC-INT-1, ADR-0010 |
| TC-PROV-007 | Integration: idempotent sync returns NO_CHANGE (same content, different time) | 4 | AC-F3-1, NFR-PERF-4 |
| TC-PROV-008 | `classifyVersion` returns "marksync" for `marksync git` prefix | 1 | AC-F5-1, NFR-REL-9 |
| TC-PROV-009 | `classifyVersion` returns "direct" for no prefix (edge cases) | 1 | AC-F5-2, NFR-REL-9 |
| TC-PROV-010 | Panel builder handles edge cases (empty message, case sensitivity) | 1 | F-1, robustness |

**Note:** TC-PROV-006 (canonicalizer) was removed—the canonicalizer phase is dropped because false drift prevention is by construction (panel excluded from HAST hash).

---

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-27-spec.md | Spec |
| Test plan | ./chg-GH-27-test-plan.md | Test Plan |
| Readiness review | ./readiness-review/readiness-iter-1.md | DoR |
| Story file | `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S3--provenance.md` | Story |
| Privacy decision (ADR-0010) | `doc/decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md` | ADR |
| Coding rules (TypeScript) | `.ai/rules/typescript.md` | Coding Standards |
| Testing strategy | `.ai/rules/testing-strategy.md` | Test Standards |

---

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Plan Writer | Initial plan for GH-27 provenance feature |
| 1.1 | 2026-07-14 | Plan Writer | Remediation per DoR iter-1 findings: (P2) Dropped Phase 4 canonicalizer—panel excluded from HAST hash by construction; (P3) Added config wiring via `Plan.visiblePanel` field; (P4) Defined `ProvenancePanelMeta` with exact input fields and lifecycle; (P6) Updated lock schema task to use OPTIONAL fields; (P7) Added Phase 6 for system doc updates (feature-safe-publish.md); (P11) Articulated required vs optional fields; Fixed prefix to `marksync git` throughout; Updated test scenario table; Corrected field count from 13 to 14. |

---

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|