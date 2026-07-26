---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-32-cross-platform-binary-builds
status: Updated
created: 2026-07-26T19:30:00Z
last_updated: 2026-07-26T20:15:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, release-pipeline, binary-builds, bun-compile, ci, sbom, cross-platform]
links:
  change_spec: ./chg-GH-32-spec.md
  test_plan: ./chg-GH-32-test-plan.md
  authoritative_story: ../../../planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md
  spike_plan_precedent: ../2026-07-06--GH-13--bun-cross-compile-smoke/chg-GH-13-plan.md
  spike_findings: ../../../findings/bun-compile-smoke-findings.md
  spike_signing_recipe: ../../../spikes/bun-compile-smoke/probes/signing-dry-run.md
  build_script_skeleton: ../../../scripts/build-binaries.sh
  ci_workflow: ../../../.github/workflows/ci.yml
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  typescript_rules: ../../../.ai/rules/typescript.md
  adr_0001: ../../../decisions/ADR-0001-implementation-language-and-runtime.md
  nonfunctional: ../../../spec/nonfunctional.md
summary: >
  Production follow-up to the GH-13 cross-compile spike. Turns the validated `bun build --compile`
  mechanism into a reproducible release pipeline that ships versioned single-binary builds for
  Linux (amd64 + arm64) + Windows (amd64), each validated by a clean-OS runtime smoke, with
  commit-tracked size/cold-start regression data, a documented Windows Authenticode signing
  plug-in point, and a per-release SBOM + SHA256 checksums — so MS-0002 honors ADR-0001's
  distribution promise (C-2 single binary no runtime; C-3 cross-platform) as downloadable
  artifacts. Build/CI/release-engineering ONLY: no src/ DOMAIN-LOGIC change — the sole src/ touch is
  a trivial version-source wiring in src/cli/commands/router.ts (carved out by spec G-7/§16 as the
  "trivial version-embed exception"). Bun pin 1.2.23 (NOT the spike's 1.1.34); clean-OS image
  debian:stable-slim (NOT debian:slim).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-32: [MS2-E5-S4] Cross-platform binary builds

## Context and Goals

This plan delivers the **production release pipeline** that the **GH-13 spike** (`chg-GH-13-*`,
H1–H5 PASS) validated but did not ship. The spike proved the mechanism — `bun build --compile`
cross-compiles to `bun-linux-x64` + `bun-windows-x64`, the linux-x64 binary runs on a clean
`debian:stable-slim` image with no Bun/Node installed, sizes/cold-start were measured, and an
`osslsigncode` Authenticode recipe was documented. **GH-32 wires that mechanism into the real
release pipeline against the real CLI** (`src/cli/index.ts`, from GH-14), refines the committed
`scripts/build-binaries.sh` skeleton, adds a clean-OS CI smoke (closing the spike's DEC-3
Windows-run deferral via a real `windows-latest` runner), records size/cold-start to a
commit-tracked `.benchmarks/binaries.json` with non-blocking CI delta-reporting, documents the
signing plug-in point, and adds a tag-triggered `release.yml` that attaches binaries +
`SHA256SUMS` + a `syft`/CycloneDX SBOM to a GitHub Release.

**This is build / CI / release engineering only.** It introduces **no `src/` domain logic**
(spec G-7 / NG-8). The sole `src/` touch is a **trivial version-source wiring** in
`src/cli/commands/router.ts` (Phase 1 task 1.3) — explicitly carved out by spec G-7/§16 as the
"trivial version-embed exception." It permanently eliminates the version-drift hazard (the existing
code comment says "until a runtime version source is wired" — this plan wires it) and makes
`package.json` the single source of truth that the version bump (Phase 6, 0.7.0 → 0.8.0) edits.
Every phase traces to spec acceptance criteria (AC-BUILD/RUN1/RUN2/SIZE/START/COMP/SIGN/REL/CI/SEC),
functional capabilities (F-1…F-6), NFRs (NFR-CC/RUN/SIZE/START/SBOM/CHK/SEC/MAINT), and test-plan
cases (TC-BUILD/RUN/SIZE/START/REL/SIGN/CI/SEC).

**How this connects to the change spec & test plan:** ACs/TCs/F-/NFR-/DEC-/RSK- IDs are
referenced (not duplicated) from `chg-GH-32-spec.md` and `chg-GH-32-test-plan.md`. The coder
executes phases in order; each phase is **one Conventional Commit**. All build output stays
under the gitignored `dist/`; the only newly commit-tracked file is `.benchmarks/binaries.json`.

**Load-bearing constraints encoded from the PM intake (do NOT lose these):**

- **DEC-1 (critical version-pin hazard):** the release workflow + clean-OS smoke MUST use Bun
  **1.2.23** (matching `package.json#engines.bun` + `ci.yml`), **NOT** the spike's one-time
  1.1.34 validation pin. TC-BUILD-001 asserts `bun --version` = 1.2.23.
- **DEC-2 (Docker tag reconciliation):** clean-OS linux image = `debian:stable-slim`.
  `debian:slim` (story text) is **not** a published Docker Hub tag.
- **DEC-3 / DEC-5:** `linux-arm64` is included (CEO R1); the win-x64 **run** happens on a real
  `windows-latest` runner (closes spike DEC-3 — no Wine).
- **DEC-4 / DEC-6:** sizes ~97–105 MB exceed the ≤90 MB desired budget — **recorded + flagged,
  never blocking**; CI size/cold-start reporting is **delta-only, never hard-fail**.
- **DEC-7 / DEC-8:** real production signing is OUT (reference only); macOS is OUT (MS-0003).
- **Real CLI entry:** `src/cli/index.ts` (repoint the skeleton's placeholder `./src/cli.ts`).
- **Existing assets to REUSE/REFINE, not rewrite:** `scripts/build-binaries.sh` (GH-13 skeleton),
  `spikes/bun-compile-smoke/probes/signing-dry-run.md` (validated recipe), `findings/bun-compile-
  smoke-findings.md` (baseline measurements).

**Open questions:** none blocking. The single spec OQ-1 (`syft` vs `cyclonedx-cli` + SBOM output
format) is **resolved by this plan** as **PLN-DEC-1** below — use `syft` emitting CycloneDX JSON,
matching the spec's stated preference (§F-6, §8.4, OQ-1 "prefer `syft` emitting CycloneDX"). No
`@decision-advisor` engagement is required unless a downstream consumer imposes a specific schema
version (spec OQ-1 fallback).

> **Decision needed?** No. All spec DECs (DEC-1…DEC-8) are resolved; OQ-1 is resolved here as
> PLN-DEC-1. The plan only executes. The spike's catastrophic-failure escalation (ADR-0001
> language-level reconsideration) is **not** in play — H1–H5 already PASS.

### Plan-level decisions

| ID | Decision | Rationale | Resolves |
|----|----------|-----------|----------|
| PLN-DEC-1 | **SBOM generator = `syft`; output format = CycloneDX JSON** (`syft . -o cyclonedx-json=marksync-sbom.cyclonedx.json`). Single tool, matches spec §F-6/§8.4 preference; CycloneDX is the OWASP-flagged supply-chain standard and what the spec/test-plan name. | spec OQ-1 |
| PLN-DEC-2 | **Seed `.benchmarks/binaries.json` with the GH-13 spike baseline** (linux 96.90 MB / win 105.12 MB / cold-start median 0.010 s), clearly marked as the *smoke-CLI* baseline, to be superseded by the first *real-CLI* measurement. Gives the CI delta-reporter a starting reference. | spec DM-1, F-3 |
| PLN-DEC-3 | **Version bump 0.7.0 → 0.8.0** (minor; `version_impact: minor`). A new release-pipeline capability warrants a minor bump; the embedded `--version` (DM-3) reports 0.8.0 on the first real release. | spec §18 / §12 assumption |
| PLN-DEC-4 | **Signing reference home = `doc/guides/binary-release-signing.md`** (new). It REFERENCES the validated spike recipe (no verbatim duplication) + documents the cert plug-in point. Satisfies AC-SIGN-1 / TC-SIGN-001; doubles as the seed of the release runbook (the pm-notes doc-risk candidate), scoped to signing. | spec F-4, TC-SIGN-001 |

## Scope

### In Scope

- **F-1** — Refine `scripts/build-binaries.sh`: repoint entry `./src/cli.ts` → `src/cli/index.ts`;
  add `linux-arm64` (DEC-3); keep `SHA256SUMS` accumulator + signing-TODO marker. (The version embed
  is wired in `src/cli/commands/router.ts` per Phase 1 task 1.3 — the spec G-7/§16 carve-out — not
  by build-script plumbing.)
- **F-2** — Clean-OS runtime smoke CI jobs: linux-x64 on Docker `debian:stable-slim` (no runtime;
  `--version` + `doctor --json` exit 0) and win-x64.exe on a real `windows-latest` runner
  (`--version` exit 0; closes spike DEC-3).
- **F-3** — `.benchmarks/binaries.json` (commit-tracked): seed with spike baseline (PLN-DEC-2);
  CI records size + cold-start and reports deltas, never hard-fails (DEC-6).
- **F-4** — Windows Authenticode signing reference doc (`doc/guides/binary-release-signing.md`)
  pointing at the validated `osslsigncode` recipe + cert plug-in point; env-var **name** only.
- **F-5** — Tag-triggered `.github/workflows/release.yml`: matrix build (linux-x64, linux-arm64,
  win-x64) + `SHA256SUMS` attached to a GitHub Release.
- **F-6 / NFR-SEC-4** — SBOM per release via `syft` CycloneDX JSON (PLN-DEC-1).
- Version bump 0.7.0 → 0.8.0 (PLN-DEC-3) + final quality-gate verification.

### Out of Scope

- macOS target + notarization — MS-0003 (spec NG-1 / DEC-8).
- arm64 as a hard gate — stretch; include/record, do not block (spec NG-2 / DEC-3).
- Real production code-signing with a provisioned cert — dry-run/documented only (spec NG-3 / DEC-7).
- Auto-update mechanism; package-manager distribution (MS-0009) (spec NG-4 / NG-5).
- Any `src/` domain-logic change (spec NG-8); modifying the spike workspace (spec NG-7).
- Mutating ADR-0001, the story file, or `doc/spec/nonfunctional.md` — lifecycle phase 7
  (`@doc-syncer`) reconciliation (spec NG-9). Listed under Doc-update coverage below.
- Re-baselining / re-running the GH-13 spike probes.

### Constraints

- **C-NO-SRC-DOMAIN** — No `src/` DOMAIN-LOGIC change (spec G-7 / NG-8). The ONLY permitted `src/`
  touch is the version-source wiring in `src/cli/commands/router.ts` (Phase 1 task 1.3) — explicitly
  carved out by spec G-7/§16 as the "trivial version-embed exception." No domain/app/infra logic
  changes (no command handlers, no serializers, no infra adapters). Verified at the review gate by
  `git diff` showing only `scripts/`, `.github/workflows/`, `.benchmarks/`, `doc/guides/`,
  `package.json` (version only), the one `src/cli/commands/router.ts` version-source edit, and the
  plan/spec/test-plan artifacts.
- **C-PIN-1** — Bun **1.2.23** is the single release/smoke pin, matching `package.json#engines.bun`
  + `ci.yml` (DEC-1). The spike's 1.1.34 must NOT propagate. TC-BUILD-001 asserts it.
- **C-IMG-1** — Clean-OS linux image = `debian:stable-slim` (DEC-2); `debian:slim` is not published.
- **C-CI-CONV** — New workflows/jobs mirror `ci.yml` conventions: `actions/checkout@v4`,
  `oven-sh/setup-bun@v2` with `1.2.23`, `bun install --frozen-lockfile`, `fail-fast: false`
  matrix, a `concurrency` group, `permissions:` least-privilege.
- **C-TRACKED** — `.benchmarks/binaries.json` is **commit-tracked** (do NOT gitignore `.benchmarks/`).
  `dist/` build outputs ARE gitignored (already in `.gitignore`).
- **C-SIZE-SOFT** — Sizes/cold-start are "desired, not hard" (DEC-4 / DEC-6): record + flag + delta;
  never hard-fail CI on them.
- **C-SECRET** — 0 secrets in any committed artifact (NFR-SEC-1). The signing reference uses
  `$CERT_PASSWORD` as an env-var **name**, never a literal (DEC-7 / RSK-8).
- **C-YAML** — New `.github/workflows/*.yml` must pass the existing `doc-yaml-lint` job (python
  `yaml.safe_load`). TC-CI-001 / final verification covers this.

### Risks

- **RSK-1** (release pins spike's 1.1.34 → unreproducible binaries, H/M): Mitigated by C-PIN-1 +
  TC-BUILD-001 asserting `bun --version`; targets are stable across 1.1.34→1.2.23 (TC-BCS-008).
- **RSK-2** (`linux-arm64` unavailable in 1.2.23, L/L): Include per DEC-3; if unavailable, ship
  x64-only for MS-0002 and record arm64 as MS-0003 — do not block.
- **RSK-3** (binary > 90 MB, confirmed L/H): Accepted per DEC-4; record + flag, never block.
- **RSK-4** (`debian:slim` tag mismatch breaks smoke, M/L): Use `debian:stable-slim` (C-IMG-1).
- **RSK-5** (win-x64.exe flaky on hosted Windows runner, M/L): `--version`-only minimal surface;
  record intermittent failures rather than gating flakily.
- **RSK-6** (release attaches incomplete/incorrect artifact set, M/M): Matrix exhaustive;
  `SHA256SUMS` regenerated per build; release smoke asserts artifact presence; SBOM is a required
  step (not `continue-on-error`).
- **RSK-7** (version not embedded → stale `--version`, L/M): Source from `package.json#version`;
  smoke asserts `--version` matches (DM-3).
- **RSK-8** (committed artifact leaks a signing secret, H/L): Signing reference-only; env-var name
  only; secret-scan gate (AC-SEC-1 / TC-SEC-001).
- **RSK-9** (`syft` unavailable / unexpected in Actions runner, M/L): `syft` is published as a
  GitHub-hosted binary installer (`anchore/sbom-action` or direct download); pin a version. If SBOM
  generation fails on a tag, the release still ships binaries + checksums but the SBOM step is
  surfaced as a required, non-`continue-on-error` job (RSK-6).

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Cross-compile targets produced | 3 (`linux-x64`, `linux-arm64`, `win-x64`) — arm64 per DEC-3, or x64-only with arm64 recorded as MS-0003 | spec §4.1; AC-BUILD-1; NFR-CC-1 |
| Clean-OS linux-x64 run | exit 0 on `debian:stable-slim`, no Bun/Node/Deno | AC-RUN1-1; NFR-RUN-1 |
| Clean-OS win-x64 run | exit 0 on `windows-latest` (no Wine) | AC-RUN2-1; NFR-RUN-2; DEC-5 |
| Binary size recorded | actual per target to `.benchmarks/binaries.json` (≤90 MB desired, flagged-not-blocking) | AC-SIZE-1; NFR-SIZE-1 |
| Cold-start recorded | actual for linux-x64 (≤2 s desired, flagged-not-blocking) | AC-START-1; NFR-START-1 |
| Release artifacts per tag | binaries + 1 `SHA256SUMS` + 1 CycloneDX SBOM | AC-REL-1; NFR-SBOM-1; NFR-CHK-1 |
| Secrets in committed artifacts | **0** | AC-SEC-1; NFR-SEC-1 |
| `src/` domain-logic lines changed | **0** (preferred) | spec G-7 / NG-8; AC-CI-1 |
| `bun run check` | green (no src/ regression) | AC-CI-1; TC-CI-001 |

## Phases

> **Execution model:** phases run strictly in order; each is **one Conventional Commit**
> (subject ≤ 72 chars, imperative mood; body explains the why; footer `GH-32`). The coder may be
> invoked as `/run-plan GH-32 execute all remaining phases no review`.
>
> **Commit types** (TDR-0008 Conventional Commits, enforced by husky + commitlint + CI): this is
> infra work → `build`, `ci`, `docs`, `chore`. No `feat` — the sole `src/` touch (the Phase 1
> `router.ts` version-source wiring) is release plumbing, not a user-facing feature, so it rides the
> Phase 1 `build(scripts,cli)` commit. The version bump is `chore(release):`.
>
> **Version-pin reminder (DEC-1):** every CI/workflow step that sets up Bun uses
> `oven-sh/setup-bun@v2` with `bun-version: "1.2.23"` — never the spike's 1.1.34.
>
> **Reuse, don't rewrite:** the GH-13 skeleton (`scripts/build-binaries.sh`) and the signing recipe
> (`spikes/bun-compile-smoke/probes/signing-dry-run.md`) already exist and are VALIDATED. Phases 1
> and 4 refine/reference them; they do not reproduce the spike's probe code.

---

### Phase 1: Refine `scripts/build-binaries.sh` + wire `router.ts` version source (real CLI entry + arm64)

**Goal**: Turn the GH-13 skeleton into a real-CLI build script. Repoint the entry from the
placeholder `./src/cli.ts` to `src/cli/index.ts`, add the `linux-arm64` target (DEC-3), and wire
the `package.json` version into `src/cli/commands/router.ts` (the sole `src/` touch — spec G-7/§16
carve-out) so `--version` reports the real release version (DM-3), and retain the `SHA256SUMS`
accumulator + signing-TODO marker. Verify it runs locally on Bun 1.2.23. F-1;
AC-BUILD-1 (local half); story scope item 1.

**Tasks**:

- [ ] **1.1** In `scripts/build-binaries.sh`, change the default `ENTRY` from `./src/cli.ts` to
  `src/cli/index.ts` (the real CLI from GH-14). Update the header comment + `--help` text to drop
  the "placeholder" framing and state this is the production build script (GH-32, refined from the
  GH-13 skeleton).
- [ ] **1.2** Add the `linux-arm64` target (DEC-3 / CEO R1):
  - Extend the `--target` case to accept `linux-arm64` and add a `build_one linux-arm64
    bun-linux-arm64 "$OUT_DIR/marksync-linux-arm64"` arm; include it in the `all` path so `all`
    produces linux-x64 + linux-arm64 + win-x64.
  - *Contingency (RSK-2):* if `bun-linux-arm64` is rejected by Bun 1.2.23, record the exact error
    in the script output and continue (x64-only) rather than `set -e`-failing the whole script —
    arm64 is a stretch, not a gate (DEC-3). Emit a clear `arm64: UNAVAILABLE — recorded for
    MS-0003` line.
- [ ] **1.3** **Wire a runtime version source in `src/cli/commands/router.ts`** — the ONE permitted
  `src/` touch (C-NO-SRC-DOMAIN carve-out; spec G-7/§16 "trivial version-embed exception"). Today
  `router.ts` hardcodes `export const CLI_VERSION = "0.7.0"` with a stale comment reading "Kept in
  lock-step with `package.json` until a runtime version source is wired" — this task wires that
  source. Replace the hardcoded literal with a `package.json` import so `CLI_VERSION` derives from
  `pkg.version` and `package.json` becomes the single source of truth:
  ```ts
  import pkg from "../../../package.json" with { type: "json" };
  // …
  /** The version displayed in `--version` / help; single source of truth = package.json#version. */
  export const CLI_VERSION = pkg.version;
  ```
  This is the correct engineering fix: the previous `--define process.env.MARKSYNC_VERSION=…`
  fallback (recorded in v1.0 of this plan) was a **no-op** — `router.ts` never read that env var, so
  bumping only `package.json` would have left the binary reporting `0.7.0` (AC-BUILD-1 / DM-3 would
  FAIL at the DoD gate). Intent + guarantees: (a) single source of truth = `package.json#version`;
  (b) Bun inlines JSON imports as build-time constants, so it works identically in `bun run` (dev)
  and `bun build --compile` (the compiled binary bakes the value); (c) `tsconfig.json#
  resolveJsonModule` is already `true`, so typecheck passes; (d) update the now-stale "Kept in
  lock-step" comment (replaced above). The coder confirms the exact import form (relative
  `../../../package.json` vs an `#imports` alias — match repo conventions) and that
  `with { type: "json" }` is the Bun/TS import-attribute form in use. After this wiring the build
  script needs **no** `--define` version plumbing. The binary MUST print `package.json#version` for
  `--version` (DM-3; RSK-7; AC-BUILD-1).
- [ ] **1.4** Keep the `SHA256SUMS` accumulator (one hash per binary, portable basenames) and the
  `TODO(E5-S4)` signing marker pointing at `spikes/bun-compile-smoke/probes/signing-dry-run.md`.
  Update the marker to `TODO(MS-0003)` (real signing is MS-0003+ per DEC-7) while keeping the
  pointer to the validated recipe.
- [ ] **1.5** Update the header's `Requires Bun (>= 1.1.34)` note to the project pin: this script
  is validated against Bun **1.2.23** (DEC-1). Keep the `bun --version` echo in build output.
- [ ] **1.6** Local verification on Bun 1.2.23: `bun --version` reports 1.2.23; run
  `bash scripts/build-binaries.sh --target all` from the repo root; assert it produces
  `dist/marksync-linux-x64`, `dist/marksync-linux-arm64` (or the RSK-2 contingency line), and
  `dist/marksync-win-x64.exe`; assert `./dist/marksync-linux-x64 --version` prints the
  `package.json` version; assert `dist/SHA256SUMS` exists with one hash per produced binary.

**Acceptance Criteria**:

- Must: `scripts/build-binaries.sh` default entry is `src/cli/index.ts`; `--target all` produces
  linux-x64 + win-x64 (+ linux-arm64 or the RSK-2 contingency) (AC-BUILD-1 local; F-1; NFR-CC-1).
- Must: each produced binary's `--version` matches `package.json#version` (DM-3; RSK-7).
- Must: `SHA256SUMS` regenerated per build with portable basenames (NFR-CHK-1 precondition).
- Must: the ONLY `src/` change is the `router.ts` version-source wiring (C-NO-SRC-DOMAIN carve-out;
  spec G-7/§16); no domain/app/infra logic touched.

**Acceptance Criteria → AC mapping**: **AC-BUILD-1** (local-build half; CI-build half completed in
Phase 2). **Probe/TC mapping**: TC-BUILD-001 (local; the CI instance lands in Phase 2).

**Files and modules**:

- Code areas: `scripts/build-binaries.sh` (updated — entry repoint, arm64, pin note); `src/cli/commands/router.ts` (updated — the ONE permitted `src/` touch: version-source wiring per task 1.3, C-NO-SRC-DOMAIN carve-out).
- System docs: none by the coder.

**Tests**:

- Manual: `bash scripts/build-binaries.sh --target all` → 3 binaries (or arm64 contingency) +
  `SHA256SUMS`; `./dist/marksync-linux-x64 --version` → `package.json#version`. (`dist/` is
  gitignored — not committed.)

**Risks**: RSK-2 (arm64 unavailable → contingency, non-blocking); RSK-7 (version embed → asserted
by `--version`); RSK-1 (pin → header + echo now say 1.2.23).

**Completion signal**: `build(scripts,cli): refine build-binaries.sh + wire router.ts version source (GH-32)`

---

### Phase 2: Clean-OS runtime smoke CI jobs (linux Docker + windows runner)

**Goal**: Wire the clean-OS runtime smoke into CI on every push/PR — proving the no-runtime promise
(NFR-COMP-2) **continuously**, and **closing the spike's DEC-3 Windows-run deferral** by running
win-x64.exe on a real `windows-latest` runner (no Wine). This phase also completes the CI half of
AC-BUILD-1 (the smoke first builds the binaries). F-2; AC-RUN1-1, AC-RUN2-1; story scope item 2.

**Tasks**:

- [ ] **2.1** Add a `binary-smoke` job to `.github/workflows/ci.yml` (new job, same file; mirror
  the `fast-loop`/`e2e-mock` conventions: `actions/checkout@v4`, `oven-sh/setup-bun@v2` with
  `bun-version: "1.2.23"`, `bun install --frozen-lockfile`, `fail-fast: false`, a `concurrency`
  group). The job:
  - runs `bash scripts/build-binaries.sh --target all` (Phase 1 script) and asserts exit 0;
  - asserts `bun --version` = `1.2.23` (TC-BUILD-001 / DEC-1) and `file(1)` classifies each binary
    (ELF x86-64, ELF aarch64 if present, PE32+ x86-64);
  - asserts each binary's `--version` matches `package.json#version` (DM-3).
- [ ] **2.2** Linux clean-OS smoke (TC-RUN-001 / AC-RUN1-1): on the `ubuntu-latest` runner, run the
  linux-x64 binary inside Docker `debian:stable-slim` (C-IMG-1):
  - `docker run --rm debian:stable-slim sh -c 'command -v bun node deno; echo exit=$?'` → assert
    exit `127` (no language runtime — NFR-COMP-2);
  - `docker run --rm -v "$PWD":/x -w /x debian:stable-slim /x/dist/marksync-linux-x64 --version`
    → assert exit 0 + version string;
  - `docker run --rm -v "$PWD":/x -w /x debian:stable-slim /x/dist/marksync-linux-x64 doctor --json`
    in an empty/minimal corpus → assert a valid JSON document is produced (the binary boots the real
    CLI and serializes JSON). The exact exit code follows the doctor contract (EXIT_HEALTH=60 if a
    check fails in an empty corpus); assert JSON validity rather than a fixed exit code, and record
    the exit code in the log.
- [ ] **2.3** Windows clean-OS smoke (TC-RUN-002 / AC-RUN2-1 / DEC-5): add a separate job (or matrix
  leg) on `runs-on: windows-latest` that checks out, sets up Bun 1.2.23, builds win-x64 (cross-compile
  from the windows runner is fine, or build on ubuntu and download the artifact — pick the simpler
  path; cross-compile on ubuntu + artifact-download is preferred to keep one build path), and runs:
  - `.\dist\marksync-win-x64.exe --version` → assert exit 0 + version string.
  - No Wine (closes spike DEC-3).
- [ ] **2.4** Keep the smoke secrets-free and minimal — only `--version` + `doctor --json` against
  the local corpus; no Confluence target, no credentials (NFR-SEC-3).
- [ ] **2.5** Verify the new job's YAML passes the repo's `doc-yaml-lint` job (python
  `yaml.safe_load` over `.github/workflows/*.yml`) — run `python3 -c "import yaml; yaml.safe_load
  (open('.github/workflows/ci.yml'))"` locally.

**Acceptance Criteria**:

- Must: the `binary-smoke` job builds all targets with Bun 1.2.23 and each `--version` matches
  `package.json#version` (AC-BUILD-1 CI half; NFR-CC-1; DEC-1).
- Must: linux-x64 exits 0 on `debian:stable-slim` with no Bun/Node/Deno present
  (AC-RUN1-1; NFR-RUN-1; DEC-2).
- Must: win-x64.exe exits 0 on a `windows-latest` runner with no Wine (AC-RUN2-1; NFR-RUN-2; DEC-5
  — closes spike DEC-3).
- Must: no `src/` change beyond the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN); secrets-free (C-SECRET).

