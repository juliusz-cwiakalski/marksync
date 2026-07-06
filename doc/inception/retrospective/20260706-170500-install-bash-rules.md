---
status: Accepted
created: 2026-07-06T17:05:00
phase_scope: 5
topic: ADOS installer should ship .ai/rules/bash.md to all projects
outcome: propose-ados-framework-improvement
---

# Retrospective: Ship .ai/rules/bash.md as an installed rule

## What happened

The ADOS repo ships `.ai/rules/bash.md` — a bash coding-rules file. It is
present in `~/.ados/repo/.ai/rules/` but is **not in any install list** in
`scripts/install.sh`. Projects that use bash scripts (`scripts/*.sh`,
`tools/*`) get no bash coding rules unless they manually copy the file.

MarkSync has `scripts/` (repo-internal automation) and `tools/` (PATH-able CLI
utilities) and would benefit from the bash rules, but they were not installed.

## Root cause

`ADOS_UPDATABLE_FILES` lists only `.ai/rules/README.md`. There is no mechanism
to install additional rule files from `.ai/rules/` — the installer treats
`README.md` as special-cased, and everything else in `.ai/rules/` as
ADOS-repo-internal.

## Improvement / pattern to propose

**Add `.ai/rules/bash.md` to `ADOS_UPDATABLE_FILES`.**

Rationale:
- Bash is a cross-cutting concern — nearly every project has `scripts/` or
  CI workflows that use bash.
- `bash.md` is a **generic** rule (shell scripting best practices), not
  ADOS-specific. It benefits all projects equally.
- It should **track upstream** (unlike `README.md`, which is project-customized)
  because bash best practices evolve and the rule should stay current.
- The red-team-bash-dev agent exists specifically to review bash scripts; having
  the rule installed in every project gives that agent something to enforce.

### Installer change

```bash
readonly ADOS_UPDATABLE_FILES=(
  "doc/documentation-handbook.md"
  "doc/00-index.md"
  "doc/decisions/README.md"
  ".ai/rules/README.md"
  ".ai/rules/bash.md"           # NEW — generic bash coding rules
)
```

### Consideration: other rule files

The ADOS repo also has `.ai/rules/installer.md` (ADOS-specific installer rules)
and `.ai/rules/testing-strategy.md` (ADOS-repo-specific testing). These should
**not** be installed — they are specific to the ADOS repo itself, not generic
rules for downstream projects. Only `bash.md` qualifies as universally useful.

## Why it matters

Without bash rules installed, the `red-team-bash-dev` agent and `@reviewer`
agent have no project-local bash standard to enforce. Projects either reinvent
bash conventions or skip bash review entirely. Shipping `bash.md` gives every
project a battle-tested baseline from day one.

**Filed as:** ADOS framework improvement proposal (file an issue/PR in the
`agentic-delivery-os` repo).
