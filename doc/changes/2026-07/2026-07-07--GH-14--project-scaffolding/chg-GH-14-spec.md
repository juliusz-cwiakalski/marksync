---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-14
  type: feat
  status: Proposed
  slug: project-scaffolding
  title: "[MS2-E2-S1] Project scaffolding — TS+Bun tooling, ports-and-adapters skeleton, CI unguard"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E2, foundation, OPEN-Q9, critical]
  version_impact: none
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [MS2-E2-S2 (blocked), MS2-E2-S3 (blocked), MS2-E2-S4 (blocked), MS2-E3 (blocked)]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Stand up the TypeScript + Bun project foundation, the ports-and-adapters module skeleton, and the shared `Result<T,E>` / `MarkSyncError` domain primitives — and, as the load-bearing outcome, **make CI binding by removing every `continue-on-error` / `|| true` advisory guard (OPEN-Q9)** — so that every subsequent story in MS-0002 has a strict, machine-checked toolchain and an authoritative (not silently masked) CI signal.

## 1. SUMMARY

This is the **first implementation story of MS-0002** (MVP safe one-way publisher) and the first story of epic MS2-E2 (Foundation). It establishes the entire dev toolchain from a greenfield state: the strict TypeScript compiler configuration, the ESM project manifest with `#imports`-field aliases, the Bun test configuration, the Biome lint/format gate (TDR-0005), the dependency-cruiser import-boundary enforcement (TDR-0006), and the commitlint + husky Conventional Commits enforcement (TDR-0008). It also creates the empty ports-and-adapters module skeleton (per the blueprint module map) plus the two cross-cutting shared primitives that every later domain story depends on.

Critically, this story **removes the inception-era CI advisory guards** (`continue-on-error: true` and `|| true`) so that lint, typecheck, test, boundary, and dependency/license-audit steps become binding. Until this is done, every subsequent story's CI signal is informational only — failures are silently masked, which is the precise failure mode OPEN-Q9 exists to close (the H-1 regex bug demonstrated it). This story blocks all of MS2-E2-S2/S3/S4 and MS2-E3.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **ADR-0001** (governance-`Accepted`) fixed the implementation stack as **TypeScript compiled to per-platform single binaries via Bun `build --compile`**, ESM-only, strict-mode. The repo is **post-inception, pre-implementation**: `MS-0001` (API validation spike) and the MS2-E1 spikes are complete; no production toolchain exists yet.
- **No dev toolchain exists.** There is no root project manifest, no TS compiler config, no Bun test config, no Biome config, no dependency-cruiser config, no commitlint/husky wiring, and no `src/` skeleton. The four code-quality decisions (TDR-0005 Biome, TDR-0006 dependency-cruiser, TDR-0008 commitlint+husky, plus ADR-0001 Bun+TS) are governance-`Accepted` but **not yet implemented** — they were authored with a `status: Proposed` body and explicit "unguard at MS-0002 start (OPEN-Q9 checklist)" implementation notes.
- **CI is advisory-only.** `.github/workflows/ci.yml` runs every push/PR, but every meaningful step carries `continue-on-error: true` or `|| true` (install, lint, typecheck, test, BDD, osv-scanner, license-audit). Bun is pinned to a floating `"1.2"` major-minor in CI with a comment to pin a concrete patch at MS-0002 start. This was correct during inception (no source to check), but it means CI is **informational only** today.
- **Phase 4 decisions** (TDR-0005/0006/0008) carry explicit unresolved-questions/open-items that resolve *at MS-0002 lock*: Biome strict-mode rule coverage + Bun-pin compatibility re-verification (TDR-0005); dependency-cruiser `#imports`-alias resolution (TDR-0006); the commitlint CI-action pick (TDR-0008). These are the verification items this story closes.
- **OPEN-Q9** (deferred Phase 4 open question) enumerates the 10-item CI-unguard checklist that must be executed at MS-0002 implementation start. Items 6–9 (create real config files; add dependency-cruiser + `check:boundaries` CI step; make license-audit blocking; verify the dep-audit conditional) are largely satisfied by this story's other deliverables.
- **The blueprint** (`.ai/local/ceo/ms-0002-blueprint.md`, CEO working memory) establishes the shared contracts that make the 22 MS-0002 stories mutually consistent: §1 the target `src/` tier tree; §2 the `Result<T,E>` / `MarkSyncError` / `SyncState` type definitions. This story creates the empty skeleton of §1 plus the two §2 primitives that other stories depend on (`SyncState` is owned by the state-classifier story, not here).

### 2.2 Pain Points / Gaps

- **No binding quality gate.** Because CI is advisory-only, there is currently no machine-checked enforcement of any code-quality or commit convention. Any defect introduced by a later story would be silently masked by the guards — the exact failure mode OPEN-Q9 flags (the H-1 regex bug proved that silent CI failures are a real, demonstrated risk).
- **No place to put code.** There is no module skeleton and no tier-directory contract. Without it, the first domain story would have to invent the layout and the boundary rules ad hoc, risking drift from the architecture-overview dependency-direction matrix before any guard exists to catch it.
- **No shared primitives.** Every domain function signature is specified to return `Result<T, E>` and every typed error to be a `MarkSyncError` (typescript.md two-layer error strategy). Until these two type contracts exist, later stories cannot compile against them.
- **No reproducible install.** No committed lockfile and no `engines` Bun pin means installs are not reproducible and snapshots (ADR-0002 C-1 determinism) have no stable baseline.
- **Unverified tool integrations.** dependency-cruiser's ability to resolve the Bun `#imports`-field aliases, the osv-scanner flag spelling, and Biome's strict-mode compatibility with the pinned Bun are all marked "re-verify before lock" in the decisions — none has been exercised against real config yet.

