---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-104-readiness-iter-1
status: complete
created: 2026-08-15T00:00:00Z
reviewer: readiness-reviewer
work_item: GH-104
iteration: 1
verdict: READY
pause_required: false
---

# Readiness Review Iteration 1

Verdict: READY
Work Item: GH-104
Date: 2026-08-15
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Verdict rationale (holistic)

A lockfile-only security hotfix with exemplary artifact convergence. Ticket → spec → test-plan → plan describe the *same* surgical change: two `overrides` entries (`fast-uri ^3.1.4` → `^3.1.5`, add `js-yaml ^4.3.1`), one regenerated `bun.lock`, one patch version bump (0.8.1 → 0.8.2), zero `src/`/`tests/` diffs, and verification carried entirely by existing blocking gates (`bun run check`, `--frozen-lockfile`, `osv-scan` CI). All three ticket ACs trace to spec ACs and onward to TCs and plan tasks with no dilution. The four known deliberate decisions were challenged and all hold up (see below). All ten facets pass; findings are nits only.

## Adversarial verification against live source / registry (read-only)

| Claim (artifact) | Live check | Result |
|---|---|---|
| `bun.lock:254` pins `fast-uri@3.1.4`; `:316` pins `js-yaml@4.3.0` (spec §24, plan facts) | `grep` on `bun.lock` | ✓ exact |
| `package.json` overrides = single `fast-uri: ^3.1.4` entry, tab-indented, lines 63-65 (spec §2.1, plan Task 1.1) | `sed -n '60,68p'` | ✓ |
| Overrides echo at `bun.lock:34-36`; consumer edges unchanged by override (ajv → `fast-uri ^3.0.1` at :176; cosmiconfig → `js-yaml ^4.1.0` at :216) (plan facts, Task 1.3/1.4) | direct inspection | ✓ all three lines |
| js-yaml never imported in `src/`; `yaml ^2.9.0` is the direct YAML lib (spec §2.1, DEC-1) | `grep -rn "js-yaml" src/` → empty; `package.json:60` `"yaml": "^2.9.0"` | ✓ |
| fast-uri is **runtime**: ajv is a direct dep and imported in `src/` (spec §2.1/§21 exposure claim) | `package.json:53` `"ajv": "^8.20.0"`; `src/app/config-errors.ts:17` imports ajv | ✓ — the runtime-chain exposure assessment is accurate |
| Single resolution of each package in the lockfile (no nested duplicates the override would miss) | `grep "fast-uri@\|js-yaml@" bun.lock` → one entry each | ✓ |
| `fast-uri@3.1.5` and `js-yaml@4.3.1` published (spec §12 assumption) | `npm view` → both resolve | ✓ |
| `osv-scan` job via `google/osv-scanner-action` reusable workflow at `ci.yml:357`; `bun install --frozen-lockfile` in every job; `engines.bun: 1.2.23` (test plan §2/§6, plan artifacts) | grep on `ci.yml` / `package.json` | ✓ |
| Local Bun 1.3.14 (test plan §6, R-TST-1) | `bun --version` → 1.3.14 | ✓ |
| `bun run check` = lint + format:check + typecheck + test + check:boundaries (plan Task 1.6) | `package.json:35` script | ✓ exact composition |
| Version references: README `--version` illustrative (already stale at 0.8.0 while actual is 0.8.1 — confirming it is not maintained); TDR-0010 0.8.x mention frozen history (spec §7.1, Task 2.2) | grep | ✓ no doc edit needed for the bump |
| Test-plan front-matter links set (GH-88 iter-1 Finding 2 class) | `links.change_spec` + `links.implementation_plan` both populated | ✓ no repeat of that defect |

## Deliberate decisions — challenged

1. **DEC-1 (js-yaml via override, not direct dep) — SOUND.** The ticket's AC is verbatim mechanism-neutral ("`bun.lock` pins js-yaml >= 4.3.1"); only the *fix direction* prose says "direct dependency", and that prose is factually wrong against the repo (js-yaml is transitive-only via cosmiconfig). Following it literally would add an unused direct dependency — strictly worse than the established fast-uri override pattern. Decision recorded in spec §15, pm-notes, and as a comment on the issue thread (verified present). No silent deviation.
2. **D-TST-1 (no permanent lockfile-pin test) — SOUND.** The regression class (lockfile downgrade/desync) is caught with better fidelity by two always-on blocking gates: `--frozen-lockfile` (manifest/lockfile disagreement) and `osv-scan` (any known-vulnerable pin, including future advisories the hardcoded floors ignore). The rot argument is genuine — spec §7.3 documents the override-removal trigger, which would orphan the test. Encoding today's CVE answer into the suite contradicts the repo's test-real-behavior strategy.
3. **DEC-2 (patch bump 0.8.2) — SOUND, with a nit (Finding 1).** Beyond-ticket scope, but transparently decision-captured, precedent-backed (GH-88: 0.8.0 → 0.8.1, manifest-only, verified), and required for the SBOM-mapping rationale to work. Behavior-neutral (`CLI_VERSION = pkg.version` dynamic read confirmed at `src/cli/commands/router.ts:38`).
4. **AC-F3-1 CI-only — SOUND.** The ticket itself sanctions it ("confirm osv-scanner clean locally if possible (**or in CI**)"); the binary is genuinely absent locally (`which osv-scanner` → not found, recorded with date). Plan Task 2.7 pins it as an explicit pre-merge DoD assertion rather than letting it evaporate — the correct treatment of a PR-only observable under this lifecycle.

## Spec ↔ ticket alignment

