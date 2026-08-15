---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-104-osv-red-fast-uri-js-yaml
status: Proposed
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, security, dependencies, supply-chain, ci, bug]
links:
  change_spec: ./chg-GH-104-spec.md
  test_plan: ./chg-GH-104-test-plan.md
  pm_notes: ./chg-GH-104-pm-notes.yaml
summary: "Lockfile-only security fix: the blocking osv-scan CI job fails on every PR because bun.lock pins two CVSS 7.5 packages — fast-uri 3.1.4 (transitive via ajv, runtime chain) and js-yaml 4.3.0 (transitive via commitlint/cosmiconfig, dev chain). Fix: bump the fast-uri override ^3.1.4 → ^3.1.5, add a js-yaml override ^4.3.1 (DEC-1 — overrides, not direct deps), regenerate bun.lock, and bump the version 0.8.1 → 0.8.2 (DEC-2). Zero src/ change (NFR-3)."
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-104: fix: osv red — bump fast-uri to 3.1.5 and js-yaml to 4.3.1 (both CVSS 7.5)

## Context and Goals

The `osv-scan` CI job (NFR-SEC-4, blocking at MS-0002) fails on **every** PR because the committed `bun.lock` resolves two packages with published CVSS 7.5 advisories (scan 2026-08-14): **fast-uri 3.1.4** (GHSA-7p8r-x3mc-p8w7, transitive via ajv in the runtime chain, ships in the binary) and **js-yaml 4.3.0** (GHSA-5p4m-2wfm-xmqj, transitive via `@commitlint/load` → cosmiconfig in the dev chain, never imported in `src/`). Both have patch-level fixes. This plan delivers the **lockfile-only remediation** and nothing else.

**Key goals (from spec §4):**

- **G-1**: `bun.lock` resolves fast-uri ≥ 3.1.5 (AC-F1-1).
- **G-2**: `bun.lock` resolves js-yaml ≥ 4.3.1 via the override, not a direct dependency (AC-F2-1, DEC-1).
- **G-3**: The CI `osv-scan` job is green on this change's PR — observed at PR creation (lifecycle phase 11), CI-only (`osv-scanner` is not installed locally; test plan §6) (AC-F3-1, TC-DEPS-005).
- **G-4**: Zero runtime behavior change — zero `src/` and `tests/` diffs; both packages stay transitive-only (NFR-3).
- **G-5**: Version 0.8.1 → 0.8.2 (patch) per the GH-88 shipped-fix precedent, so the next tagged release + SBOM map 0.8.2 → the patched dependency set (AC-DEC2-1, DEC-2).

**Verified repository facts the coder relies on (checked 2026-08-15 on this branch):**

- `bun.lock:254` pins `fast-uri@3.1.4`; `bun.lock:316` pins `js-yaml@4.3.0`. The requirement edges at `bun.lock:176` (ajv → `fast-uri ^3.0.1`) and `bun.lock:216` (cosmiconfig → `js-yaml ^4.1.0`) are **consumer ranges and stay unchanged** by an override — do not expect them to move.
- `bun.lock:34-36` embeds an **echo of the manifest `overrides`** — the regenerated lockfile diff legitimately includes this echo (fast-uri line modified + js-yaml line added).
- `bun.lock` does **not** embed the package `version` field (the workspaces entry carries name/dependencies only) — the Phase 2 version bump requires **no second lockfile regeneration**. Precedent: GH-88 bumped 0.8.0 → 0.8.1 with frozen-lockfile CI green and no lockfile change.
- `src/cli/commands/router.ts:38` reads `CLI_VERSION = pkg.version` **dynamically** — the version bump needs no `src/` edit; NFR-3 holds by construction.
- CI runs `bun install --frozen-lockfile` in every job on Bun **1.2.23** (`engines.bun`); the delivery machine runs Bun **1.3.14** (R-TST-1 skew risk — mitigations below).
- `package.json` uses tab indentation (biome); the `overrides` block is at lines 63-65.

**Open questions**: none — spec §14 is empty; DEC-1 (override mechanism), DEC-2 (patch bump), and D-TST-1 (no permanent lockfile test) are all pre-decided. No `@decision-advisor` consult is anticipated; if an abort criterion fires, the plan says STOP and report to PM rather than decide in-flight.

