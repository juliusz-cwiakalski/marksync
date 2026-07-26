---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-32-test-plan
status: Proposed
created: 2026-07-26T18:30:00Z
last_updated: 2026-07-26T18:30:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, release-pipeline, binary-builds, bun-compile, ci, sbom, cross-platform]
version_impact: minor
summary: "Production release pipeline test plan for cross-platform binary builds. Validates cross-compile success (linux-x64, linux-arm64, win-x64) from the real CLI using Bun 1.2.23, clean-OS runtime smoke (debian:stable-slim Docker for linux, windows-latest runner for windows), size/cold-start measurement persistence to .benchmarks/binaries.json, release workflow artifact assembly (binaries + SHA256SUMS + SBOM), signing reference documentation, CI regression guard (bun run check green), and secret hygiene (0 secrets in committed artifacts). All tests are E2E release tier; no unit/integration/golden/BDD tests since no src/ domain logic is introduced."
links:
  change_spec: ./chg-GH-32-spec.md
  implementation_plan: ./chg-GH-32-plan.md   # pending — authored in lifecycle phase 4 (delivery_planning)
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E5-S4] Cross-platform binary builds

## 1. Scope and Objectives

This is a **build / CI / release engineering** story, not a feature delivery. The behaviour to protect is the **release pipeline integrity** for MS-0002 distribution: that the refined `scripts/build-binaries.sh` produces real-CLI single binaries for **Linux (amd64 + arm64) + Windows (amd64)** using the project-pinned Bun **1.2.23**, that each binary runs on a **clean OS** (no mandatory language runtime), that binary size and cold-start are recorded for regression tracking, that the tag-triggered release workflow assembles the correct artifacts (binaries + SHA256SUMS + SBOM), and that signing is documented without committing secrets.

The integrity risks are: (a) the release workflow pins the **spike's** Bun 1.1.34 instead of the project pin 1.2.23, producing unreproducible binaries (RSK-1); (b) the clean-OS image tag mismatch (`debian:slim` is not published) breaks the smoke job (RSK-4); (c) the spike's DEC-3 Windows-run deferral is not closed (no CI signal that win-x64.exe actually runs on Windows); (d) size and cold-start regressions go untracked over time; (e) the release workflow attaches an incomplete/incorrect artifact set; (f) a committed artifact leaks a signing secret.

This story introduces **no `src/` domain logic** (build/CI/release engineering only). The cross-compile mechanism, the clean-OS no-runtime proof, the size/cold-start baseline, and the signing recipe were all **validated by GH-13** (H1–H5 PASS). This story wires them into the real release pipeline against the real CLI.

### 1.1 In Scope

- Ten E2E release-tier test cases covering:
  1. Cross-compile success for linux-x64, linux-arm64, win-x64 from the real CLI using Bun 1.2.23
  2. Clean-OS linux-x64 runtime smoke on `debian:stable-slim` (no Bun/Node/Deno installed)
  3. Clean-OS win-x64 runtime smoke on a `windows-latest` runner (no Wine)
  4. Binary size measurement and persistence to `.benchmarks/binaries.json`
  5. Cold-start measurement and persistence to `.benchmarks/binaries.json`
  6. Release workflow artifact assembly: binaries + SHA256SUMS + SBOM present on tag
  7. Signing reference document presence (osslsigncode recipe documented)
  8. `bun run check` green (no src/ domain regression introduced)
  9. Secret hygiene scan (0 secrets; `$CERT_PASSWORD` is an env-var name)
  10. Release matrix correctness (Linux amd64+arm64, Windows amd64; macOS NOT produced)
- All tests execute in CI (per-push clean-OS smoke jobs; release workflow on tag).
- Evidence follows GH-13 conventions: size via `stat -c %s` (bytes), MB = bytes ÷ 1,048,576 (binary); cold-start = fresh-process wall-clock via `/usr/bin/time -v`, n=5; clean-OS = `debian:stable-slim`.

### 1.2 Out of Scope & Known Gaps

