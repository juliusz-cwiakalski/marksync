# Findings — [MS2-E1-S3] Bun single-binary cross-compile smoke (GH-13)

> **Spike deliverable.** This document records an explicit PASS/FAIL for each of
> hypotheses H1–H5, with evidence pointers, and gives a single clear MS-0002 /
> MS2-E5-S4 recommendation. It is the *input* to a later (lifecycle phase 7)
> ADR-0001 / story-status / E5-S4 / nonfunctional.md reconciliation performed by
> `@doc-syncer`. **This coder did NOT edit any ADR, spec, or story file**
> (spec NG-6).

**Work item:** GH-13 — `[MS2-E1-S3] Bun single-binary cross-compile smoke`
**Date:** 2026-07-06
**Runtime:** Bun `1.1.34` (pinned — DEC-2; matches the GH-11 pin)
**Build host:** `Linux 7.0.0-22-generic x86_64` (Ubuntu; `uname -a` in evidence)
**Docker:** `27.3.1` (daemon reachable)
**Clean-OS images:** `debian:stable-slim` (`debian@sha256:ee12ffb55625b99d62837a72f037d9b2f18fd0c787a89c2b9a4f09666c48776c`, Debian 13 "trixie"), `alpine:latest` (`alpine@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b`)
**Reproducibility:** `cd spikes/bun-compile-smoke && bun run probe:all` (evidence → `spikes/bun-compile-smoke/evidence/`)

