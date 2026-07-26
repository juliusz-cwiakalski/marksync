---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-32
  type: feat
  status: Proposed
  slug: cross-platform-binary-builds
  title: "[MS2-E5-S4] Cross-platform binary builds"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, release-pipeline, binary-builds, bun-compile, ci, sbom, cross-platform]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [scripts/build-binaries.sh (GH-13 skeleton), src/cli entry (GH-14), ci.yml, new release.yml, new .benchmarks/binaries.json]
    external: ["Bun build --compile", "GitHub Actions (ubuntu/windows runners)", "Docker (debian:stable-slim)", "syft (SBOM)", "osslsigncode (reference only)"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Turn the GH-13 spike-validated `bun build --compile` mechanism into a reproducible release pipeline that ships versioned single-binary builds for **Linux (amd64 + arm64) + Windows (amd64)**, each validated by a clean-OS runtime smoke, with commit-tracked size/cold-start regression data, a documented Windows Authenticode signing plug-in point, and a per-release SBOM + SHA256 checksums — so MS-0002 honors ADR-0001's distribution promise (C-2 single binary no runtime; C-3 cross-platform) as downloadable artifacts (NFR-COMP-1/2, NFR-PERF-1/2, NFR-SEC-4).

## 1. SUMMARY

This change is the **production follow-up to the GH-13 cross-compile spike**: it refines the committed `scripts/build-binaries.sh` skeleton (repointing its placeholder entry `./src/cli.ts` to the real CLI `src/cli/index.ts`, embedding the `package.json` version, and adding the validated `linux-arm64` target), wires a **clean-OS runtime smoke** into CI (Docker `debian:stable-slim` for linux-x64; a real `windows-latest` runner for win-x64 — closing the spike's DEC-3 Windows-run deferral), **records binary size + cold-start** to a commit-tracked `.benchmarks/binaries.json` with CI delta-reporting (not hard-fail), **documents** the Windows Authenticode signing plug-in point, and adds a **tag-triggered release workflow** that attaches the binary matrix + `SHA256SUMS` + a `syft` SBOM to a GitHub Release.

It is **build / CI / release engineering only** — it introduces **no `src/` domain logic** (the only possible `src/` touch is trivial, e.g. ensuring the version embeds, and zero `src/` change is preferred). The cross-compile mechanism, the clean-OS no-runtime proof, the size/cold-start baseline, and the signing recipe were all **validated by GH-13** (H1–H5 PASS); this story wires them into the real release pipeline against the real CLI.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **ADR-0001** (governance-`Accepted`) commits MarkSync to TypeScript + Bun `build --compile` precisely to satisfy **C-2** (single self-contained binary per OS+arch, no mandatory runtime) and **C-3** (cross-platform). The cross-compile mechanism and the no-runtime promise were **empirically validated** by the **GH-13 spike** (`findings/bun-compile-smoke-findings.md`, H1–H5 all PASS): both `bun-linux-x64` and `bun-windows-x64` cross-compile from a Linux host (exit 0; ELF 64-bit x86-64 + PE32+ x86-64); the linux-x64 binary **runs on a clean `debian:stable-slim` image with no Bun/Node/Deno installed** (`command -v bun node deno` → exit 127; `./marksync-linux-x64 --version` → exit 0). The catastrophic-failure escalation is **not triggered** — TS-over-Go is locked in (ADR-0001 CEO-DEC-1).
- **`scripts/build-binaries.sh`** exists as the GH-13 handoff skeleton: it wraps the two validated `bun build --compile --target=…` invocations, generates a `SHA256SUMS` accumulator, and carries a clearly-marked `TODO(E5-S4)` signing marker pointing at the spike's recipe. Its entry default is a **placeholder** `./src/cli.ts` that this story repoints to the real CLI. The skeleton does **not** build arm64, does **not** embed the real version, and has **no CI/release wiring**.
- The **real CLI entry** `src/cli/index.ts` exists (delivered by GH-14 project scaffolding), so the build can target production code rather than the spike's smoke CLI. `package.json` pins `engines.bun` = **1.2.23** and `version` = **0.7.0**; the fast-loop + e2e-mock CI matrices pin the same **1.2.23** (`ci.yml`). The spike's one-time validation used **1.1.34** — a different pin that must **not** propagate into the release pipeline.
- The **measured baseline** (GH-13, to carry forward as the E5-S4 regression reference): linux-x64 **96.90 MB** (101,604,521 B), win-x64 **105.12 MB** (110,224,195 B) — both exceed the ≤90 MB desired budget (flagged-not-blocking); linux-x64 cold-start **median 0.010 s** (n=5) on the clean OS, max RSS ~34.7 MB — ~200× inside the ≤2 s budget. `bun-linux-arm64` and `bun-darwin-arm64` are valid cross-compile targets (TC-BCS-008).
- A concrete **Windows Authenticode signing recipe** is documented at `spikes/bun-compile-smoke/probes/signing-dry-run.md` (`osslsigncode sign`/`verify`/`extract-signature`, PKCS#12 + PEM forms, cert plug-in table, `$CERT_PASSWORD` env-var **name**). It is a dry-run reference — no real cert and no execution.
- The **release surface is absent**: there is **no** `.github/workflows/release.yml`, **no** `.benchmarks/` directory, **no** SBOM generation, and **no** clean-OS smoke in CI. The only workflows are `ci.yml` (fast loop) and `run-e2e.yml` (live sandbox).

### 2.2 Pain Points / Gaps

- ADR-0001's distribution promise is **spike-validated but not shipped**: there is no release workflow that produces downloadable binaries, so MS-0002 cannot yet be distributed as the promised single-binary artifacts.
- The validated `scripts/build-binaries.sh` skeleton still targets the **placeholder** entry (`./src/cli.ts`); it has never built the **real** CLI, never embedded the real version, and never produced the `linux-arm64` target.
- The spike's **DEC-3 deferral** — the clean-OS **Windows run** was never executed (`wine` absent; only win-x64 *production* was validated) — remains open. There is no CI signal that the win-x64 binary actually runs on Windows.
- **Size and cold-start are untracked over time**: the spike recorded a one-time baseline, but there is no commit-tracked measurement feeding a regression signal, so a future bloat regression would be invisible until release.
- **NFR-SEC-4 (supply-chain baseline)** is unmet for releases: no SBOM is generated or attached to any release artifact.
- The story scope text names the clean-OS image `debian:slim`, which is **not a published Docker Hub tag** (spike reconciliation); an uncorrected reference would break the smoke job.

## 3. PROBLEM STATEMENT

Because ADR-0001's distribution promise (single self-contained binary per OS/arch, no mandatory runtime) is spike-validated (GH-13, H1–H5 PASS) but **not yet wired into a real release pipeline**, MS-0002 cannot ship as downloadable binaries — there is no release workflow, no SBOM, no clean-OS runtime smoke in CI, no regression-tracked size/cold-start data, and the validated build skeleton still points at a placeholder entry instead of the real CLI — so the project cannot deliver the MS-0002 distribution artifact it committed to without closing these gaps deterministically and reproducibly.

## 4. GOALS

- **G-1**: Produce **real-CLI** single binaries for **linux-x64, linux-arm64, and win-x64** from the refined build script, each embedding the `package.json` version (entry repointed to `src/cli/index.ts`).
- **G-2**: Prove in **CI** that the linux-x64 binary runs on a **clean OS** (`debian:stable-slim`, no Bun/Node) and that the win-x64.exe runs on a **real Windows runner** — closing the spike's DEC-3 deferral.
- **G-3**: **Record** binary size and cold-start to a commit-tracked `.benchmarks/binaries.json`; CI **reports deltas** (not a hard fail) for regression visibility.
- **G-4**: **Document** the Windows Authenticode signing story (reference the validated `osslsigncode` recipe + the cert plug-in point); real signing stays out of scope.
- **G-5**: Ship a **tag-triggered release workflow** that builds the matrix and attaches binaries + `SHA256SUMS` + an SBOM to a GitHub Release.
- **G-6**: Meet **NFR-SEC-4** (SBOM per release) via `syft`/CycloneDX output.
- **G-7**: Introduce **no `src/` domain-logic change** — pure build/CI/release engineering (zero `src/` change preferred; a trivial version-embed touch is the only conceivable exception).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Cross-compile targets produced | 3 (`linux-x64`, `linux-arm64`, `win-x64`) — arm64 per R1; x64-only fallback recorded if a target is unavailable |
| Clean-OS linux-x64 run | exit 0 on `debian:stable-slim` with no Bun/Node installed |
| Clean-OS win-x64 run | exit 0 on a `windows-latest` runner (no Wine) |
| Binary size recorded | actual recorded per target; ≤90 MB **desired** (flagged-not-blocking; DEC-4) |
| Cold-start recorded | actual recorded for linux-x64; ≤2 s **desired** (flagged-not-blocking) |
| Release artifacts per tag | binaries + 1 `SHA256SUMS` + 1 SBOM |
| Secrets in committed artifacts | **0** (signing reference uses `$CERT_PASSWORD` env-var **name**, never a literal) |
| `src/` domain-logic lines changed | **0** (preferred) |

### 4.2 Non-Goals

- **NG-1**: macOS target — deferred to MS-0003 per NFR-COMP-1 (and ADR-0001's macOS signing/notarization is a separate owner decision).
- **NG-2**: arm64 as a **hard gate** — it is a stretch (record/include; do not block; CEO R1).
- **NG-3**: **Real code-signing** with a production certificate — dry-run/documented command only; the cert material plugs in at a documented point but is not provisioned.
- **NG-4**: Auto-update mechanism.
- **NG-5**: Package-manager distribution (MS-0009).
- **NG-6**: Reconsidering ADR-0001's TS-over-Go choice — the spike explicitly did **not** trigger the catastrophic-failure escalation; TS/Bun is locked in.
- **NG-7**: Modifying the smoke CLI under `spikes/bun-compile-smoke/` — that was the spike's standalone workspace and stays frozen.
- **NG-8**: Any `src/` domain-logic change (build/CI/release engineering only).
- **NG-9**: Mutating ADR-0001, the story file, or `doc/spec/nonfunctional.md` — those are lifecycle-phase-7 (`@doc-syncer`) reconciliations; this spec only supplies the enabling release pipeline.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Real-CLI binary production (linux-x64 + linux-arm64 + win-x64) | The build script must target the **real** CLI (not the spike's smoke CLI), embed the real version, and include the validated arm64 target — the precondition for every downstream smoke/release artifact (ADR-0001 C-2/C-3; NFR-COMP-1). |
| F-2 | Clean-OS runtime smoke in CI (linux Docker + windows runner) | Proves the no-runtime promise (NFR-COMP-2) **in CI on every change**, and closes the spike's DEC-3 Windows-run deferral by running win-x64.exe on a real Windows runner (no Wine). |
| F-3 | Size + cold-start measurement, persisted + delta-reported | Turns the spike's one-time baseline into a commit-tracked regression signal (`.benchmarks/binaries.json`) so future bloat is visible — reported as deltas, not a hard gate (NFR-PERF-1/2 "desired, not hard"). |
| F-4 | Documented Windows Authenticode signing story | The enterprise-trust bar (ADR-0001 open signing question) needs a concrete, reusable command + cert plug-in point; the validated `osslsigncode` recipe is referenced/refined, with where a real cert plugs in documented. Real signing stays out (NG-3). |
| F-5 | Tag-triggered release workflow (matrix → GitHub Release) | MS-0002's distribution is downloadable binaries; the release pipeline assembles the matrix, generates checksums, and attaches artifacts to a GitHub Release on tag. |
| F-6 | SBOM generation per release | Meets NFR-SEC-4 (supply-chain baseline): a `syft`/CycloneDX SBOM is produced and attached to every release. |

### 5.1 Capability Details

**F-1 (real-CLI binary production)** — The refined `scripts/build-binaries.sh` repoints its entry from the placeholder `./src/cli.ts` to `src/cli/index.ts` (the real CLI from GH-14), compiles via `bun build --compile --target=…` to `dist/marksync-linux-x64`, `dist/marksync-linux-arm64` (R1; the arm64 target is valid per TC-BCS-008), and `dist/marksync-win-x64.exe`, and embeds the version sourced from `package.json` so `--version` reports the real release version (not the spike's `0.0.0`). The Bun version used is the project pin (**1.2.23**, matching `package.json#engines.bun` + `ci.yml`) — **not** the spike's 1.1.34 (DEC-1).

**F-2 (clean-OS smoke in CI)** — A CI job runs the linux-x64 binary inside Docker `debian:stable-slim` (the spike-verified clean-OS image — `debian:slim` is not a published tag; DEC-2), asserting no Bun/Node/Deno is present and `--version` (+ `doctor --json` against a mock/sandbox) exits 0. A second leg runs `marksync-win-x64.exe --version` on a real `windows-latest` GitHub runner (no Wine), closing the spike's DEC-3 deferral. The smoke is secrets-free and exercises only the binary bootstrap.

**F-3 (measurement + delta-reporting)** — Each build records the binary size (bytes) and the linux-x64 cold-start (fresh-process wall-clock of `--version` on the clean OS) to `.benchmarks/binaries.json` (commit-tracked). CI reports the delta against the committed baseline; a delta does **not** hard-fail the build (DEC-6) — it is a regression-visibility signal, consistent with the testing-strategy benchmark-gate philosophy.

**F-4 (signing story)** — The validated `osslsigncode` Authenticode recipe at `spikes/bun-compile-smoke/probes/signing-dry-run.md` is referenced and, where helpful, refined into a release-oriented note documenting the exact inputs at which a production cert plugs in (`-pkcs12`/`-certs`/`-key`, `-pass` via the `$CERT_PASSWORD` CI secret **name**, the `-t` timestamp URL, `-h sha256`). No cert is provisioned and no signing is executed (NG-3); the reference uses the env-var **name** only.

**F-5 (release workflow)** — `.github/workflows/release.yml` triggers on tag, runs the build matrix (linux-x64 + linux-arm64 cross-compiled on an ubuntu runner; win-x64 on ubuntu cross-compile or a windows runner per the validated path), generates `SHA256SUMS` (one hash per binary), and attaches the binaries + checksums + SBOM to the GitHub Release. It is **net-new** and separate from `ci.yml`.

**F-6 (SBOM)** — `syft` (emitting CycloneDX) produces one SBOM per release, attached alongside the binaries and checksums, satisfying NFR-SEC-4's supply-chain baseline.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Per-push CI clean-OS smoke (linux + windows):
  PR/push to main →
    build linux-x64 + win-x64 from src/cli/index.ts (Bun 1.2.23) →
    linux leg: docker run --rm … debian:stable-slim ./marksync-linux-x64 --version
       → assert exit 0 + version string + no bun/node/deno on PATH  [NFR-RUN-1]
    windows leg: windows-latest runner → .\marksync-win-x64.exe --version
       → assert exit 0  [NFR-RUN-2, closes DEC-3]
    record size + cold-start → .benchmarks/binaries.json; CI reports delta (no hard fail)  [NFR-SIZE/START-1]
```

```
Flow 2 — On-tag release (matrix → GitHub Release):
  Maintainer pushes tag vX.Y.Z →
    release.yml builds the matrix (linux-x64, linux-arm64 [R1], win-x64) →
    generate SHA256SUMS (1 hash/binary) →
    generate SBOM via syft (CycloneDX) →
    attach binaries + SHA256SUMS + SBOM to the GitHub Release  [NFR-SBOM-1, NFR-CHK-1]
```

```
Flow 3 — Signing plug-in (reference only; NOT executed in MS-0002):
  Maintainer obtains an Authenticode cert (MS-0003+) →
    osslsigncode sign -pkcs12 <cert> -pass "$CERT_PASSWORD" -t <tsa-url> -h sha256
       -in marksync-win-x64.exe -out marksync-win-x64-signed.exe
    (the cert material + password plug in at the documented inputs; NG-3 keeps this out of MS-0002)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Refining `scripts/build-binaries.sh`: repoint entry `./src/cli.ts` → `src/cli/index.ts`; embed the `package.json` version; add the `linux-arm64` target (R1); keep the `SHA256SUMS` accumulator and the signing-TODO marker.
- A **clean-OS smoke CI job**: linux-x64 on Docker `debian:stable-slim` (no runtime; `--version` + `doctor --json` exit 0) and win-x64.exe on a real `windows-latest` runner (`--version` exit 0).
- **Size + cold-start measurement** persisted to a commit-tracked `.benchmarks/binaries.json`, with CI delta-reporting (not hard-fail).
- **Documenting** the Windows Authenticode signing plug-in point (reference/refine the validated `osslsigncode` recipe; cert plug-in table; env-var **name** only).
- A **tag-triggered** `.github/workflows/release.yml`: matrix build + `SHA256SUMS` + SBOM attached to a GitHub Release.
- **SBOM** generation (`syft`/CycloneDX) per release (NFR-SEC-4).
- Encoding the **Bun-version-pin hazard** (release pin = 1.2.23, not the spike's 1.1.34) and the **`debian:stable-slim` tag reconciliation** as decisions.

### 7.2 Out of Scope

- [OUT] macOS target (MS-0003 per NFR-COMP-1).
- [OUT] arm64 as a hard gate (stretch — include/record, do not block; CEO R1).
- [OUT] Real code-signing with a production certificate (dry-run/documented command only).
- [OUT] Auto-update mechanism.
- [OUT] Package-manager distribution (MS-0009).
- [OUT] Reconsidering ADR-0001's TS-over-Go choice (catastrophic-failure escalation not triggered).
- [OUT] Modifying the spike's smoke CLI under `spikes/bun-compile-smoke/`.
- [OUT] Any `src/` domain-logic change (build/CI/release engineering only; trivial version-embed touch only if required).
- [OUT] Mutating ADR-0001, the story file, or `doc/spec/nonfunctional.md` (phase-7 doc-sync).
- [OUT] Re-baselining or re-running the GH-13 spike probes.

### 7.3 Deferred / Maybe-Later

- **macOS** target + notarization (`codesign` + `xcrun notarytool`, Apple Developer ID) — MS-0003.
- **Real production signing** with a provisioned cert wired through CI secrets — MS-0003+.
- **arm64 hardening** as a gate, and a **musl/alpine** variant, once a consumer requires it (the glibc-linked binary does not run on alpine — RSK in the spike findings).
- A richer release **runbook** doc (tag → release.yml → artifacts) — candidate `doc/ops/` or `doc/guides/`; deferred to phase-7 doc-sync per the pm-notes.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change adds no application HTTP surface. The release workflow uses the GitHub Releases artifact-attachment mechanism (platform infra), not a MarkSync endpoint.

### 8.2 Events / Messages

N/A — no new events or message types.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `.benchmarks/binaries.json` | Commit-tracked measurement record: per-target binary size (bytes) + linux-x64 cold-start (wall-clock, n-samples). Schema is a release-engineering artifact, not a domain entity; consumed by the CI delta-reporter and regression tracking. |
| DM-2 | Release artifact manifest | The per-tag release bundle: the binary set (`marksync-linux-x64`, `marksync-linux-arm64`, `marksync-win-x64.exe`) + one `SHA256SUMS` (hash per binary, basenames) + one SBOM (`syft` CycloneDX). |
| DM-3 | Version-embedding contract | The compiled binary's `--version` output equals `package.json#version` (currently `0.7.0`); the smoke and release both assert this so a stale/placeholder version is caught. |

### 8.4 External Integrations

| Integration | Role | Notes |
|---|---|---|
| Bun `build --compile` | Cross-compile mechanism | Pinned to **1.2.23** (project pin; DEC-1) — **not** the spike's 1.1.34. Targets `bun-linux-x64`, `bun-linux-arm64` (R1), `bun-windows-x64` are stable across these versions (TC-BCS-008). |
| Docker `debian:stable-slim` | Clean-OS linux smoke image | The spike-verified clean-OS image (Debian 13 "trixie"); `debian:slim` is **not** a published tag (DEC-2). No Bun/Node/Deno present. |
| GitHub Actions runners | Build + smoke hosts | `ubuntu-latest` (linux builds + cross-compile + linux smoke container); `windows-latest` (win-x64 smoke — closes DEC-3; no Wine). |
| GitHub Releases | Distribution channel | Artifacts (DM-2) attached on tag. |
| `syft` (CycloneDX) | SBOM generator | NFR-SEC-4; one SBOM per release. |
| `sha256sum` | Checksum generation | One hash per binary → `SHA256SUMS`. |
| `osslsigncode` (reference only) | Windows Authenticode signing | **Not executed** in MS-0002 (NG-3); the validated recipe is referenced, with the cert plug-in point documented. |

### 8.5 Backward Compatibility

**Fully backward compatible.** The change is additive release engineering: `release.yml` is net-new and separate from `ci.yml`; the clean-OS smoke is a new CI job; `.benchmarks/binaries.json` is a new tracked file; the `scripts/build-binaries.sh` refinement (entry repoint + version embed + arm64) changes a build-only script, not a runtime contract. **No `src/` domain contract, CLI command surface, config schema, lock format, or exit-code set is altered.** Existing CI jobs (`ci.yml` fast-loop, e2e-mock, audit, osv-scan, doc-yaml-lint) are unchanged. Produced binaries are a new distribution channel; nothing previously shipped is affected.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold (→ canonical) |
|----|-------------|-----------|
| NFR-CC-1 | Cross-compile success | 3 targets compile exit 0 (`linux-x64`, `linux-arm64` per R1, `win-x64`) from the real CLI entry → **NFR-COMP-1** |
| NFR-RUN-1 | Clean-OS Linux runtime | linux-x64 binary exits 0 on `debian:stable-slim` with no Bun/Node/Deno installed → **NFR-COMP-2** |
| NFR-RUN-2 | Clean-OS Windows runtime | win-x64.exe exits 0 on a `windows-latest` runner (no Wine) — closes spike DEC-3 → **NFR-COMP-2** |
| NFR-SIZE-1 | Binary size recorded | ≤90 MB **desired**; **actual recorded** per target; flagged-not-blocking → **NFR-PERF-1**, DEC-4 |
| NFR-START-1 | Cold-start recorded | ≤2 s **desired**; **actual recorded** for linux-x64; flagged-not-blocking → **NFR-PERF-2**, DEC-4 |
| NFR-SBOM-1 | SBOM per release | 1 `syft`/CycloneDX SBOM attached to every tagged release → **NFR-SEC-4** |
| NFR-CHK-1 | Release checksums | 1 `SHA256SUMS` per release (one hash per binary, portable basenames) |
| NFR-SEC-1 | Secret hygiene | **0** secrets in any committed artifact → **NFR-SEC-1 / INV-SEC-1** |
| NFR-MAINT-1 | Non-blocking regression signal | CI reports size/cold-start **deltas**, never hard-fails on them (DEC-6) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new product telemetry and no outbound telemetry (NFR-SEC-3). Observability for this change is **release-engineering visibility**:

- **Build evidence**: each cross-compile target's exit status + `file(1)` type, surfaced in CI logs.
- **Clean-OS smoke evidence**: the linux Docker run (`command -v bun node deno` → 127; `--version` → 0) and the windows runner `--version` exit, in CI logs.
- **Regression signal**: `.benchmarks/binaries.json` (DM-1) records size + cold-start; CI reports the delta vs. the committed baseline per build (non-blocking — NFR-MAINT-1).
- **Release provenance**: each GitHub Release carries the binary set + `SHA256SUMS` + SBOM (DM-2), giving consumers an auditable artifact bundle.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | The release workflow pins the **spike's** Bun 1.1.34 instead of the project pin 1.2.23, producing unreproducible/target-mismatched binaries | H | M | Encode **1.2.23** as the single release pin matching `package.json#engines.bun` + `ci.yml` (DEC-1); assert `bun --version` in the build step; smoke asserts the binary runs. Targets are stable across 1.1.34→1.2.23 (TC-BCS-008). | L |
| RSK-2 | `linux-arm64` target unavailable in the pinned Bun | L | L | Include arm64 (CEO R1); if the target is unavailable, ship x64-only for MS-0002 and record arm64 as MS-0003 — do not block. | L |
| RSK-3 | Binary exceeds 90 MB (confirmed: linux 96.90 MB, win 105.12 MB) | L | H | Accepted per PR #4 / DEC-5 ("desired, not hard"); **record + flag**, never block MS-0002 (DEC-4). | L |
| RSK-4 | Clean-OS image tag mismatch (`debian:slim` is not published) breaks the smoke job | M | L | Use `debian:stable-slim` (spike-verified; DEC-2); encode the reconciliation in the spec/plan. | L |
| RSK-5 | win-x64.exe run is flaky on the hosted Windows runner (SmartScreen/AV/ephemeral env) | M | L | Use a real `windows-latest` runner with `--version` only (minimal surface); no Wine; record intermittent failures rather than gating flakily. | L |
| RSK-6 | Release attaches an incomplete/incorrect artifact set (missing arm64, stale checksums, missing SBOM) | M | M | Matrix is exhaustive; `SHA256SUMS` regenerated per build (no stale hashes); release smoke asserts artifact presence; SBOM generation gated as a required step. | M |
| RSK-7 | Version not embedded — binary reports the spike's `0.0.0` or a stale value | L | M | Source the version from `package.json#version`; smoke + release assert `--version` matches (DM-3). | L |
| RSK-8 | A committed artifact leaks a signing secret (literal password/cert) | H | L | Signing is reference-only (NG-3); the recipe uses `$CERT_PASSWORD` env-var **name**, never a literal; secret-scan gate (AC-SEC-1). | L |

## 12. ASSUMPTIONS

- The GH-13 spike findings are accurate and current (H1–H5 PASS; sizes linux 96.90 MB / win 105.12 MB; cold-start median 0.010 s; arm64 targets valid) — this story consumes, not re-derives, them.
- The cross-compile targets (`bun-linux-x64`, `bun-linux-arm64`, `bun-windows-x64`) remain valid in the project-pinned Bun **1.2.23** (TC-BCS-008 confirmed them in 1.1.34; targets are stable across these versions).
- `debian:stable-slim` remains the canonical clean-OS linux image (spike-verified; `debian:slim` is not published).
- The real CLI entry `src/cli/index.ts` (GH-14) is a valid `bun build --compile` entry that produces a working `--version` (and `doctor --json`) without src/ changes.
- NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s) are **"desired, not hard"** (PR #4; `doc/spec/nonfunctional.md`); exceedance is recorded + flagged, never blocking for MS-0002 (DEC-4).
- Documenting the `osslsigncode` recipe (without executing it) is sufficient to satisfy the "signing story documented" AC (AC-SIGN-1); a real cert is not required (NG-3).
- A new release-pipeline capability warrants a **minor** version impact; the exact bump (e.g. 0.7.0 → 0.8.0) is a release-time decision, not a spec mandate.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E1-S3 / GH-13 (cross-compile spike) | **RESOLVED** (CLOSED) — supplies the validated mechanism, the `scripts/build-binaries.sh` skeleton, the clean-OS baseline, and the signing recipe. This story is its production follow-up. |
| Depends on | MS2-E2-S1 / GH-14 (project scaffolding) | **RESOLVED** (CLOSED) — provides the real CLI entry `src/cli/index.ts` and `package.json` (engines.bun = 1.2.23, version = 0.7.0). |
| Depends on | ADR-0001 | Language/runtime choice whose C-2/C-3 this release pipeline realizes; signing Unresolved Question partially addressed by F-4. |
| Depends on | Bun `build --compile` + GitHub Actions + Docker + `syft` | External build/CI/release tooling. |
| Blocks | MS-0002 release (distribution) | MS-0002 ships as downloadable binaries; without this pipeline there is no distribution artifact. |
| Blocks | MS-0003 (macOS + real signing) | Establishes the release matrix + signing plug-in point macOS/real-cert extend. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | `syft` vs `cyclonedx-cli` as the SBOM generator, and the exact SBOM output format | The story lists "syft/cyclonedx"; `syft` can itself emit CycloneDX JSON, so a single tool likely suffices for NFR-SEC-4. This is an implementation choice, not a load-bearing ambiguity. | Minor — resolve at delivery (prefer `syft` emitting CycloneDX); consult `@decision-advisor` only if a downstream consumer imposes a specific format/schema version. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Release-pipeline Bun pin = 1.2.23** (matches `package.json#engines.bun` + `ci.yml`), **not** the spike's 1.1.34 | Critical version-pin hazard (pm-notes): the spike's 1.1.34 was a one-time validation pin; the release pipeline must match the CI pin for reproducibility. Targets are stable across these versions (TC-BCS-008). | 2026-07-26 |
| DEC-2 | **Clean-OS image = `debian:stable-slim`** (not `debian:slim`) | The story text says `debian:slim`, which is **not** a published Docker Hub tag; `debian:stable-slim` is the canonical current Debian slim tag, spike-verified clean-OS (findings §9). NFR-COMP-2 is satisfied identically. | 2026-07-26 |
| DEC-3 | **Include `linux-arm64`** (CEO R1) | `bun-linux-arm64` is a valid target (TC-BCS-008); include it. If the target is unavailable in the pinned Bun, ship x64-only for MS-0002 and record arm64 as MS-0003 — do not block. | 2026-07-26 (CEO R1) |
| DEC-4 | **Size ≥ 90 MB is "desired, not hard"** — record + flag, never block | Carry-forward of spike DEC-5 / story R2 / PR #4 ("larger acceptable if the job gets done"). CEO waives NFR-PERF-1 as a hard gate; NFR-PERF-2 (cold-start) treated identically. Baseline: linux 96.90 MB, win 105.12 MB. | 2026-07-26 (CEO R2 / PR #4) |
| DEC-5 | **Windows smoke via a real `windows-latest` runner** (closes spike DEC-3) | The spike deferred the clean-OS Windows *run* (wine absent; only win-x64 *production* validated). A real Windows runner executes the binary natively — no Wine needed. | 2026-07-26 |
| DEC-6 | **CI size/cold-start reporting is delta-only, never hard-fail** | Regression visibility, not a gate — consistent with the testing-strategy benchmark-gate philosophy and the "desired, not hard" NFRs (DEC-4). | 2026-07-26 |
| DEC-7 | **Real production signing is OUT** — dry-run/documented command only (NG-3) | The validated `osslsigncode` recipe is referenced with its cert plug-in point; provisioning a real cert + CI secret is MS-0003+. The reference uses `$CERT_PASSWORD` as an env-var **name**, never a literal. | 2026-07-26 |
| DEC-8 | **macOS is OUT of MS-0002** (MS-0003 per NFR-COMP-1) | NFR-COMP-1 scopes MS-0002 to Linux + Windows; macOS (+ notarization) is a separate owner decision for MS-0003. | 2026-07-26 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `scripts/build-binaries.sh` | **Refined** — entry repointed `./src/cli.ts` → `src/cli/index.ts`; `package.json` version embedded; `linux-arm64` target added (R1); `SHA256SUMS` accumulator + signing-TODO marker retained. Build-only script; no runtime contract change. |
| `.github/workflows/release.yml` | **New** — tag-triggered; matrix build (linux-x64, linux-arm64, win-x64) + `SHA256SUMS` + SBOM attached to the GitHub Release. Separate from `ci.yml`. |
| Clean-OS smoke CI job | **New** — linux-x64 on Docker `debian:stable-slim` (no runtime; `--version` + `doctor --json` exit 0) + win-x64.exe on `windows-latest` (`--version` exit 0). |
| `.benchmarks/binaries.json` | **New** — commit-tracked size + cold-start record (DM-1); CI delta-reporter consumes it. |
| Signing reference | **Referenced/refined** — the validated `osslsigncode` recipe (`spikes/bun-compile-smoke/probes/signing-dry-run.md`) is pointed at, with a release-oriented cert plug-in note. No execution. |
| `src/` | **No domain-logic change** (preferred); the only conceivable touch is a trivial version-embed aid if required — otherwise zero `src/` change. |
| `dist/` | **Build output** — gitignored; not committed. |
| ADR-0001 / story file / `doc/spec/nonfunctional.md` | **Unchanged by this spec** — phase-7 (`@doc-syncer`) reconciliation adds evidence/release pointers; no auto-reconsideration of TS-over-Go. |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion (Given / When / Then) | Linked |
|----|----------------------------------|--------|
| AC-BUILD-1 | **Given** the refined build script, the real CLI entry `src/cli/index.ts`, and the project-pinned Bun **1.2.23**, **when** the build runs the full target set, **then** it produces `dist/marksync-linux-x64`, `dist/marksync-linux-arm64` (R1; or x64-only with arm64 recorded as MS-0003 if unavailable), and `dist/marksync-win-x64.exe`, each reporting the `package.json` version via `--version`. | F-1, NFR-CC-1, DEC-1, DEC-3 |
| AC-RUN1-1 | **Given** the linux-x64 binary, **when** it is run inside a clean `debian:stable-slim` container with no Bun/Node/Deno installed, **then** `--version` exits 0 (and `doctor --json` against a mock/sandbox exits 0). | F-2, NFR-RUN-1, DEC-2 |
| AC-RUN2-1 | **Given** the win-x64.exe, **when** it is run on a clean `windows-latest` runner (no Wine), **then** `--version` exits 0 — closing the spike's DEC-3 deferral. | F-2, NFR-RUN-2, DEC-5 |
| AC-SIZE-1 | **Given** the produced binaries, **when** their sizes are measured, **then** the actual size per target is recorded to `.benchmarks/binaries.json` (≤90 MB desired; if larger, flagged-not-blocking per DEC-4). | F-3, NFR-SIZE-1 |
| AC-START-1 | **Given** the linux-x64 binary on the clean OS, **when** its cold-start is measured (`--version`), **then** the actual time is recorded (≤2 s desired; if longer, flagged-not-blocking per DEC-4). | F-3, NFR-START-1 |
| AC-COMP-1 | **Given** the release matrix, **when** a tag is cut, **then** Linux (amd64 + arm64) and Windows (amd64) binaries ship and **macOS is not** produced (deferred to MS-0003). | F-1, F-5, NFR-COMP-1, DEC-8 |
| AC-SIGN-1 | **Given** the Windows signing story, **when** documented, **then** it references the validated `osslsigncode` recipe and identifies the cert/Authenticode plug-in point (env-var **name** only; no real cert, no execution). | F-4, DEC-7 |
| AC-REL-1 | **Given** a tag push, **when** the release workflow runs, **then** it attaches the binary set + one `SHA256SUMS` (hash per binary) + one SBOM (`syft`/CycloneDX) to the GitHub Release. | F-5, F-6, NFR-SBOM-1, NFR-CHK-1 |
| AC-CI-1 | **Given** the implementation is complete, **when** `bun run check` is executed, **then** it is green (lint + format + typecheck + test + boundaries — no `src/` domain regression introduced). | story test matrix |
| AC-SEC-1 | **Given** all committed artifacts (script, workflows, `.benchmarks/`, signing reference), **when** scanned, **then** **0** secrets are present (the signing reference uses `$CERT_PASSWORD` as an env-var **name**, never a literal). | NFR-SEC-1, INV-SEC-1 |

### 17.1 Definition of Done

- All 10 ACs satisfied (AC-BUILD-1 … AC-SEC-1), each traceable to ≥1 F-/NFR- ID.
- linux-x64 + win-x64 build and **run on a clean OS** (linux Docker + windows runner); linux-arm64 included per R1 (or recorded as MS-0003).
- Size + cold-start recorded to `.benchmarks/binaries.json`; CI delta-reporting wired (non-blocking).
- Signing story documented (reference + cert plug-in point); no execution, no secret.
- `release.yml` produces binaries + `SHA256SUMS` + SBOM on tag.
- `bun run check` green; **no `src/` domain-logic change**.
- macOS deferred (MS-0003); the story's AC list is the DoD.

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This change is additive release engineering (no runtime/contract migration):

1. Merge the feature branch into `main`.
2. CI validates the new clean-OS smoke job (linux Docker + windows runner), the build-script refinement, and `bun run check` (no `src/` regression).
3. The release capability activates on the **first tag**: a maintainer pushes `vX.Y.Z` → `release.yml` builds the matrix and attaches binaries + `SHA256SUMS` + SBOM to the GitHub Release.
4. The version bump is **minor** (a new release-pipeline capability); the exact number (e.g. 0.7.0 → 0.8.0) is a release-time decision, not a spec mandate.
5. `.benchmarks/binaries.json` is committed on first measurement and updated thereafter as a tracked regression baseline.
6. Existing configs, locks, credentials, and CI jobs are unchanged; no user migration.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no production data, schema, or migration. `.benchmarks/binaries.json` (DM-1) is a new release-engineering artifact seeded on first build; `dist/` is a gitignored build output.

## 20. PRIVACY / COMPLIANCE REVIEW

**Privacy impact: NONE.** This change runs build/CI/release tooling and produces binaries; it processes no user/Confluence data and sends no outbound telemetry (NFR-SEC-3). The clean-OS smoke runs `--version` (+ a mock/sandbox `doctor --json`) against no real target. The signing reference names an env-var (`$CERT_PASSWORD`) without a value.

**Compliance: MIT License** — no licensing or attribution change. The SBOM (NFR-SEC-4) *improves* supply-chain compliance posture by making the dependency/license composition of each release auditable.

## 21. SECURITY REVIEW HIGHLIGHTS

**Security impact: LOW** (and net-positive for supply-chain posture):

- **No secret material**: signing is reference-only (NG-3); the `osslsigncode` recipe uses `$CERT_PASSWORD` as an env-var **name** and placeholder cert paths — never a literal. AC-SEC-1 enforces 0 secrets in committed artifacts (RSK-8).
- **Supply-chain improvement**: the per-release SBOM (NFR-SEC-4) + SHA256 checksums give consumers an auditable, tamper-evident artifact bundle.
- **No new attack surface**: the change adds no application input parsing, no new endpoints, and no credential handling beyond an env-var **name** reference.
- **Version-pin integrity** (DEC-1): pinning the release to the project Bun (1.2.23) prevents a stale/spike-pin from producing mismatched binaries (RSK-1).

## 22. MAINTENANCE & OPERATIONS IMPACT

**Low-to-moderate maintenance impact** (release machinery, not domain code):

- The release matrix + signing plug-in point are the durable footprints MS-0003 (macOS, real signing) extends.
- `.benchmarks/binaries.json` is a living regression baseline; the CI delta-reporter surfaces bloat without gating (DEC-6).
- **Operational note**: cutting a release = push a tag; `release.yml` does the rest. A future release runbook (tag → workflow → artifacts) is a phase-7 doc-sync candidate (pm-notes).
- The build script's arm64 branch (R1) may need a one-time adjustment if a future Bun drops/renames the target — recorded, not blocking.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `bun build --compile` | Bun's mechanism that cross-compiles a TS entry to a per-platform single binary embedding the runtime (ADR-0001 C-2). |
| Clean-OS run | Executing the binary inside a minimal container/runner with no Node/Bun/Deno installed (NFR-COMP-2). |
| `debian:stable-slim` | The canonical current Debian slim Docker tag; `debian:slim` is not published (DEC-2). |
| Cold-start | Fresh-process wall-clock of `--version` on the clean OS. |
| SBOM | Software Bill of Materials — the dependency/license composition of a release (NFR-SEC-4); here via `syft`/CycloneDX. |
| `SHA256SUMS` | A checksum file (one SHA-256 hash per binary, portable basenames) attached to a release. |
| `osslsigncode` | Open-source tool that applies Windows Authenticode code-signing to a PE/EXE (reference-only here). |
| "Desired, not hard" | NFR-PERF-1/2 budget wording: a target to record against, not a release-blocking gate (PR #4 / DEC-4). |
| DEC-3 deferral | The spike's deferral of the clean-OS Windows *run* (wine absent); closed here by a real Windows runner (DEC-5). |

## 24. APPENDICES

### Appendix A — Carry-forward evidence (GH-13 spike, consumed not re-derived)

| Item | Value | Source |
|---|---|---|
| Cross-compile (linux-x64 + win-x64) | exit 0; ELF 64-bit x86-64 + PE32+ x86-64 | findings §3-H1 |
| Clean-OS linux run (`debian:stable-slim`) | no bun/node/deno; `--version` exit 0 | findings §3-H2 |
| linux-x64 size | 96.90 MB (101,604,521 B) — FLAG, not blocking | findings §3-H3 |
| win-x64 size | 105.12 MB (110,224,195 B) — FLAG, not blocking | findings §3-H3 |
| linux-x64 cold-start | median 0.010 s (n=5); max RSS ~34.7 MB | findings §3-H4 |
| arm64 targets | `bun-linux-arm64`, `bun-darwin-arm64` valid (TC-BCS-008) | findings §8 |
| Signing recipe | `osslsigncode` sign/verify/extract-signature + cert plug-in | `spikes/bun-compile-smoke/probes/signing-dry-run.md` |

### Appendix B — Hazard reconciliations (encode in delivery)

| Hazard | Reconciliation | Decision |
|---|---|---|
| Release Bun pin drift (spike 1.1.34 vs project 1.2.23) | Pin release to **1.2.23** (match `package.json#engines.bun` + `ci.yml`) | DEC-1 |
| `debian:slim` is not a published Docker tag | Use `debian:stable-slim` (spike-verified clean-OS) | DEC-2 |
| alpine/musl dynamic-link failure (glibc binary) | Out of scope; `debian:stable-slim` (glibc) satisfies NFR-COMP-2 | spike RSK-4 |

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | spec-writer (GH-32) | Initial specification seeded from the authoritative story MS2-E5-S4, epic MS2-E5, ADR-0001, `doc/spec/nonfunctional.md` (NFR-PERF-1/2, NFR-COMP-1/2, NFR-SEC-4), the GH-13 spike findings + signing recipe, the existing `scripts/build-binaries.sh` skeleton, `ci.yml`, and `package.json`. Encoded the Bun-version-pin hazard (DEC-1), the `debian:stable-slim` reconciliation (DEC-2), and CEO-resolved R1 (arm64) / R2 (size). No `src/` domain-logic change; build/CI/release engineering only. |

---

## AUTHORING GUIDELINES

This spec was authored using:

- **Story file (authoritative scope)**: `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md` — its Goal, 6-item Detailed scope, AC checklist, Out-of-scope, and CEO-resolved R1/R2 are the seed. AC1–AC9 are preserved verbatim in intent (mapped to AC-BUILD/RUN/SIZE/START/COMP/SIGN/REL/CI/SEC).
- **Epic**: `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5--epic.md` (S4 = binary builds, gated by E1-S3).
- **Enabling evidence (consumed, not re-derived)**: `findings/bun-compile-smoke-findings.md` (H1–H5 PASS + E5-S4 baseline); `spikes/bun-compile-smoke/probes/signing-dry-run.md` (validated `osslsigncode` recipe).
- **Precedent (spike spec)**: `doc/changes/2026-07/2026-07-06--GH-13--bun-cross-compile-smoke/chg-GH-13-spec.md` — this story is its production follow-up.
- **Precedent (feature spec structure)**: `doc/changes/2026-07/2026-07-15--GH-30--doctor-health-check/chg-GH-30-spec.md` — same 25-section structure, DEC/OQ/RSK conventions.
- **Existing assets**: `scripts/build-binaries.sh` (GH-13 skeleton, entry placeholder + signing TODO); `.github/workflows/ci.yml` (Bun pin 1.2.23, matrix conventions); `package.json` (engines.bun 1.2.23, version 0.7.0); `src/cli/index.ts` (real CLI entry, GH-14).
- **Decisions referenced by ID**: ADR-0001 (C-2/C-3, signing Unresolved Question, revisit-trigger not activated); CEO R1 (arm64) / R2 (size); PR #4; spike DEC-5 ("desired, not hard").
- **NFRs referenced by canonical ID**: NFR-PERF-1 (≤90 MB desired), NFR-PERF-2 (≤2 s cold-start desired), NFR-COMP-1 (MS-0002 = Linux+Windows), NFR-COMP-2 (clean-OS, no runtime), NFR-SEC-4 (SBOM on release) — from `doc/spec/nonfunctional.md`. The §9 table uses change-local measurable IDs (NFR-CC/RUN/SIZE/START/SBOM/CHK/SEC/MAINT) per the authoring rules, each traced to its canonical NFR.
- **Coding-rules consistency**: `.ai/rules/typescript.md` (no `src/` domain change — build/CI/release engineering) and `.ai/rules/testing-strategy.md` (E2E release tier only; benchmark-gate philosophy for the non-blocking delta-reporter) consulted for framing only — no implementation detail is encoded.
- **PM hazards encoded as DEC** (per pm-notes): the Bun-version-pin hazard (DEC-1) and the `debian:stable-slim` tag reconciliation (DEC-2); both flagged critical at intake.
- **No ADR/story/spec mutation**: per the PM, any ADR-0001 release-pipeline pointer / signing-evidence update / NFR evidence pointer occurs in lifecycle phase 7 (doc-sync); this spec only produces the enabling release pipeline (NG-9).

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-32)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-6, AC-BUILD/RUN1/RUN2/SIZE/START/COMP/SIGN/REL/CI/SEC, NFR-CC/RUN/SIZE/START/SBOM/CHK/SEC/MAINT, RSK-1..RSK-8, DEC-1..DEC-8, DM-1..DM-3, OQ-1)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then (AC-BUILD-1 … AC-SEC-1)
- [x] NFRs include measurable values (3 targets, exit 0, ≤90 MB / ≤2 s desired, 0 secrets, 1 SBOM/checksums)
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths beyond the named build script/workflow artifacts, no step-by-step tasks)
- [x] No content duplicated from linked docs (cited by path/ID only)
- [x] Front matter validates per front_matter_rules
