---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-16
  type: feat
  status: Proposed
  slug: cli-framework
  title: "[MS2-E2-S3] CLI framework + CommandResult<T> — hybrid output pipeline, centralized redaction, stable exit codes, Cliffy skeleton"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E2, foundation, critical]
  version_impact: minor
  audience: internal
  security_impact: medium
  risk_level: medium
  dependencies:
    internal: [MS2-E2-S1 (GH-14), MS2-E2-S2 (GH-15), MS2-E3 (blocked), MS2-E5-S2 (blocked)]
    external: [Cliffy (@cliffy/command, @cliffy/flags), picocolors]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Stand up the ADR-0011 hybrid CLI output pipeline ONCE, centrally — a structured `CommandResult<T>` type, a generic JSON renderer, a generic human renderer with an optional per-command formatter registry, a centralized redaction layer enforced on every output path, stable exit codes, and non-interactive color auto-detection — wired behind a Cliffy command skeleton with global flags and stub handlers, so that every future MarkSync command (init, plan, sync, doctor, repair-state) produces machine-parseable JSON and human-readable output through a single chokepoint that no command can bypass and that no secret can leak through.

## 1. SUMMARY

This is the **third story of epic MS2-E2 (Foundation)** and the presentation/output backbone of MS-0002. It builds the entire CLI output pipeline described by ADR-0011 (Alternative 3 — the only design satisfying all five constraints): every command returns a typed `CommandResult<T>`; a **generic JSON renderer** serializes any result to machine output automatically (zero per-command code); a **generic human renderer** provides a sensible default (key-value/table) with an **optional per-command formatter registry** for richer output; a **centralized redaction layer** scrubs secrets from every output path before write; **stable exit codes** are mapped per error class; and **non-interactive color auto-detection** disables color in CI/piped/non-TTY contexts.

