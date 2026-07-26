# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-32
Date: 2026-07-26
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

## Iter-1 Remediation Verification (adversarial — confirmed REAL, not cosmetic)

### BLOCKER #1 (C-NO-SRC + PLN-DEC-3 + AC-BUILD-1/DM-3 contradiction) — RESOLVED ✓
Verified in plan commit `61253bd` (101+/57-; substantive rewrite, not a one-line tweak).

1. **C-NO-SRC → C-NO-SRC-DOMAIN** (plan §Constraints, lines 139-145): relaxed to permit exactly ONE surgical `src/` edit (`src/cli/commands/router.ts` version-source wiring), tied to spec G-7/§16 "trivial version-embed exception." Confirmed consistent across every phase AC (Phase 1:282, Phase 2:354, Phase 3:429, Phase 4:489, Phase 5:558, Phase 6:633), Phase 6 task 6.5 scope check (617-622), Code-area coverage table (787-801), and Definition of Done (829). Every prior "zero `src/` change" / `git diff` assertion now reads "zero `src/` DOMAIN-LOGIC change; only `src/` touch = Phase 1 `router.ts`." ✓
2. **Phase 1 task 1.3 NAMES the exact edit** (plan lines 240-263): replaces the hardcoded `export const CLI_VERSION = "0.7.0"` with
   ```ts
   import pkg from "../../../package.json" with { type: "json" };
   export const CLI_VERSION = pkg.version;
   ```
   The no-op `--define MARKSYNC_VERSION` fallback is gone; the task explicitly documents WHY the prior mechanism was a no-op (`router.ts` never read that env var). ✓
3. **Phase 6 version-bump consistency** (task 6.1, lines 595-600): restated as a single-source `package.json#version` edit that propagates via the Phase 1 wiring — no second edit anywhere. ✓
4. **Mechanism viability — VERIFIED AGAINST IN-REPO PRECEDENT (decisive):**
   - `src/infra/confluence/client.ts:10` already contains `import pkg from "../../../package.json" with { type: "json" };` — the **identical** import form, **identical** relative depth (`src/infra/confluence/` and `src/cli/commands/` are both 3 levels under root), and **identical** `with { type: "json" }` import-attribute syntax the plan proposes for `router.ts`. This file IS under `src/` and IS included in `tsconfig.json#include` (`src/**/*.ts`), so `tsc --noEmit` demonstrably passes with this exact pattern. The `rootDir: "./src"` concern is empirically refuted by this precedent.
   - `tsconfig.json:22` confirms `resolveJsonModule: true`; `package.json#engines.bun` = `1.2.23`, `version` = `0.7.0` (lines 3, 10). ✓
   - `src/cli/commands/router.ts:40` confirmed to currently hardcode `CLI_VERSION = "0.7.0"` with the stale comment "Kept in lock-step with `package.json` until a runtime version source is wired" (lines 36-38) — exactly as the plan describes. ✓
   - **Import-path math verified:** `src/cli/commands/router.ts` → `../../../package.json` resolves to repo-root `package.json` (3 dirs up: `commands` → `cli` → `src` → root). ✓
5. **No test regression:** `tests/unit/cli/commands/router.test.ts:29-30` already asserts `expect(CLI_VERSION).toBe(packageJson.version)` (the drift-prevention test added in GH-30 review F-5). Post-wiring both sides read the same `package.json`; post-bump both become `0.8.0` — the test stays green and becomes trivially-correct (single source of truth). ✓
6. **dep-cruiser boundaries:** importing root `package.json` from `src/cli/` triggers NONE of the 4 forbidden rules in `.dependency-cruiser.cjs` (the `to:` patterns are `src/domain/` and `src/infra/`; root `package.json` matches neither). `check:boundaries` stays green. ✓

The BLOCKER is fully and correctly resolved. The triangle {C-NO-SRC-DOMAIN, PLN-DEC-3, AC-BUILD-1/DM-3} is now mutually satisfiable, and the proposed mechanism is precedent-backed by working code in the same codebase.

