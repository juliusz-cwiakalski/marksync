---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: CONVENTIONS-TYPESCRIPT
status: Draft
created: 2026-07-05
last_updated: 2026-07-09
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0006, ADR-0011, TDR-0002, TDR-0003, TDR-0004, TDR-0005, TDR-0006, TDR-0008]
  related_changes: [GH-14, GH-15, GH-16, GH-18, GH-20]
  summary: "TypeScript + Bun conventions — module structure, naming, error handling, IO boundaries, linting, formatting for MarkSync."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# TypeScript Conventions

_Coding conventions for MarkSync. All agents (@coder, @plan-writer, reviewers)
must load and follow this file. Implements the FSE-audit target baseline
(explicit typing, SRP modules, conventions over configuration, semantic naming,
contextual comments)._

## Code style principles

_MarkSync code is **AI-authored and human-reviewed**. Optimize for the reader
scanning a file: code first, minimal prose, self-documenting structure. These
principles are enforced by @reviewer and override any contrary built-in
heuristic._

1. **The code is the documentation.** Types, names, and structure carry the
   meaning. Before writing a comment, ask whether a clearer name, tighter type,
   or extracted helper would make the comment unnecessary. Add a comment only
   when the code genuinely cannot express the intent.

2. **Minimal file headers — at most 3 lines.** State what the module is and, if
   a load-bearing decision governs it, link the spec/ADR once. No tier-rule
   essays, no design-decision restatements, no ASCII tables. The spec is the
   source of truth; the source cites it, never duplicates it.

3. **Trust the types — no signature restatements.** If the signature is
   `function ok<T>(data: T): CommandResult<T>`, a JSDoc saying "Build a success
   CommandResult" is noise. Reserve JSDoc for non-obvious semantics: `@throws`,
   `@example`, or an invariant invisible from the type.

4. **References provide context, not compliance tags.** Comments SHOULD
   reference docs, specs, ADRs, requirements, or tickets (`GH-16`, `ADR-0006`,
   `INV-SAFE-3`) when the reference helps the reader understand a non-obvious
   decision — e.g. _"redact the serialized string, not the typed object — a
   token nested in `data` is only exposed after `JSON.stringify` (ADR-0011
   C-5)"_. What is forbidden is scattering bare code tags — `(DEC-1)`,
   `(NFR-OBS-1)`, `(AC-6)` — as silent compliance markers on every function and
   field without explaining anything. One substantive reference at the
   load-bearing point beats ten bare tags.

5. **Every comment earns its place.** A comment must explain something the code
   cannot: a Confluence API quirk, an ordering constraint, a security boundary,
   a "why this looks weird" note, or a pointer to the requirement that drove
   the design. If removing the comment leaves the code equally understandable,
   delete it.

6. **Boy scout rule.** When you touch a file for any reason, bring its header
   into compliance (≤ 3 lines, trim bare tags). Do not mass-rewrite untouched
   files — migrate opportunistically as part of normal work.

7. **Explicit typing at boundaries, inference for locals.** All exported
   functions have annotated return types and parameter types. Locals use
   inference — the type is obvious from the initializer. This resolves the
   tension between "explicit typing" (FSE-audit) and "let TS infer" (reviewer
   ignore list).

### Before / after

**Anti-pattern** (over-documented header — what NOT to produce):

```typescript
// src/cli/output/exit-codes.ts
//
// Stable process exit codes + the stable `error.code` string → exit-code map
// (GH-16 D-5 / DEC-1 / DEC-2 / NFR-OBS-1). This module is PURE DATA: it
// imports NO tier — not `#domain/*`, not `#infra/*`, not even a sibling output
// module. Nothing at all.
//
// DEC-1 (the load-bearing architecture constraint): `MarkSyncError.kind` is
// translated to the stable `error.code` string by the APPLICATION tier ...
// [30 more lines restating the spec]

