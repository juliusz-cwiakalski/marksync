---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-88-readiness-iter-1
status: complete
created: 2026-07-26T22:50:00Z
reviewer: readiness-reviewer
work_item: GH-88
iteration: 1
verdict: READY
pause_required: false
---

# Readiness Review Iteration 1

Verdict: READY
Work Item: GH-88
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

## Verdict rationale (holistic)

This is an exceptionally well-aligned small bug-fix. Ticket → spec → test-plan → plan converge on a single surgical change: swap the credential-probe path constant v2 → v1, align the adjacent comments/cause-string/test URL literals, add one new unit test proving the v1 body narrows to `AccountIdentity`, record the reversal as TDR-0010, and bump 0.8.0 → 0.8.1. No type, contract, envelope, exit-code, or secret-isolation change. All ten DoR facets pass; the two self-flagged items (test-plan §7.2 mapping gap; current-truth doc deferral) are correctly classified as non-blocking and are not blockers on re-examination either.

## Adversarial verification against live source (read-only)

`rg "user/by-me" src/ tests/` returns **19 references**. The plan addresses every one:

| # | Location | Plan task | Verified |
|---|----------|-----------|----------|
| 1 | `src/app/credentials.ts:19` (constant value) | 1.1 (rename + value swap) | ✓ |
| 2 | `src/app/credentials.ts:172` (cause string) | 1.2 | ✓ |
| 3 | `src/domain/credentials.ts:25` (AccountIdentity doc comment) | 1.3 | ✓ |
| 4 | `tests/unit/app/credentials.test.ts:216` (test name) | 1.4 | ✓ |
| 5 | `tests/unit/app/credentials.test.ts:221` (URL assertion) | 1.4 | ✓ |
| 6 | `tests/integration/credentials.test.ts:81` (URL assertion) | 1.6 | ✓ |
| 7–14 | `tests/integration/cli/commands/doctor.test.ts` lines **115, 168, 229, 264, 295, 330, 371, 450** (8 route handlers) | 1.7 (all 8) | ✓ |
| 15 | `tests/e2e-mock/mock-confluence-server.ts:169` (route handler) | 1.8 | ✓ |
| 16–17 | `tests/e2e-mock/mock-smoke-probe.test.ts:20–21` (test name + fetch URL) | 1.9 | ✓ |
| 18–19 | `tests/e2e-mock/create-flow.test.ts:145,147` (comment + path filter) | 1.10 | ✓ |

Plus Phase 3 task 3.3 re-verifies `rg "user/by-me" src/ tests/` returns empty (RSK-P1 guard). No stale-reference escape path remains.

Other live-source checks:
- `USER_BY_ME_PATH` is referenced only at `src/app/credentials.ts:19` (declaration) and `:95` (sole use). Plan's RSK-P2 "no external importer" claim is correct.
- Inception evidence `doc/inception/integration-scenarios/01-authentication.md:39` is verbatim as cited ("undocumented/unstable … returned 400 in the spike"; v1 `/user/current` "proven live" 200 with `accountId`+`displayName`+extras). Spec/test-plan/plan represent the evidence faithfully.
- Decision index `doc/decisions/00-index.md` tops out at **TDR-0009** (per-type sequence). **TDR-0010** is the next free per-type slot. OQ-1 / OQ-TST-1 resolution is correct.
- `src/cli/commands/router.ts:38` reads `export const CLI_VERSION = pkg.version;` — i.e. **derived at runtime from `package.json`**, not a hardcoded literal. The plan's hedge ("if CLI_VERSION drifts — verify, do not assume") is over-cautious but harmless; bumping `package.json` to 0.8.1 will flow through automatically. See Finding 3.

## Spec ↔ ticket alignment (probe)

- **Problem captured exactly**: spec §2.2 / §3 quote the production 400 body verbatim (`INVALID_REQUEST_PARAMETER` for `generic-content-type`) and the false-fail chain `AuthUnreachable → credentials fail → DOCTOR_FAIL → EXIT_HEALTH (60)`. Matches ticket body.
- **Chosen fix (option 1) captured**: spec DEC-1 / F-1 / §5.1.
- **Rejected alternative (option 2, degrade-to-warn) addressed with sound reasoning**: spec DEC-1 rationale — "does not actually validate credentials and masks genuinely bad tokens". Sound: a `warn` on a 4xx-class auth failure defeats the credential check's purpose (genuinely bad tokens must still hard-fail). The chosen fix preserves the auth-outcome classification contract (F-2) AND eliminates the false-negative. Option 1 dominates option 2 on the ticket's own terms.
- **No scope creep**: NG-1..NG-5 + §7.2 [OUT] are crisp. The change touches exactly: 1 src constant value + 1 constant rename + 2 comment/cause-string edits + 1 new unit test + N test URL-literal flips + 1 TDR + 1 patch bump. Spec scope and plan scope are identical.

