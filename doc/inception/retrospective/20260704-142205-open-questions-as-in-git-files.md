# Retrospective — Open questions as persisted in-git files

> **ADOS outcome (2026-07-05):** → [GH-137](https://github.com/juliusz-cwiakalski/agentic-delivery-os/issues/137) (Practice 2 — per-phase open-questions files with stable `OPEN-Q<N>` IDs).

**Date:** 2026-07-04
**Phase:** 3
**Topic:** Recording inception open questions in durable per-phase files instead of ephemeral PR comments.

## Context

During Phase 3, open questions for the human were initially posted in the PR
description (`OPEN-Q1`…`OPEN-Q5`). The human answered them in a PR comment
(PR #4 issue comment). Two problems emerged:

1. **PR comments are ephemeral and scattered.** Answers live in the GitHub
   comment thread, not in the repo. They are easy to lose track of, hard to grep,
   and not version-controlled alongside the artifacts they affect.
2. **New questions discovered mid-phase had no home.** Refining ADR-0006 from the
   answers surfaced a new question (`OPEN-Q6` — sync granularity) that needed a
   durable place to live until answered.

## What changed

Introduced `doc/inception/open-questions/phase-<N>-open-questions.md` — one file
per inception phase. Structure:

- Each question has a stable `OPEN-Q<N>` ID and a status
  (`OPEN` · `ANSWERED` · `DEFERRED`).
- The human answers **inline** under an `### Answer` heading.
- The bootstrapper incorporates the answer into the affected artifacts and flips
  the status to `ANSWERED` (or `DEFERRED` with a target phase).
- New questions discovered during the phase are appended with status `OPEN`.

## Why this is better

- **Durable:** answers are committed to git, version-controlled, reviewable in PRs.
- **Grepable:** stable `OPEN-Q<N>` IDs cross-reference ADRs and artifacts.
- **Inline-friendly:** the human edits the file directly — no context switching
  to a PR comment thread.
- **Carries forward:** a phase's open questions survive into later phases if
  deferred, with a clear trail.

## ADOS framework improvement note

Consider adding to the ADOS inception guide a recommendation that bootstrappers
record open questions in `doc/inception/open-questions/phase-<N>-open-questions.md`
rather than (or in addition to) PR comments. The per-phase file pattern is
project-portable and complements the existing `doc/inception/retrospective/`
practice.

## What to watch

- Don't let the file accumulate stale `OPEN` items — either answer, defer with a
  target phase, or close with a reason.
- Keep `OPEN-Q<N>` IDs monotonic within a phase and never reuse them.
