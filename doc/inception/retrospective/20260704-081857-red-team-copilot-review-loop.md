---
status: Draft
created: 2026-07-04T08:18:57Z
phase_scope: phases-1-2
topic: Red-team and Copilot review loop
outcome: repeat
---

# Retrospective — Red-team + Copilot review loop

## What happened

Phase 1 and Phase 2 both benefited from an explicit review loop before the
human owner performed final review:

- `red-team-coordinator` reviewed the phase artifacts;
- GitHub Copilot PR review comments were checked and triaged;
- accepted findings were applied in follow-up commits;
- a summary comment was posted back to the PR.

## What went well

- Red-team review found substantive issues that ordinary drafting missed:
  - Phase 1: unmeasurable NSM, visible-provenance ambiguity, existing-corpus adoption gap.
  - Phase 2: headline metric hiding failures, concurrent-CI stale-base overwrite, identity/lock under-specification.
- Copilot found small but real hygiene issues (`<10 min` Markdown rendering,
  ADR reference consistency, OAuth wording).
- Posting a PR comment with the review/remediation summary made the review trail visible.

## Improvement / pattern to repeat

For every remaining phase:

1. run `red-team-coordinator` on the phase artifacts before asking the human to review;
2. check PR comments/reviews via `gh`;
3. apply all Critical/High findings and valid automated-review comments;
4. post a PR summary comment of findings and fixes.

## Caution

Red-team output can be large. The bootstrapper should triage findings by:

- must-fix before gate: Critical / High;
- apply now if cheap and quality-improving: Medium;
- defer explicitly if not needed for this phase: Low.
