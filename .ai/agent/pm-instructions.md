# PM Instructions

> Project-specific PM configuration for MarkSync for Confluence.
> The standard 11-phase change lifecycle lives in
> [doc/guides/change-lifecycle.md](../../doc/guides/change-lifecycle.md) —
> this file does NOT repeat it.

## Tracker Configuration

- **Tracker**: GitHub Issues
- **Owner/repo**: `juliusz-cwiakalski/marksync`
- **Access**: GitHub MCP tools (preferred) or `gh` CLI fallback
- **workItemRef prefix**: `GH-<number>` (e.g., `GH-42`)

## Workflow States Mapping

| ADOS lifecycle phase | GitHub label | Notes |
|---|---|---|
| clarify_scope → delivery_planning | `in-progress` | Applied when PM picks up the issue |
| dor_check | `in-progress` | No transition; DoR is an internal gate |
| delivery → quality_gates | `in-progress` | Coder/runner active |
| review_fix | `review` | PR open and under review |
| dod_check → pr_creation | `review` | Awaiting human merge |
| Done (merged) | (close issue) | PM closes the issue after PR merge |
| Blocked | `blocked` | Waiting on human input or external dependency |

> `change` is applied at intake; status labels track progress. Issues are
> closed on merge, not left in a `done` column.

## Label Taxonomy

| Label | When applied |
|---|---|
| `change` | **Mandatory** — every ADOS-managed work item |
| `feature` | New capability or enhancement |
| `bug` | Defect fix |
| `docs` | Documentation-only change |
| `spike` | Time-boxed investigation (e.g., MS-0001 follow-ups) |
| `priority:high` / `priority:medium` / `priority:low` | Triage priority |
| `MS-0002` / `MS-0003` … | Milestone tag (monotonic per roadmap) |
| `in-progress` | Work actively underway |
| `review` | PR open, awaiting review/merge |
| `blocked` | Waiting on a dependency or external input |
| `human-input-needed` | Waiting on a human answer or decision |

## Backlog Source of Truth

**GitHub Issues is the canonical backlog.** Per-milestone ranked backlogs live
in `doc/planning/` (see Per-Milestone Backlog below). Query for ADOS work:

```
repo:juliusz-cwiakalski/marksync label:change -label:blocked is:open sort:created-asc
```

## Per-Milestone Backlog

Each milestone has a ranked backlog at
`doc/planning/milestones/MS-<N>/backlog-MS-<N>.md` — an ordered table (top =
highest priority) that drives delivery sequence within that milestone.

**Convention:** see [backlog-convention.md](../../doc/planning/backlog-convention.md)
for the business-ID scheme (`MS<N>-E<NN>-S<NN>` for stories, `MS<N>-B<NNN>` for
bugs), folder structure, and GitHub Issue ↔ story-file relationship.

- **Prepare the backlog before starting milestone work** (typically when the
  previous milestone is completing or complete). Do not prepare backlogs far
  into the future — each milestone delivery surfaces new knowledge that
  reshapes the next backlog.
- The backlog ranking reflects: dependencies/blockers, value delivered,
  priority labels, and risk. Blocking issues inherit the priority of what they
  block (see Priority & Selection Rules).
- **Backlogs are subject to constant reprioritization.** New facts, learnings,
  or dependency changes during delivery warrant re-ranking.
- **PM reviews prioritization on a regular basis** (every few tickets
  delivered) to ensure the plan is not drifting too far from reality.
- **Git files are authoritative** for story scope; GitHub Issues are short
  summaries that link to the story files. Title prefix: `[MS2-E3-S1] Title`.
- Archive completed milestone backlogs to `doc/planning/archive/`.

## Conventions

- **workItemRef**: `GH-<number>` (e.g., `GH-42`)
- **Branch**: `<type>/<workItemRef>/<slug>` — e.g., `feat/GH-42/safe-publish`
- **Commit**: Conventional Commits (enforced by TDR-0008: commitlint + husky + CI)
- **Squash-merge** to `main`; branch protection requires PR review.

## Issue Validation Checklist

Before starting any issue, verify:

1. `change` label is applied.
2. Status is not `blocked`. **If `blocked`:** inspect the blocking reason — it
   may be a stale label (e.g., was blocked by a dependency ticket that has since
   been delivered). If the blocker is resolved, remove the `blocked` label.
