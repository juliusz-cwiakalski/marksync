# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-23
Date: 2026-07-12
Pause Required: no

## Facet Summary
- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS (with guardrail-tier caveat — see finding 3)
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

1. [MAJOR] cross_artifact_consistency — `chg-GH-23-test-plan.md` §5.2 TC-INTEGRATION-009 (steps 3 & 6) vs `chg-GH-23-plan.md` PD-3 / Phase 6.7
   Gap: The test plan asserts malicious path/ref inputs return `err({ kind: "BadPath", ... })` / `err({ kind: "BadRef", ... })`. These arms DO NOT EXIST in `src/domain/errors.ts` (`MarkSyncError` has no `BadPath`/`BadRef` kinds) and DM-8 / NG-6 forbid adding them. The plan (PD-3, Phase 1.4, Phase 6.7) resolves this by having the pure path/ref guard `throw` (invariant violation) before any spawn. The two artifacts therefore prescribe contradictory observable behavior on a security-relevant AC (AC-F12-1 / NFR-17): the test plan expects a `Result.err`, the plan expects a `throw`. A coder following the test plan literally would write non-compiling code (`BadPath` is not a valid kind); one following the plan would make the test plan's assertion fail.
   Suggested remediation target phase: test_planning
   Suggested fix: Rewrite TC-INTEGRATION-009 steps 3 & 6 to assert the guard throws before any spawn (matching plan PD-3 / Phase 6.7), retaining the "0 shell-execution surfaces" assertion. Remove all references to the non-existent `BadPath`/`BadRef` arms. Verify the §1.1 scope ("shell-git path validation") and §3.1 row are neutral to the throw-vs-err choice.

2. [MAJOR] spec_completeness — `chg-GH-23-spec.md` §5.1 F-1 (step ordering) vs §6 Flow 1 and §24 Appendix
   Gap: §5.1 F-1 orders the pipeline as (1) assertBranchAllowed; (2) `detectDuplicateUuids`; (3) discover committed docs via `readCommitted`. Detecting duplicate UUIDs requires the discovered documents as input, so step (2) before step (3) is logically impossible. §6 Flow 1 and §24 Appendix both prescribe the correct order (discover → detectDuplicateUuids). The plan (Phase 4) explicitly noticed and corrected this ("NOT §5.1's logically-impossible prose"), but the spec — which the plan names the "contract authority" — contradicts itself. A coder reading §5.1 in isolation would be misled.
   Suggested remediation target phase: specification
   Suggested fix: Reorder §5.1 F-1 steps to (1) assertBranchAllowed; (2) discover via `readCommitted`; (3) `detectDuplicateUuids`, matching §6 Flow 1 and §24. No other section needs change.

3. [MAJOR] test_traceability — `chg-GH-23-test-plan.md` §4.2 / §5.1 (TC-UNIT-001, TC-UNIT-005/006) vs `.ai/rules/testing-strategy.md` §"over-mocking guardrail"
   Gap: The testing-strategy guardrail (a "hard guardrail") states lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) "MUST be validated at least once through integration or E2E paths, never through mocks alone." INV-SAFE-1 (TC-INTEGRATION-001/002) and INV-SAFE-2 (TC-INTEGRATION-003) are integration-tier. But INV-SAFE-3 (duplicate-UUID fatal) is covered ONLY by TC-UNIT-001 (unit, fake Repository), and INV-SEC-1 (no secrets) ONLY by TC-UNIT-005/006 (unit). The test plan's §"Over-Mocking Guardrail Compliance" claims full compliance without addressing this tier gap. (Mitigating: the unit tests DO use REAL `detectDuplicateUuids` and REAL domain logic — only the I/O ports are faked — so this is a tier-placement gap, not a false-confidence/mocked-logic gap.)
   Suggested remediation target phase: test_planning
   Suggested fix: Add one integration-tier scenario for INV-SAFE-3 (real temp git repo with two docs sharing a UUID → `computePlan` aborts with `DuplicateUuid`, 0 writes) and surface the INV-SEC-1 token-absence assertion inside an existing integration test (e.g. TC-INTEGRATION-005/008) so both invariants have at least one integration-tier validation. Alternatively, document an explicit justification in the test plan for why unit-tier with real domain logic satisfies the guardrail for these two pure/output invariants.

