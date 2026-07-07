---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-14-test-plan
status: Updated
created: 2026-07-07T00:00:00Z
last_updated: 2026-07-07T12:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, OPEN-Q9, critical]
version_impact: none
summary: "Test plan for GH-14 (project scaffolding) — narrow automated unit smoke plus a set of manual/CI verification procedures that prove the toolchain is binding, the ports-and-adapters skeleton is in place, and the shared Result<T,E>/MarkSyncError primitives compile under strict mode."
links:
  change_spec: ./chg-GH-14-spec.md
  implementation_plan: ./chg-GH-14-plan.md   # pending — not yet authored at test-plan creation
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E2-S1] Project scaffolding — TS+Bun tooling, ports-and-adapters skeleton, CI unguard

## 1. Scope and Objectives

GH-14 is the **first implementation story of MS-0002**. It is a scaffolding/tooling
story: it ships no product domain logic. Its test surface is intentionally narrow
(one automated unit smoke test), but its **verification discipline is high** because
this story **makes CI binding** by removing every `continue-on-error: true` / `|| true`
advisory guard (OPEN-Q9). From merge onward, every subsequent story's lint /
typecheck / test / boundary / audit signal is authoritative rather than silently
masked — so the proof that this story "works" is largely that the toolchain it
installs actually catches violations.

The core behaviors this plan must protect:

- **The shared primitives compile and are exhaustive.** `Result<T,E>` and the 12-kind
  `MarkSyncError` discriminated union (blueprint §2) must typecheck under strict mode,
  and the exhaustive `never`-switch must compile — proving the union is complete and
  extension-safe for every later domain story.
- **The architecture guard is real, not regex.** dependency-cruiser must catch a
  deliberate `domain → infra` import with a named `from → to + rule` violation and zero
  false negatives (TDR-0006 C-1) — this is the load-bearing NFR-8 guarantee.
- **CI is binding.** Zero advisory guards remain; the PR's own green run is the evidence.
- **Commit + install + entrypoint contracts hold** (Conventional Commits enforced,
  reproducible install, trivial CLI prints `marksync 0.0.0`).

Regression motivation: the H-1 regex bug (cited in OPEN-Q9) demonstrated that silently
masked CI failures are a real, demonstrated risk. This plan ensures the unguard is
genuine and that each gate independently fails when its contract is broken.

### 1.1 In Scope

- The single automated **unit smoke test** asserting `Result.ok` / `Result.err` shape and
  containing the exhaustive `MarkSyncError` `never`-switch that compiles under strict
  mode (AC-F6-1, AC-F6-2, AC-F8-1).
- **Verification procedures** (manual / semi-automated / CI-proven) for every remaining
  AC: install, lint, typecheck, format:check, boundary pass, boundary negative, commit
  accept/reject, skeleton layout, CLI run, CI unguard, dependency/license hygiene.
- The boundary-enforcement **negative proof** (verify-then-remove scratch procedure).
- Mapping each AC and NFR to a concrete TC or an explicit TODO.

### 1.2 Out of Scope & Known Gaps

- **No domain-logic tests** — identity, config, state classification, binding, hierarchy,
  markdown, render, assets, mermaid, git, target are all NG-1 (later stories). The smoke
  test asserts type contracts only; it asserts no domain behaviour.
- **Integration / Golden / BDD / E2E tiers are explicitly n/a** for this story per its
  Test matrix (story file §"Test matrix") and per testing-strategy.md (those tiers cover
  adapter boundaries, deterministic rendering, and lifecycle invariants — none of which
  exist yet). The five tier **directories** are created empty as scaffolding (F-8); they
  hold no scenarios.
- **`bun build --compile` binary target** — out of scope (NG-3; MS2-E5-S4).
- **No performance assertions** beyond observing that lint + format:check +
  check:boundaries complete in single-digit seconds (NFR-1, observational — see 3.3).
- **Coverage threshold tuning (NFR-4)** is a delivery-time verification (spec OQ-1),
  marked TODO here — not a test scenario.
- **Permanent boundary negative-fixture** — considered and deferred to a follow-up (see
  OQ-TP-1). The story's AC-F3-2 requires only the verify-then-remove procedure.

## 2. References

