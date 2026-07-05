---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: BACKLOG-RECONCILIATION
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: planning
document_classification: current-truth
links:
  source_ados_issues:
    - https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/103
    - https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/105
  related_artifacts:
    - doc/inception/analysis/assumptions.md
    - doc/inception/analysis/risks.md
    - doc/overview/02-roadmap.md
    - doc/inception/analysis/id-prefix-catalog.md
summary: "Phase 2 proactive reconciliation: open assumptions/deferred decisions and cross-cutting guardrails must be represented in the initial backlog."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Backlog Reconciliation — Assumptions, Decisions, Guardrails

_Produced proactively in Phase 2 from ADOS retrospective issues #103 and #105.
ADOS does not yet enforce this gate, so this project records it explicitly._

## Purpose

Before the first delivery backlog is declared ready, every open assumption,
deferred sub-decision, north-star guardrail, NFR, and cross-cutting quality
concern must have one of:

1. a dedicated backlog item;
2. a named acceptance criterion on a functional item;
3. an explicit closure / non-applicability reason.

No assumption may remain "parked on a person" with no trigger. No guardrail may
be folded invisibly into a feature slice.

Use stable IDs from [`id-prefix-catalog.md`](./id-prefix-catalog.md) when
materializing tickets, acceptance criteria, validation triggers, or references.

## Gate rule for the initial backlog

**Gate:** the first implementation backlog fails readiness unless the rows below
are materialized as backlog tickets / named ACs or explicitly closed.

Since Phase 2 has not yet created a backlog, the `Backlog representation` column
uses trigger-slice placeholders. Phase 7 / first delivery planning must replace
each placeholder with a concrete ticket reference.

## Open assumption → backlog trigger matrix

| Assumption | Trigger slice / backlog representation required | Owner | Status before backlog |
|---|---|---|---|
| A-FEA-1 — in-process Mermaid | `MS-0002` ADR-0002 spike ticket; decide render path before tooling locks | JC | **Must materialize** |
| A-FEA-7 — CI concurrency control | `MS-0002` sync-engine ticket: overlapping CI plans must not stale-write | JC | **Must materialize** |
| A-FEA-9 — UUID + committed lock | `MS-0002` state-model ticket / ADR: UUID storage, lock semantics, duplicate-UUID fatal | JC | **Must materialize** |
| A-VAL-2 — canonical subset sufficiency | `MS-0002` corpus ticket: adversarial corpus seeded by sanitized design-partner pages | JC | **Must materialize** |
| A-VAL-1 — wedge differentiation | `MS-0002` beta ticket: 3–5 retained design partners; retention reason taxonomy | JC | **Must materialize** |
| A-FEA-2 — Bun single binary + signing | `MS-0002` distribution ticket: clean-OS smoke + size/startup/signing budget | JC | **Must materialize** |
| A-VAL-3 — existing-corpus adoption | `MS-0003` discovery/migration ticket if `MS-0002` beta reports migration-absence as non-retention reason | JC | Triggered by `MS-0002` beta |
| A-USA-1 / A-USA-2 — setup friction | `MS-0003` DX ticket: guided init/doctor; capture TTV during `MS-0002` beta | JC | Triggered by `MS-0002` beta |
| A-USA-3 — visible provenance trust | `MS-0002` / `MS-0003` acceptance criteria: visible provenance reviewed with Persona 5 | JC | **Must materialize** |
| A-FEA-6 — Atlassian API drift | `MS-0002` adapter ticket: live-smoke/deprecation cadence; patch-release SLA | JC | **Must materialize** |
| A-FEA-10 — repo/binary bounds | `MS-0002` NFR ticket/AC: ≤500 pages, ≤90 MB binary, ≤2s cold start | JC | **Must materialize** |
| A-VIA-1 / A-VIA-2 — OSS sustainability | `MS-0008` governance ticket: support matrix, contribution seams, maintenance/funding posture | JC | Triggered before `MS-0008` public launch |
| A-VIA-4 — trademark risk | `MS-0008` legal/review ticket: nominative-use wording | JC | Triggered before `MS-0008` public launch |

## Deferred decision / sub-decision reconciliation

| Decision / sub-decision | Required trigger | Backlog representation required | Status before backlog |
|---|---|---|---|
| ADR-0001 — TypeScript + Bun single-binary | Bun/Deno + signing viability; clean-OS smoke | `MS-0002` distribution/spike ticket | **Must materialize** |
| ADR-0002 — Mermaid rendering strategy | Headless official-library spike | `MS-0002` Mermaid spike ticket | **Must materialize** |
| PDR-0001 — package / namespace scheme; repo URL | Public packaging / pre-launch branding | `MS-0008` packaging/branding ticket | Triggered before `MS-0008` |
| ADR-0005 — Storage format | Canonical subset expansion or lossy fixture | Renderer fixture ticket per subset expansion | Triggered by subset expansion |
| State model ADR | Done — ADR-0006 | Phase 3 | **Completed** — [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) |

## Cross-cutting concern coverage matrix

_Issue #105 anti-pattern: folding a cross-cutting concern into a slice as an
unstated assumption. Each row must be represented by a dedicated ticket or named
AC._

| Guardrail / NFR / concern | Required backlog representation | Source |
|---|---|---|
| Zero silent overwrite | Dedicated sync-engine guardrail + AC on every write path | North star guardrail; R-VAL-4 |
| Drift detection effectiveness = 100% | Dedicated drift-classification test suite | Roadmap metric; R-FEA-7/R-FEA-8 |
| Conflict false-positive rate <5% | AC on semantic hash / drift suite | Roadmap metric |
| Semantic idempotency | AC: second semantically unchanged push writes 0 | Roadmap metric; R-FEA-8 |
| Secret redaction | Dedicated security AC on logs, plans, state, diagnostics | R-SEC-1 |
| Visible provenance | AC on page-rendering/publish tickets | Persona 5; roadmap |
| Observability / diagnostics | Structured run ID + JSON diagnostics AC | North star guardrail; roadmap |
| Performance / scale budget | NFR AC: ≤500 pages, ≤90 MB, ≤2s cold start | A-FEA-10 |
| Accessibility/plain logs | AC: no color dependency, screen-reader/plain-log compatible output | North star / spec NFR |
| Maintainer sustainability | Ticket to tag `MS-0002` scope as beachhead-critical vs validation apparatus | R-VIA-1 |

## Readiness checklist for Phase 7 / first delivery planning

- [ ] Every `Must materialize` row has a ticket or named AC.
- [ ] Every open assumption has a validation trigger and owner.
- [ ] Every deferred decision has `decide_by` / trigger captured in an ADR or backlog item.
- [ ] Every north-star guardrail and NFR has explicit backlog representation.
- [ ] Every backlog item / AC uses a stable prefix from `id-prefix-catalog.md`.
- [ ] Any item intentionally not represented is closed here with a reason.
