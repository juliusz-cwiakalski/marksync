---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.cwiakalski-pub-gh/marksync-for-confluence | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-16-cli-framework
status: Proposed
created: 2026-07-08T14:37:17Z
last_updated: 2026-07-08T19:45:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E2, foundation, critical, observability, security, a11y]
links:
  change_spec: ./chg-GH-16-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S3--cli-framework.md
  adr_0011_output_strategy: ../../../decisions/ADR-0011-cli-output-strategy.md
  tdr_0002_cli_framework: ../../../decisions/TDR-0002-cli-framework.md
  typescript_rules: ../../../.ai/rules/typescript.md
  architecture: ../../../overview/architecture-overview.md
  nonfunctional: ../../../spec/nonfunctional.md
  gh15_plan_precedent: ../2026-07-07--GH-15--config-system/chg-GH-15-plan.md
summary: >
  Stand up the Cliffy CLI framework with ADR-0011's hybrid output strategy so
  every command (`init`, `plan`, `sync`, `doctor`, `repair-state`) returns a
  structured `CommandResult<T>`; a generic JSON renderer + generic human
  renderer (with an optional per-command human formatter registry) render it; a
  centralized redaction layer scrubs every output path (INV-SEC-1); stable exit
  codes map per error class (NFR-OBS-1); and non-interactive color auto-detect
  degrades gracefully in CI/scripts (NFR-A11Y-1/2). This story builds the
  pipeline ONCE so later stories only produce a `CommandResult<T>`.
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-16: [MS2-E2-S3] CLI framework + CommandResult<T>

## Context and Goals

This plan delivers the **output + CLI backbone of MS-0002** (epic MS2-E2 —
Foundation, third story). It is the contract every later command — `plan`,
`sync`, `doctor`, `repair-state` — will consume. Concretely it establishes:

- the **`CommandResult<T>`** envelope — `{ schemaVersion:1; runId; exitCode;
  timing?; data?:T; error?:{code;message;retryable}; warnings?[] }` — the single
  structured value every command returns (ADR-0011 Alternative 3 / C-4);
- a **generic JSON renderer** (`renderJson` stable-key-order + `renderNdjson`)
  that serializes any `CommandResult<T>` with zero per-command code (C-1);
- a **generic human renderer** with key-value/table fallback PLUS a
  `registerHumanFormatter<T>(command, fn)` registry for optional per-command
  rich formatting (C-3);
- the **centralized redaction layer** — a `Redactor` with configurable patterns
  applied to ALL output before write, so no command can bypass it (C-5 /
  INV-SEC-1 / NFR-SEC-2);
- **stable exit codes** per error class (`0/2/10/20/30/40/50/70/99`) and the
  `MarkSyncError.kind → error.code → exitCode` translation (NFR-OBS-1);
- the **color policy** via `picocolors` with non-interactive auto-detect and
  `--color`/`--no-color` overrides (NFR-A11Y-1/2);
- the **`OutputService.emit()`** chokepoint: redact → render → write → return
  exit code (the single point all output crosses);
- the **Cliffy command skeleton** with global flags + stub handlers for
  `init`/`plan`/`sync`/`doctor`/`repair-state`, rewiring the existing GH-15
  `init` handler into the new `CommandResult` contract; and the real
  `src/cli/index.ts` entrypoint (parse → route → execute → emit → exit).

The plan is derived entirely from the authoritative story
`MS2-E2-S3--cli-framework.md` (10 deliverables, 8 ACs) and the two governing
decisions — **ADR-0011** (hybrid output strategy, implementation-plan §1–8) and
**TDR-0002** (Cliffy, implementation-plan §1–7 incl. pin-after-smoke,
presentation boundary, completions, compile gate). It invents no requirements.

> **Scope-source note.** The change spec `chg-GH-16-spec.md` (same folder) is
> the **contract authority**; this plan operationalizes it. The `CommandResult<T>`
> envelope, ACs, DECs, and module residence are defined in the spec and must not
> drift — where this plan gives field-level detail (e.g. Phase 2.1), the spec's
> §5/§8/§15 definitions are authoritative on any conflict (DoR iter-1 reconciled
> the `warnings`/`timing.duration_ms` shape and DEC numbering to the spec).

### Binding decisions

> **DEC numbering — cross-reference to the spec.** The spec's DEC log
> (`chg-GH-16-spec.md` §15) is authoritative. This plan's binding decisions use
> the labels below; the spec is the source of truth on any conflict:
>
> | This plan's label | Subject | Spec DEC (authoritative) |
> |---|---|---|
> | DEC-1 | Exit-code mapping tier placement | DEC-1 |
> | DEC-2 | `kind → error.code → exitCode` mapping table | DEC-1 (the translation approach) |
> | DEC-3 | `picocolors` (not chalk) | DEC-5 |
> | DEC-4 | snake_case JSON + schema stability | DEC-2 |
> | DEC-5 | Error representation `{code,message,retryable}` | DEC-3 |
> | DEC-6 | Cliffy pin deferred to post-smoke; confined to `src/cli/` | DEC-5 |