| Artifact | Path | Role |
|----------|------|------|
| Change specification | `./chg-GH-14-spec.md` | Primary input — F-#, AC-#, NFR-#, DM-#, risks, decisions |
| Story file | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S1--scaffolding.md` | DoR-ready source story incl. Test matrix |
| Implementation plan | `./chg-GH-14-plan.md` | Pending (not yet authored) |
| Testing strategy | `.ai/rules/testing-strategy.md` | Canonical — 6 tiers, CI wiring, over-mocking guardrail |
| TypeScript conventions | `.ai/rules/typescript.md` | Strict tsconfig target, `Result<T,E>`/`MarkSyncError` excerpt, dep-cruiser rules |
| Blueprint §1/§2 | `.ai/local/ceo/ms-0002-blueprint.md` | Authoritative module map + 12-kind `MarkSyncError` union + `SyncState` (not created here) |
| CI workflow | `.github/workflows/ci.yml` | The file this story unguards |
| TDR-0006 | `doc/decisions/TDR-0006-*.md` | dependency-cruiser decision; C-1 = the negative-test acceptance criterion |
| TDR-0008 | `doc/decisions/TDR-0008-*.md` | commitlint + husky decision |
| OPEN-Q9 | deferred Phase 4 open question — CI-unguard checklist | The load-bearing outcome |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

All 16 acceptance criteria from the spec are mapped. None is left unassigned.

| AC ID | Criterion (abbreviated) | TC ID(s) | Status |
|-------|---------------------------|----------|--------|
| AC-F1-1 | `bun install --frozen-lockfile` succeeds | TC-TOOLCHAIN-001 | Covered |
| AC-F1-2 | `bun run typecheck` exits 0 (strict, 8 flags) | TC-TOOLCHAIN-002 | Covered |
| AC-F2-1 | `bun run lint` exits 0 (Biome, zero errors) | TC-TOOLCHAIN-003 | Covered |
| AC-F2-2 | `bun run format:check` exits 0 (no unformatted files) | TC-TOOLCHAIN-004 | Covered |
| AC-F3-1 | `bun run check:boundaries` exits 0 on clean skeleton | TC-BOUNDARIES-001 | Covered |
| AC-F3-2 | scratch `domain → infra` import FAILS with named `from → to + rule`; removing restores green | TC-BOUNDARIES-002 | Covered (verify-then-remove) |
| AC-F4-1 | husky `commit-msg` accepts `feat(scaffolding): init` | TC-COMMITS-001 | Covered (local) |
| AC-F4-2 | husky `commit-msg` rejects `bad message` with rule-named diagnostic | TC-COMMITS-002 | Covered (local) |
| AC-F4-3 | CI commit-message-lint job rejects a `--no-verify` bad commit (TDR-0008 C-2 authoritative-CI half) | TC-COMMITS-003 | Covered (CI run is the proof) |
| AC-F5-1 | skeleton tier dirs + barrels exist per blueprint §1 | TC-SKELETON-001 | Covered |
| AC-F6-1 | `Result<T,E>` + 12-kind `MarkSyncError` compile under strict mode | TC-PRIMITIVES-001, TC-TOOLCHAIN-002 | Covered |
| AC-F6-2 | exhaustive `never`-switch compiles (union complete, extension-safe) | TC-PRIMITIVES-001 | Covered |
| AC-F7-1 | `bun run src/cli/index.ts` prints `marksync 0.0.0` | TC-TOOLCHAIN-005 | Covered (local) |
| AC-F8-1 | smoke test asserting `Result.ok`/`Result.err` → `bun test` exits 0 | TC-PRIMITIVES-001 | Covered |
| AC-F9-1 | zero `continue-on-error`/`|| true` in CI; green PR run | TC-CI-001 | Covered (PR run is the proof) |
| AC-F10-1 | no runtime deps; license-audit rejects GPL/AGPL/LGPL/UNLICENSED | TC-DEPS-001 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No REST/HTTP endpoints (spec §8.1 N/A) and no events/messages (spec §8.2 N/A). The
only interface contracts are the two shared data-model primitives:

| ID | Element | TC ID(s) | Status |
|----|---------|----------|--------|
| DM-1 | `Result<T, E>` (`{ ok: true; value: T } \| { ok: false; error: E }`) | TC-PRIMITIVES-001 | Covered |
| DM-2 | `MarkSyncError` — exhaustive 12-kind discriminated union + `never`-check | TC-PRIMITIVES-001 | Covered |

> `SyncState` (blueprint §2) is **not** created in this story (owned by the
> state-classifier story, MS2-E3); the `src/domain/state/` directory is an empty
> placeholder only (spec §8.3 note).

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status / Notes |
|--------|-------------|----------|----------------|
| NFR-1 | lint + format:check + check:boundaries complete in single-digit seconds | TC-BOUNDARIES-001, TC-TOOLCHAIN-003, TC-TOOLCHAIN-004 | Covered (observational — recorded during run; no hard perf assert at this tier; perf scenarios deferred per testing-strategy.md §"Product performance scenarios") |
| NFR-2 | zero `continue-on-error: true` and zero `|| true` in CI workflows | TC-CI-001 | Covered |
| NFR-3 | TS strict mode — all eight non-negotiable flags | TC-TOOLCHAIN-002 (compiles), TC-PRIMITIVES-001 (smoke under strict) | Covered — `bun run typecheck` exiting 0 is the proof all eight flags are satisfied |
| NFR-4 | coverage baseline (lines/functions = 0.80) | — | **TODO** — delivery-time tuning per spec OQ-1; if the type-only scaffolding cannot meet 0.80, set a documented lower MS-0002-start baseline and revisit at MS-0002 end. See OQ-TP-3. |
| NFR-5 | reproducible install (`--frozen-lockfile` from fresh clone) | TC-TOOLCHAIN-001 | Covered |
| NFR-6 | Bun pinned to a concrete 1.2.x patch in `engines` and CI | TC-CI-001, TC-TOOLCHAIN-001 | Covered (inspection of `engines` + CI matrix) |
| NFR-7 | no runtime dependencies; license-audit blocking (rejects GPL/AGPL/LGPL/UNLICENSED) | TC-DEPS-001 | Covered |
| NFR-8 | boundary accuracy — deliberate violation detected with zero false negatives + named `from → to + rule` | TC-BOUNDARIES-002 | Covered (TDR-0006 C-1/C-2) |

## 4. Test Types and Layers

Per testing-strategy.md, only the **Unit** tier is exercised by this story; Integration /
Golden / Mermaid-DOM / BDD / E2E are explicitly n/a (story Test matrix). Most of this
story's "tests" are **verification procedures** (script gates + manual checks) rather
than `bun:test` scenarios — they are labeled honestly below.

| Verification kind | Runner / mechanism | Location | CI gate? |
|-------------------|--------------------|----------|----------|
| **Unit (the smoke test)** | `bun:test` (`describe`/`it`) | `tests/unit/domain/result.test.ts` | Yes — `bun test tests/unit/ …` in fast-loop |
| **Type-gate (compile proof)** | `tsc` via `bun run typecheck` | repo root (tsconfig.json) | Yes — fast-loop |
| **Lint / format gate** | Biome via `bun run lint` / `format:check` | repo root (biome.json) | Yes — fast-loop |
| **Architecture contract** | dependency-cruiser via `bun run check:boundaries` | repo root (`.dependency-cruiser.cjs`) | Yes — fast-loop (to be wired by this story, OPEN-Q9 item 7) |
| **Boundary negative proof** | manual scratch → `check:boundaries` → remove | `src/domain/_boundary-probe.ts` (ephemeral) | No — verify-then-remove, never committed |
| **Commit-message contract** | commitlint via husky `commit-msg` hook | `.husky/commit-msg`, `commitlint.config.js` | Local hook; CI authoritative gate — see OQ-TP-2 |
| **Entrypoint smoke** | `bun run src/cli/index.ts` (stdout check) | `src/cli/index.ts` | No — manual one-shot |
| **CI unguard proof** | the PR's own CI run | `.github/workflows/ci.yml` | Yes — the run is the proof |
| **Dependency / license hygiene** | `package.json` inspection + osv-scanner + license-checker | repo root + `dependency-audit` job | Yes — `dependency-audit` job (now blocking) |

**Mocking:** none. The over-mocking guardrail (testing-strategy.md §"AI-agent over-mocking
guardrail") is trivially satisfied — the smoke test asserts pure type/literal contracts
with no dependencies to mock. No mocks, no fixtures, no network.

**Tagging convention:** scenarios carry `@backend`/`@toolchain`/`@arch`/`@ci` tags for
filtering; there is no `@ui`/`@api`/`@perf` surface in this story.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-PRIMITIVES-001 | Result shape + exhaustive MarkSyncError switch compiles | Happy Path | Critical | High | AC-F6-1, AC-F6-2, AC-F8-1 |
| TC-BOUNDARIES-001 | dep-cruiser passes on clean skeleton | Happy Path | Critical | High | AC-F3-1 |
| TC-BOUNDARIES-002 | dep-cruiser catches a domain→infra scratch violation | Negative | Critical | High | AC-F3-2 |
| TC-TOOLCHAIN-001 | `bun install --frozen-lockfile` succeeds (fresh clone) | Happy Path | Critical | High | AC-F1-1 |
| TC-TOOLCHAIN-002 | `bun run typecheck` exits 0 under strict config | Happy Path | Critical | High | AC-F1-2, AC-F6-1 |
| TC-TOOLCHAIN-003 | `bun run lint` exits 0 (Biome) | Happy Path | Important | High | AC-F2-1 |
| TC-TOOLCHAIN-004 | `bun run format:check` exits 0 | Happy Path | Important | Medium | AC-F2-2 |
| TC-TOOLCHAIN-005 | CLI entrypoint prints `marksync 0.0.0` | Happy Path | Important | Medium | AC-F7-1 |
| TC-COMMITS-001 | commitlint accepts a Conventional Commits message | Happy Path | Important | Medium | AC-F4-1 |
| TC-COMMITS-002 | commitlint rejects a malformed message | Negative | Important | Medium | AC-F4-2 |
| TC-COMMITS-003 | CI commit-lint rejects a `--no-verify` bad commit (TDR-0008 C-2) | Negative | Critical | High | AC-F4-3 |
| TC-SKELETON-001 | Module skeleton matches blueprint §1 map | Happy Path | Important | Medium | AC-F5-1 |
| TC-CI-001 | CI is unguarded and the PR run is green | Happy Path | Critical | High | AC-F9-1 |
| TC-DEPS-001 | No runtime deps; license-audit configured to reject copyleft | Happy Path | Important | High | AC-F10-1 |

### 5.2 Scenario Details

#### TC-PRIMITIVES-001 - Result shape + exhaustive MarkSyncError switch compiles

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, F-8, AC-F6-1, AC-F6-2, AC-F8-1, DM-1, DM-2, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/result.test.ts` (single combined smoke file; may also assert `MarkSyncError` so it lives alongside `src/domain/errors.ts`)
**Tags**: @backend, @domain

