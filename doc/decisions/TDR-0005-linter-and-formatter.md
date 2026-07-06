---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0005
decision_type: tdr
status: Accepted
created: 2026-07-05
decision_date: null
last_updated: 2026-07-05
summary: "Use Biome for lint + format in a single tool (Rust-fast, zero-config, Bun+ESM+TS-strict compatible, 500+ rules, AI-agent-clear diagnostics). ESLint+Prettier is the fallback only if a needed rule has no Biome equivalent. Import-boundary enforcement is owned by dependency-cruiser (TDR-0006), which Biome integrates with — Biome does not itself carry that responsibility."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: tooling
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Sets the code-quality gate for the TypeScript codebase; affects solo-maintainer velocity (A-VIA-2) and AI-agent operability (clear diagnostics reduce agent fix-loop iterations)."
customer_impact: "Indirect: a consistent, low-defect codebase protects the no-silent-overwrite brand promise. No user-visible runtime effect — linter/formatter is dev-only and not compiled into the single binary."
classification:
  domains: [architecture, operations]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: easy
  stakes: low
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
  - "A needed lint rule is only available as an ESLint plugin with no Biome equivalent and no acceptable substitute — escalate that rule subset to a scoped ESLint config, or contribute the rule upstream."
  - "Biome maintenance stalls, or a breaking Bun change makes Biome incompatible with the Bun dev workflow."
  - "Biome's formatter diverges from Prettier on a load-bearing non-TS file type (e.g., Markdown/JSON/YAML) in a way that materially hurts reviewability, and the gap cannot be closed via Biome config."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [ADR-0001, TDR-0004, TDR-0006]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# TDR-0005: Linter and formatter — Biome for lint + format in one tool

## Context

This is a sub-decision of ADR-0001 (implementation language and runtime) and resolves **OPEN-Q1** (Phase 4 open questions). The `typescript.md` conventions file already records Biome as the preferred linter/formatter with ESLint+Prettier as fallback; this record validates that preference through the full eligibility-first evaluation and locks it as the Phase 4 baseline.

MarkSync needs a linter and formatter for its TypeScript codebase with these fixed conditions:

- FACT: ADR-0001 fixed **Bun** as the dev runtime, **ESM-only** as the module system, and **TypeScript strict mode** as the language posture (`typescript.md` lists eight non-negotiable strict-mode flags).
- FACT: The architecture is **hexagonal** (presentation → application → domain → infrastructure) with strict tier rules (`architecture-overview.md` module governance). Import-boundary enforcement is a separate concern, owned by **dependency-cruiser** (see TDR-0006).
- FACT: MarkSync is **AI-agent-operable** — agents generate and modify code, so linter diagnostics are read by machines as much as humans. Diagnostic clarity is a productivity multiplier, not a nicety.
- FACT: The maintainer is **solo** (A-VIA-2), so every tool added is a maintenance surface the maintainer alone carries.
- FACT: No source code exists yet (greenfield) — the linter/formatter gate is being established **before** code is written, which is the cheapest moment to set it.
- FACT: Lint/format tooling is **dev-only** — it is not compiled into the single binary (`bun build --compile`), so this choice has zero runtime/binary-size impact.

ASSUMPTION (research-directional, re-verify before lock): Biome is the 2026 community consensus for new TypeScript projects — single tool, Rust-fast (directional benchmarks cite ~10–100× over ESLint+Prettier), 500+ rules, zero-config defaults. These figures are research-sourced, not measured for MarkSync; see the AI-assistance disclosure and the Maturity & Adoption note below.

**User direction (OPEN-Q1 answer):** "Make a decision record. I'd prefer to take decision now in Phase 4. Have no real preferences — choose whatever will be evaluated as best option."

## Problem Framing (Clarified)

The surface question ("Biome vs ESLint+Prettier") is the wrong frame. The real question is: **which tool gives clear, actionable feedback to humans AND AI agents for both linting and formatting, with the minimum maintenance surface for a solo maintainer, on Bun + ESM + TS-strict — recognizing that import-boundary enforcement is a separate concern delegated to dependency-cruiser (TDR-0006)?**

Three factors make this non-trivial:

1. **Lint and format are two needs that fight each other when split.** A separate linter (ESLint) and formatter (Prettier) can disagree on the same syntax (the classic "format on save vs lint rule" conflict), requiring `eslint-config-prettier` reconciliation and two configs to maintain. A single tool that does both well eliminates that entire class of drift.
2. **AI agents read diagnostics as instructions.** Unclear or duplicated errors (linter says X, formatter says Y) send agents into fix-loops. A single source of truth with rule names + file:line + suggested fixes is materially better for an agent-operable codebase.
3. **Boundary enforcement is NOT the linter's job here.** Regex-based import restriction (Biome `noRestrictedImports` / ESLint `no-restricted-imports`) is imprecise for architecture rules — it matches import strings, not resolved module graphs (false positives/negatives on re-exports, dynamic imports, string literals). C-4 is therefore written as "**support import-boundary rules OR integrate with a tool that does**," and the boundary job is owned by dependency-cruiser (TDR-0006). This means the linter is evaluated on lint+format quality, not on architecture-rule precision.

Reframed: pick the single lint+format tool with the best diagnostics and lowest maintenance surface on Bun+ESM+TS-strict, and treat import-boundary enforcement as a solved, separate problem (TDR-0006).

## Constraints (Hard Requirements)

### C-1: Works with Bun + ESM + TypeScript strict mode

- **Statement:** The linter/formatter must execute under the Bun dev workflow, parse ESM TypeScript natively (no CJS shims), and support the strict-mode flag set in `typescript.md` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, etc.) without false positives on valid strict code.
- **Source:** ADR-0001 (Bun + TS + ESM); `typescript.md` (strict-mode rules, non-negotiable).
- **Verification:** `bun run lint` and `bun run format:check` run cleanly on a strict-mode ESM TS fixture; CI executes the same steps with stable exit codes.
- **Negotiable:** no.

### C-2: Clear, actionable error messages for AI agents and humans

- **Statement:** Diagnostics must include the rule name, file path + line/column, the offending text, and (where possible) a suggested fix or safe-apply action — structured enough that an AI coding agent can act on a single pass.
- **Source:** AI-agent-operable requirement (north star: identical core behaviour for human/agent/CI); A-VIA-2 (solo maintainer benefits disproportionately from actionable diagnostics).
- **Verification:** A deliberately introduced violation (e.g., an unused variable, a formatting drift) yields a single, clear diagnostic with rule id + location + fix hint; no cascading duplicate errors from two tools fighting.
- **Negotiable:** no.

### C-3: Lint + format in minimal tooling (solo maintainer — minimal maintenance surface)

- **Statement:** A single tool must provide both linting and formatting, OR a paired set must justify the doubled config/maintenance cost. The solo maintainer (A-VIA-2) cannot carry two diverging configs for the same concern.
- **Source:** A-VIA-2 (solo viability); dependency-management rule in `typescript.md` ("minimal dependencies… each dep is a maintenance surface").
- **Verification:** One config file governs both lint and format; one CLI invocation per concern (`lint`, `format`); no formatter-vs-linter reconciliation config required.
- **Negotiable:** no.

### C-4: Supports import-boundary rules OR integrates with a tool that does

- **Statement:** The chosen tool must either enforce architecture tier rules itself, or compose cleanly with a purpose-built boundary-enforcement tool. Per TDR-0006, the boundary job is owned by **dependency-cruiser**; this constraint is therefore satisfied by the "integrates with a tool that does" clause as long as the linter does not conflict with dependency-cruiser.
- **Source:** `architecture-overview.md` module governance; TDR-0006 (dependency-cruiser owns boundary enforcement).
- **Verification:** `bun run lint` (linter) and `bun run check:boundaries` (dependency-cruiser) run side by side in CI without overlapping responsibilities or conflicting results.
- **Negotiable:** no (but the clause explicitly permits integration rather than self-sufficiency).

## Decision Drivers

**Business / product drivers:**
- Solo-maintainer velocity (A-VIA-2): every minute spent maintaining tooling config is a minute not spent on the trust wedge.
- AI-agent operability: clear, single-source diagnostics reduce agent fix-loop iterations — a measurable productivity effect on an agent-operable codebase.

**Technical drivers:**
- Single tool for lint + format (no formatter-vs-linter drift, no `eslint-config-prettier`).
- Bun + ESM + TS-strict native support (no CJS shims, no strict-mode false positives).
- Fast feedback (a linter that takes seconds, not tens of seconds, gets run on every save and in CI).
- Zero-config defaults that encode sensible 2026 TypeScript conventions.