### MINOR #2 (test-plan §1.1 TC count) — RESOLVED (residual NIT, see Finding 1) ⚠️
Verified in commit `082f3e1`. §1.1 now reads "Nine E2E release-tier test cases covering:" (was "Ten"). §3.1 (authoritative traceability table) and §5.1 (Scenario Index) both correctly list 9 TCs mapping to 10 ACs (TC-REL-001 covers AC-COMP-1 + AC-REL-1). Substantive count is fixed. **Residual:** the enumerated list under "Nine ... covering:" still items 1–10 (item #10 "Release matrix correctness" was not merged into item #6); see Finding 1.

### MINOR #3 (TC-RUN-001 doctor exit-code assertion) — RESOLVED ✓
Verified in commit `082f3e1`. TC-RUN-001 step 5 (line 226) now asserts **valid JSON output**; step 6 (line 227) records the actual exit code per the EXIT_HEALTH=60 contract and explicitly says "Do NOT hard-assert exit 0." Expected Outcome (line 234) and Pass/Fail criteria (line 239) are aligned. Confirmed `EXIT_HEALTH = 60` at `src/cli/output/exit-codes.ts:72`. Plan Phase 2 task 2.2 (lines 323-333) matches: asserts JSON validity, records exit code. Cross-artifact alignment confirmed.

### MINOR #4 (spec §17.1 DoD validation boundary) — RESOLVED ✓
Verified in commit `4d1b2e8` (2-line addition). Spec §17.1 (line 327) now carries an explicit "Validation boundary — release-triggered ACs (accepted, not a gap)" paragraph: AC-REL-1 + AC-COMP-1 receive **structural validation at delivery** (workflow YAML exists, well-formed, correct matrix + artifact set, `ci.yml` YAML-lint green); full e2e (workflow runs, GitHub Release created, artifacts attached) is deferred to the first real `v*` tag post-merge. The other 8 ACs are validated end-to-end at delivery. Spec and plan now agree on the DoD bar for these 2 ACs.

### NIT #5 (alpine citation) — RESOLVED ✓
Verified in commit `082f3e1`. Test-plan §6 (line 546) now reads "out of scope per spec §7.3" (was "NG-8"). §7.3 ("Deferred / Maybe-Later") is the correct home for the alpine/musl item.

### NIT #6 (SBOM action pin) — RESOLVED ✓
Verified in plan commit `61253bd`. Phase 5 task 5.3 (lines 532-539) now pins `anchore/sbom-action@v0.24.0` with rationale ("latest stable release at plan time; released 2026-03-20; bundles Syft 1.42.3") and an explicit "Do NOT use the floating `@v0` major tag" note tied to DEC-1 determinism. The pin is recorded in a workflow-comment instruction so the next bump is intentional.

## Findings

1. [nit] cross_artifact_consistency — test-plan#§1.1 In Scope (residual from iter-1 MINOR #2)
   Gap: §1.1 opens "Nine E2E release-tier test cases covering:" but the immediately-following enumerated list still items 1–10 (item #10 "Release matrix correctness" is the AC folded into TC-REL-001 alongside item #6). The count word was corrected but the list was not merged, so a reader sees "Nine … covering: 1…10" — internally inconsistent on its face. The authoritative tables (§3.1 traceability, §5.1 Scenario Index) are correct (9 TCs → 10 ACs), so this is presentation, not a substantive coverage gap.
   Suggested remediation target phase: test_planning (optional; can also be cleaned up at delivery/review)
   Suggested fix: Either merge items #6 and #10 into a single bullet ("Release workflow artifact assembly + matrix correctness (binaries + SHA256SUMS + SBOM; macOS excluded)"), or rephrase the header to "Nine E2E release-tier test cases covering the 10 ACs below (TC-REL-001 traces to two ACs)." Non-blocking.

## What Passed (briefly)
- All 10 DoR facets PASS. The single iter-1 BLOCKER is resolved with a mechanism verified against working in-repo precedent (`src/infra/confluence/client.ts:10`), not a theoretical claim.
- The version-source wiring (the critical path flagged in the iter-1 review) is confirmed viable end-to-end: `resolveJsonModule: true`, correct relative path, Bun inlines JSON imports at build time (dev + `--compile`), dep-cruiser boundaries unaffected, and the existing drift-prevention test stays green through both the wiring and the 0.7.0 → 0.8.0 bump.
- All three remediation commits are substantive (plan 101+/57-; test-plan 15 lines; spec 2+), not cosmetic word-swaps — with the exception of the §1.1 enumerated list (Finding 1, NIT).
- No NEW blocking issues introduced by the remediations. The relaxed C-NO-SRC-DOMAIN is precisely scoped (one named file, one named task, spec carve-out cited) and cannot be read as a blanket `src/` permission.
- Iter-1's non-blocking strengths all carry forward: PM hazards (DEC-1 Bun 1.2.23, DEC-2 `debian:stable-slim`) encoded consistently; reuse-not-rewrite of the GH-13 skeleton + signing recipe; CI conventions mirrored; secret hygiene (`$CERT_PASSWORD` name only); `.benchmarks/` commit-tracked / `dist/` gitignored; all 10 ACs traced to phases + TCs; doc-update + code-area coverage explicit.

## Gate Result
**READY.** Delivery may proceed. The single residual NIT (Finding 1) is non-blocking and can be cleaned up during delivery or at the review gate; it does not affect AC coverage, test traceability, or phase executability.
