---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-16-test-plan
status: Draft
created: 2026-07-08T16:50:00Z
last_updated: 2026-07-08T16:50:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical]
version_impact: minor
summary: "Test plan for the GH-16 CLI output pipeline — CommandResult<T> envelope + snake_case JSON contract, generic human renderer + per-command formatter registry, centralized redaction (INV-SEC-1), stable exit-code map, non-interactive color auto-detect, the application-tier MarkSyncError→code mapper (DEC-1), the Cliffy command skeleton with global flags + stub handlers, and the pinned JSON snapshot contract test."
links:
  change_spec: ./chg-GH-16-spec.md
  implementation_plan: ./chg-GH-16-plan.md
  testing_strategy: ../../../.ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E2-S3] CLI framework + CommandResult<T> — hybrid output pipeline, centralized redaction, stable exit codes, Cliffy skeleton

## 1. Scope and Objectives

This plan verifies the ADR-0011 hybrid CLI output pipeline introduced by GH-16:
the `CommandResult<T>` structured-result envelope (with a stable snake_case JSON
wire shape), the generic JSON renderer, the generic human renderer with its
optional per-command formatter registry, the centralized `Redactor`, the stable
exit-code map + stable `error.code` strings, the non-interactive color
auto-detect, the application-tier `MarkSyncError → { code, exitCode }` mapper
(DEC-1), the Cliffy command skeleton with global flags and stub handlers, the
real entrypoint, and the pinned JSON contract snapshot.

The core integrity risks this plan guards against are: (a) a secret leaking
through any output path — the load-bearing **INV-SEC-1** invariant
(`CommandResult` is the first non-bypassable chokepoint); (b) JSON output that
is invalid, schema-drifting, or not produced by some command (ADR-0011 C-1/C-4);
(c) color codes appearing in piped/non-interactive output (NFR-A11Y-1); (d) a
**dep-cruiser tier violation** from placing the `MarkSyncError.kind → exitCode`
mapping in `src/cli/` (DEC-1/RSK-2); (e) over-redaction scrubbing a legitimate
40-char hex Git SHA (RSK-1); and (f) a new command requiring central output
module edits (ADR-0011 C-3).

Per the story Test matrix and `.ai/rules/testing-strategy.md`, this story is
exercised across the **Unit**, **Integration**, and **Golden-fixture** tiers
(no Mermaid-DOM, no live-sandbox E2E, no BDD lifecycle-invariant tier — those
attach to later stories).

### 1.1 In Scope

- **Redaction (INV-SEC-1):** every documented secret pattern
  (`Authorization: Bearer …`, `gho_…`, `ATATT…`, email-shaped,
  `MARKSYNC_*_TOKEN` value >20 chars) is scrubbed from emitted JSON **and**
  human output; a 40-char hex Git SHA is **NOT** scrubbed (RSK-1); redaction is
  applied to the **serialized** output (DEC-4), so a token nested inside a
  `data` field that is only exposed after `JSON.stringify` is still caught.
- **CommandResult<T> + JSON contract:** the envelope shape; the stable
  snake_case wire format (DEC-2); stable key order; `schema_version`/`run_id`/
  `exit_code` presence; success vs error variants; NDJSON one-object-per-line.
- **Generic human renderer + registry:** the generic key-value fallback; the
  `registerHumanFormatter` override; the "richer than fallback" contract; the
  plain-log/screen-reader mode (`--no-color --output=human` → no box-drawing,
  no ANSI — NFR-A11Y-2).
- **Exit codes:** the stable numeric map (0/2/10/20/30/40/50/70/99) keyed by
  stable `error.code` strings; the load-bearing `CONFLICT → 30` mapping.
- **App-tier mapper (DEC-1):** the exhaustive `MarkSyncError.kind → { code,
  exitCode }` translation in `src/app/cli-error-map.ts`; its tier placement
  (app→domain ✓, never cli→domain).
- **Color policy:** non-interactive detection (piped stdout, `CI`, `NO_COLOR`,
  `TERM=dumb`); `--color`/`--no-color` overrides.
- **OutputService chokepoint:** emit() = redact → render → write → return
  exit code; the single non-bypassable path.
- **Cliffy skeleton:** global flags parsed; stub handlers return placeholder
  `CommandResult`; the GH-15 `init` handler is rewired (not rewritten);
  unknown-command → USAGE error (exit 2); entrypoint parse→route→execute→emit→exit.
- **Contract snapshot (golden):** a pinned JSON snapshot of a representative
  success and error `CommandResult` — the C-4 schema-stability artifact.
- **Zero-central-coupling (C-3):** adding a stub command requires zero diff to
  `json.ts`/`human.ts`/`redact.ts`.
- **Tier isolation:** `check:boundaries` clean; `rg '@cliffy' src/app src/domain
  src/infra` returns empty (TDR-0002 mitigation 4).

### 1.2 Out of Scope & Known Gaps

- **Real command logic** (plan/sync/doctor/repair) — stub handlers return
  placeholder results; real logic lands in later stories. Only the *framework*
  and *contract* are tested.
- **NDJSON streaming for `sync --watch`** — the renderer is wired; no watch
  command is added (story NG-2). NDJSON is tested at the unit level only.
- **pino logging redaction wiring** — the `Redactor` is reusable by logging in
  a later story (spec §7.3); this story wires redaction for CLI output only.
