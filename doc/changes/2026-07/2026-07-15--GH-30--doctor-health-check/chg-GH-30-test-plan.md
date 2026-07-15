---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-30-test-plan
status: Proposed
created: 2026-07-15
last_updated: 2026-07-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, doctor, diagnostics, observability, health-check]
version_impact: minor
summary: "Doctor health-check: replaces the doctor stub with a real implementation that runs the MS-0002-minimal checklist (Git, config, credentials, connectivity, target topology, permissions, renderer), produces an AI-readable DoctorReport with per-check pass/fail/warn + suggested fixes, and never leaks the token (INV-SEC-1)."
links:
  change_spec: ./chg-GH-30-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E5-S2] Doctor health-check

## 1. Scope and Objectives

This test plan validates the `marksync doctor` command that replaces the current stub with a real pre-flight health check. The command runs a bounded sequence of checks (Git availability, config validity, credential resolution + validation, base-URL/space reachability, parent-page existence/writability, permission/visibility advisory, renderer availability, and opt-in capability probes) and produces a structured `DoctorReport` with per-check status + suggested fixes. The command is read-only by default; capability probes write a self-cleaning scratch page only when `--probe-capabilities` is set. All tests must preserve INV-SEC-1 (no secrets in any output) and assert the non-zero exit code on any `fail` via the dedicated `EXIT_HEALTH = 60` code (TDR-0009).

### 1.1 In Scope

- Doctor command implementation (app-tier orchestration + thin CLI handler)
- All MS-0002-minimal checks: `git-available`, `config-valid`, `credentials`, `space-access`, `parent-page`, `permission-visibility` (warn-only), `renderer` (warn-only)
- Opt-in capability probes: `content-property` and `attachment` via `--probe-capabilities` (self-cleaning scratch page)
- `DoctorReport` assembly with stable check ids, per-check status/pass/fail/warn/skipped, AI-readable detail, and optional fix
- Exit-code resolution: `EXIT_OK` (0) on no `fail`; `EXIT_HEALTH` (60) on any `fail` via `DOCTOR_FAIL` code (TDR-0009)
- `--probe-capabilities` flag registration and behavior
- INV-SEC-1 preservation: token-shaped substring redaction in report output
- JSON envelope validity: `CommandResult<DoctorReport>` parseable via `--json`

### 1.2 Out of Scope & Known Gaps

- **Full MS-0003 doctor** (proxy/CA hints, deeper capability discovery, setup-failure taxonomy, guided/auto remediation) — out of scope for this story
- **Auto-remediation** — doctor diagnoses and suggests only; never mutates config, credentials, or Confluence state (except the opt-in self-cleaning scratch-page probe)
- **Mandatory pre-sync gate** — `sync` does not require `doctor` to pass first in MS-0002 (DEC-5)
- **New domain primitives or dependencies** — all primitives are reused unchanged
- **Live-sandbox E2E tests** — only Unit + Integration tiers per story test matrix
- **Golden fixture, Mermaid-DOM, BDD, E2E-mock, E2E-live** tiers — not applicable (doctor is new orchestration, not a renderer or lifecycle invariant)

## 2. References

- Change Specification: `./chg-GH-30-spec.md`
- Story File: `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md` (§Test matrix)
- Testing Strategy: `.ai/rules/testing-strategy.md`
- TDR-0009: `doc/decisions/TDR-0009-doctor-health-check-exit-code.md` (EXIT_HEALTH = 60, DOCTOR_FAIL)
- Existing primitives (reused): `loadConfig` (E2-S2); `resolveCredentials` + `validateCredentials` (E2-S4); `createRepository` / `createTarget` + `TargetSystem` read/probe methods (E3-S4); `CommandResult<T>` + exit-code map (E2-S3 / GH-16)
- ADR-0011: `doc/decisions/ADR-0011-cli-output-strategy.md` (output envelope)
- Code Style: `AGENTS.md` (self-documenting code, no JSDoc restatements, import aliases `#app/*`, `#domain/*`, `#cli/*`)
- Cross-cutting invariants: INV-SEC-1 (no secrets in any output — release-blocking), NFR-SEC-1

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Healthy pre-flight (default, read-only) — all gating checks pass, advisory checks pass/warn, exit code 0 | TC-DOCTOR-013 | Covered |
| AC-F1-2 | Git not on `$PATH` (or cwd not inside valid repo) → `git-available` check reports `fail` with detail + fix | TC-DOCTOR-001 | Covered |
| AC-F1-3 | `marksync.yml` missing or invalid → `config-valid` check reports `fail` with AI-readable ConfigError + fix | TC-DOCTOR-002 | Covered |
| AC-F2-1 | Credentials missing/malformed/rejected → `credentials` check reports `fail` with fix, no raw token in output | TC-DOCTOR-003, TC-DOCTOR-016 | Covered |
| AC-F2-2 | Base URL unreachable or `spaceKey` inaccessible → `space-access` check reports `fail` with fix (distinguishes unreachable vs forbidden) | TC-DOCTOR-004, TC-DOCTOR-017 | Covered |
| AC-F3-1 | `parentPageId` missing or not writable → `parent-page` check reports `fail` with fix | TC-DOCTOR-005, TC-DOCTOR-018 | Covered |
| AC-F3-2 | `--probe-capabilities` absent → capability checks `skipped`, zero writes; present → probes run via self-cleaning scratch page, report pass/fail | TC-DOCTOR-006, TC-DOCTOR-019 | Covered |
| AC-F4-1 | Permission/visibility check emits `warn` surfacing "403 → warn+skip, not delete", never `fail`, never gates exit | TC-DOCTOR-007, TC-DOCTOR-020 | Covered |
| AC-F5-1 | Renderer initialization fails → `renderer` check reports `warn` with fix, never gates exit | TC-DOCTOR-008, TC-DOCTOR-021 | Covered |
| AC-F6-1 | Each check in `DoctorReport` carries stable id, status, detail, and optional fix on fail/warn | TC-DOCTOR-009 | Covered |
| AC-F7-1 | Any gating check `fail` → exit code `DOCTOR_FAIL` (EXIT_HEALTH, 60), data=DoctorReport, error unset; zero fails → exit 0 | TC-DOCTOR-010, TC-DOCTOR-011, TC-DOCTOR-012, TC-DOCTOR-022 | Covered |
| AC-SEC-1 | Token-shaped substrings in error bodies/URLs are redacted; serialized JSON output contains 0 secrets (INV-SEC-1 / NFR-SEC-1) | TC-DOCTOR-015, TC-DOCTOR-016 | Covered |
| AC-JSON-1 | `--json` emits valid, parseable `CommandResult<DoctorReport>` envelope (schemaVersion, runId, exitCode, data) | TC-DOCTOR-014 | Covered |
| AC-CI-1 | `bun run check` green (unit + integration tests pass) | All TCs | Covered |

### 3.2 Interface Coverage (DM-#)

