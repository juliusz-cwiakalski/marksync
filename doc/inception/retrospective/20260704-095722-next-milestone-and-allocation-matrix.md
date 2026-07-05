---
status: Draft
created: 2026-07-04T09:57:22Z
phase_scope: phase-2
topic: Detailed next milestone and roadmap allocation matrix
outcome: repeat
---

# Retrospective — Detailed next milestone and roadmap allocation matrix

> **ADOS outcome (2026-07-05):** → [GH-139](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/139) (roadmap `MS-<NNNN>` milestone IDs + allocation matrix + milestone-management guide).

## What happened

The original roadmap had a detailed Current Milestone and a compact future
milestone table. The owner pointed out that this loses knowledge we already have
about the immediately-next milestone and makes it unclear where assumptions,
risks, deferred decisions, spikes, and backlog triggers will be handled.

## What went well

The roadmap now records:

- stable, monotonic milestone IDs (`MS-0001`, `MS-0002`, ...), so every
  milestone can be referenced without relying on mutable names like "MVP" or
  "MLP";
- **Next Milestone** as a first-class detailed section, marked subject to change;
- future milestone detail subsections with "read before planning" references;
- a roadmap allocation matrix assigning known assumptions, risks, decisions,
  spikes, and planning controls to milestone IDs or gates.

## Improvement / pattern to repeat

For future roadmap updates:

1. Current Milestone should be detailed.
2. Next Milestone should also be detailed, but explicitly marked subject to
   change based on current-milestone evidence.
3. Later milestones may stay high-level, but each needs a reference subsection
   preserving what to read before detailed planning.
4. Every durable ID introduced in assumptions, risks, decisions, spikes, or
   backlog controls must be allocated to a roadmap milestone ID/gate.
5. Milestone IDs should be monotonic and permanent. If a milestone is renamed,
   split, or descoped, keep the existing ID and allocate new future work to the
   next `MS-<NNNN>` number.

## Why it matters

This prevents current strategic knowledge from disappearing between inception and
implementation. It also gives future AI agents a deterministic place to answer:

> "Where will this assumption/risk/decision/spike be handled?"
