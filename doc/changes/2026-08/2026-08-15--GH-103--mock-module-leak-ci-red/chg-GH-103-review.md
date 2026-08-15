# Code Review — GH-103 (Iteration 1)

**Status: PASS**

- **Branch**: `fix/GH-103/mock-module-leak-ci-red` (main @ 1ebc664 → HEAD d2adfb4)
- **Reviewer**: reviewer agent (ADOS phase 8, review_fix)
- **Reviewed at**: 2026-08-15
- **Diff scope**: 11 files — 2 src (`doctor.ts`, `repair-state.ts`), 3 tests (2 rewrites + 1 new guard), 1 rules doc (`.ai/rules/testing-strategy.md`), 5 change artifacts
- **Verification inputs**: full diff read; ticket GH-103 (authoritative); spec §17 / plan phases 1–5; repo review config (`.ai/agent/code-review-instructions.md`, `.ai/rules/typescript.md`); supplied evidence (full suite 1314/0, ordered run 267/0, guard 4/0, `bun run check` green)

## Summary

The delivered code matches the spec and plan precisely. The DI seams are additive-only (optional second parameter, `deps.X ?? X` fallback to the real static import, zero production-caller changes); both unit test rewrites preserve test IDs, fixtures, and assertion semantics like-for-like with `mock.module` fully deleted; the scanning guard is self-match-safe by construction (concatenation-built needle) with sound matcher self-tests and useful `file:line` failure output; and the rules ban lands in both the over-mocking guardrail and the anti-patterns list without contradicting the "Mocks are allowed" guidance (`Bun.serve`/fault-injection mocks remain sanctioned; only `mock.module` is banned). All scope assertions hold: no `src/` changes beyond the two handlers, zero changes to integration/golden/BDD/e2e/adversarial tiers, no CI workflow edit, `package.json` untouched at 0.8.2, Conventional Commits throughout, no tmp/ leakage (0 tracked files under `tmp/`), no secrets or debug leftovers. Findings below are polish-level (comment citations, import hygiene) and do not block.

## A) Spec / Plan Compliance

### Spec §17 ACs

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-F1-1 (ordered run green, unit-before-integration) | ✅ PASS | Ordered run 267/0 including TC-DOCTOR-013..022 pollution victims (phase 5 evidence, execution log) |
| AC-F1-2 (standard fast loop green) | ✅ PASS | 1314/0 full suite; `bun run check` green |
| AC-F1-3 (CI green on this PR) | ⏳ PENDING-PR | Correctly marked pending phase 11 observation — expected, not a gap |
| AC-F2-1 (doctor default-path identical, DEC-4 CommandResult preserved) | ✅ PASS | `deps.runDoctor ?? runDoctor` single fallback; CommandResult construction untouched (diff: only seam + `run` indirection); integration doctor tests unmodified and green |
| AC-F3-1 (repair default-path identical) | ✅ PASS | Same pattern; repair tests 1–4 (default-deps paths via `runCli`) byte-identical in diff |
| AC-F4-1 (guard: 0 occurrences, demonstrably fails on reintroduction) | ✅ PASS | TC-GUARD-001 tree scan green (0 hits); TC-GUARD-002 call-site fixture detected, prose fixture ignored, clean fixture ignored; `rg "mock\.module\(" tests/` empty |
| AC-F4-2 (rules ban + alternatives documented) | ✅ PASS | Ban present in over-mocking guardrail AND anti-patterns; names DI seams (`DoctorCommandDeps` pattern) and `Bun.spawn`; cites GH-103 |

### Scope assertions (all verified against `git diff main...HEAD`)

- ✅ Additive-only `src/`: exactly `doctor.ts` + `repair-state.ts`; interface + parameter + fallback only; no flags/output/exit-code change.
- ✅ No CI config change: zero entries under `.github/workflows/`.
- ✅ Version 0.8.2: `package.json` diff is empty (0 lines) — DEC-2 honored.
- ✅ Integration/golden/e2e/BDD/adversarial tiers untouched: zero changed paths.
- ✅ No `doc/spec/**` change — `.ai/rules/testing-strategy.md` is the only doc edit (blockquote nesting defect from b3047af correctly normalized in d2adfb4, content preserved).
- ✅ No tmp/ leakage: `git ls-files tmp/` = 0; tmp is gitignored.
- ✅ Commit hygiene: all 12 commits Conventional Commits `<type>(GH-103): <subject>`.

### Plan task audit

- **OPEN_TASKS**: none — all tasks 1.1–5.7 checked.
- **DONE_BUT_UNCHECKED**: none.
- **CHECKED_BUT_MISSING**: none — every checked task has corresponding diff evidence; execution log commits match (`c7d58af`, `14fe403`, `3d26ffe`, `b3047af`, `1e99417`, `d2adfb4`).
- Plan-specific corrections verified: PR #105→#102 comment fix landed (doctor.test.ts header); repair tests 1–4 byte-identical; `FAKE_REPORT: RepairReport` (no `as const`); `Res.ok`/`Res.err` typed stub wiring; `lastRepairOpts` capture preserved; needle `["mock", "module("].join(".")` per D-TST-1.

