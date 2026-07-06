---
id: MS2-E5-S4
title: "Cross-platform binary builds"
status: todo
type: story
priority: medium
epic: MS2-E5
milestone: MS-0002
estimate: null
gh_issue: GH-32
feature_spec: 
decisions: [ADR-0001]
dependencies: { blocks: [], blocked_by: [MS2-E1-S3] }
cross_cutting: [A-FEA-2, A-FEA-10]
---

# MS2-E5-S4 — Cross-platform binary builds

## Goal
Bun --compile for Linux + Windows (amd64/arm64); clean-OS smoke; signing spike. macOS deferred to MS-0003.

## Scope
- Cross-compile for linux-x64, linux-arm64, win-x64\n- Clean-OS install smoke (Docker)\n- Binary size + cold-start measurement\n- Signing/notarization spike

## Acceptance criteria
- [ ] Binary ≤ 90 MB\n- [ ] Cold-start ≤ 2 s\n- [ ] Runs on clean Linux + Windows\n- [ ] Signing story documented

## Dependencies
- **Blocks:** 
- **Blocked by:** MS2-E1-S3

## Context
- Feature spec: ``
- Decisions: ADR-0001
- Cross-cutting: A-FEA-2, A-FEA-10
