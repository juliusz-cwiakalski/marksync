---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0007
decision_type: tdr
status: Accepted
created: 2026-07-05
decision_date: null
last_updated: 2026-07-15
summary: "Use @cucumber/cucumber for the lifecycle-invariant BDD tier (.feature parsing, battle-tested, standard Gherkin). Runs under the Bun dev workflow via its Node-compatible CLI and is wired into the same CI fast loop. Test-only dependency — not compiled into the single binary, so zero binary-size impact. A thin bun:test wrapper and cucumber-core are rejected on long-term-maintainability grounds."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: testing
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Locks the runner for the four release-blocking lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) — the BDD tier that protects the no-silent-overwrite brand promise. A standard, maintained runner keeps the invariant suite durable as the codebase evolves."
customer_impact: "Indirect but material: the lifecycle invariants are the safety properties end users rely on; a battle-tested runner keeps them executable and trustworthy over time."
classification:
  domains: [architecture, operations]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: easy
  stakes: medium
  urgency: medium
  uncertainty: low
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "@cucumber/cucumber maintenance stalls or a breaking Bun change breaks its Node-compatible CLI under Bun."
  - "The invariant suite grows beyond the four lifecycle invariants and Cucumber's per-scenario overhead becomes material (reconsider a lighter runner only if measured)."
  - "The .feature files become a maintenance burden without readers (no product owner reads Gherkin) — reconsider the thin-wrapper approach."
links:
  related_changes: [GH-29]
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [TDR-0004, ADR-0006, TDR-0005]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# TDR-0007: Gherkin/BDD runner — @cucumber/cucumber for lifecycle-invariant tests

## Context

This decision resolves **OPEN-Q3** (Phase 4 open questions) and the deferred Gherkin-scope question left open in TDR-0004 ("confirm `@cucumber/cucumber` vs a thin custom wrapper for the four lifecycle invariants").

TDR-0004 specifies the test tier shape: `bun:test` is the primary runner for unit/integration/golden, and the **lifecycle-invariant BDD tier** is to use "`@cucumber/cucumber` (or a thin wrapper)." The `testing-strategy.md` rule file records the same. The four invariants this tier must cover (premortem §8.2):

- **INV-SAFE-1** — no silent overwrite of remote work.
- **INV-SAFE-2** — no silent re-create of `REMOTE_MISSING`.
- **INV-SAFE-3** — duplicate-UUID is fatal before any write.
- **INV-SEC-1** — no secrets in any output path.

These are release-blocking safety properties — the highest-value, smallest-surface BDD subset. The Gherkin tier is deliberately scoped to these four invariants only, not the whole suite (TDR-0004 §Decision).

FACT: TDR-0004 fixed `bun:test` as the primary runner and left the Gherkin runner choice as a deferred sub-question. FACT: only four invariants → small surface. FACT: tests are **NOT compiled into the single binary** (`bun build --compile` compiles `src/`), so a test-only dependency has **zero impact on binary size or runtime** — the user's explicit concern ("I don't mind dependencies, especially if they don't increase the end binary size") is structurally satisfied by any test-only runner. FACT: the lifecycle invariants must be validated through integration/E2E paths, **never mocks alone** (TDR-0004 §"Test-design guardrail"; `testing-strategy.md` over-mocking guardrail). FACT: the user's driver is **long-term maintainability**, preferring a "rock-solid… battle-tested and standard" solution.

