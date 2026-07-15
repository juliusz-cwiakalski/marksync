# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-29
Date: 2026-07-15
Pause Required: no
Reviewer: @readiness-reviewer (adversarial DoR gate)

> Independent, read-only critique of spec + test-plan + plan vs the source ticket
> before delivery. Stance: adversarial. This record is the DoR gate output; it does
> not review code and does not modify source.

---

## Facet Summary

- spec_completeness: PASS
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

Blocking facets: `ac_quality`, `cross_artifact_consistency` (driven by a single
MAJOR finding — INV-SEC-1 scenario feasibility — plus three MINOR cross-artifact
drifts). Eight of ten facets PASS. The change is close to ready; one test-plan
revision (and a small spec wording touch) clears the gate.

---

## DoR Criteria Checklist (per `doc/guides/definition-of-ready.md`)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | ACs explicit + testable (Given/When/Then, traced) | **FAIL** | 11 of 12 ACs are clean Given/When/Then and trace to TCs. **AC-F2-4 (INV-SEC-1) is not concretely testable as written** — see Finding 1. |
| 2 | Change label + milestone tag set | PASS | `gh issue view 29` → labels `change, MS-0002` present. |
| 3 | Dependencies identified + resolved | PASS | GH-14 (#40), GH-23 (#58), GH-24 (#59), GH-25 (#60), GH-81 (#82) all **MERGED**. Verified via `gh pr list`. |
| 4 | Spec references relevant ADRs/NFRs | PASS | TDR-0004, TDR-0007, ADR-0006, `testing-strategy.md`, `feature-safe-publish.md` §195-201 all cited (spec §13, §Appendix C). |
| 5 | No open questions blocking delivery | PASS | OQ-1 (cucumber invocation) is genuinely an empirical validate-or-adjust, not a design fork — correctly deferred to delivery (DEC-2). OQ-P2 (INV-SEC-1 sentinel) is mis-specified but **not** a fork — see Finding 1. |
| 6 | Testing approach clear (which tiers) | PASS | BDD (4 INV invariants) + E2E (guarded smoke) + 5-tier verification; tier mapping explicit (test-plan §4, spec Appendix B). |
| 7 | Internal consistency (spec↔test-plan↔plan) | **FAIL** | 3 minor drifts (Findings 1–3) + 1 nit. Headline scope/tier/decision story is consistent. |
| 8 | Scope correctness (DEC-1/3/4 sound) | PASS | DEC-1, DEC-3, DEC-4 all validated sound (see Scope/Decision Validation). DEC-4 has a wording precision nit (Finding 2). |
| 9 | Risk coverage (cucumber/E2E-skip/determinism) | PASS | RSK-1 (cucumber+Bun), RSK-2 (orphan cleanup), RSK-3 (determinism), RSK-6 (partial creds) all addressed with mitigations. |
| 10 | Plan executability (phases discrete/ordered/committable; red intermediate acknowledged) | PASS | 6 phases (A–F), one-commit-sized, correctly ordered, traceability table maps every TC→phase→AC. Red intermediate state (Phase 1→3) explicitly acknowledged (plan §"Acknowledged red intermediate state"). |

---

## Findings

### 1. [MAJOR] `ac_quality` + `cross_artifact_consistency` — INV-SEC-1 BDD scenario injection point is factually wrong and risks delivering a vacuous assertion

**Location:** `chg-GH-29-plan.md` OQ-P2 (lines 57, 211); `chg-GH-29-test-plan.md` TC-BDD-006 (lines 334-371); `chg-GH-29-spec.md` AC-F2-4 (line 280), §5.1 F-2.

**Gap:** INV-SEC-1 is one of the four headline deliverables of this change (the whole point of the BDD tier). The plan's OQ-P2 specifies the scenario as: *"inject a known sentinel secret string into the run inputs (config/provenance path that flows to outputs), run the real `computePlan` + `applyPlan` against `FakeTarget`, then assert the sentinel is absent from the plan result, apply journal, lock file, diagnostics, `version.message`, and cache."*

This is **factually imprecise about where credentials live**. Verified against `src/app/push-flow.ts`:
- `computePlan(config, lock, git, target, mermaidRenderer?)` — `ProjectConfig` has **no credentials field** (only `spaceKey`, `parentPageId`, branch/render/provenance config — see `tests/integration/app/idempotency.test.ts:16-49` for the real `ProjectConfig` shape).
- `applyPlan(plan, target, lock, opts)` — `Plan`/`ApplyOptions` carry **no credentials**.
- Credentials (API token, user email, base URL) live in `ConfluenceTarget` / `ConfluenceClient` (`src/infra/confluence/target.ts:42-63`), i.e. **inside the adapter that this scenario explicitly mocks (`FakeTarget`)**.

Consequences:
- There is **no "config/provenance path that flows to outputs"** for a credential — credentials never enter `computePlan`/`applyPlan`'s data flow. A coder following OQ-P2 literally will not find the injection point.
- The scenario as described is therefore either **vacuous** (the sentinel can't leak because it's never an input) or requires routing credentials through plan/apply, which would **violate DEC-3** (no `src/` changes).
- The plan's own RSK-5 escalation ("if the sentinel leaks → genuine src/ redaction bug → STOP") can never fire, because the sentinel has no path to leak through.

**The proven, realizable pattern already exists** and is not referenced: `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011 (lines 92-202) plants the sentinel **inside the Markdown document body** (`fakeRepo.setFile("doc-a.md", "... Don't leak this: ${fakeToken}")`), then asserts the token does not appear in the Plan JSON, journal, `version.message`, and `ApplyReport`. That is the correct injection point — document **content**, not "config/provenance".

**Note (not blocking, but relevant):** even TC-INTEGRATION-011's semantics are muddled — a token planted in doc content legitimately appears in `entries[].renderedBody`, so "assert Plan JSON does not contain the token" is a weak/near-vacuous assertion of content redaction, not credential redaction. The BDD tier would inherit that weakness. The real INV-SEC-1 protection lives at the CLI redaction layer (ADR-0011 `CommandResult`), which this scenario does not exercise. That is a pre-existing test-design limitation this change mirrors, not introduces — but it is exactly the kind of gap DoR should surface before one of the four release-blocking invariant scenarios is delivered as a near-vacuous green.

**Suggested remediation target phase:** test_planning (primary) + specification (AC-F2-4 / OQ-P2 wording).

**Suggested fix:**
- In the **test plan** (TC-BDD-006) and **plan** (OQ-P2 / task 3.3 / 3.6), pin the concrete sentinel-injection point to the document **content** pattern proven by TC-INTEGRATION-011 (inject sentinel into a fixture `.md` body via `FakeRepository.setFile`), and reference `tests/integration/app/secrets-safety-integration.test.ts` as the reference shape.
- Make the assertion **non-vacuous and explicit**: state precisely which output paths are inspected and why the sentinel cannot legitimately appear there (e.g. `version.message`/journal carry only op/pageId/uuid/outcome — no content; the Plan's `renderedBody` legitimately contains content, so the assertion must be scoped to the non-content output paths, OR reframed as "credential-bearing fields never enter the plan/apply outputs"). Either sharpen the assertion or explicitly document the scenario's scope as an integration-level redundant check whose primary coverage is the unit redaction layer.
- Replace the phrase "config/provenance path that flows to outputs" — it does not exist.

---

### 2. [MINOR] `cross_artifact_consistency` — "mock only the `TargetSystem` port" is contradicted by the plan's own use of `FakeRepository`

**Location:** `chg-GH-29-spec.md` DEC-4 (line 258), AC-F2-5 (line 281), NFR-MAINT-1 (line 203); `chg-GH-29-test-plan.md` TC-BDD-001-006, §4 (lines 109-118); `chg-GH-29-plan.md` task 2.1 (line 163), task 2.3 (line 170).

**Gap:** DEC-4 / AC-F2-5 / NFR-MAINT-1 all state *"only the `TargetSystem` port is mocked"* and *"0 BDD steps mock the state classifier, hierarchy planner, or push flow."* But the plan (task 2.1) and every BDD scenario also mock the **`Repository` port** via `FakeRepository` (`tests/_helpers/fake-repository.ts` implements `Repository`), and the plan explicitly says *"instantiates a fresh `FakeTarget` + `FakeRepository` per scenario"* and *"deterministic Git fixtures via `FakeRepository`."*

The **intent** is correct and consistent with the over-mocking guardrail: the guardrail (`.ai/rules/testing-strategy.md` §"AI-agent over-mocking guardrail", lines 99-120) forbids mocking **lifecycle invariants** and **domain logic** (state classifier, hierarchy planner, push flow). Mocking **adapter ports** (`TargetSystem` *and* `Repository`) is permitted — `FakeRepository` is the same Git-port double the integration tier uses (`idempotency.test.ts:10`). So the design is sound; only the wording is too narrow.

The literal AC-F2-5 wording would make a reviewer fail a correct step definition that uses `FakeRepository`, which is the opposite of the intent.

**Suggested remediation target phase:** specification.

**Suggested fix:** Reword DEC-4 / AC-F2-5 / NFR-MAINT-1 from "only the `TargetSystem` port is mocked" to "only **adapter ports** are mocked (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository`); the state classifier, hierarchy planner, and push flow (`computePlan`/`applyPlan`) are the real modules." Keeps the guardrail's intent exact and matches the plan.

