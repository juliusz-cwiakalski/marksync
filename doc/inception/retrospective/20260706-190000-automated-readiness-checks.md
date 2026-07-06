---
status: Accepted
created: 2026-07-06T19:00:00
phase_scope: 6
topic: Automated readiness checks catch what manual review misses
outcome: repeat
---

# Retrospective: Automated readiness verification

## What happened

Phase 6 ran six automated checks (artifact existence, ghost references,
cross-document consistency, FSE coverage, four-risk coverage, assumption
tagging) instead of relying on manual spot-checks. The automated approach:

- **Artifact catalog:** Python script parsed `inception-state.yaml` and verified
  every registered artifact path exists — 41 passes, 0 misses.
- **Ghost references:** Script scanned 243 markdown links across all
  project-authored files — found 1 broken link (in a stale input draft, not a
  project artifact).
- **Decision record statuses:** Automated `grep` found all 15 records marked
  `Proposed` despite merged PRs — a systematic error that manual review had
  missed across 5 phases.

## What went well

- **The decision-status fix would not have been caught manually.** The
  inception-state said "All remain status: Proposed pending human confirmation"
  and every record individually said `Proposed`. Without an automated check
  against the corrected lifecycle, these would have stayed wrong into Phase 7
  and MS-0002 delivery.
- **The ghost-reference scan was comprehensive.** 243 links across 10 glob
  patterns in under a second — a human would not check this many links manually.
- **The four-risk / assumption summary was instant.** Counting risk types and
  validation statuses programmatically is more reliable than skimming a table.

## Improvement / pattern to repeat

**Codify the Phase 6 readiness checks as a script.** The current checks are
inline Python in a conversation — they should become a reusable
`scripts/check-inception-readiness.sh` (or similar) that:

1. Reads `inception-state.yaml` and verifies all artifact paths.
2. Scans all project-authored markdown for broken links.
3. Checks decision-record statuses against the corrected lifecycle.
4. Summarizes four-risk and assumption coverage.

This would make Phase 6 faster, more reliable, and portable to other ADOS
projects. **Filed as a propose-ados-framework-improvement candidate.**

## Caution

The automated checks verify **structure** (files exist, links resolve, tags
present) but not **semantic quality** (is the architecture right? is the risk
register complete?). Phase 6 still needs human judgment for the latter — the
readiness report's "no earlier phase reopened" verdict is a human call, not an
automated one.