- **Per-command human formatters for every command** — each command's formatter
  lands with that command; here only the registry + one example formatter is
  tested.
- **BDD (Gherkin) lifecycle-invariant tier** — INV-SEC-1 is validated through
  unit + integration paths here (per testing-strategy, mocks are not allowed for
  lifecycle invariants, and these tests use real redaction on real captured
  output, not mocks). A formal Gherkin scenario may be added when the first
  real command that handles credentials lands; this story establishes the
  redaction *layer* that such a scenario would exercise.
- **E2E (live-sandbox)** — no Confluence network; not applicable.
- **Performance** — only an informational `emit()` latency guardrail (≤ 10 ms
  p95, NFR-8); no product-scale perf testing.

## 2. References

| Artifact | Path |
|----------|------|
| Change specification | [`./chg-GH-16-spec.md`](./chg-GH-16-spec.md) |
| Implementation plan | [`./chg-GH-16-plan.md`](./chg-GH-16-plan.md) |
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S3--cli-framework.md` |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) |
| CLI output strategy (load-bearing) | [ADR-0011](../../../decisions/ADR-0011-cli-output-strategy.md) |
| CLI framework (Cliffy) | [TDR-0002](../../../decisions/TDR-0002-cli-framework.md) |
| Security baseline (redaction) | [`doc/guides/security-baseline.md`](../../../guides/security-baseline.md) |
| Architecture (dependency matrix) | [`doc/overview/architecture-overview.md`](../../../overview/architecture-overview.md) |
| `Result<T,E>` primitive | `src/domain/result.ts` |
| `MarkSyncError` union + exhaustive check | `src/domain/errors.ts` |
| CLI feature spec | `doc/spec/features/feature-cli.md` |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| Story AC | Spec AC | Description | F-# | TC ID(s) | Status |
|----------|---------|-------------|-----|----------|--------|
| AC-1 | AC-F4-1 | A `CommandResult` with a synthetic token-shaped string in **any** field → emitted JSON/human output contains NO token (grep on captured stdout) — INV-SEC-1 | F-4, F-7 | TC-RED-001..005, TC-RED-007..009, TC-OUT-001 | Covered |
| AC-1 | AC-F4-2 | A 40-char hex Git SHA is **NOT** redacted (over-redaction guard, R1) | F-4 | TC-RED-006 | Covered |
| AC-2 | AC-F2-1 | Every stub command with `--json` → valid parseable JSON matching the pinned snapshot (snake_case, stable key order, schema_version/run_id/exit_code) | F-1, F-2, F-8 | TC-JSON-001..007, TC-CMD-001, TC-CONTRACT-001..002, TC-INT-001 | Covered |
| AC-3 | AC-F6-1 | Piped output has zero ANSI; `--color` forces on; `--no-color` forces off — NFR-A11Y-1 | F-6, F-7 | TC-COLOR-001..008, TC-INT-002 | Covered |
| AC-4 | AC-F6-2 | `--no-color --output=human` → no box-drawing chars, no ANSI (plain-log/screen-reader) — NFR-A11Y-2 | F-3, F-6, F-7 | TC-HUMAN-005 | Covered |
| AC-5 | AC-F7-1 | Adding a new stub command requires ZERO changes to json.ts/human.ts/redact.ts (C-3) | F-2, F-3, F-4 | TC-C3-001 | Covered |
| AC-6 | AC-F5-1 | Synthetic `{ error:{ code:"CONFLICT" } }` → process exits 30 | F-5, F-9 | TC-EXIT-001, TC-MAP-001, TC-INT-003 | Covered |
| AC-7 | AC-F3-1 | `registerHumanFormatter` richer than generic fallback; unregistered → fallback | F-3 | TC-HUMAN-001..004 | Covered |
| AC-8 | AC-F10-1 | `bun run check` (lint + typecheck + test + boundaries) exits 0; contract snapshot green | F-1..F-10 | TC-GATE-001, TC-BND-001..003 | Covered (gate) |

**Capability (F-#) rollup:**

| F-# | Capability | TC ID(s) |
|-----|------------|----------|
| F-1 | `CommandResult<T>` contract | TC-CR-001..005, TC-JSON-001..007 |
| F-2 | Generic JSON renderer | TC-JSON-001..007, TC-CONTRACT-001..002 |
| F-3 | Generic human renderer + registry | TC-HUMAN-001..006 |
| F-4 | Centralized redaction | TC-RED-001..009 |
| F-5 | Exit-code map + `error.code` strings | TC-EXIT-001..008, TC-MAP-001..007 |
| F-6 | Color policy | TC-COLOR-001..008 |
| F-7 | `OutputService` chokepoint | TC-OUT-001..006 |
| F-8 | Cliffy skeleton + global flags | TC-CMD-001..005 |
| F-9 | Entrypoint | TC-CMD-005, TC-INT-001..003 |
| F-10 | Contract snapshot test | TC-CONTRACT-001..002 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No REST/HTTP endpoints (spec §8.1) and no events/messages (spec §8.2) are
introduced. Data-model coverage:

| DM-# | Element | Description | TC ID(s) |
|------|---------|-------------|----------|
| DM-1 | `CommandResult<T>` | `{ schema_version, run_id, exit_code, timing?, data?:T, error?:CommandError, warnings?[] }`; TS camelCase, JSON snake_case (DEC-2) | TC-CR-001..005, TC-JSON-001..007, TC-CONTRACT-001..002 |
| DM-2 | `CommandError` | `{ code, message, retryable }`; `code` stable string (DEC-6); `message` redacted (DEC-3) | TC-CR-002, TC-MAP-006, TC-JSON-007 |
| DM-4 | Exit-code constants + `error.code` table | 9 numeric classes (0/2/10/20/30/40/50/70/99) + stable `error.code` strings; kind→code mapping in app tier (DEC-1) | TC-EXIT-001..008, TC-MAP-001..007 |

**Public interface contracts consumed downstream** (verified as side-effects):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `CommandResult<T>` + `OutputService.emit()` | every future command (plan/sync/doctor/repair — MS2-E3+) | TC-CR-*, TC-OUT-* |
| `registerHumanFormatter<T>(command, fn)` | per-command rich human output | TC-HUMAN-002..003 |
| Exit-code constants / `codeToExitCode(code)` | CI pipelines, scripts, agents | TC-EXIT-* |
| `Redactor` (reused transparently) | logging (pino) in later stories | TC-RED-* |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# | Requirement | Threshold | TC ID(s) | Status |
|-------|-------------|-----------|----------|--------|
| NFR-1 | Redaction completeness | 0 token matches in any emitted output | TC-RED-001..005, TC-RED-007..009 | Covered |
| NFR-2 | Over-redaction guard | 40-char hex SHA survives | TC-RED-006 | Covered |
| NFR-3 | JSON validity + schema | valid + snake_case + stable key order + version | TC-JSON-001..007, TC-CONTRACT-001..002 | Covered |
| NFR-4 | Auto-decolor in non-interactive | piped/CI/NO_COLOR/TERM=dumb → off | TC-COLOR-001..008 | Covered |
| NFR-5 | Plain-log/screen-reader mode | no box-drawing, no ANSI | TC-HUMAN-005 | Covered |
| NFR-6 | No central coupling (C-3) | new command → zero central diff | TC-C3-001 | Covered |
| NFR-7 | Stable exit codes | CONFLICT→30; full map | TC-EXIT-001..008, TC-MAP-001..007 | Covered |
| NFR-8 | Output latency | `emit()` ≤ 10 ms p95 (informational) | TC-OUT-006 | Covered (info) |
| NFR-9 | Quality gate | `bun run check` exits 0 | TC-GATE-001 | Covered (gate) |
| NFR-11 | Tier isolation | dep-cruiser clean; presentation never names MarkSyncError | TC-BND-001..003 | Covered |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md`, this story is exercised across three tiers:

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes (primary) | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| **Integration** | Yes | `bun:test` + `Bun.spawn` | `tests/integration/` | capture real stdout/stderr/exit of a stub command |
| **Golden fixture** | Yes (contract) | `bun:test` `toMatchSnapshot` | `tests/golden/` + `tests/golden/fixtures/` | pinned JSON snapshot |
| Mermaid-DOM | No | — | — | — |
| BDD (Gherkin) | No (deferred — see §1.2) | — | — | — |
| E2E (live-sandbox) | No | — | — | — |
| Performance (informational) | Yes — `emit()` latency only | `bun:test` timing | `tests/unit/cli/output/` | folded into `output-service.test.ts` |
| Type-level (compile safety) | Yes — exhaustive mapper | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per plan phases 2–7):**