It also wires the **Cliffy command skeleton** (TDR-0002): global flags (`--json`/`--output={json,ndjson,human}`/`--color`/`--no-color`/`--quiet`), stub command handlers for `init`/`plan`/`sync`/`doctor`/`repair-state` that each return a placeholder `CommandResult`, and a real entrypoint that parses args → routes → executes → emits → exits. The security-critical invariant **INV-SEC-1** (no secret in any output) is enforced HERE, centrally, so no later command can bypass redaction or skip JSON. Real command logic is out of scope (later stories); this story wires the framework and the contract.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-14 (MS2-E2-S1) and GH-15 (MS2-E2-S2) are merged.** The codebase has the strict TS+Bun toolchain (Biome, dependency-cruiser tier enforcement with `severity: error`, commitlint, binding CI), the `Result<T, E>` primitive (`src/domain/result.ts`), and the exhaustive **13-kind** `MarkSyncError` discriminated union with its `assertNeverMarkSyncError` `never`-check (`src/domain/errors.ts` — incl. the GH-15 `InvalidConfig` arm).
- **No output pipeline exists.** `src/cli/` holds only a trivial `index.ts` (`console.log("marksync 0.1.0")`) and `src/cli/commands/init.ts` (the GH-15 config-scaffolding handler). `src/cli/output/` is an empty `.gitkeep` directory — this story fills it. There is no `CommandResult<T>`, no JSON/human renderer, no redaction layer, no exit-code map, no color policy, no command router, and no `OutputService`.
- **ADR-0011 is the load-bearing decision.** It mandates Alternative 3 (hybrid: structured result + generic JSON + optional per-command human formatter + centralized redaction) as the only design satisfying C-1 (auto-JSON for every command), C-2 (auto-decolor in non-interactive), C-3 (no central coupling when adding a command), C-4 (stable versioned schema), and C-5 (redaction on all paths). All five are non-negotiable.
- **TDR-0002 fixes Cliffy 1.x** (`@cliffy/command` + `@cliffy/flags`; `@cliffy/prompt` deferred to when interactive `init`/`doctor` land). Cliffy is confined to `src/cli/` (presentation tier); the JSON/exit-code contracts are owned by MarkSync, not the framework. The exact version is pinned after a `bun build --compile` smoke test.
- **The presentation tier may NOT import the domain tier.** `.dependency-cruiser.cjs` rule `presentation-may-not-import-domain` (severity `error`) forbids `src/cli/` → `src/domain/`. `MarkSyncError` lives in `src/domain/errors.ts`. The GH-15 `init.ts` established the precedent: the presentation handler uses `Result` *structurally* (via the application helper's return signature) **without naming any domain type**.
- **typescript.md fixes the color library.** `picocolors` (not `chalk`) for any direct coloring, handled centrally by the output service per ADR-0011. `@cliffy/command`, `@cliffy/flags`, and `picocolors` are all on the allowed-dependency list.
- **CEO-resolved questions are binding.** Q1: JSON wire format uses **snake_case** (blueprint §9). Q2: errors use a top-level `error: { code, message, retryable }` where `message` is a stable, redacted, human-readable string (never raw exception text, file paths, or partial request bodies). R1: over-redaction is bounded by specific patterns; a 40-char hex SHA must NOT be redacted.

### 2.2 Pain Points / Gaps

- **No machine-readable output contract.** Without `CommandResult<T>` and a generic JSON renderer, there is no stable schema for CI pipelines or AI coding agents to parse — every command would hand-format output ad hoc, with inevitable drift.
- **No centralized redaction chokepoint.** INV-SEC-1 (no secret in any output) cannot be enforced "by convention"; without a single output path that all commands pass through, any future command could forget to redact and leak a token into stdout, JSON, or an error message.
- **No stable exit codes.** NFR-OBS-1 requires documented, machine-parseable exit codes per error class. Today `process.exit` is called nowhere meaningful; handlers have no stable contract to map failures to.
- **No color/auto-detect story.** NFR-A11Y-1 (no color dependency; auto-disable in non-interactive) and NFR-A11Y-2 (plain-log/screen-reader mode) require a color policy module that detects piped stdout / `CI` / `NO_COLOR` / `TERM=dumb` and respects `--color`/`--no-color`. None exists.
- **No command router / framework wiring.** The CLI has no real entrypoint, no global flags, and no command skeleton for the five subcommands — later stories (plan/sync/doctor/repair-state) have nothing to plug into.
- **A tier-rule tension in the story's file-path hints.** The story scope item 5 places "Map `MarkSyncError.kind → exitCode`" in `src/cli/output/exit-codes.ts`, but that would require `src/cli/` to import `src/domain/errors.ts` — a `severity: error` dep-cruiser violation. This must be resolved by design (DEC-1) before delivery.

## 3. PROBLEM STATEMENT

Because there is no centralized CLI output pipeline, no `CommandResult<T>` contract, no enforced redaction layer, no stable exit-code map, and no command router, no future MarkSync command can reliably produce machine-parseable JSON and safe human output through a single non-bypassable path — and a secret could leak into any output format the moment a command forgets to scrub — so this story must build the entire ADR-0011 hybrid pipeline once, centrally, behind a Cliffy skeleton, before any real command logic (MS2-E3) can be delivered.

## 4. GOALS

- **G-1**: Define the `CommandResult<T>` structured-result type — the single typed wrapper every command returns, carrying schema version, run ID, exit code, optional timing, optional command-specific `data`, optional `error: { code, message, retryable }`, and optional `warnings` — with a **stable snake_case JSON wire shape** (CEO Q1).
- **G-2**: Deliver a **generic JSON renderer** that serializes any `CommandResult<T>` to valid JSON (stable key order) or NDJSON (streaming) with zero per-command code (ADR-0011 C-1).
- **G-3**: Deliver a **generic human renderer** (key-value/table fallback) plus a `registerHumanFormatter<T>(command, fn)` registry so a command may optionally provide richer output without central coupling (C-3).
- **G-4**: Deliver a **centralized `Redactor`** with specific secret patterns, applied to ALL output (JSON + human) before write — the single enforcement point for INV-SEC-1 / NFR-SEC-2 (C-5).
- **G-5**: Define **stable exit codes** per error class (0/2/10/20/30/40/50/70/99) and a stable `error.code` string contract, with the domain-to-code translation placed in the tier that is permitted to import the domain (DEC-1).
- **G-6**: Deliver a **color policy** (picocolors) with non-interactive auto-detection (piped stdout / `CI` / `NO_COLOR` / `TERM=dumb`) and `--color`/`--no-color` overrides (C-2, NFR-A11Y-1/A11Y-2).
- **G-7**: Deliver the **`OutputService`** — the single chokepoint: given a `CommandResult<T>` + selected format + color policy → redact → render → write stdout/stderr → return the exit code.
- **G-8**: Wire the **Cliffy command skeleton** with global flags and stub handlers for `init`/`plan`/`sync`/`doctor`/`repair-state` returning placeholder `CommandResult`s, plus a real entrypoint.
- **G-9**: Pin a **contract test** asserting the JSON output shape is stable across changes.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Redaction completeness | a synthetic token-shaped string placed in any `CommandResult` field yields emitted output containing **0** token matches (verified by grep on captured stdout) |
| Over-redaction guard | a 40-char hex SHA placed in output is **NOT** redacted (specific patterns do not match hex) |
| JSON validity | every stub command's `--json` output parses as valid JSON and matches the pinned snapshot |
| Auto-decolorization | piped output contains **0** ANSI color codes; `--color` forces ≥1; `--no-color` always disables |
| Plain-log mode | `--no-color --output=human` produces output with **0** box-drawing chars and **0** ANSI codes |
| Zero central coupling | adding a new stub command requires **0** changes to the JSON/human/redact modules |
| Exit-code stability | a synthetic `{ error: { code: "CONFLICT" } }` → process exits **30** |
| Quality gate | `bun run check` (lint + typecheck + test + boundaries) exits **0**; contract test exits 0 |

### 4.2 Non-Goals

- **NG-1**: Real command logic for `plan`/`sync`/`doctor`/`repair-state` — those are later stories (MS2-E3, MS2-E5-S2, etc.). This story wires the framework and stub handlers only.
- **NG-2**: NDJSON streaming for `sync --watch` — watch mode is post-MS-0002. The `renderNdjson` renderer is wired, but no watch command is added.
- **NG-3**: Per-command human formatters for every command — each command's rich formatter lands with that command. This story provides the generic fallback + the registration mechanism, plus at most one demonstrative registration for the contract test.
- **NG-4**: Interactive prompts (`@cliffy/prompt`) — deferred until interactive `init`/`doctor` stories land.
- **NG-5**: Reconsidering ADR-0011 / TDR-0002 / the picocolors-over-chalk rule. These are settled decisions being **implemented**, not reopened.
- **NG-6**: The ADR-0011 record's open camelCase-vs-snake_case checkbox is a **phase 7 doc-sync** task (`@doc-syncer`), not a spec or delivery concern — snake_case is already CEO-resolved and binding here.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | `CommandResult<T>` structured-result contract | The single typed wrapper every command returns; carries schema version, run ID, exit code, optional timing, optional command-specific `data`, optional `error`, and optional `warnings`. The stable **snake_case** JSON wire shape that all CI/agent consumers depend on (ADR-0011 C-4). |
| F-2 | Generic JSON renderer | Serializes any `CommandResult<T>` to valid JSON (stable key order, snake_case) and NDJSON (one object per line, for streaming) with **zero** per-command code. Satisfies C-1. |
| F-3 | Generic human renderer + per-command formatter registry | Default key-value/table rendering for any result; `registerHumanFormatter<T>(command, fn)` for optional rich output. Unregistered commands use the fallback. Satisfies C-3. |
| F-4 | Centralized redaction layer | A `Redactor` with specific secret patterns (Bearer, `ATATT…`, `gho_…`, `MARKSYNC_*_TOKEN` values >20 chars, emails in auth/error context) applied to ALL output before write. The single enforcement point for INV-SEC-1 / NFR-SEC-2. Satisfies C-5. |
| F-5 | Stable exit-code map + stable `error.code` strings | Numeric exit codes per error class (0/2/10/20/30/40/50/70/99) plus stable presentation-layer `error.code` strings; the domain-to-code translation is placed in the application tier to respect dep-cruiser rules (DEC-1). Satisfies NFR-OBS-1. |
| F-6 | Color policy + non-interactive detection | picocolors-based color that auto-disables on piped stdout / `CI` / `NO_COLOR` / `TERM=dumb`, with `--color`/`--no-color` overrides. Satisfies C-2 / NFR-A11Y-1/A11Y-2. |
| F-7 | `OutputService` (single chokepoint) | Given a `CommandResult<T>` + selected format + color policy → redact → render → write stdout/stderr → return the exit code. The one path no command can bypass. |
| F-8 | Cliffy command skeleton + global flags | The command router with global flags `--json`/`--output={json,ndjson,human}`/`--color`/`--no-color`/`--quiet`; stub handlers for `init`/`plan`/`sync`/`doctor`/`repair-state` returning a placeholder `CommandResult`. |
| F-9 | CLI entrypoint | The real `index.ts`: parse args → route → execute handler → `OutputService.emit(result)` → `process.exit(result.exitCode)`. |
| F-10 | Contract test (pinned JSON snapshot) | A pinned-schema snapshot asserting the `CommandResult` JSON shape is stable (snake_case, stable key order) across changes. Satisfies ADR-0011 C-4 verification. |

### 5.1 Capability Details

- **F-1 (`CommandResult<T>`).** Every command returns this wrapper. The TypeScript type uses camelCase internally (TS convention); the **JSON wire format uses snake_case** (DEC-2 / CEO Q1) — the JSON renderer performs the conversion. The contract shape is:

  - `schema_version: 1` — a constant pinning the wire schema for contract stability (C-4); breaking changes require a bump.
  - `run_id` — a stable identifier on every result (NFR-OBS-2) so CI/agent consumers can correlate a run across logs.
  - `exit_code` — the numeric exit code (0–99) carried on the result itself; the entrypoint reads it for `process.exit()`.
  - `timing?` — optional `{ started_at, duration_ms }` for observability.
  - `data?: T` — command-specific success payload; `T` is generic (the type the JSON renderer serializes via reflection/stringify, no per-command code).
  - `error?: { code, message, retryable }` — present only on failure. `code` is a **stable presentation-layer string** (DEC-6) such as `"CONFLICT"` or `"INVALID_CONFIG"`; `message` is a stable, **redacted**, human-readable string (never raw exception text, file paths, or request bodies — CEO Q2); `retryable` is a boolean the caller/agent can act on. Exactly one of `data`/`error` is the meaningful payload.
  - `warnings?: [{ code, message }]` — non-fatal advisories surfaced alongside success data.

  The type must be expressive enough for all future commands (plan diffs, health tables, sync summaries) — a recognized consequence (RSK-5), mitigated by `T` being generic and the per-command formatter registry (F-3).

- **F-2 (JSON renderer).** `renderJson(result)` produces a single JSON string with **stable key order** (so snapshots are deterministic) and snake_case keys. `renderNdjson(result | result[])` emits one JSON object per line for streaming. Both operate on any `CommandResult<T>` via serialization — there is no per-command JSON code, so every command gets JSON output for free (C-1). The renderer owns the camelCase→snake_case key conversion (DEC-2). NDJSON is wired now for future streaming commands but no `--watch` command is added (NG-2).

- **F-3 (Human renderer + registry).** The generic human renderer renders any `CommandResult<T>` as key-value pairs or a simple table — the default when no formatter is registered. `registerHumanFormatter<T>(command, fn)` lets a command register `(result: CommandResult<T>) => string` for richer output (colored diff, multi-section report). The registry is **per-command and additive**: registering or not registering a formatter is the only thing a command does for human output; it never touches the JSON renderer or redaction layer. This is the C-3 guarantee (adding a command requires zero changes to central output modules — AC-F7-1).

- **F-4 (Redaction layer).** The `Redactor` is applied to the **serialized output** (the JSON string and the human string) before write (DEC-4), not to the typed object. Its patterns are specific (not "any long string"):
  - `Authorization: …` / `Bearer <token>` headers → `[REDACTED]`.
  - Confluence API-token shapes (`ATATT…`).
  - GitHub token shapes (`gho_…`).
  - `MARKSYNC_*_TOKEN` env-resolved values longer than 20 chars.
  - Email addresses in auth/error context → `[REDACTED]`.
  - Replacement text is the literal `[REDACTED]`.

  **Over-redaction guard (R1 / CEO-resolved):** patterns are specific enough that a 40-char hex Git SHA does **not** match (hex shas are not `ATATT…`/`gho_…`/`Bearer …`/env-token-shaped) — verified by a unit test asserting the SHA survives redaction (AC-F4-2). This is defense in depth: credentials should never reach the output path in the first place (security-baseline.md), and the redactor is the backstop.

- **F-5 (Exit codes + `error.code`).** The stable exit-code classes (NFR-OBS-1):

  | Exit | Class | Typical `error.code` |
  |------|-------|----------------------|
  | 0 | success | (none — `data` present) |
  | 2 | usage error | `USAGE` |
  | 10 | config error | `INVALID_CONFIG` |
  | 20 | auth error | `FORBIDDEN` |
  | 30 | conflict / drift | `CONFLICT` |
  | 40 | remote-missing | `REMOTE_MISSING` |
  | 50 | invariant violation | `DUPLICATE_UUID`, `LOCK_DIRTY`, `CONCURRENT_WRITE`, `STALE_PLAN`, `FORBIDDEN_BRANCH`, `TOO_LARGE`, `UNRESOLVED_LINK` |
  | 70 | render-unavailable | `RENDER_UNAVAILABLE`, `UNSUPPORTED_CONSTRUCT` |
  | 99 | internal error | `INTERNAL` |

  The exact `MarkSyncError.kind → { code, exitCode }` assignment is realized by an exhaustive switch in the **application tier** (DEC-1). The `error.code` is a **stable presentation-layer string** (DEC-6): it is the contract the presentation tier consumes, and it never requires the presentation tier to name `MarkSyncError`.

- **F-6 (Color policy).** Color uses `picocolors` (typescript.md; not `chalk`). Non-interactive detection disables color when `!process.stdout.isTTY || process.env.CI || process.env.NO_COLOR || process.env.TERM === "dumb"`. `--color` forces color on (even in a pipe); `--no-color` forces color off (always). In plain-log mode (`--no-color --output=human`), output contains no ANSI codes and no table box-drawing characters so it is readable by screen readers and plain-log pipelines (NFR-A11Y-2).

- **F-7 (`OutputService`).** The single chokepoint: `emit(result, { format, color })` → redact (F-4) → render per format (F-2/F-3) → write to stdout (data/JSON) or stderr (errors/warnings, as appropriate) → return `result.exitCode`. No command writes to stdout/stderr directly or calls `process.exit` directly; only the entrypoint (F-9) calls `process.exit(result.exitCode)` with the value the service returns. This is the architectural guarantee that redaction and exit codes cannot be bypassed.

- **F-8 (Cliffy skeleton).** Cliffy (`@cliffy/command` + `@cliffy/flags`) provides the command router, typed flags, and generated help — confined to `src/cli/` (presentation tier; TDR-0002 mitigation 4 / dep-cruiser `presentation-may-not-import-domain|-infra`). Global flags select output format and color policy. Stub handlers for `init`/`plan`/`sync`/`doctor`/`repair-state` each return a placeholder `CommandResult` (e.g. a "not yet implemented" result with the appropriate exit code); real logic lands in later stories. The existing GH-15 `init.ts` handler is integrated into this skeleton (it already follows the tier-correct structural pattern).

- **F-9 (Entrypoint).** The real `index.ts` replaces the trivial `console.log` version: parse args (Cliffy) → route to the command handler → execute → `OutputService.emit(result)` → `process.exit(result.exitCode)`. Usage errors (unknown command, bad flags) originating in the presentation tier are constructed as `CommandResult` with `error.code: "USAGE"` and exit code 2 — without importing any domain type.

- **F-10 (Contract test).** A pinned JSON snapshot asserts the `CommandResult` wire shape is stable: snake_case keys, stable key order, the presence of `schema_version`/`run_id`/`exit_code`, and the `error: { code, message, retryable }` shape. This is the C-4 verification artifact — schema drift becomes a failing test.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Command executes and emits (success):
  Operator/CI invokes `marksync <cmd> --json`
    → Cliffy parses args + global flags → routes to command handler
    → handler returns CommandResult<T>{ data, exit_code:0, run_id, schema_version:1 }
    → OutputService.emit(result, { format:"json", color:<policy> })
      → Redactor scrubs serialized JSON → renderJson writes JSON to stdout
    → entrypoint calls process.exit(0).

Flow 2 — Command executes and emits (failure, redacted):
  Use-case returns Result.err(MarkSyncError)
    → application tier translates kind → CommandResult{ error:{ code, message:<redacted>, retryable }, exit_code }
    → OutputService.emit → Redactor scrubs → render (JSON or human) → write stderr
    → process.exit(exit_code). No raw exception/path/body in output.

Flow 3 — Non-interactive color auto-detect:
  `marksync plan | cat`  → stdout is not a TTY → color auto-disabled → 0 ANSI codes.
  `marksync plan --color | cat` → color forced on.
  `marksync plan --no-color` (even in a TTY) → color forced off.

Flow 4 — Optional per-command human formatter:
  `marksync doctor` (interactive TTY, no --json)
    → handler returns CommandResult → OutputService selects human format
    → registered formatter for "doctor" (if present) renders rich table; else generic fallback.
    → JSON path is unaffected by the formatter (C-3).

Flow 5 — Adding a new command (zero central coupling):
  Author adds a stub handler returning CommandResult<T> + registers it in the router.
    → json.ts / human.ts / redact.ts are NOT modified.
    → `--json` works automatically; generic human fallback works automatically.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The `CommandResult<T>` structured-result type with the stable snake_case JSON wire shape (F-1).
- The generic JSON renderer (`renderJson` + `renderNdjson`) with stable key order (F-2).
- The generic human renderer + `registerHumanFormatter<T>(command, fn)` registry (F-3).
- The centralized `Redactor` with specific secret patterns + the over-redaction guard (F-4).
- The stable exit-code map (9 classes) + stable `error.code` strings, with the domain-to-code translation in the application tier (F-5, DEC-1).
- The color policy (picocolors) + non-interactive auto-detection + overrides (F-6).
- The `OutputService` single chokepoint (F-7).
- The Cliffy command skeleton with global flags + stub handlers for `init`/`plan`/`sync`/`doctor`/`repair-state` (F-8).
- The real CLI entrypoint (F-9).
- The pinned contract test asserting JSON shape stability (F-10).

### 7.2 Out of Scope

- [OUT] Real command logic for `plan`/`sync`/`doctor`/`repair-state` — later stories (MS2-E3, MS2-E5-S2, etc.).
- [OUT] NDJSON streaming for `sync --watch` — watch mode is post-MS-0002; only the renderer is wired (NG-2).
- [OUT] Per-command human formatters for every command — each lands with its command; this story provides the mechanism + generic fallback only.
- [OUT] Interactive prompts (`@cliffy/prompt`) — deferred to interactive `init`/`doctor` stories.
- [OUT] Closing the ADR-0011 open camelCase/snake_case checkbox — phase 7 doc-sync (`@doc-syncer`); snake_case is already binding here.

### 7.3 Deferred / Maybe-Later

- **NDJSON as default for streaming commands** — ADR-0011 open question; revisit when `sync --watch` lands (post-MS-0002).
- **Schema-version migration machinery** — `schema_version: 1` is captured now; upgrade tooling is deferred until a v2 exists.
- **A third output format (YAML/CSV)** — ADR-0011 revisit trigger; not needed for MS-0002.
- **pino logging redaction reuse** — the `Redactor` is designed to be reusable by the logging layer (pino) in a later story; this story wires it for CLI output only.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story introduces no HTTP endpoints. It is a local CLI output pipeline consumed in-process.

### 8.2 Events / Messages

N/A — no events or messages are introduced.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `CommandResult<T>` | The structured-result wrapper every command returns: `{ schema_version, run_id, exit_code, timing?, data?:T, error?:CommandError, warnings?[] }`. TS camelCase internally; JSON wire format is snake_case (DEC-2). Exactly one of `data`/`error` is the meaningful payload. |
| DM-2 | `CommandError` | The failure payload `{ code, message, retryable }`. `code` is a **stable presentation-layer string** (DEC-6); `message` is stable + redacted (never raw exception/path/body); `retryable` is boolean. |
| DM-3 | `OutputFormat` | The format enum `{ json, ndjson, human }` selected via `--json`/`--output`. |
| DM-4 | Exit-code constants + `error.code` table | The 9 numeric exit classes (0/2/10/20/30/40/50/70/99) and the stable `error.code` strings. The numeric constants are pure values importable by any tier that needs them; the `MarkSyncError.kind → code` mapping lives in the application tier (DEC-1). |

> Note: the existing `Result<T, E>` and `MarkSyncError` primitives (GH-14/GH-15) are reused unchanged; this story adds no new domain error kind. It adds a **presentation-layer** contract (`CommandResult`/`CommandError`) and the translation from domain errors to that contract.

### 8.4 External Integrations

No external services are contacted by this story. The runtime dependencies introduced are **`@cliffy/command`** + **`@cliffy/flags`** (Cliffy 1.x — TDR-0002; exact version pinned after the `bun build --compile` smoke test) and **`picocolors`** (color policy — typescript.md allowed list, not `chalk`). All three are on the allowed-dependency list; transitive-dependency count and licenses are verified at delivery (NFR-SEC-4). Cliffy is confined to `src/cli/` (presentation tier); no application/domain/infrastructure module may import it.

### 8.5 Backward Compatibility

N/A for released artifacts — MS-0002 is pre-release (v0.0.0). This story replaces the trivial `index.ts` (`console.log("marksync 0.1.0")`) with the real entrypoint; that is an intended replacement, not a regression. The `CommandResult` JSON wire shape is the **first** version (`schema_version: 1`); it establishes the stable contract that all future CI/agent consumers depend on, and breaking changes to it require a schema-version bump (ADR-0011 C-4). The GH-15 `init.ts` handler is integrated into the new skeleton, not rewritten.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Redaction completeness | a synthetic token-shaped string (`ATATT…`, `gho_…`, `Bearer …`, a `MARKSYNC_*_TOKEN` value >20 chars) placed in **any** `CommandResult` field → emitted JSON/human output contains **0** token matches (INV-SEC-1, C-5) |
| NFR-2 | Over-redaction guard | a 40-char hex Git SHA placed in output is **NOT** redacted (specific patterns do not match hex) |
| NFR-3 | JSON validity & stability | every stub command's `--json` output parses as valid JSON and matches the pinned snapshot (snake_case, stable key order) |
| NFR-4 | Color auto-detect | piped output contains **0** ANSI codes; `--color` forces ≥1 ANSI code; `--no-color` always disables regardless of TTY (NFR-A11Y-1) |
| NFR-5 | Plain-log mode | `--no-color --output=human` produces output with **0** box-drawing chars and **0** ANSI codes (NFR-A11Y-2) |
| NFR-6 | Zero central coupling | adding a new stub command requires **0** changes to the JSON/human/redact modules (C-3) |
| NFR-7 | Exit-code stability | the `error.code → exit_code` mapping is deterministic and documented; a synthetic `{ error: { code: "CONFLICT" } }` → exit **30** (NFR-OBS-1) |
| NFR-8 | Output latency | `OutputService.emit` renders + writes a representative `CommandResult` in **≤ 10 ms (p95)** on reference hardware |
| NFR-9 | Quality gate | `bun run check` (lint + typecheck + test + boundaries) exits **0**; contract test exits 0 |
| NFR-10 | Dependency hygiene | `@cliffy/command`, `@cliffy/flags`, `picocolors` are runtime deps on the allowed list; each has **≤ 20** transitive dependencies; license-audit rejects GPL/AGPL/LGPL/UNLICENSED (NFR-SEC-4) |
| NFR-11 | Tier isolation | `presentation-may-not-import-domain` and `-infra` dep-cruiser rules pass — the presentation tier never names `MarkSyncError` (DEC-1) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 — no outbound telemetry). The relevant observability is the **structured output contract itself**: every result carries a `run_id` (NFR-OBS-2) and a stable `schema_version` (C-4), so CI/agent consumers can parse and correlate runs deterministically. Failures surface as `CommandResult.error: { code, message, retryable }` with a stable, redacted `message` and a machine-readable `code` (NFR-OBS-1/OBS-3). The `timing` field (optional) provides `started_at`/`duration_ms` for run observability. The pino logging layer's redaction is a **deferred** reuse of the `Redactor` (§7.3) — this story wires redaction for CLI output only.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Over-redaction: a legitimate value (e.g. a 40-char hex Git SHA) matches a token pattern and is scrubbed, corrupting output | M | M | Patterns are specific (`ATATT…`, `gho_…`, `Bearer …`, `MARKSYNC_*_TOKEN` value >20 chars) and do not match hex; add a unit test asserting a 40-char hex SHA is NOT redacted (NFR-2, AC-F4-2). CEO-resolved (R1). | L |
| RSK-2 | Tier violation: placing `MarkSyncError.kind → exitCode` in `src/cli/output/` triggers `presentation-may-not-import-domain` (severity `error`) and breaks the build | H | M | Place the domain-to-code translation in the **application tier** (`src/app/`), which may import domain; the presentation tier consumes only the stable `error.code` string + numeric exit code already set on `CommandResult` (DEC-1). The dep-cruiser boundary check (NFR-11) gates this. | L |
| RSK-3 | Redaction pattern gap: a new credential format (e.g. a future OAuth token) is not matched and leaks | H | L | Defense in depth — credentials should never reach the output path (security-baseline.md); the `Redactor` is the backstop. Convention: any new credential format adds a pattern + test in the same PR. | L |
| RSK-4 | snake_case/camelCase drift: the TS type uses camelCase while the JSON wire format uses snake_case, and the conversion drifts | M | M | The JSON renderer owns the conversion centrally; the contract test (F-10) pins the snake_case shape + key order so drift is a failing test (NFR-3). | L |
| RSK-5 | `CommandResult<T>` is insufficiently expressive for a complex command (e.g. `plan` diff, `doctor` table) | M | L | `T` is generic; the per-command formatter registry (F-3) handles rich human output without touching JSON; revisit only if a command cannot express its output (ADR-0011 revisit trigger). | M |
| RSK-6 | picocolors or Cliffy fails to compile under `bun build --compile` | M | L | Both are on the allowed list and Bun-compatible; TDR-0002 mandates the `bun build --compile` smoke-test gate before the Cliffy version is locked; the presentation-adapter boundary keeps Cliffy swappable. | L |
| RSK-7 | ANSI codes or box-drawing chars leak into non-interactive/plain-log output | M | M | Centralized color policy (F-6) is the only path to color; `OutputService` is the only writer; unit + integration tests assert 0 ANSI/box-drawing in piped and `--no-color --output=human` modes (NFR-4/NFR-5). | L |