ASSUMPTION (research-directional, re-verify before lock): `@cucumber/cucumber` is the standard, battle-tested JS Gherkin runner — parses `.feature` files, supports step definitions + formatters, is actively maintained (docs updated 2026 per TDR-0004's omitted-alternatives note), and runs under Bun via its Node-compatible CLI. Re-verify before lock.

**User direction (OPEN-Q3 answer):** "Prefer rock-solid solution — if `@cucumber/cucumber` is battle-tested and standard then let's use it. Driver is long-term maintainability. Don't mind dependencies (especially if they don't increase the end binary size since tests aren't compiled into the binary)."

## Problem Framing (Clarified)

The surface question ("Cucumber vs thin wrapper") is the wrong frame. The real question is: **which runner keeps the four release-blocking lifecycle invariants executable and trustworthy for the long term, at minimum maintainer burden — given that binary size is a non-issue (tests aren't compiled in) and the driver is long-term maintainability?**

Three factors settle it:

1. **Binary size is structurally a non-issue.** Because tests are not compiled into the single binary, the "avoid the dependency" argument loses its usual force. The cost of `@cucumber/cucumber` is a `devDependency` line + an upgrade cadence — not binary weight.
2. **Long-term maintainability is the stated driver.** A thin custom wrapper (~50–100 lines) is maintainer-authored and maintainer-maintained: it must track Gherkin syntax evolution, step-definition ergonomics, and reporting needs itself. A battle-tested, standard runner carries that burden upstream.
3. **The four invariants are release-blocking.** This is the worst place to carry custom-tooling risk: a brittle home-grown parser that mis-reads a `.feature` and silently skips an invariant is precisely the "untested invariant" premortem failure mode (§5.x).

Reframed: pick the standard, battle-tested Gherkin runner (`@cucumber/cucumber`), wire it into the Bun dev workflow + CI fast loop, and accept the (binary-irrelevant) test-only dependency. Reserve the thin-wrapper idea only as a documented fallback.

> **Integration note (C-2 precision).** `@cucumber/cucumber` is a **standalone runner** (its own CLI: `cucumber-js`), not a `bun:test` plugin. It runs **under Bun** (Bun executes Cucumber's Node-compatible code) and is wired into the same CI fast loop as the other tiers via a `bun run test:bdd` script. The `testing-strategy.md` CI line that passes `tests/bdd/` to `bun test` is updated at implementation time to invoke the cucumber CLI for the BDD tier (see Implementation Plan). Step definitions may use `bun:test`'s `expect` or Cucumber's own assertions — a per-implementation choice.

## Constraints (Hard Requirements)

### C-1: Parses .feature files (Gherkin syntax)

- **Statement:** The runner must parse standard Gherkin `.feature` files (Given/When/Then/And/But, Scenario/Scenario Outline/Background, tables, tags) — not a custom "feature-like" dialect.
- **Source:** TDR-0004 (Gherkin/BDD tier); `testing-strategy.md` (`tests/bdd/features/*.feature`); premortem §8.2 (invariants expressed as scenarios).
- **Verification:** A `.feature` file with a Scenario Outline + an Examples table runs and the examples are exercised.
- **Negotiable:** no.

### C-2: Integrates with the bun:test workflow

- **Statement:** The runner must execute **under the Bun dev workflow** (Bun runs it; no second runtime) and be wired into the **same CI fast loop** as the other tiers (it runs on every push alongside unit/integration/golden). It need not use the `bun:test` `test()` API directly — a standalone CLI runner invoked via a `bun` script satisfies this.
- **Source:** TDR-0004 (C-1 Bun-native dev workflow AND CI); `tech-stack.md` (Bun runtime).
- **Verification:** `bun run test:bdd` runs the `.feature` suite under Bun locally and in GitHub Actions with stable exit codes and parseable output.
- **Negotiable:** no.

### C-3: Battle-tested and actively maintained

- **Statement:** The runner must be a mature, actively maintained project (standard ecosystem choice, not experimental/abandoned), so the invariant suite remains executable as the language/toolchain evolve.
- **Source:** User direction ("rock-solid… battle-tested and standard"); A-VIA-2; long-term-maintainability driver.
- **Verification:** Canonical source shows active releases, responsive maintenance, and non-trivial adoption (re-verify before lock).
- **Negotiable:** no.

### C-4: Supports the four lifecycle invariants with clear step definitions

- **Statement:** The runner must express `INV-SAFE-1/2/3` and `INV-SEC-1` as parameterised scenarios with readable step definitions, and the steps must drive real integration/E2E paths (not mocks — per the over-mocking guardrail).
- **Source:** Premortem §8.2; `testing-strategy.md` over-mocking guardrail; ADR-0006 (invariants).
- **Verification:** Each invariant has at least one passing `.feature` scenario whose steps exercise an integration/E2E path (e.g., a `Bun.serve` mock for fault injection is allowed; mocking the invariant itself is not).
- **Negotiable:** no.

### C-5: Test-only dependency (not compiled into the single binary)

- **Statement:** The runner must be a `devDependency` that is excluded from `bun build --compile` output, so it has zero binary-size and zero runtime impact.
- **Source:** ADR-0001 (single binary compiles `src/`); user direction ("don't mind dependencies… if they don't increase the end binary size").
- **Verification:** The compiled binary's size is unaffected by the runner; `bun build --compile` excludes `devDependencies` (confirm via build smoke).
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- The four invariants are the safety core of the no-silent-overwrite brand promise (R-VAL-4) — the BDD tier is release-blocking, not cosmetic.
- Long-term maintainability (user's stated driver): the invariant suite must stay executable for years.

**Technical drivers:**
- Standard Gherkin `.feature` parsing (C-1) — not a custom dialect.
- Runs under Bun, no second runtime (C-2).
- Test-only dependency → binary size is a non-issue (C-5).

**Operational drivers:**
- Battle-tested, standard runner (C-3) — the maintainer is not the maintainer of the runner.
- Clear, readable step definitions (C-4) — the invariants must be legible as scenarios.

## Mental Models & Techniques Used

- **First Principles:** What is irreducible? Executing four release-blocking invariants expressed as Gherkin scenarios, durably, under Bun, with zero binary impact. The dependency-cost objection dissolves (C-5); the only real question is "standard runner vs custom wrapper."
- **Opportunity Cost:** A thin wrapper saves one `devDependency` line but costs perpetual maintenance of a Gherkin parser, step glue, and reporter — carried by a solo maintainer (A-VIA-2). For four release-blocking invariants, that is the wrong trade.
- **Inversion:** "How does a BDD-runner choice let an invariant silently fail?" → a home-grown parser mis-reads a `.feature` and skips a scenario, or a brittle step definition passes vacuously. A battle-tested runner with standard semantics closes both; the over-mocking guardrail (`testing-strategy.md`) closes the vacuous-pass case independently.
- **Second-Order Thinking:** A custom wrapper that "works for 4 invariants" does not scale if a 5th invariant is added or if Gherkin syntax evolves — the maintainer then carries a parser. A standard runner absorbs that evolution upstream.
- **KISS (applied to the maintainer's burden, not the dep count):** The simplest _long-term_ choice is the one the maintainer does not have to maintain. "Fewest dependencies" and "lowest maintenance" diverge here; the driver is explicitly the latter.
- **Evidence weighting:** Cucumber's "battle-tested/standard" status is research-directional; re-verify maintenance status before lock. The binary-size non-impact (C-5) is a structural fact of `bun build --compile`, not a benchmark.

## Alternatives Considered

### Maturity & Adoption (ecosystem health)

The BDD runner carries release-blocking invariants, so ecosystem health matters. Figures are **research-directional** (2026-07-05) and **must be re-verified** before lock — `citations_verified: false`. License strings are FACT; **license compatibility is a human determination**.

| Signal | `@cucumber/cucumber` | Thin bun:test wrapper | `@cucumber/cucumber-core` |
|---|---|---|---|
| License string | FACT: MIT | n/a (self-authored) | FACT: MIT |
| Project age / maturity | Battle-tested, the JS Cucumber standard | n/a — bespoke | Same lineage as cucumber, lower-level |
| Latest release + cadence | Active (re-verify) | n/a | Tracks cucumber monorepo |
| Approach | Full runner: .feature parse + steps + formatters + CLI | Custom parser + bun:test glue | Core parse/exec only — no CLI/formatters |
| Community signal | Standard, broad adoption | none | Niche; for building your own runner |
| Risk | None specific | Maintainer carries the parser/glue forever | Reimplements what cucumber already provides |

Sources: github.com/cucumber/cucumber-js (monorepo), cucumber.io (re-verify before lock).

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). All constraints here are `Negotiable: no`.

|          | C-1 (.feature parsing) | C-2 (Bun workflow + CI) | C-3 (battle-tested) | C-4 (4 invariants, clear steps) | C-5 (test-only, no binary impact) |
|----------|------------------------|-------------------------|---------------------|---------------------------------|-----------------------------------|
| Alt 0 (no BDD runner) | ❌ | ❌ | n/a | ❌ | n/a |
| Alt 1 — `@cucumber/cucumber` | ✅ | ✅ (standalone CLI under Bun) | ✅ | ✅ | ✅ |
| Alt 2 — thin bun:test wrapper | ⚠️ (custom dialect risk) | ✅ (runs in bun:test) | ❌ (not battle-tested — bespoke) | ⚠️ (DIY step glue) | ✅ |
| Alt 3 — `@cucumber/cucumber-core` | ✅ | ⚠️ (DIY CLI/runner assembly) | ✅ (lineage) | ⚠️ (DIY glue) | ✅ |

### Alternative 0 — Do Nothing / No BDD runner

- **Eligibility:** Not eligible (fails C-1, C-2, C-4).
- **Summary:** Express the four invariants only as plain `bun:test` integration tests, with no `.feature`/Gherkin layer.
- **Constraint compliance:** C-1 ❌; C-2 ❌ (no BDD tier); C-4 ❌ (no scenario structure).
- **Why rejected:** Fails three non-negotiable constraints and discards the scenario legibility that makes the invariants reviewable. TDR-0004 already mandated the BDD tier; this alternative reopens a settled question.

### Alternative 1 — `@cucumber/cucumber` (RECOMMENDED)

- **Eligibility:** Eligible (passes all five constraints).
- **Summary:** The standard JS Cucumber runner — parses `.feature` files, supports step definitions + formatters + tags + Scenario Outlines, runs under Bun via its Node-compatible CLI (`cucumber-js`). Test-only `devDependency`; zero binary impact.
- **Constraint compliance:** C-1 ✅ (standard Gherkin); C-2 ✅ (standalone CLI runs under Bun, wired into CI via `bun run test:bdd`); C-3 ✅ (battle-tested standard — re-verify); C-4 ✅ (parameterised scenarios + readable steps); C-5 ✅ (`devDependency`, excluded from compile).
- **Driver fit:** Best — directly matches the user's "rock-solid… battle-tested and standard" / long-term-maintainability driver. Binary-size non-issue (C-5).
- **Pros:** Standard Gherkin; battle-tested; maintainer does not maintain the runner; readable scenarios; broad ecosystem (formatters, docs, AI-agent familiarity — Cucumber is well-represented in training data, aiding agent authoring of steps).
- **Cons:** Adds a `devDependency` (binary-irrelevant per C-5); a standalone CLI rather than a `bun:test` plugin, so the CI wiring for the BDD tier differs slightly from the other tiers (a one-line script).
- **Why chosen:** The only alternative that passes all five constraints AND matches the stated driver. The "dependency cost" objection is dissolved by C-5; the maintenance burden is carried upstream.

### Alternative 2 — Thin bun:test wrapper

- **Eligibility:** Not eligible (fails C-3; weak on C-1, C-4).
- **Summary:** ~50–100 lines that parse a `.feature`-like file and emit `bun:test` `test()` calls.
- **Constraint compliance:** C-1 ⚠️ (custom dialect drift risk — not standard Gherkin unless the wrapper implements the full grammar); C-2 ✅ (runs inside `bun test`); C-3 ❌ (bespoke — not battle-tested; the maintainer is the sole maintainer); C-4 ⚠️ (DIY step glue); C-5 ✅.
- **Driver fit:** Poor against the long-term-maintainability driver — the wrapper is exactly the custom-scripting the user declined elsewhere (cf. TDR-0006 C-5).
- **Why rejected:** Fails C-3 (non-negotiable) and weakens C-1/C-4. The user's driver is long-term maintainability; a bespoke parser is the opposite. Retained only as a documented fallback if cucumber ever stalls.

### Alternative 3 — `@cucumber/cucumber-core`

- **Eligibility:** Eligible-with-accepted-risk-exceptions, but C-2 ⚠️ and C-4 ⚠️ are on non-negotiable constraints — not permissible; treated as not eligible for the primary choice.
- **Summary:** The lower-level Cucumber core (parse + execute) without the CLI, formatters, and standard tooling. Intended for building your own runner.
- **Constraint compliance:** C-1 ✅ (core parses Gherkin); C-2 ⚠️ (DIY CLI/runner assembly under Bun); C-3 ✅ (same lineage); C-4 ⚠️ (DIY step/reporting glue); C-5 ✅.
- **Why rejected:** C-2 ⚠️ and C-4 ⚠️ on non-negotiable constraints. It re-implements what `@cucumber/cucumber` (Alt 1) already provides — all cost, no benefit. A middle option that satisfies no one.

## Decision

**Recommendation: Alternative 1 — `@cucumber/cucumber` for the lifecycle-invariant BDD tier.**

`@cucumber/cucumber` is driven by **C-3 (battle-tested, standard)** — the user's explicit driver — and satisfies all five constraints. The usual objection to Cucumber (a heavier dependency than a custom wrapper) is dissolved by **C-5**: tests are not compiled into the single binary, so the dependency has zero runtime/binary impact. The thin-wrapper (Alt 2) is rejected because it fails C-3 and reintroduces the custom-script maintenance the user declined; cucumber-core (Alt 3) reimplements what the full runner already provides.

**Answering the owner's question:** `@cucumber/cucumber` runs **under Bun** via its Node-compatible CLI (`cucumber-js`, invoked as `bun run test:bdd`); it is wired into the same CI fast loop as the other tiers. It is a standalone runner (not a `bun:test` plugin), so the BDD tier's CI invocation is a one-line script rather than a `bun test tests/bdd/` directory argument — a minor wiring adjustment recorded in the Implementation Plan.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in TDR-0004,
> the `testing-strategy.md` over-mocking guardrail, the ADR-0006 invariants, and
> research-directional findings on Cucumber-JS. The "battle-tested / standard /
> actively maintained" claims are **research-directional** and **must be
> re-verified** against canonical sources
> (github.com/cucumber/cucumber-js, npm) before the runner is locked.
> `citations_verified: false`. License string recorded as FACT (MIT); **license
> compatibility is a human determination**. `status: Proposed` until human
> sign-off at merge.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — `@cucumber/cucumber`) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Standard Gherkin `.feature` parsing (Given/When/Then, Scenario, Scenario Outline + Examples, Background, tags, tables).
- **C-2 — ✅ Full compliance:** Runs under Bun via its Node-compatible CLI; wired into the CI fast loop via `bun run test:bdd`. (Precision: it is a standalone CLI runner, not a `bun:test` plugin — a one-line wiring difference, not a constraint violation.)
- **C-3 — ✅ Full compliance:** `@cucumber/cucumber` is the standard, battle-tested JS Gherkin runner (re-verify maintenance status before lock).
- **C-4 — ✅ Full compliance:** Each invariant (`INV-SAFE-1/2/3`, `INV-SEC-1`) is a parameterised scenario with readable step definitions driving integration/E2E paths (mocks allowed only for fault injection, never for the invariant itself — per the over-mocking guardrail).
- **C-5 — ✅ Full compliance:** `devDependency`, excluded from `bun build --compile`; zero binary-size / runtime impact (confirm via build smoke).

No accepted-risk exceptions are required.

### Implementation Update (GH-29 — 2026-07-15)

> **Realized form differs from the CLI candidate (DEC-2 / OQ-1).** This decision
> did **not** change: `@cucumber/cucumber` is the runner, it is a test-only
> `devDependency`, and all five constraints (C-1..C-5) hold. What changed at
> delivery is the **invocation entry point**. The `cucumber-js` CLI candidate
> (`bunx cucumber-js tests/bdd/features --require "tests/bdd/**/*.ts" --strict`,
> DEC-2) **fails to run under the pinned Bun 1.2.23** — Bun's TypeScript
> transpilation rejects Cucumber's `namespace` syntax. The resolved, binding form
> is a **bun-native runner** at [`tests/bdd/run-bdd.ts`](../../tests/bdd/run-bdd.ts)
> that drives Cucumber's API directly (`runCucumber` + `loadConfiguration` from
> `@cucumber/cucumber/api`) with `strict: true` + undefined-step failure. The
> `.feature` files, step definitions, Gherkin engine, and CI binding (`bun run
> test:bdd` in the `ci.yml` fast loop) are exactly as specified; only the entry
> script differs from the CLI. This resolves **OPEN-Q9** (cucumber+Bun interop):
> C-2 is satisfied by a Bun-executed API runner rather than the standalone CLI.
> Outcome (GH-29): the four invariant features (INV-SAFE-1/2/3, INV-SEC-1) — 6
> scenarios / 36 steps — pass under Bun; the `test:bdd` CI step is binding
> (non-zero exit on any invariant regression). The Step assertion library +
> Reporting format open questions below remain per-implementation choices.

## Trade-offs & Consequences

### Positive Outcomes

- Standard, battle-tested runner for the four release-blocking invariants — the long-term-maintainability driver is met.
- Zero binary-size impact (C-5) — the dependency-cost objection is structurally dissolved.
- Readable `.feature` scenarios make the invariants legible to reviewers and to AI agents (Cucumber is well-represented in agent training data, aiding step authoring).
- The maintainer does not maintain the runner.

### Negative Outcomes

- A standalone CLI runner (not a `bun:test` plugin) → the BDD tier's CI invocation is `bun run test:bdd`, slightly different from the other tiers' `bun test tests/...`. Mitigated: one script line; documented in `testing-strategy.md` CI wiring.
- A `devDependency` to upgrade on cadence — acceptable (binary-irrelevant; standard ecosystem choice).
- Cucumber's per-scenario setup overhead is real but immaterial at four invariants; revisit only if the suite grows substantially (revisit trigger).

### Unresolved Questions

- [x] **Bun compatibility re-verification:** confirm the current `@cucumber/cucumber` version's CLI runs cleanly under the pinned Bun version (OPEN-Q9 Bun-pin) before the CI gate is unguarded. (owner: Juliusz Ćwiąkalski) **Resolved (GH-29, 2026-07-15):** the `cucumber-js` CLI candidate (DEC-2, `bunx cucumber-js ... --strict`) **does not** run cleanly under the pinned Bun 1.2.23 — Bun's TS transpilation rejects Cucumber's namespace syntax. The realized form is a **bun-native runner** (`tests/bdd/run-bdd.ts`) that drives `@cucumber/cucumber`'s API directly (`runCucumber` + `loadConfiguration` from `@cucumber/cucumber/api`) with `strict: true`. The package and its Gherkin engine are unchanged; only the invocation entry point differs from the CLI candidate. CI gate is unguarded (binding) — see the Implementation Update below.
- [ ] **Step assertion library:** decide whether step definitions use `bun:test`'s `expect`, Cucumber's assertions, or `node:assert` — a per-implementation consistency choice. (owner: Juliusz Ćwiąkalski)
- [ ] **Reporting format:** pick a CI-friendly formatter (e.g., JUnit/JSON) consistent with TDR-0004's machine-parseable-results contract. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — directly protects the no-silent-overwrite brand promise (R-VAL-4) by keeping the four release-blocking invariants executable; the highest-value BDD subset.
- **Usability** — strong: standard Gherkin is legible; agent-familiar; CI-wired.
- **Feasibility** — low uncertainty: Cucumber-JS is proven under Node-compatible runtimes; the residual unknown (exact Bun-pin compat) is cheap to verify before lock.
- **Viability** — strong for a solo maintainer: standard tool, no custom maintenance, binary-irrelevant dependency.

## Implementation Plan

1. **Add `@cucumber/cucumber`** to `devDependencies`; add a `test:bdd` script invoking the `cucumber-js` CLI against `tests/bdd/features/`.
2. **Feature files:** author one `.feature` per invariant (`INV-SAFE-1/2/3`, `INV-SEC-1`) in `tests/bdd/features/`, using Scenario Outlines where parameterisation helps.
3. **Step definitions:** implement steps in `tests/bdd/steps/` driving integration paths (e.g., a `Bun.serve` mock for the 409 drift case is allowed; the invariant itself must not be mocked).
4. **CI wiring update:** update the `testing-strategy.md`/CI fast-loop sketch so the BDD tier runs via `bun run test:bdd` (a standalone-CLI invocation) rather than a `bun test tests/bdd/` directory argument. Document the one-line wiring difference.
5. **Reporter:** configure a CI-friendly formatter (JUnit or JSON) consistent with TDR-0004's machine-parseable contract.
6. **Over-mocking guardrail:** add a review check that each invariant scenario exercises a real integration/E2E path, not a mocked invariant (per `testing-strategy.md`).

**Risk mitigation during implementation:** if a step definition passes vacuously (e.g., a `Then` with no assertion), Cucumber's strict-mode/undefined-step options flag it; enable them. If a `.feature` is found to be skipped silently, treat it as a release-blocking CI failure.

## Verification Criteria

- **Metric: Invariant coverage** — Target: `INV-SAFE-1`, `INV-SAFE-2`, `INV-SAFE-3`, `INV-SEC-1` each have at least one passing `.feature` scenario driving an integration/E2E path — Window: `MS-0002` (C-4).
- **Metric: CI integration** — Target: `bun run test:bdd` runs in the push CI fast loop and fails the pipeline on any invariant violation — Window: `MS-0002` (C-2).
- **Metric: Binary-size neutrality** — Target: the compiled binary's size is unchanged by the runner (`devDependency` excluded from `bun build --compile`) — Window: first release (C-5).
- **Metric: Gherkin standardness** — Target: a `.feature` with a Scenario Outline + Examples table is exercised correctly — Window: `MS-0002` (C-1).

## Confidence Rating

**High.** `@cucumber/cucumber` cleanly satisfies all five constraints and directly matches the user's "rock-solid / battle-tested / standard / long-term-maintainability" driver. The usual objection (dependency weight) is dissolved by C-5's structural fact (tests are not compiled into the binary). Residual uncertainty is low: re-verify the current version's Bun compatibility and maintenance status before lock. The thin-wrapper alternative fails C-3 (non-negotiable); cucumber-core reimplements what the full runner provides.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- TDR-0004 — `doc/decisions/TDR-0004-testing-runner.md` (primary runner; Gherkin tier scoped to the four lifecycle invariants; "or a thin wrapper" deferred to here).
- ADR-0006 — `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (lifecycle invariants `INV-SAFE-1/2/3`).
- TDR-0005 — `doc/decisions/TDR-0005-linter-and-formatter.md` (companion Phase-4 tooling decision).
- `.ai/rules/testing-strategy.md` — BDD tier; over-mocking guardrail; CI wiring.
- `doc/overview/tech-stack.md` — Bun runtime; `bun build --compile` excludes tests.
- `doc/inception/open-questions/phase-4-open-questions.md` — OPEN-Q3 (Gherkin runner).
- External research (directional, re-verify): github.com/cucumber/cucumber-js, cucumber.io/docs/installation, npm.
