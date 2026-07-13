# Readiness Review Iteration 1

Verdict: READY
Work Item: GH-24
Date: 2026-07-13
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

## Source Verification (pre-staged infrastructure claims — all read, not assumed)

Every "pre-staged" claim in the spec was verified against current source. All TRUE.

| Claim | Source location | Verified |
|-------|-----------------|----------|
| `StalePlan { operationId: string; expiredAt: string }` error arm | `src/domain/errors.ts:50` | YES |
| `StalePlan` named in `assertNeverMarkSyncError` | `src/domain/errors.ts:148` | YES |
| `Plan.operationId` + `operationId = op_${runId}` | `src/app/push-flow.ts:75,338` | YES |
| `MetadataProperty.operationId` | `src/domain/state/reconcile.ts:25` | YES |
| `operationId` stamped on every create/update in `processEntry` | `src/app/push-flow.ts:690,752` | YES |
| `sync.stalePlanMinutes` default 15 | `src/app/config.ts:143` | YES |
| `SyncConfig.stalePlanMinutes: number` | `src/domain/config/types.ts:53` | YES |
| `generateUuidV7()` via `uuid` v7 | `src/domain/identity/uuid.ts:11` | YES |
| `FakeTarget.getProperty` always returns `undefined` | `tests/_helpers/fake-target.ts:182-188` | YES |
| `FakeTarget` port drift: `page.spaceId` reads (port `Page` has no `spaceId`) | `tests/_helpers/fake-target.ts:112,130` vs `src/domain/target/port.ts:31-36` | YES — drift exists |
| `FakeTarget` port drift: `getRestrictions` returns `{read,update,delete}` (port expects `{pageId,restricted}`) | `tests/_helpers/fake-target.ts:234-238` vs `src/domain/target/port.ts:89-93` | YES — drift exists |
| `TargetSystem` port has `getProperty`/`getPage`/`updatePage`/`putProperty` | `src/domain/target/port.ts:101-134` | YES |
| `Conflict { pageId, baseVersion, remoteVersion }` | `src/domain/errors.ts:38-42` | YES |
| `processEntry` Update branch + Conflict→blocked (no retry) | `src/app/push-flow.ts:635-672` | YES |
| `SyncState` has exactly 6 values | `src/domain/state/sync-state.ts:6-13` | YES |
| `applyPlan` sole production caller | `src/cli/commands/sync.ts:75` | YES |

## Probe-Point Audit (10 adversarial probes requested)

1. **Invariant naming (NFR-REL-5/10 not INV-SAFE-3):** PASS. Spec §1 has an explicit invariant-naming note; spec §17 AC-table preamble reiterates it; spec §23 glossary defines INV-SAFE-3 = duplicate-UUID. All 7 `INV-SAFE-3` occurrences in the change folder are corrective (pointing out the issue-body typo), none misuse it for concurrency. `id-prefix-catalog.md:58` confirms INV-SAFE-3 = duplicate-UUID fatal. Test-plan checklist explicitly affirms "NFR-REL-5/NFR-REL-10 are cited (not INV-SAFE-3)."

2. **Pre-staged infrastructure claims:** PASS. All claims verified TRUE against source (table above). No FALSE claim found.

3. **409 retry discipline (max 1 re-fetch + 1 reapply, no loop):** PASS. Spec DEC-2, F-3/F-4, NG-3; plan constraint §"No retry loops" + task 3.4 ("Max 1 re-fetch + max 1 reapply per document — no loop"); TC-409-008 asserts `getPageCalls = 1, updatePageCalls = 2` on the reapply-conflicts-again edge. ADR-0010 C-3 spirit (write-storm avoidance) honored.

4. **Per-document isolation:** PASS. Spec F-4/RSK-6; plan tasks 3.2/3.3 return `{ outcome: "blocked", error: StalePlan }` for that document and the loop continues; TC-ISO-001/002 assert doc A/C blocks while doc B applies.

