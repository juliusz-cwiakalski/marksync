---
id: MS2-E3-S2
title: "State manager (lock + cache)"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E3-S1] }
cross_cutting: [R-FEA-3]
---

# MS2-E3-S2 — State manager (lock + cache)

## Goal
Committed (versioned) lock file + disposable .marksync/cache/ + content-property cross-check.

## Scope
- Lock file read/write/merge (versioned, committed)\n- Disposable cache directory (.marksync/cache/)\n- Content-property cross-check (marksync.metadata)

## Acceptance criteria
- [ ] Lock file is committed and versioned\n- [ ] Cache is disposable (delete → no data loss)\n- [ ] Content-property cross-check works

## Dependencies
- **Blocks:** MS2-E3-S5, MS2-E3-S6
- **Blocked by:** MS2-E3-S1

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0006
- Cross-cutting: R-FEA-3
