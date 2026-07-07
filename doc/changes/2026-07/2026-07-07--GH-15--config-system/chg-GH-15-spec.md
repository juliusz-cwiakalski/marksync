---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-15
  type: feat
  status: Proposed
  slug: config-system
  title: "[MS2-E2-S2] Config system — marksync.yml schema, typed loader, AI-readable validation, selection, hierarchy mirroring, front-matter overrides, init skeleton"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E2, foundation, critical]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [MS2-E2-S1 (GH-14), MS2-E3 (blocked)]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Establish the repository-owned YAML configuration system (`marksync.yml`) — a JSON-Schema-defined, ajv-validated, typed config model with AI-readable errors, file selection, hierarchy mirroring, per-document front-matter overrides, and a starter-config `init` skeleton — that every MarkSync use-case (push, init, plan, sync, doctor) consumes; the loader stays pure (no Git I/O), and `ConfigError` is added to the exhaustive `MarkSyncError` union.

## 1. SUMMARY

This is the **second story of epic MS2-E2 (Foundation)** and the config backbone of MS-0002. It defines the v1 JSON Schema for the repository-owned `marksync.yml`, the mirrored TypeScript types (`ProjectConfig` / `TargetConfig` and friends), and a typed loader `loadConfig(cwd)` that reads, parses (YAML), validates (ajv with `allErrors`), applies defaults, and returns `Result<ProjectConfig, ConfigError>`. It adds document-level overrides via front-matter (`marksync.uuid|title|parent|exclude`), pure file selection (`selectFiles(config, paths[])`), and intended hierarchy mirroring (the page-tree shape computed from selected files under `root`).

It also introduces the `ConfigError` failure kind into the `MarkSyncError` discriminated union (updating both the union and the exhaustive `assertNeverMarkSyncError` `never`-check), wires a minimal `marksync init` command that writes a valid starter `marksync.yml`, and commits a `marksync.yml.example`. The config loader is **pure**: it performs no Git tree I/O — the Git adapter (E3-S3) supplies the path list to `selectFiles`. Actual Confluence parent-page-ID resolution is out of scope (E3-S4 / E3-S6).

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-14 (MS2-E2-S1) is merged** and provides the strict TS+Bun toolchain (Biome, dependency-cruiser tier enforcement, commitlint, binding CI) plus the two cross-cutting domain primitives every domain signature depends on: `Result<T, E>` (`src/domain/result.ts`) and the exhaustive **12-kind** `MarkSyncError` discriminated union with its `assertNeverMarkSyncError` `never`-check (`src/domain/errors.ts`).
- **No config system exists.** There is no `marksync.yml` schema, no loader, no `ProjectConfig` type, no validation, no file-selection logic, no hierarchy computation, and no front-matter override handling. The ports-and-adapters skeleton has an empty `src/domain/config/` placeholder and a `src/app/` tier, but nothing in them yet.
- **Config is a shared dependency of every use-case.** Per the CLI feature spec, `ConfigLoader` is one of the five core CLI components, and `doctor` must verify config validity. Per the story's interface contracts, `loadConfig()`, `selectFiles()`, and `resolveDocumentConfig()` are consumed by the push flow, `doctor`, the identity step (E3-S1, which reads `marksync.uuid` from front-matter), and the markdown pipeline (E3-S3, which applies per-doc overrides).
- **The IO-boundary convention is settled.** typescript.md mandates **ajv** (JSON Schema) for user-authored config/lock files where the schema is the source of truth and human-readable errors matter; `zod` is reserved for code-owned schemas. Both `ajv` and `yaml` are on the allowed-dependency list.
- **Granularity is constrained by ADR-0010 C-5.** For MS-0002, sync granularity is `squash` only; `commit-by-commit` is explicitly deferred to a future milestone. The config schema must reflect this — accept only `squash`, reject `commit-by-commit` with a clear "deferred" error.

### 2.2 Pain Points / Gaps

- **No typed configuration contract.** Without `ProjectConfig` / `TargetConfig` and a validating loader, every use-case would hand-parse YAML ad hoc, with no default-merging, no schema enforcement, and no structured error channel — drift between consumers is inevitable.
- **No AI-readable failure path.** An invalid `marksync.yml` today would surface as an opaque parse/throw. Agents (and humans) need a structured `ConfigError` naming the field path, expected shape, and a suggested fix — the same AI-readable-error standard the rest of the toolchain targets (NFR-OBS-2/OBS-3).
- **`MarkSyncError` lacks a config-failure kind.** The exhaustive union currently has no arm for invalid configuration, so a config error cannot flow through the typed `Result` channel consistently with every other domain failure — and the `never`-check must be updated when it is added.
- **No file selection or hierarchy model.** Discovery, the plan step, and the intended page-tree shape all depend on `select`/`exclude` glob matching and on mirroring the repo directory structure under `root` — none of which exists yet.
- **No starter config / on-ramp.** There is no `marksync init` to scaffold a valid `marksync.yml`, nor a committed example, so a new repo has no config contract to start from.

## 3. PROBLEM STATEMENT

