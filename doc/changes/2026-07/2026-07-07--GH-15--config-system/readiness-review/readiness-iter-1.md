---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski-pub-gh/marksync-for-confluence | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-15-readiness-iter-1
status: complete
created: 2026-07-07T06:17:00Z
work_item: GH-15
iteration: 1
verdict: NOT_READY
pause_required: false
reviewer: readiness-reviewer
---

# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-15
Date: 2026-07-07
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

> Overall: 9 of 10 facets PASS. The single FAIL is on `cross_artifact_consistency` — the
> highest-value facet — driven by one major finding (hierarchy module tier/placement) plus
> two minor cross-artifact mismatches. No pause flag; no `needs_human_input` decision.

## Context

Adversarial critique of the GH-15 artifact set (spec + test-plan + plan) against the
authoritative story `MS2-E2-S2--config-system.md` (8 deliverables, 7 ACs), GitHub issue #15,
`.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`, ADR-0010 (C-5 squash-only), the
live `src/domain/errors.ts` (12-kind union + `assertNeverMarkSyncError`), `src/domain/result.ts`,
`doc/overview/architecture-overview.md` (dependency-direction matrix), and `doc/spec/features/feature-cli.md`.

What passed (highlights — no findings):

- **Spec ↔ story alignment** is tight. All 8 story deliverables map to F-1..F-8 / G-1..G-7;
  all 7 story ACs map to AC-F3-1..AC-F8-1 (Appendix A traceability). No scope drift or
  invention; CEO-resolved Q1 (yaml) → DEC-1, Q2 (squash-only) → DEC-2 honored end-to-end.
- **AC testability** is strong: every AC is Given/When/Then and covered by ≥1 traceable TC.
- **Plan phasing** is sound: Phase 2 (`InvalidConfig` union + `assertNeverMarkSyncError`) lands
  BEFORE Phase 4 (loader) per NFR-3/RSK-2 — the critical ordering constraint is satisfied.
- **Tier rules** are respected in the plan: `src/domain/config/**` imports nothing tiered;
  `src/cli/commands/init.ts` imports `#app/*` only; Phase 2 keeps domain free of any `ajv`
  import by introducing a plain-data `ConfigAjvError` mapped in the app tier (clean).
- **Over-mocking guardrail** honored: ajv/yaml exercised with real fixtures, not mocked; the
  sole permitted mock is the FS-spy in TC-SELECT-008 used to *prove absence* of I/O.
- **DEC-3/DEC-4** honored: `ConfigError` = `InvalidConfig` arm + narrowed `Result` + union
  updated with `never`-check together; `selectFiles` takes `string[]` (pure loader).
- **OQ-TP-1/2/3 and the glob-matcher choice** are acceptable delivery-time specifications —
  none blocks an AC (AC-6 does not require an init overwrite policy; missing-file semantics
  and the latency enforcement policy are non-blocking delivery details).

## Findings

### 1. [major] cross_artifact_consistency — test-plan §4 layout + TC-HIER-001..005 vs plan Phase 7

**Artifact**: `chg-GH-15-test-plan.md` §4 (Test-file layout, line 185) and TC-HIER-001..005
Target Layer (lines 1076, 1101, 1125, 1152, 1177) and §7 automation table (line 1309).
**Contradicts**: `chg-GH-15-plan.md` Phase 7.1/7.3 (lines 534, 544, 557, 563, 726).

**Gap**: The intended-hierarchy module is placed in **two different tiers** across artifacts:

| Artifact | Source module | Test path |
|---|---|---|
| Plan (Phase 7) | `src/domain/config/hierarchy.ts` (domain tier) | `tests/unit/domain/config/hierarchy.test.ts` |
| Test plan (§4 + TC-HIER-* + §7) | `src/app/hierarchy.ts` (application tier) | `tests/unit/app/hierarchy.test.ts` |

The plan places hierarchy in the **domain** tier (consistent with
`doc/overview/architecture-overview.md` component table: "Hierarchy planner | domain"). The
test plan places both the source and the tests in `src/app/` / `tests/unit/app/`. The test
plan's own §4 note ("the `tests/` path mirrors `src/` by convention") is violated by its own
TC-HIER-* targets: a `src/domain/` module must mirror to `tests/unit/domain/`, not
`tests/unit/app/`. All 5 TC-HIER scenarios + the §7 automation row hardcode the wrong path.

This is not a hedge — the test plan's §4 lists hierarchy definitively under `src/app/`, while
the plan's Phase 7 commits it to `src/domain/config/`. The `@coder` cannot satisfy both.

**Suggested remediation target phase**: test_planning

**Suggested fix**: In `chg-GH-15-test-plan.md`, correct the hierarchy placement to match the
plan and architecture:
- §4 layout row: `src/app/hierarchy.ts (or config)` → `src/domain/config/hierarchy.ts`,
  test path `tests/unit/app/hierarchy.test.ts` → `tests/unit/domain/config/hierarchy.test.ts`.
