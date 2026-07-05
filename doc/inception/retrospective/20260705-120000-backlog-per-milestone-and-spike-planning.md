# Retrospective: Backlog-per-milestone and spike-planning from inception

**Date:** 2026-07-05
**Trigger:** Owner PR #4 comment on `architecture-overview.md` line 254:
> "for UNCERT-1, UNCERT-2 and UNCERT-3 we should plan spikes early in the backlog to verify. maybe we should have some sort of backlog ideas/candidates that would be populated during the inception process (or maybe we just add those kind of things into the roadmap into the relevant milestone scope). probably we should also build/manage single backlog per roadmap milestone. backlog would be detailed list of epics broken down into stories (epic and story is an issue in issue tracker). create inception retro item about it."

## Observation

During Phase 3 architecture review, the owner noticed that uncertainty flags
(UNCERT-1 Mermaid, UNCERT-2 Bun signing, UNCERT-3 version.message length) need
to become concrete spike work items early in `MS-0002`, but there is no
mechanism to carry inception-discovered work items into the milestone backlogs.

## Lesson

Inception produces actionable work items (spikes, validation tasks, risk-mitigation
tickets) that need a home. Today these live scattered across:
- Architecture overview uncertainty flags
- Risk register mitigations
- ADR implementation plans
- Open-questions files

But there is no single **milestone backlog** that aggregates these into epics
and stories ready for the issue tracker.

## Action items

1. **Per-milestone backlog.** Each roadmap milestone (`MS-0002`, `MS-0003`, …)
   should have a backlog — a detailed list of epics broken down into stories,
   where each epic and story is an issue in the tracker. The backlog is the
   detailed execution plan for that milestone.

2. **Inception → backlog graduation.** During inception, uncertainty flags,
   spike requirements, and risk mitigations should be captured as **backlog
   candidates** and then graduated into the relevant milestone backlog when the
   milestone is activated.

3. **Spike-first planning.** Uncertainty flags (UNCERT-1/2/3) should appear as
   the **first items** in the `MS-0002` backlog, since they are gating decisions
   that affect implementation approach.

4. **Phase 5 (ADOS framework integration).** The `pm-instructions.md` should
   document the backlog-per-milestone convention and how inception graduates
   items into milestone backlogs.

## Process change

This should be reflected in:
- `doc/planning/backlog.md` (or per-milestone backlog files) — created in Phase 5
- `doc/overview/02-roadmap.md` — reference milestone backlogs
- `.ai/agent/pm-instructions.md` — backlog management convention
