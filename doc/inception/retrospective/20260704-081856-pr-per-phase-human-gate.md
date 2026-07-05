---
status: Draft
created: 2026-07-04T08:18:56Z
phase_scope: phases-0-2
topic: PR-per-phase human gate
outcome: repeat
---

# Retrospective — PR-per-phase human gate

> **ADOS outcome (2026-07-05):** → [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) (Practice 6 — PR-per-phase as an optional inception delivery mode).

## What happened

The project owner chose to run each inception phase as a separate branch and PR:

- Phase 0 → PR #1
- Phase 1 → PR #2
- Phase 2 → PR #3

Each PR merge acted as the human gate for that phase.

## What went well

- The gate became auditable in GitHub instead of living only in chat.
- Review comments, red-team output, Copilot feedback, and final approval all stayed attached to the phase artifact diff.
- Squash-merge kept `main` readable: one commit per approved inception phase.
- The model reduced ambiguity around "approved" — merge means approval.

## Improvement / pattern to repeat

Keep **one phase = one branch = one PR = one human gate** for the rest of inception.

At the start of every future phase:

1. branch from latest `main`;
2. produce only that phase's artifacts;
3. open a PR whose body states the gate decisions;
4. stop until the human approves/merges.

## Process note

When state says a phase is completed, that should happen only after the phase PR
is approved or as part of the approved PR. The current project now follows the
practical variant: approved phase PRs are squash-merged and later phases start
from the updated state on `main`.
