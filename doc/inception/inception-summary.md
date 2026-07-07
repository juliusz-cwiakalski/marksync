---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: INCEPTION-SUMMARY
status: Accepted
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0010, ADR-0011, PDR-0001, TDR-0001, TDR-0002, TDR-0003, TDR-0004, TDR-0005, TDR-0006, TDR-0007, TDR-0008]
  related_changes: []
summary: "Inception summary — MarkSync for Confluence. 8 phases (0–7), 15 decision records, 4 feature specs, 6 ADOS framework improvement proposals. Ready for MS-0002 delivery."
---

# Inception Summary

## Inception metadata

- **Project:** MarkSync for Confluence
- **Flow:** new (greenfield)
- **Profile:** engineering-repo
- **Started:** 2026-07-03
- **Completed:** 2026-07-06
- **Phases:** 8 (0–7), one PR per phase (squash-merged to `main`)
- **Decision records:** 15 (6 ADR, 1 PDR, 8 TDR) — all `Accepted`
- **Feature specs produced:** 4 (for MS-0002 scope)
- **Initial backlog produced:** `doc/planning/backlog-MS-0002.md` (3 spikes + 19 work items, dependency-ranked)
- **ADOS framework improvement proposals:** 7

## Decisions made (with rationale)

| Decision | Rationale | Record |
|---|---|---|
| TypeScript + Bun single-binary (not Go) | Mermaid is the load-bearing dependency; TS ecosystem is stronger for DOM rendering | ADR-0001 |
| Mermaid rendering: official library in-process, deterministic | Avoids external service dependency; `securityLevel: strict` + `deterministicIds` | ADR-0002 |
| Write Confluence Storage Format (not ADF) | Storage Format is what Confluence actually stores; avoids ADF↔Storage round-trip fidelity loss | ADR-0005 |
| UUID v7 + committed lock + disposable cache | Separates identity (immutable), shared base (versioned), and cache (disposable) — closes silent-overwrite vectors | ADR-0006 |
| Squash provenance by default for MS-0002 | Simplicity, rate-limit safety, reduced privacy exposure; commit-by-commit deferred | ADR-0010 |
| CLI output: `CommandResult<T>` + centralized redaction | Structured output for AI agents + JSON/NDJSON accessible path; secrets never in output | ADR-0011 |
| MarkSync brand; Confluence as first adapter | Nominative use; core/adapters split for future wiki platforms | PDR-0001 |
| Cliffy for CLI framework | Most feature-complete; Bun-compatible; presentation-adapter boundary contains risk | TDR-0002 |
| Shell-Git behind Repository interface | 100% feature coverage; git already a prereq; isomorphic-git is swap option | TDR-0003 |
| bun:test + happy-dom for Mermaid-DOM | Native, fastest, zero-dep; vitest as last-resort fallback only | TDR-0004 |
| Biome for lint + format | Single tool, Rust-fast, zero-config; 2026 consensus | TDR-0005 |
| dependency-cruiser for import boundaries | Graph-based architecture-rule enforcement; clear AI-agent feedback | TDR-0006 |
| @cucumber/cucumber for lifecycle BDD | Battle-tested; tests not compiled into binary (zero runtime cost) | TDR-0007 |
| commitlint + husky + CI for Conventional Commits | Defense-in-depth: local hook for fast feedback + CI as authoritative gate | TDR-0008 |

## Deferred items (with reasons)

| Item | Reason deferred | Owner | Revisit trigger |
|---|---|---|---|
| OPEN-Q8: keytar OS keychain integration | Env-token path is guaranteed MS-0002; keytar is enhancement | JC | MS-0002 spike |
| OPEN-Q9: CI `continue-on-error` guard removal | No source/tests exist during inception; guards are intentional | JC | ~~MS-0002 implementation start~~ **CLOSED by GH-14 (2026-07-07)** |
| version.message length limit spike | Undocumented by Atlassian; live API test needed | JC | MS-0002 start |
| Commit-by-commit provenance | Simpler squash default for MVP; commit-by-commit is opt-in later | JC | Post-MS-0002 evidence |
| macOS platform support | Linux + Windows first (MS-0002); macOS deferred to MS-0003 or later | JC | MS-0003 planning |
| Reverse sync (drift capture, reconciliation) | Trust wedge (one-way publish) must be proven first | JC | MS-0004+ gates |
| OAuth 2.0 3LO browser-based auth | API-token is the MS-0002 path; OAuth is later browser-based feature | JC | Post-MS-0002 |
| 6 ADOS framework improvement proposals | Upstream ADOS repo changes (installer, bash rules, threat modeling, backlog pattern, questions pattern, doc-profile template, README template) | JC | ADOS repo issues/PRs |
| Initial backlog creation missing from Phase 7 activities | Ambiguity in inception guide — "verify coverage" was not "create backlog" | JC | ADOS guide update |

