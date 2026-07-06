#!/usr/bin/env bash
# GH-11 / MS2-E1-S1 — Secrets scan (TC-MRSPIKE-006 → AC7 / NFR-SEC-2).
#
# Light, grep-based scan across committed spike artifacts (the standalone
# spikes/mermaid-render/ workspace MINUS gitignored node_modules/logs/ephemera)
# plus the findings/ directory, for common secret patterns. Per the test plan
# §5.2 (TC-MRSPIKE-006) this is "light, grep-based + documented review": a spike
# is not expected to contain real secrets, so a documented review plus this scan
# satisfies AC7.
#
# Exit non-zero if any match is found; print the matches.
#
# NOTE on scope: node_modules/, *.log, *.lockb (binary lockfile), .spike-cache/,
# and ephemeral *.raw.svg / repeat outputs are EXCLUDED — they are gitignored
# and therefore not "committed artifacts" in scan scope.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# script lives at <repo-root>/spikes/mermaid-render/scripts/secret-scan.sh
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"        # …/spikes/mermaid-render
REPO_ROOT="$(cd "${WORKSPACE_ROOT}/../.." && pwd)"       # the actual repo root
FINDINGS_DIR="${REPO_ROOT}/findings"

# Build the search list: workspace source + findings (if present), excluding
# gitignored / binary / ephemeral paths.
SEARCH_ROOTS=()
[ -d "${WORKSPACE_ROOT}" ] && SEARCH_ROOTS+=("${WORKSPACE_ROOT}")
[ -d "${FINDINGS_DIR}" ] && SEARCH_ROOTS+=("${FINDINGS_DIR}")

EXCLUDES=(
  --glob '!node_modules/**'
  --glob '!.spike-cache/**'
  --glob '!*.lockb'
  --glob '!*.log'
  --glob '!*.raw.svg'
  --glob '!fixtures/*.repeat-*.svg'
  --glob '!fixtures/*.raw-*.svg'
)

# Detect searcher: prefer ripgrep, fall back to grep -r.
if command -v rg >/dev/null 2>&1; then
  SEARCHER="rg"
else
  SEARCHER="grep"
fi

# Patterns (one per line). Anchored enough to avoid trivial false positives.
PATTERNS=(
  'AKIA[0-9A-Z]{16}'                         # AWS access key id
  'xoxb-[0-9a-zA-Z-]+'                        # Slack bot token
  'ghp_[A-Za-z0-9]{36}'                       # GitHub personal access token
  'gho_[A-Za-z0-9]{36}'                       # GitHub OAuth token
  'Bearer [A-Za-z0-9._-]{8,}'                 # Bearer tokens
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'        # private-key headers
  'MARKSYNC_[A-Z0-9_]+=\S'                    # MARKSYNC_* env var with a non-empty VALUE
)

echo "=== TC-MRSPIKE-006 Secrets scan (AC7) ==="
echo "searcher: ${SEARCHER}"
echo "roots: ${SEARCH_ROOTS[*]}"
echo "excluding: node_modules/ .spike-cache/ *.lockb *.log *.raw.svg repeat outputs"
echo "---"

matches_found=0
for pat in "${PATTERNS[@]}"; do
  if [ "${SEARCHER}" = "rg" ]; then
    # -I: no filename in the match-only output we count; -n line numbers for display.
    hits="$(
      rg -n --no-heading "${EXCLUDES[@]}" -e "${pat}" "${SEARCH_ROOTS[@]}" 2>/dev/null || true
    )"
  else
    # grep fallback (no glob support this rich; exclude node_modules via --exclude-dir)
    hits="$(
      GREP_COLOR=1 grep -rn \
        --exclude-dir=node_modules --exclude-dir=.spike-cache \
        --exclude='*.lockb' --exclude='*.log' --exclude='*.raw.svg' \
        -e "${pat}" "${SEARCH_ROOTS[@]}" 2>/dev/null || true
    )"
  fi
  if [ -n "${hits}" ]; then
    echo "PATTERN MATCH (${pat}):"
    echo "${hits}"
    echo
    matches_found=$((matches_found + 1))
  fi
done

# A conservative high-entropy heuristic for SOURCE files only (not the binary
# lockfile): long runs of base64-ish characters that often indicate embedded
# secrets. Pure-hex runs of 60+ chars (e.g. sha256 digests committed as evidence)
# are EXCLUDED via the second-stage `rg -v` — a real base64 secret is not pure
# lowercase hex; hashes are not secrets.
if [ "${SEARCHER}" = "rg" ]; then
  b64="$(
    rg -n --no-heading "${EXCLUDES[@]}" \
      --glob '*.ts' --glob '*.sh' --glob '*.md' --glob '*.mmd' \
      -e '[A-Za-z0-9+/]{60,}={0,2}' "${SEARCH_ROOTS[@]}" 2>/dev/null \
      | rg -v '[0-9a-f]{60,}' || true
  )"
  if [ -n "${b64}" ]; then
    echo "POSSIBLE high-entropy blob (>=60 base64 chars, non-hex) in a source file — REVIEW:"
    echo "${b64}"
    echo
    matches_found=$((matches_found + 1))
  fi
fi

echo "---"
if [ "${matches_found}" -eq 0 ]; then
  echo "Secrets scan: 0 secrets in committed artifacts (reviewed $(date -u +%Y-%m-%d))."
  exit 0
else
  echo "Secrets scan: ${matches_found} pattern group(s) matched — investigate before commit."
  exit 1
fi
