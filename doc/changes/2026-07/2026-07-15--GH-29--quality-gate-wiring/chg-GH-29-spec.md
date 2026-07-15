---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-29
  type: test
  status: Proposed
  slug: quality-gate-wiring
  title: "[MS2-E5-S1] Quality gate wiring (all 6 test tiers)"
  owners: ["@cwiakalski"]
  service: marksync-cli
  labels: ["test", "MS-0002", "MS2-E5", "priority:high", "ci", "bdd", "e2e"]
  version_impact: none
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: [push-flow, target-system-port, ci, testing-strategy]
    external: ["@cucumber/cucumber", "Confluence Cloud REST API (sandbox)"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Close the last two gaps in the testing strategy — the Gherkin/BDD lifecycle-invariant gate and the live-sandbox E2E harness — and make `bun run test:bdd` binding in CI, so the four release-blocking invariants (INV-SAFE-1/2/3, INV-SEC-1) are enforced through the integration-level BDD path that TDR-0007 / `testing-strategy.md` mandate and the live-sandbox gate has a real smoke test to run.

## 1. SUMMARY

This change wires the two remaining unwired tiers of the testing strategy. **BDD:** it installs `@cucumber/cucumber` as a `devDependency`, authors three new `.feature` files (the fourth, `duplicate-uuid-fatal.feature`, already exists) plus step definitions that drive the **real** `computePlan` + `applyPlan` against a mocked `TargetSystem` port, and replaces the no-op `test:bdd` script with a binding runner invoked in the CI fast loop. **E2E:** it adds a thin runner and a guarded smoke test under the live-sandbox tier that skips gracefully when `MARKSYNC_E2E_*` secrets are absent and runs + cleans up when they are present (the existing `run-e2e.yml` already wires the secrets and triggers).

The other five tiers (unit, integration, golden, mermaid-DOM, e2e-mock) and the CI fast loop + coverage gate are already wired and green — this change **verifies** them, it does not re-implement them. This is pure test/CI infrastructure: **no production source changes** (DEC-3). Per the PM-decided BDD scope (DEC-1), the BDD tier covers exactly the four `INV-*` invariants; `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) stay in the integration tier, where both are already covered.

## 2. CONTEXT

### 2.1 Current State Snapshot

The PM intake assessment (`chg-GH-29-pm-notes.yaml`) verified the tier state on `main` against `testing-strategy.md`:

| # | Tier | State on `main` |
|---|------|-----------------|
| 1 | Unit | Wired — `tests/unit/` populated, in the CI fast-loop `Test` step |
| 2 | Integration (mocked Confluence) | Wired — `tests/integration/` populated (`Bun.serve` mock + `FakeTarget`), in the fast loop |
| 3 | Golden fixtures | Wired — `tests/golden/` snapshots committed, `--update-snapshots` explicit, in the fast loop |
| 4 | Mermaid-DOM (happy-dom) | Wired — `tests/mermaid.preload.ts` registered in `bunfig.toml [test].preload` (populated by GH-25) |
| 5 | Gherkin / BDD | **GAP** — `@cucumber/cucumber` not installed; `test:bdd` is a no-op stub; only `tests/bdd/features/duplicate-uuid-fatal.feature` exists; no step definitions |
| 6 | E2E (mock) | Wired by GH-81 — `tests/e2e-mock/`, separate secrets-free `ci.yml` job |
| 7 | E2E (live-sandbox) | **GAP** — `tests/e2e/` is empty (`.gitkeep` only); `run-e2e.yml` exists and is correct (schedule + `run-e2e` label + `workflow_dispatch`; concurrency group `e2e-sandbox`; secrets wired) but has nothing to run |

> The story title says "all 6 tiers" (written before GH-81 added the mock-e2e tier as a 7th). The testing-strategy tier model — the authoritative current-truth — documents 7 tiers; this change wires the 2 gaps (#5 BDD, #7 live-sandbox) and verifies the other 5.

CI fast loop (`.github/workflows/ci.yml`): `commitlint`, `lint`, `typecheck`, `Test (unit+integration+golden --coverage)`, `check:boundaries`, `test:bdd` (currently no-op), `e2e-mock` job, `dependency-audit`, `osv-scan`, `doc-yaml-lint` + link-check — all present and binding. Coverage gate in `bunfig.toml`: `lines = 0.70, functions = 0.80` (already adjusted per OQ-1).

### 2.2 Pain Points / Gaps

- **The BDD tier is a no-op.** The four release-blocking lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are not enforced through the integration-level BDD path that TDR-0007 and the over-mocking guardrail mandate. A regression of an invariant could merge with no BDD-level signal; the `test:bdd` step in `ci.yml` always exits 0.
- **The live-sandbox E2E harness is empty.** `run-e2e.yml` is wired to run `bun test tests/e2e/` against the sandbox, but the directory has no tests — the gate is vacuously green. There is no smoke test proving the real adapter talks to a real Confluence space, and no cleanup helper to delete created pages.
- **Only one invariant feature exists, and only as a draft.** `duplicate-uuid-fatal.feature` (INV-SAFE-3) was contributed by GH-18 with an explicit note that its step definitions wire in this story; INV-SAFE-1, INV-SAFE-2, and INV-SEC-1 have no `.feature` files at all.

## 3. PROBLEM STATEMENT

Because the BDD tier is a no-op stub and the live-sandbox E2E directory is empty, the four release-blocking lifecycle invariants are not enforced through the integration-level Gherkin path that TDR-0007 / `testing-strategy.md` require, and the separate `run-e2e.yml` gate has no real smoke test to exercise the adapter against a live Confluence space — so contributors cannot rely on CI to prove the safety invariants hold at the integration level, and the live-sandbox gate is vacuously green rather than meaningfully green.

## 4. GOALS

- **G-1**: `bun run test:bdd` runs the four lifecycle-invariant features (INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1) and passes them at integration level — driving the real sync engine against a mocked `TargetSystem` port.
- **G-2**: The `test:bdd` step in `ci.yml` is **binding**: it fails the PR on any invariant regression (the no-op stub is replaced with a real runner).
- **G-3**: The BDD step definitions honor the over-mocking guardrail — they mock only the `TargetSystem` port, never the state classifier, hierarchy planner, or push flow.
- **G-4**: The live-sandbox E2E tier has a thin runner + a guarded smoke test that skips cleanly when `MARKSYNC_E2E_*` secrets are absent (exit 0 locally and in the secrets-free CI path) and runs + cleans up when they are present, driven by the existing `run-e2e.yml`.
- **G-5**: The five already-wired tiers (unit, integration, golden, mermaid-DOM, e2e-mock) plus the CI fast loop and coverage gate are verified green — not re-implemented.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| BDD invariant features passing | 4 of 4 (INV-SAFE-1/2/3, INV-SEC-1) |
| `test:bdd` CI step behavior | Binding (non-zero exit on invariant regression) |
| Tiers mocked by BDD steps | 1 (`TargetSystem` port only — over-mocking guardrail) |
| Production source files changed | 0 (DEC-3) |
| New secrets required by the fast loop | 0 |
| Live-sandbox E2E exit code without secrets | 0 (skip) |
| Live-sandbox E2E behavior with secrets | runs + deletes every page it created |
| Total tiers runnable via documented commands | 7 (5 verified + 2 wired) |

### 4.2 Non-Goals

- **NG-1**: No `NFR-PERF-4` (idempotent rerun) or `NFR-REL-5` (overlapping-plans) BDD scenarios. Both are already covered in the integration tier (`tests/integration/app/idempotency.test.ts`, `concurrency-control-overlap.test.ts`, `concurrency-isolation.test.ts`); per DEC-1 they stay there, literal to TDR-0007 / `testing-strategy.md`.
- **NG-2**: No production source changes. If a step definition reveals a genuine `src/` bug, STOP and surface it to the PM rather than fixing `src/` in this change (DEC-3).
- **NG-3**: No performance benchmark suite — deferred to `MS-0003+` per `testing-strategy.md`.
- **NG-4**: No multi-space E2E — single dedicated sandbox space per the story.
- **NG-5**: No BDD steps beyond the four lifecycle invariants — Gherkin is scoped to "lifecycle invariants only" (`testing-strategy.md`).
- **NG-6**: No changes to `run-e2e.yml`, `ci.yml` beyond making `test:bdd` real, or `bunfig.toml` coverage thresholds — those are already correct; this change wires content into them, not rewrites them.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Binding BDD lifecycle-invariant gate | A real `@cucumber/cucumber` runner, invoked via `bun run test:bdd`, makes the four release-blocking invariants executable in the CI fast loop and fails the PR on regression — closing the vacuous-pass gap |
| F-2 | Integration-level invariant step definitions | Step definitions that drive the real `computePlan` + `applyPlan` against a mocked `TargetSystem` port enforce each invariant through the integration path the over-mocking guardrail requires, not through a mocked invariant |
| F-3 | Guarded live-sandbox E2E harness | A thin runner + smoke test that skips without secrets and runs + cleans up with them turns the vacuously-green `run-e2e.yml` into a meaningful, non-flaky live gate |
| F-4 | Tier verification | Confirm the five already-wired tiers + the CI fast loop + coverage gate are present, runnable, and green on a clean PR — verifying the floor, not re-laying it |

### 5.1 Capability Details

**F-1: Binding BDD lifecycle-invariant gate**
`@cucumber/cucumber` is added as a `devDependency` (test-only — excluded from `bun build --compile`, so zero binary/runtime impact, per TDR-0007 C-5). The no-op `test:bdd` script is replaced with a real cucumber-js invocation against `tests/bdd/features/` that runs under Bun (per TDR-0007 C-2 — a standalone CLI runner, not a `bun:test` plugin). The exact invocation is the working cucumber-js-under-Bun form validated at delivery (DEC-2 / OQ-1); the existing stub already targets `bunx cucumber-js tests/bdd/features`, which is the candidate. The four features are: `no-silent-overwrite.feature` (INV-SAFE-1), `no-silent-recreate-remote-missing.feature` (INV-SAFE-2), `duplicate-uuid-fatal.feature` (INV-SAFE-3 — already authored), `no-secret-in-output.feature` (INV-SEC-1). Cucumber strict / undefined-step options are enabled so a vacuous `Then` or a silently-skipped scenario is a release-blocking failure (TDR-0007 Implementation Plan §"Risk mitigation").

**F-2: Integration-level invariant step definitions**
Steps live under `tests/bdd/steps/` and call the real `computePlan` + `applyPlan` from `src/app/push-flow.ts`. Each scenario sets up local Git fixtures + mock remote state, runs plan+apply, and asserts the invariant + zero-write / zero-overwrite behavior. The mocked target is a `TargetSystem` port implementation — it MAY reuse the existing `FakeTarget` (`tests/_helpers/fake-target.ts`, already used by the integration tier) or a `Bun.serve()` mock consistent with the e2e-mock server. **Hard constraint (over-mocking guardrail, TDR-0004 / `testing-strategy.md` §"AI-agent over-mocking guardrail"): the step definitions MUST NOT mock the state classifier, hierarchy planner, or push flow — only the `TargetSystem` port.** Deterministic local Git fixtures reuse `tests/_helpers/fake-repository.ts` (R3). This is the same "real engine + mock port" shape the integration tier already proves.

**F-3: Guarded live-sandbox E2E harness**
The harness lives under `tests/e2e/`. A thin runner constructs the real adapter against the sandbox base URL and credentials from the `MARKSYNC_E2E_*` env vars; a guarded smoke test asserts at minimum a create + read + delete round-trip against the dedicated sandbox space. **Guard:** when any required `MARKSYNC_E2E_*` secret is absent, the test skips (exit 0) so `bun test tests/e2e/` stays green locally and in any secrets-free path; the separate `run-e2e.yml` gate supplies the secrets on schedule / `run-e2e` label / `workflow_dispatch`. **Cleanup:** every page created in a run is deleted at the end of that run (best-effort, run-scoped), with a nightly sweep as the backstop (R2). The harness respects the sandbox hygiene rules in `testing-strategy.md` §"Live-sandbox hygiene" (single dedicated space, concurrency-group 1, credentials in GitHub Actions secrets).

**F-4: Tier verification**
The five already-wired tiers are confirmed runnable via their documented commands (unit/integration/golden via the fast-loop `Test` step; mermaid-DOM via `bunfig.toml [test].preload`; e2e-mock via the `ci.yml` `e2e-mock` job) and the CI fast loop + coverage gate are confirmed green on a clean PR. This is a verification pass, not re-implementation: any defect found is surfaced, not silently fixed in `src/` (DEC-3).

## 6. USER & SYSTEM FLOWS

```
Flow 1: Contributor opens a PR that regresses an invariant (e.g. REMOTE_AHEAD
        no longer blocks)
  PR → ci.yml fast-loop runs `bun run test:bdd`
    → cucumber-js loads tests/bdd/features/*.feature + tests/bdd/steps/*
    → INV-SAFE-1 scenario: real computePlan/applyPlan vs mocked TargetSystem
      → step asserts the drifted doc is Blocked, never auto-overwritten
    → scenario FAILS → `test:bdd` step fails the PR (binding, not no-op)

Flow 2: BDD scenario honoring the over-mocking guardrail (INV-SAFE-2)
  Given a managed page whose remote was deleted (mocked TargetSystem → RemoteMissing)
    When computePlan + applyPlan run WITHOUT --adopt/--rebind
    Then the REMOTE_MISSING doc is Blocked (never silently re-created)
    And 0 createPage calls reach the target
  (the state classifier + push flow are the REAL modules; only TargetSystem is mocked)

Flow 3: Contributor runs `bun test tests/e2e/` locally (no secrets)
  → guarded smoke test detects MARKSYNC_E2E_* absent → skip → exit 0 (green)

Flow 4: run-e2e.yml fires (nightly / run-e2e label / dispatch) with secrets
  → smoke test constructs the real adapter vs the sandbox
    → create page → read it back → delete it (run-scoped cleanup)
  → exit 0 on success; the created page does not outlive the run
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Adding `@cucumber/cucumber` (+ types) as a `devDependency`.
- Three new `.feature` files: `no-silent-overwrite.feature` (INV-SAFE-1), `no-silent-recreate-remote-missing.feature` (INV-SAFE-2), `no-secret-in-output.feature` (INV-SEC-1). The fourth (`duplicate-uuid-fatal.feature`, INV-SAFE-3) already exists.
- BDD step definitions under `tests/bdd/steps/` driving the real `computePlan`/`applyPlan` against a mocked `TargetSystem` port (reusing `FakeTarget`/`FakeRepository` or a consistent `Bun.serve()` mock).
- Replacing the no-op `test:bdd` script with a real, binding cucumber-js invocation that works under Bun (DEC-2 / OQ-1).
- The thin live-sandbox E2E runner + guarded smoke test + run-scoped cleanup helper under `tests/e2e/`.
- Verification of the five already-wired tiers, the CI fast loop, and the coverage gate.

### 7.2 Out of Scope

- [OUT] Any change to production source under `src/` (DEC-3). A step definition that exposes a genuine `src/` bug is escalated to the PM as a separate change.
- [OUT] BDD scenarios for `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) — both already covered in the integration tier; per DEC-1 they stay there.
- [OUT] Performance benchmark suite (deferred to `MS-0003+`).
- [OUT] Multi-space E2E (single dedicated sandbox space).
- [OUT] BDD steps beyond the four lifecycle invariants.
- [OUT] Rewriting `run-e2e.yml`, the e2e-mock tier, or the `bunfig.toml` coverage thresholds — already correct.

### 7.3 Deferred / Maybe-Later

- A richer live-sandbox E2E scenario set (409 version-conflict, content properties, attachments) is a candidate follow-up for MS2-E5-S3 (adversarial corpus) and regression runs — the smoke test delivered here is the reusable harness those scenarios plug into.
- Conflict-recovery / Mermaid-determinism BDD scenarios, if the invariant floor proves stable and the suite is to grow — TDR-0007's revisit trigger caps the BDD tier at a small, high-value set.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

No new endpoints. BDD scenarios drive the existing sync engine; the mocked `TargetSystem` port stands in for the Confluence REST surface (the contract is owned by the adapter, already exercised by the integration + e2e-mock tiers). The live-sandbox smoke test calls the **existing** Confluence Cloud REST endpoints (v2 pages create/get/put, v1 cleanup) against the dedicated sandbox space — no new contract is introduced.

### 8.2 Events / Messages

N/A — no new events or message formats.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | BDD Git fixtures | Test-only: small committed Markdown corpora with `marksync:uuid` front-matter + configured mock remote state per scenario; not part of any production data model |
| DM-2 | E2E sandbox pages | Test-only, ephemeral: pages created by a run are deleted at the end of that run; the sandbox carries no persistent data model from this change |

### 8.4 External Integrations

- **`@cucumber/cucumber`** — new `devDependency`; runs under Bun via its Node-compatible CLI (`cucumber-js`); test-only, excluded from the compiled binary (TDR-0007 C-5).
- **Confluence Cloud sandbox** — the live-sandbox smoke test talks to the real REST API via the `MARKSYNC_E2E_*` credentials, restricted to the single dedicated test space; no other external integration is added.

### 8.5 Backward Compatibility

No production interfaces change. The `test:bdd` script's external behavior shifts from "always exit 0" to "exit non-zero on invariant regression" — that is the intended upgrade from stub to gate, not a compatibility break. The E2E tier is additive. Existing tiers, both CI workflows, and the coverage gate continue to pass unchanged.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-CI-1 | BDD tier binding in the fast loop | `bun run test:bdd` runs in the `ci.yml` fast-loop and fails the pipeline on any invariant violation (strict mode + undefined-step failure enabled) |
| NFR-CI-2 | BDD tier runtime budget | The full 4-feature BDD suite completes in ≤ 30 s on the CI runner (in-process engine + mocked port, no network, no sleeps) |
| NFR-CI-3 | Live-sandbox skip-without-secrets | `bun test tests/e2e/` exits 0 when any required `MARKSYNC_E2E_*` secret is absent (no error, no flake) |
| NFR-CI-4 | Live-sandbox run-with-secrets + cleanup | With secrets present, the smoke test runs against the sandbox and deletes every page it created (0 pages outlive the run barring an API failure, which is logged) |
| NFR-MAINT-1 | Over-mocking guardrail honored | 0 BDD steps mock the state classifier, hierarchy planner, or push flow; only the `TargetSystem` port is mocked |
| NFR-MAINT-2 | No production change | 0 production source files modified (DEC-3) |
| NFR-MAINT-3 | Test-only dependency | `@cucumber/cucumber` is a `devDependency`; the compiled binary size is unchanged (`bun build --compile` excludes it) |
| NFR-MAINT-4 | E2E sandbox hygiene | Single dedicated space; concurrency-group 1; credentials in GitHub Actions secrets only (never in the repo) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A for production telemetry. CI signal: the `test:bdd` step pass/fail and the coverage report (already produced by the fast loop) are the gates. BDD failures must surface a readable Given/When/Then trace (cucumber's default formatter) so the regressed invariant is obvious. E2E failures must log the created page id(s) so an orphaned page can be swept.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Cucumber + Bun interop friction — `cucumber-js` is flaky or fails under the pinned Bun (story R1; TDR-0007 OPEN-Q9) | H | M | Validate the working invocation at delivery (OQ-1); the existing stub already targets `bunx cucumber-js tests/bdd/features` — confirm or adjust; record the chosen form in the spec/commit (DEC-2). Fall back to a bun-native entry only if the CLI is unworkable | L |
| RSK-2 | E2E sandbox leaves orphaned pages — a run crashes mid-write or cleanup fails (story R2) | M | M | Run-scoped cleanup (delete every page created in the run, best-effort) + a nightly sweep backstop (story R2); log created page ids on failure; concurrency-group 1 prevents inter-run version noise | L |
| RSK-3 | BDD step defs need deterministic Git fixtures; non-deterministic UUIDs/timestamps make scenarios flaky (story R3) | M | M | Reuse `FakeRepository` (deterministic, already used by the integration tier); use fixed UUID-v7 fixtures; assert on counts/states, never on wall-clock | L |
| RSK-4 | Over-mocking drift — a step definition mocks the classifier/engine "to make the scenario easy," silently neutering the invariant | H | L | Call out the guardrail as a hard constraint (NFR-MAINT-1, §5.1 F-2); code-review each step against the "mock only `TargetSystem` port" rule; the sibling integration tests are the reference shape | L |
| RSK-5 | A step definition reveals a genuine `src/` invariant bug mid-delivery | H | L | DEC-3: do not fix `src/` inline; STOP and surface to the PM as a separate change; the BDD scenario is recorded as failing-on-real-bug, not papered over | L |
| RSK-6 | E2E skip logic leaks secrets or runs with partial credentials, hitting the real API half-configured | M | L | Treat the secret set as all-or-nothing: if any required `MARKSYNC_E2E_*` var is missing, skip entirely; never construct credentials from partial input | L |

## 12. ASSUMPTIONS

- The existing `test:bdd` stub invocation (`bunx cucumber-js tests/bdd/features`) is the correct cucumber-js-under-Bun shape, validated at delivery (OQ-1 / DEC-2); `@cucumber/cucumber`'s CLI runs cleanly under the pinned Bun 1.2.23 (TDR-0007 OPEN-Q9, to be confirmed).
- `FakeTarget` and `FakeRepository` are sufficient to stand up mock remote state + deterministic Git fixtures for the four invariant scenarios, matching the established integration-tier pattern (R3).
- The five already-wired tiers + CI fast loop + coverage gate are green on `main` and need only verification, not repair.
- `run-e2e.yml`'s secret names and triggers are the single source of truth for the E2E env-var set (`.env.example` + the workflow stay in sync); the harness consumes those names verbatim.
- The four `INV-*` invariants are the correct and complete BDD scope per TDR-0007 §70-73 and `testing-strategy.md` (DEC-1); `NFR-PERF-4` / `NFR-REL-5` are release-blocking but belong to the integration tier, where they are already covered.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) — tier directories + smoke test | Created the `tests/bdd/` + `tests/e2e/` skeleton this change populates |
| Depends on | MS2-E3-S6 (GH-23) — sync engine (`computePlan`/`applyPlan`) | The real entry points the BDD step definitions drive |
| Depends on | MS2-E3-S7 (GH-24) — concurrency gates / push-flow write path | The write path the invariant scenarios exercise |
| Depends on | MS2-E4-S1 (GH-25) — mermaid.preload.ts | Confirms the mermaid-DOM tier wiring (verification) |
| Depends on | GH-81 — e2e-mock tier | The 7th tier this change verifies; also the `Bun.serve()` mock pattern the BDD target may mirror |
| Depends on | `tests/_helpers/{fake-target,fake-repository}.ts` | Reused by the BDD step definitions (R3) |
| Depends on | `.github/workflows/run-e2e.yml` | Already correct — supplies secrets/triggers for the live-sandbox tier |
| Depends on | TDR-0007, TDR-0004, ADR-0006, `testing-strategy.md` | The authority stack: runner choice, over-mocking guardrail, invariant definitions, tier model |
| Blocks | MS2-E5-S3 (adversarial corpus) and regression runs | The live-sandbox harness is the reusable runner those plug into |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | What is the exact, working `cucumber-js` invocation under the pinned Bun? | The existing `test:bdd` stub already targets `bunx cucumber-js tests/bdd/features` (story R1 / TDR-0007 OPEN-Q9). If that CLI form is flaky under Bun 1.2.23, a bun-native entry is the fallback. The chosen form must be recorded in the spec/commit. | Resolvable at delivery (DEC-2); no `@decision-advisor` input expected — this is an empirical validate-or-adjust step, not a design fork. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **BDD scoped to the four `INV-*` invariants only.** INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1 are the BDD tier; `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) stay in the integration tier. | The story's AC#1 lists the two NFR scenarios as "additive" but its own scope-note explicitly permits moving them to the integration tier ("either way they remain gated"). `testing-strategy.md` (current-truth, last-updated 2026-07-15) scopes BDD to "lifecycle invariants only" and lists `NFR-PERF-4` under Integration. TDR-0007 §70-73 pins BDD to the four invariants. Both NFRs are **already** covered in the integration tier (`tests/integration/app/idempotency.test.ts`; `concurrency-control-overlap.test.ts` + `concurrency-isolation.test.ts`). Choosing the 4-invariant path avoids duplication and stays literal to TDR-0007 / `testing-strategy.md`. (PM decision, `chg-GH-29-pm-notes.yaml`.) | 2026-07-15 |
| DEC-2 | **Cucumber runs under Bun via its Node-compatible CLI** (`cucumber-js`), wired as `bun run test:bdd`, not as a `bun:test` plugin. | TDR-0007 C-2 precision: cucumber is a standalone runner; the BDD tier's CI invocation is a one-line script rather than a `bun test tests/bdd/` argument. The exact form is validated at delivery (OQ-1); the existing stub's `bunx cucumber-js tests/bdd/features` is the candidate. | 2026-07-15 |
| DEC-3 | **No production source changes; escalate genuine `src/` bugs.** | This is pure test/CI infrastructure. If a BDD step exposes a real invariant bug, fixing `src/` inline would conflate test-wiring with a defect repair and hide the regression's discovery; it is surfaced to the PM as a separate change instead. Mirrors the GH-81 discipline (DEC-1 there). | 2026-07-15 |
| DEC-4 | **Mock only the `TargetSystem` port for the BDD scenarios.** | The over-mocking guardrail (TDR-0004 §"Test-design guardrail"; `testing-strategy.md` §"AI-agent over-mocking guardrail") forbids validating lifecycle invariants through mocks alone — the state classifier and push flow must be real. Reusing `FakeTarget` (port mock) + `FakeRepository` (Git fixtures) matches the integration-tier shape that already proves this. | 2026-07-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| BDD feature suite (`tests/bdd/features/`) | Updated — 3 new `.feature` files (INV-SAFE-3 already present) |
| BDD step definitions (`tests/bdd/steps/`) | New — real-engine step glue for the 4 invariants |
| `test:bdd` script + `@cucumber/cucumber` devDependency | Updated — no-op stub → binding runner; new test-only dep |
| Live-sandbox E2E harness (`tests/e2e/`) | New — thin runner + guarded smoke test + cleanup helper |
| CI fast loop (`ci.yml` `test:bdd` step) | Updated — becomes binding once features + step defs land (the step already exists) |
| Testing-strategy tier model (`.ai/rules/testing-strategy.md`) | Referenced — 7-tier model; no spec edit required for delivery (a phase-7 note may reconcile the "6 vs 7 tier" wording if needed) |
| Production source (`src/**`) | Unchanged (DEC-3) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the four lifecycle-invariant feature files (INV-SAFE-1/2/3, INV-SEC-1), **when** `bun run test:bdd` runs under Bun, **then** cucumber-js loads every feature + step definition and all four scenarios pass at integration level. | F-1, G-1 |
| AC-F2-1 | **Given** a corpus whose remote state is set to `REMOTE_AHEAD`/`DIVERGED` (mocked `TargetSystem` port), **when** `computePlan` + `applyPlan` run without `--adopt`/`--rebind`, **then** the drifted document is Blocked and is never auto-overwritten — INV-SAFE-1. | F-2, G-3 |
| AC-F2-2 | **Given** a managed page whose remote was deleted (mocked port → `RemoteMissing`), **when** `computePlan` + `applyPlan` run without `--adopt`/`--rebind`, **then** the `REMOTE_MISSING` document is Blocked, never silently re-created, and 0 `createPage` calls reach the target — INV-SAFE-2. | F-2, G-3 |
| AC-F2-3 | **Given** a corpus with two documents sharing the same `marksync.uuid`, **when** a sync is run, **then** the plan is aborted before any write (`DuplicateUuid` naming both source paths, 0 pages written) — INV-SAFE-3 (the existing feature now has real step definitions). | F-2, G-3 |
| AC-F2-4 | **Given** a sync run carrying real credentials in its inputs, **when** the plan, apply journal, lock, diagnostics, `version.message`, and cache are inspected, **then** no credential appears in any output path — INV-SEC-1. | F-2, G-3 |
| AC-F2-5 | **Given** any BDD scenario, **when** its step definitions are reviewed, **then** only the `TargetSystem` port is mocked — the state classifier, hierarchy planner, and push flow are the real modules (over-mocking guardrail; NFR-MAINT-1). | F-2, G-3, NFR-MAINT-1 |
| AC-1 | **Given** a PR that regresses any of the four invariants, **when** CI runs the `test:bdd` step, **then** the step exits non-zero and fails the PR (the no-op stub is replaced by a binding runner; strict/undefined-step failure enabled). | F-1, G-2, NFR-CI-1 |
| AC-F3-1 | **Given** `MARKSYNC_E2E_*` secrets absent, **when** `bun test tests/e2e/` runs (locally or secrets-free CI), **then** the guarded smoke test skips and the command exits 0. | F-3, G-4, NFR-CI-3 |
| AC-F3-2 | **Given** `MARKSYNC_E2E_*` secrets present (via `run-e2e.yml`), **when** the smoke test runs against the dedicated sandbox space, **then** it performs at least a create + read + delete round-trip and every page it created is deleted by the end of the run. | F-3, G-4, NFR-CI-4, NFR-MAINT-4 |
| AC-F3-3 | **Given** the `run-e2e.yml` workflow, **when** it triggers on schedule / `run-e2e` label / `workflow_dispatch`, **then** it runs the live-sandbox tier with the secrets wired and the existing concurrency-group-1 + no-cancel-mid-write policy (the workflow is not rewritten). | F-3, G-4 |
| AC-F4-1 | **Given** the five already-wired tiers (unit, integration, golden, mermaid-DOM, e2e-mock), **when** their documented commands run, **then** each is present, runnable, and green on a clean PR; the CI fast loop + coverage gate (lines ≥ 0.70, functions ≥ 0.80) are green. | F-4, G-5 |
| AC-2 | **Given** the full repo, **when** `bun run check` runs, **then** it is green (lint + format + typecheck + test + boundaries). | G-5 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** (1) install `@cucumber/cucumber`, validate the working cucumber-js-under-Bun invocation (OQ-1); (2) author the 3 new feature files + step definitions for all 4 invariants against `FakeTarget`/`FakeRepository`, honoring the over-mocking guardrail; (3) replace the no-op `test:bdd` and confirm the `ci.yml` step is binding; (4) build the live-sandbox runner + guarded smoke test + cleanup; (5) verify the five wired tiers + fast loop + coverage on a clean PR.
- **Merge strategy:** single PR squashed to `main` on branch `feat/GH-29/quality-gate-wiring`.
- **Communication:** none user-facing — additive test/CI infrastructure. The PR description records the chosen cucumber invocation (OQ-1) and surfaces any genuine `src/` invariant bug discovered (DEC-3) for separate triage.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — test-only fixtures (DM-1) and ephemeral sandbox pages cleaned per run (DM-2). No production data migration.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no PII or compliance-sensitive data. The BDD scenarios use synthetic Markdown corpora. The E2E smoke test writes only synthetic test content to the dedicated sandbox space and deletes it. Sandbox credentials live in GitHub Actions secrets, never in the repo.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No production/security change (DEC-3):** no `src/` path is touched; the credential-handling code is exercised only through the existing, already-audited paths.
- **Secrets stay out of the repo:** E2E credentials are GitHub Actions secrets (`run-e2e.yml`); the BDD tier uses no credentials (mocked port). INV-SEC-1 is itself one of the four enforced invariants.
- **No partial-credential runs (RSK-6):** the E2E guard treats the secret set as all-or-nothing; a missing var skips rather than constructing partial credentials.
- **No new network egress in the fast loop:** the BDD tier is in-process (mocked port); only the opt-in live-sandbox tier talks to a real API.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Maintenance surface:** one BDD feature/steps set (4 invariants) + one thin E2E runner/smoke test + one `devDependency` + one script line. The BDD set must stay literal to "lifecycle invariants only"; adding scenarios triggers TDR-0007's revisit note. The E2E harness is the reusable runner for MS2-E5-S3 and regression runs.
- **CI cost:** one additional fast-loop sub-step (the BDD suite, budgeted ≤ 30 s — NFR-CI-2); the live-sandbox tier adds no fast-loop cost (separate gate).
- **Ops:** the nightly sandbox sweep (R2) is the backstop for orphaned pages; run-scoped cleanup is the primary defense.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Lifecycle invariants | The four release-blocking safety properties: INV-SAFE-1 (no silent overwrite), INV-SAFE-2 (no silent re-create of REMOTE_MISSING), INV-SAFE-3 (duplicate-UUID fatal), INV-SEC-1 (no secrets in output). Defined in ADR-0006 / `feature-safe-publish.md` §195-201. |
| Over-mocking guardrail | TDR-0004 / `testing-strategy.md` rule: lifecycle invariants must be validated through integration/E2E paths, never mocks of the domain logic; only the `TargetSystem` port may be mocked. |
| `TargetSystem` port | The ports-and-adapters boundary the Confluence adapter implements; the only seam the BDD scenarios are permitted to mock. |
| `FakeTarget` / `FakeRepository` | Existing test helpers (`tests/_helpers/`) implementing the `TargetSystem` port and a deterministic Git fixture source, reused by the integration tier. |
| Binding vs no-op `test:bdd` | The script currently no-ops (exit 0); this change makes it fail the PR on invariant regression. |
| Live-sandbox tier (`tests/e2e/`) | The opt-in tier run by `run-e2e.yml` against a real Confluence test space, gated by secrets/schedule/label. Distinct from the secrets-free mock tier (`tests/e2e-mock/`). |

## 24. APPENDICES

### Appendix A: BDD scope decision (DEC-1) — why the two NFR scenarios stay in integration

The story's AC#1 lists `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) as additive BDD scenarios, but its scope-note explicitly permits moving them to the integration tier. The authoritative current-truth (`testing-strategy.md`, last-updated 2026-07-15) scopes BDD to "lifecycle invariants only" and lists `NFR-PERF-4` under the Integration tier; TDR-0007 §70-73 fixes the BDD floor at the four `INV-*`. Both NFRs are already covered in the integration tier: `tests/integration/app/idempotency.test.ts` (NFR-PERF-4), `concurrency-control-overlap.test.ts` + `concurrency-isolation.test.ts` (NFR-REL-5). Per the PM decision (`chg-GH-29-pm-notes.yaml`), the 4-invariant path is chosen to avoid duplication and stay literal to the strategy.

### Appendix B: Tier verification matrix (F-4)

| Tier | Runnable via | State | Action |
|------|--------------|-------|--------|
| Unit | fast-loop `Test` step | Wired | Verify green |
| Integration | fast-loop `Test` step | Wired | Verify green |
| Golden | fast-loop `Test` step | Wired | Verify green |
| Mermaid-DOM | `bunfig.toml [test].preload` | Wired (GH-25) | Verify green |
| E2E (mock) | `ci.yml` `e2e-mock` job | Wired (GH-81) | Verify green |
| Gherkin / BDD | `bun run test:bdd` | **Gap** | **Wire (F-1, F-2)** |
| E2E (live-sandbox) | `run-e2e.yml` → `bun test tests/e2e/` | **Gap** | **Wire (F-3)** |

### Appendix C: Relevant authorities

- `doc/decisions/TDR-0007-gherkin-bdd-runner.md` — cucumber runner; 4-invariant floor (§70-73); standalone-CLI-under-Bun precision (C-2); binary-irrelevance (C-5); over-mocking guardrail (C-4).
- `doc/decisions/TDR-0004-testing-runner.md` — `bun:test` primary runner; test-design guardrail (over-mocking); tier model origin.
- `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` — INV-SAFE-1/2/3 definitions (C-1..C-6).
- `doc/spec/features/feature-safe-publish.md` §195-201 — invariant acceptance criteria (INV-SAFE-1/2/3, INV-SEC-1, NFR-REL-5).
- `.ai/rules/testing-strategy.md` — 7-tier table; over-mocking guardrail; CI wiring; live-sandbox hygiene.
- `.github/workflows/ci.yml`, `.github/workflows/run-e2e.yml`, `bunfig.toml`, `package.json` — current wiring (verification baseline).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Change Spec Writer | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored from the GH-29 story (`MS2-E5-S1--quality-gate-wiring.md`), the PM `clarify_scope` outputs (`chg-GH-29-pm-notes.yaml` — tier-by-tier intake assessment + the BDD-scope decision), and the authority stack (TDR-0007, TDR-0004, ADR-0006, `feature-safe-publish.md` §195-201, `testing-strategy.md`). The current-truth tier state was verified against `package.json` (`test:bdd` no-op, `@cucumber/cucumber` not installed), `tests/bdd/` (only `duplicate-uuid-fatal.feature`, no step defs), `tests/e2e/` (`.gitkeep` only), `.github/workflows/ci.yml` + `run-e2e.yml` (both present, `run-e2e.yml` correct), `bunfig.toml` (coverage 0.70/0.80), and the existing test helpers (`FakeTarget`, `FakeRepository`). The PM-decided BDD scope (4 `INV-*` invariants; `NFR-PERF-4`/`NFR-REL-5` stay in integration) is recorded as DEC-1 with its rationale and the verification that both NFRs are already covered. The over-mocking guardrail is called out as a hard constraint (DEC-4, NFR-MAINT-1) because it is the highest-value correctness property of the BDD step definitions. The cucumber-invocation fork is left as a delivery-time validate-or-adjust (OQ-1 / DEC-2) rather than invented, per the instruction not to resolve genuine gaps. Conventions mirror the closest sibling, the GH-81 mock-e2e spec (no-src-changes discipline, over-mocking references, Given/When/Then ACs, test-only NFRs). No gaps remained that could not be resolved from the story + strategy + codebase.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-29)
- [x] `owners` has at least one entry (["@cwiakalski"])
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..4, AC-F1-1, AC-F2-1..5, AC-1, AC-F3-1..3, AC-F4-1, AC-2, NFR-CI-1..4/NFR-MAINT-1..4, RSK-1..6, DEC-1..4, DM-1/2, OQ-1, G-1..5, NG-1..6)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (4 of 4 invariants, ≤ 30 s, exit 0 without secrets, 0 orphaned pages, 0 mocked domain modules, 0 src files, lines ≥ 0.70 / functions ≥ 0.80)
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths beyond tier/component/helper names; no step-by-step tasks)
- [x] No content duplicated from linked docs (summaries + references; the tier table and authority citations point to sources)
- [x] Front matter validates per front_matter_rules
