---
id: MS2-E2-S1
title: "scaffolding"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: 2d
gh_issue: GH-14
feature_spec: ""
decisions: [TDR-0005, TDR-0006, TDR-0008, ADR-0001]
dependencies: { blocks: [MS2-E2-S2, MS2-E2-S3, MS2-E2-S4, MS2-E3], blocked_by: [] }
cross_cutting: [OPEN-Q9]
---

# MS2-E2-S1 — Project scaffolding

## Goal
Stand up the TypeScript+Bun project scaffolding with strict tooling, the ports-and-adapters module skeleton, the shared `Result<T,E>`/`MarkSyncError` primitives, and — critically — **remove the CI `continue-on-error` guards (OPEN-Q9)** so CI becomes binding.

## Background
This is the **first** implementation story; it blocks all of E2/E3/E5-S1. Until CI guards are removed (OPEN-Q9), every subsequent story's CI signal is informational only. The blueprint (`doc/.../.ai/local/ceo/ms-0002-blueprint.md` §1) defines the target `src/` tree; this story creates the empty/ skeleton version of it plus all tooling config.

## Detailed scope (deliverables)
1. **`package.json`** — `"type":"module"`, `"exports"`, `"imports"` aliases (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`), scripts: `lint`, `format`, `format:check`, `typecheck`, `test`, `test:bdd`, `check`, `check:boundaries`. Deps: none yet (foundational deps land in the stories that use them). Pin Bun in `package.json#engines`/CI.
2. **`tsconfig.json`** — exactly the strict config from `.ai/rules/typescript.md` §"TypeScript configuration (target)" (`strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUncheckedSideEffectImports`, `types:["bun"]`). `include:["src/**/*.ts"]`, `exclude:["node_modules","dist","tests"]`.
3. **`bunfig.toml`** — `[test] root="tests"`, `preload=["./tests/mermaid.preload.ts"]` (create a stub preload that's a no-op for now; E4-S1 populates it), coverage thresholds.
4. **Biome** (`biome.json`) — lint + format config (TDR-0005). Wire `lint`/`format` scripts.
5. **dependency-cruiser** (`.dependency-cruiser.cjs`) — the 4 tier rules from `.ai/rules/typescript.md` (domain↛infra, domain↛app, cli↛domain, cli↛infra). Wire `check:boundaries`.
6. **commitlint + husky** (TDR-0008) — `commitlint.config.js` (Conventional Commits), `.husky/commit-msg` hook. Add `@commitlint/{cli,config-conventional}`, `husky`.
7. **Module skeleton** — create the empty tier directories with barrel files where natural: `src/cli/{commands,output}/`, `src/app/`, `src/domain/{identity,config,binding,state,hierarchy,markdown,render,assets,mermaid,git,target}/`, `src/infra/{git,mermaid,lock,push,confluence}/`, `src/shared/`. Add `src/domain/result.ts` and `src/domain/errors.ts` (the shared primitives from blueprint §2 — other stories depend on these existing).
8. **`src/cli/index.ts`** — a trivial entrypoint that prints `marksync 0.0.0` so there is SOMETHING to compile/run.
9. **CI unguard (OPEN-Q9)** — edit `.github/workflows/ci.yml`: remove all `continue-on-error: true` guards so lint/typecheck/test/dep-cruiser/audit/link-check are binding. Keep BDD and E2E as separate gates (BDD runs in the fast loop per testing-strategy §"CI wiring"; E2E remains label/scheduled).
10. **`tests/`** — create the tier directories (`unit/`, `integration/`, `golden/`, `bdd/`, `e2e/`) + a trivial passing smoke test so `bun test` is green.
11. **`.gitignore`** additions: `dist/`, `coverage/`, `.marksync/`, `*.tsbuildinfo`.
12. **README** — minimal "under construction" project section is acceptable; full README is out of scope.

## Technical approach
- Use `"imports"` field (NOT tsconfig `paths`) for internal aliases per typescript.md (runtime-respected, works under `bun build --compile`).
- `Result<T,E>` + `MarkSyncError` are the ONLY domain primitives created here; all other domain logic is later stories. Keep `errors.ts` as the exhaustive union from blueprint §2 (other stories EXTEND it via PR — note the `never` exhaustive-check pattern).
- Biome config: enable recommended rules; do NOT add bespoke rules yet.
- CI: keep the existing job structure but flip guards off; ensure `bun install --frozen-lockfile` works (commit `bun.lock`).

## Interface contracts (what other stories consume)
- `Result<T,E>` from `#domain/result` — every domain function signature.
- `MarkSyncError` from `#domain/errors` — the typed error union (extensible).
- The tier directory layout + dependency-cruiser rules (every later story must place code by blueprint §1 rules).
- The npm scripts (`check`, `test`, `test:bdd`, `lint`, `typecheck`) consumed by CI and by `@runner`.

## Acceptance criteria (testable)
- [ ] `bun install --frozen-lockfile` succeeds.
- [ ] `bun run lint` passes (Biome, zero errors).
- [ ] `bun run typecheck` passes (strict tsconfig).
- [ ] `bun test` passes (smoke test green).
- [ ] `bun run check:boundaries` passes (dependency-cruiser; verify by temporarily adding a `domain→infra` import in a scratch file, seeing it FAIL, then removing the scratch).
- [ ] commitlint hook rejects a bad commit message (e.g. `bad message` → rejected; `feat(scaffolding): init` → accepted). Verify locally.
- [ ] CI: no `continue-on-error` remains in `ci.yml`; a green CI run on the PR.
- [ ] `src/domain/result.ts` and `src/domain/errors.ts` exist with the types from blueprint §2 and compile under strict mode.
- [ ] `src/cli/index.ts` runs: `bun run src/cli/index.ts` prints `marksync 0.0.0`.

## Test matrix
| Tier | This story |
|---|---|
| Unit | one smoke test asserting `Result.ok`/`Result.err` shape + a `MarkSyncError` exhaustive-switch compiles |
| Integration | n/a |
| Golden | n/a |
| BDD | n/a |
| E2E | n/a |

## Definition of Done
Tooling green on CI (no guards); module skeleton + shared primitives present; scripts wired; commitlint enforced; OPEN-Q9 closed. DoR `dod_defined` is satisfied by the AC list above.

## Out of scope
- Any actual domain logic (identity, config, state, etc.) — those are E2-S2 onward.
- Real CLI commands (E2-S3).
- The `bun build --compile` binary target (E5-S4; E1-S3 spike validates the mechanism).
- README polish, badges (post-MS-0002 or MS-0008).

## Risks / open questions (CEO-resolved)
- **R1:** Bun + happy-dom preload may warn before E4-S1 populates it. → Stub preload is a no-op import; acceptable. CEO-recorded.
- **R2:** dependency-cruiser + Bun ESM `"imports"` resolution. → If dep-cruiser can't resolve `#domain/*`, add a `webpack`-style alias mapping in `.dependency-cruiser.cjs` `resolved` config. CEO-recorded; verify in this story.
- **Q1 (CEO decides):** Biome vs ESLint for commit-msg — use commitlint (not Biome) for commit messages per TDR-0008. Confirmed.
