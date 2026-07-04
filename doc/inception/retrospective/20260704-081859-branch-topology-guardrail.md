---
status: Draft
created: 2026-07-04T08:18:59Z
phase_scope: phase-1
topic: Branch topology guardrail
outcome: improve
---

# Retrospective — Branch topology guardrail

## What happened

During Phase 1, a commit briefly landed on local `main` instead of the intended
`inception/phase-1` branch. It was recovered safely:

1. created the phase branch at the accidental commit;
2. reset local `main` back to `origin/main`;
3. pushed only the phase branch;
4. did not push `main`.

## What went well

- The mistake was detected before any push to `main`.
- Recovery preserved the commit and restored clean branch topology.
- The incident was documented transparently in PR #2.

## Improvement / pattern to repeat

Before every phase commit and push, run:

```bash
git branch --show-current
```

The branch must match `inception/phase-N`. If not, stop and repair before
committing.

## Future guardrail

PR creation should happen only after verifying:

- local `main` equals `origin/main`;
- phase branch is one or more commits ahead of `origin/main`;
- no intended phase artifacts are left untracked.