```
src/cli/output/command-result.ts   → tests/unit/cli/output/command-result.test.ts   (Phase 2)
src/cli/output/exit-codes.ts       → tests/unit/cli/output/exit-codes.test.ts       (Phase 2)
src/cli/output/color.ts            → tests/unit/cli/output/color.test.ts            (Phase 2)
src/cli/output/redact.ts           → tests/unit/cli/output/redact.test.ts           (Phase 3)
src/cli/output/json.ts             → tests/unit/cli/output/json.test.ts             (Phase 4)
src/cli/output/human.ts            → tests/unit/cli/output/human.test.ts            (Phase 4)
src/cli/output/index.ts (OutputService) → tests/unit/cli/output/output-service.test.ts (Phase 4)
src/app/cli-error-map.ts           → tests/unit/app/cli-error-map.test.ts           (Phase 5)
src/cli/commands/router.ts + stubs → tests/unit/cli/commands/router.test.ts         (Phase 6)
                                   → tests/unit/cli/commands/{init,plan,...}.test.ts (Phase 6)
Contract snapshot                  → tests/golden/cli-output.snapshot.test.ts        (Phase 7)
                                   → tests/golden/fixtures/command-result.{success,error}.json
End-to-end via Bun.spawn           → tests/integration/cli-output.test.ts            (Phase 7)
                                   → tests/integration/cli-add-command.test.ts       (Phase 7)
```

> **Module residence is cross-checked against the dependency-direction matrix**
> (`doc/overview/architecture-overview.md`): presentation (`src/cli/`) →
> application (`src/app/`) → domain → infra. The GH-15 DoR iter-1 failed on a
> tier-placement guess; here every `src/cli/**` test module exercises code that
> imports **only** `#app/*` (or nothing), never `#domain/*`/`#infra/*`. The
> `MarkSyncError`-naming mapper lives in `src/app/` (DEC-1), so its test lives
> in `tests/unit/app/`.

