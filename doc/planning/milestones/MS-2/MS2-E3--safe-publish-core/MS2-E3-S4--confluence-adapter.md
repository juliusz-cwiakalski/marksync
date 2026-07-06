---
id: MS2-E3-S4
title: "Confluence adapter"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: null
gh_issue: GH-21
feature_spec: doc/spec/features/feature-confluence-adapter.md
decisions: [ADR-0005, ADR-0006]
dependencies: { blocks: [MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E2-S4] }
cross_cutting: [R-FEA-6, R-FEA-10]
---

# MS2-E3-S4 — Confluence adapter

## Goal
TargetSystem port impl: v2 page CRUD + properties; v1 attachments/labels/search/restrictions; 409 concurrency; 403 warn+skip.

## Scope
- v2 REST: page create/read/update/move + content properties\n- v1 REST: attachments/labels/search/restrictions\n- 409 optimistic concurrency parsing\n- 403 warn+skip (not delete+recreate)\n- Rate-limit backoff

## Acceptance criteria
- [ ] No Confluence types leak into domain (dependency-cruiser enforced)\n- [ ] 409 correctly parsed\n- [ ] 403 → warn+skip

## Dependencies
- **Blocks:** MS2-E3-S5, MS2-E3-S6
- **Blocked by:** MS2-E2-S4

## Context
- Feature spec: `doc/spec/features/feature-confluence-adapter.md`
- Decisions: ADR-0005, ADR-0006
- Cross-cutting: R-FEA-6, R-FEA-10
