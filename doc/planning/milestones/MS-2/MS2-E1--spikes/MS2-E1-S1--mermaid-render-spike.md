---
id: MS2-E1-S1
title: "mermaid-render-spike"
status: todo
type: spike
priority: critical
epic: MS2-E1
milestone: MS-0002
estimate: null
gh_issue: GH-11
feature_spec: doc/spec/features/feature-mermaid-rendering.md
decisions: [ADR-0002]
dependencies: { blocks: [MS2-E4-S1], blocked_by: [] }
cross_cutting: [R-FEA-1, A-FEA-1]
---

# MS2-E1-S1 — mermaid-render-spike

## Goal
Prove the official Mermaid library renders deterministically in-process (happy-dom + Bun) without Chromium.

## Scope
- Load official mermaid library in happy-dom\n- Render representative diagrams (flowchart, sequence, class)\n- Verify deterministicIds produces byte-stable SVG\n- Verify securityLevel: strict is enforced

## Acceptance criteria
- [ ] Same input → byte-identical normalized SVG across runs\n- [ ] securityLevel: strict active\n- [ ] No Chromium dependency

## Dependencies
- **Blocks:** MS2-E4-S1
- **Blocked by:** 

## Context
- Feature spec: `doc/spec/features/feature-mermaid-rendering.md`
- Decisions: ADR-0002
- Cross-cutting: R-FEA-1, A-FEA-1
