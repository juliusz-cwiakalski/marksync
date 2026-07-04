---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0009
decision_type: tdr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-04
summary: "Use bun:test for unit/integration/golden-fixture tests (native, fastest, snapshots+mocks+Bun.serve HTTP mock server); a thin E2E runner for the live-sandbox tier; vitest+happy-dom only for Mermaid-DOM files if bun:test DOM setup proves painful; @cucumber/cucumber (or a thin wrapper) for lifecycle-invariant Gherkin only."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Sets the testing foundation and the Phase 4 CI baseline; affects defect-leakage risk and contributor onboarding to the test suite."
customer_impact: "Indirect but material: test quality governs the no-silent-overwrite brand promise and Mermaid-renderer determinism that end users rely on."
classification:
  domains: [architecture, operations]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: easy
  stakes: medium
  urgency: medium
  uncertainty: medium
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
  citations_verified: true
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "bun:test DOM-environment setup proves painful enough for Mermaid-renderer tests that vitest+happy-dom should become the primary (not the scoped exception)."
  - "bun:test snapshots prove unstable across Bun versions and break the golden-fixture contract for the Storage renderer."
  - "Bun.serve-based HTTP mock server cannot reproduce a Confluence 409/version-conflict scenario needed for drift-detection tests."
  - "The live-sandbox E2E tier outgrows a thin runner script and needs a framework with first-class concurrency/isolation."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [ADR-0001]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# ADR-0009: Testing runner — bun:test for unit/integration/golden, scoped vitest for Mermaid-DOM, thin E2E + Gherkin wrappers

## Context

This is a sub-decision of ADR-0001 (implementation language and runtime) and governs the **Phase 4 CI baseline**. ADR-0001's Implementation Plan calls for re-specifying the spec's testing strategy (unit/integration/E2E/Gherkin/golden) for the TypeScript toolchain. The tech-stack draft (`doc/overview/tech-stack.md`) flags the testing runner as spike-gated via ADR-0002 (`A-FEA-1`, `testing`).

MarkSync needs a testing framework that serves four distinct test tiers:

- **Unit tests** — pure domain logic (state classifier, hierarchy planner, path validator, path/UUID utilities).
- **Integration tests** — mocked Confluence adapter (HTTP mock server), Git adapter, lock/journal store.
- **Golden-fixture tests** — Markdown→Storage renderer output (ADR-0005); the renderer must be deterministic (ADR-0002 C-1).
- **A live-sandbox E2E tier** — a dedicated Confluence test space (not per-suite) exercising real page CRUD, content properties, and the version-conflict 409 (A-FEA-5).
- **Gherkin/BDD** — for **lifecycle invariants only** (premortem §8.2): `INV-SAFE-1` (no silent overwrite), `INV-SAFE-2` (no silent re-create of `REMOTE_DELETED`), `INV-SAFE-3` (duplicate-UUID fatal), `INV-SEC-1` (no secrets in output).

FACT: ADR-0001 fixed Bun as the dev runtime and single-binary compiler. FACT: the renderer determinism gate (ADR-0002 C-1) makes golden-fixture/snapshot support a correctness requirement, not a nicety. FACT: the Confluence adapter is the only module permitted to know REST v2/v1 distinctions (A-FEA-6 isolation), so its integration tests need a controllable HTTP mock server. FACT: the spec's CI-first contract requires the test suite to run in CI with stable, machine-parseable results.

**User direction (OPEN-Q4 answer):** "have no real preference here (no experience in this kind of setup). Create decision record and properly evaluate options in context of MarkSync and suggest best choice for our case."

## Problem Framing (Clarified)

The surface question ("which test framework is best") is the wrong frame. The real question is: **which runner best serves MarkSync's four distinct test tiers under the Bun dev workflow AND in CI, with snapshot/golden support, mock/spy ergonomics, an HTTP mock server for the Confluence adapter, and ESM — at minimum added-complexity cost?**

Two factors make this non-trivial:

1. **Tier heterogeneity** — unit/integration/golden tests are pure-JS and fast; the Mermaid-DOM renderer tests need a DOM environment; the live-sandbox E2E tier needs real Confluence credentials and a dedicated space; Gherkin invariants are a small, high-value subset. A single runner may not serve all four tiers optimally.
2. **Bun-native vs cross-runtime** — `bun:test` is native and fastest but has manual DOM setup (no built-in `environment: 'jsdom'`); `vitest` has mature per-file DOM env config but experimental Bun support (jsdom-under-Bun issue oven-sh/bun#4145).

Reframed: pick a **primary runner** that serves unit/integration/golden natively, and scope **narrow exceptions** (vitest+happy-dom for Mermaid-DOM files only if needed; a thin E2E runner script; `@cucumber/cucumber` for lifecycle-invariant Gherkin only) rather than forcing one runner across all tiers.

## Constraints (Hard Requirements)

### C-1: Runs under the Bun dev workflow AND in CI

- **Statement:** The testing runner must execute under the Bun dev workflow (local `bun test`-equivalent) and in CI with stable, machine-parseable results. The primary runner must be Bun-native, not require a separate runtime for the common case.
- **Source:** ADR-0001 (Bun dev runtime); spec §7.9, §9.1, §13 (CI-first contract).
- **Verification:** `bun run test` (or equivalent) runs the unit/integration/golden suite locally and in GitHub Actions with stable exit codes and parseable output.
- **Negotiable:** no.

### C-2: Snapshot/golden-fixture support (for the Storage renderer)

- **Statement:** The runner must support snapshot/golden-fixture matching (inline and/or file snapshots) for the deterministic Markdown→Storage renderer (ADR-0005; ADR-0002 C-1).
- **Source:** ADR-0002 C-1 (renderer determinism); ADR-0005 (Storage renderer); spec testing strategy (golden).
- **Verification:** A golden-fixture test captures and compares rendered Storage XHTML; snapshot updates are an explicit, reviewable action.
- **Negotiable:** no.

### C-3: Mock/spy ergonomics + ability to run an HTTP mock server (for the Confluence adapter)

- **Statement:** The runner must provide mock/spy ergonomics and the ability to run a controllable HTTP mock server (to exercise the Confluence adapter, including the version-conflict 409 for drift detection — A-FEA-5).
- **Source:** A-FEA-6 (Confluence adapter isolation); A-FEA-5 (409 drift detection); spec §9.7.
- **Verification:** An integration test starts an HTTP mock server, scripts a 409 response, and asserts the adapter classifies it as drift.
- **Negotiable:** no.

### C-4: ESM support

- **Statement:** The runner must support ESM natively, consistent with the ESM-only codebase (ADR-0001; tech-stack.md).
- **Source:** ADR-0001 (TypeScript/ESM); tech-stack.md (ESM + Web APIs).
- **Verification:** ESM test files run without CJS-interop shims; `tsc --noEmit` passes.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Test quality governs the no-silent-overwrite brand promise (R-VAL-4) and Mermaid-renderer determinism — defect leakage here is brand-defining.
- Fast feedback keeps a solo maintainer productive (A-VIA-2).

**Technical drivers:**
- Native Bun integration: no extra runtime for the common case; fastest feedback.
- Snapshot/golden support for the deterministic Storage renderer.
- HTTP mock server for the Confluence adapter (the only module that knows REST v2/v1 — A-FEA-6).

**Operational drivers:**
- Minimum added complexity: one primary runner for unit/integration/golden; narrow scoped exceptions only where justified.
- Contributor onboarding: a Jest-compatible API lowers the learning curve.
- CI stability: deterministic, parseable test results.

## Mental Models & Techniques Used

- **First Principles:** What is irreducible per tier? Unit/integration/golden need snapshots + mocks + HTTP mock server under Bun. Mermaid-DOM needs a DOM environment. E2E needs a real Confluence sandbox. Gherkin invariants are a small, high-value subset. One runner need not serve all four.
- **Opportunity Cost:** Forcing vitest across all tiers costs experimental-Bun-support risk (jsdom-under-Bun #4145) and ~0.9s runs; forcing bun:test across all tiers costs manual DOM setup for Mermaid files. The cheapest path is a primary + scoped exceptions.
- **Second-Order Thinking:** A slow or flaky test suite cascades into skipped tests and eroded coverage — the premortem's "untested invariant" failure mode (§5.x). Native + fast (bun:test) is the primary defense.
- **Inversion:** "How does a test-runner choice cause a release-blocking defect to leak?" → a golden-fixture snapshot that silently regenerates, or an HTTP mock that cannot reproduce a 409. Each is closed by a control below (explicit snapshot updates; `Bun.serve` mock server).
- **KISS:** a thin E2E runner script beats a heavy framework for a single dedicated Confluence sandbox; Gherkin via `@cucumber/cucumber` (or a thin wrapper) for invariants only — not for the whole suite.
- **Evidence weighting:** `bun:test`'s ~0.08s run and native API are FACTs; vitest's jsdom-under-Bun issue (#4145) is a documented open issue. These weight the primary choice toward `bun:test`.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). Research data: external-researcher, 2026-07-04. Run-time figures are research-sourced benchmarks.

|          | C-1 (Bun dev workflow AND CI) | C-2 (snapshot/golden) | C-3 (mock/spy + HTTP mock server) | C-4 (ESM) |
|----------|-------------------------------|------------------------|-----------------------------------|-----------|
| Alt 0 (no framework / ad-hoc asserts) | ✅ (trivially) | ❌ (must build) | ❌ (must build) | ✅ |
| Alt 1 — bun:test              | ✅ (native, ~0.08s run) | ✅ (`toMatchSnapshot`/`toMatchInlineSnapshot`) | ✅ (`mock()`/`spyOn()` + `Bun.serve()` HTTP mock server) | ✅ (ESM) |
| Alt 2 — vitest                | ⚠️ (experimental Bun support; jsdom-under-Bun #4145; ~0.9s run) | ✅ | ✅ | ✅ |
| Alt 3 — node:test             | ⚠️ (Node built-in API; not Bun-native; Node 22+ only) | ⚠️ (limited `assert.snapshot`) | ⚠️ (no built-in HTTP mock server) | ✅ |
| Alt 4 — jest                  | ⚠️ (CJS-heavy, ESM pain; ~1.2s run; not Bun-native) | ✅ | ✅ | ⚠️ (CJS-heavy, ESM pain) |
| Alt 5 — uvu                   | ⚠️ (unmaintained; runs under Bun but no native integration) | ⚠️ (snapshot via plugin) | ⚠️ (no built-in) | ✅ |

### Alternative 0 — Do Nothing / No framework (ad-hoc asserts)

- **Summary:** Hand-roll assertions and a runner script; no snapshot, mock, or HTTP-mock-server support.
- **Pros:** Zero dependencies.
- **Cons:** Reimplements snapshots, mocks, and HTTP mock servers (high effort, bug-prone); no watch mode; diverges from spec testing strategy.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; **C-3 ❌**; C-4 ✅.
- **Why rejected:** Fails C-2 and C-3 (non-negotiable). Snapshot and HTTP-mock support are exactly what a framework should provide.

### Alternative 1 — bun:test (RECOMMENDED for unit/integration/golden)

- **Summary:** `bun:test` — native to the runtime, zero additional dependency, Jest-compatible API, `toMatchSnapshot`/`toMatchInlineSnapshot`, `--watch`, `mock()`/`spyOn()`, `Bun.serve()` for an HTTP mock server, ESM, active 2026. Benchmark ~0.08s run. DOM environment setup is manual (no built-in `environment: 'jsdom'`).
- **Pros:** Native (C-1 ✅), fastest (~0.08s), zero extra dependency, Jest-compatible API (contributor familiarity), snapshots + mocks + `Bun.serve` HTTP mock server for the Confluence adapter (C-2 ✅, C-3 ✅), ESM (C-4 ✅).
- **Cons:** Manual DOM environment setup for Mermaid-renderer tests (no built-in `environment: 'jsdom'`); no built-in Gherkin.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅.
- **Why chosen:** The only runner that satisfies all four constraints natively with zero extra dependency and the fastest feedback. Manual DOM setup is a scoped exception (Mermaid-DOM files only), not a primary-path blocker.

### Alternative 2 — vitest

- **Summary:** `vitest` — active 2026, Jest-compatible, mature DOM env config (jsdom/happy-dom per-file), but experimental Bun support (jsdom-under-Bun issue oven-sh/bun#4145), ~0.9s run.
- **Pros:** Mature per-file DOM environment config (jsdom/happy-dom); Jest-compatible; active.
- **Cons:** Experimental Bun support (jsdom-under-Bun #4145) is a documented open issue; slower (~0.9s); adds a dependency and Vite config.
- **Constraint compliance:** C-1 ⚠️ (experimental Bun support; #4145); C-2 ✅; C-3 ✅; C-4 ✅.
- **Why rejected as primary:** C-1 ⚠️ (experimental Bun support) is an accepted-risk exception on a non-negotiable constraint — unacceptable for the primary runner. Retained as the **scoped exception** for Mermaid-DOM test files only IF `bun:test` DOM setup proves painful (using happy-dom).

### Alternative 3 — node:test

- **Summary:** `node:test` — Node built-in API, limited `assert.snapshot`, no watch mode, Node 22+ only.
- **Pros:** Built into Node; no dependency.
- **Cons:** Not Bun-native (C-1 ⚠️); limited snapshot support (C-2 ⚠️); no built-in HTTP mock server (C-3 ⚠️); no watch mode; Node 22+ only.
- **Constraint compliance:** C-1 ⚠️; C-2 ⚠️; C-3 ⚠️; C-4 ✅.
- **Why rejected:** Three ⚠️ on non-negotiable constraints; not Bun-native. Wrong fit for a Bun-first toolchain.

### Alternative 4 — jest

- **Summary:** `jest` — CJS-heavy, ESM pain, slowing in 2025, ~1.2s run.
- **Pros:** Most widely known; mature snapshots and mocks.
- **Cons:** CJS-heavy with ESM pain (C-4 ⚠️); not Bun-native (C-1 ⚠️); slowest (~1.2s); declining momentum in 2025.
- **Constraint compliance:** C-1 ⚠️; C-2 ✅; C-3 ✅; C-4 ⚠️.
- **Why rejected:** Not Bun-native; CJS/ESM friction conflicts with the ESM-only codebase.

### Alternative 5 — uvu

- **Summary:** `uvu` — unmaintained.
- **Pros:** Tiny, fast.
- **Cons:** Unmaintained; snapshot via plugin only; no built-in HTTP mock server.
- **Constraint compliance:** C-1 ⚠️; C-2 ⚠️; C-3 ⚠️; C-4 ✅.
- **Why rejected:** Unmaintained; three ⚠️ on non-negotiable constraints.

## Decision

**Recommendation: Alternative 1 — `bun:test` as the primary runner for unit/integration/golden-fixture tests, with three scoped exceptions:**

1. **Primary — `bun:test` for unit/integration/golden.** Native, fastest (~0.08s), zero extra dependency, Jest-compatible API. Snapshots (`toMatchSnapshot`/`toMatchInlineSnapshot`) serve the golden-fixture tier for the Storage renderer (ADR-0002 C-1). `mock()`/`spyOn()` + `Bun.serve()` HTTP mock server serve the Confluence-adapter integration tier (including scripted 409/version-conflict for drift detection — A-FEA-5).
2. **Scoped exception — `vitest` + `happy-dom` for Mermaid-DOM test files only, IF `bun:test` DOM setup proves painful.** Mixing runners is sensible when a narrow tier has a specific need (DOM environment) the primary runner handles manually. This is a conditional, scoped exception, not a default — re-evaluate at the ADR-0002 spike.
3. **E2E — a thin runner script for the live-sandbox tier.** A dedicated Confluence test space (not per-suite) exercised by a small script, not a heavy framework. Keeps the live-sandbox tier isolated from the fast unit/integration/golden loop.
4. **Gherkin/BDD — `@cucumber/cucumber` (or a thin wrapper) for lifecycle-invariant tests only.** Limited to `INV-SAFE-1`, `INV-SAFE-2`, `INV-SAFE-3`, `INV-SEC-1` (premortem §8.2). Gherkin is not used for the whole suite — only for the high-value release-blocking invariants.

The primary choice (`bun:test`) is driven by C-1 (Bun-native) and the speed/zero-dependency advantage; the scoped exceptions acknowledge that tier heterogeneity is real and that forcing one runner across all four tiers is false economy.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in
> external-researcher findings (2026-07-04) and the existing ADR-0001/ADR-0002
> constraints. The human decider (Juliusz Ćwiąkalski) has **not yet** confirmed
> and has stated no prior preference for this kind of setup. `status: Proposed`
> until human review and confirmation. Run-time benchmarks and feature-coverage
> figures are research-sourced and should be re-verified against the live
> bun:test / vitest docs before the runner is locked.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — `bun:test` as primary) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** `bun:test` is native to the Bun runtime; runs under the Bun dev workflow and in CI with stable exit codes and parseable output; ~0.08s run.
- **C-2 — ✅ Full compliance:** `toMatchSnapshot`/`toMatchInlineSnapshot` provide snapshot/golden-fixture support for the deterministic Storage renderer (ADR-0002 C-1).
- **C-3 — ✅ Full compliance:** `mock()`/`spyOn()` provide mock/spy ergonomics; `Bun.serve()` provides a controllable HTTP mock server for the Confluence adapter, including scripted 409/version-conflict responses (A-FEA-5).
- **C-4 — ✅ Full compliance:** `bun:test` is ESM-native.

No accepted-risk exceptions are required for the primary runner. The scoped vitest exception (Alt 2) carries a C-1 ⚠️ (experimental Bun support, #4145) and is permitted **only** as a conditional, scoped exception for Mermaid-DOM test files if `bun:test` DOM setup proves painful — it is not the primary path and is re-evaluated at the ADR-0002 spike.

## Trade-offs & Consequences

### Positive Outcomes

- Native, fastest test feedback (~0.08s) with zero extra dependency for the primary tiers.
- Jest-compatible API lowers contributor onboarding friction.
- `Bun.serve()` HTTP mock server cleanly exercises the Confluence adapter and the 409 drift-detection path (A-FEA-5).
- Snapshots serve the deterministic Storage renderer golden-fixture tier (ADR-0002 C-1).
- Scoped exceptions acknowledge tier heterogeneity without over-engineering the common case.

### Negative Outcomes

- Manual DOM environment setup for Mermaid-renderer tests (no built-in `environment: 'jsdom'`); mitigated by the scoped vitest+happy-dom exception.
- No built-in Gherkin; mitigated by `@cucumber/cucumber` (or a thin wrapper) for lifecycle invariants only.
- A thin E2E runner script is bespoke and must be maintained (small surface, single dedicated sandbox).
- Mixing runners (bun:test primary + scoped vitest) adds a small amount of CI configuration complexity.

### Unresolved Questions

- [ ] **Mermaid-DOM gate:** confirm at the ADR-0002 spike whether `bun:test` DOM setup is painful enough to invoke the scoped vitest+happy-dom exception, or whether `bun:test` + a manual jsdom setup suffices. (owner: Juliusz Ćwiąkalski)
- [ ] **Snapshot stability across Bun versions:** verify golden-fixture snapshots are stable across Bun minor versions (renderer determinism — ADR-0002 C-1). (owner: Juliusz Ćwiąkalski)
- [ ] **Gherkin scope:** confirm `@cucumber/cucumber` vs a thin custom wrapper for the four lifecycle invariants — `@cucumber/cucumber` adds a dependency; a thin wrapper avoids it. (owner: Juliusz Ćwiąkalski)
- [ ] **Live-sandbox isolation:** define the dedicated Confluence test-space hygiene policy (cleanup cadence, concurrency limits) so the E2E tier does not flap. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — the testing foundation directly protects the no-silent-overwrite brand promise (R-VAL-4) and Mermaid-renderer determinism (ADR-0002 C-1); snapshot + HTTP-mock coverage of the 409 path is value-defending.
- **Usability** — native `bun:test` + Jest-compatible API keeps contributor onboarding low-friction; the scoped exceptions are narrow and justified.
- **Feasibility** — medium uncertainty: `bun:test` is proven native, but the Mermaid-DOM setup and snapshot-stability-across-Bun-versions are spike-gated (ADR-0002); the scoped vitest exception de-risks the DOM tier.
- **Viability** — a single primary runner + narrow exceptions is sustainable for a solo maintainer (A-VIA-2); the thin E2E runner avoids a heavy framework's support burden.

## Implementation Plan

1. **Primary runner:** configure `bun:test` for unit/integration/golden tiers; establish the `bun run test` invocation and CI step with stable, parseable output.
2. **Golden-fixture tier:** capture Storage-renderer output snapshots (ADR-0005); snapshot updates are an explicit, reviewable action (`--update-snapshots`), never silent.
3. **Confluence-adapter integration:** stand up a `Bun.serve()` HTTP mock server that scripts responses including the version-conflict 409 (A-FEA-5) for drift-detection tests; isolate all REST v2/v1 distinctions behind the adapter (A-FEA-6).
4. **Mermaid-DOM tier (conditional):** at the ADR-0002 spike, evaluate `bun:test` + manual jsdom vs scoped `vitest` + `happy-dom`; invoke the scoped exception only if manual DOM setup proves painful.
5. **E2E tier:** implement a thin runner script targeting a dedicated Confluence test space (not per-suite); gate behind `E2E` env/credentials; isolate from the fast loop.
6. **Gherkin invariants:** implement `INV-SAFE-1`, `INV-SAFE-2`, `INV-SAFE-3`, `INV-SEC-1` via `@cucumber/cucumber` (or a thin wrapper); limit Gherkin to these four release-blocking invariants.
7. **CI baseline (Phase 4):** wire the unit/integration/golden suite into the push CI; gate the E2E tier on a separate schedule/label to avoid flakiness in the fast loop.

**Risk mitigation during implementation:** if `bun:test` snapshots prove unstable across Bun versions, pin the Bun version per release and re-baseline snapshots as an explicit, reviewed action (do not let snapshots silently regenerate). If the `Bun.serve()` mock cannot reproduce a needed Confluence scenario, escalate to a recorded-HTTP-replay fixture.

## Verification Criteria

- **Metric: Primary-tier run time** — Target: unit/integration/golden suite runs in ≤ ~5 s under `bun:test` in CI — Window: `MS-0002`.
- **Metric: Golden-fixture stability** — Target: Storage-renderer snapshots are byte-stable across runs; updates are explicit and reviewed — Window: `MS-0002` (ADR-0002 C-1).
- **Metric: 409 drift-detection coverage** — Target: an integration test scripts a 409 via `Bun.serve()` and asserts drift classification — Window: `MS-0002` (A-FEA-5).
- **Metric: Lifecycle-invariant Gherkin** — Target: `INV-SAFE-1`, `INV-SAFE-2`, `INV-SAFE-3`, `INV-SEC-1` pass as Gherkin scenarios — Window: `MS-0002`.
- **Metric: E2E isolation** — Target: the live-sandbox E2E tier runs in a separate CI gate and does not flap the fast loop — Window: `MS-0002`.

## Confidence Rating

**Medium-High.** `bun:test` cleanly satisfies all four constraints natively with the fastest feedback and zero extra dependency. The residual uncertainty is medium and spike-gated: Mermaid-DOM setup (ADR-0002 spike) and snapshot stability across Bun versions. Both are mitigated by the scoped vitest+happy-dom exception and explicit snapshot-update policy. The tier-heterogeneity framing (primary + scoped exceptions) is the right shape for MarkSync's four test tiers. Research-sourced run-time benchmarks and feature-coverage figures should be re-verified against the live `bun:test` / `vitest` docs before the runner is locked.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (parent decision; Implementation Plan calls for re-specifying the testing strategy for TS).
- ADR-0002 — Mermaid rendering strategy (renderer determinism C-1; spike-gated `A-FEA-1`, `testing`).
- ADR-0005 — Storage renderer (golden-fixture target).
- ADR-0006 — `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (lifecycle invariants `INV-SAFE-1/2/3`).
- `doc/overview/tech-stack.md` — testing runner flagged as spike-gated via ADR-0002.
- `doc/overview/architecture-overview.md` — Confluence adapter isolation (A-FEA-6); module governance.
- `doc/inception/system-specification-draft-from-ai-brainstorm.md` — §7.9, §9.1, §13 (CI-first contract); §9.7 (Confluence adapter); testing strategy (unit/integration/E2E/Gherkin/golden).
- `doc/inception/analysis/id-prefix-catalog.md` — A-FEA-1, A-FEA-5, A-FEA-6, R-VAL-4, INV-SAFE-1/2/3, INV-SEC-1, MS-0002 identifiers.
- External research (2026-07-04): bun.com/docs/test, vitest.dev, github.com/oven-sh/bun/issues/4145, pkgpulse.com (bun-test-vs-vitest comparison).