**Over-mocking guardrail (TDR-0004):** do NOT mock the `Redactor`, the JSON
serializer, or the human renderer — exercise them with real inputs and real
captured output. Mocks are permitted **only** for: (a) the environment/TTY
signals in color-policy tests (`process.stdout.isTTY`, `process.env.NO_COLOR`,
`CI`, `TERM`) — these are boundary signals, not domain logic; and (b) the
`Bun.spawn` harness captures real process output (not a mock of it). INV-SEC-1
is validated against **real captured stdout/stderr**, never via a mock that
asserts "redaction was called".

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-RED-001 | `Authorization: Bearer <tok>` redacted from JSON + human | Negative | Critical | High | AC-1 |
| TC-RED-002 | `gho_…` GitHub token redacted | Negative | Critical | High | AC-1 |
| TC-RED-003 | `ATATT…` Atlassian token redacted | Negative | Critical | High | AC-1 |
| TC-RED-004 | Email-shaped value redacted | Negative | Important | Medium | AC-1 |
| TC-RED-005 | `MARKSYNC_API_TOKEN` value >20 chars redacted | Negative | Critical | High | AC-1 |
| TC-RED-006 | 40-char hex Git SHA is NOT redacted (R1 guard) | Corner Case | Critical | High | AC-1 (AC-F4-2) |
| TC-RED-007 | Token nested in `data` field → redacted after serialization (DEC-4) | Corner Case | Critical | High | AC-1 |
| TC-RED-008 | Token in human-format string redacted | Negative | Critical | High | AC-1 |
| TC-RED-009 | Multiple distinct secrets in one output all redacted | Edge Case | Important | Medium | AC-1 |
| TC-CR-001 | Success envelope shape (data, no error) | Happy Path | Critical | High | AC-2 |
| TC-CR-002 | Error envelope shape (error:{code,message,retryable}) | Happy Path | Critical | High | AC-2, AC-6 |
| TC-CR-003 | `warnings[]` optional array present | Edge Case | Minor | Low | AC-2 |
| TC-CR-004 | `timing` optional `{started_at,duration_ms}` (snake_case on wire) | Edge Case | Minor | Low | AC-2 |
| TC-CR-005 | `ok()`/`err()` factories produce correct shapes | Corner Case | Important | Medium | AC-2 |
| TC-JSON-001 | `renderJson` produces valid parseable JSON | Happy Path | Critical | High | AC-2 |
| TC-JSON-002 | Stable key order (deterministic, snapshot-stable) | Corner Case | Critical | High | AC-2 |
| TC-JSON-003 | snake_case keys (`schema_version`,`run_id`,`exit_code`) — DEC-2 | Corner Case | Critical | High | AC-2 |
| TC-JSON-004 | `schema_version` present and equals 1 | Happy Path | Critical | High | AC-2 |
| TC-JSON-005 | `renderNdjson` emits one JSON object per line | Edge Case | Important | Medium | AC-2 |
| TC-JSON-006 | Success variant wire shape | Happy Path | Critical | High | AC-2 |
| TC-JSON-007 | Error variant wire shape (top-level error object) | Happy Path | Critical | High | AC-2, AC-6 |
| TC-HUMAN-001 | Generic fallback renders key-value for unregistered command | Happy Path | Critical | High | AC-7 |
| TC-HUMAN-002 | Registered formatter used for registered command | Happy Path | Critical | High | AC-7 |
| TC-HUMAN-003 | Registered output is richer than fallback | Corner Case | Critical | High | AC-7 (AC-F3-1) |
| TC-HUMAN-004 | Unregistered command falls back to generic | Edge Case | Important | Medium | AC-7 |
| TC-HUMAN-005 | `--no-color --output=human` → no box-drawing, no ANSI (NFR-A11Y-2) | Negative | Critical | High | AC-4 |
| TC-HUMAN-006 | Human output passes through redaction | Negative | Critical | High | AC-1 |
| TC-COLOR-001 | `isTTY=true` → color enabled | Happy Path | Critical | High | AC-3 |
| TC-COLOR-002 | `isTTY=false` (piped) → color disabled | Negative | Critical | High | AC-3 |
| TC-COLOR-003 | `NO_COLOR` set → disabled | Negative | Critical | High | AC-3 |
| TC-COLOR-004 | `CI` set → disabled | Negative | Important | Medium | AC-3 |
| TC-COLOR-005 | `TERM=dumb` → disabled | Negative | Important | Medium | AC-3 |
| TC-COLOR-006 | `--color` forces on even when piped | Corner Case | Critical | High | AC-3 |
| TC-COLOR-007 | `--no-color` forces off even in TTY | Corner Case | Critical | High | AC-3 |
| TC-COLOR-008 | Piped output has zero ANSI codes (integration) | Negative | Critical | High | AC-3 |
| TC-EXIT-001 | `error.code "CONFLICT"` → exit 30 (AC-6 load-bearing) | Happy Path | Critical | High | AC-6 |
| TC-EXIT-002 | `REMOTE_MISSING` → 40 | Happy Path | Important | Medium | AC-6 |
| TC-EXIT-003 | `INVALID_CONFIG` → 10 | Happy Path | Important | Medium | AC-6 |
| TC-EXIT-004 | `USAGE` → 2 | Happy Path | Important | Medium | AC-6 |
| TC-EXIT-005 | `RENDER_UNAVAILABLE` → 70 | Happy Path | Minor | Low | AC-6 |
| TC-EXIT-006 | `INTERNAL` → 99 | Happy Path | Minor | Low | AC-6 |
| TC-EXIT-007 | Clean success → 0 | Happy Path | Critical | High | AC-6 |
| TC-EXIT-008 | Unknown `error.code` → documented fallback (e.g. INTERNAL/99) | Edge Case | Important | Medium | AC-6 |
| TC-MAP-001 | `kind "Conflict"` → `{code:"CONFLICT", exitCode:30}` | Happy Path | Critical | High | AC-6 |
| TC-MAP-002 | `kind "InvalidConfig"` → `{code:"INVALID_CONFIG", exitCode:10}` | Happy Path | Important | Medium | AC-6 |
| TC-MAP-003 | `kind "RemoteMissing"` → `{code:"REMOTE_MISSING", exitCode:40}` | Happy Path | Important | Medium | AC-6 |
| TC-MAP-004 | `kind "RenderUnavailable"` → `{code:"RENDER_UNAVAILABLE", exitCode:70}` | Happy Path | Minor | Low | AC-6 |
| TC-MAP-005 | Exhaustive — all 13 kinds mapped (assertNeverMarkSyncError feedthrough) | Regression | Critical | High | AC-6 (NFR-3) |
| TC-MAP-006 | Mapped `message` is stable + redacted (no raw exception/path/body) | Negative | Critical | High | AC-1 (DEC-3) |
| TC-MAP-007 | `cli-error-map.ts` tier placement (app→domain; never cli→domain) | Corner Case | Critical | High | AC-8 (DEC-1/NFR-11) |
| TC-OUT-001 | `emit()` redacts → renders → writes stdout; returns exitCode | Happy Path | Critical | High | AC-1, AC-6 |
| TC-OUT-002 | `--json` → JSON to stdout | Happy Path | Critical | High | AC-2 |
| TC-OUT-003 | `--output=human` → human to stdout | Happy Path | Critical | High | AC-4 |
| TC-OUT-004 | `--output=ndjson` → NDJSON | Happy Path | Important | Medium | AC-2 |
| TC-OUT-005 | Error results written per documented stdout/stderr contract | Corner Case | Important | Medium | AC-2 |
| TC-OUT-006 | `emit()` latency ≤ 10 ms p95 (informational) | Performance | Minor | Low | NFR-8 |
| TC-CMD-001 | Each stub command returns a placeholder `CommandResult` | Happy Path | Critical | High | AC-2 |
| TC-CMD-002 | Global flags (`--json`/`--output`/`--color`/`--no-color`/`--quiet`) parsed | Happy Path | Critical | High | AC-2, AC-3 |
| TC-CMD-003 | Unknown command → USAGE error, exit 2 | Negative | Important | Medium | AC-6 |
| TC-CMD-004 | `init` rewired — returns `CommandResult` (GH-15 handler integrated) | Regression | Critical | High | AC-2 |
| TC-CMD-005 | Entrypoint: parse → route → execute → emit → `process.exit` | Happy Path | Critical | High | AC-6 |
| TC-C3-001 | New stub command added with ZERO diff to json/human/redact (C-3) | Corner Case | Critical | High | AC-5 |
| TC-CONTRACT-001 | Pinned JSON snapshot — success `CommandResult` (golden) | Regression | Critical | High | AC-2, AC-8 |
| TC-CONTRACT-002 | Pinned JSON snapshot — error `CommandResult` (golden) | Regression | Critical | High | AC-2, AC-8 |
| TC-INT-001 | Spawn stub `--json` → stdout valid JSON + redacted + correct exit | Integration | Critical | High | AC-1, AC-2 |
| TC-INT-002 | Spawn piped (`| cat`) → zero ANSI | Integration | Critical | High | AC-3 |
| TC-INT-003 | Spawn with CONFLICT error → process exits 30 | Integration | Critical | High | AC-6 |
| TC-BND-001 | `check:boundaries` clean — `src/cli/**` imports no domain/infra | Regression | Critical | High | AC-8 (NFR-11) |
| TC-BND-002 | `rg '@cliffy' src/app src/domain src/infra` → empty (TDR-0002) | Regression | Critical | High | AC-8 |
| TC-BND-003 | `cli-error-map.ts` imports only `#domain/*` (no cli/infra) | Regression | Critical | High | AC-8 (DEC-1) |
| TC-GATE-001 | `bun run check` (lint+typecheck+test+boundaries) exits 0 | Regression | Critical | High | AC-8 |