**Acceptance Criteria → AC mapping**: **AC-BUILD-1** (CI half), **AC-RUN1-1**, **AC-RUN2-1**.
**Probe/TC mapping**: TC-BUILD-001 (CI), TC-RUN-001, TC-RUN-002.

**Files and modules**:

- Code areas: `.github/workflows/ci.yml` (updated — new `binary-smoke` job + windows leg).
- System docs: none by the coder.

**Tests**:

- CI: the `binary-smoke` job itself IS the test (runs on every push/PR). Local YAML-lint sanity
  check before commit.

**Risks**: RSK-4 (`debian:slim` → use `debian:stable-slim`); RSK-5 (windows flakiness → `--version`
-only, minimal surface); RSK-2 (arm64 in CI build → contingency line, non-blocking); docker-in-CI
availability (ubuntu-latest runners provide docker — confirmed by standard Actions offering).

**Completion signal**: `ci: add clean-OS binary smoke for linux + windows (GH-32)`

---

### Phase 3: Binary measurement baseline + `.benchmarks/binaries.json` + CI delta-reporting

**Goal**: Turn the spike's one-time baseline into a commit-tracked regression signal. Seed
`.benchmarks/binaries.json` with the GH-13 baseline (PLN-DEC-2), then wire CI to record each build's
size + linux-x64 cold-start and **report deltas without hard-failing** (DEC-6 / NFR-MAINT-1).
F-3; AC-SIZE-1, AC-START-1; story scope item 3.