**Preconditions**:

- `src/domain/result.ts` exports `Result<T, E>` (`{ ok: true; value: T } | { ok: false; error: E }`).
- `src/domain/errors.ts` exports the **12-kind** `MarkSyncError` discriminated union from blueprint §2 (Conflict, RemoteMissing, DuplicateUuid, UnsupportedConstruct, Forbidden, LockDirty, ConcurrentWrite, RenderUnavailable, StalePlan, ForbiddenBranch, TooLarge, UnresolvedLink).
- `tsconfig.json` has all eight non-negotiable strict flags enabled (NFR-3).
- `bunfig.toml` test root is `tests`, preload is the no-op Mermaid stub (DEC-5).

**Steps**:

1. In `tests/unit/domain/result.test.ts`, construct `Result.ok(42)` and assert `.ok === true` and `.value === 42`.
2. Construct `Result.err({ kind: "RemoteMissing", pageId: "123" })` and assert `.ok === false` and `.error.kind === "RemoteMissing"`.
3. In the same file (or a sibling `errors.test.ts`), include a function with an exhaustive `switch` over `MarkSyncError["kind"]` whose `default` branch assigns the value to `never` (the typescript.md "Exhaustive checking" pattern). The function need not be called at runtime — its presence is a **compile-time** assertion.
4. Run `bun test tests/unit/`.

