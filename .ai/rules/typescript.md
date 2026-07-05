---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: CONVENTIONS-TYPESCRIPT
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0006, ADR-0011, TDR-0002, TDR-0003, TDR-0004]
  related_changes: []
  summary: "TypeScript + Bun conventions — module structure, naming, error handling, IO boundaries, linting, formatting for MarkSync."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# TypeScript Conventions

_Coding conventions for MarkSync. All agents (@coder, @plan-writer, reviewers)
must load and follow this file. Implements the FSE-audit target baseline
(explicit typing, SRP modules, conventions over configuration, semantic naming,
contextual comments)._

## Module structure

### Tier rules (from architecture-overview.md)

| Tier | Path prefix | May import | May NOT import |
|---|---|---|---|
| **Presentation** | `src/cli/` | application | domain, infrastructure |
| **Application** | `src/app/` | domain, infrastructure (via ports) | presentation |
| **Domain** | `src/domain/` | nothing (defines ports) | application, presentation, infrastructure |
| **Infrastructure** | `src/infra/` | domain (implements ports) | application, presentation |
| **Shared** _(utility)_ | `src/shared/` | nothing (pure utilities with no tier dependencies) | any tier |

> **Shared tier note:** `src/shared/` holds only pure utility functions
> (path manipulation, hash helpers, string utilities) that have zero
> dependencies on any other tier. This is consistent with the
> [dependency-direction matrix](../../doc/overview/architecture-overview.md#dependency-direction--layering-matrix)
> — it is not a new architectural tier but a utility namespace that any tier
> may import. If a utility grows domain knowledge, it graduates to
> `src/domain/`.

**Invariant:** no dependency may point upward or sideways across tiers. See the
[dependency-direction matrix](../../doc/overview/architecture-overview.md#dependency-direction--layering-matrix).

### Residence rules

| Code type | Location | Example |
|---|---|---|
| CLI command | `src/cli/commands/` | `src/cli/commands/plan.ts` |
| Output formatter | `src/cli/output/` | `src/cli/output/json.ts` |
| Use-case orchestration | `src/app/` | `src/app/push-flow.ts` |
| Config/lock loading | `src/app/config.ts` | |
| Domain rule | `src/domain/<context>/` | `src/domain/state/classifier.ts` |
| Port interface | `src/domain/<context>/port.ts` | `src/domain/target/port.ts` (defines `TargetSystem`); `src/domain/git/port.ts` (defines `Repository`); `src/domain/render/port.ts` (defines `Renderer`) |
| Confluence adapter | `src/infra/confluence/` | `src/infra/confluence/client.ts` |
| Git adapter | `src/infra/git/` | `src/infra/git/shell-git.ts` |
| Mermaid renderer | `src/infra/mermaid/` | `src/infra/mermaid/renderer.ts` |
| Test | `tests/` mirroring `src/` | `tests/domain/state/classifier.test.ts` |
| Golden fixture | `tests/golden/fixtures/` | `tests/golden/fixtures/headings.storage.xhtml` |

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| **Files** | kebab-case | `state-classifier.ts`, `push-executor.ts` |
| **Directories** | kebab-case | `src/domain/state/` |
| **Classes / interfaces** | PascalCase, UL term | `StateClassifier`, `TargetSystem`, `PageBinding` |
| **Types / enums** | PascalCase, UL term | `SyncState`, `BodyRepresentation` |
| **Functions** | camelCase, verb-first | `classifyState()`, `resolveLink()` |
| **Constants** | UPPER_SNAKE_CASE | `DEFAULT_ALLOW_BRANCHES`, `MARKSYNC_METADATA_KEY` |
| **Enum members** | UPPER_SNAKE_CASE | `SyncState.NO_CHANGE`, `SyncState.REMOTE_AHEAD` |
| **Test files** | `*.test.ts` | `classifier.test.ts` |
| **Type guards** | `isXxx()` | `isConflict(error)`, `isPageBinding(value)` |

### UL binding (from ubiquitous-language.md)

- Public API names (classes, interfaces, exported types, enums) MUST use the UL
  term as the canonical identifier. No synonyms.
- If a new domain concept is introduced, add it to the UL in the same PR.

## TypeScript configuration (target)

```jsonc
// tsconfig.json (target — established in Phase 4)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Strict-mode rules (non-negotiable)

1. **`strict: true`** — full strict mode.
2. **`noImplicitAny: true`** — no implicit `any`; annotate or use `unknown`.
3. **`strictNullChecks: true`** — explicit null handling.
4. **`noUncheckedIndexedAccess: true`** — `array[i]` is `T | undefined`.
5. **`exactOptionalPropertyTypes: true`** — `{ x?: T }` does not accept
   `{ x: undefined }`.

### When `any` is acceptable (rare)

- In test helpers, only with an explicit `// eslint-disable-next-line` comment
  explaining why.
- In third-party type shims (`.d.ts` files) where the library lacks types.
- Never in production domain/application/infrastructure code.

## Error handling

### Typed errors

Errors are typed discriminated unions, not bare `Error`:

```typescript
// src/domain/errors.ts
export type MarkSyncError =
  | { kind: "Conflict"; pageId: string; baseVersion: number; remoteVersion: number }
  | { kind: "RemoteMissing"; pageId: string }
  | { kind: "DuplicateUuid"; uuid: string; paths: string[] }
  | { kind: "UnsupportedConstruct"; construct: string; sourcePath: string }
  | { kind: "Forbidden"; pageId: string; operation: string }
  | { kind: "LockDirty"; path: string }
  | { kind: "ConcurrentWrite"; lockPath: string }
  | { kind: "RenderUnavailable"; renderer: string; cause: string };
```

### Rules

- **Throw typed errors** — `throw { kind: "Conflict", pageId, ... }` or a typed
  error class. Never `throw new Error("string")` in domain/infra code.
- **Catch at boundaries** — the application layer catches `MarkSyncError` and
  converts to a structured `CommandResult<T>` (ADR-0011). The CLI output service
  maps `CommandResult` to exit codes + output.
- **No swallowed errors** — every `catch` must either re-throw, log with
  context, or explicitly handle. Empty `catch (e) {}` is forbidden.
- **Errors carry context** — `pageId`, `sourcePath`, `operation`, `cause`. The
  redaction layer strips any secret material before output.

## IO boundaries

### Every external boundary uses runtime validation

| Boundary | Validator | Type |
|---|---|---|
| Config file load | `ajv` (JSON Schema) | `ProjectConfig`, `TargetConfig` |
| Lock file load | `ajv` (JSON Schema) | `LockFile`, `PageBinding` |
| Confluence API response | `zod` | `ConfluencePage`, `ConfluenceVersion`, `ContentProperty` |
| CLI input (flags/args) | Cliffy built-in + `zod` | command params |
| Plan/diagnostics output | `zod` | `Plan`, `DiagnosticEntry` |

**Rule:** no unvalidated external data enters the domain layer. If data crosses
a process/system boundary, it passes through a schema.

### ESM-only

- All files use `import`/`export` (ESM). No `require()` / `module.exports`.
- File extensions: `.ts` for source, `.test.ts` for tests. No `.mts` unless
  needed for a specific Bun interop.
- `package.json` has `"type": "module"`.

## Linting and formatting

### Linter: Biome (preferred) or ESLint + Prettier

**Decision deferred to `MS-0002` implementation start.** The FSE audit
(Attribute 6) flags this as a sub-decision. The target is:

| Tool | Role | Why |
|---|---|---|
| **Biome** (preferred) | Lint + format in one tool; Rust-fast; zero config | Single tool; Bun-compatible; fewer dependencies |
| **ESLint + Prettier** (fallback) | Separate lint + format | Mature ecosystem; more plugins; heavier config |

**Whichever is chosen:**

- `bun run lint` — lint check (fails CI on errors).
- `bun run format` — format write.
- `bun run format:check` — format check (fails CI on unformatted files).
- Import-boundary enforcement: ESLint `no-restricted-imports` or Biome
  `lint/style/noRestrictedImports` to enforce tier rules (no `src/domain/**`
  importing from `src/infra/**`).

### Pre-commit hooks (optional)

- `husky` + `lint-staged` if the maintainer wants auto-format on commit.
- Not mandatory; CI catches unformatted code regardless.

## Comments

### What to comment

- **Why, not what.** Comments explain decisions, gotchas, Confluence quirks, and
  non-obvious choices. Code itself says what; comments say why.
- **ADR references.** When a non-obvious choice is load-bearing, cite the ADR:
  ```typescript
  // UUID v7 is immutable identity; duplicate detection is fatal (ADR-0006, INV-SAFE-3)
  ```
- **Integration-scenario references.** In the Confluence adapter, cite the
  relevant scenario doc:
  ```typescript
  // v2 content properties required; v1 deprecated (see doc/inception/integration-scenarios/10-content-properties.md)
  ```

### What NOT to comment

- ❌ Obvious restatements of code: `// increment i` above `i++`.
- ❌ Commented-out code (delete it; Git remembers).
- ❌ JSDoc that just restates the type signature (only add JSDoc for non-obvious
  semantics, `@throws`, `@example`).

## Dependency management

### Rules

- **Minimal dependencies.** Every new dependency must justify its weight. The
  maintainer is solo (A-VIA-2); each dep is a maintenance surface.
- **No deep dependency trees.** Prefer zero-dependency libraries (`uuid`,
  `ajv`). Flag any dep with > 20 transitive dependencies.
- **Pin major versions.** `package.json` uses `^` for minor/patch, but the lock
  file (`bun.lockb`) is committed and exact.
- **License audit.** `bun run license-audit` (via `license-checker` or
  `osv-scanner`) runs in CI. No GPL/AGPL dependencies (MarkSync is MIT).

### Allowed dependency list (target)

| Dependency | Role | Status |
|---|---|---|
| `@cliffy/command`, `@cliffy/prompt`, `@cliffy/flags` | CLI framework | Pin post smoke-test (TDR-0002) |
| `remark`, `remark-gfm`, `rehype`, `remark-rehype` | Markdown pipeline | Latest |
| `mermaid` | Diagram rendering | Latest (ADR-0002) |
| `jsdom` / `happy-dom` | Headless DOM | Latest |
| `uuid` | UUID v7 | Latest |
| `ajv` | JSON Schema validation | Latest |
| `zod` | Runtime typing | Latest |
| `pino` | Structured logging | Latest |
| `keytar` | OS keyring | Spike-gated (MS-0002 fallback: env) |

**No HTTP client library** (`axios`, `node-fetch`). Use native `fetch`.
**No crypto library.** Use native `crypto.subtle`.

## Git conventions

### Commit messages (Conventional Commits)

```
feat(state): classify three-way sync state for drift detection
fix(confluence): handle 409 as drift, not error
docs(glossary): add ADF and Storage Format entries
test(golden): add GFM table fixture
refactor(planner): extract link resolver
```

- `type(scope): description` — lowercase, imperative mood, ≤ 72 chars.
- Body explains why (not what), wrapped at 72 chars.
- Footer references: `Closes #123`, `Refs ADR-0006`, `INV-SAFE-1`.

### Branch naming

- Feature/bug: `<type>/<scope>-<slug>` (e.g., `feat/state-classifier`).
- Inception phases: `inception/phase-<N>` (established practice).
- Release: `release/v<version>`.

## See also

- [Architecture overview](../../doc/overview/architecture-overview.md) — module
  governance, dependency-direction matrix, residence rules.
- [Ubiquitous language](../../doc/overview/ubiquitous-language.md) — UL terms
  that bind to code.
- [Testing strategy](./testing-strategy.md) — test tiers, coverage, CI.
- [Security baseline](../../doc/guides/security-baseline.md) — secret management,
  redaction, dependency audit.
- [FSE audit](../../doc/inception/analysis/fse-audit.md) — AI-friendliness
  target baseline.
