---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0006
decision_type: tdr
status: Proposed
created: 2026-07-05
decision_date: null
last_updated: 2026-07-05
summary: "Use dependency-cruiser for import-boundary (architecture-tier) enforcement: purpose-built, rules-as-code, resolves the real module dependency graph (no false negatives vs regex-based linter rules), AI-agent-clear violation messages, actively maintained, CI + optional pre-commit. Composes with Biome (TDR-0005), which owns lint+format only."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Automates enforcement of the hexagonal tier rules so the solo maintainer (A-VIA-2) and AI coding agents get immediate, accurate feedback on architecture violations — protecting the ports-and-adapters invariants that keep the codebase swappable and maintainable."
customer_impact: "Indirect: clean tier separation preserves the ability to swap adapters (e.g., a future Notion adapter) without core changes, sustaining the extensibility principle in the architecture overview."
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
  - "dependency-cruiser maintenance stalls, or a Bun/TS feature it depends on (e.g., a new import syntax, decorators, `import attributes`) is not yet supported, producing false negatives."
  - "The architecture grows rules that dependency-cruiser cannot express (e.g., runtime-only dependency constraints) and a complementary mechanism is required."
  - "A linter-based approach (Biome/ESLint import rules) reaches graph-resolution parity with dependency-cruiser, making a single-tool consolidation attractive."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [ADR-0001, ADR-0006, TDR-0005]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# TDR-0006: Import-boundary enforcement — dependency-cruiser for architecture rules

## Context

This is a sub-decision of ADR-0001 and resolves **OPEN-Q2** (Phase 4 open questions). It is the boundary-enforcement half of the code-quality gate whose lint+format half is TDR-0005 (Biome).

MarkSync's architecture is **hexagonal** (ports-and-adapters), with four tiers and a strict dependency-direction invariant (`architecture-overview.md` module governance; `typescript.md` tier rules):

- **Presentation** (`src/cli/`) → may import application; **NOT** domain or infrastructure.
- **Application** (`src/app/`) → may import domain + infrastructure (via ports); **NOT** presentation.
- **Domain** (`src/domain/`) → imports **nothing** (defines ports); **NOT** application/presentation/infrastructure.
- **Infrastructure** (`src/infra/`) → may import domain (implements ports); **NOT** application/presentation.
- **Shared** (`src/shared/`) → pure utilities, no tier dependencies; any tier may import.

> **Invariant:** no dependency may point upward or sideways across tiers. Ports (interfaces) live in domain/application; adapter implementations live in infrastructure.

These rules need **automated enforcement**. The maintainer is solo (A-VIA-2) and cannot manually police every import, and — critically — **AI coding agents** generate and modify code, so enforcement must be accurate and must give agents clear, actionable feedback when they violate a tier rule. A wrong or imprecise signal (false negative lets a violation ship; false positive erodes trust in the gate) is the precise failure mode this decision exists to prevent.

FACT: `architecture-overview.md` and `typescript.md` already specify the rules in machine-checkable form (path-pattern-based from/to forbidden pairs). FACT: `typescript.md` records a `.dependency-cruiser.cjs` config sketch (four `forbidden` rules) and a `bun run check:boundaries` script. FACT: Biome (TDR-0005) does **not** own boundary enforcement — its `noRestrictedImports` is regex-based and imprecise for this job. FACT: the maintainer prefers a **battle-tested, easily maintainable** solution over custom scripting; the main drivers are **solid enforcement, ease of maintenance, and AI-first clear feedback**.

ASSUMPTION (research-directional, re-verify before lock): dependency-cruiser is the most effective 2026 tool for module-boundary enforcement — it resolves the real dependency graph, supports architecture rules as code, and is actively maintained. Re-verify against canonical sources before lock.

**User direction (OPEN-Q2 answer):** "The dependency-cruiser sounds reasonable but I'd like to make a decision record and choose what comes out as best. Most important: AI coding agents should receive clear feedback if they violate dependency rules — and this must be accurate. Prefer a battle-tested solution that is easily maintainable in the long run rather than custom scripting. Main drivers: solid enforcement, ease of maintenance, AI-first focus (clear feedback for AI coding agents)."

## Problem Framing (Clarified)