**Operational drivers:**
- Minimal config maintenance surface (one config file, one tool to upgrade).
- Reversibility: a linter/formatter swap is config-only — the lowest-stakes architectural choice.
- CI integration: a single lint+format step in the push pipeline.

## Mental Models & Techniques Used

- **First Principles:** Lint and format are two distinct needs. The question is whether a single tool satisfies both well enough that splitting them adds cost without value. For a solo-maintainer, agent-operable, greenfield codebase, the answer is yes.
- **Opportunity Cost:** Two tools (ESLint + Prettier) cost two configs, a reconciliation layer (`eslint-config-prettier`), longer run times, and duplicated diagnostics. The opportunity cost of "the mature ecosystem" is the maintenance load of carrying it.
- **Inversion:** "How does a linter pick cause an AI agent to flail?" → (a) two tools disagree → agent toggles between two fixes; (b) slow lint → agent skips it; (c) cryptic message → agent guesses wrong. Each is closed by a single, fast, clear tool.
- **Second-Order Thinking:** Config drift between a formatter and a linter cascades into `format-on-save` fights, disabled rules, and eventually a culture of "ignore the linter." A single tool defuses the cascade at the root.
- **KISS:** One tool, one config, one CLI for each concern. Complexity is justified only when a single tool provably cannot do the job.
- **Evidence weighting:** The "Biome is the 2026 consensus / Rust-fast / 500+ rules" findings are **research-directional**, not measured for MarkSync. The decision does not depend on the exact speed multiplier — it depends on single-tool coherence + clear diagnostics + Bun/ESM/TS-strict compatibility, all of which are independently confirmable. Speed figures must be re-verified before lock (see AI-assistance disclosure).

## Alternatives Considered

### Maturity & Adoption (ecosystem health)

Linter/formatter choice is dev tooling, but it is also load-bearing for CI and agent operability, so ecosystem health matters. Figures below are **research-directional** (sourced from project sites/npm, 2026-07-05) and **must be re-verified against canonical sources before the tool is locked** — `citations_verified: false`. License strings are recorded as FACT; **license compatibility is a human determination** (see AI-assistance disclosure).

| Signal | Biome | ESLint | Prettier | Deno (lint/fmt) | dprint |
|---|---|---|---|---|---|
| License string | FACT: MIT | FACT: MIT | FACT: MIT | FACT: MIT (Deno) | FACT: MIT |
| Project age / maturity | Newer (rebranded from Rome) | Very mature (industry default) | Very mature (industry default formatter) | Mature within Deno | Mature, niche |
| Latest release + cadence | Active, frequent (re-verify) | Active, frequent | Active | Tracks Deno release train | Active, slower |
| Community signal (directional) | Fast-growing 2026 TS consensus | Largest plugin ecosystem | Dominant formatter | Deno users only | Format-only niche |
| Risk | Smaller plugin ecosystem than ESLint | Two-tool maintenance + slower | (paired with ESLint) | Not Bun-native (second runtime) | No linting |

Sources: biomejs.dev, eslint.org, prettier.io, deno.com, dprint.dev (re-verify before lock).

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). All constraints here are `Negotiable: no`.

|          | C-1 (Bun + ESM + TS-strict) | C-2 (clear diagnostics) | C-3 (lint+format minimal) | C-4 (boundary rules OR integrate) |
|----------|-----------------------------|-------------------------|----------------------------|-----------------------------------|
| Alt 0 (no linter/formatter) | ✅ (trivially) | ❌ (no diagnostics) | ❌ (no gate) | ❌ |
| Alt 1 — Biome | ✅ | ✅ | ✅ (single tool) | ✅ (integrates with dependency-cruiser) |
| Alt 2 — ESLint + Prettier | ✅ | ⚠️ (two-tool duplicate/drift) | ⚠️ (two configs + reconciler) | ✅ (no-restricted-imports or plugin; also dependency-cruiser) |
| Alt 3 — Deno lint + deno fmt | ❌ (second runtime; not Bun-native) | ✅ | ✅ | ❌ (Deno-bound; does not integrate with dependency-cruiser cleanly) |
| Alt 4 — dprint | ✅ | ⚠️ (format only — no lint diagnostics) | ❌ (needs a separate linter) | ❌ |

### Alternative 0 — Do Nothing / No linter/formatter

