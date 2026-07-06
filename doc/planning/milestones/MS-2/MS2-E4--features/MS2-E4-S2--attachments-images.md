---
id: MS2-E4-S2
title: "Attachments and images"
status: todo
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E3-S4, MS2-E3-S6] }
cross_cutting: []
---

# MS2-E4-S2 — Attachments and images

## Goal
Local images/attachments: path-safe, content-hashed, reused when unchanged; v1 attachment API.

## Scope
- Image discovery from Markdown AST\n- Content-hash for attachment identity\n- v1 attachment upload/update/download\n- Reuse unchanged attachments

## Acceptance criteria
- [ ] Unchanged image → no re-upload\n- [ ] Path-safe (no path traversal)\n- [ ] All image formats tested

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E3-S4, MS2-E3-S6

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: 
- Cross-cutting: 
