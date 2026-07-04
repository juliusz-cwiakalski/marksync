---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: FAILURE-PREMORTEM
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: risk
document_classification: current-truth
links:
  source_ados_issue: https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/131
  source_material: doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md
  routed_to:
    - doc/inception/analysis/risks.md
    - doc/inception/analysis/assumptions.md
    - doc/overview/02-roadmap.md
summary: "Structured Phase 2 failure pre-mortem and routing contract."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Failure Pre-mortem (Structured)

_Produced proactively from ADOS issue #131. This is not a replacement for the
long-form premortem input; it is the routed Phase 2 artifact that states what
must change downstream._

## Horizon and imagined failed end state

**Horizon:** 6–12 months after the MVP begins delivery.

**Failed state:** MarkSync looks mature on paper but has not become a retained
CI tool for real teams. It has many docs and tests, but users either cannot
activate it quickly, do not trust it with important pages, or hit one safety edge
that requires maintainer intervention.

## Backward chain

```text
End-state category vision
  -> too many MVP promises
  -> slow delivery of the safe one-way wedge
  -> few real design partners / fixture-only validation
  -> first beta hits stale-base, identity, macro, or setup failures
  -> trust damaged before retained CI usage exists
  -> maintainer pulled into support matrix instead of wedge proof
```

## Root-cause / driver classification

| Driver | Classification | Routed artifact |
|---|---|---|
| Scope explosion | value / viability | R-VAL-1; roadmap MVP/MLP split |
| No validated beachhead | value | R-VAL-2; A-VAL-1 |
| Concurrent stale-base overwrite | feasibility / safety | R-FEA-7; A-FEA-7; roadmap concurrency deliverable |
| Wrong identity / state model | feasibility | R-FEA-3; A-FEA-9 |
| Fixture corpus not representative | feasibility / value | R-FEA-9; A-VAL-2 |
| Setup friction | usability | R-USA-1; A-USA-1/A-USA-2 |
| Maintainer overload | viability | R-VIA-1; roadmap scope-realism notes |
| Secret leakage / supply chain | feasibility / security | R-SEC-1; roadmap 0-secrets guardrail |

## Routing contract

| Output from pre-mortem | Routed to |
|---|---|
| Narrow wedge before category vision | `02-roadmap.md` current milestone |
| Pre-mortem top risks | `risks.md` R-VAL/R-USA/R-FEA/R-VIA rows |
| Unknowns needing validation | `assumptions.md` priorities |
| Anti-roadmap / not-now list | `02-roadmap.md` out-of-scope + future milestones |
| DoR/DoD guard ideas | `backlog-reconciliation.md` cross-cutting coverage |
| Readiness check inputs | Phase 6 readiness: verify all routed outputs exist |

## Phase 2 readiness checks satisfied here

- [x] Failure narrative captured.
- [x] Backward chain captured.
- [x] Root drivers classified by four-risk type.
- [x] Outputs routed to roadmap, risk register, assumption register, and backlog reconciliation.
- [x] Remaining unvalidated items have trigger placeholders in `backlog-reconciliation.md`.