- **Eligibility:** Not eligible (fails C-2, C-3, C-4).
- **Summary:** Ship no code-quality gate; rely on code review alone.
- **Constraint compliance:** C-1 ✅ (trivially); C-2 ❌; C-3 ❌; C-4 ❌.
- **Driver fit:** Poor — AI agents get no automated feedback; the solo maintainer becomes the only quality gate, which does not scale to an agent-operable codebase.
- **Why rejected:** Fails three non-negotiable constraints. On a greenfield codebase that will be heavily agent-authored, the absence of a linter is the precise failure mode this decision exists to prevent.

### Alternative 1 — Biome (RECOMMENDED)

- **Eligibility:** Eligible (passes all four constraints).
- **Summary:** A single Rust-based tool providing both lint and format for TS/JS/JSX/JSON (and more), zero-config defaults, 500+ lint rules, `--write` safe-apply, ESM-native, Bun-compatible. Directional benchmarks cite ~10–100× speed over ESLint+Prettier (research-directional; re-verify).
- **Constraint compliance:** C-1 ✅; C-2 ✅ (rule name + location + fix hint, single source); C-3 ✅ (one tool, one config); C-4 ✅ (integrates with dependency-cruiser — Biome does not own boundary enforcement).
- **Driver fit:** Best — single tool, minimal maintenance, fast, AI-clear diagnostics, reversible.
- **Pros:** Single tool eliminates formatter-vs-linter drift; fast (tight feedback loop in CI and on save); zero-config defaults encode 2026 TS conventions; AI-actionable diagnostics; reversible (config-only swap).
- **Cons:** Smaller plugin ecosystem than ESLint (mitigated: dependency-cruiser owns boundaries; specific ESLint-only rules can be escalated in a scoped config — see revisit trigger); Biome is newer than ESLint (mitigated: active development, 2026 consensus); the formatter is opinionated (acceptable — consistency outweighs style preference).
- **Why chosen:** The only alternative that passes all four constraints with a single tool and zero reconciliation config. Best driver fit across business (solo velocity), technical (single tool, fast), and operational (minimal maintenance, reversible) drivers.

### Alternative 2 — ESLint + Prettier

- **Eligibility:** Eligible-with-accepted-risk-exceptions — but C-2 ⚠️ and C-3 ⚠️ are on **non-negotiable** constraints, so the exceptions are **not permissible**; treated as not eligible for the primary choice.
- **Summary:** The industry-default pairing: ESLint (lint) + Prettier (format), reconciled via `eslint-config-prettier`. Mature, huge plugin ecosystem.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (two tools can emit overlapping/duplicated diagnostics; needs reconciliation config); C-3 ⚠️ (two configs + reconciler = doubled maintenance); C-4 ✅.
- **Driver fit:** Weaker — the "mature ecosystem" advantage is real but is outweighed by the maintenance cost for a solo maintainer, and the two-tool diagnostic surface is worse for AI agents.
- **Why rejected as primary:** C-2 ⚠️ and C-3 ⚠️ are on non-negotiable constraints; the two-tool maintenance + diagnostic-drift cost is precisely what C-3 exists to prevent. **Retained as the fallback** if a needed lint rule is only available as an ESLint plugin with no Biome equivalent (scoped escalation, not whole-codebase ESLint).

### Alternative 3 — Deno lint + deno fmt

- **Eligibility:** Not eligible (fails C-1, C-4).
- **Summary:** The Deno CLI's built-in `deno lint` and `deno fmt`. Fast, zero-config, but Deno-native.
- **Constraint compliance:** C-1 ❌ (would require a **second runtime** — Deno — to lint a Bun project; toolchain-incoherent per ADR-0001); C-2 ✅; C-3 ✅; C-4 ❌ (Deno-bound; does not compose with dependency-cruiser cleanly and its own import linting is Deno-config-centric).
- **Why rejected:** Fails C-1 (non-negotiable) — running a second runtime to lint a Bun codebase is exactly the toolchain incoherence ADR-0001 closed. Also fails C-4 integration.

### Alternative 4 — dprint

- **Eligibility:** Not eligible (fails C-3, C-4; weak on C-2).
- **Summary:** A Rust-based **format-only** engine (plugin-based, config-driven). Excellent formatter, but no linting.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (no lint diagnostics at all); C-3 ❌ (still needs a separate linter — i.e., two tools); C-4 ❌.
- **Why rejected:** Format-only fails C-3 (would force a separate linter, reintroducing the two-tool problem) and contributes nothing to C-2's lint diagnostics.

