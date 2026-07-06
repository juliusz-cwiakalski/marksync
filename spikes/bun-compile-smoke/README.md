# bun-compile-smoke spike (GH-13 / MS2-E1-S3)

> Standalone workspace for the `[MS2-E1-S3] Bun single-binary cross-compile smoke`
> spike. This is the empirical validation of **ADR-0001's distribution promise**
> for the MS-0002 Linux+Windows slice. All code here is a throwaway experiment;
> it is **not** production code and is **not** coupled to the main `src/` tree.

## Purpose

This spike empirically validates **ADR-0001's distribution promise** — **C-2**
(a single self-contained binary per OS+arch with **no mandatory language
runtime**) and **C-3** (cross-platform compilation) — for the MS-0002
Linux+Windows slice. It cross-compiles a minimal smoke CLI (that prints
`marksync 0.0.0`) to `bun-linux-x64` and `bun-windows-x64` from a Linux dev host,
runs the linux-x64 binary inside a clean-OS Docker image (`debian:stable-slim`
primary; `alpine` stretch) with **no** Bun/Node installed, measures binary size
+ cold-start against the "desired, not hard" MS-0002 budget (≤90 MB / ≤2 s;
DEC-5), and documents the Windows Authenticode signing path (`osslsigncode`) as a
dry-run command.

**Verdict: PASS (H1–H5 all PASS).** The outcome unblocks **MS2-E5-S4**
(cross-platform binary builds) with the committed `scripts/build-binaries.sh`
skeleton as the starting point. The authoritative record is the findings document:
[`../../findings/bun-compile-smoke-findings.md`](../../findings/bun-compile-smoke-findings.md).

## Prerequisites

- **Bun `1.1.34`** (pinned — DEC-2; matches the GH-11 pin). Required for every
  `bun build --compile` invocation and `bun run` script.
- **Docker `27.3.1`** with the daemon reachable. Required for the H2 clean-OS
  Linux smoke (`debian:stable-slim` primary + `alpine` stretch) and the H4
  cold-start measurement (run inside the clean-OS container).
- **`wine` is NOT installed** (DEC-3) — the win-x64 binary is **produced** and
  verified as a PE32+ executable via `file(1)`, but the clean-OS Windows *run* is
  deferred to a **Windows CI runner** in MS2-E5-S4.
- **`osslsigncode` is NOT installed** (DEC-4) — H5 (signing) is satisfied by
  documentation only; see [`probes/signing-dry-run.md`](probes/signing-dry-run.md).
- `file(1)`, `stat(1)`, `sha256sum`, and `/usr/bin/time` (the latter is installed
  ephemerally inside the clean-OS container by the cold-start probe).

## How to run

All commands run from this directory (`spikes/bun-compile-smoke/`). These are
**empirical probes** run via the **Bun runtime** (`bun run`) and **Docker**
(`docker run`) — they are **NOT** `bun test` and are **NOT** wired into the
project test runner or CI.

The exact script names below match [`package.json`](package.json):

```bash
bun run cli              # run the smoke CLI -> prints: marksync 0.0.0
bun run build:linux      # cross-compile -> marksync-linux-x64   (gitignored, ~96.90 MB)
bun run build:windows    # cross-compile -> marksync-win-x64.exe (gitignored, ~105.12 MB)
bun run probe:all        # == bash run-probes.sh : the FULL pipeline (TC-BCS-001..008)

# individual probes (also reachable through probe:all):
bun run probe:clean-os-debian   # TC-BCS-003 — clean-OS debian:stable-slim run (H2 primary)
bun run probe:clean-os-alpine   # TC-BCS-004 — clean-OS alpine stretch (musl note, non-blocking)
bun run probe:size              # TC-BCS-005 — binary size measurement (H3)
bun run probe:cold-start        # TC-BCS-006 — cold-start on clean OS (H4)
bun run probe:arm64             # TC-BCS-008 — arm64 target availability (informational, NG-2)

# secret hygiene (AC7) — also runnable directly:
bash scripts/secret-scan.sh     # == bun run probe:secrets : asserts 0 secrets, exit 0
```

