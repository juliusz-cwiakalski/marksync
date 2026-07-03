---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/material-inventory-template.md
ados_distribution: redistributable
id: MATERIAL-INVENTORY
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: raw-evidence
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005]
  related_changes: []
summary: "Material inventory — maps MarkSync inception inputs (under doc/inception/, no inputs/ subdir exists) to the phases they inform."
---

# Material Inventory

_Produced in Phase 0 (Intake & material scan). Lives at `doc/inception/analysis/material-inventory.md`. Maps every user-provided input under `doc/inception/` to the inception phase it informs, and extracts the key elements/concepts from each._

> **Note on location:** this project stages its inputs directly in `doc/inception/`
> (there is no `doc/inception/inputs/` subdirectory). All paths below are relative
> to the repo root. The Confluence API validation spike under
> `doc/inception/tmp/confluence-api-validation-spike/` is **gitignored**
> (`doc/**/tmp/`) and is therefore a working artifact, not a committed input — it
> is listed last under "Working (uncommitted) evidence".

## Flow & profile (Phase 0 decisions, pending Gate 0)

- **Flow:** `new` — greenfield. No product source code is committed; the repo holds
  only `.ai/`, `doc/`, `.gitignore`, `LICENSE` across a trivial 3-commit history.
  The rich inception documents below are research/spec inputs for a not-yet-built
  product, not a legacy codebase to reconcile.
- **Repo profile:** `engineering-repo` — MarkSync is a software product (TypeScript
  CLI/library per ADR-0001). The strategy/business documents are inception inputs,
  not a standing business-documentation tree.
- **Characteristics:**
  - `code_project: true` → activates testing strategy, CI baseline, dev-environment,
    conventions, security baseline, `.env.example` (Phase 4).
  - `complex_domain: true` → activates ubiquitous language (Phase 4).
  - `ui_bearing: false` → CLI tool; screen-inventory / UX-guidance not activated.
    (DX/CLI ergonomics remain a first-class quality concern, handled in Phase 4.)
  - `multi_user: false` → single-operator tool; personas/JTBD not auto-activated.
    (A target-user description still exists in the motivation doc and will feed the
    north star. **Flag for human:** decide at Gate 0 whether a lightweight persona is
    desired despite `multi_user: false`.)

## Inputs

| File | Type | Source | Summary | Informs phase | Key elements / concepts |
|---|---|---|---|---|---|
| `doc/inception/motivation-and-goal-notes-brain-dump.md` | motivation / goals (brain dump) | author | Freshest, authoritative statement of *why* and the goal. | 1 (north star) | One-way Git→Confluence sync as MVP; "trust wedge" = safest publisher + drift detection; bidirectional sync staged only after earned trust; exceptional DX as a core value. |
| `doc/inception/north-star-draft-to-be-refined.md` | north-star draft | author / AI assist | Draft compass document; predates the brain dump and must be reconciled with it. | 1 (north star) | Draft vision/mission; to be refined and reconciled with the motivation brain dump. |
| `doc/inception/system-specification-draft-from-ai-brainstorm.md` | system specification / functional requirements | AI brainstorm | Draft system spec incl. a functional-requirements catalogue and a `ConfluenceClient` interface sketch (§9.7). | 1, 2, 3 | FR-AUTH-* catalogue; `ConfluenceClient` interface; ownership modes; atomicity language; **flagged corrections needed**: narrow v1 support matrix, fix atomicity wording, separate cache from state, add ownership modes, remove universal claims. |
| `doc/inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` | competitive / landscape research | research | Survey of existing open-source Markdown↔Confluence tools and their gaps. | 1, 2 | Competitor gaps (mark, md2conf, text2confl, md2cf, etc.); reinforces the trust/drift wedge as the differentiator. |
| `doc/inception/marksync-category-leadership-strategy-report-2026-07-02.md` | positioning / category strategy | research | Strategy report: how to win the category. | 1, 2 | "Win the narrow trust wedge first"; MVP (one-way Git→Confluence) vs MLP (Minimum Lovable Product: exceptional DX + easy setup); staging of bidirectional sync. |
| `doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` | pre-mortem / risk | research | Failure-mode analysis and anti-failure playbook. | 2 (risks) | Concrete failure modes (data loss, drift, sync loops, auth footguns) and mitigations; seeds the risk register. |
| `doc/inception/ideas.md` | scratchpad | author | Running list of ideas, open questions, candidate work items. | 2 (scope) | Candidate features and open questions to triage into/out of scope. |
| `doc/inception/decisions/00-index.md` | decision registry | author | Index of pre-inception ADRs (ADR-0001…0005), all `status: Proposed`. | 3 | Registry; statuses pending confirmation during inception. |
| `doc/inception/decisions/ADR-0001-implementation-language-and-runtime.md` | decision record | author | Implementation language & runtime choice. | 3 (tech stack) | TypeScript (per template/ADR); Node runtime. |
| `doc/inception/decisions/ADR-0002-mermaid-rendering-strategy.md` | decision record | author | Mermaid diagram rendering strategy. | 3 | How Mermaid is rendered/published to Confluence. |
| `doc/inception/decisions/ADR-0003-product-naming-confluence-adapter.md` | decision record | author | Product naming & architecture. | 1, 3 | "MarkSync" core + Confluence adapter; naming. |
| `doc/inception/decisions/ADR-0004-confluence-api-validation-spike.md` | decision record | author | Decision to run a scoped Confluence API validation spike. | 3 | Spike scope/charter; now largely executed (see integration scenarios). |
| `doc/inception/decisions/ADR-0005-page-body-representation-storage-not-adf.md` | decision record | spike-evidenced | Write Confluence Storage Format, not ADF. | 3 | Both accepted; Storage round-trips losslessly for all GFM; simpler; 5/5 reference converters write Storage. **Evidence-backed.** |
| `doc/inception/integration-scenarios/00-index.md` | API evidence index | spike | Index of 18 evidence-backed Confluence Cloud integration scenarios. | 3, 4 | Catalogue of proven API scenarios. |
| `doc/inception/integration-scenarios/01..18-*.md` | API scenarios (verbatim req/resp) | spike | One doc per integration scenario with current (non-deprecated) endpoint + verbatim captured request/response. | 3 (arch), 4 (testing/conventions) | v2 vs **V1-only** endpoints (attachments upload/download, labels add/delete, CQL search, restrictions); content properties v2; version-conflict/drift (`version=current+1` → 409); reverse sync; Markdown→Storage fidelity; OAuth 3LO (later phase, documented not live-proven). |
| `doc/inception/README.md` | inception index / project summary | author | Index of inception materials + reading-order authority + cleaned project summary. | 0 (orientation) | Reading order & authority ranking of artifacts. |
| `doc/inception/LICENSE` | license | author | License for the inception materials. | — (meta) | Project is MIT. |

