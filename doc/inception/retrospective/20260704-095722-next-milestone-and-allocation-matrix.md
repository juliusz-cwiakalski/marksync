---
status: Draft
created: 2026-07-04T09:57:22Z
phase_scope: phase-2
topic: Detailed next milestone and roadmap allocation matrix
outcome: repeat
---

# Retrospective — Detailed next milestone and roadmap allocation matrix

## What happened

The original roadmap had a detailed Current Milestone and a compact future
milestone table. The owner pointed out that this loses knowledge we already have
about the immediately-next milestone and makes it unclear where assumptions,
risks, deferred decisions, spikes, and backlog triggers will be handled.

## What went well

The roadmap now records:

- **Next Milestone** as a first-class detailed section, marked subject to change;
- future milestone detail subsections with "read before planning" references;
- a roadmap allocation matrix assigning known assumptions, risks, decisions,
  spikes, and planning controls to milestones or gates.

## Improvement / pattern to repeat

For future roadmap updates:

1. Current Milestone should be detailed.
2. Next Milestone should also be detailed, but explicitly marked subject to
   change based on current-milestone evidence.
3. Later milestones may stay high-level, but each needs a reference subsection
   preserving what to read before detailed planning.
4. Every durable ID introduced in assumptions, risks, decisions, spikes, or
   backlog controls must be allocated to a roadmap milestone/gate.

## Why it matters

This prevents current strategic knowledge from disappearing between inception and
implementation. It also gives future AI agents a deterministic place to answer:

> "Where will this assumption/risk/decision/spike be handled?"
