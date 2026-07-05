---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0011
decision_type: adr
status: Proposed
created: 2026-07-05
decision_date: null
last_updated: 2026-07-05
summary: "Hybrid output strategy: every command produces a structured CommandResult; a generic JSON renderer handles machine output automatically; a per-command human formatter is optional (falls back to a generic key-value/table renderer). Non-interactive env auto-disables color. Minimizes per-command output coupling while guaranteeing JSON for CI/scripts."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines whether MarkSync is operable in CI pipelines and AI-agent workflows (JSON) while remaining readable for human operators. Affects every CLI command."
customer_impact: "CI users and AI agents get reliable JSON output from every command; human users get formatted, colored output by default with automatic de-colorization in scripted environments."
classification:
  domains: [architecture, ux]
  archetype: design
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: medium
  uncertainty: medium
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "The generic key-value fallback human renderer proves too ugly for most commands, requiring per-command formatters anyway."
  - "The structured CommandResult schema cannot express a command's output without command-specific type extensions that break the generic JSON renderer."
  - "A third output format (e.g., YAML, TOML, CSV) is needed beyond JSON and human."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [TDR-0002]
  experiments: []
  metrics: [NFR-OBS-1, NFR-OBS-2, NFR-A11Y-1]
  roadmap_items: [MS-0002]
---

# ADR-0011: CLI output strategy — structured results + generic JSON renderer + optional per-command human formatter

## Context

MarkSync must support both **human-readable** (colored, formatted, table-friendly) and **machine-readable** (JSON/NDJSON) output for every command. This is a north-star guardrail: AI agents and CI pipelines depend on stable, machine-parseable JSON output and stable exit codes (`01-north-star.md`; NFR-OBS-1, NFR-OBS-2).

