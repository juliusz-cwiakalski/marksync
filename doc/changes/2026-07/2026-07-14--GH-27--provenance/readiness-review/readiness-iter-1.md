# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-27
Date: 2026-07-14
Pause Required: no

## Facet Summary

- spec_completeness: FAIL
- ac_quality: FAIL
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

### 1. [critical] cross_artifact_consistency — classifyVersion prefix mismatch across spec, test-plan, plan, and source code

**Artifacts**: spec §5.1 F-5, §12, §17 AC-F5-1/AC-F5-2; test-plan TC-PROV-008, TC-PROV-009; plan Phase 1.3; source `src/infra/confluence/provenance.ts:9`

**Gap**: The actual `PROVENANCE_PREFIX` constant in `src/infra/confluence/provenance.ts` line 9 is `"marksync git"` (space, no colon). `formatVersionMessage` emits messages of the form `marksync git <sha> (<count>): <subj1>; <subj2>; …`. However:

- Spec AC-F5-1 says classifyVersion returns `"marksync"` when `version.message` starts with `marksync:` (colon).
- Spec F-5 says "if `version.message` contains the `marksync:` prefix."
- Spec §12 claims `formatVersionMessage` "already prefixes `version.message` with `marksync:`."
- Test-plan TC-PROV-008 uses test input `"marksync:squash commit=a1b2c3d source=docs/guide/api.md"` — a format never emitted by `formatVersionMessage`.
- Test-plan TC-PROV-009 tests `"MarkSync:squash…"` and `"marksync-squash…"` edge cases — irrelevant to the actual `marksync git` prefix.
- Plan Phase 1.3 CORRECTLY references `PROVENANCE_PREFIX ("marksync git")` — directly contradicting the spec and test-plan.

**Impact**: If `classifyVersion` is implemented per the spec (match `marksync:` prefix), it will NEVER classify a real MarkSync-authored version as `"marksync"` — every MarkSync version would be misclassified as `"direct"`. If implemented per the plan (match `marksync git`), the test-plan's test data in TC-PROV-008/009 would FAIL because the inputs don't start with `marksync git`. Either way, NFR-REL-9 (direct-edit detection) is broken.

**Suggested remediation target phase**: specification + test_planning

**Suggested fix**: Align all artifacts to the actual prefix. Spec AC-F5-1/AC-F5-2, F-5, §12 must use `marksync git` (the real `PROVENANCE_PREFIX`), not `marksync:`. Test-plan TC-PROV-008/009 must use test inputs matching real `formatVersionMessage` output (e.g., `"marksync git a1b2c3d (5): subj1; subj2"`).

---

### 2. [critical] cross_artifact_consistency — false-drift mechanism: architectural contradiction between canonicalizer (HAST-layer) and panel injection (string-layer)

**Artifacts**: spec F-3, §5.1 F-3, §6 Flow 2; story deliverable 2; plan Phase 4.1, Phase 5.2; source `src/domain/state/classifier.ts:45-46`, `src/domain/render/canonicalize.ts`

**Gap**: The spec and story say "The panel is part of the rendered body hash EXCEPT it's excluded from the content-hash comparison" (story deliverable 2, spec F-3). This implies the panel IS in the hash and a canonicalizer must strip the timestamp for comparison. But:

- Plan Phase 5.2 injects the panel by appending a Storage XHTML **string** to the rendered body (post-render): "call `buildProvenancePanel(plan.provenance)` and append the returned Storage XHTML to the end of the rendered body."
- Plan Phase 4.1 creates `canonicalizeForHashComparison(hast: Root): CanonicalHast` that operates on **HAST** — but the panel is never in the HAST (it's appended post-render as a string).
- In the actual classifier (`classifier.ts:45-46`), `local.canonicalHash` (HAST hash, no panel) is compared against `base.renderedBodyHash` (previous sync's HAST hash, no panel). A post-render string append CANNOT affect this comparison, so false drift from the timestamp is architecturally impossible with the plan's injection approach.

**Impact**: If delivery follows the plan (post-render append), Phase 4's canonicalizer is dead code and AC-F3-1 passes trivially (no false drift possible). If delivery follows the spec (panel in the hash), Phase 5.2's approach is wrong — the panel must be injected into the HAST before hashing. The coder cannot resolve this ambiguity without a decision. The entire false-drift sub-feature is architecturally undefined.

**Suggested remediation target phase**: specification + delivery_planning

**Suggested fix**: Make a binding decision: either (a) panel is appended post-render only (not in hash) — delete Phase 4, simplify AC-F3-1 to "content hash excludes panel by construction"; or (b) panel is injected into HAST before hashing — rewrite Phase 5.2 to inject at HAST layer, keep Phase 4 canonicalizer. Document the chosen architecture in the spec.

---

### 3. [major] plan_coverage — `config.provenance.visiblePanel` not available at the panel injection point

**Artifacts**: plan Phase 5.2; source `src/app/push-flow.ts:757` (`applyPlan` signature), line 830 (`processEntry` signature)

**Gap**: The plan says panel injection checks `config.provenance.visiblePanel`. But `applyPlan(plan, target, lock, opts)` and `processEntry(entry, target, lock, targetId, journal, message, cwd, operationId, headSha, stalePlanMinutes)` do NOT receive `config`. The `config` parameter is only on `computePlan(config, ...)`. The plan provides no approach for threading the config or the boolean flag to the injection site.

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: Specify the wiring: either thread `config` (or just `visiblePanel: boolean`) into `applyPlan`/`processEntry`, or add a `visiblePanel` field to the `Plan` interface (set in `computePlan` which has config), or move panel injection into `computePlan`.

---

### 4. [major] plan_coverage — `ProvenanceInput` lacks fields required by `buildProvenancePanel`

**Artifacts**: plan Phase 1.1, Phase 1.2; test-plan TC-PROV-001 preconditions; source `src/infra/confluence/provenance.ts:13-20`

**Gap**: `buildProvenancePanel` must display source path, Git revision, branch, and last-sync timestamp. But the current `ProvenanceInput` has only `{ headCommit, commitCount?, subjects? }`. Plan Phase 1.1 adds `sourceBranch` but does NOT add `sourcePath` or `synchronizedAt`. TC-PROV-001 preconditions explicitly list `sourcePath`, `synchronizedAt` as inputs. Furthermore, `synchronizedAt` is generated at apply time (`new Date().toISOString()` in `finalizeSuccessfulUpdate`, line 709), not at plan-computation time — the plan does not address when or where the panel timestamp is generated and how it reaches `buildProvenancePanel`.

**Suggested remediation target phase**: delivery_planning + test_planning

**Suggested fix**: Either extend `ProvenanceInput` with `sourcePath` and `synchronizedAt` (and specify how they're populated — `sourcePath` from discovery, `synchronizedAt` at apply time), or define a separate input type for `buildProvenancePanel`. Specify the lifecycle of the timestamp value.

---

### 5. [major] system_spec_consistency — NFR-PRIV-1 ID collision: change spec redefines an existing system NFR with different semantics

**Artifacts**: spec §9 NFR table (line 176); system spec `doc/spec/nonfunctional.md:92`

**Gap**: The system spec defines `NFR-PRIV-1` as "Local-first | No hosted backend for core value | A-VIA-1; north star." Every prior change spec (GH-21, GH-22, GH-23, GH-24) correctly references NFR-PRIV-1 with this meaning. The GH-27 spec redefines NFR-PRIV-1 as "Local-first provenance | Commit subjects appear only in local plan/apply output, never in Confluence `version.message` or `marksync.metadata` property" — a completely different requirement under the same ID.

Additionally, the change spec's NFR-PRIV-1 claim "never in Confluence `version.message`" directly contradicts ADR-0010 C-2 ("Squashed mode must record the target/head commit plus a compact summary of included commits — commit ID plus subject at minimum") and the actual `formatVersionMessage` code, which includes commit subjects in `version.message`. The privacy constraint from ADR-0010 applies to the `marksync.metadata` content property (count + marker only), NOT to `version.message` (which intentionally carries a compact subject summary).

**Suggested remediation target phase**: specification

**Suggested fix**: Do not reuse NFR-PRIV-1 with different semantics. Either reference ADR-0010's privacy constraint directly, or propose a new NFR ID (e.g., NFR-PRIV-4) for "commit subjects excluded from marksync.metadata property." Correct the spec's §9, §20, and success metrics to state: "commit subjects are not stored in the marksync.metadata content property; a compact subject summary appears in version.message per ADR-0010 C-2."

---

### 6. [major] cross_artifact_consistency — lock format: spec says "no changes," plan changes lock-schema.json

**Artifacts**: spec §8.5 (line 167); spec §16 (affected components — lock-schema.json absent); plan Phase 2.2, Phase 2.3; source `src/domain/config/lock-schema.json:38` (`additionalProperties: false`)

**Gap**: Spec §8.5 states "No changes to ADR-0006 drift detection, concurrency controls, or lock format." But plan Phase 2.3 updates `lock-schema.json` to add `sourceBranch`, `commitCount`, `trimMarker` to the `pageBinding` definition. The current schema has `additionalProperties: false` — so adding these fields to the TypeScript `PageBinding` type without updating the JSON schema would cause lock-file validation rejection. The spec and plan are in direct contradiction about whether the lock format changes.

**Suggested remediation target phase**: specification

**Suggested fix**: Either (a) acknowledge in spec §8.5 and §16 that lock-schema.json is extended with optional fields (and justify why they're needed in the lock at all — they're metadata, not drift-detection inputs), or (b) remove the lock schema change from the plan and store `sourceBranch`/`commitCount`/`trimMarker` only in `marksync.metadata` (the content property), not in the local lock.

---

### 7. [major] plan_doc_update_coverage — no system documentation updates listed in any phase

**Artifacts**: plan Phases 1-7 (every "System docs to update" section says "none"); feature spec `doc/spec/features/feature-safe-publish.md:109-110`

**Gap**: Every plan phase declares "System docs to update: none." But this change adds two new exported functions (`buildProvenancePanel`, `classifyVersion`), extends the `marksync.metadata` schema, adds a visible panel capability, and extends the lock schema. The feature spec (`feature-safe-publish.md` §3.1) already lists "Provenance: visible panel/footer" as a capability — the system_spec_update phase (lifecycle phase 7) needs specific guidance on what to update.

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: List concrete doc updates: (a) `doc/spec/features/feature-safe-publish.md` — detail the panel format, classifyVersion predicate, enriched metadata schema; (b) any ubiquitous-language or architecture-overview entries for new domain concepts; (c) `doc/spec/nonfunctional.md` if a new privacy NFR is proposed (see Finding 5).

---

### 8. [minor] spec_completeness — `trimMarker` type ambiguity: glossary says string, all other artifacts say boolean

**Artifacts**: spec §23 glossary (line 301: `"+3 more"`); spec Appendix B (line 336: `false`); test-plan TC-PROV-003 (line 218: `boolean`); plan Phase 2.1 (`trimMarker?: boolean`)

**Gap**: The spec glossary defines trimMarker as an indicator like `"+3 more"` (a string conveying how many commits were truncated). But Appendix B, the test plan, and the plan all use `boolean`. A boolean cannot express "+3 more" — it only signals whether truncation occurred.

**Suggested remediation target phase**: specification

**Suggested fix**: Resolve the type. If boolean is chosen (simpler, sufficient for the privacy constraint), update the glossary example. If string is chosen (richer, matches ADR-0010's "+M more" format), update Appendix B, test plan, and plan.

---

### 9. [minor] ac_quality — field count "13" is factually wrong; AC-F4-1 lists 14 fields

**Artifacts**: spec §17 AC-F4-1 (14 fields listed); spec §5.1 F-4 (14 fields); test-plan TC-PROV-003 step 3 ("All 13 required fields"); plan Phase 2 AC ("all 13 required fields plus 3 optional new fields")

**Gap**: AC-F4-1 enumerates: `schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker` — that is 14 fields. But spec, test-plan, and plan consistently say "13 required fields." The count error propagates across all three artifacts and could cause the coder to omit a field.

**Suggested remediation target phase**: specification + test_planning + delivery_planning

**Suggested fix**: Correct the count to 14 in all three artifacts, or remove a field from the list to make it 13.

---

### 10. [minor] test_traceability — no unit test for positive panel-injection path; TC-PROV-002 misattributed

**Artifacts**: plan Phase 5.5 (line 264-265); test-plan TC-PROV-002 (negative test only); test-plan §3.1 coverage table

**Gap**: Plan Phase 5.5 attributes TC-PROV-002 to both "Panel injection when `visiblePanel: true`" and "Panel NOT injected when `visiblePanel: false`." But TC-PROV-002 is exclusively the negative test (AC-F1-2). There is no unit test for the positive injection case (panel IS injected when true) — only integration test TC-PROV-004 covers it. The positive unit-level path is untested at the unit tier.

**Suggested remediation target phase**: test_planning

**Suggested fix**: Either add a unit test for positive panel injection, or clarify that TC-PROV-002 covers only the negative case and the positive case is covered by TC-PROV-004 (integration only).

---

### 11. [minor] plan_coverage — required vs optional field tension for new MetadataProperty fields not articulated

**Artifacts**: spec §17 AC-F4-1 (requires all fields on write); plan Phase 2.1 (fields are `optional?` in MetadataProperty type); plan Phase 2 AC ("13 required + 3 optional")

**Gap**: AC-F4-1 requires `sourceBranch`, `commitCount`, `trimMarker` to be present in the property after a successful publish. But plan Phase 2 makes them optional in the TypeScript `MetadataProperty` interface. This is a reasonable distinction (optional for reading old properties, required on write) but is not articulated. The plan's Phase 2 AC ("13 required + 3 optional") creates confusion about whether Phase 3 (write) must always populate them.

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: Add a note to plan Phase 2 explaining: "Fields are optional in the type for backward-compatible reading of pre-GH-27 properties; Phase 3 always writes all 14 fields on new syncs per AC-F4-1."