**Tasks**:

- [ ] **3.1** Create `.benchmarks/binaries.json` (commit-tracked — do NOT add `.benchmarks/` to
  `.gitignore`; `dist/` stays gitignored). Define a small, stable schema, e.g.:
  ```json
  {
    "schemaVersion": 1,
    "note": "Commit-tracked binary size + cold-start baseline. CI reports deltas (DEC-6), never hard-fails.",
    "measurements": {
      "linux-x64": { "bytes": 101604521, "mb": 96.90, "coldStartMs": { "min": 8, "median": 10, "max": 22, "n": 5 } },
      "linux-arm64": { "bytes": null, "mb": null, "coldStartMs": null },
      "win-x64": { "bytes": 110224195, "mb": 105.12 }
    },
    "baseline": { "source": "GH-13 spike smoke-CLI (findings/bun-compile-smoke-findings.md §4)", "supersededBy": "first real-CLI CI measurement", "bun": "1.1.34" }
  }
  ```
  Sizes use the spike convention: bytes via `stat -c %s`, MB = bytes ÷ 1,048,576 (binary). Seed
  linux-x64 + win-x64 from the spike baseline; leave arm64 `null` (first real measurement fills it).
  Mark the seed as the smoke-CLI baseline (PLN-DEC-2) so reviewers know it is superseded.