All three ticket ACs map 1:1 without weakening: pins (→ AC-F1-1/AC-F2-1, threshold operators preserved as ≥), `bun run check` green (→ AC-NFR2-1, all stages enumerated), CI osv-scan green on this PR (→ AC-F3-1). The fix direction is followed exactly for fast-uri (override bump, transitive-only preserved) and corrected-with-provenance for js-yaml (DEC-1). No invented behavior scope; the only addition (version bump) is Finding 1. Non-goals crisply prevent the tempting shortcuts this ticket class invites: no scanner exclusion, no policy downgrade, no mass dependency refresh, no CI wiring change (NG-1..NG-5).

## Test plan ↔ spec/AC coverage

§3.1 maps every AC to ≥1 TC; the plan's own AC-coverage check (§Test Scenarios) mirrors it exactly — I re-derived the mapping independently and found no orphan AC and no orphan TC. Tier table correctly declares every tier "regression only" with a stated reason; E2E-live correctly N/A. D-TST-1 is documented as a weighed rejection with the rejected artifact named, not an omission.

## Plan ↔ spec/test-plan feasibility

Two phases are the right granularity; each commit is single-purpose and suite-green at its boundary. The plan's load-bearing facts (lines 254/316/34-36/176/216, no version echo in `bun.lock`, dynamic `CLI_VERSION`, tab indentation) were all verified above — the coder will not hit a surprise the plan denied. Abort criteria A-1..A-5 are concrete, each names the failure output, and each forbids the dangerous improvisation (range widening, partial remediation, silent scope-in) with correct escalation to PM. Rollback (`git restore` / `git revert`) is genuinely clean for a two-file commit. Bun-skew risk (R-TST-1) is honestly framed as detection + retry rather than prevention.

## Findings

### 1. [nit] cross_artifact_consistency — chg-GH-104-spec.md §15 DEC-2 vs ticket GH-104 (no version-bump mention)

**Gap:** The 0.8.1 → 0.8.2 bump is scope beyond the ticket's stated AC/fix-direction. It is decision-captured and precedent-backed, so not a readiness blocker, but the human reviewer's only in-repo visibility is the spec decision log — the ticket thread carries the DEC-1 comment but not DEC-2.
**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Optional — add one line to the PR body (phase 11 template) stating the patch bump rides along per DEC-2/GH-88 precedent, so the ticket-scoped change is transparent at review time. No artifact rework required.

### 2. [nit] test_traceability — chg-GH-104-test-plan.md §10 (Test Execution Log) vs TC-DEPS-005

**Gap:** §10 says the log is "populated during delivery phases 6–10", but TC-DEPS-005 (AC-F3-1) is only observable at lifecycle phase 11 (PR) per its own definition and plan Task 2.7. As written, a literal-minded executor would leave the row "Pending" through dod_check and have no instruction that it is completed pre-merge on the PR.
**Suggested remediation target phase:** test_planning
**Suggested fix:** Add one sentence to §10: "TC-DEPS-005 is completed at PR creation (lifecycle phase 11) — assert the `Vulnerability scan (osv-scanner)` check is green with 0 findings before merge; its row is the last filled." Optional; plan Task 2.7 already carries the load-bearing instruction, so delivery proceeds correctly either way.

### 3. [nit] plan_coverage — chg-GH-104-plan.md Abort A-2 retry path (Bun alignment step)

**Gap:** A-2's retry says "align local Bun to the 1.2.x line (CI pin / `engines.bun`), regenerate" without naming the mechanism (e.g., `bun upgrade --to 1.2.23` / mise/asdf pin / `bunx --bun=…`), and A-3 references "the same retry path". A coder hitting R-TST-1 skew mid-execution must guess how to align Bun on this machine.
**Suggested remediation target phase:** delivery_planning
**Suggested fix:** One clause naming the alignment mechanism used in this dev environment (per doc/guides/dev-environment.md). Optional — the STOP-and-report guardrail already prevents wrong improvisation; this only shortens the retry loop.

## What passes (confirmation)

- **All ten DoR facets PASS.** Zero contradictions across ticket → spec → test-plan → plan on versions, thresholds, mechanisms, file sets, or gate definitions.
- **DoD defined:** spec §4.1 (5 measurable KPIs) + §17 (5 Given/When/Then ACs, each linked) — clear acceptance bar, including the PR-pinned AC-F3-1.
- **Decision routing correct:** DEC-1/DEC-2 change-scoped in spec §15 + pm-notes + issue thread; D-TST-1 in pm-notes + test plan §7.1. Nothing precedent-setting enough to warrant `doc/decisions/**` (the override pattern already exists — this change *follows* it, doesn't set it).
- **plan_doc_update_coverage:** both phases explicitly list "System docs: none" with the justification (dependency versions not tracked in current-truth docs; pm-notes `doc_risks`) and route phase-7 reconciliation to `@doc-syncer` regardless. Explicit no-op is coverage, not a gap.
- **plan_code_area_coverage:** per-phase code areas enumerated (`package.json` overrides / `bun.lock` / `package.json` version) plus an explicit changed-file-set assertion (Tasks 1.4/2.5) — blast radius is fully explicit.
- **No weakened ACs, no untestable ACs, no missing verifications** — the regression-net-only strategy is justified, not assumed, and every "existing gate covers it" claim was verified to point at a real, blocking mechanism.

## Next remediation target (reopen)

**None.** Verdict is **READY** — delivery may proceed. The three findings are nits and non-blocking; the author may optionally fold them in, but no artifact rework is required and no phase needs reopening.