The owner raised this as a design question (PR #4 comment on `architecture-overview.md`):

> "we must support also json output so that it's easier to use marksync in scripts (for example ci etc) […] first idea that comes to my mind is to have port for command output and human + json adapters. but this brings tight coupling between this and any command we support so adding/changing command would require change in two places? so maybe we should rather have that 'in place' — there should be some presentation api for each command/operation that would have to implement two adapters json + human?"

FACT: the north star requires JSON/NDJSON output with a stable schema and run ID on every result (NFR-OBS-2). FACT: output must be readable without color, and non-interactive/scripted environments must auto-disable color (NFR-A11Y-1). FACT: every command shares stable exit codes per error class (NFR-OBS-1).

## Problem Framing (Clarified)

The question is **not** "should MarkSync support JSON output?" (it must). The question is **how to structure the output pipeline so that:**

1. Every command automatically gets JSON output without per-command output code.
2. Human output is formatted and colored by default but degrades gracefully in CI.
3. Adding or changing a command does **not** require touching a central output adapter (avoids the tight-coupling concern).
4. The output schema is stable and versioned so CI/agent consumers can depend on it.

## Constraints (Hard Requirements)

### C-1: Every command produces JSON output automatically

- **Statement:** Every CLI command must produce structured JSON output when `--json` (or `--output=json`) is passed, without requiring the command author to write a JSON renderer.
- **Source:** NFR-OBS-2; north star guardrail; AI-agent operability.
- **Verification:** Running any command with `--json` produces valid JSON with a stable schema; no command lacks JSON output.
- **Negotiable:** no.

### C-2: Human output is formatted and auto-de-colorized in non-interactive environments

- **Statement:** By default, output is human-readable (colored, formatted). In non-interactive/scripted environments (CI, piped stdout, `NO_COLOR` set), color is automatically disabled unless `--color` forces it.
- **Source:** NFR-A11Y-1; owner direction (PR #4).
- **Verification:** Running in a pipe (`marksync plan | cat`) produces no color codes; `--color` forces color even in a pipe; `--no-color` always disables.
- **Negotiable:** no.

### C-3: Adding a command does not require changes to a central output adapter

- **Statement:** Adding a new command must not require modifying a shared output module. The command's output structure is self-contained.
- **Source:** Owner concern about tight coupling (PR #4 comment).
- **Verification:** A new command is added with zero changes to any shared output adapter file.
- **Negotiable:** no.

### C-4: Output schema is stable and versioned

- **Statement:** The JSON output schema includes a schema version and is stable across minor releases. Breaking changes require a major version bump.
- **Source:** NFR-OBS-2; AI-agent/CI consumers depend on stable parsing.
- **Verification:** The JSON schema is documented; a contract test validates output shape across releases.
- **Negotiable:** no.

### C-5: Redaction is enforced on all output paths

- **Statement:** No secrets appear in any output format (human or JSON). Redaction is centralized, not per-command.
- **Source:** R-SEC-1; NFR-SEC-1, NFR-SEC-2.
- **Verification:** Every output path passes through a redaction layer; tested per path.
- **Negotiable:** no.

## Decision Drivers

**Product / user drivers:**
- CI pipelines and AI agents need reliable, stable JSON output from every command.
- Human operators need readable, colored output that works in a terminal.
- Scripted usage should "just work" without flags (auto-detect non-interactive).

**Technical drivers:**
- Minimize per-command output boilerplate.
- Avoid tight coupling between commands and a central output adapter.
- Centralize redaction so it cannot be forgotten.

**Operational drivers:**
- Output must be testable (contract tests for JSON schema).
- Exit codes must be stable per error class (NFR-OBS-1), independent of output format.

## Mental Models & Techniques Used

- **Separation of concerns:** data (structured result) ≠ presentation (human/JSON rendering). Commands produce data; renderers present it.
- **Convention over configuration:** JSON output should be automatic from the structured result; human formatting should have a sensible generic default with optional customization.
- **Inversion:** "how could output become unreliable?" → per-command JSON bugs, forgotten redaction, schema drift, color codes in piped output. Each risk becomes a constraint.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via accepted cost.

|          | C-1 (auto JSON) | C-2 (auto de-color) | C-3 (no central coupling) | C-4 (stable schema) | C-5 (redaction) |
|----------|-----------------|---------------------|----------------------------|----------------------|------------------|
| Alt 0 — Shared output port | ⚠️ (per-command calls needed) | ✅ | ❌ (central adapter) | ✅ | ✅ |
| Alt 1 — Per-command presentation | ❌ (JSON per command) | ✅ | ✅ | ⚠️ (schema per command) | ⚠️ (per-command) |
| Alt 2 — Structured result + generic renderers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 3 — Hybrid (structured result + optional per-command human formatter) | ✅ | ✅ | ✅ | ✅ | ✅ |

### Alternative 0 — Shared output port (owner's first idea)

- **Summary:** A single `OutputPort` interface with `HumanAdapter` and `JsonAdapter`. Every command calls `output.renderHuman(...)` / `output.renderJson(...)` explicitly.
- **Pros:** Centralized; redaction is easy; consistent interface.
- **Cons:** **Tight coupling** — every command must know about both formats; adding/changing a command requires touching the central adapter; JSON schema lives in the adapter, not the command.
- **Constraint compliance:** C-1 ⚠️; C-2 ✅; C-3 ❌; C-4 ✅; C-5 ✅.
- **Why rejected:** Fails C-3 (the owner's explicit concern about tight coupling).

### Alternative 1 — Per-command presentation API (owner's alternative idea)

- **Summary:** Each command defines its own result type and registers human + JSON renderers for it. The command owns its output entirely.
- **Pros:** Commands own their output; no central coupling; maximum flexibility.
- **Cons:** Every command must implement JSON rendering (boilerplate); schema consistency is not guaranteed; redaction must be remembered per command; high risk of JSON output being forgotten or buggy on some commands.
- **Constraint compliance:** C-1 ❌ (JSON is per-command, not automatic); C-2 ✅; C-3 ✅; C-4 ⚠️; C-5 ⚠️.
- **Why rejected:** Fails C-1 (JSON output is not automatic; high risk of commands missing it).

### Alternative 2 — Structured result + generic renderers only

- **Summary:** Every command produces a structured `CommandResult` object. Two generic renderers (human, JSON) consume any `CommandResult` via schema/reflection. No per-command output code at all.
- **Pros:** Zero per-command output code; JSON is fully automatic; schema is centralized in the `CommandResult` type; redaction is centralized.
- **Cons:** Human output may be too generic/ugly (key-value dump or auto-table) for complex results; no way to customize human formatting per command without breaking the "generic only" model.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why not the sole choice:** Works for JSON but human output quality suffers for complex commands (e.g., `plan` with a diff, `doctor` with a health table). See Alternative 3.

### Alternative 3 — Hybrid: structured result + generic JSON + optional per-command human formatter (RECOMMENDED)

- **Summary:** Every command produces a structured `CommandResult` object. A **generic JSON renderer** handles machine output automatically (zero per-command code). A **generic human renderer** provides a sensible default (key-value/table) but each command **may optionally** register a custom human formatter for richer output (e.g., colored diff, multi-column table). The custom formatter receives the `CommandResult` and produces human-readable text; it does not affect JSON output.
- **Pros:** JSON is automatic (C-1); human output is good by default and great when customized; no central coupling (C-3); schema is centralized (C-4); redaction is centralized (C-5); adding a command only requires producing a `CommandResult` — the JSON renderer and default human renderer handle the rest.
- **Cons:** Slight complexity in the rendering pipeline (generic + optional custom human); the `CommandResult` type must be expressive enough for all commands.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why chosen:** The only alternative that satisfies all constraints. It guarantees JSON for every command while allowing human-output quality where it matters, without tight coupling.

## Decision

**Recommendation: choose Alternative 3 — hybrid output strategy.**

### Architecture

1. **`CommandResult<T>`** — every command returns a typed structured result. The type `T` is command-specific data; the wrapper carries metadata (run ID, exit code, timing, schema version).

2. **Generic JSON renderer** — serializes any `CommandResult<T>` to JSON/NDJSON automatically. Controlled by `--json` / `--output=json` / `--output=ndjson`. Zero per-command code required.

3. **Generic human renderer (default)** — renders any `CommandResult<T>` as key-value pairs or a simple table. Used when no custom formatter is registered. Controlled by default (no flag) or `--output=human`.

4. **Optional per-command human formatter** — a command may register a custom formatter function `(result: CommandResult<T>) => string` for richer human output (colored diff, multi-section report, tree view). This is purely additive — if not registered, the generic renderer is used.

5. **Non-interactive detection** — the output service detects non-interactive environments (piped stdout, `CI` env var, `NO_COLOR` env var, `TERM=dumb`) and auto-disables color. `--color` forces color on; `--no-color` forces color off.

6. **Redaction layer** — all output (human and JSON) passes through a centralized redaction filter before writing to stdout/stderr. No command can bypass it.

7. **Exit codes** — stable per error class (NFR-OBS-1), independent of output format. The `CommandResult` carries the exit code; the CLI adapter translates it to `process.exit()`.

### Output format selection

| Flag / condition | Output format |
|---|---|
| `--json` or `--output=json` | JSON (single object) |
| `--output=ndjson` | NDJSON (one object per line, for streaming) |
| default (interactive TTY) | Human (colored, formatted) |
| default (non-interactive / piped) | Human (no color) |
| `--color` | Force color in human output |
| `--no-color` | Force no color in human output |

### Constraint Compliance Attestation

- **C-1 — ✅:** The generic JSON renderer serializes any `CommandResult<T>` automatically; no command lacks JSON output.
- **C-2 — ✅:** Non-interactive detection auto-disables color; `--color`/`--no-color` overrides are respected.
- **C-3 — ✅:** Adding a command only requires producing a `CommandResult<T>`; no central adapter changes. The optional human formatter is per-command, not central.
- **C-4 — ✅:** The JSON schema is derived from the `CommandResult` type; schema version is in the wrapper; contract tests validate shape.
- **C-5 — ✅:** Redaction is centralized in the output service; all output paths pass through it.

## Trade-offs & Consequences

### Positive Outcomes

- Every command gets JSON output for free.
- Human output is good by default and excellent when customized.
- No tight coupling between commands and output adapters.
- Redaction cannot be forgotten.
- Schema is stable and contract-testable.

### Negative Outcomes

- The `CommandResult<T>` type must be expressive enough for all commands (plan diffs, health tables, sync summaries).
- The optional per-command formatter is an extra concept to learn.
- NDJSON streaming requires commands to produce results incrementally (not all commands benefit).

### Unresolved Questions

- [ ] Should the JSON schema use camelCase or snake_case? (owner: Juliusz Ćwiąkalski)
- [ ] Should NDJSON be the default for streaming commands like `sync --watch`? (owner: Juliusz Ćwiąkalski)
- [ ] ~~How should errors be represented in JSON output — a top-level `error` field vs. an error exit code + stderr JSON?~~ **Guidance (2026-07-05):** errors MUST pass through the same centralized redaction layer as all other output (NFR-SEC-1/NFR-SEC-2). JSON errors should use a top-level `error` object with `{ code, message, retryable }` — where `message` is a stable, redacted, human-readable string (never raw exception text, file paths, or partial request bodies). The non-zero exit code and the `error.code` must correspond. This ties directly to NFR-SEC-1 (no secrets in any output) and NFR-SEC-2 (redaction by construction).

## Implementation Plan

1. Define `CommandResult<T>` type with metadata wrapper (run ID, exit code, schema version, timing).
2. Implement the generic JSON renderer (serialize `CommandResult<T>` → JSON string).
3. Implement the generic human renderer (key-value / table fallback).
4. Implement the non-interactive detection + color policy.
5. Implement the centralized redaction layer.
6. Add the per-command human formatter registration mechanism.
7. Define the JSON output schema and write contract tests.
8. Document output flags and schema in the CLI help.

## Verification Criteria

- **Metric: JSON from every command** — Target: every command produces valid JSON with `--json` — Window: `MS-0002`.
- **Metric: Auto-de-colorization** — Target: piped output contains no ANSI color codes; `--color` forces them — Window: `MS-0002`.
- **Metric: No central coupling** — Target: a new command is added with zero changes to any output adapter file — Window: `MS-0002`.
- **Metric: Schema stability** — Target: JSON output passes a contract test with a pinned schema — Window: `MS-0002`.
- **Metric: Redaction** — Target: no secrets appear in any output path (human or JSON) — Window: `MS-0002`.

## Confidence Rating

**Medium-High.** The hybrid pattern is well-established in modern CLI tools (e.g., `gh`, `kubectl`, `gh` use structured results + formatters). The main uncertainty is whether the `CommandResult<T>` type needs to be more complex than expected for certain commands (e.g., `plan` with a multi-page diff).

## References

- `01-north-star.md` — JSON/exit-code contracts as guardrails.
- `../spec/nonfunctional.md` — NFR-OBS-1 (exit codes), NFR-OBS-2 (structured output), NFR-A11Y-1 (no color dependency).
- `TDR-0002` — CLI framework (Cliffy); JSON/exit-code contracts are owned by MarkSync, not the framework.
- PR #4 comment on `architecture-overview.md` line 75 — owner's design question that prompted this ADR.