- [ ] **3.2** In the `binary-smoke` job (Phase 2), after building, record per-target size:
  `stat -c %s dist/marksync-*` → write the new measurements to a job-local JSON and compute the
  delta vs. the committed `.benchmarks/binaries.json`. Print the delta table to the CI log
  (e.g. `linux-x64: 97.05 MB (baseline 96.90 MB, Δ +0.15 MB)`). Flag exceedance of the 90 MB desired
  budget as an annotation/warning — **do not** `exit 1` on size (DEC-4 / DEC-6 / NFR-MAINT-1).
- [ ] **3.3** Cold-start (TC-START-001 / AC-START-1): on the linux clean-OS container, measure
  fresh-process wall-clock of `dist/marksync-linux-x64 --version` (n=5, e.g. via `/usr/bin/time -v`
  installed ephemerally with `apt-get install -y --no-install-recommends time` inside the container,
  matching the spike's TC-BCS-006 method). Record min/median/max ms. Report the delta vs. baseline;
  do not hard-fail on the ≤2 s desired budget (DEC-4).
- [ ] **3.4** Decide the persistence cadency: the committed `.benchmarks/binaries.json` is updated
  **manually by the maintainer** on first real-CLI measurement and periodically (or via a labelled
  `workflow_dispatch` job that opens a PR). Do NOT have CI auto-commit on every push (noisy history,
  GPG/bot-token friction). CI **reports** deltas; a human (or a dispatch) **commits** the new
  baseline. Record this policy in a top-level `note` field + a comment in the workflow.
- [ ] **3.5** Verify `.benchmarks/binaries.json` parses and that `.gitignore` does NOT exclude
  `.benchmarks/` (run `git check-ignore .benchmarks/binaries.json` → must return non-zero / empty).

**Acceptance Criteria**:

- Must: `.benchmarks/binaries.json` is committed, parses as JSON, and records per-target size +
  linux-x64 cold-start (AC-SIZE-1, AC-START-1; F-3; DM-1).
- Must: CI reports size/cold-start deltas vs. the committed baseline and does NOT hard-fail on them
  (NFR-MAINT-1; DEC-6; C-SIZE-SOFT).
- Must: exceedance of 90 MB / 2 s is flagged, not blocking (DEC-4; AC-SIZE-1 / AC-START-1).
- Must: `.benchmarks/` is NOT gitignored; `dist/` remains gitignored (C-TRACKED).
- Must: no `src/` change beyond the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN).

**Acceptance Criteria → AC mapping**: **AC-SIZE-1**, **AC-START-1**. **Probe/TC mapping**:
TC-SIZE-001, TC-START-001.

**Files and modules**:

- Code areas: `.benchmarks/binaries.json` (new, commit-tracked); `.github/workflows/ci.yml`
  (updated — size/cold-start measurement + delta-report steps in the `binary-smoke` job).
- System docs: none by the coder.

**Tests**:

- CI: the measurement + delta-report steps run inside `binary-smoke`. Local: `python3 -c "import
  json; json.load(open('.benchmarks/binaries.json'))"` parses; `git check-ignore` confirms tracked.

**Risks**: RSK-3 (size > 90 MB → flagged, not blocking); `/usr/bin/time` absent in slim image →
install ephemerally (spike-precedent); measurement noise in a container → record n=5 + median,
directional not micro-gate (testing-strategy product-perf design principle).

**Completion signal**: `ci(benchmarks): seed binaries.json + size/cold-start delta report (GH-32)`

---

### Phase 4: Windows signing reference documentation

**Goal**: Document the Windows Authenticode signing story as a release-oriented reference that
POINTS AT the validated `osslsigncode` recipe (no verbatim duplication) and identifies the exact
cert/Authenticode plug-in point. Real signing stays OUT (DEC-7); macOS notarization is OUT (MS-0003).
F-4; AC-SIGN-1; story scope item 4.

**Tasks**:

- [ ] **4.1** Create `doc/guides/binary-release-signing.md` (PLN-DEC-4). The doc:
  - states the purpose: the release-oriented Windows Authenticode signing reference for the
    `marksync-win-x64.exe` artifact, and where a production cert plugs in (MS-0003+);
  - **references** (links to) the validated recipe at `spikes/bun-compile-smoke/probes/signing-
    dry-run.md` for the canonical `osslsigncode sign`/`verify`/`extract-signature` blocks — does
    NOT copy the recipe verbatim (single source of truth);
  - summarizes the cert plug-in point as a short table (`-pkcs12`/`-certs`+`-key`, `-pass` via the
    `$CERT_PASSWORD` env-var **name**, `-t` timestamp URL, `-h sha256`, `-in`/`-out`) — names only,
    no literal password, no cert data;
  - records the two caveats explicitly: **real production signing is OUT of MS-0002** (DEC-7 / NG-3);
    **macOS notarization is OUT of scope** (MS-0003 / DEC-8);
  - points at `scripts/build-binaries.sh`'s signing marker as the wiring point for MS-0003.
- [ ] **4.2** Confirm the doc uses `$CERT_PASSWORD` as an env-var **name** only (C-SECRET / RSK-8);
  no placeholder that could be mistaken for a real value; cert paths are clearly placeholders
  (`/path/to/authenticode.p12`).
- [ ] **4.3** Sanity-check the doc against the existing `doc-yaml-lint` Markdown-link checker: the
  new file is NOT in the checker's explicit `scan_globs` list (which names specific `doc/guides/*.md`
  files), so it will not be scanned for links — but ensure any relative links it contains resolve
  anyway (good practice; the spike-recipe path and the build-script path must resolve).

**Acceptance Criteria**:

- Must: `doc/guides/binary-release-signing.md` exists, references the validated `osslsigncode`
  recipe, and identifies the cert/Authenticode plug-in point (AC-SIGN-1; F-4; TC-SIGN-001).
- Must: the reference uses `$CERT_PASSWORD` as an env-var **name** only — no literal, no cert data
  (DEC-7; RSK-8; C-SECRET).
- Must: the real-signing-OUT (MS-0002) and macOS-notarization-OUT (MS-0003) caveats are explicit.
- Must: no verbatim duplication of the spike recipe (reference it); no `src/` change beyond the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN).

**Acceptance Criteria → AC mapping**: **AC-SIGN-1**. **Probe/TC mapping**: TC-SIGN-001.

**Files and modules**:

- Code areas: `doc/guides/binary-release-signing.md` (new).
- System docs: this IS a new system/ops doc (release-engineering); it is in scope for this story
  (TC-SIGN-001 names `doc/guides/` as a valid home). ADR/nonfunctional.md reconciliation stays in
  lifecycle phase 7 (NG-9).

**Tests**:

- Structural: the doc contains the `osslsigncode` reference, the cert plug-in table, the env-var
  name, and both out-of-scope caveats (TC-SIGN-001 steps 1–5).

**Risks**: RSK-8 (secret leak → env-var name only; TC-SEC-001 will scan it in Phase 6).

**Completion signal**: `docs(guides): document windows binary signing plug-in point (GH-32)`

---

### Phase 5: Tag-triggered release workflow (`release.yml`) with SBOM + SHA256SUMS

**Goal**: Add `.github/workflows/release.yml` — triggered on tag (`v*`) — that builds the matrix
(linux-x64, linux-arm64, win-x64), generates one `SHA256SUMS` (hash per binary), generates one SBOM
via `syft` CycloneDX JSON (PLN-DEC-1), and attaches binaries + checksums + SBOM to the GitHub
Release. F-5, F-6; AC-COMP-1, AC-REL-1; NFR-SBOM-1, NFR-CHK-1; story scope items 5 + 6. This phase
**resolves spec OQ-1** (PLN-DEC-1).

**Tasks**:

- [ ] **5.1** Create `.github/workflows/release.yml` (new, separate from `ci.yml`). Trigger:
  `on: push: tags: ["v*"]`. Mirror `ci.yml` conventions (C-CI-CONV): `actions/checkout@v4` with
  `fetch-depth: 0`, `oven-sh/setup-bun@v2` with `bun-version: "1.2.23"` (DEC-1),
  `bun install --frozen-lockfile`, `fail-fast: false`, a `concurrency` group (e.g.
  `release-${{ github.ref }}`), and least-privilege `permissions: { contents: write }` (needed to
  attach assets to the release).
- [ ] **5.2** Matrix build (AC-COMP-1 / DEC-8): run `bash scripts/build-binaries.sh --target all`
  to produce `dist/marksync-linux-x64`, `dist/marksync-linux-arm64` (or RSK-2 contingency), and
  `dist/marksync-win-x64.exe`. macOS is NOT produced (DEC-8 / MS-0003). The script already
  generates `dist/SHA256SUMS` (Phase 1 retained it) — assert one hash per produced binary with
  portable basenames (NFR-CHK-1).
- [ ] **5.3** SBOM generation (F-6 / NFR-SEC-4 / PLN-DEC-1): install `syft` via a **pinned**
  `anchore/sbom-action@v0.24.0` — the latest stable release at plan time (released 2026-03-20;
  bundles Syft 1.42.3). Do NOT use the floating `@v0` major tag (DEC-1 determinism: a floating tag
  can silently move the SBOM toolchain under a tag-triggered release). Generate
  `syft . -o cyclonedx-json=marksync-sbom.cyclonedx.json` from the repo root (scans the
  built/installed dependency set). Make the SBOM step a **required** step (not `continue-on-error`)
  — RSK-6 / RSK-9. Record the chosen pin (`v0.24.0`) in a workflow comment so the next bump is
  intentional.
- [ ] **5.4** Attach the artifact set to the GitHub Release (AC-REL-1): the three binaries (or
  x64-only + arm64 contingency), `SHA256SUMS`, and `marksync-sbom.cyclonedx.json`. Use
  `softprops/action-gh-release@v2` (or equivalent) with `files: |` listing each asset. The release
  notes should record the Bun pin (1.2.23) + which targets are present (incl. arm64 status).
- [ ] **5.5** Add a lightweight release-artifact assertion step (RSK-6): after upload, verify via
  the GitHub API (or `gh release view`) that the release carries ≥ the expected asset count
  (binaries present + 1 SHA256SUMS + 1 SBOM); fail the workflow if a required asset is missing.
- [ ] **5.6** Verify the new workflow YAML passes the repo's `doc-yaml-lint` job (python
  `yaml.safe_load` over `.github/workflows/*.yml`); run the parse check locally.

**Acceptance Criteria**:

- Must: `.github/workflows/release.yml` triggers on `v*` tags and builds the matrix with Bun 1.2.23
  (F-5; AC-COMP-1; DEC-1; DEC-8 — no macOS).
- Must: the release attaches binaries + one `SHA256SUMS` + one CycloneDX SBOM (AC-REL-1; NFR-SBOM-1;
  NFR-CHK-1; PLN-DEC-1).
- Must: the SBOM step is required (not `continue-on-error`) and the asset-presence assertion runs
  (RSK-6 / RSK-9).
- Must: `permissions:` is least-privilege (`contents: write` only); no `src/` change beyond the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN).

**Acceptance Criteria → AC mapping**: **AC-COMP-1** (matrix correctness, macOS excluded),
**AC-REL-1** (artifact assembly). **Probe/TC mapping**: TC-REL-001 (structural validation in CI;
full end-to-end validation occurs on the first real tag push, which is post-merge — see Test
Scenarios note).

**Files and modules**:

- Code areas: `.github/workflows/release.yml` (new).
- System docs: none by the coder (the signing pointer in Phase 4 references this workflow).

**Tests**:

- Structural (in-CI): the `doc-yaml-lint` job validates the new YAML. Full TC-REL-001 validation
  happens on the first tag push (post-merge, by a maintainer); this phase delivers a workflow that,
  on a tag, produces the contract-correct artifact set. RSK-6 mitigation = the asset-presence
  assertion step.

**Risks**: RSK-6 (incomplete artifact set → matrix exhaustive + SHA256SUMS per-build + asset
assertion); RSK-9 (syft availability → pin a version; required step); RSK-2 (arm64 in release →
contingency, recorded); OQ-1 (resolved as PLN-DEC-1).

**Completion signal**: `ci(release): add tag-triggered release workflow with SBOM (GH-32)`

---

### Phase 6: Version bump (0.7.0 → 0.8.0) + final quality-gate verification

**Goal**: The one non-infra change — bump `package.json` 0.7.0 → 0.8.0 (PLN-DEC-3) so the embedded
`--version` and the first release report the new release-pipeline capability — and run the full
quality-gate verification: `bun run check` green (no `src/` regression), YAML-lint clean, and the
secret-hygiene scan clean. AC-CI-1, AC-SEC-1, AC-BUILD-1 (final), AC-COMP-1 (final), AC-REL-1
(final); TC-CI-001, TC-SEC-001.

