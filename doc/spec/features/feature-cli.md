---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-CLI
status: Current
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: []
  decisions: [ADR-0011, TDR-0002]
  contracts: []
---

# Feature Specification: CLI Interface

> User-facing CLI with structured output, auth management, dry-run, and health
> diagnostics.

## 1. Overview

The MarkSync CLI is a single-binary tool (Bun `--compile`) that provides
commands for synchronizing Markdown to Confluence. It is designed for both
interactive human use and non-interactive CI/agent operation with structured
JSON/NDJSON output.

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Users need a reliable, scriptable tool that works locally and in
  CI, with clear error messages and structured output for AI agents.
- **Affected Users:** Developers (interactive), CI pipelines (non-interactive),
  AI coding agents (structured output).
- **Business Impact:** The CLI is the sole user interface; its quality directly
  determines adoption and trust.

## 3. Functionality

### 3.1 Commands

| Command | Purpose |
|---|---|
| `init` | Initialize MarkSync in a repo: create config, discover pages, assign UUIDs |
| `plan` | Compute sync plan (dry-run): what will be created/updated/moved/no-op |
| `sync` | Execute plan: apply changes to Confluence |
| `doctor` | Health check: auth, permissions, API connectivity, config validity |
| `repair-state` | Recover from stale lock or interrupted apply |

### 3.2 Output strategy (ADR-0011)

- **Structured `CommandResult<T>`** — every command returns a typed result
  object with status, data, diagnostics, and warnings.
- **Generic JSON renderer** — default for CI/agents: `--format json` or
  `--format ndjson`.
- **Optional human formatter** — per-command human-readable output for
  interactive use (color, tables, summaries).
- **Centralized redaction** — secrets never appear in any output path.

### 3.3 Authentication

- **API token** (MS-0002 default): email + token from env vars or OS keyring.
- **Env vars** (CI): `MARKSYNC_CONFLUENCE_TOKEN`, `MARKSYNC_CONFLUENCE_EMAIL`,
  `MARKSYNC_CONFLUENCE_BASE_URL`.
- **keytar keychain** (OPEN-Q8, deferred): OS keyring integration; env-token is
  the guaranteed path.

### 3.4 Edge cases & error handling

- **Expected failures:** return `Result<T, E>` — no thrown exceptions for API
  errors, parse failures, missing files.
- **Exhaustive `never`:** all discriminated unions checked.
- **Error messages:** AI-agent-readable: include failing input, expected shape,
  suggested fix.
- **Exit codes:** stable, documented per command.
- **Color auto-detect:** disabled when not a TTY or when `NO_COLOR` is set
  (accessibility, NFR-A11Y-1).

## 4. Technical Architecture

### 4.1 Design

Built with Cliffy (TDR-0002). The CLI layer is a presentation adapter — it
parses args, delegates to domain services, and renders `CommandResult<T>`.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| CommandRouter | Cliffy command/flag parsing |
| ResultRenderer | `CommandResult<T>` → JSON/NDJSON/human output |
| RedactionLayer | Centralized secret scrubbing for all output |
| AuthProvider | Token/keyring resolution |
| ConfigLoader | YAML config + JSON Schema validation |

### 4.3 Key decisions

- **ADR-0011:** `CommandResult<T>` + centralized redaction.
- **TDR-0002:** Cliffy stable 1.x.
- **TDR-0008:** Conventional Commits enforced via commitlint + husky.

## 5. Acceptance criteria

- [ ] **INV-SEC-1:** No credential in any output (logs, plans, state,
      diagnostics, `version.message`).
- [ ] JSON output is valid and parseable by AI agents without human interpretation.
- [ ] Exit codes are stable and documented.
- [ ] Color is auto-disabled when not a TTY or `NO_COLOR` set (NFR-A11Y-1).
- [ ] `doctor` verifies: auth, base URL, space access, permissions, config
      validity.
- [ ] `--dry-run` / `plan` shows every intended mutation before any write.

## 6. References

- [ADR-0011](../../decisions/ADR-0011-cli-output-strategy.md)
- [TDR-0002](../../decisions/TDR-0002-cli-framework.md)
- [TypeScript conventions: Result&lt;T,E&gt;](../../../.ai/rules/typescript.md)
- [Accessibility baseline](../../guides/accessibility-baseline.md)
- [Security baseline: redaction](../../guides/security-baseline.md)
- [.env.example](../../../.env.example)
