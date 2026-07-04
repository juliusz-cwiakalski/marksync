---
status: Draft
created: 2026-07-04T10:05:33Z
phase_scope: phase-2
topic: Milestone IDs and ADOS roadmap guidance
outcome: propose-ados-framework-improvement
---

# Retrospective — Milestone IDs and ADOS roadmap guidance

## What happened

While reviewing the Phase 2 roadmap, the owner observed that named milestones
such as "MVP", "MLP", "Drift lifecycle completeness", or "Platform breadth" are
easy to discuss initially but brittle as durable references. Names can change,
scope can split, and a long-running project may eventually have dozens or more
than 100 milestones.

The project introduced monotonic roadmap milestone IDs:

- `MS-0001` — Confluence API validation spike;
- `MS-0002` — MVP / safe one-way publisher;
- `MS-0003` — MLP / exceptional DX;
- `MS-0004+` — future staged roadmap milestones.

## Pattern to repeat

ADOS should standardize milestone management guidance:

1. Every roadmap milestone gets a stable `MS-<NNNN>` ID.
2. Milestone IDs are monotonic and never reused or renumbered.
3. Human-readable names remain useful, but durable cross-document references use
   the ID.
4. Roadmaps should include a milestone allocation matrix mapping assumptions,
   risks, decisions, spikes, backlog triggers, and validation gates to milestone
   IDs.
5. Acceptance criteria, metrics, backlog items, and decision records should
   prefer milestone IDs in durable references (`AC-MS-0002-1`,
   `MET-MS-0002-1`) rather than mutable labels (`AC-MVP-1`).

## ADOS framework improvement candidate

Add explicit milestone-management support to ADOS:

- update the shared ID-prefix catalog to include `MS-`;
- update `roadmap-engineering-template.md` with:
  - an `ID` column for completed/current/future milestones;
  - a monotonic-ID rule;
  - a roadmap allocation matrix section;
  - guidance that the current milestone is detailed, the next milestone can be
    detailed-but-tentative, and later milestones are high-level with "read before
    planning" references;
- add a short guide for efficient milestone work:
  - when to create a new milestone vs split/scope the current one;
  - how milestone IDs flow into assumptions, risks, ACs, metrics, ADRs, backlog
    items, and release notes;
  - how to close, supersede, or partially deliver a milestone without renumbering;
  - how agents should search by `MS-<NNNN>` before planning work;
- consider a `milestone-template.md` or roadmap-register structure for projects
  that need per-milestone detail beyond `02-roadmap.md`.

## Why it matters

Stable milestone IDs make long-horizon planning safer for humans and agents:

- fewer ambiguous references in PR comments and reviews;
- easier `rg 'MS-0002' doc` tracing;
- clearer Phase 7 backlog generation;
- easier readiness checks for assumption/risk coverage;
- safer milestone evolution when names and scopes change.