/** Exit-code numeric constants — the 9 classes (spec F-5 / NFR-OBS-1). */
export const EXIT_OK = 0;
```

**Target** (self-documenting — what to produce):

```typescript
// Map stable error-code strings to process exit codes (ADR-0011).

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
// ...
```

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
8. **`types: ["bun"]`** — Bun provides native types. `@types/bun` is in
   devDependencies for editor/IDE resolution; if Bun's bundled types suffice
   in your environment, the devDependency can be removed.

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
// (`ConfigAjvError`, carried by the `InvalidConfig` arm, is defined in errors.ts.)
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
  | { kind: "UnresolvedLink"; sourcePath: string; target: string }
  // Config-failure arm (GH-15): invalid marksync.yml. Carries the config path,
  // the structured ajv errors (ConfigAjvError[]), and an AI-readable
  // humanMessage (field path + expected vs actual + suggested fix).
  | { kind: "InvalidConfig"; path: string; ajvErrors: ConfigAjvError[]; humanMessage: string };

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
- **Error message stability** — `error.code` is a stable contract (DEC-6);
  machine consumers must key on `code` only. `error.message` is advisory
  human-readable prose and may change between versions.
- **Adding a `MarkSyncError` kind** — add a new kind only when the recovery
  action differs from all existing kinds. If the user would take the same
  action for two errors, they are the same kind. When adding a kind: update
  `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, `CODE_TO_EXIT`,
  and the DEC-2 table in the same PR.

### Logging conventions

- **Never log raw `MarkSyncError` objects** — log only structural identifiers
  (`{ kind, code }`). Fields like `cause`, `path`, `sourcePath`, `humanMessage`,
  `ajvErrors` carry sensitive data that the redaction layer was designed to
  keep out of output; serializing the full error to a log bypasses that design.
- **Logs go to stderr only** — stdout is reserved for `--json` / machine output.
- **Correlate with `runId`** — every log entry should carry the `CommandResult`
  `runId` so logs are traceable to a specific run (NFR-OBS-2).
- **The redaction layer applies to log output too** — or logs never serialize
  error objects (defense in depth on top of the "never log raw errors" rule).

## IO boundaries

### Every external boundary uses runtime validation

**`zod` is the primary validator** for all IO boundaries (2026 TS consensus:
better type inference than `ajv`, single-package simplicity). `ajv` is retained
only for user-authored JSON Schema files (config/lock) where the schema is the
source of truth and the user may edit it directly.

