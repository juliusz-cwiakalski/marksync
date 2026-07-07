---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-14-project-scaffolding
status: Proposed
created: 2026-07-07T00:00:00Z
last_updated: 2026-07-07T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, OPEN-Q9, critical]
links:
  change_spec: ./chg-GH-14-spec.md
  story_file: ../../../planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S1--scaffolding.md
  test_plan: ./chg-GH-14-test-plan.md
  conventions:
    - ../../.ai/rules/typescript.md
    - ../../.ai/rules/testing-strategy.md
  blueprint: ../../.ai/local/ceo/ms-0002-blueprint.md
  decisions:
    - ../../../decisions/TDR-0005-linter-and-formatter.md
    - ../../../decisions/TDR-0006-import-boundary-enforcement.md
    - ../../../decisions/TDR-0008-conventional-commits-enforcement.md
  open_question_q9: ../../../inception/open-questions/phase-4-open-questions.md
summary: >
  The first implementation story of MS-0002 and epic MS2-E2 (Foundation). Stands
  up the entire greenfield TypeScript+Bun dev toolchain — the ESM project manifest
  with `#imports`-field aliases, the strict TS compiler config, the Bun test config,
  Biome lint/format (TDR-0005), dependency-cruiser import-boundary enforcement
  (TDR-0006), and commitlint+husky Conventional Commits enforcement (TDR-0008) —
  plus the ports-and-adapters module skeleton and the two shared domain primitives
  (`Result<T,E>` + the exhaustive 12-kind `MarkSyncError`). The load-bearing outcome
  is OPEN-Q9: removing every `continue-on-error` / `|| true` advisory CI guard and
  pinning Bun to a concrete patch so CI becomes binding (not silently masked).
version_impact: none
---

# IMPLEMENTATION PLAN — GH-14: [MS2-E2-S1] Project scaffolding — TS+Bun tooling, ports-and-adapters skeleton, CI unguard

## Context and Goals

This plan delivers the **first implementation story of MS-0002** from a
greenfield (doc-only) state: no `package.json`, `tsconfig.json`, Biome,
dependency-cruiser, commitlint, `src/`, or `tests/` exist yet. It establishes
the complete dev toolchain, the ports-and-adapters module skeleton, and the two
cross-cutting shared primitives (`Result<T,E>` + the exhaustive 12-kind
`MarkSyncError`) that every later domain story compiles against. Critically, it
executes **OPEN-Q9** — the CI-unguard checklist — so that every subsequent
story's lint/typecheck/test/boundary/audit signal is **binding**, not silently
masked by inception-era `continue-on-error` / `|| true` guards.

**Why ordering matters:** this story is unblocked and unblocks **all** of
MS2-E2-S2/S3/S4 and MS2-E3. Until CI is unguarded, no story has an
authoritative quality gate. Therefore the CI unguard is placed **last** (Phase 8)
so the PR that removes the guards is itself provably green under those guards
removed — the green CI run on this PR is the evidence that unguarding is safe.

**Authoritative sources for exact config contents** (the coder copies verbatim
from these; this plan does not paraphrase them):

- **TS compiler config, project manifest `imports`/`exports`, Bun test config,
  dependency-cruiser rule sketch, Biome scripts** → `typescript.md` (the
  authoritative convention file, listed in `links.conventions`).
- **Target `src/` tier tree + `Result<T,E>` / `MarkSyncError` definitions** →
  blueprint §1/§2 (`links.blueprint`, CEO working memory / shared contract).
- **Test tiers + CI wiring** → `testing-strategy.md`.
- **Tool selections** → TDR-0005 (Biome), TDR-0006 (dependency-cruiser),
  TDR-0008 (commitlint + husky); runtime stack → ADR-0001.
- **CI-unguard checklist** → OPEN-Q9 (`links.open_question_q9`).

**CEO pre-resolutions carried in (no escalation needed):**

- **R1** — Mermaid preload is a no-op stub now; E4-S1 (MS2-E4) populates the
  happy-dom registrant (spec DEC-5).
- **R2** — dependency-cruiser `#imports`-alias resolution is verified in-story;
  if unresolved, add an explicit alias mapping (`resolved`/`tsConfig`/`webpackConfig`)
  in `.dependency-cruiser.cjs`; never disable a rule (spec RSK-1).
- **Q1** — commitlint (not Biome) for commit messages, wired via husky's
  `commit-msg` hook (not `pre-commit`); CI authoritative (spec DEC-3).

**Open questions (delivery-time verification/tuning — no `@decision-advisor`
escalation unless they block delivery):**

- **OQ-1 (coverage threshold):** the `bunfig.toml` baseline is
  `lines/functions = 0.80` per typescript.md. Near-empty/type-only scaffolding
  may not meet it. Verify in Phase 7; if the smoke test cannot meet 80%, set a
  documented lower MS-0002-start baseline and revisit at MS-0002 end.
- **OQ-2 (osv-scanner flag):** the existing ci.yml inline comment flags
  `--lock-file` vs `-L`/`--lockfile`. Verify against the installed osv-scanner
  version's flag in Phase 8.
- **Bun patch:** local is `1.1.34`; CI floats `"1.2"`. Align both to a concrete
  current stable **1.2.x** patch (snapshot stability, ADR-0002 C-1 / spec DEC-6)
  — resolve the exact patch in Phase 1 (coder checks latest stable 1.2.x).

## Scope

### In Scope

- **F-1** TS + Bun strict foundation: project manifest (ESM, `exports`,
  `#imports` aliases, scripts, `engines` Bun pin, devDependencies only), strict
  TS compiler config, Bun test config.
- **F-2** Biome lint + format config + `lint`/`format`/`format:check` scripts
  (TDR-0005, recommended rules only).
- **F-3** dependency-cruiser config — the four ports-and-adapters tier rules +
  `check:boundaries` script (TDR-0006); `#imports`-alias resolution verified.
- **F-4** commitlint config + husky `commit-msg` hook + `prepare` script
  (TDR-0008).
- **F-5** Ports-and-adapters module skeleton: empty tier directories + barrel
  files per blueprint §1.
- **F-6** Shared primitives `Result<T,E>` and the exhaustive 12-kind
  `MarkSyncError` with the `never`-check pattern (blueprint §2).