Because there is no repository-owned, schema-validated, typed configuration system, no MarkSync use-case can reliably read, validate, default, or override configuration — and an invalid `marksync.yml` would fail with an opaque error rather than an AI-readable, structured one — so this story must establish the `marksync.yml` v1 schema, the mirrored types, the pure validating loader, the file-selection and hierarchy-mirroring logic, the per-document front-matter overrides, the `ConfigError` failure kind in the exhaustive union, and a starter-config `init` skeleton, before the core domain (MS2-E3) can consume them.

## 4. GOALS

- **G-1**: Define the v1 JSON Schema for `marksync.yml` (the blueprint §4 field set) as the single source of truth for the config shape, with required vs optional fields documented inline.
- **G-2**: Provide the TypeScript types mirrored from the schema (`ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`) so ajv validates at runtime and TS checks at compile time.
- **G-3**: Deliver `loadConfig(cwd)` returning `Result<ProjectConfig, ConfigError>` — read, parse (YAML), ajv-validate (`allErrors`), apply defaults — kept pure (no Git tree I/O).
- **G-4**: Support per-document overrides via Markdown front-matter (`marksync.uuid|title|parent|exclude`) and a `resolveDocumentConfig(base, frontmatter)` merger.
- **G-5**: Deliver pure file selection (`selectFiles(config, paths[])` — `select` globs minus `exclude` globs) and intended hierarchy mirroring (page-tree shape computed from selected files under `root`).
- **G-6**: Add the `ConfigError` failure kind (`{ kind: "InvalidConfig"; … }`) to the `MarkSyncError` discriminated union **and** to the exhaustive `assertNeverMarkSyncError` `never`-check, with ajv errors mapped to an AI-readable message.
- **G-7**: Provide a minimal `marksync init` command that writes a valid starter `marksync.yml`, plus a committed `marksync.yml.example`.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Valid-config load | a well-formed `marksync.yml` loads and returns a fully-typed `ProjectConfig` with defaults applied |
| Invalid-config diagnostics | every invalid case (missing required field, wrong type, unknown `granularity`) yields a `ConfigError` naming field path + expected shape + suggested fix |
| Selection correctness | `selectFiles` includes `select` globs and excludes `exclude` globs across fixture file lists (zero misclassifications) |
| Override correctness | a doc with `marksync.title: "X"` overrides the derived title; `marksync.exclude: true` removes it from selection |
| Hierarchy correctness | `docs/a/b.md` under `root: docs/` yields intended parent path `docs/a/` |
| Init round-trip | `marksync init` writes a starter `marksync.yml` that subsequently loads without error |
| Quality gate | all config unit tests pass; `bun run check` exits 0 |

### 4.2 Non-Goals

- **NG-1**: The Git adapter / reading the committed tree. Config accepts a `string[]` of paths from the caller; the actual Git read is E3-S3 (the Git port). The loader performs no Git I/O.
- **NG-2**: Resolving real Confluence parent-page IDs. This story computes the **intended** hierarchy structure; actual parent-page-ID resolution happens at sync time (E3-S4 / E3-S6).
- **NG-3**: `granularity: commit-by-commit`. Out of scope for MS-0002 per ADR-0010 C-5; the schema accepts only `squash` and rejects `commit-by-commit`.
- **NG-4**: Migration of existing Confluence corpora, and a GUI/interactive init wizard — both MS-0003.
- **NG-5**: Full `init` DX (discovery, UUID assignment, interactive prompts). MS-0002 `init` only scaffolds config; UUID assignment is E3-S1.
- **NG-6**: Reconsidering the ajv-vs-zod split. User-authored config/lock schemas use ajv per typescript.md; this is settled, not reopened.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | `marksync.yml` v1 JSON Schema | The source-of-truth config shape (blueprint §4): `version`, `root`, `select[]`, `exclude[]`, `hierarchy` (`mirror`\|`flat`), `targets.<id>.{type,spaceKey,parentPageId}`, `sync.{allowBranches[],granularity,stalePlanMinutes}`, `render.mermaid.{policy,securityLevel,htmlLabels,deterministicIds}`, `output.{format,color}`, `provenance.visiblePanel`. ajv validates against this; it is the user-facing contract. |
| F-2 | Mirrored TypeScript config types | `ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig` mirrored from the schema — compile-time typing complementing ajv's runtime validation. |
| F-3 | Typed, pure config loader + file selection | `loadConfig(cwd): Result<ProjectConfig, ConfigError>` (read → YAML parse → ajv `allErrors` → apply defaults) and `selectFiles(config, paths[]): string[]` (`select` minus `exclude`). Pure: no Git tree I/O inside the loader. |
| F-4 | Document-level front-matter overrides | Parse Markdown front-matter (`marksync.uuid|title|parent|exclude`) and `resolveDocumentConfig(base, frontmatter)` to merge per-document overrides over the derived config. |
| F-5 | `marksync init` config skeleton | A minimal `init` command that writes a valid starter `marksync.yml`. Full init DX is MS-0003; MS-0002 init only scaffolds config (UUIDs are E3-S1). |
| F-6 | Intended hierarchy mirroring | Given selected files under `root`, compute the intended page-tree shape (parent path → intended parent). Computes structure only; parent-page-ID resolution is E3-S4/E3-S6. |
| F-7 | `ConfigError` in `MarkSyncError` + AI-readable diagnostics | The `InvalidConfig` kind added to the exhaustive `MarkSyncError` union (and `assertNeverMarkSyncError`), carrying the field path, the ajv errors, and a `humanMessage` that names the field, expected shape, and a suggested fix. |
| F-8 | Committed config example | A `marksync.yml.example` committed to the repo as an on-ramp reference. |

