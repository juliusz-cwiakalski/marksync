---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-103-test-plan
status: Proposed
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, bug, ci, testing, priority:critical]
version_impact: none
summary: "Test plan for the mock.module leak fix: DI seams on doctor/repair-state CLI handlers, like-for-like rewrite of the two unit CLI test files, a scanning unit test banning mock.module call syntax under tests/, and order-explicit verification (unit-files-first invocation + standard fast loop + CI green). No behavior change; integration/golden/BDD/e2e tiers run unmodified as the regression net."
links:
  change_spec: ./chg-GH-103-spec.md
  implementation_plan: ./chg-GH-103-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - fix: ci red — eliminate process-wide mock.module leak in unit CLI tests via DI seams

## 1. Scope and Objectives

This test plan validates a **test-infrastructure fix with zero production behavior change**: two CLI command handlers gain additive, optional dependency-injection seams (`DoctorCommandDeps`, `RepairStateCommandDeps`), the two unit CLI test files are rewritten like-for-like to inject stubs through those seams (deleting both process-wide `mock.module` registrations), a new scanning unit test bans `mock.module` call syntax anywhere under `tests/`, and `.ai/rules/testing-strategy.md` documents the ban. The objectives are to (a) prove the suite is **order-independent** — green under an explicitly-ordered run that places the unit CLI files before the integration files (the failing CI order), under the standard fast-loop invocation, and on GitHub's own CI, (b) prove **default behavior is untouched** — the existing integration tests run unmodified against the seam-defaulted commands, and (c) prove the **regression guard works** — zero occurrences today and a demonstrable failure when a call site is reintroduced.

The core behaviors protected: the DEC-4 `CommandResult` contract (GH-30) exercised by TC-DOCTOR-011.1–.5 and the repair-state branch coverage (tests 1–6); the real-`runDoctor` integration coverage (including the INV-SEC-1-adjacent redaction tests TC-DOCTOR-015/016) that the leak was masking; and the repo's ability to merge at all (the red `Lint + Typecheck + Test` job blocks every PR).

### 1.1 In Scope

- Order-explicit verification: fast-loop suite green with the two unit CLI test files explicitly ordered BEFORE the integration tree (AC-F1-1), under the standard fast-loop invocation plus the full local gate (AC-F1-2), and on the CI job itself (AC-F1-3)
- Like-for-like rewrite verification: TC-DOCTOR-011.1–.5 and repair unit tests 1–6 keep their IDs, scenarios, and assertions; only the stubbing mechanism changes (seam injection replaces `mock.module`)
- Default-behavior preservation: doctor integration tests (TC-DOCTOR-013..020, TC-DOCTOR-022.1) and all repair tests (TC-REPAIR-001..005, TC-REPAIR-006..013, unit CLI 1–6) pass **unmodified**
- New regression guard: a scanning unit test asserting zero `mock.module(` call-syntax occurrences under `tests/`, with a matcher self-test proving it fails on reintroduction (AC-F4-1)
- `.ai/rules/testing-strategy.md` ban documentation, verified by review/doc-check — a documentation change, not a test (AC-F4-2)

### 1.2 Out of Scope & Known Gaps

- No new BDD, golden, adversarial, Mermaid-DOM, e2e-mock, or e2e-live test scenarios — no domain behavior changed (rationale in §4); those tiers run unmodified as regression signal only
- No permutation/shuffled-order CI wiring — deferred per spec §7.3; this change removes the only known order dependency and verifies order-independence explicitly (AC-F1-1) rather than exhaustively
- No direct unit test of the `deps`-omitted fallback path of `doctorCommand` — see assumption A-4 (§8.2) for the equivalence argument and the rejection rationale
- No CI workflow configuration change (spec NG-4); the guard is a unit test, so it runs everywhere the suite already runs

## 2. References

