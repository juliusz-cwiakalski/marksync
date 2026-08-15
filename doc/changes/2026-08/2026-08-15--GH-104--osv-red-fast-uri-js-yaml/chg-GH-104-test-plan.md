---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-104-test-plan
status: Proposed
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, security, dependencies, supply-chain, ci, bug]
version_impact: patch
summary: "Lockfile-only security fix: bump fast-uri override to ^3.1.5, add js-yaml override ^4.3.1, regenerate bun.lock, version 0.8.1 → 0.8.2 — clearing two CVSS 7.5 osv findings and restoring the blocking osv-scan CI gate"
links:
  change_spec: ./chg-GH-104-spec.md
  implementation_plan: ./chg-GH-104-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - fix: osv red — bump fast-uri to 3.1.5 and js-yaml to 4.3.1 (both CVSS 7.5)

## 1. Scope and Objectives

This test plan validates a **dependency-resolution-only change**: two patch-level `overrides` entries in `package.json`, a regenerated `bun.lock`, and a patch version bump. There is no behavior change to test — the objectives are to (a) verify the resolved lockfile pins clear both CVSS 7.5 advisories, (b) prove zero runtime regression via the existing ~1310-test suite executed unchanged as the regression net, and (c) confirm the blocking `osv-scan` CI gate turns green on this change's PR, restoring repo-wide merge capability.

Because the change touches no `src/` file, **no new automated tests are authored** (rationale in §7.1). Verification is carried by four mechanisms that already exist and are already blocking: the existing test suite (`bun run check`), `bun install --frozen-lockfile` (manifest/lockfile consistency), the `osv-scan` CI job (authoritative vulnerability gate, NFR-SEC-4), and one-shot manual inspection of the committed diff.

### 1.1 In Scope

- Verification that `bun.lock` resolves fast-uri ≥ 3.1.5 and js-yaml ≥ 4.3.1, both remaining transitive-only (AC-F1-1, AC-F2-1)
- Full local quality gate `bun run check` green — lint, format, typecheck, full test suite, boundary check (AC-NFR2-1)
- Change-diff audit: zero `src/` diffs, no resolution drift beyond the two target pins, no new direct dependencies (NFR-3, NFR-4, RSK-3)
- CI `osv-scan` job green with 0 findings on this change's PR (AC-F3-1)
- Package version reads 0.8.2 with no stale version references (AC-DEC2-1)

### 1.2 Out of Scope & Known Gaps

- Any new automated test at any tier — the suite is executed unchanged, not extended (decision D-TST-1, §7.1)
- Live-sandbox E2E — no behavior change to validate against a real API
- Local osv-scanner runs — binary not installed on the delivery machine (verified 2026-08-15, `which osv-scanner` → not found); CI is the authoritative gate per spec §6 Flow 2
- Other dependency updates or CI/workflow changes (spec NG-3, NG-4)

## 2. References

- Change specification: `chg-GH-104-spec.md` (authoritative for AC/F/NFR/DM IDs)
- PM notes: `chg-GH-104-pm-notes.yaml` (DEC-1 provenance; lockfile evidence at lines 254/316)
- Testing strategy: `.ai/rules/testing-strategy.md` (tier applicability, §4 below)
- Security baseline: `doc/guides/security-baseline.md` — NFR-SEC-4, osv-scanner blocking posture
- CI wiring: `.github/workflows/ci.yml` — `osv-scan` job (line ~357), `bun install --frozen-lockfile` steps, Bun pin 1.2.23
- Version-bump precedent: GH-88 test plan / PR #89 (patch bump, manifest-only)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Lockfile pins fast-uri ≥ 3.1.5; fast-uri remains transitive-only | TC-DEPS-001, TC-DEPS-004, TC-DEPS-005 | Covered |
| AC-F2-1 | Lockfile pins js-yaml ≥ 4.3.1 via override (DEC-1); transitive-only | TC-DEPS-002, TC-DEPS-004, TC-DEPS-005 | Covered |
| AC-F3-1 | CI `osv-scan` job green, 0 findings, on this change's PR | TC-DEPS-005 | Covered |
| AC-NFR2-1 | `bun run check` fully green (lint, format, typecheck, full suite, boundaries) | TC-DEPS-003 | Covered |
| AC-DEC2-1 | Package version reads 0.8.2; no version-reference docs needed updating | TC-DEPS-006 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No API or EVT surface is touched (spec §8.1/§8.2: N/A). Data-model elements:

| Interface ID | Description | TC ID(s) | Status |
|--------------|-------------|----------|--------|
| DM-1 | `overrides` map updated: fast-uri `^3.1.5`, js-yaml `^4.3.1` added | TC-DEPS-001, TC-DEPS-002 | Covered |
| DM-2 | Lockfile resolved pins: fast-uri@3.1.5, js-yaml@4.3.1; manifest/lockfile consistency preserved | TC-DEPS-001, TC-DEPS-002, TC-DEPS-004 | Covered |
| DM-3 | Package version field 0.8.1 → 0.8.2 | TC-DEPS-006 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Lockfile free of known vulnerabilities per the CI scanner (0 findings) | TC-DEPS-001, TC-DEPS-002, TC-DEPS-005 | Covered |
| NFR-2 | No regression in the existing quality gate | TC-DEPS-003 | Covered |
| NFR-3 | Zero runtime behavior delta (0 `src/` file changes) | TC-DEPS-004 | Covered |
| NFR-4 | Manifest/lockfile consistency (frozen-lockfile install passes) | TC-DEPS-004 (local), CI jobs (authoritative) | Covered |

## 4. Test Types and Layers

This change modifies no test subject at any tier. Each tier of the repo strategy applies **only as an unchanged regression net**, executed via `bun run check` locally and the CI fast loop / `e2e-mock` job per `.ai/rules/testing-strategy.md`:

| Tier | Applies? | One-line reason |
|------|----------|-----------------|
| Unit | Regression only — no domain logic touched; existing tests run unchanged. |
| Integration | Regression only — adapter/HTTP behavior unchanged; ajv validation paths (where fast-uri lives, RSK-1) are exercised by existing tests. |
| Golden fixture | Regression only — renderer output must stay byte-identical; snapshots run unchanged. |
| Golden adversarial | Regression only — adversarial corpus classification runs unchanged. |
| Mermaid-DOM | Regression only — renderer determinism runs unchanged. |
| Gherkin / BDD | Regression only — lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) must hold under the new resolution; runs unchanged. |
| E2E (mock) | Regression only — full-pipeline mock suite runs unchanged (dedicated CI job). |
| E2E (live-sandbox) | **Does not apply** — no behavior change to validate against a real Confluence space; separate opt-in gate. |

Verification methods actually introduced by this plan: **manual one-shot inspection** (lockfile pins, diff audit, version field) and **CI gate observation** (osv-scan job result). No mocks are used anywhere (nothing to mock — the subject is a committed artifact).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-DEPS-001 | fast-uri resolved pin ≥ 3.1.5, transitive-only | Verification | Manual | High | AC-F1-1 |
| TC-DEPS-002 | js-yaml resolved pin ≥ 4.3.1 via override, transitive-only | Verification | Manual | High | AC-F2-1 |
| TC-DEPS-003 | Full local gate `bun run check` green | Regression | CI | High | AC-NFR2-1 |
| TC-DEPS-004 | Change-diff audit: zero src/ diffs, no resolution drift, frozen-lockfile consistent | Verification | Manual | High | NFR-3, NFR-4 |
| TC-DEPS-005 | CI `osv-scan` job green with 0 findings on this PR | Verification | CI | High | AC-F3-1 |
| TC-DEPS-006 | Package version 0.8.2, no stale version references | Verification | Manual | Medium | AC-DEC2-1 |

### 5.2 Scenario Details

#### TC-DEPS-001 - fast-uri resolved pin ≥ 3.1.5, transitive-only

**Scenario Type**: Verification
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F1-1, F-1, DM-1, DM-2, NFR-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `package.json` `overrides` + `bun.lock` resolved pins (one-shot inspection during delivery phase 6)
**Tags**: @security, @deps

**Preconditions**:

- Override bumped: `"fast-uri": "^3.1.4"` → `"^3.1.5"` in `package.json`
- `bun install` has regenerated `bun.lock`

**Steps**:

1. Inspect `bun.lock` for the resolved pin entry (previously `fast-uri@3.1.4` at line ~254)
2. Confirm it reads `fast-uri@3.1.5` (or higher within `^3.1.5`)
3. Confirm `package.json` has **no** `fast-uri` entry in `dependencies` or `devDependencies` (override-only, per the ticket's fix direction and AC-F1-1)

**Expected Outcome**:

- Lockfile resolves fast-uri ≥ 3.1.5, clearing GHSA-7p8r-x3mc-p8w7 from the runtime graph
- fast-uri remains transitive-only

---

#### TC-DEPS-002 - js-yaml resolved pin ≥ 4.3.1 via override, transitive-only

**Scenario Type**: Verification
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F2-1, F-2, DM-1, DM-2, DEC-1, NFR-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `package.json` `overrides` + `bun.lock` resolved pins (one-shot inspection during delivery phase 6)
**Tags**: @security, @deps

**Preconditions**:

- Override added: `"js-yaml": "^4.3.1"` in `package.json` `overrides` (DEC-1 pattern)
- `bun install` has regenerated `bun.lock`

**Steps**:

1. Inspect `bun.lock` for the resolved pin entry (previously `js-yaml@4.3.0` at line ~316)
2. Confirm it reads `js-yaml@4.3.1` (or higher within `^4.3.1`)
3. Confirm `package.json` has **no** `js-yaml` entry in `dependencies` or `devDependencies` — the override satisfies the mechanism-neutral AC without adding a direct dep (DEC-1)
4. Confirm the direct YAML library `yaml` remains at `^2.9.0`, untouched

**Expected Outcome**:

- Lockfile resolves js-yaml ≥ 4.3.1, clearing GHSA-5p4m-2wfm-xmqj from the dev graph
- js-yaml remains transitive-only; `yaml` unaffected

---

#### TC-DEPS-003 - Full local gate `bun run check` green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-NFR2-1, NFR-2, NFR-3, F-1 (RSK-1 runtime-chain coverage)
**Test Type(s)**: CI
**Automation Level**: Automated
**Target Layer / Location**: `bun run check` (lint + format:check + typecheck + `bun test` + check:boundaries) — the existing ~1310-test suite across all in-repo tiers
**Tags**: @ci, @regression

**Preconditions**:

- Overrides applied and lockfile regenerated (TC-DEPS-001/002 preconditions)
- `node_modules` installed from the regenerated lockfile

**Steps**:

1. Run `bun run check`
2. Assert exit code 0 — lint, format, typecheck, full test suite, boundary check all pass
3. Assert 0 test failures (baseline: suite green on `main` before the change)

**Expected Outcome**:

- Full quality gate green with zero regressions — the primary evidence that the patch-level resolutions (especially fast-uri inside the ajv runtime chain, RSK-1) changed no behavior
- AC-NFR2-1 satisfied; mirrors in CI fast loop + `e2e-mock` job on the PR

---

#### TC-DEPS-004 - Change-diff audit: zero src/ diffs, no resolution drift, frozen-lockfile consistent

**Scenario Type**: Verification
**Impact Level**: Critical
**Priority**: High
**Related IDs**: NFR-3, NFR-4, DM-1, DM-2, NG-1, NG-2, RSK-3
**Test Type(s)**: Manual
**Automation Level**: Semi-automated (git diff inspection + one frozen-lockfile install)
**Target Layer / Location**: `git diff` of the change branch; `bun install --frozen-lockfile`
**Tags**: @security, @deps

**Preconditions**:

- All changes staged on the change branch

**Steps**:

1. `git diff main --stat` — assert the changed-file set is exactly: `package.json`, `bun.lock`, plus this change's doc artifacts (spec/test-plan/pm-notes) — **zero `src/` or `tests/` diffs** (NFR-3)
2. Audit the `bun.lock` diff — assert the only dependency-resolution changes are fast-uri 3.1.4 → 3.1.5 and js-yaml 4.3.0 → 4.3.1 (RSK-3: no unintended drift; any unrelated pin change must be investigated, not silently scoped in)
3. Run `bun install --frozen-lockfile` — assert it succeeds (manifest and lockfile agree exactly, NFR-4; the same check runs in every CI job)
4. Confirm no new packages appear in `dependencies`/`devDependencies` (NG-2)

**Expected Outcome**:

- Surgical diff: two override lines, two lockfile pin lines (plus integrity hashes), version field, docs only
- Frozen install passes; consistency verified locally before CI sees it

---

#### TC-DEPS-005 - CI `osv-scan` job green with 0 findings on this PR

**Scenario Type**: Verification
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-F3-1, F-3, NFR-1
**Test Type(s)**: CI
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` → `osv-scan` job (google/osv-scanner-action reusable workflow, unchanged)
**Tags**: @ci, @security

**Preconditions**:

- Change pushed and PR opened (phase 11)
- osv-scanner job wiring unchanged (NG-4) — only the scanned artifact (lockfile) changed

**Steps**:

1. Open/update the change PR
2. Observe the `Vulnerability scan (osv-scanner)` check on the PR
3. Assert the job completes green — 0 findings against the regenerated lockfile

**Expected Outcome**:

- The gate that flagged the issue verifies the fix: osv-scan green on this PR (AC-F3-1), restoring merge capability repo-wide
- Local note: `osv-scanner` is not installed on the delivery machine (verified 2026-08-15); a local run is optional if the binary becomes available, but CI is the authoritative and blocking check per NFR-SEC-4 — no local reproduction is required for this AC

---

#### TC-DEPS-006 - Package version 0.8.2, no stale version references

**Scenario Type**: Verification
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-DEC2-1, DEC-2, DM-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `package.json` `version` field + doc grep (one-shot inspection)
**Tags**: @deps

**Preconditions**:

- Version bump applied

**Steps**:

1. Assert `package.json` `"version"` reads `0.8.2` (was 0.8.1)
2. Grep docs for version references requiring updates — per spec §7.1 the README `--version` mention is illustrative and TDR-0010's 0.8.x mention is frozen history; assert neither requires an edit
3. Confirm the version bump rides in the same diff (TC-DEPS-004 file set)

**Expected Outcome**:

- Version field is 0.8.2; the next tagged release and its SBOM map 0.8.2 → the patched dependency set (DEC-2)

## 6. Environments and Test Data

### Test Environments

- **Local development**: Bun 1.3.14 (verified on the delivery machine); `bun install` regenerates the lockfile; `bun run check` runs the full gate. No mock servers, no secrets, no network beyond the npm registry.
- **CI (GitHub Actions)**: Bun pinned 1.2.23 (fast loop, `e2e-mock`, `osv-scan` jobs); `bun install --frozen-lockfile` before every job; `osv-scan` via the official reusable workflow — the authoritative vulnerability gate.
- **Local osv-scanner**: not installed (`which osv-scanner` → not found, 2026-08-15). Optional if later available; never blocking (see TC-DEPS-005).

### Test Data

None beyond the repo's own artifacts: `package.json` (manifest + overrides + version) and `bun.lock` (resolved pins). No fixtures, no env vars, no credentials.

### Isolation Strategy

N/A — no test state is created; every verification reads committed files or observes CI. The lockfile is regenerated in place on the change branch only.

## 7. Automation Plan and Implementation Mapping

### 7.1 Considered and rejected: permanent lockfile-pin assertion test

**Decision D-TST-1: one-shot manual verification (TC-DEPS-001/002); no permanent automated test asserting `bun.lock` pins fast-uri ≥ 3.1.5 / js-yaml ≥ 4.3.1.**

Tradeoff weighed:

- **A permanent test** (e.g., `tests/unit/meta/lockfile-pins.test.ts` reading `bun.lock`) would guard against a lockfile-regeneration downgrade, but that regression class is already caught with strictly better fidelity by two always-on blocking gates: `bun install --frozen-lockfile` fails any push where manifest and lockfile disagree, and the `osv-scan` job flags **any** known-vulnerable pin — including future advisories the hardcoded floors know nothing about. The bespoke test would duplicate the gate weakly and go stale on the next advisory.
- **Rot risk is real and anticipated by the spec**: the overrides are transient remediation scaffolding with a documented removal trigger (spec §7.3 — remove the js-yaml override once the upstream chain naturally requires ≥ 4.3.1). A later legitimate override removal forces coordinated test deletion at an unpredictable date; forgetting it produces a false-positive failure and triage tax.
- **Encodes advisory knowledge into the suite**: "≥ 3.1.5" is today's CVE answer, not a durable invariant. The repo strategy favors testing real behavior, not bespoke scaffolding around committed artifacts.

Net: the permanent test adds no protection beyond existing gates, adds a documented maintenance liability, and the commit itself is trivially reviewable (`bun.lock` pins appear as plain diff lines). Manual one-shot verification + CI gates is the defensible minimum.

### 7.2 Implementation mapping

| TC ID | Mechanism / File | Implementation Status | Notes |
|-------|------------------|----------------------|-------|
| TC-DEPS-001 | `bun.lock` + `package.json` inspection | Manual Only | One-shot during delivery phase 6 |
| TC-DEPS-002 | `bun.lock` + `package.json` inspection | Manual Only | One-shot; includes `yaml` ^2.9.0 untouched check |
| TC-DEPS-003 | `bun run check` (existing scripts) | Existing – No Change | ~1310 tests execute unchanged as regression net |
| TC-DEPS-004 | `git diff` audit + `bun install --frozen-lockfile` | Manual Only | Semi-automated: one local frozen install |
| TC-DEPS-005 | CI `osv-scan` job (existing workflow) | Existing – No Change | Observed on the PR; authoritative gate |
| TC-DEPS-006 | `package.json` + doc grep | Manual Only | One-shot |
| (rejected) | `tests/unit/meta/lockfile-pins.test.ts` | Considered – Rejected | See D-TST-1, §7.1 |

### Execution commands

```bash
bun install                       # regenerate bun.lock from updated overrides
bun install --frozen-lockfile     # TC-DEPS-004: manifest/lockfile consistency
grep -n "fast-uri\|js-yaml" bun.lock          # TC-DEPS-001/002: resolved pins
git diff main --stat              # TC-DEPS-004: surgical diff audit
bun run check                     # TC-DEPS-003: full quality gate
# TC-DEPS-005: observe the "Vulnerability scan (osv-scanner)" check on the PR
```

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | Local regeneration with Bun 1.3.14 produces a lockfile the CI-pinned Bun 1.2.23 rejects under `--frozen-lockfile` (version/format skew) | M | L | TC-DEPS-004 runs a local frozen install; CI fast loop fails loudly on the first push if skew exists — re-regenerate or align Bun before merge |
| R-TST-2 | Lockfile regeneration drifts beyond the two target pins (RSK-3) | M | L | TC-DEPS-004 step 2 audits the full lockfile diff; unrelated drift is investigated, never silently scoped in |
| R-TST-3 | fast-uri 3.1.5 subtly alters ajv URI-normalization behavior with no new test targeting it | L | L | The full existing suite (unit, integration, golden, adversarial, BDD invariants, e2e-mock) exercises the ajv paths and runs in TC-DEPS-003 before merge — that is precisely its role as regression net (spec RSK-1) |
| R-TST-4 | osv-scanner unavailable locally delays finding verification to CI | L | — | Accepted by design: the CI gate is blocking and authoritative (NFR-SEC-4); AC-F3-1 is defined on the PR, not locally |

### 8.2 Assumptions

- fast-uri@3.1.5 and js-yaml@4.3.1 are published and semver-compatible with their consumers (spec §12)
- The existing suite is green on `main` before this change, so any `bun run check` failure is attributable to the dependency delta
- The `osv-scan` CI job and its wiring remain unchanged (NG-4) — only the scanned artifact changes
- CI Bun pin (1.2.23) reads the regenerated lockfile (text `lockfileVersion: 1`) without issue; verified by the first CI run

### 8.3 Open Questions

None. The one test-design question — permanent lockfile-pin assertion vs one-shot manual check — is resolved as decision D-TST-1 (§7.1): manual, because the frozen-lockfile install and the blocking osv-scan job already cover the regression class with better fidelity and no rot.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | test-plan-writer (GH-104) | Initial test plan — lockfile-only security fix; 6 verification scenarios, all ACs covered; no new automated tests (D-TST-1) |

## 10. Test Execution Log

Populated during delivery phases 6–10 by `@coder`, `@runner`, and `@pm` (dod_check).

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| - | - | - | Pending |