`probe:all` maps to `bash run-probes.sh` — the orchestrator that runs
TC-BCS-001 (linux-x64 compile) → TC-BCS-002 (win-x64 compile) → TC-BCS-003
(debian clean-OS) → TC-BCS-004 (alpine stretch) → TC-BCS-005 (size) →
TC-BCS-006 (cold-start) → TC-BCS-008 (arm64 stretch) in sequence, capturing each
probe's stdout/stderr/exit to [`evidence/`](evidence/) and stamping a run log at
`evidence/run-<UTC-timestamp>.txt`.

> **First-run note:** the arm64 stretch probe (TC-BCS-008) downloads the aarch64
> toolchains (~4 MB each) on first run. The clean-OS probes pull
> `debian:stable-slim` / `alpine:latest` on first run.

## Expected outputs

Each probe exits **0** and prints a short, machine- and human-readable record.
Canonical evidence is captured under [`evidence/`](evidence/) as
`evidence/TC-BCS-NNN.txt`:

| Probe | Expected output | Evidence |
|-------|-----------------|----------|
| `build:linux` (TC-BCS-001) | exit 0; `file(1)` → **ELF 64-bit LSB executable, x86-64**, dynamically linked; `./marksync-linux-x64 --version` → `marksync 0.0.0` | `evidence/TC-BCS-001.txt` |
| `build:windows` (TC-BCS-002) | exit 0; `file(1)` → **PE32+ executable for MS Windows (console), x86-64** | `evidence/TC-BCS-002.txt` |
| `probe:clean-os-debian` (TC-BCS-003) | clean image has no `bun`/`node` (`command -v` → exit 127); `./marksync-linux-x64 --version` → `marksync 0.0.0`, exit 0 | `evidence/TC-BCS-003.txt` |
| `probe:clean-os-alpine` (TC-BCS-004) | **non-blocking** musl/glibc failure: `exec ./marksync-linux-x64: no such file or directory` (glibc loader absent under musl — RSK-4) | `evidence/TC-BCS-004.txt` |
| `probe:size` (TC-BCS-005) | linux **96.90 MB** (101,604,521 B), win **105.12 MB** (110,224,195 B) — both FLAGGED over the ≤90 MB desired (DEC-5: recorded, NOT blocking) | `evidence/TC-BCS-005.txt` |
| `probe:cold-start` (TC-BCS-006) | median **0.010 s** (n=5, fresh processes on clean OS), max RSS ~34.7 MB — ~200× inside the ≤2 s desired | `evidence/TC-BCS-006.txt` |
| `probe:arm64` (TC-BCS-008) | `bun-linux-arm64` + `bun-darwin-arm64` both **ACCEPTED** (exit 0) in 1.1.34 (informational, non-gated) | `evidence/TC-BCS-008.txt` |
| signing (H5) | documentation only — `osslsigncode sign/verify/extract-signature` recipe at `probes/signing-dry-run.md` | `probes/signing-dry-run.md` |
| `scripts/secret-scan.sh` (AC7) | exit 0 — **0 secrets** in committed artifacts | (verdict recorded in findings §11) |

The full run summary (Bun version, host, per-probe exit codes) is stamped to
`evidence/run-<UTC-timestamp>.txt` by `run-probes.sh`.

## How to interpret the findings

Read the authoritative findings document:
[`../../findings/bun-compile-smoke-findings.md`](../../findings/bun-compile-smoke-findings.md).

- **Per-hypothesis verdict table (§2)** — explicit PASS/FAIL for each of **H1**
  (cross-compile), **H2** (clean-OS run), **H3** (size), **H4** (cold-start),
  **H5** (signing), each with a one-line evidence pointer. **H1–H5 all PASS.**
