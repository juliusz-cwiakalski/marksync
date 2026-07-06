---
id: MS2-E4-S4
title: "Minimal repair"
status: todo
type: story
priority: medium
epic: MS2-E4
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E3-S2, MS2-E3-S6] }
cross_cutting: [R-USA-3]
---

# MS2-E4-S4 — Minimal repair

## Goal
repair-state for stale locks + interrupted-apply journal replay (premortem §14 beachhead requirement).

## Scope
- repair-state command\n- Stale-lock recovery\n- Interrupted-apply journal replay\n- Clear diagnostics

## Acceptance criteria
- [ ] Stale lock recoverable without data loss\n- [ ] Interrupted apply replayable\n- [ ] Clear AI-readable diagnostics

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E3-S2, MS2-E3-S6

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: 
- Cross-cutting: R-USA-3