**Expected Outcome**:

- All assertions pass; `bun test` exits 0 (green) — satisfies AC-F8-1.
- The test file **typechecks** under strict mode (TC-TOOLCHAIN-002) — the exhaustive `never`-switch compiling is the proof that the 12-kind union is complete and extension-safe (AC-F6-2). If a future kind is added without updating the switch, `tsc` fails — the desired behaviour.
- No mocks, no fixtures, no `any` (typescript.md "When `any` is acceptable").

**Notes / Clarifications**:

- This is the **only** formal automated unit test for the story (story Test matrix). It doubles as a compile-time proof of DM-1/DM-2.
- Per testing-strategy.md naming, the file lives under `tests/unit/` so the CI fast-loop command `bun test tests/unit/ tests/integration/ tests/golden/` picks it up.

---

#### TC-BOUNDARIES-001 - dep-cruiser passes on the clean skeleton

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-1, NFR-8
**Test Type(s)**: Contract
**Automation Level**: Automated
**Target Layer / Location**: repo root — `.dependency-cruiser.cjs` invoked via `bun run check:boundaries`; wired into the CI fast-loop job (OPEN-Q9 item 7)
**Tags**: @arch, @backend

**Preconditions**:

- `.dependency-cruiser.cjs` declares the four tier rules from typescript.md (`domain-may-not-import-infra`, `domain-may-not-import-app`, `presentation-may-not-import-domain`, `presentation-may-not-import-infra`).
- The `#imports`-field aliases resolve under dependency-cruiser (RSK-1 — if not, an explicit alias mapping is added; never disable a rule).
- The committed skeleton (F-5) contains no tier violations.

**Steps**:

1. Run `bun run check:boundaries` on the clean committed tree.

**Expected Outcome**:

- Exit code 0; no violations reported.
- Completes in single-digit seconds (NFR-1 — observe and record; not a hard assert).

**Notes / Clarifications**:

- This is the green baseline that TC-BOUNDARIES-002 mutates. CI repeats this gate on every push once OPEN-Q9 item 7 wires the step.

---

#### TC-BOUNDARIES-002 - dep-cruiser catches a domain→infra scratch violation (verify-then-remove)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-2, NFR-8, TDR-0006 (C-1/C-2), RSK-1
**Test Type(s)**: Contract
**Automation Level**: Semi-automated (developer runs the procedure once at delivery; the scratch file is never committed in a passing state)
**Target Layer / Location**: ephemeral `src/domain/_boundary-probe.ts` (created and deleted in the same session)
**Tags**: @arch

**Preconditions**:

- TC-BOUNDARIES-001 is green (clean baseline).
- A real importable target exists under `src/infra/` (e.g. a barrel `src/infra/confluence/index.ts` or any committed module); if none exists yet, point the probe at any `src/infra/**` path that resolves.

**Steps**:

1. Create a temporary file `src/domain/_boundary-probe.ts` containing a single import that crosses the forbidden edge, e.g. `import "#infra/confluence/client";` (or `import "../../infra/confluence/client";`).
2. Run `bun run check:boundaries`.
3. **Observe**: non-zero exit; the report names the rule (`domain-may-not-import-infra`), the `from` path (`src/domain/…`), and the `to` path (`src/infra/…`). This is the TDR-0006 C-1 acceptance proof and the NFR-8 zero-false-negative guarantee.
4. Delete `src/domain/_boundary-probe.ts`.
5. Re-run `bun run check:boundaries`.

**Expected Outcome**:

- Step 2 → FAIL with a named `from → to + rule` violation (zero false negatives).
- Step 5 → exit 0 (green restored).

**Postconditions**:

- No scratch file remains in the working tree or in the commit. `git status` is clean of `_boundary-probe.ts`.

**Notes / Clarifications**:

- This is a **one-shot developer verification**, not a committed automated test — a permanently-failing import cannot live in the main tree (dep-cruiser fails the whole run on any violation). See OQ-TP-1 for the recommended permanent-negative-fixture follow-up that would make NFR-8 regression-proof against a future rule disabling.
- If step 2 does NOT fail, RSK-1 has materialized: dependency-cruiser is not resolving the `#imports` alias. Add the explicit alias mapping (`resolved` / `tsConfig` / `webpackConfig` Maui in `.dependency-cruiser.cjs`) per TDR-0006 implementation guidance and re-run. **Never disable the rule to make it pass.**

---

#### TC-TOOLCHAIN-001 - `bun install --frozen-lockfile` succeeds (reproducible install)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-10, AC-F1-1, NFR-5, NFR-6
**Test Type(s)**: Integration
**Automation Level**: Automated (CI repeats on every run) + Manual (one-shot fresh-clone proof at delivery)
**Target Layer / Location**: repo root — `package.json`, `bun.lock`, `engines` field; CI fast-loop + `dependency-audit` jobs both run `bun install --frozen-lockfile`
**Tags**: @toolchain, @ci

**Preconditions**:

- `bun.lock` is committed (not `bun.lockb` legacy form unless required).
- `package.json#engines` pins Bun to a concrete 1.2.x patch (DEC-6, NFR-6).
- CI matrix `bun-version` is the same concrete patch (replaces the floating `"1.2"`).

**Steps**:

1. (Local) In a fresh clone, run `bun install --frozen-lockfile`.
2. (CI) Confirm the fast-loop `Install dependencies` step and the `dependency-audit` job's `Install dependencies` step both run `bun install --frozen-lockfile` and pass.

