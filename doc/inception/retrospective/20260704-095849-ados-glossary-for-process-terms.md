---
status: Draft
created: 2026-07-04T09:58:49Z
phase_scope: phase-2
topic: ADOS glossary for process terms and acronyms
outcome: improve
---

# Retrospective — ADOS glossary for process terms and acronyms

> **ADOS outcome (2026-07-05):** → [GH-70](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/70) (captured as a comment with the full process-term list; no new ticket — already inside #70's "doc/overview/glossary.md exists for ADOS" AC).

## What happened

The owner asked what **NSM** means while reviewing the roadmap. The answer is
simple once explained — **North Star Metric** — but the question exposed a
process gap: ADOS and project inception use many terms that are obvious to the
framework author but not necessarily obvious to every project reviewer or future
AI agent.

Examples:

- NSM — North Star Metric;
- OST — Opportunity Solution Tree;
- PRD — Product Requirements Document;
- MLP — Minimum Lovable Product;
- MVP — Minimum Viable Product;
- DoR / DoD — Definition of Ready / Definition of Done;
- ADR / PDR / TDR / ODR / BDR — decision-record variants;
- FSE — Full-Stack Environment;
- AC — acceptance criterion;
- NFR — non-functional requirement.

## What went well

The clarification happened during review, before these acronyms became hidden
friction in implementation planning.

## Improvement for ADOS

ADOS should include a **standard glossary / acronym catalog** for process terms.
It should explain:

1. term / acronym;
2. expansion;
3. concise meaning in ADOS;
4. where it appears;
5. whether projects may redefine it;
6. examples.

This should be part of the ADOS handbook or guide set, not just individual
project docs.

## Project-local practice until ADOS adds it

When a reviewer asks for a definition, treat it as evidence that the term should
be added to a glossary or catalogue. For MarkSync, Phase 4's glossary should
focus on product/domain terms, but it may link to this process-retro item and the
ID prefix catalog for ADOS/process terms.

## Why it matters for AI agents

Stable definitions reduce ambiguous interpretation. For example, **NSM** could
mean different things in other contexts, but in ADOS inception it should resolve
to one explicit meaning: **North Star Metric**, the top-level outcome metric for
whether the product is delivering core user value.
