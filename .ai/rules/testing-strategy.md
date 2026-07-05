---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: TESTING-STRATEGY
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [TDR-0004, ADR-0002, ADR-0005, ADR-0006]
  related_changes: []
  summary: "Testing strategy — test tiers, coverage rules, AI-agent over-mocking guardrail, CI wiring, and lifecycle-invariant BDD for MarkSync."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Testing Strategy

_The testing strategy for MarkSync. Implements TDR-0004 (bun:test as primary
runner), ADR-0002 C-1 (renderer determinism), and the lifecycle invariants
(INV-SAFE-1/2/3, INV-SEC-1). All agents (@coder, @plan-writer, reviewers) must
load and follow this file._

## Test tiers

| Tier | Runner | Scope | What it validates | CI gate |
|---|---|---|---|---|
| **Unit** | `bun:test` | Pure domain logic: state classifier, hierarchy planner, link resolver, asset resolver, path/UUID utilities, config/lock schema validation | Correctness of domain rules in isolation | Every push (fast) |
| **Integration** | `bun:test` + `Bun.serve()` mock | Confluence adapter (HTTP mock), Git adapter (temp repo), lock/journal store, push executor, credential provider | Adapter boundary correctness; 409 drift detection; REST v2/v1 isolation | Every push |
| **Golden fixture** | `bun:test` `toMatchSnapshot` / `toMatchInlineSnapshot` | Markdown → Storage renderer output (ADR-0005); Mermaid render SVG output (ADR-0002 C-1 determinism) | Byte-stable deterministic output; no silent snapshot regeneration | Every push |
| **Mermaid-DOM** | `bun:test` + `happy-dom` (via `@happy-dom/global-registrator` + Bun preload) | Mermaid rendering via official lib in headless DOM | Renderer works in-process; deterministic SVG + IDs | Every push (if spike passes) |
| **Gherkin / BDD** | `@cucumber/cucumber` via `bun run test:bdd` (TDR-0007) | **Lifecycle invariants only** (INV-SAFE-1, INV-SAFE-2, INV-SAFE-3, INV-SEC-1) | Release-blocking safety properties | Every push |
| **E2E (live-sandbox)** | Thin runner script | Real Confluence test space: page CRUD, content properties, version-conflict 409, attachments | End-to-end correctness against real API | Separate CI gate (scheduled or labelled) |

## Naming and layout conventions

### File naming

```
src/domain/state-classifier.ts          → tests/domain/state-classifier.test.ts
src/infra/confluence/client.ts          → tests/integration/confluence/client.test.ts
src/infra/render/storage-renderer.ts    → tests/golden/storage-renderer.test.ts
                                         tests/golden/fixtures/*.storage.xhtml
tests/e2e/sandbox-publish.test.ts        (E2E — separate gate)
tests/bdd/features/no-silent-overwrite.feature
tests/bdd/steps/no-silent-overwrite.steps.ts
```

### Test naming

- Test descriptions use the pattern: `it("does X when Y")` — describe the
  behaviour, not the implementation.
- Use `describe` blocks to group by scenario, not by function name.
- Golden fixtures are named after the input fixture:
  `fixtures/headings.storage.xhtml`, `fixtures/mermaid-flowchart.svg`.

### Snapshot rules (golden-fixture tier)

- **File snapshots** (`toMatchSnapshot`) for Storage XHTML and Mermaid SVG —
  byte-stable, reviewable in PR diffs.
- **Inline snapshots** (`toMatchInlineSnapshot`) only for short expected values
  (< 5 lines) in unit tests.
- **Snapshot updates are explicit**: `bun test --update-snapshots` must be a
  conscious, reviewed action. Never auto-update in CI.
- **Snapshot stability across Bun versions**: pin the Bun version per release;
  re-baseline snapshots as an explicit, reviewed action if Bun changes affect
  output (ADR-0002 C-1).

## Coverage rules

### What MUST be tested (release-blocking)