- **F-7** Trivial CLI entrypoint printing `marksync 0.0.0`.
- **F-8** Five test-tier directories + a passing smoke test + no-op Mermaid
  preload stub.
- **F-9 / OPEN-Q9** CI unguard: remove all `continue-on-error: true` and
  `|| true`; pin Bun to a concrete patch in CI; make dependency/license audit
  blocking; add the `check:boundaries` CI step.
- **F-10** `.gitignore` additions + committed `bun.lock` + `engines` Bun pin.
- Minimal "under construction" README project section (full README out of scope).

### Out of Scope

- [OUT] Any domain logic — identity, config loading, state classification,
  binding, hierarchy, markdown, render, assets, mermaid, git, target
  (MS2-E2-S2 onward).
- [OUT] Real CLI commands, `CommandResult<T>`, output formatters, redaction
  (MS2-E2-S3).
- [OUT] `bun build --compile` binary target / release pipeline (MS2-E5-S4;
  MS2-E1-S3 validated the mechanism).
- [OUT] Any runtime dependencies (markdown pipeline, mermaid, uuid, ajv, zod,
  pino, etc.) — land in the stories that use them.
- [OUT] Bespoke Biome lint rules (recommended rules only).
- [OUT] `SyncState` / state classifier (owned by the state-classifier story).
- [OUT] README polish/badges/full docs (post-MS-0002 / MS-0008).
- [OUT] Reopening ADR-0001 or any accepted decision.
- [OUT] OPEN-Q9 item 10 (YAML-lint frontmatter validation) — the doc-lint job is
  preserved as-is.

### Constraints

- **Strict TS is non-negotiable:** all eight strict flags (NFR-3) must be enabled
  exactly as in `typescript.md` §"TypeScript configuration (target)"; never
  weaken a flag to satisfy a linter.
- **`#imports` field, not tsconfig `paths`:** runtime-respected and
  `bun build --compile`-safe (spec DEC-2).
- **commit-msg hook, not pre-commit:** husky runs commitlint on the
  `commit-msg` hook; CI is the authoritative gate (spec DEC-3).
- **No runtime dependencies:** devDependencies only; lockfile committed so
  `--frozen-lockfile` is reproducible (NFR-5/NFR-7).
- **Rules are never disabled to make CI green:** if dep-cruiser cannot resolve
  aliases, add an explicit mapping (RSK-1); if a legitimate commit is blocked,
  add it to `ignores`, never weaken the convention.
- **Each phase is one Conventional Commit** (imperative, lowercase, ≤72-char
  subject) — verifiable by the `commit-msg` hook installed in Phase 5.
- **Bun pinned to a concrete 1.2.x patch** in both `engines` and CI (NFR-6).

### Risks

- **RSK-1 (dep-cruiser alias resolution):** dependency-cruiser may not resolve
  Bun `#imports` aliases out of the box → false negatives. **Mitigated by** the
  Phase 6 negative-test (AC-F3-2): add a `domain→infra` scratch import, observe
  FAIL with a named `from → to + rule`, remove it, observe PASS. If unresolved,
  add an explicit alias mapping; never disable a rule.
- **RSK-3 (Bun version misalignment):** local `1.1.34` vs CI floating `"1.2"`.
  **Mitigated by** pinning both `engines` and CI to one concrete 1.2.x patch
  (Phase 1 + Phase 8).
- **RSK-4 (Mermaid preload warns):** stub the preload as a no-op import (DEC-5);
  E4-S1 populates it.
- **RSK-5 (coverage threshold):** the 0.80 baseline may be unsatisfiable on
  type-only modules. **Mitigated by** OQ-1 fallback (documented lower baseline).
- **RSK-6 (hook absent on fresh clones/agents):** CI is authoritative
  (TDR-0008 C-2); `prepare` installs hooks on `bun install`.
- **RSK-7 (osv-scanner flag drift):** resolve by checking the installed
  version's flag (OQ-2, Phase 8).

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| `bun run check` (lint + typecheck + test + boundaries) | exits 0, single-digit seconds | AC-F2-1/F1-2/F3-1/F8-1 |
| Reproducible install | `bun install --frozen-lockfile` succeeds from a fresh clone | AC-F1-1 |
| Boundary accuracy | a deliberate `domain→infra` scratch import is detected (zero false negatives) | AC-F3-2 |
| Commit enforcement | malformed message rejected by `commit-msg` hook; Conventional accepted | AC-F4-1/F4-2 |
| CI binding | zero `continue-on-error: true` and zero `|| true` remain; green PR run | AC-F9-1 |
| Primitives compile | `Result<T,E>` + 12-kind `MarkSyncError` + `never`-switch typecheck strict | AC-F6-1/F6-2 |
| Entrypoint runs | `bun run src/cli/index.ts` prints `marksync 0.0.0` | AC-F7-1 |
| Dependency hygiene | no runtime deps; license-audit rejects GPL/AGPL/LGPL/UNLICENSED | AC-F10-1 |

## Phases

### Phase 1: Project manifest, repo hygiene & dependency install

**Goal**: Create the ESM project manifest with `#imports`-field aliases and all
npm scripts, the `engines` Bun pin, the devDependencies (tooling only — no
runtime deps), the `.gitignore` hygiene entries, and the committed lockfile —
the foundation every later phase compiles/installs against.

**Tasks**:

- [x] **1.1** Resolved concrete stable **1.2.x** Bun patch to **1.2.23**
      (latest stable 1.2.x — confirmed via npm registry + GH releases
      `bun-v1.2.23`); pins both `package.json#engines` and CI (NFR-6 / DEC-6).
      Note: local box has Bun 1.1.34 (which emits legacy binary `bun.lockb`);
      the text `bun.lock` (AC-F1) requires Bun 1.2.x — a Bun 1.2.23 binary is
      used for all install/test/check runs in this delivery.
- [x] **1.2** Created `package.json` per `typescript.md`: `"type": "module"`;
      `"exports"` (public surface copied verbatim); `"imports"` aliases
      `#domain/*`, `#app/*`, `#infra/*`, `#shared/*` (DEC-2); scripts
      `lint`/`format`/`format:check`/`typecheck`/`test`/`test:bdd`/`check`/
      `check:boundaries`/`prepare`; `engines.bun` = `1.2.23`. devDependencies
      only (resolved by `bun add`): `@biomejs/biome@^2.5.2`,
      `dependency-cruiser@^18.0.0`, `@commitlint/cli@^21.2.0`,
      `@commitlint/config-conventional@^21.2.0`, `husky@^9.1.7`. **No runtime
      dependencies** (NFR-7 / AC-F10-1).
