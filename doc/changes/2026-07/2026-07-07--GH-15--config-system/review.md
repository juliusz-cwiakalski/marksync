# Code Review — GH-15 [MS2-E2-S2] Config system

> ADOS lifecycle **Phase 8 (`review_fix`)** — local mode review of the full change
> diff (`origin/main...HEAD`) against `chg-GH-15-spec.md`, `chg-GH-15-test-plan.md`,
> `chg-GH-15-plan.md`, the authoritative story `MS2-E2-S2--config-system.md`, and
> the repo code-quality rules (`.ai/rules/typescript.md`,
> `.ai/rules/testing-strategy.md`, `.ai/agent/code-review-instructions.md`).

| | |
|---|---|
| **workItemRef** | `GH-15` |
| **Branch** | `feat/GH-15/config-system` |
| **Reviewer** | `@reviewer` (reviewer agent) |
| **Date** | 2026-07-08 |
| **Iteration** | 1 (first review) |
| **Diff base** | `origin/main` |
| **Files changed** | 48 (+5923 / −24) |
| **Verdict** | **PASS** ✅ |
| **Findings** | 0 blocking · 0 major · 4 minor (non-blocking, advisory) |
| **Quality gate** | `bun run check` exit **0** — lint+format+typecheck clean, 117 tests PASS / 0 fail, `depcruise` 0 violations (16 modules, 13 deps) |
| **Next step** | **PROCEED** → Phase 9 (`dod_check`) / PR. No remediation phase required. |

---

## 1. Overall Assessment

The change is **excellent**. It delivers all 8 story deliverables with tight
discipline: the v1 JSON Schema is the source of truth, TS types are hand-mirrored
and jointly tested against ajv (RSK-3 mitigation), the loader is genuinely pure
(no Git/tree I/O — `selectFiles` takes a caller-supplied `string[]`), the
`ConfigError`/`InvalidConfig` arm extends **both** the union and the exhaustive
`assertNeverMarkSyncError` `never`-check in one change, and the AI-readable
`humanMessage` formatter carries field path + expected-vs-actual + suggested fix
for every invalid class. The `commit-by-commit` deferral is honoured with a
dedicated "deferred to a future milestone (ADR-0010 C-5)" message distinct from a
plain enum violation.

Tier boundaries are clean (domain imports nothing tiered — verified by both the
import audit and a green `depcruise`). Strict TS holds: no `any`, no
`@ts-ignore`/`@ts-expect-error`, no TODO/FIXME in shipped code, `import type`
used for type-only imports, `noUncheckedIndexedAccess` respected (the glob
matcher deliberately uses `charAt` to avoid `string | undefined`). Tests exercise
the **real** `yaml` parser and `ajv` validator (no over-mocking) and mirror
`src/` under `tests/unit/`. The docs (feature-cli, ubiquitous-language, glossary,
typescript.md) were reconciled to the 13-kind union and the implemented contract.

The only items flagged are **minor and advisory** (see §6). None block merge.

---

## 2. Acceptance-Criteria → Test Traceability (Checklist item 1, 2)

Every spec AC is implemented and has at least one passing test. All tests below
were observed PASS in the `bun run check` run for this review.

| AC | Criterion (abbreviated) | Proving test(s) | Status |
|----|-------------------------|-----------------|--------|
| **AC-F3-1** | valid config → `Result.ok(ProjectConfig)` with defaults (`stalePlanMinutes=15`) | `TC-CONFIG-001`, `TC-CONFIG-002` (`tests/unit/app/config.test.ts`) | ✅ PASS |
| **AC-F7-1** | invalid config → `Result.err(ConfigError)` w/ AI-readable `humanMessage` (field + expected + fix) | `TC-CONFIG-003/004/005/006/008/009/010` (`config.test.ts`) + `tests/unit/app/config-errors.test.ts` (10 tests) | ✅ PASS |
| **AC-F3-2** | `selectFiles` = `select` globs minus `exclude` globs (pure) | `TC-SELECT-001..008` + determinism tests (`tests/unit/app/select-files.test.ts`, 13 tests) | ✅ PASS |
| **AC-F4-1** | `marksync.title` overrides derived title (+ `parent`/`uuid` pass-through) | `TC-DOC-001/003/004` (`tests/unit/app/document-config.test.ts`) | ✅ PASS |
| **AC-F4-2** | `marksync.exclude: true` removes doc from selection | `TC-DOC-002` (`document-config.test.ts`) | ✅ PASS |
| **AC-F6-1** | `mirror`: `docs/a/b.md` under `root: docs/` → intended parent `docs/a/` | `TC-HIER-001..005` (`tests/unit/domain/config/hierarchy.test.ts`, 14 tests) | ✅ PASS |
| **AC-F5-1** | `init` writes a starter config that round-trips `loadConfig` | `TC-INIT-001` (`tests/unit/app/config-template.test.ts`) | ✅ PASS |
| **AC-F7-2** | extended union + `assertNeverMarkSyncError` keeps `typecheck` exit 0 | `tsc --noEmit` clean (run in this review); `TC-CONFIG-012` gate; `tests/unit/domain/errors.test.ts` (5 tests) | ✅ PASS |
| **AC-F8-1** | `bun run check` (lint+format+typecheck+test+boundaries) exits 0 | observed **exit 0** — 117 pass / 0 fail, `depcruise` 0 violations | ✅ PASS |