## Scope

### In Scope

- `package.json` `overrides`: bump `fast-uri` `^3.1.4` → `^3.1.5` (spec §7.1, F-1, DM-1).
- `package.json` `overrides`: add `js-yaml` `^4.3.1` — same pattern as fast-uri, NOT a direct dependency (spec §7.1, F-2, DM-1, DEC-1).
- `package.json` `version`: 0.8.1 → 0.8.2, patch (spec §8.3 DM-3, DEC-2).
- Regenerate `bun.lock` via `bun install`; verify the two resolved pins and manifest/lockfile consistency (DM-2, NFR-4).
- Verification only (no new tests — D-TST-1): pin inspection, surgical diff audit, frozen-lockfile install, full `bun run check`, version-reference check (TC-DEPS-001..004, TC-DEPS-006).

### Out of Scope

- [OUT] Any `src/` or `tests/` change — zero diffs by design (spec NG-1, NFR-3). The suite runs unchanged as the regression net.
- [OUT] Adding fast-uri or js-yaml to `dependencies`/`devDependencies` (spec NG-2, DEC-1); the direct YAML library `yaml ^2.9.0` is untouched.
- [OUT] Any other dependency change, mass refresh, or toolchain upgrade (spec NG-3).
- [OUT] CI workflow or osv-scanner configuration changes (spec NG-4) — the gate is the beneficiary, not the subject.
- [OUT] Security-policy/baseline doc changes (spec NG-5); frozen history (`doc/changes/**` prior documents, TDR-0010) is cited, never edited.
- [OUT] Current-truth doc sync — expected **no-op** (dependency versions are not tracked in current-truth docs; pm-notes `doc_risks`); owned by `@doc-syncer` in lifecycle phase 7 regardless.

### Constraints

- **Lockfile-only invariant (NFR-3):** `git diff main --stat -- src/ tests/` must be empty at every commit boundary. If any `src/`/`tests/` edit appears necessary, that is an abort condition (A-5), not a task.
- **No new direct dependencies (NG-2):** the only manifest `dependencies`/`devDependencies` change allowed is none.
- **Bun version context (R-TST-1):** lockfile is regenerated locally with Bun 1.3.14 but consumed by CI's pinned 1.2.23 (`lockfileVersion: 1` text format). The surgical diff audit (Task 1.4) plus local `bun install --frozen-lockfile` (Task 1.5) are the skew guards; CI fails loudly on first push if skew slips through.
- **Conventional Commits (TDR-0008):** commitlint + husky enforce the format; completion signals below are commit-message-shaped accordingly. The delivery commits themselves exercise the js-yaml-patched commitlint chain (RSK-2 evidence).
- **Code style (.ai/rules/typescript.md):** no code is written; the only style surface is `package.json` formatting (tabs, biome) — validated by `bun run format:check` inside the gate.
- **Pre-existing findings are not scoped in (RSK-3):** if regeneration surfaces an unrelated scanner finding or pin drift, it is investigated/reported — never silently absorbed.

### Risks

- **RSK-1** (spec): fast-uri 3.1.5 subtly changes URI-normalization behavior inside the ajv runtime chain. Mitigated by the full existing suite (~1310 tests across all tiers, including ajv validation paths) running in `bun run check` before each commit. Residual: L.
- **RSK-2** (spec): js-yaml 4.3.1 subtly changes commitlint config loading. Mitigated: dev-chain only, never in `src/`; commitlint runs on every delivery commit (husky hook) — the delivery itself is the test. Residual: L.
- **RSK-3** (spec) / **R-TST-2** (test plan): lockfile regeneration drifts beyond the two target pins. Mitigated by the surgical diff audit (Task 1.4) with abort criterion A-2. Residual: L.
- **R-TST-1** (test plan): local Bun 1.3.14 produces a lockfile the CI-pinned 1.2.23 rejects under `--frozen-lockfile`. Mitigated by local frozen install (Task 1.5) + the A-2/A-3 retry path (align Bun to 1.2.x and regenerate). Residual: L.
- **RSK-P1** (plan): fast-uri@3.1.5 or js-yaml@4.3.1 is not actually resolvable from the npm registry (spec §12 assumption breaks). Mitigated by abort criterion A-1 — stop and report; never widen ranges or substitute versions in-flight.