## Artifact confidence scores

### High confidence (0.85+) — ready for delivery

| Artifact | Confidence | Notes |
|---|---|---|
| documentation-handbook, templates, decisions index, readiness report | 0.90 | ADOS-standard or verified |
| documentation-profile, guides | 0.88 | Complete and validated |
| AGENTS.md, pm/pr/decision/code-review instructions, doc index | 0.85 | Framework instantiation, owner-reviewed |
| env-example, editor-config, material-inventory, open-questions | 0.85 | Stable |

### Medium confidence (0.80–0.84) — solid, refine during delivery

| Artifact | Confidence | Notes |
|---|---|---|
| glossary, ubiquitous-language, NFRs, decision records | 0.82 | Domain model + quality requirements; may evolve with MS-0002 learnings |
| testing-strategy, typescript conventions, security baseline | 0.82 | Engineering rules; tested during first implementation |
| README.md, north-star, roadmap, risk register, assumptions | 0.80 | Strategic + planning; beta evidence will sharpen |
| CI workflows, dev-environment, accessibility baseline, retrospectives | 0.80 | Scaffolds ready; CI now binding as of GH-14 (OPEN-Q9 closed) |

### Lower confidence (0.75) — needs MS-0002 evidence

| Artifact | Confidence | Notes |
|---|---|---|
| tech-stack, architecture overview | 0.75 | Pre-implementation design; Mermaid spike + first code will validate |
| OST, personas/JTBD | 0.75 | Pre-beta; design-partner feedback will refine |

### Not applicable (conditional skip)

`user_journeys`, `screen_inventory`, `ux_guidance` (CLI, no UI), `repo_analysis`,
`tribal_knowledge` (greenfield, no legacy code), `project_prd` (deferred optional).

## Process improvement notes

### What worked

- **PR-per-phase with squash-merge** — each phase is a clean, reviewable human gate. Squash commits give a readable history. Phase boundaries forced completeness before proceeding.
- **Red-team coordinator before each phase merge** — caught factual errors, broken links, cross-document inconsistencies, and fabricated ID ranges that manual review missed. 3 rounds on Phase 4, 1 round each on Phases 5–6.
- **Open questions as durable in-git files** — `doc/inception/open-questions/phase-<N>-open-questions.md` with stable `OPEN-Q<N>` IDs. Answers persisted, grepable, and folded into artifacts. Far better than ephemeral PR comments.
- **Retrospective notes per phase** — 30 retro items captured patterns to repeat and 6 ADOS framework improvement proposals. The meta-practice formalized by the owner mid-inception (commit `d2cca63`) retroactively validated the approach.
- **Backlog reconciliation + failure premortem + success pre-parade** — proactively added in Phase 2 based on ADOS retrospective issues #103/#105. Ensured cross-cutting concerns (safety, security, DX, performance) had dedicated representation, not invisible assumptions.
- **Automated readiness checks** — Python scripts for artifact existence, link resolution, and status verification caught the decision-status error (all 15 records stuck at `Proposed` despite merged PRs).

### What to improve

- **Automated readiness checks need codification** — the Phase 6 checks were inline Python in a conversation. They should become a reusable script (`scripts/check-inception-readiness.sh`) portable to other ADOS projects. (Retro filed.)
- **Readiness report accuracy** — the readiness report itself had count errors (assumption counts, risk ID ranges, skip count) caught by red-team. The lesson: a readiness check must self-verify its own numbers against source files, not transcribe them manually.
- **Threat modeling is missing from ADOS** — security exists in fragments (NFRs, baseline, red-team reviews) but no systematic STRIDE exercise. Filed as the largest ADOS framework improvement proposal.
- **Documentation-profile write roots must cover all agent paths** — the template defaults (4 roots) would have silently broken `@doc-syncer` in autonomous delivery. Expanded to 18 roots after owner caught it.
- **Decision record status lifecycle was wrong** — records stayed `Proposed` across 5 phases because the lifecycle said "pending human confirmation at Phase 6." The owner corrected: `Accepted` = PR merged. All 15 fixed in Phase 6.

## Sign-off

- **Approved by:** _(pending human gate — Phase 7 PR merge)_
- **Date:** 2026-07-06

## Links

- Inception state: [`doc/inception/inception-state.yaml`](inception-state.yaml)
- Readiness report: [`doc/inception/readiness-report.md`](readiness-report.md)
- Overview docs: [`doc/overview/`](../overview/)
- Decision records: [`doc/decisions/`](../decisions/)
- Feature specs: [`doc/spec/features/`](../spec/features/)
- Roadmap: [`doc/overview/02-roadmap.md`](../overview/02-roadmap.md)
- **MS-0002 backlog:** [`doc/planning/backlog-MS-0002.md`](../planning/backlog-MS-0002.md)
