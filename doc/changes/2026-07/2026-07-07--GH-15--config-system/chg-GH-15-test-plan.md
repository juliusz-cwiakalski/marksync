---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-15-test-plan
status: Updated
created: 2026-07-07T04:05:31Z
last_updated: 2026-07-07T04:21:55Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical]
version_impact: minor
summary: "Test plan for the marksync.yml config system — JSON Schema v1 validation (valid + each invalid class), typed pure loader with defaults, file selection, hierarchy mirroring, front-matter overrides, init round-trip, and the ConfigError (InvalidConfig) kind added to the exhaustive MarkSyncError union."
links:
  change_spec: ./chg-GH-15-spec.md
  implementation_plan: "./chg-GH-15-plan.md (pending — delivery_planning phase not yet complete)"
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E2-S2] Config system — marksync.yml schema, typed loader, AI-readable validation, selection, hierarchy mirroring, front-matter overrides, init skeleton

## 1. Scope and Objectives

This plan verifies the repository-owned YAML configuration system (`marksync.yml`)
introduced by GH-15: the v1 JSON Schema, the mirrored TypeScript types, the pure
validating loader `loadConfig(cwd): Result<ProjectConfig, ConfigError>`, file
selection (`selectFiles(config, paths[])`), intended hierarchy mirroring,
per-document front-matter overrides (`resolveDocumentConfig`), the
`ConfigError` (`InvalidConfig`) failure kind added to the exhaustive
`MarkSyncError` union, and the `marksync init` starter-config skeleton.

The core integrity risks this plan guards against are: (a) an invalid config
silently loading or throwing an opaque error instead of a structured,
AI-readable `ConfigError`; (b) the two-source drift between the JSON Schema and
the TS types going undetected; (c) the exhaustive `never`-check breaking when
the new error kind is added; (d) `selectFiles` glob semantics diverging from
Git/user expectations; and (e) front-matter edge cases (absent, malformed,
unrelated keys, CRLF) mishandled. All scenarios are **Unit tier** per the
testing strategy — the loader is pure w.r.t. the repo tree (`selectFiles`
accepts a caller-supplied `string[]`), and the only I/O is reading one YAML
file.

### 1.1 In Scope

- JSON Schema v1 validation: a well-formed config loads; every invalid class
  (missing required field, wrong type, unknown `granularity`, and the
  explicitly-deferred `commit-by-commit`) yields a structured `ConfigError`.
- Default application (e.g. `stalePlanMinutes` = 15, render/output defaults).
- `selectFiles(config, paths[])` — `select` globs minus `exclude` globs across
  fixture file lists, including `**` nested-dir and anchoring semantics.
- Front-matter parse + `resolveDocumentConfig(base, frontmatter)` — `title`
  override, `exclude: true` drop, `parent`/`uuid` pass-through, absent/unrelated/
  malformed-fence/CRLF tolerance.
- Intended hierarchy mirroring (`mirror` vs `flat`) under `root`.
- `marksync init` starter-config round-trip (the config-writing helper tested
  directly, not through the CLI).
- `ConfigError` shape (`{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }`)
  + the `humanMessage` AI-readable contract (field path + expected vs actual +
  suggested fix).
- Exhaustive-union compile safety (`bun run typecheck` exits 0 after adding
  `InvalidConfig` to both the union and `assertNeverMarkSyncError`).
- Config-load latency guardrail (≤ 50 ms p95 — informational).

### 1.2 Out of Scope & Known Gaps

- **Git adapter / committed-tree reads** — out of scope (E3-S3). `selectFiles`
  takes a caller-supplied `string[]`; no Git/working-tree I/O is exercised here.
- **Real Confluence parent-page-ID resolution** — out of scope (E3-S4/E3-S6).
  Only the *intended* hierarchy structure is computed.
- **`granularity: commit-by-commit` support** — out of scope for MS-0002
  (ADR-0010 C-5); only the *rejection* path is tested.
- **Integration / Golden / Mermaid-DOM / BDD / E2E tiers** — not applicable to
  this story (no adapter boundary, no renderer, no lifecycle invariant).
- **Full `init` DX** (discovery, UUID assignment, interactive wizard) — MS-0003;
  only the config-scaffolding round-trip is tested.
- **Lock-file schema** — separate story; only config here.
- **Schema→TS code generation** — deferred (OQ-1 in spec); types are
  hand-mirrored and validated jointly with the schema.

## 2. References