## AC quality (probe)

AC-1..AC-8 are all Given/When/Then, all link to ≥1 F-/NFR-/DM-/DEC- ID, and are independently testable. No overlap. AC-7 (full suite green) and AC-8 (TDR exists + indexed) are meta/checklist-style but still concretely testable (`bun run check` exit 0; TDR file + index entry present).

## Test plan ↔ spec/AC coverage (probe)

Every AC has ≥1 traceable TC (§3.1 mapping verified). Tier placement is correct per `.ai/rules/testing-strategy.md`:
- Unit (`bun:test`, stub `fetch`) for pure provider logic — AC-1..AC-5.
- Integration (`bun:test` + `Bun.serve()` mock) for adapter-boundary correctness — AC-1..AC-3, AC-5, AC-6.
- E2E-mock (`bun:test` + stateful node:http mock) for full-pipeline regression + DEC-1 invariant — AC-3 (validateCredentials never called during pipeline run).
- Manual checklist for the decision-record artifact — AC-8.

No over-mocking risk: the integration tier uses real HTTP against `Bun.serve` (not stubbed fetch), satisfying the strategy doc's "Mocks are allowed for adapter boundary tests" rule. INV-SEC-1 (AC-5) is validated at **Integration** level (TC-AUTH-012 unit + TC-DOCTOR-015 integration capture-and-grep), guardrail-compliant.

## Plan ↔ spec/test-plan feasibility (probe)

- **Green-per-phase viable**: the plan's "Resolved design point" correctly identifies that the src swap and the URL-literal tests are atomically coupled — flipping `USER_BY_ME_PATH` alone breaks 19 test references transiently. Phase 1 merges them into one commit so the suite is green at every commit boundary. This is the correct call (matches `chg-GH-30-plan.md` house style for typecheck+test-green commits).
- **Phase 2 (TDR) genuinely separable**: docs-only, no test-suite impact. ✓
- **Phase 3 (version bump + gate) genuinely separable**: `package.json` only. ✓
- **Constraints honored**: GH-17 history frozen (NG-5); inception doc cited not edited (§7.2 [OUT]); no type/contract/envelope/exit-code/check-id change (G-3/NFR-3); INV-SEC-1 untouched (NFR-2). All verifiable.

## Evidence integrity & TDR-reversal framing (probe)

- The TDR is framed as **taking the deferred v1 fallback** (GH-17 DEC-5 / NG-8: "add it only if a tenant/credential lacks v2") because production confirmed the v2 breakage the inception spike already observed — **not** a retroactive condemnation of GH-17. RSK-3 explicitly mitigates the misread risk; spec NG-5 + plan Constraints keep the GH-17 docs frozen. Framing is sound and historically honest.
- The rejected-alternative reasoning (degrade-to-warn) is technically correct, not hand-wavy.

## Findings

### 1. [minor] test_traceability — chg-GH-88-test-plan.md §7.2 (Integration Tests automation table) vs §5.2 TC-URL-003

**Gap:** §7.2 "Integration Tests" automation-mapping table lists TC-DOCTOR-013/014/015/016/022 with URL-update notes but **omits TC-DOCTOR-017/018/019/020** (the four additional doctor references at lines 295/330/371/450). §5.2 TC-URL-003 scenario details enumerateates all 8 references correctly. So the test plan internally disagrees on whether the four extra doctor references are tracked as discrete TCs in the automation table.

**Why non-blocking:** §5.2 is the authoritative scenario-detail section and is correct (all 8 lines verified against live source). The plan's task 1.7 and TC-URL-003 cover all 8 references regardless. The §7.2 omission is a mapping-table cosmetic gap, not a coverage gap — no AC loses traceability, no reference goes unfixed.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Add four rows to §7.2 for TC-DOCTOR-017/018/019/020 mirroring the 013–016 pattern (`Existing – Update | Mock route path line 295/330/371/450: v2→v1`), OR add a single catch-all row `TC-DOCTOR-017..020 | … | Existing – Update | Mock route paths lines 295/330/371/450: v2→v1 (per TC-URL-003)`. Optional — delivery proceeds correctly either way because §5.2 + plan task 1.7 are the load-bearing references.

