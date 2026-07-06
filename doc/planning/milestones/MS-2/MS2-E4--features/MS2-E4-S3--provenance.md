---
id: MS2-E4-S3
title: "Provenance"
status: todo
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: null
gh_issue: GH-27
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0010]
dependencies: { blocks: [], blocked_by: [MS2-E3-S6] }
cross_cutting: []
---

# MS2-E4-S3 — Provenance

## Goal
Visible provenance panel/footer (source path + Git revision + last-sync) + machine content-property metadata.

## Scope
- Visible panel/footer on published pages\n- Content-property metadata (marksync.metadata)\n- Source path + Git revision + last-sync timestamp

## Acceptance criteria
- [ ] 100% managed pages have valid provenance\n- [ ] Panel readable by non-technical stakeholders (Persona 5)

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E3-S6

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0010
- Cross-cutting: 