| Artifact | Path |
|----------|------|
| Change specification | [`./chg-GH-15-spec.md`](./chg-GH-15-spec.md) |
| Implementation plan | `./chg-GH-15-plan.md` _(pending — delivery_planning phase)_ |
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S2--config-system.md` |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) |
| Granularity constraint | [ADR-0010 (C-5)](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md) |
| `Result<T,E>` primitive | `src/domain/result.ts` |
| `MarkSyncError` union + exhaustive check | `src/domain/errors.ts` |
| CLI feature spec (ConfigLoader, doctor) | `doc/spec/features/feature-cli.md` |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| Story AC | Spec AC | Description | F-# | TC ID(s) | Status |
|----------|---------|-------------|-----|----------|--------|
| AC-1 | AC-F3-1 | Valid `marksync.yml` loads → `Result.ok(ProjectConfig)` with defaults applied (e.g. `stalePlanMinutes` = 15) | F-1, F-2, F-3 | TC-CONFIG-001, TC-CONFIG-002 | Covered |
| AC-2 | AC-F7-1 | Invalid config (missing required field / wrong type / unknown `granularity`) → `Result.err(ConfigError)` with AI-readable `humanMessage` (field path + expected shape + suggested fix) | F-7 | TC-CONFIG-003, TC-CONFIG-004, TC-CONFIG-005, TC-CONFIG-006, TC-CONFIG-008, TC-CONFIG-009, TC-CONFIG-010 | Covered |
| AC-2 | AC-F7-2 | Adding `InvalidConfig` leaves `MarkSyncError` union **and** `assertNeverMarkSyncError` compiling with zero type errors | F-7, DM-3 | TC-CONFIG-012 | Covered (typecheck gate) |
| AC-3 | AC-F3-2 | `selectFiles(config, paths[])` returns exactly `select` globs minus `exclude` globs | F-3 | TC-SELECT-001, TC-SELECT-002, TC-SELECT-003, TC-SELECT-004, TC-SELECT-005, TC-SELECT-006, TC-SELECT-007 | Covered |
| AC-4 | AC-F4-1 | `marksync.title: "X"` overrides the derived title | F-4 | TC-DOC-001 | Covered |
| AC-4 | AC-F4-2 | `marksync.exclude: true` removes the document from the selected set | F-4 | TC-DOC-002 | Covered |
| AC-4 | AC-F4-1 | `marksync.parent` / `marksync.uuid` pass-through (consumed downstream by E3-S1/E3-S4) | F-4 | TC-DOC-003, TC-DOC-004 | Covered |
| AC-4 | AC-F4-1 | Front-matter edge cases (absent / unrelated keys / malformed fences / CRLF / no overrides) | F-4 | TC-DOC-005, TC-DOC-006, TC-DOC-007, TC-DOC-008, TC-DOC-009 | Covered |
| AC-5 | AC-F6-1 | `hierarchy: mirror` — `docs/a/b.md` under `root: docs/` → intended parent path `docs/a/` | F-6 | TC-HIER-001, TC-HIER-002, TC-HIER-003, TC-HIER-005 | Covered |
| AC-5 | AC-F6-1 | `hierarchy: flat` — all selected pages intended under the single configured parent | F-6 | TC-HIER-004 | Covered |
| AC-6 | AC-F5-1 | `marksync init` writes a starter `marksync.yml` that round-trips through `loadConfig` without error | F-5, F-8 | TC-INIT-001, TC-INIT-002 | Covered |
| AC-6 | AC-F5-1 | `init` overwrite-guard behaviour | F-5 | TC-INIT-003 | TODO — see OQ-TP-1 |
| AC-7 | AC-F8-1 | All config unit tests pass; `bun run check` exits 0 | F-1..F-8 | All Unit TCs + TC-CONFIG-012 | Covered (quality gate) |

**Capability (F-#) rollup:**

| F-# | Capability | TC ID(s) |
|-----|------------|----------|
| F-1 | `marksync.yml` v1 JSON Schema | TC-CONFIG-001, TC-CONFIG-002, TC-CONFIG-003, TC-CONFIG-004, TC-CONFIG-005, TC-CONFIG-006, TC-CONFIG-009, TC-CONFIG-010 |
| F-2 | Mirrored TS config types | TC-CONFIG-001, TC-CONFIG-002, TC-CONFIG-012 |
| F-3 | Typed pure loader + file selection | TC-CONFIG-001, TC-CONFIG-002, TC-SELECT-001..007 |
| F-4 | Document-level front-matter overrides | TC-DOC-001..009 |
| F-5 | `marksync init` config skeleton | TC-INIT-001, TC-INIT-002, TC-INIT-003 |
| F-6 | Intended hierarchy mirroring | TC-HIER-001..005 |
| F-7 | `ConfigError` in `MarkSyncError` + AI-readable diagnostics | TC-CONFIG-003..010, TC-CONFIG-012 |
| F-8 | Committed config example | TC-INIT-002 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No REST/HTTP endpoints (spec §8.1) and no events/messages (spec §8.2) are
introduced. Data-model coverage:

| DM-# | Element | Description | TC ID(s) |
|------|---------|-------------|----------|
| DM-1 | `ProjectConfig` | Fully-typed, defaults-applied config returned by `loadConfig` on success | TC-CONFIG-001, TC-CONFIG-002 |
| DM-2 | `TargetConfig` | Per-target shape (`type`, `spaceKey`, `parentPageId`) within `targets` | TC-CONFIG-001 (full-config fixture exercises a `targets` map) |
| DM-3 | `ConfigError` / `InvalidConfig` kind | `{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }` — the config-failure arm added to the exhaustive union | TC-CONFIG-003..010, TC-CONFIG-011, TC-CONFIG-012 |

**Public interface contracts consumed downstream** (verified as side-effects of
the loader/selection/override tests):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `loadConfig(cwd): Result<ProjectConfig, ConfigError>` | push-flow, plan, sync, doctor | TC-CONFIG-001..011 |
| `selectFiles(config, paths[]): string[]` | discovery step | TC-SELECT-001..007 |
| `resolveDocumentConfig(base, frontmatter)` | E3-S3 (markdown pipeline), E3-S1 (identity) | TC-DOC-001..009 |
| Intended hierarchy structure | E3-S4 / E3-S6 (parent-page resolution) | TC-HIER-001..005 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# | Requirement | Threshold | TC ID(s) | Status |
|-------|-------------|-----------|----------|--------|
| NFR-1 | Config-load latency | ≤ 50 ms p95 on reference hardware | TC-CONFIG-013 | Covered (informational benchmark) |
| NFR-2 | Diagnostic completeness | 100% of invalid cases yield `humanMessage` naming field path + expected shape + suggested fix | TC-CONFIG-003, TC-CONFIG-004, TC-CONFIG-005, TC-CONFIG-006, TC-CONFIG-008 | Covered |
| NFR-3 | Exhaustiveness safety | Union + `assertNeverMarkSyncError` compile with zero type errors | TC-CONFIG-012 | Covered (typecheck gate) |
| NFR-4 | Loader purity | `selectFiles` performs zero Git/working-tree I/O — accepts a `string[]` | TC-SELECT-008 | Covered (signature + no-FS assertion) |
| NFR-5 | Granularity enforcement | `commit-by-commit` rejected with explicit "deferred" error; schema accepts only `squash` | TC-CONFIG-006 | Covered |
| NFR-6 | Quality gate | All config unit tests pass; `bun run check` exits 0 | All Unit TCs; TC-CONFIG-012 | Covered (gate) |
| NFR-7 | Dependency hygiene | `yaml` + `ajv` are runtime deps on the allowed list; `yaml` transitive deps ≤ 20; license-audit rejects copyleft | — (CI audit gate) | Manual / CI — see §6 |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md`, this story is exercised **exclusively at the
Unit tier**. There is no adapter boundary (Confluence/Git are out of scope), no
renderer, and no lifecycle invariant — so Integration, Golden, Mermaid-DOM, BDD,
and E2E tiers are not applicable (story Test matrix confirms this).

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes (primary) | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| Integration | No | — | — | — |
| Golden fixture | No | — | — | — |
| Mermaid-DOM | No | — | — | — |
| BDD (Gherkin) | No | — | — | — |
| E2E (live-sandbox) | No | — | — | — |
| Performance (informational) | Yes — latency guardrail only | `bun:test` timing | `tests/unit/` | folded into `config.test.ts` |
| Type-level (compile safety) | Yes — exhaustive union | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per testing-strategy.md / typescript.md):**