### 5.2 Scenario Details

#### TC-RED-001 - `Authorization: Bearer <tok>` redacted from JSON + human

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, DM-1, AC-F4-1, AC-1, NFR-1, INV-SEC-1, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/redact.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A `CommandResult` whose `data` (or `error.message`) contains
  `Authorization: Bearer ATATTAEg3...longtoken`.

**Steps**:
1. Run the `Redactor` over the serialized JSON and the human string.
2. Grep the redacted output for the raw token substring.

**Expected Outcome**:
- Zero matches for the raw token; the credential is replaced with a redaction
  sentinel (e.g. `[REDACTED:bearer]`). INV-SEC-1 holds on both output paths.

#### TC-RED-006 - 40-char hex Git SHA is NOT redacted (R1 guard)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-2, AC-1, NFR-2, RSK-1, R1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/redact.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A `CommandResult` whose `data` contains a legitimate 40-character lowercase
  hex Git SHA (e.g. `a1b2c3d4e5f6...` × 40).

**Steps**:
1. Run the `Redactor` over the serialized output.
2. Assert the SHA appears unmodified in the redacted output.

**Expected Outcome**:
- The SHA survives redaction (RSK-1 closure). Patterns are specific
  (`ATATT…`/`gho_…`/`Bearer …`/env-token >20 chars) and do not match hex.