- Change specification: `chg-GH-103-spec.md` (authoritative for AC/F/NFR/DM/DEC IDs; §17 ACs, §5 capabilities)
- Ticket: GitHub issue GH-103 (authoritative problem statement; root cause confirmed with instrumented CI runs)
- PM notes: `chg-GH-103-pm-notes.yaml` (DEC-1 guard-mechanism preference; test-plan pinning instructions)
- Testing strategy: `.ai/rules/testing-strategy.md` (7-tier strategy; the over-mocking guardrail this change's ban extends; CI wiring) — itself edited by this change (AC-F4-2)
- Handoff patch (implementation input only, spec DEC-3): `tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch`
- CI wiring: `.github/workflows/ci.yml` — `Lint + Typecheck + Test` job fast loop (line ~72: `bun test --coverage tests/unit/ tests/integration/ tests/golden/`, Bun 1.2.23), `e2e-mock` job (line ~106), `bun run test:bdd` (line ~81)
- Precedents: GH-30 (DEC-4 CommandResult contract, TC-DOCTOR IDs), GH-28 (repair-state coverage, TC-REPAIR IDs), GH-104 test plan (verification-scenario format, decision-log style)
- Format reference: `doc/changes/2026-08/2026-08-15--GH-104--osv-red-fast-uri-js-yaml/chg-GH-104-test-plan.md`

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Explicitly-ordered run (unit CLI files BEFORE integration files) has 0 failures; TC-DOCTOR-013..022 pollution no longer reproduces | TC-ORDER-001 (made possible by TC-SEAM-001/002) | Covered |
| AC-F1-2 | Standard fast-loop invocation (`tests/unit/ tests/integration/ tests/golden/`) completes with 0 failures | TC-ORDER-002, TC-REG-001 | Covered |
| AC-F1-3 | CI `Lint + Typecheck + Test` job green on this change's PR (GitHub's actual discovery order) | TC-ORDER-003 | Covered |
| AC-F2-1 | `doctorCommand` without deps behaves identically (real `runDoctor`, DEC-4 contract); doctor integration tests pass unmodified | TC-SEAM-001 (mapping logic preserved), TC-SEAM-003 (real-runDoctor integration green, unmodified) | Covered |
| AC-F3-1 | `repairStateCommand` without deps behaves identically (real `runRepair`); repair tests pass unmodified | TC-SEAM-002 (tests 1–4 default-deps path via `runCli` unchanged; 5–6 seam-injected), TC-SEAM-004 | Covered |
| AC-F4-1 | Automated scan finds 0 `mock.module` occurrences under `tests/`; guard demonstrably fails on reintroduction | TC-GUARD-001 (clean scan), TC-GUARD-002 (matcher self-test) | Covered |
| AC-F4-2 | `.ai/rules/testing-strategy.md` documents the ban + preferred alternatives | TC-DOCS-001 (review-verified documentation change — no test, by design) | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No API or EVT surface is touched (spec §8.1/§8.2: N/A — CLI flags, outputs, exit codes unchanged). Data-model elements:

| Interface ID | Description | TC ID(s) | Status |
|--------------|-------------|----------|--------|
| DM-1 | `DoctorCommandDeps` / `RepairStateCommandDeps` — new, additive, optional, defaulted; invisible to existing callers | TC-SEAM-001, TC-SEAM-002 (seam exercised), TC-SEAM-003, TC-SEAM-004 (default invisible) | Covered |
| DM-2 | `tests/` tree invariant: zero `mock.module` occurrences, enforced by the automated guard | TC-GUARD-001, TC-GUARD-002 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Test-order independence: 0 failures under the reproducible unit-first ordering AND the standard full fast-loop invocation | TC-ORDER-001, TC-ORDER-002, TC-ORDER-003 | Covered |
| NFR-2 | `mock.module` exclusion enforced: 0 occurrences under `tests/`; guard fails on ≥ 1 occurrence | TC-GUARD-001, TC-GUARD-002 | Covered |
| NFR-3 | Zero production behavior delta: outputs/exit codes identical; 0 integration test files modified; all existing tests green | TC-SEAM-001..004, TC-REG-001 | Covered |
| NFR-4 | Full quality gate green: `bun run check` end-to-end with 0 failures | TC-ORDER-002 (step 2), TC-REG-001 | Covered |

## 4. Test Types and Layers

The change touches the unit tier directly (two rewritten files, one new guard test) and every other tier **only as an unchanged regression net**:

| Tier | Applies? | One-line reason |
|------|----------|-----------------|
| Unit | **Directly** — `tests/unit/cli/commands/doctor.test.ts` and `repair-command.test.ts` rewritten (seam-injected stubs, IDs/assertions preserved); NEW guard test `tests/unit/meta/no-mock-module.test.ts` scans the `tests/` tree (pure file reads, no runtime deps). |
| Integration | Regression only, **unmodified** — `tests/integration/cli/commands/doctor.test.ts` (real `runDoctor` vs `Bun.serve()` mock; the pollution victims) and `tests/integration/app/repair.test.ts` (real `runRepair`) are the default-behavior tripwire (RSK-1). |
| Golden fixture | Regression only — renderer output untouched; must stay byte-identical. |
| Golden adversarial | Regression only — corpus classification untouched. |
| Mermaid-DOM | Regression only — renderer untouched. |
| Gherkin / BDD | Regression only — lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) unaffected; runs via `bun run test:bdd` in CI. |
| E2E (mock) | Regression only — full-pipeline mock suite unchanged (contains no doctor/repair scenarios; verified by directory listing 2026-08-15), so it is a general green-tree signal, not seam-specific proof. |
| E2E (live-sandbox) | **Does not apply** — no shipped-behavior change to validate against a real Confluence space; separate opt-in gate. |

