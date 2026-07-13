---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: SECURITY-BASELINE
status: Draft
created: 2026-07-05
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0006, ADR-0011]
  related_changes: [GH-26]
  summary: "Security baseline — secret management, redaction, dependency audit, converter injection safety, path-traversal confinement, and credential handling for MarkSync."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Security Baseline

_The security baseline for MarkSync. Implements NFR-SEC-1 through NFR-SEC-7,
INV-SEC-1, and R-SEC-1. All agents (@coder, @plan-writer, reviewers) must load
and follow this file._

## Core principles

1. **No secrets in any output** — logs, plans, state files, diagnostics, error
   messages, or structured output. Enforced by construction, not by convention
   (NFR-SEC-1, NFR-SEC-2).
2. **Credentials never touch project files** — API tokens live in OS keyring or
   environment variables, never in config, lock, or cache files (NFR-SEC-6).
3. **No outbound telemetry** — default config sends no data to any remote
   endpoint except the configured Confluence target (NFR-SEC-3).
4. **Defense in depth** — even if one layer fails, the next catches the secret.

## Secret management

### What counts as a secret

| Secret type | Example | Storage |
|---|---|---|
| Confluence API token | `ATATT3xFfGF0...` (long string) | OS keyring or `MARKSYNC_API_TOKEN` env |
| User email (credential pair) | `user@example.com` | `MARKSYNC_USER_EMAIL` env or keyring |
| OAuth refresh token | (long string) | OS keyring (future milestone) |
| CI masked secrets | GitHub Actions secrets | `${{ secrets.* }}` — never echoed |

### Where secrets may NOT appear

- ❌ Config files (`marksync.yaml`)
- ❌ Lock files (`marksync-lock.yaml`)
- ❌ Cache (`.marksync/`)
- ❌ Logs (`pino` output)
- ❌ Plans or diagnostics
- ❌ Error messages
- ❌ Structured output (JSON/NDJSON)
- ❌ Git history (pre-commit check)
- ❌ Environment variables echoed in debug output

### Credential lifecycle

```
Login (keyring or env)
  → Credential Provider resolves (env > keyring)
    → HTTP client uses credential in Authorization header
      → Response received; credential never logged
        → Logout removes material from keyring
```

**`logout` command** removes credentials from the OS keyring. Env-set
credentials are cleared by the user's shell, not by MarkSync.

## Redaction layer (NFR-SEC-2)

### Architecture

Every output path passes through a **centralized redaction layer** before
reaching the user/CI/log:

```
Domain/Application produces CommandResult<T>
  → Output Service applies redaction
    → CLI renders (JSON / NDJSON / human)
```

### What the redaction layer does

| Pattern | Detection | Replacement |
|---|---|---|
| Confluence API tokens | Regex: `Bearer\s+\S+`, long base64-like strings in known fields | `Bearer [REDACTED]`, `[REDACTED]` |
| OAuth tokens | Regex: `token`, `access_token`, `refresh_token` field names | `[REDACTED]` |
| Email addresses (in auth context) | Regex in auth/error fields | `[REDACTED]` (non-auth contexts may keep email) |
| URLs with credentials | `https://user:pass@host` | `https://[REDACTED]@host` |
| Long hex/base64 strings (> 20 chars) in error messages | Heuristic | `[REDACTED]` |

### Testing the redaction layer

- **Unit test per output path**: each output format (JSON, NDJSON, human) has a
  test that feeds a fake secret and asserts `[REDACTED]` in the output.
- **Gherkin invariant** (INV-SEC-1): a BDD scenario that triggers every known
  output path with a secret present and asserts zero leakage.
- **CI gate**: the redaction tests are part of the fast loop; they must never
  be skipped.

### Known limitations

- The redaction layer uses pattern matching, which is imperfect. The defense is
  **defense in depth**: credentials should never reach the output path in the
  first place (the Credential Provider and HTTP client strip them).