## 3. PROBLEM STATEMENT

Because the project is greenfield with no dev toolchain and an advisory-only (guarded) CI, the team cannot begin any domain implementation with a strict, machine-checked quality gate or an authoritative CI signal — every subsequent story's lint/typecheck/test/boundary/audit result would be silently masked, and there would be no shared type contracts or module-layout contract for stories to compile and place code against — so this story must establish the complete TS+Bun foundation, the ports-and-adapters skeleton, the shared `Result<T,E>`/`MarkSyncError` primitives, and unguard CI (OPEN-Q9) before any domain work begins.

## 4. GOALS

- **G-1**: Stand up the strict TypeScript + Bun project foundation — the ESM project manifest with `#imports`-field aliases, the strict TS compiler configuration (all eight non-negotiable strict flags), and the Bun test configuration — that every later story compiles and runs against.
- **G-2**: Establish the Biome lint + format code-quality gate (TDR-0005) with the `lint` / `format` / `format:check` scripts.
- **G-3**: Establish the dependency-cruiser import-boundary enforcement (TDR-0006) — the four ports-and-adapters tier rules with graph resolution — via the `check:boundaries` script.
- **G-4**: Enforce Conventional Commits (TDR-0008) via commitlint + a husky `commit-msg` hook (local) plus CI (authoritative).
- **G-5**: Create the ports-and-adapters module skeleton (empty tier directories + barrel files) per the blueprint module map — the structural contract every later story places code within.
- **G-6**: Create the two shared domain primitives — `Result<T,E>` and the exhaustive `MarkSyncError` discriminated union (blueprint §2) — that every domain function signature depends on.
- **G-7**: **Make CI binding** by removing every `continue-on-error: true` and `|| true` advisory guard (OPEN-Q9) and pinning Bun to a concrete patch version — the load-bearing outcome of this story.
- **G-8**: Establish repo hygiene (`.gitignore` additions, committed lockfile) for reproducible installs.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| `bun run check` (lint + typecheck + test + boundaries) | exits 0, single-digit seconds on the skeleton |
| Reproducible install | `bun install --frozen-lockfile` succeeds from a fresh clone; lockfile committed |
| Boundary enforcement accuracy | a deliberate domain→infra scratch import is detected as a `from → to + rule` violation (zero false negatives) |
| Commit enforcement | malformed message rejected locally by the `commit-msg` hook; Conventional Commits message accepted |
| CI binding | zero `continue-on-error: true` and zero `|| true` guards remain in CI workflows; green PR run |
| Primitives compile | `Result<T,E>` + the 12-kind `MarkSyncError` union typecheck under strict mode; the exhaustive `never`-switch compiles |
| Entrypoint runs | `bun run src/cli/index.ts` prints `marksync 0.0.0` |
| Dependency hygiene | no runtime dependencies; devDependencies only; license-audit rejects GPL/AGPL/LGPL/UNLICENSED |

### 4.2 Non-Goals

- **NG-1**: Any actual domain logic (identity, config loading, state classification, binding, hierarchy, markdown, render, assets, mermaid, git, target) — those are MS2-E2-S2 onward.
- **NG-2**: Real CLI commands and the `CommandResult<T>` / output / redaction layer — that is MS2-E2-S3.
- **NG-3**: The `bun build --compile` binary target — that is MS2-E5-S4 (the MS2-E1-S3 spike already validated the mechanism).
- **NG-4**: README polish, badges, full project documentation — post-MS-0002 or MS-0008. A minimal "under construction" project section is acceptable.
- **NG-5**: Any runtime dependencies. Foundational runtime deps (markdown pipeline, mermaid, uuid, ajv, zod, etc.) land in the stories that use them; this story adds devDependencies only.
- **NG-6**: Bespoke lint rules. Biome runs recommended rules only (TDR-0005 zero-config posture); custom rules are deferred.
- **NG-7**: `SyncState` type / state-classifier — owned by the state-classifier story, not here. This story creates only `result.ts` and `errors.ts`.
- **NG-8**: Reconsidering ADR-0001's language choice or any accepted decision. This story implements accepted decisions, it does not reopen them.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | TypeScript + Bun strict project foundation | Establishes the ADR-0001 language/runtime baseline: the ESM project manifest with `#imports`-field aliases (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`), the strict TS compiler configuration, and the Bun test configuration. Every later story compiles and runs against this foundation; the `#imports` field is chosen over tsconfig `paths` because it is runtime-respected and survives `bun build --compile`. |
| F-2 | Lint & format gate (Biome) | The single-tool code-quality gate (TDR-0005): `lint` (fails on errors) + `format` / `format:check` (fails on unformatted files), with AI-actionable single-source diagnostics. Eliminates the formatter-vs-linter drift class. |
| F-3 | Import-boundary enforcement (dependency-cruiser) | The graph-resolving architecture guard (TDR-0006): enforces the four ports-and-adapters tier rules (domain↛infra, domain↛app, presentation↛domain, presentation↛infra) with no false negatives via real module-graph resolution — not regex. Makes the dependency-direction invariant machine-checked. |
| F-4 | Conventional Commits enforcement | commitlint + husky `commit-msg` hook (TDR-0008): defense-in-depth (local hook for fast feedback + authoritative CI gate). Machine-checks the commit history, enabling changelog/SemVer automation; clears the AI-agent operability gap (agents are verified, not corrected in review). |
| F-5 | Ports-and-adapters module skeleton | Empty tier directories + barrel files per the blueprint §1 module map (presentation `cli`, application `app`, domain sub-contexts, infrastructure adapters, shared utilities). The structural contract every later story must place code within; the substrate the dependency-cruiser rules govern. |
| F-6 | Shared domain primitives (`Result<T,E>`, `MarkSyncError`) | The two cross-cutting type contracts every domain function signature depends on (typescript.md two-layer error strategy). `Result<T,E>` is the expected-failure return type; `MarkSyncError` is the exhaustive discriminated-union error type whose `never`-check pattern guarantees safe, complete extension by later stories. |
| F-7 | Minimal CLI entrypoint | A trivial runnable entrypoint that prints `marksync 0.0.0` — proves the toolchain compiles and executes end-to-end and gives CI something to run. Not a real command (NG-2). |
| F-8 | Test-tier skeleton | The five test-tier directories (`unit/`, `integration/`, `golden/`, `bdd/`, `e2e/`) plus a trivial passing smoke test, so `bun test` is green and the Bun test harness + Mermaid preload stub are wired. |
| F-9 | Binding CI (OPEN-Q9 unguard) | Removes all `continue-on-error: true` and `|| true` advisory guards so lint, typecheck, test, BDD, and dependency/license audit steps become authoritative. The load-bearing outcome: every subsequent story's CI signal is binding, not silently masked. |
| F-10 | Repo hygiene & reproducible install | `.gitignore` additions (`dist/`, `coverage/`, `.marksync/`, `*.tsbuildinfo`) + a committed lockfile + `engines` Bun pin, so `bun install --frozen-lockfile` is reproducible and snapshots have a stable baseline. |

