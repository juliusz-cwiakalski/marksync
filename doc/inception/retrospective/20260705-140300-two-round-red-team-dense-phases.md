---
status: Draft
created: 2026-07-05T14:03:00Z
phase_scope: phase-3
topic: Two-round red-team for artifact-dense phases
outcome: repeat
---

# Retrospective — Two-round red-team for artifact-dense phases

## What happened

Phase 3 is the most artifact-dense inception phase: it produced a tech-stack
record, an architecture overview with C4 diagrams, an FSE audit, an NFR
register, and 11 decision records. Two full days were spent on Phase 3 with
multiple revision rounds.

The red-team review was run twice:

- **Round 1** (11 specialists, BLOCK verdict): found strategic issues —
  ADR-0010 provenance over-specified, spike gates not operationalized, stale/
  contradictory docs, test matrices not enumerable, keytar native-module risk,
  privacy concerns. The owner addressed all P0 items and most P1 items.

- **Round 2** (8 specialists, REWORK narrow verdict): found 8 P0 propagation
  issues — all mechanical consistency problems from the amendments and
  reclassification. No strategic re-opens. The second round was cheaper
  (narrower scope, fewer specialists) and caught real issues that would have
  caused implementation problems.

The owner's instinct — "we're close to finalize but want to do another round
to be on a safe side" — was correct.

## What went well

- Round 1 was broad (11 specialists) and caught strategic issues.
- Round 2 was narrow (8 specialists, focused on recent changes + cross-document
  coherence) and caught propagation issues efficiently.
- The second round's scope was explicitly narrower — it did not re-debate
  settled strategic questions.
- The round-2 report was honest about what was a propagation problem vs a
  design problem.

## Lesson

**For artifact-dense phases (Phase 3, possibly Phase 5), a second red-team
round after major revisions is cheap insurance.** The pattern:

1. **Round 1:** broad panel, holistic review, strategic + tactical findings.
2. **Apply all P0/P1 findings.**
3. **Round 2:** narrower panel, focused on (a) recent changes, (b) cross-
   document consistency, (c) whether round-1 resolution claims are accurate.
4. **Apply round-2 findings (typically mechanical propagation fixes).**

The cost of round 2 is ~40% of round 1 (fewer specialists, narrower scope).
The value is catching propagation failures that would silently mislead an
implementer or AI agent.

## When to do a second round

- Phase 3 (tech stack & architecture) — always, due to artifact density.
- Phase 5 (ADOS framework integration) — likely, due to cross-cutting files.
- Phases 0–2, 4, 6–7 — only if round 1 produced major amendments (>30% of
  findings resulted in material changes).

## When to skip

- Round 1 produced only minor findings (all Low/Medium, no Critical/High).
- The phase has few cross-references between artifacts (low propagation risk).