The surface question ("which boundary tool") is the wrong frame. The real question is: **which mechanism accurately detects every tier violation (no false negatives) AND gives AI agents a clear, actionable message — without imposing custom-script maintenance on a solo maintainer?**

The key technical distinction is **regex matching vs graph resolution**:

- **Regex-based** approaches (ESLint `no-restricted-imports`, Biome `noRestrictedImports`) match the **import path string**. They cannot see through re-exports, barrel files (`index.ts`), dynamic imports, or path aliases; they false-positive on string literals that happen to contain a path; and they cannot express "this module transitively depends on that tier." For a hexagonal architecture with a `shared` utility namespace and `imports`-field aliases (`#domain/*`, `#infra/*`), this imprecision produces both false negatives (violations ship) and false positives (agents get misled) — the worst outcome for an AI-first codebase.
- **Graph-resolution** approaches (dependency-cruiser, eslint-plugin-boundaries) build the **actual module dependency graph** from the resolved imports, then evaluate architecture rules against the graph. They see transitive dependencies, re-exports, and aliases; their error messages name the concrete `from → to` violation and the rule breached.

Reframed: pick the mechanism that **resolves the graph** (not matches strings), is **battle-tested and actively maintained**, and emits **AI-actionable violation messages** — and is **not a custom script** the maintainer must keep working.

## Constraints (Hard Requirements)

### C-1: Accurately detect all tier violations (no false negatives)

- **Statement:** The mechanism must resolve the real module dependency graph (through re-exports, barrel files, path aliases, and transitive imports) and flag every tier violation. Regex/string matching of import paths is insufficient.
- **Source:** `architecture-overview.md` dependency-direction matrix (non-negotiable invariant); AI-first accuracy requirement (user direction).
- **Verification:** A fixture suite containing a barrel-reexported violation, an alias-based violation (`#infra/*` imported into `src/domain/`), and a transitive violation is detected with zero false negatives.
- **Negotiable:** no.

### C-2: Clear, actionable error messages

- **Statement:** Violations must report the concrete `from` file, the `to` module, and the rule breached (e.g., "domain-may-not-import-infra: src/domain/state/classifier.ts imports src/infra/confluence/client.ts"), so an AI agent can fix it in one pass.
- **Source:** AI-first focus (user direction); A-VIA-2.
- **Verification:** A deliberate violation yields a message naming both endpoints + the rule id + the category; the message is parseable and unambiguous.
- **Negotiable:** no.

### C-3: Battle-tested and actively maintained