**No BDD/golden/e2e-mock/e2e-live tier changes are expected, by design**: the source delta is an additive, defaulted, optional parameter with no domain, adapter, or renderer behavior change — there is nothing new to assert at those tiers, and inventing scenarios there would violate the spec's non-goals (NG-2, NG-3). Those suites still run and must stay green as the regression signal that nothing leaked beyond the test wiring (NFR-3).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-ORDER-001 | Explicitly-ordered run (unit CLI files first) green — pollution no longer reproduces | Regression | Manual | High | AC-F1-1, NFR-1 |
| TC-ORDER-002 | Standard fast-loop invocation + full local gate green | Regression | Unit/Integration | High | AC-F1-2, NFR-4 |
| TC-ORDER-003 | CI `Lint + Typecheck + Test` job green on this PR | Verification | CI | High | AC-F1-3, NFR-1 |
| TC-SEAM-001 | Doctor unit rewrite like-for-like: TC-DOCTOR-011.1–.5 preserved via seam-injected stub | Regression | Unit | High | AC-F2-1, DM-1 |
| TC-SEAM-002 | Repair unit rewrite like-for-like: tests 1–4 unchanged, tests 5–6 seam-injected | Regression | Unit | High | AC-F3-1, DM-1 |
| TC-SEAM-003 | Doctor integration tests green **unmodified** (TC-DOCTOR-013..020, 022.1) | Regression | Integration | High | AC-F2-1, NFR-3 |
| TC-SEAM-004 | Repair tests green **unmodified** (TC-REPAIR-001..013) | Regression | Unit/Integration | High | AC-F3-1, NFR-3 |
| TC-GUARD-001 | Guard scan: 0 `mock.module(` call sites under `tests/` | Happy Path | Unit | High | AC-F4-1, DM-2, NFR-2 |
| TC-GUARD-002 | Guard self-test: matcher fails on a reintroduced call-site fixture, ignores prose mentions | Negative | Unit | High | AC-F4-1, NFR-2 |
| TC-DOCS-001 | Testing-strategy rules document the ban + preferred alternatives | Verification | Manual | Medium | AC-F4-2 |
| TC-REG-001 | Untouched tiers (golden, adversarial, Mermaid-DOM, BDD, e2e-mock) stay green | Regression | CI | Medium | NFR-3, NFR-4 |

### 5.2 Scenario Details

#### TC-ORDER-001 - Explicitly-ordered run (unit CLI files first) green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, F-1, F-2, F-3, NFR-1
**Test Type(s)**: Manual
**Automation Level**: Semi-automated (deterministic one-shot invocation; not wired into CI — permutation testing deferred, spec §7.3)
**Target Layer / Location**: Local quality gates — delivery phase 6 self-verification and phase 9 (`@runner`); result recorded in §10
**Tags**: @ci, @regression

**Preconditions**:

- Change applied on the branch: both `mock.module` registrations deleted, seams in place, guard test present
- Local `bun test` runnable (any local Bun version — see Notes)

**Steps**:

1. From the repo root, run the pinned order-explicit invocation (explicit file arguments fix the execution order regardless of fs discovery — the failing CI order):

   ```bash
   bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/
   ```

2. Assert exit code 0 and 0 test failures — in particular the pollution victims TC-DOCTOR-013, 014, 015, 016, 017, 018, 019, 020, and 022.1 are green **in the same process, after the unit CLI files have already run**
3. (Optional, negative control) run the identical invocation on `main` pre-fix and observe the phantom-report failures — proves the invocation actually reproduces the CI order

**Expected Outcome**:

- The suite passes under the reproducible unit-first ordering; the TC-DOCTOR-013..022 pollution (credentials check `undefined`, `worstStatus: "pass"` where `fail` expected) no longer reproduces
- This is the order-explicit proof AC-F1-1 requires — "order-explicit, not order-lucky" (spec §5.1)

**Notes / Clarifications**:

- Appending `tests/golden/` to the invocation is allowed for full-loop parity but not required — the pollution vector is the integration tree
- CI proves the GitHub-order variant of this property (AC-F1-3 / TC-ORDER-003); this local invocation is the reproducible, environment-independent form

---

#### TC-ORDER-002 - Standard fast-loop invocation + full local gate green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-2, F-1, NFR-1, NFR-4
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: Local — mirrors the CI fast-loop invocation; `bun run check` for the full gate
**Tags**: @regression, @ci

**Preconditions**:

- Change applied; working tree clean of stray fixtures

**Steps**:

1. Run the standard fast-loop invocation exactly as the spec defines it:

   ```bash
   bun test tests/unit/ tests/integration/ tests/golden/
   ```

2. Assert 0 failures (this run includes the rewritten unit files, the unmodified integration tree, and the new guard test under `tests/unit/meta/`)
3. Run the full local quality gate and assert it is green end-to-end (NFR-4):

   ```bash
   bun run check   # lint + format:check + typecheck + bun test + check:boundaries
   ```

**Expected Outcome**:

- Both invocations complete with 0 failures — AC-F1-2 satisfied locally; the identical fast-loop command (plus `--coverage`) runs in CI (TC-ORDER-003)

---

#### TC-ORDER-003 - CI `Lint + Typecheck + Test` job green on this PR

