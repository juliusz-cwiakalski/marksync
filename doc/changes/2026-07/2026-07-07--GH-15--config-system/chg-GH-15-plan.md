---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-15-config-system
status: Updated
created: 2026-07-07T04:04:09Z
last_updated: 2026-07-07T04:23:40Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical]
links:
  change_spec: ./chg-GH-15-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S2--config-system.md
  typescript_rules: ../../../.ai/rules/typescript.md
  architecture: ../../../overview/architecture-overview.md
  adr_0010_granularity: ../../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md
summary: >
  Establish the repository-owned `marksync.yml` config system for MS-0002: a v1
  JSON Schema (blueprint §4 field set), mirrored TypeScript types, a pure typed
  loader `loadConfig(cwd)` with ajv `allErrors` validation and AI-readable
  `ConfigError` diagnostics, pure file selection (`selectFiles`), intended
  hierarchy mirroring, per-document front-matter overrides, and a minimal
  `marksync init` skeleton — extending the exhaustive `MarkSyncError` union with
  the `InvalidConfig` kind (union + `assertNeverMarkSyncError` updated together).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-15: [MS2-E2-S2] Config system

## Context and Goals

This plan delivers the **config backbone of MS-0002** (epic MS2-E2 — Foundation,
second story). It is the contract every use-case — `push`, `init`, `plan`,
`sync`, `doctor` — will consume. Concretely it establishes:

- the **v1 JSON Schema** for `marksync.yml` as the single source of truth for the
  config shape (blueprint §4 field set; required vs optional inline);
- the **mirrored TypeScript types** (`ProjectConfig`, `TargetConfig`,
  `RenderConfig`, `SyncConfig`, `OutputConfig`) — compile-time typing alongside
  ajv's runtime validation;
- a **pure, typed loader** `loadConfig(cwd): Result<ProjectConfig, ConfigError>`
  (read → YAML parse → ajv `allErrors` → `applyDefaults`) plus pure file
  selection `selectFiles(config, paths[]): string[]` — no Git/working-tree I/O;
- **per-document front-matter overrides** (`marksync.uuid|title|parent|exclude`)
  via `resolveDocumentConfig(base, frontmatter)`;
- **intended hierarchy mirroring** (page-tree shape from selected files under
  `root`; structure only — no Confluence page-ID resolution);
- the **`ConfigError` failure kind** (`InvalidConfig`) added to the exhaustive
  `MarkSyncError` union **and** `assertNeverMarkSyncError`, with a custom ajv
  error formatter producing AI-readable `humanMessage`;
- a minimal **`marksync init`** config-scaffolding stub and a committed
  **`marksync.yml.example`** on-ramp reference.

The plan is derived entirely from `chg-GH-15-spec.md` (capabilities F-1..F-8,
ACs AC-F3-1..AC-F8-1, NFRs NFR-1..NFR-7) and the authoritative story file
`MS2-E2-S2--config-system.md` (8 deliverables). It invents no requirements.

### Binding decisions (DEC-1..DEC-4 from spec §15 constrain the plan; DEC-5 is a plan-level commitment)

- **DEC-1** — use the `yaml` npm package (ESM) for **both** `marksync.yml` and
  front-matter parsing (single dependency, fewer transitive deps than `js-yaml`).
- **DEC-2** — `sync.granularity` accepts **only** `squash`; reject
  `commit-by-commit` with an explicit "deferred to a future milestone" error
  (ADR-0010 **C-5**).
- **DEC-3** — `ConfigError` is the `InvalidConfig` arm of `MarkSyncError`;
  `loadConfig` returns the narrowed `Result<ProjectConfig, ConfigError>`; the
  union **and** `assertNeverMarkSyncError` are updated together.
- **DEC-4** — the loader is pure w.r.t. the repo tree: `selectFiles` takes a
  caller-supplied `string[]`; no Git I/O inside the loader.
- **DEC-5** *(plan-level commitment — resolves DoR iter-1 Finding 3)* —
  `selectFiles` glob matching uses a **zero-dependency hand-rolled matcher** at
  `src/shared/glob.ts` with standard micromatch-style semantics (`**` recursive,
  `*` single segment, `?`, nested directories). **No** `picomatch` (or any other
  third-party glob library) is added as a dependency. This deliberately preserves
  the spec's NFR-7 runtime-dependency envelope (`yaml` + `ajv` only — both
  pre-approved on `typescript.md`'s allowed-dependency list), so **no
  allowed-dependency list extension and no TDR are required**. `src/shared/`
  remains a pure utility namespace (string/path logic only; imports no tier).

### Critical ordering constraint

Per spec §18 and NFR-3, the `InvalidConfig` union/`never`-check extension
(deliverable 7) **must land before (or alongside)** the loader (deliverable 3).
We never merge a loader that throws while the union update is pending — Phase 2
precedes Phase 4.

### Open questions

- **Glob anchoring semantics for `selectFiles` (spec OQ-2).** The matcher
  library is **committed** — see DEC-5: a zero-dependency hand-rolled matcher at
  `src/shared/glob.ts` (micromatch-style `**` / nested-dir semantics); `picomatch`
  is **not** added, preserving the NFR-7 `yaml` + `ajv` envelope. The remaining
  delivery-time detail is the exact **anchoring** behavior relative to `root`
  (leading-slash anchored vs glob-relative) — this must be documented in a
  comment and unit-tested at the `selectFiles` definition site (Phase 5).
  *(Specification detail — no `@decision-advisor` escalation unless it surfaces a
  contract conflict.)*
