---
status: Draft
created: 2026-07-05T14:00:00Z
phase_scope: phase-3
topic: Decision reversal and cross-cutting propagation
outcome: improve
---

# Retrospective — Decision reversal and cross-cutting propagation

## What happened

Phase 3 produced the first decision reversal in the project: ADR-0010 was
originally "commit-by-commit by default, squash opt-in." After the red-team
flagged write-amplification, privacy, and scope concerns, the owner reversed
it to "squash by default for `MS-0002`, commit-by-commit deferred."

The reversal itself was clean — ADR-0010 was rewritten with a Revision History
table preserving the original decision and rationale. The OPEN-Q6 answer was
annotated (not erased) with an "Amended 2026-07-05" section.

**However**, propagating the reversal to every artifact that referenced the
old decision was incomplete. Two rounds of red-team review were needed to
catch all stale references:

- Round 1 caught the strategic issues → owner reversed the decision.
- Round 2 found that ADR-0006 line 244, `inception-state.yaml`, and
  `phase-3-open-questions.md` OPEN-Q6 still described commit-by-commit as the
  default — the most dangerous stale claims because they are high-traffic
  entry points for an implementer.

The same pattern occurred with two other cross-cutting changes in Phase 3:
- **Decision reclassification** (ADR→PDR/TDR renumbering): `inception-state.yaml`
  still referenced old IDs after the renumber script ran.
- **REMOTE_DELETED→REMOTE_MISSING** terminology change: 7 files still used the
  old term after the architecture overview was updated.

## What went well

- The reversal was documented honestly (revision history, not silent rewrite).
- The OPEN-Q6 answer was annotated, not erased — preserving the audit trail.
- The red-team's second round caught every remaining stale reference.
- Bulk-replace scripts + grep verification were used for the reclassification,
  which caught most references (~113 of ~120).

## What went wrong

- Manual edits to individual files missed ~20% of cross-references.
- The bulk-replace script caught ID references but missed files that were
  not markdown (e.g., `inception-state.yaml`).
- No "propagation checklist" existed — each cross-cutting change was
  propagated ad hoc, and some files were forgotten.

## Lesson

**When making a cross-cutting change (decision reversal, reclassification,
terminology unification), use a systematic propagation process:**

1. **Create a propagation list** — grep the old term/ID across ALL files
   (not just `.md` — include `.yaml`, `.json`, `.yml`, frontmatter).
2. **Bulk-replace** with a script.
3. **Grep-verify** that zero stale references remain.
4. **Check high-traffic entry points specifically**: `inception-state.yaml`,
   decision index, open-questions files, architecture overview, NFR register.
5. **Only then** request review.

This would have eliminated the need for a second red-team round.

## Future guardrail

Before requesting red-team or human review after a cross-cutting change,
run:

```bash
# For decision ID changes
rg '<old-id>' --type-add 'doc:*.{md,yaml,yml,json}' -tdoc

# For terminology changes
rg '<old-term>' --type-add 'doc:*.{md,yaml,yml,json}' -tdoc
```

If any results remain, fix them before requesting review.
