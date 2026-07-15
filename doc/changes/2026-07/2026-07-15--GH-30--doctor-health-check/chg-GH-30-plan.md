---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-30-doctor-health-check
status: Proposed
created: 2026-07-15T00:00:00Z
last_updated: 2026-07-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, doctor, diagnostics, observability, health-check]
links:
  change_spec: ./chg-GH-30-spec.md
  test_plan: ./chg-GH-30-test-plan.md
  story_file: ../../../planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md
  tdr_0009: ../../../decisions/TDR-0009-doctor-health-check-exit-code.md
summary: "Doctor health-check: replaces the doctor stub with a real pre-flight that runs the MS-0002-minimal checklist (Git, config, credentials, connectivity, target topology, permissions, renderer), produces an AI-readable DoctorReport with per-check pass/fail/warn + suggested fixes, gates CI via a dedicated EXIT_HEALTH=60 (DOCTOR_FAIL) on any fail — while always carrying data=DoctorReport — and never leaks the token (INV-SEC-1). Read-only by default; --probe-capabilities opt-in for the self-cleaning scratch-page capability probes."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-30: [MS2-E5-S2] Doctor health-check

## Context and Goals

This plan replaces the `doctor` **stub** (`src/cli/commands/doctor.ts` returns `err("INTERNAL", "doctor is not yet implemented (MS2-E5-S2)", false)` → exit 99) with a real pre-flight health check. It runs a bounded sequence of 9 checks against the local environment and the configured Confluence target, each yielding `{ check, status, detail, fix? }`, assembled into a structured `DoctorReport`. It is **read-only by default** (auth GET + space read + parent-page read only — zero writes); the content-property and attachment capability probes run **only** with `--probe-capabilities` via a self-cleaning scratch page (DEC-1, R1). The same stub→real pattern just shipped for `repair-state` (GH-28).

This is **orchestration + UX + diagnostics only**. Every primitive it depends on — `loadConfig` (E2-S2), `resolveCredentials` + `validateCredentials` (E2-S4), `createRepository` / `createTarget` + the `TargetSystem` port read/probe methods (E3-S4), and the `CommandResult<T>` envelope + `CODE_TO_EXIT` map (E2-S3 / GH-16) — is reused unchanged. No new domain logic, no new dependencies.

**Key goals (from spec §4):**

- **G-1**: A working `marksync doctor` running the MS-0002-minimal checklist — Git, config, creds+validation, base-URL/space reachability, parent-page existence/writability, permission/visibility advisory, renderer availability.
- **G-2**: Read-only by default; `--probe-capabilities` opt-in for the side-effecting (self-cleaning) capability probes.
- **G-3**: AI-readable diagnostics — per-check `pass`/`warn`/`fail` + suggested fix; structured `DoctorReport` consumable by CI/agents as JSON.
- **G-4**: CI-gateable exit code — non-zero on any `fail`, **while still carrying `data=DoctorReport`** (doctor is success-at-command-level; the non-zero exit is a CI signal, NOT a `CommandResult.error`).
- **G-5**: No token leakage — INV-SEC-1 preserved (reuse the token-dropping credential provider + the centralized redaction chokepoint).

### Resolved design point — runDoctor owns the resolution probes (plan-writer decision)

The task brief's architecture sketch described the handler as "resolves config → creds → ports → calls `runDoctor`" with `runDoctor` taking "the resolved primitives". That framing mirrors `repair-state`, but it conflicts with the **authoritative** spec §5.1 (F-1/F-2) and the test plan (TC-DOCTOR-002, TC-DOCTOR-003), which make `config-valid`, `credentials`, and `git-available` **checks that report `fail` inside the `DoctorReport`**. TC-DOCTOR-002 mocks `loadConfig` to return `Err(ConfigError)` and asserts the `config-valid` *check item* reports `fail`; TC-DOCTOR-003 mocks `resolveCredentials` likewise for the `credentials` check. Those assertions are only possible if the resolution **is** the check — i.e. the probes run *inside* `runDoctor`, not pre-resolved by the handler.

This plan resolves the tension in favor of the spec + test plan (the source of truth per the brief: "Consume the completed spec + test plan as inputs"; "do NOT invent requirements beyond the spec"). Concretely:

- **`runDoctor` owns the resolution probes.** It runs the check sequence and internally calls `loadConfig(cwd)` (the `config-valid` check), `resolveCredentials()` + `validateCredentials(creds, { fetch })` (the `credentials` check), and `createRepository(cwd)` + a read-only Git probe (the `git-available` check). A failed resolution becomes that check's `fail` (gates the exit), not a command-level abort.
- **The CLI handler is genuinely thin** (mirrors `repair-state`'s shape but slimmer): it passes `{ cwd, probeCapabilities, fetch }` to `runDoctor`, maps `runDoctor`'s `err(...)` (the rare abort path — see below) via `mapMarkSyncErrorToCommandError` → `err(...)`, and on `ok(report)` **builds the `CommandResult<DoctorReport>` directly** per DEC-4 (`data=report` always, `error` never set, `exitCode` derived from `worstStatus`).
- **`runDoctor` returns `Result<DoctorReport, MarkSyncError>`** so the app-tier contract stays a `Result` (consistent with `runRepair`). The `err` arm is reserved for failures that **cannot** be classified into a check — e.g. a transport error mid-check that the per-check handler cannot route to a `fail`, or an invariant violation. Per-check expected failures (bad token, wrong spaceKey, missing parent, invalid config, Git missing) are converted to the corresponding check's `fail` *with the report still produced* (doctor diagnoses everything it can; RSK-3). The coder finalizes the exact `err` triggers; the default is "every classifiable failure is a per-check `fail`, never an abort."

For unit-test isolation, the resolution primitives (`loadConfig`, `resolveCredentials`, `validateCredentials`, `createRepository`, `createTarget`) are **injectable into `runDoctor`** (each defaulting to the real `#app/*` sibling), and `fetch` is threaded into `validateCredentials` exactly as the credential provider already supports. The `TargetSystem` produced by `createTarget` and the `Repository` produced by `createRepository` flow to the topology/probe checks. This matches the test plan's "mock `loadConfig` / `resolveCredentials` / the `TargetSystem` port" expectations without any module-level monkey-patching.

> Decision needed only if a tier-boundary ambiguity arises during implementation: consult `@decision-advisor`. None anticipated — the split mirrors the established `repair.ts` (app) + `repair-state.ts` (presentation) precedent, and every injected primitive is a sibling `#app/*` module.

### Resolved open question — OQ-1 (exit code)

OQ-1 is **RESOLVED** by [TDR-0009](../../../decisions/TDR-0009-doctor-health-check-exit-code.md) (Option A). The non-zero exit uses a **new dedicated class `EXIT_HEALTH = 60`** with stable code string **`DOCTOR_FAIL`**, registered only in `CODE_TO_EXIT` (not a `MarkSyncError.kind`, not in `cli-error-map.ts`). Additive — no existing code reclassified; the AC-load-bearing `CONFLICT → 30` is untouched. Phase 1 implements exactly the TDR-0009 "Implementation Plan" steps.

### Redaction is the centralized chokepoint (DEC-6 = DEC-4, not a new layer)

Doctor adds **no app-tier redaction**. INV-SEC-1 is preserved by two existing layers: (1) `resolveCredentials` drops the raw token and masks the email (the token never enters the report); (2) the `OutputService.emit` chokepoint applies `redactString` (`src/shared/redact.ts`) to **every serialized output string** — JSON and human — per DEC-4, so any token-shaped substring that slips into a `detail`/`fix` is scrubbed post-`JSON.stringify`. TC-DOCTOR-012 (unit) asserts `redactString(JSON.stringify(report))` scrubs token-shaped substrings from a constructed report; TC-DOCTOR-015 (integration) asserts the end-to-end serialized JSON contains zero secrets. The coder must NOT add a redundant per-field redaction walk (that would duplicate DEC-4 and miss post-serialization substrings — the exact failure mode the centralized string-level redactor exists to prevent).

### Open questions

- **Renderer probe (low-risk, warn-only):** the spec F-5 / Appendix A lists `renderer` as a warn-only informational check ("happy-dom / mermaid load initializes; warn on failure, never gates"). In MS-0002 the renderer is **Kroki** (remote HTTP via GH-69; no happy-dom dependency), so the dependency surface is a thin HTTP client and the check will essentially always report `pass`. The coder resolves the exact read-only probe (e.g. construct the configured renderer / verify the configured renderer kind is available); it MUST be warn-only, MUST never perform a blocking network call that overlaps with `space-access`, and the `warn` path is exercised in tests by injecting a renderer whose init throws (TC-DOCTOR-008 / TC-DOCTOR-021). Non-blocking — the check never gates the exit.

## Scope

### In Scope

- Replace the `doctor` stub with a real thin presentation-tier handler mirroring `repair-state.ts`'s shape (resolve nothing itself — delegate to `runDoctor`; build `CommandResult<DoctorReport>` directly per DEC-4). (spec §16, DEC-3)
- App-tier doctor orchestration module `src/app/doctor.ts` mirroring `src/app/repair.ts` placement; imports `#domain/*` + `#app/*` siblings only; `runDoctor` owns the resolution probes. (DEC-1 / DEC-3, spec §7.1)
- The 9-check catalogue (spec Appendix A): `git-available`, `config-valid`, `credentials`, `space-access`, `parent-page` (gating, `fail`-able); `content-property`, `attachment` (gating only when `--probe-capabilities`, else `skipped`); `permission-visibility`, `renderer` (warn-only, never gate). (F-1..F-5, DM-2)
- `DoctorReport` (DM-1) + stable check-id set + `DoctorStatus` union as `as const` objects + derived unions (no magic strings). (F-6, DM-1, DM-2)
- Exit-code extension: `EXIT_HEALTH = 60` + `DOCTOR_FAIL` in `CODE_TO_EXIT`; update the DEC-2 comment table (9→10 classes). (F-7, DEC-4, DM-4, TDR-0009)
- `--probe-capabilities` flag on the existing `doctor` subcommand registration; self-cleaning scratch-page probe (try/finally delete). (F-3, F-8, DEC-1, DM-3)
- INV-SEC-1 preservation via reuse of the token-dropping `resolveCredentials` + the centralized redaction chokepoint (no app-tier redaction). (F-6, DEC-6)
- Unit tests (`tests/unit/app/doctor.test.ts` new, `tests/unit/cli/output/exit-codes.test.ts` extended per task 1.5, `tests/unit/cli/commands/doctor.test.ts` new) and integration tests (`tests/integration/cli/commands/doctor.test.ts` new) covering all 22 TCs.
- System-spec reconciliation + minor version bump.

### Out of Scope

- [OUT] The full MS-0003 doctor — proxy/CA hints, deeper capability discovery, setup-failure taxonomy, guided/auto remediation. (spec §7.2, NG-1)
- [OUT] Auto-remediation — doctor diagnoses + suggests only; never mutates config/creds/Confluence state other than the opt-in self-cleaning scratch-page probe. (NG-2)
- [OUT] Wiring `doctor` as a mandatory pre-sync gate — `sync` does not require `doctor` first in MS-0002 (DEC-5, Q1 resolved). (NG-3)
- [OUT] New domain primitives, new dependencies, or new Confluence REST endpoints — all consumed primitives reused unchanged. (NG-4, NG-5)
- [OUT] Changing the credential provider, the auth validation endpoint, or the `CommandResult<T>` envelope shape. (spec §7.2)
- [OUT] E2E / live-sandbox tests — the story test matrix is Unit + Integration only. (test plan §1.2)
- [OUT] App-tier redaction — the centralized `redactString` chokepoint (DEC-4) already covers every serialized output. (DEC-6)

### Constraints

- **DEC-1 tier rules (load-bearing, dep-cruiser-enforced):** the CLI handler (`src/cli/commands/doctor.ts`) is presentation — imports only `#cli/output` + `#cli/error-map` + `#app/doctor` (NO `#domain/*` / `#infra/*`). The app-tier `doctor.ts` imports `#domain/*` + `#app/*` siblings only. `CommandResult<DoctorReport>` is consumed by the CLI **structurally**; the `DoctorReport` type is exported from `#app/doctor` (same precedent as `repair-state.ts` importing `RepairReport` from `#app/repair`). Enforced by `presentation-may-not-import-domain|-infra` + `app-may-not-import-cli`.
- **DEC-4 (exit-code resolution):** doctor constructs `CommandResult<DoctorReport>` **directly** — never via `ok()` (hardcodes `exitCode: 0`) or `err()` (produces `CommandResult<never>`, drops `data`). `data=report` always; `error` never set; `exitCode = report.worstStatus === "fail" ? codeToExitCode("DOCTOR_FAIL") : EXIT_OK`. (TDR-0009, spec Appendix B)
- **Read-only default (DEC-1):** zero writes unless `--probe-capabilities`. The scratch-page probe is created under the configured parent subtree and deleted in a `try/finally` self-cleaning path; a leftover (probe delete failed) is reported as a `warn`, not a crash (RSK-2). (F-8, DEC-1)
- **INV-SEC-1 / NFR-SEC-1:** doctor never logs the `authHeader`, never puts the raw token in any report field, and adds no app-tier redaction — it relies on `resolveCredentials` token-dropping + the centralized `redactString` chokepoint. (RSK-1)
- **No new dependencies; no magic strings** (check ids, statuses, `DOCTOR_FAIL` as `as const` objects + derived unions, typescript.md "No magic strings"). **File headers ≤ 3 lines; cite TDR-0009 / spec / ADR-0011 once at the load-bearing point; one import statement per module; conditional spread for optionals** (typescript.md Code style principles). **Strict mode** (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- **Tests use `#`-prefixed import aliases** (no deep relative paths); integration tests use the `Bun.serve()` mock pattern (testing-strategy.md — mocks allowed for adapter boundaries; never mock lifecycle invariants, but doctor introduces none — INV-SAFE-1/2/3 are preserved by construction via the reused primitives, and INV-SEC-1 is validated via the integration redaction assertion).

### Risks

- **RSK-1** (spec): Token leakage in diagnostics (a token-shaped substring echoed into a `detail`). Mitigated: `resolveCredentials` already drops the raw token + masks the email; doctor never logs `authHeader`; the centralized `redactString` chokepoint scrubs every serialized string (DEC-4/DEC-6). Asserted by TC-DOCTOR-012 / TC-DOCTOR-015. Residual: L.
- **RSK-2** (spec): Capability probe leaves a scratch page behind. Mitigated: probes run only with `--probe-capabilities` (read-only default); scratch page created + deleted in a self-cleaning `try/finally`; a leftover is reported as a `warn`. Asserted by TC-DOCTOR-019 (asserts 0 remaining pages). Residual: L.
- **RSK-3** (spec): A transient remote hiccup (429/timeout) fails a check and gates CI falsely. Mitigated: `validateCredentials` already retries 429 with bounded backoff; transport failures are reported as the specific check's `fail` with a `retryable` hint in `detail` (not a command crash). Residual: M.
- **RSK-4** (spec): Exit-code conflation — CI/agents misread doctor's non-zero exit as a hard domain error. Mitigated: dedicated `DOCTOR_FAIL` → `EXIT_HEALTH` (60) class distinct from every domain error class; `data=DoctorReport` always present, `error` never set (DEC-4 / TDR-0009). Asserted by TC-DOCTOR-010 / TC-DOCTOR-011 / TC-DOCTOR-022. Residual: L.
- **RSK-5** (spec): Adding `DOCTOR_FAIL`/`EXIT_HEALTH` extends the documented 9-class exit set. Mitigated: purely additive (no existing code reclassified); documented in `exit-codes.ts` + TDR-0009 + this plan. Residual: L.
- **RSK-R1** (plan): The renderer check (F-5) is under-specified for MS-0002 (Kroki, no happy-dom). Mitigated: the check is warn-only and never gates; the coder resolves a read-only probe (construct the configured renderer) and the `warn` path is test-injected. See "Open questions". Residual: L.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| MS-0002-minimal setup-failure classes diagnosable before `sync` | 100% (Git, config, creds, base URL, space, parent page) | NFR-OBS-4 / AC-F1-1..F3-1 |
| Checks carrying status + (on fail/warn) a suggested fix | 100% | AC-F6-1 |
| Token/secret occurrences in any doctor output | 0 (INV-SEC-1) | AC-SEC-1 / NFR-SEC-1 |
| Default-doctor writes to Confluence | 0 (read-only unless `--probe-capabilities`) | AC-F3-2 / DEC-1 |
| Scratch pages remaining after a `--probe-capabilities` run | 0 (self-cleaning) | AC-F3-2 / RSK-2 |
| `--json` output parseable as `CommandResult<DoctorReport>` | 100% | AC-JSON-1 / NFR-OBS-2 |
| Exit code: `0` on no-`fail`, `60` on any-`fail` (data always present, error unset) | 100% | AC-F7-1 / NFR-OBS-1 |
| `bun run check` (lint + typecheck + test + check:boundaries) | green | AC-CI-1 |

## Phases

### Phase 1: Exit-code extension (`EXIT_HEALTH` / `DOCTOR_FAIL`) + mapping unit test

**Goal**: Land the additive exit-code extension that doctor's exit logic depends on, as a standalone foundation. No behavior change for any existing command (additive). Implements the TDR-0009 "Implementation Plan" steps 1–2 + 4 (partial).

**Tasks**:

- [x] **1.1** In `src/cli/output/exit-codes.ts`: add `export const EXIT_HEALTH = 60;` alongside the other `EXIT_*` constants (it is pure presentation data — no tier import; slots cleanly between `EXIT_INVARIANT`(50) and `EXIT_RENDER_UNAVAILABLE`(70) per TDR-0009). (✅ Done — added EXIT_HEALTH=60)
- [x] **1.2** Add `DOCTOR_FAIL: EXIT_HEALTH,` to `CODE_TO_EXIT` with a one-line comment noting it is **doctor-only** (lives only in `CODE_TO_EXIT`; not a `MarkSyncError.kind`; not in `cli-error-map.ts`) — doctor builds `CommandResult` directly (DEC-4) so it bypasses the error-kind→code mapper. (✅ Done — added DOCTOR_FAIL: EXIT_HEALTH)
- [x] **1.3** Update the DEC-2 comment table in `exit-codes.ts`: add the `DOCTOR_FAIL → 60 → health-check` row and adjust the "9 classes" framing to 10 (TDR-0009 step 2). Keep the comment block within the spirit of typescript.md "Minimal file headers" — the existing DEC-2 table is the load-bearing authority, so this is a justified in-place edit, not a header essay. (✅ Done — updated table and comment)
- [x] **1.4** Verify the existing `codeToExitCode("CONFLICT") === 30` mapping is untouched (AC-6 / NFR-OBS-1 additive-safety gate) — `git diff` should show only additive lines. (✅ Verified — git diff shows only additive lines)
- [x] **1.5** **Extend the EXISTING** `tests/unit/cli/output/exit-codes.test.ts` (**not** new — it is a strict whole-contract pin over `CODE_TO_EXIT` and the `EXIT_*` constants; TC-DOCTOR-010). Adding `DOCTOR_FAIL: EXIT_HEALTH` + `EXIT_HEALTH = 60` (tasks 1.1/1.2) will **break three assertions** in the existing file if it is not extended in lockstep: the `expect(CODE_TO_EXIT).toEqual(EXPECTED)` whole-map pin (EXPECTED lacks `DOCTOR_FAIL`), the `allowed`-Set "no exit outside the documented set" guard (lacks `EXIT_HEALTH`/60), and the stale `"9 classes"` `describe` title. Extend it as follows:
  1. Add `DOCTOR_FAIL: 60` to the `EXPECTED` map with a trailing `// GH-30 / TDR-0009` comment, so the `expect(CODE_TO_EXIT).toEqual(EXPECTED)` whole-contract pin stays green.
  2. Import `EXIT_HEALTH` alongside the other `EXIT_*` constants, and add `expect(EXIT_HEALTH).toBe(60)` to the "each constant has its documented numeric value" test.
  3. Add `EXIT_HEALTH` to the `allowed` Set in the "no exit code falls outside the documented set" test (9 → 10 documented values), so `DOCTOR_FAIL → 60` passes the guard.
  4. Update the `describe("exit-code constants (9 classes — spec F-5 / NFR-OBS-1)")` title to reflect **10 classes** (it currently hardcodes "9 classes").
  5. (Optional, for clarity) Add a dedicated `test("DOCTOR_FAIL → EXIT_HEALTH (60) — GH-30 / TDR-0009", ...)` asserting `codeToExitCode("DOCTOR_FAIL") === EXIT_HEALTH` and `CODE_TO_EXIT.DOCTOR_FAIL === EXIT_HEALTH`.
  6. Keep the additive-safety assertion `codeToExitCode("CONFLICT") === 30` unchanged (AC-6) and continue using `#cli/output` import aliases (no deep relative paths). (✅ Done — extended test with DOCTOR_FAIL: 60, EXIT_HEALTH import and assertion, updated allowed Set and title; tests pass: 31 pass, 0 fail)

**Acceptance Criteria**:

- Must: `codeToExitCode("DOCTOR_FAIL") === 60` and `CODE_TO_EXIT.DOCTOR_FAIL === EXIT_HEALTH === 60` (C-2 / DM-4 / TC-DOCTOR-010).
- Must: `codeToExitCode("CONFLICT") === 30` unchanged — additive only, no reclassification (AC-6).
- Must: `exit-codes.ts` imports no tier (pure data); `check:boundaries` stays green.

**Files and modules**:

- Code areas: `src/cli/output/exit-codes.ts` (edited — additive); `tests/unit/cli/output/exit-codes.test.ts` (extend / existing — strict whole-contract pin; see task 1.5).
- System docs: none.

**Tests**:

- TC-DOCTOR-010 (unit): exit-code mapping.

**Completion signal**: `feat(cli): add EXIT_HEALTH(60)/DOCTOR_FAIL exit code for doctor (TDR-0009)`

---

### Phase 2: App-tier doctor orchestration (`runDoctor`) + unit tests

**Goal**: Land `src/app/doctor.ts` — the `DoctorReport`/`DoctorCheck` types, the stable check-id + status constants, the `worstStatus`/summary derivation, and `runDoctor` orchestrating all 9 checks (each owning its resolution probe). Mirrors `src/app/repair.ts` placement. Not wired to the CLI yet (Phase 3).

**Tasks**:

- [ ] **2.1** Create `src/app/doctor.ts` with a ≤3-line header citing ADR-0011 (structured output) + GH-30. Define the stable check-id set as an `as const` object + derived union (typescript.md "No magic strings"):
  - `DOCTOR_CHECK_IDS = { GIT_AVAILABLE: "git-available", CONFIG_VALID: "config-valid", CREDENTIALS: "credentials", SPACE_ACCESS: "space-access", PARENT_PAGE: "parent-page", CONTENT_PROPERTY: "content-property", ATTACHMENT: "attachment", PERMISSION_VISIBILITY: "permission-visibility", RENDERER: "renderer" } as const` (strings per spec Appendix A / DM-2).
  - `export type DoctorCheckId = (typeof DOCTOR_CHECK_IDS)[keyof typeof DOCTOR_CHECK_IDS]`.
  - `export type DoctorStatus = "pass" | "warn" | "fail" | "skipped"` (DM-2).
- [ ] **2.2** Define the report types (DM-1):
  - `export interface DoctorCheck { check: DoctorCheckId; status: DoctorStatus; detail: string; fix?: string }` (`fix` present only on `fail`/`warn`).
  - `export interface DoctorSummary { pass: number; warn: number; fail: number; skipped: number; total: number }`.
  - `export interface DoctorReport { checks: DoctorCheck[]; summary: DoctorSummary; worstStatus: "pass" | "warn" | "fail"; probeCapabilities: boolean }`.
- [ ] **2.3** Define `DoctorDeps` (the injectable surface for unit-test isolation) + the `runDoctor` signature:
  - `runDoctor(deps: DoctorDeps): Promise<Result<DoctorReport, MarkSyncError>>`.
  - `DoctorDeps` carries `{ cwd, probeCapabilities, fetch?, loadConfig?, resolveCredentials?, validateCredentials?, createRepository?, createTarget? }` — each optional resolver defaulting to the real `#app/*` sibling; `fetch` is threaded into `validateCredentials` exactly as the credential provider supports (E2-S4). The `Repository` and `TargetSystem` produced internally flow to the topology/probe checks. The coder finalizes the exact optional-injection shape; the contract is "every primitive a TC mocks is injectable, defaulting to the real sibling."
  - `runDoctor` returns `ok(report)` on the normal path (every classifiable failure is a per-check `fail`); the `err` arm is reserved for failures that cannot be classified into a check (see "Resolved design point").
- [ ] **2.4** Implement each check as a small function returning a `DoctorCheck` (or a tuple folded into the checks array). Behavior per spec Appendix A:
  - **`git-available`** (gating): probe `createRepository(cwd).headSha()` — `ok` → `pass`; `err` → `fail` with detail ("Git not on $PATH" vs "cwd is not inside a Git repository") + fix ("install Git and run from inside a Git working tree"). `headSha()` is the cleanest read-only probe (Git-on-PATH + valid-repo in one call).
  - **`config-valid`** (gating): `loadConfig(cwd)` → `ok` → `pass`; `err(ConfigError)` → `fail` surfacing the AI-readable `humanMessage`/ajv detail (offending field/instance path + expected shape) + fix ("run `marksync init`" for missing; "fix field X" for invalid). On config fail, downstream target checks cannot resolve `spaceKey`/`parentPageId` → emit them as `skipped` (cannot run), not synthetic fails.
  - **`credentials`** (gating): `resolveCredentials()` → `err(MissingCredentials/InvalidBaseUrl)` → `fail` naming the missing env-var **names** (never values) + fix; `ok(creds)` → `validateCredentials(creds, { fetch })` → `err(InvalidCredentials/AuthUnreachable)` → `fail` ("Confluence rejected the credentials" / "auth endpoint unreachable") + fix; `ok(AccountIdentity)` → `pass` (detail may carry the masked email only). **Never** place `authHeader` or the raw token in `detail`/`fix`.
  - **`space-access`** (gating, requires creds+config): `createTarget(creds, spaceKey)` then `target.searchPages(\`type=page and space=<spaceKey>\`)` (or the sibling space read) → network error → `fail` ("base URL unreachable") + fix; 403/forbidden → `fail` ("space not accessible (403)") + fix; `ok` → `pass`. Distinguish unreachable vs forbidden in `detail` (AC-F2-2).
  - **`parent-page`** (gating, requires space-access): `target.getPage(parentPageId)` → `RemoteMissing`/404 → `fail` ("parent page not found") + fix; 403 → `fail` ("parent page not writable (403)") + fix; `ok` → `pass`.
  - **`content-property`** + **`attachment`** (gating only when `probeCapabilities`; else `skipped`, **zero** port calls): when `probeCapabilities`, create a scratch page under the parent subtree, write a throwaway `marksync.metadata` property (`putProperty`) + confirm the v1 attachment endpoint (`attachmentExists`/`uploadAttachment`), then **`try/finally` delete the scratch page** (self-cleaning, RSK-2). Probe failure → `fail` + fix; success → `pass`. A delete failure (leftover) → report the probe `warn` (not a crash).
  - **`permission-visibility`** (warn-only, never gates): emit `warn` disclosing the "403 → warn+skip, not delete" operating assumption (R-FEA-10); where `target.getRestrictions(parentPageId)` is reachable, enrich the detail with specifics. Never `fail`. No `fix` (advisory). When the port cannot detect restrictions, emit the standing advisory.
  - **`renderer`** (warn-only, never gates, informational): probe renderer constructability (read-only, per "Open questions"); `pass` when the configured renderer is available, `warn` + fix when init throws. Never `fail`.
- [ ] **2.5** Implement report assembly: fold the checks into the array; compute `summary` (counts by status; `total === checks.length`); derive `worstStatus` (`fail` if any check is `fail`; else `warn` if any is `warn`; else `pass` — `skipped` does not elevate `worstStatus`); set `probeCapabilities` from the flag. Ensure the report is `JSON.stringify`-able (no circular refs; no secrets).
- [ ] **2.6** Confirm `src/app/doctor.ts` imports only `#domain/*` + `#app/*` siblings (`loadConfig`, `resolveCredentials`, `validateCredentials`, `createRepository`, `createTarget`) — NO `#cli/*` / `#infra/*`. `check:boundaries` stays green.
- [ ] **2.7** Add `tests/unit/app/doctor.test.ts` covering TC-DOCTOR-001..009 + TC-DOCTOR-012 (use injectable deps — mocked primitives + a mocked `TargetSystem`; no module monkey-patching needed):
  - TC-DOCTOR-001: git probe err → `git-available` `fail` + detail + fix; `summary.fail === 1`; `worstStatus === "fail"`.
  - TC-DOCTOR-002: two subtests — `loadConfig` → `FileMissing` → `fail` + fix "run `marksync init`"; `loadConfig` → `InvalidConfig` (ajv `allErrors`) → `fail` surfacing offending field/instance path + expected shape.
  - TC-DOCTOR-003: two subtests — `resolveCredentials` → `MissingCredentials` → `fail` (env-var names only, no values); `resolveCredentials` ok + `validateCredentials` → `InvalidCredentials` → `fail`. Assert no raw token in `detail`.
  - TC-DOCTOR-004: two subtests — space read network error → `fail` ("unreachable"); 403 → `fail` ("forbidden"). Distinct details/fixes.
  - TC-DOCTOR-005: two subtests — `getPage` 404 → `fail` ("not found"); 403 → `fail` ("not writable").
  - TC-DOCTOR-006: `probeCapabilities: false` → `content-property` + `attachment` are `skipped`, `summary.skipped === 2`, and **no** probe port methods called (assert the mocked `TargetSystem` received no `createPage`/`putProperty`/`attachmentExists`/`uploadAttachment` calls).
  - TC-DOCTOR-007: `getRestrictions` returns restrictions → `permission-visibility` is `warn` disclosing the 403→warn+skip policy; assert it is **never** `fail` and does not affect `worstStatus === "pass"`.
  - TC-DOCTOR-008: injected renderer init throws → `renderer` is `warn` + fix; never `fail`; exit-irrelevant.
  - TC-DOCTOR-009: feed a mix of pass/fail/warn/skipped; assert the full `DoctorReport` matches DM-1/DM-2 (stable ids, statuses, non-empty details, `fix` only on fail/warn); `summary` counts accurate; `worstStatus` derived correctly; JSON-serializable.
  - TC-DOCTOR-012: construct a `DoctorReport` whose `detail` carries token-shaped substrings (`Basic <token>`, `ATATT…`, `user:token@host`, `MARKSYNC_API_TOKEN=<long>`); assert `redactString(JSON.stringify(report))` replaces them with `[REDACTED:<kind>]` sentinels and preserves non-sensitive context — validating the centralized chokepoint (DEC-4) covers doctor output.
- [ ] **2.8** Assert the unit tests use `#`-prefixed import aliases (no deep relative paths).

**Acceptance Criteria**:

- Must: each check's pass/fail/warn/skipped paths behave per spec Appendix A (AC-F1-2, AC-F1-3, AC-F2-1, AC-F2-2, AC-F3-1, AC-F3-2, AC-F4-1, AC-F5-1).
- Must: `DoctorReport`/`DoctorCheck` shapes match DM-1/DM-2; stable check ids + statuses are `as const` (no bare strings) (AC-F6-1, TC-DOCTOR-009).
- Must: `worstStatus` derived correctly; `summary` counts accurate (TC-DOCTOR-009).
- Must: default (`probeCapabilities: false`) performs **zero** probe port calls and reports the two probes `skipped` (AC-F3-2, TC-DOCTOR-006).
- Must: no raw token in any `detail`/`fix`; `redactString` scrubs token-shaped substrings from the serialized report (AC-SEC-1, TC-DOCTOR-012).
- Must: `check:boundaries` green (`src/app/` imports `#domain/*` + `#app/*` only).

**Files and modules**:

- Code areas: `src/app/doctor.ts` (new — types, constants, `runDoctor`); `tests/unit/app/doctor.test.ts` (new).
- System docs: none.
- Reused primitives: `loadConfig` (`#app/config`), `resolveCredentials` + `validateCredentials` (`#app/credentials`), `createRepository` + `createTarget` (`#app/ports`), `Repository` (`#domain/git/port`), `TargetSystem` (`#domain/target/port`), `Result`/`MarkSyncError` (`#domain/result`, `#domain/errors`), `redactString` (`#shared/redact` — test-only assertion).

**Tests**:

- TC-DOCTOR-001..009 + TC-DOCTOR-012 (unit) — this phase IS the test.

**Completion signal**: `feat(doctor): implement runDoctor health-check orchestration with per-check pass/fail/warn/skipped`

---

### Phase 3: CLI handler + router wiring (`--probe-capabilities`) + exit-derivation unit test

**Goal**: Replace the `doctor` stub with a real thin presentation-tier handler, add the `--probe-capabilities` flag to the router, and build the `CommandResult<DoctorReport>` **directly** per DEC-4 (not via `ok()`/`err()`). Mirrors `repair-state.ts` ordering but slimmer (no pre-resolution — `runDoctor` owns the probes).

**Tasks**:

- [ ] **3.1** Rewrite `src/cli/commands/doctor.ts`: `export async function doctorCommand(flags: { probeCapabilities?: boolean } = {}): Promise<CommandResult<DoctorReport>>`. Handler body:
  1. `const report = await runDoctor({ cwd: cwd(), probeCapabilities: flags.probeCapabilities === true })` (real siblings by default; the global `fetch` is used inside `validateCredentials`).
  2. On `err`: `mapMarkSyncErrorToCommandError(error)` → `err(mapped.code, mapped.message, mapped.retryable)` (the rare abort path — a genuine command-level error).
  3. On `ok(report)`: **construct `CommandResult<DoctorReport>` directly** — `{ schemaVersion: SCHEMA_VERSION, runId: crypto.randomUUID(), exitCode: report.worstStatus === "fail" ? codeToExitCode("DOCTOR_FAIL") : EXIT_OK, data: report }`. `error` is **never** set; `data` is **always** the report (DEC-4 / TDR-0009 / spec Appendix B). Use conditional spread only if/when optional meta (`timing`/`warnings`) is attached.
  - Imports: `#cli/output` (`type CommandResult`, `SCHEMA_VERSION`, `codeToExitCode`, `EXIT_OK`, `err`), `#cli/error-map` (`mapMarkSyncErrorToCommandError`), `#app/doctor` (`runDoctor`, `type DoctorReport`), `node:process` (`cwd`). **No `#domain/*` / `#infra/*`** (DEC-1).
- [ ] **3.2** Update `src/cli/commands/router.ts`: on the existing `.command("doctor", ...)`, chain `.option("--probe-capabilities", "Also probe content-property and attachment capability via a self-cleaning scratch page (writes).")`. Update the action to pass the flag: `await doctorCommand({ probeCapabilities: Boolean(flags.probeCapabilities) })`; keep `capture("doctor", flags as GlobalCommandFlags, ...)`.
- [ ] **3.3** Update the `doctor.ts` header to reflect that the handler is real (remove the "stub / MS2-E5-S2" framing; keep the header ≤3 lines per boy-scout rule).
- [ ] **3.4** Verify exit-code behavior end-to-end: doctor never calls `process.exit` directly (the entrypoint does — GH-16 precedent); the non-zero exit flows solely from `result.exitCode` read by the entrypoint.
- [ ] **3.5** Add `tests/unit/cli/commands/doctor.test.ts` (TC-DOCTOR-011): three subtests — (a) mock `runDoctor` → `ok(report worstStatus "pass")` → `result.exitCode === 0`, `data` present, `error` unset; (b) `ok(report worstStatus "fail")` → `result.exitCode === 60`, `data` present, `error` unset; (c) `err(MarkSyncError)` → mapped `err(...)` (exit via the mapped code, `data` absent — the genuine command-error path). Assert the `exitCode` derivation goes through `codeToExitCode("DOCTOR_FAIL")` (not hardcoded 60).

**Acceptance Criteria**:

- Must: `marksync doctor` (no flag) is read-only and exits `0` when no check is `fail`; exits `60` when any gating check is `fail`; `data=DoctorReport` present and `error` unset on **both** paths (AC-F7-1, DEC-4, TC-DOCTOR-011).
- Must: `marksync doctor --probe-capabilities` runs the self-cleaning capability probes (AC-F3-2, DM-3).
- Must: `check:boundaries` green — handler imports no `#domain/*` / `#infra/*` (DEC-1).
- Must: handler never calls `process.exit` directly; builds `CommandResult` directly (not `ok()`/`err()` on the success path).

**Files and modules**:

- Code areas: `src/cli/commands/doctor.ts` (rewritten — stub → real thin handler); `src/cli/commands/router.ts` (one new option + action wiring); `tests/unit/cli/commands/doctor.test.ts` (new).
- System docs: none.

**Tests**:

- TC-DOCTOR-011 (unit): exit-code derivation + direct `CommandResult` construction.

**Completion signal**: `feat(doctor): wire doctor CLI handler, --probe-capabilities flag, and direct CommandResult (DEC-4)`

---

### Phase 4: Integration tests (`Bun.serve()` mock)

**Goal**: Land `tests/integration/cli/commands/doctor.test.ts` exercising end-to-end doctor behavior against a stateful in-process Confluence-shaped `Bun.serve()` mock — healthy flow, each gating failure, redaction end-to-end, `--json` envelope validity, and the self-cleaning capability probe.

**Tasks**:

- [ ] **4.1** TC-DOCTOR-013 (healthy pre-flight): `Bun.serve()` with `GET /wiki/api/v2/user/by-me` → 200, space read → 200, `GET /wiki/rest/api/content/{parentPageId}` → 200; valid env + a temp `marksync.yml`. Run doctor (no flag). Assert exit `0`; `data` present; `error` unset; `git-available`/`config-valid`/`credentials`/`space-access`/`parent-page` = `pass`; `content-property`/`attachment` = `skipped`; `permission-visibility`/`renderer` ∈ {`pass`,`warn`}; **0** POST/PUT/DELETE recorded on the mock (read-only).
- [ ] **4.2** TC-DOCTOR-014 (`--json` envelope): healthy setup; capture stdout; parse as JSON; assert `CommandResult<DoctorReport>` shape (`schemaVersion`, `runId`, `exitCode`, `data`; `error` undefined); `data` matches DM-1 (TC-DOCTOR-009 shape). ADR-0011 contract.
- [ ] **4.3** TC-DOCTOR-015 (redaction end-to-end): mock returns error bodies containing token-shaped substrings (`{"message":"Invalid token: ATATT…"}`, `user:token@host`); run `doctor --json`; assert the serialized stdout contains **0** token-shaped substrings (replaced with `[REDACTED:<kind>]`) while preserving non-sensitive context. Validates the centralized chokepoint covers doctor's real output path.
- [ ] **4.4** TC-DOCTOR-016 (bad token): `by-me` → 401; invalid token in env; assert `credentials` `fail` + fix; raw token absent from output; exit `60`; `data` present; `error` unset.
- [ ] **4.5** TC-DOCTOR-017 (wrong/inaccessible space): `by-me` → 200; space read → 404/403; assert `space-access` `fail` (detail distinguishes not-found vs forbidden); exit `60`; earlier checks pass.
- [ ] **4.6** TC-DOCTOR-018 (missing parent): `by-me`/space → 200; `getPage(parentPageId)` → 404/403; assert `parent-page` `fail` (detail distinguishes not-found vs not-writable); exit `60`; earlier checks pass.
- [ ] **4.7** TC-DOCTOR-019 (`--probe-capabilities` self-cleaning): mock with full CRUD (`POST content` → 201, `PUT .../property` → 200, attachment endpoint → 200, `DELETE ...` → 204); run `doctor --probe-capabilities`; assert `content-property`/`attachment` = `pass`; `report.probeCapabilities === true`; mock received exactly 1 scratch-page `POST`, the probe calls, and **1 `DELETE`**; assert 0 scratch pages remain (self-cleaning confirmed, RSK-2).
- [ ] **4.8** TC-DOCTOR-020 (permission advisory): all endpoints 200; `getRestrictions` returns restrictions; assert `permission-visibility` = `warn` disclosing 403→warn+skip; exit `0` (advisory never gates).
- [ ] **4.9** TC-DOCTOR-021 (renderer warn): inject/mocks renderer init failure; assert `renderer` = `warn` + fix; exit `0` (informational, never gates).
- [ ] **4.10** TC-DOCTOR-022 (any gating fail → exit 60): run a matrix of the gating failures (git missing, config invalid, bad token, wrong spaceKey, missing parent); for each assert exit `60`, `data` present, `error` unset, `worstStatus === "fail"`. Confirms DEC-4 / TDR-0009 consistency across all gating check types.
- [ ] **4.11** Use `mkdtempSync`/`rmSync` for temp config/cache dirs per test (isolation per test plan §6.2); start/stop the `Bun.serve()` mock per test; use `#`-prefixed import aliases.

**Acceptance Criteria**:

- Must: TC-DOCTOR-013..022 pass via `bun test tests/integration/cli/commands/doctor.test.ts`.
- Must: healthy pre-flight is read-only (0 writes) and exits 0 (AC-F1-1, AC-F3-2).
- Must: each gating failure produces exit 60 with `data` present and `error` unset (AC-F7-1, TC-DOCTOR-022).
- Must: `--probe-capabilities` self-cleans (0 scratch pages remain) and the probes report pass/fail (AC-F3-2, TC-DOCTOR-019).
- Must: serialized `--json` output contains 0 token-shaped substrings (AC-SEC-1, TC-DOCTOR-015) and is a valid `CommandResult<DoctorReport>` envelope (AC-JSON-1, TC-DOCTOR-014).

**Files and modules**:

- Code areas: `tests/integration/cli/commands/doctor.test.ts` (new).
- System docs: none.

**Tests**:

- TC-DOCTOR-013..022 (integration) — this phase IS the test.

**Completion signal**: `test(doctor): integration tests for healthy, failures, redaction, probe, and exit-code (Bun.serve mock)`

---

### Phase 5: Documentation and Spec Synchronization

**Goal**: Reconcile the system spec with the delivered `doctor` surface, and ensure the feature spec describes the command, the `DoctorReport`, the check catalogue, the `--probe-capabilities` opt-in, the read-only default, and the `EXIT_HEALTH`/`DOCTOR_FAIL` exit semantics accurately.

**Tasks**:

- [ ] **5.1** Update `doc/spec/features/feature-cli.md` (§3.1 `doctor`, §3.3 auth, §5 AC) to describe the delivered `doctor` command: the 9-check catalogue (gating vs warn-only); read-only default + `--probe-capabilities` opt-in self-cleaning probes; the `DoctorReport` + stable check-id set (DM-1, DM-2); the `CommandResult<DoctorReport>` direct construction (DEC-4) with `data` always present / `error` never set; the `EXIT_HEALTH` (60) / `DOCTOR_FAIL` exit semantics (TDR-0009); INV-SEC-1 behavior (no token in output).
- [ ] **5.2** Update `doc/spec/nonfunctional.md` entries cited by this story — NFR-OBS-4 (doctor minimal), NFR-COMP-4 (Git CLI prereq), NFR-SEC-1 / INV-SEC-1 (no secrets), NFR-OBS-1 (stable exit codes — add the `DOCTOR_FAIL → 60` class), NFR-OBS-2 (structured output), NFR-A11Y-1 (no color dependency) — so each reads consistently with the delivered behavior.
- [ ] **5.3** Spec reconciliation sign-off (spec §16 Affected Components): verify every deliverable is implemented — handler replaced, router flag added, app-tier orchestration new, exit-code map extended additively, `DoctorReport` + check ids new, config/credential/target/adapter primitives unchanged. Verify spec §15 decisions (DEC-1..DEC-6) are reflected in the code and §14 OQ-1 is marked resolved by TDR-0009.
- [ ] **5.4** Update `doc/overview/ubiquitous-language.md` / `glossary.md` only if a new term needs binding (`DoctorReport`, `DoctorCheck`, `DOCTOR_FAIL`/`EXIT_HEALTH`, `gating check`, `capability probe`, `403 → warn+skip policy`) and is not already present.

**Acceptance Criteria**:

- Must: `feature-cli.md` accurately describes the delivered `doctor` capabilities, check catalogue, `DoctorReport`, read-only/probe distinction, and exit semantics.
- Must: all spec deliverables implemented; all decisions reflected; OQ-1 marked resolved by TDR-0009.
- Must: system documentation consistent with NFRs (no contradictions).

**Files and modules**:

- Code areas: none.
- System docs: `doc/spec/features/feature-cli.md` (updated); `doc/spec/nonfunctional.md` (wording); `doc/overview/ubiquitous-language.md` / `glossary.md` (only if new terms).

**Tests**:

- Manual review of documentation completeness vs. spec + implementation.

**Completion signal**: `docs(spec): document doctor command, DoctorReport, check catalogue, and EXIT_HEALTH semantics`

---

### Phase 6: Finalize and Release

**Goal**: Version bump per repo conventions, final verification, spec reconciliation sign-off, and readiness for PR.

**Tasks**:

- [ ] **6.1** Bump the version in `package.json` to the next **minor** per `version_impact: minor` (GH-16 / GH-18 / GH-27 / GH-28 precedent — currently `0.6.0` → `0.7.0`), and update `CLI_VERSION` in `src/cli/commands/router.ts` to match.
- [ ] **6.2** Final full run: `bun run check` (lint + format:check + typecheck + test + check:boundaries) — all green (AC-CI-1). Confirm the test files are picked up: new (`tests/unit/app/doctor.test.ts`, `tests/unit/cli/commands/doctor.test.ts`, `tests/integration/cli/commands/doctor.test.ts`) + extended (`tests/unit/cli/output/exit-codes.test.ts` per task 1.5).
- [ ] **6.3** Spec reconciliation sign-off: re-read spec §17 (AC-F1-1..F7-1, AC-SEC-1, AC-JSON-1, AC-CI-1) against the implemented behavior + tests; confirm each AC is met (see Test Scenarios AC-coverage check).
- [ ] **6.4** Verify the read-only default vs `--probe-capabilities` distinction is explicit and testable end-to-end (AC-F3-2): default = 0 writes + 2 `skipped` probes; `--probe-capabilities` = self-cleaning probes that report pass/fail.
- [ ] **6.5** Confirm no changes leaked into the reused primitives (`loadConfig`, `resolveCredentials`/`validateCredentials`, `createRepository`/`createTarget`, `TargetSystem` port, `CommandResult` envelope) — `git diff` review of those files should be empty for this change (out of scope, NG-4). The only shared-contract edit is the additive `EXIT_HEALTH`/`DOCTOR_FAIL` in `exit-codes.ts` (Phase 1).

**Acceptance Criteria**:

- Must: version bumped to next minor; `CLI_VERSION` matches `package.json`.
- Must: `bun run check` green (AC-CI-1).
- Must: all spec ACs met (§17); all 22 TCs implemented and passing.
- Must: reused primitives untouched (out of scope honored) — only the additive exit-code edit to the shared contract.

**Files and modules**:

- Code areas: `package.json` (version); `src/cli/commands/router.ts` (`CLI_VERSION`).
- System docs: none (Phase 5 handled spec sync).

**Tests**:

- `bun run check` (full suite).

**Completion signal**: `chore(release): bump version to 0.7.0 (minor) for GH-30 doctor health-check`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-DOCTOR-001 | Unit: Git probe err → `git-available` `fail` + detail + fix | 2 | AC-F1-2, F-1, NFR-COMP-4 |
| TC-DOCTOR-002 | Unit: `config-valid` `fail` on missing + invalid (ajv) config, AI-readable | 2 | AC-F1-3, F-1 |
| TC-DOCTOR-003 | Unit: `credentials` `fail` on missing + invalid creds (no token leak) | 2 | AC-F2-1, F-2, NFR-SEC-1 |
| TC-DOCTOR-004 | Unit: `space-access` `fail` (unreachable vs forbidden) | 2 | AC-F2-2, F-2 |
| TC-DOCTOR-005 | Unit: `parent-page` `fail` (not found vs not writable) | 2 | AC-F3-1, F-3 |
| TC-DOCTOR-006 | Unit: `--probe-capabilities` absent → probes `skipped`, zero writes | 2 | AC-F3-2, F-3, F-8 |
| TC-DOCTOR-007 | Unit: `permission-visibility` `warn` (never `fail`, never gates) | 2 | AC-F4-1, F-4, R-FEA-10 |
| TC-DOCTOR-008 | Unit: `renderer` `warn` on init failure (never gates) | 2 | AC-F5-1, F-5 |
| TC-DOCTOR-009 | Unit: `DoctorReport` assembly — DM-1/DM-2 shape, summary, `worstStatus` | 2 | AC-F6-1, F-6, DM-1, DM-2 |
| TC-DOCTOR-010 | Unit: `codeToExitCode("DOCTOR_FAIL") === 60`, `EXIT_HEALTH`, `CONFLICT→30` unchanged | 1 | AC-F7-1, F-7, NFR-OBS-1, DM-4, TDR-0009 |
| TC-DOCTOR-011 | Unit: exit derivation — worstStatus fail→60, no-fail→0; direct `CommandResult` | 3 | AC-F7-1, F-7, DEC-4 |
| TC-DOCTOR-012 | Unit: `redactString(JSON.stringify(report))` scrubs token-shaped substrings | 2 | AC-SEC-1, INV-SEC-1, NFR-SEC-1, DEC-6 |
| TC-DOCTOR-013 | Integration: healthy pre-flight (read-only) — all pass/warn, exit 0 | 4 | AC-F1-1, F-1..F-5, NFR-OBS-4, NFR-OBS-2 |
| TC-DOCTOR-014 | Integration: `--json` emits valid `CommandResult<DoctorReport>` envelope | 4 | AC-JSON-1, F-6, NFR-OBS-2 |
| TC-DOCTOR-015 | Integration: redaction end-to-end — token-shaped substrings absent from output | 4 | AC-SEC-1, INV-SEC-1, NFR-SEC-1 |
| TC-DOCTOR-016 | Integration: bad token → `credentials` `fail`, no leak, exit 60 | 4 | AC-F2-1, F-2, NFR-SEC-1 |
| TC-DOCTOR-017 | Integration: wrong/inaccessible space → `space-access` `fail`, exit 60 | 4 | AC-F2-2, F-2 |
| TC-DOCTOR-018 | Integration: missing parent → `parent-page` `fail`, exit 60 | 4 | AC-F3-1, F-3 |
| TC-DOCTOR-019 | Integration: `--probe-capabilities` — self-cleaning scratch page, probes pass/fail | 4 | AC-F3-2, F-3, F-8, DEC-1 |
| TC-DOCTOR-020 | Integration: `permission-visibility` `warn`, does not gate exit | 4 | AC-F4-1, F-4, R-FEA-10 |
| TC-DOCTOR-021 | Integration: `renderer` `warn` on init failure, does not gate exit | 4 | AC-F5-1, F-5 |
| TC-DOCTOR-022 | Integration: any gating `fail` → exit 60, data present, error unset | 4 | AC-F7-1, F-7, DEC-4, TDR-0009 |

**AC coverage check (spec §17):** AC-F1-1 → TC-013 · AC-F1-2 → TC-001 · AC-F1-3 → TC-002 · AC-F2-1 → TC-003/016 · AC-F2-2 → TC-004/017 · AC-F3-1 → TC-005/018 · AC-F3-2 → TC-006/019 · AC-F4-1 → TC-007/020 · AC-F5-1 → TC-008/021 · AC-F6-1 → TC-009 · AC-F7-1 → TC-010/011/022 · AC-SEC-1 → TC-012/015 · AC-JSON-1 → TC-014 · AC-CI-1 → Phase 6. **All ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-30-spec.md | Spec |
| Test plan | ./chg-GH-30-test-plan.md | Test Plan |
| Story file | `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md` | Story |
| TDR-0009 (EXIT_HEALTH=60 / DOCTOR_FAIL) | `doc/decisions/TDR-0009-doctor-health-check-exit-code.md` | Decision |
| ADR-0011 (structured `CommandResult<T>` output) | `doc/decisions/ADR-0011-cli-output-strategy.md` | ADR |
| Exit-code contract (extended) | `src/cli/output/exit-codes.ts` (`EXIT_HEALTH`, `DOCTOR_FAIL`, `CODE_TO_EXIT`, `codeToExitCode`) | Code |
| Output envelope (consumed directly, not via ok/err) | `src/cli/output/command-result.ts` (`CommandResult<T>`, `SCHEMA_VERSION`) | Code |
| Centralized redaction chokepoint | `src/shared/redact.ts` (`redactString`) — applied by `OutputService.emit` (DEC-4) | Code |
| Error-kind→code bridge (abort path only) | `src/app/cli-error-map.ts` (`mapMarkSyncErrorToCommandError`) | Code |
| Reused primitives — config | `src/app/config.ts` (`loadConfig`) | Code |
| Reused primitives — credentials | `src/app/credentials.ts` (`resolveCredentials`, `validateCredentials`, `maskEmail`) | Code |
| Reused primitives — ports | `src/app/ports.ts` (`createRepository`, `createTarget`) | Code |
| Reused ports — Git / Target | `src/domain/git/port.ts` (`Repository.headSha`), `src/domain/target/port.ts` (`getPage`, `searchPages`, `getProperty`/`putProperty`, `attachmentExists`/`uploadAttachment`, `getRestrictions`) | Code |
| Renderer port (warn-only probe) | `src/domain/mermaid/port.ts` (`Renderer`) | Code |
| Pattern to mirror (presentation) | `src/cli/commands/repair-state.ts` (thin handler shape; direct-result construction differs per DEC-4) | Code |
| Pattern to mirror (app-tier) | `src/app/repair.ts` (`as const` code set + derived union, `Result` orchestration) | Code |
| Doctor stub (replaced) | `src/cli/commands/doctor.ts` (current stub → real handler) | Code |
| Router (flag added) | `src/cli/commands/router.ts` (`doctor` subcommand + `--probe-capabilities`) | Code |
| Coding rules | `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md` | Standards |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | plan-writer | Initial plan for GH-30. 6 phases: exit-code extension → app-tier `runDoctor` + unit tests → CLI handler + router + exit-derivation unit → integration tests (`Bun.serve` mock) → docs/spec sync → release. Resolved the runDoctor-owns-the-resolution-probes design point (spec F-1/F-2 + TC-DOCTOR-002/003 are authoritative over the "handler pre-resolves" sketch — config-valid/credentials/git-available are checks inside the report). OQ-1 resolved by TDR-0009 (`EXIT_HEALTH=60` / `DOCTOR_FAIL`, additive). Redaction is the centralized `redactString` chokepoint (DEC-4) — no app-tier redaction (DEC-6). Reuses `loadConfig` / `resolveCredentials`+`validateCredentials` / `createRepository`+`createTarget` + the `TargetSystem` port unchanged; only shared-contract edit is the additive exit code. Flagged the renderer probe (RSK-R1) as a low-risk warn-only coder decision. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ✅ Complete | 2026-07-15T00:00:00Z | 2026-07-15T00:00:00Z | TBD | Exit-code extension + mapping unit test — EXIT_HEALTH=60, DOCTOR_FAIL added to CODE_TO_EXIT, test extended (31 pass, 0 fail) |
| Phase 2 | ☐ Pending | — | — | — | App-tier `runDoctor` + check unit tests |
| Phase 3 | ☐ Pending | — | — | — | CLI handler + router + exit-derivation unit test |
| Phase 4 | ☐ Pending | — | — | — | Integration tests (`Bun.serve` mock) |
| Phase 5 | ☐ Pending | — | — | — | Documentation & spec synchronization |
| Phase 6 | ☐ Pending | — | — | — | Version bump + final verification |