| Interface ID | Description | TC ID(s) |
|--------------|-------------|----------|
| DM-1 | `DoctorReport` schema (checks array, summary counts, worstStatus, probeCapabilities flag) | TC-DOCTOR-009, TC-DOCTOR-013, TC-DOCTOR-022 |
| DM-2 | `DoctorCheck` stable ids (git-available, config-valid, credentials, space-access, parent-page, content-property, attachment, permission-visibility, renderer) | TC-DOCTOR-001 through TC-DOCTOR-009 |
| DM-3 | `--probe-capabilities` flag (default false; enables self-cleaning scratch-page probes) | TC-DOCTOR-006, TC-DOCTOR-019 |
| DM-4 | `DOCTOR_FAIL` exit code mapping → `EXIT_HEALTH` (60) via `CODE_TO_EXIT` | TC-DOCTOR-010, TC-DOCTOR-012, TDR-0009 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Description | TC ID(s) |
|--------|-------------|----------|
| NFR-OBS-4 | `doctor` verifies auth, base URL, space access, parent page, config validity, Git availability (full MS-0002 minimal set) | TC-DOCTOR-001 through TC-DOCTOR-005, TC-DOCTOR-013 |
| NFR-COMP-4 | Git CLI prerequisite → doctor reports `fail` when Git absent | TC-DOCTOR-001 |
| NFR-SEC-1 / INV-SEC-1 | No secrets in output: 0 tokens/secrets in any doctor output (redaction asserted) | TC-DOCTOR-015, TC-DOCTOR-016 |
| NFR-OBS-1 | Stable exit codes: 0 on no-fail, 60 on any-fail via DOCTOR_FAIL | TC-DOCTOR-010, TC-DOCTOR-012 |
| NFR-OBS-2 | Structured output: `--json` emits parseable `CommandResult<DoctorReport>` envelope | TC-DOCTOR-014 |
| NFR-A11Y-1 | No color dependency: human output readable without color; JSON has no color | TC-DOCTOR-013, TC-DOCTOR-022 |

## 4. Test Types and Layers

This story focuses on **Unit** and **Integration** test tiers per the testing strategy and story test matrix (see `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md` §Test matrix). Doctor is a new orchestration surface, not a renderer or a lifecycle invariant, so only Unit and Integration tiers are applicable.

| Test Tier | Framework | Root Directory | Pattern | Purpose |
|-----------|-----------|----------------|---------|---------|
| **Unit** | `bun:test` | `tests/unit/` | `*.test.ts` | Validate domain logic in isolation: each check function's pass/fail/warn/skipped paths with mocked client + injected fetch; report assembly (summary counts, worstStatus derivation); exit-code mapping; redaction of token-shaped substrings; stable check-id set |
| **Integration** | `bun:test` + `Bun.serve()` mock | `tests/integration/` | `*.test.ts` | Validate end-to-end doctor behavior against a stateful in-process Confluence-shaped mock: healthy flow (all checks pass, exit 0); various failure flows (bad token, wrong spaceKey, missing parentPageId, Git missing, invalid config, unreachable base URL); redaction assertion (feed token-shaped substrings into error bodies/URLs and assert 0 occurrences in serialized JSON); `--probe-capabilities` self-cleaning probe (scratch page create + delete) |

**Excluded Tiers:**
- **E2E (live-sandbox)**: Out of scope for this story (story test matrix lists only Unit + Integration)
- **Golden Fixture**: Not applicable — doctor output is not byte-stable snapshot material (check details are dynamic, user-specific)
- **Mermaid-DOM**: Not applicable — no Mermaid rendering in this story
- **Gherkin/BDD**: Not applicable — doctor is not a lifecycle invariant (INV-SAFE-1/2/3 are preserved by construction via existing primitives; INV-SEC-1 is validated via integration redaction assertion)
- **E2E (mock)**: Out of scope for this story — doctor's orchestration is covered by integration tier with `Bun.serve` mock; a full pipeline mock is unnecessary

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-DOCTOR-001 | Unit: Git not on `$PATH` → `git-available` check reports `fail` with detail + fix | Negative | Critical | High | AC-F1-2, F-1, NFR-COMP-4 |
| TC-DOCTOR-002 | Unit: Config missing or invalid → `config-valid` check reports `fail` with AI-readable ConfigError + fix | Negative | Critical | High | AC-F1-3, F-1 |
| TC-DOCTOR-003 | Unit: Credentials missing/malformed → `credentials` check reports `fail` with fix | Negative | Critical | High | AC-F2-1, F-2, NFR-SEC-1 |
| TC-DOCTOR-004 | Unit: Base URL unreachable → `space-access` check reports `fail` (distinguishes unreachable vs forbidden) | Negative | Critical | High | AC-F2-2, F-2 |
| TC-DOCTOR-005 | Unit: `parentPageId` missing → `parent-page` check reports `fail` with fix | Negative | Critical | High | AC-F3-1, F-3 |
| TC-DOCTOR-006 | Unit: `--probe-capabilities` absent → capability checks `skipped`, zero writes | Happy Path | Important | High | AC-F3-2, F-3, F-8 |
| TC-DOCTOR-007 | Unit: Permission/visibility check emits `warn` (never `fail`, never gates exit) | Happy Path | Important | High | AC-F4-1, F-4, R-FEA-10 |
| TC-DOCTOR-008 | Unit: Renderer initialization fails → `renderer` check reports `warn` (never gates exit) | Edge Case | Minor | Medium | AC-F5-1, F-5 |
| TC-DOCTOR-009 | Unit: `DoctorReport` assembly with stable check ids, per-check status, detail, and optional fix | Happy Path | Critical | High | AC-F6-1, F-6, DM-1, DM-2 |
| TC-DOCTOR-010 | Unit: Exit-code mapping — `codeToExitCode("DOCTOR_FAIL") === 60`, `EXIT_HEALTH` constant | Happy Path | Critical | High | AC-F7-1, F-7, NFR-OBS-1, DM-4, TDR-0009 |
| TC-DOCTOR-011 | Unit: Exit-code derivation — `worstStatus` "fail" → exit 60, "no fail" → exit 0 | Happy Path | Critical | High | AC-F7-1, F-7, DEC-4 |
| TC-DOCTOR-012 | Unit: Redaction of token-shaped substrings from report fields | Happy Path | Critical | High | AC-SEC-1, INV-SEC-1, NFR-SEC-1, DEC-6 |
| TC-DOCTOR-013 | Integration: Healthy pre-flight (default, read-only) — all checks pass/warn, exit 0 | Happy Path | Critical | High | AC-F1-1, F-1..F-5, NFR-OBS-4, NFR-OBS-2 |
| TC-DOCTOR-014 | Integration: `--json` emits valid, parseable `CommandResult<DoctorReport>` envelope | Happy Path | Important | High | AC-JSON-1, F-6, NFR-OBS-2 |
| TC-DOCTOR-015 | Integration: Redaction assertion — feed token-shaped substrings into error bodies, assert 0 in output | Happy Path | Critical | High | AC-SEC-1, INV-SEC-1, NFR-SEC-1 |
| TC-DOCTOR-016 | Integration: Bad token → `credentials` check reports `fail`, no token leak in output, exit 60 | Negative | Critical | High | AC-F2-1, F-2, NFR-SEC-1 |
| TC-DOCTOR-017 | Integration: Wrong `spaceKey` / inaccessible space → `space-access` check reports `fail`, exit 60 | Negative | Critical | High | AC-F2-2, F-2 |
| TC-DOCTOR-018 | Integration: Missing `parentPageId` → `parent-page` check reports `fail`, exit 60 | Negative | Critical | High | AC-F3-1, F-3 |
| TC-DOCTOR-019 | Integration: `--probe-capabilities` flag — self-cleaning scratch page (create + delete), capability probes report pass/fail | Happy Path | Critical | High | AC-F3-2, F-3, F-8, DEC-1 |
| TC-DOCTOR-020 | Integration: Permission/visibility check emits `warn`, does not gate exit | Happy Path | Important | High | AC-F4-1, F-4, R-FEA-10 |
| TC-DOCTOR-021 | Integration: Renderer initialization fails → `renderer` check reports `warn`, does not gate exit | Edge Case | Minor | Medium | AC-F5-1, F-5 |
| TC-DOCTOR-022 | Integration: Any gating check `fail` → exit 60, data=DoctorReport, error unset | Negative | Critical | High | AC-F7-1, F-7, DEC-4, TDR-0009 |

### 5.2 Scenario Details

