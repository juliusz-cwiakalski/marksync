---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0007
decision_type: adr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-04
summary: "Use Cliffy (@cliffy/command + @cliffy/prompt) as the CLI framework: Bun-compile-compatible, TS-native, with subcommands, typed flags, help, shell completions, and interactive prompts for init/doctor. Pin to v1.0.0-rc.7; Crust is the emerging fallback (MS-0003)."
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
  - "Cliffy remains pre-1.0 and a breaking Bun `build --compile` change makes it uncompilable without a fork."
  - "Cliffy upstream goes unmaintained for >12 months and a Bun runtime change breaks the RC API."
  - "Crust (or another Bun-native CLI library) reaches production maturity and offers a lower-risk swap."
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

# ADR-0007: CLI framework — Cliffy for subcommands, prompts, and completions

## Context

This is a sub-decision of ADR-0001 (implementation language and runtime). ADR-0001's Implementation Plan table explicitly parks the CLI framework choice for bootstrap: "Cobra → `cliffy` / `commander` / `clipanion` (pick during bootstrap)". The tech-stack draft (`doc/overview/tech-stack.md`) currently lists `@cliffy/commander` (Cliffy) as a provisional entry flagged `_Sub-decision — see OPEN-Q2_`.

MarkSync needs a CLI framework that supplies:

- **Subcommands** for the command surface: `plan`, `apply`, `doctor`, `repair-state`, `init`, `pull`.
- **Typed flags**, generated **help**, and **shell completions** (bash/zsh/fish) — completions reduce onboarding friction for an OSS CLI.
- **Interactive prompts** for `marksync init` (guided project setup) and `doctor` progressive disclosure (R-USA-1 diagnostics). CI runs are non-interactive, so prompts must be bypassable via flags/env — but the prompt capability itself is required for the local-interactive flows.
- Clean compilation under **`bun build --compile`** into the single self-contained binary (ADR-0001 C-2).

FACT: ADR-0001 fixed TypeScript + Bun `build --compile`; no CLI framework is bundled by the runtime. FACT: the spec's CI-first contract requires `--non-interactive`, `--format json`, and stable exit codes (`doc/inception/system-specification-draft-from-ai-brainstorm.md` §7.9, §9.1) — these are output-contract concerns layered above the framework, not framework selection criteria. FACT: most mature Node CLI libs (commander, yargs) lack built-in interactive prompts AND shell completions, which would force two extra dependencies and integration glue.

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
- **Opportunity Cost:** Choosing a mature-but-incomplete lib (commander) costs a second dependency for prompts/completions; choosing a complete-but-pre-1.0 lib (Cliffy) costs maintenance risk. Which cost is cheaper to carry and to reverse?
- **Second-Order Thinking:** A Bun runtime breaking change against a pre-1.0 framework cascades into a fork-or-swap decision — bounded by modular packages and the presentation-adapter boundary.
- **Inversion:** "How does a CLI framework choice become a project-killer?" → coupling prompt/completion logic into business code, or picking a CJS/Node-only lib that breaks `bun build --compile`. Each is closed by a control below (presentation boundary; constraint C-1).
- **Expected Value (maintenance risk):** Cliffy's API is stable at rc.7; the probability of a breaking Bun change that forks it is non-zero but bounded; the swap cost is low given modularity. EV favors Cliffy over stitching commander + a prompt lib + a completion generator.
- **KISS:** one library covering the full surface beats a multi-library stack.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). Research data: external-researcher, 2026-07-04.

|          | C-1 (bun compile) | C-2 (prompts) | C-3 (subcommands+flags+help+completions) | C-4 (ESM+TS-native) |
|----------|-------------------|---------------|------------------------------------------|---------------------|
| Alt 0 (hand-roll)         | ✅ | ❌ | ❌ (must build completions) | ✅ |
| Alt 1 — Cliffy            | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — citty             | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 3 — commander         | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 4 — clipanion         | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 5 — yargs             | ❌ (CJS legacy, Node-only deps, compile warnings) | ❌ | ✅ | ⚠️ (CJS legacy) |
| Alt 6 — cac               | ✅ | ❌ | ⚠️ (no completions) | ✅ |
| Alt 7 — Crust             | ⚠️ (Bun-native, unproven at scale) | ✅ | ✅ | ✅ |