- [x] **1.3** Added `.gitignore` TS entries `node_modules/`, `dist/`, `coverage/`,
      `.marksync/`, `*.tsbuildinfo` (Go-oriented legacy entries preserved).
      Verified `node_modules/` ignored before install (`git check-ignore`).
- [x] **1.4** Ran `bun install` → committed text `bun.lock` (lockfileVersion 1);
      `bun install --frozen-lockfile` exits 0, "Checked 122 installs across 128
      packages (no changes)" — reproducible (AC-F1-1 / NFR-5).

**Acceptance Criteria**:

- Must: `package.json` is ESM with the four `#imports` aliases and no runtime
  dependencies (AC-F10-1); `bun install --frozen-lockfile` succeeds (AC-F1-1);
  `bun.lock` is committed.
- Should: `engines.bun` reflects the resolved 1.2.x patch.

**Files and modules**:

- Code areas: `package.json` (new), `.gitignore` (updated), `bun.lock` (new).
- System docs: none (system spec is doc-only until domain stories land).

**Tests**:

- `bun install --frozen-lockfile` exits 0 from the committed lockfile.

**Completion signal**: `feat(scaffolding): add package manifest, gitignore hygiene and lockfile`

---

### Phase 2: TypeScript & Bun test configuration

**Goal**: Create the strict TS compiler config (the eight non-negotiable flags,
copied verbatim from `typescript.md`) and the Bun test config (test root,
Mermaid preload, coverage baseline) plus the no-op preload stub.

**Tasks**:

- [x] **2.1** Created `tsconfig.json` copied **verbatim** from `typescript.md`
      §"TypeScript configuration (target)" — all eight non-negotiable strict flags
      enabled (`strict`, `verbatimModuleSyntax`, `isolatedModules`,
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
      `noUncheckedSideEffectImports`, `types:["bun"]` + secondary flags); no flag
      weakened. Verified `tsc --noEmit` exits 0 against a Bun-global sample
      (`Bun.version`) with no TS5053 (declaration+--noEmit) and no TS2688
      (types:["bun"] resolves via @types/bun). **Deviation (justified):** the
      plan's non-negotiable `types:["bun"]` requires a Bun type-definition
      package; `typescript.md`'s claim "no separate @types/bun needed" is
      factually inaccurate (TS2688 without it). Added `@types/bun@^1.3.14` (dev-
      only, MIT, zero runtime/binary impact) and made `typescript@^6.0.3` an
      explicit devDep (was only transitive via dependency-cruiser) so the
      typechecker is a stable, declared dependency — both required to honour the
      non-negotiable tsconfig without weakening it. Rationale recorded in the
      Execution Log deviation note.
- [x] **2.2** Created `bunfig.toml` per `typescript.md`: `[test] root="tests"`,
      `preload=["./tests/mermaid.preload.ts"]`, `coverage=true`,
      `coverageThreshold={lines=0.80,functions=0.80}`, `coverageDir="./coverage"`.
      (OQ-1: 0.80 baseline is the declared default; verified/revisited in Phase 7
      against type-only scaffolding coverage.)
- [x] **2.3** Created `tests/mermaid.preload.ts` as a no-op stub (DEC-5 / R1) —
      `export {}` + comment that E4-S1 (MS2-E4) populates the happy-dom
      registrant. No warnings/failures when loaded by Bun (verified in Phase 7).
- [x] **2.4** Confirmed `bun run typecheck` resolves and runs (`tsc --noEmit`);
      green-pass gate intentionally deferred to Phase 6 (empty `src/**/*.ts` glob
      would emit TS18003 "No inputs were found"). `bun test` script resolves
      (green run verified in Phase 7 once the smoke test exists).

**Acceptance Criteria**:

- Must: `tsconfig.json` matches the `typescript.md` target config with all eight
  strict flags (NFR-3); `bunfig.toml` matches `typescript.md`.
- Should: the no-op preload produces no Bun warning/failure when loaded.

**Files and modules**:

- Code areas: `tsconfig.json` (new), `bunfig.toml` (new),
  `tests/mermaid.preload.ts` (new — stub).
- System docs: none.

**Tests**:

- Manual diff of `tsconfig.json`/`bunfig.toml` against `typescript.md` (no
  flag drift). Typecheck/test green runs verified in Phase 6/7.

**Completion signal**: `feat(scaffolding): add strict tsconfig and bun test config`

---

### Phase 3: Biome lint & format gate (TDR-0005)

**Goal**: Establish the single-tool lint + format gate with recommended rules
only (no bespoke rules — DEC-4), wiring the `lint` / `format` / `format:check`
scripts.

**Tasks**:

- [x] **3.1** Created `biome.json` (Biome v2.5.2): recommended lint + format preset
      (`linter.rules.preset:"recommended"`, DEC-4 — no bespoke rules), `vcs.useIgnoreFile:true`,
      tab indent, double quotes. Scoped via `files.includes` to **project source
      only** (`src/**`, `tests/**`, root `*.ts/*.js/*.cjs/*.mjs/*.json/*.jsonc/*.css`)
      with `!bun.lock`/`!bun.lockb` exclusions — keeps inception spike artifacts
      (`spikes/**`) and doc JSON out of scope (initial broad glob was narrowed after
      it touched out-of-scope tracked files, all reverted).
- [x] **3.2** Confirmed `lint`=`biome lint .`, `format`=`biome format --write .`,
      `format:check`=`biome format .` (read-only, exits non-zero on unformatted
      files without writing) invoke the Biome CLI correctly per typescript.md.
- [x] **3.3** Ran `bun run format` (normalized `package.json`/`tsconfig.json` to
      Biome formatting; `bun.lock` excluded/unchanged); `bun run lint` exits 0
      (AC-F2-1) and `bun run format:check` exits 0 (AC-F2-2) on the present tree.

**Acceptance Criteria**:

- Must: `bun run lint` exits 0 (AC-F2-1); `bun run format:check` exits 0
  (AC-F2-2).
- Should: Biome diagnostics, where present, are rule-named and AI-actionable
  (TDR-0005 driver).

