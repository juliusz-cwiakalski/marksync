---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-13-bun-cross-compile-smoke
status: Proposed
created: 2026-07-06T19:59:00Z
last_updated: 2026-07-06T19:59:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [spike, ms-0002, adr-0001-validation, bun-compile]
links:
  change_spec: ./chg-GH-13-spec.md
  test_plan: ./chg-GH-13-test-plan.md
  authoritative_story: ../../../planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md
  downstream_story_e5_s4: ../../../planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  typescript_rules: ../../../.ai/rules/typescript.md
  adr_0001: ../../../decisions/ADR-0001-implementation-language-and-runtime.md
  nonfunctional: ../../../spec/nonfunctional.md
summary: >
  Load-bearing spike producing findings + evidence + a reusable build-script skeleton (not production
  code). Cross-compiles a minimal smoke CLI to `bun-linux-x64` and `bun-windows-x64` from a Linux dev
  host, runs the linux-x64 binary inside a clean-OS Docker image (`debian:slim` primary, `alpine`
  stretch) with no Bun/Node installed, measures binary size + cold-start against the "desired, not
  hard" MS-0002 budget (≤90 MB / ≤2 s), and documents the Windows Authenticode signing path
  (`osslsigncode`) as a dry-run command. The outcome either unblocks MS2-E5-S4 (cross-platform binary
  builds) with the committed `scripts/build-binaries.sh` skeleton, or triggers the documented
  fallback (Windows CI runner for the Windows runtime smoke; recorded-and-flagged size/cold-start
  exceedance) — escalating to ADR-0001 language-level reconsideration only on catastrophic
  cross-compile failure. All code lives in a standalone `spikes/bun-compile-smoke/` workspace; the
  main `src/` tree is not touched.
version_impact: none
---

# IMPLEMENTATION PLAN — GH-13: [MS2-E1-S3] Bun single-binary cross-compile smoke

## Context and Goals

This plan delivers a **load-bearing spike**, not a feature or production code. The deliverable is a
committed **standalone spike workspace** (`spikes/bun-compile-smoke/`) plus a **findings document**
(`findings/bun-compile-smoke-findings.md`) that records an explicit PASS/FAIL for each of hypotheses
H1–H5 with evidence pointers and a single clear MS-0002 / MS2-E5-S4 recommendation — and a reusable
**`scripts/build-binaries.sh` skeleton** (F-7) that MS2-E5-S4 consumes and refines into the production
release matrix.

The spike is the empirical validation of **ADR-0001's distribution promise** — specifically **C-2**
(single self-contained binary per OS+arch, no mandatory language runtime) and **C-3** (cross-platform
Linux/Windows). ADR-0001 (governance-`Accepted`, confidence **Medium**) chose TypeScript + Bun
`build --compile` precisely to satisfy C-2/C-3, but the cross-compile mechanism itself is the
**asserted-but-unvalidated load-bearing unknown UNCERT-2**, and ADR-0001 carries an open Unresolved
Question on whether "binary signing/notarization tooling for Bun-compiled artifacts meets the
enterprise trust bar." This spike validates C-2/C-3 for the MS-0002 Linux+Windows slice and supplies
the signing-path evidence (H5). On PASS, MS2-E5-S4 is unblocked with the build-script skeleton. On a
documented partial result (size/cold-start exceedance, or win-x64 target unavailable), MS-0002 is
**not** blocked (NFR-PERF-1/2 are "desired, not hard"; DEC-5). On catastrophic cross-compile failure
(no runnable single-binary path at all), the plan escalates to ADR-0001 language-level
reconsideration — **conditional, and not pre-decided** (the spike is expected to PASS).

**How this connects to the change spec:** every phase traces to one or more spec acceptance criteria
(AC1–AC7), functional capabilities (F-1…F-7), spike-NFRs (NFR-CC/RUN/SIZE/START/SIGN/EVID/SEC), and
hypotheses (H1–H5). The coder executes phases in order; each phase is one Conventional Commit. All
spike code is confined to `spikes/bun-compile-smoke/`; the only repo-root-level artifacts are
`scripts/build-binaries.sh` (the E5-S4 skeleton) and `findings/bun-compile-smoke-findings.md`.

**Hard guardrail (spec NG-5, RSK-5):** NO file under the main `src/` tree is created, edited, or
deleted by any phase. The repo is pre-scaffolding (no root `package.json` yet); the spike introduces
its own standalone workspace and must not couple a throwaway experiment to production.

**Resolved open questions (none pending):** all genuinely-open factual questions (H1–H5) are resolved
by spike execution itself; the CEO-resolved R1 (Bun target-name drift) and R2 (binary > 90 MB) are
encoded as DEC-2 / DEC-5; the PM-decided environment fallbacks (wine absent → DEC-3; osslsigncode
absent → DEC-4; alpine musl → RSK-4) are encoded as DEC/RSK entries and phase preconditions.

> **Decision needed?** No — the spike's decisions (DEC-1…DEC-5) are already resolved in the spec;
> this plan only executes them. The spike *produces the evidence* that a later owner decision
> (advance MS2-E5-S4 vs fallback vs ADR-0001 language-level reconsideration) consumes. The sole
> `@decision-advisor` engagement is **conditional** on a catastrophic cross-compile failure
> (Appendix B worst case) — which is **not** pre-decided here and is **not** expected.

## Scope

### In Scope

- A **standalone spike workspace** under `spikes/bun-compile-smoke/` with its own `package.json`
  (`"type":"module"`, `private:true`, Bun scripts) — F-1. `node_modules` and the ~90 MB ephemeral
  build outputs (binaries) are gitignored; their sizes are recorded in the findings doc.
- A **minimal smoke CLI** (`src/cli.ts`) that prints `marksync 0.0.0` — a smoke binary, NOT the real
  CLI (spec NG-3). Plain `console.log` is acceptable; Cliffy is optional and, if used, kept minimal.
- **Cross-compile** to `bun-linux-x64` (Phase 1) and `bun-windows-x64` (Phase 2) from the Linux dev
  host (H1; F-1).
- **Clean-OS Linux smoke** via `debian:slim` (primary, H2) and `alpine` (stretch; musl/glibc note
  recorded) with no Bun/Node installed (F-2; NFR-COMP-2).
- **Size measurement** (H3) and **cold-start measurement** (H4), each with the actual value recorded
  against the "desired, not hard" budget (NFR-PERF-1 ≤90 MB; NFR-PERF-2 ≤2 s) — flagged, not
  blocking (DEC-5).
- **Signing dry-run**: the exact `osslsigncode` command that *would* sign the Windows binary, with
  the cert/Authenticode plug-in point documented (H5; F-5). No real cert; no installation (DEC-4).
- The **findings document** at `findings/bun-compile-smoke-findings.md` with explicit PASS/FAIL per
  H1–H5 + a measurements table + a single clear MS-0002/E5-S4 recommendation (F-6; AC6).
- A reusable **`scripts/build-binaries.sh` skeleton** at the repo root, committed for MS2-E5-S4
  consumption/refinement (F-7).

### Out of Scope

- **macOS target** — deferred to MS-0003 per NFR-COMP-1 and the story's Out-of-scope (spec NG-1).
- **arm64 targets** as a gate — stretch only; record whether `--target=bun-linux-arm64` works but do
  not block (spec NG-2). Primary targets are x64.
- **The real CLI feature set** — this is a smoke binary that prints a version string (spec NG-3).
- **Real code-signing** with a production certificate — dry-run command only (spec NG-4; DEC-4).
- **Modifying any file under the main `src/` tree** — explicitly forbidden (spec NG-5; RSK-5).
- **Updating ADR-0001's status or revisit-trigger disposition** — that is lifecycle phase 7
  (`@doc-syncer`); this spike only produces the enabling evidence (spec NG-6). Captured in the
  Doc-update coverage section below.
- **The clean-OS Windows runtime smoke** — `wine` is absent in this environment (DEC-3); the win-x64
  binary is **produced** and verified as a PE32+ executable, but the Windows *run* is **deferred to a
  Windows CI runner** in MS2-E5-S4 (story step-5 explicit fallback).
- **CI wiring** — the spike is NOT wired into `.github/workflows/ci.yml` or any workflow. It runs
  locally via the Bun runtime + Docker; the findings document is the committed deliverable.
