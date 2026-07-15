# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-81
Date: 2026-07-15
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

## Method note

Each iter-2 finding was re-verified against the actual adapter/pipeline source
(`src/app/push-flow.ts` lines 519-556, 703-792, 925-1211, 1259-1342;
`src/infra/confluence/{attachments,properties,pages,target}.ts`;
`schemas/{property,page,attachment}.ts`) plus the iter-2-realigned artifacts
(spec `3125778`, test-plan `c7133e4`, plan `6c33631`). **Both iter-2 findings
are resolved.** A final full adversarial sweep then traced EVERY asserted
captured-request count in EVERY TC to a real call site, checked cross-artifact
ID consistency, all guardrails, and the 409/property shapes. No
runtime-unreachable assertion and no cross-artifact inconsistency remains.
Two non-blocking observations are recorded below (implementation-time
guidance, not DoR blockers).

This is iteration 3 of ~3. The artifacts are sound. Emitting READY.

## Iter-2 resolution status

| # | Iter-2 finding | Status | Evidence (re-verified against code) |
|---|----------------|--------|-------------------------------------|
| 1 | TC-005 dedup path asserted the unreachable 400 "same file name" branch (BLOCKING) | **RESOLVED** | `uploadAssets` (`push-flow.ts:539`) calls `target.attachmentExists(pageId, hash)` FIRST; `ConfluenceTarget.attachmentExists` (`target.ts:115-120`) → `AttachmentService.exists` (`attachments.ts:67-74`) → `list()` (GET `/child/attachment`) → `some((a) => a.hash === hash)`. On run 2 with the same asset, `exists` returns `true` → `uploadAssets` `continue` (`:541-544`) → **0× POST**. The 400 branch (`attachments.ts:38-45`) and its `resolveExisting` fallback (`:114-132`, self-labelled "Unreachable by design") are never entered. **All three artifacts now assert the real path:** spec §6 Flow 5 / §5.1 F-1 / §8.1 / AC-F2-4 / AC-4, test-plan TC-005 steps 4-6 + Expected Outcome + Notes, plan Phase 3.4 all assert run 2 = 1× `PUT /pages/{id}` + 1× `GET .../child/attachment` (precheck) + **0× `POST .../child/attachment`** (skip). No artifact asserts the 400 path as a pipeline-reachable mechanism; each explicitly labels it a defensive fallback the pipeline cannot reach by design. |
| 2 | TC-006 mis-tagged "AC-4 (GH-66)" (non-blocking) | **RESOLVED in authoritative matrices** | §3.1 AC-4 row (line 68) now lists only TC-E2EMOCK-002 (GH-71) + TC-E2EMOCK-008 (GH-66). §5.1 index (line 129) TC-006 AC Coverage = "AC-F2-5". TC-006 "Related IDs" (line 333) = "AC-F2-5, F-2, F-4". The authoritative coverage matrices no longer misattribute GH-66 to TC-006. Spec §17 AC-4 explicitly exonerates AC-F2-5 and redirects GH-66 to AC-F2-1/TC-E2EMOCK-008 — consistent with the test-plan. (Residual wording nit in TC-006 Expected Outcome — see Non-blocking observation 2.) |

## Final full adversarial sweep

### A. Every asserted captured-request count → traced to a real call site

| TC | Asserted count | Real call site(s) | Reachable? |
|----|----------------|-------------------|------------|
| TC-001 | parseConflict extracts base/remote versions from mock 409 | `pages.ts:170-201` `parseConflict` + `:203-204` `VERSION_RE` (provided→base, current→remote) | ✓ |
| TC-002 | 3× POST /pages, 3× POST /property, 2× POST /child/attachment | create: `createPage` (`:1242` POST) + finalize `getPage` + `putProperty` (`:1330-1336` POST); assets unbound → no computePlan getPage; `uploadAssets` precheck list empty on fresh mock → POST per new asset (`:547`) | ✓ |
| TC-003 | 0× every write verb | NoOp short-circuit (`:911-913`) before any write; computePlan read (getPage classification) is a GET, not asserted | ✓ |
| TC-004 | 1× PUT /pages/{id} (v2), 1× GET /pages/{id} | PUT via `updatePage` (`:1006`); GET via finalize fetch-back (`finalizeSuccessfulUpdate:738`). (computePlan classification GET at `:330` is a 2nd GET — see Non-blocking obs. 1; the asserted GET is reachable.) | ✓ |
| TC-005 | 1× PUT /pages, 1× GET /child/attachment, 0× POST /child/attachment | PUT via `updatePage`; GET via `attachmentExists` precheck (`:539`→list); 0× POST because precheck finds hash → `continue` | ✓ |
| TC-006 | panel present in POST /pages body | create-flow `appendProvenancePanel` body sent via `createPage` POST | ✓ |
| TC-007 | e2e-mock job present, mandatory, 0 secrets, pinned Bun | `.github/workflows/ci.yml` (config validation) | ✓ |
| TC-008 | POST /property → 409 → GET /property/{key} → PUT /property/{key}; jsongraphs never called | `put` (`properties.ts:58-96`): POST → 2xx ok; POST → 409 → `fetchCurrentVersion` GET → `updateByKey` PUT (version=current+1). Driven by applyPlan finalize `putProperty` (`:784`) on the run-2 Update (key pre-exists from run-1 create) | ✓ |

