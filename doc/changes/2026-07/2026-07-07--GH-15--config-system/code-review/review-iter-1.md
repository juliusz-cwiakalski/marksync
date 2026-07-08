# Review Iteration 1 — GH-15 Config system

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Reviewer** | `@reviewer` (reviewer agent, local mode) |
| **Phase** | 8 (`review_fix`) |
| **Diff** | `origin/main...HEAD` (48 files, +5923 / −24) |
| **Verdict** | ✅ **PASS** |
| **Findings** | 0 blocking · 0 major · 2 minor · 2 nit |
| **Quality gate** | `bun run check` **exit 0** — 117 tests PASS / 0 fail, `depcruise` 0 violations |
| **Next step** | PROCEED → Phase 10 (`dod_check`) / PR. No remediation phase appended. |

## AC / Decision rollup

- **9/9 ACs** (AC-F3-1, AC-F7-1, AC-F3-2, AC-F4-1, AC-F4-2, AC-F6-1, AC-F5-1,
  AC-F7-2, AC-F8-1) — all implemented, each with ≥1 passing test.
- **8/8 story deliverables** present (schema, types, loader+selection,
  front-matter overrides, init skeleton, hierarchy mirroring, ConfigError,
  marksync.yml.example).
- **5/5 binding decisions** (DEC-1..DEC-5) honoured.
- **Tier boundaries** clean — `depcruise` 0 violations; no `ajv` import in
  `src/domain/` (NFR-3).
- **Strict TS** clean — no `any`, no `@ts-ignore`, `import type` discipline,
  `noUncheckedIndexedAccess` respected.
- **Docs reconciled** (commit `aa036c2`) to the 13-kind union + implemented
  contract — feature-cli, ubiquitous-language, glossary, typescript.md.

## Key themes

- Loader is genuinely pure (`selectFiles(config, paths: readonly string[])`,
  purity proven by non-existent-path test — no Git/tree I/O).
- `ConfigError`/`InvalidConfig` extends **both** the union and
  `assertNeverMarkSyncError` in one change (NFR-3 / RSK-2 — `never`-check intact).
- AI-readable `humanMessage` carries field path + expected-vs-actual + suggested
  fix for every invalid class; `commit-by-commit` gets a dedicated "deferred"
  note (DEC-2 / ADR-0010 C-5).
- Zero-dep hand-rolled glob matcher (`src/shared/glob.ts`) preserves the NFR-7
  `yaml` + `ajv` runtime-dep envelope — no `picomatch`, no allowed-list extension.
- Tests exercise the **real** `yaml` parser + `ajv` validator (no over-mocking).

## Findings (all non-blocking)

| ID | Sev | File | Title |
|----|-----|------|-------|
| M1 | minor | `.ai/rules/typescript.md:424` | `yaml` not added to the allowed-dependency table (spec/plan assert it is "on the list") |
| M2 | minor | `chg-GH-15-plan.md:688` | Plan log records doc reconciliation (9.3) as skipped/deferred but commit `aa036c2` did it |
| M3 | nit | `src/app/config-template.ts:27` | Redundant `Result` type-only alias import |
| M4 | nit | `src/app/config-template.ts:119` | A few defensive/invariant branches uncovered (acceptable per testing strategy) |

No remediation phase required. M1/M2 are doc/plan-consistency tidy-ups; M3/M4
are optional nits. Full detail in `../review.md`.
