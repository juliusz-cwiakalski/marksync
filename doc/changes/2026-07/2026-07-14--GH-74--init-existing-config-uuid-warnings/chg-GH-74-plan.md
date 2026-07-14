---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-74-init-existing-config-uuid-warnings
status: Proposed
created: 2026-07-14T12:11:34Z
last_updated: 2026-07-14T12:11:34Z
owners: ["Juliusz Ćwiąkalski"]
service: marksync-cli
labels: [bug, cli, identity, sync]
links:
  change_spec: ./chg-GH-74-spec.md
  test_plan: ./chg-GH-74-test-plan.md
summary: >
  This focused bug fix makes `marksync init` continue UUID assignment when a
  configuration already exists, without changing that file. It also makes
  planning warn, once per affected committed discovered document, when a
  document lacks a `marksync:uuid` identity and is therefore excluded from
  plan entries.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-74: Fix init with existing config and UUID-less file warnings

## Context and Goals

This plan delivers two focused, independent bug fixes derived from
`chg-GH-74-spec.md` and validated against the actual source:

1. **Init existing-config preservation (F-1, F-2).** `src/cli/commands/init.ts`
   currently calls `writeStarterConfig(dir)` first; when `marksync.yml` already
   exists that call returns `ConfigError` and `assignUuidsFromDisk` is never
   reached. The fix gates config creation on `existsSync(.../marksync.yml)`:
   if present, skip creation and proceed straight to UUID assignment (config
   bytes untouched); if absent, retain the current create-then-assign sequence.
   `writeStarterConfig` and `assignUuidsFromDisk` are unchanged — the latter
   already handles an existing config via `loadConfig`.

2. **UUID-less plan warnings (F-3).** In `src/app/push-flow.ts` `computePlan`
   (step 3, lines 160-169), discovered files without `marksync:uuid` are
   silently dropped (`readUuid` returns `undefined`, never added to
   `docsWithUuid`). The fix collects those paths and emits one exact EVT-1
   warning per document into the existing `allWarnings`/`Plan.warnings` channel,
   while keeping them out of `entries`. The duplicate-UUID fatal gate (F-4) is
   untouched.

The duplicate-UUID safeguard (F-4 / INV-SAFE-3) is preserved, not relaxed.

### Upstream gaps found (plan-writer note)

The spec and test plan are mutually consistent (no contradiction). However, the
test plan's `TC-REG-001` asserts "all existing tests pass without modification
(except those explicitly changed by spec)" and enumerates only the unit-level
"overwrite-refusal" test (`tests/unit/cli/commands/init.test.ts:54`) for
modification. Direct codebase inspection found additional existing tests that
assert the OLD refused-overwrite behavior the spec removes, which the test plan
does NOT cover:

- **`tests/integration/identity/identity-assign.test.ts:124` — `TC-ASSIGN-005`
  ("refused-overwrite init does NOT assign UUIDs (OQ-TP-1)").** Pre-creates a
  valid `marksync.yml`, writes a UUID-less `docs/a.md`, runs `initCommand`, and
  asserts `exitCode === 10`, `error.code === "INVALID_CONFIG"`, and that
  `docs/a.md` is byte-unchanged (no UUID assigned). After F-1, all three
  assertions fail (exit 0, no error, UUID assigned). This is a hard breakage
  NOT covered by any TC. Phase 1 rewrites it to assert the new behavior.

- **`tests/unit/cli/commands/init.test.ts:65` — DEC-5 redaction test.**
  Pre-creates `marksync.yml` with invalid content `existing: true\n` and asserts
  a redacted non-empty error. After F-1 it still errors (via config-validation
  failure in `assignUuidsFromDisk → loadConfig`), so it likely still passes —
  but via the wrong code path (validation error, not overwrite-refusal).
  Semantic drift; Phase 1 reviews/re-purposes it.

This plan accounts for both by including explicit modification tasks. Recommend
`@test-plan-writer` reconcile `TC-REG-001` to enumerate `TC-ASSIGN-005`.

### Open questions

- **DEC-5 test disposition (decision needed).** Whether to re-purpose the DEC-5
  redaction test onto a genuine config-validation error path or remove it.
  Decision needed: consult `@decision-advisor` if the coder cannot resolve it
  inline. Default: re-purpose onto validation-error redaction.
- **Dead `if (!uuid) continue` guard (lines 204-208).** After F-3,
  `docsWithUuid` is guaranteed to carry only UUID-bearing docs, making this
  guard unreachable. Coder to remove it (preferred) or leave as a defensive
  no-op with a one-line comment. Non-load-bearing; no decision required.

## Scope

### In Scope

- F-1: `marksync init` skips config creation when `marksync.yml` exists and
  proceeds to UUID assignment, leaving the config byte-for-byte unchanged.