### Omitted alternatives (considered-but-rejected)

- **StandardJS / xo / neostandard** — opinionated ESLint wrappers; inherit the two-tool problem (still need Prettier) and add a curated-rule dependency. No advantage over Biome for this codebase.
- **Clippy/Ruff analogues** — not applicable (TS codebase). Listed only to prevent a "did you consider X" reopening.

## Decision

**Recommendation: Alternative 1 — Biome as the single lint + format tool.**

Biome is the only alternative that passes all four constraints with a single tool and no reconciliation config. The decision is driven by **C-3 (single tool, minimal maintenance)** and **C-2 (clear, single-source diagnostics for AI agents)**, with **C-1 (Bun + ESM + TS-strict)** and **C-4 (integrates with dependency-cruiser)** satisfied cleanly. The "mature ecosystem" advantage of ESLint+Prettier is real but is outweighed by the doubled maintenance and diagnostic-drift cost for a solo maintainer on an agent-operable codebase.

Two design consequences follow:

1. **Boundary enforcement is delegated to dependency-cruiser (TDR-0006).** Biome does not carry architecture-rule responsibility; this is by design, not a gap. C-4 is satisfied via the "integrates with a tool that does" clause.
2. **ESLint is the scoped fallback, not the primary.** If a needed lint rule is only available as an ESLint plugin with no Biome equivalent, escalate **that rule subset** to a scoped ESLint config (not a whole-codebase ESLint adoption), or contribute the rule upstream. This keeps the single-tool posture as the default.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in the
> ADR-0001 constraints, the `typescript.md`/`architecture-overview.md` context,
> and research-directional findings on the 2026 TS tooling landscape. The
> "Biome = 2026 consensus / Rust-fast / 500+ rules" claims are
> **research-directional** (not measured for MarkSync) and **must be re-verified**
> against canonical sources (biomejs.dev, npm) before the tool is locked.
> `citations_verified: false`. License strings are recorded as FACT;
> **license compatibility is a human determination** (MIT is expected to be
> compatible with this MIT project, but the maintainer confirms). `status:
> Proposed` until human sign-off at merge.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — Biome) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Biome parses ESM TypeScript natively, runs under Bun (`bunx @biomejs/biome` or via devDependency script), and supports the strict-mode flag set without false positives on valid strict code (re-verify the full flag matrix before lock).
- **C-2 — ✅ Full compliance:** Biome emits rule name + file:line:column + offending text + suggested fix, from a single source — no duplicated formatter-vs-linter diagnostics.
- **C-3 — ✅ Full compliance:** A single tool provides both lint and format; one config (`biome.json`) governs both; no reconciliation layer required.
- **C-4 — ✅ Full compliance (via integration):** Biome integrates side-by-side with dependency-cruiser (TDR-0006) without overlapping responsibilities — Biome owns lint+format; dependency-cruiser owns architecture boundaries.

No accepted-risk exceptions are required.

## Trade-offs & Consequences

### Positive Outcomes

- One tool, one config, one CLI per concern — minimal maintenance surface for a solo maintainer (A-VIA-2).
- No formatter-vs-linter drift — eliminates the `eslint-config-prettier` reconciliation class of bugs.
- AI-actionable diagnostics (rule id + location + fix) reduce agent fix-loop iterations.
- Fast feedback (directional: seconds, not tens of seconds; re-verify) keeps the lint+format step cheap in CI.
- Reversible: a linter swap is config-only — among the lowest-stakes architectural choices.

### Negative Outcomes

- Smaller plugin ecosystem than ESLint (mitigated: dependency-cruiser for boundaries; scoped ESLint escalation for a missing rule).
- Biome is newer than ESLint (mitigated: active development, 2026 community consensus; revisit trigger fires if maintenance stalls).
- Biome's formatter is opinionated — some style choices are not configurable (acceptable: consistency > preference; revisit trigger fires only on a load-bearing divergence).
- Biome does not own architecture-boundary enforcement — this is a deliberate split, not a gap, but it means two tools run in CI (Biome + dependency-cruiser). Both are fast and non-overlapping.

### Unresolved Questions