**Tasks**:

- [ ] **6.1** Bump `package.json` `version` from `0.7.0` to `0.8.0` (PLN-DEC-3; `version_impact:
  minor`). After the Phase 1 `router.ts` version-source wiring, this is a **single-source edit**:
  `router.ts` derives `CLI_VERSION` from `pkg.version` (the JSON import Bun bakes at build time), so
  the compiled binary's `--version` reports `0.8.0` with no second edit anywhere (AC-BUILD-1 / DM-3).
  Do not touch any other `package.json` field (`engines.bun` stays 1.2.23), any other `src/` file,
  or `imports` — the only `src/` touch is the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN).
- [ ] **6.2** Run `bun run check` locally (lint + format:check + typecheck + test + check:boundaries)
  and assert green. The Phase 1 `router.ts` edit is a pure constant-source swap (no behavior, no new
  type, no boundary change — `pkg.version` is a `string`, same as the old literal), so the existing
  suite (which guards INV-SAFE-1/2/3, INV-SEC-1, A-FEA-5, golden determinism, BDD invariants) passes
  unchanged (AC-CI-1 / TC-CI-001). Investigate any failure as an unintended `src/` domain regression
  (C-NO-SRC-DOMAIN).
- [ ] **6.3** Verify all new/modified YAML parses: `python3 -c "import yaml,glob; [yaml.safe_load
  (open(f)) for f in glob.glob('.github/workflows/*.yml')]"` (mirrors the `doc-yaml-lint` CI job;
  covers the new `release.yml` + the updated `ci.yml`).
- [ ] **6.4** Run the secret-hygiene scan (TC-SEC-001 / AC-SEC-1) across every committed artifact
  this story touches: `scripts/build-binaries.sh`, `.github/workflows/ci.yml`,
  `.github/workflows/release.yml`, `.benchmarks/binaries.json`, `doc/guides/binary-release-signing.md`.
  Use `gitleaks` if available, else `rg` for: API tokens / `Bearer ` / `xoxb-` / `AKIA` / `ghp_`/`gho_`,
  private-key headers (`-----BEGIN ... PRIVATE KEY-----`), high-entropy base64 blobs, and any
  `MARKSYNC_*` credential **values**. Assert 0 findings. Confirm `doc/guides/binary-release-signing.md`
  uses `$CERT_PASSWORD` as a **name** only (RSK-8).
- [ ] **6.5** Final scope check: `git diff origin/main...HEAD --stat` shows ONLY `scripts/build-binaries.sh`,
  `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.benchmarks/binaries.json`,
  `doc/guides/binary-release-signing.md`, `package.json` (version line), the ONE `src/` file
  `src/cli/commands/router.ts` (Phase 1 version-source wiring — the C-NO-SRC-DOMAIN carve-out), and
  the change-folder artifacts (`doc/changes/.../chg-GH-32-*.md`). NO other `src/` file and no
  `tests/` change (C-NO-SRC-DOMAIN).
- [ ] **6.6** Update this plan's Execution Log rows for Phases 1–6 (commit hashes, status DONE) so
  the DoD gate can verify phase completion.

**Acceptance Criteria**:

- Must: `package.json#version` is `0.8.0`; `engines.bun` unchanged at 1.2.23; `router.ts` derives from it unchanged since Phase 1 (PLN-DEC-3; C-NO-SRC-DOMAIN).
- Must: `bun run check` is green — no `src/` regression (AC-CI-1; TC-CI-001).
- Must: all new YAML parses; the `doc-yaml-lint` CI job is green (C-YAML).
- Must: the secret scan reports 0 secrets across all committed artifacts (AC-SEC-1; TC-SEC-001;
  NFR-SEC-1); `$CERT_PASSWORD` is a name only.
- Must: `git diff` confirms zero `src/` DOMAIN-LOGIC change; the only `src/` touch is the Phase 1 `router.ts` version-source wiring (C-NO-SRC-DOMAIN).

**Acceptance Criteria → AC mapping**: **AC-CI-1**, **AC-SEC-1** (owned here); final consolidation
of **AC-BUILD-1**, **AC-COMP-1**, **AC-REL-1** (mechanisms delivered in Phases 1–5, verified here).
**Probe/TC mapping**: TC-CI-001, TC-SEC-001.

**Files and modules**:

- Code areas: `package.json` (updated — `version` only).
- System docs: none by the coder (ADR/nonfunctional.md/story reconciliation is lifecycle phase 7 —
  see Doc-update coverage).

**Tests**:

- `bun run check`; YAML-lint parse; `gitleaks`/`rg` secret scan; `git diff --stat` scope check.

**Risks**: a `bun run check` failure would indicate either an unintended `src/` domain regression
or a problem with the Phase 1 `router.ts` wiring (C-NO-SRC-DOMAIN) — investigate; the legitimate
`src/` touch is the version-source wiring only, and any *other* `src/` edit violates spec G-7.

**Completion signal**: `chore(release): bump to 0.8.0 + verify binary-build quality gates (GH-32)`

---

### Phase 7: Post-review remediation (conditional)

**Goal**: Absorb `@reviewer` (lifecycle phase 8) and DoR/DoD feedback on Phases 1–6 without
re-opening settled spec decisions. This phase is **conditional** — it is executed only if review
surfaces actionable findings; it is skipped (logged as N/A) if review PASSES.

**Tasks**:

- [ ] **7.1** Triage each review finding against the spec: reject any finding that contradicts a
  settled DEC (DEC-1…DEC-8) or reopens NG-1…NG-9; accept findings about workflow correctness,
    YAML/portability, the delta-reporter's non-blocking behavior, the signing doc's secret hygiene,
    or the release artifact set.
- [ ] **7.2** Apply accepted remediations as one or more follow-up Conventional Commits
  (`fix(ci): …`, `fix(build): …`, `docs(guides): …`), each re-validated by the relevant phase's
  acceptance check + `bun run check`.
- [ ] **7.3** Re-run TC-SEC-001 after any remediation that touches a committed artifact (RSK-8
  defense-in-depth).
- [ ] **7.4** If review identifies a genuine spec/test-plan gap (not a plan-execution issue), STOP
  and report it to `@pm` — that reopens the relevant upstream phase (spec/test-plan), not this plan.

**Acceptance Criteria**:

- Must: every accepted finding is resolved and re-validated; rejected findings cite the governing
  DEC/NG/spec section.
- Must: no remediation introduces a `src/` DOMAIN-LOGIC change or extends the `router.ts` touch beyond the Phase 1 wiring (C-NO-SRC-DOMAIN), or commits a secret (C-SECRET).
- Must: `bun run check` remains green after remediation.

**Acceptance Criteria → AC mapping**: depends on the finding (preserves whichever AC the finding
touched). **Probe/TC mapping**: the relevant TC for the remediated area.

**Files and modules**:

- Code areas: the file(s) named in the finding (one of the Phase 1–6 artifacts).
- System docs: none unless a doc-finding names `doc/guides/binary-release-signing.md`.

**Tests**:

- The acceptance check of the remediated phase + `bun run check` + (if artifacts touched) TC-SEC-001.

**Completion signal**: `(varies by finding) — review remediation for GH-32`

---

> **Spec reconciliation note (per spec NG-9):** ADR-0001, the MS2-E5-S4 story file, and
> `doc/spec/nonfunctional.md` are NOT mutated by this plan's coder. Their reconciliation — adding
> release-pipeline evidence pointers (NFR-PERF-1/2 actuals, NFR-COMP-1/2 satisfied, NFR-SEC-4 SBOM),
> flipping the story `status: todo → done`, and the partial ADR-0001 signing-Unresolved-Question
> address — is **lifecycle phase 7** (`@doc-syncer`) work, enumerated under Doc-update coverage
> below. The version bump (Phase 6) is the only `package.json` change and does not touch any ADR/spec.

## Test Scenarios

> All tests are **E2E (release) tier** (test-plan §4) — this story introduces no `src/` domain
> logic, so unit/integration/golden/mermaid/BDD tiers do not apply. TC-CI-001 is the regression
> guard (existing suite green).

### Phase → AC → TC mapping

