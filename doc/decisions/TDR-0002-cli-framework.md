---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0002
decision_type: tdr
status: Accepted
created: 2026-07-04
decision_date: null
last_updated: 2026-07-05
summary: "Use stable Cliffy 1.x (@cliffy/command + @cliffy/prompt + @cliffy/flags) as the CLI framework: TS-native, with subcommands, typed flags, help, shell completions, and interactive prompts for init/doctor. Pin the latest verified stable version after a `bun build --compile` smoke test. Fallback watchlist: Crust/Bunli/Clerc (Bun-native evolution) and commander + @inquirer/prompts/@clack/prompts + completion glue (mature-ecosystem contingency)."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines CLI ergonomics (init/doctor prompts, completions) and the maintainable command surface of the single binary."
customer_impact: "Affects install/onboarding friction (shell completions, guided init) and the quality of help output."
classification:
  domains: [architecture, tooling]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: moderate
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
  - "A breaking Bun `build --compile` change makes Cliffy uncompilable without a fork (smaller ecosystem than commander/yargs means fewer community fixes)."
  - "Cliffy upstream goes unmaintained for >12 months and a Bun runtime change breaks the 1.x API."
  - "Crust, Bunli, or Clerc (or another Bun-native CLI library) reaches production maturity and offers a lower-risk swap."
  - "Interactive prompts prove unnecessary because init/doctor move to a fully non-interactive, config-driven flow."
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
  roadmap_items: [MS-0003]
---

# TDR-0002: CLI framework — Cliffy for subcommands, prompts, and completions

## Context

This is a sub-decision of ADR-0001 (implementation language and runtime). ADR-0001's Implementation Plan table explicitly parks the CLI framework choice for bootstrap: "Cobra → `cliffy` / `commander` / `clipanion` (pick during bootstrap)". The tech-stack draft (`doc/overview/tech-stack.md`) currently lists `@cliffy/command` (Cliffy) as a provisional entry flagged `_Sub-decision — see OPEN-Q2_`.

MarkSync needs a CLI framework that supplies:

- **Subcommands** for the command surface: `plan`, `apply`, `doctor`, `repair-state`, `init`, `pull`.
- **Typed flags**, generated **help**, and **shell completions** (bash/zsh/fish) — completions reduce onboarding friction for an OSS CLI.
- **Interactive prompts** for `marksync init` (guided project setup) and `doctor` progressive disclosure (R-USA-1 diagnostics). CI runs are non-interactive, so prompts must be bypassable via flags/env — but the prompt capability itself is required for the local-interactive flows.
- Clean compilation under **`bun build --compile`** into the single self-contained binary (ADR-0001 C-2).

FACT: ADR-0001 fixed TypeScript + Bun `build --compile`; no CLI framework is bundled by the runtime. FACT: the spec's CI-first contract requires `--non-interactive`, `--format json`, and stable exit codes (`doc/inception/system-specification-draft-from-ai-brainstorm.md` §7.9, §9.1) — these are output-contract concerns owned by MarkSync (see Decision: Design boundaries), not framework selection criteria. FACT: the mature Node CLI parsers (commander, yargs, oclif, clipanion, citty, cac) do not bundle an interactive prompt kit, and only some (yargs: Bash/Zsh; oclif: via plugins) ship completion generation — so a single-library pick covering both prompts and completions removes integration glue.

**User direction (OPEN-Q2 answer):** "Create dedicated decision record for choosing the CLI stack, document options considered so far and recommendation. I'll evaluate and review the ADR."

## Problem Framing (Clarified)

The surface question ("which CLI library is most popular") is the wrong frame. The real question is: **which library satisfies all four hard requirements (Bun compile, interactive prompts, subcommands+typed flags+help+completions, ESM+TS-native) at an acceptable maintenance and swap cost?**

Most mature libraries satisfy two of the four (subcommands/flags/help + ESM) but fail prompts and/or completions, forcing a second dependency for the missing capability. A single library that covers all four removes integration glue and keeps the binary lean. The residual risk for any single-library choice is **maintenance**: if upstream stalls or a Bun breaking change lands, the swap cost is bounded only if the framework is modular and isolated behind the presentation adapter (`src/cli/`).

