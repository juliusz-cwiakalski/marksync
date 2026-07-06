---
id: MS2-E1-S3
title: "bun-cross-compile-smoke"
status: todo
type: spike
priority: high
epic: MS2-E1
milestone: MS-0002
estimate: 0.5d
gh_issue: GH-13
feature_spec: ""
decisions: [ADR-0001]
dependencies: { blocks: [MS2-E5-S4], blocked_by: [] }
cross_cutting: [A-FEA-2, A-FEA-10]
---

# MS2-E1-S3 — Bun single-binary cross-compile smoke

## Goal
Verify `bun build --compile` produces a **working** single-binary for clean Linux + Windows within the MS-0002 budget (≤90 MB, ≤2 s cold-start), and document the signing story, so MS2-E5-S4 (cross-platform binary builds) can proceed without surprises.

## Background & why this gates other work
ADR-0001's distribution promise is a no-runtime single binary per OS/arch. NFR-PERF-1 (≤90 MB) and NFR-PERF-2 (≤2 s cold-start) are **desired, not hard** (PR #4 direction) — but the cross-compile mechanism itself (does it produce a runnable binary on a clean OS?) is unvalidated (UNCERT-2). This spike de-risks E5-S4. **macOS is deferred to MS-0003 (NFR-COMP-1).**

## Hypotheses (H) & stop criteria
- **H1 (cross-compile):** `bun build --compile --target=bun-linux-x64` and `--target=bun-windows-x64` both succeed from a Linux dev host.
- **H2 (clean-OS run):** the linux-x64 binary runs on a minimal Docker image (e.g. `debian:slim` / `alpine`) with **no** Bun/Node installed → `./marksync --version` exits 0 and prints a version string.
- **H3 (size):** binary ≤ 90 MB (desired). Record the actual size; flag if > 90 MB but still acceptable.
- **H4 (cold-start):** `time ./marksync --version` ≤ 2 s (desired) on the clean OS. Record actual.
- **H5 (signing story):** document the Windows Authenticode path (`osslsigncode`) and confirm it's feasible (a dry-run command, not a real cert). macOS notarization is out of scope (deferred).

## Methodology (exact steps)
1. Create `spikes/bun-compile-smoke/` with a **minimal** `src/cli.ts` that prints `marksync 0.0.0` (uses Cliffy's `Command` if available, else plain `console.log`). This is a smoke binary, not the real CLI.
2. `bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64`.
3. `bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe`.
4. **Linux clean-OS smoke:** `docker run --rm -v "$PWD":/x -w /x debian:slim ./marksync-linux-x64 --version`. Confirm exit 0 + output.
5. **Windows smoke:** either cross-run via `wine` (best-effort) OR document that the win-x64 binary was produced and defer the run to a Windows CI runner (record which). Prefer wine for the smoke if available.
6. Measure: `ls -la` for size; `/usr/bin/time -v` for cold-start (capture `Maximum resident set size` too — informational).
7. **Signing dry-run:** record the exact `osslsigncode` command that WOULD sign the Windows binary (no real cert needed). Note where a real cert/Authenticode would plug in.
8. Record results in findings doc.

## Deliverables
- `spikes/bun-compile-smoke/` (minimal CLI + build script).
- `findings/bun-compile-smoke-findings.md`: H1–H5 PASS/FAIL + measured sizes/timings + the signing command.
- A reusable `scripts/build-binaries.sh` skeleton (consumed/refined by E5-S4).

## Acceptance criteria (testable)
- [ ] H1: both linux-x64 and win-x64 compiles succeed.
- [ ] H2: linux-x64 binary runs on a clean Debian/Alpine container, exits 0.
- [ ] H3: size recorded (≤90 MB desired; if larger, documented + flagged).
- [ ] H4: cold-start recorded (≤2 s desired; if longer, documented).
- [ ] H5: signing story documented with a concrete `osslsigncode` command.
- [ ] Findings doc written with explicit PASS/FAIL + measurements.

## Out of scope
- macOS target (MS-0003).
- arm64 targets (stretch; record whether `--target=bun-linux-arm64` works but don't block on it — primary targets are x64).
- The real CLI feature set (this is a smoke binary).
- Real code-signing with a production cert (dry-run command only).

## Risks / open questions (CEO-resolved)
- **R1:** Bun cross-compile target naming/availability changes across Bun versions. → Pin the Bun version that works; record it. If win-x64 target is unavailable in the installed Bun, document and fall back to a Windows CI runner build. CEO-recorded.
- **R2:** Binary > 90 MB. → Accepted per PR #4 ("larger acceptable if the job gets done"). Record actual; do NOT block MS-0002. CEO waives NFR-PERF-1 as hard gate.
