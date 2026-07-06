---
status: Accepted
created: 2026-07-06T18:15:00
phase_scope: 5
topic: World-class project README.md as a Phase 5 deliverable
outcome: propose-ados-framework-improvement
---

# Retrospective: Project README.md creation during inception

## What happened

During Phase 5 PR review, the owner identified that the project had no
`README.md` at the repo root — the most visible file for any visitor (human or
AI agent). The owner treats a main project README.md as an ADOS requirement,
and Phase 5 (ADOS framework integration) is the right phase to create it
because by then the full project context (vision, roadmap, architecture, stack,
conventions) is available.

A README.md was created for MarkSync, and the owner requested ADOS-level
guidelines so agents can reliably create world-class README.md files in any
project.

## What a world-class project README contains

Based on the MarkSync README created in this phase:

1. **Title + one-line description** — what the project is, in one sentence.
2. **Badges** — CI status, license (auto-generated from GitHub Actions + shields.io).
3. **What it does** — 3–5 bullet points of key capabilities.
4. **Why** — the problem being solved (1 short paragraph).
5. **Current status** — honestly state where the project is (e.g., pre-implementation).
6. **How it works** — a simple ASCII/Mermaid diagram + 1 paragraph.
7. **Tech stack** — table with choices and links to decision records.
8. **Getting started** — link to dev setup (or note if not yet installable).
9. **Documentation** — links to the most important docs (not an exhaustive list — point to `doc/00-index.md`).
10. **Contributing** — link to the delivery process, issue tracker, decision records.
11. **License** — name + link.

## Improvement / pattern to propose

**Add a README.md template and creation guidance to ADOS Phase 5.**

- **Template:** `doc/templates/readme-template.md` — structured skeleton with
  the 11 sections above, placeholders, and guidance comments.
- **Phase 5 activity:** "Create `README.md` at repo root using
  `doc/templates/readme-template.md`" — after the full project context exists
  (vision, architecture, stack, conventions).
- **Agent guidance:** `@doc-syncer` or `@bootstrapper` should keep the README
  in sync with major changes (new milestones, stack changes, status changes).

## Why it matters

The README is the first thing a visitor, contributor, or AI agent sees. A
missing or low-quality README signals an unfinished project. Making README
creation a Phase 5 deliverable ensures every ADOS-incepted project has a
world-class README from day one — and the template ensures consistency across
projects.

**Filed as:** ADOS framework improvement — add README template + Phase 5
activity + doc-syncer sync responsibility.