## 12. ASSUMPTIONS

- GH-14 (MS2-E2-S1) and GH-15 (MS2-E2-S2) are merged and provide `Result<T, E>`, the 13-kind `MarkSyncError` union + `assertNeverMarkSyncError`, the config system, and the strict TS+Bun toolchain with binding dep-cruiser enforcement — all reusable unchanged.
- ADR-0011 (Alternative 3 — hybrid output) and TDR-0002 (Cliffy 1.x confined to `src/cli/`) are settled and are being **implemented**, not reconsidered.
- The CEO-resolved questions are binding: JSON wire format is snake_case (Q1); errors use a top-level `{ code, message, retryable }` with a redacted message (Q2); over-redaction is bounded by specific patterns and a 40-char hex SHA must not be redacted (R1).
- The GH-15 `init.ts` precedent (use `Result` structurally without naming any domain type) is the correct tier-correct pattern for presentation handlers, extended here to the full output pipeline.
- The presentation tier may import the application tier but NOT the domain or infrastructure tiers (dep-cruiser `presentation-may-not-import-domain|-infra`, severity `error`).
- Credentials never reach the output path by construction (security-baseline.md); the `Redactor` is the centralized backstop, not the primary defense.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) | Provides `Result<T,E>`, `MarkSyncError`/`assertNeverMarkSyncError`, the TS+Bun toolchain, dep-cruiser enforcement, binding CI. Merged. |
| Depends on | MS2-E2-S2 (GH-15) | Provides the config system, the `InvalidConfig` kind, and the `init.ts` tier-correct presentation precedent. Merged. |
| Depends on | ADR-0011 | The load-bearing decision: hybrid output strategy (Alternative 3), constraints C-1..C-5, CEO-resolved Q1/Q2/R1. |
| Depends on | TDR-0002 | Cliffy 1.x; presentation-adapter boundary; `bun build --compile` smoke-test gate before version lock. |
| Depends on | typescript.md | Tier rules, `Result<T,E>`, picocolors-over-chalk, `#imports` aliases, allowed-dependency list. |
| Depends on | security-baseline.md | Redaction-layer architecture and patterns (NFR-SEC-2). |
| Depends on | nonfunctional.md | NFR-OBS-1/OBS-2, NFR-A11Y-1/A11Y-2, NFR-SEC-1/SEC-2/SEC-4, INV-SEC-1. |
| Blocks | MS2-E3 (core domain) | Consumes `CommandResult<T>` / `OutputService.emit()` for every command. |
| Blocks | MS2-E5-S2 (doctor) | Consumes `registerHumanFormatter` for rich health-table output. |
| Blocks | plan / sync / doctor / repair-state stories | All return `CommandResult<T>` through the `OutputService`. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | The ADR-0011 record still has an **open checkbox** for "camelCase vs snake_case?" — should it be closed now? | The ADR's Unresolved Questions section lists it unchecked, but the CEO resolved it to snake_case (blueprint §9) and it is binding in this spec (DEC-2). | Resolved for delivery (snake_case). Closing the ADR checkbox is a **phase 7 doc-sync** task (`@doc-syncer`), not a spec or delivery blocker — flag for `@doc-syncer` when GH-16 completes. |
| OQ-2 | Exact Cliffy version pin + Renovate/Dependabot follow-policy (patch-only vs minor)? | TDR-0002 mandates the version is locked only after the `bun build --compile` smoke test passes. | Resolve at delivery via the TDR-0002 smoke-test gate. (Specification detail — no `@decision-advisor` escalation.) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Tier placement of the exit-code mapping (resolves the architecture tension).** The `MarkSyncError.kind → { error.code, exitCode }` translation lives in the **application tier** (`src/app/`), which is permitted to import the domain. The presentation tier (`src/cli/output/`) owns only the stable `error.code` string → numeric exit-code / `process.exit()` concern and **never names `MarkSyncError`**. Exit-code numeric constants may live in `src/shared/` (zero tier deps) or be colocated in `src/cli/output/` as plain numbers without importing the domain. | The story's file-path hint ("Map `MarkSyncError.kind → exitCode` in `src/cli/output/exit-codes.ts`") contradicts the dep-cruiser rule `presentation-may-not-import-domain` (severity `error`) and the dependency-direction matrix. The GH-15 `init.ts` precedent established the pattern (use `Result` structurally without naming any domain type). The architecture rules (TDR-0006 / dep-cruiser) are authoritative; the story's hint is a planning approximation. | 2026-07-08 |
| DEC-2 | The JSON wire format uses **snake_case** (`schema_version`, `run_id`, `exit_code`); the TS type uses camelCase internally; the JSON renderer owns the conversion. | CEO-resolved (story Q1 / blueprint §9). snake_case is the stable contract for CI/agent consumers. The renderer centralizes the conversion so the contract test can pin it. | 2026-07-08 |
| DEC-3 | Errors are represented as a top-level `error: { code, message, retryable }` where `message` is a stable, redacted, human-readable string (never raw exception text, file paths, or partial request bodies). The non-zero exit code and `error.code` correspond. | CEO-resolved (story Q2) per ADR-0011 2026-07-05 guidance; ties to NFR-SEC-1 (no secrets in output) and NFR-SEC-2 (redaction by construction). | 2026-07-08 |
| DEC-4 | Redaction is applied to the **serialized output** (the JSON string and the human string) before write, not to the typed `CommandResult` object. | The redactor wraps the serializer (`JSON.stringify` then redact the string; redact the human string). Patterns operate on output text, which is the actual leakage surface; redacting the typed object would miss stringified nested values. | 2026-07-08 |
| DEC-5 | Color uses `picocolors` (not `chalk`); Cliffy is confined to `src/cli/` (presentation tier). | typescript.md allowed-dependency list + ADR-0011 (color handled centrally by the output service). TDR-0002 mitigation 4 + dep-cruiser keep Cliffy swappable and out of domain/application/infrastructure. | 2026-07-08 |
| DEC-6 | `error.code` is a **stable presentation-layer string** (e.g. `"CONFLICT"`, `"INVALID_CONFIG"`) — the contract the presentation tier consumes — distinct from and produced from `MarkSyncError.kind` by the application tier. | Decouples presentation from domain: the presentation tier maps a stable string to an exit code without importing `MarkSyncError`, satisfying `presentation-may-not-import-domain` (DEC-1). The string is the durable, documented contract for CI/agent consumers. | 2026-07-08 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `CommandResult<T>` / `CommandError` types (presentation) | New |
| Generic JSON renderer (`renderJson` + `renderNdjson`) (presentation) | New |
| Generic human renderer + `registerHumanFormatter` registry (presentation) | New |
| Centralized `Redactor` (presentation) | New |
| Exit-code constants + `error.code` → exit-code table (presentation / shared) | New |
| `MarkSyncError.kind → { code, exitCode }` translation (application tier) | New — DEC-1 |
| Color policy + non-interactive detection (presentation) | New |
| `OutputService` single chokepoint (presentation) | New |
| Cliffy command skeleton + global flags + stub handlers (presentation) | New |
| CLI entrypoint (`src/cli/index.ts`) | Replaced (trivial `console.log` → real router) |
| GH-15 `init.ts` handler | Integrated into the new skeleton (not rewritten) |
| Contract test (pinned JSON snapshot) | New |
| Runtime dependencies (`@cliffy/command`, `@cliffy/flags`, `picocolors`) | New (pinned post smoke-test for Cliffy) |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story's numbered acceptance criteria (AC-1..AC-8), which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F4-1 | **Given** a `CommandResult` containing a synthetic token-shaped string (`ATATT…`/`gho_…`/`Bearer …`/a `MARKSYNC_*_TOKEN` value >20 chars) in any field, **when** the `OutputService` emits it (JSON and human), **then** the captured stdout/stderr contains NO token (grep for the token returns 0 matches) — INV-SEC-1. | F-4, F-7, DM-1, NFR-1 | AC-1 |
| AC-F4-2 | **Given** a `CommandResult` containing a 40-char hex Git SHA, **when** the `Redactor` runs, **then** the SHA is NOT redacted (over-redaction guard). | F-4, NFR-2 | AC-1 (R1) |
| AC-F2-1 | **Given** any stub command (`init`/`plan`/`sync`/`doctor`/`repair-state`), **when** invoked with `--json`, **then** it produces valid, parseable JSON matching the pinned snapshot (snake_case, stable key order, `schema_version`/`run_id`/`exit_code` present). | F-1, F-2, F-8, DM-1, NFR-3 | AC-2 |
| AC-F6-1 | **Given** a command piped to another process (`marksync <cmd> \| cat`), **when** it runs, **then** the output contains zero ANSI color codes; and **when** run with `--color` (even piped), **then** color is forced on; and **when** run with `--no-color` (even in a TTY), **then** color is forced off — NFR-A11Y-1. | F-6, F-7, NFR-4 | AC-3 |
| AC-F6-2 | **Given** `--no-color --output=human`, **when** the `OutputService` renders, **then** the output contains no table box-drawing characters and no ANSI codes (plain-text readable by screen readers / plain-log pipelines) — NFR-A11Y-2. | F-3, F-6, F-7, NFR-5 | AC-4 |
| AC-F7-1 | **Given** the output modules (JSON renderer, human renderer, redactor) are in place, **when** a new stub command is added, **then** it requires ZERO changes to those modules (ADR-0011 C-3) — verified by adding one in a test. | F-2, F-3, F-4, NFR-6 | AC-5 |
| AC-F5-1 | **Given** a synthetic `CommandResult` with `{ error: { code: "CONFLICT" } }`, **when** the entrypoint runs, **then** the process exits with code 30. | F-5, F-9, DM-4, NFR-7 | AC-6 |
| AC-F3-1 | **Given** a command with a registered human formatter, **when** rendered in human format, **then** its output is richer than the generic fallback; and **given** an unregistered command, **when** rendered in human format, **then** it uses the generic fallback. | F-3, NFR-6 | AC-7 |
| AC-F10-1 | **Given** all CLI output unit/integration tests and the contract snapshot test, **when** `bun run check` (lint + typecheck + test + boundaries) runs, **then** it exits 0. | F-1..F-10, NFR-9, NFR-11 | AC-8 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** This story depends on GH-14 + GH-15 (both merged); it blocks MS2-E3 and the command stories.
- **Merge strategy:** Conventional Commits (TDR-0008); commit type `feat` with a `cli` scope is appropriate for the primary commits.
- **Ordering within the story:** the `CommandResult<T>` contract (F-1) and the redaction layer (F-4) should land alongside the `OutputService` (F-7) so the security chokepoint is consistent from the first commit — do not merge stub commands that write directly to stdout while the redaction layer is pending. The application-tier `MarkSyncError.kind → code` translation (DEC-1) should land with the exit-code map (F-5) so exit codes are stable from the start.
- **After merge:** MS2-E3 and the command stories are unblocked; `CommandResult<T>` / `OutputService.emit()` / `registerHumanFormatter` become the shared output contract.
- **Communication:** the PR description should note the stable JSON contract (snake_case), the exit-code table, the `error.code` stable-string concept (DEC-6), and the DEC-1 tier placement so downstream stories align.
- **Phase 7 doc-sync (`@doc-syncer`):** close the ADR-0011 camelCase/snake_case open checkbox (OQ-1); update feature-cli.md (§3.2 output strategy, §4.2 components), tech-stack.md (Cliffy provisional → pinned), and security-baseline.md redaction section to reflect the implemented layer.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. The `CommandResult` `schema_version: 1` is the first version; there is no prior output format to migrate. The pinned contract snapshot (F-10) is the seeding artifact: it establishes the canonical JSON shape future versions are validated against.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A for personal data — the output pipeline carries command results (sync plans, health tables, error codes/messages) and **no** user/personal data beyond what a command legitimately surfaces. The critical privacy/security property is **INV-SEC-1**: no credential appears in any output path. This is enforced centrally by the `Redactor` (F-4) applied to every output before write, with defense in depth (credentials never reach the output path by construction). The redacted `error.message` (DEC-3) ensures failure diagnostics never leak raw exception text, file paths, or partial request bodies.