```
src/domain/config/schema.json        → (exercised via loadConfig, no standalone test)
src/domain/config/types.ts           → (exercised via loader + typecheck)
src/app/config.ts                    → tests/unit/app/config.test.ts
src/app/select-files.ts (or config)  → tests/unit/app/select-files.test.ts
src/app/document-config.ts           → tests/unit/app/document-config.test.ts
src/domain/config/hierarchy.ts       → tests/unit/domain/config/hierarchy.test.ts
src/app/config-template.ts (helper)  → tests/unit/app/config-template.test.ts
src/domain/errors.ts                 → tests/unit/domain/errors.test.ts (ConfigError shape; compile safety via typecheck)
tests/unit/app/fixtures/*.yml        → invalid-config YAML fixtures
tests/unit/app/fixtures/file-lists/  → selectFiles path-list fixtures
```

> The exact module split inside `src/app/` is a delivery decision (the story
> names `src/app/config.ts` explicitly; selection/front-matter/init may be
> co-located or split). Hierarchy mirroring, however, is a **domain** rule and
> lives in `src/domain/config/hierarchy.ts` (per the plan and
> `architecture-overview.md`'s dependency-direction matrix — the Hierarchy
> Planner is domain, not application). The test files above mirror whichever
> modules are created — the `tests/` path mirrors `src/` by convention.

**Over-mocking guardrail (TDR-0004):** do NOT mock the `ajv` validator or the
`yaml` parser — exercise them with real YAML inputs and real validator outputs.
Fault injection is not needed (config has no adapter boundary here). No mocks are
used in any scenario below; all inputs are real fixture strings/files.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-CONFIG-001 | Valid full config loads as `Result.ok(ProjectConfig)` | Happy Path | Critical | High | AC-1 |
| TC-CONFIG-002 | Minimal valid config receives all defaults (`stalePlanMinutes` = 15) | Edge Case | Critical | High | AC-1 |
| TC-CONFIG-003 | Missing required field → `ConfigError` naming the field path | Negative | Critical | High | AC-2 |
| TC-CONFIG-004 | Wrong type for a field → `ConfigError` naming expected shape | Negative | Critical | High | AC-2 |
| TC-CONFIG-005 | Unknown `granularity` value → `ConfigError` | Negative | Critical | High | AC-2 |
| TC-CONFIG-006 | `granularity: commit-by-commit` rejected with "deferred" message | Negative | Critical | High | AC-2 (NFR-5) |
| TC-CONFIG-007 | `ConfigError` is a valid `MarkSyncError` `InvalidConfig` member | Corner Case | Important | High | AC-2 |
| TC-CONFIG-008 | `humanMessage` contains field path + expected + suggested fix (each invalid class) | Corner Case | Critical | High | AC-2 (NFR-2) |
| TC-CONFIG-009 | `allErrors` collects every violation, not just the first | Edge Case | Important | Medium | AC-2 |
| TC-CONFIG-010 | Malformed YAML (syntax error) → `ConfigError`, not a throw | Edge Case | Important | Medium | AC-2 |
| TC-CONFIG-011 | Missing `marksync.yml` file → `ConfigError` via the narrowed `Result` channel | Edge Case | Important | Medium | AC-2 |
| TC-CONFIG-012 | Exhaustive union compiles after adding `InvalidConfig` (typecheck gate) | Regression | Critical | High | AC-2 (NFR-3) |
| TC-CONFIG-013 | Config-load latency ≤ 50 ms p95 (informational) | Performance | Minor | Low | AC-1 (NFR-1) |
| TC-SELECT-001 | `selectFiles` includes paths matching `select` globs | Happy Path | Critical | High | AC-3 |
| TC-SELECT-002 | `selectFiles` excludes paths matching `exclude` globs | Happy Path | Critical | High | AC-3 |
| TC-SELECT-003 | `selectFiles` = `select` minus `exclude` on a mixed fixture list | Happy Path | Critical | High | AC-3 |
| TC-SELECT-004 | `**` glob matches nested directories | Edge Case | Important | Medium | AC-3 |
| TC-SELECT-005 | Glob anchoring relative to `root` behaves as documented | Corner Case | Important | Medium | AC-3 (OQ-2) |
| TC-SELECT-006 | Empty path list → empty result (no throw) | Edge Case | Minor | Low | AC-3 |
| TC-SELECT-007 | Empty `select` / empty `exclude` edge behaviour | Edge Case | Minor | Low | AC-3 |
| TC-SELECT-008 | `selectFiles` purity — zero Git/FS I/O (accepts `string[]`) | Corner Case | Important | Medium | AC-3 (NFR-4) |
| TC-DOC-001 | `marksync.title: "X"` overrides the derived title | Happy Path | Critical | High | AC-4 |
| TC-DOC-002 | `marksync.exclude: true` removes the document from selection | Happy Path | Critical | High | AC-4 |
| TC-DOC-003 | `marksync.parent` overrides the intended parent | Happy Path | Important | Medium | AC-4 |
| TC-DOC-004 | `marksync.uuid` is carried through (identity hook) | Happy Path | Important | Medium | AC-4 |
| TC-DOC-005 | Absent front-matter is tolerated (not an error) | Edge Case | Important | Medium | AC-4 |
| TC-DOC-006 | Unrelated (non-`marksync`) front-matter keys are ignored | Edge Case | Minor | Low | AC-4 |
| TC-DOC-007 | Malformed fences (missing closing `---`) are tolerated/handled | Edge Case | Important | Medium | AC-4 |
| TC-DOC-008 | CRLF line endings are handled | Edge Case | Minor | Low | AC-4 |
| TC-DOC-009 | No overrides → `resolveDocumentConfig` returns base unchanged | Corner Case | Minor | Low | AC-4 |
| TC-HIER-001 | `mirror`: `docs/a/b.md` under `root: docs/` → parent `docs/a/` | Happy Path | Critical | High | AC-5 |
| TC-HIER-002 | `mirror`: deeper nesting `docs/a/b/c.md` → parent `docs/a/b/` | Edge Case | Important | Medium | AC-5 |
| TC-HIER-003 | `mirror`: file directly under root → parent is the configured/root parent | Edge Case | Important | Medium | AC-5 |
| TC-HIER-004 | `flat`: all selected pages intended under the single configured parent | Happy Path | Important | Medium | AC-5 |
| TC-HIER-005 | Path normalization (trailing slash / `.` segments) | Edge Case | Minor | Low | AC-5 |
| TC-INIT-001 | `init` writes a starter `marksync.yml` that round-trips via `loadConfig` | Happy Path | Critical | High | AC-6 |
| TC-INIT-002 | Committed `marksync.yml.example` loads without error | Regression | Important | Medium | AC-6 |
| TC-INIT-003 | `init` overwrite-guard behaviour | Negative | Minor | Low | AC-6 (TODO — OQ-TP-1) |