- **DEC-1 — Exit-code mapping tier placement (the CRITICAL architecture
  constraint; resolves the story's `src/cli/output/exit-codes.ts` "Map
  `MarkSyncError.kind → exitCode`" hint vs the dep-cruiser invariant).**
  `.dependency-cruiser.cjs` enforces `presentation-may-not-import-domain` and
  `presentation-may-not-import-infra` (severity `error`); `MarkSyncError` lives
  in `src/domain/errors.ts`. Per the GH-15 `init.ts` precedent (which flows the
  `Result` type in structurally "without naming any domain type"), the split is:
  - **`MarkSyncError.kind → { error.code, message, retryable }` translation
    lives in the APPLICATION tier** at `src/app/cli-error-map.ts` (app may import
    domain — architecture matrix row: application → domain ✓). This module knows
    the stable `error.code` strings and the redacted `message`; it does NOT
    compute the numeric `exitCode`.
  - **`src/cli/output/exit-codes.ts`** holds ONLY the numeric exit-code
    CONSTANTS + a `codeToExitCode(code: string): number` map keyed by the STABLE
    STRING `error.code`. It imports **no** tier (no `#domain/*`, no `#infra/*`);
    it is pure data.
  - **`src/cli/` never imports `#domain/*` or `#infra/*`.** The numeric
    `exitCode` is attached to the top-level `CommandResult.exitCode` at the
    presentation boundary via `codeToExitCode(resultError.code)`.
  - _Alternative considered & rejected:_ placing the numeric constants in
    `src/shared/` so non-cli consumers could read them. Rejected because exit
    codes are inherently a process-boundary concept — only the CLI entrypoint
    calls `process.exit` — and the output service (presentation tier,
    `architecture-overview.md` row 87) owns exit-code rendering. `src/shared/`
    stays pure utilities (string/path logic).
- **DEC-2 — Full `MarkSyncError.kind → error.code → exitCode` mapping table
  (plan-level commitment, traceable to NFR-OBS-1).** The only load-bearing
  mapping (asserted by an AC) is **`Conflict → CONFLICT → 30`**. The remainder
  is the MS-0002 default the plan commits to; entries marked `*` are best-fit
  (no dedicated exit code exists in the story's `0/2/10/20/30/40/50/70/99` set)
  and the maintainer may reclassify them at delivery without breaking any AC:

  | `MarkSyncError.kind` | `error.code` (stable) | exit | class |
  |---|---|---|---|
  | `Conflict` | `CONFLICT` | 30 | conflict/drift _(AC-load-bearing)_ |
  | `RemoteMissing` | `REMOTE_MISSING` | 40 | remote-missing |
  | `DuplicateUuid` | `DUPLICATE_UUID` | 50 | invariant (INV-SAFE-3) |
  | `UnsupportedConstruct` | `UNSUPPORTED_CONSTRUCT` | 99 `*` | other/uncategorized |
  | `Forbidden` | `FORBIDDEN` | 20 | auth |
  | `LockDirty` | `LOCK_DIRTY` | 30 | conflict/drift |
  | `ConcurrentWrite` | `CONCURRENT_WRITE` | 30 | conflict (retryable) |
  | `RenderUnavailable` | `RENDER_UNAVAILABLE` | 70 | render-unavailable |
  | `StalePlan` | `STALE_PLAN` | 30 | conflict/drift |
  | `ForbiddenBranch` | `FORBIDDEN_BRANCH` | 2 `*` | usage (branch-policy guard) |
  | `TooLarge` | `TOO_LARGE` | 99 `*` | other/uncategorized |
  | `UnresolvedLink` | `UNRESOLVED_LINK` | 99 `*` | other/uncategorized |
  | `InvalidConfig` | `INVALID_CONFIG` | 10 | config |
  | _(no domain kind — flag/arg parse failure)_ | `USAGE` | 2 | usage |
  | _(no domain kind — unexpected throw)_ | `INTERNAL` | 99 | internal |

  The `*` entries are candidates for dedicated exit codes in a future story;
  the application tier keeps them in the catch-all class for MS-0002 so the
  `never`-switch over `MarkSyncError.kind` stays exhaustive (no kind is left
  unmapped).
- **DEC-3 — `picocolors` for color (not `chalk`).** Already a `typescript.md`
  rule; committed as binding here per ADR-0011 C-2. The output service handles
  coloring centrally so command code never imports a color lib directly.
- **DEC-4 — JSON casing + schema stability.** JSON output is **snake_case**
  (blueprint §9 Q1, CEO-resolved) and carries `schemaVersion` (constant for
  contract stability — ADR-0011 C-4). `renderJson` produces stable key order so
  the contract snapshot is deterministic.
- **DEC-5 — Error representation in JSON.** A top-level
  `error:{ code, message, retryable }` where `message` is a stable, redacted,
  human-readable string (never raw exception text, file paths, or partial
  request bodies); the non-zero exit code and `error.code` correspond
  (ADR-0011 2026-07-05 guidance; NFR-SEC-1/NFR-SEC-2).
- **DEC-6 — Cliffy pin deferred to post-smoke.** `@cliffy/command` +
  `@cliffy/flags` are added in Phase 1 but the exact version is locked only
  after the `bun build --compile` smoke + `--help` render pass (TDR-0002
  mitigation 1–2 / C-1 gate). Cliffy is confined to `src/cli/` (presentation
  boundary — TDR-0002 mitigation 4); `rg '@cliffy' src/app src/domain src/infra`
  must return zero matches.

### Critical ordering constraint

Per DEC-1 and the dep-cruiser invariant, the **application-tier mapper**
(`src/app/cli-error-map.ts`, deliverable bridging domain→presentation) **must
land before (or alongside)** any CLI handler that translates a `MarkSyncError`
into a `CommandResult` (the init rewire). This is directly analogous to GH-15
phasing the `InvalidConfig` union extension (Phase 2) before the loader (Phase
4) so the typed channel is consistent from the first consumer commit. Here:
**Phase 5 (app mapper) precedes Phase 6 (Cliffy stubs + init rewire).** We never
merge a CLI handler that imports a not-yet-existent app mapper.

### Open questions

- **Version impact (no `version_impact` field in the story).** Defaulting to
  `minor` per the GH-15 precedent (which bumped `0.0.0 → 0.1.0` for an
  equivalently additive foundation story) and the additive nature of the CLI +
  output pipeline. The final phase applies `0.1.0 → 0.2.0`; confirm with the
  maintainer if the 0.x minor-vs-patch convention differs.
  *(Specification detail — no `@decision-advisor` escalation unless the
  maintainer disagrees.)*
- **Exact Cliffy version lock (TDR-0002 unresolved Q).** Pin the latest
  verified stable 1.x after the Phase 1 `bun build --compile` smoke test; decide
  follow-policy (patch-only vs minor) for Renovate/Dependabot. Resolved at
  delivery in Phase 1.
- **Ambiguous exit-code mappings (DEC-2 `*` entries).** `UnsupportedConstruct`,
  `ForbiddenBranch`, `TooLarge`, `UnresolvedLink` have no dedicated code in the
  story's set; the plan commits a best-fit default and flags them for
  maintainer reclassification. *(Specification detail.)*
- **`CommandResult<T>` expressiveness for complex commands** (ADR-0011 negative
  outcome). The envelope must carry plan-diffs / health-tables in later stories;
  `T` is left generic here and concretized per command. No escalation — by
  design (ADR-0011 Alternative 3).

## Scope

### In Scope

- **D-1** — `src/cli/output/command-result.ts`: `CommandResult<T>` type +
  `schemaVersion` constant; JSON uses snake_case (DEC-4).
- **D-2** — `src/cli/output/json.ts`: `renderJson` (stable key order) +
  `renderNdjson`.
- **D-3** — `src/cli/output/human.ts`: generic key-value/table fallback +
  `registerHumanFormatter<T>(command, fn)` registry.
- **D-4** — `src/cli/output/redact.ts`: `Redactor` with configurable patterns
  (Authorization, Bearer, `gho_`/`ATATT`/API-token shapes, emails,
  `MARKSYNC_*_TOKEN` values >20 chars); applied to ALL output before write.
- **D-5** — `src/cli/output/exit-codes.ts`: numeric exit-code constants +
  `codeToExitCode(code)` map keyed by stable string (DEC-1 — NO domain import).
- **D-6** — `src/cli/output/color.ts`: picocolors policy; non-interactive
  detect; `--color`/`--no-color` overrides.
- **D-7** — `src/cli/output/index.ts`: `OutputService.emit()` chokepoint
  (redact → render → write → return exitCode).
- **D-8** — Cliffy wiring `src/cli/commands/`: global flags
  (`--json`/`--output`/`--color`/`--no-color`/`--quiet`) + stub handlers
  (`init`/`plan`/`sync`/`doctor`/`repair-state`) returning placeholder
  `CommandResult`.
- **D-9** — `src/cli/index.ts`: real entrypoint (parse → route → execute →
  emit → `process.exit`).
- **D-10** — contract test (pinned JSON snapshot) + unit/integration/golden
  tests per the test matrix.
- **App-tier mapper** — `src/app/cli-error-map.ts`: `MarkSyncError.kind →
  { code, message, retryable }` (DEC-1 — the bridge that keeps dep-cruiser
  green).

### Out of Scope

- Real command logic for `plan`/`sync`/`doctor`/`repair` (later stories — these
  stubs return placeholder `CommandResult`s).
- NDJSON streaming for `sync --watch` (watch mode is post-MS-0002); the renderer
  is wired but no watch command exists.
- Per-command human formatters for every command (each lands with its command);
  only the registry + one demonstration formatter ship here.
- `@cliffy/prompt` interactive flows for `init`/`doctor` (MS-0003 / NG-5);
  Phase 1 adds `@cliffy/command` + `@cliffy/flags` only.
- Logging (pino) redaction wiring — the `Redactor` is reusable by logging in a
  later story but pino itself is not added here.
- Full system-spec reconciliation (`feature-cli.md` output section, ADR-0011
  unresolved-Q closure, `tech-stack.md` Cliffy pin) — flagged for lifecycle
  phase 7 (`@doc-syncer`); Phase 8 does only trivial inline touch-ups.

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, `architecture-overview.md` rows
  199–202, enforced by `.dependency-cruiser.cjs`, severity `error`):
  - `src/cli/` (presentation) may import `app` ONLY — **NOT** `domain` and
    **NOT** `infra` (`presentation-may-not-import-domain` / `-infra`).
  - `src/app/` (application) may import `domain` (+ infra via ports); not `cli`.
  - `src/domain/` imports nothing tiered.
  - `src/shared/` holds pure utilities with zero tier dependencies.
  - **The load-bearing consequence (DEC-1):** `MarkSyncError → code/exitCode`
    translation lives in `src/app/`; `src/cli/output/exit-codes.ts` is pure data
    keyed by stable string.
- **Cliffy presentation boundary (TDR-0002 mitigation 4):** all `@cliffy`
  imports confined to `src/cli/`; `rg '@cliffy' src/app src/domain src/infra` →
  zero matches.
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitAny`):
  type-only imports use `import type`; `array[i]` is `T | undefined`.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`,
  `#app/*`, `#infra/*`, `#shared/*`) — no tsconfig `paths`.
- **Redaction by construction (NFR-SEC-2):** every output path crosses the
  `Redactor`; no raw secret may reach stdout/stderr.
- **Stable contract (NFR-OBS-2):** `schemaVersion` constant + stable JSON key
  order + pinned snapshot test.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0.
- **Conventional Commits** (commitlint + husky); each phase = one logical
  commit; `bun run check:boundaries` green at every commit.
- **Compile gate (TDR-0002 C-1):** Phase 1 `bun build --compile` smoke + binary
  `--help` render must pass before the Cliffy version is locked.
- **Version:** currently `0.1.0` (GH-15); final phase applies the
  `version_impact: minor` bump → `0.2.0`.

### Risks

- **RSK-1 — Over-redaction** (a legit sha matches a token pattern). Mitigated by
  specific patterns (`ATATT…`, `gho_…`, `Bearer …`, `MARKSYNC_*_TOKEN` env
  value length >20) and a unit test asserting a 40-char hex sha is **NOT**
  redacted (story R1, CEO-recorded). Phase 3.
- **RSK-2 — dep-cruiser violation** from placing the `MarkSyncError` mapping in
  `src/cli/`. Mitigated by DEC-1 (mapper in `src/app/`; `exit-codes.ts` pure
  data) + the Phase 5-before-6 ordering. `check:boundaries` runs every phase.
- **RSK-3 — Cliffy `bun build --compile` failure** (smaller ecosystem). Mitigated
  by the Phase 1 smoke gate before version lock (TDR-0002 C-1 🟡); fallback
  watchlist (Crust/Bunli/Clerc; commander + prompt lib + completion glue) behind
  the same presentation boundary.
- **RSK-4 — Contract snapshot drift / unstable JSON key order.** Mitigated by
  `renderJson` stable-key-order serialization + a pinned snapshot contract test
  (ADR-0011 C-4). Phases 4 & 7.
- **RSK-5 — Non-interactive detection wrong across environments.** Mitigated by
  a unit-test matrix mocking `isTTY`/`CI`/`NO_COLOR`/`TERM` (NFR-A11Y-1) +
  integration assertions via `Bun.spawn` piping. Phases 2 & 7.
- **RSK-6 — Box-drawing / ANSI leaks into plain-log mode.** Mitigated by an
  NFR-A11Y-2 test asserting `--no-color --output=human` produces plain text (no
  box-drawing chars, no ANSI). Phases 4 & 7.
- **RSK-7 — Contract surface too narrow for future commands** (ADR-0011 negative
  outcome). Mitigated by leaving `CommandResult<T>` generic (`T` concretized per
  command); accepted by design.

### Success Metrics

- A `CommandResult` carrying a synthetic token in any field → emitted JSON/human
  output contains **NO** token (INV-SEC-1; redaction verified by grep on captured
  stdout) — AC-1.
- Every stub command produces valid JSON with `--json` (parseable; matches the
  pinned snapshot) — AC-2.
- Piped output (`... | cat`) contains zero ANSI; `--color` forces; `--no-color`
  disables (NFR-A11Y-1) — AC-3.
- `--no-color --output=human` produces plain-text output (no box-drawing, no
  ANSI) readable by screen readers / plain-log pipelines (NFR-A11Y-2) — AC-4.
- Adding a new stub command requires **ZERO** changes to `json.ts`/`human.ts`/
  `redact.ts` (ADR-0011 C-3) — AC-5.
- `error.code: "CONFLICT"` → process exits `30` (NFR-OBS-1) — AC-6.
- `registerHumanFormatter` produces richer output than the generic fallback for a
  registered command; unregistered commands use the fallback — AC-7.
- `bun run check` exits 0; the contract test is green — AC-8.

## Phases

