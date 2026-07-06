---
id: MS2-E2-S2
title: "config-system"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: null
gh_issue: GH-15
feature_spec: doc/spec/features/feature-cli.md
decisions: []
dependencies: { blocks: [MS2-E3], blocked_by: [MS2-E2-S1] }
cross_cutting: []
---

# MS2-E2-S2 — config-system

## Goal
Repository-owned YAML config: file selection, hierarchy mirroring, document overrides, JSON Schema validation.

## Scope
- marksync.yml schema (file selection, space, parent page)\n- Document-level overrides via front-matter\n- JSON Schema validation on load\n- Hierarchy mirroring config

## Acceptance criteria
- [ ] Config loads and validates\n- [ ] Invalid config → clear error with AI-readable message\n- [ ] Hierarchy mirrors repo structure

## Dependencies
- **Blocks:** MS2-E3
- **Blocked by:** MS2-E2-S1

## Context
- Feature spec: `doc/spec/features/feature-cli.md`
- Decisions: 
- Cross-cutting: 
