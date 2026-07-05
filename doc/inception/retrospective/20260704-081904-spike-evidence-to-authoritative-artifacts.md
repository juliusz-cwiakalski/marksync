---
status: Draft
created: 2026-07-04T08:19:04Z
phase_scope: phases-0-2
topic: Spike evidence to authoritative artifacts
outcome: repeat
---

# Retrospective — Convert spike evidence into authoritative artifacts

> **ADOS outcome (2026-07-05):** → [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) (Practice 5 — spike evidence → authoritative artifacts).

## What happened

The Confluence API spike produced temporary working evidence under
`doc/inception/tmp/`. That evidence was then distilled into durable artifacts:

- integration scenarios;
- ADR-0005;
- Phase 1 north star / OST;
- Phase 2 roadmap, assumptions, and risks.

## What went well

- Temporary spike code stayed gitignored.
- Durable conclusions were moved into committed docs.
- Red-team review could reason about evidence without depending on raw scratch
  files.

## Improvement / pattern to repeat

When future spikes run:

1. keep raw spike implementation in `doc/**/tmp/`;
2. extract stable evidence into committed scenario/findings/decision docs;
3. route implications into roadmap, assumptions, risks, and decisions;
4. never leave a critical assumption validated only by an uncommitted scratch file.

## Future application

ADR-0002 Mermaid rendering and Bun single-binary viability are the next likely
spikes. Their evidence should follow the same pattern.
