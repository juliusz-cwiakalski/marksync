---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-29-quality-gate-wiring
status: Updated
created: 2026-07-15T14:30:00Z
last_updated: 2026-07-15T17:15:00Z
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["test", "MS-0002", "MS2-E5", "priority:high", "ci", "bdd", "e2e"]
links:
  change_spec: ./chg-GH-29-spec.md
  test_plan: ./chg-GH-29-test-plan.md
  pm_notes: ./chg-GH-29-pm-notes.yaml
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  ci_workflow: ../../../../.github/workflows/ci.yml
  run_e2e_workflow: ../../../../.github/workflows/run-e2e.yml
summary: >
  Close the two unwired gaps in the 7-tier testing strategy. BDD: install
  @cucumber/cucumber as a devDependency, author three new .feature files
  (the fourth, duplicate-uuid-fatal.feature, already exists) plus step
  definitions that drive the REAL computePlan/applyPlan against a mocked
  TargetSystem port, and replace the no-op test:bdd script with a binding,
  strict-mode runner invoked in the CI fast loop — enforcing the four
  release-blocking invariants (INV-SAFE-1/2/3, INV-SEC-1). E2E: add a thin
  live-sandbox runner + a guarded smoke test that skips (exit 0) when
  MARKSYNC_E2E_* secrets are absent and runs + cleans up when present, driven
  by the existing (unchanged) run-e2e.yml. The other five tiers (unit,
  integration, golden, mermaid-DOM, e2e-mock) and the CI fast loop + coverage
  gate are already wired and are verified, not re-implemented. Pure test/CI
  infrastructure: no production source changes (DEC-3); BDD scoped to the four
  INV invariants only (DEC-1); mock only the adapter ports — TargetSystem +
  Repository — with domain logic real (DEC-4).
version_impact: none
---

# IMPLEMENTATION PLAN — GH-29: Quality Gate Wiring (BDD + Live-Sandbox E2E)

## Context and Goals

This plan wires the **two remaining gaps** in the 7-tier testing strategy (`.ai/rules/testing-strategy.md`, current-truth). The **BDD/Gherkin tier** is a no-op today: `@cucumber/cucumber` is not installed, `package.json#test:bdd` is a stub that exits 0 until the dep is present, only `tests/bdd/features/duplicate-uuid-fatal.feature` (INV-SAFE-3) exists, and there are **no step definitions**. The **live-sandbox E2E tier** (`tests/e2e/`) is empty (`.gitkeep` only): `run-e2e.yml` is already correct (schedule + `run-e2e` label + `workflow_dispatch`; concurrency group `e2e-sandbox`; secrets wired) but has nothing to run. As a result the four release-blocking lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are **not** enforced through the integration-level Gherkin path that TDR-0007 / the over-mocking guardrail mandate, and the live-sandbox gate is vacuously green.

Per **DEC-1**, the BDD tier covers exactly the four `INV-*` invariants; `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans) are release-blocking but **stay in the integration tier**, where both are already covered (`tests/integration/app/idempotency.test.ts`, `concurrency-control-overlap.test.ts`, `concurrency-isolation.test.ts`). Per **DEC-2**, cucumber runs under Bun via its Node-compatible CLI (`cucumber-js`), wired as `bun run test:bdd` (a standalone runner, not a `bun:test` plugin); the exact invocation is validated at delivery (OQ-1). Per **DEC-4**, the step definitions mock **only the adapter ports** (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository`) — the state classifier, hierarchy planner, and push flow are the real modules. The five already-wired tiers + CI fast loop + coverage gate are **verified** (F-4), not re-implemented.

> **Production-source guardrail (DEC-3, load-bearing).** `src/**` is **UNTOUCHED** by this change. This is pure test/CI infrastructure. The only non-`tests/**` files touched are `package.json` (devDependency + script), the lockfile, and a one-line comment refresh in `.github/workflows/ci.yml`. `run-e2e.yml` and `bunfig.toml` are **not** rewritten.
>
> **Hard STOP condition (DEC-3 / RSK-5).** If a BDD step reveals a **genuine `src/` invariant bug** (an assertion fails for reasons other than a test/fixture/step defect), the coder MUST **STOP and escalate to the PM** as a separate change — do NOT fix `src/**` inline. Record the finding in the Execution Log and surface it for triage. The BDD scenario is recorded as *failing-on-real-bug*, never papered over.
>
> **Over-mocking guardrail (DEC-4 / NFR-MAINT-1, hard).** Every BDD step mocks **only the adapter ports** — `TargetSystem` via `FakeTarget` (`tests/_helpers/fake-target.ts`) and `Repository` via `FakeRepository` (`tests/_helpers/fake-repository.ts`, for deterministic Git fixtures). The state classifier, hierarchy planner, and push flow (`computePlan`/`applyPlan`) are the **real** modules imported from `#app/push-flow`. Code-review each step against this rule; the sibling integration tests (`tests/integration/confluence/push-flow.test.ts`) are the reference shape.
>
> **Acknowledged red intermediate state (Phase 1 → Phase 2).** Once Phase 1 enables strict mode + undefined-step failure, `bun run test:bdd` is **red by design** until Phase 2 wires the first step definitions (undefined steps fail under strict mode). This is an acknowledged intermediate commit on the feature branch; the PR is only mergeable after Phase 6, when the whole gate is green. **PR-open timing (F5):** the PR is opened only at/after Phase 6 (F) — once all four invariant features are green — so the red intermediate `test:bdd` state exists only on the Phase 1→2 feature-branch commits, never on the PR head. (The `ci.yml` fast loop runs `test:bdd` on every push, so opening earlier would surface a red `BDD lifecycle invariants (cucumber)` check on the PR.) Reordering the binding `test:bdd` landing into Phase 2 was considered and rejected: it would forfeit Phase 1's isolated runner-validation signal (OQ-P1/DEC-2) and split the dep + script change across commits.

**Open questions**:

- **OQ-P1 (cucumber invocation form, resolves spec OQ-1 / DEC-2).** The exact, working `cucumber-js` invocation under the pinned Bun 1.2.23 — including how step/support modules are `--require`-loaded under Bun's native TS, and the precise strict/undefined-step flags for the installed cucumber version — is validated empirically in Phase 1. Candidate: `bunx cucumber-js tests/bdd/features --require "tests/bdd/**/*.ts" --strict` (or a `cucumber.js`/`cucumber.mjs` config that sets `paths`/`requireModule`/`require`/`strict`). **Decision needed**: none from `@decision-advisor` — this is an empirical validate-or-adjust step. The chosen form is **recorded in the Phase 1 commit message**; if `cucumber-js` is unworkable under Bun, fall back to a bun-native entry that drives cucumber-core and RECORD that form.
- All spec open questions (OQ-1) are **resolved at delivery** (Phase 1) per DEC-2 and do not block planning.

**Resolved decisions**:

- **OQ-P2 (CLOSED — INV-SEC-1 sentinel injection point).** Credentials never enter `computePlan`/`applyPlan`: they live in `ConfluenceTarget`/`ConfluenceClient`, which is the adapter behind the `TargetSystem` port that BDD mocks via `FakeTarget`. There is **no credential-bearing config/provenance path that flows to outputs**, so injecting the sentinel into config/provenance would be vacuous (or would force a `src/` change, violating DEC-3). **Decision: inject the known sentinel secret string into the document CONTENT (the Markdown source fixture via `FakeRepository.setFile`)** — mirroring the proven `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011 pattern — so the sentinel flows through the real render → plan → lock/journal/diagnostics/`version.message`/cache path. Assert the sentinel is absent from every inspected output path (plan, apply journal, lock, diagnostics, `version.message`, cache). If the sentinel leaks into any output → genuine `src/` redaction bug → STOP + escalate (RSK-5); do NOT weaken the assertion. (The real adapter is the mocked port, so credentials are not an engine input.)

## Scope

### In Scope

- **F-1 / F-2** — `@cucumber/cucumber` as a `devDependency`; a binding, strict-mode `bun run test:bdd` runner that executes under Bun (DEC-2); the four `.feature` files (INV-SAFE-1, INV-SAFE-2, INV-SAFE-3 existing, INV-SEC-1); and step definitions under `tests/bdd/steps/` that drive the **real** `computePlan` + `applyPlan` against a mocked `TargetSystem` port (`FakeTarget`), with deterministic Git fixtures (`FakeRepository`).
- **F-3** — A thin live-sandbox runner + guarded smoke test + run-scoped cleanup helper under `tests/e2e/` that skips (exit 0) when any `MARKSYNC_E2E_*` secret is absent (all-or-nothing, RSK-6) and runs a create + read + delete round-trip + deletes every page it created when secrets are present, driven by the existing `run-e2e.yml`.
- **F-4** — Verification that the five already-wired tiers (unit, integration, golden, mermaid-DOM, e2e-mock), the CI fast loop, and the coverage gate (lines ≥ 0.70, functions ≥ 0.80) are green on a clean PR — verifying the floor, not re-laying it.
- The one-line comment refresh in `ci.yml` reflecting that `test:bdd` is now real/binding.

### Out of Scope

- **[OUT] Any edit to `src/**`** (DEC-3). A step definition that exposes a genuine `src/` invariant bug is escalated to the PM as a separate change (RSK-5). (Spec §7.2.)
- **[OUT] BDD scenarios for `NFR-PERF-4` (idempotent rerun) and `NFR-REL-5` (overlapping-plans)** — both already covered in the integration tier; per DEC-1 they stay there, literal to TDR-0007 §70-73 / `testing-strategy.md`. (Spec NG-1.)
- **[OUT] Rewriting `run-e2e.yml`, the e2e-mock tier, `ci.yml` (beyond the comment refresh + the now-binding `test:bdd` step it already calls), or `bunfig.toml` coverage thresholds** — already correct. (Spec NG-6.)
- **[OUT] Performance benchmark suite** (deferred to MS-0003+), **multi-space E2E** (single dedicated sandbox space), and **BDD steps beyond the four lifecycle invariants**. (Spec NG-3/4/5.)
- **[OUT] Stretch live-sandbox scenarios** (409 version-conflict, content properties, attachments) — deferred to MS2-E5-S3; the smoke test delivered here is the reusable harness those plug into. (Spec §7.3.)

### Constraints

- **Production source frozen (DEC-3).** All new code lives under `tests/bdd/**` and `tests/e2e/**`; the only non-test edits are `package.json` (devDependency + script), the lockfile, and a one-line `ci.yml` comment.
- **`run-e2e.yml` and `bunfig.toml` frozen (NG-6).** The harness consumes `run-e2e.yml`'s env-var names verbatim; coverage thresholds are not changed.
- **Mock only the adapter ports (DEC-4).** `TargetSystem` (via `FakeTarget`) and `Repository` (via `FakeRepository`) are the only mocked seams; the state classifier, hierarchy planner, and push flow are real. (NFR-MAINT-1.)
- **Deterministic (RSK-3, NFR-CI-2).** Reuse `FakeTarget`/`FakeRepository`; fixed UUID-v7 fixtures; assert on counts/states, never wall-clock; no sleeps; full 4-feature BDD suite completes in **≤ 30 s** (in-process engine + mocked port, no network).
- **Binding + strict (NFR-CI-1).** `test:bdd` runs in the `ci.yml` fast loop; strict mode + undefined-step failure are enabled so a vacuous/missing step fails the suite (TDR-0007 risk mitigation).
- **Test-only dependency (NFR-MAINT-3).** `@cucumber/cucumber` is a `devDependency`; `bun build --compile` excludes it (binary size unchanged).
- **Guarded live-sandbox (NFR-CI-3 / NFR-CI-4 / RSK-6).** All-or-nothing secret set: if any required `MARKSYNC_E2E_*` var is missing, skip entirely (exit 0); never construct credentials from partial input. With secrets present, run + delete every created page; single dedicated space; concurrency-group 1 (enforced by `run-e2e.yml`).
- **Pinned Bun.** The `ci.yml` fast-loop `test:bdd` step and the `e2e` job both run on Bun 1.2.23 (`package.json#engines.bun`); cucumber must work under that pin (OQ-P1).
- **HARD STOP on real `src/` bugs (RSK-5).** No inline production fixes; STOP + escalate to PM.

### Risks

- **RSK-1 (cucumber + Bun interop friction, H/M → L):** `cucumber-js` is flaky or fails to load TS steps under the pinned Bun (spec R1 / TDR-0007 OPEN-Q9). **Mitigated by:** validate-or-adjust at delivery (OQ-P1 / DEC-2); the existing stub already targets `bunx cucumber-js`; fall back to a bun-native cucumber-core entry only if the CLI is unworkable, RECORDING the chosen form.
- **RSK-2 (E2E sandbox leaves orphaned pages, M/M → L):** a run crashes mid-write or cleanup fails (spec R2). **Mitigated by:** run-scoped cleanup (delete every page created, best-effort) + nightly sweep backstop; log created page ids on failure; concurrency-group 1 prevents inter-run version noise.
- **RSK-3 (non-deterministic fixtures, M/M → L):** non-deterministic UUIDs/timestamps make scenarios flaky (spec R3). **Mitigated by:** reuse `FakeRepository` + fixed UUID-v7 fixtures; assert on counts/states, never wall-clock.
- **RSK-4 (over-mocking drift, H/L → L):** a step mocks the classifier/engine "to make the scenario easy," silently neutering the invariant. **Mitigated by:** hard constraint (DEC-4 / NFR-MAINT-1); code-review each step against "mock only `TargetSystem` port"; sibling integration tests are the reference shape.
- **RSK-5 (genuine `src/` invariant bug surfaced mid-delivery, H/L → L):** **Mitigated by:** DEC-3 — STOP + escalate to PM; do NOT fix `src/**` inline. (Spec §7.2.)
- **RSK-6 (partial-credential run, M/L → L):** skip logic leaks secrets or runs half-configured. **Mitigated by:** treat the secret set as all-or-nothing; if any required `MARKSYNC_E2E_*` var is missing, skip entirely.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| BDD invariant features passing | 4 of 4 (INV-SAFE-1/2/3, INV-SEC-1) | AC-F1-1, G-1 |
| `test:bdd` CI step behavior | Binding (non-zero exit on invariant regression) | AC-1, NFR-CI-1 |
| Adapter ports mocked by BDD steps | 2 (`TargetSystem` + `Repository`; 0 domain modules mocked) | AC-F2-5, NFR-MAINT-1 |
| BDD suite runtime | ≤ 30 s | NFR-CI-2 |
| Production source files changed | 0 (DEC-3) | NFR-MAINT-2 |
| New fast-loop secrets required | 0 | NFR-CI-1 |
| Live-sandbox exit code without secrets | 0 (skip) | AC-F3-1, NFR-CI-3 |
| Live-sandbox behavior with secrets | runs + deletes every page it created | AC-F3-2, NFR-CI-4 |
| Total tiers runnable via documented commands | 7 (5 verified + 2 wired) | AC-F4-1 |
| `bun run check` | green | AC-2 |

## Phases

> **Phase → letter map (for PM traceability):** Phase 1 = A (dep + runner), Phase 2 = B (step harness + INV-SAFE-3), Phase 3 = C (INV-SAFE-1/2 + INV-SEC-1), Phase 4 = D (CI binding verification), Phase 5 = E (live-sandbox harness), Phase 6 = F (tier verification + finalize). Each phase is one commit-sized unit (Phase 4 and Phase 6 may be verification-only with no commit if nothing changes).

### Phase 1: Cucumber Dependency + Binding Runner Validation (A)

**Goal**: Install `@cucumber/cucumber` as a test-only `devDependency`, replace the no-op `test:bdd` stub with a real, binding, strict-mode cucumber-js invocation that runs under the pinned Bun, and prove the runner loads/parses `tests/bdd/features/` without a config/load crash (OQ-1 / DEC-2). Step definitions do not exist yet, so the smoke run is expected to report **undefined steps** — the point of this phase is runner validation, not invariant coverage.

**Tasks**:

- [ ] **1.1** Add `@cucumber/cucumber` as a `devDependency`: `bun add -d @cucumber/cucumber`. If the package does not ship its own types, add the matching `@types` devDependency; otherwise the bundled types suffice (confirm during install). (F-1, NFR-MAINT-3)
- [ ] **1.2** Replace the no-op `package.json#test:bdd` stub with a real, **binding** cucumber-js invocation. The current stub guards "not installed → exit 0"; once the dep is present that guard is dead code — replace it with the real runner. Candidate form: `bunx cucumber-js tests/bdd/features --require "tests/bdd/**/*.ts" --strict` (or a `cucumber.js`/`cucumber.mjs` config setting `paths`, `requireModule`, `require ["tests/bdd/**/*.ts"]`, and `strict: true`). **Enable strict mode + undefined-step failure** so a vacuous/missing step fails the suite (TDR-0007 risk mitigation). **Validate** the exact flags for the installed cucumber version (OQ-P1) and record the chosen form. (F-1, NFR-CI-1, DEC-2)
- [ ] **1.3** Ensure the `--require` glob loads step + support modules so that TS under Bun is picked up natively (Bun runs TS directly; no transpile step needed). If cucumber-js needs `--require-module` to preload the Bun loader, add it (OQ-P1). (F-1, DEC-2)
- [ ] **1.4** Smoke-check: run `bun run test:bdd` against the existing single feature (`duplicate-uuid-fatal.feature`). **Expected outcome:** cucumber loads/parses the `.feature`, reports **undefined steps** (no step defs yet), and exits **non-zero** under strict mode. The runner MUST NOT crash on config/load/parse errors — the failure mode is "undefined steps", which *proves* the runner works. (F-1, RSK-1)
- [ ] **1.5** Confirm the devDependency is excluded from `bun build --compile` (test-only) — a no-op structural check; the dep is under `devDependencies`, so the compiled binary is unaffected (NFR-MAINT-3). No build run required this phase; noted for awareness.
- [ ] **1.6** (Guardrail awareness, no action) Note for downstream phases: after this commit, `bun run test:bdd` is **red by design** (undefined steps) until Phase 2 lands the first step definitions. This is the acknowledged red intermediate state — the branch is only mergeable after Phase 6, and the PR is opened only at/after Phase 6 so the red window never appears on the PR head (only on the Phase 1→2 feature-branch commits).

