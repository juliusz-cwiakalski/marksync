# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-81
Date: 2026-07-15
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Method note

Each iter-1 finding was re-verified against the actual adapter/pipeline source
(`src/app/push-flow.ts`, `src/infra/confluence/{properties,attachments,pages,
target}.ts`, `schemas/{property,attachment,page}.ts`) plus the corrected
artifacts in commits `77d193b` (spec), `59597f2` (test-plan), `7f67bed` (plan).
Five of the six iter-1 findings are genuinely resolved. **Finding 5 persists in
an evolved form**: the remediation fixed the trigger (Update flow now reaches
`uploadAssets`) but relocated the defect — the asserted dedup mechanism is now
the *unreachable* 400 fallback rather than the *reachable* `attachmentExists`
hash precheck. One additional non-blocking consistency defect was introduced by
the partial propagation of the AC-4 (GH-66) fix.

## Iter-1 resolution status

| # | Iter-1 finding | Status | Evidence (re-verified against code) |
|---|----------------|--------|-------------------------------------|
| 1 | user/by-me unreachable under DEC-1 | **RESOLVED** | `computePlan` (`push-flow.ts:140-431`), `applyPlan` (`:810-884`), and `processEntry` (`:889-1346`) never call `validateCredentials`; the sole caller of `GET user/by-me` is `src/app/credentials.ts`. TC-E2EMOCK-002 step 5 + plan Phase 3.1 drop the assertion; API-F1-9 (§3.2) + plan task 1.13 re-trace it to the Phase-1 smoke probe. |
| 2 | TC-E2EMOCK-008 self-contradictory | **RESOLVED** | `properties.ts` `put()` (`:58-96`): POST → 2xx returns ok; POST → 409 → `fetchCurrentVersion` (GET) → `updateByKey` (PUT). TC-008 + plan Phase 4.1 now use a two-sync flow (run-1 POST-2xx creates the key; run-2 update hits the existing key → POST-409→GET→PUT). Preconditions ("fresh mock" + "first sync has completed") are now internally consistent. |
| 3 | property shape missing `id` | **RESOLVED** | `schemas/property.ts` `PropertyV1Response` (`:10-18`) requires `id: z.union([z.string(), z.number()])`. Spec §8.1, plan Phase 1 task 1.5, and TC-008 step 4 now all specify `{ id, key, value, version:{number} }`. |
| 4 | search/restrictions not pipeline-driven | **RESOLVED** | §3.2 API-F1-10/11 re-traced to "Phase-1 mock smoke probe"; plan task 1.7 implements the stubs and task 1.13 implements the direct-request probe. |
| 5 | TC-005 vacuous | **PERSISTENT (evolved)** | See Finding 1 below. Trigger fixed; assertion now targets an unreachable path. |
| 6 | AC-4 GH-66 → AC-F2-5 linkage | **RESOLVED in spec, NOT propagated to test-plan** | Spec §17 AC-4 correctly redirects GH-66 to AC-F2-1 / TC-E2EMOCK-008 and explicitly exonerates AC-F2-5. But the test-plan still tags TC-006 with "AC-4 (GH-66)". See Finding 2 below. |

## Findings

### 1. [major — PERSISTENT, BLOCKING] test_traceability + cross_artifact_consistency + system_spec_consistency — test-plan §5.2 TC-E2EMOCK-005 steps 4-6 + notes (lines 308-324); plan §Phase 3 task 3.4 (line 205) + AC (line 213); spec §6 Flow 5 (line 128)

**Gap:** The iter-1 remediation correctly switched TC-005's trigger from a NoOp
rerun to an Update flow (so `uploadAssets` actually runs on run 2), but it
asserts the **400 "same file name"** dedup path, which is **unreachable at
runtime** in this scenario. Verified against the code path the scenario drives:

- `uploadAssets` (`src/app/push-flow.ts:539`) calls
  `target.attachmentExists(pageId, artifact.hash)` **FIRST**, before any
  `uploadAttachment`.