## 21. SECURITY REVIEW HIGHLIGHTS

- **INV-SEC-1 is enforced HERE, centrally.** The `OutputService` (F-7) is the single chokepoint: every output path passes through the `Redactor` (F-4) before write. No command writes to stdout/stderr directly or calls `process.exit` directly — only the entrypoint does, with the value the service returns. This makes redaction unbypassable by construction (NFR-SEC-2).
- **Redaction by construction, not convention.** The `Redactor` operates on serialized output with specific patterns (Bearer, `ATATT…`, `gho_…`, `MARKSYNC_*_TOKEN` >20 chars, auth-context emails); the over-redaction guard (NFR-2) ensures legitimate hex SHAs survive.
- **Defense in depth.** Credentials live in env/keyring (NFR-SEC-6) and should never reach the output path; the `Redactor` is the backstop. Any new credential format must add a pattern + test in the same PR (security-baseline.md convention).
- **Redacted error messages.** `error.message` is stable + redacted (DEC-3) — never raw exception text, file paths, or request bodies — so failure diagnostics cannot leak secrets.
- **Dependency supply chain.** `@cliffy/command`, `@cliffy/flags`, `picocolors` are on the allowed list; transitive-dependency count (≤20) and licenses audited at delivery (NFR-10, NFR-SEC-4). Cliffy version locked only after the `bun build --compile` smoke test (TDR-0002).

