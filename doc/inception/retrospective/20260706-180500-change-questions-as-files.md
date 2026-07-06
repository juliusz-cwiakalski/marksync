---
status: Accepted
created: 2026-07-06T18:05:00
phase_scope: 5
topic: Change open questions as chg-<ref>-questions.md files
outcome: propose-ados-framework-improvement
---

# Retrospective: Persisting change-scoped open questions as files

## What happened

During Phase 5 PR review, the owner proposed a `chg-<workItemRef>-questions.md`
file pattern — analogous to `chg-<workItemRef>-spec.md`, `plan.md`,
`test-plan.md`, and `pm-notes.yaml` — to track open questions that arise during
a change delivery. Questions are persisted in the change folder with a
placeholder for the answer, making them easy to review and answer.

## Pattern to propose

```
doc/changes/YYYY-MM/YYYY-MM-DD--<workItemRef>--<slug>/
  ├── chg-<workItemRef>-spec.md
  ├── chg-<workItemRef>-plan.md
  ├── chg-<workItemRef>-test-plan.md
  ├── chg-<workItemRef>-questions.md    # NEW
  └── chg-<workItemRef>-pm-notes.yaml
```

**File format:**

```markdown
## OPEN-Q1: <question title>

**Question:** <the question, with context>

**Why:** <why this is blocking delivery>

### Answer
<!-- Human: provide your answer here (or reply inline on the PR) -->
```

**Workflow:**
1. PM/coder records the question in the file.
2. PM posts a PR/issue comment linking to the file (and inline PR comments for
   file-specific questions).
3. `human-input-needed` label applied on the tracker.
4. Human answers: inline on the PR, directly in the file from IDE, or via issue
   comment.
5. PM folds the answer into the file; removes `human-input-needed`/`blocked`.

## Why it matters

Currently, change-scoped open questions live in `pm-notes.yaml` (a YAML
structure not optimized for Q&A readability) or as ephemeral PR/issue comments
that are hard to find later. A dedicated questions file:

- **Persists** questions in the change context (survives session boundaries).
- **Makes answering easy** — the human sees a clear placeholder.
- **Is reviewable** — a reviewer can see all open questions in one file.
- **Mirrors the inception open-questions pattern** (`doc/inception/open-questions/`)
  that already works well.

This could become the **standard ADOS way** of managing change-related open
questions, replacing ad-hoc pm-notes entries and scattered PR comments.

**Filed as:** ADOS framework improvement — add `chg-<workItemRef>-questions.md`
to the change convention spec, PM agent prompt, and change-spec template.
