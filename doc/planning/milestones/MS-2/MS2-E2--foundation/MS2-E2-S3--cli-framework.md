---
id: MS2-E2-S3
title: "cli-framework"
status: todo
type: story
priority: critical
epic: MS2-E2
milestone: MS-0002
estimate: null
gh_issue: null
feature_spec: doc/spec/features/feature-cli.md
decisions: [ADR-0011, TDR-0002]
dependencies: { blocks: [MS2-E3, MS2-E5-S2], blocked_by: [MS2-E2-S1] }
cross_cutting: [INV-SEC-1, NFR-A11Y-1]
---

# MS2-E2-S3 — cli-framework

## Goal
Cliffy CLI framework + CommandResult<T> output + centralized redaction layer.

## Scope
- Cliffy command structure (init, plan, sync, doctor, repair)\n- CommandResult<T> type + JSON/NDJSON renderers\n- Centralized redaction layer (no secret in any output)\n- Exit codes; color auto-detect (NO_COLOR)

## Acceptance criteria
- [ ] CommandResult<T> renders as valid JSON\n- [ ] No credential in any output path (INV-SEC-1)\n- [ ] Color disabled when NO_COLOR or non-TTY

## Dependencies
- **Blocks:** MS2-E3, MS2-E5-S2
- **Blocked by:** MS2-E2-S1

## Context
- Feature spec: `doc/spec/features/feature-cli.md`
- Decisions: ADR-0011, TDR-0002
- Cross-cutting: INV-SEC-1, NFR-A11Y-1