- **`marksync init` as a live command.** `src/cli/index.ts` is a trivial
  `console.log("marksync 0.0.0")` stub; there is no CLI bootstrap / `bin` entry
  yet (Cliffy is pinned post smoke-test per TDR-0002, not installed). Phase 8
  therefore delivers the init **capability** (starter template + write helper +
  command module) verified by a round-trip test on the helper; wiring into a real
  `marksync` binary happens when the CLI shell lands. This matches the story's
  "minimal command stub" framing (full init DX is MS-0003).

## Scope

### In Scope

- **F-1** — `src/domain/config/schema.json`: JSON Schema v1 for `marksync.yml`
  (blueprint §4 field set): `version`, `root`, `select[]`, `exclude[]`,
  `hierarchy` (`mirror`|`flat`), `targets.<id>.{type,spaceKey,parentPageId}`,
  `sync.{allowBranches[],granularity,stalePlanMinutes}` (default **15**),
  `render.mermaid.{policy,securityLevel,htmlLabels,deterministicIds}`,
  `output.{format,color}`, `provenance.visiblePanel`. `granularity` enum accepts
  **only** `squash` (ADR-0010 C-5 / DEC-2). Required vs optional inline.
- **F-2** — `src/domain/config/types.ts`: mirrored TS types `ProjectConfig`,
  `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`.
- **F-3** — `src/app/config.ts`: `loadConfig(cwd)`, `applyDefaults()`,
  `selectFiles(config, paths[])`. Pure (no Git I/O).
- **F-4** — front-matter parser (`marksync.uuid|title|parent|exclude`) +
  `resolveDocumentConfig(base, frontmatter)`.
- **F-5** — `marksync init` skeleton: starter `marksync.yml` template + write
  helper + command stub (round-trips through `loadConfig`).
- **F-6** — intended hierarchy mirroring (parent-path computation under `root`).
- **F-7** — `ConfigError` (`InvalidConfig` kind) in `MarkSyncError` **and**
  `assertNeverMarkSyncError`; custom ajv error formatter → AI-readable
  `humanMessage`.
- **F-8** — committed `marksync.yml.example` + `.env.example` reference updates.

### Out of Scope

- The Git adapter / reading the committed tree (E3-S3 supplies the path list).
- Resolving real Confluence parent-page IDs (E3-S4 / E3-S6).
- `granularity: commit-by-commit` (ADR-0010 C-5 — deferred).
- Migration of existing Confluence corpora and an interactive init wizard (MS-0003).
- Full `init` DX (discovery, UUID assignment — UUIDs are E3-S1).
- Schema→TS code generation (hand-mirror for v1; deferred per spec OQ-1).
- Lock-file schema (separate story).
- CLI output rendering of `ConfigError` (owned by the output layer, ADR-0011).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, `architecture-overview.md`,
  enforced by `.dependency-cruiser.cjs`, severity `error`):
  - `src/domain/` may import **nothing** tiered (no `app`, no `cli`, no `infra`);
    defines ports/types only.
  - `src/app/` may import `domain` (+ infra via ports); not `cli`.
  - `src/cli/` may import `app` only — **NOT** `domain` and **NOT** `infra`
    (`presentation-may-not-import-domain` / `-infra`).
  - `src/shared/` holds pure utilities with zero tier dependencies.
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitAny`):
  type-only imports use `import type`; `array[i]` is `T | undefined`; optional
  props reject `undefined`.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`,
  `#app/*`, `#infra/*`, `#shared/*`) — no tsconfig `paths`.
