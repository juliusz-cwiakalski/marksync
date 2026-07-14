# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-27
Date: 2026-07-14
Pause Required: no

## Facet Summary

- spec_completeness: FAIL
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-1 Findings Resolution Status

| Iter-1 Finding | Severity | Status | Notes |
|---|---|---|---|
| #1 (prefix `marksync:` vs `marksync git`) | critical | **PARTIALLY RESOLVED** | F-5, AC-F5-1/2, §12, TC-PROV-008/009, plan all corrected. Spec §23 glossary (lines 297, 299) and §13 (line 205) still use `marksync:` — see finding #3. |
| #2 (false-drift architecture undefined) | critical | **PARTIALLY RESOLVED** | G-4, NFR-PERF-4, §12, Flow 2, test plan TC-PROV-007, plan Phase 4.4 correctly describe "excluded from HAST by construction." But spec F-2, F-3, AC-F3-1, Flow 1, §7.1, RSK-3, §16, §22, §23 still describe canonicalizer-based mechanism — see finding #1. |
| #3 (config wiring to apply point) | major | **RESOLVED** | Plan Phase 4.1 specifies `Plan.visiblePanel` stored in `computePlan` (verified: `computePlan(config, ...)` at `push-flow.ts:135`). Phase 4.3 reads it. |
| #4 (ProvenanceInput missing fields) | major | **RESOLVED** | `ProvenancePanelMeta` defined in Phase 1.2 with `sourcePath`, `sourceBranch`, `headCommit`, `synchronizedAt`. Timestamp lifecycle specified (generated at apply time, Phase 4.3). |
| #5 (NFR-PRIV-1 ID collision) | major | **PARTIALLY RESOLVED** | Spec §9 removed NFR-PRIV-1; §20 correctly scopes privacy to property only. But test plan §2, §3.3, TC-PROV-003 still reference it — see finding #2. |
| #6 (lock format contradiction) | major | **RESOLVED** | Spec §8.5 acknowledges optional lock-schema.json extension; plan Phase 2.3 adds optional fields. Verified `additionalProperties: false` in `lock-schema.json:38` — explicit listing required and planned. |
| #7 (no system doc updates) | major | **RESOLVED** | Plan Phase 6 updates `doc/spec/features/feature-safe-publish.md`. |
| #8 (trimMarker type) | minor | **MOSTLY RESOLVED** | Spec glossary + Appendix B use string `"+3 more"`; plan types `trimMarker?: string`. Test plan TC-PROV-003 still includes `false` example — see finding #4. |
| #9 (field count 13 vs 14) | minor | **RESOLVED** | All artifacts consistently say 14. |
| #10 (no unit test for positive injection) | minor | **RESOLVED** | Test plan §3.1 clarifies TC-PROV-002 = negative only; TC-PROV-004 (integration) covers positive. |
| #11 (required vs optional tension) | minor | **RESOLVED** | Plan Phase 2.1 note explains optional-for-reading vs always-written-on-new-sync. |

## Architecture Verification (source-grounded)

**Claim: "panel excluded from hash" holds.** VERIFIED TRUE.

- `computePlan` calls `target.renderBody(hast, ...)` (`push-flow.ts:266`) → returns `{ body, hash }`.
- `hash` (adapterHash) is a HAST hash (pre-panel). It overrides `contentHash.canonicalHash` (`push-flow.ts:270,298`).
- `body` string is stored on `entry.renderedBody` (`push-flow.ts:370`) — panel would be appended to this string AFTER hash computation.
- Classifier (`classifier.ts:45-46`): `local.canonicalHash !== base.renderedBodyHash` — both are HAST hashes, both exclude the panel by construction.
- Two syncs with identical content → identical HAST → identical hash → `NO_CHANGE`. Timestamp variance in the appended panel string cannot affect the HAST hash.

**Claim: `computePlan` receives `config`.** VERIFIED TRUE (`push-flow.ts:135-136`).

**Claim: canonicalizer phase dropped, no dangling references in plan.** VERIFIED TRUE for the plan (Phase 4.4, test scenario note line 411). NOT true for the spec — see finding #1.

## Findings

### 1. [major] [persistent from iter-1 #2] cross_artifact_consistency + spec_completeness — Spec still describes canonicalizer-based false-drift in 9 locations, contradicting the plan and the spec's own G-4/NFR-PERF-4

**Artifacts**: `chg-GH-27-spec.md` §5 F-2 (line 85), §5 F-3 (line 77), §5.1 F-3 (line 87), §6 Flow 1 (line 97), §7.1 (line 112), §11 RSK-3 (line 187), §16 (line 229), §17 AC-F3-1 (line 241), §22 (line 283), §23 glossary (line 298); vs. `chg-GH-27-plan.md` (no canonicalizer phase); spec G-4 (line 50), NFR-PERF-4 (line 175), §12 (line 197)

