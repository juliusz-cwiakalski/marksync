---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: PLANNING-CONVENTION
status: Accepted
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
area: planning
document_classification: current-truth
summary: "Backlog planning convention — business IDs, folder structure, GitHub Issue ↔ story file relationship."
---

# Backlog Planning Convention

> How backlog items are identified, organized in git, and tracked in GitHub.

## 1. Business IDs

Stable, human-readable identifiers that survive tracker renumbering and are
grep-friendly.

### Format

| Type | Format | Example |
|---|---|---|
| **Story** | `MS<N>-E<NN>-S<NN>` | `MS2-E3-S1` (milestone 2, epic 3, story 1) |
| **Bug** | `MS<N>-B<NNN>` | `MS2-B7` (bug 7 in milestone 2) |
| **Epic** | `MS<N>-E<NN>` | `MS2-E3` (epic 3 in milestone 2) |

- **`MS<N>`**: milestone number — maps to roadmap `MS-<NNNN>` without zero-padding
  (e.g., `MS-0002` → `MS2`).
- **`E<NN>`**: epic number, unique within the milestone (sequential from E1).
- **`S<NN>`**: story number, unique within the epic (sequential from S1).
- **`B<NNN>`**: bug number, sequential within the milestone (separate sequence
  from stories; bugs don't belong to epics).

IDs are **permanent**: if a story is descoped or split, its ID is never reused.

### GitHub Issue title prefix

Every GitHub Issue title starts with the business ID in brackets:

```
[MS2-E3-S1] Document identity — UUID v7 + front-matter management
[MS2-B7] Fix drift classifier false positive on reordered list items
```

## 2. Folder structure

```
doc/planning/
├── milestones/
│   └── MS-2/                               # one folder per milestone (roadmap ID)
│       ├── backlog-MS-2.md                 # ranked backlog table (milestone overview)
│       ├── MS2-E1--spikes/                 # one folder per epic
│       │   ├── MS2-E1--epic.md             # epic overview (goals, scope, dependencies)
│       │   ├── MS2-E1-S1--mermaid-render-spike.md
│       │   ├── MS2-E1-S2--version-message-limit.md
│       │   └── MS2-E1-S3--bun-cross-compile-smoke.md
│       ├── MS2-E2--foundation/
│       │   ├── MS2-E2--epic.md
│       │   ├── MS2-E2-S1--scaffolding.md
│       │   └── ...
│       └── ...
├── archive/                                # archived completed milestones
└── backlog-convention.md                   # this file
```

### Naming rules

| Element | Pattern | Example |
|---|---|---|
| Epic folder | `<EpicID>--<slug>/` | `MS2-E3--safe-publish/` |
| Epic doc | `<EpicID>--epic.md` | `MS2-E3--epic.md` |
| Story file | `<StoryID>--<slug>.md` | `MS2-E3-S1--document-identity.md` |
| Bug file | `<BugID>--<slug>.md` | `MS2-B7--drift-false-positive.md` |

`--` (double dash) separates the ID from the slug, matching the
[change convention](../../guides/unified-change-convention-tracker-agnostic-specification.md).

Bugs live at the milestone level (not inside an epic folder), in a `bugs/`
subdirectory: `MS-2/bugs/MS2-B7--drift-false-positive.md`.

## 3. Story file template

Each story file is the **detailed scope** — the authoritative source for what the
story delivers. GitHub Issues are short summaries that link here.

```markdown
---
id: MS2-E3-S1
title: Document identity — UUID v7 + front-matter management
status: todo          # todo | in-progress | review | done | blocked
type: story           # spike | story | bug
priority: critical    # critical | high | medium | low
epic: MS2-E3
milestone: MS-0002
estimate: null        # story points (Fibonacci) or T-shirt size
gh_issue: null        # GH-<number> when GitHub Issue is created
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: []      # blocking business IDs
cross_cutting: [INV-SAFE-2, R-FEA-3]
---

# MS2-E3-S1 — Document identity

## Goal
One paragraph: what this story delivers and why it matters.

## Scope
- Bullet list of what's in scope

## Acceptance criteria
- [ ] AC 1 (traceable to feature spec / invariant / NFR)
- [ ] AC 2

## Dependencies
- **Blocks:** MS2-E3-S2, MS2-E3-S3 (what can't start until this is done)
- **Blocked by:** MS2-E2-S1 (what must finish first)

## Context
- Links to ADRs, feature specs, risk register entries, assumptions
```

## 4. GitHub Issue ↔ story file relationship

**Git files are authoritative; GitHub Issues are the tracking mechanism.**

| Concern | Where it lives |
|---|---|
| **Detailed scope** (goal, AC, dependencies, context) | Story file in `doc/planning/milestones/` |
| **Short summary** (1-3 sentences, labels, status) | GitHub Issue |
| **Delivery artifacts** (spec, plan, test-plan) | `doc/changes/` (created during delivery) |
| **Business ID** | Story file frontmatter `id` + GitHub Issue title prefix |
| **workItemRef** | `GH-<number>` (assigned by GitHub when issue is created) — used in branches and change artifacts |

### Why git files are authoritative

1. **Grep-able:** `rg "INV-SAFE-2"` finds every story that touches that invariant.
2. **Diff-able:** scope changes go through PR review.
3. **Permanent:** issues can be closed/archived; git files endure.
4. **AI-agent-friendly:** agents read files more reliably than GitHub API.
5. **Offline:** no API rate limits or connectivity requirements.

### GitHub Issue creation

When PM creates a GitHub Issue for a story:

1. Copy the story's `title` + `Goal` paragraph as the issue body.
2. Title format: `[MS2-E3-S1] Document identity — UUID v7 + front-matter management`
3. Labels: `change`, `MS-0002`, `feature` (or `spike`/`bug`), priority label.
4. Update the story file's `gh_issue` frontmatter to `GH-<number>`.
5. The `workItemRef` (`GH-<number>`) is used for branches (`feat/GH-42/slug`)
   and change artifacts (`chg-GH-42-spec.md`).

## 5. Epic document

Each epic folder contains an `<EpicID>--epic.md` with:

- **Goal:** what the epic achieves as a whole
- **Scope:** stories in the epic (list with IDs)
- **Dependencies:** what epics/stories must complete first
- **Feature spec:** which `doc/spec/features/` spec this epic implements
- **Cross-cutting concerns:** invariants/NFRs served by this epic
- **Success criteria:** how we know the epic is done

## 6. Milestone backlog table

`backlog-MS-<N>.md` is the ranked overview — ordered by delivery priority with
dependencies. It references epic/story files for detail. Status and ordering
are owned by this file; detailed scope is owned by the story files.

## 7. Bugs

Bugs use the `MS<N>-B<NNN>` format (no epic). They live in
`MS-<N>/bugs/<BugID>--<slug>.md`. Bug files use the same frontmatter template
as stories with `type: bug`.

Bug numbers are sequential within the milestone, starting from B1. They are
**not** tied to epics (a bug may affect any epic's output).