> **Note:** `zod` is planned but not yet installed — install when the first
> consuming story lands (MS-0002 E3). Until then, use `unknown` + manual
> narrowing with a TODO.

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
    "#shared/*": "./src/shared/*",
    "#cli/*": "./src/cli/*.ts",
    "#cli/output": "./src/cli/output/index.ts"
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
// .dependency-cruiser.cjs — all forbidden tier directions (see tier table above)
module.exports = {
  forbidden: [
    { name: "domain-may-not-import-infra",   from: { path: "src/domain/" }, to: { path: "src/infra/" } },
    { name: "domain-may-not-import-app",     from: { path: "src/domain/" }, to: { path: "src/app/" } },
    { name: "domain-may-not-import-cli",     from: { path: "src/domain/" }, to: { path: "src/cli/" } },
    { name: "app-may-not-import-cli",        from: { path: "src/app/" },    to: { path: "src/cli/" } },
    { name: "infra-may-not-import-app",      from: { path: "src/infra/" },  to: { path: "src/app/" } },
    { name: "infra-may-not-import-cli",      from: { path: "src/infra/" },  to: { path: "src/cli/" } },
    { name: "presentation-may-not-import-domain", from: { path: "src/cli/" }, to: { path: "src/domain/" } },
    { name: "presentation-may-not-import-infra",  from: { path: "src/cli/" }, to: { path: "src/infra/" } },
    { name: "shared-may-not-import-any-tier", from: { path: "src/shared/" }, to: { path: "src/domain/ src/app/ src/infra/ src/cli/" } }
  ]
};
```

### Pre-commit hooks

- `husky` + `lint-staged` if the maintainer wants auto-format on commit.
- Not mandatory; CI catches unformatted code regardless.

## Comments

### What to comment

- **Why, not what.** Comments explain decisions, gotchas, Confluence quirks, and
  non-obvious choices — never restate what the code already says.
- **Contextual references are encouraged.** Comments SHOULD reference docs,
  specs, ADRs, requirements, invariants, or tickets (`GH-16`, `ADR-0006`,
  `INV-SAFE-3`, `chg-GH-16-spec.md §5`) when the reference helps the reader
  understand a non-obvious decision. The reference must accompany a substantive
  explanation, not stand alone as a bare tag:
  ```typescript
  // Redact the serialized string, not the typed object — a token nested in
  // `data` is only exposed after JSON.stringify (ADR-0011 C-5, INV-SEC-1).
  out = redactString(rendered);
  ```
  This is good: the reader learns WHY redaction targets the string and WHERE to
  read the full rationale.
- **Integration-scenario references.** In the Confluence adapter, cite the
  relevant scenario doc where it changes how you read the code:
  ```typescript
  // v2 content properties required; v1 deprecated for this path.
  ```

### What NOT to comment

- ❌ **File-header essays.** A header that restates the spec, lists tier rules,
  embeds an ASCII table, or cites more than one authority is too long. Cap at
  3 lines; link the spec/ADR for the rest.
- ❌ **Bare alphabet-soup tags.** Scattering `(DEC-1)`, `(NFR-OBS-1)`,
  `(AC-6)`, `(RSK-4)` as silent compliance markers on every line — without
  explaining anything — turns code into a compliance document. A reference
  must carry context; a bare tag is noise. Cite the authority once, with
  explanation, at the load-bearing point.
- ❌ **Signature restatements in JSDoc.** `/** Resolve the output format. */`
  above `function resolveOutputFormat(...)` adds zero information. Use JSDoc
  only for `@throws`, `@example`, or non-obvious invariants.
- ❌ **Field-name echoes.** `/** --quiet — suppress non-error output */` on a
  field named `quiet: boolean` is pure noise. The name + type already say it.
- ❌ **Obvious restatements of code:** `// increment i` above `i++`.
- ❌ **Commented-out code** (delete it; Git remembers).
- ❌ **Duplicating spec/ADR content in source.** If a table, decision matrix,
  or rationale paragraph lives in the spec, do not copy it into a comment.
  Link it: `// see chg-GH-16-spec.md §5`.

## Code quality patterns

_Concrete patterns that recur in MarkSync code. Each has a correct form and an
anti-pattern form — @reviewer flags the anti-patterns._

### One import statement per module

With `verbatimModuleSyntax: true`, combine type-only and value imports from the
same module into a single statement using inline `type` modifiers.

```typescript
// ❌ Two statements from the same module
import type { CommandResult } from "#cli/output";
import { err, ok } from "#cli/output";

// ✅ One statement, inline type modifier
import { type CommandResult, err, ok } from "#cli/output";
```

### No magic strings for stable codes

Error codes, exit codes, and other stable string identifiers must be defined as
`as const` objects or string literal union types — never scattered as bare
string literals. A typo in a bare string (`"CONFLIT"`) silently falls through to
a fallback instead of producing a compile error.

```typescript
// ❌ Bare string literals — typo-prone, no compile-time safety
return err("INTERNAL", "sync is not yet implemented", false);

// ✅ Const object + derived union type
export const ERROR_CODES = {
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
  USAGE: "USAGE",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
```

### Conditional spread over mutation for optional properties

When constructing objects with `exactOptionalPropertyTypes: true`, prefer
conditional spread over mutation-after-construction. The spread is a single
expression with no intermediate mutable variable.