### Abort and Rollback Criteria

The coder runs `/run-plan GH-104 execute all remaining phases no review` — these criteria are the self-sufficiency guardrails. On any trigger: **STOP, leave the tree clean, report to PM** with the command output. Do not improvise a fix.

- **A-1 — Unresolvable target version:** `bun install` fails to resolve `fast-uri@^3.1.5` or `js-yaml@^4.3.1` (unpublished, pulled, registry error). STOP. Do not widen the range, pin a different version, or add direct deps — that changes the security posture and is a PM/`@decision-advisor` call.
- **A-2 — Non-surgical lockfile diff:** the `bun.lock` diff shows anything beyond the allowed set (overrides echo, the fast-uri and js-yaml package entries incl. their integrity hashes/entry-internal descriptors) — e.g., other pins moving, `lockfileVersion`/`configVersion` changing, or wholesale reformatting (Bun 1.3.14 vs 1.2.23 format skew). STOP — do not commit a noisy lockfile. Retry once: `git restore bun.lock`, align local Bun to the 1.2.x line (CI pin / `engines.bun`), regenerate. If skew persists, report to PM.
- **A-3 — Frozen-lockfile failure:** `bun install --frozen-lockfile` fails after regeneration. Same retry path as A-2 (align Bun, regenerate); if it persists, STOP and report — CI would fail identically on every job.
- **A-4 — Quality gate failure:** any stage of `bun run check` fails (lint, format, typecheck, tests, boundaries). STOP and report the failing stage/tests — this is the RSK-1 regression signal. Do not merge a red gate, do not skip/weaken tests. Partial-remediation options (e.g., hold one override) are PM decisions, not coder decisions.
- **A-5 — Unexpected scope:** anything suggesting a `src/`/`tests/` edit, a CI workflow change, or a third vulnerable pin surfacing. STOP and report; never silently scope in (spec §7.2).

**Rollback (clean, at any point):** before any commit — `git restore package.json bun.lock && bun install` restores the pre-change resolution exactly. After the Phase 1 commit — `git revert <phase-1-commit>` is the clean inverse (the commit touches only `package.json` + `bun.lock`). No migrations, config, or persisted state are involved.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| osv-scanner findings against the lockfile after this change | 0 | NFR-1 / AC-F3-1 |
| `bun.lock` fast-uri resolved pin | ≥ 3.1.5 | AC-F1-1 / TC-DEPS-001 |
| `bun.lock` js-yaml resolved pin | ≥ 4.3.1 | AC-F2-1 / TC-DEPS-002 |
| Failures in `bun run check` (~1310 tests) | 0 | NFR-2 / AC-NFR2-1 / TC-DEPS-003 |
| `src/` and `tests/` file changes | 0 | NFR-3 / TC-DEPS-004 |
| New direct dependencies | 0 | NG-2 / TC-DEPS-004 |
| `bun install --frozen-lockfile` (local) | exit 0 | NFR-4 / TC-DEPS-004 |
| Package version | 0.8.2 | AC-DEC2-1 / TC-DEPS-006 |

## Phases

> Two phases — the change is two manifest fields, one regenerated lockfile, and verification. No scaffolding, integration, or doc phase applies (skip/merge per plan-writer contract). Change docs (spec/test-plan/pm-notes/plan) are already committed by the orchestrator; the coder's commits touch only `package.json` + `bun.lock`.

### Phase 1: Surgical overrides fix + lockfile regeneration + verification

**Goal**: Clear both CVSS 7.5 advisories from the resolved dependency graph — apply the two override edits, regenerate `bun.lock`, and prove the result surgical, consistent, and behavior-neutral before committing. Implements F-1, F-2, DM-1, DM-2; sets up AC-F1-1, AC-F2-1.

**Tasks**:

- [ ] **1.1** Edit `package.json` `overrides` block (lines 63-65, tab indentation): change `"fast-uri": "^3.1.4"` → `"fast-uri": "^3.1.5",` and add the line `"js-yaml": "^4.3.1"` beneath it. The block becomes:

  ```json
  "overrides": {
  	"fast-uri": "^3.1.5",
  	"js-yaml": "^4.3.1"
  }
  ```

  No other manifest change in this phase — the version bump is Phase 2 (keeps each commit single-purpose). (F-1, F-2, DM-1, DEC-1)
- [ ] **1.2** Regenerate the lockfile: `bun install`. Expected: exit 0; resolves fast-uri 3.1.5 (or higher within `^3.1.5`) and js-yaml 4.3.1. Failure to resolve → **abort A-1**.
- [ ] **1.3** Pin verification (TC-DEPS-001, TC-DEPS-002): run `grep -n "fast-uri\|js-yaml" bun.lock`. Assert: the resolved pin entries (previously lines 254/316) read `fast-uri@3.1.5` and `js-yaml@4.3.1`; the overrides echo (previously lines 34-36) shows both entries; the consumer requirement edges (previously lines 176/216, `^3.0.1` / `^4.1.0`) are **unchanged** — expected, they are consumer ranges, not resolutions. Then assert `package.json` has **no** fast-uri or js-yaml entry in `dependencies`/`devDependencies` (transitive-only, AC-F1-1/AC-F2-1) and `yaml` remains `^2.9.0` untouched.
- [ ] **1.4** Surgical diff audit (TC-DEPS-004 steps 1-2; RSK-3, R-TST-2): run `git diff -- package.json bun.lock`. Allowed diff surface — `package.json`: exactly the override lines from Task 1.1. `bun.lock`: the overrides echo (fast-uri line modified + js-yaml line added) plus the two package entries (version string + integrity hash; entry-internal dependency descriptors may differ if the patch release changed them — still confined to those two entries). **Anything else** (other pins, `lockfileVersion`/`configVersion`, reformatting) → **abort A-2**.
- [ ] **1.5** Manifest/lockfile consistency (TC-DEPS-004 step 3; NFR-4, R-TST-1): run `bun install --frozen-lockfile`. Assert exit 0. Failure → **abort A-3**.
- [ ] **1.6** Full quality gate (TC-DEPS-003; AC-NFR2-1, RSK-1): run `bun run check` (lint + format:check + typecheck + `bun test` + check:boundaries). Assert exit 0, 0 test failures (~1310 tests). This proves the new resolutions changed no behavior at this commit boundary. Failure → **abort A-4**.
- [ ] **1.7** Zero runtime diff at boundary (NFR-3): run `git diff main --stat -- src/ tests/`. Assert empty.
- [ ] **1.8** Commit exactly `package.json` + `bun.lock` (Conventional Commits, TDR-0008). The commit-message hook itself exercises the js-yaml-patched commitlint chain (RSK-2).

**Acceptance Criteria**:

- Must: `bun.lock` pins fast-uri ≥ 3.1.5 and js-yaml ≥ 4.3.1; both remain transitive-only (AC-F1-1, AC-F2-1, TC-DEPS-001/002).
- Must: the diff is surgical — overrides echo + two package entries + the two manifest override lines, nothing else (TC-DEPS-004, RSK-3).
- Must: `bun install --frozen-lockfile` exit 0 (NFR-4).
- Must: `bun run check` green, 0 failures (AC-NFR2-1, TC-DEPS-003).
- Must: zero `src/`/`tests/` diffs (NFR-3).

**Files and modules**:

- Code areas: `package.json` (updated — `overrides` block only in this phase); `bun.lock` (regenerated). Nothing else.
- System docs: none (dependency versions are not tracked in current-truth docs — pm-notes `doc_risks`; lifecycle phase 7 is an expected no-op reconciliation).

**Tests**:

- TC-DEPS-001, TC-DEPS-002 (one-shot pin inspection), TC-DEPS-003 (pre-commit gate run), TC-DEPS-004 steps 1-4 (diff audit + frozen install + no-new-deps check).

**Completion signal**: `fix(GH-104): pin fast-uri 3.1.5 and js-yaml 4.3.1 via overrides (CVSS 7.5 osv)`

---

### Phase 2: Finalize and Release — version bump 0.8.2, final gate, spec reconciliation

