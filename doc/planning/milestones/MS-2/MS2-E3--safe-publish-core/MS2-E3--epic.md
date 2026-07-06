---
id: MS2-E3
title: Safe publish core — the trust wedge
status: todo
milestone: MS-0002
stories: [MS2-E3-S1, MS2-E3-S2, MS2-E3-S3, MS2-E3-S4, MS2-E3-S5, MS2-E3-S6, MS2-E3-S7]
feature_spec: [doc/spec/features/feature-safe-publish.md, doc/spec/features/feature-confluence-adapter.md]
dependencies: [MS2-E2-S1, MS2-E2-S2, MS2-E2-S3, MS2-E2-S4]
---

# Epic MS2-E3 — Safe publish core (the trust wedge)

## Goal
Deliver the complete safe-publish pipeline: Markdown → Storage Format → Confluence,
with document identity, drift detection, conflict classification, and concurrency
control that refuses to silently overwrite remote work.

## Scope
- MS2-E3-S1: Document identity (UUID v7, front-matter, duplicate-fatal)
- MS2-E3-S2: State manager (committed lock, disposable cache)
- MS2-E3-S3: Markdown pipeline (remark/HAST → Storage Format)
- MS2-E3-S4: Confluence adapter (TargetSystem port, v2/v1)
- MS2-E3-S5: Drift classifier (5-state, canonical hashing)
- MS2-E3-S6: Sync engine (plan → apply, journal, provenance)
- MS2-E3-S7: Concurrency control (409 + dedup + stale-plan)

## Success criteria
- INV-SAFE-1: remotely-deleted managed page never silently re-created
- INV-SAFE-2: duplicate UUID fatal before any write
- INV-SAFE-3: overlapping CI plans — older must not overwrite newer
- INV-SEC-1: no credential in any output
- Semantic idempotency: second unchanged push writes 0
- Drift: 5 states correctly detected; false-positive < 5%

## Cross-cutting
- R-FEA-3 (state model), R-FEA-7 (concurrency), R-FEA-8 (false conflict), R-FEA-9 (corpus)
