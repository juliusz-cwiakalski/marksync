---
id: MS2-E3-S1
title: "Document identity (UUID v7)"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S2, MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E2-S1, MS2-E2-S2] }
cross_cutting: [INV-SAFE-2]
---

# MS2-E3-S1 — Document identity (UUID v7)

## Goal
Immutable MarkSync document UUID v7 stored in source front-matter; duplicate-UUID fatal before any write.

## Scope
- UUID v7 generation and front-matter injection\n- Duplicate-UUID detection (fatal before writes)\n- Confluence page ID = remote identity binding

## Acceptance criteria
- [ ] INV-SAFE-2: duplicate UUID is fatal before any write\n- [ ] UUID survives clones/branches/CI

## Dependencies
- **Blocks:** MS2-E3-S2, MS2-E3-S5, MS2-E3-S6
- **Blocked by:** MS2-E2-S1, MS2-E2-S2

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0006
- Cross-cutting: INV-SAFE-2
