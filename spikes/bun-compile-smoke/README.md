# bun-compile-smoke spike (GH-13 / MS2-E1-S3)

> **Stub.** Finalized in Phase 8 (close-out). This README is the standalone
> workspace for the `[MS2-E1-S3] Bun single-binary cross-compile smoke` spike.

## Purpose (one paragraph)

This spike empirically validates **ADR-0001's distribution promise** — **C-2**
(a single self-contained binary per OS+arch with **no mandatory language
runtime**) and **C-3** (cross-platform compilation) — for the MS-0002
Linux+Windows slice. It cross-compiles a minimal smoke CLI to `bun-linux-x64`
and `bun-windows-x64` from a Linux dev host, runs the linux-x64 binary inside a
clean-OS Docker image with no Bun/Node installed, measures binary size +
cold-start against the "desired, not hard" MS-0002 budget (≤90 MB / ≤2 s), and
documents the Windows Authenticode signing path (`osslsigncode`) as a dry-run
command. The outcome either unblocks MS2-E5-S4 with the committed
`scripts/build-binaries.sh` skeleton, or triggers a documented fallback.

**Findings:** see [`../../findings/bun-compile-smoke-findings.md`](../../findings/bun-compile-smoke-findings.md).

## Prerequisites

- **Bun 1.1.34** (pinned — DEC-2; matches the GH-11 pin).
- **Docker 27.3.1** with the daemon reachable (H2 clean-OS Linux smoke).
- `wine` is **NOT** installed (DEC-3) — the win-x64 binary is produced + verified
  as PE32+ via `file(1)`; the clean-OS Windows *run* is deferred to a Windows CI
  runner in MS2-E5-S4.
- `osslsigncode` is **NOT** installed (DEC-4) — H5 is documentation-only.

## Quick-start

```bash
# from this directory (spikes/bun-compile-smoke/)
bun run cli              # prints: marksync 0.0.0
bun run build:linux      # -> marksync-linux-x64  (gitignored, ~50-90 MB)
bun run build:windows    # -> marksync-win-x64.exe (gitignored, ~50-90 MB)
bun run probe:all        # runs the full probe pipeline (H1-H4 + arm64 stretch)
```

> The full run-book (expected outputs, interpretation, E5-S4 reuse notes) is
> finalized in Phase 8.
