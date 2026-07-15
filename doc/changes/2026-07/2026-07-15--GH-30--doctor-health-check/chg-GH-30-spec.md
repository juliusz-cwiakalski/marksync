---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-30
  type: feat
  status: Proposed
  slug: doctor-health-check
  title: "[MS2-E5-S2] Doctor health-check"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, doctor, diagnostics, observability, health-check]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: low
  dependencies:
    internal: [config-loader, credential-provider, cli-framework, confluence-adapter, target-port]
    external: [Confluence Cloud API]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver a working `marksync doctor` command that runs an MS-0002-minimal health checklist (Git, config, credentials, connectivity, target topology, permissions, renderer) producing an AI-readable `DoctorReport` with per-check pass/fail/warn + suggested fixes — read-only by default, CI-gateable via a non-zero exit on any `fail`, and never leaking the token (NFR-OBS-4, NFR-COMP-4, INV-SEC-1).

## 1. SUMMARY

This change replaces the `doctor` **stub** with a real implementation that verifies the local environment and the Confluence target before any create/adopt/sync. It runs a bounded sequence of checks, each yielding `{ check, status, detail, fix? }`, and assembles them into a structured `CommandResult<DoctorReport>` for CI/agents (JSON via the existing renderer) plus a human table. It is **read-only by default** (auth GET + space GET + parent GET only — no writes); scratch-page and attachment capability probes run **only** when `--probe-capabilities` is set (R1, CEO-resolved).

This story is **orchestration + UX + diagnostics only**. Every primitive it depends on — `loadConfig`, `resolveCredentials` + `validateCredentials`, `createRepository` / `createTarget`, and the `TargetSystem` port's read/probe methods (`getPage`, `getProperty`, `searchPages`, `getRestrictions`, `attachmentExists`) — already exists and is reused as-is. No new domain logic, no new dependencies.

## 2. CONTEXT

### 2.1 Current State Snapshot

The CLI router already registers a `doctor` subcommand, but its handler is a **stub** that returns a placeholder `INTERNAL` error ("doctor is not yet implemented (MS2-E5-S2)") → exit 99. No pre-flight / health-check command exists today. The same stub→real pattern was just used for `repair-state` (GH-28).

All primitives doctor needs are delivered and merged:

- **Config** (E2-S2): `loadConfig(cwd)` → `Result<ProjectConfig, ConfigError>`; surfaces `InvalidConfig` AI-readably (ajv `allErrors`). `ProjectConfig.targets` is `Record<string, TargetConfig>` where `TargetConfig = { type: "confluence", spaceKey, parentPageId }`; the `default` target is the convention used by the other commands. `ProjectConfig.root` is the corpus root.
- **Credentials** (E2-S4): `resolveCredentials()` resolves the canonical env vars into an opaque `Basic` auth header and a masked email — the raw token is consumed by base64 and **never retained** (INV-SEC-1). `validateCredentials(creds, opts)` probes the v2 `GET /wiki/api/v2/user/by-me` endpoint via an injected `fetch` and returns `AccountIdentity` or a typed `AuthError` (`MissingCredentials` / `InvalidBaseUrl` / `InvalidCredentials` / `AuthUnreachable`); 429 is retried with bounded backoff.
- **Ports / adapter** (E3-S4): `createRepository(repoPath)` + `createTarget(creds, spaceKey)` produce a `Repository` (Git) and a `TargetSystem` (Confluence). The `TargetSystem` port exposes the read/probe methods doctor needs: `getPage`, `getProperty`, `searchPages` (CQL), `getRestrictions`, `attachmentExists`, `listAttachments`.
- **Output contract** (ADR-0011): every command returns `CommandResult<T>` = `{ schemaVersion, runId, exitCode, data?, error?, warnings?, timing? }`. The `ok<T>(data, meta?)` factory **hardcodes `exitCode: 0`**; the `err(code, message, retryable)` factory computes `exitCode` via `codeToExitCode(code)` from the stable `CODE_TO_EXIT` map and produces `CommandResult<never>` with **no `data`**. The renderer owns `--output json|ndjson|human` (and the `--json` alias); commands only return the typed result.

### 2.2 Pain Points / Gaps

- An operator hitting a setup failure (bad token, wrong `spaceKey`, missing `parentPageId`, Git not on `$PATH`, malformed `marksync.yml`) has **no guided diagnosis** — the failure surfaces only when `sync`/`plan` runs, often as an opaque auth or config error with no pre-flight that pinpoints *which* precondition is unmet.
- CI has **no gate** to run before `sync` that fails fast and readably on environment problems; a misconfigured run wastes time and produces confusing structured errors instead of a clean health report.
- The permission-asymmetry hazard (R-FEA-10) — where the account cannot read some subtree pages — is **undisclosed** until a 403 is misclassified as "deleted" during sync. There is no place that surfaces the "403 → warn+skip, not delete" operating assumption up front.
- The doctor capability is advertised in the feature spec (§3.1) and required by NFR-OBS-4 (MS-0002 minimal), but only a stub exists.

## 3. PROBLEM STATEMENT

Because there is no pre-flight health check, an operator (or CI/agent) cannot verify that the environment and the Confluence target are ready before running `sync`, resulting in late, opaque setup-failure errors, wasted CI cycles, and an undisclosed permission-asymmetry assumption that risks misclassifying a 403 as a deletion (R-USA-1, R-FEA-10, NFR-OBS-4).

## 4. GOALS