### 5.1 Capability Details

- **F-1 (Foundation).** The project manifest is ESM (`"type": "module"`) with `"exports"` (public surface) and `"imports"` (internal aliases) per typescript.md. Internal aliases use the `#`-prefix convention and resolve to the tier roots. The TS compiler configuration is the **exact** strict config from typescript.md §"TypeScript configuration (target)" — the eight non-negotiable strict flags (NFR-3) are non-negotiable and are never weakened to satisfy a linter. The Bun test configuration sets the test root, the Mermaid preload, and coverage thresholds per typescript.md. The exact contents of these config artifacts are sourced from typescript.md (the authoritative convention file), not reinvented here. Pin Bun in `engines` to a concrete patch.

- **F-2 (Biome).** Biome owns lint + format in one tool; recommended rules only (no bespoke rules). The scripts `lint`, `format`, `format:check` are wired. Biome does **not** own boundary enforcement (that is F-3) and does **not** lint commit messages (that is F-4) — both by TDR-0005 design.

- **F-3 (dependency-cruiser).** The four `forbidden` tier rules from typescript.md (matching the architecture-overview dependency-direction matrix) are declared in the dependency-cruiser config, and the `check:boundaries` script wraps the `depcruise` CLI. The config must resolve the `#imports`-field aliases; if dependency-cruiser cannot resolve them out of the box, an explicit alias mapping is added (RSK-1). Rules are never disabled to make CI green — the architecture is fixed, the tooling conforms.

- **F-4 (commitlint + husky).** commitlint is the **linter**; husky runs it via the **`commit-msg` hook** (not `pre-commit`); CI is the **authoritative** gate (a `--no-verify` local bypass is still caught by CI). The config extends `@commitlint/config-conventional` with `header-max-length: 72` and imperative-mood; merge/automated commits are exempt (TDR-0008 C-4/C-5). Inception squash-merge history is grandfathered (not retroactively linted).

- **F-5 (Module skeleton).** The skeleton mirrors the blueprint §1 tree: presentation (`cli` with `commands` and `output`), application (`app`), domain (the sub-contexts: `identity`, `config`, `binding`, `state`, `hierarchy`, `markdown`, `render`, `assets`, `mermaid`, `git`, `target`), infrastructure (`git`, `mermaid`, `lock`, `push`, `confluence`), and `shared`. Directories are empty (barrel files where natural) — no domain logic lands here. This establishes residence: later stories place code by these tier rules, and dependency-cruiser (F-3) polices it.

- **F-6 (Primitives).** `Result<T,E>` is the expected-failure return type (`{ ok: true; value: T } | { ok: false; error: E }`). `MarkSyncError` is the exhaustive discriminated union from blueprint §2 — the **12-kind** version (Conflict, RemoteMissing, DuplicateUuid, UnsupportedConstruct, Forbidden, LockDirty, ConcurrentWrite, RenderUnavailable, StalePlan, ForbiddenBranch, TooLarge, UnresolvedLink), which is a superset of the 8-kind excerpt in typescript.md. The exhaustive `never`-check pattern is included so that adding a future kind is a compile error until every handler is updated. These are the **only** domain primitives created here (DEC-1).

- **F-7 (Entrypoint).** A trivial entrypoint that prints `marksync 0.0.0`. Its sole purpose is to prove the toolchain compiles and runs end-to-end and to give CI a runnable target. Real commands are out of scope (NG-2).

