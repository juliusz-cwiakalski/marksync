---
status: Draft
created: 2026-07-04T08:19:01Z
phase_scope: phase-2
topic: Cross-cutting backlog coverage
outcome: repeat
---

# Retrospective — Cross-cutting backlog coverage

> **ADOS outcome (2026-07-05):** → [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) (Practice 4 — cross-cutting coverage, genericized: concerns are project-derived, not a fixed list). Related delivery-time tickets: [GH-105](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/105), epic [GH-104](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/104).

## What happened

ADOS issue [#105](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/105) highlighted a failure mode: functional decomposition can hide
cross-cutting quality work. In MarkSync, the risk is acute because the product's
value depends on safety/security/diagnostics/provenance/performance, not only on
feature delivery.

## What went well

The new `backlog-reconciliation.md` explicitly lists cross-cutting concerns that
must have a ticket or named AC:

- zero silent overwrite;
- drift-detection effectiveness;
- conflict false-positive rate;
- semantic idempotency;
- secret redaction;
- visible provenance;
- diagnostics / observability;
- performance / binary budgets;
- accessibility / plain-log output;
- maintainer sustainability.

## Improvement / pattern to repeat

During Phase 7 and first backlog planning, do not accept a backlog that contains
only functional slices. Require a cross-cutting coverage check before declaring
the backlog ready.

## Anti-pattern to avoid

Do not write: "security/performance/observability are included in each story".
That is not representation. Each concern needs either a ticket or explicit AC.