> Each phase is one logical Conventional Commit and is independently verifiable
> by the listed command(s). Files are listed as `path (new | updated)`. Tier
> placements respect the dependency-direction matrix (see Constraints) and the
> DEC-1 mapper split. `bun run check:boundaries` is run in **every** phase so
> the dep-cruiser invariant holds at every commit.

---

### Phase 1: Runtime dependencies, compile-smoke gate, and scaffolding

**Goal**: Add the three runtime dependencies this story requires
(`@cliffy/command`, `@cliffy/flags`, `picocolors`), pass the TDR-0002 C-1
`bun build --compile` + `--help` smoke gate before locking versions, and prove
dependency hygiene (license + transitive-dep thresholds + unchanged tier
boundaries) before any output code lands.

**Tasks**:

- [ ] **1.1** Add `@cliffy/command` and `@cliffy/flags` to `package.json`
      `dependencies` at the latest verified stable 1.x (TDR-0002 — both are on
      the allowed-dependency list in `typescript.md`); run `bun install` and
      commit the updated lockfile. Record the pinned versions in the commit body.
- [ ] **1.2** Add `picocolors` to `package.json` `dependencies` (typescript.md
      allowed list; the chosen coloring lib per ADR-0011 C-2 / DEC-3); commit
      lockfile.
- [ ] **1.3** **Compile-smoke gate (TDR-0002 C-1 — the load-bearing check):**
      run `bun build --compile src/cli/index.ts --outfile marksync-smoke` against
      a minimal Cliffy `--help` harness, execute the resulting binary on the
      host OS, and assert it renders `marksync --help` with **zero compile
      warnings attributed to Cliffy**. Only after this passes is the version
      lock (1.1/1.2) final; if it fails, escalate to the TDR-0002 fallback
      watchlist (`@decision-advisor`) before proceeding. Record the smoke result
      in the commit body and in `chg-GH-16-pm-notes.yaml`.
- [ ] **1.4** Verify transitive-dependency thresholds: each new dep ≤ 20
      transitive deps (`bunx license-checker --summary` or `bunx npm ls <pkg>`).
      `picocolors` is zero-dependency; Cliffy modular packages should be
      near-zero. Record counts in the commit body.
- [ ] **1.5** Verify license hygiene — reject GPL/AGPL/LGPL/UNLICENSED; MIT/ISC/
      Apache-2.0/BSD acceptable (NFR-SEC-4).
- [ ] **1.6** Confirm the quality-gate baseline still passes after the dep
      additions: `bun run typecheck`, `bun run check:boundaries`
      (`rg '@cliffy' src/app src/domain src/infra` → zero matches; TDR-0002
      presentation-boundary metric), `bun run format:check`.

**Acceptance Criteria**:

- Must: `@cliffy/command`, `@cliffy/flags`, `picocolors` resolvable at runtime;
      `bun install` clean.
- Must: the compiled binary renders `--help` with zero Cliffy-attributed compile
      warnings (TDR-0002 C-1 gate — versions locked only after this passes).
- Must: no new dependency exceeds the transitive-dep threshold; no forbidden
      license.
- Must: `bun run check:boundaries` exits 0; no `@cliffy` import outside
      `src/cli/`.
- Should: the smoke harness is retained (or scripted under `scripts/`) so the
      compile gate can run in CI.

**Files and modules**:

- Code areas: `package.json` (updated), `bun.lock` (updated); optional
  `scripts/cliffy-compile-smoke.sh` (new — retains the gate).
- System docs: none (the `tech-stack.md` Cliffy provisional entry → pinned is
  reconciled by `@doc-syncer` in lifecycle phase 7; flagged in Phase 8).

**Tests**:

- Manual + scripted: `bun build --compile` + binary `--help` (TDR-0002 C-1).
- `bun run typecheck`; `bun run check:boundaries`.
- License/transitive audit (`bunx license-checker`).

**Completion signal**: `feat(cli): add cliffy and picocolors dependencies`

---

### Phase 2: CommandResult<T> type, exit-code constants, and color policy (foundational, no domain deps)

**Goal**: Land the three foundational output primitives that depend on no tier
(no `#domain/*`, no `#infra/*`): the `CommandResult<T>` envelope + `schemaVersion`
constant (D-1), the numeric exit-code constants + `codeToExitCode(code)` map
(D-5, DEC-1), and the picocolors color policy with non-interactive auto-detect
(D-6). These are consumed by every later phase.

**Tasks**:

- [x] **2.1** Create `src/cli/output/command-result.ts` (D-1) — DONE (Phase 2).
      - `CommandResult<T>` interface:
        `{ schemaVersion: typeof SCHEMA_VERSION; runId: string; exitCode: number;
        timing?: { startedAt: string; durationMs: number }; data?: T;
        error?: { code: string; message: string; retryable: boolean };
        warnings?: Array<{ code: string; message: string }> }`.
      - `export const SCHEMA_VERSION = 1 as const;` (ADR-0011 C-4 — contract
        stability).
      - A small factory `ok<T>(data: T, meta): CommandResult<T>` and
        `err(code, message, meta): CommandResult<never>` (ergonomics; the
        exitCode is filled by the caller via `codeToExitCode`, keeping this
        module tier-pure).
      - Document the snake_case JSON contract (DEC-4) and the `error` shape
        (DEC-5) in a leading comment citing ADR-0011.
- [x] **2.2** Create `src/cli/output/exit-codes.ts` (D-5 / DEC-1) — DONE (Phase 2).
      - Named numeric constants: `EXIT_OK=0`, `EXIT_USAGE=2`, `EXIT_CONFIG=10`,
        `EXIT_AUTH=20`, `EXIT_CONFLICT=30`, `EXIT_REMOTE_MISSING=40`,
        `EXIT_INVARIANT=50`, `EXIT_RENDER_UNAVAILABLE=70`, `EXIT_INTERNAL=99`.
      - A `Record<string, number>` mapping the stable `error.code` strings of
        DEC-2 → the constants (e.g. `"CONFLICT" → 30`, `"INVALID_CONFIG" → 10`,
        `"REMOTE_MISSING" → 40`, `"RENDER_UNAVAILABLE" → 70`, `"USAGE" → 2`,
        `"INTERNAL" → 99`, …) and `codeToExitCode(code: string): number`
        (unknown codes → `EXIT_INTERNAL` with a documented fallback).
      - **Zero tier imports** — pure data. A leading comment cites DEC-1 /
        DEC-2 and the GH-15 `init.ts` structural-type precedent.
- [x] **2.3** Create `src/cli/output/color.ts` (D-6) — DONE (Phase 2).
      - `resolveColorPolicy(opts: { color?: boolean; noColor?: boolean }): {
        enabled: boolean }` honoring `--color`/`--no-color` overrides, else
        non-interactive detect: `!process.stdout.isTTY || !!process.env.CI ||
        !!process.env.NO_COLOR || process.env.TERM === "dumb"` (ADR-0011 C-2 /
        NFR-A11Y-1).
      - A thin `picocolors` wrapper whose color methods are no-ops when
        `enabled === false` (so human renderers call color unconditionally and
        the policy decides whether codes emit).
- [x] **2.4** Create `tests/unit/cli/output/exit-codes.test.ts` — DONE (Phase 2). Asserts
      `codeToExitCode("CONFLICT") === 30` (AC-6), every DEC-2 row (via `toEqual(EXPECTED)` +
      per-row cases incl. drift-class → 30), and the unknown-code → `EXIT_INTERNAL` fallback.
- [x] **2.5** Create `tests/unit/cli/output/color.test.ts` — DONE (Phase 2). Full matrix over
      stubbed `isTTY`/`CI`/`NO_COLOR`/`TERM`: TTY→on, piped→off, NO_COLOR/CI/TERM=dumb→off,
      `--color` forces on (even piped+CI), `--no-color` forces off (even TTY). Boundary
      signals stubbed + restored each test (RSK-5 / AC-3).
- [x] **2.6** Create `tests/unit/cli/output/command-result.test.ts` — DONE (Phase 2). Asserts
      `ok`/`err` envelopes: `schemaVersion=1`, `ok` exit 0 + `data`, `err` exit derived via
      `codeToExitCode` (CONFLICT→30), optional `timing`/`warnings` (exactOptionalPropertyTypes-safe),
      `runId` honoring `meta.runId` vs generated (TS-8).

**Acceptance Criteria**:

- Must: `codeToExitCode("CONFLICT") === 30` (AC-6 / NFR-OBS-1).
  — **PASSED** (`exit-codes.test.ts`: dedicated case + via `EXPECTED` table; tests PASS).
