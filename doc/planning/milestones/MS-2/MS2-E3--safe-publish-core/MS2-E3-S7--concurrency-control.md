---
id: MS2-E3-S7
title: "Concurrency control"
status: todo
type: story
priority: high
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [], blocked_by: [MS2-E3-S4] }
cross_cutting: [INV-SAFE-3, R-FEA-7]
---

# MS2-E3-S7 — Concurrency control

## Goal
Decentralized optimistic concurrency: Confluence 409 + operation-ID dedup + stale-plan expiry + CI concurrency-group templates.

## Scope
- 409 on stale version.number handling\n- Operation-ID deduplication\n- Stale-plan expiry\n- CI concurrency-group workflow templates

## Acceptance criteria
- [ ] INV-SAFE-3: overlapping CI plans, older must not overwrite\n- [ ] Stale plan detected and expired

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E3-S4

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0006
- Cross-cutting: INV-SAFE-3, R-FEA-7