### Alternative 0 — Do Nothing / Hand-roll argv parsing

- **Summary:** Parse `process.argv` manually; build help, completions, and prompts by hand.
- **Pros:** Zero dependencies; full control.
- **Cons:** Reimplements completions and prompts (high effort, bug-prone); no typed-flag validation; diverges from spec's command surface quality bar.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; **C-3 ❌**; C-4 ✅.
- **Why rejected:** Fails C-2 and C-3 (non-negotiable). Completions and prompts are exactly what a framework should provide.

### Alternative 1 — Cliffy (`@cliffy/command` + `@cliffy/prompt`) (RECOMMENDED)

- **Summary:** Use Cliffy v1.0.0-rc.7 — Bun-compatible (`BunRuntime` class), subcommands + prompts + completions (bash/zsh/fish), ~200 KB, TS-native, modular packages.
- **Pros:** Most feature-complete for init/doctor prompts + completions; proven Bun compile; modular packages bound the swap cost; TS-native API (C-4 ✅).
- **Cons:** Last release July 2024 (pre-1.0 RC); may need forking if a breaking Bun change occurs.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅.
- **Why chosen:** The only mature option satisfying all four constraints without glue. Maintenance risk is mitigated by pinning, API stability at rc.7, modularity, and Crust as the emerging fallback.

### Alternative 2 — citty (UnJS)

- **Summary:** citty 0.1.x — zero-dependency, built on `util.parseArgs`, ~15 KB, active 2025.
- **Pros:** Tiny, zero-dep, active, ESM + TS.
- **Cons:** Lacks prompts and completions; would require a second library for prompts and a hand-built completion generator.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and only partially satisfies C-3. Forces the multi-library stack this decision aims to avoid.

### Alternative 3 — commander

- **Summary:** commander 14.x — mature, ~80 KB, active 2025. No built-in prompts or completions.
- **Pros:** Most mature, well-documented, broad ecosystem familiarity.
- **Cons:** No prompts, no completions; would require a second dependency (e.g., `@cliffy/prompt` or `prompts`) plus a completion generator.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and partially fails C-3. Maturity does not offset the missing capabilities.

### Alternative 4 — clipanion

- **Summary:** clipanion 4.x — ~120 KB, active 2025. No prompts or completions.
- **Pros:** TS-native, class-based command model used by Yarn.
- **Cons:** No prompts, no completions; same glue cost as commander.
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and partially fails C-3.

### Alternative 5 — yargs (avoid)

- **Summary:** yargs 18.x — heavy CJS legacy, Node-only deps, ~300 KB.
- **Pros:** Feature-rich (has completions).
- **Cons:** CJS legacy and Node-only dependencies produce compile warnings/errors under `bun build --compile`; ESM pain; heaviest bundle.
- **Constraint compliance:** **C-1 ❌** (compile warnings/errors); C-2 ❌; C-3 ✅; C-4 ⚠️ (CJS legacy).
- **Why rejected:** Fails C-1 (non-negotiable). Explicitly avoid.

### Alternative 6 — cac

- **Summary:** cac 0.18.x — zero-dependency, ~15 KB, last release 2023. No prompts or completions.
- **Pros:** Tiny, zero-dep, ESM.
- **Cons:** No prompts, no completions; last release 2023 (stale).
- **Constraint compliance:** C-1 ✅; **C-2 ❌**; C-3 ⚠️ (no completions); C-4 ✅.
- **Why rejected:** Fails C-2 and partially fails C-3; stale upstream.

### Alternative 7 — Crust (emerging fallback)