- **IO-boundary rule**: user-authored config/lock schemas use **ajv** (not zod).
- **Quality gate**: `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0.
- **Conventional Commits** (commitlint + husky); each phase = one logical commit.
- **Loader purity (NFR-4)**: the only I/O inside the loader is reading the
  `marksync.yml` file; `selectFiles` does zero Git/tree I/O.
- **Version**: pre-release `0.0.0`; final phase applies the `version_impact:
  minor` bump per repo convention.

### Risks

- **RSK-1** — ajv errors render opaquely. Mitigated by a custom formatter
  (Phase 4) mapping `instancePath` + `keyword` → field path + expected vs got +
  suggested fix; unit-tested per invalid case (NFR-2).
- **RSK-2** — union / `never`-check drift. Mitigated by updating **both** in one
  change (Phase 2) so the `never`-check makes omission a compile error (NFR-3).
- **RSK-3** — TS types drift from the JSON Schema (two sources). Mitigated by
  joint valid/invalid unit tests exercising ajv and TS together (Phases 3 & 4);
  code-gen deferred (spec OQ-1).
- **RSK-4** — `yaml`/`ajv` carry > 20 transitive deps or a non-MIT license.
  Mitigated by the Phase 1 license/transitive audit (NFR-7).
- **RSK-5** — front-matter edge cases (no fences, malformed fences, unrelated
  keys, CRLF). Mitigated by tolerating absent front-matter and unit-testing edge
  cases (Phase 6).
- **RSK-6** — `selectFiles` glob semantics diverge from Git expectations.
  Mitigated by the committed zero-dependency hand-roll at `src/shared/glob.ts`
  (DEC-5, Phase 1) with documented anchoring + fixture-based unit tests
  (Phase 5).

### Success Metrics

- A well-formed `marksync.yml` loads to a fully-typed `ProjectConfig` with
  defaults applied (e.g. `stalePlanMinutes` = 15) — AC-F3-1.
- Every invalid case (missing required, wrong type, unknown `granularity`)
  yields a `ConfigError` naming field path + expected shape + suggested fix —
  AC-F7-1, NFR-2.
- `selectFiles` includes `select` and excludes `exclude` globs with zero
  misclassifications across fixtures — AC-F3-2.
- `marksync.title: "X"` overrides the derived title; `marksync.exclude: true`
  drops the doc — AC-F4-1/AC-F4-2.
- `docs/a/b.md` under `root: docs/` with `hierarchy: mirror` → intended parent
  `docs/a/` — AC-F6-1.
- `marksync init` writes a starter config that round-trips through `loadConfig`
  — AC-F5-1.
- `bun run typecheck` exits 0 with the extended union (NFR-3); `bun run check`
  exits 0 (NFR-6) — AC-F7-2 / AC-F8-1.

## Phases

> Each phase is one logical Conventional Commit and is independently verifiable
> by the listed command(s). Files are listed as `path (new | updated)`. Tier
> placements respect the dependency-direction matrix (see Constraints).

---

### Phase 1: Runtime dependencies & scaffolding

**Goal**: Add the two runtime dependencies (`yaml`, `ajv`) this story requires,
land the committed zero-dependency glob matcher at `src/shared/glob.ts` (DEC-5 —
no third-party glob library), and prove dependency hygiene (license +
transitive-dep thresholds + unchanged tier boundaries) before any config code
lands.

**Tasks**:

- [x] **1.1** Add `yaml` (ESM) and `ajv` to `package.json` `dependencies` (both
      are on the allowed-dependency list in `typescript.md`); pin with `^` and
      commit the updated lockfile (`bun install`). — yaml@2.9.0 (ISC), ajv@8.20.0 (MIT).
- [x] **1.2** Implement the **committed zero-dependency glob matcher** at
      `src/shared/glob.ts` (DEC-5 — resolves DoR iter-1 Finding 3 / RSK-6 /
      spec OQ-2 matcher-library sub-question). Standard micromatch-style
      semantics: `**` (recursive across directory levels), `*` (single path
      segment), `?` (single char), nested-directory patterns. **No** `picomatch`
      (or any third glob library) is added — this preserves the spec's NFR-7
      runtime-dep envelope (`yaml` + `ajv` only) and requires **no**
      allowed-dependency list extension or TDR. `src/shared/` stays a pure
      utility (string/path logic; imports no tier). The genuinely-remaining open
      detail — anchoring semantics relative to `root` (spec OQ-2) — is documented
      and unit-tested at the `selectFiles` site in Phase 5. — `src/shared/glob.ts` + `tests/unit/shared/glob.test.ts` (14 tests, 100% cov).
- [x] **1.3** Verify transitive-dependency thresholds (`yaml` ≤ 20; `ajv`
      likewise; the glob matcher is zero-dependency so no threshold applies) via
      `bunx license-checker --summary` (or `bunx npm ls <pkg>`). Record the
      counts in the commit body. — yaml: 0 transitive deps; ajv: 4 deps (fast-deep-equal, fast-uri, json-schema-traverse, require-from-string), all zero-dep themselves.
- [x] **1.4** Verify license hygiene — reject GPL/AGPL/LGPL/UNLICENSED
      (NFR-SEC-4); MIT/ISC/Apache-2.0/BSD are acceptable. — yaml=ISC, ajv=MIT, fast-deep-equal=MIT, fast-uri=BSD-3-Clause, json-schema-traverse=MIT, require-from-string=MIT. All permissive.
- [x] **1.5** Confirm the quality gate baseline still passes after the dep
      additions: `bun run typecheck`, `bun run check:boundaries`,
      `bun run format:check`. — all PASS.

**Acceptance Criteria**:

- Must: `yaml` and `ajv` resolvable at runtime; `bun install` clean.
- Must: no dependency exceeds the transitive-dep threshold; no forbidden license.
- Must: **no** third-party glob dependency introduced — matcher is the
      zero-dependency `src/shared/glob.ts` (DEC-5); NFR-7 `yaml` + `ajv`
      envelope unchanged.
- Must: `bun run check:boundaries` exits 0 (no new tier violation from imports).
- Should: `src/shared/glob.ts` ships with `**` / `*` / nested-dir semantics
      unit-tested (unblocks Phase 5).

**Files and modules**:

- Code areas: `package.json` (updated), `bun.lock` (updated),
  `src/shared/glob.ts` (new — DEC-5 zero-dependency matcher).
- System docs: none.

**Tests**:

- `bun test tests/unit/shared/glob.test.ts` — matcher semantics (`**`, `*`, `?`,
  nested dirs).
- `bun run typecheck` — no type errors introduced.
- `bun run check:boundaries` — `depcruise src` clean.
- Manual license/transitive audit (scripted via `bunx license-checker`).

**Completion signal**: `feat(config): add yaml and ajv runtime dependencies`

---

### Phase 2: Extend MarkSyncError with the InvalidConfig kind (ConfigError)

**Goal**: Add the `InvalidConfig` failure kind to the exhaustive
`MarkSyncError` union **and** the `assertNeverMarkSyncError` `never`-switch in
one change, define the narrowed `ConfigError` type alias, and define a
domain-owned `ConfigAjvError` plain-data shape — without making the domain tier
import `ajv`. This lands **before** the loader so the typed error channel is
consistent from the first loader commit (DEC-3, NFR-3, RSK-2).

**Tasks**:

- [x] **2.1** In `src/domain/errors.ts`, add a domain-owned plain-data type for
      the ajv-error entry carried by config failures (e.g. `ConfigAjvError`:
      `instancePath`, `schemaPath`, `keyword`, `message`, `params` as a
      serializable record) — **no** `import` from `ajv` (keeps domain pure; the
      app-tier formatter maps ajv `ErrorObject` → this shape in Phase 4).
- [x] **2.2** Add the `InvalidConfig` arm to the `MarkSyncError` union:
      `{ kind: "InvalidConfig"; path: string; ajvErrors: ConfigAjvError[];
      humanMessage: string }` (DEC-3 / DM-3).
- [x] **2.3** Extend `assertNeverMarkSyncError`'s switch with a `case
      "InvalidConfig":` so the `default` arm's `error` stays `never` (NFR-3;
      update the file's DEC/AC comment references to reflect the new kind
      count).
- [x] **2.4** Export a narrowed `ConfigError` alias from `src/domain/errors.ts`
      (`Extract<MarkSyncError, { kind: "InvalidConfig" }>`) so `loadConfig` can
      declare `Result<ProjectConfig, ConfigError>` (DEC-3).
- [x] **2.5** Create or extend `tests/unit/domain/errors.test.ts` asserting the
      union is exhaustive (a `default: assertNeverMarkSyncError(error)` over a
      typed `MarkSyncError` compiles) and that an `InvalidConfig` value is a
      valid `MarkSyncError` / `ConfigError`. — 5 tests PASS; `result.test.ts` updated to 13-kind sample (4 PASS).

**Acceptance Criteria**:

- Must: `bun run typecheck` exits 0 — the `never`-check is intact (AC-F7-2,
      NFR-3).
- Must: domain imports no third-party validator (`bun run check:boundaries`
      clean; no `ajv` import in `src/domain/`).
- Must: existing `tests/unit/domain/result.test.ts` still passes.

**Files and modules**:

- Code areas: `src/domain/errors.ts` (updated); `tests/unit/domain/errors.test.ts`
  (new or extended).
- System docs: none (the union doc lives in `typescript.md` §"Error handling" —
  its 12-kind illustration may optionally be refreshed in the final phase).

**Tests**:

- `bun test tests/unit/domain/errors.test.ts`
- `bun run typecheck` (this is the load-bearing check — NFR-3).
- `bun run check:boundaries`.

**Completion signal**: `feat(errors): add InvalidConfig kind to MarkSyncError`

---

### Phase 3: marksync.yml v1 JSON Schema + mirrored TypeScript types

**Goal**: Author the JSON Schema that is the user-facing config contract and the
mirrored TS types that give compile-time checking on top of ajv's runtime
validation (F-1, F-2, RSK-3 mitigation part 1).

**Tasks**:

- [x] **3.1** Create `src/domain/config/schema.json` — JSON Schema v1
      enumerating the blueprint §4 field set with required vs optional clearly
      distinguished: top-level `version`, `root`; `select[]`/`exclude[]` glob
      lists; `hierarchy` enum `{mirror, flat}`; `targets` map keyed by target id,
      each `{type, spaceKey, parentPageId}`; `sync.{allowBranches[],
      granularity, stalePlanMinutes}` where `granularity` enum is **only**
      `["squash"]` (DEC-2 / ADR-0010 C-5) and `stalePlanMinutes` default `15`;
      `render.mermaid.{policy, securityLevel, htmlLabels, deterministicIds}`;
      `output.{format, color}`; `provenance.visiblePanel`. Set `$schema`,
      `additionalProperties: false` where appropriate, and `errorMessage`
      annotations where ajv's keyword text is opaque. — draft-07, `additionalProperties:false` on root + each object; `granularity` enum `[squash]` only; `version` const 1. `errorMessage` keywords omitted (require ajv-errors plugin → would breach NFR-7 envelope); AI-readable messages handled by the app-tier formatter (Phase 4).
- [x] **3.2** Create `src/domain/config/types.ts` — mirror the schema as TS
      types: `ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`,
      `OutputConfig` (+ the `hierarchy` and `granularity` literal unions). Use
      `exactOptionalPropertyTypes`-safe optionals; export the
      `SyncGranularity = "squash"` literal type (single-member for MS-0002). — incl. `ProjectConfigInput` (raw pre-defaults shape) for the `applyDefaults` boundary.
- [x] **3.3** Delete `src/domain/config/.gitkeep` (real content now populates the
      folder).
- [x] **3.4** Create `tests/unit/domain/config/schema.test.ts` — compile the
      schema with ajv and assert: (a) a representative valid fixture passes; (b)
      each invalid fixture fails — missing required field, wrong type, unknown
      `granularity` (e.g. `commit-by-commit`), unknown `hierarchy`, bad target
      shape. This exercises schema validity independently of the loader. — 16 tests PASS (valid full/minimal, every invalid class incl. commit-by-commit, additionalProperties, allErrors aggregation).

**Acceptance Criteria**:

- Must: schema rejects `granularity: "commit-by-commit"` and any non-`squash`
      value (DEC-2 / NFR-5).
- Must: schema accepts a full valid fixture and rejects each documented invalid
      case.
- Must: TS types compile under strict mode and align with the schema shape.
- Should: schema includes ajv `errorMessage` hints for the opaque keywords.

**Files and modules**:

- Code areas: `src/domain/config/schema.json` (new),
  `src/domain/config/types.ts` (new); `src/domain/config/.gitkeep` (removed).
- System docs: none yet (the config contract is reconciled into
  `doc/spec/features/feature-cli.md` in Phase 9).

**Tests**:

- `bun test tests/unit/domain/config/schema.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(config): add marksync.yml v1 schema and types`

---

### Phase 4: Typed pure config loader, defaults, and AI-readable ajv formatter

**Goal**: Deliver the heart of F-3 and F-7 — `loadConfig(cwd)` (read → YAML
parse → ajv `allErrors` → `applyDefaults`) returning
`Result<ProjectConfig, ConfigError>`, plus the custom ajv error formatter that
maps `ErrorObject[]` into the domain `ConfigAjvError[]` + an AI-readable
`humanMessage` (field path + expected vs got + suggested fix). No Git/tree I/O
(DEC-4, NFR-4).

**Tasks**:

- [ ] **4.1** Create `src/app/config-errors.ts` (application tier) — the ajv
      error formatter: maps `ajv.ErrorObject[]` → `ConfigAjvError[]` and builds
      `humanMessage` from `instancePath` + `keyword` + `params`. Cover at minimum:
      missing required field (`required`), wrong type (`type`), unknown enum
      (`enum` — including a dedicated `granularity: commit-by-commit` →
      "deferred to a future milestone (ADR-0010 C-5)" message per DEC-2), and
      `additionalProperties`.
- [ ] **4.2** Create `src/app/config.ts`:
      - `loadConfig(cwd): Result<ProjectConfig, ConfigError>` — read
        `<cwd>/marksync.yml` (only file I/O in the loader), parse with `yaml`,
        ajv-validate (`allErrors: true`), `applyDefaults()`, return
        `Result.ok`/`Result.err` (using `#domain/result` constructors). On
        validation failure, build a `ConfigError` via the Phase 4.1 formatter.
      - `applyDefaults(input): ProjectConfig` — merge schema defaults (notably
        `stalePlanMinutes = 15`) and return a fully-typed `ProjectConfig`.
      - A pure helper to compile/cache the ajv validator (compile once).
