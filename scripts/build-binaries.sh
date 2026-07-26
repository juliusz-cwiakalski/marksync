#!/usr/bin/env bash
#
# scripts/build-binaries.sh — production cross-compile build script (GH-32).
#
# Origin: Refined from the GH-13 spike skeleton (MS2-E1-S3) into the production
# release pipeline (MS2-E5-S4 / GH-32). Targets the real CLI entry point and
# includes the full matrix (linux-x64, linux-arm64, win-x64).
#
# What this does:
#   * bun build --compile --target=bun-linux-x64   <entry> --outfile <out>/marksync-linux-x64
#   * bun build --compile --target=bun-linux-arm64 <entry> --outfile <out>/marksync-linux-arm64
#   * bun build --compile --target=bun-windows-x64 <entry> --outfile <out>/marksync-win-x64.exe
#   * sha256sum per produced binary -> <out>/SHA256SUMS
#
# What this does NOT do (deferred to MS-0003):
#   * Authenticode-sign the Windows binary (see spikes/bun-compile-smoke/probes/signing-dry-run.md
#     for the validated `osslsigncode` recipe; cert material plugs in there).
#   * SBOM generation, release upload (handled by .github/workflows/release.yml).
#
# Validated with: Bun 1.2.23 (DEC-1) on a Linux dev host. See
# findings/bun-compile-smoke-findings.md for the measured sizes / cold-start baseline.
#
# Usage:
#   scripts/build-binaries.sh [--target linux|windows|all] [--out-dir DIR] [--entry PATH] [--help]
#
set -euo pipefail

# --- defaults ---------------------------------------------------------------
TARGET="all"            # linux | windows | all
OUT_DIR="${BUILD_OUT_DIR:-./dist}"
ENTRY="${BUILD_ENTRY:-src/cli/index.ts}"   # real CLI entry (GH-14)

# --- usage ------------------------------------------------------------------
usage() {
  cat <<'EOF'
Usage: scripts/build-binaries.sh [options]

Cross-compile a Bun single-binary per target (GH-32 production build script).

Options:
  --target linux|windows|all   Target(s) to build (default: all)
  --out-dir DIR                Output directory (default: ./dist)
  --entry PATH                 Bun entry file (default: src/cli/index.ts)
  -h, --help                   Show this help and exit

Environment:
  BUILD_OUT_DIR   Default for --out-dir
  BUILD_ENTRY     Default for --entry

Notes:
  * Requires Bun 1.2.23 on PATH (DEC-1 — matches package.json#engines.bun).
  * Targets: linux-x64, linux-arm64 (stretch, see RSK-2), win-x64.
  * Does NOT sign the Windows binary. See
    spikes/bun-compile-smoke/probes/signing-dry-run.md for the osslsigncode recipe.
EOF
}

# --- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || { echo "error: --target needs a value" >&2; exit 2; }
      TARGET="$2"; shift 2 ;;
    --target=*) TARGET="${1#--target=}"; shift ;;
    --out-dir)
      [[ $# -ge 2 ]] || { echo "error: --out-dir needs a value" >&2; exit 2; }
      OUT_DIR="$2"; shift 2 ;;
    --out-dir=*) OUT_DIR="${1#--out-dir=}"; shift ;;
    --entry)
      [[ $# -ge 2 ]] || { echo "error: --entry needs a value" >&2; exit 2; }
      ENTRY="$2"; shift 2 ;;
    --entry=*) ENTRY="${1#--entry=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$TARGET" in
  linux|windows|all) ;;
  *) echo "error: --target must be linux|windows|all (got: $TARGET)" >&2; exit 2 ;;
esac

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH (need 1.2.23, DEC-1)" >&2
  exit 2
fi
if [[ ! -f "$ENTRY" ]]; then
  echo "error: entry file not found: $ENTRY" >&2
  exit 2
fi

# --- build ------------------------------------------------------------------
mkdir -p "$OUT_DIR"
echo "build-binaries.sh (GH-32 production build script) — target=$TARGET out-dir=$OUT_DIR entry=$ENTRY"
echo "bun: $(bun --version)"

build_one() {
  local label="$1" target="$2" outfile="$3" arch="$4"
  echo
  echo "==> [$label] bun build --compile --target=$target"
  if bun build --compile --target="$target" "$ENTRY" --outfile "$outfile"; then
    echo "    produced: $outfile ($(stat -c %s "$outfile") bytes)"
    sha256sum "$outfile" | sed "s|  .*|  $(basename "$outfile")|" >> "$OUT_DIR/SHA256SUMS.tmp"
    return 0
  else
    local exit_code=$?
    if [[ "$arch" == "arm" ]]; then
      echo "    arm64: UNAVAILABLE — recorded for MS-0003 (RSK-2 / DEC-3)"
      return 0  # Non-blocking: arm64 is a stretch, not a gate
    else
      return $exit_code
    fi
  fi
}

# Reset the checksum accumulator.
: > "$OUT_DIR/SHA256SUMS.tmp"

case "$TARGET" in
  linux)
    build_one linux   bun-linux-x64   "$OUT_DIR/marksync-linux-x64" amd
    build_one linux   bun-linux-arm64 "$OUT_DIR/marksync-linux-arm64" arm
    ;;
  windows)
    build_one windows bun-windows-x64 "$OUT_DIR/marksync-win-x64.exe" amd
    ;;
  all)
    build_one linux   bun-linux-x64   "$OUT_DIR/marksync-linux-x64" amd
    build_one linux   bun-linux-arm64 "$OUT_DIR/marksync-linux-arm64" arm
    build_one windows bun-windows-x64 "$OUT_DIR/marksync-win-x64.exe" amd
    ;;
esac

# --- checksums (mirrors the E5-S4 release-artifact contract) ----------------
# Re-rewrite SHA256SUMS with basenames so the file is portable across the
# release directory layout.
sort -k2 "$OUT_DIR/SHA256SUMS.tmp" > "$OUT_DIR/SHA256SUMS"
rm -f "$OUT_DIR/SHA256SUMS.tmp"
echo
echo "==> SHA256SUMS ($OUT_DIR/SHA256SUMS)"
cat "$OUT_DIR/SHA256SUMS"

# --- signing TODO (MS-0003) ---------------------------------------------------
# TODO(MS-0003): wire osslsigncode sign for the Windows binary — see the validated
# dry-run command at:
#   spikes/bun-compile-smoke/probes/signing-dry-run.md
# The production cert material plugs in at -pkcs12/-pass (or -certs/-key) +
# -t <timestamp-url> -h sha256. Real signing is OUT of MS-0002 (DEC-7).
if [[ "$TARGET" == "windows" || "$TARGET" == "all" ]]; then
  echo
  echo "==> signing: SKIPPED (MS-0003 — see spikes/bun-compile-smoke/probes/signing-dry-run.md)"
fi

echo
echo "build-binaries.sh: done (target=$TARGET). See doc/guides/binary-release-signing.md for the signing plug-in point."