- **F-8 (Test skeleton).** The five tier directories exist with a trivial passing smoke test (asserting `Result.ok` / `Result.err` shape and that a `MarkSyncError` exhaustive switch compiles). The Mermaid preload is a **no-op stub** (DEC-5); E4-S1 (MS2-E4) populates the happy-dom registrant. BDD/E2E directories exist but hold no scenarios yet.

- **F-9 (CI unguard).** All `continue-on-error: true` and `|| true` guards are removed from the CI workflows; the fast-loop job (lint + typecheck + test + BDD + `check:boundaries`) and the dependency/license-audit job become binding. BDD remains in the fast loop (testing-strategy §"CI wiring"); E2E remains a separate label/scheduled gate in `run-e2e.yml`. Bun is pinned to a concrete 1.2.x patch in both CI and `engines` for snapshot stability (ADR-0002 C-1).

- **F-10 (Hygiene).** The `.gitignore` gains `dist/`, `coverage/`, `.marksync/`, `*.tsbuildinfo`. The lockfile is committed so `--frozen-lockfile` is reproducible.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Developer local loop (after this story):
  Dev writes/edits code → `bun run check` (lint + format:check + typecheck + test + check:boundaries)
    → all gates green → commit → husky `commit-msg` hook runs commitlint
    → well-formed Conventional Commits message accepted (or malformed message rejected with a rule-named diagnostic) → push.

Flow 2 — CI loop (now binding):
  Push/PR → CI fast-loop job: install --frozen-lockfile → lint → typecheck
    → test (unit/integration/golden) → BDD invariants → check:boundaries
    → dependency/license audit (osv-scanner + license-checker, now blocking)
    → any failure fails the build (no advisory guard masks it) → green required to merge.

Flow 3 — Downstream-story unblock:
  Later story (e.g. MS2-E2-S2 config) → places code in the tier skeleton (F-5)
    → imports `Result<T,E>` / `MarkSyncError` (F-6) → returns `Result` from domain functions
    → boundary rule (F-3) polices tier placement → CI (F-9) binds the result.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The strict TS + Bun project foundation: project manifest (ESM, `exports`, `#imports` aliases, scripts), strict TS compiler config, Bun test config (F-1).
- Biome lint + format config + scripts (F-2).
- dependency-cruiser config + the four tier rules + `check:boundaries` script (F-3).
- commitlint config + husky `commit-msg` hook + `prepare` script (F-4).
- The ports-and-adapters module skeleton: empty tier directories + barrel files per the blueprint §1 map (F-5).
- The shared primitives `Result<T,E>` and the exhaustive 12-kind `MarkSyncError` (F-6).
- A trivial CLI entrypoint printing `marksync 0.0.0` (F-7).
- The five test-tier directories + a passing smoke test + the no-op Mermaid preload stub (F-8).
- CI unguard: remove all `continue-on-error` / `|| true`; pin Bun to a concrete patch; make dependency/license audit blocking; add the `check:boundaries` CI step (F-9, OPEN-Q9).
- `.gitignore` additions + committed lockfile + `engines` Bun pin (F-10).
- A minimal "under construction" README project section (full README out of scope).

### 7.2 Out of Scope

- [OUT] Any domain logic — identity, config loading, state classification, binding, hierarchy, markdown, render, assets, mermaid, git, target. (MS2-E2-S2 onward.)
- [OUT] Real CLI commands, `CommandResult<T>`, output formatters, redaction layer. (MS2-E2-S3.)
- [OUT] `bun build --compile` binary target and release pipeline. (MS2-E5-S4; MS2-E1-S3 validated the mechanism.)
- [OUT] Runtime dependencies (markdown pipeline, mermaid, uuid, ajv, zod, pino, etc.). They land in the stories that use them.
- [OUT] Bespoke Biome lint rules. Recommended rules only.
- [OUT] `SyncState` / state classifier. Owned by the state-classifier story.
- [OUT] README polish, badges, full docs. (Post-MS-0002 / MS-0008.)
- [OUT] Reopening ADR-0001 or any accepted decision.

### 7.3 Deferred / Maybe-Later

- **Pre-commit `lint-staged` auto-format** — optional per typescript.md; CI catches unformatted code regardless. Defer until maintainer wants the convenience.
- **Closed commitlint scope enum** — TDR-0008 unresolved question; start free-form, tighten only if drift becomes noisy.
- **Body/footer commitlint rules (line-length, footer-reference conventions)** — advisory for now (TDR-0008 unresolved question).
- **dependency-cruiser transitive-dependency rules** ("domain must not transitively reach infra via a barrel") — TDR-0006 unresolved question; direct `from → to` rules first, transitives later if needed.
- **Coverage threshold tuning** — apply the typescript.md baseline now; revisit at MS-0002 end (OQ-1).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story introduces no HTTP endpoints and no runtime dependencies. It is dev-tooling + skeleton only.

### 8.2 Events / Messages

N/A — no events or messages are introduced.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `Result<T, E>` | The expected-failure return type: `{ ok: true; value: T } \| { ok: false; error: E }`. Every domain function signature returns this instead of throwing for expected failures. Sourced from blueprint §2 / typescript.md. |
| DM-2 | `MarkSyncError` | The exhaustive discriminated-union error type (12 kinds: Conflict, RemoteMissing, DuplicateUuid, UnsupportedConstruct, Forbidden, LockDirty, ConcurrentWrite, RenderUnavailable, StalePlan, ForbiddenBranch, TooLarge, UnresolvedLink). Includes the exhaustive `never`-check pattern. Later stories extend it via PR; the `never` check guarantees completeness. The 12-kind blueprint §2 version is authoritative (superset of the typescript.md 8-kind excerpt). |