## 22. MAINTENANCE & OPERATIONS IMPACT

- **The output contract is a hard shared contract.** Every command consumes `CommandResult<T>` / `OutputService.emit()`; schema changes ripple to all consumers — changes are versioned (`schema_version`) and gated by the contract test (F-10).
- **Adding a command is cheap.** A new command only produces a `CommandResult<T>` and optionally registers a human formatter; JSON and redaction are automatic (C-3). This is the standing discipline established here.
- **The redaction bar is set here.** The `Redactor` (F-4) establishes the centralized-scrubbing pattern that the future logging layer (pino) should reuse (§7.3). Any new credential format adds a pattern + test in the same PR.
- **Tier discipline is exercised here.** DEC-1 is the first post-GH-15 case of routing a domain-to-presentation translation through the application tier to satisfy dep-cruiser; it sets the precedent for all future command handlers.
- **Exit codes are now a documented contract.** The 9-class map (F-5) is documented in `--help` and a constants module; CI consumers depend on it (NFR-OBS-1).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `CommandResult<T>` | The structured-result wrapper every command returns: schema version, run ID, exit code, optional timing/data/error/warnings. TS camelCase; JSON wire format snake_case. |
| `CommandError` | The failure payload `{ code, message, retryable }`; `code` is a stable presentation-layer string; `message` is stable + redacted. |
| `error.code` | A **stable presentation-layer string** (e.g. `"CONFLICT"`) produced from `MarkSyncError.kind` by the application tier; the contract the presentation tier maps to an exit code without importing the domain (DEC-6). |
| `OutputService` | The single chokepoint: given a `CommandResult` + format + color policy → redact → render → write → return exit code. |
| `Redactor` | The centralized secret-scrubbing layer applied to all serialized output before write (INV-SEC-1 / NFR-SEC-2). |
| `registerHumanFormatter` | The per-command registry hook for optional rich human output; unregistered commands use the generic fallback. |
| Non-interactive detection | Auto-disabling color when stdout is piped or `CI`/`NO_COLOR`/`TERM=dumb` is set (NFR-A11Y-1). |
| Plain-log mode | `--no-color --output=human` output with no ANSI codes and no box-drawing chars (NFR-A11Y-2). |
| Snake_case JSON | The CEO-resolved wire format (`schema_version`, `run_id`, `exit_code`) distinct from the camelCase TS type (DEC-2). |
| Contract test | A pinned JSON snapshot asserting the `CommandResult` wire shape is stable across changes (C-4). |