### 5.1 Capability Details

- **F-1 (Schema).** The v1 schema enumerates the blueprint §4 field set with required vs optional clearly distinguished: top-level `version` and `root`; `select[]`/`exclude[]` glob lists; `hierarchy` enum `{mirror, flat}`; a `targets` map keyed by target id, each `{type, spaceKey, parentPageId}`; `sync` with `allowBranches[]`, `granularity` (enum accepting **only** `squash` for MS-0002 — DEC-2 / ADR-0010 C-5), and `stalePlanMinutes` (default **15**, consumed by E3-S2/E3-S7); `render.mermaid.{policy, securityLevel, htmlLabels, deterministicIds}`; `output.{format, color}`; and `provenance.visiblePanel`. Required vs optional fields are documented inline in the schema. The schema is a user deliverable, so ajv (not zod) owns it (typescript.md IO-boundary rule).

- **F-2 (Types).** The TS types are mirrored from F-1 so that callers get compile-time checking on top of ajv's runtime validation. Because ajv and TS are two sources, drift is a recognized risk (RSK-3) mitigated by unit-testing both valid and each invalid case. The exact type definitions are derived from the schema, not reinvented here.

- **F-3 (Loader + selection).** `loadConfig(cwd)` reads `marksync.yml` from `cwd`, parses it as YAML, validates with ajv (`allErrors: true`), applies defaults (`applyDefaults()`), and returns either the typed `ProjectConfig` or a structured `ConfigError`. `selectFiles(config, paths[])` accepts a path list supplied by the caller and returns the subset matching `select` globs minus `exclude` globs. The loader is **pure with respect to the repo tree**: it reads only the YAML file; it does **not** invoke Git or walk the working tree — that is E3-S3's job (DEC-4). Glob semantics follow standard (`micromatch`-style) conventions so `**` and nested patterns behave as users expect (RSK-6).

- **F-4 (Front-matter overrides).** A gray-matter-style parser extracts the YAML block between `---` fences and reuses the same `yaml` dependency (DEC-1) to parse `marksync.*` keys. `resolveDocumentConfig(base, frontmatter)` merges the per-document overrides over the derived/base config: `marksync.title` overrides the derived title; `marksync.parent` overrides the intended parent; `marksync.uuid` carries the source-side identity (consumed by E3-S1); `marksync.exclude: true` removes the document from selection. Absence of front-matter is tolerated (not an error).

- **F-5 (Init).** `marksync init` writes a starter `marksync.yml` that is itself valid — i.e., it round-trips through `loadConfig` without error (AC-F5-1). It is a config-scaffolding stub only; discovery, UUID assignment, and interactive prompting are out of scope (NG-5).

- **F-6 (Hierarchy).** For `hierarchy: mirror`, selected files under `root` are mapped to an intended page-tree shape: a file at `<root>/a/b.md` yields an intended parent path `<root>/a/`. For `hierarchy: flat`, all selected pages are intended to live under the single configured parent. The output is the **intended** structure (parent path), not a resolved Confluence page ID — resolution is deferred to E3-S4/E3-S6 (NG-2).

- **F-7 (ConfigError).** The `InvalidConfig` kind is added to the `MarkSyncError` discriminated union, carrying `{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }`. Adding it **must** also extend the `assertNeverMarkSyncError` exhaustive `never`-switch so the union stays complete and extension-safe (the `never`-check makes omission a compile error — RSK-2). The `humanMessage` is produced by a custom ajv error formatter mapping `instancePath` + `keyword` to an AI-readable string: field path, expected shape vs actual, and a suggested fix. `loadConfig`'s `Result` error parameter is narrowed to the config-failure arm (`Result<ProjectConfig, ConfigError>`) per the story signature (DEC-3).

- **F-8 (Example).** A `marksync.yml.example` is committed demonstrating a realistic, valid configuration, serving as the canonical on-ramp reference alongside `init`.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Use-case loads config (push / plan / sync / doctor):
  Command starts → loadConfig(cwd) reads marksync.yml → YAML parse → ajv validate (allErrors)
    → [valid] applyDefaults() → Result.ok(ProjectConfig) → use-case proceeds with typed config
    → [invalid] Result.err(ConfigError{ path, ajvErrors[], humanMessage }) → CLI renders AI-readable diagnostic + exit code.

Flow 2 — Document discovery + overrides (downstream of this story):
  Caller supplies repo path list (Git adapter, E3-S3) → selectFiles(config, paths) → matched paths
    → for each doc: parse front-matter → resolveDocumentConfig(base, frontmatter)
    → marksync.exclude:true drops it; marksync.title overrides derived title; marksync.parent overrides intended parent.