---

### 3. [MINOR] `cross_artifact_consistency` — TC-CHECK-001 implies `bun run check` chains `test:bdd`; it does not

**Location:** `chg-GH-29-test-plan.md` TC-CHECK-001 (lines 681-697).

**Gap:** TC-CHECK-001 step 6 says *"Run `bun run test:bdd` (after BDD is wired; assert exit 0)"* and step 7 says *"Or run `bun run check` if it chains the above."* Verified against `package.json:35`: the `check` script is `lint && format:check && typecheck && test && check:boundaries` — it does **not** include `test:bdd`. AC-2 (`bun run check` green) therefore does not exercise the BDD tier; AC-1 (test:bdd binding in CI) is the separate, correct gate. The test plan's implication that `check` covers BDD is wrong and could lead a reviewer to believe AC-2 verifies BDD when it does not.

**Suggested remediation target phase:** test_planning.

**Suggested fix:** In TC-CHECK-001, drop step 6 / reword step 7 to state plainly that `bun run check` covers lint+format+typecheck+`bun test`+boundaries **only**, and that the BDD tier is verified separately via `bun run test:bdd` (AC-1) in the `ci.yml` fast loop. Make explicit that the two ACs are independently gated.

---

### 4. [MINOR] `cross_artifact_consistency` — TC-BDD-005 invokes `applyPlan`; plan says `applyPlan` is never reached

