---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-13
  type: spike
  status: Proposed
  slug: bun-cross-compile-smoke
  title: "[MS2-E1-S3] Bun single-binary cross-compile smoke"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [spike, ms-0002, adr-0001-validation, bun-compile]
  version_impact: none
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [MS2-E5-S4 (blocked consumer, untouched by this spike), main src/ tree (untouched — explicit non-goal)]
    external: ["Bun runtime (build --compile)", "Docker (clean-OS Linux smoke)", "debian:slim / alpine images"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Validate, with empirical evidence, whether `bun build --compile` produces a **working** single-binary for clean Linux + Windows within the MS-0002 budget (≤90 MB, ≤2 s cold-start **desired, not hard**), and document the Windows code-signing story — so MS2-E5-S4 (cross-platform binary builds) can proceed without surprises, and ADR-0001's distribution promise (C-2 single binary no runtime; C-3 cross-platform) is empirically de-risked or a documented fallback/escalation triggered.

## 1. SUMMARY

This is a **load-bearing spike** that produces **findings + evidence + a recommendation**, not production code. It cross-compiles a **minimal smoke CLI** to `bun-linux-x64` and `bun-windows-x64` from a Linux dev host, runs the linux-x64 binary inside a clean-OS Docker image (no Bun/Node installed), measures binary size and cold-start, and documents the Windows Authenticode signing path (`osslsigncode`) as a dry-run command. The outcome either unblocks MS2-E5-S4 (cross-platform binary builds) with a reusable build-script skeleton, or triggers a documented fallback (Windows CI runner build for the Windows runtime smoke; recorded-and-flagged size/cold-start exceedance under the "desired, not hard" waiver) — escalating to ADR-0001 language-level reconsideration only on catastrophic cross-compile failure.

The spike lives in a **standalone** workspace and **must not modify the main `src/` tree**.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **ADR-0001** (governance-`Accepted`, confidence **Medium**) chose TypeScript + Bun `build --compile` specifically to satisfy **C-2** (single self-contained binary per OS+arch, no mandatory language runtime) and **C-3** (cross-platform: Linux/macOS/Windows, amd64/arm64). The cross-compile mechanism itself is the **asserted-but-unvalidated** load-bearing unknown **UNCERT-2**. ADR-0001 lists as a revisit trigger: *"Bun or Deno single-binary distribution proves unviable at scale (binary size, startup, cross-compile, signing/notarization)."* It also carries an open Unresolved Question: *"Whether binary signing/notarization tooling for Bun-compiled artifacts meets the enterprise trust bar."* This spike validates C-2/C-3 for the MS-0002 Linux+Windows slice and supplies the signing-path evidence.
- **NFR-COMP-1** scopes `MS-0002` to **Linux + Windows** (macOS deferred to MS-0003). **NFR-COMP-2** requires a clean-OS image to run the binary with no Node/Bun/Deno installed. **NFR-PERF-1** (≤90 MB) and **NFR-PERF-2** (≤2 s cold-start) are **"desired, not hard"** per PR #4 and `doc/spec/nonfunctional.md` — larger/slower is acceptable if the job gets done.
- The repo is **post-inception, pre-implementation**: `MS-0001` (API validation spike) is complete; the `MS-0002` spike epic (MS2-E1) is active. The `MS2-E1-S1` Mermaid headless-render spike (GH-11) is merged; this is the next load-bearing spike (epic MS2-E1, story S3). The repo is **pre-scaffolding** (no root `package.json` yet); the spike introduces its own standalone workspace.
- The spike's eight-step methodology (authoritative story MS2-E1-S3) prescribes a minimal `src/cli.ts` printing `marksync 0.0.0`, the two `bun build --compile --target=...` invocations, a clean-OS Docker run, size/cold-start measurement, an `osslsigncode` dry-run command, and a findings doc.

### 2.2 Pain Points / Gaps

- ADR-0001's distribution promise is **asserted but unproven** for the cross-compile mechanism itself: no evidence yet shows `--target=bun-linux-x64` and `--target=bun-windows-x64` both succeed from a Linux dev host.
- No evidence yet shows the resulting linux-x64 binary runs on a **clean OS with no Bun/Node installed** (NFR-COMP-2) — the entire "no mandatory runtime" guarantee (C-2) is empirical-claim-only.
- Binary size (~50–90 MB per ADR-0001's accepted negative outcome) and cold-start are **unmeasured** for actual Bun-compiled MarkSync artifacts; the "desired, not hard" budget has no recorded baseline.
- The Windows code-signing story is an **open ADR-0001 Unresolved Question** (enterprise trust bar); no concrete Authenticode path is documented. Unsigned Windows binaries trigger "trust and environment questions" (ADR-0001 negative outcomes; failure premortem §7).
- Bun cross-compile target naming/availability drifts across Bun versions (story R1) — an unpinned build is non-reproducible.

## 3. PROBLEM STATEMENT

Because ADR-0001's distribution promise (single self-contained binary per OS/arch, no mandatory runtime) is asserted **without empirical proof** that `bun build --compile` cross-compiles to runnable Linux + Windows binaries within the MS-0002 budget, the project cannot commit to MS2-E5-S4 (the cross-platform binary build pipeline) without risking a late, costly reversal of the entire TS-over-Go distribution premise — so this spike must resolve hypotheses H1–H5 with evidence and a clear MS-0002/E5-S4 recommendation before any production build pipeline is written.

## 4. GOALS

- **G-1**: Empirically validate **H1** — both `--target=bun-linux-x64` and `--target=bun-windows-x64` cross-compiles succeed from a Linux dev host.
- **G-2**: Empirically validate **H2** — the linux-x64 binary runs on a clean-OS minimal Docker image (`debian:slim`, and `alpine` as a stretch) with **no** Bun/Node installed, exits 0, and prints a version string.
- **G-3**: **Record** the actual binary size (≤90 MB desired per NFR-PERF-1; flag if larger — not blocking).
- **G-4**: **Record** the actual cold-start time (≤2 s desired per NFR-PERF-2; document if longer — not blocking).
- **G-5**: **Document** the Windows Authenticode signing story (H5) with a concrete `osslsigncode` dry-run command (no real cert required).
- **G-6**: Produce a **findings document** with explicit PASS/FAIL per H1–H5 + measurements + a single clear MS-0002/E5-S4 recommendation.
- **G-7**: Leave behind a **reusable `scripts/build-binaries.sh` skeleton** consumed/refined by MS2-E5-S4.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Cross-compile success | 2/2 targets (`bun-linux-x64`, `bun-windows-x64`) compile from the Linux dev host |
| Clean-OS Linux run | exit 0 + version string on `debian:slim` (and/or `alpine`) with no Bun/Node installed |
| Binary size | ≤90 MB desired; **actual recorded** (flagged if larger, NOT blocking) |
| Cold-start | ≤2 s desired; **actual recorded** (documented if longer, NOT blocking) |
| Signing story | 1 concrete `osslsigncode` dry-run command documented with the cert/Authenticode plug-in point |
| Findings completeness | explicit PASS/FAIL recorded for each of H1–H5 with evidence pointers + one clear MS-0002/E5-S4 recommendation |
| Secret hygiene | 0 secrets in any committed artifact |

### 4.2 Non-Goals

- **NG-1**: macOS target — deferred to MS-0003 per NFR-COMP-1 and the story's Out-of-scope.
- **NG-2**: arm64 targets — **stretch**; record whether `--target=bun-linux-arm64` works but do not block (primary targets are x64).
- **NG-3**: The real CLI feature set — this is a **smoke binary** that prints a version string, not the production CLI.
- **NG-4**: Real code-signing with a production certificate — **dry-run command only** (H5 is documentation, not a signed artifact).
- **NG-5**: Modifying any file under the main `src/` tree — the spike is standalone; the story explicitly forbids touching `src/`.
- **NG-6**: Updating ADR-0001's status or revisit-trigger disposition. (The actual ADR update happens in lifecycle **phase 7** doc-sync, not in this spec — this spike only produces the evidence that *enables* it.)

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Cross-compile binary production (linux-x64 + win-x64 from a Linux host) | The mechanism under test; a runnable single binary per target is the precondition for ADR-0001 C-2/C-3 and the input to every downstream hypothesis. Validates H1. |
| F-2 | Clean-OS runtime smoke (linux-x64 binary runs on a minimal Docker image with no language runtime) | Proves the "no mandatory runtime" promise (NFR-COMP-2; ADR-0001 C-2) empirically, not by assertion. Validates H2. |
| F-3 | Binary-size measurement | Records the actual size against the NFR-PERF-1 "desired, not hard" budget so E5-S4 and the release pipeline have a real baseline. Validates H3. |
| F-4 | Cold-start measurement | Records the actual startup time against the NFR-PERF-2 "desired, not hard" budget so the install/startup experience is characterized. Validates H4. |
| F-5 | Windows signing-story documentation (Authenticode via `osslsigncode`, dry-run) | Closes the open ADR-0001 Unresolved Question on signing/notarization tooling feasibility with a concrete, reusable command. Validates H5. |
| F-6 | Findings & recommendation artifact | Capture explicit PASS/FAIL per hypothesis with evidence and a clear MS-0002/E5-S4 recommendation; this is the spike's actual deliverable. |
| F-7 | Reusable build-script skeleton | A committed `scripts/build-binaries.sh` skeleton that MS2-E5-S4 consumes/refines, so the validated cross-compile path is not rediscovered. |

### 5.1 Capability Details

- **F-1 (cross-compile production)**: The spike invokes `bun build --compile --target=bun-linux-x64` and `--target=bun-windows-x64` against a minimal `src/cli.ts` entry, producing `marksync-linux-x64` and `marksync-win-x64.exe`. Both invocations run from the Linux dev host; the win-x64 production is logged even where the Windows *run* is deferred (DEC-3). The exact Bun version is pinned (DEC-2) so the result is reproducible.
- **F-2 (clean-OS run)**: The linux-x64 binary is executed inside `debian:slim` (the story's example image) via `docker run --rm -v …`, confirming exit 0 + version output with no Bun/Node in the image. `alpine` is attempted as a stretch (musl vs glibc dynamic-link note recorded — RSK-4).
- **F-3 (size)**: `ls -la` (or equivalent) records the actual binary size; the value is compared against the ≤90 MB desired budget (NFR-PERF-1). Exceedance is **recorded + flagged, not blocking** (DEC-5; story R2).
- **F-4 (cold-start)**: `/usr/bin/time` records the cold-start of `./marksync --version` on the clean OS, along with `Maximum resident set size` (informational). The value is compared against the ≤2 s desired budget (NFR-PERF-2). Exceedance is **documented, not blocking**.
- **F-5 (signing story)**: The exact `osslsigncode` command that *would* sign the Windows binary is recorded as a reference string, with the point at which a real cert/Authenticode material plugs in. No real cert and no installation is required (DEC-4); H5 is satisfied by documentation.
- **F-6 (findings)**: A committed findings document records, for each of H1–H5, an explicit PASS/FAIL with evidence pointers (build-log paths, Docker-run output, measured size/timing, the signing command) and a single clear recommendation: proceed to E5-S4 with the build-script skeleton, or invoke the documented fallback (Windows CI runner; recorded size/cold-start flag).
- **F-7 (build-script skeleton)**: `scripts/build-binaries.sh` captures the validated cross-compile invocations as a skeleton E5-S4 refines into the production release matrix.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Spike build/smoke pipeline (single operator, local):

  Operator enters standalone workspace (spikes/bun-compile-smoke/)
    → bun build --compile --target=bun-linux-x64  ./src/cli.ts --outfile marksync-linux-x64   [H1]
    → bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe [H1]
    → linux clean-OS smoke:
        docker run --rm -v "$PWD":/x -w /x debian:slim ./marksync-linux-x64 --version
        → assert exit 0 + version string printed  [H2]
      (stretch) repeat with alpine; record musl/glibc note
    → measure: ls -la (size)  [H3]; /usr/bin/time -v (cold-start + RSS)  [H4]
    → signing dry-run: record the exact osslsigncode command + cert plug-in point  [H5]
    → author findings doc: explicit PASS/FAIL per H1–H5 + measurements + E5-S4 recommendation  [F-6]
    → commit scripts/build-binaries.sh skeleton for E5-S4  [F-7]
```

```
Flow 2 — Outcome routing (downstream, not executed by this spike):

  PASS (all of H1–H5 within "desired, not hard" budget) → unblock MS2-E5-S4 with the build-script skeleton.
  Size/cold-start exceedance → record + flag; do NOT block MS-0002 (NFR "desired, not hard"; DEC-5).
  win-x64 target unavailable in installed Bun → fall back to a Windows CI runner build for E5-S4 (story R1).
  Catastrophic cross-compile failure (no runnable binary path at all) → escalate to ADR-0001 language-level
    reconsideration; CEO records a decision; do NOT silently proceed.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- A **standalone spike workspace** under `spikes/bun-compile-smoke/` with its own `package.json` (gitignored: `node_modules` and ephemeral build outputs; committed: the minimal CLI source + findings + build-script skeleton). The Windows binary itself (~90 MB) is an ephemeral build output and is **not committed**; its size is recorded in the findings.
- A **minimal** smoke CLI (`src/cli.ts`) that prints `marksync 0.0.0` (uses Cliffy's `Command` if available, else plain `console.log`). This is a smoke binary, **not** the real CLI.
- **Cross-compile** to `bun-linux-x64` and `bun-windows-x64` from the Linux dev host (H1).
- **Clean-OS Linux smoke** via `debian:slim` (H2); `alpine` attempted as a stretch (musl/glibc note recorded).
- **Size measurement** (H3) and **cold-start measurement** (H4), each with the actual value recorded.
- **Signing dry-run**: the exact `osslsigncode` command that would sign the Windows binary, with the cert/Authenticode plug-in point documented (H5). No real cert; no installation.
- **Findings document** at `findings/bun-compile-smoke-findings.md` with explicit PASS/FAIL per H1–H5 + measurements + a clear MS-0002/E5-S4 recommendation.
- A reusable **`scripts/build-binaries.sh` skeleton** committed for MS2-E5-S4 consumption/refinement.

### 7.2 Out of Scope

- [OUT] macOS target (deferred to MS-0003 per NFR-COMP-1; story Out-of-scope).
- [OUT] arm64 targets as a gate (stretch — record whether `--target=bun-linux-arm64` works; do not block).
- [OUT] The real CLI feature set (this is a smoke binary).
- [OUT] Real code-signing with a production certificate (dry-run command only).
- [OUT] Modifying any file under the main `src/` tree.
- [OUT] Updating ADR-0001's status or revisit-trigger disposition (lifecycle phase 7 doc-sync; this spike only supplies the enabling evidence).
- [OUT] Production packaging/release of the spike.

### 7.3 Deferred / Maybe-Later

- The **clean-OS Windows runtime smoke** is deferred to a Windows CI runner in MS2-E5-S4 (DEC-3): the win-x64 binary is **produced** here (H1 production fully testable), but `wine` is absent in this environment, so the run cannot be executed locally. The findings record this deferral.
- **arm64** targets are recorded (stretch) but not gated; E5-S4 may pick them up if the x64 path is clean.
- The **actual production signing** of a release artifact occurs in E5-S4 with a real cert; this spike only documents the command.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A. The spike makes no outbound network calls and exposes no HTTP surface. The smoke binary only prints a version string locally.

### 8.2 Events / Messages

N/A.

### 8.3 Data Model Impact

N/A. The spike introduces no production data model; the smoke CLI, findings document, and build-script skeleton are spike artifacts only.

### 8.4 External Integrations

| Integration | Role in spike | Notes |
|---|---|---|
| Bun runtime (`build --compile`) | The cross-compile mechanism under test | Pinned to the version that works (DEC-2; matches the GH-11 pin) for reproducibility across target-name availability (story R1). |
| Docker (daemon reachable, 27.3.1) | Clean-OS Linux runtime smoke | Hosts `debian:slim` (primary) and `alpine` (stretch) for the H2 clean-OS run. |
| `debian:slim` / `alpine` images | Clean-OS images with no language runtime | Validate NFR-COMP-2 (clean-OS image runs binary with no runtime). `alpine` (musl) may fail dynamic-link against the glibc-linked Bun binary — recorded, falls back to `debian:slim` (RSK-4). |
| `osslsigncode` (reference only) | Windows Authenticode signing path | **Not installed** in this environment (DEC-4); H5 is satisfied by documenting the exact dry-run command, not by executing it. |

### 8.5 Backward Compatibility

N/A. No production code or contracts are modified. The spike's only downstream coupling is **enabling** (on PASS) or **redirecting** (on fallback/fail) future MS2-E5-S4 work.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-CC-1 | Cross-compile success — both targets build from the Linux dev host | 2/2 targets (`bun-linux-x64`, `bun-windows-x64`) compile (exit 0); target traceable to ADR-0001 C-3 + NFR-COMP-1 (Linux+Windows slice) |
| NFR-RUN-1 | Clean-OS Linux runtime — binary runs with no language runtime installed | exit 0 + version string on `debian:slim` with no Bun/Node; traceable to ADR-0001 C-2 + NFR-COMP-2 |
| NFR-SIZE-1 | Binary size recorded against the desired budget | ≤90 MB **desired** (NFR-PERF-1); **actual recorded**; flagged if larger, NOT blocking |
| NFR-START-1 | Cold-start recorded against the desired budget | ≤2 s **desired** (NFR-PERF-2); **actual recorded**; documented if longer, NOT blocking |
| NFR-SIGN-1 | Signing story documented | 1 concrete `osslsigncode` dry-run command recorded + cert/Authenticode plug-in point identified |
| NFR-EVID-1 | Evidence completeness | explicit PASS/FAIL recorded for each of H1–H5 with evidence pointers + one clear MS-0002/E5-S4 recommendation |
| NFR-SEC-2 | Secret hygiene | 0 secrets in any committed artifact |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

The spike has no production telemetry. Its "observability" is the **evidence trail** committed as part of the findings:

- **Build evidence**: the two cross-compile invocations and their exit status (linux-x64, win-x64).
- **Clean-OS run evidence**: the `debian:slim` (and stretch `alpine`) Docker-run output — exit code + version string.
- **Measurement evidence**: the recorded binary size and cold-start time (+ informational RSS).
- **Signing evidence**: the exact `osslsigncode` dry-run command and the cert/Authenticode plug-in point.
- **Bun-version pin**: the exact Bun version used (DEC-2), recorded for reproducibility.

All evidence is referenced by path/section from the findings document (NFR-EVID-1).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | The `bun-windows-x64` cross-compile target is unavailable or renamed in the installed Bun version (story R1) | M | M | Pin the Bun version that works (DEC-2); if win-x64 is unavailable, document and **fall back to a Windows CI runner build** for E5-S4 — H1's linux-x64 production and the signing story remain testable | L |
| RSK-2 | Binary exceeds 90 MB (story R2) | L | M | Accepted per PR #4 ("larger acceptable if the job gets done"); **record actual + flag**, do NOT block MS-0002; CEO waives NFR-PERF-1 as a hard gate (DEC-5) | L |
| RSK-3 | `wine` is absent, so the clean-OS Windows *run* cannot execute locally (story step-5 fallback) | L | H (confirmed) | Produce the win-x64 binary and log its production (H1 fully testable); **defer the Windows runtime smoke to a Windows CI runner** in E5-S4 (DEC-3); record the deferral in findings | L |
| RSK-4 | `alpine` (musl) cannot run the glibc-linked Bun binary (dynamic-link failure) | L | M | `debian:slim` (glibc) is the **primary** clean-OS image per the story; `alpine` is a stretch — record the musl/glibc note and fall back to `debian:slim`; NFR-RUN-1 is satisfied by `debian:slim` | L |
| RSK-5 | The spike accidentally touches the main `src/` tree, coupling a throwaway experiment to production | M | L | Standalone workspace with its own `package.json` (`spikes/bun-compile-smoke/`); explicit non-goal (NG-5); review gate on the spike diff | L |
| RSK-6 | Catastrophic cross-compile failure — no runnable single-binary path at all | H | L | Documented escalation: trigger ADR-0001 language-level reconsideration; CEO records a decision; **do NOT silently proceed**. MS-0002's core publish path is not blocked (it does not depend on a shipped binary to develop), but the distribution promise is materially challenged | M |

## 12. ASSUMPTIONS

- The minimal smoke CLI printing a version string is a sufficient proxy for "the binary runs" — it exercises the Bun runtime bootstrap embedded in the compiled binary without needing the real CLI feature set.
- `debian:slim` is the canonical clean-OS Linux image for NFR-COMP-2 (story example image); `alpine` is a stretch only.
- NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s) are **"desired, not hard"** (PR #4; `doc/spec/nonfunctional.md`) — exceedance is recorded + flagged, never blocking for MS-0002 (DEC-5).
- The exact `osslsigncode` dry-run command is sufficient evidence that Windows Authenticode signing is feasible (H5); a real cert is not required for this spike (DEC-4).
- The spike's findings are sufficient evidence for a later (phase 7) ADR-0001 cross-compile verification pointer; this spec does not itself mutate any ADR.
- The standalone spike workspace (`spikes/bun-compile-smoke/`) is permitted to exist alongside the (pre-scaffolding) main tree without affecting production builds (gitignored ephemera; no `src/` coupling).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | ADR-0001 | Language/runtime choice whose C-2 (single binary, no runtime) and C-3 (cross-platform) this spike validates; revisit trigger on cross-compile proving unviable. |
| Depends on | Bun runtime (`build --compile`) | The cross-compile mechanism under test; version pinned (DEC-2). |
| Depends on | Docker (27.3.1, daemon reachable) + `debian:slim` | Clean-OS Linux smoke (NFR-COMP-2). |
| Blocks | MS2-E5-S4 (cross-platform binary builds) | Cannot proceed to the production release matrix until this spike resolves H1–H5 and leaves the build-script skeleton. |
| Blocks (partial) | Closure of ADR-0001 signing Unresolved Question | H5 supplies the signing-feasibility evidence for a later phase-7 update. |
| Blocked by | (none) | The spike has no upstream change dependency. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| — | (none pending) | Story R1 (target availability) and R2 (binary >90 MB) are **CEO-resolved** (see DEC-2, DEC-5). Environment fallbacks (wine absent → DEC-3; osslsigncode absent → DEC-4; alpine musl → RSK-4) are **PM-decided**. The spike itself is the validation mechanism for the genuinely-open factual questions (H1–H5). | Resolved by spike execution — no separate decision needed. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | This is a **spike** delivered in a **standalone** workspace (`spikes/bun-compile-smoke/`); the main `src/` tree is **not** modified | The story explicitly scopes the spike as standalone and forbids touching production code; the deliverable is findings + evidence + a recommendation + a build-script skeleton. | 2026-07-06 |
| DEC-2 | **Pin the Bun version** that works (matches the GH-11 pin, 1.1.34) and record it | Bun cross-compile target naming/availability drifts across versions (story R1); pinning makes the result reproducible and the target set known. | 2026-07-06 |
| DEC-3 | **wine is absent** in this environment → the win-x64 binary is **produced** and its production logged (H1 fully testable), but the clean-OS Windows **run** is **deferred to a Windows CI runner** in MS2-E5-S4 (story methodology step-5 explicit fallback) | The story anticipates this exact fallback ("either cross-run via wine OR document that the win-x64 binary was produced and defer the run to a Windows CI runner"). H1 (cross-compile production) remains fully validated; only the Windows runtime smoke is deferred. | 2026-07-06 |
| DEC-4 | **osslsigncode is absent** → H5 is satisfied by **documenting** the exact dry-run command that *would* sign the Windows binary (no real cert, no installation) | H5 requires only a documented, feasible signing path with the cert/Authenticode plug-in point identified; no signed artifact is needed for this spike. | 2026-07-06 |
| DEC-5 | NFR-PERF-1 (≤90 MB) is **"desired, not hard"** — a size exceedance is **recorded + flagged, NOT blocking** for MS-0002 | Consistent with PR #4 ("larger acceptable if the job gets done"), `doc/spec/nonfunctional.md` ("desired, not hard"), and the CEO-waived hard gate (story R2). NFR-PERF-2 (cold-start) is treated identically. | 2026-07-06 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `spikes/bun-compile-smoke/` (new, standalone) | **New** — spike workspace (minimal smoke CLI + own `package.json`); ephemeral build outputs gitignored. |
| `findings/bun-compile-smoke-findings.md` (new) | **New** — the spike's primary deliverable (PASS/FAIL per H1–H5 + measurements + MS-0002/E5-S4 recommendation). |
| `scripts/build-binaries.sh` (new skeleton) | **New** — reusable cross-compile skeleton consumed/refined by MS2-E5-S4. |
| Main `src/` tree | **Unchanged** — explicitly out of scope (NG-5); the repo is pre-scaffolding and the spike introduces no production code. |
| ADR-0001 | **Unchanged by this spec** — the spike *enables* a later (phase 7) cross-compile verification pointer / signing-evidence update; no ADR is mutated here. |

## 17. ACCEPTANCE CRITERIA

> Spike acceptance is evidence-based: each AC must be satisfied with an **evidence pointer** (build-log path, Docker-run output, measured value, or findings-doc section). IDs AC1–AC7 are preserved from the story's six checklist ACs (AC1–AC6) and the secret-hygiene AC (AC7), each mapped onto ≥1 F-/NFR- ID and one of H1–H5 (plus AC7).

| ID | Criterion (Given / When / Then) | Linked |
|----|----------------------------------|--------|
| AC1 | **Given** the minimal smoke CLI and the pinned Bun version on the Linux dev host, **when** `bun build --compile --target=bun-linux-x64` and `--target=bun-windows-x64` are both invoked, **then** both compiles succeed (exit 0) and produce their respective binaries. | F-1, NFR-CC-1, H1 |
| AC2 | **Given** the linux-x64 binary, **when** run inside a clean `debian:slim` (or `alpine`) container with no Bun/Node installed, **then** it exits 0 and prints a version string. | F-2, NFR-RUN-1, H2 |
| AC3 | **Given** the produced binary, **when** its size is measured, **then** the actual size is recorded (≤90 MB desired; if larger, documented + flagged, NOT blocking). | F-3, NFR-SIZE-1, H3 |
| AC4 | **Given** the linux-x64 binary on the clean OS, **when** its cold-start is measured (`time ./marksync --version`), **then** the actual time is recorded (≤2 s desired; if longer, documented, NOT blocking). | F-4, NFR-START-1, H4 |
| AC5 | **Given** the Windows signing story, **when** documented, **then** it contains a concrete `osslsigncode` dry-run command with the cert/Authenticode plug-in point identified. | F-5, NFR-SIGN-1, H5 |
| AC6 | **Given** the probe results, **when** the findings document is authored, **then** it records an explicit PASS/FAIL for each of H1–H5 with evidence pointers, the measured size/timing, and a single clear MS-0002/E5-S4 recommendation (proceed with the build-script skeleton **or** invoke the documented fallback). | F-6, NFR-EVID-1 |
| AC7 | **Given** all committed spike artifacts, **when** scanned, **then** zero secrets are present in any committed file. | NFR-SEC-2 |

### 17.1 Spike Definition of Done

- All 7 ACs (AC1–AC7) satisfied, each with an **evidence pointer** (build-log path, Docker-run output, measured value, or findings-doc section).
- `spikes/bun-compile-smoke/` committed: minimal smoke CLI + `package.json`; `node_modules` and ephemeral build outputs (incl. the ~90 MB binaries) gitignored.
- Findings document (`findings/bun-compile-smoke-findings.md`) records explicit PASS/FAIL per H1–H5 with evidence, measured size/timing, the signing command, and a clear MS-0002/E5-S4 recommendation.
- `scripts/build-binaries.sh` skeleton committed for MS2-E5-S4 consumption/refinement.
- The deferral of the clean-OS Windows runtime smoke to a Windows CI runner (DEC-3) is recorded in the findings.
- **No production code under `src/` is touched.**

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery shape**: a standalone spike (no production rollout). The "rollout" is the **decision routing** of the findings.
- **On PASS**: the findings unblock MS2-E5-S4; the `scripts/build-binaries.sh` skeleton is handed off as the starting point for the production release matrix.
- **On size/cold-start exceedance**: record + flag; do **not** block MS-0002 (NFR-PERF-1/2 "desired, not hard"; DEC-5).
- **On win-x64 target unavailable**: fall back to a **Windows CI runner build** for E5-S4 (story R1; DEC-2); the signing story and linux-x64 path remain validated.
- **On catastrophic cross-compile failure** (no runnable single-binary path at all): escalate to **ADR-0001 language-level reconsideration**; CEO records a decision; the team does **not** silently proceed.
- **Communication**: findings + recommendation surfaced to the owner; no user-facing or release-pipeline change.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A. The spike introduces no production data, schema, or migration.

## 20. PRIVACY / COMPLIANCE REVIEW

- The spike runs entirely locally and makes **no outbound network calls** — no source, credentials, or build artifacts leave the operator's environment.
- No real user/Confluence data is involved; the smoke CLI prints a synthetic version string only.
- No production certificate or signing material is required (DEC-4); the `osslsigncode` command is a reference string only.

## 21. SECURITY REVIEW HIGHLIGHTS

- **Secret hygiene (AC7)**: zero secrets in any committed artifact (the spike must not embed tokens/credentials in the smoke CLI, scripts, Docker invocations, or logs).
- **No new attack surface**: the smoke binary prints a version string; it does not parse untrusted input, make network calls, or touch credentials.
- **Signing trust**: the documented `osslsigncode` path is the evidence that the enterprise-trust bar (ADR-0001 Unresolved Question) is addressable; the actual cert handling is deferred to E5-S4.
- **Dependency safety**: the spike pins the Bun version (DEC-2); no new production dependencies enter the main tree (standalone workspace, NG-5).

## 22. MAINTENANCE & OPERATIONS IMPACT

- The spike is a **disposable, time-boxed** artifact. Its durable footprints are the committed **`scripts/build-binaries.sh` skeleton** (carried forward into E5-S4's release matrix) and the **findings document** (a one-time decision input).
- No production runbooks, alerts, or SLOs are introduced.
- The recorded binary size / cold-start baseline becomes the reference point for E5-S4's release budgets.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Spike | A time-boxed investigation that produces findings/evidence/a recommendation, not production code. |
| `bun build --compile` | Bun's mechanism that cross-compiles a TS entry to a per-platform single binary embedding the runtime. |
| Cross-compile | Producing a binary for a target OS/arch from a different host OS/arch (here: linux-x64 + win-x64 from a Linux host). |
| Clean-OS run | Executing the binary inside a minimal container image that has no Node/Bun/Deno installed (NFR-COMP-2). |
| Smoke binary | A minimal CLI that prints a version string — sufficient to prove the binary boots, not the real CLI. |
| Cold-start | Wall-clock time from process start to exit for `./marksync --version` on a clean OS. |
| `osslsigncode` | An open-source tool that applies Windows Authenticode code-signing to a PE/EXE. |
| "Desired, not hard" | NFR-PERF-1/2 budget wording: a target to record against, not a release-blocking gate (PR #4). |

## 24. APPENDICES

- **Appendix A — Hypotheses (verbatim from the story)**
  - **H1 (cross-compile):** `bun build --compile --target=bun-linux-x64` and `--target=bun-windows-x64` both succeed from a Linux dev host.
  - **H2 (clean-OS run):** the linux-x64 binary runs on a minimal Docker image (e.g. `debian:slim` / `alpine`) with **no** Bun/Node installed → `./marksync --version` exits 0 and prints a version string.
  - **H3 (size):** binary ≤ 90 MB (desired). Record the actual size; flag if > 90 MB but still acceptable.
  - **H4 (cold-start):** `time ./marksync --version` ≤ 2 s (desired) on the clean OS. Record actual.
  - **H5 (signing story):** document the Windows Authenticode path (`osslsigncode`) and confirm it's feasible (a dry-run command, not a real cert). macOS notarization is out of scope (deferred).

- **Appendix B — Outcome matrix (adapted to cross-compile semantics)**
  - **PASS** → proceed to MS2-E5-S4 (cross-platform binary builds) with the `scripts/build-binaries.sh` skeleton.
  - **Partial pass (size and/or cold-start exceed the "desired" budget)** → record + flag actual values; do NOT block MS-0002 (NFR "desired, not hard"; DEC-5). Proceed to E5-S4.
  - **Partial pass (win-x64 target unavailable in the pinned Bun)** → fall back to a Windows CI runner build for E5-S4 (story R1); linux-x64 production and the signing story remain validated. Does NOT block MS-0002.
  - **Fail (linux-x64 does not run on the clean OS)** → the no-runtime promise (C-2/NFR-COMP-2) is challenged; document and surface for owner review before E5-S4.
  - **Catastrophic fail (no runnable single-binary path at all)** → escalate to ADR-0001 language-level reconsideration; CEO records a decision; do **not** silently proceed.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | spec-writer (GH-13) | Initial specification seeded from the authoritative story MS2-E1-S3, epic MS2-E1, ADR-0001, `doc/spec/nonfunctional.md` (NFR-PERF-1/2, NFR-COMP-1/2), and the GH-11 spike precedent. |

---

## AUTHORING GUIDELINES

- **Source of truth for scope**: the authoritative story `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md` — its Goal, Hypotheses (H1–H5), 8-step Methodology, 6-item AC checklist, Out-of-scope, and CEO-resolved R1/R2 were used as the seed. No ACs beyond the story's six (plus the standard secret-hygiene AC7) were introduced.
- **Precedent / structural template**: `doc/changes/2026-07/2026-07-06--GH-11--mermaid-render-spike/chg-GH-11-spec.md` — same spike framing (findings + evidence + recommendation, not production code), same 25-section structure, same evidence-pointer AC style, same standalone-workspace + no-`src/`-touch boundary.
- **Decisions referenced by ID**: ADR-0001 (language/runtime; C-2/C-3 this validates; signing Unresolved Question; cross-compile revisit trigger).
- **NFRs referenced by canonical ID**: NFR-PERF-1 (≤90 MB desired), NFR-PERF-2 (≤2 s cold-start desired), NFR-COMP-1 (MS-0002 = Linux+Windows), NFR-COMP-2 (clean-OS run, no runtime) — from `doc/spec/nonfunctional.md`. The §9 table uses spike-local measurable IDs (NFR-CC/RUN/SIZE/START/SIGN/EVID/SEC) per the spike's authoring requirements, each traced to its canonical NFR in the rationale column.
- **Coding-rules consistency check**: `.ai/rules/typescript.md` (ESM, strict TS, `package.json` `"type":"module"`, Bun conventions) was consulted for terminology only; no implementation detail is encoded in this spec.
- **Spike framing**: the deliverable is **findings + evidence + a recommendation + a build-script skeleton**, not production code. The standalone workspace path (`spikes/bun-compile-smoke/`) and the explicit non-touching of `src/` are scope boundaries, not implementation steps.
- **`change.type: spike`** reflects the PM's explicit designation and the existing branch `spike/GH-13/bun-cross-compile-smoke`; it is outside the conventional-commits type set and may be reconciled at the DoR gate if required (consistent with the GH-11 precedent).
- **No ADR mutation**: per the PM, any ADR-0001 cross-compile verification pointer / signing-evidence update occurs in lifecycle phase 7 (doc-sync); this spec only produces the enabling evidence.
- **Environment decisions**: wine absent (DEC-3), osslsigncode absent (DEC-4), Docker reachable, Bun version pin (DEC-2) were PM-decided/confirmed and encoded as DEC entries (not open questions), per the spike's authoring requirements.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-13)
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1–25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, NFR-, RSK-, DEC-, AC, plus the H hypotheses)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then (AC1–AC7)
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no production file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (referenced by ID/path only)
- [x] Front matter validates per front_matter_rules