**Acceptance Criteria**:

- Must: `@cucumber/cucumber` is in `devDependencies` (not `dependencies`); the lockfile is updated. (NFR-MAINT-3)
- Must: `bun run test:bdd` invokes the real `cucumber-js` runner against `tests/bdd/features/` with **strict mode + undefined-step failure enabled**; the "not installed → exit 0" no-op is removed. (F-1, NFR-CI-1, DEC-2)
- Must: The smoke run fails with **undefined steps** (not a config/load/parse crash), proving the runner is wired. (F-1, RSK-1)
- Must: The chosen invocation form is recorded in the commit message (OQ-P1 / DEC-2). (DEC-2)
- Should: `bun run typecheck` + `bun run lint` remain clean for the changed `package.json` (biome does not lint `.feature`; TS step files land in Phase 2).

**Affected code areas**:

- `package.json` (updated — new `devDependency`, real `test:bdd` script)
- `bun.lock` / `bun.lockb` (updated — lockfile)
- `cucumber.js` / `cucumber.mjs` (new — **only if** the @coder chooses a config file over inline flags; OQ-P1)

**System docs to update**:

- None this phase. (A note tying the BDD tier to `.ai/rules/testing-strategy.md` is optional and handled in lifecycle phase 7 via `@doc-syncer` if the human requests it; flagged for awareness only — not required for delivery.)

**Tests**:

- `bun run test:bdd` — smoke run; expects undefined-steps failure (runner validation, not coverage).
- `bun run typecheck`; `bun run lint` (no new TS yet).

**Completion signal**: `chore(deps): GH-29 add @cucumber/cucumber devDependency + binding test:bdd script`

---

### Phase 2: BDD Step Harness + INV-SAFE-3 Green (B)

**Goal**: Author the BDD step harness under `tests/bdd/steps/` (+ any shared support/world cucumber needs) that imports the **real** `computePlan`/`applyPlan` from `#app/push-flow`, builds mock remote state via `FakeTarget` and deterministic Git fixtures via `FakeRepository` (the only permitted mocks — both adapter ports), and wires the step definitions for the existing `duplicate-uuid-fatal.feature` (INV-SAFE-3) so it passes — asserting `DuplicateUuid` names both source paths and zero writes reach the target.

