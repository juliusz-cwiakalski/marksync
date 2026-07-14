# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-74
Date: 2026-07-14
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

1. [major] cross_artifact_consistency — test-plan#TC-REG-001 (lines 497-538) vs plan#Upstream-gaps (lines 49-75)
   Gap: The test plan's TC-REG-001 asserts "All existing tests pass without modification (except those
   explicitly changed by spec)" and enumerates ONLY the unit-level overwrite-refusal test
   (`tests/unit/cli/commands/init.test.ts:54`) for modification (lines 525, 537). The plan identifies
   TWO additional existing tests that assert the old refused-overwrite behavior and are NOT enumerated
   by the test plan:
   - `tests/integration/identity/identity-assign.test.ts:124` (TC-ASSIGN-005) — pre-creates a VALID
     `marksync.yml` via `writeStarterConfig`, writes a UUID-less `docs/a.md`, runs `initCommand`, and
     asserts `exitCode === 10`, `error.code === "INVALID_CONFIG"`, and `docs/a.md` byte-unchanged.
     After F-1, `existsSync` skips config creation, `assignUuidsFromDisk` → `loadConfig` succeeds
     (valid config), UUID is assigned → exit 0, no error, file changed. ALL THREE assertions HARD-FAIL.
   - `tests/unit/cli/commands/init.test.ts:65` (DEC-5 redaction test) — writes INVALID config
     (`existing: true\n`); after F-1 still errors but via `loadConfig` validation, not overwrite-refusal.
     Semantic drift via wrong code path.
   The plan compensates with Phase 1 tasks 1.4 and 1.5 and explicitly recommends
   "@test-plan-writer reconcile TC-REG-001 to enumerate TC-ASSIGN-005" (plan line 75). The PM notes
   capture this as a retro. However, the test plan as written is the authoritative traceability
   document and contains a factual error: TC-REG-001's Expected Outcome (lines 524-527) claims only one
   test needs modification, while three do. This is a direct contradiction between the test plan and the
   plan on which tests require modification — the highest-value cross-artifact consistency facet.
   Suggested remediation target phase: test_planning
   Suggested fix: Reopen test_planning. Update TC-REG-001 to: (a) enumerate TC-ASSIGN-005
   (`tests/integration/identity/identity-assign.test.ts:124`) as a test requiring modification (rewrite
   to assert new behavior: exit 0, no error, UUID assigned, config preserved); (b) enumerate the DEC-5
   redaction test (`tests/unit/cli/commands/init.test.ts:65`) as a test requiring review/re-purposing;
   (c) correct the Expected Outcome to state that three tests are deliberately modified, not one.

2. [minor] test_traceability — test-plan#Implementation-Mapping (line 570)
   Gap: TC-INIT-004's Implementation Status reads "Existing – Update (replace overwrite-refusal test)"
   but TC-INIT-004 is the no-config path (F-2 / AC-F-2-1), not the overwrite-refusal test. The
   overwrite-refusal test (init.test.ts:54) is replaced by TC-INIT-001 (per TC-INIT-001's own notes,
   line 179: "This scenario replaces the existing 'overwrite-refusal' test behavior"). The label on
   TC-INIT-004 is incorrect and could mislead the coder into modifying the wrong test.
   Suggested remediation target phase: test_planning
   Suggested fix: Correct TC-INIT-004's Implementation Status to "Existing – Verify/Extend" (it
   covers the no-config first-time init path, already tested at init.test.ts:47). Move the "replace
   overwrite-refusal test" label to TC-INIT-001's Implementation Status (currently "To Implement").

3. [nit] cross_artifact_consistency — test-plan#References (lines 47-48)
   Gap: The test plan references `[CLI Feature Specification](doc/spec/cli.md)` and
   `[Safe-Publish Feature Specification](doc/spec/safe-publish.md)`. Neither path exists. The correct
   paths are `doc/spec/features/feature-cli.md` and `doc/spec/features/feature-safe-publish.md`
   (verified via glob — the `doc/spec/cli.md` and `doc/spec/safe-publish.md` files do not exist).
   Suggested remediation target phase: test_planning
   Suggested fix: Update both reference links to the correct `doc/spec/features/feature-*.md` paths.

## Verification Notes (non-blocking, confirmed safe)

The following potential risks were investigated and found NOT to be blocking:

- **Integration tests asserting `Plan.warnings` counts**: Searched all integration tests for
  `warnings.toHaveLength`, `warnings.toEqual`, `warnings.toBe([`. No integration test asserts an exact
  `Plan.warnings` array/count that would break with F-3's new UUID-less warnings. The `mermaid-render`
  tests (the only ones asserting on `Plan.warnings` content) use resilient `.filter()` / `.some()`
  patterns with specific substrings ("Kroki", "doc-b.md", "falling back to code block"), and all
  fixture docs include UUIDs (the `mermaidDoc` helper at line 109 injects `DOC_UUID`). The
  `identity-assign.test.ts:163` assertion (`result.warnings.toHaveLength(1)`) is on `initCommand`'s
  `CommandResult.warnings` for a FRESH corpus (no-config path, unchanged by F-1), not on `Plan.warnings`.
  The `asset-upload.test.ts` assertions are on `uploadAssets` result warnings, unrelated to F-3.

- **`writeStarterConfig` produces valid config**: Confirmed via `config-template.test.ts` round-trip
  test (line 27-51) — `loadConfig` accepts the starter config. The plan's claim that
  "assignUuidsFromDisk already handles an existing config via loadConfig" is verified: after F-1, a
  valid existing config → `loadConfig` succeeds → UUID assignment proceeds.

- **`config-template.test.ts` overwrite guard test (TC-INIT-003, line 65)**: Tests `writeStarterConfig`
  directly. Since the plan does NOT modify `writeStarterConfig`, this test remains valid and unaffected.

- **Dead `if (!uuid) continue` guard removal (plan task 2.3)**: After F-3, `docsWithUuid` only
  contains docs where `readUuid` returned a non-undefined `DocumentId`, so `uuid` is always defined in
  the per-doc loop. The guard is genuinely dead. Removal is safe.

- **BDD feature file**: `tests/bdd/features/duplicate-uuid-fatal.feature` exists (verified). TC-PLAN-005's
  reference is valid.

- **Version bump**: `package.json` is currently `0.4.1` (verified). Plan's `0.4.1 → 0.4.2` is correct.

## Override Assessment

Not eligible for override. This change alters behavior (init no longer refuses to overwrite existing
config; sync now emits warnings for UUID-less files). It touches contracts (Plan.warnings content,
initCommand exit behavior). The override path is unavailable per DoR rules.