## 24. APPENDICES

### Appendix A — Story AC → Spec AC traceability

| Story AC | Spec AC(s) | Capability / NFR |
|---|---|---|
| AC-1 (INV-SEC-1: token in any field → no token in output) | AC-F4-1, AC-F4-2 | F-4, F-7, NFR-1, NFR-2 |
| AC-2 (every stub command produces valid JSON + snapshot) | AC-F2-1 | F-1, F-2, F-8, NFR-3 |
| AC-3 (piped no-color; --color forces; --no-color disables) | AC-F6-1 | F-6, F-7, NFR-4 |
| AC-4 (NFR-A11Y-2 plain-log/screen-reader mode) | AC-F6-2 | F-3, F-6, F-7, NFR-5 |
| AC-5 (zero adapter change for new command — C-3) | AC-F7-1 | F-2, F-3, F-4, NFR-6 |
| AC-6 (exit-code CONFLICT → 30) | AC-F5-1 | F-5, F-9, NFR-7 |
| AC-7 (registerHumanFormatter > fallback) | AC-F3-1 | F-3, NFR-6 |
| AC-8 (bun run check green; contract test green) | AC-F10-1 | F-1..F-10, NFR-9, NFR-11 |

### Appendix B — ADR-0011 constraint → spec capability traceability