- `ConfluenceTarget.attachmentExists` → `AttachmentService.exists()`
  (`attachments.ts:67-74`) → `list()` (GET `/child/attachment`) →
  `some((a) => a.hash === hash)`.
- On run 2 with the **same asset file** (same hash), the mock's list contains
  the run-1 attachment whose `hashFromFilename(title)` matches → `exists`
  returns `true` → `uploadAssets` **skips** `uploadAttachment` (`:541-544`) →
  **0× POST** → the 400 branch in `AttachmentService.upload`
  (`attachments.ts:38-45`) and its `resolveExisting` fallback are **never
  entered**. The code itself labels this fallback "Unreachable by design"
  (`attachments.ts:122-126`).

Therefore TC-005 step 4's asserted run-2 capture
("1× POST …/child/attachment (attempts upload)" → "Mock returns 400" →
"1× GET …/child/attachment (list to resolve existing)") **cannot occur**. The
actual run-2 capture is `1× GET …/child/attachment` (the precheck list) and
`0× POST`. The scenario will fail when implemented.

**Internal contradiction:** TC-005 step 4 ("1× POST …/child/attachment" on
run 2) directly contradicts the very AC it traces to — spec §17 AC-F2-4
("the attachment is NOT re-uploaded (`POST …/child/attachment` for that asset
**not captured on run 2**)"). AC-F2-4 is correct (it accepts "the 400 path OR
a hash precheck"); TC-005 followed the wrong narrative.

**Root narrative source:** spec §6 Flow 5 ("second upload hits 400 'same file
name' → resolved from list → 0 re-uploads") asserts only the 400 branch and
omits the `attachmentExists` precheck that `uploadAssets` actually performs
first. The test-plan and plan inherited this incomplete narrative.

**Suggested remediation target phase:** test_planning (root), then
specification (§6 Flow 5) + delivery_planning (Phase 3.4).

**Suggested fix:** Rewrite TC-005 steps 4-6 + notes to assert the **reachable**
dedup path: on run 2, `1× GET …/child/attachment` (precheck list via
`attachmentExists`), `0× POST …/child/attachment` (skipped because
`attachmentExists` found the hash), server-side attachment id/version
unchanged. Drop the "400 → list → resolve" assertion and the "GH-71 dedup
signal handling" coverage claim from TC-005 (GH-71 *unwrap* coverage stays with
TC-002's real uploads; TC-005 run-1 also exercises `mapCreate`, so AC-4's
GH-71 claim via AC-F2-1/F-2-4 still holds). Make plan Phase 3 task 3.4 mirror
this. Correct spec §6 Flow 5 to: "second `applyPlan` → `attachmentExists`
precheck (GET list) finds the hash → upload skipped → 0 re-uploads". Leave
AC-F2-4 unchanged (already correct).

---

### 2. [minor] cross_artifact_consistency — test-plan §3.1 AC-4 row (line 68); §5.1 scenario index (line 129); TC-E2EMOCK-006 "Related IDs" (line 333), Expected Outcome (line 353), Notes (line 356)

**Gap:** The spec AC-4 fix (iter-1 finding 6, commit `77d193b`) explicitly
redirects the GH-66 clause to "AC-F2-1 / TC-E2EMOCK-008 … **not** AC-F2-5: the
provenance panel lives in the page body via `createPage`, independent of
`putProperty`". That correction was **not propagated to the test-plan**:

- §3.1 AC-4 row still lists "TC-E2EMOCK-006 (GH-66 property read for
  provenance)" — factually wrong: TC-006 is a **create** flow on a fresh mock,
  and `getProperty` (the property *read*) is only called in the Update path
  (`push-flow.ts:958`), never on Create. No property read occurs in TC-006.
