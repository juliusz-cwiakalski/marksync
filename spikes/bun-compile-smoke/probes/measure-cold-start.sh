#!/usr/bin/env bash
# spikes/bun-compile-smoke/probes/measure-cold-start.sh
#
# Probe TC-BCS-006 — cold-start measurement, H4 / NFR-START-1 (traces to NFR-PERF-2).
#
# Measures the cold-start (wall-clock time of a fresh process invocation) of the
# linux-x64 binary on the CLEAN-OS Linux container (debian:stable-slim), plus the
# informational Maximum resident set size (RSS), via GNU `/usr/bin/time -v`.
#
# `debian:stable-slim` does NOT ship /usr/bin/time by default, so the probe
# installs the `time` package ephemerally inside the container
# (`apt-get install -y --no-install-recommends time`). This is recorded as the
# measurement method. Each repeat is a FRESH process (a fresh `docker run`) to
# approximate a cold start; absolute numbers are directional (page-cache
# isolation in a container is imperfect).
#
# Compared to the <=2 s "desired, not hard" budget (NFR-PERF-2; DEC-5).
# Exceedance is DOCUMENTED, never blocking — the measurement is the deliverable.
export LC_ALL=C
set -uo pipefail

IMAGE="${MARKSYNC_SMOKE_DEBIAN:-debian:stable-slim}"
BIN="${1:-./marksync-linux-x64}"
REPEATS="${MARKSYNC_COLD_START_REPEATS:-5}"
DESIRED_S=2

if [[ ! -f "$BIN" ]]; then
  echo "FAIL: $BIN not found — run 'bun run build:linux' first." >&2
  exit 2
fi

echo "TC-BCS-006 cold-start measurement (H4 / NFR-START-1 -> NFR-PERF-2)"
echo "image: $IMAGE  |  binary: $BIN  |  repeats: $REPEATS  |  desired: <= ${DESIRED_S} s (DEC-5)"
echo "method: fresh-process wall-clock via /usr/bin/time -v (GNU time installed ephemerally in the container)"
echo
printf '  %-8s %14s %18s %s\n' "repeat" "wall-clock(s)" "max-RSS(KiB)" "vs ${DESIRED_S}s desired"

all_wall=""
for i in $(seq 1 "$REPEATS"); do
  # Install GNU time + run the binary under /usr/bin/time -v in ONE fresh container.
  # Pass the binary path via env var BIN to avoid shell-quoting pitfalls.
  # NOTE: use `sh -c` (dash) — the slim image's default shell; `bash -c`
  # returned empty output in this container for reasons that don't matter to the
  # measurement (sh is universally present on debian:stable-slim).
  raw=$(BIN="$BIN" docker run --rm -e BIN -v "$PWD":/x -w /x "$IMAGE" sh -c '
    apt-get -qq update >/dev/null 2>&1 && apt-get -qq install -y --no-install-recommends time >/dev/null 2>&1
    /usr/bin/time -v "$BIN" --version
  ' 2>&1)
  # GNU time wall-clock: "\tElapsed (wall clock) time (h:mm:ss or m:ss): 0:00.01"
  # (GNU time indents its output with a TAB — patterns allow leading whitespace.)
  wall_raw=$(printf '%s\n' "$raw" | grep -E 'Elapsed \(wall clock\) time' | sed -E 's/.*: //')
  # Convert M:SS.ss or H:MM:SS to seconds. (No </dev/null here — awk reads the pipe.)
  wall=$(printf '%s\n' "$wall_raw" | awk -F: '
    { if (NF==2) printf "%.3f", $1*60 + $2;
      else if (NF==3) printf "%.3f", $1*3600 + $2*60 + $3;
      else { print "n/a"; } }')
  rss=$(printf '%s\n' "$raw" | grep -E 'Maximum resident set size' | awk -F': ' '{print $2}')
  if [[ "$wall" == "n/a" || -z "$wall" ]]; then
    flag="(unparsed: '$wall_raw')"
    wall="n/a"
  elif awk -v w="$wall" -v d="$DESIRED_S" 'BEGIN{ exit !(w+0 > d) }' </dev/null; then
    flag="OVER ${DESIRED_S}s (documented, not blocking — DEC-5)"
  else
    flag="within ${DESIRED_S}s desired"
  fi
  printf '  %-8s %14s %18s %s\n' "$i" "${wall:-n/a}" "${rss:-n/a}" "$flag"
  [[ "$wall" != "n/a" && -n "$wall" ]] && all_wall="$all_wall $wall"
done

echo
if [[ -n "$all_wall" ]]; then
  # shellcheck disable=SC2086
  median=$(printf '%s\n' $all_wall | sort -n | awk '{a[NR]=$1} END{ if(NR%2==1) print a[(NR+1)/2]; else printf "%.3f", (a[NR/2]+a[NR/2+1])/2 }')
  # shellcheck disable=SC2086
  min=$(printf '%s\n' $all_wall | sort -n | head -1)
  # shellcheck disable=SC2086
  max=$(printf '%s\n' $all_wall | sort -n | tail -1)
  echo "  summary: min=${min}s  median=${median}s  max=${max}s  (n=$REPEATS, fresh processes)"
fi
echo "TC-BCS-006 done — cold-start recorded (directional; container page-cache imperfect)."
