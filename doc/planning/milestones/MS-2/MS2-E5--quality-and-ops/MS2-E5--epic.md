---
id: MS2-E5
title: Quality & ops — test wiring, doctor, corpus, binary builds
status: todo
milestone: MS-0002
stories: [MS2-E5-S1, MS2-E5-S2, MS2-E5-S3, MS2-E5-S4]
feature_spec: [doc/spec/features/feature-cli.md]
dependencies: [MS2-E2-S1, MS2-E3-S6]
---

# Epic MS2-E5 — Quality & ops

## Goal
Wire quality gates, health diagnostics, adversarial test corpus, and
cross-platform binary builds.

## Scope
- MS2-E5-S1: Quality gate wiring (6 tiers: unit/integration/golden/BDD/E2E)
- MS2-E5-S2: Doctor health-check
- MS2-E5-S3: Adversarial public corpus (sanitized design-partner pages)
- MS2-E5-S4: Cross-platform binary builds (Linux + Windows; gated by E1-S3)

## Success criteria
- All 6 test tiers wired and passing
- Doctor verifies auth, API, permissions, config
- Corpus covers macros/nested tables/app content
- Binary ≤ 90 MB; cold-start ≤ 2 s

## Cross-cutting
- R-FEA-5 (false confidence), R-FEA-9 (corpus), A-FEA-2 (binary), A-FEA-10 (bounds)