> **Image-tag reconciliation:** the plan/spec text wrote `debian:slim`, but
> `debian:slim` is **not** a published Docker Hub tag — the canonical current
> Debian slim tag is `debian:stable-slim` (used here). NFR-COMP-2 ("clean-OS
> image, no runtime") is satisfied identically. Recorded for reproducibility.

---

## 1. Executive summary

**Overall verdict: PASS — ADR-0001's distribution promise holds for the MS-0002
Linux+Windows slice.** `bun build --compile` cross-compiles a minimal smoke CLI
to **both** `bun-linux-x64` and `bun-windows-x64` from a Linux dev host (H1
PASS), the linux-x64 binary **runs on a clean `debian:stable-slim` image with no
Bun/Node installed** (H2 PASS — the no-runtime promise, ADR-0001 C-2, holds
empirically), the actual sizes and cold-start are recorded (H3/H4 — sizes exceed
the "desired" budget but are flagged-not-blocking per DEC-5; cold-start is far
inside budget), and the Windows Authenticode signing path is documented with a
concrete `osslsigncode` recipe (H5 PASS). **H1–H5 all PASS.**

The single nuance is **binary size**: the linux-x64 binary is **96.90 MB** and
the win-x64 binary is **105.12 MB** — both exceed the ≤90 MB **desired** budget
(NFR-PERF-1). This is **recorded + flagged, NOT blocking** (DEC-5: "desired, not
hard"; the CEO waived NFR-PERF-1 as a hard gate — story R2; PR #4 "larger
acceptable if the job gets done"). Cold-start, by contrast, is **0.010 s median**
on the clean OS — roughly **200× inside** the ≤2 s desired budget (NFR-PERF-2),
with a modest ~34 MB max RSS. The binary boots and exits essentially instantly.

Two **non-blocking deferrals** are recorded: (a) the clean-OS **Windows *run***
is deferred to a Windows CI runner in MS2-E5-S4 (DEC-3 — `wine` is absent in this
environment; the win-x64 binary is *produced* and verified as a valid PE32+
executable, so H1's win-x64 *production* is fully validated); (b) the `alpine`
(musl) clean-OS stretch run fails dynamic-link resolution (RSK-4 — the glibc
loader `/lib64/ld-linux-x86-64.so.2` is absent under musl), which is expected and
non-blocking (`debian:stable-slim` satisfies NFR-RUN-1).

**MS-0002 / MS2-E5-S4 recommendation (single sentence):** **PROCEED to
MS2-E5-S4 (cross-platform binary builds) with the committed
`scripts/build-binaries.sh` skeleton as the starting point; the cross-compile
mechanism is validated for linux-x64 + win-x64, the signing recipe is documented,
and the size exceedance is flagged-not-blocking (DEC-5) — the only carry-forward
is the clean-OS Windows runtime smoke (→ Windows CI runner, DEC-3) and a real
signing cert for production (H5 was a dry-run).** (See §10.)

> **Catastrophic-failure assessment (per spec outcome matrix / Appendix B):** NOT
> triggered. Both targets cross-compile; the linux-x64 binary runs on a clean OS.
> The ADR-0001 "no runnable single-binary path → language-level reconsideration"
> escalation is **not** reached. The size exceedance is a known-accepted
> "desired, not hard" outcome, not a viability failure.

---

## 2. Per-hypothesis verdict table

| Hypothesis | Verdict | One-line evidence |
|---|---|---|
| **H1** cross-compile (linux-x64 + win-x64) | **PASS** | `evidence/TC-BCS-001.txt` + `evidence/TC-BCS-002.txt`: both `bun build --compile --target=…` exit 0; `file(1)` → ELF 64-bit LSB executable x86-64 **and** PE32+ executable for MS Windows x86-64. |
| **H2** clean-OS run (no runtime) | **PASS** | `evidence/TC-BCS-003.txt`: `debian:stable-slim`, `command -v bun node deno` → exit 127 (none present); `./marksync-linux-x64 --version` → `marksync 0.0.0`, exit 0. (alpine stretch RSK-4 — see §7.) |
| **H3** size (≤90 MB desired) | **PASS (FLAG)** | `evidence/TC-BCS-005.txt`: linux 96.90 MB (+6.90 over desired), win 105.12 MB (+15.12 over desired). Recorded + flagged, **NOT blocking** (DEC-5). |
| **H4** cold-start (≤2 s desired) | **PASS** | `evidence/TC-BCS-006.txt`: median **0.010 s** (5 fresh-process samples on clean OS), max RSS ~34.7 MB. ~200× inside budget. |
| **H5** signing story (Authenticode) | **PASS** | `probes/signing-dry-run.md`: concrete `osslsigncode sign`/`verify`/`extract-signature` recipe + cert/Authenticode plug-in point + macOS-out-of-scope. Doc-only (DEC-4). |

**AC coverage:** AC1 → H1 (PASS); AC2 → H2 (PASS); AC3 → H3 (PASS-FLAG, non-blocking);
AC4 → H4 (PASS); AC5 → H5 (PASS); AC6 → this document; AC7 → 0 secrets (§11).

---

## 3. Per-hypothesis detail

### H1 — Cross-compile (linux-x64 + win-x64): PASS

From the Linux dev host (Bun 1.1.34), both cross-compile invocations succeed:

```
$ bun build --compile --target=bun-linux-x64   ./src/cli.ts --outfile marksync-linux-x64
[8ms] bundle 1 modules  /  [126ms] compile marksync-linux-x64      → exit 0

$ bun build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe
[5ms] bundle 1 modules  /  Decompressing… / compile marksync-win-x64.exe  → exit 0
```

`file(1)` classification:
- `marksync-linux-x64`: **ELF 64-bit LSB executable, x86-64, version 1 (SYSV),
  dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, … not stripped**
- `marksync-win-x64.exe`: **PE32+ executable for MS Windows 6.00 (console),
  x86-64, 10 sections**

Dev-host sanity run: `./marksync-linux-x64 --version` → `marksync 0.0.0`, exit 0
(the clean-OS run is H2). Evidence: `evidence/TC-BCS-001.txt`, `evidence/TC-BCS-002.txt`.

> **RSK-1 (win-x64 target availability) NOT triggered:** `bun-windows-x64` IS a
> valid target in Bun 1.1.34 (no rename, no unavailability). The Windows-CI-runner
> fallback is not needed for *production*. (The Windows *run* is still deferred —
> DEC-3, see §7.)

### H2 — Clean-OS Linux run (no runtime): PASS

Inside `debian:stable-slim` (Debian 13 "trixie", digest above):

```
$ docker run --rm debian:stable-slim sh -c 'command -v bun node deno; echo exit=$?'
exit=127            # ← no bun/node/deno on $PATH (NFR-COMP-2 satisfied)

$ docker run --rm -v "$PWD":/x -w /x debian:stable-slim ./marksync-linux-x64 --version
marksync 0.0.0      # ← exit 0
```

The binary runs purely on the embedded Bun runtime — no language runtime is
installed in the image. This is the empirical proof of ADR-0001 C-2 ("no mandatory
runtime"). Evidence: `evidence/TC-BCS-003.txt`.

### H3 — Binary size: PASS (FLAG, non-blocking)

| Target | Bytes | MB (1 MB = 1,048,576) | vs ≤90 MB desired | Status |
|---|---:|---:|---:|---|
| `marksync-linux-x64` | 101,604,521 | **96.90** | +6.90 MB | FLAG (DEC-5: recorded, NOT blocking) |
| `marksync-win-x64.exe` | 110,224,195 | **105.12** | +15.12 MB | FLAG (DEC-5: recorded, NOT blocking) |

**Convention:** 1 MB = 1,048,576 bytes (binary). Both binaries exceed the ≤90 MB
**desired** budget (NFR-PERF-1). Per DEC-5 / story R2 / PR #4 this is **recorded +
flagged, not blocking** for MS-0002. H3 is "record the actual size; flag if > 90 MB
but still acceptable" — the *measurement* is the deliverable, and the binary is
fully functional. This baseline is carried forward into E5-S4's release budget.
Evidence: `evidence/TC-BCS-005.txt`.

> **Context for E5-S4:** ~97–105 MB is the expected order of magnitude for a
> Bun-compiled single binary embedding the runtime (ADR-0001 explicitly accepted
> this negative outcome). Future size-reduction options (UPX compression, `--minify`
> + tree-shaking once the real CLI lands, splitting the runtime) can be evaluated
> in E5-S4 / MS-0003 but are **not** required to proceed.

### H4 — Cold-start: PASS

On the clean-OS Linux container (`debian:stable-slim`), 5 fresh-process samples
of `./marksync-linux-x64 --version` measured via `/usr/bin/time -v` (GNU `time`
installed ephemerally in the container — `apt-get install -y --no-install-
recommends time`):

| Repeat | Wall-clock (s) | Max RSS (KiB) | vs ≤2 s desired |
|---|---:|---:|---|
| 1 | 0.010 | 34,748 | within |
| 2 | 0.020 | 34,672 | within |
| 3 | 0.010 | 34,772 | within |
| 4 | 0.010 | 34,704 | within |
| 5 | 0.010 | 34,812 | within |
| **summary** | **min 0.010 / median 0.010 / max 0.020** | ~34.7 MB | **within (≈200× margin)** |

The cold-start is **far inside** the ≤2 s desired budget (NFR-PERF-2). Max RSS is
a modest ~34 MB. Absolute cold-start in a container is directional (page-cache
isolation is imperfect); the value is recorded as the E5-S4 baseline. Evidence:
`evidence/TC-BCS-006.txt`.

### H5 — Windows signing story: PASS

A concrete, copy-pasteable `osslsigncode` recipe is documented at
`probes/signing-dry-run.md` (verbatim sign/verify/extract-signature block). The
canonical sign command (Form A — PKCS#12):

```bash
osslsigncode sign \
  -pkcs12 /path/to/authenticode.p12 \
  -pass  "$CERT_PASSWORD" \
  -t     http://timestamp.digicert.com \
  -h     sha256 \
  -in    marksync-win-x64.exe \
  -out   marksync-win-x64-signed.exe
```

- **Cert/Authenticode plug-in point:** the `-pkcs12` (or `-certs`/`-key`) input +
  `-pass` + the `-t` timestamp URL (full table in `probes/signing-dry-run.md`).
  `$CERT_PASSWORD` is an env-var *name*, never a literal value (scans clean — §11).
- **macOS notarization is out of scope** (deferred to MS-0003 per NFR-COMP-1/NG-1).
- `osslsigncode` is **not installed** in this environment (DEC-4); H5 is
  documentation-only. The actual production signing occurs in E5-S4 with a real
  cert wired through the release pipeline (CI secret, not committed).

This closes the open ADR-0001 signing Unresolved Question for the Windows/Linux
slice with a feasible, standard-tooling recipe. Evidence: `probes/signing-dry-run.md`.

---

## 4. Measurements table (consolidated — the E5-S4 baseline)

| Metric | linux-x64 | win-x64 | Desired budget | Verdict |
|---|---|---|---|---|
| Cross-compile exit | 0 | 0 | 2/2 (exit 0) | ✅ PASS |
| `file(1)` type | ELF 64-bit LSB x86-64 | PE32+ x86-64 (console) | native per target | ✅ PASS |
| Binary size | 96.90 MB (101,604,521 B) | 105.12 MB (110,224,195 B) | ≤90 MB desired | ⚠️ FLAG (DEC-5, not blocking) |
| Clean-OS run | `marksync 0.0.0` exit 0 (debian:stable-slim) | (run deferred — DEC-3) | exit 0 + version, no runtime | ✅ PASS (linux) |
| Cold-start (wall-clock) | median 0.010 s (n=5) | n/a (run deferred) | ≤2 s desired | ✅ PASS (linux, ~200× margin) |
| Max RSS (informational) | ~34.7 MB | n/a | (none) | recorded |

**Conventions:** 1 MB = 1,048,576 bytes (binary). Cold-start = fresh-process
wall-clock of `./marksync-linux-x64 --version` on `debian:stable-slim` via
`/usr/bin/time -v`, n=5. Sizes via `stat -c %s`.

---

## 5. Signing section (verbatim reference)

See `spikes/bun-compile-smoke/probes/signing-dry-run.md` for the authoritative
block (sign Form A PKCS#12 + Form B PEM cert/key, verify, extract-signature,
cert plug-in table, macOS-out-of-scope note). The H5 sign command is reproduced
in §3-H5 above; E5-S4 wires it with a real cert (the `-pkcs12`/`-pass` inputs).

---

## 6. Build-script skeleton pointer (F-7 handoff)

**`scripts/build-binaries.sh`** (repo root) is the reusable cross-compile skeleton
consumed/refined by MS2-E5-S4. It wraps the two validated compile invocations with:
- argument parsing: `--target linux|windows|all` (default `all`), `--out-dir DIR`
  (default `./dist`), `--entry PATH` (placeholder `./src/cli.ts` — E5-S4 repoints
  to the real CLI), `--help`;
- checksum generation: `sha256sum` per binary → `$OUT_DIR/SHA256SUMS`;
- a clearly-marked `TODO(E5-S4)` signing marker pointing at
  `spikes/bun-compile-smoke/probes/signing-dry-run.md` (signing NOT invoked — DEC-4).

Validated end-to-end in Phase 6 (`--target all` → both binaries + `SHA256SUMS`).
It is the E5-S4 starting point; E5-S4 adds SBOM, release upload, CI matrix wiring,
and the real signing cert.

---

## 7. Deferrals

| Item | Disposition | Detail |
|---|---|---|
| **Clean-OS Windows *run*** (DEC-3) | **DEFERRED → MS2-E5-S4 Windows CI runner** | `wine` is absent in this environment. The win-x64 binary is **produced** and verified as a valid PE32+ executable (H1 win-x64 *production* fully validated); only the Windows *run* is deferred to a Windows CI runner in E5-S4 (story step-5 explicit fallback). |
| **`alpine` (musl) clean-OS run** (RSK-4) | **RECORDED (non-blocking)** | `exec ./marksync-linux-x64: no such file or directory` on alpine — the glibc dynamic loader `/lib64/ld-linux-x86-64.so.2` is absent under musl. Expected; `debian:stable-slim` (glibc) satisfies NFR-RUN-1. E5-S4 may ship a musl variant via a separate target if desired. Evidence: `evidence/TC-BCS-004.txt`. |
| **macOS target** (NG-1 / NFR-COMP-1) | **OUT OF SCOPE → MS-0003** | Not exercised as a gate. (Informational: `bun-darwin-arm64` IS an accepted target in 1.1.34 — §8.) |
| **Production code-signing** (NG-4 / DEC-4) | **DRY-RUN ONLY → E5-S4** | H5 documents the `osslsigncode` recipe; a real cert + CI secret wiring lands in E5-S4. |

---

## 8. arm64 stretch (informational — TC-BCS-008, spec NG-2; non-gated)

For E5-S4's forward planning, the pinned Bun 1.1.34 was probed for arm64 target
availability (a single attempt + log line each; non-blocking):

| Target | Accepted in 1.1.34? | `file(1)` |
|---|---|---|
| `bun-linux-arm64` | **YES** (exit 0; `bun-linux-aarch64-v1.1.34`) | ELF 64-bit LSB executable, ARM aarch64 (glibc, interpreter `/lib/ld-linux-aarch64.so.1`) |
| `bun-darwin-arm64` | **YES** (exit 0; `bun-darwin-aarch64-v1.1.34`) | Mach-O 64-bit arm64 executable |

Both arm64 cross-compile targets **exist** in Bun 1.1.34. E5-S4 may pick them up
if the x64 path is clean. (The linux-aarch64 binary is glibc-linked — the same
musl caveat as RSK-4 would apply to an alpine-arm64 run.) Evidence:
`evidence/TC-BCS-008.txt`.

---

## 9. Reproducibility metadata

- **Bun:** `1.1.34` (`/home/juliusz/.bun/bin/bun`) — pinned, DEC-2.
- **Build host:** `Linux 7.0.0-22-generic x86_64` (Ubuntu; full `uname -a` in
  `evidence/run-20260706T203749Z.txt`).
- **Docker:** `27.3.1` (daemon reachable).
- **debian:stable-slim** digest: `sha256:ee12ffb55625b99d62837a72f037d9b2f18fd0c787a89c2b9a4f09666c48776c`
  (Debian 13 "trixie"; **`debian:slim` is not a published tag** — reconciliation
  noted in the header).
- **alpine:latest** digest: `sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b`
- **Measurement conventions:** size in bytes via `stat -c %s`, MB = bytes ÷
  1,048,576 (binary); cold-start = fresh-process wall-clock via `/usr/bin/time -v`
  on the clean OS, n=5; RSS = `Maximum resident set size` (informational).
- **Re-derive:** `cd spikes/bun-compile-smoke && bun run probe:all` →
  `evidence/run-<TS>.txt` + per-probe `evidence/TC-BCS-*.txt`.

---

## 10. MS-0002 / MS2-E5-S4 recommendation

> **PROCEED to MS2-E5-S4 (cross-platform binary builds) with the committed
> `scripts/build-binaries.sh` skeleton as the starting point.** H1–H5 all PASS;
> the cross-compile mechanism is validated for linux-x64 + win-x64; the
> no-runtime promise (ADR-0001 C-2) holds empirically on `debian:stable-slim`;
> cold-start is ~200× inside budget; the signing recipe is documented; and the
> size exceedance (linux 96.90 MB, win 105.12 MB) is flagged-not-blocking under
> DEC-5 ("desired, not hard"). The only carry-forwards are: (a) the clean-OS
> **Windows *run*** → a Windows CI runner in E5-S4 (DEC-3; H1 win-x64
> *production* is already validated here); and (b) a **real Authenticode cert**
> for production signing (H5 was a dry-run — the cert plugs in at
> `-pkcs12`/`-pass`). No ADR-0001 language-level reconsideration is warranted —
> the catastrophic-failure escalation (Appendix B) is not triggered.

**Outcome routing (per spec §18 / Appendix B):** PASS → unblock E5-S4 with the
skeleton. (The "partial: size/cold-start exceedance" and "partial: win-x64
target unavailable" branches are NOT the active path — sizes are flagged-but-
accepted, and the win-x64 target compiled cleanly.)

---

## 11. Secret hygiene (AC7)

**Secrets scan: 0 secrets in committed artifacts** (reviewed 2026-07-06; tool:
`rg` — `gitleaks` not installed). Scan scope: `spikes/bun-compile-smoke/`
(excluding gitignored `node_modules/`, binaries, `*.log`), `findings/`, and
`scripts/build-binaries.sh`. The Phase 5 signing command uses a placeholder
`$CERT_PASSWORD` env-var **name** (not a value) and placeholder cert paths —
scans clean. (Finalized + committed as the `scripts/secret-scan.sh` probe in
Phase 8; the verdict is recorded here per the test-plan TC-BCS-SEC.)

---

## 12. Doc-update ownership (lifecycle phase 7 — NOT this spike)

The following system-doc reconciliations are performed by **`@doc-syncer`** in
lifecycle phase 7 — **this coder did not edit them** (spec NG-6):

- **ADR-0001** — record cross-compile verification evidence (C-2 single binary no
  runtime; C-3 cross-platform validated for MS-0002 Linux+Windows); add the H1/H2
  PASS + H5 signing-evidence pointer; partially address the open signing
  Unresolved Question. **Do NOT autonomously reconsider the TS-over-Go choice.**
- **MS2-E1-S3 story** — flip `status: todo → done`; add the H1–H5 verdict banner.
- **MS2-E5-S4 story** — note the spike unblocked it (validated invocations + the
  `scripts/build-binaries.sh` skeleton); flag the DEC-3 Windows-run deferral +
  the real-cert-still-needed note.
- **`doc/spec/nonfunctional.md`** — optional evidence pointer for NFR-PERF-1/2,
  NFR-COMP-1/2 (NO rewording of "desired, not hard"; flag the size exceedance for
  owner review, do not auto-change).

This findings document is the enabling evidence for that reconciliation.