- If a new credential format is introduced (e.g., OAuth), add a redaction
  pattern and test in the same PR.

## Dependency audit (NFR-SEC-4)

### Supply-chain controls

| Control | Tool | Frequency | Gate |
|---|---|---|---|
| Vulnerability scan | `osv-scanner` (or `npm audit`) | Every push (CI) | Advisory during inception; **blocking at `MS-0002`** |
| License audit | `license-checker` | Every push (CI) | Reject GPL/AGPL/LGPL/UNLICENSED |
| SBOM generation | `cyclonedx` or `syft` | Every release tag | **Planned — wired at `MS-0008` release readiness** (NFR-SEC-4) |
| Lock file pinning | `bun.lock` / `bun.lockb` committed | Every PR | Lock file must match `package.json` |

### Dependency rules

- **No GPL/AGPL/LGPL dependencies** — MarkSync is MIT; viral licenses are
  incompatible.
- **No `postinstall` scripts from untrusted packages** — review and pin.
- **Pin major versions** in `package.json`; exact pins in `bun.lockb`.
- **Flag any dependency with > 20 transitive dependencies** — maintenance
  surface for a solo maintainer.

## Converter injection safety (NFR-SEC-5)

### Threat

Malicious Markdown could inject `<ac:structured-macro>` or other Confluence
server-side macros via the Markdown → Storage conversion pipeline. If a user
authors (or an attacker submits) Markdown with raw HTML containing
`<ac:structured-macro>`, the converter must NOT pass it through to the Storage
body.

### Controls

1. **Raw HTML sanitization** — the Markdown parser (`remark`) processes raw
   HTML through a sanitizer that strips `ac:`, `ri:`, and known macro tags.
2. **Whitelist approach** — only known-safe HTML elements from the canonical
   GFM subset are emitted in Storage output.
3. **Property tests** — golden-fixture tests include adversarial fixtures
   (raw `<ac:structured-macro>`, nested macro injection, CDATA smuggling) that
   must NOT appear in the rendered Storage output.
4. **Storage renderer isolation** — the Storage renderer (HAST → Storage XHTML)
   is a visitor that only emits known-safe constructs. It does not "pass
   through" arbitrary HTML.

### Testing

```typescript
// tests/golden/injection.test.ts (sketch)
it("strips ac:structured-macro from raw HTML", () => {
  const input = "Hello <ac:structured-macro ac:name='dangerous'>...</ac:structured-macro> world";
  const output = renderToStorage(input);
  expect(output).not.toContain("ac:structured-macro");
  expect(output).toContain("Hello");
  expect(output).toContain("world");
});
```

## Path-traversal confinement (NFR-SEC-7)

### Threat

A Markdown document authors local image paths (`![alt](path)`). MarkSync reads
the referenced bytes and uploads them as attachments. Without confinement, a
crafted `src` — relative `..` traversal (`../../etc/passwd`), absolute paths,
symlinks that escape the configured root, URL-encoded traversal, nested `..`,
or a root-prefix trick — could make MarkSync read and upload arbitrary bytes
outside the configured content root.

### Controls

1. **Root confinement by canonicalization** — the `AssetResolver`
   (`src/domain/assets/resolver.ts`) resolves each local `src` relative to the
   document directory, then canonicalizes **both** the root and the target via
   `fs.realpathSync` (this resolves symlinks — story R1, CEO-resolved) and
   asserts the canonical target is within the canonical root (exact match or
   `root + path.sep` prefix). On escape → `Forbidden { operation:
   "path-traversal" }`.
2. **0 bytes read on failure** — the confinement check runs **before** any
   `readBytes` call; an escaping path is rejected and never opened. The
   `readBytes` hook is injectable so unit tests assert it is never invoked for
   an escaping path.
3. **Defense at the gate** — confinement is evaluated in `computePlan` (the
   pure dry-run); a `Forbidden(path-traversal)` aborts the plan before any
   write. No per-doc skip — a security failure halts the plan.