- F-2: `marksync init` retains create-starter-config-then-assign behavior when
  `marksync.yml` is absent.
- F-3: `computePlan` emits exactly one EVT-1 warning per committed discovered
  UUID-less document and excludes each from `entries`.
- F-4: Duplicate-UUID fatal gate preserved before render/write.
- Test updates: new TC-INIT-001/002/003 and TC-PLAN-001..004; rewrite of the
  unit overwrite-refusal test (TC-INIT-004), TC-ASSIGN-005, and DEC-5 review.

### Out of Scope

- Automatic UUID assignment during planning or synchronization (NG-1).
- Changes to existing `marksync.yml` content (NG-2).
- Changes to duplicate-UUID handling beyond preserving fatality (NG-3).
- Current-truth `doc/spec/**` updates — handled by `@doc-syncer` in lifecycle
  phase 7 (per PM instruction; not authored in this plan).
- Config schema, lock state, and remote synchronization behavior changes.

### Constraints

- TypeScript on Bun single-binary (ADR-0001); `bun:test` framework.
- Application tier (`src/app/*`) imports `#domain/*` only; CLI tier
  (`src/cli/*`) imports no `#domain/*`/`#infra/*` (dep-cruiser
  `check:boundaries`).
- `writeStarterConfig` and `assignUuidsFromDisk` are NOT modified — the init
  fix lives entirely in `src/cli/commands/init.ts` (gating via `existsSync`).
- EVT-1 warning text is exact (em-dash `—`, single-quoted `'marksync init'`):
  `{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`
- Phased commits (Conventional Commits); one commit per phase.

### Risks

- **RSK-1**: Existing config could still block UUID assignment. Mitigated by
  Phase 1 tests (TC-INIT-001..003) asserting byte-stability + UUID assignment
  with a real existing config. Residual: L.
- **RSK-2**: UUID-less docs could remain invisible or receive duplicate
  warnings. Mitigated by Phase 2 tests (TC-PLAN-001..004) asserting exactly one
  warning per doc, distinct paths, no entries. Residual: L.
- **RSK-3**: The fix could weaken duplicate-UUID safety. Mitigated by Phase 3
  re-verifying TC-PLAN-005 (fatal before render, 0 `renderBody` calls).
  Residual: L.
- **RSK-4 (plan-discovered)**: `TC-ASSIGN-005` and the DEC-5 test (not
  enumerated in the test plan) break or drift. Mitigated by explicit Phase 1
  modification tasks. Residual: L.

### Success Metrics

| Metric | Target |
|---|---|
| Existing-config initialization (NFR-1) | 100% of tested runs retain the existing config and assign UUIDs to eligible identity-less docs |
| Missing-config initialization | 100% of tested runs create the starter config and assign UUIDs |
| UUID-less document visibility (NFR-2) | 100% of committed discovered UUID-less docs produce exactly one warning |
| Warning text stability (NFR-3) | 100% of EVT-1 warnings match the exact text (modulo `{path}`) |
| Duplicate-UUID safety (F-4) | 100% of duplicate-UUID corpora remain fatal before render |

## Phases

### Phase 1: Fix `marksync init` to preserve existing config and assign UUIDs (F-1, F-2)

**Goal**: When `marksync.yml` already exists, `initCommand` skips config
creation and proceeds to UUID assignment; when absent, first-time behavior is
retained. Existing config bytes are untouched.

**Tasks**:

- [ ] **1.1** In `src/cli/commands/init.ts`, import `existsSync` from `node:fs`
  and `join` from `node:path`. Before calling `writeStarterConfig(dir)`, check
  `existsSync(join(dir, "marksync.yml"))`: if present, skip `writeStarterConfig`
  and go straight to `assignUuidsFromDisk(dir)`; if absent, retain the current
  create-then-assign sequence. Do NOT modify `writeStarterConfig` or
  `assignUuidsFromDisk`.
- [ ] **1.2** In `tests/unit/cli/commands/init.test.ts`, replace the
  "overwrite-refusal (OQ-TP-1)" test (line 54) with TC-INIT-001/002/003:
  pre-create a valid `marksync.yml`, assert it is preserved byte-for-byte
  (hash or snapshot comparison) AND that identity-less docs receive a valid
  UUID v7; cover (a) a single UUID-less doc, (b) ≥3 UUID-less docs with unique
  UUIDs, and (c) mixed UUID-bearing + UUID-less docs (existing UUIDs unchanged).
- [ ] **1.3** In `tests/unit/cli/commands/init.test.ts`, ensure TC-INIT-004
  (no-config path) still asserts starter-config creation + UUID assignment +
  exit 0 (existing "success → exitCode 0" test already covers this; extend if
  needed to assert the starter config round-trips via `loadConfig`).
