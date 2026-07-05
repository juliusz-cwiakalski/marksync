---
status: Draft
created: 2026-07-04T08:18:58Z
phase_scope: phase-2
topic: Backporting ADOS retrospective issues into active inception
outcome: repeat
---

# Retrospective — Backport ADOS retrospective issues into active inception

> **ADOS outcome (2026-07-05):** EXCLUDED from [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) as non-generic — only meaningful when a project's owner tracks ADOS's own evolution (here the owner IS the ADOS maintainer); a generic ADOS install has no business polling the ADOS tracker each phase. Universal kernel ("record any process gap as a retro note") is covered by GH-137 Practice 1. No ticket.

## What happened

The owner pointed at ADOS issues from another project retrospective:

- [#103](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/103) — decision→backlog traceability and deferred-decision hygiene;
- [#105](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/105) — cross-cutting-concern decomposition;
- [#131](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/131) — structured failure pre-mortem + success pre-parade artifacts.

Although ADOS has not implemented these changes yet, we proactively applied the
lessons to MarkSync Phase 2.

## What went well

This produced three additional planning-control artifacts:

- `doc/inception/analysis/backlog-reconciliation.md`
- `doc/inception/analysis/failure-premortem.md`
- `doc/inception/analysis/success-pre-parade.md`

These prevent process debt from carrying forward into implementation planning.

## Improvement / pattern to repeat

Before finishing every future phase, actively ask:

> Are there known ADOS retrospectives / open process tickets that should be
> applied proactively to this project even before ADOS formalizes them?

If yes, adapt the lesson into project-local artifacts rather than waiting for
framework implementation.

## Why this matters

ADOS itself evolves through retrospectives. A project in inception should not be
blocked from using newer process insights just because the framework template has
not caught up yet.