#### TC-DOCTOR-001 - Unit: Git not on `$PATH` → `git-available` check reports `fail` with detail + fix

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-2, F-1, NFR-COMP-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` (doctor orchestration module) → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @prereq

**Preconditions**:
- Doctor app-tier function exists and is imported
- Mock setup simulates Git not on `$PATH` (or cwd not inside a valid repo)

**Steps**:
1. Mock the `Repository` port or Git detection to return "Git not found" (e.g., `git --version` fails)
2. Call the doctor app-tier function with minimal valid config/creds setup
3. Capture the returned `DoctorReport`
4. Assert `report.summary.fail === 1`
5. Assert `report.worstStatus === "fail"`
6. Assert the `git-available` check item has:
   - `check: "git-available"`
   - `status: "fail"`
   - `detail` explaining "Git not on $PATH" (or "not inside a Git repository")
   - `fix` suggesting "install Git" or "run inside a Git repo"

**Expected Outcome**:
- `git-available` check reports `fail` with AI-readable detail and suggested fix
- Summary reflects 1 fail, 0 pass, 0 warn, 0 skipped
- `worstStatus` is `fail`
- No other checks are affected (they may be skipped or pass depending on mocks)

---

#### TC-DOCTOR-002 - Unit: Config missing or invalid → `config-valid` check reports `fail` with AI-readable ConfigError + fix

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-3, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @config

**Preconditions**:
- `loadConfig` function exists and is imported (from E2-S2)
- Test setup simulates missing or invalid `marksync.yml`

**Steps**:
1. **Subtest 1: Missing config**
   a. Mock `loadConfig` to return `Err(ConfigError)` with type `"FileMissing"`
   b. Call doctor app-tier function
   c. Capture the returned `DoctorReport`
   d. Assert `report.summary.fail === 1`
   e. Assert the `config-valid` check item has `status: "fail"`, `detail` explaining "marksync.yml not found", `fix` suggesting "run `marksync init`"

2. **Subtest 2: Invalid config (ajv error)**
   a. Mock `loadConfig` to return `Err(ConfigError)` with type `"InvalidConfig"` and ajv `allErrors` (offending field/instance path)
   b. Call doctor app-tier function
   c. Capture the returned `DoctorReport`
   d. Assert `report.summary.fail === 1`
   e. Assert the `config-valid` check item has `status: "fail"`, `detail` AI-readably surfacing the ajv errors (field path + expected shape), `fix` suggesting "fix marksync.yml" (show offending field)

**Expected Outcome**:
- `config-valid` check reports `fail` with AI-readable ConfigError detail
- Detail includes the offending field/instance path and expected shape (from ajv `allErrors`)
- Suggested fix points to the problem (e.g., "run `marksync init`" for missing; "fix field X" for invalid)
- Summary reflects 1 fail
- `worstStatus` is `fail`

---

#### TC-DOCTOR-003 - Unit: Credentials missing/malformed → `credentials` check reports `fail` with fix

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, NFR-SEC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @auth, @privacy

**Preconditions**:
- `resolveCredentials` and `validateCredentials` functions exist and are imported (from E2-S4)
- Mock setup simulates missing or malformed credentials

**Steps**:
1. **Subtest 1: Missing credentials**
   a. Mock `resolveCredentials` to return `Err(MissingCredentials)` with the missing env-var names (e.g., `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN`)
   b. Call doctor app-tier function
   c. Capture the returned `DoctorReport`
   d. Assert `report.summary.fail === 1`
   e. Assert the `credentials` check item has `status: "fail"`, `detail` explaining "missing environment variables" (names present, no values), `fix` suggesting "set MARKSYNC_USER_EMAIL and MARKSYNC_API_TOKEN"
   f. Assert the detail does NOT contain any raw token (it should contain only env-var names, not values)

2. **Subtest 2: Invalid credentials (Confluence rejects)**
   a. Mock `resolveCredentials` to return `Ok(authHeader, maskedEmail)`
   b. Mock `validateCredentials` (with injected fetch) to return `Err(AuthError)` with type `"InvalidCredentials"`
   c. Call doctor app-tier function
   d. Capture the returned `DoctorReport`
   e. Assert `report.summary.fail === 1`
   f. Assert the `credentials` check item has `status: "fail"`, `detail` explaining "Confluence rejected the credentials", `fix` suggesting "verify MARKSYNC_API_TOKEN and MARKSYNC_CONFLUENCE_BASE_URL"
   g. Assert the detail does NOT contain the raw token (only the masked email is acceptable)

**Expected Outcome**:
- `credentials` check reports `fail` with AI-readable detail (missing vars vs invalid token)
- Detail never contains raw token values (NFR-SEC-1)
- Suggested fix points to the correct remediation
- Summary reflects 1 fail
- `worstStatus` is `fail`

---

#### TC-DOCTOR-004 - Unit: Base URL unreachable → `space-access` check reports `fail` (distinguishes unreachable vs forbidden)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, F-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @network

**Preconditions**:
- `validateCredentials` (auth check) succeeds (valid token)
- `TargetSystem` port mock set up to simulate space read failure

**Steps**:
1. **Subtest 1: Base URL unreachable (network error)**
   a. Mock `validateCredentials` to return `Ok(AccountIdentity)` (auth passes)
   b. Mock the `TargetSystem` port's space read to throw or return an unreachable error (e.g., ENOTFOUND, timeout)
   c. Call doctor app-tier function with valid config/creds
   d. Capture the returned `DoctorReport`
   e. Assert `report.summary.fail === 1`
   f. Assert the `space-access` check item has `status: "fail"`, `detail` explaining "base URL unreachable" (network error), `fix` suggesting "check MARKSYNC_CONFLUENCE_BASE_URL and network connectivity"

2. **Subtest 2: Space inaccessible (403 forbidden)**
   a. Mock `validateCredentials` to return `Ok(AccountIdentity)` (auth passes)
   b. Mock the `TargetSystem` port's space read to return a forbidden error (403)
   c. Call doctor app-tier function with valid config/creds
   d. Capture the returned `DoctorReport`
   e. Assert `report.summary.fail === 1`
   f. Assert the `space-access` check item has `status: "fail"`, `detail` explaining "space not accessible (403 forbidden)", `fix` suggesting "verify spaceKey and permissions"

**Expected Outcome**:
- `space-access` check reports `fail` with detail distinguishing "unreachable" (network) vs "forbidden" (permissions)
- Each case has a relevant fix suggestion
- Summary reflects 1 fail
- `worstStatus` is `fail`

---

#### TC-DOCTOR-005 - Unit: `parentPageId` missing → `parent-page` check reports `fail` with fix

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @topology

**Preconditions**:
- `TargetSystem` port mock set up to simulate missing parent page

**Steps**:
1. **Subtest 1: Parent page missing (404)**
   a. Mock the `TargetSystem` port's `getPage(parentPageId)` to return a not-found error (404)
   b. Call doctor app-tier function with valid config/creds where space access passes
   c. Capture the returned `DoctorReport`
   d. Assert `report.summary.fail === 1`
   e. Assert the `parent-page` check item has `status: "fail"`, `detail` explaining "parent page not found (404)", `fix` suggesting "verify parentPageId in marksync.yml"

2. **Subtest 2: Parent page not writable (403 forbidden)**
   a. Mock the `TargetSystem` port's `getPage(parentPageId)` to return a forbidden error (403)
   b. Call doctor app-tier function with valid config/creds
   c. Capture the returned `DoctorReport`
   d. Assert `report.summary.fail === 1`
   e. Assert the `parent-page` check item has `status: "fail"`, `detail` explaining "parent page not writable (403 forbidden)", `fix` suggesting "check page permissions"

**Expected Outcome**:
- `parent-page` check reports `fail` with detail distinguishing "not found" vs "not writable"
- Each case has a relevant fix suggestion
- Summary reflects 1 fail
- `worstStatus` is `fail`

---

#### TC-DOCTOR-006 - Unit: `--probe-capabilities` absent → capability checks `skipped`, zero writes

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F3-2, F-3, F-8
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @probe

**Preconditions**:
- Doctor app-tier function accepts a `probeCapabilities` flag (default false)
- `TargetSystem` port mock is set up

**Steps**:
1. Call doctor app-tier function with `probeCapabilities: false` (default, no explicit flag)
2. Capture the returned `DoctorReport`
3. Assert the `content-property` check item has `status: "skipped"`
4. Assert the `attachment` check item has `status: "skipped"`
5. Assert `report.summary.skipped === 2`
6. Assert no `TargetSystem` port methods were called for capability probes (no `createPage`, `getProperty`, `putProperty`, `attachmentExists`, `uploadAttachment` calls related to probes)

**Expected Outcome**:
- Capability probes are skipped when `--probe-capabilities` is absent
- Zero writes occur (no scratch page creation, no property writes)
- `summary.skipped` reflects 2 skipped checks
- `probeCapabilities` flag is `false` in the report

---

#### TC-DOCTOR-007 - Unit: Permission/visibility check emits `warn` (never `fail`, never gates exit)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, R-FEA-10
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @permissions

**Preconditions**:
- `TargetSystem` port mock is set up with permission/visibility data

**Steps**:
1. **Subtest 1: Permission advisory emitted**
   a. Mock the `TargetSystem` port's `getRestrictions` to return restrictions (indicating the account cannot read some subtree pages)
   b. Call doctor app-tier function with valid config/creds
   c. Capture the returned `DoctorReport`
   d. Assert the `permission-visibility` check item has `status: "warn"`
   e. Assert the `detail` explains the "403 → warn+skip, not delete" operating assumption
   f. Assert the `detail` enriches with restriction specifics where available
   g. Assert the check item has no `fix` (it's an advisory, not a blocking problem)
   h. Assert `report.summary.warn >= 1`

2. **Subtest 2: Check never produces `fail`**
   a. Even when restrictions are severe, assert the check status is never `"fail"` (only `"warn"` or `"pass"`)
   b. Verify that a `warn` status in this check does NOT affect the exit code (it's an advisory, not a gating check)

**Expected Outcome**:
- `permission-visibility` check emits `warn` surfacing the "403 → warn+skip, not delete" policy
- Check never produces `fail` and never gates the exit code
- Detail is enriched with restriction specifics where the port can detect them
- Check has no `fix` (advisory only)

---

#### TC-DOCTOR-008 - Unit: Renderer initialization fails → `renderer` check reports `warn` (never gates exit)

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: AC-F5-1, F-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @renderer

**Preconditions**:
- Renderer readiness probe exists (MS-0002: configured render path — Kroki reachability under the `render` mermaid policy; informational for `code`/`skip`. No happy-dom/mermaid runtime dep.)

**Steps**:
1. Mock the renderer readiness probe to report a problem (e.g., Kroki endpoint unreachable under `render` policy)
2. Call doctor app-tier function with valid config/creds
3. Capture the returned `DoctorReport`
4. Assert the `renderer` check item has `status: "warn"`
5. Assert the `detail` explains the renderer readiness problem (e.g., Kroki endpoint unreachable)
6. Assert the `fix` suggests "switch mermaid policy to `code`/`skip`, or restore Kroki reachability"
7. Assert the check status is never `"fail"` (it's informational)
8. Verify that a `warn` status in this check does NOT affect the exit code (it's informational, not a gating check)

**Expected Outcome**:
- `renderer` check reports `warn` when renderer initialization fails
- Check never produces `fail` and never gates the exit code
- Detail explains the problem and fix suggests remediation
- The check is informational — it degrades output but does not block environment verification

---

#### TC-DOCTOR-009 - Unit: `DoctorReport` assembly with stable check ids, per-check status, detail, and optional fix

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F6-1, F-6, DM-1, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @diagnostics, @report

**Preconditions**:
- Doctor app-tier function returns a `DoctorReport`

**Steps**:
1. Call doctor app-tier function with a mix of pass/fail/warn/skipped results (mock the dependencies appropriately)
2. Capture the returned `DoctorReport`
3. Assert the report structure matches DM-1:
   - `checks`: array of `DoctorCheck` objects
   - `summary`: object with counts (`pass`, `warn`, `fail`, `skipped`, `total`)
   - `worstStatus`: one of `"pass"`, `"warn"`, `"fail"` (derived from checks)
   - `probeCapabilities`: boolean (matches the flag)
4. For each check item, assert it matches DM-2:
   - `check`: stable id (one of the 9 check ids from Appendix A: `git-available`, `config-valid`, `credentials`, `space-access`, `parent-page`, `content-property`, `attachment`, `permission-visibility`, `renderer`)
   - `status`: one of `"pass"`, `"warn"`, `"fail"`, `"skipped"`
   - `detail`: non-empty string (AI-readable explanation)
   - `fix`: optional string (present only when `status` is `"fail"` or `"warn"`)
5. Assert the `summary` counts match the actual checks (e.g., if 3 checks have `status: "fail"`, then `summary.fail === 3`)
6. Assert `summary.total` equals `checks.length`
7. Assert `worstStatus` is correctly derived:
   - If any check has `status: "fail"`, then `worstStatus === "fail"`
   - Else if any check has `status: "warn"`, then `worstStatus === "warn"`
   - Else `worstStatus === "pass"`
8. Assert the report is JSON-serializable (no circular references)

**Expected Outcome**:
- `DoctorReport` structure matches the expected schema (DM-1, DM-2)
- All checks have stable ids, valid statuses, AI-readable details, and optional fixes
- Summary counts are accurate and derived correctly
- `worstStatus` is derived correctly from the checks
- Report is valid JSON for CI/agent consumption

---

#### TC-DOCTOR-010 - Unit: Exit-code mapping — `codeToExitCode("DOCTOR_FAIL") === 60`, `EXIT_HEALTH` constant

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F7-1, F-7, NFR-OBS-1, DM-4, TDR-0009
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/output/exit-codes.ts` → `tests/unit/cli/output/exit-codes.test.ts`
**Tags**: @backend, @cli, @exit-codes