Flow 3 — Intended hierarchy (downstream):
  selectFiles result + hierarchy mode → mirror: <root>/a/b.md → intended parent <root>/a/
    → flat: all under configured parent → structure handed to sync-time resolution (E3-S4/E3-S6).

Flow 4 — Onboarding via init:
  marksync init → writes starter marksync.yml → subsequent loadConfig() succeeds (round-trip).
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The v1 JSON Schema for `marksync.yml` (blueprint §4 field set) with required vs optional documented inline (F-1).
- The mirrored TypeScript config types `ProjectConfig` / `TargetConfig` / `RenderConfig` / `SyncConfig` / `OutputConfig` (F-2).
- `loadConfig(cwd): Result<ProjectConfig, ConfigError>`, `applyDefaults()`, and `selectFiles(config, paths[])` — pure (no Git I/O) (F-3).
- Front-matter parsing (`marksync.uuid|title|parent|exclude`) and `resolveDocumentConfig(base, frontmatter)` (F-4).
- `marksync init` config-scaffolding stub (writes a valid starter `marksync.yml`) (F-5).
- Intended hierarchy mirroring (page-tree shape from selected files under `root`) (F-6).
- `ConfigError` (`InvalidConfig` kind) added to the `MarkSyncError` union **and** `assertNeverMarkSyncError`, with an AI-readable ajv error formatter (F-7).
- A committed `marksync.yml.example` (F-8).

### 7.2 Out of Scope

- [OUT] The Git adapter / reading the committed tree — config accepts a `string[]` of paths; the Git read is E3-S3.
- [OUT] Resolving real Confluence parent-page IDs — E3-S4 / E3-S6.
- [OUT] `granularity: commit-by-commit` — deferred per ADR-0010 C-5 (schema accepts only `squash`).
- [OUT] Migration of existing Confluence corpora — MS-0003.
- [OUT] GUI / interactive init wizard — MS-0003.
- [OUT] Full `init` DX (discovery, UUID assignment) — MS-0002 init scaffolds config only; UUIDs are E3-S1.

### 7.3 Deferred / Maybe-Later

- **Schema-version migration machinery** — v1 has no prior version to migrate from; a `version` field is captured now, but upgrade/migration tooling is deferred until a v2 exists.
- **Lock-file schema** — the lock file also uses ajv per typescript.md, but it is a separate story (not this one).
- **Schema-derived TS types (code generation)** — types are hand-mirrored for v1; an ajv-schema → TS generator to eliminate drift (RSK-3) is a future option.
- **`hierarchy` modes beyond `mirror`/`flat`** — start with the two enumerated modes; add more only if a real need arises.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story introduces no HTTP endpoints. It is a local config system consumed in-process by CLI commands.

### 8.2 Events / Messages

N/A — no events or messages are introduced.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `ProjectConfig` | The fully-typed, defaults-applied configuration object returned by `loadConfig` on success — the root of the mirrored type set (`TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`). Consumed by every use-case. |
| DM-2 | `TargetConfig` | The per-target shape (`type`, `spaceKey`, `parentPageId`) within the `targets` map; consumed by the target/binding steps downstream. |
| DM-3 | `ConfigError` / `InvalidConfig` kind | The config-failure arm added to the exhaustive `MarkSyncError` discriminated union: `{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }`. Adding it requires extending **both** the union and the `assertNeverMarkSyncError` `never`-switch. `loadConfig` returns `Result<ProjectConfig, ConfigError>` (narrowed arm — DEC-3). |

> Note: the existing `Result<T, E>` primitive (from GH-14) is reused unchanged; this story adds no new `Result` variant, only a new error kind flowing through it.

### 8.4 External Integrations

No external services are contacted by this story (it is local config parsing/validation). The runtime dependencies introduced are **`yaml`** (parses both `marksync.yml` and front-matter blocks — single dependency, DEC-1) and **`ajv`** (JSON Schema validation with `allErrors` + a custom error formatter). Both are on the allowed-dependency list in typescript.md; transitive-dependency count and licenses are verified at delivery (NFR-SEC-4).

### 8.5 Backward Compatibility

