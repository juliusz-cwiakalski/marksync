#!/usr/bin/env bash
# spikes/bun-compile-smoke/probes/clean-os-alpine.sh
#
# Probe TC-BCS-004 — clean-OS Linux runtime smoke (STRETCH), H2 / RSK-4.
#
# Repeats the clean-OS run inside `alpine` (musl libc). The Bun-compiled linux-x64
# binary is glibc-linked (dynamic interpreter /lib64/ld-linux-x86-64.so.2), so it
# MAY fail dynamic-link resolution under musl. This is a NON-BLOCKING stretch
# probe (spec RSK-4, NG-2): NFR-RUN-1 is already satisfied by the primary
# `debian:stable-slim` probe (TC-BCS-003). Either outcome (PASS or a recorded
# musl/glibc failure mode) is acceptable.
set -uo pipefail   # no -e: we want to capture and record a failure, not abort

IMAGE="${MARKSYNC_SMOKE_ALPINE:-alpine:latest}"
BIN="${1:-./marksync-linux-x64}"

if [[ ! -f "$BIN" ]]; then
  echo "FAIL: $BIN not found — run 'bun run build:linux' first." >&2
  exit 2
fi

echo "TC-BCS-004 clean-OS Linux smoke (STRETCH) — image: $IMAGE"
echo "image digest: $(docker inspect --format '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || echo '(local; pull for digest)')"
echo

echo "--- [1] verify NO bun/node in the image ---"
docker run --rm "$IMAGE" sh -c 'command -v bun node deno 2>/dev/null; echo "exit=$?"'
echo

echo "--- [2] attempt the run on the clean OS (musl) ---"
set +e
docker run --rm -v "$PWD":/x -w /x "$IMAGE" "$BIN" --version 2>&1
RUN_EXIT=$?
set -e
echo
echo "TC-BCS-004 result: run exit=$RUN_EXIT"
if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "BONUS PASS: linux-x64 binary also runs on alpine (musl) — broader clean-OS coverage."
else
  echo "RECORDED (non-blocking): alpine (musl) run exited $RUN_EXIT — expected musl/glibc note (RSK-4)."
  echo "NFR-RUN-1 remains satisfied by the PRIMARY debian:stable-slim probe (TC-BCS-003)."
fi
# Always exit 0 — this probe is informational/non-blocking (spec NG-2/RSK-4).
exit 0