**Files and modules**:

- Code areas: `biome.json` (new), `package.json` (scripts confirmed).
- System docs: none.

**Tests**:

- `bun run lint && bun run format:check` exits 0.

**Completion signal**: `feat(scaffolding): add Biome lint and format gate`

---

### Phase 4: dependency-cruiser boundary enforcement (TDR-0006)

**Goal**: Configure the graph-resolving architecture guard — the four
ports-and-adapters tier rules from `typescript.md` — with `#imports`-alias
resolution, and wire `check:boundaries`.

**Tasks**:

- [x] **4.1** Created `.dependency-cruiser.cjs` with the **four `forbidden` tier
      rules** exactly as in `typescript.md` §"Import-boundary enforcement":
      `domain-may-not-import-infra`, `domain-may-not-import-app`,
      `presentation-may-not-import-domain`,
      `presentation-may-not-import-infra` (matching the architecture-overview
      dependency-direction matrix and blueprint §1's tier invariant). Each rule
      carries `severity: "error"` so any breach fails the build (AC-F3-2 / the
      dep-cruiser 18 default emits `warn`-severity violations that exit 0 —
      observed and corrected during the negative test).
- [x] **4.2** Configured alias resolution (R2). **RSK-1 closed:** dependency-cruiser
      18's default resolver follows the Node `imports` field out of the box — both
      `#infra/git/shell-git` (alias form) and `../infra/git/shell-git` (relative
      form) scratch imports were detected as `domain-may-not-import-infra` errors
      (exit code 3). No explicit alias mapping (`tsConfig`/`webpackConfig`) needed.
      **Note:** dep-cruiser 18's `enhancedResolveOptions` schema rejects
      `importsFields` ("must NOT have additional properties"); the valid keys are
      `exportsFields`/`conditionNames`/`extensions`/`mainFields` — used here.
- [x] **4.3** Confirmed the `check:boundaries` script wraps `depcruise src`; on
      the clean (empty `src/`) tree it exits 0 ("no dependency violations found").
      The decisive negative test (AC-F3-2) was run now (3 violations, exit 3) and
      is re-verified in Phase 6 once `src/` has the real skeleton.

**Acceptance Criteria**:

- Must: `.dependency-cruiser.cjs` declares all four tier rules (AC-F3-1) —
  PASSED (4 `forbidden` rules with `severity:"error"`); `check:boundaries`
  exits 0 on the clean tree — PASSED ("no dependency violations found", exit 0).
- Should: aliases resolve without false negatives (verified decisively in
  Phase 6 via AC-F3-2) — PASSED early: both `#infra/*` alias and `../infra/*`
  relative forms detected as errors (exit 3); RSK-1 closed.

**Files and modules**:

- Code areas: `.dependency-cruiser.cjs` (new), `package.json` (script confirmed).
- System docs: none (the tier invariant itself is in `architecture-overview.md`,
  already authoritative).

**Tests**:

- `bun run check:boundaries` exits 0. (Boundary accuracy negative-test: Phase 6.)

**Completion signal**: `feat(scaffolding): add dependency-cruiser boundary enforcement`

---

### Phase 5: Conventional Commits enforcement — commitlint + husky (TDR-0008)

**Goal**: Wire commitlint (the linter) via husky's `commit-msg` hook (local
feedback) with the `prepare` script; CI is added as the authoritative gate in
Phase 8.

**Tasks**:

- [x] **5.1** Create `commitlint.config.js` extending
      `@commitlint/config-conventional`; set `header-max-length: 72` and the
      imperative-mood rule; add merge/automated-commit exemptions (`ignores`
      for `Merge …`, `[skip ci]`, bot commits — TDR-0008 C-4/C-5). Inception
      squash-merge history is **grandfathered** (not retroactively linted).
- [x] **5.2** Add the husky `commit-msg` hook via the `prepare` script
      (`bun install` / `bunx husky init` then write `.husky/commit-msg` running
      `bunx commitlint --edit "$1"`). **Note: this is the `commit-msg` hook, NOT
      `pre-commit`** (DEC-3 — `commit-msg` fires after the message is written).
      Ensure `prepare` is in `package.json` (added in Phase 1).
- [x] **5.3** Verify locally: a Conventional message (e.g. `feat(scaffolding): init`)
      is **accepted** (AC-F4-1); a malformed message (e.g. `bad message`) is
      **rejected** with a rule-named diagnostic (AC-F4-2). Test with a throwaway
      commit or `bunx commitlint --edit` against a temp message file (no
      malformed commit lands in history). — PASSED: `bunx commitlint <<< "bad
      message"` → exit 1 with `[subject-empty]`/`[type-empty]` (AC-F4-2);
      `bunx commitlint <<< "feat(scaffolding): verify commitlint"` → exit 0
      (AC-F4-1). Hook is `commit-msg` (not `pre-commit`).

**Acceptance Criteria**:

- Must: a Conventional message is accepted (AC-F4-1) — PASSED (`bunx commitlint
  <<< "feat(scaffolding): verify commitlint"` exit 0); a malformed message is
  rejected with a named rule (AC-F4-2) — PASSED (`bad message` → exit 1 with
  `[subject-empty]`/`[type-empty]`); the hook is `commit-msg`, not `pre-commit`
  — PASSED (`.husky/commit-msg` runs `bunx commitlint --edit "$1"`).
- Should: merge/automated commits pass without confusing errors (TDR-0008 C-4)
  — PASSED by config: `ignores` exempts `Merge `, `Revert `, `[skip ci]`.

**Files and modules**:

- Code areas: `commitlint.config.js` (new), `.husky/commit-msg` (new),
  `package.json` (`prepare` confirmed).
- System docs: none.

**Tests**:

- Local accept/reject verification (per test plan `chg-GH-14-test-plan.md`).

**Completion signal**: `feat(scaffolding): enforce conventional commits via commitlint and husky`

---

### Phase 6: Ports-and-adapters skeleton & shared primitives

**Goal**: Create the empty tier directory tree per blueprint §1 (residence
contract for every later story), the two shared domain primitives (`Result<T,E>`
+ the exhaustive 12-kind `MarkSyncError` with the `never`-check pattern), and the
trivial CLI entrypoint — then run the **first** green `bun run typecheck` and
`bun run check:boundaries`, plus the boundary negative-test (AC-F3-2).