5. **Decentralized (NFR-REL-10 — no shared coordination service):** PASS. Plan task 2.3: "There is NO shared coordination service: the backing map is the shared Confluence substrate, passed by reference." TC-CONC-006 models two separate `FakeTarget` instances sharing a backing map (the Confluence substrate), not a coordinator. The target IS the substrate, not a coordination service — correctly modeled.

6. **No new MarkSyncError kind:** PASS. Plan constraint §"No new MarkSyncError kind"; tasks 1.2/1.3 return `err({ kind: "StalePlan"; ... })` reusing the pre-staged arm. `assertNeverMarkSyncError` untouched.

7. **Port unchanged (only FakeTarget):** PASS. Plan task 2.1: "do NOT change `src/domain/target/port.ts`." Plan constraint §"No TargetSystem port change." Spec §16 lists the port as Unchanged.

8. **AC ↔ test traceability:** PASS. All 9 spec ACs (AC-F1-1, AC-F1-2, AC-F2-1, AC-F3-1, AC-F3-2, AC-F4-1, AC-F5-1, AC-F6-1, AC-Q-1) map to ≥1 TC. Coverage overview complete; 21 scenarios planned.

9. **OQ-1 resolution (DEC-7):** PASS. Spec §14 flags OQ-1 (plan-timestamp anchoring) as "defer to plan-writer." Plan §"Resolved open questions" resolves it as DEC-7: derive the timestamp from `plan.runId` via a pure `uuidV7Timestamp(uuid): number` extractor — no new `Plan` field. Plan task 1.1 implements the extractor; TC-EXPIRY-001 notes acknowledge the resolution. DM-4 explicitly permitted "a pure derivation," so the resolution is within the spec's allowed options.

10. **FakeTarget port-drift reconciliation:** PASS. Plan task 2.1 explicitly reconciles both drifts fake-side only (the nonexistent `page.spaceId` reads in `createPage`; the `{read,update,delete}` restrictions shape → `{pageId,restricted}`). Test-plan §7 automation table + §8.1 R2 flag the same drift. Verified the drift is real in source.

## Findings

1. [minor] cross_artifact_consistency — test-plan §3.1 Coverage Overview (line 65) maps AC-F1-2 → TC-CONC-005, TC-CONC-006, but TC-CONC-005's own "Related IDs" (line 322) lists only AC-F1-1/AC-F4-1 (it is the single-shared-state NFR-REL-5 test, not the decentralized NFR-REL-10 test). AC-F1-2 is fully covered by TC-CONC-006; TC-CONC-005 is NFR-REL-5. The plan (lines 155, 353) correctly maps AC-F1-2 → TC-CONC-006 only.
   Gap: Coverage-overview row for AC-F1-2 over-includes TC-CONC-005; the scenario-level Related IDs are correct, so this is a summary-table imprecision, not a coverage gap.
   Suggested remediation target phase: test_planning
   Suggested fix: In test-plan §3.1, narrow the AC-F1-2 TC-coverage cell to `TC-CONC-006` (move TC-CONC-005 to the AC-F1-1 row only, where it already appears).

2. [minor] plan_coverage — plan Phase 3 task 3.2 specifies the operation-freshness `getProperty` read as "best-effort parse → remoteOpId (missing/unparseable → undefined = no prior operation)" but does not explicitly state the behavior when `getProperty` itself returns a transport error (`RateLimited`/`RemoteUnreachable`). Spec §21 covers the intended behavior ("surfaces as a per-document block, mirroring GH-23's transport-error handling"), and the Phase-3 "Should" criterion mentions the re-fetch transport-error path — but the initial `getProperty` transport-error path is only implicit in the task description.
   Gap: Task 3.2's "best-effort" language conflates `ok(undefined)` (no prior op = fresh) with a potential `err(transport)` (should block). The coder has spec §21 to fall back on, so delivery is not at risk.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add one clause to task 3.2: "a `RateLimited`/`RemoteUnreachable` from `getProperty` → block that document (preserve GH-23 transport-error policy); only `ok(undefined)`/unparseable-JSON is treated as 'no prior operation = fresh'."

