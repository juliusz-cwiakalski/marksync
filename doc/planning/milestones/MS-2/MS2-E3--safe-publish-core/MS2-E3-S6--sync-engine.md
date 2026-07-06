---
id: MS2-E3-S6
title: "Sync engine"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: GH-23
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006, ADR-0010, ADR-0011]
dependencies: { blocks: [], blocked_by: [MS2-E1-S2, MS2-E3-S1, MS2-E3-S2, MS2-E3-S3, MS2-E3-S4, MS2-E3-S5] }
cross_cutting: [INV-SAFE-1, INV-SAFE-3]
---

# MS2-E3-S6 — Sync engine

## Goal
Plan → apply orchestration: create/update/no-op/move per document; per-document isolation; journal + replay; squash provenance.

## Scope
- Plan computation (dry-run diff)\n- Apply: create/update/no-op/move per document\n- Per-document isolation (failure on one doesn't block others)\n- Journal-based apply + replay\n- Squash provenance via version.message (ADR-0010)

## Acceptance criteria
- [ ] INV-SAFE-1: no silent overwrite\n- [ ] INV-SAFE-3: overlapping plans, older doesn't overwrite\n- [ ] Semantic idempotency: 2nd unchanged push writes 0\n- [ ] Partial apply recoverable via journal

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E1-S2, MS2-E3-S1, MS2-E3-S2, MS2-E3-S3, MS2-E3-S4, MS2-E3-S5

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0006, ADR-0010, ADR-0011
- Cross-cutting: INV-SAFE-1, INV-SAFE-3