Reframed: pick the library that (a) passes every constraint, (b) minimizes additional dependencies, and (c) keeps the swap cost low through modular packages and a presentation-layer boundary.

## Constraints (Hard Requirements)

### C-1: Compiles cleanly under `bun build --compile`

- **Statement:** The CLI framework must compile into the single self-contained binary via `bun build --compile` with no Node-only dependencies that break compilation or emit blocking warnings. No mandatory language runtime for end users.
- **Source:** ADR-0001 (C-2 single binary; C-3 cross-compile).
- **Verification:** A release-smoke build produces a runnable binary that executes `marksync --help` on a clean OS image with no Node/Bun installed.
- **Negotiable:** no.

### C-2: Interactive prompts (for `marksync init` / `doctor`)

- **Statement:** The framework must provide an interactive prompt kit (select, confirm, input, multi-select) usable for guided `init` and `doctor` progressive disclosure, while remaining bypassable in CI via flags/env.
- **Source:** Spec §9.1 (non-interactive contract); R-USA-1 (doctor diagnostics); OPEN-Q2 direction.
- **Verification:** `marksync init` runs interactively locally and non-interactively in CI with equivalent results.
- **Negotiable:** no.

### C-3: Subcommands + typed flags + help + shell completions

- **Statement:** The framework must support nested subcommands, typed/validated flags, generated help text, and shell-completion generation (bash/zsh/fish) out of the box.
- **Source:** Command surface (`plan`, `apply`, `doctor`, `repair-state`, `init`, `pull`); OSS onboarding friction (A-USA-1).
- **Verification:** `marksync <cmd> --help` renders; `marksync completions bash` emits a sourceable completion script.
- **Negotiable:** no.

### C-4: ESM + TypeScript-native API

- **Statement:** The framework must ship as ESM with a TypeScript-native API (types and DX), consistent with the ESM-only codebase (ADR-0001; tech-stack.md).
- **Source:** ADR-0001 (TypeScript/ESM); tech-stack.md (ESM + Web APIs).
- **Verification:** `tsc --noEmit` passes with the framework imported; no CJS-interop shims required.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Low onboarding friction for an OSS CLI — shell completions and guided `init` are differentiators against hand-rolled competitors (A-USA-1).
- A single framework covering prompts + completions avoids a second dependency and integration surface.

**Technical drivers:**
- Clean `bun build --compile` single-binary compilation (ADR-0001 C-2).
- ESM + TypeScript-native DX across the codebase.
- Minimal additional bundle weight inside the single binary.

**Operational drivers:**
- Maintainability: a framework that is modular and isolated behind the presentation adapter keeps the swap cost low if upstream stalls.
- Cognitive load: one library for commands, flags, help, prompts, and completions beats stitching two or three together.

## Mental Models & Techniques Used

