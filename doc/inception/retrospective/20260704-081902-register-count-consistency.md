---
status: Draft
created: 2026-07-04T08:19:02Z
phase_scope: phase-2
topic: Register count consistency
outcome: improve
---

# Retrospective — Register count consistency

> **ADOS outcome (2026-07-05):** NOT promoted — too narrow/operational (a one-off register-count fix, not a reusable inception behavior). No ticket.

## What happened

While applying Phase 2 red-team findings, the assumption/risk registers changed
substantially. A summary count was briefly wrong after adding new rows.

## What went well

- The inconsistency was caught before the final push.
- The assumption summary was corrected to 19 assumptions:
  - Value 3
  - Usability 3
  - Feasibility 9
  - Viability 4

## Improvement / pattern to repeat

When editing registers with summary totals, always verify counts mechanically
before committing.

Suggested checks:

```bash
rg '^\| A-VAL-' doc/inception/analysis/assumptions.md
rg '^\| A-USA-' doc/inception/analysis/assumptions.md
rg '^\| A-FEA-' doc/inception/analysis/assumptions.md
rg '^\| A-VIA-' doc/inception/analysis/assumptions.md
```

Do the same for risk IDs by prefix.

## Future guardrail

Any generated summary table should be treated as derived data and checked before
push. If a future script exists, automate these counts.
