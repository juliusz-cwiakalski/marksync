---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/assumption-register-template.md
ados_distribution: redistributable
id: ASSUMPTION-REGISTER
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: risk
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005]
  related_changes: []
summary: "Inception assumption register — assumptions tagged by the four risks with validation status."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Assumption Register (Inception)

_All projects. Key assumptions tagged by risk type and tracked through validation.
Produced in Phase 2; lives at `doc/inception/analysis/assumptions.md`._

> **Relationship to other templates.** This is the inception **four-risk**
> (Value / Usability / Feasibility / Viability) register for project inception.
> For business-profile strategic assumptions use
> `strategic-assumptions-template.md`.

## Assumptions
_Validate assumptions; do not hide them._

| ID | Assumption | Risk type | Validation status | Validation method | Owner | Due | Evidence |
|---|---|---|---|---|---|---|---|
| A-VAL-1 | Users want **safe publish + drift detection** more than raw conversion breadth — the trust wedge is the differentiator vs `mark`/`md2conf`. | value | unvalidated | Design-partner beta interviews; adoption/retention signal | JC | MVP beta | North star four-risk; OST O1 |
| A-VAL-2 | The canonical GFM subset is sufficient for the target teams' real documentation (not a painful limitation). | value | testing | Adversarial public corpus **seeded by sanitized design-partner pages** vs real docs | JC | MVP | Spike K1 (27/27 GFM); spec §9.5 subset |
| A-VAL-3 | Teams need to **adopt an existing Confluence corpus** (not only greenfield publish) — migration is a real adoption requirement. | value | unvalidated | Beta intake; count of "existing pages" adoption requests | JC | MVP/MLP | Red-team H4; premortem `§3.4`, `§18.2` |
| A-USA-1 | A new user can reach first publish in **≤ 10 min** (excluding Atlassian credential creation). | usability | unvalidated | Moderated usability test (MLP) + TTV instrumentation during MVP beta | JC | MLP | North star; OST E2.1; premortem `§3.3` |
| A-USA-2 | Setup friction (auth, base URL, space/page IDs, scopes) is the **primary** adoption barrier, not capability gaps. | usability | unvalidated | Setup-failure taxonomy from MVP beta | JC | MLP | Premortem `§4.2` |
| A-USA-3 | Visible provenance (panel/footer) is enough for non-technical stakeholders to **trust** a managed page. | usability | unvalidated | Stakeholder review with Persona 5 users | JC | MLP | Red-team H3; Persona 5 |
| A-FEA-1 | The official `mermaid` library renders **deterministically in-process without Chromium**. (Load-bearing for ADR-0001.) | feasibility | testing | ADR-0002 headless-render spike | JC | Before MVP lock | OST E3.1; ADR-0001 confidence=Medium |
| A-FEA-2 | A **Bun-compiled single binary** runs on a clean Linux/macOS/Windows image (no language runtime), with acceptable size/startup and a viable signing/notarization story. | feasibility | unvalidated | Clean-OS install smoke; signing spike | JC | Before MVP release | ADR-0001; premortem `§6.4` |
| A-FEA-3 | Markdown→Storage **round-trips losslessly** for the canonical subset. | feasibility | validated | Spike K1: 27/27 GFM constructs | JC | — | ADR-0005; OST E1.1 |
| A-FEA-4 | **v2 content properties** reliably carry MarkSync state metadata (`marksync.metadata`). | feasibility | validated | Spike E1–E3 (~8.4 KB accepted; v1 deprecated) | JC | — | OST; integration-scenarios/10 |
| A-FEA-5 | Confluence's **version-conflict 409** is reliable and machine-parseable for drift detection. | feasibility | validated | Spike G1 (`version=current+1` → 409) | JC | — | OST E1.2; integration-scenarios/13 |
| A-FEA-6 | Atlassian API drift (deprecations, rate limits, permission asymmetry) is **manageable** behind adapter boundaries. | feasibility | unvalidated | Adapter isolation + nightly live-tenant smoke + weekly deprecation-feed check | JC | Ongoing | Premortem `§7.3`, `§7.4` |
| A-FEA-7 | **CI concurrency control** (per-target serialization + repo/target lease + operation-ID dedup + CI concurrency-group templates) makes concurrent-run stale-base writes impossible in MVP. | feasibility | unvalidated | Concurrency integration test: two overlapping plans, older must not overwrite newer | JC | MVP | Premortem `§5.8`; red-team C2 |
| A-FEA-9 | **Source-side immutable document UUID + committed (versioned) lock file** establish a correct shared base across clones/CI; the lock minimizes merge conflict and the cache is disposable. | feasibility | unvalidated | Clone/CI/concurrency acceptance test (premortem FMEA #3, RPN 80) | JC | MVP | Premortem `§5.1`, `§5.2`; red-team H2 |
| A-FEA-10 | MVP targets repos **≤ ~500 managed pages**; large-repo incremental optimization is deferred (correctness first). Binary ≤ 90 MB; cold-start ≤ 2 s. | feasibility | unvalidated | Benchmark against a ≤500-page reference repo; clean-OS cold-start | JC | MVP | Premortem `§5.9`, `§13.11`; ADR-0001 verification |
| A-VIA-1 | MarkSync is **sustainable as OSS** with no hosted backend for core value. | viability | unvalidated | Cost/maintenance tracking; maintainer-load signal | JC | Ongoing | North star viability; premortem `§9.6` |
| A-VIA-2 | A **single maintainer** can sustain the support matrix (Cloud × OS × auth × content × packaging) without burning out. | viability | unvalidated | Maintain a deliberately narrow MVP matrix; track issue velocity | JC | Ongoing | Premortem `§9.1`, `§9.3` |
| A-VIA-3 | The owner's **personal-brand / AI-delivery-demonstration** goal does not distort the product contract (no demo-ware creep). | viability | validated | Decision Filter #7 enforces it; human review at each gate | JC | — | Red-team M3; north star decision filter |
| A-VIA-4 | "Confluence" used nominatively (descriptor, not brand) keeps Atlassian trademark risk acceptable. | viability | unvalidated | Formal trademark review pre-launch | JC | Pre-launch | ADR-0003; red-team M5 |

_Owner: JC = Juliusz Ćwiąkalski._

- **risk_type:** `value` | `usability` | `feasibility` | `viability`
- **validation_status:** `unvalidated` | `testing` | `validated` | `invalidated`

## Summary by risk type

| Risk type | Count | Validated | Testing | Unvalidated | Invalidated |
|---|---|---|---|---|---|
| Value | 3 | 0 | 1 | 2 | 0 |
| Usability | 3 | 0 | 0 | 3 | 0 |
| Feasibility | 9 | 3 | 1 | 5 | 0 |
| Viability | 4 | 1 | 0 | 3 | 0 |
| **Total** | **19** | **4** | **2** | **13** | **0** |

## Priorities
_Assumptions to validate first — those with highest impact if wrong and lowest current confidence._

- **A-FEA-1 (in-process Mermaid)** — load-bearing for the TypeScript choice and the single-binary promise; if invalidated, the implementation language is revisited. The ADR-0002 spike is the gating experiment.
- **A-FEA-7 (CI concurrency control)** — without it the zero-overwrite brand promise is unrealizable for a CI-first tool (the primary silent-overwrite vector).
- **A-FEA-9 (source-side UUID + committed lock)** — the wedge's safety depends entirely on durable identity and a shared base across clones/CI.
- **A-VAL-2 (canonical-subset sufficiency)** — if the subset is too narrow, the wedge under-delivers; the adversarial corpus (seeded by real partner pages) tests it.
- **A-VAL-1 (trust wedge differentiation)** — the entire strategy rests on safety/fidelity beating raw conversion breadth.
- **A-FEA-2 (Bun single binary + signing)** — adoption and enterprise trust both depend on it.
- **A-VAL-3 (existing-corpus adoption)** — determines whether migration tooling must be in MLP rather than later.
- **A-USA-1 (≤ 10-min first publish)** — gates the MLP; if unmet, the wedge never activates regardless of capability.