- **G-1**: A working `marksync doctor` command that runs the MS-0002-minimal checklist — Git availability, config validity, credential resolution + validation, base-URL/space reachability, parent-page existence/writability, permission/visibility advisory, and renderer availability.
- **G-2**: Read-only by default (no writes); `--probe-capabilities` opt-in for the content-property + attachment capability probes (R1, CEO-resolved).
- **G-3**: AI-readable diagnostics — each check returns `pass`/`warn`/`fail` + a suggested fix; a structured `DoctorReport` consumable by CI/agents as JSON.
- **G-4**: CI-gateable exit code — non-zero on any `fail`, **while still carrying `data=DoctorReport`** (doctor is success-at-command-level; the non-zero exit is a CI signal, not a `CommandResult.error`).
- **G-5**: No token leakage — INV-SEC-1 preserved; doctor introduces no new credential exposure (it reuses the token-dropping credential provider and the centralized redaction layer).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Setup-failure classes diagnosable by `doctor` before `sync` | 100% of the MS-0002 minimal set (Git, config, creds, base URL, space, parent page) |
| Checks carrying a status + (on fail/warn) a suggested fix | 100% |
| Token/secret occurrences in any doctor output | 0 (INV-SEC-1) |
| Default-doctor writes to Confluence | 0 (read-only unless `--probe-capabilities`) |
| `--json` output parseable as a `CommandResult<DoctorReport>` envelope | 100% |

### 4.2 Non-Goals

- **NG-1**: The full MS-0003 doctor — proxy/CA hints, deeper capability discovery, a setup-failure taxonomy, and guided/auto remediation. MS-0002 is diagnose + suggest only.
- **NG-2**: Auto-remediation. Doctor diagnoses and suggests fixes; it never mutates config, credentials, or Confluence state (other than the opt-in, self-cleaning scratch-page probe).
- **NG-3**: Wiring `doctor` as a mandatory pre-sync gate. `sync` does **not** require `doctor` to pass first in MS-0002 (Q1, CEO-resolved); MS-0003 may add a pre-sync check.
- **NG-4**: New domain primitives or new dependencies. `loadConfig`, `resolveCredentials`/`validateCredentials`, `createRepository`/`createTarget`, and the `TargetSystem` port are reused unchanged.
- **NG-5**: New Confluence REST endpoints or a new auth path.

## 5. FUNCTIONAL CAPABILITIES

 | ID | Capability | Rationale |
 |----|------------|-----------|
 | F-1 | Verify the local environment (Git + config) | Git is an explicit external prereq (TDR-0003 / NFR-COMP-4) and a malformed/missing config is the most common setup failure; surfacing `ConfigError` AI-readably removes guesswork (feature-cli §5). |
 | F-2 | Verify credentials + target connectivity | Auth is the highest-friction setup step (R-USA-1); reusing `resolveCredentials` + `validateCredentials` (real `GET /user/by-me`) and a space read confirms the account can reach and read the configured space without a full sync. |
 | F-3 | Verify target topology + (opt-in) capability probes | The configured `parentPageId` must exist and be writable; content-property and attachment capabilities determine whether provenance and assets will work — but probing them writes a scratch page, so it is opt-in (`--probe-capabilities`) and read-only by default (R1). |
 | F-4 | Surface the permission/visibility assumption (R-FEA-10) | Doctor must disclose that it assumes full subtree read access and that a 403 will be treated as warn+skip (not delete) during sync — so a 403 is never misclassified as a deletion. |
 | F-5 | Report renderer availability (informational) | A renderer readiness problem (e.g. the configured `render` mermaid policy cannot reach Kroki) would silently degrade diagram rendering during `sync`; doctor surfaces it as an informational `warn`, never a CI-gating `fail`. |
 | F-6 | Emit a structured `DoctorReport` with per-check status + fixes | Operators and CI/agents need machine-readable, per-check pass/fail/warn + AI-readable detail + suggested fix (NFR-OBS-4; ADR-0011 structured output). |
 | F-7 | CI-gateable exit code without losing the report | A non-zero exit on any `fail` lets CI gate (`doctor && sync`); but doctor always returns its report, so the non-zero exit is a signal, not a `CommandResult.error` (resolves the `ok()`-hardcodes-0 / `err()`-drops-`data` tension). |
 | F-8 | Read-only by default; explicit capability-probe opt-in | No side-effects unless the operator explicitly requests capability probes (R1, CEO-resolved); safe to run in any environment. |

### 5.1 Capability Details

**F-1: Verify the local environment (Git + config)** — One check confirms Git is on `$PATH` and that the working directory is inside a valid repository (TDR-0003 / NFR-COMP-4). A second check calls the existing `loadConfig(cwd)`; on `ConfigError` (`InvalidConfig` / file-missing / YAML-parse) it reports `fail` with the AI-readable error detail and a suggested fix (e.g. "run `marksync init`"). These checks can produce `fail` and therefore gate the exit code.

**F-2: Verify credentials + target connectivity** — Resolves credentials via `resolveCredentials()` (fail AI-readably on `MissingCredentials` / `InvalidBaseUrl`, with the offending env-var names — never the token), then validates them via `validateCredentials(creds, { fetch })` against the real v2 `GET /user/by-me`. A further check reads the configured `spaceKey` (via the `TargetSystem` port / a light CQL or space read) to confirm base-URL reachability and space access. `InvalidCredentials` / `AuthUnreachable` / space-inaccessible each map to a distinct `fail` with a suggested fix. These checks can produce `fail` and gate the exit code. (INV-SEC-1: the raw token never enters the report — only the masked email and opaque status survive.)

**F-3: Verify target topology + (opt-in) capability probes** — A read-only check confirms the configured `parentPageId` exists and is writable (via `getPage(parentPageId)`; a missing/forbidden parent → `fail` with a fix). The **content-property capability** (can the `marksync.metadata` property API respond / be written) and the **attachment capability** (is the v1 attachment endpoint reachable) are probed **only** when `--probe-capabilities` is set: the probe creates a scratch page under the parent subtree, writes a throwaway `marksync.metadata` test property, and (for attachments) confirms the endpoint responds, then deletes the scratch page (self-cleaning). Without the flag these two checks are reported as `skipped` (a distinct non-failing status) and **zero** writes occur. The parent-page check can produce `fail` and gates the exit code; the capability probes (when run) can produce `fail` and gate the exit code; when skipped they never gate.