- **Summary:** Crust 0.x — new (HN Show late 2025), Bun-native, zero-dependency, full-featured (prompts + completions).
- **Pros:** Bun-native, zero-dep, full-featured; aligns with the single-binary story.
- **Cons:** Unproven at scale; 0.x maturity; emerging — not yet a safe primary choice.
- **Constraint compliance:** C-1 ⚠️ (Bun-native but unproven at scale); C-2 ✅; C-3 ✅; C-4 ✅.
- **Why rejected as primary:** C-1 carries unproven-at-scale risk unacceptable for a primary choice. Retained as the **emerging fallback** for `MS-0003` if Cliffy stalls.

## Decision

**Recommendation: Alternative 1 — Cliffy (`@cliffy/command` + `@cliffy/prompt`), pinned to v1.0.0-rc.7.**

Cliffy is the only mature option that satisfies all four constraints without stitching multiple libraries together. The maintenance risk (pre-1.0, last release July 2024) is consciously accepted and bounded by four mitigations:

1. **Pin the version** to v1.0.0-rc.7; the API is stable at rc.7.
2. **Modular packages** (`@cliffy/command`, `@cliffy/prompt`, `@cliffy/flags`) bound the swap cost — a failing module can be replaced piecemeal.
3. **Presentation-adapter boundary:** all Cliffy usage lives in `src/cli/` (presentation tier per `doc/overview/architecture-overview.md` module governance); no business/domain code imports Cliffy. The framework is swappable without touching the application/domain/infrastructure tiers.
4. **Crust (Alt 7) is the emerging fallback** for `MS-0003` if Cliffy stalls or a breaking Bun change forks it.

The CI-first non-interactive contract (`--non-interactive`, `--format json`, stable exit codes) is layered above the framework in the output service (`src/cli/output/`); prompts are bypassable via flags/env, so Cliffy's interactive capability never compromises the CI contract.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in
> external-researcher findings (2026-07-04) and the existing ADR-0001
> constraints. The human decider (Juliusz Ćwiąkalski) has **not yet** confirmed.
> `status: Proposed` until human review and confirmation. Library version,
> bundle size, and feature-coverage figures are research-sourced and should be
> re-verified against the live npm registry before locking the dependency.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — Cliffy) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Cliffy is Bun-compatible (`BunRuntime` class) and compiles cleanly under `bun build --compile` into the single binary; no Node-only dependencies.
- **C-2 — ✅ Full compliance:** `@cliffy/prompt` provides interactive prompts (select, confirm, input, multi-select) for `init`/`doctor`, bypassable in CI.
- **C-3 — ✅ Full compliance:** `@cliffy/command` provides subcommands, typed flags, generated help, and shell completions (bash/zsh/fish).
- **C-4 — ✅ Full compliance:** Cliffy is ESM + TypeScript-native.

No accepted-risk exceptions are required for constraint compliance. The pre-1.0 maintenance risk is a driver-level trade-off (not a constraint violation) and is mitigated as described above.

## Trade-offs & Consequences

### Positive Outcomes

- A single library covers commands, flags, help, prompts, and completions — no integration glue.
- Shell completions and guided `init` lower OSS onboarding friction (A-USA-1).
- The presentation-adapter boundary keeps Cliffy swappable without touching domain/application/infrastructure code.
- Modular packages bound the swap cost if a module needs replacement.

### Negative Outcomes

- Cliffy is pre-1.0 (v1.0.0-rc.7); last release July 2024. A breaking Bun `build --compile` change could force a fork or swap.
- ~200 KB added to the binary (acceptable within the ≤ 90 MB budget from ADR-0001).
- Lower mainstream familiarity than commander/yargs for external contributors.

### Unresolved Questions