**Bonus round-trip (TS-13 / TC-INIT-002):** the committed `marksync.yml.example`
is loaded verbatim through the real `loadConfig` in
`tests/unit/app/config-example-roundtrip.test.ts` (2 tests, real fs I/O, asserts
authored values survive) — proving the on-ramp artifact will not drift from the
schema.

**All 8 story deliverables present:**

| # | Deliverable | File | ✅ |
|---|-------------|------|---|
| 1 | `marksync.yml` v1 JSON Schema | `src/domain/config/schema.json` | ✅ |
| 2 | Mirrored TS types (`ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`) | `src/domain/config/types.ts` | ✅ |
| 3 | Loader + selection (`loadConfig`, `applyDefaults`, `selectFiles`) | `src/app/config.ts` | ✅ |
| 4 | Front-matter overrides (`resolveDocumentConfig`) | `src/app/document-config.ts` | ✅ |
| 5 | `init` skeleton (template + write helper + command stub) | `src/app/config-template.ts`, `src/cli/commands/init.ts` | ✅ |
| 6 | Hierarchy mirroring (`intendedParent`, `buildIntendedHierarchy`) | `src/domain/config/hierarchy.ts` | ✅ |
| 7 | `ConfigError` (`InvalidConfig` kind) in union + `never`-check | `src/domain/errors.ts` | ✅ |
| 8 | Committed `marksync.yml.example` + `.env.example` refs | repo root, `.env.example` | ✅ |

**Scope drift:** none. No unrequested features. The version bump `0.0.0 → 0.1.0`
matches `version_impact: minor`. The overwrite-refusal policy (OQ-TP-1) is a
documented delivery decision, not scope creep.

---

## 3. Decisions Audit (Checklist items 4–8)

| Decision | Requirement | Evidence | Status |
|----------|-------------|----------|--------|
| **DEC-1** | `yaml` lib used for **both** `marksync.yml` and front-matter | `src/app/config.ts:24` (`import { parse as parseYaml } from "yaml"`) **and** `src/app/document-config.ts:14` (same import). Single dependency. | ✅ PASS |
| **DEC-2** | `granularity` accepts **only** `squash`; `commit-by-commit` rejected with "deferred" message (ADR-0010 C-5) | `schema.json:77` `"enum": ["squash"]`; `TC-CONFIG-006` asserts rejection + message matches `/commit-by-commit/i`, `/deferred/i`, `/ADR-0010/`, `/squash/`; `tests/unit/domain/config/schema.test.ts` "granularity commit-by-commit is rejected". Formatter (`config-errors.ts:76-79`) appends the dedicated deferred note. | ✅ PASS |
| **DEC-3** | `ConfigError` = `InvalidConfig` kind; union **and** `assertNeverMarkSyncError` updated; `loadConfig` returns `Result<ProjectConfig, ConfigError>` | `src/domain/errors.ts`: arm added (L59-64), `ConfigError` alias (L72), `assertNeverMarkSyncError` `case "InvalidConfig":` (L102). `src/app/config.ts:58` `loadConfig(cwd): Result<ProjectConfig, ConfigError>`. `tsc --noEmit` clean. | ✅ PASS |
| **DEC-4** | Loader is pure — `selectFiles` takes caller-supplied `string[]`; NO git I/O inside loader | `src/app/config.ts:187` `selectFiles(config, paths: readonly string[]): string[]`. Purity proven by `TC-SELECT-008` (non-existent paths matched without error). Only file I/O is `readFileSync` of `marksync.yml`. | ✅ PASS |
| **DEC-5** | Zero-dep `src/shared/glob.ts`; no `picomatch` | `src/shared/glob.ts` (119 lines, hand-rolled, zero imports). `package.json` `dependencies` = `ajv` + `yaml` only. `depcruise` clean. | ✅ PASS |