**F-4: Surface the permission/visibility assumption (R-FEA-10)** — A `warn`-only check (it never produces `fail` and never gates the exit code) that discloses the operating assumption: doctor/sync assume the account has full read access to the configured subtree, and a 403 on a subtree page during sync will be treated as **warn+skip, not delete**. Where the port can detect restrictions (`getRestrictions`) or incomplete visibility (`searchPages` CQL), the warning is enriched with specifics; otherwise it is the standing advisory. This makes the 403→warn+skip policy explicit before sync.

**F-5: Report renderer availability (informational)** — An informational `warn`-only check that the configured render path is sound: for the `render` mermaid policy, that the Kroki endpoint is reachable via a read-only probe (ADR-0002 / GH-69); for the `code` / `skip` policies, informational only (no remote surface to probe). On failure it reports `warn` with a `fix`. It is **never** a `fail` and never gates the exit code — a renderer readiness problem degrades output but does not block environment verification. MS-0002 has **no** `happy-dom` / in-process `mermaid` runtime dependency (those are deferred to MS-0003+; `package.json` confirms neither is present); the exact read-only probe is a low-risk coder decision (flagged in the delivery plan) — the intent is to surface a renderer readiness problem as a non-blocking warn, not to over-specify a probe surface.

**F-6: Emit a structured `DoctorReport`** — The command returns `CommandResult<DoctorReport>` (§8.3). Each `DoctorCheck` carries a stable check id, a `status` (`pass` / `warn` / `fail` / `skipped`), an AI-readable `detail`, and an optional `fix`. The report carries a summary (counts by status) and a derived `worstStatus`. JSON is produced by the existing renderer via `--json` / `--output json` — the primary machine contract; the human path is rendered via the existing **generic** `renderHuman` fallback (the same path the other commands, including `repair-state`, use — no command currently registers a dedicated formatter). A richer per-command table formatter is an **optional future enhancement**, not a requirement of this change.

**F-7: CI-gateable exit code without losing the report** *(resolves the PM-flagged design point — see DEC-4)* — `ok()` hardcodes `exitCode: 0` and `err()` produces `CommandResult<never>` with no `data`; neither fits "command succeeded and produced a report, but a check failed so CI should gate." Therefore doctor **constructs the `CommandResult<DoctorReport>` directly** (not via `ok()`/`err()`): `data` is always the `DoctorReport`, `error` is **never** set, and `exitCode` is derived from the report's worst status — `EXIT_OK` (0) when no check is `fail`, and a single stable non-zero value otherwise. To keep that value stable, discoverable, and **not conflated with a domain error class** (doctor aggregates many check types; no single existing class — auth/config/conflict/invariant — honestly describes "a health check failed"), a new stable code `DOCTOR_FAIL` is registered in `CODE_TO_EXIT`, mapped to a dedicated `EXIT_HEALTH` class (proposed value **60**, fitting the existing tens-scheme and avoiding every documented error class). See DEC-4 and OQ-1.

**F-8: Read-only by default; explicit capability-probe opt-in** — With no flag (default), doctor performs only reads: the `GET /user/by-me` validation, a space read, and a parent-page read. The `--probe-capabilities` flag adds the self-cleaning scratch-page + attachment probes (F-3). The flag is added to the existing `doctor` subcommand registration. (R1, CEO-resolved.)

## 6. USER & SYSTEM FLOWS

```
Flow 1: Healthy pre-flight (default, read-only)
  Operator/CI runs `marksync doctor` →
  resolve config (loadConfig) → resolve creds (resolveCredentials) → validate creds
  (GET /user/by-me) → read space → read parent page →
  emit permission/visibility advisory (warn) + renderer availability (info) →
  all gating checks pass → exitCode 0, data=DoctorReport (all pass/warn)

Flow 2: Setup failure (CI gates)
  Bad token / wrong spaceKey / missing parentPageId / Git missing / invalid config →
  `marksync doctor` → the offending check reports `fail` + suggested fix →
  exitCode = DOCTOR_FAIL (EXIT_HEALTH, 60); data=DoctorReport still present; error unset →
  CI `doctor && sync` stops before sync; agent reads the JSON report for the failing check + fix

Flow 3: Capability probe (opt-in write)
  Operator runs `marksync doctor --probe-capabilities` →
  create scratch page under parent subtree → write throwaway marksync.metadata property →
  confirm attachment endpoint → delete scratch page (self-cleaning) →
  report content-property + attachment capability pass/fail; exitCode gated by their status

Flow 4: Permission asymmetry disclosed (R-FEA-10)
  Account lacks full subtree read access →
  `marksync doctor` → permission/visibility check emits `warn`
  ("assuming full read access; 403 → warn+skip, not delete") →
  not a fail → exitCode unaffected; the policy is surfaced before sync
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Replacing the `doctor` stub with a real implementation.
- The MS-0002-minimal checklist: Git availability + valid repo; config validity (`loadConfig`); credential resolution + validation (`resolveCredentials` + `validateCredentials`, real `GET /user/by-me`); base-URL reachability + space access; parent-page existence/writability; permission/visibility advisory (R-FEA-10); renderer availability (informational).
- Opt-in content-property + attachment capability probes via `--probe-capabilities` (self-cleaning scratch page; read-only default).
- A `DoctorReport` (per-check status + AI-readable detail + suggested fix) with a summary and derived worst status.
- A `CommandResult<DoctorReport>` produced **directly** (not via `ok()`/`err()`) so it carries `data` with a non-zero exit on any `fail`; registration of the stable `DOCTOR_FAIL` code → `EXIT_HEALTH` in the exit-code map (DEC-4).
- App-tier doctor orchestration (mirroring the `repair-state` + thin-CLI-handler split), respecting the DEC-1 tier rules: the presentation handler imports only `#cli/output` + `#app/*`; the app module imports `#domain/*`.
- INV-SEC-1 preservation: reuse of the token-dropping credential provider + the centralized redaction layer; the `DoctorReport` is scrubbed of any token-shaped substring (defense-in-depth).