- **Production packaging/release** of the spike (spec OUT).
- These are **empirical probes** (cross-compile, clean-OS run, size/cold-start, signing doc, secret
  scan), NOT one of the six production test tiers and NOT wired into the project test runner
  (`bun test`). They run via `bun run` (the runtime) and `docker run` in the spike workspace only
  (`.ai/rules/testing-strategy.md` — spike context; no unit/integration tier applies).

### Constraints

- **C-SPIKE-1 (standalone workspace):** All spike code, the smoke CLI, and the probe runner live
  under `spikes/bun-compile-smoke/` with their own `package.json`. Zero coupling to the main `src/`
  tree (spec DEC-1).
- **C-SPIKE-2 (no `src/` modification):** No file under the repo-root `src/` may be created, edited,
  or deleted. Reviewed at the review gate (spec NG-5, RSK-5). The only repo-root-level artifacts are
  `scripts/build-binaries.sh` and `findings/bun-compile-smoke-findings.md`.
- **C-SPIKE-3 (pinned Bun version):** Bun **1.1.34** is installed and pinned (matches GH-11; spec
  DEC-2). The exact version is recorded in the findings for reproducibility (story R1).
- **C-SPIKE-4 (Docker required for H2):** Docker **27.3.1** is installed and the daemon is reachable
  (PM-confirmed). The H2 clean-OS Linux smoke runs via `debian:slim` (primary) and `alpine`
  (stretch). This is a precondition, not a blocker.
- **C-SPIKE-5 (Windows run deferred):** `wine` is NOT installed (DEC-3). The win-x64 binary is
  produced and verified as a PE32+ executable via `file(1)`; the clean-OS Windows RUN is deferred to
  a Windows CI runner in E5-S4. H1's cross-compile *production* remains fully testable.
- **C-SPIKE-6 (signing is doc-only):** `osslsigncode` is NOT installed (DEC-4). H5 is satisfied by
  documenting the exact dry-run command (sign/verify/extract-signature), not by executing it.
- **C-SPIKE-7 (desired, not hard):** NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s) are "desired, not
  hard" (DEC-5). Size/cold-start exceedance is **recorded + flagged, NEVER blocking** for MS-0002.
- **C-SPIKE-8 (no outbound network):** The smoke binary makes no network calls (spec §20, §21; privacy
  default preserved).
- **C-SPIKE-9 (no CI wiring):** No edits to `.github/workflows/**` (the spike is not added to the
  fast loop or any workflow).
- **C-SPIKE-10 (commit hygiene):** `node_modules/` and the ~90 MB ephemeral binaries
  (`marksync-linux-x64`, `marksync-win-x64.exe`) are gitignored; only the smoke CLI source, the
  `package.json`, the probe runner, the findings doc, and the `scripts/build-binaries.sh` skeleton are
  committed. Binary **sizes** go in the findings doc, not git.

### Risks

- **RSK-1** (win-x64 cross-compile target unavailable or renamed in the pinned Bun — story R1):
  Mitigated by the pinned Bun 1.1.34 (DEC-2); if win-x64 is unavailable, document the fact and fall
  back to a **Windows CI runner build** for E5-S4. H1's linux-x64 production and the signing story
  remain testable. Does NOT block MS-0002.
- **RSK-2** (binary exceeds 90 MB — story R2): Accepted per DEC-5 ("desired, not hard"). **Record
  actual + flag**; do NOT block MS-0002. The CEO waives NFR-PERF-1 as a hard gate.
- **RSK-3** (`wine` absent → Windows run cannot execute locally — story step-5 fallback, confirmed):
  Produce the win-x64 binary and log its production + verify PE32+ via `file(1)` (H1 fully testable);
  **defer the Windows runtime smoke to a Windows CI runner** in E5-S4 (DEC-3); record the deferral in
  the findings.
- **RSK-4** (`alpine` (musl) cannot run the glibc-linked Bun binary — dynamic-link failure):
  `debian:slim` (glibc) is the **primary** clean-OS image; `alpine` is a stretch — record the
  musl/glibc note and fall back to `debian:slim`. NFR-RUN-1 is satisfied by `debian:slim`.
- **RSK-5** (spike accidentally touches the main `src/` tree, coupling a throwaway experiment to
  production): Standalone workspace (C-SPIKE-1/C-SPIKE-2) + review gate on the spike diff.
- **RSK-6** (catastrophic cross-compile failure — no runnable single-binary path at all): Documented
  escalation to **ADR-0001 language-level reconsideration**; CEO records a decision via
  `@decision-advisor`; the team does **NOT silently proceed**. MS-0002's core publish path is not
  blocked (it does not depend on a shipped binary to develop), but the distribution promise is
  materially challenged. **Not pre-decided; not expected.**

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Cross-compile success | 2/2 targets (`bun-linux-x64`, `bun-windows-x64`) compile from the Linux dev host (exit 0) | spec §4.1; AC1 / H1 |
| Clean-OS Linux run | exit 0 + version string on `debian:slim` with no Bun/Node installed | spec §4.1; AC2 / H2 |
| Binary size | ≤90 MB **desired**; **actual recorded** (flagged if larger, NOT blocking) | spec §4.1; AC3 / H3; DEC-5 |
| Cold-start | ≤2 s **desired**; **actual recorded** (documented if longer, NOT blocking) | spec §4.1; AC4 / H4; DEC-5 |
| Signing story | 1 concrete `osslsigncode` dry-run command documented + cert/Authenticode plug-in point | spec §4.1; AC5 / H5 |
| Findings completeness | explicit PASS/FAIL recorded for each of H1–H5 with evidence + one clear MS-0002/E5-S4 recommendation | spec §4.1; AC6 |
| Secret hygiene | 0 secrets in any committed artifact | spec §4.1; AC7 |

## Phases