N/A for released artifacts — MS-0002 is pre-release (v0.0.0); there is no prior `marksync.yml` format in the wild. Within the codebase, adding `InvalidConfig` to `MarkSyncError` is a contract extension: the exhaustive `never`-check guarantees that any existing handler is surfaced at compile time if it does not account for the new kind (this is the intended safety property, not a regression). The `version` field in the schema establishes the forward-compatibility hook for future schema evolution.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Config-load latency | `loadConfig` parses + validates a typical `marksync.yml` in **≤ 50 ms (p95)** on reference hardware (single small YAML file + one ajv compile/validate) |
| NFR-2 | Diagnostic completeness | **100%** of invalid-config cases (missing required field, wrong type, unknown `granularity`) yield a `ConfigError` whose `humanMessage` names the field path, expected shape, and a suggested fix |
| NFR-3 | Exhaustiveness safety | adding the `InvalidConfig` kind leaves the `MarkSyncError` union **and** `assertNeverMarkSyncError` compiling with **zero** type errors (the `never`-check is updated in the same change) |
| NFR-4 | Loader purity | `selectFiles` performs **zero** Git/working-tree I/O — it accepts a caller-supplied `string[]` (DEC-4); the only I/O inside the loader is reading the `marksync.yml` file |
| NFR-5 | Granularity enforcement | `commit-by-commit` is rejected with an explicit "deferred to a future milestone" error; the schema accepts **only** `squash` (ADR-0010 C-5) |
| NFR-6 | Quality gate | all config unit tests pass; `bun run check` (lint + typecheck + test + boundaries) exits **0** |
| NFR-7 | Dependency hygiene | `yaml` and `ajv` are runtime deps on the allowed list; `yaml` transitive-dependency count ≤ **20** (typescript.md threshold); license-audit rejects GPL/AGPL/LGPL/UNLICENSED (NFR-SEC-4) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 — no outbound telemetry). The relevant observability is the **structured error channel**: every config failure surfaces as a typed `ConfigError` (`{ kind: "InvalidConfig"; path; ajvErrors[]; humanMessage }`) flowing through `Result`, which the CLI output layer (ADR-0011) renders as AI-readable JSON/NDJSON with stable exit codes (NFR-OBS-1/OBS-2). The `humanMessage` must be self-contained enough for an agent to act without human interpretation (field path + expected vs actual + suggested fix).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | ajv error formatting produces opaque messages (raw `instancePath`/`keyword`) instead of AI-readable field-path + expected-vs-got + suggested-fix text | M | M | Build a custom ajv error formatter mapping `instancePath` + `keyword` → `humanMessage`; unit-test each invalid case (missing field, wrong type, unknown enum) and assert the message names path + expected + fix (NFR-2). | L |
| RSK-2 | Adding `ConfigError` touches the exhaustive `never`-check — the union and `assertNeverMarkSyncError` can drift if updated separately | M | L | Update **both** the union and `assertNeverMarkSyncError` in the same change; the `never`-check makes omission a compile error (NFR-3), surfacing the gap at the definition site. | L |
| RSK-3 | TS types drift from the JSON Schema (ajv validates at runtime, TS at compile-time — two sources) | M | M | Keep types mirrored from the schema; unit-test valid + each invalid case against ajv so schema and types are exercised together; consider schema→TS generation as a deferred option (§7.3). | M |
| RSK-4 | `yaml` dependency carries > 20 transitive deps or a non-MIT license | L | L | Audit transitive-dependency count and license at delivery (NFR-7, NFR-SEC-4); both `yaml` and `ajv` are on the allowed list; fall back only if the audit fails. | L |
| RSK-5 | Front-matter parser mishandles edge cases (no front-matter, malformed fences, non-`marksync` front-matter keys, CRLF) | L | M | Tolerate absent front-matter (not an error); reuse the `yaml` parser on the fenced block; unit-test edge cases including missing/malformed fences and unrelated keys. | L |
| RSK-6 | `selectFiles` glob semantics diverge from Git/user expectations (`**`, nested dirs, leading-slash anchoring) | M | M | Implement standard (`micromatch`-style) glob semantics; unit-test `select`/`exclude` against fixture file lists matching AC-F3-1; document anchoring behavior relative to `root`. | L |

## 12. ASSUMPTIONS