**Preconditions**:
- Exit-code map is extended with `DOCTOR_FAIL` → `EXIT_HEALTH`
- `EXIT_HEALTH` constant is defined

**Steps**:
1. Import `codeToExitCode` from `#cli/output/exit-codes`
2. Import `EXIT_HEALTH` from `#cli/output/exit-codes`
3. Assert `codeToExitCode("DOCTOR_FAIL") === 60`
4. Assert `EXIT_HEALTH === 60`
5. Assert `CODE_TO_EXIT.DOCTOR_FAIL === EXIT_HEALTH` (if the map is exported)
6. Verify the constant name and numeric match TDR-0009 decision (Alternative 1: `EXIT_HEALTH = 60` with code `DOCTOR_FAIL`)

**Expected Outcome**:
- `EXIT_HEALTH` constant is defined and equals 60
- `codeToExitCode("DOCTOR_FAIL")` returns 60
- The mapping is correctly registered in `CODE_TO_EXIT`
- Exit-code contract is satisfied per TDR-0009 and AC-F7-1

---

#### TC-DOCTOR-011 - Unit: Exit-code derivation — `worstStatus` "fail" → exit 60, "no fail" → exit 0

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F7-1, F-7, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` (CLI handler) → `tests/unit/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli, @exit-codes

**Preconditions**:
- Doctor CLI handler exists and constructs `CommandResult<DoctorReport>` directly (not via `ok()`/`err()`)

**Steps**:
1. **Subtest 1: All checks pass/warn/skipped → exit 0**
   a. Mock doctor app-tier function to return a `DoctorReport` with `worstStatus: "pass"` (all checks pass or a mix of pass and skipped)
   b. Call the doctor CLI handler
   c. Capture the returned `CommandResult<DoctorReport>`
   d. Assert `result.exitCode === 0`
   e. Assert `result.data` is present (the `DoctorReport`)
   f. Assert `result.error` is unset