| Phase | AC | TC | Scenario | Where it runs |
|-------|----|----|----------|---------------|
| Phase 1 | AC-BUILD-1 (local) | TC-BUILD-001 (local) | Real-CLI cross-compile (linux-x64 + linux-arm64 + win-x64) on Bun 1.2.23; each `--version` matches `package.json` | Local (dev), then CI in Phase 2 |
| Phase 2 | AC-BUILD-1 (CI), AC-RUN1-1, AC-RUN2-1 | TC-BUILD-001 (CI), TC-RUN-001, TC-RUN-002 | Clean-OS linux Docker smoke + windows runner smoke (closes spike DEC-3) | `ci.yml` `binary-smoke` job (every push/PR) |
| Phase 3 | AC-SIZE-1, AC-START-1 | TC-SIZE-001, TC-START-001 | Size + cold-start recorded to `.benchmarks/binaries.json`; CI delta-report (non-blocking) | `ci.yml` `binary-smoke` measurement steps |
| Phase 4 | AC-SIGN-1 | TC-SIGN-001 | Signing reference doc references validated `osslsigncode` recipe + cert plug-in (env-var name only) | Manual/structural (doc verification) |
| Phase 5 | AC-COMP-1, AC-REL-1 | TC-REL-001 | Tag-triggered release attaches binaries + SHA256SUMS + CycloneDX SBOM; macOS excluded | `release.yml` on tag (structural validation in-CI; full e2e on first tag) |
| Phase 6 | AC-CI-1, AC-SEC-1 (+ final AC-BUILD/COMP/REL) | TC-CI-001, TC-SEC-001 | `bun run check` green; 0 secrets in committed artifacts; YAML-lint clean | Local + CI fast-loop + scan |
| Phase 7 | (varies) | (varies) | Post-review remediation (conditional) | Local + CI re-validation |

### TC summary (from test-plan §5.1)

| TC ID | Title | AC | Status |
|-------|-------|----|--------|
| TC-BUILD-001 | Cross-compile success (linux-x64 + linux-arm64 + win-x64) from real CLI, Bun 1.2.23 | AC-BUILD-1 | To implement (Phases 1, 2) |
| TC-RUN-001 | Clean-OS linux-x64 smoke on `debian:stable-slim` (no runtime; `--version` + `doctor --json`) | AC-RUN1-1 | To implement (Phase 2) |
| TC-RUN-002 | Clean-OS win-x64.exe smoke on `windows-latest` (no Wine; `--version`) | AC-RUN2-1 | To implement (Phase 2) |
| TC-SIZE-001 | Size measurement + persistence to `.benchmarks/binaries.json` | AC-SIZE-1 | To implement (Phase 3) |
| TC-START-001 | Cold-start measurement + persistence to `.benchmarks/binaries.json` | AC-START-1 | To implement (Phase 3) |
| TC-REL-001 | Release workflow artifact assembly: binaries + SHA256SUMS + SBOM on tag | AC-COMP-1, AC-REL-1 | To implement (Phase 5 — structural; full on first tag) |
| TC-SIGN-001 | Signing reference doc presence (`osslsigncode` recipe) | AC-SIGN-1 | To implement (Phase 4) |
| TC-CI-001 | `bun run check` green (no src/ regression) | AC-CI-1 | To implement (Phase 6) |
| TC-SEC-001 | Secret hygiene scan (0 secrets; `$CERT_PASSWORD` is a name) | AC-SEC-1 | To implement (Phase 6) |

> **TC-REL-001 note:** the release workflow triggers on a tag push, which does not occur during
> delivery (it is a post-merge maintainer action). Phase 5 therefore delivers a workflow that is
> **structurally** validated (YAML-lint, asset-presence assertion step, matrix correctness) and that
> runs **end-to-end** on the first real `v*` tag. The DoD accepts structural validation for delivery;
> the first tag cut is the full TC-REL-001 sign-off (recorded in the Execution Log / release notes).

### AC coverage summary

| AC | Covered by phases | Verdict source |
|----|-------------------|----------------|
| AC-BUILD-1 | Phase 1 (local), Phase 2 (CI) | 3 targets compile on Bun 1.2.23; each `--version` matches `package.json`; arm64 contingency if unavailable (DEC-3) |
| AC-RUN1-1 | Phase 2 | linux-x64 `--version` + `doctor --json` exit 0 on `debian:stable-slim`, no runtime |
| AC-RUN2-1 | Phase 2 | win-x64.exe `--version` exit 0 on `windows-latest` (closes spike DEC-3) |
| AC-SIZE-1 | Phase 3 | sizes recorded to `.benchmarks/binaries.json`; flagged-not-blocking (DEC-4) |
| AC-START-1 | Phase 3 | cold-start recorded; flagged-not-blocking (DEC-4) |
| AC-COMP-1 | Phase 5 (+ Phase 2 build) | matrix = Linux amd64+arm64 + Windows amd64; macOS NOT produced (DEC-8) |
| AC-SIGN-1 | Phase 4 | signing doc references validated recipe + cert plug-in (env-var name only) |
| AC-REL-1 | Phase 5 | tag → binaries + SHA256SUMS + CycloneDX SBOM attached |
| AC-CI-1 | Phase 6 | `bun run check` green; no src/ regression |
| AC-SEC-1 | Phase 6 (scan) + Phase 4 (doc hygiene) | 0 secrets in committed artifacts |

**All ten ACs are fully traced to phases and TCs.**

## Doc-update coverage (DoR facet)

> These system docs are touched by `@doc-syncer` in **lifecycle phase 7** (`system_spec_update`),
> NOT by this plan's coder (spec NG-9). Listed so the DoR gate sees the full reconciliation surface
> and the doc-syncer cannot miss it.

| System doc | Update | Triggered by | Owner |
|---|---|---|---|
| `doc/spec/nonfunctional.md` | Add evidence pointers for **NFR-PERF-1** (≤90 MB desired — actuals from `.benchmarks/binaries.json`), **NFR-PERF-2** (≤2 s cold-start), **NFR-COMP-1** (Linux+Windows shipped), **NFR-COMP-2** (clean-OS smoke in CI), **NFR-SEC-4** (SBOM per release). **No rewording of "desired, not hard"** (DEC-4). | First real-CLI measurement + first release | `@doc-syncer` |
| `doc/decisions/ADR-0001-*.md` | Add a forward-pointer to the E5-S4 release pipeline (`release.yml`) + the clean-OS smoke; partially address the open signing Unresolved Question by citing `doc/guides/binary-release-signing.md`. **Do NOT autonomously reconsider TS-over-Go** (catastrophic-failure escalation not triggered). | Release pipeline delivery | `@doc-syncer` |
| `doc/planning/.../MS2-E5-S4--binary-builds.md` | Flip `status: todo → done`; add an outcome banner (release pipeline shipped; arm64 status; signing reference; macOS deferred). | Story delivery | `@doc-syncer` |
| `doc/guides/binary-release-signing.md` (this story) | May be extended into a fuller release runbook (tag → `release.yml` → artifacts) at doc-syncer's discretion (pm-notes doc-risk candidate). | Doc-syncer decision | `@doc-syncer` |

> **Boundary reaffirmation:** the coder executing this plan must NOT edit any file under
> `doc/decisions/**`, `doc/spec/**`, or `doc/planning/**`. The only `doc/`-adjacent coder output is
> `doc/guides/binary-release-signing.md` (a new release-engineering guide, in scope per TC-SIGN-001)
> and the change-folder artifacts.

## Code-area coverage (DoR facet)

> **No `src/` DOMAIN-LOGIC file is created, edited, or deleted (C-NO-SRC-DOMAIN).** The sole `src/`
> touch is the Phase 1 version-source wiring in `src/cli/commands/router.ts` (the spec G-7/§16
> "trivial version-embed exception"); the only other non-infra edit is the `package.json` version
> line (Phase 6). Per-phase file inventory:

| Phase | New/updated files |
|-------|-------------------|
| Phase 1 | `scripts/build-binaries.sh` (updated — entry repoint, arm64, pin note); `src/cli/commands/router.ts` (updated — the ONE `src/` touch: version-source wiring, C-NO-SRC-DOMAIN carve-out) |
| Phase 2 | `.github/workflows/ci.yml` (updated — new `binary-smoke` job + windows leg) |
| Phase 3 | `.benchmarks/binaries.json` (new, commit-tracked); `.github/workflows/ci.yml` (updated — measurement + delta-report) |
| Phase 4 | `doc/guides/binary-release-signing.md` (new) |
| Phase 5 | `.github/workflows/release.yml` (new) |
| Phase 6 | `package.json` (updated — `version` 0.7.0 → 0.8.0 only) |
| Phase 7 | (varies — one of the above, per review finding) |

**Files NOT created/modified:** any `src/` file OTHER THAN the Phase 1 `src/cli/commands/router.ts`
version-source wiring, anything under `tests/`, `doc/decisions/**`, `doc/spec/**`,
`doc/planning/**`, `bun.lock` (the version bump does NOT add/remove deps, so the lockfile is
regenerated by `bun install` only if it changes — verify it stays consistent), or the spike
workspace (`spikes/bun-compile-smoke/**` — frozen, spec NG-7).