**Expected Outcome**:

- Exit 0; install resolves exactly against the committed lockfile with no mutation, no registry drift.
- No `continue-on-error` on either install step (NFR-2).

**Notes / Clarifications**:

- The fresh-clone run is the canonical NFR-5 proof; CI repeats it on every push.

---

#### TC-TOOLCHAIN-002 - `bun run typecheck` exits 0 under strict config

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, AC-F6-1, NFR-3
**Test Type(s)**: Manual (verification that the script exits 0)
**Automation Level**: Automated (CI fast-loop `Typecheck` step)
**Target Layer / Location**: repo root — `tsconfig.json` (the eight strict flags), `src/**/*.ts`
**Tags**: @toolchain, @backend, @ci

**Preconditions**:

- `tsconfig.json` is the exact strict config from typescript.md §"TypeScript configuration (target)" (`strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUncheckedSideEffectImports`, `types:["bun"]` + the secondary flags).
- `include: ["src/**/*.ts"]`, `exclude: ["node_modules","dist","tests"]`.
- `src/domain/result.ts`, `src/domain/errors.ts`, and `src/cli/index.ts` all compile.

**Steps**:

1. Run `bun run typecheck`.

**Expected Outcome**:

- Exit 0; zero errors. This is the proof all eight non-negotiable strict flags are satisfied (NFR-3) and that DM-1/DM-2 compile (AC-F6-1).
- The exhaustive `never`-switch in TC-PRIMITIVES-001 compiling is a sub-case of this gate.

---

#### TC-TOOLCHAIN-003 - `bun run lint` exits 0 (Biome, zero errors)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, AC-F2-1, NFR-1
**Test Type(s)**: Manual (verification that the script exits 0)
**Automation Level**: Automated (CI fast-loop `Lint` step)
**Target Layer / Location**: repo root — `biome.json` (recommended rules only, DEC-4)
**Tags**: @toolchain, @ci

**Preconditions**:

- `biome.json` exists with recommended rules (no bespoke rules — DEC-4/NG-6).
- The committed skeleton + primitives are Biome-clean.

**Steps**:

1. Run `bun run lint`.

**Expected Outcome**:

- Exit 0; zero errors. Completes in single-digit seconds alongside format/boundaries (NFR-1).

---

#### TC-TOOLCHAIN-004 - `bun run format:check` exits 0 (no unformatted files)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-2, AC-F2-2
**Test Type(s)**: Manual
**Automation Level**: Automated (CI fast-loop — should be wired alongside lint per the testing-strategy CI sketch)
**Target Layer / Location**: repo root — `biome.json` formatter config
**Tags**: @toolchain, @ci

**Preconditions**:

- All committed files are Biome-formatted (run `bun run format` once before committing).

**Steps**:

1. Run `bun run format:check`.

**Expected Outcome**:

- Exit 0; no diff reported.

**Notes / Clarifications**:

- `format:check` (read-only) is the CI gate; `format` (write) is the developer convenience. Ensure CI runs the check variant.

---

#### TC-TOOLCHAIN-005 - CLI entrypoint prints `marksync 0.0.0`

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-7, AC-F7-1
**Test Type(s)**: Manual
**Automation Level**: Manual (not asserted by CI; CI does not run the CLI)
**Target Layer / Location**: `src/cli/index.ts`
**Tags**: @backend, @cli

**Preconditions**:

- `src/cli/index.ts` exists and prints the version string (no real command — NG-2).

**Steps**:

1. Run `bun run src/cli/index.ts` (or `bun run src/cli/index.ts` directly).
2. Capture stdout.

**Expected Outcome**:

- stdout contains exactly `marksync 0.0.0` (newline-terminated). Proves the toolchain compiles and executes end-to-end.

**Notes / Clarifications**:

- This is a smoke that the toolchain runs, not a behaviour test. It is acceptable for CI not to assert stdout (the typecheck + unit test already prove compilation); the developer runs this once at delivery. If a maintainer later wants it automated, a trivial `bun test` spawning the process and asserting stdout could be added — out of scope here.

---

#### TC-COMMITS-001 - commitlint accepts a Conventional Commits message

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-1
**Test Type(s)**: Manual
**Automation Level**: Manual (local husky `commit-msg` hook); CI authoritative gate — see OQ-TP-2
**Target Layer / Location**: `.husky/commit-msg`, `commitlint.config.js` (extends `@commitlint/config-conventional`, `header-max-length: 72`, imperative mood)
**Tags**: @toolchain

**Preconditions**:

- `bun install` ran the `prepare` script, which installed the husky `commit-msg` hook (RSK-6 mitigation).

**Steps**:

1. Stage an empty/trivial change.
2. Attempt `git commit -m "feat(scaffolding): init"`.

**Expected Outcome**:

- Commit is accepted (hook exits 0); the commit is created.

---

#### TC-COMMITS-002 - commitlint rejects a malformed message

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-2
**Test Type(s)**: Manual
**Automation Level**: Manual (local hook); CI authoritative gate — see OQ-TP-2
**Target Layer / Location**: `.husky/commit-msg`, `commitlint.config.js`
**Tags**: @toolchain

**Preconditions**:

- husky `commit-msg` hook is installed (as TC-COMMITS-001).

**Steps**:

1. Stage a change.
2. Attempt `git commit -m "bad message"`.

**Expected Outcome**:

- Commit is **rejected**; the hook prints a rule-named diagnostic (e.g. `type-enum`, `subject-empty`) and exits non-zero. No commit is created.

