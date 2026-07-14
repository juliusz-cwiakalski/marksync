# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-27
Date: 2026-07-14
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Architecture Verification (source-grounded, final confirmation)

**Claim: "panel excluded from HAST hash by construction" — VERIFIED TRUE.**

Pipeline flow confirmed against `src/app/push-flow.ts` + `src/domain/state/classifier.ts`:

1. `computePlan` calls `target.renderBody(hast, ...)` (push-flow.ts:266) → returns `{ body, hash: adapterHash }`.
2. `adapterHash` becomes `localCanonicalHash` (push-flow.ts:270) → overrides `contentHash.canonicalHash` (push-flow.ts:298).
3. `body` stored on `entry.renderedBody` (push-flow.ts:370, 387) — this is the string the panel will be appended to.
4. The hash (`entry.hashes.canonicalHash`) is frozen at plan-compute time from HAST. Panel does not exist in HAST.
5. Classifier (classifier.ts:45-46): `local.canonicalHash !== base.renderedBodyHash` — both are HAST hashes, both exclude the panel by construction.
6. `base.renderedBodyHash` is set to `entry.hashes.canonicalHash` in `finalizeSuccessfulUpdate` (push-flow.ts:1115) — also a HAST hash.
7. Two syncs with identical content → identical HAST → identical hash → `NO_CHANGE`. Timestamp variance in the appended Storage string cannot affect the HAST hash.

**Other claims verified:**
- `computePlan` receives `config: ProjectConfig` (push-flow.ts:135). ✓
- `config.provenance.visiblePanel` exists, default `true` (config.ts:157-159, types.ts:73-75). ✓
- `PROVENANCE_PREFIX = "marksync git"` (provenance.ts:9). ✓
- `formatVersionMessage` emits `marksync git <head> (<count>): <subj1>; ...` (provenance.ts:36-44). ✓
- `MetadataProperty` currently has 11 fields (reconcile.ts:14-26); plan Phase 2.1 adds 3 optional → 14 total. ✓
- No canonicalizer module is needed; panel never enters HAST. ✓

## Iter-2 Findings Resolution Status

| Iter-2 Finding | Severity | Status | Verification |
|---|---|---|---|
| #1 (canonicalizer sweep: 9 spec locations) | major | **RESOLVED** | All 9 locations rewritten to "exclusion by construction" (F-2, F-3, F-3 detail, Flow 1, §7.1, RSK-3, §16, AC-F3-1, §22, §23). Only 2 "canonicalizer" mentions remain (spec §5 F-3 line 77, §5.1 F-3 line 87) — both are legitimate "No canonicalizer change is needed" clarifications. §16 no longer lists `canonicalize.ts` (confirmed: zero matches). |
| #2 (NFR-PRIV-1 in test plan) | major | **RESOLVED** | Zero `NFR-PRIV-1` references in test plan (confirmed). Zero in spec (confirmed). Privacy scope consistently references "ADR-0010 privacy constraint" throughout. |
| #3 (`marksync:` colon in spec glossary/deps) | minor | **RESOLVED** | Zero `marksync:` colon-prefix references in spec (confirmed). All glossary/dependency/operational sections use `marksync git` (space). Remaining `marksync:` mentions in plan Phase 5.7 and test TC-PROV-009 are legitimate negative-context edge cases ("not `marksync:`" / `marksync:abc123` → returns "direct"). |
| #4 (trimMarker boolean in TC-PROV-003) | minor | **RESOLVED** | TC-PROV-003 step 3 now reads: "`trimMarker`: string (e.g., `"+3 more"`; present only when truncation occurred, otherwise absent/empty)". No boolean. Consistent with spec glossary (string `"+3 more"`) and plan (`trimMarker?: string`). |
| #5 (visiblePanel threading to processEntry) | nit | **RESOLVED** | Plan Phase 4.3 now specifies: "Update `processEntry` signature to gain a `visiblePanel: boolean` parameter. In `applyPlan`, pass `plan.visiblePanel ?? true` to `processEntry` at the call site." Verified: `applyPlan` receives `plan: Plan` (push-flow.ts:758) and calls `processEntry` (push-flow.ts:782-794) — threading is structurally sound. |

## AC → TC Traceability (final verification)

| AC ID | TC ID(s) | Status |
|-------|----------|--------|
| AC-F1-1 | TC-PROV-001, TC-PROV-004 | ✓ Covered |
| AC-F1-2 | TC-PROV-002 | ✓ Covered |
| AC-F3-1 | TC-PROV-007 | ✓ Covered |
| AC-F4-1 | TC-PROV-003, TC-PROV-005 | ✓ Covered |
| AC-F4-2 | TC-PROV-003, TC-PROV-005 | ✓ Covered |
| AC-F5-1 | TC-PROV-008 | ✓ Covered |
| AC-F5-2 | TC-PROV-009 | ✓ Covered |
| AC-INT-1 | TC-PROV-004, TC-PROV-005 | ✓ Covered |
| AC-CI-1 | All TCs | ✓ Covered |

