---
id: MS2-E5-S1
title: "quality-gate-wiring"
status: todo
type: story
priority: high
epic: MS2-E5
milestone: MS-0002
estimate: 2d
gh_issue: GH-29
feature_spec: ""
decisions: [TDR-0004, TDR-0007]
dependencies: { blocks: [], blocked_by: [MS2-E2-S1, MS2-E3-S6] }
cross_cutting: [R-FEA-5, NFR-REL-1, NFR-REL-2, NFR-REL-8, INV-SEC-1]
---

# MS2-E5-S1 — Quality gate wiring (all 6 test tiers)

## Goal
Wire the full 6-tier testing strategy (testing-strategy.md): unit + integration (mocked Confluence) + golden fixtures + Mermaid-DOM + Gherkin BDD (lifecycle invariants) + live-sandbox E2E (separate gate). The BDD tier covers the **release-blocking safety invariants** (INV-SAFE-1/2/3, INV-SEC-1).

## Background
TDR-0004 (bun:test) + TDR-0007 (@cucumber/cucumber). testing-strategy.md §"CI wiring": BDD runs in the fast loop via `bun run test:bdd`; E2E is a separate scheduled/labelled gate. The over-mocking guardrail (testing-strategy.md) forbids mocking lifecycle invariants — they MUST run through integration/E2E paths. E2-S1 created the tier directories + smoke test; this story wires the real runners + the invariant scenarios.

## Detailed scope (deliverables)
1. **`@cucumber/cucumber` wiring** — `tests/bdd/features/`, `tests/bdd/steps/`, `package.json` script `test:bdd` (TDR-0007 via bun). Features for the lifecycle invariants ONLY:
   - `no-silent-overwrite.feature` (INV-SAFE-1)
   - `no-silent-recreate-remote-missing.feature` (INV-SAFE-2)
   - `duplicate-uuid-fatal.feature` (INV-SAFE-3)
   - `no-secret-in-output.feature` (INV-SEC-1)
   - `idempotent-rerun.feature` (NFR-PERF-4)
   - `overlapping-plans-older-loses.feature` (INV-SAFE-3/concurrency)
2. **Step definitions** — drive the **real** sync engine (E3-S6) against a `Bun.serve` mock Confluence (integration-level — NOT mocked domain logic). Each scenario sets up local Git fixtures + mock remote state, runs plan+apply, asserts the invariant + zero-write/zero-overwrite behavior.
3. **Golden-fixture runner** — wire `tests/golden/` snapshot tests (Storage from E3-S3, Mermaid SVG from E4-S1) into the fast loop; `--update-snapshots` is explicit (never in CI).
4. **Mermaid-DOM preload** — confirm `tests/mermaid.preload.ts` registers happy-dom (used by E4-S1 tests).
5. **Live-sandbox E2E harness** — `tests/e2e/` runner + `.github/workflows/run-e2e.yml` (already exists — verify/extend). Single dedicated test space (`marksyncte`), concurrency-group = 1, credentials from GitHub Actions secrets. NOT in the fast loop (label `run-e2e` or scheduled).
6. **CI fast-loop wiring** — `.github/workflows/ci.yml` runs: `lint`, `typecheck`, `bun test tests/unit/ tests/integration/ tests/golden/`, `bun run test:bdd`, `check:boundaries`, audit, link-check. (E2-S1 removed the guards; this story ensures all tiers are present.)
7. **Coverage gate** — bunfig coverage thresholds (line/function ≥80% as a starting baseline; adjust per MS-0002 reality).

## Technical approach
- BDD step defs import the real `computePlan`/`applyPlan` (E3-S6) and a `MockConfluenceTarget` implementing the `TargetSystem` port over `Bun.serve` — this is the integration-level path the over-mocking guardrail REQUIRES for invariants.
- E2E uses the real adapter against the sandbox space; cleanup after each run.
- Snapshot files committed; CI fails on stale snapshots.

## Interface contracts (what other stories consume)
- The BDD scenarios are the **acceptance tests** for the invariants produced by E3-S5/E3-S6/E3-S7 — they're the release gate.
- The E2E harness is reusable by E5-S3 (adversarial corpus) and regression runs.

## Acceptance criteria (testable)
- [ ] All 6 tiers wired: unit, integration, golden, mermaid-DOM, BDD, E2E — each runnable via its documented command.
- [ ] `bun run test:bdd` passes all invariant features (INV-SAFE-1/2/3, INV-SEC-1, NFR-PERF-4) at integration level (real engine + mock target).
- [ ] **Over-mocking guardrail honored:** no invariant scenario mocks the state classifier or sync engine; only the `TargetSystem` port is mocked.
- [ ] Golden fixtures: committed; `--update-snapshots` not used in CI; a deliberate output change → CI fails until reviewed update.
- [ ] E2E: `run-e2e.yml` triggers on label/schedule; runs against the sandbox; cleans up.
- [ ] CI fast loop is green on a clean PR; coverage report produced.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story IS the wiring |
|---|---|
| All 6 | wired + passing |

## Definition of Done
6 tiers wired; invariant BDD green at integration level; golden snapshots committed; E2E harness live (separate gate); CI fast loop complete. AC list is the DoD.

## Out of scope
- Writing every possible BDD step (lifecycle invariants only per testing-strategy.md).
- Performance benchmark suite (deferred to MS-0003+ per testing-strategy.md).
- Multi-space E2E (single sandbox space).

## Risks / open questions (CEO-resolved)
- **R1:** Cucumber + Bun interop friction (TDR-0007). → If `bun run test:bdd` (cucumber CLI) is flaky, fall back to running cucumber via `bunx`; record the working invocation. CEO-recorded.
- **R2:** E2E sandbox space cleanup. → Each run deletes the pages it created; a nightly sweep is a backstop. CEO-recorded.
