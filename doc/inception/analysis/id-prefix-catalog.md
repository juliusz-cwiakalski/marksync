---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: ID-PREFIX-CATALOG
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: current-truth
links:
  related_artifacts:
    - doc/inception/analysis/backlog-reconciliation.md
    - doc/inception/analysis/assumptions.md
    - doc/inception/analysis/risks.md
summary: "Stable, grepable identifier prefixes for inception, planning, requirements, risks, decisions, and backlog references."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# ID Prefix Catalog

Stable identifiers let humans and AI agents find references accurately across
docs, PR comments, backlog items, decision records, and future implementation
plans. Do **not** invent new prefixes casually. Extend this catalog first.

## Rules

1. **IDs are immutable once referenced.** Do not reuse an ID for a different
   meaning; mark old IDs superseded instead.
2. **Use uppercase prefixes and hyphens.** Prefer `PREFIX-DOMAIN-N` over prose.
3. **Keep IDs grepable.** The literal ID must appear in any document/backlog item
   that depends on it.
4. **Reference, don't duplicate.** A backlog item may repeat the ID but should
   link back to the source artifact.
5. **Use a domain segment when it improves filtering.** Example:
   `A-FEA-7`, `R-SEC-1`, `AC-MVP-3`.

## Canonical prefixes

| Prefix | Meaning | Format | Current / example use |
|---|---|---|---|
| `ADR-` | Architecture Decision Record | `ADR-0001` | ADR-0001 implementation language |
| `PDR-` | Product Decision Record | `PDR-0001` | Use for product/positioning decisions if separated from ADR sequence |
| `TDR-` | Technical Decision Record | `TDR-0001` | Use for local technical choices below ADR weight |
| `ODR-` | Operational Decision Record | `ODR-0001` | Process/operations decisions |
| `BDR-` | Business Decision Record | `BDR-0001` | Business/model decisions |
| `SD-` | Sub-decision / deferred decision | `SD-<AREA>-<N>` | Use when a decision record parks a future sub-decision |
| `A-` | Assumption | `A-<RISK>-<N>` | `A-FEA-1`, `A-VAL-3` |
| `R-` | Risk | `R-<RISK>-<N>` | `R-FEA-7`, `R-SEC-1` |
| `AC-` | Acceptance criterion | `AC-<SCOPE>-<N>` | `AC-MVP-1`, `AC-SEC-1` |
| `FR-` | Functional requirement | `FR-<AREA>-<N>` | `FR-AUTH-007` from the system spec |
| `NFR-` | Non-functional requirement | `NFR-<AREA>-<N>` or `NFR-001` | `NFR-SEC-1`, `NFR-001` |
| `INV-` | Invariant / release-blocking guardrail | `INV-<AREA>-<N>` | `INV-SAFE-1`: no silent overwrite |
| `G-` | North-star guardrail | `G-<AREA>-<N>` | `G-SAFE-1`, `G-DX-1` |
| `MET-` | Metric | `MET-<AREA>-<N>` | `MET-MVP-1`: publish success rate |
| `CC-` | Cross-cutting concern | `CC-<AREA>-<N>` | `CC-OBS-1`, `CC-SEC-1` |
| `BT-` | Backlog trigger / validation trigger | `BT-<AREA>-<N>` | `BT-FEA-1`: Mermaid spike trigger |
| `PER-` | Persona | `PER-<N>` | `PER-5`: sponsoring stakeholder |
| `JTBD-` | Job To Be Done | `JTBD-<PER-N>-<N>` | `JTBD-PER-5-1` |
| `OST-O-` | OST opportunity | `OST-O-<N>` | Future explicit alias for current `O1` style |
| `OST-S-` | OST solution | `OST-S-<N>` | Future explicit alias for current `S1.1` style |
| `OST-E-` | OST experiment | `OST-E-<N>` | Future explicit alias for current `E3.1` style |
| `BUG-` | Bug work item | `BUG-<N>` | Backlog / issue tracker |
| `STORY-` | Story work item | `STORY-<N>` | Backlog / issue tracker |
| `TASK-` | Task work item | `TASK-<N>` | Backlog / issue tracker |
| `SPIKE-` | Research spike work item | `SPIKE-<N>` | Backlog / issue tracker |

## Risk-domain suffixes

Use these consistently with `A-` and `R-`:

| Domain | Meaning | Example |
|---|---|---|
| `VAL` | Value risk — will users want this? | `A-VAL-1`, `R-VAL-2` |
| `USA` | Usability risk — can they use it? | `A-USA-1`, `R-USA-1` |
| `FEA` | Feasibility risk — can we build it? | `A-FEA-7`, `R-FEA-8` |
| `VIA` | Viability risk — does it make sense sustainably? | `A-VIA-2`, `R-VIA-1` |
| `SEC` | Security risk / security control | `R-SEC-1`, `AC-SEC-1` |

## Suggested acceptance-criterion scopes

| Scope | Use for | Example |
|---|---|---|
| `MVP` | Current milestone acceptance criteria | `AC-MVP-1` |
| `MLP` | Minimum Lovable Product acceptance criteria | `AC-MLP-1` |
| `SEC` | Security/redaction criteria | `AC-SEC-1` |
| `OBS` | Observability/diagnostics criteria | `AC-OBS-1` |
| `PERF` | Performance/scale criteria | `AC-PERF-1` |
| `DX` | Developer-experience criteria | `AC-DX-1` |
| `SYNC` | Synchronization-engine criteria | `AC-SYNC-1` |

## Grep examples

```bash
rg 'A-FEA-' doc
rg 'R-SEC-1' doc
rg 'AC-MVP-' doc
rg 'BT-' doc
```

## Migration note for existing Phase 1 OST IDs

The Phase 1 OST currently uses compact IDs (`O1`, `S1.1`, `E3.1`). They are
accepted for the current artifacts, but future cross-document references should
prefer explicit aliases (`OST-O-*`, `OST-S-*`, `OST-E-*`) when those artifacts are
next revised. Do not mix additional ad-hoc forms.