### 7.2 Out of Scope

- [OUT] The full MS-0003 doctor (proxy/CA hints, deeper capability discovery, setup-failure taxonomy, guided/auto remediation).
- [OUT] Auto-remediation — doctor diagnoses + suggests only.
- [OUT] Wiring `doctor` as a mandatory pre-sync gate (Q1 resolved: independent in MS-0002; MS-0003 may add a pre-sync check).
- [OUT] New domain primitives, new dependencies, or new Confluence REST endpoints — all consumed primitives are reused unchanged.
- [OUT] Changing the credential provider, the auth validation endpoint, or the `CommandResult<T>` envelope shape.
- [OUT] Writes during a default (no-flag) doctor run.

### 7.3 Deferred / Maybe-Later

- MS-0003 fuller diagnostics consuming the same `DoctorReport` schema (proxy/CA hints, deeper capability discovery).
- An optional pre-sync `doctor` gate (MS-0003 candidate; Q1 resolved "no" for MS-0002).
- Richer permission discovery (enumerate restricted subtree pages) once the port exposes more.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change adds no new endpoints. It consumes, read-only by default:
- The v2 `GET /wiki/api/v2/user/by-me` (via `validateCredentials`'s injected `fetch`) — already implemented (E2-S4).
- The `TargetSystem` port's read/probe methods already implemented by the Confluence adapter: `getPage(parentPageId)`, `searchPages(cql)` (space read), `getProperty` / `putProperty` (capability probe, opt-in), `attachmentExists` / `uploadAttachment` (capability probe, opt-in), `getRestrictions` (permission advisory enrichment).

### 8.2 Events / Messages

N/A — no new events or message types.

### 8.3 Data Model Impact

 | ID | Element | Description |
 |----|---------|-------------|
 | DM-1 | `DoctorReport` | The success payload of `doctor`: `{ checks: DoctorCheck[], summary: { pass, warn, fail, skipped, total }, worstStatus, probeCapabilities }`. Serialized via the existing `CommandResult<T>` envelope. Carries no credentials (INV-SEC-1). |
 | DM-2 | `DoctorCheck` | `{ check: <stable-id>, status: "pass" \| "warn" \| "fail" \| "skipped", detail: string, fix?: string }`. Stable check ids (no magic strings) distinguish: `git-available`, `config-valid`, `credentials`, `space-access`, `parent-page`, `content-property`, `attachment`, `permission-visibility`, `renderer`. |
 | DM-3 | `--probe-capabilities` flag | Boolean on the existing `doctor` subcommand registration. Default `false` (read-only). When `true`, enables the self-cleaning scratch-page + attachment probes (F-3). |
 | DM-4 | `DOCTOR_FAIL` exit code | A new stable code registered in `CODE_TO_EXIT`, mapped to a dedicated `EXIT_HEALTH` class (proposed **60**). Used ONLY to derive doctor's non-zero `exitCode` when a check fails; `error` is never set and `data` is always the report (DEC-4). |

### 8.4 External Integrations

**Confluence Cloud API** — existing integration, no contract change. Default-doctor issues only reads (`GET /user/by-me`, space read, parent-page read). The `--probe-capabilities` path additionally creates + deletes a scratch page and writes a throwaway content property — all via existing adapter methods, within the configured parent subtree, in the sandbox/parent.

### 8.5 Backward Compatibility

**Fully backward compatible.** The change replaces a stub with a real implementation behind the already-registered `doctor` subcommand. The `CommandResult<T>` envelope shape is unchanged. The only addition to the shared exit-code contract is a **new** code/class (`DOCTOR_FAIL` → `EXIT_HEALTH`) — additive, not a reclassification of any existing code, so no existing consumer's exit-code handling changes (unknown codes already fall back to `EXIT_INTERNAL`; this adds a known mapping). The `--probe-capabilities` flag is additive. Existing configs, locks, and credentials are unchanged.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

 | ID | Requirement | Threshold |
 |----|-------------|-----------|
 | NFR-OBS-4 | `doctor` health-check (MS-0002 minimal) | Doctor verifies auth, base URL, space access, parent page, config validity, and Git availability — the full MS-0002 minimal set — before any create/adopt. |
 | NFR-COMP-4 | Git CLI prerequisite | Doctor verifies Git is on `$PATH` and reports `fail` with a fix when it is absent (TDR-0003). |
 | NFR-SEC-1 / INV-SEC-1 | No secrets in output | **0** tokens/secrets in any doctor output (JSON or human); the raw token is never retained (`resolveCredentials` drops it); the `DoctorReport` is scrubbed of token-shaped substrings and passes the centralized redaction layer. |
 | NFR-OBS-1 | Stable exit codes | Doctor's exit code is stable and documented: `0` on no-`fail`; `DOCTOR_FAIL` → `EXIT_HEALTH` (**60**) on any `fail`. |
 | NFR-OBS-2 | Structured output | `--json` emits a parseable `CommandResult<DoctorReport>` envelope with `schemaVersion`, `runId`, `exitCode`, and `data`. |
 | NFR-A11Y-1 | No color dependency | Human output is readable without color; the existing `--no-color` / non-TTY auto-disable applies; JSON output has no color. |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new telemetry endpoints and no outbound telemetry (NFR-SEC-3). Observability is delivered through the structured `DoctorReport` (per-check status + stable check ids + suggested fixes) emitted via the existing `CommandResult` output. Each doctor run is correlatable via the existing `runId` on every result (NFR-OBS-2). Doctor's own diagnostics ARE the observability surface for setup failures.

## 11. RISKS & MITIGATIONS

 | ID | Risk | Impact | Probability | Mitigation | Residual Risk |
 |----|------|--------|-------------|------------|---------------|
 | RSK-1 | Token leakage in diagnostics (e.g. an error body or a base URL with embedded credentials echoed into a check `detail`) | H | L | `resolveCredentials` already drops the raw token and masks the email; doctor never logs the `authHeader`; the `DoctorReport` is scrubbed of token-shaped substrings and passes the centralized redaction layer (INV-SEC-1, NFR-SEC-1). Integration tests assert redaction against fixtures containing token-shaped strings. | L |
 | RSK-2 | Capability probe leaves a scratch page behind (side-effect / clutter) | M | L | Probes run **only** with `--probe-capabilities` (read-only default); the scratch page is created + deleted in a `try/finally`-equivalent self-cleaning path; a leftover is reported as a `warn` (R1, CEO-resolved). | L |
 | RSK-3 | A transient remote hiccup (429 / timeout) fails a check and gates CI falsely | M | M | `validateCredentials` already retries 429 with bounded backoff; transport failures are reported as the specific check's `fail` with a `retryable` hint in `detail` rather than crashing the command; the report distinguishes "environment wrong" from "remote momentarily unavailable." | M |
 | RSK-4 | Exit-code conflation — CI/agents misread doctor's non-zero exit as a hard domain error | M | L | The non-zero exit uses a dedicated `DOCTOR_FAIL` → `EXIT_HEALTH` (60) class distinct from every domain error class; `data=DoctorReport` is always present and `error` is never set, so consumers reading the envelope see a successful command with a health report, not an error (DEC-4, F-7). | L |
 | RSK-5 | Adding `DOCTOR_FAIL`/`EXIT_HEALTH` extends the documented 9-class exit set | L | L | The addition is additive (no existing code reclassified) and documented in the exit-code module; OQ-1 asks the decision-advisor to confirm the numeric value (60) vs. reusing an existing class before implementation. | L |

## 12. ASSUMPTIONS

- The primitives `loadConfig` (E2-S2), `resolveCredentials` + `validateCredentials` (E2-S4), `createRepository` / `createTarget` (E3-S4), and the `TargetSystem` port read/probe methods exist, are correct, and are reused unchanged.
- `resolveCredentials` drops the raw token and returns only an opaque `authHeader` + masked email (INV-SEC-1); doctor never needs the raw token.
- The `CommandResult<T>` envelope, the `ok()`/`err()` factories, and the `CODE_TO_EXIT` map are stable; the `doctor` subcommand is already registered (only the handler + the `--probe-capabilities` flag are new).
- The existing renderer produces valid JSON for `--json` / `--output json` from any `CommandResult<T>`; doctor only returns the typed result.
- The `default` target (`config.targets.default`) is the convention used by the sibling commands and is the target doctor verifies.
- The 9-class exit-code set is documented; introducing a dedicated `EXIT_HEALTH` value is a documented, additive extension (OQ-1 confirms the numeric).

## 13. DEPENDENCIES

 | Direction | Item | Notes |
 |-----------|------|-------|
 | Depends on | MS2-E2-S2 (config loader) | `loadConfig` → `Result<ProjectConfig, ConfigError>`. **RESOLVED** (merged). |
 | Depends on | MS2-E2-S3 (CLI framework) | `CommandResult<T>` envelope, exit-code map, router registration, renderer + human formatter. **RESOLVED** (merged). |
 | Depends on | MS2-E2-S4 (credential provider) | `resolveCredentials` + `validateCredentials` (v2 `GET /user/by-me`). **RESOLVED** (merged). |
 | Depends on | MS2-E3-S4 (Confluence adapter + target port) | `createRepository` / `createTarget` + `TargetSystem` read/probe methods. **RESOLVED** (merged). |
 | Blocks | MS-0002 release | NFR-OBS-4 (doctor minimal) is an MS-0002 release item. |
 | Blocks | MS-0003 (full doctor) | Establishes the `DoctorReport` schema + command surface the fuller diagnostics extend. |

## 14. OPEN QUESTIONS

  | ID | Question | Context | Status |
  |----|----------|---------|--------|
  | OQ-1 | Confirm the dedicated doctor exit value (`EXIT_HEALTH` = **60**) vs. reusing an existing class (e.g. `EXIT_CONFIG` = 10) | The *mechanism* is decided (DEC-4): construct `CommandResult` directly, `data` always present, `error` never set, non-zero on any `fail`. The exact numeric touches the shared, documented exit-code contract (currently a 9-class set). | **RESOLVED** — [TDR-0009](../../../decisions/TDR-0009-doctor-health-check-exit-code.md): Option A confirmed. `EXIT_HEALTH = 60` + code string `DOCTOR_FAIL` (lives only in `CODE_TO_EXIT`, not in the error-kind→code mapper). Additive; no existing code reclassified; `CONFLICT→30` (AC-6) untouched. |

## 15. DECISION LOG

 | ID | Decision | Rationale | Date |
 |----|----------|-----------|------|
 | DEC-1 | Read-only by default; `--probe-capabilities` opt-in for scratch-page + attachment probes | Default doctor performs no writes (auth GET + space GET + parent GET only); capability probes are side-effecting so they require explicit opt-in and self-clean (R1, CEO-resolved). | 2026-07-15 (R1 resolved) |
 | DEC-2 | Reuse existing primitives; add only orchestration + UX + `DoctorReport` | config/creds/ports/adapter already delivered and tested; this story is the wiring + diagnostics, not new domain logic or new dependencies. | 2026-07-15 (from story) |
 | DEC-3 | App-tier orchestration + thin CLI handler (mirror `repair-state` / `sync` split) | Respects DEC-1 tier rules; keeps the presentation handler free of domain/infra imports; the handler consumes the app-tier `Result<DoctorReport, MarkSyncError>` structurally. | 2026-07-15 (architecture convention) |
 | DEC-4 | **Exit-code resolution** — construct `CommandResult<DoctorReport>` directly (not `ok()`/`err()`); `data` always present, `error` never set; `exitCode` from the report's worst status; register `DOCTOR_FAIL` → dedicated `EXIT_HEALTH` (**60**, confirmed by [TDR-0009](../../../decisions/TDR-0009-doctor-health-check-exit-code.md)) | Resolves the PM-flagged design point. `ok()` hardcodes `exitCode: 0` and `err()` drops `data` (`CommandResult<never>`) — neither fits a successful command that yields a report but must gate CI. Constructing directly keeps `data=DoctorReport` on every path while allowing a non-zero exit. A dedicated, non-conflating code is chosen over overloading a domain error class (auth/config/conflict/invariant) because doctor aggregates many check types and no single existing class honestly describes "a health check failed." Rejected alternative: reuse `EXIT_CONFIG` (10) — rejected because it misleads when the failing check is auth, network, or Git. Numeric confirmed by TDR-0009 (Option A: `EXIT_HEALTH = 60`, additive, no reclassification). | 2026-07-15 (design point resolved; numeric confirmed by TDR-0009) |
 | DEC-5 | `sync` does not require `doctor` to pass first (MS-0002) | Keeps the commands independent and predictable; MS-0003 may wire an optional pre-sync check (Q1, CEO-resolved). | 2026-07-15 (Q1 resolved) |
 | DEC-6 | `DoctorReport` redaction is defense-in-depth | `resolveCredentials` already drops the raw token; the report is additionally scrubbed of token-shaped substrings and passes the centralized redaction layer so no new leakage path is introduced (INV-SEC-1). | 2026-07-15 (security) |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

 | Component | Impact |
 |-----------|--------|
 | `doctor` CLI handler | **Replaced** — stub becomes a real **thin** handler (slimmer than `repair-state`, because the handler resolves **nothing** domain-side — it does **not** mirror `repair-state`'s resolve-config→resolve-creds→create-target→abort control flow). It resolves `cwd`, passes `{ cwd, probeCapabilities, fetch }` to the app-tier use case `runDoctor(...)`, and receives `Result<DoctorReport, MarkSyncError>`. **`runDoctor` owns ALL resolution probes** (config / creds / Git / target) as fail-able checks inside the report — a config/creds failure is itself a check result, not a handler-level abort (DEC-3). On `Result.ok(report)` the handler builds `CommandResult<DoctorReport>` **directly** (DEC-4 / TDR-0009): `data = report`, `error` unset, `exitCode = codeToExitCode("DOCTOR_FAIL")` (= `EXIT_HEALTH` 60) when any check is `fail`, else `EXIT_OK` (0). On `Result.err` it maps via `mapMarkSyncErrorToCommandError` → `err(...)` — reserved only for an unexpected infrastructure failure that prevents producing a report at all (e.g. an uncaught throw); the normal check-failure path carries the report as `data`. Returns `Promise<CommandResult<DoctorReport>>`. |
 | CLI router | **Updated** — adds the `--probe-capabilities` flag to the existing `doctor` subcommand; passes flags into the handler. |
 | App-tier doctor orchestration | **New** — the `runDoctor` use case (mirrors `repair-state`'s app-tier placement). **`runDoctor` owns ALL resolution probes** — config (`loadConfig`), credentials (`resolveCredentials` + `validateCredentials`), Git (`Repository`), and target (`TargetSystem`) are **fail-able checks INSIDE the `DoctorReport`**, NOT preconditions the handler resolves. A failed resolution becomes that check's `fail` (the report is still produced), never a handler-level abort — this is the control-flow difference from `repair-state`, where a config/creds failure aborts the command. Returns `Result<DoctorReport, MarkSyncError>` (the `err` arm is reserved only for failures that cannot be classified into a check); imports `#domain/*` only. |
 | Exit-code map | **Extended** — adds the stable `DOCTOR_FAIL` code → `EXIT_HEALTH` (proposed 60); additive, no existing code reclassified (DEC-4, OQ-1). |
 | `DoctorReport` + check ids | **New** — success payload + stable check-id set (DM-1, DM-2). |
 | Config loader / credential provider / target port / adapter | **No change** — reused as delivered. |

## 17. ACCEPTANCE CRITERIA

 | ID | Criterion | Linked |
 |----|-----------|--------|
 | AC-F1-1 | **Given** Git is on `$PATH` and the cwd is inside a valid repo, `marksync.yml` is present and valid, credentials are present and valid, the base URL is reachable, the `spaceKey` is accessible, and the `parentPageId` exists, **when** `marksync doctor` runs, **then** every gating check reports `pass`, the permission/visibility advisory and renderer checks report `pass`/`warn`, and the exit code is `0`. | F-1, F-2, F-3, NFR-OBS-4 |
 | AC-F1-2 | **Given** Git is not on `$PATH` (or the cwd is not inside a valid repo), **when** `marksync doctor` runs, **then** the `git-available` check reports `fail` with an AI-readable `detail` and a suggested `fix`. | F-1, NFR-COMP-4 |
 | AC-F1-3 | **Given** `marksync.yml` is missing or invalid, **when** `marksync doctor` runs, **then** the `config-valid` check reports `fail` surfacing the `ConfigError`/`InvalidConfig` AI-readably (offending field/instance path + expected shape) and a suggested `fix`. | F-1, feature-cli §5 |
 | AC-F2-1 | **Given** credentials are missing, malformed, or rejected by Confluence (`InvalidCredentials` / `AuthUnreachable`), **when** `marksync doctor` runs, **then** the `credentials` check reports `fail` with a suggested `fix`, **and** no raw token appears anywhere in the output. | F-2, INV-SEC-1, NFR-SEC-1 |
 | AC-F2-2 | **Given** the base URL is unreachable or the configured `spaceKey` is inaccessible, **when** `marksync doctor` runs, **then** the `space-access` check reports `fail` with a suggested `fix` (distinguishing "unreachable" from "forbidden"). | F-2 |
 | AC-F3-1 | **Given** the configured `parentPageId` does not exist or is not writable, **when** `marksync doctor` runs, **then** the `parent-page` check reports `fail` with a suggested `fix`. | F-3 |
 | AC-F3-2 | **Given** `--probe-capabilities` is **not** set, **when** `marksync doctor` runs, **then** the `content-property` and `attachment` checks are reported as `skipped` and **zero** writes occur; **given** `--probe-capabilities` **is** set, **then** those probes run via a scratch page that is created and then deleted (self-cleaning) and report `pass`/`fail`. | F-3, F-8, DEC-1 |
 | AC-F4-1 | **Given** the account may lack full read access to some subtree pages, **when** `marksync doctor` runs, **then** the `permission-visibility` check emits a `warn` surfacing the "403 → warn+skip, not delete" operating assumption, and this check **never** produces a `fail` and never gates the exit code. | F-4, R-FEA-10 |
 | AC-F5-1 | **Given** the renderer dependency surface fails to initialize, **when** `marksync doctor` runs, **then** the `renderer` check reports `warn` with a `fix` (informational) and **never** gates the exit code. | F-5 |
 | AC-F6-1 | **Given** any check result in the `DoctorReport`, **when** it is inspected, **then** it carries a stable check id, a `status` (`pass`/`warn`/`fail`/`skipped`), an AI-readable `detail`, and — on `fail` or `warn` — a suggested `fix`. | F-6, DM-2 |
 | AC-F7-1 | **Given** at least one gating check has status `fail`, **when** `marksync doctor` runs, **then** the process exits non-zero (`DOCTOR_FAIL` → `EXIT_HEALTH`, **60**) **and** the result still carries `data=DoctorReport` with `error` unset; **given** zero checks are `fail`, **then** the exit code is `0`. | F-7, DEC-4, NFR-OBS-1 |
 | AC-SEC-1 | **Given** doctor runs against an environment whose error bodies / URLs may contain token-shaped substrings, **when** the output (JSON or human) is inspected, **then** it contains **0** tokens/secrets (INV-SEC-1 / NFR-SEC-1; redaction asserted in integration tests). | F-6, INV-SEC-1, NFR-SEC-1 |
 | AC-JSON-1 | **Given** `--json`, **when** `marksync doctor` runs, **then** it emits a valid, parseable `CommandResult<DoctorReport>` JSON envelope (`schemaVersion`, `runId`, `exitCode`, `data`) usable by CI/agents without human interpretation. | F-6, NFR-OBS-2 |
 | AC-CI-1 | **Given** the implementation is complete, **when** `bun run check` is executed, **then** all tests (unit: each check pass/fail/warn with mocked client + injected fetch, report assembly, exit-code mapping; integration: doctor vs a `Bun.serve` mock — healthy + various failures + redaction assertion) pass. | story test matrix |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This change is additive and backward compatible:

1. Merge the feature branch into main.
2. CI (fast loop) validates unit + integration tests, including the per-check pass/fail/warn paths, the `--probe-capabilities` self-cleaning probe, the exit-code mapping, and the redaction assertion.
3. The `doctor` command transitions from a stub (exit 99) to a working command; no user migration is required.
4. Operators/CI invoke `doctor` manually as a pre-flight (`marksync doctor && marksync sync`); it is not an automatic gate in MS-0002 (Q1 resolved).
5. Existing configs, locks, and credentials remain valid; no data migration. The exit-code map gains one additive code (`DOCTOR_FAIL`).

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration or seeding required. Doctor reads existing config/credentials and the configured Confluence target; it persists nothing (the only write is the opt-in, self-cleaning scratch-page probe).

## 20. PRIVACY / COMPLIANCE REVIEW

**Privacy impact: NONE.** This change issues reads against the configured Confluence target (and, only with `--probe-capabilities`, a self-cleaning scratch page). It introduces no new data stored in Confluence or locally. The `DoctorReport` contains only check ids, statuses, AI-readable details, and suggested fixes — plus the masked email already produced by `resolveCredentials`; no raw token, no commit subjects, no personal data beyond the masked identity. Doctor output passes the same redaction discipline as every other command path (NFR-SEC-1 / INV-SEC-1). No outbound telemetry (NFR-SEC-3).

**Compliance: MIT License** — no changes to licensing or attribution.

## 21. SECURITY REVIEW HIGHLIGHTS

**Security impact: LOW.** Doctor is read-only by default and orchestrates over delivered primitives:

- No new credential exposure — it reuses the token-dropping `resolveCredentials` and never logs the `authHeader`; only the masked email + opaque statuses survive (INV-SEC-1).
- No new outbound endpoints beyond the configured Confluence target (NFR-SEC-3).
- The only write surface is the opt-in (`--probe-capabilities`) scratch-page + property probe, which is self-cleaning and confined to the configured parent subtree.
- The `DoctorReport` is scrubbed of token-shaped substrings and passes the centralized redaction layer — defense-in-depth so doctor introduces no new leakage (RSK-1).
- Redaction is asserted by integration tests against fixtures containing token-shaped strings (AC-SEC-1).

## 22. MAINTENANCE & OPERATIONS IMPACT

**Low maintenance impact:**

- The command is orchestration over stable primitives; it carries no new domain logic to maintain.
- Check ids and the `DoctorReport` schema are additive; future doctor extensions (MS-0003) add checks/codes without breaking existing consumers.
- The single addition to the shared exit-code map (`DOCTOR_FAIL` → `EXIT_HEALTH`) is additive and documented (OQ-1 confirms the numeric).

**Operational notes:**

- Operators run `doctor` as a pre-flight when setting up a target or when a `sync` reports an opaque auth/config error.
- CI gates with `marksync doctor && marksync sync`; the JSON `DoctorReport` lets agents pinpoint the failing precondition + suggested fix.
- The `--probe-capabilities` flag is reserved for when an operator needs to confirm content-property / attachment capability (it writes a scratch page).

## 23. GLOSSARY

 | Term | Definition |
 |------|------------|
 | Health check / doctor check | A single verification (`git-available`, `config-valid`, `credentials`, `space-access`, `parent-page`, `content-property`, `attachment`, `permission-visibility`, `renderer`) producing `{ check, status, detail, fix? }`. |
 | Gating check | A check whose `fail` status makes the exit code non-zero: Git, config, credentials, space-access, parent-page, and (when run) the capability probes. |
 | Informational / advisory check | A check that only ever reports `pass`/`warn` and never gates the exit code: `permission-visibility` (R-FEA-10) and `renderer`. |
 | `DoctorReport` | The structured success payload of `doctor`: per-check results + summary + derived worst status (DM-1). |
 | `DOCTOR_FAIL` / `EXIT_HEALTH` | The stable code / dedicated exit class doctor uses for its non-zero exit on any `fail`; `data` is still present and `error` is unset (DEC-4). |
 | Capability probe | An opt-in (`--probe-capabilities`) verification that creates a self-cleaning scratch page to confirm the content-property and attachment endpoints work. |
 | 403 → warn+skip policy | The sync operating assumption that a 403 on a subtree page is treated as warn+skip (not delete); doctor discloses this before sync (R-FEA-10). |

## 24. APPENDICES

### Appendix A: Check Catalogue (MS-0002 minimal)

 | Check id | What it verifies | Default status source | Gates exit? |
 |----------|------------------|-----------------------|-------------|
 | `git-available` | Git on `$PATH` + cwd inside a valid repo | `Repository` | Yes (`fail`) |
 | `config-valid` | `marksync.yml` present + ajv-valid | `loadConfig` | Yes (`fail`) |
 | `credentials` | Env creds resolve + Confluence accepts them | `resolveCredentials` + `validateCredentials` (`GET /user/by-me`) | Yes (`fail`) |
 | `space-access` | Base URL reachable + `spaceKey` readable | `TargetSystem` read / CQL | Yes (`fail`) |
 | `parent-page` | Configured `parentPageId` exists + writable | `getPage(parentPageId)` | Yes (`fail`) |
 | `content-property` | Property API responds / writable | scratch-page probe (`getProperty`/`putProperty`) | Only when `--probe-capabilities`; else `skipped` |
 | `attachment` | v1 attachment endpoint reachable | scratch-page probe (`attachmentExists`/`uploadAttachment`) | Only when `--probe-capabilities`; else `skipped` |
 | `permission-visibility` | Full-subtree-read assumption disclosed (R-FEA-10) | `getRestrictions` / `searchPages` where available | No (`warn` only) |
 | `renderer` | Configured render path is sound (Kroki reachable under `render` policy; informational for `code` / `skip`) | read-only renderer probe (coder-selected) | No (`warn` only, informational) |

### Appendix B: Exit-Code Resolution Summary (DEC-4)

 | Report worst status | `exitCode` | `data` | `error` |
|----------------------|------------|-------|---------|
| no `fail` (all `pass`/`warn`/`skipped`) | `EXIT_OK` (0) | `DoctorReport` | unset |
| any `fail` | `EXIT_HEALTH` (**60**, via `DOCTOR_FAIL`) | `DoctorReport` | unset |

Doctor constructs the `CommandResult<DoctorReport>` directly — it uses neither `ok()` (hardcodes 0) nor `err()` (drops `data`). The non-zero exit is a CI-gating signal, not a command-level error: the command always succeeds at "produce a report."

## 25. DOCUMENT HISTORY

 | Version | Date | Author | Changes |
 |---------|------|--------|---------|
 | 1.0 | 2026-07-15 | Juliusz Ćwiąkalski | Initial specification. Resolved the PM-flagged exit-code design point (DEC-4): construct `CommandResult` directly, `data` always present, `error` never set, non-zero on any `fail` via a dedicated `DOCTOR_FAIL` → `EXIT_HEALTH` (proposed 60); numeric pending OQ-1 confirmation. |

---

## AUTHORING GUIDELINES

This spec was authored using:

- Story file (authoritative scope): `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md`
- GitHub issue GH-30 body (short summary; story file is authoritative)
- Feature spec: `doc/spec/features/feature-cli.md` (§3.1 `doctor`, §3.3 auth, §5 AC)
- NFRs: `doc/spec/nonfunctional.md` — NFR-OBS-4 (doctor minimal, MS-0002), NFR-COMP-4 (Git CLI prereq), NFR-SEC-1 / INV-SEC-1 (no secrets), NFR-OBS-1 (stable exit codes), NFR-OBS-2 (structured output), NFR-A11Y-1 (no color dependency)
- Cross-cutting risks: R-USA-1 (setup friction), R-FEA-10 (permission asymmetry / 403→warn+skip)
- Existing primitives (reused, not redefined): `loadConfig` (E2-S2); `resolveCredentials` + `validateCredentials` (E2-S4); `createRepository` / `createTarget` + the `TargetSystem` port read/probe methods (E3-S4); `CommandResult<T>` + exit-code map (E2-S3 / GH-16)
- Realized-form reference: `doc/changes/2026-07/2026-07-15--GH-28--repair-state/chg-GH-28-spec.md` (stub→real pattern, app-tier + thin-handler split)
- Coding rules: `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`

All deliverables, acceptance criteria, and risks are sourced from the story file, the system spec, and CEO-resolved open questions (R1, Q1). No implementation details (file-level code paths or step-by-step tasks) are included — only functional capabilities, interface contracts, and acceptance criteria. Existing primitives are named by their API/contract, not by implementation location. The PM-flagged exit-code design point is resolved in DEC-4 / F-7 / Appendix B, with the exact numeric deferred to OQ-1 for `@decision-advisor` confirmation.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-30)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-8, AC-F*-* + AC-SEC-1 + AC-JSON-1 + AC-CI-1, RSK-1..RSK-5, DEC-1..DEC-6, DM-1..DM-4, OQ-1, NFR-*)
- [x] Acceptance criteria reference at least one F-/NFR-/INV-/R- ID and use Given/When/Then
- [x] NFRs include measurable values (100%, 0, "the full MS-0002 minimal set")
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (cited instead)
- [x] Front matter validates per front_matter_rules