#### TC-RED-007 - Token nested in `data` field → redacted after serialization (DEC-4)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, AC-1, NFR-1, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/redact.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A `CommandResult` whose `data.pageBody` embeds a `gho_…` token that is only
  exposed as a substring after `JSON.stringify`.

**Steps**:
1. Serialize the result to JSON.
2. Run the `Redactor` over the **serialized string** (DEC-4: redact output, not
   the typed object).
3. Grep for the token.

**Expected Outcome**:
- The nested token is caught because redaction operates on the serialized
  output, not the typed object. This is the DEC-4 invariant.

#### TC-CR-001 - Success envelope shape (data, no error)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, AC-F2-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/command-result.test.ts`

**Steps**:
1. Construct a success `CommandResult<T>` via the `ok()` factory.
2. Assert `schemaVersion === 1`, a non-empty `runId`, `exitCode === 0`, `data`
   present, and `error` absent.

**Expected Outcome**:
- The envelope matches DM-1; exactly one of `data`/`error` is the meaningful
  payload (here: `data`).

#### TC-JSON-003 - snake_case keys (`schema_version`,`run_id`,`exit_code`) — DEC-2

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, DM-1, AC-F2-1, AC-2, DEC-2, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/json.test.ts`

**Preconditions**:
- The TS type uses camelCase internally; the JSON renderer owns the conversion
  (DEC-2).

**Steps**:
1. `renderJson` a representative `CommandResult`.
2. Parse the JSON and assert keys are `schema_version`, `run_id`, `exit_code`
   (snake_case), not camelCase.

**Expected Outcome**:
- The wire format is snake_case (CEO Q1 / blueprint §9). The contract snapshot
  (TC-CONTRACT-001) pins this.

#### TC-JSON-002 - Stable key order (deterministic, snapshot-stable)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, AC-2, NFR-3, C-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/json.test.ts`

**Steps**:
1. `renderJson` the same `CommandResult` twice (and across two runs).
2. Assert byte-identical output (stable key order).

**Expected Outcome**:
- Deterministic serialization so the golden snapshot (C-4) is stable and PR
  diffs are reviewable.

#### TC-HUMAN-003 - Registered output is richer than fallback

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, AC-7, NFR-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/human.test.ts`

**Preconditions**:
- A command `doctor` with a registered human formatter producing a multi-section
  report; the same `CommandResult` rendered by the generic fallback.

**Steps**:
1. Render via the registered formatter.
2. Render the same result via the generic fallback.
3. Assert the registered output is longer / structured differently (richer).

**Expected Outcome**:
- Registered formatter output is richer than the generic key-value fallback
  (AC-F3-1); the registry is purely additive (C-3).

#### TC-HUMAN-005 - `--no-color --output=human` → no box-drawing, no ANSI (NFR-A11Y-2)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-6, F-7, AC-F6-2, AC-4, NFR-5, NFR-A11Y-2
**Test Type(s)**: Unit (and reinforced at integration via TC-INT-002)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/human.test.ts`

**Steps**:
1. Render a `CommandResult` in human format with color disabled.
2. Scan the output for ANSI escape codes and Unicode box-drawing characters
   (e.g. `─│┌┐└┘`).

**Expected Outcome**:
- Zero ANSI codes and zero box-drawing chars: plain-text readable by screen
  readers / plain-log pipelines (NFR-A11Y-2). Color/box-drawing may appear only
  when color is enabled.

#### TC-COLOR-006 - `--color` forces on even when piped

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F6-1, AC-3, NFR-4, NFR-A11Y-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/color.test.ts`

**Preconditions**:
- `process.stdout.isTTY === false` (piped) AND the `--color` flag is set.

**Steps**:
1. Resolve the color policy from the piped + `--color` signals.
2. Assert color is **enabled** (flag overrides non-interactive detection).

**Expected Outcome**:
- `--color` wins over the piped detection (ADR-0011 output-format-selection
  table). Companion: TC-COLOR-007 (`--no-color` wins over TTY).

#### TC-EXIT-001 - `error.code "CONFLICT"` → exit 30 (AC-6 load-bearing)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, F-9, DM-4, AC-F5-1, AC-6, NFR-7, NFR-OBS-1, DEC-1 (spec)
**Test Type(s)**: Unit (reinforced at integration via TC-INT-003)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/exit-codes.test.ts`

**Steps**:
1. Call `codeToExitCode("CONFLICT")`.
2. Assert it returns `30`.