2. **Subtest 2: Any check warns (no fails) → exit 0**
   a. Mock doctor app-tier function to return a `DoctorReport` with `worstStatus: "warn"` (at least one check warns, none fail)
   b. Call the doctor CLI handler
   c. Capture the returned `CommandResult<DoctorReport>`
   d. Assert `result.exitCode === 0`
   e. Assert `result.data` is present (the `DoctorReport`)
   f. Assert `result.error` is unset (warn does not gate)

3. **Subtest 3: Any check fails → exit 60**
   a. Mock doctor app-tier function to return a `DoctorReport` with `worstStatus: "fail"`
   b. Call the doctor CLI handler
   c. Capture the returned `CommandResult<DoctorReport>`
   d. Assert `result.exitCode === 60` (EXIT_HEALTH)
   e. Assert `result.data` is present (the `DoctorReport`)
   f. Assert `result.error` is unset (the non-zero exit is a signal, not a command-level error)

4. **Subtest 4: Verify `result.exitCode` is derived via `codeToExitCode("DOCTOR_FAIL")`**
   a. Verify that the CLI handler calls `codeToExitCode("DOCTOR_FAIL")` to derive the exit code (not hardcoded)
   b. Ensure the derivation is consistent with DEC-4 and Appendix B of the spec

**Expected Outcome**:
- Exit code is 0 when `worstStatus` is `"pass"` (all checks pass, or pass + skipped)
- Exit code is 0 when `worstStatus` is `"warn"` (at least one check warns, none fail)
- Exit code is 60 (EXIT_HEALTH) when `worstStatus` is `"fail"` (any check fails)
- `data=DoctorReport` is always present on all paths
- `error` is never set (doctor succeeds at producing a report on all paths)
- Exit code is derived via `codeToExitCode("DOCTOR_FAIL")`, not hardcoded

---

#### TC-DOCTOR-012 - Unit: Redaction of token-shaped substrings from report fields

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-SEC-1, INV-SEC-1, NFR-SEC-1, DEC-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `src/app/doctor.ts` → `tests/unit/app/doctor.test.ts`
**Tags**: @backend, @privacy, @security, @redaction

**Preconditions**:
- Centralized redaction layer exists (from E2-S3)
- Doctor report passes through redaction before serialization

**Steps**:
1. Construct a `DoctorReport` with a check `detail` field containing token-shaped substrings:
   - Example: `detail: "Error: token ABC123XYZ not accepted"` (where `ABC123XYZ` is a token-shaped string)
   - Example: `detail: "Base URL https://user:token@confluence.example.com unreachable"` (where `token` is a token-shaped substring)
2. Serialize the report to JSON string
3. Assert the JSON does NOT contain the token-shaped substrings (redacted)
4. Assert the JSON still contains non-sensitive context (e.g., "Error: [REDACTED] not accepted", "Base URL https://user:[REDACTED]@confluence.example.com unreachable")
5. Verify redaction works for common token patterns:
   - Alphanumeric strings 10-40 chars
   - Email addresses (if present as non-secret identifiers)
   - Password-like patterns (key names like "password", "secret", "token" values)

**Expected Outcome**:
- Token-shaped substrings are redacted from the serialized report (INV-SEC-1)
- Redaction preserves non-sensitive context
- No secrets appear in the output
- Redaction is applied via the centralized layer (defense-in-depth per DEC-6)

---