_Input types: strategy docs, user research, competitive analysis, existing documentation, meeting notes, prototypes/wireframes, technical docs, business model._

## Working (uncommitted) evidence

| Path | Type | Source | Summary | Informs phase |
|---|---|---|---|---|
| `doc/inception/tmp/confluence-api-validation-spike/` | throwaway validation spike (gitignored via `doc/**/tmp/`) | spike | Runnable `.mjs` scenarios + captured redacted evidence + findings + the official API reference + credentials guidance. Produced the evidence behind the integration scenarios and ADR-0005. | 3, 4 (evidence only; not a committed input) |

Key spike contents: `src/run.mjs` (A1–K1), `src/coverage.mjs` (P1–P10), `findings/*.md`,
`evidence/raw/`, `doc/research/atlassian-confluence-api-reference.md`, `CREDENTIALS.md`.

## Coverage gaps

_What is missing per phase — which phases have little or no supporting input, and what should be requested/produced._

| Phase | Gap | Action |
|---|---|---|
| 1 — North star | Drafts exist but **unreconciled** (north-star draft predates motivation brain dump; system spec has flagged corrections). | Phase 1: author a single reconciled north star; apply the documented corrections. |
| 1 — Discovery (OST/PRD) | No Opportunity-Solution Tree or PRD yet. Discovery materials exist (strategy + competitive reports), so OST/PRD are candidates. | Phase 1: decide whether to produce OST and/or project-PRD (conditional on discovery materials — which are present). |
| 1 — Personas/JTBD | No formal persona. `multi_user: false` skips auto-activation, but a target-user exists in the motivation doc. | **Flag for Gate 0:** confirm whether a lightweight persona/JTBD is desired regardless of the multi-user gate. |
| 2 — Scope/roadmap | Scope is implied across motivation + spec + strategy but not yet distilled into a single current-milestone definition + roadmap + assumption/risk registers. | Phase 2: define current milestone (MVP) scope, draft roadmap, assumption register, risk register (seeded by the pre-mortem). |
| 3 — Tech/arch | Strongly pre-covered by ADR-0001…0005 + integration scenarios. No formal `tech-stack` or `architecture-overview` doc yet. | Phase 3: formalise tech-stack + architecture-overview from the ADRs/scenarios; run FSE audit; seed canonical ADRs into `doc/decisions/`. |
| 4 — Domain (ubiquitous language) | `complex_domain: true` but no ubiquitous-language / glossary drafted yet. | Phase 4: draft ubiquitous language + glossary (Storage vs ADF, content properties, drift, ownership modes, atomicity). |
| 4 — Quality baseline | `code_project: true` but no testing strategy, CI baseline, dev-environment, conventions, security baseline, or `.env.example` yet (no code committed). | Phase 4: establish from scratch (greenfield). |
| 5–7 | N/A — downstream of phases 1–4. | Produced in their phases. |
