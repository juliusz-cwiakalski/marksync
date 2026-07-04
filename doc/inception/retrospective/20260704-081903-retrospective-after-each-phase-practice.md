---
status: Draft
created: 2026-07-04T08:19:03Z
phase_scope: future-phases
topic: Retrospective after each inception phase
outcome: repeat
---

# Retrospective — Make phase retrospectives a standing practice

## What happened

The owner requested that inception capture process lessons continuously, not only
after the whole inception is done.

## Practice to adopt

After every future inception phase:

1. review the conversation, PR comments, red-team output, Copilot comments, and
   any process incidents;
2. create one retrospective note per topic under `doc/inception/retrospective/`;
3. use filename format: `YYYYMMDD-HHMMSS-<slug>.md`;
4. mark whether the topic is `repeat` or `improve`;
5. if the note implies a change to current artifacts, apply the change in the
   same phase PR before asking for final review.

## What to capture

- patterns that worked and should be repeated;
- process misses / near misses;
- framework gaps that should feed ADOS;
- review patterns that found valuable issues;
- human preferences that should influence the next phase.

## Definition of done for future phase PRs

A phase PR is not ready for human gate review until its phase retrospective
notes are written or the PR body explicitly states why no new retrospective
notes were needed.