| ADR-0011 Constraint | Specified by |
|---|---|
| C-1 (every command produces JSON automatically) | F-2, F-8, AC-F2-1 |
| C-2 (auto-decolor in non-interactive) | F-6, AC-F6-1, AC-F6-2 |
| C-3 (no central coupling when adding a command) | F-3, AC-F7-1 |
| C-4 (stable versioned schema) | F-1 (`schema_version`), F-10, NFR-3 |
| C-5 (redaction on all output paths) | F-4, F-7, AC-F4-1, NFR-1 |

### Appendix C — Authoritative sources

- **Story scope (authoritative):** `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S3--cli-framework.md` — Goal, Detailed scope (10 deliverables), Acceptance criteria (8), Test matrix, CEO-resolved Q1/Q2/R1.
- **Output strategy decision:** `doc/decisions/ADR-0011-cli-output-strategy.md` — Alternative 3, constraints C-1..C-5, error-representation guidance.
- **CLI framework decision:** `doc/decisions/TDR-0002-cli-framework.md` — Cliffy 1.x, presentation boundary, smoke-test gate.
- **Coding conventions:** `.ai/rules/typescript.md` — tier rules, `Result<T,E>`, picocolors-not-chalk, `#imports`, allowed-dependency list.
- **Architecture:** `doc/overview/architecture-overview.md` — dependency-direction matrix, module-residence rules.
- **Security:** `doc/guides/security-baseline.md` — redaction-layer architecture/patterns.
- **NFRs:** `doc/spec/nonfunctional.md` — NFR-OBS-1/OBS-2, NFR-A11Y-1/A11Y-2, NFR-SEC-1/SEC-2/SEC-4, INV-SEC-1.
- **Existing primitives:** `src/domain/result.ts` (`Result<T,E>`), `src/domain/errors.ts` (13-kind `MarkSyncError` + `assertNeverMarkSyncError`), `src/cli/commands/init.ts` (GH-15 tier-correct precedent), `.dependency-cruiser.cjs` (`presentation-may-not-import-domain|-infra`).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | spec-writer (GH-16) | Initial specification — formalized from the authoritative story file MS2-E2-S3, ADR-0011 (hybrid output strategy), TDR-0002 (Cliffy), typescript.md tier/color conventions, the existing `Result<T,E>`/`MarkSyncError` primitives (GH-14/GH-15), and the dep-cruiser tier rules. Encodes the DEC-1 tier-placement resolution for the exit-code mapping. |