- **First Principles:** What is irreducible? Subcommands, typed flags, help, prompts, completions — all must exist. Which single library provides all five without external glue?
- **Opportunity Cost:** Choosing a mature-but-incomplete parser (commander/yargs) costs a second dependency for prompts (and often completions); choosing a complete-but-smaller-ecosystem library (Cliffy) costs maintenance/ecosystem risk. Which cost is cheaper to carry and to reverse?
- **Second-Order Thinking:** A Bun runtime breaking change against a smaller-ecosystem framework cascades into a fork-or-swap decision — bounded by modular packages and the presentation-adapter boundary.
- **Inversion:** "How does a CLI framework choice become a project-killer?" → coupling prompt/completion logic into business code, or picking a lib whose real `bun build --compile` behavior is unverified. Each is closed by a control below (presentation boundary; constraint C-1 smoke-test gate).
- **Expected Value (maintenance/ecosystem risk):** Cliffy is stable 1.x with an active 2026 release cadence; the probability of a breaking Bun change that forks it is non-zero but bounded; the swap cost is low given modularity. EV favors Cliffy over stitching commander + a prompt lib + a completion generator.
- **KISS:** one library covering the full surface beats a multi-library stack.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`) · 🟡 = expected to pass but not yet proven; requires real verification (e.g., a `bun build --compile` smoke test) before final acceptance. Research data: external-researcher, 2026-07-04; updated 2026-07-05 per ADR review.

|          | C-1 (bun compile) | C-2 (prompts) | C-3 (subcommands+flags+help+completions) | C-4 (ESM+TS-native) |
|----------|-------------------|---------------|------------------------------------------|---------------------|
| Alt 0 (hand-roll)         | ✅ | ❌ | ❌ (must build completions) | ✅ |
| Alt 1 — Cliffy            | 🟡 (expected; pending smoke test) | ✅ | ✅ | ✅ |
| Alt 2 — citty             | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 3 — commander         | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 4 — clipanion         | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 5 — yargs             | 🟡 (ESM-first now; Bun-compile must be verified) | ❌ | ✅ (Bash/Zsh completions; fish unclear) | ✅ (v18 ESM-first) |
| Alt 6 — cac               | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 7 — Crust             | ⚠️ (Bun-native, unproven at scale) | ✅ | ✅ | ✅ |
| Alt 8 — oclif             | ⚠️ (Node-centric, heavier; compile must be verified) | ❌ | ⚠️ (autocomplete via plugins; no fish out of box) | ✅ |
| Alt 9 — Clerc             | 🟡 (cross-runtime incl. Bun; pending smoke test) | ❌ | ✅ (completions built-in) | ✅ (ESM-only) |
| Alt 10 — Bunli            | ⚠️ (Bun-native; very low adoption) | ✅ | ✅ (completions) | ✅ |
| Fallback component — `@inquirer/prompts` | n/a (prompt lib) | ✅ (best-known prompt kit) | n/a | ✅ |
| Fallback component — `@clack/prompts`    | n/a (prompt lib) | ✅ (modern, lighter)       | n/a | ✅ |

### Maturity & Popularity Evidence

GitHub/npm data, research-sourced 2026-07-05 (per ADR review; re-verify against live registries before locking the dependency). Caveat: star counts and npm download numbers are directional — transitive dependencies inflate download counts — so weigh stars, forks, release cadence, dependents, and issue velocity together.

| Library | Stars | Forks | Latest release | Notes |
|---------|------:|------:|----------------|-------|
| Cliffy | ~1.2k | ~79 | v1.2.1 (June 4 2026) | Stable 1.x; commands + prompts + completions; cross-runtime (Deno/Node/Bun). |
| Commander | ~28.3k | — | v15 (May 2026) | Most mature Node CLI parser; no prompts/completions in core. |
| yargs | ~11.5k | — | v18 (2025) | ESM-first since v18; Bash/Zsh completions; no integrated prompts. |
| oclif | ~9.6k | — | active 2026 | Salesforce-backed, plugin architecture; Node-centric, heavier. |
| citty | ~1.3k | — | v0.2.2 (April 2026) | UnJS; tiny, cross-runtime-friendly; no prompts/completions. |
| clipanion | ~1.3k | — | active | Type-safe, class-based (used by Yarn); no prompts/completions. |
| cac | ~3.1k | ~113 | v7.0.0 (Feb 27 2026) | Active again; parser only, no prompts/completions. |
| Crust | ~392 | — | June 2026 (alpha/beta modules) | Bun-native; very early. |
| Bunli | ~92 | — | 2026 | Bun-native CLI framework; very low adoption. |
| Clerc | — | — | active 2026 | Cross-runtime (Node/Deno/Bun), ESM-only, completions built-in. |
| `@inquirer/prompts` | ~21.6k | — | active 2026 | Best-known prompt toolkit; multi-library fallback component. |
| `@clack/prompts` | — | — | active 2026 | Modern, lighter prompt toolkit; fallback component. |

### Alternative 0 — Do Nothing / Hand-roll argv parsing

- **Summary:** Parse `process.argv` manually; build help, completions, and prompts by hand.
- **Pros:** Zero dependencies; full control.
- **Cons:** Reimplements completions and prompts (high effort, bug-prone); no typed-flag validation; diverges from spec's command surface quality bar.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; **C-3 ❌**; C-4 ✅.
- **Why rejected:** Fails C-2 and C-3 (non-negotiable). Completions and prompts are exactly what a framework should provide.

### Alternative 1 — Cliffy (`@cliffy/command` + `@cliffy/prompt`) (RECOMMENDED)

- **Summary:** Use stable Cliffy 1.x (latest verified: v1.2.1, June 4 2026) — Bun-compatible (`BunRuntime` class), subcommands + prompts + completions (bash/zsh/fish), ~200 KB, TS-native, modular packages.
- **Pros:** Most feature-complete integrated fit for init/doctor prompts + completions; Bun-compatible and expected to compile cleanly (real `bun build --compile` smoke test still required); modular packages bound the swap cost; TS-native API (C-4 ✅); active 1.x release cadence in 2026.
- **Cons:** Smaller ecosystem and lower mainstream familiarity than commander/yargs/oclif; cross-runtime/Bun compile must be continuously smoke-tested.
- **Constraint compliance:** C-1 🟡 (expected, pending real smoke test); C-2 ✅; C-3 ✅; C-4 ✅.
- **Why chosen:** The only sufficiently mature *integrated* option satisfying all four constraints without glue (commander/yargs/oclif are more mature overall but incomplete for prompts and/or completions). The residual ecosystem/compile risk is mitigated by pinning a verified stable 1.x, modularity, the presentation-adapter boundary, and a fallback watchlist (Crust/Bunli/Clerc; commander + prompt lib + completion glue).

### Alternative 2 — citty (UnJS)

- **Summary:** citty 0.2.x (latest v0.2.2, April 2026) — zero-dependency, built on `util.parseArgs`, ~15 KB, ~1.3k stars; active in 2026.
- **Pros:** Tiny, zero-dep, active, ESM + TS, cross-runtime-friendly.
- **Cons:** Lacks prompts and completions; would require a second library for prompts and a hand-built completion generator.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and only partially satisfies C-3. Forces the multi-library stack this decision aims to avoid.

### Alternative 3 — commander

- **Summary:** commander 15.x (latest v15, May 2026) — most mature Node CLI parser, ~28.3k stars, ~80 KB. No built-in prompts or completions.
- **Pros:** Most mature, well-documented, broad ecosystem familiarity; the natural anchor of a multi-library contingency (`commander + @inquirer/prompts/@clack/prompts + completion glue`).
- **Cons:** No prompts, no completions; would require a second dependency (e.g., `@inquirer/prompts` or `@clack/prompts`) plus a completion generator.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected as primary:** Fails C-2 and partially fails C-3. Its far greater overall maturity does not offset the missing integrated capabilities for MarkSync's weighted requirements; retained as the **mature-ecosystem contingency** if Cliffy fails compile, completion quality, or maintenance expectations.

### Alternative 4 — clipanion

- **Summary:** clipanion 4.x — ~1.3k stars, ~120 KB, active; type-safe class-based command model used by Yarn. No prompts or completions.
- **Pros:** TS-native, type-safe class-based command model.
- **Cons:** No prompts, no completions; same glue cost as commander.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and partially fails C-3.

### Alternative 5 — yargs

- **Summary:** yargs 18.x (2025, ESM-first) — ~11.5k stars, mature, feature-rich; generates Bash and Zsh completion scripts.
- **Pros:** Mature and broadly familiar; v18 is ESM-first with modern Node requirements; ships Bash/Zsh completions.
- **Cons:** No integrated prompt kit (still forces a second library); fish completion coverage unclear; Node-oriented and less Bun-native than Cliffy — real `bun build --compile` behavior must be verified, not assumed.
- **Constraint compliance:** **C-1 🟡** (ESM-first now, but Bun-compile not proven); C-2 ❌; C-3 ✅ (Bash/Zsh completions; fish unclear); C-4 ✅ (v18 ESM-first).
- **Why rejected:** Fails C-2 (no integrated prompts) and is less aligned with the Bun/TS-native single-binary story. No longer rejected on outdated "CJS legacy" grounds.

### Alternative 6 — cac

- **Summary:** cac 7.x (v7.0.0, Feb 27 2026) — zero-dependency, small parser; ~3.1k stars, ~113 forks. No prompts or completions.
- **Pros:** Tiny, zero-dep, ESM; actively maintained again as of v7 (Feb 2026).
- **Cons:** No prompts, no completions — a parser only; would still force a multi-library stack.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and partially fails C-3. Rejected for missing capabilities, **not** for staleness (upstream is active again as of Feb 2026).

### Alternative 7 — Crust (fallback watchlist)

- **Summary:** Crust 0.x — new (HN Show late 2025), ~392 stars, Bun-native, zero-dependency, full-featured (prompts + completions); alpha/beta modules, latest June 2026.
- **Pros:** Bun-native, zero-dep, full-featured; aligns with the single-binary story.
- **Cons:** Unproven at scale; 0.x maturity; emerging — not yet a safe primary choice.
- **Constraint compliance:** C-1 ⚠️ (Bun-native but unproven at scale); C-2 ✅; C-3 ✅; C-4 ✅.
- **Why rejected as primary:** C-1 carries unproven-at-scale risk unacceptable for a primary choice. Retained on the **fallback watchlist** for `MS-0003` if Cliffy stalls. (Crust maturity gate: stable 1.0, >12 months active maintenance, real Bun-compile proof, completion parity, and an adoption threshold — see Unresolved Questions.)

### Alternative 8 — oclif

- **Summary:** oclif — Salesforce-backed, ~9.6k stars, very mature and active in 2026; TypeScript, plugin architecture, auto docs, autocomplete, installers.
- **Pros:** Excellent for complex/plugin CLIs; the most mature option overall alongside commander; strong docs and corporate backing.
- **Cons:** Node-centric and heavier than MarkSync needs; no integrated prompt kit; less ideal for a Bun single-binary; autocomplete is plugin-based (no fish out of the box).
- **Constraint compliance:** C-1 ⚠️ (Node-centric, heavier; Bun-compile must be verified); **C-2 ❌**; C-3 ⚠️ (autocomplete via plugins; no fish out of box); C-4 ✅.
- **Why rejected:** Fails C-2 and is a poor Bun-single-binary fit for MarkSync's weighted requirements. Worth documenting because of its maturity, but not the right shape for this product.

### Alternative 9 — Clerc (watchlist / spike candidate)

- **Summary:** Clerc — cross-runtime (Node/Deno/Bun), ESM-only, full-featured CLI with built-in completions; active in 2026.
- **Pros:** Cross-runtime incl. Bun; completions built-in; ESM-only; conceptually close to Cliffy's integrated shape.
- **Cons:** No integrated prompt kit; smaller ecosystem than Cliffy; real Bun-compile behavior must be verified.
- **Constraint compliance:** C-1 🟡 (cross-runtime incl. Bun; pending smoke test); **C-2 ❌**; C-3 ✅ (completions built-in); C-4 ✅ (ESM-only).
- **Why rejected as primary:** Fails C-2 (no prompts). Worth a spike as a possible Cliffy alternative if Cliffy's compile or completion quality disappoints; placed on the watchlist, not chosen now.

### Alternative 10 — Bunli (watchlist only)

- **Summary:** Bunli — Bun-native CLI framework with standalone build and completions; ~92 stars, latest 2026.
- **Pros:** Bun-first; standalone build; completions; aligns with the single-binary story.
- **Cons:** Very low adoption (~92 stars); maturity too low to anchor a primary choice.
- **Constraint compliance:** C-1 ⚠️ (Bun-native; very low adoption); C-2 ✅; C-3 ✅ (completions); C-4 ✅.
- **Why rejected:** Maturity/adoption risk is unacceptable for a primary choice. Watchlist only — revisit if adoption and maintenance cadence grow.

### Prompt-library fallback components (not standalone CLI frameworks)

These are **components** of the mature-ecosystem contingency (`commander + prompt lib + completion glue`), not standalone alternatives:

- **`@inquirer/prompts`** — ~21.6k stars; best-known prompt toolkit, Bun-installable, many prompt types. The default prompt library if MarkSync ever falls back to a multi-library stack.
- **`@clack/prompts`** — modern, lighter prompt toolkit, active in 2026; the leaner fallback when bundle weight matters.

They are irrelevant to framework selection on their own (they provide no command parser, help, or completions) but are named here so the contingency stack is concrete, not abstract.

## Decision

**Recommendation: Alternative 1 — Cliffy (`@cliffy/command` + `@cliffy/prompt` + `@cliffy/flags`), pinned to stable 1.x (latest verified: v1.2.1). The exact version is locked only after a real `bun build --compile` smoke test and shell-completion verification pass.**

Cliffy is the only sufficiently mature *integrated* option that satisfies all four constraints without stitching multiple libraries together (commander/yargs/oclif are more mature overall but incomplete for prompts and/or completions). The residual risk is **not** pre-1.0 instability (Cliffy is stable 1.x with an active 2026 cadence) but rather: (a) a smaller ecosystem than commander/yargs, and (b) cross-runtime/Bun compile that must be continuously smoke-tested. This risk is consciously accepted and bounded by five mitigations:

1. **Pin a verified stable 1.x** (e.g., `1.2.x`); lock the exact version only after a `bun build --compile` smoke test on Linux/macOS/Windows confirms a runnable binary with no compile warnings attributed to Cliffy.
2. **Compile-smoke gate as a prerequisite before final acceptance:** this ADR stays `status: Proposed` and the dependency is not locked until the smoke test and completion-verification pass (see Verification Criteria). C-1 is *expected, not yet proven*.
3. **Modular packages** (`@cliffy/command`, `@cliffy/prompt`, `@cliffy/flags`) bound the swap cost — a failing module can be replaced piecemeal.
4. **Presentation-adapter boundary:** all Cliffy usage lives in `src/cli/` (presentation tier per `doc/overview/architecture-overview.md` module governance); no business/domain code imports Cliffy. The framework is swappable without touching the application/domain/infrastructure tiers.
5. **Fallback watchlist:** Crust/Bunli/Clerc for Bun-native evolution; `commander + @inquirer/prompts/@clack/prompts + completion glue` as the mature-ecosystem contingency if Cliffy fails compile, completion quality, or maintenance expectations.

**Design boundaries (owned by MarkSync, not the CLI framework):** the JSON output contract (`--format json`), the non-interactive contract (`--non-interactive`), and the stable exit-code contract are **owned by MarkSync**, layered above the framework in the output service (`src/cli/output/`). The CLI framework is responsible for command parsing, flag typing, help, completions, and prompts only; it must never be the arbiter of output format or exit codes. Prompts are bypassable via flags/env, so Cliffy's interactive capability never compromises the CI/agent contract.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in
> external-researcher findings (2026-07-04, updated 2026-07-05 per ADR review)
> and the existing ADR-0001 constraints. The human decider (Juliusz Ćwiąkalski)
> has **not yet** confirmed. `status: Proposed` until human review, confirmation,
> **and** the `bun build --compile` smoke test pass. Library version, bundle size,
> star/fork counts, release dates, and feature-coverage figures are research-sourced
> and must be re-verified against the live npm registry/GitHub before locking the dependency.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — Cliffy) satisfies all documented constraints, with C-1 pending real verification:

- **C-1 — 🟡 Expected / must be verified:** Cliffy is Bun-compatible (`BunRuntime` class) and is *expected* to compile cleanly under `bun build --compile` into the single binary with no Node-only dependencies, but this is **not yet proven** for the real MarkSync bundle across Linux/macOS/Windows. The `bun build --compile` smoke test (see Verification Criteria) is a prerequisite before final acceptance and before moving from `Proposed` to `Accepted`.
- **C-2 — ✅ Full compliance:** `@cliffy/prompt` provides interactive prompts (select, confirm, input, multi-select) for `init`/`doctor`, bypassable in CI.
- **C-3 — ✅ Full compliance:** `@cliffy/command` provides subcommands, typed flags, generated help, and shell completions (bash/zsh/fish).
- **C-4 — ✅ Full compliance:** Cliffy is ESM + TypeScript-native.

C-1's pending verification is treated as a gate, not an accepted-risk exception: the constraint is non-negotiable, and the ADR does not advance to `Accepted` until the smoke test passes. The residual ecosystem/compile risk is a driver-level trade-off (not a constraint violation) and is mitigated as described above.

## Trade-offs & Consequences

### Positive Outcomes

- A single library covers commands, flags, help, prompts, and completions — no integration glue.
- Shell completions and guided `init` lower OSS onboarding friction (A-USA-1).
- The presentation-adapter boundary keeps Cliffy swappable without touching domain/application/infrastructure code.
- Modular packages bound the swap cost if a module needs replacement.

### Negative Outcomes

- Cliffy has a smaller ecosystem and lower mainstream familiarity than commander/yargs/oclif; a breaking Bun `build --compile` change could force a fork or swap (mitigated by the smoke-test gate and fallback watchlist).
- ~200 KB added to the binary (acceptable within the ≤ 90 MB budget from ADR-0001).
- Lower external-contributor familiarity than commander/yargs.

### Unresolved Questions

- [ ] **Exact version lock:** pin the latest verified stable 1.x (e.g., `1.2.x`) after the `bun build --compile` smoke test passes; decide follow-policy (patch-only vs minor) for Renovate/Dependabot. (owner: Juliusz Ćwiąkalski)
- [ ] **Completion coverage:** verify bash/zsh/fish completions cover all six subcommands and their flags before `MS-0002` release. (owner: Juliusz Ćwiąkalski)
- [ ] **Crust/Bunli/Clerc maturity gate:** define the measurable criteria (stable 1.0, >12 months active maintenance, real Bun-compile proof, completion parity, adoption threshold) at which a watchlist entry becomes a viable swap target for `MS-0003`. (owner: Juliusz Ćwiąkalski)
- [ ] **Clerc spike:** run a short spike comparing Clerc's compile/completion behavior to Cliffy, in case Cliffy disappoints. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — the framework choice does not compromise the trust wedge (safe publish, drift, Mermaid fidelity); it affects CLI ergonomics only. No value-driver regression.
- **Usability** — completions + guided `init` are a net positive for onboarding friction (A-USA-1); the CI non-interactive contract is preserved by layering output control above the framework.
- **Feasibility** — Cliffy's Bun compile path is *expected* (not yet proven); the residual feasibility risk is the smaller ecosystem and the need to continuously smoke-test cross-runtime/Bun compile, bounded by the smoke-test gate, pinning, modularity, and the fallback watchlist.
- **Viability** — a single-library stack is sustainable for a solo maintainer; the presentation boundary keeps contributor seams clean (R-VIA-1 mitigation).

## Implementation Plan

1. **Pin dependency:** add `@cliffy/command`, `@cliffy/prompt`, `@cliffy/flags` (and the `BunRuntime` provider) at the latest verified stable 1.x (e.g., `1.2.x`) to `package.json` — *after* the `bun build --compile` smoke test passes; record the pin rationale and follow-policy (patch/minor) in the tech-stack doc.
2. **Presentation boundary:** confine all Cliffy imports to `src/cli/` (commands, prompts, output selection). No `src/app/`, `src/domain/`, or `src/infra/` module may import Cliffy.
3. **Command surface:** implement `plan`, `apply`, `doctor`, `repair-state`, `init`, `pull` as Cliffy commands with typed flags; wire the non-interactive `--format json` / stable-exit-code contract through the output service (these contracts are owned by MarkSync, not Cliffy).
4. **Prompts:** implement `marksync init` (guided project setup) and `doctor` progressive disclosure via `@cliffy/prompt`; ensure every prompt has a flag/env bypass for CI.
5. **Completions:** wire `marksync completions <shell>` to emit bash/zsh/fish scripts; smoke-test in the release matrix.
6. **Compile gate (prerequisite before final acceptance):** add a CI step that runs `bun build --compile` and asserts the binary renders `marksync --help` with no compile warnings attributed to Cliffy, on Linux/macOS/Windows. This gate must pass before the ADR advances from `Proposed` to `Accepted` and before the dependency version is locked.
7. **Swap-cost guardrail:** keep an interface seam between command definitions and use-case orchestration so the framework is replaceable without rewriting command logic.

**Risk mitigation during implementation:** if a Bun `build --compile` change breaks Cliffy mid-implementation, the fallback is Crust (Alt 7) behind the same presentation boundary; the command-surface definitions are preserved.

## Verification Criteria

- **Metric: Clean-OS binary help (acceptance gate)** — Target: compiled binary runs `marksync --help` on a clean OS image (Linux/macOS/Windows) with no Node/Bun installed, zero compile warnings — Window: first vertical slice. **This metric is a prerequisite before the ADR moves from `Proposed` to `Accepted` and before the dependency version is locked.**
- **Metric: Completion generation** — Target: `marksync completions bash|zsh|fish` emits a sourceable script covering all six subcommands — Window: `MS-0002`.
- **Metric: Interactive + non-interactive parity** — Target: `marksync init` interactive and `--non-interactive` flag-driven paths produce equivalent `ProjectConfig` — Window: `MS-0002`.
- **Metric: Presentation-boundary isolation** — Target: `rg '@cliffy' src/app src/domain src/infra` returns zero matches — Window: continuous (CI lint).

## Confidence Rating

**Medium-High.** Cliffy cleanly satisfies all four constraints and is the only sufficiently mature *integrated* single-library option covering prompts + completions (commander/yargs/oclif are more mature overall but incomplete). The residual uncertainty is the smaller ecosystem and the as-yet-unproven real `bun build --compile` behavior for the MarkSync bundle — bounded by the compile-smoke acceptance gate, pinning a verified stable 1.x, modular packages, the presentation-adapter boundary, and the fallback watchlist (Crust/Bunli/Clerc; commander + prompt lib + completion glue). Research-sourced version/size/stars/release/feature figures should be re-verified against the live npm registry/GitHub before the dependency is locked.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (parent decision; Implementation Plan table parks the CLI framework choice).
- `doc/overview/tech-stack.md` — provisional Cliffy entry flagged `_Sub-decision — see OPEN-Q2_`.
- `doc/overview/architecture-overview.md` — module governance; presentation tier (`src/cli/`); dependency-direction matrix.
- `doc/inception/system-specification-draft-from-ai-brainstorm.md` — §7.9, §9.1 (CI-first non-interactive contract); command surface.
- `doc/inception/analysis/id-prefix-catalog.md` — A-USA-1, R-USA-1, MS-0003 identifiers.
- External research (2026-07-04): github.com/c4spar/deno-cliffy, github.com/unjs/citty, crustjs.com.
- External research update (2026-07-05, per ADR review): cliffy.io (v1.2.1), github.com/tj/commander.js, github.com/yargs/yargs, github.com/oclif/core, github.com/cacjs/cac, github.com/AryaLabsHQ/bunli, github.com/clercjs/clerc, github.com/sboudrias/inquirer.js, github.com/bombshell-dev/clack, github.com/chenxin-yan/crust.

## Revision History

| Date       | Change                                                                                                                                                                                                              | Source |
|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| 2026-07-04 | Initial record (`status: Proposed`) — recommended Cliffy pinned to `v1.0.0-rc.7`.                                                                                                                                   | ADR creation |
| 2026-07-05 | Amended per ADR review: corrected Cliffy to stable 1.x (v1.2.1, June 2026) — not pre-1.0; reframed risk from "pre-1.0 instability" to "smaller ecosystem + continuously smoke-tested Bun compile"; downgraded C-1 from "proven" to "expected / must be verified" and made the `bun build --compile` smoke test a prerequisite before final acceptance; corrected yargs (v18 ESM-first, Bash/Zsh completions) and cac (v7.0.0, Feb 2026, active) evaluations; added oclif, Clerc, Bunli, `@inquirer/prompts`, and `@clack/prompts` as alternatives/fallback components; added a maturity & popularity evidence table; softened "only mature option" to "only sufficiently mature integrated option"; added explicit design-boundary statement that JSON/exit-code contracts are owned by MarkSync, not the CLI framework. | `doc/decisions/tmp/decision-reviews/TDR-0002-review.md` |