#### TC-DOCTOR-013 - Integration: Healthy pre-flight (default, read-only) — all checks pass/warn, exit 0

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, F-1..F-5, NFR-OBS-4, NFR-OBS-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts` (using `Bun.serve()` mock)
**Tags**: @backend, @integration, @mocked-api, @happy-path

**Preconditions**:
- `Bun.serve()` mock Confluence server is set up with:
  - Valid space (spaceKey)
  - Valid parent page (parentPageId)
  - Auth endpoint accepting valid credentials
- Local environment has Git available (or mocked)
- `marksync.yml` is present and valid (or mocked)

**Steps**:
1. Start a `Bun.serve()` mock server with healthy Confluence endpoints:
   - `GET /wiki/api/v2/user/by-me` → returns account identity (auth passes)
   - `GET /wiki/rest/api/content/{id}` → returns parent page (exists, readable)
   - `GET /wiki/rest/api/space` → returns space info (space accessible)
2. Set environment variables for valid credentials (MARKSYNC_USER_EMAIL, MARKSYNC_API_TOKEN, MARKSYNC_CONFLUENCE_BASE_URL)
3. Create a temporary directory with a valid `marksync.yml` (or mock config loading)
4. Run `marksync doctor` (default, no `--probe-capabilities` flag)
5. Capture the exit code and output (both JSON via `--json` and human table)
6. Parse the JSON output as `CommandResult<DoctorReport>`
7. Assert exit code is 0
8. Assert `result.data` is present (the `DoctorReport`)
9. Assert `result.error` is unset
10. For each gating check, assert status is `"pass"`:
    - `git-available`: `"pass"` (Git available)
    - `config-valid`: `"pass"` (config present and valid)
    - `credentials`: `"pass"` (auth accepted)
    - `space-access`: `"pass"` (space reachable)
    - `parent-page`: `"pass"` (parent page exists and writable)
11. Assert capability probes are `"skipped"` (no `--probe-capabilities` flag):
    - `content-property`: `"skipped"`
    - `attachment`: `"skipped"`
12. Assert advisory checks are `"pass"` or `"warn"`:
    - `permission-visibility`: `"pass"` or `"warn"` (never `"fail"`)
    - `renderer`: `"pass"` or `"warn"` (never `"fail"`)
13. Assert no writes occurred (verify mock server logs: 0 POST/PUT requests)
14. Assert `report.summary.pass >= 5` (all gating checks passed)

**Expected Outcome**:
- All gating checks report `pass`
- Advisory checks report `pass` or `warn` (never `fail`)
- Capability probes report `skipped` (read-only default)
- Exit code is 0
- `data=DoctorReport` is present
- `error` is unset
- No writes to Confluence (read-only)
- JSON output is parseable as `CommandResult<DoctorReport>` (AC-JSON-1 covered implicitly; TC-DOCTOR-014 validates explicitly)

---

#### TC-DOCTOR-014 - Integration: `--json` emits valid, parseable `CommandResult<DoctorReport>` envelope

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-JSON-1, F-6, NFR-OBS-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @json, @output

**Preconditions**:
- Doctor command is implemented
- `--json` flag is registered (or `--output json`)

**Steps**:
1. Run `marksync doctor --json` (or `marksync doctor --output json`) with a healthy environment (similar to TC-DOCTOR-013)
2. Capture the stdout output as a string
3. Parse the string as JSON
4. Assert the parsed object matches `CommandResult<DoctorReport>` structure:
   - `schemaVersion`: string (present)
   - `runId`: string (present, UUID format)
   - `exitCode`: number (0 or 60)
   - `data`: object (the `DoctorReport`)
   - `error`: undefined (doctor never sets error)
   - `warnings`: array (optional, may be empty)
   - `timing`: object (optional, may be present)
5. Assert `data` matches `DoctorReport` structure (as validated in TC-DOCTOR-009)
6. Assert the JSON is valid and parseable by any JSON consumer (CI/agent)
7. Verify the envelope shape matches ADR-0011 (structured output contract)

**Expected Outcome**:
- `--json` output is valid JSON
- Parsed object matches `CommandResult<DoctorReport>` envelope
- All required fields are present
- Envelope is usable by CI/agents without human interpretation
- ADR-0011 contract is satisfied

---

#### TC-DOCTOR-015 - Integration: Redaction assertion — feed token-shaped substrings into error bodies, assert 0 in output

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-SEC-1, INV-SEC-1, NFR-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @privacy, @security, @redaction

**Preconditions**:
- `Bun.serve()` mock server can return error responses with token-shaped substrings
- Doctor command outputs JSON via `--json`

**Steps**:
1. Start a `Bun.serve()` mock server that returns error responses containing token-shaped substrings:
   - Auth endpoint: `GET /wiki/api/v2/user/by-me` → 401 with body `{"message": "Invalid token: ABC123XYZ"}`
   - Space endpoint: `GET /wiki/rest/api/space` → 403 with body `{"message": "Forbidden for user:token@confluence.example.com"}`
2. Set environment variables (use an invalid token to trigger the errors)
3. Run `marksync doctor --json`
4. Capture the stdout output as a string
5. Assert the JSON output does NOT contain the token-shaped substrings:
   - `"ABC123XYZ"` should be absent or redacted
   - `"user:token@confluence.example.com"` should be absent or redacted
6. Assert the JSON still contains non-sensitive error context (e.g., `"Invalid token: [REDACTED]"`, `"Forbidden for user:[REDACTED]@confluence.example.com"`)
7. Verify no secrets appear in any field (check all `check.detail`, `check.fix` values)

**Expected Outcome**:
- Token-shaped substrings are absent from the serialized output (INV-SEC-1)
- Redaction preserves error context
- No secrets appear in JSON output
- Redaction is applied end-to-end via the centralized layer

---

#### TC-DOCTOR-016 - Integration: Bad token → `credentials` check reports `fail`, no token leak in output, exit 60

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, NFR-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @auth, @privacy

**Preconditions**:
- `Bun.serve()` mock server with auth endpoint
- Invalid token in environment

**Steps**:
1. Start a `Bun.serve()` mock server:
   - `GET /wiki/api/v2/user/by-me` → 401 with error body (optionally containing the token, for redaction test)
2. Set environment variables with an invalid token (MARKSYNC_API_TOKEN = "invalid-token-ABC123XYZ")
3. Run `marksync doctor --json`
4. Capture exit code and JSON output
5. Parse JSON as `CommandResult<DoctorReport>`
6. Assert exit code is 60
7. Assert `result.data.checks` contains the `credentials` check with:
   - `status: "fail"`
   - `detail` explaining "Invalid credentials" (without raw token)
   - `fix` suggesting "verify MARKSYNC_API_TOKEN and MARKSYNC_CONFLUENCE_BASE_URL"
8. Assert the JSON output does NOT contain the raw token `"invalid-token-ABC123XYZ"` (redaction asserted)
9. Assert `result.error` is unset (doctor succeeded at producing a report)

**Expected Outcome**:
- `credentials` check reports `fail` with AI-readable detail
- Detail does not contain raw token (NFR-SEC-1)
- Exit code is 60
- `data=DoctorReport` is present
- `error` is unset

---

#### TC-DOCTOR-017 - Integration: Wrong `spaceKey` / inaccessible space → `space-access` check reports `fail`, exit 60

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-2, F-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @network

**Preconditions**:
- `Bun.serve()` mock server with space endpoint
- Valid config with wrong `spaceKey`

**Steps**:
1. Start a `Bun.serve()` mock server:
   - `GET /wiki/api/v2/user/by-me` → 200 (auth passes)
   - `GET /wiki/rest/api/space` or space-read endpoint → 404 (space not found) or 403 (forbidden)
2. Set environment variables with valid credentials
3. Create `marksync.yml` with a `spaceKey` that does not exist or is inaccessible
4. Run `marksync doctor --json`
5. Capture exit code and JSON output
6. Parse JSON as `CommandResult<DoctorReport>`
7. Assert exit code is 60
8. Assert `result.data.checks` contains the `space-access` check with:
   - `status: "fail"`
   - `detail` explaining "space not accessible" (distinguishing 404 vs 403)
   - `fix` suggesting "verify spaceKey in marksync.yml and permissions"
9. Assert other checks (git, config, credentials) passed

**Expected Outcome**:
- `space-access` check reports `fail` with detail distinguishing "not found" vs "forbidden"
- Suggested fix points to the correct remediation
- Exit code is 60
- Other checks passed (environment is otherwise healthy)

---

#### TC-DOCTOR-018 - Integration: Missing `parentPageId` → `parent-page` check reports `fail`, exit 60

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @topology

**Preconditions**:
- `Bun.serve()` mock server with page endpoint
- Valid config with missing `parentPageId`

**Steps**:
1. Start a `Bun.serve()` mock server:
   - `GET /wiki/api/v2/user/by-me` → 200 (auth passes)
   - `GET /wiki/rest/api/space` → 200 (space accessible)
   - `GET /wiki/rest/api/content/{parentPageId}` → 404 (page not found) or 403 (forbidden)
2. Set environment variables with valid credentials
3. Create `marksync.yml` with a `parentPageId` that does not exist or is inaccessible
4. Run `marksync doctor --json`
5. Capture exit code and JSON output
6. Parse JSON as `CommandResult<DoctorReport>`
7. Assert exit code is 60
8. Assert `result.data.checks` contains the `parent-page` check with:
   - `status: "fail"`
   - `detail` explaining "parent page not found (404)" or "not writable (403)"
   - `fix` suggesting "verify parentPageId in marksync.yml and page permissions"
9. Assert earlier checks (git, config, credentials, space-access) passed

**Expected Outcome**:
- `parent-page` check reports `fail` with detail distinguishing "not found" vs "not writable"
- Suggested fix points to the correct remediation
- Exit code is 60
- Earlier checks passed (environment is otherwise healthy)

---

#### TC-DOCTOR-019 - Integration: `--probe-capabilities` flag — self-cleaning scratch page (create + delete), capability probes report pass/fail

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-2, F-3, F-8, DEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @probe, @self-cleaning

**Preconditions**:
- `Bun.serve()` mock server with full CRUD endpoints (create, read, update, delete)
- Valid environment with space and parent page

**Steps**:
1. Start a `Bun.serve()` mock server:
   - `GET /wiki/api/v2/user/by-me` → 200 (auth passes)
   - `GET /wiki/rest/api/space` → 200 (space accessible)
   - `GET /wiki/rest/api/content/{parentPageId}` → 200 (parent page exists)
   - `POST /wiki/rest/api/content` → 201 (scratch page created) with page ID
   - `PUT /wiki/rest/api/content/{id}/property` → 200 (property written)
   - `GET /wiki/rest/api/content/{id}/attachment` → 200 (attachment endpoint responds)
   - `DELETE /wiki/rest/api/content/{id}` → 204 (scratch page deleted)
2. Set environment variables with valid credentials
3. Create `marksync.yml` with valid spaceKey and parentPageId
4. Run `marksync doctor --json --probe-capabilities`
5. Capture exit code and JSON output
6. Parse JSON as `CommandResult<DoctorReport>`
7. Assert exit code is 0 (all checks pass)
8. Assert `result.data.probeCapabilities === true`
9. Assert `result.data.checks` contains:
   - `content-property` check with `status: "pass"` (property API responded)
   - `attachment` check with `status: "pass"` (attachment endpoint responded)
10. Verify the mock server received:
    - 1 `POST /wiki/rest/api/content` (scratch page creation)
    - 1 `PUT /wiki/rest/api/content/{id}/property` (property write)
    - 1 `GET /wiki/rest/api/content/{id}/attachment` (attachment check)
    - 1 `DELETE /wiki/rest/api/content/{id}` (scratch page deletion)
11. Assert the final state has 0 scratch pages left (self-cleaning confirmed)
12. Verify the scratch page was created under the parent subtree

**Expected Outcome**:
- Capability probes run when `--probe-capabilities` is set
- Scratch page is created, probed, and deleted (self-cleaning)
- Capability probes report `pass` if APIs respond
- Zero scratch pages remain after doctor completes
- `probeCapabilities` flag is `true` in the report

---

#### TC-DOCTOR-020 - Integration: Permission/visibility check emits `warn`, does not gate exit

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F4-1, F-4, R-FEA-10
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @permissions

**Preconditions**:
- `Bun.serve()` mock server with restrictions endpoint
- Valid environment

**Steps**:
1. Start a `Bun.serve()` mock server:
   - All endpoints return 200 (auth, space, parent page pass)
   - `GET /wiki/rest/api/content/{id}/restriction` → returns restrictions (indicating some pages in subtree are restricted)
2. Set environment variables with valid credentials
3. Create `marksync.yml` with valid spaceKey and parentPageId
4. Run `marksync doctor --json`
5. Capture exit code and JSON output
6. Parse JSON as `CommandResult<DoctorReport>`
7. Assert exit code is 0 (no gating checks failed)
8. Assert `result.data.checks` contains the `permission-visibility` check with:
   - `status: "warn"`
   - `detail` explaining "assuming full read access; 403 will be treated as warn+skip, not delete"
   - Detail enriched with restriction specifics where available
   - No `fix` field (advisory only)
9. Verify that the `warn` status in this check does NOT affect the exit code (still 0)

**Expected Outcome**:
- `permission-visibility` check emits `warn` surfacing the 403→warn+skip policy
- Check never produces `fail` and never gates the exit code
- Detail is enriched with restriction specifics where the port can detect them
- Exit code is 0 (no gating checks failed)

---

#### TC-DOCTOR-021 - Integration: Renderer initialization fails → `renderer` check reports `warn`, does not gate exit

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: AC-F5-1, F-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @renderer

**Preconditions**:
- Mock setup to simulate renderer initialization failure
- Valid environment

**Steps**:
1. Mock the renderer readiness probe to report a problem (e.g., make the Kroki endpoint unreachable under `render` policy, or mock the renderer probe to fail)
2. Run `marksync doctor --json` (skip `Bun.serve()` setup if renderer probe is CLI-only)
3. Capture exit code and JSON output
4. Parse JSON as `CommandResult<DoctorReport>`
5. Assert exit code is 0 (renderer is informational, not gating)
6. Assert `result.data.checks` contains the `renderer` check with:
   - `status: "warn"`
   - `detail` explaining the renderer readiness problem (e.g., Kroki endpoint unreachable)
   - `fix` suggesting "switch mermaid policy to `code`/`skip`, or restore Kroki reachability"
7. Verify that the `warn` status in this check does NOT affect the exit code (still 0)

**Expected Outcome**:
- `renderer` check reports `warn` when renderer initialization fails
- Check never produces `fail` and never gates the exit code
- Detail explains the problem and fix suggests remediation
- Exit code is 0 (informational, not gating)

---

#### TC-DOCTOR-022 - Integration: Any gating check `fail` → exit 60, data=DoctorReport, error unset

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F7-1, F-7, DEC-4, TDR-0009
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `src/cli/commands/doctor.ts` → `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @integration, @mocked-api, @exit-codes