**Tasks**:

- [x] **6.1** Create the skeleton tier directories per blueprint §1, preserving
      empty dirs with `.gitkeep` or barrel `index.ts` where natural:
      `src/cli/{commands,output}/`, `src/app/`,
      `src/domain/{identity,config,binding,state,hierarchy,markdown,render,assets,mermaid,git,target}/`,
      `src/infra/{git,mermaid,lock,push,confluence}/`, `src/shared/`. No domain
      logic lands here — directories only (F-5 / AC-F5-1). — PASSED: all 20 tier
      dirs created with `.gitkeep` placeholders (no logic); `depcruise src`
      reports "3 modules" (the 3 real files only).
- [x] **6.2** Create `src/domain/result.ts` — `Result<T, E>` type, copied
      verbatim from blueprint §2 / `typescript.md` (`{ ok: true; value: T } |
      { ok: false; error: E }`). (DM-1) — PASSED: type copied verbatim; added an
      additive `Result.ok`/`Result.err` constructor namespace (returns the exact
      union arms) so callers/tests construct via `Result.ok(v)` / `Result.err(e)`
      rather than hand-writing literals.
- [x] **6.3** Create `src/domain/errors.ts` — the exhaustive **12-kind**
      `MarkSyncError` discriminated union from blueprint §2 (DEC-1 — the superset
      of the 8-kind typescript.md excerpt): `Conflict`, `RemoteMissing`,
      `DuplicateUuid`, `UnsupportedConstruct`, `Forbidden`, `LockDirty`,
      `ConcurrentWrite`, `RenderUnavailable`, `StalePlan`, `ForbiddenBranch`,
      `TooLarge`, `UnresolvedLink` — each with its blueprint §2 field shape.
      **Include the exhaustive `never`-check pattern** so adding a future kind is
      a compile error until every handler is updated. (DM-2 / AC-F6-1 / AC-F6-2)
      — PASSED: `assertNeverMarkSyncError` switches over all 12 kinds; the
      `default` block's `const _exhaustive: never = error` compiles ONLY because
      every kind is handled (typecheck exit 0 proves exhaustiveness).
- [x] **6.4** Create `src/cli/index.ts` — a trivial entrypoint that prints
      `marksync 0.0.0` (F-7). Proves the toolchain compiles and executes. —
      PASSED: `bun run src/cli/index.ts` prints `marksync 0.0.0`.
- [x] **6.5** Run `bun run typecheck` → first green strict compile of the
      primitives (AC-F6-1/F6-2); run `bun run src/cli/index.ts` → prints
      `marksync 0.0.0` (AC-F7-1). — PASSED: `tsc --noEmit` exit 0 (first green
      strict compile with real source); CLI prints the version string.
- [x] **6.6** Run the **boundary negative-test (AC-F3-2)**:       temporarily add a
      scratch file under `src/domain/` that imports from `#infra/*` (or a
      relative `src/infra/...` path); run `bun run check:boundaries` → observe FAIL
      with a named `from → to + rule` violation (zero false negatives — RSK-1/R2
      closure); remove the scratch; observe PASS. If the scratch is **not**
      detected, the `#imports` alias mapping from Phase 4 is incomplete — fix it
      (never disable the rule). — PASSED: with a temporary `src/infra/git/shell-git.ts`
      stub + `src/domain/state/__boundary_scratch.ts` importing it via BOTH
      `#infra/git/shell-git` (alias) and `../../infra/git/shell-git` (relative),
      `check:boundaries` reported `error domain-may-not-import-infra:
      __boundary_scratch.ts → shell-git.ts` (exit 1 = violation count). Both
      forms resolve to the same module (dep-cruiser dedupes → 1 violation).
      Removed scratch + stub → clean exit 0 ("3 modules, 0 dependencies").

**Acceptance Criteria**:

- Must: all tier dirs/barrels exist per blueprint §1 (AC-F5-1) — PASSED (20 tier
  dirs with `.gitkeep`); `Result<T,E>` + 12-kind `MarkSyncError` + `never`-switch
  typecheck strict (AC-F6-1/F6-2) — PASSED (`tsc --noEmit` exit 0, proving the
  `default: const _exhaustive: never = error` arm compiles only when all 12 kinds
  are handled); `bun run src/cli/index.ts` prints `marksync 0.0.0` (AC-F7-1) —
  PASSED; `bun run typecheck` exits 0 (AC-F1-2) — PASSED; `bun run check:boundaries`
  exits 0 on the clean skeleton (AC-F3-1) — PASSED ("3 modules, 0 dependencies",
  exit 0) and FAILS on the scratch (AC-F3-2) — PASSED (`domain-may-not-import-infra`
  named violation, exit 1; both alias + relative forms detected).
- Should: barrel files keep import paths clean without violating tier rules. — N/A
  here: used `.gitkeep` (no logic yet); barrels land with the first real modules.

**Files and modules**:

- Code areas: `src/cli/index.ts` (new), `src/domain/result.ts` (new),
  `src/domain/errors.ts` (new), tier directories + `.gitkeep`/barrels (new).
- System docs: none (the tier tree is already authoritative in blueprint §1 and
  `architecture-overview.md`).

**Tests**:

- `bun run typecheck` green; `bun run check:boundaries` clean; CLI prints the
  version string; boundary scratch negative-test (per test plan).

**Completion signal**: `feat(scaffolding): add module skeleton, Result and MarkSyncError primitives`

---

### Phase 7: Test-tier skeleton & smoke test

**Goal**: Create the five test-tier directories and a trivial passing smoke test
asserting the `Result` shape and the `MarkSyncError` exhaustive-switch — so
`bun test` is green and the Bun harness + Mermaid preload are wired.

**Tasks**:

- [x] **7.1** Create the test-tier directories: `tests/unit/`,
      `tests/integration/`, `tests/golden/`, `tests/bdd/`, `tests/e2e/`
      (testing-strategy.md tiers). Preserve empty dirs with `.gitkeep`. — PASSED:
      all five test-tier dirs created (unit/ holds the smoke test; the other four
      carry `.gitkeep`).