## Definition of Done

All ten spec ACs satisfied, each traceable to ≥1 phase + ≥1 TC (spec §17.1):

- [ ] **AC-BUILD-1** — linux-x64 + linux-arm64 (or RSK-2 contingency) + win-x64 build from the real
  CLI on Bun 1.2.23; each `--version` matches `package.json#version` (Phases 1, 2).
- [ ] **AC-RUN1-1** — linux-x64 `--version` (+ `doctor --json`) exit 0 on `debian:stable-slim`, no
  Bun/Node/Deno (Phase 2).
- [ ] **AC-RUN2-1** — win-x64.exe `--version` exit 0 on `windows-latest`, no Wine (Phase 2; closes
  spike DEC-3).
- [ ] **AC-SIZE-1** — sizes recorded to `.benchmarks/binaries.json`; ≤90 MB desired, flagged-not-
  blocking (Phase 3; DEC-4).
- [ ] **AC-START-1** — cold-start recorded; ≤2 s desired, flagged-not-blocking (Phase 3; DEC-4).
- [ ] **AC-COMP-1** — release matrix = Linux amd64+arm64 + Windows amd64; macOS NOT produced
  (Phase 5; DEC-8).
- [ ] **AC-SIGN-1** — signing doc references validated `osslsigncode` recipe + cert plug-in
  (env-var name only; no execution) (Phase 4; DEC-7).
- [ ] **AC-REL-1** — tag → binaries + 1 SHA256SUMS + 1 CycloneDX SBOM attached (Phase 5; PLN-DEC-1).
- [ ] **AC-CI-1** — `bun run check` green; no `src/` regression (Phase 6).
- [ ] **AC-SEC-1** — 0 secrets in committed artifacts; `$CERT_PASSWORD` is a name (Phase 6; Phase 4).

**Additional DoD items (spec §17.1):**

- [ ] `.benchmarks/binaries.json` committed + CI delta-reporting wired (non-blocking).
- [ ] `release.yml` produces the contract artifact set on tag (structurally validated; full on
  first tag).
- [ ] **Zero `src/` DOMAIN-LOGIC change** — `git diff` confirms only infra + `package.json` (version) + the one Phase 1 `src/cli/commands/router.ts` version-source wiring (C-NO-SRC-DOMAIN carve-out).
- [ ] macOS deferred (MS-0003); real signing deferred (MS-0003+).
- [ ] Bun pin = 1.2.23 everywhere (DEC-1); clean-OS image = `debian:stable-slim` (DEC-2).

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-32-spec.md` | Spec |
| Test plan | `./chg-GH-32-test-plan.md` | Test plan |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md` | Story |
| Spike plan (precedent) | `doc/changes/2026-07/2026-07-06--GH-13--bun-cross-compile-smoke/chg-GH-13-plan.md` | Plan |
| Spike findings (baseline) | `findings/bun-compile-smoke-findings.md` | Findings |
| Spike signing recipe (referenced) | `spikes/bun-compile-smoke/probes/signing-dry-run.md` | Recipe |
| Build script (refined) | `scripts/build-binaries.sh` | Script |
| CI workflow (extended) | `.github/workflows/ci.yml` | Workflow |
| Release workflow (new) | `.github/workflows/release.yml` | Workflow |
| Binary measurement baseline (new) | `.benchmarks/binaries.json` | Data (commit-tracked) |
| Signing reference (new) | `doc/guides/binary-release-signing.md` | Guide |
| Testing strategy | `.ai/rules/testing-strategy.md` | Rules |
| TypeScript conventions | `.ai/rules/typescript.md` | Rules |
| ADR-0001 (C-2/C-3 realized) | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | Decision |
| Non-functional requirements | `doc/spec/nonfunctional.md` | Spec |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | plan-writer (GH-32) | Initial implementation plan. 6 active phases + 1 conditional post-review phase, each one Conventional Commit (`build`/`ci`/`docs`/`chore` — no `feat`, no `src/` change). Derived from `chg-GH-32-spec.md` (AC-BUILD/RUN1/RUN2/SIZE/START/COMP/SIGN/REL/CI/SEC; F-1…F-6; NFR-CC/RUN/SIZE/START/SBOM/CHK/SEC/MAINT; DEC-1…DEC-8; RSK-1…RSK-8; OQ-1) and `chg-GH-32-test-plan.md` (TC-BUILD/RUN/SIZE/START/REL/SIGN/CI/SEC). Encoded PM hazards as load-bearing constraints: Bun pin 1.2.23 (DEC-1, NOT spike's 1.1.34); `debian:stable-slim` (DEC-2, NOT `debian:slim`). Resolved spec OQ-1 as PLN-DEC-1 (`syft` → CycloneDX JSON). Seeded `.benchmarks/binaries.json` from the spike baseline (PLN-DEC-2). Version bump 0.7.0 → 0.8.0 (PLN-DEC-3). Signing reference home = `doc/guides/binary-release-signing.md` (PLN-DEC-4). Includes Phase→AC→TC traceability, Doc-update coverage (lifecycle phase 7: nonfunctional.md, ADR-0001, MS2-E5-S4 story), Code-area coverage, and a Definition of Done mapping to all 10 ACs. References (does not duplicate) the GH-13 spike plan/findings/recipe. |
| 1.1 | 2026-07-26 | plan-writer (GH-32, DoR iter-1) | DoR iter-1 remediation (status → Updated). **BLOCKER fix:** relaxed `C-NO-SRC` → `C-NO-SRC-DOMAIN` to permit the ONE spec-G-7/§16 "trivial version-embed" carve-out, and rewrote Phase 1 task 1.3 to wire a real runtime version source in `src/cli/commands/router.ts` (JSON import of `package.json`, baked by Bun at build time; works in dev + `--compile`; `resolveJsonModule` already enabled). Resolves the C-NO-SRC + PLN-DEC-3 + AC-BUILD-1/DM-3 contradiction — the prior `--define MARKSYNC_VERSION` was a no-op since `router.ts` never read it (a package.json-only bump would have left the binary reporting 0.7.0). Phase 6 task 6.1 restated as a single-source `package.json` edit that propagates via the Phase 1 wiring. Updated every "zero `src/` change" / `git diff` assertion (phase ACs, Phase 6 DoD check, Code-area coverage, Definition of Done) → "zero `src/` DOMAIN-LOGIC change; only `src/` touch = Phase 1 `router.ts`." **NIT fix:** pinned `anchore/sbom-action@v0.24.0` (was floating `@v0`) in Phase 5 task 5.3 (DEC-1 determinism). No AC/TC ID or phase-structure changes; 7 phases preserved. |

## Execution Log

> Populated during story execution (lifecycle phase 6 — delivery). Each phase is one Conventional
> Commit.

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | DONE | 2026-07-26 | 2026-07-26 | `af841c3` | build-binaries.sh repointed to src/cli/index.ts + linux-arm64; router.ts version-source wiring (import pkg from package.json) |
| Phase 2 | DONE | 2026-07-26 | 2026-07-26 | `cc72319` | binary-smoke job (linux debian:stable-slim Docker + windows-latest runner) |
| Phase 3 | DONE | 2026-07-26 | 2026-07-26 | `ba88792` | .benchmarks/binaries.json seeded with spike baseline + CI size/cold-start delta-report |
| Phase 4 | DONE | 2026-07-26 | 2026-07-26 | `0b0a9e0` | doc/guides/binary-release-signing.md (references spike osslsigncode recipe) |
| Phase 5 | DONE | 2026-07-26 | 2026-07-26 | `9f73980` | .github/workflows/release.yml (tag-triggered matrix + SHA256SUMS + SBOM via syft CycloneDX) |
| Phase 6 | DONE | 2026-07-26 | 2026-07-26 | `bf95217` | package.json 0.7.0 → 0.8.0 (single-source via Phase 1 wiring); bun run check green |
| Phase 7 | DONE | 2026-07-26 | 2026-07-26 | `efedc82` `4fc9aff` `228661d` `6c3fc44` `c07eca4` | post-review remediation: B-1 doctor EXIT_HEALTH=60 tolerance, M-1 real delta comparison, M-2 binding no-runtime check, m-1..m-4 + nits; then ci.yml YAML-indentation fix (c07eca4) caught by doc-yaml-lint equivalent |

> Inline task checkboxes (`- [ ]`) above were not cosmetically ticked during `/run-plan`; phase completion is canonicalized in this Execution Log + verified by review iter-2 PASS (all 10 ACs) + the commit history.
