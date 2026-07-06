---
id: MS2-E2-S2
title: "config-system"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: 2d
gh_issue: GH-15
feature_spec: doc/spec/features/feature-cli.md
decisions: []
dependencies: { blocks: [MS2-E3], blocked_by: [MS2-E2-S1] }
cross_cutting: []
---

# MS2-E2-S2 — Config system (marksync.yml)

## Goal
Repository-owned YAML config (`marksync.yml`): load, merge defaults, validate via **JSON Schema (ajv)**, support file selection + hierarchy mirroring + document-level front-matter overrides, and produce AI-readable errors on invalid config.

## Background
Config is consumed by every use-case (push flow, init, plan, sync, doctor). Per typescript.md, the user-authored config/lock files use **ajv** (schema is source-of-truth; human-readable errors), while code-owned schemas use zod. This story defines the `ProjectConfig`/`TargetConfig` types and the JSON Schema, plus the loader/merger. Blueprint §4 is the target schema.

## Detailed scope (deliverables)
1. **`src/domain/config/schema.json`** — the JSON Schema for `marksync.yml` v1 (blueprint §4): `version`, `root`, `select[]`, `exclude[]`, `hierarchy` (`mirror`|`flat`), `targets.<id>.{type,spaceKey,parentPageId}`, `sync.{allowBranches[],granularity,stalePlanMinutes}` (`stalePlanMinutes` default 15 — consumed by E3-S2/E3-S7), `render.mermaid.{policy,securityLevel,htmlLabels,deterministicIds}`, `output.{format,color}`, `provenance.visiblePanel`. Required vs optional fields documented inline.
2. **`src/domain/config/types.ts`** — TS types mirrored from the schema (ajv gives runtime validation; TS types give compile-time). `ProjectConfig`, `TargetConfig`, `RenderConfig`, `SyncConfig`, `OutputConfig`.
3. **`src/app/config.ts`** — `loadConfig(cwd: string): Result<ProjectConfig, ConfigError>`: read `marksync.yml`, parse (YAML), ajv-validate, apply defaults, return typed config or a structured error. Also `applyDefaults()`, `selectFiles(config, gitTree)` (glob match `select` minus `exclude`).
4. **Document-level overrides** — parse front-matter (`marksync.uuid`, `marksync.title`, `marksync.parent`, `marksync.exclude`) via a small gray-matter-style parser; `resolveDocumentConfig(base, frontmatter)` merges overrides.
5. **`marksync init` skeleton** — the `init` command writes a starter `marksync.yml` (this story creates the config-writing helper + a minimal `init` command stub; full `init` DX is MS-0003). MS-0002 `init` only needs to scaffold config + assign UUIDs (UUIDs are E3-S1).
6. **Hierarchy mirroring** — given selected files under `root`, compute the target page-tree shape (parent path → parent page). Resolution of actual parent page IDs happens at sync time (E3-S4/E3-S6); this story computes the **intended** hierarchy structure.
7. **Error shape** — `ConfigError` (extend `MarkSyncError`): `{ kind:"InvalidConfig"; path; ajvErrors[]; humanMessage }`. ajv errors → AI-readable message (field path + expected vs got + suggested fix).
8. **`marksync.yml.example`** + update `.env.example` references — committed example.

## Technical approach
- YAML parse: use a minimal, zero-heavy-dep parser. Evaluate `yaml` (npm) vs `js-yaml`; pick the one with fewer transitive deps (typescript.md "minimal dependencies"). Record the choice in a code comment.
- ajv with `allErrors:true` + a custom error formatter that maps ajv `instancePath`/`keyword` → `humanMessage`.
- File selection: implement glob matching against the git file list (git adapter not yet built — accept a `string[]` of paths from the caller; the actual git read is E3-S3/the git port). Keep config pure: no I/O of the repo tree inside the loader beyond reading the YAML file.
- Front-matter: use `yaml` parser on the front-matter block (between `---` fences); reuse the YAML dep.

## Interface contracts (what other stories consume)
- `loadConfig()` → `ProjectConfig` consumed by `push-flow`, `doctor`, every command.
- `selectFiles(config, paths)` → `string[]` consumed by the discovery step.
- `resolveDocumentConfig()` → per-document overrides consumed by E3-S3 (markdown pipeline) and E3-S1 (identity).
- `ConfigError` added to `MarkSyncError` (update `errors.ts` exhaustive union; update the `never`-check).

## Acceptance criteria (testable)
- [ ] A valid `marksync.yml` loads and returns a fully-typed `ProjectConfig` with defaults applied.
- [ ] An invalid config (missing required field, wrong type, unknown `granularity` value) returns `Result.err(ConfigError)` with an AI-readable message naming the field, expected shape, and a suggested fix.
- [ ] `selectFiles` correctly includes `select` globs and excludes `exclude` globs (unit tests with fixture file lists).
- [ ] Front-matter overrides: a doc with `marksync.title: "X"` overrides the derived title; `marksync.exclude: true` removes it from selection.
- [ ] Hierarchy mirroring: a repo tree `docs/a/b.md` under `root: docs/` → intended parent path `docs/a/`.
- [ ] `marksync init` writes a valid starter `marksync.yml` that subsequently loads without error.
- [ ] All config unit tests pass; `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | schema validation (valid + each invalid case), defaults, selectFiles, front-matter merge, hierarchy computation |
| Integration | n/a (no I/O beyond file read) |
| Golden | n/a |

## Definition of Done
Config loads, validates, defaults, selects files, applies overrides, mirrors hierarchy; invalid config → clear error; init writes a valid config. AC list above is the DoD.

## Out of scope
- The Git adapter / reading the committed tree (E3-S3 wires the git port; config accepts a path list).
- Resolving real Confluence parent page IDs (E3-S4/E3-S6).
- Migration of existing Confluence corpora (MS-0003).
- GUI/interactive init wizard (MS-0003).

## Risks / open questions (CEO-resolved)
- **Q1:** YAML lib choice. → CEO: use `yaml` (npm, ESM, actively maintained, parses both YAML and front-matter blocks). Single dep serves both. Recorded.
- **Q2:** `granularity: commit-by-commit`. → Out of scope for MS-0002 (ADR-0010 C-5); schema accepts only `squash`; reject `commit-by-commit` with a clear "deferred to a future milestone" error. CEO-recorded.