- GH-14 (MS2-E2-S1) is merged and provides `Result<T, E>`, the exhaustive 12-kind `MarkSyncError` union with `assertNeverMarkSyncError`, the strict TS+Bun toolchain, and binding CI — all reusable unchanged.
- The blueprint §4 field set (enumerated in the story scope item 1) is the authoritative target schema shape; this story formalizes it as a JSON Schema, it does not invent new fields.
- typescript.md's IO-boundary rule (ajv for user-authored config/lock schemas; `yaml`+`ajv` on the allowed-dependency list) is settled and is being **implemented**, not reconsidered.
- ADR-0010 C-5 (squash-only for MS-0002; commit-by-commit deferred) is binding and constrains the `granularity` enum.
- The config file contains no secrets (credentials live in env/keyring per the CLI feature spec, NFR-SEC-6); the redaction layer therefore has no secret material to scrub from config errors, though it remains in the output path.
- `stalePlanMinutes` default of 15 is consumed downstream by E3-S2/E3-S7; this story only defines and defaults it.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) | Provides `Result<T,E>`, `MarkSyncError`/`assertNeverMarkSyncError`, the TS+Bun toolchain, and binding CI. Merged. |
| Depends on | ADR-0010 (C-5 granularity) | Constrains `sync.granularity` to `squash` only for MS-0002. |
| Depends on | typescript.md | ajv-for-user-authored-schemas rule; `Result<T,E>`; exhaustive-checking convention; allowed-dependency list. |
| Depends on | feature-cli.md (SPEC-CLI) | Names `ConfigLoader` as a core component; `doctor` must verify config validity. |
| Blocks | MS2-E3 (core domain) | Consumes `loadConfig`, `selectFiles`, `resolveDocumentConfig`. |
| Blocks | MS2-E3-S1 (identity) | Consumes `marksync.uuid` from front-matter. |
| Blocks | E3-S3 (Git adapter + markdown pipeline) | Supplies the path list to `selectFiles`; consumes per-doc overrides. |
| Blocks | E3-S4 / E3-S6 (parent-page resolution) | Consumes the intended hierarchy this story computes. |
| Blocks | push-flow, plan, sync, doctor | All consume `loadConfig` / `ProjectConfig`. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the TS config types be generated from the JSON Schema (code-gen) to eliminate schema/type drift (RSK-3), or hand-mirrored for v1? | Two sources (ajv runtime, TS compile-time) can diverge; a generator removes the drift but adds tooling. | Resolved for v1: hand-mirror (keep scope tight); code-gen is deferred (§7.3). No `@decision-advisor` escalation — revisit when a v2 schema or drift incident warrants it. |
| OQ-2 | Exact glob anchoring semantics for `select`/`exclude` relative to `root` (leading-slash anchored vs glob-relative)? | Users coming from Git/.gitignore may expect specific anchoring; ambiguous anchoring causes selection surprises (RSK-6). | Resolve at delivery by documenting the chosen semantics and covering them in `selectFiles` unit tests. (Specification detail — no `@decision-advisor` escalation unless it surfaces a contract conflict.) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Use the `yaml` npm package (ESM) for **both** `marksync.yml` parsing and front-matter block parsing. | CEO-resolved (story Q1): actively maintained, ESM, parses both YAML documents and fenced front-matter blocks — a single dependency serves both needs (typescript.md minimal-dependencies rule). Replaces the `js-yaml` alternative on fewer-transitive-deps grounds. | 2026-07-07 |
| DEC-2 | `sync.granularity` accepts **only** `squash`; reject `commit-by-commit` with a clear "deferred to a future milestone" error. | CEO-resolved (story Q2) per ADR-0010 C-5: commit-by-commit is out of scope for MS-0002; the schema enum and validator enforce this explicitly rather than silently accepting an unsupported value. | 2026-07-07 |
| DEC-3 | `ConfigError` is the `InvalidConfig` kind added to the `MarkSyncError` discriminated union; `loadConfig` returns `Result<ProjectConfig, ConfigError>` (narrowed arm); the union **and** `assertNeverMarkSyncError` are updated together. | The story mandates `ConfigError` extend `MarkSyncError`; flowing it through the same exhaustive channel keeps error handling uniform. The narrowed `Result` error parameter preserves precision at the loader boundary while the full union remains available downstream. | 2026-07-07 |
| DEC-4 | The config loader is **pure** with respect to the repo tree — `selectFiles` accepts a caller-supplied `string[]`; no Git/working-tree I/O inside the loader. | Separation of concerns: the Git adapter (E3-S3) owns tree reads; config owns parsing/validation/selection. Keeps the loader unit-testable without Git and avoids a premature infra dependency in the domain/application tier. | 2026-07-07 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Config schema (JSON Schema v1 for `marksync.yml`) | New |
| Config types (`ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`) | New |
| Config loader + selection + defaults (application tier) | New |
| Front-matter parsing + `resolveDocumentConfig` | New |
| Hierarchy mirroring (intended page-tree shape) | New |
| `marksync init` command (config-scaffolding stub) | New |
| Domain error union (`MarkSyncError`) + exhaustive `never`-check | Updated — `InvalidConfig` kind added |
| `marksync.yml.example` (committed on-ramp example) | New |
| `.env.example` references | Updated |
| Config unit tests (schema valid/invalid, defaults, selection, overrides, hierarchy) | New |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story's numbered acceptance criteria (AC-1..AC-7), which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F3-1 | **Given** a valid `marksync.yml`, **when** `loadConfig(cwd)` runs, **then** it returns `Result.ok` with a fully-typed `ProjectConfig` and all defaults applied (e.g. `stalePlanMinutes` = 15). | F-1, F-2, F-3, DM-1, NFR-1 | AC-1 |
| AC-F7-1 | **Given** an invalid config (missing required field, wrong type, or an unknown `granularity` value), **when** `loadConfig` runs, **then** it returns `Result.err(ConfigError)` whose `humanMessage` names the field path, the expected shape, and a suggested fix. | F-7, DM-3, NFR-2 | AC-2 |
| AC-F3-2 | **Given** a config with `select` and `exclude` globs and a fixture file list, **when** `selectFiles(config, paths)` runs, **then** it returns exactly the paths matching `select` minus those matching `exclude`. | F-3, NFR-4 | AC-3 |
| AC-F4-1 | **Given** a document whose front-matter sets `marksync.title: "X"`, **when** `resolveDocumentConfig(base, frontmatter)` runs, **then** the merged config uses `"X"` as the title in place of the derived title. | F-4 | AC-4 |
| AC-F4-2 | **Given** a document whose front-matter sets `marksync.exclude: true`, **when** selection/override runs, **then** that document is removed from the selected set. | F-4 | AC-4 |
| AC-F6-1 | **Given** `hierarchy: mirror` and a selected file `docs/a/b.md` under `root: docs/`, **when** the intended hierarchy is computed, **then** the document's intended parent path is `docs/a/`. | F-6 | AC-5 |
| AC-F5-1 | **Given** a directory with no `marksync.yml`, **when** `marksync init` runs, **then** it writes a starter `marksync.yml` that subsequently loads via `loadConfig` without error. | F-5, F-8 | AC-6 |
| AC-F7-2 | **Given** the updated `MarkSyncError` union and `assertNeverMarkSyncError`, **when** `bun run typecheck` runs, **then** it exits 0 (the `InvalidConfig` kind is handled exhaustively — no `never`-check break). | F-7, DM-3, NFR-3 | AC-2 |
| AC-F8-1 | **Given** all config unit tests, **when** `bun run check` (lint + typecheck + test + boundaries) runs, **then** it exits 0. | F-1..F-8, NFR-6 | AC-7 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main.** This story depends only on GH-14 (merged); it blocks MS2-E3 and several E3 sub-stories.
- **Merge strategy:** subject to repo convention (Conventional Commits, enforced by TDR-0008). Commit type `feat` with a `config` scope is appropriate for the primary commits.
- **Ordering within the story:** the `InvalidConfig` union/`never`-check update (F-7/DM-3) should land alongside the loader (F-3) so the typed error channel is consistent from the first commit — do not merge a loader that throws while the union update is pending.
- **After merge:** MS2-E3 and E3-S1/S3/S4/S6 are unblocked; `loadConfig` / `selectFiles` / `resolveDocumentConfig` become the shared config contract for the core domain.
- **Communication:** the PR description should note the new `marksync.yml` contract, the `ConfigError` union extension, and the squash-only `granularity` constraint (ADR-0010 C-5) so downstream stories align.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A for migration — MS-0002 is greenfield with no prior `marksync.yml` format. The `marksync.yml.example` (F-8) and the `marksync init` starter output (F-5) are the seeding artifacts: both are valid v1 configs that round-trip through `loadConfig`. The `version` field in the schema establishes the hook for future migration, but no migration logic is implemented in this story.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — the config file holds repository structural metadata (paths, globs, target space keys, page IDs, render flags) and **no** credentials (NFR-SEC-6 — tokens live in env/keyring, never in project files). No user/personal data is processed. The squash-only granularity constraint (ADR-0010 C-5) additionally reduces privacy exposure at sync time, though that is realized downstream, not in this story. Config errors carry no secret material to redact, though the redaction layer remains in the output path.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No secrets in config.** Credentials are out of band (env/keyring); `marksync.yml` carries no tokens, so config-loading errors cannot leak secrets (NFR-SEC-1/SEC-6).
- **Validated untrusted-ish input.** The user-authored `marksync.yml` is parsed and ajv-validated before any field is trusted — no unvalidated external data reaches the domain layer (typescript.md IO-boundary rule). Malformed YAML or schema-violating values yield a `ConfigError`, never undefined behavior.
- **Dependency supply chain.** `yaml` and `ajv` are runtime deps on the allowed list; transitive-dependency count and licenses are audited at delivery (NFR-7, NFR-SEC-4). The license-audit gate is binding (GH-14 unguarded CI).
- **No network/file attack surface** beyond reading one local YAML file; no arbitrary code execution from config values (values are data, not evaluated).

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Config becomes a hard shared contract.** Every use-case consumes `loadConfig` / `ProjectConfig`; schema or type changes ripple to all consumers — changes are schema-versioned (`version` field) and reviewed with downstream stories in mind.
- **Two-source drift is an ongoing maintenance tax.** The JSON Schema and the TS types must stay mirrored; RSK-3 mitigation (joint unit tests) is the standing discipline, and code-generation remains a deferred option (§7.3).
- **Error-quality bar is set here.** The ajv error formatter (RSK-1) establishes the AI-readable-diagnostic pattern that later IO boundaries (e.g., lock-file validation) should mirror.
- **Exhaustive-union extension discipline.** Any future `MarkSyncError` kind addition must update the union **and** `assertNeverMarkSyncError` together — the `never`-check enforces this, and this story is the first post-GH-14 exercise of that property.
- **Pure loader = cheap to test.** Because `selectFiles` takes a path list (DEC-4), config tests need no Git fixture — they are fast, deterministic unit tests over fixture lists and YAML strings.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `marksync.yml` | The repository-owned YAML configuration file consumed by every MarkSync use-case. |
| `ProjectConfig` | The fully-typed, defaults-applied configuration object returned by `loadConfig`. |
| `TargetConfig` | The per-target shape (`type`, `spaceKey`, `parentPageId`) within the `targets` map. |
| `ConfigError` | The config-failure arm (`InvalidConfig` kind) of the `MarkSyncError` union; carries field path, ajv errors, and an AI-readable `humanMessage`. |
| ajv | JSON Schema validator used for user-authored config/lock schemas (typescript.md IO-boundary rule); emits structured errors that this story formats into AI-readable messages. |
| Front-matter | The YAML block between `---` fences at the top of a Markdown document; carries per-document `marksync.*` overrides. |
| `selectFiles` | Pure function returning the path subset matching `select` globs minus `exclude` globs, given a caller-supplied path list. |
| Hierarchy mirroring | Computing the intended Confluence page-tree shape from selected files under `root` (e.g. `docs/a/b.md` → parent `docs/a/`). |
| `granularity` | The sync-history strategy; MS-0002 accepts only `squash` (ADR-0010 C-5); `commit-by-commit` is deferred. |
| `stalePlanMinutes` | Config default (15) bounding plan freshness; consumed downstream by E3-S2/E3-S7. |
| Exhaustive `never`-check | A `switch` whose `default` assigns the value to `never`, making an unhandled error kind a compile error; this story extends it for `InvalidConfig`. |

