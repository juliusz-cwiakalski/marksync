---
id: MS2-E5-S4
title: "binary-builds"
status: done
type: story
priority: medium
epic: MS2-E5
milestone: MS-0002
estimate: 2d
gh_issue: GH-32
feature_spec: ""
decisions: [ADR-0001]
dependencies: { blocks: [], blocked_by: [MS2-E1-S3, MS2-E2-S1] }
cross_cutting: [A-FEA-2, A-FEA-10, NFR-PERF-1, NFR-PERF-2, NFR-COMP-1]
delivered_by: GH-32
---

# MS2-E5-S4 — Cross-platform binary builds

> **Delivered (GH-32).** The validated GH-13 spike mechanism is wired into a
> real release pipeline: `scripts/build-binaries.sh` builds the real CLI
> (`src/cli/index.ts`) to linux-x64 + linux-arm64 + win-x64 with the version
> single-sourced from `package.json`; `ci.yml` runs a clean-OS smoke
> (`debian:stable-slim` + `windows-latest`); `release.yml` attaches binaries +
> `SHA256SUMS` + a `syft` CycloneDX SBOM on a `v*` tag; signing is documented
> (`doc/guides/binary-release-signing.md`). macOS and real signing are deferred
> to MS-0003. Sizes ~97–105 MB exceed the 90 MB desired budget (flagged, not
> blocking); cold-start ~0.010 s median.

## Goal
Produce single-binary builds for **Linux + Windows** (amd64; arm64 where supported) via `bun build --compile`, with a clean-OS smoke test, size/cold-start measurement, and a documented signing story. **macOS deferred to MS-0003** (NFR-COMP-1). This turns the spike E1-S3 mechanism into a real release pipeline.

## Background
ADR-0001 distribution promise. NFR-COMP-2 (clean-OS, no runtime). Spike E1-S3 validated the compile mechanism + measured a smoke binary. This story builds the REAL CLI binary, wires a release workflow, and records the signing approach. NFR-PERF-1 (≤90MB) / NFR-PERF-2 (≤2s) are **desired, not hard** (PR #4) — record actuals.

## Detailed scope (deliverables)
1. **`scripts/build-binaries.sh`** — refines the E1-S3 skeleton: compiles `src/cli/index.ts` (the real entrypoint from E2-S1/E2-S3) to `dist/marksync-linux-x64`, `dist/marksync-linux-arm64` (if supported), `dist/marksync-win-x64.exe`. Embeds the version from `package.json`.
2. **Clean-OS smoke** — a CI job (Docker, `debian:slim`) runs `./dist/marksync-linux-x64 --version` and `doctor --json` (against a mock or the sandbox) → exits 0. Windows smoke via a `windows-latest` GitHub runner (no Wine needed — use a real Windows runner in CI).
3. **Size + cold-start measurement** — record `ls -la` size + `time ./marksync --version` cold-start; persist to `.benchmarks/binaries.json` (commit-tracked); CI reports deltas, not hard fail.
4. **Signing spike (documented)** — the `osslsigncode` command for Windows Authenticode (from E1-S3); document where a real cert plugs in. macOS notarization OUT of scope.
5. **Release workflow** — `.github/workflows/release.yml` triggered on tag: builds the matrix, attaches binaries + checksums (+ SBOM via `syft` per R-SEC-1/NFR-SEC-4) to a GitHub Release.
6. **SBOM** — `syft`/`cyclonedx` output per release (supply-chain baseline, NFR-SEC-4).

## Technical approach
- `bun build --compile --target=...` per OS/arch; the `--outfile` carries the target suffix.
- CI matrix: `ubuntu-latest` (linux-x64, linux-arm64 cross), `windows-latest` (win-x64 native).
- Smoke test imports nothing heavy; `--version` + a mocked `doctor` is enough.
- Checksums: `sha256sum` per binary; commit a `SHA256SUMS` file to the release.

## Interface contracts (what other stories consume)
- Release artifacts (binaries + SBOM + checksums) are the MS-0002 distribution.
- `.benchmarks/binaries.json` feeds regression tracking.

## Acceptance criteria (testable)
- [x] **NFR-COMP-2:** linux-x64 binary runs on a clean `debian:stable-slim` (no Bun/Node installed) → `--version` exits 0. _(delivered — GH-32; clean-OS image is `debian:stable-slim`, the published tag — `debian:slim` is not published.)_
- [x] win-x64.exe runs on a clean Windows runner → `--version` exits 0. _(delivered — GH-32; closes the spike's DEC-3 Windows-run deferral.)_
- [x] **NFR-PERF-1:** size recorded (≤90 MB desired; actual documented; CEO-waived as hard gate per PR #4). _(delivered — GH-32; linux ~96.90 MB / win ~105.12 MB in `.benchmarks/binaries.json`; flagged, not blocking.)_
- [x] **NFR-PERF-2:** cold-start recorded (≤2 s desired; actual documented). _(delivered — GH-32; ~0.010 s median on clean OS.)_
- [x] **NFR-COMP-1:** Linux + Windows shipped; macOS NOT in MS-0002 (deferred). _(delivered — GH-32; release matrix = linux-x64 + linux-arm64 + win-x64; macOS absent.)_
- [x] Signing story documented (`osslsigncode` command). _(delivered — GH-32; `doc/guides/binary-release-signing.md` references the validated recipe + cert plug-in point.)_
- [x] Release workflow produces binaries + SHA256SUMS + SBOM on tag. _(delivered — GH-32; `release.yml` structurally validated at delivery; full e2e on first `v*` tag.)_
- [x] `bun run check` green. _(delivered — GH-32; no src/ domain-logic regression.)_

## Test matrix
| Tier | This story |
|---|---|
| E2E (release) | clean-OS smoke (linux Docker + windows runner); release artifact assembly |

## Definition of Done
Linux + Windows binaries build + run on clean OS; size/cold-start recorded; signing documented; release workflow + SBOM on tag; macOS deferred. AC list is the DoD.

## Out of scope
- macOS target (MS-0003).
- Real code-signing with a production cert (dry-run/documented command only).
- Auto-update mechanism.
- Package-manager distribution (MS-0009).

## Risks / open questions (CEO-resolved)
- **R1:** arm64-linux target availability. → Build it if the installed Bun supports the target; otherwise ship x64 only for MS-0002 and record arm64 as MS-0003. CEO-recorded.
- **R2:** Binary > 90 MB. → Accepted (PR #4); record actual; do NOT block. CEO waives NFR-PERF-1 as a hard gate. Confirmed.