- **Measurements table (§4)** — the consolidated E5-S4 baseline (sizes, file
  types, cold-start, RSS) vs the "desired, not hard" budgets.
- **MS-0002 / MS2-E5-S4 recommendation (§10)** — the single clear next step.

**Outcome routing (spec §18 / Appendix B):**

- **PASS** (the active path) → unblock **MS2-E5-S4** with the committed
  `scripts/build-binaries.sh` skeleton; carry-forward is only the clean-OS
  Windows *run* (→ Windows CI runner, DEC-3) and a real signing cert (H5 dry-run).
- **Partial** (size/cold-start exceedance, or win-x64 target unavailable) → NOT
  the active path here: sizes are flagged-but-accepted (DEC-5), and the win-x64
  target compiled cleanly. The documented fallback (Windows CI runner for the
  Windows runtime smoke; recorded-and-flagged size/cold-start) applies only if a
  gate is missed in a future re-run.
- **Catastrophic** (no runnable single-binary path at all) → escalate to
  **ADR-0001 language-level reconsideration** (do **not** silently proceed). This
  was **not** triggered — both targets cross-compile and the linux-x64 binary
  runs on a clean OS.

## What is NOT here

- **ADR / spec / story updates are handled by `@doc-syncer`** in lifecycle phase
  7 (`system_spec_update`), **not** by this spike. This coder produced only the
  findings doc + evidence; no file under `doc/decisions/**`, `doc/spec/**`, or
  `doc/planning/**` was mutated (spec NG-6). See findings §12 for the
  reconciliation surface (ADR-0001, the MS2-E1-S3 / MS2-E5-S4 stories,
  `nonfunctional.md`).
- **This spike is NOT wired into CI.** No edits to `.github/workflows/**`; the
  probes are not added to the fast loop or any workflow. CI matrix wiring is an
  E5-S4 task.
- **No real code-signing** — H5 is a dry-run command (DEC-4); a real
  Authenticode cert + CI secret wiring lands in E5-S4.
- **No macOS target** — out of scope for MS-0002 (deferred to MS-0003 per
  NFR-COMP-1 / NG-1; `bun-darwin-arm64` was probed only as informational stretch
  in TC-BCS-008).
- **The repo-root `src/` tree is untouched** (spec NG-5 / RSK-5; C-SPIKE-2). The
  `src/cli.ts` in *this* workspace is the smoke binary, not the real CLI.

## E5-S4 reuse notes

MS2-E5-S4 (cross-platform binary builds) consumes and refines these reusable
artifacts produced by this spike:

- **`scripts/build-binaries.sh`** (repo root) — the cross-compile **skeleton**:
  wraps the two validated compile invocations with `--target linux|windows|all`,
  `--out-dir`, `--entry`, `--help`, `sha256sum` → `SHA256SUMS`, and a
  `TODO(E5-S4)` signing marker pointing at the dry-run recipe. Validated
  end-to-end for `--target all`.
- **The validated compile invocations** — `bun build --compile --target=bun-linux-x64`
  and `--target=bun-windows-x64` (both exit 0; both targets confirmed available
  in Bun 1.1.34 — RSK-1 not triggered).
- **`probes/signing-dry-run.md`** — the copy-pasteable `osslsigncode`
  sign/verify/extract-signature recipe + cert/Authenticode plug-in point
  (`-pkcs12`/`-pass`/timestamp URL). E5-S4 wires it with a real cert via a CI
  secret.
- **The measured baseline** — linux-x64 **96.90 MB**, win-x64 **105.12 MB**
  (flagged-not-blocking, DEC-5), cold-start **0.010 s** median (~34.7 MB RSS) on
  `debian:stable-slim`. This is the size/startup budget E5-S4 plans against.
- **The carry-forward list** — (a) clean-OS Windows *run* → Windows CI runner
  (DEC-3); (b) real Authenticode cert for production signing (H5 was a dry-run);
  (c) optionally a musl (`alpine`) variant via a separate target (RSK-4).
