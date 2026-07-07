---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: CONVENTIONS-TYPESCRIPT
status: Draft
created: 2026-07-05
last_updated: 2026-07-07
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0006, ADR-0011, TDR-0002, TDR-0003, TDR-0004, TDR-0005, TDR-0006, TDR-0008]
  related_changes: [GH-14]
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
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUncheckedSideEffectImports": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Strict-mode rules (non-negotiable)

1. **`strict: true`** — full strict mode (enables `noImplicitAny`, `strictNullChecks`,
   `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`).
2. **`verbatimModuleSyntax: true`** — enforces `import type` / `export type` for
   type-only imports. Replaces the deprecated `esModuleInterop` /
   `allowSyntheticDefaultImports` pair. Required for clean ESM output.
3. **`isolatedModules: true`** — ensures every file can be transpiled independently
   (Bun transpiles per-file). Prohibits `const enum` and re-exporting types
   without `export type`.
4. **`noUncheckedIndexedAccess: true`** — `array[i]` is `T | undefined`.
5. **`exactOptionalPropertyTypes: true`** — `{ x?: T }` does not accept
   `{ x: undefined }`.
6. **`noImplicitOverride: true`** — `override` keyword required on method
   overrides (catches base-class change surprises).
7. **`noUncheckedSideEffectImports: true`** — catches `import "something"` that
   silently does nothing if the module is missing.
8. **`types: ["bun"]`** — Bun provides native types; no separate `@types/bun`
   or `bun-types` package needed.

### When `any` is acceptable (rare)

- In test helpers, only with an explicit `// biome-ignore lint/suspicious/noExplicitAny: <reason>` comment
  explaining why.
- In third-party type shims (`.d.ts` files) where the library lacks types.
- Never in production domain/application/infrastructure code.

## Error handling

### Two-layer error strategy

MarkSync uses two complementary error patterns:

1. **`Result<T, E>` for expected failures** (domain logic, use cases) — the
   function returns either a success value or a typed error; no throw/catch.
   This is the 2026 TS consensus for explicit, exhaustive error handling.

2. **Typed `throw` for unexpected failures** (invariants violated, truly
   exceptional conditions) — discriminated-union error objects thrown to the
   application-layer boundary, which catches and converts to `CommandResult`.

```typescript
// src/domain/result.ts — the Result type
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// src/domain/errors.ts — typed domain errors (discriminated union).
// The live definition is authoritative; reproduced here for convention reference.
export type MarkSyncError =
  | { kind: "Conflict"; pageId: string; baseVersion: number; remoteVersion: number }
  | { kind: "RemoteMissing"; pageId: string }
  | { kind: "DuplicateUuid"; uuid: string; paths: string[] }
  | { kind: "UnsupportedConstruct"; construct: string; sourcePath: string }
  | { kind: "Forbidden"; pageId: string; operation: string }
  | { kind: "LockDirty"; path: string }
  | { kind: "ConcurrentWrite"; lockPath: string }
  | { kind: "RenderUnavailable"; renderer: string; cause: string }
  | { kind: "StalePlan"; operationId: string; expiredAt: string }
  | { kind: "ForbiddenBranch"; branch: string; allowed: string[] }
  | { kind: "TooLarge"; pageId: string; what: string }
  | { kind: "UnresolvedLink"; sourcePath: string; target: string };

// The exhaustive `never`-check lives alongside the union as
// `assertNeverMarkSyncError(error)` — switching over every `kind` so adding a
// future kind is a compile error until every handler is updated.

// Usage in domain logic — return Result, don't throw for expected cases:
function classify(local: Doc, base: Base, remote: Page): Result<SyncState, MarkSyncError> {
  if (remote.notFound) return { ok: false, error: { kind: "RemoteMissing", pageId: remote.id } };
  // ...
  return { ok: true, value: SyncState.LOCAL_AHEAD };
}

// Usage at the application boundary — catch unexpected throws:
try {
  const result = await pushExecutor.apply(plan);
  if (!result.ok) return toCommandResult(result.error);
  return { exitCode: 0, data: result.value };
} catch (e) {
  // Unexpected — log with context, redact, return generic error
  logger.error({ err: e }, "unexpected error during apply");
  return { exitCode: 1, error: "internal error" };
}
```

### Rules

- **Domain functions return `Result<T, E>`** — no throwing for expected
  failures (drift, conflict, missing page). The caller handles both branches.
- **`throw` is for invariant violations** — duplicate UUID (INV-SAFE-3),
  unreachable code, corrupted lock file. These are "should never happen" cases.
- **Exhaustive checking** — use `never` in switch statements to ensure all
  error kinds are handled:
  ```typescript
  function handle(error: MarkSyncError): never {
    switch (error.kind) {
      case "Conflict": // ...
      case "RemoteMissing": // ...
      // ... all cases ...
      default:
        const _exhaustive: never = error;
        throw new Error(`unhandled error: ${_exhaustive}`);
    }
  }
  ```
- **Catch at boundaries** — the application layer catches thrown errors and
  converts to `CommandResult<T>` (ADR-0011). The CLI output service maps
  `CommandResult` to exit codes + output.
- **No swallowed errors** — every `catch` must either re-throw, log with
  context, or explicitly handle. Empty `catch (e) {}` is forbidden.