| Requirement | Test tier | ID |
|---|---|---|
| No silent overwrite of remote work | Gherkin (integration-level) + E2E | INV-SAFE-1 |
| No silent re-create of REMOTE_MISSING | Gherkin (integration-level) + E2E | INV-SAFE-2 |
| Duplicate-UUID is fatal before any write | Unit + Gherkin | INV-SAFE-3 |
| No secrets in any output path | Unit (per output path) + Gherkin | INV-SEC-1 |
| 409 version-conflict → drift classification | Integration (`Bun.serve` mock) | A-FEA-5 |
| Storage renderer is deterministic | Golden fixture (byte-stable) | ADR-0002 C-1 |
| Canonical GFM subset survives round-trip | Golden fixture (all constructs) | NFR-REL-4 |
| Config/lock schema validation catches invalid input | Unit (all error cases) | — |
| Idempotent rerun performs 0 writes | Integration | NFR-PERF-4 |

### What SHOULD be tested (quality targets)

| Requirement | Test tier | Notes |
|---|---|---|
| Mermaid render determinism (deterministicIds, fixed font) | Mermaid-DOM | Spike-gated (ADR-0002) |
| Attachment hash-based dedup | Integration | |
| Cross-page link resolution | Unit + integration | |
| Lock atomic write under concurrent access | Integration | |
| Exit codes per error class | Unit | |

### AI-agent over-mocking guardrail (TDR-0004 §"Test-design guardrail")

Because MarkSync is explicitly AI-agent-operable (agents generate and modify
tests), this is a hard guardrail against over-mocking:

> **Agent-generated tests must prefer golden fixtures, contract tests, real
> parser/renderer fixtures, and live-sandbox coverage over excessive mocks.**
>
> Mocks are allowed for:
> - **Fault injection** (e.g., the 409 version-conflict, network errors).
> - **Adapter boundary tests** (e.g., `Bun.serve` HTTP mock for the Confluence
>   adapter).
>
> Mocks are NOT allowed for:
> - **Lifecycle invariants** (INV-SAFE-1/2/3, INV-SEC-1) — these MUST be
>   validated at least once through integration or E2E paths, never through
>   mocks alone.
> - **Domain logic** — the state classifier, hierarchy planner, etc. must be
>   tested with real inputs and real outputs, not mocked dependencies.

Source: arXiv 2602.00409 (AI-agent commits more likely to over-mock); arXiv
2602.19098 (JavaScript environmental test flakiness).

## CI wiring

### Fast loop (every push)

```yaml
# .github/workflows/ci.yml (sketch — full file in .github/workflows/)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: <pinned>
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      # Exclude E2E (live-sandbox) and BDD (cucumber CLI) from the bun:test fast loop.
      # BDD tests run via `bun run test:bdd` (cucumber CLI per TDR-0007).
      - run: bun test tests/unit/ tests/integration/ tests/golden/
      - run: bun run test:bdd
```

### E2E gate (separate)

```yaml
# Scheduled or labelled (e.g., "run-e2e")
jobs:
  e2e:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'run-e2e')
    concurrency:
      group: e2e-sandbox
      cancel-in-progress: false  # don't cancel mid-write against a live space
    steps:
      - # ... setup ...
      - run: bun test tests/e2e/
        env:
          MARKSYNC_E2E_CONFLUENCE_BASE_URL: ${{ secrets.E2E_CONFLUENCE_BASE_URL }}
          MARKSYNC_E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          MARKSYNC_E2E_API_TOKEN: ${{ secrets.E2E_API_TOKEN }}
          MARKSYNC_E2E_SPACE_KEY: ${{ secrets.E2E_SPACE_KEY }}
          MARKSYNC_E2E_PARENT_PAGE_ID: ${{ secrets.E2E_PARENT_PAGE_ID }}
```

> **Canonical E2E env-var set:** `.env.example` and
> `.github/workflows/run-e2e.yml` are the single source of truth for the E2E
> environment variables. The snippet above must stay in sync with them.

### Live-sandbox hygiene

- **Dedicated test space** — not per-suite creation (premortem §8.5). One
  Confluence space, cleaned on a schedule (e.g., nightly delete-all-managed
  pages).
- **Concurrency limit** — at most 1 concurrent E2E run per sandbox to avoid
  version-conflict noise.
- **Credentials** — E2E secrets in GitHub Actions secrets, never in the repo.

## Mermaid-DOM test setup

The default Mermaid-DOM path uses `bun:test` + `happy-dom`:

```typescript
// tests/mermaid.preload.ts (Bun preload)
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

```bash
bun test tests/golden/mermaid --preload ./tests/mermaid.preload.ts
```

**Escalation path** (TDR-0004): if `happy-dom` cannot run the required Mermaid
DOM path reliably, escalate to Vitest for those files only. If real browser
layout/graphics are needed, escalate to Playwright. Escalations are rare and
documented per-file.

## Repo-local benchmark gate (TDR-0004 Implementation Plan §8)

Published benchmark numbers are directional (PkgPulse et al.), not measured for
MarkSync. A small, commit-tracked benchmark compares **cold start** and **warm
run** time for a representative slice (~100 unit tests, ~20 golden fixtures, one
`Bun.serve` integration suite). Track results over time; fail only on large
regressions.

```bash
# scripts/bench-test.sh (sketch)
# Exclude E2E by targeting specific directories (see CI wiring note above).
bun test tests/unit/ tests/integration/ tests/golden/ --time  # record timings
# compare to .benchmarks/baseline.json
```

## Product performance scenarios (minimal — deferred to MS-0003+)

_Product NFRs (NFR-PERF-1 binary size, NFR-PERF-2 cold start, NFR-PERF-5
conversion latency) are "desired, not hard" targets. The performance test suite
is intentionally minimal and may be deferred to `MS-0003` or later._

### High-level scenarios

| Scenario | What it measures | How | Target |
|---|---|---|---|
| **Binary size** | `bun build --compile` output size per OS/arch | `ls -la dist/marksync-*` | ~90 MB (desired, not hard) |
| **Cold start** | Time from binary launch to first output | `time ./marksync --version` on clean OS | ~2 s (desired, not hard) |
| **Conversion latency** | Per-page Markdown→Storage render | Mock Confluence API; time the pipeline for ~10 pages | ≤200 ms p95 (informational) |
| **Memory usage** | Peak RSS during a sync run | `/usr/bin/time -v` wrapper | Track only; no fixed target |

### Implementation approach

- **Mock Confluence APIs** — no live network calls; `Bun.serve()` mock HTTP.
- **Small fixture set** — ~10 representative pages (headings, tables, code,
  Mermaid, images), not the full 500-page scale.
- **Commit-tracked** — results stored in `.benchmarks/baseline.json`; CI
  reports deltas, not absolute pass/fail.
- **Deferred wiring** — this suite is not blocking for `MS-0002`. First
  measurement at `MS-0002` end or `MS-0003` start.

> **Design principle:** keep performance testing minimal. The primary defense
> against performance regressions is code review and the test-suite benchmark
> gate above. Product-level performance scenarios exist to catch large
> regressions, not to enforce micro-optimizations.

## Anti-patterns (rejected)

- ❌ **Testing through the CLI in unit/integration tests** — the CLI is
  presentation; test domain/infra directly. CLI integration tests go in the E2E
  tier.
- ❌ **Mocking the state classifier to test the push executor** — the push
  executor's value is in how it handles real sync states; mock only the
  `TargetSystem` port.
- ❌ **Snapshotting non-deterministic output** — if output has timestamps or
  random IDs, normalize before snapshotting or don't snapshot at all.
- ❌ **Using `any` in test helpers** — tests should have the same typing rigour
  as production code.
- ❌ **Testing implementation details** (private methods, internal state) —
  test behaviour through public APIs.

## See also

- [TDR-0004](../../doc/decisions/TDR-0004-testing-runner.md) — runner decision with
  full alternatives analysis.
- [ADR-0002](../../doc/decisions/ADR-0002-mermaid-rendering-strategy.md) — renderer
  determinism (C-1); Mermaid-DOM test setup.
- [ADR-0005](../../doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md)
  — Storage renderer golden-fixture target.
- [ADR-0006](../../doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
  — lifecycle invariants INV-SAFE-1/2/3.
- [NFR-REL-*](../../doc/spec/nonfunctional.md) — reliability NFRs that drive test
  coverage.
- [CI baseline](../../.github/workflows/ci.yml) — the actual workflow file.
- [Security baseline](../../doc/guides/security-baseline.md) — secret management,
  redaction testing.