**Gap**: The decided architecture is "panel appended post-render as Storage string; classifier compares HAST hashes which exclude the panel by construction — NO canonicalizer." This is correctly documented in G-4, NFR-PERF-4, §12, Flow 2, the plan (Phase 4.4), and the test plan (TC-PROV-007). However, 9 spec locations still describe the OLD canonicalizer-based mechanism:

- F-2 (line 85): "excluded from content-hash comparison **via canonicalization**"
- F-3 (line 77): capability title "Canonicalize timestamp for content hash"
- F-3 detail (line 87): "the system **normalizes out the timestamp/marker block** from the Storage body"
- Flow 1 (line 97): "Timestamp **canonicalized** for hash"
- §7.1 (line 112): scope item "Content-hash **canonicalization** to exclude timestamp/marker block"
- RSK-3 (line 187): "**canonicalizer strips** known marker block before hashing"
- §16 (line 229): "`src/domain/render/canonicalize.ts` | **Extended: timestamp/marker normalization**" — but the plan NEVER touches canonicalize.ts
- AC-F3-1 (line 241): "timestamp **canonicalization** prevents false drift"
- §22 (line 283): "**Timestamp canonicalization** logic is isolated"
- §23 (line 298): glossary "**Timestamp canonicalization** | Normalizing out..."

**Impact**: F-3 is a phantom functional capability describing work the plan explicitly does not deliver. §16 lists `canonicalize.ts` as an affected component, but no plan phase touches it — a DoD check against §16 would flag a missing change. AC-F3-1 attributes false-drift prevention to "canonicalization," a mechanism that will not exist. A coder or reviewer reading F-3/§16/AC-F3-1 in isolation would implement or expect a canonicalizer that contradicts the plan. The spec is internally contradictory (G-4 vs F-3).

**Suggested remediation target phase**: specification

**Suggested fix**: Rewrite F-3 from "Canonicalize timestamp for content hash" to "Exclude panel from drift hash by construction" (or fold the mechanism into F-2). Update F-2 to remove "via canonicalization." Update AC-F3-1 parenthetical to "panel excluded from HAST hash by construction prevents false drift." Remove `canonicalize.ts` from §16 affected components (or note "no change — panel never enters HAST"). Update Flow 1, §7.1, RSK-3, §22, §23 to reflect exclusion-by-construction.

---

### 2. [major] system_spec_consistency — Test plan still references NFR-PRIV-1 with privacy semantics (removed from spec; system NFR-PRIV-1 = "Local-first")

**Artifacts**: `chg-GH-27-test-plan.md` §2 references (line 54), §3.3 NFR coverage table (line 89), TC-PROV-003 related IDs (line 195); system spec `doc/spec/nonfunctional.md:92`