- [ ] **1.4** In `tests/unit/cli/commands/init.test.ts`, re-purpose the DEC-5
  redaction test (line 65) onto a genuine config-validation error path (e.g.,
  an invalid existing `marksync.yml`), preserving the redaction assertions; OR
  remove it if the overwrite-refusal path it relied on no longer exists. See
  Open questions — decision needed if ambiguous.
- [ ] **1.5** In `tests/integration/identity/identity-assign.test.ts`, rewrite
  `TC-ASSIGN-005` (line 124) to assert the NEW behavior: with an existing valid
  `marksync.yml`, `initCommand` returns exit 0 with no error, the config is
  unchanged, and the identity-less `docs/a.md` receives a UUID. Rename the test
  accordingly (e.g., "existing-config init assigns UUIDs and preserves config").

**Acceptance Criteria**:

- Must: AC-F-1-1 — existing `marksync.yml` + UUID-less doc → config untouched,
  doc receives a UUID (F-1, NFR-1).
- Must: AC-F-2-1 — no `marksync.yml` + UUID-less doc → starter config created,
  doc receives a UUID (F-2).
- Should: No existing init/identity test fails except those deliberately
  rewritten in 1.2/1.4/1.5.

**Affected code areas**:

- `src/cli/commands/init.ts` (updated — `existsSync` gate around
  `writeStarterConfig`)
- `src/app/config-template.ts` (unchanged — `writeStarterConfig` keeps its
  overwrite guard; the fix bypasses it)
- `src/app/identity-assign.ts` (unchanged — already handles existing config via
  `loadConfig`)

**System docs to update**:

- none (current-truth `doc/spec/**` reconciliation deferred to `@doc-syncer`,
  lifecycle phase 7)

**Tests**:

- `bun test tests/unit/cli/commands/init.test.ts`
- `bun test tests/integration/identity/identity-assign.test.ts`

**Completion signal**: `fix(GH-74): preserve existing config during init and assign UUIDs`

---

### Phase 2: Surface UUID-less committed discovered documents as plan warnings (F-3)

**Goal**: `computePlan` collects committed discovered documents lacking
`marksync:uuid`, excludes them from `entries`, and emits one exact EVT-1 warning
per document into `Plan.warnings`.

**Tasks**:

- [ ] **2.1** In `src/app/push-flow.ts` `computePlan` step 3 (lines 160-169),
  add a `const uuidlessPaths: string[] = []` accumulator. When
  `readUuid(text)` returns `undefined`, push `path` to `uuidlessPaths` instead
  of silently dropping it (the `docsWithUuid` push only happens when a UUID is
  present).
- [ ] **2.2** Emit one EVT-1 warning per collected path into `allWarnings`
  using the exact text:
  `` `${path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync` ``
  (place the emission after discovery, before or at the start of the per-doc
  loop; ordering relative to other warnings is not load-bearing). Preserve the
  duplicate-UUID fatal gate (step 4, lines 171-175) unchanged.
- [ ] **2.3** Remove the now-unreachable `if (!uuid) continue` guard
  (lines 204-208) — `docsWithUuid` is guaranteed to carry only UUID-bearing
  docs. (See Open questions; preferred action.)
- [ ] **2.4** Add unit tests in `tests/unit/app/compute-plan.test.ts`:
  TC-PLAN-001 (single UUID-less doc → exactly one warning with exact EVT-1 text
  and substituted path, no entry); TC-PLAN-002 (≥3 UUID-less docs → one warning
  each, distinct paths, warning count == doc count); TC-PLAN-003 (mixed
  UUID-less + UUID-bearing → warnings only for UUID-less, entries only for
  UUID-bearing, no overlap, complete partition); TC-PLAN-004 (all UUID-less →
  empty `entries`, one warning per doc). Use exact string matching (not
  substring/regex) for the EVT-1 text.

**Acceptance Criteria**:

- Must: AC-F-3-1 — each UUID-less committed discovered doc has no plan entry
  and produces exactly one EVT-1 warning with its path substituted (F-3, EVT-1,
  DM-1, NFR-2, NFR-3).
- Must: AC-F-4-1 — duplicate UUIDs remain fatal before render/write (F-4);
  TC-PLAN-005 passes unchanged.
- Should: Existing compute-plan tests (UUID-bearing fixtures) remain green; no
  existing plan test asserts a warning count incompatible with the new
  UUID-less warnings.

**Affected code areas**:

- `src/app/push-flow.ts` (updated — `computePlan` step 3 `uuidlessPaths`
  accumulation + EVT-1 warning emission; dead guard removal)

**System docs to update**:

- none (deferred to `@doc-syncer`, lifecycle phase 7)

**Tests**:

- `bun test tests/unit/app/compute-plan.test.ts`

**Completion signal**: `fix(GH-74): warn on UUID-less committed discovered documents in plan`

