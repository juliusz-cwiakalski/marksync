---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: RETRO-20260705-150000-phase-4-unknown-unknowns-capture
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: current-truth
summary: "Phase 4 lesson — the unknown-unknowns anti-sycophancy technique uncovered accessibility, performance, provenance, and commit-enforcement gaps that became tracked open questions."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Retrospective: Phase 4 unknown-unknowns capture

**Phase:** 4 (Domain, conventions & quality baseline)

**Date:** 2026-07-05

## Context

Phase 4 uses the "unknown-unknowns" anti-sycophancy technique: _"What inception
artifacts does this project need that we haven't produced? What are we
missing?"_

## What happened

The initial draft of Phase 4 artifacts covered the explicit checklist from the
inception guide: glossary, ubiquitous language, testing strategy, conventions,
CI baseline, dev environment, .env.example, security baseline. The red-team
review then applied the unknown-unknowns lens and uncovered five gaps that the
checklist didn't surface:

1. **Accessibility baseline** (NFR-A11Y-2/3) — no implementation guidance for
   plain-log/screen-reader mode or the provenance panel design.
2. **Performance measurement** (NFR-PERF-1/2/5) — soft targets with no
   measurement harness or regression detection plan.
3. **Provenance spike tracking** (UNCERT-3) — the `version.message` length
   spike is referenced in multiple ADRs/NFRs but not tracked as a backlog item.
4. **Commit enforcement** — Conventional Commits are documented but unenforced.
5. **Keytar spike tracking** — the auth-path spike is referenced in 3 docs but
   not tracked.

## What we learned

1. **The explicit Phase 4 checklist is necessary but not sufficient.** It
   covers the "what to produce" axis thoroughly, but the "what's missing" axis
   (cross-cutting concerns that don't have a dedicated artifact) needs the
   anti-sycophancy prompt to surface.

2. **Open questions as a tracking mechanism works.** Rather than trying to
   solve the unknown-unknowns in Phase 4 (which would scope-creep the phase), we
   converted each to a deferred `[OPEN-Q]` entry with a recommendation and
   owner. This makes the unknowns visible to `MS-0002` planning without blocking
   Phase 4 completion.

3. **Cross-cutting concerns need explicit homes.** Accessibility, performance,
   and provenance are NFRs that cut across features. Without a dedicated
   artifact or a tracked open question, they risk being "forgotten knowns" —
   documented in the NFR register but unowned in the implementation plan.

## Action items

- [x] All five unknown-unknowns captured as OPEN-Q4 through OPEN-Q8 in
      `phase-4-open-questions.md`.
- [x] Each has a recommendation and a deferral target (`MS-0002` start or
      backlog planning).
- [ ] At `MS-0002` backlog planning: convert OPEN-Q4–Q8 to backlog items
      (`SPIKE-N`, `TASK-N`) or explicit closure reasons.

## What we would do differently

- **Run the unknown-unknowns prompt _before_ the red-team review**, not as part
  of it. The prompt is fast and self-contained; running it first would have
  surfaced the gaps in the initial draft, reducing the rework loop.
- **Maintain a "cross-cutting concerns" checklist** alongside the Phase
  artifact checklist. NFRs by definition cut across phases; a grep for
  `NFR-*` IDs that don't have a matching artifact or open question would catch
  unowned concerns systematically.

## See also

- `doc/inception/open-questions/phase-4-open-questions.md` — OPEN-Q4 through
  OPEN-Q8.
- `doc/spec/nonfunctional.md` — NFRs that drove the unknown-unknowns discovery.
- `doc/guides/project-inception.md` Phase 4 — the anti-sycophancy technique.