**Preconditions**:
- `Bun.serve()` mock server with failure endpoint

**Steps**:
1. Run multiple subtests, each simulating a different gating check failure (similar to TC-DOCTOR-016, TC-DOCTOR-017, TC-DOCTOR-018):
   - Git not on PATH (mock)
   - Config invalid (mock)
   - Bad token (401 auth)
   - Wrong spaceKey (403/404 space)
   - Missing parentPageId (403/404 parent)
2. For each subtest:
   a. Set up the failure scenario
   b. Run `marksync doctor --json`
   c. Capture exit code and JSON output
   d. Parse JSON as `CommandResult<DoctorReport>`
   e. Assert exit code is 60 (EXIT_HEALTH)
   f. Assert `result.data` is present (the `DoctorReport`)
   g. Assert `result.error` is unset (doctor succeeded at producing a report)
   h. Assert `result.data.worstStatus === "fail"`
3. Verify that regardless of which gating check failed, the exit code is always 60

**Expected Outcome**:
- Any gating check failure produces exit code 60
- `data=DoctorReport` is always present
- `error` is never unset
- Exit code is consistently 60 across all gating check failures
- Behavior matches DEC-4 and TDR-0009

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local development**: Primary environment for unit and integration tests
- **Mock Confluence server**: Integration tests use `Bun.serve()` mock to simulate Confluence API behavior (auth, space read, parent page read, capability probe endpoints, error responses with token-shaped substrings)
- **No live Confluence tenant required**: E2E tests are out of scope for this story

### 6.2 Test Data Generation and Cleanup

- **Unit tests**: Use in-memory fixtures for `DoctorReport`, `DoctorCheck`, mock `TargetSystem` port, mock fetch
- **Integration tests**: Use `Bun.serve()` mock server with ephemeral state per test; create scratch pages and verify cleanup for `--probe-capabilities` tests
- **Temporary directories**: Use `tmpdir()` + `mkdtempSync()` for cache directories; clean up with `rmSync()` in `afterEach`
- **Fixture config**: Create temporary `marksync.yml` files with valid/invalid configurations; clean up after each test
- **Token-shaped substrings**: Use realistic patterns for redaction tests (alphanumeric strings, user:token@ URLs)

### 6.3 Isolation Strategy

- **Unit tests**: No external dependencies; all inputs constructed in test; mock the `TargetSystem` port and fetch
- **Integration tests**: `Bun.serve()` mock server provides isolated HTTP state per test; each test starts the server, runs doctor, asserts output, and stops the server
- **No shared state**: Each test is independent; no tests depend on previous test state
- **Scratch page cleanup**: `--probe-capabilities` tests verify self-cleaning (scratch page deleted in finally block); assert 0 remaining pages

## 7. Automation Plan and Implementation Mapping

### 7.1 Unit Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-DOCTOR-001 | `tests/unit/app/doctor.test.ts` | New | Mock `Repository` port or Git detection | To Implement |
| TC-DOCTOR-002 | `tests/unit/app/doctor.test.ts` | New | Mock `loadConfig` (return Err with FileMissing or InvalidConfig) | To Implement |
| TC-DOCTOR-003 | `tests/unit/app/doctor.test.ts` | New | Mock `resolveCredentials` (return Err MissingCredentials), mock `validateCredentials` (return Err AuthError) | To Implement |
| TC-DOCTOR-004 | `tests/unit/app/doctor.test.ts` | New | Mock `validateCredentials` (Ok), mock `TargetSystem` port (space read error) | To Implement |
| TC-DOCTOR-005 | `tests/unit/app/doctor.test.ts` | New | Mock `TargetSystem` port (getPage returns 404 or 403) | To Implement |
| TC-DOCTOR-006 | `tests/unit/app/doctor.test.ts` | New | Mock `TargetSystem` port; verify no probe methods called | To Implement |
| TC-DOCTOR-007 | `tests/unit/app/doctor.test.ts` | New | Mock `TargetSystem` port (getRestrictions returns restrictions) | To Implement |
| TC-DOCTOR-008 | `tests/unit/app/doctor.test.ts` | New | Mock renderer initialization (fail) | To Implement |
| TC-DOCTOR-009 | `tests/unit/app/doctor.test.ts` | New | Mix of mocked check results (pass/fail/warn/skipped) | To Implement |
| TC-DOCTOR-010 | `tests/unit/cli/output/exit-codes.test.ts` | Extend (existing — strict whole-contract pin) | None (constant and mapping verification) | To Implement |
| TC-DOCTOR-011 | `tests/unit/cli/commands/doctor.test.ts` | New | Mock doctor app-tier function (return DoctorReport with worstStatus) | To Implement |
| TC-DOCTOR-012 | `tests/unit/app/doctor.test.ts` | New | Construct DoctorReport with token-shaped substrings; assert redaction | To Implement |