---

### Phase 3: Finalize and Release — regression gate, version bump, spec reconciliation

**Goal**: Confirm the full quality gate is green, the duplicate-UUID safeguard
is intact, bump the patch version per repo conventions, and hand off
current-truth doc reconciliation to `@doc-syncer`.

**Tasks**:

- [ ] **3.1** Run the full quality gate: `bun run check` (lint + format:check +
  typecheck + test + check:boundaries/dep-cruise). Resolve any failure before
  proceeding.
- [ ] **3.2** Verify TC-PLAN-005 (duplicate-UUID corpus → `err(DuplicateUuid)`
  before any `renderBody` call; assert 0 `renderBody` calls) still passes
  unchanged — the fixes must not weaken F-4 / INV-SAFE-3.
- [ ] **3.3** Verify TC-REG-001: all existing tests pass except those
  deliberately rewritten in Phases 1-2; no unexpected failures. Cross-check
  that no integration plan test (e.g., `mermaid-render`, `409-retry-policy`,
  `concurrency-*`) asserts a `Plan.warnings` count incompatible with the new
  UUID-less warnings.
- [ ] **3.4** Version bump per repo conventions (patch): `package.json`
  `0.4.1` → `0.4.2` (no CHANGELOG/changeset tooling in this repo).
- [ ] **3.5** Spec reconciliation: confirm `chg-GH-74-spec.md` reflects
  delivered behavior. Current-truth `doc/spec/**` reconciliation (CLI init
  overwrite-protection wording; safe-publish UUID-less omission → warning) is
  delegated to `@doc-syncer` in lifecycle phase 7 — not authored here.

**Acceptance Criteria**:

- Must: AC-F-1-2 — all existing tests pass and the new coverage demonstrates
  both fixes (F-1, F-2, F-3).
- Must: `bun run check` exits 0.
- Must: `package.json` version bumped to `0.4.2`.

**Affected code areas**:

- `package.json` (updated — patch version bump)

**System docs to update**:

- none in this phase; `doc/spec/**` reconciliation delegated to `@doc-syncer`
  (lifecycle phase 7)

**Tests**:

- `bun run check`

**Completion signal**: `chore(GH-74): bump version to 0.4.2 and finalize`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC |
|-------|----------|--------|----|
| TC-INIT-001 | Init with existing config preserves file and assigns UUID | 1 | AC-F-1-1 |
| TC-INIT-002 | Init with existing config assigns UUID to multiple identity-less docs | 1 | AC-F-1-1 |
| TC-INIT-003 | Init with existing config and mixed UUID-bearing / UUID-less docs | 1 | AC-F-1-1 |
| TC-INIT-004 | Init with no config creates starter config and assigns UUID | 1 | AC-F-2-1 |
| TC-PLAN-001 | Planning emits one exact warning per single UUID-less committed doc | 2 | AC-F-3-1 |
| TC-PLAN-002 | Planning emits one exact warning per UUID-less doc among multiple docs | 2 | AC-F-3-1 |
| TC-PLAN-003 | Planning warns on UUID-less docs while including UUID-bearing docs in entries | 2 | AC-F-3-1 |
| TC-PLAN-004 | Planning excludes UUID-less docs from plan entries | 2 | AC-F-3-1 |
| TC-PLAN-005 | Planning fails before render or write when duplicate UUIDs detected | 2 (impl), 3 (verify) | AC-F-4-1 |
| TC-ASSIGN-005 (rewrite) | Existing-config init assigns UUIDs and preserves config | 1 | AC-F-1-1 |
| TC-REG-001 | All existing tests pass with fixes applied | 3 | AC-F-1-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-74-spec.md | Spec |
| Test plan | ./chg-GH-74-test-plan.md | Test Plan |
| Implementation plan | ./chg-GH-74-plan.md | Plan (this file) |
| Init command source | src/cli/commands/init.ts | Code (updated) |
| Config template source | src/app/config-template.ts | Code (unchanged) |
| Identity assign source | src/app/identity-assign.ts | Code (unchanged) |
| Push-flow source | src/app/push-flow.ts | Code (updated) |
| Init unit tests | tests/unit/cli/commands/init.test.ts | Test (updated) |
| Identity-assign integration tests | tests/integration/identity/identity-assign.test.ts | Test (updated) |
| computePlan unit tests | tests/unit/app/compute-plan.test.ts | Test (updated) |
| Package manifest | package.json | Config (version bump) |
| ADR-0006 | doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md | Reference |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | plan-writer (@plan-writer) | Initial plan for GH-74; 3 phases covering F-1/F-2 (init), F-3 (plan warnings), and finalize/release. Flagged upstream gap: TC-ASSIGN-005 + DEC-5 test not enumerated in test plan. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| (Populated during execution) | | | | | |
