---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-13-test-plan
status: Proposed
created: 2026-07-06T19:59:37Z
last_updated: 2026-07-06T19:59:37Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [spike, ms-0002, adr-0001-validation, bun-compile]
version_impact: none
summary: "Validation plan for the MS2-E1-S3 Bun single-binary cross-compile smoke spike. The 'tests' are spike-validation probes (linux-x64 + win-x64 cross-compile, clean-OS Linux Docker run, size + cold-start measurement, osslsigncode signing dry-run, arm64 stretch, findings-doc, secrets scan) that run the REAL bun build --compile and the REAL clean-OS Docker runs, producing evidence for findings/bun-compile-smoke-findings.md and de-risking ADR-0001's C-2/C-3 distribution promise before MS2-E5-S4."
links:
  change_spec: ./chg-GH-13-spec.md
  implementation_plan: ./chg-GH-13-plan.md   # pending — authored in lifecycle phase 4 (delivery_planning)
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E1-S3] Bun single-binary cross-compile smoke

## 1. Scope and Objectives

This is a **load-bearing spike**, not a feature delivery. The behaviour to protect is the
**architectural claim** in ADR-0001 — **C-2** (a single self-contained binary per OS+arch with **no
mandatory language runtime** for end users) and **C-3** (cross-platform compilation) — that
`bun build --compile` actually produces a **runnable** single binary for clean Linux + Windows within
the MS-0002 "desired, not hard" budget (≤90 MB, ≤2 s cold-start). The integrity risks are: (a) the
cross-compile target set is asserted-but-unproven (UNCERT-2) — a win-x64 rename/unavailability would
force a Windows CI-runner fallback for MS2-E5-S4; (b) the "no mandatory runtime" guarantee
(NFR-COMP-2) is empirical-claim-only — the binary may not run on a truly clean OS; (c) size and
cold-start are unmeasured, so E5-S4's release budgets have no baseline; (d) the Windows
code-signing story is an open ADR-0001 Unresolved Question (enterprise trust bar).

