---
id: MS2-E2-S1
title: "scaffolding"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: null
gh_issue: GH-14
feature_spec: 
decisions: [TDR-0005, TDR-0006, TDR-0008]
dependencies: { blocks: [MS2-E2-S2, MS2-E2-S3, MS2-E2-S4, MS2-E3], blocked_by: [] }
cross_cutting: []
---

# MS2-E2-S1 — scaffolding

## Goal
Create the project scaffolding: package.json, tsconfig, Biome, dependency-cruiser, commitlint+husky, CI unguard removal.

## Scope
- package.json with bunfig.toml, ESM exports\n- tsconfig (verbatimModuleSyntax, isolatedModules, types: ["bun"])\n- Biome config (TDR-0005)\n- dependency-cruiser rules (TDR-0006)\n- commitlint + husky (TDR-0008)\n- Remove CI continue-on-error guards (OPEN-Q9)

## Acceptance criteria
- [ ] bun run check passes (lint + typecheck + test + dep-cruiser)\n- [ ] commitlint hook fires on bad commit message\n- [ ] CI guards removed; CI green

## Dependencies
- **Blocks:** MS2-E2-S2, MS2-E2-S3, MS2-E2-S4, MS2-E3
- **Blocked by:** 

## Context
- Feature spec: ``
- Decisions: TDR-0005, TDR-0006, TDR-0008
- Cross-cutting: 