- [ ] **Version pin vs follow:** pin strictly to rc.7, or follow the next 1.0 stable release when it ships. (owner: Juliusz Ćwiąkalski)
- [ ] **Completion coverage:** verify bash/zsh/fish completions cover all six subcommands and their flags before `MS-0002` release. (owner: Juliusz Ćwiąkalski)
- [ ] **Crust maturity gate:** define the criteria (stability, release cadence, Bun-compile proof) at which Crust becomes a viable swap target for `MS-0003`. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — the framework choice does not compromise the trust wedge (safe publish, drift, Mermaid fidelity); it affects CLI ergonomics only. No value-driver regression.
- **Usability** — completions + guided `init` are a net positive for onboarding friction (A-USA-1); the CI non-interactive contract is preserved by layering output control above the framework.
- **Feasibility** — Cliffy's Bun compile path is proven; the residual feasibility risk is pre-1.0 maintenance, bounded by pinning + modularity + the Crust fallback.
- **Viability** — a single-library stack is sustainable for a solo maintainer; the presentation boundary keeps contributor seams clean (R-VIA-1 mitigation).

## Implementation Plan

1. **Pin dependency:** add `@cliffy/command`, `@cliffy/prompt`, `@cliffy/flags` (and the `BunRuntime` provider) at v1.0.0-rc.7 to `package.json`; record the pin rationale in the tech-stack doc.
2. **Presentation boundary:** confine all Cliffy imports to `src/cli/` (commands, prompts, output selection). No `src/app/`, `src/domain/`, or `src/infra/` module may import Cliffy.
3. **Command surface:** implement `plan`, `apply`, `doctor`, `repair-state`, `init`, `pull` as Cliffy commands with typed flags; wire the non-interactive `--format json` / stable-exit-code contract through the output service.
4. **Prompts:** implement `marksync init` (guided project setup) and `doctor` progressive disclosure via `@cliffy/prompt`; ensure every prompt has a flag/env bypass for CI.
5. **Completions:** wire `marksync completions <shell>` to emit bash/zsh/fish scripts; smoke-test in the release matrix.
6. **Compile gate:** add a CI step that runs `bun build --compile` and asserts the binary renders `marksync --help` with no compile warnings attributed to Cliffy.
7. **Swap-cost guardrail:** keep an interface seam between command definitions and use-case orchestration so the framework is replaceable without rewriting command logic.

**Risk mitigation during implementation:** if a Bun `build --compile` change breaks Cliffy mid-implementation, the fallback is Crust (Alt 7) behind the same presentation boundary; the command-surface definitions are preserved.

## Verification Criteria

- **Metric: Clean-OS binary help** — Target: compiled binary runs `marksync --help` on a clean OS image with no Node/Bun installed, zero compile warnings — Window: first vertical slice.
- **Metric: Completion generation** — Target: `marksync completions bash|zsh|fish` emits a sourceable script covering all six subcommands — Window: `MS-0002`.
- **Metric: Interactive + non-interactive parity** — Target: `marksync init` interactive and `--non-interactive` flag-driven paths produce equivalent `ProjectConfig` — Window: `MS-0002`.
- **Metric: Presentation-boundary isolation** — Target: `rg '@cliffy' src/app src/domain src/infra` returns zero matches — Window: continuous (CI lint).

## Confidence Rating

**Medium-High.** Cliffy cleanly satisfies all four constraints and is the only mature single-library option covering prompts + completions. The residual uncertainty is maintenance risk (pre-1.0, last release July 2024), which is bounded by pinning, modular packages, the presentation-adapter boundary, and the Crust fallback. Research-sourced version/size/feature figures should be re-verified against the live npm registry before the dependency is locked.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (parent decision; Implementation Plan table parks the CLI framework choice).
- `doc/overview/tech-stack.md` — provisional Cliffy entry flagged `_Sub-decision — see OPEN-Q2_`.
- `doc/overview/architecture-overview.md` — module governance; presentation tier (`src/cli/`); dependency-direction matrix.
- `doc/inception/system-specification-draft-from-ai-brainstorm.md` — §7.9, §9.1 (CI-first non-interactive contract); command surface.
- `doc/inception/analysis/id-prefix-catalog.md` — A-USA-1, R-USA-1, MS-0003 identifiers.
- External research (2026-07-04): github.com/c4spar/deno-cliffy, github.com/unjs/citty, crustjs.com.