4. **Remote images untouched** — `http(s)` `src` values are skipped (they
   render as `<ri:url>`); only local paths enter the confinement check.

### Testing

- **Unit vectors** — a fixture suite covers every escape vector (relative `..`,
  absolute, symlink-escape, URL-encoded, nested `..`, root-prefix); each must
  yield `Forbidden(path-traversal)` and the read-bytes hook must never fire.
- **Integration** — the resolver + mock target cycle (upload/reuse/update) and
  the format matrix (png/jpg/gif/svg/webp) are covered by integration tests.

## Credential storage (NFR-SEC-6)

### Keyring (spike-gated)

- **OS keyring** (macOS Keychain, Windows Credential Manager, Linux Secret
  Service) via `keytar` or OS-native.
- **Spike-gated**: `keytar` is a native module that may conflict with Bun
  `build --compile`. If it fails, env-token is the guaranteed `MS-0002` path.
- `logout` command removes the credential material from the keyring.

### Environment variables (guaranteed path)

> **Canonical list:** [`.env.example`](../../.env.example) is the single source
> of truth for all environment variables. The table below lists only the
> security-relevant subset.

| Variable | Purpose | Required? |
|---|---|---|
| `MARKSYNC_API_TOKEN` | Confluence API token | Yes (CI) or use keyring |
| `MARKSYNC_USER_EMAIL` | Email for API token auth pair | Yes (CI) or use keyring |
| `MARKSYNC_CONFLUENCE_BASE_URL` | Tenant URL | Yes |
| `MARKSYNC_ALLOW_BRANCHES` | Override branch restriction (default `["main"]`) | No |

Additional env vars (`MARKSYNC_CACHE_DIR`, `MARKSYNC_LOG_LEVEL`,
`MARKSYNC_NO_COLOR`, `MARKSYNC_E2E_*`) are documented in
[`.env.example`](../../.env.example).

## Branch restriction (ADR-0006)

Sync is restricted to configured `allowBranches` (default `["main"]`). This is a
safety control: it prevents accidental sync from feature branches or
work-in-progress branches.

- Override via `MARKSYNC_ALLOW_BRANCHES` env (CI use case).
- `doctor` reports the current branch and whether it is allowed.

## Logging

- **Structured JSON** via `pino` — machine + human readable.
- **Redacted by construction** — `pino` is configured with redaction paths for
  known secret fields.
- **No `console.log`** in production code (lint rule). Use `pino` logger.
- **Diagnostic codes** (`MS-0003` target) — stable machine-readable codes paired
  with human remediation text.

## Security checklist (for every PR)

- [ ] No new dependencies added without justification (weight, license, vuln
  scan).
- [ ] No secrets in new code paths (run redaction tests).
- [ ] No `console.log` of raw objects (use `pino` with redaction).
- [ ] No new credential patterns without a redaction rule + test.
- [ ] No raw HTML pass-through in the converter (run injection tests).
- [ ] Local image/asset paths confined to the configured root (run
  path-traversal vector tests — NFR-SEC-7).
- [ ] Branch restriction logic not bypassed.
- [ ] No outbound network calls except to the configured Confluence target.

## Incident response

If a secret is accidentally committed or leaked:

1. **Immediately revoke** the credential (Atlassian account → API tokens →
   revoke).
2. **Audit** logs/plans/output that may have captured the secret.
3. **Force-push** the secret out of Git history (if the repo is private; if
   public, the secret must be considered compromised regardless).
4. **Post-mortem**: add a redaction pattern + test to prevent recurrence.

## See also

- [`.env.example`](../../.env.example) — all environment variables.
- [NFR-SEC-*](../spec/nonfunctional.md) — security NFRs.
- [R-SEC-1](../inception/analysis/risks.md) — security risk register.
- [ADR-0006](../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
  — branch restriction.
- [ADR-0011](../decisions/ADR-0011-cli-output-strategy.md) — centralized
  redaction in output service.