- [ ] **4.3** Handle read/parse failures as `ConfigError` (file missing / YAML
      parse error) with an AI-readable `humanMessage` and an empty `ajvErrors[]`,
      keeping the typed `Result` channel (no `throw` for expected cases per
      `typescript.md`).
- [ ] **4.4** Delete `src/app/.gitkeep`.
- [ ] **4.5** Create `tests/unit/app/config.test.ts` — assert:
      - AC-F3-1: a valid `marksync.yml` fixture → `Result.ok(ProjectConfig)` with
        `stalePlanMinutes === 15` and other defaults applied; load latency sanity
        (NFR-1 ≤ 50 ms p95 — asserted loosely via a timing check or left to
        manual measurement).
      - AC-F7-1 / NFR-2: each invalid fixture (missing required, wrong type,
        unknown `granularity` incl. `commit-by-commit`, unknown `hierarchy`)
        → `Result.err(ConfigError)` whose `humanMessage` names field path +
        expected + suggested fix; `commit-by-commit` message mentions
        "deferred".
      - read/parse failure (missing file, malformed YAML) → `Result.err`.
- [ ] **4.6** Create `tests/unit/app/config-errors.test.ts` — assert the
      formatter output for each ajv `keyword` directly (RSK-1 closure).

**Acceptance Criteria**:

- Must: valid config loads with defaults applied (AC-F3-1, NFR-1).
- Must: every invalid case yields a `ConfigError` with an AI-readable
      `humanMessage` (AC-F7-1, NFR-2) — including the `commit-by-commit`
      "deferred" message (DEC-2, NFR-5).
- Must: loader performs **only** `marksync.yml` file I/O (NFR-4) — no Git import.
- Must: app imports domain only; no `src/cli/` import (`check:boundaries` clean).

**Files and modules**:

- Code areas: `src/app/config.ts` (new), `src/app/config-errors.ts` (new);
  `src/app/.gitkeep` (removed).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/config.test.ts`
- `bun test tests/unit/app/config-errors.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(config): add pure typed loader with ajv validation`

---

### Phase 5: Pure file selection (`selectFiles`)

**Goal**: Deliver the selection half of F-3 — `selectFiles(config, paths[]):
string[]` returning the subset matching `select` globs minus `exclude` globs,
given a caller-supplied path list (DEC-4 / NFR-4).

**Tasks**:

- [ ] **5.1** Implement `selectFiles(config, paths)` in `src/app/config.ts`
      importing the zero-dependency matcher from `#shared/glob`
      (`src/shared/glob.ts`, authored in Phase 1 per DEC-5). Document the chosen
      **anchoring** semantics relative to `root` (leading-slash anchored vs
      glob-relative — spec OQ-2, the remaining open detail) in a comment at the
      definition site.
- [ ] **5.2** Ensure determinism: de-duplicate and sort the output so selection
      is stable across runs (consumed downstream by discovery/plan).
- [ ] **5.3** Create `tests/unit/app/select-files.test.ts` — fixture file lists
      covering: include by `select`, exclude by `exclude`, nested dirs, `**`
      recursion, leading-slash anchoring, no matches, empty `select`. Assert
      zero misclassifications (AC-F3-2 / NFR-4 / RSK-6).

**Acceptance Criteria**:

- Must: `selectFiles` returns exactly `select`-matched paths minus
      `exclude`-matched paths (AC-F3-2).
- Must: zero Git/working-tree I/O — accepts `string[]` only (NFR-4).
- Must: deterministic (de-duplicated + ordered) output.
- Should: anchoring semantics documented and tested.

**Files and modules**:

- Code areas: `src/app/config.ts` (updated); consumes `src/shared/glob.ts` via
  `#shared/glob` (authored in Phase 1 — no change to the matcher here).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/select-files.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(config): add pure file selection`

---

### Phase 6: Document front-matter overrides + resolveDocumentConfig

**Goal**: Deliver F-4 — parse Markdown front-matter (`marksync.uuid|title|
parent|exclude`) using the `yaml` dep (DEC-1) and merge per-document overrides
over the base/derived config via `resolveDocumentConfig(base, frontmatter)`.
Absent front-matter is tolerated (RSK-5).

**Tasks**:

- [ ] **6.1** Create `src/app/document-config.ts` (application tier):
      - a gray-matter-style `parseFrontMatter(markdown): Record<string, unknown>`
        that extracts the YAML block between leading `---` fences and parses it
        with `yaml` (reuse DEC-1); returns `{}` when no/invalid front-matter
        (tolerated, not an error — RSK-5).
      - `resolveDocumentConfig(base, frontmatter)` merging `marksync.title`
        (override derived title), `marksync.parent` (override intended parent),
        `marksync.uuid` (carry source-side identity — consumed by E3-S1), and
        `marksync.exclude: true` (flag for selection removal — AC-F4-2).
- [ ] **6.2** Create `tests/unit/app/document-config.test.ts` — assert:
      - AC-F4-1: `marksync.title: "X"` overrides the derived title.
      - AC-F4-2: `marksync.exclude: true` flags the document for removal.
      - `marksync.parent` overrides the intended parent; `marksync.uuid` is
        carried through.
      - Edge cases (RSK-5): no front-matter, malformed fences, unrelated keys,
        CRLF line endings, empty fences — all tolerated.

**Acceptance Criteria**:

- Must: `marksync.title` overrides derived title (AC-F4-1).
- Must: `marksync.exclude: true` removes the doc from selection (AC-F4-2).
- Must: absent/malformed front-matter is tolerated (not an error).
- Must: reuses the `yaml` dep (no second YAML parser — DEC-1).

**Files and modules**:

- Code areas: `src/app/document-config.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/document-config.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(config): add front-matter document overrides`

---

### Phase 7: Intended hierarchy mirroring

**Goal**: Deliver F-6 — compute the **intended** page-tree shape from selected
files under `root`. For `hierarchy: mirror`, `<root>/a/b.md` → intended parent
`<root>/a/`; for `hierarchy: flat`, all selected pages live under the single
configured parent. Structure only — no Confluence page-ID resolution (NG-2).

**Tasks**:

- [ ] **7.1** Create `src/domain/config/hierarchy.ts` (domain tier — pure rule
      over paths + config; imports only `#domain/config/types`):
      - `intendedParent(config, filePath): string` — `mirror`: derive parent
        directory of the file relative to `root`; `flat`: return the configured
        target parent.
      - `buildIntendedHierarchy(config, selectedFiles): IntendedHierarchy`
        mapping each selected file to its intended parent path (the structure
        handed to sync-time resolution in E3-S4/E3-S6).
- [ ] **7.2** Define an `IntendedHierarchy` / `IntendedNode` type (plain data)
      in `src/domain/config/types.ts` or `hierarchy.ts`.
- [ ] **7.3** Create `tests/unit/domain/config/hierarchy.test.ts` — assert
      AC-F6-1 (`docs/a/b.md` under `root: docs/`, `mirror` → parent `docs/a/`),
      plus `flat` mode, nested dirs, files at `root` level, and Windows-style
      separators handling (cross-OS note: MS-0002 targets Linux + Windows).

**Acceptance Criteria**:

- Must: `mirror` mode yields the expected intended parent path (AC-F6-1).
- Must: `flat` mode collapses all pages under the configured parent.
- Must: pure domain module — no app/cli/infra import (`check:boundaries` clean).

**Files and modules**:

- Code areas: `src/domain/config/hierarchy.ts` (new);
  `src/domain/config/types.ts` (updated — add hierarchy result types).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/config/hierarchy.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(config): add intended hierarchy mirroring`

---

### Phase 8: `marksync init` config skeleton

**Goal**: Deliver F-5 — a minimal `marksync init` capability: a starter
`marksync.yml` template + a write helper, exposed via a CLI command module stub.
The starter config must round-trip through `loadConfig` without error
(AC-F5-1). Full init DX (discovery, UUID assignment, interactive prompts) is
MS-0003 (NG-5); UUIDs are E3-S1.

**Tasks**:

- [ ] **8.1** Create `src/app/config-template.ts` (application tier): export the
      starter `marksync.yml` content as a constant and a
      `writeStarterConfig(targetDir): Result<void, ConfigError>` (or a typed
      write result) that writes `marksync.yml` into `targetDir`. The template
      must be a **valid** v1 config (it round-trips through `loadConfig`).
- [ ] **8.2** Create `src/cli/commands/init.ts` (presentation tier): a thin
      command module that calls `writeStarterConfig` via `#app/*`. **Must not**
      import `#domain/*` or `#infra/*` directly (presentation-may-not-import-
      domain/-infra). Wire it to be registerable by the future CLI bootstrap
      (TDR-0002 / Cliffy) — but do not introduce a hard Cliffy dependency here
      if the bootstrap is not yet present (see Open questions).
- [ ] **8.3** Delete `src/cli/commands/.gitkeep` and (if still present)
      `src/cli/output/.gitkeep` only if this phase or a later one populates
      `src/cli/output/`; otherwise leave `output/.gitkeep`.
- [ ] **8.4** Create `tests/unit/app/config-template.test.ts` (and/or
      `tests/unit/cli/commands/init.test.ts`) — assert AC-F5-1: write the
      starter config to a temp dir, run `loadConfig(tempDir)`, expect
      `Result.ok`. Verify the CLI module imports app-only (no domain/infra).

**Acceptance Criteria**:

- Must: the starter config round-trips through `loadConfig` (AC-F5-1).
- Must: `src/cli/commands/init.ts` imports only from `#app/*` — no `#domain/*`,
      no `#infra/*` (`check:boundaries` clean).
