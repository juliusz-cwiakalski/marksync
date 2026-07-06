---
id: MS2-E3-S5
title: "Drift classifier"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: GH-22
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [MS2-E3-S1, MS2-E3-S2, MS2-E3-S4] }
cross_cutting: [INV-SAFE-1]
---

# MS2-E3-S5 — Drift classifier

## Goal
Canonical semantic hashing + 5-state drift classification; block unsafe overwrites by default.

## Scope
- Canonical hash (raw + canonical + normalized + attachment)\n- 5-state: NO_CHANGE / REMOTE_BEHIND / REMOTE_AHEAD / DIVERGED / REMOTE_MISSING\n- Unsafe overwrite blocked by default\n- Remotely-deleted managed page never silently re-created

## Acceptance criteria
- [ ] INV-SAFE-1: no silent overwrite\n- [ ] 5 states correctly detected\n- [ ] False-positive rate < 5%

## Dependencies
- **Blocks:** MS2-E3-S6
- **Blocked by:** MS2-E3-S1, MS2-E3-S2, MS2-E3-S4

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0006
- Cross-cutting: INV-SAFE-1