**Scenario Type**: Verification
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-3, F-1, NFR-1
**Test Type(s)**: CI
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` → `Lint + Typecheck + Test` job (`bun test --coverage tests/unit/ tests/integration/ tests/golden/`, Bun 1.2.23, ubuntu-latest) — unchanged wiring (NG-4)
**Tags**: @ci

**Preconditions**:

- Change pushed and PR opened (lifecycle phase 11)
- No CI workflow configuration changes in the diff

**Steps**:

1. Open/update the change PR
2. Observe the `Lint + Typecheck + Test` check on the PR
3. Assert the job completes green — the suite passes under GitHub's actual file-discovery order (the order that produced the outage on PR #102)
4. Also observe the `e2e-mock` job green (TC-REG-001)

**Expected Outcome**:

- The gate that was red repo-wide verifies the fix on the PR itself, unblocking merges (AC-F1-3)

---

#### TC-SEAM-001 - Doctor unit rewrite like-for-like: TC-DOCTOR-011.1–.5 preserved via seam-injected stub

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, DM-1, NFR-3, RSK-2
**Test Type(s)**: Unit
**Automation Level**: Automated (test execution) + Manual (like-for-like diff review)
**Target Layer / Location**: `tests/unit/cli/commands/doctor.test.ts` (rewritten; handoff patch is the re-validation input, spec DEC-3)
**Tags**: @backend, @cli

**Preconditions**:

- `doctorCommand(flags, deps?)` accepts optional `DoctorCommandDeps` with injectable `runDoctor` (defaulted to the real import)
- Rewrite applied: `mock.module` block and hoisting-explainer comment deleted; `mock` removed from the `bun:test` import; a `stubRunDoctor` closure reads the per-test `nextDoctorResult`

**Steps**:

1. Run `bun test tests/unit/cli/commands/doctor.test.ts` — assert all five scenarios pass:
   - TC-DOCTOR-011.1: all checks pass → exit 0, `data` present, `error` unset
   - TC-DOCTOR-011.2: warn (no fails) → exit 0 (warn does not gate)
   - TC-DOCTOR-011.3: any fail → exit 60 (`EXIT_HEALTH`)
   - TC-DOCTOR-011.4: `runDoctor` err → mapped error result, `data` absent
   - TC-DOCTOR-011.5: DEC-4 CommandResult structure (`schemaVersion`, `runId`, `exitCode`, `data`; not via `ok()`/`err()`)
2. Diff-review the file against `main`: only the stubbing mechanism changes — same `describe`/`test` IDs, same fixture reports, same `expect` assertions; the stub is now passed per call as `{ runDoctor: stubRunDoctor }` instead of registered process-wide
3. Confirm the file contains no `mock.module` call site (TC-GUARD-001 enforces this mechanically)

**Expected Outcome**:

- Scenario coverage is preserved like-for-like (same behaviors asserted); only the wiring changed — RSK-2 mitigated
- The DEC-4 exit-code derivation logic is exercised exactly as before

---

#### TC-SEAM-002 - Repair unit rewrite like-for-like: tests 1–4 unchanged, tests 5–6 seam-injected

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3, DM-1, NFR-3, RSK-2
**Test Type(s)**: Unit
**Automation Level**: Automated (test execution) + Manual (like-for-like diff review)
**Target Layer / Location**: `tests/unit/cli/commands/repair-command.test.ts` (rewritten; handoff patch is the re-validation input, spec DEC-3)
**Tags**: @backend, @cli

**Preconditions**:

- `repairStateCommand(flags, deps?)` accepts optional `RepairStateCommandDeps` with injectable `runRepair` (defaulted to the real import)
- Rewrite applied: `mock.module` block and hoisting-explainer comment deleted; `stubRunRepair` captures `lastRepairOpts` as the old mock did

**Steps**:

1. Run `bun test tests/unit/cli/commands/repair-command.test.ts` — assert all six scenarios pass
2. Verify the **semantics split** explicitly (PM-pinned):
   - Tests 1–4 (no `marksync.yml` → INVALID_CONFIG exit 10; corrupt lock → CORRUPT_LOCK exit 10; missing credentials → AUTH_MISSING_CREDENTIALS exit 20; no default target → INVALID_CONFIG exit 10) still drive the `runCli(["repair-state", "--json"])` harness — i.e. they exercise the **default-deps production path** (`deps` omitted) and never reach `runRepair`; their code and semantics are unchanged
   - Tests 5–6 (mapped failure → REMOTE_UNREACHABLE exit 99; success → exit 0, report flows through) now pass `{ runRepair: stubRunRepair }` through the seam, with the opts-wiring assertions preserved (`lastRepairOpts.dryRun === true`; test 6 also `targetId: "default"`)
3. Diff-review against `main`: tests 1–4 byte-identical; tests 5–6 differ only in the stub wiring argument; env-var save/restore harness untouched

**Expected Outcome**:

- All six scenarios pass with unchanged assertions; early-return coverage still proves the real default path, tail coverage now file-local — RSK-2 mitigated and the AC-F3-1 semantics made explicit

---

#### TC-SEAM-003 - Doctor integration tests green unmodified

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, NFR-3, DM-1, RSK-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts` — **Existing – No Change** (pollution victim, not cause)
**Tags**: @backend, @api

**Preconditions**:

- The leak is gone (precondition verified by TC-ORDER-001)

**Steps**:

1. Assert `git diff main --stat` shows `tests/integration/cli/commands/doctor.test.ts` is NOT in the changed-file set (0 integration test files modified — spec KPI)
2. Run the file standalone (`bun test tests/integration/cli/commands/doctor.test.ts`), inside the ordered run (TC-ORDER-001), and in the full suite (TC-ORDER-002)
3. Assert all nine tests green against the REAL `runDoctor` (which they import directly) and the `Bun.serve()` mock Confluence:
   - TC-DOCTOR-013 healthy pre-flight (read-only, no writes cross the wire)
   - TC-DOCTOR-014 `--json` envelope validity
   - TC-DOCTOR-015 credentials rejection carries no token (INV-SEC-1-adjacent redaction)
   - TC-DOCTOR-016 bad token → credentials fail, no token leak
   - TC-DOCTOR-017 wrong spaceKey → space-access fail
   - TC-DOCTOR-018 missing parent → parent-page fail
   - TC-DOCTOR-019 `--probe-capabilities` self-cleaning scratch page
   - TC-DOCTOR-020 permission advisory warns, does not gate exit
   - TC-DOCTOR-022.1 git fail → worstStatus fail, report present

**Expected Outcome**:

- The real-`runDoctor` coverage the outage was masking executes again (CI coverage tables should show the real confluence-check branches executed — spec §2.2), including the redaction tests — this is the AC-F2-1 default-behavior proof and the RSK-1 tripwire

**Notes / Clarifications**:

- "TC-DOCTOR-013..022" in the ticket/spec is range shorthand: the tree contains exactly the nine tests enumerated above (no TC-DOCTOR-021 test exists; 022 exists only as 022.1) — grounded by reading the file

---

