---
status: Accepted
created: 2026-07-06T17:00:00
phase_scope: 5
topic: ADOS installer overwrites project-customized .ai/rules/README.md
outcome: propose-ados-framework-improvement
---

# Retrospective: Installer should preserve .ai/rules/README.md after first copy

## What happened

During Phase 4, MarkSync customized `.ai/rules/README.md` to route to
project-specific rules (`typescript.md`, `testing-strategy.md`). The file was
written as a current-state routing table for AI agents.

On a subsequent `~/.ados/repo/scripts/install.sh --local` run (to pick up ADOS
updates), the installer **overwrote** `.ai/rules/README.md` with the generic
ADOS version, destroying the project-specific routing entries.

## Root cause

In `scripts/install.sh`, `.ai/rules/README.md` is listed in
`ADOS_UPDATABLE_FILES` (line 104), which means it **always tracks upstream** and
is force-overwritten on every install. This is correct for truly shared files
(`doc/documentation-handbook.md`, `doc/decisions/README.md`), but wrong for a
file that projects are expected to customize.

The `ADOS_PROJECT_FILES` array (line 128) — which uses "skip if exists, preserve
local edits" semantics — is currently **empty**. `.ai/rules/README.md` belongs
there instead.

## Improvement / pattern to propose

**Move `.ai/rules/README.md` from `ADOS_UPDATABLE_FILES` to
`ADOS_PROJECT_FILES`.**

Semantics:
- First install (`--local` on a fresh project): copy the generic ADOS routing
  table as a starting point.
- Subsequent installs: **skip if the file exists** (preserve local edits),
  unless `--force` is explicitly passed.
- `--interactive` mode: show the diff and let the user choose.

This matches the documented behavior in
`doc/guides/onboarding-existing-project.md` §Artifact Checklist, which lists
`.ai/rules/README.md` as "Auto-installed, **customize**" — implying the user
owns it after customization.

## Why it matters

The `.ai/rules/README.md` file is the **routing table** that tells AI agents
which rule files to load for a given task. If a project adds `typescript.md`,
`testing-strategy.md`, `rust.md`, etc., those entries must survive ADOS updates.
Silent overwrite is data loss that the user discovers only when agents stop
loading the right rules.

## Caution

The ADOS repo's own `.ai/rules/README.md` (with `bash.md` + `installer.md`) is
the upstream source. Moving it to `ADOS_PROJECT_FILES` means ADOS updates to the
generic template won't propagate automatically — but that's the intended
trade-off: project ownership wins over upstream freshness for this file.

**Filed as:** ADOS framework improvement proposal (this retrospective serves as
the traceability record; file an issue/PR in the `agentic-delivery-os` repo).
