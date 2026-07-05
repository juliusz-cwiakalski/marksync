---
status: Draft
created: 2026-07-05T14:02:00Z
phase_scope: phase-3
topic: Second-hand decision reviews before acceptance
outcome: repeat
---

# Retrospective — Second-hand decision reviews before acceptance

## What happened

The owner commissioned external second-hand reviews of four Phase 3 decision
records (ADR-0002 Mermaid, ADR-0003/PDR-0001 naming, ADR-0007/TDR-0002 Cliffy,
ADR-0009/TDR-0004 testing runner). These reviews were recorded in
`doc/decisions/tmp/decision-reviews/`.

Each review caught material issues that the original AI-assisted drafting missed:

- **ADR-0002 (Mermaid):** overclaimed "Full compliance" before the spike;
  missing security posture (`securityLevel: strict`, SVG sanitization);
  missing maturity/ecosystem evidence; mmdc should use persistent browser, not
  shell-per-call; Kroki should be split into self-hosted vs public.
- **PDR-0001 (naming):** existing `yh1224/marksync` name collision not found;
  no web-presence decision; confidence should be Medium-High not High.
- **TDR-0002 (Cliffy):** version pin was outdated (rc.7 vs stable 1.2.1);
  yargs/cac evaluations were factually wrong; 6 alternatives missing (oclif,
  Inquirer, Clack, Clerc, Bunli); C-1 "Bun compile proven" was overclaimed.
- **TDR-0004 (testing):** Vitest fallback should be last resort (not default
  for Mermaid-DOM); benchmark claims were stated as FACT but are directional;
  C-1 circularity not transparent; C-3 wording attributed Bun.serve to
  bun:test; missing AI-agent over-mocking warning.

Every reviewed ADR was amended based on its review, and every amendment
materially improved the decision record's accuracy, completeness, and
honesty.

## What went well

- The reviews were focused and specific — each gave concrete recommended
  changes, not vague suggestions.
- The reviews caught factual errors (version numbers, release dates, feature
  claims) that are hard to catch without external research.
- The reviews were treated as input, not as authoritative — the owner
  reviewed each review and decided which findings to accept.
- The review artifacts are preserved in `doc/decisions/tmp/decision-reviews/`
  for audit trail.

## Lesson

**For load-bearing technology selections (R2+ decisions involving framework/
library/tool choices), a second-hand review before acceptance is worth the
effort.** The original AI-assisted draft always has blind spots — outdated
version numbers, missing alternatives, overclaimed compliance, security gaps.
A second pass with fresh context (and ideally external research) catches these
before the decision is merged as current truth.

## Pattern to repeat

1. After drafting a technology-selection decision, commission a second-hand
   review (AI-assisted or human) before requesting owner acceptance.
2. The review should explicitly check: factual claims (versions, dates,
   features), constraint compliance attestation, missing alternatives,
   security posture, and confidence calibration.
3. Record the review in `doc/decisions/tmp/decision-reviews/<ID>-review.md`.
4. Apply accepted findings as amendments to the decision record.
5. Preserve the review artifact for audit trail.

## When to skip

- R0/R1 decisions (too lightweight to warrant a second review).
- Pure architecture decisions with no library/framework selection (these are
  better served by the red-team review).
- Decisions that are straightforward reapplications of existing precedent.
