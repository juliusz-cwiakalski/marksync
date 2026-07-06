---
id: MS2-E4-S1
title: "Mermaid rendering"
status: todo
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: null
gh_issue: GH-25
feature_spec: doc/spec/features/feature-mermaid-rendering.md
decisions: [ADR-0002]
dependencies: { blocks: [], blocked_by: [MS2-E1-S1, MS2-E3-S6] }
cross_cutting: [R-FEA-1, NFR-SEC-5]
---

# MS2-E4-S1 — Mermaid rendering

## Goal
In-process Mermaid rendering: securityLevel strict, deterministicIds, SVG sanitization, content-hashed attachments, fallback ladder.

## Scope
- Load official mermaid in happy-dom\n- securityLevel: strict; htmlLabels: false\n- deterministicIds: true\n- SVG sanitization\n- Content-hashed attachments (reuse when unchanged)\n- Fallback: code policy on render failure

## Acceptance criteria
- [ ] Deterministic output (byte-stable normalized SVG)\n- [ ] securityLevel strict; SVG sanitized\n- [ ] Adversarial fixtures pass (NFR-SEC-5)\n- [ ] Unchanged diagram → no re-upload

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E1-S1, MS2-E3-S6

## Context
- Feature spec: `doc/spec/features/feature-mermaid-rendering.md`
- Decisions: ADR-0002
- Cross-cutting: R-FEA-1, NFR-SEC-5