---

## 4. Code-Quality Audit (Checklist items 9–14)

| # | Requirement | Evidence | Status |
|---|-------------|----------|--------|
| **9** | Tier compliance: domain imports nothing tiered; app→domain only; cli→app only; shared pure | Import audit: `src/domain/` imports only `import type {...} from "#domain/config/types"`; `src/app/` imports `ajv`/`yaml`/`node:*`/`#domain/*`/`#shared/*`/`#app/*` (no cli/infra); `src/cli/commands/init.ts` imports only `#app/config-template`; `src/shared/glob.ts` has zero imports. `depcruise` rules (`.dependency-cruiser.cjs`) match the four `forbidden` rules; run green (16 modules, 13 deps, 0 violations). **No `ajv` import in `src/domain/`** (NFR-3) — confirmed. | ✅ PASS |
| **10** | Strict TS clean; no `any`; `import type`; `noUncheckedIndexedAccess` | `tsc --noEmit` exit 0. Grep for `:\s*any|<any>|as any` in `src/` → none. Type-only imports use `import type` throughout (e.g. `config.ts:26-27`, `config-errors.ts:17-18`). Glob matcher uses `charAt()` deliberately to avoid `string \| undefined`. | ✅ PASS |
| **11** | `Result<T,E>` discipline — `loadConfig` returns Result, never throws for expected failures | `config.ts:58-122`: missing file, malformed YAML, non-object top-level, and schema violations all return `Result.err(ConfigError)`. `throw` reserved for `assertNeverMarkSyncError` invariant only. | ✅ PASS |
| **12** | Error handling — no swallowed errors; context carried; AI-readable `humanMessage` | `config-errors.ts` formatter covers `required`/`type`/`enum`/`const`/`additionalProperties`/`minLength`/`minProperties`/`uniqueItems` + generic fallback. Every line: field path + expected vs got + suggested fix. `catch` blocks all return `Result.err` (no silent swallow). | ✅ PASS |
| **13** | No secrets in `.env.example` | `.env.example` is variable-name + comments only; all entries are `VAR=` with no values. New cross-references added (credentials ↔ `targets.<id>`, `MARKSYNC_ALLOW_BRANCHES` ↔ `sync.allowBranches`, `MARKSYNC_NO_COLOR` ↔ `output.color`). "DO NOT ADD" section intact. | ✅ PASS |
| **14** | ESM-only, `#imports` aliases used | `package.json` `"type": "module"`; `imports` map (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`) used throughout. One documented, justified deviation: `config.ts:30` imports `schema.json` via relative path because the `#domain/*` alias appends `.ts` (JSON cannot traverse it) — explained in the file header comment and consistent with `resolveJsonModule: true` in tsconfig. | ✅ PASS |

---

## 5. Test-Quality Audit (Checklist items 15–19)

| # | Requirement | Evidence | Status |
|---|-------------|----------|--------|
| **15** | Correct tier (unit); no over-mocking (real `yaml`/`ajv` exercised) | All scenarios at Unit tier (`bun:test`). Real `yaml` parser + real `ajv` validator exercised everywhere — zero mocks of the system-under-test. The only "mock-adjacent" technique is `TC-SELECT-008`, which proves purity by passing **non-existent paths** (no mock at all). | ✅ PASS |
| **16** | Tests mirror `src/` under `tests/` | `tests/unit/app/config.test.ts` ↔ `src/app/config.ts`; `…/config-errors.test.ts`; `…/document-config.test.ts`; `…/config-template.test.ts`; `…/select-files.test.ts`; `…/config-example-roundtrip.test.ts`; `tests/unit/domain/config/schema.test.ts`; `…/hierarchy.test.ts`; `tests/unit/domain/errors.test.ts`; `tests/unit/shared/glob.test.ts`. | ✅ PASS |
| **17** | Invalid-config cases covered (missing required, wrong type, unknown `granularity` incl. `commit-by-commit`) | `config.test.ts`: TC-CONFIG-003 (missing required), 004 (wrong type), 005 (unknown enum), 006 (commit-by-commit deferred), 009 (allErrors aggregation), 010 (malformed YAML), 011 (missing file). `schema.test.ts`: 12 invalid cases incl. target-shape, additionalProperties, version const. | ✅ PASS |
| **18** | Round-trip test: `marksync.yml.example` loads via `loadConfig` → `Result.ok` | `tests/unit/app/config-example-roundtrip.test.ts` (2 tests PASS): copies the committed example to a temp `marksync.yml` via real fs and asserts `Result.ok` + authored values survive. | ✅ PASS |
| **19** | `bun run check` exits 0 | Observed **exit 0**: `biome lint` (29 files clean), `biome format` clean, `tsc --noEmit` clean, `bun test` **117 pass / 0 fail** (445 expect calls), `depcruise src` **0 violations**. Coverage 100% functions / 91.81% lines (uncovered lines are defensive/invariant branches — acceptable per testing strategy). | ✅ PASS |

---

## 6. Doc-Reconciliation Audit (Checklist item 20 — Phase 7)

> **Note:** the plan's execution log marks task 9.3 "intentionally skipped" and
> Phase 9 acceptance "system docs reconciled → DEFERRED to Phase 7". **However**
> commit `aa036c2 docs(spec): reconcile system docs with GH-15 config contract`
> shows the reconciliation **was** performed. The docs are reconciled; only the
> plan's status tracking is stale (see minor finding M2).

| Doc | Update | Status |
|-----|--------|--------|
| `doc/spec/features/feature-cli.md` | `init` documented as MS-0002 config-scaffolding only (refuses overwrite; discovery/UUIDs later); `ConfigLoader` → concrete `loadConfig`/`ProjectConfig`/`ConfigError` contract; `doctor` surfaces `ConfigError`/`InvalidConfig`. | ✅ PASS — no over-claiming |
| `doc/overview/ubiquitous-language.md` | New Configuration bounded-context section: `marksync.yml`, `ProjectConfig`, `TargetConfig`, `DocumentConfig`, `ConfigError`, `Config Loader`, `File Selector`, `Document Config Resolver`, `Intended Hierarchy`, `marksync init`; Filesystem OHS updated (ajv at load boundary). | ✅ PASS |
| `doc/overview/glossary.md` | Added `ConfigAjvError`, `ConfigError`, `Front-matter`, `Hierarchy mirroring`, `marksync init`, `marksync.yml`, `ProjectConfig`, `selectFiles`, `TargetConfig`. | ✅ PASS |
| `.ai/rules/typescript.md` | `MarkSyncError` illustration refreshed to the **13-kind** union (incl. `InvalidConfig` + `ConfigAjvError` note); `related_changes` → `[GH-14, GH-15]`. | ✅ PASS (union illustration) — but see **M1** (allowed-dependency list) |

---

## 7. Findings

### Blocking — none.

### Minor (non-blocking, advisory)

These do not block merge. They are quality/consistency polish that can be
addressed in a follow-up (or the doc-syncer's next pass) at the maintainer's
discretion.

**M1 [minor] `yaml` not added to the allowed-dependency table in `typescript.md`**
- **File:** `.ai/rules/typescript.md:417-427` (Allowed dependency list table)
- **Observation:** The spec (§2.1, §8.4, NFR-7) and the plan (Phase 1.1) both
  assert "`yaml` and `ajv` are on the allowed-dependency list in typescript.md".
  That is accurate for `ajv` (table row L424) but **not** for `yaml` — the table
  was not extended when `yaml` was introduced. `typescript.md` was edited in
  this change (union illustration + `related_changes`), so the gap is a missed
  edit rather than an out-of-scope one.
- **Impact:** Non-blocking. **DEC-1** is a CEO-resolved binding decision that
  explicitly approves `yaml`, and the transitive-dep/license audit passes
  (`yaml@2.9.0`, ISC, **0** transitive deps — well under the ≤20 threshold).
  But a future license-audit/reviewer reading only the table could flag `yaml`
  as "unapproved".
- **Suggested fix:** add a row `| yaml | YAML parsing (marksync.yml + front-matter, DEC-1) | Latest |` to the table for consistency.

**M2 [minor] Plan execution log incorrectly records doc reconciliation as "skipped"**
- **File:** `doc/changes/2026-07/2026-07-07--GH-15--config-system/chg-GH-15-plan.md` (Phase 9 task 9.3 + Execution Log row 9 + Acceptance "system docs reconciled → DEFERRED")
- **Observation:** The log says 9.3 was "intentionally skipped" / "DEFERRED to Phase 7", but commit `aa036c2` reconciled all four docs (feature-cli, ubiquitous-language, glossary, typescript.md). The work is done; the bookkeeping is stale and self-contradictory (the AC status reads DEFERRED while the diff proves it PASSED).
- **Impact:** Non-blocking (positive — work done despite log saying otherwise). But it misleads `dod_check` (Phase 10) and the PR reviewer.
- **Suggested fix:** update task 9.3 checkbox to `[x]`, the Execution Log row 9 note, and the Phase 9 "system docs reconciled" acceptance to **PASSED** (ref commit `aa036c2`).

**M3 [nit] Redundant `Result` type-only alias import in `config-template.ts`**
- **File:** `src/app/config-template.ts:26-27`
- **Observation:** The module imports `Result` as a value (`L26`) **and** `Result as ResultType` as a type-only import (`L27`). Under `verbatimModuleSyntax`, the single value import is usable in both value and type positions, so `ResultType` is redundant. `writeStarterConfig`'s return type could use `Result<void, ConfigError>` directly.
- **Impact:** None (compiles fine; purely cosmetic redundancy).
- **Suggested fix:** drop `L27` and use `Result<void, ConfigError>` at the return-type site, or drop the value import if only the type is needed.

**M4 [nit] A few defensive/invariant branches are uncovered by tests**
- **Files:** `src/app/config-template.ts:119-125` (write-failure catch), `src/app/config.ts:74-76` (non-ENOENT read-error branch), `src/domain/errors.ts:106-112` (`assertNeverMarkSyncError` default arms), `src/app/config-errors.ts:50-54,92-98` (some keyword branches).
- **Observation:** Coverage is 100% functions / 91.81% lines; the uncovered lines are defensive paths that are intentionally hard to trigger (disk write failures, the unreachable `never` arms).
- **Impact:** None — these are invariant/defensive branches; the testing strategy values invariant coverage over raw line coverage. Optional hardening: a fault-injection test for the write-failure path if desired. No change required.

---

## 8. Heuristic Notes (built-in review)

Spot-checks against the built-in heuristics confirm no concerns:

- **Correctness:** glob matcher loop guards are correct (`charAt` returns `""`
  past end, which exits the `*` run loop); `selectFiles` de-dup + sort is
  deterministic; `applyDefaults` is the single source of truth for defaults.
- **Security:** config holds no secrets; user-authored YAML is ajv-validated
  before any field is trusted; no `eval`/dynamic code from config values;
  `.env.example` has no values.
- **Reliability:** all expected failures flow through `Result.err`; the
  loader compiles ajv once (module singleton); `init` is refuse-to-overwrite by
  default (idempotent re-run safe).
- **API/back-compat:** adding `InvalidConfig` is a contract extension; the
  `never`-check guarantees any existing handler is surfaced at compile time
  (intended safety property, not a regression).
- **Dependencies:** `yaml@2.9.0` (ISC, 0 transitive deps) + `ajv@8.20.0` (MIT,
  4 zero-dep deps) — both permissive, both well under the ≤20 threshold.

---

## 9. Verdict

# ✅ **PASS**

All 9 acceptance criteria are implemented and proven by passing tests. All 8
story deliverables are present. All five binding decisions (DEC-1..DEC-5) are
honoured. The full quality gate is green (`bun run check` exit 0 — 117 tests,
0 violations, typecheck clean). Tier boundaries are enforced and clean. The
exhaustive `never`-check is intact (NFR-3). Docs are reconciled to the 13-kind
union and the implemented contract.

No blocking or major findings. The four minor items (M1–M4) are advisory polish
that do not affect correctness, safety, or the ACs.

**Recommended next step:** **PROCEED** to Phase 10 (`dod_check`) and PR creation.
M1 and M2 (doc/plan consistency) can optionally be tidied before the PR or
deferred to the doc-syncer; M3/M4 are optional nits.

*No remediation phase appended to the implementation plan — the change meets the
Definition of Ready/Definition of Done as delivered.*