## 24. APPENDICES

### Appendix A — Story AC → Spec AC traceability

| Story AC | Spec AC(s) | Capability / NFR |
|---|---|---|
| AC-1 (valid config loads with defaults) | AC-F3-1 | F-1, F-2, F-3, DM-1, NFR-1 |
| AC-2 (invalid config → AI-readable ConfigError) | AC-F7-1, AC-F7-2 | F-7, DM-3, NFR-2, NFR-3 |
| AC-3 (selectFiles include/exclude) | AC-F3-2 | F-3, NFR-4 |
| AC-4 (front-matter overrides: title + exclude) | AC-F4-1, AC-F4-2 | F-4 |
| AC-5 (hierarchy mirroring) | AC-F6-1 | F-6 |
| AC-6 (init writes valid starter) | AC-F5-1 | F-5, F-8 |
| AC-7 (all unit tests pass; check green) | AC-F8-1 | F-1..F-8, NFR-6 |

### Appendix B — Authoritative sources

- **Story scope (authoritative):** `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S2--config-system.md` — Goal, Detailed scope (8 deliverables), Acceptance criteria, Out of scope, CEO-resolved Q1/Q2.
- **Schema field set:** blueprint §4 (referenced via the story scope item 1).
- **IO-boundary / validator / Result / exhaustive-checking conventions:** `.ai/rules/typescript.md`.
- **Existing primitives:** `src/domain/result.ts` (`Result<T,E>`), `src/domain/errors.ts` (12-kind `MarkSyncError` + `assertNeverMarkSyncError`).
- **Granularity constraint:** `doc/decisions/ADR-0010-…sync-granularity.md` (C-5: squash-only for MS-0002).
- **CLI component / doctor contract:** `doc/spec/features/feature-cli.md` (SPEC-CLI — `ConfigLoader`, `doctor` config validity).
- **Epic / milestone context:** epic MS2-E2, milestone MS-0002 (MVP safe one-way publisher).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | spec-writer (GH-15) | Initial specification — formalized from the authoritative story file MS2-E2-S2, epic MS2-E2, the blueprint §4 field set, typescript.md IO-boundary conventions, the existing `Result<T,E>`/`MarkSyncError` primitives (GH-14), and ADR-0010 C-5. |