- **Errors carry context** — `pageId`, `sourcePath`, `operation`, `cause`. The
  redaction layer strips any secret material before output.
- **No `throw new Error("string")`** in domain/infra code — use typed errors.

## IO boundaries

### Every external boundary uses runtime validation

**`zod` is the primary validator** for all IO boundaries (2026 TS consensus:
better type inference than `ajv`, single-package simplicity). `ajv` is retained
only for user-authored JSON Schema files (config/lock) where the schema is the
source of truth and the user may edit it directly.

| Boundary | Validator | Type | Rationale |
|---|---|---|---|
| Config file load | `ajv` (JSON Schema) | `ProjectConfig`, `TargetConfig` | User-authored schema; ajv emits human-readable errors |
| Lock file load | `ajv` (JSON Schema) | `LockFile`, `PageBinding` | Same — schema is the source of truth |
| Confluence API response | `zod` | `ConfluencePage`, `ConfluenceVersion`, `ContentProperty` | Type inference; programmatic schema |
| CLI input (flags/args) | Cliffy built-in + `zod` | command params | Type inference; composable |
| Plan/diagnostics output | `zod` | `Plan`, `DiagnosticEntry` | Type inference; output schema |

> **Zod-first principle:** for any schema that is code-owned (not user-edited),
> use `zod` — it gives end-to-end TypeScript type inference via `z.infer<typeof
> schema>`. Use `ajv` only when the schema file itself is a user deliverable
> (config/lock JSON Schema).

**Rule:** no unvalidated external data enters the domain layer. If data crosses
a process/system boundary, it passes through a schema.

### ESM-only

- All files use `import`/`export` (ESM). No `require()` / `module.exports`.
- File extensions: `.ts` for source, `.test.ts` for tests. No `.mts` unless
  needed for a specific Bun interop.
- `package.json` has `"type": "module"`.
- Use `"exports"` field for public API surface; use `"imports"` field for
  internal path aliases (preferred over tsconfig `paths`):

```jsonc
// package.json
{
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "imports": {
    "#domain/*": "./src/domain/*",
    "#app/*": "./src/app/*",
    "#infra/*": "./src/infra/*",
    "#shared/*": "./src/shared/*"
  }
}
```

> **Why `"imports"` over tsconfig `paths`?** The Node/Bun `"imports"` field is
> respected at runtime (no build-time path rewriting needed), works in
> `bun build --compile`, and is the ESM standard. tsconfig `paths` requires a
> bundler resolver step.

### Bun configuration (`bunfig.toml`)

```toml
# bunfig.toml
[test]
# Test root and discovery
root = "tests"

# Mermaid-DOM preload — registers happy-dom global registrant before tests.
# This ensures Mermaid tests work without passing --preload on every invocation.
preload = ["./tests/mermaid.preload.ts"]

# Coverage (target thresholds — adjust based on MS-0002 baseline)
coverage = true
coverageThreshold = { lines = 0.80, functions = 0.80 }
coverageDir = "./coverage"
```

> **`bunfig.toml` vs CI flags:** `bunfig.toml` is the single source of truth for
> test configuration. CI commands (`bun test`) pick it up automatically. The
> `preload` entry ensures Mermaid-DOM tests work without passing `--preload` on
> every invocation.

## Linting and formatting

### Linter: Biome

**Biome** is the linter/formatter — single tool for lint + format, Rust-fast,
zero config.

| Tool | Role | Why |
|---|---|---|
| **Biome** (preferred) | Lint + format in one tool; Rust-fast; zero config | Single tool; Bun-compatible; 500+ rules; 10-100x faster than ESLint+Prettier |
| **dependency-cruiser** | Module-boundary enforcement | Purpose-built for architecture rules; Biome lacks this capability |
| ESLint + Prettier (fallback) | Separate lint + format | Mature ecosystem; more plugins; heavier config — use only if Biome lacks a needed rule |

**Scripts:**

- `bun run lint` — lint check (fails CI on errors).
- `bun run format` — format write.
- `bun run format:check` — format check (fails CI on unformatted files).
- `bun run check:boundaries` — dependency-cruiser architecture check (fails CI on tier violations).

### Import-boundary enforcement (dependency-cruiser)

**dependency-cruiser** is the module-boundary enforcement tool — purpose-built
for architecture rules, rules-as-code, and clear violation feedback for AI
agents.

```jsonc
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: "domain-may-not-import-infra",
      from: { path: "src/domain/" },
      to: { path: "src/infra/" }
    },
    {
      name: "domain-may-not-import-app",
      from: { path: "src/domain/" },
      to: { path: "src/app/" }
    },
    {
      name: "presentation-may-not-import-domain",
      from: { path: "src/cli/" },
      to: { path: "src/domain/" }
    },
    {
      name: "presentation-may-not-import-infra",
      from: { path: "src/cli/" },
      to: { path: "src/infra/" }
    }
  ]
};
```

### Pre-commit hooks

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
  file (`bun.lock` or legacy `bun.lockb`) is committed and exact.
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
**No coloring library** (`chalk`). If direct coloring is needed (the output
service handles this centrally per ADR-0011), use `picocolors` — lightweight and
fast.

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
