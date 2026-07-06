---
status: Accepted
created: 2026-07-06T18:00:00
phase_scope: 5
topic: Per-milestone backlog preparation in doc/planning/
outcome: propose-ados-framework-improvement
---

# Retrospective: Per-milestone backlog as a delivery planning standard

## What happened

During Phase 5 PR review, the owner identified that PM priority/selection rules
should be backed by a **per-milestone ranked backlog** in `doc/planning/`, not
just ad-hoc GitHub Issues queries. The backlog drives delivery sequence within
a milestone.

## Pattern to propose

1. **Prepare backlog before milestone start** — when the previous milestone is
   completing or complete. Don't prepare backlogs far ahead; each milestone
   delivery surfaces new knowledge that reshapes the next backlog.
2. **Location:** `doc/planning/backlog-MS-<NNNN>.md` — ordered table (top =
   highest priority) with status and dependencies.
3. **Ranking reflects:** dependencies/blockers (blocking issues inherit
   priority), value delivered, priority labels, risk.
4. **Constant reprioritization** — new facts or learnings during delivery
   warrant re-ranking. PM reviews every few tickets to prevent plan drift.
5. **Archive** completed milestone backlogs to `doc/planning/archive/`.

## Why it matters

Without a per-milestone backlog, PM selection is reactive (query Issues, pick
highest priority). A ranked backlog makes the delivery plan explicit,
reviewable, and adjustable — which is critical for autonomous delivery where
the `@ceo` agent needs a clear sequence to follow.

**Filed as:** ADOS framework improvement — add per-milestone backlog guidance
to the onboarding guide and PM agent prompt.
