---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-CLI
status: Current
created: 2026-07-06
last_updated: 2026-07-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: [GH-15, GH-17, GH-18, GH-28, GH-74]
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
| `init` | Initialize MarkSync in a repo: if `marksync.yml` is absent, write a starter config (round-trips through `loadConfig`); if it already exists, leave it untouched. Then assign a UUID v7 to each discovered managed document's front-matter (`marksync.uuid`). UUID injection is idempotent — a document that already has an identity is left unchanged. |
| `plan` | Compute sync plan (dry-run): what will be created/updated/moved/no-op |
| `sync` | Execute plan: apply changes to Confluence |
| `doctor` | Health check: auth, permissions, API connectivity, config validity |
| `repair-state` | Recover from a stale/dirty lock or an interrupted apply. **Dry-run by default** (`--dry-run`, 0 writes); `--apply` executes the planned repairs and updates the committed lock. Emits a structured `RepairReport` with stable per-item diagnostic codes (repaired / skipped / needs-human-action). *(delivered — GH-28)* |

### 3.2 Output strategy (ADR-0011)

- **Structured `CommandResult<T>`** — every command returns a typed result
  object with status, data, diagnostics, and warnings.
- **Generic JSON renderer** — default for CI/agents: `--format json` or
  `--format ndjson`.
- **Optional human formatter** — per-command human-readable output for
  interactive use (color, tables, summaries).
- **Centralized redaction** — secrets never appear in any output path.

### 3.3 Authentication

- **API token** (MS-0002 path): the application-tier credential provider
  (`src/app/credentials.ts`) resolves the canonical env vars into an opaque
  `Basic` auth header and never retains the raw token (INV-SEC-1).
- **Env vars** (the sole MS-0002 source): `MARKSYNC_CONFLUENCE_BASE_URL`,
  `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` (canonical — see `.env.example`).
  Missing/empty vars → `AuthError { authKind: "MissingCredentials" }`; a
  non-`https` base URL → `InvalidBaseUrl`.
- **Validation:** `validateCredentials` probes Confluence's v2 `user/by-me`
  endpoint (no v1 fallback) via an injected `fetch` and returns the account
  identity or a typed `AuthError` (401/403 → `InvalidCredentials`, no retry;
  network error → `AuthUnreachable`; 429 → bounded backoff).
- **Error contract:** auth failures map to four stable codes —
  `AUTH_MISSING_CREDENTIALS`, `AUTH_INVALID_BASE_URL`,
  `AUTH_INVALID_CREDENTIALS`, `AUTH_UNREACHABLE` — all → exit 20 (`EXIT_AUTH`);
  only `AUTH_UNREACHABLE` is retryable.
- **Deferred:** OS keyring (`keytar`, OPEN-Q8), OAuth 2.0 / 3LO, scoped tokens,
  Data Center PAT, and `--token-file` are not implemented in MS-0002.

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
| AuthProvider | Resolves Confluence API-token credentials from env into an opaque auth header and validates them against Confluence (v2 `user/by-me`); raw token never retained (INV-SEC-1) |
| ConfigLoader | Reads + ajv-validates `marksync.yml`, returns `Result<ProjectConfig, ConfigError>` (YAML parse → `allErrors` → `applyDefaults`); pure — no Git/tree I/O (`src/app/config.ts`) |

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
      validity (surfaces `ConfigError`/`InvalidConfig` from `loadConfig`).
- [ ] `--dry-run` / `plan` shows every intended mutation before any write.

## 6. References

- [ADR-0011](../../decisions/ADR-0011-cli-output-strategy.md)
- [TDR-0002](../../decisions/TDR-0002-cli-framework.md)
- [TypeScript conventions: Result&lt;T,E&gt;](../../../.ai/rules/typescript.md)
- [Accessibility baseline](../../guides/accessibility-baseline.md)
- [Security baseline: redaction](../../guides/security-baseline.md)
- [.env.example](../../../.env.example)
