---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-103
  type: fix
  status: Proposed
  slug: mock-module-leak-ci-red
  title: "fix: ci red — eliminate process-wide mock.module leak in unit CLI tests (order-dependent integration failures)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, bug, ci, testing, priority:critical]
  version_impact: none
  audience: internal
  security_impact: none
  risk_level: medium
  dependencies:
    internal: [cli-command-handlers (doctor, repair-state), unit CLI test files, integration CLI test files, .ai/rules/testing-strategy.md, CI fast-loop test job]
    external: [Bun test runner 1.2.23 (pinned; mock.module semantics unchanged), GitHub Actions ubuntu-latest image (file-discovery order trigger; unchanged)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Eliminate the process-wide `mock.module` leak from the two unit CLI test files via dependency-injection seams, making the bun test suite order-independent and restoring the `Lint + Typecheck + Test` CI job to green on every PR.

## 1. SUMMARY

The `Lint + Typecheck + Test` CI job fails deterministically on **all** PRs since 2026-08-14 (first seen on PR #102; an identical tree passed 2026-07-26). Root cause — confirmed in the ticket with instrumented CI runs — is two process-wide `mock.module` registrations in the unit CLI tests (`#app/doctor`, `#app/repair`); Bun 1.2.23 does not scope them to the registering file and has no restore API. When file discovery orders the unit files before the integration files (the order GitHub's 2026-08 ubuntu-latest image now produces), the integration tests receive the leaked mock instead of the real `runDoctor`, producing a phantom report and failing TC-DOCTOR-013..022. The fix: add optional DI seams to the two CLI command handlers (mirroring the established `DoctorDeps` style), rewrite both unit test files to inject stubs through the seams, delete every `mock.module`, ban the API in the testing-strategy rules, and add an automated regression guard. Production behavior is unchanged (additive, defaulted, optional parameters only); no version bump.

## 2. CONTEXT

### 2.1 Current State Snapshot

- The CI fast loop runs `bun test tests/unit/ tests/integration/ tests/golden/` on a pinned Bun 1.2.23 (`Lint + Typecheck + Test` job; see `.ai/rules/testing-strategy.md` CI wiring).
- The unit test for the doctor CLI handler (TC-DOCTOR-011.1–.5: exit-code derivation, DEC-4 CommandResult structure) drives `doctorCommand` against a stubbed `runDoctor` registered via `mock.module("#app/doctor", …)`. The stub's default/last-set value is exactly the phantom report seen in CI: `{"checks":[],"summary":{"pass":5,"warn":0,"fail":0,"skipped":0,"total":5},"worstStatus":"pass"}`.
- The unit test for the repair-state CLI handler drives the `runRepair` tails (tests 5–6: mapped failure / success flow-through) through `mock.module("#app/repair", …)`; early-return paths (tests 1–4) use the `runCli` harness against temp dirs and are unaffected.
- The integration doctor tests (TC-DOCTOR-013..022) import the **real** `runDoctor` and exercise real config/git/credential validation against a `Bun.serve()` mock Confluence server. They are the pollution victims — they are correct and need no changes.
- The application tier already demonstrates the repo's DI convention: `runDoctor(deps: DoctorDeps)` accepts optional injectable dependencies that fall back to static imports when absent.
- Grep of the tree at `main @ 1ebc664` confirms `mock.module` appears in exactly the two unit CLI test files — no other usage exists (ticket audit claim re-verified at intake).
- `.ai/rules/testing-strategy.md` documents test tiers, the over-mocking guardrail, and CI wiring — but has **no** `mock.module` ban (AC gap confirmed).

### 2.2 Pain Points / Gaps

- **CI gate red repo-wide.** The test job fails on every PR, blocking **every** merge (ticket labeled `priority:critical`) — the second repo-wide blocker inside a week after GH-104.
- **Green→red drift with zero code change.** bun test's file-discovery order follows the runner's fs walk; the 2026-08 ubuntu-latest image generation changed the effective order, so identical code flipped green→red. Local runs pass because local discovery order differs — "local green" proves nothing here.
- **Unsafe test API in active use.** Bun's `mock.module` is process-wide, unscoped, and has no restore API in 1.2.23 — a latent order-dependency trap with no guardrail rule against reintroduction.
- **Downstream test casualties.** TC-DOCTOR-013..022 — including the INV-SEC-1-adjacent redaction tests (TC-DOCTOR-015/016) — fail with phantom data (`credentials check undefined`, `worstStatus: "pass"` where `fail` expected), masking real coverage: CI coverage tables show the real confluence-check branches never executed.

## 3. PROBLEM STATEMENT

Because two unit CLI test files register process-wide `mock.module` mocks that Bun 1.2.23 neither scopes to the registering file nor offers an API to restore, any test run whose file-discovery order places those unit files before the integration files silently replaces the integration tests' real `runDoctor` with the leaked mock, so the `Lint + Typecheck + Test` CI job fails deterministically on every PR and no change — including critical fixes — can merge.

## 4. GOALS

- **G-1**: The test suite is order-independent — the full fast-loop suite is green regardless of test-file discovery order, with zero process-wide mock leakage.
- **G-2**: No `mock.module` remains anywhere under `tests/`, and its reintroduction is blocked by an automated regression guard.
- **G-3**: The two affected unit test files keep their current scenario coverage (same behaviors asserted), with stubs supplied through injectable seams instead of module mocks.
- **G-4**: `.ai/rules/testing-strategy.md` documents the `mock.module` ban and the preferred alternatives (DI seams; `Bun.spawn` CLI-level tests).
- **G-5**: Zero production behavior change — the DI parameters are optional with defaults; production callers are untouched; no version bump.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| `Lint + Typecheck + Test` CI job on this change's PR | green |
| Test failures with unit CLI files explicitly ordered BEFORE integration files | 0 |
| `mock.module` occurrences in `tests/` (automated check) | 0, enforced |
| Production behavior deltas (doctor / repair-state outputs, exit codes) | 0 |
| Integration test files modified | 0 |
| Package version change | none (stays 0.8.2) |

### 4.2 Non-Goals

- **NG-1**: No fix to Bun's `mock.module` implementation and no waiting for an upstream scoping/restore API — the codebase simply stops using the API.
- **NG-2**: No conversion of other commands or test files to DI seams — only the two files named in the ticket.
- **NG-3**: No behavior change to the `doctor` / `repair-state` commands — the source change is limited to an additive, optional dependencies parameter with unchanged defaults.
- **NG-4**: No CI workflow configuration change (preferred guard mechanism keeps the change test-only; see DEC-1).
- **NG-5**: No version bump — nothing user-facing ships (see DEC-2 for the confirmed reading and the GH-104 contrast).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Order-independent test suite | The suite's result must not depend on bun test's fs-discovery order; this is the actual outage (green→red drift with zero code change) and the ticket's primary outcome. |
| F-2 | Injectable unit-test seam for the doctor CLI handler | The unit tests must stub `runDoctor` file-locally instead of process-wide; the handler accepts an optional injectable `runDoctor` dependency (ticket-confirmed direction: `DoctorCommandDeps`, mirroring the existing `DoctorDeps` DI style in `runDoctor`). |
| F-3 | Injectable unit-test seam for the repair-state CLI handler | Same class of fix for `#app/repair`: `RepairStateCommandDeps` with an optional injectable `runRepair`; early-return coverage keeps using the existing `runCli` harness. |
| F-4 | `mock.module` ban documented and enforced | The testing-strategy rules must ban the API (process-wide, unscoped, order-dependent) with preferred alternatives, and an automated guard must keep it out of `tests/`. |

### 5.1 Capability Details

**F-1 — Order independence.** After the change, no test file mutates module state that any other test file imports; the stubs live behind per-call injection and never touch the module registry. Verification is order-explicit, not order-lucky: the suite must pass both under a reproducible ordering that places the unit CLI files before the integration files (the failing CI order) and under the standard full-suite invocation.

**F-2 — Doctor seam.** The doctor command handler gains an optional second parameter carrying an injectable `runDoctor` (`DoctorCommandDeps`). When the parameter is omitted — the only production call pattern — the real application-tier `runDoctor` runs and the existing DEC-4 CommandResult contract (direct construction; `data` always present; `error` never set; exit code from `worstStatus`, `EXIT_HEALTH` 60 on gating fail per TDR-0009) is preserved byte-for-byte. The unit tests pass their stub through the seam per call.

**F-3 — Repair seam.** Identical pattern for the repair-state handler: an optional `RepairStateCommandDeps` with injectable `runRepair`; omitted ⇒ the real `runRepair`. The unit rewrite preserves tests 1–4 (early-return paths via the `runCli` harness, which never reach `runRepair`) and drives tests 5–6 (failure mapping / success flow-through, including the opts-wiring assertions) through the injected stub.

**F-4 — Ban + guard.** The testing-strategy rules gain an explicit prohibition on `mock.module` in agent- and human-authored tests, with the two sanctioned alternatives: DI seams for unit-level isolation, and `Bun.spawn`-level CLI tests where process isolation is the point. An automated check (see DEC-1 for mechanism latitude) fails when `mock.module` usage appears anywhere under `tests/`.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — The bug (current, for the record)
  CI (ubuntu-latest 2026-08 image): bun test discovers unit CLI files FIRST
  unit/doctor.test.ts: mock.module("#app/doctor") registers PROCESS-WIDE
  integration/doctor.test.ts (4 files later): imports resolve to the LEAKED mock
  → phantom report {"checks":[],"summary":{"pass":5,...},"worstStatus":"pass"}
  → TC-DOCTOR-013..022 red → Lint + Typecheck + Test job fails → PR blocked

Flow 2 — After the fix (any order)
  unit/doctor.test.ts: stubs injected per call via DoctorCommandDeps (file-local)
  integration/doctor.test.ts: imports the REAL runDoctor — regardless of order
  bun test (any discovery order): green; CI job green; merges unblocked

Flow 3 — Regression guard
  Contributor: reintroduces mock.module in any tests/ file
  Automated guard: detects the occurrence → suite fails at review time
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Source: additive optional DI-seam parameter on the two CLI command handlers (`doctorCommand`, `repairStateCommand`), defaulting to the real application-tier functions; production callers unchanged.
- Tests: rewrite of the two unit CLI test files (`tests/unit/cli/commands/doctor.test.ts`, `tests/unit/cli/commands/repair-command.test.ts`) to inject stubs via the seams; both `mock.module` registrations (and their hoisting-explainer comments) deleted; scenario coverage preserved like-for-like.
- Rules: `.ai/rules/testing-strategy.md` gains the `mock.module` ban + preferred alternatives (DI seams, `Bun.spawn` CLI-level tests).
- Guard: an automated check asserting zero `mock.module` usage under `tests/` (mechanism per DEC-1; a tree-scanning test is the PM-noted preference because it keeps the change test-only).
- Verification: explicitly-ordered suite run (unit CLI files before integration files) + full standard suite + full local quality gate.
- Implementation input: the verified fix patch preserved from the GH-104 session (`tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch`) — to be re-validated against current `main`, not applied blindly (DEC-3).

### 7.2 Out of Scope

- [OUT] Fixing or working around Bun's `mock.module` semantics; adopting a future restore API (NG-1).
- [OUT] Converting any other command handlers or test files to DI seams (NG-2).
- [OUT] Any behavior change to the `doctor` / `repair-state` commands, their outputs, exit codes, or the DEC-4 CommandResult contract (NG-3).
- [OUT] CI workflow / job configuration changes (NG-4 — moot if the scanning-test mechanism is chosen).
- [OUT] Version bump or release-notes-worthy packaging change (NG-5).
- [OUT] Modifying the integration CLI tests — they are the pollution victims, not causes; they must simply keep passing unmodified.
- [OUT] Reverting the diagnostic commits on `docs/pdr-0002-ms0003-rescope` (ticket-evidence housekeeping tracked there, not here).

### 7.3 Deferred / Maybe-Later

- Revisit the ban if Bun ships scoped/restorable module mocks in a future pinned version.
- Opportunistic extension of the DI-seam pattern to other command handlers when their tests are next touched.
- Optional CI hardening that runs the suite under a permuted/shuffled file order to surface other latent order dependencies (this change removes the known one; permutation is broader insurance).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no HTTP surface changes; the CLI command surface (flags, outputs, exit codes) is untouched.

### 8.2 Events / Messages

N/A — no events or messages produced or consumed.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | Command-handler dependency contracts (`DoctorCommandDeps`, `RepairStateCommandDeps`) | **New (additive)** — optional, defaulted; each carries an injectable `runDoctor` / `runRepair`. Invisible to existing callers. |
| DM-2 | `tests/` tree invariant | **New** — zero `mock.module` occurrences, enforced by the automated guard (F-4). |

No persisted data (lock, cache, config schemas) is touched.

### 8.4 External Integrations

| Integration | Change | Contract |
|-------------|--------|----------|
| Bun test runner (pinned 1.2.23) | None | The runner's `mock.module` semantics (process-wide, unscoped, no restore) are treated as fixed constraints, not dependencies to change. |
| GitHub Actions ubuntu-latest image | None | The image's file-discovery order triggered the outage; after this change the suite is insensitive to that order. |

### 8.5 Backward Compatibility

Fully backward compatible:

- Public CLI surface unchanged: same flags, same JSON envelopes, same exit codes (DEC-4 contract preserved).
- Source change is additive and optional — production callers pass no dependencies and get the real implementations via default fallback.
- Integration, golden, e2e-mock, and BDD tiers are unmodified and must remain green.
- Version impact: **none** (stays 0.8.2; DEC-2).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Test-order independence | 0 failures under a reproducible run ordering unit CLI files before integration files AND under the standard full fast-loop suite invocation |
| NFR-2 | `mock.module` exclusion enforced | 0 occurrences under `tests/`; the automated guard fails on ≥ 1 occurrence |
| NFR-3 | Zero production behavior delta | doctor/repair-state outputs and exit codes byte-identical pre/post; 0 integration test files modified; all existing tests green |
| NFR-4 | Full quality gate green | `bun run check` passes end-to-end (lint, format, typecheck, full test suite, boundary check) with 0 failures |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new metrics, traces, or alerts. The CI `Lint + Typecheck + Test` job result is the observability surface: it transitions red → green on this change's PR and stays green for subsequent PRs. The regression guard's failure output is the forward-looking detector for reintroduction.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | DI seam subtly alters the default path (wrong fallback, arg mis-wiring) and changes command behavior | M | L | Default is the real implementation; NFR-3 requires byte-identical outputs and 0 modified integration tests — the real-`runDoctor` integration tests are the tripwire. | L |
| RSK-2 | Unit-test rewrite silently drops scenario coverage (TC-DOCTOR-011.1–.5, repair tests 5–6 incl. opts-wiring assertions) | M | L | Rewrite is like-for-like: same test IDs/scenarios, only stub wiring changes; CI coverage table compared pre/post for the affected branches. | L |
| RSK-3 | Other latent order dependencies exist beyond `mock.module` | M | L | Ticket audit + intake grep found exactly 2 sites; NFR-1's dual-order verification would surface further order sensitivity; permutation testing deferred (§7.3). | L |
| RSK-4 | Handoff patch drifts from current `main` (authored in the GH-104 session) and mis-applies | L | M | DEC-3: re-validate against `main @ 1ebc664` rather than applying blindly; the spec's outcome ACs, not the patch, are authoritative. | L |

## 12. ASSUMPTIONS

- Bun 1.2.23 (pinned) exhibits the diagnosed semantics: `mock.module` is process-wide, unscoped by test file, and has no restore API; the pin does not change in this change.
- `mock.module` exists in exactly the two named unit CLI test files (re-verified by grep at intake on `main @ 1ebc664`).
- The ticket's DI-seam fix direction is valid on current `main` (PM-confirmed during clarify_scope).
- The integration doctor tests require no modification — importing the real `runDoctor` is correct once the leak is gone; Bun's mock preserving non-mocked exports (`DOCTOR_CHECK_IDS` resolved fine) explains why only the mocked function leaked.
- The handoff patch is a faithful implementation of the seams + rewrites (human-approved descope from the GH-104 session) but is input, not authority (DEC-3).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Pinned Bun 1.2.23 runner behavior (unchanged) | The constraint the design works around; no upgrade required or desired here. |
| Depends on | Handoff patch artifact (`tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch`) | Verified fix work; implementation input to re-validate (DEC-3). |
| Blocks | All other in-flight PRs (indirectly) | The test job is red repo-wide; merging this fix (with GH-104's already-landed osv fix) restores a fully green check suite — other PRs re-run CI on the updated base. |

Independent of GH-104 (different CI job, different mechanism); both were needed for a fully green suite — GH-104 is already merged at `main @ 1ebc664`.

## 14. OPEN QUESTIONS

None blocking at time of writing. The regression-guard mechanism (scanning unit test vs. CI grep gate) is deliberately delegated to the plan (DEC-1) — the spec's AC is mechanism-neutral; the PM-noted preference keeps the change test-only.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | State the regression guard mechanism-neutrally ("no `mock.module` in `tests/`, enforced by an automated check") and let the plan pick the mechanism; note the preference for a tree-scanning unit test. | The ticket allows either a grep gate in CI or a scanning test. A scanning test keeps the change test-only (no CI config edit, NG-4), runs everywhere the suite runs (local + CI), and fails at review time. Pinning the mechanism in the spec would pre-empt plan-level trade-offs without adding outcome value. | 2026-08-15 |
| DEC-2 | No version bump — package version stays 0.8.2. | Confirms the PM's reading: nothing user-facing ships. Contrast GH-104 DEC-2 (which bumped 0.8.1 → 0.8.2 because patched dependencies embed in the tagged binary + SBOM). Here the source delta is an additive, defaulted, optional parameter invisible to every production caller; a bump would falsely signal a shipped fix. | 2026-08-15 |
| DEC-3 | Treat the handoff patch as implementation input to re-validate against `main @ 1ebc664`, not to apply blindly. | The patch (11.8 KB, human-approved descope from the GH-104 session) implements exactly the DI seams + both test rewrites, but provenance ≠ correctness at merge time; outcome ACs in §17 remain authoritative. | 2026-08-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| CLI command handlers (`doctorCommand`, `repairStateCommand`) | Updated — additive optional DI parameter, default behavior unchanged |
| Unit CLI command tests (the two files named in the ticket) | Rewritten — seam-injected stubs; `mock.module` deleted; coverage preserved |
| Integration CLI tests (doctor) | Unchanged — pollution victims; must stay green unmodified |
| `.ai/rules/testing-strategy.md` | Updated — `mock.module` ban + preferred alternatives |
| Regression guard (automated check, mechanism per DEC-1) | New |
| CI workflow configuration | Unchanged (preferred mechanism is test-only) |
| Package version | Unchanged (0.8.2; DEC-2) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the completed change, **when** the fast-loop suite is invoked with a reproducible file order that places the unit CLI command test files BEFORE the integration CLI command test files (e.g. explicit file ordering — the failing CI order), **then** the run has 0 failures and the TC-DOCTOR-013..022 pollution no longer reproduces. | F-1, F-2, F-3, NFR-1 |
| AC-F1-2 | **Given** the same tree, **when** the standard full fast-loop suite invocation (`tests/unit/ tests/integration/ tests/golden/`) runs, **then** it completes with 0 failures. | F-1, NFR-1, NFR-4 |
| AC-F1-3 | **Given** this change's PR, **when** CI runs the `Lint + Typecheck + Test` job on GitHub's current ubuntu-latest image (the order that produced the outage), **then** the job is green. | F-1, NFR-1 |
| AC-F2-1 | **Given** `doctorCommand` invoked without the dependencies parameter (the production default), **when** the command runs, **then** behavior is identical to pre-change — the real `runDoctor` executes and the DEC-4 CommandResult contract (direct construction, `data` always present, exit from `worstStatus`) is preserved; all existing doctor integration tests pass unmodified. | F-2, NFR-3, DM-1 |
| AC-F3-1 | **Given** `repairStateCommand` invoked without the dependencies parameter (the production default), **when** the command runs, **then** behavior is identical to pre-change — the real `runRepair` executes; all existing repair-related tests pass unmodified. | F-3, NFR-3, DM-1 |
| AC-F4-1 | **Given** the completed change, **when** an automated check scans the `tests/` tree for `mock.module` usage, **then** it finds 0 occurrences, and the guard demonstrably fails when a `mock.module` usage is (re)introduced. | F-4, DM-2, NFR-2 |
| AC-F4-2 | **Given** `.ai/rules/testing-strategy.md` after the change, **when** a contributor reads it, **then** it documents that `mock.module` is banned (process-wide, unscoped, order-dependent) and names the preferred alternatives (DI seams; `Bun.spawn` CLI-level tests). | F-4 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single fix PR to `main`; no feature flag, no migration, no config change; immediate merge priority (`priority:critical` — every PR is blocked on the red test job).
- After merge: other open PRs re-run CI on the updated base; the test job goes green repo-wide (GH-104's osv fix already landed at `main @ 1ebc664`, so both blockers are then cleared).
- No release action: version unchanged (DEC-2); the next tag-triggered release is unaffected (no shipped-behavior delta).
- Housekeeping noted in the ticket (reverting diagnostic commits on `docs/pdr-0002-ms0003-rescope` before that branch merges) stays with that branch, out of scope here.
- Communication: fix-line note "fix(tests): remove process-wide mock.module — restore order-independent CI via DI seams".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted state touched. The committed versioned lock and the disposable `.marksync/` cache are unaffected; the only "data" change is the tests-tree invariant (DM-2), enforced going forward by the guard.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no personal data handling changes. Test stubs use the existing fixture values (token-shaped literals already in the tree); the failing set included the redaction tests (TC-DOCTOR-015/016), which this change restores to green — a net privacy-coverage improvement.

## 21. SECURITY REVIEW HIGHLIGHTS

- No security impact: no shipped-code behavior change, no new inputs/outputs, no dependency change.
- The additive DI parameter is internal surface, defaulted to real implementations; it grants tests no production capability.
- Secondary benefit: the outage had been masking the real confluence-check coverage (CI showed those branches unexecuted); restoring genuine integration coverage improves the INV-SEC-1 redaction tests' trustworthiness.

## 22. MAINTENANCE & OPERATIONS IMPACT

- Permanent: the regression guard adds one always-on check; the rules-doc ban steers both human and AI agents (the repo is explicitly AI-agent-operable — the over-mocking guardrail audience) away from the trap.
- Removes a whole class of flaky-red CI ("works locally, red in CI") — the most expensive kind to triage, as this outage demonstrated.
- If a future Bun pin ships scoped/restorable module mocks, the ban can be revisited as a documented rules change (§7.3); until then the guard holds.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `mock.module` | Bun test API that replaces a module's exports for the **whole process** — unscoped by test file, no restore API in 1.2.23; the root cause and future-banned API. |
| Process-wide mock leak | A module mock registered by one test file being observed by other files in the same bun test process, depending on import/discovery order. |
| File-discovery order | The order in which bun test walks the filesystem to find test files; follows the runner's fs walk and varies by environment (the 2026-08 ubuntu-latest image changed it). |
| DI seam | An optional dependencies parameter on a function letting tests inject implementations per call (file-local), mirroring the repo's `DoctorDeps` convention; the sanctioned alternative to `mock.module`. |
| Phantom report | The leaked mock's default value (`checks: []`, `summary.pass: 5`, `worstStatus: "pass"`) that integration tests received instead of a real doctor report. |
| TC-DOCTOR-011 / TC-DOCTOR-013..022 | Unit test group (exit-code derivation, DEC-4 structure) / integration test group (real `runDoctor` against a `Bun.serve()` mock Confluence) from GH-30. |
| DEC-4 (GH-30) | Doctor CommandResult contract: construct directly (not `ok()`/`err()`), `data` always present, `error` never set, exit code from `worstStatus` (`EXIT_HEALTH` 60 per TDR-0009). |
| Regression guard | The automated check (DEC-1) failing when `mock.module` usage appears under `tests/`. |

## 24. APPENDICES

- **Failure signature (pre-fix, authoritative in ticket GH-103):**

  | Signal | Value |
  |---|---|
  | Failing job | `Lint + Typecheck + Test` (fast loop: `bun test tests/unit/ tests/integration/ tests/golden/`) |
  | First seen | 2026-08-14, PR #102 (identical tree passed 2026-07-26) |
  | Failing tests | TC-DOCTOR-013..022 — credentials check `undefined`, `worstStatus: "pass"` where `fail` expected |
  | Phantom report | `{"checks":[],"summary":{"pass":5,"warn":0,"fail":0,"skipped":0,"total":5},"worstStatus":"pass"}` |
  | Mock sites | Unit doctor test (line 28) and unit repair test (line 52) — exactly 2 call sites repo-wide (grep-verified at intake) |
  | Why partial exports worked | Bun's mock preserves non-mocked exports — `DOCTOR_CHECK_IDS` resolved correctly; only `runDoctor` leaked |

- **Evidence artifacts:** ticket GH-103 (root cause confirmed via instrumented CI runs); PR #102 run logs; PM intake notes (`chg-GH-103-pm-notes.yaml`); verified fix patch `tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch` (DEC-3).
- **Precedents:** `DoctorDeps` DI style in the application tier (optional deps falling back to static imports); GH-30 DEC-4 (CommandResult contract the seams must preserve); TDR-0009 (`EXIT_HEALTH` 60).
- **Related rules:** `.ai/rules/testing-strategy.md` — CI wiring (fast-loop invocation), over-mocking guardrail (the ban extends it), anti-patterns section.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | spec-writer (GH-103) | Initial specification — eliminate `mock.module` leak via DI seams; ban + regression guard; includes DEC-1 (mechanism-neutral guard), DEC-2 (no version bump), DEC-3 (handoff patch as re-validation input). |

---

## AUTHORING GUIDELINES

- Authored from the GH-103 planning-session context (PM clarify_scope summary + `chg-GH-103-pm-notes.yaml`); the ticket body is authoritative (no story-file prefix — generic bug).
- Grounded in the actual tree at `main @ 1ebc664`: both `mock.module` call sites read (unit doctor test line 28, unit repair test line 52 — exactly 2, matching the ticket audit); both command handlers read (current signatures, no deps parameter); the `DoctorDeps` DI convention read in the application tier; the integration doctor test read (imports the real `runDoctor`, TC-DOCTOR-013..022); `.ai/rules/testing-strategy.md` read (no existing ban — AC-4 gap confirmed); GH-30 DEC-4 located and cited; package version 0.8.2 (post-GH-104) confirmed.
- The ticket's four acceptance criteria are preserved in outcome terms in §17; the fix direction (DI seams, seam type names) is recorded in §5 as ticket-confirmed scope, not as implementation instruction — line-level edits belong to the plan.
- ACs are order-explicit by design: the order-dependence is the bug, so AC-F1-1's reproducible ordering (not "local green") is the real proof, per the PM's risk note.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-103)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-4, AC-F1-1..AC-F4-2, NFR-1..NFR-4, RSK-1..RSK-4, DEC-1..DEC-3, DM-1..DM-2)
- [x] Acceptance criteria reference at least one F-/NFR-/DM-/DEC- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no line-level edit instructions, no step-by-step tasks; affected files named as work items, as in the ticket)
- [x] No content duplicated from linked docs (ticket evidence summarized, not restated)
- [x] Front matter validates per front_matter_rules