All 9 ACs trace to at least one TC. No orphan TCs.

## Cross-Artifact Consistency (final verification)

| Dimension | Spec | Test Plan | Plan | Status |
|-----------|------|-----------|------|--------|
| Prefix | `marksync git` | `marksync git` | `marksync git` | ✓ Aligned |
| False-drift mechanism | Exclusion by construction (F-3, G-4, NFR-PERF-4, §12) | HAST exclusion (TC-PROV-007) | Post-render append, HAST hash (Phase 4.4) | ✓ Aligned |
| Privacy scope | Property only (§9, §20, F-4, G-5) | Property only (TC-PROV-003/005) | Property only (Phase 3, RSK-4) | ✓ Aligned |
| Field count | 14 (AC-F4-1, F-4) | 14 (TC-PROV-003) | 14 (Phase 2, Phase 3) | ✓ Aligned |
| Lock schema | Optional fields (§8.5) | DM-3 coverage | Phase 2.3 optional fields | ✓ Aligned |
| Panel format | `{info}` macro (F-1, Appendix A) | TC-PROV-001 golden fixture | Phase 1.3 | ✓ Aligned |
| Config wiring | `provenance.visiblePanel` (§7.1, §12) | TC-PROV-002 | Phase 4.1–4.3 (Plan.visiblePanel) | ✓ Aligned |
| Doc updates | — | — | Phase 6 (`feature-safe-publish.md`) | ✓ Listed |

## System Spec Consistency

- NFR-REL-9, NFR-A11Y-3, NFR-PERF-4 all exist in `doc/spec/nonfunctional.md` (lines 63, 111, 36). ✓
- No NFR-PRIV-1 collision (system NFR-PRIV-1 = "Local-first"; change artifacts reference ADR-0010). ✓
- Architecture consistent with existing classifier.ts (HAST hash comparison, lines 45-46). ✓
- No contradiction with ADR-0006 drift-detection safety (provenance is metadata on safe update). ✓

## Findings

### 1. [nit] spec_completeness — §16 says "No change" for reconcile.ts but plan extends MetadataProperty interface there

**Artifact**: spec §16 (line 231); plan Phase 2.1 (line 151); source `src/domain/state/reconcile.ts:14`

**Gap**: Spec §16 lists `src/domain/state/reconcile.ts` as "No change: `marksync.metadata` cross-check logic unchanged." But plan Phase 2.1 extends the `MetadataProperty` interface in that file with 3 optional fields (`sourceBranch`, `commitCount`, `trimMarker`). The file IS touched, even though the reconciliation function *logic* is unchanged.

**Impact**: Negligible. The spec's statement is defensible if read as "cross-check LOGIC unchanged" (only the type gains optional fields). The type extension is covered by DM-1. A DoD checker comparing §16 against actual file changes would see a minor discrepancy, but it does not affect delivery correctness.

**Suggested remediation target phase**: specification

**Suggested fix**: Change §16 reconcile.ts entry from "No change" to "Type extended: `MetadataProperty` gains optional `sourceBranch`, `commitCount`, `trimMarker` fields; cross-check logic unchanged."

---

## What Improved Since Iter-2

- **Spec canonicalizer sweep complete**: All 9 stale canonicalizer references replaced with "exclusion by construction." §16 no longer lists `canonicalize.ts`. F-3 and AC-F3-1 now correctly describe the post-render append architecture. No phantom mechanisms remain.
- **NFR-PRIV-1 collision eliminated**: Zero references in both spec and test plan. Privacy scope consistently uses "ADR-0010 privacy constraint."
- **Prefix fully aligned**: Zero stale `marksync:` colon references in operational or definitional sections.
- **trimMarker type consistent**: String throughout (spec, test plan, plan). No boolean.
- **visiblePanel threading specified**: `processEntry` gains the parameter; `applyPlan` passes `plan.visiblePanel ?? true`.
- **Architecture verified against source**: All claims confirmed true against actual `push-flow.ts`, `classifier.ts`, `provenance.ts`, `config.ts`, and `types.ts`.

## Assessment

All iter-1 (11 findings) and iter-2 (5 findings) gaps are fully resolved. The artifacts are mutually consistent: the decided architecture (exclusion by construction) is documented identically across spec, test plan, and plan, and is verified sound against the actual source code. AC→TC traceability is complete (9/9 ACs). No phantom mechanisms or cross-artifact contradictions remain. The one remaining nit (§16 reconcile.ts wording) is non-blocking and does not affect delivery correctness.

This is iteration 3 of ~3. The change is ready for delivery.