**Location:** `chg-GH-29-test-plan.md` TC-BDD-005 step 3 (line 316); `chg-GH-29-plan.md` task 2.2 (line 166).

**Gap:** TC-BDD-005 step 3 says *"When `applyPlan` is invoked"*, but plan task 2.2 explicitly notes *"`applyPlan` is NOT reached because `computePlan` aborts at the duplicate-UUID gate, step 4."* The plan's reading is correct (verified: `computePlan` runs `detectDuplicateUuids` at `push-flow.ts:180-183` and returns early before any apply). The test plan's step text contradicts the plan and the engine's actual control flow. (The `.feature` file's `When a sync is run` is ambiguous and resolves to the plan's reading.)

**Suggested remediation target phase:** test_planning.

**Suggested fix:** Reword TC-BDD-005 step 3 to *"When `computePlan` runs (it aborts at the duplicate-UUID gate before any apply)"* and drop the `applyPlan` invocation, aligning with plan task 2.2 and `push-flow.ts:179-183`.

---

### 5. [NIT] `plan_coverage` — Red intermediate state acknowledged, but PR-open timing unspecified

**Location:** `chg-GH-29-plan.md` §"Acknowledged red intermediate state" (line 52), Phase 1 task 1.6 (line 128).

**Gap:** The plan correctly acknowledges that after Phase 1 enables strict mode + undefined-step failure, `bun run test:bdd` is **red by design** until Phase 3 lands all step definitions. This is acceptable for a squash-merged single PR. However, the plan does not state **when the PR may be opened**: the `ci.yml` fast loop runs `test:bdd` on every push/PR, so opening the PR after Phase 1 or 2 would show a red `BDD lifecycle invariants (cucumber)` check on intermediate pushes until Phase 3. For a clean review experience, the PR should be opened no earlier than Phase 3 (all features green).

**Suggested remediation target phase:** delivery_planning.

**Suggested fix:** Add a one-line note to the plan (Phase 1 or rollout section): *"Open the PR at/after Phase 3 (all 4 invariant features green) to avoid red intermediate CI on the `test:bdd` step; intermediate Phase 1–2 commits are red-by-design on the feature branch."*

---

## Scope / Decision Validation

### DEC-1 — BDD scoped to 4 INV invariants; NFR-PERF-4 / NFR-REL-5 stay in integration. **SOUND.**