- [ ] **Rule coverage audit:** before lock, confirm Biome's rule set covers every rule MarkSync needs (e.g., the strict-mode-adjacent rules in `typescript.md`) with no gap that would force a scoped ESLint escalation. (owner: Juliusz Ćwiąkalski)
- [ ] **Non-TS formatting scope:** decide whether Biome also formats JSON/YAML/Markdown in the repo, or whether `dprint`/`prettier` retains a scoped role for Markdown (Biome's Markdown support is evolving — re-verify). (owner: Juliusz Ćwiąkalski)
- [ ] **Bun compatibility re-verification:** confirm the current Biome version runs cleanly under the pinned Bun version (OPEN-Q9 Bun-pin) before the CI gate is unguarded. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — indirect: a consistent, low-defect codebase protects the trust wedge; no value-driver regression.
- **Usability** — strong: AI-clear diagnostics + fast feedback improve both human and agent experience.
- **Feasibility** — low uncertainty: Biome is proven on TS/ESM; the residual unknowns (full rule coverage, exact Bun-pin compat) are cheap to verify before lock.
- **Viability** — strong for a solo maintainer: single tool, minimal maintenance, fully reversible.

## Implementation Plan

1. **Add Biome** to `devDependencies`; create `biome.json` with the TS + ESM + strict-oriented rule preset aligned to `typescript.md`.
2. **Scripts** (per `typescript.md`): `bun run lint` (lint check, fails CI on errors), `bun run format` (format write), `bun run format:check` (format check, fails CI on unformatted files).
3. **CI wiring:** add `lint` + `format:check` steps to the push pipeline; unguard `continue-on-error` at `MS-0002` start (OPEN-Q9 checklist).
4. **Pair with dependency-cruiser** (TDR-0006): add `bun run check:boundaries` as a separate, non-overlapping CI step.
5. **Escalation policy:** document the scoped-ESLint fallback rule — escalate a single missing rule, not the whole codebase; prefer contributing upstream.
6. **Rule-coverage gate:** before lock, run the rule coverage audit (Unresolved Questions) and record any scoped exception.

**Risk mitigation during implementation:** if Biome emits false positives on a strict-mode construct, disable that specific rule with a documented comment and a revisit trigger — do not weaken `tsconfig.json` strictness to satisfy a linter.

## Verification Criteria

- **Metric: lint+format run time** — Target: `lint` + `format:check` complete in single-digit seconds on the codebase in CI — Window: `MS-0002`.
- **Metric: CI lint/format gate** — Target: push CI runs Biome `lint` + `format:check` and fails on violations (unguarded) — Window: `MS-0002`.
- **Metric: AI-agent diagnostic clarity** — Target: a deliberately introduced violation (unused var, formatting drift, banned pattern) yields a single actionable message with rule id + file:line + fix hint — Window: `MS-0002`.
- **Metric: Boundary integration** — Target: `lint` and `check:boundaries` run side by side without overlapping or conflicting results — Window: `MS-0002` (joint with TDR-0006).

## Confidence Rating

**High.** Biome cleanly satisfies all four constraints with a single tool, and the decision is among the lowest-stakes (reversibility: easy; stakes: low). The residual uncertainty is low and cheap to close: re-verify the full strict-mode rule coverage and the current Bun compatibility before lock. The directional "2026 consensus / Rust-fast / 500+ rules" findings strengthen the choice but are not load-bearing for it — the decision rests on single-tool coherence + clear diagnostics + Bun/ESM/TS-strict compatibility, all independently confirmable.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (Bun + TS + ESM parent decision).
- TDR-0004 — `doc/decisions/TDR-0004-testing-runner.md` (CI baseline; bun:test primary runner).
- TDR-0006 — `doc/decisions/TDR-0006-import-boundary-enforcement.md` (dependency-cruiser owns boundary enforcement; Biome integrates with it).
- `.ai/rules/typescript.md` — Biome recorded as preferred; strict-mode rules; `lint`/`format`/`check:boundaries` scripts; dependency-management rules.
- `doc/overview/tech-stack.md` — Bun + ESM + Web APIs; GitHub Actions CI.
- `doc/overview/architecture-overview.md` — hexagonal tiers; module governance.
- `doc/inception/open-questions/phase-4-open-questions.md` — OPEN-Q1 (linter/formatter pick).
- External research (directional, re-verify): biomejs.dev, eslint.org, prettier.io, deno.com, dprint.dev, npm download stats.
