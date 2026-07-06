---
id: MS2-E2-S3
title: "cli-framework"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: 2d
gh_issue: GH-16
feature_spec: doc/spec/features/feature-cli.md
decisions: [ADR-0011, TDR-0002]
dependencies: { blocks: [MS2-E3, MS2-E5-S2], blocked_by: [MS2-E2-S1] }
cross_cutting: [INV-SEC-1, NFR-A11Y-1]
---

# MS2-E2-S3 — CLI framework + CommandResult<T> + centralized redaction

## Goal
Stand up the Cliffy CLI framework with the hybrid output strategy (ADR-0011): every command returns a structured `CommandResult<T>`; a generic JSON renderer + generic human renderer (+ optional per-command human formatter); centralized redaction layer; stable exit codes; non-interactive color auto-detect.

## Background
ADR-0011 is explicit: **structured result + generic JSON + optional per-command human formatter** (Alternative 3) — the only design satisfying all 5 constraints (auto-JSON, auto-decolor, no central coupling, stable schema, central redaction). This story builds that pipeline ONCE so every later command (`init`, `plan`, `sync`, `doctor`, `repair-state`) just produces a `CommandResult<T>`. INV-SEC-1 (no secret in any output) is enforced HERE, centrally, so no command can bypass it.

## Detailed scope (deliverables)
1. **`src/cli/output/command-result.ts`** — `CommandResult<T>` type: `{ schemaVersion:1; runId; exitCode; timing?; data?:T; error?:{code;message;retryable}; warnings?[] }`. `schemaVersion` constant for contract stability (ADR-0011 C-4). **JSON uses snake_case** (blueprint §9 Q3 CEO decision).
2. **`src/cli/output/json.ts`** — generic JSON renderer: `renderJson(result)` → `JSON.stringify` with stable key order. Also `renderNdjson` for streaming results.
3. **`src/cli/output/human.ts`** — generic human renderer: key-value/table fallback for any `CommandResult<T>`. Plus a **registry** `registerHumanFormatter<T>(command, fn)` for optional per-command rich formatting.
4. **`src/cli/output/redact.ts`** — centralized redaction layer. A `Redactor` with configurable patterns (Authorization, Bearer, `gho_`/`ATATT`/API-token-shaped strings, emails, `MARKSYNC_*_TOKEN` values). Applied to ALL output (human + JSON) before write. Tested per-output-path.
5. **`src/cli/output/exit-codes.ts`** — stable exit-code map per error class (NFR-OBS-1): `0` clean; `2` usage; `10` config error; `20` auth error; `30` conflict/drift; `40` remote-missing; `50` invariant violation; `70` render-unavailable; `99` internal. Map `MarkSyncError.kind → exitCode`.
6. **`src/cli/output/color.ts`** — color policy via `picocolors` (NOT chalk). Detect non-interactive: piped stdout, `CI` env, `NO_COLOR`, `TERM=dumb` → disable; `--color`/`--no-color` overrides (ADR-0011 C-2, NFR-A11Y-1).
7. **`src/cli/output/index.ts`** — the `OutputService`: given a `CommandResult<T>` + selected format + color policy → redact → render → write stdout/stderr; return the exit code. Single chokepoint.
8. **Cliffy wiring** (`src/cli/commands/`) — the command router skeleton with global flags `--json`/`--output={json,ndjson,human}`/`--color`/`--no-color`/`--quiet`. Stub command handlers for `init`, `plan`, `sync`, `doctor`, `repair-state` that each return a placeholder `CommandResult` (real logic lands in later stories; this story wires the FRAMEWORK).
9. **`src/cli/index.ts`** — entrypoint: parse args → route → execute handler → `OutputService.emit(result)` → `process.exit(result.exitCode)`.
10. **Contract test** — a pinned-schema JSON snapshot test asserting the output shape is stable.

## Technical approach
- Cliffy (`@cliffy/command`) for arg parsing; the framework owns parsing, MarkSync owns `CommandResult`/exit codes (ADR-0011 ref to TDR-0002).
- The redactor wraps the serializer: `JSON.stringify(redact(result))`. For human output, redact the string. Redaction patterns are data, not secret values.
- Non-interactive detection: `!process.stdout.isTTY || process.env.CI || process.env.NO_COLOR || process.env.TERM==="dumb"`.
- Exit-code mapping centralized; handlers never call `process.exit` directly.

## Interface contracts (what other stories consume)
- `CommandResult<T>` + `OutputService.emit()` — every command (E3-S6 sync, E5-S2 doctor, E4-S4 repair) returns this.
- `registerHumanFormatter` — a command may register rich human output (e.g. `plan` diff, `doctor` table).
- Exit codes — stable; documented in `--help` and a constants file.
- Redactor — used (transparently) by all output; reused by logging (pino redaction) in later stories.

## Acceptance criteria (testable)
- [ ] **INV-SEC-1:** a `CommandResult` containing a synthetic token-shaped string in any field → emitted JSON/human output contains NO token (redaction verified by grep test on captured stdout).
- [ ] Every stub command produces valid JSON with `--json` (parseable; matches pinned snapshot).
- [ ] Piped output (`... | cat`) contains zero ANSI color codes; `--color` forces them; `--no-color` always disables (NFR-A11Y-1).
- [ ] Adding a new stub command requires ZERO changes to `json.ts`/`human.ts`/`redact.ts` (ADR-0011 C-3) — verify by adding one in a test.
- [ ] Exit codes map correctly: feed a synthetic `{error:{code:"CONFLICT"}}` → process exits 30.
- [ ] `registerHumanFormatter` produces richer output than the generic fallback for a registered command; unregistered commands use the fallback.
- [ ] `bun run check` green; contract test green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | redaction patterns (token/email/bearer), exit-code mapping, color detection (mock isTTY/env), CommandResult shape, JSON schema contract |
| Integration | capture stdout/stderr of a stub command via `Bun.spawn`; assert redaction + format + exit code end-to-end |
| Golden | pinned JSON snapshot of a representative CommandResult |

## Definition of Done
Hybrid output pipeline live; redaction enforced centrally; exit codes stable; Cliffy skeleton with global flags; contract test pinning the JSON schema. AC list is the DoD.

## Out of scope
- Real command logic (plan/sync/doctor/repair) — later stories.
- NDJSON streaming for `sync --watch` (watch mode is post-MS-0002); wire the renderer but no watch command.
- Per-command human formatters for every command (each command's formatter lands with that command).

## Risks / open questions (CEO-resolved)
- **R1:** Redaction could over-redact (e.g. a legit sha that matches a token pattern). → Patterns are specific (`ATATT…`, `gho_…`, `Bearer …`, `MARKSYNC_*_TOKEN` env value length>20); shas are hex and won't match. Add a unit test asserting a 40-char hex sha is NOT redacted. CEO-recorded.
- **Q1:** JSON case. → snake_case (blueprint §9). Confirmed.
- **Q2:** Error representation in JSON. → top-level `error:{code,message,retryable}` per ADR-0011 2026-07-05 guidance; `message` is stable+redacted (never raw exception/path/body). Confirmed.