**Goal**: Ship-readiness per the final-phase contract — patch version bump (DEC-2), authoritative full-gate run on the final tree, final change-set audit, spec reconciliation, and release handoff. Implements DM-3; ratifies all ACs.

**Tasks**:

- [ ] **2.1** Bump `package.json` `"version"`: `"0.8.1"` → `"0.8.2"` (line 3; DM-3, DEC-2). **No `src/` edit** — `CLI_VERSION` in `src/cli/commands/router.ts:38` reads `pkg.version` dynamically (verified). **No lockfile regeneration needed** — `bun.lock` does not embed the version field (GH-88 precedent: version-only bump, frozen-lockfile CI green). After editing, `git status` must show only `package.json` modified; if `bun.lock` unexpectedly appears changed → investigate per **abort A-2**.
- [ ] **2.2** Version-reference check (TC-DEPS-006; AC-DEC2-1): assert the version field reads `0.8.2`. Confirm no doc updates are required: the README `--version` mention is illustrative and TDR-0010's 0.8.x mention is frozen history — **neither is edited** (spec §7.1 verified this at specification time; re-confirm by inspection, no grep-and-sweep edits).
- [ ] **2.3** Consistency re-check (NFR-4): run `bun install --frozen-lockfile`. Assert exit 0 — proves the version-field-only edit did not desync manifest and lockfile.
- [ ] **2.4** Final full gate (TC-DEPS-003; AC-NFR2-1): run `bun run check` on the final tree. Assert exit 0, 0 failures.
- [ ] **2.5** Final change-set audit (TC-DEPS-004): run `git diff main --stat`. Assert the changed-file set is exactly: `package.json`, `bun.lock`, plus this change's doc artifacts (`doc/changes/2026-08/2026-08-15--GH-104--osv-red-fast-uri-js-yaml/**`). Assert `git diff main --stat -- src/ tests/` is empty (NFR-3 final).
- [ ] **2.6** Commit `package.json` only.
- [ ] **2.7** Spec reconciliation sign-off: re-read spec §17 AC-by-AC against the delivered state — AC-F1-1 (Task 1.3), AC-F2-1 (Task 1.3), AC-NFR2-1 (Tasks 1.6/2.4), AC-DEC2-1 (Task 2.2), AC-F3-1 (**deferred to the PR**: observe the `Vulnerability scan (osv-scanner)` check green with 0 findings at PR creation, lifecycle phase 11 / TC-DEPS-005 — CI is the authoritative gate; assert green before merge as part of DoD). Record results in this plan's Execution Log and the test plan's Test Execution Log (§10).
- [ ] **2.8** Release handoff notes (no action beyond recording): release-note line per spec §18 — "fix(deps): clear CVSS 7.5 osv findings — fast-uri 3.1.5, js-yaml 4.3.1 (lockfile-only)". The next tag-triggered release (GH-32 pipeline) ships 0.8.2 binaries embedding the patched fast-uri with a matching SBOM. After merge, other open PRs rebase/re-run to pick up the clean lockfile.

**Acceptance Criteria**:

- Must: version reads `0.8.2`; no `src/` change was needed or made (AC-DEC2-1, NFR-3).
- Must: `bun install --frozen-lockfile` and `bun run check` green on the final tree (NFR-4, AC-NFR2-1, TC-DEPS-003).
- Must: final diff = `package.json` + `bun.lock` + change docs, zero `src/`/`tests/` diffs (NFR-3, TC-DEPS-004).
- Must: all spec ACs signed off, with AC-F3-1 explicitly tracked to the PR's osv-scan observation before merge (AC-F3-1, TC-DEPS-005).
- Should: Execution Log and test-plan Test Execution Log populated for handoff to phases 7-11.

**Files and modules**:

- Code areas: `package.json` (version field only).
- System docs: none (lifecycle phase 7 `system_spec_update` is an expected no-op — no current-truth doc tracks dependency versions; `@doc-syncer` reconciles).

**Tests**:

- TC-DEPS-003 (final authoritative run), TC-DEPS-004 (final change-set audit), TC-DEPS-006 (version + stale-reference check), TC-DEPS-005 (observed on the PR at lifecycle phase 11 — pre-merge assertion, not a coder task).

