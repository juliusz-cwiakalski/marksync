---
status: Accepted
created: 2026-07-06T18:10:00
phase_scope: 5
topic: Documentation-profile write roots must cover all agent write paths
outcome: propose-ados-framework-improvement
---

# Retrospective: Over-restrictive allowed_write_roots — a near-miss for autonomous delivery

## What happened

The initial `doc/documentation-profile.md` listed only 4 allowed write roots
(`doc/changes`, `doc/spec`, `doc/decisions`, `doc/meetings`) — copied from the
template defaults. The owner caught in PR review that this **blocks ADOS agents
from writing to most of the documentation tree** that they legitimately need.

A scan of ADOS agent prompts (`@doc-syncer`, `@pm`, `@spec-writer`, `@reviewer`)
revealed that agents write to at least 16 `doc/` subdirectories:
`changes`, `spec`, `decisions`, `meetings`, `guides`, `overview`, `contracts`,
`domain`, `quality`, `ops`, `diagrams`, `templates`, `tools`, `examples`,
`analytics`, `i18n`, `planning`, `inception`.

The profile was expanded to allow all of these; only `doc/business/` remains
forbidden (business docs disabled in engineering-repo).

## Root cause

The `documentation-profile-template.md` ships with a narrow 4-root example
that reflects the *minimum* set, not the *complete* set. A project following
the template literally would silently break `@doc-syncer` (which creates
guides, updates overview, writes to quality/ops/contracts/domain) and other
agents.

## Anti-pattern

**A write-safety contract that is more restrictive than the actual delivery
process creates a silent contradiction.** Agents either ignore the profile
(undermining its purpose) or respect it and fail to write required docs (leaving
the knowledge base incomplete). In autonomous delivery mode (`@ceo` reviewing
PRs), this could cause cascading failures: doc-syncer can't write guides → spec
reconciliation fails → PR is incomplete → CEO agent rejects or approves broken
work.

## Improvement / pattern to propose

1. **Template fix:** the `documentation-profile-template.md` should list ALL
   standard `doc/` subdirectories from the documentation handbook §3 as
   allowed for `engineering-repo` — not just 4. The template should make clear
   that `forbidden_write_roots` is the safety mechanism, and
   `allowed_write_roots` should be comprehensive for the profile type.

2. **Validation:** add a CI check that cross-references agent write paths
   against `allowed_write_roots` and warns on gaps. This would have caught the
   issue automatically.

3. **Principle:** `allowed_write_roots` should be **comprehensive by default**
   (everything agents need), with `forbidden_write_roots` as the **narrow
   exclusion list** (business docs when disabled). The inverse — a narrow allow
   list — is fragile because agent capabilities evolve.

## Why it matters

In autonomous delivery mode, a misconfigured profile is not a human-noticeable
inconvenience — it is a **silent capability removal** that degrades delivery
quality without error messages. The profile contract must be correct by
construction, not corrected after the fact.

**Filed as:** ADOS framework improvement — fix the template defaults + add a
validation check.