**Notes / Clarifications**:

- Inception squash-merge history is grandfathered (TDR-0008 C-5) — enforcement applies to new commits from this story forward only.

---

#### TC-COMMITS-003 - CI commit-lint rejects a `--no-verify` bad commit (TDR-0008 C-2)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-3, TDR-0008 (C-2), RSK-6
**Test Type(s)**: Manual
**Automation Level**: Manual (one-shot verification — the PR's own CI run is the evidence; not a `bun:test` scenario)
**Target Layer / Location**: CI `commit-lint` job in `.github/workflows/ci.yml` (lints every pushed commit message)
**Tags**: @ci, @toolchain

**Preconditions**:

- A CI commit-message-lint job exists in `.github/workflows/ci.yml` and runs on every push/PR with **no** `continue-on-error` (wired by this story per the resolved OQ-TP-2).
- The local husky `commit-msg` hook is installed (TC-COMMITS-001) — this procedure deliberately bypasses it with `--no-verify`.

**Steps**:

1. On the PR branch, make a trivial change and commit it **bypassing** the local hook: `git commit --no-verify -m "bad message"`.
2. Push the commit to the PR branch (or open the PR).
3. **Observe** the CI `commit-lint` job: it **FAILS** on the non-Conventional message (`bad message` violates `type-enum` / `subject-empty`), proving the local-hook bypass is caught authoritatively (TDR-0008 C-2).
4. Amend the commit message to a valid Conventional Commits message — e.g. `git commit --amend -m "fix(scaffolding): test"` — and push.
5. **Observe** the CI `commit-lint` job now **passes** and the PR's overall CI run returns green.

**Expected Outcome**:

- Step 3 → CI `commit-lint` job FAILS with a rule-named diagnostic for the malformed message. The `--no-verify` local bypass does **not** escape enforcement — CI is authoritative (AC-F4-3, TDR-0008 C-2).
- Step 5 → CI `commit-lint` job passes once the message is Conventional.

**Postconditions**:

- The final pushed commit on the PR branch carries a Conventional Commits message; the PR's CI run is green.

**Notes / Clarifications**:

- This is the **authoritative-CI-half** proof that complements the local-hook tests (TC-COMMITS-001 / TC-COMMITS-002). It is a **one-shot manual verification** whose evidence is the PR's own CI run — **not** an automated `bun:test` (CI commit-message linting is a platform job, not a unit scenario).
- Resolves **OQ-TP-2**: PM decided the CI commit-lint job is **in scope** for GH-14 — the spec's G-4 / DEC-3 / F-4 "CI (authoritative)" claim is now backed by a real AC (AC-F4-3) + a CI job + this TC.
- Inception squash-merge history is grandfathered (TDR-0008 C-5); enforcement applies to new commits from this story forward only.

---

#### TC-SKELETON-001 - Module skeleton matches blueprint §1 map

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-5, AC-F5-1
**Test Type(s)**: Manual
**Automation Level**: Manual (directory inspection against the blueprint)
**Target Layer / Location**: `src/cli/{commands,output}/`, `src/app/`, `src/domain/{identity,config,binding,state,hierarchy,markdown,render,assets,mermaid,git,target}/`, `src/infra/{git,mermaid,lock,push,confluence}/`, `src/shared/`
**Tags**: @arch

**Preconditions**:

- The skeleton has been created per story scope item 7.

**Steps**:

1. Walk the `src/` tree and compare against blueprint §1 ("Module map").
2. Confirm each tier directory and barrel file exists; confirm `src/domain/result.ts` and `src/domain/errors.ts` exist (the only non-empty modules).

**Expected Outcome**:

- Every tier directory from blueprint §1 is present; barrels exist where natural; directories are otherwise empty (no domain logic — NG-1). `src/domain/state/` exists as an empty placeholder (SyncState is owned by MS2-E3).

**Notes / Clarifications**:

- Could be trivially automated (a `bun:test` asserting directory existence), but the value is low for a one-time scaffolding check and the dependency-cruiser rules (TC-BOUNDARIES-001) already structurally enforce the tier layout. Kept manual.

---

#### TC-CI-001 - CI is unguarded and the PR run is green

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-9, AC-F9-1, NFR-2, NFR-6, OPEN-Q9
**Test Type(s)**: Manual (review `ci.yml`) + the PR's CI run as the automated proof
**Automation Level**: Automated (the CI run itself)
**Target Layer / Location**: `.github/workflows/ci.yml` — fast-loop + dependency-audit + doc-yaml-lint jobs
**Tags**: @ci

**Preconditions**:

- All `continue-on-error: true` and `|| true` advisory guards have been removed from `ci.yml` (install, lint, typecheck, test, test:bdd, osv-scanner, license-audit).
- Bun is pinned to a concrete 1.2.x patch in the CI matrix (DEC-6).
- A `check:boundaries` step has been added to the fast-loop job (OPEN-Q9 item 7).

**Steps**:

1. Grep `ci.yml` for `continue-on-error` and `|| true` — expect **zero** matches in the fast-loop and dependency-audit jobs.
2. Open the PR and observe the CI run.

**Expected Outcome**:

- Zero `continue-on-error: true`; zero `|| true` (NFR-2).
- The PR's CI run is **green**: `fast-loop` (Lint, Typecheck, Test, BDD, check:boundaries), `dependency-audit` (osv-scanner + license-checker, now blocking), and `doc-yaml-lint` all pass.
- The green run **with guards removed** is itself the evidence that unguarding is safe (spec §18 — "the PR is its own proof").

**Notes / Clarifications**:

- This is the load-bearing outcome of the story. If any step is still guarded, OPEN-Q9 is not closed and the story is not done.

---

#### TC-DEPS-001 - No runtime dependencies; license-audit rejects copyleft

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-10, AC-F10-1, NFR-7
**Test Type(s)**: Manual (inspect `package.json`) + Contract (CI license-audit)
**Automation Level**: Automated (CI `dependency-audit` job, now blocking) + Manual (one-shot `package.json` inspection)
**Target Layer / Location**: `package.json` (`dependencies` vs `devDependencies`); CI `License audit` step (`license-checker --production --failOn "GPL;AGPL;LGPL;UNLICENSED"`)
**Tags**: @toolchain, @ci, @security

**Preconditions**:

- Only devDependencies are declared (Biome, dependency-cruiser, commitlint, husky). `dependencies` is empty/absent (NG-5).

**Steps**:

1. Inspect `package.json`: confirm no `dependencies` (or an empty object); confirm devDependencies are present.
2. Confirm the CI `License audit` step runs `license-checker --production --failOn "GPL;AGPL;LGPL;UNLICENSED"` with **no** `continue-on-error`.
3. (Negative spot-check, optional) mentally confirm every devDependency is MIT (per their decision records) — license compatibility is a human determination (spec §8.4).

**Expected Outcome**:

- `--production` yields zero packages (no runtime deps) → license-audit trivially passes; the gate is nonetheless **binding** for every future story that adds a runtime dep.
- osv-scanner vulnerability scan runs and passes (or reports none).

**Notes / Clarifications**:

- The osv-scanner lockfile flag (`--lock-file` vs `-L`/`--lockfile`) is spec OQ-2 — resolve at delivery by checking the installed version's flag.

## 6. Environments and Test Data

- **Local dev** — Bun pinned to the concrete 1.2.x patch (NFR-6); used for the one-shot manual verifications (TC-BOUNDARIES-002, TC-COMMITS-001/002, TC-TOOLCHAIN-005, TC-SKELETON-001).
- **CI (ubuntu-latest)** — same pinned Bun; runs install + lint + typecheck + test + BDD + check:boundaries + osv-scanner + license-checker + yaml/markdown lint. The PR's green run satisfies TC-CI-001.
- **Fresh clone** — used once for TC-TOOLCHAIN-001 (the reproducible-install proof).
- **Test data**: none. The smoke test uses inline literals (`42`, a literal `MarkSyncError` object). No fixtures, no golden files, no network, no secrets.
- **Isolation**: the boundary-negative scratch file (TC-BOUNDARIES-002) is created and deleted in the same session and is never committed. No other shared mutable state.

## 7. Automation Plan and Implementation Mapping

| TC ID | Test file / artifact | Execution command | Mocking | Status |
|-------|----------------------|--------------------|---------|--------|
| TC-PRIMITIVES-001 | `tests/unit/domain/result.test.ts` (new) | `bun test tests/unit/` | None | To Implement |
| TC-BOUNDARIES-001 | `.dependency-cruiser.cjs` + `check:boundaries` script (new) | `bun run check:boundaries` | None | To Implement (config + script) |
| TC-BOUNDARIES-002 | ephemeral `src/domain/_boundary-probe.ts` (not committed) | `bun run check:boundaries` (mutated tree) | None | Manual Only (verify-then-remove) |
| TC-TOOLCHAIN-001 | `bun.lock` + `package.json#engines` (new/updated) | `bun install --frozen-lockfile` | None | Existing (CI step) — guards removed |
| TC-TOOLCHAIN-002 | `tsconfig.json` (new) + `typecheck` script | `bun run typecheck` | None | To Implement (config + script) |
| TC-TOOLCHAIN-003 | `biome.json` (new) + `lint` script | `bun run lint` | None | To Implement (config + script) |
| TC-TOOLCHAIN-004 | `biome.json` + `format:check` script | `bun run format:check` | None | To Implement (script) |
| TC-TOOLCHAIN-005 | `src/cli/index.ts` (new) | `bun run src/cli/index.ts` | None | To Implement |
| TC-COMMITS-001 | `.husky/commit-msg` + `commitlint.config.js` (new) | `git commit -m "feat(scaffolding): init"` | None | To Implement (hook + config) |
| TC-COMMITS-002 | (same as TC-COMMITS-001) | `git commit -m "bad message"` | None | Manual Only (uses same hook) |
| TC-COMMITS-003 | CI `commit-lint` job in `.github/workflows/ci.yml` (new) | PR CI run — push a `--no-verify` bad commit (observe fail), amend to Conventional (observe pass) | None | Manual Only (one-shot — PR CI run is the evidence) |
| TC-SKELETON-001 | `src/**` directory tree (new) | manual `ls` / tree inspection | None | To Implement (skeleton creation) |
| TC-CI-001 | `.github/workflows/ci.yml` (updated — unguard + add check:boundaries step) | PR CI run | None | Existing – Update (remove guards, add step) |
| TC-DEPS-001 | `package.json` + CI `dependency-audit` job | `license-checker --production --failOn …` (CI) | None | Existing – Update (make blocking) |

**Summary of automation posture**: exactly **one** `bun:test` file (TC-PRIMITIVES-001).
The remaining verifications are either CI script gates (install/lint/typecheck/test/
boundaries/license-audit — automated but not `bun:test` scenarios) or one-shot developer
procedures (boundary-negative, commit accept/reject, CLI run, skeleton walk, ci.yml
review). This matches the story's Test matrix exactly: Unit = one smoke; all other tiers
= n/a.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| TR-1 | dependency-cruiser cannot resolve the `#imports`-field aliases → false negatives (NFR-8 silently broken) | High | TC-BOUNDARIES-002 is the canary: if step 2 does not fail, add the explicit alias mapping per TDR-0006 (RSK-1). Never disable a rule to pass. |
| TR-2 | The boundary negative proof (TC-BOUNDARIES-002) is a one-shot manual check → a future rule disabling is not regression-caught | Medium | Acceptable for this story (matches AC-F3-2 verbatim); recommend permanent negative-fixture follow-up — OQ-TP-1. |
| TR-3 | CI unguard exposes a latent config error masked during inception | Medium | Ensure full local green (`bun run check`) before opening the PR. RSK-2 residual is config errors only (no source existed to hide defects). |
| TR-4 | The smoke test is too thin to catch a primitives regression | Low | Accepted — the smoke's real value is the compile-time exhaustive-switch proof (AC-F6-2); runtime behaviour of `Result` is trivial. Domain stories add real unit suites. |
| TR-5 | Bun version misalignment breaks install or snapshots | Medium | Pin both `engines` and CI to the same concrete 1.2.x patch (DEC-6, NFR-6); TC-TOOLCHAIN-001 verifies. |

### 8.2 Assumptions

- The four code-quality decisions (TDR-0005, TDR-0006, TDR-0008, ADR-0001) are governance-`Accepted` and are being implemented, not reconsidered (spec §12).
- The blueprint §1/§2 module map and the 12-kind `MarkSyncError` union are the authoritative shared contracts (spec §12).
- Exact config contents come from typescript.md (the authoritative convention file) — this plan does not redefine them.
- husky installs the `commit-msg` hook via the `prepare` script on `bun install` (RSK-6).
- Inception-era advisory CI guards were masking nothing (no source existed), so unguarding introduces only config-correctness risk (spec §12).

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | Should a **permanent** boundary negative-fixture (`tests/architecture/boundary-negative.test.ts` that runs dep-cruiser against a committed `tests/architecture/fixtures/domain-to-infra/` violation and asserts it is reported) be added to make NFR-8 regression-proof? | No (for this story) | @plan-writer / @coder (follow-up) | AC-F3-2 requires only the verify-then-remove procedure, which this plan honours (TC-BOUNDARIES-002). A permanent fixture would guard against a future rule being silently disabled — recommended as a small follow-up, **not** a scope expansion of GH-14. |
| OQ-TP-2 | **RESOLVED (DoR iter-2, 2026-07-07).** PM decided the CI commit-message-lint job is **in scope** for GH-14. _Original question:_ spec F-4/G-4/DEC-3 claim "CI (authoritative)" for commit enforcement, but no AC or scope item wired a commitlint CI action and none existed in `ci.yml`. _Resolution:_ spec now carries **AC-F4-3** (CI rejects a `--no-verify` bad commit — TDR-0008 C-2 authoritative-CI half); this plan adds **TC-COMMITS-003** (manual/one-shot — the PR's CI run is the evidence, not a `bun:test`). TC-COMMITS-001/002 remain Manual (local hook). No longer a gap. | No (resolved) | @pm (decided) / @spec-writer / @test-plan-writer | Closed 2026-07-07. The "CI authoritative gate — see OQ-TP-2" pointers in TC-COMMITS-001/002 and §4 now resolve to TC-COMMITS-003. |
| OQ-TP-3 | (Mirrors spec OQ-1.) Can the 0.80 coverage threshold (NFR-4) be met by the type-only scaffolding + one smoke test, or must a lower MS-0002-start baseline be set? | No | @coder (delivery-time tuning) | If `bun test` fails the threshold, set a documented lower baseline and revisit at MS-0002 end. Coverage threshold is a bunfig concern, not a TC. |
| OQ-TP-4 | (Mirrors spec OQ-2.) osv-scanner lockfile flag spelling (`--lock-file` vs `-L`/`--lockfile`)? | No | @coder (delivery) | Resolve by checking the installed osv-scanner version's flag. Affects the `dependency-audit` job only. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | test-plan-writer (GH-14) | Initial test plan — derived from `chg-GH-14-spec.md`, story MS2-E2-S1, blueprint §1/§2, testing-strategy.md, and typescript.md. 13 TCs cover all 15 ACs + 8 NFRs (NFR-4 deferred as TODO per spec OQ-1). Single automated unit smoke; remainder are CI gates or manual/semi-automated procedures per the story's Test matrix. |
| 1.1 | 2026-07-07 | test-plan-writer (GH-14, DoR iter-2) | DoR iter-2 remediation (NOT_READY → target Ready). Added **TC-COMMITS-003** (manual/one-shot; PR CI run is the evidence) tracing to new **AC-F4-3** — CI commit-message-lint job rejects a `--no-verify` bad commit (TDR-0008 C-2 authoritative-CI-half proof). Added AC-F4-3 → TC-COMMITS-003 to the §3.1 traceability table (15 → 16 ACs) and to the Scenario Index (5.1), Scenario Details (5.2), and Automation Plan (7). **Resolved OQ-TP-2** — PM decided the CI commit-lint job is in scope for GH-14. No other AC/NFR mappings, no over-mocking note, and no other TC coverage changed. |

## 10. Test Execution Log

_Populated during/after delivery. The PR's green CI run is the authoritative evidence for TC-CI-001; manual/semi-automated TCs are recorded here with the verifier and date._

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(pending delivery)_ | | | |