**Expected Outcome**:
- The stable `error.code` string maps to the documented exit code. This is the
  AC-6 load-bearing mapping and is pinned by the kind→code→exit table (spec DEC-1).

#### TC-MAP-001 - `kind "Conflict"` → `{code:"CONFLICT", exitCode:30}`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-4, AC-F5-1, AC-6, DEC-1 (spec)
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/cli-error-map.test.ts`

**Steps**:
1. Call the app-tier mapper with a `MarkSyncError` of `kind: "Conflict"`.
2. Assert the result is `{ code: "CONFLICT", exitCode: 30 }` with a redacted
   message.

**Expected Outcome**:
- The domain kind is translated to the stable presentation-layer `error.code`
  and exit code in the **application tier** (DEC-1). The presentation tier never
  sees `MarkSyncError`.

#### TC-MAP-005 - Exhaustive — all 13 kinds mapped (assertNeverMarkSyncError feedthrough)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-6, DEC-1, NFR-3, RSK-2
**Test Type(s)**: Unit + typecheck gate
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/cli-error-map.test.ts`; gate = `bun run typecheck`

**Steps**:
1. Parametrize over every `MarkSyncError` kind (all 13 incl. `InvalidConfig`).
2. Assert each maps to a `{ code, exitCode }`.
3. Confirm the mapper's switch feeds `assertNeverMarkSyncError` so adding a future
   kind is a compile error (NFR-3).

**Expected Outcome**:
- The mapper is exhaustive; a new `MarkSyncError` kind cannot ship without
  updating the mapper (compile-time guarantee).

