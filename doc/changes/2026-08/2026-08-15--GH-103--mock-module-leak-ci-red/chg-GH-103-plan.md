---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-103-mock-module-leak-ci-red
status: Proposed
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, bug, ci, testing, priority:critical]
links:
  change_spec: ./chg-GH-103-spec.md
  test_plan: ./chg-GH-103-test-plan.md
  handoff_patch: ../../../tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch
summary: "Eliminate the process-wide mock.module leak from the two unit CLI test files via additive DI seams on doctorCommand/repairStateCommand (DoctorCommandDeps/RepairStateCommandDeps, production callers unchanged), rewrite both unit test files like-for-like to inject stubs through the seams, add a scanning regression guard banning mock.module call syntax under tests/, and ban the API in .ai/rules/testing-strategy.md. Zero production behavior change; no version bump (stays 0.8.2); CI fast-loop test job restored to order-independent green."
version_impact: none
---

# IMPLEMENTATION PLAN — GH-103: fix: ci red — eliminate process-wide mock.module leak in unit CLI tests

## Context and Goals

The `Lint + Typecheck + Test` CI job fails deterministically on **every** PR since 2026-08-14 (first seen on PR #102). Root cause (ticket-confirmed with instrumented CI runs): `tests/unit/cli/commands/doctor.test.ts:28` and `tests/unit/cli/commands/repair-command.test.ts:52` register process-wide `mock.module` mocks (`#app/doctor`, `#app/repair`). Bun 1.2.23 (pinned) does not scope `mock.module` to the registering file and has no restore API. When bun test's file-discovery order places the unit CLI files before the integration files (the order GitHub's 2026-08 ubuntu-latest image now produces), the integration tests' imported `runDoctor` resolves to the leaked mock → phantom report `{"checks":[],"summary":{"pass":5,...},"worstStatus":"pass"}` → TC-DOCTOR-013..022 red → job fails → all merges blocked.

This plan delivers the spec's fix: **additive, optional DI seams** on the two CLI command handlers (mirroring the established `DoctorDeps` DI convention in the app tier), **like-for-like rewrite** of both unit test files to inject stubs per call, **deletion of every `mock.module`**, a **scanning regression guard** (`tests/unit/meta/no-mock-module.test.ts`), the **`mock.module` ban** in `.ai/rules/testing-strategy.md`, and **order-explicit + full-suite verification**. Zero production behavior change; no version bump (0.8.2 stays; spec DEC-2); no CI workflow change (spec NG-4); no `doc/spec/**` change (`.ai/rules/` is the only doc edit; `@doc-syncer` confirms in lifecycle phase 7).

**Key goals (from spec §4):**

- **G-1**: Suite is order-independent — green under the reproducible unit-files-first ordering AND the standard fast loop (AC-F1-1, AC-F1-2; CI green on the PR itself, AC-F1-3, observed at phase 11).
- **G-2**: Zero `mock.module` under `tests/`, enforced by an automated guard that demonstrably fails on reintroduction (AC-F4-1).
- **G-3**: Both unit test files keep their scenario coverage like-for-like — same IDs, same assertions, only stub wiring changes (AC-F2-1, AC-F3-1).
- **G-4**: `.ai/rules/testing-strategy.md` documents the ban + preferred alternatives (AC-F4-2).
- **G-5**: Zero production behavior delta — optional defaulted parameters only; integration tests stay green unmodified (AC-F2-1, AC-F3-1, NFR-3).

### Implementation input — the verified handoff patch (spec DEC-3)

The human-approved fix work from the GH-104 session is preserved at `tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch` (316 lines, 4 file diffs). It is **implementation input, not authority** — the spec's outcome ACs govern. The coder starts from it and adjusts for the two known deviations:

1. **PR-number drift (test-plan R-TST-5)**: the patch's rewritten doctor-test header comment says "the cause of the PR #105 CI doctor flakes" — wrong reference. The first red run was **PR #102** (2026-08-14, per ticket). Write "PR #102" in the landed comment.
2. **Potential drift vs `main @ 1ebc664`**: the patch predates this branch. Planning-time check confirms the src hunks' context matches current `main` (doctor.ts imports at lines 12–13; repair-state.ts imports at lines 10–12 and the `runRepair` call site at line 70) — but re-validate with `git apply --check` before applying; if any hunk's context has moved, reconcile manually against the files as they exist on this branch.

Patch layout for task references below:

| Patch lines | File |
|---|---|
| 1–30 | `src/cli/commands/doctor.ts` |
| 31–67 | `src/cli/commands/repair-state.ts` |
| 68–209 | `tests/unit/cli/commands/doctor.test.ts` |
| 210–316 | `tests/unit/cli/commands/repair-command.test.ts` |

### Open questions

None blocking. The two spec-delegated decisions are resolved in the test plan: guard mechanism = scanning unit test, call-syntax pattern, concatenation-built needle (D-TST-1); no direct default-deps unit test for `doctorCommand` (D-TST-2 — structural `??` equivalence + unmodified integration suite is the proof). Guard location pinned to `tests/unit/meta/` (new directory; `tests/unit/shared/` noted as an acceptable equivalent home, test-plan A-6 — no coverage impact either way; use `tests/unit/meta/`).

## Scope

### In Scope

- Source: additive optional DI-seam parameter on `doctorCommand` (`DoctorCommandDeps { runDoctor?: typeof runDoctor }`) and `repairStateCommand` (`RepairStateCommandDeps { runRepair?: typeof runRepair }`), each second param defaulting to `{}` with `deps.X ?? X` fallback; production callers unchanged. (spec F-2, F-3, DM-1)
- Tests: rewrite `tests/unit/cli/commands/doctor.test.ts` (TC-DOCTOR-011.1–.5) and `tests/unit/cli/commands/repair-command.test.ts` (tests 1–6) to inject stubs via the seams; delete both `mock.module` registrations and their hoisting-explainer comments; IDs/assertion semantics preserved like-for-like. (spec F-2, F-3, G-3)
- Guard: NEW `tests/unit/meta/no-mock-module.test.ts` — recursive `.ts` scan of `tests/` for the call-syntax needle `mock.module(` (built by concatenation), reporting `file:line`, with exported scanner helper + self-tests. (spec F-4, DM-2, test-plan D-TST-1)
- Rules: `.ai/rules/testing-strategy.md` gains the `mock.module` ban (process-wide, unscoped, order-dependent, no restore API in Bun 1.2.23) + preferred alternatives (DI seams; `Bun.spawn` CLI-level tests). (spec F-4, AC-F4-2)
- Verification: explicitly-ordered run (unit CLI files before integration), standard fast loop, full `bun run check` gate, guard run, grep proof, untouched-tiers diff assertion, evidence capture. (spec §7.1, NFR-1/2/4)
- Implementation input: the handoff patch — re-validated, not blind-applied (spec DEC-3).

### Out of Scope

- [OUT] Fixing/workaround Bun's `mock.module` semantics or adopting a future restore API (spec NG-1).
- [OUT] Converting any other command handlers or test files to DI seams (spec NG-2).
- [OUT] Any behavior change to `doctor`/`repair-state` commands, outputs, exit codes, or the DEC-4 CommandResult contract (spec NG-3).
- [OUT] CI workflow configuration changes (spec NG-4) — the guard is a test file, so it runs everywhere the suite runs.
- [OUT] Version bump — stays 0.8.2 (spec NG-5, DEC-2).
- [OUT] Modifying the integration CLI tests, golden/adversarial/Mermaid/BDD/e2e-mock tiers — pollution victims / regression net; must stay green **unmodified** (spec §7.2).
- [OUT] `doc/spec/**` changes and `tests/unit/meta/`-adjacent doc work — `.ai/rules/testing-strategy.md` is the only doc edit; `@doc-syncer` reconciles in lifecycle phase 7.
- [OUT] Reverting diagnostic commits on `docs/pdr-0002-ms0003-rescope` (ticket housekeeping, tracked there).

### Constraints

- **Green at every commit boundary**: each phase lands as one commit whose tree passes typecheck + the suite in default local order. Phase 1 is additive-only (the still-present `mock.module` keeps working unchanged at that boundary — `deps.runDoctor ?? runDoctor` falls back to the mocked import); Phase 2 removes the leak; the ordered-run proof therefore belongs to Phase 2 onward.
- **Conventional Commits (TDR-0008)**: commitlint + husky enforce; repo override `header-max-length: 72`; config-conventional preset defaults apply to body/footer (`body-max-line-length` / `footer-max-line-length` = 100 — keep footer lines well under 100 chars). Branch convention: `<type>(GH-103): <subject>`.
- **Code style (`.ai/rules/typescript.md`)**: self-documenting code, file headers ≤ 3 lines, cite authority once. The handoff patch's short seam doc comments are appropriate (they document a non-obvious testing constraint — why the seam exists — not spec restatement).
- **Biome formatting**: `bun run format:check` gates every commit; the guard's concatenated needle and all rewrite code must be Biome-clean (no spaced `mock.module (` forms).
- **Typecheck rigour**: no `any` in test helpers; the rewritten stubs use precise types (`Result<DoctorReport, MarkSyncError>`, `typeof runRepair`) — verified feasible against `src/domain/errors.ts:36,97` and `src/domain/result.ts:10`.
- **No new runtime deps**; no `doc/spec/**` edits; no `.github/workflows/**` edits.

### Risks

- **RSK-4 / R-TST-5 (patch drift)**: the patch predates this branch and its test-file comment cites PR #105 (wrong — PR #102 is authoritative). Mitigated: task 2.3 forces the corrected reference; `git apply --check` before applying; if hunk context moved vs `main @ 1ebc664`, reconcile hunks manually — spec ACs, not the patch, are authoritative. Residual: L.
- **RSK-2 / R-TST-4 (silent coverage loss in the rewrite)**: a rewritten test could drop or weaken an assertion. Mitigated: like-for-like diff review is an explicit task (2.4) — same describe/test IDs, same fixtures, same `expect` calls, tests 1–4 byte-identical; TC-DOCTOR-011.1–.5 enumerated test-by-test. Residual: L.
- **RSK-P1 (guard self-match hazard)**: the guard's own source (and its self-test fixtures) must never contain the contiguous literal `mock.module(`. Mitigated by construction: needle assembled via concatenation (e.g. `["mock", "module("].join(".")`), self-test fixtures likewise; D-TST-1. Residual: L.
- **RSK-1 (seam alters the default path)**: wrong fallback or arg mis-wiring changes command behavior. Mitigated: default is the identical static import the function called before (`deps.X ?? X`); the unmodified integration suite (real `runDoctor`/`runRepair`) is the tripwire; `git diff` review of the src files shows additive-only deltas. Residual: L.
- **RSK-P2 (local green proves nothing)**: local file-discovery order differs from CI's — the outage's whole lesson. Mitigated: verification is order-explicit (pinned positional-argument invocation, TC-ORDER-001) plus the full loop and CI on the PR (AC-F1-3, observed phase 11). Residual: L.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Ordered run (unit CLI files BEFORE integration tree) failures | 0 | AC-F1-1 / NFR-1 / TC-ORDER-001 |
| Standard fast loop (`tests/unit/ tests/integration/ tests/golden/`) failures | 0 | AC-F1-2 / TC-ORDER-002 |
| `mock.module(` occurrences under `tests/` (scan + `rg`) | 0, guard-enforced | AC-F4-1 / NFR-2 / TC-GUARD-001 |
| Guard demonstrably fails on a reintroduced call-site fixture | yes (self-test) | AC-F4-1 / TC-GUARD-002 |
| Integration test files / golden / BDD / e2e-mock files modified | 0 (`git diff main --stat`) | NFR-3 / TC-SEAM-003/004, TC-REG-001 |
| Production behavior deltas (outputs, exit codes) | 0 | NFR-3 / AC-F2-1, AC-F3-1 |
| `bun run check` end-to-end | green | NFR-4 / TC-ORDER-002 |
| Package version | unchanged (0.8.2) | DEC-2 |

## Phases

### Phase 1: Source DI seams on the two CLI command handlers

**Goal**: Add the additive, optional dependency-injection seams to `doctorCommand` and `repairStateCommand` per spec F-2/F-3, starting from the handoff patch's two src hunks (patch lines 1–67). Additive only — no production caller changes, no behavior change; the suite stays green in default order at this boundary (the old `mock.module` tests still work because `deps.runDoctor ?? runDoctor` falls back to the mocked module import).

**Tasks**:

- [ ] **1.1** Re-validate the handoff patch against the branch: `git apply --check tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch` (expect clean; planning-time check confirmed src-hunk context matches `main @ 1ebc664` — doctor.ts imports at lines 12–13, repair-state.ts at lines 10–12 with the `runRepair` call site at line 70). If any src hunk fails to apply, reconcile manually against the current file contents — do not force-apply. (RSK-4)
- [ ] **1.2** Apply the doctor seam to `src/cli/commands/doctor.ts` (patch lines 1–30 as the base): add the exported interface `DoctorCommandDeps { runDoctor?: typeof runDoctor }` with the short seam doc comment from the patch (appropriate per typescript.md — it explains a non-obvious testing constraint); add the second parameter `deps: DoctorCommandDeps = {}`; resolve `const run = deps.runDoctor ?? runDoctor;` and call `run({ cwd: cwd(), probeCapabilities: flags.probeCapabilities === true })`. Nothing else in the file changes. (F-2, DM-1)
- [ ] **1.3** Apply the repair seam to `src/cli/commands/repair-state.ts` (patch lines 31–67 as the base): add the exported interface `RepairStateCommandDeps { runRepair?: typeof runRepair }` with the same style of seam doc comment; add `deps: RepairStateCommandDeps = {}` as the second parameter; resolve `const repair = deps.runRepair ?? runRepair;` early (before mode resolution, as in the patch) and route the single step-7 call site through it: `await repair(lock, git, target, config, {...})`. Nothing else changes. (F-3, DM-1)
- [ ] **1.4** Verify additive-only and green at the boundary: `git diff main -- src/` shows exactly the two files with interface + parameter + fallback changes only; `rg -n "doctorCommand\\(|repairStateCommand\\(" src/` confirms production callers (CLI router) are untouched and pass no second argument; then `bun run typecheck && bun run lint && bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/cli/commands/doctor.test.ts tests/unit/app/repair.test.ts tests/integration/app/repair.test.ts` — all green (old mock wiring still effective; real-path integration tests prove the default fallback is byte-identical behavior). (RSK-1, AC-F2-1, AC-F3-1 prelim)

**Acceptance Criteria**:

- Must: `doctorCommand(flags?, deps?)` and `repairStateCommand(flags?, deps?)` accept the new optional deps; omitted deps resolve to the real app-tier functions via a single `??` fallback (AC-F2-1, AC-F3-1, DM-1).
- Must: zero diff to any other `src/` file; zero change to flags, outputs, exit codes, or the DEC-4 CommandResult construction (NFR-3).
- Must: typecheck, lint, and the listed test files green at this commit (suite green in default order).
- Should: seam doc comments ≤ 3 lines each, citing the constraint once (typescript.md style).

**Files and modules**:

- Code areas: `src/cli/commands/doctor.ts` (updated — `DoctorCommandDeps` + fallback), `src/cli/commands/repair-state.ts` (updated — `RepairStateCommandDeps` + fallback).
- System docs: none (`.ai/rules/` edit is Phase 4; `doc/spec/**` is lifecycle phase 7).

**Tests**:

- `bun run typecheck && bun run lint`
- `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/cli/commands/doctor.test.ts tests/unit/app/repair.test.ts tests/integration/app/repair.test.ts` (green in default order at this boundary)

**Completion signal**: `fix(GH-103): add DI seams to doctor/repair-state CLI handlers`

---

### Phase 2: Like-for-like rewrite of the two unit CLI test files — delete both mock.module registrations

**Goal**: Rewrite `tests/unit/cli/commands/doctor.test.ts` (TC-DOCTOR-011.1–.5) and `tests/unit/cli/commands/repair-command.test.ts` (tests 1–6) to inject stubs through the Phase-1 seams, deleting both process-wide `mock.module` registrations and their hoisting-explainer comments — starting from the handoff patch's two test hunks (patch lines 68–316), with the PR #102 comment correction. Same test IDs, same fixtures, same assertion semantics; only the stub wiring changes. This is the phase that kills the leak — the ordered-run proof first passes here.

**Tasks**:

- [ ] **2.1** Rewrite `tests/unit/cli/commands/doctor.test.ts` from patch lines 68–209, with the correction below: delete the `mock.module("#app/doctor", …)` block (current line 28) and its hoisting-explainer comment; drop `mock` from the `bun:test` import; retype `nextDoctorResult` as `Result<DoctorReport, MarkSyncError>` initialized via `Res.ok({...})` (same phantom-report-shaped default value as before); add `const stubRunDoctor: typeof import("#app/doctor").runDoctor = async () => nextDoctorResult;` (add `import type { MarkSyncError } from "#domain/errors"`); pass `{ runDoctor: stubRunDoctor }` as the second argument in all five tests; use `Res.ok(mockReport)` / `Res.err({ kind: "RemoteUnreachable", cause: "Network error" })` for per-test swaps. All five test IDs, fixture reports, and `expect` assertions stay exactly as they are (TC-DOCTOR-011.1–.5). (F-2, TC-SEAM-001)
- [ ] **2.2** Rewrite `tests/unit/cli/commands/repair-command.test.ts` from patch lines 210–316: delete the `mock.module("#app/repair", …)` block (current line 52) and its hoisting-explainer comment; drop `mock` from the `bun:test` import; import `runRepair` + `type RepairReport` from `#app/repair`; type `FAKE_REPORT: RepairReport` (drop `as const`); retype `nextRepairResult: Awaited<ReturnType<typeof runRepair>>`; add `const stubRunRepair: typeof runRepair = async (_lock, _git, _target, _config, opts) => { lastRepairOpts = opts; return nextRepairResult; };` capturing opts exactly as the old mock did. **Tests 1–4 stay byte-identical** (they drive `runCli(["repair-state", "--json"])` — the default-deps production path — and never reach `runRepair`); tests 5–6 change only by passing `{ runRepair: stubRunRepair }` as the second argument to `repairStateCommand(...)`, preserving the opts-wiring assertions (`lastRepairOpts.dryRun === true`; test 6 also `targetId: "default"`). The env-var save/restore harness is untouched. (F-3, TC-SEAM-002)
- [ ] **2.3** Apply the PR #102 correction (test-plan R-TST-5) to the doctor-test header comment: the patch says "the cause of the PR #105 CI doctor flakes" — land "PR #102" (the first red run, 2026-08-14, per the ticket). Keep the rest of the patch's warning prose (it mentions `mock.module` without a following `(` — call-syntax-safe per D-TST-1).
- [ ] **2.4** Like-for-like diff review (RSK-2 / R-TST-4): `git diff main -- tests/unit/cli/commands/` — assert same `describe`/`test` IDs and assertions in both files; doctor tests differ only in stub wiring; repair tests 1–4 show zero diff; no `mock` import remains in either file.
- [ ] **2.5** Verify the leak is gone and order-independence holds now: `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts` green standalone; `rg "mock\\.module\\(" tests/` returns **nothing** (exit 1, no matches); then the pinned order-explicit invocation — `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/` — green with 0 failures, including the pollution victims TC-DOCTOR-013..020 and 022.1 running after the unit files in the same process. (AC-F1-1 prelim, TC-SEAM-001/002, TC-ORDER-001)

**Acceptance Criteria**:

- Must: zero `mock.module` call sites remain under `tests/` (`rg "mock\\.module\\(" tests/` empty); both `mock.module` registrations and their hoisting-explainer comments deleted (AC-F4-1 precondition, DM-2).
- Must: TC-DOCTOR-011.1–.5 and repair tests 1–6 pass with unchanged IDs/scenarios/assertions; repair tests 1–4 byte-identical (AC-F2-1, AC-F3-1, TC-SEAM-001/002, RSK-2).
- Must: the pinned unit-files-first invocation is green — the TC-DOCTOR-013..022 phantom-report pollution no longer reproduces (AC-F1-1).
- Should: retained prose comments mentioning `mock.module` never contain the contiguous call syntax (guard-safety, R-TST-1).

**Files and modules**:

- Code areas: none.
- Test areas: `tests/unit/cli/commands/doctor.test.ts` (updated — seam-injected stub, mock.module deleted), `tests/unit/cli/commands/repair-command.test.ts` (updated — tests 5–6 seam-injected, tests 1–4 untouched, mock.module deleted).
- System docs: none.

**Tests**:

- `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts`
- `rg "mock\\.module\\(" tests/` → empty
- `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/` (ordered run — TC-ORDER-001)

**Completion signal**: `test(GH-103): rewrite unit CLI tests to inject stubs via DI seams`

---

### Phase 3: Regression guard — `tests/unit/meta/no-mock-module.test.ts`

**Goal**: Author the automated guard per test-plan D-TST-1: a scanning unit test that walks the `tests/` tree reading `.ts` files, counts occurrences of the call-syntax needle `mock.module(` (assembled by concatenation so the guard never self-matches), reports offending `file:line`, asserts 0 occurrences (TC-GUARD-001), and self-tests the matcher against fixtures to prove it would fail on reintroduction (TC-GUARD-002). Test-only mechanism — no CI wiring (spec NG-4).

**Tasks**:

- [ ] **3.1** Create the new directory `tests/unit/meta/` (confirmed absent at planning time) and the file `tests/unit/meta/no-mock-module.test.ts`. Implement an **exported** scanner helper (e.g. `findNeedleLines(text: string): number[]` returning 1-based line numbers of matches) whose needle is built by concatenation — e.g. `const NEEDLE = ["mock", "module("].join(".");` — so the contiguous literal never appears in the guard's own source (self-match hazard avoided by construction, R-TST-1/D-TST-1).
- [ ] **3.2** Implement the tree scan (TC-GUARD-001): resolve the repo root from `import.meta.dir` (`join(import.meta.dir, "../../..")`), walk `tests/` recursively, read every `.ts` file as text, run the helper, and collect `file:line` hits. Assert total hits === 0; on failure the test message lists every offending `file:line`. Scan scope pinned to `.ts` files — only `.ts` executes under bun test; non-executable fixtures (`.md`, `.txt`) are excluded by design.
- [ ] **3.3** Implement the matcher self-tests (TC-GUARD-002), fixtures built by concatenation so the guard file stays clean: (a) a reintroduced-call-site fixture — text containing `mock.module("#app/doctor", () => ({ ... }))` assembled as `["mock", "module("].join(".") + ...` — helper reports ≥ 1 hit at the expected line; (b) a prose-only fixture — `// never use mock.module here (process-wide, unscoped)` — 0 hits (no false positive); (c) a clean/empty fixture — 0 hits. The failure diagnostic of the tree-scan test names file and line (forward-looking triage output, spec §10).
- [ ] **3.4** Verify: `bun test tests/unit/meta/no-mock-module.test.ts` green; the guard is auto-included in every suite run (`bun test tests/unit/` picks it up — no wiring); Biome-clean formatting (`bun run format:check` — no spaced needle forms).

**Acceptance Criteria**:

- Must: the guard reports 0 occurrences on the real tree and fails with a `file:line` list if any `mock.module(` call syntax exists under `tests/` (AC-F4-1, DM-2, NFR-2, TC-GUARD-001).
- Must: the matcher demonstrably detects a fixture call site and ignores prose mentions — proven by self-test without reintroducing anything into the tree (AC-F4-1, TC-GUARD-002).
- Must: the guard's own source contains no contiguous `mock.module(` literal (self-match impossible by construction, D-TST-1).
- Should: helper exported for direct testability; walk is read-only (no state created).

**Files and modules**:

- Code areas: none.
- Test areas: `tests/unit/meta/no-mock-module.test.ts` (new — exported scanner helper + TC-GUARD-001 tree scan + TC-GUARD-002 self-tests).
- System docs: none.

**Tests**:

- `bun test tests/unit/meta/no-mock-module.test.ts`
- `bun test tests/unit/` (guard auto-included)

**Completion signal**: `test(GH-103): add scanning guard banning mock.module in tests/`

---

### Phase 4: Ban `mock.module` in `.ai/rules/testing-strategy.md`

**Goal**: Document the ban and the sanctioned alternatives in the testing-strategy rules so human and AI-agent contributors meet the guardrail at the source (spec F-4, AC-F4-2, TC-DOCS-001). Consistent with the doc's existing structure and voice; extends the AI-agent over-mocking guardrail and the anti-patterns list.

**Tasks**:

- [ ] **4.1** Extend the "AI-agent over-mocking guardrail" section (or add a compact adjacent rule within it) banning `mock.module` outright, naming the reason — process-wide, unscoped under bun:test workers, order-dependent (no restore API in pinned Bun 1.2.23) — and citing GH-103 as the incident. Name the two preferred alternatives exactly as AC-F4-2 requires: DI seams for unit-level isolation (point at `DoctorCommandDeps`/`RepairStateCommandDeps` as the pattern) and `Bun.spawn` CLI-level tests where process isolation is the point.
- [ ] **4.2** Add a matching ❌ entry to the "Anti-patterns (rejected)" list (e.g. "❌ **`mock.module` in any test** — process-global … use DI seams or `Bun.spawn` instead"), and note the mechanical backstop: the scanning guard `tests/unit/meta/no-mock-module.test.ts` fails the suite on reintroduction.
- [ ] **4.3** Bump the doc front matter: `last_updated` → delivery date (2026-08-15); add `GH-103` to `related_changes`. Verify the change is doc-only: `git diff main --stat -- .ai/rules/ doc/` shows only `.ai/rules/testing-strategy.md`; `bun run check` remains green.

**Acceptance Criteria**:

- Must: the rules document bans `mock.module` with the reason and names both preferred alternatives (AC-F4-2, TC-DOCS-001).
- Must: the ban lands where strategy readers meet it (over-mocking guardrail + anti-patterns); `last_updated` bumped; no other strategy content altered in flight (TC-DOCS-001).
- Must: no `doc/spec/**` file touched (that reconciliation is `@doc-syncer`, lifecycle phase 7).

**Files and modules**:

- Code areas: none.
- System docs: `.ai/rules/testing-strategy.md` (updated — ban + alternatives + anti-pattern entry + front-matter bump). No `doc/spec/**` changes.

**Tests**:

- `git diff main --stat -- .ai/rules/ doc/` (doc-only, single file)
- `bun run check` (no behavioral impact)

**Completion signal**: `docs(GH-103): ban mock.module in testing-strategy rules`

---

### Phase 5: Finalize — ordered-run + full-suite verification evidence, spec reconciliation, no-bump confirmation

**Goal**: Capture the verification evidence the spec's order-explicit ACs require (AC-F1-1, AC-F1-2, NFR-1/2/4), assert the untouched-tiers and no-version-bump invariants (NFR-3, DEC-2), and sign off spec reconciliation. Version bump per repo conventions = **none** (`version_impact: none`; spec DEC-2 — an additive, defaulted, optional parameter invisible to every production caller; a bump would falsely signal a shipped fix). CI green on the PR itself (AC-F1-3) is observed at lifecycle phase 11 and recorded in the test-plan execution log.

**Tasks**:

- [ ] **5.1** Ordered-run evidence (TC-ORDER-001): `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/` — exit 0, 0 failures, TC-DOCTOR-013..020 + 022.1 green after the unit files in one process. Record the invocation + result summary in the test-plan §10 execution log. Optional negative control (proves the invocation reproduces the CI order): in a temp worktree at `main` (`git worktree add`), run the identical invocation and observe the phantom-report failures, then remove the worktree.
- [ ] **5.2** Standard fast loop (TC-ORDER-002 step 1): `bun test tests/unit/ tests/integration/ tests/golden/` — 0 failures (includes the rewritten unit files, the unmodified integration tree, and the new guard).
- [ ] **5.3** Full local gate (NFR-4 / TC-ORDER-002 step 2): `bun run check` — biome lint, format:check, `tsc --noEmit`, full `bun test` (default discovery — includes e2e-mock), and `depcruise src` boundaries — green end-to-end.
- [ ] **5.4** Guard + grep proof (AC-F4-1, NFR-2): `bun test tests/unit/meta/no-mock-module.test.ts` green (0 occurrences, matcher self-tests pass); `rg "mock\\.module\\(" tests/` returns nothing.
- [ ] **5.5** Untouched-tiers and scope assertion (NFR-3): `git diff main --stat` — assert NO entries under `tests/integration/**`, `tests/unit/app/repair.test.ts`, `tests/golden/`, `tests/adversarial/`, `tests/bdd/`, `tests/e2e-mock/`, `.github/workflows/**`, or `doc/spec/**`; changed set is exactly the 5 files of Phases 1–4 plus change-artifact logs.
- [ ] **5.6** Version-bump convention check (DEC-2): `package.json` still `0.8.2` — no bump, no release action; the next tag-triggered release is unaffected (no shipped-behavior delta). Assert via `git diff main -- package.json` (empty).
- [ ] **5.7** Spec reconciliation: re-read spec §17 against delivered behavior — AC-F1-1 ✓ (5.1), AC-F1-2 ✓ (5.2/5.3), AC-F1-3 pending PR (phase 11), AC-F2-1/AC-F3-1 ✓ (Phase 1 + unmodified integration suites), AC-F4-1 ✓ (Phase 3 + 5.4), AC-F4-2 ✓ (Phase 4). Populate the test-plan §10 execution log rows (TC-ORDER-001/002, TC-SEAM-001..004, TC-GUARD-001/002, TC-DOCS-001; TC-ORDER-003/TC-REG-001 pending PR) and this plan's Execution Log. Fix-line note for the PR: "fix(tests): remove process-wide mock.module — restore order-independent CI via DI seams".

**Acceptance Criteria**:

- Must: ordered run, standard fast loop, and `bun run check` all green with results recorded (AC-F1-1, AC-F1-2, NFR-1, NFR-4).
- Must: guard green and `rg "mock\\.module\\(" tests/` empty (AC-F4-1, NFR-2).
- Must: `git diff main --stat` shows zero changes to integration/golden/BDD/e2e-mock/CI-workflow/doc-spec paths and zero `package.json` delta (NFR-3, DEC-2, NG-4).
- Must: all spec §17 ACs reconciled (AC-F1-3 explicitly marked pending-PR-observation); execution logs populated.

**Files and modules**:

- Code areas: none (no version bump — `package.json` untouched by design).
- System docs: none (this plan's Execution Log + test-plan §10 log rows only — change artifacts, not system docs).

**Tests**:

- `bun test tests/unit/cli/commands/doctor.test.ts tests/unit/cli/commands/repair-command.test.ts tests/integration/` (TC-ORDER-001)
- `bun test tests/unit/ tests/integration/ tests/golden/` (TC-ORDER-002)
- `bun run check` (NFR-4)
- `bun test tests/unit/meta/no-mock-module.test.ts` + `rg "mock\\.module\\(" tests/` → empty (TC-GUARD-001/002)
- `git diff main --stat` scope assertions (TC-SEAM-003/004, TC-REG-001, DEC-2)

**Completion signal**: `docs(GH-103): capture verification evidence and reconcile ACs`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-ORDER-001 | Explicitly-ordered run (unit CLI files first) green — pollution gone | 2 (preview), 5 (evidence) | AC-F1-1, NFR-1 |
| TC-ORDER-002 | Standard fast loop + full local gate green | 5 | AC-F1-2, NFR-1, NFR-4 |
| TC-ORDER-003 | CI `Lint + Typecheck + Test` job green on this PR | Observed phase 11 (preconditions: 1–5) | AC-F1-3, NFR-1 |
| TC-SEAM-001 | Doctor unit rewrite like-for-like (TC-DOCTOR-011.1–.5 via seam-injected stub) | 1 (seam), 2 (rewrite + diff review) | AC-F2-1, DM-1, NFR-3 |
| TC-SEAM-002 | Repair unit rewrite like-for-like (1–4 unchanged default-deps; 5–6 seam-injected) | 1 (seam), 2 (rewrite + diff review) | AC-F3-1, DM-1, NFR-3 |
| TC-SEAM-003 | Doctor integration tests green **unmodified** (TC-DOCTOR-013..020, 022.1) | 1 (verify), 2 (ordered run), 5 (diff assertion) | AC-F2-1, NFR-3 |
| TC-SEAM-004 | Repair tests green **unmodified** (TC-REPAIR-001..013) | 1 (verify), 5 (diff assertion) | AC-F3-1, NFR-3 |
| TC-GUARD-001 | Guard scan: 0 `mock.module(` call sites under `tests/` | 3 (implement), 5 (re-run) | AC-F4-1, DM-2, NFR-2 |
| TC-GUARD-002 | Guard self-test: matcher detects reintroduced call site, ignores prose | 3 | AC-F4-1, NFR-2 |
| TC-DOCS-001 | Testing-strategy rules document ban + alternatives | 4 | AC-F4-2 |
| TC-REG-001 | Untouched tiers (golden, adversarial, Mermaid-DOM, BDD, e2e-mock) stay green | 5 (local), phase 11 (CI) | NFR-3, NFR-4 |

**AC coverage check (spec §17):** AC-F1-1 → TC-ORDER-001 · AC-F1-2 → TC-ORDER-002 · AC-F1-3 → TC-ORDER-003 · AC-F2-1 → TC-SEAM-001, TC-SEAM-003 · AC-F3-1 → TC-SEAM-002, TC-SEAM-004 · AC-F4-1 → TC-GUARD-001, TC-GUARD-002 · AC-F4-2 → TC-DOCS-001. **All ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-103-spec.md | Spec |
| Test plan | ./chg-GH-103-test-plan.md | Test Plan |
| Ticket (root cause, instrumented CI evidence) | GitHub issue GH-103 | Ticket |
| Handoff patch (implementation input, DEC-3) | `tmp/gh-103-handoff/gh-103-mock-module-seams-fix.patch` | Verified fix work (re-validate; PR #105→#102 comment fix required) |
| Doctor command handler (DI seam) | `src/cli/commands/doctor.ts` | Code (updated — Phase 1) |
| Repair-state command handler (DI seam) | `src/cli/commands/repair-state.ts` | Code (updated — Phase 1) |
| Doctor unit test (seam rewrite) | `tests/unit/cli/commands/doctor.test.ts` | Test (updated — Phase 2) |
| Repair unit test (seam rewrite) | `tests/unit/cli/commands/repair-command.test.ts` | Test (updated — Phase 2) |
| Regression guard | `tests/unit/meta/no-mock-module.test.ts` | Test (new — Phase 3) |
| Testing-strategy rules (ban) | `.ai/rules/testing-strategy.md` | Standards (updated — Phase 4) |
| Pollution victims (must stay unmodified) | `tests/integration/cli/commands/doctor.test.ts`, `tests/unit/app/repair.test.ts`, `tests/integration/app/repair.test.ts` | Test (unchanged) |
| CI workflow (unchanged, NG-4) | `.github/workflows/ci.yml` | Config (NOT edited) |
| Version manifest (unchanged, DEC-2) | `package.json` (stays 0.8.2) | Code (NOT edited) |
| Code-style + commit conventions | `.ai/rules/typescript.md`, `commitlint.config.js` (TDR-0008) | Standards |
| DEC-4 CommandResult contract (preserved) | GH-30 change docs; TDR-0009 (`EXIT_HEALTH` 60) | Precedent |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-103) | Initial plan. 5 phases, each one green commit: (1) source DI seams from handoff-patch src hunks, additive-only; (2) like-for-like rewrite of both unit CLI test files from patch test hunks with the PR #105→#102 comment correction (R-TST-5), mock.module deleted, ordered-run proof first lands here; (3) new `tests/unit/meta/no-mock-module.test.ts` guard per D-TST-1 (concatenation-built call-syntax needle, exported helper, TC-GUARD-001/002); (4) `.ai/rules/testing-strategy.md` ban + alternatives per AC-F4-2; (5) finalize — ordered-run/fast-loop/`bun run check` evidence capture, untouched-tiers + no-bump assertions (DEC-2), spec reconciliation (AC-F1-3 observed at phase 11). Patch drift verified at planning time (src hunks match `main @ 1ebc664`); guard scan pinned to `.ts` files; guard location pinned to `tests/unit/meta/` (A-6 alternative noted). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ☐ Pending | — | — | — | DI seams on doctor/repair-state |
| Phase 2 | ☐ Pending | — | — | — | Unit test rewrites; mock.module deleted |
| Phase 3 | ☐ Pending | — | — | — | Regression guard |
| Phase 4 | ☐ Pending | — | — | — | Testing-strategy ban |
| Phase 5 | ☐ Pending | — | — | — | Verification evidence + reconciliation |