- **Story alignment:** The story scope-note (`MS2-E5-S1--quality-gate-wiring.md:34`) explicitly permits moving the two additive NFR scenarios to integration: *"If the BDD tier must stay literal to TDR-0007, move the two additive scenarios to the integration tier instead — either way they remain gated."* DEC-1 exercises that option.
- **Current-truth alignment:** `testing-strategy.md:34` scopes BDD to *"Lifecycle invariants only (INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1)"* and lists `NFR-PERF-4` under Integration (line 87). TDR-0007 §70-73 fixes the BDD floor at the four `INV-*`. DEC-1 is literal to both.
- **Coverage claim VERIFIED (not just asserted):**
  - NFR-PERF-4 (idempotent rerun, 0 writes) → `tests/integration/app/idempotency.test.ts` TC-INTEGRATION-005 (line 60: *"Second unchanged push → every entry NO_CHANGE → 0 writes (NFR-PERF-4)"*). Real coverage: drives real `computePlan`+`applyPlan`, asserts `getWriteCount()===0`, `createPageCalls.length===0`, `updatePageCalls.length===0`.
  - NFR-REL-5 (overlapping plans, older loses) → `tests/integration/app/concurrency-control-overlap.test.ts` TC-CONC-005 (line 39: *"single shared-state fake (NFR-REL-5)"*) + `concurrency-isolation.test.ts` (per-document isolation). Real coverage.
- **Verdict:** No duplication, no coverage gap. Both NFRs remain gated. DEC-1 is the correct call.

### DEC-3 — No `src/` changes; escalate genuine bugs. **SOUND.**

- Verified that `computePlan`/`applyPlan` (`src/app/push-flow.ts`) accept their dependencies as injected ports (`git: Repository`, `target: TargetSystem`), so BDD step definitions can drive the real engine with `FakeTarget`/`FakeRepository` **without touching `src/`**.
- Verified `ConfluenceTarget.fromCredentials(credentials, spaceId, options)` exists at `src/infra/confluence/target.ts:54-63` — so the Phase 5 live-sandbox harness can construct the real adapter with **no `src/` change**. (Plan's factory claim is accurate.)
- The STOP+escalate-on-real-bug discipline (RSK-5) is correctly framed as a hard condition, not a task. Sound.
- **Caveat:** the only scenario at risk of needing a `src/` touch is INV-SEC-1 if the coder follows OQ-P2 literally — see Finding 1. With the test-plan revision, DEC-3 holds cleanly.

### DEC-4 — Mock only the adapter ports (domain logic stays real). **SOUND in intent, imprecisely worded.**

- Intent is correct and consistent with the over-mocking guardrail: real `computePlan`/`applyPlan`/`classify`/`actionFor`/`detectDuplicateUuids`, mocked `TargetSystem` (+ `Repository` for Git fixtures). Verified feasible against `push-flow.ts` signatures and `FakeTarget`/`FakeRepository` shapes.
- Wording precision issue only — see Finding 2.

---

## Recommendation

**Verdict: NOT_READY.** Do not start delivery.

The change is high-quality and 8/10 facets PASS. The single blocking thread is **Finding 1 (INV-SEC-1 scenario feasibility)** — one of the four release-blocking invariants the BDD tier exists to enforce has a factually-wrong injection-point specification (`OQ-P2`) and risks being delivered as a vacuous green. The remaining findings are precision drifts that should be bundled into the same revision pass.

**Reopen:** `test_planning` (primary) + a small `specification` touch.

**Required before re-running DoR:**
1. **[Finding 1]** Pin the INV-SEC-1 sentinel-injection point to the document-content pattern proven by `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011; make the non-vacuous assertion semantics explicit; correct the "config/provenance path" wording in plan OQ-P2 / task 3.3 / 3.6 and test-plan TC-BDD-006.
2. **[Finding 2]** Reword DEC-4 / AC-F2-5 / NFR-MAINT-1 to "only adapter ports mocked (`TargetSystem` + `Repository`); domain logic real" (spec).

**Recommended (bundle, non-blocking but cheap):**
3. **[Finding 3]** Correct TC-CHECK-001: `bun run check` does not chain `test:bdd`.
4. **[Finding 4]** Align TC-BDD-005 step 3 with plan task 2.2 (`applyPlan` not reached).
5. **[Finding 5]** Add a one-line PR-open-timing note (after Phase 3) to avoid red intermediate CI.

No `needs_human_input` decisions; no new decision record required (DEC-1 is a change-scoped interpretation explicitly permitted by the story scope-note, not a precedent-setting system decision). `Pause Required: no` — the revision is mechanical and does not need human input. Re-run DoR after the test-plan + spec touch; expected to reach READY on iteration 2.