3. [minor] cross_artifact_consistency — test-plan §7 Automation table + §8.1 R2 describe TC-CI-001 as Manual ("Manual validation (YAML parsing, README review)"), but plan Phase 4 task 4.3 adds an automated check (`tests/unit/examples/ci-yaml-validation.test.ts` that parses the YAML and asserts `concurrency.group` + `cancel-in-progress` keys). The plan automates a subset of TC-CI-001 that the test plan marks fully Manual.
   Gap: TC-CI-01's type/automation-level (Manual) understates the planned automation. No AC is untested — the plan is additive (more automation than the test plan expects).
   Suggested remediation target phase: test_planning
   Suggested fix: Update TC-CI-001's Test Type to "Manual + Automated" / Automation Level to "Semi-automated", noting the YAML-validity assertion is automated via `ci-yaml-validation.test.ts` while the README content review remains manual. Alternatively, split into TC-CI-001a (automated YAML validity) + TC-CI-001b (manual README review).

4. [nit] system_spec_consistency — test-plan §8.1 R2 frames the FakeTarget port drift as "causes compile errors when enhanced" (Probability: High). `bun run typecheck` currently exits 0 because `tsconfig.json` `include` is `["src/**/*.ts"]` only — `tests/**` is NOT type-checked, so the `spaceId`/`PageRestrictions` drift is invisible to `tsc`. The drift is real (verified in source) and the Phase-2 reconciliation is correctly scheduled; only the "compile errors" risk framing is overstated. Runtime test execution (not typecheck) is what would surface the mismatch if a test exercises `getRestrictions` or reads `page.spaceId`.
   Gap: Risk R2's trigger ("compile errors") is inaccurate for the current tsconfig; the drift is silent under typecheck.
   Suggested remediation target phase: test_planning
   Suggested fix: Reword R2 to "the pre-existing FakeTarget drift (spaceId, PageRestrictions) is invisible to `tsc` (tests are outside `tsconfig.include`) but will surface as runtime test failures or when the harness is enhanced; the coder reconciles the fake to the port in Phase 2 regardless."

5. [nit] plan_coverage — plan task 3.1 makes `ApplyOptions.stalePlanMinutes` a required field (DEC-8: "prefer the primitive"). The sole production caller (`src/cli/commands/sync.ts:75`) is updated, but existing integration tests that call `applyPlan` (e.g. `apply-plan-integration`, `idempotency`, `duplicate-uuid-fatal`) also construct `ApplyOptions` and will need the new field. Phase 3's "Full suite regression: `bun test`" would catch this, but no task explicitly lists "update existing test callers of `applyPlan`."
   Gap: Implicit cascading update not called out as a task; the coder discovers it during the Phase-3 regression run. Not delivery-blocking.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Either (a) add a sub-task under 3.1 noting "update all existing `applyPlan` callers in `tests/**` to pass `stalePlanMinutes`," or (b) make the field optional with a default (`stalePlanMinutes?: number` defaulting to 15) to avoid the cascade entirely.

## Notes

- No prior readiness records found; this is iteration 1.
- No blocking findings. All 5 findings are minor/nit and do not impede delivery — the coder has sufficient guidance from the spec (esp. §21 for finding 2) and the plan to implement correctly. Findings 1/3/4 are documentation-precision improvements; finding 5 is a routine cascading-update callout.
- The artifacts are notably coherent: spec → test-plan → plan trace cleanly, the pre-staged-infrastructure inventory is accurate (verified against source, not assumed), OQ-1 is resolved at the right authority level (plan-writer, within the spec's permitted options), and the decentralized NFR-REL-10 test model correctly treats the shared backing map as the Confluence substrate rather than a coordination service.
- No `@decision-advisor` escalation is warranted: ADR-0006 C-5/C-6 is settled; DEC-7/DEC-8 are plan-level implementation choices within plan-writer authority; no precedent-setting system decision is introduced.