### 5.2 Scenario Details

#### TC-CONFIG-001 - Valid full config loads as `Result.ok(ProjectConfig)`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, F-8, DM-1, DM-2, AC-F3-1, AC-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/valid-full.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture `marksync.yml` exercising every blueprint §4 field set: `version`,
  `root`, `select[]`, `exclude[]`, `hierarchy`, `targets.<id>.{type,spaceKey,parentPageId}`,
  `sync.{allowBranches[],granularity,stalePlanMinutes}`, `render.mermaid.*`,
  `output.*`, `provenance.visiblePanel`.

**Steps**:

1. Invoke `loadConfig(cwd)` with `cwd` pointing at the fixture directory.
2. Assert the return is `{ ok: true, value }`.
3. Assert `value` is a fully-typed `ProjectConfig` whose fields equal the
   fixture values (including at least one `targets` entry shaped as
   `TargetConfig`).

**Expected Outcome**:

- `Result.ok(ProjectConfig)` returned; no throw; all authored values present
  and correctly typed.

#### TC-CONFIG-002 - Minimal valid config receives all defaults (`stalePlanMinutes` = 15)

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, DM-1, AC-F3-1, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/valid-minimal.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture containing only the required fields (e.g. `version`, `root`, and a
  minimal `targets` map), omitting all optional fields including
  `sync.stalePlanMinutes`, `render.*`, `output.*`, `provenance.*`.

**Steps**:

1. Invoke `loadConfig(cwd)` on the minimal fixture.
2. Assert `Result.ok`.
3. Assert defaults are applied — specifically `sync.stalePlanMinutes === 15`,
  plus the documented defaults for `render.mermaid.*`, `output.*`,
  `provenance.visiblePanel`, and any other defaulted optional fields.

**Expected Outcome**:

- A complete `ProjectConfig` with every optional field defaulted per the v1
  schema; `stalePlanMinutes` equals 15 (the value downstream E3-S2/E3-S7 depend on).

#### TC-CONFIG-003 - Missing required field → `ConfigError` naming the field path

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/invalid-missing-required.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture omitting a required top-level field (e.g. `root` or `version`) —
  parametrized across each required field.

**Steps**:

1. Invoke `loadConfig(cwd)` on the fixture.
2. Assert the return is `{ ok: false, error }` with `error.kind === "InvalidConfig"`.
3. Assert `error.path` / `error.ajvErrors[]` identify the missing field path.
4. Assert `error.humanMessage` names the field, the expected shape, and a
   suggested fix.

**Expected Outcome**:

- `Result.err(ConfigError)` (never a throw); the diagnostic is self-contained
  and AI-actionable.

#### TC-CONFIG-004 - Wrong type for a field → `ConfigError` naming expected shape

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (parametrized; fixtures `tests/unit/app/fixtures/invalid-wrong-type-*.yml`)
**Tags**: @backend, @api

**Preconditions**:

- Parametrized fixtures, each giving a wrong type to one field — e.g.
  `select: "docs/**/*.md"` (string instead of array), `sync.stalePlanMinutes: "15"`
  (string instead of number), `targets: []` (array instead of object map).

**Steps**:

1. For each fixture, invoke `loadConfig(cwd)`.
2. Assert `Result.err(ConfigError)` with `kind === "InvalidConfig"`.
3. Assert `humanMessage` states the expected type vs the actual received type
   and a suggested fix.

**Expected Outcome**:

- Each wrong-typed field yields a typed `ConfigError` with an AI-readable
   expected-vs-actual diagnostic.

#### TC-CONFIG-005 - Unknown `granularity` value → `ConfigError`

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/invalid-granularity-unknown.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture with `sync.granularity: batch` (or any value outside the accepted
  enum, excluding the special `commit-by-commit` case covered in TC-CONFIG-006).

**Steps**:

1. Invoke `loadConfig(cwd)`.
2. Assert `Result.err(ConfigError)`, `kind === "InvalidConfig"`.
3. Assert the diagnostic references the `sync.granularity` path, the accepted
   value(s), and a suggested fix.

**Expected Outcome**:

- Unknown granularity rejected with a clear enum-violation diagnostic.

#### TC-CONFIG-006 - `granularity: commit-by-commit` rejected with "deferred" message

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2, NFR-5, DEC-2, ADR-0010 C-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/invalid-granularity-commit-by-commit.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture with `sync.granularity: commit-by-commit`.

**Steps**:

1. Invoke `loadConfig(cwd)`.
2. Assert `Result.err(ConfigError)`, `kind === "InvalidConfig"`.
3. Assert the `humanMessage` explicitly indicates `commit-by-commit` is
   deferred to a future milestone (ADR-0010 C-5 / DEC-2) — not merely a generic
   "unknown enum" message — and points to `squash` as the MS-0002 value.

**Expected Outcome**:

- The deferred-granularity case is rejected with a specific, actionable
   "deferred" diagnostic distinct from a plain enum violation.

#### TC-CONFIG-007 - `ConfigError` is a valid `MarkSyncError` `InvalidConfig` member

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-7, DM-3, AC-F7-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/errors.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `InvalidConfig` has been added to the `MarkSyncError` union.

**Steps**:

1. Construct a `ConfigError` value: `{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }`.
2. Assert it is assignable to `MarkSyncError` (type-level, enforced by the
   compiler) and that discriminating on `error.kind === "InvalidConfig"` narrows
   correctly at runtime.
3. Assert the required fields (`path`, `ajvErrors`, `humanMessage`) are present.

**Expected Outcome**:

- `ConfigError` flows through the typed `Result` channel as a first-class
   `MarkSyncError` arm; `loadConfig`'s narrowed `Result<ProjectConfig, ConfigError>`
   composes with the full union downstream.

#### TC-CONFIG-008 - `humanMessage` contains field path + expected + suggested fix (each invalid class)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, DM-3, AC-F7-1, AC-2, NFR-2, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (parametrized over the TC-CONFIG-003..006 fixtures)
**Tags**: @backend, @api

**Preconditions**:

- The custom ajv error formatter is implemented (maps `instancePath` +
  `keyword` → `humanMessage`).

**Steps**:

1. For each invalid class (missing required, wrong type, unknown granularity,
   commit-by-commit), load the fixture and obtain the `ConfigError`.