**Gap**: The spec correctly removed NFR-PRIV-1 from its §9 NFR table (resolving iter-1 #5 at the spec level). But the test plan was NOT updated and still cites NFR-PRIV-1 in three locations:
- §2 (line 54): "NFRs: ...NFR-PRIV-1"
- §3.3 (line 89): "NFR-PRIV-1 (ADR-0010) | Privacy: `marksync.metadata` property contains only commitCount + trimMarker"
- TC-PROV-003 (line 195): "Related IDs: ...NFR-PRIV-1, ADR-0010"

The system spec defines NFR-PRIV-1 as "Local-first | No hosted backend for core value" (`nonfunctional.md:92`). The test plan's use of NFR-PRIV-1 for "commit-subject privacy" is the exact ID collision iter-1 flagged — now persisting in the test plan instead of the spec.

**Impact**: Cross-artifact inconsistency: spec has no NFR-PRIV-1, test plan claims to cover it. A reader looking up NFR-PRIV-1 in the system spec finds an unrelated requirement. The underlying test assertions (TC-PROV-003/005 check no `subjects` field) are correct — only the NFR ID reference is wrong.

**Suggested remediation target phase**: test_planning

**Suggested fix**: Replace all NFR-PRIV-1 references in the test plan with "ADR-0010 privacy constraint" (the actual authority). Remove the NFR-PRIV-1 row from §3.3 or relabel it as "ADR-0010" without an NFR ID.

---

### 3. [minor] [persistent from iter-1 #1] cross_artifact_consistency — Spec glossary and dependency table still use `marksync:` (colon) prefix

**Artifacts**: `chg-GH-27-spec.md` §23 glossary (line 297: "`marksync:` prefix"), §23 glossary (line 299: "lacks `marksync:` prefix"), §13 dependencies (line 205: "provides `marksync:` prefix")

**Gap**: All operational sections (F-5 line 91, AC-F5-1/2 lines 244-245, §12 line 194, DEC-5 line 221) correctly use `marksync git`. The test plan (TC-PROV-008/009) and plan (Phase 1.4) also correctly use `marksync git`. But the glossary and dependency table retain the stale colon form. The actual `PROVENANCE_PREFIX` in `src/infra/confluence/provenance.ts:9` is `"marksync git"`.

**Impact**: Low — these are definitional/reference sections, not behavioral specifications. But they create ambiguity for a reader who looks up terms in the glossary.

**Suggested remediation target phase**: specification

**Suggested fix**: Update §23 glossary entries for "marksync: prefix" → "marksync git prefix" and "Direct edit ... lacks `marksync:` prefix" → "lacks `marksync git` prefix." Update §13 line 205: "provides `marksync:` prefix" → "provides `marksync git` prefix."

---

### 4. [minor] ac_quality — TC-PROV-003 trimMarker example mixes string type with boolean value

**Artifacts**: `chg-GH-27-test-plan.md` TC-PROV-003 step 3 (line 219)

**Gap**: TC-PROV-003 declares "`trimMarker`: string (e.g., `"+3 more"` or `false` if no truncation)." The type is `string` but `false` is a boolean. The spec glossary (line 301) says "a string like `"+3 more"`" and Appendix B (line 336) shows `"trimMarker": "+3 more"`. The plan types it as `trimMarker?: string`. The no-truncation representation is ambiguous: is it `""` (empty string), absent (optional field omitted), or `false` (wrong type)?

**Impact**: Low — the dominant type across all artifacts is string. But a test author could implement the `false` example literally, creating a type mismatch with the plan's `string` declaration.

**Suggested remediation target phase**: test_planning

**Suggested fix**: Change the example to "`trimMarker`: string (e.g., `"+3 more"` when truncated, or `""` when no truncation occurred)." Align with plan Phase 3 line 188 ("empty string or indicator value").

---

### 5. [nit] plan_coverage — Plan doesn't specify how `plan.visiblePanel` / `plan.provenance` reach `processEntry`

**Artifacts**: `chg-GH-27-plan.md` Phase 4.2 (line 219), Phase 4.3 (lines 220-225); source `src/app/push-flow.ts:830` (`processEntry` signature)

**Gap**: Plan Phase 4.1 adds `visiblePanel` to the `Plan` interface. Phase 4.2/4.3 say panel injection happens in `processEntry` and checks `plan.visiblePanel`. But `processEntry(entry, target, lock, targetId, journal, message, cwd, operationId, headSha, stalePlanMinutes)` does NOT receive `plan`. The plan doesn't specify how the flag and provenance fields (`sourceBranch`, `headCommit`) reach `processEntry` — whether via new parameters, `PlanEntry`-level fields, or by performing the append in `applyPlan` before calling `processEntry`.

**Impact**: Negligible — the coder can infer the threading from the existing `applyPlan` → `processEntry` call chain. The plan correctly identifies where the flag lives (`Plan`) and what it controls (panel injection before write).

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: Add a note to Phase 4.1 or 4.3 specifying the threading mechanism (e.g., "thread `plan.visiblePanel` and `plan.provenance` as additional `processEntry` parameters from `applyPlan`" or "store `visiblePanel` on each `PlanEntry`").

---

## What Improved Since Iter-1

- **Architecture is now decided and verified**: "panel excluded from HAST by construction" is sound (confirmed against `push-flow.ts`, `canonicalize.ts`, `hashes.ts`, `classifier.ts`). The plan and test plan are fully consistent with this architecture.
- **Prefix is correct in all operational artifacts**: F-5, ACs, §12, test inputs, plan all use `marksync git` matching `PROVENANCE_PREFIX`.
- **Config wiring specified**: `Plan.visiblePanel` stored in `computePlan` (which receives `config`).
- **Panel inputs defined**: `ProvenancePanelMeta` with lifecycle.
- **Privacy correctly scoped**: property only (not `version.message`); spec §9/§20 corrected.
- **Lock schema acknowledged**: optional fields, backward compatible.
- **Doc updates planned**: Phase 6.
- **Field count corrected**: 14 across all artifacts.
- **AC→TC traceability complete**: all 9 ACs covered after TC-PROV-006 removal.

## Assessment

The two CRITICAL findings from iter-1 are resolved in the operational artifacts (plan, test plan, G-4, NFR-PERF-4). The remaining gaps are concentrated in **stale spec sections** that were not swept during remediation: F-3/AC-F3-1/§16 still describe the dropped canonicalizer, and the test plan still cites the removed NFR-PRIV-1. These are clearly actionable — the correct architecture and privacy scope are already documented elsewhere in the same artifacts. One more iteration focused on sweeping the spec's F-3/AC-F3-1/§16/Flow 1/§7.1/RSK-3/§22/§23 and the test plan's NFR-PRIV-1 references should achieve READY.

This is iteration 2 of ~3. Not a stalemate: the gaps are partial remediations with clear fixes, not unresolved disagreements.
