# Code Review — Iter 2 (post-remediation)

- **Work item:** GH-32 — Cross-platform binary builds
- **Branch:** `feat/GH-32/cross-platform-binary-builds` (base: `main`)
- **Reviewer:** `@reviewer` (local mode, focused re-review)
- **Date:** 2026-07-26
- **Verdict:** **Status=PASS**

## Summary

Iter-1 returned FAIL (1 BLOCKER + 3 MAJOR + 4 MINOR + 5 NIT). Remediation landed
in three commits — `efedc82` (ci fixes: B-1, M-2, m-2, m-3, m-4, n-3), `4fc9aff`
(README m-1), `228661d` (Windows matrix scope n-4 + release.yml n-3). All eleven
iter-1 findings are **genuinely resolved** by reading the actual files (not just
the commit messages). No regressions introduced. Two non-blocking, deferrable
nits remain (cold-start delta-report incompleteness; one stale methodology line
in the MS2-E5-S4 story). The change is cleared to proceed.

PM's `bun run check` (1309 pass / 0 fail, depcruise clean) and YAML-parse
verification corroborate the structural soundness of both workflows.

## Per-finding verification

| ID | Severity | Resolved? | Evidence |
|-----|----------|-----------|----------|
| B-1 | BLOCKER | ✅ | ci.yml:201-206 — `set +e` wraps the run; `doctor_exit` captured but **never asserted == 0** (only printed, `60=EXIT_HEALTH expected`); JSON validated via `printf '%s' "$doctor_out" \| python3 -m json.tool`, `exit 1` only on invalid JSON. `head -c 100` pipefail trap removed. EXIT_HEALTH=60 confirmed as the real constant (doctor.ts:19). Step passes on exit 60 + valid JSON, fails on invalid JSON. |
| M-1 | MAJOR | ✅ | ci.yml:240-285 — placeholder replaced with a real loop: computes `delta_bytes`/`delta_mb`, prints a per-target table, handles null baseline (`no baseline yet — first measurement`), contains **no `exit 1`**. Policy line reaffirms non-blocking (DEC-6). |
| M-2 | MAJOR | ✅ | ci.yml:192-194 — `if docker run ... 'command -v bun \|\| command -v node \|\| command -v deno'; then ERROR; exit 1; fi`. Binding. Old non-binding `\|\| echo "exit=127 (correct...)"` removed. |
| M-3 | MAJOR | ✅ | Doc-sync now truthful. nonfunctional.md:82 (NFR-COMP-2) accurately says "asserts no bun/node/deno on PATH" (backed by the now-binding M-2 check) + win-x64.exe on real `windows-latest`. roadmap:109, ADR-0001:197/251, and MS2-E5-S4 AC (:55) all consistent. |
| m-1 | MINOR | ✅ | README:100-101 — `bash scripts/build-binaries.sh --target linux` + `./dist/marksync-linux-x64 --version`. Build script (scripts/build-binaries.sh:78-81,119-123) confirms `--target linux` is valid and emits exactly that path. |
| m-2 | MINOR | ✅ | ci.yml:236 — `/usr/bin/time -f "%e" ... --version >/dev/null 2>>timings`. Binary stdout discarded; `/usr/bin/time` stderr (the elapsed seconds) captured. |
| m-3 | MINOR | ✅ | ci.yml:111 — `permissions: {}` on the `binary-smoke` job (least privilege). |
| m-4 | MINOR | ✅ | ci.yml:233 + step `continue-on-error: true` — `apt-get ... \|\| { echo "warn..."; exit 0; }`. Cold-start step is now fault-tolerant. |
| n-1 | NIT | ✅ | release.yml:83 — `anchore/sbom-action@v0.24.0` (pinned; confirmed published 2026-03-20). |
| n-3 | NIT | ✅ | Zero `node -p` in `.github/` or `scripts/`. `bun -e` used at ci.yml:167, ci.yml:179, release.yml:56. |
| n-4 | NIT | ✅ | ci.yml:129-136 — Windows leg builds `--target windows` only; Linux leg keeps `--target all`. |

## No-regression sweep

- **Bun pin:** 1.2.23 everywhere in the active pipeline (ci.yml ×4, release.yml ×2; dependency-audit floats by design). `1.1.34` survives **only** as the legitimate `.benchmarks/binaries.json` historical `baseline.bun` marker and in pre-GH-32 spike/historical docs. No drift.
- **Clean-OS image:** `debian:stable-slim` in all four workflow usages; no bare `debian:slim` in `.github/`.
- **C-NO-SRC-DOMAIN:** only `src/cli/commands/router.ts` touched in `src/` — the allowed "version-embed exception": it now sources `CLI_VERSION` from `package.json` (single source of truth) instead of a hardcoded `"0.7.0"`. Improvement, not a regression.
- **Secret hygiene:** workflows reference no `CERT_PASSWORD`; release.yml's only `env:` is `GH_TOKEN: ${{ github.token }}`. run-e2e.yml's pre-existing E2E secrets are untouched by this change. No new secrets.
- **Workflow structure:** matrix and jobs intact; the remediation diff only added a `permissions:` line, a `continue-on-error: true`, and reshaped inline shell — no structural breakage (both YAMLs parse, per PM).

## Residual / new findings (non-blocking, deferrable)

1. **[low] Cold-start delta-report is half-wired.** The step is titled
   "Size/cold-start delta report" (ci.yml:240) but only **size** deltas are
   computed against `.benchmarks/binaries.json`. The cold-start measurements are
   written to a `timings` file (bind-mounted to the repo root) but are **never
   parsed, printed, or compared** against the baseline's `coldStartMs`
   (median 10 ms). Additionally `timings` is **not gitignored**, so a local run
   leaves an untracked artifact. *Fix (deferrable):* either extend the python
   read to `coldStartMs` and emit a cold-start delta row, or narrow the step
   title to "Size delta report"; add `timings` to `.gitignore`. Non-blocking
   because cold-start is "desired, not hard" (NFR-PERF-2 / DEC-4) and the
   baseline value is already committed.
2. **[info] Stale methodology prose in the MS2-E5-S4 story.** Story bullet
   (MS2-E5-S4--binary-builds.md:38) still says "(Docker, `debian:slim`)" in the
   *methodology* description. The acceptance criterion (:55) correctly states
   `debian:stable-slim` (the published tag), so the AC is truthful; only the
   narrative line is stale. *Fix (deferrable):* update the methodology bullet to
   `debian:stable-slim` for consistency.

Neither nit blocks merge or the MS-0002 release pipeline. Both can be picked up
in a follow-up chore.

## Status

- **Status:** PASS
- **Iter-1 findings resolved:** 11 / 11
- **New blocking findings:** 0
- **New non-blocking nits:** 2 (deferrable)
- **Regressions:** 0
- **Next step:** PROCEED — cleared for `dod_check` → PR. Optional chore for the
  two deferrable nits.