#### TC-SEAM-004 - Repair tests green unmodified

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3, NFR-3, DM-1, RSK-1
**Test Type(s)**: Unit, Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/repair.test.ts` (TC-REPAIR-001..005) and `tests/integration/app/repair.test.ts` (TC-REPAIR-006..013) — **Existing – No Change**
**Tags**: @backend

**Preconditions**:

- The repair leak is gone

**Steps**:

1. Assert `git diff main --stat` shows neither repair test file in the changed-file set
2. Run both files (standalone and within the full suite); assert green:
   - Unit app tier: TC-REPAIR-001 (report shape), 002 (no secrets), 003 (dry-run 0 writes), 004 (stable diagnostic codes), 005 (dirty-lock detection)
   - Integration app tier: TC-REPAIR-006 (stale lock rebuild `--apply`), 007 (interrupted apply), 008 (write-counter), 009 (mid-transaction crash window), 010 (dry-run for interrupted apply), 011a/011 (diverged remote), 012 (absent property / missing page), 013 (journal lost)
3. Note: both files import the real `runRepair` — pre-fix, the unit CLI repair file's `mock.module("#app/repair")` was the same latent pollution class for these; post-fix they are provably decoupled (they also pass inside the ordered run, TC-ORDER-001)

**Expected Outcome**:

- All repair-related tests pass unmodified against the seam-defaulted command/app tier — AC-F3-1's "all existing repair-related tests pass unmodified" satisfied with existing coverage only (no gap found; no new tests needed)

---

#### TC-GUARD-001 - Guard scan: 0 `mock.module(` call sites under `tests/`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F4-1, F-4, DM-2, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: NEW `tests/unit/meta/no-mock-module.test.ts` (new `tests/unit/meta/` directory — repo-meta assertions about the test tree; pure file reads, no runtime dependencies)
**Tags**: @backend, @ci

**Preconditions**:

- Both `mock.module` call sites deleted by the rewrite (the only two in the tree — grep-verified at intake, `tests/unit/cli/commands/doctor.test.ts:28`, `repair-command.test.ts:52`)

**Steps**:

1. The guard walks the entire `tests/` tree (repo root resolved from `import.meta.dir`), reads every file as text, and counts occurrences of the **call-syntax literal `mock.module(`** (needle assembled by concatenation, e.g. `["mock", "module("].join(".")`, so the guard's own source never contains the contiguous literal and cannot flag itself)
2. Run it via the normal suite (`bun test tests/unit/` — it is picked up automatically; no CI wiring needed, NG-4)
3. Assert total count is 0; on failure the test lists each offending `file:line`

**Expected Outcome**:

- Scan reports 0 occurrences under `tests/` — the DM-2 invariant holds, NFR-2's first clause satisfied

**Notes / Clarifications**:

- **Pattern decision (PM-pinned)**: match `mock.module(` — the call syntax with the following open parenthesis — NOT the bare API name. The rewritten unit files legitimately mention `mock.module` in prose warning comments (e.g. "Never use `mock.module` here: it is process-global…"), and those mentions contain no following `(`; a bare-name scan would false-positive on its own warning prose. Call-syntax matching is exact for invocations and immune to the legit prose the rewrite retains. Whitespace variants (`mock.module (`) evade the needle — accepted residual risk (Biome formatting forbids that style; noted in §8.1 R-TST-2)

---

#### TC-GUARD-002 - Guard self-test: matcher fails on a reintroduced call-site fixture, ignores prose mentions

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F4-1, F-4, DM-2, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: Same guard test file — the scanner helper is exported so its counting logic is directly unit-testable against fixture strings
**Tags**: @backend, @ci

**Preconditions**:

- Guard implemented with a testable count/scan helper (fixture strings built by concatenation so the guard's own file stays clean)

**Steps**:

1. Feed the scanner a fixture representing a **reintroduced call site** — text containing `mock.module("#app/doctor", () => ({ ... }))` (assembled via concatenation, never a contiguous literal in guard source) — assert the scanner reports ≥ 1 occurrence at the expected line, i.e. the guard **would fail**
2. Feed a fixture containing only a **prose mention** — `// never use mock.module here (process-wide, unscoped)` — assert 0 occurrences, i.e. no false positive on legitimate prose
3. Feed a clean/empty fixture — assert 0 occurrences
4. Assert the failure diagnostic names the offending file and line (the forward-looking detector's triage output, spec §10)

**Expected Outcome**:

- The matcher demonstrably fails when a `mock.module` call site is (re)introduced and passes on prose — AC-F4-1's "demonstrably fails" clause proven **without** reintroducing anything into the tree (spec Flow 3)

**Notes / Clarifications**:

- This self-test is what elevates the guard from "currently passes" to "provably detects" — the difference between a tripwire and a decoration

---

#### TC-DOCS-001 - Testing-strategy rules document the ban + preferred alternatives

**Scenario Type**: Verification
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-F4-2, F-4
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `.ai/rules/testing-strategy.md` — documentation change verified by review/doc-check; **no test scenario is possible or wanted** (the AC is about what a contributor reads)
**Tags**: @docs

**Preconditions**:

- Rules edit applied on the branch

**Steps**:

1. Review the `.ai/rules/testing-strategy.md` diff: it bans `mock.module` explicitly — naming the reason (process-wide, unscoped, order-dependent, no restore API in Bun 1.2.23) — and names the two preferred alternatives: DI seams for unit-level isolation, `Bun.spawn`-level CLI tests where process isolation is the point
2. Confirm the ban lands where strategy readers will meet it (extends the AI-agent over-mocking guardrail / anti-patterns section) and the front-matter `last_updated` is bumped
3. Confirm no other strategy content is altered in flight

**Expected Outcome**:

- A contributor (human or AI agent) reading the strategy learns the API is banned and what to use instead — AC-F4-2 satisfied by documentation, verified in review (phase 5/8) rather than by a test

---

#### TC-REG-001 - Untouched tiers stay green

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-3, NFR-4, F-1
**Test Type(s)**: CI
**Automation Level**: Automated
**Target Layer / Location**: CI fast loop (golden + adversarial via `tests/golden/` glob, Mermaid-DOM), `bun run test:bdd`, `e2e-mock` job
**Tags**: @regression, @ci

**Preconditions**:

- No diffs under `tests/golden/`, `tests/adversarial/`, `tests/bdd/`, `tests/e2e-mock/`, `tests/e2e/` (assert via `git diff main --stat`)

**Steps**:

1. In the full local run (TC-ORDER-002) and CI fast loop, confirm golden-fixture, golden-adversarial, and Mermaid-DOM suites green — renderer outputs byte-identical
2. Confirm the BDD lifecycle-invariant suite green in CI (`bun run test:bdd`)
3. Confirm the `e2e-mock` CI job green on the PR

**Expected Outcome**:

- All previously-green tiers remain green unmodified — regression signal that the source-side seam changed nothing observable (NFR-3) and the full gate holds (NFR-4)

## 6. Environments and Test Data

### Test Environments

- **Local development**: Bun on the delivery machine; runs (a) the ordered invocation (TC-ORDER-001 — explicit file arguments pin the order on any environment), (b) the standard fast-loop invocation, (c) `bun run check`. Integration tests spin up their own `Bun.serve()` mock Confluence on `localhost` and temp git repos — no network, no secrets, no live Confluence.
- **CI (GitHub Actions)**: Bun 1.2.23 pinned, ubuntu-latest — the authoritative environment for AC-F1-3 (GitHub's file-discovery order is the outage trigger; local order proves nothing, which is exactly why TC-ORDER-001 pins the order explicitly).

### Test Data

- Existing fixtures only: `tests/unit/app/fixtures/valid-minimal.yml`, the token-shaped literals already in the tree (`ATATT3xFfGF0SECRET_TOKEN_VALUE_x9`), temp dirs created/cleaned by the suites. The guard test's fixtures are in-memory strings. **No new test data.**

### Isolation Strategy

- The change's entire thesis: stubs become **file-local** (per-call injection) instead of process-wide module mutation — no test file mutates module state any other file imports
- The guard performs read-only file walks; it creates no state
- Repair unit tests keep their existing env-var save/restore and temp-dir cleanup harness unchanged

## 7. Automation Plan and Implementation Mapping

### 7.1 Decision D-TST-1: guard = scanning unit test, call-syntax pattern, concatenation-built needle

Per spec DEC-1 (mechanism latitude, PM-noted preference now pinned here):

- **Scanning unit test, not a CI grep gate**: keeps the change test-only (NG-4 — zero CI config edits), runs everywhere the suite runs (local `bun test`, CI fast loop, `bun run check`), and fails at review time rather than only after push
- **Pattern = `mock.module(` call syntax**: the rewritten files retain prose warnings mentioning `mock.module` (no following paren) — a bare-name scan would false-positive on the very documentation the rewrite adds; call syntax is exact for invocations (see TC-GUARD-001 notes)
- **Needle and fixtures built by concatenation** (`["mock", "module("].join(".")` etc.): the guard cannot flag its own source or its self-test fixtures — the classic self-reference trap avoided by construction
- **Scanner helper exported for direct unit testing** (TC-GUARD-002): the "demonstrably fails" clause of AC-F4-1 is proven against fixture strings, not left as a claim

### 7.2 Decision D-TST-2: no new default-deps unit test for `doctorCommand`

Considered a unit test invoking `doctorCommand()` with `deps` omitted to cover the `deps.runDoctor ?? runDoctor` fallback. Rejected: with deps omitted the real `runDoctor` runs — reading cwd config, git, and environment — which is not unit-isolated (and a no-config temp dir test would assert `runDoctor`'s own behavior, duplicating the integration tier). The fallback's equivalence argument is structural (an additive `??` whose right side is the identical static import the function called before the change) plus the unmodified integration suite green (TC-SEAM-003) and typecheck on every production call site. Note the repair side needs no such decision: its tests 1–4 already drive the default-deps path through `runCli` (TC-SEAM-002).

### 7.3 Implementation mapping

| TC ID | Mechanism / File | Implementation Status | Notes |
|-------|------------------|----------------------|-------|
| TC-ORDER-001 | Pinned invocation (§5.2) | Manual Only | Phase 6 + phase 9; negative control on `main` optional |
| TC-ORDER-002 | `bun test tests/unit/ tests/integration/ tests/golden/` + `bun run check` | Existing – No Change | Suite executes; nothing authored |
| TC-ORDER-003 | CI `Lint + Typecheck + Test` job | Existing – No Change | Observed on the PR (NG-4: workflow untouched) |
| TC-SEAM-001 | `tests/unit/cli/commands/doctor.test.ts` | Existing – Update (rewrite wiring only) | Handoff patch = re-validation input (DEC-3); IDs/assertions preserved |
| TC-SEAM-002 | `tests/unit/cli/commands/repair-command.test.ts` | Existing – Update (rewrite wiring only) | Tests 1–4 untouched; 5–6 seam-injected |
| TC-SEAM-003 | `tests/integration/cli/commands/doctor.test.ts` | Existing – No Change | The pollution victims; must stay green unmodified |
| TC-SEAM-004 | `tests/unit/app/repair.test.ts`, `tests/integration/app/repair.test.ts` | Existing – No Change | Real `runRepair` importers |
| TC-GUARD-001 | NEW `tests/unit/meta/no-mock-module.test.ts` | To Implement | Tree walk + call-syntax count; auto-included in every suite run |
| TC-GUARD-002 | Same file (exported scanner helper + fixture self-tests) | To Implement | Proves the guard fails on reintroduction |
| TC-DOCS-001 | `.ai/rules/testing-strategy.md` diff review | Manual Only | Ban + alternatives; extends the over-mocking guardrail |
| TC-REG-001 | Existing golden/adversarial/mermaid/BDD/e2e-mock suites | Existing – No Change | Regression signal only |

### Execution commands

```bash
# TC-ORDER-001 — the pinned order-explicit invocation (the failing CI order):
bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/

# TC-ORDER-002 — standard fast loop + full local gate:
bun test tests/unit/ tests/integration/ tests/golden/
bun run check

# TC-SEAM-001/002 — the two rewritten unit files:
bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts

# TC-SEAM-003/004 — unmodified-file assertion + runs:
git diff main --stat          # assert: no tests/integration/** or tests/unit/app/repair.test.ts entries
bun test tests/integration/cli/commands/doctor.test.ts
bun test tests/unit/app/repair.test.ts tests/integration/app/repair.test.ts

# TC-GUARD-001/002 — the new guard:
bun test tests/unit/meta/no-mock-module.test.ts

# TC-ORDER-003 / TC-REG-001 — observe on the PR: Lint + Typecheck + Test, e2e-mock, test:bdd checks
```

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | Guard false-positive: legitimate future prose in `tests/` contains the contiguous call syntax `mock.module(` | M | L | Call-syntax pattern (prose uses the bare name, per the rewrite's own comments); if a comment ever needs the literal, split it (`mock.` + `module(`) as the guard itself does |
| R-TST-2 | Guard false-negative: evasive forms (`mock.module (`, `mock["module"](`, dynamically built names) | L | L | Accepted residual — Biome formatting forbids the spaced form, review catches the exotic ones; the ban rule (AC-F4-2) is the human/agent-layer backstop |
| R-TST-3 | Ordered-run verification (TC-ORDER-001) is a one-shot manual invocation, not a permanent CI order permutation — a future order dependency could slip through | M | L | Accepted per spec §7.3 (permutation deferred); the guard blocks the one known mechanism (`mock.module`); the fast loop still runs every push |
| R-TST-4 | Rewrite silently drops or weakens an assertion (spec RSK-2) | M | L | TC-SEAM-001/002 pin the like-for-like diff review; CI coverage table compared pre/post for the affected branches |
| R-TST-5 | Handoff patch drift: patch header comment cites "PR #105" flakes while the ticket's evidence is PR #102, and the patch predates current `main` | L | M | DEC-3 applies — re-validate, don't blind-apply; coder corrects the comment reference during rewrite; spec ACs, not the patch, are authoritative |

### 8.2 Assumptions

- A-1: Explicit positional file arguments fix bun test's execution order in a single process on any environment — the ordered invocation reproduces the CI failure pre-fix and proves the fix post-fix (negative control available on `main`)
- A-2: "TC-DOCTOR-013..022" (ticket/spec shorthand) maps to exactly the nine tests enumerated in TC-SEAM-003 — verified by reading `tests/integration/cli/commands/doctor.test.ts` (no TC-DOCTOR-021 exists; 022 exists only as 022.1)
- A-3: The e2e-mock suite contains no doctor/repair scenarios (directory listing verified 2026-08-15) — its green run is a general regression signal, not seam-specific proof
- A-4: `doctorCommand`'s deps-omitted fallback has no direct automated caller pre- or post-change (integration tests import `runDoctor` directly; unit tests inject). Default-path equivalence rests on the additive `??` fallback + unmodified integration tier — a dedicated test was considered and rejected (D-TST-2, §7.2)
- A-5: The existing suite is green on `main` in isolation-order runs (local order); post-change, both orders are green (TC-ORDER-001/002), which is the property being proven, not assumed
- A-6: The guard's `tests/unit/meta/` directory is new; if review prefers avoiding a new directory, `tests/unit/shared/` is an acceptable equivalent home (functionally irrelevant — picked up by the same glob)

### 8.3 Open Questions

None blocking. The two test-design decisions the spec delegated are resolved here: guard mechanism and pattern (D-TST-1, §7.1) and no default-deps unit test (D-TST-2, §7.2). Guard file location is pinned to `tests/unit/meta/no-mock-module.test.ts` with the `tests/unit/shared/` alternative noted (A-6) — implementer's choice, no coverage impact.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | test-plan-writer (GH-103) | Initial test plan — 11 scenarios (2 new automated: TC-GUARD-001/002; 2 rewritten unit files verified like-for-like; 7 regression/verification); all 7 ACs covered; guard mechanism + pattern pinned (D-TST-1), default-deps test rejected (D-TST-2); no BDD/golden/e2e tier changes, with rationale |

## 10. Test Execution Log

Populated during delivery phases 6–10 by `@coder`, `@runner`, and `@pm` (dod_check).

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-ORDER-001 | 2026-08-15 | PASS | Ordered invocation `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/` — 267 tests, 0 failures. TC-DOCTOR-013..020 and 022.1 green after unit files in same process. |
| TC-ORDER-002 | 2026-08-15 | PASS | Standard fast loop `bun test tests/unit/ tests/integration/ tests/golden/` — 1299 tests, 0 failures. `bun run check` green (lint, format:check, typecheck, full test suite, boundaries). |
| TC-ORDER-003 | — | Pending PR creation (phase 11) — assert the job green before merge (DoD) |
| TC-SEAM-001 | 2026-08-15 | PASS | Doctor unit rewrite like-for-like verified. Same TC-DOCTOR-011.1–.5 IDs/scenarios/assertions preserved. Stub wiring changed only. Diff review: only mock.module→seam injection changes. |
| TC-SEAM-002 | 2026-08-15 | PASS | Repair unit rewrite like-for-like verified. Tests 1–4 byte-identical (default-deps path via runCli). Tests 5–6 seam-injected only. Opts-wiring assertions preserved. Diff review: no regression. |
| TC-SEAM-003 | 2026-08-15 | PASS | Doctor integration tests unmodified (git diff main confirms). All nine tests (TC-DOCTOR-013..020, 022.1) green in ordered run and full suite. Real runDoctor path proven. |
| TC-SEAM-004 | 2026-08-15 | PASS | Repair tests unmodified (git diff main confirms). TC-REPAIR-001..005 (unit app) and TC-REPAIR-006..013 (integration app) green in full suite. |
| TC-GUARD-001 | 2026-08-15 | PASS | Guard scan reported 0 occurrences under tests/. `rg "mock\.module\(" tests/` returns nothing (exit 1). |
| TC-GUARD-002 | 2026-08-15 | PASS | Matcher self-tests passed: reintroduced call-site fixture detected (≥1 hits), prose-only fixture ignored (0 hits), clean/empty fixture (0 hits). |
| TC-DOCS-001 | 2026-08-15 | PASS | Rules diff reviewed: mock.module ban added to AI-agent over-mocking guardrail + Anti-patterns section. Names DI seams and Bun.spawn as alternatives. last_updated bumped to 2026-08-15. |
| TC-REG-001 | 2026-08-15 | PASS | Golden/adversarial/mermaid/BDD/e2e-mock green in full suite (1299 tests). git diff main --stat confirms zero changes to these tiers. |