**Completion signal**: `chore(release): bump version to 0.8.2 (patch) for GH-104 osv dependency fix`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-DEPS-001 | fast-uri resolved pin ≥ 3.1.5, transitive-only (one-shot inspection) | 1 (Task 1.3) | AC-F1-1, NFR-1 |
| TC-DEPS-002 | js-yaml resolved pin ≥ 4.3.1 via override, transitive-only; `yaml ^2.9.0` untouched | 1 (Task 1.3) | AC-F2-1, DEC-1, NFR-1 |
| TC-DEPS-003 | Full local gate `bun run check` green, 0 failures (~1310 tests) | 1 (Task 1.6), 2 (Task 2.4) | AC-NFR2-1, NFR-2 |
| TC-DEPS-004 | Change-diff audit: zero src/tests diffs, no resolution drift, frozen-lockfile consistent, no new direct deps | 1 (Tasks 1.4/1.5/1.7), 2 (Task 2.5) | NFR-3, NFR-4 |
| TC-DEPS-005 | CI `osv-scan` job green with 0 findings on this PR | PR (lifecycle phase 11; asserted pre-merge, Task 2.7) | AC-F3-1, NFR-1 |
| TC-DEPS-006 | Package version 0.8.2; no stale version references | 2 (Task 2.2) | AC-DEC2-1, DM-3 |

**AC coverage check (spec §17):** AC-F1-1 → TC-DEPS-001, TC-DEPS-004, TC-DEPS-005 · AC-F2-1 → TC-DEPS-002, TC-DEPS-004, TC-DEPS-005 · AC-F3-1 → TC-DEPS-005 · AC-NFR2-1 → TC-DEPS-003 · AC-DEC2-1 → TC-DEPS-006. **All ACs covered** (mirrors test plan §3.1 — all "Covered").

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-104-spec.md | Spec |
| Test plan | ./chg-GH-104-test-plan.md | Test Plan |
| PM notes (DEC-1 provenance, lockfile evidence lines 254/316) | ./chg-GH-104-pm-notes.yaml | Notes |
| Dependency manifest (overrides + version) | `package.json` | Code (updated — Phases 1-2) |
| Lockfile (regenerated pins) | `bun.lock` | Code (updated — Phase 1) |
| Blocking vulnerability gate (unchanged, beneficiary) | `.github/workflows/ci.yml` → `osv-scan` job (~line 357) | CI (unchanged) |
| Frozen-lockfile CI checks (unchanged) | `.github/workflows/ci.yml` (+ `run-e2e.yml`, `release.yml`), Bun pin 1.2.23 | CI (unchanged) |
| Security baseline — NFR-SEC-4 blocking posture | `doc/guides/security-baseline.md` | Reference (unchanged) |
| Version-bump precedent (0.8.0 → 0.8.1, manifest-only) | `doc/changes/2026-07/2026-07-26--GH-88--doctor-credential-v1-endpoint/` (PR #89) | History (cited, not edited) |
| Conventional Commits enforcement | `doc/decisions/TDR-0008-conventional-commits-enforcement.md` | Decision (unchanged) |
| CLI version surface (dynamic read — no edit needed) | `src/cli/commands/router.ts:38` (`CLI_VERSION = pkg.version`) | Code (unchanged) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-104) | Initial plan. 2 phases (small-change merge per contract — no scaffolding/integration/doc phases apply): (1) surgical overrides fix + lockfile regeneration + verification (pins, diff audit, frozen install, pre-commit gate); (2) finalize and release — version 0.8.2, final gate, change-set audit, spec reconciliation with AC-F3-1 tracked to the PR's osv-scan observation. Verified load-bearing facts: bun.lock pins at lines 254/316; overrides echo at lines 34-36; consumer range edges at 176/216 unchanged by overrides; bun.lock does not embed the version field (GH-88 precedent — no second regen); `CLI_VERSION` reads `pkg.version` dynamically (bump needs no src/ edit). Explicit abort criteria A-1..A-5 (unresolvable version, non-surgical diff/Bun skew, frozen-lockfile failure, gate failure, unexpected scope) + clean rollback (`git restore package.json bun.lock` / `git revert`). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| - | Pending | - | - | - | Populated during delivery (lifecycle phase 6) |