- [x] **7.2** Add a smoke test at `tests/unit/domain/result.test.ts`
      (mirrors `src/domain/result.ts`; matches the test plan's TC-PRIMITIVES-001)
      asserting `Result.ok` / `Result.err` shape and that a `MarkSyncError`
      exhaustive `switch` compiles (F-8 / AC-F8-1). Keep it type-and-shape only
      — no domain behavior under test (NG-1). — PASSED: smoke test asserts
      `Result.ok`/`Result.err` arms; an exhaustive 12-kind `switch` with a
      `never`-default (compiles only when every kind is handled — AC-F6-2); and
      `assertNeverMarkSyncError` throws for every known kind. 4 tests, 28 expects,
      exit 0.
- [x] **7.3** Run `bun test` → exits 0 (AC-F8-1). Handle **OQ-1**: if the
      `0.80` coverage threshold (Phase 2 `bunfig.toml`) is unsatisfiable on
      type-only scaffolding modules, set a documented lower MS-0002-start
      baseline (record the value + rationale in `bunfig.toml`/a comment) and
      note "revisit at MS-0002 end"; do **not** disable coverage silently. —
      PASSED + OQ-1 RESOLVED: `bun test` exits 0 (AC-F8-1). Bun enforces
      `coverageThreshold` **per-file**, and `src/domain/errors.ts`'s
      `assertNeverMarkSyncError` carries a structurally-unreachable `default`
      block (the AC-F6-2 compile-time exhaustiveness guard — all 12 cases throw
      before `default`), so its per-file line coverage caps at 71.43% (Bun 1.2.23
      supports no coverage-ignore comment — verified against `/* istanbul ignore
      next */`, `// coverage ignore next[ line]`, `/* coverage ignore */`).
      Per OQ-1, lowered `lines` baseline to **0.70** (functions stays 0.80, met
      at 100%) with a documented rationale in `bunfig.toml`; aggregate coverage
      is 90.48%. Revisit at MS-0002 end.

**Acceptance Criteria**:

- Must: `bun test` exits 0 with the smoke test passing (AC-F8-1) — PASSED (4
  tests / 28 expects, exit 0; first real `bun test` run; aggregate coverage
  90.48%).
- Should: coverage config is honest about the MS-0002-start baseline (OQ-1) —
  PASSED: `lines` lowered 0.80 → 0.70 with a documented rationale in
  `bunfig.toml` (errors.ts unreachable exhaustiveness guard; per-file Bun
  enforcement); functions stays 0.80; revisit at MS-0002 end.

**Files and modules**:

- Code areas: `tests/unit/domain/result.test.ts` (new), test-tier dirs +
  `.gitkeep` (new).
- System docs: none.

**Tests**:

- `bun test` green (smoke test); this is the first real `bun test` run.

**Completion signal**: `test(scaffolding): add test-tier skeleton and primitives smoke test`

---

### Phase 8: CI unguard — make CI binding (OPEN-Q9)

**Goal**: The load-bearing outcome. Edit `.github/workflows/ci.yml` to remove
every `continue-on-error: true` and `|| true` advisory guard, pin Bun to the
concrete 1.2.x patch, make the dependency/license audit blocking, and add the
`check:boundaries` CI step — then confirm the full `bun run check` is locally
green before the CI run.

**Tasks**:

- [ ] **8.1** Edit `.github/workflows/ci.yml` **fast-loop job**: remove
      `continue-on-error: true` from the Install / Lint / Typecheck steps; remove
      `|| true` from the Test (`bun test tests/unit/ tests/integration/
      tests/golden/`) and BDD (`bun run test:bdd`) steps. Keep the step
      structure and the BDD-in-fast-loop wiring (testing-strategy.md §"CI
      wiring"); E2E stays in `run-e2e.yml` (not this file).
- [ ] **8.2** Pin the CI `bun-version` matrix value to the same concrete 1.2.x
      patch resolved in Phase 1 (replace the floating `"1.2"` — NFR-6 / DEC-6);
      update the inline "pin to a concrete patch" comment to reflect the pin.
- [ ] **8.3** Add a `check:boundaries` step to the fast-loop job (`bun run
      check:boundaries`) so tier violations fail the build (OPEN-Q9 item 7).
- [ ] **8.4** In the **dependency-audit job**: remove `continue-on-error: true`
      from the osv-scanner and license-audit steps so both are **blocking**
      (NFR-7 / OPEN-Q9 items 2 + 8). Resolve **OQ-2**: verify the osv-scanner
      lockfile flag against the installed version (`--lock-file` vs
      `-L`/`--lockfile`) and correct the command; fix the inline comment. Keep
      the step-level lockfile-conditional (`if: steps.lockfile.outputs.exists`)
      as-is (it correctly no-ops when no lockfile — now there always is one).
      **Also remove the trailing `|| true` from the osv-scanner and
      license-audit run-command bodies** (ci.yml lines ~101 and ~108), so those
      commands fail the job on violations (parity with the `|| true` removal in
      the test steps) — AC-F9-1 / NFR-2 require **zero** `|| true`.
- [ ] **8.5** Add a **CI commit-message-lint step** to the
      `.github/workflows/ci.yml` **fast-loop job** (the TDR-0008 C-2
      authoritative CI half — defense-in-depth: local husky hook + CI gate).
      Run commitlint **directly in a CI step** (NOT a third-party Action, to
      avoid the TDR-0008 unresolved "CI Action selection" question). Place it
      after `bun install` so `@commitlint/cli` is available; it lints all
      commits on the PR branch since it diverged from `main`:

      ```yaml
      - name: Lint commit messages
        run: bunx commitlint --from origin/main --to HEAD
      ```

      Satisfies **AC-F4-3** and covers **TC-COMMITS-003** (CI rejects a
      `--no-verify` bad commit), closing **OQ-TP-2**. (Implementation note:
      `actions/checkout@v4` defaults to a shallow clone; ensure sufficient
      history is fetched so `origin/main` resolves — e.g. `fetch-depth: 0` or an
      explicit `git fetch origin main` — otherwise `--from origin/main` errors.)
- [ ] **8.6** Run the full `bun run check` locally (lint + format:check +
      typecheck + test + check:boundaries) → all green, single-digit seconds
      (NFR-1) — this is the local proof that unguarding exposes no latent issue
      (RSK-2).
- [ ] **8.7** Verify the OPEN-Q9 checklist closure for this story (items 1–9;
      item 10 YAML-frontmatter lint remains out of scope — spec Appendix A).

**Acceptance Criteria**:

- Must: zero `continue-on-error: true` and zero `|| true` remain in
  `.github/workflows/ci.yml` (AC-F9-1 / NFR-2); CI pins the concrete 1.2.x
  patch; license-audit is blocking and rejects GPL/AGPL/LGPL/UNLICENSED
  (AC-F10-1); `check:boundaries` is a CI step; `bun run check` is locally green.
- Should: the osv-scanner flag is correct for the installed version (OQ-2).

**Files and modules**:

- Code areas: `.github/workflows/ci.yml` (updated — guards removed, Bun pinned,
  `check:boundaries` added).
- System docs: none (the unguard is the system-observability change itself).

**Tests**:

- `bun run check` green locally; the green **CI run on the PR** is the evidence
  that unguarding is safe (AC-F9-1).

**Completion signal**: `ci(scaffolding): unguard CI and pin Bun per OPEN-Q9`

---

### Phase 9: Finalize — README section, verification & spec reconciliation

**Goal**: Add the minimal "under construction" README project section, run the
final whole-repo `bun run check`, confirm there is no version bump
(`version_impact: none`), and hand system-doc reconciliation to the
`system_spec_update` lifecycle phase (doc-syncer).

**Tasks**:

- [ ] **9.1** Add a minimal "under construction" project section to `README.md`
      (what MarkSync is in one line + the dev-loop pointer). Full README,
      badges, and docs are out of scope (NG-4).
- [ ] **9.2** Run the final `bun run check` (lint + format:check + typecheck +
      test + check:boundaries) → all green; confirm the four Phase 4 "re-verify
      before lock" items (Biome strict compat, dep-cruiser alias resolution,
      commitlint hook, osv-scanner flag) are closed by execution.
- [ ] **9.3** Confirm **no version bump** — `version_impact: none` (no released
      artifact / binary target in this story; the CLI prints `0.0.0` as a
      placeholder, not a release).
- [ ] **9.4** **Spec reconciliation handoff**: note for the
      `system_spec_update` lifecycle phase (doc-syncer, lifecycle phase 7):
      - `doc/guides/dev-environment.md` likely needs the script-table update
        (`lint`/`format`/`typecheck`/`test`/`check`/`check:boundaries`) and a note
        that OPEN-Q9 is now closed.
      - `.ai/rules/typescript.md` needs the **8→12 `MarkSyncError` drift**
        reconciled: its "Error handling" section currently shows an **8-kind**
        excerpt (`Conflict`, `RemoteMissing`, `DuplicateUuid`,
        `UnsupportedConstruct`, `Forbidden`, `LockDirty`, `ConcurrentWrite`,
        `RenderUnavailable`); the blueprint §2 / spec DEC-1 mandate **12 kinds**
        — add `StalePlan`, `ForbiddenBranch`, `TooLarge`, `UnresolvedLink`.
        Either label the typescript.md block as an excerpt or update it to the
        full 12-kind union that `src/domain/errors.ts` (Phase 6.3) implements.

      No `doc/spec/**` feature change is introduced by this story (it is
      tooling + skeleton + primitives only).
- [ ] **9.5** Populate the Execution Log below with phase statuses/commits.

**Acceptance Criteria**:

- Must: final `bun run check` green (NFR-1); OPEN-Q9 closed; no version bump
  recorded.
- Should: dev-environment.md script-table reconciliation is tracked for the
  doc-syncer phase.

**Files and modules**:

- Code areas: `README.md` (updated — minimal section only).
- System docs: `doc/guides/dev-environment.md` (script-table update),
  `.ai/rules/typescript.md` (`MarkSyncError` 8→12-kind reconciliation) — both
  handoff notes for the `system_spec_update` lifecycle phase (not updated in
  delivery).

**Tests**:

- Final `bun run check` green; PR CI green with guards removed (AC-F9-1).

**Completion signal**: `docs(scaffolding): add minimal README section and close OPEN-Q9`

---

## Test Scenarios

> Detailed procedures (step-by-step, expected output, rollback) live in the
> companion test plan `chg-GH-14-test-plan.md`. This table maps scenarios to
> phases and acceptance criteria.

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TS-1 | `bun install --frozen-lockfile` succeeds from a fresh clone | 1 | AC-F1-1 |
| TS-2 | `bun run typecheck` exits 0 under all eight strict flags | 6 | AC-F1-2, AC-F6-1, AC-F6-2 |
| TS-3 | `bun run lint` exits 0 (Biome recommended rules) | 3 | AC-F2-1 |
| TS-4 | `bun run format:check` exits 0 (no unformatted files) | 3 | AC-F2-2 |
| TS-5 | `bun run check:boundaries` exits 0 on the clean skeleton | 6 | AC-F3-1 |
| TS-6 | A `domain→infra` scratch import FAILS with a named `from → to + rule`; removing it restores green | 6 | AC-F3-2, NFR-8 |
| TS-7 | A Conventional Commits message (`feat(scaffolding): init`) is accepted by the `commit-msg` hook | 5 | AC-F4-1 |
| TS-8 | A malformed message (`bad message`) is rejected with a rule-named diagnostic | 5 | AC-F4-2 |
| TS-9 | All blueprint §1 tier directories + barrels exist | 6 | AC-F5-1 |
| TS-10 | `Result<T,E>` + 12-kind `MarkSyncError` + `never`-switch typecheck strict | 6 | AC-F6-1, AC-F6-2 |
| TS-11 | `bun run src/cli/index.ts` prints `marksync 0.0.0` | 6 | AC-F7-1 |
| TS-12 | `bun test` exits 0 (smoke test green) | 7 | AC-F8-1 |
| TS-13 | CI has zero `continue-on-error` / `|| true`; PR CI run is green | 8 | AC-F9-1, NFR-2 |
| TS-14 | No runtime dependencies; license-audit rejects GPL/AGPL/LGPL/UNLICENSED | 1, 8 | AC-F10-1 |
| TS-15 | Full `bun run check` green in single-digit seconds | 9 | NFR-1 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-14-spec.md` | Spec (source of truth) |
| Change test plan | `./chg-GH-14-test-plan.md` | Test plan (verification procedures) |
| Authoritative story | `../../../planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S1--scaffolding.md` | Story (12 deliverables) |
| TS conventions | `../../.ai/rules/typescript.md` | Convention (exact configs) |
| Testing strategy | `../../.ai/rules/testing-strategy.md` | Convention (tiers + CI) |
| MS-0002 blueprint | `../../.ai/local/ceo/ms-0002-blueprint.md` | Working memory (§1 tree, §2 primitives) |
| TDR-0005 (Biome) | `../../../decisions/TDR-0005-linter-and-formatter.md` | Decision (Accepted) |
| TDR-0006 (dep-cruiser) | `../../../decisions/TDR-0006-import-boundary-enforcement.md` | Decision (Accepted) |
| TDR-0008 (commitlint+husky) | `../../../decisions/TDR-0008-conventional-commits-enforcement.md` | Decision (Accepted) |
| OPEN-Q9 (CI unguard) | `../../../inception/open-questions/phase-4-open-questions.md` | Open question (closed by this story) |
| CI workflow (edited) | `../../.github/workflows/ci.yml` | CI config (unguarded) |
| `package.json` / `bun.lock` | repo root | Manifest + lockfile (new) |
| `tsconfig.json` / `bunfig.toml` / `biome.json` | repo root | Tool config (new) |
| `.dependency-cruiser.cjs` / `commitlint.config.js` / `.husky/commit-msg` | repo root + `.husky/` | Tool config + hook (new) |
| `src/` skeleton + primitives | `src/cli/index.ts`, `src/domain/result.ts`, `src/domain/errors.ts`, tier dirs | Code (new) |
| `tests/` skeleton + smoke | `tests/**`, `tests/mermaid.preload.ts` | Test (new) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | plan-writer (GH-14) | Initial plan — 9 dependency-ordered phases derived from the spec (F-1..F-10), story MS2-E2-S1 (12 deliverables), blueprint §1/§2, typescript.md/testing-strategy.md, and decisions TDR-0005/0006/0008 + ADR-0001. Config contents are cited from `typescript.md`/blueprint, not reproduced. CI unguard (OPEN-Q9) placed last so the PR is its own green-CI proof. |

## Execution Log

<!-- Populated during execution by @coder via /run-plan GH-14 -->

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 2 — tsconfig + bunfig | DONE | 2026-07-07 | 2026-07-07 | c4d8c49 | Strict tsconfig (8 flags verbatim) + bunfig.toml + no-op Mermaid preload. Justified deviation: added `@types/bun` + `typescript` devDeps (plan's non-negotiable `types:["bun"]` needs Bun types; `typescript.md` "no package needed" claim is inaccurate). typecheck green verified with sample Bun global. |
| 3 — Biome | DONE | 2026-07-07 | 2026-07-07 | d8f4b52 | biome.json (recommended preset, DEC-4) scoped to project source; `lint` exit 0 (AC-F2-1), `format:check` exit 0 (AC-F2-2); package.json/tsconfig.json normalized to Biome formatting. |
| 1 — manifest, hygiene, install | DONE | 2026-07-07 | 2026-07-07 | 1ff143f | Bun pinned 1.2.23; package.json ESM + `#imports` aliases + 5 devDeps (no runtime deps); `bun.lock` text committed; `--frozen-lockfile` reproducible. Bun 1.2.23 used for delivery (local 1.1.34 emits binary `bun.lockb`). |
| 4 — dependency-cruiser | DONE | 2026-07-07 | 2026-07-07 | bf63a66 | `.dependency-cruiser.cjs` with 4 `forbidden` rules (`severity:"error"`). RSK-1 closed: dep-cruiser 18 resolves `#imports` aliases natively — both alias + relative `domain→infra` scratches detected (exit 3); clean tree exit 0. `importsFields` rejected by dep-cruiser 18 schema; used valid `enhancedResolveOptions` keys only. |
| 5 — commitlint + husky | DONE | 2026-07-07 | 2026-07-07 | 686b69f | commitlint.config.js extends config-conventional (header-max-length 72, `ignores` Merge/Revert/[skip ci]); `.husky/commit-msg` runs `bunx commitlint --edit "$1"`. AC-F4-1 PASS (good msg exit 0), AC-F4-2 PASS (`bad message` → exit 1, `[subject-empty]`/`[type-empty]`). CI authoritative half lands in Phase 8 (AC-F4-3). |
| 6 — skeleton + primitives | DONE | 2026-07-07 | 2026-07-07 | a0c88cc | 20 tier dirs + `.gitkeep`; `result.ts` (verbatim `Result<T,E>` + additive `ok`/`err` ctor namespace); `errors.ts` (12-kind `MarkSyncError` verbatim + `assertNeverMarkSyncError` exhaustive `never`-switch); `cli/index.ts` prints `marksync 0.0.0`. AC-F1-2/F6-1/F6-2 PASS (typecheck exit 0 — first green strict compile). AC-F3-2 PASS re-verified: domain→infra scratch (alias+relative) → `domain-may-not-import-infra` exit 1; clean after removal. AC-F7-1 PASS. |
| 7 — test skeleton + smoke | DONE | 2026-07-07 | 2026-07-07 | (this commit) | 5 test-tier dirs; `tests/unit/domain/result.test.ts` smoke test (Result shape + 12-kind exhaustive `never`-switch + assertNever throws). `bun test` exit 0 (AC-F8-1), 4 pass/28 expects, agg coverage 90.48%. **OQ-1 RESOLVED:** Bun enforces coverageThreshold per-file; errors.ts's unreachable exhaustiveness `default` (AC-F6-2 guard) caps at 71.43%; Bun 1.2.23 has no coverage-ignore comment (verified); lowered `lines` to 0.70 (functions 0.80) in `bunfig.toml` with rationale; revisit at MS-0002 end. **Deviation (Phase 1 latent bug, fixed in a96fbeb):** the `imports` wildcards were extensionless (`./src/domain/*`) — unresolved at Bun runtime (imports/exports subpath targets get no extension resolution); tsc + dep-cruiser masked it. Phase 7's smoke test first exercised a runtime `#domain/*` import and exposed it. Fixed by appending `.ts` to all four wildcard values; dep-cruiser negative-test re-verified (RSK-1 holds). |
| 8 — CI unguard (OPEN-Q9) | pending | | | | OQ-2 osv-scanner flag check |
| 9 — finalize + README | pending | | | | no version bump (version_impact: none) |