## B) Code Quality

### Focus area 1 — DI seams (doctor.ts, repair-state.ts) ✅
Optional deps param with `= {}` default; single `??` fallback to the identical static import; no caller changes; DEC-4 CommandResult construction untouched; seam doc comments 3 lines and explain the non-obvious constraint (why the seam exists) — appropriate per typescript.md. (Citation nit: F-1.)

### Focus area 2 — Unit test rewrites ✅
TC-DOCTOR-011.1–.5: same describe/test IDs, same fixture reports, same `expect` assertions; only stub wiring changed; `nextDoctorResult` properly retyped `Result<DoctorReport, MarkSyncError>`; phantom-report-shaped default preserved (including `probeCapabilities: false`). Repair tests 5–6: seam-injected, opts-wiring assertions intact (`dryRun === true`, `targetId: "default"`); env-var harness untouched. `mock` dropped from all `bun:test` imports. PR #102 reference correct. (Import hygiene nit: F-2.)

### Focus area 3 — Guard (no-mock-module.test.ts) ✅
Needle built by concatenation — guard's own source contains no contiguous `mock.module(` (verified: header/prose/describe/error-message mentions all lack the immediate `(`); repo root resolution `join(import.meta.dir, "../../..")` correct for `tests/unit/meta/`; `.ts`-only scan is the right scope (only `.ts` executes under bun test); TC-GUARD-001 throws a `file:line` list before the (redundant-but-harmless) `expect` — good diagnostics; TC-GUARD-002 fixtures built by concatenation, prose fixture correctly produces no false positive ("mock.module here (" — needle not contiguous). (Tag nit: F-3; design note: F-4.)

### Focus area 4 — Rules ban (.ai/rules/testing-strategy.md) ✅
Placed in both reader touchpoints (over-mocking guardrail "NOT allowed" list + anti-patterns ❌ entry) at HEAD d2adfb4 with single-level blockquote nesting restored; no contradiction with the "Mocks are allowed for" list — fault-injection and `Bun.serve` adapter mocks remain sanctioned, only `mock.module` is banned; `last_updated` bumped; `GH-103` added to `related_changes`.

### Focus area 5 — Cross-cutting ✅
No handoff-patch or tmp/ artifacts on the branch; no secrets; no debug leftovers; Conventional Commits throughout.

## Findings

### Low (3) — optional polish, non-blocking (boy-scout-rule candidates for any future touch)

**[low] `src/cli/commands/doctor.ts:15`, `src/cli/commands/repair-state.ts:14`, `tests/unit/cli/commands/doctor.test.ts:4`, `tests/unit/cli/commands/repair-command.test.ts:6` — DEC-4 mis-citation on the seam comments.** The comments say "Injectable seams for tests (DEC-4)" / "(DEC-4 seam)" / "DEC-4 deps seam", but DEC-4 (GH-30) is the *CommandResult construction* contract, not the authority for the DI seam — the seam's actual rationale is the `mock.module` ban / GH-103 / testing-strategy rule. The plan's own text introduced this terminology and the coder followed it faithfully, so this is a planning-artifact drift, not a delivery error. Fix: replace `(DEC-4)` with `(GH-103)` or "see the mock.module ban in `.ai/rules/testing-strategy.md`" in those four spots.

**[low] `tests/unit/cli/commands/repair-command.test.ts:15-16` — duplicate import statements from `#app/repair`.** `import type { RepairReport }` and `import { runRepair }` are two separate statements from the same module; repo checklist requires one statement per module via the inline type modifier. `src/cli/commands/repair-state.ts:12` already demonstrates the target form. Fix: `import { runRepair, type RepairReport } from "#app/repair";`.

**[low] `tests/unit/meta/no-mock-module.test.ts:2` — ephemeral change-local IDs in a permanent file.** Header cites `(R-TST-1/D-TST-1)` — test-plan-internal risk/decision IDs with no meaning outside the (historical) change folder; the surrounding prose already explains the why, making the tags alphabet-soup noise per AGENTS.md comment discipline. Fix: drop the tag, keep the sentence.

### Info (2) — no action required

**[info] Guard needle evasion via spaced form.** `mock.module (` (spaced) would evade the line-based `includes` needle. Accepted by design: Biome formatting normalizes the spaced form and `format:check` gates every commit (plan constraint, phase-3 AC). Documented trade-off, not a defect.

**[info] Uncommitted working-tree change.** `chg-GH-103-pm-notes.yaml` has an uncommitted diff (review_fix phase timestamp — PM marking review start). Benign; ensure it lands with the `/commit` step.

## Verdict

**Status: PASS** — zero critical/high/medium findings. Spec compliance: PASS. Plan compliance: PASS (all tasks done and evidenced; AC-F1-3 correctly pending PR observation at phase 11). The three low findings are optional polish and do not warrant a remediation phase.

**Next step**: PROCEED → phase 9 (quality_gates), then dod_check and PR creation (AC-F1-3 observed on the PR).
