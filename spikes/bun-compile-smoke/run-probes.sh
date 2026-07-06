#!/usr/bin/env bash
#
# spikes/bun-compile-smoke/run-probes.sh — full probe-pipeline orchestrator (GH-13).
#
# Runs the H1–H4 + arm64-stretch probes in sequence, capturing each probe's
# stdout/stderr/exit to evidence/, and recording the Bun version + host OS/arch.
# This orchestrator is itself reproducibility evidence (it is the single command
# that re-derives every measurement in the findings doc).
#
# Usage: bash run-probes.sh    (or: bun run probe:all)
#
# Probes are NON-GATED except the two cross-compiles (H1) and the clean-OS
# debian run (H2) — a failure there is surfaced but the orchestrator still
# records all probes so the findings doc has the full picture. Size/cold-start
# exceedance is flagged-not-blocking (DEC-5); alpine + arm64 are informational.
export LC_ALL=C
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

mkdir -p evidence
TS="$(date -u +%Y%m%dT%H%M%SZ)"
SUMMARY="evidence/run-${TS}.txt"

BUN="${BUN:-bun}"
export BUN

{
  echo "# bun-compile-smoke probe run — ${TS}"
  echo "# bun --version: $($BUN --version)"
  echo "# host: $(uname -srm)"
  echo "# host full: $(uname -a)"
  echo
} | tee "$SUMMARY"

# Each step: run, tee to its own evidence file, append a one-line status to the summary.
run_step() {
  local id="$1" label="$2"; shift 2
  local log="evidence/${id}.txt"
  echo "================================================================" | tee -a "$SUMMARY"
  echo "## $id — $label" | tee -a "$SUMMARY"
  echo "================================================================" | tee -a "$SUMMARY"
  set +e
  ( "$@" ) >"$log" 2>&1
  local rc=$?
  set -e
  tail -n +1 "$log" 2>/dev/null || true
  printf '%s — exit=%s (log: %s)\n\n' "$id" "$rc" "$log" | tee -a "$SUMMARY"
}

# 1. linux-x64 cross-compile (TC-BCS-001 / H1a)
run_step TC-BCS-001 "linux-x64 cross-compile (H1a)" \
  bash -c '"$BUN" build --compile --target=bun-linux-x64 ./src/cli.ts --outfile marksync-linux-x64 && file marksync-linux-x64 && ./marksync-linux-x64 --version'

# 2. windows-x64 cross-compile (TC-BCS-002 / H1b)
run_step TC-BCS-002 "windows-x64 cross-compile (H1b)" \
  bash -c '"$BUN" build --compile --target=bun-windows-x64 ./src/cli.ts --outfile marksync-win-x64.exe && file marksync-win-x64.exe'

# 3. clean-OS debian (TC-BCS-003 / H2 primary)
run_step TC-BCS-003 "clean-OS debian:stable-slim (H2 primary)" \
  bash probes/clean-os-debian.sh

# 4. clean-OS alpine (TC-BCS-004 / H2 stretch)
run_step TC-BCS-004 "clean-OS alpine (H2 stretch, non-blocking)" \
  bash probes/clean-os-alpine.sh

# 5. size (TC-BCS-005 / H3)
run_step TC-BCS-005 "binary size (H3)" \
  bash probes/measure-size.sh

# 6. cold-start (TC-BCS-006 / H4)
run_step TC-BCS-006 "cold-start on clean OS (H4)" \
  bash probes/measure-cold-start.sh

# 7. arm64 stretch (TC-BCS-008 / informational)
run_step TC-BCS-008 "arm64 target availability (informational, NG-2)" \
  bash probes/arm64-stretch.sh ./src/cli.ts

echo "================================================================" | tee -a "$SUMMARY"
echo "## Run complete — evidence in evidence/" | tee -a "$SUMMARY"
echo "================================================================" | tee -a "$SUMMARY"
echo "Summary log: $SUMMARY"
echo
echo "Per-hypothesis quick read (author verdicts in findings/bun-compile-smoke-findings.md):"
echo "  H1  cross-compile     — see evidence/TC-BCS-001.txt + TC-BCS-002.txt"
echo "  H2  clean-OS run      — see evidence/TC-BCS-003.txt (+ TC-BCS-004 stretch)"
echo "  H3  size              — see evidence/TC-BCS-005.txt"
echo "  H4  cold-start        — see evidence/TC-BCS-006.txt"
echo "  H5  signing dry-run   — probes/signing-dry-run.md (documentation only, DEC-4)"
echo "  --- arm64 stretch     — see evidence/TC-BCS-008.txt (informational, NG-2)"