- **Unit / integration / golden / BDD tests.** This story introduces no `src/` domain logic (build/CI/release engineering only). The existing test suite passes unchanged (AC-CI-1 is a regression guard).
- **macOS target.** Deferred to MS-0003 per NFR-COMP-1 (AC-COMP-1 explicitly excludes macOS).
- **Real production code-signing.** Dry-run/documented command only (AC-SIGN-1). No real cert is provisioned; signing stays out of scope.
- **Performance thresholds as hard gates.** Size ≤90 MB and cold-start ≤2 s are **"desired, not hard"** — TC-SIZE-001 and TC-START-001 record actuals and flag exceedances, never block (DEC-4, per spec and PR #4).
- **arm64 as a hard gate.** TC-BUILD-001 records arm64 availability; if unavailable, ship x64-only for MS-0002 and record arm64 as MS-0003 (DEC-3).
- **The clean-OS Windows *run* inside Wine.** TC-RUN-002 runs on a real `windows-latest` GitHub runner, not Wine (closes spike DEC-3).

## 2. References

| Reference | Path | Role |
|---|---|---|
| Change specification | `./chg-GH-32-spec.md` | Primary input; AC-BUILD/RUN1/RUN2/SIZE/START/COMP/SIGN/REL/CI/SEC, F-1…F-6, NFR-CC/RUN/SIZE/START/SBOM/CHK/SEC/MAINT, DEC-1…DEC-8 |
| Story file | `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md` | Authoritative scope (Goal, 6-item Detailed scope, AC checklist, Out-of-scope, CEO-resolved R1/R2) |
| Testing strategy | `.ai/rules/testing-strategy.md` | 7-tier testing strategy; E2E (release) tier for this story; benchmark-gate philosophy for non-blocking delta-reporter; product-perf scenarios (binary size, cold-start) |
| CI baseline | `.github/workflows/ci.yml` | Bun pin 1.2.23, matrix conventions, fast-loop + e2e-mock + osv-scan jobs |
| Spike findings | `findings/bun-compile-smoke-findings.md` | Validated baseline measurements (linux 96.90 MB, win 105.12 MB; cold-start median 0.010 s); evidence conventions (size bytes, MB conversion, cold-start wall-clock); clean-OS image tag reconciliation (`debian:stable-slim`, not `debian:slim`) |
| Spike test plan | `doc/changes/2026-07/2026-07-06--GH-13--bun-cross-compile-smoke/chg-GH-13-test-plan.md` | Precedent for TC-BCS-NNN style; TC-BCS-001/002/008 patterns for cross-compile; TC-BCS-003 pattern for clean-OS linux run |
| Build script skeleton | `scripts/build-binaries.sh` | GH-13 handoff; entry placeholder `./src/cli.ts` → repointed to real CLI `src/cli/index.ts` in this story |
| Signing recipe | `spikes/bun-compile-smoke/probes/signing-dry-run.md` | Validated `osslsigncode` sign/verify/extract-signature command; cert plug-in point |
| ADR-0001 | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | C-2 (single binary, no runtime) + C-3 (cross-platform) this release pipeline realizes; signing Unresolved Question partially addressed |
| NFRs | `doc/spec/nonfunctional.md` | NFR-PERF-1 (≤90 MB desired), NFR-PERF-2 (≤2 s cold-start desired), NFR-COMP-1 (MS-0002 = Linux+Windows), NFR-COMP-2 (clean-OS run, no runtime), NFR-SEC-4 (SBOM on release) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-BUILD-1 | Cross-compile success (linux-x64, linux-arm64, win-x64) from the real CLI using Bun 1.2.23, each reporting the package.json version via `--version` | TC-BUILD-001 | To implement |
| AC-RUN1-1 | Clean-OS linux-x64 run on `debian:stable-slim` (no Bun/Node/Deno installed); `--version` exits 0; `doctor --json` against a mock/sandbox exits 0 | TC-RUN-001 | To implement |
| AC-RUN2-1 | Clean-OS win-x64.exe run on a `windows-latest` runner (no Wine); `--version` exits 0 — closes spike DEC-3 | TC-RUN-002 | To implement |
| AC-SIZE-1 | Binary size measured per target; actual size recorded to `.benchmarks/binaries.json` (≤90 MB desired; flagged-not-blocking per DEC-4) | TC-SIZE-001 | To implement |
| AC-START-1 | Cold-start measured for linux-x64 on clean OS; actual time recorded to `.benchmarks/binaries.json` (≤2 s desired; flagged-not-blocking) | TC-START-001 | To implement |
| AC-COMP-1 | Release matrix: Linux (amd64 + arm64) and Windows (amd64) binaries ship; macOS is NOT produced (deferred to MS-0003) | TC-REL-001 | To implement |
| AC-SIGN-1 | Signing story documented: references the validated `osslsigncode` recipe; identifies the cert/Authenticode plug-in point (env-var name only; no real cert, no execution) | TC-SIGN-001 | To implement |
| AC-REL-1 | Release workflow attaches the binary set + one `SHA256SUMS` (hash per binary) + one SBOM (`syft`/CycloneDX) to the GitHub Release on tag | TC-REL-001 | To implement |
| AC-CI-1 | `bun run check` green (lint + format + typecheck + test + boundaries — no src/ domain regression introduced) | TC-CI-001 | To implement |
| AC-SEC-1 | 0 secrets in any committed artifact (scripts, workflows, .benchmarks/, signing reference); the signing reference uses `$CERT_PASSWORD` as an env-var name, never a literal | TC-SEC-001 | To implement |

> **All ten ACs are fully traced.** No AC is left as a TODO.

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| DM ID | Element | TC ID(s) | Evidence Path |
|-------|---------|----------|---------------|
| DM-1 | `.benchmarks/binaries.json` (commit-tracked size + cold-start record) | TC-SIZE-001, TC-START-001 | Schema populated per build; CI delta-reporter consumes it |
| DM-2 | Release artifact manifest (binaries + SHA256SUMS + SBOM) | TC-REL-001 | Verified on GitHub Release after tag |
| DM-3 | Version-embedding contract (binary's `--version` equals `package.json#version`) | TC-BUILD-001 | Smoke asserts `--version` matches expected version |

**No REST/HTTP endpoints or events are introduced by this change.** All interfaces are build/CI/release artifacts and data models.

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID (spec §9) | Requirement | TC ID(s) | Evidence Path |
|--------|-------------|----------|---------------|
| NFR-CC-1 | Cross-compile success (3 targets compile exit 0) | TC-BUILD-001 | CI build logs; exit status asserted |
| NFR-RUN-1 | Clean-OS Linux runtime (no Bun/Node/Deno) | TC-RUN-001 | CI docker-run logs; `command -v bun node deno` → 127; `--version` → 0 |
| NFR-RUN-2 | Clean-OS Windows runtime (no Wine) | TC-RUN-002 | CI windows-latest runner logs; `--version` → 0 |
| NFR-SIZE-1 | Binary size recorded (≤90 MB desired; flagged-not-blocking) | TC-SIZE-001 | `.benchmarks/binaries.json`; CI delta-reporter logs |
| NFR-START-1 | Cold-start recorded (≤2 s desired; flagged-not-blocking) | TC-START-001 | `.benchmarks/binaries.json`; CI delta-reporter logs |
| NFR-SBOM-1 | SBOM per release (1 `syft`/CycloneDX SBOM) | TC-REL-001 | GitHub Release artifact |
| NFR-CHK-1 | Release checksums (1 `SHA256SUMS` per release) | TC-REL-001 | GitHub Release artifact |
| NFR-SEC-1 | Secret hygiene (0 secrets in committed artifacts) | TC-SEC-001 | Secrets scan result |
| NFR-MAINT-1 | Non-blocking regression signal (CI reports deltas, never hard-fails) | TC-SIZE-001, TC-START-001 | CI delta-reporter implementation |

## 4. Test Types and Layers

This story is **build / CI / release engineering only** and introduces **no `src/` domain logic**. Therefore, the only test tier that applies is the **E2E (release) tier**.

| Test Tier | Runner | Scope | What it validates | CI gate |
|---|---|---|---|---|
| **E2E (release)** | CI workflows (`ci.yml` for clean-OS smoke, `release.yml` for artifact assembly) | Cross-compile success, clean-OS runtime smoke, size/cold-start measurement, release artifact assembly, secret hygiene | End-to-end release pipeline integrity across the full binary build → clean-OS smoke → release artifact flow | Every push (clean-OS smoke) and on tag (release workflow) |

**Explicitly excluded tiers (no `src/` domain logic):**

- **Unit tests:** Not applicable — no `src/` domain logic is introduced.
- **Integration tests:** Not applicable — no adapter boundary changes.
- **Golden fixture tests:** Not applicable — no Markdown/Storage renderer changes.
- **Golden adversarial tests:** Not applicable — no content classification changes.
- **Mermaid-DOM tests:** Not applicable — no Mermaid rendering changes.
- **Gherkin / BDD tests:** Not applicable — no lifecycle invariant contract changes.
- **E2E (mock) tests:** Not applicable — no `Bun.serve()` Confluence adapter changes.

**Tier placement rationale:**

Per `.ai/rules/testing-strategy.md`, the E2E (release) tier validates "end-to-end correctness against real artifacts". This story's entire surface is release engineering: binary builds, clean-OS runtime smoke, measurement persistence, release artifact assembly, and secret hygiene. The only "test" of existing behavior is the regression guard in TC-CI-001 (`bun run check` green), which ensures the existing suite (which already validates INV-SAFE-1/2/3, INV-SEC-1, A-FEA-5, etc.) passes unchanged.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-BUILD-001 | Cross-compile success (linux-x64 + linux-arm64 + win-x64) from real CLI using Bun 1.2.23 | Happy Path | Critical | High | AC-BUILD-1 |
| TC-RUN-001 | Clean-OS linux-x64 runtime smoke on `debian:stable-slim` (no runtime; `--version` exit 0) | Happy Path | Critical | High | AC-RUN1-1 |
| TC-RUN-002 | Clean-OS win-x64.exe runtime smoke on `windows-latest` runner (no Wine; `--version` exit 0) | Happy Path | Critical | High | AC-RUN2-1 |
| TC-SIZE-001 | Binary size measurement and persistence to `.benchmarks/binaries.json` | Corner Case | Important | High | AC-SIZE-1 |
| TC-START-001 | Cold-start measurement and persistence to `.benchmarks/binaries.json` | Corner Case | Important | High | AC-START-1 |
| TC-REL-001 | Release workflow artifact assembly: binaries + SHA256SUMS + SBOM present on tag | Happy Path | Critical | High | AC-COMP-1, AC-REL-1 |
| TC-SIGN-001 | Signing reference document presence (osslsigncode recipe documented) | Happy Path | Important | Medium | AC-SIGN-1 |
| TC-CI-001 | `bun run check` green (no src/ domain regression introduced) | Regression | Important | High | AC-CI-1 |
| TC-SEC-001 | Secret hygiene scan (0 secrets in committed artifacts) | Negative | Important | High | AC-SEC-1 |

### 5.2 Scenario Details

---

#### TC-BUILD-001 - Cross-compile success (linux-x64 + linux-arm64 + win-x64) from real CLI using Bun 1.2.23

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-BUILD-1, NFR-CC-1, DEC-1, DEC-3
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (build job), `.github/workflows/release.yml` (release matrix), `scripts/build-binaries.sh`
**Tags**: @release, @bun-compile, @cross-compile, @build, @ci

**Preconditions**:

- The real CLI entry `src/cli/index.ts` exists (delivered by GH-14).
- The refined `scripts/build-binaries.sh` has its entry repointed from placeholder `./src/cli.ts` to `src/cli/index.ts`, embeds the `package.json` version, and adds the `linux-arm64` target.
- Bun **1.2.23** is active in CI (matching `package.json#engines.bun` + `ci.yml` pin; DEC-1 — NOT the spike's 1.1.34).

**Steps**:

1. CI runs the build step: `scripts/build-binaries.sh --target all --entry src/cli/index.ts`.
2. Assert the command exits **0**.
3. Assert the following binaries exist in `dist/`:
   - `marksync-linux-x64`
   - `marksync-linux-arm64` (R1; if the target is unavailable in the pinned Bun, record arm64 as MS-0003 and ship x64-only per DEC-3)
   - `marksync-win-x64.exe`
4. For each binary, assert `file(1)` reports the expected artifact type:
   - `marksync-linux-x64`: ELF 64-bit LSB executable, x86-64
   - `marksync-linux-arm64`: ELF 64-bit LSB executable, ARM aarch64 (if produced)
   - `marksync-win-x64.exe`: PE32+ executable for MS Windows, x86-64
5. For each binary, run `./dist/marksync-<target> --version` and assert it prints the `package.json` version (currently `0.7.0`) and exits **0** (DM-3 version-embedding contract).
6. Assert `bun --version` in the build step reports **1.2.23** (not the spike's 1.1.34).

**Expected Outcome**:

- Exit code **0**; all three binaries produced (or x64-only with arm64 recorded if unavailable).
- Each binary is the correct artifact type per `file(1)`.
- Each binary's `--version` matches the `package.json` version.
- Bun version is 1.2.23 (not 1.1.34).
- → **AC-BUILD-1 satisfied**.

**Evidence captured**: CI build logs (exit status, `bun --version`, `file` output, `--version` output). Build artifacts are ephemeral and not committed; their sizes are recorded by TC-SIZE-001.

**Pass/Fail criteria**: PASS iff exit 0, all expected binaries produced (or arm64 recorded as MS-0003 if unavailable), each binary is the correct artifact type, and each binary's `--version` matches `package.json`. If Bun version is not 1.2.23 → FAIL (RSK-1 — wrong pin, unreproducible binaries). If `linux-arm64` is unavailable → record as MS-0003 per DEC-3; do not block.

**Notes / Clarifications**: This TC builds on the spike's TC-BCS-001/002/008 patterns. The key differences: (a) real CLI entry (not spike placeholder); (b) Bun 1.2.23 (not spike's 1.1.34); (c) arm64 is included per CEO R1 (or recorded as MS-0003 if unavailable). The spike validated that the cross-compile mechanism works; this story validates it against the real CLI and the project Bun pin.

---

#### TC-RUN-001 - Clean-OS linux-x64 runtime smoke on `debian:stable-slim` (no runtime; `--version` exit 0)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-RUN1-1, NFR-RUN-1, DEC-2
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (clean-OS smoke job), Docker `debian:stable-slim`
**Tags**: @release, @clean-os, @docker, @debian, @linux

**Preconditions**:

- TC-BUILD-001 has produced `marksync-linux-x64` in `dist/`.
- Docker daemon is reachable in CI (ubuntu-latest runner).
- The `debian:stable-slim` image is available (pull if needed); its image digest is recorded for reproducibility.
- **Critical**: use `debian:stable-slim`, NOT `debian:slim` (which is not a published Docker Hub tag — DEC-2).

**Steps**:

1. Verify the container has **no** Bun/Node/Deno: `docker run --rm debian:stable-slim sh -c 'command -v bun node deno; echo "exit=$?"'` — assert `command -v` returns exit **127** (none present).
2. Run the binary on the clean OS: `docker run --rm -v "$PWD":/x -w /x debian:stable-slim ./dist/marksync-linux-x64 --version`.
3. Assert the command exits **0** and prints the `package.json` version.
4. Run the `doctor --json` command against a mock or sandbox (e.g., `docker run --rm -v "$PWD":/x -w /x debian:stable-slim ./dist/marksync-linux-x64 doctor --json`).
5. Assert the `doctor` command exits **0** (or the appropriate exit code for a valid mock/sandbox response).
6. Record the docker-run output, the `command -v` output, and the `debian:stable-slim` image digest.

**Expected Outcome**:

- `command -v bun node deno` returns exit 127 inside the container (no language runtime — NFR-COMP-2 satisfied).
- `./dist/marksync-linux-x64 --version` exits 0 and prints the correct version.
- `./dist/marksync-linux-x64 doctor --json` exits 0 (valid mock/sandbox response).
- → **AC-RUN1-1 satisfied**.

**Evidence captured**: CI docker-run logs (exit codes, stdout/stderr), `command -v` output, image digest.

**Pass/Fail criteria**: PASS iff exit 0 for `--version` and `doctor --json`, version string matches, and no Bun/Node/Deno present in the container. If it fails → AC-RUN1-1 FAIL; NFR-RUN-1 not met; record the failure mode for owner review.

**Notes / Clarifications**: This TC builds on the spike's TC-BCS-003 pattern. The key differences: (a) real CLI (not spike smoke CLI); (b) `debian:stable-slim` (not `debian:slim` — DEC-2 reconciliation); (c) includes `doctor --json` smoke (against mock/sandbox). The spike validated the clean-OS no-runtime promise on the smoke CLI; this story validates it on the real CLI and closes the image-tag hazard.

---

#### TC-RUN-002 - Clean-OS win-x64.exe runtime smoke on `windows-latest` runner (no Wine; `--version` exit 0)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-RUN2-1, NFR-RUN-2, DEC-5 (closes spike DEC-3)
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (windows smoke job), `windows-latest` GitHub runner
**Tags**: @release, @clean-os, @windows, @ci

**Preconditions**:

- TC-BUILD-001 has produced `marksync-win-x64.exe` in `dist/`.
- A `windows-latest` GitHub runner is available (standard Actions offering).
- **No Wine**: this test runs on a real Windows runner, closing the spike's DEC-3 deferral.

**Steps**:

1. On the `windows-latest` runner, run the binary: `.\dist\marksync-win-x64.exe --version`.
2. Assert the command exits **0** and prints the `package.json` version.
3. Record the exit status and version output in CI logs.

**Expected Outcome**:

- `.\dist\marksync-win-x64.exe --version` exits 0 and prints the correct version.
- → **AC-RUN2-1 satisfied**; spike DEC-3 deferral closed.

**Evidence captured**: CI windows-latest runner logs (exit status, stdout/stderr).

**Pass/Fail criteria**: PASS iff exit 0 and version string matches. If it fails → AC-RUN2-1 FAIL; NFR-RUN-2 not met; record the failure mode for owner review.

**Notes / Clarifications**: This TC closes the spike's DEC-3 deferral — the win-x64 binary is now empirically validated to run on a real Windows environment (not just produced and verified as PE32+). No Wine is used; the test executes on a genuine Windows runner provided by GitHub Actions. The spike's TC-BCS-002 validated production + PE32+ verification; this validates the run.

---

#### TC-SIZE-001 - Binary size measurement and persistence to `.benchmarks/binaries.json`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-SIZE-1, NFR-SIZE-1, DEC-4 (desired, not hard)
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (build job), `.benchmarks/binaries.json`
**Tags**: @release, @perf, @size, @measure

**Preconditions**:

- TC-BUILD-001 has produced all binaries in `dist/`.
- The **measurement convention** follows GH-13: size recorded in **bytes** (via `stat -c %s`), then converted to **MB using 1 MB = 1,048,576 bytes (binary)**.
- `.benchmarks/binaries.json` is a commit-tracked file (DM-1) with a schema that records per-target size (bytes) + linux-x64 cold-start (wall-clock, n-samples).

**Steps**:

1. For each produced binary (`marksync-linux-x64`, `marksync-linux-arm64` if produced, `marksync-win-x64.exe`), run `stat -c %s <binary>` to capture size in bytes.
2. Convert each to MB (÷ 1,048,576) and record both bytes and MB in a table.
3. Update `.benchmarks/binaries.json` with the measured sizes (create on first measurement, update on subsequent builds).
4. Compare each to the **≤90 MB desired** budget (NFR-PERF-1). Flag if larger (do NOT hard-fail).
5. Commit `.benchmarks/binaries.json` as part of the build evidence.

**Expected Outcome**:

- All sizes recorded (bytes + MB) in `.benchmarks/binaries.json`.
- If a binary exceeds 90 MB, it is **recorded + flagged, NOT blocking** (DEC-4; PR #4 "larger acceptable if the job gets done"; CEO waived NFR-PERF-1 as a hard gate).
- → **AC-SIZE-1 satisfied**.

**Evidence captured**: `.benchmarks/binaries.json` (commit-tracked); CI delta-reporter logs (comparisons against committed baseline).

**Pass/Fail criteria**: PASS iff all sizes are recorded (bytes + MB) to `.benchmarks/binaries.json`. Exceeding 90 MB is a **flag**, not a fail (DEC-4). CI delta-reporter shows deltas but does not hard-fail on them (NFR-MAINT-1). Baseline from GH-13: linux 96.90 MB, win 105.12 MB.

**Notes / Clarifications**: This TC builds on the spike's TC-BCS-005 pattern. The key difference: persistence to a commit-tracked `.benchmarks/binaries.json` (DM-1) so future regressions are visible. The CI delta-reporter compares new measurements against the committed baseline and reports deltas without hard-failing (consistent with testing-strategy benchmark-gate philosophy and DEC-6).

---

#### TC-START-001 - Cold-start measurement and persistence to `.benchmarks/binaries.json`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-START-1, NFR-START-1, DEC-4 (desired, not hard)
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (build job), Docker `debian:stable-slim`, `.benchmarks/binaries.json`
**Tags**: @release, @perf, @cold-start, @measure

**Preconditions**:

- TC-BUILD-001 has produced `marksync-linux-x64`.
- TC-RUN-001 confirms it runs on the clean OS.
- The **measurement convention** follows GH-13: **cold-start = wall-clock time of the first invocation of a fresh process** for `./dist/marksync-linux-x64 --version` on the clean OS. Run a small number of repeats (e.g., 3–5) and record each; a single sample is noisy.
- `.benchmarks/binaries.json` is a commit-tracked file (DM-1).

**Steps**:

1. On the clean-OS Linux container (`debian:stable-slim`), run for each repeat `i`:
   `docker run --rm -v "$PWD":/x -w /x debian:stable-slim /usr/bin/time -v ./dist/marksync-linux-x64 --version`
   (If `/usr/bin/time` is absent in the slim image, install it ephemerally inside the container, or use an alternative method.)
2. Capture, per repeat: **wall-clock time** (the cold-start) and `Maximum resident set size` (informational RSS).
3. Record the wall-clock values in `.benchmarks/binaries.json` (min/median/max summary).
4. Compare to the **≤2 s desired** budget (NFR-PERF-2). Document if longer (do NOT hard-fail).
5. Commit `.benchmarks/binaries.json` as part of the build evidence.

**Expected Outcome**:

- Wall-clock cold-start recorded (per repeat + summary) in `.benchmarks/binaries.json`; informational RSS recorded.
- If cold-start exceeds 2 s, it is **documented, NOT blocking** (DEC-4; PR #4; CEO waived NFR-PERF-2 as a hard gate).
- → **AC-START-1 satisfied**.

**Evidence captured**: `.benchmarks/binaries.json` (commit-tracked); CI delta-reporter logs (comparisons against committed baseline).

**Pass/Fail criteria**: PASS iff the cold-start is recorded (wall-clock + RSS) to `.benchmarks/binaries.json`. Exceeding 2 s is **documented, not a fail** (DEC-4). CI delta-reporter shows deltas but does not hard-fail (NFR-MAINT-1). Baseline from GH-13: median 0.010 s (n=5); ~200× inside budget.

**Notes / Clarifications**: This TC builds on the spike's TC-BCS-006 pattern. The key difference: persistence to a commit-tracked `.benchmarks/binaries.json` (DM-1) so future regressions are visible. True cold-start isolation (page-cache eviction) is hard in a container; the probe records each value and notes that absolute cold-start numbers are directional, not a micro-optimization gate (consistent with testing-strategy product-perf scenarios design principle).

---

#### TC-REL-001 - Release workflow artifact assembly: binaries + SHA256SUMS + SBOM present on tag

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, F-6, AC-COMP-1, AC-REL-1, NFR-SBOM-1, NFR-CHK-1, DEC-8 (macOS OUT)
**Test Type(s)**: E2E (release)
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/release.yml`, GitHub Release artifacts
**Tags**: @release, @ci, @workflow, @sbom, @checksums

**Preconditions**:

- TC-BUILD-001 has produced the binary set (linux-x64, linux-arm64 if available, win-x64).
- A tag is pushed (e.g., `git tag v0.7.0 && git push --tags`), triggering the release workflow.
- `syft` is installed or available as a GitHub Action for SBOM generation.

**Steps**:

1. The release workflow `.github/workflows/release.yml` triggers on the tag push.
2. Assert the workflow builds the matrix:
   - `marksync-linux-x64` (amd64)
   - `marksync-linux-arm64` (if available; else x64-only per DEC-3)
   - `marksync-win-x64.exe` (amd64)
3. Assert the workflow generates `SHA256SUMS` with one hash per binary (portable basenames).
4. Assert the workflow generates an SBOM via `syft` (CycloneDX format).
5. Assert the workflow attaches the following artifacts to the GitHub Release:
   - Binaries: `marksync-linux-x64`, `marksync-linux-arm64` (if produced), `marksync-win-x64.exe`
   - `SHA256SUMS` (one file)
   - SBOM (one file, e.g., `marksync-sbom.cyclonedx.json`)
6. Assert **macOS is NOT produced** (deferred to MS-0003 per DEC-8).
7. Verify the downloaded artifacts by re-running `sha256sum -c SHA256SUMS` (manually or via automation).

**Expected Outcome**:

- All expected binaries attached to the GitHub Release.
- `SHA256SUMS` present and valid.
- SBOM present (CycloneDX format).
- macOS NOT produced.
- → **AC-COMP-1 and AC-REL-1 satisfied**.

**Evidence captured**: Release workflow logs; GitHub Release artifact list; downloaded artifacts (for checksum verification).

**Pass/Fail criteria**: PASS iff all expected artifacts are present (binaries + SHA256SUMS + SBOM), checksums are valid, and macOS is NOT produced. If the artifact set is incomplete/incorrect → FAIL (RSK-6). If arm64 is unavailable → ship x64-only per DEC-3; record arm64 as MS-0003; do not block.

**Notes / Clarifications**: This TC validates the end-to-end release assembly. The SBOM satisfies NFR-SEC-4 (supply-chain baseline). The SHA256SUMS satisfy NFR-CHK-1. The matrix correctness (Linux amd64+arm64, Windows amd64; macOS NOT produced) satisfies NFR-COMP-1.

---

#### TC-SIGN-001 - Signing reference document presence (osslsigncode recipe documented)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-SIGN-1, DEC-7 (real signing OUT)
**Test Type(s)**: E2E (release)
**Automation Level**: Manual (documentation verification)
**Target Layer / Location**: Documentation (e.g., `doc/guides/` or `doc/ops/`) or in-code reference in `scripts/build-binaries.sh`
**Tags**: @release, @signing, @windows, @authenticode, @documentation

**Preconditions**:

- The validated `osslsigncode` recipe exists at `spikes/bun-compile-smoke/probes/signing-dry-run.md`.
- The refined `scripts/build-binaries.sh` carries a signing marker pointing at that recipe.

**Steps**:

1. Locate the signing reference document (either in `doc/guides/`, `doc/ops/`, or as a well-commented section in `scripts/build-binaries.sh`).
2. Assert the document contains:
   - The exact `osslsigncode sign` command with placeholder cert inputs (e.g., `-pkcs12 /path/to/authenticode.p12` or `-certs`/`-key` forms).
   - The `-pass` argument using the **env-var name only** (`$CERT_PASSWORD`), never a literal value.
   - The timestamp URL (`-t <timestamp-url>`).
   - The hash algorithm (`-h sha256`).
   - The input binary and signed output paths.
3. Assert the document identifies the cert/Authenticode plug-in point (where a real production cert material plugs in).
4. Assert the document includes the explicit caveat: **real production signing is OUT of MS-0002** (dry-run/documented command only per DEC-7).
5. Assert the document notes: **macOS notarization is OUT of scope** (deferred to MS-0003).

**Expected Outcome**:

- A concrete, copy-pasteable `osslsigncode` sign command documented (with cert/pkey placeholders + timestamp URL + hash algorithm).
- The cert/Authenticode plug-in point identified.
- The env-var name `$CERT_PASSWORD` used (no literal password).
- The real-signing-OUT and macOS-notarization-OUT caveats recorded.
- → **AC-SIGN-1 satisfied**.

**Evidence captured**: The signing reference document itself (the entire document is evidence).

**Pass/Fail criteria**: PASS iff the document contains the concrete sign command with all required elements, the cert plug-in point, the env-var name only (no literal), and the out-of-scope caveats. No execution is required (DEC-7).

**Notes / Clarifications**: This TC validates that the signing story is documented as a feasible reference for MS-0003+. The actual production signing occurs in MS-0003+ with a real cert wired through CI secrets. The reference uses the env-var **name** only, never a literal value, ensuring secret hygiene (AC-SEC-1).

---

#### TC-CI-001 - `bun run check` green (no src/ domain regression introduced)

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-CI-1, story test matrix
**Test Type(s)**: E2E (release) — existing suite
**Automation Level**: Automated
**Target Layer / Location**: `.github/workflows/ci.yml` (fast-loop job), existing test suite
**Tags**: @release, @ci, @regression, @quality-gate

**Preconditions**:

- The implementation is complete (build script refined, CI smoke jobs added, release workflow added).
- No `src/` domain-logic change has been introduced (per spec G-7 and NG-8).

**Steps**:

1. CI runs the fast-loop job: `bun run check`.
2. Assert the following commands all exit **0**:
   - `bun run lint`
   - `bun run typecheck`
   - `bun test tests/unit/ tests/integration/ tests/golden/`
   - `bun run test:bdd`
   - `bun run check:boundaries`
3. Review the test coverage report (if any) — coverage should not decrease.
4. Verify that no new test failures or regressions are introduced.

**Expected Outcome**:

- All `bun run check` steps exit 0.
- No test regressions compared to baseline.
- → **AC-CI-1 satisfied** (regression guard; existing suite passes unchanged).

**Evidence captured**: CI fast-loop logs (exit status, test results).

**Pass/Fail criteria**: PASS iff all `bun run check` steps exit 0. If any step fails → AC-CI-1 FAIL; regression introduced; must be remediated before story completion.

**Notes / Clarifications**: This TC is a regression guard. Since this story introduces no `src/` domain logic (build/CI/release engineering only), the existing test suite should pass unchanged. This ensures that no unintended `src/` changes slipped in. The existing suite already validates INV-SAFE-1/2/3, INV-SEC-1, A-FEA-5, and other lifecycle invariants — this TC confirms those guards still pass.

---

#### TC-SEC-001 - Secret hygiene scan (0 secrets in committed artifacts)

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-SEC-1, NFR-SEC-1, INV-SEC-1, RSK-8
**Test Type(s)**: E2E (release) — security scan
**Automation Level**: Semi-automated (scan + human review before commit)
**Target Layer / Location**: `scripts/`, `.github/workflows/`, `.benchmarks/`, signing reference
**Tags**: @release, @security, @secrets, @hygiene

**Preconditions**:

- All artifacts are staged for commit (scripts, workflows, `.benchmarks/`, signing reference).
- No real secrets are expected (signing is reference-only; CI secrets are not committed).

**Steps**:

1. Run a secret scan across committed artifacts (`scripts/`, `.github/workflows/`, `.benchmarks/`, any signing reference documentation). Prefer `gitleaks` if available; else a grep/`rg` scan for common secret patterns: API tokens, `Bearer `, `xoxb-`, `AKIA` AWS prefixes, private-key headers (`-----BEGIN ... PRIVATE KEY-----`), high-entropy base64 blobs, and any `MARKSYNC_*` credential env-var **values** (keys/names are fine; values must be absent).
2. Confirm that the signing reference uses `$CERT_PASSWORD` as an env-var **name** only, never a literal value.
3. Confirm that no placeholder cert paths contain real cert data.
4. Confirm that 0 secrets are detected.
5. Document the scan result: "Secrets scan: 0 secrets in committed artifacts (reviewed <date>; tool: <gitleaks|rg>)."

**Expected Outcome**:

- 0 secrets in any committed artifact.
- The signing reference uses `$CERT_PASSWORD` as an env-var name only (no literal password).
- → **AC-SEC-1 satisfied**.

**Evidence captured**: Secrets-scan result (0 findings) + documented verification in release notes or similar.

**Pass/Fail criteria**: PASS iff 0 secrets detected in committed artifacts. Any finding must be remediated before commit (redact / gitignore) and re-scanned. If a literal password or cert value is found → FAIL (RSK-8).

**Notes / Clarifications**: This TC ensures secret hygiene by construction. Because real signing is OUT of scope (DEC-7), the signing reference contains only placeholder paths and the env-var name `$CERT_PASSWORD`. No real secrets are expected. This aligns with NFR-SEC-1 and INV-SEC-1 (no secrets in any production output path). The spike's TC-BCS-SEC provides a precedent for a light scan.

---

## 6. Environments and Test Data

**Environment:**

- **CI runners:**
  - `ubuntu-latest` for linux builds, linux-arm64 cross-compile, clean-OS linux smoke (Docker `debian:stable-slim`).
  - `windows-latest` for win-x64 smoke (TC-RUN-002).
- **Runtime / build tool:** Bun **1.2.23** (pinned — DEC-1; matches `package.json#engines.bun` + `ci.yml`).
- **Clean-OS images:**
  - `debian:stable-slim` (primary — glibc) for linux-x64 smoke. **Critical:** NOT `debian:slim` (which is not a published tag — DEC-2).
  - No `alpine` smoke in this story (out of scope per spec NG-8; spike TC-BCS-004 recorded the musl/glibc note as non-blocking).
- **Release trigger:** GitHub tag push (e.g., `v0.7.0`) triggers `.github/workflows/release.yml`.
- **Network:** minimal. The build and smoke tests run locally within CI runners and Docker containers. The release workflow attaches artifacts to GitHub Releases via the GitHub API (platform infra). No outbound telemetry (NFR-SEC-3).

**Test data generation & cleanup:**

- All inputs are the **real CLI** (`src/cli/index.ts`) and the compiled binaries. No synthetic test data or user/Confluence data is used (this is build/CI/release engineering only).
- The `.benchmarks/binaries.json` file is a new, commit-tracked regression baseline seeded on first measurement.
- Build outputs in `dist/` are gitignored and ephemeral (not committed).
- Release artifacts are attached to GitHub Releases and are not committed to the repo.

**Measurement conventions (carry-forward from GH-13 — reproducibility):**

- **Binary size:** recorded in **bytes** (via `stat -c %s`), then converted to **MB using 1 MB = 1,048,576 bytes (binary)**. Compared to the **≤90 MB desired** budget (NFR-PERF-1).
- **Cold-start:** defined as **wall-clock time of the first invocation of a fresh process** for `./dist/marksync-linux-x64 --version` on the clean-OS Linux container (`debian:stable-slim`). Run n=5 repeats; record min/median/max. Compared to the **≤2 s desired** budget (NFR-PERF-2).
- **Reproducibility metadata:** the build records the **Bun version** (1.2.23, DEC-1) and the **Docker image digest** for `debian:stable-slim` so the result can be reproduced.

**Isolation:**

- The build and smoke tests run in isolated CI jobs (`ubuntu-latest`, `windows-latest`). The linux clean-OS smoke runs inside an isolated Docker container (`debian:stable-slim`).
- No external systems (Confluence, etc.) are touched — this is pure build/CI/release engineering.

## 7. Automation Plan and Implementation Mapping

| TC ID | Implementation artifact / location | Execution command | Mocking | Status |
|-------|------------------------------------|-------------------|---------|--------|
| TC-BUILD-001 | `.github/workflows/ci.yml` (build job), `.github/workflows/release.yml` (release matrix), `scripts/build-binaries.sh` | CI: `scripts/build-binaries.sh --target all --entry src/cli/index.ts` + `bun --version` check + `file` checks + `--version` checks | None (real `bun build --compile`) | To implement |
| TC-RUN-001 | `.github/workflows/ci.yml` (clean-OS linux smoke job) | CI: `docker run --rm debian:stable-slim command -v bun node deno` + `docker run --rm -v ... debian:stable-slim ./dist/marksync-linux-x64 --version` + `doctor --json` | None (real Docker container, real binary) | To implement |
| TC-RUN-002 | `.github/workflows/ci.yml` (windows smoke job) | CI on `windows-latest`: `.\dist\marksync-win-x64.exe --version` | None (real Windows runner, real binary) | To implement |
| TC-SIZE-001 | `.github/workflows/ci.yml` (build job), `.benchmarks/binaries.json` | CI: `stat -c %s` per binary → convert to MB → update `.benchmarks/binaries.json` → commit | None (real measurement) | To implement |
| TC-START-001 | `.github/workflows/ci.yml` (build job), Docker `debian:stable-slim`, `.benchmarks/binaries.json` | CI: `docker run ... debian:stable-slim /usr/bin/time -v ./dist/marksync-linux-x64 --version` (×n) → record wall-clock + RSS → update `.benchmarks/binaries.json` → commit | None (real measurement) | To implement |
| TC-REL-001 | `.github/workflows/release.yml` (tag-triggered), GitHub Release artifacts | On tag push: build matrix → generate `SHA256SUMS` → generate SBOM (`syft`/CycloneDX) → attach to GitHub Release → verify checksums | None (real GitHub Release API) | To implement |
| TC-SIGN-001 | Documentation (`doc/guides/` or `doc/ops/`) or in-code reference in `scripts/build-binaries.sh` | Manual verification: document contains `osslsigncode` sign command + cert plug-in point + env-var name only + out-of-scope caveats | None (documentation verification) | To implement |
| TC-CI-001 | `.github/workflows/ci.yml` (fast-loop job), existing test suite | CI: `bun run check` (lint, typecheck, test, test:bdd, check:boundaries) | None (existing suite) | To implement (regression guard) |
| TC-SEC-001 | Scripts/workflows/benchmarks/signing-ref files | `gitleaks detect` (if available) or `rg '<pattern>' scripts/ .github/workflows/ .benchmarks/ <signing-ref>` | None (scan) | To implement (light) |

**Shared infrastructure to create or refine:**

- `scripts/build-binaries.sh` — refined from GH-13 skeleton: entry repointed to `src/cli/index.ts`; version embedded from `package.json`; `linux-arm64` target added per CEO R1; `SHA256SUMS` accumulator retained; signing marker retained (points at spike recipe).
- `.benchmarks/binaries.json` — new commit-tracked file; schema records per-target size (bytes) + linux-x64 cold-start (wall-clock, n-samples, min/median/max).
- `.github/workflows/ci.yml` — new clean-OS smoke jobs (linux Docker + windows runner) added to existing fast-loop matrix.
- `.github/workflows/release.yml` — new tag-triggered workflow; matrix build + `SHA256SUMS` + SBOM generation + artifact attachment to GitHub Release.
- Signing reference document — new or existing documentation (e.g., `doc/guides/` or `doc/ops/`) with the validated `osslsigncode` recipe; or a well-commented section in `scripts/build-binaries.sh`.

**Not implemented by this story (downstream):**

- **macOS target + notarization** — MS-0003 (per DEC-8).
- **Real production code-signing** with a provisioned cert wired through CI secrets — MS-0003+.
- **arm64 hardening as a gate** — MS-0003+ (recorded as MS-0003 if unavailable in this story per DEC-3).

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Release workflow pins the spike's Bun 1.1.34 instead of project pin 1.2.23** (RSK-1) | High (produces unreproducible binaries) | Encode **1.2.23** as the single release pin matching `package.json#engines.bun` + `ci.yml` (DEC-1); TC-BUILD-001 asserts `bun --version` reports 1.2.23. |
| **`linux-arm64` target unavailable in the pinned Bun** (RSK-2) | Low | Include arm64 per CEO R1; if unavailable, TC-BUILD-001 records arm64 as MS-0003 and ships x64-only for MS-0002 — do not block (DEC-3). |
| **Binary > 90 MB or cold-start > 2 s** (RSK-3) | Low (accepted) | Both are **"desired, not hard"** (DEC-4; PR #4). TC-SIZE-001/TC-START-001 **record + flag**, never block. Baseline: linux 96.90 MB, win 105.12 MB; cold-start median 0.010 s. |
| **`debian:slim` tag mismatch breaks the smoke job** (RSK-4) | Medium | Use `debian:stable-slim` (spike-verified; DEC-2). TC-RUN-001 explicitly uses `debian:stable-slim`. |
| **win-x64.exe run is flaky on the hosted Windows runner** (RSK-5) | Medium | Use a real `windows-latest` runner with `--version` only (minimal surface). Record intermittent failures rather than gating flakily. |
| **Release attaches an incomplete/incorrect artifact set** (RSK-6) | Medium | Matrix is exhaustive; `SHA256SUMS` regenerated per build; TC-REL-001 asserts artifact presence; SBOM generation required. |
| **Version not embedded — binary reports stale value** (RSK-7) | Low | TC-BUILD-001 asserts each binary's `--version` matches `package.json#version` (DM-3). |
| **A committed artifact leaks a signing secret** (RSK-8) | High | TC-SEC-001 scans all committed artifacts; signing reference uses `$CERT_PASSWORD` env-var name only (never a literal). |

### 8.2 Assumptions

- The GH-13 spike findings are accurate and current (H1–H5 PASS; sizes, cold-start, arm64 targets valid) — this story consumes them, not re-derives them.
- The cross-compile targets (`bun-linux-x64`, `bun-linux-arm64`, `bun-windows-x64`) remain valid in the project-pinned Bun **1.2.23** (targets are stable across versions; TC-BCS-008 confirmed them in 1.1.34).
- `debian:stable-slim` remains the canonical clean-OS linux image (spike-verified; `debian:slim` is not published).
- The real CLI entry `src/cli/index.ts` (GH-14) is a valid `bun build --compile` entry that produces a working `--version` (and `doctor --json`) without src/ changes.
- NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s) are **"desired, not hard"** (PR #4; `doc/spec/nonfunctional.md`) — exceedance is recorded + flagged, never blocking for MS-0002 (DEC-4).
- Documenting the `osslsigncode` recipe (without executing it) is sufficient to satisfy AC-SIGN-1; a real cert is not required (DEC-7).
- `syft` can emit CycloneDX SBOM format for SBOM generation (NFR-SEC-4).
- The existing `bun run check` suite passes before this story starts (regression guard baseline).

### 8.3 Open Questions

| ID | Question | Status | Owner |
|----|----------|--------|-------|
| OQ-1 | `syft` vs `cyclonedx-cli` as the SBOM generator, and the exact SBOM output format | Minor — resolve at delivery (prefer `syft` emitting CycloneDX) | Implementer / `@decision-advisor` if format dispute |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | test-plan-writer (GH-32) | Initial test plan. Defined 10 E2E release-tier test cases (TC-BUILD-001, TC-RUN-001/002, TC-SIZE-001, TC-START-001, TC-REL-001, TC-SIGN-001, TC-CI-001, TC-SEC-001). AC→TC traceability matrix complete (all 10 ACs fully traced). Build on GH-13 precedent: cross-compile patterns (TC-BCS-001/002/008), clean-OS linux pattern (TC-BCS-003), size/cold-start patterns (TC-BCS-005/006). Explicitly use Bun 1.2.23 (not spike's 1.1.34 — DEC-1). Explicitly use `debian:stable-slim` (not `debian:slim` — DEC-2). Close spike DEC-3 with real Windows runner smoke (TC-RUN-002). Release artifact assembly (TC-REL-001) includes binaries + SHA256SUMS + SBOM. Secret hygiene (TC-SEC-001) ensures 0 secrets; signing reference uses `$CERT_PASSWORD` env-var name only. Regression guard (TC-CI-001) ensures `bun run check` green. |

## 10. Test Execution Log

> Populated during story execution (lifecycle phase 6 — delivery). The tests run in CI (per-push clean-OS smoke jobs; release workflow on tag).

| TC ID | Run Date | Result | Evidence pointer | Notes |
|-------|----------|--------|------------------|-------|
| TC-BUILD-001 | _(pending)_ | — | CI build logs (exit 0, bun version, file output, --version output) | Cross-compile success with Bun 1.2.23 |
| TC-RUN-001 | _(pending)_ | — | CI docker-run logs (debian:stable-slim) | Clean-OS linux smoke |
| TC-RUN-002 | _(pending)_ | — | CI windows-latest runner logs | Clean-OS windows smoke (closes DEC-3) |
| TC-SIZE-001 | _(pending)_ | — | `.benchmarks/binaries.json`; CI delta-reporter logs | Size measurement (bytes + MB) |
| TC-START-001 | _(pending)_ | — | `.benchmarks/binaries.json`; CI delta-reporter logs | Cold-start measurement (wall-clock) |
| TC-REL-001 | _(pending)_ | — | Release workflow logs; GitHub Release artifact list | Artifact assembly (binaries + SHA256SUMS + SBOM) |
| TC-SIGN-001 | _(pending)_ | — | Signing reference document (e.g., `doc/guides/` or `scripts/build-binaries.sh`) | osslsigncode recipe documented |
| TC-CI-001 | _(pending)_ | — | CI fast-loop logs (bun run check exit 0) | Regression guard (existing suite green) |
| TC-SEC-001 | _(pending)_ | — | Secrets-scan result (0 findings) | Secret hygiene (0 secrets in committed artifacts) |