---
status: Draft
created: 2026-07-04T09:33:32Z
phase_scope: phase-2
topic: Standard ID prefix catalog
outcome: repeat
---

# Retrospective — Standard ID prefix catalog

> **ADOS outcome (2026-07-05):** split three ways → [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) (Practice 7 — bootstrapper maintains a project-local catalog) + [GH-140](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/140) (framework-wide prefix standardization across templates) + [GH-139](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/139) (`MS-` milestone IDs).

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

Also document the prefix scope explicitly:

- company-global: valid across all company projects and repos;
- project-global: valid across a single project, including multi-repo setups;
- repo-local: valid only within one repository;
- change-local: valid only within one change, initiative, or ADOS phase;
- document-local: valid only within a single document.

If the scope is not obvious, record it next to the prefix in the catalog.

## Why it matters

Stable prefixes make AI-agent work safer:

- fewer false-positive references;
- easier dependency tracing;
- cleaner backlog reconciliation;
- easier readiness checks;
- better automated search across docs, PRs, and future issues.

## ADOS repo gap analysis — prefixes to standardize

Scanning the ADOS repo shows a few high-value prefixes that are already in use or strongly implied by templates, but are not yet in the shared catalog:

- `SPEC-` — feature spec IDs (`doc/spec/features/feature-*.md`); useful as durable feature anchors.
- `TEST-SPEC-` — enduring feature test-spec IDs; pairs with `SPEC-` for traceability.
- `F-` — functional capability IDs in change/feature specs; the repo uses these pervasively.
- `NG-` — non-goal IDs in change specs; helps keep exclusions grepable.
- `DM-` — data-model / metadata-model IDs; already used for front matter and schema elements.
- `RSK-` — risk-register item IDs; clearer than overloading generic `R-` in change specs.
- `OQ-` — open-question IDs; useful for unresolved scope questions.
- `DEC-` — local decision-log items inside change specs; distinct from ADR/PDR/TDR/ODR/BDR records.
- `TC-` — test-case IDs in test plans; especially useful when tied to feature slugs (`TC-<FEATURE>-<NNN>`).
- `API-` / `EVT-` — interface-coverage IDs referenced by test-plan templates; worth standardizing if interface traces are expected to be grepable.
- `MS-` — roadmap milestone IDs (`MS-0001`, `MS-0002`, ...). Milestone numbers should be monotonic and never reused or renumbered, so humans and agents can reference specific milestones unambiguously even as names/scope evolve.