> **Execution model:** phases run strictly in order. Each phase is **one Conventional Commit**
> (commit message per phase). The coder may be invoked as
> `/run-plan GH-13 execute all remaining phases no review`; every phase below is independently
> executable and committable.
>
> **Commit types:** `chore(spike):` for scaffolding/compile code; `test(spike):` for the Docker +
> measurement probes; `docs(spike):` for the signing dry-run and the findings doc; `feat(scripts):`
> for the repo-root `scripts/build-binaries.sh` skeleton. **`spike` is NOT a valid Conventional
> Commits type** — it is used as a *scope*, not a type (consistent with the GH-11 precedent and the
> spec's `change.type: spike`).
>
> **Workspace:** every spike path below is relative to the repo root and prefixed with
> `spikes/bun-compile-smoke/` unless explicitly noted otherwise. The findings doc lives at
> `findings/bun-compile-smoke-findings.md` (repo root, alongside the spike workspace); the build
> skeleton lives at `scripts/build-binaries.sh` (repo root).
>
> **Environment preconditions (PM-decided — encoded as phase preconditions, NOT blockers):**
> Bun 1.1.34 installed/pinned (DEC-2); Docker 27.3.1 installed and daemon reachable (H2 clean-OS
> smoke via `debian:slim` primary + `alpine` stretch); `wine` NOT installed (win-x64 produced +
> verified PE32+ via `file(1)`; Windows RUN deferred to E5-S4 — DEC-3); `osslsigncode` NOT installed
> (H5 documentation-only — DEC-4).
>
> **Probe ID convention:** the test plan (`chg-GH-13-test-plan.md`, being written in parallel)
> finalizes exact IDs as `TC-BCS-NNN`. This plan designs around the **probe categories**; if the test
> plan has landed by execution time, the coder reconciles the IDs one-to-one with the categories
> below.

---

### Phase 0: Spike workspace scaffolding

**Goal**: Create the standalone spike workspace with its own `package.json`, `.gitignore`, README
stub, and a minimal smoke CLI that prints `marksync 0.0.0`. This phase makes every subsequent
compile/probe phase runnable via `bun run`. F-1 (partial); story methodology step-1.

**Tasks**:

- [x] **0.1** Create `spikes/bun-compile-smoke/package.json` with: _(done — incl. probe:arm64 + probe:secrets; commit 36d2c6c)_
  - `"type": "module"`, `"private": true`
  - no `"name"` that collides with the main package (keep it self-contained, e.g.
    `"name": "marksync-bun-compile-smoke"`)
  - `scripts`:
    - `"cli": "bun run src/cli.ts"`
    - `"build:linux": "bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64"`
    - `"build:windows": "bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe"`
    - `"probe:clean-os-debian": "bash probes/clean-os-debian.sh"`
    - `"probe:clean-os-alpine": "bash probes/clean-os-alpine.sh"`
    - `"probe:size": "bash probes/measure-size.sh"`
    - `"probe:cold-start": "bash probes/measure-cold-start.sh"`
    - `"probe:all": "bash run-probes.sh"`
  - No runtime dependencies required for a plain-`console.log` smoke binary. (Cliffy is optional; if
    used, pin a minimal version and record the choice — a smoke binary does not need a CLI framework.)
- [x] **0.2** Create `spikes/bun-compile-smoke/src/cli.ts` — a minimal smoke CLI that prints _(done — plain console.log, honors --version/version; commit 36d2c6c)_
  `marksync 0.0.0` (plain `console.log("marksync 0.0.0")` is sufficient; this is a smoke binary, NOT
  the real CLI — spec NG-3). Honor a `--version`/`version` arg by printing the same string (the
  clean-OS smoke invokes `./marksync-linux-x64 --version`).
- [x] **0.3** Create `spikes/bun-compile-smoke/.gitignore` ignoring: _(done — node_modules/, marksync-linux-x64, marksync-win-x64.exe, arm64/darwin binaries, dist/, *.log; commit 36d2c6c)_
  - `node_modules/`
  - the ephemeral ~90 MB build outputs: `marksync-linux-x64`, `marksync-win-x64.exe`
  - the evidence capture dir if kept local-only: `evidence/` (or commit small logs — coder's call,
    but binaries STAY gitignored)
  - any logs (`*.log`)
- [x] **0.4** Create `spikes/bun-compile-smoke/README.md` stub with: _(done — stub; finalized Phase 8; commit 36d2c6c)_ purpose (one paragraph — what
  the spike validates; pointer to the findings doc), prerequisites (Bun 1.1.34; Docker for H2), and
  the quick-start commands (`bun run build:linux`, `bun run build:windows`, `bun run probe:all`).
  Note that the full run-book is finalized in Phase 8.
- [x] **0.5** Verify the environment: `bun --version` reports **1.1.34** (DEC-2); `docker version`
  reports the daemon reachable (Docker 27.3.1); `bun run cli` prints `marksync 0.0.0`. Record the
  Bun version (it goes into the findings doc in Phase 7). _(VERIFIED: bun 1.1.34, docker 27.3.1, `bun run cli` → `marksync 0.0.0`; commit 36d2c6c)_
- [x] **0.6** Verify no file under the repo-root `src/` is touched (C-SPIKE-2); verify `node_modules/`
  and the binaries are gitignored (C-SPIKE-10). _(VERIFIED: no root src/ exists — pre-scaffolding; .gitignore excludes binaries + node_modules; commit 36d2c6c)_

**Acceptance Criteria**:

- Must: `spikes/bun-compile-smoke/package.json` exists with `"type":"module"`, `"private":true`, and
  the build + probe scripts above (C-SPIKE-1).
- Must: `bun run cli` prints `marksync 0.0.0` under Bun 1.1.34 (C-SPIKE-3).
- Must: `.gitignore` excludes `node_modules/`, `marksync-linux-x64`, `marksync-win-x64.exe`
  (C-SPIKE-10).
- Must: no file under the repo-root `src/` is touched (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: scaffolding only (contributes to the workspace deliverable of
AC1's precondition).

**Affected code areas**:

- `spikes/bun-compile-smoke/package.json` (new)
- `spikes/bun-compile-smoke/src/cli.ts` (new — the smoke binary)
- `spikes/bun-compile-smoke/.gitignore` (new)
- `spikes/bun-compile-smoke/README.md` (new — stub)

**System docs to update**:

- none (spike scaffolding touches no system docs; ADR/spec reconciliation is lifecycle phase 7).

**Tests**:

- Manual: `cd spikes/bun-compile-smoke && bun run cli` exits 0 and prints `marksync 0.0.0`.
- Manual: `git status` shows the workspace files tracked and `src/` (repo root) untouched.

**Completion signal**: `chore(spike): scaffold bun-compile-smoke workspace (GH-13)`

---

### Phase 1: Linux x64 cross-compile (H1a)

**Goal**: Validate **H1a** — `bun build --compile --target=bun-linux-x64` succeeds from the Linux dev
host and produces a runnable ELF executable. F-1; AC1 (partial); story methodology step-2. This is
the first half of the load-bearing cross-compile evidence.

**Tasks**:

- [x] **1.1** Run `bun run build:linux` (i.e.
  `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64`) in
  `spikes/bun-compile-smoke/`. Confirm exit 0 and that `marksync-linux-x64` is produced. _(exit 0; bundle 1 module [8ms], compile [126ms])_
- [x] **1.2** Verify the output is an ELF executable: `file marksync-linux-x64` reports
  `ELF 64-bit LSB executable, x86-64, ...` (i.e. a native Linux binary, not a script). _(ELF 64-bit LSB executable, x86-64, dynamically linked — confirmed)_
- [x] **1.3** Smoke-run the produced binary on the dev host: `./marksync-linux-x64 --version` prints
  `marksync 0.0.0` and exits 0 (a first sanity check before the clean-OS run in Phase 3). _(prints `marksync 0.0.0`, exit 0)_
- [x] **1.4** Capture the H1a evidence: the exact `bun build --compile` invocation, `bun --version`
  (1.1.34), the `file(1)` classification, and the exit status. Persist to evidence (this feeds the
  Phase 7 findings doc and the `run-probes.sh` aggregation). _(captured to evidence/phase1-linux-x64.txt)_

**Acceptance Criteria**:

- Must: `bun build --compile --target=bun-linux-x64` exits 0 and produces `marksync-linux-x64`
  (NFR-CC-1 partial; AC1).
- Must: `file marksync-linux-x64` classifies it as an ELF x86-64 executable.
- Must: the produced binary prints the version string and exits 0 on the dev host.
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC1 / H1 (linux-x64 half)**.

**Probe mapping**: TC-BCS-001 (Linux cross-compile) — category finalized by the test plan.

**Affected code areas**:

- `spikes/bun-compile-smoke/marksync-linux-x64` (new — **gitignored** ephemeral build output;
  evidence of its production is captured, the file itself is not committed per C-SPIKE-10)

**System docs to update**:

- none.

**Tests**:

- Manual: `cd spikes/bun-compile-smoke && bun run build:linux` → exit 0; `file marksync-linux-x64`
  → ELF x86-64; `./marksync-linux-x64 --version` → `marksync 0.0.0`.

**Completion signal**: `chore(spike): linux-x64 cross-compile probe (H1) (GH-13)`

---

### Phase 2: Windows x64 cross-compile (H1b)

**Goal**: Validate **H1b** — `bun build --compile --target=bun-windows-x64` succeeds from the Linux
dev host and produces a PE32+ Windows executable. F-1; AC1 (complete with Phase 1); story methodology
step-3. The clean-OS Windows *run* is deferred to E5-S4 (DEC-3); H1's cross-compile *production* is
fully testable here.

**Tasks**:

- [x] **2.1** Run `bun run build:windows` (i.e.
  `bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe`) in
  `spikes/bun-compile-smoke/`. Confirm exit 0 and that `marksync-win-x64.exe` is produced.
  - *Contingency (RSK-1):* if the `bun-windows-x64` target is unavailable or renamed in Bun 1.1.34,
    record the exact error, mark H1b as DEFERRED (Windows CI runner build for E5-S4), and proceed —
    linux-x64 production (Phase 1) and the signing story (Phase 5) remain valid. Do NOT block. _(exit 0; marksync-win-x64.exe produced — bun-windows-x64 target IS available in 1.1.34; RSK-1 NOT triggered)_
- [x] **2.2** Verify the output is a PE32+ executable: `file marksync-win-x64.exe` reports
  `PE32+ executable (console) x86-64, ...` (a native Windows binary). _(`PE32+ executable for MS Windows 6.00 (console), x86-64, 10 sections` — confirmed)_
- [x] **2.3** Record the clean-OS Windows RUN deferral (DEC-3): `wine` is absent in this environment,
  so the win-x64 binary is **produced + verified as PE32+** but NOT run under wine. The Windows
  runtime smoke is deferred to a Windows CI runner in MS2-E5-S4 (story step-5 explicit fallback).
  This deferral is echoed in the Phase 7 findings doc. _(recorded in evidence/phase2-windows-x64.txt)_
- [x] **2.4** Capture the H1b evidence: the exact invocation, the `file(1)` PE32+ classification, the
  exit status, and (if applicable) the RSK-1 deferral note. Persist to evidence. _(captured to evidence/phase2-windows-x64.txt)_

**Acceptance Criteria**:

- Must: `bun build --compile --target=bun-windows-x64` exits 0 and produces `marksync-win-x64.exe`
  (NFR-CC-1 partial; AC1) **OR** an RSK-1 deferral is recorded (win-x64 target unavailable →
  Windows CI runner for E5-S4).
- Must: `file marksync-win-x64.exe` classifies it as a PE32+ x86-64 executable (on success).
- Must: the DEC-3 deferral (Windows RUN → E5-S4 Windows CI runner) is explicitly recorded.
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC1 / H1 (win-x64 half — production complete; run deferred
per DEC-3)**.

**Probe mapping**: TC-BCS-002 (Windows cross-compile).

**Affected code areas**:

- `spikes/bun-compile-smoke/marksync-win-x64.exe` (new — **gitignored** ephemeral build output)

**System docs to update**:

- none.

**Tests**:

- Manual: `cd spikes/bun-compile-smoke && bun run build:windows` → exit 0; `file marksync-win-x64.exe`
  → PE32+ x86-64. (The binary is NOT run under wine — DEC-3.)

**Completion signal**: `chore(spike): windows-x64 cross-compile probe (H1) (GH-13)`

---

### Phase 3: Clean-OS Linux Docker smoke (H2)

**Goal**: Validate **H2** — the linux-x64 binary runs on a minimal Docker image with **no** Bun/Node
installed, exits 0, and prints a version string. This is the empirical proof of the "no mandatory
runtime" promise (ADR-0001 C-2; NFR-COMP-2). F-2; AC2; story methodology step-4. `debian:slim`
(glibc) is the primary clean-OS image; `alpine` (musl) is a stretch (RSK-4).

**Tasks**:

- [x] **3.1** Create `spikes/bun-compile-smoke/probes/clean-os-debian.sh` that runs the linux-x64
  binary inside a clean `debian:slim` container and asserts the result:
  `docker run --rm -v "$PWD":/x -w /x debian:slim ./marksync-linux-x64 --version`
  - Assert exit code is 0 AND the output contains `marksync` (the version string). _(created; NOTE: real Docker Hub tag is `debian:stable-slim` — `debian:slim` is not published; reconciliation recorded in probe header + findings. exit 0 + `marksync 0.0.0`.)_
- [x] **3.2** Verify the `debian:slim` image has **no** Bun/Node installed (NFR-COMP-2):
  `docker run --rm debian:slim sh -c 'command -v bun node || echo "none"'` → prints `none` (i.e. no
  language runtime is present; the binary runs purely on the embedded Bun runtime). _(verified: `command -v bun node deno` → exit=127, none present)_
- [x] **3.3** Create `spikes/bun-compile-smoke/probes/clean-os-alpine.sh` (stretch) that repeats the
  run inside `alpine`:
  `docker run --rm -v "$PWD":/x -w /x alpine ./marksync-linux-x64 --version`
  - Record the result. If alpine (musl) cannot run the glibc-linked Bun binary (dynamic-link
    failure), record the exact musl/glibc failure mode and fall back to `debian:slim` (RSK-4). NFR-RUN-1
    is satisfied by `debian:slim`; alpine is informational only. _(created; RSK-4 failure recorded: `exec ./marksync-linux-x64: no such file or directory` = glibc dynamic loader `/lib64/ld-linux-x86-64.so.2` absent under musl; non-blocking)_
- [x] **3.4** Capture the H2 verdict: `debian:slim` PASS (exit 0 + version + no runtime) is the
  gate; `alpine` is recorded as PASS or a documented musl/glibc failure mode. Persist to evidence. _(captured to evidence/phase3-clean-os.txt; H2 PASS)_

**Acceptance Criteria**:

- Must: the linux-x64 binary exits 0 and prints the version string inside `debian:slim` with no
  Bun/Node installed (NFR-RUN-1; AC2 / H2).
- Must: the clean-OS image is confirmed to have no `bun`/`node` on `$PATH` (NFR-COMP-2).
- Must: the alpine stretch result is recorded (PASS or documented musl/glibc failure — RSK-4);
  `debian:slim` satisfies NFR-RUN-1 regardless.
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC2 / H2**.

**Probe mapping**: TC-BCS-003 (clean-OS debian:slim — primary) + TC-BCS-004 (clean-OS alpine —
stretch).

**Affected code areas**:

- `spikes/bun-compile-smoke/probes/clean-os-debian.sh` (new)
- `spikes/bun-compile-smoke/probes/clean-os-alpine.sh` (new — stretch)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/bun-compile-smoke && bun run probe:clean-os-debian` → exit 0 + version printed,
  no Bun/Node in the image. (Docker daemon must be reachable — C-SPIKE-4.)
- Run: `cd spikes/bun-compile-smoke && bun run probe:clean-os-alpine` → recorded (PASS or musl/glibc
  note).

**Completion signal**: `test(spike): clean-OS linux docker smoke (H2) (GH-13)`

---

### Phase 4: Binary size + cold-start measurement (H3, H4)

**Goal**: Record the actual binary size (H3) and cold-start time (H4) against the "desired, not hard"
MS-0002 budget (≤90 MB / ≤2 s), so E5-S4 and the release pipeline have a real baseline. F-3, F-4;
AC3, AC4; story methodology step-6. Exceedance is **recorded + flagged, NEVER blocking** (DEC-5).

**Tasks**:

- [x] **4.1** Create `spikes/bun-compile-smoke/probes/measure-size.sh` that records the binary size:
  - `stat -c %s marksync-linux-x64` (bytes) and `stat -c %s marksync-win-x64.exe` (bytes) on the
    produced binaries.
  - Convert bytes → MB using the convention **1 MB = 1,048,576 bytes** (record the convention in the
    probe header and the findings doc — it is the binary-size convention for this spike).
  - Compare each to the ≤90 MB desired budget (NFR-PERF-1). Flag if exceeded; **do NOT fail the
    probe** (DEC-5 — desired, not hard). _(created; LC_ALL=C for dot decimals; linux 96.90 MB + win 105.12 MB both FLAGGED, not blocking)_
- [x] **4.2** Create `spikes/bun-compile-smoke/probes/measure-cold-start.sh` that records cold-start
  on the **clean-OS Linux container** (fresh process each invocation):
  - `docker run --rm -v "$PWD":/x -w /x debian:slim /usr/bin/time -v ./marksync-linux-x64 --version`
  - Capture `Elapsed (wall clock) time` (cold-start) and `Maximum resident set size` (informational
    RSS). Run a few samples (e.g. 3–5) and record the range/median.
  - Note: `/usr/bin/time` may not be present in `debian:slim` by default — install it inside the
    ephemeral container (`apt-get update && apt-get install -y --no-install-recommends time`) or use
    a `bash`-based wall-clock measurement if `time` is unavailable. Record which method was used. _(created; uses debian:stable-slim + ephemerally installs GNU `time`; 5 fresh-process samples; parses GNU time's tab-indented output)_
- [x] **4.3** Compare the cold-start to the ≤2 s desired budget (NFR-PERF-2). Document if longer;
  **do NOT fail the probe** (DEC-5). _(median 0.010s — well within 2s; H4 PASS)_
- [x] **4.4** Capture the H3 + H4 measured values (size MB per target, cold-start wall-clock range,
  RSS) to evidence — this is the baseline that E5-S4 and the release pipeline reference. _(captured to evidence/phase4-measurements.txt; RSS ~34.7 MB)_

**Acceptance Criteria**:

- Must: the actual binary size is recorded in MB (1 MB = 1,048,576 bytes) for both targets, compared
  to ≤90 MB desired, flagged if exceeded but NOT blocking (NFR-SIZE-1; AC3 / H3; DEC-5).
- Must: the actual cold-start wall-clock is recorded on the clean-OS Linux container, compared to
  ≤2 s desired, documented if longer but NOT blocking (NFR-START-1; AC4 / H4; DEC-5).
- Must: the measurement method (size convention; cold-start harness; sample count) is recorded for
  reproducibility.
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC3 / H3** + **AC4 / H4**.

**Probe mapping**: TC-BCS-005 (size measurement) + TC-BCS-006 (cold-start measurement).

**Affected code areas**:

- `spikes/bun-compile-smoke/probes/measure-size.sh` (new)
- `spikes/bun-compile-smoke/probes/measure-cold-start.sh` (new)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/bun-compile-smoke && bun run probe:size` → records size MB per target + budget
  flag.
- Run: `cd spikes/bun-compile-smoke && bun run probe:cold-start` → records wall-clock + RSS on the
  clean-OS container.

**Completion signal**: `test(spike): size + cold-start measurement (H3, H4) (GH-13)`

---

### Phase 5: Windows signing dry-run documentation (H5)

**Goal**: Document the Windows Authenticode signing path with a concrete `osslsigncode` dry-run
command (sign/verify/extract-signature) and the cert/Authenticode plug-in point. F-5; AC5; story
methodology step-7. `osslsigncode` is NOT installed (DEC-4) — H5 is satisfied by **documentation
only**; no execution. macOS notarization is out of scope (deferred).

**Tasks**:

- [ ] **5.1** Author the exact `osslsigncode` **sign** command block (placeholder cert/pkey paths,
  timestamp URL, hash algo) into the spike's signing reference (this lands in the Phase 7 findings
  doc, but the canonical command text is authored here so Phase 7 can reference it verbatim). A
  representative form:
  ```bash
  # Authenticode sign (dry-run — placeholder cert; osslsigncode NOT installed in this env, DEC-4)
  osslsigncode sign \
    -pkcs12 /path/to/authenticode.p12 \
    -pass "$CERT_PASSWORD" \
    -t http://timestamp.digicert.com \
    -h sha256 \
    -in marksync-win-x64.exe \
    -out marksync-win-x64-signed.exe
  ```
- [ ] **5.2** Author the **verify** and **extract-signature** companion commands, e.g.
  `osslsigncode verify -in marksync-win-x64-signed.exe` and
  `osslsigncode extract-signature -in marksync-win-x64-signed.exe -out marksync-win-x64.pkcs7`.
- [ ] **5.3** Document where a **real Authenticode cert** plugs in (the `-pkcs12`/`-pass` inputs and
  the timestamp URL), note that the actual production signing occurs in E5-S4 with a real cert, and
  explicitly note **macOS notarization is out of scope** (deferred to MS-0003 / a later signing
  story). Record that `osslsigncode` is not installed in this environment (DEC-4 — H5 is doc-only).

**Acceptance Criteria**:

- Must: a concrete `osslsigncode` sign command is documented with placeholder cert/pkey paths, a
  timestamp URL, and `sha256` hashing (NFR-SIGN-1; AC5 / H5).
- Must: the cert/Authenticode plug-in point is identified (the `-pkcs12`/`-pass` inputs).
- Must: macOS notarization is explicitly noted as out of scope.
- Must: the command is a dry-run reference string only — no real cert, no execution (DEC-4); no
  `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC5 / H5**.

**Probe mapping**: TC-BCS-007 (signing dry-run command documented).

**Affected code areas**:

- `spikes/bun-compile-smoke/probes/signing-dry-run.md` (new — the canonical command reference; the
  Phase 7 findings doc embeds/references it verbatim)

**System docs to update**:

- none.

**Tests**:

- Structural: the signing reference contains the `osslsigncode sign` command, a verify command, the
  cert plug-in point, and the macOS-out-of-scope note.

**Completion signal**: `docs(spike): windows signing dry-run command (H5) (GH-13)`

---

### Phase 6: Reusable build-script skeleton (F-7)

**Goal**: Create `scripts/build-binaries.sh` at the repo root — the reusable cross-compile skeleton
that MS2-E5-S4 consumes and refines into the production release matrix. F-7; spec G-7. It wraps the
**validated** linux-x64 + win-x64 compile invocations (Phases 1–2) with argument parsing, checksum
generation, and a signing TODO marker. Placed before the findings phase so the findings doc can
reference the committed skeleton.

**Tasks**:

- [ ] **6.1** Create `scripts/build-binaries.sh` at the repo root that wraps the two validated
  compile invocations:
  - `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile "$OUT_DIR"/marksync-linux-x64`
  - `bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile "$OUT_DIR"/marksync-win-x64.exe`
  - (The skeleton points at a placeholder entry — `./src/cli.ts` — that E5-S4 will repoint to the
    real CLI entry from E2-S1/E2-S3. Add a header comment noting it is an **E5-S4 skeleton refined
    from the GH-13 spike**, not a production script yet.)
- [ ] **6.2** Add **argument parsing**: target selection (`--target linux|windows|all`, default
  `all`), output directory (`--out-dir DIR`, default `./dist`), and a `--help` usage string. Keep
  it POSIX-sh / bash-portable (no exotic deps).
- [ ] **6.3** Add **checksum generation**: `sha256sum` per produced binary, written to
  `$OUT_DIR/SHA256SUMS` (mirrors the E5-S4 release-artifact contract).
- [ ] **6.4** Add a clearly-marked **TODO marker for signing** that references the Phase 5
  `osslsigncode` command block (e.g. `# TODO(E5-S4): wire osslsigncode sign — see
  spikes/bun-compile-smoke/probes/signing-dry-run.md`). Do NOT invoke signing (no cert, DEC-4).
- [ ] **6.5** Make the script executable (`chmod +x`) and add a brief header comment documenting
  that it is the E5-S4 skeleton, its inputs/outputs, and that it is validated by the GH-13 spike.

**Acceptance Criteria**:

- Must: `scripts/build-binaries.sh` exists at the repo root, is executable, and wraps both
  compile invocations (F-7; spec G-7).
- Must: argument parsing supports `--target` + `--out-dir` + `--help`.
- Must: checksums (`sha256sum` → `SHA256SUMS`) are generated.
- Must: a signing TODO references the Phase 5 dry-run command; signing is NOT invoked.
- Must: no `src/` change (C-SPIKE-2). (`scripts/build-binaries.sh` is the sole repo-root code
  artifact besides the findings doc.)

**Acceptance Criteria → AC mapping**: **F-7** (the reusable skeleton deliverable; supports AC6's
"build-script skeleton" requirement in spec §17.1).

**Probe mapping**: N/A (this is the reusable artifact, not a probe; E5-S4 is its consumer).

**Affected code areas**:

- `scripts/build-binaries.sh` (new — repo root; the E5-S4 skeleton)

**System docs to update**:

- none by the coder. (The downstream story MS2-E5-S4 references this skeleton; that cross-link is
  reconciled by `@doc-syncer` in lifecycle phase 7 — see Doc-update coverage.)

**Tests**:

- Manual: `bash scripts/build-binaries.sh --help` prints usage; `bash scripts/build-binaries.sh
  --target linux --out-dir /tmp/ms-dist` produces the linux-x64 binary + `SHA256SUMS`. (Runs from
  the spike workspace context or with the entry path adjusted; the skeleton is exercised end-to-end
  by E5-S4.)

**Completion signal**: `feat(scripts): build-binaries.sh skeleton for E5-S4 (GH-13)`

---

### Phase 7: Probe runner + findings aggregation (load-bearing deliverable)

**Goal**: Create `spikes/bun-compile-smoke/run-probes.sh` that runs all probes in sequence and
captures evidence, then author the **load-bearing findings document**
(`findings/bun-compile-smoke-findings.md`) with explicit PASS/FAIL per H1–H5 + a measurements table
+ a single clear MS-0002/E5-S4 recommendation. F-6; AC6; story methodology step-8. This is the
spike's actual deliverable.

**Tasks**:

- [ ] **7.1** Create `spikes/bun-compile-smoke/run-probes.sh` that runs the full pipeline in
  sequence (build:linux → build:windows → probe:clean-os-debian → probe:clean-os-alpine → probe:size
  → probe:cold-start), captures each probe's stdout/stderr/exit to `evidence/` (gitignored or
  committed-small-logs — coder's call, but binaries STAY gitignored), and records `bun --version`
  + the OS/platform. This orchestrator is itself reproducibility evidence.
- [ ] **7.2** Run `bun run probe:all` (i.e. `bash run-probes.sh`) and capture all results.
- [ ] **7.3** Create `findings/bun-compile-smoke-findings.md` (at the **repo root** under
  `findings/`, not under `spikes/`) with:
  - **Executive summary** + overall verdict.
  - **Per-hypothesis verdict table** (explicit PASS/FAIL/DEFERRED for each of H1–H5) with **evidence
    pointers** (probe output paths, `file(1)` classifications, Docker-run output, measured
    size/timing, the signing command reference).
  - **Measurements table**: binary size (MB, 1 MB = 1,048,576 bytes) per target vs ≤90 MB desired;
    cold-start wall-clock range/median vs ≤2 s desired; informational RSS. Flag any exceedance
    (DEC-5 — recorded, NOT blocking).
  - **Signing section**: the verbatim `osslsigncode` sign/verify/extract-signature command block
    (from Phase 5) + the cert/Authenticode plug-in point + macOS-out-of-scope note.
  - **Deferrals**: the DEC-3 Windows runtime smoke deferral (→ E5-S4 Windows CI runner) and any
    RSK-1/RSK-4 notes (win-x64 target; alpine musl).
  - **The build-script skeleton pointer**: reference the committed `scripts/build-binaries.sh` (F-7)
    as the E5-S4 handoff.
  - **One clear MS-0002/E5-S4 recommendation**: proceed to E5-S4 with the skeleton (PASS); OR invoke
    the documented fallback (Windows CI runner; recorded size/cold-start flag); OR — on catastrophic
    cross-compile failure only — escalate to ADR-0001 language-level reconsideration (Appendix B).
  - **Bun-version pin**: the exact Bun version (1.1.34) for reproducibility (DEC-2).
- [ ] **7.4** Verify the findings doc passes the structural check: it contains an explicit PASS or
  FAIL for **each** of H1–H5, evidence pointers, and exactly one MS-0002/E5-S4 recommendation. A
  `rg -c 'PASS|FAIL|DEFERRED' findings/bun-compile-smoke-findings.md` sanity check (≥ 5) is
  acceptable.
- [ ] **7.5** Note in the findings doc that the **actual** ADR-0001 / story-status / E5-S4 /
  nonfunctional.md updates happen in lifecycle phase 7 (`@doc-syncer`), NOT in this spike — this
  coder only writes the findings doc and records its recommendation. (See Doc-update coverage.)

**Acceptance Criteria**:

- Must: `run-probes.sh` runs the full pipeline and captures evidence (reproducibility).
- Must: `findings/bun-compile-smoke-findings.md` exists and is committed.
- Must: the findings doc contains an explicit PASS/FAIL/DEFERRED for each of H1–H5 with evidence
  pointers (NFR-EVID-1; AC6).
- Must: the findings doc records the measured size (MB, 1 MB = 1,048,576 bytes) and cold-start
  against the "desired, not hard" budget, flagged-not-blocked (AC3/AC4; DEC-5).
- Must: the findings doc records the verbatim `osslsigncode` dry-run command + cert plug-in point
  (AC5) and the DEC-3 Windows-run deferral.
- Must: the findings doc contains exactly one clear MS-0002/E5-S4 recommendation.
- Must: no `src/` change (C-SPIKE-2); no ADR/spec/story file is mutated by this coder.

**Acceptance Criteria → AC mapping**: **AC6** (findings completeness). This phase consolidates the
verdicts for AC1–AC5 + records the AC7 secret-hygiene verdict (finalized in Phase 8).

**Probe mapping**: TC-BCS-008 (findings-doc presence + recommendation) — the load-bearing probe.

**Affected code areas**:

- `spikes/bun-compile-smoke/run-probes.sh` (new — orchestrator)
- `spikes/bun-compile-smoke/evidence/` (new — captured probe outputs; gitignored or small-logs)
- `findings/bun-compile-smoke-findings.md` (new — repo root, the **load-bearing deliverable**)

**System docs to update**:

- none by the coder. The findings doc's recommendation lists the docs that `@doc-syncer` will
  reconcile in lifecycle phase 7 (see Doc-update coverage below). This coder must NOT edit any
  ADR/spec/story file.

**Tests**:

- Run: `cd spikes/bun-compile-smoke && bun run probe:all` → all probes complete; results captured
  into the findings doc.
- Structural: `rg -c 'PASS|FAIL|DEFERRED' findings/bun-compile-smoke-findings.md` returns ≥ 5 (one
  verdict per hypothesis).

**Completion signal**: `docs(spike): bun-compile-smoke findings + probe runner (GH-13)`

> **This is the load-bearing commit of the spike.** If only one commit survives, it is this one
> plus Phase 0's scaffolding and Phase 6's skeleton (so the findings doc is reproducible and the
> E5-S4 handoff exists). Everything else (probes, signing reference) is the evidence trail that
> makes the findings trustworthy.

---

### Phase 8: Secret hygiene sweep + workspace README close-out

**Goal**: Run a secret scan over all committed spike artifacts (assert 0 secrets — AC7), finalize
the workspace `README.md` with run instructions and how to interpret the findings, and perform the
final workspace sanity check. AC7; story methodology (close-out); contributes to AC6 (discoverability).
This mirrors GH-11's Phase 9 close-out.

**Tasks**:

- [ ] **8.1** Run a **secret scan** over all committed spike artifacts: `spikes/bun-compile-smoke/`
  (excluding `node_modules/`, binaries, `evidence/` if gitignored), `findings/`, and
  `scripts/build-binaries.sh`. Use `rg` (or `gitleaks` if available) for common secret patterns:
  - API tokens / `Bearer ` / `xoxb-` (Slack) / `AKIA` (AWS) / `ghp_`/`gho_` (GitHub)
  - private-key headers (`-----BEGIN ... PRIVATE KEY-----`)
  - any `MARKSYNC_*` credential env-var **values** (keys/names are fine; values must be absent)
  - a conservative high-entropy base64 heuristic on source files
  - Assert 0 matches; exit non-zero if any. A one-line verdict ("Secrets scan: 0 secrets in
    committed artifacts.") with the review date is recorded in the findings doc.
  - *Note:* the Phase 5 signing command uses a placeholder `$CERT_PASSWORD` env-var reference (not a
    value) — that is a name, not a secret, and must scan clean.
- [ ] **8.2** Rewrite `spikes/bun-compile-smoke/README.md` (replace the Phase 0 stub) with:
  - **Purpose** — one paragraph (what the spike validates; pointer to the findings doc).
  - **Prerequisites** — Bun 1.1.34 (DEC-2); Docker 27.3.1 (H2); note `wine`/`osslsigncode` absent
    (DEC-3/DEC-4 — Windows run deferred; signing doc-only).
  - **How to run** — the exact commands: `bun run build:linux`, `bun run build:windows`,
    `bun run probe:all` (and the individual `probe:*` scripts). Note these run via `bun run` /
    `docker run`, NOT `bun test`.
  - **Expected outputs** — what each probe prints (exit 0, `file(1)` classification, version string,
    size MB, cold-start wall-clock) and where evidence lands.
  - **How to interpret the findings** — pointer to `findings/bun-compile-smoke-findings.md`, the
    H1–H5 verdict table, the measurements, and the MS-0002/E5-S4 recommendation. Explain the
    outcome routing (PASS → E5-S4 with the skeleton; partial → fallback; catastrophic → ADR-0001
    escalation) per spec §18 / Appendix B.
  - **What is NOT here** — explicit note that ADR/spec/story updates are handled by `@doc-syncer` in
    lifecycle phase 7, and that the spike is NOT wired into CI.
  - **E5-S4 reuse notes** — call out the reusable artifacts: `scripts/build-binaries.sh` (the
    skeleton), the validated compile invocations, the signing dry-run command, and the measured
    size/cold-start baseline.
- [ ] **8.3** Final workspace sanity check: `git status` shows only spike files + findings +
  `scripts/build-binaries.sh` touched; the repo-root `src/` is untouched; `node_modules/` and the
  ~90 MB binaries are gitignored; the findings doc + skeleton are tracked. Verify the README's
  commands match the actual `package.json` script names (no drift).

**Acceptance Criteria**:

- Must: the secret scan reports 0 secrets across committed spike artifacts (NFR-SEC-2; AC7),
  excluding gitignored dirs.
- Must: README documents the actual run commands and expected outputs.
- Must: README points to the findings doc and explains outcome routing.
- Must: README explicitly notes the spike is not CI-wired and ADR/spec updates are lifecycle phase 7.
- Must: no `src/` change (C-SPIKE-2); no workflow/ADR/spec/story file mutated by the coder.

**Acceptance Criteria → AC mapping**: **AC7** (secret hygiene) + contributes to **AC6** (findings
discoverability).

**Probe mapping**: TC-BCS-009 (secret scan).

**Affected code areas**:

- `spikes/bun-compile-smoke/README.md` (updated — replaces Phase 0 stub)
- `spikes/bun-compile-smoke/scripts/secret-scan.sh` (new — if the scan is committed as a script; or
  run ad-hoc and recorded in findings — coder's call)

**System docs to update**:

- none by the coder.

**Tests**:

- Run: the secret scan exits 0 (0 secrets).
- Manual: a fresh operator can run `bun run build:linux && bun run probe:all` from the README alone
  and reach the findings doc.

**Completion signal**: `chore(spike): secret hygiene sweep + workspace README (GH-13)`

---

> **Spec reconciliation note:** this is a spike (`version_impact: none`); there is no version bump
> and no production release. The system-spec / ADR / story reconciliation that a normal change's
> final phase performs is **deferred to lifecycle phase 7** (`@doc-syncer`), per spec NG-6 and the
> PM's instruction. The coder's final deliverable is the spike workspace + findings doc + the
> `scripts/build-binaries.sh` skeleton; the Doc-update coverage section below enumerates exactly
> what `@doc-syncer` will reconcile.

## Test Scenarios

> The spike's "tests" are **empirical probes** (TC-BCS-001…009), NOT production test tiers. They run
> via `bun run` (runtime) and `docker run`, NOT `bun test` (runner), and are NOT wired into CI.

### Phase → AC → Probe mapping

| Phase | AC | Hypothesis | Probe (TC ID) | Probe file / artifact | Evidence path |
|-------|----|------------|---------------|-----------------------|----------------|
| Phase 0 | — (precondition) | — | — | `package.json`, `src/cli.ts` | (scaffolding) |
| Phase 1 | AC1 | H1 (linux-x64) | TC-BCS-001 | `marksync-linux-x64` (gitignored), build evidence | `findings/...#H1` |
| Phase 2 | AC1 | H1 (win-x64) | TC-BCS-002 | `marksync-win-x64.exe` (gitignored), build evidence | `findings/...#H1` |
| Phase 3 | AC2 | H2 | TC-BCS-003, TC-BCS-004 | `probes/clean-os-debian.sh`, `probes/clean-os-alpine.sh` | `findings/...#H2` |
| Phase 4 | AC3, AC4 | H3, H4 | TC-BCS-005, TC-BCS-006 | `probes/measure-size.sh`, `probes/measure-cold-start.sh` | `findings/...#H3`, `#H4` |
| Phase 5 | AC5 | H5 | TC-BCS-007 | `probes/signing-dry-run.md` | `findings/...#H5` |
| Phase 6 | (F-7) | — (skeleton) | — | `scripts/build-binaries.sh` | `findings/...` skeleton pointer |
| Phase 7 | AC6 | — (findings) | TC-BCS-008 | `findings/bun-compile-smoke-findings.md`, `run-probes.sh` | the findings doc itself |
| Phase 8 | AC7 | — (secret hygiene) | TC-BCS-009 | `scripts/secret-scan.sh` (or ad-hoc) | `findings/...` secret-hygiene note |

### Probe summary

| TC ID | Title | Type | Priority | AC | Status |
|-------|-------|------|----------|----|--------|
| TC-BCS-001 | Linux x64 cross-compile (ELF produced, exit 0) | Empirical probe | High | AC1 | To implement (Phase 1) |
| TC-BCS-002 | Windows x64 cross-compile (PE32+ produced, exit 0) | Empirical probe | High | AC1 | To implement (Phase 2) |
| TC-BCS-003 | Clean-OS Linux run, `debian:slim` (exit 0 + version, no runtime) | Empirical probe | High | AC2 | To implement (Phase 3) |
| TC-BCS-004 | Clean-OS Linux run, `alpine` (stretch; musl/glibc note) | Empirical probe | Low | AC2 | To implement (Phase 3) |
| TC-BCS-005 | Binary size measurement (MB, 1 MB = 1,048,576 bytes) | Empirical probe | Medium | AC3 | To implement (Phase 4) |
| TC-BCS-006 | Cold-start measurement (wall-clock + RSS on clean OS) | Empirical probe | Medium | AC4 | To implement (Phase 4) |
| TC-BCS-007 | Signing dry-run command documented (`osslsigncode`) | Empirical probe (doc) | Medium | AC5 | To implement (Phase 5) |
| TC-BCS-008 | Findings-document presence (PASS/FAIL per H1–H5 + recommendation) | Empirical probe | High | AC6 | To implement (Phase 7) |
| TC-BCS-009 | Secrets scan (light, grep/gitleaks-based) | Empirical probe | Medium | AC7 | To implement (Phase 8) |

> **Probe IDs are categories.** The test plan (`chg-GH-13-test-plan.md`, being written in parallel)
> finalizes the exact `TC-BCS-NNN` IDs; the coder reconciles them one-to-one with the categories
> above at execution time.

### AC coverage summary

| AC | Hypothesis | Covered by phases | Verdict source |
|----|------------|-------------------|----------------|
| AC1 | H1 (cross-compile) | Phase 1, 2 | both compiles exit 0; `file(1)` ELF + PE32+ classifications |
| AC2 | H2 (clean-OS run) | Phase 3 | `debian:slim` run exits 0 + version, no Bun/Node installed |
| AC3 | H3 (size) | Phase 4, 7 | measured size MB recorded vs ≤90 MB desired (flagged, not blocking) |
| AC4 | H4 (cold-start) | Phase 4, 7 | measured wall-clock recorded vs ≤2 s desired (documented, not blocking) |
| AC5 | H5 (signing) | Phase 5, 7 | concrete `osslsigncode` dry-run command + cert plug-in point |
| AC6 | — (findings) | Phase 7, 8 | findings doc (PASS/FAIL per H1–H5 + one MS-0002/E5-S4 recommendation) |
| AC7 | — (secret hygiene) | Phase 8 | secret scan (0 secrets in committed artifacts) |

**All seven ACs are fully traced to phases and probes.**

## Doc-update coverage (DoR facet)

> These system docs are touched by `@doc-syncer` in **lifecycle phase 7** (system_spec_update),
> NOT by this plan's coder. The coder only writes the findings doc and records its recommendation
> (Phase 7). Listed here so the DoR gate can see the full reconciliation surface and the doc-syncer
> cannot miss it.

| System doc | Update | Triggered by | Owner |
|---|---|---|---|
| `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | Record cross-compile verification evidence: **C-2** (single binary, no runtime) and **C-3** (cross-platform) validated for the MS-0002 Linux+Windows slice. Add the H1/H2 PASS (or partial) finding to the **Implementation Plan** + **Verification Criteria** sections (the "Clean-OS install smoke" and "Binary size / startup budget" metrics get their first recorded evidence). Partially address the open **Unresolved Question** "Whether binary signing/notarization tooling for Bun-compiled artifacts meets the enterprise trust bar" by pointing to the documented `osslsigncode` dry-run command (H5). **Do NOT autonomously reconsider the TS-over-Go language choice** — that is an owner decision; only surface evidence. | Findings verdict (H1 PASS, H2 PASS, H5 documented) | `@doc-syncer` |
| `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md` | Flip story `status: todo → done` (or `PARTIAL` if a deferral applies) + add an outcome banner summarizing the H1–H5 verdicts and the E5-S4 recommendation. | Spike completion | `@doc-syncer` |
| `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md` | Note that the spike unblocked it: the validated compile invocations + the committed `scripts/build-binaries.sh` skeleton are the E5-S4 starting point. **Flag any deferrals** the spike records: (a) the clean-OS Windows runtime smoke → Windows CI runner (DEC-3); (b) a real signing cert is still needed for production signing (H5 was a dry-run). Update `dependencies.blocked_by` disposition as appropriate. | Findings (PASS/partial) | `@doc-syncer` |
| `doc/spec/nonfunctional.md` | Optionally add an **evidence pointer** for **NFR-PERF-1** (≤90 MB), **NFR-PERF-2** (≤2 s cold-start), **NFR-COMP-1** (Linux+Windows), and **NFR-COMP-2** (clean-OS, no runtime) pointing to the spike's measured values. **NO rewording** of "desired, not hard" — unless the measurement is wildly off (in which case flag for owner review, do not auto-change). | Findings (measurements) | `@doc-syncer` |
| (Conditional) a new decision record | **Only on catastrophic cross-compile failure** (Appendix B worst case — no runnable single-binary path at all): escalate to ADR-0001 language-level reconsideration via `@decision-advisor`; CEO records a decision; do NOT silently proceed. **This is NOT pre-decided and is NOT expected** — the spike is expected to PASS. | Catastrophic FAIL of H1 | `@decision-advisor` / CEO (deferred to lifecycle phase 7; flagged here as conditional) |

> **Boundary reaffirmation:** the coder executing this plan must NOT edit any file under
> `doc/decisions/**`, `doc/spec/**`, or `doc/planning/**`. The only `doc/`-adjacent output is
> `findings/bun-compile-smoke-findings.md` (a spike artifact, not a system doc).

## Code-area coverage (DoR facet)

> **All spike code lives under `spikes/bun-compile-smoke/`. The main `src/` tree is NOT touched
> (C-SPIKE-2, spec NG-5).** The sole repo-root-level code artifact is `scripts/build-binaries.sh`
> (the E5-S4 skeleton); the sole repo-root-level doc artifact is
> `findings/bun-compile-smoke-findings.md`. Per-phase file inventory:

| Phase | New/updated files |
|-------|-------------------|
| Phase 0 | `spikes/bun-compile-smoke/package.json`, `spikes/bun-compile-smoke/src/cli.ts`, `spikes/bun-compile-smoke/.gitignore`, `spikes/bun-compile-smoke/README.md` (stub) |
| Phase 1 | `spikes/bun-compile-smoke/marksync-linux-x64` (**gitignored** — evidence captured, file not committed) |
| Phase 2 | `spikes/bun-compile-smoke/marksync-win-x64.exe` (**gitignored**) |
| Phase 3 | `spikes/bun-compile-smoke/probes/clean-os-debian.sh`, `spikes/bun-compile-smoke/probes/clean-os-alpine.sh` |
| Phase 4 | `spikes/bun-compile-smoke/probes/measure-size.sh`, `spikes/bun-compile-smoke/probes/measure-cold-start.sh` |
| Phase 5 | `spikes/bun-compile-smoke/probes/signing-dry-run.md` |
| Phase 6 | `scripts/build-binaries.sh` (repo root — the E5-S4 skeleton) |
| Phase 7 | `spikes/bun-compile-smoke/run-probes.sh`, `spikes/bun-compile-smoke/evidence/` (gitignored or small logs), **`findings/bun-compile-smoke-findings.md`** (repo root) |
| Phase 8 | `spikes/bun-compile-smoke/README.md` (updated — replaces stub), optionally `spikes/bun-compile-smoke/scripts/secret-scan.sh` |

**Files NOT created/modified:** anything under the repo-root `src/`, `tests/`, `.github/workflows/`,
any `doc/decisions/**`, `doc/spec/**`, or `doc/planning/**` file.

## Definition of Done

- [ ] All 7 ACs (AC1–AC7) satisfied, each with an **evidence pointer** (per spec §17.1):
  - AC1 → both `bun build --compile --target=bun-linux-x64` and `--target=bun-windows-x64` exit 0;
    `file(1)` classifies ELF x86-64 + PE32+ x86-64 (Phases 1, 2). *(Or an RSK-1 deferral is recorded
    for win-x64 → Windows CI runner.)*
  - AC2 → clean-OS `debian:slim` run of `./marksync-linux-x64 --version` exits 0 + prints version,
    with no Bun/Node in the image (Phase 3).
  - AC3 → binary size recorded in MB (1 MB = 1,048,576 bytes) vs ≤90 MB desired; flagged if larger,
    NOT blocking (Phase 4; DEC-5).
  - AC4 → cold-start recorded on the clean-OS container vs ≤2 s desired; documented if longer, NOT
    blocking (Phase 4; DEC-5).
  - AC5 → concrete `osslsigncode` dry-run command + cert/Authenticode plug-in point documented
    (Phase 5).
  - AC6 → `findings/bun-compile-smoke-findings.md` records explicit PASS/FAIL per H1–H5 with evidence
    + a single clear MS-0002/E5-S4 recommendation (Phase 7).
  - AC7 → secret scan reports 0 secrets in committed artifacts (Phase 8).
- [ ] `spikes/bun-compile-smoke/` committed: minimal smoke CLI + `package.json` + probe runner;
  `node_modules/` and the ~90 MB ephemeral binaries gitignored (spec §17.1; C-SPIKE-10).
- [ ] Findings document (`findings/bun-compile-smoke-findings.md`) records explicit PASS/FAIL per
  H1–H5 with evidence + measured size/timing + the signing command + a single clear MS-0002/E5-S4
  recommendation (spec §17.1).
- [ ] `scripts/build-binaries.sh` skeleton committed at the repo root for MS2-E5-S4
  consumption/refinement (spec §17.1; F-7).
- [ ] The deferral of the clean-OS Windows runtime smoke to a Windows CI runner (DEC-3) is recorded
  in the findings.
- [ ] **No production code under the repo-root `src/` is touched** (spec NG-5; C-SPIKE-2). Verified
  by `git diff` against the base branch showing only `spikes/bun-compile-smoke/**`,
  `findings/bun-compile-smoke-findings.md`, and `scripts/build-binaries.sh`.
- [ ] No CI/workflow/ADR/spec/story file is mutated by the coder (spec NG-6; C-SPIKE-9); the
  Doc-update coverage section lists what `@doc-syncer` reconciles in lifecycle phase 7.

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-13-spec.md` | Spec |
| Test plan | `./chg-GH-13-test-plan.md` | Test plan |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md` | Story |
| This implementation plan | `./chg-GH-13-plan.md` | Plan |
| Spike workspace | `spikes/bun-compile-smoke/` (new) | Code (standalone) |
| Findings document (deliverable) | `findings/bun-compile-smoke-findings.md` (new, repo root) | Findings |
| Build-script skeleton (E5-S4 handoff) | `scripts/build-binaries.sh` (new, repo root) | Script skeleton |
| Downstream story (E5-S4 consumer) | `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md` | Story |
| Testing strategy | `.ai/rules/testing-strategy.md` | Rules |
| TypeScript conventions | `.ai/rules/typescript.md` | Rules |
| ADR-0001 (language/runtime — C-2/C-3 validated) | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | Decision |
| Non-functional requirements | `doc/spec/nonfunctional.md` | Spec |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | plan-writer (GH-13) | Initial implementation plan. 9 phases (0–8), each one commit. Derived from `chg-GH-13-spec.md` (AC1–AC7, F-1…F-7, NFR-CC/RUN/SIZE/START/SIGN/EVID/SEC, H1–H5, DEC-1…DEC-5, RSK-1…RSK-6) and the authoritative story `MS2-E1-S3` (8-step methodology). Probe categories aligned to the test plan being written in parallel (TC-BCS-001…009). Includes Phase→AC→Probe mapping, Doc-update coverage (lifecycle phase 7: ADR-0001, MS2-E1-S3 story, MS2-E5-S4 downstream story, nonfunctional.md, conditional decision record), Code-area coverage, and Definition of Done per spec §17.1. All spike code confined to `spikes/bun-compile-smoke/`; repo-root `src/` untouched; the only repo-root artifacts are `scripts/build-binaries.sh` and `findings/bun-compile-smoke-findings.md`; not CI-wired. Commit types: `chore(spike)`/`test(spike)`/`docs(spike)`/`feat(scripts)` (`spike` is a scope, not a Conventional Commits type — consistent with the GH-11 precedent). |

## Execution Log

> Populated during spike execution (lifecycle phase 6 — delivery). Each phase is one Conventional
> Commit.

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 0 | DONE | 2026-07-06 | 2026-07-06 | 36d2c6c | scaffold workspace — bun 1.1.34 + docker 27.3.1 verified; cli prints marksync 0.0.0 |
| Phase 1 | DONE | 2026-07-06 | 2026-07-06 | (this commit) | linux-x64 cross-compile H1a PASS (ELF x86-64, exit 0); TC-BCS-008 arm64 stretch: BOTH bun-linux-arm64 + bun-darwin-arm64 ACCEPTED in 1.1.34 (informational) |
| Phase 2 | DONE | 2026-07-06 | 2026-07-06 | (this commit) | windows-x64 cross-compile H1b PASS (PE32+ x86-64, exit 0); RSK-1 NOT triggered; DEC-3 Windows-run deferral recorded |
| Phase 3 | DONE | 2026-07-06 | 2026-07-06 | (this commit) | clean-OS H2 PASS on debian:stable-slim (exit 0 + version, no runtime); alpine stretch RSK-4 musl/glibc failure recorded (non-blocking) |
| Phase 4 | DONE | 2026-07-06 | 2026-07-06 | (this commit) | H3 sizes recorded (linux 96.90 MB, win 105.12 MB — FLAGGED not blocking DEC-5); H4 cold-start 0.010s median (PASS); RSS ~34.7 MB |
| Phase 5 | PENDING | — | — | — | signing dry-run command (H5) |
| Phase 6 | PENDING | — | — | — | build-binaries.sh skeleton (F-7) |
| Phase 7 | PENDING | — | — | — | probe runner + findings doc (load-bearing) |
| Phase 8 | PENDING | — | — | — | secret hygiene + README close-out |
