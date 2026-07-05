---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: FSE-AUDIT
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_artifacts:
    - doc/overview/tech-stack.md
    - doc/overview/architecture-overview.md
  summary: "Full-Stack Environment audit — 10 AI-friendliness attributes assessed as a target baseline for the greenfield MarkSync codebase."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Full-Stack Environment (FSE) Audit

_Phase 3 activity per the inception guide. MarkSync is greenfield (`project.flow:
new`), so this audit is a **target baseline** — the state Phase 4 must establish —
not a reconstruction of existing code. Each attribute records the target state,
how it will be met, and the gap/risk if not._

## Attribute 1: Explicit typing

- **Target:** TypeScript with strict mode (`strict: true`), no implicit `any`, explicit return types on public APIs, `zod`/`ajv` schemas at IO boundaries (config, lock, plan, diagnostics).
- **How met:** `tsconfig.json` strict flags in Phase 4; interface contracts in `src/domain/` ports; runtime validation on every external boundary.
- **Gap/risk:** None at target. _Confidence: high._

## Attribute 2: SRP (single-responsibility) modules

- **Target:** Hexagonal module boundaries (presentation → application → domain → infrastructure); each component in `architecture-overview.md` has one responsibility; boundary heuristics enforce splits.
- **How met:** Residence rules + dependency-direction matrix in `architecture-overview.md`; mocked-in->1-test rule triggers port extraction.
- **Gap/risk:** Confluence adapter is currently one component but spans v2 + v1-only endpoints; may split into `confluence-v2` / `confluence-v1` sub-modules if cohesion drops. _Confidence: medium._

## Attribute 3: Conventions over configuration

- **Target:** Repository-owned YAML config with schema defaults; front-matter overrides only for exceptions; sensible CLI defaults (dry-run default, JSON output flag).
- **How met:** Phase 4 conventions doc + JSON Schema for config/lock; `marksync init` progressive disclosure (`MS-0003`).
- **Gap/risk:** DX defaults (`MS-0003`) are post-MVP; `MS-0002` exposes raw config. _Confidence: medium._

## Attribute 4: Semantic naming

- **Target:** Stable ID prefixes per `id-prefix-catalog.md`; semantic command names (`plan`, `apply`, `doctor`, `repair-state`); typed error names (`Conflict`, `RemoteMissing`, `UnsupportedConstruct`).
- **How met:** Prefix catalog exists; command/error taxonomy defined in spec §9.1/§9.8.
- **Gap/risk:** None. _Confidence: high._

## Attribute 5: Automated tests

- **Target:** Unit (pure domain logic) + integration (mocked Confluence) + golden fixtures (Storage render) + live-sandbox E2E (dedicated test space) + Gherkin/BDD for lifecycle invariants only (premortem §8.2). Adversarial public corpus seeded by sanitized design-partner pages (A-VAL-2).
- **How met:** Phase 4 testing-strategy doc; CI baseline runs unit+integration+golden on every push; E2E on a single dedicated test space (not per-suite).
- **Gap/risk:** Testing runner choice (Bun built-in vs vitest) unresolved (OPEN-Q4). _Confidence: medium._

## Attribute 6: Linters & formatters

- **Target:** `biome` or `eslint` + `prettier`/`dprint`; typecheck (`tsc --noEmit`) on every push; secret-redaction lint (no `console.log` of raw objects); dependency/license audit (`license-checker`/`osv-scanner`).
- **How met:** Phase 4 CI baseline; `.ai/rules/` conventions; pre-commit hooks optional.
- **Gap/risk:** Linter pick (biome vs eslint) is a Phase 4 sub-decision. _Confidence: high._

## Attribute 7: Readable Git history

- **Target:** Conventional Commits; one branch+PR per inception phase (established practice); squash-merge to `main`; `doc/inception/retrospective/` captures process notes per phase.
- **How met:** Already in practice (PRs #1, #2, #3 squash-merged); Conventional Commits enforced by convention + (optional) commitlint in Phase 4.
- **Gap/risk:** No automated commitlint yet. _Confidence: high._

## Attribute 8: Contextual comments

- **Target:** Comments explain *why* (decisions, gotchas, Confluence quirks), not *what*; ADR references in code where a non-obvious choice is load-bearing; integration-scenario doc references in the Confluence adapter.
- **How met:** Code review gate (Phase 5 `code-review-instructions.md`); ADR links in module headers.
- **Gap/risk:** None. _Confidence: high._

## Attribute 9: Popular tech stack

- **Target:** TypeScript (one of the most popular languages); `remark`/`unified` (de-facto Markdown ecosystem); official `mermaid`; native Web APIs. All well-documented and AI-trained.
- **How met:** ADR-0001 selects TS for Mermaid fidelity; ecosystem precedent (`atlcli`, `markdown-confluence` are TS).
- **Gap/risk:** Bun is newer than Node/Deno; AI training data is thinner. Mitigation: code targets standards (ESM + Web APIs), not Bun-specific APIs, where possible. _Confidence: medium._

## Attribute 10: AI instructions / rules files

- **Target:** `AGENTS.md` (root) + `.ai/agent/*-instructions.md` (pm, pr, decision, code-review) + `.ai/rules/` conventions + this doc tree. Phase 5 generates the agent instructions.
- **How met:** ADOS docs already installed; `.ai/rules/` + agent instructions land in Phase 5.
- **Gap/risk:** Not yet generated (Phase 5 scope). _Confidence: high (on plan)._

## Summary

| # | Attribute | Target confidence | Phase that establishes it |
|---|---|---|---|
| 1 | Explicit typing | high | Phase 4 |
| 2 | SRP modules | medium | Phase 4 |
| 3 | Conventions over configuration | medium | Phase 4 / `MS-0003` |
| 4 | Semantic naming | high | Phase 4 |
| 5 | Automated tests | medium | Phase 4 |
| 6 | Linters & formatters | high | Phase 4 |
| 7 | Readable Git history | high | Phase 4 (already practiced) |
| 8 | Contextual comments | high | Phase 4/5 |
| 9 | Popular tech stack | medium | Phase 3 (stack chosen) |
| 10 | AI instructions / rules files | high | Phase 5 |

**Overall:** the greenfield project can meet all 10 attributes. The medium-confidence
items (2, 3, 5, 9) are tracked as sub-decisions or `MS-0003` scope, not blockers.