- §5.1 index + TC-006 "Related IDs" still tag TC-006 with "AC-4 (GH-66)".
- TC-006 Expected Outcome + Notes still claim it "tests the GH-66 regression
  class" / "catching GH-66 property-API class".

The spec's own AC-4 now exonerates AC-F2-5/panel from catching GH-66 (panel is
written via `createPage`, independent of `putProperty`). GH-66 coverage is held
by TC-002 (create-time `putProperty` POST → would block on a jsongraphs
regression) and TC-008 (POST→409→GET→PUT). TC-006's incidental GH-66 exposure
(via its create-flow `putProperty`) duplicates TC-002 and is not its purpose.

**Impact:** Non-blocking — TC-006 itself runs fine (panel-in-body assertion
holds). The defect is a false/misattributed coverage claim that contradicts
the spec's AC-4 mapping. Include here for traceability hygiene so AC-4
coverage isn't double-counted against the wrong TC.

**Suggested remediation target phase:** test_planning.

**Suggested fix:** Drop "AC-4 (GH-66)" from TC-006's tags/Related IDs/Notes and
remove "TC-E2EMOCK-006 (GH-66 property read for provenance)" from §3.1's AC-4
row. Keep TC-006's purpose as AC-F2-5 (panel-in-body) only. Reassign AC-4
GH-66 coverage in §3.1 to TC-002 (create-flow putProperty) + TC-008 (already
listed).

---

## Non-finding notes (re-verified sound, not re-litigated)

- **DEC-1 / DEC-2 / DEC-3** intact and consistent with the codebase. The
  `src/**` freeze is enforced by plan Phase 6.4 (`git diff --stat main -- src/`
  empty check); DEC-2 tier separation (`tests/e2e-mock/` only) and DEC-3
  (corrected endpoints, jsongraphs absent — plan task 1.8 returns 404 for it)
  are explicit and check-listable. No guardrail was weakened by the iter-1
  fixes.
- **409 self-check (TC-001 / Phase 2 / AC-F1-2)** verified correct against
  `pages.ts` `parseConflict` (`:170-201`) + `VERSION_RE` (`:203-204`):
  `Current Version:[N]` → `remoteVersion`, `Provided version:[M]` →
  `baseVersion`. TC-001 cases A/B and plan task 2.2/2.3 match.
- **Property two-sync flow (TC-008 / Phase 4)** verified correct against
  `properties.ts` `put()` (`:58-96`): POST-2xx-ok / POST-409→`fetchCurrentVersion`
  → `updateByKey` (PUT with `version.number = currentVersion+1`). The
  operation-freshness GET (`push-flow.ts:958`) precedes the finalize
  `putProperty`; TC-008's "include"-semantics sequence holds.
- **`PropertyV1Response` `id`** required (`schemas/property.ts:11`); spec §8.1,
  §5.1, plan 1.2/1.5, TC-008 step 4 all consistent.
- **user/by-me** is implemented for realism only; the Phase-1 smoke probe
  (plan task 1.13, `mock-smoke-probe.test.ts`) is the traceable home for
  API-F1-9/10/11. Acceptable per iter-1 finding 4 resolution (matrix annotated,
  no formal TC ID required).
- **plan_coverage / plan_code_area_coverage / plan_doc_update_coverage /
  decision_capture / dod_defined**: PASS — ACs are testable Given/When/Then,
  phase→TC→AC mappings are explicit, affected files are listed per phase.

## Next steps

Reopen **test_planning** (Finding 1 root + Finding 2) and **specification**
(§6 Flow 5), then re-align **delivery_planning** (Phase 3 task 3.4). No
`delivery` reopening. No human input required (Pause Required: no).

This is iteration **2 of ~3**. Finding 1 is the evolved form of iter-1 finding
5 — same symptom (TC-005's core assertion unreachable at runtime), different
root (400-fallback vs NoOp short-circuit). If Finding 1 persists into iter-3
unchanged, escalate to the human rather than loop again.
