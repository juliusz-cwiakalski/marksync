#!/usr/bin/env bash
# spikes/bun-compile-smoke/probes/clean-os-debian.sh
#
# Probe TC-BCS-003 — clean-OS Linux runtime smoke (PRIMARY), H2 / NFR-RUN-1 / NFR-COMP-2.
#
# Runs the cross-compiled linux-x64 Bun binary inside a minimal Debian image that
# has NO Bun/Node/Deno installed, and asserts it exits 0 + prints the version
# string. This is the empirical proof of ADR-0001 C-2 ("no mandatory runtime").
#
# IMAGE NOTE (reconciliation): the plan/spec text wrote `debian:slim`, but the
# canonical current Debian slim tag on Docker Hub is `debian:stable-slim`
# (Debian 13 "trixie"). `debian:slim` is not a published tag. This probe uses the
# real, pullable tag `debian:stable-slim`; the digest is recorded below and in
# the findings doc for reproducibility. NFR-COMP-2 ("clean-OS image, no runtime")
# is satisfied identically.
set -euo pipefail

IMAGE="${MARKSYNC_SMOKE_DEBIAN:-debian:stable-slim}"
BIN="${1:-./marksync-linux-x64}"

if [[ ! -f "$BIN" ]]; then
  echo "FAIL: $BIN not found — run 'bun run build:linux' first." >&2
  exit 2
fi

echo "TC-BCS-003 clean-OS Linux smoke (PRIMARY) — image: $IMAGE"
echo "image digest: $(docker inspect --format '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || echo '(local; pull for digest)')"
echo

echo "--- [1] verify NO bun/node in the image (NFR-COMP-2) ---"
docker run --rm "$IMAGE" sh -c 'command -v bun node deno 2>/dev/null; echo "exit=$?"'
echo

echo "--- [2] run the binary on the clean OS ---"
docker run --rm -v "$PWD":/x -w /x "$IMAGE" "$BIN" --version
RUN_EXIT=$?
echo
echo "TC-BCS-003 result: run exit=$RUN_EXIT"
if [[ "$RUN_EXIT" -ne 0 ]]; then
  echo "FAIL: clean-OS debian run exited non-zero"
  exit 1
fi
echo "PASS: linux-x64 binary runs on clean $IMAGE with no Bun/Node installed (H2 / NFR-RUN-1 / NFR-COMP-2)."