```typescript
// ❌ Mutation after construction — extra variable, imperative style
const result: CommandResult<T> = { schemaVersion: 1, exitCode: 0, data };
if (meta?.timing) result.timing = meta.timing;
if (meta?.warnings) result.warnings = meta.warnings;
return result;

// ✅ Conditional spread — single expression, no mutation
return {
  schemaVersion: SCHEMA_VERSION,
  exitCode: EXIT_OK,
  data,
  ...(meta?.timing ? { timing: meta.timing } : {}),
  ...(meta?.warnings ? { warnings: meta.warnings } : {}),
};
```

### Tests use import aliases, not deep relative paths

Tests must use the `#`-prefixed import aliases defined in `package.json`
`"imports"` — not `../../../../src/...` relative paths. Relative paths break
when files move and are inconsistent with production code.

```typescript
// ❌ Fragile deep relative path
import { redactString } from "../../../../src/cli/output/redact.ts";

// ✅ Import alias (resolves via package.json "imports")
import { redactString } from "#cli/output/redact";
```

### Simplify trivially derivable logic

If a function maps union members to themselves or returns a value already
derivable from the input type, simplify. Don't enumerate every case when the
type system already constrains the output.

```typescript
// ❌ Redundant enumeration — output is already derivable from the type
function resolveOutputFormat(flags: GlobalCommandFlags): OutputFormat {
  if (flags.json) return "json";
  if (flags.output === "ndjson") return "ndjson";
  if (flags.output === "json") return "json";
  return "human";
}

// ✅ Simplified — flags.output is already typed as OutputFormat | undefined
function resolveOutputFormat(flags: GlobalCommandFlags): OutputFormat {
  if (flags.json) return "json";
  return flags.output ?? "human";
}
```

### Fragile runtime patterns require a justifying comment

When code relies on a fragile runtime mechanism (string-based class detection,
implicit global availability, hardcoded version strings), a comment must explain
what would break and why no safer alternative exists:

```typescript
// Cliffy doesn't export UnknownCommandError; detect by name + exitCode.
// Breaks under minification — acceptable because bun build --compile preserves names.
function isCliffyParseError(e: Error): boolean { ... }
```

### Structural type duplication across tier boundaries

When the architecture matrix forbids cross-tier imports (e.g. app may not import
presentation), the same structural type may be defined independently in two
tiers. This is acceptable IF:
- each definition carries a one-line comment noting the duplication and the
  constraint that forces it;
- a structural compatibility test asserts the two shapes stay in sync.

```typescript
// Structurally identical to CommandResultError in src/cli/output — duplicated
// because application may not import presentation (ADR-0011 tier matrix).
export interface ResultError { code: string; message: string; retryable: boolean; }
```

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

### Allowed dependency list

**Installed:**

| Dependency | Role |
|---|---|
| `@jsr/cliffy__command`, `@jsr/cliffy__flags` | CLI framework (TDR-0002) |
| `ajv` | JSON Schema validation (config/lock) |
| `picocolors` | Terminal coloring (ADR-0011 C-2) |
| `yaml` | YAML parsing (`marksync.yml` + front-matter) |
| `remark`, `remark-gfm`, `remark-rehype` | Markdown pipeline — bytes → MDAST → HAST → Storage (GH-20; `rehype` is transitive via `remark-rehype`, not a direct dep) |
| `uuid` | UUID v7 generation (`v7`, `src/domain/identity/uuid.ts`; GH-18) |

> **Type-only devDependencies** (zero runtime surface): `@types/hast`,
> `@types/mdast` (HAST/MDAST type models for the markdown pipeline; GH-20).

**Planned (not yet installed — install when the first consuming story lands):**

| Dependency | Role | Milestone |
|---|---|---|
| `mermaid` | Diagram rendering (ADR-0002) | MS-0002 E4-S1 |
| `jsdom` / `happy-dom` | Headless DOM for Mermaid tests | MS-0002 E4-S1 |
| `zod` | Runtime validation at IO boundaries | MS-0002 E3 |
| `pino` | Structured logging | MS-0002 |
| `keytar` | OS keyring (fallback: env) | Spike-gated |

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
