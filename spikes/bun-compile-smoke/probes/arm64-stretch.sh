#!/usr/bin/env bash
# spikes/bun-compile-smoke/probes/arm64-stretch.sh
#
# Probe TC-BCS-008 — arm64 target availability (INFORMATIONAL, NON-GATED).
# spec NG-2 / RSK-1: record whether --target=bun-linux-arm64 and
# --target=bun-darwin-arm64 are accepted targets in the pinned Bun version.
# A single attempt + log line per target suffices; this probe NEVER blocks.
#
# NOTE: this probe DOWNLOADS the aarch64 toolchains (~4 MB each) on first run.
set -uo pipefail   # no -e: a rejected target is a recorded observation, not an error

BUN="${BUN:-bun}"
ENTRY="${1:-./src/cli.ts}"

echo "TC-BCS-008 arm64 stretch (informational, spec NG-2; NON-GATED)"
echo "bun: $($BUN --version)"
echo

attempt_target() {
  local target="$1" outfile="$2"
  echo "--- attempt: bun build --compile --target=$target ---"
  set +e
  $BUN build --compile --target="$target" "$ENTRY" --outfile "$outfile" >/tmp/bcs-arm64.log 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 && -f "$outfile" ]]; then
    echo "  ACCEPTED (exit 0): $target is a valid target in $($BUN --version)"
    file "$outfile" | sed 's/^/  /'
  else
    echo "  REJECTED (exit $rc): $target is NOT a valid target — recorded (non-blocking)."
    tail -3 /tmp/bcs-arm64.log 2>/dev/null | sed 's/^/    /' || true
  fi
  rm -f "$outfile"   # do not leave the (gitignored) stretch binary behind
  echo
}

attempt_target bun-linux-arm64   marksync-linux-arm64
attempt_target bun-darwin-arm64  marksync-darwin-arm64

echo "TC-BCS-008 done — informational; E5-S4 may pick up arm64 if the x64 path is clean."
exit 0