**Tasks**:

- [ ] **2.1** Create the shared BDD support: a world/state holder (e.g. `tests/bdd/support/world.ts` or per-scenario `Before`/`After` hooks) that carries the per-scenario `FakeTarget` + `FakeRepository` + computed `Plan`/`ApplyReport`. Instantiate a **fresh** `FakeTarget`/`FakeRepository` per scenario so no state leaks across scenarios (RSK-3). (F-2, DM-1)
- [ ] **2.2** Create `tests/bdd/steps/duplicate-uuid-fatal.steps.ts` (TC-BDD-005). Implement the four steps of the existing feature:
  - `Given a corpus with two documents sharing the same marksync.uuid` → use `FakeRepository.setFile` to seed two `.md` files with **identical fixed UUID-v7** front-matter (`marksync.uuid`), mirroring `tests/integration/confluence/push-flow.test.ts`'s fixture shape.
  - `When a sync is run` → build a `ProjectConfig` + empty/`LockFile` (same shape as the integration base config) and call the **real** `computePlan(config, lock, git, target)` from `#app/push-flow`; capture the `Result`. (`applyPlan` is NOT reached because `computePlan` aborts at the duplicate-UUID gate, step 4.)
  - `Then detectDuplicateUuids returns err(DuplicateUuid) naming both source paths` → assert the `computePlan` result is `err` with `kind: "DuplicateUuid"` and that both source paths are named.
  - `And zero pages are written to Confluence` → assert `FakeTarget.createPageCalls.length === 0` and `FakeTarget.updatePageCalls.length === 0`.
  (AC-F2-3, AC-F2-5)
- [ ] **2.3** Honor the **over-mocking guardrail** in every step: import `computePlan`/`applyPlan` from `#app/push-flow` (the real push flow); the ONLY mocks are the adapter ports — `FakeTarget` (`TargetSystem`) and `FakeRepository` (`Repository`). Do NOT import/replace `classify`, `actionFor`, `detectDuplicateUuids`, or any domain module with a fake — they run for real inside `computePlan`. (AC-F2-5, NFR-MAINT-1, DEC-4)
- [ ] **2.4** Use fixed UUID-v7 fixtures and assert on counts/states, never wall-clock (RSK-3). No sleeps; the engine is synchronous against the in-process `FakeTarget`.
- [ ] **2.5** Run `bun run test:bdd` — the INV-SAFE-3 feature is green (the runner goes from red-undefined-steps to green). Confirm the BDD suite runtime is well within the ≤ 30 s budget (NFR-CI-2).
- [ ] **2.6** If a genuine `src/` invariant bug is observed (the duplicate-UUID gate does NOT abort, or names the wrong paths, for reasons other than a fixture/step defect), **STOP and escalate to the PM** — do NOT edit `src/**` (RSK-5). Record the finding in the Execution Log.

**Acceptance Criteria**:

- Must: `duplicate-uuid-fatal.feature` passes under `bun run test:bdd`; `computePlan` returns `err(DuplicateUuid)` naming both source paths; `FakeTarget` received 0 create/update calls. (AC-F2-3)
- Must: The step harness imports the real `computePlan`/`applyPlan`; the only mocks are the adapter ports (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository`). (AC-F2-5, NFR-MAINT-1)
- Must: Fixtures are deterministic (fixed UUID-v7); assertions are on counts/states, not wall-clock. (RSK-3)
- Should: `bun run typecheck` + `bun run lint` are clean for the new `tests/bdd/**/*.ts` files.

**Affected code areas**:

- `tests/bdd/support/world.ts` (new — shared world/state holder, if cucumber needs one)
- `tests/bdd/steps/duplicate-uuid-fatal.steps.ts` (new — INV-SAFE-3 step definitions)

**System docs to update**:

- None this phase.

**Tests**:

- `bun run test:bdd` — INV-SAFE-3 green.
- `bun run typecheck`; `bun run lint` (new TS files).

**Completion signal**: `test(bdd): GH-29 step harness + INV-SAFE-3 (duplicate-uuid-fatal) green`

---

### Phase 3: INV-SAFE-1 / INV-SAFE-2 / INV-SEC-1 Features + Step Definitions (C)

**Goal**: Author the three remaining `.feature` files and extend the step definitions so all four lifecycle invariants pass at integration level under `bun run test:bdd` — each scenario drives the real `computePlan` + `applyPlan` against `FakeTarget`, asserting the invariant + zero-write / zero-overwrite / no-secret-leak behavior.

**Tasks**:

- [ ] **3.1** Create `tests/bdd/features/no-silent-overwrite.feature` (INV-SAFE-1, TC-BDD-001 + TC-BDD-002) with two scenarios: (a) a corpus whose remote is `REMOTE_AHEAD` (FakeTarget fixture page with version > local base version); (b) a corpus whose remote body hash `DIVERGED` from local base (FakeTarget fixture with a divergent body). Each: `When computePlan + applyPlan run without --adopt/--rebind` → `Then the drifted document is Blocked` → `And FakeTarget received 0 updatePage calls` → `And 0 createPage calls`. (AC-F2-1, AC-F2-5)
- [ ] **3.2** Create `tests/bdd/features/no-silent-recreate-remote-missing.feature` (INV-SAFE-2, TC-BDD-003 + TC-BDD-004): (a) a managed page whose remote was deleted — configure `FakeTarget.getPage` to return `err(RemoteMissing)` (the page is absent from the fixture map) → `When computePlan + applyPlan run without --adopt/--rebind` → `Then the REMOTE_MISSING document is Blocked` → `And 0 createPage calls`; (b) a multi-document corpus (e.g. 3 docs) with one `REMOTE_MISSING` → assert `createPageCalls.length` excludes the blocked doc (quantitative zero-write variant). (AC-F2-2, AC-F2-5)
- [ ] **3.3** Create `tests/bdd/features/no-secret-in-output.feature` (INV-SEC-1, TC-BDD-006): `Given a corpus with one managed document` whose Markdown **content** (body) contains a known **sentinel secret string** (planted via `FakeRepository.setFile`, mirroring `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011); `When computePlan + applyPlan run` against `FakeTarget` → `Then the sentinel does not appear in` the plan result, the apply journal, the lock file, diagnostic messages, `version.message`, or the cache. NOTE: the real adapter (`ConfluenceTarget`/`ConfluenceClient`) is the mocked `TargetSystem` port, so credentials are NOT an engine input — the sentinel is injected into the document content (the source that flows through render → plan → outputs), never into config/provenance (there is no credential-bearing config/provenance path that flows to outputs; injecting there would be vacuous or violate DEC-3). (AC-F2-4, AC-F2-5; OQ-P2 RESOLVED — injection point = document content)
- [ ] **3.4** Extend `tests/bdd/steps/` with the matching step-definition modules (`no-silent-overwrite.steps.ts`, `no-silent-recreate-remote-missing.steps.ts`, `no-secret-in-output.steps.ts`) — shared Given/When/Then glue where possible. Each `When` step drives the **real** `computePlan` (then `applyPlan`) from `#app/push-flow` against `FakeTarget`. The state classifier + push flow run for real; only the adapter ports are mocked (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository` — DEC-4). (AC-F2-1, AC-F2-2, AC-F2-4, AC-F2-5)
- [ ] **3.5** For INV-SAFE-1/2, set up the `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_MISSING` remote state via `FakeTarget.addFixture` / `advanceVersion` / omitting the fixture (so `getPage` returns `RemoteMissing`), and seed a `LockFile` binding that places the doc in the relevant sync state — mirroring the integration-tier fixture shape (`tests/integration/confluence/push-flow.test.ts`). Assert on `ApplyReport.blocks` + `FakeTarget` call arrays (zero writes), never on wall-clock. (RSK-3)
- [ ] **3.6** For INV-SEC-1 (OQ-P2 RESOLVED): run the real engine with the sentinel planted in the document content (via `FakeRepository.setFile`); assert the sentinel is absent from every inspected output path — the plan, apply journal, lock file, diagnostics, `version.message`, and cache. If the sentinel **leaks** into any of these → that is a genuine `src/` redaction bug → **STOP and escalate to the PM** (RSK-5); do NOT weaken the assertion or mock the redaction path. (Mirrors TC-INTEGRATION-011; credentials never enter `computePlan`/`applyPlan` because the credential-bearing adapter is the mocked `TargetSystem` port.)
- [ ] **3.7** Run `bun run test:bdd` — all four invariant features (INV-SAFE-1/2/3, INV-SEC-1) green at integration level; confirm total runtime ≤ 30 s (NFR-CI-2).
- [ ] **3.8** If a genuine `src/` invariant bug is observed in any scenario (an invariant fails for reasons other than a fixture/step defect), **STOP and escalate to the PM** — do NOT edit `src/**` (RSK-5). Record the finding in the Execution Log.

**Acceptance Criteria**:

- Must: INV-SAFE-1 — `REMOTE_AHEAD` and `DIVERGED` docs are `Blocked`, never auto-overwritten; `FakeTarget` received 0 `updatePage` and 0 `createPage` calls. (AC-F2-1)
- Must: INV-SAFE-2 — the `REMOTE_MISSING` doc is `Blocked`, never silently re-created; 0 `createPage` calls reach the target (incl. the multi-doc quantitative assertion). (AC-F2-2)
- Must: INV-SEC-1 — the sentinel secret (injected into document content via `FakeRepository.setFile`, mirroring TC-INTEGRATION-011; never into config/provenance) is absent from the plan, journal, lock, diagnostics, `version.message`, and cache. (AC-F2-4)
- Must: All four features pass under `bun run test:bdd`; the full suite runs in ≤ 30 s. (AC-F1-1, NFR-CI-2)
- Must: Every step mocks only the adapter ports (`TargetSystem` + `Repository`); the state classifier, hierarchy planner, and push flow are real. (AC-F2-5, NFR-MAINT-1)
- Should: `bun run typecheck` + `bun run lint` are clean for all new `tests/bdd/**/*.ts` files.

**Affected code areas**:

- `tests/bdd/features/no-silent-overwrite.feature` (new — INV-SAFE-1)
- `tests/bdd/features/no-silent-recreate-remote-missing.feature` (new — INV-SAFE-2)
- `tests/bdd/features/no-secret-in-output.feature` (new — INV-SEC-1)
- `tests/bdd/steps/no-silent-overwrite.steps.ts` (new)
- `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts` (new)
- `tests/bdd/steps/no-secret-in-output.steps.ts` (new)

**System docs to update**:

- None this phase.

**Tests**:

- `bun run test:bdd` — all 4 invariant features green.
- `bun run typecheck`; `bun run lint` (new TS files; `.feature` files are not biome-linted).

**Completion signal**: `test(bdd): GH-29 INV-SAFE-1/2 + INV-SEC-1 features and step definitions`

---

### Phase 4: BDD CI Binding Verification (D)

**Goal**: Confirm the `ci.yml` fast-loop `BDD lifecycle invariants (cucumber)` step is now binding (it already calls `bun run test:bdd`), and prove binding by showing a deliberate invariant break makes the command exit non-zero — then revert. No broken state is committed.

**Tasks**:

- [ ] **4.1** Confirm `.github/workflows/ci.yml` fast-loop job contains the `BDD lifecycle invariants (cucumber)` step invoking `bun run test:bdd` (it does — no workflow wiring change expected). The step is now binding because the script is real (Phase 1) and the features + step defs exist (Phases 2–3). (AC-1, NFR-CI-1)
- [ ] **4.2** **Prove binding locally (do NOT commit the break):** temporarily neuter one assertion in a step definition (e.g. invert the zero-writes check, or delete a `Then` body) → run `bun run test:bdd` → assert it exits **non-zero** → **revert** the change. Record the proof approach + result in the Execution Log. This demonstrates the gate fails on invariant regression (the scenario TC-BDD-007 describes). (AC-1, TC-BDD-007)
- [ ] **4.3** Refresh the now-stale comment on the `ci.yml` `test:bdd` step. The current comment says the script "no-ops until the BDD runner wires in E5-S1 (MS2-E5), so this step is green now and binding once features land" — update it to reflect that `test:bdd` is now real and binding (the four invariants are enforced). One-line comment-only change. (AC-1)
- [ ] **4.4** Verify `run-e2e.yml` is **NOT** touched (NG-6) and no `secrets.*` reference is added to the fast loop (NFR-CI-1: BDD is in-process, mocked port, 0 secrets). (NG-6, NFR-CI-1)

**Acceptance Criteria**:

- Must: The `test:bdd` step is present in the `ci.yml` fast loop and invokes `bun run test:bdd` (unchanged); a deliberately broken invariant causes a non-zero exit (proven locally, then reverted). (AC-1, TC-BDD-007)
- Must: The stale "no-ops until … binding once features land" comment is corrected to reflect the binding state. (AC-1)
- Must: `run-e2e.yml` is unchanged; no `secrets.*` added to the fast loop. (NG-6, NFR-CI-1)
- Must: No broken state is committed (the deliberate break is reverted). (RSK-5 discipline)

**Affected code areas**:

- `.github/workflows/ci.yml` (updated — one-line comment refresh on the `test:bdd` step only)

**System docs to update**:

- None this phase.

**Tests**:

- `bun run test:bdd` green (before the deliberate break), non-zero (during the break), green again (after revert).
- Manual review (TC-BDD-007): confirm the `test:bdd` step is present, mandatory, strict, and secrets-free.

**Completion signal**: `ci(bdd): GH-29 verify test:bdd is binding in fast loop`

---

### Phase 5: Live-Sandbox E2E Harness (E)

**Goal**: Author the thin live-sandbox runner + a guarded smoke test + run-scoped cleanup helper under `tests/e2e/` that skips cleanly (exit 0) when any `MARKSYNC_E2E_*` secret is absent and, when all are present, performs a create + read + delete round-trip against the dedicated sandbox space and deletes every page it created. The harness consumes the `run-e2e.yml` env-var names verbatim; `run-e2e.yml` itself is **not** rewritten.

**Tasks**:

- [ ] **5.1** Create `tests/e2e/helpers.ts` (shared infra): an adapter/runner constructor that reads the `MARKSYNC_E2E_*` env vars **verbatim** from `run-e2e.yml` + `.env.example` — `MARKSYNC_E2E_CONFLUENCE_BASE_URL`, `MARKSYNC_E2E_USER_EMAIL`, `MARKSYNC_E2E_API_TOKEN`, `MARKSYNC_E2E_SPACE_KEY`, `MARKSYNC_E2E_PARENT_PAGE_ID` — and constructs the **real** Confluence adapter (`ConfluenceTarget.fromCredentials(credentials, spaceId, options)`). Expose a `requiredSecretsPresent()` guard that returns true only when **all** required vars are non-empty (all-or-nothing, RSK-6). (F-3, NFR-CI-3, RSK-6)
- [ ] **5.2** Create the **run-scoped cleanup helper**: a tracker that records every page id created during the run and a `cleanupAll()` that deletes each (best-effort, sequentially). On any failure, **log the created page ids** to the run output so the nightly sweep backstop (spec R2) can find orphans. Register cleanup in an `afterAll`/`finally` so it runs even on mid-run failure. (F-3, NFR-CI-4, RSK-2)
- [ ] **5.3** Create `tests/e2e/sandbox-guard.test.ts` (TC-E2E-001): when `requiredSecretsPresent()` is false, the test **skips** (Bun's `it.skip` / a guard that returns early) and logs a clear "secrets not configured, skipping" message — so `bun test tests/e2e/` exits 0 with no secret set. Assert: exit 0, skip message present. (AC-F3-1, NFR-CI-3)
- [ ] **5.4** Create `tests/e2e/sandbox-smoke.test.ts` (TC-E2E-002): guarded by `requiredSecretsPresent()` (skip when false). When true: construct the real adapter; **create** a test page under the configured parent in the dedicated space (capture the page id; register it with the cleanup tracker); **read** it back; assert the read page matches (title/body); **delete** it via the adapter; attempt to read the deleted page and assert it is not found; in `afterAll`, assert the cleanup tracker is empty (every created page deleted). Log created page ids for the orphan-detection backstop. (AC-F3-2, NFR-CI-4, NFR-MAINT-4)
- [ ] **5.5** Honor sandbox hygiene: single dedicated space (from `MARKSYNC_E2E_SPACE_KEY`); concurrency-group 1 is already enforced by `run-e2e.yml` (do NOT duplicate that logic in the harness); credentials come only from the env (never hardcoded). (NFR-MAINT-4)
- [ ] **5.6** Verify locally: run `bun test tests/e2e/` **WITHOUT** any `MARKSYNC_E2E_*` secrets set → assert it exits 0 (the skip path). (AC-F3-1)
- [ ] **5.7** Confirm `run-e2e.yml` is **NOT** modified — the harness consumes its env-var names and triggers as-is (NG-6). (AC-F3-3)

**Acceptance Criteria**:

- Must: `bun test tests/e2e/` exits **0** when any required `MARKSYNC_E2E_*` secret is absent (skip, not fail), with a clear skip message. (AC-F3-1, NFR-CI-3)
- Must: When all secrets are present, the smoke test performs a create + read + delete round-trip against the dedicated sandbox space and deletes every page it created (cleanup tracker empty at run end; created ids logged on failure). (AC-F3-2, NFR-CI-4)
- Must: The guard is all-or-nothing — partial credentials skip entirely, never construct half-configured credentials. (RSK-6)
- Must: `run-e2e.yml` is unchanged; the harness uses its env-var names verbatim. (AC-F3-3, NG-6)
- Should: `bun run typecheck` + `bun run lint` are clean for the new `tests/e2e/**/*.ts` files.

**Affected code areas**:

- `tests/e2e/helpers.ts` (new — adapter constructor + secret guard + cleanup helper)
- `tests/e2e/sandbox-guard.test.ts` (new — TC-E2E-001)
- `tests/e2e/sandbox-smoke.test.ts` (new — TC-E2E-002)

**System docs to update**:

- None this phase.

**Tests**:

- `bun test tests/e2e/` (no secrets) → exit 0 (skip path verified locally).
- Manual review (TC-E2E-003): confirm `run-e2e.yml` triggers (schedule / `run-e2e` label / `workflow_dispatch`), concurrency group `e2e-sandbox` with `cancel-in-progress: false`, all `MARKSYNC_E2E_*` secrets referenced, and `bun test tests/e2e/` invoked — unchanged.

**Completion signal**: `test(e2e): GH-29 live-sandbox harness with guarded smoke test + cleanup`

---

### Phase 6: Tier Verification + Quality Gate + Finalize (F)

**Goal**: Prove the whole change is green — the five already-wired tiers + CI fast loop + coverage gate are green (F-4), `bun run check` is green (AC-2), no production source was changed (DEC-3), and no version bump is needed (`version_impact: none`). Reconcile docs where needed and finalize.

**Tasks**:

- [ ] **6.1** Verify the five already-wired tiers are green (F-4 / TC-TIER-001–005): `bun test tests/unit/`, `bun test tests/integration/`, `bun test tests/golden/` (without `--update-snapshots`), `bun test tests/golden/mermaid` (happy-dom preload), and `bun test tests/e2e-mock/` (GH-81 tier) — each exits 0. (AC-F4-1)
- [ ] **6.2** Verify the coverage gate: the CI fast-loop `Test` step runs `bun test --coverage tests/unit/ tests/integration/ tests/golden/` with thresholds lines ≥ 0.70 / functions ≥ 0.80 (`bunfig.toml`). **Note:** the new BDD files run under cucumber (a separate runner from `bun test`) and the new `tests/e2e/` smoke test is a guarded skip in the secrets-free path, so **neither contributes to the bunfig coverage threshold** — coverage is computed over `tests/unit/ + tests/integration/ tests/golden/` only, and this change adds nothing there, so coverage should be unaffected. Confirm the gate is green. (AC-F4-1, NFR-CI-1)
- [ ] **6.3** Run `bun run check` (lint + format:check + typecheck + test + check:boundaries) and confirm it is green — no regressions from the additive BDD/E2E infrastructure (AC-2). Note: `bun run check` runs `bun run test` (= `bun test`, the whole `tests/` root per `bunfig.toml`); the new `tests/e2e/*.test.ts` skip cleanly without secrets, and `tests/bdd/**` is not a `bun:test` target (it has no `*.test.ts` under `tests/bdd/`), so it does not interfere. (AC-2)
- [ ] **6.4** Fix any lint/format/typecheck issues introduced by the new test files (e.g. biome formatting of the new `.ts` step/support/e2e files, import-order, non-null-assertion warnings). NOTE: `.feature` files are **not** linted by biome; ensure the TS files are. If `bun run format` is needed, run it (whitespace-only reflow). (AC-2)
- [ ] **6.5** Verify the production-source guardrail: `git diff --stat main -- src/` shows **zero** changed files under `src/**` (DEC-3). If any `src/**` file appears, **STOP and escalate to the PM** — it is out of scope. (DEC-3, NFR-MAINT-2)
- [ ] **6.6** Verify `run-e2e.yml` and `bunfig.toml` are unchanged (NG-6): `git diff --stat main -- .github/workflows/run-e2e.yml bunfig.toml` is empty.
- [ ] **6.7** Spec reconciliation: confirm no system-spec reconciliation is required for delivery (`version_impact: none`; this change adds test infra + one comment-refresh). If `@doc-syncer` (lifecycle phase 7) wishes to note the now-wired BDD/live-sandbox tiers in `.ai/rules/testing-strategy.md`, that is optional and handled there — not blocking. (§22)
- [ ] **6.8** (No version bump — `version_impact: none`.) Confirm `package.json#version` is unchanged. (§15 version_impact)

**Acceptance Criteria**:

- Must: The five already-wired tiers + CI fast loop + coverage gate (lines ≥ 0.70, functions ≥ 0.80) are green. (AC-F4-1)
- Must: `bun run check` exits 0 (lint + format:check + typecheck + test + check:boundaries). (AC-2)
- Must: `git diff --stat main -- src/` is empty (zero production changes, DEC-3). (NFR-MAINT-2, DEC-3)
- Must: `run-e2e.yml` and `bunfig.toml` are unchanged. (NG-6)
- Must: `package.json#version` is unchanged (no version bump). (§15)
- Should: The PR description records the chosen cucumber invocation (OQ-P1 / DEC-2) and surfaces any genuine `src/` invariant bug discovered (DEC-3) for separate triage. (DEC-2, RSK-5)

**Affected code areas**:

- None (verification + finalize phase; any format/lint fix-ups only if needed by 6.4).

**System docs to update**:

- None required for delivery. Optional note in `.ai/rules/testing-strategy.md` that the BDD + live-sandbox tiers are now wired, deferred to lifecycle phase 7 (`@doc-syncer`). (§22)

**Tests**:

- `bun test tests/unit/`; `bun test tests/integration/`; `bun test tests/golden/`; `bun test tests/golden/mermaid`; `bun test tests/e2e-mock/`; `bun test tests/e2e/` (skip path); `bun run test:bdd`; `bun run check` (full gate).
- `git diff --stat main -- src/` → empty; `git diff --stat main -- .github/workflows/run-e2e.yml bunfig.toml` → empty.

**Completion signal**: `test(bdd): GH-29 tier verification + quality gate green (0 src changes)`

---

## Test Scenarios

> Traceability: each test-plan TC ID → the phase(s) that implement/verify it → the spec AC it satisfies. CI-config validation scenarios (TC-BDD-007, TC-E2E-003) are manual/semi-automated reviews against the workflow files.

| TC ID | Scenario | File / Target | Phases | AC / NFR |
|-------|----------|---------------|--------|----------|
| TC-BDD-001 | INV-SAFE-1: REMOTE_AHEAD blocks (zero overwrite) | `tests/bdd/features/no-silent-overwrite.feature` | 3, 4, 6 | AC-F2-1, AC-F2-5 |
| TC-BDD-002 | INV-SAFE-1: DIVERGED blocks (zero overwrite) | `tests/bdd/features/no-silent-overwrite.feature` | 3, 4, 6 | AC-F2-1, AC-F2-5 |
| TC-BDD-003 | INV-SAFE-2: REMOTE_MISSING blocks (no silent re-create) | `tests/bdd/features/no-silent-recreate-remote-missing.feature` | 3, 4, 6 | AC-F2-2, AC-F2-5 |
| TC-BDD-004 | INV-SAFE-2: zero `createPage` calls for REMOTE_MISSING (multi-doc) | `tests/bdd/features/no-silent-recreate-remote-missing.feature` | 3, 4, 6 | AC-F2-2, AC-F2-5 |
| TC-BDD-005 | INV-SAFE-3: duplicate-UUID fatal before any write (existing feature + new steps) | `tests/bdd/features/duplicate-uuid-fatal.feature` | 2, 4, 6 | AC-F2-3, AC-F2-5 |
| TC-BDD-006 | INV-SEC-1: no secrets in any output path (sentinel) | `tests/bdd/features/no-secret-in-output.feature` | 3, 4, 6 | AC-F2-4, AC-F2-5 |
| TC-BDD-007 | BDD CI binding — `test:bdd` step fails on regression (strict + undefined-step) | `.github/workflows/ci.yml`, `package.json` | 1, 4, 6 | AC-1, NFR-CI-1 |
| TC-E2E-001 | Live-sandbox guard — skip without secrets (exit 0) | `tests/e2e/sandbox-guard.test.ts` | 5, 6 | AC-F3-1, NFR-CI-3 |
| TC-E2E-002 | Live-sandbox smoke — create+read+delete round-trip + cleanup | `tests/e2e/sandbox-smoke.test.ts` | 5, 6 | AC-F3-2, NFR-CI-4, NFR-MAINT-4 |
| TC-E2E-003 | `run-e2e.yml` workflow — triggers + secrets wired (unchanged) | `.github/workflows/run-e2e.yml` | 5, 6 | AC-F3-3, NFR-MAINT-4 |
| TC-TIER-001 | Unit tier verification | `tests/unit/` | 6 | AC-F4-1 |
| TC-TIER-002 | Integration tier verification | `tests/integration/` | 6 | AC-F4-1 |
| TC-TIER-003 | Golden fixture tier verification | `tests/golden/` | 6 | AC-F4-1 |
| TC-TIER-004 | Mermaid-DOM tier verification | `tests/golden/mermaid` | 6 | AC-F4-1 |
| TC-TIER-005 | E2E-mock tier verification (GH-81) | `tests/e2e-mock/` | 6 | AC-F4-1 |
| TC-CHECK-001 | `bun run check` green (lint + format + typecheck + test + boundaries) | Root repo | 6 | AC-2, NFR-MAINT-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-29-spec.md | Spec |
| Test plan | ./chg-GH-29-test-plan.md | Test Plan |
| Implementation plan | ./chg-GH-29-plan.md | Plan |
| PM notes | ./chg-GH-29-pm-notes.yaml | Notes (DEC-1 BDD-scope decision; tier intake) |
| Testing strategy | ../../../../.ai/rules/testing-strategy.md | Rule (7-tier model; over-mocking guardrail; CI wiring) |
| CI workflow (fast loop) | ../../../../.github/workflows/ci.yml | CI (comment refresh on `test:bdd` step) |
| CI workflow (NOT touched) | ../../../../.github/workflows/run-e2e.yml | CI (live-sandbox tier — unchanged, NG-6) |
| Coverage config (NOT touched) | ../../../../bunfig.toml | Config (lines 0.70 / functions 0.80 — unchanged) |
| Package manifest | ../../../../package.json | Config (new devDep + real `test:bdd` script) |
| BDD feature (existing) | tests/bdd/features/duplicate-uuid-fatal.feature | Feature (INV-SAFE-3 — steps new in Phase 2) |
| BDD features (new) | tests/bdd/features/{no-silent-overwrite,no-silent-recreate-remote-missing,no-secret-in-output}.feature | Features (INV-SAFE-1/2, INV-SEC-1) |
| BDD step harness (new) | tests/bdd/steps/*.ts, tests/bdd/support/world.ts | Test infra (real engine + FakeTarget port) |
| Live-sandbox harness (new) | tests/e2e/{helpers.ts,sandbox-guard.test.ts,sandbox-smoke.test.ts} | Test infra (guarded smoke + cleanup) |
| Test helper (reuse) | tests/_helpers/fake-target.ts | Reference (FakeTarget — mocked `TargetSystem` adapter port) |
| Test helper (reuse) | tests/_helpers/fake-repository.ts | Reference (deterministic Git fixtures) |
| Sync engine entrypoints (reuse) | src/app/push-flow.ts (`computePlan`, `applyPlan`) | Reference (real modules, DEC-3) |
| Adapter factory (reuse) | src/infra/confluence/target.ts (`ConfluenceTarget.fromCredentials`) | Reference (real adapter for E2E) |
| Reference pattern (mirror) | tests/integration/confluence/push-flow.test.ts | Reference (real engine + FakeTarget shape) |
| Reference mock pattern (mirror) | tests/e2e-mock/mock-confluence-server.ts | Reference (`Bun.serve`/`node:http` mock shape) |
| Decision — BDD runner | ../../../../doc/decisions/TDR-0007-gherkin-bdd-runner.md | Authority (cucumber CLI; 4-invariant floor; strict mode) |
| Decision — test runner | ../../../../doc/decisions/TDR-0004-testing-runner.md | Authority (over-mocking guardrail; tier model) |
| Decision — identity/state | ../../../../doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md | Authority (INV-SAFE-1/2/3 definitions) |
| Production source | src/** | **Unchanged (DEC-3)** |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | plan-writer | Initial plan for GH-29. 6 commit-sized phases (A–F): (A) `@cucumber/cucumber` devDependency + binding strict-mode `test:bdd` runner validated under Bun (OQ-1/DEC-2); (B) BDD step harness driving the REAL `computePlan`/`applyPlan` against `FakeTarget` (only permitted mock — DEC-4) with `FakeRepository` fixtures, INV-SAFE-3 green; (C) INV-SAFE-1/2 + INV-SEC-1 `.feature` files + step defs, all 4 invariants green ≤ 30 s; (D) CI binding verification (deliberate-break proof, then revert) + stale `ci.yml` comment refresh; (E) live-sandbox harness — guarded smoke test (skip-without-secrets, RSK-6) + create/read/delete round-trip + run-scoped cleanup, driven by the unchanged `run-e2e.yml`; (F) tier verification (5 wired tiers + coverage gate) + `bun run check` green + finalize (no version bump). Enforces DEC-1 (4 INV invariants only; NFR-PERF-4/NFR-REL-5 stay in integration), DEC-2 (cucumber CLI under Bun; chosen form recorded in Phase 1 commit), DEC-3 (0 `src/**` changes; STOP+escalate real src bugs to PM — hard condition, not a task), DEC-4 (mock only `TargetSystem` port). Traced to TC-BDD-001–007, TC-E2E-001–003, TC-TIER-001–005, TC-CHECK-001 and AC-F1-1, AC-F2-1..5, AC-1, AC-F3-1..3, AC-F4-1, AC-2. Notes the acknowledged red intermediate state (Phase 1 → 2: strict mode makes undefined-steps fail until step defs land) and the coverage non-impact (BDD runs under cucumber, E2E skips without secrets — neither counts toward the bunfig threshold). Mirrors the GH-81 sibling plan format. |
| 1.1 | 2026-07-15 | plan-writer | DoR iter-1 fixes (verdict NOT_READY → align plan to spec v1.1 / test-plan v1.1). No scope, phase-count, decision, or traceability changes — three surgical corrections only: **(F1, blocker)** INV-SEC-1 injection point corrected — OQ-P2 CLOSED: the sentinel is injected into the document **content** (Markdown source via `FakeRepository.setFile`, mirroring `tests/integration/app/secrets-safety-integration.test.ts` TC-INTEGRATION-011), NOT into config/provenance (there is no credential-bearing config/provenance path to outputs; credentials live in the mocked `ConfluenceTarget`/`ConfluenceClient` adapter and never enter `computePlan`/`applyPlan`). Updated tasks 3.3/3.6, the Phase 3 INV-SEC-1 AC, and moved OQ-P2 from Open questions to a Resolved-decisions block. **(F2 alignment)** DEC-4/AC-F2-5/NFR-MAINT-1 wording broadened everywhere from "mock only the `TargetSystem` port" to "mock only the adapter ports (`TargetSystem` via `FakeTarget`, `Repository` via `FakeRepository`); domain logic real" — Context, guardrail blockquote, Constraints, Success Metrics (1 → 2 ports), Phase 2 Goal/Task 2.3/AC, Task 3.4, Phase 3 AC, Artifacts table, summary. **(F5, nit)** PR-timing note added: the PR opens only at/after Phase 6 (all 4 features green) so the red `test:bdd` window exists only on the Phase 1→2 feature-branch commits, never on the PR head; reordering the `test:bdd` landing into Phase 2 was considered and rejected to preserve Phase 1's isolated runner-validation signal. Phase→AC→TC mapping unchanged. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 — Cucumber dep + binding runner | Not started | — | — | — | |
| 2 — BDD step harness + INV-SAFE-3 | Not started | — | — | — | |
| 3 — INV-SAFE-1/2 + INV-SEC-1 features + steps | Not started | — | — | — | |
| 4 — BDD CI binding verification | Not started | — | — | — | |
| 5 — Live-sandbox E2E harness | Not started | — | — | — | |
| 6 — Tier verification + quality gate + finalize | Not started | — | — | — | |