4. [MAJOR] plan_doc_update_coverage — `chg-GH-23-plan.md` Phase 8.5 doc-handoff list vs `doc/overview/architecture-overview.md` §"Module governance"
   Gap: The architecture-overview classifies "Push executor" (line 99: "Ordered safe writes via `TargetSystem` port; journal; optimistic concurrency") and "Lock/journal store" (line 101: "Lock atomic write, journal replay, repair-state") as **infrastructure**. The spec/plan place `applyPlan`'s write loop and the journal writer in the **application** tier (`src/app/push-flow.ts`, `src/app/journal.ts`), reusing only the infra `writeAtomic` primitive from `src/infra/lock/store.ts`. The plan's Phase 8.5 doc-sync list reconciles `readCommitted`/`worktreeStatus` interface rows and tags the push-flow diagram, but does NOT list reconciling the "Push executor" and "Lock/journal store" tier rows. Post-delivery the system spec will contradict the code (infrastructure vs application) unless the doc-syncer is told to update them.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add an explicit Phase 8.5 (phase-7 doc-sync) item: reconcile architecture-overview §"Module governance" — reclassify "Push executor" as realized by the application-tier use case (`src/app/push-flow.ts`), and clarify that the journal writer is application-tier (`src/app/journal.ts`) while the atomic-write primitive remains infra (`src/infra/lock/store.ts`). Also reconcile the interface-contracts error column (`RefNotFound`/`BadPath` → throw per PD-3, since those arms are not in the union).

## Non-blocking Observations (advisory)

- Ticket GH-23 labels its second AC "INV-SAFE-3: overlapping plans, older doesn't overwrite", but the story file (lines 20, 28) and ADR-0006 (lines 193, 216) define INV-SAFE-3 = duplicate-UUID fatal; the "overlapping plans" requirement is NFR-REL-5 in the story (line 63). The spec correctly follows the story/ADR (duplicate-UUID fatal = AC-F2-1; overlapping plans/409-drift = AC-F3-1), so no requirement is lost — only the ticket's label is loose. Consider adding a one-line traceability note mapping the ticket's "INV-SAFE-3" wording to AC-F3-1.
- The journal `op` field includes `"move"` (DM-4) and the spec/plan reference "creates/moves" in parent-first ordering (§5.1 F-2, PD-6), but the GH-22 `Action` union has no `Move` arm, `PlanAction` adds only `Create`, and `UpdatePageRequest` has no `parentId` field — so a `move` op is unreachable for MS-0002 (hierarchy is flat-under-configured-parent per plan Phase 4). The `move` arm is forward-looking; consider noting it as deferred to avoid implying delivered-but-unreachable behavior.
- Spec §7.1 claims integration coverage includes "move", but neither the test plan nor the plan defines a move test (correctly, since move is unreachable). Trim the over-claim.
- Story NFR-REL-9 AC text says version.message starts with `marksync:squash`; spec DEC-3 overrides to the shipped `marksync git` format. This is a documented, justified PM decision (pm-notes decision #3) — acceptable; just noting the prose deviation is captured.
- CLI stub signature changes from synchronous `CommandResult<never>` to `Promise<CommandResult<Plan>>` (plan Phase 7). Additive on pre-release stubs — fine.

## Strengths

- AC coverage is complete and bidirectionally traced: every story AC + every ticket AC maps to a testable spec AC (Given/When/Then, §17), and every spec AC maps to ≥1 concrete TC (§3.1, traceability matrix §9). No orphan AC, no uncovered requirement.
- Reused contracts were READ from source, not assumed. Spot-verified all claimed signatures against `src/`: `TargetSystem` port (`parentId` not `parentPageId`, `message?` present), `classify`/`actionFor`/`SyncState`/`RemoteState`/`SharedBase`, `ContentHash`/`buildContentHash`, `loadLock`/`saveLock`/`mergeBindings`, `assertBranchAllowed(branch, config)`, `ensureCacheLayout`/`resolveCacheDir`, `detectDuplicateUuids(DocWithUuid[])`, `reconcileWithProperty`/`MetadataProperty`, `formatVersionMessage(ProvenanceInput)` (field `headCommit`), `CommandResult`/`ok`/`err`, `MarkSyncError` union, CLI stubs, `.gitkeep`, `armCrashAfterTempWrite`. All match the plan's claims.
- DM-8 (no new error arms) is sound: every engine outcome (Conflict, RemoteMissing, DuplicateUuid, Forbidden, UnresolvedLink, RateLimited, RemoteUnreachable, ForbiddenBranch, LockDirty) maps to an existing arm. The plan's PD-3 throw-on-malicious-path keeps this intact.
- The "four live dep-cruiser rules" claim is accurate (verified in `.dependency-cruiser.cjs`): no `app-may-not-import-infra` rule exists, so PD-9's app→infra provenance import is valid. The plan correctly handles the presentation→infra barrier via a `src/app/ports.ts` factory.
- Tier placement is otherwise correct: link resolver = domain, shell-git adapter = infra, use cases = app, CLI shells = presentation.
- Over-mocking guardrail is honored in substance (classify/actionFor/loadLock/saveLock/assertBranchAllowed/detectDuplicateUuids/formatVersionMessage/reconcileWithProperty all REAL; only ports + crash-hook mocked) — the gap is tier placement for 2 invariants, not mocked logic.
- Decisions are captured in the right place (DEC-1..7 in spec; PD-1..11 in plan; PM notes decisions). DoD is clear and testable (§17 AC table = story DoD).
- Out-of-scope discipline is strong: E3-S7 retry/dedup, E4 attachments, reverse sync, bounded concurrency >1, and new error arms are all explicitly excluded.
