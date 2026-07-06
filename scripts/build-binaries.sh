#!/usr/bin/env bash
#
# scripts/build-binaries.sh — reusable cross-compile skeleton (E5-S4 handoff).
#
# Origin: GH-13 / MS2-E1-S3 — Bun single-binary cross-compile smoke spike.
# Status: E5-S4 SKELETON, refined from the validated GH-13 spike invocations.
#         NOT yet the production release matrix — E5-S4 (MS2-E5-S4) repoints the
#         entry path to the real CLI and wires signing/checksums/SBOM into CI.
#
# What this does (validated by the spike):
#   * bun build --compile --target=bun-linux-x64   <entry> --outfile <out>/marksync-linux-x64
#   * bun build --compile --target=bun-windows-x64 <entry> --outfile <out>/marksync-win-x64.exe
#   * sha256sum per produced binary -> <out>/SHA256SUMS
#
# What this does NOT do (TODO E5-S4):
#   * Authenticode-sign the Windows binary (see spikes/bun-compile-smoke/probes/signing-dry-run.md
#     for the validated `osslsigncode` recipe; cert material plugs in there).
#   * SBOM generation, release upload, CI matrix wiring.
#
# Validated with: Bun 1.1.34 (DEC-2) on a Linux dev host. See
# findings/bun-compile-smoke-findings.md for the measured sizes / cold-start baseline.
#
# Usage:
#   scripts/build-binaries.sh [--target linux|windows|all] [--out-dir DIR] [--entry PATH] [--help]
#
set -euo pipefail

# --- defaults ---------------------------------------------------------------
TARGET="all"            # linux | windows | all
OUT_DIR="${BUILD_OUT_DIR:-./dist}"
ENTRY="${BUILD_ENTRY:-./src/cli.ts}"   # placeholder — E5-S4 repoints to the real CLI entry

# --- usage ------------------------------------------------------------------
usage() {
  cat <<'EOF'
Usage: scripts/build-binaries.sh [options]

Cross-compile a Bun single-binary per target (E5-S4 skeleton, GH-13 spike).

Options:
  --target linux|windows|all   Target(s) to build (default: all)
  --out-dir DIR                Output directory (default: ./dist)
  --entry PATH                 Bun entry file (default: ./src/cli.ts; E5-S4 repoints to the real CLI)
  -h, --help                   Show this help and exit

Environment:
  BUILD_OUT_DIR   Default for --out-dir
  BUILD_ENTRY     Default for --entry

Notes:
  * Requires Bun (>= 1.1.34) on PATH. The linux-x64 + windows-x64 compile targets
    are validated by the GH-13 spike; arm64/darwin targets are a stretch (see the
    spike's findings doc).
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
  echo "error: bun not found on PATH (need >= 1.1.34, DEC-2)" >&2
  exit 2
fi
if [[ ! -f "$ENTRY" ]]; then
  echo "error: entry file not found: $ENTRY (use --entry to set the real CLI path; this is a skeleton)" >&2
  exit 2
fi

# --- build ------------------------------------------------------------------
mkdir -p "$OUT_DIR"
echo "build-binaries.sh (GH-13 skeleton) — target=$TARGET out-dir=$OUT_DIR entry=$ENTRY"
echo "bun: $(bun --version)"

build_one() {
  local label="$1" target="$2" outfile="$3"
  echo
  echo "==> [$label] bun build --compile --target=$target"
  bun build --compile --target="$target" "$ENTRY" --outfile "$outfile"
  echo "    produced: $outfile ($(stat -c %s "$outfile") bytes)"
  sha256sum "$outfile" | sed "s|  .*|  $(basename "$outfile")|" >> "$OUT_DIR/SHA256SUMS.tmp"
}

# Reset the checksum accumulator.
: > "$OUT_DIR/SHA256SUMS.tmp"

case "$TARGET" in
  linux)   build_one linux   bun-linux-x64   "$OUT_DIR/marksync-linux-x64" ;;
  windows) build_one windows bun-windows-x64 "$OUT_DIR/marksync-win-x64.exe" ;;
  all)
    build_one linux   bun-linux-x64   "$OUT_DIR/marksync-linux-x64"
    build_one windows bun-windows-x64 "$OUT_DIR/marksync-win-x64.exe"
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

# --- signing TODO (E5-S4) ---------------------------------------------------
# TODO(E5-S4): wire osslsigncode sign for the Windows binary — see the validated
# dry-run command at:
#   spikes/bun-compile-smoke/probes/signing-dry-run.md
# The production cert material plugs in at -pkcs12/-pass (or -certs/-key) +
# -t <timestamp-url> -h sha256. Do NOT invoke signing here (no cert in this
# skeleton; spec DEC-4).
if [[ "$TARGET" == "windows" || "$TARGET" == "all" ]]; then
  echo
  echo "==> signing: SKIPPED (E5-S4 TODO — see spikes/bun-compile-smoke/probes/signing-dry-run.md)"
fi

echo
echo "build-binaries.sh: done (target=$TARGET)."