**Execution Command:**
```bash
bun test tests/unit/app/doctor.test.ts tests/unit/cli/output/exit-codes.test.ts tests/unit/cli/commands/doctor.test.ts
```

### 7.2 Integration Test Implementation

| TC ID | Test File | New/Update | Mocking Requirements | Status |
|-------|-----------|------------|---------------------|--------|
| TC-DOCTOR-013 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with healthy endpoints | To Implement |
| TC-DOCTOR-014 | `tests/integration/cli/commands/doctor.test.ts` | New | Same as TC-DOCTOR-013, plus JSON parse assertion | To Implement |
| TC-DOCTOR-015 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with error responses containing token-shaped substrings | To Implement |
| TC-DOCTOR-016 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with 401 auth endpoint; invalid token in env | To Implement |
| TC-DOCTOR-017 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with 403/404 space endpoint | To Implement |
| TC-DOCTOR-018 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with 403/404 page endpoint | To Implement |
| TC-DOCTOR-019 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with full CRUD (create, read, property, attachment, delete) | To Implement |
| TC-DOCTOR-020 | `tests/integration/cli/commands/doctor.test.ts` | New | `Bun.serve()` mock with restrictions endpoint | To Implement |
| TC-DOCTOR-021 | `tests/integration/cli/commands/doctor.test.ts` | New | Mock renderer initialization (fail) | To Implement |
| TC-DOCTOR-022 | `tests/integration/cli/commands/doctor.test.ts` | New | Multiple `Bun.serve()` mock setups (each gating check failure) | To Implement |

**Execution Command:**
```bash
bun test tests/integration/cli/commands/doctor.test.ts
```

**Bun.serve() Mock Pattern (for integration tests):**
```typescript
// Use Bun.serve() to create an in-process Confluence-shaped server
const server = Bun.serve({
  port: 0, // Use ephemeral port
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/wiki/api/v2/user/by-me') {
      return Response.json({ accountId: 'test-account', email: 'test@example.com' });
    }
    // ... more endpoints
  },
});
const baseUrl = `http://localhost:${server.port}`;
process.env.MARKSYNC_CONFLUENCE_BASE_URL = baseUrl;
// ... run doctor, assert output
server.stop();
```

**Import Aliases (per coding rules):**
- Use `#app/*` for app-tier imports (e.g., `#app/doctor`)
- Use `#domain/*` for domain-tier imports (e.g., `#domain/ports/target-system`)
- Use `#cli/*` for CLI-tier imports (e.g., `#cli/output/exit-codes`)
- No relative paths (e.g., `../app/doctor`)

### 7.3 CI Integration

All tests run in the fast loop CI (`.github/workflows/ci.yml`):
```yaml
- run: bun test tests/unit/ tests/integration/
```

### 7.4 Test Coverage Summary

- **Unit tests**: 3 test files covering doctor orchestration (`tests/unit/app/doctor.test.ts`), exit-code mapping (`tests/unit/cli/output/exit-codes.test.ts`), and CLI handler (`tests/unit/cli/commands/doctor.test.ts`)
- **Integration tests**: 1 test file covering end-to-end doctor behavior against `Bun.serve()` mock (`tests/integration/cli/commands/doctor.test.ts`)
- **Total test scenarios**: 22 TCs covering all ACs, F-#, NFRs, INV-SEC-1, and DM-#
- **Tier breakdown**: 12 unit tests (TC-DOCTOR-001 through TC-DOCTOR-012), 10 integration tests (TC-DOCTOR-013 through TC-DOCTOR-022)

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Probability | Mitigation | Residual Risk |
|------|--------|-------------|------------|---------------|
| Token-shaped substring redaction misses a pattern (e.g., base64-encoded token) → secret leak in output | H | L | TC-DOCTOR-012 and TC-DOCTOR-015 explicitly test redaction against realistic token patterns; centralized redaction layer is defense-in-depth | L |
| Capability probe leaves a scratch page behind (side-effect / clutter) | M | L | TC-DOCTOR-019 asserts self-cleaning (scratch page deleted in finally block); verify 0 remaining pages in mock server logs | L |
| Exit-code conflation — CI/agents misread doctor's non-zero exit as a hard domain error | M | L | TDR-0009 chooses a dedicated `EXIT_HEALTH = 60` class; TC-DOCTOR-010, TC-DOCTOR-011, TC-DOCTOR-012, TC-DOCTOR-022 assert `data=DoctorReport` is always present and `error` is never set | L |
| Mocking `TargetSystem` port at the wrong layer (lifecycle-invariant mock) → invalid tests | H | L | Follow testing-strategy.md AI-agent over-mocking guardrail: mocks are allowed for adapter boundaries (`Bun.serve()` mock or port mock), NOT for lifecycle invariants; test real check functions, not mocked checks | L |
| Redaction applied inconsistently (e.g., only in CLI handler, not in app-tier) → secret leak | H | L | TC-DOCTOR-015 asserts redaction end-to-end via JSON output; redaction should be in the centralized layer (E2-S3) and applied before serialization | L |

### 8.2 Assumptions

- `loadConfig` (E2-S2), `resolveCredentials` + `validateCredentials` (E2-S4), `createRepository` / `createTarget` + `TargetSystem` read/probe methods (E3-S4) exist, are correct, and are reused unchanged
- `CommandResult<T>` envelope, the `ok()`/`err()` factories, and the `CODE_TO_EXIT` map are stable; the `doctor` subcommand is already registered
- `resolveCredentials` drops the raw token and returns only an opaque `authHeader` + masked email (INV-SEC-1); doctor never needs the raw token
- The centralized redaction layer (from E2-S3) exists and is used by doctor
- The `default` target (`config.targets.default`) is the convention used by the sibling commands and is the target doctor verifies
- The 9-class exit-code set is documented; TDR-0009 confirmed `EXIT_HEALTH = 60` as an additive extension

### 8.3 Open Questions

None. All open questions were CEO-resolved before this story (OQ-1 resolved by TDR-0009; R1 and Q1 CEO-resolved in story file).

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | Change Test Plan Writer | Initial test plan creation for GH-30 |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-DOCTOR-001 | TBD | TBD | Pending implementation |
| TC-DOCTOR-002 | TBD | TBD | Pending implementation |
| TC-DOCTOR-003 | TBD | TBD | Pending implementation |
| TC-DOCTOR-004 | TBD | TBD | Pending implementation |
| TC-DOCTOR-005 | TBD | TBD | Pending implementation |
| TC-DOCTOR-006 | TBD | TBD | Pending implementation |
| TC-DOCTOR-007 | TBD | TBD | Pending implementation |
| TC-DOCTOR-008 | TBD | TBD | Pending implementation |
| TC-DOCTOR-009 | TBD | TBD | Pending implementation |
| TC-DOCTOR-010 | TBD | TBD | Pending implementation |
| TC-DOCTOR-011 | TBD | TBD | Pending implementation |
| TC-DOCTOR-012 | TBD | TBD | Pending implementation |
| TC-DOCTOR-013 | TBD | TBD | Pending implementation |
| TC-DOCTOR-014 | TBD | TBD | Pending implementation |
| TC-DOCTOR-015 | TBD | TBD | Pending implementation |
| TC-DOCTOR-016 | TBD | TBD | Pending implementation |
| TC-DOCTOR-017 | TBD | TBD | Pending implementation |
| TC-DOCTOR-018 | TBD | TBD | Pending implementation |
| TC-DOCTOR-019 | TBD | TBD | Pending implementation |
| TC-DOCTOR-020 | TBD | TBD | Pending implementation |
| TC-DOCTOR-021 | TBD | TBD | Pending implementation |
| TC-DOCTOR-022 | TBD | TBD | Pending implementation |