### 2. [nit] cross_artifact_consistency — chg-GH-88-test-plan.md front matter `links.implementation_plan: null`

**Gap:** Test-plan front matter (line 16) declares `implementation_plan: null`, but the plan exists (commit f60d821, `chg-GH-88-plan.md`). Stale link.

**Why non-blocking:** cosmetic front-matter value; the plan is cross-referenced correctly everywhere else (spec §16, plan `links.test_plan`, plan "Artifacts and Links" table).

**Suggested remediation target phase:** test_planning
**Suggested fix:** Set `links.implementation_plan: ./chg-GH-88-plan.md`.

### 3. [nit] plan_coverage — chg-GH-88-plan.md task 3.1 (CLI_VERSION hedge)

**Gap:** Task 3.1 hedges "If `src/cli/commands/router.ts` carries a `CLI_VERSION` constant that must mirror `package.json` … update it to 0.8.1; otherwise no router change." Live source shows `CLI_VERSION = pkg.version` — **derived at runtime from package.json**, so it cannot drift; the version bump in `package.json` flows through automatically. The hedge implies a possible manual edit that is not actually required.

**Why non-blocking:** the hedge errs toward verification ("verify, do not assume") — the worst case is the coder confirms no router edit is needed, which is correct. No wrong action is instructed.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Refine task 3.1 to state plainly: "`src/cli/commands/router.ts:38` derives `CLI_VERSION = pkg.version` at runtime, so bumping `package.json` to 0.8.1 propagates automatically — no router.ts edit required. (No-op verification: `rg "0\.8\.0" src/ package.json` returns empty after the bump.)"

## Pre-existing drift noted but OUT OF SCOPE (not GH-88 findings)

- `doc/decisions/00-index.md` lists **TDR-0009** as `Proposed`, but spec §2.1 / plan "Artifacts and Links" cite it as the authoritative source for the `DOCTOR_FAIL → EXIT_HEALTH (60)` mapping. TDR-0009's containing PR (#85 / GH-30) has merged to main; per the index's own migration note ("flipped from Proposed to Accepted when the containing PR merges"), TDR-0009 should be `Accepted`. This is pre-existing index drift, independent of GH-88, and not introduced by this change. Flagged here for awareness only; **not** a GH-88 DoR finding.

## What passes (confirmation)

- **All ten DoR facets PASS.** Spec, test-plan, and plan converge with zero contradictions on the contract surface (types, exit codes, envelope, check ids, INV-SEC-1).
- **DoD defined**: spec §4.1 (5 measurable KPIs) + §17 (8 testable Given/When/Then ACs) — per `doc/templates/change-spec-template.md`, these are the DoD-bearing sections. Delivery has a clear acceptance bar.
- **Decision routing correct**: DEC-1 is change-scoped in spec §15; the precedent-setting TDR-reversal is correctly routed to `doc/decisions/TDR-0010-…` (Phase 2, delegated to `@decision-advisor`). No ADR needed — this reverses a TDR, not an ADR.
- **Doc-update routing correct**: the four current-truth docs citing v2 (`glossary.md:45`, `ubiquitous-language.md:146,148`, `feature-cli.md:71,107,125`, `nonfunctional.md:74`) are **explicitly listed** in the plan's "Known doc-risk" section with line numbers and **correctly routed to lifecycle phase 7** (`system_spec_update` / `@doc-syncer`), not phase 6 delivery. This satisfies `plan_doc_update_coverage` (docs made visible + correctly routed) and matches `AGENTS.md` phase definitions. The deferral is the right call, not a gap.
- **Scope discipline**: change is genuinely small (path constant + rename + comments/cause-string + test URLs + 1 new unit test + TDR + patch bump). No balloon.
- **Evidence integrity**: inception-spike claim (v2 broken, v1 proven) is accurately represented; TDR-reversal framing (taking the deferred fallback, not condemning GH-17) is sound; GH-17 history stays frozen (NG-5).

## Next remediation target (reopen)

**None.** Verdict is **READY** — delivery may proceed. The three findings above are minor/nit and non-blocking; the author may optionally fold them in during delivery, but no artifact rework is required and no phase needs reopening.
