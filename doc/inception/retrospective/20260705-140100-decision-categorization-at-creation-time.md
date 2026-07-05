---
status: Draft
created: 2026-07-05T14:01:00Z
phase_scope: phase-3
topic: Decision categorization at creation time (ADR vs TDR vs PDR)
outcome: improve
---

# Retrospective — Decision categorization at creation time

## What happened

All 11 Phase 3 decision records were originally numbered in a single
sequence (ADR-0001…ADR-0011) regardless of their `decision_type`. This was
because the original ADOS guide did not enforce per-type sequences. When the
guide was updated to require each type (ADR, PDR, TDR, BDR, ODR) to have its
own sequence, 5 of 11 records needed reclassification + renumbering:

- ADR-0003 → PDR-0001 (product naming)
- ADR-0004 → TDR-0001 (API validation spike)
- ADR-0007 → TDR-0002 (CLI framework)
- ADR-0008 → TDR-0003 (Git adapter)
- ADR-0009 → TDR-0004 (testing runner)

The reclassification required renaming 5 files, updating frontmatter
(`id:` + `decision_type:`), and bulk-replacing ~113 cross-references across
~40 files. This was a high-risk, high-effort operation that the owner
specifically flagged as needing careful script-based execution.

## What went well

- The `@decision-advisor` produced a thorough per-record assessment with
  clear reasoning per the updated guide's ADR-vs-TDR rule of thumb.
- The reclassification was done while all records were still `status: Proposed`
  — the cheapest window (no Accepted immutability, no external citations).
- The bulk-replace script + grep verification caught all ID references.
- The conservative approach (leave gaps in the ADR sequence rather than
  compacting) kept the operation bounded.

## What went wrong

- The records were not classified correctly at creation time. The
  `decision_type` frontmatter was set (e.g., `pdr` for ADR-0003), but the
  file prefix and ID were all `ADR-`, creating a live inconsistency.
- The migration notes claimed "numbered in one sequence regardless of
  `decision_type`," which became false after the guide update and was not
  caught until the red-team's second round.

## Lesson

**Classify decisions correctly (ADR/TDR/PDR/BDR/ODR) at creation time using
the current ADOS guide.** The ADR-vs-TDR tie-breaker is:

- *Will this constrain future system design across components/teams?* → **ADR**
- *Is this mainly how we implement within an already-decided design?* → **TDR**
- *Is this about product positioning, feature scoping, or UX strategy?* → **PDR**
- Tie-breaker: prefer **ADR** when `reversibility: hard` OR `blast_radius ≥ team`.

When the guide is updated, reclassify only if the benefit outweighs the
propagation cost. In this case, doing it while all records were `Proposed`
was the right call — but it would have been cheaper to classify correctly
from the start.

## Future guardrail

Before creating a decision record:

1. Check the current ADOS guide for type definitions and the ADR-vs-TDR rule.
2. Pick the type (ADR/TDR/PDR/BDR/ODR) and use the correct prefix in the
   filename, `id:` frontmatter, and `decision_type:` field — all three must
   match.
3. Use the next available number **within that type's sequence**, not a
   global sequence.
