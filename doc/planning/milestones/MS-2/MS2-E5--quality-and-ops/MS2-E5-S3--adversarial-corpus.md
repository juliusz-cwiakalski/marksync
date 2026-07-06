---
id: MS2-E5-S3
title: "Adversarial public corpus"
status: todo
type: story
priority: medium
epic: MS2-E5
milestone: MS-0002
estimate: null
gh_issue: GH-31
feature_spec: 
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E3-S3, MS2-E3-S5] }
cross_cutting: [A-VAL-2, R-FEA-9]
---

# MS2-E5-S3 — Adversarial public corpus

## Goal
Sanitized design-partner pages as adversarial test corpus: macros, nested tables, app content the canonical subset excludes.

## Scope
- Collect + sanitize design-partner pages\n- Test drift detection against real content\n- Test fidelity against unsupported nodes\n- Publish classification of unsupported nodes

## Acceptance criteria
- [ ] Corpus covers macros, nested tables, app content\n- [ ] Unsupported nodes classified (never silently discarded)

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E3-S3, MS2-E3-S5

## Context
- Feature spec: ``
- Decisions: 
- Cross-cutting: A-VAL-2, R-FEA-9
