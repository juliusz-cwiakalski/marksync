# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-74
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

## Iter-1 Findings Resolution (verified)

1. [major → RESOLVED] cross_artifact_consistency — test-plan#TC-REG-001
   Was: TC-REG-001 enumerated only the unit-level overwrite-refusal test for modification,
   contradicting the plan's upstream-gap finding (TC-ASSIGN-005 + DEC-5 also need modification).
   Now: TC-REG-001 Expected Outcome (lines 524-531) and Notes (lines 537-545) enumerate all
   THREE tests requiring modification (overwrite-refusal unit test at `init.test.ts:54`,
   TC-ASSIGN-005 at `identity-assign.test.ts:124`, DEC-5 redaction test at `init.test.ts:65`)
   with per-test before/after behavior. Explicitly states "THREE existing tests are
   deliberately modified." Plan's Phase 1 tasks 1.2/1.4/1.5 align 1:1 with the enumeration.

2. [minor → RESOLVED] test_traceability — test-plan#Implementation-Mapping (line 576)
   Was: TC-INIT-004 labeled "Existing – Update (replace overwrite-refusal test)" but TC-INIT-004
   is the no-config path (F-2/AC-F-2-1), not the overwrite-refusal test.
   Now: TC-INIT-004 correctly labeled "Existing – Verify (no-config path)" (line 576).
   TC-INIT-001/002/003 correctly labeled "Existing – Replace overwrite-refusal test"
   (lines 573-575). Verified against init.test.ts:47 (success → exitCode 0) which is the
   no-config path TC-INIT-004 extends.

3. [nit → RESOLVED] cross_artifact_consistency — test-plan#References (lines 47-48)
   Was: Reference links pointed to non-existent `doc/spec/cli.md` and `doc/spec/safe-publish.md`.
   Now: Links point to `doc/spec/features/feature-cli.md` and
   `doc/spec/features/feature-safe-publish.md` (both verified to exist via glob).

## Findings

1. [nit] cross_artifact_consistency — plan#Upstream-gaps (lines 49-75) and plan#RSK-4 (lines 134-136)
   Gap: The plan's "Upstream gaps found (plan-writer note)" section still describes the test plan
   as enumerating "only the unit-level 'overwrite-refusal' test" and recommends
   "@test-plan-writer reconcile TC-REG-001 to enumerate TC-ASSIGN-005" (line 75). That
   reconciliation is now complete. RSK-4 likewise says "TC-ASSIGN-005 and the DEC-5 test (not
   enumerated in the test plan)" (line 135) — they ARE now enumerated. The plan's framing is
   factually stale relative to the updated test plan.
   Impact: Non-blocking. The actionable Phase 1 tasks (1.2 replace overwrite-refusal test,
   1.4 re-purpose DEC-5, 1.5 rewrite TC-ASSIGN-005) are fully consistent with the updated test
   plan's TC-REG-001 enumeration. The stale text lives in an informational "plan-writer note"
   section, not in actionable tasks. A coder/reviewer may experience brief confusion about
   whether the test plan was updated, but the tasks themselves are unambiguous.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Update the "Upstream gaps" section to note reconciliation is complete (or
   strike the recommendation line 75); update RSK-4 wording from "not enumerated in the test
   plan" to "now enumerated in TC-REG-001". Alternatively, defer cleanup to the plan-writer
   retro. Does not block delivery.

## Verification Notes (non-blocking, confirmed safe)

The following were re-verified or newly verified in iter-2 and found NOT blocking:

- **Source code matches plan's code-area claims**: `src/cli/commands/init.ts` calls
  `writeStarterConfig(dir)` first (line 21), returns on error (line 22), then calls
  `assignUuidsFromDisk(dir)` (line 24) — confirming the `existsSync` gate fix is correctly
  scoped. `src/app/push-flow.ts` `computePlan` step 3 (lines 160-169) silently drops UUID-less
  docs via `readUuid` returning `undefined`; the dead `if (!uuid) continue` guard at lines
  204-208 is unreachable after F-3 — confirming plan task 2.3 (removal) is safe.

- **TC-ASSIGN-005 hard-fail after F-1 confirmed**: `identity-assign.test.ts:124` uses
  `makeCorpus()` (line 19-26) which calls `writeStarterConfig(dir)` to create a VALID config.
  After F-1, `existsSync` skips `writeStarterConfig`, `assignUuidsFromDisk` → `loadConfig`
  succeeds on the valid starter config, UUID is assigned to `docs/a.md`. All three assertions
  (`exitCode === 10`, `error.code === "INVALID_CONFIG"`, byte-unchanged) hard-fail. Plan task
  1.5 correctly rewrites this test.

- **DEC-5 redaction test semantic drift confirmed**: `init.test.ts:65` writes INVALID config
  (`existing: true\n`). After F-1, `existsSync` skips `writeStarterConfig`, `loadConfig` on
  invalid content fails with a validation error → still maps to `INVALID_CONFIG` / exit 10, and
  redaction assertions still hold. Test likely still passes but via the wrong code path. Plan
  task 1.4 correctly flags this for review/re-purpose.

- **Overwrite-refusal test at `init.test.ts:54`**: Also uses INVALID config (`existing: true\n`).
  After F-1 it would still error via validation failure — BUT plan task 1.2 correctly replaces
  it with TC-INIT-001/002/003 that pre-create a VALID config and assert UUID assignment +
  byte-preservation. Consistent.

- **BDD feature file**: `tests/bdd/features/duplicate-uuid-fatal.feature` exists and covers
  INV-SAFE-3 (duplicate-UUID → `err(DuplicateUuid)` before any write). TC-PLAN-005 "Existing –
  No Change" status is valid.

- **compute-plan.test.ts exists**: TC-PLAN-001..004 "To Implement" references are valid (new
  tests added to existing file).

- **System spec drift acknowledged and deferred**: `feature-cli.md:46` says init "refuses to
  overwrite an existing one" (current truth); `feature-safe-publish.md` has no UUID-less
  warning wording. PM notes (items 26-30) flag both as risks for `@doc-syncer` in lifecycle
  phase 7. Plan phases 1-3 explicitly defer `doc/spec/**` reconciliation. Correct handling per
  change-lifecycle.

- **EVT-1 exact text consistency**: Ticket, spec (§5.1 line 82, §8.2 EVT-1), plan (Constraints
  line 120, task 2.2 line 232), and test plan (TC-PLAN-001 step 4 line 321, TC-PLAN-002 step 4
  line 361) all use the identical text:
  `{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`
  (em-dash `—`, single-quoted `'marksync init'`). No drift.

- **Version bump**: `package.json` currently `0.4.1` (verified in iter-1). Plan's `0.4.1 → 0.4.2`
  patch bump is correct.

## Override Assessment

Not eligible for override. This change alters behavior (init no longer refuses to overwrite
existing config; sync now emits warnings for UUID-less files). It touches contracts
(`Plan.warnings` content, `initCommand` exit behavior on existing config). The override path
is unavailable per DoR rules. No override is needed — the gate passes on merit.

## Gate Result

READY. All iter-1 findings resolved. One non-blocking nit (stale plan upstream-gap framing)
noted for opportunistic cleanup during delivery_planning or doc-sync; does not impede delivery
because actionable Phase 1 tasks are consistent with the updated test plan. Delivery may proceed.