- Should: the command module is structured for registration by the future CLI
      bootstrap without rewrite.

**Files and modules**:

- Code areas: `src/app/config-template.ts` (new),
  `src/cli/commands/init.ts` (new); `src/cli/commands/.gitkeep` (removed).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/config-template.test.ts`
- `bun run typecheck`; `bun run check:boundaries` (presentation→app-only import
  is the load-bearing check).

**Completion signal**: `feat(config): add marksync init config skeleton`

---

### Phase 9: On-ramp example, env references, spec reconciliation, and release

**Goal**: Deliver F-8 (`marksync.yml.example` + `.env.example` references),
reconcile the system spec/docs with the implemented config contract, apply the
version bump per `version_impact: minor`, and pass the full quality gate
including a `marksync.yml.example` round-trip through `loadConfig`.

**Tasks**:

- [ ] **9.1** Commit `marksync.yml.example` at the repo root — a realistic,
      valid v1 config demonstrating the major fields (targets, sync with
      `granularity: squash`, render.mermaid, output, provenance). It must
      round-trip through `loadConfig` (asserted in 9.6).
- [ ] **9.2** Update `.env.example` to reference `marksync.yml` where relevant
      (e.g., a comment pointing to `marksync.yml` for `allowBranches` /
      `MARKSYNC_ALLOW_BRANCHES` overlap, and to the config system for
      cache/branch overrides). Keep it variable-name + comment only (no values,
      no secrets — per the file's "DO NOT ADD" rules).
- [ ] **9.3** Spec reconciliation (lifecycle phase 7 — `@doc-syncer` may own;
      listed here per finalize requirements): update
      `doc/spec/features/feature-cli.md` (ConfigLoader → `loadConfig`/
      `ProjectConfig`/`ConfigError` contract), `doc/overview/ubiquitous-language.md`
      and `doc/overview/glossary.md` (add/confirm `ProjectConfig`, `TargetConfig`,
      `ConfigError`, `selectFiles`, hierarchy mirroring, front-matter overrides),
      and optionally refresh the `MarkSyncError` illustration in
      `.ai/rules/typescript.md` to the 13-kind union. Confirm
      `.ai/rules/typescript.md`'s allowed-dependency list requires **no**
      extension and **no TDR** is needed: DEC-5 introduced zero new runtime
      dependencies (glob matching is a hand-rolled `src/shared/` utility), so the
      NFR-7 `yaml` + `ajv` envelope is unchanged. Note any drift for the
      reviewer.
- [ ] **9.4** Apply the version bump per repo conventions for
      `version_impact: minor` (e.g., `package.json` `0.0.0` → `0.1.0`); update
      the `src/cli/index.ts` placeholder version string if the bootstrap
      convention ties them together. Confirm with the maintainer if the 0.x
      minor-vs-patch convention differs.
- [ ] **9.5** Final review sweep: confirm all phase tasks are checked, every AC
      (AC-F3-1..AC-F8-1) has a passing test, and there are no stray
      `<...>` placeholders or TODOs in shipped code.
- [ ] **9.6** Run the full quality gate: `bun run check` (lint + format:check +
      typecheck + test + check:boundaries) — must exit 0 (NFR-6 / AC-F8-1).
      Additionally run a one-off round-trip test asserting
      `loadConfig(<repo-root>)` succeeds against the committed
      `marksync.yml.example` (copy to a temp `marksync.yml` if the example is
      not named `marksync.yml`).

**Acceptance Criteria**:

- Must: `marksync.yml.example` is valid and round-trips through `loadConfig`
      (F-8).
- Must: `.env.example` updated with config-system references (no secrets).
- Must: system docs reconciled with the implemented contract.
- Must: version bumped per `version_impact: minor`.
- Must: `bun run check` exits 0 (AC-F8-1 / NFR-6).

**Files and modules**:

- Code areas: `marksync.yml.example` (new, repo root), `.env.example` (updated),
  `package.json` (version bump), `src/cli/index.ts` (version string, if
  applicable).
- System docs: `doc/spec/features/feature-cli.md` (updated),
  `doc/overview/ubiquitous-language.md` (updated),
  `doc/overview/glossary.md` (updated), `.ai/rules/typescript.md` (optional
  illustration refresh).

**Tests**:

- `bun run check` (the full gate).
- Round-trip: `loadConfig` over `marksync.yml.example` → `Result.ok`.

**Completion signal**: `feat(config): add marksync.yml.example and finalize`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TS-1 | Valid `marksync.yml` loads → `Result.ok(ProjectConfig)` with `stalePlanMinutes === 15` | 3, 4 | AC-F3-1 |
| TS-2 | Missing required field → `Result.err(ConfigError)`; `humanMessage` names field + expected + fix | 3, 4 | AC-F7-1 |
| TS-3 | Wrong type → `Result.err(ConfigError)` with type keyword explained | 3, 4 | AC-F7-1 |
| TS-4 | `granularity: commit-by-commit` → schema reject + `humanMessage` says "deferred" (ADR-0010 C-5) | 3, 4 | AC-F7-1, NFR-5 |
| TS-5 | `selectFiles` includes `select` globs and excludes `exclude` globs across fixtures | 5 | AC-F3-2 |
| TS-6 | `marksync.title: "X"` overrides derived title via `resolveDocumentConfig` | 6 | AC-F4-1 |
| TS-7 | `marksync.exclude: true` removes the document from selection | 6 | AC-F4-2 |
| TS-8 | Absent / malformed front-matter is tolerated (no error) | 6 | RSK-5 |
| TS-9 | `docs/a/b.md` under `root: docs/`, `mirror` → intended parent `docs/a/` | 7 | AC-F6-1 |
| TS-10 | `flat` hierarchy → all pages under configured parent | 7 | F-6 |
| TS-11 | `marksync init` writes a starter config that round-trips `loadConfig` | 8 | AC-F5-1 |
| TS-12 | Extended `MarkSyncError` union keeps `bun run typecheck` at exit 0 | 2 | AC-F7-2, NFR-3 |
| TS-13 | `marksync.yml.example` round-trips through `loadConfig` | 9 | F-8 |
| TS-14 | `bun run check` (lint + format:check + typecheck + test + boundaries) exits 0 | 9 | AC-F8-1, NFR-6 |
| TS-15 | `check:boundaries`: `src/domain/config/**` imports no app/cli/infra; `src/cli/**` imports no domain/infra | 2–8 | Constraints |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-15-spec.md` | Spec |
| PM notes | `./chg-GH-15-pm-notes.yaml` | Orchestration |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S2--config-system.md` | Scope |
| JSON Schema v1 | `src/domain/config/schema.json` | Code (new) |
| Mirrored TS types | `src/domain/config/types.ts` | Code (new) |
| Extended error union | `src/domain/errors.ts` | Code (updated) |
| Config loader + selection | `src/app/config.ts` | Code (new) |
| ajv error formatter | `src/app/config-errors.ts` | Code (new) |
| Front-matter overrides | `src/app/document-config.ts` | Code (new) |
| Hierarchy mirroring | `src/domain/config/hierarchy.ts` | Code (new) |
| Starter config template | `src/app/config-template.ts` | Code (new) |
| `init` command stub | `src/cli/commands/init.ts` | Code (new) |
| Committed example | `marksync.yml.example` (repo root) | On-ramp (new) |
| Env reference update | `.env.example` | Config (updated) |
| Coding rules | `.ai/rules/typescript.md` | Convention |
| Architecture | `doc/overview/architecture-overview.md` | System doc |
| Granularity constraint | `doc/decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md` (C-5) | Decision |

## Remediation

<!-- Placeholder — populated by @reviewer (lifecycle phase 8) / @readiness-reviewer
     (phase 5 DoR). Each accepted finding becomes a checked task with a target
     phase and commit. -->

- [x] **DoR iter-1 / Finding 3 [minor]** — Glob-matcher dependency not routed
      through allowed-list (plan contemplated unapproved `picomatch` as a third
      runtime dep). **Resolution (plan iter-2):** committed to a zero-dependency
      hand-rolled matcher at `src/shared/glob.ts` (binding decision **DEC-5**);
      `picomatch` is **not** added; spec NFR-7 `yaml` + `ajv` envelope preserved;
      no allowed-dependency list extension or TDR required. Reflected in Phase 1
      (author `src/shared/glob.ts` + `tests/unit/shared/glob.test.ts`), Phase 5
      (consume via `#shared/glob`), Phase 9 (confirm no list extension).

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | plan-writer (GH-15) | Initial plan — 9 phases derived from `chg-GH-15-spec.md` (F-1..F-8) and story `MS2-E2-S2`; phases ordered so the `InvalidConfig` union/`never`-check extension (Phase 2) precedes the loader (Phase 4) per NFR-3/RSK-2; final phase includes version bump + spec reconciliation + full `bun run check` gate. |
| 1.1 | 2026-07-07 | plan-writer (GH-15, DoR iter-2) | Resolves DoR iter-1 Finding 3 [minor] — glob matcher not routed through allowed-list. **Committed** to a zero-dependency hand-rolled matcher at `src/shared/glob.ts` (new binding decision **DEC-5**): micromatch-style `**` / `*` / nested-dir semantics; `picomatch` is **not** added. Preserves the spec NFR-7 `yaml` + `ajv` runtime-dep envelope → no allowed-dependency list extension and no TDR required. Reflected in: Open questions (library resolved; anchoring OQ-2 remains), RSK-6 mitigation, Phase 1 (Goal, 1.2 author task + `tests/unit/shared/glob.test.ts`, 1.3 threshold wording, acceptance, files), Phase 5 (5.1 imports `#shared/glob`; files consume-only), Phase 9 (9.3 explicit no-list-extension/no-TDR confirmation). No phasing, tier placement, or other deliverable changed. |

## Execution Log

<!-- Populated during delivery (lifecycle phase 6, @coder). One row per phase. -->

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | done | 2026-07-07 | 2026-07-07 | _(committed in this run)_ | yaml@2.9.0 (ISC, 0 deps) + ajv@8.20.0 (MIT, 4 zero-dep deps); zero-dep `src/shared/glob.ts` (DEC-5); 14 glob tests PASS; baseline gates green. |
| 2 | done | 2026-07-07 | 2026-07-07 | _(committed in this run)_ | `InvalidConfig` arm + `ConfigAjvError` + `ConfigError` alias in errors.ts; `assertNeverMarkSyncError` updated in same change; typecheck PASS (NFR-3); no ajv import in domain. |
| 3 | done | 2026-07-07 | 2026-07-07 | _(committed in this run)_ | `schema.json` (draft-07, granularity enum `[squash]`, additionalProperties:false) + mirrored `types.ts`; `.gitkeep` removed; 16 schema tests PASS; typecheck/boundaries clean. |
| 4 | pending | — | — | — | — |
| 5 | pending | — | — | — | — |
| 6 | pending | — | — | — | — |
| 7 | pending | — | — | — | — |
| 8 | pending | — | — | — | — |
| 9 | pending | — | — | — | — |