3. Acceptance criteria exist in the issue body (or linked spec).
4. The issue is tagged with the correct milestone (`MS-0002`, etc.).
5. Dependencies (linked issues / "blocked by") are resolved.

### Cascade unblock check

When a ticket is resolved (merged), PM must check whether it was blocking other
tickets. For each blocked ticket:

1. Check **all** its blockers — not just the one that was resolved.
2. If **all** blockers are now resolved → remove the `blocked` label.
3. **WARNING:** Do not remove `blocked` blindly when only one of several
   blockers is resolved. A ticket with multiple blockers stays `blocked` until
   the last blocker clears.

## Priority & Selection Rules

1. `blocked` issues are skipped (do not pick up) — unless the block is stale
   (see Issue Validation Checklist).
2. `in-progress` takes precedence (finish before starting new).
3. **Blocking issues inherit priority.** If a `priority:high` issue is blocked
   by issue X, then X is effectively `priority:high` regardless of its own
   label — delivering X unblocks the high-priority work.
4. Within a milestone, `priority:high` → `medium` → `low` (adjusted by the
   blocking-inheritance rule above).
5. Ties broken by oldest created date.
6. Selection follows the per-milestone backlog ranking
   (`doc/planning/backlog-MS-<NNNN>.md`) when it exists.

## Quality Gate References

Quality gates run via `@runner` / `/check` and `/check-fix`. See
[.github/workflows/ci.yml](../../.github/workflows/ci.yml) for the authoritative
job list. Scripts are wired in [doc/guides/dev-environment.md](../../doc/guides/dev-environment.md).

## Blocking Question Workflow

When human input is required mid-delivery:

1. Record the question in `chg-<workItemRef>-questions.md` in the change folder
   (alongside spec/plan/test-plan). Use a structured format with a placeholder
   for the answer so it is as easy as possible for the human to respond:
   ```markdown
   ## OPEN-Q1: <question title>

   **Question:** <the question, with context>

   **Why:** <why this is blocking>

   ### Answer
   <!-- Human: provide your answer here (or reply inline on the PR) -->
   ```
2. Post a comment on the GitHub issue linking to the questions file (and
   specific inline PR comments if the question is about specific files/lines).
3. Apply the `human-input-needed` label (and `blocked` if delivery cannot
   proceed).
4. Assign the issue to the human owner.
5. **STOP** — do not proceed until the answer is provided. The human may answer
   inline on the PR, directly in the file from their IDE, or via an issue
   comment. Fold the answer into the file and remove the labels.

## Issue Intake Readiness

> This is a lightweight pre-delivery checklist. The **formal DoR gate** is
> phase 5 (`/check-readiness`, run by `@readiness-reviewer`) — see
> [definition-of-ready.md](../../doc/guides/definition-of-ready.md).

A work item is ready for delivery when:

- [ ] Acceptance criteria are explicit and testable.
- [ ] The `change` label and milestone tag are set.
- [ ] Dependencies are identified and resolved.
- [ ] The spec references the relevant ADR(s) / NFRs.
- [ ] No open questions on the issue thread.
- [ ] Testing approach is clear (which of the 6 tiers apply).

## PR/MR Workflow Customizations

- **Squash-merge only** to `main` (branch protection enforces).
- PR title = Conventional Commit summary (commitlint-validated).
- PR body must list: acceptance criteria status, test tiers run, ADRs touched.

### Review modes

This repo accepts two review modes:

1. **Human review** (default) — the human owner reviews and merges each PR.
2. **Auto-delivery via `@ceo`** — the owner may delegate PR review/approval to
   the `@ceo` agent, which acts on behalf of the human. In this mode, `@ceo`
   reviews the PR against the spec/plan/quality gates and approves or requests
   changes autonomously.

The owner chooses the mode per delivery batch: either start delivery and review
PRs personally, or ask `@ceo` to deliver a batch of tickets and handle
review/approval.

## Decision Documentation

- Delegate to `@decision-advisor` via `/plan-decision` + `/write-decision`.
- Records live in [doc/decisions/](../../doc/decisions/) as
  `<TYPE>-<zeroPad4>-<slug>.md` (ADR/PDR/TDR/BDR/ODR; per-type sequences).
- Strategic context for decisions:
  [.ai/agent/decision-instructions.md](decision-instructions.md).