---

## AUTHORING GUIDELINES

- **Seed:** The authoritative scope is the story file `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S2--config-system.md` (DoR-ready). This spec formalizes that story as the per-change specification; it does not invent new requirements or expand scope. The story's Goal / Detailed scope (8 deliverables) / Acceptance criteria / Out-of-scope map directly to the Goals (G-1..G-7), Capabilities (F-1..F-8), Acceptance Criteria (AC-*), and Non-Goals (NG-1..NG-6) here.
- **Sources cited:** story MS2-E2-S2, blueprint §4, typescript.md, feature-cli.md, ADR-0010 (C-5), the existing `result.ts`/`errors.ts` primitives, epic MS2-E2.
- **No implementation detail:** the JSON Schema field set and the type contracts are described as **contracts** (what the config must contain and guarantee), not as step-by-step file-creation tasks. Exact schema/type contents are derived from blueprint §4 (cited), not reproduced as prescriptive instructions.
- **CEO-resolved items** carried forward as decisions: Q1 → `yaml` library (DEC-1); Q2 → squash-only `granularity` with deferred rejection (DEC-2). Two further design clarifications are recorded as DEC-3 (`ConfigError` as the `InvalidConfig` union arm + narrowed `Result` error) and DEC-4 (pure loader — no Git I/O).
- **Open items** (schema→TS code-gen, glob anchoring) are captured as OQ-1/OQ-2 but flagged as delivery-time specifications/deferrals, not `@decision-advisor` escalations.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-15)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR-/DM- ID and use Given/When/Then
- [x] NFRs include measurable values (≤ 50 ms p95 load; 100% diagnostic completeness; zero type errors; zero Git I/O; squash-only; ≤ 20 transitive deps; `bun run check` exit 0)
- [x] Risks include Impact & Probability
- [x] No implementation details (no step-by-step file-creation tasks; schema/type contents described as contracts, sourced from blueprint §4 / cited convention files)
- [x] No content duplicated from linked docs (story / typescript.md / ADR-0010 referenced, not reproduced)
- [x] Front matter validates per front_matter_rules
