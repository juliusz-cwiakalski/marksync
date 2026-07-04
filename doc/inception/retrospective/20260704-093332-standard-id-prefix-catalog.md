---
status: Draft
created: 2026-07-04T09:33:32Z
phase_scope: phase-2
topic: Standard ID prefix catalog
outcome: repeat
---

# Retrospective — Standard ID prefix catalog

## What happened

During Phase 2, the documents started accumulating many durable item IDs:
assumptions (`A-FEA-7`), risks (`R-SEC-1`), decision records (`ADR-0001`),
metrics, guardrails, and future backlog triggers. Without a standard catalogue,
future phases would likely invent similar-but-different prefixes on the fly.

## What went well

The owner noticed the issue early, before implementation planning began. This is
the right moment to standardize the ID system because Phase 7 / backlog planning
will need stable references.

## Improvement / pattern to repeat

Maintain `doc/inception/analysis/id-prefix-catalog.md` as the project-local
source of truth for prefixes.

Before creating a new item type, ask:

1. does a prefix already exist in the catalog?
2. if not, should this be a new prefix or a subtype of an existing prefix?
3. will the resulting ID be easy to `rg` across the repo?

## Why it matters

Stable prefixes make AI-agent work safer:

- fewer false-positive references;
- easier dependency tracing;
- cleaner backlog reconciliation;
- easier readiness checks;
- better automated search across docs, PRs, and future issues.
