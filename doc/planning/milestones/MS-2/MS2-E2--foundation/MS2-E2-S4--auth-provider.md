---
id: MS2-E2-S4
title: "auth-provider"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: null
gh_issue: GH-17
feature_spec: doc/spec/features/feature-cli.md
decisions: []
dependencies: { blocks: [MS2-E3-S4], blocked_by: [MS2-E2-S1] }
cross_cutting: [R-SEC-1]
---

# MS2-E2-S4 — auth-provider

## Goal
Auth provider: API-token (email + token) from env vars. keytar deferred (OPEN-Q8).

## Scope
- Resolve MARKSYNC_CONFLUENCE_TOKEN, _EMAIL, _BASE_URL\n- Validate credentials against Confluence\n- Clear error on missing/invalid credentials

## Acceptance criteria
- [ ] Token resolves from env\n- [ ] Invalid credentials → clear error + exit code\n- [ ] No token in logs/output

## Dependencies
- **Blocks:** MS2-E3-S4
- **Blocked by:** MS2-E2-S1

## Context
- Feature spec: `doc/spec/features/feature-cli.md`
- Decisions: 
- Cross-cutting: R-SEC-1
