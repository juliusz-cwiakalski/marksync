---
id: MS2-E3-S3
title: "Markdown pipeline"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: GH-20
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0005]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [MS2-E2-S1] }
cross_cutting: [R-FEA-9]
---

# MS2-E3-S3 — Markdown pipeline

## Goal
remark/HAST Markdown → Confluence Storage Format for canonical GFM subset.

## Scope
- remark/HAST AST pipeline\n- Storage Format output (ADR-0005)\n- Canonical GFM subset conversion\n- Unsupported-node classification (never silently discard)

## Acceptance criteria
- [ ] Conversion fidelity: 100% of canonical GFM fixtures\n- [ ] Unsupported nodes classified, not silently dropped

## Dependencies
- **Blocks:** MS2-E3-S6
- **Blocked by:** MS2-E2-S1

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0005
- Cross-cutting: R-FEA-9