> Note: `SyncState` (the 5-state classifier type) is **not** created here — it is owned by the state-classifier story (MS2-E3). The `state` sub-context directory exists as an empty placeholder only.

### 8.4 External Integrations

N/A — no runtime integrations. Dev-tool integrations (Biome, dependency-cruiser, commitlint, husky, osv-scanner, license-checker, Bun) are devDependencies / CI tooling, not product integrations. All are MIT-licensed per their decision records (license compatibility is a human determination, re-verified at delivery).

### 8.5 Backward Compatibility

N/A — greenfield. This is the first implementation story; there is no prior production code, runtime API, or released artifact to preserve. CI unguarding changes CI from advisory to binding, which is the intended behavior change (not a regression). Inception squash-merge commit history is grandfathered (TDR-0008 C-5) — not retroactively linted.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Lint + format + boundaries run time | `lint` + `format:check` + `check:boundaries` complete in **single-digit seconds** on the skeleton (TDR-0005/0006 verification criteria) |
| NFR-2 | CI binding | **zero** `continue-on-error: true` and **zero** `|| true` guards remain in CI workflows (OPEN-Q9) |
| NFR-3 | TS strict mode | all **eight** non-negotiable strict flags enabled: `strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUncheckedSideEffectImports`, `types:["bun"]` (plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `skipLibCheck`, `forceConsistentCasingInFileNames` per the typescript.md target config) |
| NFR-4 | Coverage baseline | coverage thresholds set per the Bun test config (lines/functions = 0.80) as the declared MS-0002 baseline, subject to adjustment per the typescript.md caveat (OQ-1) |
| NFR-5 | Reproducible install | `bun install --frozen-lockfile` succeeds from a fresh clone; lockfile committed |
| NFR-6 | Bun version pin | Bun pinned to a **concrete 1.2.x patch** in `package.json#engines` and the fast-loop CI job matrix (snapshot stability per ADR-0002 C-1; the dependency-audit job may float since it performs no rendering); the floating `"1.2"` major-minor is replaced |
| NFR-7 | Dependency hygiene | **no runtime dependencies**; devDependencies only (Biome, dependency-cruiser, commitlint, husky); license-audit **blocking** — rejects GPL/AGPL/LGPL/UNLICENSED (NFR-SEC-4) |
| NFR-8 | Boundary accuracy | a deliberate barrel/alias/transitive tier violation is detected with **zero false negatives** and a named `from → to + rule` message (TDR-0006 C-1/C-2) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A for product telemetry — this story ships no runtime code. The relevant observability is the **CI signal itself**: once unguarded, CI exit codes become the authoritative, non-masked quality signal for every subsequent story (the whole point of OPEN-Q9). The dependency/license-audit job produces vulnerability and license findings that are now blocking rather than advisory.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | dependency-cruiser cannot resolve the `#imports`-field aliases out of the box (barrels/aliases produce false negatives) | M | M | Verify via the AC scratch-file negative test (AC-F3-2); if unresolved, add an explicit alias mapping (`resolved` / `tsConfig` / `webpackConfig`) in the dependency-cruiser config (TDR-0006 implementation guidance). Never disable a rule to make CI green. CEO-recorded (R2). | L |
| RSK-2 | CI unguard exposes latent issues masked during inception | M | L | Ensure the full scaffolding is locally green (lint + typecheck + test + boundaries) before opening the PR. CI was masking nothing because there was no source — the residual risk is config errors, not hidden code defects. | L |
| RSK-3 | Bun version misalignment (local 1.1.34 vs CI floating `"1.2"`) breaks the toolchain or snapshots | M | M | Pin both `engines` and CI to a concrete 1.2.x patch at story start; re-baseline if a Bun change affects output (ADR-0002 C-1, NFR-6). | L |
| RSK-4 | The Mermaid preload warns/fails before E4-S1 populates the happy-dom registrant | L | M | Stub the preload as a no-op import (DEC-5); E4-S1 populates it. Acceptable per CEO R1. | L |
| RSK-5 | The 80% coverage threshold (NFR-4) is unsatisfiable with near-empty/type-only scaffolding code | L | M | Apply the typescript.md baseline; if the smoke test cannot meet it on type-only modules, set a documented lower MS-0002-start baseline and revisit at MS-0002 end (OQ-1). | L |
| RSK-6 | commitlint hook absent on fresh clones / AI agents → malformed commits slip past local feedback | L | M | CI is the authoritative gate (TDR-0008 C-2); a `--no-verify` local bypass is still caught by CI. The `prepare` script installs hooks on `bun install`. | L |
| RSK-7 | osv-scanner flag spelling (`--lock-file` vs `-L`/`--lockfile`) drifts across versions → audit step mis-runs | L | M | Resolve by checking the installed osv-scanner version's flag at delivery (OQ-2); the existing inline CI comment already flags this. | L |

## 12. ASSUMPTIONS

