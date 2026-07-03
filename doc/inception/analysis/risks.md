---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/risk-register-template.md
ados_distribution: redistributable
id: RISK-REGISTER
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: risk
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0005]
  related_changes: []
summary: "Inception risk register — four-risk assessment with likelihood, impact, and mitigation, seeded by the failure premortem."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Risk Register (Inception)

_Produced in Phase 2 for a non-trivial project; lives at `doc/inception/analysis/risks.md`.
Seeded by the failure premortem (`doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`)
and the Phase 1 red-team review. The premortem's pre-mortem and the four-risk
check (Phase 2 anti-sycophancy) are reflected here._

> **Relationship to other templates.** This is the inception **four-risk**
> (Value / Usability / Feasibility / Viability) register. For business-profile
> strategic risks use `strategic-assumptions-template.md`.

## Risks

_Likelihood / Impact scale: Low · Medium · High (Impact may be **Critical** for data-loss/safety). Residual = remaining risk after mitigation._

| ID | Risk | Type | Likelihood | Impact | Mitigation | Owner | Residual |
|---|---|---|---|---|---|---|---|
| R-VAL-1 | **Scope explosion** — delivering the end-state category vision (bidirectional, all auth, all OS, diagrams, large repos, education) before the wedge is retained (premortem #1). | value | High | High | Hard MVP beachhead contract + phase gates (Gate 1–6); every expansion passes an explicit gate; Decision Filter #6/#7. | JC | Medium |
| R-VAL-2 | **No validated beachhead** — building for an archetype, not 3–5 real retained teams (premortem #2). | value | Medium | High | Recruit heterogeneous design partners before MVP release; gate MLP on retention, not stars. | JC | Medium |
| R-VAL-3 | **Trust promise exceeds evidence** — marketing "safe sync" before a public round-trip corpus, recovery procedures, and verified conflict scenarios exist (premortem #3). | value | Medium | High | Lead with proof (adversarial public corpus, compatibility lab); staged language (safe publish → drift → reverse capture → reconciliation), never "two-way sync" prematurely. | JC | Medium |
| R-VAL-4 | **Silent / ambiguous data loss** — one remote-edit/macro/attachment/move/deletion incident permanently damages the safety reputation (premortem #10). | value | Low | Critical | Drift detection + optimistic concurrency + visible provenance; per-document failure isolation; never auto-resolve conflicts; zero-overwrite release guardrail. | JC | Medium |
| R-USA-1 | **Setup friction kills activation** — auth/URL/space/page-ID/scope complexity loses users before the wedge is evaluated (premortem #3.3, #4.2). | usability | High | High | MLP milestone: guided `init`, `doctor` diagnostics, progressive disclosure, <10-min first-publish target. | JC | Medium |
| R-USA-2 | **No migration path** — adopting an existing Confluence corpus is hard, so MarkSync is "another publisher" (premortem #8). | usability | Medium | High | Track A-VAL-3; if confirmed, make migration a first-class MLP feature (premortem `§18.2`). | JC | Medium |
| R-USA-3 | **Safety mechanisms become permanent blockers** — one unsupported macro/stale lock/moved page blocks a whole subtree (premortem #4.3). | usability | Medium | Medium | Per-document isolation; `explain`/`adopt`/`rebind`/`accept-remote`/`repair-state`; distinguish warnings from hard blocks; deterministic conflict bundles. | JC | Low |
| R-FEA-1 | **In-process Mermaid unproven** — the official library may not render deterministically without Chromium, weakening the TypeScript rationale (premortem #6.4). | feasibility | Medium | High | ADR-0002 spike is the gating experiment; stop-criterion: reconsider language if Chromium is required (OST E3.1). | JC | Medium |
| R-FEA-2 | **Bun single-binary signing/trust** — large binaries (~50–90 MB), unsigned Windows/macOS binaries trigger enterprise "trust" rejection (premortem #7, red-team). | feasibility | Medium | Medium | Clean-OS smoke test; signing/notarization spike before stable release; document size/startup budget. | JC | Medium |
| R-FEA-3 | **Wrong state model** — relying on cache/timestamps/titles/paths for identity instead of durable UUID + shared base (premortem #4, #5.1, #5.2). | feasibility | Medium | High | Immutable document UUID; Confluence page ID = remote identity; strict cache/state separation; duplicate-UUID fatal before writes; title-based discovery never silently binds. | JC | Low |
| R-FEA-4 | **Plan accurate, apply not** — no cross-page transaction; partial apply leaves inconsistent state (premortem #4.4). | feasibility | Medium | Medium | No cross-page atomicity promised; preflight validation; optimistic concurrency per mutation; durable apply journal; idempotent retry; explicit partial-apply status + repair plan. | JC | Low |
| R-FEA-5 | **AI-generated false confidence** — specs/tests validate against our own assumptions, not real Confluence behaviour (premortem #6). | feasibility | Medium | High | Adversarial public corpus; live-sandbox E2E tier on a dedicated test space; shadow-mode against real repos; never let mocks be the dominant test layer. | JC | Medium |
| R-FEA-6 | **Atlassian API drift** — deprecations, rate limits, permission asymmetry break the tool faster than releases repair it (premortem #9, #7.3). | feasibility | Medium | Medium | API-version isolation behind the `ConfluenceClient` adapter; integration-scenario docs as the regression baseline; monitor Atlassian deprecation notices. | JC | Medium |
| R-VIA-1 | **Maintainer overload** — one maintainer owns a combinatorial matrix (Cloud × OS × auth × content × packaging) and burns out (premortem #7, #9.1, #9.3). | viability | High | High | Deliberately narrow MVP matrix (Cloud only; one auth path); contributor-sized seams; no universal plugin API before two real extensions exist; defer Data Center/OAuth/package managers. | JC | Medium |
| R-VIA-2 | **Unsustainable OSS model / no succession** — the project collects stars, not retained repos; no maintainer succession (premortem #9.4, #9.6). | viability | Medium | Medium | Track retained-repo activation over stars; design-partner retention as the headline metric; document a continuity/maintenance model before scaling. | JC | Medium |
| R-VIA-3 | **Demo-ware creep** — the personal-brand/AI-delivery goal biases toward breadth and demos over the product contract (red-team M3). | viability | Low | Medium | Decision Filter #7 (product contract over AI-delivery velocity/breadth); human gate at each phase. | JC | Low |

## Heat-map summary
_Likelihood × impact grid; highlight the top risks to reduce first._

**High likelihood × High/Critical impact (reduce first):**
- **R-VAL-1** (scope explosion) — High × High
- **R-USA-1** (setup friction kills activation) — High × High
- **R-VIA-1** (maintainer overload) — High × High
- **R-VAL-4** (silent data loss) — Low × **Critical** (the brand-defining risk; treat as top priority despite low likelihood)

**Medium likelihood × High impact (watch closely):**
- R-VAL-2 (no validated beachhead), R-VAL-3 (trust > evidence), R-USA-2 (no migration path), R-FEA-1 (Mermaid), R-FEA-3 (state model), R-FEA-5 (AI false confidence)

## Cross-links to the assumption register
_Each risk often corresponds to an assumption being validated — link IDs here._

| Risk ID | Assumption ID | Note |
|---|---|---|
| R-VAL-1 | A-VAL-1 | Scope explosion is only worth risking if the wedge (A-VAL-1) is real. |
| R-VAL-2 | A-VAL-1 | Beachhead validation directly tests the wedge assumption. |
| R-VAL-3 | A-VAL-1 | Trust-promise risk is the comms side of the wedge assumption. |
| R-USA-1 | A-USA-1, A-USA-2 | Activation risk tests the <10-min and "friction-is-primary" assumptions. |
| R-USA-2 | A-VAL-3 | Migration risk tests the existing-corpus adoption assumption. |
| R-FEA-1 | A-FEA-1 | Mermaid risk ↔ the load-bearing spike assumption. |
| R-FEA-2 | A-FEA-2 | Bun binary risk ↔ the single-binary/signing assumption. |
| R-FEA-3 | A-FEA-3, A-FEA-4 | State-model risk ↔ round-trip + content-property assumptions. |
| R-FEA-6 | A-FEA-6 | API-drift risk ↔ the adapter-isolation assumption. |
| R-VIA-1 | A-VIA-2 | Maintainer-overload risk ↔ single-maintainer sustainability. |
| R-VIA-3 | A-VIA-3 | Demo-ware risk ↔ the non-distortion assumption (validated, guardrail in place). |
