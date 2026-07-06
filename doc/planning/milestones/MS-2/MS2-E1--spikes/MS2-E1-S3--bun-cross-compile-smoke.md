---
id: MS2-E1-S3
title: "bun-cross-compile-smoke"
status: todo
type: spike
priority: high
epic: MS2-E1
milestone: MS-0002
estimate: null
gh_issue: GH-13
feature_spec: 
decisions: [ADR-0001]
dependencies: { blocks: [MS2-E5-S4], blocked_by: [] }
cross_cutting: [A-FEA-2, A-FEA-10]
---

# MS2-E1-S3 — bun-cross-compile-smoke

## Goal
Verify Bun --compile produces working single-binary on clean Linux + Windows within budget.

## Scope
- Cross-compile minimal CLI for linux-x64 and win-x64\n- Install on clean OS (Docker)\n- Measure binary size and cold-start\n- Document signing story

## Acceptance criteria
- [ ] Binary ≤ 90 MB\n- [ ] Cold-start ≤ 2 s\n- [ ] Runs on clean Linux + Windows

## Dependencies
- **Blocks:** MS2-E5-S4
- **Blocked by:** 

## Context
- Feature spec: ``
- Decisions: ADR-0001
- Cross-cutting: A-FEA-2, A-FEA-10
