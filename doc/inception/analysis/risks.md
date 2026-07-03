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
  related_decisions: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005]
  related_changes: []
summary: "Inception risk register — four-risk assessment with likelihood, impact, and mitigation, seeded by the failure premortem."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Risk Register (Inception)

_Produced in Phase 2 for a non-trivial project; lives at `doc/inception/analysis/risks.md`.
Seeded by the failure premortem (`doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`),
the Phase 1 red-team, and the Phase 2 red-team. The premortem's pre-mortem and
the four-risk check (Phase 2 anti-sycophancy) are reflected here._

> **Relationship to other templates.** This is the inception **four-risk**
> (Value / Usability / Feasibility / Viability) register. For business-profile
> strategic risks use `strategic-assumptions-template.md`.

## Risks

_Likelihood / Impact scale: Low · Medium · High (Impact may be **Critical** for data-loss/safety). Residual = remaining risk after mitigation._

| ID | Risk | Type | Likelihood | Impact | Mitigation | Owner | Residual |
|---|---|---|---|---|---|---|---|
| R-VAL-1 | **Scope explosion** — delivering the end-state category vision before the wedge is retained (premortem #1). | value | High | High | Hard MVP beachhead contract + phase gates (Gate 1–6); every expansion passes an explicit gate; Decision Filter #6/#7. | JC | Medium |
| R-VAL-2 | **No validated beachhead** — building for an archetype, not 3–5 real retained teams (premortem #2 / FMEA #1, RPN 100). | value | High | High | **Recruit ≥3 design partners before MVP feature-lock; if 0 at feature-lock, slip the lock** (premortem `§18.1`); gate MLP on retention, not stars. | JC | Medium |
| R-VAL-3 | **Trust promise exceeds evidence** — marketing "safe sync" before a public round-trip corpus, recovery procedures, and verified conflict scenarios exist (premortem #3). | value | Medium | High | Lead with proof (adversarial public corpus, compatibility lab); staged language (safe publish → drift → reverse capture → reconciliation), never "two-way sync" prematurely. | JC | Medium |
| R-VAL-4 | **Silent / ambiguous data loss** — one remote-edit/macro/attachment/move/deletion incident permanently damages the safety reputation (premortem #10). | value | Low | Critical | Drift detection + optimistic concurrency + visible provenance; per-document failure isolation; never auto-resolve conflicts; **concurrency control (R-FEA-7)**; zero-overwrite release guardrail. | JC | Medium |
| R-USA-1 | **Setup friction kills activation** — auth/URL/space/page-ID/scope complexity loses users before the wedge is evaluated (premortem #3.3, #4.2). | usability | High | High | MLP milestone: guided `init`, `doctor` diagnostics, progressive disclosure, ≤ 10-min first-publish target; instrument TTV + setup-failure taxonomy during MVP beta. | JC | Medium |
| R-USA-2 | **No migration path** — adopting an existing Confluence corpus is hard, so MarkSync is "another publisher" (premortem #8). | usability | Medium | High | Track A-VAL-3; if confirmed, make migration a first-class MLP feature (premortem `§18.2`). | JC | Medium |
| R-USA-3 | **Safety mechanisms become permanent blockers** — one unsupported macro/stale lock/moved page blocks a whole subtree (premortem #4.3). | usability | Medium | Medium | Per-document isolation; **minimal MVP repair surface** (`repair-state` for stale locks + interrupted-apply journal replay, premortem `§14`); `explain`/`adopt`/`rebind`/`accept-remote`; distinguish warnings from hard blocks; deterministic conflict bundles. | JC | Low |
| R-FEA-1 | **In-process Mermaid unproven** — the official library may not render deterministically without Chromium, weakening the TypeScript rationale (premortem #6.4). | feasibility | Medium | High | ADR-0002 spike is the gating experiment; MVP `code`-fallback if the spike fails late (full render → MLP). **If the spike fails, impact is a language-level reconsideration and a multi-month MVP slip**, not merely a mitigation tweak. | JC | Medium |
| R-FEA-2 | **Bun single-binary signing/trust** — large binaries (~50–90 MB), unsigned Windows/macOS binaries trigger enterprise "trust" rejection (premortem #7). | feasibility | Medium | Medium | Clean-OS smoke test; signing/notarization spike before stable release; binary ≤ 90 MB / cold-start ≤ 2 s budget. | JC | Medium |
| R-FEA-3 | **Wrong state model** — relying on cache/timestamps/titles/paths for identity instead of durable UUID + shared base (premortem #4, #5.1, #5.2). | feasibility | Medium | High | Immutable source-side document UUID; Confluence page ID = remote identity; **committed (versioned) lock file**; disposable cache; duplicate-UUID fatal before writes; title-based discovery never silently binds. | JC | Low |
| R-FEA-4 | **Plan accurate, apply not** — no cross-page transaction; partial apply leaves inconsistent state (premortem #4.4). | feasibility | Medium | Medium | No cross-page atomicity promised; preflight validation; optimistic concurrency per mutation; durable apply journal + **MVP `repair-state`/journal replay**; idempotent retry; explicit partial-apply status. | JC | Low |
| R-FEA-5 | **AI-generated false confidence** — specs/tests validate against our own assumptions, not real Confluence behaviour (premortem #6). | feasibility | Medium | High | Adversarial public corpus; live-sandbox E2E tier on a dedicated test space; shadow-mode against real repos; mocks never the dominant test layer. | JC | Medium |
| R-FEA-6 | **Atlassian API drift** — deprecations, rate limits, permission asymmetry break the tool faster than releases repair it (premortem #9, #7.3). | feasibility | Medium | Medium | API-version isolation behind the `ConfluenceClient` adapter; integration-scenario docs as the regression baseline; **nightly live-tenant smoke + weekly Atlassian deprecation-feed check; patch-release SLA documented before MVP release**. | JC | Medium |
| R-FEA-7 | **Concurrent CI runs cause stale-base overwrite** — two jobs plan against the same remote version; the older applies after the newer (premortem #5.8). _The primary silent-overwrite vector for a CI-first tool._ | feasibility | Medium | Critical | Per-target serialization + repo/target lease + operation-ID dedup + stale-plan expiry + CI concurrency-group templates; concurrency integration test (overlapping plans). | JC | Medium |
| R-FEA-8 | **False no-op / false conflict** — Confluence normalization/reorder makes raw body-hash brittle; a false no-op skips a real update, a false conflict spams versions (premortem #5.4 / FMEA #8, RPN 75). | feasibility | Medium | High | Maintain separate raw/canonical/normalized/attachment hashes (not raw body hash); adversarial tests: semantic-equivalence→no-op and semantic-distinction→never-no-op. | JC | Medium |
| R-FEA-9 | **Canonical-subset fixtures unrepresentative of real tenants** — real pages contain macros/nested tables/app content the subset excludes; unsupported nodes silently degrade or block (premortem FMEA #2, RPN 100). | feasibility | High | High | Adversarial public corpus **seeded by sanitized design-partner pages** (premortem `§17.2`); unsupported-node classification published (`§5.6`); never-silently-discard invariant test. | JC | Medium |
| R-FEA-10 | **Permission asymmetry / partial visibility** — a token reads pages but not properties, or sees part of a tree; drift reasoning mis-classifies a page as "new" (duplicate) or "orphan" (premortem `§7.4`). | feasibility | Medium | High | `doctor` capability discovery; visibility-completeness check before any create/adoption decision; block destructive decisions when visibility is incomplete. | JC | Medium |
| R-SEC-1 | **Secret leakage / supply-chain or converter-injection incident** — tokens in logs/diagnostics/state, or malicious Markdown injecting `<ac:structured-macro>` server-side (premortem FMEA #34; `§17 #10`). | feasibility | Low | Critical | Redaction tests on **every** output path; SBOM + automated dependency/license policy; converter macro-escape property tests; 0-secrets guardrail metric. | JC | Medium |
| R-VIA-1 | **Maintainer overload** — one maintainer owns a combinatorial matrix and burns out (premortem #7, #9.1, #9.3). | viability | High | High | Deliberately narrow MVP matrix (Cloud only; one auth path); **beachhead-critical vs validation-apparatus tagging** (apparatus may slip); contributor-sized seams; defer Data Center/OAuth/package managers. | JC | Medium |
| R-VIA-2 | **Unsustainable OSS model / no funded maintenance or succession** — stars, not retained repos; no funded model before issue load becomes unsustainable (premortem #9.4, #9.6). | viability | Medium | Medium | Track retained-repo activation over stars; document a continuity/maintenance model **and** a funding/sponsorship posture before scaling. | JC | Medium |
| R-VIA-3 | **Demo-ware creep** — the personal-brand/AI-delivery goal biases toward breadth and demos over the product contract (red-team M3). | viability | Low | Medium | Decision Filter #7 (product contract over AI-delivery velocity/breadth); human gate at each phase. | JC | Low |

## Heat-map summary
_Likelihood × impact grid; highlight the top risks to reduce first._

**Critical impact (brand-defining — treat as top priority regardless of likelihood):**
- **R-VAL-4** (silent data loss) — Low × **Critical**
- **R-FEA-7** (concurrent stale-base overwrite) — Medium × **Critical**
- **R-SEC-1** (secret leakage / supply chain) — Low × **Critical**

**High likelihood × High impact (reduce first):**
- **R-VAL-1** (scope explosion), **R-VAL-2** (no validated beachhead), **R-FEA-9** (corpus unrepresentative) — High × High
- **R-USA-1** (setup friction), **R-VIA-1** (maintainer overload) — High × High

**Medium likelihood × High impact (watch closely):**
- R-VAL-3 (trust > evidence), R-USA-2 (no migration path), R-FEA-1 (Mermaid), R-FEA-3 (state model), R-FEA-5 (AI false confidence), R-FEA-8 (false no-op), R-FEA-10 (permission asymmetry)

## Cross-links to the assumption register
_Each risk often corresponds to an assumption being validated — link IDs here._

| Risk ID | Assumption ID | Note |
|---|---|---|
| R-VAL-1 | A-VAL-1 | Scope explosion is only worth risking if the wedge (A-VAL-1) is real. |
| R-VAL-2 | A-VAL-1 | Beachhead validation directly tests the wedge assumption. |
| R-VAL-3 | A-VAL-1 | Trust-promise risk is the comms side of the wedge assumption. |
| R-VAL-4 | A-FEA-5, A-FEA-7 | Data-loss prevention rests on validated drift detection + concurrency control. |
| R-USA-1 | A-USA-1, A-USA-2 | Activation risk tests the ≤ 10-min and "friction-is-primary" assumptions. |
| R-USA-2 | A-VAL-3 | Migration risk tests the existing-corpus adoption assumption. |
| R-FEA-1 | A-FEA-1 | Mermaid risk ↔ the load-bearing spike assumption. |
| R-FEA-2 | A-FEA-2 | Bun binary risk ↔ the single-binary/signing assumption. |
| R-FEA-3 | A-FEA-3, A-FEA-9 | State-model risk ↔ round-trip + identity/lock assumptions. |
| R-FEA-4 | A-FEA-3, A-FEA-4 | Partial-apply risk ↔ round-trip + content-property assumptions. |
| R-FEA-5 | A-FEA-3, A-VAL-2 | AI-false-confidence risk ↔ round-trip + subset-sufficiency assumptions. |
| R-FEA-6 | A-FEA-6 | API-drift risk ↔ the adapter-isolation assumption. |
| R-FEA-7 | A-FEA-7 | Concurrency risk ↔ the CI-concurrency-control assumption. |
| R-FEA-8 | A-FEA-3 | False-no-op risk ↔ the canonical hashing approach. |
| R-FEA-9 | A-VAL-2 | Corpus-representativeness risk ↔ the subset-sufficiency assumption. |
| R-FEA-10 | A-FEA-6 | Permission-asymmetry risk ↔ adapter/visibility handling. |
| R-SEC-1 | — | Security invariant (no secrets in output) — release-blocking guardrail, not a standing assumption. |
| R-VIA-1 | A-VIA-2 | Maintainer-overload risk ↔ single-maintainer sustainability. |
| R-VIA-2 | A-VIA-1, A-VIA-2 | Sustainability risk ↔ OSS-sustainability + single-maintainer assumptions. |
| R-VIA-3 | A-VIA-3 | Demo-ware risk ↔ the non-distortion assumption (validated; guardrail in place). |