2. Assert `humanMessage` contains: (a) the field path; (b) the expected shape
   vs actual; (c) a suggested fix.
3. Assert the message is non-empty and self-contained (an agent could act
   without extra context).

**Expected Outcome**:

- 100% of the invalid classes satisfy the AI-readable diagnostic contract
   (NFR-2).

#### TC-CONFIG-009 - `allErrors` collects every violation, not just the first

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/invalid-multiple.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture with two or more simultaneous violations (e.g. a missing required
  field AND a wrong-typed field).

**Steps**:

1. Invoke `loadConfig(cwd)`.
2. Assert `Result.err(ConfigError)`.
3. Assert `error.ajvErrors` contains an entry for each violation (ajv compiled
   with `allErrors: true`).

**Expected Outcome**:

- All violations are surfaced in one `ConfigError`, not just the first.

#### TC-CONFIG-010 - Malformed YAML (syntax error) → `ConfigError`, not a throw

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-7, DM-3, AC-F7-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (fixture `tests/unit/app/fixtures/invalid-malformed-yaml.yml`)
**Tags**: @backend, @api

**Preconditions**:

- A fixture that is syntactically invalid YAML (e.g. broken indentation /
  unbalanced quotes), exercised against the real `yaml` parser (no mock).

**Steps**:

1. Invoke `loadConfig(cwd)`.
2. Assert the return is `Result.err(ConfigError)` — NOT a thrown exception.
3. Assert the diagnostic indicates a parse failure and is AI-readable.

**Expected Outcome**:

- A YAML parse failure is channelled through the typed `Result` as a
   `ConfigError`, consistent with every other invalid-config path.

#### TC-CONFIG-011 - Missing `marksync.yml` file → `ConfigError` via the narrowed `Result` channel

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, F-7, DM-3, AC-F7-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A temporary empty `cwd` with no `marksync.yml`.

**Steps**:

1. Invoke `loadConfig(cwd)` where no `marksync.yml` exists.
2. Assert the outcome is `Result.err(ConfigError)` (the narrowed channel),
   not an unhandled throw — OR, if the implementation chooses to treat an
   absent config as a distinct non-error path, document that decision (see
   OQ-TP-2).

**Expected Outcome**:

- A missing config file does not produce an opaque throw; the behaviour is
   documented and consistent with the `Result<ProjectConfig, ConfigError>`
   contract.

**Notes / Clarifications**:

- The spec narrows `loadConfig`'s error to `ConfigError` (DEC-3) but does not
  explicitly define the missing-file semantics. See OQ-TP-2.

