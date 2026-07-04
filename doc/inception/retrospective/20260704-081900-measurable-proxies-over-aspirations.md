---
status: Draft
created: 2026-07-04T08:19:00Z
phase_scope: phases-1-2
topic: Measurable proxies over aspirational metrics
outcome: repeat
---

# Retrospective — Measurable proxies over aspirations

## What happened

The Phase 1 north star initially defined a strong but hard-to-measure North Star
Metric for a no-telemetry OSS CLI. Red-team review forced the metric into a
measurable proxy:

- publish success rate;
- drift-detection effectiveness;
- conflict false-positive rate.

Phase 2 then refined the proxy again so conflicts/errors remained in the
denominator and the metric could detect the wedge failing.

## What went well

- Review prevented a vanity/aspirational metric from becoming the main planning
  signal.
- The final metrics now map to CLI outputs and release guardrails.
- The same principle improved the roadmap, assumptions, and risks.

## Improvement / pattern to repeat

Every future phase artifact that introduces a metric should answer:

1. Can this be measured without telemetry?
2. What is the denominator?
3. Does the metric include the product's defining failure modes?
4. Is it a target, guardrail, or diagnostic?

## Warning sign

Phrases like "trust", "quality", "coverage", or "adoption" are not actionable
until converted into observable events, thresholds, and guardrails.