- **Statement:** The mechanism must be a mature, actively maintained project (not experimental, not abandoned, not a solo-author experiment) so the maintainer is not carrying the tool's own maintenance burden.
- **Source:** User direction ("battle-tested… easily maintainable in the long run"); A-VIA-2 (solo maintainer cannot absorb a tool's maintenance).
- **Verification:** Canonical source shows active releases, responsive issue triage, and non-trivial adoption (re-verify before lock).
- **Negotiable:** no.

### C-4: Integrates with CI (GitHub Actions) and optionally pre-commit

- **Statement:** The mechanism must run as a CI step that fails the pipeline on violations, with a `bun run check:boundaries` script (per `typescript.md`). A pre-commit (or lint-staged) integration is a nice-to-have, not a hard requirement — CI is the authoritative gate.
- **Source:** `typescript.md` (`check:boundaries` script); `tech-stack.md` (GitHub Actions CI).
- **Verification:** A push CI step runs `bun run check:boundaries` and fails on a deliberately introduced violation.
- **Negotiable:** no (CI is mandatory; pre-commit is optional).

### C-5: No custom script maintenance

- **Statement:** The mechanism must be a supported tool with declarative rules-as-code, not a hand-rolled script the maintainer must keep working as TypeScript/Bun evolve.
- **Source:** User direction ("rather than… custom scripting"); A-VIA-2.
- **Verification:** Rules are declared in a config file consumed by the tool; the maintainer does not maintain any boundary-detection source code.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Protect the ports-and-adapters invariants: tier discipline is what keeps adapters swappable (e.g., a future Notion adapter replacing the Confluence adapter box in the C4 diagram without core changes).
- Solo-maintainer sustainability (A-VIA-2): automated enforcement is the only scalable way to police imports.

**Technical drivers:**
- Graph resolution over regex matching: accuracy (no false negatives) is the headline driver.
- Rules-as-code: the four `forbidden` rules in `typescript.md` are declarative and reviewable in PR diffs.
- Composability with Biome (TDR-0005): non-overlapping responsibilities.

**Operational drivers:**
- AI-first feedback (user's top driver): clear `from → to` messages let agents self-correct.
- Low maintenance: a supported tool, not a custom script.
- CI-native: runs in the existing GitHub Actions pipeline.

## Mental Models & Techniques Used

- **First Principles:** What is irreducible? Detecting that module A depends on module B in violation of a tier rule. String matching cannot do this reliably (barrels, aliases, re-exports); graph resolution can. The irreducible requirement is graph resolution.
- **Inversion:** "How does a boundary tool fail an AI agent?" → (a) false negative: the violation ships and an invariant silently erodes; (b) false positive: the agent "fixes" a non-violation and introduces a real one. Graph resolution closes (a); precise `from→to` messages close (b).
- **Opportunity Cost:** A custom script gives full control but costs the maintainer perpetual maintenance as TS/Bun evolve. A supported tool trades a tiny loss of control for zero maintenance — the right trade for a solo maintainer.
- **Second-Order Thinking:** Imprecise enforcement cascades into "the gate is flaky → disable it → violations accumulate → architecture rots." Accurate enforcement breaks the cascade at the root.
- **Systems Thinking:** Boundary enforcement is one of a layered set of architecture guards (types, ports/interfaces, tests, boundary lint). It is the cheapest, earliest guard — it fails in seconds, before tests run.
- **Evidence weighting:** dependency-cruiser's graph-resolution capability and rules-as-code model are confirmable from its docs; the "battle-tested/actively maintained" claim is research-directional and must be re-verified before lock.

## Alternatives Considered

### Maturity & Adoption (ecosystem health)

Boundary enforcement is load-bearing architecture guard, so ecosystem health matters. Figures are **research-directional** (2026-07-05) and **must be re-verified** before lock — `citations_verified: false`. License strings are FACT; **license compatibility is a human determination**.

| Signal | dependency-cruiser | eslint-plugin-boundaries | ESLint `no-restricted-imports` | Biome `noRestrictedImports` | Custom script |
|---|---|---|---|---|---|
| License string | FACT: MIT | FACT: MIT | FACT: MIT (ESLint) | FACT: MIT (Biome) | n/a |
| Approach | Graph resolution, rules-as-code | Graph resolution, element types | Regex/string match | Regex/string match | Hand-rolled |
| Maturity | Mature, purpose-built, active (re-verify) | Mature, active | Mature (built into ESLint) | Built into Biome | n/a |
| Community signal | Standard for this exact problem | Popular ESLint arch plugin | Universal (ESLint default) | Biome users only | none |
| Risk | None specific | ESLint-coupled (needs ESLint as primary) | Imprecise (regex) | Imprecise (regex) | Maintenance burden |

Sources: github.com/sverweij/dependency-cruiser, github.com/javierbrea/eslint-plugin-boundaries, eslint.org, biomejs.dev (re-verify before lock).

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). All constraints here are `Negotiable: no`.

|          | C-1 (graph resolution, no false negatives) | C-2 (clear messages) | C-3 (battle-tested) | C-4 (CI + optional pre-commit) | C-5 (no custom script) |
|----------|--------------------------------------------|----------------------|---------------------|--------------------------------|------------------------|
| Alt 0 (no enforcement) | ❌ | ❌ | n/a | ❌ | n/a |
| Alt 1 — dependency-cruiser | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — ESLint `no-restricted-imports` | ❌ (regex) | ⚠️ | ✅ | ✅ | ✅ |
| Alt 3 — Biome `noRestrictedImports` | ❌ (regex) | ⚠️ | ✅ (Biome is) | ✅ | ✅ |
| Alt 4 — eslint-plugin-boundaries | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 5 — custom script | ✅ (if correct) | ⚠️ (DIY) | ❌ | ⚠️ | ❌ |

### Alternative 0 — Do Nothing / No enforcement

- **Eligibility:** Not eligible (fails C-1, C-2, C-4, C-5).
- **Summary:** Rely on code review alone to police tier rules.
- **Constraint compliance:** C-1 ❌; C-2 ❌; C-3 n/a; C-4 ❌; C-5 n/a.
- **Why rejected:** On an agent-operable codebase, manual review is the precise failure mode (agents generate imports at scale; a solo reviewer misses them). This is the lazy baseline the four `forbidden` rules in `typescript.md` exist to prevent.

### Alternative 1 — dependency-cruiser (RECOMMENDED)

- **Eligibility:** Eligible (passes all five constraints).
- **Summary:** A purpose-built, graph-resolving dependency analyser. Architecture rules are declarative ("rules as code") in `.dependency-cruiser.cjs` — the four `forbidden` rules in `typescript.md` map 1:1. Resolves the real module graph (re-exports, barrels, path aliases, transitive deps). Emits `from → to + rule` violations. CI-native (`depcruise` CLI), Bun-compatible, optional pre-commit/lint-staged.
- **Constraint compliance:** C-1 ✅ (graph resolution); C-2 ✅ (named `from → to` + rule); C-3 ✅ (mature, active — re-verify); C-4 ✅ (`depcruise` in CI + optional pre-commit); C-5 ✅ (declarative config, no custom code).
- **Driver fit:** Best — graph resolution is the headline driver (C-1); AI-first clear messages (C-2); battle-tested (C-3); CI-native (C-4); no custom maintenance (C-5). Composes with Biome (TDR-0005) without overlap.
- **Pros:** Purpose-built for exactly this problem; declarative rules reviewable in PR diffs; graph resolution eliminates the regex false-negative class; clear violation messages; actively maintained.
- **Cons:** Adds one devDependency and one config file (acceptable — it is the single tool for this concern); the `depcruise` CLI is a separate process from Biome (mitigated: both are fast, non-overlapping CI steps).
- **Why chosen:** The only alternative that passes all five constraints AND matches the maintainer's stated drivers (battle-tested, maintainable, AI-first, not custom). The four `forbidden` rules in `typescript.md` are already written in dependency-cruiser's format.

### Alternative 2 — ESLint `no-restricted-imports`

- **Eligibility:** Not eligible (fails C-1; weak on C-2).
- **Summary:** ESLint's built-in rule that forbids import paths matching regex/glob patterns.
- **Constraint compliance:** C-1 ❌ (regex matching — misses barrels, aliases, re-exports, transitive deps); C-2 ⚠️ (message names the offending import but not the resolved target/rule category as cleanly); C-3 ✅; C-4 ✅; C-5 ✅.
- **Why rejected:** Fails C-1 (non-negotiable) — regex matching produces false negatives on exactly the constructs (`#imports` aliases, barrel `index.ts`) MarkSync uses. Also requires ESLint as the primary linter, conflicting with the Biome decision (TDR-0005).

### Alternative 3 — Biome `noRestrictedImports`

- **Eligibility:** Not eligible (fails C-1; weak on C-2).
- **Summary:** Biome's equivalent of ESLint's `no-restricted-imports` — regex/glob-based.
- **Constraint compliance:** C-1 ❌ (same regex limitations as Alt 2); C-2 ⚠️; C-3 ✅ (Biome is); C-4 ✅; C-5 ✅.
- **Why rejected:** Fails C-1 (non-negotiable) for the same reason as Alt 2. Biome's role is lint+format (TDR-0005); it does not own boundary enforcement, by design. This is the option `typescript.md` explicitly chose NOT to use for boundaries.

### Alternative 4 — eslint-plugin-boundaries

- **Eligibility:** Eligible (passes all five constraints).
- **Summary:** An ESLint plugin that resolves the dependency graph and enforces architecture rules via "element types." Graph-resolving, AI-clear messages, mature.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Driver fit:** Strong, but **coupled to ESLint** — it requires ESLint as the primary linter, which conflicts with the Biome decision (TDR-0005). Adopting it would force a second linter (ESLint) into the stack solely for this plugin.
- **Pros:** Graph-resolving; element-type model is expressive; clear messages.
- **Cons:** ESLint-coupled — reintroduces ESLint into a Biome-primary stack; duplicates boundary-tooling across two linters if kept alongside Biome.
- **Why rejected as primary:** Eligible on the constraints, but loses on driver fit (composability with TDR-0005) — it would force ESLint back into the stack purely to host this plugin. dependency-cruiser is linter-independent and composes cleanly with Biome. Retained as the fallback if dependency-cruiser ever stalls.

### Alternative 5 — Custom script

- **Eligibility:** Not eligible (fails C-3, C-5; weak on C-2).
- **Summary:** Hand-roll a TS AST walker (or reuse the TS compiler API) to detect tier violations.
- **Constraint compliance:** C-1 ✅ (only if implemented correctly); C-2 ⚠️ (DIY message formatting); C-3 ❌ (not battle-tested — it is one maintainer's script); C-4 ⚠️ (DIY CI wiring); C-5 ❌ (the maintainer maintains the detector itself).
- **Why rejected:** Fails C-3 and C-5 (both non-negotiable) — the user explicitly preferred a battle-tested, maintainable tool over custom scripting. A custom detector must track every TS/Bun import-syntax evolution (decorators, `import attributes`, path-alias resolution) forever — exactly the maintenance burden A-VIA-2 forbids.

## Decision

**Recommendation: Alternative 1 — dependency-cruiser for import-boundary (architecture-tier) enforcement.**

dependency-cruiser is driven by **C-1 (graph resolution → no false negatives)** and **C-2 (clear `from → to + rule` messages for AI agents)** — the user's two headline drivers — while also satisfying **C-3 (battle-tested)**, **C-4 (CI-native)**, and **C-5 (no custom script)**. It composes cleanly with Biome (TDR-0005): Biome owns lint+format; dependency-cruiser owns architecture boundaries. The four `forbidden` rules already drafted in `typescript.md` are written in dependency-cruiser's declarative format and map 1:1 to the architecture-overview dependency-direction matrix.

The regex-based alternatives (Alt 2, Alt 3) are rejected because they cannot satisfy C-1 for the constructs (`#imports` aliases, barrel files) MarkSync uses. `eslint-plugin-boundaries` (Alt 4) is eligible but is rejected as primary because it would force ESLint back into a Biome-primary stack solely to host the plugin — a composability cost dependency-cruiser (linter-independent) avoids.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in the
> `architecture-overview.md` dependency-direction matrix, the `typescript.md`
> tier rules and `.dependency-cruiser.cjs` sketch, and research-directional
> findings on 2026 TS boundary tooling. The "dependency-cruiser is the most
> effective / actively maintained" claims are **research-directional** and
> **must be re-verified** against canonical sources
> (github.com/sverweij/dependency-cruiser, npm) before the tool is locked.
> `citations_verified: false`. License string recorded as FACT (MIT); **license
> compatibility is a human determination**. `status: Proposed` until human
> sign-off at merge.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — dependency-cruiser) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** dependency-cruiser resolves the real module dependency graph (statically, from import statements), following re-exports, barrel files, and path aliases. The four `forbidden` rules cover every cell of the architecture-overview dependency-direction matrix. A fixture suite with barrel/alias/transitive violations is the acceptance test.
- **C-2 — ✅ Full compliance:** Violations report the concrete `from` file, the `to` module, and the breached rule name/category — directly actionable by an AI agent.
- **C-3 — ✅ Full compliance:** dependency-cruiser is a mature, purpose-built, actively maintained project (re-verify release cadence/issue responsiveness before lock).
- **C-4 — ✅ Full compliance:** `depcruise` CLI runs as a `bun run check:boundaries` CI step and fails the pipeline on violations; optional pre-commit/lint-staged integration is available.
- **C-5 — ✅ Full compliance:** Rules are declarative in `.dependency-cruiser.cjs`; the maintainer maintains no boundary-detection source code.

No accepted-risk exceptions are required.

## Trade-offs & Consequences

### Positive Outcomes

- Accurate tier enforcement with no false negatives — the headline driver.
- AI-actionable `from → to + rule` messages — agents self-correct in one pass.
- Declarative rules reviewable in PR diffs — the four `forbidden` rules are already drafted.
- Clean composition with Biome (TDR-0005): non-overlapping, both fast.
- No custom-script maintenance — a supported tool carries its own evolution.

### Negative Outcomes

- One additional devDependency + one config file (`.dependency-cruiser.cjs`) — acceptable for the single boundary-enforcement tool.
- A second CI process (`depcruise`) alongside Biome — mitigated: both are fast and non-overlapping.
- dependency-cruiser must keep up with TS/Bun import-syntax evolution; if it stalls, the revisit trigger fires and eslint-plugin-boundaries (Alt 4) is the fallback.

### Unresolved Questions

- [ ] **Rule coverage audit:** before lock, confirm dependency-cruiser resolves the `#imports`-field aliases (`#domain/*`, `#infra/*`, etc.) and the `shared` utility namespace exactly as the tier rules intend. (owner: Juliusz Ćwiąkalski)
- [ ] **Transitive-rule strictness:** decide whether to enable dependency-cruiser's transitive-dependency rules (e.g., "domain must not transitively reach infra via a barrel") in addition to the direct `from → to` rules. (owner: Juliusz Ćwiąkalski)
- [ ] **Pre-commit integration:** decide whether to wire `check:boundaries` into lint-staged/pre-commit (optional) or keep it CI-only. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — protects the ports-and-adapters invariants that keep adapters swappable; no value-driver regression.
- **Usability** — strong: AI-clear feedback + CI gate; no manual import policing.
- **Feasibility** — low uncertainty: the rules are already drafted; the residual unknown (alias resolution) is cheap to verify before lock.
- **Viability** — strong for a solo maintainer: supported tool, declarative config, no custom maintenance; reversible (config-only).

## Implementation Plan

1. **Add dependency-cruiser** to `devDependencies`; create `.dependency-cruiser.cjs` with the four `forbidden` rules from `typescript.md` (domain→infra, domain→app, presentation→domain, presentation→infra).
2. **Alias resolution:** configure dependency-cruiser to resolve the `#imports`-field aliases (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`) and the `shared` utility namespace.
3. **Script:** `bun run check:boundaries` (per `typescript.md`) wrapping `depcruise`.
4. **CI wiring:** add `check:boundaries` as a push CI step; unguard at `MS-0002` start (OPEN-Q9 checklist).
5. **Fixture suite:** add a `tests/architecture/` fixture set (barrel violation, alias violation, transitive violation) as the C-1 acceptance test.
6. **Composition with Biome:** document the split (Biome = lint+format; dependency-cruiser = boundaries) in `typescript.md` (already recorded — confirm on lock).

**Risk mitigation during implementation:** if dependency-cruiser mis-resolves an alias or barrel, add an explicit `resolved`/`tsPreCompilationConfig` setting before weakening a rule; never disable a rule to make CI green — fix the architecture.

## Verification Criteria

- **Metric: Boundary accuracy** — Target: the barrel/alias/transitive fixture suite detects every deliberate violation with zero false negatives — Window: `MS-0002` (C-1).
- **Metric: Message clarity** — Target: a deliberate violation yields a `from → to + rule` message naming both endpoints and the rule — Window: `MS-0002` (C-2).
- **Metric: CI gate** — Target: push CI runs `bun run check:boundaries` and fails on a violation (unguarded) — Window: `MS-0002` (C-4).
- **Metric: Composition with Biome** — Target: `lint` and `check:boundaries` run side by side without overlapping or conflicting results — Window: `MS-0002` (joint with TDR-0005).

## Confidence Rating

**High.** dependency-cruiser cleanly satisfies all five constraints and matches the user's stated drivers (accurate, battle-tested, maintainable, AI-first, not custom). The headline differentiator (graph resolution vs regex) is a structural fact, not a benchmark claim — regex approaches provably cannot satisfy C-1 for MarkSync's alias/barrel usage. Residual uncertainty is low: re-verify alias resolution and maintenance status before lock. The decision is reversible (config-only).

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (Bun + TS + ESM parent decision).
- ADR-0006 — `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (ports defined in domain; adapter isolation).
- TDR-0005 — `doc/decisions/TDR-0005-linter-and-formatter.md` (Biome owns lint+format; boundary job delegated here).
- `doc/overview/architecture-overview.md` — dependency-direction matrix; module governance; `TargetSystem`/`Repository`/`Renderer` ports.
- `.ai/rules/typescript.md` — tier rules; `.dependency-cruiser.cjs` config sketch; `check:boundaries` script.
- `doc/inception/open-questions/phase-4-open-questions.md` — OPEN-Q2 (boundary enforcement mechanism).
- External research (directional, re-verify): github.com/sverweij/dependency-cruiser, github.com/javierbrea/eslint-plugin-boundaries, eslint.org, biomejs.dev.