- The four code-quality decisions (TDR-0005, TDR-0006, TDR-0008, ADR-0001) are governance-`Accepted` and are being **implemented**, not reconsidered.
- The blueprint module map (`.ai/local/ceo/ms-0002-blueprint.md` §1/§2) is the authoritative shared contract for the tier tree and the shared primitives; it is a CEO working file referenced for consistency, not a published spec.
- The exact config contents (TS compiler config, project manifest `imports`/`exports`, Bun test config, dependency-cruiser rules) are sourced from typescript.md (the authoritative convention file) — this spec does not reproduce them.
- Biome, dependency-cruiser, commitlint, and husky are compatible with the pinned Bun version (re-verify at delivery per the decisions' "re-verify before lock" notes).
- The `@commitlint/config-conventional` preset matches the convention documented in typescript.md (no exotic rules).
- Inception-era advisory CI guards were masking nothing (no source existed), so unguarding introduces no hidden failures — only config-correctness risk.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | ADR-0001 (Bun + TS + ESM) | Sets the language/runtime the toolchain targets. |
| Depends on | TDR-0005 (Biome), TDR-0006 (dependency-cruiser), TDR-0008 (commitlint + husky) | The tool selections this story implements. |
| Depends on | typescript.md, testing-strategy.md | Authoritative config contents and test-tier conventions. |
| Depends on | OPEN-Q9 | The CI-unguard checklist this story executes. |
| Blocks | MS2-E2-S2 (config system), MS2-E2-S3 (CLI framework), MS2-E2-S4 (auth), MS2-E3 (core domain) | All downstream stories need the toolchain, skeleton, and primitives; all need binding CI. |
| Blocks | Every MS-0002 story's CI signal | Until CI is unguarded, no story has an authoritative quality gate. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the 80% coverage threshold (NFR-4) be enforced at scaffolding, or set to a lower MS-0002-start baseline? | typescript.md says "adjust based on MS-0002 baseline"; near-empty/type-only scaffolding modules may not meet 80%. | Verify at delivery — if the smoke test fails the threshold, set a documented lower baseline and revisit at MS-0002 end. (Tuning check — no `@decision-advisor` escalation unless it blocks delivery.) |
| OQ-2 | osv-scanner lockfile flag: `--lock-file` vs `-L`/`--lockfile`? | The ci.yml inline comment flags this for MS-0002 verification (OPEN-Q9 item 4). | Resolve at delivery by checking the installed osv-scanner version's flag. (Verification item — no `@decision-advisor` escalation.) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Adopt the exhaustive **12-kind** `MarkSyncError` union from blueprint §2 (Conflict, RemoteMissing, DuplicateUuid, UnsupportedConstruct, Forbidden, LockDirty, ConcurrentWrite, RenderUnavailable, StalePlan, ForbiddenBranch, TooLarge, UnresolvedLink) — the superset of the typescript.md 8-kind excerpt — with the exhaustive `never`-check pattern. | The story mandates "exhaustive union from blueprint §2"; the blueprint is the shared contract source. The `never` check guarantees that adding a future kind is a compile error until all handlers are updated. | 2026-07-07 |
| DEC-2 | Use the Node/Bun `"imports"` field for internal aliases (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`) rather than tsconfig `paths`. | Runtime-respected, works under `bun build --compile`, ESM standard — per typescript.md. tsconfig `paths` requires a bundler resolver step. | 2026-07-07 |
| DEC-3 | Use **commitlint** (not Biome) for commit-message linting, wired via husky's **`commit-msg` hook** (not `pre-commit`), with CI as the authoritative gate. | TDR-0008 + CEO Q1 resolution. Biome is a source-file linter/formatter with no commit-message capability; `commit-msg` fires after the message is written, which is the correct hook. | 2026-07-07 |
| DEC-4 | Enable Biome **recommended rules only**; defer bespoke rules. | Story technical approach + TDR-0005 (zero-config defaults encode 2026 conventions; minimal maintenance surface). | 2026-07-07 |
| DEC-5 | Stub the Mermaid preload as a **no-op**; E4-S1 (MS2-E4) populates the happy-dom registrant. | CEO R1 — acceptable; avoids blocking on a not-yet-needed DOM dependency and lets `bun test` run cleanly. | 2026-07-07 |
| DEC-6 | Pin Bun to a concrete **1.2.x patch** in both `engines` and CI (replacing the floating `"1.2"`). | ADR-0002 C-1 snapshot determinism + OPEN-Q9 item 3; the MS2-E1 spikes and snapshots need a stable baseline. | 2026-07-07 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Build & tooling config (project manifest, TS compiler config, Bun test config, Biome, dependency-cruiser, commitlint, husky) | New |
| Source module skeleton (presentation `cli`, application `app`, domain sub-contexts, infrastructure adapters, `shared`) | New |
| Shared domain primitives (`Result<T,E>`, `MarkSyncError`) | New |
| Minimal CLI entrypoint | New |
| Test-tier skeleton (`unit/`, `integration/`, `golden/`, `bdd/`, `e2e/` + smoke test + preload stub) | New |
| CI workflow (fast-loop job + dependency/license-audit job) | Updated — unguarded (OPEN-Q9) |
| Repo hygiene (`.gitignore`, committed lockfile, `engines` pin) | Updated |
| README | Updated — minimal "under construction" section only |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a fresh clone with the committed lockfile, **when** `bun install --frozen-lockfile` runs, **then** it succeeds (reproducible install). | F-1, F-10, NFR-5 |
| AC-F1-2 | **Given** the strict TS compiler config with all eight non-negotiable strict flags, **when** `bun run typecheck` runs, **then** it exits 0 with zero errors. | F-1, NFR-3 |
| AC-F2-1 | **Given** the Biome configuration (recommended rules), **when** `bun run lint` runs, **then** it exits 0 with zero errors. | F-2, NFR-1 |
| AC-F2-2 | **Given** the Biome configuration, **when** `bun run format:check` runs, **then** it exits 0 (no unformatted files). | F-2 |
| AC-F3-1 | **Given** the dependency-cruiser config with the four tier rules, **when** `bun run check:boundaries` runs on the clean skeleton, **then** it exits 0. | F-3, NFR-1 |
| AC-F3-2 | **Given** a scratch file that adds a `domain → infra` import, **when** `bun run check:boundaries` runs, **then** it FAILS with a named `from → to + rule` violation (zero false negatives); removing the scratch restores green. | F-3, NFR-8 |
| AC-F4-1 | **Given** the husky `commit-msg` hook is installed, **when** a Conventional Commits message (e.g. `feat(scaffolding): init`) is committed, **then** it is accepted. | F-4 |
| AC-F4-2 | **Given** the husky `commit-msg` hook is installed, **when** a malformed message (e.g. `bad message`) is committed, **then** it is rejected with a rule-named diagnostic. | F-4 |
| AC-F4-3 | **Given** a commit made with `--no-verify` (bypassing the local husky hook) that violates Conventional Commits, **when** it is pushed or a PR is opened, **then** the CI commit-message-lint job rejects it. (TDR-0008 C-2 authoritative CI half.) | F-4 |
| AC-F5-1 | **Given** the blueprint §1 module map, **when** the skeleton is inspected, **then** all tier directories and barrel files exist per the map (presentation, application, domain sub-contexts, infrastructure adapters, shared). | F-5 |
| AC-F6-1 | **Given** the shared-primitive modules exist, **when** they are typechecked under strict mode, **then** `Result<T,E>` and the exhaustive 12-kind `MarkSyncError` union compile with zero errors. | F-6, DM-1, DM-2 |
| AC-F6-2 | **Given** the `MarkSyncError` exhaustive `never`-switch pattern, **when** it is typechecked, **then** it compiles (proving the union is complete and extension-safe). | F-6, DM-2 |
| AC-F7-1 | **Given** the CLI entrypoint, **when** `bun run src/cli/index.ts` executes, **then** it prints `marksync 0.0.0`. | F-7 |
| AC-F8-1 | **Given** the smoke test asserting `Result.ok` / `Result.err` shape, **when** `bun test` runs, **then** it exits 0 (green). | F-6, F-8 |
| AC-F9-1 | **Given** the unguarded CI workflow, **when** CI runs on the PR, **then** zero `continue-on-error: true` and zero `|| true` guards remain and the run is green. | F-9, NFR-2 |
| AC-F10-1 | **Given** the dependency manifest, **when** inspected, **then** there are no runtime dependencies (devDependencies only) and the license-audit is configured to reject GPL/AGPL/LGPL/UNLICENSED. | F-10, NFR-7 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** This is the first implementation story; it has no blocked-by dependencies.
- **The PR is its own proof.** Because this story removes the CI guards, the PR must itself pass CI **green with guards removed** — that green run is the evidence that unguarding is safe.
- **Merge strategy:** subject to repo convention (squash or merge commit). Inception squash-merge history is grandfathered (TDR-0008 C-5); enforcement applies to new commits from this story forward.
- **Hooks adoption:** the `prepare` script installs husky hooks on `bun install`; contributors/agents get local feedback, but CI is authoritative regardless (TDR-0008 C-2).
- **After merge:** OPEN-Q9 is closed; all downstream stories (MS2-E2-S2/S3/S4, MS2-E3) are unblocked; the four Phase 4 "re-verify before lock" items are closed by execution.
- **Communication:** the PR description notes that CI is now binding and that every subsequent story's quality signal is authoritative.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — greenfield. No data store, no migration, no seeding. The lockfile is the only stateful artifact introduced, and it is created fresh (not migrated).

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — this story ships no runtime code and handles no user data. DevDependencies are MIT-licensed per their decision records (license compatibility is a human determination, re-verified at delivery). No secrets are introduced (devDependencies only; the lockfile contains no secrets).

## 21. SECURITY REVIEW HIGHLIGHTS

- **CI unguard makes the dependency/license audit binding (NFR-SEC-4):** osv-scanner vulnerability scanning and the GPL/AGPL/LGPL/UNLICENSED license rejection now fail the build rather than advising. This is a net security improvement.
- **No secrets:** devDependencies only; no credentials, tokens, or sensitive material are introduced.
- **No runtime attack surface:** this story adds no runtime code, no network calls, no file IO beyond dev tooling. The trivial CLI entrypoint prints a static string.
- **Commit-signing/trust:** unrelated to this story (no binary release here — NG-3).

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Tier placement becomes a hard contract.** Every later story must place code within the skeleton (F-5) by the blueprint §1 rules; dependency-cruiser (F-3) polices it in CI. Residence is no longer discretionary.
- **Shared primitives are owned here, extended elsewhere.** `Result<T,E>` and `MarkSyncError` are defined once; later stories add `MarkSyncError` kinds via PR, and the `never`-check forces complete handler updates.
- **Reproducible installs + pinned Bun.** `--frozen-lockfile` and the concrete Bun pin give every contributor and CI the same baseline; snapshot stability (ADR-0002 C-1) depends on it. A Bun upgrade is now a deliberate, re-baselined action.
- **CI is binding going forward.** Maintain the discipline of fixing the root cause, not re-guarding — never re-add `continue-on-error` / `|| true` to mask a failure (the H-1 regex failure mode).
- **Config evolution:** Biome/dependency-cruiser/commitlint config changes are config-only and reversible (low-stakes per their decision records).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Ports-and-adapters (hexagonal) | The architecture: presentation → application → domain → infrastructure, with ports (interfaces) in domain/application and adapter implementations in infrastructure. Enforced by dependency-cruiser. |
| Tier | A module layer with a fixed dependency-direction rule (presentation, application, domain, infrastructure, shared utility). |
| Barrel file | An `index` module that re-exports a directory's public surface, giving a clean import path. |
| `#imports` field | The Node/Bun `"imports"` package-manifest field for internal path aliases (`#domain/*`, etc.); runtime-respected and `bun build --compile`-safe, preferred over tsconfig `paths`. |
| `Result<T, E>` | The expected-failure return type (`ok+value` or `error`); replaces throw/catch for expected domain failures. |
| `MarkSyncError` | The exhaustive discriminated-union domain error type; discriminated by `kind`. |
| Discriminated union | A TypeScript union whose members share a common literal property (`kind`) enabling exhaustive `switch` checking. |
| Exhaustive `never`-check | A `switch` whose `default` assigns the value to `never`, making an unhandled case a compile error. |
| dependency-cruiser | Graph-resolving module-boundary enforcement tool (TDR-0006); owns architecture-tier rules. |
| Biome | Single-tool linter + formatter (TDR-0005). |
| commitlint | The Conventional Commits message linter (TDR-0008); run by husky's `commit-msg` hook locally and by CI authoritatively. |
| husky | Git-hook manager; installs the `commit-msg` hook. |
| OPEN-Q9 | The deferred Phase 4 open question: the MS-0002 CI-unguard checklist this story executes. |
| Binding CI | CI whose step exit codes fail the build (no advisory guards); the state this story establishes. |

## 24. APPENDICES

### Appendix A — Cross-reference to the OPEN-Q9 unguard checklist

| OPEN-Q9 item | Disposition in this story |
|---|---|
| 1. Remove `|| true` from test steps | F-9 (AC-F9-1) |
| 2. Remove `continue-on-error: true` from lint/typecheck/audit | F-9 (AC-F9-1) |
| 3. Pin Bun to a concrete patch | F-1 / F-10 (DEC-6, NFR-6) |
| 4. Verify osv-scanner flag | OQ-2 |
| 5. Wire Mermaid preload via Bun test config | F-8 (DEC-5) |
| 6. Create project manifest / TS config / Bun test config | F-1 |
| 7. Add dependency-cruiser + `check:boundaries` CI step | F-3, F-9 |
| 8. Make license-audit blocking | F-9, F-10 (NFR-7) |
| 9. Verify dep-audit step-level conditional | F-9 (executed at delivery) |
| 10. (YAML-lint frontmatter validation) | Out of scope for this story; doc-lint job is preserved as-is |

### Appendix B — Authoritative sources for exact config contents

- **TS compiler config, project manifest (`imports`/`exports`), Bun test config, dependency-cruiser rule sketch, Biome scripts** → `.ai/rules/typescript.md` (authoritative convention file).
- **Tier tree + `Result<T,E>` / `MarkSyncError` definitions** → `.ai/local/ceo/ms-0002-blueprint.md` §1/§2 (CEO working memory; shared contract for the 22 MS-0002 stories).
- **Test tiers + CI wiring** → `.ai/rules/testing-strategy.md`.
- **Decisions** → TDR-0005 (Biome), TDR-0006 (dependency-cruiser), TDR-0008 (commitlint+husky), ADR-0001 (Bun+TS).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | spec-writer (GH-14) | Initial specification — formalized from the authoritative story file MS2-E2-S1, epic MS2-E2, the blueprint, and decisions TDR-0005/0006/0008 + ADR-0001. |

---

## AUTHORING GUIDELINES

- **Seed:** The authoritative scope is the story file `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S1--scaffolding.md` (DoR-ready). This spec formalizes that story as the per-change specification; it does not invent new requirements or expand scope. The story's Goal / Detailed scope / Acceptance criteria / Out-of-scope map directly to the Goals (G-1..G-8), Capabilities (F-1..F-10), Acceptance Criteria (AC-*), and Non-Goals (NG-1..NG-8) here.
- **Sources cited:** ADR-0001, TDR-0005, TDR-0006, TDR-0008, OPEN-Q9, the blueprint (`.ai/local/ceo/ms-0002-blueprint.md`), typescript.md, testing-strategy.md, epic MS2-E2.
- **No implementation detail:** exact config contents are sourced from typescript.md / the blueprint (cited), not reproduced as step-by-step tasks. Config artifacts are described as contracts/roles, not as prescriptive file-creation instructions.
- **CEO-resolved items** carried forward as decisions: R1 (stub preload — DEC-5), R2 (dep-cruiser alias resolution — RSK-1), Q1 (commitlint not Biome for commits — DEC-3).
- **Two minor open items** (coverage threshold tuning, osv-scanner flag) are captured as OQ-1/OQ-2 but flagged as delivery-time verification/tuning, not `@decision-advisor` escalations.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-14)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR-/DM- ID and use Given/When/Then
- [x] NFRs include measurable values (single-digit seconds, zero guards, 8 strict flags, 0.80 coverage, concrete 1.2.x pin)
- [x] Risks include Impact & Probability
- [x] No implementation details (no step-by-step file-creation tasks; config contents sourced from cited convention files)
- [x] No content duplicated from linked docs (decisions/story referenced, not reproduced)
- [x] Front matter validates per front_matter_rules
