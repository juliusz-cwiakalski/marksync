---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: RELEASE-RUNBOOK
status: Current
created: 2026-07-26
last_updated: 2026-07-26
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001]
  related_changes: [GH-32]
  summary: "Release runbook — how to cut a MarkSync binary release (version bump, tag, release.yml artifacts, verification)."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Release Runbook

_How to cut a MarkSync binary release. Target audience: the maintainer. Covers
the version bump, the tag-triggered release workflow, the produced artifacts,
and how to verify a release._

## Overview

MarkSync ships as self-contained single binaries (one per OS/arch) produced by
`bun build --compile` (ADR-0001 C-2/C-3). The release is **tag-triggered**:
pushing a `v*` Git tag runs [`.github/workflows/release.yml`](../../.github/workflows/release.yml),
which builds the target matrix, generates checksums + an SBOM, and attaches
everything to a GitHub Release. There is no manual artifact upload.

## Targets (MS-0002)

| Artifact | Target | Notes |
|---|---|---|
| `marksync-linux-x64` | `bun-linux-x64` | amd64 Linux; glibc-linked |
| `marksync-linux-arm64` | `bun-linux-arm64` | arm64 Linux; **stretch** — included when the pinned Bun supports the target, otherwise recorded as MS-0003 (non-blocking) |
| `marksync-win-x64.exe` | `bun-windows-x64` | amd64 Windows |

**macOS is not produced** (deferred to MS-0003 per NFR-COMP-1). Windows
Authenticode signing is documented but not executed in MS-0002 — see
[binary release signing](./binary-release-signing.md).

## Prerequisites

- A clean `main` with the version you intend to release.
- Bun **1.2.23** on PATH (the release/smoke pin — matches
  `package.json#engines.bun` + `ci.yml`; ADR-0001 / GH-32 DEC-1). The
  spike's one-time `1.1.34` validation pin is **not** the release pin.
- The build script [`scripts/build-binaries.sh`](../../scripts/build-binaries.sh)
  runs locally (`bash scripts/build-binaries.sh --target all`) and each
  produced binary's `--version` equals `package.json#version` (single-sourced
  via the `package.json` import in `src/cli/commands/router.ts`).

## Cutting a release

1. **Bump the version** in `package.json` (`version`). This is the single
   source of truth — the compiled binary's `--version` derives from it; there
   is no second constant to update. Use a
   [Conventional Commits](https://www.conventionalcommits.org/) `chore(release):`
   commit (e.g. `chore(release): bump to 0.9.0`).
2. **Merge** the version-bump commit to `main`.
3. **Tag** the release: `git tag v0.9.0 && git push origin v0.9.0`. The tag
   **must** match the `v*` pattern that triggers `release.yml`.
4. **`release.yml` runs** on the tag: it builds the matrix
   (`scripts/build-binaries.sh --target all`), verifies the Bun pin
   (`1.2.23`) and that `--version` matches `package.json`, generates the
   `SHA256SUMS` accumulator, generates a `syft` CycloneDX SBOM, creates the
   GitHub Release, and asserts the critical assets are present.

## Artifacts per release

Each tagged release carries:

- **Binaries** — `marksync-linux-x64`, `marksync-linux-arm64` (when built),
  `marksync-win-x64.exe`.
- **`SHA256SUMS`** — one SHA-256 hash per produced binary (portable
  basenames); verify with `sha256sum -c SHA256SUMS`.
- **`marksync-sbom.cyclonedx.json`** — the `syft` CycloneDX SBOM
  (NFR-SEC-4 supply-chain baseline).

## Verifying a release

```bash
# Download the artifacts for your platform, then:
sha256sum -c SHA256SUMS            # checksums
./marksync-linux-x64 --version     # prints the release version
```

The release notes record the Bun pin, the build matrix, the macOS/real-signing
deferrals, and a pointer to the signing guide.

## Size / cold-start (desired, not hard)

Binary size (~97–105 MB) and cold-start (~0.010 s median on a clean OS) are
recorded in [`.benchmarks/binaries.json`](../../.benchmarks/binaries.json) and
reported as CI deltas (non-blocking). NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s)
are **desired, not hard** — sizes currently exceed the 90 MB desired budget and
are flagged, not blocking (DEC-4 / PR #4). Re-baseline
`.benchmarks/binaries.json` manually when a significant size shift is observed.

## Validation boundary

The clean-OS smoke (`ci.yml` `binary-smoke` job) runs on **every push/PR** —
linux-x64 on `debian:stable-slim` (no Bun/Node/Deno on `PATH`) and win-x64.exe
on a real `windows-latest` runner (no Wine). The release workflow itself
triggers on a `v*` tag (a post-merge maintainer action), so it is **structurally
validated** in CI (YAML-lint + matrix + asset-presence assertion) and runs
end-to-end on the first real tag.

## See also

- [Binary release signing](./binary-release-signing.md) — Windows Authenticode plug-in point (MS-0003+ for real signing).
- [Developer environment](./dev-environment.md) — local build script + toolchain.
- [Security baseline](./security-baseline.md) — SBOM + dependency audit (NFR-SEC-4).
- [ADR-0001](../decisions/ADR-0001-implementation-language-and-runtime.md) — single-binary / cross-platform distribution decision.
- [Nonfunctional spec](../spec/nonfunctional.md) — NFR-PERF-1/2, NFR-COMP-1/2, NFR-SEC-4.