#### TC-CONFIG-012 - Exhaustive union compiles after adding `InvalidConfig` (typecheck gate)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, DM-3, AC-F7-2, AC-2, NFR-3, RSK-2
**Test Type(s)**: Manual (compile gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: `src/domain/errors.ts` (union + `assertNeverMarkSyncError`); gate = `bun run typecheck`
**Tags**: @backend, @api

**Preconditions**:

- `InvalidConfig` has been added to BOTH the `MarkSyncError` union AND the
  `assertNeverMarkSyncError` `never`-switch.

**Steps**:

1. Run `bun run typecheck` (`tsc --noEmit` under the strict config from
   typescript.md).
2. Assert it exits 0.

**Expected Outcome**:

- Zero type errors: the `never`-check remains exhaustive, proving the union
   and the switch were updated together (NFR-3). This is the AC-F7-2 gate.

#### TC-CONFIG-013 - Config-load latency ≤ 50 ms p95 (informational)

**Scenario Type**: Performance
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-3, AC-F3-1, AC-1, NFR-1
**Test Type(s)**: Performance
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts` (timing assertion)
**Tags**: @backend, @perf

**Preconditions**:

- The valid full-config fixture from TC-CONFIG-001.

**Steps**:

1. Run `loadConfig(cwd)` N times (e.g. 100) on the fixture.
2. Measure elapsed time per invocation.
3. Compute p95.

**Expected Outcome**:

- p95 latency ≤ 50 ms (NFR-1). This is an informational guardrail; on shared
   CI runners the threshold may be relaxed/recorded rather than hard-failed —
   record the chosen policy (see OQ-TP-3).

#### TC-SELECT-001 - `selectFiles` includes paths matching `select` globs

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-2, AC-3, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A `ProjectConfig` with `select: ["docs/**/*.md"]` and an empty `exclude`.
- A fixture path list containing matching and non-matching entries.

**Steps**:

1. Invoke `selectFiles(config, paths)`.
2. Assert the result contains exactly the paths matching the `select` globs.

**Expected Outcome**:

- All and only `select`-matching paths are included.

#### TC-SELECT-002 - `selectFiles` excludes paths matching `exclude` globs

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-2, AC-3, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A `ProjectConfig` with a broad `select` and an `exclude` (e.g.
  `exclude: ["docs/draft/**"]`).
- A fixture path list that includes some `select`-matching paths that also
  match `exclude`.

**Steps**:

1. Invoke `selectFiles(config, paths)`.
2. Assert no `exclude`-matching path appears in the result.

**Expected Outcome**:

- Every `exclude`-matching path is removed from the selected set.

#### TC-SELECT-003 - `selectFiles` = `select` minus `exclude` on a mixed fixture list

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-2, AC-3, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts` (fixture `tests/unit/app/fixtures/file-lists/mixed.txt`)
**Tags**: @backend, @api

**Preconditions**:

- A realistic fixture file list with nested directories, multiple extensions,
  and draft/internal paths.

**Steps**:

1. Invoke `selectFiles(config, paths)` with both `select` and `exclude` set.
2. Assert the result equals exactly `select`-matches minus `exclude`-matches
   (zero misclassifications).

**Expected Outcome**:

- Selection is the precise set difference; this is the AC-3 / AC-F3-2
   correctness bar.

#### TC-SELECT-004 - `**` glob matches nested directories

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-2, AC-3, RSK-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `select: ["docs/**/*.md"]`; a path list with files at varying depths
  (`docs/a.md`, `docs/a/b.md`, `docs/a/b/c.md`).

**Steps**:

1. Invoke `selectFiles(config, paths)`.
2. Assert all depth variants are matched by `**`.

**Expected Outcome**:

- Standard (`micromatch`-style) `**` recursion semantics (RSK-6).

#### TC-SELECT-005 - Glob anchoring relative to `root` behaves as documented

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-2, AC-3, RSK-6, OQ-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A `root: docs/` and globs exercising anchoring (leading-slash anchored vs
  glob-relative) — the chosen semantics per OQ-2 are documented.

**Steps**:

1. Invoke `selectFiles(config, paths)` with anchored vs relative glob variants.
2. Assert the matches conform to the documented anchoring behaviour.

**Expected Outcome**:

- Anchoring is unambiguous and matches the documented contract (resolves OQ-2
   at delivery).

#### TC-SELECT-006 - Empty path list → empty result (no throw)

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-3, AC-F3-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Any valid `ProjectConfig`.

**Steps**:

1. Invoke `selectFiles(config, [])`.
2. Assert the result is an empty array and no exception is thrown.

**Expected Outcome**:

- Empty input is handled gracefully.

#### TC-SELECT-007 - Empty `select` / empty `exclude` edge behaviour

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-3, AC-F3-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A `ProjectConfig` with an empty `select` array, and separately one with an
  empty `exclude` array.

**Steps**:

1. Invoke `selectFiles` with an empty `select` (expect empty result).
2. Invoke `selectFiles` with an empty `exclude` (expect all `select`-matches
   retained).

**Expected Outcome**:

- Empty glob arrays are handled without error and produce the documented
   set-difference result.

#### TC-SELECT-008 - `selectFiles` purity — zero Git/FS I/O (accepts `string[]`)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-2, AC-3, NFR-4, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/select-files.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `selectFiles` is typed `(config, paths: string[]) => string[]`.

**Steps**:

1. Assert the function signature accepts a plain `string[]` and returns a
  `string[]` (no `Repository`/Git dependency).
2. Spy/stub the filesystem module (only here, to *prove absence* of access —
   this is not domain-logic mocking) and confirm no FS/Git call is made during
   selection.

**Expected Outcome**:

- `selectFiles` is pure w.r.t. the repo tree (NFR-4 / DEC-4): the Git adapter
   (E3-S3) owns tree reads.

**Notes / Clarifications**:

- The only permitted mock in this plan is this FS-spy used to *prove* no I/O
  occurs — consistent with the over-mocking guardrail (mocks for boundary
  proof, not for domain-logic behaviour).

#### TC-DOC-001 - `marksync.title: "X"` overrides the derived title

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A base/derived document config with a derived title (e.g. from the filename).
- A Markdown front-matter block containing `marksync.title: "X"`.

**Steps**:

1. Parse the front-matter and call `resolveDocumentConfig(base, frontmatter)`.
2. Assert the merged config's title is `"X"` (overriding the derived title).

**Expected Outcome**:

- Per-document title override takes precedence (AC-F4-1).

#### TC-DOC-002 - `marksync.exclude: true` removes the document from selection

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-2, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A document whose front-matter sets `marksync.exclude: true`.
- The document is otherwise in the selected set.

**Steps**:

1. Run selection + `resolveDocumentConfig` over a list that includes the
  excluded document.
2. Assert the excluded document is absent from the final selected set.

**Expected Outcome**:

- `marksync.exclude: true` drops the document from selection (AC-F4-2).

#### TC-DOC-003 - `marksync.parent` overrides the intended parent

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-1, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A document with front-matter `marksync.parent: <path-or-id>`.

**Steps**:

1. Call `resolveDocumentConfig(base, frontmatter)`.
2. Assert the merged config's intended parent equals the overridden value
   (not the hierarchy-derived parent).

**Expected Outcome**:

- `marksync.parent` overrides the intended parent path.

#### TC-DOC-004 - `marksync.uuid` is carried through (identity hook)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-1, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A document with front-matter `marksync.uuid: <uuid-v7>`.

**Steps**:

1. Call `resolveDocumentConfig(base, frontmatter)`.
2. Assert the merged config carries the `uuid` unchanged.

**Expected Outcome**:

- The source-side identity (consumed by E3-S1) passes through the override
   merger.

#### TC-DOC-005 - Absent front-matter is tolerated (not an error)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-1, AC-4, RSK-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A Markdown document with no front-matter block at all.

**Steps**:

1. Parse the document and call `resolveDocumentConfig(base, frontmatter)`
  with the (empty/absent) front-matter.
2. Assert no error is thrown and the base config is returned.

**Expected Outcome**:

- Absent front-matter is tolerated (RSK-5).

#### TC-DOC-006 - Unrelated (non-`marksync`) front-matter keys are ignored

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-4, AC-F4-1, AC-4, RSK-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A front-matter block with keys like `title:`, `tags:`, `draft:` (not under
  the `marksync.*` namespace).

**Steps**:

1. Call `resolveDocumentConfig(base, frontmatter)`.
2. Assert non-`marksync` keys do not affect the merged config and cause no
  error.

**Expected Outcome**:

- Only `marksync.*` overrides are applied; unrelated keys are ignored (RSK-5).

#### TC-DOC-007 - Malformed fences (missing closing `---`) are tolerated/handled

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, AC-F4-1, AC-4, RSK-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A document whose opening `---` fence has no matching closing fence (and
  variants with content that is not valid YAML inside the fence).

**Steps**:

1. Parse the front-matter.
2. Assert the parser degrades gracefully — either treating the body as having
  no usable front-matter (base config returned) or surfacing a deterministic,
  non-throwing outcome per the documented contract.

**Expected Outcome**:

- Malformed fences do not crash the pipeline (RSK-5); behaviour matches the
   documented contract.

#### TC-DOC-008 - CRLF line endings are handled

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-4, AC-F4-1, AC-4, RSK-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A document whose front-matter uses CRLF (`\r\n`) line endings.

**Steps**:

1. Parse the front-matter and call `resolveDocumentConfig`.
2. Assert the `marksync.*` overrides are correctly extracted (no corruption
  from line-ending differences).

**Expected Outcome**:

- CRLF documents parse correctly (RSK-5).

#### TC-DOC-009 - No overrides → `resolveDocumentConfig` returns base unchanged

**Scenario Type**: Corner Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-4, AC-F4-1, AC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/document-config.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A front-matter block that is present but contains no `marksync.*` keys.

**Steps**:

1. Call `resolveDocumentConfig(base, frontmatter)`.
2. Assert the result is structurally equal to `base`.

**Expected Outcome**:

- Identity merge: no overrides ⇒ no changes.

#### TC-HIER-001 - `mirror`: `docs/a/b.md` under `root: docs/` → parent `docs/a/`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F6-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/hierarchy.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `root: docs/`, `hierarchy: mirror`, selected file `docs/a/b.md`.

**Steps**:

1. Compute the intended hierarchy for the selected file.
2. Assert the intended parent path is `docs/a/`.

**Expected Outcome**:

- Mirror mode derives the parent directory as the intended Confluence parent
   (AC-F6-1). Resolution to a real page ID is out of scope (NG-2).

#### TC-HIER-002 - `mirror`: deeper nesting `docs/a/b/c.md` → parent `docs/a/b/`

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, AC-F6-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/hierarchy.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `root: docs/`, `hierarchy: mirror`, selected file `docs/a/b/c.md`.

**Steps**:

1. Compute the intended hierarchy.
2. Assert the intended parent path is `docs/a/b/`.

**Expected Outcome**:

- Deeper nesting mirrors correctly.

#### TC-HIER-003 - `mirror`: file directly under root → parent is the configured/root parent

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, AC-F6-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/hierarchy.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `root: docs/`, `hierarchy: mirror`, selected file `docs/index.md` (directly
  under root).

**Steps**:

1. Compute the intended hierarchy.
2. Assert the intended parent is the configured target parent (e.g.
   `targets.<id>.parentPageId` / root-level parent) — not `docs/` itself.

**Expected Outcome**:

- Root-level files attach to the configured parent, not a self-referential
   path.

#### TC-HIER-004 - `flat`: all selected pages intended under the single configured parent

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-6, AC-F6-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/hierarchy.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- `hierarchy: flat`, a set of selected files at varying depths.

**Steps**:

1. Compute the intended hierarchy for each file.
2. Assert every file's intended parent is the single configured parent,
   regardless of its directory depth.

**Expected Outcome**:

- Flat mode ignores directory structure; all pages target one parent.

#### TC-HIER-005 - Path normalization (trailing slash / `.` segments)

**Scenario Type**: Edge Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-6, AC-F6-1, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/hierarchy.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- Inputs with trailing slashes, redundant `./` or `.` segments, and mixed
  separators.

**Steps**:

1. Compute the intended hierarchy for normalized vs non-normalized inputs.
2. Assert the parent paths are canonical (no double slashes, no dangling `.`).

**Expected Outcome**:

- Path normalization yields canonical intended-parent paths.

#### TC-INIT-001 - `init` writes a starter `marksync.yml` that round-trips via `loadConfig`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, F-8, AC-F5-1, AC-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config-template.test.ts` (tests the config-writing helper directly, NOT the CLI command — per testing-strategy anti-pattern)
**Tags**: @backend, @api

**Preconditions**:

- A temporary empty directory.

**Steps**:

1. Invoke the starter-config writer (the helper the `init` command uses).
2. Assert a `marksync.yml` was written.
3. Invoke `loadConfig(dir)` on the written file.
4. Assert `Result.ok(ProjectConfig)` — the starter config is itself valid.

**Expected Outcome**:

- Round-trip succeeds (AC-F5-1): the `init` output is a valid v1 config.

#### TC-INIT-002 - Committed `marksync.yml.example` loads without error

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-8, AC-F5-1, AC-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config-template.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- The committed `marksync.yml.example` (F-8) exists at the repo root.

**Steps**:

1. Load the committed `marksync.yml.example` via `loadConfig`.
2. Assert `Result.ok(ProjectConfig)`.

**Expected Outcome**:

- The on-ramp example is valid and round-trips.

#### TC-INIT-003 - `init` overwrite-guard behaviour

**Scenario Type**: Negative
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-5, AC-F5-1, AC-6
**Test Type(s)**: Unit
**Automation Level**: Semi-automated
**Target Layer / Location**: `tests/unit/app/config-template.test.ts`
**Tags**: @backend, @api

**Preconditions**:

- A directory that already contains a `marksync.yml`.

**Steps**:

1. Invoke the starter-config writer against the pre-populated directory.
2. Assert the documented behaviour (refuse-to-overwrite vs overwrite-with-
   warning) is enforced.

**Expected Outcome**:

- The behaviour matches the documented contract.

**Notes / Clarifications**:

- TODO: the spec does not specify the overwrite policy for MS-0002 `init`.
  See OQ-TP-1; this scenario is finalised once the policy is decided at
  delivery.

## 6. Environments and Test Data

- **Environment:** local-dev (`bun:test` in-process). No Confluence sandbox, no
  Git fixture repo, no network. All tests are deterministic and hermetic.
- **Runner:** `bun:test` (TDR-0004). Test root `tests/` per `bunfig.toml`.
- **Fixtures (inline strings or files under `tests/unit/app/fixtures/`):**
  - `valid-full.yml` — every blueprint §4 field populated (TC-CONFIG-001).
  - `valid-minimal.yml` — required fields only (TC-CONFIG-002).
  - `invalid-missing-required.yml` (parametrized per required field) (TC-CONFIG-003).
  - `invalid-wrong-type-*.yml` (parametrized per field) (TC-CONFIG-004).
  - `invalid-granularity-unknown.yml` (TC-CONFIG-005).
  - `invalid-granularity-commit-by-commit.yml` (TC-CONFIG-006).
  - `invalid-multiple.yml` (TC-CONFIG-009).
  - `invalid-malformed-yaml.yml` (TC-CONFIG-010).
  - `file-lists/mixed.txt` — realistic path list for `selectFiles` (TC-SELECT-003).
- **Inline fixtures** for front-matter scenarios (Markdown strings) — kept inline
  since they are short.
- **Isolation:** each `loadConfig` test points `cwd` at a per-test temp dir (or
  an in-memory equivalent) so fixtures do not bleed; `init` tests write to a
  temp dir and clean up. No shared mutable state.
- **NFR-7 dependency audit (manual / CI gate):** at delivery, confirm `yaml` and
  `ajv` are runtime deps on the allowed list; `yaml` transitive-dependency count
  ≤ 20; `bun run license-audit` rejects GPL/AGPL/LGPL/UNLICENSED. This is the
  GH-14 CI license-audit gate, not a unit test.

## 7. Automation Plan and Implementation Mapping

| TC ID(s) | Test file | Status | Mocking | Command |
|----------|-----------|--------|---------|---------|
| TC-CONFIG-001..011, TC-CONFIG-013 | `tests/unit/app/config.test.ts` | To Implement | None (real `yaml` + `ajv`) | `bun test tests/unit/app/config.test.ts` |
| TC-CONFIG-007 | `tests/unit/domain/errors.test.ts` | To Implement | None | `bun test tests/unit/domain/errors.test.ts` |
| TC-CONFIG-012 | (type-level) `src/domain/errors.ts` | Existing – Update | None | `bun run typecheck` |
| TC-SELECT-001..008 | `tests/unit/app/select-files.test.ts` | To Implement | FS-spy only in TC-SELECT-008 (prove no I/O) | `bun test tests/unit/app/select-files.test.ts` |
| TC-DOC-001..009 | `tests/unit/app/document-config.test.ts` | To Implement | None (real `yaml` on fenced blocks) | `bun test tests/unit/app/document-config.test.ts` |
| TC-HIER-001..005 | `tests/unit/domain/config/hierarchy.test.ts` | To Implement | None | `bun test tests/unit/domain/config/hierarchy.test.ts` |
| TC-INIT-001..003 | `tests/unit/app/config-template.test.ts` | To Implement | None | `bun test tests/unit/app/config-template.test.ts` |
| AC-7 (gate) | all of the above + `errors.ts` | — | — | `bun run check` (lint + typecheck + test + boundaries) |

**Execution / ordering notes:**

- All Unit tests run in the fast CI loop (`bun test tests/unit/`).
- TC-CONFIG-012 (exhaustive-union compile safety) is enforced by
  `bun run typecheck`, which is part of `bun run check` (AC-7 / NFR-6).
- `F-7` (the `InvalidConfig` union arm + `assertNeverMarkSyncError` update) and
  `F-3` (the loader) should be implemented together so the typed error channel
  is consistent from the first commit (spec §18 rollout note).
- No mocks except the FS-spy in TC-SELECT-008 (used to *prove absence* of I/O,
  not to fake domain behaviour) — per the over-mocking guardrail.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| TR-1 | ajv error formatting produces opaque messages (raw `instancePath`/`keyword`) instead of AI-readable text | M | Custom formatter unit-tested per invalid class (TC-CONFIG-008); assert path + expected + fix present (NFR-2). Mirrors spec RSK-1. |
| TR-2 | The union and `assertNeverMarkSyncError` drift if updated separately | M | TC-CONFIG-012 (`bun run typecheck` gate) fails to compile if either is missed (NFR-3). Mirrors spec RSK-2. |
| TR-3 | TS types drift from the JSON Schema (two sources) | M | Joint unit tests exercise both (TC-CONFIG-001..006 run real ajv against the same shape the TS types describe). Mirrors spec RSK-3. |
| TR-4 | `selectFiles` glob semantics diverge from Git expectations (`**`, anchoring) | M | TC-SELECT-001..005 cover nesting + anchoring; chosen semantics documented (resolves spec OQ-2). Mirrors spec RSK-6. |
| TR-5 | Front-matter parser mishandles edge cases (absent/malformed fences, CRLF, unrelated keys) | L | TC-DOC-005..008 cover each edge. Mirrors spec RSK-5. |
| TR-6 | Latency threshold (≤ 50 ms p95) is noisy on shared CI runners | L | TC-CONFIG-013 is informational; record the policy (hard-fail vs record) — OQ-TP-3. |

### 8.2 Assumptions

- GH-14 (MS2-E2-S1) is merged and provides `Result<T,E>`, the 12-kind
  `MarkSyncError` union + `assertNeverMarkSyncError`, the strict TS+Bun
  toolchain, and binding CI — all reusable unchanged.
- `yaml` (npm, ESM) and `ajv` are the chosen runtime deps (DEC-1; both on the
  allowed list) and are NOT mocked in any scenario.
- `stalePlanMinutes` default is 15 (consumed downstream by E3-S2/E3-S7).
- `granularity` accepts only `squash` for MS-0002; `commit-by-commit` is
  rejected with a "deferred" message (DEC-2 / ADR-0010 C-5).
- The loader is pure w.r.t. the repo tree: `selectFiles` accepts a caller-
  supplied `string[]` (DEC-4).
- Blueprint §4 is the authoritative schema field set; this plan does not
  require new fields beyond it.

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | What is the `init` overwrite policy when a `marksync.yml` already exists (refuse / warn / force)? | No (TC-INIT-003 marked TODO) | @coder (delivery) | Spec NG-5 defers full init DX to MS-0003; MS-0002 policy unspecified. Decide at delivery; update TC-INIT-003. |
| OQ-TP-2 | Does a *missing* `marksync.yml` surface as `ConfigError` (via the narrowed `Result`) or as a distinct non-error path? | No (TC-CONFIG-011 documents either) | @coder (delivery) | Spec DEC-3 narrows the error to `ConfigError` but does not define missing-file semantics. Resolve at delivery; align TC-CONFIG-011. |
| OQ-TP-3 | Is the NFR-1 latency threshold (≤ 50 ms p95) a hard CI failure or an informational record? | No | @coder (delivery) | Shared-runner noise may cause flakes; record the policy for TC-CONFIG-013. |
| OQ-TP-4 (mirrors spec OQ-2) | Exact glob anchoring semantics for `select`/`exclude` relative to `root` (leading-slash anchored vs glob-relative)? | No | @coder (delivery) | Resolved at delivery by documenting the chosen semantics; covered by TC-SELECT-005. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07T04:05:31Z | test-plan-writer (GH-15) | Initial test plan — 38 unit-tier scenarios (TC-CONFIG, TC-SELECT, TC-DOC, TC-HIER, TC-INIT) traced to AC-1..AC-7 / AC-F3-1..AC-F8-1, F-1..F-8, DM-1..DM-3, NFR-1..NFR-7. Derived from chg-GH-15-spec.md, story MS2-E2-S2, `.ai/rules/testing-strategy.md`, `.ai/rules/typescript.md`, ADR-0010 C-5, and the existing `Result`/`MarkSyncError` primitives. |
| 1.1 | 2026-07-07T04:21:55Z | test-plan-writer (GH-15, DoR iter-2) | Cross-artifact consistency fix addressing DoR iter-1 findings. **Finding 1 (BLOCKING — hierarchy tier/placement):** corrected all hierarchy module references from the application tier (`src/app/hierarchy.ts`, `tests/unit/app/hierarchy.test.ts`) to the domain tier (`src/domain/config/hierarchy.ts`, `tests/unit/domain/config/hierarchy.test.ts`) per `chg-GH-15-plan.md` Phase 7 and `architecture-overview.md` (Hierarchy Planner = domain). Touched: §4 layout row + prose note, TC-HIER-001..005 Target Layer, §7 automation table (file + command). **Finding 2 (init helper filename drift):** renamed `init-config` → `config-template` throughout (§4 layout row, TC-INIT-001..003 Target Layer, §7 automation table). No scenario IDs, coverage, or AC mapping changed. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(populated during delivery — phase 6 / quality_gates)_ | | | |
