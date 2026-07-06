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
| `blocked` | Waiting on human or external input |

## Backlog Source of Truth

**GitHub Issues is the only backlog.** Do not create or rely on local backlog
files. Query for ADOS work:

```
repo:juliusz-cwiakalski/marksync label:change -label:blocked is:open sort:created-asc
```

## Conventions

- **workItemRef**: `GH-<number>` (e.g., `GH-42`)
- **Branch**: `<type>/<workItemRef>/<slug>` — e.g., `feat/GH-42/safe-publish`
- **Commit**: Conventional Commits (enforced by TDR-0008: commitlint + husky + CI)
- **Squash-merge** to `main`; branch protection requires PR review.

## Issue Validation Checklist

Before starting any issue, verify:

1. `change` label is applied.
2. Status is not `blocked`.
3. Acceptance criteria exist in the issue body (or linked spec).
4. The issue is tagged with the correct milestone (`MS-0002`, etc.).
5. Dependencies (linked issues / "blocked by") are resolved.

## Priority & Selection Rules

1. `blocked` issues are skipped (do not pick up).
2. `in-progress` takes precedence (finish before starting new).
3. Within a milestone, `priority:high` → `medium` → `low`.
4. Ties broken by oldest created date.

## Quality Gate References

Quality gates run via `@runner` / `/check` and `/check-fix`. See
[.github/workflows/ci.yml](../../.github/workflows/ci.yml) for the authoritative
job list. Scripts are wired in [doc/guides/dev-environment.md](../../doc/guides/dev-environment.md).

## Blocking Question Workflow

When human input is required mid-delivery:

1. Post the question as a comment on the GitHub issue.
2. Assign the issue to the human owner.
3. Apply the `blocked` label.
4. **STOP** — do not proceed until the label is removed.

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
- Human review required before merge (no auto-merge).

## Decision Documentation

- Delegate to `@decision-advisor` via `/plan-decision` + `/write-decision`.
- Records live in [doc/decisions/](../../doc/decisions/) as
  `<TYPE>-<zeroPad4>-<slug>.md` (ADR/PDR/TDR/BDR/ODR; per-type sequences).
- Strategic context for decisions:
  [.ai/agent/decision-instructions.md](decision-instructions.md).