---

## AUTHORING GUIDELINES

- **Seed:** The authoritative scope is the story file `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S3--cli-framework.md` (DoR-ready). This spec formalizes that story; it does not invent new requirements or expand scope. The story's Goal / Detailed scope (10 deliverables) / Acceptance criteria (8) / Out-of-scope map directly to the Goals (G-1..G-9), Capabilities (F-1..F-10), Acceptance Criteria (AC-*), and Non-Goals (NG-1..NG-6) here.
- **Sources cited:** story MS2-E2-S3, ADR-0011, TDR-0002, typescript.md, architecture-overview.md, security-baseline.md, nonfunctional.md, the existing `result.ts`/`errors.ts`/`init.ts` primitives, `.dependency-cruiser.cjs`.
- **No implementation detail:** module paths appear as **architectural residence** (where a capability lives per the residence rules), consistent with the GH-15 spec and `architecture-overview.md` — not as step-by-step file-creation tasks. Exact file contents and the precise module split within the constraints are delivery decisions for the plan-writer/coder.
- **Tier-placement resolution (DEC-1):** the story's file-path hint placing "`MarkSyncError.kind → exitCode`" in `src/cli/output/` contradicts `presentation-may-not-import-domain` (severity `error`). The spec surfaces this explicitly and routes the domain-to-code translation through the application tier, consistent with the GH-15 `init.ts` precedent. The architecture rules (TDR-0006 / dep-cruiser) are authoritative; the story hint is a planning approximation.
- **CEO-resolved items** carried forward as decisions: Q1 → snake_case JSON (DEC-2); Q2 → top-level redacted `{ code, message, retryable }` error (DEC-3); R1 → over-redaction guard with 40-char hex SHA test (AC-F4-2). Three further design clarifications are recorded: DEC-4 (redact serialized output), DEC-5 (picocolors + Cliffy confined to `src/cli/`), DEC-6 (`error.code` as a stable presentation-layer string).
- **Open items** (ADR-0011 checkbox closure, Cliffy version pin) are captured as OQ-1/OQ-2 but flagged as phase-7-doc-sync / delivery-time details, not `@decision-advisor` escalations.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-16)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR-/DM- ID and use Given/When/Then
- [x] NFRs include measurable values (0 token matches; SHA not redacted; 0 ANSI/box-drawing; 0 central-module changes; CONFLICT→30; ≤10ms p95; ≤20 transitive deps; `bun run check` exit 0)
- [x] Risks include Impact & Probability
- [x] No implementation details (module paths are architectural residence, not task steps; no code-level instructions)
- [x] No content duplicated from linked docs (ADR-0011 / TDR-0002 / story / typescript.md referenced, not reproduced)
- [x] Front matter validates per front_matter_rules