- TC-HIER-001..005 "Target Layer / Location": all five → `tests/unit/domain/config/hierarchy.test.ts`.
- §7 automation table row for `TC-HIER-001..005`: file → `tests/unit/domain/config/hierarchy.test.ts`,
  command → `bun test tests/unit/domain/config/hierarchy.test.ts`.

(Plan Phase 7 is architecturally correct; no plan change required.)

---

### 2. [minor] cross_artifact_consistency — test-plan §4 + TC-INIT-001..003 vs plan Phase 8 (init helper filename)

**Artifact**: `chg-GH-15-test-plan.md` §4 (line 186), TC-INIT-001..003 Target Layer (lines
1202, 1228, 1252), §7 automation table (line 1310).
**Contradicts**: `chg-GH-15-plan.md` Phase 8.1/8.4 (lines 580, 594, 609, 615, 727).

**Gap**: Same tier (application), but the init config-writing helper has two different
filenames across artifacts:

| Artifact | Helper module | Test path |
|---|---|---|
| Plan (Phase 8) | `src/app/config-template.ts` | `tests/unit/app/config-template.test.ts` |
| Test plan (§4 + TC-INIT-* + §7) | `src/app/init-config.ts` | `tests/unit/app/init-config.test.ts` |

Both are in the correct tier, so this is a naming drift, not a tier violation — but the
TC-INIT-* Target Layer paths and the §7 automation row will be stale if delivery follows the
plan's filename (or vice versa).

**Suggested remediation target phase**: test_planning

**Suggested fix**: Align on one filename. Preferred (matches plan): rename the test-plan
helper references from `init-config.ts` / `init-config.test.ts` to
`config-template.ts` / `config-template.test.ts` in §4, TC-INIT-001..003 Target Layer, and
the §7 automation table. (Either direction is acceptable as long as both artifacts agree.)

---

### 3. [minor] decision_capture / plan_doc_update_coverage — glob-matcher dependency (picomatch) not routed through allowed-dependency-list extension

**Artifact**: `chg-GH-15-plan.md` §"Open questions" (lines 80–88) and Phase 1 task 1.2
(lines 215–219); `chg-GH-15-spec.md` §8.4 (line 188) and NFR-7 (line 204).
**Gap**: The spec makes a definitive dependency-envelope statement — §8.4: "The runtime
dependencies introduced are `yaml` … and `ajv`"; NFR-7: "`yaml` and `ajv` are runtime deps on
the allowed list" — i.e. **two** deps, both pre-approved. The plan's Phase 1 contemplates a
**third** runtime dependency (`picomatch`) that is (a) not on `typescript.md`'s
allowed-dependency list and (b) not mentioned in the spec's §8.4/NFR-7. The plan acknowledges
the list gap ("no glob library is pre-approved") and offers a zero-dep hand-roll fallback
(`src/shared/glob.ts`), but:

- If `picomatch` is chosen, `typescript.md`'s allowed-dependency list must be extended — yet
  Phase 9's doc-update list does not include that extension (it only optionally refreshes the
  `MarkSyncError` illustration).
- Adding a new runtime dep to a repo governed by the "minimal dependencies" rule
  (typescript.md) is precedent-setting and would normally warrant a TDR — none is proposed.

This is a cross-artifact tension (spec says yaml+ajv only; plan says "maybe picomatch"), not
a blocker (the hand-roll avoids the dep entirely).

**Suggested remediation target phase**: delivery_planning

**Suggested fix** (either):
- Plan default: commit to the `src/shared/glob.ts` hand-roll for MS-0002 (no new dep), making
  the spec's yaml+ajv-only envelope accurate. Defer picomatch to a future TDR if `**`
  semantics prove insufficient. OR
- If picomatch remains an option: add a Phase 9 task to extend `typescript.md`'s
  allowed-dependency list AND file a TDR (precedent) when the dep is introduced; and add a
  spec OQ acknowledging the contingent third dep so §8.4/NFR-7 are not definitive-but-wrong.

---

## Decision Routing

- All findings are `change`-scoped — no `system`/precedent-setting decision requires a new
  ADR at this gate (Finding 3 notes that *if* picomatch is chosen, a TDR + allowed-list
  extension would be needed, but that is a delivery-time contingency, not a current blocker).
- No `needs_human_input` — `Pause Required: no`.

## Next Steps

On `NOT_READY`, `@pm` reopens **`test_planning`** (Findings 1 and 2 are test-plan fixes) and
optionally **`delivery_planning`** (Finding 3 is a plan refinement). After the test-plan
author corrects the hierarchy tier/placement and aligns the init-helper filename, and the
plan-writer resolves the glob-dep routing, re-run `/check-readiness GH-15` (iteration 2).

The blocking gap is narrow: **Finding 1 alone** causes the `cross_artifact_consistency` FAIL.
Findings 2 and 3 are minor and could be bundled into the same revision pass.
