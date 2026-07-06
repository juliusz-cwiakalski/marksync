#!/usr/bin/env bash
# spikes/bun-compile-smoke/probes/measure-size.sh
#
# Probe TC-BCS-005 — binary size measurement, H3 / NFR-SIZE-1 (traces to NFR-PERF-1).
#
# Records the size of each cross-compiled binary in BYTES (via stat) and converts
# to MB using the binary convention 1 MB = 1,048,576 bytes (forced C-locale so the
# decimal separator is always '.'). Compares each to the <=90 MB "desired, not
# hard" budget (NFR-PERF-1; DEC-5). Exceedance is RECORDED + FLAGGED, never
# blocking — the measurement is the deliverable (H3 is "record the actual size;
# flag if > 90 MB but still acceptable").
export LC_ALL=C
set -uo pipefail

LINUX_BIN="${1:-./marksync-linux-x64}"
WIN_BIN="${2:-./marksync-win-x64.exe}"
DESIRED_MB=90
BYTES_PER_MB=1048576

bytes_to_mb() {  # $1 = bytes -> prints "NN.NN" with a dot decimal (C locale)
  awk -v b="$1" -v d="$BYTES_PER_MB" 'BEGIN{ printf "%.2f", b/d }' </dev/null
}

measure_one() {
  local label="$1" bin="$2"
  if [[ ! -f "$bin" ]]; then
    printf '  %-28s %s\n' "$label" "(not found — skipped)"
    return
  fi
  local bytes mb flag
  bytes=$(stat -c %s "$bin")
  mb=$(bytes_to_mb "$bytes")
  if awk -v m="$mb" -v d="$DESIRED_MB" 'BEGIN{ exit !(m > d) }' </dev/null; then
    flag="FLAG (exceeds ${DESIRED_MB} MB desired — DEC-5: recorded, NOT blocking)"
  else
    flag="within ${DESIRED_MB} MB desired"
  fi
  printf '  %-28s %12s bytes  %7s MB  %s\n' "$label" "$bytes" "$mb" "$flag"
}

echo "TC-BCS-005 binary size measurement (H3 / NFR-SIZE-1 -> NFR-PERF-1)"
echo "convention: 1 MB = $BYTES_PER_MB bytes (binary); desired budget <= ${DESIRED_MB} MB (DEC-5: desired, not hard)"
echo
measure_one "marksync-linux-x64"      "$LINUX_BIN"
measure_one "marksync-win-x64.exe"    "$WIN_BIN"
echo
echo "TC-BCS-005 done — sizes recorded (exceedance flagged, not blocking)."
