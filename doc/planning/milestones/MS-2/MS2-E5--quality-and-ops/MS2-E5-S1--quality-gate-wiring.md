---
id: MS2-E5-S1
title: "Quality gate wiring"
status: todo
type: story
priority: high
epic: MS2-E5
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: 
decisions: [TDR-0004, TDR-0007]
dependencies: { blocks: [], blocked_by: [MS2-E2-S1, MS2-E3-S6] }
cross_cutting: [R-FEA-5]
---

# MS2-E5-S1 — Quality gate wiring

## Goal
Wire all 6 test tiers: unit + integration (mocked Confluence) + golden fixtures + Mermaid-DOM + Gherkin BDD + live-sandbox E2E.

## Scope
- Unit tests (bun:test)\n- Integration tests (mocked ConfluenceClient)\n- Golden fixtures (Storage Format output)\n- Mermaid-DOM tier (happy-dom)\n- Gherkin BDD (@cucumber/cucumber, lifecycle invariants)\n- Live-sandbox E2E (dedicated test space)

## Acceptance criteria
- [ ] All 6 tiers wired and passing\n- [ ] BDD covers lifecycle invariants (idempotency, drift)\n- [ ] Golden fixtures committed

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E2-S1, MS2-E3-S6

## Context
- Feature spec: ``
- Decisions: TDR-0004, TDR-0007
- Cross-cutting: R-FEA-5