- Must: `exit-codes.ts` imports no `#domain/*` / `#infra/*`
      (`check:boundaries` clean; DEC-1).
  — **PASSED** (`exit-codes.ts` is zero-import pure data; `depcruise src` → "no
  dependency violations found (20 modules, 15 dependencies cruised)").
- Must: color policy disables on every non-interactive signal and honors both
      overrides (AC-3 / NFR-A11Y-1).
  — **PASSED** (`color.test.ts` matrix: TTY→on, piped/NO_COLOR/CI/TERM=dumb→off,
  `--color` forces on even piped+CI, `--no-color` forces off even TTY; tests PASS).
- Must: `CommandResult<T>` shape compiles under strict mode and carries
      `schemaVersion=1`.
  — **PASSED** (`bun run typecheck` exit 0 under strict+exactOptionalPropertyTypes;
  `SCHEMA_VERSION === 1` asserted; `command-result.test.ts` PASS).

**Phase 2 verification** — `bun run format && bun run lint` (Biome clean),
`bun run typecheck` (tsc strict — clean), `bun test tests/unit/cli/output/`
(54 pass / 0 fail, 100% coverage on the 3 new src modules), `bun run check:boundaries`
(green). Full repo suite `bun test` = 171 pass / 0 fail (117 prior + 54 new).

**Files and modules**:

- Code areas: `src/cli/output/command-result.ts` (new),
  `src/cli/output/exit-codes.ts` (new), `src/cli/output/color.ts` (new).
- System docs: none (the output contract is reconciled into
  `doc/spec/features/feature-cli.md` in lifecycle phase 7).

**Tests**:

- `bun test tests/unit/cli/output/{exit-codes,color,command-result}.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(cli): add CommandResult, exit codes, and color policy`

---

### Phase 3: Centralized redaction layer

**Goal**: Deliver D-4 — the `Redactor` that scrubs every output path before
write (INV-SEC-1 / NFR-SEC-2). Patterns are data, not secret values; the layer
is applied centrally by `OutputService` (Phase 4) so no command can bypass it
(ADR-0011 C-5).

**Tasks**:

- [x] **3.1** Create `src/cli/output/redact.ts` (D-4) — DONE (Phase 3, `697610f`).
      A configurable `Redactor` class + `DEFAULT_PATTERNS` + `DEFAULT_REDACTOR` +
      `redactString`/`createRedactor` convenience. Built-in patterns cover
      `Authorization: <scheme> <token>`, standalone `Bearer`/`Basic <token>`,
      GitHub `gh[o p s u r]_` tokens, Atlassian `ATATT`/`ATSTS` tokens,
      `MARKSYNC_*_TOKEN=<value>` (value strictly > 20 chars), and emails; each
      match → `[REDACTED:<kind>]`.
      **DEC-4 (authoritative — spec §15 / TC-RED-007):** redaction runs on the
      SERIALIZED output string (`redactString`) — NOT the typed object — so a
      token nested inside `data` is caught post-`JSON.stringify` (TC-RED-007).
      **Deviation (justified, see also Phase 4.3):** the plan Task 3.1 mentioned a
      `redactJson(value)` deep-walker; it is INTENTIONALLY OMITTED. A deep-walk
      over the typed object would MISS substrings that only appear
      post-serialization — exactly the leak DEC-4 exists to prevent. The DEC-4-
      correct approach is implemented at the OutputService chokepoint (Phase 4):
      it renders first (`renderJson` — single snake_case/stable-order path) then
      runs `redactString` on the rendered string. A separate `redactJson` doing
      its own `JSON.stringify` would create a second, non-snake_case serialization
      path and is therefore rejected. Value char classes exclude `"`/whitespace so
      JSON structural quotes are never consumed.
- [x] **3.2** Implement the **hex-sha guard** (story R1 / RSK-1) — DONE.
      Structural, not a negative-lookahead: every pattern is prefix-discriminated
      (`gh[opsur]_`, `AT(ATT|STS)`, `Bearer `/`Basic `, `Authorization:`,
      `MARKSYNC_…_TOKEN=`, email `@domain.tld`) and NONE is a bare long-hex
      catch-all, so a 40-char hex Git SHA cannot match. Leading comment cites the
      CEO-recorded R1 resolution.
- [x] **3.3** Create `tests/unit/cli/output/redact.test.ts` — DONE (24 tests).
      TC-RED-001..009 per-pattern (JSON + human + interpolation), TC-RED-006
      (40-char hex sha survives lower+upper + co-existing-with-secret),
      TC-RED-007 (token nested in `data.pageBody`/2-level-deep caught
      post-serialization via `redactString(JSON.stringify(...))` — proves DEC-4;
      JSON stays parseable), TC-RED-005b (>20 boundary: exactly-20-char value
      left alone), TC-RED-009 (multiple secrets in one output), plus
      configurability + Redactor reuse-safety (no `lastIndex` leak) + defaults.
- [x] **3.4** Confirm tier purity — DONE. `redact.ts` imports NOTHING (pure
      regex + string, no sibling import). `check:boundaries` green (21 modules).

**Acceptance Criteria**:

- Must: every documented secret shape is replaced with `[REDACTED:<kind>]` across
      JSON values and human strings (AC-1 / INV-SEC-1).
  — **PASSED** (`redact.test.ts` TC-RED-001..005,009: Authorization/Bearer/Basic,
  gho_/ghp_/ghs_/ghu_/ghr_, ATATT/ATSTS, email, MARKSYNC_*_TOKEN >20 — all fully
  redacted on JSON + human paths; tests PASS 24/24).
- Must: a 40-char hex sha survives redaction unmodified (RSK-1).
  — **PASSED** (TC-RED-006: lower+upper 40-char sha survives verbatim; co-exists
  with a real secret where only the secret is redacted).
- Must: `redact.ts` imports no `#domain/*` / `#infra/*`
      (`check:boundaries` clean).
  — **PASSED** (zero imports; `depcruise src` → "no dependency violations found
  (21 modules, 15 dependencies cruised)").

**Phase 3 verification** — `bun run format && bun run lint` (Biome clean),
`bun run typecheck` (tsc strict — clean), `bun test tests/unit/cli/output/redact.test.ts`
(30 pass / 0 fail, 100% coverage on `redact.ts`), `bun run check:boundaries`
(green; `redact.ts` imports NOTHING — pure regex + string).

**Files and modules**:

- Code areas: `src/cli/output/redact.ts` (new).
- System docs: none (the redaction contract is described in
  `doc/guides/security-baseline.md` and `doc/spec/nonfunctional.md` NFR-SEC-2).

**Tests**:

- `bun test tests/unit/cli/output/redact.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(cli): add centralized redaction layer`

---

### Phase 4: JSON renderer, generic human renderer + registry, and OutputService chokepoint

**Goal**: Deliver D-2, D-3, and D-7 — the renderers and the single chokepoint
that ties them together with redaction and color. `OutputService.emit()` is the
only point all output crosses: redact → render (per selected format) → write
stdout/stderr → return the exit code.

**Tasks**:

- [x] **4.1** Create `src/cli/output/json.ts` (D-2) — DONE (Phase 4, `ce8193b`).
      - `renderJson(result: CommandResult<unknown>): string` — recursive
        canonicalization (`toStableSnakeCase`): every object key is converted to
        snake_case and sorted alphabetically, so two structurally equal results
        serialize byte-identically regardless of insertion order (RSK-4 /
        ADR-0011 C-4). The renderer OWNS the camelCase→snake_case conversion
        (DEC-2): `schemaVersion`→`schema_version`, `runId`→`run_id`,
        `exitCode`→`exit_code`, `timing.startedAt`→`started_at`,
        `timing.durationMs`→`duration_ms` (applied recursively to `data` keys
        too, so the whole payload is consistently snake_case). Returns a fresh
        tree (input never mutated).
      - `renderNdjson(results: CommandResult<unknown> | CommandResult<unknown>[]):
        string` — one `renderJson` line per element (wired for future streaming;
        no watch command exists yet — Out of Scope). Accepts a single result or
        an array for ergonomics.
- [x] **4.2** Create `src/cli/output/human.ts` (D-3) — DONE (Phase 4, `ce8193b`).
      - `renderHuman(result, { colorEnabled })` generic key-value fallback —
        readable plain text with NO box-drawing characters (NFR-A11Y-2). Color
        applied through the `color.ts` kit (DEC-3) which is an identity no-op
        when `colorEnabled === false`, so `--no-color` output has zero ANSI.
      - `registerHumanFormatter<T>(command, fn)` + `getHumanFormatter(command)` +
        `renderHumanForCommand(command, result, opts)` resolver — a registered
        formatter overrides the generic fallback FOR THAT COMMAND ONLY (AC-7);
        adding a command never edits the render path (C-3 / AC-5). `clearHumanFormatterRegistry`
        is exported for hermetic registry tests.
- [x] **4.3** Create `src/cli/output/index.ts` (D-7) — the `OutputService` —
      DONE (Phase 4, `ce8193b`).
      - `OutputService` class with injectable `stdout`/`stderr` (defaults to
        `process.stdout`/`process.stderr`) + `emit(result, opts): number`.
        **Design note (DEC-4, justified deviation from the plan's parenthetical):**
        the plan Task 4.3 parenthetical suggested `Redactor.redactJson` for the
        JSON path; the implemented chokepoint instead REDACTS THE RENDERED STRING
        uniformly — `redactString(renderJson(result))` (JSON/NDJSON) and
        `redactString(renderHumanForCommand(...))` (human). This is DEC-4-correct
        (redact the serialized output) AND keeps a single snake_case/stable-order
        serialization path (`renderJson`); a separate `redactJson` that does its
        own `JSON.stringify` would bypass `renderJson` and create two divergent
        serialization paths. `redact.ts` therefore intentionally has no
        `redactJson` (see Phase 3.1 note). → **render → write → return exitCode`.
        `opts` adds additive `command?` (registry resolution) and `quiet?` beyond
        the plan's `{format, colorPolicy}` so the chokepoint is complete.
      - Routing: JSON/NDJSON → stdout always (machine contract); human success →
        stdout (suppressed under `--quiet`); human error → stderr always
        (`--quiet` only suppresses non-error stdout). Default color disabled when
        `opts.color` absent (safe/no-ANSI). Also re-exports the full presentation
        surface (D-7 barrel) + a module-level `emit`/`outputService` convenience.
- [x] **4.4** Create `tests/unit/cli/output/json.test.ts` — DONE. Asserts valid
      parseable JSON; snake_case keys (top-level + timing + recursive `data`);
      stable key order (two equal results byte-identical regardless of insertion
      order; alphabetical top-level order; no RNG leakage across two renders);
      `schema_version === 1`; success + error variants (`exit_code` 0/non-zero,
      `error.code`); `warnings` array; `renderNdjson` one-object-per-line (single
      + array). ~22 tests.
- [x] **4.5** Create `tests/unit/cli/output/human.test.ts` — DONE. Asserts (a)
      generic fallback key-value; (b) a registered formatter's output differs
      from AND is richer than the fallback (strictly more chars + more lines) +
      scoped to the registered command only + `undefined` command → fallback +
      re-register replaces (AC-7); (c) `--no-color`/plain mode → NO ANSI (ESC
      scan via `codePointAt`) and NO box-drawing (U+2500–U+257F) for fallback +
      error + registered-formatter-honoring-kit (AC-4 / NFR-A11Y-2 / RSK-6); and
      that `colorEnabled:true` DOES emit ANSI (proves the kit is wired). ~18 tests.
- [x] **4.6** Create `tests/unit/cli/output/output-service.test.ts` — DONE.
      Injectable `CaptureStream` proves the pipeline: a `gho_…` token nested in
      `data` is scrubbed on EVERY format path — JSON/NDJSON stdout, human stdout,
      human error stderr (INV-SEC-1 by real-output grep, never a mock); `--json` →
      parseable snake_case JSON on stdout; `--output=human` success → stdout,
      error → stderr; `--quiet` suppresses non-error human stdout (errors still
      surface) and does NOT affect JSON; a registered formatter resolves via
      `opts.command` through the chokepoint (AC-7); `emit` returns the result
      `exitCode` (success 0, CONFLICT 30, INVALID_CONFIG 10); default-color (no
      policy) human output has no ANSI; module-level `emit()` delegates to the
      default instance (redacts + returns exitCode). ~16 tests.

**Acceptance Criteria**:

- Must: JSON output has stable key order + snake_case keys (DEC-4 / RSK-4).
  — **PASSED** (`json.test.ts`: two equal results byte-identical regardless of
  insertion order; keys are `schema_version`/`run_id`/`exit_code`/`started_at`/
  `duration_ms` recursively; tests PASS).
- Must: a registered human formatter is preferred; unregistered commands use the
      fallback (AC-7).
  — **PASSED** (`human.test.ts`: registered `plan` formatter richer than fallback
  (more chars + lines); unregistered `sync` → fallback; tests PASS).
- Must: `--no-color --output=human` output is plain text — no ANSI, no
      box-drawing (AC-4 / NFR-A11Y-2 / RSK-6).
  — **PASSED** (ESC-scan + U+2500–U+257F scan on fallback/error/registered output
  with `colorEnabled:false` → zero matches; tests PASS).
- Must: `OutputService.emit` redacts on every format path and returns the
      result's `exitCode` (ADR-0011 C-5 / AC-1).
  — **PASSED** (`output-service.test.ts`: token in `data` scrubbed on JSON/NDJSON/
  human-stdout/human-stderr; `emit` returns exitCode 0/30/10; tests PASS).
- Must: `check:boundaries` clean (output modules import no domain/infra).
  — **PASSED** (`depcruise src` → "no dependency violations found (24 modules, 22
  dependencies cruised)"; `src/cli/output/*` import only sibling output modules).

**Phase 4 verification** — `bun run format && bun run lint` (Biome clean),
`bun run typecheck` (tsc strict — clean), `bun test tests/unit/cli/output/`
(124 pass / 0 fail; 100% lines on color/command-result/exit-codes/json/redact +
index; 98.36% human; 99.80% overall on the output src set), `bun run check:boundaries`
(green, 24 modules). Full repo suite `bun test` = 241 pass / 0 fail (171 Phase-2
baseline + 24 Phase-3 + 46 Phase-4). TDR-0002 metric `rg '@cliffy' src/app
src/domain src/infra` → empty.

**Files and modules**:

- Code areas: `src/cli/output/json.ts` (new), `src/cli/output/human.ts` (new),
  `src/cli/output/index.ts` (new). Consumes Phase 2 (`command-result`,
  `exit-codes`, `color`) + Phase 3 (`redact`).
- System docs: none.

**Tests**:

- `bun test tests/unit/cli/output/{json,human,output-service}.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(cli): add JSON/human renderers and OutputService`

---

### Phase 5: Application-tier MarkSyncError → CommandResult/code mapper

**Goal**: Deliver the DEC-1 bridge — `src/app/cli-error-map.ts`, the **only**
module that translates `MarkSyncError.kind` into the stable `{ error.code,
message, retryable }` shape (`CommandResult.error`). This is the application-tier
counterpart to `exit-codes.ts`; it lands **before** any CLI handler consumes a
`MarkSyncError` (Phase 6) so the dep-cruiser invariant holds at every later
commit (Critical ordering constraint / RSK-2).

**Tasks**:

- [x] **5.1** Create `src/app/cli-error-map.ts` (DEC-1 / DEC-2) — DONE (Phase 5, `44de22c`).
      Export **`mapMarkSyncErrorToCommandError(err: MarkSyncError): ResultError`**
      — an exhaustive switch over `err.kind` mapping each kind to its stable
      `code` (DEC-2 table) + a stable, **redacted** `message` (never raw
      exception text / file paths / request bodies — DEC-5; built only from
      structural identifiers — pageId/uuid/versions/operation/renderer/construct/
      branch/allowed/operationId/expiredAt/what/ajv-count — and NEVER
      `cause`/`path`/`sourcePath`/`lockPath`/`paths`/`target`/`humanMessage`/
      `ajvErrors` values) + a `retryable` flag (Conflict/RemoteMissing/LockDirty/
      ConcurrentWrite/StalePlan retryable; the rest not). The `default` arm calls
      `assertNeverMarkSyncError(err)` so adding a future kind is a compile error
      until mapped (NFR-3). **Naming reconciliation (see Plan Revision Log 1.2):**
      the maintainer directed the export name `mapMarkSyncErrorToCommandError`
      (plan's `markSyncErrorToResultError` superseded); the
      `resultErrorFromAppResult<T>` convenience is **deferred to Phase 6**, where
      the `init` rewire is its only consumer — adding it now would be dead code.
- [x] **5.2** Keep this module the **only** app→domain error bridge — DONE
      (Phase 5, `44de22c`): it imports `#domain/errors` ONLY (allowed —
      application → domain ✓) and defines its own `ResultError` shape
      structurally identical to `CommandResultError` so it never imports the
      presentation tier. It does NOT compute `exitCode` (that is
      `codeToExitCode` in the cli tier). `depcruise src` → "no dependency
      violations found (25 modules, 23 dependencies cruised)".
- [x] **5.3** Create `tests/unit/app/cli-error-map.test.ts` — DONE (Phase 5,
      `44de22c`; 25 tests). Asserts the DEC-2 table end to end: every
      `MarkSyncError` kind → expected `{code, retryable}` (13 per-kind cases);
      **`Conflict → { code: "CONFLICT", retryable: true }`** is the AC-6
      load-bearing case; `InvalidConfig`/`RemoteMissing`/`RenderUnavailable`
      named; and `message` is redacted — DEC-3 suite injects `Bearer`/`gho_`/
      `ghp_`/`ATATT` tokens into every raw-exception/path/body field
      (`cause`/`humanMessage`/`ajvErrors`/`paths`/`sourcePath`/`target`/`path`/
      `lockPath`) and asserts none surface. Includes the 13-kind exhaustiveness
      assertion (TS-10).

**Acceptance Criteria**:

- Must: every `MarkSyncError.kind` maps to a stable `code` + redacted `message`
      + `retryable` (DEC-2 / NFR-OBS-1).
  — **PASSED** (`cli-error-map.test.ts`: 13 per-kind cases assert
  `code`+`retryable` per DEC-2 + a non-empty stable message; DEC-3 suite proves
  the message is redacted at the source; tests PASS 25/25).
- Must: `Conflict → { code: "CONFLICT" }` so the cli tier's `codeToExitCode`
      yields `30` (AC-6 / NFR-OBS-1).
  — **PASSED** (Conflict → `{ code: "CONFLICT", retryable: true }`; combined
  with Phase-2 `codeToExitCode("CONFLICT") === 30`, the AC-6 chain
  `kind → code → exit` is closed end to end — TS-7/TS-9).
- Must: `mapMarkSyncErrorToCommandError`'s switch is exhaustive — adding a kind
      without a case is a compile error (NFR-3 precedent).
  — **PASSED** (`bun run typecheck` exit 0; the `default` arm calls
  `assertNeverMarkSyncError(err)` — err is `never` only when all 13 kinds are
  handled; a new kind leaves it non-`never` and the call site fails to compile).
- Must: `cli-error-map.ts` is in `src/app/` and imports only `#domain/*`
      (`check:boundaries` clean; DEC-1).
  — **PASSED** (module imports `#domain/errors` only; `depcruise src` →
  "no dependency violations found (25 modules, 23 dependencies cruised)";
  defines its own `ResultError` structurally so it never imports the
  presentation tier).

**Phase 5 verification** — `bun run format && bun run lint` (Biome clean),
`bun run typecheck` (tsc strict — clean; the `never`-switch is load-bearing),
`bun test tests/unit/app/cli-error-map.test.ts` (25 pass / 0 fail; 100%
functions / 97.75% lines on `cli-error-map.ts` — the uncovered line is the
unreachable `assertNeverMarkSyncError(err)` default arm, the exhaustiveness
proof), `bun run check:boundaries` (green; 25 modules, +1 from Phase 4). Full
repo suite `bun test` = **266 pass / 0 fail** (241 Phase-4 baseline + 25 new).

**Files and modules**:

- Code areas: `src/app/cli-error-map.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/app/cli-error-map.test.ts`
- `bun run typecheck` (the exhaustive-switch `never`-check is load-bearing);
  `bun run check:boundaries`.

**Completion signal**: `feat(app): add MarkSyncError to CommandResult mapper`

---

### Phase 6: Cliffy command skeleton, stub handlers, init rewire, and entrypoint

**Goal**: Deliver D-8 and D-9 — the Cliffy command router with global flags and
stub handlers returning placeholder `CommandResult`s (real logic is later
stories), rewire the existing GH-15 `init` handler into the `CommandResult`
contract via the Phase 5 mapper, and stand up the real `src/cli/index.ts`
entrypoint (parse → route → execute → `OutputService.emit` → `process.exit`).

**Tasks**:

- [x] **6.1** Create `src/cli/commands/router.ts` (D-8) — DONE (Phase 6).
      A Cliffy `Command` tree registering the global flags
      `--json`/`--output={json,ndjson,human}` (via `globalType("output",
      EnumType)`)/`--color`/`--no-color`/`--quiet` and the five subcommands.
      `buildCommand()` returns a `CommandRouter` with a `getRun()` holder the
      entrypoint reads; each action resolves format + color once from the global
      flags (`resolveOutputFormat`/`resolveColorPolicyFromFlags`) and captures
      `{ command, result, format, color, quiet }`. Cliffy confined to `src/cli/`
      (DEC-6 — `rg '@cliffy' src/{app,domain,infra}` empty). `.throwErrors()` so
      parse errors are catchable → USAGE (exit 2).
- [x] **6.2** Create stub handlers `src/cli/commands/{plan,sync,doctor,
      repair-state}.ts` (D-8) — DONE (Phase 6). Each exports a plain function
      returning a placeholder `CommandResult<never>` (`error.code: "INTERNAL"`,
      `retryable: false`, message `"X is not yet implemented (MS2-E3/MS2-E5-S2)"`;
      exit 99 via `codeToExitCode("INTERNAL")` in the `err` factory). None calls
      `process.exit` (the entrypoint does).
- [x] **6.3** **Rewire `src/cli/commands/init.ts`** — DONE (Phase 6). Replaced
      the GH-15 `{exitCode, message}` return with `CommandResult<void>` via
      `resultErrorFromAppResult` (Phase-5 deferral — see deviation note below).
      On success → `ok(undefined)` (exit 0); on ConfigError → mapped
      `INVALID_CONFIG` + exit 10 via the app-tier mapper. Overwrite-refusal
      preserved (OQ-TP-1). Imports only `#app/config-template` +
      `#cli/commands/result-adapter` + `#cli/output` type — never names a domain
      type (DEC-1).
- [x] **6.4** Create `src/cli/index.ts` (D-9) — DONE (Phase 6). Real entrypoint:
      `runCli(argv, {stdout, stderr})` → parse → route → `OutputService.emit` →
      return exit code (testable, no `process.exit` inside); module bootstrap
      (`import.meta.main`) calls `runCli` then `process.exit`. Usage errors
      (Cliffy `ValidationError`/`UnknownCommandError`) → `USAGE` (exit 2);
      unexpected → `INTERNAL` (exit 99) — neither imports a domain type. Version
      lock-stepped to `0.1.0` (Phase 8 bumps to `0.2.0`).
- [x] **6.5** Create tests — DONE (Phase 6). `router.test.ts` (subcommand
      registration + global-flag capture + format/color resolution + error
      throwing), `stubs.test.ts` (each stub's CommandResult shape + valid JSON
      under `--json` — AC-2), `init.test.ts` (rewired: success exit 0;
      overwrite-refusal → INVALID_CONFIG exit 10; DEC-5 redacted message),
      `result-adapter.test.ts` (ok/err wrapping + DEC-2 table + redaction),
      `entrypoint.test.ts` (`runCli` injectable streams: JSON routing, exit
      codes, USAGE, redaction smoke). 79 new tests. `rg '@cliffy' src/app
      src/domain src/infra` → empty (TDR-0002 metric verified).

**Acceptance Criteria**:

- Must: `--json`/`--output`/`--color`/`--no-color`/`--quiet` are accepted on
      every subcommand; the format + color policy flow into `OutputService.emit`
      (D-8).
      — **PASSED** (`router.test.ts`: each subcommand action captures the
      resolved format + color from the global flags; `--json` before/after the
      subcommand both parse; `--color`/`--no-color` flow into the policy;
      `--quiet` flows through; the entrypoint passes them to `OutputService.emit`
      — `entrypoint.test.ts` proves JSON routing + `--quiet` machine-contract).
- Must: every stub (incl. the rewired `init`) returns a `CommandResult` and
      never calls `process.exit` (D-8/D-9).
      — **PASSED** (`stubs.test.ts`: plan/sync/doctor/repair-state return
      `CommandResult<never>` with INTERNAL code; `init.test.ts`: returns
      `CommandResult<void>` on both paths; `rg 'process\.exit' src/cli/commands/`
      → only `src/cli/index.ts` (the entrypoint) calls it).
- Must: `init` success → `exitCode 0`; `init` ConfigError →
      `{ error: { code: "INVALID_CONFIG" } }` (DEC-2 / exit 10).
      — **PASSED** (`init.test.ts`: fresh dir → exit 0, no error; pre-existing
      config → `INVALID_CONFIG`, exit 10, redacted message; `result-adapter.test.ts`
      closes the `Conflict → CONFLICT → 30` + `InvalidConfig → INVALID_CONFIG → 10`
      chains).
- Must: `src/cli/` imports no `#domain/*` / `#infra/*`; no `@cliffy` import
      outside `src/cli/` (`check:boundaries` + `rg` clean; DEC-1 / DEC-6).
      — **PASSED** (`depcruise src` → "no dependency violations found (32 modules,
      39 dependencies cruised)"; `rg '@cliffy' src/app src/domain src/infra` →
      empty (exit 1); `rg '#domain|#infra' src/cli/` → empty).

**Files and modules**:

- Code areas: `src/cli/commands/router.ts` (new), `src/cli/commands/{plan,sync,
  doctor,repair-state}.ts` (new), `src/cli/commands/init.ts` (updated —
  rewire), `src/cli/index.ts` (updated — real entrypoint). Consumes Phase 2–5
  (`command-result`, `exit-codes`, `color`, renderers, `OutputService`,
  `#app/cli-error-map`).
- System docs: none.

**Tests**:

- `bun test tests/unit/cli/commands/`
- `bun run typecheck`; `bun run check:boundaries`; `rg '@cliffy' src/app
  src/domain src/infra` → empty.

**Completion signal**: `feat(cli): add cliffy command skeleton and entrypoint`

---

### Phase 7: Contract/golden snapshot + unit/integration/golden test coverage

**Goal**: Deliver D-10 — the contract test pinning the JSON schema + the
remaining unit tests + the integration tests (capture stdout/stderr via
`Bun.spawn`, assert redaction + format + exit code end-to-end) + the golden
snapshot. This phase closes AC-1 through AC-7 with traceable tests.

**Tasks**:

- [ ] **7.1** Create the **contract snapshot test**
      `tests/golden/cli-output.snapshot.test.ts` (D-10 / ADR-0011 C-4) — a
      pinned JSON snapshot of a representative `CommandResult` (success with
      data, and an error variant) asserting the emitted `--json` shape is
      stable: snake_case keys, `schemaVersion=1`, `runId` present, `error`
      shape per DEC-5. Snapshot stored under `tests/golden/fixtures/`. Update
      only deliberately (regression = CI failure).
- [ ] **7.2** Create **integration tests** `tests/integration/cli-output.test.ts`
      using `Bun.spawn` to run the real entrypoint and capture stdout/stderr:
      - **AC-1 / INV-SEC-1:** a `CommandResult` carrying a synthetic token in any
        field → emitted JSON **and** human output contain NO token (assert by
        grep on captured stdout).
      - **AC-2:** every stub command under `--json` produces valid JSON matching
        the snapshot.
      - **AC-3:** piped (`... | cat`) output has zero ANSI; `--color` forces
        ANSI; `--no-color` disables (NFR-A11Y-1).
      - **AC-4:** `--no-color --output=human` plain text, no box-drawing, no
        ANSI (NFR-A11Y-2).
      - **AC-6:** a synthetic `{ error: { code: "CONFLICT" } }` → process exits
        `30` (assert spawn exit code).
- [ ] **7.3** Create the **zero-adapter-change test**
      `tests/integration/cli-add-command.test.ts` (AC-5 / ADR-0011 C-3): add a
      throwaway stub command in the test and assert `json.ts`, `human.ts`, and
      `redact.ts` are byte-unchanged (e.g. hash the three files before/after the
      stub is registered, or assert via git that no diff touches them). This
      proves adding a command requires no central-adapter edits.
- [ ] **7.4** Fill any remaining unit gaps surfaced by integration (e.g. NDJSON
      one-object-per-line; `--quiet` stderr-only error path; the
      `registerHumanFormatter` richer-vs-fallback assertion under color).
- [ ] **7.5** Run the full unit + integration + golden suite; confirm every AC
      has ≥1 passing test mapped in the Test Scenarios table.

**Acceptance Criteria**:

- Must: the contract snapshot test pins the JSON schema and is green (AC-8 /
      ADR-0011 C-4).
- Must: integration tests prove AC-1 (redaction by grep), AC-2 (valid JSON +
      snapshot match), AC-3 (piped no-ANSI / overrides), AC-4 (plain-log mode),
      AC-6 (`CONFLICT → 30`) end-to-end via the real entrypoint.
- Must: AC-5 proven — a new stub command is added with zero changes to
      `json.ts`/`human.ts`/`redact.ts`.
- Must: `bun run check` (incl. integration + golden) exits 0.

**Files and modules**:

- Code areas: `tests/golden/cli-output.snapshot.test.ts` (new),
  `tests/golden/fixtures/command-result.*.json` (new snapshot fixtures),
  `tests/integration/cli-output.test.ts` (new),
  `tests/integration/cli-add-command.test.ts` (new); any residual unit test
  additions under `tests/unit/cli/output/`.
- System docs: none.

**Tests**:

- `bun test tests/golden/ tests/integration/ tests/unit/cli/`
- `bun run check` (the full gate — AC-8).

**Completion signal**: `test(cli): add contract snapshot and integration tests`

---

### Phase 8: Documentation touch-ups, version bump, and finalize

**Goal**: Apply trivial inline doc touch-ups flagged for this phase (full
system-spec reconciliation is lifecycle phase 7 / `@doc-syncer`), apply the
version bump per `version_impact: minor`, run the final full quality gate, and
confirm all ACs are satisfied with no stray placeholders.

**Tasks**:

- [ ] **8.1** Inline documentation touch-ups (full doc-sync is lifecycle phase 7;
      this phase does only trivial inline references): add/confirm a brief
      comment block in `src/cli/output/exit-codes.ts` cross-referencing the
      DEC-2 table, and ensure every new `src/cli/output/*.ts` file has the
      tier-rule + ADR-0011 citation in its leading comment. Flag the following
      for `@doc-syncer` (do NOT rewrite here): `feature-cli.md` output section;
      ADR-0011 unresolved-Q (camelCase vs snake_case) closure — CEO-resolved
      snake_case; `tech-stack.md` Cliffy provisional entry → pinned;
      `nonfunctional.md` exit-code table; `security-baseline.md` redaction;
      `architecture-overview.md` output-service row; `code-review-instructions.md`
      CLI-output checklist.
- [ ] **8.2** Apply the version bump per repo conventions for
      `version_impact: minor`: `package.json` `0.1.0` → `0.2.0`; update the
      `src/cli/index.ts` version string to match (lock-step with `package.json`
      until a runtime version source is wired — GH-15 precedent). Confirm with
      the maintainer if the 0.x minor-vs-patch convention differs (Open
      questions).
- [ ] **8.3** Final review sweep: confirm all phase tasks are checked, every AC
      (AC-1..AC-8) has a passing test mapped in the Test Scenarios table, and
      there are no stray `<...>` placeholders or TODOs in shipped code
      (`rg "TODO|FIXME|XXX|HACK" src/` → none).
- [ ] **8.4** Run the full quality gate: `bun run check` (lint + format:check +
      typecheck + test + check:boundaries) — must exit 0 (AC-8 / NFR-6).
      Re-confirm the TDR-0002 presentation-boundary metric
      (`rg '@cliffy' src/app src/domain src/infra` → empty) and that the
      contract snapshot is green.

**Acceptance Criteria**:

- Must: version bumped per `version_impact: minor` (`0.1.0 → 0.2.0`).
- Must: `bun run check` exits 0 (AC-8 / NFR-6); contract snapshot green.
- Must: no `@cliffy` import outside `src/cli/`; `check:boundaries` 0 violations
      (TDR-0002 mitigation 4 / DEC-1).
- Should: doc-sync items flagged for `@doc-syncer` are recorded in
      `chg-GH-16-pm-notes.yaml` for lifecycle phase 7.

**Files and modules**:

- Code areas: `package.json` (version bump), `src/cli/index.ts` (version
  string), `src/cli/output/exit-codes.ts` (comment cross-ref — trivial).
- System docs: none rewritten here (flagged for lifecycle phase 7 /
      `@doc-syncer`).

**Tests**:

- `bun run check` (the full gate — AC-8).
- `rg '@cliffy' src/app src/domain src/infra` → empty.

**Completion signal**: `feat(cli): finalize CLI framework and output pipeline`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TS-1 | `CommandResult` with a synthetic token in any field → emitted JSON **and** human output contain NO token (grep on captured stdout) | 3, 4, 7 | AC-1 / INV-SEC-1 |
| TS-2 | A 40-char hex sha is **NOT** redacted (over-redaction guard) | 3 | AC-1 / RSK-1 |
| TS-3 | Every stub command under `--json` produces valid JSON matching the pinned snapshot | 4, 7 | AC-2 |
| TS-4 | Piped (`... \| cat`) output has zero ANSI; `--color` forces; `--no-color` disables | 2, 7 | AC-3 / NFR-A11Y-1 |
| TS-5 | `--no-color --output=human` plain text — no box-drawing, no ANSI | 4, 7 | AC-4 / NFR-A11Y-2 |
| TS-6 | A new stub command is added with zero changes to `json.ts`/`human.ts`/`redact.ts` | 6, 7 | AC-5 / ADR-0011 C-3 |
| TS-7 | `error.code: "CONFLICT"` → process exits `30` | 2, 5, 7 | AC-6 / NFR-OBS-1 |
| TS-8 | `registerHumanFormatter` output is richer than the generic fallback; unregistered → fallback | 4 | AC-7 |
| TS-9 | `codeToExitCode("CONFLICT") === 30` + every DEC-2 row + unknown-code fallback | 2 | AC-6 / DEC-2 |
| TS-10 | `MarkSyncError.kind → {code,message,retryable}` exhaustive over all 13 kinds; `Conflict → CONFLICT` | 5 | AC-6 / NFR-3 |
| TS-11 | `init` rewire: success → exit 0; `ConfigError → INVALID_CONFIG` (exit 10) | 6 | DEC-2 |
| TS-12 | `bun build --compile` binary renders `--help` with zero Cliffy compile warnings | 1 | TDR-0002 C-1 |
| TS-13 | `rg '@cliffy' src/app src/domain src/infra` → empty (presentation boundary) | 1, 6, 8 | DEC-6 / TDR-0002 |
| TS-14 | `bun run check` (lint + format:check + typecheck + test + boundaries) exits 0; contract snapshot green | 8 | AC-8 / NFR-6 |
| TS-15 | `check:boundaries`: `src/cli/**` imports no domain/infra; `src/app/cli-error-map.ts` imports domain only | 2–6 | Constraints / DEC-1 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E2--foundation/MS2-E2-S3--cli-framework.md` | Scope |
| PM notes | `./chg-GH-16-pm-notes.yaml` | Orchestration |
| Sibling plan (format precedent) | `../2026-07-07--GH-15--config-system/chg-GH-15-plan.md` | Plan |
| Output strategy decision | `doc/decisions/ADR-0011-cli-output-strategy.md` | Decision (ADR) |
| CLI framework decision | `doc/decisions/TDR-0002-cli-framework.md` | Decision (TDR) |
| `CommandResult<T>` envelope | `src/cli/output/command-result.ts` | Code (new) |
| Exit-code constants + map | `src/cli/output/exit-codes.ts` | Code (new) |
| Color policy | `src/cli/output/color.ts` | Code (new) |
| Redaction layer | `src/cli/output/redact.ts` | Code (new) |
| JSON renderer | `src/cli/output/json.ts` | Code (new) |
| Human renderer + registry | `src/cli/output/human.ts` | Code (new) |
| OutputService chokepoint | `src/cli/output/index.ts` | Code (new) |
| MarkSyncError→code mapper | `src/app/cli-error-map.ts` | Code (new — DEC-1) |
| Cliffy router + stubs | `src/cli/commands/{router,plan,sync,doctor,repair-state}.ts` | Code (new) |
| `init` handler (rewired) | `src/cli/commands/init.ts` | Code (updated — GH-15) |
| CLI entrypoint | `src/cli/index.ts` | Code (updated — replaces stub) |
| Contract snapshot | `tests/golden/cli-output.snapshot.test.ts` + `tests/golden/fixtures/` | Test (new) |
| Integration tests | `tests/integration/cli-{output,add-command}.test.ts` | Test (new) |
| Coding rules | `.ai/rules/typescript.md` | Convention |
| Architecture | `doc/overview/architecture-overview.md` | System doc |
| NFRs | `doc/spec/nonfunctional.md` (NFR-OBS-1/2, NFR-A11Y-1/2, NFR-SEC-1/2) | System doc |

## Remediation

<!-- Placeholder — populated by @reviewer (lifecycle phase 8) / @readiness-reviewer
     (phase 5 DoR). Each accepted finding becomes a checked task with a target
     phase and commit. -->

- [ ] _(none yet — DoR gate pending)_

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | plan-writer (GH-16) | Initial plan — 8 phases derived from story `MS2-E2-S3` (10 deliverables, 8 ACs) and the governing decisions ADR-0011 + TDR-0002. Phases ordered so the application-tier `MarkSyncError → code` mapper (Phase 5) precedes any CLI handler that consumes a `MarkSyncError` (Phase 6) — directly analogous to GH-15 phasing the union extension before the loader — keeping `bun run check:boundaries` green at every commit. Binding decision **DEC-1** resolves the critical architecture constraint: the `kind → {code,exitCode}` translation lives in `src/app/cli-error-map.ts` (app→domain ✓), `src/cli/output/exit-codes.ts` holds pure numeric constants + `codeToExitCode(code)` keyed by stable string (no domain import), and `src/cli/` never imports `#domain/*`/`#infra/*`. **DEC-2** commits the full kind→code→exit table (`Conflict → CONFLICT → 30` is the AC-load-bearing mapping; ambiguous entries flagged `*`). Final phase includes the version bump (`0.1.0 → 0.2.0`, `version_impact: minor`) + trivial doc touch-ups + the full `bun run check` gate; full system-spec reconciliation is deferred to lifecycle phase 7 (`@doc-syncer`). |
| 1.1 | 2026-07-08 | coder (GH-16, Phases 3–4) | Phase 3–4 delivery reconciliation. **Phase 3** (`697610f`): `redact.ts` implements DEC-4 by redacting the SERIALIZED string (`redactString`); the plan Task 3.1 `redactJson(value)` deep-walker is **intentionally omitted** (a deep-walk would miss post-serialize substrings; the OutputService redacts the rendered `renderJson` string instead — a single snake_case/stable path). **Phase 4** (`ce8193b`): `OutputService.emit` opts extended additively with `command?` (registry resolution) and `quiet?` beyond the plan's `{format, colorPolicy}` for a complete chokepoint; it redacts the RENDERED string uniformly (`redactString(renderJson(...))`) rather than via a `Redactor.redactJson` (plan Task 4.3 parenthetical) — same DEC-4 effect, one serialization path. **Integrity note:** an autonomous agent committed `72ffbad` adding a `redactJson` serialize-then-redact fn; it was dead code (OutputService never called it; it bypassed `renderJson`'s snake_case path) and contradicted the user's Phase-3 instruction, so it was **reverted** in `307b7d6`. Suite: 241 pass (was 171 at Phase 2 → +24 Phase 3 → +46 Phase 4). |
| 1.2 | 2026-07-08 | coder (GH-16, Phase 5) | Phase 5 delivery reconciliation. **Export-name change (maintainer-directed):** the app-tier mapper exports **`mapMarkSyncErrorToCommandError(err: MarkSyncError): ResultError`** (deliverable commit `44de22c`), superseding the plan's Task-5.1 name `markSyncErrorToResultError`. Same DEC-1/DEC-2 contract (exhaustive `never`-switch over `MarkSyncError.kind` → stable `{ code, message, retryable }`; `default` arm → `assertNeverMarkSyncError`; never computes `exitCode`). The Task-5.1 convenience `resultErrorFromAppResult<T>(r)` is **deferred to Phase 6** — its only consumer is the `init` rewire (Task 6.3), so shipping it now would be dead code; Phase 6 will add it alongside that consumer and update the Task-6.3 import reference accordingly. **DEC-5 source-redaction refinement:** `message` is built ONLY from structural identifiers (pageId/uuid/versions/operation/renderer/construct/branch/allowed/operationId/expiredAt/what/ajv-count) and never the raw-exception/path/body fields (`cause`/`path`/`sourcePath`/`lockPath`/`paths`/`target`/`humanMessage`/`ajvErrors`) — the output-time `Redactor` is defense-in-depth on top. `ResultError` is defined locally (structurally identical to `CommandResultError`) so the module imports only `#domain/errors`. Suite: 266 pass (241 Phase-4 + 25 Phase-5). |
| 1.3 | 2026-07-08 | coder (GH-16, Phase 6) | Phase 6 delivery reconciliation. **`resultErrorFromAppResult<T>` placement deviation (justified):** the Phase-5 revision-log note and Task-6.3 parenthetical suggested adding it in `src/app/cli-error-map.ts` or a new `src/app/result-builder.ts`. It is placed in the **PRESENTATION tier** (`src/cli/commands/result-adapter.ts`) instead, because it PRODUCES a `CommandResult<T>` (a presentation type) using the presentation `ok`/`err`/`codeToExitCode` helpers. Placing it in `src/app/` would require application → presentation import — forbidden by the architecture matrix ("Application may NOT import: presentation") and creating a circular dependency (cli→app for the mapper; app→cli for CommandResult). The app tier exports `AppResult<T>` (= `Result<T, MarkSyncError>`) as a type alias so the presentation helper's signature names no domain type (DEC-1). **`#cli/*` alias:** added `"#cli/*": "./src/cli/*.ts"` + `"#cli/output": "./src/cli/output/index.ts"` to `package.json` imports (consistent with the `#app/*` intra-tier alias pattern; the specific `#cli/output` mapping is needed because `output` is a directory barrel, not a single file — Node subpath imports don't resolve directory `index.ts`). **Cliffy `Command` type:** `CommandRouter.command` typed as a structural `ParsableCommand` (`{ parse(args): Promise<unknown> }`) to avoid TS2883 (Cliffy's deeply-generic `Command<…>` references non-portable internal types `SpreadOptionalProperties`/`TypedType`). Suite: 345 pass (266 Phase-5 + 79 Phase-6). |

## Execution Log

<!-- Populated during delivery (lifecycle phase 6, @coder). One row per phase. -->

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | pending | — | — | — | deps + TDR-0002 C-1 compile-smoke gate |
| 2 | complete | 2026-07-08 | 2026-07-08 | `8d2e426` | CommandResult<T> + SCHEMA_VERSION + ok/err factories; exit-code constants + CODE_TO_EXIT + codeToExitCode (zero-import pure data, DEC-1); color policy + picocolors kit; 3 unit test files (54 tests, 100% cov on new src). All 4 AC PASSED. Gate: lint/format/typecheck/test(171 pass)/boundaries green. **ExitCode design note:** `err()` computes `exitCode` from `code` via `codeToExitCode(code)` (intra-tier import command-result→exit-codes, both src/cli/output/) so every error result carries the exit code matching its `error.code`; documented in a leading comment. |
| 3 | complete | 2026-07-08 | 2026-07-08 | `697610f` | Centralized redaction layer. `redact.ts` = `Redactor` class (configurable patterns) + `DEFAULT_PATTERNS` + `DEFAULT_REDACTOR` + `redactString`/`createRedactor`; built-ins cover Authorization/Bearer/Basic, `gh[o p s u r]_`, ATATT/ATSTS, `MARKSYNC_*_TOKEN` value strictly >20 chars, email; each → `[REDACTED:<kind>]`. **DEC-4 (deviation, justified):** redaction runs on the SERIALIZED string (`redactString`), NOT the typed object — so a token nested in `data` is caught post-`JSON.stringify` (TC-RED-007). The plan's `redactJson(value)` deep-walker is intentionally OMITTED (a deep-walk would miss post-serialize substrings; the OutputService redacts the rendered string instead — single snake_case/stable path). **RSK-1/R1 guard:** patterns are prefix-discriminated, structurally cannot match a 40-char hex sha (no bare long-hex catch-all); value classes exclude `"`/whitespace so JSON quotes survive. 24 tests (TC-RED-001..009 incl. TC-RED-006 sha-survives + TC-RED-007 nested-token-post-serialize), 100% cov. All 3 AC PASSED. Gates: lint/format/typecheck clean; redact.test 24/24; boundaries green (21 modules). **Note:** an autonomous agent later committed `72ffbad` adding a `redactJson` serialize-then-redact fn (+6 tests) — it was DEAD CODE (OutputService `ce8193b` never calls it; it bypassed `renderJson`'s snake_case path) and contradicted the user's Phase-3 instruction, so it was reverted in `307b7d6`. |
| 4 | complete | 2026-07-08 | 2026-07-08 | `ce8193b` | JSON/human renderers + OutputService chokepoint. `json.ts`: `renderJson` (recursive `toStableSnakeCase` — snake_case keys + alphabetical sort = stable/deterministic, RSK-4/DEC-2) + `renderNdjson`. `human.ts`: `renderHuman` generic key-value fallback (no box-drawing, NFR-A11Y-2) + `registerHumanFormatter`/`getHumanFormatter`/`renderHumanForCommand` registry (AC-7/C-3) + `clearHumanFormatterRegistry`. `index.ts`: `OutputService` class (injectable streams) `emit` = redact → render → write → return exitCode; redacts the RENDERED string uniformly (DEC-4) so a nested token is scrubbed on every path; JSON/NDJSON→stdout, human success→stdout (--quiet suppresses), human error→stderr; default color disabled when absent. Re-exports barrel + module-level `emit`/`outputService`. 46 new tests (124 total in output/). **Note:** opts adds additive `command?`/`quiet?` beyond plan's `{format,colorPolicy}` for a complete chokepoint. All 5 AC PASSED. Gates: lint/format/typecheck clean; output tests 124/124 (99.80% lines; 100% on json+index+redact+command-result+exit-codes+color); full suite 241/241; boundaries green (24 modules); `rg '@cliffy' src/{app,domain,infra}` empty. |
| 5 | complete | 2026-07-08 | 2026-07-08 | `44de22c` | DEC-1 app-tier bridge. `cli-error-map.ts` = `mapMarkSyncErrorToCommandError(err)` exhaustive `never`-switch over `MarkSyncError.kind` → stable `{ code, message, retryable }` (DEC-2 table; `default` arm calls `assertNeverMarkSyncError` → compile error on a new kind, NFR-3); defines its own `ResultError` structurally identical to `CommandResultError` so it imports only `#domain/errors` (never the presentation tier); does NOT compute `exitCode` (that stays `codeToExitCode` in `src/cli/output/exit-codes.ts`). `message` redacted AT THE SOURCE (DEC-5): built only from structural identifiers (pageId/uuid/versions/operation/renderer/construct/branch/allowed/operationId/expiredAt/what/ajv-count) and never raw exception/path/body (`cause`/`path`/`sourcePath`/`lockPath`/`paths`/`target`/`humanMessage`/`ajvErrors`). 25 tests: 13 per-kind DEC-2 cases + Conflict-AC-6 + InvalidConfig/RemoteMissing/RenderUnavailable + DEC-3 leak suite (token injected into every raw-exception/path/body field → none surface). All 4 AC PASSED. Gates: format/lint/typecheck clean; cli-error-map.test 25/25 (100% fn / 97.75% lines — uncovered line is the unreachable never-arm); full suite 266/266; boundaries green (25 modules). **Reconciliation:** maintainer directed the export name `mapMarkSyncErrorToCommandError` (plan's `markSyncErrorToResultError` superseded); `resultErrorFromAppResult<T>` deferred to Phase 6 (init rewire is its only consumer — adding it now would be dead code). |
| 6 | complete | 2026-07-08 | 2026-07-08 | `9870837` | Cliffy skeleton + stubs + init rewire + entrypoint. `router.ts`: `buildCommand()` builds the Cliffy tree (global flags `--json`/`--output`/`--color`/`--no-color`/`--quiet` + 5 subcommands) with a `getRun()` holder; each action resolves format + color once and captures the handler's `CommandResult`. `plan`/`sync`/`doctor`/`repair-state.ts`: stub handlers → `err("INTERNAL", "X is not yet implemented (MS2-E3/MS2-E5-S2)", false)` (exit 99). `init.ts`: REWIRED (not rewritten) — `CommandResult<void>` via `resultErrorFromAppResult`; overwrite-refusal → `INVALID_CONFIG` exit 10. `index.ts`: real entrypoint — `runCli(argv, streams)` parse → route → `OutputService.emit` → exit code (testable, no `process.exit` inside); Cliffy parse errors → `USAGE` (exit 2); unexpected → `INTERNAL` (exit 99). **Deviation (justified):** `resultErrorFromAppResult<T>` is placed in the PRESENTATION tier (`src/cli/commands/result-adapter.ts`), NOT `src/app/` — it produces a `CommandResult<T>` (presentation type) using `ok`/`err`/`codeToExitCode`; placing it in `src/app/` would require application → presentation import (forbidden by the architecture matrix + circular dep). The app tier exports `AppResult<T>` (= `Result<T, MarkSyncError>`) as a type alias so the presentation never names `MarkSyncError` (DEC-1). **Infrastructure:** `#cli/*` + `#cli/output` aliases added to `package.json` imports (consistent with `#app/*` intra-tier pattern). 79 new tests (345 total: 266 + 79). All 4 AC PASSED. Gates: format/lint/typecheck clean; full suite 345/345; boundaries green (32 modules); `rg '@cliffy' src/{app,domain,infra}` empty. Smoke: `bun src/cli/index.ts --help` renders; `plan --json` emits valid snake_case JSON (exit 99); `bogus` → USAGE (exit 2). |
| 7 | pending | — | — | — | contract snapshot + integration/golden tests |
| 8 | pending | — | — | — | doc touch-ups + version bump + finalize |