Because this is a spike, the "tests" are **spike-validation probes** — shell commands orchestrated by
a runner script (`spikes/bun-compile-smoke/run-probes.sh`, created by the coder) run **locally**
inside the standalone spike workspace (`spikes/bun-compile-smoke/`) that produce **evidence** for a
findings document. They are **not** one of the six production test tiers and they are **not** wired
into the project test runner or CI (CI wiring for the cross-compile matrix is MS2-E5-S4's job, not
this spike's). Each probe maps to one or more hypotheses (H1–H5) and acceptance criteria (AC1–AC7)
from the change specification. The spike's deliverable is the **findings + evidence + a
recommendation + a reusable build-script skeleton**; on PASS, the `scripts/build-binaries.sh`
skeleton and the recorded measurement conventions are left for MS2-E5-S4.

### 1.1 In Scope

- Nine spike-validation probes (one TC per probe), executed **locally** via the runner script in
  `spikes/bun-compile-smoke/`:
  1. linux-x64 cross-compile → AC1 / H1
  2. win-x64 cross-compile (+ PE32+ `file` verification + Windows-runtime deferral) → AC1 / H1
  3. clean-OS Linux run (`debian:slim`) → AC2 / H2
  4. clean-OS Linux run (`alpine`, stretch — musl/glibc note) → AC2 / H2
  5. size measurement → AC3 / H3
  6. cold-start measurement → AC4 / H4
  7. `osslsigncode` signing dry-run documentation → AC5 / H5
  8. arm64 stretch (informational — does `--target=bun-linux-arm64` / `bun-darwin-arm64` exist?) →
     spec NG-2 stretch (not gated)
  9. findings-document presence → AC6 (NFR-EVID-1)
- One cross-cutting hygiene probe: secrets scan → AC7 (NFR-SEC-2).
- The committed deliverables: `spikes/bun-compile-smoke/` (minimal smoke CLI + own `package.json`;
  `node_modules` and ephemeral build outputs — incl. the ~90 MB binaries — gitignored),
  `findings/bun-compile-smoke-findings.md`, and `scripts/build-binaries.sh` (skeleton for E5-S4).
- Measurement/normalization **conventions**, recorded explicitly for MS2-E5-S4 reuse (see §6).

### 1.2 Out of Scope & Known Gaps

- **The cross-platform binary build pipeline (CI matrix).** This spike runs **locally** — no wiring
  into `.github/workflows/ci.yml` or `.github/workflows/run-e2e.yml`. The production release matrix
  is MS2-E5-S4, which this spike unblocks. (Explicitly noted so the plan-writer / coder do not
  attempt CI integration.)
- **The clean-OS Windows runtime smoke.** `wine` is **not installed** in this environment (DEC-3), so
  the win-x64 binary is **produced + verified as a valid PE32+ executable** (TC-BCS-002), but the
  Windows *run* is **deferred to a Windows CI runner in MS2-E5-S4** (the story's explicitly-allowed
  step-5 fallback). This deferral is recorded in the findings; it is a precondition, not a blocker.
- **The main `src/` tree** — explicitly untouched (spec NG-5). The spike lives entirely under
  `spikes/bun-compile-smoke/` with its own `package.json`.
- **The real CLI feature set** — this is a **smoke binary** that prints `marksync 0.0.0`, not the
  production CLI (spec NG-3).
- **macOS target** — deferred to MS-0003 per NFR-COMP-1 (spec NG-1).
- **arm64 as a gate** — stretch only (spec NG-2): record whether the targets exist; do not block.
- **Real production code-signing** with a real Authenticode cert — dry-run command only (DEC-4);
  `osslsigncode` is **not installed** here. macOS notarization is out of scope entirely.
- **Any ADR-0001 mutation** — the spike only *enables* a later (lifecycle phase 7) cross-compile
  verification pointer / signing-evidence update; no ADR is mutated here (spec NG-6).
- **The anti-over-mocking guardrail** (`.ai/rules/testing-strategy.md` §"AI-agent over-mocking
  guardrail") **does not apply** to this spike: there are no mocks — the probes run the **real**
  `bun build --compile`, the **real** clean-OS Docker runs, and the **real** `file`(1) / `ls` /
  `/usr/bin/time` measurements. (Secret hygiene, NFR-SEC-2, **does** still apply.)

## 2. References

| Reference | Path | Role |
|---|---|---|
| Change specification | `./chg-GH-13-spec.md` | Primary input; AC1–AC7, F-1…F-7, NFR-CC/RUN/SIZE/START/SIGN/EVID/SEC, H1–H5, DEC-1…DEC-5, RSK-1…RSK-6 |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md` | Methodology (8 exact steps), hypotheses, AC checklist, CEO-resolved R1/R2 |
| Implementation plan | `./chg-GH-13-plan.md` | **Pending** — authored in lifecycle phase 4 (delivery_planning); derived from this test plan |
| Testing strategy | `.ai/rules/testing-strategy.md` | 6 production tiers; product-perf scenarios (binary size, cold-start); over-mocking guardrail (does NOT apply to this spike — see §1.2) |
| ADR-0001 | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | C-2 (single binary, no runtime) + C-3 (cross-platform) this spike validates; cross-compile revisit trigger; signing Unresolved Question |
| NFRs | `doc/spec/nonfunctional.md` | NFR-PERF-1 (≤90 MB desired), NFR-PERF-2 (≤2 s cold-start desired), NFR-COMP-1 (MS-0002 = Linux+Windows), NFR-COMP-2 (clean-OS run, no runtime) |
| GH-11 test plan (precedent) | `doc/changes/2026-07/2026-07-06--GH-11--mermaid-render-spike/chg-GH-11-test-plan.md` | Structural template (probe-based spike plan; AC→probe→fixture→evidence traceability) |

## 3. Coverage Overview

> The spike has **no interfaces** (no REST/HTTP, no events, no production data model — spec §8.1–8.3).
> Therefore §3.2 (Interface Coverage) is N/A and all traceability flows through Functional (§3.1) and
> Non-Functional (§3.3) coverage.

### 3.1 Functional Coverage (F-#, AC-#)

**AC → Probe → Hypothesis → Evidence traceability matrix.** Every AC1–AC7 maps to ≥1 probe.

| AC ID | Hypothesis | Probe (TC ID) | Input / artifact | Expected evidence path |
|-------|------------|---------------|------------------|------------------------|
| **AC1** | H1 — cross-compile | TC-BCS-001 (linux-x64) + TC-BCS-002 (win-x64) | minimal `src/cli.ts` printing `marksync 0.0.0`; pinned Bun 1.1.34 | `findings/bun-compile-smoke-findings.md#H1`; build logs (exit 0) + `file`(1) output (ELF executable; PE32+ executable) |
| **AC2** | H2 — clean-OS run | TC-BCS-003 (`debian:slim`) + TC-BCS-004 (`alpine`, stretch) | `marksync-linux-x64` binary; clean-OS Docker images (no Bun/Node) | `findings/...#H2`; `docker run` logs (exit 0 + version string) + `which bun node` (empty) output |
| **AC3** | H3 — size | TC-BCS-005 | both produced binaries | `findings/...#H3`; size table (bytes + MB) in findings, compared to ≤90 MB desired |
| **AC4** | H4 — cold-start | TC-BCS-006 | `marksync-linux-x64` on clean OS | `findings/...#H4`; `/usr/bin/time -v` output table (wall-clock + max RSS), compared to ≤2 s desired |
| **AC5** | H5 — signing story | TC-BCS-007 | reference `osslsigncode` command (no real cert) | `findings/...#H5`; documented command block (sign / verify / extract-signature) + cert/Authenticode plug-in point |
| **AC6** | — Findings doc | TC-BCS-EVID | (none — deliverable artifact) | `findings/bun-compile-smoke-findings.md` (explicit PASS/FAIL per H1–H5 + one clear MS-0002/E5-S4 recommendation) |
| **AC7** | — Secret hygiene | TC-BCS-SEC | (all committed spike artifacts) | `findings/...` secrets-hygiene note; secrets-scan result (0 secrets) |

**Per-AC coverage status:**

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC1 | 2/2 targets (`bun-linux-x64`, `bun-windows-x64`) compile from the Linux dev host (exit 0) and produce their binaries | TC-BCS-001, TC-BCS-002 | To implement (probe) |
| AC2 | linux-x64 binary runs on clean `debian:slim` (and/or `alpine`) with no Bun/Node, exits 0, prints version | TC-BCS-003 (+ TC-BCS-004 stretch) | To implement (probe) |
| AC3 | Binary size recorded (≤90 MB desired; flagged if larger, NOT blocking) | TC-BCS-005 | To implement (probe) |
| AC4 | Cold-start recorded (≤2 s desired; documented if longer, NOT blocking) | TC-BCS-006 | To implement (probe) |
| AC5 | Concrete `osslsigncode` dry-run command documented + cert/Authenticode plug-in point | TC-BCS-007 | To implement (documentation probe) |
| AC6 | Findings doc with explicit PASS/FAIL per H1–H5 + single clear MS-0002/E5-S4 recommendation | TC-BCS-EVID | To implement (check + manual verdict authoring) |
| AC7 | Zero secrets in any committed artifact | TC-BCS-SEC | To implement (scan + documented review) |

> **All seven ACs are fully traced.** No AC is left as a TODO. The arm64 stretch probe
> (TC-BCS-008) is informational (spec NG-2) and does not gate any AC.

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

**N/A.** The spike exposes no REST/HTTP surface (spec §8.1), emits no events (§8.2), and introduces no
production data model (§8.3). It makes **no outbound network calls** (privacy default preserved —
spec §20: the spike runs entirely locally; no source, credentials, or build artifacts leave the
operator's environment). The smoke binary, findings document, and build-script skeleton are spike
artifacts only, not production contracts.

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID (spec §9) | Requirement | Probe (TC ID) | Canonical NFR trace | Evidence path |
|--------|-------------|---------------|----------------------|---------------|
| NFR-CC-1 | 2/2 targets compile from the Linux dev host | TC-BCS-001, TC-BCS-002 | ADR-0001 C-3; NFR-COMP-1 (Linux+Windows slice) | `findings/...#H1`; build logs + `file` output |
| NFR-RUN-1 | Clean-OS Linux runtime, no language runtime | TC-BCS-003 (+ TC-BCS-004 stretch) | ADR-0001 C-2; NFR-COMP-2 | `findings/...#H2`; docker-run logs + `which` output |
| NFR-SIZE-1 | Size recorded against the desired budget (≤90 MB; flagged, NOT blocking) | TC-BCS-005 | NFR-PERF-1 | `findings/...#H3`; size table |
| NFR-START-1 | Cold-start recorded against the desired budget (≤2 s; documented, NOT blocking) | TC-BCS-006 | NFR-PERF-2 | `findings/...#H4`; time output table |
| NFR-SIGN-1 | Signing story documented | TC-BCS-007 | ADR-0001 signing Unresolved Question | `findings/...#H5`; documented command block |
| NFR-EVID-1 | Explicit PASS/FAIL per H1–H5 + one clear MS-0002/E5-S4 recommendation | TC-BCS-EVID | — | `findings/bun-compile-smoke-findings.md` (whole document) |
| NFR-SEC-2 | 0 secrets in any committed artifact | TC-BCS-SEC | NFR-SEC-2 (redaction by construction) | secrets-scan result; `findings/...` secret-hygiene note |

## 4. Test Types and Layers

> **Critical framing:** These are **spike-validation probes**, NOT production tests.

Per `.ai/rules/testing-strategy.md`, the repository defines **six production test tiers**: Unit,
Integration, Golden-fixture, Mermaid-DOM, Gherkin/BDD, and E2E (live-sandbox). The spike's probes are
**none of these**. They are shell commands (orchestrated by a runner script) that produce **evidence
for a findings document**, run via `bun`/`docker`/`file`/`ls`/`time` directly on the host and inside
clean-OS containers — **not** `bun test` (the test runner), and **not** wired into the project test
runner or CI.

The relationship is directional:

- This spike **validates whether the cross-compile single-binary mechanism is even viable** (i.e.,
  whether `bun build --compile --target=…` produces a runnable binary on a clean OS within budget).
  It is a precondition gate for the release matrix, not the matrix itself.
- **If the spike PASSES**, MS2-E5-S4 builds the real **cross-platform binary build pipeline**
  (CI release matrix, checksums, SBOM, signing) starting from the committed
  `scripts/build-binaries.sh` skeleton and the recorded measurement conventions (§6). A production
  **performance-test suite** (`.ai/rules/testing-strategy.md` §"Product performance scenarios") is
  deferred to MS-0003+; the size/cold-start numbers recorded here become the baseline.
- **If the spike FAILS** on H1 (win-x64 unavailable), MS2-E5-S4 falls back to a **Windows CI runner
  build** (story R1; spec RSK-1) — linux-x64 production and the signing story remain validated. On
  **catastrophic** cross-compile failure (no runnable binary path at all), the spike escalates to
  ADR-0001 language-level reconsideration (spec RSK-6); the team does **not** silently proceed.

| Aspect | Value for this spike |
|---|---|
| Runner | Shell commands orchestrated by `spikes/bun-compile-smoke/run-probes.sh` — **not** `bun test` |
| Workspace | `spikes/bun-compile-smoke/` (standalone; own `package.json`; `node_modules` + ephemeral build outputs — incl. the ~90 MB binaries — gitignored) |
| Test type label | `Spike-validation probe` (custom — does not map to any of the 6 production tiers) |
| CI wiring | **None.** Runs locally; findings document is the committed deliverable. Do NOT add to `.github/workflows/`. |
| Tooling under test | `bun build --compile` (Bun **1.1.34**, pinned — DEC-2, matches GH-11), `file`(1), `ls`/`stat`, `/usr/bin/time -v`, Docker (27.3.1, daemon reachable), `debian:slim` / `alpine` images; `osslsigncode` reference-only (NOT installed — DEC-4) |

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-BCS-001 | linux-x64 cross-compile (exit 0 + ELF binary) | Happy Path | Critical | High | AC1 |
| TC-BCS-002 | win-x64 cross-compile (exit 0 + PE32+ binary; Windows RUN deferred) | Happy Path | Critical | High | AC1 |
| TC-BCS-003 | clean-OS Linux run — `debian:slim` (exit 0 + version, no runtime) | Corner Case | Critical | High | AC2 |
| TC-BCS-004 | clean-OS Linux run — `alpine` (stretch; musl/glibc note) | Corner Case | Important | Medium | AC2 (stretch) |
| TC-BCS-005 | size measurement (bytes + MB vs ≤90 MB desired) | Corner Case | Important | High | AC3 |
| TC-BCS-006 | cold-start measurement (wall-clock + RSS vs ≤2 s desired) | Corner Case | Important | High | AC4 |
| TC-BCS-007 | `osslsigncode` signing dry-run documentation | Happy Path | Important | Medium | AC5 |
| TC-BCS-008 | arm64 stretch (target availability; informational) | Edge Case | Minor | Low | (spec NG-2 stretch — not gated) |
| TC-BCS-EVID | findings-document presence (PASS/FAIL per H1–H5 + recommendation) | Happy Path | Critical | High | AC6 |
| TC-BCS-SEC | secrets scan (0 secrets in committed artifacts) | Negative | Important | Medium | AC7 |

### 5.2 Scenario Details

---

#### TC-BCS-001 - linux-x64 cross-compile (exit 0 + ELF binary)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-7, AC1, NFR-CC-1, H1
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`)
**Tags**: @spike, @bun-compile, @cross-compile, @linux

**Preconditions**:

- Bun **1.1.34** is the active runtime on the Linux dev host (DEC-2; matches the GH-11 pin); `bun --version` recorded in the findings.
- The minimal smoke CLI exists: `spikes/bun-compile-smoke/src/cli.ts` printing `marksync 0.0.0` (Cliffy `Command` if available, else plain `console.log`).
- The build host OS/arch is recorded (e.g. `uname -a`).

**Steps**:

1. From the spike workspace, invoke:
   `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64`
2. Assert the command exits **0** (capture the full build log).
3. Assert the output file `marksync-linux-x64` **exists** at the configured outfile path.
4. Run `file marksync-linux-x64` and assert it reports an **ELF executable** (the expected linux-x64 artifact type).
5. Record the build command, exit status, and `file` output as evidence.

**Expected Outcome**:

- Exit code **0**; `marksync-linux-x64` produced; `file` reports an ELF executable.
- → contributes to **H1 PASS** (one of two targets validated).

**Evidence captured** (path/format): build log (stdout+stderr + exit code) + `file` output, referenced from `findings/bun-compile-smoke-findings.md#H1`. The binary itself is an ephemeral build output and is **not** committed (its size is recorded by TC-BCS-005).

**Pass/Fail criteria**: PASS iff exit 0 **and** `marksync-linux-x64` exists **and** `file` reports ELF executable. Any failure → record the failure mode in findings; H1 cannot PASS until at least the linux-x64 path is green (catastrophic failure of both targets → spec RSK-6 escalation).

---

#### TC-BCS-002 - win-x64 cross-compile (exit 0 + PE32+ binary; Windows RUN deferred)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-5, F-7, AC1, NFR-CC-1, H1, DEC-3 (Windows-run deferral)
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`)
**Tags**: @spike, @bun-compile, @cross-compile, @windows, @signing

**Preconditions**:

- Bun **1.1.34** active; build host OS/arch recorded.
- The `--target=bun-windows-x64` target is **accepted** by the pinned Bun version (story R1: target naming/availability drifts across Bun versions; if unavailable, the findings record the fallback — spec RSK-1).
- **`wine` is NOT installed** (DEC-3) → the clean-OS Windows *run* is deferred to a Windows CI runner in MS2-E5-S4. This probe therefore validates **production + PE/Windows verification only**.

**Steps**:

1. From the spike workspace, invoke:
   `bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe`
2. Assert the command exits **0** (capture the build log).
3. Assert the output file `marksync-win-x64.exe` **exists**.
4. Run `file marksync-win-x64.exe` and assert it reports a **PE32+ executable (console) … for MS Windows** — i.e. the artifact is a valid Windows executable, satisfying the "produced + verified" bar for H1's win-x64 arm.
5. Record an **explicit deferral note**: "wine absent (DEC-3); clean-OS Windows runtime smoke deferred to a Windows CI runner in MS2-E5-S4. H1's win-x64 *production* is fully validated here; only the run is deferred."

**Expected Outcome**:

- Exit code **0**; `marksync-win-x64.exe` produced; `file` reports a PE32+ Windows executable.
- The Windows-runtime deferral is recorded in the findings (not a failure — the story's step-5 explicit fallback).
- → contributes to **H1 PASS** (both targets now validated; with the Windows *run* correctly deferred per DEC-3).

**Evidence captured**: build log + `file` output + explicit deferral note, referenced from `findings/...#H1` (with a cross-link to the DEC-3 deferral in §7.3 / outcomes).

**Pass/Fail criteria**: PASS iff exit 0 **and** `marksync-win-x64.exe` exists **and** `file` reports PE32+ executable. If `--target=bun-windows-x64` is **unavailable** in the pinned Bun → record the failure mode and document the **Windows CI runner build fallback** for E5-S4 (spec RSK-1); the linux-x64 path and signing story remain independently valid. The Windows *runtime* smoke is **never** a failure of this probe (it is deferred by design).

**Notes / Clarifications**: This probe deliberately scopes the win-x64 validation as "produce + verify the binary is a valid Windows executable" rather than "run it on Windows", because `wine` is absent (DEC-3). The findings must make this scoping unmistakable to downstream readers.

---

#### TC-BCS-003 - clean-OS Linux run — `debian:slim` (exit 0 + version, no runtime)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC2, NFR-RUN-1, H2
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`); clean-OS image `debian:slim`
**Tags**: @spike, @bun-compile, @clean-os, @docker, @debian

**Preconditions**:

- TC-BCS-001 has produced `marksync-linux-x64` (the **primary** clean-OS image per the story is `debian:slim` — glibc).
- Docker **27.3.1** is installed and the **daemon is reachable** (`docker info` succeeds).
- The `debian:slim` image is available (pull if needed); its **image digest** is recorded in the findings for reproducibility.

**Steps**:

1. Verify the container has **no** Bun/Node: `docker run --rm debian:slim sh -c 'which bun node; echo "exit=$?"'` — assert `which bun node` returns nothing (no runtime present).
2. Run the binary on the clean OS:
   `docker run --rm -v "$PWD":/x -w /x debian:slim ./marksync-linux-x64 --version`
3. Assert the command exits **0** **and** prints the version string (`marksync 0.0.0`).
4. Record the docker-run output (stdout/stderr + exit code), the `which` output, and the `debian:slim` image digest.

**Expected Outcome**:

- `which bun node` empty inside the container (no language runtime — NFR-COMP-2).
- `./marksync-linux-x64 --version` exits 0 and prints the version string.
- → **H2 PASS** (the no-runtime promise, ADR-0001 C-2, holds empirically).

**Evidence captured**: docker-run log (exit 0 + version) + `which` output + image digest, referenced from `findings/...#H2`.

**Pass/Fail criteria**: PASS iff exit 0 **and** version string printed **and** no Bun/Node in the image. If it fails → H2 FAIL; NFR-RUN-1 not met on the primary image; document the failure mode in findings (this is the load-bearing C-2 claim — a failure here is material and is surfaced for owner review per spec outcome matrix before E5-S4).

**Notes / Clarifications**: `debian:slim` (glibc) is the **primary** clean-OS image; NFR-RUN-1 is satisfied by `debian:slim` alone. `alpine` (musl) is a separate stretch probe (TC-BCS-004).

---

#### TC-BCS-004 - clean-OS Linux run — `alpine` (stretch; musl/glibc note)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2, AC2, NFR-RUN-1, H2, RSK-4 (musl/glibc)
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`); clean-OS image `alpine:latest`
**Tags**: @spike, @bun-compile, @clean-os, @docker, @alpine

**Preconditions**:

- TC-BCS-001 has produced `marksync-linux-x64`.
- Docker daemon reachable; `alpine:latest` available (pull if needed); image digest recorded.

**Steps**:

1. Verify no runtime: `docker run --rm alpine:latest sh -c 'which bun node; echo "exit=$?"'` (assert empty).
2. Attempt: `docker run --rm -v "$PWD":/x -w /x alpine:latest ./marksync-linux-x64 --version`
3. Record the result — PASS (exit 0 + version) **or** the exact **failure mode** (most likely a musl-vs-glibc dynamic-link error, since the Bun-compiled binary is glibc-linked).

**Expected Outcome**:

- Either: exit 0 + version string printed on `alpine` (best case — broader clean-OS coverage); **or** a recorded musl/glibc dynamic-link failure.
- Either outcome is acceptable: `debian:slim` is the **primary** clean-OS image and already satisfies NFR-RUN-1 (TC-BCS-003); `alpine` is informational stretch (spec RSK-4, NG-2).

**Evidence captured**: docker-run log (success or failure mode) + `which` output + image digest, referenced from `findings/...#H2` (alpine subsection).

**Pass/Fail criteria**: This probe is **non-blocking**: a musl/glibc failure is recorded + flagged, not a fail. (If `alpine` succeeds, note it as a bonus clean-OS coverage in findings.) H2 / NFR-RUN-1 are gated solely by TC-BCS-003 (`debian:slim`).

---

#### TC-BCS-005 - size measurement (bytes + MB vs ≤90 MB desired)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC3, NFR-SIZE-1, H3 (traces to NFR-PERF-1)
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`)
**Tags**: @spike, @bun-compile, @perf, @size

**Preconditions**:

- TC-BCS-001 and TC-BCS-002 have produced both binaries (`marksync-linux-x64`, `marksync-win-x64.exe`).
- The **measurement convention** is fixed (§6): size recorded in **bytes** (via `ls -la` or `stat -c %s`), then converted to **MB using 1 MB = 1,048,576 bytes (binary)** — the convention is stated explicitly so findings are reproducible.

**Steps**:

1. `ls -la marksync-linux-x64 marksync-win-x64.exe` (or `stat -c '%n %s' …`) to capture the size of each binary in **bytes**.
2. Convert each to MB (÷ 1,048,576) and record both bytes and MB in a findings table.
3. Compare each to the **≤90 MB desired** budget (NFR-PERF-1). Flag if larger.

**Expected Outcome**:

- Both sizes recorded (bytes + MB) in the findings size table.
- If a binary exceeds 90 MB, it is **recorded + flagged, NOT blocking** (DEC-5; PR #4 "larger acceptable if the job gets done"; story R2 — CEO waived NFR-PERF-1 as a hard gate).
- → **H3 PASS** when the actual sizes are recorded (the hypothesis is "record the actual size; flag if > 90 MB but still acceptable" — the *measurement* is the deliverable, not a threshold gate).

**Evidence captured**: size table (binary → bytes → MB → desired-budget delta) in `findings/...#H3`. This becomes the E5-S4 release-budget baseline.

**Pass/Fail criteria**: PASS iff both sizes are recorded (bytes + MB). Exceeding 90 MB is a **flag**, not a fail (DEC-5). This baseline is carried forward into E5-S4.

---

#### TC-BCS-006 - cold-start measurement (wall-clock + RSS vs ≤2 s desired)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-4, AC4, NFR-START-1, H4 (traces to NFR-PERF-2)
**Test Type(s)**: Spike-validation probe (performance measurement)
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`); measured on the **clean-OS Linux** container
**Tags**: @spike, @bun-compile, @perf, @cold-start

**Preconditions**:

- TC-BCS-001 has produced `marksync-linux-x64`; TC-BCS-003 confirms it runs on the clean OS.
- The **measurement convention** is fixed (§6): **cold-start = wall-clock time of the first invocation of a fresh process** for `./marksync-linux-x64 --version` on the clean OS. To approximate a true cold start, each measurement runs a **fresh process** (not a warm re-invocation); run a small number of repeats (e.g. 3–5) and record each, because a single sample is noisy.
- `/usr/bin/time -v` is available (GNU time) on the clean-OS image (install in the ephemeral container or measure via a wrapper); it captures both wall-clock and `Maximum resident set size`.

**Steps**:

1. On the clean-OS Linux container (e.g. `debian:slim`), run for each repeat `i`:
   `docker run --rm -v "$PWD":/x -w /x debian:slim /usr/bin/time -v ./marksync-linux-x64 --version`
   (If `/usr/bin/time` is absent in the slim image, install it ephemerally inside the container, or wrap with a Bash `time` + `/proc` RSS read — record which method was used.)
2. Capture, per repeat: **wall-clock time** (the cold-start) and `Maximum resident set size` (informational RSS).
3. Record the wall-clock values in a findings table; compare each to the **≤2 s desired** budget (NFR-PERF-2). Document if longer.
4. Report the recorded values (e.g. min/median of the repeats).

**Expected Outcome**:

- Wall-clock cold-start recorded (per repeat + summary) in the findings timing table; informational RSS recorded.
- If cold-start exceeds 2 s, it is **documented, NOT blocking** (DEC-5; PR #4; story R2).
- → **H4 PASS** when the actual cold-start is recorded (the *measurement* is the deliverable; the 2 s figure is "desired, not hard").

**Evidence captured**: `/usr/bin/time -v` output table (repeat → wall-clock → max RSS → desired-budget delta) in `findings/...#H4`.

**Pass/Fail criteria**: PASS iff the cold-start is recorded (wall-clock + RSS). Exceeding 2 s is **documented, not a fail** (DEC-5).

**Notes / Clarifications**: True cold-start isolation (page-cache eviction) is hard in a container; the probe records each value and the method, and notes that absolute cold-start numbers are directional, not a micro-optimization gate (consistent with `.ai/rules/testing-strategy.md` §"Product performance scenarios" design principle).

---

#### TC-BCS-007 - `osslsigncode` signing dry-run documentation

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-5, AC5, NFR-SIGN-1, H5 (closes the ADR-0001 signing Unresolved Question)
**Test Type(s)**: Spike-validation probe (documentation only — no execution)
**Automation Level**: Manual (authoring of the reference command block)
**Target Layer / Location**: `findings/bun-compile-smoke-findings.md#H5` (documented command block)
**Tags**: @spike, @bun-compile, @signing, @windows, @authenticode

**Preconditions**:

- TC-BCS-002 has produced `marksync-win-x64.exe` (the signing target — referenced by the documented command, not actually signed).
- **`osslsigncode` is NOT installed** in this environment (DEC-4) → this is a **documentation-only** probe: the exact command that *would* sign the binary is recorded as a reference string. No execution, no real cert, no installation.

**Steps**:

1. In the findings document, record the exact `osslsigncode` command that **would** sign `marksync-win-x64.exe`, including:
   - the **sign** sub-command with placeholder cert (`-certs <path-to-authenticode.pem>`) and private key (`-key <path-to-pkey.pem>`) paths;
   - the **timestamp URL** (RFC 3161 timestamping, e.g. `-t http://timestamp.digicert.com`);
   - the **hash algorithm** (e.g. `-h sha256`);
   - the input binary and the signed output path.
2. Also document the **verify** and **extract-signature** sub-commands (so E5-S4 has the full sign/verify/extract recipe).
3. Identify the **cert/Authenticode plug-in point**: where a real production certificate material plugs in (the placeholder cert/pkey paths), and note that the actual production signing occurs in E5-S4 with a real cert.
4. Record the explicit caveat: **macOS notarization is out of scope** for this spike (deferred to MS-0003 per NFR-COMP-1).

**Expected Outcome**:

- One concrete `osslsigncode` **sign** command documented (with cert/pkey placeholders, timestamp URL, hash algorithm), plus the verify/extract-signature commands.
- The cert/Authenticode plug-in point identified; the macOS-notarization-out-of-scope caveat recorded.
- → **H5 PASS** (the signing path is documented as feasible; the ADR-0001 signing Unresolved Question has a concrete answer for the Windows/Linux slice).

**Evidence captured**: the documented command block in `findings/...#H5` (sign / verify / extract-signature + cert plug-in point + macOS caveat). This is the spike's only signing evidence — it is a reference string, not a signed artifact.

**Pass/Fail criteria**: PASS iff the findings document contains a concrete, copy-pasteable `osslsigncode sign` command (with cert/pkey placeholders + timestamp URL + hash algorithm) **and** the cert plug-in point **and** the macOS-out-of-scope caveat. No execution is required (DEC-4).

**Notes / Clarifications**: This validates that the Windows Authenticode signing story is *addressable* with standard tooling; the actual enterprise-trust-bar attainment (real cert, timestamp authority, reputation) is E5-S4's job. No real cert is required for this spike (spec §20; DEC-4).

---

#### TC-BCS-008 - arm64 stretch (target availability; informational)

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-1, spec NG-2 (arm64 stretch), RSK-1 (target availability)
**Test Type(s)**: Spike-validation probe (informational)
**Automation Level**: Automated
**Target Layer / Location**: `spikes/bun-compile-smoke/` (runner: `run-probes.sh`)
**Tags**: @spike, @bun-compile, @stretch, @arm64

**Preconditions**:

- Bun **1.1.34** active; the minimal smoke CLI exists.

**Steps**:

1. Attempt `bun build --compile --target=bun-linux-arm64 ./src/cli.ts --outfile marksync-linux-arm64` (record whether the target is accepted or rejected).
2. Attempt `bun build --compile --target=bun-darwin-arm64 ./src/cli.ts --outfile marksync-darwin-arm64` (record whether accepted/rejected — macOS target is deferred to MS-0003, so this is purely informational about target availability).
3. Record the result: which arm64 targets exist in the pinned Bun version (and the `file` type of any produced binary).

**Expected Outcome**:

- A recorded answer to "are `bun-linux-arm64` / `bun-darwin-arm64` accepted targets in Bun 1.1.34?" — PASS (target exists) or REJECTED (target unavailable), per target.

**Evidence captured**: build-attempt log per target (accepted/rejected + `file` output if produced), referenced from `findings/...` (arm64-stretch note).

**Pass/Fail criteria**: This probe is **non-blocking / informational** (spec NG-2). There is no fail outcome — only a recorded observation. E5-S4 may pick up arm64 if the x64 path is clean.

---

#### TC-BCS-EVID - findings-document presence (PASS/FAIL per H1–H5 + recommendation)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC6, NFR-EVID-1
**Test Type(s)**: Spike-validation probe (semi-automated check + manual verdict authoring)
**Automation Level**: Semi-automated (presence/structure check automated; verdicts authored by the operator)
**Target Layer / Location**: `findings/bun-compile-smoke-findings.md`
**Tags**: @spike, @findings, @decision-input

**Preconditions**:

- All other probes (TC-BCS-001…008, TC-BCS-SEC) have produced their evidence.

**Steps**:

1. Assert `findings/bun-compile-smoke-findings.md` exists and is committed.
2. Assert the document contains, for **each** of H1–H5, an explicit **PASS** or **FAIL** verdict with an **evidence pointer** (build-log path, docker-run output, measured size/timing value, or the signing command block).
3. Assert the document contains a **single, clear MS-0002/E5-S4 recommendation**: either proceed to MS2-E5-S4 with the `scripts/build-binaries.sh` skeleton, **or** invoke a documented fallback (Windows CI runner build for a win-x64 target gap; recorded size/cold-start flag under the "desired, not hard" waiver; **or** — catastrophic cross-compile failure — escalate to ADR-0001 language-level reconsideration, per spec outcome matrix).
4. Assert the document records: the pinned **Bun version** (DEC-2), the **build host OS/arch**, the **Docker image digests** used, the **measurement conventions** (§6), and the **DEC-3 Windows-runtime deferral** note.

**Expected Outcome**:

- `findings/bun-compile-smoke-findings.md` present with: explicit PASS/FAIL per H1–H5 + evidence pointers + the measured size/timing + the signing command + one clear MS-0002/E5-S4 recommendation + the reproducibility metadata (Bun version, host OS/arch, image digests, conventions).
- → **AC6 satisfied** (NFR-EVID-1).

**Evidence captured**: the findings document itself (the whole document is the evidence artifact for AC6).

**Pass/Fail criteria**: PASS iff the document exists and satisfies the structural checks above (explicit per-H verdicts with evidence pointers + one recommendation + reproducibility metadata + DEC-3 deferral note). The verdicts themselves are authored by the operator from the probe evidence (the spike is a human-in-the-loop decision input, not a fully automated gate).

**Notes / Clarifications**: This is the spike's **actual deliverable**. The recorded size/cold-start baseline (from TC-BCS-005/006) and the signing command (from TC-BCS-007) are carried forward into E5-S4.

---

#### TC-BCS-SEC - secrets scan (0 secrets in committed artifacts)

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC7, NFR-SEC-2
**Test Type(s)**: Spike-validation probe (semi-automated)
**Automation Level**: Semi-automated (scan + human review before commit)
**Target Layer / Location**: `spikes/bun-compile-smoke/` workspace + `findings/` + `scripts/build-binaries.sh` (a small `scripts/secret-scan.sh` or an inline `rg` invocation is acceptable)
**Tags**: @spike, @security, @secrets

**Preconditions**:

- All spike artifacts (code, runner script, build-script skeleton, findings) are staged in the workspace but not yet committed.

**Steps**:

1. Run a secret scan across the spike workspace (`spikes/bun-compile-smoke/`, `findings/`, and `scripts/build-binaries.sh`). Prefer `gitleaks` if available; else a grep/`rg` scan for common secret patterns: API tokens, `Bearer `, `xoxb-`, `AKIA` AWS prefixes, private-key headers (`-----BEGIN ... PRIVATE KEY-----`), high-entropy base64 blobs, and any `MARKSYNC_*` credential env-var **values** (keys/names are fine; values must be absent).
2. Confirm `node_modules/`, ephemeral build outputs (incl. the ~90 MB binaries), and logs are **gitignored** (they are not committed, so they are out of scan scope for "committed artifact").
3. Record a one-line verdict in the findings doc: "Secrets scan: 0 secrets in committed artifacts (reviewed <date>; tool: <gitleaks|rg>)."

**Expected Outcome**:

- 0 secrets in any committed spike artifact.
- The workspace is reviewed for secrets before commit (no real secrets are expected in a spike).

**Evidence captured**: secrets-scan result (0 findings) + the one-line verdict in `findings/...` (secret-hygiene note).

**Pass/Fail criteria**: PASS iff 0 secrets detected in committed artifacts. Any finding must be remediated before commit (redact / gitignore) and re-scanned.

**Notes / Clarifications**: Because no real secrets are expected in a spike, a documented review step plus a light scan is acceptable for AC7. NFR-SEC-1/INV-SEC-1 (no secrets in any **production** output path) apply to the production CLI; this spike produces no production output, so AC7 is scoped to the spike's committed artifacts (NFR-SEC-2 redaction-by-construction posture).

## 6. Environments and Test Data

**Environment:**

- **Build host:** Linux dev host; OS/arch recorded (`uname -a`) in the findings. The host has Docker (27.3.1, daemon reachable) but **no `wine`** (DEC-3) and **no `osslsigncode`** (DEC-4).
- **Runtime / build tool:** Bun **1.1.34** (pinned — DEC-2; matches the GH-11 pin); `bun --version` recorded. The cross-compile mechanism under test is `bun build --compile`.
- **Clean-OS images:** `debian:slim` (primary — glibc) and `alpine:latest` (stretch — musl); each image's **digest** is recorded in the findings for reproducibility.
- **Workspace:** `spikes/bun-compile-smoke/` — standalone; own `package.json`; `node_modules/` and ephemeral build outputs (incl. the ~90 MB binaries) **gitignored**; the minimal CLI, runner script, and findings are committed.
- **Network:** none. The spike makes **no outbound network calls** (spec §20; privacy default preserved) — no source, credentials, or build artifacts leave the operator's environment.

**Anti-over-mocking guardrail — DOES NOT APPLY (stated for clarity):**

> Per `.ai/rules/testing-strategy.md` §"AI-agent over-mocking guardrail", production tests must avoid
> over-mocking. This guardrail **does not apply** to this spike: the probes run the **real**
> `bun build --compile`, the **real** clean-OS Docker runs, and the **real** `file` / `ls` / `stat` /
> `/usr/bin/time` measurements — there are **no mocks** anywhere. (The only "non-real" element is the
> `osslsigncode` dry-run command, which is a reference string by design — DEC-4.) Secret hygiene
> (NFR-SEC-2) **does** still apply (TC-BCS-SEC).

**Measurement conventions (recorded for MS2-E5-S4 reuse — reproducibility):**

- **Binary size:** recorded in **bytes** (via `ls -la` / `stat -c %s`), then converted to **MB using
  1 MB = 1,048,576 bytes (binary)** — the conversion convention is stated explicitly in the findings
  so the number is unambiguous. Compared to the **≤90 MB desired** budget (NFR-PERF-1).
- **Cold-start:** defined as **wall-clock time of the first invocation of a fresh process** for
  `./marksync-linux-x64 --version` on the clean-OS Linux container. Each repeat runs a **fresh
  process**; a small number of repeats (3–5) are recorded (a single sample is noisy). Compared to the
  **≤2 s desired** budget (NFR-PERF-2). Absolute cold-start in a container is directional (page-cache
  isolation is imperfect) — recorded as a baseline, not a micro-gate.
- **Reproducibility metadata:** the findings record the **Bun version** (DEC-2), the **build host
  OS/arch**, and the **Docker image digests** used, so the result can be reproduced.

**Test data generation & cleanup:**

- All inputs are **synthetic**: a minimal `src/cli.ts` printing `marksync 0.0.0`. No real user /
  Confluence data is used (spec §20).
- The `osslsigncode` command uses **placeholder** cert/pkey paths — no real signing material (DEC-4).
- The produced binaries (~90 MB each) are **ephemeral build outputs** — gitignored, **not** committed;
  their sizes are recorded in the findings. No cleanup of external state is required (no external
  systems touched).

**Isolation:**

- The spike is fully isolated from the main `src/` tree (spec NG-5) and from the project test runner /
  CI. It introduces no production code, no production dependencies into the main tree (standalone
  workspace), and no ADR mutation (spec NG-6).

## 7. Automation Plan and Implementation Mapping

| TC ID | Probe / artifact to create | Execution command | Mocking | Status |
|-------|----------------------------|-------------------|---------|--------|
| TC-BCS-001 | `spikes/bun-compile-smoke/run-probes.sh` (linux-x64 step) | `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64 && file marksync-linux-x64` | None (real `bun build --compile`) | To implement |
| TC-BCS-002 | `spikes/bun-compile-smoke/run-probes.sh` (win-x64 step) | `bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe && file marksync-win-x64.exe` | None (real `bun build --compile`) | To implement |
| TC-BCS-003 | `spikes/bun-compile-smoke/run-probes.sh` (debian clean-OS step) | `docker run --rm -v "$PWD":/x -w /x debian:slim ./marksync-linux-x64 --version` (+ `which` precheck) | None (real clean-OS Docker run) | To implement |
| TC-BCS-004 | `spikes/bun-compile-smoke/run-probes.sh` (alpine stretch step) | `docker run --rm -v "$PWD":/x -w /x alpine:latest ./marksync-linux-x64 --version` | None (real clean-OS Docker run) | To implement (stretch) |
| TC-BCS-005 | `spikes/bun-compile-smoke/run-probes.sh` (size step) | `ls -la marksync-linux-x64 marksync-win-x64.exe` (or `stat -c %s`); convert bytes → MB (÷1,048,576) | None (real `ls`/`stat`) | To implement |
| TC-BCS-006 | `spikes/bun-compile-smoke/run-probes.sh` (cold-start step) | `docker run --rm -v "$PWD":/x -w /x debian:slim /usr/bin/time -v ./marksync-linux-x64 --version` (×3–5 repeats) | None (real `/usr/bin/time` on real binary) | To implement |
| TC-BCS-007 | `findings/bun-compile-smoke-findings.md#H5` (documented command block) | (documentation probe — no execution; `osslsigncode` not installed per DEC-4) | n/a (reference string only) | To implement (documentation) |
| TC-BCS-008 | `spikes/bun-compile-smoke/run-probes.sh` (arm64 stretch step) | `bun build --compile --target=bun-linux-arm64 …` and `--target=bun-darwin-arm64 …` (record accepted/rejected) | None | To implement (informational) |
| TC-BCS-EVID | `findings/bun-compile-smoke-findings.md` (deliverable) + optional presence-check | structural check: per-H PASS/FAIL present + one recommendation + reproducibility metadata + DEC-3 deferral note | None | To implement (check + manual verdict authoring) |
| TC-BCS-SEC | `spikes/bun-compile-smoke/scripts/secret-scan.sh` (or inline `rg`/`gitleaks`) | `gitleaks detect …` (if available) **or** `rg '<pattern>' spikes/bun-compile-smoke/ findings/ scripts/build-binaries.sh` | None | To implement (light) |

**Shared infrastructure to create (referenced by multiple probes):**

- `spikes/bun-compile-smoke/package.json` — pins the Bun runtime; standalone workspace (no coupling to main tree).
- `spikes/bun-compile-smoke/src/cli.ts` — the minimal smoke CLI printing `marksync 0.0.0` (Cliffy `Command` if available, else plain `console.log`).
- `spikes/bun-compile-smoke/run-probes.sh` — the **runner script** orchestrating TC-BCS-001…008 in order; captures each step's exit status and output to the spike evidence area. (The coder authors this; the test plan only specifies what each step must do and assert.)
- `scripts/build-binaries.sh` — the **reusable cross-compile skeleton** consumed/refined by MS2-E5-S4 (captures the validated `bun build --compile` invocations; spec F-7, G-7).
- `findings/bun-compile-smoke-findings.md` — the spike's primary deliverable (PASS/FAIL per H1–H5 + measurements + recommendation).

**Not implemented by this spike (downstream):**

- The **cross-platform binary build pipeline** (CI release matrix, checksums, SBOM, signing) — MS2-E5-S4.
- Any wiring into `.github/workflows/ci.yml` or `.github/workflows/run-e2e.yml` — explicitly **not** done for the spike.
- The production performance-test suite — deferred to MS-0003+ (`.ai/rules/testing-strategy.md` §"Product performance scenarios"); the size/cold-start baseline recorded here is the reference point.
- ADR-0001 cross-compile verification pointer / signing-evidence update — lifecycle phase 7 (doc-sync); this spike only supplies the enabling evidence.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`--target=bun-windows-x64` unavailable/renamed** in the pinned Bun (story R1; spec RSK-1) | Medium (forces a Windows CI-runner fallback for E5-S4) | Pin Bun **1.1.34** (DEC-2); if win-x64 is unavailable, TC-BCS-002 records the failure mode and documents the Windows CI runner build fallback — linux-x64 production (TC-BCS-001) and the signing story (TC-BCS-007) remain validated. Does NOT block MS-0002. |
| **`alpine` (musl) cannot run the glibc-linked binary** (spec RSK-4) | Low | `debian:slim` (glibc) is the **primary** clean-OS image (TC-BCS-003); `alpine` (TC-BCS-004) is non-blocking stretch. NFR-RUN-1 is satisfied by `debian:slim` alone. |
| **Binary > 90 MB or cold-start > 2 s** (story R2; spec RSK-2) | Low (accepted) | Both are **"desired, not hard"** (DEC-5; PR #4; `doc/spec/nonfunctional.md`). TC-BCS-005/006 **record + flag**, never block MS-0002. |
| **`wine` absent → Windows runtime smoke deferred** (DEC-3; spec RSK-3) | Low | TC-BCS-002 validates win-x64 **production + PE32+ verification**; the clean-OS Windows *run* is explicitly deferred to a Windows CI runner in E5-S4 (story step-5 fallback). Recorded in findings. |
| **Spike accidentally touches `src/`** (spec RSK-5) | Medium | Standalone workspace with its own `package.json` (`spikes/bun-compile-smoke/`); explicit non-goal NG-5; review gate on the spike diff. |
| **Catastrophic cross-compile failure — no runnable binary path** (spec RSK-6) | High (but low probability) | Documented escalation: trigger ADR-0001 language-level reconsideration; CEO records a decision; the team does **not** silently proceed. |
| **Probes mistakenly wired into the project test runner or CI** | Low (process) | Explicit "No CI wiring / runs locally" notes in §1.2 and §4; the plan-writer/coder run probes via the runner script in the spike workspace only. |
| **Measurement non-reproducibility** (size/cold-start drift) | Low | Measurement conventions fixed (§6): bytes→MB (÷1,048,576); cold-start = fresh-process wall-clock; Bun version + host OS/arch + image digests recorded. |

### 8.2 Assumptions

- The minimal smoke CLI printing a version string is a sufficient proxy for "the binary runs" — it exercises the Bun runtime bootstrap embedded in the compiled binary without needing the real CLI feature set (spec §12).
- `debian:slim` (glibc) is the canonical clean-OS Linux image for NFR-COMP-2 (story example); `alpine` (musl) is a stretch only.
- NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s cold-start) are **"desired, not hard"** (PR #4; `doc/spec/nonfunctional.md`) — exceedance is recorded + flagged, never blocking for MS-0002 (DEC-5).
- The exact `osslsigncode` dry-run command is sufficient evidence that Windows Authenticode signing is feasible (H5); a real cert is not required (DEC-4).
- The spike's findings are sufficient evidence for a later (lifecycle phase 7) ADR-0001 cross-compile verification pointer / signing-evidence update; this test plan does not itself mutate any ADR (spec NG-6).
- The standalone spike workspace is permitted to exist alongside the main tree without affecting production builds (gitignored ephemera; no `src/` coupling).

### 8.3 Open Questions

| ID | Question | Status | Owner |
|----|----------|--------|-------|
| OQ-1 | `/usr/bin/time` (GNU time) may be absent in `debian:slim`. Is installing it ephemerally inside the container acceptable, or should the cold-start be measured via a Bash `time` + `/proc` RSS read? | Either is acceptable; the method used is recorded in the findings. Confirm at probe implementation. | Implementer |
| OQ-2 | Should the arm64 stretch (TC-BCS-008) also attempt a clean-OS *run* if the target compiles, or only record target availability? | Availability-only is sufficient (spec NG-2 — arm64 is not gated); a run is a bonus recorded if it works. | Implementer |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | test-plan-writer (GH-13) | Initial test plan. Defined 9 spike-validation probes (TC-BCS-001…008 + TC-BCS-EVID) plus the cross-cutting TC-BCS-SEC secrets probe; AC→probe→hypothesis→evidence traceability matrix; measurement conventions (§6: bytes→MB ÷1,048,576; fresh-process cold-start; Bun version + host OS/arch + image digests); explicit no-CI-wiring / runs-locally stance; explicit statement that the anti-over-mocking guardrail does not apply (real builds + real Docker runs, no mocks) while secret hygiene does. All 7 ACs (AC1–AC7) fully traced. |

## 10. Test Execution Log

> Populated during spike execution (lifecycle phase 6 — delivery). The probes do **not** run in CI;
> this log captures the local runner-script evidence that feeds the findings document.

| TC ID | Run Date | Result | Evidence pointer | Notes |
|-------|----------|--------|------------------|-------|
| TC-BCS-001 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H1` | linux-x64 cross-compile |
| TC-BCS-002 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H1` | win-x64 cross-compile; Windows RUN deferred (DEC-3) |
| TC-BCS-003 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H2` | debian:slim clean-OS run (primary) |
| TC-BCS-004 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H2` | alpine clean-OS run (stretch) |
| TC-BCS-005 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H3` | size measurement |
| TC-BCS-006 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H4` | cold-start measurement |
| TC-BCS-007 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md#H5` | osslsigncode dry-run (documentation) |
| TC-BCS-008 | _(pending)_ | — | `findings/bun-compile-smoke-findings.md` (arm64 note) | arm64 stretch (informational) |
| TC-BCS-EVID | _(pending)_ | — | `findings/bun-compile-smoke-findings.md` | findings-doc presence |
| TC-BCS-SEC | _(pending)_ | — | `findings/bun-compile-smoke-findings.md` (secret-hygiene note) | secrets scan |