**No unreachable assertion found.** Every asserted request maps to a real,
executing call site. (TC-002/003/005/008 use "include"/write-verb-zero
semantics and have adjacent un-asserted reads — see delivery guidance below.)

### B. Cross-artifact ID consistency

- ACs (spec §17): AC-F1-1, AC-F1-2, AC-F2-1..6, AC-3, AC-4 — all present, unique, Given/When/Then.
- AC → TC mapping (test-plan §3.1): every AC traces to ≥1 TC; every TC traces to a plan phase (plan "Test Scenarios" table + per-phase task headers).
- AC-4 GH-71/GH-66 attribution consistent across all three artifacts: GH-71 → TC-E2EMOCK-002 (run-1 real upload unwrap); GH-66 → TC-E2EMOCK-008 (POST-409-GET-PUT) + AC-F2-1. Spec §17 AC-4, test-plan §3.1 row, plan Test Scenarios table all agree. AC-F2-5/panel correctly exonerated from GH-66.
- Plan phase→letter map (A-F) ↔ TC IDs preserved from iter-1; iter-2 fixes were targeted (Phase 3.4, task 1.6, Test Scenarios table titles) without renumbering.

### C. Guardrails intact

- **DEC-1** (src/** frozen, no CLI spawning, resolveCredentials untouched): spec §7.2 [OUT]; plan Out-of-Scope + Constraints + Phase 6.4 `git diff --stat main -- src/` empty check. `computePlan`/`applyPlan`/`processEntry`/`createPage`/`ConfluenceTarget.fromCredentials` confirmed never to call `validateCredentials`/`isHttpsUrl`. ✓
- **DEC-2** (tests/e2e-mock/ only): plan In Scope + Phase 5.3 (run-e2e.yml NOT touched) + affected-code-areas per phase list only `tests/e2e-mock/**` + `.github/workflows/ci.yml`. ✓
- **DEC-3** (corrected endpoints, no jsongraphs): spec §8.1 excludes jsongraphs; plan task 1.8 returns 404 for it; TC-008 step 5 asserts jsongraphs never requested. ✓
- **NFR-CI-1** (≤60s): spec §9; plan Phase 6.1 + instant `delay` seam (task 1.10) + no sleeps. ✓
- **NFR-CI-2** (0 secrets): spec §9; plan Phase 5.2 + TC-007 step 4. ✓
- **RSK-5** (escalate adapter bugs, no inline src/ fix): plan Out-of-Scope + Phase 3.7 + Phase 4.4 + Phase 6.4. ✓

### D. 409 conflict envelope + property `id` — final shape verification

- **409 envelope** = `{ errors:[{ code:"CONFLICT", title:"...Current Version: [N]...Provided version: [M]..." }] }`. Verified: `Conflict409Envelope` (`schemas/page.ts:24-33`: `errors[]` of `{code,title,status?,detail?}`); `parseConflict` (`pages.ts:170-201`) asserts `errors[0].code === "CONFLICT"` then `extractVersions`; `VERSION_RE` (`:203-204`) `/Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/` maps capture-1 → `remoteVersion`, capture-2 → `providedVersion` → `baseVersion`. spec §8.1 (line 173), AC-F1-2, TC-001 (cases A/B), plan task 1.4 + 2.2/2.3 all match exactly. ✓
- **Property `id`** required: `PropertyV1Response` (`schemas/property.ts:11`) `id: z.union([z.string(), z.number()])` (no `.optional()`). spec §8.1 (line 176), §5.1 F-1, plan task 1.2/1.5, TC-008 step 4 all specify `{ id, key, value, version:{number} }`. ✓

## Non-blocking observations (delivery-time guidance; do NOT block READY)

### 1. [minor] TC-004 step 4 — `GET /pages/{id}` count precision

**Where:** test-plan §5.2 TC-E2EMOCK-004 step 4 (line 272: "1× GET
/wiki/api/v2/pages/{id}?body-format=storage (for comparison)").

**Note:** For a *bound* document (Update/NoOp), `computePlan` issues a
classification `getPage` (`push-flow.ts:330`) BEFORE `applyPlan`, and
`finalizeSuccessfulUpdate` issues a fetch-back `getPage` (`:738`) AFTER the
PUT. So a run-2 update produces **2× `GET /pages/{id}`**, not 1×. The asserted
GET is fully reachable (not unreachable) and the spec is silent on the count
(AC-F2-3 mandates only the PUT + version advance), so this is NOT a DoR
defect. It is a count-precision nuance the test author resolves at
implementation time: either assert `>= 1×` (inclusion, matching the "include"
wording) or expect 2× (computePlan classification + applyPlan fetch-back).

This same dual-read applies to TC-005/TC-008 (bound-update runs), but those
scenarios do not assert a `GET /pages` count, so they are unaffected.

### 2. [nit] TC-006 Expected Outcome — residual GH-66 wording

**Where:** test-plan §5.2 TC-E2EMOCK-006 Expected Outcome (line 355)
parenthetical "(catching GH-66 property-API class if wrong endpoint/shape
during the property set on create flow covered by TC-E2EMOCK-002)".

**Note:** The iter-2 fix correctly removed GH-66 from the authoritative
matrices (§3.1 AC-4 row, §5.1 index, TC-006 Related IDs — all clean). The
parenthetical still names GH-66 but explicitly defers the catch to
TC-E2EMOCK-002, and the Notes (lines 357-360) state TC-006 "does NOT directly
exercise the GH-66 property-API regression". No coverage is misattributed;
this is purely a wording-tightening opportunity (could drop the parenthetical
entirely so the TC-006 purpose reads unambiguously as AC-F2-5 panel-in-body).

### 3. [delivery guidance] captured-request filtering

Several scenarios (TC-002 create, TC-005/TC-008 updates) produce adjacent
un-asserted reads (computePlan classification `getPage`; freshness
`getProperty` at `push-flow.ts:958`; finalize fetch-back `getPage`;
attachment-precheck `GET /child/attachment` per asset). When implementing the
exact-count assertions, the coder should filter the `CapturedRequest[]` log by
**method + path** (e.g. count only `POST .../child/attachment`, not all
`.../child/attachment`) to avoid over-counting. This is a standard test-design
discipline, not a DoR finding; flagged here only because the request mix is
denser than the asserted subset.

## Non-finding notes (re-verified sound, not re-litigated)

- **DEC-1 / DEC-2 / DEC-3** intact and consistent with the codebase (verified again this iteration). The `src/**` freeze is enforced by plan Phase 6.4; DEC-2 tier separation and DEC-3 (jsongraphs → 404, task 1.8) are explicit and check-listable.
- **409 self-check (TC-001 / Phase 2 / AC-F1-2)** verified correct against `pages.ts` `parseConflict` + `VERSION_RE` + `Conflict409Envelope`.
- **Property two-sync flow (TC-008 / Phase 4)** verified correct against `properties.ts` `put()` (POST-2xx ok / POST-409→`fetchCurrentVersion` GET → `updateByKey` PUT, version=current+1).
- **Property `id`** required by `PropertyV1Response`; all artifacts consistent.
- **user/by-me / search / restrictions** implemented for AC-F1-1 realism; verified via the Phase-1 smoke probe (plan task 1.13), not pipeline scenarios — consistent with DEC-1.
- **plan_coverage / plan_code_area_coverage / plan_doc_update_coverage / decision_capture / dod_defined**: PASS — ACs testable Given/When/Then; phase→TC→AC mappings explicit; affected files listed per phase; system-doc updates flagged per phase (testing-strategy.md note optional in lifecycle phase 7); Phase 6 ACs + spec §17 form a clear, testable DoD.

## Gate result

**READY.** All ten DoR facets PASS. Both iter-2 findings are resolved and
re-verified against the code. The final full sweep found no
runtime-unreachable assertion and no cross-artifact inconsistency. The two
non-blocking observations (TC-004 GET-count precision; TC-006 parenthetical
wording) are implementation-time guidance and do not block delivery. The
`@pm` may proceed to `delivery`.
