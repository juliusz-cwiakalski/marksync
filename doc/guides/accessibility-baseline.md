---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: ACCESSIBILITY-BASELINE
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0011]
  related_changes: []
  summary: "Accessibility baseline — CLI output accessibility (color, plain-log, screen-reader) and Confluence provenance panel contract. Not a hard requirement; focused on CLI/AI/CI usability."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Accessibility Baseline

_Accessibility guidance for MarkSync. In this project context, accessibility is
not a hard compliance requirement (no WCAG audit). The focus is practical:
**making output easy to use via CLI, in CI logs, and for AI agents.** This
document covers NFR-A11Y-1 (no color dependency), NFR-A11Y-2 (plain-log mode),
and NFR-A11Y-3 (visible provenance)._

## CLI output accessibility

### Color handling (NFR-A11Y-1)

**Rule:** output must be readable without color. Color is a progressive
enhancement, never a dependency.

| Environment | Color behavior |
|---|---|
| Interactive TTY (human terminal) | Color enabled by default |
| Non-interactive (CI, piped, scripted) | **Auto-detected → color disabled** |
| `--no-color` flag | Force disable |
| `--color` flag | Force enable |
| `MARKSYNC_NO_COLOR=1` env | Force disable |

**Implementation** (ADR-0011 output service):
- The output service checks `process.stdout.isTTY` and `process.env.NO_COLOR` /
  `MARKSYNC_NO_COLOR` before emitting color codes.
- Color is never the sole indicator of state — every colored output has a
  text equivalent (e.g., `[OK]`, `[CONFLICT]`, `[ERROR]` prefixes).
- `picocolors` is the coloring library (lightweight, fast).

**Testing:** a unit test per output path feeds a fake TTY and a pipe, asserting
color codes are present/absent respectively. Part of the redaction-suite test
plan in `security-baseline.md`.

### Plain-log / machine-readable mode (NFR-A11Y-2)

**Rule:** a `--json` or `--ndjson` flag produces structured output with no
color, no decorative formatting, and no ANSI codes. This is the primary
"accessible" output path for AI agents, CI pipelines, and screen readers.

| Mode | Flag | Use case |
|---|---|---|
| Human (default) | _(none)_ | Interactive terminal with color + tables |
| JSON | `--json` | Single-result machine output; AI agents |
| NDJSON | `--ndjson` | Streaming machine output; CI log parsing |

**Structured output contract** (ADR-0011):
- Every command returns a `CommandResult<T>` with stable schema.
- Exit codes are documented and machine-parseable (NFR-OBS-1).
- Diagnostic codes (`MS-0003` target) provide stable failure-class identifiers.

**Testing:** JSON/NDJSON output is validated with `zod` schema tests — the
output must always match the declared schema, regardless of error state.

## Confluence provenance panel (NFR-A11Y-3)

**Rule:** every managed page shows visible provenance so non-Git readers
(Confluence users) can trace content to its source.

### Panel content contract

The provenance panel is an info panel or footer macro appended to each managed
page body:

| Field | Content | Source |
|---|---|---|
| Source path | Relative path in the Git repo | Lock file |
| Git revision | Short commit hash (12 chars) | Lock file |
| Last sync | ISO 8601 timestamp | Run metadata |
| Synced by | `MarkSync vX.Y.Z` | Build version |

### Rendering

- Stored as a Confluence info panel (`<ac:structured-macro ac:name="info">`)
  or a formatted footer at the end of the page body.
- The panel is part of the page body (not a comment or metadata) so it is
  visible to all Confluence readers regardless of permissions.
- The panel is idempotent — re-syncing replaces the old panel, not appending
  a new one.
- A `noPanel` config option can suppress the panel for users who prefer
  machine-metadata-only provenance.

### Testing

- Golden-fixture tests verify the panel XHTML is deterministic.
- Integration tests verify the panel is replaced (not duplicated) on re-sync.
- E2E tests verify the panel is visible to Confluence readers.

## Priority

| NFR | Priority | Milestone |
|---|---|---|
| NFR-A11Y-1 (no color dependency) | **Binding** | `MS-0002` |
| NFR-A11Y-2 (plain-log/JSON) | **Binding** (JSON output is a core feature) | `MS-0002` |
| NFR-A11Y-2 (screen-reader-specific mode) | Informational | Not planned (JSON mode serves this need) |
| NFR-A11Y-3 (visible provenance) | **Binding** | `MS-0002` |

> **Design principle:** for a CLI tool, the most impactful "accessibility"
> measure is reliable, structured, no-color-necessary output. The JSON/NDJSON
> output path is the primary accessible path — it serves AI agents, CI
> pipelines, screen readers, and any tool that needs to consume MarkSync output
> programmatically. Visual color enhancements are secondary.

## See also

- [ADR-0011](../decisions/ADR-0011-cli-output-strategy.md) — CLI output
  strategy (CommandResult, JSON, redaction, non-interactive detection).
- [Security baseline](./security-baseline.md) — redaction layer.
- [NFR-A11Y-*](../spec/nonfunctional.md) — accessibility NFRs.
