---
id: MS2-E1-S2
title: "version-message-limit"
status: todo
type: spike
priority: high
epic: MS2-E1
milestone: MS-0002
estimate: null
gh_issue: GH-12
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0010]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [] }
cross_cutting: []
---

# MS2-E1-S2 — version-message-limit

## Goal
Determine the Confluence version.message length limit via live API testing.

## Scope
- Post increasingly long version.message strings to the test space\n- Document the hard limit or behavior (truncation, error)\n- Confirm ADR-0010 provenance format fits

## Acceptance criteria
- [ ] Limit documented (or behavior characterized)\n- [ ] ADR-0010 provenance format confirmed viable

## Dependencies
- **Blocks:** MS2-E3-S6
- **Blocked by:** 

## Context
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- Decisions: ADR-0010
- Cross-cutting: 