#### TC-MAP-007 - `cli-error-map.ts` tier placement (app→domain; never cli→domain)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-8, DEC-1, NFR-11, RSK-2, TDR-0006
**Test Type(s)**: Manual (boundary gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: gate = `bun run check:boundaries` (+ `rg`)

**Steps**:
1. Run `bun run check:boundaries`.
2. Run `rg '#domain/|@domain|src/domain' src/cli/` → assert empty.
3. Confirm `src/app/cli-error-map.ts` imports `#domain/*` (permitted) and no
   `#cli/*`/`#infra/*`.

**Expected Outcome**:
- dep-cruiser clean; the presentation tier never names `MarkSyncError` (DEC-1 /
  NFR-11). This is the RSK-2 closure.

#### TC-OUT-001 - `emit()` redacts → renders → writes stdout; returns exitCode

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, AC-F4-1, AC-1, AC-6, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/output/output-service.test.ts`

**Steps**:
1. Construct a `CommandResult` carrying a synthetic token in `data`.
2. Call `OutputService.emit(result, { format: "json" })` capturing stdout.
3. Grep captured stdout for the token; read the returned exit code.

**Expected Outcome**:
- The single chokepoint applies redaction (no token in output) and returns the
  mapped exit code. This proves the non-bypassable path (INV-SEC-1 enforced
  centrally).

#### TC-CMD-004 - `init` rewired — returns `CommandResult` (GH-15 handler integrated)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-8, AC-2, GH-15
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/cli/commands/init.test.ts`

**Preconditions**:
- The GH-15 `init.ts` handler is integrated into the Cliffy skeleton, not
  rewritten.

**Steps**:
1. Invoke the rewired `init` handler.
2. Assert it returns a `CommandResult` (success → exit 0 / data; refusal →
  error + exit code via the app-tier mapper).

**Expected Outcome**:
- The existing tier-correct handler flows through the new contract unchanged in
  behaviour; no domain type is named in `src/cli/`.

#### TC-C3-001 - New stub command added with ZERO diff to json/human/redact (C-3)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-3, F-4, AC-F7-1, AC-5, NFR-6, C-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli-add-command.test.ts`

**Steps**:
1. Snapshot the content of `json.ts`, `human.ts`, `redact.ts`.
2. Add a new stub command `ping` that returns a placeholder `CommandResult`
   inside the test.
3. Run it through the OutputService (JSON + human).
4. Assert the three central modules are byte-unchanged AND the new command
   produces valid JSON + human output.

**Expected Outcome**:
- Adding a command required zero changes to the central output modules
  (ADR-0011 C-3 / AC-F7-1). This is the "no central coupling" proof.

#### TC-CONTRACT-001 - Pinned JSON snapshot — success `CommandResult` (golden)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-10, AC-F2-1, AC-F10-1, AC-2, AC-8, C-4, NFR-3
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/cli-output.snapshot.test.ts` + `tests/golden/fixtures/command-result.success.json`

**Steps**:
1. Render a representative success `CommandResult` to JSON.
2. `toMatchSnapshot` against the pinned fixture (snake_case, stable key order).

**Expected Outcome**:
- The wire shape matches the pinned snapshot; any schema drift fails the test
  (C-4 schema stability). Companion: TC-CONTRACT-002 (error variant).

#### TC-INT-001 - Spawn stub `--json` → stdout valid JSON + redacted + correct exit

**Scenario Type**: Integration
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, F-9, AC-F4-1, AC-F2-1, AC-1, AC-2, INV-SEC-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli-output.test.ts`

**Preconditions**:
- A real process via `Bun.spawn` running the compiled/interpreted entrypoint
  with a stub command + `--json`, where the result carries a synthetic token.

**Steps**:
1. Spawn the process; capture stdout/stderr/exit code.
2. Parse stdout as JSON; grep stdout+stderr for the token.

**Expected Outcome**:
- Valid JSON on stdout; zero token matches across stdout+stderr; exit code
  matches the result. End-to-end proof that the chokepoint is non-bypassable in
  a real process (not a mock).

#### TC-INT-003 - Spawn with CONFLICT error → process exits 30

**Scenario Type**: Integration
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, F-9, AC-F5-1, AC-6, NFR-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli-output.test.ts`

**Steps**:
1. Spawn a stub command that returns `{ error: { code: "CONFLICT" } }`.
2. Assert the process exit code is `30`.

**Expected Outcome**:
- The stable exit-code contract holds end-to-end through `process.exit`
  (NFR-OBS-1).

#### TC-BND-002 - `rg '@cliffy' src/app src/domain src/infra` → empty (TDR-0002)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-8, AC-8, TDR-0002 mitigation 4, NFR-11
**Test Type(s)**: Manual (boundary/lint gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: gate = `rg '@cliffy' src/app src/domain src/infra`

**Steps**:
1. Run `rg '@cliffy' src/app src/domain src/infra`.
2. Assert zero matches.

**Expected Outcome**:
- Cliffy is confined to `src/cli/` (presentation tier). This is the TDR-0002
  presentation-boundary isolation metric; it may be wired as a dep-cruiser rule
  or a CI grep — confirm at delivery and reference, not duplicate, if already
  enforced.

#### TC-GATE-001 - `bun run check` (lint+typecheck+test+boundaries) exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1..F-10, AC-F10-1, AC-8, NFR-9, NFR-11
**Test Type(s)**: Manual (quality gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: gate = `bun run check`

**Steps**:
1. Run `bun run check` (= lint + format:check + typecheck + test +
   check:boundaries).
2. Assert exit 0.

**Expected Outcome**:
- All gates green: Biome lint/format, `tsc --noEmit` strict, all tests pass,
  dep-cruiser boundaries clean. This is the AC-8 gate.

## 6. Environments and Test Data

- **Environment:** local-dev (`bun:test` in-process). No Confluence sandbox, no
  network. All unit/integration/golden tests are deterministic and hermetic.
- **Runner:** `bun:test` (TDR-0004). Test root `tests/` per `bunfig.toml`.
- **Fixtures:**
  - Synthetic token strings (inline): `Authorization: Bearer
    ATATTAEg3...longtoken`, `gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789`,
    `ATATTAEg3IM1long...` (>20 chars), an email `ops@example.com`, a
    `MARKSYNC_API_TOKEN` env-style value.
  - A 40-char hex Git SHA (inline) for TC-RED-006.
  - Golden fixtures: `tests/golden/fixtures/command-result.success.json`,
    `command-result.error.json`.
- **Integration harness:** `Bun.spawn` of the entrypoint; captures real
  `stdout`/`stderr`/exit code. No HTTP mock (no Confluence calls in stubs).
- **Color/TTY test isolation:** the color-policy tests stub only the boundary
  signals (`process.stdout.isTTY`, `process.env.NO_COLOR`/`CI`/`TERM`) and
  restore them after each case. This is the only permitted mock surface
  (boundary-signal injection, not domain-logic mocking — per the over-mocking
  guardrail).
- **Isolation:** the OutputService tests capture stdout via a writable buffer
  (or `Bun.spawn` capture); no cross-test shared state. The redaction tests
  never write a real secret to disk.
- **Dependency hygiene (manual / CI gate):** at delivery, confirm
  `@cliffy/command`, `@cliffy/flags`, and `picocolors` are on the allowed list
  (typescript.md), `picocolors` transitive deps are minimal, and the
  license-audit rejects copyleft. The TDR-0002 `bun build --compile` smoke gate
  (clean-OS `--help`) is a plan Phase 1 prerequisite, not a test-plan scenario.

## 7. Entry / Exit Criteria

- **Entry (for delivery):** all three artifacts (spec, plan, this test plan)
  pass the DoR gate (`@readiness-reviewer`); dependencies GH-14/GH-15 merged.
- **Exit (Definition of Done for the test surface):**
  - Every AC-1..AC-8 has ≥1 passing traceable TC (see §3.1 — all Covered).
  - `bun run check` exits 0 (TC-GATE-001).
  - The pinned contract snapshot is committed and green (TC-CONTRACT-001/002).
  - `check:boundaries` clean and `rg '@cliffy' src/app src/domain src/infra`
    empty (TC-BND-001/002).
  - INV-SEC-1 proven on real captured output (TC-RED-*, TC-INT-001), not mocks.

## 8. Risks to the Test Plan Itself

| Risk | Mitigation |
|------|------------|
| Color/TTY signal stubbing flakiness across Bun versions | Confine stubs to the documented boundary-signal surface; restore env after each test; run the piped assertion again at integration (TC-INT-002) against a real pipe. |
| Snapshot brittleness if `run_id`/timestamps are non-deterministic | The snapshot uses a fixed `run_id`/`timing` in the fixture (or the renderer accepts a deterministic clock in tests); pin Bun version per testing-strategy. |
| Over-mocking creep (asserting "redact was called" instead of checking output) | INV-SEC-1 tests grep the **captured output** for the token, never a mock call (over-mocking guardrail). |
